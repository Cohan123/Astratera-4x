/**
 * Astraea 4X - Ziele & Punkte
 *
 * Zeigt die drei Siegbedingungen mit Fortschritt, die eigene
 * Punkteaufschlüsselung und die Rangliste. Alle Werte kommen aus dem
 * `VictoryManager`; das Modal rechnet nichts nach.
 */

import React from 'react';
import {
  VICTORY_CONDITION_NAMES,
  type VictoryOverview,
} from '../../core/victoryManager.ts';

interface VictoryModalProps {
  isOpen: boolean;
  overview: VictoryOverview | null;
  onClose: () => void;
}

const progressColor = (progress: number, completed: boolean): string => {
  if (completed) return 'bg-emerald-500';
  if (progress >= 0.66) return 'bg-cyan-400';
  if (progress >= 0.33) return 'bg-amber-400';
  return 'bg-slate-600';
};

export const VictoryModal: React.FC<VictoryModalProps> = ({ isOpen, overview, onClose }) => {
  if (!isOpen) return null;

  if (!overview) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm select-none">
        <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-950 p-6 text-sm text-slate-300 shadow-2xl">
          Keine Zieldaten verfügbar.
          <button
            onClick={onClose}
            className="mt-4 rounded bg-slate-800 px-4 py-2 text-xs font-mono hover:bg-slate-700 cursor-pointer"
          >
            Schließen
          </button>
        </div>
      </div>
    );
  }

  const {
    outcome,
    currentTurn,
    objectives,
    breakdown,
    ranking,
    score,
    playerColonyCount,
    totalSettledSystems,
  } = overview;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm select-none">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-slate-800 bg-slate-950 p-6 font-sans shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-100">Ziele &amp; Punkte</h3>
            <p className="mt-0.5 text-xs text-slate-400">
              Runde {currentTurn} · {playerColonyCount} Kolonien ·{' '}
              {totalSettledSystems} besiedelte Systeme
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-[9px] font-mono text-slate-500">PUNKTE</div>
              <div className="text-sm font-mono tabular-nums text-cyan-300">{score}</div>
            </div>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded font-mono text-slate-400 hover:text-slate-200 cursor-pointer"
              title="Ziele schließen"
            >
              ✕
            </button>
          </div>
        </div>

        {outcome.status !== 'ongoing' && (
          <div
            className={`mt-3 rounded border px-3 py-2 text-[11px] font-mono ${
              outcome.status === 'victory'
                ? 'border-emerald-800/80 bg-emerald-950/40 text-emerald-200'
                : 'border-rose-800/80 bg-rose-950/40 text-rose-200'
            }`}
          >
            {outcome.status === 'victory' ? 'Sieg' : 'Niederlage'} ·{' '}
            {outcome.condition ? VICTORY_CONDITION_NAMES[outcome.condition] : 'unbekannt'} · Runde{' '}
            {outcome.turn ?? '—'} · Sandbox
          </div>
        )}

        <div className="mt-4 flex-1 space-y-5 overflow-y-auto pr-1">
          <section className="space-y-2">
            <h4 className="text-[10px] font-mono uppercase tracking-[0.3em] text-slate-500">
              Siegbedingungen
            </h4>
            {objectives.map((objective) => (
              <div
                key={objective.id}
                className={`rounded-lg border p-3 ${
                  objective.completed
                    ? 'border-emerald-800/70 bg-emerald-950/20'
                    : 'border-slate-800 bg-slate-900/40'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-100">{objective.name}</span>
                      {objective.completed && (
                        <span className="rounded border border-emerald-800/80 bg-emerald-950/60 px-1.5 py-0.5 text-[9px] font-mono text-emerald-300">
                          ERFÜLLT
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                      {objective.description}
                    </p>
                  </div>
                  <span className="shrink-0 text-[10px] font-mono tabular-nums text-slate-400">
                    {Math.round(objective.progress * 100)} %
                  </span>
                </div>

                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${progressColor(
                      objective.progress,
                      objective.completed
                    )}`}
                    style={{ width: `${Math.round(objective.progress * 100)} %` }}
                  />
                </div>

                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-slate-500">
                  <span>{objective.currentLabel}</span>
                  <span>Ziel: {objective.targetLabel}</span>
                </div>
              </div>
            ))}
          </section>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <section>
              <h4 className="text-[10px] font-mono uppercase tracking-[0.3em] text-slate-500">
                Punkteaufschlüsselung
              </h4>
              <div className="mt-2 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-1">
                {breakdown.length === 0 ? (
                  <p className="py-2 text-[11px] text-slate-500">Noch keine Posten.</p>
                ) : (
                  breakdown.map((part) => (
                    <div
                      key={part.id}
                      className="flex items-center justify-between gap-4 border-b border-slate-800/60 py-1.5 last:border-b-0"
                    >
                      <span className="text-[11px] text-slate-400">{part.label}</span>
                      <span className="text-[11px] font-mono tabular-nums text-slate-200">
                        {part.points}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section>
              <h4 className="text-[10px] font-mono uppercase tracking-[0.3em] text-slate-500">
                Rangliste
              </h4>
              <div className="mt-2 space-y-1">
                {ranking.map((entry, index) => (
                  <div
                    key={entry.civId}
                    className={`flex items-center justify-between gap-3 rounded border px-2.5 py-1.5 ${
                      entry.isPlayer
                        ? 'border-cyan-800/80 bg-cyan-950/30'
                        : 'border-slate-800 bg-slate-900/40'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="w-3 text-[10px] font-mono tabular-nums text-slate-500">
                        {index + 1}.
                      </span>
                      <span className="truncate text-[11px] text-slate-200">{entry.civName}</span>
                    </div>
                    <span className="shrink-0 text-[11px] font-mono tabular-nums text-slate-300">
                      {entry.score}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <p className="text-[10px] leading-relaxed text-slate-600">
            Niederlage, wenn dein Reich seine letzte Kolonie verliert. Nach einem Sieg kannst du die
            Partie als Sandbox fortsetzen; der Ausgang bleibt gespeichert.
          </p>
        </div>
      </div>
    </div>
  );
};
