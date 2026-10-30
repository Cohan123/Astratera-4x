/**
 * Astraea 4X - Axial Hex Grid Mathematics & Pathfinding
 * Standard flat-top / pointy-top axial coordinate system: (q, r).
 * Includes distance metrics, neighboring algorithms, and A* pathfinding.
 */

import { BIOME_CATALOG } from '../data/terrainCatalog.ts';
import { HexCoord, PlanetHexTile } from '../core/types.ts';

// 6 Axial Directions for pointy-topped hexagons
export const AXIAL_DIRECTIONS: readonly HexCoord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export class HexMath {
  /**
   * Generates unique string key for coordinates
   */
  public static key(q: number, r: number): string {
    return `${q},${r}`;
  }

  public static coordToKey(coord: HexCoord): string {
    return `${coord.q},${coord.r}`;
  }

  public static keyToCoord(key: string): HexCoord {
    const parts = key.split(',');
    return {
      q: parseInt(parts[0], 10),
      r: parseInt(parts[1], 10),
    };
  }

  /**
   * Hex distance in axial coordinates
   */
  public static distance(a: HexCoord, b: HexCoord): number {
    return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
  }

  /**
   * Retrieves the 6 immediate neighbors of an axial hex coordinate
   */
  public static getNeighbors(coord: HexCoord): HexCoord[] {
    return AXIAL_DIRECTIONS.map((dir) => ({
      q: coord.q + dir.q,
      r: coord.r + dir.r,
    }));
  }

  /**
   * Converts pointy-topped axial coordinate to 2D pixel coordinates (center of hex)
   */
  public static axialToPixel(coord: HexCoord, hexRadius: number): { x: number; y: number } {
    const x = hexRadius * (Math.sqrt(3) * coord.q + (Math.sqrt(3) / 2) * coord.r);
    const y = hexRadius * ((3 / 2) * coord.r);
    return { x, y };
  }

  /**
   * Converts 2D pixel coordinates to nearest axial hex coordinate
   */
  public static pixelToAxial(x: number, y: number, hexRadius: number): HexCoord {
    const qFrac = ((Math.sqrt(3) / 3) * x - (1 / 3) * y) / hexRadius;
    const rFrac = ((2 / 3) * y) / hexRadius;
    return HexMath.cubeRound(qFrac, -qFrac - rFrac, rFrac);
  }

  /**
   * Rounds fractional cube coordinates to nearest integer hex
   */
  public static cubeRound(fracQ: number, fracS: number, fracR: number): HexCoord {
    let q = Math.round(fracQ);
    let s = Math.round(fracS);
    let r = Math.round(fracR);

    const qDiff = Math.abs(q - fracQ);
    const sDiff = Math.abs(s - fracS);
    const rDiff = Math.abs(r - fracR);

    if (qDiff > sDiff && qDiff > rDiff) {
      q = -s - r;
    } else if (sDiff > rDiff) {
      s = -q - r;
    } else {
      r = -q - s;
    }

    return { q, r };
  }

  /**
   * Calculates coordinates in a ring of given radius around a center
   */
  public static getRing(center: HexCoord, radius: number): HexCoord[] {
    if (radius === 0) return [{ ...center }];
    const results: HexCoord[] = [];
    let current: HexCoord = {
      q: center.q + AXIAL_DIRECTIONS[4].q * radius,
      r: center.r + AXIAL_DIRECTIONS[4].r * radius,
    };

    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < radius; j++) {
        results.push({ ...current });
        current = {
          q: current.q + AXIAL_DIRECTIONS[i].q,
          r: current.r + AXIAL_DIRECTIONS[i].r,
        };
      }
    }
    return results;
  }

  /**
   * A* Pathfinding across the hexagonal surface taking terrain movement costs into account
   */
  public static findPath(
    start: HexCoord,
    goal: HexCoord,
    tilesMap: Map<string, PlanetHexTile>,
    maxSearchDepth: number = 30
  ): HexCoord[] | null {
    const startKey = HexMath.coordToKey(start);
    const goalKey = HexMath.coordToKey(goal);

    if (startKey === goalKey) return [];

    const goalTile = tilesMap.get(goalKey);
    if (!goalTile) return null;
    const goalBiome = BIOME_CATALOG[goalTile.biome];
    if (goalBiome.isImpassable) return null;

    interface Node {
      coord: HexCoord;
      key: string;
      g: number;
      h: number;
      f: number;
      parent: Node | null;
    }

    const openSet: Node[] = [];
    const closedSet: Set<string> = new Set();

    const startNode: Node = {
      coord: start,
      key: startKey,
      g: 0,
      h: HexMath.distance(start, goal),
      f: HexMath.distance(start, goal),
      parent: null,
    };

    openSet.push(startNode);

    while (openSet.length > 0) {
      // Find lowest f score
      let lowestIndex = 0;
      for (let i = 1; i < openSet.length; i++) {
        if (openSet[i].f < openSet[lowestIndex].f) {
          lowestIndex = i;
        }
      }

      const current = openSet.splice(lowestIndex, 1)[0];
      closedSet.add(current.key);

      if (current.key === goalKey) {
        // Reconstruct path
        const path: HexCoord[] = [];
        let curr: Node | null = current;
        while (curr && curr.parent) {
          path.unshift(curr.coord);
          curr = curr.parent;
        }
        return path;
      }

      if (closedSet.size > maxSearchDepth * 6) break;

      const neighbors = HexMath.getNeighbors(current.coord);
      for (const nCoord of neighbors) {
        const nKey = HexMath.coordToKey(nCoord);
        if (closedSet.has(nKey)) continue;

        const tile = tilesMap.get(nKey);
        if (!tile) continue; // Out of bounds
        const biome = BIOME_CATALOG[tile.biome];
        if (biome.isImpassable) continue;

        const tentativeG = current.g + biome.movementCost;
        let existing = openSet.find((node) => node.key === nKey);

        if (!existing) {
          const h = HexMath.distance(nCoord, goal);
          existing = {
            coord: nCoord,
            key: nKey,
            g: tentativeG,
            h,
            f: tentativeG + h,
            parent: current,
          };
          openSet.push(existing);
        } else if (tentativeG < existing.g) {
          existing.g = tentativeG;
          existing.f = tentativeG + existing.h;
          existing.parent = current;
        }
      }
    }

    return null; // No path found
  }
}
