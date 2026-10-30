/**
 * Astraea 4X - Civilization Research Manager
 * Manages the shared scientific pool, active research selection, progress accrual, and tech unlocks.
 */

import { TECHNOLOGY_CATALOG } from '../data/technologyCatalog.ts';
import {
  getMissingPrerequisites,
  getSpecializationRival,
  getTechStatus,
} from './techGraph.ts';
import { CivResearchState, TechnologyDef } from './types.ts';

export type ResearchEligibilityReason =
  | 'ok'
  | 'already-researched'
  | 'unknown-tech'
  | 'missing-prerequisites'
  | 'specialization-locked';

export interface ResearchEligibility {
  allowed: boolean;
  reason: ResearchEligibilityReason;
  missingPrerequisites: string[];
  blockedBy: TechnologyDef | null;
}

export class ResearchManager {
  /**
   * Checks whether a technology can be selected right now, including
   * prerequisite gating and exclusive specialization groups.
   */
  public static canResearch(state: CivResearchState, techId: string): ResearchEligibility {
    const tech = TECHNOLOGY_CATALOG[techId];
    if (!tech) {
      return {
        allowed: false,
        reason: 'unknown-tech',
        missingPrerequisites: [],
        blockedBy: null,
      };
    }
    if (state.completedTechIds.includes(techId)) {
      return {
        allowed: false,
        reason: 'already-researched',
        missingPrerequisites: [],
        blockedBy: null,
      };
    }

    const missingPrerequisites = getMissingPrerequisites(state.completedTechIds, techId);
    const blockedBy = getSpecializationRival(state.completedTechIds, techId);

    if (missingPrerequisites.length > 0) {
      return { allowed: false, reason: 'missing-prerequisites', missingPrerequisites, blockedBy };
    }
    if (blockedBy) {
      return { allowed: false, reason: 'specialization-locked', missingPrerequisites, blockedBy };
    }
    return { allowed: true, reason: 'ok', missingPrerequisites, blockedBy: null };
  }

  /**
   * Sets the active research target for a civilization
   */
  public static selectTech(state: CivResearchState, techId: string): boolean {
    if (!ResearchManager.canResearch(state, techId).allowed) return false;

    if (state.currentTechId !== techId) {
      state.currentTechId = techId;
      state.currentTechInvested = 0;
    }
    return true;
  }

  /**
   * Applies scientific research points to active technology
   */
  public static applyResearchPoints(
    state: CivResearchState,
    points: number
  ): { completedTech: TechnologyDef | null } {
    if (!state.currentTechId) return { completedTech: null };

    const tech = TECHNOLOGY_CATALOG[state.currentTechId];
    if (!tech) return { completedTech: null };

    state.currentTechInvested += Math.max(0, points);

    if (state.currentTechInvested >= tech.cost) {
      // Completed!
      state.completedTechIds.push(tech.id);
      state.currentTechId = null;
      state.currentTechInvested = 0;
      return { completedTech: tech };
    }

    return { completedTech: null };
  }

  /**
   * Retrieves all technologies currently available for research.
   * Respects prerequisites and specialization locks, ordered by tier,
   * cost and id so callers always see a deterministic list.
   */
  public static getAvailableTechs(state: CivResearchState): TechnologyDef[] {
    return Object.values(TECHNOLOGY_CATALOG)
      .filter((tech) => getTechStatus(state.completedTechIds, state.currentTechId, tech.id).canResearch)
      .sort((a, b) => a.tier - b.tier || a.cost - b.cost || a.id.localeCompare(b.id));
  }

  /**
   * Checks if a technology has been researched
   */
  public static isResearched(state: CivResearchState, techId: string): boolean {
    return state.completedTechIds.includes(techId);
  }

  public static isTechCompleted(state: CivResearchState, techId: string): boolean {
    return ResearchManager.isResearched(state, techId);
  }

  public static applyResearchYield(state: CivResearchState, points: number): string[] {
    const res = ResearchManager.applyResearchPoints(state, points);
    return res.completedTech ? [res.completedTech.id] : [];
  }
}
