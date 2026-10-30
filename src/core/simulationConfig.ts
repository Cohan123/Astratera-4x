/**
 * Astraea 4X - Zentrale Simulationskonstanten
 * Bündelt zeitliche und orbitalmechanische Faktoren, damit Balancing
 * an einer Stelle erfolgt und nicht über Engine- und UI-Code verteilt ist.
 */

/**
 * Globaler Faktor für die Winkelgeschwindigkeit von Planetenumlaufbahnen.
 * 1.0 entspricht dem bisherigen Tempo; 0.8 lässt Planeten 20 % langsamer
 * um den Stern wandern, ohne Umlaufbahnen, Radien oder Zugreihenfolge zu ändern.
 */
export const ORBITAL_SPEED_FACTOR = 0.8;

/**
 * Berechnet den Winkelzuwachs eines Planeten pro Runde.
 * Die Umlaufdauer wird in Runden umgerechnet (30 Tage pro Runde) und auf
 * mindestens 20 Runden begrenzt, damit innere Planeten nicht springen.
 */
export function computeOrbitalAngleDelta(
  orbitalPeriodDays: number,
  speedFactor: number = ORBITAL_SPEED_FACTOR
): number {
  const turnsPerOrbit = Math.max(20, orbitalPeriodDays / 30);
  return ((Math.PI * 2) / turnsPerOrbit) * speedFactor;
}
