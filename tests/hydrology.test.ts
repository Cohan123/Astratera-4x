/**
 * Astraea 4X - Hydrologie-Test Suite
 * Prüft die Priority-Flood-basierte Fließrichtungs-, Seen- und Abflussberechnung
 * unabhängig vom Oberflächengenerator auf synthetischen Hexgittern.
 */

import { describe, expect, it } from 'vitest';
import { Hydrology, HydrologyTileInput } from '../src/surface/hydrology.ts';
import { HexMath } from '../src/surface/hexMath.ts';
import { HexCoord } from '../src/core/types.ts';

/**
 * Baut ein rechteckiges Hexgitter in derselben Offset-Zeilen-Geometrie wie der
 * Oberflächengenerator: Zeile r reicht von q = -floor(r/2) bis
 * q = width - 1 - floor(r/2).
 */
function buildGrid(
  width: number,
  height: number,
  elevationFor: (q: number, r: number) => number,
  isOcean?: (q: number, r: number) => boolean
): HydrologyTileInput[] {
  const tiles: HydrologyTileInput[] = [];
  for (let r = 0; r < height; r++) {
    const rOffset = Math.floor(r / 2);
    for (let q = -rOffset; q < width - rOffset; q++) {
      const coord: HexCoord = { q, r };
      tiles.push({
        coord,
        key: HexMath.coordToKey(coord),
        elevationRaw: elevationFor(q, r),
        isOcean: isOcean ? isOcean(q, r) : false,
      });
    }
  }
  return tiles;
}

/** Anzahl der auf dem Gitter vorhandenen Nachbarn je Kachel. */
function neighborCounts(tiles: HydrologyTileInput[]): number[] {
  const keys = new Set(tiles.map((tile) => tile.key));
  return tiles.map(
    (tile) =>
      HexMath.getNeighbors(tile.coord).filter((coord) => keys.has(HexMath.coordToKey(coord))).length
  );
}

describe('Hydrologie', () => {
  it('(a) Wasser steht nie unter der Rohelevation, Nicht-Auslässe fließen zu einem Ziel', () => {
    const tiles = buildGrid(10, 8, (q, r) => 0.1 + 0.02 * ((r * 3 + q * 5 + 40) % 11));
    const result = Hydrology.compute(tiles);
    const counts = neighborCounts(tiles);

    for (let i = 0; i < tiles.length; i++) {
      expect(result.waterLevel[i]).toBeGreaterThanOrEqual(tiles[i].elevationRaw - 1e-9);

      const target = result.flowTarget[i];
      if (target === null) {
        // Nur Auslässe (Ozean oder Kartenrand) bleiben ohne Ziel.
        expect(tiles[i].isOcean || counts[i] < 6).toBe(true);
      } else {
        // Wasser fließt bergab: Das Ziel liegt (mindestens um Epsilon) tiefer.
        expect(result.waterLevel[target]).toBeLessThan(result.waterLevel[i]);
      }

      if (!tiles[i].isOcean && counts[i] === 6) {
        expect(target).not.toBeNull();
      }
    }
  });

  it('(b) Eine umrandete Senke wird als See erkannt', () => {
    const center: HexCoord = { q: 0, r: 3 };
    const centerKey = HexMath.coordToKey(center);
    const basin = new Set<string>([
      centerKey,
      ...HexMath.getNeighbors(center).map((coord) => HexMath.coordToKey(coord)),
    ]);

    const tiles = buildGrid(9, 7, (q, r) => {
      const key = HexMath.coordToKey({ q, r });
      if (key === centerKey) return 0.01;
      return basin.has(key) ? 0.05 : 0.5;
    });
    const result = Hydrology.compute(tiles);

    const centerIndex = tiles.findIndex((tile) => tile.key === centerKey);
    expect(centerIndex).toBeGreaterThanOrEqual(0);
    expect(result.isLake[centerIndex]).toBe(true);
    expect(result.waterLevel[centerIndex]).toBeGreaterThan(
      tiles[centerIndex].elevationRaw + Hydrology.LAKE_MIN_RISE
    );

    const rimIndex = tiles.findIndex((tile) => !basin.has(tile.key));
    expect(rimIndex).toBeGreaterThanOrEqual(0);
    expect(result.isLake[rimIndex]).toBe(false);
  });

  it('(c) Abfluss bleibt erhalten: eigene Einheit plus Summe aller Zuflüsse', () => {
    const tiles = buildGrid(8, 8, (q, r) => 0.1 + 0.03 * ((r * 5 + q * 7 + 50) % 13));
    const result = Hydrology.compute(tiles);

    const inflow = new Array<number>(tiles.length).fill(0);
    for (let i = 0; i < tiles.length; i++) {
      const target = result.flowTarget[i];
      if (target !== null) inflow[target] += result.discharge[i];
    }

    for (let i = 0; i < tiles.length; i++) {
      expect(result.discharge[i]).toBeCloseTo(1 + inflow[i], 9);
      const target = result.flowTarget[i];
      if (target !== null) {
        // Abfluss folgt dem Gefälle, das Zielniveau ist strikt niedriger.
        expect(result.waterLevel[target]).toBeLessThan(result.waterLevel[i]);
      }
    }
  });

  it('(d) Die Berechnung ist deterministisch', () => {
    const tiles = buildGrid(8, 7, (q, r) => 0.15 + 0.04 * ((r * 2 + q * 3 + 30) % 7));
    expect(Hydrology.compute(tiles)).toEqual(Hydrology.compute(tiles));
  });

  it('(e) Ozeankacheln sind Auslässe ohne Fluss- oder See-Status', () => {
    const tiles = buildGrid(
      8,
      8,
      (q, r) => 0.3 + 0.02 * ((r + q + 40) % 9),
      (_q, r) => r === 0
    );
    const result = Hydrology.compute(tiles);

    for (let i = 0; i < tiles.length; i++) {
      if (!tiles[i].isOcean) continue;
      expect(result.flowTarget[i]).toBeNull();
      expect(result.isLake[i]).toBe(false);
      expect(result.isRiver[i]).toBe(false);
    }
  });

  it('(f) Reine Landkarten entwässern vollständig zum Kartenrand', () => {
    const tiles = buildGrid(9, 7, (q, r) => 0.2 + 0.01 * ((r * 2 + q + 40) % 5));
    const result = Hydrology.compute(tiles);
    const counts = neighborCounts(tiles);

    for (let i = 0; i < tiles.length; i++) {
      let current: number | null = i;
      let steps = 0;
      while (current !== null) {
        expect(steps).toBeLessThanOrEqual(tiles.length);
        current = result.flowTarget[current];
        steps++;
      }
      expect(current).toBeNull();
    }

    const hasBoundarySink = tiles.some(
      (_tile, i) => counts[i] < 6 && result.flowTarget[i] === null
    );
    expect(hasBoundarySink).toBe(true);
  });

  it('(g) Flussstatus folgt Schwellwert und Landzugehörigkeit', () => {
    const tiles = buildGrid(12, 10, (q, r) => 0.9 - r * 0.08 + (q % 3) * 0.001);
    const result = Hydrology.compute(tiles);

    let riverCount = 0;
    for (let i = 0; i < tiles.length; i++) {
      const expected = !tiles[i].isOcean && result.discharge[i] >= Hydrology.RIVER_THRESHOLD;
      expect(result.isRiver[i]).toBe(expected);
      if (result.isRiver[i]) riverCount++;
    }
    expect(riverCount).toBeGreaterThan(0);
  });
});
