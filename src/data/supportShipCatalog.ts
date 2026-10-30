/**
 * Astraea 4X - Unterstützungsschiffe (Startflotte & Kolonisation)
 *
 * Diese Muster sind bewusst vom Kriegsschiff-Katalog getrennt: Sie erscheinen
 * nicht in der Werftliste, solange sie nicht ausdrücklich freigeschaltet sind,
 * teilen sich aber dieselben Flotten-, Unterhalts- und Kampfregeln.
 */

import { ShipDef } from '../core/types.ts';

export const SUPPORT_SHIP_CATALOG: Record<string, ShipDef> = {
  frigate: {
    id: 'frigate',
    name: 'Kleine Fregatte',
    shipClass: 'frigate',
    description:
      'Kompakter Eskortierer mit Fusionsantrieb. Bewaffnet genug, um Kolonieschiffe gegen Piraten zu decken.',
    productionCost: 0,
    mineralCost: 0,
    rareCost: 0,
    requiredTechId: '',
    hull: 45,
    attack: 6,
    defense: 4,
    energyUpkeep: 1,
  },
  scout_ship: {
    id: 'scout_ship',
    name: 'Aufklärungsschiff',
    shipClass: 'scout',
    description:
      'Leichter Sensorverband mit Langstreckenantenne. Erkundet Systeme, bevor die Flotte folgt.',
    productionCost: 0,
    mineralCost: 0,
    rareCost: 0,
    requiredTechId: '',
    hull: 25,
    attack: 0,
    defense: 1,
    energyUpkeep: 1,
  },
  colony_ship: {
    id: 'colony_ship',
    name: 'Kolonieschiff',
    shipClass: 'colony',
    description:
      'Frachtrumpf mit Siedlungskapseln. Transportiert Kolonisten und Gründungsgüter zum Zielplaneten.',
    productionCost: 120,
    mineralCost: 90,
    rareCost: 15,
    requiredTechId: 'advanced_metallurgy',
    hull: 50,
    attack: 0,
    defense: 2,
    energyUpkeep: 1,
  },
};

/** Muster, die in einer Werft nachgebaut werden dürfen. */
export const BUILDABLE_SUPPORT_SHIP_IDS = ['colony_ship'] as const;
