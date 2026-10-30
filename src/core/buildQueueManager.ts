/**
 * Astraea 4X - Build Queue & Construction Manager
 * Handles project sequencing, material costs, production progress, building upgrades, and unit spawning.
 */

import { BUILDING_CATALOG } from '../data/buildingCatalog.ts';
import { UNIT_CATALOG } from '../data/unitCatalog.ts';
import { HexMath } from '../surface/hexMath.ts';
import {
  BuildingInstance,
  BuildProject,
  Colony,
  HexCoord,
  PlanetSurface,
  SurfaceUnit,
} from './types.ts';

export class BuildQueueManager {
  /**
   * Prüft, ob ein Gebäude auf dem angegebenen Hexfeld errichtet werden darf.
   * Wird von der Warteschlange und der UI gemeinsam genutzt, damit Anzeige
   * und tatsächliche Validierung nicht auseinanderlaufen.
   */
  public static validateBuildingPlacement(
    colony: Colony,
    surface: PlanetSurface | null | undefined,
    buildingDefId: string,
    targetCoord: HexCoord
  ): { success: boolean; reason?: string } {
    const bDef = BUILDING_CATALOG[buildingDefId];
    if (!bDef) return { success: false, reason: 'Unbekannte Gebäudedefinition.' };

    const targetKey = HexMath.coordToKey(targetCoord);

    if (surface) {
      const tile = surface.tiles.find((t) => t.key === targetKey);
      if (!tile) return { success: false, reason: 'Hexfeld existiert nicht.' };

      // Muss zum Territorium dieser Kolonie gehören
      if (tile.claimedByColonyId !== colony.id) {
        return { success: false, reason: 'Hexfeld muss sich im Territorium dieser Kolonie befinden.' };
      }

      // Das Stadtzentrum ist bereits durch das Koloniegebäude belegt
      if (tile.isCityCenter) {
        return { success: false, reason: 'Das Stadtzentrum kann nicht überbaut werden.' };
      }

      // Kein Gebäude und kein Distrikt auf dem Feld
      if (tile.buildingInstanceId) {
        return { success: false, reason: 'Hexfeld besitzt bereits ein Gebäude. Nutzen Sie stattdessen Upgrade.' };
      }
      if (tile.districtInstanceId) {
        return { success: false, reason: 'Hexfeld wird bereits von einem Distrikt belegt.' };
      }

      // Biom-Einschränkungen
      if (bDef.disallowedBiomes?.includes(tile.biome)) {
        return { success: false, reason: `Gebäude kann nicht auf ${tile.biome} errichtet werden.` };
      }
      if (bDef.allowedBiomes && !bDef.allowedBiomes.includes(tile.biome)) {
        return { success: false, reason: `Gebäude darf nur auf folgenden Biomen gebaut werden: ${bDef.allowedBiomes.join(', ')}.` };
      }
    } else if (!colony.claimedHexKeys.includes(targetKey)) {
      return { success: false, reason: 'Hexfeld muss sich im Territorium dieser Kolonie befinden.' };
    }

    // Nicht zweimal dasselbe Feld in der Warteschlange belegen
    const alreadyQueued = colony.buildQueue.some(
      (project) =>
        project.type === 'building' &&
        HexMath.coordToKey(project.targetHexCoord) === targetKey
    );
    if (alreadyQueued) {
      return {
        success: false,
        reason: 'Für dieses Hexfeld ist bereits ein Gebäude in der Warteschlange.',
      };
    }

    return { success: true };
  }

  /**
   * Sucht ein gültiges Baufeld für das Gebäude. Ein bevorzugtes Feld (etwa
   * die aktuell ausgewählte Kachel) wird nur genutzt, wenn es tatsächlich
   * zulässig ist; andernfalls wird das nächstgelegene freie Feld gewählt.
   */
  public static findAvailableBuildCoord(
    colony: Colony,
    surface: PlanetSurface,
    buildingDefId: string,
    preferredCoord?: HexCoord | null
  ): HexCoord | null {
    if (
      preferredCoord &&
      BuildQueueManager.validateBuildingPlacement(colony, surface, buildingDefId, preferredCoord).success
    ) {
      return preferredCoord;
    }

    const candidates = surface.tiles.filter(
      (tile) =>
        tile.claimedByColonyId === colony.id &&
        BuildQueueManager.validateBuildingPlacement(colony, surface, buildingDefId, tile.coord).success
    );
    if (candidates.length === 0) return null;

    const center = colony.cityCenterCoord;
    const distanceToCenter = (coord: HexCoord) =>
      Math.abs(coord.q - center.q) + Math.abs(coord.r - center.r);

    candidates.sort((a, b) => {
      const distanceDelta = distanceToCenter(a.coord) - distanceToCenter(b.coord);
      return distanceDelta !== 0 ? distanceDelta : a.key.localeCompare(b.key);
    });

    return candidates[0].coord;
  }

  /**
   * Enqueues a new building project
   */
  public static queueBuilding(
    colony: Colony,
    buildingDefId: string,
    targetCoord: HexCoord,
    arg4?: PlanetSurface | number,
    arg5?: number,
    treasuryHolder?: { treasury: number }
  ): { success: boolean; reason?: string } {
    let surface: PlanetSurface | undefined;
    let currentTurn: number = 1;

    if (typeof arg4 === 'number') {
      currentTurn = arg4;
    } else if (arg4 && typeof arg4 === 'object') {
      surface = arg4;
      currentTurn = arg5 ?? 1;
    }

    const bDef = BUILDING_CATALOG[buildingDefId];
    if (!bDef) return { success: false, reason: 'Unbekannte Gebäudedefinition.' };

    const placement = BuildQueueManager.validateBuildingPlacement(
      colony,
      surface,
      buildingDefId,
      targetCoord
    );
    if (!placement.success) return placement;

    // Material cost check (minerals, rare resources)
    if (colony.stockpile.minerals < bDef.baseMineralCost) {
      return {
        success: false,
        reason: `Nicht genügend Mineralien (Benötigt: ${bDef.baseMineralCost}, Im Lager: ${colony.stockpile.minerals}).`,
      };
    }
    if (colony.stockpile.rareResources < bDef.baseRareCost) {
      return {
        success: false,
        reason: `Nicht genügend seltene Ressourcen (Benötigt: ${bDef.baseRareCost}, Im Lager: ${colony.stockpile.rareResources}).`,
      };
    }

    // Wirtschaft Stufe B: Baukosten in Credits aus der Staatskasse
    const creditCost = bDef.creditCost ?? 0;
    if (creditCost > 0 && treasuryHolder && treasuryHolder.treasury < creditCost) {
      return {
        success: false,
        reason: `Nicht genügend Credits (Benötigt: ${creditCost}, Staatskasse: ${Math.round(treasuryHolder.treasury * 10) / 10}).`,
      };
    }

    // Deduct material costs upfront
    colony.stockpile.minerals -= bDef.baseMineralCost;
    colony.stockpile.rareResources -= bDef.baseRareCost;
    if (creditCost > 0 && treasuryHolder) {
      treasuryHolder.treasury = Math.round((treasuryHolder.treasury - creditCost) * 10) / 10;
    }

    const project: BuildProject = {
      id: `proj-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      colonyId: colony.id,
      type: 'building',
      defId: buildingDefId,
      targetHexCoord: targetCoord,
      name: bDef.name,
      investedProduction: 0,
      requiredProduction: bDef.baseProductionCost,
      mineralCost: bDef.baseMineralCost,
      rareCost: bDef.baseRareCost,
      creditCost,
      turnStarted: currentTurn,
    };

    colony.buildQueue.push(project);
    return { success: true };
  }

  /**
   * Enqueues an upgrade for an existing building
   */
  public static queueUpgrade(
    colony: Colony,
    buildingInstanceId: string,
    currentTurn: number,
    treasuryHolder?: { treasury: number }
  ): { success: boolean; reason?: string } {
    const instance = colony.buildings.find((b) => b.id === buildingInstanceId);
    if (!instance) return { success: false, reason: 'Gebäudeinstanz nicht gefunden.' };

    const bDef = BUILDING_CATALOG[instance.buildingDefId];
    if (!bDef) return { success: false, reason: 'Unbekannte Gebäudedefinition.' };

    if (instance.level >= bDef.maxLevel) {
      return { success: false, reason: `Gebäude hat maximale Ausbaustufe (${bDef.maxLevel}) bereits erreicht.` };
    }

    const nextLevel = instance.level + 1;
    const upgradeMineralCost = Math.round(bDef.baseMineralCost * 0.75 * nextLevel);
    const upgradeRareCost = Math.round(bDef.baseRareCost * nextLevel);
    const upgradeProductionCost = Math.round(bDef.baseProductionCost * 0.8 * nextLevel);
    const upgradeCreditCost = Math.round((bDef.creditCost ?? 0) * 0.75 * nextLevel);

    if (colony.stockpile.minerals < upgradeMineralCost) {
      return {
        success: false,
        reason: `Nicht genügend Mineralien für Upgrade (Benötigt: ${upgradeMineralCost}, Im Lager: ${colony.stockpile.minerals}).`,
      };
    }
    if (colony.stockpile.rareResources < upgradeRareCost) {
      return {
        success: false,
        reason: `Nicht genügend seltene Ressourcen für Upgrade (Benötigt: ${upgradeRareCost}, Im Lager: ${colony.stockpile.rareResources}).`,
      };
    }
    if (upgradeCreditCost > 0 && treasuryHolder && treasuryHolder.treasury < upgradeCreditCost) {
      return {
        success: false,
        reason: `Nicht genügend Credits für Upgrade (Benötigt: ${upgradeCreditCost}, Staatskasse: ${Math.round(treasuryHolder.treasury * 10) / 10}).`,
      };
    }

    colony.stockpile.minerals -= upgradeMineralCost;
    colony.stockpile.rareResources -= upgradeRareCost;
    if (upgradeCreditCost > 0 && treasuryHolder) {
      treasuryHolder.treasury = Math.round((treasuryHolder.treasury - upgradeCreditCost) * 10) / 10;
    }

    const project: BuildProject = {
      id: `proj-up-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      colonyId: colony.id,
      type: 'upgrade',
      defId: instance.id, // Reference to instance
      targetHexCoord: instance.hexCoord,
      name: `${bDef.name} (Stufe ${nextLevel})`,
      investedProduction: 0,
      requiredProduction: upgradeProductionCost,
      mineralCost: upgradeMineralCost,
      rareCost: upgradeRareCost,
      creditCost: upgradeCreditCost,
      turnStarted: currentTurn,
    };

    colony.buildQueue.push(project);
    return { success: true };
  }

  /**
   * Enqueues recruitment of a military or exploration unit
   */
  public static queueUnit(
    colony: Colony,
    unitDefId: string,
    currentTurn: number
  ): { success: boolean; reason?: string } {
    const uDef = UNIT_CATALOG[unitDefId];
    if (!uDef) return { success: false, reason: 'Unbekannte Einheitendefinition.' };

    if (colony.stockpile.minerals < uDef.mineralCost) {
      return {
        success: false,
        reason: `Nicht genügend Mineralien für Truppenrekrutierung (Benötigt: ${uDef.mineralCost}).`,
      };
    }
    if (colony.stockpile.rareResources < uDef.rareCost) {
      return {
        success: false,
        reason: `Nicht genügend seltene Ressourcen für Truppenrekrutierung (Benötigt: ${uDef.rareCost}).`,
      };
    }

    colony.stockpile.minerals -= uDef.mineralCost;
    colony.stockpile.rareResources -= uDef.rareCost;

    const project: BuildProject = {
      id: `proj-unit-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      colonyId: colony.id,
      type: 'unit',
      defId: unitDefId,
      targetHexCoord: colony.cityCenterCoord,
      name: uDef.name,
      investedProduction: 0,
      requiredProduction: uDef.productionCost,
      mineralCost: uDef.mineralCost,
      rareCost: uDef.rareCost,
      turnStarted: currentTurn,
    };

    colony.buildQueue.push(project);
    return { success: true };
  }

  /**
   * Alias helper to advanceQueue with flexible arguments
   */
  public static applyTurnProduction(
    colony: Colony,
    productionPoints: number,
    surface: PlanetSurface,
    unitsList: SurfaceUnit[] = []
  ): { completedProject: BuildProject | null; spawnedUnit?: SurfaceUnit } {
    return BuildQueueManager.advanceQueue(colony, surface, productionPoints, unitsList);
  }

  /**
   * Advances the active project at the head of the build queue
   */
  public static advanceQueue(
    colony: Colony,
    surface: PlanetSurface,
    productionPoints: number,
    unitsList: SurfaceUnit[] = []
  ): { completedProject: BuildProject | null; spawnedUnit?: SurfaceUnit } {
    if (colony.buildQueue.length === 0) return { completedProject: null };

    const activeProject = colony.buildQueue[0];
    activeProject.investedProduction += Math.max(1, productionPoints);

    if (activeProject.investedProduction >= activeProject.requiredProduction) {
      // Completed!
      colony.buildQueue.shift();

      if (activeProject.type === 'building') {
        const buildingInstanceId = `bld-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const newInstance: BuildingInstance = {
          id: buildingInstanceId,
          colonyId: colony.id,
          hexCoord: activeProject.targetHexCoord,
          buildingDefId: activeProject.defId,
          level: 1,
          isActive: true,
        };

        colony.buildings.push(newInstance);
        const tileKey = HexMath.coordToKey(activeProject.targetHexCoord);
        const tile = surface.tiles.find((t) => t.key === tileKey);
        if (tile) {
          tile.buildingInstanceId = buildingInstanceId;
        }

        return { completedProject: activeProject };
      } else if (activeProject.type === 'upgrade') {
        const instance = colony.buildings.find((b) => b.id === activeProject.defId);
        if (instance) {
          instance.level += 1;
        }
        return { completedProject: activeProject };
      } else if (activeProject.type === 'unit') {
        const uDef = UNIT_CATALOG[activeProject.defId];
        const newUnit: SurfaceUnit = {
          id: `unit-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          civId: colony.civId,
          unitDefId: activeProject.defId,
          name: `${uDef.name} (${colony.name})`,
          planetId: colony.planetId,
          hexCoord: activeProject.targetHexCoord,
          movementPointsRemaining: uDef.movementPoints,
          maxMovementPoints: uDef.movementPoints,
          health: uDef.combatStrength * 10,
          maxHealth: uDef.combatStrength * 10,
          isFortified: false,
        };

        unitsList.push(newUnit);
        return { completedProject: activeProject, spawnedUnit: newUnit };
      }
    }

    return { completedProject: null };
  }
}
