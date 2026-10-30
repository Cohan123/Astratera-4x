/**
 * Astraea 4X - Procedural Galaxy Generator
 * Produces deterministic, reproducible galaxies based on Seed and Configuration.
 * Enforces spatial separation, spectral variety, hyperlane connectivity, and data extensibility.
 */

import {
  AsteroidBelt,
  Galaxy,
  GalaxyConfig,
  Planet,
  Star,
  StarSpectralClass,
  StarSystem,
} from '../core/types.ts';
import { STAR_SPECTRAL_CATALOG, STAR_SPAWN_WEIGHTS } from '../data/starClassCatalog.ts';
import { PlanetGenerator } from './planetGenerator.ts';
import { StarNameGenerator } from './nameGenerator.ts';
import { SeededPRNG } from './prng.ts';

export class GalaxyGenerator {
  /**
   * Version der Galaxie-Layout-Generierung. Seeds aus der Seed-Bibliothek
   * speichern diese Version, damit sich eine spätere Generatoränderung
   * erkennen lässt (ein gespeicherter Spielstand wird nie neu generiert).
   */
  public static readonly GENERATOR_VERSION = 1;

  /**
   * Validates and sanitizes configuration
   */
  public static sanitizeConfig(rawConfig: Partial<GalaxyConfig>): GalaxyConfig {
    const minDistance = Math.max(20, Math.min(200, rawConfig.minDistance ?? 60));
    const width = Math.max(300, Math.min(5000, rawConfig.width ?? 1200));
    const height = Math.max(300, Math.min(5000, rawConfig.height ?? 1200));

    // Cap system count based on area and min distance to guarantee placement
    const maxDensitySystems = Math.floor((width * height) / (minDistance * minDistance * 1.5));
    const requestedCount = rawConfig.systemCount ?? 50;
    const systemCount = Math.max(5, Math.min(Math.min(requestedCount, 300), maxDensitySystems));

    return {
      size: rawConfig.size ?? 'medium',
      systemCount,
      width,
      height,
      minDistance,
      shape: rawConfig.shape ?? 'spiral',
      seed: (rawConfig.seed && rawConfig.seed.trim().length > 0) ? rawConfig.seed.trim() : 'ASTRAEA-77',
      // Fraktionsauswahl prägt nur Startaufstellung und Spielstand, nicht das
      // Layout; sie wird hier unverändert durchgereicht und später validiert.
      ...(rawConfig.playerFactionId ? { playerFactionId: rawConfig.playerFactionId } : {}),
      ...(typeof rawConfig.aiFactionCount === 'number'
        ? { aiFactionCount: rawConfig.aiFactionCount }
        : {}),
    };
  }

  /**
   * Deterministically generates a galaxy from configuration
   */
  public static generate(rawConfig: Partial<GalaxyConfig>): Galaxy {
    const config = this.sanitizeConfig(rawConfig);
    const prng = new SeededPRNG(config.seed);
    const nameGen = new StarNameGenerator(prng);

    const systems: StarSystem[] = [];
    const maxRadius = Math.min(config.width, config.height) * 0.44;

    // Generate positions using rejection sampling with minimum distance
    for (let i = 0; i < config.systemCount; i++) {
      let x = 0;
      let y = 0;
      let placed = false;
      let attempts = 0;
      let currentMinDist = config.minDistance;

      while (!placed && attempts < 1000) {
        attempts++;

        // After many attempts, gently relax distance to guarantee completion
        if (attempts > 500) {
          currentMinDist = config.minDistance * 0.85;
        }

        const candidate = this.samplePosition(prng, config.shape, maxRadius);
        x = Math.round(candidate.x);
        y = Math.round(candidate.y);

        // Check boundary limits [-width/2, width/2], [-height/2, height/2]
        const halfW = config.width / 2;
        const halfH = config.height / 2;
        if (x < -halfW || x > halfW || y < -halfH || y > halfH) {
          continue;
        }

        // Check distance to all already placed systems
        let tooClose = false;
        for (const existing of systems) {
          const dx = existing.x - x;
          const dy = existing.y - y;
          const distSq = dx * dx + dy * dy;
          if (distSq < currentMinDist * currentMinDist) {
            tooClose = true;
            break;
          }
        }

        if (!tooClose) {
          placed = true;
        }
      }

      // Generate System details
      const systemId = `SYS-${String(i + 1).padStart(4, '0')}`;
      const systemName = nameGen.generateUniqueName();
      const star = this.generateStar(prng, systemId, systemName);
      const planetCount = this.calculatePlanetCount(prng, star.spectralClass);
      
      // Starting system (index 0) is surveyed, rest unexplored
      const discoveryStatus = i === 0 ? 'surveyed' : 'unexplored';
      const anomalyDetected = prng.next() < 0.22; // 22% chance of special anomaly

      // Procedural planets generation (deterministic and isolated)
      const planets = PlanetGenerator.generateSystemPlanets(
        config.seed,
        systemId,
        systemName,
        star,
        planetCount,
        i === 0
      );

      systems.push({
        id: systemId,
        name: systemName,
        x,
        y,
        star,
        planetCount: planets.length,
        planets,
        discoveryStatus,
        ownerFactionId: i === 0 ? 'faction-player-home' : null,
        hyperlanes: [],
        anomalyDetected,
        asteroidBelts: this.generateAsteroidBelts(config.seed, systemId, systemName, planets),
      });
    }

    // Generate hyperlanes between neighboring systems
    this.generateHyperlanes(systems, config.minDistance * 2.6);

    return {
      id: `gal-${config.seed.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`,
      name: `Sektor ${config.seed.toUpperCase()}`,
      seed: config.seed,
      config,
      systems,
      createdAt: Date.now(),
    };
  }

  /**
   * Erzeugt Asteroidengürtel für ein System aus einem eigenen PRNG-Strom.
   *
   * Der separate Seed (`...:<systemId>:belts`) lässt die bestehende
   * Galaxiegenerierung unverändert, da keine Züge aus dem Hauptstrom
   * verbraucht werden. Gürtel liegen bevorzugt in ausreichend breiten
   * Lücken zwischen zwei Planetenbahnen, sonst außerhalb der letzten Bahn.
   */
  private static generateAsteroidBelts(
    galaxySeed: string,
    systemId: string,
    systemName: string,
    planets: Planet[]
  ): AsteroidBelt[] {
    if (planets.length === 0) {
      return [];
    }

    const prng = new SeededPRNG(`${galaxySeed}:${systemId}:belts`);
    const roll = prng.next();
    const beltCount = roll < 0.45 ? 1 : roll < 0.6 ? 2 : 0;
    if (beltCount === 0) {
      return [];
    }

    const sorted = [...planets].sort((a, b) => a.orbitDistanceAu - b.orbitDistanceAu);
    const gaps: Array<{ innerAu: number; outerAu: number }> = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const innerAu = sorted[i].orbitDistanceAu * 1.18;
      const outerAu = sorted[i + 1].orbitDistanceAu * 0.86;
      if (outerAu > innerAu) {
        gaps.push({ innerAu, outerAu });
      }
    }

    const last = sorted[sorted.length - 1];
    const outerFallback = { innerAu: last.orbitDistanceAu * 1.35, outerAu: last.orbitDistanceAu * 1.95 };

    const belts: AsteroidBelt[] = [];
    for (let index = 0; index < beltCount; index++) {
      let span = gaps.length > 0 ? gaps[prng.nextInt(0, gaps.length - 1)] : outerFallback;
      if (index > 0 && belts.length > 0) {
        const previous = belts[belts.length - 1];
        span = previous.midpointAu >= last.orbitDistanceAu ? outerFallback : span;
      }

      const innerAu = Number(span.innerAu.toFixed(2));
      const outerAu = Number(span.outerAu.toFixed(2));
      const midpointAu = Number(((innerAu + outerAu) / 2).toFixed(2));
      const composition = prng.pickWeighted([
        { item: 'rocky' as const, weight: 55 },
        { item: 'metallic' as const, weight: 25 },
        { item: 'icy' as const, weight: 20 },
      ]);

      belts.push({
        id: `${systemId}-B${index + 1}`,
        name: `${systemName} Gürtel${index > 0 ? ' II' : ''}`,
        systemId,
        innerAu,
        outerAu,
        midpointAu,
        density: Number(prng.nextFloat(0.35, 0.85).toFixed(2)),
        composition,
      });
    }

    return belts;
  }

  /**
   * Samples a 2D coordinate based on the chosen galaxy shape
   */
  private static samplePosition(
    prng: SeededPRNG,
    shape: GalaxyConfig['shape'],
    maxRadius: number
  ): { x: number; y: number } {
    switch (shape) {
      case 'spiral': {
        // 2 or 4 arm logarithmic spiral
        const armCount = 2;
        const armIndex = prng.nextInt(0, armCount - 1);
        const distRatio = Math.pow(prng.next(), 0.65); // denser towards core
        const r = distRatio * maxRadius;
        const armOffset = (armIndex * 2 * Math.PI) / armCount;
        const spiralWinding = 3.2;
        const theta = armOffset + distRatio * spiralWinding * Math.PI;

        // Dispersal perpendicular to arm
        const jitterRadius = prng.nextFloat(5, maxRadius * 0.16);
        const jitterAngle = prng.nextFloat(0, Math.PI * 2);

        return {
          x: r * Math.cos(theta) + jitterRadius * Math.cos(jitterAngle),
          y: r * Math.sin(theta) + jitterRadius * Math.sin(jitterAngle),
        };
      }

      case 'ring': {
        // Torus / Ring galaxy with thin core
        const isCore = prng.next() < 0.12;
        if (isCore) {
          const r = prng.nextFloat(0, maxRadius * 0.25);
          const theta = prng.nextFloat(0, Math.PI * 2);
          return { x: r * Math.cos(theta), y: r * Math.sin(theta) };
        }
        const innerRing = maxRadius * 0.45;
        const ringWidth = maxRadius * 0.5;
        const r = innerRing + prng.next() * ringWidth;
        const theta = prng.nextFloat(0, Math.PI * 2);
        return {
          x: r * Math.cos(theta),
          y: r * Math.sin(theta),
        };
      }

      case 'cluster': {
        // 3-4 sub-cluster centers
        const centers = [
          { x: -maxRadius * 0.4, y: -maxRadius * 0.3 },
          { x: maxRadius * 0.4, y: -maxRadius * 0.2 },
          { x: -maxRadius * 0.2, y: maxRadius * 0.4 },
          { x: maxRadius * 0.35, y: maxRadius * 0.35 },
        ];
        const center = prng.pick(centers);
        const r = Math.pow(prng.next(), 0.5) * (maxRadius * 0.38);
        const theta = prng.nextFloat(0, Math.PI * 2);
        return {
          x: center.x + r * Math.cos(theta),
          y: center.y + r * Math.sin(theta),
        };
      }

      case 'elliptical':
      default: {
        // Elliptical galaxy with core density concentration
        const r = Math.pow(prng.next(), 0.8) * maxRadius;
        const theta = prng.nextFloat(0, Math.PI * 2);
        const stretchY = 0.72; // slight elliptical flattening
        return {
          x: r * Math.cos(theta),
          y: r * Math.sin(theta) * stretchY,
        };
      }
    }
  }

  /**
   * Generates a Star entity with realistic astrophysics
   */
  private static generateStar(prng: SeededPRNG, id: string, name: string): Star {
    const spectralClass = prng.pickWeighted(
      STAR_SPAWN_WEIGHTS.map((w) => ({ item: w.class, weight: w.weight }))
    );
    const info = STAR_SPECTRAL_CATALOG[spectralClass];

    // Jitter mass & temp slightly within realistic band
    const massVariance = prng.nextFloat(0.9, 1.1);
    const tempVariance = prng.nextFloat(0.95, 1.05);

    // Binary star possibility (approx 12% of main sequence stars)
    const isBinary =
      spectralClass !== 'BLACK_HOLE' &&
      spectralClass !== 'NEUTRON' &&
      prng.next() < 0.12;

    let secondaryStar = undefined;
    if (isBinary) {
      const secClass: StarSpectralClass = prng.pick(['K', 'M', 'WHITE_DWARF'] as StarSpectralClass[]);
      const secInfo = STAR_SPECTRAL_CATALOG[secClass];
      const secMassVar = prng.nextFloat(0.85, 1.05);
      secondaryStar = {
        id: `star-${id}-beta`,
        name: `${name} Beta`,
        spectralClass: secClass,
        color: secInfo.color,
        glowColor: secInfo.glowColor,
        temperatureK: Math.round(secInfo.temperatureK * prng.nextFloat(0.95, 1.05)),
        luminositySolar: Number((secInfo.luminositySolar * secMassVar).toFixed(4)),
        massSolar: Number((secInfo.massSolar * secMassVar).toFixed(2)),
        radiusKm: Math.round(secInfo.baseRadiusPx * 120000 * secMassVar),
      };
    }

    return {
      id: `star-${id}`,
      name: `${name} Alpha`,
      spectralClass,
      color: info.color,
      glowColor: info.glowColor,
      temperatureK: Math.round(info.temperatureK * tempVariance),
      luminositySolar: Number((info.luminositySolar * massVariance).toFixed(4)),
      massSolar: Number((info.massSolar * massVariance).toFixed(2)),
      radiusKm: Math.round(info.baseRadiusPx * 120000 * massVariance),
      isBinary,
      secondaryStar,
    };
  }

  /**
   * Calculates preliminary planet count based on star classification
   */
  private static calculatePlanetCount(prng: SeededPRNG, spectralClass: StarSpectralClass): number {
    switch (spectralClass) {
      case 'G':
      case 'K':
        // High propensity for multi-planet planetary systems (3 to 8)
        return prng.nextInt(3, 8);
      case 'F':
      case 'A':
        return prng.nextInt(2, 6);
      case 'M':
        // Red dwarfs often have compact rocky systems (1 to 6)
        return prng.nextInt(1, 6);
      case 'B':
      case 'O':
        // Young massive stars have fewer developed stable planets (0 to 3)
        return prng.nextInt(0, 3);
      case 'RED_GIANT':
        // Planets often engulfed or scorched (0 to 4 outer gas/rock survivors)
        return prng.nextInt(0, 4);
      case 'WHITE_DWARF':
      case 'NEUTRON':
        return prng.nextInt(0, 2);
      case 'BLACK_HOLE':
        return prng.nextInt(0, 1);
      default:
        return prng.nextInt(1, 5);
    }
  }

  /**
   * Generates hyperlane connections between close star systems
   */
  private static generateHyperlanes(systems: StarSystem[], maxLaneDist: number): void {
    const maxDistSq = maxLaneDist * maxLaneDist;

    for (let i = 0; i < systems.length; i++) {
      const a = systems[i];
      // Find distances to all other systems
      const distances: Array<{ id: string; distSq: number }> = [];

      for (let j = 0; j < systems.length; j++) {
        if (i === j) continue;
        const b = systems[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distSq = dx * dx + dy * dy;
        if (distSq <= maxDistSq) {
          distances.push({ id: b.id, distSq });
        }
      }

      // Sort by proximity and pick 2-4 nearest neighbors
      distances.sort((d1, d2) => d1.distSq - d2.distSq);
      const connectionsCount = Math.min(distances.length, 3);

      for (let k = 0; k < connectionsCount; k++) {
        const targetId = distances[k].id;
        if (!a.hyperlanes.includes(targetId)) {
          a.hyperlanes.push(targetId);
        }
        // Bidirectional connection
        const targetSys = systems.find((s) => s.id === targetId);
        if (targetSys && !targetSys.hyperlanes.includes(a.id)) {
          targetSys.hyperlanes.push(a.id);
        }
      }
    }
  }
}
