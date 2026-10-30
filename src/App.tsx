/**
 * Astraea 4X - Galactic Foundations & Planetary Colonization
 * Main Application Shell (Phase 1, Modul 4: Kolonieverwaltung, Hex-Oberfläche & Ausbau)
 */

import React, { useEffect, useMemo, useState } from 'react';
import deepSpaceImage from './assets/images/galaxy_deep_space_backdrop_1792141331735.jpg';
import { EventBus } from './core/EventBus.ts';
import { GameEngine } from './core/GameEngine.ts';
import { EmpireOverview } from './core/empireManager.ts';
import { NotificationCenter, type GameNotification } from './core/notificationCenter.ts';
import { attachNotificationBridge } from './core/notificationBridge.ts';
import {
  AtmosphereType,
  CitizenFocus,
  Civilization,
  Colony,
  GalacticTradeResource,
  Galaxy,
  GalaxyConfig,
  HexBiome,
  HexCoord,
  Planet,
  PlanetSurface,
  StarSystem,
  SurfaceUnit,
  TurnState,
  EmpirePolicy,
  Fleet,
  ViewMode,
  MessageLogEntry,
} from './core/types.ts';
import { TECHNOLOGY_CATALOG } from './data/technologyCatalog.ts';
import { getHumanFaction } from './data/factionCatalog.ts';
import { ColonyManagementModal, type ColonyModalTab } from './ui/components/ColonyManagementModal.tsx';
import { GalaxyCreationScreen, type StartGameOptions } from './ui/components/GalaxyCreationScreen.tsx';
import { GalaxyMapCanvas } from './ui/components/GalaxyMapCanvas.tsx';
import { MainMenu, type QuickSaveSummary } from './ui/components/MainMenu.tsx';
import { TestLab } from './testing/TestLab.tsx';
import { MessageLogModal } from './ui/components/MessageLogModal.tsx';
import { NotificationStack } from './ui/components/NotificationStack.tsx';
import { ShipInfoBar } from './ui/components/ShipInfoBar.tsx';
import { canStartRoutePlanning, decideGalaxySystemClick } from './ui/routePlanning.ts';
import { SeedLibraryModal } from './ui/components/SeedLibraryModal.tsx';
import { SaveManager } from './save/saveManager.ts';
import { SeedLibrary, seedConfigSignature, type SeedLibraryEntry } from './save/seedLibrary.ts';
import { HexTileInspector } from './ui/components/HexTileInspector.tsx';
import { PhaseRoadmapModal } from './ui/components/PhaseRoadmapModal.tsx';
import { PlanetInspector } from './ui/components/PlanetInspector.tsx';
import { PlanetSurfaceCanvas } from './ui/components/PlanetSurfaceCanvas.tsx';
import { PlanetsOverviewModal } from './ui/components/PlanetsOverviewModal.tsx';
import { SaveLoadModal } from './ui/components/SaveLoadModal.tsx';
import { SystemInspector } from './ui/components/SystemInspector.tsx';
import { SystemMapCanvas } from './ui/components/SystemMapCanvas.tsx';
import { TechTreeModal } from './ui/components/TechTreeModal.tsx';
import { TerraformingModal } from './ui/components/TerraformingModal.tsx';
import { LogisticsModal } from './ui/components/LogisticsModal.tsx';
import { FleetModal } from './ui/components/FleetModal.tsx';
import { DiplomacyModal } from './ui/components/DiplomacyModal.tsx';
import { EmpireModal } from './ui/components/EmpireModal.tsx';
import { NarrativeModal } from './ui/components/NarrativeModal.tsx';
import { VictoryModal } from './ui/components/VictoryModal.tsx';
import { EndScreen } from './ui/components/EndScreen.tsx';
import { TestRunnerModal } from './ui/components/TestRunnerModal.tsx';
import { TopNavBar } from './ui/components/TopNavBar.tsx';

export default function App() {
  const engine = GameEngine.getInstance();
  const eventBus = EventBus.getInstance();

  // Startbildschirm vs. laufendes Spiel. Die Engine bleibt beim Wechsel ins
  // Hauptmenü unverändert, damit „Spiel laden“ und der letzte Seed erhalten bleiben.
  const [appMode, setAppMode] = useState<
    'menu' | 'creation' | 'game' | 'gameOver' | 'ended' | 'testing'
  >('menu');
  const [creationTab, setCreationTab] = useState<'new' | 'library'>('new');
  const [isSeedLibraryOpen, setIsSeedLibraryOpen] = useState(false);
  const [seedEntries, setSeedEntries] = useState<SeedLibraryEntry[]>(() => SeedLibrary.list());

  const refreshSeeds = () => setSeedEntries(SeedLibrary.list());

  const [galaxy, setGalaxy] = useState<Galaxy>(() => engine.getGalaxy());
  const [turnState, setTurnState] = useState<TurnState>(() => engine.getTurnState());
  const [selectedSystem, setSelectedSystem] = useState<StarSystem | null>(() => engine.getSelectedSystem());
  const [selectedPlanet, setSelectedPlanet] = useState<Planet | null>(() => engine.getSelectedPlanet());
  const [selectedHexCoord, setSelectedHexCoord] = useState<HexCoord | null>(() => engine.getSelectedHexCoord());
  const [selectedUnit, setSelectedUnit] = useState<SurfaceUnit | null>(() => engine.getSelectedUnit());
  const [selectedFleetId, setSelectedFleetId] = useState<string | null>(null);
  const [fleetTargetSystemId, setFleetTargetSystemId] = useState<string | null>(null);
  // Routenplanungsmodus: Ein Klick auf die Karte committet das Ziel sofort.
  // Getrennt vom alten Zwei-Klick-Pfad, damit andere UI-Klicks nichts auslösen.
  const [isRoutePlanning, setIsRoutePlanning] = useState(false);
  const [routeHoverSystemId, setRouteHoverSystemId] = useState<string | null>(null);
  const [, setFleetRevision] = useState(0);
  const [colonies, setColonies] = useState<Colony[]>(() => engine.getColonies());
  const [units, setUnits] = useState<SurfaceUnit[]>(() => engine.getUnits());
  const [playerCiv, setPlayerCiv] = useState<Civilization>(() => engine.getPlayerCiv());
  const [viewMode, setViewMode] = useState<ViewMode>(() => engine.getActiveView());

  // Modal visibility states
  const [isPlanetsOverviewOpen, setIsPlanetsOverviewOpen] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [isRoadmapModalOpen, setIsRoadmapModalOpen] = useState(false);
  const [isTechTreeOpen, setIsTechTreeOpen] = useState(false);
  const [isColonyModalOpen, setIsColonyModalOpen] = useState(false);
  const [isTerraformingOpen, setIsTerraformingOpen] = useState(false);
  const [isLogisticsOpen, setIsLogisticsOpen] = useState(false);
  const [isFleetOpen, setIsFleetOpen] = useState(false);
  const [isDiplomacyOpen, setIsDiplomacyOpen] = useState(false);
  const [isEmpireOpen, setIsEmpireOpen] = useState(false);
  const [empireFeedback, setEmpireFeedback] = useState<string | null>(null);
  const [isNarrativeOpen, setIsNarrativeOpen] = useState(false);
  const [isVictoryOpen, setIsVictoryOpen] = useState(false);
  const [isMessageLogOpen, setIsMessageLogOpen] = useState(false);
  const [messageLogEntries, setMessageLogEntries] = useState<MessageLogEntry[]>(
    () => engine.getMessageLogEntries(),
  );
  // Nach einem Sieg darf die Partie ohne erneuten Abschlussbildschirm weiterlaufen.
  const [sandboxMode, setSandboxMode] = useState(false);
  const [, setNarrativeRevision] = useState(0);
  const [, setEmpireRevision] = useState(0);
  const [, setDiplomacyRevision] = useState(0);
  // Nur die ID halten: Nach Laden/Speichern werden Kolonie-Objekte neu erzeugt,
  // eine gespeicherte Objektreferenz würde sonst veralten.
  const [activeColonyModalId, setActiveColonyModalId] = useState<string | null>(null);
  // Start-Tab der Kolonieverwaltung: Das Baumenü springt direkt in die
  // Bauwarteschlange, die übrigen Einstiege beginnen in der Übersicht.
  const [colonyModalTab, setColonyModalTab] = useState<ColonyModalTab>('overview');

  // Zentrales Benachrichtigungssystem: alle Abschlüsse laufen über eine Senke,
  // damit sich Meldungen nicht gegenseitig überschreiben.
  const [notifications] = useState(() => new NotificationCenter());
  const [notificationItems, setNotificationItems] = useState<GameNotification[]>([]);
  const notify = (category: GameNotification['category'], message: string) => {
    const turn = engine.getTurnState().currentTurn;
    const created = notifications.push({ category, message, turn });
    // Dieselbe Senke wie die Ereignisbrücke: wichtige Hinweise bleiben im
    // gespeicherten Verlauf, auch wenn das Popup nach zehn Sekunden verschwindet.
    if (created) {
      engine.getMessageLog().push({
        category: created.category,
        message: created.message,
        key: created.key,
        turn: created.turn,
      });
    }
  };

  // Current surface for active planet
  const currentSurface: PlanetSurface | null = selectedPlanet
    ? engine.getSurfaceForPlanet(selectedPlanet)
    : null;

  // Subscribe to decoupled EventBus events
  useEffect(() => {
    const unsubTurn = eventBus.on('turn:changed', (payload) => {
      setTurnState(engine.getTurnState());
      setGalaxy({ ...engine.getGalaxy() });
      setSelectedSystem(engine.getSelectedSystem() ? { ...engine.getSelectedSystem()! } : null);
      setSelectedPlanet(engine.getSelectedPlanet() ? { ...engine.getSelectedPlanet()! } : null);
      setColonies([...engine.getColonies()]);
      setUnits([...engine.getUnits()]);
      setPlayerCiv({ ...engine.getPlayerCiv() });
    });

    const unsubGalaxy = eventBus.on('galaxy:generated', (payload) => {
      setGalaxy({ ...payload.galaxy });
      setSelectedSystem(engine.getSelectedSystem());
      setSelectedPlanet(engine.getSelectedPlanet());
      setSelectedHexCoord(null);
      setSelectedUnit(null);
      setColonies([...engine.getColonies()]);
      setUnits([...engine.getUnits()]);
      setPlayerCiv({ ...engine.getPlayerCiv() });
      setViewMode(engine.getActiveView());
    });

    const unsubSelect = eventBus.on('system:selected', (payload) => {
      setSelectedSystem(payload.system ? { ...payload.system } : null);
      setSelectedPlanet(engine.getSelectedPlanet() ? { ...engine.getSelectedPlanet()! } : null);
    });

    const unsubPlanetSelect = eventBus.on('planet:selected', (payload) => {
      setSelectedPlanet(payload.planet ? { ...payload.planet } : null);
    });

    const unsubHexSelect = eventBus.on('hex:selected', (payload) => {
      setSelectedHexCoord(payload.coord);
    });

    const unsubUnitSelect = eventBus.on('unit:selected', (payload) => {
      setSelectedUnit(payload.unit);
    });

    const unsubUnitMoved = eventBus.on('unit:moved', (payload) => {
      setUnits([...engine.getUnits()]);
      setSelectedUnit(payload.unit);
      setSelectedHexCoord(payload.unit.hexCoord);
    });

    const unsubView = eventBus.on('view:changed', (payload) => {
      setViewMode(payload.view);
      setSelectedSystem(engine.getSelectedSystem() ? { ...engine.getSelectedSystem()! } : null);
      setSelectedPlanet(engine.getSelectedPlanet() ? { ...engine.getSelectedPlanet()! } : null);
      setSelectedHexCoord(engine.getSelectedHexCoord());
    });

    const unsubSurvey = eventBus.on('system:surveyed', () => {
      setGalaxy({ ...engine.getGalaxy() });
      setSelectedSystem(engine.getSelectedSystem() ? { ...engine.getSelectedSystem()! } : null);
      setSelectedPlanet(engine.getSelectedPlanet() ? { ...engine.getSelectedPlanet()! } : null);
    });

    const unsubPlanetSurvey = eventBus.on('planet:surveyed', () => {
      setGalaxy({ ...engine.getGalaxy() });
      setSelectedSystem(engine.getSelectedSystem() ? { ...engine.getSelectedSystem()! } : null);
      setSelectedPlanet(engine.getSelectedPlanet() ? { ...engine.getSelectedPlanet()! } : null);
    });

    const unsubColonyFounded = (payload: any) => {
      setColonies([...engine.getColonies()]);
      setUnits([...engine.getUnits()]);
      setGalaxy({ ...engine.getGalaxy() });
      setSelectedSystem(engine.getSelectedSystem() ? { ...engine.getSelectedSystem()! } : null);
      setSelectedPlanet(engine.getSelectedPlanet() ? { ...engine.getSelectedPlanet()! } : null);
    };
    const unsubColony = eventBus.on('colony:founded', unsubColonyFounded);

    const unsubHexClaimed = eventBus.on('hex:claimed', () => {
      setColonies([...engine.getColonies()]);
    });

    const unsubBuildQueued = eventBus.on('build:queued', () => {
      setColonies([...engine.getColonies()]);
    });

    const unsubResearchCompleted = eventBus.on('research:completed', () => {
      setPlayerCiv({ ...engine.getPlayerCiv() });
    });

    const unsubTierChanged = eventBus.on('colony:tierChanged', () => {
      setColonies([...engine.getColonies()]);
    });

    const refreshFleets = () => setFleetRevision((value) => value + 1);
    const unsubFleetMove = eventBus.on('fleet:movement-started', refreshFleets);
    const unsubFleetArrived = eventBus.on('fleet:arrived', refreshFleets);
    const unsubFleetCancelled = eventBus.on('fleet:movement-cancelled', refreshFleets);
    const unsubFleetBuilt = eventBus.on('fleet:ship-built', refreshFleets);

    const unsubLoad = eventBus.on('game:loaded', () => {
      setGalaxy({ ...engine.getGalaxy() });
      setTurnState(engine.getTurnState());
      setColonies([...engine.getColonies()]);
      setUnits([...engine.getUnits()]);
      setPlayerCiv({ ...engine.getPlayerCiv() });
      setSelectedSystem(engine.getSelectedSystem() ? { ...engine.getSelectedSystem()! } : null);
      setSelectedPlanet(engine.getSelectedPlanet() ? { ...engine.getSelectedPlanet()! } : null);
      setSelectedHexCoord(engine.getSelectedHexCoord());
      setSelectedUnit(engine.getSelectedUnit());
      setSelectedFleetId(null);
      setViewMode(engine.getActiveView());
      // Laden aus dem Hauptmenü führt direkt ins laufende Spiel.
      setAppMode('game');
      refreshSeeds();
    });

    return () => {
      unsubTurn();
      unsubGalaxy();
      unsubSelect();
      unsubPlanetSelect();
      unsubHexSelect();
      unsubUnitSelect();
      unsubUnitMoved();
      unsubView();
      unsubSurvey();
      unsubPlanetSurvey();
      unsubColony();
      unsubHexClaimed();
      unsubBuildQueued();
      unsubResearchCompleted();
      unsubTierChanged();
      unsubFleetMove();
      unsubFleetArrived();
      unsubFleetCancelled();
      unsubFleetBuilt();
      unsubLoad();
    };
  }, [engine, eventBus]);

  // Benachrichtigungen: Das Center wird einmal abonniert, die Brücke übersetzt
  // alle Spielereignisse (Bau, Rekrutierung, Forschung, Kolonisation,
  // Erkundung) in Meldungen. Beim Laden leert die Brücke den Stapel.
  useEffect(() => {
    const unsubscribeCenter = notifications.subscribe(setNotificationItems);
    const unsubscribeLog = engine.getMessageLog().subscribe(setMessageLogEntries);
    const detachBridge = attachNotificationBridge(notifications, eventBus, {
      playerCivId: engine.getPlayerCiv().id,
      currentTurn: () => engine.getTurnState().currentTurn,
      messageLog: engine.getMessageLog(),
      resolveColonyName: (id) =>
        engine.getColonies().find((colony) => colony.id === id)?.name ?? 'Kolonie',
      resolveSystemName: (id) =>
        engine.getGalaxy().systems.find((system) => system.id === id)?.name ?? id,
      resolvePlanetName: (id) => {
        for (const system of engine.getGalaxy().systems) {
          const planet = system.planets?.find((candidate) => candidate.id === id);
          if (planet) return planet.name;
        }
        return id;
      },
    });

    return () => {
      detachBridge();
      unsubscribeLog();
      unsubscribeCenter();
    };
  }, [notifications, eventBus, engine]);

  // Keyboard Navigation Shortcuts (nur im laufenden Spiel)
  useEffect(() => {
    if (appMode !== 'game') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'Escape') {
        if (
          isSaveModalOpen ||
          isTestModalOpen ||
          isRoadmapModalOpen ||
          isTechTreeOpen ||
          isColonyModalOpen ||
          isPlanetsOverviewOpen ||
          isLogisticsOpen ||
          isFleetOpen ||
          isDiplomacyOpen ||
          isTerraformingOpen ||
          isNarrativeOpen ||
          isVictoryOpen ||
          isMessageLogOpen
        ) {
          setIsSaveModalOpen(false);
          setIsTestModalOpen(false);
          setIsRoadmapModalOpen(false);
          setIsTechTreeOpen(false);
          setIsColonyModalOpen(false);
          setIsPlanetsOverviewOpen(false);
          setIsLogisticsOpen(false);
          setIsFleetOpen(false);
          setIsDiplomacyOpen(false);
          setIsTerraformingOpen(false);
          setIsNarrativeOpen(false);
          setIsVictoryOpen(false);
          setIsMessageLogOpen(false);
        } else if (viewMode === 'surface') {
          // Escape räumt zuerst die Auswahl auf (Einheit, dann Kachel) und
          // verlässt erst danach die Planetenoberfläche.
          if (engine.getSelectedUnit()) {
            engine.selectUnit(null);
          } else if (engine.getSelectedHexCoord()) {
            engine.selectHex(null);
          } else {
            engine.leaveSurfaceView();
          }
        } else if (viewMode === 'system') {
          engine.leaveSystemView();
        }
      } else if (e.key === 's' || e.key === 'S') {
        setIsSaveModalOpen(true);
      } else if (e.key === 't' || e.key === 'T') {
        setIsTestModalOpen(true);
      } else if (e.key === 'f' || e.key === 'F') {
        setIsTechTreeOpen((v) => !v);
      } else if (e.key === 'c' || e.key === 'C') {
        const activeCol = selectedPlanet ? engine.getColonyByPlanetId(selectedPlanet.id) : colonies[0];
        if (activeCol) {
          setActiveColonyModalId(activeCol.id);
          setColonyModalTab('overview');
          setIsColonyModalOpen(true);
        }
      } else if (e.key === 'p' || e.key === 'P') {
        if (selectedPlanet) {
          if (viewMode === 'surface') {
            engine.leaveSurfaceView();
          } else {
            engine.enterSurfaceView(selectedPlanet.id);
          }
        }
      } else if (e.key === 'm' || e.key === 'M') {
        if (viewMode === 'galaxy' && selectedSystem) {
          engine.enterSystemView(selectedSystem.id);
        } else if (viewMode === 'system') {
          engine.leaveSystemView();
        } else if (viewMode === 'surface') {
          engine.leaveSurfaceView();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    appMode,
    viewMode,
    selectedSystem,
    selectedPlanet,
    colonies,
    isSaveModalOpen,
    isTestModalOpen,
    isRoadmapModalOpen,
    isTechTreeOpen,
    isColonyModalOpen,
    isNarrativeOpen,
    isVictoryOpen,
    isMessageLogOpen,
    engine,
  ]);

  const handleEndTurn = () => {
    engine.endTurn();
    if (!sandboxMode && engine.getOutcome().status !== 'ongoing') {
      setIsNarrativeOpen(false);
      setAppMode('gameOver');
      return;
    }
    const overview = engine.getNarrativeOverview(playerCiv.id);
    if (overview?.pendingEvent) {
      setIsNarrativeOpen(true);
    }
    setNarrativeRevision((v) => v + 1);
  };

  const findSelectedPlayerFleet = (): Fleet | null => {
    if (!selectedFleetId) return null;
    const fleet =
      engine.getFleetManager().getFleets().find((candidate) => candidate.id === selectedFleetId) ?? null;
    return fleet && fleet.civId === playerCiv.id ? fleet : null;
  };

  /**
   * Erteilt bzw. ändert den Bewegungsauftrag, führt die Bewegung für die
   * laufende Runde bis zur Reichweite aus und meldet das Ergebnis. Die
   * verbleibenden Sprünge löst weiterhin der bestehende Rundenwechsel
   * (`advanceTurn`) auf; dort wird ein bereits gezogener Verband übersprungen.
   */
  const commitFleetDestination = (fleet: Fleet, system: StarSystem): boolean => {
    const result =
      fleet.status === 'moving'
        ? engine.retargetFleet(fleet.id, system.id)
        : engine.commandFleetMove(fleet.id, system.id);
    if (!result.allowed) {
      notify('warning', `⚠ ${result.reason ?? 'Auftrag nicht möglich.'}`);
      return false;
    }
    // Die Bewegung wird sofort im Spielzustand ausgeführt – begrenzt auf die
    // Reichweite dieser Runde. Ein späterer Rundenwechsel bewegt denselben
    // Verband nicht erneut (eine Bewegung pro Runde).
    const movement = engine.moveFleetNow(fleet.id);
    const hops = result.pathSystemIds ? Math.max(0, result.pathSystemIds.length - 1) : 0;
    const eta = engine.getFleetEta(fleet.id);
    const arrival =
      eta && eta.turnsRemaining === 0
        ? ' · im Ziel'
        : eta
          ? ` · Ankunft in ${eta.turnsRemaining} ${eta.turnsRemaining === 1 ? 'Runde' : 'Runden'}`
          : '';
    const moved =
      movement && movement.traveled > 0
        ? ` · ${movement.traveled} ${movement.traveled === 1 ? 'Sprung' : 'Sprünge'} diese Runde`
        : '';
    setFleetRevision((value) => value + 1);
    notify(
      'fleet',
      `🛸 ${fleet.name}: Auftrag nach ${system.name} erteilt · ${hops} ${hops === 1 ? 'Sprung' : 'Sprünge'}${moved}${arrival}.`,
    );
    return true;
  };

  const stopRoutePlanning = () => {
    setIsRoutePlanning(false);
    setRouteHoverSystemId(null);
    setFleetTargetSystemId(null);
  };

  const handleStartRoutePlanning = () => {
    const fleet = findSelectedPlayerFleet();
    if (!fleet) {
      notify('warning', '⚠ Für die Routenplanung muss ein eigener Verband ausgewählt sein.');
      return;
    }
    setIsRoutePlanning(true);
    setRouteHoverSystemId(null);
    setFleetTargetSystemId(null);
    notify('fleet', `🗺 ${fleet.name}: Routenplanung aktiv – Zielsystem auswählen.`);
  };

  /** Nur Auswahl im Inspector: löst bewusst keine Bewegung aus. */
  const handleSelectSystemFromList = (system: StarSystem) => {
    engine.selectSystem(system.id);
  };

  const handleGalaxySystemClick = (system: StarSystem) => {
    engine.selectSystem(system.id);

    const fleet = findSelectedPlayerFleet();
    const action = decideGalaxySystemClick({
      isRoutePlanning,
      hasSelectedPlayerFleet: canStartRoutePlanning(fleet, playerCiv.id),
      clickedSystemId: system.id,
      pendingTargetSystemId: fleetTargetSystemId,
    });

    if (action === 'ignore') {
      if (isRoutePlanning) stopRoutePlanning();
      else setFleetTargetSystemId(null);
      return;
    }
    if (!fleet) return;

    // Routenplanungsmodus: ein Klick auf ein gültiges Ziel committet sofort.
    if (action === 'commit-plan') {
      const check = engine.validateFleetTarget(fleet.id, system.id);
      if (!check.allowed) {
        notify('warning', `⚠ ${check.reason ?? 'Ziel nicht erreichbar.'}`);
        return;
      }
      if (commitFleetDestination(fleet, system)) {
        stopRoutePlanning();
      }
      return;
    }

    // Zweiter Klick auf dasselbe System erteilt bzw. ändert den Auftrag.
    if (action === 'legacy-commit') {
      if (commitFleetDestination(fleet, system)) {
        setFleetTargetSystemId(null);
      }
      return;
    }

    // Erster Klick prüft die Route und zeigt sie als Vorschau an.
    const check = engine.validateFleetTarget(fleet.id, system.id);
    if (check.allowed) {
      setFleetTargetSystemId(system.id);
    } else {
      setFleetTargetSystemId(null);
      notify('warning', `⚠ ${check.reason ?? 'Ziel nicht erreichbar.'}`);
    }
  };

  const handleSurveySystem = (systemId: string) => {
    engine.surveySystem(systemId);
  };

  const handleOpenSystemMap = (system: StarSystem) => {
    engine.enterSystemView(system.id);
  };

  const handleBackToGalaxy = () => {
    engine.leaveSystemView();
  };

  const handleSelectPlanet = (planet: Planet | null) => {
    engine.selectPlanet(planet ? planet.id : null);
  };

  const handleSurveyPlanet = (planetId: string) => {
    engine.surveyPlanet(planetId);
  };

  const handleFoundColony = (planetId: string, customName?: string) => {
    const res = engine.foundColony(planetId, customName);
    if (res.success) {
      setColonies([...engine.getColonies()]);
      setUnits([...engine.getUnits()]);
      setGalaxy({ ...engine.getGalaxy() });
      setSelectedSystem(engine.getSelectedSystem() ? { ...engine.getSelectedSystem()! } : null);
      setSelectedPlanet(engine.getSelectedPlanet() ? { ...engine.getSelectedPlanet()! } : null);
    }
  };

  const handleUpgradeTier = (colonyId: string) => {
    const res = engine.upgradeColonyTier(colonyId);
    if (res.success) {
      setColonies([...engine.getColonies()]);
    }
    return res;
  };

  const handleEnterSurface = (planetId: string) => {
    engine.enterSurfaceView(planetId);
  };

  const handleLeaveSurface = () => {
    // Beim Verlassen der Oberfläche dürfen weder Einheiten- noch Kachelauswahl
    // in der Systemansicht weiterleben.
    engine.selectUnit(null);
    engine.selectHex(null);
    engine.leaveSurfaceView();
  };

  const handleSelectHex = (coord: HexCoord | null) => {
    engine.selectHex(coord);
  };

  const handleSelectUnit = (unitId: string | null) => {
    engine.selectUnit(unitId);
  };

  // Öffnet die Kolonieverwaltung anhand einer stabilen Kolonie-ID. Die Kolonie
  // wird immer aus dem aktuellen Bestand aufgelöst, damit die Modal-Daten
  // nicht auf ein veraltetes Objekt zeigen. Löst bewusst keinen Zug aus.
  const handleOpenColonyManagement = (colonyId: string) => {
    const col = colonies.find((c) => c.id === colonyId);
    if (!col) return;
    setActiveColonyModalId(col.id);
    setColonyModalTab('overview');
    setIsColonyModalOpen(true);
  };

  const handleMoveUnitToHex = (coord: HexCoord) => {
    const res = engine.moveSelectedUnit(coord);
    if (!res.success && res.reason) {
      notify('warning', `⚠ Bewegung: ${res.reason}`);
    }
  };

  const handleClaimHex = (coord: HexCoord) => {
    const activeCol = selectedPlanet ? engine.getColonyByPlanetId(selectedPlanet.id) : null;
    if (activeCol) {
      const res = engine.claimHex(activeCol.id, coord);
      if (!res.success && res.reason) {
        notify('warning', `⚠ ${res.reason}`);
      }
    }
  };

  const handleQueueBuilding = (colonyId: string, buildingDefId: string, targetCoord: HexCoord) => {
    const res = engine.queueBuilding(colonyId, buildingDefId, targetCoord);
    if (res.success) {
      setColonies([...engine.getColonies()]);
    } else if (res.reason) {
      notify('warning', `⚠ ${res.reason}`);
    }
  };

  const handleQueueUpgrade = (colonyId: string, buildingInstanceId: string) => {
    const res = engine.queueUpgrade(colonyId, buildingInstanceId);
    if (res.success) {
      setColonies([...engine.getColonies()]);
    } else if (res.reason) {
      notify('warning', `⚠ ${res.reason}`);
    }
  };

  const handleQueueUnit = (colonyId: string, unitDefId: string) => {
    const res = engine.queueUnit(colonyId, unitDefId);
    if (res.success) {
      setColonies([...engine.getColonies()]);
    } else if (res.reason) {
      notify('warning', `⚠ ${res.reason}`);
    }
  };

  const handleSetWorkFocus = (colonyId: string, focus: CitizenFocus) => {
    engine.setColonyWorkFocus(colonyId, focus);
    setColonies([...engine.getColonies()]);
  };

  const handleSetTaxRate = (colonyId: string, rate: number) => {
    engine.setColonyTaxRate(colonyId, rate);
    setColonies([...engine.getColonies()]);
    setPlayerCiv({ ...engine.getPlayerCiv() });
  };

  const handleSelectTech = (techId: string) => {
    engine.selectTech(techId);
    setPlayerCiv({ ...engine.getPlayerCiv() });
  };

  const refreshPlanetaryState = () => {
    setGalaxy({ ...engine.getGalaxy() });
    setSelectedSystem(engine.getSelectedSystem() ? { ...engine.getSelectedSystem()! } : null);
    setSelectedPlanet(engine.getSelectedPlanet() ? { ...engine.getSelectedPlanet()! } : null);
    setColonies([...engine.getColonies()]);
    setPlayerCiv({ ...engine.getPlayerCiv() });
  };

  const handlePlaceDistrict = (districtDefId: string, anchor: HexCoord) => {
    const activeCol = selectedPlanet ? engine.getColonyByPlanetId(selectedPlanet.id) : null;
    if (!activeCol) return;
    const res = engine.placeDistrict(activeCol.id, districtDefId, anchor);
    if (res.allowed) {
      refreshPlanetaryState();
    } else if (res.reason) {
      notify('warning', `⚠ ${res.reason}`);
    }
  };

  const handleRemoveDistrict = (districtId: string) => {
    const activeCol = selectedPlanet ? engine.getColonyByPlanetId(selectedPlanet.id) : null;
    if (!activeCol) return;
    const res = engine.removeDistrict(activeCol.id, districtId);
    if (res.success) {
      refreshPlanetaryState();
    } else if (res.reason) {
      notify('warning', `⚠ ${res.reason}`);
    }
  };

  const handleStartTerraforming = (options: { targetBiome?: HexBiome; targetAtmosphere?: AtmosphereType }) => {    if (!selectedPlanet) {
      return { allowed: false, reason: 'Kein Planet ausgewählt.' };
    }
    const res = engine.startTerraformingProject(selectedPlanet.id, options);
    if (res.allowed) {
      refreshPlanetaryState();
    }
    return res;
  };

  const handleCancelTerraforming = () => {
    if (!selectedPlanet) return false;
    const cancelled = engine.cancelTerraformingProject(selectedPlanet.id);
    if (cancelled) {
      refreshPlanetaryState();
    }
    return cancelled;
  };

  const playerColonies = colonies.filter((c) => c.civId === playerCiv.id);
  const logisticsRoutes = engine.getLogisticsManager().getRoutes();

  const handleCreateLogisticsRoute = (
    sourceColonyId: string,
    targetColonyId: string,
    freighterCount: number
  ) => {
    const res = engine.createLogisticsRoute(sourceColonyId, targetColonyId, freighterCount);
    if (res.allowed) {
      refreshPlanetaryState();
    }
    return res;
  };

  const handleToggleLogisticsRoute = (routeId: string, isActive: boolean) => {
    engine.setLogisticsRouteActive(routeId, isActive);
    refreshPlanetaryState();
  };

  const handleRemoveLogisticsRoute = (routeId: string) => {
    engine.removeLogisticsRoute(routeId);
    refreshPlanetaryState();
  };

  const galacticRoutes = engine.getGalacticTradeManager().getRoutes();
  const galacticConvoys = engine.getGalacticTradeManager().getConvoys();

  const handleCreateGalacticTradeRoute = (
    sourceColonyId: string,
    targetColonyId: string,
    resource: GalacticTradeResource,
    freighterCount: number
  ) => {
    const res = engine.createGalacticTradeRoute(
      sourceColonyId,
      targetColonyId,
      resource,
      freighterCount
    );
    if (res.allowed) {
      refreshPlanetaryState();
    }
    return res;
  };

  const handleToggleGalacticTradeRoute = (routeId: string, isActive: boolean) => {
    engine.setGalacticTradeRouteActive(routeId, isActive);
    refreshPlanetaryState();
  };

  const handleRemoveGalacticTradeRoute = (routeId: string) => {
    engine.removeGalacticTradeRoute(routeId);
    refreshPlanetaryState();
  };

  const handleSetGalacticTradeTariff = (routeId: string, tariffRate: number) => {
    const res = engine.setGalacticTradeTariff(routeId, tariffRate);
    if (res.allowed) {
      refreshPlanetaryState();
    }
    return res;
  };

  const handleSetGalacticTradeEscorts = (routeId: string, fleetIds: string[]) => {
    const res = engine.setGalacticTradeEscorts(routeId, fleetIds);
    if (res.allowed) {
      refreshPlanetaryState();
    }
    return res;
  };

  const diplomacyPairs = engine.getDiplomacyPairs();
  const empireOverview: EmpireOverview | null = engine.getEmpireOverview(playerCiv.id);
  const factionUnrestCount =
    empireOverview?.state.factions.filter((faction) => faction.loyalty < 30).length ?? 0;
  const narrativeOverview = engine.getNarrativeOverview(playerCiv.id);
  const pendingEventCount = narrativeOverview?.pendingEvent ? 1 : 0;
  const playerWarCount = diplomacyPairs.filter(
    (pair) =>
      pair.relation === 'war' &&
      (pair.civAId === playerCiv.id || pair.civBId === playerCiv.id)
  ).length;

  const civilizations = engine.getCivManager().getCivilizations();
  const playerFleets = engine.getFleetManager().getFleetsForCiv(playerCiv.id);
  const allFleets = engine.getFleetManager().getFleets();
  const selectedFleet = selectedFleetId
    ? (allFleets.find((fleet) => fleet.id === selectedFleetId) ?? null)
    : null;
  const fleetColorById: Record<string, string> = {};
  for (const civ of civilizations) {
    fleetColorById[civ.id] = civ.color;
  }
  const knownSystemIds = new Set(
    engine
      .getGalaxy()
      .systems.filter((system) => system.discoveryStatus !== 'unexplored')
      .map((system) => system.id),
  );
  // Fremde Verbände nur in erkundeten Systemen; eigene immer.
  const visibleGalaxyFleets = allFleets.filter(
    (fleet) => fleet.civId === playerCiv.id || knownSystemIds.has(fleet.systemId),
  );
  const systemFleets =
    viewMode === 'system' && selectedSystem
      ? engine.getVisibleFleetsForSystem(selectedSystem.id)
      : [];
  const previewRoute =
    selectedFleet && fleetTargetSystemId
      ? (engine.previewFleetRoute(selectedFleet.id, fleetTargetSystemId) ?? [])
      : [];
  // Rote Vorschau während der Routenplanung: folgt dem System unter dem
  // Mauszeiger und nutzt exakt dieselbe planRoute-Logik wie der Auftrag.
  const planningPreviewRoute =
    isRoutePlanning && selectedFleet && routeHoverSystemId
      ? (engine.previewFleetRoute(selectedFleet.id, routeHoverSystemId) ?? [])
      : [];
  const selectedFleetIsPlayer = canStartRoutePlanning(selectedFleet, playerCiv.id);
  const canPlanRoute = selectedFleetIsPlayer;

  // Routenplanung endet ohne Bewegung, sobald der Verband oder die Ansicht
  // wechselt. So kann kein alter Planungszustand einen Klick auslösen.
  useEffect(() => {
    if (!isRoutePlanning) return;
    if (appMode !== 'game' || viewMode !== 'galaxy' || !selectedFleetIsPlayer) {
      setIsRoutePlanning(false);
      setRouteHoverSystemId(null);
    }
  }, [isRoutePlanning, appMode, viewMode, selectedFleetIsPlayer]);
  // Ankunftsprognose: laufende Route bzw. Vorschau auf das ausgewählte Ziel.
  const selectedFleetEta = selectedFleet ? engine.getFleetEta(selectedFleet.id) : null;
  const pendingRouteEta =
    selectedFleet && fleetTargetSystemId
      ? engine.getFleetEtaToSystem(selectedFleet.id, fleetTargetSystemId)
      : null;
  const selectedFleetCiv = selectedFleet
    ? civilizations.find((civ) => civ.id === selectedFleet.civId)
    : undefined;
  const selectedFleetFaction = getHumanFaction(selectedFleetCiv?.factionId ?? '');
  const fleetDestinationName = selectedFleet?.destinationSystemId
    ? engine.getGalaxy().systems.find((system) => system.id === selectedFleet.destinationSystemId)?.name
    : undefined;
  const pendingTargetName = fleetTargetSystemId
    ? engine.getGalaxy().systems.find((system) => system.id === fleetTargetSystemId)?.name
    : undefined;

  const playerShipOrders = engine
    .getFleetManager()
    .getOrders()
    .filter((order) => order.civId === playerCiv.id);

  const handleBuildShip = (colonyId: string, shipDefId: string) => {
    const res = engine.buildShip(colonyId, shipDefId);
    if (res.allowed) {
      refreshPlanetaryState();
    }
    return res;
  };

  const handleCancelShipBuild = (orderId: string) => {
    const cancelled = engine.getFleetManager().cancelShipBuild(orderId);
    if (cancelled) {
      refreshPlanetaryState();
    }
    return cancelled;
  };

  const handleFleetMove = (fleetId: string, destinationSystemId: string) => {
    const res = engine.commandFleetMove(fleetId, destinationSystemId);
    if (res.allowed) {
      refreshPlanetaryState();
    }
    return res;
  };

  const handleDeclareWar = (otherCivId: string) => {
    const res = engine.declareWar(playerCiv.id, otherCivId);
    if (res.allowed) {
      setDiplomacyRevision((v) => v + 1);
    }
    return res;
  };

  const handleMakePeace = (otherCivId: string) => {
    const res = engine.makePeace(playerCiv.id, otherCivId);
    if (res.allowed) {
      setDiplomacyRevision((v) => v + 1);
    }
    return res;
  };

  const handleSetEmpirePolicy = (policy: EmpirePolicy) => {
    const res = engine.setEmpirePolicy(playerCiv.id, policy);
    if (res.success) {
      setEmpireFeedback(null);
      setEmpireRevision((v) => v + 1);
    } else {
      setEmpireFeedback(res.reason ?? 'Politikwechsel nicht möglich.');
    }
  };

  const handleResolveNarrativeChoice = (choiceId: string) => {
    const res = engine.resolveNarrativeChoice(playerCiv.id, choiceId);
    if (res.success) {
      setPlayerCiv({ ...engine.getPlayerCiv() });
      setNarrativeRevision((v) => v + 1);
    }
    return res;
  };

  const handleStartExcavation = (siteId: string) => {
    const res = engine.startExcavation(playerCiv.id, siteId);
    if (res.success) {
      setPlayerCiv({ ...engine.getPlayerCiv() });
      setNarrativeRevision((v) => v + 1);
    }
    return res;
  };

  const handleContributeToCrisis = () => {
    const res = engine.contributeToCrisis(playerCiv.id);
    if (res.success) {
      setPlayerCiv({ ...engine.getPlayerCiv() });
      setNarrativeRevision((v) => v + 1);
    }
    return res;
  };

  /**
   * Startet ein neues Spiel aus der Galaxie-Erstellung. Der Seed wird immer
   * zusammen mit Parametern und Generatorversion in der Bibliothek abgelegt.
   */
  const handleStartNewGame = (config: GalaxyConfig, options: StartGameOptions) => {
    notifications.clear();
    setSelectedFleetId(null);
    setEmpireFeedback(null);
    setIsNarrativeOpen(false);
    setIsVictoryOpen(false);
    setSandboxMode(false);
    const galaxy = engine.generateNewGalaxy(config);
    SeedLibrary.rememberGalaxy(galaxy);
    if (options.seedName) {
      // Eintrag ist über Seed + Parameter identifiziert (siehe seedConfigSignature).
      SeedLibrary.rename(seedConfigSignature(galaxy.config), options.seedName);
    }
    refreshSeeds();
    setAppMode('game');
    handleRefreshStateAfterLoad();
    // Startplatzierung kann bei kleinen Galaxien den Wunschabstand lockern.
    // Die Warnung kommt aus derselben Berechnung wie die tatsächliche Platzierung.
    for (const warning of engine.getStartPlacementWarnings()) {
      notify('warning', `⚠ ${warning}`);
    }
  };

  const handleStartFromSeed = (entry: SeedLibraryEntry) => {
    handleStartNewGame(SeedLibrary.configFor(entry), { seedName: entry.name });
  };

  const handleDeleteSeed = (id: string) => {
    SeedLibrary.remove(id);
    refreshSeeds();
  };

  const handleRenameSeed = (id: string, name: string): boolean => {
    const renamed = SeedLibrary.rename(id, name);
    if (renamed) refreshSeeds();
    return renamed;
  };

  const handleExitGame = () => {
    setAppMode('ended');
    // Im Browser lässt sich ein Tab nur schließen, wenn er per Skript geöffnet wurde.
    try {
      window.close();
    } catch {
      /* ignoriert – Abschiedsbildschirm bleibt sichtbar */
    }
  };

  const handleRefreshStateAfterLoad = () => {
    setGalaxy({ ...engine.getGalaxy() });
    setTurnState(engine.getTurnState());
    setColonies([...engine.getColonies()]);
    setUnits([...engine.getUnits()]);
    setPlayerCiv({ ...engine.getPlayerCiv() });
    setSelectedSystem(engine.getSelectedSystem());
    setSelectedPlanet(engine.getSelectedPlanet());
    setSelectedHexCoord(engine.getSelectedHexCoord());
    setSelectedUnit(engine.getSelectedUnit());
    setViewMode(engine.getActiveView());
    setIsNarrativeOpen(false);
    setIsVictoryOpen(false);
    setIsSaveModalOpen(false);
    setSandboxMode(false);
    // Ein geladener Endstand öffnet direkt den Abschlussbildschirm.
    if (engine.getOutcome().status !== 'ongoing') {
      setAppMode('gameOver');
    }
  };

  // Active tech name for top navbar
  const activeTechName = playerCiv.researchState.currentTechId
    ? TECHNOLOGY_CATALOG[playerCiv.researchState.currentTechId]?.name
    : undefined;

  // Selected tile for HexTileInspector
  const selectedTile =
    currentSurface && selectedHexCoord
      ? currentSurface.tiles.find(
          (t) => t.coord.q === selectedHexCoord.q && t.coord.r === selectedHexCoord.r
        ) ?? null
      : null;

  // Units stationed on selected tile
  const unitsOnSelectedTile = selectedHexCoord
    ? units.filter(
        (u) =>
          u.planetId === selectedPlanet?.id &&
          u.hexCoord.q === selectedHexCoord.q &&
          u.hexCoord.r === selectedHexCoord.r
      )
    : [];

  const activeColony = selectedPlanet ? engine.getColonyByPlanetId(selectedPlanet.id) : null;
  const activeColonyOwnerName = activeColony
    ? engine.getCivManager().getCivilizations().find((civ) => civ.id === activeColony.civId)?.name
    : undefined;
  const selectedSystemOwnerId = selectedSystem?.ownerFactionId ?? null;
  const selectedSystemOwnerName = selectedSystemOwnerId
    ? engine.getCivManager().getCivilizations().find((civ) => civ.id === selectedSystemOwnerId)?.name ??
      (selectedSystemOwnerId === 'faction-player-home' ? playerCiv.name : undefined)
    : undefined;

  // Modal-Kolonie stets aus dem aktuellen Bestand ableiten, damit sie nach
  // Speichern/Laden nicht auf ein veraltetes Objekt zeigt.
  const activeColonyForModal = useMemo(
    () => (activeColonyModalId ? colonies.find((c) => c.id === activeColonyModalId) ?? null : null),
    [activeColonyModalId, colonies]
  );

  // Planet der Modal-Kolonie: liefert Habitabilität und Geländetyp für die
  // Stadtansicht, ohne dass das Modal selbst die Galaxie durchsuchen muss.
  const activeColonyPlanet = useMemo(
    () =>
      activeColonyForModal
        ? engine
            .getGalaxy()
            .systems.flatMap((s) => s.planets)
            .find((p) => p.id === activeColonyForModal.planetId) ?? null
        : null,
    // engine.getGalaxy() ist stabil; Koloniewechsel genügt als Abhängigkeit.
    [activeColonyForModal]
  );

  // Zusammenfassung des lokalen Spielstands für das Hauptmenü. Wird bei jedem
  // Wechsel in das Menü neu aus dem Speicher gelesen.
  const quickSaveSummary = useMemo<QuickSaveSummary | null>(() => {
    if (appMode !== 'menu') return null;
    const data = SaveManager.loadFromLocalStorage();
    if (!data) return null;
    return {
      turn: data.turnState.currentTurn,
      turnDate: data.turnState.turnDateStandard,
      galaxyName: data.galaxy.name,
      systems: data.galaxy.systems.length,
      colonies: data.colonies?.length ?? 0,
      timestamp: data.timestamp,
    };
  }, [appMode, isSaveModalOpen]);

  const lastSeed = seedEntries[0] ?? null;

  if (appMode === 'testing') {
    return <TestLab onExit={() => setAppMode('menu')} />;
  }

  if (appMode === 'menu') {
    return (
      <>
        <MainMenu
          backgroundImageSrc={deepSpaceImage}
          quickSave={quickSaveSummary}
          lastSeed={lastSeed}
          seedCount={seedEntries.length}
          onNewGame={() => {
            setCreationTab('new');
            setAppMode('creation');
          }}
          onLoadGame={() => setIsSaveModalOpen(true)}
          onManageSeeds={() => setIsSeedLibraryOpen(true)}
          onOpenRoadmap={() => setIsRoadmapModalOpen(true)}
          onOpenTests={() => setIsTestModalOpen(true)}
          onOpenTesting={() => setAppMode('testing')}
          onExit={handleExitGame}
          onContinueLastSeed={() => {
            if (lastSeed) handleStartFromSeed(lastSeed);
          }}
        />

        <SaveLoadModal
          isOpen={isSaveModalOpen}
          onClose={() => setIsSaveModalOpen(false)}
          gameEngine={engine}
          onStateRestored={handleRefreshStateAfterLoad}
        />

        <SeedLibraryModal
          isOpen={isSeedLibraryOpen}
          seeds={seedEntries}
          onClose={() => setIsSeedLibraryOpen(false)}
          onStart={(entry) => {
            setIsSeedLibraryOpen(false);
            handleStartFromSeed(entry);
          }}
          onDelete={handleDeleteSeed}
          onRename={handleRenameSeed}
        />

        <TestRunnerModal isOpen={isTestModalOpen} onClose={() => setIsTestModalOpen(false)} />
        <PhaseRoadmapModal isOpen={isRoadmapModalOpen} onClose={() => setIsRoadmapModalOpen(false)} />
      </>
    );
  }

  if (appMode === 'creation') {
    return (
      <GalaxyCreationScreen
        backgroundImageSrc={deepSpaceImage}
        defaultConfig={galaxy.config}
        seeds={seedEntries}
        initialTab={creationTab}
        onBack={() => setAppMode('menu')}
        onStart={handleStartNewGame}
        onDeleteSeed={handleDeleteSeed}
      />
    );
  }

  if (appMode === 'gameOver') {
    const outcome = engine.getOutcome();
    return (
      <EndScreen
        outcome={outcome}
        backgroundImageSrc={deepSpaceImage}
        onContinue={outcome.status === 'victory' ? () => {
          setSandboxMode(true);
          setAppMode('game');
        } : undefined}
        onReturnToMenu={() => setAppMode('menu')}
        onNewGame={() => {
          setCreationTab('new');
          setAppMode('creation');
        }}
      />
    );
  }

  if (appMode === 'ended') {
    return (
      <div className="h-screen w-screen bg-slate-950 text-slate-100 flex items-center justify-center font-sans select-none">
        <div className="max-w-md text-center space-y-5 px-6">
          <div className="text-[10px] font-mono uppercase tracking-[0.4em] text-cyan-500/70">
            Astraea 4X
          </div>
          <h2 className="text-2xl font-mono uppercase tracking-widest text-slate-200">
            Sitzung beendet
          </h2>
          <p className="text-sm text-slate-400 leading-relaxed">
            Der Browser-Tab konnte nicht automatisch geschlossen werden. Dein letzter Spielstand
            bleibt im lokalen Speicher erhalten.
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => setAppMode('menu')}
              className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono cursor-pointer transition-colors"
            >
              Zum Hauptmenü
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded bg-cyan-600 hover:bg-cyan-500 text-slate-950 text-xs font-mono font-semibold cursor-pointer transition-colors"
            >
              Neu starten
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans select-none">
      {/* 3-Zone Top Navigation Bar */}
      <TopNavBar
        turnState={turnState}
        viewMode={viewMode}
        selectedSystemName={selectedSystem?.name}
        selectedPlanetName={selectedPlanet?.name}
        coloniesCount={playerColonies.length}
        activeTechName={activeTechName}
        onEndTurn={handleEndTurn}
        onSwitchToGalaxy={handleBackToGalaxy}
        onSwitchToSystem={() => {
          if (selectedSystem) {
            engine.enterSystemView(selectedSystem.id);
          }
        }}
        onSwitchToSurface={() => {
          if (selectedPlanet) {
            engine.enterSurfaceView(selectedPlanet.id);
          }
        }}
        onOpenLogistics={() => setIsLogisticsOpen(true)}
        isLogisticsOpen={isLogisticsOpen}
        activeLogisticsRoutes={logisticsRoutes.filter((r) => r.isActive).length}
        onOpenFleets={() => setIsFleetOpen(true)}
        isFleetOpen={isFleetOpen}
        fleetCount={playerFleets.length}
        onOpenEmpire={() => {
          setEmpireFeedback(null);
          setIsEmpireOpen(true);
        }}
        isEmpireOpen={isEmpireOpen}
        factionUnrestCount={factionUnrestCount}
        onOpenNarrative={() => setIsNarrativeOpen(true)}
        isNarrativeOpen={isNarrativeOpen}
        pendingEventCount={pendingEventCount}
        crisisStage={narrativeOverview?.crisis.stage}
        onOpenVictory={() => setIsVictoryOpen(true)}
        onOpenDiplomacy={() => setIsDiplomacyOpen(true)}
        isDiplomacyOpen={isDiplomacyOpen}
        warCount={playerWarCount}
        onOpenPlanetsOverview={() => setIsPlanetsOverviewOpen(true)}
        isPlanetsOverviewOpen={isPlanetsOverviewOpen}
        onOpenTechTree={() => setIsTechTreeOpen(true)}
        onOpenMessageLog={() => setIsMessageLogOpen(true)}
        unreadMessageCount={messageLogEntries.filter((entry) => !entry.read).length}
        onOpenColonyList={() => {
          const col = activeColony || colonies[0];
          if (col) {
            setActiveColonyModalId(col.id);
            setColonyModalTab('overview');
            setIsColonyModalOpen(true);
          }
        }}
        onOpenSaveLoad={() => setIsSaveModalOpen(true)}
        onReturnToMainMenu={() => setAppMode('menu')}
        onExitGame={handleExitGame}
      />

      {/* Main Split Console: 2D Canvas Viewport + Right Inspector */}
      <main className="flex-1 flex overflow-hidden relative">
        {/* Canvas Stage: Galaxy Map ↔ System Map ↔ Surface Hex Map */}
        <div className="flex-1 h-full relative">
          {viewMode === 'galaxy' ? (
            <GalaxyMapCanvas
              galaxy={galaxy}
              selectedSystem={selectedSystem}
              onSelectSystem={handleGalaxySystemClick}
              deepSpaceImageSrc={deepSpaceImage}
              tradeRoutes={galacticRoutes}
              tradeConvoys={galacticConvoys}
              fleets={visibleGalaxyFleets}
              civilizations={civilizations}
              selectedFleetId={selectedFleetId}
              onSelectFleet={(fleet) => {
                setSelectedFleetId(fleet?.id ?? null);
                setFleetTargetSystemId(null);
                setIsRoutePlanning(false);
                setRouteHoverSystemId(null);
              }}
              previewRouteSystemIds={previewRoute}
              isRoutePlanning={isRoutePlanning}
              plannedRouteSystemIds={planningPreviewRoute}
              onHoverSystem={(system) => {
                if (!isRoutePlanning) return;
                setRouteHoverSystemId(system?.id ?? null);
              }}
            />
          ) : viewMode === 'system' && selectedSystem ? (
            <SystemMapCanvas
              system={selectedSystem}
              selectedPlanet={selectedPlanet}
              onSelectPlanet={handleSelectPlanet}
              onBackToGalaxy={handleBackToGalaxy}
              deepSpaceImageSrc={deepSpaceImage}
              fleets={systemFleets}
              selectedFleetId={selectedFleetId}
              fleetColorById={fleetColorById}
              onSelectFleet={(fleetId) => {
                setSelectedFleetId(fleetId);
                setFleetTargetSystemId(null);
                setIsRoutePlanning(false);
                setRouteHoverSystemId(null);
              }}
            />
          ) : viewMode === 'surface' && selectedPlanet && currentSurface ? (
            <PlanetSurfaceCanvas
              planet={selectedPlanet}
              surface={currentSurface}
              colonies={colonies}
              units={units}
              selectedHexCoord={selectedHexCoord}
              selectedUnit={selectedUnit}
              onSelectHex={handleSelectHex}
              onSelectUnit={handleSelectUnit}
              onMoveUnitToHex={handleMoveUnitToHex}
              onOpenColonyManagement={handleOpenColonyManagement}
              onBackToSystem={handleLeaveSurface}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-slate-500 font-mono text-xs">
              Keine Ansicht aktiv.
            </div>
          )}

          {/* Zentraler Benachrichtigungsstapel (überlappungsfrei) */}
          <NotificationStack
            items={notificationItems}
            onDismiss={(id) => notifications.dismiss(id)}
          />

          {/* Schiffsleiste: gleiche Datenbasis wie Karte und Systemansicht. */}
          {viewMode !== 'surface' && selectedFleet && (
            <ShipInfoBar
              fleet={selectedFleet}
              systemName={
                engine.getGalaxy().systems.find((system) => system.id === selectedFleet.systemId)?.name
              }
              destinationName={fleetDestinationName}
              factionName={selectedFleetCiv?.name}
              factionColor={selectedFleetCiv?.color}
              rangeHops={engine.getFleetRangeForCiv(selectedFleet.civId)}
              rangeLabel={engine.getFleetRangeLabelForCiv(selectedFleet.civId)}
              etaTurns={selectedFleetEta?.turnsRemaining}
              etaHops={selectedFleetEta?.hopsRemaining}
              pendingTargetName={pendingTargetName}
              pendingRouteHops={pendingTargetName ? Math.max(0, previewRoute.length - 1) : undefined}
              pendingRouteEtaTurns={pendingTargetName ? pendingRouteEta?.turnsRemaining : undefined}
              canPlanRoute={canPlanRoute && viewMode === 'galaxy'}
              isRoutePlanning={isRoutePlanning}
              onStartRoutePlanning={handleStartRoutePlanning}
              onCancelRoutePlanning={stopRoutePlanning}
              onConfirmMove={
                pendingTargetName ? () => {
                  const fleet = findSelectedPlayerFleet();
                  const target = engine.getGalaxy().systems.find(
                    (system) => system.id === fleetTargetSystemId,
                  );
                  if (fleet && target && commitFleetDestination(fleet, target)) {
                    setFleetTargetSystemId(null);
                  }
                } : undefined
              }
              onClearTarget={() => setFleetTargetSystemId(null)}
              onCancelMovement={
                selectedFleet.status === 'moving'
                  ? () => {
                      engine.cancelFleetMovement(selectedFleet.id);
                      setFleetRevision((value) => value + 1);
                    }
                  : undefined
              }
              onClose={() => {
                setSelectedFleetId(null);
                setFleetTargetSystemId(null);
                setIsRoutePlanning(false);
                setRouteHoverSystemId(null);
              }}
            />
          )}
        </div>

        {/* Right Tactical Telemetry Panel */}
        {viewMode === 'galaxy' ? (
          <SystemInspector
            system={selectedSystem}
            allSystems={galaxy.systems}
            ownerName={selectedSystemOwnerName}
            onSelectSystem={handleSelectSystemFromList}
            onSurveySystem={handleSurveySystem}
            onOpenSystemMap={handleOpenSystemMap}
            onClose={() => engine.selectSystem(null)}
          />
        ) : viewMode === 'system' && selectedSystem ? (
          <PlanetInspector
            planet={selectedPlanet}
            system={selectedSystem}
            colony={activeColony}
            colonyShip={engine.getColonyShipForSystem(selectedSystem.id)}
            onSelectPlanet={handleSelectPlanet}
            onSurveyPlanet={handleSurveyPlanet}
            onFoundColony={handleFoundColony}
            onOpenSurface={handleEnterSurface}
            onOpenColonyManagement={handleOpenColonyManagement}
            onOpenTerraforming={() => setIsTerraformingOpen(true)}
            onUpgradeTier={handleUpgradeTier}
            colonyOwnerName={activeColonyOwnerName}
            onClose={() => engine.selectPlanet(null)}
          />
        ) : viewMode === 'surface' && currentSurface ? (
          <HexTileInspector
            tile={selectedTile}
            surface={currentSurface}
            colony={activeColony}
            unitsOnTile={unitsOnSelectedTile}
            selectedUnit={selectedUnit}
            completedTechIds={playerCiv.researchState.completedTechIds}
            onClaimHex={handleClaimHex}
            onOpenColonyManagement={handleOpenColonyManagement}
            onOpenBuildMenu={(coord) => {
              if (activeColony) {
                // Das angeklickte Hexfeld als Bauziel übernehmen, damit das
                // Baumenü direkt auf diesem Feld plant.
                engine.selectHex(coord);
                setActiveColonyModalId(activeColony.id);
                setColonyModalTab('queue');
                setIsColonyModalOpen(true);
              }
            }}
            onUpgradeBuilding={(instanceId) => {
              if (activeColony) {
                handleQueueUpgrade(activeColony.id, instanceId);
              }
            }}
            onPlaceDistrict={handlePlaceDistrict}
            onRemoveDistrict={handleRemoveDistrict}
            onSelectUnit={handleSelectUnit}
            onClose={() => engine.selectHex(null)}
          />
        ) : null}
      </main>

      {/* Interactive Modals */}
      <SaveLoadModal
        isOpen={isSaveModalOpen}
        onClose={() => setIsSaveModalOpen(false)}
        gameEngine={engine}
        onStateRestored={handleRefreshStateAfterLoad}
      />

      <TechTreeModal
        isOpen={isTechTreeOpen}
        civilization={playerCiv}
        onSelectTech={handleSelectTech}
        onClose={() => setIsTechTreeOpen(false)}
      />

      <PlanetsOverviewModal
        isOpen={isPlanetsOverviewOpen}
        onClose={() => setIsPlanetsOverviewOpen(false)}
        colonies={playerColonies}
        galaxy={galaxy}
        privateSector={engine.getPrivateSectorReport(playerCiv.id)}
        onEnterSurface={(planetId) => {
          engine.enterSurfaceView(planetId);
          setIsPlanetsOverviewOpen(false);
        }}
        onOpenColonyManagement={(colonyId) => {
          handleOpenColonyManagement(colonyId);
          setIsPlanetsOverviewOpen(false);
        }}
        onOpenSystem={(systemId) => {
          engine.enterSystemView(systemId);
          setIsPlanetsOverviewOpen(false);
        }}
      />

      <ColonyManagementModal
        isOpen={isColonyModalOpen}
        colony={activeColonyForModal}
        surface={activeColonyForModal ? engine.getSurfaceManager().getSurface(activeColonyForModal.planetId) : null}
        habitabilityPercent={activeColonyPlanet?.habitability}
        planetType={activeColonyPlanet?.planetType}
        targetHexForBuild={selectedHexCoord}
        initialTab={colonyModalTab}
        onClose={() => setIsColonyModalOpen(false)}
        onQueueBuilding={handleQueueBuilding}
        onQueueUpgrade={handleQueueUpgrade}
        onQueueUnit={handleQueueUnit}
        onSetWorkFocus={handleSetWorkFocus}
        treasury={playerCiv?.treasury ?? 0}
        onSetTaxRate={handleSetTaxRate}
        onUpgradeTier={handleUpgradeTier}
      />

      <TerraformingModal
        isOpen={isTerraformingOpen}
        planet={selectedPlanet}
        project={selectedPlanet ? engine.getTerraformingProject(selectedPlanet.id) : null}
        completedTechIds={playerCiv.researchState.completedTechIds}
        getRequiredEffort={(options) =>
          selectedPlanet ? engine.getTerraformingManager().calculateRequiredEffort(selectedPlanet, options) : 0
        }
        onStart={handleStartTerraforming}
        onCancel={handleCancelTerraforming}
        onChanged={refreshPlanetaryState}
        onClose={() => setIsTerraformingOpen(false)}
      />

      <LogisticsModal
        isOpen={isLogisticsOpen}
        colonies={playerColonies}
        routes={logisticsRoutes}
        fleets={engine.getLogisticsManager().getFleets()}
        galacticRoutes={galacticRoutes}
        galacticConvoys={galacticConvoys}
        completedTechIds={playerCiv.researchState.completedTechIds}
        onCreateRoute={handleCreateLogisticsRoute}
        onToggleRoute={handleToggleLogisticsRoute}
        onRemoveRoute={handleRemoveLogisticsRoute}
        escortFleets={playerFleets}
        onCreateGalacticRoute={handleCreateGalacticTradeRoute}
        onToggleGalacticRoute={handleToggleGalacticTradeRoute}
        onRemoveGalacticRoute={handleRemoveGalacticTradeRoute}
        onSetGalacticTariff={handleSetGalacticTradeTariff}
        onSetGalacticEscorts={handleSetGalacticTradeEscorts}
        onChanged={refreshPlanetaryState}
        onClose={() => setIsLogisticsOpen(false)}
      />

      <FleetModal
        isOpen={isFleetOpen}
        fleets={playerFleets}
        orders={playerShipOrders}
        battleReports={engine.getFleetManager().getBattleReports()}
        colonies={playerColonies}
        systems={galaxy.systems}
        completedTechIds={playerCiv.researchState.completedTechIds}
        civs={engine.getCivManager().getCivilizations()}
        onBuildShip={handleBuildShip}
        onCancelOrder={handleCancelShipBuild}
        onMoveFleet={handleFleetMove}
        onChanged={refreshPlanetaryState}
        onClose={() => setIsFleetOpen(false)}
      />

      <DiplomacyModal
        isOpen={isDiplomacyOpen}
        civs={engine.getCivManager().getCivilizations()}
        playerCivId={playerCiv.id}
        pairs={diplomacyPairs}
        currentTurn={turnState.currentTurn}
        onDeclareWar={handleDeclareWar}
        onMakePeace={handleMakePeace}
        onClose={() => setIsDiplomacyOpen(false)}
      />

      <EmpireModal
        isOpen={isEmpireOpen}
        overview={empireOverview}
        feedback={empireFeedback}
        onSetPolicy={handleSetEmpirePolicy}
        onClose={() => setIsEmpireOpen(false)}
      />

      <NarrativeModal
        isOpen={isNarrativeOpen}
        overview={narrativeOverview}
        onResolveChoice={handleResolveNarrativeChoice}
        onStartExcavation={handleStartExcavation}
        onContribute={handleContributeToCrisis}
        onClose={() => setIsNarrativeOpen(false)}
      />

      <VictoryModal
        isOpen={isVictoryOpen}
        overview={engine.getVictoryOverview()}
        onClose={() => setIsVictoryOpen(false)}
      />

      <MessageLogModal
        isOpen={isMessageLogOpen}
        entries={messageLogEntries}
        onClose={() => setIsMessageLogOpen(false)}
        onMarkRead={(id) => engine.getMessageLog().markRead(id)}
        onMarkAllRead={() => engine.getMessageLog().markAllRead()}
        onSelectTarget={(entry) => {
          if (!entry.target) return;
          if (entry.target.kind === 'system' || entry.target.kind === 'planet') {
            const system =
              entry.target.kind === 'system'
                ? engine.getGalaxy().systems.find((candidate) => candidate.id === entry.target!.id)
                : engine
                    .getGalaxy()
                    .systems.find((candidate) =>
                      (candidate.planets ?? []).some((planet) => planet.id === entry.target!.id),
                    );
            if (system) {
              engine.selectSystem(system.id);
              setIsMessageLogOpen(false);
            }
          }
        }}
      />

    </div>
  );
}
