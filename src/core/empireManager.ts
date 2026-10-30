/**
 * Astraea 4X - Reichsverwaltung & innere Fraktionen
 *
 * Ergänzt die äußere Diplomatie um eine innenpolitische Ebene. Jedes Reich
 * besitzt drei Fraktionen (Industrie, Wissenschaft, Militär), deren Einfluss
 * und Loyalität sich deterministisch aus Wirtschaft, Forschung, Flotte,
 * Steuern, Handel und Verwaltungslast ergeben. Eine Governance-Politik
 * verschiebt die Fraktionsstimmung und wirkt über Modifikatoren auf die
 * Kolonieökonomie.
 *
 * Das Modul ist React-frei und zustandsarm genug für Tests: Alle Kennzahlen
 * werden aus einem Snapshot berechnet; nur Politik, Einfluss, Loyalität und
 * der Cooldown werden gespeichert.
 */

import {
  Colony,
  EmpireModifiers,
  EmpirePolicy,
  EmpireState,
  FactionId,
  FactionState,
} from './types.ts';

export interface FactionDefinition {
  id: FactionId;
  name: string;
  icon: string;
  description: string;
  favoredPolicy: EmpirePolicy;
}

export interface EmpirePolicyDefinition {
  id: EmpirePolicy;
  name: string;
  description: string;
  productionMultiplier: number;
  researchMultiplier: number;
  influenceMultiplier: number;
  approvalModifier: number;
}

export interface EmpireSnapshot {
  civId: string;
  isPlayer: boolean;
  colonyCount: number;
  /** Gewichtete Verwaltungslast der Kolonien (Außenposten 1, Siedlung 2, Kolonie 3). */
  colonyLoad: number;
  districtCount: number;
  totalPopulation: number;
  productionPerPop: number;
  researchPerPop: number;
  averageTaxRate: number;
  fleetStrength: number;
  warCount: number;
  tradeRouteCount: number;
  completedTechCount: number;
  treasury: number;
}

export interface EmpireAdministration {
  capacity: number;
  load: number;
  overextension: number;
  efficiency: number;
}

export interface FactionUnrestReport {
  civId: string;
  factionId: FactionId;
  factionName: string;
  loyalty: number;
}

export interface EmpirePolicyChangeReport {
  civId: string;
  previousPolicy: EmpirePolicy;
  policy: EmpirePolicy;
}

export interface EmpireTurnReport {
  states: EmpireState[];
  policyChanges: EmpirePolicyChangeReport[];
  unrest: FactionUnrestReport[];
  recovered: FactionUnrestReport[];
}

export interface EmpireOverview {
  civId: string;
  civName: string;
  treasury: number;
  colonyCount: number;
  warCount: number;
  currentTurn: number;
  state: EmpireState;
  administration: EmpireAdministration;
  modifiers: EmpireModifiers;
  dominantFactionId: FactionId;
}

export interface EmpirePolicyResult {
  success: boolean;
  reason?: string;
  policy?: EmpirePolicy;
  previousPolicy?: EmpirePolicy;
  availableTurn?: number;
  state?: EmpireState;
}

export const FACTIONS: readonly FactionDefinition[] = [
  {
    id: 'industrialists',
    name: 'Industrielle Allianz',
    icon: '⚙',
    description:
      'Werften, Bergbau und Produktionswelten. Belohnt hohe Produktion und niedrige Steuern, lehnt Überdehnung ab.',
    favoredPolicy: 'industry',
  },
  {
    id: 'scientists',
    name: 'Forschergilde',
    icon: '🔬',
    description:
      'Forschung, Survey und Technologie. Belohnt hohe Forschungsleistung und lehnt lange Kriege ab.',
    favoredPolicy: 'science',
  },
  {
    id: 'militarists',
    name: 'Flottenkommando',
    icon: '🛡',
    description:
      'Sicherheit und Expansion. Belohnt starke Flotten und Kriege, misstraut einer wehrlosen Verwaltung.',
    favoredPolicy: 'military',
  },
] as const;

export const EMPIRE_POLICIES: Record<EmpirePolicy, EmpirePolicyDefinition> = {
  balanced: {
    id: 'balanced',
    name: 'Ausgewogene Verwaltung',
    description: 'Keine einseitige Förderung und keine Modifikatoren. Der neutrale Standard.',
    productionMultiplier: 1,
    researchMultiplier: 1,
    influenceMultiplier: 1,
    approvalModifier: 0,
  },
  industry: {
    id: 'industry',
    name: 'Industriepolitik',
    description: 'Fördert Produktion, kostet Zustimmung bei Wissenschaft und Militär.',
    productionMultiplier: 1.15,
    researchMultiplier: 1,
    influenceMultiplier: 1,
    approvalModifier: -3,
  },
  science: {
    id: 'science',
    name: 'Wissenschaftspolitik',
    description: 'Fördert Forschung, kostet Zustimmung bei Industrie und Militär.',
    productionMultiplier: 1,
    researchMultiplier: 1.15,
    influenceMultiplier: 1,
    approvalModifier: -3,
  },
  military: {
    id: 'military',
    name: 'Militärpolitik',
    description: 'Fördert Einfluss und leicht die Produktion, kostet Zustimmung bei Industrie und Wissenschaft.',
    productionMultiplier: 1.05,
    researchMultiplier: 1,
    influenceMultiplier: 1.15,
    approvalModifier: -2,
  },
};

export const EMPIRE_POLICY_IDS: readonly EmpirePolicy[] = [
  'balanced',
  'industry',
  'science',
  'military',
] as const;

/** Ein Politikwechsel ist frühestens nach dieser Zahl an Runden möglich. */
export const EMPIRE_POLICY_COOLDOWN_TURNS = 5;

export const FACTION_UNREST_THRESHOLD = 30;
export const FACTION_RECOVERY_THRESHOLD = 40;

/** Grundkapazität der Reichsverwaltung ohne Technologie und Rücklagen. */
export const ADMIN_BASE_CAPACITY = 4;
/** Jede Overextension-Stufe kostet 2 Zustimmungspunkte (maximal 10). */
export const ADMIN_OVEREXTENSION_APPROVAL_PENALTY = 2;

const DEFAULT_LOYALTY = 50;
const DEFAULT_INFLUENCE_ROUND = 100;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const round = (value: number): number => Math.round(value);

const isEmpirePolicy = (value: unknown): value is EmpirePolicy =>
  typeof value === 'string' && (EMPIRE_POLICY_IDS as readonly string[]).includes(value);

export function getFactionDefinition(id: FactionId): FactionDefinition {
  return FACTIONS.find((faction) => faction.id === id) ?? FACTIONS[0];
}

export function createEmpireState(civId: string): EmpireState {
  return {
    civId,
    policy: 'balanced',
    policyCooldownUntil: 0,
    factions: FACTIONS.map((faction, index) => ({
      id: faction.id,
      influence:
        index === 0
          ? DEFAULT_INFLUENCE_ROUND - Math.floor(DEFAULT_INFLUENCE_ROUND / FACTIONS.length) * (FACTIONS.length - 1)
          : Math.floor(DEFAULT_INFLUENCE_ROUND / FACTIONS.length),
      loyalty: DEFAULT_LOYALTY,
    })),
  };
}

/**
 * Normalisiert Einflusswerte auf exakt 100 Punkte. Der Rest wird auf die
 * stärkste Fraktion gelegt, damit die Summe unabhängig von Rundung stimmt.
 */
function normalizeInfluence(factions: FactionState[]): FactionState[] {
  const total = factions.reduce((sum, faction) => sum + Math.max(0, faction.influence), 0);
  if (total <= 0) {
    const base = Math.floor(DEFAULT_INFLUENCE_ROUND / factions.length);
    return factions.map((faction, index) => ({
      ...faction,
      influence: index === 0 ? DEFAULT_INFLUENCE_ROUND - base * (factions.length - 1) : base,
    }));
  }

  const scaled = factions.map((faction) => ({
    ...faction,
    influence: Math.max(0, Math.round((faction.influence / total) * DEFAULT_INFLUENCE_ROUND)),
  }));
  const sum = scaled.reduce((acc, faction) => acc + faction.influence, 0);
  const diff = DEFAULT_INFLUENCE_ROUND - sum;
  if (diff !== 0) {
    let target = 0;
    for (let i = 1; i < scaled.length; i += 1) {
      if (scaled[i].influence > scaled[target].influence) target = i;
    }
    scaled[target] = {
      ...scaled[target],
      influence: Math.max(0, scaled[target].influence + diff),
    };
  }
  return scaled;
}

function sanitizeState(raw: EmpireState): EmpireState {
  const fallback = createEmpireState(raw.civId);
  const byId = new Map<FactionId, FactionState>();
  for (const faction of raw.factions ?? []) {
    if (!fallback.factions.some((candidate) => candidate.id === faction.id)) continue;
    byId.set(faction.id, {
      id: faction.id,
      influence: clamp(Number.isFinite(faction.influence) ? faction.influence : 0, 0, 100),
      loyalty: clamp(Number.isFinite(faction.loyalty) ? faction.loyalty : DEFAULT_LOYALTY, 0, 100),
    });
  }

  return {
    civId: raw.civId,
    policy: isEmpirePolicy(raw.policy) ? raw.policy : 'balanced',
    policyCooldownUntil:
      Number.isFinite(raw.policyCooldownUntil) && raw.policyCooldownUntil! > 0
        ? Math.floor(raw.policyCooldownUntil!)
        : 0,
    factions: normalizeInfluence(
      fallback.factions.map((faction) => byId.get(faction.id) ?? faction)
    ),
  };
}

export class EmpireManager {
  private states: Map<string, EmpireState> = new Map();

  public reset(): void {
    this.states.clear();
  }

  public ensureState(civId: string): EmpireState {
    const existing = this.states.get(civId);
    if (existing) return existing;
    const created = createEmpireState(civId);
    this.states.set(civId, created);
    return created;
  }

  public getState(civId: string): EmpireState {
    return this.cloneState(this.ensureState(civId));
  }

  public getAllStates(): EmpireState[] {
    return Array.from(this.states.values())
      .map((state) => this.cloneState(state))
      .sort((left, right) => left.civId.localeCompare(right.civId));
  }

  public loadStates(states: EmpireState[] | undefined): void {
    this.states.clear();
    for (const state of states ?? []) {
      if (!state || typeof state.civId !== 'string' || state.civId.length === 0) continue;
      this.states.set(state.civId, sanitizeState(state));
    }
  }

  /**
   * Setzt die Governance-Politik eines Reiches. Der Cooldown verhindert
   * hektisches Umschalten; dieselbe Politik erneut zu wählen ist ein Fehler.
   */
  public setPolicy(
    civId: string,
    policy: EmpirePolicy,
    currentTurn: number
  ): EmpirePolicyResult {
    if (!isEmpirePolicy(policy)) {
      return { success: false, reason: 'Unbekannte Politik.' };
    }
    const state = this.ensureState(civId);
    if (state.policy === policy) {
      return { success: false, reason: 'Diese Politik ist bereits aktiv.' };
    }
    if (currentTurn < state.policyCooldownUntil) {
      return {
        success: false,
        reason: `Politikwechsel erst ab Runde ${state.policyCooldownUntil} möglich.`,
        availableTurn: state.policyCooldownUntil,
      };
    }

    const previousPolicy = state.policy;
    state.policy = policy;
    state.policyCooldownUntil = currentTurn + EMPIRE_POLICY_COOLDOWN_TURNS;
    return {
      success: true,
      policy,
      previousPolicy,
      availableTurn: state.policyCooldownUntil,
      state: this.cloneState(state),
    };
  }

  /**
   * Bewertet alle Reiche am Rundenende neu. Die Reihenfolge ist nach
   * Zivilisations-ID sortiert und damit unabhängig von der Einfügereihenfolge.
   */
  public advanceTurn(snapshots: EmpireSnapshot[], currentTurn: number): EmpireTurnReport {
    const report: EmpireTurnReport = {
      states: [],
      policyChanges: [],
      unrest: [],
      recovered: [],
    };

    const ordered = [...snapshots].sort((left, right) => left.civId.localeCompare(right.civId));
    for (const snapshot of ordered) {
      const state = this.ensureState(snapshot.civId);
      const administration = this.getAdministration(snapshot);
      const previousLoyalty = new Map(state.factions.map((faction) => [faction.id, faction.loyalty]));

      const nextFactions = state.factions.map((faction) => {
        const target = this.factionLoyaltyTarget(faction.id, snapshot, state, administration);
        const loyalty = clamp(
          round(faction.loyalty * 0.5 + clamp(target, 0, 100) * 0.5),
          0,
          100
        );
        const policyBonus = this.isFavoredPolicy(faction.id, state.policy) ? 10 : 0;
        return {
          id: faction.id,
          loyalty,
          influence: Math.max(0, round(faction.influence * 0.7 + (loyalty + policyBonus) * 0.3)),
        };
      });

      state.factions = normalizeInfluence(nextFactions);

      // KI richtet ihre Politik alle zehn Runden an der dominanten Fraktion aus.
      if (!snapshot.isPlayer && currentTurn % 10 === 0 && state.policyCooldownUntil <= currentTurn) {
        const dominant = this.getDominantFactionFromState(state);
        const favored = getFactionDefinition(dominant.id).favoredPolicy;
        if (favored !== state.policy) {
          const previousPolicy = state.policy;
          state.policy = favored;
          state.policyCooldownUntil = currentTurn + EMPIRE_POLICY_COOLDOWN_TURNS;
          report.policyChanges.push({ civId: state.civId, previousPolicy, policy: favored });
        }
      }

      for (const faction of state.factions) {
        const before = previousLoyalty.get(faction.id) ?? DEFAULT_LOYALTY;
        if (before >= FACTION_UNREST_THRESHOLD && faction.loyalty < FACTION_UNREST_THRESHOLD) {
          report.unrest.push(this.unrestReport(state.civId, faction));
        } else if (
          before < FACTION_RECOVERY_THRESHOLD &&
          faction.loyalty >= FACTION_RECOVERY_THRESHOLD
        ) {
          report.recovered.push(this.unrestReport(state.civId, faction));
        }
      }

      report.states.push(this.cloneState(state));
    }

    report.states.sort((left, right) => left.civId.localeCompare(right.civId));
    return report;
  }

  /**
   * Verwaltungskapazität wächst mit Forschung und Rücklagen, die Last mit
   * Koloniestufe und Distrikten. Overextension senkt die Effizienz.
   */
  public getAdministration(snapshot: EmpireSnapshot): EmpireAdministration {
    const capacity =
      ADMIN_BASE_CAPACITY +
      Math.floor(Math.max(0, snapshot.completedTechCount) / 2) +
      Math.floor(Math.max(0, snapshot.treasury) / 1500);
    const load =
      Math.max(0, snapshot.colonyLoad) + Math.ceil(Math.max(0, snapshot.districtCount) / 4);
    const overextension = Math.max(0, load - capacity);
    return {
      capacity,
      load,
      overextension,
      efficiency: clamp(1 - overextension * 0.1, 0.5, 1),
    };
  }

  /**
   * Modifikatoren für die Kolonieökonomie. Standardzustand ist neutral:
   * Ausgewogene Politik, keine Mehrheit und keine Unruhe ergeben 1,0 bzw. 0.
   */
  public getModifiers(civId: string, snapshot: EmpireSnapshot): EmpireModifiers {
    const state = this.ensureState(civId);
    const policy = EMPIRE_POLICIES[state.policy] ?? EMPIRE_POLICIES.balanced;
    const administration = this.getAdministration(snapshot);
    const dominant = this.getDominantFactionFromState(state);
    const dominantBonusActive = dominant.influence >= 40 && dominant.loyalty >= 60;

    const productionMultiplier =
      policy.productionMultiplier *
      (dominantBonusActive && dominant.id === 'industrialists' ? 1.05 : 1);
    const researchMultiplier =
      policy.researchMultiplier *
      (dominantBonusActive && dominant.id === 'scientists' ? 1.05 : 1);
    const influenceMultiplier =
      policy.influenceMultiplier *
      (dominantBonusActive && dominant.id === 'militarists' ? 1.05 : 1);

    const weightedLoyalty =
      state.factions.reduce((sum, faction) => sum + faction.loyalty * faction.influence, 0) / 100;
    const loyaltyModifier = clamp(round((weightedLoyalty - 50) / 10), -5, 5);
    const overextensionModifier = -Math.min(
      10,
      administration.overextension * ADMIN_OVEREXTENSION_APPROVAL_PENALTY
    );

    return {
      productionMultiplier: roundToThousand(productionMultiplier),
      researchMultiplier: roundToThousand(researchMultiplier),
      influenceMultiplier: roundToThousand(influenceMultiplier),
      approvalModifier: clamp(
        policy.approvalModifier + loyaltyModifier + overextensionModifier,
        -15,
        10
      ),
    };
  }

  /**
   * Verschiebt die Loyalität aller Fraktionen gleichmäßig. Wird von
   * narrativen Entscheidungen genutzt; der Einfluss folgt erst bei der
   * nächsten Rundenbewertung.
   */
  public adjustLoyalty(civId: string, delta: number): void {
    if (!Number.isFinite(delta) || delta === 0) return;
    const state = this.ensureState(civId);
    state.factions = state.factions.map((faction) => ({
      ...faction,
      loyalty: clamp(faction.loyalty + delta, 0, 100),
    }));
  }

  public getDominantFaction(civId: string): FactionState {
    return this.getDominantFactionFromState(this.ensureState(civId));
  }

  public getDominantFactionFromState(state: EmpireState): FactionState {
    let dominant = state.factions[0];
    for (const faction of state.factions) {
      if (faction.influence > dominant.influence) dominant = faction;
    }
    return { ...dominant };
  }

  private factionLoyaltyTarget(
    factionId: FactionId,
    snapshot: EmpireSnapshot,
    state: EmpireState,
    administration: EmpireAdministration
  ): number {
    const overextensionPenalty = Math.min(20, administration.overextension * 4);
    const taxRate = snapshot.averageTaxRate;
    const policyAlignment = (favored: EmpirePolicy): number => {
      if (state.policy === favored) return 12;
      if (state.policy === 'balanced') return 0;
      return -4;
    };

    if (factionId === 'industrialists') {
      return (
        50 +
        policyAlignment('industry') +
        clamp((snapshot.productionPerPop - 4) * 4, -12, 12) +
        clamp((30 - taxRate) * 0.3, -9, 9) +
        Math.min(6, snapshot.tradeRouteCount * 2) -
        overextensionPenalty
      );
    }

    if (factionId === 'scientists') {
      return (
        50 +
        policyAlignment('science') +
        clamp((snapshot.researchPerPop - 2) * 6, -12, 12) +
        clamp((30 - taxRate) * 0.2, -6, 6) -
        snapshot.warCount * 2 -
        overextensionPenalty
      );
    }

    const fleetStrengthPerColony =
      snapshot.fleetStrength / Math.max(1, snapshot.colonyCount);
    return (
      50 +
      policyAlignment('military') +
      clamp((fleetStrengthPerColony - 40) / 8, -12, 12) +
      Math.min(12, snapshot.warCount * 6) -
      overextensionPenalty
    );
  }

  private isFavoredPolicy(factionId: FactionId, policy: EmpirePolicy): boolean {
    return getFactionDefinition(factionId).favoredPolicy === policy;
  }

  private unrestReport(civId: string, faction: FactionState): FactionUnrestReport {
    return {
      civId,
      factionId: faction.id,
      factionName: getFactionDefinition(faction.id).name,
      loyalty: faction.loyalty,
    };
  }

  private cloneState(state: EmpireState): EmpireState {
    return {
      civId: state.civId,
      policy: state.policy,
      policyCooldownUntil: state.policyCooldownUntil,
      factions: state.factions.map((faction) => ({ ...faction })),
    };
  }
}

export function buildEmpireSnapshot(
  civId: string,
  isPlayer: boolean,
  colonies: Colony[],
  options: {
    fleetStrength?: number;
    warCount?: number;
    tradeRouteCount?: number;
    completedTechCount?: number;
    treasury?: number;
  } = {}
): EmpireSnapshot {
  const civColonies = colonies.filter((colony) => colony.civId === civId);
  const totalPopulation = civColonies.reduce((sum, colony) => sum + colony.population, 0);
  const production = civColonies.reduce(
    (sum, colony) => sum + (colony.netYields?.production ?? 0),
    0
  );
  const research = civColonies.reduce(
    (sum, colony) => sum + (colony.researchOutput ?? colony.netYields?.research ?? 0),
    0
  );
  const colonyLoad = civColonies.reduce((sum, colony) => {
    if (colony.developmentTier === 'colony') return sum + 3;
    if (colony.developmentTier === 'settlement') return sum + 2;
    return sum + 1;
  }, 0);
  const districtCount = civColonies.reduce(
    (sum, colony) => sum + (colony.districts?.length ?? 0),
    0
  );
  const taxRates = civColonies.map((colony) => colony.taxRate ?? 30);

  return {
    civId,
    isPlayer,
    colonyCount: civColonies.length,
    colonyLoad,
    districtCount,
    totalPopulation,
    productionPerPop: totalPopulation > 0 ? production / totalPopulation : 0,
    researchPerPop: totalPopulation > 0 ? research / totalPopulation : 0,
    averageTaxRate:
      taxRates.length > 0
        ? taxRates.reduce((sum, rate) => sum + rate, 0) / taxRates.length
        : 30,
    fleetStrength: options.fleetStrength ?? 0,
    warCount: options.warCount ?? 0,
    tradeRouteCount: options.tradeRouteCount ?? 0,
    completedTechCount: options.completedTechCount ?? 0,
    treasury: options.treasury ?? 0,
  };
}

function roundToThousand(value: number): number {
  return Math.round(value * 1000) / 1000;
}
