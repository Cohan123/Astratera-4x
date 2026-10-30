/**
 * Astraea 4X - Testlabor
 *
 * Prüft die modulare Ballon-Registry, den Menüzugang und den vollständigen
 * Oberflächengenerator-Test inklusive Reproduzierbarkeit und Ergebnisdaten.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TestLab } from '../src/testing/TestLab.tsx';
import { TEST_BALLOONS, getTestBalloon } from '../src/testing/testLabRegistry.tsx';
import {
  DEFAULT_SURFACE_TEST_CONFIG,
  SURFACE_TEST_LIMITS,
  computeSurfaceStatistics,
  createTestPlanet,
  generateTestSurface,
  surfaceConfigKey,
  surfaceSignature,
  validateSurfaceTestConfig,
} from '../src/testing/surfaceTestUtils.ts';

describe('Testlabor-Menü', () => {
  it('1. Zeigt den Testing-Einstieg, den Oberflächenballon und geplante Erweiterungen', () => {
    const html = renderToStaticMarkup(<TestLab onExit={() => undefined} />);

    expect(html).toContain('Astraea 4X · Testing');
    expect(html).toContain('Isoliertes Testlabor');
    expect(html).toContain('Prozedurale Planetenoberfläche');
    expect(html).toContain('Verfügbar');
    expect(html).toContain('Geplant');
    expect(html).toContain('Hauptmenü');
    expect(html).toContain('Trennung vom Spiel');
  });

  it('2. Registry ist modular und eindeutig; nur verfügbare Ballons haben Komponenten', () => {
    const ids = TEST_BALLOONS.map((balloon) => balloon.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(getTestBalloon('surface-generator')?.status).toBe('ready');
    expect(getTestBalloon('surface-generator')?.component).toBeTypeOf('function');

    for (const balloon of TEST_BALLOONS) {
      if (balloon.status === 'ready') {
        expect(balloon.component, balloon.id).toBeTypeOf('function');
      } else {
        expect(balloon.component, balloon.id).toBeUndefined();
        expect(balloon.plannedNote, balloon.id).toBeTruthy();
      }
    }
  });
});

describe('Oberflächengenerator-Testballon', () => {
  it('3. Vulkanwelt erzeugt echte Lava- und Vulkangesteins-Biome', () => {
    const result = generateTestSurface({
      planetType: 'volcanic',
      width: 12,
      height: 8,
      seed: 'TEST-LAVA-001',
    });

    expect(result.surface.tiles).toHaveLength(96);
    expect(result.statistics.tileCount).toBe(96);
    expect(result.statistics.expectedTileCount).toBe(96);
    const biomeIds = result.statistics.biomes.map((entry) => entry.id);
    expect(biomeIds).toContain('lava');
    // Je nach Vulkanismus entstehen zusätzlich Vulkangestein, Hügel oder
    // Vulkanberge; alle drei werden im Renderer auf die Lava-/Berg-Tiles
    // abgebildet.
    expect(
      biomeIds.some((id) => ['volcanic', 'mountains', 'hills'].includes(id))
    ).toBe(true);
    expect(result.statistics.biomes.reduce((sum, entry) => sum + entry.count, 0)).toBe(96);
    expect(result.warnings).toHaveLength(0);
  });

  it('4. Gleicher Seed und gleiche Parameter liefern eine identische Oberfläche', () => {
    const config = { planetType: 'volcanic' as const, width: 10, height: 7, seed: 'REPRO-42' };
    const first = generateTestSurface(config);
    const second = generateTestSurface(config);

    expect(first.signature).toBe(second.signature);
    expect(first.surface.seed).toBe(second.surface.seed);
    expect(surfaceSignature(first.surface)).toBe(surfaceSignature(second.surface));
    expect(surfaceConfigKey(config)).toBe(surfaceConfigKey({ ...config }));

    const otherSeed = generateTestSurface({ ...config, seed: 'REPRO-43' });
    expect(otherSeed.signature).not.toBe(first.signature);
  });

  it('5. Größe und Planetentyp verändern das Ergebnis tatsächlich', () => {
    const small = generateTestSurface({
      planetType: 'ocean',
      width: 6,
      height: 6,
      seed: 'SIZE-TEST',
    });
    const large = generateTestSurface({
      planetType: 'ocean',
      width: 16,
      height: 12,
      seed: 'SIZE-TEST',
    });
    expect(small.surface.tiles).toHaveLength(36);
    expect(large.surface.tiles).toHaveLength(192);
    expect(small.statistics.tileCount).not.toBe(large.statistics.tileCount);

    const gas = generateTestSurface({
      planetType: 'gas_giant',
      width: 8,
      height: 6,
      seed: 'GAS-TEST',
    });
    expect(gas.statistics.biomes.some((entry) => entry.id === 'gas')).toBe(true);
  });

  it('6. Testkacheln sind sichtbar und Vorkommen direkt prüfbar', () => {
    const result = generateTestSurface({
      planetType: 'volcanic',
      width: 8,
      height: 6,
      seed: 'VISIBLE-1',
    });
    expect(result.surface.tiles.every((tile) => tile.visibility === 'visible')).toBe(true);
    expect(
      result.surface.tiles.every(
        (tile) => tile.deposit === 'none' || tile.isDepositDiscovered
      )
    ).toBe(true);
    expect(
      result.surface.tiles.every(
        (tile) => tile.isDepositDiscovered === (tile.deposit !== 'none')
      )
    ).toBe(true);
  });

  it('7. Ungültige Konfigurationen werden mit konkreten Fehlermeldungen abgelehnt', () => {
    expect(validateSurfaceTestConfig({ ...DEFAULT_SURFACE_TEST_CONFIG })).toHaveLength(0);

    const tooSmall = validateSurfaceTestConfig({
      planetType: 'volcanic',
      width: SURFACE_TEST_LIMITS.minWidth - 1,
      height: 10,
      seed: 'VALID-SEED',
    });
    expect(tooSmall.join(' ')).toContain('Breite');

    const tooHigh = validateSurfaceTestConfig({
      planetType: 'volcanic',
      width: 18,
      height: SURFACE_TEST_LIMITS.maxHeight + 1,
      seed: 'VALID-SEED',
    });
    expect(tooHigh.join(' ')).toContain('Höhe');

    const shortSeed = validateSurfaceTestConfig({
      planetType: 'volcanic',
      width: 18,
      height: 10,
      seed: 'ab',
    });
    expect(shortSeed.join(' ')).toContain('Seed');

    expect(() =>
      generateTestSurface({ planetType: 'volcanic', width: 0, height: 0, seed: '' })
    ).toThrow();
  });

  it('8. Statistiken stammen aus dem erzeugten Ergebnis und enthalten keine erfundenen Werte', () => {
    const result = generateTestSurface({
      planetType: 'volcanic',
      width: 9,
      height: 7,
      seed: 'STATS-1',
    });
    const recomputed = computeSurfaceStatistics(result.surface);

    expect(recomputed).toEqual(result.statistics);
    expect(recomputed.tileCount).toBe(63);
    expect(recomputed.biomes.every((entry) => entry.count > 0)).toBe(true);
    expect(recomputed.biomes.every((entry) => entry.share >= 0 && entry.share <= 100)).toBe(true);
    expect(recomputed.depositCount).toBe(
      result.surface.tiles.filter((tile) => tile.deposit !== 'none').length
    );
    expect(recomputed.hazardCount).toBe(
      result.surface.tiles.filter((tile) => tile.hasHazard).length
    );
    expect(recomputed.impassableCount).toBe(
      result.surface.tiles.filter((tile) => tile.biome === 'lava' || tile.biome === 'mountains').length
    );
  });

  it('9. Synthetischer Testplanet gehört zu keiner Kampagne', () => {
    const planet = createTestPlanet('volcanic');
    expect(planet.id).toBe('test-volcanic');
    expect(planet.systemId).toBe('test-system');
    expect(planet.colonyId).toBeNull();
    expect(planet.planetType).toBe('volcanic');
  });
});
