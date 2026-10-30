/**
 * Astraea 4X - GUI-Überarbeitung (Kommando, Tiles, Kachel-Infos)
 *
 * Deckt die reine Klickauflösung der Planetenoberfläche, die zentrale
 * Asset-Zuordnung von Kolonie- und Schiffsgrafiken, das dreispaltige
 * Kolonie-Kommando inklusive Stufenaufwertung sowie das Kachel-Info-Panel ab.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GameEngine } from '../src/core/GameEngine.ts';
import { COLONY_TIER_LABELS } from '../src/core/colonyManager.ts';
import type {
  Colony,
  Fleet,
  PlanetHexTile,
  PlanetSurface,
  SurfaceUnit,
} from '../src/core/types.ts';
import { ColonyManagementModal } from '../src/ui/components/ColonyManagementModal.tsx';
import { HexTileInspector } from '../src/ui/components/HexTileInspector.tsx';
import { ShipInfoBar } from '../src/ui/components/ShipInfoBar.tsx';
import {
  COLONY_TILE_FILE_BY_TIER,
  getColonyTileAssetCount,
  getColonyTileFileNames,
  getColonyTileUrl,
  getUnmappedColonyTileFileNames,
} from '../src/ui/colonyTileAssets.ts';
import { getShipArt, getShipArtFileNames, getUnmappedShipArtFileNames } from '../src/ui/shipAssets.ts';
import { resolveSurfaceClick } from '../src/ui/surfaceSelection.ts';

const noop = () => undefined;

function makeColony(overrides: Partial<Colony> = {}): Colony {
  return {
    id: 'colony-gui',
    name: 'Neuhafen',
    planetId: 'PLANET-1',
    systemId: 'SYS-1',
    civId: 'player-empire',
    factionId: 'player',
    foundedTurn: 2,
    foundedDate: '2187-02-01',
    developmentTier: 'outpost',
    status: 'active',
    cityCenterCoord: { q: 0, r: 0 },
    claimedHexKeys: ['0,0', '1,0'],
    workedHexKeys: ['0,0'],
    workFocus: 'balanced',
    population: 1000,
    growthFoodProgress: 0,
    growthFoodRequired: 50,
    stockpile: { food: 30, minerals: 60, rareResources: 10, energyBalance: 2, influence: 20 },
    netYields: {
      food: 2,
      production: 2,
      energy: 2,
      minerals: 2,
      rareResources: 0,
      research: 1,
      influence: 2,
    },
    grossYields: {
      food: 4,
      production: 2,
      energy: 2,
      minerals: 2,
      rareResources: 0,
      research: 1,
      influence: 2,
    },
    upkeep: { energy: 0, minerals: 0, credits: 0.2 },
    energyDeficit: false,
    buildings: [
      {
        id: 'bld-center',
        colonyId: 'colony-gui',
        hexCoord: { q: 0, r: 0 },
        buildingDefId: 'city_center',
        level: 1,
        isActive: true,
      },
    ],
    buildQueue: [],
    influenceRate: 2,
    researchOutput: 1,
    taxRate: 30,
    corruption: 0,
    approval: 55,
    taxRevenue: 1,
    sizeClass: 3,
    ...overrides,
  };
}

function renderModal(overrides: Partial<Colony> = {}): string {
  return renderToStaticMarkup(
    <ColonyManagementModal
      isOpen
      colony={makeColony(overrides)}
      surface={null}
      habitabilityPercent={80}
      initialTab="overview"
      onClose={noop}
      onQueueBuilding={noop}
      onQueueUpgrade={noop}
      onQueueUnit={noop}
      onSetWorkFocus={noop}
      treasury={100}
      onSetTaxRate={noop}
      onUpgradeTier={() => ({ success: false, reason: 'Test' })}
    />
  );
}

function makeTile(overrides: Partial<PlanetHexTile> = {}): PlanetHexTile {
  return {
    coord: { q: 1, r: 1 },
    key: '1,1',
    biome: 'plains',
    elevation: 1,
    deposit: 'none',
    isDepositDiscovered: false,
    hasHazard: false,
    claimedByColonyId: null,
    claimedByCivId: null,
    isCityCenter: false,
    isWorked: false,
    isWorkPrioritized: false,
    isWorkLocked: false,
    buildingInstanceId: null,
    visibility: 'visible',
    terraformedStatus: 'native',
    ...overrides,
  };
}

function makeSurface(tiles: PlanetHexTile[]): PlanetSurface {
  return {
    planetId: 'PLANET-1',
    width: 4,
    height: 4,
    generatorVersion: 4,
    seed: 'GUI-OVERHAUL',
    tiles,
  };
}

function makeUnit(overrides: Partial<SurfaceUnit> = {}): SurfaceUnit {
  return {
    id: 'unit-1',
    civId: 'player-empire',
    unitDefId: 'pioneer',
    name: 'Pionier',
    planetId: 'PLANET-1',
    hexCoord: { q: 1, r: 1 },
    movementPointsRemaining: 2,
    maxMovementPoints: 2,
    health: 30,
    maxHealth: 30,
    isFortified: false,
    ...overrides,
  };
}

function renderInspector(options: {
  tile: PlanetHexTile;
  colony?: Colony | null;
  unitsOnTile?: SurfaceUnit[];
  selectedUnit?: SurfaceUnit | null;
}): string {
  return renderToStaticMarkup(
    <HexTileInspector
      tile={options.tile}
      surface={makeSurface([options.tile])}
      colony={options.colony ?? null}
      unitsOnTile={options.unitsOnTile ?? []}
      selectedUnit={options.selectedUnit ?? null}
      completedTechIds={[]}
      onClaimHex={noop}
      onOpenBuildMenu={noop}
      onUpgradeBuilding={noop}
      onPlaceDistrict={noop}
      onRemoveDistrict={noop}
      onSelectUnit={noop}
      onClose={noop}
    />
  );
}

function foundPlayerColony(engine: GameEngine, seed: string): Colony {
  engine.generateNewGalaxy({ seed });
  const sys = engine.getGalaxy().systems[0];
  engine.selectSystem(sys.id);
  engine.surveySystem(sys.id);
  const planet = sys.planets.find((p) => p.planetType !== 'gas_giant') || sys.planets[0];
  planet.planetType = 'ocean';
  planet.surveyStatus = 'analyzed';
  planet.radiationHazard = 'negligible';
  planet.colonizationStatus = 'uncolonized';
  planet.colonyId = null;
  planet.surfaceTemperatureK = 292;
  planet.temperatureCategory = 'temperate';
  planet.atmosphere = 'breathable';
  planet.waterAvailability = 'liquid_ocean';
  planet.gravityG = 1;
  planet.gravityCategory = 'standard';
  planet.geologicalStability = 'stable';
  planet.habitability = 90;
  planet.habitabilityTier = 'ideal';

  const result = engine.foundColony(planet.id, 'GUI-Prime');
  expect(result.success).toBe(true);
  return result.colony!;
}

describe('Kolonie- und Schiffsgrafiken', () => {
  it('1. bindet genau die drei Kolonie-Stufengrafiken ein und ordnet sie den Stufen zu', () => {
    expect(getColonyTileAssetCount()).toBe(3);
    expect(getColonyTileFileNames()).toEqual([
      'Start_Kolonie.png',
      'Stufe_2_Kolonie.png',
      'Stufe_3_Kolonie.png',
    ]);
    expect(getUnmappedColonyTileFileNames()).toEqual([]);

    const urls = (['outpost', 'settlement', 'colony'] as const).map((tier) => {
      expect(COLONY_TILE_FILE_BY_TIER[tier]).toBeTruthy();
      const url = getColonyTileUrl(tier);
      expect(url).toBeTruthy();
      return url;
    });
    expect(new Set(urls).size).toBe(3);
  });

  it('2. verwendet die aktualisierten Schiffsbilder und markiert Fallbacks', () => {
    expect(getShipArtFileNames()).toEqual([
      'Forschung.jpeg',
      'Fregatte.png',
      'Kolonie.jpg',
      'Transporter.png',
      'schlachtschiff.png',
    ]);

    const frigate = getShipArt('frigate');
    const cruiser = getShipArt('cruiser');
    const scout = getShipArt('scout');
    const colony = getShipArt('colony');

    expect(frigate.url).toBeTruthy();
    expect(frigate.url).toContain('Fregatte.png');
    expect(cruiser.url).toBeTruthy();
    expect(cruiser.url).toContain('schlachtschiff.png');
    expect(scout.url).toContain('Forschung.jpeg');
    expect(colony.url).toContain('Kolonie.jpg');

    for (const fallbackClass of ['corvette', 'destroyer']) {
      const art = getShipArt(fallbackClass);
      expect(art.fallback).toBe(true);
      expect(art.url).toBe(frigate.url);
    }
    expect(frigate.fallback).toBe(false);
    expect(cruiser.fallback).toBe(false);

    // Nicht zugeordnete Datei wird dokumentiert, nicht stillschweigend erfunden.
    expect(getUnmappedShipArtFileNames()).toEqual(['Transporter.png']);
  });
});

describe('Klickauflösung der Planetenoberfläche', () => {
  const base = {
    clickedUnitId: null,
    selectedUnitId: null,
    isCityCenter: false,
    cityColonyId: null,
    hasColonyManagement: true,
    unitOnTileId: null,
    canMoveSelectedUnit: true,
  };

  it('3. erneuter Klick auf dieselbe Einheit hebt die Auswahl auf', () => {
    expect(
      resolveSurfaceClick({ ...base, clickedUnitId: 'unit-1', selectedUnitId: 'unit-1' })
    ).toEqual({ kind: 'deselect-unit' });
    expect(
      resolveSurfaceClick({ ...base, clickedUnitId: 'unit-1', selectedUnitId: 'unit-2' })
    ).toEqual({ kind: 'select-unit', unitId: 'unit-1' });
  });

  it('4. Klick auf die Kachel der ausgewählten Einheit hebt die Auswahl auf', () => {
    expect(
      resolveSurfaceClick({ ...base, selectedUnitId: 'unit-1', unitOnTileId: 'unit-1' })
    ).toEqual({ kind: 'deselect-unit' });
    expect(
      resolveSurfaceClick({ ...base, selectedUnitId: 'unit-1', unitOnTileId: 'unit-2' })
    ).toEqual({ kind: 'select-unit', unitId: 'unit-2' });
  });

  it('5. freie Kachel bewegt die ausgewählte Einheit; ohne Auswahl öffnet sie die Kachelinfo', () => {
    expect(resolveSurfaceClick({ ...base, selectedUnitId: 'unit-1' })).toEqual({
      kind: 'move-unit',
    });
    expect(resolveSurfaceClick({ ...base, selectedUnitId: 'unit-1', canMoveSelectedUnit: false })).toEqual({
      kind: 'select-hex',
    });
    expect(resolveSurfaceClick(base)).toEqual({ kind: 'select-hex' });
  });

  it('6. Stadtzentrum öffnet die Kolonieverwaltung statt eines Zuges', () => {
    expect(
      resolveSurfaceClick({
        ...base,
        isCityCenter: true,
        cityColonyId: 'colony-1',
        selectedUnitId: 'unit-1',
      })
    ).toEqual({ kind: 'open-colony', colonyId: 'colony-1' });
  });
});

describe('Kolonie-Kommando: Layout und Stufenaufwertung', () => {
  it('7. zeigt Ressourcen links, Navigation rechts und den Inhalt dazwischen', () => {
    const html = renderModal();

    expect(html).toContain('Ressourcen der Kolonie');
    expect(html).toContain('aria-label="Kolonieverwaltung"');
    expect(html).toContain('data-colony-tab="overview"');
    expect(html).toContain('order-2 lg:order-1'); // Ressourcen-Rail
    expect(html).toContain('order-1 lg:order-3'); // Navigation
    expect(html).toContain('order-3 lg:order-2'); // Inhalt
    expect(html).toContain('Staatskasse');
  });

  it('8. zeigt Stufe, Voraussetzungen, Kosten und konkrete Ablehnungsgründe', () => {
    const html = renderModal();

    expect(html).toContain('data-colony-center-panel');
    expect(html).toContain('Koloniezentrum');
    expect(html).toContain(COLONY_TIER_LABELS.outpost);
    expect(html).toContain('Aufwertung zu');
    expect(html).toContain('Bevölkerung');
    expect(html).toContain('Fehlt:');
    expect(html).toContain('Voraussetzungen nicht erfüllt');
    expect(html).toContain('Mineralien');
    expect(html).toContain('Einfluss');
    expect(html).toContain('abgezogen');
  });
});

describe('Kachel-Informationsfenster', () => {
  it('9. zeigt Gelände, Erträge und den ausdrücklichen Hinweis auf fehlende Vorkommen', () => {
    const html = renderInspector({ tile: makeTile() });

    expect(html).toContain('Topografie &amp; Umgebung');
    expect(html).toContain('Sektor-Grundertrag');
    expect(html).toContain('Geologische Vorkommen');
    expect(html).toContain('Keine besonderen Ressourcenvorkommen.');
    expect(html).toContain('Bebauungsstatus');
    expect(html).toContain('Unbebaut');
    expect(html).toContain('aria-label="Kachelinformationen schließen"');
  });

  it('10. zeigt Bebauung, Koloniezentrum und Einheiten-Abwahl', () => {
    const colony = makeColony({ developmentTier: 'settlement', population: 2500 });
    const cityTile = makeTile({
      isCityCenter: true,
      claimedByColonyId: colony.id,
      claimedByCivId: 'player-empire',
      buildingInstanceId: 'bld-center',
    });
    const unit = makeUnit();
    const html = renderInspector({
      tile: cityTile,
      colony,
      unitsOnTile: [unit],
      selectedUnit: unit,
    });

    expect(html).toContain('Koloniezentrum');
    expect(html).toContain(COLONY_TIER_LABELS.settlement);
    expect(html).toContain('Gebäudestufe');
    expect(html).toContain('Auswahl aufheben');
    expect(html).toContain('Stationierte Truppen');
  });
});

describe('Koloniezentrum-Aufwertung über die Engine', () => {
  it('11. zieht Kosten ab, erhöht die Stufe und übersteht Speichern/Laden', () => {
    const engine = GameEngine.getInstance();
    const colony = foundPlayerColony(engine, 'GUI-TIER-SAVE');
    colony.population = 6000;
    colony.stockpile.minerals = 500;
    colony.stockpile.rareResources = 100;
    colony.stockpile.influence = 100;

    const res = engine.upgradeColonyTier(colony.id);
    expect(res.success).toBe(true);
    expect(colony.developmentTier).toBe('settlement');
    // Anforderungen Siedlung: 2000 Pop, 60 Mineralien, 0 Seltene, 10 Einfluss.
    expect(colony.stockpile.minerals).toBe(440);
    expect(colony.stockpile.rareResources).toBe(100);
    expect(colony.stockpile.influence).toBe(90);

    const payload = JSON.parse(JSON.stringify(engine.createSavePayload('Tier-Test')));
    engine.generateNewGalaxy({ seed: 'GUI-TIER-OTHER' });
    expect(engine.restoreFromSaveData(payload)).toBe(true);

    const restored = engine.getColonies().find((c) => c.id === colony.id)!;
    expect(restored.developmentTier).toBe('settlement');
    expect(restored.stockpile.minerals).toBe(440);
    expect(restored.stockpile.influence).toBe(90);
  });

  it('12. lehnt eine Aufwertung mit konkretem Grund ab und verändert nichts', () => {
    const engine = GameEngine.getInstance();
    const colony = foundPlayerColony(engine, 'GUI-TIER-FAIL');
    colony.population = 1000;
    colony.stockpile.minerals = 500;
    colony.stockpile.rareResources = 100;
    colony.stockpile.influence = 100;
    const before = { ...colony.stockpile };

    const res = engine.upgradeColonyTier(colony.id);
    expect(res.success).toBe(false);
    expect(res.reason).toContain('Bevölkerung');
    expect(colony.developmentTier).toBe('outpost');
    expect(colony.stockpile).toEqual(before);
  });
});

describe('Schiffsleiste: neue Grafik ohne Abschneiden', () => {
  function makeFleet(shipDefId: string): Fleet {
    return {
      id: `fleet-${shipDefId}`,
      name: 'Testverband',
      civId: 'player-empire',
      systemId: 'sys-1',
      ships: [{ shipDefId, count: 1 }],
      status: 'stationed',
      pathSystemIds: [],
      pathIndex: 0,
      destinationSystemId: null,
    };
  }

  it('13. zeigt das Fregattenbild vollständig per object-contain', () => {
    const html = renderToStaticMarkup(<ShipInfoBar fleet={makeFleet('frigate')} />);

    expect(html).toContain('data-ship-info-bar');
    expect(html).toContain('object-contain');
    expect(html).not.toContain('object-cover');
    expect(html).toContain('Fregatte.png');
    expect(html).toContain('alt="Fregatte"');
  });

  it('14. nutzt für den Kreuzer das Schlachtschiff-Rendering', () => {
    const html = renderToStaticMarkup(<ShipInfoBar fleet={makeFleet('cruiser')} />);

    expect(html).toContain('schlachtschiff.png');
    expect(html).toContain('alt="Kreuzer"');
    expect(html).toContain('object-contain');
  });
});

describe('Kachel-Info: Gefahr und echte Zusatzerträge', () => {
  it('15. zeigt Geländegefahr und Terraforming-Status', () => {
    const html = renderInspector({
      tile: makeTile({
        hasHazard: true,
        hazardDescription: 'Instabiler Vulkangrund',
        terraformedStatus: 'improved',
      }),
    });

    expect(html).toContain('Gefahr:');
    expect(html).toContain('Instabiler Vulkangrund');
    expect(html).toContain('Terraforming:');
    expect(html).toContain('Verbessert');
  });

  it('16. leitet Zusatzerträge aus dem echten Deposit-Katalog ab', () => {
    const html = renderInspector({
      tile: makeTile({ deposit: 'deep_mineral_vein', isDepositDiscovered: true }),
    });

    expect(html).toContain('Reiche Erzader');
    expect(html).toContain('Zusatzertrag:');
    expect(html).toContain('+4 Mineralien');
    expect(html).toContain('+1 Produktion');
    expect(html).not.toContain('Keine besonderen Ressourcenvorkommen.');
  });
});
