/**
 * Astraea 4X - Testlabor-Registry
 *
 * Jeder Testballon ist eine eigenständige Komponente. Neue Tests werden durch
 * einen weiteren Eintrag ergänzt, ohne das Labor selbst zu verändern.
 */

import React from 'react';
import { SurfaceGeneratorBalloon } from './balloons/SurfaceGeneratorBalloon.tsx';

export interface TestBalloonProps {
  /** Rückkehr zur Testauswahl innerhalb des Labors. */
  onBackToMenu: () => void;
}

export interface TestBalloonDefinition {
  id: string;
  title: string;
  description: string;
  category: string;
  status: 'ready' | 'planned';
  component?: React.ComponentType<TestBalloonProps>;
  /** Kurzbeschreibung des geplanten Umfangs für noch nicht gebaute Ballons. */
  plannedNote?: string;
}

export const TEST_BALLOONS: TestBalloonDefinition[] = [
  {
    id: 'surface-generator',
    title: 'Prozedurale Planetenoberfläche',
    description:
      'Echten SurfaceGenerator mit Planetentyp, Breite, Höhe und Seed ausführen; Biom-, Ressourcen- und Höhendaten prüfen.',
    category: 'Weltgenerierung',
    status: 'ready',
    component: SurfaceGeneratorBalloon,
  },
  {
    id: 'biome-tiles',
    title: 'Biom-Tiles',
    description: 'Zuordnung der generierten Biome auf die vorhandenen Tileset-Dateien prüfen.',
    category: 'Weltgenerierung',
    status: 'planned',
    plannedNote:
      'Das Lava-Tileset ist integriert. Ein eigener Ballon könnte künftig alle Biomfamilien nebeneinander darstellen.',
  },
  {
    id: 'terrain-resources',
    title: 'Gelände & Ressourcen',
    description: 'Geländeeigenschaften, Bewegungsregeln und Deposit-Verteilung isoliert untersuchen.',
    category: 'Weltgenerierung',
    status: 'planned',
    plannedNote:
      'Die Grunddaten zeigt bereits der Oberflächenballon; ein eigener Ballon könnte gezielt Geländeregeln filtern.',
  },
  {
    id: 'colony',
    title: 'Kolonie & Gebäude',
    description: 'Koloniezentrum, Baukosten, Bauzeit und Aufwertungen ohne Kampagne testen.',
    category: 'Spielmechanik',
    status: 'planned',
    plannedNote:
      'Der Koloniezentrum-Bug ist behoben und durch Regressionstests abgedeckt; ein UI-Ballon folgt bei Bedarf.',
  },
  {
    id: 'movement',
    title: 'Bewegung & Routen',
    description: 'Bewegungsreichweiten und Routenplanung von Einheiten und Flotten prüfen.',
    category: 'Spielmechanik',
    status: 'planned',
    plannedNote: 'Die Engine-Tests decken Routen bereits ab; die interaktive Variante ist offen.',
  },
  {
    id: 'save-load',
    title: 'Speichern & Laden',
    description: 'Spielzustände serialisieren, wiederherstellen und Migrationen prüfen.',
    category: 'Persistenz',
    status: 'planned',
    plannedNote: 'Save-/Load-Tests existieren; ein Ballon könnte gezielt Einzelfelder vergleichen.',
  },
];

export function getTestBalloon(id: string): TestBalloonDefinition | null {
  return TEST_BALLOONS.find((balloon) => balloon.id === id) ?? null;
}
