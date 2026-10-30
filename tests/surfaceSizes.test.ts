/**
 * Astraea 4X - Oberflächengrößen (Test)
 *
 * Prüft die zentrale Größenauflösung: harte Grenzen, Planetentyp-Bereiche,
 * Seed-Determinismus, gespeicherte Maße und die Ozean-Landquote über alle
 * Größen hinweg.
 */

import { describe, expect, it } from 'vitest';
import { Planet } from '../src/core/types.ts';
import { SurfaceGenerator } from '../src/surface/surfaceGenerator.ts';
import {
  clampsAreValid,
  createPlanet,
  oceanLandShare,
} from './helpers/surfaceFixtures.ts';
import {
  SURFACE_SIZE_LIMITS,
  SURFACE_SIZE_PROFILES,
  clampSurfaceSize,
  resolveSurfaceSize,
} from '../src/surface/surfaceSize.ts';

describe('Oberflächengrößen', () => {
  it('1. harte Grenzen werden eingehalten und Kachelzahl gedeckelt', () => {
    expect(clampsAreValid()).toBe(true);

    const tooSmall = clampSurfaceSize(1, 1);
    expect(tooSmall.width).toBe(SURFACE_SIZE_LIMITS.minWidth);
    expect(tooSmall.height).toBe(SURFACE_SIZE_LIMITS.minHeight);

    const tooLarge = clampSurfaceSize(999, 999);
    expect(tooLarge.width).toBe(SURFACE_SIZE_LIMITS.maxWidth);
    expect(tooLarge.width * tooLarge.height).toBeLessThanOrEqual(SURFACE_SIZE_LIMITS.maxTiles);

    const nonFinite = clampSurfaceSize(Number.NaN, Number.POSITIVE_INFINITY);
    expect(Number.isInteger(nonFinite.width)).toBe(true);
    expect(Number.isInteger(nonFinite.height)).toBe(true);
  });

  it('2. Größe ist seed-deterministisch und planetentyp-spezifisch', () => {
    for (const planetType of Object.keys(SURFACE_SIZE_PROFILES) as Planet['planetType'][]) {
      const planet = createPlanet({ planetType, id: `size-${planetType}` });
      const first = resolveSurfaceSize(planet, 'SIZE-SEED');
      const second = resolveSurfaceSize(planet, 'SIZE-SEED');
      const other = resolveSurfaceSize(planet, 'SIZE-SEED-OTHER');
      const profile = SURFACE_SIZE_PROFILES[planetType];

      expect(first).toEqual(second);
      expect(first.width).toBeGreaterThanOrEqual(profile.minWidth);
      expect(first.width).toBeLessThanOrEqual(profile.maxWidth);
      expect(first.height).toBeGreaterThanOrEqual(profile.minHeight);
      expect(first.height).toBeLessThanOrEqual(profile.maxHeight);
      // Unterschiedliche Seeds dürfen, müssen aber nicht abweichen.
      expect(other.width).toBeGreaterThanOrEqual(profile.minWidth);
    }
  });

  it('3. gespeicherte Maße haben Vorrang vor Profil und Argumenten', () => {
    const planet = createPlanet({
      id: 'size-stored',
      surfaceWidth: 21,
      surfaceHeight: 11,
    });
    expect(resolveSurfaceSize(planet, 'SIZE-SEED', 30, 20)).toEqual({ width: 21, height: 11 });
  });

  it('4. Ozeanwelten halten 15 % Land auf kleinen und großen Karten ein', () => {
    const sizes: [number, number][] = [
      [6, 6],
      [8, 7],
      [18, 10],
      [26, 15],
      [36, 24],
    ];
    for (const [width, height] of sizes) {
      const planet = createPlanet({ planetType: 'ocean', id: `ocean-${width}x${height}` });
      const surface = SurfaceGenerator.generateSurface(planet, 'OCEAN-CAP', width, height);
      const share = oceanLandShare(surface);

      expect(surface.width).toBe(width);
      expect(surface.height).toBe(height);
      expect(surface.tiles).toHaveLength(width * height);
      expect(share.landCount).toBeLessThanOrEqual(Math.floor(surface.tiles.length * 0.15));
      expect(share.waterCount).toBeGreaterThanOrEqual(
        Math.ceil(surface.tiles.length * 0.85)
      );
      // Die verschobene Landezone erzeugt eine bebaubare Insel.
      expect(share.landCount).toBeGreaterThan(0);
    }
  });

  it('5. Gasriesen bleiben innerhalb ihres kleineren Profils', () => {
    const planet = createPlanet({ planetType: 'gas_giant', id: 'size-gas' });
    const surface = SurfaceGenerator.generateSurface(planet, 'SIZE-GAS');
    const profile = SURFACE_SIZE_PROFILES.gas_giant;

    expect(surface.width).toBeGreaterThanOrEqual(profile.minWidth);
    expect(surface.width).toBeLessThanOrEqual(profile.maxWidth);
    expect(surface.tiles.every((tile) => tile.biome === 'gas')).toBe(true);
  });
});
