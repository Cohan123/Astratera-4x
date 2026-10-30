/**
 * Astraea 4X - Klickauflösung der Planetenoberfläche
 *
 * Reine Entscheidungshilfe für `PlanetSurfaceCanvas`: Sie legt fest, ob ein
 * Klick einen Einheitentoken auswählt, die Auswahl aufhebt, eine Kolonie
 * öffnet, eine Bewegung auslöst oder nur die Kachel auswählt. Die GUI führt
 * danach ausschließlich die hier bestimmte Aktion aus.
 */

export interface SurfaceClickContext {
  /** Direkt getroffener Einheitentoken (Trefferradius), sonst null. */
  clickedUnitId: string | null;
  /** Aktuell ausgewählte Einheit, sonst null. */
  selectedUnitId: string | null;
  /** Liegt der Klick auf einem Stadtzentrum? */
  isCityCenter: boolean;
  /** Zugehörige Kolonie des Stadtzentrums, falls bekannt. */
  cityColonyId: string | null;
  /** Ist die Kolonieverwaltung als Klickziel verfügbar? */
  hasColonyManagement: boolean;
  /** Einheit, die auf der angeklickten Kachel steht (ohne Token-Treffer). */
  unitOnTileId: string | null;
  /** Kann die ausgewählte Einheit über die Karte bewegt werden? */
  canMoveSelectedUnit: boolean;
}

export type SurfaceClickAction =
  | { kind: 'select-unit'; unitId: string }
  | { kind: 'deselect-unit' }
  | { kind: 'open-colony'; colonyId: string }
  | { kind: 'move-unit' }
  | { kind: 'select-hex' };

export function resolveSurfaceClick(context: SurfaceClickContext): SurfaceClickAction {
  const { clickedUnitId, selectedUnitId } = context;

  // Ein Token hat Vorrang vor allem anderen. Erneutes Anklicken derselben
  // Einheit hebt die Auswahl auf; eine andere Einheit übernimmt die Auswahl.
  if (clickedUnitId) {
    return clickedUnitId === selectedUnitId
      ? { kind: 'deselect-unit' }
      : { kind: 'select-unit', unitId: clickedUnitId };
  }

  // Stadtzentren öffnen die Verwaltung und lösen niemals einen Zug aus.
  if (context.isCityCenter && context.cityColonyId && context.hasColonyManagement) {
    return { kind: 'open-colony', colonyId: context.cityColonyId };
  }

  if (selectedUnitId) {
    // Steht eine Einheit auf der Kachel, wird umgeschaltet statt bewegt.
    if (context.unitOnTileId) {
      return context.unitOnTileId === selectedUnitId
        ? { kind: 'deselect-unit' }
        : { kind: 'select-unit', unitId: context.unitOnTileId };
    }
    // Freie Kachel: bestehendes Bedienkonzept – Klick ist Bewegungsbefehl.
    if (context.canMoveSelectedUnit) return { kind: 'move-unit' };
  }

  // Ohne ausgewählte Einheit (oder ohne Bewegungsmöglichkeit) öffnet der Klick
  // die Kachelinformationen.
  return { kind: 'select-hex' };
}
