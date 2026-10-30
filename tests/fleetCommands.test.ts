/**
 * Astraea 4X - Flottenbefehle, Routenvorschau und Antriebsreichweite
 *
 * Deckt Zielprüfung, Zieländerung, Abbruch sowie die zentrale, aus vorhandenen
 * Technologien abgeleitete Reichweite ab. Der Standard bleibt ein Hyperlane-
 * Sprung pro Runde, damit bestehende Spielstände unverändert funktionieren.
 */

import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../src/core/EventBus.ts';
import { FleetManager } from '../src/core/fleetManager.ts';
import {
  BASE_PROPULSION_RANGE,
  PROPULSION_TIERS,
  getPropulsionLabel,
  getPropulsionRange,
  normalizeRangeHops,
  turnsForHops,
} from '../src/core/propulsion.ts';
import type { Fleet, Galaxy, StarSystem } from '../src/core/types.ts';

function makeGalaxy(links: Record<string, string[]>): Galaxy {
  const systems = Object.keys(links).map(
    (id) =>
      ({
        id,
        name: id,
        x: 0,
        y: 0,
        hyperlanes: links[id],
        planets: [],
        planetCount: 0,
        discoveryStatus: 'discovered',
        ownerFactionId: null,
        anomalyDetected: false,
      }) as unknown as StarSystem,
  );
  return {
    id: 'galaxy-fleet-commands',
    name: 'Testgalaxie',
    seed: 'seed',
    createdAt: 0,
    config: { size: 'small', systemCount: systems.length, width: 100, height: 100 },
    systems,
  } as Galaxy;
}

// sys-01 -> sys-02 -> sys-03 -> sys-04, plus a side branch to sys-05.
const GALAXY = makeGalaxy({
  'sys-01': ['sys-02'],
  'sys-02': ['sys-03'],
  'sys-03': ['sys-04'],
  'sys-04': [],
  'sys-05': ['sys-02'],
});

function makeManager(): FleetManager {
  return new FleetManager(EventBus.getInstance(), () => GALAXY);
}

function makeFleet(overrides: Partial<Fleet> = {}): Fleet {
  return {
    id: 'fleet-1',
    name: 'Aurora',
    civId: 'player-empire',
    systemId: 'sys-01',
    ships: [{ shipDefId: 'corvette', count: 2 }],
    status: 'stationed',
    pathSystemIds: ['sys-01'],
    pathIndex: 0,
    destinationSystemId: null,
    ...overrides,
  } as Fleet;
}

describe('Astraea 4X - Flottenbefehle', () => {
  it('1. Routenvorschau und Zielprüfung verändern den Verband nicht', () => {
    const manager = makeManager();
    manager.addFleet(makeFleet());

    expect(manager.previewRoute('fleet-1', 'sys-03')).toEqual(['sys-01', 'sys-02', 'sys-03']);
    expect(manager.canReachSystem('fleet-1', 'sys-03')).toMatchObject({
      allowed: true,
      pathSystemIds: ['sys-01', 'sys-02', 'sys-03'],
    });
    expect(manager.getFleet('fleet-1')?.status).toBe('stationed');
    expect(manager.getFleet('fleet-1')?.destinationSystemId).toBeNull();

    expect(manager.canReachSystem('fleet-1', 'sys-01').allowed).toBe(false);
    expect(manager.canReachSystem('fleet-1', 'unbekannt').allowed).toBe(false);
    expect(manager.previewRoute('missing', 'sys-03')).toBeNull();
  });

  it('2. Zieländerung während des Flugs berechnet die Route neu', () => {
    const manager = makeManager();
    manager.addFleet(makeFleet());

    expect(manager.commandMoveFleet('fleet-1', 'sys-04').allowed).toBe(true);
    manager.advanceTurn([]);
    expect(manager.getFleet('fleet-1')?.systemId).toBe('sys-02');

    const retarget = manager.retargetFleet('fleet-1', 'sys-03');
    expect(retarget.allowed).toBe(true);
    expect(retarget.pathSystemIds).toEqual(['sys-02', 'sys-03']);
    expect(manager.getFleet('fleet-1')?.destinationSystemId).toBe('sys-03');
  });

  it('3. Abbruch stoppt die Bewegung und lässt das Schiff im System', () => {
    const manager = makeManager();
    manager.addFleet(makeFleet());
    manager.commandMoveFleet('fleet-1', 'sys-04');

    const cancelled: string[] = [];
    EventBus.getInstance().on('fleet:movement-cancelled', ({ fleetId }) => cancelled.push(fleetId));

    expect(manager.cancelFleetMovement('fleet-1')).toBe(true);
    expect(manager.getFleet('fleet-1')).toMatchObject({
      status: 'stationed',
      systemId: 'sys-01',
      destinationSystemId: null,
      pathSystemIds: [],
    });
    expect(cancelled).toEqual(['fleet-1']);
    expect(manager.cancelFleetMovement('fleet-1')).toBe(false);
  });

  it('4. Reichweite erhöht die Sprünge pro Runde, Standard bleibt ein Sprung', () => {
    const eventBus = EventBus.getInstance();
    vi.restoreAllMocks();

    const standard = makeManager();
    standard.addFleet(makeFleet());
    standard.commandMoveFleet('fleet-1', 'sys-04');
    standard.advanceTurn([]);
    expect(standard.getFleet('fleet-1')?.systemId).toBe('sys-02');

    const advanced = new FleetManager(eventBus, () => GALAXY);
    advanced.addFleet(makeFleet());
    advanced.commandMoveFleet('fleet-1', 'sys-04');
    advanced.advanceTurn([], 2, null, () => 3);
    expect(advanced.getFleet('fleet-1')?.systemId).toBe('sys-04');
    expect(advanced.getFleet('fleet-1')?.status).toBe('stationed');
  });
});

describe('Astraea 4X - Ankunftsprognose und Zwischenziele', () => {
  it('6. ETA eines stationierten Verbands ist null Runden auf das eigene System', () => {
    const manager = makeManager();
    manager.addFleet(makeFleet());

    expect(manager.getFleetEta('fleet-1')).toEqual({
      turnsRemaining: 0,
      hopsRemaining: 0,
      hopsPerTurn: 1,
      nextSystemId: null,
      arrivalSystemId: 'sys-01',
    });
    expect(manager.getFleetEta('unbekannt')).toBeNull();
  });

  it('7. ETA einer laufenden Route schrumpft mit jedem Zug', () => {
    const manager = makeManager();
    manager.addFleet(makeFleet());
    manager.commandMoveFleet('fleet-1', 'sys-04');

    // Drei Sprünge bei einem Sprung pro Runde.
    expect(manager.getFleetEta('fleet-1')).toMatchObject({
      turnsRemaining: 3,
      hopsRemaining: 3,
      hopsPerTurn: 1,
      nextSystemId: 'sys-02',
      arrivalSystemId: 'sys-04',
    });

    manager.advanceTurn([]);
    expect(manager.getFleetEta('fleet-1')).toMatchObject({
      turnsRemaining: 2,
      hopsRemaining: 2,
      nextSystemId: 'sys-03',
    });

    // Nach der Ankunft ist die ETA wieder null Runden.
    manager.advanceTurn([]);
    manager.advanceTurn([]);
    expect(manager.getFleetEta('fleet-1')).toMatchObject({
      turnsRemaining: 0,
      hopsRemaining: 0,
      arrivalSystemId: 'sys-04',
    });
  });

  it('8. ETA rechnet mit der Reichweite des Reiches auf', () => {
    const manager = makeManager();
    manager.addFleet(makeFleet());
    manager.commandMoveFleet('fleet-1', 'sys-04');

    // Drei Sprünge bei zwei Sprüngen pro Runde ergeben zwei Runden.
    expect(manager.getFleetEta('fleet-1', 2)).toMatchObject({
      turnsRemaining: 2,
      hopsRemaining: 3,
      hopsPerTurn: 2,
    });
    manager.advanceTurn([], 2, null, () => 2);
    expect(manager.getFleetEta('fleet-1', 2)).toMatchObject({
      turnsRemaining: 1,
      hopsRemaining: 1,
      hopsPerTurn: 2,
    });
  });

  it('9. ETA-Vorschau für ein noch nicht erteiltes Ziel', () => {
    const manager = makeManager();
    manager.addFleet(makeFleet());

    expect(manager.getEtaToSystem('fleet-1', 'sys-04')).toMatchObject({
      turnsRemaining: 3,
      hopsRemaining: 3,
      nextSystemId: 'sys-02',
      arrivalSystemId: 'sys-04',
    });
    // Der Verband bleibt dabei stationiert.
    expect(manager.getFleet('fleet-1')?.status).toBe('stationed');
    expect(manager.getEtaToSystem('fleet-1', 'unbekannt')).toBeNull();
    expect(manager.getEtaToSystem('missing', 'sys-04')).toBeNull();
  });

  it('10. Zwischenziel wird durchflogen, ohne den Auftrag zu beenden', () => {
    const manager = makeManager();
    manager.addFleet(makeFleet());

    const plan = manager.commandMoveFleet('fleet-1', 'sys-04', ['sys-05']);
    expect(plan.allowed).toBe(true);
    expect(plan.pathSystemIds).toEqual([
      'sys-01',
      'sys-02',
      'sys-05',
      'sys-02',
      'sys-03',
      'sys-04',
    ]);
    expect(manager.getFleetEta('fleet-1')).toMatchObject({
      turnsRemaining: 5,
      hopsRemaining: 5,
      arrivalSystemId: 'sys-04',
    });

    // Am Zwischenziel wird nicht angehalten.
    manager.advanceTurn([]);
    manager.advanceTurn([]);
    expect(manager.getFleet('fleet-1')).toMatchObject({
      systemId: 'sys-05',
      status: 'moving',
      destinationSystemId: 'sys-04',
    });

    manager.advanceTurn([]);
    manager.advanceTurn([]);
    manager.advanceTurn([]);
    expect(manager.getFleet('fleet-1')).toMatchObject({
      systemId: 'sys-04',
      status: 'stationed',
      destinationSystemId: null,
    });
  });

  it('11. Unbekannte oder unerreichbare Zwischenziele werden abgelehnt', () => {
    const manager = makeManager();
    manager.addFleet(makeFleet());
    // sys-99 existiert nicht, sys-01 ist der eigene Standort.
    const unknown = manager.commandMoveFleet('fleet-1', 'sys-04', ['sys-99']);
    expect(unknown.allowed).toBe(false);
    expect(unknown.reason).toContain('Zwischenziel');

    const isolated = makeGalaxy({
      'sys-01': ['sys-02'],
      'sys-02': [],
      'sys-03': [],
    });
    const isolatedManager = new FleetManager(EventBus.getInstance(), () => isolated);
    isolatedManager.addFleet(makeFleet());
    const blocked = isolatedManager.commandMoveFleet('fleet-1', 'sys-02', ['sys-03']);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toContain('Zwischenziel');
    expect(isolatedManager.getFleet('fleet-1')?.status).toBe('stationed');
  });

  it('12. Bewegungen werden in stabiler Reihenfolge nach ID aufgelöst', () => {
    const manager = makeManager();
    manager.addFleet(
      makeFleet({ id: 'fleet-b', systemId: 'sys-02', pathSystemIds: ['sys-02'] }),
    );
    manager.addFleet(makeFleet({ id: 'fleet-a', systemId: 'sys-01', pathSystemIds: ['sys-01'] }));

    expect(manager.commandMoveFleet('fleet-b', 'sys-03').allowed).toBe(true);
    expect(manager.commandMoveFleet('fleet-a', 'sys-03').allowed).toBe(true);

    const summary = manager.advanceTurn([]);
    expect(summary.movedFleetIds).toEqual(['fleet-a', 'fleet-b']);
    expect(summary.hopsTraveled).toBe(2);
    expect(manager.getFleet('fleet-b')?.status).toBe('stationed');
    expect(manager.getFleet('fleet-a')?.systemId).toBe('sys-02');
  });
});

describe('Astraea 4X - Antriebsstufen', () => {
  it('5. Basisreichweite ohne Technologie und Stufen aus vorhandenen Tech-IDs', () => {
    expect(getPropulsionRange([])).toBe(BASE_PROPULSION_RANGE);
    expect(getPropulsionLabel([])).toBe('Standardantrieb');

    for (const tier of PROPULSION_TIERS) {
      expect(getPropulsionRange([tier.techId])).toBe(tier.rangeHops);
      expect(getPropulsionLabel([tier.techId])).toBe(tier.label);
    }

    expect(getPropulsionRange(['fusion_reactors', 'zero_point_physics'])).toBe(4);
    expect(getPropulsionLabel(['fusion_reactors', 'zero_point_physics'])).toBe(
      'Nullpunkt-Antrieb',
    );
    // Unbekannte Technologien verändern die Reichweite nicht.
    expect(getPropulsionRange(['unbekannte_tech'])).toBe(BASE_PROPULSION_RANGE);
  });

  it('13. Reichweite und Rundenzahl werden auf ganze Sprünge normalisiert', () => {
    expect(normalizeRangeHops(undefined)).toBe(BASE_PROPULSION_RANGE);
    expect(normalizeRangeHops(0)).toBe(BASE_PROPULSION_RANGE);
    expect(normalizeRangeHops(-3)).toBe(BASE_PROPULSION_RANGE);
    expect(normalizeRangeHops(Number.NaN)).toBe(BASE_PROPULSION_RANGE);
    expect(normalizeRangeHops(2.9)).toBe(2);

    expect(turnsForHops(0, 1)).toBe(0);
    expect(turnsForHops(3, 1)).toBe(3);
    expect(turnsForHops(3, 2)).toBe(2);
    expect(turnsForHops(4, 2)).toBe(2);
    expect(turnsForHops(5, 3)).toBe(2);
  });
});
