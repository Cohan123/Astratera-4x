/**
 * Astraea 4X - Diplomacy Manager (Phase 4)
 * Tracks the relation between every pair of civilizations. Relations are
 * symmetric and default to peace, so two fleets of different empires can share
 * a system without fighting. Only an explicit declaration of war turns a pair
 * hostile, and the fleet combat step asks this manager before it resolves a
 * battle. Peace requires a short war before it can be signed, which prevents
 * declaring and revoking a war in the same turn.
 */

import { EventBus } from './EventBus.ts';
import {
  DiplomaticPair,
  DiplomaticRelation,
  DiplomacyResult,
} from './types.ts';

/** Mindestdauer eines Krieges, bevor Frieden geschlossen werden darf. */
export const PEACE_MIN_WAR_TURNS = 3;

export class DiplomacyManager {
  private pairs: Map<string, DiplomaticPair> = new Map();
  private knownCivIds: Set<string> = new Set();

  constructor(private eventBus: EventBus) {}

  private static pairKey(civAId: string, civBId: string): string {
    return civAId < civBId ? `${civAId}|${civBId}` : `${civBId}|${civAId}`;
  }

  private static ordered(civAId: string, civBId: string): [string, string] {
    return civAId < civBId ? [civAId, civBId] : [civBId, civAId];
  }

  /**
   * Registriert die bekannten Zivilisationen und legt für jedes fehlende Paar
   * einen Friedenszustand an. Bereits gespeicherte Beziehungen bleiben erhalten.
   */
  public syncCivilizations(civIds: string[]): void {
    this.knownCivIds = new Set(civIds);
    const ids = Array.from(this.knownCivIds).sort();

    for (const key of Array.from(this.pairs.keys())) {
      const pair = this.pairs.get(key)!;
      if (!this.knownCivIds.has(pair.civAId) || !this.knownCivIds.has(pair.civBId)) {
        this.pairs.delete(key);
      }
    }

    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const key = DiplomacyManager.pairKey(ids[i], ids[j]);
        if (!this.pairs.has(key)) {
          this.pairs.set(key, {
            civAId: ids[i],
            civBId: ids[j],
            relation: 'peace',
            sinceTurn: 0,
          });
        }
      }
    }
  }

  public clear(): void {
    this.pairs.clear();
    this.knownCivIds.clear();
  }

  public getPair(civAId: string, civBId: string): DiplomaticPair | null {
    if (civAId === civBId) return null;
    const pair = this.pairs.get(DiplomacyManager.pairKey(civAId, civBId));
    return pair ? { ...pair } : null;
  }

  public getRelation(civAId: string, civBId: string): DiplomaticRelation {
    if (civAId === civBId) return 'peace';
    return this.pairs.get(DiplomacyManager.pairKey(civAId, civBId))?.relation ?? 'peace';
  }

  public isAtWar(civAId: string, civBId: string): boolean {
    return this.getRelation(civAId, civBId) === 'war';
  }

  /** Alle bekannten Paare, deterministisch sortiert. */
  public getPairs(): DiplomaticPair[] {
    return Array.from(this.pairs.values())
      .map((pair) => ({ ...pair }))
      .sort((left, right) =>
        left.civAId === right.civAId
          ? left.civBId.localeCompare(right.civBId)
          : left.civAId.localeCompare(right.civAId),
      );
  }

  public getWarCountForCiv(civId: string): number {
    return this.getPairs().filter((pair) => pair.relation === 'war' && (pair.civAId === civId || pair.civBId === civId))
      .length;
  }

  public declareWar(civAId: string, civBId: string, currentTurn: number): DiplomacyResult {
    const validation = this.validatePair(civAId, civBId);
    if (validation) return validation;
    if (this.isAtWar(civAId, civBId)) {
      return { allowed: false, reason: 'Zwischen diesen Reichen besteht bereits Krieg.' };
    }

    const [first, second] = DiplomacyManager.ordered(civAId, civBId);
    this.pairs.set(DiplomacyManager.pairKey(first, second), {
      civAId: first,
      civBId: second,
      relation: 'war',
      sinceTurn: currentTurn,
    });
    this.eventBus.emit('diplomacy:war-declared', { civAId: first, civBId: second, turn: currentTurn });
    return { allowed: true };
  }

  public makePeace(civAId: string, civBId: string, currentTurn: number): DiplomacyResult {
    const validation = this.validatePair(civAId, civBId);
    if (validation) return validation;

    const pair = this.getPair(civAId, civBId);
    if (!pair || pair.relation !== 'war') {
      return { allowed: false, reason: 'Zwischen diesen Reichen besteht kein Krieg.' };
    }

    const warTurns = Math.max(0, currentTurn - pair.sinceTurn);
    if (warTurns < PEACE_MIN_WAR_TURNS) {
      return {
        allowed: false,
        reason: `Frieden ist erst nach ${PEACE_MIN_WAR_TURNS} Kriegsrunden möglich (${warTurns}/${PEACE_MIN_WAR_TURNS}).`,
      };
    }

    this.pairs.set(DiplomacyManager.pairKey(pair.civAId, pair.civBId), {
      civAId: pair.civAId,
      civBId: pair.civBId,
      relation: 'peace',
      sinceTurn: currentTurn,
    });
    this.eventBus.emit('diplomacy:peace-made', {
      civAId: pair.civAId,
      civBId: pair.civBId,
      turn: currentTurn,
      turnsAtWar: warTurns,
    });
    return { allowed: true };
  }

  public loadPairs(pairs: DiplomaticPair[]): void {
    this.pairs.clear();
    for (const candidate of pairs) {
      if (!candidate || candidate.civAId === candidate.civBId) continue;
      if (candidate.relation !== 'peace' && candidate.relation !== 'war') continue;
      const [first, second] = DiplomacyManager.ordered(candidate.civAId, candidate.civBId);
      this.pairs.set(DiplomacyManager.pairKey(first, second), {
        civAId: first,
        civBId: second,
        relation: candidate.relation,
        sinceTurn: Number.isFinite(candidate.sinceTurn) ? Math.max(0, Math.trunc(candidate.sinceTurn)) : 0,
      });
    }
  }

  /** Serialisierbare, sortierte Kopie für das Speicherformat. */
  public toSnapshot(): DiplomaticPair[] {
    return this.getPairs();
  }

  private validatePair(civAId: string, civBId: string): DiplomacyResult | null {
    if (!civAId || !civBId) {
      return { allowed: false, reason: 'Zivilisation nicht gefunden.' };
    }
    if (civAId === civBId) {
      return { allowed: false, reason: 'Eine Zivilisation kann sich nicht selbst den Krieg erklären.' };
    }
    if (this.knownCivIds.size > 0 && (!this.knownCivIds.has(civAId) || !this.knownCivIds.has(civBId))) {
      return { allowed: false, reason: 'Zivilisation nicht gefunden.' };
    }
    return null;
  }
}
