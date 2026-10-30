/**
 * Astraea 4X - KI-Diplomatie Test Suite (Phase 4)
 * Prüft die deterministischen Entscheidungen des AiDiplomacyManager:
 * Gnadenfrist und Prüftage, Mindeststärke und Überlegenheit, Zielwahl,
 * Kriegsobergrenzen, Friedensregeln inklusive Kriegsmüdigkeit, Cooldown,
 * Idempotenz und den Ausschluss toter Reiche.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  AI_DIPLOMACY_GRACE_TURNS,
  AI_MAX_WAR_TURNS,
  AI_MIN_MILITARY_STRENGTH,
  AI_PEACE_COOLDOWN_TURNS,
  AI_PEACE_MIN_WAR_TURNS,
  AI_WAR_CHECK_INTERVAL,
  AiDiplomacyCivSnapshot,
  AiDiplomacyManager,
} from '../src/core/aiDiplomacyManager.ts';
import { DiplomacyManager } from '../src/core/diplomacyManager.ts';
import { EventBus } from '../src/core/EventBus.ts';

const CIV_ALPHA = 'civ-alpha';
const CIV_BETA = 'civ-beta';
const CIV_CHARLIE = 'civ-charlie';
const CIV_DEAD = 'civ-dead';
const CIV_PLAYER = 'civ-player';

const bus = EventBus.getInstance();

function makeCiv(
  id: string,
  overrides: Partial<AiDiplomacyCivSnapshot> = {},
): AiDiplomacyCivSnapshot {
  return {
    id,
    isPlayer: false,
    colonyCount: 2,
    militaryStrength: 100,
    ...overrides,
  };
}

function makeSetup(civIds: string[]): {
  diplomacy: DiplomacyManager;
  ai: AiDiplomacyManager;
} {
  const diplomacy = new DiplomacyManager(bus);
  diplomacy.syncCivilizations(civIds);
  return { diplomacy, ai: new AiDiplomacyManager(diplomacy) };
}

describe('AiDiplomacyManager', () => {
  beforeEach(() => {
    bus.clear();
  });

  it('erklärt vor Ablauf der Gnadenfrist keinen Krieg', () => {
    const { diplomacy, ai } = makeSetup([CIV_ALPHA, CIV_PLAYER]);
    const civs = [makeCiv(CIV_ALPHA, { militaryStrength: 500 }), makeCiv(CIV_PLAYER, { isPlayer: true, militaryStrength: 0 })];

    const result = ai.executeTurn(AI_DIPLOMACY_GRACE_TURNS - 1, civs);

    expect(result.declaredWars).toEqual([]);
    expect(diplomacy.getWarCountForCiv(CIV_ALPHA)).toBe(0);
  });

  it('erklärt in Runde 12 genau einen Krieg gegen das schwächste Ziel', () => {
    const { diplomacy, ai } = makeSetup([CIV_ALPHA, CIV_BETA, CIV_PLAYER]);
    const civs = [
      makeCiv(CIV_ALPHA, { militaryStrength: 200 }),
      makeCiv(CIV_BETA, { militaryStrength: 150 }),
      makeCiv(CIV_PLAYER, { isPlayer: true, militaryStrength: 50 }),
    ];

    const result = ai.executeTurn(AI_DIPLOMACY_GRACE_TURNS, civs);

    expect(result.declaredWars).toEqual([
      { civId: CIV_ALPHA, targetCivId: CIV_PLAYER },
    ]);
    expect(diplomacy.getWarCountForCiv(CIV_ALPHA)).toBe(1);
    expect(diplomacy.getWarCountForCiv(CIV_BETA)).toBe(0);
    expect(diplomacy.getWarCountForCiv(CIV_PLAYER)).toBe(1);
  });

  it('respektiert die absolute Mindeststärke', () => {
    const tooWeak = makeSetup([CIV_ALPHA, CIV_PLAYER]);
    const weakResult = tooWeak.ai.executeTurn(AI_DIPLOMACY_GRACE_TURNS, [
      makeCiv(CIV_ALPHA, { militaryStrength: AI_MIN_MILITARY_STRENGTH - 1 }),
      makeCiv(CIV_PLAYER, { isPlayer: true, militaryStrength: 0 }),
    ]);
    expect(weakResult.declaredWars).toEqual([]);

    const strongEnough = makeSetup([CIV_ALPHA, CIV_PLAYER]);
    const strongResult = strongEnough.ai.executeTurn(AI_DIPLOMACY_GRACE_TURNS, [
      makeCiv(CIV_ALPHA, { militaryStrength: AI_MIN_MILITARY_STRENGTH }),
      makeCiv(CIV_PLAYER, { isPlayer: true, militaryStrength: 0 }),
    ]);
    expect(strongResult.declaredWars).toEqual([
      { civId: CIV_ALPHA, targetCivId: CIV_PLAYER },
    ]);
  });

  it('verlangt mindestens 20 Prozent Überlegenheit', () => {
    const even = makeSetup([CIV_ALPHA, CIV_BETA]);
    const evenResult = even.ai.executeTurn(AI_DIPLOMACY_GRACE_TURNS, [
      makeCiv(CIV_ALPHA, { militaryStrength: 100 }),
      makeCiv(CIV_BETA, { militaryStrength: 90 }),
    ]);
    expect(evenResult.declaredWars).toEqual([]);

    const superior = makeSetup([CIV_ALPHA, CIV_BETA]);
    const superiorResult = superior.ai.executeTurn(AI_DIPLOMACY_GRACE_TURNS, [
      makeCiv(CIV_ALPHA, { militaryStrength: 120 }),
      makeCiv(CIV_BETA, { militaryStrength: 90 }),
    ]);
    expect(superiorResult.declaredWars).toEqual([
      { civId: CIV_ALPHA, targetCivId: CIV_BETA },
    ]);
  });

  it('prüft Krieg nur an den vorgesehenen Prüftagen', () => {
    const offDay = makeSetup([CIV_ALPHA, CIV_BETA]);
    const offResult = offDay.ai.executeTurn(AI_DIPLOMACY_GRACE_TURNS + 1, [
      makeCiv(CIV_ALPHA, { militaryStrength: 200 }),
      makeCiv(CIV_BETA, { militaryStrength: 100 }),
    ]);
    expect(offResult.declaredWars).toEqual([]);

    const checkDay = makeSetup([CIV_ALPHA, CIV_BETA]);
    const checkResult = checkDay.ai.executeTurn(
      AI_DIPLOMACY_GRACE_TURNS + AI_WAR_CHECK_INTERVAL,
      [
        makeCiv(CIV_ALPHA, { militaryStrength: 200 }),
        makeCiv(CIV_BETA, { militaryStrength: 100 }),
      ],
    );
    expect(checkResult.declaredWars).toEqual([
      { civId: CIV_ALPHA, targetCivId: CIV_BETA },
    ]);
  });

  it('schwächere KI schließt nach sechs Kriegsrunden Frieden', () => {
    const { diplomacy, ai } = makeSetup([CIV_ALPHA, CIV_BETA]);
    diplomacy.declareWar(CIV_ALPHA, CIV_BETA, AI_DIPLOMACY_GRACE_TURNS);

    const result = ai.executeTurn(
      AI_DIPLOMACY_GRACE_TURNS + AI_PEACE_MIN_WAR_TURNS,
      [
        makeCiv(CIV_ALPHA, { militaryStrength: 200 }),
        makeCiv(CIV_BETA, { militaryStrength: 100 }),
      ],
    );

    expect(result.peaceTreaties).toEqual([
      { civId: CIV_BETA, targetCivId: CIV_ALPHA },
    ]);
    expect(diplomacy.isAtWar(CIV_ALPHA, CIV_BETA)).toBe(false);
  });

  it('schließt vor sechs Kriegsrunden keinen Frieden', () => {
    const { diplomacy, ai } = makeSetup([CIV_ALPHA, CIV_BETA]);
    diplomacy.declareWar(CIV_ALPHA, CIV_BETA, AI_DIPLOMACY_GRACE_TURNS);
    const civs = [
      makeCiv(CIV_ALPHA, { militaryStrength: 200 }),
      makeCiv(CIV_BETA, { militaryStrength: 100 }),
    ];

    const early = ai.executeTurn(
      AI_DIPLOMACY_GRACE_TURNS + AI_PEACE_MIN_WAR_TURNS - 1,
      civs,
    );
    expect(early.peaceTreaties).toEqual([]);
    expect(diplomacy.isAtWar(CIV_ALPHA, CIV_BETA)).toBe(true);

    const due = ai.executeTurn(
      AI_DIPLOMACY_GRACE_TURNS + AI_PEACE_MIN_WAR_TURNS,
      civs,
    );
    expect(due.peaceTreaties).toHaveLength(1);
    expect(diplomacy.isAtWar(CIV_ALPHA, CIV_BETA)).toBe(false);
  });

  it('lässt einen schwächeren Spieler erst nach der Höchstdauer Frieden schließen', () => {
    const { diplomacy, ai } = makeSetup([CIV_ALPHA, CIV_PLAYER]);
    diplomacy.declareWar(CIV_ALPHA, CIV_PLAYER, AI_DIPLOMACY_GRACE_TURNS);
    const civs = [
      makeCiv(CIV_ALPHA, { militaryStrength: 200 }),
      makeCiv(CIV_PLAYER, { isPlayer: true, militaryStrength: 50 }),
    ];

    const beforeMax = ai.executeTurn(
      AI_DIPLOMACY_GRACE_TURNS + AI_MAX_WAR_TURNS - 1,
      civs,
    );
    expect(beforeMax.peaceTreaties).toEqual([]);
    expect(diplomacy.isAtWar(CIV_ALPHA, CIV_PLAYER)).toBe(true);

    const atMax = ai.executeTurn(
      AI_DIPLOMACY_GRACE_TURNS + AI_MAX_WAR_TURNS,
      civs,
    );
    expect(atMax.peaceTreaties).toEqual([
      { civId: CIV_ALPHA, targetCivId: CIV_PLAYER },
    ]);
    expect(diplomacy.isAtWar(CIV_ALPHA, CIV_PLAYER)).toBe(false);
  });

  it('sperrt ein Paar nach einem Frieden für zehn Runden', () => {
    const { diplomacy, ai } = makeSetup([CIV_ALPHA, CIV_BETA]);
    diplomacy.declareWar(CIV_ALPHA, CIV_BETA, 0);
    ai.executeTurn(AI_PEACE_MIN_WAR_TURNS, [
      makeCiv(CIV_ALPHA, { militaryStrength: 200 }),
      makeCiv(CIV_BETA, { militaryStrength: 100 }),
    ]);
    expect(diplomacy.isAtWar(CIV_ALPHA, CIV_BETA)).toBe(false);

    const blocked = ai.executeTurn(
      AI_DIPLOMACY_GRACE_TURNS,
      [
        makeCiv(CIV_ALPHA, { militaryStrength: 200 }),
        makeCiv(CIV_BETA, { militaryStrength: 100 }),
      ],
    );
    expect(blocked.declaredWars).toEqual([]);

    const allowed = ai.executeTurn(
      AI_PEACE_MIN_WAR_TURNS + AI_PEACE_COOLDOWN_TURNS,
      [
        makeCiv(CIV_ALPHA, { militaryStrength: 200 }),
        makeCiv(CIV_BETA, { militaryStrength: 100 }),
      ],
    );
    expect(allowed.declaredWars).toEqual([
      { civId: CIV_ALPHA, targetCivId: CIV_BETA },
    ]);
  });

  it('ist bei doppeltem Aufruf in derselben Runde idempotent', () => {
    const { diplomacy, ai } = makeSetup([CIV_ALPHA, CIV_BETA]);
    const civs = [
      makeCiv(CIV_ALPHA, { militaryStrength: 200 }),
      makeCiv(CIV_BETA, { militaryStrength: 100 }),
    ];
    let warEvents = 0;
    bus.on('diplomacy:war-declared', () => {
      warEvents += 1;
    });

    const first = ai.executeTurn(AI_DIPLOMACY_GRACE_TURNS, civs);
    const second = ai.executeTurn(AI_DIPLOMACY_GRACE_TURNS, civs);

    expect(first.declaredWars).toHaveLength(1);
    expect(second.declaredWars).toEqual([]);
    expect(diplomacy.getWarCountForCiv(CIV_ALPHA)).toBe(1);
    expect(warEvents).toBe(1);
  });

  it('wählt bei gleicher Stärke die kleinere ID', () => {
    const { ai } = makeSetup([CIV_ALPHA, CIV_BETA, CIV_CHARLIE]);
    const result = ai.executeTurn(AI_DIPLOMACY_GRACE_TURNS, [
      makeCiv(CIV_ALPHA, { militaryStrength: 300 }),
      makeCiv(CIV_BETA, { militaryStrength: 100 }),
      makeCiv(CIV_CHARLIE, { militaryStrength: 100 }),
    ]);

    expect(result.declaredWars).toEqual([
      { civId: CIV_ALPHA, targetCivId: CIV_BETA },
    ]);
  });

  it('ignoriert Reiche ohne Kolonien als Angreifer und Ziel', () => {
    const { ai } = makeSetup([CIV_ALPHA, CIV_BETA, CIV_DEAD]);
    const result = ai.executeTurn(AI_DIPLOMACY_GRACE_TURNS, [
      makeCiv(CIV_ALPHA, { militaryStrength: 300 }),
      makeCiv(CIV_BETA, { militaryStrength: 100 }),
      makeCiv(CIV_DEAD, { militaryStrength: 0, colonyCount: 0 }),
    ]);

    expect(result.declaredWars).toEqual([
      { civId: CIV_ALPHA, targetCivId: CIV_BETA },
    ]);
  });
});
