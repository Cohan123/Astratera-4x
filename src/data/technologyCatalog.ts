/**
 * Astraea 4X - Technology Tree Catalog
 * Multi-branch civilization research model (Physics, Society, Engineering).
 */

import { TechnologyDef } from '../core/types.ts';

export const TECHNOLOGY_CATALOG: Record<string, TechnologyDef> = {
  // === TIER 1 ===
  geothermal_tapping: {
    id: 'geothermal_tapping',
    name: 'Geothermische Tiefbohrung',
    category: 'physics',
    tier: 1,
    cost: 50,
    description: 'Ermöglicht den Bau geothermischer Kraftwerke zur sauberen Ausnutzung vulkanischer und tektonischer Energie.',
    prerequisites: [],
    unlocks: {
      buildings: ['geothermal_plant'],
    },
  },
  orbital_surveying: {
    id: 'orbital_surveying',
    name: 'Orbitales Georadar',
    category: 'physics',
    tier: 1,
    cost: 45,
    description: 'Verbessert Sensoren und schaltet automatische Erkennung verborgener Ressourcen auf der Planetenoberfläche frei.',
    prerequisites: [],
    unlocks: {
      specialFeatures: ['geo_scanning'],
    },
  },
  planetary_pioneering: {
    id: 'planetary_pioneering',
    name: 'Pionierlogistik',
    category: 'society',
    tier: 1,
    cost: 40,
    description: 'Verbessert Siedlungsausbildung und erlaubt die Rekrutierung von Pionier-Trupps.',
    prerequisites: [],
    unlocks: {
      units: ['pioneer_squad'],
    },
  },
  subspace_comms: {
    id: 'subspace_comms',
    name: 'Subraum-Kommunikation',
    category: 'society',
    tier: 1,
    cost: 50,
    description: 'Ermöglicht Subraum-Relaisstationen für beschleunigte territoriale Grenzausdehnung und Einflussgewinn.',
    prerequisites: [],
    unlocks: {
      buildings: ['comm_relay'],
    },
  },
  automated_assembly: {
    id: 'automated_assembly',
    name: 'Automatisierte Fertigung',
    category: 'engineering',
    tier: 1,
    cost: 55,
    description: 'Ermöglicht industrielle Fabrik-Komplexe und Stufe-2 Gebäude-Ausbauten.',
    prerequisites: [],
    unlocks: {
      buildings: ['factory_complex'],
      upgrades: true,
    },
  },
  mineral_enrichment: {
    id: 'mineral_enrichment',
    name: 'Mineralanreicherung',
    category: 'engineering',
    tier: 1,
    cost: 45,
    description: 'Steigert den Ertrag aller Mineralientagebaue um 1 und verringert Bauzeiten.',
    prerequisites: [],
    unlocks: {
      improvements: ['dense_excavation'],
    },
  },

  // === TIER 2 ===
  fusion_reactors: {
    id: 'fusion_reactors',
    name: 'Magnetische Fusionsreaktoren',
    category: 'physics',
    tier: 2,
    cost: 110,
    description: 'Fortgeschrittene Kernfusion unter Verwendung von Helium-3; deckt hohe Energieanforderungen ab.',
    prerequisites: ['geothermal_tapping'],
    unlocks: {
      specialFeatures: ['he3_power'],
    },
  },
  exoskeleton_infantry: {
    id: 'exoskeleton_infantry',
    name: 'Exoskelett-Kampfanzüge',
    category: 'society',
    tier: 2,
    cost: 120,
    description: 'Ermöglicht die Rekrutierung von schwer gepanzerter Infanterie für planetare Sicherung.',
    prerequisites: ['planetary_pioneering'],
    unlocks: {
      units: ['garrison_infantry'],
    },
  },
  advanced_metallurgy: {
    id: 'advanced_metallurgy',
    name: 'Fortgeschrittene Metallurgie',
    category: 'engineering',
    tier: 2,
    cost: 130,
    description: 'Erlaubt den Bau von Element-Schmelzraffinerien zur Gewinnung seltener Ressourcen und Titan.',
    prerequisites: ['automated_assembly'],
    unlocks: {
      buildings: ['smelter_refinery'],
    },
  },
  gas_extraction: {
    id: 'gas_extraction',
    name: 'Industrielle Gasgewinnung',
    category: 'engineering',
    tier: 2,
    cost: 120,
    description:
      'Ermöglicht Gaskollektoren zur wirtschaftlichen Förderung von Wasserstoff, Helium und Spurengasen aus Gasriesen.',
    prerequisites: ['automated_assembly'],
    unlocks: {
      buildings: ['gas_collector'],
    },
  },
  planetary_logistics_prep: {
    id: 'planetary_logistics_prep',
    name: 'Interkoloniale Logistiknetzwerke',
    category: 'engineering',
    tier: 2,
    cost: 140,
    description: 'Grundlage für Frachterverbindungen und überregionale Ressourcenkorridore.',
    prerequisites: ['automated_assembly', 'subspace_comms'],
    unlocks: {
      specialFeatures: ['logistics_ready'],
    },
  },

  // === TIER 3 ===
  antimatter_containment: {
    id: 'antimatter_containment',
    name: 'Antimaterie-Eindämmung',
    category: 'physics',
    tier: 3,
    cost: 250,
    description: 'Beherrschung von Positronen-Eindämmung für gigantische Energiemengen und Terraforming.',
    prerequisites: ['fusion_reactors'],
    unlocks: {
      specialFeatures: ['antimatter_power'],
    },
  },
  atmospheric_scrubbers: {
    id: 'atmospheric_scrubbers',
    name: 'Atmosphären-Filteranlagen',
    category: 'society',
    tier: 3,
    cost: 260,
    description: 'Bereitet planetare Terraforming-Projekte vor; reinigt giftige und korrosive Atmosphären.',
    prerequisites: ['exoskeleton_infantry'],
    unlocks: {
      specialFeatures: ['terraforming_ready'],
    },
  },
  heavy_armor_brigades: {
    id: 'heavy_armor_brigades',
    name: 'Schwere Schwebepanzer-Divisionen',
    category: 'engineering',
    tier: 3,
    cost: 280,
    description: 'Ermöglicht die Produktion von schwersten Antigravitations-Panzern.',
    prerequisites: ['advanced_metallurgy'],
    unlocks: {
      units: ['heavy_armor'],
    },
  },
  interstellar_freight_network: {
    id: 'interstellar_freight_network',
    name: 'Interstellares Frachtnetzwerk',
    category: 'engineering',
    tier: 3,
    cost: 300,
    description: 'Verbindet planetare Logistikkorridore mit Fusionsantrieben zu einem zivilisationsweiten Frachtnetz.',
    prerequisites: ['planetary_logistics_prep', 'fusion_reactors'],
    unlocks: {
      specialFeatures: ['interstellar_logistics'],
    },
  },

  // === TIER 4: DOKTRINÄRE SPEZIALISIERUNGEN ===
  zero_point_physics: {
    id: 'zero_point_physics',
    name: 'Nullpunkt-Physik',
    category: 'physics',
    tier: 4,
    cost: 420,
    description: 'Extrahiert Energie direkt aus Quantenfluktuationen und macht externe Brennstoffketten überflüssig.',
    prerequisites: ['antimatter_containment', 'orbital_surveying'],
    exclusiveGroup: 'physics_doctrine',
    unlocks: {
      specialFeatures: ['zero_point_power'],
    },
  },
  gravitic_engineering: {
    id: 'gravitic_engineering',
    name: 'Gravitationslenkung',
    category: 'physics',
    tier: 4,
    cost: 430,
    description: 'Formt künstliche Gravitationsfelder für Antrieb, Schwerelosigkeitshabitate und Massenmanipulation.',
    prerequisites: ['antimatter_containment', 'advanced_metallurgy'],
    exclusiveGroup: 'physics_doctrine',
    unlocks: {
      specialFeatures: ['gravitic_manipulation'],
    },
  },
  genetic_adaptation: {
    id: 'genetic_adaptation',
    name: 'Genetische Anpassung',
    category: 'society',
    tier: 4,
    cost: 400,
    description: 'Passt Bevölkerung und Nutzpflanzen an extreme Welten an und senkt den Habitabilitätsbedarf dauerhaft.',
    prerequisites: ['atmospheric_scrubbers', 'orbital_surveying'],
    exclusiveGroup: 'society_doctrine',
    unlocks: {
      specialFeatures: ['adaptive_biology'],
    },
  },
  arcology_governance: {
    id: 'arcology_governance',
    name: 'Arkologie-Governance',
    category: 'society',
    tier: 4,
    cost: 410,
    description: 'Bündelt Verwaltung, Wohnraum und Infrastruktur in autarken Stadtkomplexen mit hoher Bevölkerungsdichte.',
    prerequisites: ['atmospheric_scrubbers', 'subspace_comms'],
    exclusiveGroup: 'society_doctrine',
    unlocks: {
      specialFeatures: ['arcology_administration'],
    },
  },
  self_replicating_industry: {
    id: 'self_replicating_industry',
    name: 'Selbstreplizierende Industrie',
    category: 'engineering',
    tier: 4,
    cost: 440,
    description: 'Industrieanlagen bauen ihre eigenen Erweiterungen und beschleunigen jede folgende Produktionskette.',
    prerequisites: ['interstellar_freight_network', 'heavy_armor_brigades'],
    exclusiveGroup: 'engineering_doctrine',
    unlocks: {
      specialFeatures: ['self_replication'],
    },
  },
  megastructure_engineering: {
    id: 'megastructure_engineering',
    name: 'Megastruktur-Ingenieurwesen',
    category: 'engineering',
    tier: 4,
    cost: 450,
    description: 'Ermöglicht orbitalen Großbau jenseits planetarer Maßstäbe, von Ringstationen bis zu Sternenkollektoren.',
    prerequisites: ['interstellar_freight_network', 'advanced_metallurgy'],
    exclusiveGroup: 'engineering_doctrine',
    unlocks: {
      specialFeatures: ['megastructures'],
    },
  },
};
