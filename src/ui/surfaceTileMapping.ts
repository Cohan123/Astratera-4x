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
      if (
        context.planetType === 'toxic' ||
        context.planetType === 'volcanic'
      ) {
        // Gift- und Vulkanwelten zeigen selbst in der Landezone nur karge
        // Steppe; die Erträge bleiben unverändert, die Farbwelt feindlich.
        return { base: variant('TILE_PLAINS', 2, variantIndex), fallbackColor };
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
      } else if (
        context.planetType === 'toxic' ||
        context.planetType === 'volcanic'
      ) {
        // Ascherne Hügel statt grüner Hügel auf feindlichen Welten.
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
      return {
        base: variant('TILE_MOUNTAIN', 3, variantIndex),
        fallbackColor,
      };

    case 'impact_crater': {
      const base =
        temperature < 0.3
          ? variant('TILE_TUNDRA', 3, variantIndex)
          : rainfall < 0.25
            ? variant('TILE_DESERT', 3, variantIndex)
            : variant('TILE_GRASS', 5, variantIndex);
      return { base, overlay: 'TILE_STONE', emblem: 'crater', fallbackColor };
    }

    case 'volcanic':
    case 'lava':
      return { placeholder: 'lava', fallbackColor };

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
