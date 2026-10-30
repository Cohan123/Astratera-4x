/**
 * Astraea 4X - KI-Praesenz-Tests (Stage B)
 * Deckt die deterministische Vergabe von Heimsystemen an KI-Zivilisationen,
 * die initialen KI-Heimatkolonien sowie die Spieler-Heimatsystem-Zuordnung ab.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { EconomyEngine } from '../src/core/economyEngine.ts';
import { EventBus } from '../src/core/EventBus.ts';
import { GameEngine } from '../src/core/GameEngine.ts';
import { GalaxyConfig } from '../src/core/types.ts';

const AI_TEST_CONFIG: GalaxyConfig = {
  size: 'medium',
  systemCount: 40,
  width: 900,
  height: 900,
  minDistance: 45,
  shape: 'spiral',
  seed: 'AI-PRESENCE-SEED',
};

describe('Astraea 4X - KI-Praesenz (Stage B)', () => {
  beforeEach(() => {
    EventBus.getInstance().clear();
  });

  it('1. ordnet das Spieler-Heimatsystem der Spielerzivilisation zu', () => {
    const engine = GameEngine.getInstance();
    const galaxy = engine.generateNewGalaxy(AI_TEST_CONFIG);
    const playerCiv = engine.getPlayerCiv();

    const legacyOwners = galaxy.systems.filter(
      (system) => system.ownerFactionId === 'faction-player-home',
    );
    expect(legacyOwners).toHaveLength(0);

    const playerSystems = galaxy.systems.filter(
      (system) => system.ownerFactionId === playerCiv.id,
    );
    expect(playerSystems).toHaveLength(1);
    expect(galaxy.systems[0].ownerFactionId).toBe(playerCiv.id);
    expect(galaxy.systems[0].discoveryStatus).not.toBe('unexplored');
  });

  it('2. gibt jeder KI-Zivilisation ein eigenes Heimatsystem mit Heimatkolonie', () => {
    const engine = GameEngine.getInstance();
    const galaxy = engine.generateNewGalaxy(AI_TEST_CONFIG);
    const aiCivs = engine.getCivManager().getCivilizations().filter((civ) => !civ.isPlayer);

    expect(aiCivs.length).toBeGreaterThan(0);

    const colonies = engine.getColonies();
    for (const civ of aiCivs) {
      expect(civ.homeSystemId).toBeTruthy();

      const home = galaxy.systems.find((system) => system.id === civ.homeSystemId);
      expect(home).toBeDefined();
      expect(home!.ownerFactionId).toBe(civ.id);
      expect(home!.discoveryStatus).toBe('colonized');

      const homeColonies = colonies.filter((colony) => colony.civId === civ.id);
      expect(homeColonies).toHaveLength(1);

      const colony = homeColonies[0];
      expect(colony.systemId).toBe(home!.id);
      expect(colony.developmentTier).toBe('colony');
      expect(colony.population).toBe(3000);
      expect(colony.growthFoodRequired).toBe(EconomyEngine.calculateGrowthRequired(3000));
      expect(colony.name).toBe(`${civ.name} Heimatwelt`);
    }
  });

  it('3. vergibt keine doppelten Besitzansprueche', () => {
    const engine = GameEngine.getInstance();
    const galaxy = engine.generateNewGalaxy(AI_TEST_CONFIG);

    const ownedSystemIds = galaxy.systems
      .filter((system) => system.ownerFactionId !== null)
      .map((system) => system.ownerFactionId as string);

    const civCount = engine.getCivManager().getCivilizations().length;
    expect(ownedSystemIds).toHaveLength(civCount);
    expect(new Set(ownedSystemIds).size).toBe(ownedSystemIds.length);
  });

  it('4. erzeugt beim erneuten Galaxiegenerieren keine doppelten Kolonien', () => {
    const engine = GameEngine.getInstance();
    engine.generateNewGalaxy(AI_TEST_CONFIG);
    const firstCount = engine.getColonies().length;
    const firstCivIds = engine.getColonies().map((colony) => colony.civId).sort();

    engine.generateNewGalaxy(AI_TEST_CONFIG);
    expect(engine.getColonies().length).toBe(firstCount);
    expect(engine.getColonies().map((colony) => colony.civId).sort()).toEqual(firstCivIds);
  });
});
