/**
 * Astraea 4X - Save & Load Modal
 * Versioned persistence interface with localStorage quicksave, JSON export, and JSON file import.
 */

import React, { useRef, useState } from 'react';
import { GameEngine } from '../../core/GameEngine.ts';
import { SaveGameData } from '../../core/types.ts';
import { SaveManager } from '../../save/saveManager.ts';

interface SaveLoadModalProps {
  isOpen: boolean;
  onClose: () => void;
  gameEngine: GameEngine;
  onStateRestored: () => void;
}

export const SaveLoadModal: React.FC<SaveLoadModalProps> = ({
  isOpen,
  onClose,
  gameEngine,
  onStateRestored,
}) => {
  if (!isOpen) return null;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const hasQuickSave = SaveManager.hasSave();
  const currentSaveData = SaveManager.loadFromLocalStorage();

  const handleQuickSave = () => {
    const success = gameEngine.quickSave();
    if (success) {
      setFeedback({ message: 'Spielstand erfolgreich im Browser gespeichert!', type: 'success' });
    } else {
      setFeedback({ message: 'Fehler beim Speichern im LocalStorage.', type: 'error' });
    }
  };

  const handleQuickLoad = () => {
    const success = gameEngine.quickLoad();
    if (success) {
      setFeedback({ message: 'Spielstand erfolgreich wiederhergestellt!', type: 'success' });
      onStateRestored();
    } else {
      setFeedback({ message: 'Kein gültiger Spielstand im Browser gefunden.', type: 'error' });
    }
  };

  const handleExportJSON = () => {
    const payload = gameEngine.createSavePayload();
    SaveManager.downloadSaveFile(payload);
    setFeedback({ message: 'Spielstand-Datei (.json) heruntergeladen.', type: 'success' });
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const result = SaveManager.deserialize(text);

      if (result.success && result.data) {
        gameEngine.restoreFromSaveData(result.data);
        setFeedback({
          message: `Spielstand aus "${file.name}" (Runde ${result.data.turnState.currentTurn}) erfolgreich geladen!`,
          type: 'success',
        });
        onStateRestored();
      } else {
        setFeedback({ message: result.error || 'Datei konnte nicht geladen werden.', type: 'error' });
      }
    };
    reader.readAsText(file);
    // Reset file input value so same file can be reloaded if needed
    e.target.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm select-none">
      <div className="w-full max-w-lg bg-slate-950 border border-slate-800 rounded-xl shadow-2xl p-6 font-sans">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h3 className="text-lg font-bold text-slate-100">Spielstand verwalten</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Browser-Schnellspeicherung und versionierter JSON-Export/Import.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 w-8 h-8 rounded flex items-center justify-center font-mono cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Feedback Banner */}
        {feedback && (
          <div
            className={`mt-4 p-3 rounded-lg text-xs font-mono border flex items-center justify-between ${
              feedback.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
            }`}
          >
            <span>{feedback.message}</span>
            <button onClick={() => setFeedback(null)} className="ml-2 hover:opacity-75">
              ✕
            </button>
          </div>
        )}

        <div className="mt-5 space-y-4">
          {/* Browser QuickSave / QuickLoad Slot */}
          <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-lg">
            <div className="text-xs font-mono text-slate-400 uppercase mb-1">Lokaler Browser-Speicherplatz</div>
            {currentSaveData ? (
              <div className="text-xs font-mono text-slate-300 mb-3 space-y-0.5">
                <div>
                  <span className="text-slate-500">Stand:</span> Runde {currentSaveData.turnState.currentTurn} ({currentSaveData.turnState.turnDateStandard})
                </div>
                <div>
                  <span className="text-slate-500">Galaxie:</span> {currentSaveData.galaxy.name} ({currentSaveData.galaxy.systems.length} Systeme)
                </div>
                <div>
                  <span className="text-slate-500">Kolonien:</span> {currentSaveData.colonies?.length || 0} etabliert
                </div>
                <div>
                  <span className="text-slate-500">Zeitpunkt:</span> {new Date(currentSaveData.timestamp).toLocaleString('de-DE')}
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500 italic mb-3">Kein lokaler Speicherstand vorhanden.</div>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={handleQuickSave}
                className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded text-xs font-mono font-semibold transition-colors cursor-pointer"
              >
                Schnellspeichern
              </button>
              <button
                onClick={handleQuickLoad}
                disabled={!hasQuickSave}
                className={`flex-1 py-2 rounded text-xs font-mono font-semibold border transition-colors cursor-pointer ${
                  hasQuickSave
                    ? 'bg-cyan-950/70 hover:bg-cyan-900 text-cyan-300 border-cyan-800/60'
                    : 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed'
                }`}
              >
                Schnellladen
              </button>
            </div>
          </div>

          {/* JSON File Export / Import */}
          <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-lg">
            <div className="text-xs font-mono text-slate-400 uppercase mb-2">Datei Export & Import (JSON)</div>
            <p className="text-xs text-slate-400 mb-3 leading-normal">
              Sichere deinen Spielstand als versionierte Datei oder lade einen externen Spielstand von der Festplatte.
            </p>

            <div className="flex items-center gap-3">
              <button
                onClick={handleExportJSON}
                className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded text-xs font-mono font-semibold transition-colors cursor-pointer"
              >
                JSON Exportieren
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded text-xs font-mono font-semibold transition-colors cursor-pointer"
              >
                JSON Importieren...
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleImportFileChange}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end pt-5 border-t border-slate-800 mt-5">
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
