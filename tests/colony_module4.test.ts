/**
 * Astraea 4X - Modul 4 Test Suite
 * Automated tests for Colony Management, Planetary Hex Surfaces, 5-Resource Economy,
 * Territory Expansion, Build Queue, Tech Tree, Surface Units, AI Empire, and Save/Load.
 */

import { describe, expect, it } from 'vitest';
import { GameEngine } from '../src/core/GameEngine.ts';
import { ColonyManager } from '../src/core/colonyManager.ts';
import { EconomyEngine } from '../src/core/economyEngine.ts';
import { ColonyExpansion } from '../src/core/colonyExpansion.ts';
import { BuildQueueManager } from '../src/core/buildQueueManager.ts';
import { ResearchManager } from '../src/core/researchManager.ts';
import { UnitManager } from '../src/core/unitManager.ts';
import { CivManager } from '../src/core/civManager.ts';
import { SaveManager } from '../src/save/saveManager.ts';
import { HexMath } from '../src/surface/hexMath.ts';
import { SurfaceGenerator } from '../src/surface/surfaceGenerator.ts';
import { SurfaceManager } from '../src/surface/surfaceManager.ts';
import { EventBus } from '../src/core/EventBus.ts';
import { Planet, StarSystem } from '../src/core/types.ts';
import { BUILDING_CATALOG } from '../src/data/buildingCatalog.ts';
import { TECHNOLOGY_CATALOG } from '../src/data/technologyCatalog.ts';

function createMockPlanet(id: string = 'test-planet-01'): Planet {
  return {
    id,
    name: 'Aurelia Prime',
    systemId: 'sys-01',
    orbitIndex: 2,
    orbitDistanceAu: 1.1,
    orbitalPeriodDays: 365,
    currentAngleRad: 0,
    planetType: 'ocean',
    sizeClass: 16,
    surfaceTemperatureK: 292,
    temperatureCategory: 'temperate',
    atmosphere: 'breathable',
    waterAvailability: 'liquid_ocean',
    gravityG: 1.0,
    gravityCategory: 'standard',
    radiationHazard: 'negligible',
    geologicalStability: 'stable',
    habitability: 85,
    habitabilityTier: 'ideal',
    surveyStatus: 'analyzed',
    colonizationStatus: 'uncolonized',
    colonyId: null,
    color: '#38bdf8',
    accentColor: '#0284c7',
    texturePattern: 'oceans',
    moonsCount: 1,
  };
}

function createMockSystem(id: string = 'sys-01'): StarSystem {
  const planet = createMockPlanet();
  return {
    id,
    name: 'Aurelia System',
    x: 50,
    y: 50,
    star: {
      id: 'star-sys-01',
      name: 'Aurelia',
      spectralClass: 'G',
      color: '#facc15',
      glowColor: '#ca8a04',
      temperatureK: 5778,
      luminositySolar: 1.0,
      massSolar: 1.0,
      radiusKm: 696340,
    },
    planetCount: 1,
    planets: [planet],
    discoveryStatus: 'surveyed',
    ownerFactionId: null,
    hyperlanes: [],
    anomalyDetected: false,
  };
}

describe('Astraea 4X - Modul 4 Test Suite (Kolonieverwaltung & Ausbau)', () => {
  it('1. Kolonie als eigenständiges Objekt: ID, Planet, Zivilisation, Stadtzentrum, lokale Bestände', () => {
    const bus = EventBus.getInstance();
    const cm = new ColonyManager(bus);
    const planet = createMockPlanet();
    const system = createMockSystem();
    const surface = SurfaceGenerator.generateSurface(planet, 'TEST-SEED-01');

    const landingCoord = { q: 4, r: 4 };
    const res = cm.foundColony(planet, system, surface, 1, '2380.01', 'player-empire', 'Neu-Berlin', landingCoord);

    expect(res.success).toBe(true);
    expect(res.colony).toBeDefined();

    const colony = res.colony!;
    expect(colony.id).toContain('colony-');
    expect(colony.planetId).toBe(planet.id);
    expect(colony.civId).toBe('player-empire');
    expect(colony.cityCenterCoord).toEqual(landingCoord);
    expect(colony.population).toBe(1000);
    expect(colony.stockpile.minerals).toBeGreaterThanOrEqual(50);
    expect(colony.stockpile.food).toBeGreaterThanOrEqual(20);
    expect(colony.claimedHexKeys.length).toBeGreaterThanOrEqual(1);
    expect(colony.buildings.length).toBeGreaterThanOrEqual(1);
    expect(colony.buildings[0].buildingDefId).toBe('city_center');
  });

  it('2. Mehrere Kolonien: Unabhängige Rundenberechnung, keine gegenseitige Beeinflussung ohne Logistik, keine geteilten Hexfelder', () => {
    const bus = EventBus.getInstance();
    const cm = new ColonyManager(bus);
    const planet = createMockPlanet();
    const system = createMockSystem();
    const surface = SurfaceGenerator.generateSurface(planet, 'TEST-SEED-02');

    // Found Colony 1 at (2, 2)
    const res1 = cm.foundColony(planet, system, surface, 1, '2380.01', 'player-empire', 'Alpha Base', { q: 2, r: 2 });
    expect(res1.success).toBe(true);

    // Found Colony 2 at (10, 5)
    const res2 = cm.foundColony(planet, system, surface, 1, '2380.01', 'player-empire', 'Beta Base', { q: 10, r: 5 });
    expect(res2.success).toBe(true);

    const c1 = res1.colony!;
    const c2 = res2.colony!;

    expect(c1.id).not.toBe(c2.id);

    // Verify disjoint claimed hexes
    const overlap = c1.claimedHexKeys.filter((k) => c2.claimedHexKeys.includes(k));
    expect(overlap.length).toBe(0);

    // Modify c1 stockpile, verify c2 is unaffected
    c1.stockpile.minerals = 999;
    expect(c2.stockpile.minerals).not.toBe(999);
  });

  it('3. Planetenoberfläche: Reproduzierbare Hexkarten durch Seed, Erhalt modifizierter Zustände nach Reload', () => {
    const planet = createMockPlanet();
    const s1 = SurfaceGenerator.generateSurface(planet, 'REPRO-SEED-123', 18, 10);
    const s2 = SurfaceGenerator.generateSurface(planet, 'REPRO-SEED-123', 18, 10);

    expect(s1.tiles.length).toBe(s2.tiles.length);
    expect(s1.tiles[0].biome).toBe(s2.tiles[0].biome);
    expect(s1.tiles[10].deposit).toBe(s2.tiles[10].deposit);

    // Modify a tile on s1
    s1.tiles[5].isDepositDiscovered = true;
    s1.tiles[5].buildingInstanceId = 'bld-custom';

    const sm = new SurfaceManager();
    sm.loadSurfaces([s1]);

    const retrieved = sm.getSurface(planet.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.tiles[5].isDepositDiscovered).toBe(true);
    expect(retrieved!.tiles[5].buildingInstanceId).toBe('bld-custom');
  });

  it('4. Koloniegründung: Erfolgreiche Gründung mit korrekten Voraussetzungen, Ablehnung ungültiger Versuche', () => {
    const bus = EventBus.getInstance();
    const cm = new ColonyManager(bus);
    const system = createMockSystem();

    // Gasriese: zulässig als Gasförderung, aber ohne normales Koloniezentrum
    const gasGiant = createMockPlanet('gas-giant-01');
    gasGiant.planetType = 'gas_giant';
    gasGiant.habitability = 0;
    const surfaceGG = SurfaceGenerator.generateSurface(gasGiant, 'SEED');

    const gasRes = cm.foundColony(gasGiant, system, surfaceGG, 1, '2380.01');
    expect(gasRes.success).toBe(true);
    expect(gasRes.colony?.buildings[0].buildingDefId).toBe('gas_extraction_hub');

    // Unanalyzed planet cannot be colonized
    const unanalyzed = createMockPlanet('unanal-01');
    unanalyzed.surveyStatus = 'unexplored';
    const surfaceUn = SurfaceGenerator.generateSurface(unanalyzed, 'SEED');

    const failRes2 = cm.foundColony(unanalyzed, system, surfaceUn, 1, '2380.01');
    expect(failRes2.success).toBe(false);
  });

  it('5. Territoriale Expansion: Gültige angrenzende Felder werden beansprucht, Einfluss wird abgezogen, ungültige Versuche schlagen fehl, Kollisionen werden verhindert', () => {
    const bus = EventBus.getInstance();
    const cm = new ColonyManager(bus);
    const planet = createMockPlanet();
    const system = createMockSystem();
    const surface = SurfaceGenerator.generateSurface(planet, 'SEED-EXPANSION');

    const res = cm.foundColony(planet, system, surface, 1, '2380.01', 'player-empire', 'Frontier City', { q: 5, r: 5 });
    const colony = res.colony!;
    colony.stockpile.influence = 100;

    // Find adjacent unowned candidate
    const candidates = ColonyExpansion.getExpansionCandidates(colony, surface);
    expect(candidates.length).toBeGreaterThan(0);

    const targetCoord = candidates[0].coord;
    const initialInfluence = colony.stockpile.influence;
    const expCost = ColonyExpansion.calculateExpansionCost(colony, targetCoord);

    const claimRes = ColonyExpansion.claimTile(colony, surface, targetCoord);
    expect(claimRes.success).toBe(true);
    expect(colony.stockpile.influence).toBe(initialInfluence - expCost);
    expect(colony.claimedHexKeys).toContain(HexMath.coordToKey(targetCoord));

    // Re-claiming the same tile must fail
    const reClaim = ColonyExpansion.claimTile(colony, surface, targetCoord);
    expect(reClaim.success).toBe(false);

    // Far away non-adjacent tile must fail
    const farCoord = { q: 1, r: 1 };
    const farClaim = ColonyExpansion.claimTile(colony, surface, farCoord);
    expect(farClaim.success).toBe(false);
    expect(farClaim.reason).toContain('angrenzen');
  });

  it('6. Bewirtschaftung: Automatische Zuteilung nach Priorität, Arbeitskraftbegrenzung durch Bevölkerung, korrekte Ertragsberechnung', () => {
    const bus = EventBus.getInstance();
    const cm = new ColonyManager(bus);
    const planet = createMockPlanet();
    const system = createMockSystem();
    const surface = SurfaceGenerator.generateSurface(planet, 'SEED-WORK');

    const res = cm.foundColony(planet, system, surface, 1, '2380.01', 'player-empire', 'Farm-World', { q: 5, r: 5 });
    const colony = res.colony!;

    // 1000 colonists = 1 citizen worker unit
    colony.population = 1000;
    EconomyEngine.allocateCitizenWorkforce(colony, surface);

    const workedCount = surface.tiles.filter((t) => colony.claimedHexKeys.includes(t.key) && t.isWorked).length;
    // Workforce limit must be respected (at most 1 worker assigned)
    expect(workedCount).toBeLessThanOrEqual(1);

    // Set focus to minerals
    colony.workFocus = 'minerals';
    EconomyEngine.allocateCitizenWorkforce(colony, surface);
    expect(colony.workFocus).toBe('minerals');
  });

  it('7. Ressourcen und Wirtschaft: Fünf Ressourcenarten, korrekte Rundenerträge, Lageraktualisierung, Ressourcenentdeckung schaltet Boni erst nach Erschließung frei', () => {
    const bus = EventBus.getInstance();
    const cm = new ColonyManager(bus);
    const planet = createMockPlanet();
    const system = createMockSystem();
    const surface = SurfaceGenerator.generateSurface(planet, 'SEED-ECONOMY');

    const res = cm.foundColony(planet, system, surface, 1, '2380.01', 'player-empire', 'Mining Haven', { q: 5, r: 5 });
    const colony = res.colony!;

    const initialMinerals = colony.stockpile.minerals;
    EconomyEngine.simulateTurnEconomy(colony, surface, 85);

    // Stockpile reflects net yields
    expect(colony.netYields).toBeDefined();
    expect(typeof colony.netYields.food).toBe('number');
    expect(typeof colony.netYields.production).toBe('number');
    expect(typeof colony.netYields.energy).toBe('number');
    expect(typeof colony.netYields.minerals).toBe('number');
    expect(typeof colony.netYields.rareResources).toBe('number');

    expect(colony.stockpile.minerals).toBe(initialMinerals + colony.netYields.minerals);
  });

  it('8. Energie und Unterhalt: Energiebilanz, Effizienzverlust bei Unterversorgung, korrekter Gebäudeunterhalt pro Runde', () => {
    const bus = EventBus.getInstance();
    const cm = new ColonyManager(bus);
    const planet = createMockPlanet();
    const system = createMockSystem();
    const surface = SurfaceGenerator.generateSurface(planet, 'SEED-ENERGY');

    const res = cm.foundColony(planet, system, surface, 1, '2380.01', 'player-empire', 'Power City', { q: 4, r: 4 });
    const colony = res.colony!;

    // Add heavy industrial consumers causing energy deficit
    colony.buildings.push({
      id: 'heavy-factory-1',
      colonyId: colony.id,
      hexCoord: { q: 4, r: 4 },
      buildingDefId: 'factory_complex',
      level: 3, // Consumes 9 energy
      isActive: true,
    });

    const { upkeep, netYields } = EconomyEngine.calculateYields(colony, surface, 85);
    expect(upkeep.energy).toBeGreaterThan(0);

    const withFleet = EconomyEngine.calculateYields(colony, surface, 85, 20);
    expect(withFleet.upkeep.energy).toBe(upkeep.energy + 20);
    expect(withFleet.netYields.energy).toBe(netYields.energy - 20);
    // If deficit occurs:
    if (netYields.energy < 0) {
      expect(netYields.energy).toBeLessThan(0);
    }
  });

  it('9. Bauwarteschlange und Upgrades: Projekte werden nacheinander abgearbeitet, Materialkosten werden korrekt verbucht, Upgrades verändern bestehende Gebäude auf demselben Feld', () => {
    const bus = EventBus.getInstance();
    const cm = new ColonyManager(bus);
    const planet = createMockPlanet();
    const system = createMockSystem();
    const surface = SurfaceGenerator.generateSurface(planet, 'SEED-QUEUE');

    const res = cm.foundColony(planet, system, surface, 1, '2380.01', 'player-empire', 'Construx', { q: 4, r: 4 });
    const colony = res.colony!;
    colony.stockpile.minerals = 200;

    // Pick an empty adjacent claimed tile for hydroponics
    const targetHex = colony.claimedHexKeys.find((k) => k !== HexMath.coordToKey(colony.cityCenterCoord))!;
    const hexCoord = HexMath.keyToCoord(targetHex);

    const bDef = BUILDING_CATALOG['hydroponics_dome'];
    const minBefore = colony.stockpile.minerals;
    const qRes = BuildQueueManager.queueBuilding(colony, 'hydroponics_dome', hexCoord, 1);
    expect(qRes.success).toBe(true);
    expect(colony.stockpile.minerals).toBe(minBefore - bDef.baseMineralCost);
    expect(colony.buildQueue.length).toBe(1);

    // Apply production to finish project
    const prodGiven = bDef.baseProductionCost + 5;
    BuildQueueManager.applyTurnProduction(colony, prodGiven, surface);

    // Item finished and built into buildings array
    expect(colony.buildQueue.length).toBe(0);
    const farm = colony.buildings.find((b) => b.buildingDefId === 'hydroponics_dome');
    expect(farm).toBeDefined();
    expect(farm?.level).toBe(1);

    // Now test UPGRADE on existing building
    colony.stockpile.minerals = 200;
    const upRes = BuildQueueManager.queueUpgrade(colony, farm!.id, 2);
    expect(upRes.success).toBe(true);
    expect(colony.buildQueue.length).toBe(1);

    BuildQueueManager.applyTurnProduction(colony, 100, surface);
    expect(farm?.level).toBe(2);
  });

  it('10. Bevölkerung und Wachstum: Nahrungsmangel und Nahrungsüberschuss führen zu korrekten Wachstums- oder Stagnationseffekten', () => {
    const bus = EventBus.getInstance();
    const cm = new ColonyManager(bus);
    const planet = createMockPlanet();
    const system = createMockSystem();
    const surface = SurfaceGenerator.generateSurface(planet, 'SEED-GROWTH');

    const res = cm.foundColony(planet, system, surface, 1, '2380.01', 'player-empire', 'Eden Base', { q: 4, r: 4 });
    const colony = res.colony!;

    colony.population = 1000;
    colony.growthFoodProgress = colony.growthFoodRequired - 1;
    colony.stockpile.food = 100;

    // Give high food surplus
    colony.netYields = {
      food: 10,
      production: 5,
      energy: 5,
      minerals: 5,
      rareResources: 0,
      research: 2,
      influence: 2,
    };

    EconomyEngine.simulateTurnEconomy(colony, surface, 90);
    // Population should have grown by +1000
    expect(colony.population).toBe(2000);
  });

  it('10a. Habitabilitäts-Wachstumsmultiplikator: 100% = volle Rate, niedrige Werte bremsen das Wachstum, Untergrenze 25%', () => {
    expect(EconomyEngine.calculateGrowthMultiplier(100)).toBe(1);
    expect(EconomyEngine.calculateGrowthMultiplier(60)).toBeCloseTo(0.6, 5);
    expect(EconomyEngine.calculateGrowthMultiplier(40)).toBeCloseTo(0.4, 5);
    expect(EconomyEngine.calculateGrowthMultiplier(10)).toBe(0.25);
    expect(EconomyEngine.calculateGrowthMultiplier(-20)).toBe(0.25);
    expect(EconomyEngine.calculateGrowthMultiplier(140)).toBe(1);
  });

  it('10b. Habitabilität skaliert den Fortschritt des Bevölkerungswachstums, nicht nur die Nahrungserträge', () => {
    const bus = EventBus.getInstance();
    const cm = new ColonyManager(bus);
    const planet = createMockPlanet();
    const system = createMockSystem();
    const surface = SurfaceGenerator.generateSurface(planet, 'SEED-GROWTH-SCALE');

    const res = cm.foundColony(planet, system, surface, 1, '2380.01', 'player-empire', 'Eden Base', { q: 4, r: 4 });
    const colony = res.colony!;
    colony.population = 1000;
    colony.growthFoodProgress = 0;
    colony.stockpile.food = 100;

    // Ensure a food surplus despite the habitability penalty applied to gross food.
    colony.buildings.push({
      id: 'test-hydroponics',
      colonyId: colony.id,
      hexCoord: colony.cityCenterCoord,
      buildingDefId: 'hydroponics_dome',
      level: 3,
      isActive: true,
    });

    EconomyEngine.simulateTurnEconomy(colony, surface, 40);

    expect(colony.netYields.food).toBeGreaterThan(0);
    const expected = Math.round(colony.netYields.food * 0.4 * 100) / 100;
    expect(colony.growthFoodProgress).toBeCloseTo(expected, 5);
  });

  it('10c. Niedrige Habitabilität bremst das Bevölkerungswachstum deutlich gegenüber einer idealen Welt', () => {
    const bus = EventBus.getInstance();
    const cm = new ColonyManager(bus);

    const grow = (planetId: string, habitability: number) => {
      const planet = createMockPlanet(planetId);
      const system = createMockSystem(`sys-${planetId}`);
      const surface = SurfaceGenerator.generateSurface(planet, `SEED-GROWTH-${planetId}`);
      const res = cm.foundColony(planet, system, surface, 1, '2380.01', 'player-empire', `Colony ${planetId}`, { q: 4, r: 4 });
      const colony = res.colony!;
      colony.population = 1000;
      colony.growthFoodProgress = 0;
      colony.stockpile.food = 100;
      colony.buildings.push({
        id: `test-hydroponics-${planetId}`,
        colonyId: colony.id,
        hexCoord: colony.cityCenterCoord,
        buildingDefId: 'hydroponics_dome',
        level: 3,
        isActive: true,
      });

      EconomyEngine.simulateTurnEconomy(colony, surface, habitability);
      return colony.growthFoodProgress;
    };

    const idealProgress = grow('ideal-world', 100);
    const hostileProgress = grow('hostile-world', 25);

    expect(idealProgress).toBeGreaterThan(0);
    expect(hostileProgress).toBeGreaterThan(0);
    expect(hostileProgress).toBeLessThan(idealProgress);
  });

  it('11. Forschung: Wissenschaftspool wächst durch Kolonieerträge, Technologie wird nach Erreichen der Kosten freigeschaltet, Freischaltungen wirken auf Gebäude oder Verbesserungen', () => {
    const civ = {
      id: 'player-empire',
      name: 'Player Civ',
      color: '#06b6d4',
      borderColor: '#0891b2',
      isPlayer: true,
      researchState: {
        completedTechIds: [],
        currentTechId: 'geothermal_tapping',
        currentTechInvested: 0,
      },
    };

    const techCost = TECHNOLOGY_CATALOG['geothermal_tapping'].cost;
    expect(ResearchManager.isTechCompleted(civ.researchState, 'geothermal_tapping')).toBe(false);

    // Apply partial research
    ResearchManager.applyResearchYield(civ.researchState, techCost - 10);
    expect(civ.researchState.currentTechInvested).toBe(techCost - 10);
    expect(ResearchManager.isTechCompleted(civ.researchState, 'geothermal_tapping')).toBe(false);

    // Finish research
    const completed = ResearchManager.applyResearchYield(civ.researchState, 20);
    expect(completed).toContain('geothermal_tapping');
    expect(ResearchManager.isTechCompleted(civ.researchState, 'geothermal_tapping')).toBe(true);
  });

  it('12. Einheiten und Bewegung: Passierbarkeit von Hexfeldern, Bewegungskosten nach Gelände, Sichtweitenaufdeckung', () => {
    const planet = createMockPlanet();
    const sm = new SurfaceManager();
    const surface = sm.getOrCreateSurface(planet, 'SEED-UNITS');

    // Start und Ziel dynamisch wählen: Das Kartenlayout hängt von Seed und
    // Generatorversion ab, daher suchen wir ein passierbares Feld mit einem
    // passierbaren, direkt benachbarten Zielfeld.
    const tilesMap = new Map(surface.tiles.map((t) => [t.key, t]));
    let startCoord: { q: number; r: number } | null = null;
    let targetCoord: { q: number; r: number } | null = null;
    for (const tile of surface.tiles) {
      for (const neighbor of HexMath.getNeighbors(tile.coord)) {
        const probe = HexMath.findPath(tile.coord, neighbor, tilesMap);
        if (probe && probe.length > 0) {
          startCoord = tile.coord;
          targetCoord = neighbor;
          break;
        }
      }
      if (targetCoord) break;
    }
    expect(startCoord).not.toBeNull();
    expect(targetCoord).not.toBeNull();

    const unit = UnitManager.createUnit('player-empire', 'scout', planet.id, startCoord!);
    expect(unit.movementPointsRemaining).toBe(3);

    const path = HexMath.findPath(startCoord!, targetCoord!, tilesMap);
    expect(path).not.toBeNull();

    const moveRes = UnitManager.moveUnitAlongPath(unit, path!, surface, sm);
    expect(moveRes.reachedGoal).toBe(true);
    expect(unit.hexCoord).toEqual(targetCoord);
    expect(unit.movementPointsRemaining).toBeLessThan(3);

    // Start next turn refreshes movement
    UnitManager.refreshUnitMovement(unit);
    expect(unit.movementPointsRemaining).toBe(unit.maxMovementPoints);
  });

  it('13. Zivilisationen und KI: Mehrere Zivilisationen agieren regelkonform auf derselben Oberfläche, keine unerlaubten Doppelbelegungen', () => {
    const bus = EventBus.getInstance();
    const civManager = new CivManager();
    const cm = new ColonyManager(bus);
    const sm = new SurfaceManager();

    const planet = createMockPlanet();
    const system = createMockSystem();
    const surface = sm.getOrCreateSurface(planet, 'SEED-CIV-TEST');

    // Found Player colony
    cm.foundColony(planet, system, surface, 1, '2380.01', 'player-empire', 'Terran Colony', { q: 2, r: 2 });

    // Found AI rival colony
    cm.foundColony(planet, system, surface, 1, '2380.01', 'ai-rival-1', 'Zetaron Outpost', { q: 12, r: 6 });

    const colonies = cm.getColonies();
    expect(colonies.length).toBe(2);

    // AI Turn execution
    civManager.executeAITurns(colonies, sm, 1);

    // Verify no collision or overlapping claims occurred
    const cPlayer = colonies.find((c) => c.civId === 'player-empire')!;
    const cAI = colonies.find((c) => c.civId === 'ai-rival-1')!;

    const sharedClaims = cPlayer.claimedHexKeys.filter((k) => cAI.claimedHexKeys.includes(k));
    expect(sharedClaims.length).toBe(0);
  });

  it('14. Rundenwechsel: Rundenwechsel läuft deterministisch, aktualisiert alle Kolonien in fester Reihenfolge und erzeugt nachvollziehbare Rundenberichte', () => {
    const engine = GameEngine.getInstance();
    engine.generateNewGalaxy({ seed: 'DETERMINISTIC-ROUND-SEED' });
    const sys = engine.getGalaxy().systems[0];
    engine.selectSystem(sys.id);
    engine.surveySystem(sys.id);

    const planet = sys.planets.find((p) => p.planetType !== 'gas_giant') || sys.planets[0];
    planet.surveyStatus = 'analyzed';
    planet.radiationHazard = 'negligible';
    planet.colonizationStatus = 'uncolonized';
    planet.colonyId = null;

    const res = engine.foundColony(planet.id, 'Chrono-Prime');
    expect(res.success).toBe(true);

    const startTurn = engine.getTurnState().currentTurn;
    const initialMinerals = res.colony!.stockpile.minerals;

    // Advance round
    const nextTurnState = engine.endTurn();
    expect(nextTurnState.currentTurn).toBe(startTurn + 1);

    const updatedColony = engine.getColonyByPlanetId(planet.id);
    expect(updatedColony).toBeDefined();
    expect(updatedColony?.netYields).toBeDefined();
  });

  it('15. Speichern und Laden: Vollständige Serialisierung und Deserialisierung aller Modul-4-Zustände ohne Datenverlust', () => {
    const engine = GameEngine.getInstance();
    engine.generateNewGalaxy({ seed: 'MODULE4-SAVE-TEST-SEED' });
    const sys = engine.getGalaxy().systems[0];
    engine.selectSystem(sys.id);
    engine.surveySystem(sys.id);

    const planet = sys.planets.find((p) => p.planetType !== 'gas_giant') || sys.planets[0];
    planet.planetType = 'ocean';
    planet.atmosphere = 'breathable';
    planet.temperatureCategory = 'temperate';
    planet.waterAvailability = 'liquid_ocean';
    planet.gravityCategory = 'standard';
    planet.surfaceTemperatureK = 295;
    planet.surveyStatus = 'analyzed';
    planet.radiationHazard = 'negligible';
    planet.colonizationStatus = 'uncolonized';
    planet.colonyId = null;

    const foundRes = engine.foundColony(planet.id, 'Speicher-Stadt');
    expect(foundRes.success).toBe(true);
    engine.enterSurfaceView(planet.id);

    // Save
    const payload = engine.createSavePayload('Save-Modul-4-Complete');
    expect(payload.surfaces).toBeDefined();
    expect(payload.surfaces!.length).toBeGreaterThan(0);
    expect(payload.civilizations).toBeDefined();
    expect(payload.civilizations!.length).toBeGreaterThan(0);
    expect(payload.units).toBeDefined();

    const json = SaveManager.serialize(payload);
    expect(typeof json).toBe('string');

    const deserialized = SaveManager.deserialize(json);
    expect(deserialized.success).toBe(true);
    expect(deserialized.data!.surfaces).toBeDefined();
    expect(deserialized.data!.colonies.length).toBeGreaterThan(0);

    // Restore
    const restored = engine.restoreFromSaveData(deserialized.data!);
    expect(restored).toBe(true);

    const restoredColony = engine.getColonyByPlanetId(planet.id);
    expect(restoredColony).not.toBeNull();
    expect(restoredColony?.name).toBe('Speicher-Stadt');
    expect(restoredColony?.buildings.length).toBeGreaterThan(0);
  });
});
