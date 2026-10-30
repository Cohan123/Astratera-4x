/**
 * Astraea 4X - Die acht Fraktionen der Menschheit
 *
 * Datengetriebene Lore- und Identitätsdaten. Die technische Spielmechanik
 * bleibt für alle Fraktionen identisch; Fraktionsboni sind bewusst noch nicht
 * erfunden. Stabile IDs (`HumanFactionId`) werden im Spielstand gespeichert,
 * Anzeigenamen dürfen sich jederzeit ändern.
 */

import type { FactionAssignment, HumanFactionId } from '../core/types.ts';
import { SeededPRNG } from '../generation/prng.ts';

export interface FleetStyleDefinition {
  id: string;
  label: string;
  description: string;
  /** Grobe Silhouette für die spätere Flottengrafik. */
  silhouette: 'longship' | 'lance' | 'dragon' | 'block' | 'carrier' | 'shield' | 'wave' | 'crescent';
  accentPattern: string;
}

export interface HumanFactionDefinition {
  id: HumanFactionId;
  name: string;
  shortName: string;
  description: string;
  history: string;
  visualIdentity: string;
  color: string;
  borderColor: string;
  /** Symbolische Kennung; bewusst Text statt einer erfundenen Bilddatei. */
  emblem: string;
  fleetStyleId: string;
  homeRegion: string;
}

export const FLEET_STYLES: Record<string, FleetStyleDefinition> = {
  nordic_longship: {
    id: 'nordic_longship',
    label: 'Nordische Langschiff-Linie',
    description: 'Schlanke, langgestreckte Rümpfe mit betontem Bug und runenartigen Leuchtmarkierungen.',
    silhouette: 'longship',
    accentPattern: 'runes',
  },
  european_lance: {
    id: 'european_lance',
    label: 'Europäische Lanzenformation',
    description: 'Modulare Verbände mit zentraler Lanzenspitze, klaren Sektionen und föderaler Kennung.',
    silhouette: 'lance',
    accentPattern: 'federation-stars',
  },
  asian_dragon: {
    id: 'asian_dragon',
    label: 'Drachenschwarm',
    description: 'Geschwungene Rumpflinien mit segmentierten Schuppenplatten und weit ausladenden Flügeln.',
    silhouette: 'dragon',
    accentPattern: 'scales',
  },
  russian_block: {
    id: 'russian_block',
    label: 'Sibirische Schwerblockflotte',
    description: 'Kompakte, massiv gepanzerte Rümpfe mit redundanten Triebwerken und klaren Kanten.',
    silhouette: 'block',
    accentPattern: 'armor-plates',
  },
  american_carrier: {
    id: 'american_carrier',
    label: 'Pazifische Trägerverband-Doktrin',
    description: 'Große Trägerzellen mit begleitenden Eskorten und auffälligen Hangarflächen.',
    silhouette: 'carrier',
    accentPattern: 'flight-deck',
  },
  african_shield: {
    id: 'african_shield',
    label: 'Alkebu-Schildformation',
    description: 'Breite Schildrümpfe mit geometrischen Mustern und dezentralen Begleitdrohnen.',
    silhouette: 'shield',
    accentPattern: 'geometric',
  },
  oceanic_wave: {
    id: 'oceanic_wave',
    label: 'Moana-Wellenflotte',
    description: 'Stromlinienförmige Rümpfe mit wellenförmigen Kühlflossen und blauen Leitspuren.',
    silhouette: 'wave',
    accentPattern: 'wave-lines',
  },
  levant_crescent: {
    id: 'levant_crescent',
    label: 'Levantinische Sichelflotte',
    description: 'Sichelförmige Flügelverbände mit hoher Wendigkeit und markanten Sternenmustern.',
    silhouette: 'crescent',
    accentPattern: 'star-mosaic',
  },
};

export const HUMAN_FACTIONS: readonly HumanFactionDefinition[] = [
  {
    id: 'thulea',
    name: 'Thulea',
    shortName: 'Thulea',
    description: 'Nordisch geprägte Gemeinschaft aus Island und den nördlichen Atlantikstaaten.',
    history:
      'Thulea entstand aus isländischen Forschungskonsortien und nordischen Küstenverbänden, die den Sprungtor-Sektor als neues Nordmeer begriffen. Ihre Expeditionen folgen alten Seefahrtsrouten und setzen auf robuste, langstreckentaugliche Verbände.',
    visualIdentity: 'Eisblau, helle Linien und runenartige Markierungen auf dunklen Rümpfen.',
    color: '#67e8f9',
    borderColor: '#0e7490',
    emblem: 'ᚦ',
    fleetStyleId: 'nordic_longship',
    homeRegion: 'Nordatlantik und Island',
  },
  {
    id: 'hesperia',
    name: 'Hesperia',
    shortName: 'Hesperia',
    description: 'Europäische Union der späteren Jahrhunderte mit gemeinsamer Sternenflotte.',
    history:
      'Hesperia ging aus den Mitgliedern der Europäischen Union hervor, die ihre Forschungs- und Verteidigungsprogramme im Angesicht des Sprungtors bündelten. Die föderale Flotte vereint sehr unterschiedliche nationale Traditionen unter einer gemeinsamen Kommandostruktur.',
    visualIdentity: 'Tiefes Blau mit sternförmigen föderalen Akzenten und klaren Modulsegmenten.',
    color: '#60a5fa',
    borderColor: '#1d4ed8',
    emblem: '★',
    fleetStyleId: 'european_lance',
    homeRegion: 'Europa',
  },
  {
    id: 'fusang',
    name: 'Fusang',
    shortName: 'Fusang',
    description: 'Asiatische Föderation mit ostasiatischen und südostasiatischen Wurzeln.',
    history:
      'Fusang vereint ost- und südostasiatische Industrieverbände, die ihre orbitalen Werften früh auf die Bedingungen jenseits des Tores ausrichteten. Die Flotte gilt als besonders modular und anpassungsfähig an wechselnde Logistikketten.',
    visualIdentity: 'Karminrot und Gold mit geschwungenen Schuppenmustern.',
    color: '#f87171',
    borderColor: '#b91c1c',
    emblem: '龍',
    fleetStyleId: 'asian_dragon',
    homeRegion: 'Ost- und Südostasien',
  },
  {
    id: 'sibiria',
    name: 'Sibiria',
    shortName: 'Sibiria',
    description: 'Russisch geprägte Fraktion der borealen und arktischen Gebiete.',
    history:
      'Sibiria formierte sich aus sibirischen Industriezentren und russischen Raumfahrtstraditionen. Die Fraktion setzt auf ausdauernde, stark gepanzerte Schiffe, die auch in dünn besiedelten Randregionen ohne dichte Infrastruktur operieren können.',
    visualIdentity: 'Violettgrau mit schweren Panzerplatten und roten Statuslichtern.',
    color: '#a78bfa',
    borderColor: '#6d28d9',
    emblem: '❅',
    fleetStyleId: 'russian_block',
    homeRegion: 'Russland und Sibirien',
  },
  {
    id: 'columbia',
    name: 'Columbia',
    shortName: 'Columbia',
    description: 'Amerikanisch und pazifisch geprägte Fraktion mit Trägerdoktrin.',
    history:
      'Columbia entstand aus nordamerikanischen und pazifischen Bündnissen, deren Raumstreitkräfte auf weiträumige Präsenz und flexible Trägerverbände setzten. Die junge Fraktion investiert stark in mobile Werften und Langstreckenversorgung.',
    visualIdentity: 'Grün und Silber mit deutlich sichtbaren Hangar- und Flugdeckflächen.',
    color: '#34d399',
    borderColor: '#047857',
    emblem: '✦',
    fleetStyleId: 'american_carrier',
    homeRegion: 'Nordamerika und Pazifik',
  },
  {
    id: 'alkebu',
    name: 'Alkebu',
    shortName: 'Alkebu',
    description: 'Afrikanische Union mit dezentralen Industrieverbänden und Schildtechnik.',
    history:
      'Alkebu ging aus afrikanischen Rohstoff- und Fertigungsallianzen hervor, die den Sprungtor-Sektor als Chance auf eigene, unabhängige Handelsrouten sahen. Ihre Flotten sind auf Schutz, Geleitschutz und den Aufbau weit verteilter Stützpunkte ausgelegt.',
    visualIdentity: 'Gold und Ocker mit geometrischen Schildmustern.',
    color: '#fbbf24',
    borderColor: '#b45309',
    emblem: '◈',
    fleetStyleId: 'african_shield',
    homeRegion: 'Afrika',
  },
  {
    id: 'moana',
    name: 'Moana',
    shortName: 'Moana',
    description: 'Ozeanische Föderation aus pazifischen Inselstaaten und Australasien.',
    history:
      'Moana vereint pazifische Inselstaaten, Neuseeland und australasische Küstenregionen. Die Fraktion versteht sich als Hüterin der Seewege und übertrug diese Haltung auf die Hyperlanes; ihre Schiffe sind schnell, wendig und auf lange unabhängige Fahrten ausgelegt.',
    visualIdentity: 'Türkis und Weiß mit wellenförmigen Kühlflossen und Leitspuren.',
    color: '#2dd4bf',
    borderColor: '#0f766e',
    emblem: '◉',
    fleetStyleId: 'oceanic_wave',
    homeRegion: 'Pazifik und Ozeanien',
  },
  {
    id: 'levantia',
    name: 'Levantia',
    shortName: 'Levantia',
    description: 'Fraktion des Nahen Ostens mit Handels- und Wendigkeitsprofil.',
    history:
      'Levantia entstand aus einem Verbund nahöstlicher Handelsstädte, Energieproduzenten und Forschungsinstitute. Die Fraktion kontrolliert frühe Knotenpunkte des Sprungtorhandels und setzt auf schnelle, sichelförmig formierte Verbände.',
    visualIdentity: 'Orange und Sandtöne mit mosaikartigen Sternenmustern.',
    color: '#fb923c',
    borderColor: '#c2410c',
    emblem: '☾',
    fleetStyleId: 'levant_crescent',
    homeRegion: 'Naher Osten',
  },
] as const;

export const HUMAN_FACTION_IDS: readonly HumanFactionId[] = HUMAN_FACTIONS.map(
  (faction) => faction.id,
);

export const DEFAULT_PLAYER_FACTION_ID: HumanFactionId = 'hesperia';
export const DEFAULT_AI_FACTION_COUNT = 2;
export const MIN_AI_FACTIONS = 0;
export const MAX_AI_FACTIONS = HUMAN_FACTIONS.length - 1;

const FACTION_BY_ID = new Map<HumanFactionId, HumanFactionDefinition>(
  HUMAN_FACTIONS.map((faction) => [faction.id, faction]),
);

export function isHumanFactionId(value: unknown): value is HumanFactionId {
  return typeof value === 'string' && FACTION_BY_ID.has(value as HumanFactionId);
}

export function getHumanFaction(id: string): HumanFactionDefinition | null {
  return FACTION_BY_ID.get(id as HumanFactionId) ?? null;
}

export function getFleetStyle(id: string): FleetStyleDefinition | null {
  return FLEET_STYLES[id] ?? null;
}

export function clampAiFactionCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_AI_FACTION_COUNT;
  }
  return Math.max(MIN_AI_FACTIONS, Math.min(MAX_AI_FACTIONS, Math.floor(value)));
}

/**
 * Wählt KI-Fraktionen deterministisch aus dem Seed. Die Spielerfraktion ist
 * immer ausgeschlossen, jede KI-Fraktion kommt höchstens einmal vor und die
 * Anzahl entspricht exakt dem gewünschten Wert (0–7).
 */
export function pickAiFactionIds(
  seed: string,
  playerFactionId: HumanFactionId,
  count: number,
): HumanFactionId[] {
  const target = clampAiFactionCount(count);
  const pool = HUMAN_FACTION_IDS.filter((id) => id !== playerFactionId);
  if (target <= 0 || pool.length === 0) return [];

  const prng = new SeededPRNG(`${seed}:ai-factions`);
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = prng.nextInt(0, i);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.min(target, shuffled.length));
}

/** Baut die vollständige Zuweisung für Spieler und KI. */
export function buildFactionAssignments(
  seed: string,
  playerFactionId: HumanFactionId,
  aiFactionCount: number,
): FactionAssignment[] {
  const aiFactionIds = pickAiFactionIds(seed, playerFactionId, aiFactionCount);
  return [
    { factionId: playerFactionId, civId: 'player-empire', role: 'player' },
    ...aiFactionIds.map((factionId) => ({
      factionId,
      civId: `civ-${factionId}`,
      role: 'ai' as const,
    })),
  ];
}
