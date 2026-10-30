/**
 * Astraea 4X - Wirtschaft Stufe B Test Suite
 * Credit-Wartung, Credit-Baukosten, Ausgabenlogik in endTurn und Save-Kompatibilität.
 */

import { describe, expect, it } from 'vitest';
import { GameEngine } from '../src/core/GameEngine.ts';
import { ColonyManager } from '../src/core/colonyManager.ts';
import { EconomyEngine } from '../src/core/economyEngine.ts';
import { BuildQueueManager } from '../src/core/buildQueueManager.ts';
import { EventBus } from '../src/core/EventBus.ts';
import { SurfaceGenerator } from '../src/surface/surfaceGenerator.ts';
import { Colony, Planet, StarSystem } from '../src/core/types.ts';
import { BUILDING_CATALOG } from '../src/data/buildingCatalog.ts';

function createMockPlanet(id: string = 'econ-b-planet-01'): Planet {
  return {
    id,
    name: 'Aurelia Prime',
    systemId: 'econ-b-sys-01',
    orbitIndex: 2,
    orbitDistanceAu: 1.1,
    orbitalPeriodDays: 365,
    currentAngleRad: 0,
    planetType: 'ocean',
    sizeClass: 16,
    surfaceTemperatureK: 292,
    temperatureCategory: 'temperate',
    atmosphere: 'breathable',
    waterAvailability: 'liquid_ocean',
    gravityG: 1.0,
    gravityCategory: 'standard',
    radiationHazard: 'negligible',
    geologicalStability: 'stable',
    habitability: 85,
    habitabilityTier: 'ideal',
    surveyStatus: 'analyzed',
    colonizationStatus: 'uncolonized',
    colonyId: null,
    color: '#38bdf8',
    accentColor: '#0284c7',
    texturePattern: 'oceans',
    moonsCount: 1,
  };
}

function createMockSystem(id: string = 'econ-b-sys-01'): StarSystem {
  return {
    id,
    name: 'Aurelia System',
    x: 50,
    y: 50,
    star: {
      id: 'star-econ-b-sys-01',
      name: 'Aurelia',
      spectralClass: 'G',
      color: '#facc15',
      glowColor: '#ca8a04',
      temperatureK: 5778,
      luminositySolar: 1.0,
      massSolar: 1.0,
      radiusKm: 696340,
    },
    planetCount: 1,
    planets: [createMockPlanet()],
    discoveryStatus: 'surveyed',
    ownerFactionId: null,
    hyperlanes: [],
    anomalyDetected: false,
  };
}

interface ColonyFixture {
  colony: Colony;
  surface: ReturnType<typeof SurfaceGenerator.generateSurface>;
}

function createColony(seed: string): ColonyFixture {
  const bus = EventBus.getInstance();
  const cm = new ColonyManager(bus);
  const planet = createMockPlanet();
  const system = createMockSystem();
  const surface = SurfaceGenerator.generateSurface(planet, seed);

  const res = cm.foundColony(planet, system, surface, 1, '2380.01', 'player-empire', 'Credit-Prime', {
    q: 4,
    r: 4,
  });
  expect(res.success).toBe(true);
  return { colony: res.colony!, surface };
}

/**
 * Gründet über die Engine eine Spielerkolonie im ersten System und liefert sie zurück.
 */
function foundPlayerColony(engine: GameEngine, seed: string): Colony {
  engine.generateNewGalaxy({ seed });
  const sys = engine.getGalaxy().systems[0];
  engine.selectSystem(sys.id);
  engine.surveySystem(sys.id);

  const planet = sys.planets.find((p) => p.planetType !== 'gas_giant') || sys.planets[0];
  planet.planetType = 'ocean';
  planet.surveyStatus = 'analyzed';
  planet.radiationHazard = 'negligible';
  planet.colonizationStatus = 'uncolonized';
  planet.colonyId = null;
  planet.surfaceTemperatureK = 292;
  planet.temperatureCategory = 'temperate';
  planet.atmosphere = 'breathable';
  planet.waterAvailability = 'liquid_ocean';
  planet.gravityG = 1;
  planet.gravityCategory = 'standard';
  planet.geologicalStability = 'stable';
  planet.habitability = 90;
  planet.habitabilityTier = 'ideal';

  const result = engine.foundColony(planet.id, 'Credit-Prime');
  expect(result.success).toBe(true);
  return result.colony!;
}

describe('Astraea 4X - Wirtschaft Stufe B', () => {
  it('1. Gebäudekatalog definiert Credit-Baukosten und Credit-Wartung je Stufe', () => {
    for (const bDef of Object.values(BUILDING_CATALOG)) {
      expect(typeof bDef.creditCost).toBe('number');
      expect(typeof bDef.creditUpkeepPerLevel).toBe('number');
      expect(bDef.creditCost!).toBeGreaterThanOrEqual(0);
      expect(bDef.creditUpkeepPerLevel!).toBeGreaterThanOrEqual(0);
    }

    expect(BUILDING_CATALOG['city_center'].creditCost).toBe(0);
    expect(BUILDING_CATALOG['city_center'].creditUpkeepPerLevel).toBe(0.2);
    expect(BUILDING_CATALOG['hydroponics_dome'].creditCost).toBe(30);
    expect(BUILDING_CATALOG['hydroponics_dome'].creditUpkeepPerLevel).toBe(0.3);
  });

  it('2. Credit-Wartung skaliert mit Gebäudestufe in calculateYields', () => {
    const { colony, surface } = createColony('ECON-B-SEED-02');
    const cityCenter = colony.buildings.find((b) => b.buildingDefId === 'city_center');
    expect(cityCenter).toBeDefined();
    cityCenter!.level = 3;

    const { upkeep } = EconomyEngine.calculateYields(colony, surface, 90);
    expect(upkeep.credits).toBeCloseTo(0.6, 10);
  });

  it('3. queueBuilding zieht Credit-Baukosten einmalig von der Staatskasse ab', () => {
    const { colony, surface } = createColony('ECON-B-SEED-03');
    colony.stockpile.minerals = 500;
    colony.stockpile.rareResources = 100;
    const treasury = { treasury: 100 };

    const hexCoord = BuildQueueManager.findAvailableBuildCoord(colony, surface, 'hydroponics_dome');
    expect(hexCoord).not.toBeNull();

    const res = BuildQueueManager.queueBuilding(
      colony,
      'hydroponics_dome',
      hexCoord!,
      surface,
      1,
      treasury
    );

    expect(res.success).toBe(true);
    expect(treasury.treasury).toBe(70);
    expect(colony.buildQueue[0].creditCost).toBe(30);
  });

  it('4. queueBuilding ohne Treasury-Holder belastet keine Credits (Abwärtskompatibilität)', () => {
    const { colony, surface } = createColony('ECON-B-SEED-04');
    colony.stockpile.minerals = 500;
    colony.stockpile.rareResources = 100;

    const hexCoord = BuildQueueManager.findAvailableBuildCoord(colony, surface, 'hydroponics_dome');
    expect(hexCoord).not.toBeNull();

    const res = BuildQueueManager.queueBuilding(colony, 'hydroponics_dome', hexCoord!, surface, 1);
    expect(res.success).toBe(true);
    expect(colony.buildQueue[0].creditCost).toBe(30);
  });

  it('5. queueBuilding verweigert bei zu kleiner Staatskasse ohne Materialabzug', () => {
    const { colony, surface } = createColony('ECON-B-SEED-03');
    colony.stockpile.minerals = 500;
    colony.stockpile.rareResources = 100;
    const treasury = { treasury: 10 };
    const mineralsBefore = colony.stockpile.minerals;

    const hexCoord = BuildQueueManager.findAvailableBuildCoord(colony, surface, 'hydroponics_dome');
    expect(hexCoord).not.toBeNull();

    const res = BuildQueueManager.queueBuilding(
      colony,
      'hydroponics_dome',
      hexCoord!,
      surface,
      1,
      treasury
    );

    expect(res.success).toBe(false);
    expect(res.reason).toContain('Nicht genügend Credits');
    expect(treasury.treasury).toBe(10);
    expect(colony.stockpile.minerals).toBe(mineralsBefore);
    expect(colony.buildQueue.length).toBe(0);
  });

  it('6. queueUpgrade berechnet Credit-Kosten aus 75 % Basiskosten × Zielstufe', () => {
    const { colony } = createColony('ECON-B-SEED-06');
    colony.stockpile.minerals = 500;
    colony.stockpile.rareResources = 100;

    const instance = {
      id: 'binst-test-farm',
      colonyId: colony.id,
      buildingDefId: 'hydroponics_dome',
      level: 1,
      hexCoord: { q: 4, r: 4 },
      isActive: true,
    };
    colony.buildings.push(instance);

    const treasury = { treasury: 100 };
    const res = BuildQueueManager.queueUpgrade(colony, instance.id, 2, treasury);

    expect(res.success).toBe(true);
    // round(30 * 0.75 * 2) = 45
    expect(treasury.treasury).toBe(55);
    expect(colony.buildQueue[0].creditCost).toBe(45);
  });

  it('7. endTurn verrechnet Einnahmen und Wartung und lässt die Staatskasse nicht negativ werden', () => {
    const engine = GameEngine.getInstance();
    const colony = foundPlayerColony(engine, 'ECON-B-SEED-07');
    const civ = engine.getPlayerCiv()!;

    // Stadzentrum Stufe 1: Wartung 0,2 Cr; Einnahmen bei 1.000 Bewohnern = 1,2 Cr;
    // Privatsektor (Außenposten, Zufriedenheit 50): Handelssteuer 0,4 Cr.
    civ.treasury = 0;
    engine.endTurn();
    expect(civ.treasury).toBeCloseTo(1.4, 5);

    // Deutlich höhere Wartung als Einnahmen: Untergrenze bleibt 0.
    civ.treasury = 0;
    const cityCenter = colony.buildings.find((b) => b.buildingDefId === 'city_center')!;
    cityCenter.level = 50;
    engine.endTurn();
    expect(civ.treasury).toBe(0);
  });

  it('8. Credit-Wartung überlebt Save-/Ladevorgang (Save-Version bleibt 4)', () => {
    const { colony, surface } = createColony('ECON-B-SEED-08');
    const cityCenter = colony.buildings.find((b) => b.buildingDefId === 'city_center')!;
    cityCenter.level = 2;
    EconomyEngine.simulateTurnEconomy(colony, surface, 90);

    const reloaded = JSON.parse(JSON.stringify(colony)) as Colony;
    expect(reloaded.upkeep.credits).toBe(0.4);
    expect(reloaded.buildQueue).toEqual([]);
  });
});
