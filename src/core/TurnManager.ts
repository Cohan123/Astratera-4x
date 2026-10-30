/**
 * Astraea 4X - Central Turn Manager
 * Manages game round progression, hooks, and notifies registered game modules.
 */
import { EventBus } from './EventBus.ts';
import { TurnState } from './types.ts';

export class TurnManager {
  private turn: number;
  private readonly startYear = 2380;
  private eventBus: EventBus;
  private turnHooks: Array<(turnState: TurnState) => void> = [];

  constructor(initialTurn: number = 1, eventBus: EventBus = EventBus.getInstance()) {
    this.turn = Math.max(1, initialTurn);
    this.eventBus = eventBus;
  }

  public getCurrentTurn(): number {
    return this.turn;
  }

  public getTurnState(): TurnState {
    return {
      currentTurn: this.turn,
      turnDateStandard: this.formatGalacticDate(this.turn),
      phase: 'player',
    };
  }

  /**
   * Advances the game to the next turn exactly once
   */
  public advanceTurn(): TurnState {
    const previousTurn = this.turn;
    this.turn += 1;
    const newState = this.getTurnState();

    // Notify registered direct hooks
    this.turnHooks.forEach((hook) => {
      try {
        hook(newState);
      } catch (e) {
        console.error('Error in turn hook:', e);
      }
    });

    // Broadcast globally via EventBus
    this.eventBus.emit('turn:changed', {
      currentTurn: this.turn,
      previousTurn,
      turnDateStandard: newState.turnDateStandard,
    });

    return newState;
  }

  /**
   * Sets the turn directly (used for Save/Load restoration)
   */
  public setTurn(turnNumber: number): TurnState {
    const previousTurn = this.turn;
    this.turn = Math.max(1, turnNumber);
    const newState = this.getTurnState();

    this.eventBus.emit('turn:changed', {
      currentTurn: this.turn,
      previousTurn,
      turnDateStandard: newState.turnDateStandard,
    });

    return newState;
  }

  /**
   * Registers a turn transition listener
   */
  public registerTurnHook(callback: (turnState: TurnState) => void): () => void {
    this.turnHooks.push(callback);
    return () => {
      this.turnHooks = this.turnHooks.filter((cb) => cb !== callback);
    };
  }

  /**
   * Formats a turn number into a sci-fi Galactic Standard Date
   * E.g. Turn 1 => "2380.01", Turn 12 => "2380.12", Turn 13 => "2381.01"
   */
  public formatGalacticDate(turn: number): string {
    const year = this.startYear + Math.floor((turn - 1) / 12);
    const month = ((turn - 1) % 12) + 1;
    return `${year}.${String(month).padStart(2, '0')}`;
  }
}
