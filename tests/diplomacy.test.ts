/**
 * Astraea 4X - Diplomacy Test Suite (Phase 4)
 * Verifies that every known civilization pair starts at peace, that war and
 * peace declarations are symmetric and validated, that peace respects the
 * minimum war duration, that the snapshot survives a load round trip, that
 * syncing civilizations seeds and prunes pairs, and that the expected
 * diplomacy events are emitted.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { DiplomacyManager, PEACE_MIN_WAR_TURNS } from '../src/core/diplomacyManager.ts';
import { EventBus } from '../src/core/EventBus.ts';
import { DiplomaticPair } from '../src/core/types.ts';

const CIV_ALPHA = 'civ-alpha';
const CIV_BETA = 'civ-beta';
const CIV_GAMMA = 'civ-gamma';
const CIVS = [CIV_ALPHA, CIV_BETA, CIV_GAMMA];

const bus = EventBus.getInstance();

function makeManager(): DiplomacyManager {
  const manager = new DiplomacyManager(bus);
  manager.syncCivilizations(CIVS);
  return manager;
}

describe('DiplomacyManager', () => {
  beforeEach(() => {
    bus.clear();
  });

  it('seeds every pair at peace and returns deterministic ordering', () => {
    const manager = makeManager();

    expect(manager.getPairs()).toHaveLength(3);
    expect(manager.getPairs().every((pair) => pair.relation === 'peace')).toBe(true);
    expect(manager.getPairs().map((pair) => `${pair.civAId}|${pair.civBId}`)).toEqual([
      `${CIV_ALPHA}|${CIV_BETA}`,
      `${CIV_ALPHA}|${CIV_GAMMA}`,
      `${CIV_BETA}|${CIV_GAMMA}`,
    ]);
    expect(manager.isAtWar(CIV_ALPHA, CIV_BETA)).toBe(false);
    expect(manager.getWarCountForCiv(CIV_ALPHA)).toBe(0);
  });

  it('declares war symmetrically, records the turn and emits an event', () => {
    const manager = makeManager();
    const events: Array<{ civAId: string; civBId: string; turn: number }> = [];
    const off = bus.on('diplomacy:war-declared', (payload) => events.push(payload));

    const result = manager.declareWar(CIV_BETA, CIV_ALPHA, 9);

    expect(result.allowed).toBe(true);
    expect(manager.isAtWar(CIV_ALPHA, CIV_BETA)).toBe(true);
    expect(manager.isAtWar(CIV_BETA, CIV_ALPHA)).toBe(true);
    expect(manager.getPair(CIV_ALPHA, CIV_BETA)).toEqual({
      civAId: CIV_ALPHA,
      civBId: CIV_BETA,
      relation: 'war',
      sinceTurn: 9,
    });
    expect(manager.getWarCountForCiv(CIV_BETA)).toBe(1);
    expect(events).toEqual([{ civAId: CIV_ALPHA, civBId: CIV_BETA, turn: 9 }]);

    off();
  });

  it('rejects a duplicate war declaration and self-declaration', () => {
    const manager = makeManager();
    manager.declareWar(CIV_ALPHA, CIV_BETA, 1);

    expect(manager.declareWar(CIV_ALPHA, CIV_BETA, 2)).toMatchObject({ allowed: false });
    expect(manager.getPair(CIV_ALPHA, CIV_BETA)?.sinceTurn).toBe(1);
    expect(manager.declareWar(CIV_ALPHA, CIV_ALPHA, 2)).toMatchObject({ allowed: false });
  });

  it('rejects civilizations that are not registered', () => {
    const manager = makeManager();

    expect(manager.declareWar(CIV_ALPHA, 'civ-unknown', 1)).toMatchObject({ allowed: false });
    expect(manager.declareWar('', CIV_ALPHA, 1)).toMatchObject({ allowed: false });
    expect(manager.isAtWar(CIV_ALPHA, 'civ-unknown')).toBe(false);
  });

  it('rejects peace before the minimum war duration has elapsed', () => {
    const manager = makeManager();
    manager.declareWar(CIV_ALPHA, CIV_BETA, 10);

    for (let turn = 10; turn < 10 + PEACE_MIN_WAR_TURNS; turn += 1) {
      const result = manager.makePeace(CIV_ALPHA, CIV_BETA, turn);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain(`${PEACE_MIN_WAR_TURNS}`);
      expect(manager.isAtWar(CIV_ALPHA, CIV_BETA)).toBe(true);
    }
  });

  it('accepts peace after the minimum war duration and emits an event', () => {
    const manager = makeManager();
    const events: Array<{ civAId: string; civBId: string; turn: number; turnsAtWar: number }> = [];
    const off = bus.on('diplomacy:peace-made', (payload) => events.push(payload));

    manager.declareWar(CIV_ALPHA, CIV_BETA, 4);
    const result = manager.makePeace(CIV_BETA, CIV_ALPHA, 4 + PEACE_MIN_WAR_TURNS);

    expect(result.allowed).toBe(true);
    expect(manager.isAtWar(CIV_ALPHA, CIV_BETA)).toBe(false);
    expect(manager.getPair(CIV_ALPHA, CIV_BETA)).toEqual({
      civAId: CIV_ALPHA,
      civBId: CIV_BETA,
      relation: 'peace',
      sinceTurn: 4 + PEACE_MIN_WAR_TURNS,
    });
    expect(manager.getWarCountForCiv(CIV_ALPHA)).toBe(0);
    expect(events).toEqual([
      { civAId: CIV_ALPHA, civBId: CIV_BETA, turn: 4 + PEACE_MIN_WAR_TURNS, turnsAtWar: PEACE_MIN_WAR_TURNS },
    ]);

    off();
  });

  it('rejects peace when no war exists', () => {
    const manager = makeManager();

    expect(manager.makePeace(CIV_ALPHA, CIV_BETA, 5)).toMatchObject({ allowed: false });
  });

  it('keeps existing relations while seeding new pairs and prunes removed civs', () => {
    const manager = makeManager();
    manager.declareWar(CIV_ALPHA, CIV_BETA, 3);

    manager.syncCivilizations([...CIVS, 'civ-delta']);

    expect(manager.getPairs()).toHaveLength(6);
    expect(manager.isAtWar(CIV_ALPHA, CIV_BETA)).toBe(true);
    expect(manager.getPair(CIV_ALPHA, 'civ-delta')).toMatchObject({ relation: 'peace' });

    manager.syncCivilizations([CIV_ALPHA, CIV_GAMMA]);

    expect(manager.getPairs()).toHaveLength(1);
    expect(manager.getPair(CIV_ALPHA, CIV_GAMMA)).not.toBeNull();
    expect(manager.getPair(CIV_ALPHA, CIV_BETA)).toBeNull();
    expect(manager.isAtWar(CIV_ALPHA, CIV_BETA)).toBe(false);
  });

  it('round-trips pairs through the snapshot and tolerates malformed input', () => {
    const manager = makeManager();
    manager.declareWar(CIV_ALPHA, CIV_GAMMA, 6);
    const snapshot = manager.toSnapshot();

    const restored = new DiplomacyManager(bus);
    restored.syncCivilizations(CIVS);
    restored.loadPairs(snapshot);

    expect(restored.getPairs()).toEqual(snapshot);
    expect(restored.isAtWar(CIV_ALPHA, CIV_GAMMA)).toBe(true);
    expect(restored.getPair(CIV_ALPHA, CIV_GAMMA)?.sinceTurn).toBe(6);

    const tampered: DiplomaticPair[] = [
      ...snapshot,
      { civAId: CIV_BETA, civBId: CIV_BETA, relation: 'war', sinceTurn: 2 },
      { civAId: 'civ-x', civBId: 'civ-y', relation: 'unknown' as never, sinceTurn: 2 },
      { civAId: 'civ-z', civBId: 'civ-w', relation: 'war', sinceTurn: -4 },
    ];
    restored.loadPairs(tampered);

    expect(restored.getPair(CIV_BETA, CIV_BETA)).toBeNull();
    expect(restored.getPairs().some((pair) => (pair.relation as string) === 'unknown')).toBe(false);
    expect(restored.getPair('civ-z', 'civ-w')).toMatchObject({ relation: 'war', sinceTurn: 0 });
  });

  it('clears every pair and returns defensive copies', () => {
    const manager = makeManager();
    const pairs = manager.getPairs();
    pairs[0].relation = 'war';
    pairs[0].sinceTurn = 99;

    expect(manager.getPairs()[0]).toMatchObject({ relation: 'peace', sinceTurn: 0 });

    manager.clear();
    expect(manager.getPairs()).toHaveLength(0);
    expect(manager.declareWar(CIV_ALPHA, CIV_BETA, 1)).toMatchObject({ allowed: true });
  });
});
