/**
 * Astraea 4X - Narrative Ereignisse (Phase 5)
 *
 * Datengetriebene Ereignisse für die galaktische Chronik. Die Auswahl erfolgt
 * deterministisch aus Seed, Reich und Runde; Bedingungen prüfen Runde und
 * dauerhafte Flags. Effekte sind bewusst klein und wirken auf Staatskasse,
 * Forschung oder Fraktionsloyalität, damit sie keine parallele Wirtschaft
 * einführen.
 */

import type { NarrativeEventDefinition } from '../core/types.ts';

export const NARRATIVE_EVENTS: readonly NarrativeEventDefinition[] = [
  {
    id: 'silent_signal',
    title: 'Das stille Signal',
    body: 'Die Grenzposten empfangen eine Wiederholung über vier Jahrhunderte: eine Stimme, die ihren eigenen Namen vergessen hat. Die Quelle liegt außerhalb der bekannten Hyperlanes.',
    category: 'discovery',
    minTurn: 4,
    weight: 3,
    once: true,
    choices: [
      {
        id: 'decode',
        label: 'Signal entschlüsseln',
        description: 'Die Wissenschaftler erhalten Zugriff auf die Trägerwelle. +80 Forschung.',
        effect: { research: 80, flag: 'signal_analyzed' },
      },
      {
        id: 'sell',
        label: 'Daten an Konzerne verkaufen',
        description: 'Die Aufzeichnung verschwindet in einem privaten Archiv. +180 ◈.',
        effect: { credits: 180, flag: 'signal_sold' },
      },
      {
        id: 'archive',
        label: 'Unbeantwortet archivieren',
        description: 'Kein Risiko, keine Erkenntnis. Die Fraktionen bleiben unberührt.',
        effect: {},
      },
    ],
  },
  {
    id: 'miners_strike',
    title: 'Streik in den Tiefenbergen',
    body: 'Die Bergbaugewerkschaften legen die Förderung nieder. Sie fordern Sicherheitsstandards und einen Anteil an den Erlösen der letzten Quartale.',
    category: 'political',
    minTurn: 8,
    weight: 2,
    once: true,
    choices: [
      {
        id: 'negotiate',
        label: 'Forderungen anerkennen',
        description: 'Kosten von 120 ◈, dafür +5 Loyalität bei allen Fraktionen.',
        effect: { credits: -120, factionLoyalty: 5 },
      },
      {
        id: 'break',
        label: 'Streik brechen',
        description: 'Die Förderung läuft wieder, aber die Fraktionen merken sich den Ton. +60 ◈, −5 Loyalität.',
        effect: { credits: 60, factionLoyalty: -5 },
      },
      {
        id: 'wait',
        label: 'Abwarten',
        description: 'Die Produktion stockt, bis sich die Gemüter beruhigen.',
        effect: {},
      },
    ],
  },
  {
    id: 'galactic_expo',
    title: 'Einladung zur Galaktischen Ausstellung',
    body: 'Drei Handelshäuser laden dein Reich ein, seine Technologie auf einer neutralen Station zu präsentieren. Die Teilnahme kostet Rücklagen, öffnet aber Türen.',
    category: 'trade',
    minTurn: 10,
    weight: 2,
    once: true,
    choices: [
      {
        id: 'host',
        label: 'Großen Stand finanzieren',
        description: 'Kosten von 250 ◈, dafür +8 Loyalität und dauerhaftes Ansehen.',
        effect: { credits: -250, factionLoyalty: 8, flag: 'expo_hosted' },
      },
      {
        id: 'small',
        label: 'Kleinen Stand entsenden',
        description: 'Bescheiden, aber einträglich. +120 ◈.',
        effect: { credits: 120 },
      },
      {
        id: 'decline',
        label: 'Einladung ablehnen',
        description: 'Die Handelshäuser notieren die Absage.',
        effect: { factionLoyalty: -2 },
      },
    ],
  },
  {
    id: 'derelict_convoy',
    title: 'Der treibende Konvoi',
    body: 'Ein Frachterverband ohne Kennung driftet zwischen zwei Systemen. Die Hüllen sind intakt, die Mannschaften verschwunden. Die Notrufe laufen seit Jahren.',
    category: 'discovery',
    minTurn: 12,
    weight: 2,
    once: true,
    choices: [
      {
        id: 'salvage',
        label: 'Bergung anordnen',
        description: 'Ersatzteile und Fracht einholen. +220 ◈ und +40 Forschung.',
        effect: { credits: 220, research: 40 },
      },
      {
        id: 'escort',
        label: 'Heimgeleiten und versorgen',
        description: 'Die Überlebenden erhalten eine neue Heimat. +4 Loyalität.',
        effect: { factionLoyalty: 4, flag: 'convoy_rescued' },
      },
      {
        id: 'leave',
        label: 'Kurs halten',
        description: 'Manche Geister lässt man besser treiben.',
        effect: {},
      },
    ],
  },
  {
    id: 'faction_demand',
    title: 'Forderung aus dem Reichsrat',
    body: 'Die dominante Fraktion verlangt eine Grundsatzentscheidung: mehr Mittel für ihren Schwerpunkt oder eine Kürzung zugunsten der anderen.',
    category: 'political',
    minTurn: 16,
    weight: 2,
    once: true,
    choices: [
      {
        id: 'concede',
        label: 'Mittel bewilligen',
        description: 'Kosten von 200 ◈, dafür +6 Loyalität bei allen Fraktionen.',
        effect: { credits: -200, factionLoyalty: 6 },
      },
      {
        id: 'redirect',
        label: 'Mittel umleiten',
        description: 'Die anderen Fraktionen atmen auf. +100 ◈, aber −4 Loyalität.',
        effect: { credits: 100, factionLoyalty: -4 },
      },
      {
        id: 'table',
        label: 'Auf die nächste Sitzung vertagen',
        description: 'Der Rat bleibt unzufrieden, aber handlungsfähig.',
        effect: { factionLoyalty: -1 },
      },
    ],
  },
  {
    id: 'ancient_gate',
    title: 'Das Tor im Eis',
    body: 'Unter einem gefrorenen Ozean liegt ein Ring aus schwarzem Metall. Seine Oberfläche ist warm. Die Sensoren zeichnen ein Ziel auf, das nicht in unseren Sternenkarten existiert.',
    category: 'precursor',
    minTurn: 18,
    weight: 2,
    once: true,
    requiresFlags: ['signal_analyzed'],
    choices: [
      {
        id: 'study',
        label: 'Tor wissenschaftlich untersuchen',
        description: 'Die Forschergilde erhält Zugang. +150 Forschung, Flag „Tor untersucht“.',
        effect: { research: 150, flag: 'gate_studied' },
      },
      {
        id: 'fortify',
        label: 'Militärisch sichern',
        description: 'Kosten von 150 ◈, dafür +4 Loyalität und Kontrolle über den Fund.',
        effect: { credits: -150, factionLoyalty: 4, flag: 'gate_fortified' },
      },
      {
        id: 'seal',
        label: 'Versiegeln und vergessen',
        description: 'Das Tor bleibt geschlossen. Die Wissenschaft protestiert.',
        effect: { factionLoyalty: -3 },
      },
    ],
  },
  {
    id: 'precursor_dreams',
    title: 'Träume aus der Tiefe',
    body: 'Seit der letzten Ausgrabung berichten Kolonisten von gemeinsamen Träumen: eine Stadt aus Licht, ein Stern ohne Namen, eine Stimme, die „endlich“ sagt.',
    category: 'precursor',
    minTurn: 22,
    weight: 2,
    once: true,
    requiresFlags: ['excavation_completed'],
    choices: [
      {
        id: 'follow',
        label: 'Den Träumen folgen',
        description: 'Die Aufzeichnungen ergeben eine neue Forschungslinie. +150 Forschung.',
        effect: { research: 150, flag: 'dreams_followed' },
      },
      {
        id: 'suppress',
        label: 'Berichte unterdrücken',
        description: 'Die Kolonien bleiben ruhig. +3 Loyalität.',
        effect: { factionLoyalty: 3 },
      },
      {
        id: 'share',
        label: 'Öffentlich ausstrahlen',
        description: 'Das Reich diskutiert, was es sieht. +80 ◈ durch Dokumentationen.',
        effect: { credits: 80, flag: 'dreams_shared' },
      },
    ],
  },
  {
    id: 'mirror_signal',
    title: 'Das Spiegelbild',
    body: 'Die Sensoren empfangen eine Übertragung, die exakt der eigenen gleicht – nur um vier Sekunden versetzt. Auf dem Schirm hebt eine Hand, die deine sein könnte.',
    category: 'precursor',
    minTurn: 26,
    weight: 2,
    once: true,
    requiresFlags: ['gate_studied'],
    choices: [
      {
        id: 'answer',
        label: 'Antworten',
        description: 'Die Übertragung wird beantwortet. +120 Forschung, Flag „Spiegel geöffnet“.',
        effect: { research: 120, flag: 'mirror_opened' },
      },
      {
        id: 'silence',
        label: 'Funkstille verhängen',
        description: 'Keine Antwort. +2 Loyalität, aber die Wissenschaft ist enttäuscht.',
        effect: { factionLoyalty: 2 },
      },
      {
        id: 'trace',
        label: 'Quelle zurückverfolgen',
        description: 'Die Peilung kostet Material. −100 ◈, dafür +180 Forschung.',
        effect: { credits: -100, research: 180, flag: 'mirror_traced' },
      },
    ],
  },
] as const;

export const NARRATIVE_EVENT_MAP: Record<string, NarrativeEventDefinition> = Object.fromEntries(
  NARRATIVE_EVENTS.map((event) => [event.id, event])
);
