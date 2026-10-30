/**
 * Astraea 4X - Phase 5: Narrative Ebene & Galaxiegeschichte
 *
 * Prüft deterministische Ausgrabungsstätten, Aufdeckung und Fortschritt,
 * datengetriebene Ereignisse mit Entscheidungen und Flags, die galaktische
 * Krise samt Eindämmung und Wirtschaftsmodifikatoren, Speichern/Laden, die
 * Engine-Integration sowie die zentrale Meldungsbrücke.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/EventBus.ts';
import { GameEngine } from '../src/core/GameEngine.ts';
import {
  CRISIS_CONTAINED_THRESHOLD,
  CRISIS_CONTAINMENT_COST,
  CRISIS_CONTAINMENT_GAIN,
  CRISIS_START_TURN,
  EXCAVATION_START_COST,
  NarrativeCivContext,
  NarrativeManager,
  generateExcavationSites,
} from '../src/core/narrativeManager.ts';
import { NotificationCenter } from '../src/core/notificationCenter.ts';
import { attachNotificationBridge } from '../src/core/notificationBridge.ts';
import { GalaxyGenerator } from '../src/generation/galaxyGenerator.ts';
import type {
  Colony,
  CrisisOutcome,
  CrisisStage,
  ExcavationSite,
  Galaxy,
  NarrativeSaveState,
  NarrativeState,
  Planet,
} from '../src/core/types.ts';

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) {
    cleanups.pop()!();
  }
  EventBus.getInstance().clear();
});

function makeGalaxy(seed: string): Galaxy {
  return GalaxyGenerator.generate({
    seed,
    size: 'small',
    systemCount: 12,
    width: 600,
    height: 600,
    minDistance: 50,
  });
}

function context(overrides: Partial<NarrativeCivContext> = {}): NarrativeCivContext {
  return {
    civId: 'civ-a',
    isPlayer: true,
    colonyCount: 1,
    treasury: 500,
    warCount: 0,
    researchPerTurn: 0,
    ...overrides,
  };
}

function dormantCrisis() {
  return {
    stage: 'dormant' as CrisisStage,
    startedTurn: null,
    stageTurn: null,
    outcome: null,
    containment: 0,
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

function foundPlayerColony(engine: GameEngine, seed: string): Colony {
  engine.generateNewGalaxy({
    seed,
    size: 'small',
    systemCount: 12,
    width: 600,
    height: 600,
    minDistance: 50,
  });
  const sys = engine.getGalaxy().systems[0];
  engine.selectSystem(sys.id);
  engine.surveySystem(sys.id);

  const planet = sys.planets.find((p) => p.planetType !== 'gas_giant') ?? sys.planets[0];
  makeHabitable(planet);

  const result = engine.foundColony(planet.id, 'Chronikhafen');
  expect(result.success).toBe(true);
  return result.colony!;
}

/** Erste Stätte, deren Planet noch nicht vollständig analysiert ist. */
function firstAnalyzableSite(engine: GameEngine): ExcavationSite {
  const sites = engine.getNarrativeManager().getSites();
  for (const site of sites) {
    const system = engine.getGalaxy().systems.find((entry) => entry.id === site.systemId);
    const planet = system?.planets?.find((entry) => entry.id === site.planetId);
    if (planet && planet.surveyStatus !== 'analyzed') {
      return site;
    }
  }
  return sites[0];
}

describe('Astraea 4X - Narrative Ebene & Galaxiegeschichte', () => {
  it('1. Ausgrabungsstätten sind deterministisch, eindeutig und unabhängig von der Systemreihenfolge', () => {
    const galaxy = makeGalaxy('NARRATIVE-SITES-01');
    const sites = generateExcavationSites(galaxy);

    expect(sites.length).toBeGreaterThanOrEqual(3);
    expect(sites.length).toBeLessThanOrEqual(12);
    expect(new Set(sites.map((site) => site.id)).size).toBe(sites.length);
    expect(new Set(sites.map((site) => site.planetId)).size).toBe(sites.length);
    expect(sites.map((site) => site.id)).toEqual([...sites.map((site) => site.id)].sort());
    for (const site of sites) {
      expect(site.status).toBe('undiscovered');
      expect(site.progress).toBe(0);
      expect(site.difficulty).toBeGreaterThan(0);
      expect(site.rewardCredits).toBeGreaterThan(0);
      expect(site.rewardResearch).toBeGreaterThan(0);
    }

    expect(generateExcavationSites(galaxy)).toEqual(sites);

    const reversed: Galaxy = {
      ...galaxy,
      systems: [...galaxy.systems].reverse().map((system) => ({
        ...system,
        planets: [...system.planets].reverse(),
      })),
    };
    expect(generateExcavationSites(reversed)).toEqual(sites);
  });

  it('2. Eine Stätte wird erst nach vollständiger Analyse aufgedeckt; Aufdecken ist idempotent', () => {
    const galaxy = makeGalaxy('NARRATIVE-DISCOVER-02');
    const manager = new NarrativeManager();
    manager.generateSites(galaxy);

    const site = manager.getSites()[0];
    const discovered = manager.discoverSite(site.planetId, 'civ-a', 2);
    expect(discovered).toMatchObject({
      id: site.id,
      status: 'discovered',
      discoveredByCivId: 'civ-a',
      discoveredTurn: 2,
    });

    // Zweites Aufdecken durch ein anderes Reich ändert nichts.
    expect(manager.discoverSite(site.planetId, 'civ-b', 3)).toBeNull();
    expect(manager.getSites().find((entry) => entry.id === site.id)!.discoveredByCivId).toBe(
      'civ-a'
    );
    expect(manager.discoverSite('unbekannter-planet', 'civ-a', 4)).toBeNull();
  });

  it('3. Ausgrabung prüft Credits, Eigentum und nur eine aktive Grabung', () => {
    const galaxy = makeGalaxy('NARRATIVE-START-03');
    const manager = new NarrativeManager();
    manager.generateSites(galaxy);
    const [first, second] = manager.getSites();

    manager.discoverSite(first.planetId, 'civ-a', 2);
    manager.discoverSite(second.planetId, 'civ-a', 2);

    const broke = manager.startExcavation('civ-a', first.id, EXCAVATION_START_COST - 1);
    expect(broke.success).toBe(false);
    expect(broke.reason).toContain(String(EXCAVATION_START_COST));

    const foreign = manager.startExcavation('civ-b', first.id, 500);
    expect(foreign.success).toBe(false);

    const started = manager.startExcavation('civ-a', first.id, EXCAVATION_START_COST);
    expect(started.success).toBe(true);
    expect(started.site?.status).toBe('active');
    expect(manager.getState('civ-a').activeExcavationSiteId).toBe(first.id);

    const parallel = manager.startExcavation('civ-a', second.id, 500);
    expect(parallel.success).toBe(false);
    expect(parallel.reason).toContain('bereits eine Ausgrabung');

    const completed = manager.startExcavation('civ-a', 'unbekannt', 500);
    expect(completed.success).toBe(false);
  });

  it('4. Ausgrabungsfortschritt hängt von der Forschung ab und schließt mit Belohnung ab', () => {
    const galaxy = makeGalaxy('NARRATIVE-PROGRESS-04');
    const manager = new NarrativeManager();
    manager.generateSites(galaxy);
    const base = manager.getSites()[0];

    const site: ExcavationSite = {
      ...base,
      difficulty: 20,
      progress: 0,
      status: 'active',
      discoveredByCivId: 'civ-a',
      activeForCivId: 'civ-a',
      discoveredTurn: 2,
    };
    const state: NarrativeState = {
      civId: 'civ-a',
      flags: [],
      pendingEvent: null,
      eventHistory: [],
      nextEventTurn: 999,
      activeExcavationSiteId: site.id,
    };
    manager.loadState({ civStates: [state], sites: [site], crisis: dormantCrisis() }, galaxy);

    const first = manager.advanceTurn(3, [context({ researchPerTurn: 10 })]);
    expect(first.completions).toHaveLength(0);
    const afterFirst = manager.getSites().find((entry) => entry.id === site.id)!;
    // 5 Grundfortschritt + 1 aus 10 Forschung pro Runde.
    expect(afterFirst.progress).toBe(6);

    const second = manager.advanceTurn(4, [context({ researchPerTurn: 10 })]);
    expect(second.completions).toHaveLength(0);
    const secondProgress = manager.getSites().find((entry) => entry.id === site.id)!;
    expect(secondProgress.progress).toBe(12);

    manager.advanceTurn(5, [context({ researchPerTurn: 10 })]);
    const final = manager.advanceTurn(6, [context({ researchPerTurn: 10 })]);
    expect(final.completions).toHaveLength(1);
    expect(final.completions[0]).toMatchObject({
      civId: 'civ-a',
      credits: base.rewardCredits,
      research: base.rewardResearch,
    });

    const completed = manager.getSites().find((entry) => entry.id === site.id)!;
    expect(completed.status).toBe('completed');
    expect(completed.completedByCivId).toBe('civ-a');
    expect(completed.completedTurn).toBe(6);
    const civState = manager.getState('civ-a');
    expect(civState.activeExcavationSiteId).toBeNull();
    expect(civState.flags).toContain('excavation_completed');
    expect(manager.getOverview('civ-a', 6, 500, () => ({ planetName: 'P', systemName: 'S' })).completedSiteCount).toBe(1);
  });

  it('5. Ereignisauswahl ist deterministisch; nur das Spieler-Reich erhält Entscheidungen', () => {
    const galaxy = makeGalaxy('NARRATIVE-EVENTS-05');
    const first = new NarrativeManager();
    const second = new NarrativeManager();
    first.generateSites(galaxy);
    second.generateSites(galaxy);

    const a = first.advanceTurn(10, [context({ civId: 'civ-a' })]);
    const b = second.advanceTurn(10, [context({ civId: 'civ-a' })]);
    expect(a.newEvents).toHaveLength(1);
    expect(a.newEvents[0].event.id).toBe(b.newEvents[0].event.id);
    expect(first.getPendingEvent('civ-a')?.id).toBe(b.newEvents[0].event.id);

    const ai = new NarrativeManager();
    ai.generateSites(galaxy);
    const aiReport = ai.advanceTurn(10, [context({ civId: 'ai-a', isPlayer: false })]);
    expect(aiReport.newEvents).toHaveLength(0);
    expect(ai.getPendingEvent('ai-a')).toBeNull();
  });

  it('6. Entscheidungen setzen Flags und Effekte; unbekannte oder unbezahlbare Wahl bleibt offen', () => {
    const galaxy = makeGalaxy('NARRATIVE-CHOICES-06');
    const manager = new NarrativeManager();
    manager.generateSites(galaxy);

    const early = manager.advanceTurn(4, [context()]);
    expect(early.newEvents[0].event.id).toBe('silent_signal');

    const invalid = manager.resolveChoice('civ-a', 'nicht-vorhanden', 500);
    expect(invalid.success).toBe(false);
    expect(manager.getPendingEvent('civ-a')).not.toBeNull();

    const resolved = manager.resolveChoice('civ-a', 'decode', 500);
    expect(resolved.success).toBe(true);
    expect(resolved.effects).toMatchObject({ research: 80, flag: 'signal_analyzed' });
    expect(manager.getPendingEvent('civ-a')).toBeNull();
    const state = manager.getState('civ-a');
    expect(state.flags).toContain('signal_analyzed');
    expect(state.eventHistory).toHaveLength(1);
    expect(state.eventHistory[0]).toMatchObject({
      eventId: 'silent_signal',
      choiceId: 'decode',
      turn: 4,
    });

    // Teure Wahl: erst ablehnen, dann mit ausreichend Credits bestätigen.
    const loaded: NarrativeSaveState = {
      civStates: [
        {
          civId: 'civ-a',
          flags: [],
          pendingEvent: { eventId: 'miners_strike', turn: 8 },
          eventHistory: [],
          nextEventTurn: 14,
          activeExcavationSiteId: null,
        },
      ],
      sites: manager.getSites(),
      crisis: dormantCrisis(),
    };
    manager.loadState(loaded, galaxy);

    const tooPoor = manager.resolveChoice('civ-a', 'negotiate', 50);
    expect(tooPoor.success).toBe(false);
    expect(tooPoor.reason).toContain('120');
    expect(manager.getPendingEvent('civ-a')?.id).toBe('miners_strike');

    const paid = manager.resolveChoice('civ-a', 'negotiate', 200);
    expect(paid.success).toBe(true);
    expect(paid.effects).toMatchObject({ credits: -120, factionLoyalty: 5 });
    expect(manager.getState('civ-a').eventHistory[0].eventId).toBe('miners_strike');
  });

  it('7. Galaktische Krise startet erst spät, durchläuft vier Stufen und endet je nach Eindämmung', () => {
    const galaxy = makeGalaxy('NARRATIVE-CRISIS-07');
    const manager = new NarrativeManager();
    manager.generateSites(galaxy);

    const noColony = manager.advanceTurn(CRISIS_START_TURN, [context({ colonyCount: 0 })]);
    expect(noColony.crisisStarted).toBeNull();
    expect(manager.getCrisis().stage).toBe('dormant');

    const earlyContribution = manager.contributeToContainment('civ-a', 500);
    expect(earlyContribution.success).toBe(false);

    const started = manager.advanceTurn(CRISIS_START_TURN, [context()]);
    expect(started.crisisStarted).not.toBeNull();
    expect(manager.getCrisis()).toMatchObject({
      stage: 'signal',
      startedTurn: CRISIS_START_TURN,
      containment: 0,
      outcome: null,
    });

    const broke = manager.contributeToContainment('civ-a', CRISIS_CONTAINMENT_COST - 1);
    expect(broke.success).toBe(false);
    const firstContribution = manager.contributeToContainment('civ-a', 500);
    expect(firstContribution.success).toBe(true);
    expect(firstContribution.cost).toBe(CRISIS_CONTAINMENT_COST);
    expect(firstContribution.crisis?.containment).toBe(CRISIS_CONTAINMENT_GAIN);

    // Bis zur Schwelle einzäunen: drei Beiträge ergeben 60.
    while (manager.getCrisis().containment < CRISIS_CONTAINED_THRESHOLD) {
      expect(manager.contributeToContainment('civ-a', 500).success).toBe(true);
    }

    const awake = manager.advanceTurn(48, [context()]);
    expect(awake.crisisStageChanged?.crisis.stage).toBe('awakening');
    const resolution = manager.advanceTurn(56, [context()]);
    expect(resolution.crisisStageChanged?.crisis.stage).toBe('resolution');
    const resolved = manager.advanceTurn(64, [context()]);
    expect(resolved.crisisResolved).not.toBeNull();
    expect(manager.getCrisis().stage).toBe('resolved');
    expect(manager.getCrisis().outcome).toBe('contained');

    const after = manager.contributeToContainment('civ-a', 500);
    expect(after.success).toBe(false);
    expect(after.reason).toContain('abgeschlossen');
  });

  it('8. Krisenmodifikatoren sind vor dem Ausbruch neutral und verstärken sich stufenweise', () => {
    const galaxy = makeGalaxy('NARRATIVE-MODIFIERS-08');
    const manager = new NarrativeManager();
    manager.generateSites(galaxy);

    expect(manager.getCrisisModifiers()).toEqual({
      productionMultiplier: 1,
      researchMultiplier: 1,
      influenceMultiplier: 1,
      approvalModifier: 0,
    });

    const loaded: NarrativeSaveState = {
      civStates: [],
      sites: manager.getSites(),
      crisis: {
        stage: 'awakening',
        startedTurn: 40,
        stageTurn: 40,
        outcome: null,
        containment: 20,
      },
    };
    manager.loadState(loaded, galaxy);
    expect(manager.getCrisisModifiers()).toEqual({
      productionMultiplier: 0.95,
      researchMultiplier: 1.1,
      influenceMultiplier: 1,
      approvalModifier: -3,
    });

    manager.loadState(
      {
        ...loaded,
        crisis: { ...loaded.crisis!, stage: 'resolution', containment: 20 },
      },
      galaxy
    );
    expect(manager.getCrisisModifiers()).toEqual({
      productionMultiplier: 0.9,
      researchMultiplier: 1.15,
      influenceMultiplier: 1,
      approvalModifier: -5,
    });

    manager.loadState(
      {
        ...loaded,
        crisis: {
          stage: 'resolved',
          startedTurn: 40,
          stageTurn: 64,
          outcome: 'ignored',
          containment: 20,
        },
      },
      galaxy
    );
    expect(manager.getCrisisModifiers()).toEqual({
      productionMultiplier: 0.95,
      researchMultiplier: 1,
      influenceMultiplier: 1,
      approvalModifier: -3,
    });

    manager.loadState(
      {
        ...loaded,
        crisis: {
          stage: 'resolved',
          startedTurn: 40,
          stageTurn: 64,
          outcome: 'contained',
          containment: 60,
        },
      },
      galaxy
    );
    expect(manager.getCrisisModifiers()).toEqual({
      productionMultiplier: 1,
      researchMultiplier: 1.05,
      influenceMultiplier: 1,
      approvalModifier: 2,
    });
  });

  it('9. Speichern/Laden erhält Stätten, Ereignisse und Krise; alte Stände erzeugen neue Stätten', () => {
    const galaxy = makeGalaxy('NARRATIVE-SAVE-09');
    const manager = new NarrativeManager();
    manager.generateSites(galaxy);
    manager.advanceTurn(4, [context()]);
    manager.resolveChoice('civ-a', 'decode', 500);
    manager.discoverSite(manager.getSites()[0].planetId, 'civ-a', 6);

    const snapshot = manager.toSnapshot();
    const restored = new NarrativeManager();
    restored.loadState(JSON.parse(JSON.stringify(snapshot)) as NarrativeSaveState, galaxy);
    expect(restored.toSnapshot()).toEqual(snapshot);

    const legacy = new NarrativeManager();
    legacy.loadState(undefined, galaxy);
    expect(legacy.getSites().length).toBeGreaterThan(0);
    expect(legacy.getAllStates()).toHaveLength(0);
    expect(legacy.getPendingEvent('civ-a')).toBeNull();
    expect(legacy.getCrisis().stage).toBe('dormant');

    const sanitized = new NarrativeManager();
    sanitized.loadState(
      {
        civStates: [
          {
            civId: 'civ-a',
            flags: ['flag-a', 'flag-a', 7 as unknown as string],
            pendingEvent: { eventId: 'gibt-es-nicht', turn: 2 },
            eventHistory: [
              {
                eventId: 'gibt-es-nicht',
                title: 'Alt',
                choiceId: 'x',
                choiceLabel: 'X',
                turn: 1,
              },
            ],
            nextEventTurn: -5,
            activeExcavationSiteId: 'fehlt',
          },
        ],
        sites: [
          {
            id: 'site-1',
            planetId: 'planet-1',
            systemId: 'sys-1',
            name: '',
            difficulty: Number.NaN,
            progress: -10,
            status: 'kaputt' as unknown as ExcavationSite['status'],
            discoveredByCivId: null,
            activeForCivId: null,
            completedByCivId: null,
            discoveredTurn: null,
            completedTurn: null,
            rewardCredits: Number.NaN,
            rewardResearch: Number.NaN,
          },
        ],
        crisis: {
          stage: 'unbekannt' as unknown as CrisisStage,
          startedTurn: Number.NaN,
          stageTurn: Number.NaN,
          outcome: 'chaos' as unknown as CrisisOutcome,
          containment: -50,
        },
      },
      galaxy
    );
    const fallback = sanitized.getState('civ-a');
    expect(fallback.pendingEvent).toBeNull();
    expect(fallback.flags).toEqual(['flag-a']);
    expect(fallback.eventHistory).toHaveLength(0);
    expect(fallback.activeExcavationSiteId).toBeNull();
    const sanitizedSite = sanitized.getSites()[0];
    expect(sanitizedSite.status).toBe('undiscovered');
    expect(sanitizedSite.name).toBe('Unbekannte Stätte');
    expect(sanitizedSite.progress).toBe(0);
    expect(sanitizedSite.difficulty).toBe(80);
    expect(sanitized.getCrisis()).toMatchObject({
      stage: 'dormant',
      outcome: null,
      containment: 0,
    });
  });

  it('10. Engine: erster Zug neutral, Ereignisse ab Runde 4, Ausgrabung startet über die öffentliche API', () => {
    const engine = GameEngine.getInstance();
    const colony = foundPlayerColony(engine, 'NARRATIVE-ENGINE-10');
    const civ = engine.getPlayerCiv();

    const initial = engine.getNarrativeOverview(civ.id)!;
    expect(initial.pendingEvent).toBeNull();
    expect(initial.crisis.stage).toBe('dormant');
    expect(initial.sites).toHaveLength(0);
    expect(engine.getEmpireOverview(civ.id)!.modifiers).toEqual({
      productionMultiplier: 1,
      researchMultiplier: 1,
      influenceMultiplier: 1,
      approvalModifier: 0,
    });

    // Erster Zug bleibt ohne Ereignis; ab Runde 4 wird eines fällig.
    engine.endTurn();
    expect(engine.getNarrativeOverview(civ.id)!.pendingEvent).toBeNull();
    for (let i = 0; i < 4 && !engine.getNarrativeOverview(civ.id)!.pendingEvent; i += 1) {
      engine.endTurn();
    }

    const pending = engine.getNarrativeOverview(civ.id)!;
    expect(pending.pendingEvent?.id).toBe('silent_signal');
    expect(engine.getTurnState().currentTurn).toBeGreaterThanOrEqual(4);
    expect(colony.civId).toBe(civ.id);

    const resolved = engine.resolveNarrativeChoice(civ.id, 'decode');
    expect(resolved.success).toBe(true);
    expect(engine.getNarrativeOverview(civ.id)!.pendingEvent).toBeNull();
    expect(
      engine.getNarrativeManager().getState(civ.id).flags
    ).toContain('signal_analyzed');

    // Ausgrabungsstätte über die Engine aufdecken und starten.
    const site = firstAnalyzableSite(engine);
    engine.selectSystem(site.systemId);
    engine.surveySystem(site.systemId);
    expect(engine.surveyPlanet(site.planetId)).toBe(true);

    const afterDiscovery = engine.getNarrativeOverview(civ.id)!;
    const discovered = afterDiscovery.sites.find((entry) => entry.site.id === site.id);
    expect(discovered?.site.status).toBe('discovered');

    const treasuryBefore = engine.getPlayerCiv().treasury;
    const started = engine.startExcavation(civ.id, site.id);
    expect(started.success).toBe(true);
    expect(engine.getPlayerCiv().treasury).toBeCloseTo(
      treasuryBefore - EXCAVATION_START_COST,
      5
    );
    expect(engine.getNarrativeOverview(civ.id)!.activeSiteId).toBe(site.id);
  });

  it('11. Engine: narrative Daten überleben Speichern/Laden, alte Stände bleiben kompatibel', () => {
    const engine = GameEngine.getInstance();
    foundPlayerColony(engine, 'NARRATIVE-ENGINE-SAVE-11');
    const civ = engine.getPlayerCiv();

    const site = firstAnalyzableSite(engine);
    engine.selectSystem(site.systemId);
    engine.surveySystem(site.systemId);
    expect(engine.surveyPlanet(site.planetId)).toBe(true);
    expect(engine.startExcavation(civ.id, site.id).success).toBe(true);

    const payload = JSON.parse(JSON.stringify(engine.createSavePayload('Narrative')));
    expect(payload.version).toBe(5);
    expect(payload.narrative).toBeDefined();
    expect(payload.narrative.sites.length).toBeGreaterThan(0);
    expect(payload.narrative.civStates.length).toBeGreaterThan(0);

    expect(engine.restoreFromSaveData(JSON.parse(JSON.stringify(payload)))).toBe(true);
    const restored = engine.getNarrativeOverview(civ.id)!;
    expect(restored.activeSiteId).toBe(site.id);
    expect(restored.sites.some((entry) => entry.site.id === site.id)).toBe(true);

    delete payload.narrative;
    expect(engine.restoreFromSaveData(JSON.parse(JSON.stringify(payload)))).toBe(true);
    expect(engine.getNarrativeManager().getSites().length).toBeGreaterThan(0);
    expect(engine.getNarrativeOverview(civ.id)!.activeSiteId).toBeNull();
    expect(engine.getNarrativeOverview(civ.id)!.crisis.stage).toBe('dormant');
  });

  it('12. Meldungsbrücke: Ereignisse, Ausgrabungen und Krisenstufen werden zentral gemeldet', () => {
    const center = new NotificationCenter();
    const detach = attachNotificationBridge(center, EventBus.getInstance(), {
      playerCivId: 'civ-player',
      currentTurn: () => 7,
      resolvePlanetName: () => 'Kepler-9b',
      resolveSystemName: () => 'Kepler-9',
    });
    cleanups.push(detach);

    const bus = EventBus.getInstance();
    const site: ExcavationSite = {
      id: 'site-a',
      planetId: 'planet-a',
      systemId: 'sys-a',
      name: 'Tempel der Ersten',
      difficulty: 80,
      progress: 0,
      status: 'active',
      discoveredByCivId: 'civ-player',
      activeForCivId: 'civ-player',
      completedByCivId: null,
      discoveredTurn: 3,
      completedTurn: null,
      rewardCredits: 120,
      rewardResearch: 60,
    };

    bus.emit('narrative:excavation-discovered', {
      site: { ...site, status: 'discovered' },
      planetName: 'Kepler-9b',
      systemName: 'Kepler-9',
      turn: 7,
    });
    expect(
      center.getItems().some((item) => item.key === 'excavation-discovered:site-a')
    ).toBe(true);

    bus.emit('narrative:excavation-completed', {
      site: { ...site, status: 'completed', completedByCivId: 'civ-player' },
      planetName: 'Kepler-9b',
      systemName: 'Kepler-9',
      credits: 120,
      research: 60,
      turn: 8,
    });
    expect(
      center.getItems().some((item) => item.key === 'excavation-completed:site-a:8')
    ).toBe(true);

    bus.emit('narrative:event-pending', {
      civId: 'civ-player',
      eventId: 'silent_signal',
      title: 'Das stille Signal',
      turn: 7,
    });
    const pending = center.getItems().find((item) => item.key === 'narrative-event:civ-player');
    expect(pending).toBeDefined();
    expect(pending!.category).toBe('warning');
    expect(pending!.message).toContain('Das stille Signal');

    bus.emit('narrative:event-resolved', {
      civId: 'civ-player',
      eventId: 'silent_signal',
      title: 'Das stille Signal',
      choiceLabel: 'Signal entschlüsseln',
      turn: 8,
    });
    expect(
      center.getItems().some((item) => item.key === 'narrative-event:civ-player')
    ).toBe(false);

    bus.emit('narrative:crisis-started', { stage: 'signal', turn: 40 });
    expect(center.getItems().filter((item) => item.key === 'narrative-crisis:active')).toHaveLength(1);
    bus.emit('narrative:crisis-stage', {
      previousStage: 'signal',
      stage: 'awakening',
      turn: 48,
    });
    expect(center.getItems().filter((item) => item.key === 'narrative-crisis:active')).toHaveLength(1);

    bus.emit('narrative:crisis-contained', { containment: 20, cost: 150, turn: 49 });
    expect(
      center.getItems().some((item) => item.message.includes('20 / 100'))
    ).toBe(true);

    bus.emit('narrative:crisis-resolved', { outcome: 'contained', turn: 64 });
    expect(
      center.getItems().some((item) => item.key === 'narrative-crisis:active')
    ).toBe(false);
    expect(
      center.getItems().some((item) => item.key === 'narrative-crisis-resolved:contained')
    ).toBe(true);

    // KI-Ereignisse bleiben aus der Spielermeldung heraus.
    const before = center.getItems().length;
    bus.emit('narrative:event-pending', {
      civId: 'civ-ai',
      eventId: 'silent_signal',
      title: 'Das stille Signal',
      turn: 7,
    });
    expect(center.getItems()).toHaveLength(before);
  });

  it('13. Engine: Krisenmodifikatoren werden mit den Reichsmodifikatoren kombiniert', () => {
    const engine = GameEngine.getInstance();
    foundPlayerColony(engine, 'NARRATIVE-ENGINE-CRISIS-13');
    const civ = engine.getPlayerCiv();

    engine.getNarrativeManager().loadState(
      {
        civStates: [],
        sites: engine.getNarrativeManager().getSites(),
        crisis: {
          stage: 'signal',
          startedTurn: 40,
          stageTurn: 40,
          outcome: null,
          containment: 0,
        },
      },
      engine.getGalaxy()
    );

    const overview = engine.getEmpireOverview(civ.id)!;
    expect(overview.modifiers.researchMultiplier).toBeCloseTo(1.05, 5);
    expect(overview.modifiers.productionMultiplier).toBe(1);
    expect(overview.modifiers.approvalModifier).toBe(-1);

    const turnReport = engine.getNarrativeManager().advanceTurn(48, [
      {
        civId: civ.id,
        isPlayer: true,
        colonyCount: 1,
        treasury: civ.treasury,
        warCount: 0,
        researchPerTurn: 0,
      },
    ]);
    expect(turnReport.crisisStageChanged?.crisis.stage).toBe('awakening');
    const later = engine.getEmpireOverview(civ.id)!;
    expect(later.modifiers.productionMultiplier).toBeCloseTo(0.95, 5);
    expect(later.modifiers.researchMultiplier).toBeCloseTo(1.1, 5);
    expect(later.modifiers.approvalModifier).toBe(-3);
  });
});
