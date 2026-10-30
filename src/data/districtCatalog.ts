/**
 * Astraea 4X - District Catalog
 * Data-driven definitions of multi-hex districts. Each footprint is expressed
 * as axial offsets relative to the district's anchor hex ({q:0,r:0}).
 */

import { DistrictDef } from '../core/types.ts';

export const DISTRICT_CATALOG: Record<string, DistrictDef> = {
  residential_block: {
    id: 'residential_block',
    name: 'Wohnblock',
    category: 'residential',
    description: 'Dichte Wohnbebauung mit begrünten Innenhöfen. Stabilisiert die Bevölkerung und stärkt die zivile Präsenz.',
    footprint: [
      { q: 0, r: 0 },
      { q: 1, r: 0 },
    ],
    mineralCost: 40,
    rareCost: 0,
    energyUpkeep: 1,
    yieldsPerTurn: {
      food: 2,
      influence: 1,
    },
  },
  industrial_park: {
    id: 'industrial_park',
    name: 'Industriepark',
    category: 'industrial',
    description: 'Automatisierte Fertigungsstraßen und Raffinerien. Hoher Energiebedarf, aber starke Produktions- und Mineralausbeute.',
    footprint: [
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: 0, r: 1 },
    ],
    requiredTechId: 'automated_assembly',
    mineralCost: 60,
    rareCost: 5,
    energyUpkeep: 2,
    yieldsPerTurn: {
      production: 4,
      minerals: 2,
    },
  },
  agro_complex: {
    id: 'agro_complex',
    name: 'Agrar-Komplex',
    category: 'agricultural',
    description: 'Großflächige Gewächshäuser und Hydroponik-Hallen zur Ernährung großer Kolonien.',
    footprint: [
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: 1, r: -1 },
    ],
    mineralCost: 45,
    rareCost: 0,
    energyUpkeep: 1,
    yieldsPerTurn: {
      food: 6,
    },
  },
  research_campus: {
    id: 'research_campus',
    name: 'Forschungscampus',
    category: 'research',
    description: 'Labore, Observatorien und Rechenzentren. Bündelt die wissenschaftliche Kapazität der Kolonie.',
    footprint: [
      { q: 0, r: 0 },
      { q: 0, r: 1 },
    ],
    requiredTechId: 'orbital_surveying',
    mineralCost: 70,
    rareCost: 10,
    energyUpkeep: 2,
    yieldsPerTurn: {
      research: 4,
    },
  },
};
