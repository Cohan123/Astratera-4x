/**
 * Astraea 4X - Fleet Modal (Phase 4)
 * Colonial shipyards: queues hull construction, shows accumulated shipyard
 * production and parallel dock occupancy, and lets the player redirect
 * stationed fleets along hyperlanes.
 */

import React, { useMemo, useState } from 'react';
import { getBuildableShipDefs, getShipDef } from '../../data/shipCatalog.ts';
import {
  FleetManager,
  SHIPYARD_POPULATION_PER_SLIP,
  SHIPYARD_PRODUCTION_SHARE,
  SHIPYARD_REQUIRED_TIER,
  getShipyardCapacity,
} from '../../core/fleetManager.ts';
import type {
  Civilization,
  Colony,
  Fleet,
  FleetBattleReport,
  ShipBuildOrder,
  StarSystem,
} from '../../core/types.ts';

interface FleetModalProps {
  isOpen: boolean;
  fleets: Fleet[];
  orders: ShipBuildOrder[];
  battleReports: FleetBattleReport[];
  civs: Civilization[];
  colonies: Colony[];
  systems: StarSystem[];
  completedTechIds: string[];
  onClose: () => void;
  onBuildShip: (colonyId: string, shipDefId: string) => { allowed: boolean; reason?: string };
  onCancelOrder: (orderId: string) => boolean;
  onMoveFleet: (
    fleetId: string,
    destinationSystemId: string
  ) => { allowed: boolean; reason?: string };
  onChanged: () => void;
}

const BUILDABLE_SHIPS = getBuildableShipDefs();
const SHIP_IDS = BUILDABLE_SHIPS.map((def) => def.id);

const STATUS_LABELS: Record<Fleet['status'], string> = {
  stationed: 'stationiert',
  moving: 'im Flug',
};

export const FleetModal: React.FC<FleetModalProps> = ({
  isOpen,
  fleets,
  orders,
  battleReports,
  civs,
  colonies,
  systems,
  completedTechIds,
  onClose,
  onBuildShip,
  onCancelOrder,
  onMoveFleet,
  onChanged,
}) => {
  const [colonyId, setColonyId] = useState('');
  const [shipDefId, setShipDefId] = useState(SHIP_IDS[0] ?? '');
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(
    null
  );
  const [destinations, setDestinations] = useState<Record<string, string>>({});

  const systemById = useMemo(() => new Map(systems.map((system) => [system.id, system])), [systems]);
  const colonyById = useMemo(() => new Map(colonies.map((colony) => [colony.id, colony])), [colonies]);
  const civById = useMemo(() => new Map(civs.map((civ) => [civ.id, civ])), [civs]);
  const shipyards = colonies.filter((colony) => colony.developmentTier === SHIPYARD_REQUIRED_TIER);

  if (!isOpen) return null;

  const selectedColony = colonyId ? colonyById.get(colonyId) ?? null : null;
  const selectedShip = getShipDef(shipDefId);
  const shipyardOutput = selectedColony
    ? Math.max(
        1,
        Math.floor(
          Math.max(0, selectedColony.netYields?.production ?? 0) * SHIPYARD_PRODUCTION_SHARE
        )
      )
    : 0;
  const shipyardCapacity = getShipyardCapacity(selectedColony);
  const selectedOrderCount = selectedColony
    ? orders.filter((order) => order.colonyId === selectedColony.id).length
    : 0;
  const activeSlipOrderIds = new Set<string>();
  const occupiedSlips = new Map<string, number>();
  for (const order of orders) {
    const colony = colonyById.get(order.colonyId);
    const capacity = getShipyardCapacity(colony ?? null);
    const occupied = occupiedSlips.get(order.colonyId) ?? 0;
    if (colony && occupied < capacity) {
      activeSlipOrderIds.add(order.id);
      occupiedSlips.set(order.colonyId, occupied + 1);
    }
  }

  const handleBuild = () => {
    if (!colonyId) {
      setFeedback({ type: 'error', text: 'Bitte eine Werftkolonie auswählen.' });
      return;
    }
    const result = onBuildShip(colonyId, shipDefId);
    if (!result.allowed) {
      setFeedback({ type: 'error', text: result.reason || 'Schiff konnte nicht in Auftrag gegeben werden.' });
      return;
    }
    setFeedback({
      type: 'success',
      text: `${getShipDef(shipDefId)?.name ?? shipDefId} in ${
        colonyById.get(colonyId)?.name ?? colonyId
      } in Auftrag gegeben.`,
    });
    onChanged();
  };

  const handleMove = (fleet: Fleet) => {
    const destinationSystemId = destinations[fleet.id];
    if (!destinationSystemId) {
      setFeedback({ type: 'error', text: 'Bitte ein Zielsystem auswählen.' });
      return;
    }
    const result = onMoveFleet(fleet.id, destinationSystemId);
    if (!result.allowed) {
      setFeedback({ type: 'error', text: result.reason || 'Flottenbefehl abgelehnt.' });
      return;
    }
    setFeedback({
      type: 'success',
      text: `${fleet.name} fliegt nach ${
        systemById.get(destinationSystemId)?.name ?? destinationSystemId
      }.`,
    });
    setDestinations((current) => ({ ...current, [fleet.id]: '' }));
    onChanged();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm select-none">
      <div className="w-full max-w-4xl bg-slate-950 border border-slate-800 rounded-xl shadow-2xl p-6 font-sans max-h-[92vh] flex flex-col">
        <header className="flex items-start justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-slate-100 tracking-wide">🛠️ Werften &amp; Flotten</h2>
            <p className="text-xs text-slate-400 mt-1">
              Jedes Werftdock erhält pro Runde die Hälfte der Industrieproduktion seiner Kolonie.
              Eine volle Kolonie betreibt ein Dock, je{' '}
              {SHIPYARD_POPULATION_PER_SLIP.toLocaleString('de-DE')} weitere Kolonisten kommt eines
              hinzu (maximal vier). Flotten bewegen sich eine Hyperlane pro Runde.
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
              Schiff in Auftrag geben
            </h3>
            {shipyards.length === 0 ? (
              <div className="text-xs text-amber-300 bg-amber-950/40 border border-amber-800/60 rounded p-3">
                Es gibt noch keine Kolonie mit Werft. Siedlungen müssen zuerst zur vollen Kolonie
                ausgebaut werden.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                  <label className="text-xs text-slate-400 flex flex-col gap-1">
                    Werftkolonie
                    <select
                      value={colonyId}
                      onChange={(e) => setColonyId(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200"
                    >
                      <option value="">— auswählen —</option>
                      {shipyards.map((colony) => (
                        <option key={colony.id} value={colony.id}>
                          {colony.name} · {systemById.get(colony.systemId)?.name ?? colony.systemId} ·{' '}
                          {getShipyardCapacity(colony)} Docks
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-slate-400 flex flex-col gap-1">
                    Schiffsmuster
                    <select
                      value={shipDefId}
                      onChange={(e) => setShipDefId(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200"
                    >
                      {SHIP_IDS.map((id) => {
                        const def = getShipDef(id);
                        if (!def) return null;
                        return (
                          <option key={id} value={id}>
                            {def.name}
                            {completedTechIds.includes(def.requiredTechId) ? '' : ' (gesperrt)'}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                  <div className="text-[11px] leading-snug text-slate-500">
                    {selectedShip
                      ? `Kosten: ${selectedShip.productionCost} Produktion · ${selectedShip.mineralCost} Mineralien · ${selectedShip.rareCost} Seltene`
                      : 'Kein Muster ausgewählt.'}
                    <br />
                    {selectedShip &&
                      `Hülle ${selectedShip.hull} · Angriff ${selectedShip.attack} · Verteidigung ${selectedShip.defense}`}
                  </div>
                  <button
                    onClick={handleBuild}
                    disabled={shipyards.length === 0}
                    className="px-3 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 text-xs font-semibold uppercase tracking-wider rounded cursor-pointer disabled:cursor-not-allowed"
                  >
                    Bauen
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-2">
                  {selectedShip && `Technologie: ${selectedShip.requiredTechId}`}
                  {selectedColony && ` · Werftleistung: ${shipyardOutput} Produktion pro Dock`}
                  {selectedColony &&
                    ` · Docks: ${Math.min(selectedOrderCount, shipyardCapacity)}/${shipyardCapacity} belegt`}
                  {selectedShip &&
                    selectedColony &&
                    ` · Bauzeit: ${Math.ceil(
                      selectedShip.productionCost / Math.max(1, shipyardOutput)
                    )} Runden`}
                </p>
              </>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400">
                Bauaufträge
              </h3>
              <span className="text-[11px] font-mono text-slate-500">{orders.length} aktiv</span>
            </div>
            {orders.length === 0 ? (
              <p className="text-xs text-slate-500 italic">Keine Schiffe in Bau.</p>
            ) : (
              <ul className="space-y-2">
                {orders.map((order) => {
                  const def = getShipDef(order.shipDefId);
                  const colony = colonyById.get(order.colonyId);
                  const progress = Math.min(
                    100,
                    Math.round((order.investedProduction / Math.max(1, order.requiredProduction)) * 100)
                  );
                  return (
                    <li
                      key={order.id}
                      className="rounded border border-slate-700 bg-slate-900/70 p-3 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-slate-200">
                            {def?.name ?? order.shipDefId}
                          </span>
                          <span className="text-slate-500">
                            in {colony?.name ?? order.colonyId}
                          </span>
                          <span className="font-mono text-[10px] text-slate-500">
                            {order.investedProduction} / {order.requiredProduction} Produktion · seit
                            Runde {order.turnStarted}
                          </span>
                          <span
                            className={`rounded px-1.5 py-0.5 font-mono text-[10px] border ${
                              activeSlipOrderIds.has(order.id)
                                ? 'bg-cyan-950/60 text-cyan-300 border-cyan-800/60'
                                : 'bg-slate-800/60 text-slate-400 border-slate-700'
                            }`}
                          >
                            {activeSlipOrderIds.has(order.id) ? 'Dock aktiv' : 'wartet auf Dock'}
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            if (onCancelOrder(order.id)) {
                              setFeedback({
                                type: 'success',
                                text: 'Bauauftrag abgebrochen. Mineralien und seltene Ressourcen bleiben verbraucht.',
                              });
                              onChanged();
                            } else {
                              setFeedback({
                                type: 'error',
                                text: 'Bauauftrag konnte nicht abgebrochen werden.',
                              });
                            }
                          }}
                          className="px-2 py-1 rounded border border-slate-700 hover:border-rose-600 text-[11px] text-rose-300 cursor-pointer"
                        >
                          Abbrechen
                        </button>
                      </div>
                      <div className="mt-2 h-1.5 w-full bg-slate-800 rounded overflow-hidden">
                        <div
                          className="h-full bg-cyan-500/80"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="border-t border-slate-800 pt-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400">
                Flotten
              </h3>
              <span className="text-[11px] font-mono text-slate-500">
                {fleets.length} Verbände · Unterhalt{' '}
                {fleets.reduce((sum, fleet) => sum + FleetManager.calculateFleetUpkeep(fleet), 0)} E/Rd.
              </span>
            </div>
            {fleets.length === 0 ? (
              <p className="text-xs text-slate-500 italic">
                Noch keine Flotten. Fertiggestellte Schiffe sammeln sich im System ihrer Werft.
              </p>
            ) : (
              <ul className="space-y-2">
                {fleets.map((fleet) => {
                  const totals = fleet.ships.reduce(
                    (sum, stack) => {
                      const def = getShipDef(stack.shipDefId);
                      if (!def) return sum;
                      return {
                        hull: sum.hull + def.hull * stack.count,
                        attack: sum.attack + def.attack * stack.count,
                        defense: sum.defense + def.defense * stack.count,
                      };
                    },
                    { hull: 0, attack: 0, defense: 0 }
                  );
                  const upkeep = FleetManager.calculateFleetUpkeep(fleet);
                  const currentSystem = systemById.get(fleet.systemId);
                  const destinationSystem = fleet.destinationSystemId
                    ? systemById.get(fleet.destinationSystemId)
                    : null;
                  return (
                    <li
                      key={fleet.id}
                      className={`rounded border p-3 text-xs ${
                        fleet.status === 'moving'
                          ? 'border-cyan-900/60 bg-cyan-950/20'
                          : 'border-slate-700 bg-slate-900/70'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-slate-200">{fleet.name}</span>
                          <span className="rounded border border-slate-700 bg-slate-950/60 px-1.5 py-0.5 text-[10px] text-slate-400">
                            {STATUS_LABELS[fleet.status]}
                          </span>
                          <span className="text-slate-500">
                            {currentSystem?.name ?? fleet.systemId}
                            {destinationSystem ? ` → ${destinationSystem.name}` : ''}
                          </span>
                        </div>
                        <span className="font-mono text-[10px] text-slate-500">
                          Hülle {totals.hull} · Angriff {totals.attack} · Verteidigung {totals.defense}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 font-mono text-[10px] text-slate-500">
                        {fleet.ships.length === 0 ? (
                          <span>Keine Schiffe</span>
                        ) : (
                          fleet.ships.map((stack) => (
                            <span key={stack.shipDefId}>
                              {getShipDef(stack.shipDefId)?.name ?? stack.shipDefId}:{' '}
                              {stack.count}
                            </span>
                          ))
                        )}
                        <span className="text-amber-400/80">{upkeep} E Unterhalt/Rd.</span>
                        {fleet.cargo && (
                          <span className="text-cyan-300">
                            Fracht: {fleet.cargo.colonists} Kolonisten · {fleet.cargo.food} Nahrung ·{' '}
                            {fleet.cargo.minerals} Mineralien · {fleet.cargo.rareResources} Seltene ·{' '}
                            {fleet.cargo.influence} Einfluss
                          </span>
                        )}
                        {fleet.status === 'moving' && (
                          <span className="text-cyan-300">
                            Position {fleet.pathIndex} / {Math.max(0, fleet.pathSystemIds.length - 1)}
                          </span>
                        )}
                      </div>

                      {fleet.status === 'stationed' && (
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <select
                            value={destinations[fleet.id] ?? ''}
                            onChange={(e) =>
                              setDestinations((current) => ({
                                ...current,
                                [fleet.id]: e.target.value,
                              }))
                            }
                            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-200"
                          >
                            <option value="">— Zielsystem —</option>
                            {systems
                              .filter((system) => system.id !== fleet.systemId)
                              .map((system) => (
                                <option key={system.id} value={system.id}>
                                  {system.name}
                                </option>
                              ))}
                          </select>
                          <button
                            onClick={() => handleMove(fleet)}
                            className="px-2 py-1 rounded border border-slate-700 hover:border-cyan-600 text-[11px] text-slate-300 cursor-pointer"
                          >
                            Entsenden
                          </button>
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
                Kampfberichte
              </h3>
              <span className="text-[11px] font-mono text-slate-500">
                {battleReports.length} gemeldet
              </span>
            </div>
            {battleReports.length === 0 ? (
              <p className="text-xs text-slate-500 italic">
                Keine Gefechte. Treffen Flotten verschiedener Zivilisationen im selben System
                aufeinander, wird am Rundenende gekämpft.
              </p>
            ) : (
              <>
                <ul className="space-y-2">
                  {[...battleReports].reverse().map((report) => {
                    const system = systemById.get(report.systemId);
                    const winner = report.winnerCivId
                      ? civById.get(report.winnerCivId) ?? null
                      : null;
                    return (
                      <li
                        key={report.id}
                        className="rounded border border-rose-900/50 bg-rose-950/10 p-3 text-xs"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-slate-200">
                              ⚔️ {system?.name ?? report.systemId}
                            </span>
                            <span className="font-mono text-[10px] text-slate-500">
                              Runde {report.turn} · {report.rounds} Gefechtsrunden
                            </span>
                          </div>
                          <span
                            className={`text-[11px] ${winner ? '' : 'text-amber-300'}`}
                            style={winner ? { color: winner.color } : undefined}
                          >
                            {winner ? `Sieg: ${winner.name}` : 'Beide Seiten zerstört'}
                          </span>
                        </div>
                        <div className="mt-2 grid gap-1">
                          {report.sides.map((side) => {
                            const civ = civById.get(side.civId);
                            const losses = side.losses
                              .map(
                                (stack) =>
                                  `${stack.count}× ${
                                    getShipDef(stack.shipDefId)?.name ?? stack.shipDefId
                                  }`
                              )
                              .join(', ');
                            return (
                              <div
                                key={side.civId}
                                className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] text-slate-500"
                              >
                                <span style={{ color: civ?.color ?? '#94a3b8' }}>
                                  {civ?.name ?? side.civId}
                                </span>
                                <span>
                                  {side.shipsBefore} → {side.shipsAfter} Schiffe
                                </span>
                                {losses ? (
                                  <span className="text-rose-300/90">Verluste: {losses}</span>
                                ) : (
                                  <span className="text-emerald-300/80">keine Verluste</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <p className="text-[11px] text-slate-500 mt-2">
                  Kampfberichte gelten nur für die laufende Sitzung und werden nicht gespeichert.
                </p>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
