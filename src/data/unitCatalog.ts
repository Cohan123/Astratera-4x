/**
 * Astraea 4X - Surface Ground Units Catalog
 * Defines military and reconnaissance squads operating on the hexagonal planetary surface.
 */

import { UnitDef } from '../core/types.ts';

export const UNIT_CATALOG: Record<string, UnitDef> = {
  scout: {
    id: 'scout',
    name: 'Späher-Trupp',
    type: 'scout',
    description: 'Leichte Aufklärungsformation mit Geländefahrzeugen zur schnellen Kartierung und Erkennung verborgener Ressourcen.',
    movementPoints: 3,
    productionCost: 30,
    mineralCost: 15,
    rareCost: 0,
    visionRadius: 2,
    combatStrength: 10,
  },
  pioneer_squad: {
    id: 'pioneer_squad',
    name: 'Pionier-Expedition',
    type: 'pioneer',
    description: 'Feld-Ingenieure und Geologen. Kann Gelände erkunden und Außenposten für neue Kolonien vorbereiten.',
    movementPoints: 2,
    productionCost: 50,
    mineralCost: 35,
    rareCost: 5,
    requiredTechId: 'planetary_pioneering',
    visionRadius: 1,
    combatStrength: 15,
  },
  garrison_infantry: {
    id: 'garrison_infantry',
    name: 'Exoskelett-Infanterie',
    type: 'infantry',
    description: 'Verstärkte Bodentruppen mit Exoskeletten zur Kolonieverteidigung und Grenzsicherung.',
    movementPoints: 2,
    productionCost: 65,
    mineralCost: 40,
    rareCost: 5,
    requiredTechId: 'exoskeleton_infantry',
    visionRadius: 1,
    combatStrength: 35,
  },
  heavy_armor: {
    id: 'heavy_armor',
    name: 'Schwere Panzer-Brigade',
    type: 'heavy_armor',
    description: 'Schwer gepanzerte Schwebepanzer mit verheerender Feuerkraft und starkem Panzerungsschutz.',
    movementPoints: 2,
    productionCost: 110,
    mineralCost: 75,
    rareCost: 20,
    requiredTechId: 'heavy_armor_brigades',
    visionRadius: 1,
    combatStrength: 75,
  },
};
