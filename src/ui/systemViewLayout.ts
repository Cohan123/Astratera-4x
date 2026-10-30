/**
 * Astraea 4X - System View Layout
 * Pure geometry helpers shared by the canvas renderer and the hit testing.
 * Both view modes (orbit and detail) derive every planet position here so
 * that drawing and clicking can never disagree.
 */

import type { AsteroidBelt, Moon, Planet } from '../core/types.ts';

export type SystemMapViewMode = 'orbit' | 'detail';

export interface Vec2 {
  x: number;
  y: number;
}

export interface PlanetPlacement {
  planet: Planet;
  x: number;
  y: number;
  radius: number;
}

export interface DetailLayout {
  placements: PlanetPlacement[];
  star: Vec2 & { radius: number };
  contentWidth: number;
  maxScroll: number;
  scroll: number;
}

/** Radial distance of the innermost orbit in CSS pixels. */
export const ORBIT_BASE_RADIUS = 100;
/** Radial distance added per orbit index in CSS pixels. */
export const ORBIT_RADIUS_STEP = 65;

/** Left margin of the detail view. */
export const DETAIL_LEFT_MARGIN = 32;
/** Radius of the central star in the detail view. */
export const DETAIL_STAR_RADIUS = 26;
/** Gap between the star edge and the first planet center. */
export const DETAIL_STAR_GAP = 64;
/** Smallest allowed distance between two planet centers. */
export const DETAIL_MIN_GAP = 132;
/** Right margin after the outermost planet in the detail view. */
export const DETAIL_RIGHT_MARGIN = 56;
/** Scroll distance per wheel notch in the detail view. */
export const DETAIL_WHEEL_STEP = 120;
const DETAIL_MIN_RADIUS = 14;
const DETAIL_MAX_RADIUS = 36;
const DETAIL_GAS_GIANT_SCALE = 1.3;

/** Stable ordering by real orbital distance, then orbit index and id. */
export function comparePlanetsByDistance(a: Planet, b: Planet): number {
  if (a.orbitDistanceAu !== b.orbitDistanceAu) {
    return a.orbitDistanceAu - b.orbitDistanceAu;
  }
  if (a.orbitIndex !== b.orbitIndex) {
    return a.orbitIndex - b.orbitIndex;
  }
  return a.id.localeCompare(b.id);
}

export function sortPlanetsByDistance(planets: readonly Planet[]): Planet[] {
  return [...planets].sort(comparePlanetsByDistance);
}

/** Orbit radius (world units before zoom) for a planet. */
export function computeOrbitRadius(planet: Planet): number {
  return ORBIT_BASE_RADIUS + (planet.orbitIndex - 1) * ORBIT_RADIUS_STEP;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatAu(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? rounded.toFixed(1) : String(rounded);
}

/**
 * Orbit radius of an asteroid belt, interpolated from the real AU distances
 * of its neighbouring planets. This keeps a belt between the same planets in
 * both the physical model and the rendered map.
 */
export function beltOrbitRadius(
  belt: AsteroidBelt,
  planets: readonly Planet[]
): number | null {
  if (planets.length === 0) return null;
  const sorted = sortPlanetsByDistance(planets);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const mid = Math.max(0.01, belt.midpointAu);

  if (mid <= first.orbitDistanceAu) {
    const ratio = clamp(mid / Math.max(0.01, first.orbitDistanceAu), 0.5, 0.85);
    return Math.max(
      ORBIT_BASE_RADIUS * 0.45,
      computeOrbitRadius(first) * ratio
    );
  }

  if (mid >= last.orbitDistanceAu) {
    const excess = mid / Math.max(0.01, last.orbitDistanceAu) - 1;
    return (
      computeOrbitRadius(last) +
      ORBIT_RADIUS_STEP * clamp(0.5 + excess * 0.5, 0.5, 1.4)
    );
  }

  for (let i = 1; i < sorted.length; i += 1) {
    const inner = sorted[i - 1];
    const outer = sorted[i];
    if (mid > outer.orbitDistanceAu) continue;
    const span = Math.max(0.0001, outer.orbitDistanceAu - inner.orbitDistanceAu);
    const t = clamp((mid - inner.orbitDistanceAu) / span, 0.15, 0.85);
    const innerRadius = computeOrbitRadius(inner);
    const outerRadius = computeOrbitRadius(outer);
    return innerRadius + (outerRadius - innerRadius) * t;
  }

  return computeOrbitRadius(last);
}

/** Short label rendered next to a belt, e.g. "Sol Gürtel · 2.4–2.9 AU". */
export function beltOrbitLabel(belt: AsteroidBelt): string {
  return `${belt.name} · ${formatAu(belt.innerAu)}–${formatAu(belt.outerAu)} AU`;
}

/** Half width of a rendered belt ring in world units, so it reads as a band. */
export function beltRingHalfWidth(
  belt: AsteroidBelt,
  centerRadius: number
): number {
  const mid = Math.max(0.01, belt.midpointAu);
  const span = Math.max(0, belt.outerAu - belt.innerAu);
  return clamp((span / mid) * centerRadius * 0.5, 4, 18);
}

export interface BeltOrbitRing {
  belt: AsteroidBelt;
  radius: number;
  halfWidth: number;
}

/** Resolve every belt that can be placed relative to the given planets. */
export function computeBeltOrbitRings(
  belts: readonly AsteroidBelt[] | undefined,
  planets: readonly Planet[]
): BeltOrbitRing[] {
  if (!belts || belts.length === 0) return [];
  const rings: BeltOrbitRing[] = [];
  for (const belt of belts) {
    const radius = beltOrbitRadius(belt, planets);
    if (radius === null) continue;
    rings.push({ belt, radius, halfWidth: beltRingHalfWidth(belt, radius) });
  }
  return rings;
}

/** Screen position of a planet on its circular orbit. */
export function orbitPlanetPosition(
  planet: Planet,
  angleRad: number,
  zoom: number,
  center: Vec2
): Vec2 {
  const radius = computeOrbitRadius(planet) * zoom;
  return {
    x: center.x + Math.cos(angleRad) * radius,
    y: center.y + Math.sin(angleRad) * radius,
  };
}

/** Visual radius used by the orbit view; scales with the camera zoom. */
export function planetVisualRadius(planet: Planet, zoom: number): number {
  const base = Math.max(4, (planet.sizeClass / 18) * 8 * zoom);
  return planet.planetType === 'gas_giant' ? base * 1.45 : base;
}

/** Visual radius used by the detail view; independent of any camera zoom. */
export function detailPlanetRadius(planet: Planet): number {
  const base = Math.min(
    DETAIL_MAX_RADIUS,
    Math.max(DETAIL_MIN_RADIUS, (planet.sizeClass / 18) * 20)
  );
  return planet.planetType === 'gas_giant' ? base * DETAIL_GAS_GIANT_SCALE : base;
}

/**
 * Screen radius of a moon orbit around its planet. The catalog factor is
 * capped in pixels so wide orbits stay inside the planet's cell.
 */
export function moonOrbitRadius(
  moon: Moon,
  planetRadius: number,
  maxOffsetPx = 26
): number {
  const factor = Math.max(1.4, moon.orbitRadiusPlanetRadii);
  const rawOffset = planetRadius * (factor - 1);
  const offset = Math.max(3, Math.min(rawOffset, maxOffsetPx));
  return planetRadius + offset;
}

/** Slowly drifting angle so moons do not all sit on one line. */
export function moonOrbitAngle(moon: Moon, time = 0): number {
  const base = (moon.index - 1) * GOLDEN_ANGLE + moon.index * 0.35;
  const speed = 0.35 / Math.sqrt(Math.max(1, moon.orbitalPeriodDays));
  return base + time * speed;
}

export function clampDetailScroll(scroll: number, maxScroll: number): number {
  if (!Number.isFinite(scroll)) return 0;
  return Math.max(0, Math.min(scroll, Math.max(0, maxScroll)));
}

/**
 * Horizontal detail layout: planets are ordered by their real orbital
 * distance and mapped onto a logarithmic axis so that close-in planets do
 * not collapse into the star. A minimum gap keeps every planet clickable.
 */
export function detailLayout(
  planets: readonly Planet[],
  viewportWidth: number,
  viewportHeight: number,
  scroll = 0
): DetailLayout {
  const sorted = sortPlanetsByDistance(planets);
  const width = Math.max(1, viewportWidth);
  const height = Math.max(1, viewportHeight);

  const star = {
    x: DETAIL_LEFT_MARGIN + DETAIL_STAR_RADIUS,
    y: height / 2,
    radius: DETAIL_STAR_RADIUS,
  };

  const startX = star.x + star.radius + DETAIL_STAR_GAP;
  const count = sorted.length;

  if (count === 0) {
    return {
      placements: [],
      star,
      contentWidth: width,
      maxScroll: 0,
      scroll: 0,
    };
  }

  const radii = sorted.map(detailPlanetRadius);
  // Reserve room for the largest disc so an ordinary system fits the viewport
  // without a scrollbar; only real minimum-gap overflow creates scrolling.
  const maxRadius = Math.max(...radii);
  const naturalWidth = Math.max(
    0,
    width - DETAIL_RIGHT_MARGIN - maxRadius - startX
  );
  const span = Math.max(naturalWidth, (count - 1) * DETAIL_MIN_GAP);
  const distances = sorted.map((p) => Math.log1p(Math.max(0, p.orbitDistanceAu)));
  const logMin = distances[0];
  const logMax = distances[distances.length - 1];
  const logSpan = logMax - logMin;

  const rawX: number[] = [];
  for (let i = 0; i < count; i += 1) {
    // Equal distances fall back to an even distribution.
    const t = logSpan > 1e-9 ? (distances[i] - logMin) / logSpan : count > 1 ? i / (count - 1) : 0;
    rawX.push(startX + t * span);
  }

  if (count === 1) {
    rawX[0] = startX + naturalWidth * 0.45;
  } else {
    for (let i = 1; i < count; i += 1) {
      rawX[i] = Math.max(rawX[i], rawX[i - 1] + DETAIL_MIN_GAP);
    }
  }

  const contentRight = rawX[count - 1] + radii[count - 1] + DETAIL_RIGHT_MARGIN;
  const contentWidth = Math.max(width, contentRight);
  const maxScroll = Math.max(0, contentWidth - width);
  const clampedScroll = clampDetailScroll(scroll, maxScroll);

  const placements = sorted.map((planet, index) => ({
    planet,
    x: rawX[index] - clampedScroll,
    y: star.y,
    radius: radii[index],
  }));

  return { placements, star, contentWidth, maxScroll, scroll: clampedScroll };
}

/**
 * Scroll offset that brings a planet into view. The viewport width can be
 * derived from the layout because contentWidth only grows past it.
 */
export function findScrollForPlanet(layout: DetailLayout, planetId: string): number {
  const placement = layout.placements.find((p) => p.planet.id === planetId);
  if (!placement) return layout.scroll;
  const viewportWidth = layout.contentWidth - layout.maxScroll;
  const rawCenterX = placement.x + layout.scroll;
  return clampDetailScroll(rawCenterX - viewportWidth * 0.45, layout.maxScroll);
}

/**
 * Horizontal position of a belt in the detail view. Placements must be sorted
 * by orbital distance; a belt sits between its neighbouring planets and is
 * extrapolated beyond the outermost discs.
 */
export function detailBeltPosition(
  belt: AsteroidBelt,
  placements: readonly PlanetPlacement[]
): number | null {
  if (placements.length === 0) return null;
  const mid = belt.midpointAu;

  for (let i = 0; i < placements.length; i += 1) {
    const current = placements[i];
    if (mid <= current.planet.orbitDistanceAu) {
      if (i === 0) return current.x - current.radius - 40;
      const previous = placements[i - 1];
      const leftEdge = previous.x + previous.radius;
      const rightEdge = current.x - current.radius;
      return (leftEdge + rightEdge) / 2;
    }
  }

  const last = placements[placements.length - 1];
  return last.x + last.radius + 40;
}

/** Returns the planet whose disc (plus a small padding) contains the point. */
export function hitTestPlanets(
  placements: readonly PlanetPlacement[],
  point: Vec2,
  extraRadius = 4
): Planet | null {
  let best: Planet | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const placement of placements) {
    const distance = Math.hypot(placement.x - point.x, placement.y - point.y);
    if (distance <= placement.radius + extraRadius && distance < bestDistance) {
      best = placement.planet;
      bestDistance = distance;
    }
  }

  return best;
}
