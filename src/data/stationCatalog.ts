/**
 * Astraea 4X - Stationskatalog (strukturelle Grundlage)
 *
 * Noch ohne Wirtschafts- oder Verwaltungsmechanik. Der Katalog trennt Daten
 * und spätere Darstellung, damit Stationen ohne Umbau der Planeten- und
 * Schiffslogik ergänzt werden können.
 */

import type { SpaceStationType } from '../core/types.ts';

export type StationPlacement = 'planet_orbit' | 'system';

export interface StationTypeDefinition {
  id: SpaceStationType;
  name: string;
  description: string;
  placement: StationPlacement;
  /** Späterer Grafikschlüssel; Assets existieren noch nicht. */
  visualKey: string;
}

export const STATION_CATALOG: Record<SpaceStationType, StationTypeDefinition> = {
  orbital: {
    id: 'orbital',
    name: 'Orbitalstation',
    description: 'Zentrale Station in der Umlaufbahn eines Planeten.',
    placement: 'planet_orbit',
    visualKey: 'station_orbital',
  },
  supply: {
    id: 'supply',
    name: 'Versorgungsstation',
    description: 'Depot für Treibstoff, Nahrung und Ersatzteile.',
    placement: 'planet_orbit',
    visualKey: 'station_supply',
  },
  research: {
    id: 'research',
    name: 'Forschungsstation',
    description: 'Laborplattform für Sensorik und Wissenschaft.',
    placement: 'planet_orbit',
    visualKey: 'station_research',
  },
  defense: {
    id: 'defense',
    name: 'Verteidigungsstation',
    description: 'Bewaffnete Plattform zur Sicherung eines Orbits.',
    placement: 'planet_orbit',
    visualKey: 'station_defense',
  },
  mining: {
    id: 'mining',
    name: 'Ressourcenabbaustation',
    description: 'Förderplattform an Asteroidengürteln oder Monden.',
    placement: 'system',
    visualKey: 'station_mining',
  },
  trade: {
    id: 'trade',
    name: 'Handelsaußenposten',
    description: 'Umschlagplatz für zivile und zwischenstaatliche Fracht.',
    placement: 'system',
    visualKey: 'station_trade',
  },
  logistics: {
    id: 'logistics',
    name: 'Logistischer Außenposten',
    description: 'Knotenpunkt für Versorgungsrouten und Flottenbewegungen.',
    placement: 'system',
    visualKey: 'station_logistics',
  },
};

export function getStationType(type: SpaceStationType): StationTypeDefinition {
  return STATION_CATALOG[type];
}

/** Stabile Stations-ID aus System, optionalem Planeten und Typpräfix. */
export function stationId(systemId: string, type: SpaceStationType, planetId?: string | null): string {
  return planetId
    ? `station_${systemId}_${planetId}_${type}`
    : `station_${systemId}_${type}`;
}
