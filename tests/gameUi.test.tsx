/**
 * Astraea 4X - Schiffsleiste und Nachrichtenverlauf (Darstellungstests)
 *
 * Reine Server-Render-Tests prüfen, dass vorhandene Flottenwerte sichtbar sind,
 * fehlende Schiffsklassen als Fallback markiert werden und der Verlauf
 * Kategorien, Betreff, Runde und Gelesen-Status anzeigt.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Fleet, MessageLogEntry } from '../src/core/types.ts';
import { MessageLogModal } from '../src/ui/components/MessageLogModal.tsx';
import { ShipInfoBar } from '../src/ui/components/ShipInfoBar.tsx';

const noop = () => undefined;

const fleet: Fleet = {
  id: 'fleet-1',
  name: 'Aurora',
  civId: 'player-empire',
  systemId: 'sys-1',
  ships: [{ shipDefId: 'corvette', count: 2 }],
  status: 'moving',
  pathSystemIds: ['sys-1', 'sys-2'],
  pathIndex: 0,
  destinationSystemId: 'sys-2',
  cargo: {
    colonists: 120,
    food: 10,
    minerals: 4,
    rareResources: 2,
    influence: 1,
  },
};

describe('ShipInfoBar', () => {
  it('zeigt Grafik, Typ, Fraktion, Standort, Ziel, Reichweite und Ladung', () => {
    const html = renderToStaticMarkup(
      <ShipInfoBar
        fleet={fleet}
        systemName="Sol"
        destinationName="Alpha Centauri"
        factionName="Hesperia"
        rangeHops={2}
        rangeLabel="Fusionsantrieb"
        onCancelMovement={noop}
        onClose={noop}
      />,
    );

    expect(html).toContain('Aurora');
    expect(html).toContain('Im Flug');
    expect(html).toContain('Hesperia');
    expect(html).toContain('Sol');
    expect(html).toContain('Alpha Centauri');
    expect(html).toContain('Fusionsantrieb');
    expect(html).toContain('2 Sprünge');
    expect(html).toContain('120 Kolonisten');
    expect(html).toContain('Flug abbrechen');
    expect(html).toContain('Fallback-Grafik');
  });

  it('bietet bei vorausgewähltem Ziel Bestätigung und Aufheben an', () => {
    const html = renderToStaticMarkup(
      <ShipInfoBar
        fleet={{ ...fleet, status: 'stationed', destinationSystemId: null }}
        systemName="Sol"
        pendingTargetName="Alpha Centauri"
        pendingRouteHops={2}
        onConfirmMove={noop}
        onClearTarget={noop}
        onClose={noop}
      />,
    );

    expect(html).toContain('Ziel: Alpha Centauri');
    expect(html).toContain('Auftrag erteilen');
    expect(html).toContain('Ziel aufheben');
  });

  it('rendert ohne Auswahl nichts', () => {
    expect(renderToStaticMarkup(<ShipInfoBar fleet={null} />)).toBe('');
  });

  it('zeigt die Ankunftsprognose der laufenden Route', () => {
    const html = renderToStaticMarkup(
      <ShipInfoBar
        fleet={fleet}
        systemName="Sol"
        destinationName="Alpha Centauri"
        etaTurns={2}
        etaHops={3}
        onClose={noop}
      />,
    );

    expect(html).toContain('Ankunft:');
    expect(html).toContain('in 2 Runden (3 Sprünge)');
  });

  it('zeigt im Ziel null Runden an', () => {
    const html = renderToStaticMarkup(
      <ShipInfoBar
        fleet={{ ...fleet, status: 'stationed', destinationSystemId: null }}
        systemName="Sol"
        etaTurns={0}
        onClose={noop}
      />,
    );

    expect(html).toContain('Ankunft:');
    expect(html).toContain('im Ziel');
  });

  it('zeigt für das vorausgewählte Ziel zusätzlich die ETA', () => {
    const html = renderToStaticMarkup(
      <ShipInfoBar
        fleet={{ ...fleet, status: 'stationed', destinationSystemId: null }}
        systemName="Sol"
        pendingTargetName="Alpha Centauri"
        pendingRouteHops={2}
        pendingRouteEtaTurns={2}
        onConfirmMove={noop}
        onClose={noop}
      />,
    );

    expect(html).toContain('2 Sprünge');
    expect(html).toContain('ETA 2 Runden');
  });

  it('bietet für eigene Verbände die Schaltfläche „Route planen“ an', () => {
    const html = renderToStaticMarkup(
      <ShipInfoBar
        fleet={{ ...fleet, status: 'stationed', destinationSystemId: null }}
        systemName="Sol"
        canPlanRoute
        onStartRoutePlanning={noop}
        onClose={noop}
      />,
    );

    expect(html).toContain('Route planen');
  });

  it('zeigt die Schaltfläche nicht ohne Planungsmöglichkeit', () => {
    const withoutPermission = renderToStaticMarkup(
      <ShipInfoBar
        fleet={{ ...fleet, status: 'stationed', destinationSystemId: null }}
        systemName="Sol"
        canPlanRoute={false}
        onStartRoutePlanning={noop}
        onClose={noop}
      />,
    );
    expect(withoutPermission).not.toContain('Route planen');

    const withoutHandler = renderToStaticMarkup(
      <ShipInfoBar
        fleet={{ ...fleet, status: 'stationed', destinationSystemId: null }}
        systemName="Sol"
        canPlanRoute
        onClose={noop}
      />,
    );
    expect(withoutHandler).not.toContain('Route planen');
  });

  it('zeigt im Planungsmodus Status und Abbruch an', () => {
    const html = renderToStaticMarkup(
      <ShipInfoBar
        fleet={{ ...fleet, status: 'stationed', destinationSystemId: null }}
        systemName="Sol"
        canPlanRoute
        isRoutePlanning
        onStartRoutePlanning={noop}
        onCancelRoutePlanning={noop}
        onClose={noop}
      />,
    );

    expect(html).toContain('Routenplanung aktiv – Zielsystem auswählen');
    expect(html).toContain('Planung abbrechen');
    expect(html).not.toContain('Route planen');
  });
});

describe('MessageLogModal', () => {
  const entries: MessageLogEntry[] = [
    {
      id: 'msg-2',
      category: 'fleet',
      subject: 'Flotte angekommen: Aurora',
      text: 'Flotte Aurora hat Sol erreicht.',
      turn: 12,
      createdAt: Date.UTC(2200, 0, 5, 12, 30),
      read: false,
      key: 'fleet-arrived:1',
      target: { kind: 'fleet', id: 'fleet-1', label: 'Aurora' },
    },
    {
      id: 'msg-1',
      category: 'build',
      subject: 'Bau abgeschlossen: Kuppel',
      text: 'Bau abgeschlossen: Kuppel in Aurelia.',
      turn: 11,
      createdAt: Date.UTC(2200, 0, 4, 9, 0),
      read: true,
      key: 'build-completed:1',
    },
  ];

  it('zeigt Verlauf, Zähler, Kategorie, Runde und Ziel', () => {
    const html = renderToStaticMarkup(
      <MessageLogModal
        entries={entries}
        onClose={noop}
        onMarkRead={noop}
        onMarkAllRead={noop}
        onSelectTarget={noop}
      />,
    );

    expect(html).toContain('Nachrichtenverlauf');
    expect(html).toContain('2 gesamt');
    expect(html).toContain('1 ungelesen');
    expect(html).toContain('Flotte angekommen: Aurora');
    expect(html).toContain('Bau abgeschlossen: Kuppel');
    expect(html).toContain('Runde 12');
    expect(html).toContain('ungelesen');
    expect(html).toContain('Ziel: Aurora');
    expect(html).toContain('Zum Zielobjekt springen');
  });

  it('zeigt bei leerem Verlauf einen Hinweis ohne Fehler', () => {
    const html = renderToStaticMarkup(
      <MessageLogModal
        entries={[]}
        onClose={noop}
        onMarkRead={noop}
        onMarkAllRead={noop}
      />,
    );
    expect(html).toContain('Keine Meldungen');
    expect(html).toContain('0 gesamt');
    expect(html).toContain('0 ungelesen');
  });

  it('bleibt als Journal geschlossen, bis er ausdrücklich geöffnet wird', () => {
    const html = renderToStaticMarkup(
      <MessageLogModal
        isOpen={false}
        entries={entries}
        onClose={noop}
        onMarkRead={noop}
        onMarkAllRead={noop}
      />,
    );
    expect(html).toBe('');
  });
});
