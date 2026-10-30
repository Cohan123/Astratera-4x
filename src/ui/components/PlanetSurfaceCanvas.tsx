/**
 * Astraea 4X - Planetary Surface Hex Canvas
 * High-performance 2D HTML5 Canvas rendering planetary hex grid, biomes, elevations,
 * resource deposits, colony territory borders, buildings, Fog of War, and ground units.
 */

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { BUILDING_CATALOG } from '../../data/buildingCatalog.ts';
import { DEPOSIT_CATALOG } from '../../data/resourceCatalog.ts';
import { BIOME_CATALOG } from '../../data/terrainCatalog.ts';
import { Mulberry32 } from '../../generation/prng.ts';
import { HexMath } from '../../surface/hexMath.ts';
import {
  Colony,
  HexCoord,
  Planet,
  PlanetHexTile,
  PlanetSurface,
  SurfaceUnit,
} from '../../core/types.ts';
import { getSurfaceTileImage } from '../surfaceTileAssets.ts';
import { getColonyTileImage } from '../colonyTileAssets.ts';
import { resolveSurfaceClick } from '../surfaceSelection.ts';
import {
  selectSurfaceTileArt,
  surfaceTileVariant,
  SurfacePlaceholder,
  SurfaceTileArt,
} from '../surfaceTileMapping.ts';

/** Wandelt `#rrggbb` in `rgba(...)` für Platzhalter-Verläufe um. */
function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return `rgba(148, 163, 184, ${alpha})`;
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

interface PlanetSurfaceCanvasProps {
  planet: Planet;
  surface: PlanetSurface;
  colonies: Colony[];
  units: SurfaceUnit[];
  selectedHexCoord: HexCoord | null;
  selectedUnit: SurfaceUnit | null;
  onSelectHex: (coord: HexCoord | null) => void;
  /** `null` hebt die Einheitenauswahl auf. */
  onSelectUnit?: (unitId: string | null) => void;
  onMoveUnitToHex?: (coord: HexCoord) => void;
  /**
   * Öffnet die Kolonieverwaltung für ein Stadtzentrum. Fehlt der Callback,
   * bleibt ein Stadtklick bei der reinen Hex-Auswahl.
   */
  onOpenColonyManagement?: (colonyId: string) => void;
  onBackToSystem: () => void;
  /** Beschriftung des Zurück-Knopfs (z. B. im Testlabor). */
  backLabel?: string;
  /** Blendet den Zurück-Knopf aus, wenn die Navigation bereits außerhalb liegt. */
  showBackButton?: boolean;
  /** Zeigt Ressourcenvorkommen auch ohne Aufdeckung (nur Testlabor). */
  revealAllDeposits?: boolean;
}

export const PlanetSurfaceCanvas: React.FC<PlanetSurfaceCanvasProps> = ({
  planet,
  surface,
  colonies,
  units,
  selectedHexCoord,
  selectedUnit,
  onSelectHex,
  onSelectUnit,
  onMoveUnitToHex,
  onOpenColonyManagement,
  onBackToSystem,
  backLabel = 'Zurück zum System',
  showBackButton = true,
  revealAllDeposits = false,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Pan & Zoom Transform State
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{
    x: number;
    y: number;
    panX: number;
    panY: number;
  }>({ x: 0, y: 0, panX: 0, panY: 0 });
  const [hoveredCoord, setHoveredCoord] = useState<HexCoord | null>(null);

  // CSS viewport size (device-pixel-ratio aware backing store is handled separately)
  const [viewport, setViewport] = useState<{ width: number; height: number; dpr: number }>({
    width: 0,
    height: 0,
    dpr: 1,
  });

  const HEX_RADIUS = 38;
  // Trefferradius für Einheiten-Token (Token-Radius 12 + etwas Toleranz).
  const UNIT_HIT_RADIUS = 16;

  // Stadtzentren nach Hex-Schlüssel auflösen, damit Klick- und Hover-Prüfungen
  // ohne Suche über alle Kacheln auskommen.
  const cityColonyByHexKey = useMemo(() => {
    const map = new Map<string, Colony>();
    for (const colony of colonies) {
      if (!colony.cityCenterCoord) continue;
      map.set(HexMath.coordToKey(colony.cityCenterCoord), colony);
    }
    return map;
  }, [colonies]);

  const findCityColonyAt = useCallback(
    (coord: HexCoord): Colony | null =>
      cityColonyByHexKey.get(HexMath.coordToKey(coord)) ?? null,
    [cityColonyByHexKey]
  );

  // Renderkontext der Kacheln: Küsten, Gewässernähe und eine stabile
  // Variantenwahl pro Kachel. Wird nur neu berechnet, wenn sich die Oberfläche
  // ändert, nicht bei jedem Animationsframe.
  const tileContext = useMemo(() => {
    const byKey = new Map(surface.tiles.map((tile) => [tile.key, tile]));
    const nearWater = new Set<string>();
    const coastal = new Set<string>();
    const variants = new Map<string, number>();

    for (const tile of surface.tiles) {
      variants.set(tile.key, surfaceTileVariant(surface.seed, tile.key));
      const isWater =
        Boolean(tile.isLake) || Boolean(tile.flowsTo) || (tile.riverDischarge ?? 0) >= 5;
      if (isWater) {
        nearWater.add(tile.key);
        for (const neighbor of HexMath.getNeighbors(tile.coord)) {
          nearWater.add(HexMath.coordToKey(neighbor));
        }
      }
    }

    for (const tile of surface.tiles) {
      if (tile.biome !== 'ocean') continue;
      for (const neighbor of HexMath.getNeighbors(tile.coord)) {
        const neighborTile = byKey.get(HexMath.coordToKey(neighbor));
        if (neighborTile && neighborTile.biome !== 'ocean' && neighborTile.biome !== 'gas') {
          coastal.add(tile.key);
          break;
        }
      }
    }

    return { nearWater, coastal, variants };
  }, [surface]);

  // Track container size and keep the canvas backing store in sync with CSS pixels.
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const applySize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      const width = Math.max(0, Math.floor(rect.width));
      const height = Math.max(0, Math.floor(rect.height));
      const backingWidth = Math.max(1, Math.floor(width * dpr));
      const backingHeight = Math.max(1, Math.floor(height * dpr));

      if (canvas.width !== backingWidth) canvas.width = backingWidth;
      if (canvas.height !== backingHeight) canvas.height = backingHeight;

      setViewport((prev) =>
        prev.width === width && prev.height === height && prev.dpr === dpr
          ? prev
          : { width, height, dpr }
      );
    };

    applySize();
    const observer = new ResizeObserver(applySize);
    observer.observe(container);
    window.addEventListener('resize', applySize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', applySize);
    };
  }, []);

  // Center the surface on its tile bounds (in CSS pixels)
  const centerOnSurface = useCallback(() => {
    if (viewport.width === 0 || viewport.height === 0) return;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const tile of surface.tiles) {
      const pixel = HexMath.axialToPixel(tile.coord, HEX_RADIUS);
      if (pixel.x < minX) minX = pixel.x;
      if (pixel.x > maxX) maxX = pixel.x;
      if (pixel.y < minY) minY = pixel.y;
      if (pixel.y > maxY) maxY = pixel.y;
    }

    const centerX = Number.isFinite(minX) ? (minX + maxX) / 2 : 0;
    const centerY = Number.isFinite(minY) ? (minY + maxY) / 2 : 0;

    setPan({
      x: viewport.width / 2 - centerX,
      y: viewport.height / 2 - centerY,
    });
    setZoom(1.0);
  }, [surface.tiles, viewport.width, viewport.height]);

  // Center once per planet, and once the viewport has a usable size
  const centeredPlanetRef = useRef<string | null>(null);
  useEffect(() => {
    if (viewport.width === 0 || viewport.height === 0) return;
    if (centeredPlanetRef.current === surface.planetId) return;
    centeredPlanetRef.current = surface.planetId;
    centerOnSurface();
  }, [surface.planetId, viewport.width, viewport.height, centerOnSurface]);

  // Main Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let pulseAngle = 0;

    const render = () => {
      pulseAngle = (pulseAngle + 0.04) % (Math.PI * 2);
      const width = viewport.width;
      const height = viewport.height;

      // Draw in CSS pixel coordinates; the transform maps them to the backing store.
      ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);

      // 1. Clear Backdrop
      ctx.fillStyle = '#050811';
      ctx.fillRect(0, 0, width, height);

      // Starfield dots on surface horizon
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      for (let i = 0; i < 60; i++) {
        const sx = ((i * 137.5) % width);
        const sy = ((i * 243.1) % height);
        ctx.fillRect(sx, sy, 1, 1);
      }

      ctx.save();
      // Apply pan & zoom
      ctx.translate(pan.x, pan.y);
      ctx.scale(zoom, zoom);

      // 2. Render Hex Tiles
      // Lookup für Flussläufe: Flüsse verbinden eine Kachel mit ihrem
      // hydrologischen Ziel (siehe ADR-037).
      const tileByKey = new Map(surface.tiles.map((t) => [t.key, t]));
      // Koloniekomplexe werden erst nach allen Kacheln gezeichnet, damit die
      // großen isometrischen Grafiken nicht von späteren Nachbarkacheln
      // überdeckt werden. Fehlt eine Grafik, bleibt der Vektor-Fallback.
      const cityArtByKey = new Map<string, HTMLImageElement>();
      for (const colony of colonies) {
        if (!colony.cityCenterCoord) continue;
        const image = getColonyTileImage(colony.developmentTier);
        if (image) cityArtByKey.set(HexMath.coordToKey(colony.cityCenterCoord), image);
      }
      for (const tile of surface.tiles) {
        const center = HexMath.axialToPixel(tile.coord, HEX_RADIUS);
        const biome = BIOME_CATALOG[tile.biome];
        const isSelected =
          selectedHexCoord &&
          selectedHexCoord.q === tile.coord.q &&
          selectedHexCoord.r === tile.coord.r;
        const isHovered =
          hoveredCoord &&
          hoveredCoord.q === tile.coord.q &&
          hoveredCoord.r === tile.coord.r;

        // Fog of War: unerkundete Kacheln bleiben als dunkle Silhouette stehen.
        if (tile.visibility === 'unseen') {
          drawHexagon(ctx, center.x, center.y, HEX_RADIUS);
          ctx.fillStyle = '#090d16';
          ctx.fill();
          ctx.strokeStyle = '#111827';
          ctx.lineWidth = 1;
          ctx.stroke();
          continue; // Hidden content
        }

        const art = selectSurfaceTileArt(tile, {
          planetType: planet.planetType,
          variant: tileContext.variants.get(tile.key) ?? 0,
          isCoastal: tileContext.coastal.has(tile.key),
          nearWater: tileContext.nearWater.has(tile.key),
        });
        drawSurfaceTile(ctx, art, tile, center.x, center.y, HEX_RADIUS, planet);

        // Elevation shade overlay
        if (tile.elevation > 1) {
          drawHexagon(ctx, center.x, center.y, HEX_RADIUS);
          ctx.fillStyle = `rgba(255, 255, 255, ${tile.elevation * 0.035})`;
          ctx.fill();
        }

        // Stehende Binnenwasserfläche (See) über der Höhenschattierung
        if (tile.isLake) {
          drawHexagon(ctx, center.x, center.y, HEX_RADIUS);
          ctx.fillStyle = 'rgba(14, 116, 144, 0.28)';
          ctx.fill();
        }

        // Hex Outline
        drawHexagon(ctx, center.x, center.y, HEX_RADIUS);
        ctx.strokeStyle = biome.strokeColor;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Territory Border if claimed
        if (tile.claimedByColonyId) {
          const isPlayer = tile.claimedByCivId === 'player-empire';
          ctx.save();
          drawHexagon(ctx, center.x, center.y, HEX_RADIUS - 2);
          ctx.strokeStyle = isPlayer ? '#06b6d4' : '#f59e0b';
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.restore();
        }

        // Worked indicator
        if (tile.isWorked) {
          ctx.save();
          ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
          drawHexagon(ctx, center.x, center.y, HEX_RADIUS - 4);
          ctx.fill();
          ctx.restore();
        }

        // Draw Building / City Center
        if (tile.isCityCenter) {
          const cityColony = cityColonyByHexKey.get(tile.key);
          if (!cityArtByKey.has(tile.key)) {
            drawCityCenterSprite(ctx, center.x, center.y);
            if (cityColony) {
              drawCityNameLabel(ctx, center.x, center.y, cityColony.name);
            }
          }
        } else if (tile.buildingInstanceId) {
          const colony = colonies.find((c) => c.claimedHexKeys.includes(tile.key));
          const bInst = colony?.buildings.find((b) => b.id === tile.buildingInstanceId);
          if (bInst) {
            drawBuildingSprite(ctx, center.x, center.y, bInst.buildingDefId, bInst.level);
          }
        }

        // Draw Revealed Resource Deposit
        if ((tile.isDepositDiscovered || revealAllDeposits) && tile.deposit !== 'none') {
          const dep = DEPOSIT_CATALOG[tile.deposit];
          ctx.save();
          ctx.font = '12px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(dep.icon, center.x, center.y - 12);
          ctx.restore();
        }

        // Selection / Hover Reticle. Stadtzentren mit eigener Grafik erhalten
        // ihren Rahmen im zweiten Durchgang über dem Koloniekomplex.
        if (!cityArtByKey.has(tile.key)) {
          drawHexReticle(
            ctx,
            center.x,
            center.y,
            Boolean(isSelected),
            Boolean(isHovered),
            pulseAngle
          );
        }
      }

      // 2a. Koloniekomplexe über den Kacheln zeichnen.
      for (const colony of colonies) {
        if (!colony.cityCenterCoord) continue;
        const key = HexMath.coordToKey(colony.cityCenterCoord);
        const tile = tileByKey.get(key);
        const image = cityArtByKey.get(key);
        if (!tile || !image || tile.visibility === 'unseen') continue;

        const center = HexMath.axialToPixel(tile.coord, HEX_RADIUS);
        drawColonyComplexSprite(ctx, center.x, center.y, image);
        drawCityNameLabel(ctx, center.x, center.y + HEX_RADIUS * 0.6, colony.name);

        const isSelected =
          selectedHexCoord &&
          selectedHexCoord.q === tile.coord.q &&
          selectedHexCoord.r === tile.coord.r;
        const isHovered =
          hoveredCoord && hoveredCoord.q === tile.coord.q && hoveredCoord.r === tile.coord.r;
        if (isSelected || isHovered) {
          drawHexReticle(
            ctx,
            center.x,
            center.y,
            Boolean(isSelected),
            Boolean(isHovered),
            pulseAngle
          );
        }
      }

      // 2b. Render Rivers and Streams
      ctx.save();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
      ctx.lineCap = 'round';
      for (const tile of surface.tiles) {
        if (!tile.flowsTo || tile.visibility === 'unseen') continue;
        const target = tileByKey.get(tile.flowsTo);
        if (!target || target.visibility === 'unseen') continue;
        const from = HexMath.axialToPixel(tile.coord, HEX_RADIUS);
        const to = HexMath.axialToPixel(target.coord, HEX_RADIUS);
        const discharge = tile.riverDischarge ?? 0;
        ctx.lineWidth = 0.5 + Math.min(2.5, Math.log2(Math.max(1, discharge)) * 0.35);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }
      ctx.restore();

      // 3. Render Ground Units on this Planet
      const planetUnits = units.filter((u) => u.planetId === planet.id);
      for (const unit of planetUnits) {
        const center = HexMath.axialToPixel(unit.hexCoord, HEX_RADIUS);
        const isSelected = Boolean(selectedUnit && selectedUnit.id === unit.id);
        drawUnitToken(ctx, center.x, center.y, unit, isSelected, pulseAngle);
      }

      ctx.restore();

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [
    pan,
    zoom,
    surface,
    colonies,
    units,
    selectedHexCoord,
    selectedUnit,
    hoveredCoord,
    cityColonyByHexKey,
    tileContext,
    planet,
    viewport.width,
    viewport.height,
    viewport.dpr,
    revealAllDeposits,
  ]);

  // Helper: Draw Pointy-Topped Hexagon
  const drawHexagon = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number
  ) => {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      const hx = x + radius * Math.cos(angle);
      const hy = y + radius * Math.sin(angle);
      if (i === 0) ctx.moveTo(hx, hy);
      else ctx.lineTo(hx, hy);
    }
    ctx.closePath();
  };

  /**
   * Zeichnet eine Kachel als Pixel-Tile. Basis und transparenter Aufsatz werden
   * getrennt geladen; fehlt ein Asset, bleibt die Biome-Farbe als Fallback.
   * Für Lavawelten, Gaswelten und fremdartige Biome zeichnet der Renderer
   * prozedurale Platzhalter im Stil der übrigen 32×32-Kacheln.
   */
  const drawSurfaceTile = (
    ctx: CanvasRenderingContext2D,
    art: SurfaceTileArt,
    tile: PlanetHexTile,
    x: number,
    y: number,
    radius: number,
    planet: Planet
  ) => {
    const width = Math.sqrt(3) * radius;
    const height = 2 * radius;
    // Hochauflösende Kacheln (Lava/Berge) enthalten einen transparenten Rand.
    // Der Bleed-Faktor vergrößert die Zeichenfläche so, dass die sichtbare
    // Hex-Fläche wieder exakt auf dem Raster landet.
    const bleed = art.bleed && Number.isFinite(art.bleed) ? Math.max(1, art.bleed) : 1;
    const drawWidth = width * bleed;
    const drawHeight = height * bleed;
    const left = x - drawWidth / 2;
    const top = y - drawHeight / 2;

    ctx.save();
    drawHexagon(ctx, x, y, radius);
    ctx.clip();
    ctx.imageSmoothingEnabled = bleed > 1;

    if (art.placeholder) {
      drawPlaceholderTile(
        ctx,
        art.placeholder,
        tile,
        x - width / 2,
        y - height / 2,
        width,
        height,
        planet
      );
    } else {
      // Immer zuerst die Fallback-Farbe anlegen, damit transparente Ränder
      // oder noch nicht geladene Assets nie den Hintergrund durchscheinen
      // lassen.
      ctx.fillStyle = art.fallbackColor;
      ctx.fillRect(x - width / 2, y - height / 2, width, height);

      const baseImage = art.base ? getSurfaceTileImage(art.base) : null;
      if (baseImage) {
        ctx.drawImage(baseImage, left, top, drawWidth, drawHeight);
      }

      if (art.overlay) {
        const overlayImage = getSurfaceTileImage(art.overlay);
        if (overlayImage) {
          ctx.drawImage(overlayImage, left, top, drawWidth, drawHeight);
        }
      }

      if (art.tint) {
        ctx.fillStyle = art.tint;
        ctx.fillRect(x - width / 2, y - height / 2, width, height);
      }

      if (art.emblem === 'crater') {
        drawCraterEmblem(ctx, x - width / 2, y - height / 2, width, height);
      }
    }

    ctx.restore();
  };

  // Helper: Prozedurale Platzhalter für Biome ohne Tileset-Assets.
  const drawPlaceholderTile = (
    ctx: CanvasRenderingContext2D,
    kind: SurfacePlaceholder,
    tile: PlanetHexTile,
    left: number,
    top: number,
    width: number,
    height: number,
    planet: Planet
  ) => {
    const rnd = new Mulberry32(`${tile.key}:${kind}:${tile.coord.q}:${tile.coord.r}`);

    if (kind === 'lava') {
      const gradient = ctx.createLinearGradient(left, top, left, top + height);
      gradient.addColorStop(0, '#3b100c');
      gradient.addColorStop(0.55, '#1c0908');
      gradient.addColorStop(1, '#2a0a06');
      ctx.fillStyle = gradient;
      ctx.fillRect(left, top, width, height);

      // Glühende Risse als unregelmäßige Polylinien.
      ctx.lineCap = 'round';
      for (let i = 0; i < 7; i++) {
        const startX = left + rnd.next() * width;
        const startY = top + rnd.next() * height;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        let px = startX;
        let py = startY;
        for (let step = 0; step < 3; step++) {
          px += (rnd.next() - 0.45) * width * 0.35;
          py += (rnd.next() - 0.2) * height * 0.2;
          ctx.lineTo(px, py);
        }
        ctx.strokeStyle = i % 3 === 0 ? '#fde047' : i % 2 === 0 ? '#fb923c' : '#ef4444';
        ctx.lineWidth = 0.8 + rnd.next() * 1.7;
        ctx.shadowColor = '#f97316';
        ctx.shadowBlur = 5;
        ctx.stroke();
      }
      ctx.shadowBlur = 0;

      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.fillStyle = i % 2 === 0 ? 'rgba(251, 191, 36, 0.85)' : 'rgba(239, 68, 68, 0.7)';
        ctx.arc(
          left + rnd.next() * width,
          top + rnd.next() * height,
          0.8 + rnd.next() * 1.8,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
      return;
    }

    if (kind === 'gas') {
      const gradient = ctx.createLinearGradient(left, top, left, top + height);
      gradient.addColorStop(0, '#7c2d12');
      gradient.addColorStop(0.45, '#b45309');
      gradient.addColorStop(1, '#451a03');
      ctx.fillStyle = gradient;
      ctx.fillRect(left, top, width, height);

      // Wolkengürtel als breite, leicht wellige Linien.
      for (let band = 0; band < 6; band++) {
        const baseY = top + ((band + 0.5) / 6) * height;
        ctx.beginPath();
        ctx.moveTo(left, baseY);
        for (let step = 0; step <= 8; step++) {
          const px = left + (step / 8) * width;
          const py =
            baseY +
            Math.sin((step / 8) * Math.PI * 2 + band * 1.7) * height * 0.035;
          ctx.lineTo(px, py);
        }
        ctx.strokeStyle =
          band % 2 === 0
            ? hexToRgba(planet.accentColor, 0.35)
            : 'rgba(254, 243, 199, 0.14)';
        ctx.lineWidth = height / 12;
        ctx.stroke();
      }

      // Sturmwirbel.
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.ellipse(
        left + width * (0.35 + rnd.next() * 0.3),
        top + height * (0.3 + rnd.next() * 0.4),
        width * 0.16,
        height * 0.08,
        rnd.next() * Math.PI,
        0,
        Math.PI * 1.7
      );
      ctx.stroke();
      return;
    }

    if (kind === 'toxic') {
      ctx.fillStyle = '#23300f';
      ctx.fillRect(left, top, width, height);
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.fillStyle = i % 2 === 0 ? 'rgba(132, 204, 22, 0.8)' : 'rgba(163, 230, 53, 0.55)';
        ctx.ellipse(
          left + rnd.next() * width,
          top + rnd.next() * height,
          width * (0.08 + rnd.next() * 0.12),
          height * (0.04 + rnd.next() * 0.05),
          rnd.next() * Math.PI,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
      for (let i = 0; i < 7; i++) {
        ctx.beginPath();
        ctx.fillStyle = 'rgba(217, 249, 157, 0.75)';
        ctx.arc(
          left + rnd.next() * width,
          top + rnd.next() * height,
          0.6 + rnd.next() * 1.1,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
      return;
    }

    // Alien / Xenoflora: dunkler Boden mit biolumineszenten Punkten und Stängeln.
    const gradient = ctx.createRadialGradient(
      left + width / 2,
      top + height / 2,
      2,
      left + width / 2,
      top + height / 2,
      width * 0.7
    );
    gradient.addColorStop(0, '#3b1d5c');
    gradient.addColorStop(0.6, '#1e1638');
    gradient.addColorStop(1, '#0d0a1a');
    ctx.fillStyle = gradient;
    ctx.fillRect(left, top, width, height);

    const glowColors = ['#22d3ee', '#a78bfa', '#f472b6', '#a3e635'];
    for (let i = 0; i < 9; i++) {
      const cx = left + rnd.next() * width;
      const cy = top + rnd.next() * height;
      const radius = 0.7 + rnd.next() * 1.5;
      ctx.beginPath();
      ctx.fillStyle = glowColors[i % glowColors.length];
      ctx.shadowColor = glowColors[i % glowColors.length];
      ctx.shadowBlur = 6;
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    for (let i = 0; i < 3; i++) {
      const cx = left + width * (0.2 + rnd.next() * 0.6);
      const baseY = top + height * (0.55 + rnd.next() * 0.3);
      const stalkHeight = height * (0.12 + rnd.next() * 0.12);
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(167, 139, 250, 0.85)';
      ctx.lineWidth = 1;
      ctx.moveTo(cx, baseY);
      ctx.lineTo(cx, baseY - stalkHeight);
      ctx.stroke();
      ctx.beginPath();
      ctx.fillStyle = 'rgba(34, 211, 238, 0.8)';
      ctx.ellipse(cx, baseY - stalkHeight, 2.5, 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const drawCraterEmblem = (
    ctx: CanvasRenderingContext2D,
    left: number,
    top: number,
    width: number,
    height: number
  ) => {
    const cx = left + width / 2;
    const cy = top + height / 2;
    ctx.beginPath();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
    ctx.ellipse(cx, cy, width * 0.3, height * 0.17, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(203, 213, 225, 0.65)';
    ctx.lineWidth = 1.2;
    ctx.ellipse(cx, cy, width * 0.3, height * 0.17, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(2, 6, 23, 0.6)';
    ctx.lineWidth = 1;
    ctx.ellipse(cx, cy + height * 0.015, width * 0.18, height * 0.09, 0, 0, Math.PI * 2);
    ctx.stroke();
  };

  // Helper: Draw City Center Sprite
  const drawCityCenterSprite = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
    ctx.save();
    // Central dome & towers
    ctx.fillStyle = '#06b6d4';
    ctx.beginPath();
    ctx.arc(x, y + 2, 9, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#e0f2fe';
    ctx.fillRect(x - 3, y - 9, 6, 9);
    ctx.fillRect(x - 8, y - 4, 4, 7);
    ctx.fillRect(x + 4, y - 4, 4, 7);

    // Beacon beacon ring
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - 9, y - 9, 18, 16);
    ctx.restore();
  };

  // Helper: Draw Colony Complex Sprite (isometrischer Gesamtkomplex)
  const drawColonyComplexSprite = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    image: HTMLImageElement
  ) => {
    // Die PNGs sind quadratisch mit transparentem Rand. Die Grafik wird
    // seitenverhältnistreu skaliert und so verankert, dass der sichtbare
    // Komplex (Alpha-Box ca. 66–96 % der Bildfläche) auf der Kachel steht.
    const size = HEX_RADIUS * 4.0;
    const bottom = y + HEX_RADIUS * 1.35;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(image, x - size / 2, bottom - size, size, size);
    ctx.restore();
  };

  // Helper: Selection / Hover Reticle
  const drawHexReticle = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    isSelected: boolean,
    isHovered: boolean,
    pulseAngle: number
  ) => {
    if (isSelected) {
      ctx.save();
      drawHexagon(ctx, x, y, HEX_RADIUS + 2 + Math.sin(pulseAngle) * 1.5);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();
    } else if (isHovered) {
      ctx.save();
      drawHexagon(ctx, x, y, HEX_RADIUS + 1);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }
  };

  // Helper: Draw Colony Name Label below a City Center Sprite
  const drawCityNameLabel = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    name: string
  ) => {
    if (!name) return;
    ctx.save();
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const textWidth = ctx.measureText(name).width;
    const labelY = y + 16;
    ctx.fillStyle = 'rgba(2, 6, 23, 0.85)';
    ctx.fillRect(x - textWidth / 2 - 4, labelY - 1, textWidth + 8, 13);
    ctx.fillStyle = '#e0f2fe';
    ctx.fillText(name, x, labelY);
    ctx.restore();
  };

  // Helper: Draw Building Sprite
  const drawBuildingSprite = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    defId: string,
    level: number
  ) => {
    ctx.save();
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let icon = '🏭';
    if (defId === 'hydroponics_dome') icon = '🌿';
    else if (defId === 'solar_array') icon = '☀️';
    else if (defId === 'geothermal_plant') icon = '🌋';
    else if (defId === 'mineral_extractor') icon = '⛏️';
    else if (defId === 'research_lab') icon = '🔬';
    else if (defId === 'comm_relay') icon = '📡';
    else if (defId === 'pioneer_barracks') icon = '🛡️';

    ctx.fillText(icon, x, y);

    // Level indicator dots
    ctx.fillStyle = '#38bdf8';
    for (let l = 0; l < level; l++) {
      ctx.beginPath();
      ctx.arc(x - 5 + l * 5, y + 10, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  };

  // Helper: Draw Ground Unit Token
  const drawUnitToken = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    unit: SurfaceUnit,
    isSelected: boolean,
    pulseAngle: number
  ) => {
    ctx.save();
    const tokenRadius = 12;

    // Unit circle background
    ctx.fillStyle = unit.civId === 'player-empire' ? '#0284c7' : '#d97706';
    ctx.beginPath();
    ctx.arc(x, y, tokenRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Unit type icon
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    const symbol = unit.unitDefId === 'scout' ? '🔭' : unit.unitDefId === 'pioneer' ? '🛠️' : '⚔️';
    ctx.fillText(symbol, x, y);

    // Movement points badge
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(x + 9, y - 9, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '8px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${unit.movementPointsRemaining}`, x + 9, y - 8);

    // Selected pulse ring
    if (isSelected) {
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, tokenRadius + 4 + Math.sin(pulseAngle) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  };

  /**
   * Ermittelt den obersten Einheiten-Token unter einem Klickpunkt (Weltkoordinaten
   * der Karte). Bei mehreren Treffern gewinnt der nächstgelegene Mittelpunkt.
   */
  const findUnitTokenAt = (worldX: number, worldY: number): SurfaceUnit | null => {
    let hit: SurfaceUnit | null = null;
    let bestDistance = UNIT_HIT_RADIUS;
    for (const unit of units) {
      if (unit.planetId !== planet.id) continue;
      const center = HexMath.axialToPixel(unit.hexCoord, HEX_RADIUS);
      const distance = Math.hypot(worldX - center.x, worldY - center.y);
      if (distance <= bestDistance) {
        bestDistance = distance;
        hit = unit;
      }
    }
    return hit;
  };

  // Mouse Interaction Handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 0) {
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging) {
      setPan({
        x: dragStart.panX + (e.clientX - dragStart.x),
        y: dragStart.panY + (e.clientY - dragStart.y),
      });
    }

    // Hover detection
    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left - pan.x) / zoom;
      const mouseY = (e.clientY - rect.top - pan.y) / zoom;
      const hex = HexMath.pixelToAxial(mouseX, mouseY, HEX_RADIUS);
      const key = HexMath.coordToKey(hex);
      const exists = surface.tiles.some((t) => t.key === key);
      setHoveredCoord(exists ? hex : null);
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(false);

    // Check if click was stationary (not a pan drag)
    const dist = Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y);
    if (dist < 5 && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const clickX = (e.clientX - rect.left - pan.x) / zoom;
      const clickY = (e.clientY - rect.top - pan.y) / zoom;
      const clickedHex = HexMath.pixelToAxial(clickX, clickY, HEX_RADIUS);
      const key = HexMath.coordToKey(clickedHex);
      const tile = surface.tiles.find((t) => t.key === key);

      if (tile) {
        // Zentrale, testbare Klickauflösung: Token-Treffer haben Vorrang,
        // erneutes Anklicken derselben Einheit hebt die Auswahl auf.
        const clickedUnit = findUnitTokenAt(clickX, clickY);
        const unitOnTile =
          units.find(
            (u) =>
              u.planetId === planet.id &&
              u.hexCoord.q === clickedHex.q &&
              u.hexCoord.r === clickedHex.r
          ) ?? null;
        const cityColony = tile.isCityCenter ? findCityColonyAt(clickedHex) : null;

        const action = resolveSurfaceClick({
          clickedUnitId: clickedUnit?.id ?? null,
          selectedUnitId: selectedUnit?.id ?? null,
          isCityCenter: tile.isCityCenter,
          cityColonyId: cityColony?.id ?? null,
          hasColonyManagement: Boolean(onOpenColonyManagement),
          unitOnTileId: unitOnTile?.id ?? null,
          canMoveSelectedUnit: Boolean(onMoveUnitToHex),
        });

        switch (action.kind) {
          case 'deselect-unit':
            onSelectUnit?.(null);
            onSelectHex(clickedHex);
            return;
          case 'select-unit':
            onSelectUnit?.(action.unitId);
            onSelectHex(clickedHex);
            return;
          case 'open-colony':
            onSelectHex(clickedHex);
            onOpenColonyManagement?.(action.colonyId);
            return;
          case 'move-unit':
            onMoveUnitToHex?.(clickedHex);
            return;
          default:
            onSelectHex(clickedHex);
        }
      }
    }
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
    setHoveredCoord(null);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    setZoom((prev) => Math.min(2.5, Math.max(0.4, prev * zoomFactor)));
  };

  const hoveredCityColony = hoveredCoord ? findCityColonyAt(hoveredCoord) : null;
  const hoveredUnit = hoveredCoord
    ? (() => {
        const center = HexMath.axialToPixel(hoveredCoord, HEX_RADIUS);
        return findUnitTokenAt(center.x, center.y);
      })()
    : null;
  const canvasCursor = isDragging
    ? 'cursor-grabbing'
    : hoveredCityColony
      ? 'cursor-pointer'
      : hoveredUnit
        ? 'cursor-pointer'
        : 'cursor-crosshair';

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden select-none bg-slate-950">
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
        className={`w-full h-full block ${canvasCursor}`}
      />

      {/* Surface Navigation Overlay */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
        {showBackButton && (
          <button
            onClick={onBackToSystem}
            className="px-3 py-1.5 bg-slate-900/90 hover:bg-slate-800 text-cyan-400 hover:text-cyan-300 border border-slate-700/80 rounded-md text-xs font-mono flex items-center gap-1.5 shadow-lg backdrop-blur cursor-pointer transition-colors"
          >
            <span>← {backLabel}</span>
          </button>
        )}

        <div className="px-3 py-1.5 bg-slate-900/90 border border-slate-800/80 rounded-md text-xs font-mono text-slate-300 backdrop-blur shadow-lg">
          <span className="text-slate-500">Planet:</span> <strong className="text-slate-100">{planet.name}</strong> ·{' '}
          <span className="text-slate-500">Typ:</span> {planet.planetType} ·{' '}
          <span className="text-slate-500">Kacheln:</span> {surface.tiles.length}
        </div>
      </div>

      {/* Surface Map Controls (Zoom) */}
      <div className="absolute bottom-4 right-4 z-20 flex items-center gap-1 bg-slate-900/90 border border-slate-800 rounded-md p-1 backdrop-blur shadow-lg">
        <button
          onClick={() => setZoom((z) => Math.min(2.5, z * 1.2))}
          className="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 rounded text-sm font-mono cursor-pointer"
        >
          +
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(0.4, z * 0.8))}
          className="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 rounded text-sm font-mono cursor-pointer"
        >
          −
        </button>
        <button
          onClick={centerOnSurface}
          className="px-2 h-7 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 rounded text-[10px] font-mono cursor-pointer"
        >
          Reset
        </button>
      </div>

      {/* Hover Status Indicator */}
      {hoveredCoord && (
        <div className="absolute bottom-4 left-4 z-20 px-3 py-1 bg-slate-900/80 border border-slate-800 rounded text-[11px] font-mono text-slate-400 backdrop-blur">
          {hoveredCityColony ? (
            <span>
              <span className="text-slate-500">Kolonie:</span>{' '}
              <strong className="text-slate-100">{hoveredCityColony.name}</strong>
              {onOpenColonyManagement && (
                <span className="text-cyan-400"> · Klick öffnet Kolonie</span>
              )}
            </span>
          ) : hoveredUnit ? (
            <span>
              <span className="text-slate-500">Einheit:</span>{' '}
              <strong className="text-slate-100">{hoveredUnit.unitDefId}</strong>
              <span className="text-slate-500"> · Klick wählt aus</span>
            </span>
          ) : (
            <span>
              Hex [{hoveredCoord.q}, {hoveredCoord.r}]
            </span>
          )}
        </div>
      )}
    </div>
  );
};
