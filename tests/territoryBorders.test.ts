/**
 * Astraea 4X - Territory Border Tests
 * Prüft die reine Grenzgeometrie: Voronoi-Kanten zwischen unterschiedlichen
 * Besitzern, Auslassung gleicher Besitzer und unbeanspruchter Nachbarn,
 * deterministische Ausgabe sowie die lokale Begrenzung des Clipping-Fensters.
 * Die Tests arbeiten ohne Canvas und ohne Spielzustand.
 */

import { describe, expect, it } from 'vitest';
import type { TerritorySite } from '../src/ui/territoryBorders.ts';
import {
  DEFAULT_TERRITORY_CLIP_RADIUS,
  computeTerritoryBorders,
} from '../src/ui/territoryBorders.ts';

function site(
  id: string,
  x: number,
  y: number,
  ownerFactionId: string | null
): TerritorySite {
  return { id, x, y, ownerFactionId };
}

describe('computeTerritoryBorders', () => {
  it('liefert ohne Systeme keine Segmente', () => {
    expect(computeTerritoryBorders([])).toEqual([]);
  });

  it('liefert mit einem einzelnen System keine Segmente', () => {
    expect(computeTerritoryBorders([site('sys-a', 0, 0, 'civ-1')])).toEqual([]);
  });

  it('liefert ohne Besitzer keine Segmente', () => {
    const result = computeTerritoryBorders([
      site('sys-a', 0, 0, null),
      site('sys-b', 100, 0, null),
    ]);
    expect(result).toEqual([]);
  });

  it('zeichnet eine Grenze auf der Mittelsenkrechten zweier Besitzer', () => {
    const [border, ...rest] = computeTerritoryBorders([
      site('sys-a', 0, 0, 'civ-1'),
      site('sys-b', 100, 0, 'civ-2'),
    ]);

    expect(rest).toHaveLength(0);
    expect(border.fromSystemId).toBe('sys-a');
    expect(border.toSystemId).toBe('sys-b');
    expect(border.ownerFactionId).toBe('civ-1');
    expect(border.otherOwnerFactionId).toBe('civ-2');
    expect(border.x1).toBeCloseTo(50, 6);
    expect(border.x2).toBeCloseTo(50, 6);
    expect(Math.abs(border.y2 - border.y1)).toBeCloseTo(2 * DEFAULT_TERRITORY_CLIP_RADIUS, 6);
    expect(border.length).toBeCloseTo(2 * DEFAULT_TERRITORY_CLIP_RADIUS, 6);
  });

  it('zeichnet keine Grenze innerhalb eines Territoriums', () => {
    const result = computeTerritoryBorders([
      site('sys-a', 0, 0, 'civ-1'),
      site('sys-b', 100, 0, 'civ-1'),
    ]);
    expect(result).toEqual([]);
  });

  it('zeichnet keine Grenze zur unbeanspruchten Leere', () => {
    const result = computeTerritoryBorders([
      site('sys-a', 0, 0, 'civ-1'),
      site('sys-b', 100, 0, null),
    ]);
    expect(result).toEqual([]);
  });

  it('ignoriert gleichfarbige Nachbarn in einer Kette', () => {
    const systems = [
      site('sys-a', 0, 0, 'civ-1'),
      site('sys-b', 100, 0, 'civ-1'),
      site('sys-c', 200, 0, 'civ-2'),
    ];
    const result = computeTerritoryBorders(systems);

    expect(result).toHaveLength(1);
    expect(result[0].fromSystemId).toBe('sys-b');
    expect(result[0].toSystemId).toBe('sys-c');
    expect(result[0].ownerFactionId).toBe('civ-1');
    expect(result[0].otherOwnerFactionId).toBe('civ-2');
    expect(result[0].x1).toBeCloseTo(150, 6);
    expect(result[0].x2).toBeCloseTo(150, 6);
  });

  it('liefert für einen Besitzer in der Leere keine Grenze', () => {
    const result = computeTerritoryBorders([
      site('sys-center', 0, 0, 'civ-1'),
      site('sys-n', 0, -100, null),
      site('sys-e', 100, 0, null),
      site('sys-s', 0, 100, null),
      site('sys-w', -100, 0, null),
    ]);
    expect(result).toEqual([]);
  });

  it('ist unabhängig von der Eingabereihenfolge', () => {
    const systems = [
      site('sys-a', 0, 0, 'civ-1'),
      site('sys-b', 100, 0, 'civ-2'),
      site('sys-c', 50, 90, 'civ-3'),
      site('sys-d', 50, -90, null),
    ];
    const forward = computeTerritoryBorders(systems);
    const reversed = computeTerritoryBorders([...systems].reverse());

    expect(forward.length).toBeGreaterThan(0);
    expect(reversed).toEqual(forward);
  });

  it('begrenzt Grenzen auf das lokale Clipping-Fenster', () => {
    const result = computeTerritoryBorders([
      site('sys-a', 0, 0, 'civ-1'),
      site('sys-b', 1000, 0, 'civ-2'),
    ]);
    expect(result).toEqual([]);
  });

  it('verbindet vier Territorien zu einem durchgehenden Kreuz', () => {
    const result = computeTerritoryBorders([
      site('sys-1', -100, -100, 'civ-1'),
      site('sys-2', 100, -100, 'civ-2'),
      site('sys-3', -100, 100, 'civ-3'),
      site('sys-4', 100, 100, 'civ-4'),
    ]);

    expect(result).toHaveLength(4);

    const vertical = result.filter((segment) => Math.abs(segment.x1 - segment.x2) < 1e-6);
    const horizontal = result.filter((segment) => Math.abs(segment.y1 - segment.y2) < 1e-6);
    expect(vertical).toHaveLength(2);
    expect(horizontal).toHaveLength(2);

    const yCoordinates = vertical.flatMap((segment) => [segment.y1, segment.y2]);
    const xCoordinates = horizontal.flatMap((segment) => [segment.x1, segment.x2]);
    expect(Math.min(...yCoordinates)).toBeCloseTo(-100 - DEFAULT_TERRITORY_CLIP_RADIUS, 6);
    expect(Math.max(...yCoordinates)).toBeCloseTo(100 + DEFAULT_TERRITORY_CLIP_RADIUS, 6);
    expect(Math.min(...xCoordinates)).toBeCloseTo(-100 - DEFAULT_TERRITORY_CLIP_RADIUS, 6);
    expect(Math.max(...xCoordinates)).toBeCloseTo(100 + DEFAULT_TERRITORY_CLIP_RADIUS, 6);

    const verticalLength = vertical.reduce((sum, segment) => sum + segment.length, 0);
    const horizontalLength = horizontal.reduce((sum, segment) => sum + segment.length, 0);
    expect(verticalLength).toBeCloseTo(2 * (100 + DEFAULT_TERRITORY_CLIP_RADIUS), 6);
    expect(horizontalLength).toBeCloseTo(2 * (100 + DEFAULT_TERRITORY_CLIP_RADIUS), 6);

    for (const segment of vertical) {
      expect(segment.x1).toBeCloseTo(0, 6);
      expect(segment.x2).toBeCloseTo(0, 6);
    }
    for (const segment of horizontal) {
      expect(segment.y1).toBeCloseTo(0, 6);
      expect(segment.y2).toBeCloseTo(0, 6);
    }
  });

  it('reagiert auf einen Besitzerwechsel', () => {
    const before = computeTerritoryBorders([
      site('sys-a', 0, 0, 'civ-1'),
      site('sys-b', 100, 0, 'civ-1'),
    ]);
    const after = computeTerritoryBorders([
      site('sys-a', 0, 0, 'civ-1'),
      site('sys-b', 100, 0, 'civ-2'),
    ]);

    expect(before).toEqual([]);
    expect(after).toHaveLength(1);
  });

  it('emittiert jedes Systempaar genau einmal', () => {
    const result = computeTerritoryBorders([
      site('sys-a', 0, 0, 'civ-1'),
      site('sys-b', 100, 0, 'civ-2'),
      site('sys-c', 0, 100, 'civ-3'),
    ]);

    const pairs = result.map((segment) => `${segment.fromSystemId}>${segment.toSystemId}`);
    expect(new Set(pairs).size).toBe(pairs.length);
    for (const segment of result) {
      expect(segment.fromSystemId < segment.toSystemId).toBe(true);
    }
  });

  it('verwirft numerische Splitter unterhalb der Mindestlänge', () => {
    const result = computeTerritoryBorders(
      [site('sys-a', 0, 0, 'civ-1'), site('sys-b', 100, 0, 'civ-2')],
      { minSegmentLength: 1000 }
    );
    expect(result).toEqual([]);
  });

  it('übernimmt einen eigenen Clipping-Radius', () => {
    const result = computeTerritoryBorders(
      [site('sys-a', 0, 0, 'civ-1'), site('sys-b', 100, 0, 'civ-2')],
      { clipRadius: 60 }
    );
    expect(result).toHaveLength(1);
    expect(result[0].length).toBeCloseTo(120, 6);
    expect(result[0].y1).toBeCloseTo(-60, 6);
    expect(result[0].y2).toBeCloseTo(60, 6);
  });
});
