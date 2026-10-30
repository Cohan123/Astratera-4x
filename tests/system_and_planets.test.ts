import { describe, expect, it } from 'vitest';
import { GameEngine } from '../src/core/GameEngine.ts';
import { TurnManager } from '../src/core/TurnManager.ts';
import { GalaxyConfig, PlanetType, Star } from '../src/core/types.ts';
import { PLANET_CATALOG } from '../src/data/planetCatalog.ts';
import { GalaxyGenerator } from '../src/generation/galaxyGenerator.ts';
import { PlanetGenerator } from '../src/generation/planetGenerator.ts';
import { SaveManager } from '../src/save/saveManager.ts';

describe('Astraea 4X - Phase 1, Modul 2 Test Suite (Sternensysteme & Planeten)', () => {
  const baseConfig: GalaxyConfig = {
    size: 'small',
    systemCount: 15,
    width: 600,
    height: 600,
    minDistance: 50,
    shape: 'spiral',
    seed: 'MOD2-TEST-SEED',
  };

  const sampleStar: Star = {
    id: 'star-test-01',
    name: 'Kepler Alpha',
    spectralClass: 'G',
    color: '#FACC15',
    glowColor: 'rgba(250, 204, 21, 0.4)',
    temperatureK: 5778,
    luminositySolar: 1.0,
    massSolar: 1.0,
    radiusKm: 696340,
  };

  it('1. erzeugt deterministisch Planeten für ein System mit eindeutigen IDs und System-Zuordnung', () => {
    const planets = PlanetGenerator.generateSystemPlanets('SEED-A', 'SYS-0001', 'Kepler-452', sampleStar, 5);

    expect(planets.length).toBe(5);
    const ids = planets.map((p) => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(planets.length);

    planets.forEach((p, idx) => {
      expect(p.systemId).toBe('SYS-0001');
      expect(p.orbitIndex).toBe(idx + 1);
      expect(p.name).toContain('Kepler-452');
      expect(p.orbitDistanceAu).toBeGreaterThan(0);
      expect(p.orbitalPeriodDays).toBeGreaterThan(0);
    });
  });

  it('2. identische Seeds und System-IDs erzeugen exakt identische Planetendaten', () => {
    const planetsA = PlanetGenerator.generateSystemPlanets('SEED-REPRO', 'SYS-0002', 'Alpha Centauri', sampleStar, 6);
    const planetsB = PlanetGenerator.generateSystemPlanets('SEED-REPRO', 'SYS-0002', 'Alpha Centauri', sampleStar, 6);

    expect(planetsA.length).toBe(planetsB.length);

    for (let i = 0; i < planetsA.length; i++) {
      const pA = planetsA[i];
      const pB = planetsB[i];
      expect(pA.id).toBe(pB.id);
      expect(pA.name).toBe(pB.name);
      expect(pA.planetType).toBe(pB.planetType);
      expect(pA.orbitDistanceAu).toBe(pB.orbitDistanceAu);
      expect(pA.orbitalPeriodDays).toBe(pB.orbitalPeriodDays);
      expect(pA.surfaceTemperatureK).toBe(pB.surfaceTemperatureK);
      expect(pA.atmosphere).toBe(pB.atmosphere);
      expect(pA.waterAvailability).toBe(pB.waterAvailability);
      expect(pA.gravityG).toBe(pB.gravityG);
      expect(pA.habitability).toBe(pB.habitability);
    }
  });

  it('3. unterschiedliche Seeds erzeugen unterschiedliche Planetensysteme', () => {
    const planets1 = PlanetGenerator.generateSystemPlanets('SEED-1', 'SYS-0003', 'Vega', sampleStar, 4);
    const planets2 = PlanetGenerator.generateSystemPlanets('SEED-2', 'SYS-0003', 'Vega', sampleStar, 4);

    const sig1 = planets1.map((p) => `${p.planetType}:${p.orbitDistanceAu}:${p.surfaceTemperatureK}`).join('|');
    const sig2 = planets2.map((p) => `${p.planetType}:${p.orbitDistanceAu}:${p.surfaceTemperatureK}`).join('|');
    expect(sig1).not.toBe(sig2);
  });

  it('4. Planetenanzahl liegt plausibel innerhalb der definierten Obergrenzen', () => {
    const galaxy = GalaxyGenerator.generate(baseConfig);

    for (const sys of galaxy.systems) {
      expect(sys.planets).toBeDefined();
      expect(sys.planets.length).toBe(sys.planetCount);
      expect(sys.planets.length).toBeGreaterThanOrEqual(0);
      expect(sys.planets.length).toBeLessThanOrEqual(10);
    }
  });

  it('5. alle Planetentypen besitzen konsistente physikalische Parameter und Farbdefinitionen', () => {
    const types: PlanetType[] = ['rocky', 'desert', 'ice', 'ocean', 'volcanic', 'gas_giant', 'toxic'];

    types.forEach((type) => {
      const def = PLANET_CATALOG[type];
      expect(def).toBeDefined();
      expect(def.displayName).toBeTruthy();
      expect(def.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(def.baseSlotRange[0]).toBeLessThanOrEqual(def.baseSlotRange[1]);
      expect(def.baseHabitability).toBeGreaterThanOrEqual(0);
      expect(def.baseHabitability).toBeLessThanOrEqual(100);
    });
  });

  it('6. Gasriesen sind unbewohnbar für Standard-Bodenkolonisation (Habitabilität = 0%)', () => {
    const planets = PlanetGenerator.generateSystemPlanets('SEED-GAS', 'SYS-0005', 'Jupiter-Sys', sampleStar, 8);
    const gasGiants = planets.filter((p) => p.planetType === 'gas_giant');

    if (gasGiants.length > 0) {
      gasGiants.forEach((gg) => {
        expect(gg.habitability).toBe(0);
        expect(gg.habitabilityTier).toBe('uninhabitable');
      });
    }
  });

  it('7. Navigation zwischen Galaxy-Karte und Systemkarte behält Zustand und Daten bei', () => {
    const engine = GameEngine.getInstance();
    const galaxy = engine.getGalaxy();
    expect(galaxy.systems.length).toBeGreaterThan(0);

    const targetSys = galaxy.systems[0];
    const initialPlanetCount = targetSys.planets.length;

    // Wechsel in Systemkarte
    const entered = engine.enterSystemView(targetSys.id);
    expect(entered).toBe(true);
    expect(engine.getActiveView()).toBe('system');
    expect(engine.getSelectedSystem()?.id).toBe(targetSys.id);

    // Planet auswählen
    if (initialPlanetCount > 0) {
      const planetToSelect = targetSys.planets[0];
      engine.selectPlanet(planetToSelect.id);
      expect(engine.getSelectedPlanet()?.id).toBe(planetToSelect.id);
    }

    // Rückkehr zur Galaxy-Karte
    engine.leaveSystemView();
    expect(engine.getActiveView()).toBe('galaxy');
    expect(engine.getSelectedSystem()?.id).toBe(targetSys.id);
    expect(targetSys.planets.length).toBe(initialPlanetCount); // keine Duplikate
  });

  it('8. Ansichtswechsel erzeugt keine zusätzlichen Systeme oder Planeten (Zustandserhaltung)', () => {
    const engine = GameEngine.getInstance();
    const systemCountBefore = engine.getGalaxy().systems.length;
    const totalPlanetsBefore = engine.getGalaxy().systems.reduce((acc, s) => acc + s.planets.length, 0);

    // Multiple view transitions
    engine.enterSystemView();
    engine.leaveSystemView();
    engine.enterSystemView();
    engine.leaveSystemView();

    expect(engine.getGalaxy().systems.length).toBe(systemCountBefore);
    const totalPlanetsAfter = engine.getGalaxy().systems.reduce((acc, s) => acc + s.planets.length, 0);
    expect(totalPlanetsAfter).toBe(totalPlanetsBefore);
  });

  it('9. Orbitalsonde (Planeten-Scan) ändert Untersuchungsstatus auf "analyzed"', () => {
    const engine = GameEngine.getInstance();
    const targetSys = engine.getGalaxy().systems.find((s) => s.planets.some((p) => p.surveyStatus !== 'analyzed'));
    expect(targetSys).toBeDefined();

    if (targetSys) {
      engine.selectSystem(targetSys.id);
      const planet = targetSys.planets.find((p) => p.surveyStatus !== 'analyzed')!;
      engine.selectPlanet(planet.id);
      expect(planet.surveyStatus).not.toBe('analyzed');

      const scanned = engine.surveyPlanet(planet.id);
      expect(scanned).toBe(true);
      expect(planet.surveyStatus).toBe('analyzed');
      expect(engine.getSelectedPlanet()?.surveyStatus).toBe('analyzed');
    }
  });

  it('10. Speichern und Laden erhalten alle Planetendaten und Systemzuordnungen', () => {
    const engine = GameEngine.getInstance();
    const originalTurn = engine.getTurnState().currentTurn;
    const originalSelectedSysId = engine.getSelectedSystem()?.id;

    const payload = engine.createSavePayload('Modul2-Speicherstand');
    const serialized = SaveManager.serialize(payload);
    const deserialized = SaveManager.deserialize(serialized);

    expect(deserialized.success).toBe(true);
    const loadedData = deserialized.data!;

    expect(loadedData.galaxy.systems[0].planets).toBeDefined();
    expect(loadedData.galaxy.systems[0].planets.length).toBe(engine.getGalaxy().systems[0].planets.length);

    const restored = engine.restoreFromSaveData(loadedData);
    expect(restored).toBe(true);
    expect(engine.getTurnState().currentTurn).toBe(originalTurn);
    expect(engine.getSelectedSystem()?.id).toBe(originalSelectedSysId);
  });
});
