/**
 * Astraea 4X - Terraforming Modal (Phase 2)
 * Controls planetary engineering: target biome/atmosphere selection,
 * effort cost preview, progress tracking and project cancellation.
 */

import React, { useEffect, useState } from 'react';
import { AtmosphereType, HexBiome, Planet, TerraformingProject } from '../../core/types.ts';
import { ATMOSPHERE_LABELS } from '../../data/planetCatalog.ts';
import { TerraformingOptions, TerraformingStartResult } from '../../core/terraformingManager.ts';

interface TerraformingModalProps {
  isOpen: boolean;
  planet: Planet | null;
  project: TerraformingProject | null;
  completedTechIds: string[];
  getRequiredEffort: (options: TerraformingOptions) => number;
  onStart: (options: TerraformingOptions) => TerraformingStartResult;
  onCancel: () => boolean;
  onChanged: () => void;
  onClose: () => void;
}

const BIOME_LABELS: Record<HexBiome, string> = {
  plains: 'Ebenen',
  forest: 'Wald',
  jungle: 'Dschungel',
  marsh: 'Marsch',
  ocean: 'Ozean',
  desert: 'Wüste',
  hills: 'Hügel',
  mountains: 'Gebirge',
  tundra: 'Tundra',
  snow: 'Gletscher',
  volcanic: 'Vulkanisch',
  lava: 'Lavasee',
  toxic: 'Giftauen',
  alien: 'Xenoflora',
  fungal_forest: 'Pilzwald',
  impact_crater: 'Einschlagkrater',
  gas: 'Gaswolken',
};

const TARGET_BIOMES: HexBiome[] = [
  'plains',
  'forest',
  'jungle',
  'marsh',
  'fungal_forest',
  'hills',
  'tundra',
];
const TARGET_ATMOSPHERES: AtmosphereType[] = ['breathable', 'thin', 'dense'];

export const TerraformingModal: React.FC<TerraformingModalProps> = ({
  isOpen,
  planet,
  project,
  completedTechIds,
  getRequiredEffort,
  onStart,
  onCancel,
  onChanged,
  onClose,
}) => {
  const [targetBiome, setTargetBiome] = useState<HexBiome | ''>('');
  const [targetAtmosphere, setTargetAtmosphere] = useState<AtmosphereType | ''>('');
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  useEffect(() => {
    setTargetBiome('');
    setTargetAtmosphere('');
    setFeedback(null);
  }, [planet?.id]);

  if (!isOpen || !planet) return null;

  const hasTech = completedTechIds.includes('atmospheric_scrubbers');
  const progressPercent = project
    ? Math.min(100, Math.round((project.progress / Math.max(1, project.totalRequired)) * 100))
    : 0;

  const handleStart = () => {
    setFeedback(null);
    if (!targetBiome && !targetAtmosphere) {
      setFeedback({ kind: 'error', text: 'Wähle mindestens ein Terraforming-Ziel (Biom oder Atmosphäre).' });
      return;
    }
    const result = onStart({
      targetBiome: targetBiome || undefined,
      targetAtmosphere: targetAtmosphere || undefined,
    });
    if (!result.allowed) {
      setFeedback({ kind: 'error', text: result.reason || 'Terraforming konnte nicht gestartet werden.' });
      return;
    }
    setFeedback({ kind: 'success', text: 'Terraforming-Projekt gestartet. Fortschritt läuft pro Runde.' });
    onChanged();
  };

  const handleCancel = () => {
    if (onCancel()) {
      setFeedback({ kind: 'success', text: 'Terraforming-Projekt abgebrochen.' });
      onChanged();
    } else {
      setFeedback({ kind: 'error', text: 'Kein laufendes Projekt zum Abbruch gefunden.' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm select-none">
      <div className="w-full max-w-2xl bg-slate-950 border border-slate-800 rounded-xl shadow-2xl p-6 font-sans max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-800">
          <div>
            <div className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest">
              Planetare Ingenieurskunst
            </div>
            <h2 className="text-xl font-bold text-slate-100 mt-0.5">🌱 Terraforming · {planet.name}</h2>
            <div className="text-[11px] font-mono text-slate-500 mt-1">
              Habitabilität aktuell: {planet.habitability}% · Atmosphäre: {ATMOSPHERE_LABELS[planet.atmosphere].label}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 w-8 h-8 rounded flex items-center justify-center font-mono cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto pr-1">
          {!hasTech && (
            <div className="mt-4 p-3 bg-rose-950/40 border border-rose-500/50 rounded-lg text-xs font-mono text-rose-200">
              Voraussetzung fehlt: Technologie „Atmosphärische Reinigungsanlagen" (atmospheric_scrubbers) muss erforscht sein.
            </div>
          )}

          {project ? (
            <div className="mt-4 p-4 bg-slate-900/60 border border-emerald-700/50 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-emerald-300 uppercase tracking-wider">
                  Laufendes Projekt
                </span>
                <span className="text-[11px] font-mono text-slate-300 tabular-nums">
                  {project.progress} / {project.totalRequired} Aufwand ({progressPercent}%)
                </span>
              </div>
              <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden border border-slate-800">
                <div className="bg-emerald-500 h-full transition-all duration-300" style={{ width: `${progressPercent}%` }} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                <div>
                  <span className="text-slate-500 block text-[10px]">ZIEL-BIOM</span>
                  <span className="text-slate-200 font-semibold">
                    {project.targetBiome ? BIOME_LABELS[project.targetBiome] : 'Unverändert'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">ZIEL-ATMOSPHÄRE</span>
                  <span className="text-slate-200 font-semibold">
                    {project.targetAtmosphere ? ATMOSPHERE_LABELS[project.targetAtmosphere].label : 'Unverändert'}
                  </span>
                </div>
              </div>
              <button
                onClick={handleCancel}
                className="w-full py-2 px-3 bg-slate-800 hover:bg-rose-900/60 text-rose-300 border border-slate-700 hover:border-rose-700 rounded text-xs font-mono cursor-pointer transition-colors"
              >
                Projekt abbrechen
              </button>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-lg space-y-3">
                <h3 className="text-sm font-bold text-slate-100">Ziel-Biom</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {TARGET_BIOMES.map((biome) => (
                    <button
                      key={biome}
                      onClick={() => setTargetBiome(targetBiome === biome ? '' : biome)}
                      className={`py-2 px-2 rounded border text-[11px] font-mono cursor-pointer transition-colors ${
                        targetBiome === biome
                          ? 'bg-emerald-950/70 border-emerald-500 text-emerald-200'
                          : 'bg-slate-950 border-slate-700 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      {BIOME_LABELS[biome]}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500 font-mono">
                  Transformierbare Kacheln (Wüste, Tundra, Vulkan, Gift, Krater) werden umgewandelt.
                </p>
              </div>

              <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-lg space-y-3">
                <h3 className="text-sm font-bold text-slate-100">Ziel-Atmosphäre</h3>
                <div className="grid grid-cols-3 gap-2">
                  {TARGET_ATMOSPHERES.map((atm) => (
                    <button
                      key={atm}
                      onClick={() => setTargetAtmosphere(targetAtmosphere === atm ? '' : atm)}
                      className={`py-2 px-2 rounded border text-[11px] font-mono cursor-pointer transition-colors ${
                        targetAtmosphere === atm
                          ? 'bg-cyan-950/70 border-cyan-500 text-cyan-200'
                          : 'bg-slate-950 border-slate-700 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      {ATMOSPHERE_LABELS[atm].label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500 font-mono">
                  „Atembar" hebt bei fehlendem Wasser die Wasserverfügbarkeit auf „Moderat".
                </p>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-900/60 border border-slate-800 rounded-lg text-xs font-mono">
                <span className="text-slate-400">Geschätzter Gesamtaufwand</span>
                <span className="text-amber-300 font-bold tabular-nums">
                  {getRequiredEffort({
                    targetBiome: targetBiome || undefined,
                    targetAtmosphere: targetAtmosphere || undefined,
                  })}{' '}
                  Punkte
                </span>
              </div>

              <button
                onClick={handleStart}
                disabled={!hasTech}
                className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-slate-950 font-bold rounded text-xs font-mono cursor-pointer transition-colors"
              >
                Terraforming-Projekt starten
              </button>
            </div>
          )}

          {feedback && (
            <div
              className={`mt-3 p-2.5 rounded border text-[11px] font-mono ${
                feedback.kind === 'error'
                  ? 'bg-rose-950/50 border-rose-500/60 text-rose-200'
                  : 'bg-emerald-950/50 border-emerald-500/60 text-emerald-200'
              }`}
            >
              {feedback.text}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
