/**
 * Astraea 4X - Narrative Ebene & Galaxiegeschichte (Phase 5)
 *
 * Drei Bausteine teilen sich diesen zustandsarmen Kern:
 *  - dynamische Ereignisse mit Entscheidungen und dauerhaften Flags,
 *  - Ausgrabungsstätten auf Planeten mit fortschreitender Grabung,
 *  - eine spät einsetzende galaktische Krise mit Eindämmung und Ausgang.
 *
 * Der Manager kennt weder React noch den EventBus. Alle Effekte werden als
 * Ergebnis zurückgegeben und von der GameEngine auf Staatskasse, Forschung und
 * Fraktionsloyalität angewendet. Auswahl und Fortschritt sind deterministisch
 * aus Galaxie-Seed, Reich und Runde abgeleitet.
 */

import { NARRATIVE_EVENTS, NARRATIVE_EVENT_MAP } from '../data/narrativeEvents.ts';
import { SeededPRNG } from '../generation/prng.ts';
import {
  EmpireModifiers,
  ExcavationSite,
  ExcavationSiteView,
  GalacticCrisisState,
  Galaxy,
  NarrativeChoiceDefinition,
  NarrativeChoiceEffect,
  NarrativeEventDefinition,
  NarrativeEventRecord,
  NarrativeOverview,
  NarrativeSaveState,
  NarrativeState,
  Planet,
  StarSystem,
} from './types.ts';

export const MAX_EXCAVATION_SITES = 12;
export const EXCAVATION_START_COST = 75;
export const EXCAVATION_BASE_PROGRESS = 5;
export const EXCAVATION_RESEARCH_DIVISOR = 10;
export const EXCAVATION_MAX_PROGRESS_PER_TURN = 25;
export const FIRST_EVENT_TURN = 4;
export const EVENT_INTERVAL_TURNS = 6;
export const EVENT_HISTORY_LIMIT = 40;
export const CRISIS_START_TURN = 40;
export const CRISIS_STAGE_INTERVAL_TURNS = 8;
export const CRISIS_CONTAINMENT_COST = 150;
export const CRISIS_CONTAINMENT_GAIN = 20;
export const CRISIS_CONTAINED_THRESHOLD = 60;

const EXCAVATION_NAMES = [
  'Versunkener Vorläuferkomplex',
  'Kristalliner Archivschacht',
  'Verlassene Beobachtungsstation',
  'Uralte Biosphärenkuppel',
  'Fragment einer Sternenkarte',
  'Tempel der Ersten',
  'Tiefenbohrung X-7',
  'Schiffsfriedhof der Nomaden',
  'Echo der Großen Stille',
  'Grabungsstätte der Erbauer',
  'Zerbrochene Wächterstatue',
  'Das schweigende Observatorium',
] as const;

export interface NarrativeCivContext {
  civId: string;
  isPlayer: boolean;
  colonyCount: number;
  treasury: number;
  warCount: number;
  researchPerTurn: number;
}

export interface ExcavationCompletion {
  civId: string;
  site: ExcavationSite;
  credits: number;
  research: number;
}

export interface NarrativeTurnReport {
  completions: ExcavationCompletion[];
  newEvents: Array<{ civId: string; event: NarrativeEventDefinition }>;
  crisisStarted: GalacticCrisisState | null;
  crisisStageChanged: { previousStage: GalacticCrisisState['stage']; crisis: GalacticCrisisState } | null;
  crisisResolved: GalacticCrisisState | null;
}

export interface NarrativeActionResult {
  success: boolean;
  reason?: string;
  site?: ExcavationSite;
}

export interface NarrativeChoiceResult {
  success: boolean;
  reason?: string;
  event?: NarrativeEventDefinition;
  choice?: NarrativeChoiceDefinition;
  effects?: NarrativeChoiceEffect;
  state?: NarrativeState;
}

export interface CrisisContributionResult {
  success: boolean;
  reason?: string;
  cost?: number;
  crisis?: GalacticCrisisState;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const round = (value: number): number => Math.round(value);

function createDormantCrisis(): GalacticCrisisState {
  return {
    stage: 'dormant',
    startedTurn: null,
    stageTurn: null,
    outcome: null,
    containment: 0,
  };
}

function createNarrativeState(civId: string): NarrativeState {
  return {
    civId,
    flags: [],
    pendingEvent: null,
    eventHistory: [],
    nextEventTurn: FIRST_EVENT_TURN,
    activeExcavationSiteId: null,
  };
}

function cloneSite(site: ExcavationSite): ExcavationSite {
  return { ...site };
}

function cloneState(state: NarrativeState): NarrativeState {
  return {
    civId: state.civId,
    flags: [...state.flags],
    pendingEvent: state.pendingEvent ? { ...state.pendingEvent } : null,
    eventHistory: state.eventHistory.map((record) => ({ ...record })),
    nextEventTurn: state.nextEventTurn,
    activeExcavationSiteId: state.activeExcavationSiteId,
  };
}

function cloneCrisis(crisis: GalacticCrisisState): GalacticCrisisState {
  return { ...crisis };
}

function isExcavationStatus(value: unknown): value is ExcavationSite['status'] {
  return (
    value === 'undiscovered' ||
    value === 'discovered' ||
    value === 'active' ||
    value === 'completed'
  );
}

function isCrisisStage(value: unknown): value is GalacticCrisisState['stage'] {
  return (
    value === 'dormant' ||
    value === 'signal' ||
    value === 'awakening' ||
    value === 'resolution' ||
    value === 'resolved'
  );
}

function isCrisisOutcome(value: unknown): value is GalacticCrisisState['outcome'] {
  return value === 'contained' || value === 'embraced' || value === 'ignored' || value === null;
}

function hasFlag(state: NarrativeState, flag: string): boolean {
  return state.flags.includes(flag);
}

/**
 * Erzeugt die Ausgrabungsstätten einer Galaxie. Bevorzugt Planeten mit
 * sichtbarer Anomalie; reichen diese nicht, werden weitere Planeten
 * deterministisch aufgefüllt. Die Auswahl ist unabhängig von der Reihenfolge
 * der Systeme im Speicher.
 */
export function generateExcavationSites(galaxy: Galaxy): ExcavationSite[] {
  const anomalous: Array<{ planet: Planet; system: StarSystem }> = [];
  const fallback: Array<{ planet: Planet; system: StarSystem }> = [];

  const systems = [...galaxy.systems].sort((left, right) => left.id.localeCompare(right.id));
  for (const system of systems) {
    const planets = [...(system.planets ?? [])].sort(
      (left, right) => left.orbitIndex - right.orbitIndex || left.id.localeCompare(right.id)
    );
    for (const planet of planets) {
      const entry = { planet, system };
      if (planet.anomalyDetected) {
        anomalous.push(entry);
      } else if (planet.planetType !== 'gas_giant') {
        fallback.push(entry);
      }
    }
  }

  const shuffle = <T,>(items: T[], rng: SeededPRNG): T[] => {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = rng.nextInt(0, i);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };

  const rng = new SeededPRNG(`${galaxy.seed}:excavation-sites`);
  const shuffled = shuffle(anomalous, rng);
  if (shuffled.length < 3) {
    shuffled.push(...shuffle(fallback, rng).slice(0, 3 - shuffled.length));
  }

  return shuffled
    .slice(0, MAX_EXCAVATION_SITES)
    .map(({ planet, system }) => {
      const siteRng = new SeededPRNG(`${galaxy.seed}:${planet.id}:excavation`);
      return {
        id: `excavation-${planet.id}`,
        planetId: planet.id,
        systemId: system.id,
        name: siteRng.pick(EXCAVATION_NAMES),
        difficulty: 60 + siteRng.nextInt(0, 4) * 20,
        progress: 0,
        status: 'undiscovered' as const,
        discoveredByCivId: null,
        activeForCivId: null,
        completedByCivId: null,
        discoveredTurn: null,
        completedTurn: null,
        rewardCredits: 80 + siteRng.nextInt(0, 8) * 20,
        rewardResearch: 40 + siteRng.nextInt(0, 8) * 20,
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

export class NarrativeManager {
  private states: Map<string, NarrativeState> = new Map();
  private sites: ExcavationSite[] = [];
  private crisis: GalacticCrisisState = createDormantCrisis();
  private galaxySeed = '';

  public reset(): void {
    this.states.clear();
    this.sites = [];
    this.crisis = createDormantCrisis();
    this.galaxySeed = '';
  }

  public generateSites(galaxy: Galaxy): void {
    this.galaxySeed = galaxy.seed;
    this.sites = generateExcavationSites(galaxy);
  }

  public ensureState(civId: string): NarrativeState {
    const existing = this.states.get(civId);
    if (existing) return existing;
    const created = createNarrativeState(civId);
    this.states.set(civId, created);
    return created;
  }

  public getState(civId: string): NarrativeState {
    return cloneState(this.ensureState(civId));
  }

  public getAllStates(): NarrativeState[] {
    return Array.from(this.states.values())
      .map(cloneState)
      .sort((left, right) => left.civId.localeCompare(right.civId));
  }

  public getSites(): ExcavationSite[] {
    return this.sites.map(cloneSite);
  }

  public getSitesForCiv(civId: string): ExcavationSite[] {
    return this.sites
      .filter(
        (site) =>
          site.discoveredByCivId === civId ||
          site.activeForCivId === civId ||
          site.completedByCivId === civId
      )
      .map(cloneSite);
  }

  public getCrisis(): GalacticCrisisState {
    return cloneCrisis(this.crisis);
  }

  public getPendingEvent(civId: string): NarrativeEventDefinition | null {
    const pending = this.ensureState(civId).pendingEvent;
    if (!pending) return null;
    return NARRATIVE_EVENT_MAP[pending.eventId] ?? null;
  }

  public getOverview(
    civId: string,
    currentTurn: number,
    treasury: number,
    resolveLocation: (site: ExcavationSite) => { planetName: string; systemName: string }
  ): NarrativeOverview {
    const state = this.ensureState(civId);
    const order: Record<ExcavationSite['status'], number> = {
      active: 0,
      discovered: 1,
      completed: 2,
      undiscovered: 3,
    };
    const sites: ExcavationSiteView[] = this.getSitesForCiv(civId)
      .sort((left, right) => order[left.status] - order[right.status] || left.id.localeCompare(right.id))
      .map((site) => ({
        site,
        ...resolveLocation(site),
      }));

    return {
      civId,
      currentTurn,
      treasury,
      sites,
      activeSiteId: state.activeExcavationSiteId,
      pendingEvent: this.getPendingEvent(civId),
      eventHistory: state.eventHistory.map((record) => ({ ...record })),
      crisis: cloneCrisis(this.crisis),
      completedSiteCount: this.sites.filter((site) => site.completedByCivId === civId).length,
      excavationCost: EXCAVATION_START_COST,
      crisisContainmentCost: CRISIS_CONTAINMENT_COST,
    };
  }

  /**
   * Deckt eine Stätte nach vollständiger Planetenanalyse auf. Wiederholtes
   * Aufdecken ist idempotent.
   */
  public discoverSite(planetId: string, civId: string, turn: number): ExcavationSite | null {
    const site = this.sites.find((entry) => entry.planetId === planetId);
    if (!site || site.status !== 'undiscovered') return null;
    site.status = 'discovered';
    site.discoveredByCivId = civId;
    site.discoveredTurn = turn;
    return cloneSite(site);
  }

  public startExcavation(civId: string, siteId: string, availableCredits: number): NarrativeActionResult {
    const state = this.ensureState(civId);
    const site = this.sites.find((entry) => entry.id === siteId);
    if (!site) return { success: false, reason: 'Ausgrabungsstätte nicht gefunden.' };
    if (site.status === 'completed') {
      return { success: false, reason: 'Diese Stätte ist bereits ausgegraben.' };
    }
    if (site.status !== 'discovered') {
      return { success: false, reason: 'Die Stätte muss zuerst entdeckt werden.' };
    }
    if (site.discoveredByCivId !== civId) {
      return { success: false, reason: 'Diese Stätte gehört zu einem anderen Reich.' };
    }
    if (state.activeExcavationSiteId) {
      return {
        success: false,
        reason: 'Es läuft bereits eine Ausgrabung. Schließe sie zuerst ab.',
      };
    }
    if (availableCredits < EXCAVATION_START_COST) {
      return {
        success: false,
        reason: `Nicht genügend Credits (${EXCAVATION_START_COST} ◈ erforderlich).`,
      };
    }

    site.status = 'active';
    site.activeForCivId = civId;
    state.activeExcavationSiteId = site.id;
    return { success: true, site: cloneSite(site) };
  }

  /**
   * Bewertet pro Runde Ausgrabungen, dynamische Ereignisse und die Krise.
   * Ereignisse entstehen nur für das Spieler-Reich; KI-Reiche erhalten keine
   * Entscheidungsfenster, werden aber von der globalen Krise erfasst.
   */
  public advanceTurn(currentTurn: number, civContexts: NarrativeCivContext[]): NarrativeTurnReport {
    const report: NarrativeTurnReport = {
      completions: [],
      newEvents: [],
      crisisStarted: null,
      crisisStageChanged: null,
      crisisResolved: null,
    };

    const contexts = [...civContexts].sort((left, right) => left.civId.localeCompare(right.civId));
    for (const context of contexts) {
      const state = this.ensureState(context.civId);
      this.advanceExcavation(context, state, currentTurn, report);
      if (context.isPlayer) {
        this.maybeCreateEvent(context, state, currentTurn, report);
      }
    }

    const completedSites = this.sites.filter((site) => site.status === 'completed').length;
    const playerContext = contexts.find((context) => context.isPlayer) ?? null;
    this.advanceCrisis(currentTurn, completedSites, playerContext, report);
    return report;
  }

  private advanceExcavation(
    context: NarrativeCivContext,
    state: NarrativeState,
    currentTurn: number,
    report: NarrativeTurnReport
  ): void {
    if (!state.activeExcavationSiteId) return;
    const site = this.sites.find((entry) => entry.id === state.activeExcavationSiteId);
    if (!site || site.status !== 'active' || site.activeForCivId !== context.civId) {
      state.activeExcavationSiteId = null;
      return;
    }

    const effort = clamp(
      EXCAVATION_BASE_PROGRESS + Math.floor(Math.max(0, context.researchPerTurn) / EXCAVATION_RESEARCH_DIVISOR),
      EXCAVATION_BASE_PROGRESS,
      EXCAVATION_MAX_PROGRESS_PER_TURN
    );
    site.progress = round(Math.min(site.difficulty, site.progress + effort));

    if (site.progress < site.difficulty) return;

    site.status = 'completed';
    site.completedByCivId = context.civId;
    site.completedTurn = currentTurn;
    state.activeExcavationSiteId = null;
    if (!hasFlag(state, 'excavation_completed')) {
      state.flags.push('excavation_completed');
    }
    report.completions.push({
      civId: context.civId,
      site: cloneSite(site),
      credits: site.rewardCredits,
      research: site.rewardResearch,
    });
  }

  private maybeCreateEvent(
    context: NarrativeCivContext,
    state: NarrativeState,
    currentTurn: number,
    report: NarrativeTurnReport
  ): void {
    if (state.pendingEvent) return;
    if (currentTurn < state.nextEventTurn) return;

    const event = this.pickEvent(state, context, currentTurn);
    if (event) {
      state.pendingEvent = { eventId: event.id, turn: currentTurn };
      report.newEvents.push({ civId: context.civId, event });
    }
    state.nextEventTurn = currentTurn + EVENT_INTERVAL_TURNS;
  }

  private pickEvent(
    state: NarrativeState,
    context: NarrativeCivContext,
    currentTurn: number
  ): NarrativeEventDefinition | null {
    const eligible = NARRATIVE_EVENTS.filter((event) => {
      if (currentTurn < event.minTurn) return false;
      if (event.once && state.eventHistory.some((record) => record.eventId === event.id)) return false;
      if (event.requiresFlags?.some((flag) => !hasFlag(state, flag))) return false;
      if (event.forbidsFlags?.some((flag) => hasFlag(state, flag))) return false;
      return true;
    });
    if (eligible.length === 0) return null;

    const rng = new SeededPRNG(`${this.galaxySeed}:narrative:${context.civId}:${currentTurn}`);
    return rng.pickWeighted(eligible.map((event) => ({ item: event, weight: event.weight })));
  }

  /**
   * Löst das offene Ereignis. Negative Credits werden vor dem Verbrauch gegen
   * die Staatskasse geprüft; erst danach wird das Ereignis als entschieden
   * gespeichert.
   */
  public resolveChoice(civId: string, choiceId: string, availableCredits: number): NarrativeChoiceResult {
    const state = this.ensureState(civId);
    if (!state.pendingEvent) {
      return { success: false, reason: 'Es liegt kein offenes Ereignis vor.' };
    }
    const event = NARRATIVE_EVENT_MAP[state.pendingEvent.eventId];
    if (!event) {
      state.pendingEvent = null;
      return { success: false, reason: 'Das Ereignis ist nicht mehr verfügbar.' };
    }
    const choice = event.choices.find((entry) => entry.id === choiceId);
    if (!choice) {
      return { success: false, reason: 'Diese Entscheidung ist nicht verfügbar.' };
    }
    const cost = Math.max(0, -(choice.effect.credits ?? 0));
    if (cost > availableCredits) {
      return {
        success: false,
        reason: `Nicht genügend Credits (${cost} ◈ erforderlich).`,
      };
    }

    const record: NarrativeEventRecord = {
      eventId: event.id,
      title: event.title,
      choiceId: choice.id,
      choiceLabel: choice.label,
      turn: state.pendingEvent.turn,
    };
    state.eventHistory = [...state.eventHistory, record].slice(-EVENT_HISTORY_LIMIT);
    state.pendingEvent = null;
    state.nextEventTurn = Math.max(
      state.nextEventTurn,
      currentTurnForRecord(state, record) + EVENT_INTERVAL_TURNS
    );
    if (choice.effect.flag && !hasFlag(state, choice.effect.flag)) {
      state.flags.push(choice.effect.flag);
    }

    return {
      success: true,
      event,
      choice,
      effects: { ...choice.effect },
      state: cloneState(state),
    };
  }

  public contributeToContainment(
    civId: string,
    availableCredits: number
  ): CrisisContributionResult {
    this.ensureState(civId);
    if (this.crisis.stage === 'dormant') {
      return { success: false, reason: 'Es gibt derzeit keine galaktische Krise.' };
    }
    if (this.crisis.stage === 'resolved') {
      return { success: false, reason: 'Die Krise ist bereits abgeschlossen.' };
    }
    if (availableCredits < CRISIS_CONTAINMENT_COST) {
      return {
        success: false,
        reason: `Nicht genügend Credits (${CRISIS_CONTAINMENT_COST} ◈ erforderlich).`,
      };
    }

    this.crisis.containment = clamp(
      this.crisis.containment + CRISIS_CONTAINMENT_GAIN,
      0,
      100
    );
    return {
      success: true,
      cost: CRISIS_CONTAINMENT_COST,
      crisis: cloneCrisis(this.crisis),
    };
  }

  private advanceCrisis(
    currentTurn: number,
    completedSites: number,
    playerContext: NarrativeCivContext | null,
    report: NarrativeTurnReport
  ): void {
    if (this.crisis.stage === 'dormant') {
      const triggeredByTurn = currentTurn >= CRISIS_START_TURN;
      const triggeredByExcavation = completedSites >= 2;
      if (
        (triggeredByTurn || triggeredByExcavation) &&
        playerContext &&
        playerContext.colonyCount > 0
      ) {
        this.crisis = {
          stage: 'signal',
          startedTurn: currentTurn,
          stageTurn: currentTurn,
          outcome: null,
          containment: 0,
        };
        report.crisisStarted = cloneCrisis(this.crisis);
      }
      return;
    }

    if (this.crisis.stage === 'resolved') return;
    if (this.crisis.stageTurn === null) {
      this.crisis.stageTurn = currentTurn;
      return;
    }
    if (currentTurn - this.crisis.stageTurn < CRISIS_STAGE_INTERVAL_TURNS) return;

    const previousStage = this.crisis.stage;
    if (previousStage === 'signal') {
      this.crisis.stage = 'awakening';
    } else if (previousStage === 'awakening') {
      this.crisis.stage = 'resolution';
    } else {
      this.crisis.stage = 'resolved';
      this.crisis.outcome =
        this.crisis.containment >= CRISIS_CONTAINED_THRESHOLD ? 'contained' : 'ignored';
      this.crisis.stageTurn = currentTurn;
      report.crisisResolved = cloneCrisis(this.crisis);
      return;
    }

    this.crisis.stageTurn = currentTurn;
    report.crisisStageChanged = { previousStage, crisis: cloneCrisis(this.crisis) };
  }

  /**
   * Wirtschaftliche Wirkung der Krise. Vor dem Ausbruch und nach einer
   * erfolgreichen Eindämmung bleibt das Reich nahe am Normalzustand.
   */
  public getCrisisModifiers(): EmpireModifiers {
    const neutral: EmpireModifiers = {
      productionMultiplier: 1,
      researchMultiplier: 1,
      influenceMultiplier: 1,
      approvalModifier: 0,
    };

    if (this.crisis.stage === 'dormant') return neutral;

    if (this.crisis.stage === 'resolved') {
      if (this.crisis.outcome === 'contained') {
        return { ...neutral, researchMultiplier: 1.05, approvalModifier: 2 };
      }
      if (this.crisis.outcome === 'embraced') {
        return { ...neutral, researchMultiplier: 1.1, approvalModifier: -1 };
      }
      return { ...neutral, productionMultiplier: 0.95, approvalModifier: -3 };
    }

    if (this.crisis.stage === 'signal') {
      return { ...neutral, researchMultiplier: 1.05, approvalModifier: -1 };
    }
    if (this.crisis.stage === 'awakening') {
      return {
        ...neutral,
        productionMultiplier: 0.95,
        researchMultiplier: 1.1,
        approvalModifier: -3,
      };
    }
    return {
      ...neutral,
      productionMultiplier: 0.9,
      researchMultiplier: 1.15,
      approvalModifier: -5,
    };
  }

  public loadState(narrative: NarrativeSaveState | undefined, galaxy: Galaxy): void {
    this.reset();
    this.galaxySeed = galaxy.seed;

    const savedSites = narrative?.sites;
    if (savedSites && savedSites.length > 0) {
      const seen = new Set<string>();
      for (const raw of savedSites) {
        if (!raw || typeof raw.id !== 'string' || typeof raw.planetId !== 'string') continue;
        if (!raw.systemId || seen.has(raw.id)) continue;
        seen.add(raw.id);
        this.sites.push({
          id: raw.id,
          planetId: raw.planetId,
          systemId: raw.systemId,
          name: typeof raw.name === 'string' && raw.name ? raw.name : 'Unbekannte Stätte',
          difficulty: clamp(Number.isFinite(raw.difficulty) ? raw.difficulty : 80, 20, 500),
          progress: clamp(Number.isFinite(raw.progress) ? raw.progress : 0, 0, 500),
          status: isExcavationStatus(raw.status) ? raw.status : 'undiscovered',
          discoveredByCivId:
            typeof raw.discoveredByCivId === 'string' ? raw.discoveredByCivId : null,
          activeForCivId: typeof raw.activeForCivId === 'string' ? raw.activeForCivId : null,
          completedByCivId:
            typeof raw.completedByCivId === 'string' ? raw.completedByCivId : null,
          discoveredTurn: Number.isFinite(raw.discoveredTurn) ? raw.discoveredTurn! : null,
          completedTurn: Number.isFinite(raw.completedTurn) ? raw.completedTurn! : null,
          rewardCredits: clamp(Number.isFinite(raw.rewardCredits) ? raw.rewardCredits : 100, 0, 10000),
          rewardResearch: clamp(Number.isFinite(raw.rewardResearch) ? raw.rewardResearch : 40, 0, 10000),
        });
      }
      this.sites.sort((left, right) => left.id.localeCompare(right.id));
    } else {
      this.generateSites(galaxy);
    }

    for (const raw of narrative?.civStates ?? []) {
      if (!raw || typeof raw.civId !== 'string' || raw.civId.length === 0) continue;
      const fallback = createNarrativeState(raw.civId);
      const history: NarrativeEventRecord[] = [];
      for (const record of raw.eventHistory ?? []) {
        if (!record || typeof record.eventId !== 'string') continue;
        if (!NARRATIVE_EVENT_MAP[record.eventId]) continue;
        history.push({
          eventId: record.eventId,
          title: typeof record.title === 'string' ? record.title : record.eventId,
          choiceId: typeof record.choiceId === 'string' ? record.choiceId : 'unknown',
          choiceLabel: typeof record.choiceLabel === 'string' ? record.choiceLabel : 'Entschieden',
          turn: Number.isFinite(record.turn) ? record.turn : 0,
        });
      }
      const pendingEvent =
        raw.pendingEvent &&
        typeof raw.pendingEvent.eventId === 'string' &&
        NARRATIVE_EVENT_MAP[raw.pendingEvent.eventId]
          ? {
              eventId: raw.pendingEvent.eventId,
              turn: Number.isFinite(raw.pendingEvent.turn) ? raw.pendingEvent.turn : 0,
            }
          : null;
      this.states.set(raw.civId, {
        civId: raw.civId,
        flags: Array.from(new Set((raw.flags ?? []).filter((flag) => typeof flag === 'string'))),
        pendingEvent,
        eventHistory: history.slice(-EVENT_HISTORY_LIMIT),
        nextEventTurn:
          Number.isFinite(raw.nextEventTurn) && raw.nextEventTurn > 0
            ? Math.floor(raw.nextEventTurn)
            : fallback.nextEventTurn,
        activeExcavationSiteId:
          typeof raw.activeExcavationSiteId === 'string' &&
          this.sites.some(
            (site) =>
              site.id === raw.activeExcavationSiteId &&
              site.status === 'active' &&
              site.activeForCivId === raw.civId
          )
            ? raw.activeExcavationSiteId
            : null,
      });
    }

    const savedCrisis = narrative?.crisis;
    if (savedCrisis) {
      this.crisis = {
        stage: isCrisisStage(savedCrisis.stage) ? savedCrisis.stage : 'dormant',
        startedTurn: Number.isFinite(savedCrisis.startedTurn) ? savedCrisis.startedTurn! : null,
        stageTurn: Number.isFinite(savedCrisis.stageTurn) ? savedCrisis.stageTurn! : null,
        outcome: isCrisisOutcome(savedCrisis.outcome) ? savedCrisis.outcome : null,
        containment: clamp(
          Number.isFinite(savedCrisis.containment) ? savedCrisis.containment : 0,
          0,
          100
        ),
      };
    }
  }

  public toSnapshot(): NarrativeSaveState {
    return {
      civStates: this.getAllStates(),
      sites: this.getSites(),
      crisis: this.getCrisis(),
    };
  }
}

function currentTurnForRecord(state: NarrativeState, record: NarrativeEventRecord): number {
  // Das Ereignis wurde in der Runde erzeugt, in der es offen wurde. Der
  // nächste Termin liegt bewusst relativ zu dieser Runde.
  return record.turn > 0 ? record.turn : state.nextEventTurn;
}
