/**
 * Astraea 4X - Game Engine (Core Coordinator - Module 4)
 * Central orchestrator connecting Galaxy, System Map, Hex Surface, Turn System, Colonies,
 * Economy, Civilizations, Research, Units, Event Bus, and Versioned Save System.
 * Strictly decoupled from React.
 */

import { BUILDING_CATALOG } from '../data/buildingCatalog.ts';
import { DEFAULT_GALAXY_CONFIG } from '../data/galaxyPresets.ts';
import { UNIT_CATALOG } from '../data/unitCatalog.ts';
import { GalaxyGenerator } from '../generation/galaxyGenerator.ts';
import { PlanetGenerator } from '../generation/planetGenerator.ts';
import {
  ensurePlayerHomeHabitability,
  resolveFactionSetup,
  selectAiHomeSystems,
} from '../generation/startPlacement.ts';
import { CURRENT_SAVE_VERSION, LOCAL_STORAGE_AUTOSAVE_KEY, SaveManager } from '../save/saveManager.ts';
import { HexMath } from '../surface/hexMath.ts';
import { SurfaceManager } from '../surface/surfaceManager.ts';
import {
  AiDiplomacyCivSnapshot,
  AiDiplomacyManager,
} from './aiDiplomacyManager.ts';
import { BuildQueueManager } from './buildQueueManager.ts';
import { CivManager } from './civManager.ts';
import { ColonyExpansion } from './colonyExpansion.ts';
import { ColonyManager, ColonyTierUpgradeResult } from './colonyManager.ts';
import {
  COLONIZATION_SUPPLY,
  ColonizationValidator,
  ColonySupply,
  checkColonySupply,
} from './colonizationRules.ts';
import { DiplomacyManager } from './diplomacyManager.ts';
import { DistrictManager, DistrictPlacementResult, DistrictRemovalResult } from './districtManager.ts';
import { EconomyEngine } from './economyEngine.ts';
import { EventBus } from './EventBus.ts';
import { FleetEta, FleetManager, FleetMoveResult, ShipBuildResult } from './fleetManager.ts';
import {
  GalacticTradeCreateResult,
  GalacticTradeManager,
} from './galacticTradeManager.ts';
import { LogisticsCreateResult, LogisticsManager } from './logisticsManager.ts';
import { MessageLog } from './messageLog.ts';
import {
  PrivateSectorCivReport,
  PrivateSectorManager,
} from './privateSectorManager.ts';
import { getPropulsionLabel, getPropulsionRange } from './propulsion.ts';
import { ResearchManager } from './researchManager.ts';
import { computeOrbitalAngleDelta } from './simulationConfig.ts';
import { TerraformingManager, TerraformingOptions, TerraformingStartResult } from './terraformingManager.ts';
import { TurnManager } from './TurnManager.ts';
import {
  BuildProject,
  Civilization,
  Colony,
  DiplomaticPair,
  DiplomacyResult,
  EmpireModifiers,
  EmpirePolicy,
  ExcavationSite,
  FactionAssignment,
  Fleet,
  Galaxy,
  GalaxyConfig,
  GalacticTradeResource,
  GameOutcome,
  HexCoord,
  MessageLogEntry,
  NarrativeOverview,
  Planet,
  PlanetHexTile,
  PlanetSurface,
  SaveGameData,
  SpaceStation,
  StarSystem,
  SurfaceUnit,
  TurnState,
  ViewMode,
} from './types.ts';
import {
  EmpireManager,
  EmpireOverview,
  EmpirePolicyResult,
  EmpireSnapshot,
  buildEmpireSnapshot,
} from './empireManager.ts';
import {
  CrisisContributionResult,
  EXCAVATION_START_COST,
  NarrativeActionResult,
  NarrativeChoiceResult,
  NarrativeCivContext,
  NarrativeManager,
  NarrativeTurnReport,
} from './narrativeManager.ts';
import { createColonyShipFleet, createStartingFleets } from './startingFleet.ts';
import { UnitManager } from './unitManager.ts';
import {
  VictoryManager,
  VictoryOverview,
  VictorySnapshot,
} from './victoryManager.ts';

export class GameEngine {
  private static instance: GameEngine;
  private static readonly PLAYER_HOME_OWNER = 'faction-player-home';
  private static readonly AI_HOME_MIN_HABITABILITY = 50;
  private static readonly AI_HOME_POPULATION = 3000;
  /**
   * Starttechnologien der KI, damit ihre Werften von Beginn an Schiffe bauen
   * können. Die Menge ist bewusst klein und respektiert die Prereq-Kette
   * (advanced_metallurgy setzt automated_assembly voraus).
   */
  private static readonly AI_STARTING_TECHS = ['automated_assembly', 'advanced_metallurgy'] as const;

  private galaxy: Galaxy;
  private turnManager: TurnManager;
  private colonyManager: ColonyManager;
  private surfaceManager: SurfaceManager;
  private civManager: CivManager;
  private terraformingManager: TerraformingManager;
  private logisticsManager: LogisticsManager;
  private galacticTradeManager: GalacticTradeManager;
  private privateSectorManager: PrivateSectorManager;
  private fleetManager: FleetManager;
  private diplomacyManager: DiplomacyManager;
  private aiDiplomacyManager: AiDiplomacyManager;
  private empireManager: EmpireManager;
  private narrativeManager: NarrativeManager;
  private victoryManager: VictoryManager;
  private units: SurfaceUnit[] = [];
  private eventBus: EventBus;
  private messageLog: MessageLog = new MessageLog();
  private stations: SpaceStation[] = [];
  private startPlacementWarnings: string[] = [];

  private selectedSystemId: string | null = null;
  private selectedPlanetId: string | null = null;
  private selectedHexCoord: HexCoord | null = null;
  private selectedUnitId: string | null = null;
  private activeView: ViewMode = 'galaxy';

  private constructor() {
    this.eventBus = EventBus.getInstance();
    this.turnManager = new TurnManager(1, this.eventBus);
    this.colonyManager = new ColonyManager(this.eventBus);
    this.surfaceManager = new SurfaceManager();
    this.civManager = new CivManager();
    this.terraformingManager = new TerraformingManager(this.eventBus);
    this.logisticsManager = new LogisticsManager(
      this.eventBus,
      (source, target) => this.resolveLogisticsTravelTurns(source, target),
    );
    this.galacticTradeManager = new GalacticTradeManager(
      this.eventBus,
      () => this.galaxy,
      () => this.fleetManager.getFleets(),
      () => this.diplomacyManager,
    );
    this.privateSectorManager = new PrivateSectorManager();
    this.fleetManager = new FleetManager(this.eventBus, () => this.galaxy);
    this.diplomacyManager = new DiplomacyManager(this.eventBus);
    this.aiDiplomacyManager = new AiDiplomacyManager(this.diplomacyManager);
    this.empireManager = new EmpireManager();
    this.narrativeManager = new NarrativeManager();
    this.victoryManager = new VictoryManager();
    this.galaxy = GalaxyGenerator.generate(DEFAULT_GALAXY_CONFIG);

    this.initializeAiPresence();
    this.syncDiplomacyWithCivilizations();
    this.ensureEmpireStates();
    this.ensureNarrativeStates();
    this.narrativeManager.generateSites(this.galaxy);

    // Auto-select starting system and planet
    if (this.galaxy.systems.length > 0) {
      this.selectedSystemId = this.galaxy.systems[0].id;
      if (this.galaxy.systems[0].planets && this.galaxy.systems[0].planets.length > 0) {
        this.selectedPlanetId = this.galaxy.systems[0].planets[0].id;
      }
    }
  }

  public static getInstance(): GameEngine {
    if (!GameEngine.instance) {
      GameEngine.instance = new GameEngine();
    }
    return GameEngine.instance;
  }

  /* -------------------------------------------------------------------------- */
  /* GETTERS & QUERIES                                                          */
  /* -------------------------------------------------------------------------- */

  public getGalaxy(): Galaxy {
    return this.galaxy;
  }

  public getTurnManager(): TurnManager {
    return this.turnManager;
  }

  public getColonyManager(): ColonyManager {
    return this.colonyManager;
  }

  public getSurfaceManager(): SurfaceManager {
    return this.surfaceManager;
  }

  public getCivManager(): CivManager {
    return this.civManager;
  }

  public getEmpireManager(): EmpireManager {
    return this.empireManager;
  }

  public getNarrativeManager(): NarrativeManager {
    return this.narrativeManager;
  }

  public getVictoryManager(): VictoryManager {
    return this.victoryManager;
  }

  /** Aktueller Spielausgang; `ongoing`, solange weder Sieg noch Niederlage feststeht. */
  public getOutcome(): GameOutcome {
    return this.victoryManager.getOutcome();
  }

  /** Fortschritt der Siegbedingungen und Rangliste für die Zielanzeige. */
  public getVictoryOverview(): VictoryOverview | null {
    return this.victoryManager.getOverview(this.buildVictorySnapshot());
  }

  public getColonies(): Colony[] {
    return this.colonyManager.getColonies();
  }

  public getColonyByPlanetId(planetId: string): Colony | null {
    return this.colonyManager.getColonyByPlanetId(planetId);
  }

  public getUnits(): SurfaceUnit[] {
    return this.units;
  }

  public getUnitsOnPlanet(planetId: string): SurfaceUnit[] {
    return this.units.filter((u) => u.planetId === planetId);
  }

  public getTurnState(): TurnState {
    return this.turnManager.getTurnState();
  }

  public getActiveView(): ViewMode {
    return this.activeView;
  }

  public getSelectedSystem(): StarSystem | null {
    if (!this.selectedSystemId) return null;
    return this.galaxy.systems.find((s) => s.id === this.selectedSystemId) ?? null;
  }

  public getSelectedPlanet(): Planet | null {
    const sys = this.getSelectedSystem();
    if (!sys || !this.selectedPlanetId || !sys.planets) return null;
    return sys.planets.find((p) => p.id === this.selectedPlanetId) ?? null;
  }

  public getSelectedHexCoord(): HexCoord | null {
    return this.selectedHexCoord;
  }

  public getSelectedUnit(): SurfaceUnit | null {
    if (!this.selectedUnitId) return null;
    return this.units.find((u) => u.id === this.selectedUnitId) ?? null;
  }

  public getPlayerCiv(): Civilization {
    return this.civManager.getPlayerCiv();
  }

  /** Reichsverwaltung, Fraktionen und aktuelle Modifikatoren eines Reiches. */
  public getEmpireOverview(civId: string): EmpireOverview | null {
    const civ = this.civManager.getCivilization(civId);
    if (!civ) return null;
    const snapshot = this.buildEmpireSnapshotForCiv(civ);
    const state = this.empireManager.getState(civId);
    const administration = this.empireManager.getAdministration(snapshot);
    const dominant = this.empireManager.getDominantFaction(civId);
    return {
      civId,
      civName: civ.name,
      treasury: civ.treasury,
      colonyCount: snapshot.colonyCount,
      warCount: snapshot.warCount,
      currentTurn: this.turnManager.getCurrentTurn(),
      state,
      administration,
      modifiers: this.getCombinedModifiers(civId, snapshot),
      dominantFactionId: dominant.id,
    };
  }

  /**
   * Ändert die Governance-Politik eines Reiches. Der Cooldown liegt im
   * EmpireManager; erfolgreiche Wechsel erzeugen ein Ereignis.
   */
  public setEmpirePolicy(civId: string, policy: EmpirePolicy): EmpirePolicyResult {
    const civ = this.civManager.getCivilization(civId);
    if (!civ) return { success: false, reason: 'Zivilisation nicht gefunden.' };
    const result = this.empireManager.setPolicy(
      civId,
      policy,
      this.turnManager.getCurrentTurn()
    );
    if (result.success && result.policy && result.previousPolicy) {
      this.eventBus.emit('empire:policy-changed', {
        civId,
        policy: result.policy,
        previousPolicy: result.previousPolicy,
        turn: this.turnManager.getCurrentTurn(),
      });
    }
    return result;
  }

  /** Chronik, Ausgrabungsstätten und galaktische Krise eines Reiches. */
  public getNarrativeOverview(civId: string): NarrativeOverview | null {
    const civ = this.civManager.getCivilization(civId);
    if (!civ) return null;
    return this.narrativeManager.getOverview(
      civId,
      this.turnManager.getCurrentTurn(),
      civ.treasury,
      (site) => this.resolveSiteLocation(site)
    );
  }

  public startExcavation(civId: string, siteId: string): NarrativeActionResult {
    const civ = this.civManager.getCivilization(civId);
    if (!civ) return { success: false, reason: 'Zivilisation nicht gefunden.' };

    const result = this.narrativeManager.startExcavation(civId, siteId, civ.treasury);
    if (result.success && result.site) {
      civ.treasury = Math.max(0, roundCredits(civ.treasury - EXCAVATION_START_COST));
      const location = this.resolveSiteLocation(result.site);
      this.eventBus.emit('narrative:excavation-started', {
        site: result.site,
        planetName: location.planetName,
        systemName: location.systemName,
        turn: this.turnManager.getCurrentTurn(),
      });
    }
    return result;
  }

  public resolveNarrativeChoice(civId: string, choiceId: string): NarrativeChoiceResult {
    const civ = this.civManager.getCivilization(civId);
    if (!civ) return { success: false, reason: 'Zivilisation nicht gefunden.' };

    const result = this.narrativeManager.resolveChoice(civId, choiceId, civ.treasury);
    if (result.success && result.effects) {
      this.applyNarrativeEffects(civ, result.effects);
      this.eventBus.emit('narrative:event-resolved', {
        civId,
        eventId: result.event?.id ?? 'unknown',
        title: result.event?.title ?? 'Ereignis',
        choiceLabel: result.choice?.label ?? 'Entschieden',
        turn: this.turnManager.getCurrentTurn(),
      });
    }
    return result;
  }

  public contributeToCrisis(civId: string): CrisisContributionResult {
    const civ = this.civManager.getCivilization(civId);
    if (!civ) return { success: false, reason: 'Zivilisation nicht gefunden.' };

    const result = this.narrativeManager.contributeToContainment(civId, civ.treasury);
    if (result.success && result.crisis && result.cost) {
      civ.treasury = Math.max(0, roundCredits(civ.treasury - result.cost));
      this.eventBus.emit('narrative:crisis-contained', {
        containment: result.crisis.containment,
        cost: result.cost,
        turn: this.turnManager.getCurrentTurn(),
      });
    }
    return result;
  }

  public getSurfaceForPlanet(planet: Planet): PlanetSurface {
    return this.surfaceManager.getOrCreateSurface(planet, this.galaxy.seed);
  }

  /* -------------------------------------------------------------------------- */
  /* SELECTION & NAVIGATION (GALAXY ↔ SYSTEM ↔ SURFACE)                         */
  /* -------------------------------------------------------------------------- */

  public selectSystem(id: string | null): void {
    this.selectedSystemId = id;
    const sys = this.getSelectedSystem();
    if (sys && sys.planets && sys.planets.length > 0) {
      this.selectedPlanetId = sys.planets[0].id;
    } else {
      this.selectedPlanetId = null;
    }
    this.selectedHexCoord = null;
    this.selectedUnitId = null;

    this.eventBus.emit('system:selected', { system: sys });
    this.eventBus.emit('planet:selected', { planet: this.getSelectedPlanet() });
  }

  public selectPlanet(planetId: string | null): void {
    if (planetId) {
      for (const sys of this.galaxy.systems) {
        if (sys.planets && sys.planets.some((p) => p.id === planetId)) {
          if (this.selectedSystemId !== sys.id) {
            this.selectedSystemId = sys.id;
            this.eventBus.emit('system:selected', { system: sys });
          }
          break;
        }
      }
    }
    this.selectedPlanetId = planetId;
    this.selectedHexCoord = null;
    this.selectedUnitId = null;
    const planet = this.getSelectedPlanet();
    this.eventBus.emit('planet:selected', { planet });
  }

  public selectHex(coord: HexCoord | null): void {
    this.selectedHexCoord = coord;
    this.eventBus.emit('hex:selected', { coord });
  }

  public selectUnit(unitId: string | null): void {
    this.selectedUnitId = unitId;
    const unit = this.getSelectedUnit();
    if (unit) {
      this.selectedHexCoord = unit.hexCoord;
    }
    this.eventBus.emit('unit:selected', { unit });
  }

  public enterSystemView(systemId?: string): boolean {
    if (systemId) {
      this.selectSystem(systemId);
    }
    const sys = this.getSelectedSystem();
    if (!sys) return false;

    this.activeView = 'system';
    if (!this.selectedPlanetId && sys.planets && sys.planets.length > 0) {
      this.selectedPlanetId = sys.planets[0].id;
    }

    this.eventBus.emit('view:changed', { view: 'system', systemId: sys.id });
    return true;
  }

  public leaveSystemView(): void {
    this.activeView = 'galaxy';
    this.eventBus.emit('view:changed', { view: 'galaxy', systemId: this.selectedSystemId });
  }

  public enterSurfaceView(planetId?: string): boolean {
    if (planetId) {
      this.selectPlanet(planetId);
    }
    const planet = this.getSelectedPlanet();
    if (!planet) return false;

    // Ensure surface is generated
    const surface = this.surfaceManager.getOrCreateSurface(planet, this.galaxy.seed);

    // If planet has a colony, center on colony city center
    const colony = this.colonyManager.getColonyByPlanetId(planet.id);
    if (colony) {
      this.selectedHexCoord = colony.cityCenterCoord;
    } else {
      this.selectedHexCoord = { q: Math.floor(surface.width / 4), r: Math.floor(surface.height / 2) };
    }

    this.activeView = 'surface';
    this.eventBus.emit('view:changed', { view: 'surface', systemId: this.selectedSystemId, planetId: planet.id });
    return true;
  }

  public leaveSurfaceView(): void {
    this.activeView = 'system';
    this.eventBus.emit('view:changed', { view: 'system', systemId: this.selectedSystemId });
  }

  /* -------------------------------------------------------------------------- */
  /* EXPLORATION & SURVEYS                                                      */
  /* -------------------------------------------------------------------------- */

  public surveySystem(systemId: string): boolean {
    const sys = this.galaxy.systems.find((s) => s.id === systemId);
    if (!sys) return false;

    if (sys.discoveryStatus === 'unexplored') {
      sys.discoveryStatus = 'surveyed';
      if (sys.planets) {
        for (const p of sys.planets) {
          if (p.surveyStatus === 'unexplored') {
            p.surveyStatus = 'surveyed';
          }
        }
      }
      this.eventBus.emit('system:surveyed', { systemId });
      return true;
    }
    return false;
  }

  public surveyPlanet(planetId: string): boolean {
    const sys = this.getSelectedSystem();
    if (!sys || !sys.planets) return false;

    const planet = sys.planets.find((p) => p.id === planetId);
    if (!planet) return false;

    if (planet.surveyStatus !== 'analyzed') {
      planet.surveyStatus = 'analyzed';
      this.eventBus.emit('planet:surveyed', { planetId, systemId: sys.id });

      const site = this.narrativeManager.discoverSite(
        planetId,
        this.civManager.getPlayerCiv().id,
        this.turnManager.getCurrentTurn()
      );
      if (site) {
        this.eventBus.emit('narrative:excavation-discovered', {
          site,
          planetName: planet.name,
          systemName: sys.name,
          turn: this.turnManager.getCurrentTurn(),
        });
      }
      return true;
    }
    return false;
  }

  /* -------------------------------------------------------------------------- */
  /* COLONIZATION & EXPANSION                                                   */
  /* -------------------------------------------------------------------------- */

  public foundColony(
    planetId: string,
    customName?: string,
    targetLandingCoord?: HexCoord
  ): { success: boolean; colony?: Colony; reason?: string } {
    const sys = this.getSelectedSystem();
    if (!sys || !sys.planets) {
      return { success: false, reason: 'Kein aktives Sternensystem ausgewählt.' };
    }

    const planet = sys.planets.find((p) => p.id === planetId);
    if (!planet) {
      return { success: false, reason: 'Planet wurde im ausgewählten System nicht gefunden.' };
    }

    // Kolonisationslogistik: Es muss ein beladenes Kolonieschiff im System liegen.
    // Die Fracht ist die einzige Quelle für Kolonisten und Gründungsgüter.
    const colonyShip = this.getColonyShipForSystem(sys.id);
    if (!colonyShip) {
      const reason =
        'Kein Kolonieschiff im System. Kolonisation erfordert ein beladenes Kolonieschiff vor Ort.';
      this.eventBus.emit('colony:failed', { planetId: planet.id, reason });
      return { success: false, reason };
    }
    const supplyCheck = checkColonySupply(colonyShip.cargo);
    if (!supplyCheck.allowed) {
      const reason = supplyCheck.reason ?? 'Kolonieschiff-Laderaum unzureichend.';
      this.eventBus.emit('colony:failed', { planetId: planet.id, reason });
      return { success: false, reason };
    }
    const cargo = colonyShip.cargo!;

    const surface = this.surfaceManager.getOrCreateSurface(planet, this.galaxy.seed);
    const turnState = this.turnManager.getTurnState();

    const result = this.colonyManager.foundColony(
      planet,
      sys,
      surface,
      turnState.currentTurn,
      turnState.turnDateStandard,
      'player-empire',
      customName,
      targetLandingCoord,
      {
        population: cargo.colonists,
        stockpile: {
          food: cargo.food,
          minerals: cargo.minerals,
          rareResources: cargo.rareResources,
          influence: cargo.influence,
        },
      }
    );

    if (result.success && result.colony) {
      // Fracht und Schiff verbrauchen: Die Gründung schöpft ausschließlich aus
      // dem Laderaum, es entsteht keine Ressource zusätzlich.
      this.consumeColonizationSupply(colonyShip);

      // Reveal vision around new colony
      this.surfaceManager.revealTilesAround(planet.id, result.colony.cityCenterCoord, 2);

      // Spawn a starting scout unit on the newly founded colony
      const scoutUnit: SurfaceUnit = {
        id: `unit-scout-${Date.now()}`,
        civId: 'player-empire',
        unitDefId: 'scout',
        name: `Aufklärer (${result.colony.name})`,
        planetId: planet.id,
        hexCoord: result.colony.cityCenterCoord,
        movementPointsRemaining: 3,
        maxMovementPoints: 3,
        health: 100,
        maxHealth: 100,
        isFortified: false,
      };
      this.units.push(scoutUnit);

      this.eventBus.emit('system:selected', { system: sys });
      this.eventBus.emit('planet:selected', { planet });
    }

    return result;
  }

  /**
   * Sucht ein beladenes Kolonieschiff der Spielerzivilisation in einem System.
   */
  public getColonyShipForSystem(systemId: string): Fleet | null {
    const playerId = this.civManager.getPlayerCiv().id;
    const candidates = this.fleetManager
      .getFleetsInSystem(systemId)
      .filter(
        (fleet) =>
          fleet.civId === playerId &&
          fleet.ships.some((stack) => stack.shipDefId === 'colony_ship' && stack.count > 0)
      )
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return candidates[0] ?? null;
  }

  /**
   * Stellt ein voll beladenes Kolonieschiff bereit (Nachschub, Ereignisse,
   * Testaufbau). Die Fracht entspricht exakt den Gründungskosten.
   */
  public provisionColonyShip(systemId: string, cargo: ColonySupply = COLONIZATION_SUPPLY): Fleet {
    const civId = this.civManager.getPlayerCiv().id;
    let sequence = 1;
    let id = `fleet_${civId}_colony_${systemId}`;
    const usedIds = new Set(this.fleetManager.getFleets().map((fleet) => fleet.id));
    while (usedIds.has(id)) {
      sequence += 1;
      id = `fleet_${civId}_colony_${systemId}_${sequence}`;
    }

    const system = this.galaxy.systems.find((entry) => entry.id === systemId);
    return this.fleetManager.addFleet(
      createColonyShipFleet(civId, systemId, {
        id,
        name: system ? `Kolonieschiff · ${system.name}` : 'Kolonieschiff',
        cargo,
      })
    );
  }

  /** Verbraucht das Kolonieschiff samt Laderaum nach erfolgreicher Gründung. */
  private consumeColonizationSupply(fleet: Fleet): void {
    this.fleetManager.removeShipFromFleet(fleet.id, 'colony_ship', 1);
    const current = this.fleetManager.getFleet(fleet.id);
    if (current) current.cargo = undefined;
  }

  /** Platziert die Startflotte im Heimatsystem (ohne automatische Kolonie). */
  private deployStartingFleet(systemId: string | null): void {
    if (!systemId) return;
    const civId = this.civManager.getPlayerCiv().id;
    const system = this.galaxy.systems.find((entry) => entry.id === systemId);
    for (const fleet of createStartingFleets(civId, systemId, system?.name)) {
      this.fleetManager.addFleet(fleet);
    }
  }

  public claimHex(colonyId: string, coord: HexCoord): { success: boolean; reason?: string } {
    const colony = this.colonyManager.getColonyById(colonyId);
    if (!colony) return { success: false, reason: 'Kolonie nicht gefunden.' };

    const surface = this.surfaceManager.getSurface(colony.planetId);
    if (!surface) return { success: false, reason: 'Planetenoberfläche nicht initialisiert.' };

    const res = ColonyExpansion.claimHex(colony, coord, surface);
    if (res.success) {
      EconomyEngine.simulateTurnEconomy(
        colony,
        surface,
        this.getSelectedPlanet()?.habitability ?? 80,
        this.getFleetUpkeepForColony(colony.id)
      );
      this.eventBus.emit('hex:claimed', { colonyId, coord, costPaid: res.costPaid });
    }
    return res;
  }

  public canPlaceDistrict(
    colonyId: string,
    districtDefId: string,
    anchor: HexCoord
  ): DistrictPlacementResult {
    const colony = this.colonyManager.getColonyById(colonyId);
    if (!colony) return { allowed: false, reason: 'Kolonie nicht gefunden.' };

    const surface = this.surfaceManager.getSurface(colony.planetId);
    if (!surface) return { allowed: false, reason: 'Planetenoberfläche nicht initialisiert.' };

    const completedTechIds = this.civManager.getPlayerCiv().researchState.completedTechIds;
    return DistrictManager.canPlaceDistrict(colony, surface, districtDefId, anchor, completedTechIds);
  }

  public placeDistrict(
    colonyId: string,
    districtDefId: string,
    anchor: HexCoord
  ): DistrictPlacementResult {
    const colony = this.colonyManager.getColonyById(colonyId);
    if (!colony) return { allowed: false, reason: 'Kolonie nicht gefunden.' };

    const surface = this.surfaceManager.getSurface(colony.planetId);
    if (!surface) return { allowed: false, reason: 'Planetenoberfläche nicht initialisiert.' };

    const completedTechIds = this.civManager.getPlayerCiv().researchState.completedTechIds;
    const result = DistrictManager.placeDistrict(
      colony,
      surface,
      districtDefId,
      anchor,
      completedTechIds,
      this.turnManager.getCurrentTurn()
    );

    if (result.allowed && result.district) {
      EconomyEngine.simulateTurnEconomy(
        colony,
        surface,
        this.findPlanetById(colony.planetId)?.habitability ?? 80,
        this.getFleetUpkeepForColony(colony.id)
      );
      this.eventBus.emit('district:placed', { colonyId, district: result.district });
    }
    return result;
  }

  public removeDistrict(colonyId: string, districtId: string): DistrictRemovalResult {
    const colony = this.colonyManager.getColonyById(colonyId);
    if (!colony) return { success: false, reason: 'Kolonie nicht gefunden.' };

    const surface = this.surfaceManager.getSurface(colony.planetId);
    if (!surface) return { success: false, reason: 'Planetenoberfläche nicht initialisiert.' };

    const result = DistrictManager.removeDistrict(colony, districtId, surface);
    if (result.success) {
      EconomyEngine.simulateTurnEconomy(
        colony,
        surface,
        this.findPlanetById(colony.planetId)?.habitability ?? 80,
        this.getFleetUpkeepForColony(colony.id)
      );
      this.eventBus.emit('district:removed', { colonyId, districtId });
    }
    return result;
  }

  public queueBuilding(
    colonyId: string,
    buildingDefId: string,
    targetCoord: HexCoord
  ): { success: boolean; reason?: string } {
    const colony = this.colonyManager.getColonyById(colonyId);
    if (!colony) return { success: false, reason: 'Kolonie nicht gefunden.' };

    const surface = this.surfaceManager.getSurface(colony.planetId);
    if (!surface) return { success: false, reason: 'Planetenoberfläche nicht initialisiert.' };

    const turn = this.turnManager.getCurrentTurn();
    // Wirtschaft Stufe B: Baukosten in Credits aus der Staatskasse der Kolonie-Civ
    const treasuryHolder = this.civManager.getCivilizations().find((c) => c.id === colony.civId);
    const res = BuildQueueManager.queueBuilding(
      colony,
      buildingDefId,
      targetCoord,
      surface,
      turn,
      treasuryHolder,
      {
        planetType: this.findPlanetById(colony.planetId)?.planetType,
        completedTechIds: this.civManager.getPlayerCiv().researchState.completedTechIds,
      }
    );
    if (res.success) {
      this.eventBus.emit('build:queued', { colonyId, buildingDefId });
    }
    return res;
  }

  public queueUpgrade(
    colonyId: string,
    buildingInstanceId: string
  ): ReturnType<typeof BuildQueueManager.queueUpgrade> {
    const colony = this.colonyManager.getColonyById(colonyId);
    if (!colony) return { success: false, reason: 'Kolonie nicht gefunden.' };

    const turn = this.turnManager.getCurrentTurn();
    // Wirtschaft Stufe B: Ausbaukosten in Credits aus der Staatskasse der Kolonie-Civ
    const treasuryHolder = this.civManager.getCivilizations().find((c) => c.id === colony.civId);
    const res = BuildQueueManager.queueUpgrade(colony, buildingInstanceId, turn, treasuryHolder);
    if (res.success) {
      if (res.completedImmediately && res.project) {
        // Sofortige Ausbauten laufen durch dieselbe Abschlussmeldung wie
        // Aufträge, die am Rundenende fertig werden.
        this.emitBuildCompletion(colony, res.project);
      } else {
        this.eventBus.emit('build:queued', { colonyId, buildingInstanceId });
      }
    }
    return res;
  }

  public queueUnit(colonyId: string, unitDefId: string): { success: boolean; reason?: string } {
    const colony = this.colonyManager.getColonyById(colonyId);
    if (!colony) return { success: false, reason: 'Kolonie nicht gefunden.' };

    const turn = this.turnManager.getCurrentTurn();
    const res = BuildQueueManager.queueUnit(colony, unitDefId, turn);
    if (res.success) {
      this.eventBus.emit('build:queued', { colonyId, unitDefId });
    }
    return res;
  }

  public selectTech(techId: string): boolean {
    const playerCiv = this.civManager.getPlayerCiv();
    const success = ResearchManager.selectTech(playerCiv.researchState, techId);
    if (success) {
      this.eventBus.emit('research:selected', { techId });
    }
    return success;
  }

  public moveSelectedUnit(targetCoord: HexCoord): { success: boolean; reason?: string } {
    const unit = this.getSelectedUnit();
    if (!unit) return { success: false, reason: 'Keine Einheit ausgewählt.' };

    const surface = this.surfaceManager.getSurface(unit.planetId);
    if (!surface) return { success: false, reason: 'Oberfläche nicht gefunden.' };

    const tilesMap = new Map(surface.tiles.map((t) => [t.key, t]));
    const path = HexMath.findPath(unit.hexCoord, targetCoord, tilesMap);
    if (!path) {
      return { success: false, reason: 'Kein passierbarer Pfad zum Ziel gefunden.' };
    }

    const moveRes = UnitManager.moveUnitAlongPath(unit, path, surface, this.surfaceManager);
    this.selectedHexCoord = unit.hexCoord;
    this.eventBus.emit('unit:moved', { unit, stepsTaken: moveRes.stepsTaken });
    return { success: moveRes.reachedGoal, reason: moveRes.reason };
  }

  public setColonyWorkFocus(colonyId: string, focus: Colony['workFocus']): void {
    const colony = this.colonyManager.getColonyById(colonyId);
    if (!colony) return;

    colony.workFocus = focus;
    const surface = this.surfaceManager.getSurface(colony.planetId);
    if (surface) {
      // Erträge neu berechnen, aber keinen Wirtschaftsturn anwenden: sonst
      // würde jedes Umschalten des Fokus Vorräte erzeugen.
      EconomyEngine.recalculateYields(
        colony,
        surface,
        this.findPlanetById(colony.planetId)?.habitability ?? 80,
        this.getFleetUpkeepForColony(colony.id)
      );
    }
    this.eventBus.emit('colony:focusChanged', { colonyId, focus });
  }

  public setColonyTaxRate(colonyId: string, rate: number): void {
    const colony = this.colonyManager.getColonyById(colonyId);
    if (!colony) return;

    // Reine Steuer-Neuberechnung: kein Wirtschaftsturn, keine Vorrats- oder
    // Wachstumsänderung. Wiederholtes Verstellen des Reglers bleibt folgenlos.
    colony.taxRate = EconomyEngine.normalizeTaxRate(rate);
    EconomyEngine.recalculateTaxState(colony);

    this.eventBus.emit('colony:taxRateChanged', { colonyId, taxRate: colony.taxRate });
  }

  public upgradeColonyTier(colonyId: string): ColonyTierUpgradeResult {
    const result = this.colonyManager.upgradeDevelopmentTier(colonyId);
    if (result.success && result.colony) {
      // Die Entwicklungsstufe beeinflusst Korruption, Zufriedenheit und damit
      // die Steuereinnahmen. Nur abgeleitete Werte neu berechnen, damit ein
      // Stufenaufstieg keinen zusätzlichen Wirtschaftsturn auslöst.
      const surface = this.surfaceManager.getSurface(result.colony.planetId);
      if (surface) {
        EconomyEngine.recalculateYields(
          result.colony,
          surface,
          this.findPlanetById(result.colony.planetId)?.habitability ?? 80,
          this.getFleetUpkeepForColony(result.colony.id)
        );
      }
      EconomyEngine.recalculateTaxState(result.colony);
    }
    return result;
  }

  private getFleetUpkeepForColony(colonyId: string): number {
    return (
      this.fleetManager.calculateUpkeepByColony(this.colonyManager.getColonies()).get(colonyId) ?? 0
    );
  }

  private findPlanetById(planetId: string): Planet | null {
    for (const sys of this.galaxy.systems) {
      const planet = sys.planets?.find((candidate) => candidate.id === planetId);
      if (planet) return planet;
    }
    return null;
  }

  /* -------------------------------------------------------------------------- */
  /* DETERMINISTIC ROUND / TURN SIMULATION (SECTION 18 OF PROMPT)              */
  /* -------------------------------------------------------------------------- */

  public endTurn(): TurnState {
    const currentTurn = this.turnManager.getCurrentTurn();

    // 1. AI Civilizations execute validated turns
    this.civManager.executeAITurns(this.colonyManager.getColonies(), this.surfaceManager, currentTurn);

    // 1b. AI shipyards build hulls and AI fleets patrol between own colonies
    for (const civ of this.civManager.getCivilizations()) {
      if (civ.isPlayer) continue;
      this.grantAiStartingTechnologies(civ);
      this.fleetManager.executeAiFleetTurn(
        civ.id,
        this.colonyManager.getColonies(),
        civ.researchState.completedTechIds,
        currentTurn,
      );
    }

    // 1c. AI diplomacy: wars are declared before battles resolve in this turn
    this.aiDiplomacyManager.executeTurn(currentTurn, this.buildAiDiplomacySnapshot());

    // 2. Global simulation phase:
    // Die Reichsmodifikatoren stammen aus dem Zustand der letzten Runde. Die
    // Neubewertung erfolgt am Ende dieses Zuges, damit die erste Runde neutral
    // bleibt und alle bestehenden Wirtschaftsregeln unverändert starten.
    const empireModifiersByCiv = new Map<string, EmpireModifiers>();
    for (const snapshot of this.buildEmpireSnapshots()) {
      empireModifiersByCiv.set(
        snapshot.civId,
        this.getCombinedModifiers(snapshot.civId, snapshot)
      );
    }

    // A. Reset unit movements
    UnitManager.resetTurnMovement(this.units);

    // B. Simulate Colony Economies & Build Queues
    const fleetUpkeepByColony = this.fleetManager.calculateUpkeepByColony(
      this.colonyManager.getColonies()
    );
    for (const colony of this.colonyManager.getColonies()) {
      // Alte Spielstände können eine Kolonie ohne gespeicherte Oberfläche
      // enthalten. Statt die gesamte Koloniephase (inklusive Bauwarteschlange)
      // stillschweigend zu überspringen, wird die deterministische Oberfläche
      // aus dem Galaxie-Seed rekonstruiert.
      let surface = this.surfaceManager.getSurface(colony.planetId);
      if (!surface) {
        const planet = this.galaxy.systems
          .flatMap((system) => system.planets ?? [])
          .find((candidate) => candidate.id === colony.planetId);
        if (planet) {
          surface = this.surfaceManager.getOrCreateSurface(planet, this.galaxy.seed);
        }
      }
      if (surface) {
        // Find planet habitability
        let habitability = 80;
        for (const sys of this.galaxy.systems) {
          const p = sys.planets?.find((pl) => pl.id === colony.planetId);
          if (p) {
            habitability = p.habitability;
            break;
          }
        }

        // Run Economy (inklusive anteiligem Flottenunterhalt)
        EconomyEngine.simulateTurnEconomy(
          colony,
          surface,
          habitability,
          fleetUpkeepByColony.get(colony.id) ?? 0,
          empireModifiersByCiv.get(colony.civId)
        );

        // Advance build queue
        const buildResult = BuildQueueManager.advanceQueue(
          colony,
          surface,
          colony.netYields.production,
          this.units
        );
        if (buildResult.completedProject) {
          this.emitBuildCompletion(colony, buildResult.completedProject);
        }

        // Autonomous tier progression for AI colonies (the player upgrades via UI).
        if (colony.civId !== 'player-empire') {
          this.colonyManager.upgradeDevelopmentTier(colony.id);
        }
      }
    }

    // B2. Privatsektor: zivile Händler gleichen Überschüsse innerhalb eines
    //     Reiches aus und zahlen ihre Handelssteuer in die Staatskasse.
    //     Läuft nach der Ökonomie- und vor der Logistikphase, damit die
    //     Staatslogistik weiterhin den Bulk-Transport übernimmt.
    this.privateSectorManager.advanceTurn(
      this.colonyManager.getColonies(),
      this.civManager.getCivilizations(),
    );

    // B3. Staatskasse: Steuereinnahmen je Zivilisation genau einmal pro Runde
    //     gutschreiben (simulateTurnEconomy läuft auch bei UI-Aktionen).
    //     Wartung in Credits wird ebenfalls hier abgezogen; die Staatskasse
    //     fällt nie unter 0 (keine Schulden in Stufe B).
    const taxRevenueByCiv = new Map<string, number>();
    const upkeepByCiv = new Map<string, number>();
    for (const colony of this.colonyManager.getColonies()) {
      taxRevenueByCiv.set(
        colony.civId,
        (taxRevenueByCiv.get(colony.civId) ?? 0) + (colony.taxRevenue ?? 0)
      );
      upkeepByCiv.set(
        colony.civId,
        (upkeepByCiv.get(colony.civId) ?? 0) + (colony.upkeep.credits ?? 0)
      );
    }
    for (const civ of this.civManager.getCivilizations()) {
      const revenue = taxRevenueByCiv.get(civ.id) ?? 0;
      const maintenance = upkeepByCiv.get(civ.id) ?? 0;
      const commerceTax = this.privateSectorManager.getReportForCiv(civ.id)?.commerceTax ?? 0;
      civ.treasury = Math.max(
        0,
        Math.round((civ.treasury + revenue + commerceTax - maintenance) * 10) / 10
      );
    }

    // C. Advance terraforming projects with local colony production
    const terraformingEffort = new Map<string, number>();
    for (const colony of this.colonyManager.getColonies()) {
      const effort = Math.max(0, Math.round(colony.netYields.production));
      terraformingEffort.set(colony.planetId, (terraformingEffort.get(colony.planetId) ?? 0) + effort);
    }
    const allPlanets: Planet[] = [];
    for (const sys of this.galaxy.systems) {
      if (sys.planets) allPlanets.push(...sys.planets);
    }
    this.terraformingManager.advanceTurn(allPlanets, this.surfaceManager.getAllSurfaces(), terraformingEffort);

    // D. Run logistics transfers between colonies
    this.logisticsManager.advanceTurn(this.colonyManager.getColonies());

    // E. Run interstellar trade convoys between colony systems
    this.galacticTradeManager.advanceTurn(
      this.colonyManager.getColonies(),
      this.civManager.getCivilizations(),
    );

    // F. Run ship construction in colonial shipyards, advance fleets and resolve battles
    //    Only civilizations at war fight each other; peaceful fleets share a system.
    this.fleetManager.advanceTurn(
      this.colonyManager.getColonies(),
      currentTurn,
      this.diplomacyManager,
      (civId) => this.getFleetRangeForCiv(civId),
    );

    // G. Aggregate Research for each Civilization
    const researchByCiv = new Map<string, number>();
    for (const civ of this.civManager.getCivilizations()) {
      const civColonies = this.colonyManager.getColoniesByCivId(civ.id);
      const totalResearch = civColonies.reduce((sum, c) => sum + (c.researchOutput || 0), 0);
      researchByCiv.set(civ.id, totalResearch);
      const { completedTech } = ResearchManager.applyResearchPoints(civ.researchState, totalResearch);
      if (completedTech && civ.isPlayer) {
        this.eventBus.emit('research:completed', { tech: completedTech });
      }
    }

    // H. Advance orbital positions for planets
    for (const sys of this.galaxy.systems) {
      if (sys.planets) {
        for (const planet of sys.planets) {
          const angleDelta = computeOrbitalAngleDelta(planet.orbitalPeriodDays);
          planet.currentAngleRad = (planet.currentAngleRad + angleDelta) % (Math.PI * 2);
        }
      }
    }

    // 2.4 Narrative Ebene: Ausgrabungen fortschreiben, dynamische Ereignisse
    //     ziehen und die galaktische Krise bewerten. Belohnungen fließen noch
    //     in dieser Runde in Staatskasse und Forschung.
    const narrativeReport = this.narrativeManager.advanceTurn(
      currentTurn,
      this.buildNarrativeContexts(researchByCiv)
    );
    this.applyNarrativeReport(narrativeReport, currentTurn);

    // 2.5 Reichsverwaltung: Fraktionsloyalität, Einfluss und KI-Politik aus
    //     den Ergebnissen dieser Runde neu bewerten. Die Werte wirken ab der
    //     nächsten Runde und landen noch im Auto-Save.
    const empireReport = this.empireManager.advanceTurn(
      this.buildEmpireSnapshots(),
      currentTurn
    );
    for (const change of empireReport.policyChanges) {
      this.eventBus.emit('empire:policy-changed', {
        civId: change.civId,
        policy: change.policy,
        previousPolicy: change.previousPolicy,
        turn: currentTurn,
      });
    }
    for (const unrest of empireReport.unrest) {
      this.eventBus.emit('empire:faction-unrest', { ...unrest, turn: currentTurn });
    }
    for (const recovery of empireReport.recovered) {
      this.eventBus.emit('empire:faction-recovered', { ...recovery, turn: currentTurn });
    }

    // 2.6 Sieg & Niederlage: rein abgeleitete Auswertung nach allen
    //     Rundenänderungen. Sie verändert weder Wirtschaft noch Forschung und
    //     friert den Ausgang nach dem ersten Sieg oder der ersten Niederlage ein.
    this.victoryManager.evaluate(this.buildVictorySnapshot());

    // 3. Auto-save to LocalStorage
    this.quickSave(LOCAL_STORAGE_AUTOSAVE_KEY);

    // 4. Advance turn counter & galactic date
    const nextState = this.turnManager.advanceTurn();
    return nextState;
  }

  /**
   * Meldet einen abgeschlossenen Bau-, Ausbau- oder Rekrutierungsauftrag.
   * Nur die Spielerzivilisation erzeugt Benachrichtigungen, damit KI-Aufträge
   * die Anzeige nicht fluten.
   */
  private emitBuildCompletion(colony: Colony, project: BuildProject): void {
    if (colony.civId !== this.civManager.getPlayerCiv().id) return;
    const turn = this.turnManager.getTurnState().currentTurn;

    if (project.type === 'unit') {
      const unitDef = UNIT_CATALOG[project.defId];
      this.eventBus.emit('unit:recruited', {
        colonyId: colony.id,
        colonyName: colony.name,
        civId: colony.civId,
        unitDefId: project.defId,
        unitName: unitDef?.name ?? project.name,
        turn,
      });
      return;
    }

    let name = project.name;
    if (project.type === 'upgrade') {
      const instance =
        colony.buildings.find((building) => building.id === project.defId) ??
        colony.buildings.find((building) => building.id === project.buildingInstanceId) ??
        (project.buildingDefId
          ? colony.buildings.find(
              (building) =>
                building.buildingDefId === project.buildingDefId &&
                HexMath.coordToKey(building.hexCoord) ===
                  HexMath.coordToKey(project.targetHexCoord)
            )
          : undefined);
      const buildingDef = instance
        ? BUILDING_CATALOG[instance.buildingDefId]
        : project.buildingDefId
          ? BUILDING_CATALOG[project.buildingDefId]
          : undefined;
      if (buildingDef) {
        name = `${buildingDef.name} (Stufe ${instance?.level ?? project.targetLevel ?? 1})`;
      }
    }

    this.eventBus.emit('build:completed', {
      colonyId: colony.id,
      colonyName: colony.name,
      civId: colony.civId,
      defId: project.defId,
      name,
      projectType: project.type,
      turn,
    });
  }

  /* -------------------------------------------------------------------------- */
  /* AI PRESENCE                                                                */
  /* -------------------------------------------------------------------------- */

  /**
   * Deterministically grants every civilization a home system and founds an AI
   * home colony so rival empires own territory and can field fleets.
   */
  private initializeAiPresence(): void {
    const systems = this.galaxy.systems;
    if (systems.length === 0) {
      return;
    }

    const playerCiv = this.civManager.getPlayerCiv();
    const playerHome =
      systems.find((system) => system.ownerFactionId === GameEngine.PLAYER_HOME_OWNER) ??
      systems[0];
    playerHome.ownerFactionId = playerCiv.id;
    playerCiv.homeSystemId = playerHome.id;
    if (playerHome.discoveryStatus === 'unexplored') {
      playerHome.discoveryStatus = 'surveyed';
    }

    const aiCivs = this.civManager.getCivilizations().filter((civ) => !civ.isPlayer);
    if (aiCivs.length === 0) {
      this.startPlacementWarnings = [];
      return;
    }

    // Startpositionen werden nach maximaler Hyperlane-Distanz gewählt. Bei
    // kleinen Galaxien lockert die Auswahl die Wunschdistanz und meldet das.
    const placement = selectAiHomeSystems(this.galaxy, aiCivs.length, [playerHome.id]);
    this.startPlacementWarnings = [...placement.warnings];

    aiCivs.forEach((civ, index) => {
      this.grantAiStartingTechnologies(civ);

      const preferredId = placement.systemIds[index];
      if (preferredId) {
        const preferred = systems.find((system) => system.id === preferredId);
        if (preferred && this.establishAiHomeSystem(civ, preferred)) {
          return;
        }
      }

      // Rückfallebene: nächster freier Platz, deterministisch ab der Mitte.
      const slotCount = aiCivs.length + 1;
      const anchor = Math.min(
        systems.length - 1,
        Math.floor((systems.length * (index + 1)) / slotCount),
      );

      for (let offset = 0; offset < systems.length; offset += 1) {
        const indexes = offset === 0 ? [anchor] : [anchor + offset, anchor - offset];
        for (const systemIndex of indexes) {
          if (systemIndex < 0 || systemIndex >= systems.length) {
            continue;
          }
          const system = systems[systemIndex];
          if (system.ownerFactionId !== null) {
            continue;
          }
          if (this.establishAiHomeSystem(civ, system)) {
            return;
          }
        }
      }
    });
  }

  /** Warnungen der letzten Startplatzierung (kleine Galaxie, Ersatzsysteme). */
  public getStartPlacementWarnings(): readonly string[] {
    return this.startPlacementWarnings;
  }

  /**
   * Gewährt KI-Starttechnologien idempotent, damit Werften sofort Hüllen
   * bauen können und alte Spielstände nachgezogen werden.
   */
  private grantAiStartingTechnologies(civ: Civilization): void {
    const completed = civ.researchState.completedTechIds;
    for (const techId of GameEngine.AI_STARTING_TECHS) {
      if (!completed.includes(techId)) {
        completed.push(techId);
      }
    }
    if (
      civ.researchState.currentTechId &&
      completed.includes(civ.researchState.currentTechId)
    ) {
      civ.researchState.currentTechId = null;
      civ.researchState.currentTechInvested = 0;
    }
  }

  /**
   * Sammelt je Reich die Kennzahlen, die die KI-Diplomatie bewertet.
   * Die Militärstärke entspricht der Summe aus Angriff und Hülle aller Flotten.
   */
  private buildAiDiplomacySnapshot(): AiDiplomacyCivSnapshot[] {
    const snapshot: AiDiplomacyCivSnapshot[] = [];
    for (const civ of this.civManager.getCivilizations()) {
      let militaryStrength = 0;
      for (const fleet of this.fleetManager.getFleetsForCiv(civ.id)) {
        const strength = this.fleetManager.getFleetStrength(fleet);
        militaryStrength += strength.attack + strength.hull;
      }
      snapshot.push({
        id: civ.id,
        isPlayer: civ.isPlayer,
        colonyCount: this.colonyManager.getColoniesByCivId(civ.id).length,
        militaryStrength: Math.round(militaryStrength),
      });
    }
    return snapshot;
  }

  private ensureEmpireStates(): void {
    for (const civ of this.civManager.getCivilizations()) {
      this.empireManager.ensureState(civ.id);
    }
  }

  private buildEmpireSnapshots(): EmpireSnapshot[] {
    return this.civManager
      .getCivilizations()
      .map((civ) => this.buildEmpireSnapshotForCiv(civ));
  }

  private buildEmpireSnapshotForCiv(civ: Civilization): EmpireSnapshot {
    let militaryStrength = 0;
    for (const fleet of this.fleetManager.getFleetsForCiv(civ.id)) {
      const strength = this.fleetManager.getFleetStrength(fleet);
      militaryStrength += strength.attack + strength.hull;
    }

    const ownColonyIds = new Set(
      this.colonyManager
        .getColonies()
        .filter((colony) => colony.civId === civ.id)
        .map((colony) => colony.id)
    );
    const tradeRouteCount = this.galacticTradeManager
      .getRoutes()
      .filter((route) => ownColonyIds.has(route.sourceColonyId)).length;

    return buildEmpireSnapshot(civ.id, civ.isPlayer, this.colonyManager.getColonies(), {
      fleetStrength: Math.round(militaryStrength),
      warCount: this.diplomacyManager.getWarCountForCiv(civ.id),
      tradeRouteCount,
      completedTechCount: civ.researchState.completedTechIds.length,
      treasury: civ.treasury,
    });
  }

  private ensureNarrativeStates(): void {
    for (const civ of this.civManager.getCivilizations()) {
      this.narrativeManager.ensureState(civ.id);
    }
  }

  private buildVictorySnapshot(): VictorySnapshot {
    const colonies = this.colonyManager.getColonies();
    const sites = this.narrativeManager.getSites();
    const crisis = this.narrativeManager.getCrisis();
    const settledSystems = new Set(colonies.map((colony) => colony.systemId));

    const civs = this.civManager.getCivilizations().map((civ) => {
      const ownColonies = colonies.filter((colony) => colony.civId === civ.id);
      let fleetStrength = 0;
      for (const fleet of this.fleetManager.getFleetsForCiv(civ.id)) {
        const strength = this.fleetManager.getFleetStrength(fleet);
        fleetStrength += strength.hull + strength.attack + strength.defense;
      }

      return {
        civId: civ.id,
        civName: civ.name,
        isPlayer: civ.isPlayer,
        colonyCount: ownColonies.length,
        settledSystemCount: new Set(ownColonies.map((colony) => colony.systemId)).size,
        population: ownColonies.reduce((sum, colony) => sum + colony.population, 0),
        completedTechIds: [...civ.researchState.completedTechIds],
        treasury: civ.treasury,
        fleetStrength,
        completedExcavations: sites.filter((site) => site.completedByCivId === civ.id).length,
        crisisStage: crisis.stage,
        crisisOutcome: crisis.outcome,
      };
    });

    return {
      currentTurn: this.turnManager.getCurrentTurn(),
      totalSettledSystems: settledSystems.size,
      civs,
    };
  }

  private buildNarrativeContexts(researchByCiv: Map<string, number>): NarrativeCivContext[] {
    return this.civManager.getCivilizations().map((civ) => ({
      civId: civ.id,
      isPlayer: civ.isPlayer,
      colonyCount: this.colonyManager.getColoniesByCivId(civ.id).length,
      treasury: civ.treasury,
      warCount: this.diplomacyManager.getWarCountForCiv(civ.id),
      researchPerTurn: researchByCiv.get(civ.id) ?? 0,
    }));
  }

  private applyNarrativeReport(report: NarrativeTurnReport, turn: number): void {
    for (const completion of report.completions) {
      const civ = this.civManager.getCivilization(completion.civId);
      if (!civ) continue;
      civ.treasury = Math.max(0, roundCredits(civ.treasury + completion.credits));
      const { completedTech } = ResearchManager.applyResearchPoints(
        civ.researchState,
        completion.research
      );
      if (completedTech && civ.isPlayer) {
        this.eventBus.emit('research:completed', { tech: completedTech });
      }
      const location = this.resolveSiteLocation(completion.site);
      this.eventBus.emit('narrative:excavation-completed', {
        site: completion.site,
        planetName: location.planetName,
        systemName: location.systemName,
        credits: completion.credits,
        research: completion.research,
        turn,
      });
    }

    for (const entry of report.newEvents) {
      this.eventBus.emit('narrative:event-pending', {
        civId: entry.civId,
        eventId: entry.event.id,
        title: entry.event.title,
        turn,
      });
    }

    if (report.crisisStarted) {
      this.eventBus.emit('narrative:crisis-started', {
        stage: report.crisisStarted.stage,
        turn,
      });
    }
    if (report.crisisStageChanged) {
      this.eventBus.emit('narrative:crisis-stage', {
        previousStage: report.crisisStageChanged.previousStage,
        stage: report.crisisStageChanged.crisis.stage,
        turn,
      });
    }
    if (report.crisisResolved) {
      this.eventBus.emit('narrative:crisis-resolved', {
        outcome: report.crisisResolved.outcome,
        turn,
      });
    }
  }

  private applyNarrativeEffects(
    civ: Civilization,
    effects: { credits?: number; research?: number; factionLoyalty?: number }
  ): void {
    if (effects.credits) {
      civ.treasury = Math.max(0, roundCredits(civ.treasury + effects.credits));
    }
    if (effects.research) {
      const { completedTech } = ResearchManager.applyResearchPoints(
        civ.researchState,
        effects.research
      );
      if (completedTech && civ.isPlayer) {
        this.eventBus.emit('research:completed', { tech: completedTech });
      }
    }
    if (effects.factionLoyalty) {
      this.empireManager.adjustLoyalty(civ.id, effects.factionLoyalty);
    }
  }

  private getCombinedModifiers(civId: string, snapshot: EmpireSnapshot): EmpireModifiers {
    const base = this.empireManager.getModifiers(civId, snapshot);
    const crisis = this.narrativeManager.getCrisisModifiers();
    return {
      productionMultiplier: roundToThousand(base.productionMultiplier * crisis.productionMultiplier),
      researchMultiplier: roundToThousand(base.researchMultiplier * crisis.researchMultiplier),
      influenceMultiplier: roundToThousand(base.influenceMultiplier * crisis.influenceMultiplier),
      approvalModifier: Math.min(
        10,
        Math.max(-20, base.approvalModifier + crisis.approvalModifier)
      ),
    };
  }

  private resolveSiteLocation(site: ExcavationSite): {
    planetName: string;
    systemName: string;
  } {
    const system = this.galaxy.systems.find((entry) => entry.id === site.systemId);
    const planet = system?.planets?.find((entry) => entry.id === site.planetId);
    return {
      planetName: planet?.name ?? site.planetId,
      systemName: system?.name ?? site.systemId,
    };
  }

  private establishAiHomeSystem(civ: Civilization, system: StarSystem): boolean {
    const planet = [...system.planets]
      .filter(
        (candidate) =>
          candidate.planetType !== 'gas_giant' &&
          candidate.radiationHazard !== 'lethal' &&
          candidate.habitability >= GameEngine.AI_HOME_MIN_HABITABILITY,
      )
      .sort((a, b) => b.habitability - a.habitability || a.id.localeCompare(b.id))[0];

    if (!planet) {
      return false;
    }

    const previousSurveyStatus = planet.surveyStatus;
    const previousDiscoveryStatus = system.discoveryStatus;
    planet.surveyStatus = 'analyzed';
    system.discoveryStatus = 'surveyed';

    const check = ColonizationValidator.canColonize(planet, system, false);
    if (!check.allowed) {
      planet.surveyStatus = previousSurveyStatus;
      system.discoveryStatus = previousDiscoveryStatus;
      return false;
    }

    const surface = this.surfaceManager.getOrCreateSurface(planet, this.galaxy.seed);
    const turnState = this.turnManager.getTurnState();
    const result = this.colonyManager.foundColony(
      planet,
      system,
      surface,
      turnState.currentTurn,
      turnState.turnDateStandard,
      civ.id,
      `${civ.name} Heimatwelt`,
    );

    if (!result.success || !result.colony) {
      planet.surveyStatus = previousSurveyStatus;
      system.discoveryStatus = previousDiscoveryStatus;
      return false;
    }

    const colony = result.colony;
    colony.developmentTier = 'colony';
    colony.population = GameEngine.AI_HOME_POPULATION;
    colony.growthFoodRequired = EconomyEngine.calculateGrowthRequired(GameEngine.AI_HOME_POPULATION);
    EconomyEngine.simulateTurnEconomy(colony, surface, planet.habitability);

    system.ownerFactionId = civ.id;
    system.discoveryStatus = 'colonized';
    civ.homeSystemId = system.id;

    return true;
  }

  /* -------------------------------------------------------------------------- */
  /* GALAXY GENERATION & SAVE/LOAD (VERSION 2)                                  */
  /* -------------------------------------------------------------------------- */

  public generateNewGalaxy(config: Partial<GalaxyConfig>): Galaxy {
    this.galaxy = GalaxyGenerator.generate(config);
    this.colonyManager.clear();
    this.surfaceManager.clear();
    this.terraformingManager.clear();
    this.logisticsManager.clear();
    this.galacticTradeManager.clear();
    this.privateSectorManager.clear();
    this.fleetManager.clear();
    this.diplomacyManager.clear();
    this.empireManager.reset();
    this.narrativeManager.reset();
    this.victoryManager.reset();
    this.messageLog.clear();
    this.stations = [];

    // Fraktionsaufstellung deterministisch aus Seed und Auswahl ableiten.
    const setup = resolveFactionSetup(this.galaxy.config);
    this.galaxy.factionAssignments = setup.assignments;
    this.civManager.configureHumanFactions(setup.assignments);

    // Der Spieler behält System 0, erhält aber garantiert einen habitablen
    // Planeten nach der echten Bewertungslogik. Es wird keine Kolonie gegründet.
    ensurePlayerHomeHabitability(this.galaxy);

    this.initializeAiPresence();
    this.syncDiplomacyWithCivilizations();
    this.ensureEmpireStates();
    this.ensureNarrativeStates();
    this.narrativeManager.generateSites(this.galaxy);
    this.units = [];
    this.turnManager.setTurn(1);
    this.activeView = 'galaxy';
    this.selectedSystemId = this.galaxy.systems.length > 0 ? this.galaxy.systems[0].id : null;
    this.selectedPlanetId =
      this.galaxy.systems.length > 0 && this.galaxy.systems[0].planets && this.galaxy.systems[0].planets.length > 0
        ? this.galaxy.systems[0].planets[0].id
        : null;
    this.selectedHexCoord = null;
    this.selectedUnitId = null;

    // Startflotte im ersten System: Fregatte, Aufklärer und beladenes
    // Kolonieschiff. Es wird bewusst keine Kolonie automatisch gegründet.
    this.deployStartingFleet(this.galaxy.systems.length > 0 ? this.galaxy.systems[0].id : null);

    this.eventBus.emit('galaxy:generated', { galaxy: this.galaxy });
    this.eventBus.emit('view:changed', { view: 'galaxy', systemId: this.selectedSystemId });
    return this.galaxy;
  }

  public createSavePayload(saveName: string = 'Schnellspeicherung'): SaveGameData {
    const surveyedSystemsCount = this.galaxy.systems.filter((s) => s.discoveryStatus !== 'unexplored').length;
    let totalPlanets = 0;
    let surveyedPlanets = 0;
    let colonizedPlanets = 0;

    for (const sys of this.galaxy.systems) {
      if (sys.planets) {
        totalPlanets += sys.planets.length;
        surveyedPlanets += sys.planets.filter((p) => p.surveyStatus !== 'unexplored').length;
        colonizedPlanets += sys.planets.filter((p) => p.colonizationStatus === 'colonized').length;
      }
    }

    const totalPop = this.colonyManager.getColonies().reduce((sum, c) => sum + c.population, 0);
    const playerCiv = this.civManager.getPlayerCiv();

    return {
      version: CURRENT_SAVE_VERSION,
      saveName,
      timestamp: Date.now(),
      turnState: this.turnManager.getTurnState(),
      galaxy: this.galaxy,
      civilizations: this.civManager.getCivilizations(),
      colonies: this.colonyManager.getColonies(),
      surfaces: this.surfaceManager.getAllSurfaces(),
      units: this.units,
      terraformingProjects: this.terraformingManager.getAllProjects(),
      logisticsRoutes: this.logisticsManager.getRoutes(),
      freighterFleets: this.logisticsManager.getFleets(),
      galacticTradeRoutes: this.galacticTradeManager.getRoutes(),
      galacticTradeConvoys: this.galacticTradeManager.getConvoys(),
      fleets: this.fleetManager.getFleets(),
      shipBuildOrders: this.fleetManager.getOrders(),
      diplomacy: this.diplomacyManager.toSnapshot(),
      empireStates: this.empireManager.getAllStates(),
      narrative: this.narrativeManager.toSnapshot(),
      outcome: this.victoryManager.getOutcome(),
      messageLog: this.messageLog.toSnapshot(),
      stations: this.stations.map((station) => ({ ...station })),
      selectedSystemId: this.selectedSystemId,
      selectedPlanetId: this.selectedPlanetId,
      selectedHexCoord: this.selectedHexCoord,
      viewMode: this.activeView,
      statistics: {
        surveyedSystemsCount,
        totalSystemsCount: this.galaxy.systems.length,
        surveyedPlanetsCount: surveyedPlanets,
        totalPlanetsCount: totalPlanets,
        colonizedPlanetsCount: colonizedPlanets,
        totalPopulation: totalPop,
        totalTechsResearched: playerCiv.researchState.completedTechIds.length,
      },
    };
  }

  public restoreFromSaveData(data: SaveGameData): boolean {
    try {
      this.galaxy = data.galaxy;

      // Populate planets array for backward compatibility
      for (const sys of this.galaxy.systems) {
        if (!sys.planets || sys.planets.length === 0) {
          sys.planets = PlanetGenerator.generateSystemPlanets(
            this.galaxy.seed,
            sys.id,
            sys.name,
            sys.star,
            sys.planetCount,
            sys.id === this.galaxy.systems[0]?.id
          );
          sys.planetCount = sys.planets.length;
        }
      }

      // Restore Surfaces
      if (data.surfaces) {
        this.surfaceManager.loadSurfaces(data.surfaces);
      } else {
        this.surfaceManager.clear();
      }

      // Restore Civilizations
      if (data.civilizations) {
        this.civManager.loadCivilizations(data.civilizations);
      }

      // Restore Colonies
      this.colonyManager.loadColonies(data.colonies || []);

      // Rebuild district surface markers from colony records (older saves omit them)
      for (const surface of this.surfaceManager.getAllSurfaces()) {
        DistrictManager.syncSurfaceMarkers(surface, this.colonyManager.getColonies());
      }

      // Berichte des Privatsektors sind abgeleitet und werden nach dem Laden
      // erst wieder im nächsten Spielzug erzeugt.
      this.privateSectorManager.clear();

      // Restore Terraforming & Units
      this.terraformingManager.loadProjects(data.terraformingProjects || []);
      this.logisticsManager.loadRoutes(data.logisticsRoutes || []);
      if (data.freighterFleets) {
        this.logisticsManager.loadFleets(data.freighterFleets);
      }
      this.galacticTradeManager.loadRoutes(data.galacticTradeRoutes || []);
      if (data.galacticTradeConvoys) {
        this.galacticTradeManager.loadConvoys(data.galacticTradeConvoys);
      }
      this.fleetManager.loadFleets(data.fleets || []);
      this.fleetManager.loadOrders(data.shipBuildOrders || []);
      this.diplomacyManager.loadPairs(data.diplomacy || []);
      this.syncDiplomacyWithCivilizations();
      this.empireManager.loadStates(data.empireStates);
      this.ensureEmpireStates();
      this.narrativeManager.loadState(data.narrative, this.galaxy);
      this.ensureNarrativeStates();
      this.victoryManager.loadOutcome(
        data.outcome,
        this.colonyManager.getColoniesByCivId(this.civManager.getPlayerCiv().id).length
      );
      this.units = data.units || [];
      this.messageLog.loadSnapshot(data.messageLog);
      this.stations = Array.isArray(data.stations) ? data.stations.map((station) => ({ ...station })) : [];
      this.startPlacementWarnings = [];

      this.turnManager.setTurn(data.turnState.currentTurn);
      this.selectedSystemId = data.selectedSystemId;
      this.selectedPlanetId = data.selectedPlanetId ?? null;
      this.selectedHexCoord = data.selectedHexCoord ?? null;
      this.activeView = data.viewMode ?? 'galaxy';

      this.eventBus.emit('galaxy:generated', { galaxy: this.galaxy });
      this.eventBus.emit('system:selected', { system: this.getSelectedSystem() });
      this.eventBus.emit('planet:selected', { planet: this.getSelectedPlanet() });
      this.eventBus.emit('view:changed', { view: this.activeView, systemId: this.selectedSystemId });
      this.eventBus.emit('game:loaded', {
        saveName: data.saveName,
        turn: data.turnState.currentTurn,
      });

      return true;
    } catch (e) {
      console.error('Failed to restore game engine state:', e);
      return false;
    }
  }

  public getTerraformingManager(): TerraformingManager {
    return this.terraformingManager;
  }

  public getTerraformingProject(planetId: string) {
    return this.terraformingManager.getProject(planetId);
  }

  public startTerraformingProject(planetId: string, options: TerraformingOptions): TerraformingStartResult {
    const planet = this.findPlanetById(planetId);
    if (!planet) {
      return { allowed: false, reason: 'Planet nicht gefunden.' };
    }
    const surface = this.surfaceManager.getSurface(planetId);
    const completedTechIds = this.civManager.getPlayerCiv().researchState.completedTechIds;
    return this.terraformingManager.startProject(planet, surface, completedTechIds, options);
  }

  public cancelTerraformingProject(planetId: string): boolean {
    return this.terraformingManager.cancelProject(planetId);
  }

  public getLogisticsManager(): LogisticsManager {
    return this.logisticsManager;
  }

  public getGalacticTradeManager(): GalacticTradeManager {
    return this.galacticTradeManager;
  }

  public getPrivateSectorManager(): PrivateSectorManager {
    return this.privateSectorManager;
  }

  /** Bericht der letzten Runde für eine Zivilisation (abgeleitet, nicht gespeichert). */
  public getPrivateSectorReport(civId: string): PrivateSectorCivReport | null {
    return this.privateSectorManager.getReportForCiv(civId);
  }

  public getPrivateSectorReports(): PrivateSectorCivReport[] {
    return this.privateSectorManager.getLastReports();
  }

  public getFleetManager(): FleetManager {
    return this.fleetManager;
  }

  public getDiplomacyManager(): DiplomacyManager {
    return this.diplomacyManager;
  }

  public getDiplomacyPairs(): DiplomaticPair[] {
    return this.diplomacyManager.getPairs();
  }

  public declareWar(civAId: string, civBId: string): DiplomacyResult {
    return this.diplomacyManager.declareWar(civAId, civBId, this.turnManager.getCurrentTurn());
  }

  public makePeace(civAId: string, civBId: string): DiplomacyResult {
    return this.diplomacyManager.makePeace(civAId, civBId, this.turnManager.getCurrentTurn());
  }

  public isAtWar(civAId: string, civBId: string): boolean {
    return this.diplomacyManager.isAtWar(civAId, civBId);
  }

  private syncDiplomacyWithCivilizations(): void {
    this.diplomacyManager.syncCivilizations(this.civManager.getCivilizations().map((civ) => civ.id));
  }

  public buildShip(colonyId: string, shipDefId: string): ShipBuildResult {
    const colony = this.colonyManager.getColonyById(colonyId);
    if (!colony) {
      return { allowed: false, reason: 'Kolonie nicht gefunden.' };
    }
    const completedTechIds = this.civManager.getPlayerCiv().researchState.completedTechIds;
    return this.fleetManager.queueShipBuild(
      colony,
      shipDefId,
      completedTechIds,
      this.turnManager.getCurrentTurn(),
    );
  }

  public commandFleetMove(
    fleetId: string,
    destinationSystemId: string,
    waypointSystemIds: readonly string[] = [],
  ): FleetMoveResult {
    return this.fleetManager.commandMoveFleet(fleetId, destinationSystemId, waypointSystemIds);
  }

  /** Ändert das Ziel einer laufenden Flotte, ohne die Auswahl zu verlieren. */
  public retargetFleet(
    fleetId: string,
    destinationSystemId: string,
    waypointSystemIds: readonly string[] = [],
  ): FleetMoveResult {
    return this.fleetManager.retargetFleet(fleetId, destinationSystemId, waypointSystemIds);
  }

  /** Bricht einen Flottenauftrag ab; die Flotte bleibt im aktuellen System. */
  public cancelFleetMovement(fleetId: string): boolean {
    return this.fleetManager.cancelFleetMovement(fleetId);
  }

  /**
   * Führt einen frisch erteilten Auftrag sofort für die laufende Runde aus.
   * Die Reichweite kommt wie beim Rundenwechsel aus dem Reich des Verbands.
   */
  public moveFleetNow(fleetId: string): { traveled: number; arrived: boolean } | null {
    const fleet = this.fleetManager.getFleet(fleetId);
    if (!fleet) return null;
    return this.fleetManager.moveFleetNow(fleetId, this.getFleetRangeForCiv(fleet.civId));
  }

  /** Route für die Vorschau auf der Galaxiekarte, ohne Auftrag. */
  public previewFleetRoute(
    fleetId: string,
    destinationSystemId: string,
    waypointSystemIds: readonly string[] = [],
  ): string[] | null {
    return this.fleetManager.previewRoute(fleetId, destinationSystemId, waypointSystemIds);
  }

  /** Prüft ein Ziel, ohne die Flotte zu bewegen. */
  public validateFleetTarget(
    fleetId: string,
    destinationSystemId: string,
    waypointSystemIds: readonly string[] = [],
  ): FleetMoveResult {
    return this.fleetManager.canReachSystem(fleetId, destinationSystemId, waypointSystemIds);
  }

  /**
   * Ankunftsprognose eines Verbands mit der Reichweite seines Reiches. Die
   * Rechnung entspricht der ETA-Logik aus Master of Orion 2 („n turns to
   * star“): verbleibende Sprünge geteilt durch Sprünge pro Runde.
   */
  public getFleetEta(fleetId: string): FleetEta | null {
    const fleet = this.fleetManager.getFleet(fleetId);
    if (!fleet) return null;
    return this.fleetManager.getFleetEta(fleetId, this.getFleetRangeForCiv(fleet.civId));
  }

  /** Ankunftsprognose für ein noch nicht erteiltes Ziel. */
  public getFleetEtaToSystem(
    fleetId: string,
    destinationSystemId: string,
    waypointSystemIds: readonly string[] = [],
  ): FleetEta | null {
    const fleet = this.fleetManager.getFleet(fleetId);
    if (!fleet) return null;
    return this.fleetManager.getEtaToSystem(
      fleetId,
      destinationSystemId,
      this.getFleetRangeForCiv(fleet.civId),
      waypointSystemIds,
    );
  }

  /** Hyperlane-Reichweite eines Reiches, abgeleitet aus vorhandenen Techs. */
  public getFleetRangeForCiv(civId: string): number {
    const civ = this.civManager.getCivilization(civId);
    return getPropulsionRange(civ?.researchState.completedTechIds ?? []);
  }

  public getFleetRangeLabelForCiv(civId: string): string {
    const civ = this.civManager.getCivilization(civId);
    return getPropulsionLabel(civ?.researchState.completedTechIds ?? []);
  }

  public getPlayerFleetRange(): number {
    return this.getFleetRangeForCiv(this.civManager.getPlayerCiv().id);
  }

  /**
   * Flotten eines Systems, gefiltert nach Sichtbarkeit: Eigene Verbände sind
   * immer sichtbar, fremde nur in bereits erkundeten Systemen. Unerforschte
   * Systeme zeigen keine fremden Schiffe, damit die Karte nichts verrät.
   */
  public getVisibleFleetsForSystem(systemId: string): Fleet[] {
    const system = this.galaxy.systems.find((entry) => entry.id === systemId);
    if (!system) return [];
    const playerCivId = this.civManager.getPlayerCiv().id;
    const knowledge = system.discoveryStatus !== 'unexplored';
    return this.fleetManager
      .getFleets()
      .filter((fleet) => fleet.systemId === systemId)
      .filter((fleet) => fleet.civId === playerCivId || knowledge)
      .map((fleet) => ({ ...fleet, ships: fleet.ships.map((stack) => ({ ...stack })) }));
  }

  public getMessageLog(): MessageLog {
    return this.messageLog;
  }

  public getMessageLogEntries(): MessageLogEntry[] {
    return this.messageLog.getEntries();
  }

  /** Strukturelle Stationsliste; noch ohne Mechanik (Save v5). */
  public getStations(): SpaceStation[] {
    return this.stations.map((station) => ({ ...station }));
  }

  public createGalacticTradeRoute(
    sourceColonyId: string,
    targetColonyId: string,
    resource: GalacticTradeResource,
    freighterCount: number,
  ): GalacticTradeCreateResult {
    const source = this.colonyManager.getColonyById(sourceColonyId);
    const target = this.colonyManager.getColonyById(targetColonyId);
    if (!source || !target) {
      return { allowed: false, reason: 'Quell- oder Zielkolonie nicht gefunden.' };
    }
    const completedTechIds = this.civManager.getPlayerCiv().researchState.completedTechIds;
    return this.galacticTradeManager.createRoute(source, target, resource, freighterCount, completedTechIds);
  }

  public removeGalacticTradeRoute(routeId: string): boolean {
    return this.galacticTradeManager.removeRoute(routeId);
  }

  public setGalacticTradeRouteActive(routeId: string, isActive: boolean): boolean {
    return this.galacticTradeManager.setRouteActive(routeId, isActive);
  }

  public setGalacticTradeTariff(
    routeId: string,
    tariffRate: number,
  ): GalacticTradeCreateResult {
    return this.galacticTradeManager.setRouteTariff(routeId, tariffRate);
  }

  public setGalacticTradeEscorts(
    routeId: string,
    fleetIds: string[],
  ): GalacticTradeCreateResult {
    return this.galacticTradeManager.setRouteEscorts(routeId, fleetIds);
  }

  public createLogisticsRoute(
    sourceColonyId: string,
    targetColonyId: string,
    freighterCount: number,
  ): LogisticsCreateResult {
    const source = this.colonyManager.getColonyById(sourceColonyId);
    const target = this.colonyManager.getColonyById(targetColonyId);
    if (!source || !target) {
      return { allowed: false, reason: 'Quell- oder Zielkolonie nicht gefunden.' };
    }
    const completedTechIds = this.civManager.getPlayerCiv().researchState.completedTechIds;
    return this.logisticsManager.createRoute(source, target, freighterCount, completedTechIds);
  }

  public removeLogisticsRoute(routeId: string): boolean {
    return this.logisticsManager.removeRoute(routeId);
  }

  public setLogisticsRouteActive(routeId: string, isActive: boolean): boolean {
    return this.logisticsManager.setRouteActive(routeId, isActive);
  }

  /**
   * Derives the travel time for one leg from the distance between both colony
   * systems. Falls back to a single turn when a system cannot be resolved.
   */
  private resolveLogisticsTravelTurns(source: Colony, target: Colony): number {
    if (source.systemId === target.systemId) return 1;
    const sourceSystem = this.galaxy.systems.find((system) => system.id === source.systemId);
    const targetSystem = this.galaxy.systems.find((system) => system.id === target.systemId);
    if (!sourceSystem || !targetSystem) return 1;

    const distance = Math.hypot(targetSystem.x - sourceSystem.x, targetSystem.y - sourceSystem.y);
    const scale = Math.max(200, this.galaxy.config.minDistance * 4);
    return Math.max(1, Math.round(distance / scale));
  }

  public quickSave(key?: string): boolean {
    const payload = this.createSavePayload();
    return SaveManager.saveToLocalStorage(payload, key);
  }

  public quickLoad(): boolean {
    const saved = SaveManager.loadFromLocalStorage();
    if (!saved) return false;
    return this.restoreFromSaveData(saved);
  }
}

function roundCredits(value: number): number {
  return Math.round(value * 10) / 10;
}

function roundToThousand(value: number): number {
  return Math.round(value * 1000) / 1000;
}
