/**
 * Astraea 4X - Colonization Rules & Validator
 * Central authority determining whether a planet is eligible for colonization.
 * Enforces business logic independently from the UI layer.
 */

import { HabitabilityEvaluator } from './habitabilityEvaluator.ts';
import { HabitabilityAssessment, Planet, StarSystem } from './types.ts';

export interface ColonizationCheckResult {
  allowed: boolean;
  reason?: string;
  assessment?: HabitabilityAssessment;
}

/**
 * Fracht, die ein Kolonieschiff für eine Gründung mitführen muss. Diese Werte
 * sind zugleich die Startwerte einer neuen Kolonie: Bevölkerung und Vorräte
 * entstehen ausschließlich aus dem Laderaum, nicht zusätzlich aus einem
 * globalen Lager.
 */
export interface ColonySupply {
  colonists: number;
  food: number;
  minerals: number;
  rareResources: number;
  influence: number;
}

export const COLONIZATION_SUPPLY: ColonySupply = {
  colonists: 1000,
  food: 30,
  minerals: 60,
  rareResources: 10,
  influence: 20,
};

const SUPPLY_LABELS: Record<keyof ColonySupply, string> = {
  colonists: 'Kolonisten',
  food: 'Nahrung',
  minerals: 'Mineralien',
  rareResources: 'Seltene Ressourcen',
  influence: 'Einfluss',
};

/** Prüft, ob der Laderaum eines Kolonieschiffs für eine Gründung ausreicht. */
export function checkColonySupply(cargo?: Partial<ColonySupply> | null): {
  allowed: boolean;
  reason?: string;
  missing: Array<keyof ColonySupply>;
} {
  if (!cargo) {
    return {
      allowed: false,
      reason: 'Kein Kolonieschiff mit Laderaum im Zielsystem.',
      missing: ['colonists', 'food', 'minerals', 'rareResources', 'influence'],
    };
  }

  const missing = (Object.keys(COLONIZATION_SUPPLY) as Array<keyof ColonySupply>).filter(
    (key) => (cargo[key] ?? 0) < COLONIZATION_SUPPLY[key]
  );

  if (missing.length === 0) {
    return { allowed: true, missing: [] };
  }

  const detail = missing
    .map(
      (key) =>
        `${SUPPLY_LABELS[key]} ${Math.floor(cargo[key] ?? 0)}/${COLONIZATION_SUPPLY[key]}`
    )
    .join(', ');

  return {
    allowed: false,
    reason: `Kolonieschiff-Laderaum unzureichend (${detail}).`,
    missing,
  };
}

export class ColonizationValidator {
  /**
   * Evaluates if a given planet can be colonized under the current game rules
   */
  public static canColonize(
    planet: Planet | null | undefined,
    system?: StarSystem | null,
    allowSecondaryColonyOnPlanet: boolean = false
  ): ColonizationCheckResult {
    if (!planet) {
      return {
        allowed: false,
        reason: 'Ungültige Planetenreferenz: Planet existiert nicht im Spielzustand.',
      };
    }

    // 1. Discovery & Investigation check
    if (planet.surveyStatus !== 'analyzed') {
      return {
        allowed: false,
        reason: 'Planet ist noch nicht ausreichend untersucht. Führe zuerst einen Orbitalsonden-Scan durch.',
      };
    }

    // 2. Existing colony check
    if (!allowSecondaryColonyOnPlanet && (planet.colonizationStatus === 'colonized' || planet.colonyId !== null)) {
      return {
        allowed: false,
        reason: 'Planet besitzt bereits eine etablierte Kolonie.',
      };
    }

    // 3. System discovery check (if system provided)
    if (system && system.discoveryStatus === 'unexplored') {
      return {
        allowed: false,
        reason: 'Sternensystem ist der galaktischen Sternenkarte noch nicht bekannt.',
      };
    }

    // 4. Lethal radiation check
    if (planet.radiationHazard === 'lethal') {
      return {
        allowed: false,
        reason: 'Tödliche kosmische Strahlung schließt eine Kolonisation ohne fortgeschrittene Schildtechnologie aus.',
      };
    }

    // 5. Gasriesen: keine normale Bodenkolonie, aber eine reine
    // Gasförderplattform. Die Bauregeln lassen dort ausschließlich die dafür
    // vorgesehenen Anlagen zu (siehe BuildQueueManager).
    if (planet.planetType === 'gas_giant') {
      return {
        allowed: true,
        assessment: {
          score: 0,
          tier: 'uninhabitable',
          categoryLabel: 'Gasförderung ohne feste Oberfläche',
          factors: [
            {
              title: 'Gasförderplattform',
              impactPercent: 0,
              isPositive: false,
              description:
                'Keine feste Kruste. Zulässig sind nur Gasförderplattform und Gaskollektoren.',
            },
          ],
          canColonizeNormally: false,
          summary:
            'Gasriesen können nicht normal besiedelt werden, aber mit einer Gasförderplattform wirtschaftlich genutzt werden.',
        },
      };
    }

    // 6. Habitability evaluation
    const assessment = HabitabilityEvaluator.evaluate(planet);
    if (!assessment.canColonizeNormally || assessment.score < 15) {
      return {
        allowed: false,
        reason: `Planet ist für normale Kolonisierung ungeeignet (${assessment.categoryLabel}, Bewohnbarkeit: ${assessment.score}%).`,
        assessment,
      };
    }

    // All conditions satisfied
    return {
      allowed: true,
      assessment,
    };
  }
}
