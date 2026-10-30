/**
 * Astraea 4X - Spielstand-Vollständigkeit
 *
 * Prüft, dass ein Spielstand Galaxie (ohne Neugenerierung), Kolonien mit
 * Steuerfeldern, Flotten samt Bewegungsroute und Fracht sowie interstellare
 * Handelsrouten unverändert wiederherstellt. Routen müssen nach dem Laden
 * sichtbar bleiben, aktualisierbar und entfernbar sein.
 */

import { describe, expect, it } from 'vitest';
import { GameEngine } from '../src/core/GameEngine.ts';
import { GALACTIC_TRADE_TECH_ID } from '../src/core/galacticTradeManager.ts';
import { COLONIZATION_SUPPLY } from '../src/core/colonizationRules.ts';
import { Planet, StarSystem } from '../src/core/types.ts';

function makeHabitable(planet: Planet): Planet {
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

function prepareSystem(engine: GameEngine, system: StarSystem): Planet {
  engine.selectSystem(system.id);
  engine.surveySystem(system.id);
  const planet = system.planets.find((candidate) => candidate.planetType !== 'gas_giant') ?? system.planets[0];
  makeHabitable(planet);
  return planet;
}

function snapshot(engine: GameEngine) {
  return JSON.parse(JSON.stringify(engine.createSavePayload('Integrationstest')));
}

describe('Astraea 4X - Spielstand-Vollständigkeit', () => {
  it('1. Galaxie wird beim Laden nicht neu generiert', () => {
    const engine = GameEngine.getInstance();
    const galaxy = engine.generateNewGalaxy({ seed: 'SAVELOAD-01' });
    const systemIds = galaxy.systems.map((system) => system.id);
    const planetIds = galaxy.systems[0].planets.map((planet) => planet.id);
    const seed = galaxy.seed;
    const config = { ...galaxy.config };

    const payload = snapshot(engine);
    // Spielstand bewusst verändern: Beim Laden darf nur der Spielstand gelten.
    engine.generateNewGalaxy({ seed: 'ANDERE-GALAXIE' });
    expect(engine.getGalaxy().seed).not.toBe(seed);

    expect(engine.restoreFromSaveData(payload)).toBe(true);
    const restored = engine.getGalaxy();
    expect(restored.seed).toBe(seed);
    expect(restored.config).toEqual(config);
    expect(restored.systems.map((system) => system.id)).toEqual(systemIds);
    expect(restored.systems[0].planets.map((planet) => planet.id)).toEqual(planetIds);
  });

  it('2. Steuerfelder, Flottenroute und Fracht überstehen den Spielstand', () => {
    const engine = GameEngine.getInstance();
    const galaxy = engine.generateNewGalaxy({ seed: 'SAVELOAD-02' });
    const home = galaxy.systems[0];
    const neighbour = galaxy.systems.find((system) => home.hyperlanes.includes(system.id))!;
    expect(neighbour).toBeDefined();

    prepareSystem(engine, home);
    prepareSystem(engine, neighbour);

    engine.selectSystem(home.id);
    const colonyPlanet = prepareSystem(engine, home);
    const founded = engine.foundColony(colonyPlanet.id, 'Save-Prime');
    expect(founded.success).toBe(true);
    engine.setColonyTaxRate(founded.colony!.id, 47);

    // Zusätzliches Kolonieschiff mit abweichender Fracht bleibt unverbraucht.
    engine.provisionColonyShip(home.id, { ...COLONIZATION_SUPPLY, colonists: 1500 });

    const frigate = engine
      .getFleetManager()
      .getFleetsForCiv(engine.getPlayerCiv().id)
      .find((fleet) => fleet.ships.some((stack) => stack.shipDefId === 'frigate'))!;
    const move = engine.commandFleetMove(frigate.id, neighbour.id);
    expect(move.allowed).toBe(true);

    const payload = snapshot(engine);
    const expectedTurn = engine.getTurnState().currentTurn;

    expect(engine.restoreFromSaveData(payload)).toBe(true);

    expect(engine.getTurnState().currentTurn).toBe(expectedTurn);
    const colony = engine.getColonies().find((entry) => entry.id === founded.colony!.id)!;
    expect(colony.taxRate).toBe(47);
    expect(colony.approval).toBeDefined();
    expect(colony.taxRevenue).toBeGreaterThan(0);

    const restoredFleet = engine.getFleetManager().getFleet(frigate.id)!;
    expect(restoredFleet.status).toBe('moving');
    expect(restoredFleet.destinationSystemId).toBe(neighbour.id);
    expect(restoredFleet.pathSystemIds[0]).toBe(home.id);
    expect(restoredFleet.pathSystemIds[restoredFleet.pathSystemIds.length - 1]).toBe(neighbour.id);

    const cargoFleet = engine
      .getFleetManager()
      .getFleetsForCiv(engine.getPlayerCiv().id)
      .find((fleet) => fleet.cargo && fleet.cargo.colonists === 1500);
    expect(cargoFleet).toBeDefined();
    expect(cargoFleet!.cargo).toEqual({ ...COLONIZATION_SUPPLY, colonists: 1500 });
  });

  it('3. Handelsrouten bleiben nach dem Laden erhalten, änderbar und entfernbar', () => {
    const engine = GameEngine.getInstance();
    const galaxy = engine.generateNewGalaxy({ seed: 'SAVELOAD-03' });
    const home = galaxy.systems[0];
    const neighbour = galaxy.systems.find((system) => home.hyperlanes.includes(system.id))!;

    const homePlanet = prepareSystem(engine, home);
    engine.selectSystem(home.id);
    engine.provisionColonyShip(home.id);
    const first = engine.foundColony(homePlanet.id, 'Routen-Prime');
    expect(first.success).toBe(true);

    const neighbourPlanet = prepareSystem(engine, neighbour);
    engine.selectSystem(neighbour.id);
    engine.provisionColonyShip(neighbour.id);
    const second = engine.foundColony(neighbourPlanet.id, 'Routen-Sekundär');
    expect(second.success).toBe(true);

    engine.getPlayerCiv().researchState.completedTechIds.push(GALACTIC_TRADE_TECH_ID);
    const created = engine.createGalacticTradeRoute(
      first.colony!.id,
      second.colony!.id,
      'food',
      2
    );
    expect(created.allowed).toBe(true);
    const route = created.route!;
    expect(route.pathSystemIds.length).toBeGreaterThanOrEqual(2);

    const payload = snapshot(engine);
    expect(engine.restoreFromSaveData(payload)).toBe(true);

    const restoredRoute = engine.getGalacticTradeManager().getRoute(route.id)!;
    expect(restoredRoute).toBeDefined();
    expect(restoredRoute.pathSystemIds).toEqual(route.pathSystemIds);
    expect(restoredRoute.isActive).toBe(true);

    // Aktualisieren: Tarif setzen und Route deaktivieren.
    const tariff = engine.setGalacticTradeTariff(route.id, 12);
    expect(tariff.allowed).toBe(true);
    engine.setGalacticTradeRouteActive(route.id, false);
    expect(engine.getGalacticTradeManager().getRoute(route.id)?.isActive).toBe(false);

    // Entfernen und erneut laden: Route bleibt entfernt.
    engine.removeGalacticTradeRoute(route.id);
    expect(engine.getGalacticTradeManager().getRoute(route.id)).toBeNull();

    const afterRemoval = snapshot(engine);
    expect(engine.restoreFromSaveData(afterRemoval)).toBe(true);
    expect(engine.getGalacticTradeManager().getRoute(route.id)).toBeNull();
  });
});
