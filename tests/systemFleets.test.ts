/**
 * Astraea 4X - Flottenmarker und Kamera-Stabilität
 *
 * Beide Systemansichten nutzen dieselbe Platzierungslogik. Die Marker müssen
 * außerhalb der Planetenbahnen bzw. oberhalb der Detailreihe liegen, per Klick
 * eindeutig trefferbar sein und dürfen Planeten nicht überdecken. Zusätzlich
 * darf ein Datenrefresh derselben Galaxie den Zoom nicht zurücksetzen.
 */

import { describe, expect, it } from 'vitest';
import { Galaxy } from '../src/core/types.ts';
import { GalaxyGenerator } from '../src/generation/galaxyGenerator.ts';
import {
  computeGalaxyCamera,
  focusCameraOn,
  galaxyCameraKey,
  MAX_GALAXY_ZOOM,
  MIN_GALAXY_ZOOM,
} from '../src/ui/galaxyCamera.ts';
import {
  detailFleetMarkerPlacements,
  hitTestFleetMarkers,
  markerOverlapsPlanets,
  orbitFleetMarkerPlacements,
  sortFleetIds,
} from '../src/ui/systemFleetLayout.ts';
import {
  computeOrbitRadius,
  detailLayout,
  orbitPlanetPosition,
  planetVisualRadius,
} from '../src/ui/systemViewLayout.ts';

const config = {
  size: 'small' as const,
  systemCount: 8,
  width: 600,
  height: 600,
  minDistance: 45,
  shape: 'spiral' as const,
  seed: 'FLEET-MARKER-SEED',
};

function samplePlanets() {
  const galaxy: Galaxy = GalaxyGenerator.generate(config);
  return galaxy.systems.flatMap((system) => system.planets ?? []).slice(0, 5);
}

describe('Astraea 4X - Flottenmarker in den Systemansichten', () => {
  it('1. Orbitmarker liegen außerhalb der äußersten Planetenbahn und überdecken nichts', () => {
    const planets = samplePlanets();
    const center = { x: 480, y: 320 };
    const zoom = 1.2;
    const markers = orbitFleetMarkerPlacements(['fleet-b', 'fleet-a'], planets, zoom, center);

    expect(markers).toHaveLength(2);
    // Stabile Sortierung: Zeichnung und Klick treffen dieselbe Reihenfolge.
    expect(markers.map((marker) => marker.fleetId)).toEqual(['fleet-a', 'fleet-b']);

    const outermost = planets.reduce((max, planet) => Math.max(max, computeOrbitRadius(planet)), 0);
    for (const marker of markers) {
      const distance = Math.hypot(marker.x - center.x, marker.y - center.y);
      expect(distance).toBeGreaterThan(outermost * zoom);
    }

    const placements = planets.map((planet) => {
      const position = orbitPlanetPosition(planet, planet.currentAngleRad, zoom, center);
      return {
        planet,
        x: position.x,
        y: position.y,
        radius: planetVisualRadius(planet, zoom),
      };
    });
    expect(markerOverlapsPlanets(markers, placements)).toBe(false);
  });

  it('2. Detailmarker stehen oberhalb der Planetenreihe und bleiben klickbar', () => {
    const planets = samplePlanets();
    const layout = detailLayout(planets, 1200, 600);
    const markers = detailFleetMarkerPlacements(['fleet-1', 'fleet-2', 'fleet-3'], layout, 1200);

    expect(markers).toHaveLength(3);
    for (const marker of markers) {
      expect(marker.y).toBeLessThan(layout.star.y);
    }
    expect(markerOverlapsPlanets(markers, layout.placements)).toBe(false);

    const hit = hitTestFleetMarkers(markers, { x: markers[1].x, y: markers[1].y });
    expect(hit?.fleetId).toBe('fleet-2');
    expect(hitTestFleetMarkers(markers, { x: -50, y: -50 })).toBeNull();
  });

  it('3. Leere Flottenlisten erzeugen keine Marker', () => {
    const planets = samplePlanets();
    expect(orbitFleetMarkerPlacements([], planets, 1, { x: 0, y: 0 })).toEqual([]);
    expect(detailFleetMarkerPlacements([], detailLayout(planets, 800, 500), 800)).toEqual([]);
    expect(sortFleetIds([])).toEqual([]);
  });
});

describe('Astraea 4X - Galaxiekamera', () => {
  it('4. Kameraschlüssel bleibt bei Datenrefresh stabil, ändert sich bei neuer Galaxie', () => {
    const galaxy = GalaxyGenerator.generate(config);
    const cloned: Galaxy = { ...galaxy, systems: [...galaxy.systems] };

    expect(galaxyCameraKey(cloned)).toBe(galaxyCameraKey(galaxy));

    const next = GalaxyGenerator.generate({ ...config, seed: 'ANDERE-GALAXIE' });
    expect(galaxyCameraKey(next)).not.toBe(galaxyCameraKey(galaxy));
  });

  it('5. Startkamera ist begrenzt, zentriert und zoomt kleine Galaxien nicht über', () => {
    const camera = computeGalaxyCamera({
      viewportWidth: 1600,
      viewportHeight: 900,
      galaxyWidth: 600,
      galaxyHeight: 600,
    });
    expect(camera.zoom).toBeLessThanOrEqual(MAX_GALAXY_ZOOM);
    expect(camera.zoom).toBeGreaterThanOrEqual(MIN_GALAXY_ZOOM);
    expect(camera.panX).toBe(800);
    expect(camera.panY).toBe(450);

    const tiny = computeGalaxyCamera({
      viewportWidth: 200,
      viewportHeight: 120,
      galaxyWidth: 4000,
      galaxyHeight: 4000,
    });
    expect(tiny.zoom).toBe(MIN_GALAXY_ZOOM);
  });

  it('6. Fokussieren ändert den Zoom nicht', () => {
    const before = { zoom: 0.83, panX: 120, panY: 80 };
    const after = focusCameraOn(before, 1000, 700, 400, 200);
    expect(after.zoom).toBe(before.zoom);
    expect(after.panX).not.toBe(before.panX);
  });
});
