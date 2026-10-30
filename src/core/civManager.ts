/**
 * Astraea 4X - Civilizations & AI Empire Coordinator
 * Coordinates player and AI rival civilizations, enforcing identical rule validation.
 */

import { BUILDING_CATALOG } from '../data/buildingCatalog.ts';
import { getHumanFaction } from '../data/factionCatalog.ts';
import { HexMath } from '../surface/hexMath.ts';
import { SurfaceManager } from '../surface/surfaceManager.ts';
import { BuildQueueManager } from './buildQueueManager.ts';
import { ColonyExpansion } from './colonyExpansion.ts';
import { EconomyEngine } from './economyEngine.ts';
import { ResearchManager } from './researchManager.ts';
import {
  Civilization,
  Colony,
  FactionAssignment,
  PlanetSurface,
  SurfaceUnit,
} from './types.ts';

/** Startkapital der Staatskasse in Credits (Stufe A: eigene Balance). */
export const STARTING_TREASURY_PLAYER = 500;
export const STARTING_TREASURY_AI = 300;

export class CivManager {
  private civilizations: Map<string, Civilization> = new Map();

  constructor() {
    this.initDefaultCivilizations();
  }

  private initDefaultCivilizations(): void {
    // Player Empire
    this.civilizations.set('player-empire', {
      id: 'player-empire',
      name: 'Vereinte Solare Konföderation',
      color: '#06b6d4',
      borderColor: '#0891b2',
      isPlayer: true,
      researchState: {
        completedTechIds: [],
        currentTechId: null,
        currentTechInvested: 0,
      },
      treasury: STARTING_TREASURY_PLAYER,
    });

    // AI Rival 1: Orion Mining Combine
    this.civilizations.set('orion-combine', {
      id: 'orion-combine',
      name: 'Orion-Bergbau-Konsortium',
      color: '#f59e0b',
      borderColor: '#d97706',
      isPlayer: false,
      researchState: {
        completedTechIds: [],
        currentTechId: null,
        currentTechInvested: 0,
      },
      treasury: STARTING_TREASURY_AI,
    });

    // AI Rival 2: Kepler Ascendancy
    this.civilizations.set('kepler-ascendancy', {
      id: 'kepler-ascendancy',
      name: 'Kepler-Ascendanz',
      color: '#a855f7',
      borderColor: '#9333ea',
      isPlayer: false,
      researchState: {
        completedTechIds: [],
        currentTechId: null,
        currentTechInvested: 0,
      },
      treasury: STARTING_TREASURY_AI,
    });
  }

  public getCivilizations(): Civilization[] {
    return Array.from(this.civilizations.values());
  }

  /**
   * Baut die Zivilisationen aus der gespeicherten Fraktionszuweisung neu auf.
   * Wird nur bei einer neuen Galaxie aufgerufen; beim Laden kommen die
   * Zivilisationen unverändert aus dem Spielstand, damit niemals neu gewürfelt
   * wird. Die Spielerzivilisation behält ihre feste ID `player-empire`.
   */
  public configureHumanFactions(assignments: readonly FactionAssignment[]): Civilization[] {
    if (assignments.length === 0) {
      return this.getCivilizations();
    }

    const next = new Map<string, Civilization>();
    for (const assignment of assignments) {
      const faction = getHumanFaction(assignment.factionId);
      if (!faction) continue;
      const isPlayer = assignment.role === 'player';
      next.set(assignment.civId, {
        id: assignment.civId,
        name: faction.name,
        color: faction.color,
        borderColor: faction.borderColor,
        isPlayer,
        researchState: {
          completedTechIds: [],
          currentTechId: null,
          currentTechInvested: 0,
        },
        treasury: isPlayer ? STARTING_TREASURY_PLAYER : STARTING_TREASURY_AI,
        factionId: faction.id,
        fleetStyleId: faction.fleetStyleId,
      });
    }

    if (next.size === 0) return this.getCivilizations();
    // Genau eine Spielerzivilisation ist Pflicht; sonst bleibt der Altbestand.
    const playerCount = Array.from(next.values()).filter((civ) => civ.isPlayer).length;
    if (playerCount !== 1) return this.getCivilizations();

    this.civilizations = next;
    return this.getCivilizations();
  }

  public getCivilization(id: string): Civilization | null {
    return this.civilizations.get(id) ?? null;
  }

  public getPlayerCiv(): Civilization {
    const player = Array.from(this.civilizations.values()).find((c) => c.isPlayer);
    return player || this.civilizations.get('player-empire')!;
  }

  public loadCivilizations(civs: Civilization[]): void {
    this.civilizations.clear();
    for (const c of civs) {
      // Altbestände ohne Staatskasse erhalten das Startkapital ihrer Rolle.
      if (typeof c.treasury !== 'number' || !Number.isFinite(c.treasury)) {
        c.treasury = c.isPlayer ? STARTING_TREASURY_PLAYER : STARTING_TREASURY_AI;
      }
      this.civilizations.set(c.id, c);
    }
  }

  /**
   * Executes AI turns using the exact same rule validators
   */
  public executeAITurns(
    colonies: Colony[],
    surfaceManager: SurfaceManager,
    currentTurn: number
  ): void {
    const aiCivs = Array.from(this.civilizations.values()).filter((c) => !c.isPlayer);

    for (const civ of aiCivs) {
      // 1. AI Research Choice
      if (!civ.researchState.currentTechId) {
        const available = ResearchManager.getAvailableTechs(civ.researchState);
        if (available.length > 0) {
          ResearchManager.selectTech(civ.researchState, available[0].id);
        }
      }

      // 2. AI Colony Actions
      const civColonies = colonies.filter((c) => c.civId === civ.id);
      for (const col of civColonies) {
        const surface = surfaceManager.getSurface(col.planetId);
        if (!surface) continue;

        // Try territorial expansion if enough influence
        if (col.stockpile.influence >= 25) {
          const claimableNeighbors: { q: number; r: number }[] = [];
          for (const key of col.claimedHexKeys) {
            const coord = HexMath.keyToCoord(key);
            const neighbors = HexMath.getNeighbors(coord);
            for (const n of neighbors) {
              const nKey = HexMath.coordToKey(n);
              if (!col.claimedHexKeys.includes(nKey)) {
                claimableNeighbors.push(n);
              }
            }
          }

          for (const cand of claimableNeighbors) {
            const check = ColonyExpansion.canClaimHex(col, cand, surface);
            if (check.allowed) {
              ColonyExpansion.claimHex(col, cand, surface);
              break;
            }
          }
        }

        // Try queueing buildings if queue is empty
        if (col.buildQueue.length === 0) {
          const candidateBuildings = ['solar_array', 'mineral_extractor', 'hydroponics_dome', 'research_lab'];
          for (const bId of candidateBuildings) {
            // Find an empty claimed tile
            const emptyTile = surface.tiles.find(
              (t) => col.claimedHexKeys.includes(t.key) && !t.buildingInstanceId && !t.isCityCenter
            );
            if (emptyTile) {
              const res = BuildQueueManager.queueBuilding(col, bId, emptyTile.coord, surface, currentTurn);
              if (res.success) break;
            }
          }
        }
      }
    }
  }
}
