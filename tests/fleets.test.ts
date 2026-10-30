/**
 * Astraea 4X - Fleet Test Suite (Phase 4)
 * Verifies the shipyard gate (colony tier, technology, stockpile), upfront
 * resource costs, half-production construction, deterministic identifiers,
 * hyperlane movement across turns, fleet merging, persistence helpers and the
 * emitted fleet events.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../src/core/EventBus.ts';
import {
  BATTLE_REPORT_LIMIT,
  FleetManager,
  MAX_COMBAT_ROUNDS,
  SHIPYARD_MAX_SLIPS,
  SHIPYARD_POPULATION_PER_SLIP,
  SHIPYARD_PRODUCTION_SHARE,
  getShipyardCapacity,
} from '../src/core/fleetManager.ts';
import { SHIP_CATALOG } from '../src/data/shipCatalog.ts';
import {
  Colony,
  ColonyStockpile,
  Fleet,
  FleetBattleReport,
  FleetShipStack,
  Galaxy,
  ResourceYields,
  ShipBuildOrder,
  StarSystem,
} from '../src/core/types.ts';

const PLAYER_CIV = 'civ-player';

function makeYields(production: number): ResourceYields {
  return {
    food: 0,
    minerals: 0,
    rareResources: 0,
    production,
    energy: 0,
    research: 0,
    influence: 0,
  } as ResourceYields;
}

function makeStockpile(overrides: Partial<ColonyStockpile> = {}): ColonyStockpile {
  return {
    food: 40,
    minerals: 200,
    rareResources: 20,
    energyBalance: 10,
    influence: 0,
    ...overrides,
  } as ColonyStockpile;
}

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
    stockpile: makeStockpile(),
    netYields: makeYields(40),
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

// sys-01 -> sys-02 -> sys-03, with a second equal-length branch via sys-04.
const GALAXY = makeGalaxy({
  'sys-01': ['sys-02', 'sys-04'],
  'sys-02': ['sys-03'],
  'sys-03': [],
  'sys-04': ['sys-03'],
});

const bus = EventBus.getInstance();

function makeManager(): FleetManager {
  return new FleetManager(bus, () => GALAXY);
}

describe('FleetManager', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes the ship catalog with technology gates', () => {
    expect(Object.keys(SHIP_CATALOG)).toEqual(['corvette', 'destroyer', 'cruiser']);
    expect(SHIP_CATALOG.corvette.requiredTechId).toBe('advanced_metallurgy');
    expect(SHIP_CATALOG.destroyer.requiredTechId).toBe('fusion_reactors');
    expect(SHIP_CATALOG.cruiser.requiredTechId).toBe('gravitic_engineering');
  });

  it('requires colony tier and researched technology', () => {
    const manager = makeManager();
    const outpost = makeColony('a', { developmentTier: 'outpost' });

    const wrongTier = manager.canBuildShip(outpost, 'corvette', ['advanced_metallurgy']);
    expect(wrongTier.allowed).toBe(false);
    expect(wrongTier.reason).toContain('Werft');

    const colony = makeColony('a');
    const noTech = manager.canBuildShip(colony, 'corvette', []);
    expect(noTech.allowed).toBe(false);
    expect(noTech.reason).toContain('advanced_metallurgy');

    const ok = manager.canBuildShip(colony, 'corvette', ['advanced_metallurgy']);
    expect(ok.allowed).toBe(true);
  });

  it('rejects an unknown ship class and insufficient stockpile', () => {
    const manager = makeManager();
    const colony = makeColony('a');

    expect(manager.canBuildShip(colony, 'dreadnought', ['advanced_metallurgy']).allowed).toBe(false);

    const poor = makeColony('b', { stockpile: makeStockpile({ minerals: 0 }) });
    const noMinerals = manager.canBuildShip(poor, 'corvette', ['advanced_metallurgy']);
    expect(noMinerals.allowed).toBe(false);
    expect(noMinerals.reason).toContain('Mineralien');

    const rareStarved = makeColony('c', {
      stockpile: makeStockpile({ rareResources: 0 }),
    });
    const noRare = manager.canBuildShip(rareStarved, 'destroyer', ['fusion_reactors']);
    expect(noRare.allowed).toBe(false);
    expect(noRare.reason).toContain('seltene');
  });

  it('deducts resources up front and records a deterministic order', () => {
    const manager = makeManager();
    const colony = makeColony('a');

    const result = manager.queueShipBuild(colony, 'destroyer', ['fusion_reactors'], 3);
    expect(result.allowed).toBe(true);
    expect(result.order?.id).toBe('ship_order_a_destroyer_1');
    expect(result.order?.requiredProduction).toBe(SHIP_CATALOG.destroyer.productionCost);
    expect(result.order?.investedProduction).toBe(0);
    expect(result.order?.turnStarted).toBe(3);
    expect(colony.stockpile.minerals).toBe(200 - SHIP_CATALOG.destroyer.mineralCost);
    expect(colony.stockpile.rareResources).toBe(20 - SHIP_CATALOG.destroyer.rareCost);
    expect(manager.getOrdersForColony('a')).toHaveLength(1);
  });

  it('accumulates half of colony production per turn and completes a ship', () => {
    const manager = makeManager();
    const colony = makeColony('a');
    const events: string[] = [];
    bus.on('fleet:created', () => events.push('created'));
    bus.on('fleet:ship-built', () => events.push('built'));

    manager.queueShipBuild(colony, 'corvette', ['advanced_metallurgy'], 1);

    const perTurn = Math.max(
      1,
      Math.floor(colony.netYields.production * SHIPYARD_PRODUCTION_SHARE),
    );
    expect(perTurn).toBe(SHIP_CATALOG.corvette.productionCost / 2);

    manager.advanceTurn([colony]);
    expect(manager.getOrdersForColony('a')).toHaveLength(1);
    expect(manager.getOrdersForColony('a')[0].investedProduction).toBe(perTurn);

    const summary = manager.advanceTurn([colony]);
    expect(summary.completedShipOrders).toBe(1);
    expect(manager.getOrdersForColony('a')).toHaveLength(0);

    const fleets = manager.getFleetsForCiv(PLAYER_CIV);
    expect(fleets).toHaveLength(1);
    expect(fleets[0].systemId).toBe('sys-01');
    expect(fleets[0].status).toBe('stationed');
    expect(fleets[0].name).toBe('Flotte sys-01');
    expect(fleets[0].ships).toEqual([{ shipDefId: 'corvette', count: 1 }]);
    expect(events).toEqual(['created', 'built']);
  });

  it('merges additional ships into the stationed fleet and reports strength', () => {
    const manager = makeManager();
    const colony = makeColony('a');

    manager.queueShipBuild(colony, 'corvette', ['advanced_metallurgy'], 1);
    manager.advanceTurn([colony]);
    manager.advanceTurn([colony]);

    manager.queueShipBuild(colony, 'corvette', ['advanced_metallurgy'], 3);
    manager.advanceTurn([colony]);
    manager.advanceTurn([colony]);

    const fleets = manager.getFleetsInSystem('sys-01');
    expect(fleets).toHaveLength(1);
    expect(fleets[0].ships).toEqual([{ shipDefId: 'corvette', count: 2 }]);

    const strength = manager.getFleetStrength(fleets[0]);
    expect(strength.hull).toBe(SHIP_CATALOG.corvette.hull * 2);
    expect(strength.attack).toBe(SHIP_CATALOG.corvette.attack * 2);
  });

  it('advances only the oldest order per colony while one dock is available', () => {
    const manager = makeManager();
    const colony = makeColony('a');

    manager.queueShipBuild(colony, 'corvette', ['advanced_metallurgy'], 1);
    manager.queueShipBuild(colony, 'corvette', ['advanced_metallurgy'], 1);
    manager.advanceTurn([colony]);

    const orders = manager.getOrdersForColony('a');
    expect(orders).toHaveLength(2);
    expect(orders[0].investedProduction).toBe(20);
    expect(orders[1].investedProduction).toBe(0);
  });

  it('finds deterministic shortest hyperlane paths', () => {
    const manager = makeManager();

    expect(manager.findPath('sys-01', 'sys-03')).toEqual(['sys-01', 'sys-02', 'sys-03']);
    expect(manager.findPath('sys-03', 'sys-01')).toEqual(['sys-03', 'sys-02', 'sys-01']);
    expect(manager.findPath('sys-01', 'sys-01')).toEqual(['sys-01']);
    expect(manager.findPath('sys-01', 'sys-99')).toBeNull();
  });

  it('moves a fleet one hyperlane hop per turn and reports arrival', () => {
    const manager = makeManager();
    const colony = makeColony('a');
    manager.queueShipBuild(colony, 'corvette', ['advanced_metallurgy'], 1);
    manager.advanceTurn([colony]);
    manager.advanceTurn([colony]);

    const fleet = manager.getFleets()[0];
    const started: string[] = [];
    const arrived: string[] = [];
    bus.on('fleet:movement-started', ({ pathSystemIds }) => started.push(pathSystemIds.join('>')));
    bus.on('fleet:arrived', ({ fleet: arrivedFleet }) => arrived.push(arrivedFleet.systemId));

    const move = manager.commandMoveFleet(fleet.id, 'sys-03');
    expect(move.allowed).toBe(true);
    expect(move.pathSystemIds).toEqual(['sys-01', 'sys-02', 'sys-03']);
    expect(manager.getFleet(fleet.id)?.status).toBe('moving');

    manager.advanceTurn([colony]);
    expect(manager.getFleet(fleet.id)?.systemId).toBe('sys-02');
    expect(manager.getFleet(fleet.id)?.status).toBe('moving');

    const summary = manager.advanceTurn([colony]);
    expect(manager.getFleet(fleet.id)?.systemId).toBe('sys-03');
    expect(manager.getFleet(fleet.id)?.status).toBe('stationed');
    expect(manager.getFleet(fleet.id)?.destinationSystemId).toBeNull();
    expect(summary.arrivedFleetIds).toContain(fleet.id);
    expect(started).toEqual(['sys-01>sys-02>sys-03']);
    expect(arrived).toEqual(['sys-03']);
  });

  it('rejects invalid fleet movement', () => {
    const manager = makeManager();
    const colony = makeColony('a');
    manager.queueShipBuild(colony, 'corvette', ['advanced_metallurgy'], 1);
    manager.advanceTurn([colony]);
    manager.advanceTurn([colony]);
    const fleet = manager.getFleets()[0];

    expect(manager.commandMoveFleet('missing', 'sys-02').allowed).toBe(false);
    expect(manager.commandMoveFleet(fleet.id, 'sys-01').reason).toContain('bereits im Zielsystem');
    expect(manager.commandMoveFleet(fleet.id, 'sys-99').reason).toContain('Zielsystem');

    const isolated = makeGalaxy({ 'sys-01': [], 'sys-05': [] });
    const isolatedManager = new FleetManager(bus, () => isolated);
    const isolatedFleet = isolatedManager.ensureFleetAt(PLAYER_CIV, 'sys-01');
    const blocked = isolatedManager.commandMoveFleet(isolatedFleet.id, 'sys-05');
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toContain('Hyperlane');
  });

  it('rejects a second move order while the fleet is in flight', () => {
    const manager = makeManager();
    const colony = makeColony('a');
    manager.queueShipBuild(colony, 'corvette', ['advanced_metallurgy'], 1);
    manager.advanceTurn([colony]);
    manager.advanceTurn([colony]);
    const fleet = manager.getFleets()[0];

    expect(manager.commandMoveFleet(fleet.id, 'sys-03').allowed).toBe(true);
    const second = manager.commandMoveFleet(fleet.id, 'sys-03');
    expect(second.allowed).toBe(false);
    expect(second.reason).toContain('im Flug');
  });

  it('loads, clones and clears fleets and orders', () => {
    const manager = makeManager();
    const fleet = manager.ensureFleetAt(PLAYER_CIV, 'sys-01');
    const incoming: Fleet = {
      ...fleet,
      ships: [{ shipDefId: 'corvette', count: 3 }],
      pathSystemIds: ['sys-01', 'sys-02'],
    };
    manager.loadFleets([incoming]);
    const incomingOrders: ShipBuildOrder[] = [
      {
        id: 'order-x',
        colonyId: 'a',
        civId: PLAYER_CIV,
        shipDefId: 'corvette',
        investedProduction: 5,
        requiredProduction: 40,
        turnStarted: 2,
      },
    ];
    manager.loadOrders(incomingOrders);

    const loaded = manager.getFleet(fleet.id);
    expect(loaded?.ships).toEqual([{ shipDefId: 'corvette', count: 3 }]);
    expect(loaded).not.toBe(incoming);

    incoming.ships[0].count = 99;
    incoming.pathSystemIds.push('sys-03');
    expect(manager.getFleet(fleet.id)?.ships[0].count).toBe(3);
    expect(manager.getFleet(fleet.id)?.pathSystemIds).toEqual(['sys-01', 'sys-02']);

    incomingOrders[0].investedProduction = 100;
    expect(manager.getOrdersForColony('a')[0].investedProduction).toBe(5);

    manager.clear();
    expect(manager.getFleets()).toHaveLength(0);
    expect(manager.getOrders()).toHaveLength(0);
  });

  it('creates deterministic fleet and order identifiers without collisions', () => {
    const manager = makeManager();
    const colony = makeColony('a');

    const first = manager.queueShipBuild(colony, 'corvette', ['advanced_metallurgy'], 1);
    const second = manager.queueShipBuild(colony, 'corvette', ['advanced_metallurgy'], 1);
    expect(first.order?.id).not.toBe(second.order?.id);

    const alpha = manager.ensureFleetAt(PLAYER_CIV, 'sys-01');
    const beta = manager.ensureFleetAt('civ-other', 'sys-01');
    expect(alpha.id).not.toBe(beta.id);
    expect(manager.getFleetsInSystem('sys-01')).toHaveLength(2);
  });
});

describe('FleetManager shipyard capacity', () => {
  it('derives parallel docks from population for active colonies', () => {
    expect(getShipyardCapacity(null)).toBe(0);
    expect(getShipyardCapacity(makeColony('a', { developmentTier: 'settlement' }))).toBe(0);
    expect(getShipyardCapacity(makeColony('a', { status: 'abandoned' }))).toBe(0);

    expect(getShipyardCapacity(makeColony('a', { population: 1000 }))).toBe(1);
    expect(
      getShipyardCapacity(makeColony('a', { population: 1000 + SHIPYARD_POPULATION_PER_SLIP })),
    ).toBe(2);
    expect(
      getShipyardCapacity(makeColony('a', { population: 1000 + SHIPYARD_POPULATION_PER_SLIP * 2 })),
    ).toBe(3);
    expect(getShipyardCapacity(makeColony('a', { population: 50000 }))).toBe(SHIPYARD_MAX_SLIPS);
  });

  it('advances up to one order per dock and lets the rest wait', () => {
    const manager = makeManager();
    const colony = makeColony('a', { population: 3000 });

    manager.queueShipBuild(colony, 'corvette', ['advanced_metallurgy'], 1);
    manager.queueShipBuild(colony, 'corvette', ['advanced_metallurgy'], 1);
    manager.queueShipBuild(colony, 'corvette', ['advanced_metallurgy'], 1);
    manager.advanceTurn([colony]);

    const orders = manager.getOrdersForColony('a');
    expect(orders).toHaveLength(3);
    expect(orders[0].investedProduction).toBe(20);
    expect(orders[1].investedProduction).toBe(20);
    expect(orders[2].investedProduction).toBe(0);
  });

  it('releases a dock to the next waiting order after cancellation', () => {
    const manager = makeManager();
    const colony = makeColony('a', { population: 3000 });

    const first = manager.queueShipBuild(colony, 'corvette', ['advanced_metallurgy'], 1);
    const second = manager.queueShipBuild(colony, 'corvette', ['advanced_metallurgy'], 1);
    const third = manager.queueShipBuild(colony, 'corvette', ['advanced_metallurgy'], 1);

    manager.advanceTurn([colony]);
    expect(manager.getOrdersForColony('a')[2].investedProduction).toBe(0);

    expect(manager.cancelShipBuild(first.order!.id)).toBe(true);
    expect(manager.cancelShipBuild(second.order!.id)).toBe(true);
    manager.advanceTurn([colony]);

    const orders = manager.getOrdersForColony('a');
    expect(orders).toHaveLength(1);
    expect(orders[0].id).toBe(third.order!.id);
    expect(orders[0].investedProduction).toBe(20);
  });

  it('never advances orders of an abandoned colony', () => {
    const manager = makeManager();
    const colony = makeColony('a', { population: 9000 });

    manager.queueShipBuild(colony, 'corvette', ['advanced_metallurgy'], 1);
    manager.advanceTurn([makeColony('a', { population: 9000, status: 'abandoned' })]);

    expect(manager.getOrdersForColony('a')[0].investedProduction).toBe(0);
  });
});

describe('FleetManager ship upkeep', () => {
  it('defines positive energy upkeep for every ship class', () => {
    for (const def of Object.values(SHIP_CATALOG)) {
      expect(def.energyUpkeep).toBeGreaterThan(0);
    }
  });

  it('sums fleet upkeep across stacks and ignores unknown ship ids', () => {
    const manager = makeManager();
    manager.loadFleets([
      {
        id: 'fleet-upkeep',
        name: 'Testflotte',
        civId: PLAYER_CIV,
        systemId: 'sys-01',
        ships: [
          { shipDefId: 'corvette', count: 2 },
          { shipDefId: 'destroyer', count: 1 },
          { shipDefId: 'unknown_hull', count: 5 },
        ],
        status: 'stationed',
        pathSystemIds: ['sys-01'],
        pathIndex: 0,
        destinationSystemId: null,
      },
    ]);

    const fleet = manager.getFleet('fleet-upkeep')!;
    expect(FleetManager.calculateFleetUpkeep(fleet)).toBe(
      2 * SHIP_CATALOG.corvette.energyUpkeep + SHIP_CATALOG.destroyer.energyUpkeep
    );
  });

  it('splits upkeep evenly and assigns remainders by colony id', () => {
    const manager = makeManager();
    manager.loadFleets([
      {
        id: 'fleet-player',
        name: 'Spielerflotte',
        civId: PLAYER_CIV,
        systemId: 'sys-01',
        ships: [{ shipDefId: 'corvette', count: 3 }],
        status: 'stationed',
        pathSystemIds: ['sys-01'],
        pathIndex: 0,
        destinationSystemId: null,
      },
      {
        id: 'fleet-other',
        name: 'Fremdflotte',
        civId: 'civ-other',
        systemId: 'sys-02',
        ships: [{ shipDefId: 'cruiser', count: 1 }],
        status: 'stationed',
        pathSystemIds: ['sys-02'],
        pathIndex: 0,
        destinationSystemId: null,
      },
    ]);

    const colonies = [
      makeColony('colony-b'),
      makeColony('colony-a'),
      makeColony('colony-c', { civId: 'civ-other' }),
      makeColony('colony-inactive', { status: 'abandoned' }),
    ];
    const upkeep = manager.calculateUpkeepByColony(colonies);

    expect(upkeep.get('colony-a')).toBe(2);
    expect(upkeep.get('colony-b')).toBe(1);
    expect(upkeep.get('colony-c')).toBe(SHIP_CATALOG.cruiser.energyUpkeep);
    expect(upkeep.has('colony-inactive')).toBe(false);
    expect(manager.getUpkeepForCiv(PLAYER_CIV)).toBe(3);
  });
});

function makeFleet(
  id: string,
  civId: string,
  systemId: string,
  ships: FleetShipStack[],
  overrides: Partial<Fleet> = {},
): Fleet {
  return {
    id,
    name: `Flotte ${id}`,
    civId,
    systemId,
    ships,
    status: 'stationed',
    pathSystemIds: [systemId],
    pathIndex: 0,
    destinationSystemId: null,
    ...overrides,
  } as Fleet;
}

describe('FleetManager combat', () => {
  it('resolves a battle, applies losses and removes the defeated fleet', () => {
    const manager = makeManager();
    const battles: FleetBattleReport[] = [];
    const removed: string[] = [];
    const offBattle = bus.on('fleet:battle', ({ report }) => battles.push(report));
    const offRemoved = bus.on('fleet:removed', ({ fleetId }) => removed.push(fleetId));

    manager.loadFleets([
      makeFleet('fleet-alpha', 'civ-alpha', 'sys-01', [{ shipDefId: 'destroyer', count: 1 }]),
      makeFleet('fleet-beta', 'civ-beta', 'sys-01', [{ shipDefId: 'corvette', count: 1 }]),
    ]);

    manager.advanceTurn([], 7);

    expect(manager.getBattleReports()).toHaveLength(1);
    const report = manager.getBattleReports()[0];
    expect(report.turn).toBe(7);
    expect(report.systemId).toBe('sys-01');
    expect(report.winnerCivId).toBe('civ-alpha');
    expect(report.rounds).toBeLessThanOrEqual(MAX_COMBAT_ROUNDS);
    expect(report.sides[0]).toMatchObject({
      civId: 'civ-alpha',
      fleetIds: ['fleet-alpha'],
      shipsBefore: 1,
      shipsAfter: 1,
      losses: [],
    });
    expect(report.sides[1]).toMatchObject({
      civId: 'civ-beta',
      fleetIds: ['fleet-beta'],
      shipsBefore: 1,
      shipsAfter: 0,
      losses: [{ shipDefId: 'corvette', count: 1 }],
    });

    expect(manager.getFleet('fleet-beta')).toBeNull();
    expect(manager.getFleet('fleet-alpha')?.ships).toEqual([{ shipDefId: 'destroyer', count: 1 }]);
    expect(removed).toEqual(['fleet-beta']);
    expect(battles).toHaveLength(1);
    expect(battles[0].id).toBe(report.id);

    offBattle();
    offRemoved();
  });

  it('does not engage fleets of the same civilization or unknown hulls', () => {
    const manager = makeManager();
    manager.loadFleets([
      makeFleet('fleet-a1', 'civ-alpha', 'sys-01', [{ shipDefId: 'corvette', count: 1 }]),
      makeFleet('fleet-a2', 'civ-alpha', 'sys-01', [{ shipDefId: 'corvette', count: 1 }]),
      makeFleet('fleet-b1', 'civ-beta', 'sys-02', [{ shipDefId: 'unknown_hull', count: 4 }]),
      makeFleet('fleet-b2', 'civ-gamma', 'sys-02', [{ shipDefId: 'corvette', count: 1 }]),
    ]);

    manager.advanceTurn([], 1);

    expect(manager.getBattleReports()).toHaveLength(0);
    expect(manager.getFleets()).toHaveLength(4);
    expect(manager.getFleet('fleet-b1')?.ships).toEqual([{ shipDefId: 'unknown_hull', count: 4 }]);
  });

  it('removes both fleets on mutual destruction without a winner', () => {
    const manager = makeManager();
    manager.loadFleets([
      makeFleet('fleet-a', 'civ-alpha', 'sys-01', [{ shipDefId: 'corvette', count: 1 }]),
      makeFleet('fleet-b', 'civ-beta', 'sys-01', [{ shipDefId: 'corvette', count: 1 }]),
    ]);

    manager.advanceTurn([], 2);

    const report = manager.getBattleReports()[0];
    expect(report.winnerCivId).toBeNull();
    expect(report.sides.map((side) => side.shipsAfter)).toEqual([0, 0]);
    expect(manager.getFleets()).toHaveLength(0);
  });

  it('engages surviving civilizations one after another in civ id order', () => {
    const manager = makeManager();
    manager.loadFleets([
      makeFleet('fleet-c', 'civ-gamma', 'sys-01', [{ shipDefId: 'corvette', count: 1 }]),
      makeFleet('fleet-a', 'civ-alpha', 'sys-01', [{ shipDefId: 'destroyer', count: 1 }]),
      makeFleet('fleet-b', 'civ-beta', 'sys-01', [{ shipDefId: 'corvette', count: 1 }]),
    ]);

    manager.advanceTurn([], 3);

    const reports = manager.getBattleReports();
    expect(reports).toHaveLength(2);
    expect(reports[0].sides.map((side) => side.civId)).toEqual(['civ-alpha', 'civ-beta']);
    expect(reports[1].sides.map((side) => side.civId)).toEqual(['civ-alpha', 'civ-gamma']);
    expect(reports.every((report) => report.winnerCivId === 'civ-alpha')).toBe(true);
    expect(manager.getFleets()).toHaveLength(1);
  });

  it('caps retained reports and returns defensive copies', () => {
    const systemIds = Array.from({ length: BATTLE_REPORT_LIMIT + 5 }, (_, index) => `sys-${String(index).padStart(2, '0')}`);
    const links: Record<string, string[]> = {};
    for (const systemId of systemIds) {
      links[systemId] = [];
    }
    const galaxy = makeGalaxy(links);
    const manager = new FleetManager(bus, () => galaxy);

    const fleets: Fleet[] = [];
    for (const systemId of systemIds) {
      fleets.push(
        makeFleet(`fleet-${systemId}-a`, 'civ-alpha', systemId, [{ shipDefId: 'destroyer', count: 1 }]),
        makeFleet(`fleet-${systemId}-b`, 'civ-beta', systemId, [{ shipDefId: 'corvette', count: 1 }]),
      );
    }
    manager.loadFleets(fleets);

    manager.advanceTurn([], 4);
    expect(manager.getBattleReports()).toHaveLength(BATTLE_REPORT_LIMIT);

    const snapshot = manager.getBattleReports();
    snapshot[0].sides[0].losses.push({ shipDefId: 'corvette', count: 9 });
    snapshot[0].sides[0].fleetIds.push('fleet-injected');
    expect(manager.getBattleReports()[0].sides[0].losses).toEqual([]);
    expect(manager.getBattleReports()[0].sides[0].fleetIds).not.toContain('fleet-injected');

    manager.clear();
    expect(manager.getBattleReports()).toHaveLength(0);
  });
});

describe('FleetManager diplomacy gating', () => {
  it('keeps co-located fleets apart while their civilizations are at peace', () => {
    const manager = makeManager();
    manager.loadFleets([
      makeFleet('fleet-alpha', 'civ-alpha', 'sys-01', [{ shipDefId: 'destroyer', count: 1 }]),
      makeFleet('fleet-beta', 'civ-beta', 'sys-01', [{ shipDefId: 'corvette', count: 1 }]),
    ]);

    manager.advanceTurn([], 5, { isAtWar: () => false });

    expect(manager.getBattleReports()).toHaveLength(0);
    expect(manager.getFleets()).toHaveLength(2);
    expect(manager.getFleet('fleet-alpha')?.ships).toEqual([{ shipDefId: 'destroyer', count: 1 }]);
    expect(manager.getFleet('fleet-beta')?.ships).toEqual([{ shipDefId: 'corvette', count: 1 }]);
  });

  it('resolves a battle when the diplomacy lookup reports war', () => {
    const manager = makeManager();
    manager.loadFleets([
      makeFleet('fleet-alpha', 'civ-alpha', 'sys-01', [{ shipDefId: 'destroyer', count: 1 }]),
      makeFleet('fleet-beta', 'civ-beta', 'sys-01', [{ shipDefId: 'corvette', count: 1 }]),
    ]);

    manager.advanceTurn([], 5, { isAtWar: (left, right) => left === 'civ-alpha' && right === 'civ-beta' });

    expect(manager.getBattleReports()).toHaveLength(1);
    expect(manager.getBattleReports()[0].winnerCivId).toBe('civ-alpha');
    expect(manager.getFleet('fleet-beta')).toBeNull();
    expect(manager.getFleet('fleet-alpha')).not.toBeNull();
  });

  it('only engages the hostile pair while peaceful neighbours stay untouched', () => {
    const manager = makeManager();
    manager.loadFleets([
      makeFleet('fleet-alpha', 'civ-alpha', 'sys-01', [{ shipDefId: 'destroyer', count: 1 }]),
      makeFleet('fleet-beta', 'civ-beta', 'sys-01', [{ shipDefId: 'corvette', count: 1 }]),
      makeFleet('fleet-gamma', 'civ-gamma', 'sys-01', [{ shipDefId: 'corvette', count: 1 }]),
    ]);

    manager.advanceTurn([], 5, { isAtWar: (left, right) => left !== 'civ-gamma' && right !== 'civ-gamma' });

    expect(manager.getBattleReports()).toHaveLength(1);
    expect(manager.getBattleReports()[0].sides.map((side) => side.civId)).toEqual(['civ-alpha', 'civ-beta']);
    expect(manager.getFleet('fleet-gamma')?.ships).toEqual([{ shipDefId: 'corvette', count: 1 }]);
  });

  it('treats a missing lookup as all-hostile for backwards compatibility', () => {
    const manager = makeManager();
    manager.loadFleets([
      makeFleet('fleet-alpha', 'civ-alpha', 'sys-01', [{ shipDefId: 'destroyer', count: 1 }]),
      makeFleet('fleet-beta', 'civ-beta', 'sys-01', [{ shipDefId: 'corvette', count: 1 }]),
    ]);

    manager.advanceTurn([], 5, null);

    expect(manager.getBattleReports()).toHaveLength(1);
  });
});
