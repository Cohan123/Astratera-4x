/**
 * Astraea 4X - Seed-Bibliothek (Verwaltung)
 *
 * Zeigt gespeicherte Galaxie-Seeds mit Parametern und Generatorversion.
 * Ein Eintrag beschreibt nur die Erzeugung, nie einen Spielstand.
 */

import React, { useState } from 'react';
import type { SeedLibraryEntry } from '../../save/seedLibrary.ts';

interface SeedLibraryModalProps {
  isOpen: boolean;
  seeds: SeedLibraryEntry[];
  onClose: () => void;
  onStart: (entry: SeedLibraryEntry) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => boolean;
}

export const SeedLibraryModal: React.FC<SeedLibraryModalProps> = ({
  isOpen,
  seeds,
  onClose,
  onStart,
  onDelete,
  onRename,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');

  if (!isOpen) return null;

  const startEditing = (entry: SeedLibraryEntry) => {
    setEditingId(entry.id);
    setDraftName(entry.name);
  };

  const commitRename = () => {
    if (editingId && onRename(editingId, draftName)) {
      setEditingId(null);
      setDraftName('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm select-none">
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col bg-slate-950 border border-slate-800 rounded-xl shadow-2xl font-sans">
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-slate-800">
          <div>
            <h3 className="text-lg font-bold text-slate-100">Galaxie-Seeds verwalten</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Gespeicherte Seeds enthalten Seed, Generatorparameter und Generatorversion.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 w-8 h-8 rounded flex items-center justify-center font-mono cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {seeds.length === 0 && (
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5 text-sm text-slate-400">
              Noch keine Seeds gespeichert. Beim Erschaffen einer neuen Galaxie kannst du den Seed
              automatisch ablegen.
            </div>
          )}

          {seeds.map((entry) => (
            <div
              key={entry.id}
              className="rounded-lg border border-slate-800 bg-slate-900/40 p-3.5 space-y-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {editingId === entry.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        value={draftName}
                        onChange={(event) => setDraftName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') commitRename();
                          if (event.key === 'Escape') setEditingId(null);
                        }}
                        className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                      />
                      <button
                        onClick={commitRename}
                        className="text-[11px] font-mono text-cyan-300 hover:text-cyan-200 cursor-pointer"
                      >
                        Speichern
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-[11px] font-mono text-slate-500 hover:text-slate-300 cursor-pointer"
                      >
                        Abbrechen
                      </button>
                    </div>
                  ) : (
                    <div className="text-sm text-slate-100 truncate">{entry.name}</div>
                  )}
                  <div className="text-xs font-mono text-cyan-300/90 break-all mt-0.5">{entry.seed}</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-0.5 mt-1.5 text-[10px] font-mono text-slate-500">
                    <span>Systeme: {entry.systemCount}</span>
                    <span>Form: {entry.config.shape}</span>
                    <span>Größe: {entry.config.size}</span>
                    <span>Abstand: {entry.config.minDistance} Lj</span>
                    <span>
                      Karte: {entry.config.width}×{entry.config.height}
                    </span>
                    <span>Gen: Galaxie v{entry.generatorVersion}</span>
                    <span>Oberfläche: v{entry.surfaceGeneratorVersion}</span>
                    <span>Erstellt: {new Date(entry.createdAt).toLocaleDateString('de-DE')}</span>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <button
                    onClick={() => onStart(entry)}
                    className="px-3 py-1.5 rounded bg-cyan-950/70 hover:bg-cyan-900/80 border border-cyan-800/70 text-cyan-200 text-[11px] font-mono font-semibold transition-colors cursor-pointer"
                  >
                    Starten
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => startEditing(entry)}
                      className="text-[10px] font-mono text-slate-500 hover:text-slate-200 cursor-pointer"
                    >
                      Umbenennen
                    </button>
                    <button
                      onClick={() => onDelete(entry.id)}
                      className="text-[10px] font-mono text-slate-500 hover:text-rose-400 cursor-pointer"
                    >
                      Löschen
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-between">
          <span className="text-[10px] font-mono text-slate-600 uppercase tracking-widest">
            {seeds.length} Einträge
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-mono cursor-pointer transition-colors"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
};
