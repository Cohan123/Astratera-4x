import { describe, expect, it } from 'vitest';
import { ColonizationValidator } from '../src/core/colonizationRules.ts';
import { ColonyManager } from '../src/core/colonyManager.ts';
import { EventBus } from '../src/core/EventBus.ts';
import { GameEngine } from '../src/core/GameEngine.ts';
import { HabitabilityEvaluator } from '../src/core/habitabilityEvaluator.ts';
import { PlanetDataFilter } from '../src/core/planetDataFilter.ts';
import { Planet, Star, StarSystem } from '../src/core/types.ts';
import { PlanetGenerator } from '../src/generation/planetGenerator.ts';
import { SaveManager } from '../src/save/saveManager.ts';

describe('Astraea 4X - Phase 1, Modul 3 Test Suite (Planeten, Erkundung & Kolonisierung)', () => {
  const sampleStar: Star = {
    id: 'star-colony-test',
    name: 'Sol Invictus',
    spectralClass: 'G',
    color: '#FACC15',
    glowColor: 'rgba(250, 204, 21, 0.4)',
    temperatureK: 5778,
    luminositySolar: 1.0,
    massSolar: 1.0,
    radiusKm: 696340,
  };

  const createSampleSystem = (systemId: string = 'SYS-COL-01'): StarSystem => {
    const planets = PlanetGenerator.generateSystemPlanets('COLONY-SEED-01', systemId, 'Astraea Prime', sampleStar, 6);
    return {
      id: systemId,
      name: 'Astraea Prime',
      x: 100,
      y: 100,
      star: sampleStar,
      planetCount: planets.length,
      planets,
      discoveryStatus: 'surveyed',
      ownerFactionId: null,
      hyperlanes: [],
      anomalyDetected: false,
    };
  };

  it('1. schützt Tiefentelemetrie durch PlanetDataFilter vor systematischer Untersuchung', () => {
    const system = createSampleSystem();
    const planet = system.planets[0];
    planet.surveyStatus = 'unexplored';

    const unexpData = PlanetDataFilter.getKnownPlanetData(planet);
    expect(unexpData.isSurveyed).toBe(false);
    expect(unexpData.isAnalyzed).toBe(false);
    expect(unexpData.surfaceTemperatureK).toBeUndefined();
    expect(unexpData.atmosphere).toBeUndefined();
    expect(unexpData.habitability).toBeUndefined();
    expect(unexpData.radiationHazard).toBeUndefined();

    // After basic survey
    planet.surveyStatus = 'surveyed';
    const survData = PlanetDataFilter.getKnownPlanetData(planet);
    expect(survData.isSurveyed).toBe(true);
    expect(survData.isAnalyzed).toBe(false);
    expect(survData.planetType).toBeDefined();
    expect(survData.sizeClass).toBeDefined();
    expect(survData.surfaceTemperatureK).toBeUndefined();
    expect(survData.habitability).toBeUndefined();

    // After deep analysis
    planet.surveyStatus = 'analyzed';
    const analyzedData = PlanetDataFilter.getKnownPlanetData(planet);
    expect(analyzedData.isAnalyzed).toBe(true);
    expect(analyzedData.surfaceTemperatureK).toBe(planet.surfaceTemperatureK);
    expect(analyzedData.atmosphere).toBe(planet.atmosphere);
    expect(analyzedData.habitability).toBe(planet.habitability);
    expect(analyzedData.habitabilityAssessment).toBeDefined();
  });

  it('2. überführt Sonden-Scan den Status kontrolliert von unexplored/surveyed nach analyzed', () => {
    const engine = GameEngine.getInstance();
    const system = engine.getGalaxy().systems[0];
    engine.selectSystem(system.id);

    const planet = system.planets[0];
    planet.surveyStatus = 'surveyed';

    const scanSuccess = engine.surveyPlanet(planet.id);
    expect(scanSuccess).toBe(true);
    expect(planet.surveyStatus).toBe('analyzed');

    // Repeated scan on analyzed planet returns false (no duplicate scans)
    const repeatScan = engine.surveyPlanet(planet.id);
    expect(repeatScan).toBe(false);
  });

  it('3. berechnet HabitabilityEvaluator präzisen Score und ordnet korrekte 5-Stufen-Kategorie zu', () => {
    const system = createSampleSystem();

    system.planets.forEach((p) => {
      const assessment = HabitabilityEvaluator.evaluate(p);
      expect(assessment.score).toBeGreaterThanOrEqual(0);
      expect(assessment.score).toBeLessThanOrEqual(100);
      expect(['ideal', 'moderate', 'harsh', 'hostile', 'uninhabitable']).toContain(assessment.tier);

      // Verify tier thresholds
      if (assessment.score >= 80) {
        expect(assessment.tier).toBe('ideal');
        expect(assessment.categoryLabel).toBe('Sehr gut geeignet');
      } else if (assessment.score >= 60) {
        expect(assessment.tier).toBe('moderate');
        expect(assessment.categoryLabel).toBe('Gut geeignet');
      } else if (assessment.score >= 40) {
        expect(assessment.tier).toBe('harsh');
        expect(assessment.categoryLabel).toBe('Bedingt geeignet');
      } else if (assessment.score >= 15) {
        expect(assessment.tier).toBe('hostile');
        expect(assessment.categoryLabel).toBe('Schwer besiedelbar');
      } else {
        expect(assessment.tier).toBe('uninhabitable');
        expect(assessment.canColonizeNormally).toBe(false);
      }
    });
  });

  it('4. gliedert HabitabilityEvaluator nachvollziehbare positive und negative Umweltfaktoren auf', () => {
    const system = createSampleSystem();
    const planet = system.planets.find((p) => p.planetType !== 'gas_giant') || system.planets[0];

    const assessment = HabitabilityEvaluator.evaluate(planet);
    expect(assessment.factors).toBeDefined();
    expect(assessment.factors.length).toBeGreaterThan(0);

    assessment.factors.forEach((f) => {
      expect(f.title).toBeTruthy();
      expect(f.description).toBeTruthy();
      expect(typeof f.impactPercent).toBe('number');
      if (f.isPositive) {
        expect(f.impactPercent).toBeGreaterThanOrEqual(0);
      } else {
        expect(f.impactPercent).toBeLessThanOrEqual(0);
      }
    });
  });

  it('5. Gasriesen sind deterministisch unbewohnbar und für Kolonisation ausgeschlossen', () => {
    const system = createSampleSystem();
    const planets = PlanetGenerator.generateSystemPlanets('SEED-GAS-01', 'SYS-GAS', 'Jupiter-Sys', sampleStar, 8);
    const gasGiant = planets.find((p) => p.planetType === 'gas_giant');

    if (gasGiant) {
      gasGiant.surveyStatus = 'analyzed';
      const assessment = HabitabilityEvaluator.evaluate(gasGiant);
      expect(assessment.score).toBe(0);
      expect(assessment.tier).toBe('uninhabitable');
      expect(assessment.canColonizeNormally).toBe(false);

      const check = ColonizationValidator.canColonize(gasGiant, system);
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('Gasriesen');
    }
  });

  it('6. tödliche kosmische Strahlung schließt eine Kolonisation aus', () => {
    const system = createSampleSystem();
    const planet: Planet = {
      ...system.planets[0],
      planetType: 'rocky',
      radiationHazard: 'lethal',
      surveyStatus: 'analyzed',
      colonizationStatus: 'uncolonized',
      colonyId: null,
    };

    const check = ColonizationValidator.canColonize(planet, system);
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('Strahlung');
  });

  it('7. ColonizationValidator verbietet Kolonisation ununtersuchter oder bereits kolonisierter Planeten', () => {
    const system = createSampleSystem();
    const planet = system.planets.find((p) => p.planetType !== 'gas_giant')!;

    // 1. Not analyzed
    planet.surveyStatus = 'surveyed';
    let check = ColonizationValidator.canColonize(planet, system);
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('untersucht');

    // 2. Analyzed and eligible
    planet.surveyStatus = 'analyzed';
    planet.radiationHazard = 'negligible';
    planet.planetType = 'ocean';
    planet.atmosphere = 'breathable';
    planet.temperatureCategory = 'temperate';
    planet.waterAvailability = 'liquid_ocean';
    planet.gravityCategory = 'standard';
    planet.colonizationStatus = 'uncolonized';
    planet.colonyId = null;

    check = ColonizationValidator.canColonize(planet, system);
    expect(check.allowed).toBe(true);

    // 3. Already colonized
    planet.colonizationStatus = 'colonized';
    check = ColonizationValidator.canColonize(planet, system);
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('bereits');
  });

  it('8. ColonyManager / GameEngine gründet Kolonie mit korrekten Attributen und atomarem State-Update', () => {
    const engine = GameEngine.getInstance();
    const system = engine.getGalaxy().systems[0];
    engine.selectSystem(system.id);

    // Prepare eligible planet
    const planet = system.planets.find((p) => p.planetType !== 'gas_giant') || system.planets[0];
    planet.surveyStatus = 'analyzed';
    planet.radiationHazard = 'negligible';
    planet.colonizationStatus = 'uncolonized';
    planet.colonyId = null;

    // Kolonisation erfordert ein beladenes Kolonieschiff im System.
    engine.provisionColonyShip(system.id);
    const result = engine.foundColony(planet.id, 'Neu-Terra');
    expect(result.success).toBe(true);
    expect(result.colony).toBeDefined();

    const colony = result.colony!;
    expect(colony.name).toBe('Neu-Terra');
    expect(colony.planetId).toBe(planet.id);
    expect(colony.systemId).toBe(system.id);
    expect(colony.population).toBe(1000);
    expect(colony.developmentTier).toBe('outpost');
    expect(colony.sizeClass).toBe(planet.sizeClass);
    expect(colony.status).toBe('active');

    // Atomic bidirectional synchronization
    expect(planet.colonizationStatus).toBe('colonized');
    expect(planet.colonyId).toBe(colony.id);
    expect(system.discoveryStatus).toBe('colonized');

    // Colony is queryable from ColonyManager
    const retrieved = engine.getColonyByPlanetId(planet.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe(colony.id);
  });

  it('9. EventBus feuert colony:founded bei erfolgreicher Gründung', () => {
    const bus = EventBus.getInstance();
    const cm = new ColonyManager(bus);

    const system = createSampleSystem('SYS-EVENT-01');
    const planet = system.planets.find((p) => p.planetType === 'rocky' || p.planetType === 'ocean') || system.planets[0];
    planet.surveyStatus = 'analyzed';
    planet.radiationHazard = 'negligible';
    planet.colonizationStatus = 'uncolonized';
    planet.colonyId = null;

    let eventFired = false;
    let eventColonyName = '';

    const unsub = bus.on('colony:founded', (payload) => {
      eventFired = true;
      eventColonyName = payload.colony.name;
    });

    const res = cm.foundColony(planet, system, 3, '2380.03', 'Event-Kolonie-Alpha');
    expect(res.success).toBe(true);
    expect(eventFired).toBe(true);
    expect(eventColonyName).toBe('Event-Kolonie-Alpha');

    unsub();
  });

  it('10. Speichern und Laden serialisiert und deserialisiert Kolonien und Planeten-Beziehungen verlustfrei', () => {
    const engine = GameEngine.getInstance();
    engine.generateNewGalaxy({ seed: 'PERSISTENCE-TEST-SEED' });
    const system = engine.getGalaxy().systems[0];
    engine.selectSystem(system.id);
    engine.surveySystem(system.id);

    const planet = system.planets.find((p) => p.planetType !== 'gas_giant') || system.planets[0];
    planet.planetType = 'ocean';
    planet.atmosphere = 'breathable';
    planet.temperatureCategory = 'temperate';
    planet.waterAvailability = 'liquid_ocean';
    planet.gravityCategory = 'standard';
    planet.surfaceTemperatureK = 295;
    planet.surveyStatus = 'analyzed';
    planet.radiationHazard = 'negligible';
    planet.colonizationStatus = 'uncolonized';
    planet.colonyId = null;

    const foundRes = engine.foundColony(planet.id, 'Kolonie-Persistenz-Test');
    expect(foundRes.success).toBe(true);

    const payload = engine.createSavePayload('Speicherstand-mit-Kolonien');
    expect(payload.colonies.length).toBeGreaterThan(0);
    expect(payload.statistics.colonizedPlanetsCount).toBeGreaterThan(0);

    const serialized = SaveManager.serialize(payload);
    const deserialized = SaveManager.deserialize(serialized);

    expect(deserialized.success).toBe(true);
    expect(deserialized.data).toBeDefined();

    const restoredColony = deserialized.data!.colonies.find((c) => c.planetId === planet.id);
    expect(restoredColony).toBeDefined();
    expect(restoredColony?.name).toBe('Kolonie-Persistenz-Test');
    expect(restoredColony?.population).toBe(1000);

    // Restore into engine
    const restoreSuccess = engine.restoreFromSaveData(deserialized.data!);
    expect(restoreSuccess).toBe(true);

    const reloadedColony = engine.getColonyByPlanetId(planet.id);
    expect(reloadedColony).not.toBeNull();
    expect(reloadedColony?.name).toBe('Kolonie-Persistenz-Test');
  });
});
