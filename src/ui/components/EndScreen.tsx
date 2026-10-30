/**
 * Astraea 4X - Spielende
 *
 * Zeigt Sieg oder Niederlage samt Bedingung, Punkteaufschlüsselung und
 * Rangliste. Der Bildschirm rechnet nichts nach: Alle Werte stammen aus dem
 * eingefrorenen `GameOutcome` der Engine.
 */

import React from 'react';
import type { GameOutcome } from '../../core/types.ts';
import { VICTORY_CONDITION_DESCRIPTIONS, VICTORY_CONDITION_NAMES } from '../../core/victoryManager.ts';

interface EndScreenProps {
  outcome: GameOutcome;
  backgroundImageSrc?: string;
  onContinue?: () => void;
  onReturnToMenu: () => void;
  onNewGame: () => void;
}

const scoreRow = (label: string, points: number) => (
  <div
    key={label}
    className="flex items-center justify-between gap-4 border-b border-slate-800/60 py-1.5 last:border-b-0"
  >
    <span className="text-[11px] text-slate-400">{label}</span>
    <span className="text-[11px] font-mono text-slate-200 tabular-nums">{points}</span>
  </div>
);

export const EndScreen: React.FC<EndScreenProps> = ({
  outcome,
  backgroundImageSrc,
  onContinue,
  onReturnToMenu,
  onNewGame,
}) => {
  const victory = outcome.status === 'victory';
  const condition = outcome.condition ?? 'elimination';
  const accent = victory ? 'text-emerald-300' : 'text-rose-300';
  const accentBorder = victory ? 'border-emerald-500/40' : 'border-rose-500/40';
  const accentGlow = victory
    ? 'shadow-emerald-950/40'
    : 'shadow-rose-950/40';

  return (
    <div className="relative h-screen w-screen overflow-y-auto bg-slate-950 text-slate-100 font-sans select-none">
      {backgroundImageSrc && (
        <img
          src={backgroundImageSrc}
          alt=""
          className="fixed inset-0 h-full w-full object-cover opacity-30"
          aria-hidden="true"
        />
      )}
      <div className="fixed inset-0 bg-gradient-to-b from-slate-950/90 via-slate-950/95 to-slate-950" />
      <div
        className={`fixed inset-0 ${
          victory
            ? 'bg-[radial-gradient(circle_at_50%_20%,rgba(16,185,129,0.16),transparent_60%)]'
            : 'bg-[radial-gradient(circle_at_50%_20%,rgba(244,63,94,0.14),transparent_60%)]'
        }`}
      />

      <div className="relative z-10 mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center px-6 py-12">
        <div className="text-[10px] font-mono uppercase tracking-[0.5em] text-slate-500">
          Astraea 4X · Runde {outcome.turn ?? '—'}
        </div>

        <h1
          className={`mt-4 text-5xl font-bold uppercase tracking-[0.2em] font-mono leading-none ${accent}`}
        >
          {victory ? 'Sieg' : 'Niederlage'}
        </h1>

        <div className={`mt-6 rounded-xl border ${accentBorder} bg-slate-950/70 p-5 shadow-2xl ${accentGlow}`}>
          <div className={`text-sm font-semibold ${accent}`}>
            {VICTORY_CONDITION_NAMES[condition]}
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-slate-400">
            {VICTORY_CONDITION_DESCRIPTIONS[condition]}
          </p>

          <div className="mt-4 flex items-end justify-between gap-4 border-t border-slate-800/70 pt-4">
            <div>
              <div className="text-[9px] font-mono uppercase tracking-widest text-slate-500">
                Punkte
              </div>
              <div className="text-3xl font-mono font-semibold tabular-nums text-slate-100">
                {outcome.score}
              </div>
            </div>
            <div className="text-right text-[10px] font-mono text-slate-500">
              {outcome.peakColonyCount} Kolonien erreicht
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          <section>
            <h2 className="text-[10px] font-mono uppercase tracking-[0.3em] text-slate-500">
              Punkteaufschlüsselung
            </h2>
            <div className="mt-2 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-1">
              {outcome.breakdown.length === 0 ? (
                <p className="py-2 text-[11px] text-slate-500">Keine Posten erfasst.</p>
              ) : (
                outcome.breakdown.map((part) => scoreRow(part.label, part.points))
              )}
            </div>
          </section>

          <section>
            <h2 className="text-[10px] font-mono uppercase tracking-[0.3em] text-slate-500">
              Rangliste
            </h2>
            <div className="mt-2 space-y-1">
              {outcome.ranking.length === 0 ? (
                <p className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-[11px] text-slate-500">
                  Keine Vergleichsdaten.
                </p>
              ) : (
                outcome.ranking.map((entry, index) => (
                  <div
                    key={entry.civId}
                    className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${
                      entry.isPlayer
                        ? 'border-cyan-800/80 bg-cyan-950/30'
                        : 'border-slate-800 bg-slate-900/40'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="w-4 text-[10px] font-mono text-slate-500 tabular-nums">
                        {index + 1}.
                      </span>
                      <span className="truncate text-[11px] text-slate-200">{entry.civName}</span>
                      {entry.isPlayer && (
                        <span className="text-[9px] font-mono text-cyan-300">DU</span>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[11px] font-mono text-slate-200 tabular-nums">
                        {entry.score}
                      </div>
                      <div className="text-[9px] font-mono text-slate-500">
                        {entry.colonies} Kolonien
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          {victory && onContinue && (
            <button
              onClick={onContinue}
              className="rounded border border-slate-700 bg-slate-900/80 px-4 py-2 text-xs font-mono text-slate-200 transition-colors hover:bg-slate-800 cursor-pointer"
            >
              Weiterspielen (Sandbox)
            </button>
          )}
          <button
            onClick={onNewGame}
            className="rounded border border-cyan-400/60 bg-cyan-600/90 px-4 py-2 text-xs font-mono font-semibold text-slate-950 shadow-lg shadow-cyan-950/50 transition-colors hover:bg-cyan-500 cursor-pointer"
          >
            Neues Spiel
          </button>
          <button
            onClick={onReturnToMenu}
            className="rounded border border-slate-800 bg-slate-900/60 px-4 py-2 text-xs font-mono text-slate-300 transition-colors hover:bg-slate-800 cursor-pointer"
          >
            Hauptmenü
          </button>
        </div>

        <p className="mt-6 text-[10px] font-mono text-slate-600">
          Der Endstand bleibt im lokalen Speicher erhalten.
        </p>
      </div>
    </div>
  );
};
