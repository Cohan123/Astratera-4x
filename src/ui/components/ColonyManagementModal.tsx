/**
 * Astraea 4X - Colony Management Modal (Module 4)
 * Comprehensive 4X administration console presenting 5-resource economies,
 * citizen allocation focus, build queues, upgrade paths, and unit recruitment.
 *
 * Aufbau nach dem Basisbau-Vorbild aus "Heroes of Science and Fiction":
 * Eine Kommandozentrale bündelt Bauplätze, Steuern und Bevölkerung in klar
 * getrennten, direkt einstellbaren Bereichen. Jeder Tab liest nur abgeleitete
 * Werte; Änderungen laufen ausschließlich über die Engine-Callbacks.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { BUILDING_CATALOG } from '../../data/buildingCatalog.ts';
import { CORE_RESOURCES } from '../../data/resourceCatalog.ts';
import { UNIT_CATALOG } from '../../data/unitCatalog.ts';
import { BuildQueueManager } from '../../core/buildQueueManager.ts';
import { EconomyEngine } from '../../core/economyEngine.ts';
import {
  DEFAULT_TAX_RATE,
  MAX_TAX_RATE,
  MIN_TAX_RATE,
} from '../../core/economyEngine.ts';
import {
  COLONY_TIER_REQUIREMENTS,
  DEVELOPMENT_TIERS,
} from '../../core/colonyManager.ts';
import type { ColonyTierUpgradeResult } from '../../core/colonyManager.ts';
import {
  CitizenFocus,
  Colony,
  HexCoord,
  PlanetSurface,
  PlanetType,
  ResourceYields,
} from '../../core/types.ts';
import {
  COLONY_TIER_LABELS,
  getBuildingSlotSummary,
  getPopulationForecast,
  getTaxProjection,
} from '../colonyAdministration.ts';
import { ColonySkyline } from './ColonySkyline.tsx';
import { getSkylinePalette, SKYLINE_TERRAIN_LABELS } from '../colonySkyline.ts';

export type ColonyModalTab =
  | 'overview'
  | 'tax'
  | 'population'
  | 'queue'
  | 'buildings'
  | 'units';

interface ColonyManagementModalProps {
  isOpen: boolean;
  colony: Colony | null;
  surface: PlanetSurface | null;
  habitabilityPercent?: number;
  targetHexForBuild?: HexCoord | null;
  /** Gewünschter Start-Tab beim Öffnen, etwa 'queue' aus dem Baumenü. */
  initialTab?: ColonyModalTab;
  onClose: () => void;
  onQueueBuilding: (colonyId: string, buildingDefId: string, targetCoord: HexCoord) => void;
  onQueueUpgrade: (colonyId: string, buildingInstanceId: string) => void;
  onQueueUnit: (colonyId: string, unitDefId: string) => void;
  onSetWorkFocus: (colonyId: string, focus: CitizenFocus) => void;
  /** Staatskasse des Spielers in Credits (Anzeige und Deckungsprüfung für Bau/Ausbau). */
  treasury?: number;
  /** Ändert den Steuersatz einer Kolonie (Wirtschaft Stufe A). */
  onSetTaxRate?: (colonyId: string, rate: number) => void;
  /** Wertet die Entwicklungsstufe des Koloniezentrums auf. */
  onUpgradeTier?: (colonyId: string) => ColonyTierUpgradeResult;
  /** Planetentyp für die Geländefarben der Stadtansicht. */
  planetType?: PlanetType;
}

/** Steuersatz-Voreinstellungen für schnelle, vergleichbare Entscheidungen. */
const TAX_PRESETS = [0, 15, 30, 45, 60];

const RESOURCE_LABELS: Record<keyof ResourceYields, string> = {
  food: 'Nahrung',
  production: 'Bau',
  energy: 'Energie',
  minerals: 'Mineralien',
  rareResources: 'Seltene',
  research: 'Forschung',
  influence: 'Einfluss',
};

const WORK_FOCUS_OPTIONS: [CitizenFocus, string, string][] = [
  ['balanced', 'Ausgewogene Entwicklung', 'Gleichmäßige Verteilung aller Erträge'],
  ['food', 'Agrar-Schwerpunkt', 'Maximiert Nahrung für schnelles Bevölkerungswachstum'],
  ['production', 'Industrie-Schwerpunkt', 'Fokussiert Bauenergie und Fabrikation'],
  ['minerals', 'Bergbau-Schwerpunkt', 'Konzentration auf Mineralien- und Erzgewinnung'],
  ['energy', 'Energie-Schwerpunkt', 'Sichert Kraftwerke gegen Versorgungsengpässe ab'],
  ['research', 'Wissenschafts-Schwerpunkt', 'Fördert Labore und Forschungsergebnisse'],
];

const TAB_LABELS: Record<ColonyModalTab, string> = {
  overview: 'Übersicht',
  tax: 'Steuern',
  population: 'Bevölkerung',
  queue: 'Bauwarteschlange',
  buildings: 'Bauplätze',
  units: 'Rekrutierung',
};

export const ColonyManagementModal: React.FC<ColonyManagementModalProps> = ({
  isOpen,
  colony,
  surface,
  habitabilityPercent,
  targetHexForBuild,
  initialTab = 'overview',
  onClose,
  onQueueBuilding,
  onQueueUpgrade,
  onQueueUnit,
  onSetWorkFocus,
  treasury,
  onSetTaxRate,
  onUpgradeTier,
  planetType,
}) => {
  // Hooks müssen vor jedem bedingten Ausstieg aufgerufen werden
  const [activeTab, setActiveTab] = useState<ColonyModalTab>(initialTab);
  const [tierFeedback, setTierFeedback] = useState<string | null>(null);

  // Beim Öffnen auf den vom Aufrufer gewünschten Tab springen. So landet das
  // Baumenü direkt in der Bauwarteschlange statt in der Übersicht.
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setTierFeedback(null);
    }
  }, [isOpen, initialTab, colony?.id]);

  // Ermittelt für jedes Gebäude ein tatsächlich gültiges Baufeld. Das bevorzugte
  // Feld (etwa die aktuell ausgewählte Kachel) wird nur genutzt, wenn es zulässig ist.
  const buildTargets = useMemo(() => {
    const targets = new Map<string, HexCoord | null>();
    if (!colony || !surface) return targets;

    for (const bDef of Object.values(BUILDING_CATALOG)) {
      if (bDef.id === 'city_center') continue;
      targets.set(
        bDef.id,
        BuildQueueManager.findAvailableBuildCoord(colony, surface, bDef.id, targetHexForBuild ?? null)
      );
    }
    return targets;
  }, [colony, surface, targetHexForBuild]);

  if (!isOpen || !colony) return null;

  // Abgeleitete Verwaltungswerte: reine Leseoperationen, keine Seiteneffekte.
  const tax = getTaxProjection(colony, treasury ?? 0);
  const forecast = getPopulationForecast(colony, surface, habitabilityPercent);
  const slots = getBuildingSlotSummary(colony, surface);
  // Geländefarben der Stadtansicht; reine Ableitung aus dem Stadtzentrums-Biom.
  const skylinePalette = getSkylinePalette(surface, colony, planetType);

  // Wird das bevorzugte Feld mindestens von einem Gebäude akzeptiert?
  const preferredCoordUsable =
    !!surface &&
    !!targetHexForBuild &&
    Object.values(BUILDING_CATALOG).some(
      (bDef) =>
        bDef.id !== 'city_center' &&
        BuildQueueManager.validateBuildingPlacement(colony, surface, bDef.id, targetHexForBuild).success
    );

  const approvalTone =
    tax.approval >= 60 ? 'text-emerald-400' : tax.approval >= 40 ? 'text-amber-400' : 'text-rose-400';

  const warnings: string[] = [];
  if (colony.energyDeficit) warnings.push('Energiedefizit: Bauproduktion −25 %.');
  if (tax.approval < 40) warnings.push('Unruhe: Zufriedenheit unter 40 %.');
  if (tax.taxRate > 40) warnings.push('Hoher Steuersatz: Korruption steigt über den Grundwert.');
  if (surface && slots.free === 0) warnings.push('Keine freien Bauplätze im Territorium.');

  // Koloniezentrum: Entwicklungsstufe und Voraussetzungen der nächsten Stufe.
  const tierIndex = DEVELOPMENT_TIERS.indexOf(colony.developmentTier);
  const nextTier =
    tierIndex >= 0 && tierIndex < DEVELOPMENT_TIERS.length - 1
      ? DEVELOPMENT_TIERS[tierIndex + 1]
      : null;
  const nextTierRequirement =
    nextTier && nextTier !== 'outpost' ? COLONY_TIER_REQUIREMENTS[nextTier] : null;
  const cityCenter = colony.buildings.find((b) => b.buildingDefId === 'city_center') ?? null;

  const missingTierRequirements: string[] = [];
  if (nextTierRequirement) {
    if (colony.population < nextTierRequirement.population) {
      missingTierRequirements.push(
        `Bevölkerung ${colony.population.toLocaleString('de-DE')}/${nextTierRequirement.population.toLocaleString('de-DE')}`
      );
    }
    if (colony.stockpile.minerals < nextTierRequirement.minerals) {
      missingTierRequirements.push(
        `Mineralien ${colony.stockpile.minerals}/${nextTierRequirement.minerals}`
      );
    }
    if (colony.stockpile.rareResources < nextTierRequirement.rareResources) {
      missingTierRequirements.push(
        `Seltene Ressourcen ${colony.stockpile.rareResources}/${nextTierRequirement.rareResources}`
      );
    }
    if (colony.stockpile.influence < nextTierRequirement.influence) {
      missingTierRequirements.push(
        `Einfluss ${colony.stockpile.influence}/${nextTierRequirement.influence}`
      );
    }
  }
  const tierRequirementsMet = Boolean(nextTier) && missingTierRequirements.length === 0;

  const handleTierUpgrade = () => {
    if (!onUpgradeTier || !nextTier) return;
    const res = onUpgradeTier(colony.id);
    if (res.success) {
      setTierFeedback(`Aufwertung erfolgreich: ${COLONY_TIER_LABELS[res.newTier ?? nextTier]}.`);
    } else {
      setTierFeedback(
        res.reason ??
          `Aufwertung nicht möglich: ${missingTierRequirements.join(', ') || 'Voraussetzungen fehlen'}.`
      );
    }
  };

  const tabButton = (tab: ColonyModalTab, badge?: string) => (
    <button
      key={tab}
      onClick={() => setActiveTab(tab)}
      aria-current={activeTab === tab ? 'page' : undefined}
      data-colony-tab={tab}
      className={`shrink-0 lg:w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-mono font-medium rounded-lg border text-left transition-colors cursor-pointer whitespace-nowrap ${
        activeTab === tab
          ? 'bg-cyan-950/50 border-cyan-700/80 text-cyan-300'
          : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
      }`}
    >
      <span>{TAB_LABELS[tab]}</span>
      {badge && (
        <span className={`text-[10px] text-slate-500 ${activeTab === tab ? 'text-cyan-400' : ''}`}>
          {badge}
        </span>
      )}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm select-none">
      <div className="w-full max-w-7xl bg-slate-950 border border-slate-800 rounded-xl shadow-2xl p-4 sm:p-6 font-sans max-h-[92vh] flex flex-col">
        {/* Header: Kommandozentrale der Kolonie */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-800">
          <div>
            <div className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest">
              Planetares Kolonie-Kommando
            </div>
            <h2 className="text-xl font-bold text-slate-100 flex flex-wrap items-center gap-2 mt-0.5">
              <span>🏛 {colony.name}</span>
              <span className="text-[10px] font-mono font-normal px-2 py-0.5 rounded border border-cyan-800/70 bg-cyan-950/40 text-cyan-300 uppercase">
                {COLONY_TIER_LABELS[colony.developmentTier]}
              </span>
              <span className="text-xs font-mono font-normal text-slate-400">
                {forecast.popUnits} Pops · {forecast.colonists.toLocaleString('de-DE')} Kolonisten
              </span>
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Kolonieverwaltung schließen"
            className="text-slate-400 hover:text-slate-200 w-8 h-8 rounded flex items-center justify-center font-mono cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Dreispaltiges Kommando: Ressourcen links, Inhalt mittig, Navigation rechts */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3 lg:gap-4 my-3 lg:my-4">
          <aside className="order-2 lg:order-1 w-full lg:w-52 shrink-0 lg:overflow-y-auto lg:pr-1">
            <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-2">
              Ressourcen der Kolonie
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-1 gap-2 text-xs font-mono">
              {/* Food */}
          <div className="p-2 bg-slate-950/80 border border-slate-800 rounded">
            <div className="text-slate-500 flex items-center gap-1">
              <span>{CORE_RESOURCES.food.symbol}</span>
              <span>Nahrung</span>
            </div>
            <div className="text-emerald-400 font-bold mt-1">
              {colony.netYields.food >= 0 ? `+${colony.netYields.food}` : colony.netYields.food}/Rd.
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">Vorrat: {colony.stockpile.food}</div>
          </div>

          {/* Production */}
          <div className="p-2 bg-slate-950/80 border border-slate-800 rounded">
            <div className="text-slate-500 flex items-center gap-1">
              <span>{CORE_RESOURCES.production.symbol}</span>
              <span>Bau</span>
            </div>
            <div className="text-amber-400 font-bold mt-1">+{colony.netYields.production}/Rd.</div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {colony.energyDeficit ? '⚠ -25% Drosselung' : '100% Effizienz'}
            </div>
          </div>

          {/* Energy */}
          <div className="p-2 bg-slate-950/80 border border-slate-800 rounded">
            <div className="text-slate-500 flex items-center gap-1">
              <span>{CORE_RESOURCES.energy.symbol}</span>
              <span>Energie</span>
            </div>
            <div
              className={`font-bold mt-1 ${
                colony.netYields.energy >= 0 ? 'text-sky-400' : 'text-rose-400 animate-pulse'
              }`}
            >
              {colony.netYields.energy >= 0 ? `+${colony.netYields.energy}` : colony.netYields.energy} Netto
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {colony.grossYields.energy} / -{colony.upkeep.energy}
            </div>
          </div>

          {/* Minerals */}
          <div className="p-2 bg-slate-950/80 border border-slate-800 rounded">
            <div className="text-slate-500 flex items-center gap-1">
              <span>{CORE_RESOURCES.minerals.symbol}</span>
              <span>Mineralien</span>
            </div>
            <div className="text-slate-200 font-bold mt-1">+{colony.netYields.minerals}/Rd.</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Lager: {colony.stockpile.minerals}</div>
          </div>

          {/* Rare Resources */}
          <div className="p-2 bg-slate-950/80 border border-slate-800 rounded">
            <div className="text-slate-500 flex items-center gap-1">
              <span>{CORE_RESOURCES.rareResources.symbol}</span>
              <span>Seltenes</span>
            </div>
            <div className="text-purple-400 font-bold mt-1">+{colony.netYields.rareResources}/Rd.</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Lager: {colony.stockpile.rareResources}</div>
          </div>

          {/* Science */}
          <div className="p-2 bg-slate-950/80 border border-slate-800 rounded">
            <div className="text-slate-500 flex items-center gap-1">
              <span>{CORE_RESOURCES.research.symbol}</span>
              <span>Forschung</span>
            </div>
            <div className="text-cyan-400 font-bold mt-1">+{colony.researchOutput}/Rd.</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Globaler Pool</div>
          </div>

          {/* Influence */}
          <div className="p-2 bg-slate-950/80 border border-slate-800 rounded">
            <div className="text-slate-500 flex items-center gap-1">
              <span>{CORE_RESOURCES.influence.symbol}</span>
              <span>Einfluss</span>
            </div>
            <div className="text-pink-400 font-bold mt-1">+{colony.influenceRate}/Rd.</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Vorrat: {colony.stockpile.influence}</div>
          </div>

          {/* Staatskasse (nur vorhandene Spielwerte) */}
          {treasury !== undefined && (
            <div className="p-2 bg-slate-950/80 border border-slate-800 rounded">
              <div className="text-slate-500 flex items-center gap-1">
                <span>◈</span>
                <span>Staatskasse</span>
              </div>
              <div className={`font-bold mt-1 ${treasury >= 0 ? 'text-amber-300' : 'text-rose-400'}`}>
                {Math.round(treasury * 10) / 10} Cr
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">Netto: {tax.netCredits}/Rd.</div>
            </div>
          )}
            </div>
          </aside>

          <nav
            aria-label="Kolonieverwaltung"
            className="order-1 lg:order-3 w-full lg:w-44 shrink-0 lg:border-l lg:border-slate-800 lg:pl-3"
          >
            <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-2">
              Verwaltung
            </div>
            <div className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0">
              {tabButton('overview')}
              {tabButton('tax', `${tax.taxRate}%`)}
              {tabButton('population', `${forecast.popUnits}`)}
              {tabButton('queue', `${colony.buildQueue.length}`)}
              {tabButton('buildings', `${slots.built}`)}
              {tabButton('units')}
            </div>
          </nav>

          {/* Tab Content */}
          <div className="order-3 lg:order-2 flex-1 min-w-0 min-h-0 flex flex-col">
            <div className="flex-1 overflow-y-auto lg:pr-1">
          {/* ---------------------------------------------------------------- */}
          {/* Übersicht                                                        */}
          {/* ---------------------------------------------------------------- */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-lg">
                  <h3 className="text-sm font-bold text-slate-100 mb-3">Kolonieprofil</h3>
                  <dl className="text-xs font-mono space-y-2">
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">Entwicklungsstufe</dt>
                      <dd className="text-slate-200">{COLONY_TIER_LABELS[colony.developmentTier]}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">Gegründet</dt>
                      <dd className="text-slate-200">
                        Runde {colony.foundedTurn} · {colony.foundedDate}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">Status</dt>
                      <dd className="text-slate-200">
                        {colony.status === 'active' ? 'Aktiv' : 'Aufgegeben'}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">Stadtzentrum</dt>
                      <dd className="text-slate-200">
                        [{colony.cityCenterCoord.q}, {colony.cityCenterCoord.r}]
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">Habitabilität</dt>
                      <dd className="text-slate-200">
                        {habitabilityPercent !== undefined ? `${habitabilityPercent}%` : '—'}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-lg">
                  <h3 className="text-sm font-bold text-slate-100 mb-3">Kennzahlen</h3>
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    <div className="p-2 bg-slate-950/80 border border-slate-800 rounded">
                      <div className="text-slate-500">Zufriedenheit</div>
                      <div className={`font-bold mt-1 ${approvalTone}`}>{tax.approval}%</div>
                    </div>
                    <div className="p-2 bg-slate-950/80 border border-slate-800 rounded">
                      <div className="text-slate-500">Steuersatz</div>
                      <div className="text-slate-200 font-bold mt-1">{tax.taxRate}%</div>
                    </div>
                    <div className="p-2 bg-slate-950/80 border border-slate-800 rounded">
                      <div className="text-slate-500">Netto-Credits</div>
                      <div
                        className={`font-bold mt-1 ${
                          tax.netCredits >= 0 ? 'text-amber-300' : 'text-rose-400'
                        }`}
                      >
                        {tax.netCredits >= 0 ? '+' : ''}
                        {tax.netCredits}/Rd.
                      </div>
                    </div>
                    <div className="p-2 bg-slate-950/80 border border-slate-800 rounded">
                      <div className="text-slate-500">Wachstum</div>
                      <div className="text-emerald-400 font-bold mt-1">
                        ×{forecast.combinedGrowthMultiplier.toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Koloniezentrum & Entwicklungsstufe */}
              <div
                data-colony-center-panel
                className="p-4 bg-slate-900/50 border border-slate-800 rounded-lg"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <h3 className="text-sm font-bold text-slate-100">Koloniezentrum</h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-cyan-800/70 bg-cyan-950/40 text-cyan-300 uppercase">
                    {COLONY_TIER_LABELS[colony.developmentTier]}
                  </span>
                </div>

                <dl className="grid grid-cols-2 gap-2 text-xs font-mono mb-3">
                  <div>
                    <dt className="text-slate-500">Entwicklungsstufe</dt>
                    <dd className="text-slate-200">
                      {COLONY_TIER_LABELS[colony.developmentTier]} ({tierIndex + 1}/
                      {DEVELOPMENT_TIERS.length})
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Stadtzentrum</dt>
                    <dd className="text-slate-200">
                      {cityCenter ? `Stufe ${cityCenter.level}/3` : '—'}
                    </dd>
                  </div>
                </dl>

                {nextTier && nextTierRequirement ? (
                  <>
                    <div className="text-[11px] font-mono text-slate-400 mb-1.5">
                      Aufwertung zu{' '}
                      <span className="text-cyan-300">{COLONY_TIER_LABELS[nextTier]}</span>
                    </div>
                    <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] font-mono mb-2">
                      <li
                        className={
                          colony.population >= nextTierRequirement.population
                            ? 'text-emerald-300'
                            : 'text-rose-300'
                        }
                      >
                        👥 {colony.population.toLocaleString('de-DE')} /{' '}
                        {nextTierRequirement.population.toLocaleString('de-DE')}
                      </li>
                      <li
                        className={
                          colony.stockpile.minerals >= nextTierRequirement.minerals
                            ? 'text-emerald-300'
                            : 'text-rose-300'
                        }
                      >
                        🪨 {colony.stockpile.minerals} / {nextTierRequirement.minerals}
                      </li>
                      <li
                        className={
                          colony.stockpile.rareResources >= nextTierRequirement.rareResources
                            ? 'text-emerald-300'
                            : 'text-rose-300'
                        }
                      >
                        💎 {colony.stockpile.rareResources} / {nextTierRequirement.rareResources}
                      </li>
                      <li
                        className={
                          colony.stockpile.influence >= nextTierRequirement.influence
                            ? 'text-emerald-300'
                            : 'text-rose-300'
                        }
                      >
                        ⚑ {colony.stockpile.influence} / {nextTierRequirement.influence}
                      </li>
                    </ul>
                    <p className="text-[10px] font-mono text-slate-500 mb-2">
                      Beim Aufwerten werden {nextTierRequirement.minerals} Mineralien,{' '}
                      {nextTierRequirement.rareResources} Seltene Ressourcen und{' '}
                      {nextTierRequirement.influence} Einfluss aus dem Kolonielager abgezogen.
                    </p>
                    <button
                      type="button"
                      data-upgrade-tier
                      disabled={!tierRequirementsMet || !onUpgradeTier}
                      onClick={handleTierUpgrade}
                      title={
                        tierRequirementsMet
                          ? 'Koloniezentrum auf die nächste Entwicklungsstufe aufwerten'
                          : `Voraussetzungen fehlen: ${missingTierRequirements.join(', ')}`
                      }
                      className={`w-full py-2 px-3 rounded font-mono text-xs font-semibold transition-colors ${
                        tierRequirementsMet && onUpgradeTier
                          ? 'bg-amber-600 hover:bg-amber-500 text-slate-950 cursor-pointer shadow-lg'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      {tierRequirementsMet
                        ? `Aufwerten zu ${COLONY_TIER_LABELS[nextTier]}`
                        : 'Voraussetzungen nicht erfüllt'}
                    </button>
                    {!tierRequirementsMet && (
                      <p className="text-[10px] font-mono text-amber-300 mt-1.5">
                        Fehlt: {missingTierRequirements.join(' · ')}
                      </p>
                    )}
                    {tierFeedback && (
                      <p
                        data-tier-feedback
                        className={`text-[10px] font-mono mt-1.5 ${
                          tierFeedback.startsWith('Aufwertung erfolgreich')
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {tierFeedback}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-[11px] font-mono text-emerald-400">
                    Maximale Entwicklungsstufe erreicht.
                  </p>
                )}
              </div>

              {/* Territorium & Bauplätze */}
              <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-lg">
                <h3 className="text-sm font-bold text-slate-100 mb-3">Territorium & Bauplätze</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                  <div>
                    <span className="text-slate-500">Beansprucht:</span>{' '}
                    <strong className="text-slate-200">{slots.territory}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Bewirtschaftet:</span>{' '}
                    <strong className="text-emerald-400">{forecast.workedTiles}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Bebaut:</span>{' '}
                    <strong className="text-cyan-400">{slots.built}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Freie Bauplätze:</span>{' '}
                    <strong className={slots.free > 0 ? 'text-cyan-400' : 'text-rose-400'}>
                      {slots.free}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Direkteinstieg in die Verwaltungsbereiche */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => setActiveTab('tax')}
                  className="p-4 bg-slate-900/50 hover:bg-slate-900 border border-slate-800 hover:border-amber-700/60 rounded-lg text-left cursor-pointer transition-colors"
                >
                  <div className="text-sm font-bold text-amber-300">Steuern anpassen</div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Steuersatz, Korruption, Wartung und Staatskasse dieser Kolonie.
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab('population')}
                  className="p-4 bg-slate-900/50 hover:bg-slate-900 border border-slate-800 hover:border-cyan-700/60 rounded-lg text-left cursor-pointer transition-colors"
                >
                  <div className="text-sm font-bold text-cyan-300">Bevölkerung verwalten</div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Wachstum, Zufriedenheit und Arbeitskräfte im Territorium.
                  </div>
                </button>
              </div>

              {/* Warnhinweise */}
              <div className="p-4 bg-slate-900/40 border border-slate-800/80 rounded-lg">
                <h3 className="text-xs font-bold text-slate-200 mb-2">Hinweise</h3>
                {warnings.length === 0 ? (
                  <p className="text-[11px] text-slate-500 font-mono">
                    Keine dringenden Warnungen. Die Kolonie arbeitet im Normalbetrieb.
                  </p>
                ) : (
                  <ul className="space-y-1 text-[11px] font-mono text-amber-300">
                    {warnings.map((warning) => (
                      <li key={warning}>⚠ {warning}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* Steuern                                                          */}
          {/* ---------------------------------------------------------------- */}
          {activeTab === 'tax' && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-lg">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-100">Steuersatz festlegen</h3>
                  <span className="text-xs font-mono text-amber-300 font-bold">
                    {tax.taxRate}% von 0–{MAX_TAX_RATE}%
                  </span>
                </div>
                <input
                  type="range"
                  min={MIN_TAX_RATE}
                  max={MAX_TAX_RATE}
                  step={5}
                  value={tax.taxRate}
                  onChange={(e) => onSetTaxRate?.(colony.id, Number(e.target.value))}
                  disabled={!onSetTaxRate}
                  className="w-full mt-3 accent-amber-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Steuersatz der Kolonie"
                />
                <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-1">
                  <span>0% · Milde</span>
                  <span>Standard 30%</span>
                  <span>60% · Abschöpfung</span>
                </div>

                <div className="flex flex-wrap gap-2 mt-3">
                  {TAX_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      onClick={() => onSetTaxRate?.(colony.id, preset)}
                      disabled={!onSetTaxRate}
                      className={`px-3 py-1 rounded border text-[11px] font-mono cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                        tax.taxRate === preset
                          ? 'bg-amber-950/70 border-amber-600 text-amber-200'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      {preset}%{preset === DEFAULT_TAX_RATE ? ' · Standard' : ''}
                    </button>
                  ))}
                </div>

                {!onSetTaxRate && (
                  <p className="text-[10px] font-mono text-slate-500 mt-2">
                    Steuersatz ist in dieser Ansicht schreibgeschützt.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                <div className="p-3 bg-slate-950/80 border border-slate-800 rounded">
                  <div className="text-slate-500">Steuereinnahmen</div>
                  <div className="text-emerald-400 font-bold mt-1">+{tax.taxRevenue} Cr</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">pro Runde</div>
                </div>
                <div className="p-3 bg-slate-950/80 border border-slate-800 rounded">
                  <div className="text-slate-500">Korruption</div>
                  <div
                    className={`font-bold mt-1 ${
                      tax.corruption >= 0.35 ? 'text-rose-400' : 'text-slate-200'
                    }`}
                  >
                    {Math.round(tax.corruption * 100)}%
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Abzug auf Einnahmen</div>
                </div>
                <div className="p-3 bg-slate-950/80 border border-slate-800 rounded">
                  <div className="text-slate-500">Wartung</div>
                  <div className="text-rose-300 font-bold mt-1">−{tax.upkeepCredits} Cr</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Gebäude pro Runde</div>
                </div>
                <div className="p-3 bg-slate-950/80 border border-slate-800 rounded">
                  <div className="text-slate-500">Privatsektor</div>
                  <div className="text-indigo-300 font-bold mt-1">+{tax.privateSectorTax} Cr</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    Handelsvolumen {tax.privateSectorVolume}
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-lg">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                  <div>
                    <div className="text-slate-500">Netto dieser Kolonie</div>
                    <div
                      className={`text-lg font-bold ${
                        tax.netCredits >= 0 ? 'text-amber-300' : 'text-rose-400'
                      }`}
                    >
                      {tax.netCredits >= 0 ? '+' : ''}
                      {tax.netCredits} Cr / Runde
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-slate-500">Staatskasse nach nächster Runde</div>
                    <div className="text-lg font-bold text-slate-100">
                      {treasury === undefined ? '—' : `${tax.projectedTreasury} Cr`}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-[10px] font-mono text-slate-500">
                  <span>Einnahmen + Privatsektor − Wartung dieser Kolonie</span>
                  <span>
                    Aktuell: {treasury === undefined ? '—' : `${Math.round(treasury * 10) / 10} Cr`}
                  </span>
                </div>
              </div>

              <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-lg">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400">Zufriedenheit</span>
                  <span className={`font-bold ${approvalTone}`}>{tax.approval}%</span>
                </div>
                <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800 mt-2">
                  <div
                    className={`h-full transition-all duration-300 ${
                      tax.approval >= 60
                        ? 'bg-emerald-500'
                        : tax.approval >= 40
                          ? 'bg-amber-500'
                          : 'bg-rose-500'
                    }`}
                    style={{ width: `${tax.approval}%` }}
                  />
                </div>
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] font-mono text-slate-500">
                  <span>
                    Wachstumsfaktor ×{tax.approvalGrowthFactor.toFixed(2)} (50–150 %)
                  </span>
                  <span>
                    {tax.approval < 40
                      ? 'Unruhe: Wachstum und Steuermoral leiden.'
                      : tax.taxRate > 40
                        ? 'Hohe Steuerlast: Korruption frisst einen Teil der Einnahmen.'
                        : 'Stabiler Steuerfrieden.'}
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed">
                Der Steuersatz wirkt sofort auf Korruption, Zufriedenheit und die angezeigten
                Einnahmen. Gutgeschrieben wird die Steuer erst beim Rundenwechsel – wiederholtes
                Verstellen erzeugt keine Ressourcen.
              </p>
            </div>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* Bevölkerung                                                      */}
          {/* ---------------------------------------------------------------- */}
          {activeTab === 'population' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                <div className="p-3 bg-slate-950/80 border border-slate-800 rounded">
                  <div className="text-slate-500">Bevölkerung</div>
                  <div className="text-slate-100 font-bold mt-1">{forecast.popUnits} Pops</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {forecast.colonists.toLocaleString('de-DE')} Kolonisten
                  </div>
                </div>
                <div className="p-3 bg-slate-950/80 border border-slate-800 rounded">
                  <div className="text-slate-500">Zufriedenheit</div>
                  <div className={`font-bold mt-1 ${approvalTone}`}>{tax.approval}%</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    Wachstum ×{forecast.approvalGrowthFactor.toFixed(2)}
                  </div>
                </div>
                <div className="p-3 bg-slate-950/80 border border-slate-800 rounded">
                  <div className="text-slate-500">Arbeitskräfte</div>
                  <div className="text-cyan-300 font-bold mt-1">
                    {forecast.workedTiles} / {forecast.workforceUnits}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {forecast.freeWorkers} frei
                  </div>
                </div>
                <div className="p-3 bg-slate-950/80 border border-slate-800 rounded">
                  <div className="text-slate-500">Wachstumsfaktor</div>
                  <div className="text-emerald-400 font-bold mt-1">
                    ×{forecast.combinedGrowthMultiplier.toFixed(2)}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    Habitabilität ×{forecast.habitabilityMultiplier.toFixed(2)}
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-lg">
                <div className="flex items-center justify-between text-xs font-mono mb-1">
                  <span className="text-slate-400">Bevölkerungswachstum (Nahrungsüberschuss)</span>
                  <span className="text-slate-200">
                    {Math.round(colony.growthFoodProgress * 10) / 10} / {colony.growthFoodRequired} (
                    {forecast.growthPercent}%)
                  </span>
                </div>
                <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className="bg-emerald-500 h-full transition-all duration-300"
                    style={{ width: `${forecast.growthPercent}%` }}
                  />
                </div>
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px] font-mono text-slate-500">
                  <span>
                    Nächste Runde: +{forecast.growthPerTurn} Fortschritt
                  </span>
                  <span>
                    {forecast.turnsToNextPop === null
                      ? 'Kein Wachstum: Nahrungsüberschuss fehlt.'
                      : `Voraussichtlich ${forecast.turnsToNextPop} Runde(n) bis +1 Pop.`}
                  </span>
                  <span>
                    {habitabilityPercent !== undefined
                      ? `Habitabilität ${habitabilityPercent}%`
                      : 'Habitabilität unbekannt'}
                  </span>
                </div>
                {!forecast.hasFoodSurplus && (
                  <p className="text-[10px] font-mono text-amber-300 mt-2">
                    ⚠ Nahrungsdefizit: Zuerst Agrarflächen bewirtschaften oder Fokus umstellen.
                  </p>
                )}
              </div>

              <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-lg">
                <h3 className="text-sm font-bold text-slate-100 mb-2">Automatisierte Bürger-Priorisierung</h3>
                <p className="text-xs text-slate-400 mb-3 leading-relaxed">
                  Bürger (Pops) bewirtschaften automatisch die ertragreichsten Hexfelder im
                  beanspruchten Territorium. Wählen Sie einen wirtschaftlichen Schwerpunkt:
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {WORK_FOCUS_OPTIONS.map(([focusKey, label, desc]) => (
                    <button
                      key={focusKey}
                      onClick={() => onSetWorkFocus(colony.id, focusKey)}
                      className={`p-3 rounded-lg border text-left cursor-pointer transition-colors ${
                        colony.workFocus === focusKey
                          ? 'bg-cyan-950/60 border-cyan-500 text-cyan-200 shadow-lg'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="font-semibold text-xs">{label}</div>
                      <div className="text-[10px] text-slate-400 mt-1 leading-snug">{desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-lg">
                <h3 className="text-sm font-bold text-slate-100 mb-3">Arbeitskräfte-Verteilung</h3>
                <div className="space-y-2 text-xs font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Bewirtschaftete Hexfelder</span>
                    <span className="text-emerald-400">{forecast.workedTiles}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Stadtzentrum (automatisch)</span>
                    <span className="text-slate-300">1</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Ungebundene Arbeitskräfte</span>
                    <span className={forecast.freeWorkers > 0 ? 'text-amber-300' : 'text-slate-500'}>
                      {forecast.freeWorkers}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-800 pt-2">
                    <span className="text-slate-400">Beanspruchtes Territorium</span>
                    <span className="text-slate-200">{colony.claimedHexKeys.length} Hexfelder</span>
                  </div>
                </div>
                {forecast.freeWorkers > 0 && (
                  <p className="text-[10px] font-mono text-slate-500 mt-2">
                    Freie Arbeitskräfte entstehen, wenn mehr Pops als bebaubare Felder verfügbar
                    sind. Erweitern Sie das Territorium oder bauen Sie ertragreichere Felder aus.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* Bauwarteschlange                                                 */}
          {/* ---------------------------------------------------------------- */}
          {activeTab === 'queue' && (
            <div className="space-y-4">
              {/* Active Build Queue */}
              <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-lg space-y-3">
                <h3 className="text-sm font-bold text-slate-100">Aktuelle Bauaufträge</h3>
                {colony.buildQueue.length === 0 ? (
                  <p className="text-xs text-slate-500 font-mono">
                    Die Bauwarteschlange ist leer. Wählen Sie unten ein Gebäude aus, um den Bau zu starten.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {colony.buildQueue.map((item, idx) => {
                      const required = Number.isFinite(item.requiredProduction)
                        ? Math.max(0, item.requiredProduction)
                        : 0;
                      const invested = Number.isFinite(item.investedProduction)
                        ? Math.max(0, item.investedProduction)
                        : 0;
                      const productionPerTurn = Number.isFinite(colony.netYields.production)
                        ? Math.max(1, colony.netYields.production)
                        : 1;
                      const progPercent =
                        required <= 0
                          ? 100
                          : Math.min(100, Math.round((invested / required) * 100));
                      const turnsLeft =
                        required <= invested
                          ? 0
                          : Math.ceil((required - invested) / productionPerTurn);
                      // Ein Auftrag ohne Bauzeit ist kein hängender 0-Runden-
                      // Auftrag, sondern wird beim nächsten Rundenwechsel
                      // ausdrücklich abgeschlossen.
                      const timeLabel =
                        required <= 0
                          ? 'Abschluss beim Rundenwechsel'
                          : turnsLeft <= 0
                            ? 'abschlussbereit'
                            : `~${turnsLeft} Runde(n)`;
                      return (
                        <div key={item.id} className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-200">
                              #{idx + 1} {item.name}
                            </span>
                            <span className="font-mono text-cyan-400 text-[11px]">
                              {timeLabel} ({invested}/{required})
                            </span>
                          </div>
                          <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-amber-500 h-full" style={{ width: `${progPercent}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Add New Building Section */}
              <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-100">Neues Gebäude in Auftrag geben</h3>
                  <span className="text-xs font-mono text-slate-400">
                    {preferredCoordUsable && targetHexForBuild
                      ? `Gewähltes Feld: [${targetHexForBuild.q}, ${targetHexForBuild.r}]`
                      : 'Automatische Feldwahl'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {Object.values(BUILDING_CATALOG)
                    .filter((b) => b.id !== 'city_center')
                    .map((bDef) => {
                      const canAffordMinerals = colony.stockpile.minerals >= bDef.baseMineralCost;
                      const canAffordRare = colony.stockpile.rareResources >= bDef.baseRareCost;
                      const creditCost = bDef.creditCost ?? 0;
                      const canAffordCredits = treasury === undefined || treasury >= creditCost;
                      const canAfford = canAffordMinerals && canAffordRare && canAffordCredits;
                      const buildTarget = buildTargets.get(bDef.id) ?? null;
                      const canBuild = canAfford && buildTarget !== null;
                      const availability = !buildTarget
                        ? { label: 'Bauplatz gesperrt', cls: 'border-rose-800/60 bg-rose-950/40 text-rose-300' }
                        : !canAfford
                          ? { label: 'Ressourcen fehlen', cls: 'border-amber-800/60 bg-amber-950/40 text-amber-300' }
                          : { label: 'Verfügbar', cls: 'border-emerald-800/60 bg-emerald-950/40 text-emerald-300' };

                      return (
                        <div
                          key={bDef.id}
                          className="p-3 bg-slate-950 border border-slate-800/80 rounded-lg flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-xs text-slate-200">{bDef.name}</span>
                              <span
                                className={`text-[9px] font-mono px-1.5 py-0.5 rounded border uppercase ${availability.cls}`}
                              >
                                {availability.label}
                              </span>
                            </div>
                            <div className="mt-1 text-[10px] font-mono text-slate-500 uppercase">
                              {bDef.category} · max. Stufe {bDef.maxLevel}
                            </div>
                            <p className="text-[11px] text-slate-400 mt-1 leading-snug">{bDef.description}</p>
                            <div className="mt-2 text-[10px] font-mono text-slate-400 space-x-2">
                              <span>Bau: {bDef.baseProductionCost} ⚙️</span>
                              <span className={canAffordMinerals ? 'text-slate-300' : 'text-rose-400 font-bold'}>
                                {bDef.baseMineralCost} 🪨
                              </span>
                              {bDef.baseRareCost > 0 && (
                                <span className={canAffordRare ? 'text-purple-300' : 'text-rose-400 font-bold'}>
                                  {bDef.baseRareCost} 💎
                                </span>
                              )}
                              <span>Unterhalt: {bDef.energyUpkeepPerLevel} ⚡</span>
                              {creditCost > 0 && (
                                <span className={canAffordCredits ? 'text-amber-300' : 'text-rose-400 font-bold'}>
                                  {creditCost} ◈
                                </span>
                              )}
                            </div>
                            <div className="mt-1 text-[10px] font-mono text-slate-500">
                              {buildTarget
                                ? `Ziel: [${buildTarget.q}, ${buildTarget.r}]`
                                : 'Ziel: kein freies Hexfeld'}
                            </div>
                          </div>

                          <button
                            disabled={!canBuild}
                            onClick={() => {
                              if (buildTarget) onQueueBuilding(colony.id, bDef.id, buildTarget);
                            }}
                            className={`mt-3 py-1.5 px-3 rounded text-xs font-mono cursor-pointer transition-colors ${
                              canBuild
                                ? 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-md'
                                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                            }`}
                          >
                            {buildTarget !== null
                              ? canAfford
                                ? 'Bauen'
                                : 'Ressourcen fehlen'
                              : 'Kein freies Feld'}
                          </button>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* Bauplätze                                                        */}
          {/* ---------------------------------------------------------------- */}
          {activeTab === 'buildings' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                <div className="p-3 bg-slate-950/80 border border-slate-800 rounded">
                  <div className="text-slate-500">Bebaut</div>
                  <div className="text-cyan-300 font-bold mt-1">{slots.built}</div>
                </div>
                <div className="p-3 bg-slate-950/80 border border-slate-800 rounded">
                  <div className="text-slate-500">Freie Bauplätze</div>
                  <div className={slots.free > 0 ? 'text-emerald-400 font-bold mt-1' : 'text-rose-400 font-bold mt-1'}>
                    {slots.free}
                  </div>
                </div>
                <div className="p-3 bg-slate-950/80 border border-slate-800 rounded">
                  <div className="text-slate-500">Durch Distrikte belegt</div>
                  <div className="text-slate-200 font-bold mt-1">{slots.blockedByDistricts}</div>
                </div>
                <div className="p-3 bg-slate-950/80 border border-slate-800 rounded">
                  <div className="text-slate-500">Territorium</div>
                  <div className="text-slate-200 font-bold mt-1">{slots.territory}</div>
                </div>
              </div>

              {/* Grafische Kolonieansicht (MoO2-Stil) */}
              <div className="p-3 bg-slate-900/50 border border-slate-800 rounded-lg space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-100">Stadtansicht</h3>
                    <p className="text-[10px] font-mono text-slate-500">
                      {SKYLINE_TERRAIN_LABELS[skylinePalette.id]} · Platzhaltergrafik, echte Tiles folgen
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono">
                    <span className="flex items-center gap-1 text-slate-400">
                      <span className="inline-block w-2 h-2 rounded-sm bg-cyan-400" /> Gebäude
                    </span>
                    <span className="flex items-center gap-1 text-slate-400">
                      <span className="inline-block w-2 h-2 rounded-sm border border-dashed border-cyan-300" /> Im Bau
                    </span>
                    <span className="flex items-center gap-1 text-slate-400">
                      <span className="inline-block w-0 h-0 border-l-[4px] border-r-[4px] border-b-[7px] border-l-transparent border-r-transparent border-b-amber-400" />{' '}
                      Gedrosselt
                    </span>
                  </div>
                </div>
                <ColonySkyline colony={colony} surface={surface} planetType={planetType} />
                <p className="text-[10px] font-mono text-slate-500">
                  {slots.built} Gebäude errichtet
                  {colony.buildQueue.some((item) => item.type === 'building') &&
                    ` · ${colony.buildQueue.filter((item) => item.type === 'building').length} im Bau`}
                  {' · Positionen deterministisch aus der Kolonie-ID'}
                </p>
              </div>

              <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-100">Errichtete Gebäude</h3>
                  <button
                    onClick={() => setActiveTab('queue')}
                    className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 cursor-pointer"
                  >
                    + Gebäude planen
                  </button>
                </div>

                {colony.buildings.length === 0 ? (
                  <p className="text-xs text-slate-500 font-mono">
                    Noch keine Gebäude errichtet. Öffnen Sie die Bauwarteschlange, um die ersten
                    Anlagen zu planen.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {colony.buildings.map((bInst) => {
                      const bDef = BUILDING_CATALOG[bInst.buildingDefId];
                      if (!bDef) return null;
                      const canUpgrade = bInst.level < bDef.maxLevel;
                      const nextLevel = bInst.level + 1;
                      const upMineral = Math.round(bDef.baseMineralCost * 0.75 * nextLevel);
                      const upCredits = Math.round((bDef.creditCost ?? 0) * 0.75 * nextLevel);
                      const upProduction = BuildQueueManager.getUpgradeProductionCost(
                        bDef,
                        nextLevel
                      );
                      const gainParts = (Object.entries(bDef.yieldsPerLevel) as [keyof ResourceYields, number][])
                        .filter(([, value]) => (value ?? 0) > 0)
                        .map(([resource, value]) => `+${value} ${RESOURCE_LABELS[resource]}`);

                      return (
                        <div
                          key={bInst.id}
                          className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg flex flex-wrap items-center justify-between gap-3"
                        >
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-xs text-slate-200">{bDef.name}</span>
                              <span className="text-[10px] font-mono text-cyan-400">
                                Stufe {bInst.level}/{bDef.maxLevel}
                              </span>
                              <span className="text-[10px] font-mono text-slate-500">
                                Hex [{bInst.hexCoord.q}, {bInst.hexCoord.r}]
                              </span>
                              <span
                                className={`text-[9px] font-mono px-1.5 py-0.5 rounded border uppercase ${
                                  bInst.isActive
                                    ? 'border-emerald-800/60 bg-emerald-950/40 text-emerald-300'
                                    : 'border-slate-700 bg-slate-950 text-slate-400'
                                }`}
                              >
                                {bInst.isActive ? 'Aktiv' : 'Gedrosselt'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-0.5">{bDef.description}</p>
                            <div className="text-[10px] font-mono text-slate-500 mt-1">
                              Unterhalt: {bDef.energyUpkeepPerLevel * bInst.level} ⚡
                              {(bDef.creditUpkeepPerLevel ?? 0) > 0 &&
                                ` · ${Math.round((bDef.creditUpkeepPerLevel ?? 0) * bInst.level * 10) / 10} Cr`}{' '}
                              / Runde
                              {gainParts.length > 0 && ` · Erträge: ${gainParts.join(', ')}`}
                            </div>
                          </div>

                          {canUpgrade && (
                            <button
                              onClick={() => onQueueUpgrade(colony.id, bInst.id)}
                              className="py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 rounded text-xs font-mono cursor-pointer transition-colors"
                            >
                              {upProduction > 0
                                ? `Ausbauen Stufe ${nextLevel}`
                                : `Sofort aufwerten auf Stufe ${nextLevel}`}{' '}
                              · {upMineral} 🪨
                              {upCredits > 0 && ` · ${upCredits} ◈`}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed">
                Ein Bauplatz ist ein freies, beanspruchtes Hexfeld ohne Gebäude, Distrikt oder
                Stadtzentrum. Biom- und Technologie-Regeln prüft der Gebäudekatalog beim Planen.
              </p>
            </div>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* Rekrutierung                                                     */}
          {/* ---------------------------------------------------------------- */}
          {activeTab === 'units' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">
                Rekrutieren Sie Bodentruppen zur planetaren Erkundung, Grenzsicherung und Entdeckung unterirdischer Vorkommen:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Object.values(UNIT_CATALOG).map((uDef) => {
                  const canAfford =
                    colony.stockpile.minerals >= uDef.mineralCost &&
                    colony.stockpile.rareResources >= uDef.rareCost;

                  return (
                    <div
                      key={uDef.id}
                      className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-slate-200">{uDef.name}</span>
                          <span className="text-[10px] font-mono text-cyan-400">
                            {uDef.movementPoints} MP · Sicht {uDef.visionRadius}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 leading-snug">{uDef.description}</p>
                        <div className="mt-2 text-[10px] font-mono text-slate-400 space-x-2">
                          <span>Bau: {uDef.productionCost} ⚙️</span>
                          <span className={canAfford ? 'text-slate-300' : 'text-rose-400 font-bold'}>
                            {uDef.mineralCost} 🪨
                          </span>
                          {uDef.rareCost > 0 && <span>{uDef.rareCost} 💎</span>}
                          <span>Stärke: {uDef.combatStrength} ⚔️</span>
                        </div>
                      </div>

                      <button
                        disabled={!canAfford}
                        onClick={() => onQueueUnit(colony.id, uDef.id)}
                        className={`mt-3 py-1.5 px-3 rounded text-xs font-mono cursor-pointer transition-colors ${
                          canAfford
                            ? 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-md'
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        {canAfford ? 'Rekrutieren' : 'Mineralien fehlen'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
