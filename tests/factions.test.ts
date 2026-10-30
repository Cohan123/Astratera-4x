/**
 * Astraea 4X - Fraktionskatalog und deterministische Gegnerauswahl
 *
 * Prüft die acht menschlichen Fraktionen, ihre stabilen IDs, die vollständige
 * visuelle Identität und die deterministische, doppelungsfreie Zuweisung von
 * Spieler und KI-Gegnern aus dem Seed.
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AI_FACTION_COUNT,
  DEFAULT_PLAYER_FACTION_ID,
  FLEET_STYLES,
  HUMAN_FACTIONS,
  HUMAN_FACTION_IDS,
  MAX_AI_FACTIONS,
  MIN_AI_FACTIONS,
  buildFactionAssignments,
  clampAiFactionCount,
  getFleetStyle,
  getHumanFaction,
  isHumanFactionId,
  pickAiFactionIds,
} from '../src/data/factionCatalog.ts';
import { resolveFactionSetup } from '../src/generation/startPlacement.ts';

describe('Astraea 4X - Menschliche Fraktionen', () => {
  it('1. Acht Fraktionen mit stabilen, eindeutigen IDs und vollständiger Identität', () => {
    expect(HUMAN_FACTIONS).toHaveLength(8);
    expect(new Set(HUMAN_FACTION_IDS).size).toBe(8);

    for (const faction of HUMAN_FACTIONS) {
      expect(faction.id).toBe(faction.id.toLowerCase());
      expect(faction.name.length).toBeGreaterThan(0);
      expect(faction.description.length).toBeGreaterThan(0);
      expect(faction.history.length).toBeGreaterThan(0);
      expect(faction.visualIdentity.length).toBeGreaterThan(0);
      expect(faction.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(faction.borderColor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(faction.emblem.length).toBeGreaterThan(0);
      expect(getFleetStyle(faction.fleetStyleId)).not.toBeNull();
      expect(isHumanFactionId(faction.id)).toBe(true);
      expect(getHumanFaction(faction.id)?.id).toBe(faction.id);
    }
  });

  it('2. Jeder Flottenstil ist genau einer Fraktion zugeordnet', () => {
    const usedStyles = HUMAN_FACTIONS.map((faction) => faction.fleetStyleId);
    expect(new Set(usedStyles).size).toBe(usedStyles.length);
    for (const styleId of usedStyles) {
      expect(FLEET_STYLES[styleId]).toBeDefined();
      expect(FLEET_STYLES[styleId].label.length).toBeGreaterThan(0);
    }
  });

  it('3. KI-Auswahl ist deterministisch und schließt die Spielerfraktion aus', () => {
    const first = pickAiFactionIds('ASTRAEA-77', 'hesperia', 5);
    const second = pickAiFactionIds('ASTRAEA-77', 'hesperia', 5);
    expect(second).toEqual(first);
    expect(first).toHaveLength(5);
    expect(new Set(first).size).toBe(5);
    expect(first).not.toContain('hesperia');

    const other = pickAiFactionIds('ASTRAEA-78', 'hesperia', 5);
    expect(other).not.toEqual(first);
  });

  it('4. Anzahl wird exakt eingehalten und auf 0–7 begrenzt', () => {
    for (let count = MIN_AI_FACTIONS; count <= MAX_AI_FACTIONS; count += 1) {
      expect(pickAiFactionIds('SEED-X', 'thulea', count)).toHaveLength(count);
    }
    expect(pickAiFactionIds('SEED-X', 'thulea', -3)).toEqual([]);
    expect(pickAiFactionIds('SEED-X', 'thulea', 99)).toHaveLength(MAX_AI_FACTIONS);
    expect(clampAiFactionCount(99)).toBe(MAX_AI_FACTIONS);
    expect(clampAiFactionCount(Number.NaN)).toBe(DEFAULT_AI_FACTION_COUNT);
  });

  it('5. Zuweisung enthält genau eine Spielerrolle ohne Doppelungen', () => {
    const assignments = buildFactionAssignments('ASTRAEA-77', 'fusang', 7);

    expect(assignments).toHaveLength(8);
    const playerAssignments = assignments.filter((entry) => entry.role === 'player');
    expect(playerAssignments).toHaveLength(1);
    expect(playerAssignments[0].civId).toBe('player-empire');
    expect(playerAssignments[0].factionId).toBe('fusang');

    const factions = assignments.map((entry) => entry.factionId);
    expect(new Set(factions).size).toBe(8);
    const civIds = assignments.map((entry) => entry.civId);
    expect(new Set(civIds).size).toBe(8);
  });

  it('6. Standardwerte und unbekannte Konfiguration werden sicher normalisiert', () => {
    const defaults = resolveFactionSetup({ seed: 'ASTRAEA-77' });
    expect(defaults.playerFactionId).toBe(DEFAULT_PLAYER_FACTION_ID);
    expect(defaults.aiFactionCount).toBe(DEFAULT_AI_FACTION_COUNT);

    const invalid = resolveFactionSetup({
      seed: 'ASTRAEA-77',
      playerFactionId: 'unbekannt',
      aiFactionCount: 42,
    });
    expect(invalid.playerFactionId).toBe(DEFAULT_PLAYER_FACTION_ID);
    expect(invalid.aiFactionCount).toBe(MAX_AI_FACTIONS);
  });
});
