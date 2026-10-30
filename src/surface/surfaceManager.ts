/**
 * Astraea 4X - Planetary Surface Manager
 * Tracks persistent surfaces, coordinates tile changes, Fog of War, and resource discovery.
 */

import { HexCoord, Planet, PlanetHexTile, PlanetSurface } from '../core/types.ts';
import { BIOME_CATALOG } from '../data/terrainCatalog.ts';
import { HexMath } from './hexMath.ts';
import { SurfaceGenerator } from './surfaceGenerator.ts';

export class SurfaceManager {
  private surfaces: Map<string, PlanetSurface> = new Map();

  /**
   * Retrieves or procedurally generates the persistent surface for a planet
   */
  public getOrCreateSurface(planet: Planet, galaxySeed: string): PlanetSurface {
    let surface = this.surfaces.get(planet.id);
    if (!surface) {
      surface = SurfaceGenerator.generateSurface(planet, galaxySeed);
      this.surfaces.set(planet.id, surface);
    }
    return surface;
  }

  public getSurface(planetId: string): PlanetSurface | null {
    return this.surfaces.get(planetId) ?? null;
  }

  public setSurface(surface: PlanetSurface): void {
    this.surfaces.set(surface.planetId, surface);
  }

  public getAllSurfaces(): PlanetSurface[] {
    return Array.from(this.surfaces.values());
  }

  public loadSurfaces(surfaces: PlanetSurface[]): void {
    this.surfaces.clear();
    for (const surf of surfaces) {
      this.surfaces.set(surf.planetId, surf);
    }
  }

  public clear(): void {
    this.surfaces.clear();
  }

  /**
   * Reveals tiles around a center coordinate up to a given vision radius (Fog of War)
   */
  public revealTilesAround(planetId: string, center: HexCoord, radius: number): PlanetHexTile[] {
    const surface = this.getSurface(planetId);
    if (!surface) return [];

    const revealed: PlanetHexTile[] = [];
    const tilesMap = new Map<string, PlanetHexTile>();
    surface.tiles.forEach((t) => tilesMap.set(t.key, t));

    for (let r = 0; r <= radius; r++) {
      const ring = HexMath.getRing(center, r);
      for (const coord of ring) {
        const key = HexMath.coordToKey(coord);
        const tile = tilesMap.get(key);
        if (tile) {
          tile.visibility = 'visible';
          revealed.push(tile);
        }
      }
    }

    return revealed;
  }

  /**
   * Reveals a hidden subterranean resource deposit on a tile
   */
  public revealDeposit(planetId: string, coord: HexCoord): boolean {
    const surface = this.getSurface(planetId);
    if (!surface) return false;

    const key = HexMath.coordToKey(coord);
    const tile = surface.tiles.find((t) => t.key === key);
    if (tile && tile.deposit !== 'none' && !tile.isDepositDiscovered) {
      tile.isDepositDiscovered = true;
      return true;
    }
    return false;
  }

  /**
   * Finds the best starting hex for a new colony landing
   */
  public findOptimalColonyLandingSite(surface: PlanetSurface): HexCoord {
    // Prefer plains with food or minerals and no hazards, near center of map.
    // Unpassierbare Biome (Ozean, Lavasee, Gaswolken, Hochgebirge) sind keine
    // gültigen Landeplätze.
    const candidates = surface.tiles.filter(
      (t) => !BIOME_CATALOG[t.biome].isImpassable && !t.hasHazard && !t.claimedByColonyId
    );

    if (candidates.length === 0) {
      return surface.tiles[0].coord;
    }

    // Sort by plains preference, then deposit, closest to map center
    const centerQ = Math.floor(surface.width / 4);
    const centerR = Math.floor(surface.height / 2);
    const centerTarget = { q: centerQ, r: centerR };

    candidates.sort((a, b) => {
      const distA = HexMath.distance(a.coord, centerTarget);
      const distB = HexMath.distance(b.coord, centerTarget);
      const scoreA = (a.biome === 'plains' ? 10 : 0) - distA;
      const scoreB = (b.biome === 'plains' ? 10 : 0) - distB;
      return scoreB - scoreA;
    });

    return candidates[0].coord;
  }
}
