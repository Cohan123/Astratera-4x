/**
 * Astraea 4X - Flottendarstellung auf der Galaxiekarte
 *
 * Prüft die reine Layout- und Klassifizierungslogik der Verbandsmarker:
 * eindeutige Silhouette je dominanter Schiffsklasse, ringförmige Anordnung
 * ohne exakte Überlagerung und ausreichender Abstand für Klicks.
 */

import { describe, expect, it } from 'vitest';
import {
  FLEET_CLASS_LABELS,
  FLEET_GLYPH_COLORS,
  dominantFleetClass,
  fleetMarkerOffset,
} from '../src/ui/components/GalaxyMapCanvas.tsx';
import { Fleet } from '../src/core/types.ts';

function fleetWith(shipDefIds: string[]): Fleet {
  return {
    id: `fleet-${shipDefIds.join('-')}`,
    name: 'Testverband',
    civId: 'player-empire',
    systemId: 'sys-1',
    ships: shipDefIds.map((shipDefId) => ({ shipDefId, count: 1 })),
    status: 'stationed',
    pathSystemIds: [],
    pathIndex: 0,
    destinationSystemId: null,
  };
}

describe('Astraea 4X - Flottenmarker', () => {
  it('1. Startflotte hat drei unterschiedliche Silhouetten und Farben', () => {
    expect(dominantFleetClass(fleetWith(['frigate']))).toBe('frigate');
    expect(dominantFleetClass(fleetWith(['scout_ship']))).toBe('scout');
    expect(dominantFleetClass(fleetWith(['colony_ship']))).toBe('colony');

    const classes = ['frigate', 'scout', 'colony'] as const;
    const colors = classes.map((key) => FLEET_GLYPH_COLORS[key]);
    expect(new Set(colors).size).toBe(3);
    expect(new Set(classes.map((key) => FLEET_CLASS_LABELS[key])).size).toBe(3);
  });

  it('2. Dominante Klasse folgt der schwersten Einheit im Verband', () => {
    expect(dominantFleetClass(fleetWith(['colony_ship', 'corvette']))).toBe('colony');
    expect(dominantFleetClass(fleetWith(['scout_ship', 'frigate']))).toBe('scout');
    expect(dominantFleetClass(fleetWith(['corvette', 'destroyer']))).toBe('destroyer');
  });

  it('3. Unbekannte Schiffsmuster fallen auf eine sichtbare Standardform zurück', () => {
    expect(dominantFleetClass(fleetWith(['unbekannt']))).toBe('corvette');
    expect(dominantFleetClass(fleetWith([]))).toBe('corvette');
  });

  it('4. Marker überlappen sich nie exakt', () => {
    for (const count of [1, 2, 3, 4, 6, 8, 12]) {
      const positions = Array.from({ length: count }, (_, index) =>
        fleetMarkerOffset(index, count, 1)
      );
      const keys = new Set(positions.map((pos) => `${pos.dx.toFixed(2)}:${pos.dy.toFixed(2)}`));
      expect(keys.size).toBe(count);
    }
  });

  it('5. Marker halten Mindestabstand für zuverlässige Klicks', () => {
    for (const count of [2, 3, 4, 6]) {
      const positions = Array.from({ length: count }, (_, index) =>
        fleetMarkerOffset(index, count, 1)
      );
      for (let a = 0; a < positions.length; a += 1) {
        for (let b = a + 1; b < positions.length; b += 1) {
          const distance = Math.hypot(
            positions[a].dx - positions[b].dx,
            positions[a].dy - positions[b].dy
          );
          expect(distance).toBeGreaterThan(14);
        }
      }
    }
  });

  it('6. Viele Verbände weichen auf einen zweiten Ring aus', () => {
    const inner = fleetMarkerOffset(0, 8, 1);
    const outer = fleetMarkerOffset(6, 8, 1);
    const innerRadius = Math.hypot(inner.dx, inner.dy);
    const outerRadius = Math.hypot(outer.dx, outer.dy);

    expect(outerRadius).toBeGreaterThan(innerRadius);
    expect(Math.hypot(outer.dx - inner.dx, outer.dy - inner.dy)).toBeGreaterThan(14);
  });

  it('7. Zoom beeinflusst die Markergröße, nicht die Eindeutigkeit', () => {
    const small = [0, 1, 2].map((index) => fleetMarkerOffset(index, 3, 0.3));
    const large = [0, 1, 2].map((index) => fleetMarkerOffset(index, 3, 2));
    expect(new Set(small.map((pos) => `${pos.dx.toFixed(2)}:${pos.dy.toFixed(2)}`)).size).toBe(3);
    expect(new Set(large.map((pos) => `${pos.dx.toFixed(2)}:${pos.dy.toFixed(2)}`)).size).toBe(3);
  });
});
