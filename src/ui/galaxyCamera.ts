/**
 * Astraea 4X - Kamera-Geometrie der Galaxiekarte
 *
 * Reine Helfer, damit Zoom und Position testbar bleiben. Die Kamera wird nur
 * beim ersten Anzeigen und bei einer echten neuen Galaxie zurückgesetzt; ein
 * Datenrefresh mit derselben Galaxie-ID darf Zoom und Position niemals ändern.
 */

export interface GalaxyCamera {
  zoom: number;
  panX: number;
  panY: number;
}

export interface GalaxyCameraInput {
  viewportWidth: number;
  viewportHeight: number;
  galaxyWidth: number;
  galaxyHeight: number;
  /** Fit-Faktor des sichtbaren Bereichs (Standard 0.75). */
  fitFactor?: number;
}

export const MIN_GALAXY_ZOOM = 0.3;
export const MAX_GALAXY_ZOOM = 1.1;

/** Startkamera: Galaxie zentriert und vollständig sichtbar. */
export function computeGalaxyCamera(input: GalaxyCameraInput): GalaxyCamera {
  const fitFactor = input.fitFactor ?? 0.75;
  const maxBound = Math.max(input.galaxyWidth, input.galaxyHeight, 1);
  const fitZoom = Math.min(
    (input.viewportWidth * fitFactor) / maxBound,
    (input.viewportHeight * fitFactor) / maxBound,
    MAX_GALAXY_ZOOM,
  );
  return {
    zoom: Math.max(MIN_GALAXY_ZOOM, fitZoom),
    panX: input.viewportWidth / 2,
    panY: input.viewportHeight / 2,
  };
}

/** Zentriert die bestehende Kamera auf ein Weltobjekt, ohne den Zoom zu ändern. */
export function focusCameraOn(
  camera: GalaxyCamera,
  viewportWidth: number,
  viewportHeight: number,
  worldX: number,
  worldY: number,
): GalaxyCamera {
  return {
    zoom: camera.zoom,
    panX: viewportWidth / 2 - worldX * camera.zoom,
    panY: viewportHeight / 2 - worldY * camera.zoom,
  };
}

/**
 * Stabile Identität einer Galaxie für Kamera-Resets. Nur ein neuer Seed, eine
 * neue ID oder neue Abmessungen gelten als neue Karte.
 */
export function galaxyCameraKey(galaxy: {
  id: string;
  config: { width: number; height: number };
}): string {
  return `${galaxy.id}:${galaxy.config.width}x${galaxy.config.height}`;
}
