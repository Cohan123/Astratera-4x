/**
 * Astraea 4X - Galaktische Chronik (Phase 5)
 *
 * Ein Fenster für die drei narrativen Bausteine: offene Entscheidungen,
 * Ausgrabungsstätten und die galaktische Krise. Das Modal rechnet nichts
 * nach; sämtliche Werte stammen aus dem NarrativeOverview der Engine.
 */

import React, { useEffect, useState } from 'react';
import type {
  CrisisStage,
  ExcavationSite,
  NarrativeOverview,
} from '../../core/types.ts';

interface NarrativeModalProps {
  isOpen: boolean;
  overview: NarrativeOverview | null;
  onResolveChoice: (choiceId: string) => { success: boolean; reason?: string };
  onStartExcavation: (siteId: string) => { success: boolean; reason?: string };
  onContribute: () => { success: boolean; reason?: string };
  onClose: () => void;
}

const CRISIS_STAGE_LABEL: Record<CrisisStage, string> = {
  dormant: 'Ruhend',
  signal: 'Signal',
  awakening: 'Erwachen',
  resolution: 'Zuspitzung',
  resolved: 'Abgeschlossen',
};

const CRISIS_STAGE_HINT: Record<CrisisStage, string> = {
  dormant: 'Noch keine galaktische Krise.',
  signal: 'Ein wiederkehrendes Signal durchläuft die Hyperlanes.',
  awakening: 'Die Quelle regt sich. Produktion sinkt, Forschung steigt.',
  resolution: 'Die Krise erreicht ihren Höhepunkt. Jede Runde zählt.',
  resolved: 'Die Krise ist vorbei. Der Ausgang prägt das Reich.',
};

const CRISIS_OUTCOME_LABEL: Record<NonNullable<NarrativeOverview['crisis']['outcome']>, string> = {
  contained: 'Eingedämmt',
  embraced: 'Angenommen',
  ignored: 'Ignoriert',
};

const SITE_STATUS_LABEL: Record<ExcavationSite['status'], string> = {
  undiscovered: 'Unentdeckt',
  discovered: 'Entdeckt',
  active: 'In Ausgrabung',
  completed: 'Abgeschlossen',
};

const SITE_STATUS_CLASS: Record<ExcavationSite['status'], string> = {
  undiscovered: 'text-slate-500 border-slate-800 bg-slate-900/40',
  discovered: 'text-cyan-300 border-cyan-800/80 bg-cyan-950/40',
  active: 'text-amber-300 border-amber-800/80 bg-amber-950/40',
  completed: 'text-emerald-300 border-emerald-800/80 bg-emerald-950/40',
};

const signedCredits = (value: number): string =>
  `${value > 0 ? '+' : ''}${value} ◈`;

const choiceCost = (credits: number | undefined): number => Math.max(0, -(credits ?? 0));

const choiceEffectSummary = (effect: {
  credits?: number;
  research?: number;
  factionLoyalty?: number;
}): string => {
  const parts: string[] = [];
  if (effect.credits) parts.push(signedCredits(effect.credits));
  if (effect.research) parts.push(`+${effect.research} Forschung`);
  if (effect.factionLoyalty) parts.push(`${effect.factionLoyalty > 0 ? '+' : ''}${effect.factionLoyalty} Loyalität`);
  return parts.length > 0 ? parts.join(' · ') : 'Keine unmittelbare Wirkung';
};

export const NarrativeModal: React.FC<NarrativeModalProps> = ({
  isOpen,
  overview,
  onResolveChoice,
  onStartExcavation,
  onContribute,
  onClose,
}) => {
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(
    null
  );

  useEffect(() => {
    if (isOpen) setFeedback(null);
  }, [isOpen]);

  if (!isOpen) return null;

  const runAction = (result: { success: boolean; reason?: string }, successText: string) => {
    if (result.success) {
      setFeedback({ type: 'success', text: successText });
    } else {
      setFeedback({ type: 'error', text: result.reason ?? 'Aktion nicht möglich.' });
    }
  };

  if (!overview) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm select-none">
        <div className="w-full max-w-md bg-slate-950 border border-slate-800 rounded-xl shadow-2xl p-6 text-slate-300 text-sm">
          Keine Chronikdaten verfügbar.
          <button
            onClick={onClose}
            className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded text-xs font-mono cursor-pointer"
          >
            Schließen
          </button>
        </div>
      </div>
    );
  }

  const { pendingEvent, crisis, sites, treasury } = overview;
  const crisisActive = crisis.stage !== 'dormant';
  const crisisResolved = crisis.stage === 'resolved';
  const canContribute =
    crisisActive &&
    !crisisResolved &&
    treasury >= overview.crisisContainmentCost;
  const activeSite = sites.find((entry) => entry.site.id === overview.activeSiteId) ?? null;
  const history = [...overview.eventHistory].reverse();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm select-none">
      <div className="w-full max-w-4xl bg-slate-950 border border-slate-800 rounded-xl shadow-2xl p-6 font-sans max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-800">
          <div>
            <h3 className="text-lg font-bold text-slate-100">Galaktische Chronik</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Runde {overview.currentTurn} · {overview.completedSiteCount} abgeschlossene
              Ausgrabungen · {overview.eventHistory.length} dokumentierte Entscheidungen
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-[9px] font-mono text-slate-500">STAATSKASSE</div>
              <div className="text-sm font-mono text-amber-300 tabular-nums">
                ◈ {treasury.toFixed(1)}
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-200 w-8 h-8 rounded flex items-center justify-center font-mono cursor-pointer"
              title="Chronik schließen"
            >
              ✕
            </button>
          </div>
        </div>

        {feedback && (
          <div
            className={`mt-3 rounded border px-3 py-2 text-[11px] font-mono ${
              feedback.type === 'error'
                ? 'border-rose-800/80 bg-rose-950/40 text-rose-200'
                : 'border-emerald-800/80 bg-emerald-950/40 text-emerald-200'
            }`}
          >
            {feedback.text}
          </div>
        )}

        <div className="flex-1 overflow-y-auto mt-4 space-y-5 pr-1">
          {/* Offenes Ereignis */}
          {pendingEvent ? (
            <section className="rounded-lg border border-amber-800/70 bg-amber-950/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg leading-none" aria-hidden="true">📜</span>
                  <div>
                    <h4 className="text-sm font-semibold text-amber-100">{pendingEvent.title}</h4>
                    <div className="text-[9px] font-mono uppercase tracking-wider text-amber-400/80 mt-0.5">
                      Entscheidung erforderlich
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-amber-100/80 leading-relaxed mt-2">
                {pendingEvent.body}
              </p>
              <div className="mt-3 space-y-2">
                {pendingEvent.choices.map((choice) => {
                  const cost = choiceCost(choice.effect.credits);
                  const affordable = cost <= treasury;
                  return (
                    <button
                      key={choice.id}
                      onClick={() =>
                        runAction(
                          onResolveChoice(choice.id),
                          `Entschieden: ${choice.label}.`
                        )
                      }
                      disabled={!affordable}
                      className={`w-full text-left rounded border px-3 py-2 transition-colors ${
                        affordable
                          ? 'border-amber-800/70 bg-slate-950/40 hover:border-amber-500/80 hover:bg-slate-900/70 cursor-pointer'
                          : 'border-slate-800 bg-slate-950/40 opacity-50 cursor-not-allowed'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-100">{choice.label}</span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {choiceEffectSummary(choice.effect)}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">
                        {choice.description}
                      </p>
                      {!affordable && (
                        <p className="text-[10px] text-rose-300 mt-1">
                          {cost} ◈ erforderlich – Staatskasse zu niedrig.
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          ) : (
            <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-[11px] text-slate-400">
              Kein offenes Ereignis. Die Chronik wächst mit jeder Runde.
            </section>
          )}

          {/* Galaktische Krise */}
          <section
            className={`rounded-lg border p-4 ${
              crisisActive
                ? 'border-rose-800/70 bg-rose-950/20'
                : 'border-slate-800 bg-slate-900/40'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-slate-100">Galaktische Krise</h4>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {CRISIS_STAGE_HINT[crisis.stage]}
                </p>
              </div>
              <span
                className={`text-[9px] font-mono px-2 py-0.5 rounded border ${
                  crisisResolved
                    ? 'text-emerald-300 border-emerald-800/80 bg-emerald-950/40'
                    : crisisActive
                      ? 'text-rose-300 border-rose-800/80 bg-rose-950/40'
                      : 'text-slate-400 border-slate-800 bg-slate-900/40'
                }`}
              >
                {CRISIS_STAGE_LABEL[crisis.stage]}
              </span>
            </div>

            {crisisActive && (
              <div className="mt-3 space-y-2">
                <div>
                  <div className="flex items-center justify-between text-[9px] font-mono text-slate-500">
                    <span>EINDÄMMUNG</span>
                    <span>{crisis.containment} / 100</span>
                  </div>
                  <div className="h-2 rounded bg-slate-950 border border-slate-800 overflow-hidden mt-1">
                    <div
                      className={`h-full ${
                        crisis.containment >= 60 ? 'bg-emerald-500' : 'bg-rose-500'
                      }`}
                      style={{ width: `${Math.min(100, crisis.containment)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Ab 60 Eindämmung endet die Krise eingedämmt; darunter gilt sie als ignoriert.
                  </p>
                </div>

                {crisisResolved && crisis.outcome && (
                  <div className="text-[11px] font-mono text-slate-300">
                    Ausgang: {CRISIS_OUTCOME_LABEL[crisis.outcome]}
                  </div>
                )}

                {!crisisResolved && (
                  <button
                    onClick={() =>
                      runAction(onContribute(), 'Eindämmung verstärkt.')
                    }
                    disabled={!canContribute}
                    className={`w-full py-2 rounded text-xs font-mono font-semibold transition-colors ${
                      canContribute
                        ? 'bg-rose-600 hover:bg-rose-500 text-slate-950 cursor-pointer'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    }`}
                    title="Credits in die Eindämmung investieren"
                  >
                    Eindämmung finanzieren (−{overview.crisisContainmentCost} ◈, +20)
                  </button>
                )}
              </div>
            )}
          </section>

          {/* Ausgrabungsstätten */}
          <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-slate-100">Ausgrabungsstätten</h4>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Stätten erscheinen nach einer vollständigen Planetenanalyse. Es kann immer nur
                  eine Ausgrabung gleichzeitig laufen.
                </p>
              </div>
              {activeSite && (
                <span className="text-[9px] font-mono text-amber-300 border border-amber-800/80 bg-amber-950/40 px-2 py-0.5 rounded">
                  Grabung läuft
                </span>
              )}
            </div>

            {sites.length === 0 ? (
              <p className="text-[11px] text-slate-500 mt-3">
                Noch keine Stätte entdeckt. Analysiere Planeten mit Anomalien.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {sites.map(({ site, planetName, systemName }) => {
                  const progressPercent =
                    site.difficulty > 0
                      ? Math.min(100, (site.progress / site.difficulty) * 100)
                      : 0;
                  const canStart =
                    site.status === 'discovered' &&
                    overview.activeSiteId === null &&
                    treasury >= overview.excavationCost;
                  return (
                    <div
                      key={site.id}
                      className="rounded border border-slate-800 bg-slate-950/40 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-semibold text-slate-100">
                              {site.name}
                            </span>
                            <span
                              className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${SITE_STATUS_CLASS[site.status]}`}
                            >
                              {SITE_STATUS_LABEL[site.status]}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {planetName} · {systemName}
                          </div>
                        </div>
                        <div className="text-right text-[10px] font-mono text-slate-400 shrink-0">
                          <div>Belohnung</div>
                          <div className="text-amber-300">{site.rewardCredits} ◈</div>
                          <div className="text-cyan-300">+{site.rewardResearch} Forschung</div>
                        </div>
                      </div>

                      {site.status === 'active' && (
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-[9px] font-mono text-slate-500">
                            <span>FORTSCHRITT</span>
                            <span>
                              {site.progress} / {site.difficulty}
                            </span>
                          </div>
                          <div className="h-1.5 rounded bg-slate-950 border border-slate-800 overflow-hidden mt-1">
                            <div
                              className="h-full bg-amber-500"
                              style={{ width: `${progressPercent}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {site.status === 'discovered' && (
                        <button
                          onClick={() =>
                            runAction(
                              onStartExcavation(site.id),
                              `Ausgrabung gestartet: ${site.name}.`
                            )
                          }
                          disabled={!canStart}
                          className={`mt-2 w-full py-1.5 rounded text-[11px] font-mono font-semibold transition-colors ${
                            canStart
                              ? 'bg-cyan-600 hover:bg-cyan-500 text-slate-950 cursor-pointer'
                              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                          }`}
                          title={
                            overview.activeSiteId !== null
                              ? 'Es läuft bereits eine Ausgrabung.'
                              : treasury < overview.excavationCost
                                ? 'Nicht genügend Credits.'
                                : 'Ausgrabung beginnen'
                          }
                        >
                          Ausgrabung beginnen (−{overview.excavationCost} ◈)
                        </button>
                      )}

                      {site.status === 'completed' && (
                        <div className="mt-2 text-[10px] text-emerald-300/90">
                          Abgeschlossen in Runde {site.completedTurn ?? '–'}.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Chronik */}
          <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
            <h4 className="text-sm font-semibold text-slate-100">Entscheidungen</h4>
            {history.length === 0 ? (
              <p className="text-[11px] text-slate-500 mt-2">
                Noch keine Entscheidung dokumentiert.
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {history.map((record, index) => (
                  <li
                    key={`${record.eventId}:${record.turn}:${index}`}
                    className="flex items-start justify-between gap-3 rounded border border-slate-800/70 bg-slate-950/30 px-2.5 py-1.5"
                  >
                    <div className="min-w-0">
                      <div className="text-[11px] text-slate-200 truncate">{record.title}</div>
                      <div className="text-[10px] text-slate-500">{record.choiceLabel}</div>
                    </div>
                    <span className="text-[9px] font-mono text-slate-500 shrink-0">
                      Runde {record.turn}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
