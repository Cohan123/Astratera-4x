/**
 * Astraea 4X - Planetengenerierungs-Konfiguration
 *
 * Zentrale Seltenheitsgewichte. Xenowelten sind bewusst kein eigener
 * Generierungsdurchlauf: Ihr Gewicht fließt direkt in die vorhandene
 * `pickWeighted`-Ziehung nach Zone und Sternklasse ein. Dadurch bleibt die
 * Generierung deterministisch und verbraucht keine zusätzliche Zufallsziehung.
 */

export const PLANET_GENERATION_CONFIG = {
  /**
   * Gewicht einer Xenowelt innerhalb einer Zonenziehung. Die übrigen
   * Zonengewichte liegen bei 60-100; 0,35 entspricht damit deutlich unter
   * einem Prozent pro Planet. Über sehr viele Systeme bleibt die Häufigkeit
   * niedrig und reproduzierbar.
   */
  xenoworldWeight: {
    inner: 0.1,
    habitable: 0.35,
    outer: 0.5,
  },
} as const;

/** Nur für Anzeige/Tests: grobe Obergrenze der Xenowelt-Häufigkeit. */
export const XENOWORLD_RARITY_NOTE =
  'Xenowelten sind extrem selten und erscheinen im Durchschnitt in weniger als 1 % aller Planeten.';
