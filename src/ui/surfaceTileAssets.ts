/**
 * Astraea 4X - Surface Tile Assets
 *
 * Bindet die PNG-Kacheln unter `Tilesets/Planetenbiome` über Vite ein. Die
 * Dateinamen werden auf stabile Asset-Namen (ohne Ordner und Endung)
 * normalisiert, damit die reine Mapping-Schicht nur mit Namen arbeitet.
 */

// Nur die einzelnen Kacheln einbinden, nicht die großen Referenz-Spritesheets
// (eisplanet_hex_tileset, schnee_boden_only_tileset). Die Lava-Dateien liegen
// als einzelne, hochauflösende Hex-Kacheln vor und werden über dieselbe
// Namensnormalisierung wie die TILE_*-Assets angesprochen.
const modules = import.meta.glob(
  [
    '../../Tilesets/Planetenbiome/**/TILE_*.png',
    '../../Tilesets/Planetenbiome/Lava/lava_tile_*.png',
    '../../Tilesets/Planetenbiome/Lava/mountain_hex_*.png',
  ],
  {
    eager: true,
    query: '?url',
    import: 'default',
  }
) as Record<string, string>;

const tileUrls = new Map<string, string>();

for (const path of Object.keys(modules).sort()) {
  const fileName = path.split('/').pop() ?? path;
  const name = fileName
    .replace(/\.png$/i, '')
    .toUpperCase()
    // Skalierungssuffixe der Lava-/Bergkacheln entfernen, damit die
    // Mapping-Schicht stabile Namen wie LAVA_TILE_0 verwendet.
    .replace(/_HEX_X[234]$/, '')
    .replace(/_X[234]$/, '');
  // Bei doppelten Namen (z. B. TILE_FRESHWATER in zwei Ordnern) gewinnt der
  // lexikografisch erste Pfad; die Varianten sind optisch austauschbar.
  if (!tileUrls.has(name)) {
    tileUrls.set(name, modules[path]);
  }
}

const imageCache = new Map<string, HTMLImageElement>();

/** Liefert die gebaute URL einer Kachel oder null, wenn das Asset fehlt. */
export function getSurfaceTileUrl(name: string): string | null {
  return tileUrls.get(name.toUpperCase()) ?? null;
}

/**
 * Lädt eine Kachel lazy und liefert sie erst zurück, wenn sie vollständig
 * dekodiert ist. Der Canvas zeichnet bis dahin den Farb-Fallback.
 */
export function getSurfaceTileImage(name: string): HTMLImageElement | null {
  const url = getSurfaceTileUrl(name);
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

/** Nur für Tests/Diagnose: Anzahl der eingebundenen Tileset-Dateien. */
export function getSurfaceTileAssetCount(): number {
  return tileUrls.size;
}
