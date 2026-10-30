/**
 * Astraea 4X - Zentrale Antriebs- und Bewegungsreichweite
 *
 * Die Reichweite eines Verbands wird aus vorhandenen Technologien abgeleitet.
 * Es werden keine neuen Forschungsbäume erfunden: Die Stufen hängen an bereits
 * existierenden Tech-IDs. Ohne Antriebstechnik bleibt es bei einem
 * Hyperlane-Sprung pro Runde – das ist die bestehende Bewegungsregel.
 */

export interface PropulsionTier {
  techId: string;
  label: string;
  /** Hyperlane-Sprünge pro Runde. */
  rangeHops: number;
}

export const BASE_PROPULSION_RANGE = 1;

export const PROPULSION_TIERS: readonly PropulsionTier[] = [
  { techId: 'fusion_reactors', label: 'Fusionsantrieb', rangeHops: 2 },
  { techId: 'gravitic_engineering', label: 'Gravitischer Antrieb', rangeHops: 3 },
  { techId: 'zero_point_physics', label: 'Nullpunkt-Antrieb', rangeHops: 4 },
];

/**
 * Normalisiert eine übergebene Reichweite auf ganze Hyperlane-Sprünge pro
 * Runde. Fehlende, negative oder nicht-endliche Werte fallen auf die
 * Basisreichweite zurück, damit ein Verband nie stillsteht und die
 * Rundenzählung deterministisch bleibt.
 */
export function normalizeRangeHops(rangeHops?: number): number {
  if (rangeHops === undefined || !Number.isFinite(rangeHops)) {
    return BASE_PROPULSION_RANGE;
  }
  return Math.max(BASE_PROPULSION_RANGE, Math.floor(rangeHops));
}

/**
 * Rundenzahl für eine Strecke von `hops` Hyperlane-Sprüngen bei gegebener
 * Reichweite. Analog zur ETA-Rechnung in Master of Orion 2: das Ziel wird in
 * der Runde erreicht, in der der letzte Sprung fällt, also aufgerundet.
 */
export function turnsForHops(hops: number, rangeHops?: number): number {
  if (!Number.isFinite(hops) || hops <= 0) return 0;
  return Math.ceil(hops / normalizeRangeHops(rangeHops));
}

export function getPropulsionRange(completedTechIds: readonly string[]): number {
  const completed = new Set(completedTechIds);
  let range = BASE_PROPULSION_RANGE;
  for (const tier of PROPULSION_TIERS) {
    if (completed.has(tier.techId)) {
      range = Math.max(range, tier.rangeHops);
    }
  }
  return range;
}

export function getPropulsionLabel(completedTechIds: readonly string[]): string {
  const completed = new Set(completedTechIds);
  let label = 'Standardantrieb';
  let range = BASE_PROPULSION_RANGE;
  for (const tier of PROPULSION_TIERS) {
    if (completed.has(tier.techId) && tier.rangeHops >= range) {
      range = tier.rangeHops;
      label = tier.label;
    }
  }
  return label;
}
