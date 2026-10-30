/**
 * Astraea 4X - Wirtschaft Stufe A Test Suite
 * Steuersatz, Korruption, Zufriedenheit, Steuereinnahmen, Staatskasse und Save v4.
 */

import { describe, expect, it } from 'vitest';
import { GameEngine } from '../src/core/GameEngine.ts';
import { ColonyManager } from '../src/core/colonyManager.ts';
import {
  DEFAULT_TAX_RATE,
  MAX_TAX_RATE,
  MIN_TAX_RATE,
  EconomyEngine,
} from '../src/core/economyEngine.ts';
import { STARTING_TREASURY_PLAYER } from '../src/core/civManager.ts';
import { SaveManager } from '../src/save/saveManager.ts';
import { EventBus } from '../src/core/EventBus.ts';
import { Colony, Planet, StarSystem } from '../src/core/types.ts';
import { SurfaceGenerator } from '../src/surface/surfaceGenerator.ts';

function createMockPlanet(id: string = 'econ-planet-01'): Planet {
  return {
    id,
    name: 'Aurelia Prime',
    systemId: 'econ-sys-01',
    orbitIndex: 2,
    orbitDistanceAu: 1.1,
    orbitalPeriodDays: 365,
    currentAngleRad: 0,
    planetType: 'ocean',
    sizeClass: 16,
    surfaceTemperatureK: 292,
    temperatureCategory: 'temperate',
    atmosphere: 'breathable',
    waterAvailability: 'liquid_ocean',
    gravityG: 1.0,
    gravityCategory: 'standard',
    radiationHazard: 'negligible',
    geologicalStability: 'stable',
    habitability: 85,
    habitabilityTier: 'ideal',
    surveyStatus: 'analyzed',
    colonizationStatus: 'uncolonized',
    colonyId: null,
    color: '#38bdf8',
    accentColor: '#0284c7',
    texturePattern: 'oceans',
    moonsCount: 1,
  };
}

function createMockSystem(id: string = 'econ-sys-01'): StarSystem {
  return {
    id,
    name: 'Aurelia System',
    x: 50,
    y: 50,
    star: {
      id: 'star-econ-sys-01',
      name: 'Aurelia',
      spectralClass: 'G',
      color: '#facc15',
      glowColor: '#ca8a04',
      temperatureK: 5778,
      luminositySolar: 1.0,
      massSolar: 1.0,
      radiusKm: 696340,
    },
    planetCount: 1,
    planets: [createMockPlanet()],
    discoveryStatus: 'surveyed',
    ownerFactionId: null,
    hyperlanes: [],
    anomalyDetected: false,
  };
}

/**
 * Gründet über die Engine eine Spielerkolonie im ersten System und liefert sie zurück.
 */
function foundPlayerColony(engine: GameEngine, seed: string): Colony {
  engine.generateNewGalaxy({ seed });
  const sys = engine.getGalaxy().systems[0];
  engine.selectSystem(sys.id);
  engine.surveySystem(sys.id);

  const planet = sys.planets.find((p) => p.planetType !== 'gas_giant') || sys.planets[0];
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

  const result = engine.foundColony(planet.id, 'Steuer-Prime');
  expect(result.success).toBe(true);
  return result.colony!;
}

describe('Astraea 4X - Wirtschaft Stufe A', () => {
  it('1. Steuersatz-Konstanten und Normalisierung bleiben im gültigen Bereich', () => {
    expect(DEFAULT_TAX_RATE).toBe(30);
    expect(MIN_TAX_RATE).toBe(0);
    expect(MAX_TAX_RATE).toBe(60);

    expect(EconomyEngine.normalizeTaxRate(undefined)).toBe(30);
    expect(EconomyEngine.normalizeTaxRate(null)).toBe(30);
    expect(EconomyEngine.normalizeTaxRate(Number.NaN)).toBe(30);
    expect(EconomyEngine.normalizeTaxRate(-10)).toBe(0);
    expect(EconomyEngine.normalizeTaxRate(999)).toBe(60);
    expect(EconomyEngine.normalizeTaxRate(29.6)).toBe(30);
  });

  it('2. Korruption und Zufriedenheit folgen Steuersatz und Entwicklungsstufe', () => {
    expect(EconomyEngine.calculateCorruption(30, 'outpost')).toBe(0.35);
    expect(EconomyEngine.calculateCorruption(60, 'outpost')).toBe(0.45);
    expect(EconomyEngine.calculateCorruption(30, 'settlement')).toBe(0.2);
    expect(EconomyEngine.calculateCorruption(30, 'colony')).toBe(0.1);

    expect(EconomyEngine.calculateApproval(30, 'outpost')).toBe(50);
    expect(EconomyEngine.calculateApproval(60, 'outpost')).toBe(26);
    expect(EconomyEngine.calculateApproval(0, 'outpost')).toBe(74);
    expect(EconomyEngine.calculateApproval(30, 'colony')).toBe(60);
  });

  it('3. Zufriedenheit skaliert das Wachstum neutral bei 50 Punkten', () => {
    expect(EconomyEngine.calculateApprovalGrowthFactor(50)).toBe(1.0);
    expect(EconomyEngine.calculateApprovalGrowthFactor(0)).toBe(0.5);
    expect(EconomyEngine.calculateApprovalGrowthFactor(100)).toBe(1.5);
    expect(EconomyEngine.calculateApprovalGrowthFactor(200)).toBe(1.5);
  });

  it('4. Steuereinnahmen berechnen sich aus Bevölkerung, Steuersatz und Korruption', () => {
    const outpost = {
      population: 1000,
      taxRate: 30,
      developmentTier: 'outpost',
    } as unknown as Colony;
    expect(EconomyEngine.calculateTaxRevenue(outpost)).toBe(1.2);

    const highTax = {
      population: 1000,
      taxRate: 60,
      developmentTier: 'outpost',
    } as unknown as Colony;
    expect(EconomyEngine.calculateTaxRevenue(highTax)).toBe(2);

    const settlement = {
      population: 1000,
      taxRate: 30,
      developmentTier: 'settlement',
    } as unknown as Colony;
    expect(EconomyEngine.calculateTaxRevenue(settlement)).toBe(1.4);
  });

  it('5. Koloniegründung setzt neutrale Finanzstartwerte', () => {
    const bus = EventBus.getInstance();
    const cm = new ColonyManager(bus);
    const planet = createMockPlanet();
    const system = createMockSystem();
    const surface = SurfaceGenerator.generateSurface(planet, 'ECON-SEED-05');

    const res = cm.foundColony(
      planet,
      system,
      surface,
      1,
      '2380.01',
      'player-empire',
      'Steuerhafen',
      { q: 4, r: 4 }
    );
    expect(res.success).toBe(true);

    const colony = res.colony!;
    expect(colony.taxRate).toBe(DEFAULT_TAX_RATE);
    expect(colony.corruption).toBe(0.35);
    expect(colony.approval).toBe(50);
    expect(colony.taxRevenue).toBe(1.2);
  });

  it('6. setColonyTaxRate normalisiert, rechnet neu und sendet ein Event', () => {
    const engine = GameEngine.getInstance();
    const colony = foundPlayerColony(engine, 'ECON-TAX-SEED-06');
    const bus = EventBus.getInstance();

    let captured: { colonyId: string; taxRate: number } | null = null;
    const unsubscribe = bus.on('colony:taxRateChanged', (payload) => {
      captured = payload;
    });

    engine.setColonyTaxRate(colony.id, 60);

    expect(colony.taxRate).toBe(60);
    expect(colony.corruption).toBe(0.45);
    expect(colony.approval).toBe(26);
    expect(colony.taxRevenue).toBe(2);
    expect(captured).toEqual({ colonyId: colony.id, taxRate: 60 });

    unsubscribe();
  });

  it('7. endTurn schreibt Steuereinnahmen genau einmal der Staatskasse gut (netto nach Wartung)', () => {
    const engine = GameEngine.getInstance();
    const colony = foundPlayerColony(engine, 'ECON-TREASURY-SEED-07');
    // Vorher-Wert aus der Engine selbst lesen, damit dieselbe Civ-Instanz verglichen wird.
    const treasuryBefore = engine.getPlayerCiv().treasury;

    engine.endTurn();

    const colonyAfter = engine.getColonyByPlanetId(colony.planetId)!;
    const revenueAfterTurn = colonyAfter.taxRevenue ?? 0;
    const maintenanceAfterTurn = colonyAfter.upkeep.credits ?? 0;
    const commerceTaxAfterTurn =
      engine.getPrivateSectorReport(engine.getPlayerCiv().id)?.commerceTax ?? 0;
    expect(revenueAfterTurn).toBeGreaterThan(0);
    expect(commerceTaxAfterTurn).toBeGreaterThan(0);
    expect(engine.getPlayerCiv().treasury - treasuryBefore).toBeCloseTo(
      revenueAfterTurn + commerceTaxAfterTurn - maintenanceAfterTurn,
      5
    );
  });

  it('8. v3-Spielstände erhalten bei der Migration auf v4 Finanzdefaults', () => {
    const engine = GameEngine.getInstance();
    const founded = foundPlayerColony(engine, 'ECON-MIGRATION-SEED-08');
    const payload = JSON.parse(JSON.stringify(engine.createSavePayload('Stufe-A-Migration')));

    for (const civ of payload.civilizations) {
      delete civ.treasury;
    }
    for (const colony of payload.colonies) {
      delete colony.taxRate;
      delete colony.corruption;
      delete colony.approval;
      delete colony.taxRevenue;
    }
    payload.version = 3;

    const result = SaveManager.deserialize(JSON.stringify(payload));
    expect(result.success).toBe(true);
    expect(result.data?.version).toBe(5);

    const playerCiv = result.data!.civilizations.find((civ) => civ.isPlayer)!;
    expect(playerCiv.treasury).toBe(STARTING_TREASURY_PLAYER);

    // Nur die selbst gegründete Kolonie prüfen: KI-Kolonien können bereits
    // eine höhere Entwicklungsstufe und damit andere Finanzdefaults besitzen.
    const colony = result.data!.colonies.find((entry) => entry.id === founded.id)!;
    expect(colony.developmentTier).toBe('outpost');
    expect(colony.taxRate).toBe(DEFAULT_TAX_RATE);
    expect(colony.corruption).toBe(0.35);
    expect(colony.approval).toBe(50);
    expect(colony.taxRevenue).toBe(1.2);
  });
});
