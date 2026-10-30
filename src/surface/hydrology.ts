/**
 * Astraea 4X - Planetare Hydrologie
 *
 * Leitet aus der Rohelevation einer Hex-Karte Fließrichtungen, Seen und den
 * akkumulierten Oberflächenabfluss ab. Grundlage ist der Priority-Flood-
 * Algorithmus mit Epsilon-Aufschlag (Barnes et al.): Senken werden virtuell
 * geflutet, bis das Wasser über den niedrigsten Rand ablaufen kann. Dadurch
 * erhält jede Kachel eine eindeutige Fließrichtung zu einem der Auslässe, und
 * geschlossene Senken lassen sich als stehende Gewässer identifizieren.
 *
 * Auslässe sind alle Ozeankacheln sowie der Kartenrand. Der Kartenrand dient
 * zusätzlich als Auslass, damit auch Planeten ohne Meeresspiegel (Gasriesen,
 * vollständig verlandete Karten) hydrologisch geschlossen bleiben und nicht in
 * einer einzigen globalen Senke enden.
 *
 * Die Berechnung ist rein deterministisch: Bei gleicher Eingabe entsteht
 * dieselbe Fließrichtung. Bei gleichem Füllstand entscheidet der Kachelindex
 * über die Heap-Reihenfolge, nie die Reihenfolge der Einfügung.
 */

import { HexCoord } from '../core/types.ts';
import { HexMath } from './hexMath.ts';

/** Eingabedaten einer Kachel für die Hydrologie. */
export interface HydrologyTileInput {
  coord: HexCoord;
  key: string;
  /** Rohe Elevation 0..1 ohne Höhenband-Quantisierung. */
  elevationRaw: number;
  /** Ozeankacheln sind Auslässe (Band 0). */
  isOcean: boolean;
}

/** Ergebnis der hydrologischen Auswertung, indiziert wie die Eingabeliste. */
export interface HydrologyResult {
  /** Akkumulierter Oberflächenabfluss; Startwert 1 pro Kachel. */
  discharge: number[];
  /** Index der Zielkachel oder null bei Auslasskacheln. */
  flowTarget: (number | null)[];
  /** Stehende Binnenwasserfläche in einer Senke. */
  isLake: boolean[];
  /** Flusskachel: Land mit Abfluss über der Flussschwelle. */
  isRiver: boolean[];
  /** Geflutetes Niveau (Rohelevation bzw. Senkenfüllstand). */
  waterLevel: number[];
}

/**
 * Stabiler Min-Heap über (Füllstand, Kachelindex). Die zweite Sortierstufe ist
 * entscheidend für die Reproduzierbarkeit: Ohne sie hinge die Fließrichtung
 * von der Heap-internen Umsortierung ab.
 */
class LevelHeap {
  private readonly levels: number[] = [];
  private readonly indices: number[] = [];

  public get size(): number {
    return this.indices.length;
  }

  public push(level: number, index: number): void {
    this.levels.push(level);
    this.indices.push(index);
    this.siftUp(this.indices.length - 1);
  }

  public pop(): number {
    const top = this.indices[0];
    const last = this.indices.length - 1;
    this.swap(0, last);
    this.levels.pop();
    this.indices.pop();
    if (this.indices.length > 0) this.siftDown(0);
    return top;
  }

  private less(a: number, b: number): boolean {
    const levelA = this.levels[a];
    const levelB = this.levels[b];
    if (levelA !== levelB) return levelA < levelB;
    return this.indices[a] < this.indices[b];
  }

  private siftUp(start: number): void {
    let child = start;
    while (child > 0) {
      const parent = (child - 1) >> 1;
      if (!this.less(child, parent)) break;
      this.swap(child, parent);
      child = parent;
    }
  }

  private siftDown(start: number): void {
    const length = this.indices.length;
    let parent = start;
    for (;;) {
      const left = parent * 2 + 1;
      if (left >= length) break;
      const right = left + 1;
      let smallest = left;
      if (right < length && this.less(right, left)) smallest = right;
      if (!this.less(smallest, parent)) break;
      this.swap(parent, smallest);
      parent = smallest;
    }
  }

  private swap(a: number, b: number): void {
    const level = this.levels[a];
    this.levels[a] = this.levels[b];
    this.levels[b] = level;

    const index = this.indices[a];
    this.indices[a] = this.indices[b];
    this.indices[b] = index;
  }
}

export class Hydrology {
  /** Oberflächenabfluss ab dieser Kachelzahl gilt als Fluss. */
  public static readonly RIVER_THRESHOLD = 5;

  /** Epsilon-Aufschlag pro Flut-Schritt, verhindert flache Plateaus. */
  public static readonly EPSILON = 1e-5;

  /** Mindestanstieg über der Rohelevation, damit eine Senke als See gilt. */
  public static readonly LAKE_MIN_RISE = 0.005;

  /**
   * Berechnet Fließrichtungen, Seen und Abflussakkumulation.
   */
  public static compute(tiles: HydrologyTileInput[]): HydrologyResult {
    const count = tiles.length;
    const discharge = new Array<number>(count).fill(1);
    const flowTarget = new Array<number | null>(count).fill(null);
    const isLake = new Array<boolean>(count).fill(false);
    const isRiver = new Array<boolean>(count).fill(false);
    const waterLevel = new Array<number>(count).fill(0);

    if (count === 0) {
      return { discharge, flowTarget, isLake, isRiver, waterLevel };
    }

    const indexByKey = new Map<string, number>();
    for (let i = 0; i < count; i++) indexByKey.set(tiles[i].key, i);

    // Nachbarn einmalig auflösen; fehlende Nachbarn markieren den Kartenrand.
    const neighbors: number[][] = tiles.map((tile) => {
      const result: number[] = [];
      for (const coord of HexMath.getNeighbors(tile.coord)) {
        const index = indexByKey.get(HexMath.coordToKey(coord));
        if (index !== undefined) result.push(index);
      }
      return result;
    });

    const visited = new Uint8Array(count);
    const heap = new LevelHeap();

    const seed = (index: number): void => {
      if (visited[index]) return;
      visited[index] = 1;
      waterLevel[index] = tiles[index].elevationRaw;
      heap.push(waterLevel[index], index);
    };

    // Auslässe: Ozean und Kartenrand.
    for (let i = 0; i < count; i++) {
      if (tiles[i].isOcean || neighbors[i].length < 6) seed(i);
    }

    const popOrder: number[] = [];
    while (heap.size > 0) {
      const current = heap.pop();
      popOrder.push(current);

      for (const neighbor of neighbors[current]) {
        if (visited[neighbor]) continue;
        visited[neighbor] = 1;
        // Wasser steht mindestens auf der eigenen Höhe und fließt nur auf
        // bereits entwässerte, also nicht höhere Nachbarn ab.
        waterLevel[neighbor] = Math.max(
          tiles[neighbor].elevationRaw,
          waterLevel[current] + Hydrology.EPSILON
        );
        flowTarget[neighbor] = current;
        heap.push(waterLevel[neighbor], neighbor);
      }
    }

    for (let i = 0; i < count; i++) {
      if (tiles[i].isOcean) continue;
      isLake[i] = waterLevel[i] > tiles[i].elevationRaw + Hydrology.LAKE_MIN_RISE;
    }

    // Abfluss stromaufwärts akkumulieren: Die Pop-Reihenfolge ist absteigend
    // im Gelände, daher wird sie rückwärts durchlaufen.
    for (let i = popOrder.length - 1; i >= 0; i--) {
      const index = popOrder[i];
      const target = flowTarget[index];
      if (target !== null) discharge[target] += discharge[index];
    }

    for (let i = 0; i < count; i++) {
      if (tiles[i].isOcean) continue;
      isRiver[i] = discharge[i] >= Hydrology.RIVER_THRESHOLD;
    }

    return { discharge, flowTarget, isLake, isRiver, waterLevel };
  }
}
