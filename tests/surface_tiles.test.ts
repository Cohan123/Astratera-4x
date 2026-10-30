/**
 * Astraea 4X - Surface Tile Mapping Test Suite (ADR-049)
 * Prüft die reine Zuordnung von Biom, Klima und Wasser auf Tileset-Namen sowie
 * die Platzhalter für Lavawelten, Gaswelten und fremdartige Biome.
 */

import { describe, expect, it } from 'vitest';
import { HexBiome, PlanetHexTile } from '../src/core/types.ts';
import {
  selectSurfaceTileArt,
  surfaceTileVariant,
  SurfaceTileContext,
} from '../src/ui/surfaceTileMapping.ts';

function createTile(biome: HexBiome, overrides: Partial<PlanetHexTile> = {}): PlanetHexTile {
  return {
    coord: { q: 1, r: 2 },
    key: '1,2',
    biome,
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

function context(overrides: Partial<SurfaceTileContext> = {}): SurfaceTileContext {
  return {
    planetType: 'rocky',
    variant: 1,
    isCoastal: false,
    nearWater: false,
    ...overrides,
  };
}

describe('Surface Tile Mapping', () => {
  it('1. Ebenen, Wüste und Hügel verwenden Basis- und Aufsatz-Tiles', () => {
    expect(selectSurfaceTileArt(createTile('plains'), context()).base).toMatch(/^TILE_(GRASS|PLAINS)/);

    const desert = selectSurfaceTileArt(createTile('desert', { elevation: 2 }), context());
    expect(desert.base).toMatch(/^TILE_DESERT/);
    expect(desert.overlay).toMatch(/^TILE_HILLS_DESERT/);

    const coldHills = selectSurfaceTileArt(
      createTile('hills', { temperature: 0.1, rainfall: 0.4 }),
      context()
    );
    expect(coldHills.base).toBe('TILE_SNOW');
    expect(coldHills.overlay).toMatch(/^TILE_HILLS_SNOW/);
  });

  it('2. Wald und Dschungel liegen als transparente Aufsätze über Gras', () => {
    const forest = selectSurfaceTileArt(
      createTile('forest', { temperature: 0.5, rainfall: 0.6 }),
      context()
    );
    expect(forest.base).toMatch(/^TILE_GRASS/);
    expect(forest.overlay).toMatch(/^TILE_FOREST/);

    const jungle = selectSurfaceTileArt(
      createTile('jungle', { temperature: 0.75, rainfall: 0.8 }),
      context()
    );
    expect(jungle.base).toMatch(/^TILE_GRASS/);
    expect(jungle.overlay).toMatch(/^TILE_JUNGLE/);
  });

  it('3. Küsten-, See- und Eiswasser werden unterschieden', () => {
    expect(selectSurfaceTileArt(createTile('ocean'), context()).base).toMatch(/^TILE_OCEAN/);
    expect(
      selectSurfaceTileArt(createTile('ocean'), context({ isCoastal: true })).base
    ).toMatch(/^TILE_SHALLOW_OCEAN/);
    expect(
      selectSurfaceTileArt(createTile('ocean'), context({ planetType: 'ice' })).base
    ).toBe('TILE_SNOW');
    expect(
      selectSurfaceTileArt(
        createTile('plains', { rainfall: 0.6 }),
        context({ nearWater: true })
      ).base
    ).toBe('TILE_FLOODPLAINS');
  });

  it('4. Lava, Gas, Gift und Xeno nutzen echte Tiles, übrige Fremdbiome Platzhalter', () => {
    expect(selectSurfaceTileArt(createTile('lava'), context()).base).toMatch(
      /^LAVA_TILE_(2|0)$/
    );
    expect(selectSurfaceTileArt(createTile('volcanic'), context()).base).toMatch(
      /^LAVA_TILE_(0|1|3|BASALT)$/
    );
    expect(selectSurfaceTileArt(createTile('lava'), context()).placeholder).toBeUndefined();
    expect(selectSurfaceTileArt(createTile('volcanic'), context()).placeholder).toBeUndefined();

    const gas = selectSurfaceTileArt(createTile('gas'), context({ planetType: 'gas_giant' }));
    expect(gas.base).toMatch(/^GAS_YELLOW_[1-5]$/);
    expect(gas.box).toBe('square');
    expect(gas.placeholder).toBeUndefined();

    const blueGas = selectSurfaceTileArt(
      createTile('gas'),
      context({ planetType: 'gas_giant', planetColor: '#3b82f6' })
    );
    expect(blueGas.base).toMatch(/^GAS_BLUE_[1-5]$/);

    expect(selectSurfaceTileArt(createTile('toxic'), context()).base).toMatch(/^GIFT_/);

    const xenoAlien = selectSurfaceTileArt(
      createTile('alien'),
      context({ planetType: 'xeno' })
    );
    expect(xenoAlien.base).toMatch(/^XENO_/);
    expect(xenoAlien.box).toBe('square');

    // Außerhalb von Xeno-/Giftwelten bleibt der fremdartige Platzhalter.
    expect(selectSurfaceTileArt(createTile('alien'), context()).placeholder).toBe('alien');
    expect(selectSurfaceTileArt(createTile('fungal_forest'), context()).placeholder).toBe('alien');
  });

  it('4b. Vulkanberge und -hügel verwenden die vorhandenen Bergkacheln', () => {
    const mountains = selectSurfaceTileArt(
      createTile('mountains', { elevation: 3 }),
      context({ planetType: 'volcanic' })
    );
    expect(mountains.base).toMatch(/^MOUNTAIN_HEX_[0-3]$/);
    expect(mountains.bleed).toBeGreaterThan(1);

    const hills = selectSurfaceTileArt(
      createTile('hills', { elevation: 2 }),
      context({ planetType: 'volcanic' })
    );
    expect(hills.base).toMatch(/^LAVA_TILE_(1|3)$/);
    expect(hills.overlay).toMatch(/^MOUNTAIN_HEX_[13]$/);

    // Außerhalb von Vulkan- und Gesteinswelten bleibt die bestehende
    // Bergzuordnung erhalten; Gesteinswelten nutzen die Felskacheln.
    const terrestrial = selectSurfaceTileArt(
      createTile('mountains'),
      context({ planetType: 'desert' })
    );
    expect(terrestrial.base).toMatch(/^TILE_MOUNTAIN/);
  });

  it('5. Einschlagkrater erhält Steinaufsatz und Kraterring', () => {
    const crater = selectSurfaceTileArt(
      createTile('impact_crater', { temperature: 0.5, rainfall: 0.5 }),
      context()
    );
    expect(crater.overlay).toBe('TILE_STONE');
    expect(crater.emblem).toBe('crater');
  });

  it('6. Giftwelten zeigen karge Steppe, Vulkanwelten Basalt statt Gras', () => {
    const volcanicPlains = selectSurfaceTileArt(
      createTile('plains'),
      context({ planetType: 'volcanic' })
    );
    expect(volcanicPlains.base).toMatch(/^LAVA_TILE_(3|BASALT)$/);
    expect(volcanicPlains.bleed).toBeGreaterThan(1);

    const toxicHills = selectSurfaceTileArt(
      createTile('hills', { temperature: 0.7, rainfall: 0.5 }),
      context({ planetType: 'toxic' })
    );
    expect(toxicHills.base).toMatch(/^TILE_PLAINS/);
    expect(toxicHills.overlay).toMatch(/^TILE_HILLS_PLAINS/);
  });

  it('7. Variantenwahl ist seed- und kachelstabil', () => {
    const first = surfaceTileVariant('SURFACE-A', '1,2');
    expect(surfaceTileVariant('SURFACE-A', '1,2')).toBe(first);
    expect(surfaceTileVariant('SURFACE-B', '1,2')).not.toBe(first);
    expect(surfaceTileVariant('SURFACE-A', '2,2')).not.toBe(first);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(first)).toBe(true);
  });

  it('8. Xenowelten decken alle Kernbiome mit vorhandenen Tiles oder Platzhaltern ab', () => {
    const biomes: HexBiome[] = [
      'ocean',
      'plains',
      'forest',
      'jungle',
      'marsh',
      'desert',
      'tundra',
      'snow',
      'hills',
      'mountains',
      'impact_crater',
      'alien',
      'fungal_forest',
    ];
    for (const biome of biomes) {
      const art = selectSurfaceTileArt(
        createTile(biome),
        context({ planetType: 'xeno', variant: 3 })
      );
      expect(
        Boolean(art.base || art.placeholder),
        `Xeno-Biom ${biome} ohne Grafik oder Platzhalter`
      ).toBe(true);
    }
  });

  it('9. Bleed gleicht den sichtbaren Rand je Asset aus', () => {
    // Giftgewässer füllt nur 77 % der Bildhöhe, Ebenen dagegen 89–94 %.
    const acidSea = selectSurfaceTileArt(
      createTile('ocean'),
      context({ planetType: 'toxic' })
    );
    expect(acidSea.base).toBe('GIFT_VERSEUCHTES_GEWAESSER');
    expect(acidSea.bleed).toBeCloseTo(1.32, 5);

    const acidMarsh = selectSurfaceTileArt(
      createTile('marsh'),
      context({ planetType: 'toxic' })
    );
    expect(acidMarsh.base).toBe('GIFT_VERSEUCHTES_GEWAESSER');
    expect(acidMarsh.bleed).toBeCloseTo(1.32, 5);

    const giftForest = selectSurfaceTileArt(
      createTile('forest'),
      context({ planetType: 'toxic' })
    );
    expect(giftForest.base).toMatch(/^GIFT_(WALD|EBENE_KRISTRAL)$/);
    expect(giftForest.bleed).toBeCloseTo(1.1, 5);

    const yellowGas = selectSurfaceTileArt(
      createTile('gas'),
      context({ planetType: 'gas_giant' })
    );
    expect(yellowGas.bleed).toBeCloseTo(1.07, 5);

    const blueGas = selectSurfaceTileArt(
      createTile('gas'),
      context({ planetType: 'gas_giant', planetColor: '#3b82f6' })
    );
    expect(blueGas.bleed).toBeCloseTo(1.12, 5);

    const xenoPlains = selectSurfaceTileArt(
      createTile('plains'),
      context({ planetType: 'xeno' })
    );
    // Variante 1 ist XENO_SLIME_PLAIN_FIELDS (99 % Füllhöhe), Variante 0
    // XENO_PLAIN_GROUND (97 %).
    expect([1.05, 1.07]).toContain(xenoPlains.bleed);

    // Gesteinswelten nutzen die vorhandenen Felskacheln für Gebirge.
    const rockyMountains = selectSurfaceTileArt(
      createTile('mountains'),
      context({ planetType: 'rocky' })
    );
    expect(rockyMountains.base).toMatch(/^ROCK_HEX_[0-2]$/);
    expect(rockyMountains.bleed).toBeCloseTo(1.02, 5);
  });
});
