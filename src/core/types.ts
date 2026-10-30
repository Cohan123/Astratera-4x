/**
 * Astraea 4X - Galactic Foundations & Planetary Colonization
 * Core Domain Types & Data Models (Phase 1: Module 1, 2, 3 & Modul 4: Kolonieverwaltung & Ausbau)
 * Fully decoupled architecture for galaxy, star systems, planets, hex surface, colonies, economy, research, and units.
 */

import type { NotificationCategory } from './notificationCenter.ts';

export type StarSpectralClass =
  | 'O' // Blue Supergiant (extremely hot, rare)
  | 'B' // Blue-White (luminous)
  | 'A' // White
  | 'F' // Yellow-White
  | 'G' // Yellow Dwarf (Sol-like, high habitability prospect)
  | 'K' // Orange Dwarf (long-lived, stable)
  | 'M' // Red Dwarf (most common, cooler)
  | 'RED_GIANT' // Aging expanded star
  | 'WHITE_DWARF' // Dense stellar remnant
  | 'NEUTRON' // Superdense pulsar/neutron star
  | 'BLACK_HOLE'; // Singularity

export interface StarSpectralInfo {
  class: StarSpectralClass;
  displayName: string;
  color: string;
  glowColor: string;
  temperatureK: number;
  luminositySolar: number;
  massSolar: number;
  description: string;
  baseRadiusPx: number;
}

export interface Star {
  id: string;
  name: string;
  spectralClass: StarSpectralClass;
  color: string;
  glowColor: string;
  temperatureK: number;
  luminositySolar: number;
  massSolar: number;
  radiusKm: number;
  isBinary?: boolean;
  secondaryStar?: {
    id: string;
    name: string;
    spectralClass: StarSpectralClass;
    color: string;
    glowColor: string;
    temperatureK: number;
    luminositySolar: number;
    massSolar: number;
    radiusKm: number;
  };
}

export type DiscoveryStatus = 'unexplored' | 'surveyed' | 'colonized';
export type SurveyStatus = 'unexplored' | 'surveyed' | 'analyzed';

export type PlanetType =
  | 'rocky' // Gesteinsplanet
  | 'desert' // Wüstenplanet
  | 'ice' // Eisplanet
  | 'ocean' // Ozeanplanet
  | 'volcanic' // Vulkanplanet
  | 'gas_giant' // Gasriese
  | 'toxic'; // Giftiger / Unwirtlicher Planet

export type AtmosphereType =
  | 'none' // Vakuum / Keine
  | 'thin' // Dünn (wie Mars)
  | 'breathable' // Atembar (Stickstoff-Sauerstoff)
  | 'dense' // Dicht (hoher Druck)
  | 'corrosive' // Ätzend (Schwefel, Säure)
  | 'toxic'; // Giftig (Methan, Ammoniak)

export type TemperatureCategory =
  | 'freezing' // Tiefgefroren (< 180 K)
  | 'cold' // Kalt (180 - 260 K)
  | 'temperate' // Gemäßigt (260 - 315 K, Goldilocks)
  | 'hot' // Heiß (315 - 400 K)
  | 'scorching'; // Glühend heiß (> 400 K)

export type WaterCategory =
  | 'none' // Vollständig trocken
  | 'trace' // Spuren (unterirdisch / Polarkappen)
  | 'moderate' // Moderat (Seen, Flusstäler)
  | 'abundant' // Reichhaltig
  | 'liquid_ocean'; // Ausgedehnte flüssige Ozeane

export type GravityCategory =
  | 'low' // Schwach (< 0.6 G)
  | 'standard' // Standard (0.8 - 1.2 G)
  | 'high' // Hoch (1.3 - 2.0 G)
  | 'extreme'; // Extrem (> 2.0 G, Gasriesen)

export type HabitabilityTier =
  | 'uninhabitable' // Für normale Besiedelung ungeeignet (0 - 14%)
  | 'hostile' // Schwer besiedelbar (15 - 39%)
  | 'harsh' // Bedingt geeignet (40 - 59%)
  | 'moderate' // Gut geeignet (60 - 79%)
  | 'ideal'; // Sehr gut geeignet (80 - 100%)

export type RadiationHazard = 'negligible' | 'moderate' | 'severe' | 'lethal';
export type GeologicalStability = 'stable' | 'tectonic_activity' | 'extreme_volcanism';
export type ColonizationStatus = 'uncolonized' | 'colonized';

/** Physikalische Klasse eines Mondes. */
export type MoonType = 'rocky' | 'icy' | 'volcanic' | 'metallic';

/**
 * Ein einzelner, dauerhaft generierter Mond eines Planeten.
 *
 * Die ID folgt dem Schema `<planetId>-M<index>` (index ab 1), damit Monde
 * systemweit eindeutig bleiben und sich aus ihrem Planeten ableiten lassen.
 */
export interface Moon {
  id: string;
  name: string;
  planetId: string;
  /** Fortlaufender Index innerhalb des Planetensystems, beginnend bei 1. */
  index: number;
  moonType: MoonType;
  /** Bahnradius in Planetenradien (Vielfaches des Planetendurchmessers). */
  orbitRadiusPlanetRadii: number;
  orbitalPeriodDays: number;
  radiusKm: number;
  color: string;
  /** Große Monde werden in der Systemansicht mit eigenem Orbit dargestellt. */
  isMajor: boolean;
}

/**
 * Asteroidengürtel eines Systems. Die Lage wird in AU gespeichert, die
 * Darstellung leitet den Ringradius aus den benachbarten Planetenbahnen ab.
 */
export interface AsteroidBelt {
  id: string;
  name: string;
  systemId: string;
  innerAu: number;
  outerAu: number;
  /** Mittlere Distanz in AU; Grundlage für Beschriftung und Sortierung. */
  midpointAu: number;
  /** Dichte 0..1, steuert Punktdichte und Helligkeit der Darstellung. */
  density: number;
  composition: 'rocky' | 'metallic' | 'icy';
}

export interface Planet {
  id: string;
  name: string;
  systemId: string;
  orbitIndex: number;
  orbitDistanceAu: number;
  orbitalPeriodDays: number;
  currentAngleRad: number;
  planetType: PlanetType;
  sizeClass: number; // 10 bis 25 (Bauslots / Planetenradius)
  surfaceTemperatureK: number;
  temperatureCategory: TemperatureCategory;
  atmosphere: AtmosphereType;
  waterAvailability: WaterCategory;
  gravityG: number;
  gravityCategory: GravityCategory;
  radiationHazard: RadiationHazard;
  geologicalStability: GeologicalStability;
  habitability: number; // 0 bis 100 Prozent
  habitabilityTier: HabitabilityTier;
  surveyStatus: SurveyStatus;
  colonizationStatus: ColonizationStatus;
  colonyId: string | null;
  hasRings?: boolean;
  anomalyDetected?: boolean;
  color: string;
  accentColor: string;
  texturePattern: 'bands' | 'craters' | 'swirls' | 'oceans' | 'cracks';
  moonsCount: number;
  /** Dauerhaft generierte Monde; `moonsCount` bleibt als Kompatibilitätsfeld erhalten. */
  moons?: Moon[];
  surfaceSeed?: string; // Seed for deterministic surface hex map
  surfaceGenerated?: boolean;
  notes?: string;
}

export interface HabitabilityFactor {
  title: string;
  impactPercent: number;
  isPositive: boolean;
  description: string;
}

export interface HabitabilityAssessment {
  score: number;
  tier: HabitabilityTier;
  categoryLabel: string;
  factors: HabitabilityFactor[];
  canColonizeNormally: boolean;
  summary: string;
}

/* ========================================================================== */
/* MODUL 4: 5 ZENTRALE RESSOURCEN & WIRTSCHAFTSMODELL                          */
/* ========================================================================== */

export interface ResourceYields {
  food: number; // Nahrung: Bevölkerungswachstum & Versorgung
  production: number; // Produktion: Baufortschritt von Gebäuden & Projekten
  energy: number; // Energie: Betrieb der Kolonie & Anlagen (Brutto-Erzeugung)
  minerals: number; // Gewöhnliche Mineralien: Baumaterialien
  rareResources: number; // Seltene Ressourcen: Titan, Helium-3, Kristalle
  research: number; // Wissenschaftlicher Beitrag der Kolonie
  influence: number; // Politischer Einfluss für Gebietsexpansion
}

export interface ColonyStockpile {
  food: number;
  minerals: number;
  rareResources: number;
  energyBalance: number; // Netto-Energie (Erzeugung - Verbrauch)
  influence: number;
  storedProduction?: number; // Akkumulierte Bauenergie
}

export interface UpkeepCosts {
  energy: number;
  minerals: number;
  /** Wartung in Credits pro Runde (Wirtschaft Stufe B, optional für alte Spielstände) */
  credits?: number;
}

/* ========================================================================== */
/* MODUL 4: PLANETENOBERFLÄCHE, BIOME & HEXFELDER                             */
/* ========================================================================== */

export type HexBiome =
  | 'plains' // Fruchtbare Ebenen / Grasland
  | 'forest' // Gemäßigter Wald
  | 'jungle' // Tropischer Dschungel
  | 'marsh' // Feuchtmarsch und Flussniederung
  | 'ocean' // Tiefsee / Ozean
  | 'desert' // Trockene Wüste
  | 'hills' // Mineralreiche Hügel
  | 'mountains' // Unpassierbare Hochgebirge
  | 'tundra' // Gefrorene Tundra
  | 'snow' // Gletscher- und Schneefeld
  | 'volcanic' // Aktive Lava- & Basaltfelder
  | 'lava' // Offene Lavaseen und Magmaflächen
  | 'toxic' // Schwefel- & Giftauen
  | 'alien' // Fremdartige Xenoflora
  | 'fungal_forest' // Biolumineszenter Pilzwald
  | 'impact_crater' // Antiker Asteroidenkrater
  | 'gas'; // Gasriesen-Wolkenschicht (Platzhalteroberfläche)

export type ResourceDepositType =
  | 'none'
  | 'rich_soil' // Erhöhte Nahrung
  | 'deep_mineral_vein' // Mineralvorkommen
  | 'hydrocarbon_spring' // Energiequelle
  | 'titanium_strata' // Seltene Ressource: Titan
  | 'helium3_vent' // Seltene Ressource: Helium-3
  | 'crystalline_matrix' // Seltene Ressource: Supraleiterkristalle
  | 'ancient_ruins'; // Bonus Forschung & Einfluss

export interface HexCoord {
  q: number; // Axial Spalte
  r: number; // Axial Zeile
}

export type TileVisibility = 'unseen' | 'explored' | 'visible';

export interface PlanetHexTile {
  coord: HexCoord;
  key: string; // e.g. "q,r"
  biome: HexBiome;
  elevation: number; // 0 (Meer) bis 3 (Hochgebirge)
  deposit: ResourceDepositType;
  isDepositDiscovered: boolean; // Rohstoffwissen getrennt von Kartierung
  hasHazard: boolean;
  hazardDescription?: string;
  claimedByColonyId: string | null;
  claimedByCivId: string | null;
  isCityCenter: boolean;
  isWorked: boolean;
  isWorkPrioritized: boolean; // Manuelle Priorisierung
  isWorkLocked: boolean; // Manuelle Sperrung
  buildingInstanceId: string | null;
  districtInstanceId?: string | null; // Belegung durch einen Multi-Hex-Distrikt
  visibility: TileVisibility;
  terraformedStatus?: 'native' | 'improved' | 'scrubbed';
  /** Akkumulierter Oberflächenabfluss; Ozeankacheln tragen 0. */
  riverDischarge?: number;
  /** Key der Zielkachel des oberflächlichen Abflusses (nur bei Fluss/See). */
  flowsTo?: string | null;
  /** Stehende Binnenwasserfläche in einer Senke. */
  isLake?: boolean;
  /** Weltgenerierungs-Klima 0..1 (kalt bis heiß); ab Generator-Version 4 gesetzt. */
  temperature?: number;
  /** Weltgenerierungs-Niederschlag 0..1 (trocken bis sehr feucht). */
  rainfall?: number;
  /** Normalisierter Oberflächenabfluss 0..1 aus der Hydrologie. */
  drainage?: number;
  /** Dwarf-Fortress-nahe Wildheit 0..1; treibt Gefahren und Xeno-Biome. */
  savagery?: number;
}

export interface PlanetSurface {
  planetId: string;
  width: number; // 16 bis 24 Spalten
  height: number; // 10 bis 16 Zeilen
  generatorVersion: number;
  seed: string;
  tiles: PlanetHexTile[];
}

/* ========================================================================== */
/* MODUL 5: MULTI-HEX-DISTRIKTE                                              */
/* ========================================================================== */

export type DistrictCategory = 'residential' | 'industrial' | 'agricultural' | 'research';

export interface DistrictDef {
  id: string;
  name: string;
  category: DistrictCategory;
  description: string;
  /** Relative Offsets zum Anker-Hex; {q:0,r:0} ist immer enthalten. */
  footprint: HexCoord[];
  requiredTechId?: string;
  mineralCost: number;
  rareCost: number;
  energyUpkeep: number;
  yieldsPerTurn: Partial<ResourceYields>;
}

export interface DistrictInstance {
  id: string;
  colonyId: string;
  districtDefId: string;
  anchorCoord: HexCoord;
  coveredHexKeys: string[];
  placedTurn: number;
}

/* ========================================================================== */
/* MODUL 4: GEBÄUDE, AUSBAUSTUFEN & BAUWARTESCHLANGE                         */
/* ========================================================================== */

export type BuildingCategory =
  | 'infrastructure'
  | 'agriculture'
  | 'industry'
  | 'energy'
  | 'science'
  | 'military';

export interface BuildingDef {
  id: string;
  name: string;
  category: BuildingCategory;
  description: string;
  maxLevel: number;
  baseProductionCost: number;
  baseMineralCost: number;
  baseRareCost: number;
  energyUpkeepPerLevel: number;
  mineralUpkeepPerLevel: number;
  /** Einmalige Baukosten in Credits aus der Staatskasse (Wirtschaft Stufe B) */
  creditCost?: number;
  /** Wartung in Credits pro Stufe und Runde (Wirtschaft Stufe B) */
  creditUpkeepPerLevel?: number;
  yieldsPerLevel: Partial<ResourceYields>;
  requiredTechId?: string;
  allowedBiomes?: HexBiome[];
  disallowedBiomes?: HexBiome[];
}

export interface BuildingInstance {
  id: string;
  colonyId: string;
  hexCoord: HexCoord;
  buildingDefId: string;
  level: number;
  isActive: boolean; // Kann bei Energiemangel gedrosselt werden
}

export interface BuildProject {
  id: string;
  colonyId: string;
  type: 'building' | 'upgrade' | 'unit';
  /**
   * Bei `building`/`unit` die Katalog-ID, bei `upgrade` die ID der
   * Gebäudeinstanz. `buildingDefId` hält bei Ausbauten zusätzlich die
   * Katalog-ID, damit ein Auftrag auch nach einer ID-Migration wieder
   * eindeutig aufgelöst werden kann.
   */
  defId: string;
  buildingInstanceId?: string;
  buildingDefId?: string;
  targetHexCoord: HexCoord;
  name: string;
  investedProduction: number;
  requiredProduction: number;
  /** Zielstufe eines Ausbaus; verhindert doppelte Stufenanwendung. */
  targetLevel?: number;
  mineralCost: number;
  rareCost: number;
  /** Beim Einreihen aus der Staatskasse bezahlte Credits (Wirtschaft Stufe B) */
  creditCost?: number;
  turnStarted: number;
}

/* ========================================================================== */
/* MODUL 4: FORSCHUNG & TECHNOLOGIEBAUM                                       */
/* ========================================================================== */

export type TechCategory = 'physics' | 'society' | 'engineering';

export interface TechnologyDef {
  id: string;
  name: string;
  category: TechCategory;
  tier: 1 | 2 | 3 | 4;
  cost: number;
  description: string;
  prerequisites: string[];
  /**
   * Optional exclusive specialization group. Technologies sharing the same
   * group are mutually exclusive: researching one permanently locks the others.
   */
  exclusiveGroup?: string;
  unlocks: {
    buildings?: string[];
    upgrades?: boolean;
    units?: string[];
    improvements?: string[];
    specialFeatures?: string[];
  };
}

export interface CivResearchState {
  completedTechIds: string[];
  currentTechId: string | null;
  currentTechInvested: number;
}

/* ========================================================================== */
/* MODUL 4: EINHEITEN & BODENTRUPPS                                           */
/* ========================================================================== */

export type UnitType = 'scout' | 'pioneer' | 'infantry' | 'heavy_armor';

export interface UnitDef {
  id: string;
  name: string;
  type: UnitType;
  description: string;
  movementPoints: number;
  productionCost: number;
  mineralCost: number;
  rareCost: number;
  requiredTechId?: string;
  visionRadius: number;
  combatStrength: number;
}

export interface SurfaceUnit {
  id: string;
  civId: string;
  unitDefId: string;
  name: string;
  planetId: string;
  hexCoord: HexCoord;
  movementPointsRemaining: number;
  maxMovementPoints: number;
  health: number;
  maxHealth: number;
  isFortified: boolean;
}

/* ========================================================================== */
/* MODUL 4: ZIVILISATIONEN & REICHE                                           */
/* ========================================================================== */

/**
 * Stabile IDs der acht menschlichen Fraktionen. Anzeigenamen dürfen sich
 * ändern, diese IDs sind Teil des Spielstands.
 */
export type HumanFactionId =
  | 'thulea'
  | 'hesperia'
  | 'fusang'
  | 'sibiria'
  | 'columbia'
  | 'alkebu'
  | 'moana'
  | 'levantia';

/** Zuordnung einer menschlichen Fraktion zu Spieler oder KI. */
export interface FactionAssignment {
  factionId: HumanFactionId;
  civId: string;
  role: 'player' | 'ai';
}

export interface Civilization {
  id: string;
  name: string;
  color: string;
  borderColor: string;
  isPlayer: boolean;
  researchState: CivResearchState;
  homeSystemId?: string;
  /** Staatskasse in Credits (Wirtschaft Stufe A/B: Steuereinnahmen, Credit-Baukosten und Wartung) */
  treasury: number;
  /** Menschliche Fraktion dieses Reiches (Save v5, optional für Altspeicherstände). */
  factionId?: HumanFactionId;
  /** Flottenstil der Fraktion, getrennt von der Anzeige. */
  fleetStyleId?: string;
}

/* ========================================================================== */
/* PHASE 4: REICHSVERWALTUNG & INNERE FRAKTIONEN                              */
/* ========================================================================== */

export type EmpirePolicy = 'balanced' | 'industry' | 'science' | 'military';

export type FactionId = 'industrialists' | 'scientists' | 'militarists';

export interface FactionState {
  id: FactionId;
  /** Politischer Einfluss 0-100; die Summe aller Fraktionen eines Reiches ist 100. */
  influence: number;
  /** Zufriedenheit 0-100; unter 30 droht Unruhe, ab 40 gilt sie als beigelegt. */
  loyalty: number;
}

export interface EmpireState {
  civId: string;
  policy: EmpirePolicy;
  /** Früheste Runde für den nächsten Politikwechsel. */
  policyCooldownUntil: number;
  factions: FactionState[];
}

/** Auf die Kolonieökonomie angewendete Reichsmodifikatoren. */
export interface EmpireModifiers {
  productionMultiplier: number;
  researchMultiplier: number;
  influenceMultiplier: number;
  /** Zuschlag oder Abzug auf die Zufriedenheit einer Kolonie (-15 bis +10). */
  approvalModifier: number;
}

/* ========================================================================== */
/* PHASE 5: NARRATIVE EBENE & GALAXIEGESCHICHTE                                */
/* ========================================================================== */

export type ExcavationSiteStatus = 'undiscovered' | 'discovered' | 'active' | 'completed';

/**
 * Eine archäologische Stätte auf einem Planeten. Stätten werden deterministisch
 * aus den Anomalien der Galaxie erzeugt und erst nach einer vollständigen
 * Planetenanalyse aufgedeckt. Es kann immer nur eine Stätte je Reich aktiv
 * ausgegraben werden.
 */
export interface ExcavationSite {
  id: string;
  planetId: string;
  systemId: string;
  name: string;
  /** Benötigter Fortschritt bis zum Abschluss. */
  difficulty: number;
  progress: number;
  status: ExcavationSiteStatus;
  discoveredByCivId: string | null;
  activeForCivId: string | null;
  completedByCivId: string | null;
  discoveredTurn: number | null;
  completedTurn: number | null;
  rewardCredits: number;
  rewardResearch: number;
}

/** Anzeigefertige Stätte inklusive der aufgelösten Ortsnamen. */
export interface ExcavationSiteView {
  site: ExcavationSite;
  planetName: string;
  systemName: string;
}

export type NarrativeEventCategory = 'discovery' | 'political' | 'trade' | 'precursor';

export interface NarrativeChoiceEffect {
  /** Positive Werte sind Einnahmen, negative Werte Kosten. */
  credits?: number;
  /** Forschungsfortschritt auf die aktuell gewählte Technologie. */
  research?: number;
  /** Verschiebt die Loyalität aller Fraktionen des Reiches. */
  factionLoyalty?: number;
  /** Setzt ein dauerhaftes Erzähl-Flag. */
  flag?: string;
}

export interface NarrativeChoiceDefinition {
  id: string;
  label: string;
  description: string;
  effect: NarrativeChoiceEffect;
}

export interface NarrativeEventDefinition {
  id: string;
  title: string;
  body: string;
  category: NarrativeEventCategory;
  /** Früheste Runde, in der das Ereignis gezogen werden darf. */
  minTurn: number;
  weight: number;
  once?: boolean;
  requiresFlags?: string[];
  forbidsFlags?: string[];
  choices: NarrativeChoiceDefinition[];
}

export interface PendingNarrativeEvent {
  eventId: string;
  turn: number;
}

export interface NarrativeEventRecord {
  eventId: string;
  title: string;
  choiceId: string;
  choiceLabel: string;
  turn: number;
}

export interface NarrativeState {
  civId: string;
  flags: string[];
  pendingEvent: PendingNarrativeEvent | null;
  eventHistory: NarrativeEventRecord[];
  /** Früheste Runde für das nächste dynamische Ereignis. */
  nextEventTurn: number;
  activeExcavationSiteId: string | null;
}

export type CrisisStage = 'dormant' | 'signal' | 'awakening' | 'resolution' | 'resolved';
export type CrisisOutcome = 'contained' | 'embraced' | 'ignored' | null;

export interface GalacticCrisisState {
  stage: CrisisStage;
  startedTurn: number | null;
  /** Runde, in der die aktuelle Stufe begann. */
  stageTurn: number | null;
  outcome: CrisisOutcome;
  /** Eindämmungsfortschritt 0..100. */
  containment: number;
}

export interface NarrativeSaveState {
  civStates: NarrativeState[];
  sites: ExcavationSite[];
  crisis?: GalacticCrisisState;
}

export interface NarrativeOverview {
  civId: string;
  currentTurn: number;
  treasury: number;
  sites: ExcavationSiteView[];
  activeSiteId: string | null;
  pendingEvent: NarrativeEventDefinition | null;
  eventHistory: NarrativeEventRecord[];
  crisis: GalacticCrisisState;
  completedSiteCount: number;
  excavationCost: number;
  crisisContainmentCost: number;
}

/* ========================================================================== */
/* MODUL 4: KOLONIE-VOLLMODELL                                                */
/* ========================================================================== */

export type CitizenFocus = 'balanced' | 'food' | 'production' | 'minerals' | 'energy' | 'research';

export interface Colony {
  id: string;
  name: string;
  planetId: string;
  systemId: string;
  civId: string; // Zugehörige Zivilisation
  factionId: string;
  foundedTurn: number;
  foundedDate: string;
  developmentTier: 'outpost' | 'settlement' | 'colony';
  status: 'active' | 'abandoned';
  
  // Position & Raumplanung
  cityCenterCoord: HexCoord;
  claimedHexKeys: string[]; // Set of "q,r" keys
  workedHexKeys: string[]; // Active worker placements
  workFocus: CitizenFocus;

  // Bevölkerung & Wachstum
  population: number; // Discrete Pop Count (z. B. 1 = 1.000 Kolonisten, 2, 3...)
  growthFoodProgress: number;
  growthFoodRequired: number;

  // Wirtschaft & Lager
  stockpile: ColonyStockpile;
  netYields: ResourceYields;
  grossYields: ResourceYields;
  upkeep: UpkeepCosts;
  energyDeficit: boolean; // true if net energy < 0 (Triggert Effizienzverlust)

  // Bauten & Bauwarteschlange
  buildings: BuildingInstance[];
  buildQueue: BuildProject[];

  // Multi-Hex-Distrikte (optional für Abwärtskompatibilität)
  districts?: DistrictInstance[];
  
  // Einfluss & Forschung
  influenceRate: number;
  researchOutput: number;

  // Wirtschaft Stufe A (optional für Abwärtskompatibilität alter Spielstände)
  /** Steuersatz in Prozent (0-60); Fallback EconomyEngine.DEFAULT_TAX_RATE */
  taxRate?: number;
  /** Korruptionsquote 0-1, abhängig von Steuersatz und Entwicklungsstufe */
  corruption?: number;
  /** Zufriedenheit 0-100, abhängig von Steuersatz und Entwicklungsstufe */
  approval?: number;
  /** Steuereinnahmen der letzten Runde in Credits */
  taxRevenue?: number;

  // Spätere Erweiterungen
  sizeClass: number;
}

/* ========================================================================== */
/* VORBEREITUNG SPÄTERER PHASEN (LOGISTIK, TERRAFORMING, KAMPF)              */
/* ========================================================================== */

export interface LogisticsRoute {
  id: string;
  sourceColonyId: string;
  targetColonyId: string;
  capacityPerTurn: number;
  freighterCount: number;
  isActive: boolean;
}

export type FreighterFleetStatus = 'loading' | 'outbound' | 'inbound';

export interface FreighterFleetCargo {
  food: number;
  minerals: number;
  rareResources: number;
}

export interface FreighterFleet {
  id: string;
  routeId: string;
  sourceColonyId: string;
  targetColonyId: string;
  status: FreighterFleetStatus;
  /** Turns already travelled on the current leg. */
  progress: number;
  /** Turns required for a single leg of the route. */
  travelTurns: number;
  maxCapacity: number;
  cargo: FreighterFleetCargo;
}

export interface TerraformingProject {
  id: string;
  planetId: string;
  targetBiome?: HexBiome;
  targetAtmosphere?: AtmosphereType;
  progress: number;
  totalRequired: number;
}

/* -------------------------------------------------------------------------- */
/* GALAKTISCHER HANDEL (PHASE 3)                                              */
/* -------------------------------------------------------------------------- */

export type GalacticTradeResource = 'food' | 'minerals' | 'rareResources';

export interface GalacticTradeRoute {
  id: string;
  sourceColonyId: string;
  targetColonyId: string;
  sourceSystemId: string;
  targetSystemId: string;
  /** Vollständiger Hyperlane-Pfad inklusive Quelle und Ziel. */
  pathSystemIds: string[];
  resource: GalacticTradeResource;
  capacityPerTurn: number;
  freighterCount: number;
  isActive: boolean;
  /** Handelszoll in Prozent des Zollwerts der gelieferten Fracht (0..20). */
  tariffRate?: number;
  /** Flotten-IDs eigener, stationierter Eskorten entlang der Route. */
  escortFleetIds?: string[];
  /** Wird zu Beginn jeder Runde aus der aktuellen Blockadelage neu berechnet. */
  isBlockaded?: boolean;
  /** Pfadsysteme, die aktuell von einer uneskortierten feindlichen Flotte blockiert werden. */
  blockadedSystemIds?: string[];
}

export type GalacticTradeConvoyStatus = 'loading' | 'outbound' | 'inbound';

export interface GalacticTradeConvoy {
  id: string;
  routeId: string;
  status: GalacticTradeConvoyStatus;
  /** Hyperlane-Hop-Index auf dem aktuellen Abschnitt. */
  pathIndex: number;
  capacity: number;
  cargo: FreighterFleetCargo;
}

/* -------------------------------------------------------------------------- */
/* SCHIFFBAU & FLOTTEN (PHASE 4)                                              */
/* -------------------------------------------------------------------------- */

export type ShipClass = 'corvette' | 'destroyer' | 'cruiser' | 'frigate' | 'scout' | 'colony';

export interface ShipDef {
  id: string;
  name: string;
  shipClass: ShipClass;
  description: string;
  productionCost: number;
  mineralCost: number;
  rareCost: number;
  requiredTechId: string;
  hull: number;
  attack: number;
  defense: number;
  /** Energie-Unterhalt pro Schiff und Runde. */
  energyUpkeep: number;
}

export interface FleetShipStack {
  shipDefId: string;
  count: number;
}

export type FleetStatus = 'stationed' | 'moving';

/**
 * Fracht eines Verbands. Kolonisten und Gründungsgüter liegen ausschließlich
 * im Laderaum des Kolonieschiffs – es gibt kein globales Ressourcenlager, aus
 * dem eine Gründung zusätzlich schöpfen könnte.
 */
export interface FleetCargo {
  colonists: number;
  food: number;
  minerals: number;
  rareResources: number;
  influence: number;
}

export interface Fleet {
  id: string;
  name: string;
  civId: string;
  /** Aktuelles Sternensystem; bei Bewegung das zuletzt erreichte System. */
  systemId: string;
  ships: FleetShipStack[];
  status: FleetStatus;
  /** Vollständiger Hyperlane-Pfad inklusive Start und Ziel. */
  pathSystemIds: string[];
  /** Index des zuletzt erreichten Systems innerhalb von pathSystemIds. */
  pathIndex: number;
  destinationSystemId: string | null;
  /** Optionaler Laderaum (nur Kolonieschiffe führen relevante Fracht). */
  cargo?: FleetCargo;
}

export interface ShipBuildOrder {
  id: string;
  colonyId: string;
  civId: string;
  shipDefId: string;
  investedProduction: number;
  requiredProduction: number;
  turnStarted: number;
}

export interface FleetBattleSide {
  civId: string;
  /** Teilnehmende Flotten (nur Verbände mit bekannten Schiffsmustern). */
  fleetIds: string[];
  shipsBefore: number;
  shipsAfter: number;
  /** Verluste, aggregiert pro Schiffsmuster. */
  losses: FleetShipStack[];
}

export interface FleetBattleReport {
  id: string;
  turn: number;
  systemId: string;
  rounds: number;
  sides: FleetBattleSide[];
  /** Siegerzivilisation oder null bei Patt / Rundengrenze. */
  winnerCivId: string | null;
}

/* ========================================================================== */
/* DIPLOMATIE                                                                 */
/* ========================================================================== */

export type DiplomaticRelation = 'peace' | 'war';

export interface DiplomaticPair {
  /** Zivilisations-IDs in aufsteigender Sortierung, damit Paare eindeutig sind. */
  civAId: string;
  civBId: string;
  relation: DiplomaticRelation;
  /** Runde, in der der aktuelle Zustand begann. */
  sinceTurn: number;
}

export interface DiplomacyResult {
  allowed: boolean;
  reason?: string;
}

/* ========================================================================== */
/* GALAXY & SYSTEM BASICS                                                     */
/* ========================================================================== */

export interface StarSystem {
  id: string;
  name: string;
  x: number;
  y: number;
  star: Star;
  planetCount: number;
  planets: Planet[];
  discoveryStatus: DiscoveryStatus;
  ownerFactionId: string | null;
  hyperlanes: string[];
  anomalyDetected: boolean;
  /** Optionale Asteroidengürtel; ältere Spielstände besitzen keine. */
  asteroidBelts?: AsteroidBelt[];
  notes?: string;
}

export type GalaxySize = 'small' | 'medium' | 'large' | 'huge';
export type GalaxyShape = 'spiral' | 'elliptical' | 'ring' | 'cluster';

export interface GalaxyConfig {
  size: GalaxySize;
  systemCount: number;
  width: number;
  height: number;
  minDistance: number;
  shape: GalaxyShape;
  seed: string;
  /** Gewählte Spielerfraktion (Save v5). */
  playerFactionId?: HumanFactionId;
  /** Anzahl der KI-Fraktionen 0–7 (Save v5). */
  aiFactionCount?: number;
}

export interface Galaxy {
  id: string;
  name: string;
  seed: string;
  config: GalaxyConfig;
  systems: StarSystem[];
  createdAt: number;
  /** Tatsächliche Fraktionszuweisung; beim Laden niemals neu würfeln. */
  factionAssignments?: FactionAssignment[];
}

export interface TurnState {
  currentTurn: number;
  turnDateStandard: string;
  phase: 'player' | 'processing' | 'events';
}

export type ViewMode = 'galaxy' | 'system' | 'surface';

/* ========================================================================== */
/* PHASE 6: SIEG, NIEDERLAGE & PUNKTE                                         */
/* ========================================================================== */

export type GameOutcomeStatus = 'ongoing' | 'victory' | 'defeat';

/** Siegbedingung oder Niederlagegrund. `elimination` ist die einzige Niederlage. */
export type VictoryCondition = 'domination' | 'science' | 'narrative' | 'elimination';

/** Einzelposten der Punktewertung am Spielende. */
export interface VictoryScorePart {
  id: string;
  label: string;
  points: number;
}

/** Punkte und Kennzahlen eines Reiches für die Rangliste. */
export interface VictoryRankEntry {
  civId: string;
  civName: string;
  isPlayer: boolean;
  score: number;
  colonies: number;
  population: number;
  technologies: number;
}

/**
 * Ausgang einer Partie. `ongoing` ist der Normalzustand; nach Sieg oder
 * Niederlage wird der Ausgang eingefroren und mit dem Spielstand gespeichert.
 */
export interface GameOutcome {
  status: GameOutcomeStatus;
  condition: VictoryCondition | null;
  /** Runde, in der der Ausgang festgestellt wurde. */
  turn: number | null;
  score: number;
  breakdown: VictoryScorePart[];
  /** Höchste Zahl eigener Kolonien; verhindert eine Niederlage vor der Gründung. */
  peakColonyCount: number;
  ranking: VictoryRankEntry[];
}

/* ========================================================================== */
/* STATIONÄRE WELTRAUMOBJEKTE (GRUNDLAGE FÜR SPÄTERE STATIONEN)               */
/* ========================================================================== */

export type SpaceStationType =
  | 'orbital'
  | 'supply'
  | 'research'
  | 'defense'
  | 'mining'
  | 'trade'
  | 'logistics';

/**
 * Stationäres Weltraumobjekt. Die Daten sind bewusst von der Darstellung
 * getrennt: Eine Station hängt entweder an einem Planeten (Umlaufbahn) oder
 * direkt an einem Sternensystem. In dieser Phase existiert noch keine
 * Stationsmechanik; die Struktur ist nur die erweiterbare Grundlage.
 */
export interface SpaceStation {
  id: string;
  name: string;
  type: SpaceStationType;
  systemId: string;
  /** Gesetzt für Stationen in einer Planetenumlaufbahn. */
  planetId?: string | null;
  /** Optionale Umlaufbahnebene innerhalb des Systems. */
  orbitIndex?: number | null;
  civId?: string | null;
  builtTurn?: number | null;
  notes?: string;
}

/* ========================================================================== */
/* NACHRICHTENVERLAUF                                                         */
/* ========================================================================== */

export type MessageTargetKind =
  | 'system'
  | 'planet'
  | 'colony'
  | 'fleet'
  | 'faction'
  | 'research';

export interface MessageTarget {
  kind: MessageTargetKind;
  id: string;
  /** Optionaler Anzeigename, damit der Verlauf ohne Auflösung lesbar bleibt. */
  label?: string;
}

/**
 * Persistenter Eintrag des Nachrichtenverlaufs. Popups und Verlauf teilen
 * dieselbe Meldung; der Verlauf bleibt nach dem automatischen Schließen
 * erhalten und wird mit dem Spielstand gespeichert.
 */
export interface MessageLogEntry {
  id: string;
  category: NotificationCategory;
  subject: string;
  text: string;
  turn: number;
  createdAt: number;
  read: boolean;
  /** Eindeutiger Schlüssel für den Duplikat-Schutz. */
  key: string;
  target?: MessageTarget;
}

/* ========================================================================== */
/* VERSIONIERTES SPEICHERFORMAT (VERSION 2 FÜR MODUL 4)                       */
/* ========================================================================== */

export interface SaveGameData {
  version: number; // 2
  saveName: string;
  timestamp: number;
  turnState: TurnState;
  galaxy: Galaxy;
  civilizations: Civilization[];
  colonies: Colony[];
  surfaces: PlanetSurface[];
  units: SurfaceUnit[];
  terraformingProjects?: TerraformingProject[];
  logisticsRoutes?: LogisticsRoute[];
  freighterFleets?: FreighterFleet[];
  galacticTradeRoutes?: GalacticTradeRoute[];
  galacticTradeConvoys?: GalacticTradeConvoy[];
  fleets?: Fleet[];
  shipBuildOrders?: ShipBuildOrder[];
  diplomacy?: DiplomaticPair[];
  /** Innere Fraktionen und Governance-Politik je Reich (optional, Save v4). */
  empireStates?: EmpireState[];
  /** Narrative Ebene: Ereignisse, Ausgrabungsstätten und galaktische Krise. */
  narrative?: NarrativeSaveState;
  /** Sieg/Niederlage samt Punktewertung (optional, Save v4). */
  outcome?: GameOutcome;
  /** Persistenter Nachrichtenverlauf (Save v5). */
  messageLog?: MessageLogEntry[];
  /** Stationäre Weltraumobjekte (Save v5, noch ohne Mechanik). */
  stations?: SpaceStation[];
  selectedSystemId: string | null;
  selectedPlanetId?: string | null;
  selectedHexCoord?: HexCoord | null;
  viewMode?: ViewMode;
  statistics: {
    surveyedSystemsCount: number;
    totalSystemsCount: number;
    surveyedPlanetsCount?: number;
    totalPlanetsCount?: number;
    colonizedPlanetsCount?: number;
    totalPopulation?: number;
    totalTechsResearched?: number;
  };
}
