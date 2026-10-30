/**
 * Astraea 4X - Resource Catalog
 * Defines the 5 core game resources and subterranean planetary deposits.
 */

import { ResourceDepositType, ResourceYields } from '../core/types.ts';

export interface ResourceInfo {
  id: string;
  name: string;
  symbol: string;
  color: string;
  description: string;
}

export const CORE_RESOURCES: Record<string, ResourceInfo> = {
  food: {
    id: 'food',
    name: 'Nahrung',
    symbol: '🍏',
    color: '#22c55e',
    description: 'Versorgt die Bevölkerung und fördert das Bevölkerungswachstum (Pops).',
  },
  production: {
    id: 'production',
    name: 'Produktion',
    symbol: '⚙️',
    color: '#f59e0b',
    description: 'Treibt den Baufortschritt von Gebäuden, Upgrades und Einheiten voran.',
  },
  energy: {
    id: 'energy',
    name: 'Energie',
    symbol: '⚡',
    color: '#38bdf8',
    description: 'Unterhält städtische Infrastruktur & Industrie. Bei Defizit sinkt die Kolonie-Effizienz um 25%.',
  },
  minerals: {
    id: 'minerals',
    name: 'Gewöhnliche Mineralien',
    symbol: '🪨',
    color: '#94a3b8',
    description: 'Grundlegende Baustoffe für planetare Gebäude, Distrikte und Infrastruktur.',
  },
  rareResources: {
    id: 'rareResources',
    name: 'Seltene Ressourcen',
    symbol: '💎',
    color: '#a855f7',
    description: 'Exotische Elemente (Titan, Helium-3, Kristalle) für fortgeschrittene Bauten und Technologien.',
  },
  research: {
    id: 'research',
    name: 'Forschung',
    symbol: '🔬',
    color: '#06b6d4',
    description: 'Fließt in den zivilisationsweiten Forschungspool zum Freischalten neuer Technologien.',
  },
  influence: {
    id: 'influence',
    name: 'Einfluss',
    symbol: '🏛️',
    color: '#ec4899',
    description: 'Wird von Kolonien erzeugt und ausschließlich für die friedliche Gebietsexpansion genutzt.',
  },
};

export interface DepositDefinition {
  id: ResourceDepositType;
  name: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'exotic';
  yieldBonus: Partial<ResourceYields>;
  icon: string;
  description: string;
}

export const DEPOSIT_CATALOG: Record<ResourceDepositType, DepositDefinition> = {
  none: {
    id: 'none',
    name: 'Kein Vorkommen',
    rarity: 'common',
    yieldBonus: {},
    icon: '',
    description: 'Standardboden ohne spezifische geologische Konzentration.',
  },
  rich_soil: {
    id: 'rich_soil',
    name: 'Nährstoffreiches Schwemmland',
    rarity: 'common',
    yieldBonus: { food: 3 },
    icon: '🌱',
    description: 'Hocheffektive Bodenschichten, die den landwirtschaftlichen Ertrag verdoppeln.',
  },
  deep_mineral_vein: {
    id: 'deep_mineral_vein',
    name: 'Reiche Erzader',
    rarity: 'common',
    yieldBonus: { minerals: 4, production: 1 },
    icon: '⛏️',
    description: 'Dichte Ader aus Eisen-, Kupfer- und Silikatverbindungen.',
  },
  hydrocarbon_spring: {
    id: 'hydrocarbon_spring',
    name: 'Hydrothermale Methanquelle',
    rarity: 'uncommon',
    yieldBonus: { energy: 4 },
    icon: '🔥',
    description: 'Natürliche geothermische oder kohlenwasserstoffhaltige Eruption.',
  },
  titanium_strata: {
    id: 'titanium_strata',
    name: 'Titan-Vorkommen',
    rarity: 'rare',
    yieldBonus: { minerals: 2, rareResources: 2 },
    icon: '🛡️',
    description: 'Leichtes, extrem widerstandsfähiges Metall für Raumschiffe und schwere Panzerung.',
  },
  helium3_vent: {
    id: 'helium3_vent',
    name: 'Helium-3 Schlot',
    rarity: 'rare',
    yieldBonus: { energy: 3, rareResources: 2, research: 1 },
    icon: '✨',
    description: 'Idealer Brennstoff für saubere Kernfusionsreaktoren.',
  },
  crystalline_matrix: {
    id: 'crystalline_matrix',
    name: 'Supraleiter-Kristallfeld',
    rarity: 'exotic',
    yieldBonus: { rareResources: 3, research: 3 },
    icon: '💎',
    description: 'Kristalline Resonanzstrukturen für Hochleistungsrechner und Schilde.',
  },
  ancient_ruins: {
    id: 'ancient_ruins',
    name: 'Vorläufer-Relikte',
    rarity: 'exotic',
    yieldBonus: { research: 4, influence: 2 },
    icon: '🏛️',
    description: 'Verlassene Bauten einer uralten Raumfahrerzivilisation.',
  },
};
