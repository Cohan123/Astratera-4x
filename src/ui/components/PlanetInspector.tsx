/**
 * Astraea 4X - Planet Inspector Panel (Phase 1, Modul 3)
 * Comprehensive planetary telemetry inspector presenting:
 * - Systematic exploration status (unexplored, surveyed, analyzed)
 * - Deep environmental profiles (atmosphere, gravity, radiation, temperature)
 * - Granular habitability evaluation factor breakdown
 * - Colonization eligibility validation and colony founding action
 * - Established colony management card with population and slot capacity
 */

import React, { useMemo, useState } from 'react';
import {
  COLONIZATION_SUPPLY,
  ColonizationValidator,
  checkColonySupply,
} from '../../core/colonizationRules.ts';
import {
  COLONY_TIER_LABELS,
  COLONY_TIER_REQUIREMENTS,
  DEVELOPMENT_TIERS,
} from '../../core/colonyManager.ts';
import type { ColonyTierUpgradeResult } from '../../core/colonyManager.ts';
import { HabitabilityEvaluator } from '../../core/habitabilityEvaluator.ts';
import { Colony, Fleet, Planet, StarSystem } from '../../core/types.ts';
import {
  ATMOSPHERE_LABELS,
  GRAVITY_LABELS,
  HABITABILITY_LABELS,
  PLANET_CATALOG,
  TEMPERATURE_LABELS,
  WATER_LABELS,
} from '../../data/planetCatalog.ts';
import { sortPlanetsByDistance } from '../systemViewLayout.ts';

interface PlanetInspectorProps {
  planet: Planet | null;
  system: StarSystem;
  colony?: Colony | null;
  /** Beladenes Kolonieschiff im aktuellen System (Kolonisationslogistik). */
  colonyShip?: Fleet | null;
  onSelectPlanet: (planet: Planet) => void;
  onSurveyPlanet: (planetId: string) => void;
  onFoundColony: (planetId: string, customName?: string) => void;
  onOpenSurface?: (planetId: string) => void;
  onOpenColonyManagement?: (colonyId: string) => void;
  onOpenTerraforming?: (planetId: string) => void;
  onUpgradeTier?: (colonyId: string) => ColonyTierUpgradeResult;
  colonyOwnerName?: string;
  onClose: () => void;
}

export const PlanetInspector: React.FC<PlanetInspectorProps> = ({
  planet,
  system,
  colony,
  colonyShip,
  onSelectPlanet,
  onSurveyPlanet,
  onFoundColony,
  onOpenSurface,
  onOpenColonyManagement,
  onOpenTerraforming,
  onUpgradeTier,
  colonyOwnerName,
  onClose,
}) => {
  const [showFactorBreakdown, setShowFactorBreakdown] = useState(false);
  const [isFoundingOpen, setIsFoundingOpen] = useState(false);
  const [colonyNameInput, setColonyNameInput] = useState('');
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [tierFeedback, setTierFeedback] = useState<string | null>(null);

  const orderedSystemPlanets = useMemo(
    () => sortPlanetsByDistance(system.planets ?? []),
    [system.planets]
  );

  if (!planet) {
    return (
      <aside className="w-88 md:w-104 bg-slate-950/95 border-l border-slate-800/80 p-6 flex flex-col justify-center items-center text-center text-slate-500 text-xs font-mono select-none">
        <div className="w-12 h-12 rounded-full border border-slate-800 flex items-center justify-center mb-3 text-slate-600">
          🪐
        </div>
        <p className="text-slate-400 font-semibold mb-1">Kein Planet ausgewählt</p>
        <p className="text-slate-600 max-w-xs">
          Wähle einen Himmelskörper in der Systemkarte an, um atmosphärische Messdaten, Habitabilitätsanalysen und Kolonisierungsoptionen abzurufen.
        </p>
      </aside>
    );
  }

  const typeDef = PLANET_CATALOG[planet.planetType];
  const isAnalyzed = planet.surveyStatus === 'analyzed';
  const isSurveyed = planet.surveyStatus === 'surveyed' || isAnalyzed;
  const isColonized = planet.colonizationStatus === 'colonized' || !!planet.colonyId || !!colony;
  const moons = planet.moons ?? [];
  const knownMoonCount = moons.length > 0 ? moons.length : planet.moonsCount;

  const tempCelsius = planet.surfaceTemperatureK - 273;
  const habitabilityAssessment = HabitabilityEvaluator.evaluate(planet);
  const habitabilityInfo = HABITABILITY_LABELS[planet.habitabilityTier];
  const colonizeCheck = ColonizationValidator.canColonize(planet, system);
  const supplyCheck = checkColonySupply(colonyShip?.cargo);
  const canFoundColony = colonizeCheck.allowed && supplyCheck.allowed;

  const tierIndex = colony ? DEVELOPMENT_TIERS.indexOf(colony.developmentTier) : -1;
  const nextTier =
    tierIndex >= 0 && tierIndex < DEVELOPMENT_TIERS.length - 1
      ? DEVELOPMENT_TIERS[tierIndex + 1]
      : null;
  const tierRequirement =
    nextTier && nextTier !== 'outpost' ? COLONY_TIER_REQUIREMENTS[nextTier] : null;
  const tierRequirementsMet = !!colony && !!tierRequirement && nextTier !== null
    ? colony.population >= tierRequirement.population &&
      colony.stockpile.minerals >= tierRequirement.minerals &&
      colony.stockpile.rareResources >= tierRequirement.rareResources &&
      colony.stockpile.influence >= tierRequirement.influence
    : false;

  const handleStartFounding = () => {
    setColonyNameInput(`${planet.name} Kolonie`);
    setIsFoundingOpen(true);
    setFeedbackError(null);
  };

  const handleConfirmFounding = (e: React.FormEvent) => {
    e.preventDefault();
    if (!colonizeCheck.allowed) {
      setFeedbackError(colonizeCheck.reason || 'Kolonisierung nicht möglich.');
      return;
    }
    if (!supplyCheck.allowed) {
      setFeedbackError(supplyCheck.reason || 'Kein beladenes Kolonieschiff im System.');
      return;
    }
    onFoundColony(planet.id, colonyNameInput.trim());
    setIsFoundingOpen(false);
  };

  const handleUpgradeTier = () => {
    if (!colony || !onUpgradeTier) return;
    const res = onUpgradeTier(colony.id);
    setTierFeedback(res.success ? null : res.reason ?? 'Aufwertung fehlgeschlagen.');
  };

  return (
    <aside className="w-88 md:w-104 bg-slate-950/95 border-l border-slate-800/80 p-5 flex flex-col h-full overflow-y-auto select-none backdrop-blur-md shadow-2xl">
      {/* Top Header & Close */}
      <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-cyan-400 font-semibold">
              ORBIT #{planet.orbitIndex}
            </span>
            <span className="text-slate-600">·</span>
            <span className="text-[11px] font-mono text-slate-400">{system.name}</span>
            {isColonized && (
              <>
                <span className="text-slate-600">·</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/70 border border-emerald-500/70 text-emerald-300 font-semibold">
                  KOLONISIERT
                </span>
              </>
            )}
          </div>
          <h2 className="text-xl font-bold text-slate-100 tracking-tight mt-0.5">{planet.name}</h2>
        </div>

        <button
          onClick={onClose}
          className="w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors text-sm cursor-pointer font-mono"
          title="Schließen"
        >
          ✕
        </button>
      </div>

      {/* ESTABLISHED COLONY CARD (When colonized) */}
      {isColonized && (
        <div className="mt-4 p-4 bg-emerald-950/30 border border-emerald-500/50 rounded-lg shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-mono font-bold text-emerald-300 uppercase tracking-wider">
                Etablierte Kolonie
              </span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-900/60 text-emerald-200 border border-emerald-700/60">
              {colony ? COLONY_TIER_LABELS[colony.developmentTier] : 'Außenposten'}
            </span>
          </div>

          <h3 className="text-base font-bold text-slate-100 mb-1">
            {colony?.name || `${planet.name} Kolonie`}
          </h3>

          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono mt-3 pt-2.5 border-t border-emerald-900/50">
            <div>
              <span className="text-slate-400 block text-[10px]">GEGRÜNDET</span>
              <span className="text-slate-200 font-semibold">
                Runde {colony?.foundedTurn || 1} ({colony?.foundedDate || '2380.01'})
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">PIONIERE / BEVÖLKERUNG</span>
              <span className="text-slate-200 font-semibold tabular-nums">
                {(colony?.population || 1000).toLocaleString()} Kolonisten
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">BAUSLOTS / KAPAZITÄT</span>
              <span className="text-slate-200 font-semibold">
                {colony?.sizeClass || planet.sizeClass} Distrikte
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">TERRITORIUM</span>
              <span className="text-slate-200 font-semibold text-emerald-300">
                {colonyOwnerName ?? 'Spieler-Reich'}
              </span>
            </div>
          </div>

          {/* Action buttons inside colony card */}
          <div className="mt-3 pt-3 border-t border-emerald-900/50 flex flex-col gap-2">
            {onOpenSurface && (
              <button
                onClick={() => onOpenSurface(planet.id)}
                className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-slate-950 font-bold rounded text-xs font-mono cursor-pointer shadow-lg shadow-emerald-950/50 transition-colors flex items-center justify-center gap-1.5"
                title="Hex-Oberfläche dieser Kolonie betreten"
              >
                <span>🪐</span>
                <span>Planetenoberfläche betreten</span>
              </button>
            )}
            {onOpenColonyManagement && colony && (
              <button
                onClick={() => onOpenColonyManagement(colony.id)}
                className="w-full py-1.5 px-3 bg-slate-800/80 hover:bg-slate-700 text-cyan-300 border border-slate-700 rounded text-xs font-mono cursor-pointer transition-colors flex items-center justify-center gap-1.5"
              >
                <span>🏛 Kolonieverwaltung & Bau</span>
              </button>
            )}
            {onOpenTerraforming && (
              <button
                onClick={() => onOpenTerraforming(planet.id)}
                className="w-full py-1.5 px-3 bg-slate-800/80 hover:bg-slate-700 text-emerald-300 border border-slate-700 rounded text-xs font-mono cursor-pointer transition-colors flex items-center justify-center gap-1.5"
              >
                <span>🌱 Terraforming planen</span>
              </button>
            )}
            {onUpgradeTier && colony && (
              nextTier && tierRequirement ? (
                <div className="p-2.5 rounded border border-slate-700/70 bg-slate-900/60">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 font-mono">
                      Nächste Stufe
                    </span>
                    <span className="text-[10px] font-mono text-cyan-300 font-semibold">
                      {COLONY_TIER_LABELS[colony.developmentTier]} → {COLONY_TIER_LABELS[nextTier]}
                    </span>
                  </div>
                  <ul className="grid grid-cols-2 gap-x-2 gap-y-0.5 mb-2 text-[10px] font-mono">
                    <li className={colony.population >= tierRequirement.population ? 'text-emerald-300' : 'text-rose-300'}>
                      👥 {colony.population.toLocaleString('de-DE')} / {tierRequirement.population.toLocaleString('de-DE')}
                    </li>
                    <li className={colony.stockpile.minerals >= tierRequirement.minerals ? 'text-emerald-300' : 'text-rose-300'}>
                      ⛏ {colony.stockpile.minerals} / {tierRequirement.minerals}
                    </li>
                    <li className={colony.stockpile.rareResources >= tierRequirement.rareResources ? 'text-emerald-300' : 'text-rose-300'}>
                      💎 {colony.stockpile.rareResources} / {tierRequirement.rareResources}
                    </li>
                    <li className={colony.stockpile.influence >= tierRequirement.influence ? 'text-emerald-300' : 'text-rose-300'}>
                      ⚑ {colony.stockpile.influence} / {tierRequirement.influence}
                    </li>
                  </ul>
                  <button
                    onClick={handleUpgradeTier}
                    disabled={!tierRequirementsMet}
                    title={
                      tierRequirementsMet
                        ? 'Kolonie auf die nächste Entwicklungsstufe ausbauen'
                        : 'Voraussetzungen noch nicht erfüllt'
                    }
                    className="w-full py-1.5 px-3 rounded text-xs font-mono font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-lg disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-slate-950 cursor-pointer shadow-amber-950/50"
                  >
                    <span>⬆</span>
                    <span>Aufwerten zu {COLONY_TIER_LABELS[nextTier]}</span>
                  </button>
                  {tierFeedback && (
                    <p className="text-[10px] text-rose-400 font-mono mt-1.5">{tierFeedback}</p>
                  )}
                </div>
              ) : (
                <p className="text-[10px] font-mono text-center text-emerald-400/70">
                  Maximale Entwicklungsstufe erreicht
                </p>
              )
            )}
          </div>
        </div>
      )}

      {/* Planet Surface & Classification Banner */}
      <div className="mt-4 p-3.5 bg-slate-900/70 border border-slate-800/80 rounded-lg">
        <div className="flex items-center gap-3 mb-2.5">
          <div
            className="w-10 h-10 rounded-full shadow-lg flex items-center justify-center shrink-0 border border-white/20 relative overflow-hidden"
            style={{
              backgroundColor: planet.color,
              boxShadow: `0 0 16px ${planet.accentColor}66`,
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-black/60 to-transparent" />
            {isColonized && (
              <div className="absolute inset-0 flex items-center justify-center text-[10px] text-emerald-300 font-bold z-10">
                🏛
              </div>
            )}
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-200">{typeDef.displayName}</div>
            <div className="text-[11px] text-slate-400 font-mono">
              Distanz: {planet.orbitDistanceAu} AU · {planet.orbitalPeriodDays} Tage Umlaufzeit
            </div>
          </div>
        </div>

        <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
          {typeDef.description}
        </p>

        {/* Core Environmental Attributes */}
        <div className="grid grid-cols-2 gap-2 text-[11px] font-mono border-t border-slate-800/70 pt-2.5">
          <div>
            <span className="text-slate-500 block text-[10px]">TEMPERATUR</span>
            <span className="text-slate-200 font-semibold tabular-nums">
              {planet.surfaceTemperatureK} K ({tempCelsius > 0 ? `+${tempCelsius}` : tempCelsius} °C)
            </span>
            <span className="text-[9px] text-slate-500 block">
              {TEMPERATURE_LABELS[planet.temperatureCategory].label}
            </span>
          </div>

          <div>
            <span className="text-slate-500 block text-[10px]">SCHWERKRAFT</span>
            <span className="text-slate-200 font-semibold tabular-nums">{planet.gravityG} G</span>
            <span className="text-[9px] text-slate-500 block">
              {GRAVITY_LABELS[planet.gravityCategory].label}
            </span>
          </div>

          <div>
            <span className="text-slate-500 block text-[10px]">ATMOSPHÄRE</span>
            <span className="text-slate-200 font-semibold truncate block">
              {isSurveyed ? ATMOSPHERE_LABELS[planet.atmosphere].label : 'Nicht analysiert'}
            </span>
          </div>

          <div>
            <span className="text-slate-500 block text-[10px]">WASSERVORKOMMEN</span>
            <span className="text-slate-200 font-semibold truncate block">
              {isSurveyed ? WATER_LABELS[planet.waterAvailability].label : 'Nicht analysiert'}
            </span>
          </div>

          <div>
            <span className="text-slate-500 block text-[10px]">STRAHLUNGSBELASTUNG</span>
            <span className={`text-[11px] font-semibold block ${
              planet.radiationHazard === 'lethal'
                ? 'text-rose-400'
                : planet.radiationHazard === 'severe'
                ? 'text-amber-400'
                : 'text-slate-200'
            }`}>
              {isAnalyzed
                ? planet.radiationHazard === 'negligible'
                  ? 'Gering (Sicher)'
                  : planet.radiationHazard === 'moderate'
                  ? 'Moderat'
                  : planet.radiationHazard === 'severe'
                  ? 'Gefährlich'
                  : 'Tödlich (Lethal)'
                : 'Sensorblockade'}
            </span>
          </div>

          <div>
            <span className="text-slate-500 block text-[10px]">GEOLOGIE</span>
            <span className="text-slate-200 font-semibold truncate block">
              {isAnalyzed
                ? planet.geologicalStability === 'stable'
                  ? 'Tektonisch stabil'
                  : planet.geologicalStability === 'tectonic_activity'
                  ? 'Aktiv'
                  : 'Extremer Vulkanismus'
                : 'Sensorblockade'}
            </span>
          </div>
        </div>
      </div>

      {/* Habitability Rating & Granular Factor Breakdown (Modul 3 Requirement) */}
      <div className="mt-4 p-3.5 bg-slate-900/50 border border-slate-800/80 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-mono text-slate-400 uppercase">Habitabilitäts-Index</span>
          <span
            className="text-xs font-mono font-bold"
            style={{ color: habitabilityInfo.color }}
          >
            {habitabilityAssessment.score}% · {habitabilityAssessment.categoryLabel}
          </span>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800 mb-2">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${habitabilityAssessment.score}%`,
              backgroundColor: habitabilityInfo.color,
            }}
          />
        </div>

        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mt-1">
          <span>Größenklasse: {planet.sizeClass} Bauslots</span>
          <span title={moons.length > 0 ? moons.map((moon) => moon.name).join(', ') : undefined}>
            {knownMoonCount} {knownMoonCount === 1 ? 'Mond' : 'Monde'}
          </span>
        </div>

        {isSurveyed && moons.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {moons.map((moon) => (
              <span
                key={moon.id}
                className="inline-flex items-center gap-1 rounded border border-slate-800 bg-slate-950/70 px-1.5 py-0.5 text-[9px] font-mono text-slate-400"
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: moon.color }}
                />
                {moon.name}
              </span>
            ))}
          </div>
        )}

        {/* Summary note */}
        <p className="text-[11px] text-slate-400 mt-2.5 leading-relaxed">
          {habitabilityAssessment.summary}
        </p>

        {/* Toggle Factor Breakdown */}
        <button
          onClick={() => setShowFactorBreakdown(!showFactorBreakdown)}
          className="mt-3 text-[11px] font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1.5 cursor-pointer"
        >
          <span>{showFactorBreakdown ? '▼' : '▶'}</span>
          <span>Umweltfaktoren & Beurteilung {showFactorBreakdown ? 'ausblenden' : 'einblenden'} ({habitabilityAssessment.factors.length})</span>
        </button>

        {showFactorBreakdown && (
          <div className="mt-3 pt-3 border-t border-slate-800/80 space-y-2">
            {habitabilityAssessment.factors.map((factor, idx) => (
              <div
                key={idx}
                className="p-2 rounded bg-slate-950/70 border border-slate-800/60 flex items-start justify-between gap-2"
              >
                <div>
                  <div className="text-[11px] font-semibold text-slate-200">{factor.title}</div>
                  <div className="text-[10px] text-slate-400 leading-tight mt-0.5">{factor.description}</div>
                </div>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold shrink-0 ${
                    factor.isPositive
                      ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/50'
                      : 'bg-rose-950/60 text-rose-400 border border-rose-800/50'
                  }`}
                >
                  {factor.impactPercent > 0 ? `+${factor.impactPercent}%` : `${factor.impactPercent}%`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* COLONIZATION ACTIONS & EVALUATION PANEL (Modul 3 Core) */}
      <div className="mt-4 p-3.5 bg-slate-900/60 border border-slate-800/80 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-mono text-slate-400 uppercase">Kolonisierungsprüfung</span>
          <span
            className={`text-xs font-mono font-semibold ${
              isColonized
                ? 'text-emerald-400'
                : colonizeCheck.allowed
                ? 'text-cyan-400'
                : 'text-amber-400'
            }`}
          >
            {isColonized
              ? 'Besiedelt'
              : colonizeCheck.allowed
              ? 'Besiedelbar'
              : 'Nicht geeignet'}
          </span>
        </div>

        {isColonized ? (
          <div className="text-[11px] text-slate-300 leading-normal">
            Dieser Planet ist bereits kolonisiert. Zukünftige Ausbauten (Distrikte, Minen und Habitate) folgen in der nächsten Ausbaustufe.
          </div>
        ) : (
          <div>
            {!isAnalyzed ? (
              <div className="p-2.5 bg-slate-950/60 border border-slate-800/60 rounded text-[11px] text-slate-400 leading-normal mb-3">
                <span className="text-amber-400 font-semibold block mb-1">⚠ Unvollständige Sensordaten</span>
                Für eine verbindliche Kolonisationsprüfung muss zuerst ein vollständiger Orbitalsonden-Scan durchgeführt werden.
              </div>
            ) : colonizeCheck.allowed && supplyCheck.allowed ? (
              <div className="p-2.5 bg-cyan-950/40 border border-cyan-800/40 rounded text-[11px] text-cyan-300 leading-normal mb-3">
                <span className="text-cyan-200 font-semibold block mb-0.5">✓ Alle Kriterien erfüllt</span>
                Atmosphäre, Biosphäre und Kolonieschiff-Fracht erlauben die Etablierung eines
                Außenpostens mit {colonyShip?.cargo?.colonists ?? COLONIZATION_SUPPLY.colonists}{' '}
                Kolonisten.
              </div>
            ) : colonizeCheck.allowed ? (
              <div className="p-2.5 bg-amber-950/30 border border-amber-800/40 rounded text-[11px] text-amber-300 leading-normal mb-3">
                <span className="text-amber-300 font-semibold block mb-0.5">
                  ⚠ Kolonisationslogistik fehlt
                </span>
                {supplyCheck.reason}
              </div>
            ) : (
              <div className="p-2.5 bg-rose-950/30 border border-rose-800/40 rounded text-[11px] text-rose-300 leading-normal mb-3">
                <span className="text-rose-400 font-semibold block mb-0.5">✕ Kolonisation blockiert</span>
                {colonizeCheck.reason}
              </div>
            )}

            {/* Founding Action / Form */}
            {isFoundingOpen ? (
              <form onSubmit={handleConfirmFounding} className="p-3 bg-slate-950 rounded border border-cyan-600/50 space-y-3">
                <div>
                  <label className="text-[10px] font-mono text-slate-400 block mb-1">
                    NAME DES KOLONIALEN AUSSENPOSTENS:
                  </label>
                  <input
                    type="text"
                    value={colonyNameInput}
                    onChange={(e) => setColonyNameInput(e.target.value)}
                    placeholder={`${planet.name} Kolonie`}
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-slate-100 font-mono focus:border-cyan-400 focus:outline-none"
                    maxLength={32}
                    autoFocus
                  />
                </div>

                {feedbackError && (
                  <p className="text-[11px] text-rose-400 font-mono">{feedbackError}</p>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    className="flex-1 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs font-mono rounded cursor-pointer transition-colors"
                  >
                    Kolonie jetzt gründen
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsFoundingOpen(false)}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono rounded cursor-pointer transition-colors"
                  >
                    Abbrechen
                  </button>
                </div>
              </form>
            ) : (
              <button
                disabled={!canFoundColony}
                onClick={handleStartFounding}
                className={`w-full py-2 rounded text-xs font-mono font-semibold transition-all flex items-center justify-center gap-2 ${
                  canFoundColony
                    ? 'bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-slate-950 cursor-pointer shadow-lg shadow-cyan-950/40'
                    : 'bg-slate-900/60 border border-slate-800 text-slate-600 cursor-not-allowed'
                }`}
                title={
                  canFoundColony
                    ? 'Kolonieschiff entsenden und Kolonie gründen'
                    : colonizeCheck.reason || supplyCheck.reason
                }
              >
                <span>🚀</span>
                <span>Kolonie gründen (Außenposten errichten)</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Survey & Exploration Action */}
      <div className="mt-4 p-3 bg-slate-900/50 border border-slate-800/80 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-mono text-slate-400 uppercase">Untersuchungsstatus</span>
          <span
            className={`text-xs font-mono font-semibold ${
              isAnalyzed
                ? 'text-cyan-400'
                : isSurveyed
                ? 'text-amber-400'
                : 'text-slate-500'
            }`}
          >
            {isAnalyzed ? 'Vollständig analysiert' : isSurveyed ? 'Basiskartierung' : 'Unerforscht'}
          </span>
        </div>

        {!isAnalyzed ? (
          <div>
            <p className="text-[11px] text-slate-400 mb-2.5 leading-normal">
              Führe einen gezielten Orbitalsonden-Scan durch, um mineralische Zusammensetzung und Biosphärenindikatoren offenzulegen.
            </p>
            <button
              onClick={() => onSurveyPlanet(planet.id)}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-800/50 rounded text-xs font-mono font-semibold transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <span>✦</span>
              <span>Orbitalsonde starten (Scan)</span>
            </button>
          </div>
        ) : (
          <div className="text-[11px] text-slate-400 leading-normal">
            <p>Detaillierte geologische Spektrometrie abgeschlossen. Umweltmatrix und Habitabilitätsfaktoren sind verifiziert.</p>
            {onOpenSurface && !isColonized && (
              <button
                onClick={() => onOpenSurface(planet.id)}
                className="w-full mt-3 py-2 bg-slate-900/90 hover:bg-slate-800 text-cyan-300 border border-cyan-800/60 rounded text-xs font-mono font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 shadow"
                title="Hex-Oberfläche dieses Planeten betreten und Landeplätze begutachten"
              >
                <span>🪐</span>
                <span>Planetenoberfläche betreten</span>
              </button>
            )}
          </div>
        )}

        {planet.anomalyDetected && (
          <div className="mt-3 p-2 bg-amber-950/30 border border-amber-800/40 rounded text-[11px] text-amber-300 flex items-center gap-2">
            <span>⚠</span>
            <span>Planetare Anomalie: Ungewöhnliche tektonische Frequenz</span>
          </div>
        )}
      </div>

      {/* Quick System Orbit Selector */}
      <div className="mt-4 p-3 bg-slate-900/50 border border-slate-800/80 rounded-lg">
        <div className="text-xs font-mono text-slate-400 uppercase mb-2">
          Planeten im System ({system.planets?.length || 0})
        </div>

        <div className="flex flex-col gap-1.5 max-h-44 overflow-y-auto pr-1">
          {orderedSystemPlanets.map((p) => {
            const isCurrent = p.id === planet.id;
            const pIsColonized = p.colonizationStatus === 'colonized' || !!p.colonyId;
            return (
              <button
                key={p.id}
                onClick={() => onSelectPlanet(p)}
                className={`flex items-center justify-between p-2 rounded border text-left transition-colors cursor-pointer group ${
                  isCurrent
                    ? 'bg-cyan-950/70 border-cyan-500 text-cyan-200'
                    : 'bg-slate-950/50 hover:bg-slate-800/80 border-slate-800/60 text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                  <span className="text-xs font-sans font-medium flex items-center gap-1.5">
                    <span>{p.name}</span>
                    {pIsColonized && (
                      <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-emerald-950 border border-emerald-600/70 text-emerald-300 font-semibold">
                        Kolonie
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500">
                  <span>{p.orbitDistanceAu} AU</span>
                  <span
                    className="font-semibold"
                    style={{ color: HABITABILITY_LABELS[p.habitabilityTier].color }}
                  >
                    {p.habitability}%
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
};
