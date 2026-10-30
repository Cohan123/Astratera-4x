/**
 * Astraea 4X - Build Queue & Construction Manager
 * Handles project sequencing, material costs, production progress, building upgrades, and unit spawning.
 */

import { BUILDING_CATALOG } from '../data/buildingCatalog.ts';
import { UNIT_CATALOG } from '../data/unitCatalog.ts';
import { HexMath } from '../surface/hexMath.ts';
import {
  BuildingDef,
  BuildingInstance,
  BuildProject,
  Colony,
  HexCoord,
  PlanetSurface,
  SurfaceUnit,
} from './types.ts';

export interface QueueUpgradeResult {
  success: boolean;
  reason?: string;
  /** true, wenn die Aufwertung ohne Wartezeit sofort abgeschlossen wurde. */
  completedImmediately?: boolean;
  /** Der erzeugte (ggf. sofort abgeschlossene) Auftrag. */
  project?: BuildProject;
}

export class BuildQueueManager {
  /**
   * Einheitliche Bauzeitformel für Ausbauten. Sie wird von der Auftragserstellung
   * und der Wiederherstellung alter Aufträge gemeinsam genutzt, damit Anzeige,
   * Warteschlange und Fertigstellung nicht auseinanderlaufen.
   */
  public static getUpgradeProductionCost(bDef: BuildingDef, nextLevel: number): number {
    const cost = Math.round(bDef.baseProductionCost * 0.8 * nextLevel);
    return Number.isFinite(cost) ? Math.max(0, cost) : 0;
  }

  /**
   * Löst die zu einem Ausbauauftrag gehörende Gebäudeinstanz auf. Ältere
   * Spielstände können eine veraltete Instanz-ID enthalten; dann greifen die
   * Katalog-ID und das Zielfeld als stabile Ersatzkriterien.
   */
  private static resolveUpgradeInstance(
    colony: Colony,
    project: BuildProject
  ): BuildingInstance | undefined {
    const direct = colony.buildings.find((b) => b.id === project.defId);
    if (direct) return direct;
    if (!project.buildingDefId) return undefined;
    const sameDefinition = colony.buildings.filter(
      (b) => b.buildingDefId === project.buildingDefId
    );
    const byInstanceId = sameDefinition.find((b) => b.id === project.buildingInstanceId);
    if (byInstanceId) return byInstanceId;
    const targetKey = HexMath.coordToKey(project.targetHexCoord);
    return sameDefinition.find((b) => HexMath.coordToKey(b.hexCoord) === targetKey);
  }

  /**
   * Ermittelt die tatsächlich benötigte Produktion eines Auftrags. Ungültige
   * oder fehlende Werte werden aus den vorhandenen Katalogdaten rekonstruiert,
   * statt die Warteschlange mit NaN oder 0 dauerhaft zu blockieren.
   */
  public static resolveRequiredProduction(colony: Colony, project: BuildProject): number {
    if (Number.isFinite(project.requiredProduction) && project.requiredProduction > 0) {
      return project.requiredProduction;
    }

    let resolved = 0;
    if (project.type === 'upgrade') {
      const instance = BuildQueueManager.resolveUpgradeInstance(colony, project);
      const bDef =
        (instance ? BUILDING_CATALOG[instance.buildingDefId] : undefined) ??
        (project.buildingDefId ? BUILDING_CATALOG[project.buildingDefId] : undefined);
      if (bDef && instance) {
        resolved = BuildQueueManager.getUpgradeProductionCost(bDef, instance.level + 1);
      }
    } else if (project.type === 'building') {
      resolved = BUILDING_CATALOG[project.defId]?.baseProductionCost ?? 0;
    } else if (project.type === 'unit') {
      resolved = UNIT_CATALOG[project.defId]?.productionCost ?? 0;
    }

    if (!Number.isFinite(resolved) || resolved < 0) resolved = 0;
    project.requiredProduction = resolved;
    return resolved;
  }

  /**
   * Repariert gespeicherte Warteschlangen nach dem Laden: unendliche/fehlende
   * Fortschritte werden auf 0 gesetzt, Bauzeiten aus Katalogdaten ergänzt und
   * doppelte Ausbauaufträge für dieselbe Instanz entfernt. Die eigentliche
   * Fertigstellung bleibt der Rundenphase vorbehalten.
   */
  public static normalizeBuildQueue(colony: Colony): void {
    if (!Array.isArray(colony.buildQueue)) {
      colony.buildQueue = [];
      return;
    }

    const seenUpgrades = new Set<string>();
    colony.buildQueue = colony.buildQueue.filter((project) => {
      if (!Number.isFinite(project.investedProduction) || project.investedProduction < 0) {
        project.investedProduction = 0;
      }
      if (project.type === 'upgrade') {
        const instance = BuildQueueManager.resolveUpgradeInstance(colony, project);
        const key = instance?.id ?? project.buildingInstanceId ?? project.defId;
        if (seenUpgrades.has(key)) return false;
        seenUpgrades.add(key);
        if (instance && !project.buildingInstanceId) project.buildingInstanceId = instance.id;
        if (instance && !project.buildingDefId) project.buildingDefId = instance.buildingDefId;
      }
      BuildQueueManager.resolveRequiredProduction(colony, project);
      return true;
    });
  }
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
  ): QueueUpgradeResult {
    const instance = colony.buildings.find((b) => b.id === buildingInstanceId);
    if (!instance) return { success: false, reason: 'Gebäudeinstanz nicht gefunden.' };

    const bDef = BUILDING_CATALOG[instance.buildingDefId];
    if (!bDef) return { success: false, reason: 'Unbekannte Gebäudedefinition.' };

    if (instance.level >= bDef.maxLevel) {
      return { success: false, reason: `Gebäude hat maximale Ausbaustufe (${bDef.maxLevel}) bereits erreicht.` };
    }

    const duplicate = colony.buildQueue.find(
      (project) =>
        project.type === 'upgrade' &&
        (project.buildingInstanceId === instance.id ||
          project.defId === instance.id ||
          (project.buildingDefId === instance.buildingDefId &&
            HexMath.coordToKey(project.targetHexCoord) === HexMath.coordToKey(instance.hexCoord)))
    );
    if (duplicate) {
      return {
        success: false,
        reason: `Für ${bDef.name} ist bereits ein Ausbau in der Warteschlange.`,
      };
    }

    const nextLevel = instance.level + 1;
    const upgradeMineralCost = Math.round(bDef.baseMineralCost * 0.75 * nextLevel);
    const upgradeRareCost = Math.round(bDef.baseRareCost * nextLevel);
    const upgradeProductionCost = BuildQueueManager.getUpgradeProductionCost(bDef, nextLevel);
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
      buildingInstanceId: instance.id,
      buildingDefId: instance.buildingDefId,
      targetHexCoord: instance.hexCoord,
      name: `${bDef.name} (Stufe ${nextLevel})`,
      investedProduction: 0,
      requiredProduction: upgradeProductionCost,
      targetLevel: nextLevel,
      mineralCost: upgradeMineralCost,
      rareCost: upgradeRareCost,
      creditCost: upgradeCreditCost,
      turnStarted: currentTurn,
    };

    // Ein Ausbau ohne definierte Bauzeit (z. B. das Koloniezentrum mit
    // baseProductionCost 0) wird ausdrücklich sofort abgeschlossen. Er darf
    // nicht als 0-Runden-Eintrag in der Warteschlange stehen bleiben, der
    // scheinbar nie fertig wird.
    if (upgradeProductionCost <= 0) {
      instance.level = Math.min(nextLevel, bDef.maxLevel);
      return { success: true, completedImmediately: true, project };
    }

    colony.buildQueue.push(project);
    return { success: true, project };
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
    if (!Number.isFinite(activeProject.investedProduction) || activeProject.investedProduction < 0) {
      activeProject.investedProduction = 0;
    }

    const required = BuildQueueManager.resolveRequiredProduction(colony, activeProject);
    const safeProduction = Number.isFinite(productionPoints) ? Math.max(1, productionPoints) : 1;

    // Altbestände mit 0 Runden (früher durch baseProductionCost 0 entstanden)
    // werden beim nächsten Rundenwechsel ausdrücklich abgeschlossen. Sie
    // bekommen keine negative oder unendliche Restzeit und blockieren die
    // Warteschlange nicht dauerhaft.
    const isImmediatelyComplete = required <= activeProject.investedProduction;

    if (!isImmediatelyComplete) {
      activeProject.investedProduction += safeProduction;
    }

    if (activeProject.investedProduction >= required) {
      colony.buildQueue.shift();
      return BuildQueueManager.completeProject(colony, activeProject, surface, unitsList);
    }

    return { completedProject: null };
  }

  /**
   * Führt die Wirkung eines fertigen Auftrags genau einmal aus. Die Zielstufe
   * wird absolut gesetzt, damit ein erneut verarbeiteter Auftrag keine zweite
   * Stufe freischalten kann.
   */
  private static completeProject(
    colony: Colony,
    project: BuildProject,
    surface: PlanetSurface,
    unitsList: SurfaceUnit[]
  ): { completedProject: BuildProject | null; spawnedUnit?: SurfaceUnit } {
    if (project.type === 'building') {
      const buildingInstanceId = `bld-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const newInstance: BuildingInstance = {
        id: buildingInstanceId,
        colonyId: colony.id,
        hexCoord: project.targetHexCoord,
        buildingDefId: project.defId,
        level: 1,
        isActive: true,
      };

      colony.buildings.push(newInstance);
      const tileKey = HexMath.coordToKey(project.targetHexCoord);
      const tile = surface.tiles.find((t) => t.key === tileKey);
      if (tile) {
        tile.buildingInstanceId = buildingInstanceId;
      }

      return { completedProject: project };
    }

    if (project.type === 'upgrade') {
      const instance = BuildQueueManager.resolveUpgradeInstance(colony, project);
      if (instance) {
        const bDef = BUILDING_CATALOG[instance.buildingDefId];
        const maxLevel = bDef?.maxLevel ?? Number.POSITIVE_INFINITY;
        const targetLevel = Math.min(
          maxLevel,
          project.targetLevel ?? instance.level + 1
        );
        if (instance.level < targetLevel) {
          instance.level = targetLevel;
        }
      }
      return { completedProject: project };
    }

    if (project.type === 'unit') {
      const uDef = UNIT_CATALOG[project.defId];
      if (!uDef) return { completedProject: project };
      const newUnit: SurfaceUnit = {
        id: `unit-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        civId: colony.civId,
        unitDefId: project.defId,
        name: `${uDef.name} (${colony.name})`,
        planetId: colony.planetId,
        hexCoord: project.targetHexCoord,
        movementPointsRemaining: uDef.movementPoints,
        maxMovementPoints: uDef.movementPoints,
        health: uDef.combatStrength * 10,
        maxHealth: uDef.combatStrength * 10,
        isFortified: false,
      };

      unitsList.push(newUnit);
      return { completedProject: project, spawnedUnit: newUnit };
    }

    return { completedProject: project };
  }
}
