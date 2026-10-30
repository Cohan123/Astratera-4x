/**
 * Astraea 4X - Oberflächengrößen
 *
 * Zentrale Auflösung der Planetenoberflächen-Maße. Die Größe ist kein fester
 * Standardwert mehr, sondern ergibt sich deterministisch aus Planetentyp,
 * Planet-ID und Galaxie-Seed. Explizit übergebene Maße (Testlabor, Migration)
 * haben Vorrang und werden lediglich auf die harten Sicherheitsgrenzen geklemmt.
 *
 * Die Grenzen sind bewusst konservativ: Das Hexraster wird vollständig im
 * Canvas gezeichnet, und jede Kachel trägt Klima-, Hydrologie- und
 * Ressourcendaten. Mehr als 864 Kacheln (36 × 24) würden Render- und
 * Speicherpfad ohne spielerischen Mehrwert belasten.
 */

import { Mulberry32 } from '../generation/prng.ts';
import { Planet, PlanetType } from '../core/types.ts';

export const SURFACE_SIZE_LIMITS = {
  minWidth: 6,
  maxWidth: 36,
  minHeight: 6,
  maxHeight: 24,
  maxTiles: 864,
} as const;

export interface SurfaceSizeRange {
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
}

/**
 * Planetentyp-spezifische Größenbereiche. Gasriesen bleiben kleiner, weil ihre
 * Karte nur eine Wolkenschicht ohne Hydrologie und Landezone abbildet.
 */
export const SURFACE_SIZE_PROFILES: Record<PlanetType, SurfaceSizeRange> = {
  rocky: { minWidth: 16, maxWidth: 22, minHeight: 9, maxHeight: 13 },
  ocean: { minWidth: 18, maxWidth: 26, minHeight: 10, maxHeight: 15 },
  desert: { minWidth: 15, maxWidth: 21, minHeight: 9, maxHeight: 12 },
  ice: { minWidth: 15, maxWidth: 22, minHeight: 9, maxHeight: 13 },
  volcanic: { minWidth: 14, maxWidth: 20, minHeight: 8, maxHeight: 12 },
  toxic: { minWidth: 14, maxWidth: 20, minHeight: 8, maxHeight: 12 },
  gas_giant: { minWidth: 12, maxWidth: 18, minHeight: 8, maxHeight: 11 },
  xeno: { minWidth: 17, maxWidth: 24, minHeight: 10, maxHeight: 14 },
};

export interface ResolvedSurfaceSize {
  width: number;
  height: number;
}

function clampInteger(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Begrenzt beliebige Maße auf die harten Generatorgrenzen. Die Kachelzahl wird
 * zusätzlich über die Höhe gedeckelt, damit `width * height` niemals
 * `maxTiles` überschreitet.
 */
export function clampSurfaceSize(width: number, height: number): ResolvedSurfaceSize {
  const safeWidth = clampInteger(width, SURFACE_SIZE_LIMITS.minWidth, SURFACE_SIZE_LIMITS.maxWidth, 18);
  let safeHeight = clampInteger(
    height,
    SURFACE_SIZE_LIMITS.minHeight,
    SURFACE_SIZE_LIMITS.maxHeight,
    10
  );
  const maxHeightForWidth = Math.floor(SURFACE_SIZE_LIMITS.maxTiles / safeWidth);
  safeHeight = Math.max(
    SURFACE_SIZE_LIMITS.minHeight,
    Math.min(safeHeight, maxHeightForWidth)
  );
  return { width: safeWidth, height: safeHeight };
}

/**
 * Löst die Größe einer Oberfläche deterministisch auf.
 *
 * Priorität:
 * 1. bereits am Planeten gespeicherte Maße (Save-Kompatibilität),
 * 2. explizit übergebene Maße (Testlabor, Migration),
 * 3. Planetentyp-Bereich mit Seed-Variation.
 *
 * Der Größen-Seed ist vom Oberflächen-Seed getrennt, damit eine Änderung der
 * Größenlogik nicht sämtliche Biom- und Hydrologiedaten neu würfelt.
 */
export function resolveSurfaceSize(
  planet: Planet,
  galaxySeed: string,
  width?: number,
  height?: number
): ResolvedSurfaceSize {
  if (
    Number.isFinite(planet.surfaceWidth) &&
    Number.isFinite(planet.surfaceHeight)
  ) {
    return clampSurfaceSize(planet.surfaceWidth as number, planet.surfaceHeight as number);
  }

  if (Number.isFinite(width) && Number.isFinite(height)) {
    return clampSurfaceSize(width as number, height as number);
  }

  const profile = SURFACE_SIZE_PROFILES[planet.planetType] ?? SURFACE_SIZE_PROFILES.rocky;
  const rng = new Mulberry32(`${galaxySeed}:${planet.id}:surface-size:v1`);
  const widthSpan = profile.maxWidth - profile.minWidth + 1;
  const heightSpan = profile.maxHeight - profile.minHeight + 1;
  const resolvedWidth = profile.minWidth + Math.floor(rng.next() * widthSpan);
  const resolvedHeight = profile.minHeight + Math.floor(rng.next() * heightSpan);
  return clampSurfaceSize(resolvedWidth, resolvedHeight);
}
