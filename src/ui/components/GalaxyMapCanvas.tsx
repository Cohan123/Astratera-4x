/**
 * Astraea 4X - Interactive 2D Galaxy Map Canvas
 * High-performance canvas renderer with smooth pan/zoom, star glow, hyperlanes,
 * selection reticle, and hover coordinate tracking.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Civilization,
  Fleet,
  GalacticTradeConvoy,
  GalacticTradeRoute,
  Galaxy,
  StarSystem,
} from '../../core/types.ts';
import { getShipDef } from '../../data/shipCatalog.ts';
import { computeGalaxyCamera, galaxyCameraKey } from '../galaxyCamera.ts';
import { routePolylineScreenPoints } from '../routePlanning.ts';
import { computeTerritoryBorders } from '../territoryBorders.ts';

interface GalaxyMapCanvasProps {
  galaxy: Galaxy;
  selectedSystem: StarSystem | null;
  onSelectSystem: (system: StarSystem) => void;
  deepSpaceImageSrc?: string;
  tradeRoutes?: GalacticTradeRoute[];
  tradeConvoys?: GalacticTradeConvoy[];
  fleets?: Fleet[];
  civilizations?: Civilization[];
  /** Aktuell ausgewählter Verband (für Hervorhebung und Info-Karte). */
  selectedFleetId?: string | null;
  onSelectFleet?: (fleet: Fleet | null) => void;
  /** Vorschau-Route eines noch nicht bestätigten Flottenauftrags. */
  previewRouteSystemIds?: string[];
  /** Aktive Routenplanung: Route wird rot hervorgehoben. */
  isRoutePlanning?: boolean;
  /** Route, die während der Routenplanung rot gezeichnet wird. */
  plannedRouteSystemIds?: string[];
  /** Meldet das System unter dem Mauszeiger (für die Routenvorschau). */
  onHoverSystem?: (system: StarSystem | null) => void;
}

/**
 * Schiffsglyphen: Jede dominante Schiffsklasse erhält eine eigene Form und
 * Farbe, damit Verbände auf der Galaxiekarte nicht nur an ihrer Position,
 * sondern auch an ihrer Silhouette unterscheidbar sind.
 */
type FleetGlyphClass = 'colony' | 'scout' | 'frigate' | 'cruiser' | 'destroyer' | 'corvette';

const SHIP_CLASS_PRIORITY: Record<FleetGlyphClass, number> = {
  colony: 6,
  scout: 5,
  cruiser: 4,
  destroyer: 3,
  frigate: 2,
  corvette: 1,
};

export const FLEET_GLYPH_COLORS: Record<FleetGlyphClass, string> = {
  colony: '#F59E0B',
  scout: '#38BDF8',
  frigate: '#2DD4BF',
  cruiser: '#F472B6',
  destroyer: '#FB7185',
  corvette: '#A78BFA',
};

export const FLEET_CLASS_LABELS: Record<FleetGlyphClass, string> = {
  colony: 'Kolonieschiff',
  scout: 'Aufklärungsschiff',
  frigate: 'Fregatte',
  cruiser: 'Kreuzer',
  destroyer: 'Zerstörer',
  corvette: 'Korvette',
};

export function dominantFleetClass(fleet: Fleet): FleetGlyphClass {
  let best: FleetGlyphClass = 'corvette';
  let bestPriority = 0;
  for (const stack of fleet.ships) {
    if (stack.count <= 0) continue;
    const shipClass = getShipDef(stack.shipDefId)?.shipClass;
    if (!shipClass || !(shipClass in SHIP_CLASS_PRIORITY)) continue;
    const candidate = shipClass as FleetGlyphClass;
    const priority = SHIP_CLASS_PRIORITY[candidate];
    if (priority > bestPriority) {
      best = candidate;
      bestPriority = priority;
    }
  }
  return best;
}

/**
 * Positioniert Verbandsmarker ringförmig um das System. Ringradius und
 * Winkelabstand hängen von der Anzahl ab, sodass sich Marker nie exakt
 * überlagern und auch bei mehreren Verbänden klickbar bleiben.
 */
export function fleetMarkerOffset(
  index: number,
  count: number,
  zoom: number
): { dx: number; dy: number; radius: number } {
  const perRing = 6;
  const ring = Math.floor(index / perRing);
  const indexInRing = index % perRing;
  const countInRing = Math.max(1, Math.min(perRing, count - ring * perRing));
  const radius = Math.max(15, 17 * Math.max(0.7, zoom)) + ring * 15;
  const step = (Math.PI * 2) / countInRing;
  const start = -Math.PI / 2 - (step * (countInRing - 1)) / 2 + (ring % 2 === 1 ? step / 2 : 0);
  const angle = start + indexInRing * step;
  return {
    dx: Math.cos(angle) * radius,
    dy: Math.sin(angle) * radius,
    radius: Math.max(5, Math.min(7, 5.5 * zoom + 1.5)),
  };
}

interface FleetMarkerRender {
  fleet: Fleet;
  x: number;
  y: number;
  radius: number;
  glyphClass: FleetGlyphClass;
  isMoving: boolean;
  isSelected: boolean;
}

/**
 * Zeichnet die Silhouette eines Verbands. Form und Farbe ergeben sich aus der
 * dominanten Schiffsklasse; Auswahl und Bewegung werden zusätzlich markiert.
 */
function drawFleetGlyph(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  glyphClass: FleetGlyphClass,
  options: { moving: boolean; selected: boolean; zoom: number }
): void {
  const color = options.moving ? '#22D3EE' : FLEET_GLYPH_COLORS[glyphClass];

  ctx.save();
  ctx.lineWidth = Math.max(1, Math.min(2, options.zoom));
  ctx.strokeStyle = 'rgba(2, 6, 23, 0.95)';
  ctx.fillStyle = color;
  ctx.setLineDash([]);

  if (options.selected) {
    ctx.beginPath();
    ctx.arc(x, y, radius + 4.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(248, 250, 252, 0.95)';
    ctx.lineWidth = Math.max(1.2, 1.6 * options.zoom);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(2, 6, 23, 0.95)';
    ctx.lineWidth = Math.max(1, Math.min(2, options.zoom));
  }

  switch (glyphClass) {
    case 'colony': {
      // Arche: breiter Rumpf mit zwei Siedlungskapseln.
      ctx.beginPath();
      ctx.ellipse(x, y, radius * 1.25, radius * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x - radius * 0.45, y, Math.max(1, radius * 0.18), 0, Math.PI * 2);
      ctx.arc(x + radius * 0.45, y, Math.max(1, radius * 0.18), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(2, 6, 23, 0.9)';
      ctx.fill();
      break;
    }
    case 'scout': {
      // Pfeilförmiger Aufklärer.
      ctx.beginPath();
      ctx.moveTo(x + radius * 1.2, y);
      ctx.lineTo(x - radius * 0.9, y - radius * 0.85);
      ctx.lineTo(x - radius * 0.45, y);
      ctx.lineTo(x - radius * 0.9, y + radius * 0.85);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'frigate': {
      // Raute mit kurzen Flügeln.
      ctx.beginPath();
      ctx.moveTo(x, y - radius);
      ctx.lineTo(x + radius, y);
      ctx.lineTo(x, y + radius);
      ctx.lineTo(x - radius, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'cruiser': {
      // Schweres Großkampfschiff: Quadrat mit Kreuzstreben.
      const half = radius * 0.95;
      ctx.beginPath();
      ctx.rect(x - half, y - half, half * 2, half * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - half, y);
      ctx.lineTo(x + half, y);
      ctx.moveTo(x, y - half);
      ctx.lineTo(x, y + half);
      ctx.strokeStyle = 'rgba(2, 6, 23, 0.8)';
      ctx.stroke();
      break;
    }
    case 'destroyer': {
      // Hexagon.
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const angle = (Math.PI / 3) * i - Math.PI / 6;
        const px = x + Math.cos(angle) * radius;
        const py = y + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
    default: {
      // Korvette: Kreis mit Heckflosse.
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.82, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - radius * 0.3, y + radius * 0.7);
      ctx.lineTo(x + radius * 0.3, y + radius * 0.7);
      ctx.lineTo(x, y + radius * 1.35);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
  }

  ctx.restore();
}

const hexToRgba = (hex: string, alpha: number): string => {
  const value = hex.replace('#', '');
  const expanded = value.length === 3
    ? value.split('').map((char) => `${char}${char}`).join('')
    : value.padEnd(6, '0');
  const parsed = Number.parseInt(expanded.slice(0, 6), 16);
  if (Number.isNaN(parsed)) {
    return `rgba(148, 163, 184, ${alpha})`;
  }
  const red = (parsed >> 16) & 255;
  const green = (parsed >> 8) & 255;
  const blue = parsed & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

const TRADE_ROUTE_COLORS: Record<GalacticTradeRoute['resource'], string> = {
  food: '245, 158, 11',
  minerals: '56, 189, 248',
  rareResources: '167, 139, 250',
};

export const GalaxyMapCanvas: React.FC<GalaxyMapCanvasProps> = ({
  galaxy,
  selectedSystem,
  onSelectSystem,
  deepSpaceImageSrc,
  tradeRoutes = [],
  tradeConvoys = [],
  fleets = [],
  civilizations = [],
  selectedFleetId = null,
  onSelectFleet,
  previewRouteSystemIds = [],
  isRoutePlanning = false,
  plannedRouteSystemIds = [],
  onHoverSystem,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Camera State (Zoom and Pan in screen pixels)
  const [camera, setCamera] = useState({
    zoom: 0.85,
    panX: 0,
    panY: 0,
  });

  // Mouse / Interaction State
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const dragStartClientRef = useRef({ x: 0, y: 0 });
  const dragMovedRef = useRef(false);
  const lastHoveredIdRef = useRef<string | null>(null);
  const [hoveredSystem, setHoveredSystem] = useState<StarSystem | null>(null);
  const [cursorLy, setCursorLy] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [showHyperlanes, setShowHyperlanes] = useState(true);
  const [showLabels, setShowLabels] = useState(true);

  const systemById = useMemo(
    () => new Map(galaxy.systems.map((system) => [system.id, system])),
    [galaxy.systems]
  );

  const civById = useMemo(
    () => new Map(civilizations.map((civ) => [civ.id, civ])),
    [civilizations]
  );

  // Verbände je System in stabiler Reihenfolge – dieselbe Reihenfolge nutzt
  // das Rendering für die Ringpositionen, damit der Klick genau den sichtbaren
  // Marker trifft.
  const fleetsBySystem = useMemo(() => {
    const map = new Map<string, Fleet[]>();
    for (const fleet of fleets) {
      const list = map.get(fleet.systemId) ?? [];
      list.push(fleet);
      map.set(fleet.systemId, list);
    }
    return map;
  }, [fleets]);

  const selectedFleet = useMemo(
    () => (selectedFleetId ? fleets.find((fleet) => fleet.id === selectedFleetId) ?? null : null),
    [fleets, selectedFleetId]
  );

  const playerCiv = useMemo(
    () => civilizations.find((civ) => civ.isPlayer) ?? null,
    [civilizations]
  );

  const resolveOwnerCiv = useCallback(
    (ownerFactionId: string | null): Civilization | null => {
      if (!ownerFactionId) return null;
      return civById.get(ownerFactionId)
        ?? (ownerFactionId === 'faction-player-home' ? playerCiv : null);
    },
    [civById, playerCiv]
  );

  // Grenzverlauf nur neu berechnen, wenn sich die Systeme selbst ändern.
  const territoryBorders = useMemo(
    () =>
      computeTerritoryBorders(
        galaxy.systems.map((system) => ({
          id: system.id,
          x: system.x,
          y: system.y,
          ownerFactionId: system.ownerFactionId ?? null,
        }))
      ),
    [galaxy.systems]
  );

  // Background Image element cache
  const bgImageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (deepSpaceImageSrc) {
      const img = new Image();
      img.src = deepSpaceImageSrc;
      img.onload = () => {
        bgImageRef.current = img;
      };
    }
  }, [deepSpaceImageSrc]);

  // Center camera on initial mount or when a *new* galaxy is generated. The
  // dependency deliberately avoids the galaxy object identity: App refreshes
  // frequently with `{ ...engine.getGalaxy() }`, which previously recreated
  // this callback and silently reset zoom on every action.
  const cameraKey = galaxyCameraKey(galaxy);
  const resetCamera = useCallback(() => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    setCamera(
      computeGalaxyCamera({
        viewportWidth: clientWidth,
        viewportHeight: clientHeight,
        galaxyWidth: galaxy.config.width,
        galaxyHeight: galaxy.config.height,
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraKey]);

  // Auto-fit on first load and on a genuinely new galaxy.
  useEffect(() => {
    resetCamera();
  }, [resetCamera]);

  // Focus camera on selected system when requested
  const focusOnSystem = useCallback(
    (system: StarSystem) => {
      if (!containerRef.current) return;
      const { clientWidth, clientHeight } = containerRef.current;
      setCamera((prev) => ({
        ...prev,
        panX: clientWidth / 2 - system.x * prev.zoom,
        panY: clientHeight / 2 - system.y * prev.zoom,
      }));
    },
    []
  );

  // Coordinate Conversion Helpers
  const screenToWorld = useCallback(
    (screenX: number, screenY: number) => {
      return {
        x: (screenX - camera.panX) / camera.zoom,
        y: (screenY - camera.panY) / camera.zoom,
      };
    },
    [camera]
  );

  const worldToScreen = useCallback(
    (worldX: number, worldY: number) => {
      return {
        x: worldX * camera.zoom + camera.panX,
        y: worldY * camera.zoom + camera.panY,
      };
    },
    [camera]
  );

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !containerRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let pulseAngle = 0;

    const render = () => {
      pulseAngle += 0.04;
      const width = canvas.width;
      const height = canvas.height;

      // 1. Draw Deep Space Background
      ctx.fillStyle = '#030712';
      ctx.fillRect(0, 0, width, height);

      if (bgImageRef.current) {
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.drawImage(bgImageRef.current, 0, 0, width, height);
        ctx.restore();
      }

      // 2. Draw Galactic Coordinate Grid
      ctx.save();
      ctx.strokeStyle = 'rgba(30, 41, 59, 0.45)';
      ctx.lineWidth = 1;
      const gridSpacingLy = 200;
      const gridSpacingPx = gridSpacingLy * camera.zoom;

      if (gridSpacingPx > 20) {
        const startWorldX = Math.floor(screenToWorld(0, 0).x / gridSpacingLy) * gridSpacingLy;
        const endWorldX = Math.ceil(screenToWorld(width, 0).x / gridSpacingLy) * gridSpacingLy;
        const startWorldY = Math.floor(screenToWorld(0, 0).y / gridSpacingLy) * gridSpacingLy;
        const endWorldY = Math.ceil(screenToWorld(0, height).y / gridSpacingLy) * gridSpacingLy;

        ctx.beginPath();
        for (let x = startWorldX; x <= endWorldX; x += gridSpacingLy) {
          const sx = worldToScreen(x, 0).x;
          ctx.moveTo(sx, 0);
          ctx.lineTo(sx, height);
        }
        for (let y = startWorldY; y <= endWorldY; y += gridSpacingLy) {
          const sy = worldToScreen(0, y).y;
          ctx.moveTo(0, sy);
          ctx.lineTo(width, sy);
        }
        ctx.stroke();

        // Galactic Center Crosshair at (0,0)
        const centerScreen = worldToScreen(0, 0);
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.25)';
        ctx.beginPath();
        ctx.arc(centerScreen.x, centerScreen.y, 8, 0, Math.PI * 2);
        ctx.moveTo(centerScreen.x - 14, centerScreen.y);
        ctx.lineTo(centerScreen.x + 14, centerScreen.y);
        ctx.moveTo(centerScreen.x, centerScreen.y - 14);
        ctx.lineTo(centerScreen.x, centerScreen.y + 14);
        ctx.stroke();
      }
      ctx.restore();

      // 3. Draw Hyperlanes
      if (showHyperlanes) {
        ctx.save();
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.16)';
        ctx.lineWidth = Math.max(1, 1.2 * camera.zoom);
        ctx.setLineDash([4, 6]);

        const drawnPairs = new Set<string>();
        for (const sys of galaxy.systems) {
          const s1 = worldToScreen(sys.x, sys.y);
          for (const targetId of sys.hyperlanes) {
            const pairKey = [sys.id, targetId].sort().join(':');
            if (drawnPairs.has(pairKey)) continue;
            drawnPairs.add(pairKey);

            const target = galaxy.systems.find((s) => s.id === targetId);
            if (target) {
              const s2 = worldToScreen(target.x, target.y);
              ctx.beginPath();
              ctx.moveTo(s1.x, s1.y);
              ctx.lineTo(s2.x, s2.y);
              ctx.stroke();
            }
          }
        }
        ctx.restore();
      }

      // 3a. Draw Territory Borders
      // Jedes Segment liegt auf der Mittelsenkrechten zweier Systeme. Beide
      // Hälften werden minimal versetzt in der jeweiligen Besitzerfarbe
      // gezeichnet, damit die Grenze auch bei ähnlichen Farben lesbar bleibt.
      if (territoryBorders.length > 0) {
        ctx.save();
        ctx.lineCap = 'round';
        const borderWidth = Math.max(1, 1.1 * camera.zoom);
        const borderOffset = 0.9;

        for (const segment of territoryBorders) {
          const fromSystem = systemById.get(segment.fromSystemId);
          if (!fromSystem) continue;

          const p1 = worldToScreen(segment.x1, segment.y1);
          const p2 = worldToScreen(segment.x2, segment.y2);
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const screenLength = Math.hypot(dx, dy);
          if (screenLength < 0.01) continue;

          // Bestimmt, auf welcher Seite der Linie das eigene System liegt.
          const fromScreen = worldToScreen(fromSystem.x, fromSystem.y);
          const cross = dx * (fromScreen.y - p1.y) - dy * (fromScreen.x - p1.x);
          const ownerSign = cross >= 0 ? 1 : -1;
          const offsetX = (-dy / screenLength) * borderOffset;
          const offsetY = (dx / screenLength) * borderOffset;

          const ownerCiv = resolveOwnerCiv(segment.ownerFactionId);
          const otherCiv = resolveOwnerCiv(segment.otherOwnerFactionId);
          const strokeSides = [
            {
              sign: ownerSign,
              color: ownerCiv ? hexToRgba(ownerCiv.color, 0.55) : 'rgba(148, 163, 184, 0.4)',
            },
            {
              sign: -ownerSign,
              color: otherCiv ? hexToRgba(otherCiv.color, 0.55) : 'rgba(148, 163, 184, 0.4)',
            },
          ];

          ctx.lineWidth = borderWidth;
          for (const side of strokeSides) {
            ctx.strokeStyle = side.color;
            ctx.beginPath();
            ctx.moveTo(p1.x + offsetX * side.sign, p1.y + offsetY * side.sign);
            ctx.lineTo(p2.x + offsetX * side.sign, p2.y + offsetY * side.sign);
            ctx.stroke();
          }
        }
        ctx.restore();
      }

      // 3b. Draw Galactic Trade Routes
      if (tradeRoutes.length > 0) {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (const route of tradeRoutes) {
          if (route.pathSystemIds.length < 2) continue;
          const points: { x: number; y: number }[] = [];
          for (const systemId of route.pathSystemIds) {
            const system = systemById.get(systemId);
            if (system) points.push(worldToScreen(system.x, system.y));
          }
          if (points.length < 2) continue;

          const color = TRADE_ROUTE_COLORS[route.resource];
          ctx.strokeStyle = `rgba(${color}, ${route.isActive ? 0.55 : 0.25})`;
          ctx.lineWidth = Math.max(1, 2.2 * camera.zoom);
          ctx.setLineDash(route.isActive ? [7, 5] : [3, 6]);
          ctx.beginPath();
          ctx.moveTo(points[0].x, points[0].y);
          for (let i = 1; i < points.length; i += 1) {
            ctx.lineTo(points[i].x, points[i].y);
          }
          ctx.stroke();

          if (route.isBlockaded) {
            ctx.strokeStyle = 'rgba(248, 113, 113, 0.85)';
            ctx.lineWidth = Math.max(1, 1.4 * camera.zoom);
            ctx.setLineDash([2, 4]);
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i += 1) {
              ctx.lineTo(points[i].x, points[i].y);
            }
            ctx.stroke();
          }
        }

        // Blockade markers around contested systems.
        for (const route of tradeRoutes) {
          if (!route.isBlockaded) continue;
          for (const systemId of route.blockadedSystemIds ?? []) {
            const system = systemById.get(systemId);
            if (!system) continue;
            const point = worldToScreen(system.x, system.y);
            const radius = Math.max(6, 11 * camera.zoom);
            ctx.setLineDash([]);
            ctx.strokeStyle = 'rgba(248, 113, 113, 0.9)';
            ctx.lineWidth = Math.max(1, 1.6 * camera.zoom);
            ctx.beginPath();
            ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        ctx.restore();

        // Convoy markers sit on the current hop's system.
        ctx.save();
        for (const convoy of tradeConvoys) {
          const route = tradeRoutes.find((candidate) => candidate.id === convoy.routeId);
          if (!route || route.pathSystemIds.length < 2) continue;
          const index = Math.max(
            0,
            Math.min(route.pathSystemIds.length - 1, convoy.pathIndex)
          );
          const system = systemById.get(route.pathSystemIds[index]);
          if (!system) continue;

          const point = worldToScreen(system.x, system.y);
          const alpha =
            convoy.status === 'outbound' ? 0.95 : convoy.status === 'inbound' ? 0.7 : 0.45;
          const color = TRADE_ROUTE_COLORS[route.resource];
          const radius = Math.max(2, Math.min(5, 3.5 * camera.zoom));
          ctx.fillStyle = `rgba(${color}, ${alpha})`;
          ctx.beginPath();
          ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(2, 6, 23, 0.9)';
          ctx.lineWidth = Math.max(1, camera.zoom);
          ctx.setLineDash([]);
          ctx.stroke();
        }
        ctx.restore();
      }

      // 3c. Draw Fleets and their remaining movement paths. Marker selbst
      // werden erst nach den Sternen gezeichnet, damit sie nie von Labels
      // oder Glow verdeckt werden.
      const fleetMarkers: FleetMarkerRender[] = [];
      if (fleets.length > 0) {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Rote Planungsroute: exakt die Systemkette, die der Auftrag später
        // abfährt. Sie wird aus Weltkoordinaten neu projiziert und bleibt
        // dadurch bei Zoom und Kartenverschiebung korrekt.
        if (plannedRouteSystemIds.length >= 2) {
          const points = routePolylineScreenPoints(
            plannedRouteSystemIds,
            systemById,
            (worldX, worldY) => worldToScreen(worldX, worldY),
          );
          if (points.length >= 2) {
            ctx.save();
            ctx.setLineDash([7, 5]);
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.95)';
            ctx.lineWidth = Math.max(1.5, 2.2 * camera.zoom);
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i += 1) {
              ctx.lineTo(points[i].x, points[i].y);
            }
            ctx.stroke();
            const targetPoint = points[points.length - 1];
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.arc(targetPoint.x, targetPoint.y, Math.max(9, 13 * camera.zoom), 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(248, 113, 113, 1)';
            ctx.lineWidth = 2.5;
            ctx.stroke();
            ctx.restore();
          }
        }

        // Vorschau-Route eines noch nicht bestätigten Auftrags (gestrichelt).
        if (previewRouteSystemIds.length >= 2) {
          const points = previewRouteSystemIds
            .map((systemId) => systemById.get(systemId))
            .filter((system): system is StarSystem => Boolean(system))
            .map((system) => worldToScreen(system.x, system.y));
          if (points.length >= 2) {
            ctx.save();
            ctx.setLineDash([6, 6]);
            ctx.strokeStyle = 'rgba(250, 204, 21, 0.85)';
            ctx.lineWidth = Math.max(1, 1.6 * camera.zoom);
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i += 1) {
              ctx.lineTo(points[i].x, points[i].y);
            }
            ctx.stroke();
            const targetPoint = points[points.length - 1];
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.arc(targetPoint.x, targetPoint.y, Math.max(8, 12 * camera.zoom), 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(250, 204, 21, 0.9)';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();
          }
        }

        // Movement paths first so markers stay on top.
        for (const fleet of fleets) {
          if (fleet.status !== 'moving' || fleet.pathSystemIds.length < 2) continue;
          const points: { x: number; y: number }[] = [];
          for (let i = Math.max(0, fleet.pathIndex); i < fleet.pathSystemIds.length; i += 1) {
            const system = systemById.get(fleet.pathSystemIds[i]);
            if (system) points.push(worldToScreen(system.x, system.y));
          }
          if (points.length < 2) continue;

          const isSelectedPath = fleet.id === selectedFleetId;
          ctx.strokeStyle = isSelectedPath
            ? 'rgba(248, 113, 113, 0.85)'
            : 'rgba(34, 211, 238, 0.55)';
          ctx.lineWidth = Math.max(1, 1.8 * camera.zoom);
          ctx.setLineDash([6, 6]);
          ctx.beginPath();
          ctx.moveTo(points[0].x, points[0].y);
          for (let i = 1; i < points.length; i += 1) {
            ctx.lineTo(points[i].x, points[i].y);
          }
          ctx.stroke();
        }

        // Fleet markers at the current system. Ring placement keeps every
        // verband separate and clickable, even with several fleets in a system.
        const fleetsBySystem = new Map<string, Fleet[]>();
        for (const fleet of fleets) {
          const list = fleetsBySystem.get(fleet.systemId) ?? [];
          list.push(fleet);
          fleetsBySystem.set(fleet.systemId, list);
        }

        for (const [systemId, systemFleets] of fleetsBySystem) {
          const system = systemById.get(systemId);
          if (!system) continue;
          const base = worldToScreen(system.x, system.y);

          systemFleets.forEach((fleet, index) => {
            const { dx, dy, radius } = fleetMarkerOffset(index, systemFleets.length, camera.zoom);
            fleetMarkers.push({
              fleet,
              x: base.x + dx,
              y: base.y + dy,
              radius,
              glyphClass: dominantFleetClass(fleet),
              isMoving: fleet.status === 'moving',
              isSelected: fleet.id === selectedFleetId,
            });
          });
        }
        ctx.restore();
      }

      // 4. Draw Stars
      for (const sys of galaxy.systems) {
        const { x: sx, y: sy } = worldToScreen(sys.x, sys.y);

        // Frustum culling
        if (sx < -50 || sx > width + 50 || sy < -50 || sy > height + 50) {
          continue;
        }

        const isSelected = selectedSystem?.id === sys.id;
        const isHovered = hoveredSystem?.id === sys.id;
        const star = sys.star;
        const ownerCiv = resolveOwnerCiv(sys.ownerFactionId);

        // Star Radius in Pixels based on zoom
        const baseRadius = Math.max(3.5, (star.radiusKm / 120000) * camera.zoom * 0.9);

        // A0. Territory Halo
        if (ownerCiv) {
          const territoryRadius = baseRadius * 6.5 + 12;
          const territoryGradient = ctx.createRadialGradient(
            sx,
            sy,
            baseRadius * 0.8,
            sx,
            sy,
            territoryRadius
          );
          territoryGradient.addColorStop(0, hexToRgba(ownerCiv.color, 0.2));
          territoryGradient.addColorStop(0.5, hexToRgba(ownerCiv.color, 0.09));
          territoryGradient.addColorStop(1, hexToRgba(ownerCiv.color, 0));
          ctx.fillStyle = territoryGradient;
          ctx.beginPath();
          ctx.arc(sx, sy, territoryRadius, 0, Math.PI * 2);
          ctx.fill();
        }

        // A. Corona Glow
        const glowRadius = baseRadius * 4.2;
        const gradient = ctx.createRadialGradient(sx, sy, baseRadius * 0.2, sx, sy, glowRadius);
        gradient.addColorStop(0, star.color);
        gradient.addColorStop(0.35, star.glowColor);
        gradient.addColorStop(1, 'rgba(0,0,0,0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(sx, sy, glowRadius, 0, Math.PI * 2);
        ctx.fill();

        // B. Core Disc
        ctx.fillStyle = star.color;
        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(2.5, baseRadius), 0, Math.PI * 2);
        ctx.fill();

        // C. Core white center for intense stars
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(1, baseRadius * 0.45), 0, Math.PI * 2);
        ctx.fill();

        // D. Tactical Selection Reticle
        if (isSelected) {
          ctx.save();
          const reticleSize = baseRadius + 14 + Math.sin(pulseAngle) * 2;
          ctx.strokeStyle = '#06B6D4';
          ctx.lineWidth = 1.5;

          // Animated outer target ring
          ctx.beginPath();
          ctx.arc(sx, sy, reticleSize, 0, Math.PI * 2);
          ctx.stroke();

          // 4 Bracket notches
          const notchLen = 6;
          ctx.beginPath();
          ctx.moveTo(sx - reticleSize - notchLen, sy);
          ctx.lineTo(sx - reticleSize, sy);
          ctx.moveTo(sx + reticleSize, sy);
          ctx.lineTo(sx + reticleSize + notchLen, sy);
          ctx.moveTo(sx, sy - reticleSize - notchLen);
          ctx.lineTo(sx, sy - reticleSize);
          ctx.moveTo(sx, sy + reticleSize);
          ctx.lineTo(sx, sy + reticleSize + notchLen);
          ctx.stroke();

          ctx.restore();
        }

        // D1. Owner Territory Ring
        if (ownerCiv) {
          ctx.save();
          ctx.strokeStyle = hexToRgba(ownerCiv.borderColor || ownerCiv.color, 0.95);
          ctx.lineWidth = ownerCiv.isPlayer ? 2 : 1.5;
          ctx.setLineDash(ownerCiv.isPlayer ? [] : [5, 3]);
          ctx.beginPath();
          ctx.arc(sx, sy, baseRadius + 5.5, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        // D2. Colonized Territory Beacon (Modul 3)
        const isSystemColonized = sys.discoveryStatus === 'colonized';
        if (isSystemColonized) {
          ctx.save();
          const colonyRingR = baseRadius + 10 + Math.sin(pulseAngle * 1.5) * 1.2;
          ctx.strokeStyle = 'rgba(16, 185, 129, 0.75)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.arc(sx, sy, colonyRingR, 0, Math.PI * 2);
          ctx.stroke();

          // Small emerald node
          ctx.fillStyle = '#34D399';
          ctx.beginPath();
          ctx.arc(sx, sy - colonyRingR, 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // E. Hover Ring
        if (isHovered && !isSelected) {
          ctx.save();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(sx, sy, baseRadius + 14, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        // F. Star Label (System Name)
        if (showLabels && (camera.zoom > 0.45 || isSelected || isHovered)) {
          ctx.save();
          ctx.font = isSelected ? '600 12px "Plus Jakarta Sans", sans-serif' : '500 11px "Plus Jakarta Sans", sans-serif';
          ctx.fillStyle = isSelected
            ? '#38BDF8'
            : ownerCiv
              ? ownerCiv.color
              : isSystemColonized
                ? '#6EE7B7'
                : '#CBD5E1';
          ctx.shadowColor = '#000000';
          ctx.shadowBlur = 4;
          const namePrefix = ownerCiv ? '◆ ' : isSystemColonized ? '🏛 ' : '';
          const displaySystemName = `${namePrefix}${sys.name}`;
          ctx.fillText(displaySystemName, sx + baseRadius + 8, sy + 4);

          // Subtitle spectral class
          if (camera.zoom > 0.8 || isSelected) {
            ctx.font = '400 9px "JetBrains Mono", monospace';
            ctx.fillStyle = isSelected
              ? '#7DD3FC'
              : ownerCiv
                ? hexToRgba(ownerCiv.color, 0.85)
                : isSystemColonized
                  ? '#A7F3D0'
                  : '#64748B';
            const statusTag = isSystemColonized ? ' · Besiedelt' : '';
            const ownerTag = ownerCiv && (isSelected || camera.zoom > 1)
              ? ` · ${ownerCiv.name}`
              : '';
            ctx.fillText(
              `Typ ${star.spectralClass} · ${sys.planetCount}P${statusTag}${ownerTag}`,
              sx + baseRadius + 8,
              sy + 16
            );
          }
          ctx.restore();
        }
      }

      // 8. Fleet markers on top of stars, labels and paths.
      for (const marker of fleetMarkers) {
        const { fleet, x, y, radius, glyphClass, isMoving, isSelected } = marker;
        drawFleetGlyph(ctx, x, y, radius, glyphClass, {
          moving: isMoving,
          selected: isSelected,
          zoom: camera.zoom,
        });

        // Bewegungsrichtung als kleiner Pfeil am Rand des Markers.
        if (isMoving && fleet.pathSystemIds.length > 1) {
          const nextId = fleet.pathSystemIds[
            Math.min(fleet.pathSystemIds.length - 1, fleet.pathIndex + 1)
          ];
          const next = systemById.get(nextId);
          if (next) {
            const nextScreen = worldToScreen(next.x, next.y);
            const angle = Math.atan2(nextScreen.y - y, nextScreen.x - x);
            ctx.save();
            ctx.fillStyle = 'rgba(34, 211, 238, 0.95)';
            ctx.beginPath();
            ctx.moveTo(
              x + Math.cos(angle) * (radius + 5),
              y + Math.sin(angle) * (radius + 5)
            );
            ctx.lineTo(
              x + Math.cos(angle + 2.5) * (radius + 1),
              y + Math.sin(angle + 2.5) * (radius + 1)
            );
            ctx.lineTo(
              x + Math.cos(angle - 2.5) * (radius + 1),
              y + Math.sin(angle - 2.5) * (radius + 1)
            );
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          }
        }

        const totalShips = fleet.ships.reduce((sum, stack) => sum + stack.count, 0);
        if (camera.zoom > 0.7 || isSelected) {
          ctx.save();
          ctx.font = `${Math.max(9, Math.round(10 * camera.zoom))}px ui-monospace, monospace`;
          ctx.fillStyle = isSelected ? '#F8FAFC' : 'rgba(226, 232, 240, 0.9)';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(`${totalShips}`, x, y + radius + 3);
          ctx.restore();
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [galaxy, camera, selectedSystem, hoveredSystem, showHyperlanes, showLabels, tradeRoutes, tradeConvoys, fleets, selectedFleetId, previewRouteSystemIds, plannedRouteSystemIds, isRoutePlanning, systemById, resolveOwnerCiv, territoryBorders, screenToWorld, worldToScreen]);

  // Handle Canvas Resize
  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current || !canvasRef.current) return;
      const { clientWidth, clientHeight } = containerRef.current;
      const dpr = window.devicePixelRatio || 1;
      canvasRef.current.width = clientWidth * dpr;
      canvasRef.current.height = clientHeight * dpr;
      canvasRef.current.style.width = `${clientWidth}px`;
      canvasRef.current.style.height = `${clientHeight}px`;

      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Mouse Handlers for Pan & Select
  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    dragMovedRef.current = false;
    dragStartClientRef.current = { x: e.clientX, y: e.clientY };
    dragStartRef.current = { x: e.clientX - camera.panX, y: e.clientY - camera.panY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Pan camera if mouse button held. Ab einer kleinen Schwelle gilt die
    // Geste als Ziehen und darf beim Loslassen keinen Klick auslösen.
    if (isDraggingRef.current) {
      const distance = Math.hypot(
        e.clientX - dragStartClientRef.current.x,
        e.clientY - dragStartClientRef.current.y
      );
      if (distance >= 5) dragMovedRef.current = true;
      setCamera((prev) => ({
        ...prev,
        panX: e.clientX - dragStartRef.current.x,
        panY: e.clientY - dragStartRef.current.y,
      }));
    }

    // Update cursor Ly readout
    const worldPos = screenToWorld(mouseX, mouseY);
    setCursorLy({ x: Math.round(worldPos.x), y: Math.round(worldPos.y) });

    // Hit test for star systems
    let closest: StarSystem | null = null;
    let minDistancePx = 18; // Click/Hover radius

    for (const sys of galaxy.systems) {
      const screenPos = worldToScreen(sys.x, sys.y);
      const dist = Math.hypot(screenPos.x - mouseX, screenPos.y - mouseY);
      if (dist < minDistancePx) {
        closest = sys;
        minDistancePx = dist;
      }
    }

    setHoveredSystem(closest);
    const nextHoveredId = closest?.id ?? null;
    if (nextHoveredId !== lastHoveredIdRef.current) {
      lastHoveredIdRef.current = nextHoveredId;
      onHoverSystem?.(closest);
    }
  };

  const handleMouseLeave = () => {
    setHoveredSystem(null);
    if (lastHoveredIdRef.current !== null) {
      lastHoveredIdRef.current = null;
      onHoverSystem?.(null);
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Nur ein echter Klick (kein Ziehen) darf auswählen oder bewegen.
    if (!dragMovedRef.current) {
      // 1. Verbände zuerst prüfen: Die Marker liegen ringförmig um das System
      //    und sollen einzeln auswählbar sein.
      let fleetHandled = false;
      for (const [systemId, systemFleets] of fleetsBySystem) {
        const system = systemById.get(systemId);
        if (!system) continue;
        const base = worldToScreen(system.x, system.y);
        for (let index = 0; index < systemFleets.length; index += 1) {
          const { dx, dy } = fleetMarkerOffset(index, systemFleets.length, camera.zoom);
          const dist = Math.hypot(base.x + dx - mouseX, base.y + dy - mouseY);
          if (dist < 12) {
            onSelectFleet?.(systemFleets[index]);
            fleetHandled = true;
            break;
          }
        }
        if (fleetHandled) break;
      }

      // 2. Andernfalls Sternensystem auswählen. Die Verbandsauswahl bleibt
      //    dabei erhalten, damit ein Zielsystem im nächsten Klick bestätigt
      //    werden kann; nur ein Klick ins Leere hebt sie auf.
      if (!fleetHandled) {
        let clickedSystem: StarSystem | null = null;
        for (const sys of galaxy.systems) {
          const screenPos = worldToScreen(sys.x, sys.y);
          const dist = Math.hypot(screenPos.x - mouseX, screenPos.y - mouseY);
          if (dist < 22) {
            clickedSystem = sys;
            break;
          }
        }
        if (clickedSystem) {
          onSelectSystem(clickedSystem);
        } else {
          onSelectFleet?.(null);
        }
      }
    }

    isDraggingRef.current = false;
    dragMovedRef.current = false;
  };

  // Wheel Zoom handler
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    const newZoom = Math.max(0.2, Math.min(3.5, camera.zoom * zoomFactor));

    // Keep point under mouse fixed in world coordinates
    const worldPos = screenToWorld(mouseX, mouseY);
    const newPanX = mouseX - worldPos.x * newZoom;
    const newPanY = mouseY - worldPos.y * newZoom;

    setCamera({
      zoom: newZoom,
      panX: newPanX,
      panY: newPanY,
    });
  };

  // On-screen Zoom In / Out
  const zoomIn = () => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    const cx = clientWidth / 2;
    const cy = clientHeight / 2;
    const worldCenter = screenToWorld(cx, cy);
    const nextZoom = Math.min(3.5, camera.zoom * 1.25);
    setCamera({
      zoom: nextZoom,
      panX: cx - worldCenter.x * nextZoom,
      panY: cy - worldCenter.y * nextZoom,
    });
  };

  const zoomOut = () => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    const cx = clientWidth / 2;
    const cy = clientHeight / 2;
    const worldCenter = screenToWorld(cx, cy);
    const nextZoom = Math.max(0.2, camera.zoom * 0.8);
    setCamera({
      zoom: nextZoom,
      panX: cx - worldCenter.x * nextZoom,
      panY: cy - worldCenter.y * nextZoom,
    });
  };

  const hoveredOwnerCiv = hoveredSystem
    ? resolveOwnerCiv(hoveredSystem.ownerFactionId)
    : null;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-slate-950 select-none cursor-crosshair"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onWheel={handleWheel}
    >
      {/* 2D High Performance Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full" />

      {/* Routenplanungsmodus: eindeutiger Modus-Hinweis über der Karte. */}
      {isRoutePlanning && (
        <div
          data-route-planning-banner
          className="pointer-events-none absolute left-4 top-24 z-30 rounded-lg border border-red-700/80 bg-red-950/90 px-3 py-1.5 text-[11px] font-mono text-red-100 shadow-xl"
        >
          <span className="mr-2 inline-block h-2 w-2 rounded-full bg-red-400 align-middle" />
          Routenplanung aktiv – Zielsystem auswählen
        </div>
      )}

      {/* Top Left: Galaxy Info & Navigation Overlay */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 pointer-events-none">
        <div className="bg-slate-950/80 backdrop-blur-md border border-slate-800/80 p-3 rounded-lg text-xs font-mono text-slate-300 shadow-xl pointer-events-auto max-w-xs">
          <div className="flex items-center justify-between gap-4 mb-1">
            <span className="text-slate-100 font-semibold uppercase">{galaxy.name}</span>
            <span className="text-cyan-400 font-mono text-[11px]">{galaxy.systems.length} SYSTEME</span>
          </div>
          <div className="text-slate-400 text-[11px] flex items-center gap-2">
            <span>SEED: {galaxy.seed}</span>
            <span>·</span>
            <span>{galaxy.config.width} × {galaxy.config.height} Lj</span>
          </div>
        </div>
      </div>

      {/* Bottom Left: Tactical HUD Telemetry */}
      <div className="absolute bottom-4 left-4 z-10 flex items-center gap-3 pointer-events-none">
        <div className="bg-slate-950/85 backdrop-blur-md border border-slate-800/80 px-3 py-1.5 rounded-md text-[11px] font-mono text-slate-400 shadow-lg pointer-events-auto flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">CURSOR:</span>
            <span className="text-slate-200 tabular-nums">
              X:{cursorLy.x > 0 ? `+${cursorLy.x}` : cursorLy.x} · Y:{cursorLy.y > 0 ? `+${cursorLy.y}` : cursorLy.y} Lj
            </span>
          </div>
          <div className="flex items-center gap-1.5 border-l border-slate-800 pl-3">
            <span className="text-slate-500">ZOOM:</span>
            <span className="text-cyan-400 tabular-nums">{Math.round(camera.zoom * 100)}%</span>
          </div>
        </div>

        {/* Visibility Toggles */}
        <div className="bg-slate-950/85 backdrop-blur-md border border-slate-800/80 px-2 py-1 rounded-md text-[11px] font-mono text-slate-400 shadow-lg pointer-events-auto flex items-center gap-2">
          <button
            onClick={() => setShowHyperlanes(!showHyperlanes)}
            className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
              showHyperlanes ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800/60' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Hyperlanes
          </button>
          <button
            onClick={() => setShowLabels(!showLabels)}
            className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
              showLabels ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800/60' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Namen
          </button>
        </div>
      </div>

      {/* Top Right: Zoom & Reset Controls */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5 bg-slate-950/85 backdrop-blur-md border border-slate-800/80 p-1.5 rounded-lg shadow-xl">
        <button
          onClick={zoomIn}
          className="w-8 h-8 rounded bg-slate-900 hover:bg-slate-800 active:bg-slate-700 text-slate-200 flex items-center justify-center font-mono font-bold text-sm cursor-pointer transition-colors"
          title="Vergrößern (+)"
        >
          +
        </button>
        <button
          onClick={zoomOut}
          className="w-8 h-8 rounded bg-slate-900 hover:bg-slate-800 active:bg-slate-700 text-slate-200 flex items-center justify-center font-mono font-bold text-sm cursor-pointer transition-colors"
          title="Verkleinern (-)"
        >
          -
        </button>
        <button
          onClick={resetCamera}
          className="px-2.5 h-8 rounded bg-slate-900 hover:bg-slate-800 active:bg-slate-700 text-slate-300 text-xs font-mono cursor-pointer transition-colors whitespace-nowrap"
          title="Galaxie-Gesamtansicht zentrieren"
        >
          Gesamtansicht
        </button>
        {selectedSystem && (
          <button
            onClick={() => focusOnSystem(selectedSystem)}
            className="px-2.5 h-8 rounded bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-800/50 text-cyan-300 text-xs font-mono cursor-pointer transition-colors whitespace-nowrap"
            title="Auf ausgewähltes System zentrieren"
          >
            Fokus
          </button>
        )}
      </div>

      {/* Bottom Right: Territory Legend */}
      {civilizations.length > 0 && (
        <div className="absolute bottom-4 right-4 z-10 pointer-events-none hidden md:block">
          <div className="bg-slate-950/85 backdrop-blur-md border border-slate-800/80 px-3 py-2 rounded-md shadow-lg">
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-1.5">
              Territorien
            </div>
            <div className="flex flex-col gap-1">
              {civilizations.map((civ) => (
                <div key={civ.id} className="flex items-center gap-2 text-[10px] font-mono text-slate-300">
                  <span
                    className="w-2.5 h-2.5 rounded-sm border inline-block"
                    style={{
                      backgroundColor: hexToRgba(civ.color, 0.35),
                      borderColor: civ.borderColor,
                    }}
                  />
                  <span className={civ.isPlayer ? 'text-cyan-300' : ''}>{civ.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Ausgewählter Verband: kompakte Einsatzdaten */}
      {selectedFleet && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 pointer-events-auto bg-slate-950/90 backdrop-blur-md border border-cyan-800/60 rounded-lg px-3.5 py-2 shadow-2xl text-[11px] font-mono text-slate-300 min-w-[16rem]">
          <div className="flex items-center justify-between gap-3">
            <span className="text-cyan-300 font-semibold truncate">{selectedFleet.name}</span>
            <button
              onClick={() => onSelectFleet?.(null)}
              className="text-slate-500 hover:text-slate-200 cursor-pointer px-1"
              title="Verbandsauswahl aufheben"
            >
              ✕
            </button>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-slate-400">
            <span>
              Klasse:{' '}
              <span className="text-slate-200">
                {FLEET_CLASS_LABELS[dominantFleetClass(selectedFleet)]}
              </span>
            </span>
            <span>
              Schiffe:{' '}
              <span className="text-slate-200">
                {selectedFleet.ships.reduce((sum, stack) => sum + stack.count, 0)}
              </span>
            </span>
            <span>
              Status:{' '}
              <span className={selectedFleet.status === 'moving' ? 'text-cyan-300' : 'text-emerald-300'}>
                {selectedFleet.status === 'moving' ? 'im Flug' : 'stationiert'}
              </span>
            </span>
          </div>
          {selectedFleet.destinationSystemId && (
            <div className="mt-0.5 text-slate-500">
              Ziel:{' '}
              <span className="text-slate-300">
                {systemById.get(selectedFleet.destinationSystemId)?.name ??
                  selectedFleet.destinationSystemId}
              </span>
            </div>
          )}
          {selectedFleet.cargo && (
            <div className="mt-0.5 text-amber-300/90">
              Fracht: {selectedFleet.cargo.colonists} Kolonisten · {selectedFleet.cargo.food} Nahrung ·{' '}
              {selectedFleet.cargo.minerals} Mineralien · {selectedFleet.cargo.rareResources} Seltene ·{' '}
              {selectedFleet.cargo.influence} Einfluss
            </div>
          )}
        </div>
      )}

      {/* Floating Hover Tooltip */}
      {hoveredSystem && (
        <div
          className="absolute z-20 pointer-events-none bg-slate-900/95 border border-slate-700 px-2.5 py-1.5 rounded shadow-2xl text-[11px] font-mono text-slate-200 transform -translate-x-1/2 -translate-y-full mb-3"
          style={{
            left: `${worldToScreen(hoveredSystem.x, hoveredSystem.y).x}px`,
            top: `${worldToScreen(hoveredSystem.x, hoveredSystem.y).y - 12}px`,
          }}
        >
          <div className="font-semibold text-slate-100 flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full inline-block"
              style={{ backgroundColor: hoveredSystem.star.color }}
            />
            {hoveredSystem.name}
          </div>
          <div className="text-slate-400 text-[10px]">
            {hoveredSystem.star.spectralClass}-Klasse · {hoveredSystem.planetCount} Planeten
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[10px]">
            <span
              className="w-2 h-2 rounded-sm border inline-block"
              style={{
                backgroundColor: hoveredOwnerCiv
                  ? hexToRgba(hoveredOwnerCiv.color, 0.4)
                  : 'rgba(148, 163, 184, 0.2)',
                borderColor: hoveredOwnerCiv?.borderColor ?? '#475569',
              }}
            />
            <span className="text-slate-500">Territorium:</span>
            {hoveredOwnerCiv ? (
              <span style={{ color: hoveredOwnerCiv.color }}>{hoveredOwnerCiv.name}</span>
            ) : hoveredSystem.ownerFactionId ? (
              <span className="text-amber-300">Unbekannte Macht</span>
            ) : (
              <span className="text-slate-400">Niemandsland</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
