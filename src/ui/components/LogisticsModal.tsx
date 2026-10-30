/**
 * Astraea 4X - Logistics Modal (Module 4 / Phase 2)
 * Empire-wide freighter network: establishes, pauses and removes supply routes
 * between colonies and visualises per-turn capacity and stock levels.
 */

import React, { useMemo, useState } from 'react';
import {
  FREIGHTER_CAPACITY,
  LOGISTICS_RESERVE,
  LOGISTICS_TECH_ID,
  LOGISTICS_TARGET_STOCK,
  MAX_FREIGHTERS_PER_ROUTE,
} from '../../core/logisticsManager.ts';
import {
  GALACTIC_TRADE_RESOURCES,
  GALACTIC_TRADE_TECH_ID,
  MAX_TARIFF_RATE,
  TARIFF_CREDITS_PER_CARGO_UNIT,
} from '../../core/galacticTradeManager.ts';
import type { GalacticTradeCreateResult } from '../../core/galacticTradeManager.ts';
import {
  Colony,
  Fleet,
  FreighterFleet,
  GalacticTradeConvoy,
  GalacticTradeResource,
  GalacticTradeRoute,
  LogisticsRoute,
} from '../../core/types.ts';

interface LogisticsModalProps {
  isOpen: boolean;
  colonies: Colony[];
  routes: LogisticsRoute[];
  fleets: FreighterFleet[];
  galacticRoutes: GalacticTradeRoute[];
  galacticConvoys: GalacticTradeConvoy[];
  escortFleets: Fleet[];
  completedTechIds: string[];
  onClose: () => void;
  onCreateRoute: (
    sourceColonyId: string,
    targetColonyId: string,
    freighterCount: number
  ) => { allowed: boolean; reason?: string };
  onToggleRoute: (routeId: string, isActive: boolean) => void;
  onRemoveRoute: (routeId: string) => void;
  onCreateGalacticRoute: (
    sourceColonyId: string,
    targetColonyId: string,
    resource: GalacticTradeResource,
    freighterCount: number
  ) => GalacticTradeCreateResult;
  onToggleGalacticRoute: (routeId: string, isActive: boolean) => void;
  onRemoveGalacticRoute: (routeId: string) => void;
  onSetGalacticTariff: (routeId: string, tariffRate: number) => GalacticTradeCreateResult;
  onSetGalacticEscorts: (routeId: string, fleetIds: string[]) => GalacticTradeCreateResult;
  onChanged: () => void;
}

const RESOURCE_LABELS = {
  food: 'Nahrung',
  minerals: 'Mineralien',
  rareResources: 'Seltene Ressourcen',
} as const;

interface GalacticRouteAdminProps {
  route: GalacticTradeRoute;
  escortFleets: Fleet[];
  onSetGalacticTariff: (routeId: string, tariffRate: number) => GalacticTradeCreateResult;
  onSetGalacticEscorts: (routeId: string, fleetIds: string[]) => GalacticTradeCreateResult;
  onChanged: () => void;
}

const GalacticRouteAdmin: React.FC<GalacticRouteAdminProps> = ({
  route,
  escortFleets,
  onSetGalacticTariff,
  onSetGalacticEscorts,
  onChanged,
}) => {
  const [tariffInput, setTariffInput] = useState(String(route.tariffRate ?? 0));
  const [error, setError] = useState<string | null>(null);

  const escortIds = route.escortFleetIds ?? [];
  const stationedFleets = escortFleets.filter((fleet) => fleet.status === 'stationed');

  const applyTariff = () => {
    const result = onSetGalacticTariff(route.id, Number(tariffInput));
    if (!result.allowed) {
      setError(result.reason ?? 'Zoll konnte nicht gesetzt werden.');
      return;
    }
    setError(null);
    setTariffInput(String(result.route?.tariffRate ?? route.tariffRate ?? 0));
    onChanged();
  };

  const toggleEscort = (fleetId: string) => {
    const nextIds = escortIds.includes(fleetId)
      ? escortIds.filter((id) => id !== fleetId)
      : [...escortIds, fleetId];
    const result = onSetGalacticEscorts(route.id, nextIds);
    if (!result.allowed) {
      setError(result.reason ?? 'Eskorte konnte nicht zugewiesen werden.');
      return;
    }
    setError(null);
    onChanged();
  };

  return (
    <div className="mt-2 border-t border-slate-800/80 pt-2 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
        <span>Zoll</span>
        <input
          type="number"
          min={0}
          max={MAX_TARIFF_RATE}
          value={tariffInput}
          onChange={(e) => setTariffInput(e.target.value)}
          className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-200 tabular-nums"
        />
        <span>%</span>
        <button
          onClick={applyTariff}
          className="px-2 py-1 rounded border border-slate-700 hover:border-cyan-600 text-[11px] text-slate-300 cursor-pointer"
        >
          Übernehmen
        </button>
        <span className="font-mono text-[10px] text-slate-500">
          {((route.tariffRate ?? 0) * TARIFF_CREDITS_PER_CARGO_UNIT).toFixed(2)} Credits je Einheit
        </span>
      </div>
      {route.isBlockaded && (
        <div className="text-[11px] text-rose-300">
          ⛔ Blockiert
          {route.blockadedSystemIds?.length
            ? ` durch Feindkontakt in ${route.blockadedSystemIds.join(', ')}`
            : ''}
          {' '}– kein Verladen, ankommende Konvois warten.
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
        <span>Eskorte</span>
        {stationedFleets.length === 0 ? (
          <span className="text-slate-500 italic">Keine stationierten Flotten verfügbar.</span>
        ) : (
          stationedFleets.map((fleet) => (
            <label key={fleet.id} className="inline-flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={escortIds.includes(fleet.id)}
                onChange={() => toggleEscort(fleet.id)}
                className="accent-emerald-500"
              />
              <span className="text-slate-300">{fleet.name}</span>
              <span className="font-mono text-[10px] text-slate-500">{fleet.systemId}</span>
            </label>
          ))
        )}
      </div>
      {error && <div className="text-[11px] text-rose-300">{error}</div>}
    </div>
  );
};

export const LogisticsModal: React.FC<LogisticsModalProps> = ({
  isOpen,
  colonies,
  routes,
  fleets,
  galacticRoutes,
  galacticConvoys,
  escortFleets,
  completedTechIds,
  onClose,
  onCreateRoute,
  onToggleRoute,
  onRemoveRoute,
  onCreateGalacticRoute,
  onToggleGalacticRoute,
  onRemoveGalacticRoute,
  onSetGalacticTariff,
  onSetGalacticEscorts,
  onChanged,
}) => {
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [freighterCount, setFreighterCount] = useState(1);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [galacticSourceId, setGalacticSourceId] = useState('');
  const [galacticTargetId, setGalacticTargetId] = useState('');
  const [galacticResource, setGalacticResource] = useState<GalacticTradeResource>('food');
  const [galacticFreighterCount, setGalacticFreighterCount] = useState(1);
  const [galacticFeedback, setGalacticFeedback] = useState<{
    type: 'error' | 'success';
    text: string;
  } | null>(null);

  const hasTech = completedTechIds.includes(LOGISTICS_TECH_ID);
  const hasGalacticTech = completedTechIds.includes(GALACTIC_TRADE_TECH_ID);
  const colonyById = useMemo(() => new Map(colonies.map((c) => [c.id, c])), [colonies]);
  const activeRoutes = routes.filter((r) => r.isActive).length;
  const convoysByRoute = useMemo(() => {
    const map = new Map<string, GalacticTradeConvoy[]>();
    for (const convoy of galacticConvoys) {
      const list = map.get(convoy.routeId);
      if (list) list.push(convoy);
      else map.set(convoy.routeId, [convoy]);
    }
    return map;
  }, [galacticConvoys]);
  const fleetsByRoute = useMemo(() => {
    const map = new Map<string, FreighterFleet[]>();
    for (const fleet of fleets) {
      const list = map.get(fleet.routeId);
      if (list) list.push(fleet);
      else map.set(fleet.routeId, [fleet]);
    }
    return map;
  }, [fleets]);

  if (!isOpen) return null;

  const handleCreate = () => {
    if (!sourceId || !targetId) {
      setFeedback({ type: 'error', text: 'Bitte Quell- und Zielkolonie auswählen.' });
      return;
    }
    const result = onCreateRoute(sourceId, targetId, freighterCount);
    if (!result.allowed) {
      setFeedback({ type: 'error', text: result.reason || 'Route konnte nicht angelegt werden.' });
      return;
    }
    setFeedback({
      type: 'success',
      text: `Route ${colonyById.get(sourceId)?.name ?? sourceId} → ${colonyById.get(targetId)?.name ?? targetId} eingerichtet.`,
    });
    onChanged();
  };

  const handleCreateGalactic = () => {
    if (!galacticSourceId || !galacticTargetId) {
      setGalacticFeedback({
        type: 'error',
        text: 'Bitte Quell- und Zielkolonie auswählen.',
      });
      return;
    }
    const result = onCreateGalacticRoute(
      galacticSourceId,
      galacticTargetId,
      galacticResource,
      galacticFreighterCount
    );
    if (!result.allowed) {
      setGalacticFeedback({
        type: 'error',
        text: result.reason || 'Interstellare Route konnte nicht angelegt werden.',
      });
      return;
    }
    const hops = Math.max(0, (result.route?.pathSystemIds.length ?? 1) - 1);
    setGalacticFeedback({
      type: 'success',
      text: `Route ${colonyById.get(galacticSourceId)?.name ?? galacticSourceId} → ${
        colonyById.get(galacticTargetId)?.name ?? galacticTargetId
      } über ${hops} Hyperlane${hops === 1 ? '' : 'n'} eingerichtet.`,
    });
    onChanged();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm select-none">
      <div className="w-full max-w-4xl bg-slate-950 border border-slate-800 rounded-xl shadow-2xl p-6 font-sans max-h-[92vh] flex flex-col">
        <header className="flex items-start justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-slate-100 tracking-wide">🚚 Logistiknetzwerk</h2>
            <p className="text-xs text-slate-400 mt-1">
              Frachter verteilen Überschüsse automatisch an Kolonien mit Bedarf. Reserven bleiben
              unangetastet.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100 text-sm px-2 py-1 rounded border border-slate-800 hover:border-slate-700 cursor-pointer"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto py-4 space-y-6 pr-1">
          {!hasTech && (
            <div className="text-xs text-amber-300 bg-amber-950/40 border border-amber-800/60 rounded p-3">
              Für Logistikrouten wird die Technologie „Planetare Logistikvorbereitung“ benötigt.
            </div>
          )}

          {feedback && (
            <div
              className={`text-xs rounded p-3 border ${
                feedback.type === 'error'
                  ? 'text-rose-300 bg-rose-950/40 border-rose-800/60'
                  : 'text-emerald-300 bg-emerald-950/40 border-emerald-800/60'
              }`}
            >
              {feedback.text}
            </div>
          )}

          <section>
            <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-2">
              Neue Route einrichten
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
              <label className="text-xs text-slate-400 flex flex-col gap-1">
                Quellkolonie
                <select
                  value={sourceId}
                  onChange={(e) => setSourceId(e.target.value)}
                  disabled={!hasTech}
                  className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 disabled:opacity-50"
                >
                  <option value="">— auswählen —</option>
                  {colonies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-400 flex flex-col gap-1">
                Zielkolonie
                <select
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  disabled={!hasTech}
                  className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 disabled:opacity-50"
                >
                  <option value="">— auswählen —</option>
                  {colonies
                    .filter((c) => c.id !== sourceId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="text-xs text-slate-400 flex flex-col gap-1">
                Frachter (1–{MAX_FREIGHTERS_PER_ROUTE})
                <input
                  type="number"
                  min={1}
                  max={MAX_FREIGHTERS_PER_ROUTE}
                  value={freighterCount}
                  onChange={(e) =>
                    setFreighterCount(
                      Math.max(1, Math.min(MAX_FREIGHTERS_PER_ROUTE, Number(e.target.value) || 1))
                    )
                  }
                  disabled={!hasTech}
                  className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 disabled:opacity-50 tabular-nums"
                />
              </label>
              <button
                onClick={handleCreate}
                disabled={!hasTech || colonies.length < 2}
                className="px-3 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 text-xs font-semibold uppercase tracking-wider rounded cursor-pointer disabled:cursor-not-allowed"
              >
                Route anlegen
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              Kapazität: {freighterCount * FREIGHTER_CAPACITY} Einheiten pro Runde · Reserve der
              Quelle: {LOGISTICS_RESERVE.food} Nahrung / {LOGISTICS_RESERVE.minerals} Mineralien /{' '}
              {LOGISTICS_RESERVE.rareResources} Seltene · Zielbestand: {LOGISTICS_TARGET_STOCK.food} /{' '}
              {LOGISTICS_TARGET_STOCK.minerals} / {LOGISTICS_TARGET_STOCK.rareResources}
            </p>
          </section>

          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400">
                Aktive Verbindungen
              </h3>
              <span className="text-[11px] font-mono text-slate-500">
                {activeRoutes} / {routes.length} aktiv
              </span>
            </div>

            {routes.length === 0 ? (
              <p className="text-xs text-slate-500 italic">Noch keine Logistikrouten eingerichtet.</p>
            ) : (
              <ul className="space-y-2">
                {routes.map((route) => {
                  const source = colonyById.get(route.sourceColonyId);
                  const target = colonyById.get(route.targetColonyId);
                  const routeFleets = fleetsByRoute.get(route.id) ?? [];
                  const outbound = routeFleets.filter((fleet) => fleet.status === 'outbound').length;
                  const inbound = routeFleets.filter((fleet) => fleet.status === 'inbound').length;
                  const loading = routeFleets.filter((fleet) => fleet.status === 'loading').length;
                  const cargoInTransit = routeFleets
                    .filter((fleet) => fleet.status === 'outbound')
                    .reduce(
                      (sum, fleet) =>
                        sum + fleet.cargo.food + fleet.cargo.minerals + fleet.cargo.rareResources,
                      0
                    );
                  return (
                    <li
                      key={route.id}
                      className={`rounded border p-3 text-xs ${
                        route.isActive
                          ? 'border-slate-700 bg-slate-900/70'
                          : 'border-slate-800 bg-slate-950/60 opacity-70'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-200">
                            {source?.name ?? route.sourceColonyId}
                          </span>
                          <span className="text-cyan-400">→</span>
                          <span className="font-semibold text-slate-200">
                            {target?.name ?? route.targetColonyId}
                          </span>
                          <span className="font-mono text-[10px] text-slate-500">
                            {route.freighterCount} Frachter · {route.capacityPerTurn}/Runde
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              onToggleRoute(route.id, !route.isActive);
                              onChanged();
                            }}
                            className="px-2 py-1 rounded border border-slate-700 hover:border-cyan-600 text-[11px] text-slate-300 cursor-pointer"
                          >
                            {route.isActive ? 'Pausieren' : 'Aktivieren'}
                          </button>
                          <button
                            onClick={() => {
                              onRemoveRoute(route.id);
                              onChanged();
                            }}
                            className="px-2 py-1 rounded border border-slate-700 hover:border-rose-600 text-[11px] text-rose-300 cursor-pointer"
                          >
                            Entfernen
                          </button>
                        </div>
                      </div>
                      {routeFleets.length > 0 && (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 font-mono text-[10px] text-slate-500">
                          <span>Frachter: {routeFleets.length}</span>
                          <span className="text-cyan-400/80">unterwegs: {outbound}</span>
                          <span className="text-emerald-400/80">Rückflug: {inbound}</span>
                          <span className="text-slate-400">im Hafen: {loading}</span>
                          <span>Fracht unterwegs: {cargoInTransit}</span>
                        </div>
                      )}
                      {source && target && (
                        <div className="grid grid-cols-3 gap-2 mt-2 font-mono text-[10px] text-slate-400">
                          {(['food', 'minerals', 'rareResources'] as const).map((res) => (
                            <div key={res} className="bg-slate-950/60 rounded px-2 py-1 border border-slate-800">
                              <div className="text-slate-500">{RESOURCE_LABELS[res]}</div>
                              <div>
                                {Math.round(source.stockpile[res])} → {Math.round(target.stockpile[res])}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="border-t border-slate-800 pt-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400">
                Interstellare Handelsrouten
              </h3>
              <span className="text-[11px] font-mono text-slate-500">
                {galacticRoutes.filter((r) => r.isActive).length} / {galacticRoutes.length} aktiv
              </span>
            </div>

            {!hasGalacticTech && (
              <div className="text-xs text-amber-300 bg-amber-950/40 border border-amber-800/60 rounded p-3 mb-3">
                Für interstellare Routen wird die Technologie „Interstellares Frachtnetzwerk“
                benötigt. Konvois nutzen den kürzesten Hyperlane-Pfad und bewegen sich pro Runde
                über eine Hyperlane.
              </div>
            )}

            {galacticFeedback && (
              <div
                className={`text-xs rounded p-3 border mb-3 ${
                  galacticFeedback.type === 'error'
                    ? 'text-rose-300 bg-rose-950/40 border-rose-800/60'
                    : 'text-emerald-300 bg-emerald-950/40 border-emerald-800/60'
                }`}
              >
                {galacticFeedback.text}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
              <label className="text-xs text-slate-400 flex flex-col gap-1">
                Quellkolonie
                <select
                  value={galacticSourceId}
                  onChange={(e) => setGalacticSourceId(e.target.value)}
                  disabled={!hasGalacticTech}
                  className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 disabled:opacity-50"
                >
                  <option value="">— auswählen —</option>
                  {colonies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-400 flex flex-col gap-1">
                Zielkolonie
                <select
                  value={galacticTargetId}
                  onChange={(e) => setGalacticTargetId(e.target.value)}
                  disabled={!hasGalacticTech}
                  className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 disabled:opacity-50"
                >
                  <option value="">— auswählen —</option>
                  {colonies
                    .filter((c) => c.id !== galacticSourceId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="text-xs text-slate-400 flex flex-col gap-1">
                Ressource
                <select
                  value={galacticResource}
                  onChange={(e) => setGalacticResource(e.target.value as GalacticTradeResource)}
                  disabled={!hasGalacticTech}
                  className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 disabled:opacity-50"
                >
                  {GALACTIC_TRADE_RESOURCES.map((res) => (
                    <option key={res} value={res}>
                      {RESOURCE_LABELS[res]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-400 flex flex-col gap-1">
                Frachter (1–{MAX_FREIGHTERS_PER_ROUTE})
                <input
                  type="number"
                  min={1}
                  max={MAX_FREIGHTERS_PER_ROUTE}
                  value={galacticFreighterCount}
                  onChange={(e) =>
                    setGalacticFreighterCount(
                      Math.max(1, Math.min(MAX_FREIGHTERS_PER_ROUTE, Number(e.target.value) || 1))
                    )
                  }
                  disabled={!hasGalacticTech}
                  className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 disabled:opacity-50 tabular-nums"
                />
              </label>
              <button
                onClick={handleCreateGalactic}
                disabled={!hasGalacticTech || colonies.length < 2}
                className="px-3 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 text-xs font-semibold uppercase tracking-wider rounded cursor-pointer disabled:cursor-not-allowed"
              >
                Route anlegen
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              Kapazität: {galacticFreighterCount * FREIGHTER_CAPACITY} Einheiten pro Runde · Ein
              Konvoi pro Route, ein Hyperlane-Hop pro Runde · Reserven wie bei lokaler Logistik.
            </p>

            {galacticRoutes.length === 0 ? (
              <p className="text-xs text-slate-500 italic mt-3">
                Noch keine interstellaren Handelsrouten eingerichtet.
              </p>
            ) : (
              <ul className="space-y-2 mt-3">
                {galacticRoutes.map((route) => {
                  const source = colonyById.get(route.sourceColonyId);
                  const target = colonyById.get(route.targetColonyId);
                  const convoys = convoysByRoute.get(route.id) ?? [];
                  const hops = Math.max(1, route.pathSystemIds.length - 1);
                  return (
                    <li
                      key={route.id}
                      className={`rounded border p-3 text-xs ${
                        route.isActive
                          ? 'border-slate-700 bg-slate-900/70'
                          : 'border-slate-800 bg-slate-950/60 opacity-70'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-slate-200">
                            {source?.name ?? route.sourceColonyId}
                          </span>
                          <span className="text-violet-400">→</span>
                          <span className="font-semibold text-slate-200">
                            {target?.name ?? route.targetColonyId}
                          </span>
                          <span className="rounded border border-violet-900/60 bg-violet-950/40 px-1.5 py-0.5 text-[10px] text-violet-300">
                            {RESOURCE_LABELS[route.resource]}
                          </span>
                          <span className="font-mono text-[10px] text-slate-500">
                            {route.freighterCount} Frachter · {route.capacityPerTurn}/Runde · {hops}{' '}
                            Hyperlane{hops === 1 ? '' : 'n'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              onToggleGalacticRoute(route.id, !route.isActive);
                              onChanged();
                            }}
                            className="px-2 py-1 rounded border border-slate-700 hover:border-violet-600 text-[11px] text-slate-300 cursor-pointer"
                          >
                            {route.isActive ? 'Pausieren' : 'Aktivieren'}
                          </button>
                          <button
                            onClick={() => {
                              onRemoveGalacticRoute(route.id);
                              onChanged();
                            }}
                            className="px-2 py-1 rounded border border-slate-700 hover:border-rose-600 text-[11px] text-rose-300 cursor-pointer"
                          >
                            Entfernen
                          </button>
                        </div>
                      </div>
                      <GalacticRouteAdmin
                        route={route}
                        escortFleets={escortFleets}
                        onSetGalacticTariff={onSetGalacticTariff}
                        onSetGalacticEscorts={onSetGalacticEscorts}
                        onChanged={onChanged}
                      />
                      {convoys.length === 0 ? (
                        <div className="mt-2 font-mono text-[10px] text-slate-500">
                          Kein Konvoi unterwegs.
                        </div>
                      ) : (
                        convoys.map((convoy) => {
                          const cargo =
                            convoy.cargo.food + convoy.cargo.minerals + convoy.cargo.rareResources;
                          const statusLabel =
                            convoy.status === 'loading'
                              ? 'im Hafen'
                              : convoy.status === 'outbound'
                                ? 'im Anflug'
                                : 'Rückflug';
                          return (
                            <div
                              key={convoy.id}
                              className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 font-mono text-[10px] text-slate-500"
                            >
                              <span
                                className={
                                  convoy.status === 'outbound'
                                    ? 'text-violet-300'
                                    : convoy.status === 'inbound'
                                      ? 'text-emerald-400/80'
                                      : 'text-slate-400'
                                }
                              >
                                Konvoi: {statusLabel}
                              </span>
                              <span className="tabular-nums">
                                Position {convoy.pathIndex} / {hops}
                              </span>
                              <span>Kapazität: {convoy.capacity}</span>
                              <span>Fracht: {cargo}</span>
                            </div>
                          );
                        })
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
