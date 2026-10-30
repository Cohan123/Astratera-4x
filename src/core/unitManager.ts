/**
 * Astraea 4X - Surface Ground Unit Movement & Exploration Manager
 * Handles unit movement along hex paths, terrain movement cost deductions, and Fog of War updates.
 */

import { UNIT_CATALOG } from '../data/unitCatalog.ts';
import { BIOME_CATALOG } from '../data/terrainCatalog.ts';
import { HexMath } from '../surface/hexMath.ts';
import { SurfaceManager } from '../surface/surfaceManager.ts';
import { HexCoord, PlanetSurface, SurfaceUnit } from './types.ts';

export class UnitManager {
  /**
   * Spawns a new ground unit on a hex tile
   */
  public static createUnit(civId: string, unitDefId: string, planetId: string, hexCoord: HexCoord): SurfaceUnit {
    const uDef = UNIT_CATALOG[unitDefId];
    const mp = uDef ? uDef.movementPoints : 2;
    return {
      id: `unit-${unitDefId}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      civId,
      unitDefId,
      name: uDef ? uDef.name : unitDefId,
      planetId,
      hexCoord,
      movementPointsRemaining: mp,
      maxMovementPoints: mp,
      health: 100,
      maxHealth: 100,
      isFortified: false,
    };
  }

  /**
   * Refreshes single unit movement
   */
  public static refreshUnitMovement(unit: SurfaceUnit): void {
    unit.movementPointsRemaining = unit.maxMovementPoints;
    unit.isFortified = false;
  }

  /**
   * Resets movement points for all units at the beginning of a turn
   */
  public static resetTurnMovement(units: SurfaceUnit[]): void {
    for (const unit of units) {
      UnitManager.refreshUnitMovement(unit);
    }
  }

  /**
   * Moves a unit step-by-step along an A* path
   */
  public static moveUnitAlongPath(
    unit: SurfaceUnit,
    path: HexCoord[],
    surface: PlanetSurface,
    surfaceManager: SurfaceManager
  ): { stepsTaken: number; reachedGoal: boolean; reason?: string } {
    if (path.length === 0) return { stepsTaken: 0, reachedGoal: true };

    let steps = 0;
    const tilesMap = new Map(surface.tiles.map((t) => [t.key, t]));

    for (const stepCoord of path) {
      const stepKey = HexMath.coordToKey(stepCoord);
      const targetTile = tilesMap.get(stepKey);
      if (!targetTile) {
        return { stepsTaken: steps, reachedGoal: false, reason: 'Ungültiges Ziel außerhalb der Karte.' };
      }

      const biome = BIOME_CATALOG[targetTile.biome];
      if (biome.isImpassable) {
        return { stepsTaken: steps, reachedGoal: false, reason: 'Gelände ist unpassierbar.' };
      }

      if (unit.movementPointsRemaining < biome.movementCost) {
        // Not enough movement points remaining for this turn
        return { stepsTaken: steps, reachedGoal: false, reason: 'Nicht genügend Bewegungspunkte verbleibend.' };
      }

      // Execute step
      unit.movementPointsRemaining -= biome.movementCost;
      unit.hexCoord = stepCoord;
      steps++;

      // Reveal Fog of War
      const uDef = UNIT_CATALOG[unit.unitDefId];
      const vision = uDef ? uDef.visionRadius : 1;
      surfaceManager.revealTilesAround(unit.planetId, unit.hexCoord, vision);

      // Scouts have a 50% chance to immediately reveal hidden subterranean resource deposits on entered tile
      if (unit.unitDefId === 'scout' && targetTile.deposit !== 'none') {
        targetTile.isDepositDiscovered = true;
      }
    }

    return { stepsTaken: steps, reachedGoal: true };
  }
}
