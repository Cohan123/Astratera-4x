/**
 * Astraea 4X - KI-Diplomatie (Phase 4)
 * Entscheidet vollständig deterministisch, wann KI-Reiche Krieg erklären und
 * wann sie Frieden schließen. Der Manager hält keinen eigenen Zustand: alle
 * Beziehungen liegen im DiplomacyManager, alle Kennzahlen kommen je Runde als
 * Snapshot herein. Dadurch bleiben Spielstände unverändert (kein Save-Bump)
 * und die Entscheidungen sind ohne Zufall reproduzierbar.
 *
 * Bewusste Grenzen:
 * - Die KI führt keine Invasionszüge aus (das bleibt Stage C). Sie schafft nur
 *   den Kriegszustand, damit Begegnungen verfeindeter Flotten kämpfen.
 * - Ein Reich führt höchstens einen Krieg gleichzeitig, und ein Ziel hat
 *   höchstens einen Angreifer. Das verhindert, dass mehrere KI-Reiche den
 *   Spieler in derselben Runde überfallen.
 */

import { DiplomacyManager } from './diplomacyManager.ts';

/** Früheste Runde, in der eine KI überhaupt Krieg erklären darf. */
export const AI_DIPLOMACY_GRACE_TURNS = 12;
/** Abstand zwischen zwei Kriegsprüfungen (Runde 12, 16, 20, ...). */
export const AI_WAR_CHECK_INTERVAL = 4;
/** Höchstzahl gleichzeitiger Kriege je Angreifer und je Ziel. */
export const AI_MAX_WARS_PER_CIV = 1;
/** Mindestdauer eines KI-Kriegs, bevor Frieden geschlossen werden darf. */
export const AI_PEACE_MIN_WAR_TURNS = 6;
/** Sperre nach einem Frieden, bevor dasselbe Paar erneut Krieg führen darf. */
export const AI_PEACE_COOLDOWN_TURNS = 10;
/** Ab dieser Kriegsdauer schließt die KI auch gegen einen stärkeren Gegner Frieden. */
export const AI_MAX_WAR_TURNS = 18;
/** Mindestüberlegenheit, damit eine KI ein Ziel angreift. */
export const AI_WAR_STRENGTH_RATIO = 1.2;
/** Absolute Mindeststärke, damit eine KI überhaupt Krieg erklärt. */
export const AI_MIN_MILITARY_STRENGTH = 80;

/** Kennzahlen eines Reichs, die die KI-Diplomatie je Runde bewertet. */
export interface AiDiplomacyCivSnapshot {
  id: string;
  isPlayer: boolean;
  colonyCount: number;
  /** Summe aus Angriff und Hülle aller Flotten des Reichs, gerundet. */
  militaryStrength: number;
}

export interface AiDiplomacyWarDeclaration {
  civId: string;
  targetCivId: string;
}

export interface AiDiplomacyPeaceTreaty {
  civId: string;
  targetCivId: string;
}

export interface AiDiplomacyTurnResult {
  declaredWars: AiDiplomacyWarDeclaration[];
  peaceTreaties: AiDiplomacyPeaceTreaty[];
}

export class AiDiplomacyManager {
  constructor(private readonly diplomacy: DiplomacyManager) {}

  /**
   * Führt die diplomatischen KI-Entscheidungen für eine Runde aus.
   * Frieden wird zuerst geprüft (auch außerhalb der Kriegsprüftage), danach
   * folgen Kriegserklärungen ausschließlich an Prüftagen.
   */
  public executeTurn(
    currentTurn: number,
    civs: AiDiplomacyCivSnapshot[],
  ): AiDiplomacyTurnResult {
    const result: AiDiplomacyTurnResult = { declaredWars: [], peaceTreaties: [] };
    const snapshotById = new Map(civs.map((civ) => [civ.id, civ] as const));
    const settledPairs = new Set<string>();

    this.evaluatePeace(currentTurn, snapshotById, settledPairs, result);
    if (AiDiplomacyManager.isWarCheckTurn(currentTurn)) {
      this.evaluateWarDeclarations(currentTurn, civs, snapshotById, settledPairs, result);
    }

    return result;
  }

  /** Kriegsprüfungen liegen genau auf Runde 12, 16, 20, ... */
  public static isWarCheckTurn(currentTurn: number): boolean {
    if (currentTurn < AI_DIPLOMACY_GRACE_TURNS) {
      return false;
    }
    return (currentTurn - AI_DIPLOMACY_GRACE_TURNS) % AI_WAR_CHECK_INTERVAL === 0;
  }

  private evaluatePeace(
    currentTurn: number,
    snapshotById: Map<string, AiDiplomacyCivSnapshot>,
    settledPairs: Set<string>,
    result: AiDiplomacyTurnResult,
  ): void {
    for (const pair of this.diplomacy.getPairs()) {
      if (pair.relation !== 'war') {
        continue;
      }
      const key = AiDiplomacyManager.pairKey(pair.civAId, pair.civBId);
      if (settledPairs.has(key)) {
        continue;
      }

      const warTurns = currentTurn - pair.sinceTurn;
      if (warTurns < AI_PEACE_MIN_WAR_TURNS) {
        continue;
      }

      const civA = snapshotById.get(pair.civAId);
      const civB = snapshotById.get(pair.civBId);
      if (!civA || !civB) {
        continue;
      }

      let suer: AiDiplomacyCivSnapshot | null = null;
      if (warTurns >= AI_MAX_WAR_TURNS) {
        // Kriegsmüdigkeit: unabhängig von der Stärke beendet die KI den Krieg.
        suer = !civA.isPlayer ? civA : !civB.isPlayer ? civB : null;
      } else {
        // Vor der Höchstdauer bittet nur die schwächere Seite um Frieden.
        const weaker = AiDiplomacyManager.weakerOf(civA, civB);
        if (!weaker.isPlayer) {
          suer = weaker;
        }
      }
      if (!suer) {
        continue;
      }

      const opponentId = suer.id === civA.id ? civB.id : civA.id;
      const outcome = this.diplomacy.makePeace(suer.id, opponentId, currentTurn);
      if (!outcome.allowed) {
        continue;
      }

      settledPairs.add(key);
      result.peaceTreaties.push({ civId: suer.id, targetCivId: opponentId });
    }
  }

  private evaluateWarDeclarations(
    currentTurn: number,
    civs: AiDiplomacyCivSnapshot[],
    snapshotById: Map<string, AiDiplomacyCivSnapshot>,
    settledPairs: Set<string>,
    result: AiDiplomacyTurnResult,
  ): void {
    const orderedCivs = [...civs].sort((left, right) =>
      AiDiplomacyManager.compareIds(left.id, right.id),
    );

    for (const initiator of orderedCivs) {
      if (initiator.isPlayer || initiator.colonyCount <= 0) {
        continue;
      }
      if (initiator.militaryStrength < AI_MIN_MILITARY_STRENGTH) {
        continue;
      }
      if (this.diplomacy.getWarCountForCiv(initiator.id) >= AI_MAX_WARS_PER_CIV) {
        continue;
      }

      const target = this.selectTarget(currentTurn, initiator, orderedCivs, settledPairs);
      if (!target) {
        continue;
      }

      const outcome = this.diplomacy.declareWar(initiator.id, target.id, currentTurn);
      if (!outcome.allowed) {
        continue;
      }

      settledPairs.add(AiDiplomacyManager.pairKey(initiator.id, target.id));
      result.declaredWars.push({ civId: initiator.id, targetCivId: target.id });
      // Höchstens eine Kriegserklärung je Reich und Runde.
      break;
    }
  }

  /**
   * Wählt das schwächste zulässige Ziel. Bei gleicher Stärke entscheidet die
   * lexikografisch kleinere ID, damit die Auswahl reproduzierbar bleibt.
   */
  private selectTarget(
    currentTurn: number,
    initiator: AiDiplomacyCivSnapshot,
    civs: AiDiplomacyCivSnapshot[],
    settledPairs: Set<string>,
  ): AiDiplomacyCivSnapshot | null {
    let best: AiDiplomacyCivSnapshot | null = null;

    for (const candidate of civs) {
      if (candidate.id === initiator.id || candidate.colonyCount <= 0) {
        continue;
      }
      if (settledPairs.has(AiDiplomacyManager.pairKey(initiator.id, candidate.id))) {
        continue;
      }
      if (this.diplomacy.isAtWar(initiator.id, candidate.id)) {
        continue;
      }
      if (this.diplomacy.getWarCountForCiv(candidate.id) >= AI_MAX_WARS_PER_CIV) {
        continue;
      }

      const pair = this.diplomacy.getPair(initiator.id, candidate.id);
      if (!pair) {
        continue;
      }
      if (currentTurn - pair.sinceTurn < AI_PEACE_COOLDOWN_TURNS) {
        continue;
      }

      const requiredStrength = Math.max(
        AI_MIN_MILITARY_STRENGTH,
        candidate.militaryStrength * AI_WAR_STRENGTH_RATIO,
      );
      if (initiator.militaryStrength < requiredStrength) {
        continue;
      }

      if (
        !best ||
        candidate.militaryStrength < best.militaryStrength ||
        (candidate.militaryStrength === best.militaryStrength &&
          AiDiplomacyManager.compareIds(candidate.id, best.id) < 0)
      ) {
        best = candidate;
      }
    }

    return best;
  }

  private static weakerOf(
    civA: AiDiplomacyCivSnapshot,
    civB: AiDiplomacyCivSnapshot,
  ): AiDiplomacyCivSnapshot {
    if (civA.militaryStrength !== civB.militaryStrength) {
      return civA.militaryStrength < civB.militaryStrength ? civA : civB;
    }
    return AiDiplomacyManager.compareIds(civA.id, civB.id) <= 0 ? civA : civB;
  }

  private static compareIds(left: string, right: string): number {
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  }

  private static pairKey(civAId: string, civBId: string): string {
    return AiDiplomacyManager.compareIds(civAId, civBId) <= 0
      ? `${civAId}|${civBId}`
      : `${civBId}|${civAId}`;
  }
}
