/**
 * Astraea 4X - Nachrichtenverlauf
 *
 * Der Verlauf ergänzt die flüchtigen Popups: Er bleibt dauerhaft verfügbar,
 * dedupliziert über denselben Schlüssel und überlebt Speichern/Laden. Die
 * Brücke darf ein Ereignis niemals doppelt eintragen.
 */

import { describe, expect, it, afterEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.ts';
import { MessageLog, MESSAGE_LOG_LIMIT, deriveSubject } from '../src/core/messageLog.ts';
import { NotificationCenter } from '../src/core/notificationCenter.ts';
import { attachNotificationBridge } from '../src/core/notificationBridge.ts';

const detachers: Array<() => void> = [];

afterEach(() => {
  while (detachers.length > 0) detachers.pop()?.();
});

describe('Astraea 4X - MessageLog', () => {
  it('1. Gleicher Schlüssel wird nicht doppelt gespeichert', () => {
    const log = new MessageLog();
    expect(log.push({ category: 'build', message: 'Bau fertig', key: 'k-1', turn: 3 })).not.toBeNull();
    expect(log.push({ category: 'build', message: 'Bau fertig', key: 'k-1', turn: 3 })).toBeNull();
    expect(log.getEntries()).toHaveLength(1);
  });

  it('2. Betreff, Ziel, Runde und Gelesen-Status werden geführt', () => {
    const log = new MessageLog();
    const entry = log.push({
      category: 'fleet',
      message: '🛸 Flotte „Aurora“ hat Sol erreicht.',
      key: 'fleet-1',
      turn: 12,
      target: { kind: 'fleet', id: 'fleet-1', label: 'Sol' },
    })!;

    expect(entry.subject).toBe('Flotte „Aurora“ hat Sol erreicht');
    expect(entry.target?.kind).toBe('fleet');
    expect(entry.turn).toBe(12);
    expect(entry.read).toBe(false);
    expect(log.getUnreadCount()).toBe(1);

    expect(log.markRead(entry.id)).toBe(true);
    expect(log.getUnreadCount()).toBe(0);
    expect(log.markRead(entry.id)).toBe(false);
    expect(log.markUnread(entry.id)).toBe(true);
    expect(log.markAllRead()).toBeUndefined();
    expect(log.getUnreadCount()).toBe(0);
  });

  it('3. Verlauf ist auf das Limit begrenzt und neueste Meldung steht oben', () => {
    const log = new MessageLog();
    for (let i = 0; i < MESSAGE_LOG_LIMIT + 5; i += 1) {
      log.push({ category: 'info', message: `Meldung ${i}`, key: `limit-${i}`, turn: 1 });
    }
    const entries = log.getEntries();
    expect(entries).toHaveLength(MESSAGE_LOG_LIMIT);
    expect(entries[0].text).toBe(`Meldung ${MESSAGE_LOG_LIMIT + 4}`);
  });

  it('4. Snapshot-Roundtrip erhält Einträge und lädt in dasselbe Objekt', () => {
    const log = new MessageLog();
    log.push({
      category: 'research',
      message: 'Technologie erforscht: Fusionsreaktoren.',
      key: 'research-1',
      turn: 4,
      subject: 'Technologie erforscht: Fusionsreaktoren',
    });
    const snapshot = log.toSnapshot();

    let notified = 0;
    const unsubscribe = log.subscribe(() => {
      notified += 1;
    });

    log.loadSnapshot(snapshot);
    expect(notified).toBeGreaterThanOrEqual(2);
    expect(log.getEntries()).toHaveLength(1);
    expect(log.getEntries()[0].subject).toBe('Technologie erforscht: Fusionsreaktoren');
    unsubscribe();
  });

  it('5. Fehlerhafte Snapshot-Einträge werden verworfen', () => {
    const log = new MessageLog();
    log.loadSnapshot([
      { id: 'ok', key: 'ok', text: 'Gültig', category: 'info', turn: 1, createdAt: 1, read: false, subject: '' },
      null as never,
      { id: 'bad' } as never,
    ]);
    const entries = log.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].subject).toBe('Gültig');
  });

  it('6. Betreffableitung kürzt lange Meldungen und entfernt Emojis am Anfang', () => {
    expect(deriveSubject('🏗 Bau abgeschlossen: Kuppel.')).toBe('Bau abgeschlossen: Kuppel');
    const long = deriveSubject(`${'Wort '.repeat(30)}`);
    expect(long.length).toBeLessThanOrEqual(72);
    expect(long.endsWith('…')).toBe(true);
    expect(deriveSubject('   ')).toBe('Spielmeldung');
  });
});

describe('Astraea 4X - Brücke zu Popup und Verlauf', () => {
  it('7. Ereignis landet genau einmal in Popup und Verlauf', () => {
    const bus = EventBus.getInstance();
    const center = new NotificationCenter();
    const log = new MessageLog();
    detachers.push(
      attachNotificationBridge(center, bus, {
        playerCivId: 'player-empire',
        currentTurn: () => 9,
        messageLog: log,
        resolveSystemName: (id) => (id === 'sys-1' ? 'Sol' : id),
      }),
    );

    bus.emit('system:surveyed', { systemId: 'sys-1' });
    // Dasselbe Ereignis ein zweites Mal: das Center dedupliziert, der Verlauf bleibt stabil.
    bus.emit('system:surveyed', { systemId: 'sys-1' });

    const entries = log.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].target).toEqual({ kind: 'system', id: 'sys-1', label: 'Sol' });
    expect(entries[0].subject).toBe('Systemerkundung: Sol');
    expect(center.getItems()).toHaveLength(1);
  });
});
