/**
 * Astraea 4X - Grafische Kolonieansicht: Layout und Geländefarben
 *
 * Die Skyline ist eine reine Ableitung. Diese Suite prüft deterministische
 * Positionen, eindeutige Bauplätze, Baustellen aus der Warteschlange, die
 * Biom-Paletten und die Silhouettenzuordnung aller Katalogeinträge.
 */

import { describe, expect, it } from 'vitest';
import { BUILDING_CATALOG } from '../src/data/buildingCatalog.ts';
import type { BuildingInstance, Colony, PlanetHexTile, PlanetSurface } from '../src/core/types.ts';
import {
  getSkylineBuildings,
  getSkylineCenterCell,
  getSkylineKind,
  getSkylinePalette,
  SKYLINE_VIEWBOX,
  skylineJitter,
} from '../src/ui/colonySkyline.ts';

function makeColony(overrides: Partial<Colony> = {}): Colony {
  return {
    id: 'colony-skyline',
    name: 'Testhafen',
    planetId: 'SYS-0001-P1',
    systemId: 'SYS-0001',
    civId: 'player-empire',
    factionId: 'player',
    foundedTurn: 3,
    foundedDate: '2187-03-01',
    developmentTier: 'settlement',
    status: 'active',
    cityCenterCoord: { q: 0, r: 0 },
    claimedHexKeys: ['0,0', '1,0', '2,0'],
    workedHexKeys: ['0,0', '1,0'],
    workFocus: 'balanced',
    population: 4,
    growthFoodProgress: 20,
    growthFoodRequired: 50,
    stockpile: {
      food: 12,
      minerals: 30,
      rareResources: 2,
      energyBalance: 0,
      influence: 1,
    },
    netYields: {
      food: 10,
      production: 3,
      energy: 4,
      minerals: 2,
      rareResources: 0,
      research: 1,
      influence: 1,
    },
    grossYields: {
      food: 18,
      production: 3,
      energy: 4,
      minerals: 2,
      rareResources: 0,
      research: 1,
      influence: 1,
    },
    upkeep: { energy: 0, minerals: 0, credits: 2 },
    energyDeficit: false,
    buildings: [],
    buildQueue: [],
    influenceRate: 1,
    researchOutput: 1,
    taxRate: 30,
    corruption: 0.2,
    approval: 55,
    taxRevenue: 4.7,
    sizeClass: 2,
    ...overrides,
  };
}

function building(
  id: string,
  buildingDefId: string,
  level = 1,
  isActive = true
): BuildingInstance {
  return {
    id,
    colonyId: 'colony-skyline',
    hexCoord: { q: 1, r: 0 },
    buildingDefId,
    level,
    isActive,
  };
}

function makeTile(biome: PlanetHexTile['biome'] = 'plains'): PlanetHexTile {
  return {
    coord: { q: 0, r: 0 },
    key: '0,0',
    biome,
    elevation: 1,
    deposit: 'none',
    isDepositDiscovered: false,
    hasHazard: false,
    claimedByColonyId: 'colony-skyline',
    claimedByCivId: 'player-empire',
    isCityCenter: true,
    isWorked: false,
    isWorkPrioritized: false,
    isWorkLocked: false,
    buildingInstanceId: null,
    visibility: 'visible',
  };
}

function makeSurface(biome: PlanetHexTile['biome']): PlanetSurface {
  return {
    planetId: 'SYS-0001-P1',
    width: 8,
    height: 6,
    generatorVersion: 4,
    seed: 'test',
    tiles: [makeTile(biome)],
  };
}

describe('Kolonieansicht: Layout', () => {
  it('1. Setzt das Kolonie-Zentrum exakt in die mittlere Zelle', () => {
    const colony = makeColony({ buildings: [building('b-center', 'city_center', 2)] });
    const [center] = getSkylineBuildings(colony);
    const cell = getSkylineCenterCell();

    expect(center.kind).toBe('city_center');
    expect(center.level).toBe(2);
    expect(Math.abs(center.x - cell.x)).toBeLessThanOrEqual(9);
    expect(Math.abs(center.y - cell.y)).toBeLessThanOrEqual(3);
    expect(center.underConstruction).toBe(false);
  });

  it('2. Vergibt jedem Gebäude einen eigenen Platz innerhalb der Zeichenfläche', () => {
    const colony = makeColony({
      buildings: [
        building('b-center', 'city_center'),
        building('b-hydro', 'hydroponics_dome'),
        building('b-solar', 'solar_array'),
        building('b-factory', 'factory_complex', 2),
        building('b-lab', 'research_lab', 3),
      ],
    });
    const buildings = getSkylineBuildings(colony);

    expect(buildings).toHaveLength(5);
    const cells = new Set(buildings.map((item) => `${item.x}:${item.y}`));
    expect(cells.size).toBe(5);
    for (const item of buildings) {
      expect(item.x).toBeGreaterThan(0);
      expect(item.x).toBeLessThan(SKYLINE_VIEWBOX.width);
      expect(item.y).toBeGreaterThan(150);
      expect(item.y).toBeLessThan(SKYLINE_VIEWBOX.height);
    }
  });

  it('3. Liefert bei wiederholtem Aufruf identische Positionen', () => {
    const colony = makeColony({
      buildings: [building('b-center', 'city_center'), building('b-ref', 'smelter_refinery')],
    });

    expect(getSkylineBuildings(colony)).toEqual(getSkylineBuildings(colony));
    // Jitter hängt nur am Seed, nicht am Aufrufzeitpunkt.
    expect(skylineJitter('colony-skyline:b-ref:x', 9)).toBe(
      skylineJitter('colony-skyline:b-ref:x', 9)
    );
  });

  it('4. Sortiert nach Tiefe, damit hinten zuerst gezeichnet wird', () => {
    const colony = makeColony({
      buildings: [
        building('b-center', 'city_center'),
        building('b-hydro', 'hydroponics_dome'),
        building('b-solar', 'solar_array'),
        building('b-geo', 'geothermal_plant'),
        building('b-mine', 'mineral_extractor'),
        building('b-factory', 'factory_complex'),
      ],
    });
    const depths = getSkylineBuildings(colony).map((item) => item.depth);

    expect(depths).toEqual([...depths].sort((a, b) => a - b));
  });

  it('5. Zeigt Warteschlangen-Gebäude als Baustelle mit Fortschritt', () => {
    const colony = makeColony({
      buildings: [building('b-center', 'city_center')],
      buildQueue: [
        {
          id: 'proj-hydro',
          colonyId: 'colony-skyline',
          type: 'building',
          defId: 'hydroponics_dome',
          targetHexCoord: { q: 1, r: 0 },
          name: 'Hydrokultur-Kuppel',
          investedProduction: 20,
          requiredProduction: 40,
          mineralCost: 30,
          rareCost: 0,
          turnStarted: 2,
        },
        {
          id: 'proj-unit',
          colonyId: 'colony-skyline',
          type: 'unit',
          defId: 'scout_infantry',
          targetHexCoord: { q: 1, r: 0 },
          name: 'Spähtrupp',
          investedProduction: 0,
          requiredProduction: 20,
          mineralCost: 10,
          rareCost: 0,
          turnStarted: 2,
        },
      ],
    });
    const buildings = getSkylineBuildings(colony);
    const construction = buildings.find((item) => item.id === 'proj-hydro');

    expect(buildings).toHaveLength(2);
    expect(construction?.underConstruction).toBe(true);
    expect(construction?.kind).toBe('hydro_dome');
    expect(construction?.progress).toBe(0.5);
    expect(construction?.name).toBe('Hydrokultur-Kuppel');
    // Einheitenprojekte erhalten keine eigene Silhouette.
    expect(buildings.some((item) => item.id === 'proj-unit')).toBe(false);
  });

  it('6. Bricht bei mehr Gebäuden als Plätzen nicht ab, sondern füllt die Zellen', () => {
    const buildings = Array.from({ length: 20 }, (_, index) =>
      building(`b-${index}`, index === 0 ? 'city_center' : 'solar_array')
    );
    const colony = makeColony({ buildings });
    const layout = getSkylineBuildings(colony);

    expect(layout.length).toBeLessThanOrEqual(15);
    expect(new Set(layout.map((item) => `${item.x}:${item.y}`)).size).toBe(layout.length);
  });
});

describe('Kolonieansicht: Gelände und Silhouetten', () => {
  it('7. Wählt die Palette aus dem Biom des Stadtzentrums', () => {
    const colony = makeColony();

    expect(getSkylinePalette(makeSurface('snow'), colony).id).toBe('ice');
    expect(getSkylinePalette(makeSurface('volcanic'), colony).id).toBe('volcanic');
    expect(getSkylinePalette(makeSurface('jungle'), colony).id).toBe('forest');
    expect(getSkylinePalette(makeSurface('desert'), colony).id).toBe('arid');
    expect(getSkylinePalette(makeSurface('alien'), colony).id).toBe('toxic');
    expect(getSkylinePalette(makeSurface('ocean'), colony).id).toBe('ocean');
    expect(getSkylinePalette(makeSurface('plains'), colony).id).toBe('temperate');
  });

  it('8. Planetentyp hat Vorrang vor dem Biom des Stadtzentrums', () => {
    const colony = makeColony();

    expect(getSkylinePalette(makeSurface('hills'), colony, 'ice').id).toBe('ice');
    expect(getSkylinePalette(makeSurface('plains'), colony, 'volcanic').id).toBe('volcanic');
    expect(getSkylinePalette(makeSurface('forest'), colony, 'desert').id).toBe('arid');
    // Ohne Planetentyp entscheidet weiterhin das Biom.
    expect(getSkylinePalette(makeSurface('hills'), colony).id).toBe('temperate');
  });

  it('9. Fällt ohne Oberfläche auf gemäßigtes Gelände zurück', () => {
    const colony = makeColony();

    expect(getSkylinePalette(null, colony).id).toBe('temperate');
    expect(getSkylinePalette(undefined, colony).id).toBe('temperate');
    // Andere Kachel als das Stadtzentrum darf nicht zählen.
    const surface: PlanetSurface = {
      planetId: 'SYS-0001-P1',
      width: 8,
      height: 6,
      generatorVersion: 4,
      seed: 'test',
      tiles: [{ ...makeTile('snow'), key: '5,5', coord: { q: 5, r: 5 } }],
    };
    expect(getSkylinePalette(surface, colony).id).toBe('temperate');
  });

  it('10. Ordnet jedem bekannten Gebäude eine eigene Silhouette zu', () => {
    const kinds = Object.keys(BUILDING_CATALOG).map((id) => getSkylineKind(id));

    expect(getSkylineKind('hydroponics_dome')).toBe('hydro_dome');
    expect(getSkylineKind('solar_array')).toBe('solar_field');
    expect(getSkylineKind('geothermal_plant')).toBe('geothermal');
    expect(getSkylineKind('mineral_extractor')).toBe('extractor');
    expect(getSkylineKind('factory_complex')).toBe('factory');
    expect(getSkylineKind('smelter_refinery')).toBe('refinery');
    expect(getSkylineKind('research_lab')).toBe('lab');
    expect(getSkylineKind('comm_relay')).toBe('relay');
    expect(getSkylineKind('pioneer_barracks')).toBe('barracks');
    expect(kinds).not.toContain('undefined');
    expect(getSkylineKind('unbekanntes_gebaeude')).toBe('generic');
  });
});
