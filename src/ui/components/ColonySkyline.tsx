/**
 * Astraea 4X - Grafische Kolonieansicht
 *
 * Stellt die errichteten Gebäude als Platzhalter-Silhouetten auf einer
 * perspektivischen Geländefläche dar – angelehnt an die Stadtansicht von
 * Master of Orion 2. Jede Gebäudedefinition hat eine eigene Form (die
 * Hydrokultur-Kuppel etwa eine Halbkugel), bis echte Tiles vorliegen.
 *
 * Die Komponente ist rein darstellend: Sie liest Kolonie und Oberfläche, legt
 * Gebäude deterministisch über `getSkylineBuildings` ab und schreibt nichts.
 */

import React from 'react';
import { BuildingCategory, Colony, PlanetSurface, PlanetType } from '../../core/types.ts';
import {
  getSkylineBuildings,
  getSkylinePalette,
  SKYLINE_VIEWBOX,
  SkylineBuilding,
  SkylineKind,
  SkylinePalette,
} from '../colonySkyline.ts';

interface ColonySkylineProps {
  colony: Colony;
  surface?: PlanetSurface | null;
  /** Planetentyp für die Geländefarben (hat Vorrang vor dem Biom). */
  planetType?: PlanetType;
}

const WALLS = {
  light: '#cbd5e1',
  mid: '#94a3b8',
  dark: '#475569',
  deep: '#1e293b',
  glass: '#7dd3fc',
  warm: '#fde68a',
  shadow: '#020617',
} as const;

const ACCENT_BY_CATEGORY: Record<BuildingCategory, string> = {
  infrastructure: '#22d3ee',
  agriculture: '#4ade80',
  energy: '#fbbf24',
  industry: '#fb923c',
  science: '#a78bfa',
  military: '#fb7185',
};

function hashString(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

interface SpriteProps {
  level: number;
  accent: string;
}

/** Kleine Ausbaustufen-Punkte unter dem Gebäude. */
const LevelPips: React.FC<SpriteProps> = ({ level, accent }) => (
  <g transform="translate(-9, 7)">
    {[0, 1, 2].map((index) => (
      <rect
        key={index}
        x={index * 7}
        y={0}
        width={5}
        height={2}
        rx={1}
        fill={index < level ? accent : '#334155'}
        opacity={index < level ? 0.9 : 0.6}
      />
    ))}
  </g>
);

const CityCenterSprite: React.FC<SpriteProps> = ({ level, accent }) => (
  <g>
    <ellipse cx={0} cy={2} rx={48} ry={8} fill={WALLS.shadow} opacity={0.45} />
    <rect x={-38} y={-28} width={22} height={28} fill={WALLS.dark} />
    <rect x={16} y={-28} width={22} height={28} fill={WALLS.dark} />
    <rect x={-26} y={-46} width={52} height={46} fill={WALLS.mid} stroke={WALLS.deep} strokeWidth={1} />
    {[0, 1, 2].map((row) =>
      [0, 1, 2, 3].map((col) => (
        <rect
          key={`${row}-${col}`}
          x={-21 + col * 11}
          y={-41 + row * 11}
          width={6}
          height={5}
          fill={WALLS.warm}
          opacity={0.75}
        />
      ))
    )}
    <rect x={-19} y={-68} width={38} height={22} fill={WALLS.light} stroke={WALLS.deep} strokeWidth={1} />
    <path d="M -22 -68 A 22 20 0 0 1 22 -68 Z" fill={accent} opacity={0.9} />
    <rect x={-2} y={-104} width={4} height={38} fill={WALLS.light} />
    <circle cx={0} cy={-106} r={3} fill="#fef08a" />
    {level >= 2 && <rect x={-52} y={-20} width={16} height={20} fill={WALLS.dark} />}
    {level >= 3 && <rect x={36} y={-20} width={16} height={20} fill={WALLS.dark} />}
  </g>
);

const HydroDomeSprite: React.FC<SpriteProps> = ({ level, accent }) => {
  const dome = (cx: number, radius: number) => (
    <g key={`${cx}-${radius}`}>
      <path
        d={`M ${cx - radius} 0 A ${radius} ${radius} 0 0 1 ${cx + radius} 0 Z`}
        fill={WALLS.light}
        stroke={WALLS.mid}
        strokeWidth={1}
      />
      <path
        d={`M ${cx - radius * 0.86} ${-radius * 0.34} A ${radius * 0.9} ${radius * 0.9} 0 0 1 ${cx + radius * 0.86} ${-radius * 0.34}`}
        fill="none"
        stroke={accent}
        strokeWidth={1.2}
        opacity={0.7}
      />
      <rect x={cx - 4} y={-6} width={8} height={6} fill={WALLS.deep} />
    </g>
  );
  return (
    <g>
      <ellipse cx={0} cy={2} rx={44} ry={7} fill={WALLS.shadow} opacity={0.4} />
      {dome(0, 26)}
      {level >= 2 && dome(-38, 14)}
      {level >= 3 && dome(38, 15)}
      <path d="M -24 0 H 24" stroke={accent} strokeWidth={1} opacity={0.5} />
    </g>
  );
};

const SolarFieldSprite: React.FC<SpriteProps> = ({ level, accent }) => {
  const panel = (x: number, scale = 1) => (
    <g key={x} transform={`translate(${x}, 0) scale(${scale})`}>
      <polygon
        points="-12,-12 4,-12 10,-28 -6,-28"
        fill="#0e7490"
        stroke={accent}
        strokeWidth={1}
        opacity={0.95}
      />
      <line x1={-9} y1={-17} x2={5} y2={-17} stroke="#a5f3fc" strokeWidth={0.6} opacity={0.6} />
      <line x1={-7} y1={-23} x2={7} y2={-23} stroke="#a5f3fc" strokeWidth={0.6} opacity={0.6} />
      <rect x={-1} y={-14} width={2} height={14} fill={WALLS.dark} />
    </g>
  );
  return (
    <g>
      <ellipse cx={0} cy={2} rx={40} ry={6} fill={WALLS.shadow} opacity={0.4} />
      {panel(-24)}
      {panel(0)}
      {panel(24)}
      {level >= 2 && panel(-38, 0.8)}
      {level >= 3 && panel(38, 0.8)}
    </g>
  );
};

const GeothermalSprite: React.FC<SpriteProps> = ({ level, accent }) => {
  const tower = (x: number, scale: number) => (
    <g key={x} transform={`translate(${x}, 0) scale(${scale})`}>
      <path d="M -16 0 L -10 -38 L 10 -38 L 16 0 Z" fill={WALLS.mid} stroke={WALLS.deep} strokeWidth={1} />
      <ellipse cx={0} cy={-38} rx={10} ry={3} fill={WALLS.light} />
      <ellipse cx={-4} cy={-46} rx={6} ry={4} fill="#e2e8f0" opacity={0.18} />
      <ellipse cx={5} cy={-54} rx={8} ry={5} fill="#e2e8f0" opacity={0.12} />
      <path d="M -12 -10 H 12" stroke={accent} strokeWidth={1.2} opacity={0.7} />
    </g>
  );
  return (
    <g>
      <ellipse cx={0} cy={2} rx={40} ry={7} fill={WALLS.shadow} opacity={0.4} />
      {tower(-10, 1)}
      {level >= 2 && tower(24, 0.75)}
      {level >= 3 && (
        <path d="M -30 -6 H 30" stroke={WALLS.dark} strokeWidth={3} opacity={0.8} />
      )}
    </g>
  );
};

const ExtractorSprite: React.FC<SpriteProps> = ({ level, accent }) => (
  <g>
    <ellipse cx={0} cy={2} rx={42} ry={7} fill={WALLS.shadow} opacity={0.4} />
    <path d="M -42 0 Q -28 -12 -12 0" fill="none" stroke={WALLS.dark} strokeWidth={2} />
    <path d="M -36 -6 Q -25 -19 -10 -7" fill="none" stroke={WALLS.dark} strokeWidth={2} />
    <polygon points="18,0 24,-10 30,0" fill="#a16207" />
    <polygon points="26,0 32,-7 37,0" fill="#ca8a04" />
    <rect x={-10} y={-24} width={24} height={15} rx={2} fill={accent} opacity={0.9} />
    <rect x={-4} y={-30} width={12} height={7} rx={1} fill={WALLS.light} />
    <path d="M 8 -22 L 26 -36" stroke={WALLS.mid} strokeWidth={3} />
    <path d="M 22 -40 L 30 -34 L 26 -30 Z" fill={WALLS.dark} />
    {level >= 2 && <path d="M -30 0 Q -20 -8 -8 0" fill="none" stroke={WALLS.deep} strokeWidth={1.5} />}
  </g>
);

const FactorySprite: React.FC<SpriteProps> = ({ level, accent }) => (
  <g>
    <ellipse cx={0} cy={2} rx={44} ry={7} fill={WALLS.shadow} opacity={0.45} />
    <rect x={-32} y={-24} width={64} height={24} fill={WALLS.mid} stroke={WALLS.deep} strokeWidth={1} />
    <path
      d="M -32 -24 L -22 -36 L -12 -24 L -2 -36 L 8 -24 L 18 -36 L 28 -24 Z"
      fill={accent}
      opacity={0.85}
    />
    {[0, 1, 2, 3, 4].map((index) => (
      <rect
        key={index}
        x={-26 + index * 11}
        y={-17}
        width={6}
        height={6}
        fill={WALLS.warm}
        opacity={0.7}
      />
    ))}
    <rect x={-20} y={-50} width={7} height={22} fill={WALLS.dark} />
    <rect x={6} y={-56} width={7} height={28} fill={WALLS.dark} />
    <circle cx={-16} cy={-56} r={4} fill="#e2e8f0" opacity={0.2} />
    <circle cx={10} cy={-63} r={5} fill="#e2e8f0" opacity={0.14} />
    {level >= 2 && <rect x={-46} y={-16} width={14} height={16} fill={WALLS.dark} />}
    {level >= 3 && <rect x={32} y={-18} width={14} height={18} fill={WALLS.dark} />}
  </g>
);

const RefinerySprite: React.FC<SpriteProps> = ({ level, accent }) => (
  <g>
    <ellipse cx={0} cy={2} rx={40} ry={7} fill={WALLS.shadow} opacity={0.45} />
    <rect x={-30} y={-30} width={17} height={30} rx={4} fill={WALLS.mid} stroke={WALLS.deep} strokeWidth={1} />
    <ellipse cx={-21.5} cy={-30} rx={8.5} ry={3} fill={WALLS.light} />
    <rect x={-9} y={-40} width={18} height={40} rx={5} fill={WALLS.light} stroke={WALLS.deep} strokeWidth={1} />
    <ellipse cx={0} cy={-40} rx={9} ry={3.4} fill="#e2e8f0" />
    <rect x={16} y={-52} width={8} height={52} fill={WALLS.dark} />
    <circle cx={20} cy={-52} r={3.5} fill={accent} opacity={0.9} />
    <circle cx={20} cy={-60} r={5} fill={accent} opacity={0.15} />
    <path d="M -21 -12 H 16" stroke={WALLS.mid} strokeWidth={2.5} />
    {level >= 2 && <rect x={26} y={-22} width={12} height={22} fill={WALLS.mid} />}
    {level >= 3 && <rect x={-46} y={-18} width={13} height={18} fill={WALLS.dark} />}
  </g>
);

const LabSprite: React.FC<SpriteProps> = ({ level, accent }) => (
  <g>
    <ellipse cx={0} cy={2} rx={42} ry={7} fill={WALLS.shadow} opacity={0.42} />
    <rect x={-32} y={-24} width={64} height={24} fill={WALLS.light} stroke={WALLS.deep} strokeWidth={1} />
    <rect x={-26} y={-19} width={16} height={6} fill={WALLS.glass} opacity={0.75} />
    <path d="M -12 -24 A 13 11 0 0 1 14 -24 Z" fill={accent} opacity={0.9} />
    <rect x={0} y={-19} width={8} height={8} fill={accent} opacity={0.8} />
    <line x1={22} y1={-24} x2={22} y2={-48} stroke={WALLS.mid} strokeWidth={2.5} />
    <ellipse cx={26} cy={-49} rx={10} ry={4} fill={WALLS.light} transform="rotate(-18 26 -49)" />
    <circle cx={22} cy={-49} r={1.6} fill={accent} />
    {level >= 2 && <rect x={-46} y={-18} width={14} height={18} fill={WALLS.dark} />}
    {level >= 3 && <rect x={32} y={-16} width={14} height={16} fill={WALLS.dark} />}
  </g>
);

const RelaySprite: React.FC<SpriteProps> = ({ level, accent }) => (
  <g>
    <ellipse cx={0} cy={2} rx={28} ry={6} fill={WALLS.shadow} opacity={0.4} />
    <path d="M -14 0 L 0 -28 L 14 0" fill="none" stroke={WALLS.dark} strokeWidth={2.5} />
    <rect x={-3} y={-62} width={6} height={34} fill={WALLS.mid} />
    <ellipse cx={0} cy={-64} rx={12} ry={5} fill={WALLS.light} transform="rotate(-18 0 -64)" />
    <line x1={0} y1={-62} x2={9} y2={-70} stroke={WALLS.mid} strokeWidth={1.5} />
    <path d="M 10 -76 A 15 15 0 0 1 4 -58" fill="none" stroke={accent} strokeWidth={1.2} opacity={0.6} />
    <path d="M 15 -81 A 22 22 0 0 1 6 -53" fill="none" stroke={accent} strokeWidth={1} opacity={0.35} />
    {level >= 2 && <rect x={-24} y={-12} width={12} height={12} fill={WALLS.dark} />}
    {level >= 3 && <circle cx={0} cy={-64} r={2} fill={accent} />}
  </g>
);

const BarracksSprite: React.FC<SpriteProps> = ({ level, accent }) => (
  <g>
    <ellipse cx={0} cy={2} rx={44} ry={7} fill={WALLS.shadow} opacity={0.45} />
    <rect x={-30} y={-20} width={60} height={20} fill={WALLS.mid} stroke={WALLS.deep} strokeWidth={1} />
    <path d="M -34 -20 L 0 -34 L 34 -20 Z" fill={accent} opacity={0.85} />
    <rect x={-8} y={-12} width={9} height={12} fill={WALLS.deep} />
    <rect x={-20} y={-16} width={6} height={4} fill={WALLS.warm} opacity={0.75} />
    <rect x={12} y={-16} width={6} height={4} fill={WALLS.warm} opacity={0.75} />
    <line x1={24} y1={-34} x2={24} y2={-54} stroke={WALLS.light} strokeWidth={1.5} />
    <path d="M 24 -54 H 36 V -47 H 24 Z" fill="#fb7185" />
    {[0, 1, 2].map((index) => (
      <circle key={index} cx={-16 + index * 8} cy={-2} r={3} fill="#78716c" />
    ))}
    {level >= 2 && <rect x={-46} y={-14} width={14} height={14} fill={WALLS.dark} />}
    {level >= 3 && <rect x={32} y={-14} width={14} height={14} fill={WALLS.dark} />}
  </g>
);

const GasHubSprite: React.FC<SpriteProps> = ({ level, accent }) => (
  <g>
    <ellipse cx={0} cy={10} rx={52} ry={9} fill={WALLS.shadow} opacity={0.3} />
    <path d="M -46 -18 H 46 L 30 8 H -30 Z" fill={WALLS.mid} stroke={WALLS.deep} strokeWidth={1.2} />
    <rect x={-26} y={-34} width={52} height={16} fill={WALLS.light} stroke={WALLS.deep} strokeWidth={1} />
    <circle cx={-14} cy={-26} r={4} fill={accent} opacity={0.9} />
    <circle cx={0} cy={-26} r={4} fill={accent} opacity={0.7} />
    <circle cx={14} cy={-26} r={4} fill={accent} opacity={0.5} />
    <path d="M -20 -34 V -54 A 20 12 0 0 1 20 -54 V -34" fill="none" stroke={WALLS.light} strokeWidth={3} />
    <line x1={-30} y1={8} x2={-14} y2={30} stroke={WALLS.dark} strokeWidth={2} />
    <line x1={30} y1={8} x2={14} y2={30} stroke={WALLS.dark} strokeWidth={2} />
    <path d="M -52 4 H 52" stroke={accent} strokeWidth={1} opacity={0.4} />
  </g>
);

const GenericSprite: React.FC<SpriteProps> = ({ level, accent }) => (
  <g>
    <ellipse cx={0} cy={2} rx={32} ry={6} fill={WALLS.shadow} opacity={0.4} />
    <rect x={-22} y={-20} width={44} height={20} fill={WALLS.mid} stroke={WALLS.deep} strokeWidth={1} />
    <rect x={-16} y={-32} width={32} height={12} fill={WALLS.light} />
    <rect x={-10} y={-26} width={8} height={5} fill={accent} opacity={0.8} />
    <line x1={12} y1={-32} x2={12} y2={-46} stroke={WALLS.mid} strokeWidth={2} />
    <circle cx={12} cy={-46} r={2} fill={accent} />
    {level >= 2 && <rect x={-40} y={-14} width={14} height={14} fill={WALLS.dark} />}
    {level >= 3 && <rect x={26} y={-14} width={14} height={14} fill={WALLS.dark} />}
  </g>
);

const SPRITES: Record<SkylineKind, React.FC<SpriteProps>> = {
  city_center: CityCenterSprite,
  gas_hub: GasHubSprite,
  hydro_dome: HydroDomeSprite,
  solar_field: SolarFieldSprite,
  geothermal: GeothermalSprite,
  extractor: ExtractorSprite,
  factory: FactorySprite,
  refinery: RefinerySprite,
  lab: LabSprite,
  relay: RelaySprite,
  barracks: BarracksSprite,
  generic: GenericSprite,
};

function accentFor(building: SkylineBuilding): string {
  const category = (
    building.kind === 'city_center'
      ? 'infrastructure'
      : building.kind === 'hydro_dome'
        ? 'agriculture'
        : building.kind === 'solar_field' || building.kind === 'geothermal'
          ? 'energy'
          : building.kind === 'extractor' || building.kind === 'factory' || building.kind === 'refinery'
            ? 'industry'
            : building.kind === 'lab'
              ? 'science'
              : building.kind === 'barracks'
                ? 'military'
                : 'infrastructure'
  ) as BuildingCategory;
  return ACCENT_BY_CATEGORY[category];
}

const BuildingSprite: React.FC<{ building: SkylineBuilding; palette: SkylinePalette }> = ({
  building,
  palette,
}) => {
  const accent = accentFor(building);
  const Sprite = SPRITES[building.kind];
  const statusLabel = building.underConstruction
    ? `im Bau (${Math.round(building.progress * 100)} %)`
    : building.active
      ? 'in Betrieb'
      : 'gedrosselt';

  return (
    <g
      transform={`translate(${building.x}, ${building.y}) scale(${building.scale})`}
      data-building-id={building.id}
      data-building-kind={building.kind}
      data-construction={building.underConstruction ? 'true' : 'false'}
      opacity={building.active || building.underConstruction ? 1 : 0.72}
    >
      <title>{`${building.name} · Stufe ${building.level} · ${statusLabel}`}</title>
      {building.underConstruction ? (
        <g>
          <g opacity={0.32}>
            <Sprite level={building.level} accent={accent} />
          </g>
          <rect
            x={-38}
            y={-64}
            width={76}
            height={64}
            fill="none"
            stroke={accent}
            strokeWidth={1}
            strokeDasharray="4 3"
            opacity={0.7}
          />
          <line x1={34} y1={-64} x2={34} y2={0} stroke={palette.vegetation} strokeWidth={1.5} opacity={0.6} />
          <line x1={34} y1={-64} x2={-6} y2={-64} stroke={palette.vegetation} strokeWidth={1.5} opacity={0.6} />
          <line x1={-6} y1={-64} x2={-6} y2={-48} stroke={palette.vegetation} strokeWidth={1} opacity={0.5} />
          <rect x={-32} y={4} width={64} height={4} rx={1} fill="#0f172a" />
          <rect
            x={-32}
            y={4}
            width={Math.max(1, 64 * building.progress)}
            height={4}
            rx={1}
            fill={accent}
          />
        </g>
      ) : (
        <>
          <Sprite level={building.level} accent={accent} />
          {!building.active && (
            <path d="M 30 -58 l 7 12 h -14 Z" fill="#f59e0b" opacity={0.9} />
          )}
        </>
      )}
      <LevelPips level={building.level} accent={accent} />
    </g>
  );
};

export const ColonySkyline: React.FC<ColonySkylineProps> = ({ colony, surface, planetType }) => {
  const palette = getSkylinePalette(surface, colony, planetType);
  const buildings = getSkylineBuildings(colony);
  const gradientId = `sky-${colony.id.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  // Sterne und Vegetation deterministisch aus der Kolonie-ID ableiten.
  const stars = Array.from({ length: 48 }, (_, index) => {
    const value = hashString(`${colony.id}:star:${index}`);
    const x = (value % 1000) / 1000 * SKYLINE_VIEWBOX.width;
    const y = ((value >>> 10) % 1000) / 1000 * 132;
    const radius = 0.5 + (((value >>> 20) % 100) / 100) * 1.2;
    return { x, y, radius, opacity: 0.25 + ((value >>> 4) % 70) / 100 };
  });
  const tufts = Array.from({ length: 64 }, (_, index) => {
    const value = hashString(`${colony.id}:tuft:${index}`);
    const x = (value % 1000) / 1000 * SKYLINE_VIEWBOX.width;
    const y = 188 + ((value >>> 9) % 1000) / 1000 * 76;
    const radius = 1 + (((value >>> 19) % 100) / 100) * 2.2;
    return { x, y, radius, opacity: 0.12 + ((value >>> 3) % 30) / 100 };
  });

  return (
    <svg
      viewBox={`0 0 ${SKYLINE_VIEWBOX.width} ${SKYLINE_VIEWBOX.height}`}
      className="w-full h-auto rounded-lg border border-slate-800"
      role="img"
      aria-label={`Kolonieansicht von ${colony.name}`}
      data-testid="colony-skyline"
      data-palette={palette.id}
    >
      <defs>
        <linearGradient id={`${gradientId}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.skyTop} />
          <stop offset="70%" stopColor={palette.skyTop} />
          <stop offset="100%" stopColor={palette.skyBottom} />
        </linearGradient>
        <linearGradient id={`${gradientId}-ground`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.groundFar} />
          <stop offset="55%" stopColor={palette.groundFar} />
          <stop offset="100%" stopColor={palette.groundNear} />
        </linearGradient>
        <radialGradient id={`${gradientId}-glow`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={palette.horizonGlow} stopOpacity="0.4" />
          <stop offset="100%" stopColor={palette.horizonGlow} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Himmel */}
      <rect x={0} y={0} width={SKYLINE_VIEWBOX.width} height={196} fill={`url(#${gradientId}-sky)`} />
      {stars.map((star, index) => (
        <circle
          key={`star-${index}`}
          cx={star.x}
          cy={star.y}
          r={star.radius}
          fill="#e2e8f0"
          opacity={star.opacity}
        />
      ))}
      <ellipse cx={320} cy={156} rx={340} ry={62} fill={`url(#${gradientId}-glow)`} />

      {/* Hügelkette */}
      <path
        d="M0 150 C 70 128, 150 154, 226 140 C 300 126, 372 110, 448 134 C 520 156, 584 148, 640 134 L640 270 L0 270 Z"
        fill={palette.hillFar}
      />
      <path
        d="M0 172 C 90 154, 176 176, 262 164 C 348 152, 430 166, 512 158 C 570 152, 610 160, 640 166 L640 270 L0 270 Z"
        fill={palette.hillNear}
      />

      {/* Stadtfläche */}
      <path
        d="M0 186 C 120 168, 240 180, 360 172 C 470 165, 566 172, 640 182 L640 270 L0 270 Z"
        fill={`url(#${gradientId}-ground)`}
      />
      <path
        d="M0 186 C 120 168, 240 180, 360 172 C 470 165, 566 172, 640 182"
        fill="none"
        stroke={palette.vegetation}
        strokeWidth={1}
        opacity={0.25}
      />
      {/* Wege und Siedlungsring deuten die Koloniestruktur an */}
      <ellipse
        cx={320}
        cy={226}
        rx={180}
        ry={34}
        fill="none"
        stroke={palette.vegetation}
        strokeWidth={1}
        opacity={0.08}
      />
      <path
        d="M 40 262 C 160 236, 290 250, 410 228 C 500 212, 576 222, 620 216"
        fill="none"
        stroke={palette.vegetation}
        strokeWidth={2}
        opacity={0.1}
      />
      <path
        d="M 320 266 C 318 246, 322 228, 320 208"
        fill="none"
        stroke={palette.vegetation}
        strokeWidth={2}
        opacity={0.1}
      />
      {tufts.map((tuft, index) => (
        <ellipse
          key={`tuft-${index}`}
          cx={tuft.x}
          cy={tuft.y}
          rx={tuft.radius * 2.4}
          ry={tuft.radius}
          fill={palette.vegetation}
          opacity={tuft.opacity}
        />
      ))}

      {/* Gebäude, hinten zuerst */}
      {buildings.map((building) => (
        <BuildingSprite key={building.id} building={building} palette={palette} />
      ))}
    </svg>
  );
};
