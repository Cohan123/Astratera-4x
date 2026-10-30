/**
 * Astraea 4X - Planetare Oberflächengenerierung
 *
 * Erzeugt reproduzierbare, persistente Hex-Karten auf Basis von Planet und
 * Galaxie-Seed. Die Struktur folgt dem in ADR-034/ADR-049 dokumentierten
 * Mehrfeldmodell klassischer Weltengeneratoren: mehrere unabhängige
 * Rauschfelder (Elevation, Temperatur, Niederschlag, Vulkanismus, Impakt,
 * Wildheit) werden getrennt ausgewertet. Aus Elevation entstehen über Quantile
 * Höhenbänder, aus Höhe, Breitengrad, Niederschlag, Abfluss und Wildheit werden
 * Klima- und Biomfelder abgeleitet. Dadurch entstehen räumlich zusammenhängende
 * Landschaften statt unabhängig gewürfelter Einzelkacheln.
 *
 * Die Klima- und Biomlogik orientiert sich an der Weltgenerierung von
 * Dwarf Fortress (Temperaturgürtel, Niederschlagszonen, orografischer
 * Regenschatten, Abfluss, Savagery), ist aber eine eigenständige
 * Reimplementierung mit eigener Balance.
 *
 * Alle Zufallsziehungen sind an den Oberflächen-Seed gebunden, damit gespeicherte
 * Karten über Sitzungen hinweg identisch bleiben.
 */

import { HexBiome, HexCoord, Planet, PlanetHexTile, PlanetSurface, ResourceDepositType } from '../core/types.ts';
import { Mulberry32 } from '../generation/prng.ts';
import { HexMath } from './hexMath.ts';
import { Hydrology } from './hydrology.ts';
import { resolveSurfaceSize } from './surfaceSize.ts';
import { ValueNoise2D } from './terrainNoise.ts';

/**
 * Planetentyp-spezifische Generatorparameter. Die Bändergewichte beziehen sich
 * nur auf Landkacheln (nach Abzug des Meeresanteils) und beschreiben die
 * relativen Anteile von Tiefland, Mittelland und Hochland.
 */
interface PlanetProfile {
  /** Anteil der Kacheln, die dem Meer (Band 0) zugeordnet werden. */
  seaFraction: number;
  /** Relative Landanteile: [Tiefland, Mittelland, Hochland]. */
  landBandWeights: readonly [number, number, number];
  /** Grundtemperatur 0..1 (Planetentyp-Klima). */
  temperatureBase: number;
  /** Grundniederschlag 0..1. */
  moistureBase: number;
  /** Grundvulkanismus 0..1. */
  volcanismBase: number;
  /** Grundwildheit 0..1 (DF-nahe Savagery). */
  savageryBase: number;
  /** Klimafärbung für die Biomableitung. */
  flavor: 'terran' | 'arid' | 'frozen' | 'volcanic' | 'toxic' | 'xeno' | 'gas';
  /** Hostile Planeten erhalten keine gemäßigten Biome, sondern Vulkan/Gift. */
  hostile: boolean;
}

/** Zwischenstand einer Kachel während der Feldauswertung. */
interface RawTile {
  index: number;
  coord: HexCoord;
  key: string;
  elevationRaw: number;
  temperature: number;
  rainfall: number;
  volcanism: number;
  impact: number;
  savagery: number;
  drainage: number;
}

export class SurfaceGenerator {
  public static readonly GENERATOR_VERSION = 5;
  public static readonly DEFAULT_WIDTH = 18;
  public static readonly DEFAULT_HEIGHT = 10;
  /** Harte Obergrenze der Landfläche auf Ozeanwelten (15 %). */
  public static readonly OCEAN_MAX_LAND_FRACTION = 0.15;

  /**
   * Generates a persistent surface hex grid for a given planet.
   *
   * Ohne explizite Maße wird die Größe deterministisch aus Planetentyp und Seed
   * aufgelöst (siehe `surfaceSize.ts`). Explizite Maße bleiben für Testlabor
   * und Migration erhalten und werden auf die Sicherheitsgrenzen geklemmt.
   */
  public static generateSurface(
    planet: Planet,
    galaxySeed: string,
    width?: number,
    height?: number
  ): PlanetSurface {
    const resolvedSize = resolveSurfaceSize(planet, galaxySeed, width, height);
    width = resolvedSize.width;
    height = resolvedSize.height;

    const surfaceSeedStr = `${galaxySeed}:${planet.id}:surface:v${SurfaceGenerator.GENERATOR_VERSION}`;
    const rng = new Mulberry32(surfaceSeedStr);

    // Getrennte Rauschfelder: gleicher Seed, aber unterschiedliche Ableitungen,
    // damit die Felder unabhängig variieren (keine Korrelation der Muster).
    const elevationNoise = new ValueNoise2D(`${surfaceSeedStr}:elevation`);
    const rainfallNoise = new ValueNoise2D(`${surfaceSeedStr}:rainfall`);
    const temperatureNoise = new ValueNoise2D(`${surfaceSeedStr}:temperature`);
    const volcanismNoise = new ValueNoise2D(`${surfaceSeedStr}:volcanism`);
    const impactNoise = new ValueNoise2D(`${surfaceSeedStr}:impact`);
    const savageryNoise = new ValueNoise2D(`${surfaceSeedStr}:savagery`);

    const profile = SurfaceGenerator.getProfile(planet.planetType);

    // --- Phase 1: Felder auswerten -------------------------------------------
    const raw: RawTile[] = [];
    for (let r = 0; r < height; r++) {
      const rOffset = Math.floor(r / 2);
      const v = (r + 0.5) / height;
      // Äquatornähe: 1 am Äquator, 0 an den Polen.
      const latitude = 1 - Math.abs(v * 2 - 1);

      for (let q = -rOffset; q < width - rOffset; q++) {
        const u = (q + rOffset + 0.5) / width;

        const elevationRaw =
          0.7 * elevationNoise.fractal(u * 4.0, v * 3.0, 3) +
          0.3 * elevationNoise.sample(u * 9.0 + 11.3, v * 9.0 + 4.7);

        // Temperatur: Planetentyp-Basis + Breitengrad + regionales Rauschen.
        // Kryowelten werden gedeckelt, damit auch der Äquator unter dem
        // Tundra-Schwellwert bleibt und keine gemäßigten Wälder entstehen.
        const rawTemperature =
          profile.temperatureBase * 0.55 +
          latitude * 0.35 +
          (temperatureNoise.fractal(u * 3.0 + 7.7, v * 3.0 + 41.9, 2) - 0.5) * 0.28;
        const temperature = SurfaceGenerator.clamp01(
          profile.flavor === 'frozen' ? Math.min(rawTemperature, 0.28) : rawTemperature
        );

        // Niederschlag: Klimagürtel (feuchter Äquator, trockene Subtropen,
        // feuchte Mittelbreiten, trockene Pole) plus Planetentyp-Basis.
        const rainfall = SurfaceGenerator.clamp01(
          SurfaceGenerator.latitudeRainfall(latitude) * 0.72 +
            profile.moistureBase * 0.28 +
            (rainfallNoise.fractal(u * 3.5 + 53.1, v * 3.5 + 27.9, 3) - 0.5) * 0.22
        );

        const volcanism = SurfaceGenerator.clamp01(
          profile.volcanismBase * 0.6 + volcanismNoise.fractal(u * 3.2 + 67.3, v * 3.2 + 5.1, 2) * 0.4
        );

        const impact = impactNoise.sample(u * 8.0 + 37.7, v * 8.0 + 19.3);

        const savagery = SurfaceGenerator.clamp01(
          profile.savageryBase * 0.55 +
            savageryNoise.fractal(u * 2.8 + 19.7, v * 2.8 + 81.3, 2) * 0.45
        );

        raw.push({
          index: raw.length,
          coord: { q, r },
          key: HexMath.coordToKey({ q, r }),
          elevationRaw,
          temperature,
          rainfall,
          volcanism,
          impact,
          savagery,
          drainage: 0,
        });
      }
    }

    // Gasriesen besitzen keine feste Oberfläche. Die Karte wird als reine
    // Wolkenschicht mit Platzhalter-Biom erzeugt, damit die Oberflächenansicht
    // auch für Gaswelten funktioniert (keine Landezone, keine Hydrologie).
    if (profile.flavor === 'gas') {
      return SurfaceGenerator.generateGasSurface(planet, surfaceSeedStr, raw, width, height);
    }

    // --- Phase 2: Quantil-Bänder ---------------------------------------------
    // Ozeanwelten erhalten eine harte Obergrenze für Landkacheln. Sie wird aus
    // der tatsächlichen Kachelzahl berechnet (Abrunden), damit 15 % niemals
    // überschritten werden – unabhängig von der gewählten Oberflächengröße.
    const oceanLandCap =
      planet.planetType === 'ocean' ? Math.floor(raw.length * SurfaceGenerator.OCEAN_MAX_LAND_FRACTION) : undefined;
    const bands = SurfaceGenerator.assignBands(raw, profile, oceanLandCap);

    // --- Phase 3: Klima an Höhe, Küste und Wind koppeln ----------------------
    const indexByKey = new Map<string, number>();
    for (const tile of raw) indexByKey.set(tile.key, tile.index);

    SurfaceGenerator.applyClimateModifiers(raw, bands, indexByKey);

    // --- Phase 3b: Landeflächen reparieren -----------------------------------
    const landingZone = SurfaceGenerator.repairLandingZone(
      raw,
      bands,
      width,
      height,
      oceanLandCap
    );
    const coreIndex = landingZone.coreIndex;
    const protectedIndices = landingZone.protectedIndices;

    // --- Phase 3c: Hydrologie (Flüsse und Seen) ------------------------------
    // Der Oberflächenabfluss wird auf den rohen Höhen berechnet, weil die
    // Bandquantisierung die Feinstruktur der Senken zerstören würde. Ozean-
    // kacheln und Kartenränder wirken als Auslässe; geschlossene Senken werden
    // zu Seen. Flüsse und Seen erhöhen den Niederschlag ihrer eigenen Kachel und
    // der Nachbarn, bevor daraus Biome abgeleitet werden (siehe ADR-037).
    const hydrology = Hydrology.compute(
      raw.map((tile) => ({
        coord: tile.coord,
        key: tile.key,
        elevationRaw: tile.elevationRaw,
        isOcean: bands[tile.index] === 0,
      }))
    );

    const waterIndices: number[] = [];
    for (let i = 0; i < raw.length; i += 1) {
      if (hydrology.isRiver[i] || hydrology.isLake[i]) waterIndices.push(i);
    }

    const moistened = new Set<number>(waterIndices);
    for (const index of waterIndices) {
      for (const neighbor of HexMath.getNeighbors(raw[index].coord)) {
        const neighborIndex = indexByKey.get(HexMath.coordToKey(neighbor));
        if (neighborIndex !== undefined) moistened.add(neighborIndex);
      }
    }

    for (const index of moistened) {
      if (bands[index] === 0) continue;
      raw[index].rainfall = SurfaceGenerator.clamp01(raw[index].rainfall + 0.15);
    }

    // Aride Welten bleiben auch am Äquator trocken; Kryowelten werden nicht
    // durch Küsten- oder Flussfeuchte in gemäßigte Biome gekippt.
    for (const tile of raw) {
      if (profile.flavor === 'arid') {
        tile.rainfall = Math.min(tile.rainfall, 0.42);
      } else if (profile.flavor === 'frozen') {
        tile.rainfall = Math.min(tile.rainfall, 0.62);
      }
    }

    // Abfluss in ein normalisiertes 0..1-Feld übersetzen. Der maximale Abfluss
    // der Karte dient als Referenz, damit der Wert unabhängig von der Kachelzahl
    // interpretierbar bleibt.
    let maxDischarge = 1;
    for (let i = 0; i < raw.length; i += 1) {
      if (bands[i] !== 0) maxDischarge = Math.max(maxDischarge, hydrology.discharge[i]);
    }
    const dischargeScale = Math.max(1, Math.log2(1 + maxDischarge));
    for (let i = 0; i < raw.length; i += 1) {
      const normalized = Math.log2(1 + hydrology.discharge[i]) / dischargeScale;
      raw[i].drainage = SurfaceGenerator.clamp01(normalized);
      if (hydrology.isLake[i]) raw[i].drainage = Math.max(raw[i].drainage, 0.7);
    }

    // --- Phase 4: Biome & Kacheln erzeugen -----------------------------------
    const tiles: PlanetHexTile[] = [];
    const hazardThreshold = planet.habitability < 40 ? 0.25 : 0.08;

    for (const tile of raw) {
      const band = bands[tile.index];
      const isProtected = protectedIndices.has(tile.index);

      // Die Landezone ist siedlungsfähiges Land: lebensfeindliche Biome im
      // geschützten Bereich werden auf ertragreiches Tiefland bzw. Hügel
      // abgebildet, damit eine junge Kolonie überhaupt Nahrung erwirtschaften
      // kann (siehe ADR-034).
      const rawBiome = SurfaceGenerator.deriveBiome(band, profile, tile, {
        isRiver: hydrology.isRiver[tile.index],
        isLake: hydrology.isLake[tile.index],
      });
      const biome = isProtected ? SurfaceGenerator.ensureArableBiome(band, rawBiome) : rawBiome;

      // Ressourcenvorkommen: Zufall wird für jede Kachel gezogen, damit der
      // Zufallsstrom unabhängig vom Biom stabil bleibt.
      let deposit: ResourceDepositType = 'none';
      const depositRoll = rng.next();
      if (biome !== 'ocean' && biome !== 'gas' && biome !== 'lava' && depositRoll < 0.28) {
        deposit = SurfaceGenerator.pickDeposit(rng.next(), biome);
      }

      // Umweltgefahren: Die gesamte Landezone bleibt immer gefahrlos. Wildheit
      // verschiebt die Hazard-Wahrscheinlichkeit leicht, ohne die Landezone
      // anzutasten.
      const hazardRoll = rng.next();
      const adjustedHazardThreshold = SurfaceGenerator.clamp01(
        hazardThreshold + (tile.savagery - 0.5) * 0.12
      );
      const hasHazard =
        biome !== 'gas' && hazardRoll < adjustedHazardThreshold && !isProtected;
      const hazardDescription = hasHazard ? SurfaceGenerator.getHazardDescription(biome, rng) : undefined;

      // Hydrologie: Nur Flüsse und Seen tragen eine Fließrichtung; Ozeane sind
      // Auslässe und damit zugleich ohne Ziel und ohne Abfluss.
      const flowTarget = hydrology.flowTarget[tile.index];
      const hasSurfaceWater = hydrology.isRiver[tile.index] || hydrology.isLake[tile.index];

      tiles.push({
        coord: tile.coord,
        key: tile.key,
        biome,
        elevation: band,
        deposit,
        isDepositDiscovered: false, // Initially hidden until explored or scanned
        hasHazard,
        hazardDescription,
        claimedByColonyId: null,
        claimedByCivId: null,
        isCityCenter: false,
        isWorked: false,
        isWorkPrioritized: false,
        isWorkLocked: false,
        buildingInstanceId: null,
        districtInstanceId: null,
        visibility: 'unseen', // Explored gradually
        terraformedStatus: 'native',
        riverDischarge: band === 0 ? 0 : hydrology.discharge[tile.index],
        flowsTo: band !== 0 && hasSurfaceWater && flowTarget !== null ? raw[flowTarget].key : null,
        isLake: hydrology.isLake[tile.index],
        temperature: tile.temperature,
        rainfall: tile.rainfall,
        drainage: tile.drainage,
        savagery: tile.savagery,
      });
    }

    // Letzte Absicherung: Die Landquote wird an den tatsächlich erzeugten
    // Kacheln gemessen, nicht an einer Schätzung. Da dies vor der Rückgabe und
    // damit vor Gebäuden, Claims oder Ressourcen geschieht, ist eine Umwandlung
    // überschüssiger Landkacheln konsistenzfrei.
    if (oceanLandCap !== undefined) {
      SurfaceGenerator.enforceOceanLandCap(tiles, oceanLandCap, protectedIndices);
    }

    // coreIndex wird nur für die Landezonen-Reparatur benötigt; die Variable
    // bleibt als bewusster Guard gegen künftige Refactorings erhalten.
    void coreIndex;

    return {
      planetId: planet.id,
      width,
      height,
      generatorVersion: SurfaceGenerator.GENERATOR_VERSION,
      seed: surfaceSeedStr,
      tiles,
    };
  }

  /**
   * Gasriesen-Oberfläche als Platzhalter: keine feste Kruste, keine Ozeane,
   * keine Hydrologie. Die Klimafelder dienen der Darstellung als Wolkengürtel.
   */
  private static generateGasSurface(
    planet: Planet,
    surfaceSeedStr: string,
    raw: RawTile[],
    width: number,
    height: number
  ): PlanetSurface {
    const tiles: PlanetHexTile[] = raw.map((tile) => ({
      coord: tile.coord,
      key: tile.key,
      biome: 'gas',
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
      districtInstanceId: null,
      visibility: 'unseen',
      terraformedStatus: 'native',
      riverDischarge: 0,
      flowsTo: null,
      isLake: false,
      temperature: tile.temperature,
      rainfall: tile.rainfall,
      drainage: 0,
      savagery: tile.savagery,
    }));

    return {
      planetId: planet.id,
      width,
      height,
      generatorVersion: SurfaceGenerator.GENERATOR_VERSION,
      seed: surfaceSeedStr,
      tiles,
    };
  }

  private static clamp01(value: number): number {
    return value < 0 ? 0 : value > 1 ? 1 : value;
  }

  /**
   * DF-nahe Niederschlagsgürtel: feucht am Äquator, trocken in den Subtropen,
   * feucht in den Mittelbreiten und trocken an den Polen. `latitude` ist 1 am
   * Äquator und 0 an den Polen.
   */
  private static latitudeRainfall(latitude: number): number {
    const poleward = 1 - latitude;
    const equatorial = Math.exp(-Math.pow(poleward / 0.22, 2)) * 0.55;
    const temperate = Math.exp(-Math.pow((poleward - 0.55) / 0.18, 2)) * 0.35;
    const subtropicalDry = Math.exp(-Math.pow((poleward - 0.32) / 0.12, 2)) * 0.35;
    return SurfaceGenerator.clamp01(0.15 + equatorial + temperate - subtropicalDry);
  }

  /**
   * Koppelt Temperatur an die Höhe und Niederschlag an Küstennähe sowie
   * orografischen Regenschatten (Wind von Westen). Die Bänder müssen bereits
   * bestimmt sein, weil nur Landkacheln betrachtet werden.
   */
  private static applyClimateModifiers(
    raw: RawTile[],
    bands: Uint8Array,
    indexByKey: Map<string, number>
  ): void {
    const n = raw.length;
    if (n === 0) return;

    // Höhenlapse: Mittelland und Hochland kühlen aus.
    for (const tile of raw) {
      const band = bands[tile.index];
      const lapse = band === 3 ? 0.22 : band === 2 ? 0.08 : 0;
      tile.temperature = SurfaceGenerator.clamp01(tile.temperature - lapse);
    }

    // Küstenabstand per Multi-Source-BFS von allen Ozeankacheln.
    const coastDistance = new Int32Array(n);
    coastDistance.fill(-1);
    const queue: number[] = [];
    for (const tile of raw) {
      if (bands[tile.index] === 0) {
        coastDistance[tile.index] = 0;
        queue.push(tile.index);
      }
    }
    let head = 0;
    while (head < queue.length) {
      const current = queue[head];
      head += 1;
      const nextDistance = coastDistance[current] + 1;
      for (const neighbor of HexMath.getNeighbors(raw[current].coord)) {
        const neighborIndex = indexByKey.get(HexMath.coordToKey(neighbor));
        if (neighborIndex === undefined || coastDistance[neighborIndex] !== -1) continue;
        coastDistance[neighborIndex] = nextDistance;
        queue.push(neighborIndex);
      }
    }

    for (const tile of raw) {
      if (bands[tile.index] === 0) continue;

      // Küstenfeuchte: je näher am Ozean, desto mehr Verdunstungsniederschlag.
      if (coastDistance[tile.index] >= 0) {
        const coastal = Math.max(0, 1 - coastDistance[tile.index] / 4) * 0.12;
        tile.rainfall = SurfaceGenerator.clamp01(tile.rainfall + coastal);
      }

      // Orografie: Aufwind an der Westflanke bringt Regen, die Ostflanke liegt
      // im Regenschatten. Der westlichste Nachbar gilt als Luvseite.
      let upwind: RawTile | null = null;
      for (const neighbor of HexMath.getNeighbors(tile.coord)) {
        const neighborIndex = indexByKey.get(HexMath.coordToKey(neighbor));
        if (neighborIndex === undefined) continue;
        const candidate = raw[neighborIndex];
        if (
          upwind === null ||
          candidate.coord.q < upwind.coord.q ||
          (candidate.coord.q === upwind.coord.q && candidate.coord.r < upwind.coord.r)
        ) {
          upwind = candidate;
        }
      }

      if (upwind) {
        const lift = tile.elevationRaw - upwind.elevationRaw;
        tile.rainfall = SurfaceGenerator.clamp01(
          tile.rainfall + (lift > 0 ? lift * 0.9 : lift * 0.45)
        );
      }
    }
  }

  private static getProfile(type: Planet['planetType']): PlanetProfile {
    switch (type) {
      case 'ocean':
        return {
          seaFraction: 0.9,
          landBandWeights: [0.7, 0.25, 0.05],
          temperatureBase: 0.55,
          moistureBase: 0.55,
          volcanismBase: 0.1,
          savageryBase: 0.25,
          flavor: 'terran',
          hostile: false,
        };
      case 'desert':
        return {
          seaFraction: 0.02,
          landBandWeights: [0.65, 0.28, 0.07],
          temperatureBase: 0.85,
          moistureBase: 0.12,
          volcanismBase: 0.15,
          savageryBase: 0.35,
          flavor: 'arid',
          hostile: false,
        };
      case 'ice':
        return {
          seaFraction: 0.35,
          landBandWeights: [0.5, 0.35, 0.15],
          temperatureBase: 0.1,
          moistureBase: 0.45,
          volcanismBase: 0.1,
          savageryBase: 0.2,
          flavor: 'frozen',
          hostile: false,
        };
      case 'volcanic':
        return {
          seaFraction: 0.02,
          landBandWeights: [0.35, 0.45, 0.2],
          temperatureBase: 0.95,
          moistureBase: 0.3,
          volcanismBase: 0.9,
          savageryBase: 0.8,
          flavor: 'volcanic',
          hostile: true,
        };
      case 'toxic':
        return {
          seaFraction: 0.1,
          landBandWeights: [0.45, 0.35, 0.2],
          temperatureBase: 0.7,
          moistureBase: 0.38,
          volcanismBase: 0.5,
          savageryBase: 0.9,
          flavor: 'toxic',
          hostile: true,
        };
      case 'xeno':
        return {
          seaFraction: 0.24,
          landBandWeights: [0.5, 0.32, 0.18],
          temperatureBase: 0.6,
          moistureBase: 0.6,
          volcanismBase: 0.35,
          savageryBase: 0.9,
          flavor: 'xeno',
          hostile: true,
        };
      case 'gas_giant':
        return {
          seaFraction: 0,
          landBandWeights: [0.3, 0.4, 0.3],
          temperatureBase: 0.6,
          moistureBase: 0.35,
          volcanismBase: 0.6,
          savageryBase: 0.7,
          flavor: 'gas',
          hostile: true,
        };
      case 'rocky':
      default:
        return {
          seaFraction: 0.2,
          landBandWeights: [0.55, 0.33, 0.12],
          temperatureBase: 0.5,
          moistureBase: 0.45,
          volcanismBase: 0.2,
          savageryBase: 0.3,
          flavor: 'terran',
          hostile: false,
        };
    }
  }

  /**
   * Ordnet jeder Kachel anhand der Elevation ein Höhenband zu.
   * 0 = Meer, 1 = Tiefland, 2 = Mittelland, 3 = Hochland.
   *
   * Die Zuordnung erfolgt über Quantile der sortierten Rohelevation, damit der
   * Meeresanteil exakt dem Profil entspricht und ein Landplanet nicht zufällig
   * vollständig überschwemmt wird.
   */
  private static assignBands(
    raw: RawTile[],
    profile: PlanetProfile,
    maxLandCount?: number
  ): Uint8Array {
    const n = raw.length;
    const bands = new Uint8Array(n);
    if (n === 0) return bands;

    const order = raw.map((tile) => tile.index);
    order.sort((a, b) => {
      const diff = raw[a].elevationRaw - raw[b].elevationRaw;
      if (diff !== 0) return diff;
      // Stabile, ortsunabhängige Tie-Break-Reihenfolge.
      return raw[a].key < raw[b].key ? -1 : raw[a].key > raw[b].key ? 1 : 0;
    });

    let seaCount = Math.round(n * profile.seaFraction);
    if (seaCount < 0) seaCount = 0;
    if (seaCount > n) seaCount = n;

    let landCount = n - seaCount;

    // Ozeanwelten: Landmenge hart auf die berechnete Obergrenze begrenzen.
    if (maxLandCount !== undefined && landCount > maxLandCount) {
      landCount = Math.max(0, maxLandCount);
      seaCount = n - landCount;
    }

    if (landCount < 1) {
      if (maxLandCount !== undefined && maxLandCount < 1) {
        // Extrem kleine Karte: 15 % ergeben 0 ganze Landkacheln. Dann bleibt
        // die Welt vollständig Wasser; es wird keine Regelverletzung erzeugt.
        seaCount = n;
        landCount = 0;
      } else {
        // Schutz: Mindestens eine Landkachel bleibt für die Landezone erhalten.
        seaCount = n - 1;
        landCount = 1;
      }
    }

    let highCount = landCount >= 3 ? Math.max(1, Math.round(landCount * profile.landBandWeights[2])) : 0;
    if (highCount > landCount) highCount = landCount;

    let midCount = Math.min(
      landCount - highCount,
      Math.max(0, Math.round(landCount * profile.landBandWeights[1]))
    );
    const lowCount = Math.max(0, landCount - highCount - midCount);

    const lowEnd = seaCount + lowCount;
    const midEnd = lowEnd + midCount;

    for (let i = 0; i < n; i++) {
      const idx = order[i];
      if (i < seaCount) bands[idx] = 0;
      else if (i < lowEnd) bands[idx] = 1;
      else if (i < midEnd) bands[idx] = 2;
      else bands[idx] = 3;
    }

    return bands;
  }

  /**
   * Stellt sicher, dass der vorgesehene Landeplatz und seine unmittelbaren
   * Nachbarn passierbares Land sind (Band 1 oder 2).
   *
   * Die Reparatur tauscht Bänder mit unbeteiligten Kacheln, sodass die
   * Gesamtanzahl von Meeres- und Hochlandkacheln unverändert bleibt. Der
   * Landepunkt wird aus der Kartenmitte abgeleitet und über einen Key-Lookup
   * gesucht – nicht über Zeilenarithmetik, da die Axialkoordinaten je Zeile
   * versetzt beginnen.
   *
   * @returns Kernkachel und die geschützte Landezone (Kern plus Nachbarn).
   */
  private static repairLandingZone(
    raw: RawTile[],
    bands: Uint8Array,
    width: number,
    height: number,
    oceanLandCap?: number
  ): { coreIndex: number; protectedIndices: Set<number> } {
    if (raw.length === 0) return { coreIndex: -1, protectedIndices: new Set<number>() };

    const indexByKey = new Map<string, number>();
    for (const tile of raw) indexByKey.set(tile.key, tile.index);

    const coreCoord: HexCoord = { q: Math.floor(width / 4), r: Math.floor(height / 2) };
    const coreIndex = indexByKey.get(HexMath.coordToKey(coreCoord));
    if (coreIndex === undefined) return { coreIndex: -1, protectedIndices: new Set<number>() };

    const protectedIndices = new Set<number>([coreIndex]);

    // Auf Ozeanwelten darf die Landezone keine zusätzlichen Landkacheln
    // erzeugen. Statt neues Land zu schaffen, wird vorhandenes Land aus
    // abgelegenen Kacheln in den Landebereich *verschoben*: Der Spender wird
    // Ozean, die Zielkachel Land. Die Gesamtzahl der Landkacheln bleibt damit
    // exakt gleich und die 15-%-Grenze wird nie verletzt. So entsteht dennoch
    // eine bebaubare Insel um das Koloniezentrum.
    if (oceanLandCap !== undefined) {
      if (oceanLandCap < 1) {
        return { coreIndex: -1, protectedIndices: new Set<number>() };
      }

      const ringIndices = HexMath.getNeighbors(coreCoord)
        .map((neighbor) => indexByKey.get(HexMath.coordToKey(neighbor)))
        .filter((idx): idx is number => idx !== undefined)
        .sort((a, b) => (raw[a].key < raw[b].key ? -1 : raw[a].key > raw[b].key ? 1 : 0));

      // Kern zuerst, dann bis zu drei Nachbarn: das entspricht der
      // Anfangsbeanspruchung einer Kolonie und schafft echte Bauplätze.
      const targets = [coreIndex, ...ringIndices.slice(0, 3)];
      const targetSet = new Set<number>(targets);

      const donors = raw
        .filter((candidate) => bands[candidate.index] > 0 && !targetSet.has(candidate.index))
        .sort((a, b) => {
          const bandDelta = bands[a.index] - bands[b.index];
          if (bandDelta !== 0) return bandDelta;
          return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
        });
      let donorIndex = 0;

      for (const target of targets) {
        if (bands[target] > 0) {
          // Bereits Land: nur schützen, nichts tauschen.
          protectedIndices.add(target);
          continue;
        }
        const donor = donors[donorIndex];
        if (!donor) break;
        donorIndex += 1;
        bands[donor.index] = 0;
        bands[target] = 1;
        protectedIndices.add(target);
      }

      if (bands[coreIndex] === 0) {
        // Keine Landkachel vorhanden: keine erzwungene Landezone.
        return { coreIndex: -1, protectedIndices: new Set<number>() };
      }
    } else {
      for (const neighbor of HexMath.getNeighbors(coreCoord)) {
        const idx = indexByKey.get(HexMath.coordToKey(neighbor));
        if (idx !== undefined) protectedIndices.add(idx);
      }
    }

    const ensurePassable = (idx: number): void => {
      const band = bands[idx];
      if (band === 1 || band === 2) return;
      if (oceanLandCap !== undefined && band === 0) return; // Ozean bleibt Ozean.

      // Bevorzugt Tausch mit Tiefland, damit die Landezone flach bleibt.
      for (const candidate of raw) {
        if (protectedIndices.has(candidate.index)) continue;
        if (bands[candidate.index] !== 1) continue;
        bands[candidate.index] = band;
        bands[idx] = 1;
        return;
      }

      // Ersatzweise Mittelland (weiterhin passierbar).
      for (const candidate of raw) {
        if (protectedIndices.has(candidate.index)) continue;
        if (bands[candidate.index] !== 2) continue;
        bands[candidate.index] = band;
        bands[idx] = 2;
        return;
      }

      // Letzter Ausweg (sehr kleine Karten): Band direkt setzen. Auf
      // Ozeanwelten ist die Kachel bereits Land, daher bleibt die Anzahl gleich.
      bands[idx] = 1;
    };

    // Deterministische Reihenfolge: Kern zuerst, dann Nachbarn in Key-Sortierung.
    ensurePassable(coreIndex);
    const neighborIndices = [...protectedIndices]
      .filter((idx) => idx !== coreIndex)
      .sort((a, b) => (raw[a].key < raw[b].key ? -1 : raw[a].key > raw[b].key ? 1 : 0));
    for (const idx of neighborIndices) ensurePassable(idx);

    return { coreIndex, protectedIndices };
  }

  /**
   * Entfernt auf Ozeanwelten jede Landkachel, die die harte 15-%-Grenze
   * überschreiten würde. Die Umwandlung geschieht ausschließlich während der
   * Generierung und räumt alle wasserbezogenen Felder mit auf, damit keine
   * halben Land-/Wasserdaten zurückbleiben.
   */
  private static enforceOceanLandCap(
    tiles: PlanetHexTile[],
    maxLandCount: number,
    protectedIndices: Set<number>
  ): void {
    let landCount = tiles.filter((tile) => tile.biome !== 'ocean').length;
    if (landCount <= maxLandCount) return;

    const candidates = tiles
      .filter((tile) => tile.biome !== 'ocean')
      .filter((tile) => {
        const index = tiles.indexOf(tile);
        return !protectedIndices.has(index);
      })
      .sort((a, b) => {
        if (a.elevation !== b.elevation) return a.elevation - b.elevation;
        return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
      });

    for (const tile of candidates) {
      if (landCount <= maxLandCount) break;
      tile.biome = 'ocean';
      tile.elevation = 0;
      tile.deposit = 'none';
      tile.isDepositDiscovered = false;
      tile.hasHazard = false;
      tile.hazardDescription = undefined;
      tile.riverDischarge = 0;
      tile.flowsTo = null;
      tile.isLake = false;
      landCount -= 1;
    }
  }

  /**
   * Bildet Biome innerhalb der Landezone auf siedlungsfähiges Land ab.
   *
   * Nur Biome mit ausreichendem Nahrungsertrag bleiben erhalten; Gletscher,
   * Wüsten, Tundra, Vulkan-, Lava-, Gift- und Gasflächen werden zu Tiefland,
   * vulkanische Hügel zu gewöhnlichen Hügeln.
   */
  private static ensureArableBiome(band: number, biome: HexBiome): HexBiome {
    if (band === 1) {
      return biome === 'plains' ||
        biome === 'forest' ||
        biome === 'jungle' ||
        biome === 'marsh' ||
        biome === 'fungal_forest'
        ? biome
        : 'plains';
    }
    if (band === 2) {
      return biome === 'volcanic' ||
        biome === 'lava' ||
        biome === 'toxic' ||
        biome === 'gas' ||
        biome === 'snow'
        ? 'hills'
        : biome;
    }
    return biome;
  }

  /**
   * Leitet das Biom aus Höhenband, Klima, Wasser und Wildheit ab.
   *
   * Höhenband bestimmt die Grundklasse (Meer, Tiefland, Mittelland, Hochland);
   * Temperatur, Niederschlag, Abfluss, Vulkanismus, Impakt und Savagery
   * differenzieren innerhalb des Tieflands. Die Matrix ist an die
   * Weltgenerierung von Dwarf Fortress angelehnt, aber eigenständig kalibriert.
   */
  private static deriveBiome(
    band: number,
    profile: PlanetProfile,
    tile: RawTile,
    water: { isRiver: boolean; isLake: boolean }
  ): HexBiome {
    // Vulkanwelten besitzen Lavaseen statt Wasser; alle anderen Typen Ozeane.
    if (band === 0) return profile.flavor === 'volcanic' ? 'lava' : 'ocean';

    const { temperature, rainfall, volcanism, impact, savagery, drainage } = tile;

    // Vulkanwelten: Lavaseen in den tiefsten und vulkanisch aktivsten Zonen.
    if (profile.flavor === 'volcanic') {
      if (band === 3) return 'mountains';
      if (volcanism > 0.58) return 'lava';
      if (band === 2) return volcanism > 0.42 ? 'volcanic' : 'hills';
      return 'volcanic';
    }

    // Giftwelten: Xenoflora in feuchten Becken, Schwefelauen sonst.
    if (profile.flavor === 'toxic') {
      if (band === 3) return 'mountains';
      if (volcanism > 0.7) return 'lava';
      if (band === 2) return volcanism > 0.55 ? 'volcanic' : 'hills';
      return rainfall > 0.5 ? 'alien' : 'toxic';
    }

    // Xenowelten: eigenständige, aber aus vorhandenen Biomen zusammengesetzte
    // Umwelt. Keine neuen Biomtypen und keine Sonderregeln außerhalb des
    // bestehenden Biomkatalogs.
    if (profile.flavor === 'xeno') {
      if (band === 3) return 'mountains';
      if (band === 2) return savagery > 0.78 ? 'alien' : 'hills';
      if (impact > 0.9) return 'impact_crater';
      if (water.isLake || (water.isRiver && drainage > 0.45)) return 'marsh';
      if (temperature < 0.2) return 'tundra';
      if (rainfall > 0.62 && savagery > 0.55) return 'fungal_forest';
      if (rainfall > 0.56) return 'jungle';
      if (rainfall > 0.4) return 'forest';
      if (rainfall < 0.24) return 'desert';
      if (savagery > 0.72) return 'alien';
      return 'plains';
    }

    if (band === 3) return 'mountains';

    if (band === 2) {
      if (volcanism > 0.6) return 'volcanic';
      if (temperature < 0.18) return 'snow';
      return 'hills';
    }

    // --- Tiefland (Band 1) ---------------------------------------------------
    if (impact > 0.87) return 'impact_crater';

    if (temperature < 0.16) return 'snow';
    if (temperature < 0.3) return 'tundra';

    // Ufer und Flussniederungen sind feucht und fruchtbar. Der Abflusswert
    // verhindert, dass winzige Rinnsale die ganze Wüste in Marsch verwandeln.
    if (water.isLake || (water.isRiver && drainage > 0.5 && rainfall > 0.28)) {
      return 'marsh';
    }

    // Wüstenwelten bleiben flächig arid; nur seltene Feuchtgebiete und die
    // geschützte Landezone tragen dichtere Vegetation.
    if (profile.flavor === 'arid') {
      return rainfall > 0.38 && temperature > 0.5 ? 'plains' : 'desert';
    }

    if (rainfall < 0.2 && temperature > 0.3) return 'desert';

    // DF-nahe Savagery: seltene Xeno- und Pilzökosysteme auf wilden Welten.
    if (savagery > 0.84 && rainfall > 0.5 && temperature > 0.35) return 'alien';
    if (savagery > 0.74 && rainfall > 0.55 && temperature > 0.3) return 'fungal_forest';

    if (temperature > 0.58 && rainfall > 0.62) return 'jungle';
    if (rainfall > 0.48) return 'forest';
    if (rainfall < 0.27) return temperature > 0.55 ? 'desert' : 'plains';
    return 'plains';
  }

  private static pickDeposit(roll: number, biome: HexBiome): ResourceDepositType {
    if (
      biome === 'plains' ||
      biome === 'forest' ||
      biome === 'jungle' ||
      biome === 'marsh' ||
      biome === 'fungal_forest' ||
      biome === 'alien'
    ) {
      if (roll < 0.5) return 'rich_soil';
      if (roll < 0.8) return 'hydrocarbon_spring';
      return 'ancient_ruins';
    }
    if (biome === 'hills' || biome === 'mountains' || biome === 'snow') {
      if (roll < 0.45) return 'deep_mineral_vein';
      if (roll < 0.8) return 'titanium_strata';
      return 'crystalline_matrix';
    }
    if (biome === 'volcanic' || biome === 'lava' || biome === 'desert') {
      if (roll < 0.4) return 'hydrocarbon_spring';
      if (roll < 0.75) return 'helium3_vent';
      return 'titanium_strata';
    }
    if (biome === 'impact_crater') {
      return roll < 0.5 ? 'crystalline_matrix' : 'ancient_ruins';
    }
    return 'deep_mineral_vein';
  }

  private static getHazardDescription(biome: HexBiome, rng: Mulberry32): string {
    if (biome === 'lava' || biome === 'volcanic') {
      const volcanicHazards = [
        'Instabiler Lavastrom',
        'Plötzliche Magmaeruption',
        'Giftige Schwefelgase',
      ];
      return volcanicHazards[rng.nextInt(0, volcanicHazards.length - 1)];
    }

    const hazards = [
      'Starke seismische Verwerfung',
      'Ionische Mikro-Entladungen',
      'Toxische Gasaustritte',
      'Extremer Strahlungsgradient',
      'Unstabile thermische Zerrüttung',
    ];
    return hazards[rng.nextInt(0, hazards.length - 1)];
  }
}
