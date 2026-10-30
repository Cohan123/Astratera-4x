/**
 * Astraea 4X - Economy & Resource Engine
 * Central simulation for the 5 core resources, citizen workforce allocation,
 * building upkeeps, energy deficit penalties, and population growth.
 */

import { BUILDING_CATALOG } from '../data/buildingCatalog.ts';
import { DEPOSIT_CATALOG } from '../data/resourceCatalog.ts';
import { BIOME_CATALOG } from '../data/terrainCatalog.ts';
import { DistrictManager } from './districtManager.ts';
import {
  Colony,
  EmpireModifiers,
  PlanetHexTile,
  PlanetSurface,
  ResourceYields,
  UpkeepCosts,
} from './types.ts';

/**
 * Steuersatz-Grenzen in Prozent.
 * Stufe A: eigene, an Distant Worlds angelehnte Balance – keine 1:1-Übernahme.
 */
export const DEFAULT_TAX_RATE = 30;
export const MIN_TAX_RATE = 0;
export const MAX_TAX_RATE = 60;

/** Basis-Korruption je Entwicklungsstufe (Anteil der Steuereinnahmen, der verloren geht) */
const CORRUPTION_BASE_BY_TIER: Record<Colony['developmentTier'], number> = {
  outpost: 0.35,
  settlement: 0.2,
  colony: 0.1,
};

/** Zufriedenheits-Bonus je Entwicklungsstufe in Punkten */
const APPROVAL_TIER_BONUS: Record<Colony['developmentTier'], number> = {
  outpost: 0,
  settlement: 5,
  colony: 10,
};

/** Credits pro Bevölkerungs-Einheit und Runde bei 100 % Steuersatz */
const TAX_CREDITS_PER_POP_UNIT = 6;

/** Rundet auf eine Nachkommastelle (vermeidet Float-Drift bei Credits). */
function roundTo1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Rundet auf drei Nachkommastellen (Korruptionsquote). */
function roundTo3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export class EconomyEngine {
  /**
   * Calculates required food to grow to next population level
   */
  public static calculateGrowthRequired(currentPopulation: number): number {
    const popUnits = currentPopulation >= 100 ? Math.max(1, Math.floor(currentPopulation / 1000)) : currentPopulation;
    return Math.round(50 * Math.pow(popUnits, 1.3));
  }

  /**
   * Habitability throttles how much food surplus converts into population growth.
   * 100% habitability keeps full growth speed, hostile worlds slow down to a 25% floor.
   */
  public static calculateGrowthMultiplier(planetHabitabilityPercent: number): number {
    const normalized = Math.max(0, Math.min(100, planetHabitabilityPercent));
    return Math.max(0.25, normalized / 100);
  }

  /**
   * Wandelt die Bevölkerungszahl in Bevölkerungs-Einheiten (Pops) um.
   * Unter 100 gilt die Zahl direkt als Pop-Zahl, darüber entspricht 1 Pop 1.000 Kolonisten.
   */
  public static getPopulationUnits(population: number): number {
    return population >= 100 ? Math.max(1, Math.floor(population / 1000)) : population;
  }

  /**
   * Begrenzt einen Steuersatz auf den gültigen Bereich und füllt fehlende Werte auf.
   */
  public static normalizeTaxRate(rate?: number | null): number {
    if (rate === undefined || rate === null || !Number.isFinite(rate)) {
      return DEFAULT_TAX_RATE;
    }
    return Math.min(MAX_TAX_RATE, Math.max(MIN_TAX_RATE, Math.round(rate)));
  }

  /**
   * Korruptionsquote (0-1) aus Steuersatz und Entwicklungsstufe.
   * Hohe Steuern über 40 % erhöhen die Korruption zusätzlich.
   */
  public static calculateCorruption(
    taxRate: number,
    tier: Colony['developmentTier'] = 'outpost'
  ): number {
    const base = CORRUPTION_BASE_BY_TIER[tier] ?? CORRUPTION_BASE_BY_TIER.outpost;
    const taxPressure = (Math.max(0, taxRate - 40) / 100) * 0.5;
    return roundTo3(Math.min(0.8, Math.max(0, base + taxPressure)));
  }

  /**
   * Zufriedenheit (0-100) aus Steuersatz und Entwicklungsstufe.
   * Der Standardsteuersatz von 30 % ergibt auf einem Außenposten exakt 50 Punkte.
   */
  public static calculateApproval(
    taxRate: number,
    tier: Colony['developmentTier'] = 'outpost'
  ): number {
    const tierBonus = APPROVAL_TIER_BONUS[tier] ?? 0;
    return Math.min(100, Math.max(0, Math.round(50 - (taxRate - 30) * 0.8 + tierBonus)));
  }

  /**
   * Zufriedenheit skaliert das Bevölkerungswachstum zwischen 50 % und 150 %.
   * Bei 50 Punkten bleibt der Faktor exakt 1.0 (neutral).
   */
  public static calculateApprovalGrowthFactor(approval: number): number {
    return Math.min(1.5, Math.max(0.5, 0.5 + approval / 100));
  }

  /**
   * Steuereinnahmen einer Kolonie pro Runde in Credits (Stufe A).
   */
  public static calculateTaxRevenue(colony: Colony): number {
    const taxRate = EconomyEngine.normalizeTaxRate(colony.taxRate);
    const tier = colony.developmentTier ?? 'outpost';
    const popUnits = EconomyEngine.getPopulationUnits(colony.population);
    const corruption = EconomyEngine.calculateCorruption(taxRate, tier);
    return roundTo1(popUnits * TAX_CREDITS_PER_POP_UNIT * (taxRate / 100) * (1 - corruption));
  }

  /**
   * Berechnet ausschließlich die steuerabhängigen, abgeleiteten Koloniewerte neu.
   *
   * Diese Methode ist bewusst frei von Seiteneffekten auf die Wirtschaft: Sie
   * verändert weder Vorräte noch Bevölkerung, Wachstum oder Arbeitszuweisung.
   * Sie darf daher von UI-Aktionen wie dem Steuerregler aufgerufen werden,
   * ohne dass wiederholtes Verstellen Ressourcen erzeugt (Exploit-Schutz).
   */
  public static recalculateTaxState(colony: Colony, approvalModifier = 0): number {
    const taxRate = EconomyEngine.normalizeTaxRate(colony.taxRate);
    const developmentTier = colony.developmentTier ?? 'outpost';
    colony.taxRate = taxRate;
    colony.corruption = EconomyEngine.calculateCorruption(taxRate, developmentTier);
    colony.approval = Math.min(
      100,
      Math.max(0, EconomyEngine.calculateApproval(taxRate, developmentTier) + approvalModifier)
    );
    colony.taxRevenue = EconomyEngine.calculateTaxRevenue(colony);
    return colony.approval;
  }

  /**
   * Automates citizen assignment to claimed hex tiles based on work focus
   */
  public static allocateCitizenWorkforce(colony: Colony, surface: PlanetSurface): void {
    const claimedTiles = surface.tiles.filter((t) => colony.claimedHexKeys.includes(t.key));

    // Reset worked status for non-locked tiles
    for (const t of claimedTiles) {
      if (!t.isWorkLocked) {
        t.isWorked = false;
      }
    }

    // Number of citizens available to work tiles (each citizen works 1 tile)
    const totalWorkers = colony.population >= 100 ? Math.max(1, Math.floor(colony.population / 1000)) : colony.population;
    let assignedCount = claimedTiles.filter((t) => t.isWorkLocked && t.isWorked).length;

    // Filter available candidates
    const availableTiles = claimedTiles.filter(
      (t) => !t.isWorkLocked && !t.isCityCenter // City center always operates automatically
    );

    // Score tiles based on colony focus
    availableTiles.sort((a, b) => {
      const scoreA = EconomyEngine.scoreTileForFocus(a, colony.workFocus);
      const scoreB = EconomyEngine.scoreTileForFocus(b, colony.workFocus);
      return scoreB - scoreA;
    });

    for (const tile of availableTiles) {
      if (assignedCount >= totalWorkers) break;
      tile.isWorked = true;
      assignedCount++;
    }

    // Update colony's worked keys
    colony.workedHexKeys = claimedTiles.filter((t) => t.isWorked || t.isCityCenter).map((t) => t.key);
  }

  private static scoreTileForFocus(tile: PlanetHexTile, focus: Colony['workFocus']): number {
    const biome = BIOME_CATALOG[tile.biome];
    const yields = { ...biome.baseYields };

    if (tile.isDepositDiscovered && tile.deposit !== 'none') {
      const dep = DEPOSIT_CATALOG[tile.deposit];
      for (const [key, val] of Object.entries(dep.yieldBonus)) {
        const resKey = key as keyof ResourceYields;
        yields[resKey] = (yields[resKey] || 0) + (val || 0);
      }
    }

    if (tile.isWorkPrioritized) {
      return 999;
    }

    switch (focus) {
      case 'food':
        return yields.food * 4 + yields.production * 1;
      case 'production':
        return yields.production * 4 + yields.minerals * 2;
      case 'minerals':
        return yields.minerals * 4 + yields.production * 2;
      case 'energy':
        return yields.energy * 4 + yields.research * 1;
      case 'research':
        return yields.research * 4 + yields.energy * 2;
      case 'balanced':
      default:
        return yields.food * 2 + yields.production * 2 + yields.energy * 1.5 + yields.minerals * 1.5;
    }
  }

  /**
   * Calculates gross yields from worked tiles, buildings, and city center
   */
  public static calculateYields(
    colony: Colony,
    surface: PlanetSurface,
    planetHabitabilityPercent: number,
    externalEnergyUpkeep = 0
  ): { grossYields: ResourceYields; upkeep: UpkeepCosts; netYields: ResourceYields } {
    const gross: ResourceYields = {
      food: 0,
      production: 0,
      energy: 0,
      minerals: 0,
      rareResources: 0,
      research: 0,
      influence: 2, // Base political presence
    };

    const upkeep: UpkeepCosts = {
      energy: 0,
      minerals: 0,
      credits: 0,
    };

    // 1. Worked Hex Tiles
    const workedTiles = surface.tiles.filter((t) => colony.workedHexKeys.includes(t.key));
    for (const tile of workedTiles) {
      const biome = BIOME_CATALOG[tile.biome];
      gross.food += biome.baseYields.food;
      gross.production += biome.baseYields.production;
      gross.energy += biome.baseYields.energy;
      gross.minerals += biome.baseYields.minerals;
      gross.rareResources += biome.baseYields.rareResources;
      gross.research += biome.baseYields.research;

      // Add resource deposits if discovered
      if (tile.isDepositDiscovered && tile.deposit !== 'none') {
        const dep = DEPOSIT_CATALOG[tile.deposit];
        if (dep.yieldBonus.food) gross.food += dep.yieldBonus.food;
        if (dep.yieldBonus.production) gross.production += dep.yieldBonus.production;
        if (dep.yieldBonus.energy) gross.energy += dep.yieldBonus.energy;
        if (dep.yieldBonus.minerals) gross.minerals += dep.yieldBonus.minerals;
        if (dep.yieldBonus.rareResources) gross.rareResources += dep.yieldBonus.rareResources;
        if (dep.yieldBonus.research) gross.research += dep.yieldBonus.research;
        if (dep.yieldBonus.influence) gross.influence += dep.yieldBonus.influence;
      }
    }

    // 2. Buildings on Colony
    for (const bInstance of colony.buildings) {
      if (!bInstance.isActive) continue;
      const bDef = BUILDING_CATALOG[bInstance.buildingDefId];
      if (!bDef) continue;

      // Add yields multiplied by level
      const lvl = bInstance.level;
      if (bDef.yieldsPerLevel.food) gross.food += bDef.yieldsPerLevel.food * lvl;
      if (bDef.yieldsPerLevel.production) gross.production += bDef.yieldsPerLevel.production * lvl;
      if (bDef.yieldsPerLevel.energy) gross.energy += bDef.yieldsPerLevel.energy * lvl;
      if (bDef.yieldsPerLevel.minerals) gross.minerals += bDef.yieldsPerLevel.minerals * lvl;
      if (bDef.yieldsPerLevel.rareResources) gross.rareResources += bDef.yieldsPerLevel.rareResources * lvl;
      if (bDef.yieldsPerLevel.research) gross.research += bDef.yieldsPerLevel.research * lvl;
      if (bDef.yieldsPerLevel.influence) gross.influence += bDef.yieldsPerLevel.influence * lvl;

      // Add Upkeeps
      upkeep.energy += bDef.energyUpkeepPerLevel * lvl;
      upkeep.minerals += bDef.mineralUpkeepPerLevel * lvl;
      upkeep.credits = (upkeep.credits ?? 0) + (bDef.creditUpkeepPerLevel ?? 0) * lvl;
    }

    // 2b. Multi-hex districts (operate automatically, independent of workers)
    const districtYields = DistrictManager.calculateDistrictYields(colony);
    if (districtYields.yields.food) gross.food += districtYields.yields.food;
    if (districtYields.yields.production) gross.production += districtYields.yields.production;
    if (districtYields.yields.energy) gross.energy += districtYields.yields.energy;
    if (districtYields.yields.minerals) gross.minerals += districtYields.yields.minerals;
    if (districtYields.yields.rareResources) gross.rareResources += districtYields.yields.rareResources;
    if (districtYields.yields.research) gross.research += districtYields.yields.research;
    if (districtYields.yields.influence) gross.influence += districtYields.yields.influence;
    upkeep.energy += districtYields.upkeepEnergy;

    // 2c. Externer Energie-Unterhalt (z. B. Flottenunterhalt dieser Kolonie)
    upkeep.energy += Math.max(0, Math.round(externalEnergyUpkeep));

    // 3. Citizen food consumption (2 food per Pop unit)
    const popUnits = colony.population >= 100 ? Math.max(1, Math.floor(colony.population / 1000)) : colony.population;
    const citizenFoodConsumption = popUnits * 2;

    // 4. Energy Balance
    const netEnergy = gross.energy - upkeep.energy;
    const energyDeficit = netEnergy < 0;

    // 5. Production Efficiency: -25% penalty if energy deficit
    const efficiencyFactor = energyDeficit ? 0.75 : 1.0;
    const effectiveProduction = Math.round(gross.production * efficiencyFactor);

    // 6. Habitability penalty on food if below 40%
    const habitabilityFactor = Math.max(0.4, planetHabitabilityPercent / 100);
    const effectiveFood = Math.round(gross.food * habitabilityFactor);

    const net: ResourceYields = {
      food: effectiveFood - citizenFoodConsumption,
      production: effectiveProduction,
      energy: netEnergy,
      minerals: gross.minerals - upkeep.minerals,
      rareResources: gross.rareResources,
      research: gross.research,
      influence: gross.influence,
    };

    return { grossYields: gross, upkeep, netYields: net };
  }

  /**
   * Berechnet Erträge, Unterhalt und die daraus abgeleiteten Anzeigewerte neu,
   * ohne Vorräte oder Bevölkerung zu verändern.
   *
   * Wird für UI-Aktionen verwendet, die die Arbeitszuweisung beeinflussen
   * (z. B. Arbeitsfokus). Wiederholtes Umschalten darf keine Ressourcen erzeugen.
   */
  public static recalculateYields(
    colony: Colony,
    surface: PlanetSurface,
    planetHabitabilityPercent: number,
    externalEnergyUpkeep = 0,
    modifiers?: EmpireModifiers
  ): void {
    EconomyEngine.allocateCitizenWorkforce(colony, surface);

    const { grossYields, upkeep, netYields } = EconomyEngine.calculateYields(
      colony,
      surface,
      planetHabitabilityPercent,
      externalEnergyUpkeep
    );

    if (modifiers) {
      EconomyEngine.applyEmpireYieldModifiers(grossYields, modifiers);
      EconomyEngine.applyEmpireYieldModifiers(netYields, modifiers);
    }

    colony.grossYields = grossYields;
    colony.upkeep = upkeep;
    colony.netYields = netYields;
    colony.energyDeficit = netYields.energy < 0;
    colony.stockpile.energyBalance = netYields.energy;
    colony.influenceRate = netYields.influence;
    colony.researchOutput = netYields.research;
  }

  /**
   * Applies economic turn simulation: adds net yields to stockpile, handles growth or starvation
   */
  public static simulateTurnEconomy(
    colony: Colony,
    surface: PlanetSurface,
    planetHabitabilityPercent: number,
    externalEnergyUpkeep = 0,
    modifiers?: EmpireModifiers
  ): void {
    // 1.-2. Arbeitszuweisung und Erträge neu berechnen (ohne Vorratsänderung)
    EconomyEngine.recalculateYields(
      colony,
      surface,
      planetHabitabilityPercent,
      externalEnergyUpkeep,
      modifiers
    );
    const netYields = colony.netYields;

    // 3. Update stockpile
    colony.stockpile.minerals = Math.max(0, colony.stockpile.minerals + netYields.minerals);
    colony.stockpile.rareResources = Math.max(0, colony.stockpile.rareResources + netYields.rareResources);
    colony.stockpile.influence = Math.max(0, colony.stockpile.influence + netYields.influence);

    // 3b. Finanzen: Steuersatz, Korruption, Zufriedenheit und Steuereinnahmen.
    //     Die Zufriedenheit erhält den Reichsmodifikator (Fraktionen/Politik).
    const approval = EconomyEngine.recalculateTaxState(
      colony,
      modifiers?.approvalModifier ?? 0
    );

    // 4. Population growth & food bucket
    const growthMultiplier =
      EconomyEngine.calculateGrowthMultiplier(planetHabitabilityPercent) *
      EconomyEngine.calculateApprovalGrowthFactor(approval);
    if (netYields.food > 0) {
      const growthProgress = Math.round(netYields.food * growthMultiplier * 100) / 100;
      colony.growthFoodProgress += growthProgress;
      colony.stockpile.food += Math.floor(netYields.food * 0.3); // Stash small surplus
      if (colony.growthFoodProgress >= colony.growthFoodRequired) {
        colony.population += (colony.population >= 100 ? 1000 : 1);
        colony.growthFoodProgress -= colony.growthFoodRequired;
        colony.growthFoodRequired = EconomyEngine.calculateGrowthRequired(colony.population);
      }
    } else if (netYields.food < 0) {
      // Deficit: consume stored food
      const deficit = Math.abs(netYields.food);
      if (colony.stockpile.food >= deficit) {
        colony.stockpile.food -= deficit;
      } else {
        colony.stockpile.food = 0;
        colony.growthFoodProgress = Math.max(0, colony.growthFoodProgress - deficit * 2);
      }
    }
  }

  /**
   * Wendet Reichsmodifikatoren auf Erträge an. Negative Erträge (z. B.
   * Energieunterhalt) bleiben unskaliert, damit eine Politik keinen Unterhalt
   * vergünstigt. Produktion, Forschung und Einfluss sind die politischen Hebel.
   */
  private static applyEmpireYieldModifiers(
    yields: ResourceYields,
    modifiers: EmpireModifiers
  ): void {
    yields.production = scalePositive(yields.production, modifiers.productionMultiplier);
    yields.research = scalePositive(yields.research, modifiers.researchMultiplier);
    yields.influence = scalePositive(yields.influence, modifiers.influenceMultiplier);
  }
}

function scalePositive(value: number, multiplier: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(multiplier)) return value;
  if (value <= 0) return value;
  return Math.round(value * multiplier * 100) / 100;
}
