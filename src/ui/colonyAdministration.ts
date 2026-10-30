/**
 * Astraea 4X - Colony Administration view model
 *
 * Reine Ableitungen für die Kolonieverwaltung. Die Funktionen lesen den
 * Spielzustand nur und verändern weder Vorräte noch Bevölkerung. Damit können
 * Steuern, Bevölkerung und Bauplätze angezeigt werden, ohne dass reine
 * UI-Aufrufe die Simulation beeinflussen.
 *
 * Das Modell folgt dem Basisbau-Vorbild aus "Heroes of Science and Fiction":
 * eine Kommandozentrale mit festen Bereichen (Bauplätze, Steuern, Bevölkerung)
 * und klaren Verfügbarkeitszuständen statt verstreuter Einzelwerte.
 */

import { EconomyEngine } from '../core/economyEngine.ts';
import { PrivateSectorManager } from '../core/privateSectorManager.ts';
import { Colony, PlanetSurface } from '../core/types.ts';
import { HexMath } from '../surface/hexMath.ts';

export const COLONY_TIER_LABELS: Record<Colony['developmentTier'], string> = {
  outpost: 'Außenposten',
  settlement: 'Siedlung',
  colony: 'Kolonie',
};

/** Auf eine Nachkommastelle runden, wie die Wirtschaftsengine. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Auf zwei Nachkommastellen runden (Wachstumsfortschritt). */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface TaxProjection {
  taxRate: number;
  taxRevenue: number;
  corruption: number;
  approval: number;
  approvalGrowthFactor: number;
  upkeepCredits: number;
  privateSectorVolume: number;
  privateSectorTax: number;
  netCredits: number;
  projectedTreasury: number;
}

/**
 * Projiziert die Steuerwirkung dieser Kolonie für die nächste Runde.
 * Entspricht der Gutschrift in GameEngine.endTurn: Steuern + Privatsektor
 * minus Wartung. Andere Kolonien bleiben bewusst außen vor.
 */
export function getTaxProjection(colony: Colony, treasury: number): TaxProjection {
  const taxRate = EconomyEngine.normalizeTaxRate(colony.taxRate);
  const tier = colony.developmentTier ?? 'outpost';
  const taxRevenue = EconomyEngine.calculateTaxRevenue({ ...colony, taxRate });
  const corruption = EconomyEngine.calculateCorruption(taxRate, tier);
  const approval = Math.round(colony.approval ?? EconomyEngine.calculateApproval(taxRate, tier));
  const approvalGrowthFactor = EconomyEngine.calculateApprovalGrowthFactor(approval);
  const upkeepCredits = round1(colony.upkeep?.credits ?? 0);
  const privateSectorVolume = PrivateSectorManager.calculateCommerceVolume(colony);
  const privateSectorTax = PrivateSectorManager.calculateCommerceTax(privateSectorVolume);
  const netCredits = round1(taxRevenue + privateSectorTax - upkeepCredits);

  return {
    taxRate,
    taxRevenue,
    corruption,
    approval,
    approvalGrowthFactor,
    upkeepCredits,
    privateSectorVolume,
    privateSectorTax,
    netCredits,
    projectedTreasury: round1(Math.max(0, treasury + netCredits)),
  };
}

export interface PopulationForecast {
  popUnits: number;
  colonists: number;
  growthPercent: number;
  growthPerTurn: number;
  turnsToNextPop: number | null;
  approvalGrowthFactor: number;
  habitabilityMultiplier: number;
  combinedGrowthMultiplier: number;
  workforceUnits: number;
  workedTiles: number;
  freeWorkers: number;
  hasFoodSurplus: boolean;
}

/**
 * Leitet Bevölkerung, Wachstum und Arbeitskräfte aus dem Koloniezustand ab.
 * `habitabilityPercent` ist optional; fehlt sie, wird volle Habitabilität
 * angenommen (Faktor 1.0), damit alte Aufrufer kein falsches Bild bekommen.
 */
export function getPopulationForecast(
  colony: Colony,
  surface: PlanetSurface | null,
  habitabilityPercent = 100
): PopulationForecast {
  const popUnits = EconomyEngine.getPopulationUnits(colony.population);
  const approval = colony.approval ?? 50;
  const approvalGrowthFactor = EconomyEngine.calculateApprovalGrowthFactor(approval);
  const habitabilityMultiplier = EconomyEngine.calculateGrowthMultiplier(habitabilityPercent);
  const combinedGrowthMultiplier = habitabilityMultiplier * approvalGrowthFactor;
  const foodSurplus = colony.netYields?.food ?? 0;
  const growthPerTurn = round2(Math.max(0, foodSurplus) * combinedGrowthMultiplier);
  const remaining = Math.max(0, colony.growthFoodRequired - colony.growthFoodProgress);
  const turnsToNextPop = growthPerTurn > 0 ? Math.ceil(remaining / growthPerTurn) : null;

  const centerKey = HexMath.coordToKey(colony.cityCenterCoord);
  const workedTiles = colony.workedHexKeys.filter((key) => key !== centerKey).length;

  return {
    popUnits,
    colonists: popUnits * 1000,
    growthPercent: Math.min(
      100,
      Math.round((colony.growthFoodProgress / Math.max(1, colony.growthFoodRequired)) * 100)
    ),
    growthPerTurn,
    turnsToNextPop,
    approvalGrowthFactor,
    habitabilityMultiplier,
    combinedGrowthMultiplier,
    workforceUnits: popUnits,
    workedTiles,
    freeWorkers: Math.max(0, popUnits - workedTiles),
    hasFoodSurplus: foodSurplus > 0,
  };
}

export interface BuildingSlotSummary {
  /** Fertige Gebäude inklusive Stadtzentrum. */
  built: number;
  /** Freie, sofort bebaubare Hexfelder im Kolonietterritorium. */
  free: number;
  /** Durch Multi-Hex-Distrikte belegte Felder. */
  blockedByDistricts: number;
  /** Gesamtes beanspruchtes Territorium. */
  territory: number;
}

/**
 * Zählt Bauplätze im Territorium. Ein Feld gilt als frei, wenn es weder
 * Stadtzentrum noch Gebäude noch Distrikt ist – dieselbe Bedingung, die
 * BuildQueueManager.validateBuildingPlacement prüft. Biom- und Tech-Regeln
 * bleiben gebäudespezifisch und werden im Katalog angezeigt.
 */
export function getBuildingSlotSummary(
  colony: Colony,
  surface: PlanetSurface | null
): BuildingSlotSummary {
  const claimedTiles = surface
    ? surface.tiles.filter((tile) => tile.claimedByColonyId === colony.id)
    : [];

  const territory = claimedTiles.length || colony.claimedHexKeys.length;
  const free = claimedTiles.filter(
    (tile) =>
      !tile.isCityCenter && !tile.buildingInstanceId && !tile.districtInstanceId
  ).length;
  const blockedByDistricts = claimedTiles.filter(
    (tile) => !tile.isCityCenter && !!tile.districtInstanceId
  ).length;

  return {
    built: colony.buildings.length,
    free,
    blockedByDistricts,
    territory,
  };
}
