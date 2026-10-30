/**
 * Astraea 4X - Schiffsgrafik
 *
 * Ordnet Schiffsklassen den vorhandenen Bildern unter `Tilesets/Raumschiffe`
 * zu. Die Dateien sind breite, hintergrundlose oder dunkle Renderings und
 * werden in der Schiffsleiste vollständig (`object-contain`) gezeigt; die
 * Kartenmarker bleiben Silhouetten.
 *
 * Fehlende Klassen und Fraktionen verwenden bewusst dieselbe Grafik und werden
 * hier zentral als Fallback markiert, statt Assets zu erfinden.
 */

const modules = import.meta.glob('../../Tilesets/Raumschiffe/*.{jpg,jpeg,png,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const urlByFileName = new Map<string, string>();
for (const path of Object.keys(modules).sort()) {
  const fileName = path.split('/').pop() ?? path;
  urlByFileName.set(fileName, modules[path]);
}

export interface ShipArtDefinition {
  /** Anzeigename der Grafik. */
  label: string;
  url: string | null;
  /** true, wenn die Klasse keine eigene Grafik besitzt. */
  fallback: boolean;
}

/**
 * Zuordnung Schiffsklasse → vorhandene Datei.
 *
 * - `frigate` nutzt das Fregatten-Rendering,
 * - `cruiser` das Schlachtschiff-Rendering,
 * - `colony` das Kolonieschiff,
 * - `scout` den Forschungssonde-/Aufklärer-Render.
 *
 * Korvette und Zerstörer besitzen weiterhin keine eigene Grafik und teilen
 * sich die Fregatte (Fallback). `Transporter.png` gehört zu keiner aktuell
 * definierten Schiffsklasse und bleibt deshalb unzugeordnet.
 */
export const SHIP_ART_BY_CLASS: Record<string, { file: string; label: string; fallback: boolean }> = {
  colony: { file: 'Kolonie.jpg', label: 'Kolonieschiff', fallback: false },
  scout: { file: 'Forschung.jpeg', label: 'Aufklärungsschiff', fallback: false },
  frigate: { file: 'Fregatte.png', label: 'Fregatte', fallback: false },
  cruiser: { file: 'schlachtschiff.png', label: 'Kreuzer', fallback: false },
  corvette: { file: 'Fregatte.png', label: 'Korvette', fallback: true },
  destroyer: { file: 'Fregatte.png', label: 'Zerstörer', fallback: true },
};

const FALLBACK_CLASS = 'frigate';

export function getShipArt(shipClass: string | undefined | null): ShipArtDefinition {
  const entry = (shipClass && SHIP_ART_BY_CLASS[shipClass]) || SHIP_ART_BY_CLASS[FALLBACK_CLASS];
  const url = urlByFileName.get(entry.file) ?? null;
  return {
    label: entry.label,
    url,
    // Fehlt die Datei im Build, gilt sie ebenfalls als Fallback.
    fallback: entry.fallback || !url,
  };
}

/** Nur für Tests/Diagnose: Anzahl gebündelter Schiffsbilder. */
export function getShipArtAssetCount(): number {
  return urlByFileName.size;
}

/** Liste der vorhandenen Schiffsbild-Dateinamen (für Dokumentation/Tests). */
export function getShipArtFileNames(): string[] {
  return [...urlByFileName.keys()].sort();
}

/** Dateien ohne Zuordnung zu einer Schiffsklasse (derzeit `Transporter.png`). */
export function getUnmappedShipArtFileNames(): string[] {
  const mapped = new Set(Object.values(SHIP_ART_BY_CLASS).map((entry) => entry.file));
  return getShipArtFileNames().filter((fileName) => !mapped.has(fileName));
}
