/**
 * Astraea 4X - Gasriesen-Bauregeln (Test)
 *
 * Prüft die zentrale Regel: Auf Gasriesen sind keine normalen Bodenbauten
 * zulässig. Die Gründung erzeugt eine Gasförderplattform, Gaskollektoren
 * benötigen die Technologie `gas_extraction` und liefern seltene Ressourcen.
 */

import { describe, expect, it } from 'vitest';
import { BUILDING_CATALOG } from '../src/data/buildingCatalog.ts';
import { TECHNOLOGY_CATALOG } from '../src/data/technologyCatalog.ts';
import { BuildQueueManager } from '../src/core/buildQueueManager.ts';
import { ColonyManager } from '../src/core/colonyManager.ts';
import { EventBus } from '../src/core/EventBus.ts';
import { SurfaceGenerator } from '../src/surface/surfaceGenerator.ts';
import { StarSystem } from '../src/core/types.ts';
import { createPlanet } from './helpers/surfaceFixtures.ts';

function createSystem(planetId: string): StarSystem {
  const planet = createPlanet({ id: planetId, planetType: 'gas_giant' });
  return {
    id: 'gas-sys',
    name: 'Gas System',
    x: 10,
    y: 10,
    star: {
      id: 'gas-star',
      name: 'Gas',
      spectralClass: 'G',
      color: '#facc15',
      glowColor: '#ca8a04',
      temperatureK: 5700,
      luminositySolar: 1,
      massSolar: 1,
      radiusKm: 700000,
    },
    planetCount: 1,
    planets: [planet],
    discoveryStatus: 'surveyed',
    ownerFactionId: null,
    hyperlanes: [],
    anomalyDetected: false,
  };
}

function foundGasColony() {
  const planet = createPlanet({ id: 'gas-colony', planetType: 'gas_giant', habitability: 0 });
  const system = createSystem(planet.id);
  const surface = SurfaceGenerator.generateSurface(planet, 'GAS-RULES');
  const manager = new ColonyManager(EventBus.getInstance());
  const result = manager.foundColony(planet, system, surface, 1, '2380.01', 'player-empire', 'Gasförderung');
  expect(result.success).toBe(true);
  return { colony: result.colony!, surface, planet };
}

describe('Gasriesen-Bauregeln', () => {
  it('1. Katalog: Gaskollektor ist tech- und planetengebunden', () => {
    const collector = BUILDING_CATALOG.gas_collector;
    expect(collector.requiredTechId).toBe('gas_extraction');
    expect(collector.allowedPlanetTypes).toEqual(['gas_giant']);
    expect(collector.yieldsPerLevel.rareResources).toBeGreaterThan(0);
    expect(TECHNOLOGY_CATALOG.gas_extraction.unlocks.buildings).toContain('gas_collector');

    expect(BUILDING_CATALOG.city_center.disallowedPlanetTypes).toContain('gas_giant');
    expect(BUILDING_CATALOG.gas_extraction_hub.allowedPlanetTypes).toEqual(['gas_giant']);
  });

  it('2. Gründung setzt eine Gasförderplattform statt eines Koloniezentrums', () => {
    const { colony, planet } = foundGasColony();
    expect(planet.planetType).toBe('gas_giant');
    expect(colony.buildings.map((b) => b.buildingDefId)).toContain('gas_extraction_hub');
    expect(colony.buildings.map((b) => b.buildingDefId)).not.toContain('city_center');

    // Speichern/Laden über eine reine JSON-Serialisierung erhält das Gebäude.
    const restored = JSON.parse(JSON.stringify(colony));
    expect(restored.buildings[0].buildingDefId).toBe('gas_extraction_hub');
  });

  it('3. Zentrale Prüfung lehnt normale Gebäude auf Gasriesen ab', () => {
    const { colony, surface } = foundGasColony();
    const tile = surface.tiles.find((candidate) => candidate.claimedByColonyId === colony.id)!;
    const context = { planetType: 'gas_giant' as const, completedTechIds: ['gas_extraction'] };

    for (const buildingDefId of ['city_center', 'hydroponics_dome', 'solar_array', 'factory_complex']) {
      const result = BuildQueueManager.validateBuildingPlacement(
        colony,
        surface,
        buildingDefId,
        tile.coord,
        context
      );
      expect(result.success, `${buildingDefId} auf Gasriese`).toBe(false);
    }

    const collector = BuildQueueManager.validateBuildingPlacement(
      colony,
      surface,
      'gas_collector',
      tile.coord,
      context
    );
    expect(collector.success).toBe(true);
  });

  it('4. Gaskollektor ohne erforschte Technologie wird abgelehnt', () => {
    const { colony, surface } = foundGasColony();
    const tile = surface.tiles.find((candidate) => candidate.claimedByColonyId === colony.id)!;

    const withoutTech = BuildQueueManager.validateBuildingPlacement(
      colony,
      surface,
      'gas_collector',
      tile.coord,
      { planetType: 'gas_giant', completedTechIds: [] }
    );
    expect(withoutTech.success).toBe(false);
    expect(withoutTech.reason).toContain('gas_extraction');

    const withoutContext = BuildQueueManager.validateBuildingPlacement(
      colony,
      surface,
      'gas_collector',
      tile.coord
    );
    expect(withoutContext.success).toBe(false);
  });

  it('5. queueBuilding respektiert Tech-Gate und bucht Ressourcen', () => {
    const { colony, surface } = foundGasColony();
    const tile = surface.tiles.find((candidate) => candidate.claimedByColonyId === colony.id)!;
    colony.stockpile.minerals = 500;
    colony.stockpile.rareResources = 100;

    const withoutTech = BuildQueueManager.queueBuilding(
      colony,
      'gas_collector',
      tile.coord,
      surface,
      1,
      undefined,
      { planetType: 'gas_giant', completedTechIds: [] }
    );
    expect(withoutTech.success).toBe(false);
    expect(colony.buildQueue).toHaveLength(0);

    const mineralsBefore = colony.stockpile.minerals;
    const withTech = BuildQueueManager.queueBuilding(
      colony,
      'gas_collector',
      tile.coord,
      surface,
      1,
      undefined,
      { planetType: 'gas_giant', completedTechIds: ['gas_extraction'] }
    );
    expect(withTech.success).toBe(true);
    expect(colony.buildQueue).toHaveLength(1);
    expect(colony.stockpile.minerals).toBe(
      mineralsBefore - BUILDING_CATALOG.gas_collector.baseMineralCost
    );
  });
});
