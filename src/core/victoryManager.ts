/**
 * Astraea 4X - Sieg, Niederlage und Punktewertung
 *
 * Schließt die Partie ab: Drei Siegbedingungen (Dominanz, Transzendenz,
 * Chronik) und eine Niederlage (Verlust der letzten Kolonie) werden rein aus
 * dem Spielzustand abgeleitet. Es gibt kein paralleles Punkte- oder
 * Fortschrittssystem – alle Kennzahlen stammen aus Kolonien, Bevölkerung,
 * Technologien, Flotten, Staatskasse und der narrativen Ebene.
 *
 * Der Ausgang wird nach dem ersten Sieg oder Niederlage eingefroren und mit
 * dem Spielstand gespeichert, damit ein geladener Endstand nicht erneut
 * ausgewertet wird.
 */

import { TECHNOLOGY_CATALOG } from '../data/technologyCatalog.ts';
import {
  CrisisOutcome,
  CrisisStage,
  GameOutcome,
  VictoryCondition,
  VictoryRankEntry,
  VictoryScorePart,
} from './types.ts';

/** Anteil der besiedelten Systeme, den ein Reich für Dominanz halten muss. */
export const VICTORY_DOMINATION_SHARE = 0.6;
/** Mindestzahl eigener Kolonien, damit Dominanz nicht in Mini-Galaxien auslöst. */
export const VICTORY_DOMINATION_COLONIES = 8;
/** Anzahl abgeschlossener Tier-4-Technologien für die Transzendenz. */
export const VICTORY_SCIENCE_TIER4_TARGET = 3;
/** Anzahl abgeschlossener Ausgrabungen für die Chronik. */
export const VICTORY_NARRATIVE_EXCAVATIONS = 3;

export const SCORE_PER_COLONY = 50;
export const SCORE_PER_1000_POPULATION = 1;
export const SCORE_PER_TECHNOLOGY = 10;
export const SCORE_PER_FLEET_POINTS = 1;
export const SCORE_FLEET_POINTS_PER_SCORE = 10;
export const SCORE_PER_100_CREDITS = 1;
export const SCORE_PER_EXCAVATION = 25;
export const SCORE_CRISIS_CONTAINED = 75;

export const VICTORY_CONDITION_NAMES: Record<VictoryCondition, string> = {
  domination: 'Dominanz',
  science: 'Transzendenz',
  narrative: 'Chronik',
  elimination: 'Auslöschung',
};

export const VICTORY_CONDITION_DESCRIPTIONS: Record<VictoryCondition, string> = {
  domination:
    'Kontrolliere mindestens 60 % aller besiedelten Systeme und besitze selbst acht Kolonien.',
  science:
    'Vervollständige drei Technologien der höchsten Stufe und vollende damit den Forschungsbaum.',
  narrative:
    'Schließe drei Ausgrabungen ab und dämme die galaktische Krise ein.',
  elimination: 'Dein Reich hat seine letzte Kolonie verloren.',
};

/** Kennzahlen eines Reiches, aus denen Sieg, Niederlage und Punkte folgen. */
export interface VictoryCivSnapshot {
  civId: string;
  civName: string;
  isPlayer: boolean;
  /** Anzahl der Kolonien (nicht zwingend eindeutige Systeme). */
  colonyCount: number;
  /** Systeme mit mindestens einer eigenen Kolonie. */
  settledSystemCount: number;
  population: number;
  completedTechIds: string[];
  treasury: number;
  /** Summe aus Hülle, Angriff und Verteidigung aller eigenen Flotten. */
  fleetStrength: number;
  completedExcavations: number;
  crisisStage: CrisisStage;
  crisisOutcome: CrisisOutcome;
}

export interface VictorySnapshot {
  currentTurn: number;
  /** Systeme in der Galaxie, in denen irgendein Reich eine Kolonie besitzt. */
  totalSettledSystems: number;
  civs: VictoryCivSnapshot[];
}

/** Fortschritt einer Siegbedingung für die Zielanzeige. */
export interface VictoryObjectiveView {
  id: Exclude<VictoryCondition, 'elimination'>;
  name: string;
  description: string;
  /** 0..1, bereits auf das Ziel bezogen und gedeckelt. */
  progress: number;
  currentLabel: string;
  targetLabel: string;
  completed: boolean;
}

export interface VictoryOverview {
  outcome: GameOutcome;
  /** Aktuelle Runde der Partie (nicht der Abschlussrunde). */
  currentTurn: number;
  score: number;
  breakdown: VictoryScorePart[];
  ranking: VictoryRankEntry[];
  objectives: VictoryObjectiveView[];
  playerColonyCount: number;
  totalSettledSystems: number;
  peakColonyCount: number;
}

const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

const CRISIS_STAGE_LABELS: Record<CrisisStage, string> = {
  dormant: 'ruht',
  signal: 'Signal',
  awakening: 'Erwachen',
  resolution: 'Zuspitzung',
  resolved: 'aufgelöst',
};

const crisisLabel = (civ: VictoryCivSnapshot): string => {
  if (civ.crisisStage === 'resolved') {
    if (civ.crisisOutcome === 'contained') return 'eingedämmt';
    if (civ.crisisOutcome === 'embraced') return 'angenommen';
    return 'ignoriert';
  }
  return CRISIS_STAGE_LABELS[civ.crisisStage] ?? 'ruht';
};

const countTier4Technologies = (completedTechIds: string[]): number =>
  completedTechIds.filter((techId) => TECHNOLOGY_CATALOG[techId]?.tier === 4).length;

/** Punkteposten eines Reiches. Die Reihenfolge ist stabil für UI und Tests. */
export const buildScoreBreakdown = (civ: VictoryCivSnapshot): VictoryScorePart[] => {
  const parts: VictoryScorePart[] = [
    {
      id: 'colonies',
      label: 'Kolonien (je 50)',
      points: civ.colonyCount * SCORE_PER_COLONY,
    },
    {
      id: 'population',
      label: 'Bevölkerung (je 1.000)',
      points: Math.floor(Math.max(0, civ.population) / 1000) * SCORE_PER_1000_POPULATION,
    },
    {
      id: 'technology',
      label: 'Technologien (je 10)',
      points: civ.completedTechIds.length * SCORE_PER_TECHNOLOGY,
    },
    {
      id: 'fleets',
      label: 'Flottenstärke (je 10)',
      points:
        Math.floor(Math.max(0, civ.fleetStrength) / SCORE_FLEET_POINTS_PER_SCORE) *
        SCORE_PER_FLEET_POINTS,
    },
    {
      id: 'treasury',
      label: 'Staatskasse (je 100 ◈)',
      points: Math.floor(Math.max(0, civ.treasury) / 100) * SCORE_PER_100_CREDITS,
    },
  ];

  if (civ.completedExcavations > 0) {
    parts.push({
      id: 'excavations',
      label: 'Ausgrabungen (je 25)',
      points: civ.completedExcavations * SCORE_PER_EXCAVATION,
    });
  }
  if (civ.crisisOutcome === 'contained') {
    parts.push({
      id: 'crisis',
      label: 'Krise eingedämmt',
      points: SCORE_CRISIS_CONTAINED,
    });
  }

  return parts;
};

const totalScore = (parts: VictoryScorePart[]): number =>
  parts.reduce((sum, part) => sum + part.points, 0);

/** Rangliste: Punkte, dann Kolonien, dann stabile ID als Tiebreaker. */
export const buildRanking = (snapshot: VictorySnapshot): VictoryRankEntry[] =>
  snapshot.civs
    .map((civ) => ({
      civId: civ.civId,
      civName: civ.civName,
      isPlayer: civ.isPlayer,
      score: totalScore(buildScoreBreakdown(civ)),
      colonies: civ.colonyCount,
      population: civ.population,
      technologies: civ.completedTechIds.length,
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.colonies - left.colonies ||
        right.technologies - left.technologies ||
        left.civId.localeCompare(right.civId)
    );

export const createOngoingOutcome = (peakColonyCount = 0): GameOutcome => ({
  status: 'ongoing',
  condition: null,
  turn: null,
  score: 0,
  breakdown: [],
  peakColonyCount: Math.max(0, Math.floor(peakColonyCount)),
  ranking: [],
});

const isOutcomeStatus = (value: unknown): value is GameOutcome['status'] =>
  value === 'ongoing' || value === 'victory' || value === 'defeat';

const isVictoryCondition = (value: unknown): value is VictoryCondition =>
  value === 'domination' ||
  value === 'science' ||
  value === 'narrative' ||
  value === 'elimination';

const sanitizeScoreParts = (parts: unknown): VictoryScorePart[] => {
  if (!Array.isArray(parts)) return [];
  return parts
    .filter(
      (part): part is VictoryScorePart =>
        Boolean(part) &&
        typeof part.id === 'string' &&
        typeof part.label === 'string' &&
        Number.isFinite(part.points)
    )
    .map((part) => ({ id: part.id, label: part.label, points: Math.round(part.points) }));
};

const sanitizeRanking = (entries: unknown): VictoryRankEntry[] => {
  if (!Array.isArray(entries)) return [];
  return entries
    .filter(
      (entry): entry is VictoryRankEntry =>
        Boolean(entry) &&
        typeof entry.civId === 'string' &&
        typeof entry.civName === 'string' &&
        typeof entry.isPlayer === 'boolean' &&
        Number.isFinite(entry.score)
    )
    .map((entry) => ({
      civId: entry.civId,
      civName: entry.civName,
      isPlayer: entry.isPlayer,
      score: Math.round(entry.score),
      colonies: Math.max(0, Math.floor(Number(entry.colonies) || 0)),
      population: Math.max(0, Math.floor(Number(entry.population) || 0)),
      technologies: Math.max(0, Math.floor(Number(entry.technologies) || 0)),
    }));
};

const cloneOutcome = (outcome: GameOutcome): GameOutcome => ({
  status: outcome.status,
  condition: outcome.condition,
  turn: outcome.turn,
  score: outcome.score,
  breakdown: outcome.breakdown.map((part) => ({ ...part })),
  peakColonyCount: outcome.peakColonyCount,
  ranking: outcome.ranking.map((entry) => ({ ...entry })),
});

export class VictoryManager {
  private outcome: GameOutcome = createOngoingOutcome();

  public reset(): void {
    this.outcome = createOngoingOutcome();
  }

  public getOutcome(): GameOutcome {
    return cloneOutcome(this.outcome);
  }

  /**
   * Lädt einen gespeicherten Ausgang. Fehlt er (ältere Spielstände), bleibt die
   * Partie offen; die aktuelle Koloniezahl dient als bisheriger Höchststand,
   * damit ein bereits entvölkertes Reich die Niederlage nicht verliert.
   */
  public loadOutcome(outcome: GameOutcome | undefined | null, currentColonyCount = 0): void {
    if (!outcome || !isOutcomeStatus(outcome.status)) {
      this.outcome = createOngoingOutcome(currentColonyCount);
      return;
    }

    const condition = isVictoryCondition(outcome.condition) ? outcome.condition : null;
    const status = outcome.status;
    const finished = status !== 'ongoing' && condition !== null;

    if (status !== 'ongoing' && !finished) {
      this.outcome = createOngoingOutcome(
        Math.max(currentColonyCount, Number(outcome.peakColonyCount) || 0)
      );
      return;
    }

    this.outcome = {
      status,
      condition: finished ? condition : null,
      turn:
        finished && Number.isFinite(outcome.turn as number)
          ? Math.max(1, Math.floor(outcome.turn as number))
          : null,
      score: finished ? Math.max(0, Math.round(Number(outcome.score) || 0)) : 0,
      breakdown: finished ? sanitizeScoreParts(outcome.breakdown) : [],
      peakColonyCount: Math.max(
        currentColonyCount,
        Math.floor(Number(outcome.peakColonyCount) || 0)
      ),
      ranking: finished ? sanitizeRanking(outcome.ranking) : [],
    };
  }

  /**
   * Wertet die Partie aus. Ein bereits abgeschlossener Ausgang bleibt
   * unverändert; nur der Höchststand eigener Kolonien wird weitergeführt.
   */
  public evaluate(snapshot: VictorySnapshot): GameOutcome {
    const player = snapshot.civs.find((civ) => civ.isPlayer);
    if (!player) return this.getOutcome();

    const peak = Math.max(this.outcome.peakColonyCount, player.colonyCount);
    if (this.outcome.status !== 'ongoing') {
      this.outcome = { ...this.outcome, peakColonyCount: peak };
      return this.getOutcome();
    }

    const ranking = buildRanking(snapshot);
    const breakdown = buildScoreBreakdown(player);
    const score = totalScore(breakdown);

    if (peak > 0 && player.colonyCount === 0) {
      return this.finish('defeat', 'elimination', snapshot, score, breakdown, ranking, peak);
    }

    if (this.hasDomination(snapshot, player)) {
      return this.finish('victory', 'domination', snapshot, score, breakdown, ranking, peak);
    }

    if (countTier4Technologies(player.completedTechIds) >= VICTORY_SCIENCE_TIER4_TARGET) {
      return this.finish('victory', 'science', snapshot, score, breakdown, ranking, peak);
    }

    if (
      player.completedExcavations >= VICTORY_NARRATIVE_EXCAVATIONS &&
      player.crisisOutcome === 'contained'
    ) {
      return this.finish('victory', 'narrative', snapshot, score, breakdown, ranking, peak);
    }

    this.outcome = {
      ...createOngoingOutcome(peak),
      score,
      breakdown,
      ranking,
    };
    return this.getOutcome();
  }

  /** Fortschritt und Rangliste ohne Zustandsänderung, für die Zielanzeige. */
  public getOverview(snapshot: VictorySnapshot): VictoryOverview | null {
    const player = snapshot.civs.find((civ) => civ.isPlayer);
    if (!player) return null;

    const breakdown = buildScoreBreakdown(player);
    const peak = Math.max(this.outcome.peakColonyCount, player.colonyCount);
    return {
      outcome: this.getOutcome(),
      currentTurn: snapshot.currentTurn,
      score: totalScore(breakdown),
      breakdown,
      ranking: buildRanking(snapshot),
      objectives: this.buildObjectives(snapshot, player),
      playerColonyCount: player.colonyCount,
      totalSettledSystems: snapshot.totalSettledSystems,
      peakColonyCount: peak,
    };
  }

  private finish(
    status: 'victory' | 'defeat',
    condition: VictoryCondition,
    snapshot: VictorySnapshot,
    score: number,
    breakdown: VictoryScorePart[],
    ranking: VictoryRankEntry[],
    peak: number
  ): GameOutcome {
    this.outcome = {
      status,
      condition,
      turn: snapshot.currentTurn,
      score,
      breakdown,
      peakColonyCount: peak,
      ranking,
    };
    return this.getOutcome();
  }

  private hasDomination(snapshot: VictorySnapshot, player: VictoryCivSnapshot): boolean {
    if (player.colonyCount < VICTORY_DOMINATION_COLONIES) return false;
    if (snapshot.totalSettledSystems <= 0) return false;
    return player.settledSystemCount / snapshot.totalSettledSystems >= VICTORY_DOMINATION_SHARE;
  }

  private buildObjectives(
    snapshot: VictorySnapshot,
    player: VictoryCivSnapshot
  ): VictoryObjectiveView[] {
    const settled = Math.max(1, snapshot.totalSettledSystems);
    const share = player.settledSystemCount / settled;
    const dominationProgress = Math.min(
      clamp01(player.colonyCount / VICTORY_DOMINATION_COLONIES),
      clamp01(share / VICTORY_DOMINATION_SHARE)
    );

    const tier4 = countTier4Technologies(player.completedTechIds);
    const excavationProgress = clamp01(
      player.completedExcavations / VICTORY_NARRATIVE_EXCAVATIONS
    );
    const contained = player.crisisOutcome === 'contained';

    return [
      {
        id: 'domination',
        name: VICTORY_CONDITION_NAMES.domination,
        description: VICTORY_CONDITION_DESCRIPTIONS.domination,
        progress: dominationProgress,
        currentLabel: `${player.colonyCount} / ${VICTORY_DOMINATION_COLONIES} Kolonien · ${Math.round(
          share * 100
        )} % der besiedelten Systeme`,
        targetLabel: `${Math.round(VICTORY_DOMINATION_SHARE * 100)} % und ${VICTORY_DOMINATION_COLONIES} Kolonien`,
        completed: this.hasDomination(snapshot, player),
      },
      {
        id: 'science',
        name: VICTORY_CONDITION_NAMES.science,
        description: VICTORY_CONDITION_DESCRIPTIONS.science,
        progress: clamp01(tier4 / VICTORY_SCIENCE_TIER4_TARGET),
        currentLabel: `${tier4} / ${VICTORY_SCIENCE_TIER4_TARGET} Tier-4-Technologien`,
        targetLabel: `${VICTORY_SCIENCE_TIER4_TARGET} Tier-4-Technologien`,
        completed: tier4 >= VICTORY_SCIENCE_TIER4_TARGET,
      },
      {
        id: 'narrative',
        name: VICTORY_CONDITION_NAMES.narrative,
        description: VICTORY_CONDITION_DESCRIPTIONS.narrative,
        progress: clamp01(excavationProgress * 0.5 + (contained ? 0.5 : 0)),
        currentLabel: `${player.completedExcavations} / ${VICTORY_NARRATIVE_EXCAVATIONS} Ausgrabungen · Krise: ${crisisLabel(player)}`,
        targetLabel: `${VICTORY_NARRATIVE_EXCAVATIONS} Ausgrabungen und Krise eingedämmt`,
        completed: player.completedExcavations >= VICTORY_NARRATIVE_EXCAVATIONS && contained,
      },
    ];
  }
}
