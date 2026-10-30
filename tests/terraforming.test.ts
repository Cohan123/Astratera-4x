/**
 * Astraea 4X - Terraforming Project Test Suite (Phase 2)
 * Covers technology gating, effort calculation, turn progression, biome and
 * atmosphere completion, habitability recalculation, cancellation and reload.
 */

import { describe, expect, it } from 'vitest';
import { TerraformingManager, TERRAFORMING_TECH_ID } from '../src/core/terraformingManager.ts';
import { HabitabilityEvaluator } from '../src/core/habitabilityEvaluator.ts';
import { SurfaceGenerator } from '../src/surface/surfaceGenerator.ts';
import { Planet } from '../src/core/types.ts';

function createPlanet(overrides: Partial<Planet> = {}): Planet {
  return {
    id: 'test-planet-01',
    name: 'Aurelia Prime',
    systemId: 'sys-01',
    orbitIndex: 2,
    orbitDistanceAu: 1.1,
    orbitalPeriodDays: 365,
    currentAngleRad: 0,
    planetType: 'desert',
    sizeClass: 16,
    surfaceTemperatureK: 292,
    temperatureCategory: 'temperate',
    atmosphere: 'toxic',
    waterAvailability: 'trace',
    gravityG: 1.0,
    gravityCategory: 'standard',
    radiationHazard: 'negligible',
    geologicalStability: 'stable',
    habitability: 30,
    habitabilityTier: 'hostile',
    surveyStatus: 'analyzed',
    colonizationStatus: 'colonized',
    colonyId: 'colony-01',
    color: '#38bdf8',
    accentColor: '#0284c7',
    texturePattern: 'cracks',
    moonsCount: 1,
    ...overrides,
  };
}

const techs = [TERRAFORMING_TECH_ID];

describe('TerraformingManager', () => {
  it('1. Gate: Technologie, Ziel und Gasriese werden geprüft', () => {
    const tm = new TerraformingManager();
    const planet = createPlanet();

    expect(tm.canStart(planet, [], { targetAtmosphere: 'breathable' }).allowed).toBe(false);
    expect(tm.canStart(planet, techs, {}).allowed).toBe(false);
    expect(tm.canStart(planet, techs, { targetBiome: 'mountains' }).allowed).toBe(false);
    expect(
      tm.canStart(createPlanet({ planetType: 'gas_giant' }), techs, { targetAtmosphere: 'dense' }).allowed
    ).toBe(false);
    expect(tm.canStart(planet, techs, { targetAtmosphere: 'breathable' }).allowed).toBe(true);
  });

  it('2. Start berechnet Aufwand deterministisch und lehnt Doppelprojekte ab', () => {
    const tm = new TerraformingManager();
    const planet = createPlanet();
    const surface = SurfaceGenerator.generateSurface(planet, 'TERRAFORM-SEED');

    const started = tm.startProject(planet, surface, techs, {
      targetBiome: 'plains',
      targetAtmosphere: 'breathable',
    });
    expect(started.allowed).toBe(true);
    expect(started.project?.totalRequired).toBe(240 + 70 * 8 + 60 + 40 + 20);
    expect(tm.getProject(planet.id)?.id).toBe('terraforming-test-planet-01');

    const duplicate = tm.startProject(planet, surface, techs, { targetAtmosphere: 'dense' });
    expect(duplicate.allowed).toBe(false);
    expect(duplicate.reason).toContain('bereits ein Terraforming-Projekt');
  });

  it('3. Start erfordert eine bestehende Kolonie', () => {
    const tm = new TerraformingManager();
    const planet = createPlanet({ colonyId: null, colonizationStatus: 'uncolonized' });
    const result = tm.startProject(planet, null, techs, { targetAtmosphere: 'breathable' });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('bestehende Kolonie');
  });

  it('4. Fortschritt wird pro Runde addiert und erst am Ziel abgeschlossen', () => {
    const tm = new TerraformingManager();
    const planet = createPlanet();
    const surface = SurfaceGenerator.generateSurface(planet, 'TERRAFORM-SEED');
    const project = tm.startProject(planet, surface, techs, { targetAtmosphere: 'breathable' }).project!;

    const first = tm.advanceTurn([planet], [surface], new Map([[planet.id, 100]]));
    expect(first).toHaveLength(1);
    expect(first[0].completed).toBe(false);
    expect(first[0].progressAdded).toBe(100);
    expect(project.progress).toBe(100);

    const stalled = tm.advanceTurn([planet], [surface], new Map());
    expect(stalled[0].project.progress).toBe(100);
    expect(stalled[0].progressAdded).toBe(0);
  });

  it('5. Abschluss setzt Atmosphäre, Biome, Hazard-Status und Habitabilität', () => {
    const tm = new TerraformingManager();
    const planet = createPlanet();
    const surface = SurfaceGenerator.generateSurface(planet, 'TERRAFORM-SEED');
    surface.tiles[0].biome = 'volcanic';
    surface.tiles[0].hasHazard = true;
    surface.tiles[0].hazardDescription = 'Lavastrom';
    surface.tiles[1].biome = 'ocean';
    const project = tm.startProject(planet, surface, techs, {
      targetBiome: 'plains',
      targetAtmosphere: 'breathable',
    }).project!;

    const result = tm.advanceTurn([planet], [surface], new Map([[planet.id, project.totalRequired]]));
    expect(result[0].completed).toBe(true);
    expect(tm.getProject(planet.id)).toBeNull();

    expect(planet.atmosphere).toBe('breathable');
    expect(planet.waterAvailability).toBe('moderate');
    expect(surface.tiles[0].biome).toBe('plains');
    expect(surface.tiles[0].terraformedStatus).toBe('scrubbed');
    expect(surface.tiles[0].hasHazard).toBe(false);
    expect(surface.tiles[0].hazardDescription).toBeUndefined();
    expect(surface.tiles[1].biome).toBe('ocean');

    const assessment = HabitabilityEvaluator.evaluate(planet);
    expect(planet.habitability).toBe(assessment.score);
    expect(planet.habitabilityTier).toBe(assessment.tier);
    expect(planet.habitability).toBeGreaterThan(30);
  });

  it('6. Abbruch entfernt das Projekt ohne Planetenmutation', () => {
    const tm = new TerraformingManager();
    const planet = createPlanet();
    const surface = SurfaceGenerator.generateSurface(planet, 'TERRAFORM-SEED');
    tm.startProject(planet, surface, techs, { targetBiome: 'plains' });

    expect(tm.cancelProject(planet.id)).toBe(true);
    expect(tm.cancelProject(planet.id)).toBe(false);
    expect(tm.getAllProjects()).toHaveLength(0);
    expect(planet.atmosphere).toBe('toxic');
  });

  it('7. Projekte lassen sich serialisieren und wieder laden', () => {
    const tm = new TerraformingManager();
    const planet = createPlanet();
    const surface = SurfaceGenerator.generateSurface(planet, 'TERRAFORM-SEED');
    tm.startProject(planet, surface, techs, { targetBiome: 'plains' });

    const snapshot = JSON.parse(JSON.stringify(tm.getAllProjects()));
    const restored = new TerraformingManager();
    restored.loadProjects(snapshot);

    expect(restored.getProject(planet.id)?.targetBiome).toBe('plains');
    expect(restored.getAllProjects()).toHaveLength(1);

    restored.clear();
    expect(restored.getAllProjects()).toHaveLength(0);
  });
});
