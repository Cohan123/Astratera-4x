/**
 * Astraea 4X - Planet Catalog & Astronomical Classifications
 * Grounded definitions for planetary bodies, surface profiles, and habitability criteria.
 */
import {
  AtmosphereType,
  GravityCategory,
  HabitabilityTier,
  PlanetType,
  TemperatureCategory,
  WaterCategory,
} from '../core/types.ts';

export interface PlanetTypeDefinition {
  type: PlanetType;
  displayName: string;
  description: string;
  preferredZone: 'inner' | 'habitable' | 'outer';
  color: string;
  accentColor: string;
  ringColor?: string;
  texturePattern: 'bands' | 'craters' | 'swirls' | 'oceans' | 'cracks';
  baseSlotRange: [number, number]; // [min, max] sizeClass (Bauslots)
  baseHabitability: number; // 0 to 100
  typicalAtmosphere: AtmosphereType[];
  typicalWater: WaterCategory[];
  allowsSurfaceColony: boolean;
}

export const PLANET_CATALOG: Record<PlanetType, PlanetTypeDefinition> = {
  ocean: {
    type: 'ocean',
    displayName: 'Ozeanplanet',
    description: 'Vollständig oder überwiegend von flüssigen Wasserozeanen bedeckt. Außergewöhnlich hohes Potenzial für terrestrische Biosphären.',
    preferredZone: 'habitable',
    color: '#0284C7',
    accentColor: '#38BDF8',
    texturePattern: 'oceans',
    baseSlotRange: [14, 22],
    baseHabitability: 88,
    typicalAtmosphere: ['breathable', 'dense'],
    typicalWater: ['liquid_ocean', 'abundant'],
    allowsSurfaceColony: true,
  },
  rocky: {
    type: 'rocky',
    displayName: 'Gesteinsplanet (Terra-Typ)',
    description: 'Feste Silikatkruste mit Gebirgszügen, Talkesseln und moderaten mineralischen Lagerstätten.',
    preferredZone: 'habitable',
    color: '#10B981',
    accentColor: '#6EE7B7',
    texturePattern: 'craters',
    baseSlotRange: [12, 20],
    baseHabitability: 75,
    typicalAtmosphere: ['breathable', 'thin', 'dense'],
    typicalWater: ['moderate', 'trace', 'abundant'],
    allowsSurfaceColony: true,
  },
  desert: {
    type: 'desert',
    displayName: 'Wüstenplanet',
    description: 'Trockene, sand- und felsdominierte Welt mit starken Tag-Nacht-Temperaturschwankungen und reichhaltigen seltenen Erden.',
    preferredZone: 'habitable',
    color: '#D97706',
    accentColor: '#FBBF24',
    texturePattern: 'swirls',
    baseSlotRange: [12, 18],
    baseHabitability: 50,
    typicalAtmosphere: ['breathable', 'thin'],
    typicalWater: ['trace', 'none'],
    allowsSurfaceColony: true,
  },
  ice: {
    type: 'ice',
    displayName: 'Eisplanet (Kryowelt)',
    description: 'Gefrorene Methan- und Wassereisschichten mit extrem niedrigen Oberflächentemperaturen.',
    preferredZone: 'outer',
    color: '#67E8F9',
    accentColor: '#CFFAFE',
    texturePattern: 'cracks',
    baseSlotRange: [10, 18],
    baseHabitability: 25,
    typicalAtmosphere: ['thin', 'none', 'dense'],
    typicalWater: ['abundant', 'trace'],
    allowsSurfaceColony: true,
  },
  volcanic: {
    type: 'volcanic',
    displayName: 'Vulkanplanet',
    description: 'Geologisch hochaktive Welt mit Lavameeren, toxischen Ausgasungen und immensen geothermalen Energiereserven.',
    preferredZone: 'inner',
    color: '#EF4444',
    accentColor: '#F97316',
    texturePattern: 'cracks',
    baseSlotRange: [10, 16],
    baseHabitability: 12,
    typicalAtmosphere: ['corrosive', 'dense', 'toxic'],
    typicalWater: ['none'],
    allowsSurfaceColony: false,
  },
  toxic: {
    type: 'toxic',
    displayName: 'Giftiger Planet',
    description: 'Dichte, ätzende Atmosphäre unter starkem Treibhauseffekt. Hohe Vorkommen chemischer Verbindungen, aber feindselige Umwelt.',
    preferredZone: 'inner',
    color: '#A855F7',
    accentColor: '#E879F9',
    texturePattern: 'swirls',
    baseSlotRange: [10, 16],
    baseHabitability: 5,
    typicalAtmosphere: ['toxic', 'corrosive', 'dense'],
    typicalWater: ['none', 'trace'],
    allowsSurfaceColony: false,
  },
  xeno: {
    type: 'xeno',
    displayName: 'Xenowelt',
    description: 'Extrem seltener Planet mit fremdartiger Biosphäre, leuchtenden Kristallwäldern und instabilen Umweltbedingungen. Wissenschaftlich hochwertig, aber nur eingeschränkt besiedelbar.',
    preferredZone: 'habitable',
    color: '#7C3AED',
    accentColor: '#22D3EE',
    texturePattern: 'swirls',
    baseSlotRange: [15, 23],
    baseHabitability: 18,
    typicalAtmosphere: ['toxic', 'corrosive', 'thin'],
    typicalWater: ['moderate', 'trace'],
    allowsSurfaceColony: true,
  },
  gas_giant: {
    type: 'gas_giant',
    displayName: 'Gasriese',
    description: 'Gewaltige Ansammlung von Wasserstoff und Helium ohne feste Oberfläche. Nur spezielle Gasförderplattformen und Gaskollektoren können hier wirtschaftlich betrieben werden.',
    preferredZone: 'outer',
    color: '#F59E0B',
    accentColor: '#B45309',
    ringColor: 'rgba(251, 191, 36, 0.45)',
    texturePattern: 'bands',
    baseSlotRange: [20, 25],
    baseHabitability: 0,
    typicalAtmosphere: ['dense', 'toxic'],
    typicalWater: ['none'],
    allowsSurfaceColony: false,
  },
};

export const ATMOSPHERE_LABELS: Record<AtmosphereType, { label: string; description: string }> = {
  none: { label: 'Keine (Vakuum)', description: 'Oberfläche direkt kosmischer Strahlung ausgesetzt.' },
  thin: { label: 'Dünn / Druckarm', description: 'Geringer Atmosphärendruck, Druckanzug zwingend erforderlich.' },
  breathable: { label: 'Atembar (N2/O2)', description: 'Stickstoff-Sauerstoff-Gemisch, für Menschen ungeschützt atembar.' },
  dense: { label: 'Dicht / Hochdruck', description: 'Hoher barometrischer Druck, starke Witterungsstürme.' },
  corrosive: { label: 'Ätzend / Säurehaltig', description: 'Säurehaltige Niederschläge zersetzen ungeschützte Hüllen.' },
  toxic: { label: 'Giftig / Narkotisch', description: 'Atmosphäre enthält tödliche Gaskonzentrationen (CH4, NH3).' },
};

export const TEMPERATURE_LABELS: Record<TemperatureCategory, { label: string; range: string }> = {
  freezing: { label: 'Tiefgefroren', range: '< 180 K (-93 °C)' },
  cold: { label: 'Kalt', range: '180 - 260 K (-93 bis -13 °C)' },
  temperate: { label: 'Gemäßigt', range: '260 - 315 K (-13 bis +42 °C)' },
  hot: { label: 'Heiß', range: '315 - 400 K (+42 bis +127 °C)' },
  scorching: { label: 'Glühend heiß', range: '> 400 K (+127 °C)' },
};

export const WATER_LABELS: Record<WaterCategory, { label: string; description: string }> = {
  none: { label: 'Kein Wasser', description: 'Vollständig aride, trockene Kruste.' },
  trace: { label: 'Spuren', description: 'Kleine Mengen in polaren Eiskappen oder tiefem Permafrost.' },
  moderate: { label: 'Moderat', description: 'Binnenseen, Flusstäler oder Grundwasserreservoirs.' },
  abundant: { label: 'Reichhaltig', description: 'Zahlreiche Meere und aktive hydrologische Zyklen.' },
  liquid_ocean: { label: 'Globaler Ozean', description: 'Ausgedehnte planetare Ozeanbecken dominieren die Oberfläche.' },
};

export const GRAVITY_LABELS: Record<GravityCategory, { label: string; multiplier: string }> = {
  low: { label: 'Niedrig', multiplier: '< 0.70 G' },
  standard: { label: 'Standard (Erdähnlich)', multiplier: '0.80 - 1.25 G' },
  high: { label: 'Hoch', multiplier: '1.26 - 1.95 G' },
  extreme: { label: 'Extrem', multiplier: '> 2.00 G' },
};

export const HABITABILITY_LABELS: Record<HabitabilityTier, { label: string; color: string }> = {
  ideal: { label: 'Paradiesisch (Ideal)', color: '#34D399' },
  moderate: { label: 'Geeignet', color: '#38BDF8' },
  harsh: { label: 'Rau (Kolonisierbar)', color: '#FBBF24' },
  hostile: { label: 'Extrem feindselig', color: '#F87171' },
  uninhabitable: { label: 'Unbewohnbar', color: '#94A3B8' },
};
