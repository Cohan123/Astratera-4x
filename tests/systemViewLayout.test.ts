/**
 * Astraea 4X - System View Layout Tests
 * Prüft die reine Geometrie der Systemkarte: Sortierung nach realer
 * Umlaufdistanz, logarithmische Detailachse, Mindestabstände, Scrollen,
 * Zentrierung und Hit-Testing. Die Tests teilen sich die Implementierung
 * mit dem Canvas, damit Zeichnen und Klicken nicht auseinanderlaufen.
 */

import { describe, expect, it } from 'vitest';
import type { AsteroidBelt, Moon, Planet } from '../src/core/types.ts';
import {
  DETAIL_MIN_GAP,
  DETAIL_STAR_GAP,
  DETAIL_STAR_RADIUS,
  DETAIL_LEFT_MARGIN,
  beltOrbitLabel,
  beltOrbitRadius,
  beltRingHalfWidth,
  clampDetailScroll,
  computeBeltOrbitRings,
  computeOrbitRadius,
  detailBeltPosition,
  detailLayout,
  detailPlanetRadius,
  findScrollForPlanet,
  hitTestPlanets,
  moonOrbitAngle,
  moonOrbitRadius,
  orbitPlanetPosition,
  planetVisualRadius,
  sortPlanetsByDistance,
} from '../src/ui/systemViewLayout.ts';

function createPlanet(
  id: string,
  orbitIndex: number,
  orbitDistanceAu: number,
  overrides: Partial<Planet> = {}
): Planet {
  return {
    id,
    name: `Planet ${id}`,
    systemId: 'SYS-TEST',
    orbitIndex,
    orbitDistanceAu,
    orbitalPeriodDays: orbitDistanceAu * 365,
    currentAngleRad: 0,
    planetType: 'rocky',
    sizeClass: 18,
    surfaceTemperatureK: 288,
    temperatureCategory: 'temperate',
    atmosphere: 'thin',
    waterAvailability: 'moderate',
    gravityG: 1,
    gravityCategory: 'standard',
    radiationHazard: 'moderate',
    geologicalStability: 'stable',
    habitability: 50,
    habitabilityTier: 'harsh',
    surveyStatus: 'surveyed',
    colonizationStatus: 'uncolonized',
    colonyId: null,
    color: '#38BDF8',
    accentColor: '#0EA5E9',
    texturePattern: 'craters',
    moonsCount: 0,
    ...overrides,
  };
}

function createPlanets(count: number): Planet[] {
  return Array.from({ length: count }, (_, index) =>
    createPlanet(`p${index + 1}`, index + 1, 0.4 * (index + 1) ** 1.4)
  );
}

function createBelt(
  innerAu: number,
  outerAu: number,
  overrides: Partial<AsteroidBelt> = {}
): AsteroidBelt {
  return {
    id: 'SYS-TEST-B1',
    name: 'Testgürtel',
    systemId: 'SYS-TEST',
    innerAu,
    outerAu,
    midpointAu: (innerAu + outerAu) / 2,
    density: 0.6,
    composition: 'rocky',
    ...overrides,
  };
}

function createMoon(index: number, overrides: Partial<Moon> = {}): Moon {
  return {
    id: `p1-M${index}`,
    name: `Mond ${index}`,
    planetId: 'p1',
    index,
    moonType: 'rocky',
    orbitRadiusPlanetRadii: 2.2,
    orbitalPeriodDays: 10,
    radiusKm: 500,
    color: '#D6D3D1',
    isMajor: true,
    ...overrides,
  };
}

describe('Astraea 4X - System View Layout', () => {
  it('1. sortiert Planeten nach realer Umlaufdistanz, dann Orbit-Index und ID', () => {
    const close = createPlanet('c', 3, 0.8);
    const far = createPlanet('f', 1, 9.5);
    const tieB = createPlanet('b', 2, 3.2);
    const tieA = createPlanet('a', 2, 3.2);
    const tieIndex = createPlanet('d', 1, 3.2);

    const sorted = sortPlanetsByDistance([far, close, tieB, tieIndex, tieA]);

    expect(sorted.map((p) => p.id)).toEqual(['c', 'd', 'a', 'b', 'f']);
    expect(close).toBe(sorted[0]);
  });

  it('2. behält die Eingabereihenfolge unverändert', () => {
    const planets = createPlanets(4);
    const original = planets.map((p) => p.id);

    sortPlanetsByDistance(planets);

    expect(planets.map((p) => p.id)).toEqual(original);
  });

  it('3. bildet Distanzen logarithmisch und monoton steigend auf x ab', () => {
    const planets = [
      createPlanet('inner', 1, 0.3),
      createPlanet('middle', 2, 1.2),
      createPlanet('outer', 3, 30),
    ];

    const layout = detailLayout(planets, 900, 400);

    expect(layout.placements.map((p) => p.planet.id)).toEqual(['inner', 'middle', 'outer']);
    expect(layout.placements[0].x).toBeLessThan(layout.placements[1].x);
    expect(layout.placements[1].x).toBeLessThan(layout.placements[2].x);
    expect(layout.placements.every((p) => p.y === layout.star.y)).toBe(true);
    expect(layout.scroll).toBe(0);
    expect(layout.maxScroll).toBe(0);
  });

  it('4. hält den Mindestabstand auch bei vielen Planeten ein', () => {
    const layout = detailLayout(createPlanets(10), 480, 320);

    for (let i = 1; i < layout.placements.length; i += 1) {
      const gap = layout.placements[i].x - layout.placements[i - 1].x;
      expect(gap).toBeGreaterThanOrEqual(DETAIL_MIN_GAP - 1e-6);
    }
    expect(layout.maxScroll).toBeGreaterThan(0);
    expect(layout.contentWidth).toBeGreaterThan(480);
  });

  it('5. platziert den Stern links und den ersten Planeten dahinter', () => {
    const layout = detailLayout(createPlanets(3), 800, 300);

    expect(layout.star.x).toBe(DETAIL_LEFT_MARGIN + DETAIL_STAR_RADIUS);
    expect(layout.star.y).toBe(150);
    expect(layout.star.radius).toBe(DETAIL_STAR_RADIUS);
    expect(layout.placements[0].x).toBe(
      layout.star.x + layout.star.radius + DETAIL_STAR_GAP
    );
  });

  it('6. verteilt gleich weit entfernte Planeten gleichmäßig mit Mindestabstand', () => {
    const layout = detailLayout(
      [
        createPlanet('a', 1, 2),
        createPlanet('b', 2, 2),
        createPlanet('c', 3, 2),
      ],
      700,
      300
    );

    const [a, b, c] = layout.placements;
    expect(b.x - a.x).toBeGreaterThanOrEqual(DETAIL_MIN_GAP - 1e-6);
    expect(c.x - b.x).toBeGreaterThanOrEqual(DETAIL_MIN_GAP - 1e-6);
    expect(Math.abs(b.x - a.x - (c.x - b.x))).toBeLessThan(1e-6);
  });

  it('7. klemmt den Scrollbereich und verschiebt die Platzierungen', () => {
    const planets = createPlanets(10);
    const base = detailLayout(planets, 480, 320, 0);
    const clamped = detailLayout(planets, 480, 320, base.maxScroll + 500);

    expect(clamped.scroll).toBe(base.maxScroll);
    expect(base.placements[0].x - clamped.placements[0].x).toBeCloseTo(base.maxScroll, 6);

    const negative = detailLayout(planets, 480, 320, -50);
    expect(negative.scroll).toBe(0);
    expect(negative.placements[0].x).toBeCloseTo(base.placements[0].x, 6);
  });

  it('8. zentriert einen Planeten im sichtbaren Bereich', () => {
    const planets = createPlanets(12);
    const layout = detailLayout(planets, 480, 320);
    const target = layout.placements[6].planet.id;

    const scroll = findScrollForPlanet(layout, target);
    const shifted = detailLayout(planets, 480, 320, scroll);
    const viewportWidth = shifted.contentWidth - shifted.maxScroll;
    const placement = shifted.placements.find((p) => p.planet.id === target)!;

    expect(scroll).toBeGreaterThan(0);
    expect(placement.x).toBeCloseTo(viewportWidth * 0.45, 6);
  });

  it('9. klemmt die Zentrierung an den Rändern', () => {
    const planets = createPlanets(12);
    const layout = detailLayout(planets, 480, 320);

    expect(findScrollForPlanet(layout, layout.placements[0].planet.id)).toBe(0);
    expect(findScrollForPlanet(layout, layout.placements[11].planet.id)).toBe(layout.maxScroll);
  });

  it('10. liefert bei unbekannter ID den aktuellen Scrollstand', () => {
    const layout = detailLayout(createPlanets(8), 480, 320, 120);
    expect(findScrollForPlanet(layout, 'unbekannt')).toBe(layout.scroll);
  });

  it('11. behandelt ein leeres System ohne Planeten', () => {
    const layout = detailLayout([], 640, 360);

    expect(layout.placements).toEqual([]);
    expect(layout.contentWidth).toBe(640);
    expect(layout.maxScroll).toBe(0);
    expect(layout.scroll).toBe(0);
  });

  it('12. trifft den nächsten Planeten innerhalb der Toleranz und sonst niemanden', () => {
    const layout = detailLayout(createPlanets(4), 800, 300);
    const first = layout.placements[0];

    expect(hitTestPlanets(layout.placements, { x: first.x, y: first.y })).toBe(first.planet);
    expect(
      hitTestPlanets(layout.placements, {
        x: first.x + first.radius + 3,
        y: first.y,
      })
    ).toBe(first.planet);
    expect(
      hitTestPlanets(layout.placements, {
        x: first.x + first.radius + 20,
        y: first.y,
      })
    ).toBeNull();
  });

  it('13. wählt bei überlappenden Treffern den nächstgelegenen Planeten', () => {
    const near = createPlanet('near', 1, 1);
    const far = createPlanet('far', 2, 2);

    const hit = hitTestPlanets(
      [
        { planet: far, x: 70, y: 100, radius: 30 },
        { planet: near, x: 104, y: 100, radius: 30 },
      ],
      { x: 100, y: 100 }
    );

    expect(hit).toBe(near);
  });

  it('14. skaliert Gasriesen in beiden Ansichten und begrenzt Detailradien', () => {
    const small = createPlanet('small', 1, 1, { sizeClass: 1 });
    const large = createPlanet('large', 2, 2, { sizeClass: 60 });
    const gasGiant = createPlanet('gas', 3, 3, { planetType: 'gas_giant' });
    const rocky = createPlanet('rocky', 4, 4, { planetType: 'rocky' });

    expect(detailPlanetRadius(small)).toBe(14);
    expect(detailPlanetRadius(large)).toBe(36);
    expect(detailPlanetRadius(gasGiant)).toBeCloseTo(detailPlanetRadius(rocky) * 1.3, 6);
    expect(planetVisualRadius(gasGiant, 1)).toBeGreaterThan(planetVisualRadius(rocky, 1));
    expect(planetVisualRadius(rocky, 2)).toBeGreaterThan(planetVisualRadius(rocky, 1));
  });

  it('15. berechnet Orbitradius und -position konsistent zur Zoomstufe', () => {
    const planet = createPlanet('orbit', 3, 2.5);

    expect(computeOrbitRadius(planet)).toBe(230);

    const center = { x: 400, y: 300 };
    const position = orbitPlanetPosition(planet, 0, 0.5, center);
    expect(position.x).toBeCloseTo(center.x + 115, 6);
    expect(position.y).toBeCloseTo(center.y, 6);

    const rotated = orbitPlanetPosition(planet, Math.PI / 2, 1, center);
    expect(rotated.x).toBeCloseTo(center.x, 6);
    expect(rotated.y).toBeCloseTo(center.y + 230, 6);
  });

  it('16. normalisiert ungültige Scrollwerte', () => {
    expect(clampDetailScroll(Number.NaN, 100)).toBe(0);
    expect(clampDetailScroll(-10, 100)).toBe(0);
    expect(clampDetailScroll(40, 100)).toBe(40);
    expect(clampDetailScroll(400, 100)).toBe(100);
    expect(clampDetailScroll(40, -5)).toBe(0);
  });

  it('17. interpoliert den Gürtelradius aus den Nachbarplaneten', () => {
    const planets = createPlanets(4);
    const inner = beltOrbitRadius(createBelt(0.1, 0.2), planets);
    const between = beltOrbitRadius(createBelt(0.6, 0.8), planets);
    const outer = beltOrbitRadius(createBelt(20, 24), planets);

    expect(inner).not.toBeNull();
    expect(between).not.toBeNull();
    expect(outer).not.toBeNull();
    expect(inner!).toBeLessThan(computeOrbitRadius(planets[0]));
    expect(between!).toBeGreaterThan(computeOrbitRadius(planets[0]));
    expect(between!).toBeLessThan(computeOrbitRadius(planets[1]));
    expect(outer!).toBeGreaterThan(computeOrbitRadius(planets[planets.length - 1]));
    expect(beltOrbitRadius(createBelt(1, 2), [])).toBeNull();
  });

  it('18. formatiert die Gürtelbeschriftung mit AU-Spanne', () => {
    expect(beltOrbitLabel(createBelt(2.4, 2.9))).toBe('Testgürtel · 2.4–2.9 AU');
    expect(beltOrbitLabel(createBelt(2, 3))).toBe('Testgürtel · 2.0–3.0 AU');
  });

  it('19. leitet Ringbreite und alle darstellbaren Gürtelringe ab', () => {
    const planets = createPlanets(3);
    const narrow = createBelt(1, 1.1);
    const wide = createBelt(4, 9);

    expect(beltRingHalfWidth(narrow, 50)).toBe(4);
    expect(beltRingHalfWidth(wide, 250)).toBe(18);

    const rings = computeBeltOrbitRings([narrow, wide], planets);
    expect(rings).toHaveLength(2);
    expect(rings[0].radius).toBe(beltOrbitRadius(narrow, planets));
    expect(rings[1].halfWidth).toBe(beltRingHalfWidth(wide, rings[1].radius!));
    expect(computeBeltOrbitRings(undefined, planets)).toEqual([]);
    expect(computeBeltOrbitRings([narrow], [])).toEqual([]);
  });

  it('20. begrenzt Mondorbits relativ zum Planetenradius', () => {
    const moon = createMoon(1, { orbitRadiusPlanetRadii: 3 });

    expect(moonOrbitRadius(moon, 10, 26)).toBe(30);
    expect(moonOrbitRadius(moon, 40, 26)).toBe(66);
    expect(
      moonOrbitRadius(createMoon(2, { orbitRadiusPlanetRadii: 1 }), 10, 26)
    ).toBe(14);
  });

  it('21. verteilt Monde auf unterschiedliche, langsam driftende Winkel', () => {
    const first = createMoon(1);
    const second = createMoon(2);

    expect(moonOrbitAngle(first, 0)).not.toBeCloseTo(moonOrbitAngle(second, 0), 3);
    expect(moonOrbitAngle(first, 10)).toBeGreaterThan(moonOrbitAngle(first, 0));
    expect(
      moonOrbitAngle(createMoon(3, { orbitalPeriodDays: 100 }), 10)
    ).toBeLessThan(moonOrbitAngle(createMoon(3, { orbitalPeriodDays: 5 }), 10));
  });

  it('22. platziert Gürtel in der Detailansicht zwischen den Planeten', () => {
    const layout = detailLayout(createPlanets(3), 900, 400);
    const between = detailBeltPosition(createBelt(0.6, 0.8), layout.placements);
    const before = detailBeltPosition(createBelt(0.1, 0.2), layout.placements);
    const after = detailBeltPosition(createBelt(20, 24), layout.placements);

    const first = layout.placements[0];
    const second = layout.placements[1];
    expect(between).toBeGreaterThan(first.x + first.radius);
    expect(between).toBeLessThan(second.x - second.radius);
    expect(before!).toBeLessThan(first.x - first.radius);
    expect(after!).toBeGreaterThan(
      layout.placements[layout.placements.length - 1].x
    );
    expect(detailBeltPosition(createBelt(1, 2), [])).toBeNull();
  });
});
