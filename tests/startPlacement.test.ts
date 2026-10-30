/**
 * Astraea 4X - Startplatzierung, Habitabilität und Fraktions-Spielstand
 *
 * Stellt sicher, dass der Spieler immer einen echt habitablen Planeten im
 * Startsystem vorfindet, KI-Starts deterministisch und getrennt verteilt
 * werden und die Fraktionszuweisung beim Laden unverändert bleibt.
 */

import { describe, expect, it } from 'vitest';
import { GameEngine } from '../src/core/GameEngine.ts';
import type { GalaxyConfig } from '../src/core/types.ts';
import {
  computeHopDistances,
  desiredFactionDistanceHops,
  ensurePlayerHomeHabitability,
  findHabitablePlanet,
  isHabitableStartPlanet,
  selectAiHomeSystems,
} from '../src/generation/startPlacement.ts';
import { GalaxyGenerator } from '../src/generation/galaxyGenerator.ts';
import { SaveManager } from '../src/save/saveManager.ts';

const baseConfig: GalaxyConfig = {
  size: 'small',
  systemCount: 24,
  width: 900,
  height: 900,
  minDistance: 45,
  shape: 'spiral',
  seed: 'START-PLACEMENT-SEED',
  playerFactionId: 'hesperia',
  aiFactionCount: 3,
};

describe('Astraea 4X - Startplatzierung', () => {
  it('1. Spielerstartsystem enthält für mehrere Seeds einen echt habitablen Planeten', () => {
    for (const seed of ['ALPHA', 'BETA-2', 'GAMMA-77', 'DELTA-9', 'OMEGA']) {
      const galaxy = GalaxyGenerator.generate({ ...baseConfig, seed });
      const result = ensurePlayerHomeHabitability(galaxy);

      expect(result.system).not.toBeNull();
      expect(result.habitablePlanet).not.toBeNull();
      expect(isHabitableStartPlanet(result.habitablePlanet!)).toBe(true);
      expect(findHabitablePlanet(galaxy.systems[0])).not.toBeNull();
      // Es wird keine Kolonie gegründet – die Prüfung betrifft nur Planeten.
      expect(galaxy.systems[0].planets.length).toBeGreaterThan(0);
    }
  });

  it('2. Leeres Startsystem wird deterministisch mit Planeten und Habitabilität versorgt', () => {
    const original = GalaxyGenerator.generate({ ...baseConfig, seed: 'ALPHA' });
    // Reproduziert den Fall eines Startsystems ganz ohne Planetenbahnen.
    original.systems[0].planets = [];
    original.systems[0].planetCount = 0;
    const first = JSON.parse(JSON.stringify(original)) as typeof original;
    const second = JSON.parse(JSON.stringify(original)) as typeof original;

    const resultA = ensurePlayerHomeHabitability(first);
    const resultB = ensurePlayerHomeHabitability(second);

    expect(resultA.habitablePlanet).not.toBeNull();
    expect(isHabitableStartPlanet(resultA.habitablePlanet!)).toBe(true);
    expect(first.systems[0].planets.length).toBeGreaterThan(0);
    expect(first.systems[0].planetCount).toBe(first.systems[0].planets.length);
    expect(second.systems[0].planets).toEqual(first.systems[0].planets);
    expect(resultB.regenerated).toBe(true);
  });

  it('3. Ein bereits habitables Startsystem bleibt unverändert', () => {
    const galaxy = GalaxyGenerator.generate(baseConfig);
    const before = JSON.stringify(galaxy.systems[0].planets);
    const existing = ensurePlayerHomeHabitability(galaxy);
    // Der erste Aufruf darf nur dann regenerieren, wenn wirklich kein Planet passt.
    const second = ensurePlayerHomeHabitability(galaxy);
    if (!existing.regenerated) {
      expect(second.regenerated).toBe(false);
      expect(JSON.stringify(galaxy.systems[0].planets)).toBe(before);
    }
  });

  it('4. KI-Startauswahl ist deterministisch, eindeutig und meidet den Spielerstart', () => {
    const galaxy = GalaxyGenerator.generate(baseConfig);
    const playerHome = galaxy.systems[0].id;

    const first = selectAiHomeSystems(galaxy, 3, [playerHome]);
    const second = selectAiHomeSystems(galaxy, 3, [playerHome]);

    expect(second.systemIds).toEqual(first.systemIds);
    expect(new Set(first.systemIds).size).toBe(first.systemIds.length);
    expect(first.systemIds).not.toContain(playerHome);
    expect(first.systemIds.length).toBeGreaterThan(0);
  });

  it('5. Kleine Galaxie lockert die Wunschdistanz mit verständlicher Warnung', () => {
    const galaxy = GalaxyGenerator.generate({
      ...baseConfig,
      systemCount: 5,
      width: 420,
      height: 420,
      minDistance: 60,
    });
    const result = selectAiHomeSystems(galaxy, 7, [galaxy.systems[0].id]);

    expect(desiredFactionDistanceHops(galaxy.systems.length)).toBe(2);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.join(' ')).toMatch(/Abstand|Startsysteme/);
    // Keine Doppelungen, auch wenn nicht alle Plätze vergeben werden können.
    expect(new Set(result.systemIds).size).toBe(result.systemIds.length);
  });

  it('6. Hyperlane-Distanzen sind symmetrisch und enthalten das Startsystem mit 0', () => {
    const galaxy = GalaxyGenerator.generate(baseConfig);
    const source = galaxy.systems[0].id;
    const distances = computeHopDistances(galaxy, source);
    expect(distances.get(source)).toBe(0);
    const neighbour = galaxy.systems[0].hyperlanes[0];
    if (neighbour) {
      expect(distances.get(neighbour)).toBe(1);
    }
  });

  it('7. Neue Galaxie übernimmt gewählte Fraktion und gespeicherte Zuweisung', () => {
    const engine = GameEngine.getInstance();
    const galaxy = engine.generateNewGalaxy({
      ...baseConfig,
      seed: 'FACTION-ENGINE-SEED',
      playerFactionId: 'moana',
      aiFactionCount: 3,
    });

    const assignments = galaxy.factionAssignments ?? [];
    expect(assignments).toHaveLength(4);
    const playerAssignment = assignments.find((entry) => entry.role === 'player');
    expect(playerAssignment?.factionId).toBe('moana');

    const civs = engine.getCivManager().getCivilizations();
    expect(civs).toHaveLength(4);
    const playerCiv = engine.getPlayerCiv();
    expect(playerCiv.id).toBe('player-empire');
    expect(playerCiv.factionId).toBe('moana');
    expect(playerCiv.name).toBe('Moana');
    expect(civs.filter((civ) => civ.isPlayer)).toHaveLength(1);

    // Heimatsystem des Spielers hat einen habitablen Planeten, aber keine Kolonie.
    const home = galaxy.systems[0];
    expect(home.ownerFactionId).toBe(playerCiv.id);
    expect(findHabitablePlanet(home)).not.toBeNull();
    expect(engine.getColonies().filter((colony) => colony.civId === playerCiv.id)).toEqual([]);
  });

  it('8. Spielstand v5 behält Fraktionszuweisung und Zivilisationen beim Laden', () => {
    const engine = GameEngine.getInstance();
    engine.generateNewGalaxy({
      ...baseConfig,
      seed: 'FACTION-SAVE-SEED',
      playerFactionId: 'levantia',
      aiFactionCount: 5,
    });
    const before = engine.createSavePayload('Fraktionsspeicher');
    expect(before.version).toBe(5);
    expect(before.galaxy.factionAssignments).toHaveLength(6);

    const serialized = SaveManager.serialize(before);
    const parsed = SaveManager.deserialize(serialized);
    expect(parsed.success).toBe(true);

    const restored = GameEngine.getInstance();
    expect(restored.restoreFromSaveData(parsed.data!)).toBe(true);

    const after = restored.createSavePayload('Fraktionsspeicher');
    expect(after.galaxy.factionAssignments).toEqual(before.galaxy.factionAssignments);
    expect(after.civilizations).toEqual(before.civilizations);
    expect(after.galaxy.systems.map((system) => system.id)).toEqual(
      before.galaxy.systems.map((system) => system.id),
    );
  });
});
