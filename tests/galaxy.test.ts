import { describe, expect, it } from 'vitest';
import { GameEngine } from '../src/core/GameEngine.ts';
import { TurnManager } from '../src/core/TurnManager.ts';
import { GalaxyConfig } from '../src/core/types.ts';
import { GalaxyGenerator } from '../src/generation/galaxyGenerator.ts';
import { CURRENT_SAVE_VERSION, SaveManager } from '../src/save/saveManager.ts';

describe('Astraea 4X - Phase 1 Test Suite', () => {
  const baseConfig: GalaxyConfig = {
    size: 'small',
    systemCount: 20,
    width: 600,
    height: 600,
    minDistance: 45,
    shape: 'spiral',
    seed: 'TEST-SEED-ALPHA',
  };

  it('1. erzeugt eine Galaxie erfolgreich mit korrekter Anzahl und Eigenschaften', () => {
    const galaxy = GalaxyGenerator.generate(baseConfig);

    expect(galaxy).toBeDefined();
    expect(galaxy.systems.length).toBe(20);
    expect(galaxy.seed).toBe('TEST-SEED-ALPHA');
    expect(galaxy.systems[0].name).toBeTruthy();
    expect(galaxy.systems[0].star).toBeDefined();
    expect(galaxy.systems[0].star.spectralClass).toBeTruthy();
    expect(galaxy.systems[0].planetCount).toBeGreaterThanOrEqual(0);
  });

  it('2. identische Seeds und Konfigurationen erzeugen exakt identische Galaxien', () => {
    const galaxyA = GalaxyGenerator.generate(baseConfig);
    const galaxyB = GalaxyGenerator.generate(baseConfig);

    expect(galaxyA.systems.length).toBe(galaxyB.systems.length);

    for (let i = 0; i < galaxyA.systems.length; i++) {
      const sysA = galaxyA.systems[i];
      const sysB = galaxyB.systems[i];

      expect(sysA.id).toBe(sysB.id);
      expect(sysA.name).toBe(sysB.name);
      expect(sysA.x).toBe(sysB.x);
      expect(sysA.y).toBe(sysB.y);
      expect(sysA.star.spectralClass).toBe(sysB.star.spectralClass);
      expect(sysA.star.temperatureK).toBe(sysB.star.temperatureK);
      expect(sysA.planetCount).toBe(sysB.planetCount);
    }
  });

  it('3. unterschiedliche Seeds erzeugen unterschiedliche Galaxien', () => {
    const galaxy1 = GalaxyGenerator.generate({ ...baseConfig, seed: 'SEED-ONE' });
    const galaxy2 = GalaxyGenerator.generate({ ...baseConfig, seed: 'SEED-TWO' });

    expect(galaxy1.seed).not.toBe(galaxy2.seed);
    // At least some positions or names must differ
    const pos1 = galaxy1.systems.map((s) => `${s.x},${s.y}`).join('|');
    const pos2 = galaxy2.systems.map((s) => `${s.x},${s.y}`).join('|');
    expect(pos1).not.toBe(pos2);
  });

  it('4. System-IDs sind innerhalb der Galaxie absolut eindeutig', () => {
    const galaxy = GalaxyGenerator.generate({ ...baseConfig, systemCount: 50 });
    const ids = galaxy.systems.map((s) => s.id);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(ids.length);
  });

  it('5. alle Systemkoordinaten liegen innerhalb der definierten Kartengrenzen', () => {
    const width = 800;
    const height = 800;
    const galaxy = GalaxyGenerator.generate({
      ...baseConfig,
      width,
      height,
      systemCount: 40,
    });

    const halfW = width / 2;
    const halfH = height / 2;

    for (const sys of galaxy.systems) {
      expect(sys.x).toBeGreaterThanOrEqual(-halfW);
      expect(sys.x).toBeLessThanOrEqual(halfW);
      expect(sys.y).toBeGreaterThanOrEqual(-halfH);
      expect(sys.y).toBeLessThanOrEqual(halfH);
    }
  });

  it('6. Mindestabstand zwischen Systemen wird eingehalten (keine Kollisionen)', () => {
    const minDistance = 50;
    const galaxy = GalaxyGenerator.generate({
      ...baseConfig,
      minDistance,
      systemCount: 30,
    });

    // Check each pair of systems
    for (let i = 0; i < galaxy.systems.length; i++) {
      for (let j = i + 1; j < galaxy.systems.length; j++) {
        const s1 = galaxy.systems[i];
        const s2 = galaxy.systems[j];
        const dist = Math.hypot(s1.x - s2.x, s1.y - s2.y);
        // Distance should be at least relaxed minimum (0.85 * minDistance in crowded fallback)
        expect(dist).toBeGreaterThanOrEqual(minDistance * 0.84);
      }
    }
  });

  it('7. GameEngine erlaubt korrekte Systemauswahl und Abfrage', () => {
    const engine = GameEngine.getInstance();
    const galaxy = engine.getGalaxy();
    expect(galaxy.systems.length).toBeGreaterThan(0);

    const firstSystem = galaxy.systems[0];
    engine.selectSystem(firstSystem.id);

    const selected = engine.getSelectedSystem();
    expect(selected).not.toBeNull();
    expect(selected?.id).toBe(firstSystem.id);
  });

  it('8. Rundenwechsel erhöht die Rundenzahl genau einmal und benachrichtigt Hooks', () => {
    const turnManager = new TurnManager(1);
    let hookCalls = 0;
    let hookTurnRecorded = 0;

    turnManager.registerTurnHook((state) => {
      hookCalls++;
      hookTurnRecorded = state.currentTurn;
    });

    expect(turnManager.getCurrentTurn()).toBe(1);

    const stateAfter1 = turnManager.advanceTurn();
    expect(stateAfter1.currentTurn).toBe(2);
    expect(turnManager.getCurrentTurn()).toBe(2);
    expect(hookCalls).toBe(1);
    expect(hookTurnRecorded).toBe(2);

    const stateAfter2 = turnManager.advanceTurn();
    expect(stateAfter2.currentTurn).toBe(3);
    expect(turnManager.getCurrentTurn()).toBe(3);
    expect(hookCalls).toBe(2);
  });

  it('9. fehlerhafte Konfigurationen werden kontrolliert behandelt und bereinigt', () => {
    const sanitized = GalaxyGenerator.sanitizeConfig({
      systemCount: -50, // invalid negative count
      width: 10, // too small width
      height: 10,
      minDistance: -20, // invalid negative distance
      seed: '   ', // empty seed
    });

    expect(sanitized.systemCount).toBeGreaterThanOrEqual(5);
    expect(sanitized.width).toBeGreaterThanOrEqual(300);
    expect(sanitized.height).toBeGreaterThanOrEqual(300);
    expect(sanitized.minDistance).toBeGreaterThanOrEqual(20);
    expect(sanitized.seed.length).toBeGreaterThan(0);

    // Generation still succeeds safely
    const galaxy = GalaxyGenerator.generate(sanitized);
    expect(galaxy.systems.length).toBeGreaterThan(0);
  });

  it('10. Speichern und Laden serialisieren und deserialisieren alle relevanten Daten', () => {
    const engine = GameEngine.getInstance();
    const originalTurn = engine.getTurnState().currentTurn;
    const savePayload = engine.createSavePayload('Test-Save-Round');

    const serialized = SaveManager.serialize(savePayload);
    expect(typeof serialized).toBe('string');

    const deserialized = SaveManager.deserialize(serialized);
    expect(deserialized.success).toBe(true);
    expect(deserialized.data).toBeDefined();

    const loadedData = deserialized.data!;
    expect(loadedData.version).toBe(CURRENT_SAVE_VERSION);
    expect(loadedData.turnState.currentTurn).toBe(originalTurn);
    expect(loadedData.galaxy.systems.length).toBe(engine.getGalaxy().systems.length);
    expect(loadedData.galaxy.seed).toBe(engine.getGalaxy().seed);
  });
});
