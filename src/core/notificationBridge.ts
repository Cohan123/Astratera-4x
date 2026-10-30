/**
 * Astraea 4X - Benachrichtigungs-Brücke
 *
 * Verbindet den EventBus mit dem zentralen NotificationCenter. Die gesamte
 * Textlogik liegt hier und nicht in React, damit Meldungen testbar bleiben und
 * mehrere Auslöser (Bau, Rekrutierung, Forschung, Kolonisation, Erkundung)
 * garantiert denselben Weg nehmen.
 *
 * Duplikat-Schutz: Jede Meldung erhält einen stabilen Schlüssel. Ein erneutes
 * Eintreffen desselben Ereignisses (z. B. doppelt geladener Spielstand) wird
 * verworfen, statt die Anzeige zu verdoppeln.
 */

import { getShipDef } from '../data/shipCatalog.ts';
import { COLONY_TIER_LABELS } from './colonyManager.ts';
import { EMPIRE_POLICIES } from './empireManager.ts';
import { EventBus } from './EventBus.ts';
import { MessageLog } from './messageLog.ts';
import { NotificationCenter, NotificationInput } from './notificationCenter.ts';

export interface NotificationBridgeResolvers {
  /** Name einer Kolonie anhand ihrer ID (Fallback: „Kolonie“). */
  resolveColonyName?: (colonyId: string) => string;
  /** Name eines Sternensystems anhand seiner ID. */
  resolveSystemName?: (systemId: string) => string;
  /** Name eines Planeten anhand seiner ID. */
  resolvePlanetName?: (planetId: string) => string;
  /** ID der Spielerzivilisation; KI-Ereignisse werden sonst ignoriert. */
  playerCivId?: string;
  /** Aktuelle Runde für die Meldungszuordnung. */
  currentTurn?: () => number;
  /** Optionaler persistenter Verlauf, der dieselben Meldungen erhält. */
  messageLog?: MessageLog;
}

const COLONY_FALLBACK = 'Kolonie';

/**
 * Abonniert alle spielrelevanten Ereignisse und schreibt sie in das
 * übergebene Center. Gibt eine Abmeldefunktion zurück.
 */
export function attachNotificationBridge(
  center: NotificationCenter,
  eventBus: EventBus = EventBus.getInstance(),
  resolvers: NotificationBridgeResolvers = {}
): () => void {
  const turn = () => resolvers.currentTurn?.() ?? 0;
  const colonyName = (colonyId: string) =>
    resolvers.resolveColonyName?.(colonyId) ?? COLONY_FALLBACK;
  const isPlayer = (civId?: string) =>
    !resolvers.playerCivId || civId === resolvers.playerCivId;

  /**
   * Eine Senke für Popup und Verlauf. Der Verlauf erhält nur Meldungen, die
   * das Center wirklich angenommen hat; dadurch entstehen keine Duplikate.
   */
  const record = (input: NotificationInput) => {
    const created = center.push(input);
    if (created && resolvers.messageLog) {
      resolvers.messageLog.push({
        category: input.category,
        message: input.message,
        key: created.key,
        turn: input.turn ?? turn(),
        subject: input.subject,
        target: input.target,
      });
    }
    return created;
  };

  const unsubscribe = [
    eventBus.on('turn:changed', (payload) => {
      record({
        category: 'turn',
        message: `Runde ${payload.currentTurn} begonnen (${payload.turnDateStandard})`,
        key: `turn:${payload.currentTurn}`,
        turn: payload.currentTurn,
      });
    }),

    eventBus.on('system:surveyed', (payload) => {
      const name = resolvers.resolveSystemName?.(payload.systemId);
      record({
        category: 'exploration',
        message: name
          ? `🛰 Systemerkundung abgeschlossen: ${name}.`
          : '🛰 Systemerkundung abgeschlossen: Neue Sternenkarte verfügbar.',
        key: `system-surveyed:${payload.systemId}`,
        turn: turn(),
        subject: name ? `Systemerkundung: ${name}` : 'Systemerkundung abgeschlossen',
        target: { kind: 'system', id: payload.systemId, label: name },
      });
    }),

    eventBus.on('planet:surveyed', (payload) => {
      const name = resolvers.resolvePlanetName?.(payload.planetId);
      record({
        category: 'exploration',
        message: name
          ? `🛰 Orbitalsonden-Scan abgeschlossen: ${name} vermessen.`
          : '🛰 Orbitalsonden-Scan abgeschlossen: Planetare Telemetrie aufgedeckt.',
        key: `planet-surveyed:${payload.planetId}`,
        turn: turn(),
        subject: name ? `Planet vermessen: ${name}` : 'Planet vermessen',
        target: { kind: 'planet', id: payload.planetId, label: name },
      });
    }),

    eventBus.on('colony:founded', (payload) => {
      if (!isPlayer(payload.colony.civId)) return;
      record({
        category: 'colony',
        message: `🏛 Neue Kolonie „${payload.colony.name}“ erfolgreich gegründet!`,
        key: `colony-founded:${payload.colony.id}`,
        turn: payload.turn ?? turn(),
        subject: `Kolonie gegründet: ${payload.colony.name}`,
        target: { kind: 'colony', id: payload.colony.id, label: payload.colony.name },
      });
    }),

    eventBus.on('colony:failed', (payload) => {
      record({
        category: 'warning',
        message: `⚠ Kolonisation fehlgeschlagen: ${payload.reason}`,
        key: `colony-failed:${payload.planetId}:${payload.reason}`,
        turn: turn(),
      });
    }),

    eventBus.on('hex:claimed', (payload) => {
      record({
        category: 'info',
        message: 'Territoriale Grenzausdehnung erfolgreich vollzogen.',
        key: `hex-claimed:${payload.colonyId}:${payload.coord.q},${payload.coord.r}`,
        turn: turn(),
      });
    }),

    eventBus.on('build:queued', (payload) => {
      record({
        category: 'info',
        message: 'Bauauftrag in die Koloniewarteschlange aufgenommen.',
        key: `build-queued:${payload.colonyId}:${payload.buildingDefId ?? payload.buildingInstanceId ?? payload.unitDefId ?? 'unbekannt'}`,
        turn: turn(),
        subject: 'Bauauftrag eingereiht',
        target: { kind: 'colony', id: payload.colonyId, label: colonyName(payload.colonyId) },
      });
    }),

    eventBus.on('build:completed', (payload) => {
      if (!isPlayer(payload.civId)) return;
      record({
        category: 'build',
        message: `🏗 Bau abgeschlossen: ${payload.name} in ${payload.colonyName}.`,
        key: `build-completed:${payload.colonyId}:${payload.defId}:${payload.turn}`,
        turn: payload.turn,
        subject: `Bau abgeschlossen: ${payload.name}`,
        target: { kind: 'colony', id: payload.colonyId, label: payload.colonyName },
      });
    }),

    eventBus.on('unit:recruited', (payload) => {
      if (!isPlayer(payload.civId)) return;
      record({
        category: 'recruit',
        message: `🛡 Einheit rekrutiert: ${payload.unitName} in ${payload.colonyName}.`,
        key: `unit-recruited:${payload.colonyId}:${payload.unitDefId}:${payload.turn}`,
        turn: payload.turn,
        subject: `Einheit rekrutiert: ${payload.unitName}`,
        target: { kind: 'colony', id: payload.colonyId, label: payload.colonyName },
      });
    }),

    eventBus.on('research:completed', (payload) => {
      record({
        category: 'research',
        message: `🔬 Technologie erforscht: ${payload.tech.name}!`,
        key: `research-completed:${payload.tech.id}`,
        turn: turn(),
        subject: `Technologie erforscht: ${payload.tech.name}`,
        target: { kind: 'research', id: payload.tech.id, label: payload.tech.name },
      });
    }),

    eventBus.on('colony:tierChanged', (payload) => {
      if (!isPlayer(payload.civId)) return;
      record({
        category: 'colony',
        message: `⬆ '${colonyName(payload.colonyId)}' aufgewertet zu ${COLONY_TIER_LABELS[payload.newTier]}.`,
        key: `tier-changed:${payload.colonyId}:${payload.newTier}`,
        turn: turn(),
        subject: `Kolonie aufgewertet: ${colonyName(payload.colonyId)}`,
        target: { kind: 'colony', id: payload.colonyId, label: colonyName(payload.colonyId) },
      });
    }),

    eventBus.on('fleet:ship-built', (payload) => {
      const shipName = getShipDef(payload.shipDefId)?.name ?? payload.shipDefId;
      const systemName = resolvers.resolveSystemName?.(payload.systemId);
      record({
        category: 'build',
        message: systemName
          ? `🚀 Schiff fertiggestellt: ${shipName} in ${systemName}.`
          : `🚀 Schiff fertiggestellt: ${shipName}.`,
        key: `ship-built:${payload.fleetId}:${payload.shipDefId}:${turn()}`,
        turn: turn(),
        subject: `Schiff fertiggestellt: ${shipName}`,
        target: { kind: 'fleet', id: payload.fleetId, label: systemName },
      });
    }),

    eventBus.on('fleet:arrived', (payload) => {
      const systemName = resolvers.resolveSystemName?.(payload.fleet.systemId);
      record({
        category: 'fleet',
        message: systemName
          ? `🛸 ${payload.fleet.name} hat ${systemName} erreicht.`
          : `🛸 ${payload.fleet.name} hat das Zielsystem erreicht.`,
        key: `fleet-arrived:${payload.fleet.id}:${payload.fleet.systemId}`,
        turn: turn(),
        subject: `Flotte angekommen: ${payload.fleet.name}`,
        target: { kind: 'fleet', id: payload.fleet.id, label: payload.fleet.name },
      });
    }),

    eventBus.on('empire:policy-changed', (payload) => {
      if (!isPlayer(payload.civId)) return;
      const policyName = EMPIRE_POLICIES[payload.policy]?.name ?? payload.policy;
      record({
        category: 'diplomacy',
        message: `🏛 Neue Reichspolitik: ${policyName}.`,
        key: `empire-policy:${payload.civId}:${payload.turn}`,
        turn: payload.turn,
        subject: `Reichspolitik: ${policyName}`,
        target: { kind: 'faction', id: payload.civId },
      });
    }),

    eventBus.on('empire:faction-unrest', (payload) => {
      if (!isPlayer(payload.civId)) return;
      record({
        category: 'warning',
        message: `⚠ Fraktionsunruhe: ${payload.factionName} (Loyalität ${payload.loyalty}).`,
        key: `faction-unrest:${payload.civId}:${payload.factionId}`,
        turn: payload.turn,
        subject: `Fraktionsunruhe: ${payload.factionName}`,
        target: { kind: 'faction', id: payload.factionId, label: payload.factionName },
      });
    }),

    eventBus.on('empire:faction-recovered', (payload) => {
      if (!isPlayer(payload.civId)) return;
      // Die Warnung aus der Unruhe-Phase verschwindet, sobald sich die
      // Fraktion wieder beruhigt hat.
      center.removeByKey(`faction-unrest:${payload.civId}:${payload.factionId}`);
      record({
        category: 'diplomacy',
        message: `🤝 Fraktionsunruhe beigelegt: ${payload.factionName} (Loyalität ${payload.loyalty}).`,
        key: `faction-recovered:${payload.civId}:${payload.factionId}:${payload.turn}`,
        turn: payload.turn,
        subject: `Fraktionsunruhe beigelegt: ${payload.factionName}`,
        target: { kind: 'faction', id: payload.factionId, label: payload.factionName },
      });
    }),

    eventBus.on('narrative:excavation-discovered', (payload) => {
      if (payload.site.discoveredByCivId !== resolvers.playerCivId && resolvers.playerCivId) {
        return;
      }
      record({
        category: 'exploration',
        message: `🔎 Ausgrabungsstätte entdeckt: ${payload.site.name} auf ${payload.planetName} (${payload.systemName}).`,
        key: `excavation-discovered:${payload.site.id}`,
        turn: payload.turn,
        subject: `Ausgrabungsstätte: ${payload.site.name}`,
        target: { kind: 'planet', id: payload.site.planetId, label: payload.planetName },
      });
    }),

    eventBus.on('narrative:excavation-started', (payload) => {
      record({
        category: 'info',
        message: `⛏ Ausgrabung begonnen: ${payload.site.name} auf ${payload.planetName}.`,
        key: `excavation-started:${payload.site.id}:${payload.turn}`,
        turn: payload.turn,
        subject: `Ausgrabung begonnen: ${payload.site.name}`,
        target: { kind: 'planet', id: payload.site.planetId, label: payload.planetName },
      });
    }),

    eventBus.on('narrative:excavation-completed', (payload) => {
      if (payload.site.completedByCivId !== resolvers.playerCivId && resolvers.playerCivId) {
        return;
      }
      record({
        category: 'research',
        message: `🏺 Ausgrabung abgeschlossen: ${payload.site.name} (+${payload.credits} ◈, +${payload.research} Forschung).`,
        key: `excavation-completed:${payload.site.id}:${payload.turn}`,
        turn: payload.turn,
        subject: `Ausgrabung abgeschlossen: ${payload.site.name}`,
        target: { kind: 'planet', id: payload.site.planetId, label: payload.planetName },
      });
    }),

    eventBus.on('narrative:event-pending', (payload) => {
      if (!isPlayer(payload.civId)) return;
      record({
        category: 'warning',
        message: `📜 Entscheidung erforderlich: ${payload.title}. Öffne die Chronik.`,
        key: `narrative-event:${payload.civId}`,
        turn: payload.turn,
        subject: `Entscheidung erforderlich: ${payload.title}`,
        target: { kind: 'faction', id: payload.civId, label: payload.title },
      });
    }),

    eventBus.on('narrative:event-resolved', (payload) => {
      if (!isPlayer(payload.civId)) return;
      center.removeByKey(`narrative-event:${payload.civId}`);
      record({
        category: 'diplomacy',
        message: `📜 ${payload.title}: ${payload.choiceLabel}.`,
        key: `narrative-event-resolved:${payload.civId}:${payload.eventId}:${payload.turn}`,
        turn: payload.turn,
        subject: `Entscheidung getroffen: ${payload.title}`,
        target: { kind: 'faction', id: payload.civId, label: payload.title },
      });
    }),

    eventBus.on('narrative:crisis-started', (payload) => {
      center.removeByKey('narrative-crisis:active');
      record({
        category: 'warning',
        message: `🌌 Galaktische Krise: Ein Signal durchläuft die Hyperlanes. Die Chronik dokumentiert den Beginn.`,
        key: 'narrative-crisis:active',
        turn: payload.turn,
        subject: 'Galaktische Krise begonnen',
      });
    }),

    eventBus.on('narrative:crisis-stage', (payload) => {
      center.removeByKey('narrative-crisis:active');
      record({
        category: 'warning',
        message: `🌌 Die Krise erreicht eine neue Stufe: ${payload.stage}.`,
        key: 'narrative-crisis:active',
        turn: payload.turn,
        subject: `Galaktische Krise: ${payload.stage}`,
      });
    }),

    eventBus.on('narrative:crisis-contained', (payload) => {
      record({
        category: 'diplomacy',
        message: `🛡 Eindämmung verstärkt: ${payload.containment} / 100 (−${payload.cost} ◈).`,
        key: `narrative-crisis-contained:${payload.turn}:${payload.containment}`,
        turn: payload.turn,
        subject: 'Eindämmung verstärkt',
      });
    }),

    eventBus.on('narrative:crisis-resolved', (payload) => {
      center.removeByKey('narrative-crisis:active');
      const text =
        payload.outcome === 'contained'
          ? 'Die Krise ist eingedämmt. Das Reich lernt aus den Vorläufern.'
          : payload.outcome === 'embraced'
            ? 'Das Reich hat die Krise angenommen.'
            : 'Die Krise klingt ab – die Vorläufer bleiben unverstanden.';
      record({
        category: 'warning',
        message: `🌌 ${text}`,
        key: `narrative-crisis-resolved:${payload.outcome ?? 'unknown'}`,
        turn: payload.turn,
        subject: 'Galaktische Krise beendet',
      });
    }),

    // Beim Laden verschwinden alle Meldungen der vorherigen Partie. Das
    // verhindert doppelte Einträge, wenn derselbe Spielstand erneut geladen wird.
    eventBus.on('game:loaded', () => {
      center.clear();
    }),
  ];

  return () => unsubscribe.forEach((off) => off());
}
