/**
 * Astraea 4X - Benachrichtigungs-Stapel
 *
 * Zeigt Meldungen des zentralen NotificationCenter als vertikalen Stapel.
 * Jede Meldung ist ein eigenes Element mit fester Höhe und Abstand; dadurch
 * können sich mehrere Abschlüsse (Bau, Rekrutierung, Forschung) nicht
 * gegenseitig überdecken.
 *
 * Ablaufzeiten liegen hier in der UI – der Kern kennt keine Timer. Jede
 * Meldung verschwindet nach derselben festen Zeitspanne, unabhängig von ihrer
 * Kategorie, und lässt sich zusätzlich jederzeit manuell schließen. Der Timer
 * hängt nur an der stabilen Meldungs-ID, damit wechselnde Callback-Identitäten
 * ihn nicht neu starten.
 */

import React, { useEffect, useRef } from 'react';
import {
  GameNotification,
  NOTIFICATION_TTL_MS,
  NotificationCategory,
} from '../../core/notificationCenter.ts';

interface NotificationStackProps {
  items: GameNotification[];
  onDismiss: (id: string) => void;
}

const ICON_BY_CATEGORY: Record<NotificationCategory, string> = {
  build: '🏗',
  recruit: '🛡',
  research: '🔬',
  colony: '🏛',
  exploration: '🛰',
  fleet: '🛸',
  diplomacy: '🤝',
  warning: '⚠',
  turn: '⏱',
  info: 'ℹ',
};

const ACCENT_BY_CATEGORY: Record<NotificationCategory, string> = {
  build: 'border-cyan-500/70 bg-cyan-950/90 text-cyan-100',
  recruit: 'border-emerald-500/70 bg-emerald-950/90 text-emerald-100',
  research: 'border-violet-500/70 bg-violet-950/90 text-violet-100',
  colony: 'border-amber-500/70 bg-amber-950/90 text-amber-100',
  exploration: 'border-sky-500/70 bg-sky-950/90 text-sky-100',
  fleet: 'border-teal-500/70 bg-teal-950/90 text-teal-100',
  diplomacy: 'border-indigo-500/70 bg-indigo-950/90 text-indigo-100',
  warning: 'border-rose-500/80 bg-rose-950/90 text-rose-100',
  turn: 'border-slate-600/70 bg-slate-900/90 text-slate-200',
  info: 'border-slate-600/70 bg-slate-900/90 text-slate-200',
};

interface NotificationCardProps {
  item: GameNotification;
  onDismiss: (id: string) => void;
}

const NotificationCard: React.FC<NotificationCardProps> = ({ item, onDismiss }) => {
  const dismissRef = useRef(onDismiss);

  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  // Nur die stabile ID ist Abhängigkeit: Ein neuer Callback oder eine
  // Positionsänderung im Stapel startet die Zehn-Sekunden-Frist nicht neu.
  useEffect(() => {
    const timer = setTimeout(() => dismissRef.current(item.id), NOTIFICATION_TTL_MS);
    return () => clearTimeout(timer);
  }, [item.id]);

  return (
    <div
      role="status"
      data-notification-category={item.category}
      className={`pointer-events-auto w-full flex items-start gap-2.5 rounded-lg border px-3.5 py-2 shadow-2xl backdrop-blur-md ${ACCENT_BY_CATEGORY[item.category]}`}
    >
      <span className="text-sm leading-5 shrink-0" aria-hidden="true">
        {ICON_BY_CATEGORY[item.category]}
      </span>
      <span className="flex-1 text-xs font-mono leading-5 break-words">{item.message}</span>
      <button
        onClick={() => onDismiss(item.id)}
        aria-label="Benachrichtigung schließen"
        title="Schließen"
        className="shrink-0 text-current opacity-70 hover:opacity-100 text-xs font-mono leading-5 px-1 cursor-pointer"
      >
        ✕
      </button>
    </div>
  );
};

export const NotificationStack: React.FC<NotificationStackProps> = ({ items, onDismiss }) => {
  if (items.length === 0) return null;

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 w-[min(28rem,calc(100%-2rem))] flex flex-col gap-1.5 pointer-events-none">
      {items.map((item) => (
        <NotificationCard key={item.id} item={item} onDismiss={onDismiss} />
      ))}
    </div>
  );
};
