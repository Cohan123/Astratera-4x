/**
 * Astraea 4X - Entwicklungstufen-Tests
 * Deckt die Progression Außenposten -> Siedlung -> Kolonie ab:
 * Anforderungen, deutsche Fehlermeldungen, Ressourcenverbrauch, Event und
 * Save-Migration.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { ColonyManager, COLONY_TIER_LABELS, COLONY_TIER_REQUIREMENTS } from '../src/core/colonyManager.ts';
import { EventBus } from '../src/core/EventBus.ts';
import { Planet, StarSystem } from '../src/core/types.ts';
import { SurfaceGenerator } from '../src/surface/surfaceGenerator.ts';

function createMockPlanet(id: string = 'tier-planet-01'): Planet {
  return {
    id,
    name: 'Tertia',
    systemId: 'tier-sys-01',
    orbitIndex: 1,
    orbitDistanceAu: 0.9,
    orbitalPeriodDays: 300,
    currentAngleRad: 0,
    planetType: 'ocean',
    sizeClass: 14,
    surfaceTemperatureK: 288,
    temperatureCategory: 'temperate',
    atmosphere: 'breathable',
    waterAvailability: 'liquid_ocean',
    gravityG: 0.95,
    gravityCategory: 'standard',
    radiationHazard: 'negligible',
    geologicalStability: 'stable',
    habitability: 80,
    habitabilityTier: 'ideal',
    surveyStatus: 'analyzed',
    colonizationStatus: 'uncolonized',
    colonyId: null,
    color: '#22c55e',
    accentColor: '#15803d',
    texturePattern: 'oceans',
    moonsCount: 1,
  };
}

function createMockSystem(id: string = 'tier-sys-01'): StarSystem {
  return {
    id,
    name: 'Tertia System',
    x: 40,
    y: 40,
    star: {
      id: 'star-tier-01',
      name: 'Tertia',
      spectralClass: 'K',
      color: '#f97316',
      glowColor: '#c2410c',
      temperatureK: 4500,
      luminositySolar: 0.6,
      massSolar: 0.8,
      radiusKm: 600000,
    },
    planetCount: 1,
    planets: [createMockPlanet()],
    discoveryStatus: 'surveyed',
    ownerFactionId: null,
    hyperlanes: [],
    anomalyDetected: false,
  };
}

function foundTestColony(cm: ColonyManager) {
  const planet = createMockPlanet();
  const system = createMockSystem();
  const surface = SurfaceGenerator.generateSurface(planet, 'TIER-SEED-01');
  const result = cm.foundColony(planet, system, surface, 1, '2380.01', 'player-empire', 'Tertia Basis', { q: 4, r: 4 });
  expect(result.success).toBe(true);
  return result.colony!;
}

describe('Entwicklungsstufen der Kolonie', () => {
  let bus: EventBus;
  let cm: ColonyManager;

  beforeEach(() => {
    bus = EventBus.getInstance();
    bus.clear();
    cm = new ColonyManager(bus);
  });

  it('startet als Außenposten und liefert Labels, Folgestufen und Anforderungen', () => {
    const colony = foundTestColony(cm);

    expect(colony.developmentTier).toBe('outpost');
    expect(COLONY_TIER_LABELS[colony.developmentTier]).toBe('Außenposten');
    expect(COLONY_TIER_LABELS.settlement).toBe('Siedlung');
    expect(COLONY_TIER_LABELS.colony).toBe('Kolonie');

    expect(cm.getNextDevelopmentTier('outpost')).toBe('settlement');
    expect(cm.getNextDevelopmentTier('settlement')).toBe('colony');
    expect(cm.getNextDevelopmentTier('colony')).toBeNull();

    expect(cm.getTierRequirement('outpost')).toBeNull();
    expect(cm.getTierRequirement('settlement')).toEqual(COLONY_TIER_REQUIREMENTS.settlement);
    expect(cm.getTierRequirement('colony')).toEqual(COLONY_TIER_REQUIREMENTS.colony);
  });

  it('meldet fehlende Bevölkerung, Mineralien, seltene Ressourcen und Einfluss auf Deutsch', () => {
    const colony = foundTestColony(cm);

    colony.population = 1000;
    let check = cm.canUpgradeDevelopmentTier(colony.id);
    expect(check.success).toBe(false);
    expect(check.reason).toContain('Bevölkerung zu gering');

    colony.population = 2000;
    colony.stockpile.minerals = 59;
    check = cm.canUpgradeDevelopmentTier(colony.id);
    expect(check.success).toBe(false);
    expect(check.reason).toContain('Mineralien reichen nicht');

    colony.stockpile.minerals = 60;
    colony.stockpile.influence = 9;
    check = cm.canUpgradeDevelopmentTier(colony.id);
    expect(check.success).toBe(false);
    expect(check.reason).toContain('Einfluss reicht nicht');

    colony.stockpile.influence = 10;
    check = cm.canUpgradeDevelopmentTier(colony.id);
    expect(check.success).toBe(true);
    expect(check.newTier).toBe('settlement');

    colony.developmentTier = 'settlement';
    colony.population = 3000;
    colony.stockpile.minerals = 150;
    colony.stockpile.rareResources = 24;
    check = cm.canUpgradeDevelopmentTier(colony.id);
    expect(check.success).toBe(false);
    expect(check.reason).toContain('Seltene Ressourcen reichen nicht');
  });

  it('verweigert unbekannte Kolonien und die Stufe nach der Kolonie', () => {
    expect(cm.canUpgradeDevelopmentTier('colony-does-not-exist')).toEqual({
      success: false,
      reason: 'Kolonie nicht gefunden.',
    });

    const colony = foundTestColony(cm);
    colony.developmentTier = 'colony';

    const check = cm.canUpgradeDevelopmentTier(colony.id);
    expect(check.success).toBe(false);
    expect(check.reason).toBe('Maximale Entwicklungsstufe erreicht.');
    expect(check.newTier).toBeUndefined();
  });

  it('zieht Ressourcen ab, erhöht die Stufe und emittiert colony:tierChanged', () => {
    const colony = foundTestColony(cm);
    colony.population = 2000;
    colony.stockpile.minerals = 100;
    colony.stockpile.rareResources = 10;
    colony.stockpile.influence = 20;

    const events: Array<{ colonyId: string; previousTier: string; newTier: string; civId: string }> = [];
    bus.on('colony:tierChanged', (payload) => events.push(payload));

    const result = cm.upgradeDevelopmentTier(colony.id);

    expect(result.success).toBe(true);
    expect(result.previousTier).toBe('outpost');
    expect(result.newTier).toBe('settlement');
    expect(colony.developmentTier).toBe('settlement');
    expect(colony.stockpile.minerals).toBe(40);
    expect(colony.stockpile.rareResources).toBe(10);
    expect(colony.stockpile.influence).toBe(10);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      colonyId: colony.id,
      previousTier: 'outpost',
      newTier: 'settlement',
      civId: 'player-empire',
    });
  });

  it('führt Siedlung zu Kolonie und verbraucht seltene Ressourcen', () => {
    const colony = foundTestColony(cm);
    colony.developmentTier = 'settlement';
    colony.population = 3000;
    colony.stockpile.minerals = 200;
    colony.stockpile.rareResources = 30;
    colony.stockpile.influence = 25;

    const result = cm.upgradeDevelopmentTier(colony.id);

    expect(result.success).toBe(true);
    expect(result.newTier).toBe('colony');
    expect(colony.developmentTier).toBe('colony');
    expect(colony.stockpile.minerals).toBe(50);
    expect(colony.stockpile.rareResources).toBe(5);
    expect(colony.stockpile.influence).toBe(5);

    expect(cm.upgradeDevelopmentTier(colony.id).reason).toBe('Maximale Entwicklungsstufe erreicht.');
  });

  it('migriert alte Spielstände ohne developmentTier und erhält bestehende Stufen', () => {
    const colony = foundTestColony(cm);
    const legacy = JSON.parse(JSON.stringify(colony)) as Record<string, unknown>;
    delete legacy.developmentTier;
    delete legacy.civId;

    const advanced = JSON.parse(JSON.stringify(colony)) as Record<string, unknown>;
    advanced.id = 'colony-legacy-advanced';
    advanced.developmentTier = 'colony';

    cm.loadColonies([legacy, advanced] as never);

    const migrated = cm.getColonyById(colony.id)!;
    expect(migrated.developmentTier).toBe('outpost');
    expect(migrated.civId).toBe('player-empire');
    expect(cm.getColonyById('colony-legacy-advanced')!.developmentTier).toBe('colony');
  });
});
