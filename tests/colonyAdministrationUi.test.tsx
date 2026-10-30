/**
 * Astraea 4X - Kolonieverwaltung: Tabs
 *
 * Reine Server-Render-Tests für die Verwaltungsoberfläche. Sie sichern ab,
 * dass die geforderten Bereiche "Steuern" und "Bevölkerung" sichtbar sind,
 * einstellbare Werte anzeigen und über die Tab-Leiste erreichbar bleiben.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Colony } from '../src/core/types.ts';
import {
  ColonyManagementModal,
  type ColonyModalTab,
} from '../src/ui/components/ColonyManagementModal.tsx';

const noop = () => undefined;

function makeColony(overrides: Partial<Colony> = {}): Colony {
  return {
    id: 'colony-test',
    name: 'Testhafen',
    planetId: 'SYS-0001-P1',
    systemId: 'SYS-0001',
    civId: 'player-empire',
    factionId: 'player',
    foundedTurn: 3,
    foundedDate: '2187-03-01',
    developmentTier: 'settlement',
    status: 'active',
    cityCenterCoord: { q: 0, r: 0 },
    claimedHexKeys: ['0,0', '1,0'],
    workedHexKeys: ['0,0', '1,0'],
    workFocus: 'balanced',
    population: 4,
    growthFoodProgress: 20,
    growthFoodRequired: 50,
    stockpile: {
      food: 12,
      minerals: 30,
      rareResources: 2,
      energyBalance: 0,
      influence: 1,
    },
    netYields: {
      food: 10,
      production: 3,
      energy: 4,
      minerals: 2,
      rareResources: 0,
      research: 1,
      influence: 1,
    },
    grossYields: {
      food: 18,
      production: 3,
      energy: 4,
      minerals: 2,
      rareResources: 0,
      research: 1,
      influence: 1,
    },
    upkeep: { energy: 0, minerals: 0, credits: 2 },
    energyDeficit: false,
    buildings: [],
    buildQueue: [],
    influenceRate: 1,
    researchOutput: 1,
    taxRate: 30,
    corruption: 0.2,
    approval: 55,
    taxRevenue: 4.7,
    sizeClass: 2,
    ...overrides,
  };
}

function renderModal(initialTab: ColonyModalTab, colony = makeColony()): string {
  return renderToStaticMarkup(
    <ColonyManagementModal
      isOpen
      colony={colony}
      surface={null}
      habitabilityPercent={80}
      initialTab={initialTab}
      onClose={noop}
      onQueueBuilding={noop}
      onQueueUpgrade={noop}
      onQueueUnit={noop}
      onSetWorkFocus={noop}
      treasury={100}
      onSetTaxRate={noop}
    />
  );
}

describe('Kolonieverwaltung: Tabs', () => {
  it('1. Zeigt die Verwaltungsbereiche Steuern und Bevölkerung in der Tab-Leiste', () => {
    const html = renderModal('overview');

    expect(html).toContain('Übersicht');
    expect(html).toContain('Steuern');
    expect(html).toContain('Bevölkerung');
    expect(html).toContain('Bauplätze');
    expect(html).toContain('Bauwarteschlange');
    expect(html).toContain('Rekrutierung');
  });

  it('2. Steuern-Tab bietet Regler, Voreinstellungen und Projektion', () => {
    const html = renderModal('tax');

    expect(html).toContain('Steuersatz festlegen');
    expect(html).toContain('aria-label="Steuersatz der Kolonie"');
    expect(html).toContain('Steuereinnahmen');
    expect(html).toContain('Korruption');
    expect(html).toContain('Privatsektor');
    expect(html).toContain('Netto dieser Kolonie');
    expect(html).toContain('Staatskasse nach nächster Runde');
    expect(html).toContain('Zufriedenheit');
    expect(html).toContain('45%');
    expect(html).toContain('Wachstumsfaktor');
  });

  it('3. Steuern-Tab zeigt den aktuellen Satz der Kolonie', () => {
    const html = renderModal('tax', makeColony({ taxRate: 45, approval: 38 }));

    expect(html).toContain('45% von 0–60%');
    expect(html).toContain('Unruhe: Wachstum und Steuermoral leiden.');
  });

  it('4. Bevölkerung-Tab zeigt Wachstum, Arbeitskräfte und Fokuswahl', () => {
    const html = renderModal('population');

    expect(html).toContain('Bevölkerung');
    expect(html).toContain('4 Pops');
    expect(html).toContain('Bevölkerungswachstum (Nahrungsüberschuss)');
    expect(html).toContain('Nächste Runde: +');
    expect(html).toContain('Arbeitskräfte-Verteilung');
    expect(html).toContain('Ungebundene Arbeitskräfte');
    expect(html).toContain('Agrar-Schwerpunkt');
    expect(html).toContain('Automatisierte Bürger-Priorisierung');
  });

  it('5. Übersicht verlinkt direkt in Steuern und Bevölkerung', () => {
    const html = renderModal('overview');

    expect(html).toContain('Steuern anpassen');
    expect(html).toContain('Bevölkerung verwalten');
    expect(html).toContain('Territorium &amp; Bauplätze');
  });

  it('6. Bauplätze-Tab zeigt die Slot-Zusammenfassung', () => {
    const html = renderModal('buildings');

    expect(html).toContain('Freie Bauplätze');
    expect(html).toContain('Durch Distrikte belegt');
    expect(html).toContain('Errichtete Gebäude');
    expect(html).toContain('Noch keine Gebäude errichtet.');
  });

  it('7. Bauplätze-Tab zeigt die grafische Kolonieansicht mit Gebäuden und Baustellen', () => {
    const colony = makeColony({
      buildings: [
        {
          id: 'b-center',
          colonyId: 'colony-test',
          hexCoord: { q: 0, r: 0 },
          buildingDefId: 'city_center',
          level: 2,
          isActive: true,
        },
        {
          id: 'b-hydro',
          colonyId: 'colony-test',
          hexCoord: { q: 1, r: 0 },
          buildingDefId: 'hydroponics_dome',
          level: 1,
          isActive: true,
        },
      ],
      buildQueue: [
        {
          id: 'proj-solar',
          colonyId: 'colony-test',
          type: 'building',
          defId: 'solar_array',
          targetHexCoord: { q: 1, r: 0 },
          name: 'Solar-Kollektorfeld',
          investedProduction: 10,
          requiredProduction: 40,
          mineralCost: 25,
          rareCost: 0,
          turnStarted: 2,
        },
      ],
    });
    const html = renderModal('buildings', colony);

    expect(html).toContain('Stadtansicht');
    expect(html).toContain('data-testid="colony-skyline"');
    expect(html).toContain('data-palette="temperate"');
    // Hydrokuppel als Halbkugel-Silhouette, Kolonie-Zentrum als eigener Typ
    expect(html).toContain('data-building-kind="hydro_dome"');
    expect(html).toContain('data-building-kind="city_center"');
    expect(html).toContain('Hydrokultur-Kuppel');
    // Laufendes Bauprojekt erscheint als Baustelle mit Fortschritt
    expect(html).toContain('data-construction="true"');
    expect(html).toContain('im Bau (25 %)');
    expect(html).toContain('2 Gebäude errichtet');
    expect(html).toContain('1 im Bau');
  });

  it('8. Geschlossene Verwaltung rendert nichts', () => {
    const html = renderToStaticMarkup(
      <ColonyManagementModal
        isOpen={false}
        colony={makeColony()}
        surface={null}
        onClose={noop}
        onQueueBuilding={noop}
        onQueueUpgrade={noop}
        onQueueUnit={noop}
        onSetWorkFocus={noop}
      />
    );

    expect(html).toBe('');
  });
});
