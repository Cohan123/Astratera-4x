/**
 * Astraea 4X - Orbital Ship Catalog (Phase 4)
 * Defines the hull classes that can be constructed in colonial shipyards.
 */

import { ShipDef } from '../core/types.ts';
import { BUILDABLE_SUPPORT_SHIP_IDS, SUPPORT_SHIP_CATALOG } from './supportShipCatalog.ts';

export const SHIP_CATALOG: Record<string, ShipDef> = {
  corvette: {
    id: 'corvette',
    name: 'Korvette',
    shipClass: 'corvette',
    description: 'Wendiger Geleitschutz mit Fusionsantrieb. Das Rückgrat jeder jungen Sternenflotte.',
    productionCost: 40,
    mineralCost: 30,
    rareCost: 0,
    requiredTechId: 'advanced_metallurgy',
    hull: 60,
    attack: 8,
    defense: 4,
    energyUpkeep: 1,
  },
  destroyer: {
    id: 'destroyer',
    name: 'Zerstörer',
    shipClass: 'destroyer',
    description: 'Mittleres Kriegsschiff mit Fusionsreaktoren und schwerer Panzerung für offensive Verbände.',
    productionCost: 90,
    mineralCost: 60,
    rareCost: 10,
    requiredTechId: 'fusion_reactors',
    hull: 140,
    attack: 18,
    defense: 10,
    energyUpkeep: 2,
  },
  cruiser: {
    id: 'cruiser',
    name: 'Kreuzer',
    shipClass: 'cruiser',
    description: 'Großkampfschiff mit gravitischen Antrieben. Schwer bewaffnet und für Langstreckenoperationen gerüstet.',
    productionCost: 180,
    mineralCost: 120,
    rareCost: 30,
    requiredTechId: 'gravitic_engineering',
    hull: 320,
    attack: 34,
    defense: 22,
    energyUpkeep: 4,
  },
};

/**
 * Schiffsdefinition inklusive Unterstützungsmustern (Fregatte, Aufklärer,
 * Kolonieschiff). Flottenlogik und UI müssen diesen Lookup verwenden, damit
 * Startflotten benannt, unterhalten und im Kampf korrekt behandelt werden.
 */
export function getShipDef(shipDefId: string): ShipDef | null {
  return SHIP_CATALOG[shipDefId] ?? SUPPORT_SHIP_CATALOG[shipDefId] ?? null;
}

/** Alle in der Werft baubaren Muster: Kriegsschiffe plus freigegebene Unterstützer. */
export const BUILDABLE_SHIP_IDS: ReadonlySet<string> = new Set([
  ...Object.keys(SHIP_CATALOG),
  ...BUILDABLE_SUPPORT_SHIP_IDS,
]);

export function getBuildableShipDefs(): ShipDef[] {
  return [...BUILDABLE_SHIP_IDS]
    .map((id) => getShipDef(id))
    .filter((def): def is ShipDef => def !== null);
}
