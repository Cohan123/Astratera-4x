/**
 * Astraea 4X - Testlabor: Hilfsfunktionen für den Oberflächengenerator
 *
 * Reine, DOM-freie Funktionen. Sie verwenden exakt denselben Generator wie das
 * reguläre Spiel (`SurfaceGenerator.generateSurface`), erzeugen aber einen
 * synthetischen Testplaneten und verändern niemals Kampagnenzustand.
 */

import { Planet, PlanetHexTile, PlanetSurface, PlanetType } from '../core/types.ts';
import { BIOME_CATALOG } from '../data/terrainCatalog.ts';
import { DEPOSIT_CATALOG } from '../data/resourceCatalog.ts';
import { SurfaceGenerator } from '../surface/surfaceGenerator.ts';
import { SURFACE_SIZE_LIMITS } from '../surface/surfaceSize.ts';

export const SURFACE_TEST_LIMITS = {
  minWidth: SURFACE_SIZE_LIMITS.minWidth,
  maxWidth: SURFACE_SIZE_LIMITS.maxWidth,
  minHeight: SURFACE_SIZE_LIMITS.minHeight,
  maxHeight: SURFACE_SIZE_LIMITS.maxHeight,
  maxTiles: SURFACE_SIZE_LIMITS.maxTiles,
} as const;

export const SURFACE_TEST_PLANET_TYPES: PlanetType[] = [
  'volcanic',
  'ocean',
  'desert',
  'ice',
  'rocky',
  'toxic',
  'xeno',
  'gas_giant',
];

export const PLANET_TYPE_TEST_LABELS: Record<PlanetType, string> = {
  volcanic: 'Vulkanwelt (Lava & Vulkangestein)',
  ocean: 'Ozeanwelt',
  desert: 'Wüstenwelt',
  ice: 'Eiswelt',
  rocky: 'Gesteinswelt',
  toxic: 'Giftwelt',
  xeno: 'Xenowelt (selten)',
  gas_giant: 'Gasriese (Wolkenschicht)',
};

export interface SurfaceTestConfig {
  planetType: PlanetType;
  width: number;
  height: number;
  seed: string;
}

export const DEFAULT_SURFACE_TEST_CONFIG: SurfaceTestConfig = {
  planetType: 'volcanic',
  width: SurfaceGenerator.DEFAULT_WIDTH,
  height: SurfaceGenerator.DEFAULT_HEIGHT,
  seed: 'LAVA-TEST-001',
};

export interface BiomeStatistic {
  id: string;
  label: string;
  count: number;
  share: number;
  passable: boolean;
}

export interface DepositStatistic {
  id: string;
  label: string;
  icon: string;
  count: number;
  share: number;
}

export interface SurfaceStatistics {
  tileCount: number;
  expectedTileCount: number;
  biomeCount: number;
  biomes: BiomeStatistic[];
  deposits: DepositStatistic[];
  depositCount: number;
  hazardCount: number;
  impassableCount: number;
  riverCount: number;
  lakeCount: number;
  /** Alle Kacheln, die nicht als Ozean zählen (Küsten zählen als Land). */
  landCount: number;
  waterCount: number;
  /** Landanteil in Prozent, auf eine Nachkommastelle gerundet. */
  landShare: number;
  averageElevation: number;
  minElevation: number;
  maxElevation: number;
}

export interface SurfaceTestResult {
  planet: Planet;
  surface: PlanetSurface;
  statistics: SurfaceStatistics;
  signature: string;
  warnings: string[];
}

export function createRandomSeed(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `TEST-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  }
  return `TEST-${Date.now().toString(36).toUpperCase()}`;
}

/** Prüft die Konfiguration und liefert verständliche, deutsche Fehlermeldungen. */
export function validateSurfaceTestConfig(config: SurfaceTestConfig): string[] {
  const errors: string[] = [];
  if (!SURFACE_TEST_PLANET_TYPES.includes(config.planetType)) {
    errors.push('Unbekannter Planetentyp.');
  }
  if (!Number.isInteger(config.width)) {
    errors.push('Breite muss eine ganze Zahl sein.');
  } else if (
    config.width < SURFACE_TEST_LIMITS.minWidth ||
    config.width > SURFACE_TEST_LIMITS.maxWidth
  ) {
    errors.push(
      `Breite muss zwischen ${SURFACE_TEST_LIMITS.minWidth} und ${SURFACE_TEST_LIMITS.maxWidth} liegen.`
    );
  }
  if (!Number.isInteger(config.height)) {
    errors.push('Höhe muss eine ganze Zahl sein.');
  } else if (
    config.height < SURFACE_TEST_LIMITS.minHeight ||
    config.height > SURFACE_TEST_LIMITS.maxHeight
  ) {
    errors.push(
      `Höhe muss zwischen ${SURFACE_TEST_LIMITS.minHeight} und ${SURFACE_TEST_LIMITS.maxHeight} liegen.`
    );
  }
  if (!config.seed || config.seed.trim().length < 3) {
    errors.push('Seed muss mindestens 3 Zeichen enthalten.');
  }
  return errors;
}

/**
 * Baut einen synthetischen Planeten nur für den Test. Die ID ist bewusst
 * stabil, damit derselbe Seed bei gleicher Konfiguration dieselbe Oberfläche
 * erzeugt; Kampagnenobjekte werden weder gelesen noch verändert.
 */
export function createTestPlanet(planetType: PlanetType): Planet {
  const temperatureByType: Record<PlanetType, number> = {
    volcanic: 620,
    ocean: 292,
    desert: 330,
    ice: 170,
    rocky: 270,
    toxic: 410,
    xeno: 285,
    gas_giant: 180,
  };
  const habitabilityByType: Record<PlanetType, number> = {
    volcanic: 5,
    ocean: 85,
    desert: 35,
    ice: 20,
    rocky: 40,
    toxic: 5,
    xeno: 18,
    gas_giant: 0,
  };
  const colorByType: Record<PlanetType, { color: string; accentColor: string }> = {
    volcanic: { color: '#dc2626', accentColor: '#7f1d1d' },
    ocean: { color: '#0284c7', accentColor: '#38bdf8' },
    desert: { color: '#d97706', accentColor: '#fbbf24' },
    ice: { color: '#bae6fd', accentColor: '#7dd3fc' },
    rocky: { color: '#94a3b8', accentColor: '#64748b' },
    toxic: { color: '#a855f7', accentColor: '#e879f9' },
    xeno: { color: '#7c3aed', accentColor: '#22d3ee' },
    gas_giant: { color: '#f59e0b', accentColor: '#b45309' },
  };
  const label = PLANET_TYPE_TEST_LABELS[planetType];

  return {
    id: `test-${planetType}`,
    name: `Testwelt ${label}`,
    systemId: 'test-system',
    orbitIndex: 1,
    orbitDistanceAu: 1,
    orbitalPeriodDays: 365,
    currentAngleRad: 0,
    planetType,
    sizeClass: 14,
    surfaceTemperatureK: temperatureByType[planetType],
    temperatureCategory: planetType === 'ice' ? 'freezing' : planetType === 'volcanic' ? 'hot' : 'temperate',
    atmosphere: planetType === 'gas_giant' ? 'dense' : planetType === 'toxic' ? 'toxic' : 'thin',
    waterAvailability:
      planetType === 'ocean'
        ? 'liquid_ocean'
        : planetType === 'ice'
          ? 'moderate'
          : planetType === 'gas_giant' || planetType === 'volcanic'
            ? 'none'
            : planetType === 'xeno'
              ? 'moderate'
              : 'trace',
    gravityG: 1,
    gravityCategory: 'standard',
    radiationHazard: planetType === 'volcanic' || planetType === 'toxic' ? 'severe' : 'negligible',
    geologicalStability: planetType === 'volcanic' ? 'extreme_volcanism' : 'stable',
    habitability: habitabilityByType[planetType],
    habitabilityTier: 'hostile',
    surveyStatus: 'analyzed',
    colonizationStatus: 'uncolonized',
    colonyId: null,
    color: colorByType[planetType].color,
    accentColor: colorByType[planetType].accentColor,
    texturePattern:
      planetType === 'ocean'
        ? 'oceans'
        : planetType === 'gas_giant'
          ? 'bands'
          : planetType === 'volcanic'
            ? 'cracks'
            : planetType === 'xeno' || planetType === 'toxic'
              ? 'swirls'
              : 'craters',
    moonsCount: 0,
  };
}

/**
 * Führt den echten Generator aus. Die Kacheln werden ausschließlich für die
 * Testansicht sichtbar geschaltet; der Generator selbst bleibt unverändert.
 */
export function generateTestSurface(config: SurfaceTestConfig): SurfaceTestResult {
  const errors = validateSurfaceTestConfig(config);
  if (errors.length > 0) {
    throw new Error(errors.join(' '));
  }

  const planet = createTestPlanet(config.planetType);
  const seed = config.seed.trim();
  const generated = SurfaceGenerator.generateSurface(planet, seed, config.width, config.height);

  const surface: PlanetSurface = {
    ...generated,
    tiles: generated.tiles.map((tile) => ({
      ...tile,
      visibility: 'visible',
      // Im Testlabor sollen Vorkommen direkt sichtbar und prüfbar sein.
      isDepositDiscovered: tile.deposit !== 'none',
    })),
  };

  const statistics = computeSurfaceStatistics(surface);
  const warnings: string[] = [];

  if (surface.tiles.length !== config.width * config.height) {
    warnings.push(
      `Erwartet: ${config.width * config.height} Kacheln, erzeugt: ${surface.tiles.length}.`
    );
  }
  if (/::/.test(surface.seed) || surface.seed.length === 0) {
    warnings.push('Der Generator meldet keinen gültigen Oberflächen-Seed.');
  }
  if (config.planetType === 'volcanic' && statistics.biomes.every((entry) => entry.id !== 'lava' && entry.id !== 'volcanic')) {
    warnings.push('Vulkanwelt ohne Lava- oder Vulkangesteins-Biom erzeugt.');
  }
  if (config.planetType === 'gas_giant' && statistics.biomes.every((entry) => entry.id !== 'gas')) {
    warnings.push('Gasriese ohne Wolken-Biom erzeugt.');
  }
  if (config.planetType === 'ocean' && statistics.landShare > SurfaceGenerator.OCEAN_MAX_LAND_FRACTION * 100) {
    warnings.push(
      `Ozeanwelt überschreitet die Landobergrenze: ${statistics.landShare.toFixed(1)} % Land (maximal 15 %).`
    );
  }
  if (
    config.planetType === 'xeno' &&
    statistics.biomes.every(
      (entry) =>
        entry.id !== 'alien' &&
        entry.id !== 'fungal_forest' &&
        entry.id !== 'jungle' &&
        entry.id !== 'marsh'
    )
  ) {
    warnings.push('Xenowelt ohne fremdartiges Biom erzeugt.');
  }

  return {
    planet,
    surface,
    statistics,
    signature: surfaceSignature(surface),
    warnings,
  };
}

export function computeSurfaceStatistics(surface: PlanetSurface): SurfaceStatistics {
  const biomeCounts = new Map<string, number>();
  const depositCounts = new Map<string, number>();
  let hazardCount = 0;
  let impassableCount = 0;
  let riverCount = 0;
  let lakeCount = 0;
  let elevationSum = 0;
  let minElevation = Number.POSITIVE_INFINITY;
  let maxElevation = 0;

  for (const tile of surface.tiles) {
    biomeCounts.set(tile.biome, (biomeCounts.get(tile.biome) ?? 0) + 1);
    if (tile.deposit !== 'none') {
      depositCounts.set(tile.deposit, (depositCounts.get(tile.deposit) ?? 0) + 1);
    }
    if (tile.hasHazard) hazardCount++;
    if (BIOME_CATALOG[tile.biome]?.isImpassable) impassableCount++;
    if (tile.flowsTo) riverCount++;
    if (tile.isLake) lakeCount++;
    elevationSum += tile.elevation;
    minElevation = Math.min(minElevation, tile.elevation);
    maxElevation = Math.max(maxElevation, tile.elevation);
  }

  const total = Math.max(1, surface.tiles.length);
  const waterCount = surface.tiles.filter((tile) => tile.biome === 'ocean').length;
  const landCount = Math.max(0, surface.tiles.length - waterCount);
  const biomes: BiomeStatistic[] = Array.from(biomeCounts.entries())
    .map(([id, count]) => ({
      id,
      label: BIOME_CATALOG[id as PlanetHexTile['biome']]?.displayName ?? id,
      count,
      share: Math.round((count / total) * 1000) / 10,
      passable: !BIOME_CATALOG[id as PlanetHexTile['biome']]?.isImpassable,
    }))
    .sort((a, b) => b.count - a.count);

  const deposits: DepositStatistic[] = Array.from(depositCounts.entries())
    .map(([id, count]) => ({
      id,
      label: DEPOSIT_CATALOG[id as PlanetHexTile['deposit']]?.name ?? id,
      icon: DEPOSIT_CATALOG[id as PlanetHexTile['deposit']]?.icon ?? '•',
      count,
      share: Math.round((count / total) * 1000) / 10,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    tileCount: surface.tiles.length,
    expectedTileCount: surface.width * surface.height,
    biomeCount: biomes.length,
    biomes,
    deposits,
    depositCount: deposits.reduce((sum, entry) => sum + entry.count, 0),
    hazardCount,
    impassableCount,
    riverCount,
    lakeCount,
    landCount,
    waterCount,
    landShare: Math.round((landCount / total) * 1000) / 10,
    averageElevation:
      surface.tiles.length > 0
        ? Math.round((elevationSum / surface.tiles.length) * 100) / 100
        : 0,
    minElevation: Number.isFinite(minElevation) ? minElevation : 0,
    maxElevation,
  };
}

/** Stabiler FNV-1a-Fingerabdruck der erzeugten Kacheln für Reproduzierbarkeit. */
export function surfaceSignature(surface: PlanetSurface): string {
  let hash = 2166136261;
  const value = surface.tiles
    .map((tile) => `${tile.key}:${tile.biome}:${tile.elevation}:${tile.deposit}`)
    .join('|');
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function surfaceConfigKey(config: SurfaceTestConfig): string {
  return `${config.planetType}:${config.width}x${config.height}:${config.seed.trim()}`;
}