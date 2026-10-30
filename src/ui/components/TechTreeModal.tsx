/**
 * Astraea 4X - Technology Tree & Civilization Research Modal
 * Multi-discipline research visualization (Physics, Society, Engineering)
 * with tier ordering, prerequisite chains, exclusive specializations and
 * interactive progress bars.
 */

import React from 'react';
import { TECHNOLOGY_CATALOG } from '../../data/technologyCatalog.ts';
import { ResearchManager } from '../../core/researchManager.ts';
import {
  getSpecializationRivals,
  getTechStatus,
} from '../../core/techGraph.ts';
import { Civilization, TechCategory, TechnologyDef } from '../../core/types.ts';

interface TechTreeModalProps {
  isOpen: boolean;
  civilization: Civilization;
  onSelectTech: (techId: string) => void;
  onClose: () => void;
}

const techName = (techId: string): string => TECHNOLOGY_CATALOG[techId]?.name ?? techId;

const TIER_LABELS: Record<number, string> = {
  1: 'Grundlagen',
  2: 'Ausbau',
  3: 'Fortgeschritten',
  4: 'Doktrin',
};

export const TechTreeModal: React.FC<TechTreeModalProps> = ({
  isOpen,
  civilization,
  onSelectTech,
  onClose,
}) => {
  if (!isOpen) return null;

  const research = civilization.researchState;
  const allTechs = Object.values(TECHNOLOGY_CATALOG);
  const activeTech = research.currentTechId ? TECHNOLOGY_CATALOG[research.currentTechId] : null;

  const activeProgress = activeTech
    ? Math.min(100, Math.round((research.currentTechInvested / activeTech.cost) * 100))
    : 0;

  const branches: { category: TechCategory; label: string; icon: string; color: string }[] = [
    { category: 'physics', label: 'Physik & Energie', icon: '⚡', color: 'text-sky-400' },
    { category: 'society', label: 'Gesellschaft & Kolonisation', icon: '🏛️', color: 'text-emerald-400' },
    { category: 'engineering', label: 'Ingenieurwesen & Industrie', icon: '⚙️', color: 'text-amber-400' },
  ];

  const getBranchTechs = (cat: TechCategory): TechnologyDef[] => {
    return allTechs
      .filter((t) => t.category === cat)
      .sort((a, b) => a.tier - b.tier || a.cost - b.cost || a.id.localeCompare(b.id));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm select-none">
      <div className="w-full max-w-4xl bg-slate-950 border border-slate-800 rounded-xl shadow-2xl p-6 font-sans max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <div className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest">
              Zivilisationsweites Forschungsnetzwerk
            </div>
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2 mt-0.5">
              <span>🔬 Technologiebaum & Grundlagenforschung</span>
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right font-mono">
              <div className="text-[10px] uppercase tracking-widest text-slate-500">Fortschritt</div>
              <div className="text-xs text-cyan-300">
                {research.completedTechIds.length} / {allTechs.length} erforscht
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-200 w-8 h-8 rounded flex items-center justify-center font-mono cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Active Research Banner */}
        <div className="my-4 p-4 bg-slate-900/80 border border-slate-800/80 rounded-lg">
          <div className="flex items-center justify-between text-xs font-mono mb-2">
            <span className="text-slate-400">
              Aktives Forschungsprojekt:{' '}
              <strong className="text-cyan-300 font-bold">
                {activeTech ? activeTech.name : 'Keines ausgewählt'}
              </strong>
            </span>
            {activeTech && (
              <span className="text-slate-300">
                {research.currentTechInvested} / {activeTech.cost} FP ({activeProgress}%)
              </span>
            )}
          </div>
          <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden border border-slate-800">
            <div
              className="bg-cyan-500 h-full transition-all duration-300"
              style={{ width: `${activeProgress}%` }}
            />
          </div>
          {activeTech && (
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">{activeTech.description}</p>
          )}
        </div>

        {/* 3 Tech Discipline Columns */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-3 gap-4 pr-1">
          {branches.map(({ category, label, icon, color }) => {
            const techs = getBranchTechs(category);

            return (
              <div key={category} className="p-3 bg-slate-900/40 border border-slate-800/80 rounded-lg space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                  <span>{icon}</span>
                  <h3 className={`font-bold text-xs ${color}`}>{label}</h3>
                </div>

                <div className="space-y-2">
                  {techs.map((tech) => {
                    const status = getTechStatus(
                      research.completedTechIds,
                      research.currentTechId,
                      tech.id
                    );
                    const eligibility = ResearchManager.canResearch(research, tech.id);
                    const rivals = getSpecializationRivals(tech.id);

                    const cardClasses = status.researched
                      ? 'bg-emerald-950/30 border-emerald-800/60 text-slate-300'
                      : status.active
                      ? 'bg-cyan-950/60 border-cyan-500 text-cyan-100 shadow-md'
                      : eligibility.allowed
                      ? 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-200'
                      : status.blockedBy
                      ? 'bg-rose-950/20 border-rose-900/60 text-slate-500'
                      : 'bg-slate-950/40 border-slate-900 text-slate-600 opacity-60';

                    return (
                      <div key={tech.id} className={`p-3 rounded-lg border transition-all ${cardClasses}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-xs">{tech.name}</span>
                          <span className="text-[10px] font-mono whitespace-nowrap">
                            {status.researched
                              ? '✓ Erforscht'
                              : status.active
                              ? '⏳ Aktiv'
                              : `${tech.cost} FP`}
                          </span>
                        </div>

                        <div className="mt-1 flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-wider text-slate-500">
                          <span className="px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400">
                            Stufe {tech.tier}
                          </span>
                          <span>{TIER_LABELS[tech.tier] ?? ''}</span>
                        </div>

                        <p className="text-[11px] text-slate-400 mt-1 leading-snug">{tech.description}</p>

                        {/* Prerequisites indicator with resolved names */}
                        {tech.prerequisites.length > 0 && (
                          <div className="mt-2 text-[10px] font-mono text-slate-500">
                            <span className="text-slate-500">Voraussetzung: </span>
                            {tech.prerequisites.map((prereqId, index) => {
                              const met = research.completedTechIds.includes(prereqId);
                              return (
                                <span key={prereqId}>
                                  <span className={met ? 'text-emerald-400' : 'text-rose-300'}>
                                    {met ? '✓' : '✕'} {techName(prereqId)}
                                  </span>
                                  {index < tech.prerequisites.length - 1 ? ', ' : ''}
                                </span>
                              );
                            })}
                          </div>
                        )}

                        {/* Exclusive specialization hint */}
                        {rivals.length > 0 && (
                          <div className="mt-2 text-[10px] font-mono text-amber-300/90">
                            ★ Exklusive Spezialisierung – Alternative:{' '}
                            {rivals.map((rival) => rival.name).join(' / ')}
                          </div>
                        )}

                        {status.blockedBy && (
                          <div className="mt-2 text-[10px] font-mono text-rose-400">
                            🔒 Gesperrt: {status.blockedBy.name} wurde bereits gewählt.
                          </div>
                        )}

                        {/* Action button */}
                        {!status.researched && !status.active && eligibility.allowed && (
                          <button
                            onClick={() => onSelectTech(tech.id)}
                            className="mt-3 w-full py-1.5 bg-slate-800 hover:bg-cyan-600 hover:text-white text-cyan-300 rounded text-xs font-mono cursor-pointer transition-colors"
                          >
                            Erforschen
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
