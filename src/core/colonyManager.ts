/**
 * Astraea 4X - Colony Manager (Module 4)
 * Responsible for creating, tracking, and maintaining colonies across star systems and hex surfaces.
 * Enforces atomic state transitions, local stockpiles, building instances, and surface claims.
 */

import { BUILDING_CATALOG } from '../data/buildingCatalog.ts';
import { HexMath } from '../surface/hexMath.ts';
import { SurfaceGenerator } from '../surface/surfaceGenerator.ts';
import { SurfaceManager } from '../surface/surfaceManager.ts';
import { ColonizationValidator } from './colonizationRules.ts';
import { DEFAULT_TAX_RATE, EconomyEngine } from './economyEngine.ts';
import { EventBus } from './EventBus.ts';
import {
  BuildingInstance,
  Colony,
  HexCoord,
  Planet,
  PlanetSurface,
  StarSystem,
} from './types.ts';

export interface ColonyFoundingResult {
  success: boolean;
  colony?: Colony;
  reason?: string;
}

/**
 * Gründungsausstattung aus dem Laderaum eines Kolonieschiffs. Fehlt sie,
 * gelten die neutralen Standardwerte (z. B. für KI-Gründungen).
 */
export interface ColonyFoundingSupply {
  population: number;
  stockpile: {
    food: number;
    minerals: number;
    rareResources: number;
    influence: number;
  };
}

export type DevelopmentTier = Colony['developmentTier'];

export const DEVELOPMENT_TIERS: DevelopmentTier[] = ['outpost', 'settlement', 'colony'];

export const COLONY_TIER_LABELS: Record<DevelopmentTier, string> = {
  outpost: 'Außenposten',
  settlement: 'Siedlung',
  colony: 'Kolonie',
};

export interface ColonyTierRequirement {
  population: number;
  minerals: number;
  rareResources: number;
  influence: number;
}

export const COLONY_TIER_REQUIREMENTS: Record<Exclude<DevelopmentTier, 'outpost'>, ColonyTierRequirement> = {
  settlement: { population: 2000, minerals: 60, rareResources: 0, influence: 10 },
  colony: { population: 3000, minerals: 150, rareResources: 25, influence: 20 },
};

export interface ColonyTierUpgradeResult {
  success: boolean;
  colony?: Colony;
  previousTier?: DevelopmentTier;
  newTier?: Exclude<DevelopmentTier, 'outpost'>;
  reason?: string;
}

export class ColonyManager {
  private colonies: Map<string, Colony> = new Map();
  private eventBus: EventBus;

  constructor(eventBus: EventBus = EventBus.getInstance()) {
    this.eventBus = eventBus;
  }

  public getColonies(): Colony[] {
    return Array.from(this.colonies.values());
  }

  public getColonyById(id: string): Colony | null {
    return this.colonies.get(id) ?? null;
  }

  public getColonyByPlanetId(planetId: string): Colony | null {
    for (const colony of this.colonies.values()) {
      if (colony.planetId === planetId) {
        return colony;
      }
    }
    return null;
  }

  public getColoniesByCivId(civId: string): Colony[] {
    return Array.from(this.colonies.values()).filter((c) => c.civId === civId);
  }

  /**
   * Establishes a new colony on a validated planet and its surface hex grid.
   * Flexibly supports both Modul 3 signature: (planet, system, currentTurn, turnDateStandard, customName, targetLandingCoord)
   * and Modul 4 signature: (planet, system, surface, currentTurn, turnDateStandard, civId, customName, targetLandingCoord).
   */
  public foundColony(
    planet: Planet,
    system: StarSystem,
    arg3?: PlanetSurface | number,
    arg4?: number | string,
    arg5?: string,
    arg6?: string | HexCoord,
    arg7?: string,
    arg8?: HexCoord,
    arg9?: ColonyFoundingSupply
  ): ColonyFoundingResult {
    // Detect argument format
    let surface: PlanetSurface;
    let currentTurn: number;
    let turnDateStandard: string;
    let civId: string = 'player-empire';
    let customName: string | undefined;
    let targetLandingCoord: HexCoord | undefined;

    if (typeof arg3 === 'number') {
      // Modul 3 signature: (planet, system, currentTurn, turnDateStandard, customName, targetLandingCoord)
      currentTurn = arg3;
      turnDateStandard = typeof arg4 === 'string' ? arg4 : '2380.01';
      customName = typeof arg5 === 'string' ? arg5 : undefined;
      targetLandingCoord = typeof arg6 === 'object' && arg6 !== null ? (arg6 as HexCoord) : undefined;
      surface = SurfaceGenerator.generateSurface(planet, system.id || 'DEFAULT_SEED');
    } else if (arg3 && typeof arg3 === 'object' && 'tiles' in arg3) {
      // Modul 4 signature: (planet, system, surface, currentTurn, turnDateStandard, civId, customName, targetLandingCoord)
      surface = arg3 as PlanetSurface;
      currentTurn = typeof arg4 === 'number' ? arg4 : 1;
      turnDateStandard = typeof arg5 === 'string' ? arg5 : '2380.01';
      civId = typeof arg6 === 'string' ? arg6 : 'player-empire';
      customName = arg7;
      targetLandingCoord = arg8;
    } else {
      // Fallback default
      currentTurn = 1;
      turnDateStandard = '2380.01';
      surface = SurfaceGenerator.generateSurface(planet, system.id || 'DEFAULT_SEED');
      if (typeof arg4 === 'string') turnDateStandard = arg4;
      if (typeof arg5 === 'string') customName = arg5;
      if (typeof arg6 === 'object' && arg6 !== null) targetLandingCoord = arg6 as HexCoord;
    }

    // 1. Central validation check
    const check = ColonizationValidator.canColonize(planet, system, true);
    if (!check.allowed) {
      this.eventBus.emit('colony:failed', {
        planetId: planet ? planet.id : 'unknown',
        reason: check.reason || 'Kolonisierungsvoraussetzungen nicht erfüllt.',
      });
      return {
        success: false,
        reason: check.reason,
      };
    }

    const foundingPopulation = Math.max(1, Math.round(arg9?.population ?? 1000));
    const foundingStockpile = {
      food: arg9?.stockpile.food ?? 30,
      minerals: arg9?.stockpile.minerals ?? 60,
      rareResources: arg9?.stockpile.rareResources ?? 10,
      influence: arg9?.stockpile.influence ?? 20,
    };

    // 2. Select Landing Site
    const centerCoord = targetLandingCoord || {
      q: Math.floor(surface.width / 4),
      r: Math.floor(surface.height / 2),
    };
    const centerKey = HexMath.coordToKey(centerCoord);

    // Verify center hex is not already claimed
    const centerTile = surface.tiles.find((t) => t.key === centerKey);
    if (centerTile && centerTile.claimedByColonyId) {
      return {
        success: false,
        reason: 'Das gewählte Landefeld ist bereits durch eine Kolonie besetzt.',
      };
    }

    // 3. Colony ID & Name
    const colonyId = `colony-${planet.id}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const colonyName =
      customName && customName.trim().length > 0 ? customName.trim() : `${planet.name} Kolonie`;

    // 4. Initial Claimed Hexes: Center + 2 adjacent hexes
    const claimedKeys: string[] = [centerKey];
    const neighbors = HexMath.getNeighbors(centerCoord);
    for (const n of neighbors.slice(0, 3)) {
      const nKey = HexMath.coordToKey(n);
      const nTile = surface.tiles.find((t) => t.key === nKey);
      if (nTile && !nTile.claimedByColonyId && nTile.biome !== 'mountains' && nTile.biome !== 'ocean') {
        claimedKeys.push(nKey);
      }
    }

    // 5. City Center Building Instance
    const cityCenterBuildingId = `bld-citycenter-${colonyId}`;
    const cityCenterInstance: BuildingInstance = {
      id: cityCenterBuildingId,
      colonyId,
      hexCoord: centerCoord,
      buildingDefId: 'city_center',
      level: 1,
      isActive: true,
    };

    // 6. Construct new full Colony entity
    const newColony: Colony = {
      id: colonyId,
      name: colonyName,
      planetId: planet.id,
      systemId: system.id,
      civId,
      factionId: civId,
      foundedTurn: currentTurn,
      foundedDate: turnDateStandard,
      developmentTier: 'outpost',
      status: 'active',
      sizeClass: planet.sizeClass,

      // Hex surface
      cityCenterCoord: centerCoord,
      claimedHexKeys: claimedKeys,
      workedHexKeys: [centerKey],
      workFocus: 'balanced',

      // Wirtschaft Stufe A: Steuern, Korruption und Zufriedenheit
      taxRate: DEFAULT_TAX_RATE,
      corruption: 0,
      approval: 50,
      taxRevenue: 0,

      // Population: 1000 colonists = 1 citizen pop workforce unit in Civ style
      population: foundingPopulation,
      growthFoodProgress: 0,
      growthFoodRequired: EconomyEngine.calculateGrowthRequired(foundingPopulation),

      // Stockpile: ausschließlich aus der Schiffsfracht (bzw. Standardwerte)
      stockpile: {
        food: foundingStockpile.food,
        minerals: foundingStockpile.minerals,
        rareResources: foundingStockpile.rareResources,
        energyBalance: 2,
        influence: foundingStockpile.influence,
      },
      netYields: {
        food: 2,
        production: 2,
        energy: 2,
        minerals: 2,
        rareResources: 0,
        research: 1,
        influence: 2,
      },
      grossYields: {
        food: 4,
        production: 2,
        energy: 2,
        minerals: 2,
        rareResources: 0,
        research: 1,
        influence: 2,
      },
      upkeep: {
        energy: 0,
        minerals: 0,
      },
      energyDeficit: false,

      // Buildings & Queues
      buildings: [cityCenterInstance],
      buildQueue: [],

      // Output
      influenceRate: 2,
      researchOutput: 1,
    };

    // 7. Update Surface Hexes
    for (const key of claimedKeys) {
      const tile = surface.tiles.find((t) => t.key === key);
      if (tile) {
        tile.claimedByColonyId = colonyId;
        tile.claimedByCivId = civId;
        tile.visibility = 'visible';
        if (key === centerKey) {
          tile.isCityCenter = true;
          tile.buildingInstanceId = cityCenterBuildingId;
        }
      }
    }

    // 8. Atomic bidirectional state updates on Planet & System
    planet.colonizationStatus = 'colonized';
    planet.colonyId = colonyId;
    system.discoveryStatus = 'colonized';

    // 9. Initial Economic Simulation
    EconomyEngine.simulateTurnEconomy(newColony, surface, planet.habitability);

    // 10. Store in collection
    this.colonies.set(colonyId, newColony);

    // 11. Global event broadcast
    this.eventBus.emit('colony:founded', {
      colony: newColony,
      planet,
      turn: currentTurn,
    });

    return {
      success: true,
      colony: newColony,
    };
  }

  public getNextDevelopmentTier(tier: DevelopmentTier): Exclude<DevelopmentTier, 'outpost'> | null {
    const index = DEVELOPMENT_TIERS.indexOf(tier);
    if (index < 0 || index >= DEVELOPMENT_TIERS.length - 1) return null;
    return DEVELOPMENT_TIERS[index + 1] as Exclude<DevelopmentTier, 'outpost'>;
  }

  public getTierRequirement(tier: DevelopmentTier): ColonyTierRequirement | null {
    if (tier === 'outpost') return null;
    return COLONY_TIER_REQUIREMENTS[tier];
  }

  /**
   * Checks whether the next development tier can be reached with the colony's
   * current population and stockpiled resources. Does not mutate the colony.
   */
  public canUpgradeDevelopmentTier(colonyId: string): ColonyTierUpgradeResult {
    const colony = this.colonies.get(colonyId);
    if (!colony) {
      return { success: false, reason: 'Kolonie nicht gefunden.' };
    }

    const previousTier = colony.developmentTier;
    const newTier = this.getNextDevelopmentTier(previousTier);
    if (!newTier) {
      return {
        success: false,
        colony,
        previousTier,
        reason: 'Maximale Entwicklungsstufe erreicht.',
      };
    }

    const req = COLONY_TIER_REQUIREMENTS[newTier];
    if (colony.population < req.population) {
      return {
        success: false,
        colony,
        previousTier,
        newTier,
        reason: `Bevölkerung zu gering (${colony.population.toLocaleString('de-DE')} von ${req.population.toLocaleString('de-DE')}).`,
      };
    }
    if (colony.stockpile.minerals < req.minerals) {
      return {
        success: false,
        colony,
        previousTier,
        newTier,
        reason: `Mineralien reichen nicht (${colony.stockpile.minerals} von ${req.minerals}).`,
      };
    }
    if (colony.stockpile.rareResources < req.rareResources) {
      return {
        success: false,
        colony,
        previousTier,
        newTier,
        reason: `Seltene Ressourcen reichen nicht (${colony.stockpile.rareResources} von ${req.rareResources}).`,
      };
    }
    if (colony.stockpile.influence < req.influence) {
      return {
        success: false,
        colony,
        previousTier,
        newTier,
        reason: `Einfluss reicht nicht (${colony.stockpile.influence} von ${req.influence}).`,
      };
    }

    return { success: true, colony, previousTier, newTier };
  }

  /**
   * Spends the required stockpile resources and raises the colony's
   * development tier by one step. Emits `colony:tierChanged` on success.
   */
  public upgradeDevelopmentTier(colonyId: string): ColonyTierUpgradeResult {
    const check = this.canUpgradeDevelopmentTier(colonyId);
    if (!check.success || !check.colony || !check.previousTier || !check.newTier) {
      return check;
    }

    const colony = check.colony;
    const req = COLONY_TIER_REQUIREMENTS[check.newTier];
    colony.stockpile.minerals -= req.minerals;
    colony.stockpile.rareResources -= req.rareResources;
    colony.stockpile.influence -= req.influence;
    colony.developmentTier = check.newTier;

    this.eventBus.emit('colony:tierChanged', {
      colonyId: colony.id,
      previousTier: check.previousTier,
      newTier: check.newTier,
      civId: colony.civId,
    });

    return { ...check, success: true };
  }

  /**
   * Loads saved colonies collection with migration for Module 4 fields
   */
  public loadColonies(colonies: Colony[]): void {
    this.colonies.clear();
    if (Array.isArray(colonies)) {
      colonies.forEach((c) => {
        // Migration / Backward Compatibility for Module 3 records
        if (!c.civId) c.civId = 'player-empire';
        if (!c.developmentTier) c.developmentTier = 'outpost';
        if (!c.cityCenterCoord) c.cityCenterCoord = { q: 4, r: 4 };
        if (!c.claimedHexKeys) c.claimedHexKeys = [HexMath.coordToKey(c.cityCenterCoord)];
        if (!c.workedHexKeys) c.workedHexKeys = [...c.claimedHexKeys];
        if (!c.workFocus) c.workFocus = 'balanced';
        if (!c.stockpile) {
          c.stockpile = { food: 25, minerals: 50, rareResources: 10, energyBalance: 2, influence: 15 };
        }
        if (!c.netYields) {
          c.netYields = { food: 2, production: 2, energy: 2, minerals: 2, rareResources: 0, research: 1, influence: 2 };
        }
        if (!c.grossYields) c.grossYields = { ...c.netYields };
        if (!c.upkeep) c.upkeep = { energy: 0, minerals: 0 };
        if (c.energyDeficit === undefined) c.energyDeficit = false;
        if (!c.buildings) {
          c.buildings = [
            {
              id: `bld-citycenter-${c.id}`,
              colonyId: c.id,
              hexCoord: c.cityCenterCoord,
              buildingDefId: 'city_center',
              level: 1,
              isActive: true,
            },
          ];
        }
        if (!c.buildQueue) c.buildQueue = [];
        if (!c.districts) c.districts = [];
        if (c.influenceRate === undefined) c.influenceRate = 2;
        if (c.researchOutput === undefined) c.researchOutput = 1;
        if (c.growthFoodProgress === undefined) c.growthFoodProgress = 0;
        if (c.growthFoodRequired === undefined) c.growthFoodRequired = EconomyEngine.calculateGrowthRequired(c.population || 1);
        // Migration Stufe A: Wirtschaftsfelder für Altbestände
        if (c.taxRate === undefined) c.taxRate = DEFAULT_TAX_RATE;
        if (c.corruption === undefined) c.corruption = 0;
        if (c.approval === undefined) c.approval = 50;
        if (c.taxRevenue === undefined) c.taxRevenue = 0;

        this.colonies.set(c.id, c);
      });
    }
  }

  public clear(): void {
    this.colonies.clear();
  }
}
