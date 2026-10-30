/**
 * Astraea 4X - Regressionstests: Aufwertung des Koloniezentrums
 *
 * Deckt die Ursache des früheren 0-Runden-Dauerhängers ab: Das Koloniezentrum
 * besitzt im Katalog `baseProductionCost: 0`. Solche Ausbauten werden jetzt
 * ausdrücklich sofort abgeschlossen; reguläre Gebäude laufen weiter über die
 * Bauwarteschlange. Zusätzlich werden Altbestände, Doppelaufträge, Kosten,
 * Save/Load und die GUI-Restzeitanzeige geprüft.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BuildQueueManager } from '../src/core/buildQueueManager.ts';
import { ColonyManager } from '../src/core/colonyManager.ts';
import { EventBus } from '../src/core/EventBus.ts';
import { GameEngine } from '../src/core/GameEngine.ts';
import { BUILDING_CATALOG } from '../src/data/buildingCatalog.ts';
import { SurfaceGenerator } from '../src/surface/surfaceGenerator.ts';
import {
  Colony,
  Planet,
  PlanetSurface,
  StarSystem,
} from '../src/core/types.ts';
import { ColonyManagementModal } from '../src/ui/components/ColonyManagementModal.tsx';

function createMockPlanet(id: string = 'cc-planet-01'): Planet {
  return {
    id,
    name: 'Vulcanis',
    systemId: 'cc-sys-01',
    orbitIndex: 1,
    orbitDistanceAu: 0.8,
    orbitalPeriodDays: 280,
    currentAngleRad: 0,
    planetType: 'ocean',
    sizeClass: 14,
    surfaceTemperatureK: 290,
    temperatureCategory: 'temperate',
    atmosphere: 'breathable',
    waterAvailability: 'liquid_ocean',
    gravityG: 1,
    gravityCategory: 'standard',
    radiationHazard: 'negligible',
    geologicalStability: 'stable',
    habitability: 85,
    habitabilityTier: 'ideal',
    surveyStatus: 'analyzed',
    colonizationStatus: 'uncolonized',
    colonyId: null,
    color: '#22c55e',
    accentColor: '#15803d',
    texturePattern: 'oceans',
    moonsCount: 0,
  };
}

function createMockSystem(): StarSystem {
  return {
    id: 'cc-sys-01',
    name: 'Vulcanis System',
    x: 30,
    y: 30,
    star: {
      id: 'star-cc-01',
      name: 'Vulcanis',
      spectralClass: 'G',
      color: '#facc15',
      glowColor: '#ca8a04',
      temperatureK: 5700,
      luminositySolar: 1,
      massSolar: 1,
      radiusKm: 700000,
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
  surface: PlanetSurface;
}

function createColony(seed: string): ColonyFixture {
  const colonyManager = new ColonyManager(EventBus.getInstance());
  const planet = createMockPlanet();
  const system = createMockSystem();
  const surface = SurfaceGenerator.generateSurface(planet, seed);
  const result = colonyManager.foundColony(
    planet,
    system,
    surface,
    1,
    '2380.01',
    'player-empire',
    'Vulcanis Basis',
    { q: 4, r: 4 }
  );
  expect(result.success).toBe(true);
  return { colony: result.colony!, surface };
}

function addBuilding(colony: Colony, buildingDefId = 'hydroponics_dome') {
  const instance = {
    id: `bld-test-${buildingDefId}`,
    colonyId: colony.id,
    hexCoord: { q: 5, r: 4 },
    buildingDefId,
    level: 1,
    isActive: true,
  };
  colony.buildings.push(instance);
  return instance;
}

function createLegacyZeroRoundUpgrade(colony: Colony, instanceId: string) {
  const instance = colony.buildings.find((building) => building.id === instanceId)!;
  colony.buildQueue.push({
    id: 'proj-legacy-zero',
    colonyId: colony.id,
    type: 'upgrade',
    defId: instance.id,
    buildingInstanceId: instance.id,
    buildingDefId: instance.buildingDefId,
    targetHexCoord: instance.hexCoord,
    name: 'Alter 0-Runden-Auftrag',
    investedProduction: 0,
    requiredProduction: 0,
    targetLevel: instance.level + 1,
    mineralCost: 0,
    rareCost: 0,
    turnStarted: 1,
  });
}

describe('Koloniezentrum-Aufwertung', () => {
  it('1. Stufe 1 → 2 wird ohne Bauzeit sofort und ohne Warteschlangenrest abgeschlossen', () => {
    const { colony } = createColony('CC-UPGRADE-01');
    const cityCenter = colony.buildings.find((b) => b.buildingDefId === 'city_center')!;
    colony.stockpile.minerals = 200;

    const result = BuildQueueManager.queueUpgrade(colony, cityCenter.id, 1);

    expect(result.success).toBe(true);
    expect(result.completedImmediately).toBe(true);
    expect(cityCenter.level).toBe(2);
    expect(colony.buildQueue).toHaveLength(0);
  });

  it('2. Stufe 2 → 3 wird ebenfalls sofort abgeschlossen, Stufe 3 → 4 wird abgelehnt', () => {
    const { colony } = createColony('CC-UPGRADE-02');
    const cityCenter = colony.buildings.find((b) => b.buildingDefId === 'city_center')!;

    expect(BuildQueueManager.queueUpgrade(colony, cityCenter.id, 1).success).toBe(true);
    expect(cityCenter.level).toBe(2);
    expect(BuildQueueManager.queueUpgrade(colony, cityCenter.id, 2).success).toBe(true);
    expect(cityCenter.level).toBe(3);

    const rejected = BuildQueueManager.queueUpgrade(colony, cityCenter.id, 3);
    expect(rejected.success).toBe(false);
    expect(rejected.reason).toContain('maximale Ausbaustufe');
    expect(cityCenter.level).toBe(3);
    expect(colony.buildQueue).toHaveLength(0);
  });

  it('3. Regulärer Gebäudeausbau nutzt die Katalog-Bauzeit und schreitet über mehrere Runden fort', () => {
    const { colony, surface } = createColony('CC-UPGRADE-03');
    colony.stockpile.minerals = 500;
    colony.stockpile.rareResources = 100;
    const dome = addBuilding(colony, 'hydroponics_dome');

    const result = BuildQueueManager.queueUpgrade(colony, dome.id, 1);
    expect(result.success).toBe(true);
    expect(result.completedImmediately).toBeUndefined();
    expect(colony.buildQueue).toHaveLength(1);
    // round(40 * 0.8 * 2) = 64
    expect(colony.buildQueue[0].requiredProduction).toBe(64);
    expect(colony.buildQueue[0].targetLevel).toBe(2);
    expect(dome.level).toBe(1);

    // 20 Produktion pro Runde: nach drei Runden 60/64, noch nicht fertig.
    expect(BuildQueueManager.advanceQueue(colony, surface, 20).completedProject).toBeNull();
    expect(BuildQueueManager.advanceQueue(colony, surface, 20).completedProject).toBeNull();
    expect(BuildQueueManager.advanceQueue(colony, surface, 20).completedProject).toBeNull();
    expect(dome.level).toBe(1);
    expect(colony.buildQueue).toHaveLength(1);

    const finished = BuildQueueManager.advanceQueue(colony, surface, 20);
    expect(finished.completedProject).not.toBeNull();
    expect(dome.level).toBe(2);
    expect(colony.buildQueue).toHaveLength(0);
  });

  it('4. Abschluss wird genau einmal angewendet und Kosten werden nur einmal abgezogen', () => {
    const { colony, surface } = createColony('CC-UPGRADE-04');
    colony.stockpile.minerals = 500;
    colony.stockpile.rareResources = 100;
    const dome = addBuilding(colony, 'hydroponics_dome');

    expect(BuildQueueManager.queueUpgrade(colony, dome.id, 1).success).toBe(true);
    // round(30 * 0.75 * 2) = 45 Mineralien
    expect(colony.stockpile.minerals).toBe(455);
    expect(colony.stockpile.rareResources).toBe(100);

    BuildQueueManager.advanceQueue(colony, surface, 64);
    expect(dome.level).toBe(2);
    expect(colony.stockpile.minerals).toBe(455);

    const second = BuildQueueManager.advanceQueue(colony, surface, 64);
    expect(second.completedProject).toBeNull();
    expect(dome.level).toBe(2);
    expect(colony.stockpile.minerals).toBe(455);
  });

  it('5. Ein bereits gespeicherter 0-Runden-Auftrag wird beim Rundenwechsel kontrolliert abgeschlossen', () => {
    const { colony, surface } = createColony('CC-UPGRADE-05');
    const cityCenter = colony.buildings.find((b) => b.buildingDefId === 'city_center')!;
    createLegacyZeroRoundUpgrade(colony, cityCenter.id);

    expect(colony.buildQueue).toHaveLength(1);
    expect(colony.buildQueue[0].requiredProduction).toBe(0);

    const result = BuildQueueManager.advanceQueue(colony, surface, 10);

    expect(result.completedProject).not.toBeNull();
    expect(cityCenter.level).toBe(2);
    expect(colony.buildQueue).toHaveLength(0);
    expect(Number.isFinite(colony.buildQueue[0]?.investedProduction ?? 0)).toBe(true);
  });

  it('6. Ein doppelter Ausbauauftrag für dieselbe Instanz wird abgelehnt', () => {
    const { colony } = createColony('CC-UPGRADE-06');
    colony.stockpile.minerals = 500;
    colony.stockpile.rareResources = 100;
    const dome = addBuilding(colony, 'hydroponics_dome');

    expect(BuildQueueManager.queueUpgrade(colony, dome.id, 1).success).toBe(true);
    expect(colony.stockpile.minerals).toBe(455);

    const duplicate = BuildQueueManager.queueUpgrade(colony, dome.id, 1);
    expect(duplicate.success).toBe(false);
    expect(duplicate.reason).toContain('bereits ein Ausbau');
    expect(colony.stockpile.minerals).toBe(455);
    expect(colony.buildQueue).toHaveLength(1);
  });

  it('7. Ein laufender Ausbau übersteht Speichern und Laden und wird danach fertiggestellt', () => {
    const engine = GameEngine.getInstance();
    engine.generateNewGalaxy({ seed: 'CC-UPGRADE-07' });
    const system = engine.getGalaxy().systems[0];
    engine.selectSystem(system.id);
    engine.surveySystem(system.id);
    const planet = system.planets.find((p) => p.planetType !== 'gas_giant') ?? system.planets[0];
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

    const founded = engine.foundColony(planet.id, 'Save-Ausbau');
    expect(founded.success).toBe(true);
    const colony = founded.colony!;
    const dome = addBuilding(colony, 'hydroponics_dome');
    colony.stockpile.minerals = 500;
    colony.stockpile.rareResources = 100;
    expect(engine.queueUpgrade(colony.id, dome.id).success).toBe(true);

    const payload = JSON.parse(JSON.stringify(engine.createSavePayload('Ausbau-Test')));
    expect(engine.restoreFromSaveData(payload)).toBe(true);

    const restored = engine.getColonies().find((entry) => entry.id === colony.id)!;
    const restoredDome = restored.buildings.find((building) => building.id === dome.id)!;
    expect(restored.buildQueue).toHaveLength(1);
    expect(restored.buildQueue[0].requiredProduction).toBe(64);

    // Genug Runden, um die 64 Produktionspunkte sicher abzubauen.
    for (let turn = 0; turn < 40 && restored.buildQueue.length > 0; turn++) {
      engine.endTurn();
    }

    expect(restored.buildQueue).toHaveLength(0);
    expect(restoredDome.level).toBe(2);
  });

  it('8. Fehlt einer Kolonie die Oberfläche (Altstand), wird sie im Rundenwechsel rekonstruiert', () => {
    const engine = GameEngine.getInstance();
    engine.generateNewGalaxy({ seed: 'CC-UPGRADE-08' });
    const system = engine.getGalaxy().systems[0];
    engine.selectSystem(system.id);
    engine.surveySystem(system.id);
    const planet = system.planets.find((p) => p.planetType !== 'gas_giant') ?? system.planets[0];
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

    const founded = engine.foundColony(planet.id, 'Ohne-Oberfläche');
    expect(founded.success).toBe(true);
    const colony = founded.colony!;
    const dome = addBuilding(colony, 'hydroponics_dome');
    colony.stockpile.minerals = 500;
    colony.stockpile.rareResources = 100;
    expect(engine.queueUpgrade(colony.id, dome.id).success).toBe(true);

    engine.getSurfaceManager().clear();
    expect(engine.getSurfaceManager().getSurface(colony.planetId)).toBeNull();

    engine.endTurn();

    expect(engine.getSurfaceManager().getSurface(colony.planetId)).not.toBeNull();
    expect(colony.buildQueue[0].investedProduction).toBeGreaterThan(0);
  });

  it('9. GUI zeigt bei 0-Runden-Altbeständen keinen irreführenden 0-Runden-Dauerzustand', () => {
    const { colony } = createColony('CC-UPGRADE-09');
    const cityCenter = colony.buildings.find((b) => b.buildingDefId === 'city_center')!;
    createLegacyZeroRoundUpgrade(colony, cityCenter.id);

    const html = renderToStaticMarkup(
      <ColonyManagementModal
        isOpen
        colony={colony}
        surface={null}
        initialTab="queue"
        onClose={() => undefined}
        onQueueBuilding={() => undefined}
        onQueueUpgrade={() => undefined}
        onQueueUnit={() => undefined}
        onSetWorkFocus={() => undefined}
        treasury={100}
      />
    );

    expect(html).toContain('Abschluss beim Rundenwechsel');
    expect(html).toContain('(0/0)');
    expect(html).not.toContain('~0 Runde(n)');
    expect(html).not.toContain('NaN');
  });
});

describe('Katalogdaten des Koloniezentrums', () => {
  it('10. Die Aufwertung erfindet keine Bauzeit: baseProductionCost bleibt die Datenquelle', () => {
    const bDef = BUILDING_CATALOG['city_center'];
    expect(bDef.baseProductionCost).toBe(0);
    expect(BuildQueueManager.getUpgradeProductionCost(bDef, 2)).toBe(0);
    expect(BuildQueueManager.getUpgradeProductionCost(bDef, 3)).toBe(0);

    // Reguläre Gebäude behalten ihre vorhandene Katalog-Bauzeit.
    const dome = BUILDING_CATALOG['hydroponics_dome'];
    expect(BuildQueueManager.getUpgradeProductionCost(dome, 2)).toBe(64);
    expect(BuildQueueManager.getUpgradeProductionCost(dome, 3)).toBe(96);
  });
});
