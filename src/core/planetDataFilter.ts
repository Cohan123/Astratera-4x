/**
 * Astraea 4X - Planetary Information Visibility Filter
 * Enforces the separation between underlying planet properties and player-known intelligence.
 * Operates at the query/data layer to prevent information leakage before investigation.
 */

import { HabitabilityEvaluator } from './habitabilityEvaluator.ts';
import {
  AtmosphereType,
  ColonizationStatus,
  GravityCategory,
  HabitabilityAssessment,
  Moon,
  Planet,
  PlanetType,
  RadiationHazard,
  SurveyStatus,
  TemperatureCategory,
  WaterCategory,
} from './types.ts';

export interface KnownPlanetData {
  id: string;
  name: string;
  systemId: string;
  orbitIndex: number;
  orbitDistanceAu: number;
  orbitalPeriodDays: number;
  surveyStatus: SurveyStatus;
  colonizationStatus: ColonizationStatus;
  colonyId: string | null;

  // Survey-level dependent fields (visible upon basic survey)
  planetType?: PlanetType;
  sizeClass?: number;
  temperatureCategory?: TemperatureCategory;
  moonsCount?: number;
  moons?: Moon[];

  // In-depth analysis fields (visible only when surveyStatus === 'analyzed')
  surfaceTemperatureK?: number;
  atmosphere?: AtmosphereType;
  waterAvailability?: WaterCategory;
  gravityG?: number;
  gravityCategory?: GravityCategory;
  radiationHazard?: RadiationHazard;
  habitability?: number;
  habitabilityAssessment?: HabitabilityAssessment;
  anomalyDetected?: boolean;

  // Display status helpers
  isAnalyzed: boolean;
  isSurveyed: boolean;
  isColonized: boolean;
}

export class PlanetDataFilter {
  /**
   * Filters a Planet entity based on its survey/investigation state
   */
  public static getKnownPlanetData(planet: Planet): KnownPlanetData {
    const isAnalyzed = planet.surveyStatus === 'analyzed';
    const isSurveyed = planet.surveyStatus === 'surveyed' || isAnalyzed;
    const isColonized = planet.colonizationStatus === 'colonized';

    const baseData: KnownPlanetData = {
      id: planet.id,
      name: planet.name,
      systemId: planet.systemId,
      orbitIndex: planet.orbitIndex,
      orbitDistanceAu: planet.orbitDistanceAu,
      orbitalPeriodDays: planet.orbitalPeriodDays,
      surveyStatus: planet.surveyStatus,
      colonizationStatus: planet.colonizationStatus,
      colonyId: planet.colonyId,
      isAnalyzed,
      isSurveyed,
      isColonized,
    };

    // If unexplored: only orbital coordinates and designation are known
    if (!isSurveyed) {
      return baseData;
    }

    // Surveyed: coarse type, size, temperature category, moons known
    baseData.planetType = planet.planetType;
    baseData.sizeClass = planet.sizeClass;
    baseData.temperatureCategory = planet.temperatureCategory;
    baseData.moonsCount = planet.moonsCount;
    baseData.moons = planet.moons ?? [];

    // Analyzed: full deep telemetry, radiation, habitability breakdown unlocked
    if (isAnalyzed) {
      baseData.surfaceTemperatureK = planet.surfaceTemperatureK;
      baseData.atmosphere = planet.atmosphere;
      baseData.waterAvailability = planet.waterAvailability;
      baseData.gravityG = planet.gravityG;
      baseData.gravityCategory = planet.gravityCategory;
      baseData.radiationHazard = planet.radiationHazard;
      baseData.habitability = planet.habitability;
      baseData.habitabilityAssessment = HabitabilityEvaluator.evaluate(planet);
      baseData.anomalyDetected = planet.anomalyDetected;
    }

    return baseData;
  }
}
