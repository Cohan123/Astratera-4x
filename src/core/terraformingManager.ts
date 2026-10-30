/**
 * Astraea 4X - Terraforming Manager (Module 4 / Phase 2)
 * Turns planetary-scale climate engineering into explicit, inspectable projects.
 * A project is gated by technology, funded by local colony production, and
 * rewrites atmosphere, surface biomes and habitability only on completion.
 */

import { EventBus } from './EventBus.ts';
import { HabitabilityEvaluator } from './habitabilityEvaluator.ts';
import {
  AtmosphereType,
  HexBiome,
  Planet,
  PlanetSurface,
  TerraformingProject,
} from './types.ts';

export const TERRAFORMING_TECH_ID = 'atmospheric_scrubbers';

const TRANSFORMABLE_BIOMES: HexBiome[] = [
  'desert',
  'tundra',
  'volcanic',
  'lava',
  'toxic',
  'alien',
  'impact_crater',
];

export interface TerraformingOptions {
  targetBiome?: HexBiome;
  targetAtmosphere?: AtmosphereType;
}

export interface TerraformingGateResult {
  allowed: boolean;
  reason?: string;
}

export interface TerraformingStartResult extends TerraformingGateResult {
  project?: TerraformingProject;
}

export interface TerraformingAdvanceResult {
  project: TerraformingProject;
  planet: Planet;
  completed: boolean;
  progressAdded: number;
}

export class TerraformingManager {
  private projects: Map<string, TerraformingProject> = new Map();
  private eventBus: EventBus;

  constructor(eventBus: EventBus = EventBus.getInstance()) {
    this.eventBus = eventBus;
  }

  public getProject(planetId: string): TerraformingProject | null {
    return this.projects.get(planetId) ?? null;
  }

  public getAllProjects(): TerraformingProject[] {
    return Array.from(this.projects.values());
  }

  public loadProjects(projects: TerraformingProject[]): void {
    this.projects.clear();
    for (const project of projects) {
      this.projects.set(project.planetId, project);
    }
  }

  public clear(): void {
    this.projects.clear();
  }

  /**
   * Total effort scales with the habitability gap and with each requested change.
   * Deterministic so tests and save games stay comparable.
   */
  public calculateRequiredEffort(planet: Planet, options: TerraformingOptions = {}): number {
    const gap = Math.max(0, 100 - planet.habitability);
    const biomeCost = options.targetBiome ? 60 : 0;
    const atmosphereCost = options.targetAtmosphere ? 40 : 0;
    return 240 + gap * 8 + biomeCost + atmosphereCost;
  }

  public canStart(
    planet: Planet,
    completedTechIds: ReadonlySet<string> | string[],
    options: TerraformingOptions = {}
  ): TerraformingGateResult {
    const techs = completedTechIds instanceof Set ? completedTechIds : new Set(completedTechIds);

    if (planet.planetType === 'gas_giant') {
      return { allowed: false, reason: 'Gasriesen besitzen keine feste Oberfläche für Terraforming.' };
    }
    if (!techs.has(TERRAFORMING_TECH_ID)) {
      return {
        allowed: false,
        reason: 'Erfordert die abgeschlossene Technologie „Atmosphären-Scrubber".',
      };
    }
    if (!options.targetBiome && !options.targetAtmosphere) {
      return { allowed: false, reason: 'Es muss mindestens ein Ziel (Biom oder Atmosphäre) gewählt werden.' };
    }
    if (options.targetBiome && options.targetBiome === 'mountains') {
      return { allowed: false, reason: 'Hochgebirge können nicht als Zielbiom terraformiert werden.' };
    }
    if (options.targetBiome && planet.planetType === 'ocean' && options.targetBiome === 'ocean') {
      return { allowed: false, reason: 'Die Oberfläche entspricht bereits dem Zielbiom.' };
    }
    if (options.targetAtmosphere && options.targetAtmosphere === planet.atmosphere) {
      return { allowed: false, reason: 'Die Atmosphäre entspricht bereits dem Zielzustand.' };
    }
    if (this.projects.has(planet.id)) {
      return { allowed: false, reason: 'Auf diesem Planeten läuft bereits ein Terraforming-Projekt.' };
    }

    return { allowed: true };
  }

  public startProject(
    planet: Planet,
    surface: PlanetSurface | null,
    completedTechIds: ReadonlySet<string> | string[],
    options: TerraformingOptions
  ): TerraformingStartResult {
    const gate = this.canStart(planet, completedTechIds, options);
    if (!gate.allowed) {
      return gate;
    }
    if (!planet.colonyId || planet.colonizationStatus !== 'colonized') {
      return { allowed: false, reason: 'Terraforming erfordert eine bestehende Kolonie auf dem Planeten.' };
    }

    const project: TerraformingProject = {
      id: `terraforming-${planet.id}`,
      planetId: planet.id,
      targetBiome: options.targetBiome,
      targetAtmosphere: options.targetAtmosphere,
      progress: 0,
      totalRequired: this.calculateRequiredEffort(planet, options),
    };

    if (surface && options.targetBiome) {
      project.totalRequired += 20;
    }

    this.projects.set(planet.id, project);
    this.eventBus.emit('terraforming:started', { project, planetId: planet.id });
    return { allowed: true, project };
  }

  public cancelProject(planetId: string): boolean {
    const cancelled = this.projects.delete(planetId);
    if (cancelled) {
      this.eventBus.emit('terraforming:cancelled', { planetId });
    }
    return cancelled;
  }

  /**
   * Advances every project by the effort its planet contributed this turn.
   * Completion mutates the supplied planet/surface objects exactly once.
   */
  public advanceTurn(
    planets: Planet[],
    surfaces: PlanetSurface[],
    effortByPlanetId: ReadonlyMap<string, number>
  ): TerraformingAdvanceResult[] {
    const results: TerraformingAdvanceResult[] = [];
    const surfaceByPlanetId = new Map(surfaces.map((surface) => [surface.planetId, surface]));

    for (const project of this.projects.values()) {
      const planet = planets.find((candidate) => candidate.id === project.planetId);
      if (!planet) {
        continue;
      }

      const rawEffort = effortByPlanetId.get(planet.id) ?? 0;
      const progressAdded = rawEffort > 0 ? Math.max(1, Math.round(rawEffort)) : 0;
      project.progress = Math.min(project.totalRequired, project.progress + progressAdded);

      const completed = project.progress >= project.totalRequired;
      if (completed) {
        this.applyCompletion(project, planet, surfaceByPlanetId.get(planet.id) ?? null);
        this.projects.delete(project.planetId);
      }

      this.eventBus.emit('terraforming:progress', {
        project,
        planetId: planet.id,
        progressAdded,
        completed,
      });

      results.push({ project, planet, completed, progressAdded });
    }

    return results;
  }

  private applyCompletion(
    project: TerraformingProject,
    planet: Planet,
    surface: PlanetSurface | null
  ): void {
    if (project.targetAtmosphere) {
      planet.atmosphere = project.targetAtmosphere;
      if (
        project.targetAtmosphere === 'breathable' &&
        (planet.waterAvailability === 'none' || planet.waterAvailability === 'trace')
      ) {
        planet.waterAvailability = 'moderate';
      }
    }

    if (surface && project.targetBiome) {
      const status = project.targetAtmosphere ? 'scrubbed' : 'improved';
      for (const tile of surface.tiles) {
        if (TRANSFORMABLE_BIOMES.includes(tile.biome)) {
          tile.biome = project.targetBiome;
          tile.terraformedStatus = status;
          tile.hasHazard = false;
          tile.hazardDescription = undefined;
        }
      }
    }

    const assessment = HabitabilityEvaluator.evaluate(planet);
    planet.habitability = assessment.score;
    planet.habitabilityTier = assessment.tier;

    this.eventBus.emit('terraforming:completed', { project, planetId: planet.id, planet });
  }
}
