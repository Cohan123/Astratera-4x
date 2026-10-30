/**
 * Astraea 4X - Reine Helfer für die Routenplanung auf der Galaxiekarte
 *
 * Die Helfer enthalten keine React- oder Engine-Abhängigkeiten, damit die
 * Entscheidungen testbar bleiben: Wer darf planen, was bedeutet ein Klick auf
 * ein System und wie wird eine Systemkette in Bildschirmpunkte projiziert.
 * Die Projektion rechnet ausschließlich aus Weltkoordinaten und der aktuellen
 * Kamera; Bildschirmkoordinaten werden nie gespeichert.
 */

import type { Fleet, StarSystem } from '../core/types.ts';

export interface ScreenPoint {
  x: number;
  y: number;
}

/** Nur eigene Verbände dürfen eine Route planen. */
export function canStartRoutePlanning(fleet: Fleet | null, playerCivId: string): boolean {
  return Boolean(fleet && fleet.civId === playerCivId);
}

export type GalaxyClickAction =
  /** Kein eigener Verband ausgewählt: Auswahl aufheben, nichts bewegen. */
  | 'ignore'
  /** Routenplanung aktiv: gültiges Ziel prüfen und sofort committen. */
  | 'commit-plan'
  /** Altes Zwei-Klick-Verfahren: zweiter Klick auf dasselbe System. */
  | 'legacy-commit'
  /** Altes Zwei-Klick-Verfahren: erster Klick zeigt nur die Vorschau. */
  | 'legacy-preview';

/**
 * Entscheidet, was ein Klick auf ein Sternensystem auslöst. Ein Klick auf
 * andere UI-Teile läuft nicht durch diese Funktion und kann daher keine
 * Bewegung starten.
 */
export function decideGalaxySystemClick(params: {
  isRoutePlanning: boolean;
  hasSelectedPlayerFleet: boolean;
  clickedSystemId: string;
  pendingTargetSystemId: string | null;
}): GalaxyClickAction {
  if (!params.hasSelectedPlayerFleet) return 'ignore';
  if (params.isRoutePlanning) return 'commit-plan';
  if (params.pendingTargetSystemId === params.clickedSystemId) return 'legacy-commit';
  return 'legacy-preview';
}

/**
 * Projiziert eine Systemkette für die Kartendarstellung. Nicht gefundene
 * Systeme werden übersprungen; die Reihenfolge bleibt erhalten.
 */
export function routePolylineScreenPoints(
  systemIds: readonly string[],
  systemsById: ReadonlyMap<string, StarSystem>,
  project: (worldX: number, worldY: number) => ScreenPoint,
): ScreenPoint[] {
  const points: ScreenPoint[] = [];
  for (const systemId of systemIds) {
    const system = systemsById.get(systemId);
    if (!system) continue;
    points.push(project(system.x, system.y));
  }
  return points;
}

/** Statuszeile für den Routenplanungsmodus; null außerhalb des Modus. */
export function routePlanningStatusText(isRoutePlanning: boolean): string | null {
  return isRoutePlanning ? 'Routenplanung aktiv – Zielsystem auswählen' : null;
}
