/**
 * Astraea 4X - Surface Tile Mapping
 *
 * Reine Zuordnung von Weltgenerierungsdaten auf die Pixel-Tiles unter
 * `Tilesets/Planetenbiome`. Die Funktion kennt weder Canvas noch React und ist
 * damit deterministisch testbar. Fehlen Assets, zeichnet der Canvas-Renderer
 * die Biome-Farbe bzw. einen prozeduralen Platzhalter.
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
  /**
   * Zeichenbox des Assets. `square` für quadratische, punktoben liegende
   * Hex-Kacheln (Gas, Gift, Xeno, Gestein): Die Grafik wird als Quadrat
   * gezeichnet, dessen sichtbare Hex-Höhe der Kachelhöhe entspricht.
   */
  box?: 'hex' | 'square';
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
  /**
   * Farbe des Planeten (optional). Wird derzeit nur für die Gas-Palette
   * (blauer/gelber Riese) ausgewertet; fehlt sie, gilt Gelb als Standard.
   */
  planetColor?: string;
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

/**
 * Quadratische Punkt-Hex-Kacheln (1600 × 1600 bzw. 256–3200 px). Die sichtbare
 * Hex-Fläche füllt je nach Datei 77–99 % der Bildhöhe. Der Bleed-Wert
 * kompensiert den transparenten Rand, damit benachbarte Kacheln lückenlos
 * anschließen. Der Canvas zeichnet sie über `box: 'square'`.
 *
 * Die Werte sind aus dem tatsächlichen Alpha-Rand der Dateien abgeleitet
 * (1 / sichtbare Höhe, plus 0,02 Reserve gegen Haarlinien). Ein fester
 * Familienwert reicht nicht: Innerhalb der Giftwelten füllt das Gewässer nur
 * 77 % der Bildhöhe, die Ebenen dagegen 89–94 %.
 */
const SQUARE_ASSET_BLEED: Record<string, number> = {
  GIFT_EBENE: 1.16,
  GIFT_EBEN: 1.15,
  GIFT_EBENE_KRISTRAL: 1.1,
  GIFT_LOCH: 1.09,
  GIFT_WALD: 1.1,
  GIFT_VERSEUCHTES_GEWAESSER: 1.32,

  XENO_PLAIN_GROUND: 1.07,
  XENO_SLIME_PLAIN_FIELDS: 1.05,
  XENO_WOOD: 1.17,
  XENO_CRYSTAL_WOOD: 1.07,
  XENO_MUSHROOM_WOOD: 1.14,
  XENO_CRYSTALS: 1.15,
  XENO_PLAN_FIELD_AILIEN_EGGS: 1.11,
  XENO_PLAIN_FIELD_CRYSTALS: 1.06,
  XENO_MOUNTAINS: 1.15,
  XENO_WATER_WITH_LAND: 1.14,
  XENO_GROUND_HOLE: 1.07,
  XENO_HOLE_IN_THE_GROUND: 1.21,
  XENO_FLYING_MOUNTAIN: 1.1,
  XENO_POI: 1.1,

  GAS_YELLOW_1: 1.07,
  GAS_YELLOW_2: 1.07,
  GAS_YELLOW_3: 1.07,
  GAS_YELLOW_4: 1.07,
  GAS_YELLOW_5: 1.07,
  GAS_BLUE_1: 1.12,
  GAS_BLUE_2: 1.12,
  GAS_BLUE_3: 1.12,
  GAS_BLUE_4: 1.12,
  GAS_BLUE_5: 1.12,

  ROCK_HEX_0: 1.02,
  ROCK_HEX_1: 1.02,
  ROCK_HEX_2: 1.02,
  ROCK_HEX_3: 1.22,
  ROCK_HEX_V2_0_TRANSPARENT: 1.06,
  ROCK_HEX_V2_1_TRANSPARENT: 1.06,
  ROCK_HEX_V2_2_TRANSPARENT: 1.06,
  ROCK_HEX_V2_3_TRANSPARENT: 1.06,
  ROCK_HEX_V2_4_TRANSPARENT: 1.06,
  CRYSTAL_HEX_0: 1.08,
  CRYSTAL_HEX_1: 1.08,
  CRYSTAL_HEX_2: 1.08,
  CRYSTAL_HEX_3: 1.08,
};

const GIFT_GROUND_TILES = ['GIFT_EBENE', 'GIFT_EBEN'];
const GIFT_CRYSTAL_TILES = ['GIFT_EBENE_KRISTRAL', 'GIFT_EBENE', 'GIFT_LOCH'];
const GIFT_FOREST_TILES = ['GIFT_WALD', 'GIFT_EBENE_KRISTRAL'];

const XENO_GROUND_TILES = ['XENO_PLAIN_GROUND', 'XENO_SLIME_PLAIN_FIELDS'];
const XENO_WOOD_TILES = ['XENO_WOOD', 'XENO_CRYSTAL_WOOD'];
const XENO_ALIEN_TILES = [
  'XENO_SLIME_PLAIN_FIELDS',
  'XENO_PLAN_FIELD_AILIEN_EGGS',
  'XENO_CRYSTALS',
];

const GAS_BLUE_TILES = ['GAS_BLUE_1', 'GAS_BLUE_2', 'GAS_BLUE_3', 'GAS_BLUE_4', 'GAS_BLUE_5'];
const GAS_YELLOW_TILES = [
  'GAS_YELLOW_1',
  'GAS_YELLOW_2',
  'GAS_YELLOW_3',
  'GAS_YELLOW_4',
  'GAS_YELLOW_5',
];

/** Wählt die Gas-Palette anhand der Planetenfarbe; Gelb ist der Standard. */
function gasTileFamily(color?: string): string[] {
  const match = color ? /^#([0-9a-f]{6})$/i.exec(color.trim()) : null;
  if (!match) return GAS_YELLOW_TILES;
  const r = Number.parseInt(match[1].slice(0, 2), 16);
  const b = Number.parseInt(match[1].slice(4, 6), 16);
  return b > r ? GAS_BLUE_TILES : GAS_YELLOW_TILES;
}

/**
 * Erzeugt eine quadratische Hex-Kachel. Der Bleed wird pro Asset aus der
 * gemessenen sichtbaren Hex-Höhe bestimmt; der übergebene Familienwert dient
 * nur als Rückfall für unbekannte Namen.
 */
function squareArt(
  base: string,
  fallbackColor: string,
  bleed: number,
  extra: Partial<SurfaceTileArt> = {}
): SurfaceTileArt {
  return {
    base,
    box: 'square',
    bleed: SQUARE_ASSET_BLEED[base] ?? bleed,
    fallbackColor,
    ...extra,
  };
}

/** Familienrückfall, falls eine neue Datei noch nicht in der Tabelle steht. */
const GIFT_TILE_BLEED = 1.16;
const XENO_TILE_BLEED = 1.15;
const GAS_TILE_BLEED = 1.07;

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
      if (context.planetType === 'xeno') {
        // Fremdartige Gewässer mit organischen Inseln.
        return squareArt('XENO_WATER_WITH_LAND', fallbackColor, XENO_TILE_BLEED);
      }
      if (context.planetType === 'ice') {
        return {
          base: 'TILE_SNOW',
          tint: 'rgba(56, 189, 248, 0.22)',
          fallbackColor: '#bae6fd',
        };
      }
      if (context.planetType === 'toxic') {
        // Säureseen: das vorhandene Giftgewässer ersetzt blaues Wasser.
        return squareArt('GIFT_VERSEUCHTES_GEWAESSER', fallbackColor, GIFT_TILE_BLEED);
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
      if (context.planetType === 'xeno') {
        return squareArt(pickFamily(XENO_GROUND_TILES, variantIndex), fallbackColor, XENO_TILE_BLEED);
      }
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
      if (context.planetType === 'xeno') {
        return squareArt(pickFamily(XENO_WOOD_TILES, variantIndex), fallbackColor, XENO_TILE_BLEED);
      }
      if (context.planetType === 'toxic') {
        return squareArt(pickFamily(GIFT_FOREST_TILES, variantIndex), fallbackColor, GIFT_TILE_BLEED);
      }
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
      if (context.planetType === 'xeno') {
        return squareArt(
          pickFamily(['XENO_CRYSTAL_WOOD', 'XENO_WOOD', 'XENO_MUSHROOM_WOOD'], variantIndex),
          fallbackColor,
          XENO_TILE_BLEED
        );
      }
      if (context.planetType === 'toxic') {
        return squareArt('GIFT_WALD', fallbackColor, GIFT_TILE_BLEED);
      }
      return {
        base: variant('TILE_GRASS', 5, variantIndex + 2),
        overlay: variant('TILE_JUNGLE', 3, variantIndex),
        fallbackColor,
      };

    case 'marsh': {
      if (context.planetType === 'xeno') {
        return squareArt('XENO_WATER_WITH_LAND', fallbackColor, XENO_TILE_BLEED);
      }
      if (context.planetType === 'toxic') {
        return squareArt('GIFT_VERSEUCHTES_GEWAESSER', fallbackColor, GIFT_TILE_BLEED);
      }
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
      if (context.planetType === 'xeno') {
        return squareArt('XENO_PLAIN_FIELD_CRYSTALS', fallbackColor, XENO_TILE_BLEED);
      }
      const art: SurfaceTileArt = {
        base: variant('TILE_DESERT', 3, variantIndex),
        fallbackColor,
      };
      if (tile.elevation >= 2) art.overlay = variant('TILE_HILLS_DESERT', 3, variantIndex);
      return art;
    }

    case 'tundra': {
      if (context.planetType === 'xeno') {
        return squareArt('XENO_PLAIN_GROUND', fallbackColor, XENO_TILE_BLEED, {
          tint: 'rgba(125, 211, 252, 0.22)',
        });
      }
      const art: SurfaceTileArt = {
        base: variant('TILE_TUNDRA', 3, variantIndex),
        fallbackColor,
      };
      if (tile.elevation >= 2) art.overlay = variant('TILE_HILLS_TUNDRA', 3, variantIndex);
      return art;
    }

    case 'snow': {
      if (context.planetType === 'xeno') {
        return squareArt('XENO_SLIME_PLAIN_FIELDS', fallbackColor, XENO_TILE_BLEED, {
          tint: 'rgba(224, 242, 254, 0.3)',
        });
      }
      const art: SurfaceTileArt = {
        base: 'TILE_SNOW',
        fallbackColor,
      };
      if (tile.elevation >= 2) art.overlay = variant('TILE_HILLS_SNOW', 3, variantIndex);
      return art;
    }

    case 'hills': {
      if (context.planetType === 'xeno') {
        // Kristallformationen als transparente Aufsätze über Xeno-Boden.
        return squareArt('XENO_PLAIN_GROUND', fallbackColor, XENO_TILE_BLEED, {
          overlay: 'XENO_CRYSTALS',
        });
      }
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
      if (context.planetType === 'xeno') {
        return squareArt('XENO_MOUNTAINS', fallbackColor, XENO_TILE_BLEED);
      }
      if (context.planetType === 'rocky') {
        // Gesteinswelten: vorhandene Felskacheln mit Bergkämmen. Die
        // transparenten Ränder werden über den gemessenen Bleed ausgeglichen.
        return squareArt(
          pickFamily(['ROCK_HEX_0', 'ROCK_HEX_1', 'ROCK_HEX_2'], variantIndex),
          fallbackColor,
          1.02
        );
      }
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
      if (context.planetType === 'xeno') {
        // Fremdartiger Einsturztrichter; das Asset bringt den Krater mit.
        return squareArt(
          pickFamily(['XENO_GROUND_HOLE', 'XENO_HOLE_IN_THE_GROUND'], variantIndex),
          fallbackColor,
          XENO_TILE_BLEED
        );
      }
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
      return squareArt(
        pickFamily(gasTileFamily(context.planetColor), variantIndex),
        fallbackColor,
        GAS_TILE_BLEED
      );

    case 'toxic':
      if (context.nearWater) {
        return squareArt('GIFT_VERSEUCHTES_GEWAESSER', fallbackColor, GIFT_TILE_BLEED);
      }
      return squareArt(
        variantIndex % 5 === 0
          ? pickFamily(GIFT_CRYSTAL_TILES, variantIndex)
          : pickFamily(GIFT_GROUND_TILES, variantIndex),
        fallbackColor,
        GIFT_TILE_BLEED
      );

    case 'alien':
    case 'fungal_forest': {
      if (context.planetType === 'xeno' || context.planetType === 'toxic') {
        if (tile.biome === 'fungal_forest') {
          return squareArt(
            context.planetType === 'toxic' ? 'GIFT_WALD' : 'XENO_MUSHROOM_WOOD',
            fallbackColor,
            context.planetType === 'toxic' ? GIFT_TILE_BLEED : XENO_TILE_BLEED
          );
        }
        return squareArt(
          pickFamily(
            context.planetType === 'toxic' ? GIFT_FOREST_TILES : XENO_ALIEN_TILES,
            variantIndex
          ),
          fallbackColor,
          context.planetType === 'toxic' ? GIFT_TILE_BLEED : XENO_TILE_BLEED
        );
      }
      return { placeholder: 'alien', fallbackColor };
    }

    default:
      return { base: variant('TILE_GRASS', 5, variantIndex), fallbackColor };
  }
}
