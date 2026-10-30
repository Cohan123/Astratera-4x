/**
 * Astraea 4X - Benachrichtigungssystem
 *
 * Prüft den zentralen Meldungsstapel: Duplikat-Schutz, Obergrenze,
 * Reihenfolge, Schließen, Leeren beim Laden sowie die Übersetzung der
 * Spielereignisse in Meldungen (Bau, Rekrutierung, Forschung, Kolonisation,
 * Erkundung). Mehrere Meldungen müssen gleichzeitig bestehen können.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/EventBus.ts';
import {
  NOTIFICATION_LIMIT,
  NOTIFICATION_TTL_MS,
  NotificationCenter,
  STICKY_CATEGORIES,
} from '../src/core/notificationCenter.ts';
import { attachNotificationBridge } from '../src/core/notificationBridge.ts';
import { Colony, Fleet, Planet, TechnologyDef } from '../src/core/types.ts';

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) {
    cleanups.pop()!();
  }
  EventBus.getInstance().clear();
});

function createCenter() {
  return new NotificationCenter();
}

function attach(center: NotificationCenter) {
  const detach = attachNotificationBridge(center, EventBus.getInstance(), {
    playerCivId: 'player-empire',
    currentTurn: () => 7,
    resolveColonyName: (id) => (id === 'col-1' ? 'Aurelia' : 'Kolonie'),
    resolveSystemName: (id) => (id === 'sys-1' ? 'Sol' : id),
    resolvePlanetName: (id) => (id === 'planet-1' ? 'Terra' : id),
  });
  cleanups.push(detach);
  return detach;
}

function buildCompleted(overrides: Record<string, unknown> = {}) {
  return {
    colonyId: 'col-1',
    colonyName: 'Aurelia',
    civId: 'player-empire',
    defId: 'hydroponics_dome',
    name: 'Hydrokultur-Kuppel',
    projectType: 'building' as const,
    turn: 7,
    ...overrides,
  };
}

describe('Astraea 4X - NotificationCenter', () => {
  it('1. Gleiche Meldung wird nicht doppelt eingereiht', () => {
    const center = createCenter();

    expect(center.push({ category: 'build', message: 'Bau fertig', key: 'build-1' })).not.toBeNull();
    expect(center.push({ category: 'build', message: 'Bau fertig', key: 'build-1' })).toBeNull();

    expect(center.getItems()).toHaveLength(1);
  });

  it('2. Obergrenze verdrängt die ältesten Meldungen', () => {
    const center = createCenter();
    for (let i = 0; i < NOTIFICATION_LIMIT + 4; i += 1) {
      center.push({ category: 'info', message: `Meldung ${i}`, key: `info-${i}` });
    }

    const items = center.getItems();
    expect(items).toHaveLength(NOTIFICATION_LIMIT);
    // Neueste zuerst.
    expect(items[0].message).toBe(`Meldung ${NOTIFICATION_LIMIT + 3}`);
    expect(items.some((item) => item.message === 'Meldung 0')).toBe(false);
  });

  it('3. Schließen entfernt genau eine Meldung', () => {
    const center = createCenter();
    const first = center.push({ category: 'info', message: 'A', key: 'a' })!;
    center.push({ category: 'info', message: 'B', key: 'b' });

    expect(center.dismiss(first.id)).toBe(true);
    expect(center.getItems().map((item) => item.message)).toEqual(['B']);
    expect(center.dismiss(first.id)).toBe(false);
  });

  it('4. Abonnenten erhalten jede Änderung, auch beim Leeren', () => {
    const center = createCenter();
    const snapshots: number[] = [];
    const off = center.subscribe((items) => snapshots.push(items.length));
    cleanups.push(off);

    center.push({ category: 'warning', message: 'Achtung', key: 'warn' });
    center.clear();

    expect(snapshots).toEqual([0, 1, 0]);
  });

  it('5. Alle Kategorien laufen nach derselben Zeitspanne ab', () => {
    expect(NOTIFICATION_TTL_MS).toBe(10_000);
    // Seit der einheitlichen Regel bleibt keine Kategorie dauerhaft stehen.
    expect(STICKY_CATEGORIES.size).toBe(0);
    expect(STICKY_CATEGORIES.has('warning')).toBe(false);
    expect(STICKY_CATEGORIES.has('build')).toBe(false);
    expect(STICKY_CATEGORIES.has('turn')).toBe(false);
  });
});

describe('Astraea 4X - Benachrichtigungs-Brücke', () => {
  it('6. Abgeschlossener Bau erzeugt eine Meldung mit Kolonie und Gebäude', () => {
    const center = createCenter();
    attach(center);

    EventBus.getInstance().emit('build:completed', buildCompleted());

    const items = center.getItems();
    expect(items).toHaveLength(1);
    expect(items[0].category).toBe('build');
    expect(items[0].message).toContain('Hydrokultur-Kuppel');
    expect(items[0].message).toContain('Aurelia');
  });

  it('7. Rekrutierung, Forschung, Kolonisation und Erkundung laufen über dasselbe Center', () => {
    const center = createCenter();
    attach(center);
    const bus = EventBus.getInstance();

    bus.emit('unit:recruited', {
      colonyId: 'col-1',
      colonyName: 'Aurelia',
      civId: 'player-empire',
      unitDefId: 'scout',
      unitName: 'Spähtrupp',
      turn: 7,
    });
    bus.emit('research:completed', {
      tech: { id: 'fusion', name: 'Fusionstechnik' } as TechnologyDef,
    });
    bus.emit('colony:founded', {
      colony: {
        id: 'col-2',
        name: 'Neu-Terra',
        civId: 'player-empire',
      } as Colony,
      planet: { id: 'planet-1', name: 'Terra' } as Planet,
      turn: 7,
    });
    bus.emit('planet:surveyed', { planetId: 'planet-1', systemId: 'sys-1' });

    const messages = center.getItems().map((item) => item.message);
    expect(messages.some((message) => message.includes('Spähtrupp'))).toBe(true);
    expect(messages.some((message) => message.includes('Fusionstechnik'))).toBe(true);
    expect(messages.some((message) => message.includes('Neu-Terra'))).toBe(true);
    expect(messages.some((message) => message.includes('Terra'))).toBe(true);
    // Vier verschiedene Meldungen, keine überschreibt die andere.
    expect(center.getItems()).toHaveLength(4);
  });

  it('8. Mehrere Abschlüsse in derselben Runde bleiben einzeln sichtbar', () => {
    const center = createCenter();
    attach(center);
    const bus = EventBus.getInstance();

    bus.emit('build:completed', buildCompleted());
    bus.emit('unit:recruited', {
      colonyId: 'col-1',
      colonyName: 'Aurelia',
      civId: 'player-empire',
      unitDefId: 'scout',
      unitName: 'Spähtrupp',
      turn: 7,
    });
    bus.emit('research:completed', {
      tech: { id: 'fusion', name: 'Fusionstechnik' } as TechnologyDef,
    });

    const categories = center.getItems().map((item) => item.category);
    expect(categories.sort()).toEqual(['build', 'recruit', 'research']);
  });

  it('9. KI-Ereignisse erzeugen keine Spielermeldungen', () => {
    const center = createCenter();
    attach(center);

    EventBus.getInstance().emit('build:completed', buildCompleted({ civId: 'ai-1' }));

    expect(center.getItems()).toHaveLength(0);
  });

  it('10. Laden leert alle Meldungen der vorherigen Partie', () => {
    const center = createCenter();
    attach(center);
    const bus = EventBus.getInstance();

    bus.emit('build:completed', buildCompleted());
    expect(center.getItems()).toHaveLength(1);

    bus.emit('game:loaded', { saveName: 'Schnellspeicherung', turn: 3 });
    expect(center.getItems()).toHaveLength(0);
  });

  it('11. Erneutes Laden erzeugt keine doppelten Meldungen', () => {
    const center = createCenter();
    attach(center);
    const bus = EventBus.getInstance();

    bus.emit('game:loaded', { saveName: 'A', turn: 1 });
    bus.emit('game:loaded', { saveName: 'A', turn: 1 });
    bus.emit('build:completed', buildCompleted());
    bus.emit('build:completed', buildCompleted());

    expect(center.getItems()).toHaveLength(1);
  });

  it('12. Flottenankunft und Schiffsbau werden gemeldet', () => {
    const center = createCenter();
    attach(center);
    const bus = EventBus.getInstance();

    bus.emit('fleet:ship-built', {
      fleetId: 'fleet-1',
      shipDefId: 'corvette',
      colonyId: 'col-1',
      systemId: 'sys-1',
    });
    bus.emit('fleet:arrived', {
      fleet: { id: 'fleet-1', name: 'Erste Flotte', systemId: 'sys-1' } as Fleet,
    });

    const messages = center.getItems().map((item) => item.message);
    expect(messages.some((message) => message.includes('Korvette'))).toBe(true);
    expect(messages.some((message) => message.includes('Erste Flotte'))).toBe(true);
  });

  it('13. Abmelden stoppt alle Meldungen', () => {
    const center = createCenter();
    const detach = attachNotificationBridge(center, EventBus.getInstance(), {
      playerCivId: 'player-empire',
    });

    EventBus.getInstance().emit('build:completed', buildCompleted());
    expect(center.getItems()).toHaveLength(1);

    detach();
    EventBus.getInstance().emit('build:completed', buildCompleted({ defId: 'solar_array' }));
    expect(center.getItems()).toHaveLength(1);
  });
});
