/**
 * Astraea 4X - Routenplanung auf der Galaxiekarte
 *
 * Prüft die reinen Entscheidungen des Planungsmodus (wer darf planen, was
 * löst ein Systemklick aus), die kameraunabhängige Projektion der roten Route
 * und die Übereinstimmung von Vorschau und tatsächlichem Bewegungsauftrag.
 */

import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/EventBus.ts';
import { FleetManager } from '../src/core/fleetManager.ts';
import type { Fleet, Galaxy, StarSystem } from '../src/core/types.ts';
import {
  canStartRoutePlanning,
  decideGalaxySystemClick,
  routePolylineScreenPoints,
  routePlanningStatusText,
} from '../src/ui/routePlanning.ts';

const LINKS: Record<string, string[]> = {
  'sys-01': ['sys-02'],
  'sys-02': ['sys-01', 'sys-03', 'sys-05'],
  'sys-03': ['sys-02', 'sys-04'],
  'sys-04': ['sys-03'],
  'sys-05': ['sys-02'],
};

function makeGalaxy(links: Record<string, string[]> = LINKS): Galaxy {
  const systems = Object.keys(links).map(
    (id, index) =>
      ({
        id,
        name: id,
        x: index * 100,
        y: index * 50,
        hyperlanes: links[id],
        planets: [],
        planetCount: 0,
        discoveryStatus: 'discovered',
        ownerFactionId: null,
        anomalyDetected: false,
      }) as unknown as StarSystem,
  );
  return {
    id: 'galaxy-route-planning',
    name: 'Testgalaxie',
    seed: 'seed',
    createdAt: 0,
    config: { size: 'small', systemCount: systems.length, width: 600, height: 400 },
    systems,
  } as Galaxy;
}

function makeFleet(overrides: Partial<Fleet> = {}): Fleet {
  return {
    id: 'fleet-1',
    name: 'Aurora',
    civId: 'player-empire',
    systemId: 'sys-01',
    ships: [{ shipDefId: 'corvette', count: 1 }],
    status: 'stationed',
    pathSystemIds: ['sys-01'],
    pathIndex: 0,
    destinationSystemId: null,
    ...overrides,
  } as Fleet;
}

function makeManager(galaxy: Galaxy = makeGalaxy()): FleetManager {
  return new FleetManager(EventBus.getInstance(), () => galaxy);
}

describe('Astraea 4X - Routenplanungsmodus', () => {
  it('1. Nur eigene Verbände dürfen eine Route planen', () => {
    expect(canStartRoutePlanning(makeFleet(), 'player-empire')).toBe(true);
    expect(canStartRoutePlanning(makeFleet({ civId: 'civ-hesperia' }), 'player-empire')).toBe(false);
    expect(canStartRoutePlanning(null, 'player-empire')).toBe(false);
  });

  it('2. Systemklick im Planungsmodus committet sofort', () => {
    expect(
      decideGalaxySystemClick({
        isRoutePlanning: true,
        hasSelectedPlayerFleet: true,
        clickedSystemId: 'sys-04',
        pendingTargetSystemId: null,
      }),
    ).toBe('commit-plan');
  });

  it('3. Ohne Planungsmodus bleibt das alte Zwei-Klick-Verfahren erhalten', () => {
    expect(
      decideGalaxySystemClick({
        isRoutePlanning: false,
        hasSelectedPlayerFleet: true,
        clickedSystemId: 'sys-04',
        pendingTargetSystemId: null,
      }),
    ).toBe('legacy-preview');
    expect(
      decideGalaxySystemClick({
        isRoutePlanning: false,
        hasSelectedPlayerFleet: true,
        clickedSystemId: 'sys-04',
        pendingTargetSystemId: 'sys-04',
      }),
    ).toBe('legacy-commit');
  });

  it('4. Ohne eigenen Verband löst kein Klick eine Bewegung aus', () => {
    for (const isRoutePlanning of [false, true]) {
      expect(
        decideGalaxySystemClick({
          isRoutePlanning,
          hasSelectedPlayerFleet: false,
          clickedSystemId: 'sys-04',
          pendingTargetSystemId: 'sys-04',
        }),
      ).toBe('ignore');
    }
  });

  it('5. Statuszeile existiert nur im Planungsmodus', () => {
    expect(routePlanningStatusText(true)).toBe('Routenplanung aktiv – Zielsystem auswählen');
    expect(routePlanningStatusText(false)).toBeNull();
  });
});

describe('Astraea 4X - Rote Routenprojektion', () => {
  const systems = new Map<string, StarSystem>([
    ['sys-01', { id: 'sys-01', x: 0, y: 0 } as unknown as StarSystem],
    ['sys-02', { id: 'sys-02', x: 100, y: 50 } as unknown as StarSystem],
  ]);

  it('6. Projektion nutzt Weltkoordinaten und folgt Zoom und Pan', () => {
    const zoomedIn = routePolylineScreenPoints(['sys-01', 'sys-02'], systems, (x, y) => ({
      x: x * 2 + 10,
      y: y * 2 + 20,
    }));
    expect(zoomedIn).toEqual([
      { x: 10, y: 20 },
      { x: 210, y: 120 },
    ]);

    const zoomedOut = routePolylineScreenPoints(['sys-01', 'sys-02'], systems, (x, y) => ({
      x: x * 0.5 - 5,
      y: y * 0.5 + 7,
    }));
    expect(zoomedOut).toEqual([
      { x: -5, y: 7 },
      { x: 45, y: 32 },
    ]);
  });

  it('7. Unbekannte Systeme werden übersprungen, Reihenfolge bleibt erhalten', () => {
    const points = routePolylineScreenPoints(
      ['sys-02', 'sys-unbekannt', 'sys-01'],
      systems,
      (x, y) => ({ x, y }),
    );
    expect(points).toEqual([
      { x: 100, y: 50 },
      { x: 0, y: 0 },
    ]);
  });

  it('8. Die Projektion speichert keine Bildschirmkoordinaten', () => {
    const project = (x: number, y: number) => ({ x: x + 1, y: y + 1 });
    routePolylineScreenPoints(['sys-01', 'sys-02'], systems, project);
    // Rohdaten bleiben unverändert; es gibt keinen Cache mit Screenwerten.
    expect(systems.get('sys-01')).toMatchObject({ x: 0, y: 0 });
    expect(systems.get('sys-02')).toMatchObject({ x: 100, y: 50 });
  });
});

describe('Astraea 4X - Planung und tatsächliche Bewegung', () => {
  it('9. Vorschau und committeter Pfad sind identisch', () => {
    const manager = makeManager();
    manager.addFleet(makeFleet());
    const preview = manager.previewRoute('fleet-1', 'sys-04');

    const result = manager.commandMoveFleet('fleet-1', 'sys-04');
    expect(result.allowed).toBe(true);
    expect(result.pathSystemIds).toEqual(preview);
    expect(manager.getFleet('fleet-1')?.pathSystemIds).toEqual(preview);
    expect(manager.getFleet('fleet-1')?.status).toBe('moving');
  });

  it('10. Ein Zug bewegt höchstens die Reichweite und hält am Zwischensystem', () => {
    const manager = makeManager();
    manager.addFleet(makeFleet());
    manager.commandMoveFleet('fleet-1', 'sys-04');

    const first = manager.advanceTurn([], 1, null, () => 2);
    expect(first.hopsTraveled).toBe(2);
    expect(manager.getFleet('fleet-1')).toMatchObject({
      systemId: 'sys-03',
      status: 'moving',
      destinationSystemId: 'sys-04',
    });

    const second = manager.advanceTurn([], 2, null, () => 2);
    expect(second.hopsTraveled).toBe(1);
    expect(second.arrivedFleetIds).toEqual(['fleet-1']);
    expect(manager.getFleet('fleet-1')).toMatchObject({
      systemId: 'sys-04',
      status: 'stationed',
      destinationSystemId: null,
    });
  });

  it('11. Ungültiges Ziel lässt den Spielzustand unverändert', () => {
    const manager = makeManager();
    manager.addFleet(makeFleet());

    expect(manager.previewRoute('fleet-1', 'sys-unbekannt')).toBeNull();
    const result = manager.commandMoveFleet('fleet-1', 'sys-unbekannt');
    expect(result.allowed).toBe(false);
    expect(manager.getFleet('fleet-1')).toMatchObject({
      systemId: 'sys-01',
      status: 'stationed',
      destinationSystemId: null,
      pathSystemIds: ['sys-01'],
    });
  });

  it('12. ETA der geplanten Route entspricht der Rundenzahl der Bewegung', () => {
    const manager = makeManager();
    manager.addFleet(makeFleet());
    const etaBefore = manager.getEtaToSystem('fleet-1', 'sys-04', 2);
    expect(etaBefore).toMatchObject({ turnsRemaining: 2, hopsRemaining: 3, hopsPerTurn: 2 });

    manager.commandMoveFleet('fleet-1', 'sys-04');
    manager.advanceTurn([], 1, null, () => 2);
    expect(manager.getFleetEta('fleet-1', 2)).toMatchObject({
      turnsRemaining: 1,
      hopsRemaining: 1,
      nextSystemId: 'sys-04',
    });
  });

  it('13. Ein Auftrag bewegt sofort bis zur Reichweite, ohne Doppelzug', () => {
    const manager = makeManager();
    manager.addFleet(makeFleet());
    manager.commandMoveFleet('fleet-1', 'sys-04');

    expect(manager.moveFleetNow('fleet-1', 2)).toEqual({ traveled: 2, arrived: false });
    expect(manager.getFleet('fleet-1')).toMatchObject({
      systemId: 'sys-03',
      status: 'moving',
      destinationSystemId: 'sys-04',
    });

    // Der Rundenwechsel bewegt denselben Verband nicht erneut.
    const sameTurn = manager.advanceTurn([], 1, null, () => 2);
    expect(sameTurn.hopsTraveled).toBe(0);
    expect(sameTurn.movedFleetIds).toEqual([]);
    expect(manager.getFleet('fleet-1')?.systemId).toBe('sys-03');

    // In der nächsten Runde läuft die Route weiter.
    const nextTurn = manager.advanceTurn([], 2, null, () => 2);
    expect(nextTurn.arrivedFleetIds).toEqual(['fleet-1']);
    expect(manager.getFleet('fleet-1')).toMatchObject({
      systemId: 'sys-04',
      status: 'stationed',
    });
  });

  it('14. Innerhalb der Reichweite kommt der Verband sofort an', () => {
    const manager = makeManager();
    manager.addFleet(makeFleet());
    manager.commandMoveFleet('fleet-1', 'sys-03');

    expect(manager.moveFleetNow('fleet-1', 2)).toEqual({ traveled: 2, arrived: true });
    expect(manager.getFleet('fleet-1')).toMatchObject({
      systemId: 'sys-03',
      status: 'stationed',
      destinationSystemId: null,
    });
  });

  it('15. Eine zweite Sofortbewegung in derselben Runde wird verhindert', () => {
    const manager = makeManager();
    manager.addFleet(makeFleet());
    manager.commandMoveFleet('fleet-1', 'sys-04');
    expect(manager.moveFleetNow('fleet-1', 1)?.traveled).toBe(1);
    expect(manager.hasMovedThisTurn('fleet-1')).toBe(true);

    manager.retargetFleet('fleet-1', 'sys-05');
    expect(manager.moveFleetNow('fleet-1', 1)).toEqual({ traveled: 0, arrived: false });
    expect(manager.getFleet('fleet-1')?.systemId).toBe('sys-02');

    // Erst der Rundenwechsel gibt die nächste Bewegung frei.
    manager.advanceTurn([], 1, null, () => 1);
    expect(manager.hasMovedThisTurn('fleet-1')).toBe(false);
  });
});
