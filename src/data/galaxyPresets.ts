/**
 * Astraea 4X - Galaxy Presets & Defaults
 */
import { GalaxyConfig, GalaxySize } from '../core/types.ts';

export interface GalaxySizeOption {
  id: GalaxySize;
  label: string;
  sublabel: string;
  systemCount: number;
  width: number;
  height: number;
  minDistance: number;
}

export const GALAXY_SIZE_PRESETS: Record<GalaxySize, GalaxySizeOption> = {
  small: {
    id: 'small',
    label: 'Klein',
    sublabel: '25 Sternensysteme · 700 × 700 Lj',
    systemCount: 25,
    width: 700,
    height: 700,
    minDistance: 60,
  },
  medium: {
    id: 'medium',
    label: 'Mittel (Standard)',
    sublabel: '55 Sternensysteme · 1200 × 1200 Lj',
    systemCount: 55,
    width: 1200,
    height: 1200,
    minDistance: 70,
  },
  large: {
    id: 'large',
    label: 'Groß',
    sublabel: '100 Sternensysteme · 1800 × 1800 Lj',
    systemCount: 100,
    width: 1800,
    height: 1800,
    minDistance: 75,
  },
  huge: {
    id: 'huge',
    label: 'Episch',
    sublabel: '160 Sternensysteme · 2400 × 2400 Lj',
    systemCount: 160,
    width: 2400,
    height: 2400,
    minDistance: 80,
  },
};

export const DEFAULT_GALAXY_CONFIG: GalaxyConfig = {
  size: 'medium',
  systemCount: GALAXY_SIZE_PRESETS.medium.systemCount,
  width: GALAXY_SIZE_PRESETS.medium.width,
  height: GALAXY_SIZE_PRESETS.medium.height,
  minDistance: GALAXY_SIZE_PRESETS.medium.minDistance,
  shape: 'spiral',
  seed: 'ASTRAEA-77',
};
