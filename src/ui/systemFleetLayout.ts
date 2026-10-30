/**
 * Astraea 4X - Flottenmarker in den Systemansichten
 *
 * Beide Systemansichten (Umlaufbahn und Detail) nutzen dieselben Flottendaten
 * und dieselbe Platzierungslogik. Die Marker liegen bewusst außerhalb der
 * Planetenbahnen bzw. in der freien oberen Leiste, damit sie Planeten,
 * Beschriftungen und Bedienelemente nicht verdecken.
 */

import type { Planet } from '../core/types.ts';
import { computeOrbitRadius, type DetailLayout, type PlanetPlacement, type Vec2 } from './systemViewLayout.ts';

export interface FleetMarkerPlacement {
  fleetId: string;
  x: number;
  y: number;
  radius: number;
}

export const SYSTEM_FLEET_MARKER_RADIUS = 11;
/** Abstand der Flottenring-Bahn zur äußersten Planetenbahn (Weltkoordinaten). */
export const FLEET_RING_GAP = 62;
const FLEET_RING_FALLBACK_RADIUS = 150;
const DETAIL_MARKER_TOP = 56;
const DETAIL_MARKER_LEFT = 76;
const DETAIL_MARKER_GAP = 48;

/** Ordnet Flotten-IDs stabil zu, damit Zeichnung und Klick dieselbe Reihenfolge haben. */
export function sortFleetIds(fleetIds: readonly string[]): string[] {
  return [...fleetIds].sort((a, b) => a.localeCompare(b));
}

/**
 * Ringpositionen außerhalb der äußersten Planetenbahn. Der Ring skaliert mit
 * dem Zoom, damit die Marker in jeder Zoomstufe neben den Bahnen bleiben.
 */
export function orbitFleetMarkerPlacements(
  fleetIds: readonly string[],
  planets: readonly Planet[],
  zoom: number,
  center: Vec2,
): FleetMarkerPlacement[] {
  const ids = sortFleetIds(fleetIds);
  if (ids.length === 0) return [];

  const outermost = planets.reduce(
    (max, planet) => Math.max(max, computeOrbitRadius(planet)),
    0,
  );
  const ringRadius =
    (outermost > 0 ? outermost + FLEET_RING_GAP : FLEET_RING_FALLBACK_RADIUS) * zoom;
  const angleStep = (Math.PI * 2) / ids.length;

  return ids.map((fleetId, index) => {
    const angle = -Math.PI / 2 + index * angleStep;
    return {
      fleetId,
      x: center.x + Math.cos(angle) * ringRadius,
      y: center.y + Math.sin(angle) * ringRadius,
      radius: SYSTEM_FLEET_MARKER_RADIUS,
    };
  });
}

/**
 * Markerleiste am oberen Rand der Detailansicht. Sie liegt oberhalb der
 * Planetenreihe und scrollt nicht mit, bleibt also immer erreichbar.
 */
export function detailFleetMarkerPlacements(
  fleetIds: readonly string[],
  _layout: DetailLayout,
  viewportWidth: number,
): FleetMarkerPlacement[] {
  const ids = sortFleetIds(fleetIds);
  if (ids.length === 0) return [];

  const available = Math.max(1, viewportWidth - DETAIL_MARKER_LEFT * 2);
  const perRow = Math.max(1, Math.floor(available / DETAIL_MARKER_GAP));
  return ids.map((fleetId, index) => {
    const row = Math.floor(index / perRow);
    const column = index % perRow;
    return {
      fleetId,
      x: DETAIL_MARKER_LEFT + column * DETAIL_MARKER_GAP,
      y: DETAIL_MARKER_TOP + row * DETAIL_MARKER_GAP,
      radius: SYSTEM_FLEET_MARKER_RADIUS,
    };
  });
}

/** Nächster Marker unter dem Mauszeiger oder null. */
export function hitTestFleetMarkers(
  markers: readonly FleetMarkerPlacement[],
  point: Vec2,
  tolerance = 6,
): FleetMarkerPlacement | null {
  let best: FleetMarkerPlacement | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const marker of markers) {
    const distance = Math.hypot(marker.x - point.x, marker.y - point.y);
    if (distance <= marker.radius + tolerance && distance < bestDistance) {
      best = marker;
      bestDistance = distance;
    }
  }
  return best;
}

/** Prüft, ob ein Marker einen Planeten überdeckt (sollte nie passieren). */
export function markerOverlapsPlanets(
  markers: readonly FleetMarkerPlacement[],
  placements: readonly PlanetPlacement[],
): boolean {
  return markers.some((marker) =>
    placements.some((placement) => {
      const distance = Math.hypot(marker.x - placement.x, marker.y - placement.y);
      return distance < marker.radius + placement.radius + 4;
    }),
  );
}
