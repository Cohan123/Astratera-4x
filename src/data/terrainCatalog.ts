/**
 * Astraea 4X - Terrain & Biome Catalog
 * Defines the physical characteristics, base yields, movement costs, and visual cues of planetary hex tiles.
 */

import { HexBiome, ResourceYields } from '../core/types.ts';

export interface BiomeDefinition {
  id: HexBiome;
  displayName: string;
  description: string;
  baseYields: ResourceYields;
  movementCost: number; // 1 = normal, 2 = rough, 999 = impassable
  isImpassable: boolean;
  baseElevation: number; // 0: water, 1: lowland, 2: highland, 3: peaks
  color: string;
  strokeColor: string;
  textureType:
    | 'flat'
    | 'waves'
    | 'dunes'
    | 'crags'
    | 'peaks'
    | 'frost'
    | 'snow'
    | 'forest'
    | 'jungle'
    | 'marsh'
    | 'lava'
    | 'slime'
    | 'craters'
    | 'clouds';
  habitabilityImpact: number; // -30% to +15%
}

export const BIOME_CATALOG: Record<HexBiome, BiomeDefinition> = {
  plains: {
    id: 'plains',
    displayName: 'Fruchtbare Tiefebene',
    description: 'Nährstoffreicher Schwemmlandboden mit idealen Bedingungen für Nahrung und Siedlungsbau.',
    baseYields: { food: 3, production: 1, energy: 0, minerals: 1, rareResources: 0, research: 0, influence: 0 },
    movementCost: 1,
    isImpassable: false,
    baseElevation: 1,
    color: '#1e3a29',
    strokeColor: '#2d5a3f',
    textureType: 'flat',
    habitabilityImpact: 10,
  },
  forest: {
    id: 'forest',
    displayName: 'Gemäßigter Wald',
    description: 'Dichte Laub- und Mischwälder mit stabiler Holz- und Nahrungsbasis sowie guten Bedingungen für Siedlungen.',
    baseYields: { food: 2, production: 2, energy: 0, minerals: 1, rareResources: 0, research: 0, influence: 0 },
    movementCost: 1.5,
    isImpassable: false,
    baseElevation: 1,
    color: '#1b3a26',
    strokeColor: '#2f5c3d',
    textureType: 'forest',
    habitabilityImpact: 5,
  },
  jungle: {
    id: 'jungle',
    displayName: 'Tropischer Dschungel',
    description: 'Üppige, feuchtheiße Vegetation mit enormer Biomasse, aber erschwertem Vordringen und hohem Krankheitsrisiko.',
    baseYields: { food: 3, production: 1, energy: 1, minerals: 0, rareResources: 1, research: 1, influence: 0 },
    movementCost: 2,
    isImpassable: false,
    baseElevation: 1,
    color: '#173d1f',
    strokeColor: '#2a6333',
    textureType: 'jungle',
    habitabilityImpact: 0,
  },
  marsh: {
    id: 'marsh',
    displayName: 'Feuchtmarsch',
    description: 'Wassergetränkte Niederung mit Schilf, Mooren und nährstoffreichen Sedimenten. Langsam, aber ertragreich.',
    baseYields: { food: 2, production: 0, energy: 1, minerals: 1, rareResources: 1, research: 1, influence: 0 },
    movementCost: 2,
    isImpassable: false,
    baseElevation: 1,
    color: '#243a2b',
    strokeColor: '#3c5d45',
    textureType: 'marsh',
    habitabilityImpact: -5,
  },
  ocean: {
    id: 'ocean',
    displayName: 'Flüssiger Ozean',
    description: 'Ausgedehnte Meeresflächen mit reicher Biosphäre. Erfordert maritime Technologien zur Durchquerung.',
    baseYields: { food: 2, production: 0, energy: 1, minerals: 0, rareResources: 0, research: 1, influence: 0 },
    movementCost: 999,
    isImpassable: true,
    baseElevation: 0,
    color: '#0c2438',
    strokeColor: '#16486e',
    textureType: 'waves',
    habitabilityImpact: 5,
  },
  desert: {
    id: 'desert',
    displayName: 'Aride Sandwüste',
    description: 'Extrem trockene Dünenlandschaft mit intensiver Sonneneinstrahlung, jedoch mineralienreich.',
    baseYields: { food: 0, production: 1, energy: 3, minerals: 2, rareResources: 0, research: 0, influence: 0 },
    movementCost: 1.5,
    isImpassable: false,
    baseElevation: 1,
    color: '#42331c',
    strokeColor: '#634b26',
    textureType: 'dunes',
    habitabilityImpact: -10,
  },
  hills: {
    id: 'hills',
    displayName: 'Mineralreiches Hügelland',
    description: 'Aufgewölbte Gesteinsschichten mit reichem Vorkommen an Erz- und Baumineralien.',
    baseYields: { food: 1, production: 3, energy: 0, minerals: 3, rareResources: 1, research: 0, influence: 0 },
    movementCost: 2,
    isImpassable: false,
    baseElevation: 2,
    color: '#383229',
    strokeColor: '#544b3d',
    textureType: 'crags',
    habitabilityImpact: 0,
  },
  mountains: {
    id: 'mountains',
    displayName: 'Massives Hochgebirge',
    description: 'Zerklüftete Gebirgszüge. Vorerst unpassierbar für schwere Truppen, liefert geologische Forschung.',
    baseYields: { food: 0, production: 2, energy: 0, minerals: 4, rareResources: 2, research: 2, influence: 0 },
    movementCost: 999,
    isImpassable: true,
    baseElevation: 3,
    color: '#28282c',
    strokeColor: '#45454d',
    textureType: 'peaks',
    habitabilityImpact: -15,
  },
  tundra: {
    id: 'tundra',
    displayName: 'Gefrorene Tundra',
    description: 'Dauerfrostboden mit Flechten und unterirdischen Eislinsen. Geringe Nahrung, aber stabiles Fundament.',
    baseYields: { food: 1, production: 1, energy: 1, minerals: 2, rareResources: 0, research: 0, influence: 0 },
    movementCost: 1.5,
    isImpassable: false,
    baseElevation: 1,
    color: '#223842',
    strokeColor: '#345766',
    textureType: 'frost',
    habitabilityImpact: -10,
  },
  snow: {
    id: 'snow',
    displayName: 'Gletscherfeld',
    description: 'Permanente Schnee- und Eisdecke. Kaum nutzbar, liefert aber sauberes Wasser und klimatische Forschung.',
    baseYields: { food: 0, production: 1, energy: 1, minerals: 1, rareResources: 0, research: 1, influence: 0 },
    movementCost: 2,
    isImpassable: false,
    baseElevation: 2,
    color: '#dbeafe',
    strokeColor: '#bfdbfe',
    textureType: 'snow',
    habitabilityImpact: -15,
  },
  lava: {
    id: 'lava',
    displayName: 'Offener Lavasee',
    description: 'Glühende Magmaflächen mit extremer Hitze. Unpassierbar, aber Quelle gewaltiger geothermischer Energie.',
    baseYields: { food: 0, production: 2, energy: 6, minerals: 3, rareResources: 3, research: 1, influence: 0 },
    movementCost: 999,
    isImpassable: true,
    baseElevation: 1,
    color: '#7f1d1d',
    strokeColor: '#f97316',
    textureType: 'lava',
    habitabilityImpact: -35,
  },
  alien: {
    id: 'alien',
    displayName: 'Fremdartige Xenoflora',
    description: 'Nicht-terrestrische Lebensgemeinschaft aus Biolumineszenz, Sporen und Kristallpflanzen. Wissenschaftlich wertvoll.',
    baseYields: { food: 1, production: 0, energy: 1, minerals: 1, rareResources: 2, research: 3, influence: 0 },
    movementCost: 2,
    isImpassable: false,
    baseElevation: 1,
    color: '#2a1e4a',
    strokeColor: '#7c3aed',
    textureType: 'slime',
    habitabilityImpact: -10,
  },
  gas: {
    id: 'gas',
    displayName: 'Gasriesen-Wolkenschicht',
    description: 'Platzhalteroberfläche ohne festen Boden. Die Karte zeigt Wolkengürtel und Sturmzonen; eine Besiedelung ist ausgeschlossen.',
    baseYields: { food: 0, production: 0, energy: 3, minerals: 0, rareResources: 2, research: 2, influence: 0 },
    movementCost: 999,
    isImpassable: true,
    baseElevation: 1,
    color: '#78350f',
    strokeColor: '#f59e0b',
    textureType: 'clouds',
    habitabilityImpact: -100,
  },
  volcanic: {
    id: 'volcanic',
    displayName: 'Vulkanische Schlotzone',
    description: 'Aktiver Vulkanismus mit Magmaflüssen. Hohe geothermische Energie und seltene Mineralien.',
    baseYields: { food: 0, production: 3, energy: 4, minerals: 3, rareResources: 2, research: 1, influence: 0 },
    movementCost: 2.5,
    isImpassable: false,
    baseElevation: 2,
    color: '#3d1c1a',
    strokeColor: '#612b27',
    textureType: 'lava',
    habitabilityImpact: -25,
  },
  toxic: {
    id: 'toxic',
    displayName: 'Toxische Schwefelau',
    description: 'Säurehaltige Dämpfe und korrosive Laugenbecken. Gefährlich, aber chemisch hochgradig wertvoll.',
    baseYields: { food: 0, production: 1, energy: 2, minerals: 1, rareResources: 3, research: 2, influence: 0 },
    movementCost: 2,
    isImpassable: false,
    baseElevation: 1,
    color: '#2b3318',
    strokeColor: '#475424',
    textureType: 'slime',
    habitabilityImpact: -30,
  },
  fungal_forest: {
    id: 'fungal_forest',
    displayName: 'Biolumineszenter Pilzwald',
    description: 'Fremdartige Riesenpilz-Ökosysteme mit pharmazeutischem Nutzen und stabiler Nahrungsquelle.',
    baseYields: { food: 3, production: 1, energy: 1, minerals: 1, rareResources: 1, research: 2, influence: 0 },
    movementCost: 1.5,
    isImpassable: false,
    baseElevation: 1,
    color: '#1a3331',
    strokeColor: '#2b5451',
    textureType: 'flat',
    habitabilityImpact: 5,
  },
  impact_crater: {
    id: 'impact_crater',
    displayName: 'Antiker Einschlagkrater',
    description: 'Überreste eines Meteoriteneinschlags mit freigelegten Erzkernen und extraterrestrischen Kristallen.',
    baseYields: { food: 0, production: 2, energy: 0, minerals: 4, rareResources: 3, research: 3, influence: 0 },
    movementCost: 2,
    isImpassable: false,
    baseElevation: 1,
    color: '#302636',
    strokeColor: '#4d3d57',
    textureType: 'craters',
    habitabilityImpact: -5,
  },
};
