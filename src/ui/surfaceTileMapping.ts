/**
 * Astraea 4X - Surface Tile Mapping
 *
 * Reine Zuordnung von Weltgenerierungsdaten auf die Pixel-Tiles unter
 * `Tilesets/Planetenbiome`. Die Funktion kennt weder Canvas noch React und ist
 * damit deterministisch testbar. Fehlende Tilesets für Lavawelten, Gaswelten
 * und fremdartige Biome liefern Platzhalter-Kennungen, die der Canvas-Renderer
 * prozedural zeichnet.
 */

import { HexBiome, Planet, PlanetHexTile } from '../core/types.ts';
import { BIOME_CATALOG } from '../data/terrainCatalog.ts';

export type SurfacePlaceholder = 'lava' | 'gas' | 'alien' | 'toxic';

export interface SurfaceTileArt {
  /** Vollflächige Basis-Kachel (Hex mit deckendem Hintergrund). */
  base?: string;
  /** Transparente Aufsatz-Kachel, z. B. Wald oder Hügel. */
  overlay?: string;
  /** Prozeduraler Platzhalter, wenn das Tileset das Biom nicht abdeckt. */
  placeholder?: SurfacePlaceholder;
  /** Zusätzliches prozedurales Symbol über der Basis (z. B. Kraterring). */
  emblem?: 'crater';
  /** Dezente Farbtönung über der Kachel (z. B. Eisdecke). */
  tint?: string;
  /**
   * Skalierungsfaktor für Assets mit transparentem Rand (Lava- und
   * Bergkacheln). 1 = Kachel füllt das Hex-Rechteck exakt.
   */
  bleed?: number;
  /** Fallback-Farbe, solange das Bild noch nicht geladen ist. */
  fallbackColor: string;
}

export interface SurfaceTileContext {
  planetType: Planet['planetType'];
  /** Deterministischer Variantenindex aus Seed + Kachelschlüssel. */
  variant: number;
  /** Ozeankachel grenzt an Land. */
  isCoastal: boolean;
  /** Kachel liegt an einem Fluss, See oder Feuchtgebiet. */
  nearWater: boolean;
}

/** FNV-1a-Hash für eine stabile Variantenwahl pro Kachel und Oberfläche. */
export function surfaceTileVariant(seed: string, key: string): number {
  let hash = 2166136261;
  const value = `${seed}:${key}:tile`;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Wählt eine Variante aus einer Asset-Familie: BASE, BASE_2, BASE_3, ... */
function variant(base: string, count: number, index: number): string {
  if (count <= 1) return base;
  const slot = index % count;
  return slot === 0 ? base : `${base}_${slot + 1}`;
}

/**
 * Lava-/Vulkankacheln liegen als einzelne, hochauflösende Hex-Grafiken vor.
 * Die Zuordnung orientiert sich an der tatsächlich sichtbaren Oberfläche:
 *  - LAVA_TILE_1 / _3 / _BASALT: erstarrte, begehbare Lavakruste
 *  - LAVA_TILE_0: glühende Risse (höheres Gelände)
 *  - LAVA_TILE_2: offener Lavasee (unpassierbar)
 *  - MOUNTAIN_HEX_0..3: Vulkankegel, Caldera und zerklüftetes Hochland
 */
const LAVA_CRUST_TILES = ['LAVA_TILE_1', 'LAVA_TILE_3', 'LAVA_TILE_BASALT', 'LAVA_TILE_0'];
const LAVA_MOLTEN_TILES = ['LAVA_TILE_2', 'LAVA_TILE_2', 'LAVA_TILE_0'];
const VOLCANIC_MOUNTAIN_TILES = [
  'MOUNTAIN_HEX_0',
  'MOUNTAIN_HEX_1',
  'MOUNTAIN_HEX_2',
  'MOUNTAIN_HEX_3',
];

/** Die Lavakacheln besitzen rundum einen transparenten Rand (ca. 8 %). */
const LAVA_TILE_BLEED = 1.18;

function pickFamily(family: string[], index: number): string {
  return family[index % family.length];
}

function fallbackClimate(biome: HexBiome): { temperature: number; rainfall: number } {
  switch (biome) {
    case 'snow':
      return { temperature: 0.08, rainfall: 0.35 };
    case 'tundra':
      return { temperature: 0.22, rainfall: 0.4 };
    case 'desert':
      return { temperature: 0.72, rainfall: 0.12 };
    case 'jungle':
      return { temperature: 0.72, rainfall: 0.78 };
    case 'forest':
      return { temperature: 0.5, rainfall: 0.58 };
    case 'marsh':
      return { temperature: 0.55, rainfall: 0.65 };
    case 'ocean':
      return { temperature: 0.45, rainfall: 0.6 };
    default:
      return { temperature: 0.5, rainfall: 0.42 };
  }
}

/**
 * Wählt Basis, Aufsatz oder Platzhalter für eine Kachel.
 *
 * Die Klimawerte stammen aus der Weltgenerierung (Version 4). Ältere
 * Spielstände ohne diese Felder fallen auf plausible Biom-Defaults zurück.
 */
export function selectSurfaceTileArt(
  tile: PlanetHexTile,
  context: SurfaceTileContext
): SurfaceTileArt {
  const fallback = fallbackClimate(tile.biome);
  const temperature = tile.temperature ?? fallback.temperature;
  const rainfall = tile.rainfall ?? fallback.rainfall;
  const variantIndex = context.variant;

  const fallbackColor = BIOME_CATALOG[tile.biome]?.color ?? '#1e293b';

  switch (tile.biome) {
    case 'ocean': {
      if (context.planetType === 'ice') {
        return {
          base: 'TILE_SNOW',
          tint: 'rgba(56, 189, 248, 0.22)',
          fallbackColor: '#bae6fd',
        };
      }
      if (context.planetType === 'toxic') {
        // Säureseen: kein irdisches Blau auf Giftwelten.
        return { placeholder: 'toxic', fallbackColor };
      }
      if (context.isCoastal) {
        const art: SurfaceTileArt = {
          base: variant('TILE_SHALLOW_OCEAN', 3, variantIndex),
          fallbackColor,
        };
        // Sehr seltene Riffkante vor der Küste.
        if (variantIndex % 17 === 0) art.overlay = 'TILE_GREAT_BARRIER_REEF';
        return art;
      }
      return {
        base: variant('TILE_OCEAN', 3, variantIndex),
        fallbackColor,
      };
    }

    case 'plains': {
      if (context.planetType === 'desert') {
        // Steppe statt saftigem Gras auf Wüstenwelten.
        return { base: variant('TILE_PLAINS', 2, variantIndex), fallbackColor };
      }
      if (context.planetType === 'ice') {
        return { base: variant('TILE_TUNDRA', 3, variantIndex), fallbackColor };
      }
      if (context.planetType === 'toxic') {
        // Giftwelten zeigen selbst in der Landezone nur karge Steppe; die
        // Erträge bleiben unverändert, die Farbwelt feindlich.
        return { base: variant('TILE_PLAINS', 2, variantIndex), fallbackColor };
      }
      if (context.planetType === 'volcanic') {
        // Auch die geschützte Landezone bleibt auf Vulkanwelten Basalt.
        return {
          base: variantIndex % 3 === 0 ? 'LAVA_TILE_BASALT' : 'LAVA_TILE_3',
          bleed: LAVA_TILE_BLEED,
          fallbackColor: '#241310',
        };
      }
      if (context.nearWater && rainfall > 0.42) {
        return { base: 'TILE_FLOODPLAINS', fallbackColor };
      }
      if (rainfall < 0.3) {
        return { base: variant('TILE_PLAINS', 2, variantIndex), fallbackColor };
      }
      return { base: variant('TILE_GRASS', 5, variantIndex), fallbackColor };
    }

    case 'forest': {
      const autumn = variantIndex % 11 === 0 && temperature > 0.3 && temperature < 0.6;
      return {
        base: variant('TILE_GRASS', 5, variantIndex + 1),
        overlay: autumn
          ? variant('TILE_FOREST_AUTUMN', 2, variantIndex)
          : variant('TILE_FOREST', 3, variantIndex),
        fallbackColor,
      };
    }

    case 'jungle':
      return {
        base: variant('TILE_GRASS', 5, variantIndex + 2),
        overlay: variant('TILE_JUNGLE', 3, variantIndex),
        fallbackColor,
      };

    case 'marsh': {
      if (context.planetType === 'desert') {
        // Oase / Schwemmfläche statt grünem Sumpf.
        return { base: 'TILE_FLOODPLAINS', fallbackColor };
      }
      if (context.planetType === 'ice') {
        return { base: variant('TILE_TUNDRA', 3, variantIndex), fallbackColor };
      }
      return { base: 'TILE_MARSH', fallbackColor };
    }

    case 'desert': {
      const art: SurfaceTileArt = {
        base: variant('TILE_DESERT', 3, variantIndex),
        fallbackColor,
      };
      if (tile.elevation >= 2) art.overlay = variant('TILE_HILLS_DESERT', 3, variantIndex);
      return art;
    }

    case 'tundra': {
      const art: SurfaceTileArt = {
        base: variant('TILE_TUNDRA', 3, variantIndex),
        fallbackColor,
      };
      if (tile.elevation >= 2) art.overlay = variant('TILE_HILLS_TUNDRA', 3, variantIndex);
      return art;
    }

    case 'snow': {
      const art: SurfaceTileArt = {
        base: 'TILE_SNOW',
        fallbackColor,
      };
      if (tile.elevation >= 2) art.overlay = variant('TILE_HILLS_SNOW', 3, variantIndex);
      return art;
    }

    case 'hills': {
      // Hügel sind transparente Aufsätze; die Basis folgt dem Klima.
      let base: string;
      let hills: string;
      if (context.planetType === 'desert') {
        base = variant('TILE_DESERT', 3, variantIndex);
        hills = variant('TILE_HILLS_DESERT', 3, variantIndex);
      } else if (context.planetType === 'volcanic') {
        // Erstarrte Lavahügel mit aufragendem Vulkangestein.
        return {
          base: pickFamily(['LAVA_TILE_1', 'LAVA_TILE_3'], variantIndex),
          overlay: pickFamily(['MOUNTAIN_HEX_3', 'MOUNTAIN_HEX_1'], variantIndex),
          bleed: LAVA_TILE_BLEED,
          fallbackColor: '#2b1712',
        };
      } else if (context.planetType === 'toxic') {
        // Ascherne Hügel statt grüner Hügel auf Giftwelten.
        base = variant('TILE_PLAINS', 2, variantIndex);
        hills = variant('TILE_HILLS_PLAINS', 3, variantIndex);
      } else if (temperature < 0.24) {
        base = 'TILE_SNOW';
        hills = variant('TILE_HILLS_SNOW', 3, variantIndex);
      } else if (temperature < 0.38) {
        base = variant('TILE_TUNDRA', 3, variantIndex);
        hills = variant('TILE_HILLS_TUNDRA', 3, variantIndex);
      } else if (rainfall < 0.24) {
        base = variant('TILE_DESERT', 3, variantIndex);
        hills = variant('TILE_HILLS_DESERT', 3, variantIndex);
      } else if (rainfall < 0.4) {
        base = variant('TILE_PLAINS', 2, variantIndex);
        hills = variant('TILE_HILLS_PLAINS', 3, variantIndex);
      } else {
        base = variant('TILE_GRASS', 5, variantIndex);
        hills = variant('TILE_HILLS_GRASS', 3, variantIndex);
      }
      return { base, overlay: hills, fallbackColor };
    }

    case 'mountains':
      if (context.planetType === 'volcanic') {
        return {
          base: pickFamily(VOLCANIC_MOUNTAIN_TILES, variantIndex),
          bleed: LAVA_TILE_BLEED,
          fallbackColor: '#1d1210',
        };
      }
      return {
        base: variant('TILE_MOUNTAIN', 3, variantIndex),
        fallbackColor,
      };

    case 'impact_crater': {
      if (context.planetType === 'volcanic') {
        return {
          base: 'LAVA_TILE_0',
          emblem: 'crater',
          bleed: LAVA_TILE_BLEED,
          fallbackColor: '#2a0a06',
        };
      }
      const base =
        temperature < 0.3
          ? variant('TILE_TUNDRA', 3, variantIndex)
          : rainfall < 0.25
            ? variant('TILE_DESERT', 3, variantIndex)
            : variant('TILE_GRASS', 5, variantIndex);
      return { base, overlay: 'TILE_STONE', emblem: 'crater', fallbackColor };
    }

    case 'volcanic':
      // Begehbares Vulkangelände: erstarrte Lavakruste, in höheren Lagen
      // glühende Risse. Die Bewegungsregeln stammen unverändert aus dem
      // Biomkatalog (movementCost 2.5, passierbar).
      return {
        base:
          tile.elevation >= 2
            ? 'LAVA_TILE_0'
            : pickFamily(LAVA_CRUST_TILES, variantIndex),
        bleed: LAVA_TILE_BLEED,
        fallbackColor: '#2a0a06',
      };

    case 'lava':
      // Offener Lavasee: unpassierbar laut Biomkatalog. Die Grafik zeigt
      // tatsächlich geschmolzenes Gestein, nicht nur eine rote Fläche.
      return {
        base: pickFamily(LAVA_MOLTEN_TILES, variantIndex),
        bleed: LAVA_TILE_BLEED,
        fallbackColor: '#1c0908',
      };

    case 'gas':
      return { placeholder: 'gas', fallbackColor };

    case 'toxic':
      return { placeholder: 'toxic', fallbackColor };

    case 'alien':
    case 'fungal_forest':
      return { placeholder: 'alien', fallbackColor };

    default:
      return { base: variant('TILE_GRASS', 5, variantIndex), fallbackColor };
  }
}
