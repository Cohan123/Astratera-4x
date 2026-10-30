/**
 * Astraea 4X - Reichsverwaltung & innere Fraktionen
 *
 * Zeigt Verwaltungskapazität, Governance-Politik und die drei inneren
 * Fraktionen eines Reiches. Die Werte kommen ausschließlich aus dem
 * EmpireManager; das Modal rechnet nichts nach.
 */

import React from 'react';
import {
  EMPIRE_POLICIES,
  EMPIRE_POLICY_COOLDOWN_TURNS,
  EMPIRE_POLICY_IDS,
  FACTIONS,
  FactionDefinition,
  EmpireOverview,
} from '../../core/empireManager.ts';
import { EmpirePolicy } from '../../core/types.ts';

interface EmpireModalProps {
  isOpen: boolean;
  onClose: () => void;
  overview: EmpireOverview | null;
  onSetPolicy: (policy: EmpirePolicy) => void;
  feedback?: string | null;
}

const signedPercent = (multiplier: number): string => {
  const percent = Math.round((multiplier - 1) * 100);
  if (percent === 0) return '±0 %';
  return `${percent > 0 ? '+' : ''}${percent} %`;
};

const signedValue = (value: number): string => (value > 0 ? `+${value}` : `${value}`);

const loyaltyColor = (loyalty: number): string => {
  if (loyalty >= 60) return 'bg-emerald-500';
  if (loyalty >= 40) return 'bg-amber-400';
  if (loyalty >= 30) return 'bg-orange-500';
  return 'bg-rose-500';
};

const loyaltyTextColor = (loyalty: number): string => {
  if (loyalty >= 60) return 'text-emerald-300';
  if (loyalty >= 40) return 'text-amber-300';
  if (loyalty >= 30) return 'text-orange-300';
  return 'text-rose-300';
};

const FactionCard: React.FC<{
  definition: FactionDefinition;
  faction: EmpireOverview['state']['factions'][number];
  isDominant: boolean;
  policy: EmpirePolicy;
}> = ({ definition, faction, isDominant, policy }) => (
  <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
    <div className="flex items-start justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-lg leading-none" aria-hidden="true">{definition.icon}</span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-slate-100">{definition.name}</span>
            {isDominant && (
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-cyan-800/80 bg-cyan-950/60 text-cyan-300">
                DOMINANT
              </span>
            )}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Bevorzugt: {EMPIRE_POLICIES[definition.favoredPolicy].name}
          </div>
        </div>
      </div>
      <span className={`text-sm font-mono font-semibold tabular-nums ${loyaltyTextColor(faction.loyalty)}`}>
        {faction.loyalty}
      </span>
    </div>

    <p className="text-[10px] text-slate-400 leading-relaxed mt-2">{definition.description}</p>

    <div className="mt-2 space-y-1.5">
      <div>
        <div className="flex items-center justify-between text-[9px] font-mono text-slate-500">
          <span>EINFLUSS</span>
          <span>{faction.influence} / 100</span>
        </div>
        <div className="h-1.5 rounded bg-slate-950 border border-slate-800 overflow-hidden">
          <div className="h-full bg-cyan-500" style={{ width: `${faction.influence}%` }} />
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between text-[9px] font-mono text-slate-500">
          <span>LOYALITÄT</span>
          <span className={loyaltyTextColor(faction.loyalty)}>{faction.loyalty} / 100</span>
        </div>
        <div className="h-1.5 rounded bg-slate-950 border border-slate-800 overflow-hidden">
          <div className={`h-full ${loyaltyColor(faction.loyalty)}`} style={{ width: `${faction.loyalty}%` }} />
        </div>
      </div>
    </div>

    {definition.favoredPolicy === policy && (
      <div className="mt-2 text-[10px] text-emerald-300/90">
        Unterstützt die aktuelle Reichspolitik.
      </div>
    )}
  </div>
);

export const EmpireModal: React.FC<EmpireModalProps> = ({
  isOpen,
  onClose,
  overview,
  onSetPolicy,
  feedback,
}) => {
  if (!isOpen) return null;

  if (!overview) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm select-none">
        <div className="w-full max-w-md bg-slate-950 border border-slate-800 rounded-xl shadow-2xl p-6 text-slate-300 text-sm">
          Keine Reichsdaten verfügbar.
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

  const { administration, state, modifiers } = overview;
  const cooldownActive = overview.currentTurn < state.policyCooldownUntil;
  const loadPercent = Math.min(
    100,
    administration.capacity > 0
      ? (administration.load / administration.capacity) * 100
      : 100
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm select-none">
      <div className="w-full max-w-4xl bg-slate-950 border border-slate-800 rounded-xl shadow-2xl p-6 font-sans max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-800">
          <div>
            <h3 className="text-lg font-bold text-slate-100">Reichsverwaltung</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {overview.civName} · Runde {overview.currentTurn} · {overview.colonyCount} Kolonien ·{' '}
              {overview.warCount} Kriege
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-[9px] font-mono text-slate-500">STAATSKASSE</div>
              <div className="text-sm font-mono text-amber-300 tabular-nums">
                ◈ {overview.treasury.toFixed(1)}
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-200 w-8 h-8 rounded flex items-center justify-center font-mono cursor-pointer"
              title="Schließen"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto mt-4 space-y-5 pr-1">
          {/* Verwaltungskapazität */}
          <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-slate-100">Verwaltungskapazität</h4>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Last aus Koloniestufen und Distrikten. Kapazität wächst mit Forschung und Rücklagen.
                </p>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-mono tabular-nums text-slate-200">
                  {administration.load} / {administration.capacity}
                </div>
                <div className="text-[10px] font-mono text-slate-500">
                  Effizienz {Math.round(administration.efficiency * 100)} %
                </div>
              </div>
            </div>

            <div className="mt-3 h-2 rounded bg-slate-950 border border-slate-800 overflow-hidden">
              <div
                className={`h-full ${administration.overextension > 0 ? 'bg-rose-500' : 'bg-emerald-500'}`}
                style={{ width: `${loadPercent}%` }}
              />
            </div>

            {administration.overextension > 0 ? (
              <div className="mt-2 text-[11px] text-rose-300">
                ⚠ Überdehnung um {administration.overextension}: Zustimmung und Fraktionsloyalität sinken.
              </div>
            ) : (
              <div className="mt-2 text-[11px] text-emerald-300/90">
                Verwaltung im Gleichgewicht.
              </div>
            )}
          </section>

          {/* Politik */}
          <section>
            <div className="flex items-center justify-between gap-3 mb-2">
              <div>
                <h4 className="text-sm font-semibold text-slate-100">Reichspolitik</h4>
                <p className="text-[10px] text-slate-500">
                  Ein Wechsel ist alle {EMPIRE_POLICY_COOLDOWN_TURNS} Runden möglich und verschiebt die Fraktionsstimmung.
                </p>
              </div>
              <div className="text-[10px] font-mono text-slate-500 shrink-0">
                {cooldownActive
                  ? `Wechsel ab Runde ${state.policyCooldownUntil}`
                  : 'Wechsel möglich'}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {EMPIRE_POLICY_IDS.map((policyId) => {
                const definition = EMPIRE_POLICIES[policyId];
                const active = state.policy === policyId;
                return (
                  <button
                    key={policyId}
                    onClick={() => onSetPolicy(policyId)}
                    disabled={active || cooldownActive}
                    className={`text-left rounded-lg border p-3 transition-colors ${
                      active
                        ? 'border-cyan-700/80 bg-cyan-950/40'
                        : cooldownActive
                          ? 'border-slate-800 bg-slate-900/30 opacity-50 cursor-not-allowed'
                          : 'border-slate-800 bg-slate-900/50 hover:border-slate-700 hover:bg-slate-900 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-xs font-semibold ${active ? 'text-cyan-300' : 'text-slate-200'}`}>
                        {definition.name}
                      </span>
                      {active && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-cyan-800/80 bg-cyan-950/60 text-cyan-300">
                          AKTIV
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 leading-relaxed mt-1">
                      {definition.description}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 text-[9px] font-mono text-slate-500">
                      <span>Produktion {signedPercent(definition.productionMultiplier)}</span>
                      <span>Forschung {signedPercent(definition.researchMultiplier)}</span>
                      <span>Einfluss {signedPercent(definition.influenceMultiplier)}</span>
                      <span>Zustimmung {signedValue(definition.approvalModifier)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Fraktionen */}
          <section>
            <div className="flex items-center justify-between gap-3 mb-2">
              <div>
                <h4 className="text-sm font-semibold text-slate-100">Innere Fraktionen</h4>
                <p className="text-[10px] text-slate-500">
                  Einfluss und Loyalität werden am Rundenende aus Wirtschaft, Forschung, Flotte und Steuern neu bewertet.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {FACTIONS.map((definition) => {
                const faction = state.factions.find((entry) => entry.id === definition.id);
                if (!faction) return null;
                return (
                  <FactionCard
                    key={definition.id}
                    definition={definition}
                    faction={faction}
                    isDominant={overview.dominantFactionId === definition.id}
                    policy={state.policy}
                  />
                );
              })}
            </div>
          </section>

          {/* Aktuelle Modifikatoren */}
          <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
            <h4 className="text-sm font-semibold text-slate-100">Aktuelle Reichsmodifikatoren</h4>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
              <div className="rounded border border-slate-800 bg-slate-950/60 px-2.5 py-2">
                <div className="text-slate-500 text-[9px]">PRODUKTION</div>
                <div className="text-slate-200">{signedPercent(modifiers.productionMultiplier)}</div>
              </div>
              <div className="rounded border border-slate-800 bg-slate-950/60 px-2.5 py-2">
                <div className="text-slate-500 text-[9px]">FORSCHUNG</div>
                <div className="text-slate-200">{signedPercent(modifiers.researchMultiplier)}</div>
              </div>
              <div className="rounded border border-slate-800 bg-slate-950/60 px-2.5 py-2">
                <div className="text-slate-500 text-[9px]">EINFLUSS</div>
                <div className="text-slate-200">{signedPercent(modifiers.influenceMultiplier)}</div>
              </div>
              <div className="rounded border border-slate-800 bg-slate-950/60 px-2.5 py-2">
                <div className="text-slate-500 text-[9px]">ZUSTIMMUNG</div>
                <div className="text-slate-200">{signedValue(modifiers.approvalModifier)}</div>
              </div>
            </div>
            <p className="mt-2 text-[10px] text-slate-500">
              Die Modifikatoren gelten ab der nächsten Runde. Eine dominante, loyale Fraktion
              verstärkt ihren Schwerpunkt zusätzlich um 5 %.
            </p>
          </section>

          {feedback && (
            <div className="rounded border border-amber-800/70 bg-amber-950/40 px-3 py-2 text-[11px] text-amber-200">
              {feedback}
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-slate-800 mt-4 flex items-center justify-between gap-3">
          <div className="text-[10px] font-mono text-slate-500">
            Fraktionswerte sind abgeleitet und werden mit dem Spielstand gespeichert.
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-mono cursor-pointer transition-colors"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
};
