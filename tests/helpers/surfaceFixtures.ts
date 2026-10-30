/**
 * Gemeinsame Fixtures für Oberflächentests.
 */

import { Planet, PlanetSurface } from '../../src/core/types.ts';
import {
  SURFACE_SIZE_LIMITS,
  clampSurfaceSize,
} from '../../src/surface/surfaceSize.ts';

export function createPlanet(overrides: Partial<Planet> = {}): Planet {
  return {
    id: 'surface-fixture-01',
    name: 'Fixture Prime',
    systemId: 'sys-fixture',
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
    gravityG: 1,
    gravityCategory: 'standard',
    radiationHazard: 'negligible',
    geologicalStability: 'stable',
    habitability: 70,
    habitabilityTier: 'moderate',
    surveyStatus: 'analyzed',
    colonizationStatus: 'uncolonized',
    colonyId: null,
    color: '#38bdf8',
    accentColor: '#0284c7',
    texturePattern: 'cracks',
    moonsCount: 1,
    ...overrides,
  };
}

export function oceanLandShare(surface: PlanetSurface): {
  landCount: number;
  waterCount: number;
} {
  const waterCount = surface.tiles.filter((tile) => tile.biome === 'ocean').length;
  return { landCount: surface.tiles.length - waterCount, waterCount };
}

export function clampsAreValid(): boolean {
  const samples: [number, number][] = [
    [-10, -10],
    [0, 0],
    [1, 99],
    [99, 1],
    [36, 24],
    [37, 25],
    [Number.NaN, 10],
  ];
  return samples.every(([width, height]) => {
    const size = clampSurfaceSize(width, height);
    return (
      size.width >= SURFACE_SIZE_LIMITS.minWidth &&
      size.width <= SURFACE_SIZE_LIMITS.maxWidth &&
      size.height >= SURFACE_SIZE_LIMITS.minHeight &&
      size.height <= SURFACE_SIZE_LIMITS.maxHeight &&
      size.width * size.height <= SURFACE_SIZE_LIMITS.maxTiles &&
      Number.isInteger(size.width) &&
      Number.isInteger(size.height)
    );
  });
}
