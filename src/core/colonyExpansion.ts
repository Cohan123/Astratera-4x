/**
 * Astraea 4X - Colony Territorial Expansion & Influence Engine
 * Enforces strict simulation-side validation of hex border claims, influence costs, and collision rules.
 */

import { Colony, HexCoord, PlanetHexTile, PlanetSurface } from './types.ts';
import { HexMath } from '../surface/hexMath.ts';

export interface ExpansionValidationResult {
  allowed: boolean;
  cost: number;
  reason?: string;
}

export class ColonyExpansion {
  /**
   * Calculates influence cost to claim a target hex tile
   * Formula: 15 + (5 * distanceToCityCenter) + (2 * alreadyClaimedCount)
   */
  public static calculateInfluenceCost(colony: Colony, targetCoord: HexCoord): number {
    const dist = HexMath.distance(colony.cityCenterCoord, targetCoord);
    const claimedCount = colony.claimedHexKeys.length;
    return Math.round(15 + 5 * dist + 2 * claimedCount);
  }

  public static calculateExpansionCost(colony: Colony, targetCoord: HexCoord): number {
    return ColonyExpansion.calculateInfluenceCost(colony, targetCoord);
  }

  /**
   * Returns all unowned hex tiles adjacent to the colony's current border
   */
  public static getExpansionCandidates(colony: Colony, surface: PlanetSurface): PlanetHexTile[] {
    const candidates = new Map<string, PlanetHexTile>();
    for (const key of colony.claimedHexKeys) {
      const coord = HexMath.keyToCoord(key);
      const neighbors = HexMath.getNeighbors(coord);
      for (const n of neighbors) {
        const nKey = HexMath.coordToKey(n);
        if (!colony.claimedHexKeys.includes(nKey)) {
          const tile = surface.tiles.find((t) => t.key === nKey);
          if (tile && tile.claimedByColonyId === null && tile.biome !== 'mountains' && tile.biome !== 'ocean') {
            candidates.set(nKey, tile);
          }
        }
      }
    }
    return Array.from(candidates.values());
  }

  /**
   * Validates if a colony can claim the designated hex
   */
  public static canClaimHex(
    colony: Colony,
    targetCoord: HexCoord,
    surface: PlanetSurface
  ): ExpansionValidationResult {
    const targetKey = HexMath.coordToKey(targetCoord);
    const targetTile = surface.tiles.find((t) => t.key === targetKey);

    if (!targetTile) {
      return { allowed: false, cost: 0, reason: 'Ungültige Koordinaten außerhalb der Planetenkarte.' };
    }

    // 1. Check if already claimed by this colony
    if (colony.claimedHexKeys.includes(targetKey)) {
      return { allowed: false, cost: 0, reason: 'Dieses Hexfeld gehört bereits zu diesem Territorium.' };
    }

    // 2. Strict simulation-side collision prevention: no two colonies can claim the same hex!
    if (targetTile.claimedByColonyId !== null) {
      return {
        allowed: false,
        cost: 0,
        reason: `Hexfeld ist bereits durch Kolonie ${targetTile.claimedByColonyId} beansprucht.`,
      };
    }

    // 3. Adjacency validation: Must be directly adjacent to at least one already claimed hex
    const neighbors = HexMath.getNeighbors(targetCoord);
    const isAdjacent = neighbors.some((n) => colony.claimedHexKeys.includes(HexMath.coordToKey(n)));

    if (!isAdjacent && colony.claimedHexKeys.length > 0) {
      return {
        allowed: false,
        cost: 0,
        reason: 'Hexfeld muss an das bestehende Territorium der Kolonie angrenzen.',
      };
    }

    // 4. Influence cost check
    const cost = ColonyExpansion.calculateInfluenceCost(colony, targetCoord);
    if (colony.stockpile.influence < cost) {
      return {
        allowed: false,
        cost,
        reason: `Nicht genügend Einfluss (Benötigt: ${cost}, Verfügbar: ${colony.stockpile.influence}).`,
      };
    }

    return { allowed: true, cost };
  }

  /**
   * Atomically claims a hex tile for the colony
   */
  public static claimHex(
    colony: Colony,
    targetCoord: HexCoord,
    surface: PlanetSurface
  ): { success: boolean; costPaid: number; reason?: string } {
    const validation = ColonyExpansion.canClaimHex(colony, targetCoord, surface);
    if (!validation.allowed) {
      return { success: false, costPaid: 0, reason: validation.reason };
    }

    const targetKey = HexMath.coordToKey(targetCoord);
    const targetTile = surface.tiles.find((t) => t.key === targetKey);
    if (!targetTile) {
      return { success: false, costPaid: 0, reason: 'Hexfeld existiert nicht.' };
    }

    // Atomic update
    colony.stockpile.influence -= validation.cost;
    colony.claimedHexKeys.push(targetKey);
    targetTile.claimedByColonyId = colony.id;
    targetTile.claimedByCivId = colony.civId;
    targetTile.visibility = 'visible';

    return {
      success: true,
      costPaid: validation.cost,
    };
  }

  public static claimTile(
    colony: Colony,
    arg2: PlanetSurface | HexCoord,
    arg3: HexCoord | PlanetSurface
  ): { success: boolean; costPaid?: number; reason?: string } {
    if ('tiles' in arg2) {
      return ColonyExpansion.claimHex(colony, arg3 as HexCoord, arg2 as PlanetSurface);
    } else {
      return ColonyExpansion.claimHex(colony, arg2 as HexCoord, arg3 as PlanetSurface);
    }
  }
}
