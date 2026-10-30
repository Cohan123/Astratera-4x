/**
 * Astraea 4X - Startflotte & Kolonisationslogistik
 *
 * Prüft, dass jede Partie mit Fregatte, Aufklärungsschiff und beladenem
 * Kolonieschiff beginnt, dass Kolonisation ausschließlich aus dem Laderaum
 * finanziert wird (keine Duplizierung) und dass ohne Schiff keine Gründung
 * möglich ist.
 */

import { describe, expect, it } from 'vitest';
import { GameEngine } from '../src/core/GameEngine.ts';
import { EventBus } from '../src/core/EventBus.ts';
import {
  COLONIZATION_SUPPLY,
  checkColonySupply,
} from '../src/core/colonizationRules.ts';
import { getShipDef } from '../src/data/shipCatalog.ts';
import { Planet } from '../src/core/types.ts';

function makeHabitable(planet: Planet, name = 'Testwelt'): Planet {
  planet.name = name;
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
  return planet;
}

function prepareGalaxy(engine: GameEngine, seed: string) {
  engine.generateNewGalaxy({ seed });
  const system = engine.getGalaxy().systems[0];
  engine.selectSystem(system.id);
  engine.surveySystem(system.id);
  const planets = system.planets.filter((planet) => planet.planetType !== 'gas_giant');
  planets.forEach((planet, index) => makeHabitable(planet, `Welt ${index + 1}`));
  return { system, planets };
}

describe('Astraea 4X - Startflotte', () => {
  it('1. Neue Galaxie startet mit Fregatte, Aufklärer und Kolonieschiff – ohne Kolonie', () => {
    const engine = GameEngine.getInstance();
    const { system } = prepareGalaxy(engine, 'STARTFLEET-01');

    const fleets = engine.getFleetManager().getFleetsForCiv(engine.getPlayerCiv().id);
    expect(fleets).toHaveLength(3);
    expect(fleets.every((fleet) => fleet.systemId === system.id)).toBe(true);

    const shipIds = fleets.flatMap((fleet) => fleet.ships.map((stack) => stack.shipDefId)).sort();
    expect(shipIds).toEqual(['colony_ship', 'frigate', 'scout_ship']);

    expect(engine.getColonies().filter((colony) => colony.civId === engine.getPlayerCiv().id)).toHaveLength(0);
    expect(engine.getFleetManager().getOrders()).toHaveLength(0);
  });

  it('2. Nur das Kolonieschiff führt Fracht, und zwar exakt die Gründungsgüter', () => {
    const engine = GameEngine.getInstance();
    prepareGalaxy(engine, 'STARTFLEET-02');

    const fleets = engine.getFleetManager().getFleetsForCiv(engine.getPlayerCiv().id);
    const colonyFleet = fleets.find((fleet) =>
      fleet.ships.some((stack) => stack.shipDefId === 'colony_ship')
    );
    const otherFleets = fleets.filter((fleet) => fleet !== colonyFleet);

    expect(colonyFleet?.cargo).toEqual(COLONIZATION_SUPPLY);
    expect(otherFleets.every((fleet) => fleet.cargo === undefined)).toBe(true);
  });

  it('3. Schiffsdefinitionen der Startflotte sind bekannt und unterscheidbar', () => {
    expect(getShipDef('frigate')?.name).toBe('Kleine Fregatte');
    expect(getShipDef('scout_ship')?.name).toBe('Aufklärungsschiff');
    expect(getShipDef('colony_ship')?.name).toBe('Kolonieschiff');

    const classes = ['frigate', 'scout_ship', 'colony_ship'].map(
      (id) => getShipDef(id)?.shipClass
    );
    expect(new Set(classes).size).toBe(3);
  });

  it('4. Laderaum-Prüfung akzeptiert nur vollständige Fracht', () => {
    expect(checkColonySupply(COLONIZATION_SUPPLY).allowed).toBe(true);
    expect(checkColonySupply(undefined).allowed).toBe(false);
    expect(
      checkColonySupply({ ...COLONIZATION_SUPPLY, minerals: COLONIZATION_SUPPLY.minerals - 1 }).allowed
    ).toBe(false);
    expect(checkColonySupply({ ...COLONIZATION_SUPPLY, colonists: 0 }).allowed).toBe(false);
  });
});

describe('Astraea 4X - Kolonisation aus Schiffsfracht', () => {
  it('5. Ohne Kolonieschiff im System ist keine Gründung möglich', () => {
    const engine = GameEngine.getInstance();
    const { system, planets } = prepareGalaxy(engine, 'COLONY-LOG-05');

    // Startflotte entfernen, kein Ersatzschiff bereitstellen.
    for (const fleet of engine.getFleetManager().getFleetsForCiv(engine.getPlayerCiv().id)) {
      engine.getFleetManager().removeFleet(fleet.id);
    }

    const failed: string[] = [];
    const unsubscribe = EventBus.getInstance().on('colony:failed', (payload) => {
      failed.push(payload.reason);
    });

    const result = engine.foundColony(planets[0].id, 'Ohne-Schiff');
    unsubscribe();

    expect(result.success).toBe(false);
    expect(result.reason).toContain('Kein Kolonieschiff');
    expect(failed.some((reason) => reason.includes('Kein Kolonieschiff'))).toBe(true);
    expect(engine.getColonyByPlanetId(planets[0].id)).toBeNull();
    expect(system.planets?.find((planet) => planet.id === planets[0].id)?.colonyId).toBeNull();
  });

  it('6. Unzureichende Fracht verhindert die Gründung', () => {
    const engine = GameEngine.getInstance();
    const { system, planets } = prepareGalaxy(engine, 'COLONY-LOG-06');

    for (const fleet of engine.getFleetManager().getFleetsForCiv(engine.getPlayerCiv().id)) {
      engine.getFleetManager().removeFleet(fleet.id);
    }
    engine.provisionColonyShip(system.id, {
      ...COLONIZATION_SUPPLY,
      minerals: COLONIZATION_SUPPLY.minerals - 10,
    });

    const result = engine.foundColony(planets[0].id, 'Zu-wenig-Fracht');
    expect(result.success).toBe(false);
    expect(result.reason).toContain('Laderaum unzureichend');
    expect(engine.getColonyByPlanetId(planets[0].id)).toBeNull();
  });

  it('7. Gründung verbraucht Schiff und Fracht genau einmal (keine Duplizierung)', () => {
    const engine = GameEngine.getInstance();
    const { system, planets } = prepareGalaxy(engine, 'COLONY-LOG-07');

    const colonyShip = engine.getColonyShipForSystem(system.id);
    expect(colonyShip).not.toBeNull();
    const cargo = { ...colonyShip!.cargo! };

    const result = engine.foundColony(planets[0].id, 'Fracht-Prime');
    expect(result.success).toBe(true);
    const colony = result.colony!;

    // Bevölkerung stammt aus dem Laderaum.
    expect(colony.population).toBe(cargo.colonists);
    // Vorräte = Fracht + genau ein Wirtschaftsturn der Gründung.
    expect(colony.stockpile.minerals).toBe(cargo.minerals + colony.netYields.minerals);
    expect(colony.stockpile.rareResources).toBe(
      cargo.rareResources + colony.netYields.rareResources
    );
    expect(colony.stockpile.influence).toBe(cargo.influence + colony.netYields.influence);

    // Das Schiff ist verbraucht und führt keine Fracht mehr.
    expect(engine.getColonyShipForSystem(system.id)).toBeNull();
    expect(engine.getFleetManager().getFleet(colonyShip!.id)).toBeNull();
  });

  it('8. Kolonistenanzahl folgt der Fracht, nicht einem festen Startwert', () => {
    const engine = GameEngine.getInstance();
    const { system, planets } = prepareGalaxy(engine, 'COLONY-LOG-08');

    for (const fleet of engine.getFleetManager().getFleetsForCiv(engine.getPlayerCiv().id)) {
      engine.getFleetManager().removeFleet(fleet.id);
    }
    engine.provisionColonyShip(system.id, { ...COLONIZATION_SUPPLY, colonists: 2500 });

    const result = engine.foundColony(planets[0].id, 'Große-Fracht');
    expect(result.success).toBe(true);
    expect(result.colony!.population).toBe(2500);
  });

  it('9. Keine doppelte Gründung auf demselben Planeten', () => {
    const engine = GameEngine.getInstance();
    const { system, planets } = prepareGalaxy(engine, 'COLONY-LOG-09');

    const first = engine.foundColony(planets[0].id, 'Erstgründung');
    expect(first.success).toBe(true);

    engine.provisionColonyShip(system.id);
    const second = engine.foundColony(planets[0].id, 'Doppelgründung');
    expect(second.success).toBe(false);
    expect(second.reason).toContain('bereits');

    const colonies = engine.getColonies().filter((colony) => colony.planetId === planets[0].id);
    expect(colonies).toHaveLength(1);
  });

  it('10. Save/Load erhält Startflotte, Fracht und Kolonien', () => {
    const engine = GameEngine.getInstance();
    const { system } = prepareGalaxy(engine, 'COLONY-LOG-10');

    const fitness = engine.getFleetManager().getFleetsForCiv(engine.getPlayerCiv().id);
    const cargoBefore = fitness.find((fleet) => fleet.cargo)?.cargo;

    const payload = JSON.parse(JSON.stringify(engine.createSavePayload('Frachtstand')));
    expect(engine.restoreFromSaveData(payload)).toBe(true);

    const fleetsAfter = engine.getFleetManager().getFleetsForCiv(engine.getPlayerCiv().id);
    expect(fleetsAfter).toHaveLength(fitness.length);
    expect(fleetsAfter.every((fleet) => fleet.systemId === system.id)).toBe(true);
    expect(fleetsAfter.find((fleet) => fleet.cargo)?.cargo).toEqual(cargoBefore);

    // Nach dem Laden ist die Fracht unverändert nutzbar.
    const ship = engine.getColonyShipForSystem(system.id);
    expect(ship).not.toBeNull();
    expect(ship!.cargo).toEqual(COLONIZATION_SUPPLY);
  });
});
