/**
 * Astraea 4X - Planetenübersicht (Besiedelte Planeten & Kolonien)
 * Comprehensive overview modal displaying all colonized worlds in the empire.
 * Provides direct access to enter each planet's hexagonal surface canvas,
 * review economic balances, workforce, and current construction progress.
 */

import React from 'react';
import { Colony, Galaxy, Planet, StarSystem } from '../../core/types.ts';
import { BUILDING_CATALOG } from '../../data/buildingCatalog.ts';
import { COLONY_TIER_LABELS } from '../../core/colonyManager.ts';
import { HABITABILITY_LABELS, PLANET_CATALOG } from '../../data/planetCatalog.ts';
import { CORE_RESOURCES } from '../../data/resourceCatalog.ts';
import {
  PRIVATE_SECTOR_RESERVE,
  PRIVATE_SECTOR_TARGET_STOCK,
  PRIVATE_SECTOR_TAX_RATE,
  PrivateSectorCivReport,
  PrivateSectorManager,
} from '../../core/privateSectorManager.ts';

interface PlanetsOverviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  colonies: Colony[];
  galaxy: Galaxy;
  onEnterSurface: (planetId: string, systemId: string) => void;
  onOpenColonyManagement?: (colonyId: string) => void;
  onOpenSystem?: (systemId: string) => void;
  /** Bericht des Privatsektors aus der letzten Runde (optional, abgeleitet). */
  privateSector?: PrivateSectorCivReport | null;
}

export const PlanetsOverviewModal: React.FC<PlanetsOverviewModalProps> = ({
  isOpen,
  onClose,
  colonies,
  galaxy,
  onEnterSurface,
  onOpenColonyManagement,
  onOpenSystem,
  privateSector,
}) => {
  if (!isOpen) return null;

  // Aggregate empire-wide statistics from all colonies
  const totalPopulation = colonies.reduce((sum, c) => sum + (c.population || 1000), 0);
  const totalWorkers = colonies.reduce(
    (sum, c) => sum + (c.population >= 100 ? Math.max(1, Math.floor(c.population / 1000)) : c.population),
    0
  );

  const aggregateYields = colonies.reduce(
    (acc, c) => {
      acc.food += c.netYields.food || 0;
      acc.production += c.netYields.production || 0;
      acc.energy += c.netYields.energy || 0;
      acc.minerals += c.netYields.minerals || 0;
      acc.rareResources += c.netYields.rareResources || 0;
      acc.research += c.netYields.research || 0;
      acc.influence += c.netYields.influence || 0;
      return acc;
    },
    { food: 0, production: 0, energy: 0, minerals: 0, rareResources: 0, research: 0, influence: 0 }
  );

  // Privatsektor: live aus Steuersatz, Stufe und Bevölkerung abgeleitet.
  const roundTo1 = (value: number) => Math.round(value * 10) / 10;
  const privateSectorVolume = roundTo1(
    colonies.reduce((sum, c) => sum + PrivateSectorManager.calculateCommerceVolume(c), 0)
  );
  const privateSectorTax = roundTo1(
    colonies.reduce(
      (sum, c) =>
        sum +
        PrivateSectorManager.calculateCommerceTax(
          PrivateSectorManager.calculateCommerceVolume(c)
        ),
      0
    )
  );
  const privateSectorCapacity = colonies.reduce(
    (sum, c) => sum + PrivateSectorManager.calculateCapacity(c),
    0
  );
  const privateSectorDelivered = privateSector?.delivered.food ?? 0;
  const privateSectorDeliveredMinerals = privateSector?.delivered.minerals ?? 0;
  const privateSectorDeliveredRare = privateSector?.delivered.rareResources ?? 0;

  // Helper to find planet and system for a colony
  const getColonyContext = (
    colony: Colony
  ): { planet: Planet | null; system: StarSystem | null } => {
    for (const sys of galaxy.systems) {
      if (sys.planets) {
        const foundPlanet = sys.planets.find((p) => p.id === colony.planetId);
        if (foundPlanet) {
          return { planet: foundPlanet, system: sys };
        }
      }
    }
    return { planet: null, system: null };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md select-none animate-fade-in">
      <div className="w-full max-w-5xl bg-slate-950 border border-slate-800 rounded-xl shadow-2xl p-6 font-sans max-h-[92vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest font-semibold">
                Imperiale Kolonialverwaltung
              </span>
            </div>
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2 mt-0.5">
              <span>🪐 Planetenübersicht</span>
              <span className="text-xs font-mono font-normal text-emerald-400 px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/80">
                {colonies.length} {colonies.length === 1 ? 'besiedelte Welt' : 'besiedelte Welten'}
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Alle etablierten Kolonien und Planeten des Imperiums mit Status, Erträgen und Direktzugang zur Planetenoberfläche.
            </p>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 w-8 h-8 rounded flex items-center justify-center font-mono cursor-pointer transition-colors hover:bg-slate-800/60"
            title="Schließen"
          >
            ✕
          </button>
        </div>

        {/* Global Empire Aggregation Ribbon */}
        {colonies.length > 0 && (
          <div className="my-4 p-3 bg-slate-900/60 border border-slate-800/90 rounded-lg flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
            <div className="flex items-center gap-4">
              <div>
                <span className="text-slate-500 block text-[10px]">GESAMTBEVÖLKERUNG</span>
                <span className="text-slate-200 font-bold tabular-nums">
                  {totalPopulation.toLocaleString()} ({totalWorkers} {totalWorkers === 1 ? 'Arbeitskraft' : 'Arbeitskräfte'})
                </span>
              </div>
              <div className="h-6 w-px bg-slate-800" />
              <div>
                <span className="text-slate-500 block text-[10px]">KOLONIEN</span>
                <span className="text-emerald-300 font-bold tabular-nums">{colonies.length} Aktiv</span>
              </div>
            </div>

            {/* Yields Summary */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] text-slate-500 uppercase mr-1">Rundengewinn:</span>
              <span className={`px-2 py-0.5 rounded bg-slate-950 border border-slate-800 ${aggregateYields.food >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                🍏 {aggregateYields.food >= 0 ? `+${aggregateYields.food}` : aggregateYields.food}
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-amber-400">
                ⚙️ +{aggregateYields.production}
              </span>
              <span className={`px-2 py-0.5 rounded bg-slate-950 border border-slate-800 ${aggregateYields.energy >= 0 ? 'text-sky-400' : 'text-rose-400'}`}>
                ⚡ {aggregateYields.energy >= 0 ? `+${aggregateYields.energy}` : aggregateYields.energy}
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-200">
                💎 +{aggregateYields.minerals}
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-purple-400">
                🔮 +{aggregateYields.rareResources}
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-cyan-400">
                🔬 +{aggregateYields.research}
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-indigo-400">
                🏛️ +{aggregateYields.influence}
              </span>
            </div>
          </div>
        )}

        {/* Privatsektor: zivile Wirtschaft des Imperiums */}
        {colonies.length > 0 && (
          <div className="mb-4 p-3 bg-indigo-950/20 border border-indigo-900/60 rounded-lg">
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-indigo-300 uppercase tracking-widest font-semibold">
                  Privatsektor
                </span>
                <span className="text-[10px] text-slate-500">
                  Zivile Händler · keine Flottenbindung
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-amber-300"
                  title="Summe des zivilen Handelsvolumens aller Kolonien"
                >
                  ◈ {privateSectorVolume.toFixed(1)} Cr Handelsvolumen
                </span>
                <span
                  className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-emerald-300"
                  title={`${Math.round(PRIVATE_SECTOR_TAX_RATE * 100)} % des Handelsvolumens fließen als Handelssteuer in die Staatskasse`}
                >
                  +{privateSectorTax.toFixed(1)} Cr Handelssteuer
                </span>
                <span
                  className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-200"
                  title="Frachtkapazität ziviler Händler pro Runde"
                >
                  ⇄ {privateSectorCapacity} Einh./Rd.
                </span>
              </div>
            </div>

            <div className="mt-2 text-[10px] font-mono text-slate-400 leading-relaxed">
              {privateSector ? (
                <span className="text-indigo-200/90">
                  Letzte Runde umverteilt: 🍏 {privateSectorDelivered} · 💎{' '}
                  {privateSectorDeliveredMinerals} · 🔮 {privateSectorDeliveredRare} Einheiten
                </span>
              ) : (
                <span className="text-slate-500">
                  Noch keine Runde simuliert – die Handelssteuer wird mit dem nächsten Spielzug
                  gutgeschrieben.
                </span>
              )}
              <span className="text-slate-500">
                {' '}
                Zivile Händler füllen nur Bestände unter {PRIVATE_SECTOR_TARGET_STOCK.food}/
                {PRIVATE_SECTOR_TARGET_STOCK.minerals}/{PRIVATE_SECTOR_TARGET_STOCK.rareResources}{' '}
                aus Überschüssen über {PRIVATE_SECTOR_RESERVE.food}/
                {PRIVATE_SECTOR_RESERVE.minerals}/{PRIVATE_SECTOR_RESERVE.rareResources}.
                Massentransport bleibt Aufgabe der Logistikrouten.
              </span>
            </div>
          </div>
        )}

        {/* Colonized Worlds Cards List */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {colonies.length === 0 ? (
            <div className="py-16 text-center bg-slate-900/30 border border-dashed border-slate-800 rounded-xl my-4 p-6">
              <div className="w-14 h-14 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-2xl mb-3 text-slate-500">
                🪐
              </div>
              <h3 className="text-base font-bold text-slate-200 mb-1">Bisher keine Planeten kolonisiert</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed mb-4">
                Wähle ein Sternensystem in der Galaxy-Karte aus, navigiere zur Systemkarte und führe einen Orbitalsonden-Scan auf einem habitablen Planeten durch, um deine erste Kolonie zu gründen.
              </p>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-semibold text-xs font-mono rounded cursor-pointer transition-colors"
              >
                Zur Galaxiekarte zurückkehren
              </button>
            </div>
          ) : (
            colonies.map((colony) => {
              const { planet, system } = getColonyContext(colony);
              const typeDef = planet ? PLANET_CATALOG[planet.planetType] : null;
              const habitabilityInfo = planet ? HABITABILITY_LABELS[planet.habitabilityTier] : null;
              const activeBuild = colony.buildQueue.length > 0 ? colony.buildQueue[0] : null;
              const buildProgressPercent = activeBuild
                ? Math.min(100, Math.round((activeBuild.investedProduction / activeBuild.requiredProduction) * 100))
                : 0;

              return (
                <div
                  key={colony.id}
                  className="p-4 bg-slate-900/50 hover:bg-slate-900/70 border border-slate-800 hover:border-slate-700/80 rounded-xl transition-all shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  {/* Left Column: Visual & Planet Telemetry */}
                  <div className="flex items-start gap-4">
                    {/* Planet Sphere Badge */}
                    <div
                      className="w-14 h-14 rounded-full shrink-0 border border-white/20 shadow-md relative overflow-hidden flex items-center justify-center mt-1"
                      style={{
                        backgroundColor: planet?.color || '#38bdf8',
                        boxShadow: `0 0 16px ${planet?.accentColor || '#0284c7'}55`,
                      }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-tr from-black/60 to-transparent" />
                      <span className="text-xs font-bold text-white z-10">🏛</span>
                    </div>

                    {/* Planet & Colony Details */}
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-100">
                          {planet?.name || 'Unbekannter Planet'}
                        </span>
                        <span className="text-slate-600">·</span>
                        <span className="text-xs font-mono text-cyan-400">
                          {system?.name || 'Unbekanntes System'}
                        </span>
                        {planet && (
                          <span className="text-[10px] font-mono text-slate-500">
                            (Orbit #{planet.orbitIndex})
                          </span>
                        )}
                        {typeDef && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300">
                            {typeDef.displayName}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-semibold text-emerald-400">
                          Kolonie „{colony.name}“
                        </span>
                        <span className="text-slate-600">·</span>
                        <span className="text-[10px] font-mono text-slate-400 uppercase">
                          {COLONY_TIER_LABELS[colony.developmentTier]}
                        </span>
                        <span className="text-slate-600">·</span>
                        <span className="text-[10px] font-mono text-slate-400">
                          Gegr. R.{colony.foundedTurn} ({colony.foundedDate})
                        </span>
                      </div>

                      {/* Vital stats row */}
                      <div className="flex items-center gap-4 text-xs font-mono mt-2.5 text-slate-300">
                        <div>
                          <span className="text-slate-500 text-[10px] block">BEVÖLKERUNG</span>
                          <span className="tabular-nums font-semibold text-slate-200">
                            {colony.population.toLocaleString()} Kolonisten
                          </span>
                        </div>

                        <div>
                          <span className="text-slate-500 text-[10px] block">HABITABILITÄT</span>
                          <span
                            className="font-semibold"
                            style={{ color: habitabilityInfo?.color || '#38bdf8' }}
                          >
                            {planet?.habitability ?? 80}% ({habitabilityInfo?.label || 'Ideal'})
                          </span>
                        </div>

                        <div>
                          <span className="text-slate-500 text-[10px] block">GEBÄUDE</span>
                          <span className="font-semibold text-slate-200">
                            {colony.buildings.length} Anlagen
                          </span>
                        </div>

                        <div>
                          <span className="text-slate-500 text-[10px] block">TERRITORIUM</span>
                          <span className="font-semibold text-cyan-300">
                            {colony.claimedHexKeys.length} Hexfelder
                          </span>
                        </div>
                      </div>

                      {/* Local Net Yields Pill */}
                      <div className="flex flex-wrap items-center gap-1.5 mt-2.5 text-[11px] font-mono">
                        <span className="text-slate-500 text-[10px] mr-1">Nettoerträge:</span>
                        <span className={`px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800/80 ${colony.netYields.food >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          🍏 {colony.netYields.food >= 0 ? `+${colony.netYields.food}` : colony.netYields.food}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800/80 text-amber-400">
                          ⚙️ +{colony.netYields.production}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800/80 ${colony.netYields.energy >= 0 ? 'text-sky-400' : 'text-rose-400'}`}>
                          ⚡ {colony.netYields.energy >= 0 ? `+${colony.netYields.energy}` : colony.netYields.energy}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800/80 text-slate-200">
                          💎 +{colony.netYields.minerals}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800/80 text-purple-400">
                          🔮 +{colony.netYields.rareResources}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800/80 text-cyan-400">
                          🔬 +{colony.netYields.research}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800/80 text-indigo-400">
                          🏛️ +{colony.netYields.influence}
                        </span>
                      </div>

                      {/* Active Build Queue Progress */}
                      <div className="mt-2.5 text-[11px] font-mono text-slate-400 flex items-center gap-2">
                        <span className="text-slate-500 text-[10px]">BAUAUFTRAG:</span>
                        {activeBuild ? (
                          <div className="flex items-center gap-2 flex-1 max-w-xs">
                            <span className="text-amber-300 font-semibold truncate">{activeBuild.name}</span>
                            <div className="flex-1 bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800 min-w-16">
                              <div
                                className="bg-amber-400 h-full rounded-full transition-all"
                                style={{ width: `${buildProgressPercent}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-slate-500 tabular-nums">
                              {activeBuild.investedProduction}/{activeBuild.requiredProduction}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-500 italic">Warteschlange leer</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Actions (Direct Surface Button is Primary!) */}
                  <div className="flex flex-col sm:flex-row md:flex-col gap-2 shrink-0 self-stretch md:self-center md:min-w-48">
                    {/* PRIMARY ACTION: Planetenoberfläche betreten */}
                    <button
                      onClick={() => {
                        onClose();
                        if (planet && system) {
                          onEnterSurface(planet.id, system.id);
                        }
                      }}
                      className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-slate-950 font-bold text-xs uppercase font-mono tracking-wider rounded-lg shadow-lg shadow-emerald-950/50 transition-all flex items-center justify-center gap-2 cursor-pointer"
                      title={`Zur hexagonalen Planetenoberfläche von ${planet?.name || colony.name} wechseln`}
                    >
                      <span className="text-sm">🪐</span>
                      <span>Planetenoberfläche betreten</span>
                    </button>

                    <div className="flex gap-2">
                      {/* Secondary: Open Colony Management console */}
                      {onOpenColonyManagement && (
                        <button
                          onClick={() => {
                            onClose();
                            onOpenColonyManagement(colony.id);
                          }}
                          className="flex-1 py-1.5 px-3 bg-slate-800/80 hover:bg-slate-700 text-cyan-300 border border-slate-700 rounded text-xs font-mono cursor-pointer transition-colors flex items-center justify-center gap-1.5"
                          title="Bauwarteschlange, Upgrades und Fokus anpassen"
                        >
                          <span>🏛</span>
                          <span>Verwaltung</span>
                        </button>
                      )}

                      {/* Secondary: Jump to system view */}
                      {onOpenSystem && system && (
                        <button
                          onClick={() => {
                            onClose();
                            onOpenSystem(system.id);
                          }}
                          className="flex-1 py-1.5 px-3 bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded text-xs font-mono cursor-pointer transition-colors flex items-center justify-center gap-1.5"
                          title="Zur Systemkarte dieses Planeten springen"
                        >
                          <span>🔭</span>
                          <span>System</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-800 mt-4">
          <div className="text-[11px] text-slate-500 font-mono">
            Tipp: Wähle „Oberfläche betreten“, um direkt auf die 18×10 Hex-Karte des Planeten zu zoomen und Kacheln zu bewirtschaften.
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-mono cursor-pointer transition-colors"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
};
