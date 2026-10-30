/**
 * Astraea 4X - Territory Borders
 * Reine Geometrie für durchgehende Grenzlinien zwischen Territorien.
 *
 * Jedes besiedelte System erhält eine lokal begrenzte Voronoi-Zelle. Die
 * Zelle wird gegen alle übrigen Systeme (auch unbeanspruchte) geclippt, damit
 * Grenzen nur dort entstehen, wo zwei Territorien tatsächlich aneinander
 * stoßen. Jede Polygonkante merkt sich das System, dessen Mittelsenkrechte sie
 * trägt; nur Kanten zwischen zwei unterschiedlichen Besitzern werden zu
 * Grenzsegmenten. Weil benachbarte Zellen dieselbe Mittelsenkrechte teilen,
 * fügen sich die Segmente zu einem durchgehenden Linienzug zusammen.
 *
 * Die Berechnung ist zustandslos und deterministisch: Eingabereihenfolge,
 * Sortierung und Auswahl der emittierenden Zelle hängen ausschließlich von
 * Koordinaten und System-IDs ab.
 */

export interface TerritorySite {
  id: string;
  x: number;
  y: number;
  ownerFactionId: string | null;
}

export interface TerritoryBorderSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** System, dessen Zelle das Segment geliefert hat (kleinere ID des Paars). */
  fromSystemId: string;
  /** Nachbarsystem jenseits der Grenze. */
  toSystemId: string;
  /** Besitzer auf der Seite von fromSystemId. */
  ownerFactionId: string;
  /** Besitzer jenseits der Grenze. */
  otherOwnerFactionId: string;
  /** Segmentlänge in Weltkoordinaten. */
  length: number;
}

export interface TerritoryBorderOptions {
  /** Halbe Kantenlänge des lokalen Clipping-Fensters je System (Weltkoordinaten). */
  clipRadius?: number;
  /** Segmente unterhalb dieser Länge gelten als numerisches Artefakt. */
  minSegmentLength?: number;
}

/** Standardfenster: deckt bei den üblichen Galaxieabständen alle Nachbargrenzen ab. */
export const DEFAULT_TERRITORY_CLIP_RADIUS = 160;
export const DEFAULT_TERRITORY_MIN_SEGMENT_LENGTH = 0.5;

const EPSILON = 1e-7;

interface CellVertex {
  x: number;
  y: number;
  /**
   * Index des Systems, dessen Mittelsenkrechte die eintreffende Kante trägt.
   * `null` steht für den initialen Zellrahmen.
   */
  label: number | null;
}

interface Neighbor {
  index: number;
  site: TerritorySite;
  distanceSquared: number;
}

/**
 * Berechnet alle Grenzsegmente zwischen Territorien unterschiedlicher
 * Besitzer. Unbeanspruchte Systeme schneiden Zellen mit, erzeugen aber selbst
 * keine Grenze zur Leere.
 */
export function computeTerritoryBorders(
  sites: readonly TerritorySite[],
  options: TerritoryBorderOptions = {}
): TerritoryBorderSegment[] {
  const clipRadius = Math.max(1, options.clipRadius ?? DEFAULT_TERRITORY_CLIP_RADIUS);
  const minSegmentLength = Math.max(
    0,
    options.minSegmentLength ?? DEFAULT_TERRITORY_MIN_SEGMENT_LENGTH
  );

  const candidates: NeighborSource[] = [];
  for (let index = 0; index < sites.length; index += 1) {
    const site = sites[index];
    if (!site || !Number.isFinite(site.x) || !Number.isFinite(site.y)) continue;
    candidates.push({ index, site });
  }
  if (candidates.length < 2) return [];

  const segments: TerritoryBorderSegment[] = [];

  for (const origin of candidates) {
    const originOwner = origin.site.ownerFactionId;
    if (!originOwner) continue;

    const neighbors: Neighbor[] = [];
    for (const other of candidates) {
      if (other.index === origin.index) continue;
      const dx = other.site.x - origin.site.x;
      const dy = other.site.y - origin.site.y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared <= EPSILON) continue;
      neighbors.push({ index: other.index, site: other.site, distanceSquared });
    }
    neighbors.sort(
      (left, right) =>
        left.distanceSquared - right.distanceSquared ||
        compareIds(left.site.id, right.site.id)
    );
    if (neighbors.length === 0) continue;

    let cell = createSquareCell(origin.site, clipRadius);
    for (const neighbor of neighbors) {
      cell = clipCellByBisector(cell, origin.site, neighbor.site, neighbor.index);
      if (cell.length < 3) {
        cell = [];
        break;
      }
    }
    if (cell.length === 0) continue;

    for (let index = 0; index < cell.length; index += 1) {
      const previous = cell[(index - 1 + cell.length) % cell.length];
      const current = cell[index];
      const label = current.label;
      if (label === null) continue;

      const other = sites[label];
      if (!other || !other.ownerFactionId) continue;
      if (other.ownerFactionId === originOwner) continue;
      // Jedes Systempaar wird genau einmal emittiert: aus der Zelle mit der
      // lexikografisch kleineren ID. Das hält die Ausgabe reihenfolgeunabhängig.
      if (origin.site.id >= other.id) continue;

      const dx = current.x - previous.x;
      const dy = current.y - previous.y;
      const length = Math.hypot(dx, dy);
      if (length < minSegmentLength) continue;

      segments.push({
        x1: previous.x,
        y1: previous.y,
        x2: current.x,
        y2: current.y,
        fromSystemId: origin.site.id,
        toSystemId: other.id,
        ownerFactionId: originOwner,
        otherOwnerFactionId: other.ownerFactionId,
        length,
      });
    }
  }

  return segments.sort(compareSegments);
}

interface NeighborSource {
  index: number;
  site: TerritorySite;
}

function createSquareCell(origin: TerritorySite, radius: number): CellVertex[] {
  return [
    { x: origin.x - radius, y: origin.y - radius, label: null },
    { x: origin.x + radius, y: origin.y - radius, label: null },
    { x: origin.x + radius, y: origin.y + radius, label: null },
    { x: origin.x - radius, y: origin.y + radius, label: null },
  ];
}

/**
 * Schneidet eine Zelle mit der Halbebene "näher an origin als an neighbor".
 * Die neu entstehende Schnittkante erhält das Label des Nachbarn, sodass
 * später erkennbar bleibt, zwischen welchen Systemen die Kante verläuft.
 */
function clipCellByBisector(
  cell: readonly CellVertex[],
  origin: TerritorySite,
  neighbor: TerritorySite,
  neighborIndex: number
): CellVertex[] {
  const normalX = neighbor.x - origin.x;
  const normalY = neighbor.y - origin.y;
  const offset =
    (neighbor.x * neighbor.x +
      neighbor.y * neighbor.y -
      origin.x * origin.x -
      origin.y * origin.y) /
    2;

  const signedDistance = (point: CellVertex): number =>
    point.x * normalX + point.y * normalY - offset;

  const clipped: CellVertex[] = [];
  for (let index = 0; index < cell.length; index += 1) {
    const current = cell[index];
    const next = cell[(index + 1) % cell.length];
    const currentDistance = signedDistance(current);
    const nextDistance = signedDistance(next);
    const currentInside = currentDistance <= EPSILON;
    const nextInside = nextDistance <= EPSILON;

    if (currentInside && nextInside) {
      clipped.push(next);
      continue;
    }
    if (!currentInside && !nextInside) continue;

    const denominator = currentDistance - nextDistance;
    const t = Math.abs(denominator) < EPSILON ? 0 : currentDistance / denominator;
    const crossing: CellVertex = {
      x: current.x + (next.x - current.x) * t,
      y: current.y + (next.y - current.y) * t,
      label: currentInside ? next.label : neighborIndex,
    };

    clipped.push(crossing);
    if (!currentInside) clipped.push(next);
  }

  return clipped;
}

function compareIds(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function compareSegments(
  left: TerritoryBorderSegment,
  right: TerritoryBorderSegment
): number {
  return (
    compareIds(left.fromSystemId, right.fromSystemId) ||
    compareIds(left.toSystemId, right.toSystemId) ||
    left.x1 - right.x1 ||
    left.y1 - right.y1 ||
    left.x2 - right.x2 ||
    left.y2 - right.y2
  );
}
