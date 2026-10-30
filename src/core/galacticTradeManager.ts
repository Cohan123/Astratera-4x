/**
 * Astraea 4X - Galactic Trade Manager (Phase 3)
 * Extends local logistics with interstellar trade routes. Each route follows a
 * deterministic shortest hyperlane path between two colonies of the same
 * empire. A single convoy per route loads goods at the source, travels one
 * hyperlane hop per turn and returns empty along the same path. Cargo is
 * reserved at the source and only delivered to an active target.
 */

import { EventBus } from './EventBus.ts';
import {
  Civilization,
  Colony,
  Fleet,
  FreighterFleetCargo,
  GalacticTradeConvoy,
  GalacticTradeResource,
  GalacticTradeRoute,
  Galaxy,
} from './types.ts';
import type { WarRelationLookup } from './fleetManager.ts';
import {
  FREIGHTER_CAPACITY,
  LOGISTICS_RESERVE,
  LOGISTICS_TARGET_STOCK,
  MAX_FREIGHTERS_PER_ROUTE,
} from './logisticsManager.ts';

export const GALACTIC_TRADE_TECH_ID = 'interstellar_freight_network';

/** Höchster zulässiger Handelszoll in Prozent des Zollwerts. */
export const MAX_TARIFF_RATE = 20;

/** Zollwert pro gelieferter Frachteinheit in Credits (bei 100 % Zoll). */
export const TARIFF_CREDITS_PER_CARGO_UNIT = 0.25;

export const GALACTIC_TRADE_RESOURCES: GalacticTradeResource[] = [
  'food',
  'minerals',
  'rareResources',
];

export interface GalacticTradeCreateResult {
  allowed: boolean;
  reason?: string;
  route?: GalacticTradeRoute;
}

export interface GalacticTradeTransferSummary {
  routeId: string;
  sourceColonyId: string;
  targetColonyId: string;
  resource: GalacticTradeResource;
  transferred: number;
  /** Gutgeschriebener Handelszoll; nur gesetzt, wenn tatsächlich Credits flossen. */
  tariffCredits?: number;
}

function normalizeTariffRate(rate: number | undefined): number {
  if (rate === undefined || !Number.isFinite(rate)) return 0;
  return Math.min(MAX_TARIFF_RATE, Math.max(0, Math.floor(rate)));
}

function roundTo1(value: number): number {
  return Math.round(value * 10) / 10;
}

function emptyCargo(): FreighterFleetCargo {
  return { food: 0, minerals: 0, rareResources: 0 };
}

function cloneCargo(cargo: FreighterFleetCargo): FreighterFleetCargo {
  return { food: cargo.food, minerals: cargo.minerals, rareResources: cargo.rareResources };
}

function cloneRoute(route: GalacticTradeRoute): GalacticTradeRoute {
  return {
    ...route,
    pathSystemIds: [...route.pathSystemIds],
    tariffRate: normalizeTariffRate(route.tariffRate),
    escortFleetIds: [...new Set(route.escortFleetIds ?? [])].sort(compareIds),
    isBlockaded: route.isBlockaded ?? false,
    blockadedSystemIds: [...(route.blockadedSystemIds ?? [])],
  };
}

function cloneConvoy(convoy: GalacticTradeConvoy): GalacticTradeConvoy {
  return { ...convoy, cargo: cloneCargo(convoy.cargo) };
}

function compareIds(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export class GalacticTradeManager {
  private routes: Map<string, GalacticTradeRoute> = new Map();
  private convoys: Map<string, GalacticTradeConvoy> = new Map();
  private eventBus: EventBus;
  private galaxyProvider: () => Galaxy;
  private fleetProvider: () => Fleet[];
  private diplomacyProvider: () => WarRelationLookup | null;

  constructor(
    eventBus: EventBus,
    galaxyProvider: () => Galaxy,
    fleetProvider: () => Fleet[] = () => [],
    diplomacyProvider: () => WarRelationLookup | null = () => null,
  ) {
    this.eventBus = eventBus;
    this.galaxyProvider = galaxyProvider;
    this.fleetProvider = fleetProvider;
    this.diplomacyProvider = diplomacyProvider;
  }

  public getRoute(routeId: string): GalacticTradeRoute | null {
    return this.routes.get(routeId) ?? null;
  }

  public getRoutes(): GalacticTradeRoute[] {
    return Array.from(this.routes.values());
  }

  public getRoutesForColony(colonyId: string): GalacticTradeRoute[] {
    return this.getRoutes().filter(
      (route) => route.sourceColonyId === colonyId || route.targetColonyId === colonyId,
    );
  }

  public getConvoy(convoyId: string): GalacticTradeConvoy | null {
    return this.convoys.get(convoyId) ?? null;
  }

  public getConvoys(): GalacticTradeConvoy[] {
    return Array.from(this.convoys.values());
  }

  public getConvoysForRoute(routeId: string): GalacticTradeConvoy[] {
    return this.getConvoys().filter((convoy) => convoy.routeId === routeId);
  }

  /**
   * Deterministic breadth-first search over the current hyperlane network.
   * Neighbours are visited in ascending system-ID order, so the first path
   * found is both the shortest and the lexicographically smallest.
   */
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

  public canCreateRoute(
    source: Colony | null,
    target: Colony | null,
    resource: GalacticTradeResource,
    freighterCount: number,
    completedTechIds: ReadonlySet<string> | string[],
  ): { allowed: boolean; reason?: string } {
    const techIds = completedTechIds instanceof Set ? completedTechIds : new Set(completedTechIds);

    if (!techIds.has(GALACTIC_TRADE_TECH_ID)) {
      return {
        allowed: false,
        reason:
          'Interstellarer Handel erfordert die Technologie "Interstellares Frachtnetzwerk".',
      };
    }
    if (!source || !target) {
      return { allowed: false, reason: 'Quell- und Zielkolonie müssen existieren.' };
    }
    if (!GALACTIC_TRADE_RESOURCES.includes(resource)) {
      return { allowed: false, reason: 'Unbekannte Handelsressource.' };
    }
    if (source.id === target.id) {
      return { allowed: false, reason: 'Quell- und Zielkolonie dürfen nicht identisch sein.' };
    }
    if (source.civId !== target.civId) {
      return { allowed: false, reason: 'Handelsrouten sind nur innerhalb eines Reiches möglich.' };
    }
    if (source.status !== 'active' || target.status !== 'active') {
      return { allowed: false, reason: 'Beide Kolonien müssen aktiv sein.' };
    }
    if (source.systemId === target.systemId) {
      return {
        allowed: false,
        reason: 'Interstellare Routen benötigen zwei verschiedene Systeme.',
      };
    }
    if (!Number.isFinite(freighterCount) || freighterCount < 1) {
      return { allowed: false, reason: 'Mindestens ein Frachter wird benötigt.' };
    }
    if (freighterCount > MAX_FREIGHTERS_PER_ROUTE) {
      return {
        allowed: false,
        reason: `Pro Route sind höchstens ${MAX_FREIGHTERS_PER_ROUTE} Frachter möglich.`,
      };
    }
    const duplicate = this.getRoutes().some(
      (route) =>
        route.sourceColonyId === source.id &&
        route.targetColonyId === target.id &&
        route.resource === resource,
    );
    if (duplicate) {
      return {
        allowed: false,
        reason: 'Für diese Verbindung und Ressource existiert bereits eine Route.',
      };
    }
    if (!this.findPath(source.systemId, target.systemId)) {
      return {
        allowed: false,
        reason: 'Zwischen den Systemen existiert keine Hyperlane-Verbindung.',
      };
    }
    return { allowed: true };
  }

  public createRoute(
    source: Colony | null,
    target: Colony | null,
    resource: GalacticTradeResource,
    freighterCount: number,
    completedTechIds: ReadonlySet<string> | string[],
  ): GalacticTradeCreateResult {
    const gate = this.canCreateRoute(source, target, resource, freighterCount, completedTechIds);
    if (!gate.allowed || !source || !target) {
      return { allowed: false, reason: gate.reason };
    }

    const path = this.findPath(source.systemId, target.systemId);
    if (!path) {
      return {
        allowed: false,
        reason: 'Zwischen den Systemen existiert keine Hyperlane-Verbindung.',
      };
    }

    const count = Math.floor(freighterCount);
    const route: GalacticTradeRoute = {
      id: `gtrade_${source.id}_${target.id}_${resource}`,
      sourceColonyId: source.id,
      targetColonyId: target.id,
      sourceSystemId: source.systemId,
      targetSystemId: target.systemId,
      pathSystemIds: path,
      resource,
      capacityPerTurn: count * FREIGHTER_CAPACITY,
      freighterCount: count,
      isActive: true,
      tariffRate: 0,
      escortFleetIds: [],
      isBlockaded: false,
      blockadedSystemIds: [],
    };

    this.routes.set(route.id, route);
    this.spawnConvoy(route);
    this.eventBus.emit('galactic-trade:route-created', { route: cloneRoute(route) });
    return { allowed: true, route: cloneRoute(route) };
  }

  public removeRoute(routeId: string): boolean {
    if (!this.routes.has(routeId)) return false;
    this.routes.delete(routeId);
    for (const [convoyId, convoy] of this.convoys) {
      if (convoy.routeId === routeId) this.convoys.delete(convoyId);
    }
    this.eventBus.emit('galactic-trade:route-removed', { routeId });
    return true;
  }

  public setRouteActive(routeId: string, isActive: boolean): boolean {
    const route = this.routes.get(routeId);
    if (!route) return false;
    route.isActive = isActive;
    return true;
  }

  public setRouteTariff(routeId: string, tariffRate: number): GalacticTradeCreateResult {
    const route = this.routes.get(routeId);
    if (!route) return { allowed: false, reason: 'Route nicht gefunden.' };
    if (!Number.isFinite(tariffRate) || tariffRate < 0 || tariffRate > MAX_TARIFF_RATE) {
      return {
        allowed: false,
        reason: `Der Zoll muss zwischen 0 und ${MAX_TARIFF_RATE} % liegen.`,
      };
    }
    route.tariffRate = normalizeTariffRate(tariffRate);
    this.eventBus.emit('galactic-trade:route-tariff-changed', {
      routeId: route.id,
      tariffRate: route.tariffRate,
    });
    return { allowed: true, route: cloneRoute(route) };
  }

  public setRouteEscorts(routeId: string, fleetIds: string[]): GalacticTradeCreateResult {
    const route = this.routes.get(routeId);
    if (!route) return { allowed: false, reason: 'Route nicht gefunden.' };

    const fleetsById = new Map(this.fleetProvider().map((fleet) => [fleet.id, fleet]));
    const uniqueIds = Array.from(new Set(fleetIds)).sort(compareIds);
    for (const fleetId of uniqueIds) {
      const fleet = fleetsById.get(fleetId);
      if (!fleet) return { allowed: false, reason: `Flotte ${fleetId} wurde nicht gefunden.` };
      if (fleet.status !== 'stationed') {
        return { allowed: false, reason: `Flotte ${fleetId} ist nicht stationiert.` };
      }
    }

    route.escortFleetIds = uniqueIds;
    this.eventBus.emit('galactic-trade:route-escorts-changed', {
      routeId: route.id,
      escortFleetIds: [...uniqueIds],
    });
    return { allowed: true, route: cloneRoute(route) };
  }

  /**
   * Recomputes blockade state for every route from the current fleet positions
   * and war relations. Runs before movement so only turn-start positions count.
   */
  private updateBlockades(colonies: Colony[]): void {
    const diplomacy = this.diplomacyProvider();
    if (!diplomacy) return;

    const colonyById = new Map(colonies.map((colony) => [colony.id, colony]));
    const fleets = this.fleetProvider();
    const orderedRoutes = Array.from(this.routes.values()).sort((a, b) =>
      compareIds(a.id, b.id),
    );

    for (const route of orderedRoutes) {
      const source = colonyById.get(route.sourceColonyId);
      const target = colonyById.get(route.targetColonyId);
      const ownerCivId = source?.civId ?? target?.civId ?? null;
      if (!ownerCivId) continue;

      const escorts = new Set(route.escortFleetIds ?? []);
      const blockadedSystemIds: string[] = [];

      for (const systemId of route.pathSystemIds) {
        const hostile = fleets.some(
          (fleet) =>
            fleet.systemId === systemId &&
            fleet.civId !== ownerCivId &&
            diplomacy.isAtWar(ownerCivId, fleet.civId),
        );
        if (!hostile) continue;

        const escorted = fleets.some(
          (fleet) =>
            fleet.systemId === systemId &&
            fleet.civId === ownerCivId &&
            fleet.status === 'stationed' &&
            escorts.has(fleet.id),
        );
        if (!escorted) blockadedSystemIds.push(systemId);
      }

      const wasBlockaded = route.isBlockaded ?? false;
      const isBlockaded = blockadedSystemIds.length > 0;
      route.isBlockaded = isBlockaded;
      route.blockadedSystemIds = blockadedSystemIds;

      if (isBlockaded && !wasBlockaded) {
        this.eventBus.emit('galactic-trade:route-blockaded', {
          routeId: route.id,
          blockadedSystemIds: [...blockadedSystemIds],
        });
      } else if (!isBlockaded && wasBlockaded) {
        this.eventBus.emit('galactic-trade:route-unblockaded', { routeId: route.id });
      }
    }
  }

  public loadRoutes(routes: GalacticTradeRoute[]): void {
    this.routes.clear();
    this.convoys.clear();
    for (const route of routes) {
      const cloned = cloneRoute(route);
      cloned.isBlockaded = false;
      cloned.blockadedSystemIds = [];
      this.routes.set(cloned.id, cloned);
      this.spawnConvoy(cloned);
    }
  }

  public loadConvoys(convoys: GalacticTradeConvoy[]): void {
    this.convoys.clear();
    for (const convoy of convoys) {
      if (!this.routes.has(convoy.routeId)) continue;
      this.convoys.set(convoy.id, cloneConvoy(convoy));
    }
  }

  public clear(): void {
    this.routes.clear();
    this.convoys.clear();
  }

  /** Sum of cargo currently outbound towards the given colony (all routes). */
  public calculateInTransit(targetColonyId: string): FreighterFleetCargo {
    const inTransit = emptyCargo();
    for (const convoy of this.convoys.values()) {
      if (convoy.status !== 'outbound') continue;
      const route = this.routes.get(convoy.routeId);
      if (!route || route.targetColonyId !== targetColonyId) continue;
      inTransit.food += convoy.cargo.food;
      inTransit.minerals += convoy.cargo.minerals;
      inTransit.rareResources += convoy.cargo.rareResources;
    }
    return inTransit;
  }

  public advanceTurn(
    colonies: Colony[],
    civilizations: Civilization[] = [],
  ): GalacticTradeTransferSummary[] {
    this.updateBlockades(colonies);

    const colonyById = new Map(colonies.map((colony) => [colony.id, colony]));
    const civilizationsById = new Map(
      civilizations.map((civilization) => [civilization.id, civilization]),
    );
    const summaries: GalacticTradeTransferSummary[] = [];
    const orderedConvoys = Array.from(this.convoys.values()).sort((a, b) =>
      compareIds(a.id, b.id),
    );

    // Phase 1: advance convoys that were already travelling at turn start.
    for (const convoy of orderedConvoys) {
      const route = this.routes.get(convoy.routeId);
      if (!route) {
        this.convoys.delete(convoy.id);
        continue;
      }

      const hops = Math.max(0, route.pathSystemIds.length - 1);

      if (convoy.status === 'outbound') {
        convoy.pathIndex = Math.min(hops, convoy.pathIndex + 1);
        if (convoy.pathIndex < hops) continue;

        const target = colonyById.get(route.targetColonyId);
        if (!target || target.status !== 'active') {
          // Keep the cargo in flight until the destination is reachable again.
          convoy.pathIndex = hops;
          continue;
        }

        if (route.isBlockaded) {
          // Cargo stays frozen at the blockaded destination until it is cleared.
          convoy.pathIndex = hops;
          continue;
        }

        const arrivedCargo = cloneCargo(convoy.cargo);
        const ownerCivId =
          colonyById.get(route.sourceColonyId)?.civId ??
          target.civId ??
          null;
        this.deliver(convoy, route, target, summaries, civilizationsById, ownerCivId);
        convoy.status = 'inbound';
        convoy.pathIndex = hops;
        this.eventBus.emit('galactic-trade:convoy-arrived', {
          convoyId: convoy.id,
          routeId: route.id,
          cargo: arrivedCargo,
        });
      } else if (convoy.status === 'inbound') {
        convoy.pathIndex = Math.max(0, convoy.pathIndex - 1);
        if (convoy.pathIndex <= 0) {
          convoy.status = 'loading';
          convoy.pathIndex = 0;
        }
      }
    }

    // Phase 2: load convoys that are waiting at their source. They depart this
    // turn but only move along the hyperlanes on the following turn.
    for (const convoy of orderedConvoys) {
      if (convoy.status !== 'loading') continue;
      const route = this.routes.get(convoy.routeId);
      if (!route || !route.isActive || route.isBlockaded) continue;

      const source = colonyById.get(route.sourceColonyId);
      const target = colonyById.get(route.targetColonyId);
      if (
        !source ||
        !target ||
        source.status !== 'active' ||
        target.status !== 'active'
      ) {
        continue;
      }

      const resource = route.resource;
      const available = Math.max(
        0,
        Math.floor(source.stockpile[resource] - LOGISTICS_RESERVE[resource]),
      );
      if (available <= 0) continue;

      const inTransit = this.calculateInTransit(target.id);
      const need = Math.max(
        0,
        Math.ceil(LOGISTICS_TARGET_STOCK[resource] - target.stockpile[resource] - inTransit[resource]),
      );
      const amount = Math.min(convoy.capacity, available, need);
      if (amount <= 0) continue;

      source.stockpile[resource] -= amount;
      convoy.cargo[resource] += amount;
      convoy.status = 'outbound';
      convoy.pathIndex = 0;
      this.eventBus.emit('galactic-trade:convoy-departed', {
        convoyId: convoy.id,
        routeId: route.id,
        cargo: cloneCargo(convoy.cargo),
      });
    }

    return summaries;
  }

  private deliver(
    convoy: GalacticTradeConvoy,
    route: GalacticTradeRoute,
    target: Colony,
    summaries: GalacticTradeTransferSummary[],
    civilizationsById: Map<string, Civilization>,
    ownerCivId: string | null,
  ): void {
    for (const resource of GALACTIC_TRADE_RESOURCES) {
      const amount = convoy.cargo[resource];
      if (amount > 0) target.stockpile[resource] += amount;
    }

    const transferred = convoy.cargo[route.resource];
    convoy.cargo = emptyCargo();

    if (transferred <= 0) return;

    const tariffRate = normalizeTariffRate(route.tariffRate);
    const owner = ownerCivId ? civilizationsById.get(ownerCivId) ?? null : null;
    let tariffCredits: number | undefined;

    if (owner && tariffRate > 0) {
      const earned = roundTo1(
        transferred * TARIFF_CREDITS_PER_CARGO_UNIT * (tariffRate / 100),
      );
      if (earned > 0) {
        owner.treasury += earned;
        tariffCredits = earned;
      }
    }

    const summary: GalacticTradeTransferSummary = {
      routeId: route.id,
      sourceColonyId: route.sourceColonyId,
      targetColonyId: route.targetColonyId,
      resource: route.resource,
      transferred,
    };
    if (tariffCredits !== undefined) summary.tariffCredits = tariffCredits;
    summaries.push(summary);
    this.eventBus.emit('galactic-trade:transfer', summary);
  }

  private spawnConvoy(route: GalacticTradeRoute): void {
    const convoy: GalacticTradeConvoy = {
      id: `gconvoy_${route.id}`,
      routeId: route.id,
      status: 'loading',
      pathIndex: 0,
      capacity: route.capacityPerTurn,
      cargo: emptyCargo(),
    };
    this.convoys.set(convoy.id, convoy);
  }
}
