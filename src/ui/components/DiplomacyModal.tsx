/**
 * Astraea 4X - Diplomacy Modal (Phase 4)
 * Shows the relation of the player empire to every other civilization and lets
 * the player declare war or sign peace. Peace requires a minimum war duration;
 * the reason is reported by the diplomacy manager and shown verbatim.
 */

import React, { useMemo, useState } from 'react';
import { PEACE_MIN_WAR_TURNS } from '../../core/diplomacyManager.ts';
import type {
  Civilization,
  DiplomaticPair,
  DiplomacyResult,
} from '../../core/types.ts';

interface DiplomacyModalProps {
  isOpen: boolean;
  civs: Civilization[];
  playerCivId: string;
  pairs: DiplomaticPair[];
  currentTurn: number;
  onDeclareWar: (otherCivId: string) => DiplomacyResult;
  onMakePeace: (otherCivId: string) => DiplomacyResult;
  onClose: () => void;
}

export const DiplomacyModal: React.FC<DiplomacyModalProps> = ({
  isOpen,
  civs,
  playerCivId,
  pairs,
  currentTurn,
  onDeclareWar,
  onMakePeace,
  onClose,
}) => {
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(
    null
  );

  const playerCiv = useMemo(() => civs.find((civ) => civ.id === playerCivId) ?? null, [civs, playerCivId]);

  const partnerRows = useMemo(() => {
    const pairByKey = new Map<string, DiplomaticPair>();
    for (const pair of pairs) {
      pairByKey.set(`${pair.civAId}|${pair.civBId}`, pair);
      pairByKey.set(`${pair.civBId}|${pair.civAId}`, pair);
    }
    return civs
      .filter((civ) => civ.id !== playerCivId)
      .map((civ) => {
        const pair = pairByKey.get(`${playerCivId}|${civ.id}`) ?? null;
        const relation = pair?.relation ?? 'peace';
        const warTurns = pair && relation === 'war' ? Math.max(0, currentTurn - pair.sinceTurn) : 0;
        return { civ, relation, warTurns };
      });
  }, [civs, pairs, playerCivId, currentTurn]);

  const warCount = partnerRows.filter((row) => row.relation === 'war').length;

  if (!isOpen) return null;

  const handleDeclareWar = (otherCivId: string, name: string) => {
    const result = onDeclareWar(otherCivId);
    if (!result.allowed) {
      setFeedback({ type: 'error', text: result.reason || 'Kriegserklärung nicht möglich.' });
      return;
    }
    setFeedback({ type: 'success', text: `Krieg gegen ${name} erklärt.` });
  };

  const handleMakePeace = (otherCivId: string, name: string) => {
    const result = onMakePeace(otherCivId);
    if (!result.allowed) {
      setFeedback({ type: 'error', text: result.reason || 'Frieden nicht möglich.' });
      return;
    }
    setFeedback({ type: 'success', text: `Frieden mit ${name} geschlossen.` });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm select-none">
      <div className="w-full max-w-3xl bg-slate-950 border border-slate-800 rounded-xl shadow-2xl p-6 font-sans max-h-[92vh] flex flex-col">
        <header className="flex items-start justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-slate-100 tracking-wide">🤝 Diplomatische Beziehungen</h2>
            <p className="text-xs text-slate-400 mt-1">
              {playerCiv ? `${playerCiv.name} unterhält ` : 'Ihr Reich unterhält '}
              {warCount === 0 ? 'keine Kriege.' : `${warCount} ${warCount === 1 ? 'Krieg' : 'Kriege'}.`}{' '}
              Flotten kämpfen nur gegen Reiche, mit denen Krieg besteht. Frieden ist frühestens
              nach {PEACE_MIN_WAR_TURNS} Kriegsrunden möglich.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100 text-sm px-2 py-1 rounded border border-slate-800 hover:border-slate-700 cursor-pointer"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
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

          {partnerRows.length === 0 ? (
            <div className="text-xs text-amber-300 bg-amber-950/40 border border-amber-800/60 rounded p-3">
              Es sind keine weiteren Zivilisationen bekannt.
            </div>
          ) : (
            <ul className="space-y-3">
              {partnerRows.map(({ civ, relation, warTurns }) => {
                const isWar = relation === 'war';
                const peaceReady = isWar && warTurns >= PEACE_MIN_WAR_TURNS;
                return (
                  <li
                    key={civ.id}
                    className="rounded border border-slate-800 bg-slate-900/50 p-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0 border"
                          style={{ backgroundColor: civ.color, borderColor: civ.borderColor }}
                          aria-hidden="true"
                        />
                        <span className="text-sm font-semibold text-slate-100 truncate">{civ.name}</span>
                        <span
                          className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                            isWar
                              ? 'text-rose-300 bg-rose-950/60 border-rose-800/70'
                              : 'text-emerald-300 bg-emerald-950/60 border-emerald-800/70'
                          }`}
                        >
                          {isWar ? 'Krieg' : 'Frieden'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        {isWar
                          ? `Seit ${warTurns} ${warTurns === 1 ? 'Runde' : 'Runden'} im Krieg.`
                          : 'Keine Kampfhandlungen.'}
                        {isWar && !peaceReady && (
                          <span className="text-amber-400">
                            {' '}
                            Frieden ab {PEACE_MIN_WAR_TURNS} Kriegsrunden.
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleDeclareWar(civ.id, civ.name)}
                        disabled={isWar}
                        className="px-3 py-1.5 text-xs rounded border border-rose-800/70 bg-rose-950/50 text-rose-300 hover:bg-rose-900/60 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                      >
                        Krieg erklären
                      </button>
                      <button
                        onClick={() => handleMakePeace(civ.id, civ.name)}
                        disabled={!isWar}
                        className="px-3 py-1.5 text-xs rounded border border-emerald-800/70 bg-emerald-950/50 text-emerald-300 hover:bg-emerald-900/60 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                      >
                        Frieden schließen
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="pt-3 border-t border-slate-800 text-[11px] text-slate-500">
          Kriegserklärungen gelten sofort. Die KI erklärt derzeit keinen Krieg aus eigenem Antrieb.
        </footer>
      </div>
    </div>
  );
};
