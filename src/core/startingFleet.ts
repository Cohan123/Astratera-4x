/**
 * Astraea 4X - Startflotte
 *
 * Jede Partie beginnt ohne Kolonie, aber mit drei einsatzbereiten Schiffen im
 * Heimatsystem: kleine Fregatte, Aufklärungsschiff und Kolonieschiff. Die
 * Kolonisten und Gründungsgüter liegen ausschließlich im Laderaum des
 * Kolonieschiffs – es gibt kein zweites, globales Lager.
 */

import { Fleet } from '../core/types.ts';
import { COLONIZATION_SUPPLY, ColonySupply } from '../core/colonizationRules.ts';

export interface StartingShipSpec {
  /** Deterministische Fleet-ID, damit Spielstände stabil bleiben. */
  key: string;
  shipDefId: 'frigate' | 'scout_ship' | 'colony_ship';
  name: string;
  cargo?: ColonySupply;
}

export const STARTING_SHIPS: StartingShipSpec[] = [
  {
    key: 'frigate',
    shipDefId: 'frigate',
    name: 'Fregatte »Aegis«',
  },
  {
    key: 'scout_ship',
    shipDefId: 'scout_ship',
    name: 'Aufklärer »Pioneer«',
  },
  {
    key: 'colony_ship',
    shipDefId: 'colony_ship',
    name: 'Kolonieschiff »Ark«',
    cargo: COLONIZATION_SUPPLY,
  },
];

export function startingFleetId(civId: string, key: string): string {
  return `fleet_${civId}_start_${key}`;
}

/** Erzeugt die drei Startverbände für ein System. */
export function createStartingFleets(
  civId: string,
  systemId: string,
  systemName?: string
): Fleet[] {
  return STARTING_SHIPS.map((spec) => ({
    id: startingFleetId(civId, spec.key),
    name: systemName ? `${spec.name} · ${systemName}` : spec.name,
    civId,
    systemId,
    ships: [{ shipDefId: spec.shipDefId, count: 1 }],
    status: 'stationed' as const,
    pathSystemIds: [],
    pathIndex: 0,
    destinationSystemId: null,
    cargo: spec.cargo ? { ...spec.cargo } : undefined,
  }));
}

/** Ein einzelnes, voll beladenes Kolonieschiff (Nachschub/Testaufbau). */
export function createColonyShipFleet(
  civId: string,
  systemId: string,
  options: { id?: string; name?: string; cargo?: ColonySupply } = {}
): Fleet {
  return {
    id: options.id ?? `fleet_${civId}_colony_${systemId}`,
    name: options.name ?? 'Kolonieschiff',
    civId,
    systemId,
    ships: [{ shipDefId: 'colony_ship', count: 1 }],
    status: 'stationed',
    pathSystemIds: [],
    pathIndex: 0,
    destinationSystemId: null,
    cargo: { ...(options.cargo ?? COLONIZATION_SUPPLY) },
  };
}
