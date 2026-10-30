/**
 * Astraea 4X - Procedural Planet Generator
 * Generates deterministic, scientifically plausible planetary systems
 * based on Star classification, orbital zones, and isolated seeded PRNG streams.
 */

import {
  AtmosphereType,
  GravityCategory,
  HabitabilityTier,
  Moon,
  MoonType,
  Planet,
  PlanetType,
  Star,
  StarSpectralClass,
  SurveyStatus,
  TemperatureCategory,
  WaterCategory,
} from '../core/types.ts';
import { PLANET_CATALOG } from '../data/planetCatalog.ts';
import { PLANET_GENERATION_CONFIG } from './planetGenerationConfig.ts';
import { SeededPRNG } from './prng.ts';

export class PlanetGenerator {
  private static readonly ROMAN_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

  /**
   * Generates all planets for a given star system deterministically
   */
  public static generateSystemPlanets(
    galaxySeed: string,
    systemId: string,
    systemName: string,
    star: Star,
    planetCount: number,
    isHomeSystem: boolean = false
  ): Planet[] {
    // Isolated seed derived strictly from galaxy seed + system ID
    const systemSeed = `${galaxySeed}:${systemId}:planets`;
    const prng = new SeededPRNG(systemSeed);

    const planets: Planet[] = [];
    const count = Math.max(0, Math.min(10, planetCount));

    // Calculate habitable zone bounds based on star luminosity
    // L_sol equivalent: d_hab ~ sqrt(L_star)
    const lumFactor = Math.max(0.01, star.luminositySolar);
    const habZoneCenter = Math.max(0.2, Math.sqrt(lumFactor));
    const innerZoneBound = habZoneCenter * 0.65;
    const outerZoneBound = habZoneCenter * 1.8;

    let currentAu = Math.max(0.25, innerZoneBound * 0.45);

    for (let orbitIndex = 1; orbitIndex <= count; orbitIndex++) {
      // Step outward following geometric progression with slight random variance
      const auSpacing = prng.nextFloat(0.35, 0.75) * Math.pow(1.38, orbitIndex - 1);
      currentAu += auSpacing;
      const orbitDistanceAu = Number(currentAu.toFixed(2));

      // Calculate Keplerian orbital period (T ~ sqrt(a^3 / M_star) * 365 days)
      const massFactor = Math.max(0.1, star.massSolar);
      const orbitalPeriodDays = Math.round(Math.sqrt(Math.pow(orbitDistanceAu, 3) / massFactor) * 365);
      const currentAngleRad = Number((prng.next() * Math.PI * 2).toFixed(3));

      // Determine orbital zone
      let zone: 'inner' | 'habitable' | 'outer';
      if (orbitDistanceAu < innerZoneBound) {
        zone = 'inner';
      } else if (orbitDistanceAu <= outerZoneBound) {
        zone = 'habitable';
      } else {
        zone = 'outer';
      }

      // Pick planet type based on zone and star class
      const planetType = this.pickPlanetType(prng, zone, star.spectralClass);
      const typeDef = PLANET_CATALOG[planetType];

      // Calculate physical properties
      const sizeClass = prng.nextInt(typeDef.baseSlotRange[0], typeDef.baseSlotRange[1]);
      const hasRings = planetType === 'gas_giant' ? prng.next() < 0.65 : prng.next() < 0.04;
      const moonsCount = planetType === 'gas_giant' ? prng.nextInt(3, 14) : prng.nextInt(0, 3);

      // Temperature calculation
      const { tempK, tempCategory } = this.calculateTemperature(prng, star, orbitDistanceAu, planetType);

      // Atmosphere, Water, Gravity
      const atmosphere = this.pickAtmosphere(prng, planetType, zone, tempCategory);
      const waterAvailability = this.pickWater(prng, planetType, tempCategory, atmosphere);
      const { gravityG, gravityCategory } = this.calculateGravity(prng, planetType, sizeClass);

      // Habitability
      const { habitability, habitabilityTier } = this.calculateHabitability(
        planetType,
        tempCategory,
        atmosphere,
        waterAvailability,
        gravityCategory
      );

      // Discovery / Survey Status
      let surveyStatus: SurveyStatus = 'unexplored';
      if (isHomeSystem && orbitIndex <= 3) {
        surveyStatus = 'analyzed';
      }

      // Radiation Hazard
      let radiationHazard: 'negligible' | 'moderate' | 'severe' | 'lethal' = 'negligible';
      if (star.spectralClass === 'NEUTRON' || star.spectralClass === 'BLACK_HOLE') {
        radiationHazard = prng.pickWeighted([
          { item: 'severe', weight: 40 },
          { item: 'lethal', weight: 60 },
        ]);
      } else if (atmosphere === 'breathable') {
        radiationHazard = 'negligible';
      } else if (atmosphere === 'none') {
        radiationHazard = prng.pickWeighted([
          { item: 'moderate', weight: 55 },
          { item: 'severe', weight: 35 },
          { item: 'lethal', weight: 10 },
        ]);
      } else {
        radiationHazard = prng.pickWeighted([
          { item: 'negligible', weight: 50 },
          { item: 'moderate', weight: 40 },
          { item: 'severe', weight: 10 },
        ]);
      }

      // Geological Stability
      let geologicalStability: 'stable' | 'tectonic_activity' | 'extreme_volcanism' = 'stable';
      if (planetType === 'volcanic') {
        geologicalStability = 'extreme_volcanism';
      } else if (planetType === 'xeno') {
        // Fremdartige Tektonik: häufig aktiv, aber nicht zwingend vulkanisch.
        geologicalStability = prng.next() < 0.35 ? 'tectonic_activity' : 'stable';
      } else if (planetType === 'toxic' || tempCategory === 'hot') {
        geologicalStability = prng.next() < 0.4 ? 'tectonic_activity' : 'stable';
      }

      const romanName = this.ROMAN_NUMERALS[orbitIndex - 1] || `${orbitIndex}`;
      const planetId = `${systemId}-P${orbitIndex}`;
      const planetName = `${systemName} ${romanName}`;

      planets.push({
        id: planetId,
        name: planetName,
        systemId,
        orbitIndex,
        orbitDistanceAu,
        orbitalPeriodDays,
        currentAngleRad,
        planetType,
        sizeClass,
        surfaceTemperatureK: tempK,
        temperatureCategory: tempCategory,
        atmosphere,
        waterAvailability,
        gravityG,
        gravityCategory,
        radiationHazard,
        geologicalStability,
        habitability,
        habitabilityTier,
        surveyStatus,
        colonizationStatus: 'uncolonized',
        colonyId: null,
        hasRings,
        anomalyDetected: prng.next() < 0.15,
        color: typeDef.color,
        accentColor: typeDef.accentColor,
        texturePattern: typeDef.texturePattern,
        moonsCount,
        moons: this.generateMoons(galaxySeed, systemId, planetId, planetName, planetType, moonsCount, gravityG),
      });
    }

    return planets;
  }

  /**
   * Erzeugt die Monde eines Planeten aus einem eigenen PRNG-Strom.
   *
   * Der separate Seed (`...:planet-<index>:moons`) sorgt dafür, dass die
   * bestehende Planeten- und Galaxiegenerierung bitgenau unverändert bleibt:
   * Monde sind rein additive Daten und verschieben den Haupt-Zufallsstrom nicht.
   */
  private static generateMoons(
    galaxySeed: string,
    systemId: string,
    planetId: string,
    planetName: string,
    planetType: PlanetType,
    moonsCount: number,
    gravityG: number
  ): Moon[] {
    const count = Math.max(0, Math.min(14, moonsCount));
    if (count === 0) {
      return [];
    }

    const prng = new SeededPRNG(`${galaxySeed}:${systemId}:${planetId}:moons`);
    const moons: Moon[] = [];
    const isGasGiant = planetType === 'gas_giant';
    let orbitRadiusPlanetRadii = isGasGiant ? 1.9 : 2.2;

    for (let index = 1; index <= count; index++) {
      const moonType = this.pickMoonType(prng, isGasGiant);
      const isMajor = isGasGiant ? index <= 4 && prng.next() < 0.85 : true;

      // Große Monde bahnen weiter außen, kleine Krümel dazwischen.
      const step = isMajor ? prng.nextFloat(0.55, 0.85) : prng.nextFloat(0.22, 0.4);
      orbitRadiusPlanetRadii += step;

      const radiusKm = isMajor ? prng.nextInt(420, 2600) : prng.nextInt(40, 380);
      const orbitalPeriodDays = Math.max(
        1,
        Math.round(Math.sqrt(Math.pow(orbitRadiusPlanetRadii, 3) / Math.max(0.2, gravityG)) * 2.4)
      );

      moons.push({
        id: `${planetId}-M${index}`,
        name: `${planetName} ${this.moonLetter(index)}`,
        planetId,
        index,
        moonType,
        orbitRadiusPlanetRadii: Number(orbitRadiusPlanetRadii.toFixed(2)),
        orbitalPeriodDays,
        radiusKm,
        color: this.moonColor(moonType),
        isMajor,
      });
    }

    return moons;
  }

  /** Buchstabenfolge für Mondnamen: A..Z, danach A2, B2, ... */
  private static moonLetter(index: number): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const letter = alphabet[(index - 1) % alphabet.length];
    const cycle = Math.floor((index - 1) / alphabet.length);
    return cycle === 0 ? letter : `${letter}${cycle + 1}`;
  }

  private static pickMoonType(prng: SeededPRNG, isGasGiant: boolean): MoonType {
    const weights: Array<{ item: MoonType; weight: number }> = isGasGiant
      ? [
          { item: 'icy', weight: 45 },
          { item: 'rocky', weight: 30 },
          { item: 'metallic', weight: 15 },
          { item: 'volcanic', weight: 10 },
        ]
      : [
          { item: 'rocky', weight: 55 },
          { item: 'metallic', weight: 20 },
          { item: 'icy', weight: 15 },
          { item: 'volcanic', weight: 10 },
        ];
    return prng.pickWeighted(weights);
  }

  private static moonColor(moonType: MoonType): string {
    switch (moonType) {
      case 'icy':
        return '#BAE6FD';
      case 'volcanic':
        return '#FCA5A5';
      case 'metallic':
        return '#CBD5E1';
      case 'rocky':
      default:
        return '#D6D3D1';
    }
  }

  /**
   * Selects a plausible planet type according to the orbital zone and star nature
   */
  private static pickPlanetType(
    prng: SeededPRNG,
    zone: 'inner' | 'habitable' | 'outer',
    starClass: StarSpectralClass
  ): PlanetType {
    if (starClass === 'BLACK_HOLE' || starClass === 'NEUTRON') {
      return prng.pickWeighted([
        { item: 'rocky' as PlanetType, weight: 40 },
        { item: 'toxic' as PlanetType, weight: 35 },
        { item: 'ice' as PlanetType, weight: 25 },
      ]);
    }

    if (zone === 'inner') {
      return prng.pickWeighted([
        { item: 'volcanic' as PlanetType, weight: 35 },
        { item: 'toxic' as PlanetType, weight: 30 },
        { item: 'desert' as PlanetType, weight: 20 },
        { item: 'rocky' as PlanetType, weight: 15 },
        { item: 'xeno' as PlanetType, weight: PLANET_GENERATION_CONFIG.xenoworldWeight.inner },
      ]);
    }

    if (zone === 'habitable') {
      return prng.pickWeighted([
        { item: 'rocky' as PlanetType, weight: 35 },
        { item: 'ocean' as PlanetType, weight: 25 },
        { item: 'desert' as PlanetType, weight: 20 },
        { item: 'ice' as PlanetType, weight: 12 },
        { item: 'gas_giant' as PlanetType, weight: 8 }, // Hot jupiters/outer fringe
        { item: 'xeno' as PlanetType, weight: PLANET_GENERATION_CONFIG.xenoworldWeight.habitable },
      ]);
    }

    // Outer Zone
    return prng.pickWeighted([
      { item: 'gas_giant' as PlanetType, weight: 45 },
      { item: 'ice' as PlanetType, weight: 35 },
      { item: 'rocky' as PlanetType, weight: 12 },
      { item: 'toxic' as PlanetType, weight: 8 },
      { item: 'xeno' as PlanetType, weight: PLANET_GENERATION_CONFIG.xenoworldWeight.outer },
    ]);
  }

  /**
   * Calculates surface temperature in Kelvin and categorizes it
   */
  private static calculateTemperature(
    prng: SeededPRNG,
    star: Star,
    distanceAu: number,
    planetType: PlanetType
  ): { tempK: number; tempCategory: TemperatureCategory } {
    const baseTempK = Math.round(
      (star.temperatureK * Math.pow(star.radiusKm / (distanceAu * 149597870 * 2), 0.5) * 1.45)
    );

    // Apply greenhouse and albedo adjustments by planet type
    let modifier = 1.0;
    if (planetType === 'volcanic') modifier = 1.6;
    if (planetType === 'toxic') modifier = 1.8; // Runaway greenhouse
    if (planetType === 'ice') modifier = 0.75; // High albedo
    if (planetType === 'ocean') modifier = 1.05;
    if (planetType === 'xeno') modifier = 0.95; // Fremdartige, aber stabile Biosphäre

    const jitter = prng.nextFloat(0.92, 1.08);
    const tempK = Math.max(30, Math.min(1800, Math.round(baseTempK * modifier * jitter)));

    let tempCategory: TemperatureCategory;
    if (tempK < 180) {
      tempCategory = 'freezing';
    } else if (tempK < 260) {
      tempCategory = 'cold';
    } else if (tempK <= 315) {
      tempCategory = 'temperate';
    } else if (tempK <= 400) {
      tempCategory = 'hot';
    } else {
      tempCategory = 'scorching';
    }

    return { tempK, tempCategory };
  }

  /**
   * Selects atmosphere type
   */
  private static pickAtmosphere(
    prng: SeededPRNG,
    planetType: PlanetType,
    zone: 'inner' | 'habitable' | 'outer',
    tempCategory: TemperatureCategory
  ): AtmosphereType {
    if (planetType === 'gas_giant') {
      return prng.pick(['dense', 'toxic'] as AtmosphereType[]);
    }

    if (planetType === 'volcanic') {
      return prng.pick(['corrosive', 'toxic', 'dense'] as AtmosphereType[]);
    }

    if (planetType === 'toxic') {
      return prng.pick(['toxic', 'corrosive', 'dense'] as AtmosphereType[]);
    }

    if (planetType === 'xeno') {
      return prng.pick(['toxic', 'corrosive', 'thin'] as AtmosphereType[]);
    }

    if (zone === 'habitable' && (tempCategory === 'temperate' || tempCategory === 'cold')) {
      if (planetType === 'ocean' || planetType === 'rocky') {
        return prng.pickWeighted([
          { item: 'breathable' as AtmosphereType, weight: 65 },
          { item: 'thin' as AtmosphereType, weight: 20 },
          { item: 'dense' as AtmosphereType, weight: 15 },
        ]);
      }
      if (planetType === 'desert') {
        return prng.pickWeighted([
          { item: 'breathable' as AtmosphereType, weight: 45 },
          { item: 'thin' as AtmosphereType, weight: 40 },
          { item: 'toxic' as AtmosphereType, weight: 15 },
        ]);
      }
    }

    if (tempCategory === 'freezing') {
      return prng.pickWeighted([
        { item: 'thin' as AtmosphereType, weight: 50 },
        { item: 'none' as AtmosphereType, weight: 35 },
        { item: 'dense' as AtmosphereType, weight: 15 },
      ]);
    }

    return prng.pick(['none', 'thin', 'dense'] as AtmosphereType[]);
  }

  /**
   * Selects water availability
   */
  private static pickWater(
    prng: SeededPRNG,
    planetType: PlanetType,
    tempCategory: TemperatureCategory,
    atmosphere: AtmosphereType
  ): WaterCategory {
    if (planetType === 'ocean') {
      return 'liquid_ocean';
    }

    if (planetType === 'gas_giant' || planetType === 'volcanic') {
      return 'none';
    }

    if (planetType === 'xeno') {
      return prng.pickWeighted([
        { item: 'moderate' as WaterCategory, weight: 60 },
        { item: 'trace' as WaterCategory, weight: 30 },
        { item: 'abundant' as WaterCategory, weight: 10 },
      ]);
    }

    if (tempCategory === 'scorching') {
      return 'none';
    }

    if (planetType === 'desert') {
      return prng.pickWeighted([
        { item: 'trace' as WaterCategory, weight: 70 },
        { item: 'none' as WaterCategory, weight: 25 },
        { item: 'moderate' as WaterCategory, weight: 5 },
      ]);
    }

    if (planetType === 'ice') {
      return prng.pickWeighted([
        { item: 'abundant' as WaterCategory, weight: 65 }, // Frozen water
        { item: 'trace' as WaterCategory, weight: 25 },
        { item: 'moderate' as WaterCategory, weight: 10 },
      ]);
    }

    if (planetType === 'rocky') {
      if (tempCategory === 'temperate' && atmosphere === 'breathable') {
        return prng.pickWeighted([
          { item: 'moderate' as WaterCategory, weight: 50 },
          { item: 'abundant' as WaterCategory, weight: 35 },
          { item: 'trace' as WaterCategory, weight: 15 },
        ]);
      }
      return prng.pickWeighted([
        { item: 'trace' as WaterCategory, weight: 60 },
        { item: 'none' as WaterCategory, weight: 30 },
        { item: 'moderate' as WaterCategory, weight: 10 },
      ]);
    }

    return 'none';
  }

  /**
   * Calculates gravity in G
   */
  private static calculateGravity(
    prng: SeededPRNG,
    planetType: PlanetType,
    sizeClass: number
  ): { gravityG: number; gravityCategory: GravityCategory } {
    let baseG = sizeClass / 16;
    if (planetType === 'gas_giant') {
      baseG *= prng.nextFloat(2.2, 3.8);
    } else {
      baseG *= prng.nextFloat(0.85, 1.15);
    }
    const gravityG = Number(baseG.toFixed(2));

    let gravityCategory: GravityCategory;
    if (gravityG < 0.7) {
      gravityCategory = 'low';
    } else if (gravityG <= 1.25) {
      gravityCategory = 'standard';
    } else if (gravityG <= 1.95) {
      gravityCategory = 'high';
    } else {
      gravityCategory = 'extreme';
    }

    return { gravityG, gravityCategory };
  }

  /**
   * Calculates overall preliminary habitability score (0 - 100%) and tier
   */
  private static calculateHabitability(
    planetType: PlanetType,
    tempCategory: TemperatureCategory,
    atmosphere: AtmosphereType,
    waterAvailability: WaterCategory,
    gravityCategory: GravityCategory
  ): { habitability: number; habitabilityTier: HabitabilityTier } {
    if (planetType === 'gas_giant') {
      return { habitability: 0, habitabilityTier: 'uninhabitable' };
    }

    let score = PLANET_CATALOG[planetType].baseHabitability;

    // Atmosphere penalty / bonus
    if (atmosphere === 'breathable') score += 15;
    else if (atmosphere === 'thin') score -= 15;
    else if (atmosphere === 'dense') score -= 20;
    else if (atmosphere === 'toxic' || atmosphere === 'corrosive') score -= 45;
    else if (atmosphere === 'none') score -= 35;

    // Temperature penalty / bonus
    if (tempCategory === 'temperate') score += 12;
    else if (tempCategory === 'cold') score -= 10;
    else if (tempCategory === 'hot') score -= 15;
    else if (tempCategory === 'freezing') score -= 35;
    else if (tempCategory === 'scorching') score -= 50;

    // Water penalty / bonus
    if (waterAvailability === 'liquid_ocean' || waterAvailability === 'abundant') score += 10;
    else if (waterAvailability === 'moderate') score += 5;
    else if (waterAvailability === 'trace') score -= 10;
    else if (waterAvailability === 'none') score -= 25;

    // Gravity penalty / bonus
    if (gravityCategory === 'standard') score += 5;
    else if (gravityCategory === 'low') score -= 10;
    else if (gravityCategory === 'high') score -= 15;
    else if (gravityCategory === 'extreme') score -= 40;

    const habitability = Math.max(0, Math.min(100, Math.round(score)));

    let habitabilityTier: HabitabilityTier;
    if (habitability === 0) {
      habitabilityTier = 'uninhabitable';
    } else if (habitability <= 25) {
      habitabilityTier = 'hostile';
    } else if (habitability <= 55) {
      habitabilityTier = 'harsh';
    } else if (habitability <= 80) {
      habitabilityTier = 'moderate';
    } else {
      habitabilityTier = 'ideal';
    }

    return { habitability, habitabilityTier };
  }
}
