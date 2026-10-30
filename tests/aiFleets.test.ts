/**
 * Astraea 4X - KI-Flotten-Tests (Stage B2)
 * Prueft Werftbau der KI (Technologie-Gate, Docklimit, Musterprioritaet) und
 * den Patrouillenzyklus stationierter Flotten zwischen eigenen Koloniesystemen.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/EventBus.ts';
import {
  FleetManager,
  SHIPYARD_MAX_SLIPS,
  getShipyardCapacity,
} from '../src/core/fleetManager.ts';
import { GameEngine } from '../src/core/GameEngine.ts';
import { SHIP_CATALOG } from '../src/data/shipCatalog.ts';
import {
  Colony,
  ColonyStockpile,
  Fleet,
  Galaxy,
  ResourceYields,
  StarSystem,
} from '../src/core/types.ts';

const AI_CIV = 'civ-ai';
const AI_TECHS = ['automated_assembly', 'advanced_metallurgy'];
const AI_TEST_CONFIG = {
  size: 'medium' as const,
  systemCount: 40,
  width: 900,
  height: 900,
  minDistance: 45,
  shape: 'spiral' as const,
  seed: 'AI-FLEET-SEED',
};

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
    civId: AI_CIV,
    factionId: 'faction-ai',
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
    id: 'galaxy-ai-test',
    name: 'KI-Testgalaxie',
    seed: 'seed',
    createdAt: 0,
    config: { size: 'small', systemCount: systems.length, width: 100, height: 100 },
    systems,
  } as Galaxy;
}

const GALAXY = makeGalaxy({
  'sys-01': ['sys-02'],
  'sys-02': ['sys-01'],
});

function makeFleet(overrides: Partial<Fleet> = {}): Fleet {
  return {
    id: 'fleet-ai-1',
    name: 'Flotte sys-01',
    civId: AI_CIV,
    systemId: 'sys-01',
    ships: [{ shipDefId: 'corvette', count: 1 }],
    status: 'stationed',
    pathSystemIds: [],
    pathIndex: 0,
    destinationSystemId: null,
    ...overrides,
  };
}

describe('Astraea 4X - KI-Flotten (Stage B2)', () => {
  let bus: EventBus;
  let manager: FleetManager;

  beforeEach(() => {
    bus = EventBus.getInstance();
    bus.clear();
    manager = new FleetManager(bus, () => GALAXY);
  });

  it('1. baut das guenstigste freigeschaltete Muster und zieht Ressourcen ab', () => {
    const colony = makeColony('colony-a');
    const summary = manager.executeAiFleetTurn(AI_CIV, [colony], AI_TECHS, 5);

    expect(summary.queuedShipOrders).toBe(1);
    const orders = manager.getOrdersForColony(colony.id);
    expect(orders).toHaveLength(1);
    expect(orders[0].shipDefId).toBe('corvette');
    expect(orders[0].civId).toBe(AI_CIV);
    expect(orders[0].turnStarted).toBe(5);
    expect(colony.stockpile.minerals).toBe(200 - SHIP_CATALOG.corvette.mineralCost);
  });

  it('2. baut ohne erforschte Technologie keine Schiffe', () => {
    const colony = makeColony('colony-a');
    const summary = manager.executeAiFleetTurn(AI_CIV, [colony], ['automated_assembly'], 1);

    expect(summary.queuedShipOrders).toBe(0);
    expect(manager.getOrdersForColony(colony.id)).toHaveLength(0);
    expect(colony.stockpile.minerals).toBe(200);
  });

  it('3. belegt nie mehr Docks als die Werft besitzt', () => {
    const colony = makeColony('colony-a');
    expect(getShipyardCapacity(colony)).toBe(1);

    manager.executeAiFleetTurn(AI_CIV, [colony], AI_TECHS, 1);
    manager.executeAiFleetTurn(AI_CIV, [colony], AI_TECHS, 2);

    expect(manager.getOrdersForColony(colony.id)).toHaveLength(1);
  });

  it('4. nutzt mehrere Docks einer grossen Kolonie', () => {
    const population = 1000 + 2000 * (SHIPYARD_MAX_SLIPS - 1);
    const colony = makeColony('colony-a', { population });
    expect(getShipyardCapacity(colony)).toBe(SHIPYARD_MAX_SLIPS);

    const summary = manager.executeAiFleetTurn(AI_CIV, [colony], AI_TECHS, 1);
    expect(summary.queuedShipOrders).toBe(SHIPYARD_MAX_SLIPS);
    expect(manager.getOrdersForColony(colony.id)).toHaveLength(SHIPYARD_MAX_SLIPS);
  });

  it('5. patrouilliert reihum zwischen eigenen Koloniesystemen', () => {
    const colonies = [
      makeColony('colony-a', { systemId: 'sys-01' }),
      makeColony('colony-b', { systemId: 'sys-02' }),
    ];
    manager.loadFleets([makeFleet()]);

    const summary = manager.executeAiFleetTurn(AI_CIV, colonies, AI_TECHS, 3);
    const fleet = manager.getFleet('fleet-ai-1')!;

    expect(summary.movedFleetIds).toEqual(['fleet-ai-1']);
    expect(fleet.status).toBe('moving');
    expect(fleet.destinationSystemId).toBe('sys-02');
    expect(fleet.pathSystemIds).toEqual(['sys-01', 'sys-02']);
  });

  it('6. patrouilliert ohne zweites Koloniesystem nicht', () => {
    manager.loadFleets([makeFleet()]);
    const summary = manager.executeAiFleetTurn(AI_CIV, [makeColony('colony-a')], AI_TECHS, 1);

    expect(summary.movedFleetIds).toEqual([]);
    expect(manager.getFleet('fleet-ai-1')!.status).toBe('stationed');
  });

  it('7. laesst leere und fremde Flotten unangetastet', () => {
    const colonies = [
      makeColony('colony-a', { systemId: 'sys-01' }),
      makeColony('colony-b', { systemId: 'sys-02' }),
    ];
    manager.loadFleets([
      makeFleet({ id: 'fleet-empty', ships: [] }),
      makeFleet({ id: 'fleet-foreign', civId: 'civ-other' }),
    ]);

    const summary = manager.executeAiFleetTurn(AI_CIV, colonies, AI_TECHS, 1);
    expect(summary.movedFleetIds).toEqual([]);
    expect(manager.getFleet('fleet-empty')!.status).toBe('stationed');
    expect(manager.getFleet('fleet-foreign')!.status).toBe('stationed');
  });

  it('8. startet KI-Zivilisationen mit Werfttechnologien und baut im Spielzug', () => {
    const engine = GameEngine.getInstance();
    engine.generateNewGalaxy(AI_TEST_CONFIG);
    const aiCivs = engine.getCivManager().getCivilizations().filter((civ) => !civ.isPlayer);

    expect(aiCivs.length).toBeGreaterThan(0);
    for (const civ of aiCivs) {
      expect(civ.researchState.completedTechIds).toContain('automated_assembly');
      expect(civ.researchState.completedTechIds).toContain('advanced_metallurgy');
    }

    engine.endTurn();

    const orders = engine.getFleetManager().getOrders();
    expect(orders.length).toBeGreaterThan(0);
    for (const order of orders) {
      expect(AI_TECHS).toContain(SHIP_CATALOG[order.shipDefId].requiredTechId);
    }
  });
});
