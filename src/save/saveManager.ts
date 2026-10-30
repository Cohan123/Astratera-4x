/**
 * Astraea 4X - Versioned Save System (Version 4)
 * Manages serialization, deserialization, and schema migration for game states.
 * Guarantees backward compatibility for Version 1, 2 and 3 saves.
 */

import { Moon, SaveGameData } from '../core/types.ts';
import { DEFAULT_TAX_RATE, EconomyEngine } from '../core/economyEngine.ts';
import { STARTING_TREASURY_AI, STARTING_TREASURY_PLAYER } from '../core/civManager.ts';
import { DEFAULT_PLAYER_FACTION_ID, HUMAN_FACTION_IDS } from '../data/factionCatalog.ts';

export const CURRENT_SAVE_VERSION = 5;
export const LOCAL_STORAGE_SAVE_KEY = 'astraea_4x_quicksave';
export const LOCAL_STORAGE_AUTOSAVE_KEY = 'astraea_4x_autosave';

export class SaveManager {
  /**
   * Serializes current state to a versioned JSON string
   */
  public static serialize(data: SaveGameData): string {
    const payload: SaveGameData = {
      ...data,
      version: data.version ?? CURRENT_SAVE_VERSION,
      timestamp: Date.now(),
    };
    return JSON.stringify(payload, null, 2);
  }

  /**
   * Safely deserializes, validates, and migrates older saves
   */
  public static deserialize(jsonString: string): { success: boolean; data?: SaveGameData; error?: string } {
    try {
      const parsed = JSON.parse(jsonString) as SaveGameData;

      if (!parsed || typeof parsed !== 'object') {
        return { success: false, error: 'Ungültige Speicherdatei (kein JSON-Objekt).' };
      }

      if (typeof parsed.version !== 'number') {
        return { success: false, error: 'Fehlende oder ungültige Version in Speicherdatei.' };
      }

      if (parsed.version > CURRENT_SAVE_VERSION) {
        return {
          success: false,
          error: `Speicherdatei stammt aus einer neueren Version (v${parsed.version} > ${CURRENT_SAVE_VERSION}).`,
        };
      }

      if (!parsed.galaxy || !Array.isArray(parsed.galaxy.systems)) {
        return { success: false, error: 'Beschädigte Galaxiedaten in Speicherdatei.' };
      }

      if (!parsed.turnState || typeof parsed.turnState.currentTurn !== 'number') {
        return { success: false, error: 'Beschädigter Rundenstatus in Speicherdatei.' };
      }

      // Migration from Version 1 to Version 2
      if (parsed.version < 2) {
        if (!parsed.civilizations || !Array.isArray(parsed.civilizations)) {
          parsed.civilizations = [
            {
              id: 'player-empire',
              name: 'Vereinte Solare Konföderation',
              color: '#06b6d4',
              borderColor: '#0891b2',
              isPlayer: true,
              treasury: STARTING_TREASURY_PLAYER,
              researchState: { completedTechIds: [], currentTechId: null, currentTechInvested: 0 },
            },
          ];
        }
        if (!parsed.surfaces || !Array.isArray(parsed.surfaces)) {
          parsed.surfaces = [];
        }
        if (!parsed.units || !Array.isArray(parsed.units)) {
          parsed.units = [];
        }
      }

      // Migration from Version 2 to Version 3: Monde und Asteroidengürtel
      // erhalten leere bzw. synthetische Standardwerte, damit alte Spielstände
      // ohne Neugenerierung der Galaxie weiter funktionieren.
      if (parsed.version < 3) {
        for (const system of parsed.galaxy.systems) {
          if (!Array.isArray(system.asteroidBelts)) {
            system.asteroidBelts = [];
          }
          for (const planet of system.planets ?? []) {
            if (!Array.isArray(planet.moons)) {
              planet.moons = this.createLegacyMoons(planet.id, planet.name, planet.moonsCount ?? 0);
            }
          }
        }
        parsed.version = 3;
      }

      // Migration from Version 3 to Version 4: Staatskasse, Steuern, Korruption
      // und Zufriedenheit. Altbestände erhalten neutrale Startwerte, damit die
      // Wirtschaftsanzeige sofort plausibel ist und keine Division durch 0 droht.
      if (parsed.version < 4) {
        for (const civ of parsed.civilizations ?? []) {
          if (typeof civ.treasury !== 'number' || !Number.isFinite(civ.treasury)) {
            civ.treasury = civ.isPlayer ? STARTING_TREASURY_PLAYER : STARTING_TREASURY_AI;
          }
        }
        for (const colony of parsed.colonies ?? []) {
          if (colony.taxRate === undefined) {
            colony.taxRate = DEFAULT_TAX_RATE;
          }
          const tier = colony.developmentTier ?? 'outpost';
          if (colony.corruption === undefined) {
            colony.corruption = EconomyEngine.calculateCorruption(colony.taxRate, tier);
          }
          if (colony.approval === undefined) {
            colony.approval = EconomyEngine.calculateApproval(colony.taxRate, tier);
          }
          if (colony.taxRevenue === undefined) {
            colony.taxRevenue = EconomyEngine.calculateTaxRevenue(colony);
          }
        }
        parsed.version = 4;
      }

      // Migration from Version 4 to Version 5: Fraktionszuordnung,
      // Nachrichtenverlauf und Stationsgrundlage. Alte Spielstände behalten
      // ihre Zivilisationen unverändert; es wird nichts neu gewürfelt.
      if (parsed.version < 5) {
        if (!Array.isArray(parsed.messageLog)) {
          parsed.messageLog = [];
        }
        if (!Array.isArray(parsed.stations)) {
          parsed.stations = [];
        }
        if (!Array.isArray(parsed.galaxy.factionAssignments)) {
          // Nur eine Anzeigehülle für Altspeicherstände – ohne Neuverlosung.
          // Die Zuordnung ist deterministisch, eindeutig und ohne Doppelungen.
          const playerFaction = parsed.civilizations?.find((civ) => civ.isPlayer)?.factionId ??
            DEFAULT_PLAYER_FACTION_ID;
          const aiPool = HUMAN_FACTION_IDS.filter((id) => id !== playerFaction);
          let aiIndex = 0;
          parsed.galaxy.factionAssignments = (parsed.civilizations ?? [])
            .map((civ) => {
              if (civ.isPlayer) {
                return { factionId: playerFaction, civId: civ.id, role: 'player' as const };
              }
              const factionId = aiPool[aiIndex % Math.max(1, aiPool.length)];
              aiIndex += 1;
              return { factionId, civId: civ.id, role: 'ai' as const };
            })
            .filter((assignment) => Boolean(assignment.factionId));
        }
        parsed.version = 5;
      }

      return { success: true, data: parsed };
    } catch (e: any) {
      return { success: false, error: `JSON-Parsing-Fehler: ${e.message}` };
    }
  }

  /**
   * Erzeugt für Altspeicherstände (v1/v2) synthetische Mondobjekte ohne
   * Zufall, damit die Anzeige konsistent bleibt und nichts neu generiert wird.
   */
  private static createLegacyMoons(planetId: string, planetName: string, moonsCount: number): Moon[] {
    const count = Math.max(0, Math.min(14, moonsCount));
    const moons: Moon[] = [];
    for (let index = 1; index <= count; index++) {
      const letter = String.fromCharCode(64 + Math.min(index, 26));
      moons.push({
        id: `${planetId}-M${index}`,
        name: `${planetName} ${letter}`,
        planetId,
        index,
        moonType: 'rocky',
        orbitRadiusPlanetRadii: Number((2.2 + index * 0.5).toFixed(2)),
        orbitalPeriodDays: 10 + index * 5,
        radiusKm: 500,
        color: '#D6D3D1',
        isMajor: index <= 4,
      });
    }
    return moons;
  }

  /**
   * Saves game state to browser LocalStorage
   */
  public static saveToLocalStorage(data: SaveGameData, key: string = LOCAL_STORAGE_SAVE_KEY): boolean {
    if (typeof localStorage === 'undefined') return false;
    try {
      const json = this.serialize(data);
      localStorage.setItem(key, json);
      return true;
    } catch (e) {
      console.error('Failed to save to localStorage:', e);
      return false;
    }
  }

  /**
   * Loads game state from browser LocalStorage
   */
  public static loadFromLocalStorage(key: string = LOCAL_STORAGE_SAVE_KEY): SaveGameData | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;

      const result = this.deserialize(raw);
      if (result.success && result.data) {
        return result.data;
      }
      return null;
    } catch (e) {
      console.error('Failed to load from localStorage:', e);
      return null;
    }
  }

  /**
   * Checks if a save exists in LocalStorage
   */
  public static hasSave(key: string = LOCAL_STORAGE_SAVE_KEY): boolean {
    try {
      return localStorage.getItem(key) !== null;
    } catch {
      return false;
    }
  }

  /**
   * Clears saved state from LocalStorage
   */
  public static clearSave(key: string = LOCAL_STORAGE_SAVE_KEY): void {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.error('Failed to clear save:', e);
    }
  }

  /**
   * Triggers a browser download of the save file
   */
  public static downloadSaveFile(data: SaveGameData): void {
    const json = this.serialize(data);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `astraea-save-round-${data.turnState.currentTurn}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
