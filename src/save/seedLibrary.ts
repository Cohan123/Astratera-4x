/**
 * Astraea 4X - Seed-Bibliothek
 *
 * Persistiert Galaxie-Seeds samt Parametern und Generatorversion in
 * localStorage. Ein Eintrag beschreibt ausschließlich, wie eine Galaxie
 * erzeugt wird – niemals einen Spielstand. Das Laden eines Spielstands
 * regeneriert daher nichts.
 */

import { Galaxy, GalaxyConfig } from '../core/types.ts';
import { GalaxyGenerator } from '../generation/galaxyGenerator.ts';
import { SurfaceGenerator } from '../surface/surfaceGenerator.ts';
import { DEFAULT_GALAXY_CONFIG } from '../data/galaxyPresets.ts';

export const SEED_LIBRARY_STORAGE_KEY = 'astraea_4x_seed_library';

/** Obergrenze, damit die Bibliothek nicht unbegrenzt wächst. */
export const MAX_SEED_ENTRIES = 100;

export interface SeedLibraryEntry {
  /** Stabiler Schlüssel, abgeleitet aus Seed und Parametern. */
  id: string;
  /** Anzeigename, standardmäßig der Galaxiename. */
  name: string;
  seed: string;
  config: GalaxyConfig;
  /** Tatsächlich erzeugte Systemanzahl (nach Sanitizing). */
  systemCount: number;
  generatorVersion: number;
  surfaceGeneratorVersion: number;
  createdAt: number;
  lastStartedAt: number;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function getStorage(): StorageLike | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** Normalisiert Parameter, damit gleiche Konfigurationen denselben Schlüssel ergeben. */
export function seedConfigSignature(config: Partial<GalaxyConfig>): string {
  const sanitized = GalaxyGenerator.sanitizeConfig(config);
  return [
    sanitized.seed,
    sanitized.size,
    sanitized.shape,
    sanitized.systemCount,
    sanitized.width,
    sanitized.height,
    sanitized.minDistance,
  ].join('|');
}

function isValidEntry(value: unknown): value is SeedLibraryEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<SeedLibraryEntry>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.seed === 'string' &&
    entry.seed.trim().length > 0 &&
    !!entry.config &&
    typeof entry.config === 'object' &&
    typeof entry.config.seed === 'string'
  );
}

function normalizeEntry(entry: SeedLibraryEntry): SeedLibraryEntry {
  const config = GalaxyGenerator.sanitizeConfig(entry.config);
  return {
    id: entry.id,
    name: entry.name && entry.name.trim().length > 0 ? entry.name : `${config.seed} (${config.systemCount} Systeme)`,
    seed: config.seed,
    config,
    systemCount: entry.systemCount ?? config.systemCount,
    generatorVersion: entry.generatorVersion ?? GalaxyGenerator.GENERATOR_VERSION,
    surfaceGeneratorVersion: entry.surfaceGeneratorVersion ?? SurfaceGenerator.GENERATOR_VERSION,
    createdAt: entry.createdAt ?? Date.now(),
    lastStartedAt: entry.lastStartedAt ?? entry.createdAt ?? Date.now(),
  };
}

export class SeedLibrary {
  /** Liest alle gültigen Einträge, neueste zuerst. */
  public static list(): SeedLibraryEntry[] {
    const storage = getStorage();
    if (!storage) return [];

    try {
      const raw = storage.getItem(SEED_LIBRARY_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      return parsed
        .filter(isValidEntry)
        .map(normalizeEntry)
        .sort((a, b) => b.lastStartedAt - a.lastStartedAt);
    } catch {
      return [];
    }
  }

  public static find(id: string): SeedLibraryEntry | null {
    return SeedLibrary.list().find((entry) => entry.id === id) ?? null;
  }

  /**
   * Legt einen Eintrag an oder aktualisiert ihn (gleicher Seed + gleiche
   * Parameter). Gibt den gespeicherten Eintrag zurück.
   */
  public static upsert(options: {
    config: Partial<GalaxyConfig>;
    name?: string;
    systemCount?: number;
    galaxyName?: string;
  }): SeedLibraryEntry | null {
    const storage = getStorage();
    if (!storage) return null;

    const config = GalaxyGenerator.sanitizeConfig(options.config);
    const id = seedConfigSignature(config);
    const now = Date.now();
    const entries = SeedLibrary.list();
    const existing = entries.find((entry) => entry.id === id);

    const entry: SeedLibraryEntry = {
      id,
      name:
        options.name?.trim() ||
        existing?.name ||
        options.galaxyName ||
        `${config.seed} (${config.systemCount} Systeme)`,
      seed: config.seed,
      config,
      systemCount: options.systemCount ?? existing?.systemCount ?? config.systemCount,
      generatorVersion: GalaxyGenerator.GENERATOR_VERSION,
      surfaceGeneratorVersion: SurfaceGenerator.GENERATOR_VERSION,
      createdAt: existing?.createdAt ?? now,
      lastStartedAt: now,
    };

    const next = [entry, ...entries.filter((candidate) => candidate.id !== id)].slice(0, MAX_SEED_ENTRIES);
    SeedLibrary.write(next);
    return entry;
  }

  /** Merkt sich die Galaxie eines frisch gestarteten Spiels. */
  public static rememberGalaxy(galaxy: Galaxy): SeedLibraryEntry | null {
    return SeedLibrary.upsert({
      config: galaxy.config,
      systemCount: galaxy.systems.length,
      galaxyName: galaxy.name,
    });
  }

  public static rename(id: string, name: string): boolean {
    const entries = SeedLibrary.list();
    const entry = entries.find((candidate) => candidate.id === id);
    if (!entry) return false;
    const trimmed = name.trim();
    if (!trimmed) return false;

    entry.name = trimmed;
    SeedLibrary.write(entries);
    return true;
  }

  public static remove(id: string): boolean {
    const entries = SeedLibrary.list();
    const next = entries.filter((entry) => entry.id !== id);
    if (next.length === entries.length) return false;
    SeedLibrary.write(next);
    return true;
  }

  /** Setzt die Bibliothek vollständig zurück (nur für Tests/Verwaltung). */
  public static clear(): void {
    const storage = getStorage();
    if (!storage) return;
    try {
      storage.removeItem(SEED_LIBRARY_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  /** Konfiguration für einen Neustart mit demselben Seed. */
  public static configFor(entry: SeedLibraryEntry): GalaxyConfig {
    return GalaxyGenerator.sanitizeConfig(entry.config);
  }

  /** Standardkonfiguration für das Anlegeformular. */
  public static defaultConfig(): GalaxyConfig {
    return { ...DEFAULT_GALAXY_CONFIG };
  }

  private static write(entries: SeedLibraryEntry[]): void {
    const storage = getStorage();
    if (!storage) return;
    try {
      storage.setItem(SEED_LIBRARY_STORAGE_KEY, JSON.stringify(entries));
    } catch {
      /* Speicher voll oder gesperrt: Bibliothek bleibt unverändert. */
    }
  }
}
