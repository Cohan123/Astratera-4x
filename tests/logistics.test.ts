/**
 * Astraea 4X - Logistics Route Test Suite (Module 4 / Phase 2)
 * Verifies the technology gate, route validation, activation and deterministic
 * per-turn resource transfers between colonies.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_TRAVEL_TURNS,
  FREIGHTER_CAPACITY,
  LOGISTICS_RESERVE,
  LOGISTICS_TECH_ID,
  LOGISTICS_TARGET_STOCK,
  LogisticsManager,
  MAX_FREIGHTERS_PER_ROUTE,
  MAX_TRAVEL_TURNS,
} from '../src/core/logisticsManager.ts';
import { Colony } from '../src/core/types.ts';

const PLAYER_CIV = 'civ-player';
const TECHS = [LOGISTICS_TECH_ID];

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

describe('LogisticsManager', () => {
  it('requires the planetary logistics technology', () => {
    const manager = new LogisticsManager();
    const source = makeColony('a');
    const target = makeColony('b');

    const blocked = manager.createRoute(source, target, 2, []);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toContain('Planetare Logistik');
    expect(manager.getRoutes()).toHaveLength(0);
  });

  it('rejects identical, foreign and inactive endpoints', () => {
    const manager = new LogisticsManager();
    const source = makeColony('a');
    const target = makeColony('b');

    expect(manager.canCreateRoute(source, source, 1, TECHS).allowed).toBe(false);
    expect(
      manager.canCreateRoute(source, makeColony('c', { civId: 'civ-ai' }), 1, TECHS).allowed,
    ).toBe(false);
    expect(
      manager.canCreateRoute(source, makeColony('d', { status: 'abandoned' }), 1, TECHS).allowed,
    ).toBe(false);
  });

  it('clamps capacity from the freighter count and rejects invalid counts', () => {
    const manager = new LogisticsManager();
    const source = makeColony('a');
    const target = makeColony('b');

    expect(manager.calculateCapacity(2)).toBe(2 * FREIGHTER_CAPACITY);
    expect(manager.calculateCapacity(99)).toBe(MAX_FREIGHTERS_PER_ROUTE * FREIGHTER_CAPACITY);
    expect(manager.createRoute(source, target, 0, TECHS).allowed).toBe(false);
    expect(
      manager.createRoute(source, target, MAX_FREIGHTERS_PER_ROUTE + 1, TECHS).allowed,
    ).toBe(false);
  });

  it('creates an active route with deterministic identity', () => {
    const manager = new LogisticsManager();
    const result = manager.createRoute(makeColony('a'), makeColony('b'), 3, TECHS);

    expect(result.allowed).toBe(true);
    expect(result.route?.id).toBe('route_a_b');
    expect(result.route?.capacityPerTurn).toBe(3 * FREIGHTER_CAPACITY);
    expect(result.route?.freighterCount).toBe(3);
    expect(result.route?.isActive).toBe(true);
    expect(manager.getRoutesForColony('b')).toHaveLength(1);
  });

  it('rejects duplicate and self-referential connections', () => {
    const manager = new LogisticsManager();
    const source = makeColony('a');
    const target = makeColony('b');

    expect(manager.createRoute(source, target, 1, TECHS).allowed).toBe(true);
    const duplicate = manager.createRoute(source, target, 1, TECHS);
    expect(duplicate.allowed).toBe(false);
    expect(duplicate.reason).toContain('bereits eine Route');
  });

  it('removes and toggles routes', () => {
    const manager = new LogisticsManager();
    const route = manager.createRoute(makeColony('a'), makeColony('b'), 1, TECHS).route!;

    expect(manager.setRouteActive(route.id, false)).toBe(true);
    expect(manager.getRoute(route.id)?.isActive).toBe(false);
    expect(manager.setRouteActive('missing', true)).toBe(false);
    expect(manager.removeRoute(route.id)).toBe(true);
    expect(manager.removeRoute(route.id)).toBe(false);
    expect(manager.getRoutes()).toHaveLength(0);
  });

  it('moves goods from surplus to deficit up to capacity', () => {
    const manager = new LogisticsManager();
    const source = makeColony('a', {
      stockpile: { food: 300, minerals: 300, rareResources: 100, energyBalance: 0, influence: 0 },
    });
    const target = makeColony('b', {
      stockpile: { food: 0, minerals: 0, rareResources: 0, energyBalance: 0, influence: 0 },
    });
    const route = manager.createRoute(source, target, 1, TECHS).route!;

    const summaries = manager.advanceTurn([source, target]);

    expect(summaries).toHaveLength(1);
    const summary = summaries[0];
    expect(summary.routeId).toBe(route.id);
    expect(summary.totalTransferred).toBe(route.capacityPerTurn);
    expect(summary.transferred.food).toBeGreaterThan(0);
    expect(source.stockpile.food + source.stockpile.minerals + source.stockpile.rareResources).toBeLessThan(700);
    expect(target.stockpile.food + target.stockpile.minerals + target.stockpile.rareResources).toBe(
      route.capacityPerTurn,
    );
  });

  it('never drains the source below its reserve and never overfills the target', () => {
    const manager = new LogisticsManager();
    const source = makeColony('a', {
      stockpile: {
        food: LOGISTICS_RESERVE.food + 10,
        minerals: LOGISTICS_RESERVE.minerals,
        rareResources: 0,
        energyBalance: 0,
        influence: 0,
      },
    });
    const target = makeColony('b', {
      stockpile: {
        food: LOGISTICS_TARGET_STOCK.food - 10,
        minerals: 0,
        rareResources: 0,
        energyBalance: 0,
        influence: 0,
      },
    });
    manager.createRoute(source, target, MAX_FREIGHTERS_PER_ROUTE, TECHS);

    manager.advanceTurn([source, target]);

    expect(source.stockpile.food).toBe(LOGISTICS_RESERVE.food);
    expect(target.stockpile.food).toBe(LOGISTICS_TARGET_STOCK.food);
    expect(target.stockpile.minerals).toBe(0);
  });

  it('skips inactive routes and unknown colonies', () => {
    const manager = new LogisticsManager();
    const source = makeColony('a', {
      stockpile: { food: 300, minerals: 300, rareResources: 100, energyBalance: 0, influence: 0 },
    });
    const target = makeColony('b', {
      stockpile: { food: 0, minerals: 0, rareResources: 0, energyBalance: 0, influence: 0 },
    });
    const route = manager.createRoute(source, target, 2, TECHS).route!;

    manager.setRouteActive(route.id, false);
    expect(manager.advanceTurn([source, target])).toHaveLength(0);
    expect(target.stockpile.food).toBe(0);

    manager.setRouteActive(route.id, true);
    expect(manager.advanceTurn([source])).toHaveLength(0);
  });

  it('round-trips routes through load and clear', () => {
    const manager = new LogisticsManager();
    const route = manager.createRoute(makeColony('a'), makeColony('b'), 2, TECHS).route!;

    const restored = new LogisticsManager();
    restored.loadRoutes(manager.getRoutes());
    expect(restored.getRoute(route.id)).toEqual(route);

    restored.clear();
    expect(restored.getRoutes()).toHaveLength(0);
  });
});

describe('LogisticsManager freighter fleets', () => {
  const surplus = () => ({
    stockpile: { food: 300, minerals: 300, rareResources: 100, energyBalance: 0, influence: 0 },
  });
  const empty = () => ({
    stockpile: { food: 0, minerals: 0, rareResources: 0, energyBalance: 0, influence: 0 },
  });

  it('splits a route into deterministic individual freighters', () => {
    const manager = new LogisticsManager();
    manager.createRoute(makeColony('a'), makeColony('b'), 3, TECHS);

    const fleets = manager.getFleets();
    expect(fleets).toHaveLength(3);
    expect(fleets.map((fleet) => fleet.id)).toEqual([
      'fleet_route_a_b_1',
      'fleet_route_a_b_2',
      'fleet_route_a_b_3',
    ]);
    for (const fleet of fleets) {
      expect(fleet.routeId).toBe('route_a_b');
      expect(fleet.sourceColonyId).toBe('a');
      expect(fleet.targetColonyId).toBe('b');
      expect(fleet.status).toBe('loading');
      expect(fleet.progress).toBe(0);
      expect(fleet.travelTurns).toBe(DEFAULT_TRAVEL_TURNS);
      expect(fleet.maxCapacity).toBe(FREIGHTER_CAPACITY);
      expect(fleet.cargo).toEqual({ food: 0, minerals: 0, rareResources: 0 });
    }
  });

  it('clamps travel times supplied by the resolver', () => {
    const source = makeColony('a');
    const target = makeColony('b');

    const fast = new LogisticsManager(undefined, () => 0);
    fast.createRoute(source, target, 1, TECHS);
    expect(fast.getFleets()[0].travelTurns).toBe(1);

    const slow = new LogisticsManager(undefined, () => 999);
    slow.createRoute(source, target, 1, TECHS);
    expect(slow.getFleets()[0].travelTurns).toBe(MAX_TRAVEL_TURNS);

    const broken = new LogisticsManager(undefined, () => Number.NaN);
    broken.createRoute(source, target, 1, TECHS);
    expect(broken.getFleets()[0].travelTurns).toBe(DEFAULT_TRAVEL_TURNS);
  });

  it('spends multiple turns in transit before delivering', () => {
    const source = makeColony('a', surplus());
    const target = makeColony('b', empty());
    const manager = new LogisticsManager(undefined, () => 2);
    const route = manager.createRoute(source, target, 1, TECHS).route!;

    expect(manager.getFleets()[0].travelTurns).toBe(2);
    expect(manager.advanceTurn([source, target])).toHaveLength(0);
    expect(target.stockpile.food).toBe(0);
    expect(source.stockpile.food).toBe(300 - FREIGHTER_CAPACITY);

    const departed = manager.getFleets()[0];
    expect(departed.status).toBe('outbound');
    expect(departed.progress).toBe(1);
    expect(departed.cargo.food).toBe(FREIGHTER_CAPACITY);

    const summaries = manager.advanceTurn([source, target]);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].routeId).toBe(route.id);
    expect(summaries[0].totalTransferred).toBe(FREIGHTER_CAPACITY);
    expect(target.stockpile.food).toBe(FREIGHTER_CAPACITY);

    const arrived = manager.getFleets()[0];
    expect(arrived.status).toBe('inbound');
    expect(arrived.cargo.food).toBe(0);
  });

  it('accounts for cargo already in transit when loading', () => {
    const source = makeColony('a', surplus());
    const target = makeColony('b', {
      stockpile: {
        food: LOGISTICS_TARGET_STOCK.food - 20,
        minerals: LOGISTICS_TARGET_STOCK.minerals,
        rareResources: LOGISTICS_TARGET_STOCK.rareResources,
        energyBalance: 0,
        influence: 0,
      },
    });
    const manager = new LogisticsManager(undefined, () => 2);
    manager.createRoute(source, target, 3, TECHS);

    expect(manager.advanceTurn([source, target])).toHaveLength(0);

    const fleets = manager.getFleets();
    expect(fleets.filter((fleet) => fleet.status === 'outbound')).toHaveLength(2);
    expect(fleets.filter((fleet) => fleet.status === 'loading')).toHaveLength(1);
    expect(fleets.reduce((sum, fleet) => sum + fleet.cargo.food, 0)).toBe(20);
    expect(target.stockpile.food).toBe(LOGISTICS_TARGET_STOCK.food - 20);

    const summaries = manager.advanceTurn([source, target]);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].totalTransferred).toBe(20);
    expect(target.stockpile.food).toBe(LOGISTICS_TARGET_STOCK.food);
  });

  it('aggregates the deliveries of several freighters into one summary', () => {
    const source = makeColony('a', surplus());
    const target = makeColony('b', empty());
    const manager = new LogisticsManager();
    const route = manager.createRoute(source, target, 3, TECHS).route!;

    const summaries = manager.advanceTurn([source, target]);

    expect(summaries).toHaveLength(1);
    expect(summaries[0].routeId).toBe(route.id);
    expect(summaries[0].totalTransferred).toBe(3 * FREIGHTER_CAPACITY);
    expect(target.stockpile.food).toBe(3 * FREIGHTER_CAPACITY);
  });

  it('round-trips in-flight fleets through loadFleets', () => {
    const source = makeColony('a', surplus());
    const target = makeColony('b', empty());
    const manager = new LogisticsManager(undefined, () => 2);
    manager.createRoute(source, target, 2, TECHS);
    manager.advanceTurn([source, target]);

    const snapshot = JSON.parse(JSON.stringify(manager.getFleets()));
    const restored = new LogisticsManager(undefined, () => 2);
    restored.loadRoutes(manager.getRoutes());
    restored.loadFleets(snapshot);

    expect(restored.getFleets()).toEqual(snapshot);
    const summaries = restored.advanceTurn([source, target]);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].totalTransferred).toBe(2 * FREIGHTER_CAPACITY);
  });

  it('removes the fleets of a removed route', () => {
    const manager = new LogisticsManager();
    const route = manager.createRoute(makeColony('a'), makeColony('b'), 2, TECHS).route!;
    expect(manager.getFleets()).toHaveLength(2);

    expect(manager.removeRoute(route.id)).toBe(true);
    expect(manager.getFleets()).toHaveLength(0);
    expect(manager.getFleetsForRoute(route.id)).toHaveLength(0);
  });

  it('emits departure and arrival events', () => {
    const emit = vi.fn();
    const manager = new LogisticsManager({ emit } as never);
    manager.createRoute(makeColony('a', surplus()), makeColony('b', empty()), 1, TECHS);

    manager.advanceTurn([makeColony('a', surplus()), makeColony('b', empty())]);

    const names = emit.mock.calls.map(([name]) => name);
    expect(names).toContain('logistics:fleet-departed');
    expect(names).toContain('logistics:fleet-arrived');
  });
});
