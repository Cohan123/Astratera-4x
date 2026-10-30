/**
 * Astraea 4X - Galactic Trade Test Suite (Phase 3)
 * Verifies the interstellar technology gate, deterministic hyperlane path
 * finding, route validation, convoy lifecycle across turns, cargo accounting
 * and persistence helpers.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../src/core/EventBus.ts';
import {
  GALACTIC_TRADE_TECH_ID,
  GalacticTradeManager,
  MAX_TARIFF_RATE,
  TARIFF_CREDITS_PER_CARGO_UNIT,
} from '../src/core/galacticTradeManager.ts';
import {
  FREIGHTER_CAPACITY,
  LOGISTICS_RESERVE,
  LOGISTICS_TARGET_STOCK,
  MAX_FREIGHTERS_PER_ROUTE,
} from '../src/core/logisticsManager.ts';
import type { WarRelationLookup } from '../src/core/fleetManager.ts';
import { Civilization, Colony, Fleet, GalacticTradeResource, Galaxy, StarSystem } from '../src/core/types.ts';

const PLAYER_CIV = 'civ-player';
const TECHS = [GALACTIC_TRADE_TECH_ID];

function makeColony(id: string, overrides: Partial<Colony> = {}): Colony {
  return {
    id,
    name: `Kolonie ${id}`,
    planetId: `planet-${id}`,
    systemId: 'sys-01',
    civId: PLAYER_CIV,
    factionId: 'faction-player',
    foundedTurn: 1,
    foundedDate: '2200-01-01',
    developmentTier: 'colony',
    status: 'active',
    population: 1000,
    stockpile: {
      food: 40,
      minerals: 40,
      rareResources: 5,
      energyBalance: 10,
      influence: 0,
    },
    ...overrides,
  } as Colony;
}

function makeGalaxy(links: Record<string, string[]>): Galaxy {
  const systems = Object.keys(links).map(
    (id) =>
      ({
        id,
        name: id,
        x: 0,
        y: 0,
        hyperlanes: links[id],
        planets: [],
        planetCount: 0,
        discoveryStatus: 'discovered',
        ownerFactionId: null,
        anomalyDetected: false,
      }) as unknown as StarSystem,
  );
  return {
    id: 'galaxy-test',
    name: 'Testgalaxie',
    seed: 'seed',
    createdAt: 0,
    config: { size: 'small', systemCount: systems.length, width: 100, height: 100 },
    systems,
  } as Galaxy;
}

// sys-01 -> sys-02 -> sys-03 (two hops), plus sys-01 -> sys-04 -> sys-03 as a
// second equal-length branch so determinism can be asserted.
const GALAXY = makeGalaxy({
  'sys-01': ['sys-02', 'sys-04'],
  'sys-02': ['sys-03'],
  'sys-03': [],
  'sys-04': ['sys-03'],
});

const bus = EventBus.getInstance();

function makeManager(): GalacticTradeManager {
  return new GalacticTradeManager(bus, () => GALAXY);
}

function makeCiv(id: string, treasury = 0): Civilization {
  return { id, treasury } as Civilization;
}

function makeFleet(id: string, overrides: Partial<Fleet> = {}): Fleet {
  return {
    id,
    name: `Flotte ${id}`,
    civId: PLAYER_CIV,
    systemId: 'sys-02',
    ships: [],
    status: 'stationed',
    pathSystemIds: [],
    pathIndex: 0,
    destinationSystemId: null,
    ...overrides,
  };
}

const AT_WAR: WarRelationLookup = { isAtWar: () => true };

describe('GalacticTradeManager', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('requires the interstellar freight technology', () => {
    const manager = makeManager();
    const source = makeColony('a');
    const target = makeColony('b', { systemId: 'sys-03' });

    const blocked = manager.createRoute(source, target, 'food', 2, []);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toContain('Interstellares Frachtnetzwerk');
    expect(manager.getRoutes()).toHaveLength(0);
    expect(manager.getConvoys()).toHaveLength(0);
  });

  it('finds a deterministic shortest hyperlane path', () => {
    const manager = makeManager();

    expect(manager.findPath('sys-01', 'sys-03')).toEqual(['sys-01', 'sys-02', 'sys-03']);
    expect(manager.findPath('sys-03', 'sys-01')).toEqual(['sys-03', 'sys-02', 'sys-01']);
    expect(manager.findPath('sys-01', 'sys-01')).toEqual(['sys-01']);
    expect(manager.findPath('sys-01', 'sys-99')).toBeNull();
  });

  it('rejects invalid endpoints, resources and freighter counts', () => {
    const manager = makeManager();
    const source = makeColony('a');
    const target = makeColony('b', { systemId: 'sys-03' });

    expect(manager.canCreateRoute(source, source, 'food', 1, TECHS).allowed).toBe(false);
    expect(
      manager.canCreateRoute(source, makeColony('c', { systemId: 'sys-03', civId: 'civ-ai' }), 'food', 1, TECHS)
        .allowed,
    ).toBe(false);
    expect(
      manager.canCreateRoute(source, makeColony('d', { systemId: 'sys-03', status: 'abandoned' }), 'food', 1, TECHS)
        .allowed,
    ).toBe(false);
    expect(
      manager.canCreateRoute(source, makeColony('e', { systemId: 'sys-01' }), 'food', 1, TECHS).reason,
    ).toContain('zwei verschiedene Systeme');
    expect(
      manager.canCreateRoute(source, target, 'energy' as GalacticTradeResource, 1, TECHS).reason,
    ).toContain('Unbekannte Handelsressource');
    expect(manager.canCreateRoute(source, target, 'food', 0, TECHS).allowed).toBe(false);
    expect(
      manager.canCreateRoute(source, target, 'food', MAX_FREIGHTERS_PER_ROUTE + 1, TECHS).allowed,
    ).toBe(false);
  });

  it('rejects a route without a hyperlane connection', () => {
    const galaxy = makeGalaxy({ 'sys-01': [], 'sys-02': [] });
    const manager = new GalacticTradeManager(bus, () => galaxy);
    const source = makeColony('a', { systemId: 'sys-01' });
    const target = makeColony('b', { systemId: 'sys-02' });

    const result = manager.createRoute(source, target, 'food', 1, TECHS);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('keine Hyperlane-Verbindung');
  });

  it('creates a deterministic route with a loaded convoy slot', () => {
    const manager = makeManager();
    const emitSpy = vi.spyOn(bus, 'emit');
    const source = makeColony('a');
    const target = makeColony('b', { systemId: 'sys-03' });

    const result = manager.createRoute(source, target, 'minerals', 2, TECHS);

    expect(result.allowed).toBe(true);
    expect(result.route?.id).toBe('gtrade_a_b_minerals');
    expect(result.route?.pathSystemIds).toEqual(['sys-01', 'sys-02', 'sys-03']);
    expect(result.route?.capacityPerTurn).toBe(2 * FREIGHTER_CAPACITY);
    expect(result.route?.isActive).toBe(true);
    expect(manager.getRoutesForColony('a')).toHaveLength(1);
    expect(manager.getRoutesForColony('b')).toHaveLength(1);

    const convoys = manager.getConvoysForRoute('gtrade_a_b_minerals');
    expect(convoys).toHaveLength(1);
    expect(convoys[0].status).toBe('loading');
    expect(convoys[0].capacity).toBe(2 * FREIGHTER_CAPACITY);
    expect(emitSpy).toHaveBeenCalledWith(
      'galactic-trade:route-created',
      expect.objectContaining({ route: expect.objectContaining({ id: 'gtrade_a_b_minerals' }) }),
    );
  });

  it('rejects duplicate connections for the same resource', () => {
    const manager = makeManager();
    const source = makeColony('a');
    const target = makeColony('b', { systemId: 'sys-03' });

    expect(manager.createRoute(source, target, 'food', 1, TECHS).allowed).toBe(true);
    const duplicate = manager.createRoute(source, target, 'food', 1, TECHS);
    expect(duplicate.allowed).toBe(false);
    expect(duplicate.reason).toContain('bereits eine Route');
    expect(manager.getRoutes()).toHaveLength(1);

    // Direction and resource are part of the uniqueness key.
    expect(manager.createRoute(source, target, 'minerals', 1, TECHS).allowed).toBe(true);
    expect(manager.createRoute(target, source, 'food', 1, TECHS).allowed).toBe(true);
    expect(manager.getRoutes()).toHaveLength(3);
  });

  it('moves one hop per turn and delivers cargo on arrival', () => {
    const manager = makeManager();
    const emitSpy = vi.spyOn(bus, 'emit');
    const source = makeColony('a');
    const target = makeColony('b', { systemId: 'sys-03' });
    manager.createRoute(source, target, 'food', 2, TECHS);

    // Turn 1: load at source and depart (no hop yet).
    let summaries = manager.advanceTurn([source, target]);
    const convoy = manager.getConvoysForRoute('gtrade_a_b_food')[0];
    expect(summaries).toHaveLength(0);
    expect(convoy.status).toBe('outbound');
    expect(convoy.pathIndex).toBe(0);
    expect(convoy.cargo.food).toBe(
      Math.min(2 * FREIGHTER_CAPACITY, 40 - LOGISTICS_RESERVE.food),
    );
    expect(source.stockpile.food).toBe(40 - convoy.cargo.food);
    expect(manager.calculateInTransit('b').food).toBe(convoy.cargo.food);
    expect(emitSpy).toHaveBeenCalledWith(
      'galactic-trade:convoy-departed',
      expect.objectContaining({ routeId: 'gtrade_a_b_food' }),
    );

    const carried = convoy.cargo.food;

    // Turn 2: hop 1 of 2.
    manager.advanceTurn([source, target]);
    expect(convoy.status).toBe('outbound');
    expect(convoy.pathIndex).toBe(1);

    // Turn 3: hop 2 of 2 -> arrival and delivery.
    summaries = manager.advanceTurn([source, target]);
    expect(convoy.status).toBe('inbound');
    expect(convoy.pathIndex).toBe(2);
    expect(target.stockpile.food).toBe(40 + carried);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      routeId: 'gtrade_a_b_food',
      resource: 'food',
      transferred: carried,
    });
    expect(convoy.cargo.food).toBe(0);
    expect(manager.calculateInTransit('b').food).toBe(0);
    expect(emitSpy).toHaveBeenCalledWith(
      'galactic-trade:convoy-arrived',
      expect.objectContaining({ routeId: 'gtrade_a_b_food' }),
    );
    expect(emitSpy).toHaveBeenCalledWith(
      'galactic-trade:transfer',
      expect.objectContaining({ transferred: carried }),
    );

    // Turns 4-5: return along the same path (2 -> 1 -> 0), then dock.
    manager.advanceTurn([source, target]);
    expect(convoy.status).toBe('inbound');
    expect(convoy.pathIndex).toBe(1);

    manager.advanceTurn([source, target]);
    expect(convoy.status).toBe('loading');
    expect(convoy.pathIndex).toBe(0);

    // Source reserves were consumed, so no second load is possible yet.
    manager.advanceTurn([source, target]);
    expect(convoy.status).toBe('loading');
    expect(convoy.cargo.food).toBe(0);
    expect(source.stockpile.food).toBe(LOGISTICS_RESERVE.food);
  });

  it('never loads more than the source reserve allows', () => {
    const manager = makeManager();
    const source = makeColony('a', {
      stockpile: { food: LOGISTICS_RESERVE.food, minerals: 0, rareResources: 0, energyBalance: 0, influence: 0 },
    });
    const target = makeColony('b', { systemId: 'sys-03' });
    manager.createRoute(source, target, 'food', 2, TECHS);

    manager.advanceTurn([source, target]);
    const convoy = manager.getConvoysForRoute('gtrade_a_b_food')[0];
    expect(convoy.status).toBe('loading');
    expect(convoy.cargo.food).toBe(0);
    expect(source.stockpile.food).toBe(LOGISTICS_RESERVE.food);
  });

  it('respects the target stock target and in-transit cargo', () => {
    const manager = makeManager();
    const source = makeColony('a');
    const target = makeColony('b', {
      systemId: 'sys-03',
      stockpile: {
        food: LOGISTICS_TARGET_STOCK.food - 5,
        minerals: 0,
        rareResources: 0,
        energyBalance: 0,
        influence: 0,
      },
    });
    manager.createRoute(source, target, 'food', 2, TECHS);

    manager.advanceTurn([source, target]);
    const convoy = manager.getConvoysForRoute('gtrade_a_b_food')[0];
    expect(convoy.cargo.food).toBe(5);
  });

  it('pauses new loading but keeps an existing convoy travelling', () => {
    const manager = makeManager();
    const source = makeColony('a');
    const target = makeColony('b', { systemId: 'sys-03' });
    const route = manager.createRoute(source, target, 'food', 1, TECHS).route!;

    expect(manager.setRouteActive(route.id, false)).toBe(true);
    manager.advanceTurn([source, target]);
    const convoy = manager.getConvoysForRoute(route.id)[0];
    expect(convoy.status).toBe('loading');
    expect(convoy.cargo.food).toBe(0);

    expect(manager.setRouteActive(route.id, true)).toBe(true);
    manager.advanceTurn([source, target]);
    expect(convoy.status).toBe('outbound');
    expect(convoy.cargo.food).toBeGreaterThan(0);

    // Pausing mid-flight does not abort the delivery.
    manager.setRouteActive(route.id, false);
    manager.advanceTurn([source, target]);
    manager.advanceTurn([source, target]);
    expect(target.stockpile.food).toBeGreaterThan(40);
  });

  it('holds cargo in orbit while the destination colony is inactive', () => {
    const manager = makeManager();
    const source = makeColony('a');
    const target = makeColony('b', { systemId: 'sys-03' });
    manager.createRoute(source, target, 'food', 2, TECHS);

    manager.advanceTurn([source, target]);
    const convoy = manager.getConvoysForRoute('gtrade_a_b_food')[0];
    const carried = convoy.cargo.food;

    target.status = 'abandoned';
    manager.advanceTurn([source, target]);
    manager.advanceTurn([source, target]);

    expect(convoy.status).toBe('outbound');
    expect(convoy.cargo.food).toBe(carried);
    expect(target.stockpile.food).toBe(40);

    target.status = 'active';
    manager.advanceTurn([source, target]);
    expect(target.stockpile.food).toBe(40 + carried);
  });

  it('removes routes together with their convoys', () => {
    const manager = makeManager();
    const source = makeColony('a');
    const target = makeColony('b', { systemId: 'sys-03' });
    const route = manager.createRoute(source, target, 'food', 1, TECHS).route!;

    expect(manager.removeRoute(route.id)).toBe(true);
    expect(manager.getRoute(route.id)).toBeNull();
    expect(manager.getConvoysForRoute(route.id)).toHaveLength(0);
    expect(manager.removeRoute(route.id)).toBe(false);
    expect(manager.setRouteActive(route.id, false)).toBe(false);
  });

  it('initializes tariff, escort and blockade fields on new routes', () => {
    const manager = makeManager();
    const source = makeColony('a');
    const target = makeColony('b', { systemId: 'sys-03' });
    const route = manager.createRoute(source, target, 'food', 1, TECHS).route!;

    expect(route.tariffRate).toBe(0);
    expect(route.escortFleetIds).toEqual([]);
    expect(route.isBlockaded).toBe(false);
    expect(route.blockadedSystemIds).toEqual([]);
  });

  it('validates and applies the trade tariff', () => {
    const manager = makeManager();
    const emitSpy = vi.spyOn(bus, 'emit');
    const source = makeColony('a');
    const target = makeColony('b', { systemId: 'sys-03' });
    const route = manager.createRoute(source, target, 'food', 1, TECHS).route!;

    expect(manager.setRouteTariff(route.id, -1).allowed).toBe(false);
    expect(manager.setRouteTariff(route.id, MAX_TARIFF_RATE + 1).allowed).toBe(false);
    expect(manager.setRouteTariff(route.id, Number.NaN).allowed).toBe(false);
    expect(manager.setRouteTariff('missing', 5).reason).toContain('Route nicht gefunden');
    expect(manager.getRoute(route.id)?.tariffRate).toBe(0);

    const applied = manager.setRouteTariff(route.id, 7.9);
    expect(applied.allowed).toBe(true);
    expect(applied.route?.tariffRate).toBe(7);
    expect(emitSpy).toHaveBeenCalledWith('galactic-trade:route-tariff-changed', {
      routeId: route.id,
      tariffRate: 7,
    });
  });

  it('credits tariff revenue from delivered cargo to the owning civilization', () => {
    const civ = makeCiv(PLAYER_CIV, 100);
    const manager = new GalacticTradeManager(
      bus,
      () => GALAXY,
      () => [],
      () => null,
    );
    const source = makeColony('a');
    const target = makeColony('b', { systemId: 'sys-03' });
    const route = manager.createRoute(source, target, 'food', 2, TECHS).route!;
    manager.setRouteTariff(route.id, 20);

    manager.advanceTurn([source, target], [civ]);
    const convoy = manager.getConvoysForRoute(route.id)[0];
    const carried = convoy.cargo.food;
    manager.advanceTurn([source, target], [civ]);
    const summaries = manager.advanceTurn([source, target], [civ]);

    const expected = Math.round(carried * TARIFF_CREDITS_PER_CARGO_UNIT * 0.2 * 10) / 10;
    expect(expected).toBeGreaterThan(0);
    expect(summaries[0].tariffCredits).toBe(expected);
    expect(civ.treasury).toBe(100 + expected);
  });

  it('credits no tariff without a matching civilization', () => {
    const manager = makeManager();
    const source = makeColony('a');
    const target = makeColony('b', { systemId: 'sys-03' });
    const route = manager.createRoute(source, target, 'food', 2, TECHS).route!;
    manager.setRouteTariff(route.id, 20);

    manager.advanceTurn([source, target]);
    manager.advanceTurn([source, target]);
    const summaries = manager.advanceTurn([source, target]);

    expect(summaries).toHaveLength(1);
    expect(summaries[0].tariffCredits).toBeUndefined();
  });

  it('validates escort fleets before assigning them', () => {
    const fleets: Fleet[] = [makeFleet('fleet-a'), makeFleet('fleet-b', { status: 'moving' })];
    const manager = new GalacticTradeManager(
      bus,
      () => GALAXY,
      () => fleets,
      () => null,
    );
    const source = makeColony('a');
    const target = makeColony('b', { systemId: 'sys-03' });
    const route = manager.createRoute(source, target, 'food', 1, TECHS).route!;

    expect(manager.setRouteEscorts(route.id, ['fleet-b']).reason).toContain('nicht stationiert');
    expect(manager.setRouteEscorts(route.id, ['fleet-x']).reason).toContain('wurde nicht gefunden');

    const rejected = manager.setRouteEscorts(route.id, ['fleet-b', 'fleet-a']);
    expect(rejected.allowed).toBe(false);
    expect(rejected.reason).toContain('nicht stationiert');
    expect(manager.getRoute(route.id)?.escortFleetIds).toEqual([]);

    const result = manager.setRouteEscorts(route.id, ['fleet-a', 'fleet-a']);
    expect(result.allowed).toBe(true);
    expect(result.route?.escortFleetIds).toEqual(['fleet-a']);
  });

  it('blocks loading on a route through a hostile system', () => {
    const hostile = makeFleet('fleet-enemy', { civId: 'civ-enemy', systemId: 'sys-02' });
    const emitSpy = vi.spyOn(bus, 'emit');
    const manager = new GalacticTradeManager(
      bus,
      () => GALAXY,
      () => [hostile],
      () => AT_WAR,
    );
    const source = makeColony('a');
    const target = makeColony('b', { systemId: 'sys-03' });
    const route = manager.createRoute(source, target, 'food', 2, TECHS).route!;

    manager.advanceTurn([source, target]);
    const convoy = manager.getConvoysForRoute(route.id)[0];
    expect(manager.getRoute(route.id)?.isBlockaded).toBe(true);
    expect(manager.getRoute(route.id)?.blockadedSystemIds).toEqual(['sys-02']);
    expect(convoy.status).toBe('loading');
    expect(convoy.cargo.food).toBe(0);
    expect(source.stockpile.food).toBe(40);
    expect(emitSpy).toHaveBeenCalledWith('galactic-trade:route-blockaded', {
      routeId: route.id,
      blockadedSystemIds: ['sys-02'],
    });

    // State is only announced on transitions.
    manager.advanceTurn([source, target]);
    expect(
      emitSpy.mock.calls.filter(([event]) => event === 'galactic-trade:route-blockaded'),
    ).toHaveLength(1);

    expect(manager.setRouteActive(route.id, false)).toBe(true);
  });

  it('freezes an arriving convoy while the destination is blockaded', () => {
    let fleets: Fleet[] = [];
    const manager = new GalacticTradeManager(
      bus,
      () => GALAXY,
      () => fleets,
      () => AT_WAR,
    );
    const source = makeColony('a');
    const target = makeColony('b', { systemId: 'sys-03' });
    const route = manager.createRoute(source, target, 'food', 2, TECHS).route!;

    manager.advanceTurn([source, target]);
    manager.advanceTurn([source, target]);
    const convoy = manager.getConvoysForRoute(route.id)[0];
    const carried = convoy.cargo.food;
    expect(convoy.status).toBe('outbound');
    expect(convoy.pathIndex).toBe(1);

    fleets = [makeFleet('fleet-enemy', { civId: 'civ-enemy', systemId: 'sys-02' })];
    manager.advanceTurn([source, target]);
    expect(convoy.status).toBe('outbound');
    expect(convoy.pathIndex).toBe(2);
    expect(convoy.cargo.food).toBe(carried);
    expect(target.stockpile.food).toBe(40);

    manager.advanceTurn([source, target]);
    expect(convoy.status).toBe('outbound');
    expect(convoy.cargo.food).toBe(carried);
    expect(target.stockpile.food).toBe(40);

    fleets = [];
    manager.advanceTurn([source, target]);
    expect(target.stockpile.food).toBe(40 + carried);
    expect(convoy.status).toBe('inbound');
  });

  it('lets a stationed escort fleet neutralize a blockade', () => {
    const enemy = makeFleet('fleet-enemy', { civId: 'civ-enemy', systemId: 'sys-02' });
    const escort = makeFleet('fleet-escort', { systemId: 'sys-02' });
    const manager = new GalacticTradeManager(
      bus,
      () => GALAXY,
      () => [enemy, escort],
      () => AT_WAR,
    );
    const source = makeColony('a');
    const target = makeColony('b', { systemId: 'sys-03' });
    const route = manager.createRoute(source, target, 'food', 2, TECHS).route!;
    manager.setRouteEscorts(route.id, [escort.id]);

    manager.advanceTurn([source, target]);
    expect(manager.getRoute(route.id)?.isBlockaded).toBe(false);
    const convoy = manager.getConvoysForRoute(route.id)[0];
    expect(convoy.status).toBe('outbound');

    manager.advanceTurn([source, target]);
    manager.advanceTurn([source, target]);
    expect(target.stockpile.food).toBeGreaterThan(40);
  });

  it('sanitizes saved tariff and blockade state on load', () => {
    const manager = makeManager();
    const source = makeColony('a');
    const target = makeColony('b', { systemId: 'sys-03' });
    const route = manager.createRoute(source, target, 'food', 1, TECHS).route!;

    const saved = {
      ...route,
      pathSystemIds: [...route.pathSystemIds],
      tariffRate: -5,
      escortFleetIds: ['fleet-a', 'fleet-a', 'fleet-a'],
      isBlockaded: true,
      blockadedSystemIds: ['sys-02'],
    };
    const restored = makeManager();
    restored.loadRoutes([saved]);

    const loaded = restored.getRoute(route.id)!;
    expect(loaded.tariffRate).toBe(0);
    expect(loaded.escortFleetIds).toEqual(['fleet-a']);
    expect(loaded.isBlockaded).toBe(false);
    expect(loaded.blockadedSystemIds).toEqual([]);

    const overCap = makeManager();
    overCap.loadRoutes([{ ...saved, tariffRate: MAX_TARIFF_RATE + 50 }]);
    expect(overCap.getRoute(route.id)?.tariffRate).toBe(MAX_TARIFF_RATE);
  });

  it('round-trips routes and convoys without sharing mutable state', () => {
    const manager = makeManager();
    const source = makeColony('a');
    const target = makeColony('b', { systemId: 'sys-03' });
    const route = manager.createRoute(source, target, 'food', 2, TECHS).route!;
    manager.advanceTurn([source, target]);

    const snapshotRoutes = manager.getRoutes().map((r) => ({ ...r, pathSystemIds: [...r.pathSystemIds] }));
    const snapshotConvoys = manager.getConvoys().map((c) => ({ ...c, cargo: { ...c.cargo } }));

    const restored = makeManager();
    restored.loadRoutes(snapshotRoutes);
    restored.loadConvoys(snapshotConvoys);

    const restoredConvoy = restored.getConvoysForRoute(route.id)[0];
    expect(restored.getRoute(route.id)?.resource).toBe('food');
    expect(restoredConvoy.status).toBe('outbound');
    expect(restoredConvoy.cargo.food).toBeGreaterThan(0);

    restoredConvoy.cargo.food = 0;
    expect(snapshotConvoys[0].cargo.food).toBeGreaterThan(0);

    restored.clear();
    expect(restored.getRoutes()).toHaveLength(0);
    expect(restored.getConvoys()).toHaveLength(0);
  });
});
