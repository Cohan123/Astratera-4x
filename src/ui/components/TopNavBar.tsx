/**
 * Astraea 4X - Top Navigation Bar (Module 4)
 * Follows strict 3-Zone Contract:
 * [Zone 1: Single text element Brand] - [Zone 2: Single-line nav links] - [Zone 3: 1 primary action]
 * Secondary utilities (saves, main menu, quit) live in the "Menü" dropdown to keep Zone 2 compact.
 * Roadmap und QA-Tests liegen bewusst im Hauptmenü, nicht im laufenden Spiel.
 */
import React, { useEffect, useRef, useState } from 'react';
import { CrisisStage, TurnState, ViewMode } from '../../core/types.ts';

interface TopNavBarProps {
  turnState: TurnState;
  viewMode: ViewMode;
  selectedSystemName?: string;
  selectedPlanetName?: string;
  coloniesCount?: number;
  activeTechName?: string;
  isPlanetsOverviewOpen?: boolean;
  isLogisticsOpen?: boolean;
  activeLogisticsRoutes?: number;
  isFleetOpen?: boolean;
  fleetCount?: number;
  isDiplomacyOpen?: boolean;
  warCount?: number;
  isEmpireOpen?: boolean;
  factionUnrestCount?: number;
  isNarrativeOpen?: boolean;
  pendingEventCount?: number;
  crisisStage?: CrisisStage;
  onEndTurn: () => void;
  onSwitchToGalaxy: () => void;
  onSwitchToSystem: () => void;
  onSwitchToSurface?: () => void;
  onOpenPlanetsOverview?: () => void;
  onOpenLogistics?: () => void;
  onOpenFleets?: () => void;
  onOpenDiplomacy?: () => void;
  onOpenEmpire?: () => void;
  onOpenNarrative?: () => void;
  onOpenVictory?: () => void;
  onOpenTechTree?: () => void;
  onOpenColonyList?: () => void;
  onOpenMessageLog?: () => void;
  unreadMessageCount?: number;
  onOpenSaveLoad: () => void;
  onReturnToMainMenu: () => void;
  onExitGame: () => void;
}

export const TopNavBar: React.FC<TopNavBarProps> = ({
  turnState,
  viewMode,
  selectedSystemName,
  selectedPlanetName,
  coloniesCount = 0,
  activeTechName,
  isPlanetsOverviewOpen = false,
  isLogisticsOpen = false,
  activeLogisticsRoutes = 0,
  isFleetOpen = false,
  fleetCount = 0,
  isDiplomacyOpen = false,
  warCount = 0,
  isEmpireOpen = false,
  factionUnrestCount = 0,
  isNarrativeOpen = false,
  pendingEventCount = 0,
  crisisStage,
  onEndTurn,
  onSwitchToGalaxy,
  onSwitchToSystem,
  onSwitchToSurface,
  onOpenPlanetsOverview,
  onOpenLogistics,
  onOpenFleets,
  onOpenDiplomacy,
  onOpenEmpire,
  onOpenNarrative,
  onOpenVictory,
  onOpenTechTree,
  onOpenColonyList,
  onOpenMessageLog,
  unreadMessageCount = 0,
  onOpenSaveLoad,
  onReturnToMainMenu,
  onExitGame,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMenuOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMenuOpen]);

  const menuItems = [
    ...(onOpenVictory
      ? [
          {
            label: 'Ziele & Punkte',
            hint: 'Siegbedingungen, Fortschritt und Rangliste',
            onSelect: onOpenVictory,
          },
        ]
      : []),
    ...(onOpenMessageLog
      ? [
          {
            label: 'Nachrichtenverlauf',
            hint:
              unreadMessageCount > 0
                ? `${unreadMessageCount} ungelesen · vergangene Meldungen nachblättern`
                : 'Vergangene Meldungen nachblättern',
            onSelect: onOpenMessageLog,
          },
        ]
      : []),
    { label: 'Speicherstände', hint: 'Spielstand speichern oder laden', onSelect: onOpenSaveLoad },
    { label: 'Hauptmenü', hint: 'Zum Startbildschirm zurückkehren', onSelect: onReturnToMainMenu },
    { label: 'Spiel beenden', hint: 'Sitzung verlassen', onSelect: onExitGame },
  ];

  const hasManagementLinks = Boolean(
    onOpenPlanetsOverview ||
      onOpenLogistics ||
      onOpenFleets ||
      onOpenDiplomacy ||
      onOpenEmpire ||
      onOpenNarrative ||
      onOpenTechTree
  );

  const crisisActive = Boolean(
    crisisStage && crisisStage !== 'dormant' && crisisStage !== 'resolved'
  );

  return (
    <header className="h-14 bg-slate-950/95 border-b border-slate-800/80 px-6 flex items-center justify-between gap-6 z-30 select-none backdrop-blur-md">
      {/* Zone 1: Brand Wordmark (Single text element) */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={onSwitchToGalaxy}
          className="text-lg font-bold tracking-widest text-slate-100 hover:text-cyan-400 transition-colors uppercase font-mono whitespace-nowrap cursor-pointer"
        >
          ASTRAEA <span className="text-cyan-400 font-semibold text-sm ml-1">4X</span>
        </button>
      </div>

      {/* Zone 2: Navigation Links */}
      <nav className="hidden md:flex items-center gap-4 text-xs font-medium text-slate-300">
        <button
          onClick={onSwitchToGalaxy}
          className={`hover:text-cyan-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            viewMode === 'galaxy' ? 'text-cyan-400 font-semibold underline underline-offset-8 decoration-cyan-400' : ''
          }`}
        >
          Galaxy-Karte
        </button>

        <button
          onClick={onSwitchToSystem}
          className={`hover:text-cyan-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
            viewMode === 'system' ? 'text-cyan-400 font-semibold underline underline-offset-8 decoration-cyan-400' : ''
          }`}
          title={selectedSystemName ? `Systemkarte für ${selectedSystemName}` : 'Systemkarte öffnen'}
        >
          <span>Systemkarte</span>
          {selectedSystemName && (
            <span className="text-[10px] font-mono text-slate-400 px-1 rounded bg-slate-900 border border-slate-800">
              {selectedSystemName}
            </span>
          )}
        </button>

        {hasManagementLinks && <span className="h-4 w-px bg-slate-800 shrink-0" aria-hidden="true" />}

        {/* Planetenübersicht: Access all colonized worlds and enter their surfaces */}
        {onOpenPlanetsOverview && (
          <button
            onClick={onOpenPlanetsOverview}
            className={`hover:text-cyan-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              isPlanetsOverviewOpen
                ? 'text-cyan-400 font-semibold underline underline-offset-8 decoration-cyan-400'
                : 'text-slate-200'
            }`}
            title="Planetenübersicht aller besiedelten Welten öffnen"
          >
            Planetenübersicht
          </button>
        )}

        {onOpenLogistics && (
          <button
            onClick={onOpenLogistics}
            className={`hover:text-cyan-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
              isLogisticsOpen
                ? 'text-cyan-400 font-semibold underline underline-offset-8 decoration-cyan-400'
                : 'text-slate-200'
            }`}
            title="Logistiknetzwerk der Kolonien verwalten"
          >
            <span>Logistik</span>
            {activeLogisticsRoutes > 0 && (
              <span className="text-[10px] font-mono text-cyan-400 px-1.5 py-0.5 rounded bg-cyan-950/70 border border-cyan-800/80 font-semibold">
                {activeLogisticsRoutes}
              </span>
            )}
          </button>
        )}

        {onOpenFleets && (
          <button
            onClick={onOpenFleets}
            className={`hover:text-cyan-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
              isFleetOpen
                ? 'text-cyan-400 font-semibold underline underline-offset-8 decoration-cyan-400'
                : 'text-slate-200'
            }`}
            title="Werften, Schiffsbau und Flottenbewegungen verwalten"
          >
            <span>Werften</span>
            {fleetCount > 0 && (
              <span className="text-[10px] font-mono text-cyan-400 px-1.5 py-0.5 rounded bg-cyan-950/70 border border-cyan-800/80 font-semibold">
                {fleetCount}
              </span>
            )}
          </button>
        )}

        {onOpenEmpire && (
          <button
            onClick={onOpenEmpire}
            className={`hover:text-cyan-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
              isEmpireOpen
                ? 'text-cyan-400 font-semibold underline underline-offset-8 decoration-cyan-400'
                : 'text-slate-200'
            }`}
            title="Reichsverwaltung, Politik und innere Fraktionen öffnen"
          >
            <span>Reich</span>
            {factionUnrestCount > 0 && (
              <span className="text-[10px] font-mono text-rose-300 px-1.5 py-0.5 rounded bg-rose-950/70 border border-rose-800/80 font-semibold">
                {factionUnrestCount}
              </span>
            )}
          </button>
        )}

        {onOpenNarrative && (
          <button
            onClick={onOpenNarrative}
            className={`hover:text-cyan-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
              isNarrativeOpen
                ? 'text-cyan-400 font-semibold underline underline-offset-8 decoration-cyan-400'
                : 'text-slate-200'
            }`}
            title="Chronik: Ereignisse, Ausgrabungsstätten und galaktische Krise"
          >
            <span>Chronik</span>
            {pendingEventCount > 0 ? (
              <span
                className="text-[10px] font-mono text-rose-300 px-1.5 py-0.5 rounded bg-rose-950/70 border border-rose-800/80 font-semibold"
                title="Offene Entscheidung"
              >
                !
              </span>
            ) : crisisActive ? (
              <span
                className="text-[10px] font-mono text-amber-300 px-1.5 py-0.5 rounded bg-amber-950/70 border border-amber-800/80 font-semibold"
                title="Galaktische Krise aktiv"
              >
                ◆
              </span>
            ) : null}
          </button>
        )}

        {onOpenDiplomacy && (
          <button
            onClick={onOpenDiplomacy}
            className={`hover:text-cyan-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
              isDiplomacyOpen
                ? 'text-cyan-400 font-semibold underline underline-offset-8 decoration-cyan-400'
                : 'text-slate-200'
            }`}
            title="Diplomatische Beziehungen verwalten: Krieg erklären oder Frieden schließen"
          >
            <span>Diplomatie</span>
            {warCount > 0 && (
              <span className="text-[10px] font-mono text-rose-300 px-1.5 py-0.5 rounded bg-rose-950/70 border border-rose-800/80 font-semibold">
                {warCount}
              </span>
            )}
          </button>
        )}

        {onOpenTechTree && (
          <button
            onClick={onOpenTechTree}
            className="hover:text-cyan-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1 text-cyan-300 font-mono"
            title="Forschungsbaum öffnen"
          >
            <span>Forschung</span>
            {activeTechName && (
              <span className="text-[10px] text-slate-400 font-sans">({activeTechName})</span>
            )}
          </button>
        )}

        {/* Secondary utilities stay reachable but out of the primary scan path */}
        <div ref={menuRef} className="relative shrink-0">
          <button
            onClick={() => setIsMenuOpen((prev) => !prev)}
            aria-haspopup="menu"
            aria-expanded={isMenuOpen}
            className={`hover:text-cyan-400 transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1 ${
              isMenuOpen ? 'text-cyan-400' : 'text-slate-400'
            }`}
            title="Weitere Werkzeuge: Nachrichtenverlauf, Speicherstände, Hauptmenü, Spiel beenden"
          >
            <span>Menü</span>
            {unreadMessageCount > 0 && (
              <span
                className="text-[10px] font-mono text-cyan-300 px-1.5 py-0.5 rounded bg-cyan-950/70 border border-cyan-800/80 font-semibold"
                title={`${unreadMessageCount} ungelesene Nachrichten`}
              >
                {unreadMessageCount}
              </span>
            )}
            <span className="text-[9px]" aria-hidden="true">▼</span>
          </button>

          {isMenuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-2 w-56 rounded-md border border-slate-800 bg-slate-950/98 backdrop-blur-md shadow-xl shadow-black/40 py-1 z-50"
            >
              {menuItems.map((item) => (
                <button
                  key={item.label}
                  role="menuitem"
                  onClick={() => {
                    setIsMenuOpen(false);
                    item.onSelect();
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-slate-800/80 transition-colors cursor-pointer"
                >
                  <span className="block text-xs text-slate-200">{item.label}</span>
                  <span className="block text-[10px] text-slate-500 mt-0.5">{item.hint}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </nav>

      {/* Zone 3: Primary Action - End Turn Control & Empire Telemetry */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Colony Counter Badge */}
        <button
          onClick={onOpenPlanetsOverview || onOpenColonyList}
          className="hidden lg:flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-slate-300 cursor-pointer transition-colors"
          title="Planetenübersicht aller besiedelten Welten öffnen"
        >
          <span className="text-emerald-400">🏛</span>
          <span className="text-slate-400">KOLONIEN:</span>
          <span className="text-emerald-300 font-semibold tabular-nums">{coloniesCount}</span>
        </button>

        <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-slate-400 mr-1">
          <span className="text-slate-500">JAHR</span>
          <span className="text-slate-200 tabular-nums font-semibold">{turnState.turnDateStandard}</span>
        </div>

        <button
          onClick={onEndTurn}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-slate-950 font-semibold text-xs tracking-wider uppercase rounded font-mono transition-all duration-150 flex items-center gap-2 shadow-lg shadow-cyan-950/40 cursor-pointer whitespace-nowrap shrink-0"
          title="Spielrunde beenden und nächsten Zyklus berechnen"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-slate-950" />
          <span>Runde {turnState.currentTurn} beenden</span>
        </button>
      </div>
    </header>
  );
};
