/**
 * Astraea 4X - Schiffsleiste
 *
 * Zeigt den ausgewählten Verband mit allen vorhandenen Werten. Die Leiste ist
 * rein darstellend und liest dieselben Flottendaten wie Karte und
 * Systemansicht. Es werden keine Zahlen erfunden: Fehlt ein Wert, bleibt das
 * Feld leer bzw. zeigt einen erklärenden Text.
 */

import React from 'react';
import type { Fleet } from '../../core/types.ts';
import { getShipDef } from '../../data/shipCatalog.ts';
import { getShipArt } from '../shipAssets.ts';

export interface ShipInfoBarProps {
  fleet: Fleet | null;
  systemName?: string;
  destinationName?: string;
  factionName?: string;
  factionColor?: string;
  rangeHops?: number;
  rangeLabel?: string;
  /** Ankunftsprognose in Runden (0 = bereits im Ziel), aus der Engine. */
  etaTurns?: number;
  /** Verbleibende Hyperlane-Sprünge bis zum Ziel. */
  etaHops?: number;
  /** Vorausgewähltes Zielsystem, das noch bestätigt werden muss. */
  pendingTargetName?: string;
  pendingRouteHops?: number;
  /** Ankunftsprognose für das vorausgewählte Ziel in Runden. */
  pendingRouteEtaTurns?: number;
  /** Darf für diesen Verband eine Route geplant werden? */
  canPlanRoute?: boolean;
  /** Läuft gerade die Routenplanung für diesen Verband? */
  isRoutePlanning?: boolean;
  onStartRoutePlanning?: () => void;
  onCancelRoutePlanning?: () => void;
  onConfirmMove?: () => void;
  onClearTarget?: () => void;
  onCancelMovement?: () => void;
  onClose?: () => void;
}

export const SHIP_STATUS_LABELS: Record<Fleet['status'], string> = {
  stationed: 'Stationiert',
  moving: 'Im Flug',
};

/** Schiffstypen eines Verbands mit Anzahl, ohne erfundene Werte. */
export function describeFleetShips(fleet: Fleet): string[] {
  return fleet.ships.map((stack) => {
    const def = getShipDef(stack.shipDefId);
    const name = def?.name ?? stack.shipDefId;
    return stack.count > 1 ? `${name} ×${stack.count}` : name;
  });
}

export const ShipInfoBar: React.FC<ShipInfoBarProps> = ({
  fleet,
  systemName,
  destinationName,
  factionName,
  factionColor = '#38bdf8',
  rangeHops,
  rangeLabel,
  etaTurns,
  etaHops,
  pendingTargetName,
  pendingRouteHops,
  pendingRouteEtaTurns,
  canPlanRoute = false,
  isRoutePlanning = false,
  onStartRoutePlanning,
  onCancelRoutePlanning,
  onConfirmMove,
  onClearTarget,
  onCancelMovement,
  onClose,
}) => {
  if (!fleet) return null;

  const primary = fleet.ships[0] ? getShipDef(fleet.ships[0].shipDefId) : null;
  const art = getShipArt(primary?.shipClass);
  const ships = describeFleetShips(fleet);
  const isMoving = fleet.status === 'moving';
  const location = isMoving
    ? `${systemName ?? fleet.systemId} → ${destinationName ?? fleet.destinationSystemId ?? 'unbekannt'}`
    : (systemName ?? fleet.systemId);

  return (
    <div
      data-ship-info-bar
      className="pointer-events-auto absolute bottom-4 left-1/2 -translate-x-1/2 z-30 w-[min(64rem,calc(100%-2rem))] rounded-xl border border-slate-700/80 bg-slate-950/95 shadow-2xl backdrop-blur-md"
    >
      <div className="flex items-stretch gap-3 p-3">
        <div className="relative h-20 w-40 shrink-0 overflow-hidden rounded-lg border border-slate-700/70 bg-black">
          {art.url ? (
            <img
              src={art.url}
              alt={art.label}
              className="h-full w-full object-contain opacity-90 mix-blend-screen"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[10px] font-mono text-slate-500">
              Keine Grafik
            </div>
          )}
          <span
            className="absolute left-1 top-1 h-2.5 w-2.5 rounded-full ring-1 ring-slate-950"
            style={{ backgroundColor: factionColor }}
            aria-hidden="true"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-slate-100">{fleet.name}</span>
            <span className="shrink-0 rounded border border-slate-700/80 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider text-slate-300">
              {SHIP_STATUS_LABELS[fleet.status]}
            </span>
            {art.fallback && (
              <span
                className="shrink-0 rounded border border-amber-700/60 bg-amber-950/40 px-1.5 py-0.5 text-[10px] font-mono text-amber-200"
                title="Für diese Schiffsklasse liegt kein eigenes Bild vor; es wird die Fregattengrafik verwendet."
              >
                Fallback-Grafik
              </span>
            )}
          </div>

          <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] font-mono text-slate-400 sm:grid-cols-3 lg:grid-cols-4">
            <span>
              <span className="text-slate-500">Typ:</span>{' '}
              {ships.length > 0 ? ships.join(', ') : 'unbekannt'}
            </span>
            <span>
              <span className="text-slate-500">Fraktion:</span> {factionName ?? 'unbekannt'}
            </span>
            <span>
              <span className="text-slate-500">System:</span> {systemName ?? fleet.systemId}
            </span>
            <span>
              <span className="text-slate-500">Standort:</span> {location}
            </span>
            <span>
              <span className="text-slate-500">Bewegung:</span>{' '}
              {isMoving ? 'unterwegs' : 'keine'}
            </span>
            <span>
              <span className="text-slate-500">Ziel:</span>{' '}
              {isMoving
                ? (destinationName ?? fleet.destinationSystemId ?? 'unbekannt')
                : '—'}
            </span>
            <span>
              <span className="text-slate-500">Ankunft:</span>{' '}
              {etaTurns === undefined
                ? '—'
                : etaTurns === 0
                  ? 'im Ziel'
                  : `in ${etaTurns} ${etaTurns === 1 ? 'Runde' : 'Runden'}${
                      etaHops === undefined
                        ? ''
                        : ` (${etaHops} ${etaHops === 1 ? 'Sprung' : 'Sprünge'})`
                    }`}
            </span>
            <span>
              <span className="text-slate-500">Reichweite:</span>{' '}
              {rangeHops === undefined ? 'unbekannt' : `${rangeHops} ${rangeHops === 1 ? 'Sprung' : 'Sprünge'}${rangeLabel ? ` (${rangeLabel})` : ''}`}
            </span>
            <span>
              <span className="text-slate-500">Ladung:</span>{' '}
              {fleet.cargo
                ? `${fleet.cargo.colonists} Kolonisten · ${fleet.cargo.food} Nahrung · ${fleet.cargo.minerals} Mineralien · ${fleet.cargo.rareResources} seltene · ${fleet.cargo.influence} Einfluss`
                : 'keine'}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-col justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            aria-label="Schiffsleiste schließen"
            className="self-end text-xs font-mono text-slate-500 hover:text-slate-200 cursor-pointer"
          >
            ✕
          </button>
          {isRoutePlanning ? (
            <div
              data-route-planning-status
              className="flex flex-col items-end gap-1 rounded border border-red-800/70 bg-red-950/40 px-2 py-1"
            >
              <span className="text-[10px] font-mono text-red-200">
                Routenplanung aktiv – Zielsystem auswählen
              </span>
              {onCancelRoutePlanning && (
                <button
                  type="button"
                  onClick={onCancelRoutePlanning}
                  className="rounded border border-slate-600 px-2 py-1 text-[10px] font-mono text-slate-200 hover:bg-slate-800 cursor-pointer"
                >
                  Planung abbrechen
                </button>
              )}
            </div>
          ) : (
            <>
              {canPlanRoute && onStartRoutePlanning && (
                <button
                  type="button"
                  onClick={onStartRoutePlanning}
                  className="rounded border border-red-700/80 bg-red-950/60 px-2.5 py-1 text-[10px] font-mono text-red-100 hover:bg-red-900/70 cursor-pointer"
                >
                  Route planen
                </button>
              )}
              {pendingTargetName && onConfirmMove && (
                <div className="flex flex-col items-end gap-1">
                  <span className="text-[10px] font-mono text-amber-300">
                    Ziel: {pendingTargetName}
                    {pendingRouteHops !== undefined ? ` · ${pendingRouteHops} Sprünge` : ''}
                    {pendingRouteEtaTurns !== undefined
                      ? ` · ETA ${pendingRouteEtaTurns} ${pendingRouteEtaTurns === 1 ? 'Runde' : 'Runden'}`
                      : ''}
                  </span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={onConfirmMove}
                      className="rounded border border-amber-600/80 bg-amber-950/60 px-2 py-1 text-[10px] font-mono text-amber-100 hover:bg-amber-900/60 cursor-pointer"
                    >
                      Auftrag erteilen
                    </button>
                    {onClearTarget && (
                      <button
                        type="button"
                        onClick={onClearTarget}
                        className="rounded border border-slate-700 px-2 py-1 text-[10px] font-mono text-slate-300 hover:bg-slate-800 cursor-pointer"
                      >
                        Ziel aufheben
                      </button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
          {isMoving && onCancelMovement && (
            <button
              type="button"
              onClick={onCancelMovement}
              className="rounded border border-rose-700/70 bg-rose-950/60 px-2 py-1 text-[10px] font-mono text-rose-100 hover:bg-rose-900/60 cursor-pointer"
            >
              Flug abbrechen
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
