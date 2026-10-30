/**
 * Astraea 4X - Architecture & Roadmap Modal
 * Documents system boundaries, module interfaces, and planned expansion phases.
 */

import React from 'react';

interface PhaseRoadmapModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PhaseRoadmapModal: React.FC<PhaseRoadmapModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const phases = [
    {
      phase: 'Phase 1 – Modul 1',
      name: 'Technisches Fundament & Galaxy-Karte',
      status: 'ABGESCHLOSSEN',
      statusColor: 'text-emerald-400 border-emerald-800/80 bg-emerald-950/40',
      description:
        'Prozedurale 2D-Galaxy-Karte, deterministischer Mulberry32-PRNG, Sternenphysik, Hyperlane-Netzwerk, zentrale Rundenverwaltung, EventBus und versioniertes Speichersystem.',
      modules: ['Core Engine', 'Turn System', 'Galaxy Module', 'Event System', 'Save System', 'Generation'],
    },
    {
      phase: 'Phase 1 – Modul 2',
      name: 'Sternensysteme, Systemkarte & Planeten-Generierung',
      status: 'ABGESCHLOSSEN',
      statusColor: 'text-emerald-400 border-emerald-800/80 bg-emerald-950/40',
      description:
        '2D-Systemkarte mit Zentral- und Doppelsternen, Keplerianische Orbits, 7 differenzierte Planetentypen, Atmosphären- und Habitabilitätsmodelle, Zwei-Ebenen-Navigation und Planetenscans.',
      modules: ['System Map Canvas', 'Planet Generator', 'Planet Catalog', 'Planet Inspector', 'Orbital Engine'],
    },
    {
      phase: 'Phase 1 – Modul 3',
      name: 'Planeten, Erkundung & Kolonisierung',
      status: 'ABGESCHLOSSEN',
      statusColor: 'text-emerald-400 border-emerald-800/80 bg-emerald-950/40',
      description:
        'Systematische Planetenuntersuchung, Sichtbarkeitsfilter, detaillierte Habitabilitäts-Faktorenmatrix (Atmosphäre, Temperatur, Schwerkraft, Strahlung), Kolonisationsprüfung und Gründung von Außenposten.',
      modules: ['Habitability Evaluator', 'Colonization Rules', 'Colony Manager', 'Visibility Filter', 'Colony Beacons'],
    },
    {
      phase: 'Phase 1 – Modul 4',
      name: 'Kolonieverwaltung, Hex-Oberfläche & Ausbau',
      status: 'ABGESCHLOSSEN',
      statusColor: 'text-emerald-400 border-emerald-800/80 bg-emerald-950/40',
      description:
        'Persistente 18x10 Hex-Planetenoberfläche, 7 Kernressourcen (Nahrung, Produktion, Energie, Mineralien, Seltene Rohstoffe, Forschung, Einfluss), automatische/manuelle Bürgerzuweisung, Einfluss-Grenzausdehnung, Bauwarteschlange mit Upgrades, Technologiekatalog mit Voraussetzungsgraph, Bodenaufklärer & Einheitenbewegung sowie Fraktionen mit KI-Grundaktivitäten.',
      modules: ['Hex Surface Canvas', '7-Resource Economy', 'Colony Expansion', 'Build Queue Manager', 'Tech Catalog', 'Surface Units', 'Civ & AI Manager'],
    },
    {
      phase: 'Phase 2',
      name: 'Distrikte, Terraforming & Logistik',
      status: 'ABGESCHLOSSEN',
      statusColor: 'text-emerald-400 border-emerald-800/80 bg-emerald-950/40',
      description:
        'Kachelbasiertes Bauen, Bevölkerung, lokale Produktion, Terraforming-Projekte (Biom/Atmosphäre), Logistikrouten zwischen Kolonien, Multi-Tile-Distrikte mit Tech-Gates, Kosten und Erträgen sowie ein habitabilitätsabhängiger Wachstumsmultiplikator und an die Logistik gekoppelte Frachterflotten sind umgesetzt.',
      modules: ['Multi-Tile Districts', 'Terraforming Projects', 'Logistics Routes', 'Habitability Growth Bonus', 'Planets Overview', 'Freighter Fleets'],
    },
    {
      phase: 'Phase 3',
      name: 'Wirtschaft, galaktische Ressourcen & Technologiebaum',
      status: 'ABGESCHLOSSEN',
      statusColor: 'text-emerald-400 border-emerald-800/80 bg-emerald-950/40',
      description:
        'Sieben Ressourcen inkl. Energiebilanz, Forschungsinvestition und Abschlusslogik, ein vollständiger Tech-Tree-DAG mit vier Stufen, drei Forschungsbereichen und exklusiven Tier-4-Spezialisierungen, eine Staatskasse je Zivilisation mit Steuersatz, Korruption, Approval und Credit-Bau-/Wartungskosten für Gebäude, galaktische Handelsrouten über das Hyperlane-Netzwerk mit deterministischen Konvois, Zöllen auf Route, Blockaden durch feindliche Flotten und zuweisbaren Eskorten sowie ein Privatsektor aus ziviler Handelssteuer und kleinem innenpolitischem Warenausgleich sind umgesetzt.',
      modules: ['Tech Tree DAG', 'Exclusive Specializations', 'Physics / Society / Engineering', 'Treasury & Taxes', 'Building Upkeep & Costs', 'Galactic Trade Routes', 'Hyperlane Convoys', 'Trade Tariffs', 'Trade Blockades', 'Trade Escorts', 'Private Sector'],
    },
    {
      phase: 'Phase 4',
      name: 'Reichsverwaltung, Fraktionen & Flotten',
      status: 'ABGESCHLOSSEN',
      statusColor: 'text-emerald-400 border-emerald-800/80 bg-emerald-950/40',
      description:
        'Werftgebundener Schiffbau mit Korvetten, Zerstörern und Kreuzern, Flottenbewegung über Hyperlanes, Schiffsunterhalt, ein rundenbasiertes Kampfmodell mit Gefechtsberichten, bevölkerungsabhängige Werftkapazität und Diplomatie mit Krieg und Frieden sind umgesetzt. KI-Reiche starten mit eigener Heimatkolonie, Starttechnologien und Flotten, füllen Werftdocks und patrouillieren. Die Galaxiekarte färbt Territorien ein und zeichnet durchgehende Grenzen. Eine deterministische KI-Diplomatie erklärt Kriege und schließt Frieden. Die Reichsverwaltung ergänzt Verwaltungskapazität, vier Governance-Politiken und drei innere Fraktionen mit Einfluss, Loyalität und daraus abgeleiteten Wirtschaftsmodifikatoren; Fraktionsunruhe wird zentral gemeldet.',
      modules: ['Ship Construction', 'Shipyard Queue', 'Shipyard Capacity', 'Fleet Navigation', 'Fleet Combat', 'Fleet Modal', 'Diplomacy Engine', 'War & Peace', 'AI Empires', 'AI Fleets', 'AI Diplomacy', 'Territory Map', 'Territory Borders', 'Imperial Administration', 'Governance Policies', 'Faction Loyalty', 'Faction Unrest'],
    },
    {
      phase: 'Phase 5',
      name: 'Narrative Ebene & Galaxiegeschichte',
      status: 'ABGESCHLOSSEN',
      statusColor: 'text-emerald-400 border-emerald-800/80 bg-emerald-950/40',
      description:
        'Acht deterministische Ereignisse mit Entscheidungen, Flags und Wirkung auf Staatskasse, Forschung und Fraktionsloyalität. Ausgrabungsstätten auf Planeten werden erst nach vollständiger Analyse aufgedeckt, schreiten mit der Forschung fort und vergeben Credits sowie Forschung. Ab Runde 40 oder nach zwei abgeschlossenen Grabungen beginnt eine galaktische Krise mit vier Stufen, Eindämmungsfinanzierung und nachhaltigen Wirtschaftsmodifikatoren. Die Galaktische Chronik bündelt Ereignisse, Grabungen, Krise und Entscheidungshistorie; optionale narrative Save-Daten bleiben unter Save-Version 4 kompatibel.',
      modules: ['Event Catalog', 'Deterministic Events', 'Excavation Sites', 'Excavation Progress', 'Galactic Crisis', 'Crisis Containment', 'Narrative Chronicle', 'Narrative Save State'],
    },
    {
      phase: 'Phase 6',
      name: 'Sieg, Niederlage & Punktewertung',
      status: 'IN ARBEIT',
      statusColor: 'text-cyan-300 border-cyan-800/80 bg-cyan-950/40',
      description:
        'Drei Siegbedingungen (Dominanz, Transzendenz, Chronik) und die Niederlage bei Verlust der letzten Kolonie werden deterministisch aus dem Spielzustand abgeleitet. Der Ausgang friert nach dem ersten Ergebnis ein, wird mit Punkteaufschlüsselung und Rangliste gespeichert und im Abschlussbildschirm gezeigt. Eine Zielanzeige dokumentiert den Fortschritt aller Bedingungen. Noch offen: KI-Expansion und Invasionen, damit Dominanz auch gegen aktive Gegner errungen werden muss.',
      modules: ['Victory Manager', 'Victory Conditions', 'Score & Ranking', 'End Screen', 'Objective Progress', 'Outcome Save State'],
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm select-none">
      <div className="w-full max-w-3xl bg-slate-950 border border-slate-800 rounded-xl shadow-2xl p-6 font-sans max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h3 className="text-lg font-bold text-slate-100">Architektur & Entwicklungs-Roadmap</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Modulare Systemgrenzen und mehrphasige Skalierungsstrategie.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 w-8 h-8 rounded flex items-center justify-center font-mono cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto mt-4 space-y-3 pr-1">
          {phases.map((p, idx) => (
            <div key={idx} className="p-4 bg-slate-900/50 border border-slate-800/80 rounded-lg">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-semibold text-slate-400">{p.phase}:</span>
                  <span className="text-sm font-bold text-slate-100">{p.name}</span>
                </div>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded border font-semibold ${p.statusColor}`}>
                  {p.status}
                </span>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed mb-3">{p.description}</p>

              <div className="flex flex-wrap gap-1.5">
                {p.modules.map((m, mIdx) => (
                  <span
                    key={mIdx}
                    className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950/80 border border-slate-800 text-slate-300"
                  >
                    {m}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-slate-800 mt-4">
          <div className="text-xs text-slate-500 font-mono">
            Vollständig entkoppelte Architektur: Spiellogik läuft unabhängig von React.
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
