import { describe, expect, it } from 'vitest';
import { GameEngine } from '../src/core/GameEngine.ts';
import { Galaxy, GalaxyConfig, Planet, SaveGameData } from '../src/core/types.ts';
import { GalaxyGenerator } from '../src/generation/galaxyGenerator.ts';
import { SaveManager, CURRENT_SAVE_VERSION } from '../src/save/saveManager.ts';

describe('Astraea 4X - Monde und Asteroidengürtel (Save v4)', () => {
  const baseConfig: GalaxyConfig = {
    size: 'small',
    systemCount: 12,
    width: 600,
    height: 600,
    minDistance: 45,
    shape: 'spiral',
    seed: 'MOON-BELT-SEED',
  };

  const collectPlanets = (galaxy: Galaxy): Planet[] =>
    galaxy.systems.flatMap((system) => system.planets ?? []);

  it('1. erzeugt für jeden Planeten genau moonsCount Monde mit gültigen Daten', () => {
    const galaxy = GalaxyGenerator.generate(baseConfig);
    const planets = collectPlanets(galaxy);

    expect(planets.length).toBeGreaterThan(0);

    for (const planet of planets) {
      const moons = planet.moons ?? [];
      expect(moons.length).toBe(planet.moonsCount);

      const ids = new Set<string>();
      moons.forEach((moon, position) => {
        expect(moon.id).toBe(`${planet.id}-M${position + 1}`);
        expect(ids.has(moon.id)).toBe(false);
        ids.add(moon.id);
        expect(moon.planetId).toBe(planet.id);
        expect(moon.index).toBe(position + 1);
        expect(moon.name.startsWith(planet.name)).toBe(true);
        expect(['rocky', 'icy', 'volcanic', 'metallic']).toContain(moon.moonType);
        expect(moon.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(moon.orbitRadiusPlanetRadii).toBeGreaterThan(1);
        expect(moon.orbitalPeriodDays).toBeGreaterThanOrEqual(1);
        expect(moon.radiusKm).toBeGreaterThan(0);
      });
    }
  });

  it('2. markiert auf Gesteinsplaneten alle Monde als major und auf Gasriesen nur die inneren', () => {
    const galaxy = GalaxyGenerator.generate(baseConfig);
    const planets = collectPlanets(galaxy);

    for (const planet of planets) {
      const moons = planet.moons ?? [];
      if (planet.planetType === 'gas_giant') {
        for (const moon of moons) {
          if (moon.index > 4) {
            expect(moon.isMajor).toBe(false);
          }
        }
      } else {
        for (const moon of moons) {
          expect(moon.isMajor).toBe(true);
        }
      }
    }
  });

  it('3. erzeugt Monde deterministisch für identische Seeds', () => {
    const galaxyA = GalaxyGenerator.generate(baseConfig);
    const galaxyB = GalaxyGenerator.generate(baseConfig);

    const moonsA = collectPlanets(galaxyA).map((planet) => planet.moons ?? []);
    const moonsB = collectPlanets(galaxyB).map((planet) => planet.moons ?? []);

    expect(moonsA).toEqual(moonsB);
  });

  it('4. erzeugt höchstens zwei Gürtel mit gültigen Werten und eindeutigen IDs', () => {
    const galaxy = GalaxyGenerator.generate(baseConfig);
    const systemsWithBelts = galaxy.systems.flatMap((system) => system.asteroidBelts ?? []);

    expect(systemsWithBelts.length).toBeGreaterThan(0);

    for (const system of galaxy.systems) {
      const belts = system.asteroidBelts ?? [];
      expect(belts.length).toBeGreaterThanOrEqual(0);
      expect(belts.length).toBeLessThanOrEqual(2);

      const ids = new Set<string>();
      belts.forEach((belt, position) => {
        expect(belt.id).toBe(`${system.id}-B${position + 1}`);
        expect(ids.has(belt.id)).toBe(false);
        ids.add(belt.id);
        expect(belt.systemId).toBe(system.id);
        expect(belt.name.startsWith(system.name)).toBe(true);
        expect(belt.innerAu).toBeLessThan(belt.outerAu);
        expect(belt.midpointAu).toBeGreaterThanOrEqual(belt.innerAu);
        expect(belt.midpointAu).toBeLessThanOrEqual(belt.outerAu);
        expect(belt.density).toBeGreaterThanOrEqual(0.35);
        expect(belt.density).toBeLessThanOrEqual(0.85);
        expect(['rocky', 'metallic', 'icy']).toContain(belt.composition);
      });
    }
  });

  it('5. erzeugt Gürtel deterministisch für identische Seeds', () => {
    const galaxyA = GalaxyGenerator.generate(baseConfig);
    const galaxyB = GalaxyGenerator.generate(baseConfig);

    const beltsA = galaxyA.systems.map((system) => system.asteroidBelts ?? []);
    const beltsB = galaxyB.systems.map((system) => system.asteroidBelts ?? []);

    expect(beltsA).toEqual(beltsB);
  });

  it('6. migriert v2-Spielstände ohne Monde und Gürtel verlustfrei auf v4', () => {
    const engine = GameEngine.getInstance();
    const original: SaveGameData = JSON.parse(JSON.stringify(engine.createSavePayload('Migrationstest')));

    for (const system of original.galaxy.systems) {
      delete system.asteroidBelts;
      for (const planet of system.planets ?? []) {
        delete planet.moons;
      }
    }
    original.version = 2;

    const result = SaveManager.deserialize(JSON.stringify(original));
    expect(result.success).toBe(true);
    expect(result.data?.version).toBe(5);

    for (const system of result.data!.galaxy.systems) {
      expect(Array.isArray(system.asteroidBelts)).toBe(true);
      for (const planet of system.planets ?? []) {
        const moons = planet.moons ?? [];
        expect(moons.length).toBe(planet.moonsCount);
        moons.forEach((moon, position) => {
          expect(moon.index).toBe(position + 1);
          expect(moon.id).toBe(`${planet.id}-M${position + 1}`);
        });
      }
    }
  });

  it('7. erhält Monde und Gürtel bei einem v4-Speichern/Laden-Zyklus', () => {
    const engine = GameEngine.getInstance();
    const payload = engine.createSavePayload('Roundtrip');

    const result = SaveManager.deserialize(SaveManager.serialize(payload));
    expect(result.success).toBe(true);
    expect(result.data?.version).toBe(5);

    const expected = JSON.parse(JSON.stringify(payload.galaxy.systems));
    expect(result.data?.galaxy.systems).toEqual(expected);
  });

  it('8. lehnt Speicherstände aus einer neueren Version ab', () => {
    const engine = GameEngine.getInstance();
    const payload = engine.createSavePayload('Zukunft');
    (payload as { version: number }).version = CURRENT_SAVE_VERSION + 1;

    const result = SaveManager.deserialize(JSON.stringify(payload));
    expect(result.success).toBe(false);
    expect(result.error).toContain('neueren Version');
  });
});
