/**
 * Astraea 4X - Kolonieverwaltung: abgeleitete Werte
 *
 * Die Verwaltungs-Tabs dürfen den Spielzustand nur lesen. Diese Suite prüft
 * Steuerprojektion, Bevölkerungsprognose und Bauplatz-Zählung unabhängig von
 * React, damit die angezeigten Zahlen zur Engine passen.
 */

import { describe, expect, it } from 'vitest';
import { EconomyEngine } from '../src/core/economyEngine.ts';
import type { Colony, PlanetHexTile, PlanetSurface } from '../src/core/types.ts';
import {
  getBuildingSlotSummary,
  getPopulationForecast,
  getTaxProjection,
} from '../src/ui/colonyAdministration.ts';

function makeColony(overrides: Partial<Colony> = {}): Colony {
  return {
    id: 'colony-test',
    name: 'Testhafen',
    planetId: 'SYS-0001-P1',
    systemId: 'SYS-0001',
    civId: 'player-empire',
    factionId: 'player',
    foundedTurn: 3,
    foundedDate: '2187-03-01',
    developmentTier: 'outpost',
    status: 'active',
    cityCenterCoord: { q: 0, r: 0 },
    claimedHexKeys: ['0,0'],
    workedHexKeys: ['0,0'],
    workFocus: 'balanced',
    population: 4,
    growthFoodProgress: 20,
    growthFoodRequired: 50,
    stockpile: {
      food: 12,
      minerals: 30,
      rareResources: 2,
      energyBalance: 0,
      influence: 1,
    },
    netYields: {
      food: 10,
      production: 3,
      energy: 4,
      minerals: 2,
      rareResources: 0,
      research: 1,
      influence: 1,
    },
    grossYields: {
      food: 18,
      production: 3,
      energy: 4,
      minerals: 2,
      rareResources: 0,
      research: 1,
      influence: 1,
    },
    upkeep: { energy: 0, minerals: 0, credits: 2 },
    energyDeficit: false,
    buildings: [],
    buildQueue: [],
    influenceRate: 1,
    researchOutput: 1,
    taxRate: 30,
    corruption: 0.35,
    approval: 50,
    taxRevenue: 4.7,
    sizeClass: 1,
    ...overrides,
  };
}

function makeTile(
  q: number,
  r: number,
  overrides: Partial<PlanetHexTile> = {}
): PlanetHexTile {
  return {
    coord: { q, r },
    key: `${q},${r}`,
    biome: 'plains',
    elevation: 1,
    deposit: 'none',
    isDepositDiscovered: false,
    hasHazard: false,
    claimedByColonyId: 'colony-test',
    claimedByCivId: 'player-empire',
    isCityCenter: false,
    isWorked: false,
    isWorkPrioritized: false,
    isWorkLocked: false,
    buildingInstanceId: null,
    visibility: 'visible',
    ...overrides,
  };
}

function makeSurface(tiles: PlanetHexTile[]): PlanetSurface {
  return {
    planetId: 'SYS-0001-P1',
    width: 8,
    height: 6,
    generatorVersion: 4,
    seed: 'test',
    tiles,
  };
}

describe('Kolonieverwaltung: Steuern', () => {
  it('1. Projiziert Einnahmen, Korruption, Zufriedenheit und Netto-Credits', () => {
    const colony = makeColony();
    const projection = getTaxProjection(colony, 10);

    expect(projection.taxRate).toBe(30);
    expect(projection.taxRevenue).toBe(EconomyEngine.calculateTaxRevenue(colony));
    expect(projection.corruption).toBe(0.35);
    expect(projection.approval).toBe(50);
    expect(projection.upkeepCredits).toBe(2);
    expect(projection.netCredits).toBe(
      Math.round(
        (projection.taxRevenue + projection.privateSectorTax - projection.upkeepCredits) * 10
      ) / 10
    );
    expect(projection.projectedTreasury).toBe(
      Math.round((10 + projection.netCredits) * 10) / 10
    );
  });

  it('2. Klemmt ungültige Steuersätze auf den gültigen Bereich', () => {
    const tooHigh = getTaxProjection(makeColony({ taxRate: 999 }), 0);
    const tooLow = getTaxProjection(makeColony({ taxRate: -20 }), 0);

    expect(tooHigh.taxRate).toBe(60);
    expect(tooLow.taxRate).toBe(0);
    expect(tooLow.corruption).toBe(0.35);
  });

  it('3. Höherer Steuersatz senkt die Zufriedenheit und erhöht die Korruption', () => {
    const low = getTaxProjection(makeColony({ taxRate: 20, approval: 58 }), 0);
    const high = getTaxProjection(makeColony({ taxRate: 50, approval: 34 }), 0);

    expect(high.approval).toBeLessThan(low.approval);
    expect(high.corruption).toBeGreaterThan(low.corruption);
    expect(high.approvalGrowthFactor).toBeLessThan(low.approvalGrowthFactor);
  });
});

describe('Kolonieverwaltung: Bevölkerung', () => {
  it('4. Leitet Wachstumsfortschritt, Runden bis zum nächsten Pop und Arbeitskräfte ab', () => {
    const colony = makeColony({
      claimedHexKeys: ['0,0', '1,0', '2,0', '3,0'],
      workedHexKeys: ['0,0', '1,0', '2,0'],
      population: 4,
      netYields: {
        food: 10,
        production: 3,
        energy: 4,
        minerals: 2,
        rareResources: 0,
        research: 1,
        influence: 1,
      },
    });
    const surface = makeSurface([
      makeTile(0, 0, { isCityCenter: true }),
      makeTile(1, 0, { isWorked: true }),
      makeTile(2, 0, { isWorked: true }),
      makeTile(3, 0),
    ]);

    const forecast = getPopulationForecast(colony, surface, 50);

    expect(forecast.popUnits).toBe(4);
    expect(forecast.colonists).toBe(4000);
    expect(forecast.habitabilityMultiplier).toBe(0.5);
    expect(forecast.approvalGrowthFactor).toBe(1);
    expect(forecast.combinedGrowthMultiplier).toBe(0.5);
    expect(forecast.growthPerTurn).toBe(5);
    expect(forecast.growthPercent).toBe(40);
    // 30 fehlende Fortschrittspunkte bei 5 pro Runde
    expect(forecast.turnsToNextPop).toBe(6);
    // Das Stadtzentrum zählt nicht als bewirtschaftetes Feld
    expect(forecast.workedTiles).toBe(2);
    expect(forecast.freeWorkers).toBe(2);
  });

  it('5. Ohne Nahrungsüberschuss gibt es kein Wachstum', () => {
    const colony = makeColony({
      netYields: {
        food: -3,
        production: 3,
        energy: 4,
        minerals: 2,
        rareResources: 0,
        research: 1,
        influence: 1,
      },
    });

    const forecast = getPopulationForecast(colony, null, 100);

    expect(forecast.hasFoodSurplus).toBe(false);
    expect(forecast.growthPerTurn).toBe(0);
    expect(forecast.turnsToNextPop).toBeNull();
  });
});

describe('Kolonieverwaltung: Bauplätze', () => {
  it('6. Zählt bebaute, freie und durch Distrikte belegte Felder', () => {
    const colony = makeColony({
      claimedHexKeys: ['0,0', '1,0', '2,0', '3,0', '4,0', '5,0'],
      buildings: [
        {
          id: 'bld-1',
          colonyId: 'colony-test',
          hexCoord: { q: 1, r: 0 },
          buildingDefId: 'farm',
          level: 1,
          isActive: true,
        },
      ],
    });
    const surface = makeSurface([
      makeTile(0, 0, { isCityCenter: true }),
      makeTile(1, 0, { buildingInstanceId: 'bld-1' }),
      makeTile(2, 0, { districtInstanceId: 'dist-1' }),
      makeTile(3, 0),
      makeTile(4, 0),
      makeTile(5, 0),
      // Nicht beanspruchtes Feld darf nicht als Bauplatz zählen
      makeTile(6, 0, { claimedByColonyId: null, claimedByCivId: null }),
    ]);

    const slots = getBuildingSlotSummary(colony, surface);

    expect(slots.built).toBe(1);
    expect(slots.free).toBe(3);
    expect(slots.blockedByDistricts).toBe(1);
    expect(slots.territory).toBe(6);
  });

  it('7. Fällt ohne Oberfläche auf das beanspruchte Territorium zurück', () => {
    const colony = makeColony({ claimedHexKeys: ['0,0', '1,0', '2,0'] });
    const slots = getBuildingSlotSummary(colony, null);

    expect(slots.territory).toBe(3);
    expect(slots.free).toBe(0);
    expect(slots.built).toBe(0);
  });
});
