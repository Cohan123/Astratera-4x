/**
 * Astraea 4X - Lava-Tileset Integration
 *
 * Prüft, dass die tatsächlich vorhandenen Lava-/Basalt-/Bergkacheln über den
 * Vite-Asset-Loader erreichbar sind und dass fehlende Assets weiterhin sauber
 * über die Mapping-Fallbacks abgefangen werden.
 */

import { describe, expect, it } from 'vitest';
import {
  getSurfaceTileAssetCount,
  getSurfaceTileUrl,
} from '../src/ui/surfaceTileAssets.ts';
import { selectSurfaceTileArt } from '../src/ui/surfaceTileMapping.ts';
import { PlanetHexTile } from '../src/core/types.ts';

const LAVA_ASSETS = [
  'LAVA_TILE_0',
  'LAVA_TILE_1',
  'LAVA_TILE_2',
  'LAVA_TILE_3',
  'LAVA_TILE_BASALT',
  'MOUNTAIN_HEX_0',
  'MOUNTAIN_HEX_1',
  'MOUNTAIN_HEX_2',
  'MOUNTAIN_HEX_3',
];

function tile(biome: PlanetHexTile['biome'], overrides: Partial<PlanetHexTile> = {}): PlanetHexTile {
  return {
    coord: { q: 0, r: 0 },
    key: '0,0',
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

describe('Lava-Tileset', () => {
  it('1. Alle vorhandenen Lava-, Basalt- und Bergkacheln werden eingebunden', () => {
    for (const name of LAVA_ASSETS) {
      expect(getSurfaceTileUrl(name), `${name} fehlt im Asset-Loader`).toBeTruthy();
    }
    // Die bestehenden TILE_*-Kacheln bleiben unverändert verfügbar.
    expect(getSurfaceTileUrl('TILE_GRASS')).toBeTruthy();
    expect(getSurfaceTileAssetCount()).toBeGreaterThanOrEqual(LAVA_ASSETS.length + 20);
  });

  it('2. Namensnormalisierung entfernt nur die Skalierungssuffixe', () => {
    expect(getSurfaceTileUrl('lava_tile_0')).toBe(getSurfaceTileUrl('LAVA_TILE_0'));
    expect(getSurfaceTileUrl('mountain_hex_3')).toBe(getSurfaceTileUrl('MOUNTAIN_HEX_3'));
    expect(getSurfaceTileUrl('LAVA_TILE_0_HEX_X4')).toBeNull();
  });

  it('3. Fehlende Lavagrafik fällt auf eine dunkle Basaltfarbe zurück statt zu verschwinden', () => {
    // Das Mapping liefert weiterhin einen Asset-Namen; der Canvas füllt bei
    // fehlendem Bild die Fallback-Farbe. Hier wird geprüft, dass diese Farbe
    // gesetzt und das Biom nicht auf einen fremden Platzhalter umgeleitet wird.
    const lava = selectSurfaceTileArt(tile('lava'), {
      planetType: 'volcanic',
      variant: 0,
      isCoastal: false,
      nearWater: false,
    });
    expect(lava.placeholder).toBeUndefined();
    expect(lava.fallbackColor).toMatch(/^#[0-9a-f]{6}$/i);

    const volcanic = selectSurfaceTileArt(tile('volcanic'), {
      planetType: 'volcanic',
      variant: 2,
      isCoastal: false,
      nearWater: false,
    });
    expect(volcanic.placeholder).toBeUndefined();
    expect(volcanic.base).toMatch(/^LAVA_TILE_/);
  });
});
