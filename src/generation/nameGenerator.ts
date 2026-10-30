/**
 * Astraea 4X - Procedural Star System Name Generator
 * Uses authentic astronomical naming conventions, sci-fi star systems, and catalogs.
 */
import { SeededPRNG } from './prng.ts';

const STAR_ROOT_NAMES = [
  'Aethel', 'Aldebaran', 'Altair', 'Alcyone', 'Antares', 'Aquila', 'Arcturus', 'Astraea',
  'Bellatrix', 'Betelgeuse', 'Canopus', 'Capella', 'Cassiopeia', 'Castor', 'Cygnus',
  'Deneb', 'Dorado', 'Epsilon', 'Eridanus', 'Fomalhaut', 'Hydra', 'Hyperion', 'Kepler',
  'Lyra', 'Mirach', 'Naos', 'Nemesis', 'Nexus', 'Nirvana', 'Oberon', 'Ophiuchus', 'Orion',
  'Pegasus', 'Perseus', 'Polaris', 'Pollux', 'Procyon', 'Regulus', 'Rigel', 'Sargas',
  'Sedna', 'Sirius', 'Spica', 'Talitha', 'Tarazed', 'Taurus', 'Thuban', 'Titan', 'Trappist',
  'Vega', 'Vela', 'Vespera', 'Volans', 'Vulpecula', 'Wezen', 'Zaurak', 'Zeta', 'Zosma'
];

const GREEK_PREFIXES = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Theta', 'Sigma', 'Omega'];
const SECTOR_SUFFIXES = ['Prime', 'Major', 'Minor', 'Secundus', 'Nexus', 'Gate', 'Reach', 'Station', 'Terminus', 'Horizon'];

export class StarNameGenerator {
  private prng: SeededPRNG;
  private usedNames: Set<string> = new Set();

  constructor(prng: SeededPRNG) {
    this.prng = prng;
  }

  public generateUniqueName(): string {
    let attempts = 0;
    while (attempts < 500) {
      attempts++;
      const name = this.generateCandidateName();
      if (!this.usedNames.has(name)) {
        this.usedNames.add(name);
        return name;
      }
    }
    // Fallback if space is exhausted
    const fallback = `Solari-${this.prng.nextInt(100, 999)}`;
    this.usedNames.add(fallback);
    return fallback;
  }

  private generateCandidateName(): string {
    const roll = this.prng.next();

    // 40% Mythological/Astronomical root + optional Suffix
    if (roll < 0.45) {
      const root = this.prng.pick(STAR_ROOT_NAMES);
      if (this.prng.next() < 0.35) {
        return `${root} ${this.prng.pick(SECTOR_SUFFIXES)}`;
      }
      return root;
    }

    // 25% Greek letter + Astronomical Root
    if (roll < 0.70) {
      const greek = this.prng.pick(GREEK_PREFIXES);
      const root = this.prng.pick(STAR_ROOT_NAMES);
      return `${greek} ${root}`;
    }

    // 20% Sci-fi Catalog Code (e.g. Kepler-442, Gliese-667, Trappist-1)
    if (roll < 0.90) {
      const catalog = this.prng.pick(['Kepler', 'Gliese', 'Trappist', 'Ross', 'Wolf', 'HD', 'HIP', 'KOI']);
      const code = this.prng.nextInt(10, 899);
      return `${catalog}-${code}`;
    }

    // 10% Constellation Sector Compound (e.g. Orion-IX, Cygnus-V)
    const root = this.prng.pick(STAR_ROOT_NAMES);
    const roman = this.prng.pick(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']);
    return `${root} ${roman}`;
  }
}
