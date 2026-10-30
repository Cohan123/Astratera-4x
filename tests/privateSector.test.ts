/**
 * Astraea 4X - Privatsektor Test Suite (Phase 3)
 * Handelsvolumen, Handelssteuer, zivile Umverteilung, Determinismus und
 * Integration in die Rundenauswertung.
 */

import { describe, expect, it } from 'vitest';
import { GameEngine } from '../src/core/GameEngine.ts';
import {
  PRIVATE_SECTOR_RESERVE,
  PRIVATE_SECTOR_TARGET_STOCK,
  PrivateSectorManager,
} from '../src/core/privateSectorManager.ts';
import { Colony, ResourceYields } from '../src/core/types.ts';

function emptyYields(): ResourceYields {
  return {
    food: 0,
    production: 0,
    energy: 0,
    minerals: 0,
    rareResources: 0,
    research: 0,
    influence: 0,
  };
}

interface ColonyFixture {
  id: string;
  civId: string;
  developmentTier?: Colony['developmentTier'];
  population?: number;
  taxRate?: number;
  status?: Colony['status'];
  food?: number;
  minerals?: number;
  rareResources?: number;
}

function makeColony(fixture: ColonyFixture): Colony {
  return {
    id: fixture.id,
    name: fixture.id,
    planetId: `planet-${fixture.id}`,
    systemId: `system-${fixture.id}`,
    civId: fixture.civId,
    factionId: `faction-${fixture.civId}`,
    foundedTurn: 1,
    foundedDate: '2380.01',
    developmentTier: fixture.developmentTier ?? 'colony',
    status: fixture.status ?? 'active',
    cityCenterCoord: { q: 0, r: 0 },
    claimedHexKeys: [],
    workedHexKeys: [],
    workFocus: 'balanced',
    population: fixture.population ?? 1000,
    growthFoodProgress: 0,
    growthFoodRequired: 50,
    stockpile: {
      food: fixture.food ?? 0,
      minerals: fixture.minerals ?? 0,
      rareResources: fixture.rareResources ?? 0,
      energyBalance: 0,
      influence: 0,
    },
    netYields: emptyYields(),
    grossYields: emptyYields(),
    upkeep: { energy: 0, minerals: 0, credits: 0 },
    energyDeficit: false,
    buildings: [],
    buildQueue: [],
    influenceRate: 0,
    researchOutput: 0,
    taxRate: fixture.taxRate,
    sizeClass: 5,
  };
}

describe('Astraea 4X - Privatsektor', () => {
  it('1. Handelsvolumen skaliert mit Stufe, Bevölkerung und Zufriedenheit', () => {
    // Außenposten, 1.000 Kolonisten, Standardsteuer 30 % → Zufriedenheit 50.
    const outpost = makeColony({ id: 'c-out', civId: 'civ-a', developmentTier: 'outpost' });
    expect(PrivateSectorManager.calculateCommerceVolume(outpost)).toBe(1.5);

    // Siedlung, 2.000 Kolonisten → Zufriedenheit 55.
    const settlement = makeColony({
      id: 'c-set',
      civId: 'civ-a',
      developmentTier: 'settlement',
      population: 2000,
    });
    expect(PrivateSectorManager.calculateCommerceVolume(settlement)).toBe(6.6);

    // Kolonie, 3.000 Kolonisten → Zufriedenheit 60.
    const colony = makeColony({ id: 'c-col', civId: 'civ-a', population: 3000 });
    expect(PrivateSectorManager.calculateCommerceVolume(colony)).toBe(16.2);

    // Höchststeuer senkt über die Zufriedenheit das Handelsvolumen.
    const taxed = makeColony({ id: 'c-tax', civId: 'civ-a', population: 3000, taxRate: 60 });
    expect(PrivateSectorManager.calculateCommerceVolume(taxed)).toBeLessThan(16.2);
  });

  it('2. Handelssteuer beträgt 25 % des Handelsvolumens und wird auf eine Nachkommastelle gerundet', () => {
    expect(PrivateSectorManager.calculateCommerceTax(1.5)).toBe(0.4);
    expect(PrivateSectorManager.calculateCommerceTax(16.2)).toBe(4.1);
    expect(PrivateSectorManager.calculateCommerceTax(0)).toBe(0);
    expect(PrivateSectorManager.calculateCommerceTax(-5)).toBe(0);
    expect(PrivateSectorManager.calculateCommerceTax(Number.NaN)).toBe(0);
  });

  it('3. Frachtkapazität hängt von Bevölkerungs-Einheiten und Entwicklungsstufe ab', () => {
    expect(
      PrivateSectorManager.calculateCapacity(
        makeColony({ id: 'c-1', civId: 'civ-a', developmentTier: 'outpost' })
      )
    ).toBe(1);
    expect(
      PrivateSectorManager.calculateCapacity(
        makeColony({ id: 'c-2', civId: 'civ-a', developmentTier: 'settlement', population: 2000 })
      )
    ).toBe(4);
    expect(
      PrivateSectorManager.calculateCapacity(
        makeColony({ id: 'c-3', civId: 'civ-a', population: 3000 })
      )
    ).toBe(9);
  });

  it('4. Zivile Händler füllen einen Empfänger bis zum Zielbestand', () => {
    const manager = new PrivateSectorManager();
    const donor = makeColony({ id: 'c-donor', civId: 'civ-a', population: 3000, food: 100 });
    const receiver = makeColony({ id: 'c-receiver', civId: 'civ-a', food: 35 });

    const [report] = manager.advanceTurn([donor, receiver]);

    expect(donor.stockpile.food).toBe(95);
    expect(receiver.stockpile.food).toBe(PRIVATE_SECTOR_TARGET_STOCK.food);
    expect(report.delivered.food).toBe(5);
    expect(report.shipped.food).toBe(5);
    expect(report.transfers).toEqual([
      { fromColonyId: 'c-donor', toColonyId: 'c-receiver', resource: 'food', amount: 5 },
    ]);
  });

  it('5. Ein Geber fällt nie unter seine Reserve', () => {
    const manager = new PrivateSectorManager();
    const donor = makeColony({ id: 'c-donor', civId: 'civ-a', population: 3000, food: 65 });
    const receiver = makeColony({ id: 'c-receiver', civId: 'civ-a', food: 0 });

    manager.advanceTurn([donor, receiver]);

    expect(donor.stockpile.food).toBe(PRIVATE_SECTOR_RESERVE.food);
    expect(receiver.stockpile.food).toBe(5);
  });

  it('6. Die Frachtkapazität begrenzt die Umverteilung pro Runde', () => {
    const manager = new PrivateSectorManager();
    const donor = makeColony({
      id: 'c-donor',
      civId: 'civ-a',
      developmentTier: 'outpost',
      food: 200,
    });
    const receiver = makeColony({ id: 'c-receiver', civId: 'civ-a', food: 0 });

    manager.advanceTurn([donor, receiver]);

    expect(donor.stockpile.food).toBe(199);
    expect(receiver.stockpile.food).toBe(1);
  });

  it('7. Güter bleiben über mehrere Runden erhalten', () => {
    const manager = new PrivateSectorManager();
    const colonies = [
      makeColony({
        id: 'c-a',
        civId: 'civ-a',
        population: 3000,
        food: 90,
        minerals: 70,
        rareResources: 30,
      }),
      makeColony({ id: 'c-b', civId: 'civ-a', food: 0, minerals: 0, rareResources: 0 }),
    ];
    const totalFood = colonies.reduce((sum, c) => sum + c.stockpile.food, 0);
    const totalMinerals = colonies.reduce((sum, c) => sum + c.stockpile.minerals, 0);
    const totalRare = colonies.reduce((sum, c) => sum + c.stockpile.rareResources, 0);
    const moved = { food: 0, minerals: 0, rareResources: 0 };

    for (let turn = 0; turn < 6; turn += 1) {
      const [report] = manager.advanceTurn(colonies);
      expect(report.shipped.food).toBe(report.delivered.food);
      expect(report.shipped.minerals).toBe(report.delivered.minerals);
      expect(report.shipped.rareResources).toBe(report.delivered.rareResources);
      moved.food += report.shipped.food;
      moved.minerals += report.shipped.minerals;
      moved.rareResources += report.shipped.rareResources;
    }

    // Alle drei Güter werden über die Runden tatsächlich bewegt.
    expect(moved.food).toBeGreaterThan(0);
    expect(moved.minerals).toBeGreaterThan(0);
    expect(moved.rareResources).toBeGreaterThan(0);
    expect(colonies.reduce((sum, c) => sum + c.stockpile.food, 0)).toBe(totalFood);
    expect(colonies.reduce((sum, c) => sum + c.stockpile.minerals, 0)).toBe(totalMinerals);
    expect(colonies.reduce((sum, c) => sum + c.stockpile.rareResources, 0)).toBe(totalRare);
  });

  it('8. Zwischen Zivilisationen werden keine Güter bewegt', () => {
    const manager = new PrivateSectorManager();
    const donor = makeColony({ id: 'c-a', civId: 'civ-a', food: 200 });
    const foreignReceiver = makeColony({ id: 'c-b', civId: 'civ-b', food: 0 });

    const reports = manager.advanceTurn([donor, foreignReceiver]);

    expect(donor.stockpile.food).toBe(200);
    expect(foreignReceiver.stockpile.food).toBe(0);
    expect(reports).toHaveLength(2);
    expect(reports[0].civId).toBe('civ-a');
    expect(reports[0].delivered.food).toBe(0);
    expect(reports[1].civId).toBe('civ-b');
    expect(reports[1].transfers).toEqual([]);
  });

  it('9. Inaktive Kolonien nehmen nicht am Privatsektor teil', () => {
    const manager = new PrivateSectorManager();
    const donor = makeColony({ id: 'c-a', civId: 'civ-a', food: 200 });
    const abandoned = makeColony({
      id: 'c-b',
      civId: 'civ-a',
      food: 0,
      status: 'abandoned',
    });

    const [report] = manager.advanceTurn([donor, abandoned]);

    expect(abandoned.stockpile.food).toBe(0);
    expect(report.colonyCount).toBe(1);
    expect(report.delivered.food).toBe(0);
  });

  it('10. Gleiche Ausgangslage liefert identische Berichte und bevorzugt die kleinere ID', () => {
    const buildScenario = () => [
      makeColony({ id: 'c-b', civId: 'civ-a', food: 30 }),
      makeColony({ id: 'c-a', civId: 'civ-a', food: 30 }),
      makeColony({ id: 'c-donor', civId: 'civ-a', food: 200 }),
    ];

    const firstRun = new PrivateSectorManager();
    const firstReport = firstRun.advanceTurn(buildScenario());
    const secondRun = new PrivateSectorManager();
    const secondReport = secondRun.advanceTurn(buildScenario());

    expect(firstReport).toEqual(secondReport);
    expect(firstReport[0].transfers).toHaveLength(1);
    expect(firstReport[0].transfers[0].toColonyId).toBe('c-a');
  });

  it('11. Der Bericht fasst Volumen, Steuer und Kapazität je Zivilisation zusammen', () => {
    const manager = new PrivateSectorManager();
    const outpost = makeColony({
      id: 'c-a',
      civId: 'civ-a',
      developmentTier: 'outpost',
    });
    const settlement = makeColony({
      id: 'c-b',
      civId: 'civ-a',
      developmentTier: 'settlement',
      population: 2000,
    });

    const [report] = manager.advanceTurn([outpost, settlement], []);

    expect(report.colonyCount).toBe(2);
    expect(report.commerceVolume).toBe(8.1);
    expect(report.commerceTax).toBe(2.1);
    expect(report.capacity).toBe(5);
    expect(manager.getReportForCiv('civ-a')).toEqual(report);
    expect(manager.getReportForCiv('civ-unknown')).toBeNull();
  });

  it('12. clear() verwirft die abgeleiteten Berichte', () => {
    const manager = new PrivateSectorManager();
    manager.advanceTurn([makeColony({ id: 'c-a', civId: 'civ-a' })]);
    expect(manager.getLastReports()).toHaveLength(1);

    manager.clear();

    expect(manager.getLastReports()).toEqual([]);
  });

  it('13. endTurn schreibt die Handelssteuer zusätzlich zur Steuer der Staatskasse gut', () => {
    const engine = GameEngine.getInstance();
    engine.generateNewGalaxy({ seed: 'PRIVATE-SECTOR-SEED-13' });
    const system = engine.getGalaxy().systems[0];
    engine.selectSystem(system.id);
    engine.surveySystem(system.id);

    const planet = system.planets.find((p) => p.planetType !== 'gas_giant') || system.planets[0];
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

    const founded = engine.foundColony(planet.id, 'Handels-Prime');
    expect(founded.success).toBe(true);

    const civ = engine.getPlayerCiv();
    const treasuryBefore = civ.treasury;

    engine.endTurn();

    const colonyAfter = engine.getColonyByPlanetId(planet.id)!;
    const report = engine.getPrivateSectorReport(civ.id);
    expect(report).not.toBeNull();
    expect(report!.commerceTax).toBeGreaterThan(0);

    expect(civ.treasury - treasuryBefore).toBeCloseTo(
      (colonyAfter.taxRevenue ?? 0) + report!.commerceTax - (colonyAfter.upkeep.credits ?? 0),
      5
    );
  });
});
