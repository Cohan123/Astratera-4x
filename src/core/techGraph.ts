/**
 * Astraea 4X - Technology Graph
 * Validation and graph queries for the civilization research DAG.
 * The graph is derived from prerequisite edges; tiers encode intended depth.
 */

import { BUILDING_CATALOG } from '../data/buildingCatalog.ts';
import { TECHNOLOGY_CATALOG } from '../data/technologyCatalog.ts';
import { UNIT_CATALOG } from '../data/unitCatalog.ts';
import { TechnologyDef } from './types.ts';

export type TechCatalog = Record<string, TechnologyDef>;

export interface TechStatus {
  researched: boolean;
  active: boolean;
  prerequisitesMet: boolean;
  missingPrerequisites: string[];
  /** A completed rival in the same exclusive group, if any. */
  blockedBy: TechnologyDef | null;
  /** True when every condition to start research is satisfied. */
  canResearch: boolean;
}

const catalogOf = (catalog?: TechCatalog): TechCatalog => catalog ?? TECHNOLOGY_CATALOG;

/**
 * Validates the technology DAG: identity, cost, tier monotonicity,
 * dangling/self/duplicate prerequisites, cycles, unlock references and
 * exclusive specialization consistency.
 */
export function validateTechGraph(
  catalog: TechCatalog = TECHNOLOGY_CATALOG
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const ids = Object.keys(catalog);
  const allIds = new Set(ids);

  for (const [key, tech] of Object.entries(catalog)) {
    if (tech.id !== key) {
      errors.push(`Tech ${key} hat abweichende ID: ${tech.id}`);
    }
    if (!Number.isFinite(tech.cost) || tech.cost <= 0) {
      errors.push(`Tech ${key} hat ungültige Kosten: ${tech.cost}`);
    }
    if (![1, 2, 3, 4].includes(tech.tier)) {
      errors.push(`Tech ${key} hat ungültige Stufe: ${tech.tier}`);
    }

    const seen = new Set<string>();
    for (const prereq of tech.prerequisites) {
      if (prereq === key) {
        errors.push(`Tech ${key} hat sich selbst als Voraussetzung (Zirkelschluss).`);
      } else if (!allIds.has(prereq)) {
        errors.push(`Tech ${key} verweist auf unbekannte Voraussetzung: ${prereq}`);
      } else if (seen.has(prereq)) {
        errors.push(`Tech ${key} nennt Voraussetzung mehrfach: ${prereq}`);
      } else if (catalog[prereq].tier >= tech.tier) {
        errors.push(
          `Tech ${key} (Stufe ${tech.tier}) setzt ${prereq} (Stufe ${catalog[prereq].tier}) voraus; Voraussetzungen müssen eine niedrigere Stufe haben.`
        );
      }
      seen.add(prereq);
    }

    for (const buildingId of tech.unlocks.buildings ?? []) {
      if (!BUILDING_CATALOG[buildingId]) {
        errors.push(`Tech ${key} schaltet unbekanntes Gebäude frei: ${buildingId}`);
      }
    }
    for (const unitId of tech.unlocks.units ?? []) {
      if (!UNIT_CATALOG[unitId]) {
        errors.push(`Tech ${key} schaltet unbekannte Einheit frei: ${unitId}`);
      }
    }
  }

  // Cycle detection over the prerequisite graph (DFS with color marks).
  const visitState = new Map<string, 0 | 1 | 2>();
  const visit = (id: string, path: string[]): void => {
    const state = visitState.get(id) ?? 0;
    if (state === 1) {
      const cycleStart = path.indexOf(id);
      const cycle = [...path.slice(cycleStart), id];
      errors.push(`Zyklus in Voraussetzungen: ${cycle.join(' → ')}`);
      return;
    }
    if (state === 2) return;
    visitState.set(id, 1);
    for (const prereq of catalog[id]?.prerequisites ?? []) {
      if (allIds.has(prereq)) visit(prereq, [...path, id]);
    }
    visitState.set(id, 2);
  };
  for (const id of ids) visit(id, []);

  // Exclusive specialization groups must be comparable and non-trivial.
  const groups = new Map<string, TechnologyDef[]>();
  for (const tech of Object.values(catalog)) {
    if (!tech.exclusiveGroup) continue;
    const members = groups.get(tech.exclusiveGroup) ?? [];
    members.push(tech);
    groups.set(tech.exclusiveGroup, members);
  }
  for (const [group, members] of groups) {
    if (members.length < 2) {
      errors.push(`Spezialisierungsgruppe ${group} hat nur ein Mitglied: ${members[0].id}`);
    }
    const categories = new Set(members.map((m) => m.category));
    const tiers = new Set(members.map((m) => m.tier));
    if (categories.size > 1) {
      errors.push(`Spezialisierungsgruppe ${group} mischt Kategorien.`);
    }
    if (tiers.size > 1) {
      errors.push(`Spezialisierungsgruppe ${group} mischt Stufen.`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Backwards-compatible entry point for the shipped catalog. */
export function validateTechCatalog(catalog: TechCatalog = TECHNOLOGY_CATALOG): {
  valid: boolean;
  errors: string[];
} {
  return validateTechGraph(catalog);
}

/** Longest prerequisite chain length; root technologies have depth 0. */
export function getTechDepth(techId: string, catalog?: TechCatalog): number {
  const graph = catalogOf(catalog);
  const memo = new Map<string, number>();
  const resolve = (id: string, stack: Set<string>): number => {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    if (stack.has(id)) return 0;
    const tech = graph[id];
    if (!tech || tech.prerequisites.length === 0) {
      memo.set(id, 0);
      return 0;
    }
    stack.add(id);
    let depth = 0;
    for (const prereq of tech.prerequisites) {
      depth = Math.max(depth, resolve(prereq, stack) + 1);
    }
    stack.delete(id);
    memo.set(id, depth);
    return depth;
  };
  return resolve(techId, new Set());
}

/** Every transitive prerequisite of a technology, excluding the technology itself. */
export function getPrerequisiteClosure(techId: string, catalog?: TechCatalog): Set<string> {
  const graph = catalogOf(catalog);
  const closure = new Set<string>();
  const visit = (id: string): void => {
    for (const prereq of graph[id]?.prerequisites ?? []) {
      if (closure.has(prereq)) continue;
      closure.add(prereq);
      visit(prereq);
    }
  };
  visit(techId);
  return closure;
}

/** Technologies that list this technology as a direct prerequisite. */
export function getDirectDependents(techId: string, catalog?: TechCatalog): TechnologyDef[] {
  return Object.values(catalogOf(catalog))
    .filter((tech) => tech.prerequisites.includes(techId))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Technologies that depend on this technology directly or transitively. */
export function getAllDependents(techId: string, catalog?: TechCatalog): TechnologyDef[] {
  const graph = catalogOf(catalog);
  const found = new Set<string>();
  const queue = [techId];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const tech of Object.values(graph)) {
      if (tech.prerequisites.includes(current) && !found.has(tech.id)) {
        found.add(tech.id);
        queue.push(tech.id);
      }
    }
  }
  return [...found].map((id) => graph[id]).sort((a, b) => a.id.localeCompare(b.id));
}

/** Technologies of one tier, ordered by category then id. */
export function getTechsByTier(tier: number, catalog?: TechCatalog): TechnologyDef[] {
  const order = { physics: 0, society: 1, engineering: 2 } as const;
  return Object.values(catalogOf(catalog))
    .filter((tech) => tech.tier === tier)
    .sort((a, b) => order[a.category] - order[b.category] || a.id.localeCompare(b.id));
}

/** Prerequisites of a technology that are not completed yet. */
export function getMissingPrerequisites(
  completedTechIds: readonly string[],
  techId: string,
  catalog?: TechCatalog
): string[] {
  const tech = catalogOf(catalog)[techId];
  if (!tech) return [];
  return tech.prerequisites.filter((prereq) => !completedTechIds.includes(prereq));
}

/** Completed technology from the same exclusive group, if any. */
export function getSpecializationRival(
  completedTechIds: readonly string[],
  techId: string,
  catalog?: TechCatalog
): TechnologyDef | null {
  const graph = catalogOf(catalog);
  const tech = graph[techId];
  if (!tech?.exclusiveGroup) return null;
  for (const completedId of completedTechIds) {
    if (completedId === techId) continue;
    const completed = graph[completedId];
    if (completed?.exclusiveGroup === tech.exclusiveGroup) return completed;
  }
  return null;
}

/** Alternative specialization technologies in the same exclusive group. */
export function getSpecializationRivals(techId: string, catalog?: TechCatalog): TechnologyDef[] {
  const graph = catalogOf(catalog);
  const tech = graph[techId];
  if (!tech?.exclusiveGroup) return [];
  return Object.values(graph)
    .filter((other) => other.id !== techId && other.exclusiveGroup === tech.exclusiveGroup)
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Full research status of one technology for a civilization. */
export function getTechStatus(
  completedTechIds: readonly string[],
  currentTechId: string | null,
  techId: string,
  catalog?: TechCatalog
): TechStatus {
  const researched = completedTechIds.includes(techId);
  const missingPrerequisites = getMissingPrerequisites(completedTechIds, techId, catalog);
  const blockedBy = getSpecializationRival(completedTechIds, techId, catalog);
  return {
    researched,
    active: currentTechId === techId,
    prerequisitesMet: missingPrerequisites.length === 0,
    missingPrerequisites,
    blockedBy,
    canResearch: !researched && missingPrerequisites.length === 0 && !blockedBy,
  };
}
