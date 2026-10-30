/**
 * Astraea 4X - Nachrichtenverlauf
 *
 * Vollständig gespeicherter Verlauf aller Meldungen. Anders als die Popups
 * bleibt er dauerhaft verfügbar, lässt sich filtern und als gelesen markieren.
 * Der Verlauf wird vom NotificationCenter getrennt geführt, aber von derselben
 * Brücke gespeist, damit keine Duplikate entstehen.
 */

import React, { useMemo, useState } from 'react';
import type { MessageLogEntry } from '../../core/types.ts';
import type { NotificationCategory } from '../../core/notificationCenter.ts';

export interface MessageLogModalProps {
  /** Der Verlauf ist ein Journal und wird nur auf Wunsch geöffnet. */
  isOpen?: boolean;
  entries: MessageLogEntry[];
  onClose: () => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onSelectTarget?: (entry: MessageLogEntry) => void;
}

export const MESSAGE_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  build: 'Bau',
  recruit: 'Rekrutierung',
  research: 'Forschung',
  colony: 'Kolonie',
  exploration: 'Erkundung',
  fleet: 'Flotte',
  diplomacy: 'Diplomatie',
  warning: 'Warnung',
  turn: 'Runde',
  info: 'Info',
};

export const MESSAGE_CATEGORY_FILTERS: Array<{ id: 'all' | NotificationCategory; label: string }> = [
  { id: 'all', label: 'Alle' },
  { id: 'warning', label: 'Warnungen' },
  { id: 'build', label: 'Bau' },
  { id: 'colony', label: 'Kolonie' },
  { id: 'fleet', label: 'Flotte' },
  { id: 'research', label: 'Forschung' },
  { id: 'exploration', label: 'Erkundung' },
  { id: 'diplomacy', label: 'Diplomatie' },
];

function formatTimestamp(entry: MessageLogEntry): string {
  const date = new Date(entry.createdAt);
  if (Number.isNaN(date.getTime())) return `Runde ${entry.turn}`;
  return `Runde ${entry.turn} · ${date.toLocaleDateString('de-DE')} ${date.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

export const MessageLogModal: React.FC<MessageLogModalProps> = ({
  isOpen = true,
  entries,
  onClose,
  onMarkRead,
  onMarkAllRead,
  onSelectTarget,
}) => {
  const [filter, setFilter] = useState<'all' | NotificationCategory>('all');
  const [onlyUnread, setOnlyUnread] = useState(false);

  const visible = useMemo(
    () =>
      entries.filter((entry) => {
        if (filter !== 'all' && entry.category !== filter) return false;
        if (onlyUnread && entry.read) return false;
        return true;
      }),
    [entries, filter, onlyUnread],
  );

  const unreadCount = entries.reduce((sum, entry) => (entry.read ? sum : sum + 1), 0);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Nachrichtenverlauf"
        className="flex h-[min(42rem,calc(100%-2rem))] w-[min(52rem,100%)] flex-col overflow-hidden rounded-xl border border-slate-700/80 bg-slate-950 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b border-slate-800 px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-100">
            Nachrichtenverlauf
          </h2>
          <span className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] font-mono text-slate-400">
            {entries.length} gesamt · {unreadCount} ungelesen
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onMarkAllRead}
              disabled={unreadCount === 0}
              className="rounded border border-slate-700 px-2 py-1 text-[10px] font-mono text-slate-300 disabled:opacity-40 cursor-pointer"
            >
              Alle gelesen
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Nachrichtenverlauf schließen"
              className="text-sm font-mono text-slate-400 hover:text-slate-100 cursor-pointer"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-800 px-4 py-2">
          {MESSAGE_CATEGORY_FILTERS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setFilter(option.id)}
              className={`rounded px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide cursor-pointer ${
                filter === option.id
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/50'
                  : 'border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {option.label}
            </button>
          ))}
          <label className="ml-auto flex items-center gap-1 text-[10px] font-mono text-slate-400">
            <input
              type="checkbox"
              checked={onlyUnread}
              onChange={(event) => setOnlyUnread(event.target.checked)}
            />
            nur ungelesen
          </label>
        </div>

        <div className="flex-1 overflow-y-auto">
          {visible.length === 0 ? (
            <p className="p-6 text-center text-xs font-mono text-slate-500">
              Keine Meldungen im gewählten Filter.
            </p>
          ) : (
            <ul className="divide-y divide-slate-800/80">
              {visible.map((entry) => (
                <li key={entry.id} className={entry.read ? 'opacity-70' : ''}>
                  <button
                    type="button"
                    onClick={() => onMarkRead(entry.id)}
                    className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-slate-900/70 cursor-pointer"
                  >
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                        entry.read ? 'bg-slate-700' : 'bg-cyan-400'
                      }`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-xs font-semibold text-slate-100">
                          {entry.subject}
                        </span>
                        <span className="shrink-0 rounded border border-slate-800 px-1 text-[9px] font-mono uppercase text-slate-400">
                          {MESSAGE_CATEGORY_LABELS[entry.category] ?? entry.category}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-[11px] font-mono text-slate-400">
                        {entry.text}
                      </span>
                      <span className="mt-0.5 block text-[10px] font-mono text-slate-600">
                        {formatTimestamp(entry)} · {entry.read ? 'gelesen' : 'ungelesen'}
                        {entry.target ? ` · Ziel: ${entry.target.label ?? entry.target.id}` : ''}
                      </span>
                    </span>
                  </button>
                  {entry.target && onSelectTarget && (
                    <div className="px-9 pb-2">
                      <button
                        type="button"
                        onClick={() => onSelectTarget(entry)}
                        className="text-[10px] font-mono text-cyan-300 hover:text-cyan-100 cursor-pointer"
                      >
                        Zum Zielobjekt springen →
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
