/**
 * Astraea 4X - Deterministische Wertrausch-Felder für Planetenoberflächen
 *
 * Eigene, bewusst einfache Implementierung eines gitterbasierten Value-Noise.
 * Das Rauschen ist vollständig deterministisch an einen Seed gebunden, damit
 * Oberflächen reproduzierbar bleiben und gespeicherte Karten nicht wandern.
 *
 * Die hier erzeugten Felder liefern die räumlich kohärente Grundlage für die
 * Biom- und Elevationsverteilung in `surfaceGenerator.ts` (angelehnt an das
 * mehrstufige Feldmodell klassischer Weltengeneratoren, aber eigenständig
 * parametrisiert).
 */

export class ValueNoise2D {
  private readonly seed: number;

  constructor(seed: string | number) {
    this.seed = typeof seed === 'number' ? seed >>> 0 : ValueNoise2D.hashString(seed);
  }

  /**
   * FNV-1a-Hash für String-Seeds (identisches Verfahren wie `SeededPRNG`,
   * damit ein Seed im gesamten Generator dieselbe Bedeutung hat).
   */
  private static hashString(value: string): number {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  /**
   * Hasht einen Gitterpunkt auf einen stabilen Wert in [0, 1).
   */
  private lattice(ix: number, iy: number): number {
    let h = this.seed;
    h = Math.imul(h ^ (ix | 0), 0x27d4eb2d);
    h = Math.imul(h ^ (iy | 0), 0x165667b1);
    h ^= h >>> 15;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  /**
   * Weiche Interpolation (Quintic-Smoothstep) reduziert sichtbare Gitterkanten.
   */
  private static smooth(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private static lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  /**
   * Einzelne Rauschprobe in [0, 1].
   */
  public sample(x: number, y: number): number {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = ValueNoise2D.smooth(x - x0);
    const ty = ValueNoise2D.smooth(y - y0);

    const n00 = this.lattice(x0, y0);
    const n10 = this.lattice(x0 + 1, y0);
    const n01 = this.lattice(x0, y0 + 1);
    const n11 = this.lattice(x0 + 1, y0 + 1);

    const top = ValueNoise2D.lerp(n00, n10, tx);
    const bottom = ValueNoise2D.lerp(n01, n11, tx);
    return ValueNoise2D.lerp(top, bottom, ty);
  }

  /**
   * Fraktales Rauschen aus mehreren Oktaven, auf [0, 1] normalisiert.
   */
  public fractal(x: number, y: number, octaves: number = 3, persistence: number = 0.5, lacunarity: number = 2): number {
    let amplitude = 1;
    let frequency = 1;
    let sum = 0;
    let weight = 0;

    for (let i = 0; i < octaves; i++) {
      sum += amplitude * this.sample(x * frequency + i * 17.31, y * frequency + i * 9.73);
      weight += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }

    return weight > 0 ? sum / weight : 0;
  }
}
