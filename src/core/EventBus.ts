/**
 * Astraea 4X - Decoupled Game Event Bus
 * Provides clean publish/subscribe mechanics without tight coupling between UI and game systems.
 */
import { Colony, CrisisOutcome, CrisisStage, DistrictInstance, EmpirePolicy, ExcavationSite, FactionId, Fleet, FleetBattleReport, FreighterFleetCargo, GalacticTradeResource, GalacticTradeRoute, Galaxy, HexCoord, LogisticsRoute, Planet, StarSystem, SurfaceUnit, TechnologyDef, TerraformingProject, ViewMode } from './types.ts';

export type GameEventMap = {
  'turn:changed': { currentTurn: number; previousTurn: number; turnDateStandard: string };
  'system:selected': { system: StarSystem | null };
  'system:surveyed': { systemId: string };
  'planet:selected': { planet: Planet | null };
  'planet:surveyed': { planetId: string; systemId: string };
  'colony:founded': { colony: Colony; planet: Planet; turn: number };
  'colony:failed': { planetId: string; reason: string };
  'colony:selected': { colony: Colony | null };
  'colony:focusChanged': { colonyId: string; focus: Colony['workFocus'] };
  'colony:tierChanged': {
    colonyId: string;
    previousTier: Colony['developmentTier'];
    newTier: Colony['developmentTier'];
    civId: string;
  };
  'colony:taxRateChanged': { colonyId: string; taxRate: number };
  'view:changed': { view: ViewMode; systemId: string | null; planetId?: string | null };
  'galaxy:generated': { galaxy: Galaxy };
  'game:saved': { saveName: string; timestamp: number };
  'game:loaded': { saveName: string; turn: number };
  'hex:selected': { coord: HexCoord | null };
  'unit:selected': { unit: SurfaceUnit | null };
  'unit:moved': { unit: SurfaceUnit; stepsTaken: number };
  'hex:claimed': { colonyId: string; coord: HexCoord; costPaid: number };
  'build:queued': { colonyId: string; buildingDefId?: string; buildingInstanceId?: string; unitDefId?: string };
  'build:completed': {
    colonyId: string;
    colonyName: string;
    civId: string;
    defId: string;
    /** Anzeigename des fertiggestellten Gebäudes bzw. Ausbaus. */
    name: string;
    projectType: 'building' | 'upgrade';
    turn: number;
  };
  'unit:recruited': {
    colonyId: string;
    colonyName: string;
    civId: string;
    unitDefId: string;
    unitName: string;
    turn: number;
  };
  'research:selected': { techId: string };
  'research:completed': { tech: TechnologyDef };
  'terraforming:started': { project: TerraformingProject; planetId: string };
  'terraforming:progress': { project: TerraformingProject; planetId: string; progressAdded: number; completed: boolean };
  'terraforming:completed': { project: TerraformingProject; planetId: string; planet: Planet };
  'terraforming:cancelled': { planetId: string };
  'logistics:route-created': { route: LogisticsRoute };
  'logistics:route-removed': { routeId: string };
  'logistics:fleet-departed': { fleetId: string; routeId: string; cargo: FreighterFleetCargo };
  'logistics:fleet-arrived': { fleetId: string; routeId: string; cargo: FreighterFleetCargo };
  'logistics:transfer': {
    routeId: string;
    sourceColonyId: string;
    targetColonyId: string;
    transferred: Record<'food' | 'minerals' | 'rareResources', number>;
    totalTransferred: number;
  };
  'galactic-trade:route-created': { route: GalacticTradeRoute };
  'galactic-trade:route-removed': { routeId: string };
  'galactic-trade:convoy-departed': { convoyId: string; routeId: string; cargo: FreighterFleetCargo };
  'galactic-trade:convoy-arrived': { convoyId: string; routeId: string; cargo: FreighterFleetCargo };
  'galactic-trade:transfer': {
    routeId: string;
    sourceColonyId: string;
    targetColonyId: string;
    resource: GalacticTradeResource;
    transferred: number;
    tariffCredits?: number;
  };
  'galactic-trade:route-tariff-changed': { routeId: string; tariffRate: number };
  'galactic-trade:route-escorts-changed': { routeId: string; escortFleetIds: string[] };
  'galactic-trade:route-blockaded': { routeId: string; blockadedSystemIds: string[] };
  'galactic-trade:route-unblockaded': { routeId: string };
  'district:placed': { colonyId: string; district: DistrictInstance };
  'district:removed': { colonyId: string; districtId: string };
  'fleet:created': { fleet: Fleet };
  'fleet:ship-built': { fleetId: string; shipDefId: string; colonyId: string; systemId: string };
  'fleet:movement-started': { fleetId: string; destinationSystemId: string; pathSystemIds: string[] };
  'fleet:movement-cancelled': { fleetId: string };
  'fleet:arrived': { fleet: Fleet };
  'fleet:removed': { fleetId: string };
  'fleet:battle': { report: FleetBattleReport };
  'diplomacy:war-declared': { civAId: string; civBId: string; turn: number };
  'diplomacy:peace-made': { civAId: string; civBId: string; turn: number; turnsAtWar: number };
  'empire:policy-changed': {
    civId: string;
    policy: EmpirePolicy;
    previousPolicy: EmpirePolicy;
    turn: number;
  };
  'empire:faction-unrest': {
    civId: string;
    factionId: FactionId;
    factionName: string;
    loyalty: number;
    turn: number;
  };
  'empire:faction-recovered': {
    civId: string;
    factionId: FactionId;
    factionName: string;
    loyalty: number;
    turn: number;
  };
  'narrative:excavation-discovered': {
    site: ExcavationSite;
    planetName: string;
    systemName: string;
    turn: number;
  };
  'narrative:excavation-started': {
    site: ExcavationSite;
    planetName: string;
    systemName: string;
    turn: number;
  };
  'narrative:excavation-completed': {
    site: ExcavationSite;
    planetName: string;
    systemName: string;
    credits: number;
    research: number;
    turn: number;
  };
  'narrative:event-pending': {
    civId: string;
    eventId: string;
    title: string;
    turn: number;
  };
  'narrative:event-resolved': {
    civId: string;
    eventId: string;
    title: string;
    choiceLabel: string;
    turn: number;
  };
  'narrative:crisis-started': { stage: CrisisStage; turn: number };
  'narrative:crisis-stage': {
    previousStage: CrisisStage;
    stage: CrisisStage;
    turn: number;
  };
  'narrative:crisis-contained': { containment: number; cost: number; turn: number };
  'narrative:crisis-resolved': { outcome: CrisisOutcome; turn: number };
};

export type EventCallback<T> = (payload: T) => void;

export class EventBus {
  private static instance: EventBus;
  private listeners: Map<keyof GameEventMap, Set<EventCallback<any>>> = new Map();

  private constructor() {}

  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  public on<K extends keyof GameEventMap>(event: K, callback: EventCallback<GameEventMap[K]>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const set = this.listeners.get(event)!;
    set.add(callback);

    // Return unbind handler
    return () => {
      set.delete(callback);
    };
  }

  public emit<K extends keyof GameEventMap>(event: K, payload: GameEventMap[K]): void {
    const set = this.listeners.get(event);
    if (set) {
      set.forEach((cb) => {
        try {
          cb(payload);
        } catch (err) {
          console.error(`Error in EventBus listener for "${String(event)}":`, err);
        }
      });
    }
  }

  public clear(): void {
    this.listeners.clear();
  }
}
