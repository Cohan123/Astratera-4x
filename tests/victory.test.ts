/**
 * Astraea 4X - Phase 6.1: Sieg, Niederlage und Punktewertung
 *
 * Prüft die drei Siegbedingungen (Dominanz, Transzendenz, Chronik), die
 * Niederlage bei Verlust der letzten Kolonie, das Einfrieren des Ausgangs,
 * Punkte und Rangliste, den Fortschritt für die Zielanzeige sowie
 * Speichern/Laden inklusive älterer Spielstände ohne Ausgang.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/EventBus.ts';
import { GameEngine } from '../src/core/GameEngine.ts';
import {
  SCORE_CRISIS_CONTAINED,
  SCORE_PER_COLONY,
  SCORE_PER_EXCAVATION,
  SCORE_PER_TECHNOLOGY,
  VICTORY_DOMINATION_COLONIES,
  VICTORY_NARRATIVE_EXCAVATIONS,
  VICTORY_SCIENCE_TIER4_TARGET,
  VictoryCivSnapshot,
  VictoryManager,
  VictorySnapshot,
  buildRanking,
  buildScoreBreakdown,
  createOngoingOutcome,
} from '../src/core/victoryManager.ts';
import type { Colony, GameOutcome, Planet } from '../src/core/types.ts';

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) {
    cleanups.pop()!();
  }
  EventBus.getInstance().clear();
});

function civ(overrides: Partial<VictoryCivSnapshot> = {}): VictoryCivSnapshot {
  return {
    civId: 'player-empire',
    civName: 'Vereinte Solare Konföderation',
    isPlayer: true,
    colonyCount: 1,
    settledSystemCount: 1,
    population: 3_000,
    completedTechIds: [],
    treasury: 500,
    fleetStrength: 0,
    completedExcavations: 0,
    crisisStage: 'dormant',
    crisisOutcome: null,
    ...overrides,
  };
}

function aiCiv(overrides: Partial<VictoryCivSnapshot> = {}): VictoryCivSnapshot {
  return civ({
    civId: 'orion-combine',
    civName: 'Orion-Bergbau-Konsortium',
    isPlayer: false,
    ...overrides,
  });
}

function snapshot(
  player: VictoryCivSnapshot,
  options: { ai?: VictoryCivSnapshot[]; currentTurn?: number } = {}
): VictorySnapshot {
  const ai = options.ai ?? [aiCiv(), aiCiv({ civId: 'kepler-ascendancy', civName: 'Kepler-Ascendanz' })];
  const civs = [player, ...ai];
  const settled = new Set<number>();
  civs.forEach((entry, index) => {
    // Jede Kolonie eines Reiches liegt in einem eigenen, fortlaufenden System.
    for (let offset = 0; offset < entry.settledSystemCount; offset += 1) {
      settled.add(index * 100 + offset);
    }
  });

  return {
    currentTurn: options.currentTurn ?? 20,
    totalSettledSystems: settled.size,
    civs,
  };
}

function makeHabitable(planet: Planet): void {
  planet.planetType = 'ocean';
  planet.surveyStatus = 'analyzed';
  planet.radiationHazard = 'negligible';
  planet.colonizationStatus = 'uncolonized';
  planet.colonyId = null;
  planet.surfaceTemperatureK = 292;
  planet.temperatureCategory = 'temperate';
  planet.atmosphere = 'breathable';
  planet.waterAvailability = 'liquid_ocean';
  planet.gravityG = 1;
  planet.gravityCategory = 'standard';
  planet.geologicalStability = 'stable';
  planet.habitability = 90;
  planet.habitabilityTier = 'ideal';
}

function newEngine(seed = 'victory-seed'): GameEngine {
  const engine = GameEngine.getInstance();
  engine.generateNewGalaxy({
    seed,
    size: 'small',
    systemCount: 12,
    width: 600,
    height: 600,
    minDistance: 50,
  });
  return engine;
}

function foundPlayerColony(engine: GameEngine, seed = 'victory-seed'): Colony {
  newEngine(seed);
  const sys = engine.getGalaxy().systems[0];
  engine.selectSystem(sys.id);
  engine.surveySystem(sys.id);
  const planet = sys.planets.find((candidate) => candidate.planetType !== 'gas_giant') ?? sys.planets[0];
  makeHabitable(planet);
  const result = engine.foundColony(planet.id, 'Sieghafen');
  expect(result.success).toBe(true);
  return result.colony!;
}

describe('VictoryManager - Siegbedingungen', () => {
  it('bleibt ohne Zielerfüllung offen und berechnet Punkte', () => {
    const manager = new VictoryManager();
    const result = manager.evaluate(snapshot(civ()));

    expect(result.status).toBe('ongoing');
    expect(result.condition).toBeNull();
    expect(result.turn).toBeNull();
    expect(result.peakColonyCount).toBe(1);
    expect(result.score).toBe(
      SCORE_PER_COLONY + 3 + 0 + 0 + Math.floor(500 / 100)
    );
    expect(result.breakdown.length).toBeGreaterThan(0);
    expect(result.ranking).toHaveLength(3);
  });

  it('erkennt Dominanz erst mit acht Kolonien und 60 % der besiedelten Systeme', () => {
    const manager = new VictoryManager();
    const ai = [aiCiv(), aiCiv({ civId: 'kepler-ascendancy', civName: 'Kepler-Ascendanz' })];

    const tooFew = manager.evaluate(
      snapshot(civ({ colonyCount: VICTORY_DOMINATION_COLONIES - 1, settledSystemCount: 7 }), {
        ai,
      })
    );
    expect(tooFew.status).toBe('ongoing');

    const tooSmallShare = manager.evaluate(
      snapshot(civ({ colonyCount: VICTORY_DOMINATION_COLONIES, settledSystemCount: 8 }), {
        ai: [
          aiCiv({ colonyCount: 2, settledSystemCount: 2 }),
          aiCiv({ civId: 'kepler-ascendancy', civName: 'Kepler-Ascendanz', colonyCount: 2, settledSystemCount: 2 }),
          aiCiv({ civId: 'extra-civ', civName: 'Extra', colonyCount: 2, settledSystemCount: 2 }),
        ],
      })
    );
    expect(tooSmallShare.status).toBe('ongoing');

    const victory = manager.evaluate(
      snapshot(civ({ colonyCount: VICTORY_DOMINATION_COLONIES, settledSystemCount: 8 }), {
        ai,
        currentTurn: 44,
      })
    );
    expect(victory.status).toBe('victory');
    expect(victory.condition).toBe('domination');
    expect(victory.turn).toBe(44);
  });

  it('erkennt Transzendenz über drei Tier-4-Technologien', () => {
    const manager = new VictoryManager();

    const twoTier4 = manager.evaluate(
      snapshot(
        civ({
          completedTechIds: [
            'zero_point_physics',
            'genetic_adaptation',
            'geothermal_tapping',
            'advanced_metallurgy',
          ],
        })
      )
    );
    expect(twoTier4.status).toBe('ongoing');

    const both = new VictoryManager().evaluate(
      snapshot(
        civ({
          completedTechIds: [
            'zero_point_physics',
            'genetic_adaptation',
            'self_replicating_industry',
            'geothermal_tapping',
          ],
        })
      )
    );
    expect(both.status).toBe('victory');
    expect(both.condition).toBe('science');
    expect(VICTORY_SCIENCE_TIER4_TARGET).toBe(3);
  });

  it('erkennt die Chronik nur mit drei Ausgrabungen und eingedämmter Krise', () => {
    const manager = new VictoryManager();

    const ignored = manager.evaluate(
      snapshot(
        civ({
          completedExcavations: VICTORY_NARRATIVE_EXCAVATIONS,
          crisisStage: 'resolved',
          crisisOutcome: 'ignored',
        })
      )
    );
    expect(ignored.status).toBe('ongoing');

    const tooFewSites = new VictoryManager().evaluate(
      snapshot(
        civ({
          completedExcavations: VICTORY_NARRATIVE_EXCAVATIONS - 1,
          crisisStage: 'resolved',
          crisisOutcome: 'contained',
        })
      )
    );
    expect(tooFewSites.status).toBe('ongoing');

    const contained = new VictoryManager().evaluate(
      snapshot(
        civ({
          completedExcavations: VICTORY_NARRATIVE_EXCAVATIONS,
          crisisStage: 'resolved',
          crisisOutcome: 'contained',
        }),
        { currentTurn: 64 }
      )
    );
    expect(contained.status).toBe('victory');
    expect(contained.condition).toBe('narrative');
    expect(contained.turn).toBe(64);
  });

  it('verliert erst nach der ersten eigenen Kolonie', () => {
    const empty = new VictoryManager();
    expect(empty.evaluate(snapshot(civ({ colonyCount: 0, settledSystemCount: 0 }))).status).toBe(
      'ongoing'
    );

    const manager = new VictoryManager();
    manager.evaluate(snapshot(civ()));
    const defeat = manager.evaluate(
      snapshot(civ({ colonyCount: 0, settledSystemCount: 0 }), { currentTurn: 31 })
    );

    expect(defeat.status).toBe('defeat');
    expect(defeat.condition).toBe('elimination');
    expect(defeat.turn).toBe(31);
  });

  it('bevorzugt Dominanz, wenn mehrere Bedingungen gleichzeitig erfüllt sind', () => {
    const manager = new VictoryManager();
    const result = manager.evaluate(
      snapshot(
        civ({
          colonyCount: VICTORY_DOMINATION_COLONIES,
          settledSystemCount: 8,
          completedTechIds: [
            'zero_point_physics',
            'genetic_adaptation',
            'self_replicating_industry',
          ],
        })
      )
    );
    expect(result.condition).toBe('domination');
  });

  it('friert den Ausgang ein und führt nur den Kolonie-Höchststand weiter', () => {
    const manager = new VictoryManager();
    const first = manager.evaluate(
      snapshot(civ({ colonyCount: VICTORY_DOMINATION_COLONIES, settledSystemCount: 8 }), {
        currentTurn: 40,
      })
    );
    expect(first.status).toBe('victory');

    const later = manager.evaluate(
      snapshot(civ({ colonyCount: 2, settledSystemCount: 2 }), { currentTurn: 90 })
    );
    expect(later.status).toBe('victory');
    expect(later.condition).toBe('domination');
    expect(later.turn).toBe(40);
    expect(later.peakColonyCount).toBe(VICTORY_DOMINATION_COLONIES);
  });
});

describe('VictoryManager - Punkte, Rangliste und Fortschritt', () => {
  it('summiert die Punkteposten und sortiert die Rangliste deterministisch', () => {
    const player = civ({
      colonyCount: 4,
      settledSystemCount: 4,
      population: 12_500,
      completedTechIds: ['geothermal_tapping', 'advanced_metallurgy'],
      treasury: 1_240,
      fleetStrength: 96,
      completedExcavations: 2,
      crisisStage: 'resolved',
      crisisOutcome: 'contained',
    });
    const ai = aiCiv({ colonyCount: 1, population: 3_000, treasury: 300 });

    const parts = buildScoreBreakdown(player);
    expect(parts.map((part) => part.id)).toEqual([
      'colonies',
      'population',
      'technology',
      'fleets',
      'treasury',
      'excavations',
      'crisis',
    ]);
    expect(parts.find((part) => part.id === 'excavations')?.points).toBe(
      2 * SCORE_PER_EXCAVATION
    );
    expect(parts.find((part) => part.id === 'crisis')?.points).toBe(SCORE_CRISIS_CONTAINED);
    expect(parts.find((part) => part.id === 'technology')?.points).toBe(2 * SCORE_PER_TECHNOLOGY);

    const ranking = buildRanking(snapshot(player, { ai: [ai] }));
    expect(ranking[0].isPlayer).toBe(true);
    expect(ranking[0].score).toBe(parts.reduce((sum, part) => sum + part.points, 0));
    expect(ranking[1].civId).toBe('orion-combine');
  });

  it('liefert Fortschritt und Beschriftungen für die Zielanzeige', () => {
    const manager = new VictoryManager();
    const overview = manager.getOverview(
      snapshot(
        civ({
          colonyCount: 4,
          settledSystemCount: 4,
          completedExcavations: 3,
          crisisStage: 'resolution',
          crisisOutcome: null,
        })
      )
    );

    expect(overview).not.toBeNull();
    expect(overview!.objectives.map((objective) => objective.id)).toEqual([
      'domination',
      'science',
      'narrative',
    ]);

    const domination = overview!.objectives.find((objective) => objective.id === 'domination')!;
    expect(domination.currentLabel).toContain('4 / 8');
    expect(domination.progress).toBeCloseTo(0.5, 5);
    expect(domination.completed).toBe(false);

    const narrative = overview!.objectives.find((objective) => objective.id === 'narrative')!;
    expect(narrative.progress).toBeCloseTo(0.5, 5);
    expect(narrative.currentLabel).toContain('Krise: Zuspitzung');
    expect(narrative.completed).toBe(false);

    expect(overview!.ranking[0].isPlayer).toBe(true);
    expect(overview!.score).toBeGreaterThan(0);
  });
});

describe('VictoryManager - Speichern und Laden', () => {
  it('überlebt einen Speicher-/Ladezyklus der Engine', () => {
    const engine = newEngine('victory-save');
    const achieved: GameOutcome = {
      ...createOngoingOutcome(3),
      status: 'victory',
      condition: 'science',
      turn: 52,
      score: 321,
      breakdown: [{ id: 'colonies', label: 'Kolonien (je 50)', points: 250 }],
      ranking: [
        {
          civId: 'player-empire',
          civName: 'Vereinte Solare Konföderation',
          isPlayer: true,
          score: 321,
          colonies: 5,
          population: 9_000,
          technologies: 17,
        },
      ],
    };
    engine.getVictoryManager().loadOutcome(achieved);

    const payload = engine.createSavePayload('Endstand');
    expect(payload.outcome?.status).toBe('victory');

    const restored = newEngine('victory-save-other');
    expect(restored.restoreFromSaveData(payload)).toBe(true);

    const outcome = restored.getOutcome();
    expect(outcome.status).toBe('victory');
    expect(outcome.condition).toBe('science');
    expect(outcome.turn).toBe(52);
    expect(outcome.score).toBe(321);
    expect(outcome.breakdown[0].points).toBe(250);
    expect(outcome.ranking[0].civId).toBe('player-empire');
  });

  it('behandelt ältere Spielstände ohne Ausgang als offen', () => {
    const engine = newEngine('victory-legacy');
    const payload = engine.createSavePayload('Altstand');
    delete payload.outcome;

    expect(engine.restoreFromSaveData(payload)).toBe(true);
    expect(engine.getOutcome().status).toBe('ongoing');
    expect(engine.getOutcome().condition).toBeNull();
  });

  it('verwirft unbrauchbare Ausgänge aus beschädigten Spielständen', () => {
    const engine = newEngine('victory-invalid');
    engine.getVictoryManager().loadOutcome({
      status: 'victory',
      condition: 'unbekannt' as never,
      turn: 5,
      score: 10,
      breakdown: [],
      peakColonyCount: 2,
      ranking: [],
    });

    const outcome = engine.getOutcome();
    expect(outcome.status).toBe('ongoing');
    expect(outcome.condition).toBeNull();
    expect(outcome.peakColonyCount).toBe(2);
  });
});

describe('GameEngine - Integration', () => {
  it('wertet nach jedem Rundenwechsel aus, ohne den ersten Zug zu verändern', () => {
    const engine = newEngine('victory-turns');
    engine.endTurn();
    expect(engine.getOutcome().status).toBe('ongoing');
    expect(engine.getOutcome().score).toBeGreaterThanOrEqual(0);
    expect(engine.getTurnState().currentTurn).toBe(2);
  });

  it('erkennt die Niederlage, wenn die letzte Kolonie verloren geht', () => {
    const engine = GameEngine.getInstance();
    const colony = foundPlayerColony(engine, 'victory-defeat');
    const playerId = engine.getPlayerCiv().id;

    engine.endTurn();
    expect(engine.getOutcome().status).toBe('ongoing');

    // Nur die eigene Kolonie entfernen; die KI-Heimatwelten bleiben bestehen.
    const foreign = engine.getColonies().filter((entry) => entry.civId !== playerId);
    engine.getColonyManager().loadColonies(foreign);

    engine.endTurn();
    const outcome = engine.getOutcome();
    expect(outcome.status).toBe('defeat');
    expect(outcome.condition).toBe('elimination');
    expect(outcome.turn).toBe(2);
    expect(outcome.peakColonyCount).toBeGreaterThanOrEqual(1);
    expect(colony.civId).toBe(playerId);
  });

  it('liefert eine Zielübersicht mit allen Reichen', () => {
    const engine = newEngine('victory-overview');
    const overview = engine.getVictoryOverview();

    expect(overview).not.toBeNull();
    expect(overview!.outcome.status).toBe('ongoing');
    expect(overview!.objectives).toHaveLength(3);
    expect(overview!.ranking.length).toBe(engine.getCivManager().getCivilizations().length);
    expect(overview!.ranking.map((entry) => entry.civId)).toContain(engine.getPlayerCiv().id);
  });
});
