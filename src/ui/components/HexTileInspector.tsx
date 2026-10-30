/**
 * Astraea 4X - Hex Tile Tactical Inspector (Module 4)
 * Provides detailed surface telemetry, ownership management, construction triggers, and unit orders.
 */

import React, { useState } from 'react';
import { BUILDING_CATALOG } from '../../data/buildingCatalog.ts';
import { DISTRICT_CATALOG } from '../../data/districtCatalog.ts';
import { DEPOSIT_CATALOG } from '../../data/resourceCatalog.ts';
import { BIOME_CATALOG } from '../../data/terrainCatalog.ts';
import { ColonyExpansion } from '../../core/colonyExpansion.ts';
import { COLONY_TIER_LABELS } from '../../core/colonyManager.ts';
import { DistrictManager } from '../../core/districtManager.ts';
import { HexMath } from '../../surface/hexMath.ts';
import {
  Colony,
  HexCoord,
  PlanetHexTile,
  PlanetSurface,
  SurfaceUnit,
} from '../../core/types.ts';

const DEPOSIT_YIELD_LABELS: Record<string, string> = {
  food: 'Nahrung',
  production: 'Produktion',
  energy: 'Energie',
  minerals: 'Mineralien',
  rareResources: 'Seltene Ressourcen',
  research: 'Forschung',
  influence: 'Einfluss',
};

interface HexTileInspectorProps {
  tile: PlanetHexTile | null;
  surface: PlanetSurface;
  colony: Colony | null;
  unitsOnTile: SurfaceUnit[];
  selectedUnit: SurfaceUnit | null;
  completedTechIds: string[];
  onClaimHex: (coord: HexCoord) => void;
  onOpenBuildMenu: (coord: HexCoord) => void;
  /**
   * Öffnet die Kolonieverwaltung über eine stabile Kolonie-ID. Optional, damit
   * der Inspector auch ohne Modal-Anbindung verwendbar bleibt.
   */
  onOpenColonyManagement?: (colonyId: string) => void;
  onUpgradeBuilding: (buildingInstanceId: string) => void;
  onPlaceDistrict: (districtDefId: string, anchor: HexCoord) => void;
  onRemoveDistrict: (districtId: string) => void;
  onSelectUnit: (unitId: string | null) => void;
  onClose: () => void;
  /**
   * Blendet koloniegebundene Abschnitte (Bebauung, Territorium, Distrikte,
   * Bauaktionen) aus. Das Testlabor nutzt denselben Inspector, zeigt aber nur
   * Gelände-, Ertrags- und Vorkommensdaten.
   */
  showColonySections?: boolean;
}

type SectionKey =
  | 'terrain'
  | 'yields'
  | 'deposits'
  | 'territory'
  | 'development'
  | 'building'
  | 'districts'
  | 'units';

interface SectionProps {
  title: string;
  summary?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ title, summary, open, onToggle, children }) => (
  <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-lg">
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="w-full flex items-center justify-between gap-2 text-left cursor-pointer group"
    >
      <span className="text-[10px] font-mono uppercase text-slate-400 font-semibold group-hover:text-slate-200 transition-colors">
        {title}
      </span>
      <span className="flex items-center gap-1.5 min-w-0">
        {!open && summary && (
          <span className="font-mono text-[10px] text-slate-500 truncate">{summary}</span>
        )}
        <span className="text-slate-500 text-[10px]">{open ? '▾' : '▸'}</span>
      </span>
    </button>
    {open && <div className="space-y-2 pt-2">{children}</div>}
  </div>
);

export const HexTileInspector: React.FC<HexTileInspectorProps> = ({
  tile,
  surface,
  colony,
  unitsOnTile,
  selectedUnit,
  completedTechIds,
  onClaimHex,
  onOpenBuildMenu,
  onOpenColonyManagement,
  onUpgradeBuilding,
  onPlaceDistrict,
  onRemoveDistrict,
  onSelectUnit,
  onClose,
  showColonySections = true,
}) => {
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    terrain: true,
    yields: true,
    deposits: true,
    territory: true,
    development: true,
    building: true,
    districts: false,
    units: true,
  });
  const toggleSection = (key: SectionKey) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  if (!tile) return null;

  const biome = BIOME_CATALOG[tile.biome];

  // Klima-Telemetrie aus der Weltgenerierung (ab Generator-Version 4). Ältere
  // Spielstände besitzen die optionalen Felder nicht und zeigen sie nicht an.
  const temperatureLabel =
    tile.temperature === undefined
      ? null
      : tile.temperature < 0.18
        ? 'Eisig'
        : tile.temperature < 0.34
          ? 'Kalt'
          : tile.temperature < 0.58
            ? 'Gemäßigt'
            : tile.temperature < 0.76
              ? 'Warm'
              : 'Glühend';
  const rainfallLabel =
    tile.rainfall === undefined
      ? null
      : tile.rainfall < 0.2
        ? 'Arid'
        : tile.rainfall < 0.4
          ? 'Trocken'
          : tile.rainfall < 0.62
            ? 'Feucht'
            : 'Sehr feucht';

  const isClaimedByCurrentColony = colony && tile.claimedByColonyId === colony.id;
  const isClaimed = !!tile.claimedByColonyId;

  // Expansion check
  const expansionCheck = colony
    ? ColonyExpansion.canClaimHex(colony, tile.coord, surface)
    : { allowed: false, cost: 0, reason: 'Keine Kolonie verfügbar.' };

  // Building info if present
  const buildingInstance = colony?.buildings.find((b) => b.id === tile.buildingInstanceId);
  const buildingDef = buildingInstance ? BUILDING_CATALOG[buildingInstance.buildingDefId] : null;

  // District info if present
  const districtInstance = colony?.districts?.find((d) => d.id === tile.districtInstanceId);
  const districtDef = districtInstance ? DISTRICT_CATALOG[districtInstance.districtDefId] : null;
  const districtCategories: Record<string, string> = {
    residential: 'Wohngebiet',
    industrial: 'Industrie',
    agricultural: 'Landwirtschaft',
    research: 'Forschung',
  };

  const yieldSummary =
    [
      biome.baseYields.food > 0 ? `+${biome.baseYields.food} Nah.` : null,
      biome.baseYields.production > 0 ? `+${biome.baseYields.production} Prod.` : null,
      biome.baseYields.energy > 0 ? `+${biome.baseYields.energy} Ener.` : null,
      biome.baseYields.minerals > 0 ? `+${biome.baseYields.minerals} Min.` : null,
      biome.baseYields.research > 0 ? `+${biome.baseYields.research} For.` : null,
    ]
      .filter(Boolean)
      .join(' · ') || 'Kein Grundertrag';

  const depositSummary =
    tile.isDepositDiscovered && tile.deposit !== 'none'
      ? DEPOSIT_CATALOG[tile.deposit].name
      : tile.visibility === 'unseen'
        ? 'Unbekannt'
        : 'Keine Vorkommen';

  const territorySummary = isClaimedByCurrentColony
    ? `Kolonie ${colony?.name ?? ''}`.trim()
    : isClaimed
      ? 'Fremd beansprucht'
      : 'Niemandsland';

  const buildingSummary =
    buildingInstance && buildingDef
      ? `${buildingDef.name} · Stufe ${buildingInstance.level}/${buildingDef.maxLevel}`
      : undefined;

  const cityCenterBuilding = colony?.buildings.find((b) => b.buildingDefId === 'city_center') ?? null;
  const developmentSummary = tile.isCityCenter
    ? `Koloniezentrum · ${COLONY_TIER_LABELS[colony?.developmentTier ?? 'outpost']}`
    : buildingInstance && buildingDef
      ? `${buildingDef.name} · Stufe ${buildingInstance.level}/${buildingDef.maxLevel}`
      : districtInstance && districtDef
        ? districtDef.name
        : 'Unbebaut';

  const districtsSummary =
    districtInstance && districtDef
      ? districtDef.name
      : `${Object.keys(DISTRICT_CATALOG).length} Optionen`;

  const unitsSummary = `${unitsOnTile.length} ${
    unitsOnTile.length === 1 ? 'Einheit' : 'Einheiten'
  }`;

  return (
    <aside
      data-hex-inspector
      className="w-80 h-full bg-slate-950/95 border-l border-slate-800/80 flex flex-col font-sans select-none z-30 shadow-2xl backdrop-blur-md"
    >
      {/* Header */}
      <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
        <div>
          <div className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest">
            Oberflächen-Sektor
          </div>
          <h2 className="text-sm font-bold text-slate-100 flex items-center gap-1.5 mt-0.5">
            <span>{biome.displayName}</span>
            <span className="text-xs font-mono text-slate-500">
              [{tile.coord.q}, {tile.coord.r}]
            </span>
          </h2>
        </div>
        <button
          onClick={onClose}
          aria-label="Kachelinformationen schließen"
          className="text-slate-400 hover:text-slate-200 w-7 h-7 rounded flex items-center justify-center font-mono cursor-pointer"
        >
          ✕
        </button>
      </div>

      {selectedUnit && (
        <div className="px-4 py-2 border-b border-cyan-900/60 bg-cyan-950/30 flex items-center justify-between gap-2">
          <span className="text-[11px] font-mono text-cyan-200 truncate">
            Einheit ausgewählt: {selectedUnit.name}
          </span>
          <button
            onClick={() => onSelectUnit(null)}
            className="shrink-0 px-2 py-1 rounded border border-cyan-800/70 text-[10px] font-mono text-cyan-200 hover:bg-cyan-900/50 cursor-pointer"
          >
            Auswahl aufheben
          </button>
        </div>
      )}

      {/* Content Scroll */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {/* Terrain & Physical Telemetry */}
        <Section
          title="Topografie & Umgebung"
          summary={`Stufe ${tile.elevation}`}
          open={openSections.terrain}
          onToggle={() => toggleSection('terrain')}
        >
          <p className="text-slate-400 text-[11px] leading-relaxed">{biome.description}</p>
          <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
            <div>
              <span className="text-slate-500">Höhe:</span> Stufe {tile.elevation}
            </div>
            <div>
              <span className="text-slate-500">Bewegungskosten:</span>{' '}
              {biome.isImpassable ? 'Unpassierbar' : `${biome.movementCost} MP`}
            </div>
            <div>
              <span className="text-slate-500">Gewässer:</span>{' '}
              {tile.isLake
                ? 'Süßwassersee'
                : tile.flowsTo
                  ? `Fluss (Abfluss ${tile.riverDischarge ?? 0})`
                  : '—'}
            </div>
            {temperatureLabel && (
              <div>
                <span className="text-slate-500">Klima:</span> {temperatureLabel}
                {tile.temperature !== undefined && (
                  <span className="text-slate-600">
                    {' '}
                    ({Math.round(tile.temperature * 100)} %)
                  </span>
                )}
              </div>
            )}
            {rainfallLabel && (
              <div>
                <span className="text-slate-500">Niederschlag:</span> {rainfallLabel}
              </div>
            )}
            {tile.drainage !== undefined && (
              <div>
                <span className="text-slate-500">Abfluss:</span>{' '}
                {Math.round(tile.drainage * 100)} %
              </div>
            )}
            {tile.hasHazard && (
              <div className="col-span-2 text-amber-300">
                <span className="text-slate-500">Gefahr:</span>{' '}
                {tile.hazardDescription ?? 'Geländegefahr gemeldet'}
              </div>
            )}
            {tile.terraformedStatus && tile.terraformedStatus !== 'native' && (
              <div className="col-span-2">
                <span className="text-slate-500">Terraforming:</span>{' '}
                {tile.terraformedStatus === 'improved' ? 'Verbessert' : 'Atmosphäre bereinigt'}
              </div>
            )}
          </div>
        </Section>

        {/* Base Yields */}
        <Section
          title="Sektor-Grundertrag"
          summary={yieldSummary}
          open={openSections.yields}
          onToggle={() => toggleSection('yields')}
        >
          <div className="flex flex-wrap gap-2 font-mono text-[11px] pt-1">
            {biome.baseYields.food > 0 && (
              <span className="text-emerald-400">+{biome.baseYields.food} Nahrung</span>
            )}
            {biome.baseYields.production > 0 && (
              <span className="text-amber-400">+{biome.baseYields.production} Produktion</span>
            )}
            {biome.baseYields.energy > 0 && (
              <span className="text-sky-400">+{biome.baseYields.energy} Energie</span>
            )}
            {biome.baseYields.minerals > 0 && (
              <span className="text-slate-300">+{biome.baseYields.minerals} Mineralien</span>
            )}
            {biome.baseYields.research > 0 && (
              <span className="text-cyan-400">+{biome.baseYields.research} Forschung</span>
            )}
          </div>
        </Section>

        {/* Resource Deposits */}
        <Section
          title="Geologische Vorkommen"
          summary={depositSummary}
          open={openSections.deposits}
          onToggle={() => toggleSection('deposits')}
        >
          {tile.isDepositDiscovered && tile.deposit !== 'none' ? (
            <div className="space-y-1">
              <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                <span>{DEPOSIT_CATALOG[tile.deposit].icon}</span>
                <span>{DEPOSIT_CATALOG[tile.deposit].name}</span>
              </div>
              <p className="text-[11px] text-slate-400">{DEPOSIT_CATALOG[tile.deposit].description}</p>
              {Object.keys(DEPOSIT_CATALOG[tile.deposit].yieldBonus).length > 0 && (
                <div className="font-mono text-[10px] text-emerald-300">
                  Zusatzertrag:{' '}
                  {Object.entries(DEPOSIT_CATALOG[tile.deposit].yieldBonus)
                    .filter(([, amount]) => (amount ?? 0) > 0)
                    .map(([key, amount]) => `+${amount} ${DEPOSIT_YIELD_LABELS[key] ?? key}`)
                    .join(' · ')}
                </div>
              )}
            </div>
          ) : tile.visibility === 'unseen' ? (
            <div className="text-slate-500 font-mono text-[11px]">Bereich noch nicht erkundet.</div>
          ) : (
            <div className="space-y-1">
              <div className="text-slate-500 font-mono text-[11px]">
                Keine besonderen Ressourcenvorkommen.
              </div>
              <div className="text-slate-600 font-mono text-[10px]">
                Tiefenscan erforderlich, um verdeckte Lagerstätten aufzudecken.
              </div>
            </div>
          )}
        </Section>

        {showColonySections && (
          <>
        {/* Bebauungsstatus */}
        <Section
          title="Bebauungsstatus"
          summary={developmentSummary}
          open={openSections.development}
          onToggle={() => toggleSection('development')}
        >
          {tile.isCityCenter ? (
            <div className="space-y-1 font-mono text-[11px]">
              <div className="text-cyan-300 font-semibold">🏛 Koloniezentrum</div>
              <div className="text-slate-400">
                Entwicklungsstufe:{' '}
                <span className="text-slate-200">
                  {COLONY_TIER_LABELS[colony?.developmentTier ?? 'outpost']}
                </span>
              </div>
              <div className="text-slate-400">
                Gebäudestufe:{' '}
                <span className="text-slate-200">
                  {cityCenterBuilding ? `${cityCenterBuilding.level}/3` : '—'}
                </span>
              </div>
              <div className="text-slate-500 text-[10px]">
                {tile.isWorked ? 'Bewirtschaftet' : 'Nicht bewirtschaftet'}
              </div>
            </div>
          ) : buildingInstance && buildingDef ? (
            <div className="space-y-1 font-mono text-[11px]">
              <div className="text-slate-200 font-semibold">{buildingDef.name}</div>
              <div className="text-slate-400">
                Stufe {buildingInstance.level}/{buildingDef.maxLevel} ·{' '}
                {buildingInstance.isActive ? 'Aktiv' : 'Gedrosselt'}
              </div>
            </div>
          ) : districtInstance && districtDef ? (
            <div className="space-y-1 font-mono text-[11px]">
              <div className="text-slate-200 font-semibold">{districtDef.name}</div>
              <div className="text-slate-400">Distrikt · {districtInstance.coveredHexKeys.length} Sektoren</div>
            </div>
          ) : (
            <div className="space-y-1 font-mono text-[11px]">
              <div className="text-slate-300">Unbebaut</div>
              <div className="text-slate-500 text-[10px]">
                {isClaimedByCurrentColony
                  ? 'Freier Bauplatz im Kolonietterritorium.'
                  : isClaimed
                    ? 'Kachel gehört zu einer fremden Kolonie.'
                    : 'Niemandsland – kein Bauplatz ohne Gebietsanspruch.'}
              </div>
            </div>
          )}
        </Section>

        {/* Territory Status */}
        <Section
          title="Gebietszugehörigkeit"
          summary={territorySummary}
          open={openSections.territory}
          onToggle={() => toggleSection('territory')}
        >
          {isClaimedByCurrentColony ? (
            <div className="space-y-1">
              <div className="text-emerald-400 font-semibold">
                Territorium von {colony?.name}
              </div>
              <div className="font-mono text-[11px] text-slate-400">
                Status: {tile.isCityCenter ? '🏛 Kolonie-Zentrum' : tile.isWorked ? '🔨 Bewirtschaftet' : '⏸ Unbewirtschaftet'}
              </div>
              {tile.isCityCenter && onOpenColonyManagement && (tile.claimedByColonyId || colony) && (
                <button
                  onClick={() =>
                    onOpenColonyManagement((tile.claimedByColonyId ?? colony?.id) as string)
                  }
                  className="mt-1 w-full py-2 px-3 bg-cyan-600/90 hover:bg-cyan-500 text-white rounded font-mono text-xs font-semibold shadow-lg cursor-pointer transition-colors"
                >
                  🏛 Kolonie verwalten
                </button>
              )}
            </div>
          ) : isClaimed ? (
            <div className="text-amber-400 font-semibold">
              Beansprucht durch Kolonie {tile.claimedByColonyId}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-slate-400 font-mono">Unbeanspruchtes Niemandsland</div>
              {colony && (
                <button
                  disabled={!expansionCheck.allowed}
                  onClick={() => onClaimHex(tile.coord)}
                  className={`w-full py-2 px-3 rounded font-mono text-xs font-semibold cursor-pointer transition-colors ${
                    expansionCheck.allowed
                      ? 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  {expansionCheck.allowed
                    ? `Gebiet beanspruchen (${expansionCheck.cost} Einfluss)`
                    : `Nicht beanspruchbar (${expansionCheck.reason})`}
                </button>
              )}
            </div>
          )}
        </Section>

        {/* Buildings on Tile */}
        {buildingInstance && buildingDef && (
          <Section
            title="Errichtetes Bauwerk"
            summary={buildingSummary}
            open={openSections.building}
            onToggle={() => toggleSection('building')}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-100">{buildingDef.name}</span>
              <span className="font-mono text-cyan-400 font-semibold">
                Stufe {buildingInstance.level}/{buildingDef.maxLevel}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">{buildingDef.description}</p>

            <div className="pt-1 font-mono text-[11px] text-slate-400">
              Unterhalt: {buildingDef.energyUpkeepPerLevel * buildingInstance.level} Energie
            </div>

            {buildingInstance.level < buildingDef.maxLevel && (
              <button
                onClick={() => onUpgradeBuilding(buildingInstance.id)}
                className="w-full mt-1 py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 rounded font-mono text-xs cursor-pointer transition-colors"
              >
                Ausbaustufe erhöhen (Upgrade)
              </button>
            )}
          </Section>
        )}

        {/* Districts */}
        {colony && isClaimedByCurrentColony && (
          <Section
            title={districtInstance ? 'Distrikt' : 'Distrikte'}
            summary={districtsSummary}
            open={openSections.districts}
            onToggle={() => toggleSection('districts')}
          >
            {districtInstance && districtDef ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-100">{districtDef.name}</span>
                  <span className="font-mono text-[10px] text-slate-500">
                    {districtCategories[districtDef.category] ?? districtDef.category}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">{districtDef.description}</p>
                <div className="flex flex-wrap gap-2 font-mono text-[11px] pt-1">
                  {Object.entries(districtDef.yieldsPerTurn).map(([yieldKey, amount]) =>
                    amount ? (
                      <span key={yieldKey} className="text-emerald-400">
                        +{amount} {yieldKey}
                      </span>
                    ) : null
                  )}
                </div>
                <div className="font-mono text-[11px] text-slate-400">
                  Fläche: {districtInstance.coveredHexKeys.length} Sektoren · Unterhalt:{' '}
                  {districtDef.energyUpkeep} Energie · Errichtet in Runde {districtInstance.placedTurn}
                </div>
                <button
                  onClick={() => onRemoveDistrict(districtInstance.id)}
                  className="w-full mt-1 py-1.5 px-3 bg-slate-800 hover:bg-rose-900/60 text-rose-300 border border-slate-700 rounded font-mono text-xs cursor-pointer transition-colors"
                >
                  Distrikt abreißen
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {Object.values(DISTRICT_CATALOG).map((def) => {
                  const check = DistrictManager.canPlaceDistrict(
                    colony,
                    surface,
                    def.id,
                    tile.coord,
                    completedTechIds
                  );
                  const techLocked =
                    def.requiredTechId && !completedTechIds.includes(def.requiredTechId);
                  return (
                    <div key={def.id} className="p-2 bg-slate-950 border border-slate-800 rounded space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-200">{def.name}</span>
                        <span className="font-mono text-[10px] text-slate-500">
                          {districtCategories[def.category] ?? def.category}
                        </span>
                      </div>
                      <div className="font-mono text-[10px] text-slate-400">
                        {def.footprint.length} Sektoren · {def.mineralCost} Mineralien
                        {def.rareCost > 0 ? ` · ${def.rareCost} Seltene` : ''} · Unterhalt{' '}
                        {def.energyUpkeep} Energie
                      </div>
                      {techLocked && (
                        <div className="font-mono text-[10px] text-amber-400">
                          Technologie erforderlich: {def.requiredTechId}
                        </div>
                      )}
                      <button
                        disabled={!check.allowed}
                        title={check.reason}
                        onClick={() => onPlaceDistrict(def.id, tile.coord)}
                        className={`w-full py-1.5 px-3 rounded font-mono text-xs font-semibold transition-colors ${
                          check.allowed
                            ? 'bg-cyan-600 hover:bg-cyan-500 text-white cursor-pointer'
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        {check.allowed ? 'Distrikt platzieren' : `Nicht platzierbar (${check.reason})`}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
        )}

        {/* Empty claimed tile: Construct building button */}
        {isClaimedByCurrentColony && !tile.buildingInstanceId && !tile.districtInstanceId && !tile.isCityCenter && (
          <button
            onClick={() => onOpenBuildMenu(tile.coord)}
            className="w-full py-2 px-3 bg-emerald-600/90 hover:bg-emerald-500 text-white rounded font-mono text-xs font-semibold shadow-lg cursor-pointer transition-colors"
          >
            + Neues Gebäude errichten
          </button>
        )}
          </>
        )}

        {/* Units stationed on Tile */}
        {unitsOnTile.length > 0 && (
          <Section
            title="Stationierte Truppen"
            summary={unitsSummary}
            open={openSections.units}
            onToggle={() => toggleSection('units')}
          >
            {unitsOnTile.map((unit) => (
              <div
                key={unit.id}
                onClick={() => onSelectUnit(selectedUnit?.id === unit.id ? null : unit.id)}
                className={`p-2 rounded border cursor-pointer transition-colors ${
                  selectedUnit?.id === unit.id
                    ? 'bg-cyan-950/60 border-cyan-500 text-cyan-200'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="font-semibold">{unit.name}</div>
                <div className="font-mono text-[10px] text-slate-400 mt-0.5">
                  Bewegung: {unit.movementPointsRemaining}/{unit.maxMovementPoints} MP · Zustand:{' '}
                  {unit.health}/{unit.maxHealth}
                </div>
              </div>
            ))}
          </Section>
        )}
      </div>
    </aside>
  );
};
