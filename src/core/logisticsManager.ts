/**
 * Astraea 4X - Logistics Manager (Module 4 / Phase 2)
 * Models explicit freighter routes between colonies. A route is gated by the
 * logistics technology and owns a small fleet of freighters. Each freighter
 * travels physically between both colonies: it loads goods at the source,
 * spends several turns outbound, delivers on arrival and travels back empty.
 * The model is fully deterministic and never drains a source colony below its
 * fixed reserve.
 */

import { EventBus } from './EventBus.ts';
import { Colony, FreighterFleet, FreighterFleetCargo, LogisticsRoute } from './types.ts';

export const LOGISTICS_TECH_ID = 'planetary_logistics_prep';
export const FREIGHTER_CAPACITY = 15;
export const MAX_FREIGHTERS_PER_ROUTE = 5;

/** A single leg takes one turn unless a travel time resolver says otherwise. */
export const DEFAULT_TRAVEL_TURNS = 1;

/** Upper bound so that a bad resolver can never stall a fleet forever. */
export const MAX_TRAVEL_TURNS = 20;

export type LogisticsResource = 'food' | 'minerals' | 'rareResources';

export const LOGISTICS_RESOURCES: LogisticsResource[] = ['food', 'minerals', 'rareResources'];

/** A source colony keeps this much of each resource for itself. */
export const LOGISTICS_RESERVE: Record<LogisticsResource, number> = {
  food: 25,
  minerals: 25,
  rareResources: 5,
};

/** A target colony is only supplied up to this stock level. */
export const LOGISTICS_TARGET_STOCK: Record<LogisticsResource, number> = {
  food: 100,
  minerals: 100,
  rareResources: 40,
};

/** Resolves the number of turns a single leg between two colonies takes. */
export type LogisticsTravelTurnsResolver = (source: Colony, target: Colony) => number;

export interface LogisticsCreateResult {
  allowed: boolean;
  reason?: string;
  route?: LogisticsRoute;
}

export interface LogisticsTransferSummary {
  routeId: string;
  sourceColonyId: string;
  targetColonyId: string;
  transferred: Record<LogisticsResource, number>;
  totalTransferred: number;
}

function emptyCargo(): FreighterFleetCargo {
  return { food: 0, minerals: 0, rareResources: 0 };
}

function cloneCargo(cargo: FreighterFleetCargo): FreighterFleetCargo {
  return { food: cargo.food, minerals: cargo.minerals, rareResources: cargo.rareResources };
}

function cloneFleet(fleet: FreighterFleet): FreighterFleet {
  return { ...fleet, cargo: cloneCargo(fleet.cargo) };
}

export class LogisticsManager {
  private routes: Map<string, LogisticsRoute> = new Map();
  private fleets: Map<string, FreighterFleet> = new Map();
  private eventBus: EventBus;
  private travelTurnsResolver: LogisticsTravelTurnsResolver;

  constructor(
    eventBus: EventBus = EventBus.getInstance(),
    travelTurnsResolver: LogisticsTravelTurnsResolver = () => DEFAULT_TRAVEL_TURNS,
  ) {
    this.eventBus = eventBus;
    this.travelTurnsResolver = travelTurnsResolver;
  }

  public getRoute(routeId: string): LogisticsRoute | null {
    return this.routes.get(routeId) ?? null;
  }

  public getRoutes(): LogisticsRoute[] {
    return Array.from(this.routes.values());
  }

  public getRoutesForColony(colonyId: string): LogisticsRoute[] {
    return this.getRoutes().filter(
      (route) => route.sourceColonyId === colonyId || route.targetColonyId === colonyId,
    );
  }

  public getFleet(fleetId: string): FreighterFleet | null {
    return this.fleets.get(fleetId) ?? null;
  }

  public getFleets(): FreighterFleet[] {
    return Array.from(this.fleets.values());
  }

  public getFleetsForRoute(routeId: string): FreighterFleet[] {
    return this.getFleets().filter((fleet) => fleet.routeId === routeId);
  }

  public loadRoutes(routes: LogisticsRoute[]): void {
    this.routes.clear();
    this.fleets.clear();
    for (const route of routes) {
      const cloned = { ...route };
      this.routes.set(cloned.id, cloned);
      this.spawnFleetsForRoute(cloned, DEFAULT_TRAVEL_TURNS);
    }
  }

  public loadFleets(fleets: FreighterFleet[]): void {
    this.fleets.clear();
    for (const fleet of fleets) {
      this.fleets.set(fleet.id, cloneFleet(fleet));
    }
  }

  public clear(): void {
    this.routes.clear();
    this.fleets.clear();
  }

  public calculateCapacity(freighterCount: number): number {
    const clamped = Math.max(1, Math.min(MAX_FREIGHTERS_PER_ROUTE, Math.floor(freighterCount)));
    return clamped * FREIGHTER_CAPACITY;
  }

  public canCreateRoute(
    source: Colony | null,
    target: Colony | null,
    freighterCount: number,
    completedTechIds: ReadonlySet<string> | string[],
  ): { allowed: boolean; reason?: string } {
    const techIds = completedTechIds instanceof Set ? completedTechIds : new Set(completedTechIds);

    if (!techIds.has(LOGISTICS_TECH_ID)) {
      return {
        allowed: false,
        reason: 'Logistikrouten erfordern die Technologie "Planetare Logistik".',
      };
    }
    if (!source || !target) {
      return { allowed: false, reason: 'Quell- und Zielkolonie müssen existieren.' };
    }
    if (source.id === target.id) {
      return { allowed: false, reason: 'Quell- und Zielkolonie dürfen nicht identisch sein.' };
    }
    if (source.civId !== target.civId) {
      return { allowed: false, reason: 'Logistikrouten sind nur innerhalb eines Reiches möglich.' };
    }
    if (source.status !== 'active' || target.status !== 'active') {
      return { allowed: false, reason: 'Beide Kolonien müssen aktiv sein.' };
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
        route.sourceColonyId === source.id && route.targetColonyId === target.id,
    );
    if (duplicate) {
      return { allowed: false, reason: 'Für diese Verbindung existiert bereits eine Route.' };
    }
    return { allowed: true };
  }

  public createRoute(
    source: Colony | null,
    target: Colony | null,
    freighterCount: number,
    completedTechIds: ReadonlySet<string> | string[],
  ): LogisticsCreateResult {
    const gate = this.canCreateRoute(source, target, freighterCount, completedTechIds);
    if (!gate.allowed || !source || !target) {
      return { allowed: false, reason: gate.reason };
    }

    const count = Math.floor(freighterCount);
    const route: LogisticsRoute = {
      id: `route_${source.id}_${target.id}`,
      sourceColonyId: source.id,
      targetColonyId: target.id,
      capacityPerTurn: this.calculateCapacity(count),
      freighterCount: count,
      isActive: true,
    };

    this.routes.set(route.id, route);
    this.spawnFleetsForRoute(route, this.resolveTravelTurns(source, target));
    this.eventBus.emit('logistics:route-created', { route });
    return { allowed: true, route };
  }

  public removeRoute(routeId: string): boolean {
    if (!this.routes.has(routeId)) return false;
    this.routes.delete(routeId);
    for (const [fleetId, fleet] of this.fleets) {
      if (fleet.routeId === routeId) this.fleets.delete(fleetId);
    }
    this.eventBus.emit('logistics:route-removed', { routeId });
    return true;
  }

  public setRouteActive(routeId: string, isActive: boolean): boolean {
    const route = this.routes.get(routeId);
    if (!route) return false;
    route.isActive = isActive;
    return true;
  }

  /** Sum of cargo currently outbound towards the given colony (all routes). */
  public calculateInTransit(targetColonyId: string): FreighterFleetCargo {
    const total = emptyCargo();
    for (const fleet of this.fleets.values()) {
      if (fleet.status !== 'outbound' || fleet.targetColonyId !== targetColonyId) continue;
      total.food += fleet.cargo.food;
      total.minerals += fleet.cargo.minerals;
      total.rareResources += fleet.cargo.rareResources;
    }
    return total;
  }

  /**
   * Advances every freighter fleet by one turn. Deterministic: fleets are
   * processed in insertion order (route order), resources in a fixed order and
   * all amounts are integers.
   */
  public advanceTurn(colonies: Colony[]): LogisticsTransferSummary[] {
    const colonyById = new Map(colonies.map((colony) => [colony.id, colony]));
    const transfersByRoute = new Map<string, Record<LogisticsResource, number>>();
    const routeOrder: string[] = [];
    const departedThisTurn = new Set<string>();

    const recordTransfer = (routeId: string, cargo: FreighterFleetCargo) => {
      let transferred = transfersByRoute.get(routeId);
      if (!transferred) {
        transferred = emptyCargo();
        transfersByRoute.set(routeId, transferred);
        routeOrder.push(routeId);
      }
      transferred.food += cargo.food;
      transferred.minerals += cargo.minerals;
      transferred.rareResources += cargo.rareResources;
    };

    const deliver = (fleet: FreighterFleet, route: LogisticsRoute, target: Colony) => {
      const cargo = cloneCargo(fleet.cargo);
      for (const resource of LOGISTICS_RESOURCES) {
        if (cargo[resource] > 0) target.stockpile[resource] += cargo[resource];
      }
      recordTransfer(route.id, cargo);
      this.eventBus.emit('logistics:fleet-arrived', {
        fleetId: fleet.id,
        routeId: route.id,
        cargo: cloneCargo(cargo),
      });
      fleet.cargo = emptyCargo();
    };

    // Phase 1: empty return leg.
    for (const fleet of this.fleets.values()) {
      if (fleet.status !== 'inbound') continue;
      fleet.progress += 1;
      if (fleet.progress >= fleet.travelTurns) {
        fleet.status = 'loading';
        fleet.progress = 0;
      }
    }

    // Phase 2: load at the source and depart (may deliver immediately on short legs).
    for (const fleet of this.fleets.values()) {
      if (fleet.status !== 'loading') continue;
      const route = this.routes.get(fleet.routeId);
      if (!route || !route.isActive) continue;
      const source = colonyById.get(fleet.sourceColonyId);
      const target = colonyById.get(fleet.targetColonyId);
      if (!source || !target) continue;
      if (source.status !== 'active' || target.status !== 'active') continue;

      fleet.travelTurns = this.resolveTravelTurns(source, target);
      this.loadCargo(fleet, source, target, this.calculateInTransit(fleet.targetColonyId));
      const total = fleet.cargo.food + fleet.cargo.minerals + fleet.cargo.rareResources;
      if (total <= 0) continue;

      fleet.status = 'outbound';
      fleet.progress = 1;
      departedThisTurn.add(fleet.id);
      this.eventBus.emit('logistics:fleet-departed', {
        fleetId: fleet.id,
        routeId: route.id,
        cargo: cloneCargo(fleet.cargo),
      });

      if (fleet.progress >= fleet.travelTurns) {
        deliver(fleet, route, target);
        fleet.status = 'inbound';
        fleet.progress = 0;
      }
    }

    // Phase 3: outbound legs that departed on earlier turns.
    for (const fleet of this.fleets.values()) {
      if (fleet.status !== 'outbound' || departedThisTurn.has(fleet.id)) continue;
      const route = this.routes.get(fleet.routeId);
      const target = colonyById.get(fleet.targetColonyId);
      fleet.progress += 1;
      if (fleet.progress < fleet.travelTurns) continue;
      if (!route || !target || target.status !== 'active') {
        // Keep the cargo in flight until the destination is reachable again.
        fleet.progress = fleet.travelTurns;
        continue;
      }
      deliver(fleet, route, target);
      fleet.status = 'inbound';
      fleet.progress = 0;
    }

    const summaries: LogisticsTransferSummary[] = [];
    for (const routeId of routeOrder) {
      const transferred = transfersByRoute.get(routeId);
      const route = this.routes.get(routeId);
      if (!transferred || !route) continue;
      const totalTransferred =
        transferred.food + transferred.minerals + transferred.rareResources;
      if (totalTransferred <= 0) continue;
      const summary: LogisticsTransferSummary = {
        routeId,
        sourceColonyId: route.sourceColonyId,
        targetColonyId: route.targetColonyId,
        transferred,
        totalTransferred,
      };
      summaries.push(summary);
      this.eventBus.emit('logistics:transfer', summary);
    }

    return summaries;
  }

  private loadCargo(
    fleet: FreighterFleet,
    source: Colony,
    target: Colony,
    inTransit: FreighterFleetCargo,
  ): number {
    let remainingCapacity = fleet.maxCapacity;
    for (const resource of LOGISTICS_RESOURCES) {
      if (remainingCapacity <= 0) break;
      const available = Math.max(0, Math.floor(source.stockpile[resource] - LOGISTICS_RESERVE[resource]));
      const need = Math.max(
        0,
        Math.ceil(LOGISTICS_TARGET_STOCK[resource] - target.stockpile[resource] - inTransit[resource]),
      );
      const amount = Math.min(remainingCapacity, available, need);
      if (amount <= 0) continue;

      source.stockpile[resource] -= amount;
      fleet.cargo[resource] += amount;
      remainingCapacity -= amount;
    }
    return fleet.maxCapacity - remainingCapacity;
  }

  private resolveTravelTurns(source: Colony, target: Colony): number {
    let turns = DEFAULT_TRAVEL_TURNS;
    try {
      turns = this.travelTurnsResolver(source, target);
    } catch {
      turns = DEFAULT_TRAVEL_TURNS;
    }
    if (!Number.isFinite(turns)) return DEFAULT_TRAVEL_TURNS;
    return Math.max(1, Math.min(MAX_TRAVEL_TURNS, Math.round(turns)));
  }

  private spawnFleetsForRoute(route: LogisticsRoute, travelTurns: number): void {
    const count = Math.max(
      1,
      Math.min(MAX_FREIGHTERS_PER_ROUTE, Math.floor(route.freighterCount)),
    );
    for (let index = 0; index < count; index += 1) {
      const fleet: FreighterFleet = {
        id: `fleet_${route.id}_${index + 1}`,
        routeId: route.id,
        sourceColonyId: route.sourceColonyId,
        targetColonyId: route.targetColonyId,
        status: 'loading',
        progress: 0,
        travelTurns,
        maxCapacity: FREIGHTER_CAPACITY,
        cargo: emptyCargo(),
      };
      this.fleets.set(fleet.id, fleet);
    }
  }
}
