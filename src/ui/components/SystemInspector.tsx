/**
 * Astraea 4X - System Inspector Panel
 * Tactical telemetry inspector presenting astrophysical data, planetary slots,
 * discovery status, hyperlane connections, and future module readiness.
 */

import React from 'react';
import { StarSystem } from '../../core/types.ts';
import { STAR_SPECTRAL_CATALOG } from '../../data/starClassCatalog.ts';

interface SystemInspectorProps {
  system: StarSystem | null;
  allSystems: StarSystem[];
  ownerName?: string | null;
  onSelectSystem: (system: StarSystem) => void;
  onSurveySystem: (systemId: string) => void;
  onOpenSystemMap: (system: StarSystem) => void;
  onClose: () => void;
}

export const SystemInspector: React.FC<SystemInspectorProps> = ({
  system,
  allSystems,
  ownerName,
  onSelectSystem,
  onSurveySystem,
  onOpenSystemMap,
  onClose,
}) => {
  if (!system) {
    return (
      <aside className="w-80 md:w-96 bg-slate-950/90 border-l border-slate-800/80 p-6 flex flex-col justify-center items-center text-center text-slate-500 text-xs font-mono select-none">
        <div className="w-12 h-12 rounded-full border border-slate-800 flex items-center justify-center mb-3 text-slate-600">
          ✦
        </div>
        <p className="text-slate-400 font-semibold mb-1">Kein System ausgewählt</p>
        <p className="text-slate-600 max-w-xs">
          Wähle ein Sternensystem auf der Galaxy-Karte an, um astrophysikalische Sensordaten und planetare Vorabanalysen einzusehen.
        </p>
      </aside>
    );
  }

  const star = system.star;
  const spectralInfo = STAR_SPECTRAL_CATALOG[star.spectralClass];

  // Resolve connected hyperlane systems
  const connectedSystems = system.hyperlanes
    .map((targetId) => {
      const target = allSystems.find((s) => s.id === targetId);
      if (!target) return null;
      const distLy = Math.round(Math.hypot(target.x - system.x, target.y - system.y));
      return { target, distLy };
    })
    .filter((item): item is { target: StarSystem; distLy: number } => item !== null)
    .sort((a, b) => a.distLy - b.distLy);

  return (
    <aside className="w-84 md:w-96 bg-slate-950/95 border-l border-slate-800/80 p-5 flex flex-col h-full overflow-y-auto select-none backdrop-blur-md shadow-2xl">
      {/* Top Header & Close */}
      <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-cyan-400 font-semibold">{system.id}</span>
            <span className="text-slate-600">·</span>
            <span className="text-[11px] font-mono text-slate-400">
              X:{system.x > 0 ? `+${system.x}` : system.x} Y:{system.y > 0 ? `+${system.y}` : system.y} Lj
            </span>
          </div>
          <h2 className="text-xl font-bold text-slate-100 tracking-tight mt-0.5">{system.name}</h2>
        </div>

        <button
          onClick={onClose}
          className="w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors text-sm cursor-pointer font-mono"
          title="Inspektor schließen"
        >
          ✕
        </button>
      </div>

      {/* Primary Action: Open System Map */}
      <button
        onClick={() => onOpenSystemMap(system)}
        className="mt-3 w-full py-2 px-3 bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-slate-950 font-semibold rounded text-xs font-mono uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-cyan-950/40"
      >
        <span>🪐</span>
        <span>Systemkarte öffnen</span>
      </button>

      {/* Star Spectral Information Card */}
      <div className="mt-4 p-3.5 bg-slate-900/70 border border-slate-800/80 rounded-lg">
        <div className="flex items-center gap-3 mb-2.5">
          <div
            className="w-8 h-8 rounded-full shadow-lg flex items-center justify-center shrink-0 border border-white/20"
            style={{
              backgroundColor: star.color,
              boxShadow: `0 0 16px ${star.glowColor}`,
            }}
          >
            <span className="text-[10px] font-bold font-mono text-slate-950">
              {star.spectralClass}
            </span>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-200">{spectralInfo.displayName}</div>
            <div className="text-[11px] text-slate-400 font-mono">
              Primärstern: {star.name}
            </div>
          </div>
        </div>

        <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
          {spectralInfo.description}
        </p>

        {/* Astrophysical Metrics Grid */}
        <div className="grid grid-cols-2 gap-2 text-[11px] font-mono border-t border-slate-800/70 pt-2.5">
          <div>
            <span className="text-slate-500 block text-[10px]">TEMPERATUR</span>
            <span className="text-slate-200 font-semibold tabular-nums">{star.temperatureK.toLocaleString()} K</span>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px]">LEUCHTKRAFT</span>
            <span className="text-slate-200 font-semibold tabular-nums">{star.luminositySolar} L☉</span>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px]">STELLARE MASSE</span>
            <span className="text-slate-200 font-semibold tabular-nums">{star.massSolar} M☉</span>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px]">STERNENRADIUS</span>
            <span className="text-slate-200 font-semibold tabular-nums">{(star.radiusKm / 1000).toFixed(0)} Tsd. km</span>
          </div>
        </div>
      </div>

      {/* Discovery & Exploration Status */}
      <div className="mt-4 p-3 bg-slate-900/50 border border-slate-800/80 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-mono text-slate-400 uppercase">Erkundungsstatus</span>
          <span
            className={`text-xs font-mono font-semibold ${
              system.discoveryStatus === 'colonized'
                ? 'text-emerald-400'
                : system.discoveryStatus === 'surveyed'
                ? 'text-cyan-400'
                : 'text-amber-400'
            }`}
          >
            {system.discoveryStatus === 'colonized'
              ? 'Besiedelt'
              : system.discoveryStatus === 'surveyed'
              ? 'Vollständig kartiert'
              : 'Unerforscht'}
          </span>
        </div>

        {system.discoveryStatus === 'unexplored' ? (
          <div className="mt-2">
            <p className="text-[11px] text-slate-400 mb-2.5 leading-normal">
              Dieses System wurde noch nicht von Fernaufklärungssonden erfasst. Sensordaten über Planetenkörper sind vorläufig.
            </p>
            <button
              onClick={() => onSurveySystem(system.id)}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-800/50 rounded text-xs font-mono font-semibold transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <span>✦</span>
              <span>Aufklärungssonde entsenden</span>
            </button>
          </div>
        ) : (
          <div className="text-[11px] text-slate-400 leading-normal">
            Systemkartierung abgeschlossen. Orbitale Resonanzen und Spektralanalysen sind in der Schiffsdatenbank gespeichert.
          </div>
        )}

        {/* Anomaly Callout */}
        {system.anomalyDetected && (
          <div className="mt-3 p-2 bg-amber-950/30 border border-amber-800/40 rounded text-[11px] text-amber-300 flex items-center gap-2">
            <span>⚠</span>
            <span>Subraum-Signal / Gravitationsanomalie gemessen</span>
          </div>
        )}
      </div>

      {/* Planetary Slots Preview (Phase 2 Bridge) */}
      <div className="mt-4 p-3 bg-slate-900/50 border border-slate-800/80 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-mono text-slate-400 uppercase">Orbitale Körper</span>
          <span className="text-xs font-mono text-slate-200 font-semibold">{system.planetCount} Planeten</span>
        </div>

        {/* Visual Slots representation */}
        {system.planets && system.planets.length > 0 ? (
          <div className="flex items-center gap-2 py-2 overflow-x-auto border-b border-slate-800/70 mb-2">
            {system.planets.map((p) => (
              <button
                key={p.id}
                onClick={() => onOpenSystemMap(system)}
                className="flex flex-col items-center gap-1 shrink-0 p-1.5 bg-slate-950/60 hover:bg-slate-800/80 rounded border border-slate-800 hover:border-cyan-500/50 transition-colors cursor-pointer"
                title={`${p.name} - Klicken für Systemkarte`}
              >
                <div
                  className="w-4 h-4 rounded-full shadow-sm"
                  style={{ backgroundColor: p.color }}
                />
                <span className="text-[9px] font-mono text-slate-400">P-{p.orbitIndex}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-slate-500 italic mb-2">Keine nennenswerten Großplaneten im Orbit.</p>
        )}

        <div className="text-[10px] text-slate-500 font-mono">
          ℹ Klicke auf „Systemkarte öffnen“, um Umlaufbahnen und Oberflächendetails zu untersuchen.
        </div>
      </div>

      {/* Hyperlane Connections List */}
      <div className="mt-4 p-3 bg-slate-900/50 border border-slate-800/80 rounded-lg">
        <div className="text-xs font-mono text-slate-400 uppercase mb-2">
          Hyperlane-Verbindungen ({connectedSystems.length})
        </div>

        {connectedSystems.length === 0 ? (
          <p className="text-[11px] text-slate-500 italic">Isoliertes System ohne Hyperlane-Knotenpunkt.</p>
        ) : (
          <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
            {connectedSystems.map(({ target, distLy }) => (
              <button
                key={target.id}
                onClick={() => onSelectSystem(target)}
                className="flex items-center justify-between p-2 rounded bg-slate-950/50 hover:bg-slate-800/80 border border-slate-800/60 text-left transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: target.star.color }}
                  />
                  <span className="text-xs text-slate-200 group-hover:text-cyan-300 font-medium font-sans">
                    {target.name}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-slate-500 group-hover:text-slate-400">
                  {distLy} Lj
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Territorial Ownership & Colonies (Modul 3) */}
      {system.planets && system.planets.some((p) => p.colonizationStatus === 'colonized' || p.colonyId) && (
        <div className="mt-4 p-3 bg-emerald-950/30 border border-emerald-500/40 rounded-lg">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-mono text-emerald-400 uppercase font-semibold flex items-center gap-1.5">
              <span>🏛</span>
              <span>Kolonien im System</span>
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-900/60 text-emerald-200">
              {system.planets.filter((p) => p.colonizationStatus === 'colonized' || p.colonyId).length} aktiv
            </span>
          </div>

          <div className="space-y-1.5 mt-2">
            {system.planets
              .filter((p) => p.colonizationStatus === 'colonized' || p.colonyId)
              .map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between text-[11px] p-1.5 bg-slate-950/60 rounded border border-emerald-900/40 font-mono"
                >
                  <span className="text-slate-200 font-medium">{p.name}</span>
                  <span className="text-emerald-300 text-[10px]">Kolonisiert</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Territorial Ownership */}
      <div className="mt-4 p-3 bg-slate-900/30 border border-slate-800/50 rounded-lg text-xs font-mono text-slate-400 flex items-center justify-between">
        <span className="text-slate-500 uppercase">Besitzstand:</span>
        <span className={ownerName || system.discoveryStatus === 'colonized' || system.ownerFactionId ? 'text-emerald-400 font-semibold' : 'text-slate-300'}>
          {ownerName ??
            (system.discoveryStatus === 'colonized' || system.ownerFactionId
              ? 'Unbekannte Macht'
              : 'Niemandsland / Neutral')}
        </span>
      </div>
    </aside>
  );
};
