/**
 * Astraea 4X - Galaxie-Erstellung
 *
 * Vollbildschirm mit zwei Wegen:
 *  1. Neue Galaxie erschaffen (nur Parameter, die der Generator wirklich nutzt).
 *  2. Mit bestehendem Seed fortfahren (Seed-Bibliothek, identische Parameter).
 */

import React, { useMemo, useState } from 'react';
import { GalaxyConfig, GalaxyShape, GalaxySize } from '../../core/types.ts';
import { GALAXY_SIZE_PRESETS } from '../../data/galaxyPresets.ts';
import {
  DEFAULT_AI_FACTION_COUNT,
  DEFAULT_PLAYER_FACTION_ID,
  HUMAN_FACTIONS,
  MAX_AI_FACTIONS,
  MIN_AI_FACTIONS,
  pickAiFactionIds,
} from '../../data/factionCatalog.ts';
import type { SeedLibraryEntry } from '../../save/seedLibrary.ts';

export interface StartGameOptions {
  /** Optionaler Anzeigename für die Seed-Bibliothek. */
  seedName?: string;
}

interface GalaxyCreationScreenProps {
  backgroundImageSrc?: string;
  defaultConfig: GalaxyConfig;
  seeds: SeedLibraryEntry[];
  initialTab?: 'new' | 'library';
  onBack: () => void;
  onStart: (config: GalaxyConfig, options: StartGameOptions) => void;
  onDeleteSeed: (id: string) => void;
}

const SHAPE_OPTIONS: Array<{ id: GalaxyShape; label: string; hint: string }> = [
  { id: 'spiral', label: 'Spirale', hint: 'Zwei logarithmische Arme' },
  { id: 'elliptical', label: 'Elliptisch', hint: 'Dichtes Zentrum, diffuse Außenbereiche' },
  { id: 'ring', label: 'Ring', hint: 'Hohlkern mit gleichmäßigem Ring' },
  { id: 'cluster', label: 'Cluster', hint: 'Mehrere verdichtete Gruppen' },
];

/** Bildet die Kappung aus GalaxyGenerator.sanitizeConfig für die Vorschau nach. */
function effectiveSystemCount(width: number, minDistance: number, requested: number): number {
  const maxDensitySystems = Math.floor((width * width) / (minDistance * minDistance * 1.5));
  return Math.max(5, Math.min(Math.min(requested, 300), maxDensitySystems));
}

function randomSeed(): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const prefix = Array.from({ length: 3 })
    .map(() => letters[Math.floor(Math.random() * letters.length)])
    .join('');
  return `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;
}

export const GalaxyCreationScreen: React.FC<GalaxyCreationScreenProps> = ({
  backgroundImageSrc,
  defaultConfig,
  seeds,
  initialTab = 'new',
  onBack,
  onStart,
  onDeleteSeed,
}) => {
  const [tab, setTab] = useState<'new' | 'library'>(initialTab);
  const [selectedSize, setSelectedSize] = useState<GalaxySize>(defaultConfig.size);
  const [selectedShape, setSelectedShape] = useState<GalaxyShape>(defaultConfig.shape);
  const [seed, setSeed] = useState<string>(defaultConfig.seed);
  const [systemCount, setSystemCount] = useState<number>(defaultConfig.systemCount);
  const [width, setWidth] = useState<number>(defaultConfig.width);
  const [minDistance, setMinDistance] = useState<number>(defaultConfig.minDistance);
  const [seedName, setSeedName] = useState('');
  const [selectedSeedId, setSelectedSeedId] = useState<string | null>(seeds[0]?.id ?? null);
  const [playerFactionId, setPlayerFactionId] = useState(
    defaultConfig.playerFactionId ?? DEFAULT_PLAYER_FACTION_ID,
  );
  const [aiFactionCount, setAiFactionCount] = useState(
    typeof defaultConfig.aiFactionCount === 'number'
      ? defaultConfig.aiFactionCount
      : DEFAULT_AI_FACTION_COUNT,
  );

  const selectedFaction =
    HUMAN_FACTIONS.find((faction) => faction.id === playerFactionId) ?? HUMAN_FACTIONS[0];

  // Vorschau der KI-Fraktionen: exakt dieselbe deterministische Auswahl wie
  // beim Spielstart, nur ohne die Galaxie zu erzeugen.
  const aiFactionPreview = useMemo(
    () =>
      pickAiFactionIds(seed.trim() || 'ASTRAEA-77', playerFactionId, aiFactionCount)
        .map((id) => HUMAN_FACTIONS.find((faction) => faction.id === id))
        .filter((faction): faction is (typeof HUMAN_FACTIONS)[number] => Boolean(faction)),
    [seed, playerFactionId, aiFactionCount],
  );

  const selectedSeed = useMemo(
    () => seeds.find((entry) => entry.id === selectedSeedId) ?? null,
    [seeds, selectedSeedId]
  );

  const effectiveCount = effectiveSystemCount(width, minDistance, systemCount);
  const isCapped = effectiveCount < systemCount;

  const handleSelectPreset = (sizeKey: GalaxySize) => {
    setSelectedSize(sizeKey);
    const preset = GALAXY_SIZE_PRESETS[sizeKey];
    setSystemCount(preset.systemCount);
    setWidth(preset.width);
    setMinDistance(preset.minDistance);
  };

  const handleStartNew = (event: React.FormEvent) => {
    event.preventDefault();
    onStart(
      {
        size: selectedSize,
        shape: selectedShape,
        seed: seed.trim() || 'ASTRAEA-77',
        systemCount,
        width,
        height: width,
        minDistance,
        playerFactionId,
        aiFactionCount,
      },
      { seedName: seedName.trim() || undefined }
    );
  };

  const handleStartSeed = () => {
    if (!selectedSeed) return;
    // Parameter stammen ausschließlich aus dem gespeicherten Eintrag, damit
    // derselbe Seed exakt dieselbe Galaxie erzeugt.
    onStart({ ...selectedSeed.config }, { seedName: selectedSeed.name });
  };

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
      <div className="fixed inset-0 bg-gradient-to-b from-slate-950/95 via-slate-950/90 to-slate-950" />

      <div className="relative z-10 mx-auto w-full max-w-5xl px-8 py-10">
        <div className="flex items-center justify-between">
          <div>
            <button
              onClick={onBack}
              className="text-[11px] font-mono text-slate-500 hover:text-cyan-400 transition-colors cursor-pointer"
            >
              ← Zurück zum Hauptmenü
            </button>
            <h2 className="mt-2 text-3xl font-bold tracking-wider text-slate-100 uppercase font-mono">
              Neues Spiel
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Wähle, ob eine neue Galaxie entsteht oder ein bekannter Seed fortgesetzt wird.
            </p>
          </div>
        </div>

        <div className="mt-6 flex gap-2 border-b border-slate-800">
          {(
            [
              { id: 'new', label: 'Neue Galaxie erschaffen' },
              { id: 'library', label: 'Mit bestehendem Seed fortfahren' },
            ] as const
          ).map((entry) => (
            <button
              key={entry.id}
              onClick={() => setTab(entry.id)}
              className={`px-4 py-2.5 text-xs font-mono uppercase tracking-wider border-b-2 transition-colors cursor-pointer ${
                tab === entry.id
                  ? 'border-cyan-500 text-cyan-300'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>

        {tab === 'new' ? (
          <form onSubmit={handleStartNew} className="mt-6 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem] gap-8">
            <div className="space-y-6">
              <section>
                <label className="text-[10px] font-mono text-slate-500 block mb-2 uppercase tracking-widest">
                  Galaxiegröße
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(Object.keys(GALAXY_SIZE_PRESETS) as GalaxySize[]).map((key) => {
                    const preset = GALAXY_SIZE_PRESETS[key];
                    const active = selectedSize === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handleSelectPreset(key)}
                        className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                          active
                            ? 'bg-cyan-950/80 border-cyan-500 text-cyan-200'
                            : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                        }`}
                      >
                        <div className="text-xs font-semibold">{preset.label}</div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                          {preset.systemCount} Systeme
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section>
                <label className="text-[10px] font-mono text-slate-500 block mb-2 uppercase tracking-widest">
                  Galaxieform
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {SHAPE_OPTIONS.map((shape) => (
                    <button
                      key={shape.id}
                      type="button"
                      onClick={() => setSelectedShape(shape.id)}
                      title={shape.hint}
                      className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer text-center ${
                        selectedShape === shape.id
                          ? 'bg-cyan-950/80 border-cyan-500 text-cyan-200'
                          : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {shape.label}
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
                    Spielerfraktion
                  </label>
                  <span className="text-[10px] font-mono text-slate-600">
                    {HUMAN_FACTIONS.length} Fraktionen der Menschheit
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {HUMAN_FACTIONS.map((faction) => {
                    const active = faction.id === playerFactionId;
                    return (
                      <button
                        key={faction.id}
                        type="button"
                        onClick={() => setPlayerFactionId(faction.id)}
                        title={faction.history}
                        className={`rounded-lg border p-2.5 text-left transition-colors cursor-pointer ${
                          active
                            ? 'bg-cyan-950/70 border-cyan-500'
                            : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-slate-950"
                            style={{ backgroundColor: faction.color }}
                            aria-hidden="true"
                          >
                            {faction.emblem}
                          </span>
                          <span className="text-xs font-semibold text-slate-100">
                            {faction.name}
                          </span>
                          <span
                            className="ml-auto h-2 w-2 rounded-full"
                            style={{ backgroundColor: faction.color }}
                            aria-hidden="true"
                          />
                        </div>
                        <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-slate-400">
                          {faction.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
                  <span className="text-slate-300">{selectedFaction.name}:</span>{' '}
                  {selectedFaction.history}
                </p>
                <p className="mt-1 text-[10px] font-mono text-slate-600">
                  Flottenstil: {selectedFaction.fleetStyleId} · Region: {selectedFaction.homeRegion}
                </p>
              </section>

              <section>
                <div className="flex justify-between text-xs font-mono mb-1">
                  <span className="text-slate-400">KI-Fraktionen</span>
                  <span className="text-cyan-400 font-semibold tabular-nums">
                    {aiFactionCount} von {MAX_AI_FACTIONS}
                  </span>
                </div>
                <input
                  type="range"
                  min={MIN_AI_FACTIONS}
                  max={MAX_AI_FACTIONS}
                  step="1"
                  value={aiFactionCount}
                  onChange={(event) => setAiFactionCount(Number(event.target.value))}
                  className="w-full accent-cyan-500 cursor-pointer"
                />
                <p className="mt-1 text-[10px] font-mono text-slate-500">
                  {aiFactionPreview.length === 0
                    ? 'Keine KI-Gegner – reine Erkundungspartie.'
                    : `Gegner: ${aiFactionPreview.map((faction) => faction.name).join(', ')}`}
                </p>
                <p className="mt-1 text-[10px] text-slate-600">
                  Die Auswahl ist deterministisch an den Seed gebunden und wird im Spielstand
                  gespeichert, nicht beim Laden neu gewürfelt.
                </p>
              </section>

              <section>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
                    Seed
                  </label>
                  <button
                    type="button"
                    onClick={() => setSeed(randomSeed())}
                    className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 underline cursor-pointer"
                  >
                    Zufälliger Seed
                  </button>
                </div>
                <input
                  type="text"
                  value={seed}
                  onChange={(event) => setSeed(event.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm font-mono text-slate-100 focus:outline-none focus:border-cyan-500"
                  placeholder="z. B. ASTRAEA-77"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Gleicher Seed und identische Parameter erzeugen exakt dieselbe Galaxie.
                </p>
              </section>

              <section className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <div className="flex justify-between text-xs font-mono mb-1">
                    <span className="text-slate-400">Systemanzahl</span>
                    <span className="text-cyan-400 font-semibold tabular-nums">{systemCount}</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="200"
                    step="5"
                    value={systemCount}
                    onChange={(event) => setSystemCount(Number(event.target.value))}
                    className="w-full accent-cyan-500 cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-xs font-mono mb-1">
                    <span className="text-slate-400">Mindestabstand</span>
                    <span className="text-cyan-400 font-semibold tabular-nums">{minDistance} Lj</span>
                  </div>
                  <input
                    type="range"
                    min="30"
                    max="120"
                    step="5"
                    value={minDistance}
                    onChange={(event) => setMinDistance(Number(event.target.value))}
                    className="w-full accent-cyan-500 cursor-pointer"
                  />
                </div>
                {isCapped && (
                  <p className="sm:col-span-2 text-[10px] font-mono text-amber-400/90">
                    Der Generator begrenzt diese Dichte auf {effectiveCount} Systeme (Fläche ×
                    Mindestabstand). Reduziere den Mindestabstand für mehr Systeme.
                  </p>
                )}
              </section>
            </div>

            <aside className="space-y-3">
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-2 text-xs font-mono text-slate-400">
                <div className="text-[10px] uppercase tracking-widest text-cyan-500/80">Vorschau</div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Seed</span>
                  <span className="text-slate-200 break-all text-right">{seed.trim() || 'ASTRAEA-77'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Form</span>
                  <span className="text-slate-200">
                    {SHAPE_OPTIONS.find((shape) => shape.id === selectedShape)?.label}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Fraktion</span>
                  <span className="text-slate-200">{selectedFaction.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">KI-Gegner</span>
                  <span className="text-slate-200 tabular-nums">{aiFactionCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Systeme</span>
                  <span className="text-slate-200 tabular-nums">{effectiveCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Karte</span>
                  <span className="text-slate-200 tabular-nums">
                    {width} × {width} Lj
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-2">
                <div className="text-[10px] font-mono uppercase tracking-widest text-cyan-500/80">
                  Seed-Bibliothek
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Startparameter werden automatisch mit Seed und Generatorversion abgelegt.
                </p>
                <input
                  type="text"
                  value={seedName}
                  onChange={(event) => setSeedName(event.target.value)}
                  placeholder="Name für die Bibliothek (optional)"
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-semibold text-xs uppercase font-mono tracking-widest transition-colors cursor-pointer shadow-lg shadow-cyan-950/40"
              >
                Galaxie erschaffen
              </button>
              <p className="text-[10px] text-slate-600 leading-relaxed">
                Der Start beginnt ohne Kolonie: eine kleine Fregatte, ein Aufklärungsschiff und ein
                Kolonieschiff bilden die Startflotte.
              </p>
            </aside>
          </form>
        ) : (
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem] gap-8">
            <div className="space-y-2">
              {seeds.length === 0 ? (
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-6 text-sm text-slate-400">
                  Noch keine Seeds gespeichert. Erschaffe eine neue Galaxie und aktiviere
                  „Diesen Seed speichern“.
                </div>
              ) : (
                seeds.map((entry) => {
                  const active = entry.id === selectedSeedId;
                  return (
                    <button
                      key={entry.id}
                      onClick={() => setSelectedSeedId(entry.id)}
                      className={`w-full text-left rounded-lg border p-3 transition-colors cursor-pointer ${
                        active
                          ? 'bg-cyan-950/60 border-cyan-600/70'
                          : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm text-slate-100 truncate">{entry.name}</div>
                          <div className="text-xs font-mono text-cyan-300/90 break-all mt-0.5">
                            {entry.seed}
                          </div>
                          <div className="text-[10px] font-mono text-slate-500 mt-1">
                            {entry.systemCount} Systeme · {entry.config.shape} · {entry.config.size} ·
                            Gen v{entry.generatorVersion}
                          </div>
                        </div>
                        <span
                          onClick={(event) => {
                            event.stopPropagation();
                            onDeleteSeed(entry.id);
                            if (active) setSelectedSeedId(null);
                          }}
                          className="text-slate-600 hover:text-rose-400 text-xs font-mono px-1.5 py-0.5 cursor-pointer"
                          title="Seed löschen"
                        >
                          ✕
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <aside className="space-y-3">
              {selectedSeed ? (
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-2 text-xs font-mono text-slate-400">
                  <div className="text-[10px] uppercase tracking-widest text-cyan-500/80">Auswahl</div>
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-600">Seed</span>
                    <span className="text-slate-200 break-all text-right">{selectedSeed.seed}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Systeme</span>
                    <span className="text-slate-200 tabular-nums">{selectedSeed.systemCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Karte</span>
                    <span className="text-slate-200 tabular-nums">
                      {selectedSeed.config.width} × {selectedSeed.config.height} Lj
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Mindestabstand</span>
                    <span className="text-slate-200 tabular-nums">
                      {selectedSeed.config.minDistance} Lj
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Generator</span>
                    <span className="text-slate-200">
                      Galaxie v{selectedSeed.generatorVersion} · Oberfläche v
                      {selectedSeed.surfaceGeneratorVersion}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-xs text-slate-500">
                  Kein Seed ausgewählt.
                </div>
              )}

              <button
                onClick={handleStartSeed}
                disabled={!selectedSeed}
                className={`w-full py-3 rounded-lg text-xs uppercase font-mono tracking-widest transition-colors ${
                  selectedSeed
                    ? 'bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-semibold cursor-pointer shadow-lg shadow-cyan-950/40'
                    : 'bg-slate-900 text-slate-600 border border-slate-800 cursor-not-allowed'
                }`}
              >
                Mit diesem Seed starten
              </button>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
};
