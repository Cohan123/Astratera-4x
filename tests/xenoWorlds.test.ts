/**
 * Astraea 4X - Xenowelten (Test)
 *
 * Xenowelten sind ein seltener Planetentyp, der über die vorhandene
 * Gewichtung der Planetengenerierung entsteht. Die Tests sichern Seltenheit,
 * Determinismus und die Wiederverwendung vorhandener Biome.
 */

import { describe, expect, it } from 'vitest';
import { Planet } from '../src/core/types.ts';
import { PLANET_CATALOG } from '../src/data/planetCatalog.ts';
import { BIOME_CATALOG } from '../src/data/terrainCatalog.ts';
import { PlanetGenerator } from '../src/generation/planetGenerator.ts';
import { PLANET_GENERATION_CONFIG } from '../src/generation/planetGenerationConfig.ts';
import { SurfaceGenerator } from '../src/surface/surfaceGenerator.ts';
import { createPlanet } from './helpers/surfaceFixtures.ts';

const STAR = {
  id: 'xeno-star',
  name: 'Xeno',
  spectralClass: 'G' as const,
  color: '#facc15',
  glowColor: '#ca8a04',
  temperatureK: 5778,
  luminositySolar: 1,
  massSolar: 1,
  radiusKm: 696340,
};

function generatePlanets(seed: string, systemIndex: number, count = 4): Planet[] {
  return PlanetGenerator.generateSystemPlanets(
    seed,
    `xeno-sys-${systemIndex}`,
    `Xeno ${systemIndex}`,
    STAR,
    count
  );
}

describe('Xenowelten', () => {
  it('1. Katalog und Generatorgewichte sind zentral definiert', () => {
    expect(PLANET_CATALOG.xeno).toBeDefined();
    expect(PLANET_CATALOG.xeno.allowsSurfaceColony).toBe(true);
    expect(PLANET_CATALOG.xeno.baseHabitability).toBeLessThan(PLANET_CATALOG.rocky.baseHabitability);
    expect(PLANET_GENERATION_CONFIG.xenoworldWeight.habitable).toBeGreaterThan(0);
    expect(PLANET_GENERATION_CONFIG.xenoworldWeight.outer).toBeGreaterThan(0);
  });

  it('2. Xenowelten sind selten und deterministisch', () => {
    let total = 0;
    let xenoCount = 0;
    for (let index = 0; index < 300; index++) {
      const planets = generatePlanets('XENO-RARITY', index);
      total += planets.length;
      xenoCount += planets.filter((planet) => planet.planetType === 'xeno').length;
    }

    // Gewicht < 1 % pro Planet; die harte Obergrenze verhindert Ausreißer.
    expect(xenoCount).toBeLessThan(total * 0.02);
    expect(xenoCount).toBeLessThan(300 * 4);

    const first = generatePlanets('XENO-RARITY', 7);
    const second = generatePlanets('XENO-RARITY', 7);
    expect(first.map((planet) => planet.planetType)).toEqual(
      second.map((planet) => planet.planetType)
    );
    expect(first.map((planet) => planet.surfaceTemperatureK)).toEqual(
      second.map((planet) => planet.surfaceTemperatureK)
    );
  });

  it('3. Xenowelt-Eigenschaften bleiben im Rahmen vorhandener Kategorien', () => {
    const planets = Array.from({ length: 60 }, (_, index) =>
      generatePlanets('XENO-PROPERTIES', index, 6)
    ).flat();
    const xenoPlanets = planets.filter((planet) => planet.planetType === 'xeno');

    // Falls in diesem Sample keine Xenowelt liegt, wird die Attributprüfung
    // an einem direkt konstruierten Planeten durchgeführt.
    const samples =
      xenoPlanets.length > 0
        ? xenoPlanets
        : [createPlanet({ planetType: 'xeno', id: 'xeno-direct' })];

    for (const planet of samples) {
      expect(['toxic', 'corrosive', 'thin']).toContain(planet.atmosphere);
      expect(['moderate', 'trace', 'abundant']).toContain(planet.waterAvailability);
      expect(planet.color).toBe(PLANET_CATALOG.xeno.color);
    }
  });

  it('4. Xenowelt-Oberflächen nutzen ausschließlich vorhandene Biome', () => {
    const allBiomes = new Set<string>();
    for (const seed of ['XENO-SURFACE-A', 'XENO-SURFACE-B', 'XENO-SURFACE-C']) {
      const planet = createPlanet({ planetType: 'xeno', id: `xeno-${seed}` });
      const surface = SurfaceGenerator.generateSurface(planet, seed);
      for (const tile of surface.tiles) {
        expect(BIOME_CATALOG[tile.biome], `unbekanntes Biom ${tile.biome}`).toBeDefined();
        expect(tile.biome).not.toBe('gas');
        expect(tile.biome).not.toBe('lava');
        allBiomes.add(tile.biome);
      }
    }

    const xenobiomes = ['alien', 'fungal_forest', 'jungle', 'forest', 'marsh'];
    expect(xenobiomes.some((biome) => allBiomes.has(biome))).toBe(true);
  });
});
