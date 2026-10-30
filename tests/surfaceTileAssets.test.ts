/**
 * Astraea 4X - Tileset-Assets (Test)
 *
 * Prüft, dass die neuen Gas-, Gift-, Xeno- und Gesteinskacheln tatsächlich über
 * den Vite-Glob eingebunden und unter stabilen Namen auflösbar sind.
 */

import { describe, expect, it } from 'vitest';
import {
  getSurfaceTileAssetCount,
  getSurfaceTileUrl,
} from '../src/ui/surfaceTileAssets.ts';

describe('Tileset-Assets', () => {
  it('1. bindet alle vorhandenen Kacheln ein', () => {
    expect(getSurfaceTileAssetCount()).toBeGreaterThan(100);
  });

  it('2. löst die neuen Kachelfamilien unter stabilen Namen auf', () => {
    const names = [
      'GAS_YELLOW_1',
      'GAS_YELLOW_5',
      'GAS_BLUE_1',
      'GAS_BLUE_5',
      'GIFT_EBENE',
      'GIFT_EBEN',
      'GIFT_EBENE_KRISTRAL',
      'GIFT_WALD',
      'GIFT_VERSEUCHTES_GEWAESSER',
      'XENO_PLAIN_GROUND',
      'XENO_SLIME_PLAIN_FIELDS',
      'XENO_MOUNTAINS',
      'XENO_WATER_WITH_LAND',
      'XENO_CRYSTALS',
      'XENO_PLAN_FIELD_AILIEN_EGGS',
      'ROCK_HEX_0',
      'ROCK_HEX_3',
      'CRYSTAL_HEX_0',
      'ROCK_HEX_V2_0_TRANSPARENT',
    ];

    for (const name of names) {
      expect(getSurfaceTileUrl(name), `Asset ${name} fehlt`).toBeTruthy();
    }
  });

  it('3. unbekannte Namen liefern keinen falschen Treffer', () => {
    expect(getSurfaceTileUrl('GAS_GREEN_9')).toBeNull();
  });
});
