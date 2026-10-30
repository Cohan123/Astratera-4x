/**
 * Astraea 4X - Technology Graph Test Suite (Module 4 / Phase 2)
 * Verifies catalog integrity, DAG helpers, exclusive specializations and
 * research eligibility gating.
 */

import { describe, expect, it } from 'vitest';
import { ResearchManager } from '../src/core/researchManager.ts';
import {
  getAllDependents,
  getDirectDependents,
  getMissingPrerequisites,
  getPrerequisiteClosure,
  getSpecializationRival,
  getSpecializationRivals,
  getTechDepth,
  getTechStatus,
  getTechsByTier,
  validateTechCatalog,
  validateTechGraph,
} from '../src/core/techGraph.ts';
import { TECHNOLOGY_CATALOG } from '../src/data/technologyCatalog.ts';
import { CivResearchState, TechnologyDef } from '../src/core/types.ts';

function makeState(completed: string[] = [], active: string | null = null): CivResearchState {
  return { completedTechIds: [...completed], currentTechId: active, currentTechInvested: 0 };
}

function makeTech(overrides: Partial<TechnologyDef> & { id: string }): TechnologyDef {
  return {
    name: overrides.id,
    category: 'physics',
    tier: 1,
    cost: 10,
    description: '',
    prerequisites: [],
    unlocks: {},
    ...overrides,
  };
}

describe('technology catalog integrity', () => {
  it('accepts the shipped catalog', () => {
    const result = validateTechGraph();
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(validateTechCatalog().valid).toBe(true);
  });

  it('detects prerequisite cycles', () => {
    const catalog: Record<string, TechnologyDef> = {
      a: makeTech({ id: 'a', tier: 2, prerequisites: ['b'] }),
      b: makeTech({ id: 'b', tier: 3, prerequisites: ['a'] }),
    };
    const result = validateTechGraph(catalog);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Zyklus'))).toBe(true);
  });

  it('detects dangling and self prerequisites', () => {
    const catalog: Record<string, TechnologyDef> = {
      a: makeTech({ id: 'a', prerequisites: ['missing'] }),
      b: makeTech({ id: 'b', prerequisites: ['b'] }),
    };
    const errors = validateTechGraph(catalog).errors;
    expect(errors.some((e) => e.includes('unbekannte Voraussetzung: missing'))).toBe(true);
    expect(errors.some((e) => e.includes('Zirkelschluss'))).toBe(true);
  });

  it('detects tier inversion and invalid costs', () => {
    const catalog: Record<string, TechnologyDef> = {
      old: makeTech({ id: 'old', tier: 3 }),
      young: makeTech({ id: 'young', tier: 2, cost: 0, prerequisites: ['old'] }),
    };
    const errors = validateTechGraph(catalog).errors;
    expect(errors.some((e) => e.includes('niedrigere Stufe'))).toBe(true);
    expect(errors.some((e) => e.includes('ungültige Kosten'))).toBe(true);
  });

  it('detects unknown unlock references', () => {
    const catalog: Record<string, TechnologyDef> = {
      a: makeTech({
        id: 'a',
        unlocks: { buildings: ['not_a_building'], units: ['not_a_unit'] },
      }),
    };
    const errors = validateTechGraph(catalog).errors;
    expect(errors.some((e) => e.includes('unbekanntes Gebäude'))).toBe(true);
    expect(errors.some((e) => e.includes('unbekannte Einheit'))).toBe(true);
  });

  it('requires exclusive groups to be same-tier and non-trivial', () => {
    const catalog: Record<string, TechnologyDef> = {
      solo: makeTech({ id: 'solo', tier: 2, exclusiveGroup: 'solo_group' }),
      mixed_a: makeTech({ id: 'mixed_a', tier: 2, exclusiveGroup: 'mixed' }),
      mixed_b: makeTech({ id: 'mixed_b', tier: 2, category: 'society', exclusiveGroup: 'mixed' }),
    };
    const errors = validateTechGraph(catalog).errors;
    expect(errors.some((e) => e.includes('nur ein Mitglied'))).toBe(true);
    expect(errors.some((e) => e.includes('mischt Kategorien'))).toBe(true);
  });
});

describe('technology graph helpers', () => {
  it('computes prerequisite depth', () => {
    expect(getTechDepth('geothermal_tapping')).toBe(0);
    expect(getTechDepth('fusion_reactors')).toBe(1);
    expect(getTechDepth('antimatter_containment')).toBe(2);
    expect(getTechDepth('zero_point_physics')).toBe(3);
  });

  it('collects the full prerequisite closure', () => {
    expect([...getPrerequisiteClosure('self_replicating_industry')].sort()).toEqual(
      [
        'advanced_metallurgy',
        'automated_assembly',
        'fusion_reactors',
        'geothermal_tapping',
        'heavy_armor_brigades',
        'interstellar_freight_network',
        'planetary_logistics_prep',
        'subspace_comms',
      ].sort()
    );
  });

  it('resolves direct and transitive dependents', () => {
    expect(getDirectDependents('interstellar_freight_network').map((t) => t.id)).toEqual([
      'megastructure_engineering',
      'self_replicating_industry',
    ]);
    expect(getAllDependents('automated_assembly').map((t) => t.id)).toEqual([
      'advanced_metallurgy',
      'gravitic_engineering',
      'heavy_armor_brigades',
      'interstellar_freight_network',
      'megastructure_engineering',
      'planetary_logistics_prep',
      'self_replicating_industry',
    ]);
  });

  it('groups technologies by tier', () => {
    const tier4 = getTechsByTier(4);
    expect(tier4.map((t) => t.id)).toEqual([
      'gravitic_engineering',
      'zero_point_physics',
      'arcology_governance',
      'genetic_adaptation',
      'megastructure_engineering',
      'self_replicating_industry',
    ]);
    expect(tier4.every((t) => t.tier === 4)).toBe(true);
  });

  it('resolves exclusive specialization rivals', () => {
    const rivals = getSpecializationRivals('zero_point_physics');
    expect(rivals.map((t) => t.id)).toEqual(['gravitic_engineering']);
    expect(getSpecializationRival(['gravitic_engineering'], 'zero_point_physics')?.id).toBe(
      'gravitic_engineering'
    );
    expect(getSpecializationRival(['geothermal_tapping'], 'zero_point_physics')).toBeNull();
  });
});

describe('research eligibility', () => {
  it('gates multi-prerequisite technologies', () => {
    const state = makeState(['planetary_logistics_prep']);
    expect(ResearchManager.selectTech(state, 'interstellar_freight_network')).toBe(false);
    expect(getMissingPrerequisites(state.completedTechIds, 'interstellar_freight_network')).toEqual([
      'fusion_reactors',
    ]);

    state.completedTechIds.push('fusion_reactors');
    expect(ResearchManager.selectTech(state, 'interstellar_freight_network')).toBe(true);
    expect(state.currentTechId).toBe('interstellar_freight_network');
  });

  it('reports eligibility reasons', () => {
    const state = makeState(['antimatter_containment']);
    expect(ResearchManager.canResearch(state, 'nope').reason).toBe('unknown-tech');
    expect(ResearchManager.canResearch(state, 'antimatter_containment').reason).toBe(
      'already-researched'
    );
    expect(ResearchManager.canResearch(state, 'zero_point_physics').reason).toBe(
      'missing-prerequisites'
    );

    state.completedTechIds.push('orbital_surveying');
    expect(ResearchManager.canResearch(state, 'zero_point_physics').allowed).toBe(true);
  });

  it('locks the rival specialization after completion', () => {
    const state = makeState([
      'antimatter_containment',
      'orbital_surveying',
      'advanced_metallurgy',
      'zero_point_physics',
    ]);
    const eligibility = ResearchManager.canResearch(state, 'gravitic_engineering');
    expect(eligibility.allowed).toBe(false);
    expect(eligibility.reason).toBe('specialization-locked');
    expect(eligibility.blockedBy?.id).toBe('zero_point_physics');
    expect(ResearchManager.selectTech(state, 'gravitic_engineering')).toBe(false);

    const status = getTechStatus(state.completedTechIds, state.currentTechId, 'gravitic_engineering');
    expect(status.canResearch).toBe(false);
    expect(status.blockedBy?.name).toBe('Nullpunkt-Physik');
  });

  it('returns deterministic available technologies', () => {
    const state = makeState();
    const available = ResearchManager.getAvailableTechs(state);
    const ids = available.map((t) => t.id);
    expect(ids).toEqual([
      'planetary_pioneering',
      'mineral_enrichment',
      'orbital_surveying',
      'geothermal_tapping',
      'subspace_comms',
      'automated_assembly',
    ]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(available.every((t) => t.tier === 1)).toBe(true);
    expect(available.some((t) => t.id.startsWith('zero_point'))).toBe(false);
  });
});
