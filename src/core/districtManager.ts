/**
 * Astraea 4X - District Manager
 * Stateless helpers for multi-hex districts. District state lives on the colony
 * (`Colony.districts`) plus surface markers (`PlanetHexTile.districtInstanceId`),
 * so the manager itself never owns persistence.
 */

import { DISTRICT_CATALOG } from '../data/districtCatalog.ts';
import { HexMath } from '../surface/hexMath.ts';
import {
  Colony,
  DistrictDef,
  DistrictInstance,
  HexCoord,
  PlanetHexTile,
  PlanetSurface,
  ResourceYields,
} from './types.ts';

export interface DistrictPlacementResult {
  allowed: boolean;
  reason?: string;
  district?: DistrictInstance;
}

export interface DistrictRemovalResult {
  success: boolean;
  reason?: string;
}

export interface DistrictYieldResult {
  yields: ResourceYields;
  upkeepEnergy: number;
}

const EMPTY_YIELDS: ResourceYields = {
  food: 0,
  production: 0,
  energy: 0,
  minerals: 0,
  rareResources: 0,
  research: 0,
  influence: 0,
};

export class DistrictManager {
  public static getDistrictsForColony(colony: Colony): DistrictInstance[] {
    return colony.districts ?? [];
  }

  public static getDistrictAtHex(colony: Colony, coord: HexCoord): DistrictInstance | null {
    const key = HexMath.coordToKey(coord);
    return DistrictManager.getDistrictsForColony(colony).find((d) => d.coveredHexKeys.includes(key)) ?? null;
  }

  public static resolveCoveredCoords(def: DistrictDef, anchor: HexCoord): HexCoord[] {
    return def.footprint.map((offset) => ({ q: anchor.q + offset.q, r: anchor.r + offset.r }));
  }

  public static canPlaceDistrict(
    colony: Colony,
    surface: PlanetSurface,
    districtDefId: string,
    anchor: HexCoord,
    completedTechIds: string[]
  ): DistrictPlacementResult {
    const def = DISTRICT_CATALOG[districtDefId];
    if (!def) {
      return { allowed: false, reason: 'Unbekannter Distrikt-Typ.' };
    }
    if (!colony) {
      return { allowed: false, reason: 'Keine Kolonie verfügbar.' };
    }
    if (def.requiredTechId && !completedTechIds.includes(def.requiredTechId)) {
      return { allowed: false, reason: 'Erforderliche Technologie wurde noch nicht erforscht.' };
    }

    const districts = DistrictManager.getDistrictsForColony(colony);
    const occupiedKeys = new Set<string>();
    districts.forEach((d) => d.coveredHexKeys.forEach((k) => occupiedKeys.add(k)));

    const coveredCoords = DistrictManager.resolveCoveredCoords(def, anchor);
    if (coveredCoords.length === 0) {
      return { allowed: false, reason: 'Distrikt besitzt keine Fläche.' };
    }

    for (const coord of coveredCoords) {
      const tile = DistrictManager.findTile(surface, coord);
      if (!tile) {
        return { allowed: false, reason: 'Distrikt ragt über die Planetenoberfläche hinaus.' };
      }
      if (tile.claimedByColonyId !== colony.id) {
        return { allowed: false, reason: 'Alle Distrikt-Flächen müssen zur Kolonie gehören.' };
      }
      if (tile.isCityCenter) {
        return { allowed: false, reason: 'Das Stadtzentrum kann nicht überbaut werden.' };
      }
      if (tile.buildingInstanceId) {
        return { allowed: false, reason: 'Auf der Fläche steht bereits ein Gebäude.' };
      }
      if (tile.districtInstanceId || occupiedKeys.has(tile.key)) {
        return { allowed: false, reason: 'Die Fläche wird bereits von einem Distrikt belegt.' };
      }
    }

    const districtId = DistrictManager.buildDistrictId(colony, districtDefId, anchor);
    if (districts.some((d) => d.id === districtId)) {
      return { allowed: false, reason: 'An diesem Anker existiert bereits dieser Distrikt.' };
    }

    if (colony.stockpile.minerals < def.mineralCost) {
      return { allowed: false, reason: 'Nicht genügend Mineralien im Lager.' };
    }
    if (colony.stockpile.rareResources < def.rareCost) {
      return { allowed: false, reason: 'Nicht genügend seltene Ressourcen im Lager.' };
    }

    return { allowed: true };
  }

  public static placeDistrict(
    colony: Colony,
    surface: PlanetSurface,
    districtDefId: string,
    anchor: HexCoord,
    completedTechIds: string[],
    currentTurn: number
  ): DistrictPlacementResult {
    const check = DistrictManager.canPlaceDistrict(colony, surface, districtDefId, anchor, completedTechIds);
    if (!check.allowed) {
      return check;
    }

    const def = DISTRICT_CATALOG[districtDefId];
    const coveredCoords = DistrictManager.resolveCoveredCoords(def, anchor);
    const coveredHexKeys = coveredCoords.map((c) => HexMath.coordToKey(c));
    const district: DistrictInstance = {
      id: DistrictManager.buildDistrictId(colony, districtDefId, anchor),
      colonyId: colony.id,
      districtDefId,
      anchorCoord: { ...anchor },
      coveredHexKeys,
      placedTurn: currentTurn,
    };

    if (!colony.districts) colony.districts = [];
    colony.districts.push(district);

    colony.stockpile.minerals -= def.mineralCost;
    colony.stockpile.rareResources -= def.rareCost;

    coveredHexKeys.forEach((key) => {
      const tile = DistrictManager.findTileByKey(surface, key);
      if (!tile) return;
      tile.districtInstanceId = district.id;
      tile.isWorked = false;
    });
    colony.workedHexKeys = colony.workedHexKeys.filter((key) => !coveredHexKeys.includes(key));

    return { allowed: true, district };
  }

  public static removeDistrict(
    colony: Colony,
    districtId: string,
    surface?: PlanetSurface
  ): DistrictRemovalResult {
    const districts = DistrictManager.getDistrictsForColony(colony);
    const district = districts.find((d) => d.id === districtId);
    if (!district) {
      return { success: false, reason: 'Distrikt nicht gefunden.' };
    }

    colony.districts = districts.filter((d) => d.id !== districtId);
    colony.workedHexKeys = colony.workedHexKeys.filter((key) => !district.coveredHexKeys.includes(key));

    if (surface) {
      district.coveredHexKeys.forEach((key) => {
        const tile = DistrictManager.findTileByKey(surface, key);
        if (tile && tile.districtInstanceId === districtId) {
          tile.districtInstanceId = null;
        }
      });
    }

    return { success: true };
  }

  public static calculateDistrictYields(colony: Colony): DistrictYieldResult {
    const yields: ResourceYields = { ...EMPTY_YIELDS };
    let upkeepEnergy = 0;

    DistrictManager.getDistrictsForColony(colony).forEach((district) => {
      const def = DISTRICT_CATALOG[district.districtDefId];
      if (!def) return;
      upkeepEnergy += def.energyUpkeep;
      (Object.keys(def.yieldsPerTurn) as (keyof ResourceYields)[]).forEach((resource) => {
        yields[resource] += def.yieldsPerTurn[resource] ?? 0;
      });
    });

    return { yields, upkeepEnergy };
  }

  /**
   * Clears stale markers (used when a district was removed from a colony record).
   */
  public static clearSurfaceMarkers(surface: PlanetSurface, colonies: Colony[]): void {
    const validIds = new Set<string>();
    colonies.forEach((colony) =>
      DistrictManager.getDistrictsForColony(colony).forEach((d) => validIds.add(d.id))
    );
    surface.tiles.forEach((tile) => {
      if (tile.districtInstanceId && !validIds.has(tile.districtInstanceId)) {
        tile.districtInstanceId = null;
      }
    });
  }

  /**
   * Rebuilds district markers from colony records, which restores surfaces from
   * saves written before district markers existed.
   */
  public static syncSurfaceMarkers(surface: PlanetSurface, colonies: Colony[]): void {
    const ownership = new Map<string, string>();
    colonies.forEach((colony) => {
      DistrictManager.getDistrictsForColony(colony).forEach((district) => {
        district.coveredHexKeys.forEach((key) => ownership.set(key, district.id));
      });
    });

    surface.tiles.forEach((tile) => {
      tile.districtInstanceId = ownership.get(tile.key) ?? null;
    });
  }

  private static buildDistrictId(colony: Colony, districtDefId: string, anchor: HexCoord): string {
    return `dist_${colony.id}_${districtDefId}_${anchor.q}_${anchor.r}`;
  }

  private static findTile(surface: PlanetSurface, coord: HexCoord): PlanetHexTile | null {
    return DistrictManager.findTileByKey(surface, HexMath.coordToKey(coord));
  }

  private static findTileByKey(surface: PlanetSurface, key: string): PlanetHexTile | null {
    return surface.tiles.find((t) => t.key === key) ?? null;
  }
}
