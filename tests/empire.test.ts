/**
 * Astraea 4X - Phase 4: Reichsverwaltung & innere Fraktionen
 *
 * Prüft den neutralen Startzustand, Politikwechsel mit Cooldown, die
 * Fraktionsdynamik (Steuern, Kriege, Forschung), Verwaltungskapazität,
 * Overextension, dominante Fraktionen, Save/Load, die Engine-Integration
 * sowie die zentrale Meldungsbrücke.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  ADMIN_BASE_CAPACITY,
  EMPIRE_POLICIES,
  EMPIRE_POLICY_COOLDOWN_TURNS,
  EmpireManager,
  EmpireSnapshot,
  buildEmpireSnapshot,
} from '../src/core/empireManager.ts';
import { GameEngine } from '../src/core/GameEngine.ts';
import { EventBus } from '../src/core/EventBus.ts';
import { NotificationCenter } from '../src/core/notificationCenter.ts';
import { attachNotificationBridge } from '../src/core/notificationBridge.ts';
import { Colony, EmpirePolicy, EmpireState, Planet } from '../src/core/types.ts';

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) {
    cleanups.pop()!();
  }
  EventBus.getInstance().clear();
});

function snapshot(overrides: Partial<EmpireSnapshot> = {}): EmpireSnapshot {
  return {
    civId: 'player-empire',
    isPlayer: true,
    colonyCount: 1,
    colonyLoad: 1,
    districtCount: 0,
    totalPopulation: 1000,
    productionPerPop: 4,
    researchPerPop: 2,
    averageTaxRate: 30,
    fleetStrength: 40,
    warCount: 0,
    tradeRouteCount: 0,
    completedTechCount: 0,
    treasury: 0,
    ...overrides,
  };
}

function faction(state: EmpireState, id: EmpireState['factions'][number]['id']) {
  return state.factions.find((entry) => entry.id === id)!;
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

/** Frische Galaxie mit einer Spielerkolonie (gleiches Muster wie die Steuertests). */
function foundPlayerColony(engine: GameEngine, seed: string): Colony {
  engine.generateNewGalaxy({ seed });
  const sys = engine.getGalaxy().systems[0];
  engine.selectSystem(sys.id);
  engine.surveySystem(sys.id);

  const planet = sys.planets.find((p) => p.planetType !== 'gas_giant') ?? sys.planets[0];
  makeHabitable(planet);

  const result = engine.foundColony(planet.id, 'Reichshafen');
  expect(result.success).toBe(true);
  return result.colony!;
}

describe('Astraea 4X - Reichsverwaltung & Fraktionen', () => {
  it('1. Startzustand ist neutral: ausgewogene Politik, drei Fraktionen, keine Modifikatoren', () => {
    const manager = new EmpireManager();
    const state = manager.getState('player-empire');
    const snap = snapshot();

    expect(state.policy).toBe('balanced');
    expect(state.policyCooldownUntil).toBe(0);
    expect(state.factions).toHaveLength(3);
    expect(state.factions.map((entry) => entry.id)).toEqual([
      'industrialists',
      'scientists',
      'militarists',
    ]);
    expect(state.factions.every((entry) => entry.loyalty === 50)).toBe(true);
    expect(state.factions.reduce((sum, entry) => sum + entry.influence, 0)).toBe(100);

    expect(manager.getModifiers('player-empire', snap)).toEqual({
      productionMultiplier: 1,
      researchMultiplier: 1,
      influenceMultiplier: 1,
      approvalModifier: 0,
    });
    expect(manager.getAdministration(snap)).toEqual({
      capacity: ADMIN_BASE_CAPACITY,
      load: 1,
      overextension: 0,
      efficiency: 1,
    });
  });

  it('2. Politikwechsel setzt den Cooldown, blockiert vorzeitige Wechsel und lehnt Unbekanntes ab', () => {
    const manager = new EmpireManager();

    const first = manager.setPolicy('player-empire', 'industry', 1);
    expect(first.success).toBe(true);
    expect(first.previousPolicy).toBe('balanced');
    expect(first.availableTurn).toBe(1 + EMPIRE_POLICY_COOLDOWN_TURNS);
    expect(manager.getState('player-empire').policy).toBe('industry');

    const blocked = manager.setPolicy('player-empire', 'science', 5);
    expect(blocked.success).toBe(false);
    expect(blocked.availableTurn).toBe(6);
    expect(blocked.reason).toContain('Runde 6');

    const same = manager.setPolicy('player-empire', 'industry', 6);
    expect(same.success).toBe(false);
    expect(same.reason).toContain('bereits aktiv');

    const invalid = manager.setPolicy('player-empire', 'anarchie' as EmpirePolicy, 6);
    expect(invalid.success).toBe(false);
    expect(invalid.reason).toContain('Unbekannte Politik');

    const allowed = manager.setPolicy('player-empire', 'science', 6);
    expect(allowed.success).toBe(true);
    expect(manager.getState('player-empire').policy).toBe('science');
    expect(manager.getState('player-empire').policyCooldownUntil).toBe(
      6 + EMPIRE_POLICY_COOLDOWN_TURNS
    );
  });

  it('3. Politikfelder liefern die dokumentierten Ertrags- und Zustimmungsmodifikatoren', () => {
    const manager = new EmpireManager();
    const snap = snapshot();

    manager.setPolicy('player-empire', 'industry', 1);
    expect(manager.getModifiers('player-empire', snap)).toMatchObject({
      productionMultiplier: 1.15,
      researchMultiplier: 1,
      influenceMultiplier: 1,
      approvalModifier: EMPIRE_POLICIES.industry.approvalModifier,
    });

    manager.loadStates([]);
    manager.setPolicy('player-empire', 'science', 1);
    expect(manager.getModifiers('player-empire', snap)).toMatchObject({
      productionMultiplier: 1,
      researchMultiplier: 1.15,
      approvalModifier: -3,
    });

    manager.loadStates([]);
    manager.setPolicy('player-empire', 'military', 1);
    expect(manager.getModifiers('player-empire', snap)).toMatchObject({
      productionMultiplier: 1.05,
      influenceMultiplier: 1.15,
      approvalModifier: -2,
    });
  });

  it('4. Verwaltungskapazität wächst mit Forschung und Rücklagen, Overextension senkt Effizienz und Zustimmung', () => {
    const manager = new EmpireManager();

    expect(
      manager.getAdministration(snapshot({ completedTechCount: 4, treasury: 3000 }))
    ).toMatchObject({ capacity: 8, load: 1, overextension: 0 });

    const strained = manager.getAdministration(
      snapshot({ colonyLoad: 8, districtCount: 8, completedTechCount: 0, treasury: 0 })
    );
    expect(strained.load).toBe(10);
    expect(strained.overextension).toBe(6);
    expect(strained.efficiency).toBe(0.5);

    const modifiers = manager.getModifiers('player-empire', snapshot({ colonyLoad: 8, districtCount: 8 }));
    expect(modifiers.approvalModifier).toBe(-10);
  });

  it('5. Hohe Steuern senken die Loyalität von Industrie und Wissenschaft, niedrige Steuern heben sie', () => {
    const manager = new EmpireManager();
    const highTax = snapshot({ averageTaxRate: 60 });
    const lowTax = snapshot({ averageTaxRate: 0 });

    manager.advanceTurn([highTax], 1);
    const afterHigh = manager.getState('player-empire');

    manager.loadStates([]);
    manager.advanceTurn([lowTax], 1);
    const afterLow = manager.getState('player-empire');

    expect(faction(afterLow, 'industrialists').loyalty).toBeGreaterThan(
      faction(afterHigh, 'industrialists').loyalty
    );
    expect(faction(afterLow, 'scientists').loyalty).toBeGreaterThan(
      faction(afterHigh, 'scientists').loyalty
    );
  });

  it('6. Kriege stärken das Flottenkommando, Forschung stärkt die Forschergilde', () => {
    const warmanager = new EmpireManager();
    warmanager.advanceTurn(
      [snapshot({ warCount: 2, fleetStrength: 200, colonyCount: 1 })],
      1
    );
    const warState = warmanager.getState('player-empire');
    expect(faction(warState, 'militarists').loyalty).toBeGreaterThan(50);
    expect(faction(warState, 'militarists').loyalty).toBeGreaterThan(
      faction(warState, 'scientists').loyalty
    );

    const scienceManager = new EmpireManager();
    scienceManager.advanceTurn([snapshot({ researchPerPop: 6 })], 1);
    const scienceState = scienceManager.getState('player-empire');
    expect(faction(scienceState, 'scientists').loyalty).toBeGreaterThan(50);
    expect(faction(scienceState, 'scientists').loyalty).toBeGreaterThan(
      faction(scienceState, 'industrialists').loyalty
    );
  });

  it('7. Eine dominante, loyale Fraktion gewährt +5 % auf ihren Schwerpunkt', () => {
    const manager = new EmpireManager();
    manager.loadStates([
      {
        civId: 'player-empire',
        policy: 'balanced',
        policyCooldownUntil: 0,
        factions: [
          { id: 'industrialists', influence: 50, loyalty: 70 },
          { id: 'scientists', influence: 25, loyalty: 50 },
          { id: 'militarists', influence: 25, loyalty: 50 },
        ],
      },
    ]);

    const modifiers = manager.getModifiers('player-empire', snapshot());
    expect(modifiers.productionMultiplier).toBe(1.05);
    expect(modifiers.researchMultiplier).toBe(1);
    expect(modifiers.influenceMultiplier).toBe(1);
    // Gewichtete Loyalität 60 => +1 Zustimmung.
    expect(modifiers.approvalModifier).toBe(1);
    expect(manager.getDominantFaction('player-empire').id).toBe('industrialists');
  });

  it('8. Save/Load erhält Politik, Cooldown und Fraktionswerte; fehlende Daten ergeben Standard', () => {
    const manager = new EmpireManager();
    manager.setPolicy('civ-a', 'science', 3);
    manager.advanceTurn([snapshot({ civId: 'civ-a', averageTaxRate: 50 })], 3);
    const saved = manager.getAllStates();

    const restored = new EmpireManager();
    restored.loadStates(JSON.parse(JSON.stringify(saved)) as EmpireState[]);
    expect(restored.getAllStates()).toEqual(saved);

    const fallback = new EmpireManager();
    fallback.loadStates(undefined);
    expect(fallback.getAllStates()).toEqual([]);
    const created = fallback.getState('civ-b');
    expect(created.policy).toBe('balanced');
    expect(created.factions).toHaveLength(3);

    const sanitized = new EmpireManager();
    sanitized.loadStates([
      {
        civId: 'civ-c',
        policy: 'monarchy' as EmpirePolicy,
        policyCooldownUntil: -8,
        factions: [
          { id: 'industrialists', influence: 999, loyalty: -50 },
          { id: 'scientists', influence: Number.NaN, loyalty: 500 },
        ],
      },
    ]);
    const state = sanitized.getState('civ-c');
    expect(state.policy).toBe('balanced');
    expect(state.policyCooldownUntil).toBe(0);
    expect(state.factions).toHaveLength(3);
    expect(state.factions.reduce((sum, entry) => sum + entry.influence, 0)).toBe(100);
    expect(state.factions.every((entry) => entry.loyalty >= 0 && entry.loyalty <= 100)).toBe(true);
  });

  it('9. buildEmpireSnapshot gewichtet Koloniestufen, Distrikte und filtert nach Reich', () => {
    const colonies = [
      {
        civId: 'civ-a',
        population: 100,
        developmentTier: 'colony',
        districts: [{}, {}, {}, {}],
        netYields: { production: 10, research: 4 },
        researchOutput: 4,
        taxRate: 20,
      },
      {
        civId: 'civ-a',
        population: 50,
        developmentTier: 'outpost',
        districts: [],
        netYields: { production: 5, research: 2 },
        researchOutput: 2,
        taxRate: 40,
      },
      {
        civId: 'civ-b',
        population: 900,
        developmentTier: 'colony',
        districts: [],
        netYields: { production: 99, research: 99 },
        researchOutput: 99,
        taxRate: 60,
      },
    ] as unknown as Colony[];

    const result = buildEmpireSnapshot('civ-a', true, colonies, {
      completedTechCount: 2,
      treasury: 500,
    });

    expect(result.colonyCount).toBe(2);
    expect(result.colonyLoad).toBe(4);
    expect(result.districtCount).toBe(4);
    expect(result.totalPopulation).toBe(150);
    expect(result.productionPerPop).toBeCloseTo(15 / 150, 5);
    expect(result.researchPerPop).toBeCloseTo(6 / 150, 5);
    expect(result.averageTaxRate).toBe(30);
    expect(result.completedTechCount).toBe(2);
    expect(result.treasury).toBe(500);
  });

  it('10. KI richtet ihre Politik ab Runde 10 an der dominanten Fraktion aus', () => {
    const manager = new EmpireManager();
    const aiSnapshot = snapshot({
      civId: 'ai-empire',
      isPlayer: false,
      productionPerPop: 10,
      averageTaxRate: 20,
    });

    const early = manager.advanceTurn([aiSnapshot], 9);
    expect(early.policyChanges).toHaveLength(0);
    expect(manager.getState('ai-empire').policy).toBe('balanced');

    const later = manager.advanceTurn([aiSnapshot], 10);
    expect(later.policyChanges).toHaveLength(1);
    expect(later.policyChanges[0]).toMatchObject({
      civId: 'ai-empire',
      previousPolicy: 'balanced',
      policy: 'industry',
    });
    expect(manager.getState('ai-empire').policy).toBe('industry');
    expect(manager.getState('ai-empire').policyCooldownUntil).toBe(
      10 + EMPIRE_POLICY_COOLDOWN_TURNS
    );
  });

  it('11. advanceTurn ist deterministisch und unabhängig von der Eingabereihenfolge', () => {
    const snapshots = [
      snapshot({ civId: 'civ-b', researchPerPop: 5 }),
      snapshot({ civId: 'civ-a', warCount: 1, fleetStrength: 120 }),
    ];

    const forward = new EmpireManager();
    const forwardReport = forward.advanceTurn(snapshots, 4);

    const backward = new EmpireManager();
    const backwardReport = backward.advanceTurn([...snapshots].reverse(), 4);

    expect(forwardReport.states).toEqual(backwardReport.states);
    expect(forward.getAllStates()).toEqual(backward.getAllStates());
    expect(forwardReport.states.map((state) => state.civId)).toEqual(['civ-a', 'civ-b']);
  });

  it('12. Engine: erster Zug bleibt neutral, Politikwechsel sendet ein Ereignis und respektiert den Cooldown', () => {
    const engine = GameEngine.getInstance();
    const colony = foundPlayerColony(engine, 'EMPIRE-SEED-12');
    const civ = engine.getPlayerCiv();

    const before = engine.getEmpireOverview(civ.id)!;
    expect(before.state.policy).toBe('balanced');
    expect(before.modifiers).toEqual({
      productionMultiplier: 1,
      researchMultiplier: 1,
      influenceMultiplier: 1,
      approvalModifier: 0,
    });

    engine.endTurn();
    const afterFirstTurn = engine.getColonies().find((entry) => entry.id === colony.id)!;
    expect(afterFirstTurn.approval).toBe(50);
    expect(engine.getEmpireOverview(civ.id)!.state.factions).toHaveLength(3);

    const bus = EventBus.getInstance();
    let captured: { civId: string; policy: string; previousPolicy: string; turn: number } | null =
      null;
    const unsubscribe = bus.on('empire:policy-changed', (payload) => {
      captured = payload;
    });
    cleanups.push(unsubscribe);

    const turn = engine.getTurnState().currentTurn;
    const result = engine.setEmpirePolicy(civ.id, 'industry');
    expect(result.success).toBe(true);
    expect(captured).toMatchObject({
      civId: civ.id,
      policy: 'industry',
      previousPolicy: 'balanced',
      turn,
    });

    const blocked = engine.setEmpirePolicy(civ.id, 'science');
    expect(blocked.success).toBe(false);
    expect(blocked.availableTurn).toBe(turn + EMPIRE_POLICY_COOLDOWN_TURNS);
  });

  it('13. Engine: empireStates überleben Speichern und Laden, alte Stände bleiben kompatibel', () => {
    const engine = GameEngine.getInstance();
    foundPlayerColony(engine, 'EMPIRE-SEED-13');
    const civ = engine.getPlayerCiv();
    engine.setEmpirePolicy(civ.id, 'military');

    const payload = engine.createSavePayload('Reichstest');
    expect(payload.version).toBe(5);
    expect(payload.empireStates?.some((state) => state.civId === civ.id)).toBe(true);

    // Alte Spielstände ohne Reichsdaten bleiben ladbar und erhalten Standardwerte.
    const legacy = { ...payload, empireStates: undefined };
    expect(engine.restoreFromSaveData(legacy)).toBe(true);
    const restored = engine.getEmpireOverview(civ.id)!;
    expect(restored.state.policy).toBe('balanced');
    expect(restored.state.factions).toHaveLength(3);

    expect(engine.restoreFromSaveData(payload)).toBe(true);
    expect(engine.getEmpireOverview(civ.id)!.state.policy).toBe('military');
  });

  it('14. Meldungsbrücke: Fraktionsunruhe wird gemeldet und bei Erholung wieder entfernt', () => {
    const center = new NotificationCenter();
    const detach = attachNotificationBridge(center, EventBus.getInstance(), {
      playerCivId: 'player-empire',
      currentTurn: () => 5,
    });
    cleanups.push(detach);

    const bus = EventBus.getInstance();
    bus.emit('empire:faction-unrest', {
      civId: 'player-empire',
      factionId: 'scientists',
      factionName: 'Forschergilde',
      loyalty: 22,
      turn: 5,
    });

    const unrest = center.getItems().find((item) => item.key === 'faction-unrest:player-empire:scientists');
    expect(unrest).toBeDefined();
    expect(unrest!.category).toBe('warning');
    expect(unrest!.message).toContain('Forschergilde');

    bus.emit('empire:faction-recovered', {
      civId: 'player-empire',
      factionId: 'scientists',
      factionName: 'Forschergilde',
      loyalty: 45,
      turn: 6,
    });

    expect(
      center.getItems().some((item) => item.key === 'faction-unrest:player-empire:scientists')
    ).toBe(false);
    expect(
      center.getItems().some((item) => item.message.includes('beigelegt'))
    ).toBe(true);

    // KI-Ereignisse erzeugen keine Spielermeldung.
    const before = center.getItems().length;
    bus.emit('empire:faction-unrest', {
      civId: 'ai-empire',
      factionId: 'militarists',
      factionName: 'Flottenkommando',
      loyalty: 10,
      turn: 6,
    });
    expect(center.getItems()).toHaveLength(before);
  });
});
