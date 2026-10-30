/**
 * Astraea 4X - District Test Suite (Module 4 / Phase 2)
 * Covers multi-hex placement validation, footprint coverage, stockpile costs,
 * technology gates, yield aggregation, removal and surface marker recovery.
 */

import { describe, expect, it } from 'vitest';
import { DistrictManager } from '../src/core/districtManager.ts';
import { ColonyManager } from '../src/core/colonyManager.ts';
import { EconomyEngine } from '../src/core/economyEngine.ts';
import { DISTRICT_CATALOG } from '../src/data/districtCatalog.ts';
import { SurfaceGenerator } from '../src/surface/surfaceGenerator.ts';
import { HexMath } from '../src/surface/hexMath.ts';
import { Colony, HexCoord, Planet, PlanetSurface } from '../src/core/types.ts';

const PLAYER_CIV = 'civ-player';

function createPlanet(overrides: Partial<Planet> = {}): Planet {
  return {
    id: 'planet-district-01',
    name: 'Aurelia Prime',
    systemId: 'sys-01',
    orbitIndex: 2,
    orbitDistanceAu: 1.1,
    orbitalPeriodDays: 365,
    currentAngleRad: 0,
    planetType: 'desert',
    sizeClass: 16,
    surfaceTemperatureK: 292,
    temperatureCategory: 'temperate',
    atmosphere: 'toxic',
    waterAvailability: 'trace',
    gravityG: 1.0,
    gravityCategory: 'standard',
    radiationHazard: 'negligible',
    geologicalStability: 'stable',
    habitability: 30,
    habitabilityTier: 'hostile',
    surveyStatus: 'analyzed',
    colonizationStatus: 'colonized',
    colonyId: 'colony-a',
    color: '#38bdf8',
    accentColor: '#0284c7',
    texturePattern: 'cracks',
    moonsCount: 1,
    resources: {
      minerals: 50,
      rareResources: 10,
      energyPotential: 50,
      researchPotential: 20,
    },
    ...overrides,
  } as Planet;
}

function makeColony(id = 'colony-a', overrides: Partial<Colony> = {}): Colony {
  return {
    id,
    name: `Kolonie ${id}`,
    planetId: 'planet-district-01',
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
      minerals: 100,
      rareResources: 20,
      energyBalance: 10,
      influence: 0,
    },
    buildings: [],
    buildQueue: [],
    districts: [],
    claimedHexKeys: [],
    workedHexKeys: [],
    ...overrides,
  } as Colony;
}

function makeSurface(): PlanetSurface {
  return SurfaceGenerator.generateSurface(createPlanet(), 'DISTRICT-TEST-SEED');
}

function claimSurface(surface: PlanetSurface, colony: Colony): void {
  surface.tiles.forEach((tile) => {
    tile.claimedByColonyId = colony.id;
    tile.claimedByCivId = colony.civId;
  });
  colony.claimedHexKeys = surface.tiles.map((tile) => tile.key);
}

function findTile(surface: PlanetSurface, coord: HexCoord) {
  return surface.tiles.find((tile) => tile.key === HexMath.coordToKey(coord))!;
}

const ANCHOR: HexCoord = { q: 1, r: 1 };

describe('DistrictManager placement', () => {
  it('places a district, pays costs and marks the footprint', () => {
    const surface = makeSurface();
    const colony = makeColony();
    claimSurface(surface, colony);
    colony.workedHexKeys = [...colony.claimedHexKeys];

    const def = DISTRICT_CATALOG.residential_block;
    const result = DistrictManager.placeDistrict(colony, surface, def.id, ANCHOR, [], 12);

    expect(result.allowed).toBe(true);
    expect(result.district?.id).toBe('dist_colony-a_residential_block_1_1');
    expect(result.district?.placedTurn).toBe(12);
    expect(result.district?.coveredHexKeys).toEqual(['1,1', '2,1']);
    expect(colony.stockpile.minerals).toBe(100 - def.mineralCost);
    expect(colony.stockpile.rareResources).toBe(20 - def.rareCost);

    for (const key of result.district!.coveredHexKeys) {
      expect(surface.tiles.find((tile) => tile.key === key)?.districtInstanceId).toBe(result.district!.id);
      expect(colony.workedHexKeys).not.toContain(key);
    }
    expect(DistrictManager.getDistrictsForColony(colony)).toHaveLength(1);
  });

  it('rejects unknown district definitions', () => {
    const surface = makeSurface();
    const colony = makeColony();
    claimSurface(surface, colony);

    const result = DistrictManager.canPlaceDistrict(colony, surface, 'not_a_district', ANCHOR, []);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Unbekannter Distrikt-Typ.');
  });

  it('enforces technology gates', () => {
    const surface = makeSurface();
    const colony = makeColony();
    claimSurface(surface, colony);
    const def = DISTRICT_CATALOG.industrial_park;

    const blocked = DistrictManager.canPlaceDistrict(colony, surface, def.id, ANCHOR, []);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe('Erforderliche Technologie wurde noch nicht erforscht.');

    const allowed = DistrictManager.canPlaceDistrict(colony, surface, def.id, ANCHOR, [def.requiredTechId!]);
    expect(allowed.allowed).toBe(true);
  });

  it('rejects footprints outside the surface, foreign territory and occupied hexes', () => {
    const surface = makeSurface();
    const colony = makeColony();
    claimSurface(surface, colony);

    const outside = DistrictManager.canPlaceDistrict(colony, surface, 'agro_complex', { q: -50, r: -50 }, []);
    expect(outside.allowed).toBe(false);
    expect(outside.reason).toBe('Distrikt ragt über die Planetenoberfläche hinaus.');

    findTile(surface, ANCHOR).claimedByColonyId = 'colony-other';
    const foreign = DistrictManager.canPlaceDistrict(colony, surface, 'residential_block', ANCHOR, []);
    expect(foreign.allowed).toBe(false);
    expect(foreign.reason).toBe('Alle Distrikt-Flächen müssen zur Kolonie gehören.');
    findTile(surface, ANCHOR).claimedByColonyId = colony.id;

    findTile(surface, ANCHOR).isCityCenter = true;
    const cityCenter = DistrictManager.canPlaceDistrict(colony, surface, 'residential_block', ANCHOR, []);
    expect(cityCenter.allowed).toBe(false);
    expect(cityCenter.reason).toBe('Das Stadtzentrum kann nicht überbaut werden.');
    findTile(surface, ANCHOR).isCityCenter = false;

    findTile(surface, ANCHOR).buildingInstanceId = 'bld-1';
    const building = DistrictManager.canPlaceDistrict(colony, surface, 'residential_block', ANCHOR, []);
    expect(building.allowed).toBe(false);
    expect(building.reason).toBe('Auf der Fläche steht bereits ein Gebäude.');
    findTile(surface, ANCHOR).buildingInstanceId = null;
  });

  it('rejects overlapping districts', () => {
    const surface = makeSurface();
    const colony = makeColony();
    claimSurface(surface, colony);

    expect(DistrictManager.placeDistrict(colony, surface, 'residential_block', ANCHOR, [], 1).allowed).toBe(true);
    const overlap = DistrictManager.canPlaceDistrict(colony, surface, 'research_campus', ANCHOR, ['orbital_surveying']);
    expect(overlap.allowed).toBe(false);
    expect(overlap.reason).toBe('Die Fläche wird bereits von einem Distrikt belegt.');
  });

  it('rejects unaffordable districts', () => {
    const surface = makeSurface();
    const poor = makeColony('colony-a', {
      stockpile: { food: 0, minerals: 5, rareResources: 0, energyBalance: 0, influence: 0 },
    });
    claimSurface(surface, poor);

    const noMinerals = DistrictManager.canPlaceDistrict(poor, surface, 'residential_block', ANCHOR, []);
    expect(noMinerals.reason).toBe('Nicht genügend Mineralien im Lager.');

    const rich = makeColony('colony-a', {
      stockpile: { food: 0, minerals: 100, rareResources: 0, energyBalance: 0, influence: 0 },
    });
    claimSurface(surface, rich);
    const noRare = DistrictManager.canPlaceDistrict(rich, surface, 'research_campus', ANCHOR, ['orbital_surveying']);
    expect(noRare.reason).toBe('Nicht genügend seltene Ressourcen im Lager.');
  });
});

describe('DistrictManager coverage and yields', () => {
  it('resolves footprints and finds districts by hex', () => {
    const def = DISTRICT_CATALOG.industrial_park;
    const covered = DistrictManager.resolveCoveredCoords(def, ANCHOR);
    expect(covered).toEqual([
      { q: 1, r: 1 },
      { q: 2, r: 1 },
      { q: 1, r: 2 },
    ]);

    const surface = makeSurface();
    const colony = makeColony();
    claimSurface(surface, colony);
    const placed = DistrictManager.placeDistrict(colony, surface, def.id, ANCHOR, [def.requiredTechId!], 3);

    expect(DistrictManager.getDistrictAtHex(colony, { q: 2, r: 1 })?.id).toBe(placed.district!.id);
    expect(DistrictManager.getDistrictAtHex(colony, { q: 9, r: 9 })).toBeNull();
  });

  it('aggregates district yields and upkeep', () => {
    const surface = makeSurface();
    const colony = makeColony('colony-a', {
      stockpile: { food: 40, minerals: 200, rareResources: 20, energyBalance: 10, influence: 0 },
    });
    claimSurface(surface, colony);

    DistrictManager.placeDistrict(colony, surface, 'residential_block', ANCHOR, [], 1);
    DistrictManager.placeDistrict(colony, surface, 'research_campus', { q: 4, r: 1 }, ['orbital_surveying'], 2);

    const { yields, upkeepEnergy } = DistrictManager.calculateDistrictYields(colony);
    expect(yields.food).toBe(2);
    expect(yields.influence).toBe(1);
    expect(yields.research).toBe(4);
    expect(upkeepEnergy).toBe(3);
  });

  it('feeds districts into the colony economy', () => {
    const surface = makeSurface();
    const colony = makeColony();
    claimSurface(surface, colony);
    colony.workedHexKeys = [];
    colony.population = 1;

    const baseline = EconomyEngine.calculateYields(colony, surface, 30);

    DistrictManager.placeDistrict(colony, surface, 'agro_complex', ANCHOR, [], 1);
    const withDistrict = EconomyEngine.calculateYields(colony, surface, 30);

    expect(withDistrict.grossYields.food).toBe(baseline.grossYields.food + 6);
    expect(withDistrict.upkeep.energy).toBe(baseline.upkeep.energy + 1);
  });
});

describe('DistrictManager removal and persistence', () => {
  it('removes a district and clears its surface markers', () => {
    const surface = makeSurface();
    const colony = makeColony();
    claimSurface(surface, colony);
    const placed = DistrictManager.placeDistrict(colony, surface, 'residential_block', ANCHOR, [], 1);
    colony.workedHexKeys = ['1,1', '2,1', '5,5'];

    const result = DistrictManager.removeDistrict(colony, placed.district!.id, surface);
    expect(result.success).toBe(true);
    expect(DistrictManager.getDistrictsForColony(colony)).toHaveLength(0);
    expect(colony.workedHexKeys).toEqual(['5,5']);
    for (const key of placed.district!.coveredHexKeys) {
      expect(surface.tiles.find((tile) => tile.key === key)?.districtInstanceId).toBeNull();
    }

    const missing = DistrictManager.removeDistrict(colony, 'dist_missing', surface);
    expect(missing.success).toBe(false);
    expect(missing.reason).toBe('Distrikt nicht gefunden.');
  });

  it('clears stale markers but keeps valid ones', () => {
    const surface = makeSurface();
    const colony = makeColony();
    claimSurface(surface, colony);
    const placed = DistrictManager.placeDistrict(colony, surface, 'residential_block', ANCHOR, [], 1);
    findTile(surface, { q: 10, r: 5 }).districtInstanceId = 'dist_stale';

    DistrictManager.clearSurfaceMarkers(surface, [colony]);
    expect(findTile(surface, { q: 10, r: 5 }).districtInstanceId).toBeNull();
    expect(findTile(surface, ANCHOR).districtInstanceId).toBe(placed.district!.id);
  });

  it('rebuilds markers from colony records', () => {
    const surface = makeSurface();
    const colony = makeColony();
    claimSurface(surface, colony);
    const placed = DistrictManager.placeDistrict(colony, surface, 'residential_block', ANCHOR, [], 1);

    surface.tiles.forEach((tile) => {
      tile.districtInstanceId = null;
    });

    DistrictManager.syncSurfaceMarkers(surface, [colony]);
    for (const key of placed.district!.coveredHexKeys) {
      expect(surface.tiles.find((tile) => tile.key === key)?.districtInstanceId).toBe(placed.district!.id);
    }
    expect(surface.tiles.filter((tile) => tile.districtInstanceId !== null)).toHaveLength(2);
  });

  it('normalizes legacy colonies without a districts array', () => {
    const manager = new ColonyManager();
    const legacy = makeColony('colony-legacy');
    delete (legacy as Partial<Colony>).districts;

    manager.loadColonies([legacy]);
    expect(manager.getColonyById('colony-legacy')?.districts).toEqual([]);
  });
});
