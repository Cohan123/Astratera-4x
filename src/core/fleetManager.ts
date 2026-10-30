/**
 * Astraea 4X - Fleet Manager (Phase 4)
 * Handles orbital ship construction in colonial shipyards and the movement of
 * fleets along hyperlanes. Ship orders consume minerals and rare resources up
 * front, then accumulate half of the colony's production per turn because the
 * shipyard shares industrial capacity with the regular build queue. A colony
 * runs one dock per 2.000 colonists (up to four), so several orders can be
 * worked in parallel while orders beyond the dock count wait in the queue.
 * Finished ships are merged into a stationed fleet in the colony's system.
 * Fleets travel one hyperlane hop per turn and remain stationed after arrival.
 *
 * Combat runs at the end of the fleet turn: every system that holds combat
 * ready fleets of at least two civilizations resolves pairwise battles until at
 * most one civilization keeps ships there. Only civilizations that are at war
 * fight each other; a supplied diplomacy lookup gates hostility, while a null
 * lookup treats every foreign civilization as hostile. Damage is simultaneous
 * and always hits the weakest hull first, so cheap hulls screen heavier ships.
 */

import { BUILDABLE_SHIP_IDS, getShipDef } from '../data/shipCatalog.ts';
import { COLONIZATION_SUPPLY } from './colonizationRules.ts';
import { EventBus } from './EventBus.ts';
import { normalizeRangeHops, turnsForHops } from './propulsion.ts';
import {
  Colony,
  Fleet,
  FleetBattleReport,
  FleetBattleSide,
  FleetShipStack,
  Galaxy,
  ShipBuildOrder,
} from './types.ts';

export const SHIPYARD_REQUIRED_TIER: Colony['developmentTier'] = 'colony';
export const SHIPYARD_PRODUCTION_SHARE = 0.5;
/** Zusätzliche Bevölkerung je weiterem Werftdock. */
export const SHIPYARD_POPULATION_PER_SLIP = 2000;
/** Obergrenze parallel arbeitender Docks pro Kolonie. */
export const SHIPYARD_MAX_SLIPS = 4;

/**
 * Anzahl parallel arbeitender Werftdocks einer Kolonie. Jede volle Kolonie
 * besitzt ein Dock; je 2.000 zusätzliche Kolonisten kommt ein weiteres hinzu.
 * Siedlungen und Außenposten haben keine Werft und damit keine Docks.
 */
export function getShipyardCapacity(colony: Colony | null): number {
  if (!colony || colony.status !== 'active' || colony.developmentTier !== SHIPYARD_REQUIRED_TIER) {
    return 0;
  }
  const extraSlips = Math.floor(Math.max(0, colony.population - 1000) / SHIPYARD_POPULATION_PER_SLIP);
  return Math.min(SHIPYARD_MAX_SLIPS, 1 + extraSlips);
}
/** Maximale Rundenzahl einer Schlacht, danach gilt sie als Patt. */
export const MAX_COMBAT_ROUNDS = 30;
/** So viele Kampfberichte behält der Flottenmanager im Speicher. */
export const BATTLE_REPORT_LIMIT = 20;

/**
 * Minimale Sicht des Flottenmanagers auf die Diplomatie. Der Flottenmanager
 * kennt nur diese Abfrage, damit er nicht vom Diplomatie-Manager abhängt.
 */
export interface WarRelationLookup {
  isAtWar(civAId: string, civBId: string): boolean;
}

interface CombatShip {
  fleetId: string;
  shipDefId: string;
  hull: number;
  attack: number;
  defense: number;
  hp: number;
}

export interface ShipBuildResult {
  allowed: boolean;
  reason?: string;
  order?: ShipBuildOrder;
}

export interface FleetMoveResult {
  allowed: boolean;
  reason?: string;
  fleet?: Fleet;
  pathSystemIds?: string[];
}

/**
 * Ankunftsprognose eines Verbands. Gezählt werden die verbleibenden
 * Hyperlane-Sprünge, geteilt durch die Sprünge pro Runde und aufgerundet –
 * dieselbe Rechnung wie die ETA-Logik in Master of Orion 2 („n turns to
 * star“). Es werden keine Beschleunigungs- oder Treibstoffwerte erfunden.
 */
export interface FleetEta {
  /** Verbleibende Runden bis zur Ankunft; 0 heißt bereits angekommen. */
  turnsRemaining: number;
  /** Verbleibende Hyperlane-Sprünge bis zum Endziel. */
  hopsRemaining: number;
  /** Sprünge pro Runde, mit denen gerechnet wurde. */
  hopsPerTurn: number;
  /** Nächstes System auf der Route (null bei stationierten Verbänden). */
  nextSystemId: string | null;
  /** Endziel der Route oder das aktuelle System. */
  arrivalSystemId: string | null;
}

export interface FleetTurnSummary {
  completedShipOrders: number;
  arrivedFleetIds: string[];
  /** Verbände, die in dieser Runde mindestens einen Sprung gemacht haben. */
  movedFleetIds: string[];
  /** Insgesamt in dieser Runde zurückgelegte Hyperlane-Sprünge. */
  hopsTraveled: number;
}

export interface AiFleetTurnSummary {
  queuedShipOrders: number;
  movedFleetIds: string[];
}

/** Musterpriorität der KI-Werften: günstige Hüllen zuerst. */
export const AI_SHIP_PRIORITY = ['corvette', 'destroyer', 'cruiser'] as const;

function cloneShipStack(stack: FleetShipStack): FleetShipStack {
  return { ...stack };
}

function cloneFleet(fleet: Fleet): Fleet {
  return {
    ...fleet,
    ships: fleet.ships.map(cloneShipStack),
    pathSystemIds: [...fleet.pathSystemIds],
    cargo: fleet.cargo ? { ...fleet.cargo } : undefined,
  };
}

function cloneOrder(order: ShipBuildOrder): ShipBuildOrder {
  return { ...order };
}

function compareIds(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export class FleetManager {
  private fleets: Map<string, Fleet> = new Map();
  private orders: ShipBuildOrder[] = [];
  /**
   * Verbände, die in der laufenden Runde bereits gezogen wurden. Ein Auftrag
   * kann die Bewegung sofort ausführen; der Rundenwechsel darf denselben
   * Verband dann nicht ein zweites Mal bewegen (eine Bewegung pro Runde).
   * Der Satz ist bewusst flüchtig und wird nach dem Rundenwechsel geleert.
   */
  private movedThisTurn: Set<string> = new Set();
  private battleReports: FleetBattleReport[] = [];
  private battleSequence = 0;
  private eventBus: EventBus;
  private galaxyProvider: () => Galaxy;

  constructor(eventBus: EventBus, galaxyProvider: () => Galaxy) {
    this.eventBus = eventBus;
    this.galaxyProvider = galaxyProvider;
  }

  /* ---------------------------------------------------------------------- */
  /* Inventory                                                              */
  /* ---------------------------------------------------------------------- */

  public getFleets(): Fleet[] {
    return Array.from(this.fleets.values());
  }

  public getFleet(fleetId: string): Fleet | null {
    return this.fleets.get(fleetId) ?? null;
  }

  public getFleetsForCiv(civId: string): Fleet[] {
    return this.getFleets().filter((fleet) => fleet.civId === civId);
  }

  public getFleetsInSystem(systemId: string): Fleet[] {
    return this.getFleets().filter((fleet) => fleet.systemId === systemId);
  }

  public getOrders(): ShipBuildOrder[] {
    return this.orders.map(cloneOrder);
  }

  public getOrdersForColony(colonyId: string): ShipBuildOrder[] {
    return this.orders.filter((order) => order.colonyId === colonyId).map(cloneOrder);
  }

  /** Combined hull, attack and defense values of all ships in a fleet. */
  public getFleetStrength(fleet: Fleet): { hull: number; attack: number; defense: number } {
    const totals = { hull: 0, attack: 0, defense: 0 };
    for (const stack of fleet.ships) {
      const def = getShipDef(stack.shipDefId);
      if (!def) continue;
      totals.hull += def.hull * stack.count;
      totals.attack += def.attack * stack.count;
      totals.defense += def.defense * stack.count;
    }
    return totals;
  }

  /** Energie-Unterhalt einer einzelnen Flotte pro Runde. */
  public static calculateFleetUpkeep(fleet: Fleet): number {
    let total = 0;
    for (const stack of fleet.ships) {
      const def = getShipDef(stack.shipDefId);
      if (!def) continue;
      total += def.energyUpkeep * stack.count;
    }
    return total;
  }

  /** Gesamter Flottenunterhalt einer Zivilisation pro Runde. */
  public getUpkeepForCiv(civId: string): number {
    let total = 0;
    for (const fleet of this.fleets.values()) {
      if (fleet.civId === civId) total += FleetManager.calculateFleetUpkeep(fleet);
    }
    return total;
  }

  /**
   * Verteilt den Flottenunterhalt jeder Zivilisation gleichmäßig auf ihre
   * aktiven Kolonien. Restpunkte gehen deterministisch an die nach ID
   * sortierten Kolonien, damit die Reihenfolge der Übergabe keine Rolle spielt.
   */
  public calculateUpkeepByColony(colonies: Colony[]): Map<string, number> {
    const upkeepByCiv = new Map<string, number>();
    for (const fleet of this.fleets.values()) {
      const upkeep = FleetManager.calculateFleetUpkeep(fleet);
      if (upkeep <= 0) continue;
      upkeepByCiv.set(fleet.civId, (upkeepByCiv.get(fleet.civId) ?? 0) + upkeep);
    }

    const result = new Map<string, number>();
    for (const [civId, total] of upkeepByCiv) {
      const own = colonies
        .filter((colony) => colony.civId === civId && colony.status === 'active')
        .sort((a, b) => compareIds(a.id, b.id));
      if (own.length === 0) continue;

      const base = Math.floor(total / own.length);
      let remainder = total % own.length;
      for (const colony of own) {
        const share = base + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder -= 1;
        if (share > 0) result.set(colony.id, share);
      }
    }
    return result;
  }

  /* ---------------------------------------------------------------------- */
  /* Persistence                                                            */
  /* ---------------------------------------------------------------------- */

  public loadFleets(fleets: Fleet[]): void {
    this.fleets.clear();
    for (const fleet of fleets) {
      const cloned = cloneFleet(fleet);
      this.fleets.set(cloned.id, cloned);
    }
  }

  /**
   * Fügt einen fertigen Verband hinzu (Startaufstellung, Ereignisse, Tests).
   * Vorhandene IDs werden überschrieben, damit ein erneutes Platzieren keinen
   * doppelten Verband erzeugt.
   */
  public addFleet(fleet: Fleet): Fleet {
    const cloned = cloneFleet(fleet);
    this.fleets.set(cloned.id, cloned);
    this.eventBus.emit('fleet:created', { fleet: cloneFleet(cloned) });
    return cloned;
  }

  /** Entfernt ein einzelnes Schiffsmuster aus einem Verband. */
  public removeShipFromFleet(fleetId: string, shipDefId: string, count = 1): boolean {
    const fleet = this.fleets.get(fleetId);
    if (!fleet) return false;
    const stack = fleet.ships.find((entry) => entry.shipDefId === shipDefId);
    if (!stack) return false;
    stack.count = Math.max(0, stack.count - count);
    fleet.ships = fleet.ships.filter((entry) => entry.count > 0);
    if (fleet.ships.length === 0) {
      this.removeFleet(fleet.id);
    }
    return true;
  }

  public loadOrders(orders: ShipBuildOrder[]): void {
    this.orders = orders.map(cloneOrder);
  }

  public getBattleReports(): FleetBattleReport[] {
    return this.battleReports.map((report) => ({
      ...report,
      sides: report.sides.map((side) => ({
        ...side,
        fleetIds: [...side.fleetIds],
        losses: side.losses.map((loss) => ({ ...loss })),
      })),
    }));
  }

  public clear(): void {
    this.fleets.clear();
    this.orders = [];
    this.battleReports = [];
    this.battleSequence = 0;
  }

  /* ---------------------------------------------------------------------- */
  /* Pathfinding                                                            */
  /* ---------------------------------------------------------------------- */

  public findPath(sourceSystemId: string, targetSystemId: string): string[] | null {
    if (!sourceSystemId || !targetSystemId) return null;
    if (sourceSystemId === targetSystemId) return [sourceSystemId];

    const galaxy = this.galaxyProvider();
    const systemsById = new Map(galaxy.systems.map((system) => [system.id, system]));
    if (!systemsById.has(sourceSystemId) || !systemsById.has(targetSystemId)) return null;

    const adjacency = new Map<string, Set<string>>();
    for (const system of galaxy.systems) {
      adjacency.set(system.id, new Set());
    }
    for (const system of galaxy.systems) {
      for (const neighbourId of system.hyperlanes) {
        const neighbour = adjacency.get(neighbourId);
        if (!neighbour) continue;
        adjacency.get(system.id)?.add(neighbourId);
        neighbour.add(system.id);
      }
    }

    const queue: string[] = [sourceSystemId];
    const visited = new Set<string>([sourceSystemId]);
    const previous = new Map<string, string>();
    let head = 0;

    while (head < queue.length) {
      const current = queue[head];
      head += 1;
      if (current === targetSystemId) break;

      const neighbours = Array.from(adjacency.get(current) ?? []).sort(compareIds);
      for (const neighbour of neighbours) {
        if (visited.has(neighbour)) continue;
        visited.add(neighbour);
        previous.set(neighbour, current);
        queue.push(neighbour);
      }
    }

    if (!visited.has(targetSystemId)) return null;

    const path = [targetSystemId];
    let cursor = targetSystemId;
    while (cursor !== sourceSystemId) {
      const parent = previous.get(cursor);
      if (!parent) return null;
      path.push(parent);
      cursor = parent;
    }
    path.reverse();
    return path;
  }

  /* ---------------------------------------------------------------------- */
  /* Ship construction                                                      */
  /* ---------------------------------------------------------------------- */

  public canBuildShip(
    colony: Colony | null,
    shipDefId: string,
    completedTechIds: ReadonlySet<string> | string[],
  ): { allowed: boolean; reason?: string } {
    const def = getShipDef(shipDefId);
    if (!def || !BUILDABLE_SHIP_IDS.has(shipDefId)) {
      return { allowed: false, reason: 'Unbekanntes Schiffsmuster.' };
    }
    if (!colony || colony.status !== 'active') {
      return { allowed: false, reason: 'Die Kolonie ist nicht aktiv.' };
    }
    if (colony.developmentTier !== SHIPYARD_REQUIRED_TIER) {
      return {
        allowed: false,
        reason: 'Kolonie muss den Status "Kolonie" besitzen (Werft erforderlich).',
      };
    }
    const techIds = completedTechIds instanceof Set ? completedTechIds : new Set(completedTechIds);
    if (!techIds.has(def.requiredTechId)) {
      return {
        allowed: false,
        reason: `Erforderliche Technologie nicht erforscht: ${def.requiredTechId}.`,
      };
    }
    if (colony.stockpile.minerals < def.mineralCost) {
      return { allowed: false, reason: 'Nicht genügend Mineralien im Lager.' };
    }
    if (colony.stockpile.rareResources < def.rareCost) {
      return { allowed: false, reason: 'Nicht genügend seltene Ressourcen im Lager.' };
    }
    return { allowed: true };
  }

  public queueShipBuild(
    colony: Colony,
    shipDefId: string,
    completedTechIds: ReadonlySet<string> | string[],
    turn: number,
  ): ShipBuildResult {
    const gate = this.canBuildShip(colony, shipDefId, completedTechIds);
    if (!gate.allowed) {
      return { allowed: false, reason: gate.reason };
    }
    const def = getShipDef(shipDefId);
    if (!def) {
      return { allowed: false, reason: 'Unbekanntes Schiffsmuster.' };
    }

    colony.stockpile.minerals -= def.mineralCost;
    colony.stockpile.rareResources -= def.rareCost;

    const order: ShipBuildOrder = {
      id: this.nextOrderId(colony.id, shipDefId),
      colonyId: colony.id,
      civId: colony.civId,
      shipDefId,
      investedProduction: 0,
      requiredProduction: def.productionCost,
      turnStarted: turn,
    };
    this.orders.push(order);
    return { allowed: true, order: cloneOrder(order) };
  }

  public cancelShipBuild(orderId: string): boolean {
    const index = this.orders.findIndex((order) => order.id === orderId);
    if (index < 0) return false;
    this.orders.splice(index, 1);
    return true;
  }

  private nextOrderId(colonyId: string, shipDefId: string): string {
    let sequence = this.orders.length + 1;
    let candidate = `ship_order_${colonyId}_${shipDefId}_${sequence}`;
    while (this.orders.some((order) => order.id === candidate)) {
      sequence += 1;
      candidate = `ship_order_${colonyId}_${shipDefId}_${sequence}`;
    }
    return candidate;
  }

  /** Returns the stationary fleet of a civilization in a system, creating it if needed. */
  public ensureFleetAt(civId: string, systemId: string): Fleet {
    const existing = this.getFleets().find(
      (fleet) => fleet.civId === civId && fleet.systemId === systemId && fleet.status === 'stationed',
    );
    if (existing) return existing;

    const galaxy = this.galaxyProvider();
    const system = galaxy.systems.find((entry) => entry.id === systemId);
    const fleet: Fleet = {
      id: this.nextFleetId(civId, systemId),
      name: system ? `Flotte ${system.name}` : `Flotte ${systemId}`,
      civId,
      systemId,
      ships: [],
      status: 'stationed',
      pathSystemIds: [],
      pathIndex: 0,
      destinationSystemId: null,
    };
    this.fleets.set(fleet.id, fleet);
    this.eventBus.emit('fleet:created', { fleet: cloneFleet(fleet) });
    return fleet;
  }

  private nextFleetId(civId: string, systemId: string): string {
    let sequence = this.fleets.size + 1;
    let candidate = `fleet_${civId}_${systemId}_${sequence}`;
    while (this.fleets.has(candidate)) {
      sequence += 1;
      candidate = `fleet_${civId}_${systemId}_${sequence}`;
    }
    return candidate;
  }

  private addShipsToFleet(fleet: Fleet, shipDefId: string, count: number): void {
    const stack = fleet.ships.find((entry) => entry.shipDefId === shipDefId);
    if (stack) {
      stack.count += count;
    } else {
      fleet.ships.push({ shipDefId, count });
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Fleet movement                                                         */
  /* ---------------------------------------------------------------------- */

  /**
   * Verkettet Hyperlane-Pfade über Zwischenziele. Ein Zwischenziel ist ein
   * System, das die Flotte durchfliegt, ohne dort anzuhalten – das Gegenstück
   * zum "intermediate star" aus Master of Orion 2. Der zurückgegebene Pfad
   * startet im aktuellen System und endet im Endziel; ein Fehlschlag nennt
   * den Abschnitt, der die Route bricht.
   */
  public planRoute(
    sourceSystemId: string,
    destinationSystemId: string,
    waypointSystemIds: readonly string[] = [],
  ): { path: string[] | null; reason?: string } {
    const galaxy = this.galaxyProvider();
    const knownSystemIds = new Set(galaxy.systems.map((system) => system.id));
    if (!knownSystemIds.has(sourceSystemId)) {
      return { path: null, reason: 'Startsystem nicht gefunden.' };
    }
    if (!knownSystemIds.has(destinationSystemId)) {
      return { path: null, reason: 'Zielsystem nicht gefunden.' };
    }

    // Zwischenziele in Flugreihenfolge, ohne Doppelungen und ohne das
    // Endziel ein zweites Mal anzuhängen.
    const stops: string[] = [sourceSystemId];
    for (const waypointId of waypointSystemIds) {
      if (!waypointId) continue;
      if (!knownSystemIds.has(waypointId)) {
        return { path: null, reason: `Zwischenziel nicht gefunden: ${waypointId}.` };
      }
      if (stops[stops.length - 1] === waypointId) continue;
      stops.push(waypointId);
    }
    if (stops[stops.length - 1] !== destinationSystemId) {
      stops.push(destinationSystemId);
    }

    let path: string[] = [];
    for (let index = 0; index < stops.length - 1; index += 1) {
      const legStart = stops[index];
      const legEnd = stops[index + 1];
      if (legStart === legEnd) continue;
      const leg = this.findPath(legStart, legEnd);
      if (!leg || leg.length < 2) {
        const isWaypointLeg = index < stops.length - 2;
        return {
          path: null,
          reason: isWaypointLeg
            ? `Zwischenziel ${legEnd} ist über Hyperlanes nicht erreichbar.`
            : 'Zwischen den Systemen existiert keine Hyperlane-Verbindung.',
        };
      }
      path = path.length === 0 ? [...leg] : path.concat(leg.slice(1));
    }

    if (path.length < 2) {
      return {
        path: null,
        reason: 'Zwischen den Systemen existiert keine Hyperlane-Verbindung.',
      };
    }
    return { path };
  }

  /**
   * Erteilt einem stationierten Verband einen Bewegungsauftrag. Optionale
   * Zwischenziele werden durchflogen, ohne den Auftrag zu unterbrechen.
   */
  public commandMoveFleet(
    fleetId: string,
    destinationSystemId: string,
    waypointSystemIds: readonly string[] = [],
  ): FleetMoveResult {
    const fleet = this.fleets.get(fleetId);
    if (!fleet) {
      return { allowed: false, reason: 'Flotte nicht gefunden.' };
    }
    if (fleet.status === 'moving') {
      return { allowed: false, reason: 'Flotte befindet sich bereits im Flug.' };
    }
    if (fleet.systemId === destinationSystemId) {
      return { allowed: false, reason: 'Flotte befindet sich bereits im Zielsystem.' };
    }

    const plan = this.planRoute(fleet.systemId, destinationSystemId, waypointSystemIds);
    if (!plan.path) {
      return { allowed: false, reason: plan.reason };
    }
    const path = plan.path;

    fleet.status = 'moving';
    fleet.pathSystemIds = [...path];
    fleet.pathIndex = 0;
    fleet.destinationSystemId = destinationSystemId;

    this.eventBus.emit('fleet:movement-started', {
      fleetId: fleet.id,
      destinationSystemId,
      pathSystemIds: [...path],
    });
    return { allowed: true, fleet: cloneFleet(fleet), pathSystemIds: [...path] };
  }

  /**
   * Ändert das Ziel einer bereits fliegenden Flotte. Die Route wird ab dem
   * aktuellen System neu berechnet; die Flotte beginnt den neuen Abschnitt in
   * der laufenden Runde. Stationierte Flotten erhalten einen normalen
   * Bewegungsauftrag.
   */
  public retargetFleet(
    fleetId: string,
    destinationSystemId: string,
    waypointSystemIds: readonly string[] = [],
  ): FleetMoveResult {
    const fleet = this.fleets.get(fleetId);
    if (!fleet) {
      return { allowed: false, reason: 'Flotte nicht gefunden.' };
    }
    if (fleet.systemId === destinationSystemId && fleet.status !== 'moving') {
      return { allowed: false, reason: 'Flotte befindet sich bereits im Zielsystem.' };
    }

    const plan = this.planRoute(fleet.systemId, destinationSystemId, waypointSystemIds);
    if (!plan.path) {
      return {
        allowed: false,
        reason:
          fleet.status === 'moving' && plan.reason === 'Zwischen den Systemen existiert keine Hyperlane-Verbindung.'
            ? 'Das neue Ziel ist vom aktuellen System aus nicht über Hyperlanes erreichbar.'
            : plan.reason,
      };
    }
    const path = plan.path;

    fleet.status = 'moving';
    fleet.pathSystemIds = [...path];
    fleet.pathIndex = 0;
    fleet.destinationSystemId = destinationSystemId;

    this.eventBus.emit('fleet:movement-started', {
      fleetId: fleet.id,
      destinationSystemId,
      pathSystemIds: [...path],
    });
    return { allowed: true, fleet: cloneFleet(fleet), pathSystemIds: [...path] };
  }

  /** Bricht einen Bewegungsauftrag ab; die Flotte bleibt im aktuellen System. */
  public cancelFleetMovement(fleetId: string): boolean {
    const fleet = this.fleets.get(fleetId);
    if (!fleet || fleet.status !== 'moving') return false;
    fleet.status = 'stationed';
    fleet.pathSystemIds = [];
    fleet.pathIndex = 0;
    fleet.destinationSystemId = null;
    this.eventBus.emit('fleet:movement-cancelled', { fleetId });
    return true;
  }

  /** Route einer Flotte zu einem Ziel, ohne einen Auftrag zu erteilen. */
  public previewRoute(
    fleetId: string,
    destinationSystemId: string,
    waypointSystemIds: readonly string[] = [],
  ): string[] | null {
    const fleet = this.fleets.get(fleetId);
    if (!fleet) return null;
    return this.planRoute(fleet.systemId, destinationSystemId, waypointSystemIds).path;
  }

  /** Prüft, ob ein Ziel für eine Flotte überhaupt gültig wäre (ohne Auftrag). */
  public canReachSystem(
    fleetId: string,
    destinationSystemId: string,
    waypointSystemIds: readonly string[] = [],
  ): FleetMoveResult {
    const fleet = this.fleets.get(fleetId);
    if (!fleet) {
      return { allowed: false, reason: 'Flotte nicht gefunden.' };
    }
    if (fleet.systemId === destinationSystemId && fleet.status !== 'moving') {
      return { allowed: false, reason: 'Flotte befindet sich bereits im Zielsystem.' };
    }
    const plan = this.planRoute(fleet.systemId, destinationSystemId, waypointSystemIds);
    if (!plan.path) {
      return { allowed: false, reason: plan.reason };
    }
    return { allowed: true, pathSystemIds: [...plan.path] };
  }

  /* ---------------------------------------------------------------------- */
  /* Ankunftsprognose (ETA)                                                 */
  /* ---------------------------------------------------------------------- */

  /** Verbleibende Hyperlane-Sprünge der aktuellen Route. */
  public getRemainingHops(fleet: Fleet): number {
    if (fleet.status !== 'moving') return 0;
    const totalHops = Math.max(0, fleet.pathSystemIds.length - 1);
    const doneHops = Math.max(0, Math.min(totalHops, fleet.pathIndex));
    return totalHops - doneHops;
  }

  /**
   * Ankunftsprognose der laufenden Route: verbleibende Sprünge, Sprünge pro
   * Runde und daraus die Rundenzahl. Stationierte Verbände liefern 0 Runden
   * auf ihr aktuelles System.
   */
  public getFleetEta(fleetId: string, rangeHops?: number): FleetEta | null {
    const fleet = this.fleets.get(fleetId);
    if (!fleet) return null;
    const hopsPerTurn = normalizeRangeHops(rangeHops);
    if (fleet.status !== 'moving') {
      return {
        turnsRemaining: 0,
        hopsRemaining: 0,
        hopsPerTurn,
        nextSystemId: null,
        arrivalSystemId: fleet.systemId,
      };
    }
    const hopsRemaining = this.getRemainingHops(fleet);
    const nextIndex = Math.min(fleet.pathIndex + 1, fleet.pathSystemIds.length - 1);
    return {
      turnsRemaining: turnsForHops(hopsRemaining, hopsPerTurn),
      hopsRemaining,
      hopsPerTurn,
      nextSystemId: fleet.pathSystemIds[nextIndex] ?? null,
      arrivalSystemId: fleet.destinationSystemId,
    };
  }

  /**
   * Prognose für ein noch nicht erteiltes Ziel, gerechnet ab dem aktuellen
   * System. Gibt es keine Route, ist das Ergebnis null.
   */
  public getEtaToSystem(
    fleetId: string,
    destinationSystemId: string,
    rangeHops?: number,
    waypointSystemIds: readonly string[] = [],
  ): FleetEta | null {
    const fleet = this.fleets.get(fleetId);
    if (!fleet) return null;
    const hopsPerTurn = normalizeRangeHops(rangeHops);
    const plan = this.planRoute(fleet.systemId, destinationSystemId, waypointSystemIds);
    if (!plan.path) return null;
    const hopsRemaining = plan.path.length - 1;
    return {
      turnsRemaining: turnsForHops(hopsRemaining, hopsPerTurn),
      hopsRemaining,
      hopsPerTurn,
      nextSystemId: plan.path[1] ?? null,
      arrivalSystemId: destinationSystemId,
    };
  }

  public removeFleet(fleetId: string): boolean {
    if (!this.fleets.delete(fleetId)) return false;
    this.eventBus.emit('fleet:removed', { fleetId });
    return true;
  }

  /* ---------------------------------------------------------------------- */
  /* Turn resolution                                                        */
  /* ---------------------------------------------------------------------- */

  public advanceTurn(
    colonies: Colony[],
    turn = 0,
    diplomacy: WarRelationLookup | null = null,
    rangeHopsForCiv?: (civId: string) => number,
  ): FleetTurnSummary {
    const summary: FleetTurnSummary = {
      completedShipOrders: 0,
      arrivedFleetIds: [],
      movedFleetIds: [],
      hopsTraveled: 0,
    };
    const coloniesById = new Map(colonies.map((colony) => [colony.id, colony]));

    const remainingOrders: ShipBuildOrder[] = [];
    const usedSlips = new Map<string, number>();

    for (const order of this.orders) {
      const colony = coloniesById.get(order.colonyId);
      if (!colony || colony.status !== 'active') {
        remainingOrders.push(order);
        continue;
      }

      const def = getShipDef(order.shipDefId);
      if (!def) {
        continue;
      }

      const capacity = getShipyardCapacity(colony);
      const occupied = usedSlips.get(colony.id) ?? 0;
      if (occupied >= capacity) {
        remainingOrders.push(order);
        continue;
      }
      usedSlips.set(colony.id, occupied + 1);

      const production = Math.max(
        1,
        Math.floor(Math.max(0, colony.netYields?.production ?? 0) * SHIPYARD_PRODUCTION_SHARE),
      );
      order.investedProduction += production;

      if (order.investedProduction < order.requiredProduction) {
        remainingOrders.push(order);
        continue;
      }

      const fleet = this.ensureFleetAt(order.civId, colony.systemId);
      this.addShipsToFleet(fleet, order.shipDefId, 1);
      // Ein neu gebautes Kolonieschiff erhält die volle Gründungsfracht.
      if (order.shipDefId === 'colony_ship' && !fleet.cargo) {
        fleet.cargo = { ...COLONIZATION_SUPPLY };
      }
      summary.completedShipOrders += 1;
      this.eventBus.emit('fleet:ship-built', {
        fleetId: fleet.id,
        shipDefId: order.shipDefId,
        colonyId: colony.id,
        systemId: colony.systemId,
      });
    }
    this.orders = remainingOrders;

    // Verbände bewegen sich in stabiler Reihenfolge (nach ID). Master of
    // Orion 2 löst Bewegungen ebenfalls in einer festen Zugreihenfolge pro
    // Runde auf; hier macht die Sortierung die Auflösung unabhängig von der
    // Einfügereihenfolge und damit save-/load-stabil.
    const movingFleets = Array.from(this.fleets.values())
      .filter((fleet) => fleet.status === 'moving')
      .sort((a, b) => compareIds(a.id, b.id));

    for (const fleet of movingFleets) {
      // Wurde der Verband in dieser Runde bereits durch einen Auftrag bewegt,
      // bleibt es bei genau einer Bewegung pro Runde.
      if (this.movedThisTurn.has(fleet.id)) continue;
      const traveled = this.moveFleetAlongRoute(
        fleet,
        normalizeRangeHops(rangeHopsForCiv?.(fleet.civId)),
        summary,
      );
      if (traveled > 0) {
        summary.movedFleetIds.push(fleet.id);
        summary.hopsTraveled += traveled;
      }
    }

    // Neue Runde: Verbände dürfen wieder ziehen.
    this.movedThisTurn.clear();

    this.resolveBattles(turn, diplomacy);

    return summary;
  }

  /**
   * Führt einen bereits erteilten Bewegungsauftrag sofort für die laufende
   * Runde aus – höchstens `hopsPerTurn` Hyperlane-Sprünge. Das ist dieselbe
   * Regel wie im Rundenwechsel, nur früher ausgelöst; der Merker verhindert
   * eine Doppelbewegung beim anschließenden `advanceTurn`.
   */
  public moveFleetNow(
    fleetId: string,
    rangeHops?: number,
  ): { traveled: number; arrived: boolean } | null {
    const fleet = this.fleets.get(fleetId);
    if (!fleet || fleet.status !== 'moving') return null;
    if (this.movedThisTurn.has(fleet.id)) return { traveled: 0, arrived: false };

    const summary: FleetTurnSummary = {
      completedShipOrders: 0,
      arrivedFleetIds: [],
      movedFleetIds: [],
      hopsTraveled: 0,
    };
    const traveled = this.moveFleetAlongRoute(fleet, normalizeRangeHops(rangeHops), summary);
    if (traveled > 0) {
      this.movedThisTurn.add(fleet.id);
    }
    return { traveled, arrived: fleet.pathIndex >= fleet.pathSystemIds.length - 1 };
  }

  /** Ein Verband hat in dieser Runde bereits gezogen. */
  public hasMovedThisTurn(fleetId: string): boolean {
    return this.movedThisTurn.has(fleetId);
  }

  private moveFleetAlongRoute(
    fleet: Fleet,
    hopsPerTurn: number,
    summary: FleetTurnSummary,
  ): number {
    let traveled = 0;
    for (let step = 0; step < hopsPerTurn && fleet.status === 'moving'; step += 1) {
      const nextIndex = fleet.pathIndex + 1;
      if (nextIndex >= fleet.pathSystemIds.length) {
        this.markFleetArrived(fleet, summary);
        break;
      }
      fleet.pathIndex = nextIndex;
      fleet.systemId = fleet.pathSystemIds[nextIndex];
      traveled += 1;
      if (fleet.pathIndex >= fleet.pathSystemIds.length - 1) {
        this.markFleetArrived(fleet, summary);
      }
    }
    return traveled;
  }

  private markFleetArrived(fleet: Fleet, summary: FleetTurnSummary): void {
    fleet.status = 'stationed';
    fleet.pathSystemIds = [];
    fleet.pathIndex = 0;
    fleet.destinationSystemId = null;
    summary.arrivedFleetIds.push(fleet.id);
    this.eventBus.emit('fleet:arrived', { fleet: cloneFleet(fleet) });
  }

  /* ---------------------------------------------------------------------- */
  /* AI fleets                                                              */
  /* ---------------------------------------------------------------------- */

  /**
   * Führt den Flottenzug einer KI-Zivilisation aus: freie Werftdocks erhalten
   * das günstigste baubare Muster, anschließend patrouillieren stationierte
   * Flotten reihum zwischen den eigenen Koloniesystemen. Kriegszüge bleiben
   * Stage C vorbehalten.
   */
  public executeAiFleetTurn(
    civId: string,
    colonies: Colony[],
    completedTechIds: ReadonlySet<string> | string[],
    turn = 0,
  ): AiFleetTurnSummary {
    const summary: AiFleetTurnSummary = { queuedShipOrders: 0, movedFleetIds: [] };
    const techIds = completedTechIds instanceof Set ? completedTechIds : new Set(completedTechIds);

    const ownColonies = colonies
      .filter((colony) => colony.civId === civId && colony.status === 'active')
      .sort((a, b) => compareIds(a.id, b.id));

    for (const colony of ownColonies) {
      const openSlips = getShipyardCapacity(colony) - this.getOrdersForColony(colony.id).length;
      for (let slip = 0; slip < openSlips; slip += 1) {
        const shipDefId = AI_SHIP_PRIORITY.find(
          (candidate) => this.canBuildShip(colony, candidate, techIds).allowed,
        );
        if (!shipDefId) break;
        const result = this.queueShipBuild(colony, shipDefId, techIds, turn);
        if (!result.allowed) break;
        summary.queuedShipOrders += 1;
      }
    }

    const ownSystemIds = Array.from(new Set(ownColonies.map((colony) => colony.systemId))).sort(
      compareIds,
    );
    if (ownSystemIds.length < 2) {
      return summary;
    }

    const patrollingFleets = this.getFleetsForCiv(civId)
      .filter((fleet) => fleet.ships.length > 0 && fleet.status === 'stationed')
      .sort((a, b) => compareIds(a.id, b.id));

    for (const fleet of patrollingFleets) {
      const index = ownSystemIds.indexOf(fleet.systemId);
      if (index < 0) continue;
      const destinationSystemId = ownSystemIds[(index + 1) % ownSystemIds.length];
      const result = this.commandMoveFleet(fleet.id, destinationSystemId);
      if (result.allowed) {
        summary.movedFleetIds.push(fleet.id);
      }
    }

    return summary;
  }

  /* ---------------------------------------------------------------------- */
  /* Combat                                                                 */
  /* ---------------------------------------------------------------------- */

  private resolveBattles(turn: number, diplomacy: WarRelationLookup | null): void {
    const fleetsBySystem = new Map<string, Fleet[]>();
    for (const fleet of this.fleets.values()) {
      if (this.combatShipsOf([fleet]).length === 0) continue;
      const list = fleetsBySystem.get(fleet.systemId);
      if (list) {
        list.push(fleet);
      } else {
        fleetsBySystem.set(fleet.systemId, [fleet]);
      }
    }

    for (const systemId of Array.from(fleetsBySystem.keys()).sort(compareIds)) {
      for (;;) {
        const present = (fleetsBySystem.get(systemId) ?? []).filter(
          (fleet) =>
            this.fleets.has(fleet.id) &&
            fleet.ships.some((stack) => stack.count > 0 && Boolean(getShipDef(stack.shipDefId))),
        );
        const civIds = Array.from(new Set(present.map((fleet) => fleet.civId))).sort(compareIds);
        if (civIds.length < 2) break;

        const hostilePair = this.findHostilePair(civIds, diplomacy);
        if (!hostilePair) break;

        const [firstCivId, secondCivId] = hostilePair;
        const report = this.resolveBattle(
          systemId,
          turn,
          firstCivId,
          present.filter((fleet) => fleet.civId === firstCivId),
          secondCivId,
          present.filter((fleet) => fleet.civId === secondCivId),
        );

        this.battleReports.push(report);
        if (this.battleReports.length > BATTLE_REPORT_LIMIT) {
          this.battleReports.shift();
        }
        this.eventBus.emit('fleet:battle', { report: this.cloneBattleReport(report) });

        if (report.winnerCivId === null) break;
      }
    }
  }

  /**
   * Erstes Zivilisationspaar im System, das sich im Krieg befindet. Ohne
   * Diplomatie-Abfrage gelten alle Fremden als feindlich, damit der
   * Flottenmanager auch allein (z.B. in Tests) kämpfen kann.
   */
  private findHostilePair(
    civIds: string[],
    diplomacy: WarRelationLookup | null,
  ): [string, string] | null {
    for (let i = 0; i < civIds.length; i += 1) {
      for (let j = i + 1; j < civIds.length; j += 1) {
        if (!diplomacy || diplomacy.isAtWar(civIds[i], civIds[j])) {
          return [civIds[i], civIds[j]];
        }
      }
    }
    return null;
  }

  private resolveBattle(
    systemId: string,
    turn: number,
    firstCivId: string,
    firstFleets: Fleet[],
    secondCivId: string,
    secondFleets: Fleet[],
  ): FleetBattleReport {
    this.battleSequence += 1;
    const id = `battle_${systemId}_${turn}_${this.battleSequence}`;

    const firstShips = this.combatShipsOf(firstFleets);
    const secondShips = this.combatShipsOf(secondFleets);
    let firstAlive = firstShips;
    let secondAlive = secondShips;
    let rounds = 0;

    while (firstAlive.length > 0 && secondAlive.length > 0 && rounds < MAX_COMBAT_ROUNDS) {
      rounds += 1;
      const firstDamage = firstAlive.reduce(
        (sum, ship) => sum + ship.attack + ship.defense,
        0,
      );
      const secondDamage = secondAlive.reduce(
        (sum, ship) => sum + ship.attack + ship.defense,
        0,
      );
      firstAlive = this.applyDamage(firstAlive, secondDamage);
      secondAlive = this.applyDamage(secondAlive, firstDamage);
    }

    const winnerCivId =
      firstAlive.length > 0 && secondAlive.length === 0
        ? firstCivId
        : secondAlive.length > 0 && firstAlive.length === 0
          ? secondCivId
          : null;

    const report: FleetBattleReport = {
      id,
      turn,
      systemId,
      rounds,
      sides: [
        this.buildBattleSide(firstCivId, firstFleets, firstShips, firstAlive),
        this.buildBattleSide(secondCivId, secondFleets, secondShips, secondAlive),
      ],
      winnerCivId,
    };

    this.applyBattleLosses(firstFleets, firstAlive);
    this.applyBattleLosses(secondFleets, secondAlive);

    return report;
  }

  private buildBattleSide(
    civId: string,
    fleets: Fleet[],
    before: CombatShip[],
    after: CombatShip[],
  ): FleetBattleSide {
    const beforeByType = new Map<string, number>();
    for (const ship of before) {
      beforeByType.set(ship.shipDefId, (beforeByType.get(ship.shipDefId) ?? 0) + 1);
    }
    const afterByType = new Map<string, number>();
    for (const ship of after) {
      afterByType.set(ship.shipDefId, (afterByType.get(ship.shipDefId) ?? 0) + 1);
    }

    const losses: FleetShipStack[] = [];
    for (const [shipDefId, count] of beforeByType) {
      const lost = count - (afterByType.get(shipDefId) ?? 0);
      if (lost > 0) {
        losses.push({ shipDefId, count: lost });
      }
    }
    losses.sort((a, b) => compareIds(a.shipDefId, b.shipDefId));

    return {
      civId,
      fleetIds: fleets.map((fleet) => fleet.id).sort(compareIds),
      shipsBefore: before.length,
      shipsAfter: after.length,
      losses,
    };
  }

  private applyBattleLosses(fleets: Fleet[], survivors: CombatShip[]): void {
    const survivorsByFleet = new Map<string, Map<string, number>>();
    for (const ship of survivors) {
      let byType = survivorsByFleet.get(ship.fleetId);
      if (!byType) {
        byType = new Map();
        survivorsByFleet.set(ship.fleetId, byType);
      }
      byType.set(ship.shipDefId, (byType.get(ship.shipDefId) ?? 0) + 1);
    }

    for (const fleet of fleets) {
      const current = this.fleets.get(fleet.id);
      if (!current) continue;
      const byType = survivorsByFleet.get(fleet.id);
      current.ships = current.ships
        .map((stack) =>
          getShipDef(stack.shipDefId)
            ? { ...stack, count: byType?.get(stack.shipDefId) ?? 0 }
            : { ...stack },
        )
        .filter((stack) => stack.count > 0);

      if (current.ships.length === 0) {
        this.removeFleet(current.id);
      }
    }
  }

  private combatShipsOf(fleets: Fleet[]): CombatShip[] {
    const ships: CombatShip[] = [];
    const orderedFleets = [...fleets].sort((a, b) => compareIds(a.id, b.id));

    for (const fleet of orderedFleets) {
      const stacks = [...fleet.ships].sort((a, b) => compareIds(a.shipDefId, b.shipDefId));
      for (const stack of stacks) {
        const def = getShipDef(stack.shipDefId);
        if (!def) continue;
        for (let index = 0; index < stack.count; index += 1) {
          ships.push({
            fleetId: fleet.id,
            shipDefId: stack.shipDefId,
            hull: def.hull,
            attack: def.attack,
            defense: def.defense,
            hp: def.hull,
          });
        }
      }
    }

    return ships.sort(
      (a, b) =>
        a.hull - b.hull ||
        a.attack - b.attack ||
        a.defense - b.defense ||
        compareIds(a.shipDefId, b.shipDefId) ||
        compareIds(a.fleetId, b.fleetId),
    );
  }

  private applyDamage(ships: CombatShip[], damage: number): CombatShip[] {
    let remaining = damage;
    const survivors: CombatShip[] = [];

    for (const ship of ships) {
      if (remaining <= 0) {
        survivors.push(ship);
        continue;
      }
      const absorbed = Math.min(ship.hp, remaining);
      remaining -= absorbed;
      const hp = ship.hp - absorbed;
      if (hp > 0) {
        survivors.push({ ...ship, hp });
      }
    }

    return survivors;
  }

  private cloneBattleReport(report: FleetBattleReport): FleetBattleReport {
    return {
      ...report,
      sides: report.sides.map((side) => ({
        ...side,
        fleetIds: [...side.fleetIds],
        losses: side.losses.map((loss) => ({ ...loss })),
      })),
    };
  }
}
