/**
 * Astraea 4X - Startplatzierung und Habitabilitätsgarantie
 *
 * Der Spieler startet weiterhin im System 0, damit Startflotte, Tests und
 * bestehende Spielstände konsistent bleiben. Falls dort kein Planet die echte
 * Habitabilitätslogik erfüllt, werden ausschließlich die Planeten dieses
 * Systems mit einem abgeleiteten Seed neu erzeugt; die übrige Galaxie bleibt
 * unverändert. KI-Heimatsysteme werden deterministisch so gewählt, dass ihre
 * Hyperlane-Distanz zu allen bereits vergebenen Starts möglichst groß ist.
 */

import {
  Galaxy,
  HumanFactionId,
  Planet,
  StarSystem,
} from '../core/types.ts';
import { HabitabilityEvaluator } from '../core/habitabilityEvaluator.ts';
import { PlanetGenerator } from '../generation/planetGenerator.ts';
import {
  DEFAULT_AI_FACTION_COUNT,
  DEFAULT_PLAYER_FACTION_ID,
  buildFactionAssignments,
  clampAiFactionCount,
  isHumanFactionId,
} from '../data/factionCatalog.ts';

/** Minimale Bewohnbarkeit, die die echte Kolonisationslogik verlangt. */
export const MIN_START_HABITABILITY = 15;
/** Mindestbewohnbarkeit eines KI-Heimatsplaneten (bestehende Regel). */
export const MIN_AI_HOME_HABITABILITY = 50;
/** So viele deterministische Neuversuche, bevor kontrolliert nachgeholfen wird. */
export const HOME_REGENERATION_ATTEMPTS = 64;

export interface PlayerHomeResult {
  system: StarSystem | null;
  habitablePlanet: Planet | null;
  regenerated: boolean;
  attempts: number;
  forced: boolean;
}

export interface AiPlacementResult {
  systemIds: string[];
  desiredHops: number;
  achievedMinHops: number;
  warnings: string[];
}

/** Prüft einen Planeten mit genau der Logik, die auch die Kolonisation nutzt. */
export function isHabitableStartPlanet(planet: Planet): boolean {
  if (planet.planetType === 'gas_giant') return false;
  if (planet.radiationHazard === 'lethal') return false;
  const assessment = HabitabilityEvaluator.evaluate(planet);
  return assessment.canColonizeNormally && assessment.score >= MIN_START_HABITABILITY;
}

export function findHabitablePlanet(system: StarSystem | null | undefined): Planet | null {
  if (!system?.planets?.length) return null;
  return (
    [...system.planets]
      .sort((a, b) => a.id.localeCompare(b.id))
      .find((planet) => isHabitableStartPlanet(planet)) ?? null
  );
}

function isSuitableAiHomePlanet(planet: Planet): boolean {
  return (
    planet.planetType !== 'gas_giant' &&
    planet.radiationHazard !== 'lethal' &&
    planet.habitability >= MIN_AI_HOME_HABITABILITY
  );
}

export function hasAiHomePlanet(system: StarSystem): boolean {
  return (system.planets ?? []).some(isSuitableAiHomePlanet);
}

/**
 * Erzwingt als letzte, deterministische Rückfallebene einen habitablen
 * Planeten. Nur der Datensatz des Planeten wird angepasst, ID, Bahn und
 * Systemstruktur bleiben erhalten.
 */
function forceHabitablePlanet(system: StarSystem): Planet | null {
  const candidates = [...(system.planets ?? [])]
    .filter((planet) => planet.planetType !== 'gas_giant')
    .sort((a, b) => b.sizeClass - a.sizeClass || a.id.localeCompare(b.id));
  // Notfall: Besteht das System ausschließlich aus Gasriesen, wird der erste
  // Planet deterministisch zu einer festen Welt. Das ist die letzte Rückfallebene
  // und wird nur erreicht, wenn alle Regenerationsversuche erfolglos blieben.
  const planet = candidates[0] ?? system.planets?.[0];
  if (!planet) return null;

  if (planet.planetType === 'gas_giant') {
    planet.planetType = 'rocky';
    planet.sizeClass = Math.max(3, Math.min(planet.sizeClass, 12));
    planet.moons = [];
  }
  planet.atmosphere = 'breathable';
  planet.temperatureCategory = 'temperate';
  planet.surfaceTemperatureK = 288;
  planet.waterAvailability = 'moderate';
  planet.gravityCategory = 'standard';
  planet.gravityG = 1;
  planet.radiationHazard = 'negligible';
  planet.geologicalStability = 'stable';
  planet.habitability = 70;
  planet.habitabilityTier = 'moderate';
  planet.surveyStatus = 'analyzed';
  return planet;
}

/**
 * Stellt sicher, dass das Spieler-Startsystem (System 0) einen habitablen
 * Planeten nach der echten Bewertungslogik enthält. Es wird bewusst keine
 * Kolonie gegründet.
 */
export function ensurePlayerHomeHabitability(galaxy: Galaxy): PlayerHomeResult {
  const system = galaxy.systems[0] ?? null;
  if (!system) {
    return {
      system: null,
      habitablePlanet: null,
      regenerated: false,
      attempts: 0,
      forced: false,
    };
  }

  const existing = findHabitablePlanet(system);
  if (existing) {
    return {
      system,
      habitablePlanet: existing,
      regenerated: false,
      attempts: 0,
      forced: false,
    };
  }

  for (let attempt = 1; attempt <= HOME_REGENERATION_ATTEMPTS; attempt += 1) {
    // Systeme ohne Planeten erhalten mindestens vier Bahnen, damit die
    // Habitabilitätsgarantie nicht an einer leeren Planetenschleife scheitert.
    const regenerationCount = Math.max(system.planetCount, 4);
    const planets = PlanetGenerator.generateSystemPlanets(
      `${galaxy.seed}:home-fix-${attempt}`,
      system.id,
      system.name,
      system.star,
      regenerationCount,
      true,
    );
    const candidate = findHabitablePlanet({ ...system, planets });
    if (!candidate) continue;

    system.planets = planets;
    system.planetCount = planets.length;
    // Gürtel bezogen sich auf die alten Bahnen; für dieses eine System werden
    // sie verworfen, statt inkonsistente Ringe über neuen Bahnen zu zeichnen.
    system.asteroidBelts = [];
    const habitable = findHabitablePlanet(system);
    return {
      system,
      habitablePlanet: habitable,
      regenerated: true,
      attempts: attempt,
      forced: false,
    };
  }

  const forced = forceHabitablePlanet(system);
  return {
    system,
    habitablePlanet: forced,
    regenerated: true,
    attempts: HOME_REGENERATION_ATTEMPTS,
    forced: forced !== null,
  };
}

/** Gewünschte Hyperlane-Distanz, abgeleitet aus der Systemanzahl. */
export function desiredFactionDistanceHops(systemCount: number): number {
  return Math.max(2, Math.min(6, Math.floor(Math.max(0, systemCount) / 10)));
}

function buildAdjacency(galaxy: Galaxy): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  for (const system of galaxy.systems) {
    adjacency.set(system.id, new Set());
  }
  for (const system of galaxy.systems) {
    for (const neighbourId of system.hyperlanes) {
      const neighbour = adjacency.get(neighbourId);
      if (!neighbour) continue;
      adjacency.get(system.id)?.add(neighbourId);
      neighbour.add(system.id);
    }
  }
  return adjacency;
}

/** Anzahl der Hyperlane-Sprünge von einem System zu allen erreichbaren. */
export function computeHopDistances(galaxy: Galaxy, sourceSystemId: string): Map<string, number> {
  const adjacency = buildAdjacency(galaxy);
  const distances = new Map<string, number>();
  if (!adjacency.has(sourceSystemId)) return distances;

  distances.set(sourceSystemId, 0);
  const queue: string[] = [sourceSystemId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const distance = distances.get(current)!;
    for (const neighbour of adjacency.get(current) ?? []) {
      if (distances.has(neighbour)) continue;
      distances.set(neighbour, distance + 1);
      queue.push(neighbour);
    }
  }
  return distances;
}

/**
 * Wählt KI-Startsysteme gierig nach maximaler minimaler Hyperlane-Distanz.
 * Ist die gewünschte Distanz in einer kleinen Galaxie nicht erreichbar, wird
 * sie schrittweise dokumentiert gelockert; der Aufrufer erhält eine Warnung.
 */
export function selectAiHomeSystems(
  galaxy: Galaxy,
  count: number,
  occupiedSystemIds: readonly string[],
): AiPlacementResult {
  const target = Math.max(0, Math.min(7, Math.floor(count)));
  const desiredHops = desiredFactionDistanceHops(galaxy.systems.length);
  const warnings: string[] = [];
  if (target === 0) {
    return { systemIds: [], desiredHops, achievedMinHops: desiredHops, warnings };
  }

  const occupied = [...new Set(occupiedSystemIds)];
  const occupiedSet = new Set(occupied);
  const distanceCache = new Map<string, Map<string, number>>();
  const distanceFrom = (systemId: string) => {
    let map = distanceCache.get(systemId);
    if (!map) {
      map = computeHopDistances(galaxy, systemId);
      distanceCache.set(systemId, map);
    }
    return map;
  };

  const withPlanet = galaxy.systems.filter(
    (system) => !occupiedSet.has(system.id) && hasAiHomePlanet(system),
  );
  const fallback = galaxy.systems.filter(
    (system) => !occupiedSet.has(system.id) && !hasAiHomePlanet(system),
  );

  if (withPlanet.length < target) {
    warnings.push(
      `Nur ${withPlanet.length} von ${target} KI-Startsystemen besitzen einen ausreichend habitablen Planeten; die übrigen Plätze nutzen Ersatzsysteme.`,
    );
  }

  const selected: string[] = [];
  let achievedMinHops = Number.POSITIVE_INFINITY;

  for (let slot = 0; slot < target; slot += 1) {
    const pool = withPlanet.length > 0 ? [...withPlanet] : [...fallback];
    pool.sort((a, b) => a.id.localeCompare(b.id));

    let best: StarSystem | null = null;
    let bestDistance = -1;
    for (const candidate of pool) {
      if (selected.includes(candidate.id) || occupiedSet.has(candidate.id)) continue;
      let minimum = Number.POSITIVE_INFINITY;
      for (const anchorId of [...occupied, ...selected]) {
        const distance = distanceFrom(candidate.id).get(anchorId);
        const value = distance === undefined ? Number.POSITIVE_INFINITY : distance;
        if (value < minimum) minimum = value;
      }
      if (minimum === Number.POSITIVE_INFINITY) minimum = galaxy.systems.length;
      if (minimum > bestDistance) {
        bestDistance = minimum;
        best = candidate;
      }
    }

    // Ersatzpool nur, wenn der bevorzugte Pool erschöpft ist.
    if (!best && withPlanet.length > 0) {
      pool.length = 0;
      pool.push(...fallback.filter((system) => !selected.includes(system.id)).sort((a, b) => a.id.localeCompare(b.id)));
      for (const candidate of pool) {
        let minimum = Number.POSITIVE_INFINITY;
        for (const anchorId of [...occupied, ...selected]) {
          const distance = distanceFrom(candidate.id).get(anchorId);
          const value = distance === undefined ? Number.POSITIVE_INFINITY : distance;
          if (value < minimum) minimum = value;
        }
        if (minimum === Number.POSITIVE_INFINITY) minimum = galaxy.systems.length;
        if (minimum > bestDistance) {
          bestDistance = minimum;
          best = candidate;
        }
      }
    }

    if (!best) break;
    selected.push(best.id);
    achievedMinHops = Math.min(achievedMinHops, bestDistance);
  }

  if (selected.length < target) {
    warnings.push(
      `Es konnten nur ${selected.length} von ${target} KI-Startsystemen vergeben werden; die Galaxie bietet zu wenige freie Systeme.`,
    );
  }
  if (Number.isFinite(achievedMinHops) && achievedMinHops < desiredHops) {
    warnings.push(
      `Mindestabstand der Startsysteme von ${desiredHops} Hyperlane-Sprüngen nicht erreichbar; kleinster Abstand ${achievedMinHops}. Die Galaxie ist für die gewählte Fraktionsanzahl sehr klein.`,
    );
  }

  return { systemIds: selected, desiredHops, achievedMinHops, warnings };
}

export interface FactionSetupResult {
  playerFactionId: HumanFactionId;
  aiFactionCount: number;
  assignments: ReturnType<typeof buildFactionAssignments>;
}

/** Normalisiert die Fraktionsparameter einer Galaxiekonfiguration. */
export function resolveFactionSetup(config: {
  seed: string;
  playerFactionId?: unknown;
  aiFactionCount?: unknown;
}): FactionSetupResult {
  const playerFactionId = isHumanFactionId(config.playerFactionId)
    ? config.playerFactionId
    : DEFAULT_PLAYER_FACTION_ID;
  const aiFactionCount = clampAiFactionCount(
    config.aiFactionCount ?? DEFAULT_AI_FACTION_COUNT,
  );
  return {
    playerFactionId,
    aiFactionCount,
    assignments: buildFactionAssignments(config.seed, playerFactionId, aiFactionCount),
  };
}
