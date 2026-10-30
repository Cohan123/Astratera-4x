/**
 * Astraea 4X - Seeded Pseudo-Random Number Generator (PRNG)
 * Implementation of Mulberry32 algorithm.
 * Guarantees 100% deterministic, reproducible galaxy generation.
 */

export class SeededPRNG {
  private state: number;
  public readonly seedString: string;

  constructor(seed: string | number) {
    this.seedString = String(seed);
    this.state = this.hashString(this.seedString);
    if (this.state === 0) {
      this.state = 1;
    }
  }

  /**
   * Hashes any string into a 32-bit unsigned integer
   */
  private hashString(str: string): number {
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  /**
   * Returns a float in [0, 1)
   */
  public next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Returns an integer in [min, max] inclusive
   */
  public nextInt(min: number, max: number): number {
    if (min > max) {
      const temp = min;
      min = max;
      max = temp;
    }
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /**
   * Returns a float in [min, max)
   */
  public nextFloat(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /**
   * Picks a random element from an array
   */
  public pick<T>(array: readonly T[]): T {
    if (array.length === 0) {
      throw new Error('Cannot pick from empty array');
    }
    const index = Math.floor(this.next() * array.length);
    return array[index];
  }

  /**
   * Weighted random selection
   */
  public pickWeighted<T>(items: Array<{ item: T; weight: number }>): T {
    const totalWeight = items.reduce((sum, current) => sum + current.weight, 0);
    let randomWeight = this.next() * totalWeight;

    for (const entry of items) {
      if (randomWeight < entry.weight) {
        return entry.item;
      }
      randomWeight -= entry.weight;
    }

    return items[items.length - 1].item;
  }
}

export { SeededPRNG as Mulberry32 };
