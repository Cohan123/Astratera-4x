/**
 * Astraea 4X - Steuerregler-Regressionssuite
 *
 * Der Steuerregler darf ausschließlich Steuerparameter verändern. Früher löste
 * jede Reglerbewegung einen vollen Wirtschaftsturn aus (Vorratsgewinne,
 * Bevölkerungswachstum) und war damit ein Ressourcen-Exploit.
 *
 * Diese Suite prüft: Erhöhen, Senken, Zurücksetzen, Wiederholen,
 * Vorratsvergleich, Produktion/Verbrauch, Save/Load, Unberührtheit anderer
 * Kolonien und den Ausschluss des Exploits.
 */

import { describe, expect, it } from 'vitest';
import { GameEngine } from '../src/core/GameEngine.ts';
import { Colony, Planet } from '../src/core/types.ts';
import { DEFAULT_TAX_RATE, MAX_TAX_RATE, MIN_TAX_RATE } from '../src/core/economyEngine.ts';

/** Macht einen Planeten zu einem idealen Kolonisationsziel. */
function makeHabitable(planet: Planet): void {
  planet.planetType = 'ocean';
  planet.surveyStatus = 'analyzed';
  planet.radiationHazard = 'negligible';
  planet.colonizationStatus = 'uncolonized';
  planet.colonyId = null;
  planet.surfaceTemperatureK = 292;
  planet.temperatureCategory = 'temperate';
  planet.atmosphere = 'breathable';
  planet.waterAvailability = 'liquid_ocean';
  planet.gravityG = 1;
  planet.gravityCategory = 'standard';
  planet.geologicalStability = 'stable';
  planet.habitability = 90;
  planet.habitabilityTier = 'ideal';
}

/**
 * Erzeugt eine frische Galaxie und gründet eine Spielerkolonie.
 * Gibt die Kolonie-Instanz aus der Engine zurück (keine Kopie).
 */
function foundPlayerColony(engine: GameEngine, seed: string): Colony {
  engine.generateNewGalaxy({ seed });
  const sys = engine.getGalaxy().systems[0];
  engine.selectSystem(sys.id);
  engine.surveySystem(sys.id);

  const planet = sys.planets.find((p) => p.planetType !== 'gas_giant') ?? sys.planets[0];
  makeHabitable(planet);

  const result = engine.foundColony(planet.id, 'Steuerhafen');
  expect(result.success).toBe(true);
  return result.colony!;
}

/**
 * Gründet eine zweite Spielerkolonie im selben System (anderer Planet).
 */
function foundSecondPlayerColony(engine: GameEngine): Colony {
  const sys = engine.getGalaxy().systems[0];
  engine.selectSystem(sys.id);

  const planet = sys.planets.find(
    (p) => !p.colonyId && p.id !== engine.getColonies()[0]?.planetId
  );
  expect(planet).toBeDefined();
  makeHabitable(planet!);

  // Für die zweite Gründung wird ein weiteres beladenes Kolonieschiff benötigt.
  engine.provisionColonyShip(sys.id);
  const result = engine.foundColony(planet!.id, 'Zweitkolonie');
  expect(result.success).toBe(true);
  return result.colony!;
}

/** Wirtschaftlich relevanter Zustand einer Kolonie (ohne Steuerfelder). */
function economicSnapshot(colony: Colony): string {
  return JSON.stringify({
    stockpile: colony.stockpile,
    population: colony.population,
    growthFoodProgress: colony.growthFoodProgress,
    growthFoodRequired: colony.growthFoodRequired,
    netYields: colony.netYields,
    grossYields: colony.grossYields,
    upkeep: colony.upkeep,
    buildings: colony.buildings,
    workedHexKeys: colony.workedHexKeys,
  });
}

describe('Astraea 4X - Steuerregler ohne Ressourcen-Exploit', () => {
  it('1. Steuer erhöhen ändert ausschließlich die Steuerparameter', () => {
    const engine = GameEngine.getInstance();
    const colony = foundPlayerColony(engine, 'TAX-RAISE-01');
    const before = economicSnapshot(colony);
    const stockpileBefore = { ...colony.stockpile };

    engine.setColonyTaxRate(colony.id, MAX_TAX_RATE);

    expect(colony.taxRate).toBe(60);
    expect(colony.corruption).toBe(0.45);
    expect(colony.approval).toBe(26);
    expect(colony.taxRevenue).toBeGreaterThan(0);
    expect(colony.stockpile).toEqual(stockpileBefore);
    expect(economicSnapshot(colony)).toBe(before);
  });

  it('2. Steuer senken ändert ausschließlich die Steuerparameter', () => {
    const engine = GameEngine.getInstance();
    const colony = foundPlayerColony(engine, 'TAX-LOWER-02');
    const before = economicSnapshot(colony);
    const stockpileBefore = { ...colony.stockpile };

    engine.setColonyTaxRate(colony.id, MIN_TAX_RATE);

    expect(colony.taxRate).toBe(0);
    expect(colony.corruption).toBe(0.35);
    expect(colony.approval).toBe(74);
    expect(colony.taxRevenue).toBe(0);
    expect(colony.stockpile).toEqual(stockpileBefore);
    expect(economicSnapshot(colony)).toBe(before);
  });

  it('3. Zurücksetzen auf den Standardwert bleibt ohne Wirtschaftsfolgen', () => {
    const engine = GameEngine.getInstance();
    const colony = foundPlayerColony(engine, 'TAX-RESET-03');
    const original = economicSnapshot(colony);

    engine.setColonyTaxRate(colony.id, 55);
    engine.setColonyTaxRate(colony.id, 5);
    engine.setColonyTaxRate(colony.id, DEFAULT_TAX_RATE);

    expect(colony.taxRate).toBe(DEFAULT_TAX_RATE);
    expect(colony.corruption).toBe(0.35);
    expect(colony.approval).toBe(50);
    expect(economicSnapshot(colony)).toBe(original);
  });

  it('4. Wiederholtes Verstellen erzeugt keine Ressourcen', () => {
    const engine = GameEngine.getInstance();
    const colony = foundPlayerColony(engine, 'TAX-REPEAT-04');
    const stockpileBefore = { ...colony.stockpile };
    const populationBefore = colony.population;
    const growthBefore = colony.growthFoodProgress;

    for (let i = 0; i < 25; i++) {
      engine.setColonyTaxRate(colony.id, MAX_TAX_RATE);
      engine.setColonyTaxRate(colony.id, MIN_TAX_RATE);
    }

    expect(colony.stockpile).toEqual(stockpileBefore);
    expect(colony.population).toBe(populationBefore);
    expect(colony.growthFoodProgress).toBe(growthBefore);
  });

  it('5. Vorratsvergleich: verstellter Regler entspricht unverändertem Zustand', () => {
    const engine = GameEngine.getInstance();
    const colony = foundPlayerColony(engine, 'TAX-STOCK-05');
    const controlSave = JSON.parse(JSON.stringify(engine.createSavePayload('Kontrolle')));

    for (const rate of [0, 17, 42, 60, 30, 44, 8]) {
      engine.setColonyTaxRate(colony.id, rate);
    }
    const afterChanges = economicSnapshot(colony);

    expect(engine.restoreFromSaveData(controlSave)).toBe(true);
    const controlColony = engine.getColonies().find((c) => c.id === colony.id)!;

    expect(economicSnapshot(controlColony)).toBe(afterChanges);
  });

  it('6. Produktion und Verbrauch der Runde bleiben unverändert', () => {
    const engine = GameEngine.getInstance();
    const colony = foundPlayerColony(engine, 'TAX-PROD-06');

    // Referenzlauf: gespeicherter Zustand ohne Reglerbewegung.
    const referenceSave = JSON.parse(JSON.stringify(engine.createSavePayload('Referenz')));
    expect(engine.restoreFromSaveData(JSON.parse(JSON.stringify(referenceSave)))).toBe(true);
    engine.endTurn();
    const referenceColony = engine.getColonies().find((c) => c.id === colony.id)!;
    const referenceStockpile = { ...referenceColony.stockpile };
    const referenceYields = { ...referenceColony.netYields };
    const referenceTreasury = engine.getPlayerCiv().treasury;

    // Testlauf: identischer Zustand, aber vorher mehrfach am Regler gedreht.
    expect(engine.restoreFromSaveData(JSON.parse(JSON.stringify(referenceSave)))).toBe(true);
    for (const rate of [55, 10, 60, 0, 30]) {
      engine.setColonyTaxRate(colony.id, rate);
    }
    engine.endTurn();
    const testColony = engine.getColonies().find((c) => c.id === colony.id)!;

    expect(testColony.stockpile).toEqual(referenceStockpile);
    expect(testColony.netYields).toEqual(referenceYields);
    expect(engine.getPlayerCiv().treasury).toBeCloseTo(referenceTreasury, 5);
  });

  it('7. Save/Load erhält den Steuersatz und erzeugt keine Ressourcen', () => {
    const engine = GameEngine.getInstance();
    const colony = foundPlayerColony(engine, 'TAX-SAVE-07');
    engine.setColonyTaxRate(colony.id, 47);

    const expected = {
      taxRate: colony.taxRate,
      corruption: colony.corruption,
      approval: colony.approval,
      taxRevenue: colony.taxRevenue,
    };
    const economicBefore = economicSnapshot(colony);
    const payload = JSON.parse(JSON.stringify(engine.createSavePayload('Steuerspeicher')));

    expect(engine.restoreFromSaveData(payload)).toBe(true);
    const loaded = engine.getColonies().find((c) => c.id === colony.id)!;

    expect({
      taxRate: loaded.taxRate,
      corruption: loaded.corruption,
      approval: loaded.approval,
      taxRevenue: loaded.taxRevenue,
    }).toEqual(expected);
    expect(economicSnapshot(loaded)).toBe(economicBefore);
  });

  it('8. Andere Kolonien bleiben unberührt', () => {
    const engine = GameEngine.getInstance();
    const first = foundPlayerColony(engine, 'TAX-OTHERS-08');
    const second = foundSecondPlayerColony(engine);

    const secondBefore = economicSnapshot(second);
    const secondTaxBefore = second.taxRate;

    engine.setColonyTaxRate(first.id, MAX_TAX_RATE);

    expect(first.taxRate).toBe(MAX_TAX_RATE);
    expect(second.taxRate).toBe(secondTaxBefore);
    expect(economicSnapshot(second)).toBe(secondBefore);
  });

  it('9. Kein Exploit: Min/Max-Pendeln verändert weder Vorräte noch Staatskasse', () => {
    const engine = GameEngine.getInstance();
    const colony = foundPlayerColony(engine, 'TAX-EXPLOIT-09');
    const stockpileBefore = { ...colony.stockpile };
    const treasuryBefore = engine.getPlayerCiv().treasury;

    for (let i = 0; i < 100; i++) {
      engine.setColonyTaxRate(colony.id, i % 2 === 0 ? MAX_TAX_RATE : MIN_TAX_RATE);
    }

    expect(colony.stockpile).toEqual(stockpileBefore);
    expect(engine.getPlayerCiv().treasury).toBe(treasuryBefore);
    expect(colony.taxRate).toBe(MIN_TAX_RATE);
  });
});
