/**
 * Astraea 4X - Darstellung von Spielende und Zielanzeige
 *
 * Reine Server-Render-Tests: Sie prüfen die Texte und Zustände der neuen
 * Oberflächen, ohne Browser oder Testbibliothek. Damit ist abgesichert, dass
 * Sieg, Niederlage, Punkte und Fortschritt tatsächlich sichtbar werden.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { GameOutcome } from '../src/core/types.ts';
import type { VictoryOverview } from '../src/core/victoryManager.ts';
import { EndScreen } from '../src/ui/components/EndScreen.tsx';
import { VictoryModal } from '../src/ui/components/VictoryModal.tsx';

const noop = () => undefined;

const victoryOutcome: GameOutcome = {
  status: 'victory',
  condition: 'science',
  turn: 52,
  score: 321,
  breakdown: [
    { id: 'colonies', label: 'Kolonien (je 50)', points: 250 },
    { id: 'technology', label: 'Technologien (je 10)', points: 71 },
  ],
  peakColonyCount: 6,
  ranking: [
    {
      civId: 'player-empire',
      civName: 'Vereinte Solare Konföderation',
      isPlayer: true,
      score: 321,
      colonies: 6,
      population: 12_000,
      technologies: 17,
    },
    {
      civId: 'orion-combine',
      civName: 'Orion-Bergbau-Konsortium',
      isPlayer: false,
      score: 180,
      colonies: 1,
      population: 3_000,
      technologies: 2,
    },
  ],
};

const defeatOutcome: GameOutcome = {
  ...victoryOutcome,
  status: 'defeat',
  condition: 'elimination',
  turn: 31,
  score: 40,
  breakdown: [{ id: 'technology', label: 'Technologien (je 10)', points: 40 }],
  ranking: [
    {
      civId: 'orion-combine',
      civName: 'Orion-Bergbau-Konsortium',
      isPlayer: false,
      score: 180,
      colonies: 1,
      population: 3_000,
      technologies: 2,
    },
  ],
};

const overview: VictoryOverview = {
  outcome: {
    status: 'ongoing',
    condition: null,
    turn: null,
    score: 0,
    breakdown: [],
    peakColonyCount: 4,
    ranking: [],
  },
  currentTurn: 20,
  score: 210,
  breakdown: [{ id: 'colonies', label: 'Kolonien (je 50)', points: 200 }],
  ranking: victoryOutcome.ranking,
  objectives: [
    {
      id: 'domination',
      name: 'Dominanz',
      description: 'Kontrolliere mindestens 60 % aller besiedelten Systeme.',
      progress: 0.5,
      currentLabel: '4 / 8 Kolonien · 50 % der besiedelten Systeme',
      targetLabel: '60 % und 8 Kolonien',
      completed: false,
    },
    {
      id: 'science',
      name: 'Transzendenz',
      description: 'Vervollständige drei Technologien der höchsten Stufe.',
      progress: 1,
      currentLabel: '3 / 3 Tier-4-Technologien',
      targetLabel: '3 Tier-4-Technologien',
      completed: true,
    },
    {
      id: 'narrative',
      name: 'Chronik',
      description: 'Schließe drei Ausgrabungen ab und dämme die Krise ein.',
      progress: 0.25,
      currentLabel: '1 / 3 Ausgrabungen · Krise: Signal',
      targetLabel: '3 Ausgrabungen und Krise eingedämmt',
      completed: false,
    },
  ],
  playerColonyCount: 4,
  totalSettledSystems: 8,
  peakColonyCount: 4,
};

describe('EndScreen', () => {
  it('zeigt Sieg, Bedingung, Punkte und Rangliste', () => {
    const html = renderToStaticMarkup(
      <EndScreen outcome={victoryOutcome} onReturnToMenu={noop} onNewGame={noop} onContinue={noop} />
    );

    expect(html).toContain('Sieg');
    expect(html).toContain('Transzendenz');
    expect(html).toContain('321');
    expect(html).toContain('Vereinte Solare Konföderation');
    expect(html).toContain('Orion-Bergbau-Konsortium');
    expect(html).toContain('Weiterspielen (Sandbox)');
    expect(html).toContain('Hauptmenü');
    expect(html).toContain('Runde 52');
  });

  it('zeigt die Niederlage ohne Weiterspielen-Schaltfläche', () => {
    const html = renderToStaticMarkup(
      <EndScreen
        outcome={defeatOutcome}
        onReturnToMenu={noop}
        onNewGame={noop}
        onContinue={noop}
      />
    );

    expect(html).toContain('Niederlage');
    expect(html).toContain('Auslöschung');
    expect(html).not.toContain('Weiterspielen (Sandbox)');
  });
});

describe('VictoryModal', () => {
  it('rendert geschlossen nichts', () => {
    expect(
      renderToStaticMarkup(<VictoryModal isOpen={false} overview={overview} onClose={noop} />)
    ).toBe('');
  });

  it('zeigt Fortschritt, Punkte und Rangliste', () => {
    const html = renderToStaticMarkup(
      <VictoryModal isOpen overview={overview} onClose={noop} />
    );

    expect(html).toContain('Ziele &amp; Punkte');
    expect(html).toContain('Runde 20');
    expect(html).toContain('Dominanz');
    expect(html).toContain('Transzendenz');
    expect(html).toContain('Chronik');
    expect(html).toContain('4 / 8 Kolonien');
    expect(html).toContain('ERFÜLLT');
    expect(html).toContain('Rangliste');
    expect(html).toContain('Punkteaufschlüsselung');
  });

  it('meldet fehlende Zieldaten', () => {
    const html = renderToStaticMarkup(
      <VictoryModal isOpen overview={null} onClose={noop} />
    );
    expect(html).toContain('Keine Zieldaten verfügbar');
  });
});
