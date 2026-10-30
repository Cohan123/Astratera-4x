/**
 * Astraea 4X - Kolonie-Tiles
 *
 * Bindet die Grafiken unter `Tilesets/Kolonie` über Vite ein. Die drei PNGs
 * sind keine Sprite-Sheets, sondern je eine 1600×1600-PNG mit transparentem
 * Hintergrund: ein isometrischer Gesamtkomplex pro Entwicklungsstufe.
 * Deshalb wird pro Stadtzentrum genau ein Bild gezeichnet; einzelne Gebäude
 * behalten ihre bisherigen Symbole.
 *
 * Fehlt eine Datei im Build, liefert die Zuordnung `null` und der Canvas
 * verwendet den bisherigen Vektor-Fallback.
 */

import type { Colony } from '../core/types.ts';

const modules = import.meta.glob('../../Tilesets/Kolonie/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const urlByFileName = new Map<string, string>();
for (const path of Object.keys(modules).sort()) {
  const fileName = path.split('/').pop() ?? path;
  urlByFileName.set(fileName, modules[path]);
}

export type ColonyDevelopmentTier = Colony['developmentTier'];

/**
 * Zuordnung Entwicklungsstufe → vorhandene Grafik. Die isometrischen
 * Gesamtkomplexe wachsen mit der Stufe; die Dateinamen bleiben unverändert,
 * damit ein Asset-Austausch ohne Codeänderung möglich ist.
 */
export const COLONY_TILE_FILE_BY_TIER: Record<ColonyDevelopmentTier, string> = {
  outpost: 'Start_Kolonie.png',
  settlement: 'Stufe_2_Kolonie.png',
  colony: 'Stufe_3_Kolonie.png',
};

const imageCache = new Map<string, HTMLImageElement>();

/** Liefert die gebaute URL der Stufengrafik oder null, wenn sie fehlt. */
export function getColonyTileUrl(tier: ColonyDevelopmentTier): string | null {
  const fileName = COLONY_TILE_FILE_BY_TIER[tier];
  if (!fileName) return null;
  return urlByFileName.get(fileName) ?? null;
}

/**
 * Lädt die Stufengrafik lazy. Solange das Bild nicht dekodiert ist, zeichnet
 * der Canvas den Vektor-Fallback; der rAF-Loop zeichnet danach automatisch neu.
 */
export function getColonyTileImage(tier: ColonyDevelopmentTier): HTMLImageElement | null {
  const url = getColonyTileUrl(tier);
  if (!url) return null;

  let image = imageCache.get(url);
  if (!image) {
    image = new Image();
    image.decoding = 'async';
    image.src = url;
    imageCache.set(url, image);
  }

  return image.complete && image.naturalWidth > 0 ? image : null;
}

/** Nur für Tests/Diagnose: Anzahl eingebundener Kolonie-Grafiken. */
export function getColonyTileAssetCount(): number {
  return urlByFileName.size;
}

/** Dateinamen der eingebundenen Grafiken (Dokumentation/Tests). */
export function getColonyTileFileNames(): string[] {
  return [...urlByFileName.keys()].sort();
}

/** Grafiken, die noch keiner Entwicklungsstufe zugeordnet sind. */
export function getUnmappedColonyTileFileNames(): string[] {
  const mapped = new Set(Object.values(COLONY_TILE_FILE_BY_TIER));
  return getColonyTileFileNames().filter((fileName) => !mapped.has(fileName));
}
