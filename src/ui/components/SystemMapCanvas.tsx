/**
 * Astraea 4X - Interactive 2D Star System Map Canvas
 * Renders the central star (or binary pair) either with Keplerian concentric
 * orbits or as a log-scaled horizontal distance axis ("Detailansicht").
 * Geometry and hit testing come from the shared systemViewLayout module so the
 * canvas and its tests use exactly the same math.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Fleet, Planet, StarSystem, type AsteroidBelt, type Moon } from '../../core/types.ts';
import { PLANET_CATALOG } from '../../data/planetCatalog.ts';
import {
  detailFleetMarkerPlacements,
  hitTestFleetMarkers,
  orbitFleetMarkerPlacements,
  type FleetMarkerPlacement,
} from '../systemFleetLayout.ts';
import {
  DETAIL_WHEEL_STEP,
  beltOrbitLabel,
  computeBeltOrbitRings,
  computeOrbitRadius,
  detailBeltPosition,
  detailLayout,
  findScrollForPlanet,
  hitTestPlanets,
  moonOrbitAngle,
  moonOrbitRadius,
  orbitPlanetPosition,
  planetVisualRadius,
  type BeltOrbitRing,
  type PlanetPlacement,
  type SystemMapViewMode,
} from '../systemViewLayout.ts';

interface SystemMapCanvasProps {
  system: StarSystem;
  selectedPlanet: Planet | null;
  onSelectPlanet: (planet: Planet | null) => void;
  onBackToGalaxy: () => void;
  deepSpaceImageSrc?: string;
  /** Sichtbare Flotten im System – dieselbe Datenbasis wie die Galaxiekarte. */
  fleets?: Fleet[];
  selectedFleetId?: string | null;
  fleetColorById?: Record<string, string>;
  onSelectFleet?: (fleetId: string) => void;
}

// Sitzungsweite Erinnerung an die zuletzt genutzte Darstellung.
let preferredViewMode: SystemMapViewMode = 'orbit';

interface PaintPlanetParams {
  ctx: CanvasRenderingContext2D;
  planet: Planet;
  x: number;
  y: number;
  radius: number;
  star: { x: number; y: number };
  zoom: number;
  time: number;
  isSelected: boolean;
  isHovered: boolean;
  showLabels: boolean;
  labelMode: 'right' | 'below';
}

/** Klicks auf Bedienelemente dürfen weder ziehen noch auswählen. */
function isInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('button, a, input, select, textarea, [role="button"]') !== null
  );
}

const BELT_GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Kleiner stabiler String-Hash für die deterministische Staubverteilung. */
function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Mulberry32: günstige, reproduzierbare Zahlenfolge pro Gürtel. */
function pseudoRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface BeltDustParticle {
  angle: number;
  /** 0 = innere Kante, 1 = äußere Kante des Rings. */
  radial: number;
  size: number;
  alpha: number;
}

/** Staubpunkte eines Gürtels; nur vom Gürtel-ID abhängig, nie pro Frame. */
function createBeltDust(belt: AsteroidBelt): BeltDustParticle[] {
  const random = pseudoRandom(hashString(belt.id));
  const count = Math.round(170 + belt.density * 320);
  const particles: BeltDustParticle[] = [];
  for (let i = 0; i < count; i += 1) {
    particles.push({
      angle: i * BELT_GOLDEN_ANGLE + random() * 0.35,
      radial: Math.min(1, Math.max(0, random() + (random() - 0.5) * 0.22)),
      size: 0.7 + random() * 1.1,
      alpha: 0.22 + random() * 0.45,
    });
  }
  return particles;
}

function beltDustColor(composition: AsteroidBelt['composition']): string {
  switch (composition) {
    case 'metallic':
      return '#CBD5E1';
    case 'icy':
      return '#BAE6FD';
    default:
      return '#D6D3D1';
  }
}

/** Wandelt #rrggbb in rgba mit Alpha um; toleriert bereits rgba-Werte. */
function withAlpha(color: string, alpha: number): string {
  if (!color.startsWith('#')) return color;
  const value = color.replace('#', '');
  const expanded = value.length === 3
    ? value.split('').map((char) => `${char}${char}`).join('')
    : value.padEnd(6, '0');
  const parsed = Number.parseInt(expanded.slice(0, 6), 16);
  if (Number.isNaN(parsed)) return `rgba(148, 163, 184, ${alpha})`;
  return `rgba(${(parsed >> 16) & 255}, ${(parsed >> 8) & 255}, ${parsed & 255}, ${alpha})`;
}

/**
 * Flottenmarker: gefüllter Kreis in der Reichsfarbe mit Richtungsdreieck.
 * Der Marker ist bewusst kleiner als ein Planet und wird immer über den
 * Planeten gezeichnet, ohne deren Position zu überdecken.
 */
function paintFleetMarker(
  ctx: CanvasRenderingContext2D,
  marker: FleetMarkerPlacement,
  color: string,
  isSelected: boolean,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(marker.x, marker.y, marker.radius, 0, Math.PI * 2);
  ctx.fillStyle = withAlpha(color, 0.9);
  ctx.fill();
  ctx.lineWidth = isSelected ? 2.5 : 1.2;
  ctx.strokeStyle = isSelected ? '#F8FAFC' : withAlpha(color, 0.55);
  ctx.stroke();

  // Bugdreieck zeigt nach oben und macht den Verband als Schiff erkennbar.
  ctx.beginPath();
  ctx.moveTo(marker.x, marker.y - marker.radius * 0.55);
  ctx.lineTo(marker.x + marker.radius * 0.4, marker.y + marker.radius * 0.35);
  ctx.lineTo(marker.x - marker.radius * 0.4, marker.y + marker.radius * 0.35);
  ctx.closePath();
  ctx.fillStyle = 'rgba(2, 6, 23, 0.8)';
  ctx.fill();
  ctx.restore();
}

export const SystemMapCanvas: React.FC<SystemMapCanvasProps> = ({
  system,
  selectedPlanet,
  onSelectPlanet,
  onBackToGalaxy,
  deepSpaceImageSrc,
  fleets = [],
  selectedFleetId = null,
  fleetColorById = {},
  onSelectFleet,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Camera State (Zoom & Pan in screen pixels)
  const [camera, setCamera] = useState({
    zoom: 1.0,
    panX: 0,
    panY: 0,
  });

  // Animation & Interaction states
  const [viewMode, setViewMode] = useState<SystemMapViewMode>(preferredViewMode);
  const [isOrbiting, setIsOrbiting] = useState(true);
  const [showOrbitLines, setShowOrbitLines] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [hoveredPlanet, setHoveredPlanet] = useState<Planet | null>(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const dragOriginRef = useRef({ panX: 0, panY: 0, scroll: 0 });
  const bgImageRef = useRef<HTMLImageElement | null>(null);

  // Der Renderloop liest den Hover über die Ref, damit er nicht bei jeder
  // Mausbewegung neu gestartet werden muss.
  const hoveredPlanetRef = useRef<Planet | null>(null);

  // Detailansicht: Scroll-Offset liegt in einer Ref, damit Scrollen keine
  // State-Updates und keinen Neustart des Renderloops auslöst.
  const detailScrollRef = useRef(0);

  // Animated angles map (to smoothly animate orbits without mutating state)
  const animatedAnglesRef = useRef<Map<string, number>>(new Map());

  const planets = useMemo(() => system.planets ?? [], [system.planets]);
  const belts = useMemo(() => system.asteroidBelts ?? [], [system.asteroidBelts]);
  const beltRings = useMemo(() => computeBeltOrbitRings(belts, planets), [belts, planets]);
  const beltDust = useMemo(
    () => beltRings.map((ring) => ({ ring, particles: createBeltDust(ring.belt) })),
    [beltRings]
  );
  const selectedId = selectedPlanet?.id ?? null;

  const applyHover = useCallback((planet: Planet | null) => {
    if (hoveredPlanetRef.current?.id === planet?.id) return;
    hoveredPlanetRef.current = planet;
    setHoveredPlanet(planet);
  }, []);

  const switchViewMode = useCallback((mode: SystemMapViewMode) => {
    preferredViewMode = mode;
    setViewMode(mode);
    applyHover(null);
  }, [applyHover]);

  // Initialize angles
  useEffect(() => {
    planets.forEach((p) => {
      if (!animatedAnglesRef.current.has(p.id)) {
        animatedAnglesRef.current.set(p.id, p.currentAngleRad);
      }
    });
  }, [planets]);

  // Load deep space backdrop
  useEffect(() => {
    if (deepSpaceImageSrc) {
      const img = new Image();
      img.src = deepSpaceImageSrc;
      img.onload = () => {
        bgImageRef.current = img;
      };
    }
  }, [deepSpaceImageSrc]);

  // Reset / Fit camera to show star and all planetary orbits
  const resetCamera = useCallback(() => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;

    // Größter sichtbarer Radius aus Planetenbahnen und Asteroidengürteln
    const planetMaxPx = planets.reduce(
      (max, planet) => Math.max(max, computeOrbitRadius(planet)),
      0
    );
    const beltMaxPx = beltRings.reduce(
      (max, ring) => Math.max(max, ring.radius + ring.halfWidth),
      0
    );
    const maxRadiusPx = Math.max(100, planetMaxPx, beltMaxPx);
    const fitZoom = Math.min((clientWidth * 0.42) / maxRadiusPx, (clientHeight * 0.42) / maxRadiusPx, 1.25);

    setCamera({
      zoom: Math.max(0.4, Math.min(1.4, fitZoom)),
      panX: clientWidth / 2,
      panY: clientHeight / 2,
    });
  }, [planets, beltRings]);

  // Center camera on system load
  useEffect(() => {
    resetCamera();
  }, [resetCamera]);

  // Systemwechsel: Kamera und Detail-Scroll zurücksetzen
  useEffect(() => {
    detailScrollRef.current = 0;
    applyHover(null);
  }, [system.id, applyHover]);

  // Detail-Scroll auf die aktuelle Auswahl ausrichten.
  // Bewusst nur auf ID/Modus/System reagieren, damit ein Tick die Ansicht
  // nicht unter dem Nutzer wegscrollt.
  useEffect(() => {
    if (viewMode !== 'detail' || !selectedPlanet) return;
    const container = containerRef.current;
    if (!container || container.clientWidth === 0) return;
    const layout = detailLayout(
      system.planets ?? [],
      container.clientWidth,
      container.clientHeight,
      detailScrollRef.current
    );
    detailScrollRef.current = findScrollForPlanet(layout, selectedPlanet.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, selectedPlanet?.id, system.id]);

  // Focus on selected planet (Orbitansicht)
  const focusOnPlanet = useCallback(
    (planet: Planet) => {
      if (!containerRef.current) return;
      const { clientWidth, clientHeight } = containerRef.current;
      const angle = animatedAnglesRef.current.get(planet.id) ?? planet.currentAngleRad;
      const orbitRadius = computeOrbitRadius(planet);
      const px = Math.cos(angle) * orbitRadius;
      const py = Math.sin(angle) * orbitRadius;
      const zoom = Math.max(camera.zoom, 1.1);

      setCamera({
        zoom,
        panX: clientWidth / 2 - px * zoom,
        panY: clientHeight / 2 - py * zoom,
      });
    },
    [camera.zoom]
  );

  // Detailansicht auf die Auswahl scrollen (Button "Fokus")
  const focusDetailSelection = useCallback(() => {
    if (!containerRef.current || !selectedPlanet) return;
    const { clientWidth, clientHeight } = containerRef.current;
    const layout = detailLayout(planets, clientWidth, clientHeight, detailScrollRef.current);
    detailScrollRef.current = findScrollForPlanet(layout, selectedPlanet.id);
    applyHover(null);
  }, [planets, selectedPlanet, applyHover]);

  // Coordinate Conversion Helpers
  const worldToScreen = useCallback(
    (worldX: number, worldY: number) => ({
      x: worldX * camera.zoom + camera.panX,
      y: worldY * camera.zoom + camera.panY,
    }),
    [camera]
  );

  // Aktuelle Orbit-Platzierungen (identisch zur Zeichnung)
  const computeOrbitPlacements = useCallback((): PlanetPlacement[] => {
    const center = { x: camera.panX, y: camera.panY };
    return planets.map((planet) => {
      const angle = animatedAnglesRef.current.get(planet.id) ?? planet.currentAngleRad;
      const pos = orbitPlanetPosition(planet, angle, camera.zoom, center);
      return { planet, x: pos.x, y: pos.y, radius: planetVisualRadius(planet, camera.zoom) };
    });
  }, [camera, planets]);

  const buildDetailLayout = useCallback(
    (width: number, height: number) => {
      const layout = detailLayout(planets, width, height, detailScrollRef.current);
      detailScrollRef.current = layout.scroll;
      return layout;
    },
    [planets]
  );

  // Handle Canvas DPR Resize
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const handleResize = () => {
      const { clientWidth, clientHeight } = container;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(clientWidth * dpr));
      canvas.height = Math.max(1, Math.round(clientHeight * dpr));
      canvas.style.width = `${clientWidth}px`;
      canvas.style.height = `${clientHeight}px`;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(handleResize) : null;
    observer?.observe(container);
    return () => {
      window.removeEventListener('resize', handleResize);
      observer?.disconnect();
    };
  }, []);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let pulseTime = 0;

    const render = () => {
      pulseTime += 0.035;
      const width = container.clientWidth;
      const height = container.clientHeight;

      if (width === 0 || height === 0) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      // Orbitphase läuft auch in der Detailansicht weiter, damit ein
      // Ansichtswechsel niemals die Simulation zurücksetzt.
      if (isOrbiting) {
        for (const p of planets) {
          const current = animatedAnglesRef.current.get(p.id) ?? p.currentAngleRad;
          const speed = (0.012 / Math.sqrt(Math.max(0.05, p.orbitDistanceAu))) * 0.7;
          animatedAnglesRef.current.set(p.id, (current + speed) % (Math.PI * 2));
        }
      }

      // 1. Cosmic Deep Space Background
      ctx.fillStyle = '#020617';
      ctx.fillRect(0, 0, width, height);

      if (bgImageRef.current) {
        ctx.save();
        ctx.globalAlpha = 0.28;
        ctx.drawImage(bgImageRef.current, 0, 0, width, height);
        ctx.restore();
      }

      const hoveredId = hoveredPlanetRef.current?.id ?? null;

      if (viewMode === 'orbit') {
        const center = worldToScreen(0, 0);

        // 2. Orbital grid rings
        if (showOrbitLines) {
          ctx.save();
          ctx.lineWidth = 1;
          for (const p of planets) {
            const orbitRadiusPx = computeOrbitRadius(p) * camera.zoom;
            const isSelected = selectedId === p.id;
            const isHovered = hoveredId === p.id;

            ctx.beginPath();
            if (isSelected) {
              ctx.strokeStyle = 'rgba(6, 182, 212, 0.45)';
              ctx.lineWidth = 1.5;
              ctx.setLineDash([6, 6]);
            } else if (isHovered) {
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
              ctx.lineWidth = 1;
              ctx.setLineDash([4, 4]);
            } else {
              ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
              ctx.lineWidth = 1;
              ctx.setLineDash([]);
            }

            ctx.arc(center.x, center.y, orbitRadiusPx, 0, Math.PI * 2);
            ctx.stroke();

            if (camera.zoom > 0.6) {
              ctx.save();
              ctx.font = '400 9px "JetBrains Mono", monospace';
              ctx.fillStyle = isSelected ? '#38BDF8' : '#475569';
              ctx.fillText(`${p.orbitDistanceAu} AU`, center.x + orbitRadiusPx + 4, center.y - 2);
              ctx.restore();
            }
          }
          ctx.restore();
        }

        // 2b. Asteroidengürtel als deterministischer Staubring
        if (beltDust.length > 0) {
          ctx.save();
          const beltRotation = (pulseTime * 0.006) % (Math.PI * 2);
          for (const { ring, particles } of beltDust) {
            const radiusPx = ring.radius * camera.zoom;
            const halfWidthPx = Math.max(2, ring.halfWidth * camera.zoom);
            const innerPx = Math.max(0, radiusPx - halfWidthPx);
            const outerPx = radiusPx + halfWidthPx;

            ctx.globalAlpha = 1;
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.07)';
            ctx.lineWidth = halfWidthPx * 2;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.arc(center.x, center.y, radiusPx, 0, Math.PI * 2);
            ctx.stroke();

            const dustColor = beltDustColor(ring.belt.composition);
            const dotScale = Math.max(0.6, Math.min(1.4, camera.zoom));
            for (const particle of particles) {
              const angle = particle.angle + beltRotation;
              const particleRadius = innerPx + particle.radial * (outerPx - innerPx);
              ctx.globalAlpha = particle.alpha;
              ctx.fillStyle = dustColor;
              ctx.beginPath();
              ctx.arc(
                center.x + Math.cos(angle) * particleRadius,
                center.y + Math.sin(angle) * particleRadius,
                Math.max(0.5, particle.size * dotScale),
                0,
                Math.PI * 2
              );
              ctx.fill();
            }

            if (showLabels && camera.zoom > 0.55) {
              ctx.globalAlpha = 1;
              ctx.font = '400 8px "JetBrains Mono", monospace';
              ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
              ctx.textAlign = 'center';
              ctx.fillText(beltOrbitLabel(ring.belt), center.x, center.y - radiusPx - 5);
            }
          }
          ctx.restore();
        }

        // 3. Central star(s)
        drawStars(ctx, center, camera.zoom, system, pulseTime);

        // 4. Planets
        for (const p of planets) {
          const angle = animatedAnglesRef.current.get(p.id) ?? p.currentAngleRad;
          const pos = orbitPlanetPosition(p, angle, camera.zoom, center);

          // Frustum Culling
          if (pos.x < -80 || pos.x > width + 80 || pos.y < -80 || pos.y > height + 80) {
            continue;
          }

          paintPlanet({
            ctx,
            planet: p,
            x: pos.x,
            y: pos.y,
            radius: planetVisualRadius(p, camera.zoom),
            star: center,
            zoom: camera.zoom,
            time: pulseTime,
            isSelected: selectedId === p.id,
            isHovered: hoveredId === p.id,
            showLabels,
            labelMode: 'right',
          });
        }

        // 5. Flottenmarker außerhalb der äußersten Planetenbahn.
        if (fleets.length > 0) {
          const markers = orbitFleetMarkerPlacements(
            fleets.map((fleet) => fleet.id),
            planets,
            camera.zoom,
            center,
          );
          for (const marker of markers) {
            const fleet = fleets.find((candidate) => candidate.id === marker.fleetId);
            const color = (fleet && fleetColorById[fleet.civId]) || '#38BDF8';
            paintFleetMarker(ctx, marker, color, marker.fleetId === selectedFleetId);
            if (showLabels && fleet) {
              ctx.save();
              ctx.font = '500 9px "JetBrains Mono", monospace';
              ctx.fillStyle = 'rgba(226, 232, 240, 0.9)';
              ctx.textAlign = 'center';
              ctx.shadowColor = '#020617';
              ctx.shadowBlur = 4;
              ctx.fillText(fleet.name, marker.x, marker.y + marker.radius + 12);
              ctx.restore();
            }
          }
        }
      } else {
        // 2. Detailansicht: horizontale, log-skalierte Planetenachse
        const layout = buildDetailLayout(width, height);
        const star = layout.star;

        ctx.save();
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.16)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 9]);
        ctx.beginPath();
        ctx.moveTo(star.x + star.radius + 16, star.y);
        ctx.lineTo(width - 16, star.y);
        ctx.stroke();
        ctx.restore();

        // 1b. Asteroidengürtel als vertikales Band auf der Detailachse
        if (belts.length > 0) {
          const halfHeight = Math.min(76, Math.max(26, height * 0.12));
          for (const belt of belts) {
            const beltX = detailBeltPosition(belt, layout.placements);
            if (beltX === null || beltX < -60 || beltX > width + 60) continue;

            const top = star.y - halfHeight;
            const bandHeight = halfHeight * 2;

            ctx.save();
            ctx.fillStyle = 'rgba(148, 163, 184, 0.06)';
            ctx.fillRect(beltX - 5, top, 10, bandHeight);

            ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 6]);
            ctx.beginPath();
            ctx.moveTo(beltX - 5, top);
            ctx.lineTo(beltX - 5, top + bandHeight);
            ctx.moveTo(beltX + 5, top);
            ctx.lineTo(beltX + 5, top + bandHeight);
            ctx.stroke();

            if (showLabels) {
              const labelX = Math.min(width - 8, Math.max(8, beltX));
              ctx.setLineDash([]);
              ctx.font = '400 8px "JetBrains Mono", monospace';
              ctx.fillStyle = 'rgba(148, 163, 184, 0.85)';
              ctx.textAlign = 'center';
              ctx.fillText(beltOrbitLabel(belt), labelX, top - 6);
            }
            ctx.restore();
          }
        }

        drawStars(ctx, star, 1, system, pulseTime, 0.8);

        if (showLabels) {
          ctx.save();
          ctx.font = '600 10px "Plus Jakarta Sans", sans-serif';
          ctx.fillStyle = '#E2E8F0';
          ctx.textAlign = 'center';
          ctx.shadowColor = '#000000';
          ctx.shadowBlur = 4;
          ctx.fillText(system.star.name, star.x, star.y - star.radius - 12);
          ctx.restore();
        }

        for (const placement of layout.placements) {
          if (placement.x < -80 || placement.x > width + 80) continue;

          paintPlanet({
            ctx,
            planet: placement.planet,
            x: placement.x,
            y: placement.y,
            radius: placement.radius,
            star,
            zoom: 1,
            time: pulseTime,
            isSelected: selectedId === placement.planet.id,
            isHovered: hoveredId === placement.planet.id,
            showLabels,
            labelMode: 'below',
          });
        }

        // Flottenleiste am oberen Rand: oberhalb der Planetenreihe und damit
        // frei von Überdeckung.
        if (fleets.length > 0) {
          const markers = detailFleetMarkerPlacements(
            fleets.map((fleet) => fleet.id),
            layout,
            width,
          );
          for (const marker of markers) {
            const fleet = fleets.find((candidate) => candidate.id === marker.fleetId);
            const color = (fleet && fleetColorById[fleet.civId]) || '#38BDF8';
            paintFleetMarker(ctx, marker, color, marker.fleetId === selectedFleetId);
            if (showLabels && fleet) {
              ctx.save();
              ctx.font = '500 8px "JetBrains Mono", monospace';
              ctx.fillStyle = 'rgba(226, 232, 240, 0.9)';
              ctx.textAlign = 'center';
              ctx.shadowColor = '#020617';
              ctx.shadowBlur = 4;
              ctx.fillText(fleet.name, marker.x, marker.y + marker.radius + 11);
              ctx.restore();
            }
          }
        }

        // AU-Ruler am unteren Rand
        if (height > 240) {
          const rulerY = height - 26;
          const axisStart = star.x + star.radius + 16;
          ctx.save();
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.28)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(axisStart, rulerY);
          ctx.lineTo(width - 24, rulerY);
          ctx.stroke();

          ctx.font = '400 8px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          let lastLabelX = Number.NEGATIVE_INFINITY;
          for (const placement of layout.placements) {
            if (placement.x < axisStart - 1 || placement.x > width - 12) continue;
            ctx.beginPath();
            ctx.moveTo(placement.x, rulerY - 4);
            ctx.lineTo(placement.x, rulerY + 3);
            ctx.stroke();

            if (Math.abs(placement.x - lastLabelX) >= 54) {
              ctx.fillStyle = selectedId === placement.planet.id ? '#38BDF8' : '#64748B';
              ctx.fillText(`${placement.planet.orbitDistanceAu} AU`, placement.x, rulerY + 14);
              lastLabelX = placement.x;
            }
          }
          ctx.restore();
        }

        // Scrollbar (nur wenn der Inhalt breiter als der Viewport ist)
        if (layout.maxScroll > 0) {
          const trackX = 24;
          const trackW = Math.max(0, width - 48);
          const trackY = height - 10;
          ctx.save();
          ctx.fillStyle = 'rgba(148, 163, 184, 0.18)';
          ctx.fillRect(trackX, trackY, trackW, 3);
          const thumbW = Math.max(40, trackW * (width / layout.contentWidth));
          const thumbX = trackX + (layout.scroll / layout.maxScroll) * (trackW - thumbW);
          ctx.fillStyle = 'rgba(56, 189, 248, 0.55)';
          ctx.fillRect(thumbX, trackY, thumbW, 3);
          ctx.restore();
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [
    system,
    camera,
    selectedId,
    isOrbiting,
    showOrbitLines,
    showLabels,
    viewMode,
    worldToScreen,
    planets,
    belts,
    beltDust,
    buildDetailLayout,
    fleets,
    fleetColorById,
    selectedFleetId,
  ]);

  // Handle Mouse Pan, Hover & Selection
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    if (isInteractiveTarget(e.target)) return;
    if (e.button === 1) e.preventDefault();

    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    dragOriginRef.current = { panX: camera.panX, panY: camera.panY, scroll: detailScrollRef.current };
    setIsPanning(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouse = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    if (isDraggingRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;

      if (viewMode === 'orbit') {
        setCamera({
          zoom: camera.zoom,
          panX: dragOriginRef.current.panX + dx,
          panY: dragOriginRef.current.panY + dy,
        });
      } else {
        const layout = detailLayout(
          planets,
          containerRef.current.clientWidth,
          containerRef.current.clientHeight,
          dragOriginRef.current.scroll - dx
        );
        detailScrollRef.current = layout.scroll;
      }

      applyHover(null);
      return;
    }

    const placements =
      viewMode === 'orbit'
        ? computeOrbitPlacements()
        : buildDetailLayout(containerRef.current.clientWidth, containerRef.current.clientHeight).placements;

    setHoverPos(mouse);
    applyHover(hitTestPlanets(placements, mouse, 8));
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsPanning(false);

    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    if (Math.hypot(dx, dy) >= 6) return;
    if (isInteractiveTarget(e.target)) return;
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const mouse = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const placements =
      viewMode === 'orbit'
        ? computeOrbitPlacements()
        : buildDetailLayout(containerRef.current.clientWidth, containerRef.current.clientHeight).placements;

    // Flottenmarker haben Vorrang, liegen aber nie über Planeten.
    if (fleets.length > 0 && onSelectFleet) {
      const markers =
        viewMode === 'orbit'
          ? orbitFleetMarkerPlacements(
              fleets.map((fleet) => fleet.id),
              planets,
              camera.zoom,
              { x: camera.panX, y: camera.panY },
            )
          : detailFleetMarkerPlacements(
              fleets.map((fleet) => fleet.id),
              buildDetailLayout(containerRef.current.clientWidth, containerRef.current.clientHeight),
              containerRef.current.clientWidth,
            );
      const fleetHit = hitTestFleetMarkers(markers, mouse);
      if (fleetHit) {
        onSelectFleet(fleetHit.fleetId);
        return;
      }
    }

    const hit = hitTestPlanets(placements, mouse, 12);
    setHoverPos(mouse);
    applyHover(hit);
    onSelectPlanet(hit);
  };

  const handleMouseLeave = () => {
    isDraggingRef.current = false;
    setIsPanning(false);
    applyHover(null);
  };

  // Wheel: Zoom (Orbit) bzw. Scrollen (Detail) über einen nativen,
  // nicht-passiven Listener, weil React onWheel passiv registriert.
  const handleWheelEvent = useCallback(
    (event: WheelEvent) => {
      const container = containerRef.current;
      if (!container) return;
      if (isInteractiveTarget(event.target)) return;
      event.preventDefault();

      const rect = container.getBoundingClientRect();
      const mouse = { x: event.clientX - rect.left, y: event.clientY - rect.top };

      if (viewMode === 'detail') {
        const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
        if (delta === 0) return;

        const layout = detailLayout(
          planets,
          container.clientWidth,
          container.clientHeight,
          detailScrollRef.current + (delta / 100) * DETAIL_WHEEL_STEP
        );
        detailScrollRef.current = layout.scroll;
        setHoverPos(mouse);
        applyHover(hitTestPlanets(layout.placements, mouse, 8));
        return;
      }

      const zoomFactor = event.deltaY < 0 ? 1.15 : 0.87;
      const newZoom = Math.max(0.3, Math.min(2.5, camera.zoom * zoomFactor));
      const worldX = (mouse.x - camera.panX) / camera.zoom;
      const worldY = (mouse.y - camera.panY) / camera.zoom;
      const newPanX = mouse.x - worldX * newZoom;
      const newPanY = mouse.y - worldY * newZoom;

      setCamera({ zoom: newZoom, panX: newPanX, panY: newPanY });

      const center = { x: newPanX, y: newPanY };
      const placements = planets.map((planet) => {
        const angle = animatedAnglesRef.current.get(planet.id) ?? planet.currentAngleRad;
        const pos = orbitPlanetPosition(planet, angle, newZoom, center);
        return { planet, x: pos.x, y: pos.y, radius: planetVisualRadius(planet, newZoom) };
      });
      setHoverPos(mouse);
      applyHover(hitTestPlanets(placements, mouse, 8));
    },
    [viewMode, camera, planets, applyHover]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener('wheel', handleWheelEvent, { passive: false });
    return () => container.removeEventListener('wheel', handleWheelEvent);
  }, [handleWheelEvent]);

  const cursorClass = isPanning
    ? 'cursor-grabbing'
    : viewMode === 'detail'
      ? 'cursor-grab'
      : hoveredPlanet
        ? 'cursor-pointer'
        : 'cursor-crosshair';

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden bg-slate-950 select-none ${cursorClass}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full" />

      {/* Top Left Navigation: Back to Galaxy & System Context */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            onClick={onBackToGalaxy}
            className="px-3 py-1.5 bg-slate-900/90 hover:bg-slate-800 text-cyan-300 hover:text-cyan-200 border border-slate-700/80 rounded-lg text-xs font-mono font-semibold shadow-xl transition-all cursor-pointer flex items-center gap-2 backdrop-blur-md"
            title="Zurück zur übergeordneten Galaxy-Karte"
          >
            <span>← Zur Galaxy-Karte</span>
          </button>
        </div>

        {/* Umschalter der Darstellung */}
        <div className="flex items-center gap-1 bg-slate-950/85 backdrop-blur-md border border-slate-800/80 p-1 rounded-lg shadow-xl pointer-events-auto w-fit">
          <button
            onClick={() => switchViewMode('orbit')}
            className={`px-2.5 py-1 rounded text-[11px] font-mono cursor-pointer transition-colors ${
              viewMode === 'orbit'
                ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800/60'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Konzentrische Umlaufbahnen anzeigen"
          >
            Umlaufbahnen
          </button>
          <button
            onClick={() => switchViewMode('detail')}
            className={`px-2.5 py-1 rounded text-[11px] font-mono cursor-pointer transition-colors ${
              viewMode === 'detail'
                ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800/60'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Planeten auf einer entfernungs-skalierten Achse anzeigen"
          >
            Detailansicht
          </button>
        </div>

        <div className="bg-slate-950/85 backdrop-blur-md border border-slate-800/80 p-3 rounded-lg text-xs font-mono text-slate-300 shadow-xl pointer-events-auto max-w-xs">
          <div className="flex items-center justify-between gap-4 mb-1">
            <span className="text-slate-100 font-semibold">{system.name}</span>
            <span className="text-cyan-400 font-mono text-[11px]">{planets.length} PLANETEN</span>
          </div>
          <div className="text-slate-400 text-[11px] flex items-center gap-2">
            <span>{system.star.name}</span>
            <span>·</span>
            <span>Klasse {system.star.spectralClass}</span>
            {system.star.isBinary && <span className="text-amber-400 font-semibold">· Doppelstern</span>}
          </div>
        </div>
      </div>

      {/* Top Right Controls: Zoom & View Presets */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5 bg-slate-950/85 backdrop-blur-md border border-slate-800/80 p-1.5 rounded-lg shadow-xl">
        {viewMode === 'orbit' ? (
          <>
            <button
              onClick={() => setCamera((prev) => ({ ...prev, zoom: Math.min(2.5, prev.zoom * 1.25) }))}
              className="w-8 h-8 rounded bg-slate-900 hover:bg-slate-800 active:bg-slate-700 text-slate-200 flex items-center justify-center font-mono font-bold text-sm cursor-pointer transition-colors"
              title="Vergrößern (+)"
            >
              +
            </button>
            <button
              onClick={() => setCamera((prev) => ({ ...prev, zoom: Math.max(0.3, prev.zoom * 0.8) }))}
              className="w-8 h-8 rounded bg-slate-900 hover:bg-slate-800 active:bg-slate-700 text-slate-200 flex items-center justify-center font-mono font-bold text-sm cursor-pointer transition-colors"
              title="Verkleinern (-)"
            >
              -
            </button>
            <button
              onClick={resetCamera}
              className="px-2.5 h-8 rounded bg-slate-900 hover:bg-slate-800 active:bg-slate-700 text-slate-300 text-xs font-mono cursor-pointer transition-colors whitespace-nowrap"
              title="Gesamtsystem zentrieren"
            >
              Übersicht
            </button>
            {selectedPlanet && (
              <button
                onClick={() => focusOnPlanet(selectedPlanet)}
                className="px-2.5 h-8 rounded bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-800/50 text-cyan-300 text-xs font-mono cursor-pointer transition-colors whitespace-nowrap"
                title="Auf ausgewählten Planeten zentrieren"
              >
                Fokus
              </button>
            )}
          </>
        ) : (
          <>
            <button
              onClick={() => {
                detailScrollRef.current = 0;
                applyHover(null);
              }}
              className="px-2.5 h-8 rounded bg-slate-900 hover:bg-slate-800 active:bg-slate-700 text-slate-300 text-xs font-mono cursor-pointer transition-colors whitespace-nowrap"
              title="Zurück zum Stern (Anfang der Achse)"
            >
              Zum Stern
            </button>
            {selectedPlanet && (
              <button
                onClick={focusDetailSelection}
                className="px-2.5 h-8 rounded bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-800/50 text-cyan-300 text-xs font-mono cursor-pointer transition-colors whitespace-nowrap"
                title="Ausgewählten Planeten in den sichtbaren Bereich holen"
              >
                Fokus
              </button>
            )}
          </>
        )}
      </div>

      {/* Bottom Left: Orbit Controls & Toggles */}
      <div className="absolute bottom-4 left-4 z-10 flex items-center gap-2 pointer-events-none">
        <div className="bg-slate-950/85 backdrop-blur-md border border-slate-800/80 px-2.5 py-1.5 rounded-md text-[11px] font-mono text-slate-400 shadow-lg pointer-events-auto flex items-center gap-2">
          {viewMode === 'orbit' && (
            <>
              <button
                onClick={() => setIsOrbiting(!isOrbiting)}
                className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                  isOrbiting
                    ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800/60'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {isOrbiting ? 'Orbit: Aktiv' : 'Orbit: Pausiert'}
              </button>

              <button
                onClick={() => setShowOrbitLines(!showOrbitLines)}
                className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                  showOrbitLines
                    ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800/60'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                Bahnen
              </button>
            </>
          )}

          <button
            onClick={() => setShowLabels(!showLabels)}
            className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
              showLabels
                ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800/60'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Beschriftung
          </button>
        </div>
      </div>

      {/* Bottom Right: Hinweis zur Detailnavigation */}
      {viewMode === 'detail' && (
        <div className="absolute bottom-4 right-4 z-10 pointer-events-none bg-slate-950/80 backdrop-blur-md border border-slate-800/70 px-2.5 py-1.5 rounded-md text-[10px] font-mono text-slate-400 shadow-lg">
          Mausrad oder mittlere Maustaste: Planeten durchscrollen
        </div>
      )}

      {/* Floating Hover Tooltip */}
      {hoveredPlanet && (
        <div
          className="absolute z-20 pointer-events-none bg-slate-900/95 border border-slate-700 px-3 py-2 rounded-lg shadow-2xl text-[11px] font-mono text-slate-200 whitespace-nowrap"
          style={{ left: hoverPos.x, top: hoverPos.y, transform: 'translate(-50%, -100%) translateY(-12px)' }}
        >
          <div className="font-semibold text-slate-100 flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: hoveredPlanet.color }} />
            {hoveredPlanet.name}
          </div>
          <div className="text-slate-400 text-[10px] mt-0.5">
            {PLANET_CATALOG[hoveredPlanet.planetType].displayName} · {hoveredPlanet.orbitDistanceAu} AU ·{' '}
            {hoveredPlanet.surfaceTemperatureK} K
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Draws the central star or a binary pair.
 * `scale` shrinks the discs for the detail axis without changing the system.
 */
function drawStars(
  ctx: CanvasRenderingContext2D,
  center: { x: number; y: number },
  zoom: number,
  system: StarSystem,
  time: number,
  scale = 1
) {
  const star = system.star;
  const starRadiusPx = Math.max(18, 28 * zoom) * scale;

  if (star.isBinary && star.secondaryStar) {
    const secStar = star.secondaryStar;
    const binaryOrbitR = 30 * zoom * scale;
    const bAngle = time * 0.4;

    const s1x = center.x + Math.cos(bAngle) * binaryOrbitR * 0.6;
    const s1y = center.y + Math.sin(bAngle) * binaryOrbitR * 0.6;
    const s2x = center.x - Math.cos(bAngle) * binaryOrbitR * 0.8;
    const s2y = center.y - Math.sin(bAngle) * binaryOrbitR * 0.8;

    drawStarDisc(ctx, s1x, s1y, starRadiusPx * 0.85, star.color, star.glowColor, time);
    drawStarDisc(ctx, s2x, s2y, starRadiusPx * 0.65, secStar.color, secStar.glowColor, time + 2);
    return;
  }

  drawStarDisc(ctx, center.x, center.y, starRadiusPx, star.color, star.glowColor, time);
}

/**
 * Shared planet painting for both views.
 */
function paintPlanet({
  ctx,
  planet,
  x,
  y,
  radius,
  star,
  zoom,
  time,
  isSelected,
  isHovered,
  showLabels,
  labelMode,
}: PaintPlanetParams) {
  const isColonized = planet.colonizationStatus === 'colonized' || !!planet.colonyId;

  // A. Selection Reticle
  if (isSelected) {
    ctx.save();
    const reticleR = radius + 10 + Math.sin(time * 2.5) * 2;
    ctx.strokeStyle = '#06B6D4';
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.arc(x, y, reticleR, 0, Math.PI * 2);
    ctx.stroke();

    const nLen = 5;
    ctx.beginPath();
    ctx.moveTo(x - reticleR - nLen, y);
    ctx.lineTo(x - reticleR, y);
    ctx.moveTo(x + reticleR, y);
    ctx.lineTo(x + reticleR + nLen, y);
    ctx.moveTo(x, y - reticleR - nLen);
    ctx.lineTo(x, y - reticleR);
    ctx.moveTo(x, y + reticleR);
    ctx.lineTo(x, y + reticleR + nLen);
    ctx.stroke();
    ctx.restore();
  }

  // B. Hover Ring
  if (isHovered && !isSelected) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, radius + 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // C. Planetary Rings
  if (planet.hasRings) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(0.35);
    ctx.scale(1.0, 0.32);
    ctx.strokeStyle =
      planet.planetType === 'gas_giant' ? 'rgba(251, 191, 36, 0.45)' : 'rgba(203, 213, 225, 0.35)';
    ctx.lineWidth = Math.max(2, 3.5 * zoom);
    ctx.beginPath();
    ctx.arc(0, 0, radius * 2.1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // D. Planet Body (Day/Night Shading Gradient)
  ctx.save();
  const angleToStar = Math.atan2(star.y - y, star.x - x);
  const sunX = x + Math.cos(angleToStar) * (radius * 0.4);
  const sunY = y + Math.sin(angleToStar) * (radius * 0.4);

  const planetGrad = ctx.createRadialGradient(sunX, sunY, radius * 0.1, x, y, radius * 1.15);
  planetGrad.addColorStop(0, planet.accentColor);
  planetGrad.addColorStop(0.55, planet.color);
  planetGrad.addColorStop(1, '#020617');

  ctx.fillStyle = planetGrad;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  if (planet.atmosphere === 'breathable' || planet.atmosphere === 'dense') {
    ctx.strokeStyle =
      planet.planetType === 'ocean' ? 'rgba(56, 189, 248, 0.4)' : 'rgba(110, 231, 183, 0.35)';
    ctx.lineWidth = Math.max(1, 1.5 * zoom);
    ctx.stroke();
  }
  ctx.restore();

  // D2. Colony Beacon Ring & Indicator
  if (isColonized) {
    ctx.save();
    const beaconRadius = radius + 5 + Math.sin(time * 3) * 1.5;
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, beaconRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#34D399';
    ctx.beginPath();
    ctx.arc(x, y - beaconRadius - 2, Math.max(2, 2.5 * zoom), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // E. Monde (echte Daten, Fallback auf die reine Anzahl)
  const moons = planet.moons ?? [];
  if (moons.length > 0) {
    ctx.save();
    const sortedMoons = [...moons].sort((a, b) => {
      if (a.isMajor !== b.isMajor) return a.isMajor ? -1 : 1;
      return a.index - b.index;
    });
    const shownMoons = sortedMoons.slice(0, 4);
    const moonDotRadius = Math.max(1.4, Math.min(2.6, radius * 0.12));
    const moonMaxOffset = labelMode === 'below' ? 14 : 26;

    for (const moon of shownMoons) {
      const orbitR = radius + moonOrbitRadius(moon, radius, moonMaxOffset);
      const moonAngle = moonOrbitAngle(moon, time);
      const moonX = x + Math.cos(moonAngle) * orbitR;
      const moonY = y + Math.sin(moonAngle) * orbitR;

      ctx.strokeStyle = 'rgba(148, 163, 184, 0.18)';
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      ctx.arc(x, y, orbitR, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = moon.color;
      ctx.beginPath();
      ctx.arc(moonX, moonY, moonDotRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    if (sortedMoons.length > shownMoons.length) {
      ctx.font = '400 8px "JetBrains Mono", monospace';
      ctx.fillStyle = '#94A3B8';
      ctx.textAlign = 'left';
      ctx.fillText(`+${sortedMoons.length - shownMoons.length}`, x + radius + 5, y + 3);
    }
    ctx.restore();
  } else if (planet.moonsCount > 0) {
    ctx.save();
    const dotRadius = Math.max(1.5, Math.min(3, radius * 0.14));
    const shown = Math.min(4, planet.moonsCount);
    const spacing = dotRadius * 2 + 4;
    const startX = x - ((shown - 1) * spacing) / 2;
    const moonY = y + radius + 7;

    ctx.fillStyle = 'rgba(203, 213, 225, 0.75)';
    for (let i = 0; i < shown; i++) {
      ctx.beginPath();
      ctx.arc(startX + i * spacing, moonY, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    if (planet.moonsCount > shown) {
      ctx.font = '400 8px "JetBrains Mono", monospace';
      ctx.fillStyle = '#94A3B8';
      ctx.textAlign = 'left';
      ctx.fillText(`+${planet.moonsCount - shown}`, startX + shown * spacing, moonY + 3);
    }
    ctx.restore();
  }

  // F. Labels
  const labelsVisible = showLabels && (zoom > 0.55 || isSelected || isHovered);
  if (!labelsVisible) return;

  const typeDef = PLANET_CATALOG[planet.planetType];

  ctx.save();
  ctx.shadowColor = '#000000';
  ctx.shadowBlur = 4;

  if (labelMode === 'below') {
    ctx.textAlign = 'center';

    ctx.font = isSelected
      ? '600 11px "Plus Jakarta Sans", sans-serif'
      : '500 10px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = isSelected ? '#38BDF8' : isColonized ? '#E2E8F0' : '#CBD5E1';
    ctx.fillText(planet.name, x, y - radius - 10);

    ctx.font = '400 9px "JetBrains Mono", monospace';
    ctx.fillStyle = isSelected ? '#7DD3FC' : '#64748B';
    ctx.fillText(`${typeDef.displayName} · ${planet.orbitDistanceAu} AU`, x, y + radius + 24);

    if (isColonized) {
      ctx.font = '700 9px "JetBrains Mono", monospace';
      ctx.fillStyle = '#34D399';
      ctx.fillText('KOLONIE', x, y + radius + 36);
    }
  } else {
    ctx.textAlign = 'left';

    if (isColonized) {
      ctx.font = '700 9px "JetBrains Mono", monospace';
      ctx.fillStyle = '#34D399';
      ctx.fillText('KOLONIE', x + radius + 8, y - 9);
    }

    ctx.font = isSelected
      ? '600 11px "Plus Jakarta Sans", sans-serif'
      : '500 10px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = isSelected ? '#38BDF8' : isColonized ? '#E2E8F0' : '#CBD5E1';
    ctx.fillText(planet.name, x + radius + 8, y + 3);

    if (zoom > 0.75 || isSelected) {
      ctx.font = '400 9px "JetBrains Mono", monospace';
      ctx.fillStyle = isSelected ? '#7DD3FC' : '#64748B';
      ctx.fillText(`${typeDef.displayName} · Slot ${planet.sizeClass}`, x + radius + 8, y + 15);
    }
  }

  ctx.restore();
}

/**
 * Helper to draw glowing star disc with corona
 */
function drawStarDisc(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  glowColor: string,
  time: number
) {
  ctx.save();
  // 1. Corona Glow
  const coronaR = radius * (2.8 + Math.sin(time) * 0.15);
  const grad = ctx.createRadialGradient(x, y, radius * 0.2, x, y, coronaR);
  grad.addColorStop(0, color);
  grad.addColorStop(0.4, glowColor);
  grad.addColorStop(1, 'rgba(0,0,0,0)');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, coronaR, 0, Math.PI * 2);
  ctx.fill();

  // 2. Core Star
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  // 3. Hot White Center
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.55, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
