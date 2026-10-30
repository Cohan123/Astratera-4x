/**
 * Astraea 4X - Grafische Kolonieansicht (Skyline)
 *
 * Reines Layout-Modul für die Stadtansicht im Tab „Bauplätze". Es ordnet die
 * fertiggestellten Gebäude deterministisch auf einer perspektivischen Fläche an
 * und liefert die Geländefarben passend zum Biom des Stadtzentrums.
 *
 * Die Ansicht ist bewusst eine Platzhalterdarstellung im Stil von Master of
 * Orion 2: Jedes Gebäude erhält eine eindeutige Silhouette (etwa eine Halbkugel
 * für die Hydrokultur-Kuppel), bis echte Tiles vorliegen. Die Position hängt nur
 * von der Kolonie-ID ab, damit die Stadt bei jedem Öffnen gleich aussieht.
 */

import { BUILDING_CATALOG } from '../data/buildingCatalog.ts';
import { BIOME_CATALOG } from '../data/terrainCatalog.ts';
import { Colony, HexBiome, PlanetSurface, PlanetType } from '../core/types.ts';

/** Zeichenfläche der Kolonieansicht in SVG-Einheiten. */
export const SKYLINE_VIEWBOX = { width: 640, height: 270 } as const;

export type SkylineKind =
  | 'city_center'
  | 'hydro_dome'
  | 'solar_field'
  | 'geothermal'
  | 'extractor'
  | 'factory'
  | 'refinery'
  | 'lab'
  | 'relay'
  | 'barracks'
  | 'generic';

const KIND_BY_DEF: Record<string, SkylineKind> = {
  city_center: 'city_center',
  hydroponics_dome: 'hydro_dome',
  solar_array: 'solar_field',
  geothermal_plant: 'geothermal',
  mineral_extractor: 'extractor',
  factory_complex: 'factory',
  smelter_refinery: 'refinery',
  research_lab: 'lab',
  comm_relay: 'relay',
  pioneer_barracks: 'barracks',
};

/** Silhouette für ein Gebäude; unbekannte Definitionen erhalten ein Neutralbild. */
export function getSkylineKind(buildingDefId: string): SkylineKind {
  if (KIND_BY_DEF[buildingDefId]) return KIND_BY_DEF[buildingDefId];
  if (BUILDING_CATALOG[buildingDefId]) return 'generic';
  return 'generic';
}

export interface SkylineBuilding {
  /** Stabile Identität für React und Tests (Instanz-ID bzw. Projekt-ID). */
  id: string;
  buildingDefId: string;
  name: string;
  kind: SkylineKind;
  level: number;
  active: boolean;
  underConstruction: boolean;
  /** Baufortschritt 0–1, nur bei `underConstruction` aussagekräftig. */
  progress: number;
  /** Mittelpunkt in SVG-Einheiten. */
  x: number;
  y: number;
  /** Tiefenskalierung: hinten kleiner, vorne größer. */
  scale: number;
  /** Sortierschlüssel: kleinere Werte werden zuerst (hinten) gezeichnet. */
  depth: number;
}

interface SkylineCell {
  row: number;
  col: number;
  x: number;
  y: number;
  scale: number;
  distance: number;
}

/** Drei Tiefenreihen mit fester Staffelung; fünf Spalten pro Reihe. */
const ROWS = [
  { y: 168, scale: 0.82 },
  { y: 206, scale: 0.96 },
  { y: 246, scale: 1.1 },
];
const COLUMNS = [86, 203, 320, 437, 554];
const CENTER_COLUMN = 2;

/** FNV-1a: stabiler Hash für Jitter und Geländetextur. */
function hashString(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Gleichmäßiger Jitter in [-spread, spread] aus einem Seed. */
export function skylineJitter(seed: string, spread: number): number {
  const unit = (hashString(seed) % 2000) / 1000 - 1; // -1 … 1 in 0.001-Schritten
  return unit * spread;
}

/**
 * Baut die Zellenliste von der Mitte nach außen. So wächst die Stadt nach
 * innen zuerst und neue Gebäude erscheinen am Rand.
 */
function buildCells(): SkylineCell[] {
  const cells: SkylineCell[] = [];
  ROWS.forEach((row, rowIndex) => {
    COLUMNS.forEach((x, colIndex) => {
      cells.push({
        row: rowIndex,
        col: colIndex,
        x,
        y: row.y,
        scale: row.scale,
        distance: Math.abs(colIndex - CENTER_COLUMN) + Math.abs(rowIndex - 1) * 1.6,
      });
    });
  });
  return cells.sort((a, b) => a.distance - b.distance || a.row - b.row || a.col - b.col);
}

/** Zentrale Zelle der mittleren Reihe – dort steht das Kolonie-Zentrum. */
export function getSkylineCenterCell(): SkylineCell {
  const row = ROWS[1];
  return {
    row: 1,
    col: CENTER_COLUMN,
    x: COLUMNS[CENTER_COLUMN],
    y: row.y,
    scale: row.scale,
    distance: 0,
  };
}

/**
 * Ordnet fertige Gebäude und laufende Bauprojekte auf die Zellen.
 *
 * Fertige Gebäude belegen zuerst die inneren Zellen; das Kolonie-Zentrum sitzt
 * immer exakt in der Mitte. Bauprojekte vom Typ `building` erscheinen als
 * Baustelle am Rand. Upgrades und Einheiten erzeugen keine neue Silhouette.
 */
export function getSkylineBuildings(colony: Colony): SkylineBuilding[] {
  const cells = buildCells();
  const centerCell = getSkylineCenterCell();
  const occupied = new Set<string>();
  const placements: SkylineBuilding[] = [];

  const place = (
    cell: SkylineCell,
    building: Omit<SkylineBuilding, 'x' | 'y' | 'scale' | 'depth'>
  ) => {
    occupied.add(`${cell.row}:${cell.col}`);
    const jitterSeed = `${colony.id}:${building.id}`;
    placements.push({
      ...building,
      x: Math.round(cell.x + skylineJitter(`${jitterSeed}:x`, 9)),
      y: Math.round(cell.y + skylineJitter(`${jitterSeed}:y`, 3)),
      scale: cell.scale,
      depth: cell.row,
    });
  };

  const centerBuilding = colony.buildings.find((b) => b.buildingDefId === 'city_center');
  if (centerBuilding) {
    const def = BUILDING_CATALOG[centerBuilding.buildingDefId];
    place(centerCell, {
      id: centerBuilding.id,
      buildingDefId: centerBuilding.buildingDefId,
      name: def?.name ?? 'Kolonie-Zentrum',
      kind: 'city_center',
      level: centerBuilding.level,
      active: centerBuilding.isActive,
      underConstruction: false,
      progress: 1,
    });
  }

  const completed = colony.buildings.filter((b) => b !== centerBuilding);
  const available = cells.filter((cell) => !occupied.has(`${cell.row}:${cell.col}`));

  for (const building of completed) {
    const cell = available.shift();
    if (!cell) break;
    const def = BUILDING_CATALOG[building.buildingDefId];
    place(cell, {
      id: building.id,
      buildingDefId: building.buildingDefId,
      name: def?.name ?? building.buildingDefId,
      kind: getSkylineKind(building.buildingDefId),
      level: building.level,
      active: building.isActive,
      underConstruction: false,
      progress: 1,
    });
  }

  const projects = colony.buildQueue.filter((item) => item.type === 'building');
  for (const project of projects) {
    const cell = available.shift();
    if (!cell) break;
    const def = BUILDING_CATALOG[project.defId];
    place(cell, {
      id: project.id,
      buildingDefId: project.defId,
      name: def?.name ?? project.name,
      kind: getSkylineKind(project.defId),
      level: 1,
      active: false,
      underConstruction: true,
      progress: Math.max(
        0,
        Math.min(1, project.requiredProduction > 0 ? project.investedProduction / project.requiredProduction : 0)
      ),
    });
  }

  // Hinten zuerst zeichnen, vorne überlappend.
  return placements.sort((a, b) => a.depth - b.depth || a.x - b.x);
}

export interface SkylinePalette {
  /** Geländegruppe für Tests und Legende. */
  id: 'temperate' | 'forest' | 'arid' | 'ice' | 'volcanic' | 'toxic' | 'ocean';
  skyTop: string;
  skyBottom: string;
  hillFar: string;
  hillNear: string;
  groundFar: string;
  groundNear: string;
  horizonGlow: string;
  vegetation: string;
}

const PALETTES: Record<SkylinePalette['id'], SkylinePalette> = {
  temperate: {
    id: 'temperate',
    skyTop: '#050b16',
    skyBottom: '#1d3550',
    hillFar: '#1f3b33',
    hillNear: '#173026',
    groundFar: '#2c4a3b',
    groundNear: '#152820',
    horizonGlow: '#2dd4bf',
    vegetation: '#4ade80',
  },
  forest: {
    id: 'forest',
    skyTop: '#04120d',
    skyBottom: '#123a2b',
    hillFar: '#1c3d2a',
    hillNear: '#12291d',
    groundFar: '#25503a',
    groundNear: '#0f2419',
    horizonGlow: '#34d399',
    vegetation: '#86efac',
  },
  arid: {
    id: 'arid',
    skyTop: '#170f1e',
    skyBottom: '#4a2c22',
    hillFar: '#5a3a22',
    hillNear: '#42291a',
    groundFar: '#7a4f2a',
    groundNear: '#3d2617',
    horizonGlow: '#fbbf24',
    vegetation: '#d97706',
  },
  ice: {
    id: 'ice',
    skyTop: '#050f1e',
    skyBottom: '#1e3f63',
    hillFar: '#38566e',
    hillNear: '#2a4258',
    groundFar: '#5b7d92',
    groundNear: '#2d4557',
    horizonGlow: '#7dd3fc',
    vegetation: '#bae6fd',
  },
  volcanic: {
    id: 'volcanic',
    skyTop: '#12060c',
    skyBottom: '#3f1320',
    hillFar: '#3a1c1c',
    hillNear: '#2a1313',
    groundFar: '#5a2420',
    groundNear: '#2a1010',
    horizonGlow: '#f97316',
    vegetation: '#fb923c',
  },
  toxic: {
    id: 'toxic',
    skyTop: '#08150f',
    skyBottom: '#1c3a1f',
    hillFar: '#2f4526',
    hillNear: '#22331c',
    groundFar: '#465c2b',
    groundNear: '#1e2c15',
    horizonGlow: '#a3e635',
    vegetation: '#bef264',
  },
  ocean: {
    id: 'ocean',
    skyTop: '#030c16',
    skyBottom: '#0f3550',
    hillFar: '#164a5e',
    hillNear: '#10394a',
    groundFar: '#1d5c74',
    groundNear: '#0d2f3d',
    horizonGlow: '#22d3ee',
    vegetation: '#67e8f9',
  },
};

/** Planetentyp hat Vorrang vor dem Biom: Eis bleibt Eis, auch auf Hügeln. */
const PLANET_TYPE_GROUPS: Partial<Record<PlanetType, SkylinePalette['id']>> = {
  rocky: 'temperate',
  desert: 'arid',
  ice: 'ice',
  ocean: 'ocean',
  volcanic: 'volcanic',
  toxic: 'toxic',
  gas_giant: 'toxic',
};

const BIOME_GROUPS: Record<HexBiome, SkylinePalette['id']> = {  plains: 'temperate',
  forest: 'forest',
  jungle: 'forest',
  marsh: 'forest',
  fungal_forest: 'forest',
  ocean: 'ocean',
  desert: 'arid',
  hills: 'temperate',
  mountains: 'temperate',
  tundra: 'ice',
  snow: 'ice',
  volcanic: 'volcanic',
  lava: 'volcanic',
  alien: 'toxic',
  toxic: 'toxic',
  impact_crater: 'temperate',
  gas: 'toxic',
};

/**
 * Geländefarben aus dem Biom des Stadtzentrums. Ist der Planetentyp bekannt,
 * hat er Vorrang: Hügel auf einer Eiswelt sollen eisig aussehen, auch wenn das
 * Biom selbst nur „hills" heißt. Ohne beides gilt der gemäßigte Standard.
 */
export function getSkylinePalette(
  surface: PlanetSurface | null | undefined,
  colony: Colony,
  planetType?: PlanetType
): SkylinePalette {
  if (planetType) {
    const forced = PLANET_TYPE_GROUPS[planetType];
    if (forced) return PALETTES[forced];
  }
  const centerKey = `${colony.cityCenterCoord.q},${colony.cityCenterCoord.r}`;
  const centerTile = surface?.tiles.find((tile) => tile.key === centerKey);
  const biome = centerTile?.biome;
  if (!biome) return PALETTES.temperate;
  return PALETTES[BIOME_GROUPS[biome] ?? 'temperate'];
}

/** Anzeigename des Geländes für die Legende. */
export const SKYLINE_TERRAIN_LABELS: Record<SkylinePalette['id'], string> = {
  temperate: 'Gemäßigtes Gelände',
  forest: 'Bewaldetes Gelände',
  arid: 'Trockenzone',
  ice: 'Eis- und Schneefeld',
  volcanic: 'Vulkanisches Gelände',
  toxic: 'Xeno-Gelände',
  ocean: 'Küstenzone',
};
