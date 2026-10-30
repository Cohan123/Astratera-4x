/**
 * Astraea 4X - Oberflächengenerator Test Suite (ADR-034)
 * Deckt Determinismus, Quantil-Bänder, geschützte Landezone und die
 * Konsistenz zwischen Feldern, Biom und Elevation ab.
 */

import { describe, expect, it } from 'vitest';
import { SurfaceGenerator } from '../src/surface/surfaceGenerator.ts';
import { HexMath } from '../src/surface/hexMath.ts';
import { Planet, PlanetHexTile, PlanetSurface } from '../src/core/types.ts';

function createPlanet(overrides: Partial<Planet> = {}): Planet {
  return {
    id: 'surface-planet-01',
    name: 'Terra Probing',
    systemId: 'sys-surface',
    orbitIndex: 2,
    orbitDistanceAu: 1.1,
    orbitalPeriodDays: 365,
    currentAngleRad: 0,
    planetType: 'rocky',
    sizeClass: 16,
    surfaceTemperatureK: 292,
    temperatureCategory: 'temperate',
    atmosphere: 'breathable',
    waterAvailability: 'abundant',
    gravityG: 1.0,
    gravityCategory: 'standard',
    radiationHazard: 'negligible',
    geologicalStability: 'stable',
    habitability: 70,
    habitabilityTier: 'moderate',
    surveyStatus: 'analyzed',
    colonizationStatus: 'colonized',
    colonyId: 'colony-surface',
    color: '#38bdf8',
    accentColor: '#0284c7',
    texturePattern: 'cracks',
    moonsCount: 1,
    ...overrides,
  };
}

function tileAt(surface: PlanetSurface, q: number, r: number): PlanetHexTile {
  const key = HexMath.coordToKey({ q, r });
  const tile = surface.tiles.find((candidate) => candidate.key === key);
  expect(tile, `Kachel ${key} fehlt`).toBeDefined();
  return tile as PlanetHexTile;
}

describe('SurfaceGenerator (Mehrfeldmodell)', () => {
  it('1. gleicher Seed erzeugt identische Karten', () => {
    const planet = createPlanet();
    const first = SurfaceGenerator.generateSurface(planet, 'SURFACE-SEED-01');
    const second = SurfaceGenerator.generateSurface(planet, 'SURFACE-SEED-01');

    expect(first.tiles).toHaveLength(first.width * first.height);
    expect(first.tiles).toEqual(second.tiles);
    expect(new Set(first.tiles.map((tile) => tile.key)).size).toBe(first.tiles.length);
  });

  it('2. anderer Seed erzeugt eine andere Karte', () => {
    const planet = createPlanet();
    const first = SurfaceGenerator.generateSurface(planet, 'SURFACE-SEED-01');
    const second = SurfaceGenerator.generateSurface(planet, 'SURFACE-SEED-02');

    const shape = (surface: PlanetSurface) =>
      surface.tiles.map((tile) => `${tile.biome}:${tile.elevation}`).join('|');

    expect(shape(first)).not.toBe(shape(second));
  });

  it('3. Ozeanplanet enthält Wasser und höchstens 15 % Land', () => {
    const surface = SurfaceGenerator.generateSurface(createPlanet({ planetType: 'ocean' }), 'SURFACE-OCEAN');
    const oceanCount = surface.tiles.filter((tile) => tile.biome === 'ocean').length;
    const landCount = surface.tiles.length - oceanCount;

    expect(oceanCount).toBeGreaterThan(0);
    expect(landCount).toBeGreaterThan(0);
    expect(landCount).toBeLessThanOrEqual(Math.floor(surface.tiles.length * 0.15));
    expect(oceanCount).toBeGreaterThanOrEqual(Math.ceil(surface.tiles.length * 0.85));
  });

  it('4. Landezone ist passierbar, arable und gefahrlos', () => {
    const allowedBiomes = new Set([
      'plains',
      'forest',
      'jungle',
      'marsh',
      'fungal_forest',
      'hills',
    ]);

    for (const planetType of ['rocky', 'volcanic', 'desert'] as const) {
      const surface = SurfaceGenerator.generateSurface(
        createPlanet({
          planetType,
          habitability: planetType === 'volcanic' ? 25 : 70,
          habitabilityTier: planetType === 'volcanic' ? 'hostile' : 'moderate',
        }),
        `SURFACE-ZONE-${planetType}`
      );
      const core = { q: Math.floor(surface.width / 4), r: Math.floor(surface.height / 2) };
      const zone = [core, ...HexMath.getNeighbors(core)];

      for (const coord of zone) {
        const tile = tileAt(surface, coord.q, coord.r);
        expect([1, 2], `${planetType} ${tile.key} Band`).toContain(tile.elevation);
        expect(allowedBiomes.has(tile.biome), `${planetType} ${tile.key} Biom ${tile.biome}`).toBe(true);
        expect(tile.hasHazard, `${planetType} ${tile.key} Gefahr`).toBe(false);
        expect(tile.hazardDescription).toBeUndefined();
      }
    }
  });

  it('5. Biom und Elevationsstufe bleiben konsistent', () => {
    const surface = SurfaceGenerator.generateSurface(createPlanet(), 'SURFACE-BANDS');

    for (const tile of surface.tiles) {
      expect(tile.elevation).toBeGreaterThanOrEqual(0);
      expect(tile.elevation).toBeLessThanOrEqual(3);

      if (tile.elevation === 0) {
        expect(tile.biome).toBe('ocean');
      }
      if (tile.elevation === 3) {
        expect(tile.biome).toBe('mountains');
      }
      if (tile.elevation === 1 || tile.elevation === 2) {
        expect(tile.biome).not.toBe('ocean');
        expect(tile.biome).not.toBe('mountains');
      }
    }
  });

  it('6. Quantil-Bänder halten den Meeresanteil des Profils ein', () => {
    const surface = SurfaceGenerator.generateSurface(createPlanet(), 'SURFACE-QUANTILE');
    const oceanCount = surface.tiles.filter((tile) => tile.biome === 'ocean').length;
    const mountainCount = surface.tiles.filter((tile) => tile.biome === 'mountains').length;

    const tileCount = surface.tiles.length;
    const expectedOcean = Math.round(tileCount * 0.2);
    const landCount = tileCount - expectedOcean;
    const expectedMountains = landCount >= 3 ? Math.max(1, Math.round(landCount * 0.12)) : 0;

    // rocky: seaFraction 0.2; Hochland 12 % der Landkacheln.
    expect(oceanCount).toBe(expectedOcean);
    expect(mountainCount).toBe(expectedMountains);
  });

  it('7. Ozeankacheln tragen keine Ressourcenvorkommen', () => {
    const surface = SurfaceGenerator.generateSurface(createPlanet({ planetType: 'ocean' }), 'SURFACE-DEPOSITS');

    for (const tile of surface.tiles.filter((candidate) => candidate.biome === 'ocean')) {
      expect(tile.deposit).toBe('none');
      expect(tile.isDepositDiscovered).toBe(false);
    }
  });

  it('8. Oberfläche trägt Version und Seed des Mehrfeldmodells', () => {
    const planet = createPlanet();
    const surface = SurfaceGenerator.generateSurface(planet, 'SURFACE-VERSION');

    expect(surface.planetId).toBe(planet.id);
    expect(surface.width).toBeGreaterThanOrEqual(6);
    expect(surface.height).toBeGreaterThanOrEqual(6);
    expect(surface.tiles).toHaveLength(surface.width * surface.height);
    expect(surface.generatorVersion).toBe(5);
    expect(surface.seed).toBe(`${'SURFACE-VERSION'}:${planet.id}:surface:v5`);
  });

  it('9. Hydrologie erzeugt konsistente Flüsse und Seen', () => {
    const surface = SurfaceGenerator.generateSurface(createPlanet(), 'SURFACE-HYDROLOGY');
    const byKey = new Map(surface.tiles.map((tile) => [tile.key, tile]));

    for (const tile of surface.tiles) {
      if (tile.elevation === 0) {
        expect(tile.riverDischarge, `Ozean ${tile.key}`).toBe(0);
        expect(tile.flowsTo, `Ozean ${tile.key}`).toBeNull();
        expect(tile.isLake, `Ozean ${tile.key}`).toBe(false);
        continue;
      }

      const hasWater = Boolean(tile.isLake) || (tile.riverDischarge ?? 0) >= 5;
      if (!hasWater) {
        expect(tile.flowsTo, `${tile.key}`).toBeNull();
        continue;
      }

      // Kartenrandkacheln sind hydrologische Auslässe und haben kein Ziel.
      const neighborKeys = HexMath.getNeighbors(tile.coord)
        .map((coord) => HexMath.coordToKey(coord))
        .filter((key) => byKey.has(key));
      if (neighborKeys.length < 6) {
        expect(tile.flowsTo, `${tile.key} Randauslass`).toBeNull();
        continue;
      }

      expect(tile.flowsTo, `${tile.key} ohne Ziel`).toBeTruthy();
      const target = byKey.get(tile.flowsTo as string);
      expect(target, `${tile.key} Ziel ${tile.flowsTo} fehlt`).toBeDefined();
      const flowNeighborKeys = HexMath.getNeighbors(tile.coord).map((coord) => HexMath.coordToKey(coord));
      expect(flowNeighborKeys, `${tile.key} Ziel nicht benachbart`).toContain(tile.flowsTo);
    }
  });

  it('10. Mindestens ein Fluss über mehrere Seeds', () => {
    const riverCounts = ['SURFACE-RIVER-A', 'SURFACE-RIVER-B', 'SURFACE-RIVER-C'].map((seed) => {
      const surface = SurfaceGenerator.generateSurface(createPlanet(), seed);
      return surface.tiles.filter((tile) => (tile.riverDischarge ?? 0) >= 5 && tile.elevation > 0).length;
    });

    expect(riverCounts.some((count) => count > 0)).toBe(true);
  });

  it('11. Klimafelder sind gesetzt, normiert und biokonsistent', () => {
    const surface = SurfaceGenerator.generateSurface(createPlanet(), 'SURFACE-CLIMATE');

    for (const tile of surface.tiles) {
      expect(tile.temperature, `${tile.key} Temperatur`).toBeGreaterThanOrEqual(0);
      expect(tile.temperature, `${tile.key} Temperatur`).toBeLessThanOrEqual(1);
      expect(tile.rainfall, `${tile.key} Niederschlag`).toBeGreaterThanOrEqual(0);
      expect(tile.rainfall, `${tile.key} Niederschlag`).toBeLessThanOrEqual(1);
      expect(tile.drainage, `${tile.key} Abfluss`).toBeGreaterThanOrEqual(0);
      expect(tile.drainage, `${tile.key} Abfluss`).toBeLessThanOrEqual(1);
      expect(tile.savagery, `${tile.key} Wildheit`).toBeGreaterThanOrEqual(0);
      expect(tile.savagery, `${tile.key} Wildheit`).toBeLessThanOrEqual(1);

      if (tile.biome === 'desert') {
        expect(tile.rainfall, `${tile.key} Wüste`).toBeLessThan(0.3);
      }
      if (tile.biome === 'snow') {
        expect(tile.temperature, `${tile.key} Gletscher`).toBeLessThan(0.24);
      }
      if (tile.biome === 'jungle') {
        expect(tile.temperature, `${tile.key} Dschungel`).toBeGreaterThan(0.5);
        expect(tile.rainfall, `${tile.key} Dschungel`).toBeGreaterThan(0.55);
      }
      if (tile.biome === 'forest') {
        expect(tile.rainfall, `${tile.key} Wald`).toBeGreaterThan(0.4);
      }
    }
  });

  it('12. Gasriesen erzeugen eine reine Platzhalter-Wolkenschicht', () => {
    const surface = SurfaceGenerator.generateSurface(
      createPlanet({ planetType: 'gas_giant', habitability: 0, habitabilityTier: 'uninhabitable' }),
      'SURFACE-GAS'
    );

    expect(surface.tiles).toHaveLength(surface.width * surface.height);
    expect(surface.tiles.every((tile) => tile.biome === 'gas')).toBe(true);
    for (const tile of surface.tiles) {
      expect(tile.elevation).toBe(1);
      expect(tile.deposit).toBe('none');
      expect(tile.hasHazard).toBe(false);
      expect(tile.flowsTo).toBeNull();
      expect(tile.riverDischarge).toBe(0);
      expect(tile.temperature).toBeDefined();
      expect(tile.rainfall).toBeDefined();
    }
  });

  it('13. Planetentypen erzeugen ihre charakteristischen Biome', () => {
    const collectBiomes = (planetType: Planet['planetType'], seeds: string[]): Set<string> => {
      const biomes = new Set<string>();
      for (const seed of seeds) {
        const surface = SurfaceGenerator.generateSurface(
          createPlanet({
            planetType,
            habitability: planetType === 'volcanic' || planetType === 'toxic' ? 20 : 70,
            habitabilityTier:
              planetType === 'volcanic' || planetType === 'toxic' ? 'hostile' : 'moderate',
          }),
          seed
        );
        for (const tile of surface.tiles) biomes.add(tile.biome);
      }
      return biomes;
    };

    const volcanic = collectBiomes('volcanic', [
      'SURFACE-VOLCANIC-A',
      'SURFACE-VOLCANIC-B',
      'SURFACE-VOLCANIC-C',
    ]);
    expect(volcanic.has('lava') || volcanic.has('volcanic')).toBe(true);

    const ice = collectBiomes('ice', ['SURFACE-ICE-A', 'SURFACE-ICE-B']);
    expect(ice.has('snow') || ice.has('tundra')).toBe(true);

    const toxic = collectBiomes('toxic', ['SURFACE-TOXIC-A', 'SURFACE-TOXIC-B']);
    expect(toxic.has('toxic') || toxic.has('alien') || toxic.has('lava')).toBe(true);

    const desert = collectBiomes('desert', ['SURFACE-DESERT-A', 'SURFACE-DESERT-B']);
    expect(desert.has('forest')).toBe(false);
    expect(desert.has('jungle')).toBe(false);
  });
});
