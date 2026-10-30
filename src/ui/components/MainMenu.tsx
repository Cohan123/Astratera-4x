/**
 * Astraea 4X - Hauptmenü
 *
 * Einstiegspunkt vor jedem Spiel. Alle globalen Werkzeuge (Roadmap, QA-Tests,
 * Seed-Verwaltung) liegen hier – nicht mehr im laufenden Spiel.
 */

import React from 'react';
import type { SeedLibraryEntry } from '../../save/seedLibrary.ts';

export interface QuickSaveSummary {
  turn: number;
  turnDate: string;
  galaxyName: string;
  systems: number;
  colonies: number;
  timestamp: number;
}

interface MainMenuProps {
  backgroundImageSrc?: string;
  quickSave: QuickSaveSummary | null;
  lastSeed: SeedLibraryEntry | null;
  seedCount: number;
  onNewGame: () => void;
  onLoadGame: () => void;
  onManageSeeds: () => void;
  onOpenRoadmap: () => void;
  onOpenTests: () => void;
  onExit: () => void;
  onContinueLastSeed: () => void;
}

interface MenuActionProps {
  label: string;
  hint: string;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
}

const MenuAction: React.FC<MenuActionProps> = ({ label, hint, onClick, primary, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`group w-full text-left px-4 py-3 rounded-lg border transition-all duration-150 cursor-pointer ${
      primary
        ? 'bg-cyan-600/90 hover:bg-cyan-500 border-cyan-400/60 text-slate-950 shadow-lg shadow-cyan-950/50'
        : disabled
          ? 'bg-slate-900/40 border-slate-800/70 text-slate-600 cursor-not-allowed'
          : 'bg-slate-900/60 hover:bg-slate-800/80 border-slate-800 text-slate-200 hover:border-cyan-700/70'
    }`}
  >
    <span
      className={`block text-sm font-semibold tracking-wide ${
        primary ? 'text-slate-950' : disabled ? 'text-slate-600' : 'text-slate-100'
      }`}
    >
      {label}
    </span>
    <span
      className={`block text-[11px] font-mono mt-0.5 ${
        primary ? 'text-cyan-950/80' : disabled ? 'text-slate-700' : 'text-slate-500'
      }`}
    >
      {hint}
    </span>
  </button>
);

export const MainMenu: React.FC<MainMenuProps> = ({
  backgroundImageSrc,
  quickSave,
  lastSeed,
  seedCount,
  onNewGame,
  onLoadGame,
  onManageSeeds,
  onOpenRoadmap,
  onOpenTests,
  onExit,
  onContinueLastSeed,
}) => {
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 font-sans select-none">
      {backgroundImageSrc && (
        <img
          src={backgroundImageSrc}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-45"
          aria-hidden="true"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/85 to-slate-950/30" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_25%,rgba(6,182,212,0.16),transparent_55%)]" />

      <div className="relative z-10 h-full w-full max-w-6xl mx-auto px-8 py-10 flex flex-col">
        <header className="shrink-0">
          <div className="text-[10px] font-mono tracking-[0.5em] text-cyan-500/80 uppercase">
            Galactic Foundations · Planetary Colonization
          </div>
          <h1 className="mt-3 text-6xl font-bold tracking-[0.16em] text-slate-50 uppercase font-mono leading-none">
            Astraea
            <span className="ml-3 text-cyan-400 text-4xl align-top">4X</span>
          </h1>
          <p className="mt-4 max-w-xl text-sm text-slate-400 leading-relaxed">
            Aufbruch in ein procedural erzeugtes Sternenfeld. Errichte Kolonien, sichere
            Nachschubrouten und führe deine Zivilisation durch die erste Expansion.
          </p>
        </header>

        <div className="mt-10 flex-1 grid grid-cols-1 lg:grid-cols-[minmax(0,22rem)_1fr] gap-10 items-start">
          <div className="space-y-2.5">
            <MenuAction
              primary
              label="Neues Spiel"
              hint="Galaxie erschaffen oder Seed fortsetzen"
              onClick={onNewGame}
            />
            <MenuAction
              label="Spiel laden"
              hint={
                quickSave
                  ? `Runde ${quickSave.turn} · ${quickSave.galaxyName}`
                  : 'Lokalen Stand laden oder JSON importieren'
              }
              onClick={onLoadGame}
            />
            <MenuAction
              label="Galaxie-Seeds verwalten"
              hint={
                seedCount > 0
                  ? `${seedCount} gespeicherte ${seedCount === 1 ? 'Konfiguration' : 'Konfigurationen'}`
                  : 'Noch keine Seeds gespeichert'
              }
              onClick={onManageSeeds}
            />
            <MenuAction label="Roadmap" hint="Phasen und Meilensteine" onClick={onOpenRoadmap} />
            <MenuAction label="QA-Tests" hint="Regel- und Simulationsprüfungen" onClick={onOpenTests} />
            <MenuAction label="Spiel beenden" hint="Sitzung verlassen" onClick={onExit} />
          </div>

          <aside className="w-full max-w-md lg:ml-auto space-y-4">
            {lastSeed && (
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 backdrop-blur-md p-5">
                <div className="text-[10px] font-mono uppercase tracking-widest text-cyan-500/80">
                  Letzter Seed
                </div>
                <div className="mt-2 text-xl font-mono text-slate-100 break-all">{lastSeed.seed}</div>
                <div className="mt-1 text-xs text-slate-400">{lastSeed.name}</div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-500">
                  <div>
                    <span className="text-slate-600">Systeme:</span> {lastSeed.systemCount}
                  </div>
                  <div>
                    <span className="text-slate-600">Form:</span> {lastSeed.config.shape}
                  </div>
                  <div>
                    <span className="text-slate-600">Größe:</span> {lastSeed.config.size}
                  </div>
                  <div>
                    <span className="text-slate-600">Gen:</span> v{lastSeed.generatorVersion}
                  </div>
                </div>
                <button
                  onClick={onContinueLastSeed}
                  className="mt-4 w-full py-2 rounded border border-cyan-800/70 bg-cyan-950/60 hover:bg-cyan-900/70 text-cyan-200 text-xs font-mono font-semibold transition-colors cursor-pointer"
                >
                  Mit diesem Seed fortfahren
                </button>
              </div>
            )}

            <div className="rounded-xl border border-slate-800 bg-slate-950/70 backdrop-blur-md p-5">
              <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">
                Gespeicherter Spielstand
              </div>
              {quickSave ? (
                <div className="mt-2 space-y-1 text-xs font-mono text-slate-400">
                  <div>
                    <span className="text-slate-600">Galaxie:</span> {quickSave.galaxyName}
                  </div>
                  <div>
                    <span className="text-slate-600">Runde:</span> {quickSave.turn} ({quickSave.turnDate})
                  </div>
                  <div>
                    <span className="text-slate-600">Systeme:</span> {quickSave.systems}
                    <span className="ml-3 text-slate-600">Kolonien:</span> {quickSave.colonies}
                  </div>
                  <div>
                    <span className="text-slate-600">Zeitpunkt:</span>{' '}
                    {new Date(quickSave.timestamp).toLocaleString('de-DE')}
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-xs text-slate-500 italic">
                  Noch kein Spielstand. Starte ein neues Spiel und speichere über das Menü.
                </p>
              )}
            </div>
          </aside>
        </div>

        <footer className="shrink-0 mt-8 flex items-center justify-between text-[10px] font-mono text-slate-600 uppercase tracking-widest">
          <span>Deterministische Rundenauflösung</span>
          <span>Build · Phase 3 abgeschlossen</span>
        </footer>
      </div>
    </div>
  );
};
