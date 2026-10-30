/**
 * Astraea 4X - Isoliertes Testlabor
 *
 * Einstieg über das Hauptmenü. Das Labor hält seinen Zustand ausschließlich in
 * React und ruft keine Kampagnen-, Runden- oder Speicherlogik auf.
 */

import React, { useMemo, useState } from 'react';
import { TEST_BALLOONS, type TestBalloonDefinition } from './testLabRegistry.tsx';

interface TestLabProps {
  onExit: () => void;
}

const StatusBadge: React.FC<{ status: TestBalloonDefinition['status'] }> = ({ status }) => (
  <span
    className={`text-[9px] font-mono px-1.5 py-0.5 rounded border uppercase ${
      status === 'ready'
        ? 'border-emerald-800/60 bg-emerald-950/40 text-emerald-300'
        : 'border-slate-700 bg-slate-950 text-slate-500'
    }`}
  >
    {status === 'ready' ? 'Verfügbar' : 'Geplant'}
  </span>
);

export const TestLab: React.FC<TestLabProps> = ({ onExit }) => {
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeBalloon = useMemo(
    () => TEST_BALLOONS.find((balloon) => balloon.id === activeId) ?? null,
    [activeId]
  );
  const ActiveComponent = activeBalloon?.component;

  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 font-sans flex flex-col">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_20%_0%,rgba(6,182,212,0.12),transparent_45%)]" />

      <header className="relative z-10 shrink-0 flex items-center justify-between gap-4 px-5 py-3 border-b border-slate-800 bg-slate-950/90">
        <div className="flex items-center gap-3">
          <div className="text-[10px] font-mono tracking-[0.35em] text-cyan-500 uppercase">
            Astraea 4X · Testing
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-amber-800/60 bg-amber-950/30 text-amber-300 uppercase">
            Isoliertes Testlabor
          </span>
        </div>
        <div className="flex items-center gap-2">
          {activeBalloon && (
            <button
              type="button"
              onClick={() => setActiveId(null)}
              className="px-3 py-1.5 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-mono cursor-pointer"
            >
              ← Testauswahl
            </button>
          )}
          <button
            type="button"
            data-testid="testing-exit"
            onClick={onExit}
            className="px-3 py-1.5 rounded border border-cyan-800/70 bg-cyan-950/50 hover:bg-cyan-900/60 text-cyan-200 text-xs font-mono cursor-pointer"
          >
            ← Hauptmenü
          </button>
        </div>
      </header>

      <main className="relative z-10 flex-1 min-h-0 overflow-y-auto p-5">
        {activeBalloon && ActiveComponent ? (
          <ActiveComponent onBackToMenu={() => setActiveId(null)} />
        ) : (
          <div className="max-w-6xl mx-auto space-y-5">
            <div>
              <h1 className="text-2xl font-bold text-slate-100">Testlabor</h1>
              <p className="mt-1 max-w-3xl text-xs text-slate-400 leading-relaxed">
                Starte einzelne Spielmechaniken unabhängig von einer Kampagne. Die Ballons teilen
                reine Generator- und Darstellungsfunktionen mit dem Spiel, halten aber eigene
                Testdaten. Ressourcen, Kolonien, Runden und KI einer laufenden Partie bleiben
                unberührt.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {TEST_BALLOONS.map((balloon) => {
                const available = balloon.status === 'ready' && Boolean(balloon.component);
                return (
                  <button
                    key={balloon.id}
                    type="button"
                    data-testid={`test-balloon-${balloon.id}`}
                    disabled={!available}
                    onClick={() => {
                      if (available) setActiveId(balloon.id);
                    }}
                    className={`text-left rounded-xl border p-4 transition-colors ${
                      available
                        ? 'border-slate-700 bg-slate-900/70 hover:border-cyan-700 hover:bg-slate-900 cursor-pointer'
                        : 'border-slate-800/70 bg-slate-950/50 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500">
                        {balloon.category}
                      </span>
                      <StatusBadge status={balloon.status} />
                    </div>
                    <div className="mt-2 text-sm font-bold text-slate-100">{balloon.title}</div>
                    <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
                      {balloon.description}
                    </p>
                    {balloon.plannedNote && (
                      <p className="mt-2 text-[10px] font-mono text-slate-600 leading-relaxed">
                        {balloon.plannedNote}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-[11px] font-mono text-slate-500 leading-relaxed">
              <div className="text-slate-400 font-semibold mb-1">Trennung vom Spiel</div>
              Das Labor erzeugt keine Kampagnenobjekte, schreibt keine Spielstände und löst keine
              Rundenwechsel aus. Oberflächen werden mit einem synthetischen Testplaneten erzeugt;
              die Kacheln werden ausschließlich in der Testansicht sichtbar geschaltet.
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
