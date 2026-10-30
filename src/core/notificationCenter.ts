/**
 * Astraea 4X - Zentrales Benachrichtigungssystem
 *
 * Eine einzige Senke für abgeschlossene Aufträge (Bau, Rekrutierung,
 * Forschung, Kolonisation, Erkundung) sowie Warnungen. Der Kern ist bewusst
 * frei von Timern und UI: Die Darstellung entscheidet über Ablaufzeiten,
 * damit sich Meldungen nicht gegenseitig überschreiben.
 *
 * Duplikat-Schutz: Jede Meldung besitzt einen Schlüssel. Solange dieselbe
 * Meldung aktiv ist, wird sie nicht erneut eingereiht – dadurch entstehen
 * nach einem Spielstand-Laden keine doppelten Einträge.
 */

import type { MessageTarget } from './types.ts';

export type NotificationCategory =
  | 'build'
  | 'recruit'
  | 'research'
  | 'colony'
  | 'exploration'
  | 'fleet'
  | 'diplomacy'
  | 'warning'
  | 'turn'
  | 'info';

export interface GameNotification {
  id: string;
  category: NotificationCategory;
  message: string;
  /** Eindeutiger Schlüssel für den Duplikat-Schutz. */
  key: string;
  turn: number;
  createdAt: number;
}

export interface NotificationInput {
  category: NotificationCategory;
  message: string;
  /** Ohne Schlüssel wird die Meldung als eindeutig behandelt. */
  key?: string;
  turn?: number;
  /** Optionaler Betreff für den Nachrichtenverlauf. */
  subject?: string;
  /** Optionales Zielobjekt für die Navigation aus dem Verlauf. */
  target?: MessageTarget;
}

/** Obergrenze aktiver Meldungen (älteste fallen zuerst heraus). */
export const NOTIFICATION_LIMIT = 8;

/** Einheitliche Anzeigedauer aller Benachrichtigungen in Millisekunden. */
export const NOTIFICATION_TTL_MS = 10_000;

/**
 * Kategorien, die ohne Interaktion stehen bleiben. Seit der einheitlichen
 * Zehn-Sekunden-Regel leer; der Export bleibt für bestehende Aufrufer erhalten.
 */
export const STICKY_CATEGORIES: ReadonlySet<NotificationCategory> = new Set<NotificationCategory>();

export class NotificationCenter {
  private items: GameNotification[] = [];
  private listeners = new Set<(items: GameNotification[]) => void>();
  private sequence = 0;

  public getItems(): GameNotification[] {
    return this.items.map((item) => ({ ...item }));
  }

  /** Fügt eine Meldung hinzu; gibt null zurück, wenn sie ein Duplikat ist. */
  public push(input: NotificationInput): GameNotification | null {
    const key = input.key ?? `${input.category}:${input.message}`;
    if (this.items.some((item) => item.key === key)) {
      return null;
    }

    this.sequence += 1;
    const notification: GameNotification = {
      id: `notif-${this.sequence}-${input.category}`,
      category: input.category,
      message: input.message,
      key,
      turn: input.turn ?? 0,
      createdAt: Date.now(),
    };

    // Neueste zuerst, älteste werden bei Überlänge verdrängt.
    this.items = [notification, ...this.items].slice(0, NOTIFICATION_LIMIT);
    this.emit();
    return { ...notification };
  }

  public dismiss(id: string): boolean {
    const next = this.items.filter((item) => item.id !== id);
    if (next.length === this.items.length) return false;
    this.items = next;
    this.emit();
    return true;
  }

  /**
   * Entfernt eine Meldung anhand ihres stabilen Schlüssels. Wird genutzt,
   * wenn sich die Ursache erledigt hat (z. B. Fraktionsunruhe beigelegt).
   */
  public removeByKey(key: string): boolean {
    const next = this.items.filter((item) => item.key !== key);
    if (next.length === this.items.length) return false;
    this.items = next;
    this.emit();
    return true;
  }

  /**
   * Leert die Anzeige. Wird beim Laden eines Spielstands aufgerufen, damit
   * keine Meldungen aus der vorherigen Partie überleben.
   */
  public clear(): void {
    if (this.items.length === 0) return;
    this.items = [];
    this.emit();
  }

  public subscribe(listener: (items: GameNotification[]) => void): () => void {
    this.listeners.add(listener);
    listener(this.getItems());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    const snapshot = this.getItems();
    this.listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (error) {
        console.error('Fehler im Benachrichtigungs-Listener:', error);
      }
    });
  }
}
