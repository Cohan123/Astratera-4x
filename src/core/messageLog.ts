/**
 * Astraea 4X - Persistenter Nachrichtenverlauf
 *
 * Der Verlauf ist vom flüchtigen NotificationCenter getrennt: Popups
 * verschwinden nach zehn Sekunden, der Verlauf bleibt. Beide werden von
 * derselben Brücke gespeist und teilen denselben stabilen Schlüssel, damit
 * ein Ereignis niemals doppelt im Verlauf landet – auch nicht nach dem Laden.
 */

import type { MessageLogEntry, MessageTarget } from './types.ts';
import type { NotificationCategory } from './notificationCenter.ts';

export const MESSAGE_LOG_LIMIT = 250;

export interface MessageLogInput {
  category: NotificationCategory;
  message: string;
  key: string;
  turn: number;
  subject?: string;
  target?: MessageTarget;
  createdAt?: number;
}

/** Leitet einen kurzen Betreff aus dem Meldungstext ab. */
export function deriveSubject(message: string): string {
  const cleaned = message
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 'Spielmeldung';
  const sentenceEnd = cleaned.search(/[.!?]/);
  const shortened = sentenceEnd >= 0 ? cleaned.slice(0, sentenceEnd) : cleaned;
  return shortened.length > 72 ? `${shortened.slice(0, 71)}…` : shortened;
}

export class MessageLog {
  private entries: MessageLogEntry[] = [];
  private listeners = new Set<(entries: MessageLogEntry[]) => void>();
  private sequence = 0;

  public getEntries(): MessageLogEntry[] {
    return this.entries.map((entry) => ({ ...entry, target: entry.target ? { ...entry.target } : undefined }));
  }

  public getUnreadCount(): number {
    return this.entries.reduce((sum, entry) => (entry.read ? sum : sum + 1), 0);
  }

  public push(input: MessageLogInput): MessageLogEntry | null {
    if (this.entries.some((entry) => entry.key === input.key)) {
      return null;
    }

    this.sequence += 1;
    const entry: MessageLogEntry = {
      id: `msg-${this.sequence}-${input.category}`,
      category: input.category,
      subject: input.subject?.trim() || deriveSubject(input.message),
      text: input.message,
      turn: input.turn,
      createdAt: input.createdAt ?? Date.now(),
      read: false,
      key: input.key,
      target: input.target ? { ...input.target } : undefined,
    };

    this.entries = [entry, ...this.entries].slice(0, MESSAGE_LOG_LIMIT);
    this.emit();
    return { ...entry };
  }

  public markRead(id: string): boolean {
    const entry = this.entries.find((candidate) => candidate.id === id);
    if (!entry || entry.read) return false;
    entry.read = true;
    this.emit();
    return true;
  }

  public markUnread(id: string): boolean {
    const entry = this.entries.find((candidate) => candidate.id === id);
    if (!entry || !entry.read) return false;
    entry.read = false;
    this.emit();
    return true;
  }

  public markAllRead(): void {
    if (this.entries.every((entry) => entry.read)) return;
    for (const entry of this.entries) {
      entry.read = true;
    }
    this.emit();
  }

  public clear(): void {
    if (this.entries.length === 0) return;
    this.entries = [];
    this.sequence = 0;
    this.emit();
  }

  public toSnapshot(): MessageLogEntry[] {
    return this.getEntries();
  }

  /** Lädt den Verlauf in dasselbe Objekt, damit UI-Abonnements stabil bleiben. */
  public loadSnapshot(entries: readonly MessageLogEntry[] | undefined | null): void {
    this.entries = Array.isArray(entries)
      ? entries
          .filter(
            (entry): entry is MessageLogEntry =>
              !!entry &&
              typeof entry.id === 'string' &&
              typeof entry.key === 'string' &&
              typeof entry.text === 'string',
          )
          .map((entry) => ({
            ...entry,
            subject: entry.subject || deriveSubject(entry.text),
            read: Boolean(entry.read),
            target: entry.target ? { ...entry.target } : undefined,
          }))
          .slice(0, MESSAGE_LOG_LIMIT)
      : [];
    this.sequence = this.entries.length;
    this.emit();
  }

  public subscribe(listener: (entries: MessageLogEntry[]) => void): () => void {
    this.listeners.add(listener);
    listener(this.getEntries());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    const snapshot = this.getEntries();
    this.listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (error) {
        console.error('Fehler im Nachrichtenverlauf-Listener:', error);
      }
    });
  }
}
