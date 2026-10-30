/**
 * Astraea 4X - Testballon: Prozedurale Planetenoberfläche
 *
 * Führt den echten `SurfaceGenerator` mit frei wählbarem Planetentyp, Breite,
 * Höhe und Seed aus. Der Testzustand lebt ausschließlich in dieser Komponente
 * und hat keine Verbindung zu Kampagne, Speicherständen oder KI.
 */

import React, { useMemo, useState } from 'react';
import type { HexCoord, PlanetType } from '../../core/types.ts';
import { HexMath } from '../../surface/hexMath.ts';
import { PlanetSurfaceCanvas } from '../../ui/components/PlanetSurfaceCanvas.tsx';
import { HexTileInspector } from '../../ui/components/HexTileInspector.tsx';
import type { TestBalloonProps } from '../testLabRegistry.tsx';
import {
  DEFAULT_SURFACE_TEST_CONFIG,
  PLANET_TYPE_TEST_LABELS,
  SURFACE_TEST_LIMITS,
  SURFACE_TEST_PLANET_TYPES,
  SurfaceTestConfig,
  SurfaceTestResult,
  createRandomSeed,
  generateTestSurface,
  surfaceConfigKey,
  validateSurfaceTestConfig,
} from '../surfaceTestUtils.ts';

const noop = () => undefined;

interface ReproState {
  key: string;
  signature: string;
}

const ConfigLabel: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({
  label,
  hint,
  children,
}) => (
  <label className="block space-y-1">
    <span className="block text-[10px] font-mono uppercase tracking-widest text-slate-500">
      {label}
    </span>
    {children}
    {hint && <span className="block text-[10px] font-mono text-slate-600">{hint}</span>}
  </label>
);

export const SurfaceGeneratorBalloon: React.FC<TestBalloonProps> = ({ onBackToMenu }) => {
  const [config, setConfig] = useState<SurfaceTestConfig>({ ...DEFAULT_SURFACE_TEST_CONFIG });
  const [result, setResult] = useState<SurfaceTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedHex, setSelectedHex] = useState<HexCoord | null>(null);
  const [showDeposits, setShowDeposits] = useState(true);
  const [previousRun, setPreviousRun] = useState<ReproState | null>(null);
  const [reproducible, setReproducible] = useState<boolean | null>(null);

  const selectedTile = useMemo(() => {
    if (!result || !selectedHex) return null;
    const key = HexMath.coordToKey(selectedHex);
    return result.surface.tiles.find((tile) => tile.key === key) ?? null;
  }, [result, selectedHex]);

  const updateConfig = (patch: Partial<SurfaceTestConfig>) => {
    setConfig((current) => ({ ...current, ...patch }));
    setError(null);
  };

  const handleGenerate = () => {
    const errors = validateSurfaceTestConfig(config);
    if (errors.length > 0) {
      setError(errors.join(' '));
      return;
    }

    try {
      const next = generateTestSurface(config);
      const key = surfaceConfigKey(config);
      if (previousRun && previousRun.key === key) {
        setReproducible(previousRun.signature === next.signature);
      } else {
        setReproducible(null);
      }
      setPreviousRun({ key, signature: next.signature });
      setResult(next);
      setSelectedHex(null);
      setError(null);
    } catch (caught) {
      setResult(null);
      setError(caught instanceof Error ? caught.message : 'Unbekannter Generatorfehler.');
    }
  };

  const handleReset = () => {
    setConfig({ ...DEFAULT_SURFACE_TEST_CONFIG });
    setResult(null);
    setSelectedHex(null);
    setError(null);
    setPreviousRun(null);
    setReproducible(null);
  };

  const handleNewSeed = () => {
    updateConfig({ seed: createRandomSeed() });
  };

  return (
    <div className="h-full min-h-0 flex flex-col gap-3">
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-cyan-500">
            Testballon · Oberflächengenerator
          </div>
          <h2 className="text-lg font-bold text-slate-100">Prozedurale Planetenoberfläche</h2>
          <p className="text-[11px] font-mono text-slate-500">
            Verwendet denselben <code>SurfaceGenerator.generateSurface</code> wie das Spiel.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBackToMenu}
            className="px-3 py-1.5 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-mono cursor-pointer"
          >
            ← Testmenü
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            className="px-4 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-slate-950 text-xs font-mono font-semibold cursor-pointer"
          >
            Oberfläche generieren
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="px-3 py-1.5 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-mono cursor-pointer"
          >
            Zurücksetzen
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[20rem_minmax(0,1fr)] gap-3">
        {/* Konfiguration */}
        <aside className="min-h-0 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-3">
          <ConfigLabel label="Planet / Biom">
            <select
              data-testid="surface-planet-type"
              value={config.planetType}
              onChange={(event) => updateConfig({ planetType: event.target.value as PlanetType })}
              className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs font-mono text-slate-200"
            >
              {SURFACE_TEST_PLANET_TYPES.map((planetType) => (
                <option key={planetType} value={planetType}>
                  {PLANET_TYPE_TEST_LABELS[planetType]}
                </option>
              ))}
            </select>
          </ConfigLabel>

          <div className="grid grid-cols-2 gap-2">
            <ConfigLabel label="Breite">
              <input
                data-testid="surface-width"
                type="number"
                min={SURFACE_TEST_LIMITS.minWidth}
                max={SURFACE_TEST_LIMITS.maxWidth}
                value={config.width}
                onChange={(event) => updateConfig({ width: Number(event.target.value) })}
                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs font-mono text-slate-200"
              />
            </ConfigLabel>
            <ConfigLabel label="Höhe">
              <input
                data-testid="surface-height"
                type="number"
                min={SURFACE_TEST_LIMITS.minHeight}
                max={SURFACE_TEST_LIMITS.maxHeight}
                value={config.height}
                onChange={(event) => updateConfig({ height: Number(event.target.value) })}
                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs font-mono text-slate-200"
              />
            </ConfigLabel>
          </div>
          <p className="text-[10px] font-mono text-slate-600 -mt-1">
            Erlaubt: {SURFACE_TEST_LIMITS.minWidth}–{SURFACE_TEST_LIMITS.maxWidth} ×{' '}
            {SURFACE_TEST_LIMITS.minHeight}–{SURFACE_TEST_LIMITS.maxHeight} Kacheln.
          </p>

          <ConfigLabel label="Seed" hint="Gleicher Seed + gleiche Parameter = identische Oberfläche.">
            <div className="flex gap-1.5">
              <input
                data-testid="surface-seed"
                type="text"
                value={config.seed}
                onChange={(event) => updateConfig({ seed: event.target.value })}
                className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs font-mono text-slate-200"
              />
              <button
                type="button"
                onClick={handleNewSeed}
                className="shrink-0 px-2 py-1.5 rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono cursor-pointer"
              >
                Auto
              </button>
            </div>
          </ConfigLabel>

          <label className="flex items-center gap-2 text-[11px] font-mono text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={showDeposits}
              onChange={(event) => setShowDeposits(event.target.checked)}
              className="accent-cyan-500"
            />
            Ressourcenvorkommen einblenden
          </label>

          {error && (
            <div
              data-testid="surface-config-error"
              className="rounded border border-rose-800 bg-rose-950/50 p-2 text-[11px] font-mono text-rose-300"
            >
              {error}
            </div>
          )}

          {result && (
            <div className="rounded border border-slate-800 bg-slate-900/60 p-2 space-y-1 text-[10px] font-mono text-slate-400">
              <div>
                <span className="text-slate-600">Generator:</span> v
                {result.surface.generatorVersion}
              </div>
              <div>
                <span className="text-slate-600">Signatur:</span> {result.signature}
              </div>
              <div>
                <span className="text-slate-600">Reproduzierbar:</span>{' '}
                {reproducible === null ? (
                  <span className="text-slate-500">erneut generieren zum Vergleich</span>
                ) : reproducible ? (
                  <span className="text-emerald-400">identisch</span>
                ) : (
                  <span className="text-rose-400">abweichend</span>
                )}
              </div>
            </div>
          )}

          <div className="border-t border-slate-800 pt-3 text-[10px] font-mono text-slate-600 leading-relaxed">
            Der Test verändert keine Kampagne, keine Speicherstände und keine Rundenlogik.
            Kacheln werden nur in dieser Ansicht sichtbar geschaltet.
          </div>
        </aside>

        {/* Ansicht */}
        <section className="min-h-0 flex flex-col gap-3">
          <div className="relative flex-1 min-h-[420px] rounded-xl border border-slate-800 overflow-hidden bg-slate-950">
            {result ? (
              <PlanetSurfaceCanvas
                key={`${result.surface.seed}:${result.surface.width}x${result.surface.height}:${result.signature}`}
                planet={result.planet}
                surface={result.surface}
                colonies={[]}
                units={[]}
                selectedHexCoord={selectedHex}
                selectedUnit={null}
                onSelectHex={setSelectedHex}
                onBackToSystem={onBackToMenu}
                showBackButton={false}
                revealAllDeposits={showDeposits}
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6">
                <div className="text-sm font-semibold text-slate-300">
                  Noch keine Oberfläche generiert
                </div>
                <p className="max-w-md text-[11px] font-mono text-slate-500">
                  Wähle Planetentyp, Größe und Seed und starte die Generierung. Die Ansicht zeigt
                  anschließend das echte Generatorergebnis inklusive Biom-, Höhen- und
                  Ressourcendaten.
                </p>
              </div>
            )}

            {result && selectedTile && (
              <div className="absolute top-0 right-0 bottom-0 z-30 max-w-[20rem]">
                <HexTileInspector
                  tile={selectedTile}
                  surface={result.surface}
                  colony={null}
                  unitsOnTile={[]}
                  selectedUnit={null}
                  completedTechIds={[]}
                  onClaimHex={noop}
                  onOpenBuildMenu={noop}
                  onUpgradeBuilding={noop}
                  onPlaceDistrict={noop}
                  onRemoveDistrict={noop}
                  onSelectUnit={noop}
                  onClose={() => setSelectedHex(null)}
                  showColonySections={false}
                />
              </div>
            )}
          </div>

          {/* Ergebnisdaten */}
          {result && (
            <div className="shrink-0 grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <h3 className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-2">
                  Parameter & Ergebnis
                </h3>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] font-mono">
                  <dt className="text-slate-500">Seed</dt>
                  <dd className="text-slate-200 break-all">{config.seed}</dd>
                  <dt className="text-slate-500">Oberflächen-Seed</dt>
                  <dd className="text-slate-400 break-all">{result.surface.seed}</dd>
                  <dt className="text-slate-500">Biom / Planet</dt>
                  <dd className="text-slate-200">{PLANET_TYPE_TEST_LABELS[config.planetType]}</dd>
                  <dt className="text-slate-500">Abmessungen</dt>
                  <dd className="text-slate-200">
                    {result.surface.width} × {result.surface.height}
                  </dd>
                  <dt className="text-slate-500">Kacheln</dt>
                  <dd className="text-slate-200">
                    {result.statistics.tileCount} / {result.statistics.expectedTileCount}
                  </dd>
                  <dt className="text-slate-500">Biomtypen</dt>
                  <dd className="text-slate-200">{result.statistics.biomeCount}</dd>
                  <dt className="text-slate-500">Vorkommen</dt>
                  <dd className="text-slate-200">{result.statistics.depositCount}</dd>
                  <dt className="text-slate-500">Gefahren</dt>
                  <dd className="text-amber-300">{result.statistics.hazardCount}</dd>
                  <dt className="text-slate-500">Unpassierbar</dt>
                  <dd className="text-rose-300">{result.statistics.impassableCount}</dd>
                  <dt className="text-slate-500">Flüsse / Seen</dt>
                  <dd className="text-slate-200">
                    {result.statistics.riverCount} / {result.statistics.lakeCount}
                  </dd>
                  <dt className="text-slate-500">Höhe min/max/Ø</dt>
                  <dd className="text-slate-200">
                    {result.statistics.minElevation}/{result.statistics.maxElevation}/
                    {result.statistics.averageElevation}
                  </dd>
                </dl>

                {result.warnings.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {result.warnings.map((warning) => (
                      <li
                        key={warning}
                        className="rounded border border-amber-800/60 bg-amber-950/30 px-2 py-1 text-[10px] font-mono text-amber-300"
                      >
                        ⚠ {warning}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <h3 className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-2">
                  Gelände- und Ressourcenverteilung
                </h3>
                <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
                  {result.statistics.biomes.map((biome) => (
                    <div key={biome.id} className="text-[10px] font-mono">
                      <div className="flex items-center justify-between gap-2">
                        <span className={biome.passable ? 'text-slate-300' : 'text-rose-300'}>
                          {biome.label}
                        </span>
                        <span className="text-slate-500">
                          {biome.count} · {biome.share} %
                        </span>
                      </div>
                      <div className="h-1 rounded bg-slate-900 overflow-hidden">
                        <div
                          className={`h-full ${biome.passable ? 'bg-cyan-600' : 'bg-rose-700'}`}
                          style={{ width: `${Math.min(100, biome.share)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 border-t border-slate-800 pt-2 space-y-1">
                  {result.statistics.deposits.length === 0 ? (
                    <div className="text-[10px] font-mono text-slate-600">
                      Keine Ressourcenvorkommen erzeugt.
                    </div>
                  ) : (
                    result.statistics.deposits.map((deposit) => (
                      <div
                        key={deposit.id}
                        className="flex items-center justify-between text-[10px] font-mono"
                      >
                        <span className="text-slate-300">
                          {deposit.icon} {deposit.label}
                        </span>
                        <span className="text-slate-500">
                          {deposit.count} · {deposit.share} %
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
