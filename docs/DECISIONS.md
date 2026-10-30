# Astraea 4X – Architectural Decision Records (ADR)

Dieses Dokument erfasst die wichtigsten technischen und architektonischen Entscheidungen in Phase 1 (Modul 1 bis Modul 4).

---

## ADR-001: Technologiewahl & Engine-Architektur

### Kontext
Für das langfristige 4X-Strategiespiel wurde die Wahl der Basistechnologie evaluiert. Zur Auswahl standen:
1. Native Engines (z. B. Godot 4 via WebAssembly/GDScript).
2. Webbasierte Full-Stack/SPA-Technologien (React 19 + TypeScript + Vite + HTML5 Canvas).

### Entscheidung
Wir haben uns für **TypeScript mit React 19, Vite und einem spezialisierten HTML5 2D-Canvas** entschieden.

### Begründung
- **Laufzeit- und Ausführungssicherheit:** Sofortige, reibungslose Ausführung in jedem modernen Webbrowser ohne WebAssembly-Kompilierzeiten oder proprietäre Browser-Plugins.
- **Entkoppelte Testbarkeit:** Die Spiellogik (`GameEngine`, `TurnManager`, `GalaxyGenerator`, `PlanetGenerator`) ist in reinem TypeScript formuliert. Sie benötigt keinen DOM und lässt sich in Millisekunden via Vitest isoliert testen.
- **Leistung der 2D-Karte:** HTML5 Canvas mit Subpixel-Rendering meistert Hunderte von Sternen, Orbits und Planeten bei 60 FPS mit Frustum Culling und Hardwarebeschleunigung.
- **Reichhaltiges UI-Ökosystem:** Komplexe 4X-Menüs (Inspektoren, Baulisten, Tech-Bäume) lassen sich mit deklarativen Komponenten und Tailwind CSS wartbar und zugänglich strukturieren.

---

## ADR-002: Deterministischer Seeded PRNG (Mulberry32)

### Kontext
Ein 4X-Spiel benötigt für Multiplayer, Debugging und Spieler-Austausch eine 100% reproduzierbare Kartengenerierung. Das native `Math.random()` ist nicht seedbar.

### Entscheidung
Implementierung eines 32-Bit **Mulberry32 PRNG** mit String-Hashing (FNV-1a).

### Begründung
- Identischer Seed + identische Konfiguration erzeugen auf jedem Gerät bitgenau dieselben Koordinaten, Sternentypen, Namen und Planetenslots.
- Hohe statistische Entropie bei minimalem Speicherbedarf.

---

## ADR-003: Raum-Sampling & Mindestabstands-Validierung

### Kontext
Reiner Zufall führt zu dicht gedrängten, unleserlichen Sternenhaufen und überlappenden Klickzielen auf der Galaxy-Karte.

### Entscheidung
Nutzung von parametrisiertem **Rejection-Sampling** mit Mindestabstandsradius (`minDistance` 45–80 Lj) und dynamischer Relaxation im Grenzfall.

### Begründung
- Garantiert strategisch lesbare Abstände zwischen Systemen.
- Verhindert visuelles Cluttering und Klick-Mehrdeutigkeiten.
- Unterstützt organische Galaxieformen (Spirale, Elliptisch, Ring, Cluster).

---

## ADR-004: Entkopplung durch EventBus & TurnManager

### Kontext
Häufiger Fehler in Strategiespielen ist die enge Kopplung zwischen Karteninteraktionen, Rundenwechseln und Menüs, was zu Spaghetti-Code und schwer testbaren Zuständen führt.

### Entscheidung
Einführung eines **zentralen `TurnManager`** und eines **typisierten `EventBus`**.

### Begründung
- Der `TurnManager` steuert die Runden hochgradig kontrolliert (Rundenzahl erhöht sich atomar um 1).
- Subsysteme (UI, Statistik, spätere KI-Reiche und narrative Ereignisse) abonnieren Ereignisse wie `turn:changed`, `view:changed` oder `planet:surveyed`, ohne dass die Engine direkte Referenzen auf sie halten muss.

---

## ADR-005: Versioniertes Speicher- und Datenmodell

### Kontext
Wenn in späteren Phasen Planeten, Kolonien oder Flotten hinzukommen, dürfen alte Spielstände nicht unkontrolliert abstürzen.

### Entscheidung
Einführung eines versionierten Schemas in `SaveManager`; aktueller Stand seit ADR-052: `CURRENT_SAVE_VERSION = 5` (zuvor 4).

### Begründung
- Bei jedem Ladevorgang wird die Schema-Version geprüft; Spielstände mit höherer Version werden abgelehnt („Speicherdatei stammt aus einer neueren Version").
- Version 1 wird beim Laden automatisch migriert (Ergänzung des `civilizations`-Arrays), damit Spielstände aus Modul 1–3 weiterhin ladbar bleiben.
- Version 2 persistiert zusätzlich den Modul-4-Zustand: Planetenoberflächen, Einheiten, Forschungs- und Zivilisationsdaten.
- Version 3 persistiert zusätzlich echte Monde (`Planet.moons`) und Asteroidengürtel (`StarSystem.asteroidBelts`); v2-Spielstände erhalten leere Gürtel und deterministisch aus `moonsCount` abgeleitete Legacy-Monde (ADR-031).
- Duale Persistenz: Schnellspeichern im `localStorage` sowie universeller JSON-Dateiexport/-import für Backup und Archivierung.

---

## ADR-006: Isolierte Zufallsströme für Planetengenerierung

### Kontext
In Modul 2 erhalten Sternensysteme detaillierte Planeten. Wenn die Planeten aller Systeme aus demselben sequentiellen Zufallsstrom wie die Galaxie erzeugt würden, würde jede kleinste Änderung an einem System die Planeten aller nachfolgenden Systeme verändern.

### Entscheidung
Nutzung deterministisch abgeleiteter, isolierter Zufallsströme:
`const systemSeed = `${galaxySeed}:${systemId}:planets`;`

### Begründung
- Vollständige Unabhängigkeit der Einzelsysteme: Ein System mit der ID `SYS-0005` erzeugt immer exakt dieselben Planeten, unabhängig davon, in welcher Reihenfolge Systeme generiert oder inspiziert werden.
- Garantiert maximale Modularität und Fehlertoleranz beim Laden partieller Datenstände.

---

## ADR-007: Logarithmisch-progressive Orbit-Skalierung für Systemkarten

### Kontext
In realen Sonnensystemen liegen Planeten astronomisch weit auseinander (Merkur bei 0.39 AU, Neptun bei 30.0 AU). Eine lineare Pixel-Projektion würde innere Gesteinsplaneten zu einem unklickbaren Punkt zusammenquetschen, während Gasriesen weit außerhalb des Bildschirms lägen.

### Entscheidung
Darstellung der Orbitbahnen mit einer **progressiven Abstandsfunktion**:
$\text{Radius}_{px} = (100 + (\text{OrbitIndex} - 1) \times 65) \times \text{Zoom}$. Die realen AU-Werte werden parallel als Datenfeld gespeichert und als Telemetrie angezeigt.

### Begründung
- Optimale Übersichtlichkeit und Lesbarkeit aller Planeten (*Master of Orion*-Vorbild).
- Klickziele und Namen überlappen sich nicht.
- Klare Trennung zwischen physikalischen Daten und visueller Präsentation.

---

## ADR-008: Granulare Habitabilitäts-Faktorenmatrix mit 5-Stufen-Klassifikation

### Kontext
In 4X-Spielen ist eine undurchsichtige Prozentzahl oft frustrierend für Spieler, wenn nicht verständlich ist, warum ein Planet 35% oder 85% Bewohnbarkeit aufweist. Zudem benötigt die Spielmechanik klare Schwellenwerte für Kolonisierungsregeln.

### Entscheidung
Einführung des `HabitabilityEvaluator`, der einen 0–100% Score aus einzelnen gewichteten Parametern errechnet (Atmosphäre, Temperatur, Flüssigwasser, Schwerkraft, Strahlung, Krustentyp) und diesen in 5 feste Klassen (`ideal`, `moderate`, `harsh`, `hostile`, `uninhabitable`) einteilt. Jeder Parameter wird dem Spieler als transparenter Faktor mit positiver/negativer Auswirkung offengelegt.

### Begründung
- Hohe strategische Transparenz für den Spieler (*Civilization*- & *Stellaris*-Vorbild).
- Gasriesen (0%) und tödliche kosmische Strahlung erhalten klare logische Barrieren.
- Liefert die Kostenbasis für Terraforming-Projekte (ADR-016) und spätere Schutzschild-Technologien.

---

## ADR-009: Zweistufige Kolonisations-Validierung und atomare Zustandsbindung

### Kontext
Vor der Gründung einer Kolonie muss sichergestellt sein, dass Spielregeln nicht durch Klick-Race-Conditions oder unvollständige Scans verletzt werden. Des Weiteren müssen Planet, Sternensystem und die Kolonienliste synchron gehalten werden.

### Entscheidung
Zentralisierung aller Prüfungen in `ColonizationValidator.canColonize()` und Durchführung der Gründung über `ColonyManager.foundColony()`.
- Bei Gründung werden atomar aktualisiert:
  - `planet.colonizationStatus = 'colonized'`
  - `planet.colonyId = colonyId`
  - `system.discoveryStatus = 'colonized'`
  - `Colony`-Entität mit ID, Gründungsrunde, 1.000 Kolonisten und Bauslotkapazität wird gespeichert.
- Globales Ereignis `colony:founded` benachrichtigt UI, Karten-Renderer und Save-System.

### Begründung
- Keine inkonsistenten Zustände zwischen UI und Datenmodell.
- Mehrfachgründungen auf demselben Planeten werden programmatisch verhindert.
- Das Speichern und Laden kann den Zustand verlässlich wiederherstellen.

---

## ADR-010: Deterministische, versionierte Hex-Oberflächengenerierung

### Kontext
Modul 4 benötigt pro Planet eine begehbare Oberfläche. Diese muss bei identischem Seed bitgenau reproduzierbar sein, darf aber unabhängig von Galaxie- und Systemdaten weiterentwickelt werden, ohne bestehende Spielstände oder Tests unbemerkt zu verändern.

### Entscheidung
Eigener `SurfaceGenerator` mit expliziter Generatorversion:
`const surfaceSeed = `${galaxySeed}:${planet.id}:surface:v${GENERATOR_VERSION}`;`
- `GENERATOR_VERSION = 1`, feste Standardmaße 18 × 10 Hexfelder.
- 10 Biome, Höhenstufen, Rohstoffvorkommen und Gefahren werden aus dem planetspezifischen Strom gezogen.
- Tiles starten mit `visibility: 'unseen'` (Fog of War) und `terraformedStatus: 'native'`.

### Begründung
- Ein Planet ist ein isolierter Zufallsstrom (konsistent zu ADR-006): Änderungen an anderen Planeten verschieben seine Oberfläche nicht.
- Die Version im Seed erlaubt eine bewusste Neu-Generierung bei Regeländerungen, ohne stillschweigend alte Karten zu verändern.
- Deterministische Oberflächen sind Voraussetzung für reproduzierbare Save/Load- und KI-Tests.

---

## ADR-011: Tile-basierte Kolonieökonomie mit Arbeitskraft-Zuteilung

### Kontext
Kolonieerträge müssen strategisch steuerbar und für den Spieler nachvollziehbar sein, statt aus einer undurchsichtigen Gesamtformel zu entstehen.

### Entscheidung
`EconomyEngine` bewertet jedes beanspruchte Hexfeld einzeln. `allocateCitizenWorkforce` verteilt die Bevölkerung anhand des `workFocus` (`balanced` u. a.) auf die ertragreichsten Tiles, wobei das Koloniezentrum automatisch versorgt wird.
- Sieben Ressourcen: Nahrung, Produktion, Energie, Mineralien, seltene Ressourcen, Forschung, Einfluss.
- Energiedefizit senkt die Effizienz um 25 %.
- Bevölkerungswachstum über `calculateGrowthRequired`: `50 × popUnits^1.3`.

### Begründung
- Jede Ertrragsänderung ist auf konkrete Tiles und Zuteilungen zurückführbar.
- Vollständig deterministisch und ohne UI-Abhängigkeit testbar.
- Bildet die direkte Grundlage für Bauwarteschlange, Forschung und Logistikrouten (ADR-017) sowie für Distrikt-Erträge (ADR-018).

---

## ADR-012: Sequentielle Single-Projekt-Bauwarteschlange

### Kontext
Mehrere parallel laufende Bauprojekte pro Kolonie erschweren Produktionsbindung, Determinismus und Speicherlogik erheblich.

### Entscheidung
`colony.buildQueue` wird strikt sequentiell abgearbeitet: Nur `buildQueue[0]` erhält Produktion. `BuildQueueManager.advanceQueue` addiert `max(1, productionPoints)`, schließt das Projekt bei Erreichen von `requiredProduction` ab und erzeugt atomar Gebäudeinstanz, Upgrade oder Einheit.
- Materialkosten werden bereits beim Einplanen abgezogen.
- Bauplätze müssen im Territorium der Kolonie liegen, frei sein und die Biome-Regeln der Gebäudedefinition erfüllen.
- Upgrades kosten 75 % der Basis-Mineralien bzw. 80 % der Basis-Produktion multipliziert mit der Zielstufe.

### Begründung
- Klare, jederzeit erklärbare Produktionsbindung ohne Parallel-Baustellen-Explosion.
- Einfache und robuste Save-/Load-Semantik (eine aktive Investition pro Kolonie).
- Fehlerfälle (fremdes Territorium, belegtes Feld, unzulässiges Biom) werden zentral und mit klaren Meldungen abgewiesen.

---

## ADR-013: Hex-basierte Einheitenbewegung mit Geländekosten

### Kontext
Einheiten müssen sich auf der Planetenoberfläche regelbasiert und reproduzierbar bewegen, ohne dass Pfad- oder Kostenlogik im Renderer landet.

### Entscheidung
`UnitManager` stellt ausschließlich statische Operationen bereit (`createUnit`, `refreshUnitMovement`, `resetTurnMovement`, `moveUnitAlongPath`). Bewegung erfolgt entlang eines Hex-Pfades; die Kosten pro Schritt stammen aus dem `BIOME_CATALOG`. Einheiten sind über `planetId` und `hexCoord` an eine Oberfläche gebunden; Bewegungspunkte werden zu Rundenbeginn zurückgesetzt.

### Begründung
- Die gesamte Bewegungslogik bleibt in reinem TypeScript und damit ohne DOM testbar.
- Renderer und UI konsumieren nur Zustand und Ergebnisse.
- Die Struktur ist offen für spätere Frachter-, Flotten- und Kampfmechaniken.

---

## ADR-014: KI nutzt dieselben Regel-Validatoren wie der Spieler

### Kontext
Eine KI mit eigenen Sonderpfaden führt schnell zu Regelabweichungen, schwer reproduzierbaren Bugs und Ungerechtigkeit gegenüber dem Spieler.

### Entscheidung
`CivManager.executeAITurns` verwendet ausschließlich die öffentlichen Spielregeln:
- `ResearchManager.getAvailableTechs` / `selectTech` für Forschung,
- `ColonyExpansion.canClaimHex` / `claimHex` für Territorium (ab 25 Einfluss),
- `BuildQueueManager.queueBuilding` für Bauprojekte.

### Begründung
- Ein einziges Regelwerk für Spieler und KI verhindert Divergenz.
- Jede KI-Aktion ist implizit durch die bereits getesteten Validatoren abgesichert.
- Neue Regeln wirken automatisch für alle Parteien.

---

## ADR-015: Save-Schema v2 mit expliziter Migration

### Kontext
Mit Modul 4 wächst der persistente Zustand um Oberflächen, Einheiten sowie Forschungs- und Zivilisationsdaten. Bestehende Spielstände aus Modul 1–3 dürfen dabei nicht unbrauchbar werden.

### Entscheidung
`CURRENT_SAVE_VERSION = 2` in `SaveManager`.
- Beim Laden wird `version === 1` explizit auf v2 migriert (u. a. Ergänzung des `civilizations`-Arrays).
- Versionen größer als 2 werden mit klarer Fehlermeldung abgelehnt.
- Gespeichert werden Galaxie, Rundenstatus, Kolonien, Planetenoberflächen, Einheiten sowie Forschungs- und Zivilisationszustand.

### Begründung
- Der vollständige Modul-4-Zustand ist verlustfrei persistierbar.
- Alte Spielstände bleiben ohne manuellen Eingriff ladbar.
- Eine harte Ablehnung neuerer Versionen verhindert stille Datenkorruption durch unbekannte Felder.

---

## ADR-016: Terraforming als ressourcenfinanziertes Langzeitprojekt pro Planet

### Kontext
Planeten mit geringer Habitabilität sollen langfristig aufwertbar sein, ohne die bestehenden Kolonisierungsregeln aufzuweichen. Gleichzeitig muss der Zustand deterministisch, speicherbar und für Spieler wie KI identisch prüfbar bleiben.

### Entscheidung
Terraforming wird als eigenständiges Projekt pro Planet in `TerraformingManager` modelliert.
- `TerraformingProject` hält `planetId`, optionales `targetBiome`/`targetAtmosphere`, `progress` und `totalRequired`.
- Nur transformierbare Biome (`desert`, `tundra`, `volcanic`, `toxic`, `impact_crater`) und Planeten mit fester Oberfläche sind zulässig; die Technologie `atmospheric_scrubbers` schaltet das System frei.
- Die Kosten skalieren mit der aktuellen Habitabilität (`240 + max(0, 100 − Habitabilität) · 8`) plus Aufschlägen für Biom- und Atmosphärenziel; der Fortschritt speist sich aus der Produktion der zugehörigen Kolonie.
- Bei Abschluss werden Biom und/oder Atmosphäre gesetzt, die Oberfläche neu bewertet und `terraforming:*`-Events ausgelöst; Projekte werden im Spielstand persistiert.

### Begründung
- Ein Projekt pro Planet bleibt deterministisch, testbar und ohne Parallelkonflikte.
- Die Habitabilitätskopplung macht schlechte Planeten teuer, aber nicht unmöglich.
- Die Event-Anbindung erlaubt UI-Updates ohne Kopplung an den Manager.

---

## ADR-017: Logistikrouten als deterministischer Frachtertransfer zwischen Kolonien

### Kontext
Kolonien produzieren unterschiedliche Überschüsse. Ein automatischer Ausgleich zwischen eigenen Kolonien soll Mikromanagement reduzieren, ohne eine vollständige Handels- oder Flottensimulation vorwegzunehmen.

### Entscheidung
`LogisticsManager` verwaltet gerichtete Routen zwischen zwei aktiven Kolonien derselben Zivilisation.
- Jede Route hat `freighterCount` (1–5), `capacityPerTurn = Frachter · 15` und ein `isActive`-Flag.
- Die Technologie `planetary_logistics_prep` schaltet das System frei; Duplikate und Selbstverbindungen werden abgelehnt.
- Pro Runde und Ressource (`food`, `minerals`, `rareResources`) gilt: verfügbar ist der Bestand abzüglich einer Reserve, Bedarf der Abstand zum Zielbestand des Ziels; transferiert wird das Minimum aus beidem und der Restkapazität.
- `advanceTurn` läuft in `endTurn` vor dem Autosave und emittiert `logistics:transfer` nur bei tatsächlichem Transfer.

### Begründung
- Der Transfer ist rein deterministisch und ohne Zufall oder Reihenfolgeabhängigkeit testbar.
- Reserven verhindern, dass Quellkolonien durch Automatik verhungern.
- Die Route bleibt eine abstrakte Kapazität und lässt sich später um echte Frachterflotten (Phase 4) erweitern.

---

## ADR-018: Multi-Tile-Distrikte als datengetriebene Flächenbelegung

### Kontext
Das Gebäudesystem belegt genau ein Hexfeld pro Bauwerk. Spezialisierungen wie Wohn-, Industrie-, Agrar- oder Forschungsviertel sollen mehrere Felder beanspruchen, ohne die bestehende Ein-Gebäude-pro-Tile-Logik zu ersetzen oder ein neues Save-Schema zu erzwingen.

### Entscheidung
Distrikte werden als eigener, kataloggetriebener Belegungstyp neben Gebäuden modelliert.
- `DistrictDef` (`src/data/districtCatalog.ts`) beschreibt `footprint` als relative Hex-Offsets, Kosten (`mineralCost`, `rareCost`), `energyUpkeep`, `yieldsPerTurn` und ein optionales `requiredTechId`; der Katalog umfasst vier Distrikte mit 2–3 Feldern.
- Der Zustand liegt ausschließlich in `Colony.districts` (`DistrictInstance` mit `id`, `districtDefId`, `anchor`, `coveredHexKeys`, `placedTurn`); `PlanetHexTile.districtInstanceId` ist ein abgeleiteter Marker für Rendering und Kollisionsprüfung, keine zweite Quelle der Wahrheit.
- `DistrictManager` ist zustandslos und statisch: `canPlaceDistrict` validiert in fester Reihenfolge Katalog-ID, Kolonie, Technologie, Flächenzuschnitt, Oberflächen- und Territoriumsgrenzen, Stadtzentrum, Gebäude, bestehende Distrikte, Duplikate und Lagerbestände; die deutschen Ablehnungsgründe sind stabil und UI-unabhängig.
- `placeDistrict` zieht Mineralien und seltene Ressourcen aus dem `stockpile` ab, markiert die Felder, setzt `isWorked = false` und bereinigt `workedHexKeys`; `removeDistrict` erstattet keine Kosten, entfernt aber Marker über `clearSurfaceMarkers`.
- Die Distrikt-ID wird deterministisch als `dist_${colonyId}_${districtDefId}_${q}_${r}` gebildet; `syncSurfaceMarkers` rekonstruiert Marker nach Save-Restore, sodass Save-Schema v2 unverändert bleibt.
- `calculateDistrictYields` summiert die Distrikterträge und wird in `EconomyEngine.calculateYields` nach den Tile-Erträgen und vor dem Bürgerverbrauch angewendet; `district:placed`/`district:removed` melden Änderungen.

### Begründung
- Die Trennung von Katalog, Koloniezustand und Tile-Marker hält Platzierung, Abriss und Save-Migration deterministisch und testbar.
- Relative Footprints erlauben neue Distrikte ohne Änderungen an der Belegungslogik.
- Der Verzicht auf ein neues Save-Schema vermeidet eine weitere Migration, da beide neuen Felder optional sind.
- Die statische Manager-API entspricht Terraforming und Logistik und bleibt damit konsistent zur übrigen Phase-2-Architektur.

---

## ADR-019: Habitabilitätsabhängiges Bevölkerungswachstum

### Kontext
Die Habitabilität eines Planeten beeinflusst über `EconomyEngine.calculateYields` bereits die Nahrungserträge (Faktor 0,4–1,0). Das Bevölkerungswachstum hingegen nutzte bislang ausschließlich den Netto-Nahrungsüberschuss, sodass eine lebensfeindliche Welt mit künstlicher Nahrungsproduktion genauso schnell wuchs wie eine ideale. Ein Wachstumsfaktor musste her, ohne die bestehende Defizit-/Hungerlogik oder das Save-Schema zu verändern.

### Entscheidung
Das Wachstum wird um einen habitabilitätsabhängigen Multiplikator ergänzt.
- `EconomyEngine.calculateGrowthMultiplier(planetHabitabilityPercent)` ist statisch und rein: `max(0,25, clamp(habitability, 0, 100) / 100)`. 100 % Habitabilität bedeuten volles Wachstum, feindliche Welten behalten eine Untergrenze von 25 %, nie 0; Werte über 100 % werden auf 1 begrenzt.
- Der Multiplikator wirkt ausschließlich auf den positiven Zuwachs von `growthFoodProgress` in `simulateTurnEconomy`; die Hungerstrafe (`deficit * 2`) und der Verbrauch bleiben unverändert.
- Der Fortschritt wird auf zwei Dezimalstellen gerundet, damit Summen über viele Runden deterministisch und testbar bleiben. Es werden keine neuen Save-Felder eingeführt.
- `ColonyManagementModal` erhält die optionale Prop `habitabilityPercent` und zeigt den Faktor neben dem Wachstumsbalken; `App.tsx` löst den Planeten über `getGalaxy()` auf.

### Begründung
- Die Untergrenze verhindert Stillstand auf habitabilitätsschwachen Planeten und hält Terraforming als Verbesserungspfad attraktiv.
- Die Beschränkung auf positives Wachstum erhält die bestehende Hungermechanik und vermeidet eine doppelte Bestrafung.
- Die reine Funktion ist isoliert testbar (Grenzwerte, Monotonie) und wird durch zwei Integrationstests gegen reale `simulateTurnEconomy`-Läufe abgesichert.

---

## ADR-020: Frachterflotten als echte Entitäten der Logistikrouten

### Kontext
ADR-017 hat Logistikrouten als abstrakte Kapazität modelliert: `capacityPerTurn` wird pro Runde sofort zwischen Quelle und Ziel transferiert. Für Phase 2 fehlte damit jede Vorstellung von Standort, Reisezeit und Rückweg; gleichzeitig sollte kein Kampf- oder Kriegsschiffsystem entstehen. Frachter mussten also sichtbar und zeitlich gebunden werden, ohne die bestehende Transfer-, Reserve- und Zielbestandslogik zu verdoppeln.

### Entscheidung
Jede Route spawnt deterministische Einzelfrachter, die den Transfer tragen.
- `FreighterFleet` (`src/core/types.ts`) besitzt `id`, `routeId`, `sourceColonyId`, `targetColonyId`, `status` (`'loading' | 'outbound' | 'inbound'`), `progress`, `travelTurns`, `maxCapacity` (15) und `cargo` (Nahrung, Mineralien, seltene Rohstoffe).
- Die Anzahl ergibt sich aus `route.freighterCount`, geklemmt auf 1–5; die ID ist `fleet_${routeId}_${n}`. `LogisticsManager` hält die Flotten in einer eigenen Map und bietet `getFleets`, `getFleetsForRoute`, `loadFleets` und `calculateInTransit`.
- `advanceTurn` läuft in vier Phasen: Rückflüge beenden, Beladen/Abfahrt, laufende Ausflüge fortschreiben, Summaries emittieren. Nur Beladen und Abfahrt sind durch `route.isActive` sowie den Status beider Kolonien gegated; bereits fliegende Frachter liefern auch nach einer Deaktivierung weiter.
- `loadCargo` verteilt die gemeinsame Kapazität eines Frachters in fester Ressourcenreihenfolge über `min(Kapazität, verfügbar über Reserve, Bedarf inkl. bereits im Transit befindlicher Fracht)`. Die Quelle wird beim Beladen belastet, `deliver` addiert die Fracht beim Ziel und nullt das Cargo.
- Nach der Lieferung wechselt der Frachter auf `'inbound'` mit `progress = 0`; ein vollständiger Umlauf dauert damit `2 × travelTurns`. Bei `travelTurns = 1` bleibt es wie bisher bei genau einem Transfer pro Runde.
- `travelTurns` wird über einen injizierten Resolver aus der Galaxiedistanz berechnet (`Math.hypot` der Systemkoordinaten, Skalierung `max(200, minDistance × 4)`), auf 1–20 geklemmt und bei fehlenden Systemen oder nicht-finitem Ergebnis auf 1 zurückgeführt.
- Persistenz: `SaveGameData.freighterFleets?` ist optional; `loadRoutes` spawnt Default-Flotten, `loadFleets` ersetzt sie vollständig. `GameEngine` stellt die Reihenfolge `loadRoutes` → `loadFleets` sicher.
- `LogisticsModal` zeigt je Route Frachterzahl, unterwegs befindliche, zurückkehrende und im Hafen wartende Frachter sowie die im Transit befindliche Fracht.

### Begründung
- Frachter erben die bestehende Bedarfslogik, statt eine zweite Transferregel einzuführen; Reserven und Zielbestände bleiben unverändert gültig.
- Der deterministische Spawn und die rein zählende Simulation halten Spielstände reproduzierbar und ohne Zufall.
- Der Rückweg erzeugt die gewünschte Reisezeit, ohne die Rundentransferrate auf Langstrecken unkontrolliert zu senken.
- Das optionale Save-Feld vermeidet eine Schema-Migration; ältere Stände erhalten automatisch Default-Flotten.
- Kein Kampf-, Schadens- oder Kriegsschiffmodell: Frachter bleiben reine Logistikentitäten und lassen Phase 4 unberührt.

---

## ADR-021: Technologie-DAG mit doktrinären Tier-4-Spezialisierungen

### Kontext
Der Technologiekatalog kannte bereits `prerequisites`, prüfte aber nur deren Existenz. Es gab keinen Zyklus-Schutz, keine Konsistenz zwischen Voraussetzungs- und Technologie-Stufe, keine gemeinsame Validierung und keine exklusiven Pfade. Der Baum endete auf Tier 3; die drei Forschungsbereiche waren ungleich tief, und das `TechTreeModal` zeigte lediglich rohe Prerequisite-IDs ohne Stufen- oder Spezialisierungsinformation.

### Entscheidung
- **Vier Stufen und 21 Technologien.** Tier 1 (Grundlagen), Tier 2 (Ausbau), Tier 3 (Fortgeschritten) und Tier 4 (Doktrin) sind über `TechnologyDef.tier: 1 | 2 | 3 | 4` modelliert. Tier 4 wird durch `interstellar_freight_network` (Tier 3) als gemeinsamen Eingang erschlossen.
- **Drei exklusive Paare.** `exclusiveGroup` markiert gegenseitig ausschließende Technologien: `physics_doctrine` (`zero_point_physics` / `gravitic_engineering`), `society_doctrine` (`genetic_adaptation` / `arcology_governance`) und `engineering_doctrine` (`self_replicating_industry` / `megastructure_engineering`). Nach Abschluss einer Technologie ist ihr Rivale dauerhaft gesperrt; alle Tier-4-Technologien sind bewusst keine Voraussetzung weiterer Technologien, damit jede Strategie vollständig spielbar bleibt.
- **Zentrale Validierung.** `src/core/techGraph.ts` ist die einzige Instanz für Katalogprüfungen. `validateTechGraph` prüft ID/Key-Gleichheit, gültige Kosten, Tier-Bereich, unbekannte, doppelte und Selbst-Voraussetzungen, strikt niedrigere Voraussetzungs-Stufe, Zyklen per DFS mit Pfadangabe, existierende Gebäude-/Einheiten-Unlocks sowie gleiche Kategorie, gleiche Stufe und mindestens zwei Mitglieder je `exclusiveGroup`. `improvements` bleiben ungeprüft, weil `dense_excavation` in keinem Katalog existiert. `validateTechCatalog()` bleibt als Wrapper erhalten; der alte, schwächere Validator im Katalog wurde entfernt.
- **Deterministische Helfer.** `getTechDepth` (längste Voraussetzungskette), `getPrerequisiteClosure`, `getDirectDependents`, `getAllDependents`, `getTechsByTier` (Physik → Gesellschaft → Ingenieurwesen, dann ID), `getMissingPrerequisites`, `getSpecializationRival(s)` und `getTechStatus` liefern stabile, sortierte Ergebnisse für UI und Tests.
- **Forschungs-Gating.** `ResearchManager.canResearch` liefert `allowed` plus einen Grund (`ok`, `already-researched`, `unknown-tech`, `missing-prerequisites`, `specialization-locked`). `selectTech` nutzt diese Prüfung, `getAvailableTechs` filtert gesperrte Technologien und sortiert nach Stufe, Kosten und ID.
- **UI.** Das `TechTreeModal` zeigt pro Zweig die erforschten Technologien als „x / N", Tier-Badges mit deutschen Stufenlabels, aufgelöste Voraussetzungsnamen (✓/✕), Spezialisierungsalternativen und einen expliziten Sperrhinweis für verworfene Doktrinen.

### Begründung
- Eine einzige Validierungsinstanz verhindert Drift zwischen Katalog, Tests und UI und macht neue Technologien gefahrlos ergänzbar.
- Die strikte Tier-Monotonie garantiert zusammen mit der Zyklusprüfung einen azyklischen, von Tier 1 aus erreichbaren Baum.
- Exklusive Paare erzeugen echte strategische Entscheidungen, ohne Inhalte unerreichbar zu machen.
- Deterministische Sortierung und reine Funktionen halten Spielstände reproduzierbar und die Helfer isoliert testbar.

### Konsequenzen
- 15 neue Tests in `tests/technology.test.ts` decken Katalogintegrität, Graph-Helfer und Forschungs-Gating ab; die Suite umfasst damit 101 Tests in 8 Dateien.
- Neue Technologien müssen künftig über `validateTechGraph` konsistent bleiben; Verstöße schlagen in Tests fehl.
- Das Save-Schema bleibt unverändert (`completedTechIds` enthält lediglich zusätzliche IDs).

---

## ADR-022: Galaktische Handelsrouten als deterministische Hyperlane-Konvois

### Kontext
Phase 2 löste Versorgung nur innerhalb eines Systems: `LogisticsRoute` verbindet zwei Kolonien, ignoriert aber die Galaxiekarte. Phase 3 forderte „galaktische Handelsrouten über das Hyperlane-Netzwerk", ohne Währung, Tarife oder Kampfmechanik einzuführen. Gleichzeitig musste die bestehende lokale Logistik unverändert weiterlaufen, das Save-Schema ohne Versionssprung kompatibel bleiben und jede Rundenauswertung deterministisch reproduzierbar sein.

### Entscheidung
- **Eigener Manager statt Erweiterung der lokalen Logistik.** `src/core/galacticTradeManager.ts` kapselt `GalacticTradeRoute` und `GalacticTradeConvoy` getrennt von `LogisticsManager`. Beide Ebenen teilen nur die Konstanten `FREIGHTER_CAPACITY = 15` und `MAX_FREIGHTERS_PER_ROUTE = 5` sowie die Reserve-/Zielbestandssemantik.
- **Tech-Gate `interstellar_freight_network`.** Routen sind erst nach dieser Tier-3-Technologie zulässig (`GALACTIC_TRADE_TECH_ID`); die Prüfung sitzt in `canCreateRoute`, nicht nur in der UI.
- **BFS über das Hyperlane-Netz als ungerichteter Graph.** Die Adjazenz wird symmetrisch aus `Galaxy.hyperlanes` aufgebaut, weil die Generator-Kanten zwar beidseitig erzeugt werden, Daten aber nicht als gerichtet garantiert sind. Nachbarn werden bei der Traversierung sortiert, damit `Set`-Einfügeordnung das Ergebnis nicht beeinflusst. Ergebnis ist der kürzeste, bei Gleichstand lexikografisch kleinste Pfad.
- **Ressourcen-, Richtungs- und Endpunkt-Validierung.** Erlaubt sind `food`, `minerals` und `rareResources`. Quell- und Zielkolonie müssen verschiedene, aktive Kolonien derselben Zivilisation in zwei verschiedenen Systemen sein; die Kombination Quelle + Ziel + Ressource ist eindeutig, Gegenrichtungen gelten als eigene Route. Fehlt ein Hyperlane-Pfad, wird die Route mit deutschem Grund abgelehnt.
- **Ein Konvoi pro Route, zwei Phasen pro Runde.** `advanceTurn` bewegt und liefert zuerst (`outbound` → Zielankunft → `inbound`), lädt danach neu (`min(Kapazität, Quellbestand − Reserve, Zielbedarf − Bestand − In-Transit)`). Ein pausierter Kurs lädt nicht nach; ein inaktives Ziel hält die Fracht im Orbit, bis die Route reaktiviert wird. Entfernen einer Route löscht ihren Konvoi.
- **Additive Persistenz.** `SaveGameData` erhält optionale Felder `galacticTradeRoutes` und `galacticTradeConvoys`; `CURRENT_SAVE_VERSION` bleibt 2. Ältere Stände laden mit leeren Listen, neue Stände bleiben für ältere Builds lesbar.
- **Events ohne neue Kopplung.** `galactic-trade:route-created`, `route-removed`, `convoy-departed`, `convoy-arrived` und `transfer` laufen über den bestehenden `EventBus`; die UI liest den Zustand weiterhin über Getter, nicht über Event-Payloads.
- **Darstellung.** `GalaxyMapCanvas` zeichnet Routen als ressourcenfarbene Polylinien (aktiv gestrichelt, inaktiv gepunktet) plus Konvoimarker; das `LogisticsModal` erhält einen Abschnitt „Interstellare Handelsrouten" mit Anlageformular, Kapazitätshinweis, Routenkarten, Pause/Aktivieren/Entfernen und Konvoistatus.

### Begründung
- Die Trennung von lokaler und galaktischer Logistik hält beide Modelle einfach und verhindert, dass Systemgrenzen die lokale Transferlogik verkomplizieren.
- Ein ungerichteter, sortierter BFS macht Pfade unabhängig von Datenreihenfolge und damit save- und teststabil.
- Die Zwei-Phasen-Auswertung entspricht der bestehenden lokalen Logistik und macht Rundentests vorhersagbar.
- Optionale Save-Felder vermeiden eine Migration und halten bestehende Spielstände gültig.
- Keine Währung, keine Tarife und kein Kampf: Frachter bleiben reine Logistikentitäten, Phase 4 wird nicht vorweggenommen.

### Konsequenzen
- 13 neue Tests in `tests/galacticTrade.test.ts` decken Tech-Gate, Pfadsuche (inkl. Gegenrichtung und fehlendem Pfad), Validierung, Routen-/Konvoierzeugung, Duplikate und Richtungssensitivität, den vollständigen Konvoi-Lebenszyklus, Reserven, Zielbestand/In-Transit, Pause, Orbit-Halten bei inaktivem Ziel, Entfernen sowie Lade-/Klonrundreisen ab; die Suite umfasst damit 114 Tests in 9 Dateien.
- Galaktische Routen laufen in `endTurn` als eigener Schritt nach der lokalen Logistik und vor der Aggregation.
- Künftige Handelsmechaniken (Tarife, Kriegsblockaden, Eskorten) müssen an den Manager andocken, ohne die Pfadsuche oder die Zwei-Phasen-Semantik zu duplizieren.

---

## ADR-023: Werftgebundener Schiffbau und Flottenbewegung über Hyperlanes

### Kontext
Phase 4 verlangte Schiffskonstruktion (Korvetten, Zerstörer, Kreuzer) und interplanetare Flottenbewegung, ohne Währung, Kampfsystem oder Schiffskosten pro Runde einzuführen. Die bestehende Bauwarteschlange arbeitet pro Kolonie mit sofortiger Mineralien-/Rare-Abbuchung und Produktionspunkten pro Runde; die galaktische Logistik besitzt bereits einen deterministischen BFS über das Hyperlane-Netz. Beides musste wiederverwendet werden, ohne das Save-Schema zu brechen.

### Entscheidung
- **Eigener `FleetManager`.** `src/core/fleetManager.ts` kapselt `Fleet`, `ShipBuildOrder`, den Schiffskatalog-Zugriff und die Bewegung; `GameEngine` ruft ihn in `endTurn` als eigenen Schritt vor der Forschungsaggregation auf. Getter liefern Live-Objekte, `loadFleets`/`loadOrders` klonen ihre Eingaben.
- **Werftbindung statt neuer Gebäudeklasse.** Nur Kolonien mit `developmentTier === 'colony'` (`SHIPYARD_REQUIRED_TIER`) bauen Schiffe; die Werft ist damit eine Eigenschaft der Siedlungsstufe, kein zusätzlicher Gebäudetyp.
- **Tech-Gates ohne neue Technologien.** Korvette → `advanced_metallurgy`, Zerstörer → `fusion_reactors`, Kreuzer → `gravitic_engineering`. Der Katalog bleibt bei 21 Technologien (ADR-021); `canBuildShip` prüft Gate, Werftstufe, bekannte Schiffsklasse und Lagerbestände.
- **Kosten sofort, Produktion über Zeit.** `queueShipBuild` zieht `mineralCost` und `rareCost` sofort ab und legt einen `ShipBuildOrder` mit `investedProduction = 0` an. Pro Runde erhält nur der älteste Auftrag einer Kolonie `max(1, floor(netYields.production · 0.5))` Punkte; jüngere Aufträge warten, bis der vorherige abgeschlossen ist. Bei Fertigstellung entsteht genau ein Schiff.
- **Ein Schiff pro Auftrag, Stapel pro Flotte.** `Fleet.ships` ist eine Liste aus `{ shipDefId, count }`; `addShipsToFleet` erhöht den bestehenden Stapel oder legt einen neuen an. `getFleetStrength` summiert `hull`, `attack` und `defense` über alle Schiffe.
- **Flotten pro Zivilisation und System, nicht pro Schiff.** `ensureFleetAt(civId, systemId)` erzeugt bei Bedarf `fleet_${civId}_${systemId}_${seq}` mit dem Namen `Flotte ${system.name}` und emittiert `fleet:created`. Fertige Schiffe werden dort eingegliedert (`fleet:ship-built`); ein Sieg-/Verlustmodell existiert nicht.
- **Bewegung einen Hyperlane-Schritt pro Runde.** `commandMoveFleet` nutzt denselben ungerichteten, sortierten BFS wie der galaktische Handel (`findPath`) und speichert den kompletten Pfad in `pathSystemIds`. `advanceTurn` erhöht `pathIndex`, setzt `systemId` auf den nächsten Knoten und beendet die Reise bei Erreichen des Ziels (`status: 'stationed'`, Pfad geleert, `fleet:arrived`). `commandMoveFleet` lehnt fliegende Flotten, gleiche Zielsysteme und fehlende Pfade mit deutschem Grund ab.
- **Additive Persistenz.** `SaveGameData` erhält optionale Felder `fleets` und `shipBuildOrders`; `CURRENT_SAVE_VERSION` bleibt 2, ältere Stände laden mit leeren Listen.
- **Darstellung.** `FleetModal` bündelt Werftauswahl, Schiffsbauformular, Auftragsfortschritt mit Abbruch, Flottenliste mit Stärke und Zielsystem-Auswahl. `GalaxyMapCanvas` zeichnet stationierte Flotten als Punkte, fliegende als Dreiecke samt gestrichelter Restroute.

### Begründung
- Die Werftbindung an die Koloniestufe vermeidet ein zweites Bauplatzsystem und bleibt mit der bestehenden Ökonomie kompatibel.
- Sofortige Materialkosten plus zeitverteilte Produktion entsprechen der Bauwarteschlange und verhindern, dass Mineralien doppelt verplant werden.
- Die Wiederverwendung von BFS und Hyperlane-Daten garantiert konsistente, deterministische Pfade für Handel und Militär.
- Ein Flottenobjekt pro Zivilisation und System hält die Anzahl der Entitäten klein und macht die UI-Liste stabil.
- Optionale Save-Felder und keine neuen Technologien halten Spielstände und den Tech-Baum unverändert.

### Konsequenzen
- 13 neue Tests in `tests/fleets.test.ts` decken Werft-/Tech-Gates, Kostenabbuchung, Auftragsfortschritt, blockierende Warteschlange, Abbruch, Flottenzusammenführung, Stärkeberechnung, Pfadsuche, Bewegung über mehrere Runden, Ankunft und Ladepfade ab; die Suite umfasst damit 127 Tests in 10 Dateien.
- Schiffsunterhalt, Kampf, Schaden und Werftkapazität sind bewusst nicht modelliert; sie bleiben offene Balance-Themen späterer Phasen.
- Neue Schiffsklassen benötigen nur einen `SHIP_CATALOG`-Eintrag mit Tech-Gate; `FleetManager` und UI lesen den Katalog datengetrieben.


---

## ADR-024: Schiffsunterhalt als externer Energieanteil der Kolonieökonomie

### Kontext
ADR-023 führte Schiffbau und Flottenbewegung ein, ließ aber jeden Unterhalt bewusst offen. Ohne laufende Kosten wären Flotten ein reiner Produktionsgewinn, und die Werftentscheidung hätte keine ökonomische Gegenprobe. Gleichzeitig existierte kein Reichsschatz, keine Währung und kein Kampfmodell; Unterhalt musste daher an die bestehende Kolonieökonomie andocken, ohne `UpkeepCosts`, Save-Schema oder bestehende Aufrufer zu brechen.

### Entscheidung
- **Energie statt Mineralien.** `ShipDef` erhält `energyUpkeep`; Korvette `1`, Zerstörer `2`, Kreuzer `4` pro Schiff und Runde. Das verteilt den Unterhalt auf die laufende Energiebilanz, statt die knappe Bauressource Mineralien nachträglich zu belasten.
- ** additive Einbeziehung in `UpkeepCosts.energy`.** `EconomyEngine.calculateYields` und `simulateTurnEconomy` erhalten einen optionalen vierten Parameter `externalEnergyUpkeep = 0`, der nach Gebäude- und Distriktunterhalt auf `upkeep.energy` addiert wird. `UpkeepCosts` bleibt unverändert; alle bestehenden Aufrufer bleiben gültig.
- **FleetManager als einzige Unterhaltsquelle.** `calculateFleetUpkeep` summiert `count · energyUpkeep` über alle Stapel und ignoriert unbekannte `shipDefId`s. `calculateUpkeepByColony` verteilt den Gesamtunterhalt jeder Zivilisation gleichmäßig auf ihre aktiven Kolonien; Restpunkte gehen an die nach `id` sortierten Kolonien. Inaktive Kolonien zahlen nicht.
- **Berechnung vor der Kolonieauswertung.** `GameEngine.endTurn` erzeugt die Kolonie-Zuordnung einmal pro Runde und übergibt sie an jede `simulateTurnEconomy`-Auswertung; `setColonyWorkFocus` rechnet mit derselben Zuordnung neu. Die Kolonieansicht zeigt den Anteil damit automatisch über `upkeep.energy`.
- **Kein neues Event.** Der Unterhalt ist eine passive Rundengröße; ein `fleet:upkeep-paid`-Event pro Kolonie und Runde würde das Ereignisprotokoll fluten, ohne neue Handlungsoptionen zu erzeugen.

### Begründung
- Energie ist die Ressource, die bereits Gebäude und Distrikte unterhält; Flotten dort einzuordnen hält die Wirtschaftslogik konsistent und macht Knappheit sichtbar.
- Ein optionaler Parameter verändert weder Rückgabetyp noch Signaturpflicht und hält Tests sowie UI-Aufrufer stabil.
- Die gleichmäßige Verteilung vermeidet eine willkürliche Standortwahl, solange es kein Stations- oder Versorgungskonzept gibt; die Sortierung nach `id` macht das Ergebnis unabhängig von Einfügereihenfolge und damit save-stabil.
- Bewusst niedrige Werte (1/2/4) halten Flotten früh bezahlbar; sie sind als Startbalance dokumentiert, nicht als endgültige Ökonomie.

### Konsequenzen
- Drei neue Tests in `tests/fleets.test.ts` prüfen Katalogwerte, Stapelsummierung inkl. unbekannter IDs sowie gleichmäßige, deterministische Verteilung über aktive Kolonien; `tests/colony_module4.test.ts` verifiziert die Weitergabe an `calculateYields`. Die Suite umfasst damit 130 Tests in 10 Dateien.
- `FleetModal` zeigt den Unterhalt je Flotte und als Summe im Kopf; die Kolonieverwaltung zeigt ihn als Teil von `upkeep.energy`.
- Ein späteres Stations-, Versorgungs- oder Kampfmodell kann die Verteilung ersetzen, ohne `UpkeepCosts` oder die Signatur von `calculateYields` zu ändern.

## ADR-025: Rundenbasiertes Kampf- und Schadensmodell am Rundenende

### Kontext
ADR-023 lieferte Flotten, ADR-024 ihren Unterhalt, aber es gab keinen Konfliktfall: mehrere Flotten verschiedener Zivilisationen konnten beliebig im selben System stehen. Es existiert weiterhin kein Kriegs-, Diplomatie- oder Feindschaftszustand. Das Kampfmodell musste daher ohne neue Zustandsklasse auskommen, deterministisch bleiben und ohne eigene Engine-Schleife in den bestehenden Rundenablauf passen.

### Entscheidung
- **Automatischer Kampf am Rundenende.** `FleetManager.advanceTurn` ruft nach Bewegung und Schiffbau privat `resolveBattles(turn)` auf; `GameEngine.endTurn` führt dies als Schritt F vor der Forschungsauswertung aus. Ein Gefecht benötigt nur mindestens zwei anwesende, kampffähige Flotten unterschiedlicher `civId` im selben `systemId`.
- **Kein Diplomatiezustand, jede fremde Zivilisation gilt als feindlich.** Solange kein Kriegs-/Friedensmodell existiert, wäre eine Freund-Feind-Prüfung eine leere Hülle. Die Regel ist im ADR und in der UI dokumentiert und wird ersetzt, sobald Diplomatie existiert.
- **Kampffähig heißt: bekannter Schiffstyp mit `count > 0`.** Stapel mit unbekannter `shipDefId` (z. B. aus älteren Speicherständen) nehmen nicht am Gefecht teil, bleiben aber unverändert auf der Flotte erhalten. Flotten ohne kampffähige Schiffe werden ignoriert statt zerstört.
- **Paarweise Auflösung in `id`-Reihenfolge.** `resolveBattles` gruppiert nach System (sortiert über `compareIds`), bildet die anwesenden Zivilisationen und kämpft wiederholt zwischen den beiden kleinsten `civId`s. Nach jedem Gefecht wird die Anwesenheit neu bestimmt; verbleiben weniger als zwei Zivilisationen, endet das System. Ein Unentschieden (`winnerCivId === null`) beendet das System sofort, damit garantiert keine Endlosschleife entsteht.
- **Simultanschaden mit Screening-Reihenfolge.** Pro Gefechtsrunde wird der Schaden beider Seiten **vor** der Schadensanwendung aus allen lebenden Schiffen berechnet (`attack + defense` je Schiff) und dann gleichzeitig über `applyDamage` verteilt. Schiffe werden nach `(hull, attack, defense, shipDefId, fleetId)` aufsteigend sortiert; die schwächste Hülle absorbiert zuerst, Teiltreffer bleiben als gebrochene `hp` innerhalb des Gefechts erhalten. Höchstens `MAX_COMBAT_ROUNDS = 30` Runden.
- **Verluste werden auf Stapel zurückgeschrieben.** `buildBattleSide` differenziert die Stückzahlen je `shipDefId` vor/nach dem Gefecht; `applyBattleLosses` setzt die bekannten Stapel auf die Überlebendenzahlen, lässt unbekannte Stapel unangetastet und entfernt leere Stapel. Flotten ohne verbleibende Schiffe werden über `removeFleet` entfernt (Event `fleet:removed`).
- **Berichte nur im Speicher.** `FleetBattleReport` (`id`, `turn`, `systemId`, `rounds`, `sides`, `winnerCivId`) wird nach jedem Gefecht gepusht, auf `BATTLE_REPORT_LIMIT = 20` gekürzt und über `'fleet:battle'` publiziert; `getBattleReports()` liefert eine tiefe Kopie. Die Berichte werden bewusst **nicht** gespeichert: sie sind Rundenergebnis, kein Spielzustand, und das Save-Schema bleibt bei Version 2 unverändert.

### Begründung
- Keine neue Schleife, kein Timer, keine Simulation neben dem Spiel: der Kampf ist ein reiner Runden-Schritt und damit reproduzierbar sowie in Tests ohne Warten prüfbar.
- Die Sortierung nach `civId` und `shipDefId` macht die Auflösung unabhängig von Map-Einfügereihenfolge; dieselbe Ausgangslage erzeugt immer dasselbe Ergebnis.
- Simultaner Schaden verhindert den Erstschlag-Vorteil, den eine sequenzielle Abwicklung bei symmetrischen Flotten erzeugen würde.
- Screening nach Hülle ist eine einfache, erklärbare Regel ohne Rollen- oder Waffensystem und hält das Modell erweiterbar.
- Nicht persistierte Berichte vermeiden eine Save-Migration für Daten, die nach dem Neuladen ohnehin nicht mehr sinnvoll sind.

### Konsequenzen
- Fünf neue Tests in `tests/fleets.test.ts` decken Gefechtsauflösung inkl. Verlusten und `fleet:removed`, das Ignorieren gleicher Zivilisation und unbekannter Hüllen, gegenseitige Vernichtung ohne Sieger, drei Zivilisationen mit zwei sequenziellen Berichten sowie Berichtslimit, Kopiensemantik und `clear()` ab. Die Suite umfasst damit 135 Tests in 10 Dateien.
- `FleetModal` erhält einen Abschnitt „Kampfberichte" mit Runde, Gefechtsrunden, Sieger und Verlusten je Seite; `App.tsx` reicht `getBattleReports()` und `getCivilizations()` durch.
- **Bekannte Einschränkung:** KI-Zivilisationen bauen und besitzen noch keine Flotten, daher tritt der Kampf im normalen Spiel derzeit nicht auf. Er ist über Seeds in Tests sowie künftige KI-Flotten aktiv; das ist kein Fehler des Modells, sondern eine offene Phase-4-Aufgabe.
- Werftkapazität, Rückzug, Belagerung von Kolonien und Gefechtsentscheidungen des Spielers bleiben offen; das Modell ist bewusst als Basisauflösung geschnitten.

## ADR-026: Parallele Werftdocks mit voller Produktionsleistung pro Dock

### Kontext
ADR-023 band den Schiffbau an eine Kolonie der Stufe `colony` und ließ pro Kolonie und Runde genau einen Auftrag fortschreiten: `advanceTurn` führte eine Menge `advancedColonies`, jeder weitere Auftrag wartete. Damit war die Werftkapazität faktisch 1, unabhängig von der Größe der Kolonie. Es gibt im Projekt kein Werftgebäude und keinen Werftdistrikt; eine bauliche Kapazitätsquelle hätte neue Kataloge, Baukosten und UI erfordert. Gefragt war eine kleine, deterministische Erweiterung, die große Kolonien spürbar schneller Schiffe bauen lässt, ohne das Wirtschaftsmodell umzubauen.

### Entscheidung
- **Bevölkerung als Kapazitätsquelle.** `getShipyardCapacity(colony)` liefert `0`, wenn die Kolonie fehlt, nicht `active` ist oder nicht die Stufe `colony` besitzt. Sonst gilt `min(SHIPYARD_MAX_SLIPS, 1 + floor(max(0, population - 1000) / SHIPYARD_POPULATION_PER_SLIP))` mit `SHIPYARD_POPULATION_PER_SLIP = 2000` und `SHIPYARD_MAX_SLIPS = 4`. Damit: 1.000 → 1, 3.000 → 2, 5.000 → 3, ab 7.000 → 4 Docks. Die Startbevölkerung einer Kolonie ist 1.000, die erste Werft bleibt also wie bisher bei einem Dock.
- **Jedes aktive Dock erhält den vollen Anteil.** Die Produktion pro Dock bleibt `max(1, floor(netYields.production * SHIPYARD_PRODUCTION_SHARE))`, also der bisherige 50-%-Anteil. Docks teilen sich den Anteil **nicht**.
- **FIFO-Vergabe in Einfügereihenfolge.** `advanceTurn` zählt pro Kolonie belegte Docks (`usedSlips`) und lässt die ersten `capacity` Aufträge aus `this.orders` fortschreiten; alle weiteren wandern unverändert nach `remainingOrders`. Stornieren eines Auftrags gibt sein Dock sofort an den nächsten Wartenden frei.
- **Inaktive Kolonien werden vor der Dockzählung geprüft.** Für sie ändert sich nichts: ihre Aufträge bleiben unangetastet, unabhängig von der Kapazität.

### Begründung
- Eine Aufteilung des festen 50-%-Budgets auf mehrere Docks hätte den Durchsatz nicht erhöht und wäre rein kosmetische Parallelität gewesen. Die volle Leistung je Dock ist die einzige Variante, die Bauzeit tatsächlich verkürzt.
- Die Abstraktion „ein Dock zieht zusätzlich orbitale/automatisierte Industrie" ist bewusst akzeptiert: Das Spiel modelliert keine Orbitale, und ein neues Gebäude hätte Save-Migration, Katalogpflege und UI-Ausbau verlangt, ohne das Spielziel (schnellere Großserien) besser zu erreichen.
- Bevölkerung ist bereits eine vorhandene, getestete Größe mit klarer Wachstumslogik; sie verankert die Werftkapazität dort, wo auch Arbeiter- und Wachstumsregeln hängen, und bleibt ohne neuen Spielzustand speicherbar.
- Die Obergrenze 4 verhindert, dass späte Megakolonien die Auftragswarteschlange in einem Zug leerräumen, und hält die Rundenzahl je Bau überschaubar.

### Konsequenzen
- Vier neue Tests in `tests/fleets.test.ts` prüfen die Kapazitätsformel (inkl. `null`, Siedlung, verlassene Kolonie, Obergrenze), zwei parallele Aufträge mit wartendem dritten bei 3.000 Bevölkerung, die Dockfreigabe nach Stornierung sowie unveränderte Aufträge einer verlassenen Kolonie. Die Suite umfasst damit 139 Tests in 10 Dateien.
- `FleetModal` zeigt die Dockzahl je Kolonie in der Auswahlliste und im Info-Text (`Docks: x/y belegt`) sowie je Auftrag ein Abzeichen „Dock aktiv" bzw. „wartet auf Dock".
- Das Save-Schema bleibt bei Version 2: Kapazität ist abgeleitet, nicht gespeichert.
- Die Werftkapazität ist bewusst nicht an Gebäude, Distrikte oder `sizeClass` gekoppelt; eine spätere Gebäudewerft müsste diese Ableitung ersetzen und die Formel in einem ADR neu begründen.

## ADR-027: Symmetrische Kriegs- und Friedensbeziehungen als Grundmodell der Diplomatie

### Kontext
Das Kampfmodell aus ADR-025 behandelte jede fremde Zivilisation im selben System automatisch als feindlich. Das war für die Basisauflösung korrekt, widerspricht aber der Vorstellung friedlicher Koexistenz: Flotten zweier Reiche durften sich nicht einmal begegnen, ohne zu kämpfen. Für Phase 4 fehlte damit die diplomatische Ebene, die festlegt, *wer* überhaupt Krieg führt. Gefordert war ein kleines, deterministisches Grundmodell ohne Verträge, Bündnisse, Meinungen oder Handelsabkommen, das den Kampf glaubwürdig steuert und sich speichern lässt.

### Entscheidung
- **Ein Beziehungsdatensatz pro Zivilisationspaar.** `DiplomaticPair` (`civAId`, `civBId`, `relation: 'peace' | 'war'`, `sinceTurn`) wird in `DiplomacyManager` über einen kanonischen Schlüssel mit sortierten IDs gehalten. `getPairs()` und `toSnapshot()` liefern deterministisch sortierte Kopien; `getPair()` gibt eine defensive Kopie zurück.
- **Frieden ist der Standard.** `syncCivilizations(civIds)` registriert die bekannten Reiche, legt für jedes fehlende Paar `peace` mit `sinceTurn = 0` an, erhält bestehende Beziehungen und entfernt Paare, deren Zivilisation nicht mehr existiert. `getRelation` liefert für unbekannte oder identische Paare ebenfalls `peace`; nur eine explizite Kriegserklärung macht ein Paar feindlich.
- **Kriegserklärung mit Validierung.** `declareWar(civAId, civBId, currentTurn)` lehnt leere, identische und nicht registrierte Zivilisationen sowie bereits bestehenden Krieg ab (deutsche Begründung im `DiplomacyResult`). Bei Erfolg wird das Paar auf `war` gesetzt, `sinceTurn` gespeichert und `'diplomacy:war-declared'` emittiert.
- **Frieden erst nach Mindestkriegsdauer.** `PEACE_MIN_WAR_TURNS = 3`; `makePeace` verlangt ein bestehendes Kriegspaar und `currentTurn - sinceTurn >= 3`, sonst nennt die Begründung den aktuellen Fortschritt. Bei Erfolg wird auf `peace` mit neuem `sinceTurn` gesetzt und `'diplomacy:peace-made'` inklusive `turnsAtWar` emittiert.
- **Der Kampf fragt die Diplomatie.** `fleetManager.ts` definiert `WarRelationLookup { isAtWar(civAId, civBId): boolean }`; `advanceTurn(colonies, turn, diplomacy)` reicht das Objekt an `resolveBattles`/`findHostilePair` weiter, sodass nur Kriegspaare Gefechte austragen. Ein `null`-Lookup gilt weiterhin als „alle fremden Reiche feindlich" und hält die bisherigen Kampftests unverändert gültig.
- **Persistenz bleibt bei Schema-Version 2.** `SaveGameData` erhält das optionale Feld `diplomacy?: DiplomaticPair[]`. `loadPairs` normalisiert IDs, verwirft Selbstpaare, unbekannte Relationen und nicht-endliche Rundenwerte (auf 0 begrenzt) und ersetzt den bestehenden Bestand; fehlt das Feld in älteren Saves, werden die Paare aus den vorhandenen Zivilisationen neu als Frieden aufgebaut.
- **UI: `DiplomacyModal` und Navigationsabzeichen.** Das Modal listet je fremder Zivilisation Farbe, Name, Status (Krieg/Frieden), Kriegsdauer und die passende Aktion, deaktiviert unzulässige Aktionen und erklärt die Mindestkriegsdauer. `TopNavBar` erhält einen Knopf „Diplomatie" mit rotem Abzeichen der laufenden Kriege; `App.tsx` verdrahtet Öffnen/Schließen (inkl. Escape), führt die Aktionen über den `GameEngine` aus und erzwingt per Revisionszähler ein Neuzeichnen der abgeleiteten Paarliste.

### Begründung
- Ein symmetrisches Paar statt gerichteter Beziehungen verhindert inkonsistente Zustände (A erklärt B Krieg, B sieht Frieden) und macht `isAtWar` in beiden Argumentreihenfolgen identisch.
- Der Standard „Frieden" ist die einzige Variante, die ohne Vorbedingung spielbar bleibt: Expansion und Begegnungen sind zunächst unblutig, Krieg ist eine bewusste Entscheidung.
- Die Mindestkriegsdauer verhindert das sofortige Zurücknehmen einer Kriegserklärung in derselben Runde und gibt dem Zustand spürbares Gewicht, ohne einen Kriegsmüdigkeits- oder Meinungswert zu benötigen.
- Die `WarRelationLookup`-Schnittstelle hält `FleetManager` frei von `DiplomacyManager`-Abhängigkeiten und macht die Kriegsprüfung in Tests durch ein einfaches Objekt ersetzbar.
- Ein optionales Save-Feld vermeidet eine Schema-Migration; Diplomatie ist rein additiv und für alte Spielstände bedeutungslos.

### Konsequenzen
- Acht neue Tests in `tests/diplomacy.test.ts` decken Friedensinitialisierung und Sortierung, symmetrische Kriegserklärung inklusive Event, doppelte und Selbst-Kriegserklärung, unbekannte Zivilisationen, die Mindestkriegsdauer, Frieden inklusive Event, Frieden ohne Krieg, `syncCivilizations` (Seeding, Erhalt, Pruning), Snapshot-Roundtrip mit fehlerhaften Einträgen sowie Kopien- und `clear()`-Semantik ab. Vier neue Tests in `tests/fleets.test.ts` prüfen, dass gleichzeitige Flotten im Frieden koexistieren, ein Kriegslookup das Gefecht auslöst, ein friedlicher Dritter unangetastet bleibt und ein `null`-Lookup rückwärtskompatibel alle als feindlich behandelt. Die Suite umfasst damit **153 Tests in 11 Dateien**.
- `TopNavBar` besitzt einen „Diplomatie"-Knopf mit Kriegsabzeichen; `App.tsx` öffnet das `DiplomacyModal` und schließt es per Escape.
- Das Save-Schema bleibt Version 2 (`diplomacy` optional); die Beziehungen überleben Speichern und Laden.
- **Bekannte Einschränkung:** KI-Zivilisationen erklären keinen Krieg und schließen keinen Frieden; die Diplomatie ist derzeit eine Spielerentscheidung. Da KI-Reiche außerdem noch keine Flotten besitzen, bleibt der Kampf im normalen Spiel weiterhin nicht auslösbar. Beides ist eine offene Phase-4-Aufgabe, kein Fehler des Modells.
- Nicht enthalten: Bündnisse, Nichtangriffspakte, Verträge, Reputation, Tributzahlungen, Waffenstillstandsbedingungen und diplomatische KI-Bewertungen. Das Modell ist bewusst als Basis geschnitten und müsste für diese Erweiterungen um gerichtete Meinungen und Vertragsobjekte ergänzt werden.

## ADR-028: KI-Präsenz und KI-Flotten als eigenständiger Rundenakt

### Kontext
Nach ADR-023 bis ADR-027 besaßen KI-Zivilisationen zwar Forschungsfortschritt, Ressourcen und Kolonien, aber weder verbürgtes Territorium noch Flotten. Dadurch blieben drei fertige Systeme im normalen Spiel unerreichbar: Kampf (ADR-025) braucht zwei kampffähige Flotten im selben System, Diplomatie (ADR-027) braucht ein Gegenüber mit eigener Präsenz, und die Werft (ADR-023/026) war faktisch eine Spielereinrichtung. Zusätzlich fehlte eine saubere Grenze zwischen „KI expandiert wirtschaftlich" und „KI handelt militärisch", damit der Flottenteil ohne `endTurn`, ohne Speicherzugriff und ohne Spielerinteraktion testbar bleibt. Gefordert war ein kleiner, deterministischer Schritt, der KI-Reiche sichtbar macht und den Kampf auslösbar macht, ohne Kriegs-KI vorwegzunehmen.

### Entscheidung
- **Territoriale Präsenz beim Start.** `initializeAiPresence()` läuft im Konstruktor und in `generateNewGalaxy`, nicht beim Laden. Die Spielerheimat (`ownerFactionId === 'faction-player-home'`) wird auf die Spielerzivilisation umgeschrieben und bei Bedarf auf `surveyed` gehoben. Jede KI-Zivilisation erhält deterministisch einen Anker `floor(systemCount · (index + 1) / (aiCount + 1))` und von dort aus das erste freie System über die Offsets `[anchor]`, dann `[anchor + offset, anchor - offset]`.
- **KI-Heimatkolonie über die bestehenden Regeln.** `establishAiHomeSystem` wählt aus dem System den habitabelsten Planeten, der kein Gasriese ist, keine tödliche Strahlung trägt und `habitability >= AI_HOME_MIN_HABITABILITY = 50` erreicht (Sortierung `habitability desc, id asc`). Der Planet wird temporär auf `analyzed`/`surveyed` gesetzt, damit die reguläre `foundColony`-Validierung greift; anschließend wird die Kolonie auf Stufe `colony` gehoben, auf `AI_HOME_POPULATION = 3000` gesetzt, `growthFoodRequired` neu berechnet und die Ökonomie erneut simuliert. Systembesitz und `civ.homeSystemId` werden nachgezogen.
- **Kein neues Save-Schema.** Territorium und Heimatwelt stecken in den bereits persistierten `galaxy`- und `colonies`-Daten; KI-Flotten laufen über die vorhandenen `fleets`/`shipBuildOrders`. Die Version bleibt 2.
- **KI-Starttechnologien idempotent.** `AI_STARTING_TECHS = ['automated_assembly', 'advanced_metallurgy']` respektiert die Prereq-Kette und wird über `grantAiStartingTechnologies(civ)` vergeben — im Konstruktorpfad und erneut in jedem `endTurn`, damit auch ältere Spielstände ohne diese Techs Werften betreiben können. Ist die laufende Forschung dadurch bereits abgeschlossen, werden `currentTechId = null` und `currentTechInvested = 0` gesetzt.
- **Flottenzug als eigene Methode im `FleetManager`.** `executeAiFleetTurn(civId, colonies, completedTechIds, turn)` gibt ein `AiFleetTurnSummary { queuedShipOrders, movedFleetIds }` zurück. Es arbeitet in zwei Phasen: (1) je aktiver eigener Kolonie in `id`-Reihenfolge füllt es offene Docks (`getShipyardCapacity − vorhandene Aufträge`) mit dem ersten baubaren Muster aus `AI_SHIP_PRIORITY = ['corvette', 'destroyer', 'cruiser']`; (2) stationierte, nicht leere eigene Flotten patrouillieren in `id`-Reihenfolge zyklisch zum nächsten eigenen Koloniesystem (`ownSystemIds[(index + 1) % length]`), sofern mindestens zwei eigene Systeme existieren.
- **Reihenfolge im `endTurn`.** Der KI-Flottenzug läuft als Schritt (1b) direkt nach `civManager.executeAITurns` und **vor** der Ökonomie- und Bauphase. Dadurch erhalten frisch eingereihte Aufträge noch in derselben Runde Produktionspunkte, und die neue Flotte ist ab der Folgerunde beweglich. `grantAiStartingTechnologies` läuft im selben Schritt pro KI-Zivilisation.
- **Kein Kriegsverhalten.** Die Flotten-KI erklärt keinen Krieg, wählt keine Ziele und flieht nicht; Gefechte entstehen nur, wenn die Diplomatie bereits Krieg meldet (ADR-027) oder ein Test `null` als Lookup übergibt. **Nachtrag:** Seit ADR-035 erklärt eine separate KI-Diplomatie Kriege und schließt Frieden; die Flotten-KI selbst bleibt unverändert passiv.

### Begründung
- Ein deterministischer Anker mit Offsets verteilt KI-Reiche über die ganze Galaxie, ohne Zufall, ohne Rekursion und ohne Abhängigkeit von der Generierungsreihenfolge; das ist in Tests mit beliebigen Seeds reproduzierbar.
- Die Wiederverwendung von `foundColony` und `simulateTurnEconomy` hält KI-Kolonien regelgleich mit Spielerkolonien. Ein eigener „KI-Pflanze"-Pfad hätte zwei Wahrheiten für Tier, Vorräte und Wachstum erzeugt.
- Die Starttechs sind der kleinste Eingriff, der KI-Werften ab Runde 0 handlungsfähig macht. Ein Forschungsvorlauf über mehrere Runden hätte den Kampf weiter verzögert, ohne spielerisch etwas beizutragen.
- Die Trennung „wirtschaftlicher KI-Zug in `CivManager`, militärischer in `FleetManager`" hält jede Seite einzeln testbar und verhindert, dass `GameEngine` Flottenlogik dupliziert.
- Die feste Prioritätsliste „günstigstes zuerst" ist bewusst dumm: Sie ist erklärbar, konvergiert nicht in Endlosschleifen und lässt Raum für eine spätere Bedrohungsbewertung.
- Der Patrouillen-Zyklus erzeugt sichtbare Bewegung ohne Zielauswahl-Heuristik und ohne dass Flotten dauerhaft im Heimatsystem verharren.
- Der Flottenzug vor der Bauphase nutzt die vorhandene Semantik „Aufträge werden in der Runde der Einreihung bereits bedient" und vermeidet eine Sonderregel.

### Konsequenzen
- Vier neue Tests in `tests/aiEmpires.test.ts` decken Heimatwelt-Zuweisung für beide KI-Reiche, Systembesitz und Spielerheimat-Remap, unterschiedliche Heimatsysteme sowie die Idempotenz über `generateNewGalaxy` ab. Acht neue Tests in `tests/aiFleets.test.ts` prüfen den günstigsten baubaren Auftrag samt Ressourcenabzug, das Tech-Gate ohne `advanced_metallurgy`, das Docklimit bei wiederholtem Aufruf, mehrere Docks bei großer Kolonie, den Patrouillenwechsel zwischen zwei Systemen, den Abbruch bei nur einem System, die Unberührtheit fremder und leerer Flotten sowie die GameEngine-Integration nach `endTurn`. Die Suite umfasst damit **171 Tests in 14 Dateien**.
- `tsc --noEmit` ist sauber; der Produktionsbuild bleibt bei 73 Modulen und wächst auf 550,51 kB JS (gzip 153,79 kB).
- KI-Reiche sind jetzt über das Territoriumslabel im `SystemInspector` und über Flotten im `FleetModal` sichtbar. Die Einfärbung der Galaxiekarte nach Besitzer folgt in ADR-029.
- **Bekannte Einschränkung:** Da die KI-Flotten keinen Krieg erklären (Stage C), bleibt der Kampf im normalen Spiel nur dann auslösbar, wenn der Spieler über das `DiplomacyModal` Krieg erklärt. KI-Flotten verteidigen sich dann passiv, greifen aber keine Systeme an. **Nachtrag:** ADR-035 ergänzt KI-Kriegserklärungen; die passive Flotten-KI bleibt bestehen.
- Nicht enthalten: Bedrohungsbewertung, Flottenkonzentration, Belagerung, Rückzug, Eskorten, Kriegsziele und KI-Diplomatie. Die Patrouille ist bewusst der kleinste sichtbare Bewegungsbaustein. **Nachtrag:** KI-Diplomatie ist seit ADR-035 als eigener `AiDiplomacyManager` umgesetzt; die übrigen Punkte bleiben ausgeklammert.

## ADR-029: Territoriumseinfärbung der Galaxiekarte

### Kontext
Mit ADR-028 besitzen KI-Reiche verbürgtes Territorium, aber die Galaxiekarte zeigte weiterhin nur Sterne, Hyperlanes und Flotten. Wer ein System besaß, war ausschließlich im `SystemInspector` und im `FleetModal` sichtbar. Für die Phase-4-Karte fehlte damit die räumliche Lesbarkeit von Einflusszonen: Ein Spieler konnte nicht erkennen, wo das eigene Reich endet und ein fremdes beginnt, ohne jedes System einzeln anzuklicken. Gleichzeitig musste die neue Kodierung mit drei bestehenden visuellen Sprachen konkurrieren — der zyanen Auswahl-Retrakt, dem smaragdgrünen Besiedelt-Beacon und dem weißen Hover-Ring —, ohne mit ihnen verwechselt zu werden. Gefordert war eine rein visuelle Ergänzung ohne neue Spieldaten, ohne Save-Migration und ohne Eingriff in die Besitzlogik.

### Entscheidung
- **Farbquelle ist der `CivManager`, nicht das System.** `GalaxyMapCanvas` erhält die optionale Prop `civilizations?: Civilization[]` (Default `[]`). `App.tsx` übergibt `engine.getCivManager().getCivilizations()` direkt; es entsteht kein zusätzlicher State und keine Kopie im Canvas. Die Karte liest ausschließlich `color`, `borderColor`, `name` und `isPlayer`.
- **Besitzerauflösung mit explizitem Fallback.** `resolveOwnerCiv(ownerFactionId)` sucht zuerst die exakte Zivilisations-ID. Nur wenn diese fehlt und die ID `'faction-player-home'` lautet, wird die Zivilisation mit `isPlayer` verwendet; andernfalls bleibt der Besitzer unbekannt und es wird nichts gezeichnet. Damit bleiben alte Spielstände mit dem Legacy-Player-Owner sichtbar, ohne dass eine fremde ID stillschweigend dem Spieler zugeschlagen wird.
- **Drei Ebenen pro besessenem System, gestaffelt nach Radius.**
  - *Territoriums-Halo* (`A0`): radialer Verlauf von `baseRadius · 6.5 + 12` mit Alpha `0.2 → 0.09 → 0`. Er liegt vor dem Sternenglühen und markiert die Einflusszone, ohne den Stern zu überstrahlen.
  - *Besitzer-Ring* (`D1`): Kreis bei `baseRadius + 5.5`, Strichstärke `2` für den Spieler und `1.5` für KI-Reiche. Der Spielerring ist durchgezogen, KI-Ringe sind mit `[5, 3]` gestrichelt. Die Farbe ist `borderColor` mit Fallback auf `color` bei Alpha `0.95`.
  - *Besiedelt-Beacon* (`D2`): unverändert besitzunabhängig — smaragdgrüner, pulsierender Ring bei `baseRadius + 10` mit Strichmuster `[4, 4]` und kleinem Knoten. Er bleibt die Aussage „hier ist eine Kolonie", nicht „hier herrscht jemand".
- **Rangfolge der Ringe bleibt erhalten.** Auswahl-Retrakt (zyan, `baseRadius + 14 + Puls`) und Hover-Ring (weiß, `baseRadius + 14`) behalten ihre Bedeutung; der Besitzerring tritt dahinter zurück, ohne verdeckt zu werden. Die Ringe sind bewusst unterschiedlich in Farbe, Strichart und Radius, damit keine Farbe zwei Aussagen trägt.
- **Labels tragen den Besitz mit.** Systemnamen eines besessenen Systems werden in `civ.color` gezeichnet und mit `◆ ` präfixiert; unbesessene, aber besiedelte Systeme behalten `🏛 ` und die smaragdgrüne Farbe. Der Auswahlzustand überschreibt beides mit Zyan. Der Untertitel nennt den Besitzernamen nur bei Auswahl oder `camera.zoom > 1`, damit die Karte bei kleinerem Zoom nicht zuläuft.
- **Legende und Tooltip als erklärende Schicht.** Unten rechts erscheint eine Legende „Territorien" mit Farbmarker (Füllung `color` bei Alpha `0.35`, Rahmen `borderColor`) und Name je Zivilisation, Spielername zyan; sie wird unterhalb des `md`-Breakpoints ausgeblendet und nur bei nicht-leerer Zivilisationsliste gerendert. Der Hover-Tooltip erhält eine Zeile `Territorium:` mit Marker (Füllung Alpha `0.4`, Rahmen `borderColor`, neutral `rgba(148, 163, 184, 0.2)` / `#475569`). Bekannter Besitzer: Name in `civ.color`. Unbekannte, aber gesetzte ID: `Unbekannte Macht` in Amber. Keine ID: `Niemandsland` in Slate.
- **Keine Daten-, Save- oder Engine-Änderung.** `StarSystem.ownerFactionId` bleibt die einzige Besitzwahrheit, das Save-Schema bleibt Version 2, und die Besitzvergabe aus ADR-028 wird nicht angefasst. Die Prop ist optional, sodass bestehende Aufrufer und Tests unverändert kompilieren.

### Begründung
- Ein Halo plus Ring macht Territorium auf einen Blick erfassbar, ohne die Sternengrafik zu ersetzen; der Ring allein wäre bei dicht beieinanderliegenden Systemen zu schwach, der Halo allein zu konturlos.
- Die Unterscheidung „Spieler durchgezogen, KI gestrichelt" kodiert den Unterschied zwischen „mein Territorium" und „fremder Anspruch" ohne zusätzliche Legendenabhängigkeit und bleibt auch bei Farbfehlsichtigkeit lesbar.
- `borderColor` als Ringfarbe liefert auf dem dunklen Hintergrund mehr Kontrast als die oft gesättigte Füllfarbe, während Namen und Legende weiterhin `color` verwenden und damit dieselbe Identität transportieren.
- Der Besiedelt-Beacon bleibt absichtlich besitzunabhängig: Besitz und Kolonisation sind zwei verschiedene Aussagen, die auch getrennt auftreten können (besiedeltes, aber neutrales System).
- Der Legacy-Fallback `'faction-player-home'` verhindert, dass ältere Spielstände ihre Heimatzone verlieren, ohne die Besitzlogik selbst zu ändern.
- Eine optionale Prop mit leerem Default hält die Änderung additiv; der Canvas bleibt ohne Zivilisationsdaten voll funktionsfähig.
- Die zurückhaltenden Alphas (`0.2`/`0.09` im Halo, `0.95` im Ring) verhindern, dass mehrere benachbarte Territorien zu einer undifferenzierten Farbfläche verschmelzen.

### Konsequenzen
- `tsc --noEmit` ist sauber. `npx vitest run` bleibt bei **171 Tests in 14 Dateien** — die Änderung ist rein darstellend und verschiebt keine Engine-Semantik, daher wurden keine neuen Tests ergänzt. `npm run build` bleibt bei 73 Modulen und wächst auf 553,09 kB JS (gzip 154,54 kB); die Vite-Warnung „chunks larger than 500 kB" besteht unverändert fort.
- Die Galaxiekarte zeigt besessene Systeme jetzt ohne Interaktion: Halo, Ring, farbiger Name mit `◆`, optionaler Besitzername im Untertitel sowie Legende und Tooltip-Zeile.
- **Bekannte Einschränkung:** Es gibt kein automatisiertes Canvas-/Visual-Test-Harness. Die Ringe, die Legende und die Tooltip-Zeile sind nur über `tsc`, die unveränderte Suite und eine visuelle Prüfung im Dev-Server abgesichert; die visuelle Abnahme steht noch aus.
- **Bekannte Einschränkung:** Eine gesetzte, aber nicht auflösbare `ownerFactionId` erzeugt keinen Ring und keinen Halo; der Tooltip meldet dann `Unbekannte Macht`. Das ist bewusst ehrlich statt ratend, macht den Besitz auf der Karte aber unsichtbar.
- Der Halo erzeugt pro besessenem System und Frame einen zusätzlichen radialen Verlauf. Bei der aktuellen Systemzahl ist das unkritisch; eine spätere Karte mit deutlich mehr Systemen müsste Halo und Ring gegebenenfalls in einen Offscreen-Layer oder eine gecachte Geometrie überführen.
- Die Legende ist auf kleinen Viewports ausgeblendet; dort bleibt der Tooltip die einzige Besitzanzeige. Eine kompakte mobile Variante ist nicht enthalten.
- Nicht enthalten: Einflussradien über mehrere Systeme, umkämpfte Systeme, Besitzhistorie, animierte Besitzwechsel und eine barrierearme Alternative zur reinen Farbkodierung (Mustervarianten jenseits der Strichart).
- **Nachtrag (ADR-036):** Grenzlinien zwischen Territorien sind inzwischen als durchgehende Voronoi-Kanten umgesetzt; siehe ADR-036. Der Besitz bleibt weiterhin pro System diskret, die genannten übrigen Auslassungen gelten unverändert.

---

## ADR-030: Horizontale, logarithmisch skalierte Detailansicht der Systemkarte

### Kontext
Die Systemkarte zeigte Planeten ausschließlich auf Keplerianischen Umlaufbahnen. Das ist physikalisch lesbar, hat aber zwei Grenzen: Die Orbitradien wachsen linear mit dem Orbitindex, sodass äußere Planeten bei kleinen Fenstern aus dem Bild laufen; und die Winkelposition hängt von der Simulationsphase ab, sodass dieselbe Auswahl bei jedem Öffnen an einer anderen Stelle steht. Für die Planetenauswahl war außerdem nachteilig, dass die Reihenfolge auf dem Schirm nicht der realen Entfernung entsprechen musste. Gefordert war eine zweite, umschaltbare Darstellung, die alle Planeten eines Systems gleichzeitig zeigt, die reale Distanzreihenfolge abbildet, Klickziele zuverlässig trifft und den Spielzustand nicht verändert.

### Entscheidung
- **Zwei Ansichten, ein Zustand.** `SystemMapViewMode = 'orbit' | 'detail'` lebt als React-State in `SystemMapCanvas`, initialisiert aus einem modulweiten `preferredViewMode`. Der Wechsel ist rein visuell: keine Engine-Methode, kein Rundenwechsel, keine Neugenerierung, kein Reset von Orbitphase oder Auswahl.
- **Geometrie als eigenes, zeichenfreies Modul.** `src/ui/systemViewLayout.ts` enthält Sortierung, Orbit- und Detailgeometrie, Scroll-Klemmung und Hit-Tests. Canvas und Vitest-Suite nutzen dieselben Funktionen; es gibt keine zweite, abweichende Trefferlogik im Rendering.
- **Reihenfolge nach realer Distanz.** `sortPlanetsByDistance` sortiert nach `orbitDistanceAu`, bei Gleichstand nach `orbitIndex`, zuletzt nach `id`; die Eingabe bleibt unverändert. `PlanetInspector` verwendet dieselbe Funktion, damit Liste und Achse übereinstimmen.
- **Logarithmische x-Abbildung mit Mindestabstand.** Die Position folgt `log1p(max(0, orbitDistanceAu))`, bei identischer Distanz gleichmäßig über `i / (count - 1)`. Danach werden sequenziell mindestens `DETAIL_MIN_GAP = 132` px erzwungen. Ein einzelner Planet sitzt bei 45 % der verfügbaren Breite, damit er nicht am linken Rand klebt.
- **Radienreservierung statt Dauer-Scrollbalken.** `naturalWidth = width - DETAIL_RIGHT_MARGIN - maxRadius - startX` reserviert den größten Planetenradius, bevor die Achse gestreckt wird. Ein Scrollbalken entsteht dadurch nur bei echtem Überlauf durch den Mindestabstand, nicht bei jedem normalen System. `contentWidth` und `maxScroll` werden aus der letzten belegten Kante abgeleitet.
- **Zoomunabhängige Detailradien.** `detailPlanetRadius` liefert 14–36 px und skaliert Gasriesen um 1.3; die Orbitansicht behält `planetVisualRadius` mit Zoomfaktor und Gasriesen-Skalierung 1.45. Monde erscheinen in beiden Ansichten als maximal vier Punkte plus `+N`.
- **Auswahl bleibt sichtbar.** `findScrollForPlanet` zentriert den gewählten Planeten auf 45 % der sichtbaren Breite (`contentWidth - maxScroll`) und klemmt am Rand; der Canvas scrollt bei Auswahlwechsel entsprechend. `hitTestPlanets` wählt bei überlappenden Treffern den nächstgelegenen und akzeptiert im Canvas 12 px Toleranz.
- **Abwählen ist erlaubt.** `onSelectPlanet` ist `(planet: Planet | null) => void`; ein Klick ins Leere ruft `engine.selectPlanet(null)` auf. Die Engine unterstützt das Abwählen bereits.
- **Keine Persistenz.** Die bevorzugte Ansicht gilt nur für die Sitzung; es entstehen keine Save-Felder und keine Schema-Migration.

### Begründung
- Die logarithmische Achse staucht große Distanzunterschiede und spreizt enge innere Bahnen, sodass ein System mit Außenplanet und mehreren inneren Planeten in einer Zeile lesbar bleibt. Eine lineare Achse würde entweder die inneren Planeten überlappen lassen oder die äußeren aus dem Bild schieben.
- Der erzwungene Mindestabstand ist nötig, weil die Log-Abbildung bei sehr ähnlichen Distanzen beliebig kleine Abstände erzeugen kann; ohne ihn wären Klickziele und Monde nicht mehr trennbar.
- Die Reservierung des größten Radius verhindert einen permanenten Scrollbalken, der bei fast jedem System nur wenige Pixel breit wäre und die Ansicht ohne echten Mehrwert verkleinert. Der Balken bleibt als ehrliche Rückmeldung für echte Platznot erhalten.
- Ein zeichenfreies Layoutmodul macht die Geometrie testbar, ohne ein Canvas-Harness zu benötigen; genau die Fehlerklasse „Rendering und Hit-Test laufen auseinander" wird damit ausgeschlossen.
- Der Modus als reiner UI-State hält die Engine frei von Darstellungswissen und garantiert, dass Umschalten keinen Spielzug kostet.
- Die Sortierung nach `orbitDistanceAu` statt `orbitIndex` macht die Ansicht auch dann korrekt, wenn Generatoren oder Spielstände die Indizes nicht streng monoton vergeben.

### Konsequenzen
- `tsc --noEmit` ist sauber; `npx vitest run` meldet **187 Tests in 15 Dateien**. Neu ist `tests/systemViewLayout.test.ts` mit 16 Tests für Sortierung, Monotonie, Mindestabstände, Stern-/erster-Planeten-Position, Gleichstand, Scroll-Klemmung, Auswahlzentrierung, leeres System, Hit-Tests, Radien und Orbitgeometrie.
- Die Systemkarte bietet jetzt einen Umschalter „Umlaufbahnen"/„Detailansicht". Die Detailansicht zeigt alle Planeten in Distanzreihenfolge, scrollt per Drag oder Mausrad (`DETAIL_WHEEL_STEP = 120`), zeichnet eine AU-Skala bei ausreichender Höhe und eine Scrollbar bei Überlauf.
- Ein Klick ins Leere hebt die Auswahl auf; der `PlanetInspector` folgt der neuen Sortierung.
- **Bekannte Einschränkung:** Es gibt weiterhin kein automatisiertes Canvas-/Visual-Test-Harness; Farben, Tooltip, Scrollbar und Ruler sind nur über `tsc`, die Geometrie-Tests und eine visuelle Prüfung im Dev-Server abgesichert. Die visuelle Abnahme steht aus.
- **Bekannte Einschränkung:** Die Detailansicht zeigt keine Gürtel, weil `StarSystem` kein Belt-Feld besitzt. Sie zeigt auch keine Bahnneigung, keine Resonanzen und keine echten Bahnradien, sondern ausschließlich die mittlere Entfernung.
- **Bekannte Einschränkung:** Die Achse ist eine reine Anzeige-Ordnung, keine maßstabsgetreue Karte; Abstände zwischen zwei Planeten lassen sich nicht als Verhältnis realer AU-Werte ablesen.
- **Bekannte Einschränkung:** Die Sitzungspräferenz geht beim Neuladen verloren; eine Persistenz im Save oder in `localStorage` ist bewusst nicht enthalten.
- Nicht enthalten: freie Sortierungen, Filter, Jahreszeiten-/Neigungsebene, animierte Flugbahnen von Sonden in der Detailansicht und Barrierearmut jenseits der bestehenden Farb- und Textkodierung.

---

## ADR-031: Monde und Asteroidengürtel als additive Save-v3-Daten

### Kontext
Die Systemansicht zeigte Planeten, aber keine echten Monde und keine Asteroidengürtel. `Planet.moonsCount` war nur eine Anzeigezahl ohne Individualdaten; `StarSystem` besaß kein Gürtelfeld. Gefordert waren detailgetreue Begleiter und Gürtel in beiden Darstellungen, ohne die bestehende Galaxie- und Planetengenerierung zu verändern und ohne alte Spielstände zu brechen.

### Entscheidung
- **Additive Datenfelder.** `Planet.moons?: Moon[]` ergänzt `moonsCount`; `StarSystem.asteroidBelts?: AsteroidBelt[]` ist neu. Beide Felder sind optional, damit ältere Objekte und Test-Fixtures ohne Anpassung gültig bleiben.
- **Eigene, isolierte PRNG-Ströme.** Monde nutzen `${galaxySeed}:${systemId}:${planetId}:moons`, Gürtel `${galaxySeed}:${systemId}:belts`. Dadurch bleiben die bestehenden Ströme `${galaxySeed}:${systemId}:planets` und die Systemgenerierung bitgenau unverändert; Monde und Gürtel sind rein additiv.
- **Monde.** `PlanetGenerator.generateMoons` erzeugt 0–14 Begleiter mit stabiler ID `<planetId>-M<index>`, Typ (`rocky`, `icy`, `volcanic`, `metallic`), Radius, Umlaufzeit, Farbe und `isMajor`. Gasriesen erhalten bis zu vier Hauptmonde (`index <= 4 && prng.next() < 0.85`), alle anderen Planeten genau einen Hauptmond.
- **Gürtel.** `GalaxyGenerator.generateAsteroidBelts` platziert null bis zwei Gürtel in den Lücken der nach Entfernung sortierten Planeten. Der Roll lautet `< 0.45` → ein Gürtel, `< 0.6` → zwei, sonst keiner; `innerAu`/`outerAu`/`midpointAu`, `density` (0,35–0,85) und `composition` sind deterministisch und auf zwei Dezimalen gerundet.
- **Save v3.** `CURRENT_SAVE_VERSION = 3`; die v2→v3-Migration setzt fehlende `asteroidBelts` auf `[]` und erzeugt Legacy-Monde deterministisch aus `moonsCount` (`createLegacyMoons`). Es wird kein Zufall verwendet und kein bestehender Planet verändert.
- **Darstellung.** Die Orbitansicht zeichnet Gürtel als deterministische Staubringe mit Kamera-Grenzen; die Detailansicht zeichnet Gürtelbänder zwischen den Planeten. Echte Monde erscheinen in beiden Ansichten als maximal vier Punkte plus `+N`; Planeten ohne `moons`-Array fallen auf die alte `moonsCount`-Punktreihe zurück.
- **Inspector.** `PlanetInspector` zeigt die Mondanzahl aus `moons.length` (Fallback `moonsCount`) und listet die Monde nach dem Sondenscan als Chips.

### Begründung
- Optionale Felder und eigene Seeds machen die Erweiterung rückwärtskompatibel und vermeiden eine unbeabsichtigte Neugenerierung bestehender Galaxien.
- Die Trennung von `moonsCount` (Kompatibilität) und `moons` (Detaildaten) erlaubt alten Spielständen und Fixtures, ohne Migration weiterzulaufen, während neue Spielstände vollständige Daten tragen.
- Die deterministische Legacy-Migration verhindert, dass ein alter Spielstand nach dem Laden plötzlich andere Monde zeigt oder Zufallszustände verschiebt.
- Die Wiederverwendung der bestehenden Layout-Helfer hält Rendering und Klickziele konsistent und vermeidet eine zweite Geometrie.

### Konsequenzen
- `tsc --noEmit` ist sauber; `npm test` meldet **201 Tests in 16 Dateien**. Neu ist `tests/moons_and_belts.test.ts` mit 8 Tests für Mondstruktur, Hauptmond-Regel, Determinismus, Gürtelstruktur, v2→v3-Migration, v3-Roundtrip und die Ablehnung von v4.
- `tests/galaxy.test.ts` prüft die geladene Version gegen `CURRENT_SAVE_VERSION` statt gegen die Konstante `2`.
- **Bekannte Einschränkung:** Es gibt weiterhin kein automatisiertes Canvas-/Visual-Test-Harness; Staubring-, Band- und Mondfarben sind nur über `tsc`, die Geometrie-/Daten-Tests und eine visuelle Prüfung im Dev-Server abgesichert. Die visuelle Abnahme steht aus.
- **Bekannte Einschränkung:** Monde haben keine eigenen Bahnneigungen, Resonanzen oder physikalisch echten Radien; die Werte sind plausibel skaliert, aber keine Ephemeriden.
- **Bekannte Einschränkung:** Gürtel sind eine statische Verteilung ohne Kollisionen, Bergbau oder Ressourcenmechanik; sie sind ausschließlich Darstellung und persistierte Beschreibung.
- **Bekannte Einschränkung:** Bei mehr als vier Monden werden nur die Hauptmonde plus `+N` gezeigt; die übrigen Daten sind vorhanden, aber nicht einzeln in der Karte anklickbar.

---

## ADR-032: Wirtschaft Stufe A – Staatskasse, Steuersatz, Korruption und Approval

### Kontext
Bisher erwirtschaftete die Kolonieökonomie ausschließlich lokale Ressourcen (Nahrung, Produktion, Energie, Mineralien, seltene Ressourcen, Forschung, Einfluss); eine übergeordnete Staatskasse, Besteuerung oder Zufriedenheit existierte nicht. Als Vorbild dient das Wirtschaftsmodell von *Distant Worlds Universe*, das Steuereinnahmen je Kolonie, Korruption und Zufriedenheit (Approval) kennt. Übernommen wird nur die Mechanik als eigenständige Reimplementierung mit eigener Balance; Code, Strings, Assets und Balancetabellen des Vorbilds werden nicht kopiert. Bewusster Scope: **Stufe A (Minimal)** – Credits, Steuersatz pro Kolonie, Korruption und Approval als Koloniefelder mit sichtbarer Anzeige; kein Privatsektor, keine Wartungsausgaben.

### Entscheidung
- **Staatskasse je Zivilisation.** `Civilization.treasury: number` ist ein Pflichtfeld. Startwerte: 500 Credits für den Spieler, 300 je KI-Fraktion (`civManager.ts`). In Stufe A gibt es keine Ausgaben; die Staatskasse akkumuliert nur und ist das Fundament für spätere Wartungs- und Baukosten.
- **Steuersatz pro Kolonie.** `Colony.taxRate` ist optional und wird über `EconomyEngine.normalizeTaxRate` normalisiert: fehlende oder ungültige Werte fallen auf 30 % zurück, gültige Werte werden auf `0…60` geklemmt und ganzzahlig gerundet (`DEFAULT_TAX_RATE = 30`, `MIN_TAX_RATE = 0`, `MAX_TAX_RATE = 60`). Der Regler im `ColonyManagementModal` schreitet in 5-%-Schritten.
- **Korruption.** `calculateCorruption(taxRate, tier)` liefert einen auf drei Dezimalen gerundeten Anteil: Basis je Entwicklungstufe Außenposten 0,35 / Siedlung 0,2 / Kolonie 0,1, plus `(max(0, taxRate − 40) / 100) · 0,5` und Obergrenze 0,8. Bei 30 % Steuersatz und Außenposten ergibt das 0,35.
- **Approval.** `calculateApproval(taxRate, tier)` berechnet `50 − (taxRate − 30) · 0,8` plus Stufenbonus (Außenposten 0 / Siedlung 5 / Kolonie 10), geklemmt auf `0…100` und gerundet. Bei 30 % und Außenposten ergibt das exakt 50, bei 60 % 26, bei 0 % 74.
- **Wachstumswirkung.** `calculateApprovalGrowthFactor(approval)` bildet `0,5 + approval/100`, geklemmt auf `0,5…1,5`; bei Approval 50 ist der Faktor exakt 1,0, das bisherige Wachstum bleibt also unverändert. Der Faktor multipliziert den positiven Wachstumsfortschritt zusätzlich zum Habitabilitätsfaktor.
- **Steuereinnahmen.** `calculateTaxRevenue(colony)` berechnet `Bevölkerungseinheiten · 6 · Steuersatz/100 · (1 − Korruption)` und rundet auf eine Dezimale. `Bevölkerungseinheiten` sind `max(1, floor(pop/1000))` ab 100 Einwohnern, sonst die Einwohnerzahl selbst. Referenzwerte: 1,2 Credits/Runde bei 1.000 Einwohnern, Außenposten und 30 %; 2,0 bei 60 %; 1,4 bei Siedlung und 30 %.
- **Einmalige Gutschrift.** `EconomyEngine.simulateTurnEconomy` berechnet `taxRevenue` je Kolonie **vor** dem Bevölkerungswachstum und legt die Summe je Zivilisation in `taxRevenueByCiv` ab. `GameEngine.endTurn()` schreibt diese Summe in Schritt „B2. Staatskasse" genau einmal pro Runde und Zivilisation gut; die Ökonomiesimulation selbst verändert die Staatskasse nicht. Das verhindert Doppelzählung.
- **Gründung und Laden.** `ColonyManager.foundColony` setzt Steuersatz 30, Korruption 0, Approval 50 und Steuereinnahmen 0 und ruft anschließend die erste Ökonomiesimulation auf, sodass die Kolonie sofort mit den berechneten Finanzwerten (30 / 0,35 / 50 / 1,2) startet. `loadColonies` ergänzt fehlende Finanzfelder über `EconomyEngine`.
- **Ereignis und UI.** Neues Event `colony:taxRateChanged` (`{ colonyId, taxRate }`). `GameEngine.setColonyTaxRate(colonyId, rate)` normalisiert den Wert, aktualisiert Korruption, Approval und Steuereinnahmen der Kolonie und emittiert das Ereignis. Der `ColonyManagementModal` zeigt vier Finanzkacheln (Staatskasse, Steuersatz, Korruption, Approval) und den Steuersatz-Regler.
- **Save v4.** `CURRENT_SAVE_VERSION = 4`; die v3→v4-Migration ergänzt `Civilization.treasury` (Fallback 500/300) sowie `taxRate`, `corruption`, `approval` und `taxRevenue` je Kolonie über `EconomyEngine` mit `developmentTier ?? 'outpost'`. Ältere Versionen werden weiterhin über die bestehenden Migrationsstufen geführt.

### Begründung
- Die optionalen Koloniefelder halten bestehende `Colony`-Literale in Tests und Fixtures gültig, während `treasury` als Pflichtfeld die neue Invariante „jede Zivilisation hat eine Staatskasse" erzwingt.
- Die Normalisierung an einer Stelle (`normalizeTaxRate`) verhindert inkonsistente Werte aus UI, Migration und KI und macht den Steuersatz robust gegen fehlende oder manipulierte Eingaben.
- Die einmalige Gutschrift in `endTurn` statt in der Ökonomiesimulation trennt lokale Produktion von Reichsfinanzen und verhindert, dass mehrere Aufrufe der Simulation pro Runde die Staatskasse mehrfach erhöhen.
- Approval 50 → Faktor 1,0 hält das bestehende Bevölkerungswachstum unverändert und macht die neue Mechanik zu einer additiven Erweiterung statt einer stillen Rebalance.
- Die eigene, dokumentierte Balance (30 % Standard, Korruptionsbasen 0,35/0,2/0,1, 6 Credits je Bevölkerungseinheit) ist bewusst gesetzt und nicht aus dem Vorbild übernommen.

### Konsequenzen
- `npm run lint` (`tsc --noEmit`) ist sauber; `npm test` meldet **209 Tests in 17 Dateien**. Neu ist `tests/economy_stage_a.test.ts` mit 8 Tests für Normalisierung, Korruption, Approval, Wachstumsfaktor, Steuereinnahmen, Startwerte, einmalige Treasury-Gutschrift und die Finanzstartwerte einer gegründeten Kolonie.
- `tests/moons_and_belts.test.ts` prüft die aktuelle Save-Version gegen `CURRENT_SAVE_VERSION` (jetzt 4) und lehnt eine künftige Version 5 ab.
- Die Kolonieverwaltung zeigt die Finanzlage jetzt direkt neben Bevölkerung und Wachstum; der Steuersatz ist ohne Rundenwechsel anpassbar und wirkt ab der nächsten Simulation.
- **Bekannte Einschränkung:** Stufe A enthält keine Ausgaben, keine Gebäude-/Flottenwartung und keinen Privatsektor; die Staatskasse wächst nur. Wartungskosten und Privatsektor-Mechanik bleiben Stufe B vorbehalten.
- **Bekannte Einschränkung:** Korruption und Approval sind rein kolonielokal und stufenabhängig; es gibt keine Reichs-, Distanz-, Technologie- oder Regierungseffekte und keine Zufriedenheitsereignisse.
- **Bekannte Einschränkung:** Die Balance ist eine eigene, plausible Setzung ohne Kalibrierung am Vorbild; die Zahlen sind dokumentiert, aber nicht empirisch gegen Spielverläufe abgestimmt.
- **Bekannte Einschränkung:** Es gibt weiterhin kein Canvas-/Visual-Test-Harness; die Darstellung der Finanzkacheln und des Reglers ist nur über `tsc`, die Daten-/Logiktests und eine visuelle Prüfung im Dev-Server abgesichert.

---

## ADR-033: Wirtschaft Stufe B – Wartungs- und Baukosten aus der Staatskasse

### Kontext
Stufe A (ADR-032) führte Staatskasse, Steuersatz, Korruption und Approval ein, ließ die Staatskasse aber ausschließlich wachsen: Es gab keine laufenden Ausgaben und keine Baukosten in Credits. Damit war der Steuersatz ohne Zielkonflikt und die Staatskasse ohne wirtschaftliche Funktion. Stufe B schließt diese Lücke mit laufenden Gebäudewartungskosten, einmaligen Credit-Baukosten und der zugehörigen UI. Das Vorbild *Distant Worlds Universe* kennt ebenfalls Wartungs- und Baukosten; übernommen wird wie in Stufe A nur die Mechanik als eigenständige Reimplementierung mit eigener Balance.

### Entscheidung
- **Datenmodell additiv.** `BuildingDef` erhält `creditCost?: number` und `creditUpkeepPerLevel?: number`; `UpkeepCosts` erhält `credits?: number`; `BuildProject` erhält `creditCost?: number`. Es gibt bewusst **kein** `Colony.creditUpkeep`-Feld: UI und Ausgabenlogik lesen den bereits je Kolonie berechneten Wert `colony.upkeep.credits ?? 0`. Alle neuen Felder sind optional, damit bestehende `Colony`-, `BuildingDef`- und `BuildProject`-Literale in Tests und Fixtures gültig bleiben.
- **Credit-Wartung.** `EconomyEngine.calculateYields` summiert für jedes aktive Gebäude `(creditUpkeepPerLevel ?? 0) · Stufe` und rundet das Ergebnis auf eine Dezimale. Die Wartung ist damit dieselbe Pro-Kolonie-Größe wie der bestehende Energie-/Mineralunterhalt und wird in `UpkeepCosts.credits` sichtbar.
- **Baukosten in Credits, sofort abgezogen.** `BuildQueueManager.queueBuilding` prüft bezahlbare Credits, zieht sie beim Einreihen ab und schreibt `creditCost` in das Projekt. Die Prüfreihenfolge ist Mineralien → seltene Ressourcen → Credits; scheitert eine Prüfung, wird nichts abgezogen. Bei zu kleiner Staatskasse lautet der Reason-Text „Nicht genügend Credits (Benötigt: … / Staatskasse: …)".
- **Ausbaukosten.** `queueUpgrade` berechnet `Math.round((creditCost ?? 0) · 0,75 · Zielstufe)` und zieht diesen Betrag ebenfalls sofort ab.
- **Optionale Treasury-Bindung.** Neuer **letzter optionaler Parameter** `treasuryHolder?: { treasury: number }` an `queueBuilding(...)` und `queueUpgrade(...)`. Ohne Holder werden keine Credits geprüft oder abgezogen; das hält Alt-Tests und den direkten Aufruf in `TestRunnerModal` unverändert lauffähig. `GameEngine.queueBuilding`/`queueUpgrade` ermitteln den Holder aus der Zivilisation der Kolonie; `App.tsx` bleibt unverändert.
- **Ausgaben in `endTurn`.** Der Schritt „B2. Staatskasse" summiert je Zivilisation die Steuereinnahmen aller Kolonien und zieht die Credit-Wartung aller Kolonien ab: `treasury = max(0, round1(treasury + revenue − maintenance))`. Es entstehen **keine Schulden**; die Untergrenze ist 0.
- **Balance.** Wartung je Level (`credits`): Stadtzentrum 0,2; Hydroponik 0,3; Solarfeld 0,2; Geothermiekraftwerk 0,4; Mineralienextraktor 0,4; Fabrikkomplex 0,6; Schmelzraffinerie 0,7; Forschungslabor 0,5; Kommunikationsrelais 0,3; Pionierkaserne 0,5. Einmalige Baukosten: 0 / 30 / 25 / 50 / 20 / 45 / 60 / 35 / 35 / 40 in derselben Reihenfolge.
- **UI.** Der Finanzblock im `ColonyManagementModal` zeigt zusätzlich `Wartung: −… Cr/Rd.`; Baukarten zeigen `◈`-Kosten und sperren den Bau bei unzureichender Staatskasse; der Ausbau-Button nennt die Credit-Kosten und die neue Unterhaltslast.
- **Kein Save-Versions-Bump.** `CURRENT_SAVE_VERSION` bleibt 4. Die neuen Felder liegen ausschließlich in `BuildingDef` (Code-Katalog, nicht persistiert) und in optionalen Laufzeitfeldern von `BuildProject`; alte Spielstände laden unverändert, neue schreiben lediglich optional `creditCost` mit.

### Begründung
- Optionale Felder und der optionale Treasury-Holder halten die Erweiterung rückwärtskompatibel und vermeiden eine Änderung an allen bestehenden Aufrufern.
- Der Abzug beim Einreihen entspricht dem bestehenden Verhalten für Mineralien und seltene Ressourcen und verhindert, dass parallele Bauaufträge dieselbe Staatskasse überzeichnen.
- Die Prüfreihenfolge Material vor Credits verhindert Teilabzüge und macht Fehlschläge atomar.
- Die Wartung als Pro-Kolonie-Wert in `UpkeepCosts.credits` hält die Ausgabenlogik an einer Stelle und lässt die UI denselben Wert lesen, den `endTurn` verrechnet.
- Die Untergrenze 0 verhindert negative Staatskassen und macht die KI, die keine Credit-Baukosten zahlt, automatisch schuldenfrei.
- Ein Save-Bump wäre irreführend, weil sich das persistierte Schema nicht ändert.

### Konsequenzen
- `npm run lint` (`tsc --noEmit`) ist sauber; `npm test` meldet **217 Tests in 18 Dateien**. Neu ist `tests/economy_stage_b.test.ts` mit 8 Tests für Katalog-Creditfelder, Wartungsskalierung, Baukostenabzug, Abwärtskompatibilität ohne Holder, Ablehnung bei zu kleiner Staatskasse, Ausbaukosten, `endTurn`-Ausgaben mit Floor 0 und Save-Rundreise.
- `tests/economy_stage_a.test.ts` prüft die Treasury-Gutschrift jetzt netto nach Wartung, weil `endTurn` Ausgaben verrechnet.
- Die Staatskasse ist erstmals eine echte Ressource: Zu hohe Steuern senken Approval und Wachstum, zu viele Gebäude zehren die Einnahmen auf.
- **Bekannte Einschränkung:** KI-Zivilisationen zahlen keine Credit-Baukosten, weil der KI-Baupfad keinen Treasury-Holder übergibt; ihre Wartung läuft, wird aber durch die Untergrenze 0 praktisch neutralisiert. Eine KI-Finanzplanung ist nicht enthalten.
- **Bekannte Einschränkung:** Flotten- und Einheitenunterhalt kosten weiterhin nur Energie bzw. Mineralien, keine Credits; Schiffbau bleibt creditfrei.
- **Bekannte Einschränkung:** Es gibt keine Kreditaufnahme, keine Schulden, keine Zinsen und keine Zahlungsunfähigkeitsfolgen; die Staatskasse kann nur bis 0 fallen.
- **Bekannte Einschränkung:** Die Balance ist eine eigene, plausible Setzung ohne Kalibrierung am Vorbild; die Zahlen sind dokumentiert, aber nicht empirisch gegen Spielverläufe abgestimmt.
- **Bekannte Einschränkung:** Es gibt weiterhin kein Canvas-/Visual-Test-Harness; Wartungszeile, `◈`-Kosten und gesperrte Baukarten sind nur über `tsc`, die Logiktests und eine visuelle Prüfung im Dev-Server abgesichert.

## ADR-034: Kohärente Planetenoberflächen durch Mehrfeld-Rauschen und Quantil-Bänder

### Kontext
Der bisherige `SurfaceGenerator` zog für jede Kachel Biom und Elevation mit unabhängigen Zufallsrolls aus einem `Mulberry32`. Das Ergebnis war reproduzierbar, aber räumlich inkohärent: Ozeane, Wüsten und Gebirge lagen als Rauschen ohne zusammenhängende Landmassen nebeneinander. Zusätzlich konnten Landezonen auf unpassierbaren oder hazard-behafteten Kacheln liegen, sodass Koloniegründungen indirekt vom Zufall abhingen. Vorbild der Mechanik ist die Weltgenerierung von *Dwarf Fortress*: mehrere, getrennt verrauschte Felder (Elevation, Feuchtigkeit, Vulkanismus), die über Quantile in Höhenbänder und daraus in Biome übersetzt werden. Übernommen wird ausschließlich die Mechanik als eigenständige Reimplementierung; Code, Strings, Assets und Balancetabellen wurden nicht kopiert. Die Analyse der lokalen Installation beschränkte sich auf Strings und RTTI, da die Binaries gestrippt sind.

### Entscheidung
- **Mehrfeldmodell.** Neu ist `src/surface/terrainNoise.ts` mit `ValueNoise2D` (FNV-1a-Lattice, Quintic-Smoothstep, `sample` und `fractal`). Der Generator leitet aus `u = (q + r/2 + 0.5) / width` und `v = (r + 0.5) / height` fünf getrennte Felder ab: `elevationRaw` (0,7·Fraktal + 0,3·Detail), `moisture`, `temperature` (Basis + Breitengrad + Rauschen), `volcanism` und `impact`. Jedes Feld besitzt eine eigene Noise-Instanz mit Seed `${surfaceSeed}:<feld>`; der Oberflächen-Seed bleibt `${galaxySeed}:${planet.id}:surface:v2`.
- **Planetenprofile.** `getProfile(planetType)` liefert `seaFraction`, Landband-Gewichte `[tief, mittel, hoch]`, `temperatureBase`, `moistureBase`, `volcanismBase` und `hostile`. Ozeanplaneten haben 55 % Seeanteil, Wüsten 2 %, Eis 35 %, Gesteinsplaneten 20 %; Gasriesen haben keinen Meeresspiegel und werden vollständig als Land behandelt.
- **Quantil-Bänder statt Zufallsrolls.** Alle Kacheln werden nach `elevationRaw` sortiert (Tie-Break über den Koordinatenschlüssel) und deterministisch in die Stufen 0–3 aufgeteilt: 0 = Ozean, 1 = Tiefland, 2 = Mittelland, 3 = Hochland. Die Landbänder folgen den Profilgewichten; ein Guard stellt mindestens eine Landkachel sicher. Die Elevationsskala bleibt damit 0–3 und ist zu `PlanetSurfaceCanvas` und `HexTileInspector` kompatibel.
- **Biom aus Band und Feldern.** Band 0 ist immer `ocean`, Band 3 immer `mountains`. Band 2 wird bei hohem Vulkanismus `volcanic`, sonst `hills`. Band 1 wählt bei `hostile`-Profilen zwischen `volcanic` und `toxic`; sonst entscheiden Impakt (`impact_crater`), Kälte (`tundra`), Trockenheit (`desert`) und Feuchtigkeit (`fungal_forest`) vor dem Fallback `plains`.
- **Geschützte Landezone.** `repairLandingZone` bestimmt den Kern als `(floor(width/4), floor(height/2))` plus seine sechs Nachbarn. Jede Zone-Kachel wird bei Bedarf per deterministischem Band-Tausch auf Stufe 1 oder 2 gehoben; `ensureArableBiome` macht sie anschließend arable (`plains`, `fungal_forest` oder `hills`) und die Zone wird grundsätzlich von Hazards ausgenommen.
- **Ressourcen und Gefahren.** `depositRoll < 0,28` erzeugt auf allen Nicht-Ozean-Kacheln ein Vorkommen; Ozeankacheln tragen nie Deposits. Hazards nutzen einen Schwellwert von 0,25 bei `habitability < 40` und sonst 0,08 und respektieren die geschützte Zone; die Beschreibung stammt aus `getHazardDescription(biome, rng)`.
- **Versionierung.** `GENERATOR_VERSION` steigt auf 2 und wird als `generatorVersion` in der Oberfläche persistiert. Alte Spielstände mit Version 1 werden weiterhin geladen; neu generierte Oberflächen tragen Version 2.
- **Kein Save-Versions-Bump.** `CURRENT_SAVE_VERSION` bleibt 4, weil sich das persistierte Schema nicht ändert, sondern nur die Werte innerhalb bestehender Felder.

### Begründung
- Getrennt verrauschte Felder erzeugen zusammenhängende Landmassen, Klimagürtel und Vulkanregionen, ohne dass eine teure Simulation nötig ist.
- Quantil-Bänder erzwingen die im Profil dokumentierte Wasser-Land-Verteilung exakt und machen die Generierung testbar, statt sie von der Noise-Verteilung abhängig zu lassen.
- Die Ableitung des Bioms aus Band plus Feldern verhindert Widersprüche wie Gebirge im Ozean oder Wüsten auf Hochland.
- Eine garantierte arable, hazard-freie Landezone entfernt eine Klasse von Startfehlern, ohne die Karte insgesamt zu glätten.
- Die Trennung von `depositRoll` und `hazardRoll` hält Vorkommen und Gefahren unabhängig und erlaubt, Hazard-Schwellen an die Habitabilität zu koppeln.
- Ein Save-Bump wäre irreführend, weil alte Stände unverändert laden und die Version bereits im Oberflächenobjekt steckt.

### Konsequenzen
- `npm run lint` (`tsc --noEmit`) ist sauber; `npm test` meldet **225 Tests in 19 Dateien**. Neu ist `tests/surface_generator.test.ts` mit 8 Tests für Determinismus, Seed-Abhängigkeit, Ozean-/Land-Anteile, Landezone, Biom-/Elevations-Konsistenz, Quantil-Invarianten, Deposits und Versions-/Seed-Metadaten.
- `docs/ARCHITECTURE.md` § 2.3 beschreibt das Mehrfeldmodell, die Quantil-Bänder und die geschützte Landezone.
- Bestehende Tests, die konkrete Koordinaten besiedeln, bleiben unverändert grün, weil die Landezone arable und hazard-frei ist.
- **Bekannte Einschränkung:** Die Biomwahl kann bei vulkanischen und toxischen Profilen von `BIOME_CATALOG.baseElevation` abweichen, weil das Biom dort aus dem Feld statt aus dem Band folgt; die UI zeigt weiterhin die Band-Elevation.
- **Bekannte Einschränkung:** Die Profil- und Schwellwerte sind eine eigene, plausible Setzung ohne Kalibrierung am Vorbild; sie sind im Code dokumentiert, aber nicht empirisch gegen Spielverläufe abgestimmt.
- **Bekannte Einschränkung:** Die Noise-Implementierung ist bewusst einfach (Value-Noise, kein Simplex/Perlin); sie erzeugt keine Flussläufe, keine Plattentektonik und keine globalen Klimamodelle.

## ADR-035: Deterministische KI-Diplomatie als eigenständiger Rundenakt

### Kontext
Nach ADR-028 besaßen KI-Reiche Territorium, Kolonien und Flotten, erklärten aber nie Krieg. Damit blieb der Kampf (ADR-025) im Normalspiel nur dann auslösbar, wenn der Spieler selbst über das `DiplomacyModal` Krieg erklärte; KI-Flotten verteidigten sich passiv, griffen aber nichts an. Die Roadmap führte „KI-Diplomatie (Kriegserklärungen und Friedensschlüsse durch KI-Reiche), damit Kampf im Normalspiel ohne manuelle Kriegserklärung auslösbar wird" als offenen Punkt. Gefordert war der kleinste Schritt, der den Kriegszustand erzeugt: keine Invasions-KI, keine Zielplanung, keine neuen Save-Felder und keine Zufallsentscheidungen.

### Entscheidung
- **Erwartungswertung über einen Snapshot.** `AiDiplomacyManager` hält keinen eigenen Zustand. Die `GameEngine` baut je Runde `AiDiplomacyCivSnapshot[]` mit `id`, `isPlayer`, `colonyCount` (`getColoniesByCivId(...).length`) und `militaryStrength` (gerundete Summe aus Angriff und Hülle aller Flotten über `getFleetsForCiv`/`getFleetStrength`). Alle Beziehungen liegen weiterhin im `DiplomacyManager`.
- **Rundenakt als Schritt 1c.** `endTurn` ruft `aiDiplomacyManager.executeTurn(currentTurn, snapshot)` nach dem KI-Flottenzug (1b) und vor der globalen Simulationsphase auf. Die Kriegserklärung liegt damit vor `fleetManager.advanceTurn` und vor `resolveBattles`; ein frisch erklärter Krieg kann im selben Zug zu einem Gefecht führen, wenn sich verfeindete Flotten bereits im selben System befinden.
- **Feste, dokumentierte Schwellen.** `AI_DIPLOMACY_GRACE_TURNS = 12`, `AI_WAR_CHECK_INTERVAL = 4` (Prüftage 12, 16, 20, …), `AI_MAX_WARS_PER_CIV = 1`, `AI_PEACE_MIN_WAR_TURNS = 6`, `AI_PEACE_COOLDOWN_TURNS = 10`, `AI_MAX_WAR_TURNS = 18`, `AI_WAR_STRENGTH_RATIO = 1.2`, `AI_MIN_MILITARY_STRENGTH = 80`.
- **Frieden zuerst, dann Krieg.** `executeTurn` prüft zuerst alle bestehenden Kriege. Vor `AI_PEACE_MIN_WAR_TURNS` geschieht nichts. Zwischen 6 und 17 Kriegsrunden bittet nur die schwächere Seite (bei Gleichstand die lexikografisch kleinere ID) um Frieden, und nur wenn diese Seite kein Spieler ist. Ab `AI_MAX_WAR_TURNS` (Kriegsmüdigkeit) schließt die erste Nicht-Spieler-Seite des Paars unabhängig von der Stärke Frieden. Der Aufruf läuft über `DiplomacyManager.makePeace`, dessen eigenes `PEACE_MIN_WAR_TURNS = 3` damit immer erfüllt ist.
- **Kriegserklärung nur an Prüftagen und nur mit Überlegenheit.** Ein Reich ist nur Angreifer, wenn es kein Spieler ist, mindestens eine Kolonie besitzt, `militaryStrength >= 80` erreicht, noch keinen laufenden Krieg hat (`getWarCountForCiv < 1`) und ein zulässiges Ziel findet. Zulässig ist ein Ziel mit mindestens einer Kolonie, ohne laufenden Krieg, ohne Krieg gegen den Angreifer, außerhalb des `AI_PEACE_COOLDOWN_TURNS`-Fensters seit dem letzten Frieden und ohne bereits erreichten `AI_MAX_WARS_PER_CIV`. Der Angreifer muss `max(80, Zielstärke · 1,2)` erreichen.
- **Zielwahl und Determinismus.** Ziel ist das schwächste zulässige Reich; bei Gleichstand entscheidet die lexikografisch kleinere `id`. Die Initiatoren werden ebenfalls nach `id` sortiert. Nach der **ersten erfolgreichen Kriegserklärung** bricht die Schleife ab: pro Prüftag erklärt höchstens ein Reich einen Krieg. Dadurch kann der Spieler nicht in derselben Runde von mehreren KI-Reichen gleichzeitig angegriffen werden.
- **Idempotenz.** Das Ergebnisobjekt (`declaredWars`, `peaceTreaties`) wird pro Aufruf neu erzeugt; ein zweiter Aufruf in derselben Runde findet keine offenen Paare mehr und erzeugt keine doppelten Events.
- **Kein Save-Bump.** `CURRENT_SAVE_VERSION` bleibt 4. Der Manager persistiert nichts; Kriege und `sinceTurn` stecken bereits in `DiplomacyPair` (Save-Feld `diplomacy`).

### Begründung
- Ein zustandsloser Manager, der nur den `DiplomacyManager` mutiert, hält die Wahrheit über Beziehungen an genau einer Stelle und macht ältere Spielstände automatisch kompatibel.
- Ein Snapshot statt direkter Zugriffe auf Kolonie- und Flottenmanager hält die Entscheidungslogik ohne Engine, ohne Speicher und ohne UI testbar; die Tests können beliebige Stärkeverhältnisse vorgeben.
- „Schwächstes Ziel zuerst" ist bewusst einfach: Es ist erklärbar, konvergiert, erzeugt plausible Angriffe gegen den Spieler und benötigt keine Bedrohungs- oder Grenzbewertung.
- Die Stärkeratio 1,2 verhindert Selbstmordkriege, die Mindeststärke 80 verhindert, dass ein Reich ohne nennenswerte Flotte (eine Korvette hat 68) Krieg erklärt.
- Gnadenfrist, Prüfintervall, Mindestkriegsdauer und Cooldown verhindern Dauerkrieg und Flip-Flops, ohne einen Zufallsgenerator zu benötigen.
- Die Friedensregel „schwächere Seite bittet" ist eine bewusste Vereinfachung gegenüber einer Verhandlung: Der Stärkere hat keinen Grund, einen gewonnenen Krieg zu beenden, und Kriegsmüdigkeit greift erst nach 18 Runden.
- Ein Abbruch nach der ersten Erklärung ist die kleinste Regel, die einen Dogpile auf den Spieler in einer Runde ausschließt, und macht das Ergebnis unabhängig von der Größe der Zivilisationsliste.

### Konsequenzen
- `npm run lint` (`tsc --noEmit`) ist sauber; `npm test` meldet **237 Tests in 20 Dateien**. Neu ist `tests/aiDiplomacy.test.ts` mit 12 Tests für Gnadenfrist, Erklärung gegen das schwächste Ziel, Mindeststärke und Stärkeratio, Prüftage, Frieden ab 6 Kriegsrunden, blockierten Frieden davor, späten Spielerfrieden ab 18 Runden, Cooldown von 10 Runden, Idempotenz samt genau einem `diplomacy:war-declared`-Event, ID-Tiebreak und den Ausschluss von Reichen ohne Kolonie.
- Der Kriegszustand ist im Normalspiel jetzt ohne Spielerinteraktion erreichbar; KI-Kriege erscheinen im `DiplomacyModal`, das über `turn:changed` aktualisiert wird.
- **Bekannte Einschränkung:** Da nur ein Reich pro Prüftag erklärt, bleibt bei mehreren gleich starken KI-Reichen die zweite KI passiv, bis der erste Krieg endet. Ein bewusster Dogpile findet nicht statt.
- **Bekannte Einschränkung:** KI-Frieden benötigt keine Spielerzustimmung; die schwächere Seite beendet den Krieg ab 6 Runden auch gegen den Willen des Spielers, und ab 18 Runden Kriegsdauer tut dies jede KI-Seite.
- **Bekannte Einschränkung:** Es gibt keine dedizierte KI-Kriegs-Notification; der `EventBus` besitzt kein generisches Benachrichtigungs-Event. Der Spieler erfährt von einem KI-Krieg nur über das `DiplomacyModal`, das Kriegsabzeichen in der `TopNavBar` oder ein Gefecht.
- **Bekannte Einschränkung:** Die KI führt weiterhin keine Invasions-, Belagerungs- oder Rückzugszüge aus (Stage C). Die Diplomatie erzeugt nur den Kriegszustand; gekämpft wird ausschließlich bei Co-Location verfeindeter Flotten.
- **Bekannte Einschränkung:** Die Schwellen und die Stärkeratio sind eine eigene, plausible Setzung ohne Kalibrierung an Spielverläufen; sie sind im Code dokumentiert und über die Tests fixiert, aber nicht empirisch abgestimmt.
- **Bekannte Einschränkung:** `militaryStrength` bewertet nur Angriff und Hülle, nicht Verteidigung, Technologie oder Position; ein Reich mit vielen schwachen Schiffen gilt als stärker als eines mit wenigen starken.
- **Verhältnis zu ADR-028:** Dessen Aussage „Kein Kriegsverhalten" gilt nur noch für die Flotten-KI; die Diplomatie-KI erklärt jetzt Kriege. Flottenwahl, Bewegung und Rückzug bleiben unverändert.

## ADR-036: Durchgehende Territoriumsgrenzen als lokal begrenzte Voronoi-Kanten

### Kontext
ADR-029 zeichnet Territorium nur als Halo um das jeweils besitzende System. Zwischen zwei benachbarten Reichen blieben dadurch Lücken: Der Spieler sah zwei getrennte Kreise, aber keine gemeinsame Front. Die Roadmap führte „Grenzziehung (durchgehende Grenzlinien zwischen Territorien)" als letzten offenen Punkt. Gefordert war eine Linie, die an den Systemen eines Reiches ansetzt und zwischen zwei Reichen durchgehend verläuft, ohne neue Spieldaten, ohne Save-Änderung und ohne Zufall.

### Entscheidung
- **Eigene reine Geometrie.** `src/ui/territoryBorders.ts` exportiert `computeTerritoryBorders(sites, options)` und die Typen `TerritorySite`, `TerritoryBorderSegment` und `TerritoryBorderOptions`. Die Funktion kennt weder React noch Canvas noch Spielzustand; sie erhält nur `id`, `x`, `y` und `ownerFactionId`.
- **Lokale Voronoi-Zelle je System.** Jedes System beginnt mit einem Quadrat der halben Kantenlänge `DEFAULT_TERRITORY_CLIP_RADIUS = 160` in Weltkoordinaten und wird per Sutherland-Hodgman gegen die Mittelsenkrechte **jedes** anderen Systems geclippt — auch gegen Systeme desselben Besitzers und gegen unbeanspruchte Systeme. Dadurch entstehen Grenzen nur dort, wo zwei Territorien wirklich aneinanderstoßen.
- **Kanten wissen, wem sie gehören.** Jeder Polygonvertex trägt das Label des Systems, dessen Mittelsenkrechte die **eintreffende** Kante erzeugt. Beim Übergang von außerhalb nach innerhalb der Halbebene erhält der Schnittpunkt das Label des neuen Nachbarn; beim Übergang nach außen behält er das Label der verlassenen Kante. So ist jede Polygonkante eindeutig einem Systempaar zugeordnet.
- **Nur echte Nachbarschaften.** Eine Kante wird nur emittiert, wenn beide Seiten einen Besitzer haben und sich die Besitzer unterscheiden. Unbeanspruchte Systeme schneiden Zellen mit, erzeugen aber keine Grenze zur Leere; gleichfarbige Nachbarn erzeugen keine Binnenlinie.
- **Deterministischer Einmal-Emit.** Weil benachbarte Zellen dieselbe Mittelsenkrechte teilen, würde naives Emittieren jede Grenze doppelt zeichnen. Emittiert wird deshalb nur aus der Zelle des lexikografisch kleineren Systempaars (`fromSystemId < toSystemId`); die Geometrie stammt aus dieser Zelle, die Farbe vom dortigen Besitzer. Nachbarn werden nach `distanceSquared`, dann nach `id` sortiert; die Ausgabe wird nach `fromSystemId`, `toSystemId`, `x1`, `y1`, `x2`, `y2` sortiert. `EPSILON = 1e-7` fängt numerische Splitter ab, `minSegmentLength = 0.5` verwirft degenerierte Reste.
- **Zeichnung als zweifarbige Doppellinie.** `GalaxyMapCanvas` berechnet die Segmente einmal per `useMemo` auf `[galaxy.systems]` und zeichnet sie im neuen Layer „3a" zwischen Hyperlanes und Handelsrouten. Jedes Segment wird um ±0,9 Bildschirmpixel senkrecht versetzt zweimal gezeichnet, in der Farbe des jeweiligen Besitzers (`hexToRgba(color, 0.55)`, Fallback `rgba(148, 163, 184, 0.4)`), mit `lineWidth = max(1, 1.1 * camera.zoom)`. Welche Seite dem eigenen System gehört, entscheidet das Kreuzprodukt aus Segmentrichtung und Vektor zum System.
- **Kein Save-Bump.** `CURRENT_SAVE_VERSION` bleibt 4. Die Grenzen sind vollständig aus `StarSystem.x`, `StarSystem.y` und `StarSystem.ownerFactionId` abgeleitet und werden bei jedem Rendern neu berechnet.

### Begründung
- Eine reine Funktion ist ohne Canvas, ohne Engine und ohne Speicher testbar; die 15 neuen Tests decken Geometrie, Besitzerwechsel, Determinismus und Clipping-Fenster ab.
- Die Voronoi-Zelle ist die kleinste Konstruktion, die eine gemeinsame Grenze zweier Territorien überhaupt definiert; ein Halo-Ansatz könnte zwei Kreise nur überlappen lassen, nicht halbieren.
- Das Mitschneiden unbeanspruchter Systeme verhindert, dass ein einzelnes freies System im Raum die Grenze zweier Reiche durchquert, obwohl dort niemand Besitz hat.
- Der Einmal-Emit über die kleinere ID macht das Ergebnis unabhängig von der Iterationsreihenfolge und verhindert doppelte Linien mit unterschiedlicher Deckkraft.
- Die zweifarbige Doppellinie zeigt auf einen Blick, welche Seite zu wem gehört, ohne zusätzliche Legende; sie ist auch bei ähnlichen Reichtumsfarben noch trennbar.
- Das lokale Fenster von 160 Weltkoordinaten deckt die üblichen Nachbarabstände (`minDistance` 60–80, Hyperlanes bei `minDistance * 2.6`) ab und begrenzt den Aufwand auf wenige Kanten je System.

### Konsequenzen
- `npm run lint` (`tsc --noEmit`) ist sauber; `npm test` meldet **252 Tests in 21 Dateien**. Neu ist `tests/territoryBorders.test.ts` mit 15 Tests für leere und einzelne Galaxien, unbeanspruchte Systeme, die Mittelsenkrechte zweier Besitzer, gleichfarbige Territorien, Grenzen zur Leere, Ketten mit drei Systemen, einen einzelnen Besitzer in der Leere, Reihenfolgeunabhängigkeit, das Clipping-Fenster, vier Territorien als durchgehendes Kreuz, Besitzerwechsel, Einmal-Emit je Paar sowie `minSegmentLength` und eigenen `clipRadius`.
- Auf der Galaxiekarte ist die Front zweier Reiche jetzt als durchgehende, zweifarbige Linie sichtbar; die Halo-Darstellung aus ADR-029 bleibt für die Kennzeichnung des einzelnen Systems bestehen.
- **Bekannte Einschränkung:** Liegen zwei Systeme unterschiedlicher Besitzer weiter als `2 * clipRadius` (320 Weltkoordinaten) auseinander, wird ihre Grenze nicht gezeichnet. Bei den Standard-Presets ist das kein Regelfall, kann aber bei sehr dünn besiedelten oder manuell veränderten Galaxien auftreten.
- **Bekannte Einschränkung:** Die Segmente enden am Rand des lokalen Fensters. Sie werden nicht über die Nachbarzelle hinaus verlängert, sodass an sehr spitzwinkligen Ecken ein kleiner Versatz zwischen den Teilstücken sichtbar sein kann.
- **Bekannte Einschränkung:** Die Grenzen sind gerade Mittelsenkrechten ohne Glättung; an Systemen mit drei oder mehr Nachbarn wechselt die Richtung sichtbar. Eine Kurvenglättung oder ein Spline ist nicht implementiert.
- **Bekannte Einschränkung:** Umkämpfte Systeme, Einflussradien über mehrere Systeme, Besitzhistorie und animierte Besitzwechsel bleiben außerhalb des Umfangs (siehe ADR-029). Es gibt weiterhin nur einen statischen Besitzer je System.
- **Bekannte Einschränkung:** Die Grenze kodiert Besitz über Farbe und Zweiteilung; ein Mustermuster jenseits der Linienfarbe für Farbsehschwächen fehlt weiterhin.
- **Bekannte Einschränkung:** Bei jeder Änderung des `galaxy.systems`-Arrays werden alle Grenzen neu berechnet; eine inkrementelle Aktualisierung einzelner Systeme gibt es nicht. Bei den aktuellen Galaxiegrößen ist der Aufwand unkritisch.
- **Verhältnis zu ADR-029:** Dessen Aussage „Nicht enthalten: Grenzlinien zwischen Territorien" ist mit diesem ADR für die Galaxiekarte überholt; die übrigen dort genannten Auslassungen (Einflussradien, umkämpfte Systeme, Besitzhistorie, Animation, Musteralternative) gelten unverändert.

---

## ADR-037: Flüsse und Seen durch Priority-Flood auf der Rohelevation

### Kontext
ADR-034 erzeugte kohärente Landmassen, ließ aber als bekannte Einschränkung explizit „keine Flussläufe" offen. Die Oberfläche hatte damit Ozeane, Höhenbänder und Biome, aber kein Wasser, das den Niederschlag abführt; Täler waren optisch nicht von Rücken zu unterscheiden, und für spätere Mechaniken (Trinkwasser, Bewässerung, Schifffahrt, Siedlungsstandorte) fehlte jede entwässerungsbasierte Grundlage. Vorbild der Mechanik ist erneut *Dwarf Fortress*: Wasser sammelt sich, folgt dem Gefälle und staut sich in geschlossenen Senken. Übernommen wird ausschließlich die Mechanik als eigenständige Reimplementierung; Code, Strings, Assets und Balancetabellen wurden nicht kopiert.

### Entscheidung
- **Eigenes, reines Modul.** Neu ist `src/surface/hydrology.ts` mit `Hydrology.compute(tiles)`; Eingabe sind `{ coord, key, elevationRaw, isOcean }`, Ausgabe `discharge`, `flowTarget`, `isLake`, `isRiver` und `waterLevel`, jeweils in Eingabereihenfolge indiziert. Das Modul kennt weder React noch Canvas noch Spielzustand.
- **Priority-Flood mit Epsilon.** Alle Kacheln werden von den Auslässen aus per stabilem Min-Heap über `(Füllstand, Kachelindex)` geflutet; jede neu erreichte Kachel erhält `waterLevel = max(Rohelevation, waterLevel[Vorgänger] + EPSILON)`. `EPSILON = 1e-5` verhindert flache Plateaus, auf denen keine eindeutige Richtung entstünde.
- **Auslässe sind Ozean und Kartenrand.** Ozeankacheln (Band 0) und Kacheln mit weniger als sechs vorhandenen Nachbarn werden als Auslass geseedet und bleiben ohne Fließziel. Der Kartenrand als zusätzlicher Auslass hält auch Karten ohne Meeresspiegel (Gasriesen, vollständig verlandete Planeten) hydrologisch geschlossen, statt sie in einer einzigen globalen Senke enden zu lassen.
- **Gefälle auf Rohelevation, nicht auf Bändern.** Die Berechnung läuft auf `elevationRaw`, weil die Quantisierung in vier Bänder die Feinstruktur der Senken zerstören würde. Die Anzeige-Elevation bleibt unverändert 0–3.
- **Seen aus dem Füllstand.** `isLake` gilt für Land mit `waterLevel > elevationRaw + LAKE_MIN_RISE` (`LAKE_MIN_RISE = 0.005`); Ozeane sind nie Seen.
- **Abfluss stromaufwärts akkumuliert.** Jede Kachel startet mit `discharge = 1`; die Pop-Reihenfolge wird rückwärts durchlaufen und der eigene Abfluss dem `flowTarget` gutgeschrieben. `isRiver` gilt für Land mit `discharge >= RIVER_THRESHOLD` (`RIVER_THRESHOLD = 5`).
- **Determinismus.** Bei gleichem Füllstand entscheidet der Kachelindex über die Heap-Reihenfolge, nie die Einfügereihenfolge; identische Eingabe liefert identische Ausgabe.
- **Feuchtigkeitskopplung.** Im Generator erhöhen alle Fluss- und Seekacheln sowie deren Nachbarn die Feuchtigkeit um 0,15 (`clamp01`, Ozeane ausgenommen), bevor die Biome abgeleitet werden. Ufer werden dadurch häufiger `fungal_forest` statt `desert`.
- **Neue optionale Kachelfelder.** `PlanetHexTile` erhält `riverDischarge?: number`, `flowsTo?: string | null` und `isLake?: boolean`. `flowsTo` wird nur für Flüsse und Seen gesetzt; Ozeane tragen `riverDischarge: 0`. Die Felder sind optional, alte Stände bleiben ladbar.
- **Versionierung.** `GENERATOR_VERSION` steigt auf 3 und fließt in den Oberflächen-Seed ein (`${galaxySeed}:${planet.id}:surface:v3`); alte Oberflächen mit Version 2 bleiben unverändert spielbar.
- **Kein Save-Versions-Bump.** `CURRENT_SAVE_VERSION` bleibt 4: Die Kachel-Validierung prüft diese Felder nicht, und Tiles werden roh persistiert.

### Begründung
- Priority-Flood ist der kleinste Algorithmus, der gleichzeitig Fließrichtungen, Senkenfüllstände und stabile Auslässe liefert; eine reine Gefällesuche ohne Flutung würde in Senken mit `flowTarget === null` enden und keine Seen erkennen.
- Das Epsilon macht die Fließrichtung auch auf mathematisch flachen Flächen eindeutig und damit reproduzierbar.
- Der Kartenrand als Auslass ist der einzige Weg, auch Landkarten ohne Ozean zu entwässern, ohne einen künstlichen See über die ganze Karte zu erzeugen.
- Die Rohelevation als Rechengrundlage erhält Geländestrukturen, die in der Bandanzeige bereits verloren sind; die Bänder bleiben eine reine Darstellungs- und Biomgröße.
- Die Feuchtigkeitskopplung verbindet Hydrologie und Biomwahl mit einer einzigen Zahl und ohne neues Feld, sodass Ufer schon in der bestehenden Biomlogik sichtbar werden.
- Rechenzeit und Speicher sind bei 18×10 = 180 Kacheln unkritisch; der Heap bleibt die einzige dynamische Struktur.

### Konsequenzen
- `npm run lint` (`tsc --noEmit`) ist sauber; `npm test` meldet **261 Tests in 22 Dateien**. Neu ist `tests/hydrology.test.ts` mit 7 Tests für Wasserstand und Auslässe, See-Erkennung in einer umrandeten Senke, Abflusserhaltung, Determinismus, Ozeanverhalten, terminierende Fließketten auf reiner Landkarte und die Schwellwertäquivalenz zu `isRiver`.
- `tests/surface_generator.test.ts` prüft zusätzlich die Generatorversion 3, konsistente Fließrichtungen und Seen sowie mindestens einen Fluss über drei Seeds.
- `PlanetSurfaceCanvas` zeichnet Seen als halbtransparente Fläche nach der Elevationsschattierung und Flüsse als Linien vom Kachelzentrum zum `flowsTo`-Zentrum; die Linienbreite wächst logarithmisch mit `riverDischarge`. `HexTileInspector` zeigt in der Terrain-Sektion „Gewässer" mit „Süßwassersee" bzw. „Fluss (Abfluss n)".
- **Bekannte Einschränkung:** Flüsse sind reine Linien zwischen Kachelzentren ohne Breite, ohne Mäander und ohne Mündungsdelta; ein Fluss kann quer über eine Kachelkante springen, die im Gelände nicht als Tal erkennbar ist.
- **Bekannte Einschränkung:** Seen entstehen nur als geflutete Senken. Es gibt keine Verdunstung, keinen saisonalen Wasserstand, keine Zu- und Abflüsse über die Karte hinaus und keine Verbindung zwischen benachbarten Seen.
- **Bekannte Einschränkung:** `discharge` startet für jede Kachel bei 1, auch für Ozeane; die Null für Ozean entsteht erst im Generator. Ein direkter Aufruf von `Hydrology.compute` liefert dort also Werte ≥ 1.
- **Bekannte Einschränkung:** Die Schwellwerte `RIVER_THRESHOLD`, `EPSILON` und `LAKE_MIN_RISE` sind eine eigene, plausible Setzung ohne Kalibrierung am Vorbild; sie sind im Code dokumentiert, aber nicht empirisch gegen Spielverläufe abgestimmt.
- **Bekannte Einschränkung:** Die Hydrologie beeinflusst nur die Feuchtigkeit und damit indirekt Biome; sie erzeugt keine Ressourcen, keine Handelsgüter und keine Bewegungsregeln. Flüsse sind weiterhin passierbar wie das Gelände darunter.
- **Verhältnis zu ADR-034:** Dessen Aussage „sie erzeugt keine Flussläufe" ist mit diesem ADR überholt; die übrigen dort genannten Auslassungen (Plattentektonik, globale Klimamodelle) gelten unverändert.

---

## ADR-038: Tarife, Blockaden und Eskorten als Aufsatz auf die galaktischen Handelsrouten

### Kontext
ADR-022 führte galaktische Handelsrouten als reine Ressourcenpumpe ein und stellte ausdrücklich fest: „Keine Währung, keine Tarife und kein Kampf" sowie „Künftige Handelsmechaniken (Tarife, Kriegsblockaden, Eskorten) müssen an den Manager andocken". Ohne diese Mechaniken hatte Krieg keine wirtschaftliche Wirkung, Zölle waren kein fiskalisches Werkzeug und der Spieler konnte eine Route weder schützen noch bewusst ausbeuten. Vorbild ist die Handelsschicht von *Distant Worlds* bzw. *Stellaris*; übernommen wird nur die Mechanik als eigenständige Reimplementierung mit eigener Balance.

### Entscheidung
- **Additive Routenfelder.** `GalacticTradeRoute` erhält die optionalen Felder `tariffRate?: number` (ganzzahlig, 0–20 %), `escortFleetIds?: string[]`, `isBlockaded?: boolean` und `blockadedSystemIds?: string[]`. `createRoute` initialisiert `tariffRate: 0`, `escortFleetIds: []`, `isBlockaded: false`, `blockadedSystemIds: []`. Kein Save-Versionssprung: `CURRENT_SAVE_VERSION` bleibt 4, alte Stände laden mit Defaults.
- **Zoll nur auf tatsächlich gelieferte Ware.** `deliver()` berechnet `round1(gelieferte Einheiten der Routenressource × TARIFF_CREDITS_PER_CARGO_UNIT (0,25) × tariffRate / 100)` und schreibt den Betrag der Staatskasse der besitzenden Zivilisation gut (Quellkolonie, sonst Zielkolonie). Ohne passende Zivilisation oder bei 0 % entstehen keine Credits und kein `tariffCredits`-Feld in der Zusammenfassung. Der Zoll ist damit an den Warenfluss gekoppelt und nicht an bloßes Routenbestehen.
- **Validierung ist atomar.** `setRouteTariff` lehnt nicht-endliche Werte sowie Werte außerhalb 0–20 ab, ohne die Route zu verändern. `setRouteEscorts` prüft **alle** IDs zuerst gegen den Flottenbestand und den Status `stationed`; scheitert eine ID, bleibt die bisherige Zuweisung unverändert. Gültige Listen werden dedupliziert und nach ID sortiert.
- **Blockade ist abgeleitet, nie autoritativ.** `updateBlockades()` läuft zu Beginn von `advanceTurn` und betrachtet ausschließlich die Positionen und Kriegsbeziehungen zu Rundenbeginn. Für jede System-ID des Routenpfads gilt: Steht dort eine Flotte einer Zivilisation, mit der der Routenbesitzer im Krieg ist, ist das System blockiert – es sei denn, eine **zugewiesene** eigene Flotte ist dort `stationed`. `isBlockaded` ist genau dann wahr, wenn mindestens ein System blockiert ist; `blockadedSystemIds` listet diese in Pfadreihenfolge. `loadRoutes` setzt beide Felder auf `false`/`[]` zurück und lässt sie im nächsten Spielzug neu berechnen.
- **Wirkung der Blockade.** Blockierte Routen laden keine neue Fracht (`status === 'loading'` wird übersprungen). Ein bereits ankommender Konvoi bleibt mit seiner Fracht im Zielorbit stehen (`pathIndex` bleibt auf dem letzten Hop), bis die Blockade fällt; die Fracht geht nicht verloren. Der leere Rückflug ist nicht blockierbar.
- **Events.** Neu sind `galactic-trade:route-tariff-changed`, `galactic-trade:route-escorts-changed`, `galactic-trade:route-blockaded` und `galactic-trade:route-unblockaded`; die Blockade-Events feuern nur bei Zustandswechseln.
- **UI.** Im `LogisticsModal` erhält jede Route ein Zoll-Eingabefeld (0–20 %, Anzeige des Creditwerts je Einheit) und eine Eskortenauswahl aus den stationierten eigenen Flotten; bei Blockade erscheint eine Warnung mit den betroffenen Systemen. `GalaxyMapCanvas` zeichnet blockierte Routen rot gestrichelt und nennt die Blockade im Tooltip. `PhaseRoadmapModal` listet die drei Module.
- **Wiederherstellung nach Laden.** `cloneRoute` normalisiert Zoll (Clamp auf 0–20, ganzzahlig), dedupliziert und sortiert Eskorten und kopiert die Blockadefelder; gespeicherte Blockadezustände werden bewusst verworfen, weil sie aus Flottenpositionen ableitbar sind.

### Begründung
- Ein abgeleiteter Blockadezustand kann nicht veralten: Flottenbewegungen und Kriegserklärungen derselben Runde können keinen widersprüchlichen Save-Zustand erzeugen.
- Der Zoll auf gelieferte Einheiten verhindert Phantom-Einnahmen aus Routen, die wegen Reserven, Zielbeständen oder Blockaden ohnehin nichts transportieren.
- Die Bindung der Eskorte an eine konkrete Flotten-ID verhindert, dass eine Flotte an mehreren Routen gleichzeitig „mitfliegt"; die Stationierungsprüfung verhindert Eskorten aus laufenden Bewegungen.
- Atomare Validierung entspricht dem Muster aus `BuildQueueManager` und verhindert Teiländerungen bei ungültigen Eingaben.
- Ein Save-Bump wäre irreführend, weil alle neuen Felder optional sind und die Blockade beim Laden ohnehin neu berechnet wird.

### Konsequenzen
- `npm run lint` (`tsc --noEmit`) ist sauber; `npm test` meldet **283 Tests in 23 Dateien**. `tests/galacticTrade.test.ts` umfasst 22 Tests, darunter Feldinitialisierung, Zollvalidierung, Zollgutschrift, fehlende Zivilisation, Eskortenvalidierung, Blockade beim Beladen, eingefrorene Ankunft, Eskorten-Neutralisierung, Lade-Sanitisierung und eine mutierungsfreie Rundreise.
- Die galaktische Handelsroute ist erstmals eine Entscheidung mit Kosten: hoher Zoll bringt Credits, kostet aber nichts direkt – der eigentliche Preis ist der Verzicht auf Eskorten und damit das Blockaderisiko.
- **Bekannte Einschränkung:** Der Zoll ist ein reiner Aufschlag ohne Wirkung auf Nachfrage, Preis oder Liefermenge; es gibt keinen Markt und keine Preiselastizität.
- **Bekannte Einschränkung:** Blockaden entstehen nur durch Flotten im Kriegszustand. Piraten, neutrale Kräfte, Embargos oder Handelsbündnisse sind nicht modelliert.
- **Bekannte Einschränkung:** Eskorten kämpfen nicht aktiv und erleiden keine Verluste; ihre einzige Wirkung ist die Aufhebung einer Blockade, solange sie im System stationiert sind.
- **Bekannte Einschränkung:** KI-Zivilisationen setzen weder Zölle noch Eskorten; ihre Routen sind immer ungeschützt und zollfrei.
- **Bekannte Einschränkung:** Die Balance (`MAX_TARIFF_RATE = 20`, `TARIFF_CREDITS_PER_CARGO_UNIT = 0,25`) ist eine eigene, plausible Setzung ohne Kalibrierung an Spielverläufen.
- **Verhältnis zu ADR-022:** Dessen Aussage „keine Tarife und kein Kampf" ist für Tarife und Blockaden überholt; die übrigen Auslassungen (Währung als eigenes System, aktiver Kampf um Routen) gelten unverändert.

---

## ADR-039: Privatsektor als abgeleitete zivile Wirtschaft zwischen eigenen Kolonien

### Kontext
ADR-032 und ADR-033 bauten die Staatskasse auf Steuern, Korruption, Approval, Wartung und Baukosten auf und grenzten den Privatsektor ausdrücklich aus („kein Privatsektor"). Damit fehlte der zivilen Wirtschaft jede Repräsentation: Die Staatskasse wuchs nur aus staatlichen Steuern, und eine Kolonie mit Nahrungs- oder Mineralienmangel hatte außer der tech-gateden Staatslogistik (`LogisticsRoute`, ADR-020) und den galaktischen Routen (ADR-022) keine Versorgung. Der Privatsektor schließt diese Lücke als kleinste sinnvolle Mechanik: zivile Händler zahlen eine Handelssteuer und gleichen lokal kleine Engpässe aus, ohne Flotten, Routen oder neue Speicherfelder zu erzeugen. Vorbild ist die Zivilwirtschaft von *Distant Worlds Universe*; übernommen wird ausschließlich die Mechanik als eigenständige Reimplementierung mit eigener Balance.

### Entscheidung
- **Eigenes, zustandsarmes Modul.** Neu ist `src/core/privateSectorManager.ts` mit `PrivateSectorManager`. Die Klasse hält nur den Bericht der letzten Runde im Speicher; alle Kennzahlen sind statische, pure Funktionen. Es gibt **keine** privaten Schiffe, Routen, Lager oder Save-Felder.
- **Handelsvolumen.** `calculateCommerceVolume(colony) = round1(Bevölkerungs-Einheiten × 6 × Stufenfaktor × Zufriedenheit/100)` mit Stufenfaktoren `outpost 0,5`, `settlement 1`, `colony 1,5`. Die Zufriedenheit wird über `EconomyEngine.calculateApproval` aus Steuersatz und Stufe **abgeleitet**, nicht aus dem gespeicherten Feld gelesen; dadurch kann der Wert nie veralten.
- **Handelssteuer.** `calculateCommerceTax = round1(Volumen × 0,25)`. Sie wird je Kolonie berechnet, je Zivilisation summiert und in `endTurn` **einmal** der Staatskasse gutgeschrieben. Es gibt keinen neuen Regler: Der bestehende Steuersatz wirkt über die Zufriedenheit bereits auf das Handelsvolumen.
- **Zivile Umverteilung.** Für jede Zivilisation werden die aktiven Kolonien nach ID sortiert. Je Ressource (`food`, `minerals`, `rareResources`) geben Kolonien mit Bestand über `PRIVATE_SECTOR_RESERVE` (60/60/25) ab und füllen Empfänger unter `PRIVATE_SECTOR_TARGET_STOCK` (40/40/15) auf. Die Reserve liegt bewusst strikt über dem Zielbestand, damit keine Kolonie gleichzeitig Geber und Empfänger desselben Gutes ist. Es werden nur ganzzahlige Mengen bewegt; Güter bleiben erhalten (`shipped === delivered`).
- **Frachtkapazität als Obergrenze.** Jede Kolonie stellt je Runde `max(1, Bevölkerungs-Einheiten × Stufenfaktor)` Einheiten bereit (`outpost 1`, `settlement 2`, `colony 3`), **gemeinsam über alle drei Güter**. Ein Geber kann damit nicht beliebig viel exportieren, und die Staatslogistik (bis zu 75 Einheiten je Route) bleibt das dominierende Transportsystem.
- **Determinismus.** Reihenfolge: Zivilisationen nach ID, Kolonien nach ID, Ressourcen in fester Reihenfolge, Geber nach Überschuss absteigend und ID, Empfänger nach Bestand aufsteigend und ID. Bei Gleichstand entscheidet immer die ID, nie die Einfügereihenfolge.
- **Integration in `endTurn`.** Der Schritt „B2. Privatsektor" läuft nach der Ökonomie- und vor der Logistikphase. Der Schritt „B3. Staatskasse" addiert `commerceTax` zur bisherigen Rechnung `max(0, Steuern + Handelssteuer − Wartung)`. Damit sieht die Staatslogistik bereits die umverteilten Bestände.
- **Berichte sind abgeleitet.** `advanceTurn` liefert je Zivilisation `commerceVolume`, `commerceTax`, `capacity`, `shipped`, `delivered` und die einzelnen `transfers`. `GameEngine.getPrivateSectorReport(civId)` liest den letzten Bericht. `clear()` verwirft ihn bei Galaxiewechsel und Ladevorgang; nach dem Laden entsteht er erst im nächsten Spielzug.
- **UI.** Die `PlanetsOverviewModal` erhält einen Privatsektor-Streifen mit Handelsvolumen, Handelssteuer, Frachtkapazität und der letzten Umverteilung; die Finanzkachel im `ColonyManagementModal` zeigt zusätzlich `Privatsektor: +… Cr/Rd.`. Beide Werte werden live aus den bestehenden Koloniefeldern berechnet.
- **Kein Save-Versions-Bump.** `CURRENT_SAVE_VERSION` bleibt 4; es werden keine neuen Felder persistiert.

### Begründung
- Die Aufteilung „Staatslogistik = Bulk, Privatsektor = Lückenschluss" erhält den Wert der Logistik-Technologie und verhindert, dass eine passive Mechanik die aktive Planung ersetzt.
- Ein Bericht ohne Persistenz entspricht dem Umgang mit Gefechtsberichten (ADR-025) und vermeidet ein Feld, das nach dem Laden ohnehin veraltet wäre.
- Die Ableitung der Zufriedenheit statt des Lesens von `colony.approval` macht die Kennzahl unabhängig von der Reihenfolge, in der UI-Aktionen und `simulateTurnEconomy` laufen.
- Die gemeinsame Kapazität über alle Güter ist die einzige Regel, die verhindert, dass eine große Kolonie drei Ressourcen gleichzeitig in beliebiger Menge verteilt.
- Reserve > Zielbestand ist eine Invariante, die Geber und Empfänger desselben Gutes disjunkt hält und Endlosschleifen konstruktiv ausschließt.
- Der Verzicht auf einen zweiten Steuerregler hält die UI schlank und macht den bestehenden Steuersatz doppelt relevant (Einnahmen gegen Wachstum und Handelsvolumen).

### Konsequenzen
- `npm run lint` (`tsc --noEmit`) ist sauber; `npm test` meldet **283 Tests in 23 Dateien**. Neu ist `tests/privateSector.test.ts` mit 13 Tests für Volumen-/Steuerformel, Kapazität, Zielbestand, Reserve, Kapazitätsgrenze, Gütererhaltung über sechs Runden, Zivilisationsgrenze, inaktive Kolonien, deterministische Reihenfolge, Berichtsaggregation, `clear()` und die Treasury-Integration in `endTurn`.
- `tests/economy_stage_a.test.ts` und `tests/economy_stage_b.test.ts` prüfen die Staatskasse jetzt inklusive Handelssteuer (1,0 → 1,4 Credits im Standardfall).
- Der Steuersatz hat eine zweite Konsequenz: Hohe Steuern senken die Zufriedenheit und damit das Handelsvolumen, ohne dass eine neue Stellschraube nötig ist.
- **Bekannte Einschränkung:** Es gibt keine Preise, Märkte, Angebot/Nachfrage-Kurven oder Handelsgüter; Handelsvolumen ist eine reine Credits-Kennzahl, Fracht eine reine Mengenregel.
- **Bekannte Einschränkung:** Zivile Fracht reist ohne Reisezeit und ohne Fahrzeuge; anders als bei Logistik und galaktischem Handel gibt es keine Ankunftsphase.
- **Bekannte Einschränkung:** Der Handelssteuersatz ist mit 25 % fest im Code; eine per-Reich-Politik oder ein Regler existiert nicht.
- **Bekannte Einschränkung:** Der Privatsektor unterscheidet nicht zwischen Spieler und KI; KI-Reiche erhalten dieselben Regeln, aber keine eigene KI-Entscheidung darüber.
- **Bekannte Einschränkung:** Berichte gehen beim Laden verloren; die UI zeigt dann nur die live berechneten Kennzahlen und den Hinweis „Noch keine Runde simuliert".
- **Bekannte Einschränkung:** Die Balance (6 Credits je Pop-Einheit, Faktoren 0,5/1/1,5, Steuer 25 %, Reserve/Ziel 60/40, 60/40, 25/15) ist eine eigene, plausible Setzung ohne Kalibrierung an Spielverläufen.
- **Verhältnis zu ADR-032/ADR-033:** Deren Aussage „kein Privatsektor" ist überholt; die Treasury-Formel in ADR-033 gilt weiter, wird aber um die Handelssteuer erweitert (`max(0, Steuern + Handelssteuer − Wartung)`). Die übrigen Auslassungen (Kreditaufnahme, Schulden, Flottenunterhalt in Credits) gelten unverändert.

---

## ADR-040: Steuerregler und Arbeitsfokus ohne vollen Wirtschaftszug

### Kontext
`GameEngine.setColonyTaxRate()` rief bei jeder Reglerbewegung `EconomyEngine.simulateTurnEconomy()` auf. Diese Methode ist ein vollständiger Wirtschaftszug: Sie verteilt Arbeitskräfte, berechnet Erträge, schreibt Lagergewinne gut und lässt die Bevölkerung wachsen. Ein Spieler konnte den Regler wiederholt hin- und herbewegen und damit pro Klick Lagerbestände und Wachstum erzeugen, ohne eine Runde zu beenden. `setColonyWorkFocus()` und `upgradeColonyTier()` nutzten denselben Weg und hatten dasselbe Problem. Zusätzlich suchte der Arbeitsfokus den Planeten über eine lokale Schleife statt über `findPlanetById`, sodass Randfälle von der übrigen Logik abweichen konnten.

### Entscheidung
- **Zwei reine Bausteine.** `EconomyEngine.recalculateYields()` berechnet Arbeitskräfteverteilung, Erträge, Unterhalt und Nettoerträge. `EconomyEngine.recalculateTaxState()` normalisiert den Steuersatz und berechnet Korruption, Zufriedenheit und Steuereinnahmen; es gibt die Zufriedenheit zurück und verändert keine Bestände.
- **Ein vollständiger Zug.** `simulateTurnEconomy()` ruft zuerst `recalculateYields()` und danach `recalculateTaxState()` auf. Nur diese Methode verändert Lager, Nahrungspuffer und Bevölkerung. Das von `recalculateTaxState()` gelieferte Approval steuert den Wachstumsfaktor, statt das Feld erneut zu lesen.
- **UI-Aktionen sind seiteneffektfrei.** `setColonyTaxRate()`, `setColonyWorkFocus()` und `upgradeColonyTier()` führen ausschließlich die jeweils passende reine Neuberechnung aus. Sie erzeugen keine Ressourcen und keine Bevölkerung.
- **Kein Sonderweg für Territorium.** `claimHex()` ruft weiterhin `simulateTurnEconomy()` auf, weil die Ausdehnung Einfluss kostet und damit kein kostenloser Zug ist.

### Begründung
- Ein Steuerregler ist eine Parametereinstellung, kein Zug. Die Trennung von „Parameter neu bewerten" und „eine Runde simulieren" macht diese Unterscheidung im Code sichtbar.
- Beide Pfade nutzen dieselben Formeln. Damit kann eine UI-Änderung das Ergebnis eines späteren Zuges nicht mehr verfälschen.
- Die Rückgabe des Approvals aus `recalculateTaxState()` verhindert, dass zwei Stellen dieselbe Kennzahl unterschiedlich interpretieren.

### Konsequenzen
- `tests/taxRate.test.ts` prüft in 9 Fällen Erhöhen, Senken, Zurücksetzen, wiederholtes Bewegen, Lagervergleich, Produktion/Verbrauch, Speichern/Laden, Unverändertheit anderer Kolonien und den fehlenden Exploit. Zusätzlich vergleicht ein Fall einen Referenzzug mit einem Zug nach vielen Reglerbewegungen und erwartet identische Ergebnisse.
- `restoreFromSaveData()` arbeitet mit einer tiefen Kopie der geladenen Daten, damit Tests und wiederholtes Laden keine geteilten Objekte hinterlassen.
- **Bekannte Einschränkung:** Die Balance bleibt unverändert; der Fix verhindert nur die Vervielfachung durch UI-Klicks.

---

## ADR-041: Hauptmenü als eigener App-Modus

### Kontext
Das Spiel startete bisher direkt in einer laufenden Partie. Roadmap und QA-Tests waren über das Spielmenü erreichbar, obwohl sie keine Spielaktionen sind. Ein Hauptmenü mit „Neues Spiel", „Spiel laden", Seed-Verwaltung und Beenden war gefordert, ohne die bestehenden Funktionen zu duplizieren.

### Entscheidung
- **Vier Modi.** `App.tsx` hält `appMode: 'menu' | 'creation' | 'game' | 'ended'`. Der Modus entscheidet, welcher Bildschirm gerendert wird; die Engine bleibt dieselbe Instanz.
- **Sechs Menüpunkte.** `MainMenu.tsx` bietet Neues Spiel, Spiel laden, Galaxie-Seeds verwalten, Roadmap, QA-Tests und Spiel beenden. Dazu kommen eine Schnellspeicher-Kachel und die zuletzt gestartete Galaxie mit „Mit diesem Seed fortfahren".
- **Eine Quelle für Modals.** SaveLoad, Roadmap, QA und Seed-Bibliothek werden im Menümodus gerendert. Im Spiel bleiben nur spielbezogene Dialoge. `GalaxyGenModal.tsx` wurde gelöscht; die Galaxieerstellung ist ein eigener Bildschirm.
- **Spielmenü aufgeräumt.** Die `TopNavBar` enthält jetzt Speicherstände, Hauptmenü und Spiel beenden. Der Tastaturkürzel `g` und der direkte Generatorzugriff im Spiel entfallen.
- **Sitzungsende.** „Spiel beenden" wechselt in den Modus `ended` mit einer Abschlussanzeige; von dort führt der Weg zurück ins Hauptmenü.

### Begründung
- Ein Moduswechsel ist billiger und robuster als mehrere parallel gemountete App-Gerüste.
- Roadmap und QA sind Metafunktionen und gehören nicht in die laufende Partie.
- Das Entfernen des alten Generator-Dialogs verhindert zwei Wege zur selben Funktion mit abweichendem Verhalten.

### Konsequenzen
- Laden aus dem Menü setzt `appMode` auf `game`; ein neues Spiel startet über den Erstellungsbildschirm.
- Die bestehenden Engine-Funktionen für Roadmap und Tests bleiben unverändert.
- **Bekannte Einschränkung:** Ein laufendes Spiel wird beim Wechsel ins Hauptmenü nicht automatisch gespeichert; das übernimmt weiterhin die Schnellspeicherung.

---

## ADR-042: Seed-Bibliothek und reproduzierbare Galaxie-Parameter

### Kontext
Galaxien entstehen aus Seed und Parametern. Ohne gespeicherte Konfiguration ließ sich eine Galaxie nur über einen Spielstand wiederherstellen, nicht aber gezielt neu beginnen. Gleichzeitig durfte das Laden eines Spielstands niemals eine Galaxie neu generieren.

### Entscheidung
- **Pflicht-Eintrag beim Start.** Jeder Spielstart schreibt Seed, Parameter, erzeugte Systemanzahl, Generatorversion, Oberflächen-Generatorversion, Erstellungs- und Startzeitpunkt in `SeedLibrary`. Ein Opt-out gibt es nicht.
- **Stabiler Schlüssel.** Die ID ist `seedConfigSignature(config)` aus Seed, Größe, Form, Systemanzahl, Breite, Höhe und Mindestabstand. Dieselbe Konfiguration ergibt denselben Eintrag, unabhängig davon, wie oft sie gestartet wird.
- **Obergrenze und Pflege.** `MAX_SEED_ENTRIES = 100`; die Bibliothek bietet Liste, Finden, Upsert, Umbenennen, Entfernen und Leeren. Sie liegt unter `astraea_4x_seed_library` im lokalen Speicher.
- **Erstellungsbildschirm.** `GalaxyCreationScreen.tsx` hat zwei Wege: „Neue Galaxie erschaffen" mit den bestehenden Generatorparametern (Größen-Presets, Form, Seed und Zufallsbutton, Systemanzahl, Mindestabstand, Namensfeld) und „Mit bestehendem Seed fortfahren" mit der gespeicherten Liste.
- **Laden regeneriert nichts.** Ein Spielstand enthält die vollständige Galaxie. `restoreFromSaveData()` übernimmt sie unverändert und greift nicht auf den Generator zu.
- **Generatorversion.** `GalaxyGenerator.GENERATOR_VERSION = 1` wird mitgespeichert, damit spätere Änderungen an der Generierung erkennbar bleiben.

### Begründung
- Reproduzierbarkeit braucht mehr als den Seed: Form, Größe und Mindestabstand verändern das Ergebnis ebenfalls.
- Ein Pflicht-Eintrag macht die „zuletzt gestartete Galaxie"-Kachel im Hauptmenü verlässlich und verhindert, dass gute Seeds nur im Kopf bleiben.
- Die Trennung „Seed-Bibliothek beschreibt eine Konfiguration, Spielstand enthält das Ergebnis" schließt aus, dass Laden und Generieren auseinanderlaufen.

### Konsequenzen
- `SeedLibraryModal.tsx` verwaltet Einträge im Menü; die letzte Galaxie erscheint als Karte im Hauptmenü.
- Die effektive Systemanzahl wird nach dem Sanitizing angezeigt, weil die Obergrenze der Kartengröße die Eingabe begrenzen kann.
- **Bekannte Einschränkung:** Die Bibliothek liegt nur im lokalen Speicher des Browsers; Export/Import oder Synchronisierung gibt es nicht.

---

## ADR-043: Startflotte, Kolonieschiff-Fracht und erzwungene Kolonisationslogistik

### Kontext
Eine neue Partie begann ohne Präsenz im Raum. Kolonisation war möglich, sobald ein Planet vermessen und bewohnbar war; Schiffe und Fracht spielten keine Rolle. Damit fehlten der Aufbau einer ersten Präsenz und die logistische Vorbereitung eines neuen Planeten.

### Entscheidung
- **Drei einzelne Verbände.** Die Startflotte besteht aus je einem Verband mit Kleiner Fregatte, Aufklärungsschiff und Kolonieschiff. Die IDs sind deterministisch (`fleet_<civId>_start_<key>`), alle drei stehen in `galaxy.systems[0]`. Getrennte Verbände sind einzeln auswählbar und werden getrennt dargestellt.
- **Fracht nur im Schiff.** Kolonisten und Gründungsgüter liegen ausschließlich in `Fleet.cargo`. Es gibt keine parallele Gutschrift in einem globalen Lager und keine automatische Kolonie beim Start.
- **Getrennter Katalog.** Unterstützungsschiffe stehen in `src/data/supportShipCatalog.ts`; `getShipDef()`, `BUILDABLE_SHIP_IDS` und `getBuildableShipDefs()` führen beide Kataloge zusammen. Baubar ist nur das Kolonieschiff (`advanced_metallurgy`, 120 Produktion, 90 Mineralien, 15 Seltene); Fregatte und Aufklärer sind Startausstattung.
- **Logistik als Bedingung.** `GameEngine.foundColony()` prüft Vermessung, Bewohnbarkeit und Fracht über `ColonizationValidator` und `checkColonySupply()`. Reicht die Fracht nicht, schlägt die Gründung mit Begründung fehl. Nach erfolgreicher Gründung wird das Kolonieschiff verbraucht.
- **Provisionierung als API.** `provisionColonyShip(systemId, cargo?)` stellt ein beladenes Kolonieschiff bereit; `getColonyShipForSystem()` und `consumeColonizationSupply()` kapseln Suche und Verbrauch.
- **KI bleibt permissiv.** `ColonyManager.foundColony()` akzeptiert einen optionalen neunten Parameter `ColonyFoundingSupply`; die KI nutzt ihn nicht und gründet wie bisher.

### Begründung
- Fracht im Schiff ist die einzige Variante, die keinen Duplikations-Exploit eröffnet und den Verbrauch sichtbar macht.
- Ein eigener Katalog verhindert, dass Startschiffe im normalen Werftangebot auftauchen.
- Die Prüfung in `GameEngine` statt im `ColonyManager` hält die KI-Pfade unverändert und legt die Spielerregel an genau eine Stelle.
- Drei Verbände statt einem machen die Schiffsauswahl und die unterschiedlichen Silhouetten auf der Karte erlebbar.

### Konsequenzen
- `tests/startingFleet.test.ts` prüft in 10 Fällen Aufbau, Determinismus, Fracht, fehlende globale Duplikate, Gründung ohne/mit ausreichender Fracht, Verbrauch des Schiffs und den erhöhten Anfangsbestand der ersten Kolonie (Fracht plus ein Zug Erträge).
- `PlanetInspector` zeigt bei fehlender Fracht eine Warnung und deaktiviert die Gründung; `App.tsx` meldet Fehlgründe als Warnung.
- **Bekannte Einschränkung:** Die Frachtmengen sind eine plausible Setzung; eine Kalibrierung an Spielverläufen fehlt.
- **Bekannte Einschränkung:** Ein Kolonieschiff kann nicht nachträglich umgeladen werden; es wird entweder verbraucht oder bleibt mit seiner Fracht stehen.

---

## ADR-044: Zentrales Benachrichtigungssystem mit Ereignisbrücke

### Kontext
Abschlüsse wurden in `App.tsx` als einzelne Toast-Meldung mit `setTimeout` angezeigt. Zwei gleichzeitige Abschlüsse überschrieben sich, und für jeden Auslöser existierte eigener Text- und Timer-Code. Nach dem Laden eines Spielstands konnten alte Meldungen erneut erscheinen.

### Entscheidung
- **Kern ohne UI.** `src/core/notificationCenter.ts` verwaltet Meldungen mit ID, Kategorie, Text, stabilem Schlüssel, Runde und Zeitstempel. Es gibt keine Timer im Kern.
- **Duplikat-Schutz.** Solange eine Meldung mit demselben Schlüssel aktiv ist, wird sie nicht erneut eingereiht. Bau-, Rekrutierungs- und Schiffsbaumeldungen enthalten die Runde im Schlüssel, damit derselbe Auftrag in einer späteren Runde erneut melden darf, ein erneutes Laden aber nicht doppelt zählt.
- **Obergrenze und dauerhafte Warnungen.** `NOTIFICATION_LIMIT = 8`, älteste Meldungen fallen zuerst heraus. `STICKY_CATEGORIES` enthält `warning`; Warnungen bleiben bis zum Schließen stehen.
- **Ereignisbrücke.** `src/core/notificationBridge.ts` übersetzt `turn:changed`, `system:surveyed`, `planet:surveyed`, `colony:founded`, `colony:failed`, `hex:claimed`, `build:queued`, `build:completed`, `unit:recruited`, `research:completed`, `colony:tierChanged`, `fleet:ship-built` und `fleet:arrived` in Meldungen. `game:loaded` leert den Stapel; KI-Ereignisse werden anhand der Zivilisations-ID verworfen.
- **Neue Ereignisse.** `build:completed` und `unit:recruited` werden von `GameEngine.emitBuildCompletion()` erzeugt, nachdem `BuildQueueManager.advanceQueue()` einen Auftrag abgeschlossen hat.
- **Darstellung.** `NotificationStack.tsx` zeichnet einen vertikalen Stapel mit festem Abstand. Jede Karte besitzt ihre eigene Ablaufzeit (Bau/Rekrutierung 5 s, Forschung 5,5 s, Warnung dauerhaft); dadurch überdecken sich mehrere Meldungen nicht.
- **Manuelle Hinweise.** Fehlgründe aus UI-Aktionen laufen über `notify('warning', …)` in dasselbe Center. Die alten `turnNotification`-Zustände und `setTimeout`-Ketten sind entfernt.

### Begründung
- Ein einziger Kanal garantiert, dass jeder Abschluss gleich behandelt wird, unabhängig davon, ob er aus der Engine oder aus einer UI-Aktion stammt.
- Schlüssel statt Textvergleich machen den Duplikat-Schutz unabhängig von Formulierungen.
- Timer in der UI halten den Kern deterministisch und testbar.

### Konsequenzen
- `tests/notifications.test.ts` prüft in 13 Fällen Duplikate, Obergrenze, Schließen, Abonnenten, dauerhafte Warnungen, Bau/Rekrutierung/Forschung/Kolonisation/Erkundung, mehrere Abschlüsse derselben Runde, KI-Filter, Leeren beim Laden, erneutes Laden und Abmelden.
- **Bekannte Einschränkung:** Es gibt keine Historie und keinen Benachrichtigungsfilter; ältere Meldungen verschwinden nach Ablauf oder durch die Obergrenze.

---

## ADR-045: Flottenmarker, Routen und vollständiger Spielstand

### Kontext
Alle Verbände wurden als gleichförmige Punkte gezeichnet. Bei mehreren Verbänden in einem System überlagerten sie sich, waren nicht einzeln anklickbar und verdeckten teilweise Sternennamen. Zusätzlich musste geprüft werden, dass Handelsrouten und Flottenbewegungen einen Spielstand überstehen.

### Entscheidung
- **Silhouette je Klasse.** `dominantFleetClass()` bestimmt aus den Schiffen die schwerste Klasse (`colony`, `scout`, `frigate`, `cruiser`, `destroyer`, `corvette`). Jede Klasse hat eine eigene Form und Farbe (Arche, Pfeil, Raute, Quadrat, Hexagon, Kreis); bewegte Verbände werden cyan hervorgehoben.
- **Ringlayout.** `fleetMarkerOffset(index, count, zoom)` verteilt Marker auf einem Ring (maximal sechs pro Ring, danach ein zweiter Ring). Die Positionen sind paarweise verschieden und halten mindestens 14 Pixel Abstand.
- **Klickpriorität.** Die Trefferprüfung läuft vor der Systemauswahl: Erst werden Verbandsmarker mit demselben Ringlayout geprüft, dann Sternensysteme. Ein Klick ohne Treffer hebt die Verbandsauswahl auf.
- **Auswahl und Info-Karte.** `selectedFleetId` hebt den Marker mit einem Ring hervor und zeigt eine kompakte Karte mit Name, Klasse, Schiffsanzahl, Status, Ziel und Fracht.
- **Zeichenreihenfolge.** Marker werden gesammelt und nach Sternen, Labels und Routen gezeichnet. Dadurch bleiben sie sichtbar und anklickbar.
- **Routen und Spielstand.** Handelsrouten sind bereits sichtbar, änderbar und entfernbar; ihre Wiederherstellung wird geprüft. Flottenbewegung, Ziel, Pfad und Fracht überstehen den Spielstand. `CURRENT_SAVE_VERSION` bleibt 4; `Fleet.cargo` ist optional, ältere Spielstände bleiben lesbar.

### Begründung
- Form plus Farbe macht Verbände auch ohne Tooltip unterscheidbar und erfüllt die visuelle Anforderung ohne neue Grafik-Assets.
- Ein deterministisches Ringlayout ist testbar und verhindert exakte Überlagerung konstruktiv.
- Die Klickpriorität entspricht der sichtbaren Ebenenreihenfolge; sonst würde ein Klick auf einen Marker das darunterliegende System auswählen.

### Konsequenzen
- `tests/fleetRendering.test.ts` prüft in 7 Fällen die drei Startklassen, die Prioritätsreihenfolge, den Fallback, paarweise verschiedene Positionen, Mindestabstand, den zweiten Ring und die Zoomunabhängigkeit der Eindeutigkeit.
- `tests/saveLoadFeature.test.ts` prüft in 3 Fällen, dass Laden keine Galaxie neu generiert, Steuerfelder/Flottenroute/Fracht erhalten bleiben und Handelsrouten nach dem Laden sichtbar, änderbar und entfernbar sind.
- **Bekannte Einschränkung:** Die Marker sind Canvas-Zeichnungen ohne Animation; Auswahl und Bewegung werden nur statisch hervorgehoben.
- **Bekannte Einschränkung:** Bei sehr vielen Verbänden in einem System wächst der zweite Ring über den Systemnamen hinaus; eine Kollisionsvermeidung mit Labels gibt es nicht.

---

## ADR-046: Reichsverwaltung, Governance-Politik und innere Fraktionen

### Kontext
Phase 4 umfasste neben Flotten und Diplomatie auch die innenpolitische Ebene. Das bestehende Fraktionsmodell aus Modul 4 war nur ein Datenfeld ohne Rückwirkung auf die Wirtschaft. Es fehlte eine Verwaltungskapazität, die Expansion begrenzt, sowie eine Entscheidungsebene, die Fraktionen gegeneinander abwägt. Gleichzeitig mussten alle bestehenden Wirtschafts- und Steuertests mit exakten Erträgen unverändert weiterlaufen; insbesondere der erste Rundenwechsel durfte nicht durch neue Modifikatoren verändert werden.

### Entscheidung
- **Eigenes Kernmodul.** `src/core/empireManager.ts` verwaltet je Zivilisation einen `EmpireState` mit Politik, Cooldown und drei Fraktionen (`industrialists`, `scientists`, `militarists`). Das Modul ist React-frei; alle Kennzahlen werden aus einem `EmpireSnapshot` berechnet.
- **Neutraler Start.** Jedes Reich beginnt mit `balanced`, Einfluss 34/33/33 und Loyalität 50. Die Modifikatoren werden aus dem Zustand der **letzten** Runde berechnet; die Neubewertung läuft in `GameEngine.endTurn()` nach Ökonomie und Kämpfen, aber vor dem Auto-Save. Dadurch bleibt der erste Rundenwechsel exakt neutral.
- **Verwaltungskapazität.** `capacity = 4 + floor(abgeschlossene Technologien / 2) + floor(Staatskasse / 1500)`. Die Last beträgt `Außenposten 1`, `Siedlung 2`, `Kolonie 3` plus `ceil(Distrikte / 4)`. Overextension ist `max(0, Last − Kapazität)`; sie senkt die Effizienz auf `max(0,5; 1 − 0,1 · Overextension)` und die Zustimmung um `min(10; 2 · Overextension)`.
- **Politikfelder.** `balanced` ist neutral (alle Multiplikatoren 1, Zustimmung ±0). `industry` gibt Produktion ×1,15, `science` Forschung ×1,15, `military` Einfluss ×1,15 und Produktion ×1,05; die Zustimmungsabzüge betragen −3/−3/−2. Ein Wechsel ist nur alle `EMPIRE_POLICY_COOLDOWN_TURNS = 5` Runden erlaubt; dieselbe Politik erneut zu wählen ist ein Fehler.
- **Fraktionsdynamik.** Die Ziel-Loyalität je Fraktion ergibt sich aus Politiknähe (±12/−4), Produktion bzw. Forschung pro Kopf, Steuersatz, Handelsrouten, Kriegen und Overextension. Die neue Loyalität ist ein 50/50-Mittel aus altem Wert und Zielwert; der Einfluss wird mit 70/30 aus altem Einfluss und `Loyalität + Politikbonus` fortgeschrieben und anschließend auf exakt 100 normiert. Gleiche Ausgangsdaten ergeben damit dasselbe Ergebnis.
- **Wirtschaftliche Wirkung.** Die gewichtete Loyalität verschiebt die Zustimmung um `clamp(round((gewichtete Loyalität − 50) / 10), −5, 5)`. Eine dominante Fraktion mit mindestens 40 Einfluss und 60 Loyalität verstärkt ihren Schwerpunkt zusätzlich um 5 %. `EconomyEngine` skaliert nur positive Produktions-, Forschungs- und Einflusserträge; Unterhalt und negative Erträge bleiben unverändert.
- **Unruhe.** Unterschreitet eine Fraktion 30 Loyalität, entsteht eine dauerhafte Warnung; ab 40 gilt sie als beigelegt und die Warnung wird über `NotificationCenter.removeByKey()` entfernt. Die Ereignisse heißen `empire:faction-unrest` und `empire:faction-recovered`.
- **KI.** KI-Reiche richten ihre Politik alle zehn Runden an der dominanten Fraktion aus, sofern der Cooldown abgelaufen ist. Es gibt keine eigene KI für Investitionen oder Fraktionspflege.
- **Persistenz.** `SaveGameData.empireStates` ist optional; `CURRENT_SAVE_VERSION` bleibt 4. Beim Laden werden unbekannte Politiken, fehlende Fraktionen und ungültige Zahlen auf Standardwerte normalisiert; fehlende Reichsdaten erzeugen neue Standardzustände.
- **UI.** `EmpireModal` zeigt Verwaltungslast, Politikauswahl mit Cooldown, Fraktionskarten und aktuelle Modifikatoren. Die `TopNavBar` erhält den Knopf „Reich" mit Unruhe-Abzeichen.

### Begründung
- Die Trennung von Bewertung (Rundenende) und Wirkung (nächste Runde) hält bestehende exakte Wirtschaftstests stabil und macht den Effekt einer Politik nachvollziehbar.
- Ein aggregierter Snapshot statt direkter Zugriffe auf Manager hält das Modul testbar und verhindert Zyklen zwischen Ökonomie, Flotten und Diplomatie.
- Die 70/30-Fortschreibung verhindert sprunghafte Fraktionswechsel und lässt politische Entscheidungen über mehrere Runden wirken.
- Die Normierung auf 100 macht Einfluss direkt als Prozentwert lesbar und verhindert Rundungsdrift.

### Konsequenzen
- `tests/empire.test.ts` prüft in 14 Fällen den neutralen Start, Politikwechsel und Cooldown, die drei Politikfelder, Verwaltung und Overextension, Steuer-/Kriegs-/Forschungseinfluss auf Fraktionen, den Dominanzbonus, Save/Load inklusive Altständen, die Snapshot-Gewichtung, die KI-Politik, Determinismus, die Engine-Integration und die Meldungsbrücke.
- Die Suite umfasst **339 Tests in 29 Dateien**; `npm run lint` und `npm run build` sind sauber (nur die bestehende Chunk-Größenwarnung).
- **Bekannte Einschränkung:** Fraktionen haben keine eigenen Aktionen, keine Sitze oder Wahlen und keine Separatismus-Folgen; Unruhe ist wirtschaftlich nur über Loyalität und Zustimmung spürbar.
- **Bekannte Einschränkung:** Die Zielwerte sind plausible Setzungen ohne Kalibrierung an langen Partien; die KI reagiert nur über die Politik, nicht über Fraktionspflege.

---

## ADR-047: Narrative Ebene mit Ereignissen, Ausgrabungsstätten und galaktischer Krise

### Kontext
Phase 5 sollte die Galaxiegeschichte erzählerisch verdichten, ohne ein zweites Wirtschafts-, Zeit- oder Speichersystem einzuführen. Bestehende exakte Wirtschafts- und Steuertests mussten unverändert bleiben; insbesondere der erste Rundenwechsel durfte nicht durch narrative Modifikatoren beeinflusst werden. Gleichzeitig sollten Ereignisse reproduzierbar sein, Ausgrabungen an die bereits vorhandenen Planetenanomalien anknüpfen und die Krise erst im späten Spielverlauf relevant werden.

### Entscheidung
- **Ein Kernmodul.** `src/core/narrativeManager.ts` verwaltet je Zivilisation einen `NarrativeState` (Flags, offenes Ereignis, Chronik, nächster Ereignistermin, aktive Grabung), die globalen Ausgrabungsstätten und genau einen `GalacticCrisisState`. Das Modul ist React- und EventBus-frei und gibt alle Wirkungen als Ergebnis zurück.
- **Datengetriebene Ereignisse.** `src/data/narrativeEvents.ts` enthält acht einmalige Ereignisse mit je drei Entscheidungen. Jede Entscheidung kann Credits, Forschung, Fraktionsloyalität und ein dauerhaftes Flag verändern. Die Auswahl filtert nach `minTurn`, bereits gespielten Ereignissen und Flag-Bedingungen und zieht anschließend gewichtet über `SeededPRNG(seed:narrative:civId:turn)`. Nur das Spieler-Reich erhält offene Entscheidungen; KI-Reiche werden nicht unterbrochen.
- **Keine unbezahlbaren Entschlüsse.** Negative Credit-Wirkungen werden vor dem Speichern der Entscheidung gegen die Staatskasse geprüft. Unbekannte Entscheidungen und fehlende Credits lassen das Ereignis offen; die Chronik speichert höchstens 40 Einträge.
- **Ausgrabungsstätten.** `generateExcavationSites` bevorzugt Planeten mit `anomalyDetected`, füllt bei weniger als drei Kandidaten mit anderen Nicht-Gasriesen auf, mischt deterministisch und begrenzt auf zwölf Stätten. IDs sind `excavation-<planetId>`. Stätten sind zunächst `undiscovered`; erst eine vollständige Planetenanalyse deckt sie auf. Pro Reich ist höchstens eine Grabung aktiv, der Start kostet 75 ◈.
- **Fortschritt und Belohnung.** Der Fortschritt pro Runde ist `clamp(5 + floor(Forschung pro Runde / 10), 5, 25)`. Bei Erreichen der Schwierigkeit wird die Stätte `completed`, vergibt Credits und Forschung und setzt das Flag `excavation_completed`. Der Manager bucht nichts selbst; `GameEngine` wendet die Belohnungen an.
- **Galaktische Krise.** Die Krise startet ab Runde 40 oder nach zwei abgeschlossenen Ausgrabungen, sofern das Spieler-Reich mindestens eine Kolonie besitzt. Die Stufen `signal`, `awakening`, `resolution` und `resolved` wechseln im Abstand von acht Runden. Eindämmung kostet 150 ◈ und erhöht den Fortschritt um 20; bei mindestens 60 endet die Krise als `contained`, sonst als `ignored`. `embraced` bleibt als zukünftiger Ausgang im Datentyp reserviert.
- **Modifikatoren.** Die Krisenmodifikatoren werden in `GameEngine.getCombinedModifiers` mit den Reichsmodifikatoren multipliziert (Zustimmung addiert und geklemmt). Vor dem Ausbruch sind sie neutral; `signal` gibt Forschung ×1,05 und Zustimmung −1, `awakening` Produktion ×0,95, Forschung ×1,1 und Zustimmung −3, `resolution` Produktion ×0,9, Forschung ×1,15 und Zustimmung −5, `contained` Forschung ×1,05 und Zustimmung +2, `ignored` Produktion ×0,95 und Zustimmung −3.
- **Rundenreihenfolge.** Die narrative Phase läuft in `GameEngine.endTurn()` nach der Ökonomie und vor der Reichsbewertung sowie dem Auto-Save. Dadurch fließen Belohnungen noch in dieselbe Runde, während die erst am Rundenende neu bewerteten Reichsmodifikatoren weiterhin erst ab der Folgerunde wirken.
- **Persistenz.** `SaveGameData.narrative` ist optional; `CURRENT_SAVE_VERSION` bleibt 4. Beim Laden werden Stätten, Zustände, Flags, offene Ereignisse und die Krise normalisiert; fehlende narrative Daten erzeugen neue Stätten und Standardzustände. Alte Spielstände bleiben lesbar.
- **UI und Meldungen.** `NarrativeModal` zeigt offene Entscheidungen, Ausgrabungsfortschritt, Krisenstatus mit Eindämmungsbalken und die Chronik. Die `TopNavBar` erhält „Chronik" mit Abzeichen für offene Ereignisse bzw. aktive Krisen; nach einem Rundenwechsel mit offenem Ereignis öffnet sich das Modal automatisch. Die Benachrichtigungsbrücke übersetzt `narrative:*`-Ereignisse; Ereignis- und Krisenwarnungen sind dauerhaft und werden über die Schlüssel `narrative-event:<civId>` und `narrative-crisis:active` ersetzt oder entfernt.

### Begründung
- Ein einziges zustandsarmes Modul verhindert parallele Erzähllogik in Engine, UI und Benachrichtigungen.
- Seed, Reich und Runde als Auswahlgrundlage machen Ereignisse reproduzierbar und testbar, ohne zusätzliche Zufallsquelle im Spielstand.
- Die Trennung von Entscheidung (Manager) und Buchung (Engine) hält die bestehenden Wirtschaftsregeln unangetastet und verhindert doppelte Credit-Abzüge.
- Die späte Krisenschwelle und die neutrale Anfangsphase schützen die exakten Erste-Runde-Tests.
- Optionale Save-Felder statt Versionssprung vermeiden eine erzwungene Migration bereits funktionierender Spielstände.

### Konsequenzen
- `tests/narrative.test.ts` prüft in 13 Fällen deterministische Stätten, Aufdeckung, Startbedingungen, Forschungsfortschritt und Belohnung, Ereignisauswahl, Flags und Kostenprüfung, Krisenstart und -stufen, Eindämmung und Ausgänge, Modifikatoren, Save/Load inklusive Altständen und fehlerhaften Daten, die Engine-Integration und die Meldungsbrücke.
- Die Suite umfasst **352 Tests in 30 Dateien**; `npm run lint` und `npm run build` sind sauber (nur die bestehende Chunk-Größenwarnung).
- **Bekannte Einschränkung:** Es gibt keine verzweigten Ereignisketten, keine eigenen KI-Entscheidungen und keinen `embraced`-Pfad; die Krise ist ein globaler Zustand ohne Flotten- oder Kolonieinteraktion.
- **Bekannte Einschränkung:** Ausgrabungen sind wirtschaftlich nur über Startkosten und Abschlussbelohnungen spürbar; es gibt keine Grabungseinheiten, Risiken oder Fehlschläge.

---

## ADR-048: Sieg, Niederlage, Punktewertung und Abschlussbildschirm

### Kontext
Nach Phase 5 war die Simulation vollständig, aber ziellos: Es gab weder Sieg noch Niederlage, keine Punkte und keinen Anlass, eine Partie zu beenden. Gleichzeitig mussten alle bestehenden Systeme unangetastet bleiben – insbesondere der neutrale erste Rundenwechsel, die exakten Wirtschaftstests und das Speicherformat v4. Die Partie sollte außerdem nicht mitten im Aufbau enden, nur weil ein einzelnes Zwischenziel erreicht ist.

### Entscheidung
- **Ein Kernmodul.** `src/core/victoryManager.ts` ist React-frei und zustandsarm: Es bekommt einen `VictorySnapshot` mit allen Kennzahlen und liefert `GameOutcome`, `VictoryOverview`, Punkte und Rangliste. Die Engine baut den Snapshot aus Kolonien, Bevölkerung, Technologien, Flotten, Staatskasse und Narrativzustand.
- **Drei Siegbedingungen.** **Dominanz** verlangt mindestens `VICTORY_DOMINATION_COLONIES = 8` eigene Kolonien *und* `VICTORY_DOMINATION_SHARE = 0,6` der besiedelten Systeme. **Transzendenz** verlangt `VICTORY_SCIENCE_TIER4_TARGET = 3` abgeschlossene Technologien der Stufe 4 (von sechs, drei sind exklusiv). **Chronik** verlangt `VICTORY_NARRATIVE_EXCAVATIONS = 3` abgeschlossene Ausgrabungen und den Krisenausgang `contained`.
- **Eine Niederlage.** **Auslöschung** tritt ein, wenn das Spieler-Reich keine Kolonie mehr besitzt, aber zuvor mindestens eine hatte (`peakColonyCount > 0`). Damit löst der Spielstart ohne Kolonie keine Niederlage aus.
- **Priorität und Einfrieren.** Geprüft wird in der Reihenfolge Niederlage → Dominanz → Transzendenz → Chronik. Nach dem ersten Ergebnis wird `GameOutcome` eingefroren; weitere Auswertungen ändern weder Bedingung noch Runde, sondern führen nur den Kolonie-Höchststand fort.
- **Punkte.** Kolonien 50, je 1.000 Bevölkerung 1, Technologie 10, je 10 Flottenstärke 1, je 100 ◈ Staatskasse 1, Ausgrabung 25, eingedämmte Krise 75. Die Rangliste enthält alle Reiche und sortiert nach Punkten, Kolonien, Technologien und `civId`.
- **Rundenreihenfolge.** Die Auswertung läuft in `GameEngine.endTurn()` als Schritt 2.6 nach Narrativ und Reichsverwaltung und vor dem Auto-Save. Sie bucht keine Ressourcen und verändert keine Modifikatoren; der erste Rundenwechsel bleibt dadurch exakt neutral.
- **Persistenz.** `SaveGameData.outcome` ist optional; `CURRENT_SAVE_VERSION` bleibt 4. Beim Laden werden Status, Bedingung, Runde, Punkte, Aufschlüsselung und Rangliste normalisiert. Fehlt der Ausgang (Altstand), bleibt die Partie offen und die aktuelle Koloniezahl wird als Höchststand übernommen; ein Ausgang ohne gültige Bedingung wird verworfen.
- **UI.** `EndScreen` zeigt Sieg/Niederlage, Bedingung, Runde, Punkteaufschlüsselung und Rangliste; nach einem Sieg lässt sich die Partie als Sandbox fortsetzen, eine Niederlage führt zurück ins Menü. `VictoryModal` („Menü → Ziele & Punkte") zeigt die drei Bedingungen mit Fortschrittsbalken, die eigene Punkteaufschlüsselung und die Rangliste. `App.tsx` prüft den Ausgang nach jedem Rundenwechsel und nach jedem Laden und wechselt in den Modus `gameOver`.

### Begründung
- Rein abgeleitete Kennzahlen bedeuten keine neuen Save-Felder für Wirtschaft, Forschung oder Flotten und keine doppelte Buchführung.
- Die Mindestzahl von acht Kolonien verhindert, dass Dominanz in kleinen Galaxien nach zwei Gründungen auslöst, und hält die Narrative-Krise (ab Runde 40) als eigenen Pfad relevant.
- Das Einfrieren macht einen geladenen Endstand reproduzierbar und verhindert, dass Sandbox-Partien nachträglich als Sieg umgeschrieben werden.
- Ein optionales Ausgangsfeld hält alte Spielstände ohne Migration lesbar und vermeidet einen Versionssprung.
- Der Abschlussbildschirm nutzt dieselbe Bildsprache wie das Hauptmenü und macht Punkte und Rangliste direkt lesbar.

### Konsequenzen
- `tests/victory.test.ts` prüft in 15 Fällen Offenheit und Punkte, alle drei Siegbedingungen inklusive Grenzwerten, Niederlage und Startschutz, Priorität, Einfrieren, Aufschlüsselung und Rangliste, Fortschrittstexte, Save/Load inklusive Alt- und Fehlerständen sowie die Engine-Integration.
- `tests/victoryUi.test.tsx` prüft in 5 Fällen die Server-Render-Ausgabe von `EndScreen` und `VictoryModal` (Texte, Bedingung, Punkte, Rangliste, geschlossener Zustand, fehlende Daten).
- Die Suite umfasst **372 Tests in 32 Dateien**; `npm run lint` und `npm run build` sind sauber (nur die bestehende Chunk-Größenwarnung).
- **Bekannte Einschränkung:** Solange die KI weder expandiert noch invadeert (ADR-035), ist Dominanz ein Wettlauf gegen passive Reiche; die volle Wirkung entsteht erst mit Modul 6.2/6.3.
- **Bekannte Einschränkung:** Es gibt keine Rundenbegrenzung und keinen Zeit-Sieg; eine Partie ohne Koloniegründung läuft unbegrenzt offen.
- **Bekannte Einschränkung:** Die Punktegewichte sind plausible Setzungen ohne Kalibrierung an langen Partien.

---

## ADR-049: Dwarf-Fortress-nahe Oberflächengenerierung und Pixel-Tiles

### Kontext
Die Oberflächengenerierung aus ADR-034 erzeugte bereits zusammenhängende Landmassen, kannte aber nur ein grobes Feuchtigkeitsfeld und zehn Biome. Wälder, Dschungel, Marschen und Gletscher fehlten als eigene Klassen; Temperatur und Niederschlag waren nicht als Kachelwerte gespeichert. Die Oberfläche wurde ausschließlich als flache Biormfarbe gezeichnet, obwohl unter `Tilesets/Planetenbiome` ein vollständiges 32×32-Pixel-Tileset nach Biom sortiert vorliegt. Für Lavawelten, Gasriesen und fremdartige Biome existiert dort keine Grafik. Gleichzeitig sollten Wirtschaft, Steuern, der neutrale erste Rundenwechsel und das Speicherformat v4 unverändert bleiben.

### Entscheidung
- **Generator-Version 4.** `SurfaceGenerator.GENERATOR_VERSION` steigt von 3 auf 4, der Seed lautet `${galaxySeed}:${planet.id}:surface:v4`. Neue Oberflächen werden damit neu erzeugt; bereits gespeicherte `PlanetSurface`-Objekte bleiben unverändert und werden weiterhin geladen.
- **Sechs Felder statt fünf.** Elevation, Temperatur, Niederschlag, Vulkanismus, Impakt und Wildheit (`savagery`) werden getrennt verrauscht. Die Temperatur folgt Planetentyp-Basis, Breitengrad und Höhenlapse (Band 2 −0,08, Band 3 −0,22); Kryowelten werden auf 0,28 gedeckelt. Der Niederschlag folgt DF-nahen Klimagürteln (feuchter Äquator, trockene Subtropen, feuchte Mittelbreiten, trockene Pole), Küstenfeuchte per BFS-Abstand zum Ozean sowie orografischem Regenschatten mit Westwind. Aride Welten werden auf 0,42 Niederschlag gedeckelt.
- **Abfluss als eigenes Feld.** Die bestehende Hydrologie (ADR-037) liefert `riverDischarge`; daraus wird ein logarithmisch normalisierter Wert `drainage` (0–1) abgeleitet und in die Kachel geschrieben. Flüsse und Seen erhöhen zusätzlich den Niederschlag ihrer Kachel und Nachbarn.
- **Biommatrix.** Band 0 = Ozean (auf Vulkanwelten Lavasee), Band 3 = Hochgebirge, Band 2 = Hügel, Gletscher oder Vulkanit, Band 1 = Krater, Schnee, Tundra, Marsch (See oder Fluss mit Abfluss > 0,5), Wüste, Xenoflora/Pilzwald bei hoher Wildheit, Dschungel, Wald oder Ebene. Giftwelten erzeugen `alien` in feuchten Becken und `toxic` sonst; Vulkanwelten erzeugen `lava` in aktiven Zonen. Die Landezone bleibt über `ensureArableBiome` auf `plains`, `forest`, `jungle`, `marsh`, `fungal_forest` oder `hills` beschränkt und immer gefahrlos.
- **Gasriesen als reine Platzhalterschicht.** Gasriesen erhalten 180 `gas`-Kacheln ohne Hydrologie, Vorkommen, Gefahren und Landezone. Die Oberflächenansicht bleibt bedienbar, eine Kolonisation ist weiterhin ausgeschlossen.
- **Landepunkt filtert nach Passierbarkeit.** `SurfaceManager.findOptimalColonyLandingSite` schließt jetzt jedes Biom mit `isImpassable` aus dem `BIOME_CATALOG` aus, statt nur Ozean und Gebirge zu nennen. Damit sind auch Lavaseen und Gaswolken keine gültigen Landeplätze.
- **Neue optionale Kachelfelder.** `PlanetHexTile` erhält `temperature`, `rainfall`, `drainage` und `savagery`; `CURRENT_SAVE_VERSION` bleibt 4. Alte Spielstände ohne diese Felder rendern über Biom-Defaults und zeigen im Inspektor keine Klimazeile.
- **Reine Tile-Zuordnung.** `src/ui/surfaceTileMapping.ts` bildet Biom, Planetentyp, Küstennähe und Gewässernähe auf Basis- und Aufsatz-Tiles ab. `src/ui/surfaceTileAssets.ts` bindet ausschließlich die einzelnen `TILE_*.png` per Vite-Glob ein (nicht die großen Referenz-Spritesheets) und cached die decodierten Bilder. Der Canvas zeichnet Basis, transparenten Aufsatz, optionale Tönung und Kraterring in den Hexagon-Clip; die Variantenwahl ist per FNV-1a aus Oberflächen-Seed und Kachelschlüssel stabil.
- **Prozedurale Platzhalter.** Lavaseen und Vulkanit zeichnen glühende Risse und Magmapunkte, Gasriesen Wolkengürtel und Sturmwirbel, Giftauen Säuretümpel und Sprenkel, Xenoflora biolumineszente Punkte und Stängel. Alle Platzhalter sind deterministisch aus dem Kachelschlüssel abgeleitet.
- **Feindliche Farbwelt.** Auf Gift- und Vulkanwelten werden Ebenen und Hügel als karge Steppe (`TILE_PLAINS` mit Hügelaufsatz) gezeichnet; auf Wüstenwelten Ebenen als Steppe, Marschen als Schwemmfläche und Hügel als Dünen. Die Erträge und Biome bleiben unverändert, nur die Darstellung folgt dem Planetentyp.
- **Terraforming und UI.** `HexBiome` erhält `forest`, `jungle`, `marsh`, `snow`, `lava`, `alien` und `gas`; `BIOME_CATALOG`, Terraforming-Ziele, `TRANSFORMABLE_BIOMES` (zusätzlich `lava` und `alien`) und die Labels im `TerraformingModal` werden ergänzt. Der `HexTileInspector` zeigt Klima, Niederschlag und Abfluss, sofern vorhanden.

### Begründung
- Die Trennung von Höhe, Temperatur, Niederschlag, Abfluss und Wildheit erzeugt nachvollziehbare Landschaftsgürtel und macht Biomentscheidungen einzeln prüfbar.
- Optionale Kachelfelder und ein unveränderter Save-Versionstand vermeiden eine Migration bereits funktionierender Spielstände.
- Die reine Mapping-Schicht ist ohne Canvas testbar; der Canvas bleibt für Zoom, Pan, Fog of War und Einheiten zuständig.
- Platzhalter halten die Oberfläche auch für Biome bedienbar, für die noch keine Grafik existiert, ohne das Tileset zu verändern.
- Der Ausschluss unpassierbarer Biome verhindert, dass eine Kolonie auf einem Lavasee oder in einer Gaswolke landet.

### Konsequenzen
- `tests/surface_generator.test.ts` prüft in 13 Fällen unter anderem Klimanormierung, Gasriesen-Platzhalter, Wüstenfreiheit von Wald/Dschungel und charakteristische Biome je Planetentyp.
- `tests/surface_tiles.test.ts` prüft in 7 Fällen Basis/Aufsatz, Küsten- und Eiswasser, Platzhalter, Kraterring, feindliche Steppe und die Stabilität der Variantenwahl.
- Die Suite umfasst **382 Tests in 33 Dateien**; `npm run lint` und `npm run build` sind sauber (nur die bestehende Chunk-Größenwarnung).
- **Bekannte Einschränkung:** Gespeicherte Oberflächen aus älteren Spielständen behalten Generatorversion 3 und Klima-Fallbacks; sie werden nicht automatisch neu generiert.
- **Bekannte Einschränkung:** Für Lava-, Gas- und Xeno-Biome gibt es weiterhin nur prozedurale Platzhalter, keine gezeichneten Tilesets.
- **Bekannte Einschränkung:** Die Landezone auf Gift- und Vulkanwelten bleibt spielmechanisch fruchtbar und wird nur als karge Steppe dargestellt; das ist eine bewusste Trennung von Ertrag und Bildsprache.

---

## ADR-050: Kolonieverwaltung mit getrennten Bereichen für Steuern, Bevölkerung und Bauplätze

### Kontext
Die Kolonieverwaltung bündelte Steuersatz, Korruption, Approval, Wartung und Staatskasse in einem immer sichtbaren Streifen über vier Tabs (Übersicht, Bauwarteschlange, Gebäude, Einheiten). Damit war der Steuerregler zwar erreichbar, aber mit Finanzkennzahlen, Baukarten und Rekrutierung auf einer Fläche konkurrierend. Für die Bevölkerung gab es nur einen Wachstumsbalken; freie Arbeitskräfte, Prognosen bis zum nächsten Pop und der Zusammenhang zwischen Zufriedenheit und Wachstum waren nicht ablesbar. Bauplätze waren nur indirekt über fehlgeschlagene Bauversuche erfahrbar. Gleichzeitig sollte die Bedienung näher an die Basisbau-Referenz „Silence of the Siren" (Steam-App-ID 2147380, Unity/Mono) rücken: eine Kommandozentrale mit klar getrennten Bereichen, sichtbaren Slot-Zuständen und Verfügbarkeitsanzeigen statt verstreuter Einzelwerte.

### Entscheidung
- **Sechs Tabs.** `ColonyModalTab` umfasst `overview`, `tax`, `population`, `queue`, `buildings` und `units`; die Beschriftungen lauten Übersicht, Steuern, Bevölkerung, Bauwarteschlange, Bauplätze und Rekrutierung. Der Oberflächenklick startet in `overview`, das Baumenü weiterhin in `queue`. Tab-Badges zeigen Steuersatz, Pops, Warteschlangenlänge und Gebäudezahl.
- **Reines View-Modell.** `src/ui/colonyAdministration.ts` liefert `getTaxProjection`, `getPopulationForecast`, `getBuildingSlotSummary` und `COLONY_TIER_LABELS`. Die Funktionen lesen nur; sie verändern weder Vorräte noch Bevölkerung, Wachstum oder Arbeitszuweisung. Schreibende Aktionen laufen ausschließlich über die bestehenden Engine-Callbacks (`onSetTaxRate`, `onSetWorkFocus`, `onQueueBuilding`, `onQueueUpgrade`, `onQueueUnit`).
- **Steuern.** Regler 0–60 % in 5er-Schritten plus Voreinstellungen 0/15/30/45/60 %. Angezeigt werden Steuereinnahmen, Korruption, Credit-Wartung, Privatsektorsteuer, Netto-Credits dieser Kolonie und die projizierte Staatskasse nach der nächsten Runde. Die Projektion entspricht der Gutschrift in `GameEngine.endTurn` (Steuern + Privatsektor − Wartung); andere Kolonien bleiben bewusst außen vor. Der Zufriedenheitsbalken erklärt den Wachstumsfaktor.
- **Bevölkerung.** Pops und Kolonisten, Wachstumsfortschritt mit Prozentbalken, erwarteter Zuwachs pro Runde, verbleibende Runden bis +1 Pop, Zufriedenheits- und Habitabilitätsfaktor, bewirtschaftete Hexfelder, freie Arbeitskräfte und die sechs Arbeitsfokusse. Fehlt der Nahrungsüberschuss, wird das als Warnung ausgewiesen statt eine Prognose zu erfinden.
- **Bauplätze.** Kennzahlen für bebaut, frei, durch Distrikte belegt und Territorium; die Zählung nutzt dieselben Bedingungen wie `BuildQueueManager.validateBuildingPlacement` (kein Stadtzentrum, kein Gebäude, kein Distrikt). Die Gebäudeliste zeigt Stufe, Hexfeld, Aktivstatus, Unterhalt und Erträge sowie den Ausbau mit Zielstufe und Kosten. Baukarten im Warteschlangen-Tab tragen Verfügbarkeits-Chips „Verfügbar", „Ressourcen fehlen" und „Bauplatz gesperrt".
- **Übersicht.** Kolonieprofil (Stufe, Gründung, Status, Stadtzentrum, Habitabilität), Kennzahlen, Territoriumszeile, zwei Direkteinstiege in Steuern und Bevölkerung sowie gesammelte Warnhinweise (Energiedefizit, Unruhe, hoher Steuersatz, keine freien Bauplätze).
- **Kopfbereich.** Der Modal-Kopf zeigt Name, Entwicklungsstufe, Pops und Kolonisten; die Finanz- und Steuerdetails wandern aus dem immer sichtbaren Streifen in den Steuern-Tab. Der Ressourcenstreifen bleibt unverändert.
- **Kein neuer Engine-Hook.** Der Klick auf ein Stadtzentrum im `PlanetSurfaceCanvas` und der Knopf „Kolonie verwalten" im `HexTileInspector` waren bereits mit `handleOpenColonyManagement` verdrahtet; die Verwaltung öffnet sich jetzt nur mit dem erweiterten Tab-Satz.

### Begründung
- Ein Tab pro Entscheidung hält Steuern, Bevölkerung und Bauplätze getrennt lesbar; die Übersicht bleibt ein Einstieg statt einer Sammelfläche.
- Abgeleitete Werte halten Anzeige und Engine automatisch synchron, ohne zusätzliche Save-Felder oder doppelte Buchführung. Das schützt zugleich vor dem in ADR-040 behobenen Exploit, weil reine Anzeigen keinen Wirtschaftszug auslösen.
- Die Slot-Zählung teilt die Bedingungen mit der Bauvalidierung, damit „frei" in der Verwaltung und „baubar" in der Warteschlange nicht auseinanderlaufen.
- Verfügbarkeits-Chips und getrennte Basis-/Ausbaukosten folgen dem Referenzmodell und machen die Ablehnungsgründe vor dem Klick sichtbar.

### Alternativen
- Alle Kennzahlen im Übersicht-Streifen belassen: verworfen, überlädt die Ansicht und verdeckt die Handlungsmöglichkeiten.
- Projektionen im Spielstand speichern: verworfen, sie sind vollständig aus Kolonie, Katalog und Staatskasse ableitbar.
- Steuerregler direkt einen vollen Wirtschaftszug auslösen lassen: verworfen, das wäre der bereits behobene Ressourcen-Exploit (ADR-040).
- Eigene Verwaltungs-Engine neben `EconomyEngine` und `BuildQueueManager`: verworfen, hätte zwei Wahrheiten für Steuern und Slots erzeugt.

### Konsequenzen
- `tests/colonyAdministration.test.ts` prüft in 7 Fällen Steuerprojektion, Klemmung ungültiger Sätze, Wirkung hoher Steuern, Wachstumsprognose, fehlenden Nahrungsüberschuss und die Bauplatz-Zählung inklusive Fallback ohne Oberfläche.
- `tests/colonyAdministrationUi.test.tsx` prüft in 7 Fällen die Tab-Leiste, Regler und Voreinstellungen, den aktuellen Steuersatz, Wachstum und Arbeitskräfte, die Direkteinstiege der Übersicht, die Slot-Zusammenfassung und den geschlossenen Zustand.
- Die Suite umfasst **396 Tests in 35 Dateien**; `npm run lint` und `npm run build` sind sauber (nur die bestehende Chunk-Größenwarnung).
- **Bekannte Einschränkung:** Die Steuerprojektion betrachtet nur diese Kolonie; reichsweite Effekte anderer Kolonien und Modifikatoren zeigt weiterhin nur die Staatskasse nach dem Rundenwechsel.
- **Bekannte Einschränkung:** Freie Arbeitskräfte sind eine Anzeige, keine eigene Zuteilung; die Verteilung bleibt automatisiert über den Arbeitsfokus.
- **Bekannte Einschränkung:** Die Bauplatz-Zählung kennt keine Biom- oder Technologie-Regeln; sie erscheinen erst beim konkreten Gebäude als Sperre.

## ADR-051: Grafische Kolonieansicht als deterministisches SVG mit Platzhalter-Silhouetten

### Kontext
Der Tab „Bauplätze" zeigte errichtete Gebäude nur als Liste mit Stufe, Hexfeld und Erträgen. Die Referenz „Master of Orion 2" stellt eine Kolonie dagegen als Stadt auf der Planetenoberfläche dar: Gebäude sind über die Fläche verteilt, ihre Anzahl und Art sind auf einen Blick erkennbar. Für Astraea fehlen echte Gebäude-Tiles noch; die Oberfläche nutzt bislang prozedurale Platzhalter. Gleichzeitig sollte die bestehende Verwaltung (ADR-050) unverändert bleiben: reine Projektionen, keine neuen Save-Felder, keine Schreibzugriffe aus der Ansicht.

### Entscheidung
- **Ort der Ansicht.** Die Stadtansicht liegt im Tab „Bauplätze" oberhalb der Gebäudeliste, inklusive Kopfzeile „Stadtansicht", Gelände-Label, Legende (Gebäude / Im Bau / Gedrosselt) und Zählzeile. Der Tab bleibt damit der Ort für alles, was auf der Oberfläche steht.
- **Deterministisches SVG statt Canvas oder Assets.** `src/ui/components/ColonySkyline.tsx` zeichnet die Szene als SVG (`viewBox 640 × 270`, `data-testid="colony-skyline"`, `data-palette`). Es werden keine Bilddateien geladen; alle Formen sind Vektoren. Sterne und Geländetupfer entstehen aus einem FNV-1a-Hash der Kolonie-ID, sodass dieselbe Kolonie bei jedem Öffnen identisch aussieht.
- **Reines Layout-Modul.** `src/ui/colonySkyline.ts` kapselt `getSkylineBuildings`, `getSkylinePalette`, `getSkylineKind`, `getSkylineCenterCell`, `skylineJitter`, `SKYLINE_VIEWBOX` und `SKYLINE_TERRAIN_LABELS`. Es liest nur `Colony`, `PlanetSurface` und optional `PlanetType`.
- **Platzhalter-Silhouette je Gebäudetyp.** `getSkylineKind` bildet jede Katalogdefinition auf eine eigene Form ab: `city_center`, `hydro_dome` (Halbkugel), `solar_field`, `geothermal`, `extractor`, `factory`, `refinery`, `lab`, `relay`, `barracks`, unbekannte Definitionen auf `generic`. Die Hydrokultur-Kuppel erscheint also als Halbkreis, sobald sie fertiggestellt ist. Ausbaustufen 2 und 3 ergänzen Anbauten und Stufenpunkte, ohne eigene Grafikdateien.
- **Raster und Tiefe.** Drei Tiefenreihen mit fünf Spalten (y = 168/206/246, Skalierung 0,82/0,96/1,1, Spalten x = 86…554). Zellen werden von der Mitte nach außen belegt; das Kolonie-Zentrum sitzt immer auf der mittleren Zelle. Die Position erhält einen kleinen, aus `Kolonie-ID:Gebäude-ID` gehashten Jitter (±9 px horizontal, ±3 px vertikal). Gezeichnet wird nach Tiefe, hinten zuerst.
- **Baustellen und Drosselung.** Gebäude der Warteschlange vom Typ `building` erscheinen als halbtransparente Silhouette mit gestricheltem Rahmen, Kran und Fortschrittsbalken (`data-construction="true"`); Einheiten- und Upgrade-Projekte erzeugen keine eigene Silhouette. Gedrosselte Gebäude werden abgedunkelt und mit einem Warnsymbol markiert.
- **Gelände aus Biom und Planetentyp.** `getSkylinePalette` wählt eine von sieben Paletten (temperate, forest, arid, ice, volcanic, toxic, ocean). Der Planetentyp hat Vorrang vor dem Biom, damit Hügel auf einer Eiswelt eisig bleiben; ohne beides gilt „temperate". `App.tsx` übergibt den Typ über das neue Memo `activeColonyPlanet` an das Modal, das Modal reicht ihn an die Skyline weiter.

### Begründung
- SVG bleibt scharf bei jeder Fensterbreite, ist ohne zusätzliche Ladezeit prüfbar und lässt sich in Vitest als Markup testen – anders als ein Canvas.
- Die Trennung in `colonySkyline.ts` (Logik) und `ColonySkyline.tsx` (Darstellung) entspricht dem Muster von `colonyAdministration.ts` und hält die Positionsregeln testbar.
- Ein Hash-Jitter verhindert ein maschinell exakt wirkendes Raster, bleibt aber reproduzierbar; Zufall zur Laufzeit hätte bei jedem Öffnen ein anderes Stadtbild erzeugt.
- Eigene Silhouetten je Gebäudetyp erfüllen die Anforderung „Hydrokuppel → Halbkreis" und machen später den Austausch gegen echte Tiles zu einer reinen Renderer-Frage.

### Alternativen
- Canvas-Zeichnung wie `PlanetSurfaceCanvas`: verworfen, weil die Ansicht statisch ist und Markup-Tests sowie Skalierung verloren gingen.
- Echte Tiles vorziehen: verworfen, solange keine Assets existieren; die Ansicht soll heute schon nutzbar sein.
- Gespeicherte Gebäudekoordinaten im Spielstand: verworfen, das hätte ein Save-Format-Update und eine zweite Wahrheit neben `hexCoord` erfordert.
- Zufällige Platzierung pro Render: verworfen, die Stadt würde bei jedem Öffnen springen.

### Konsequenzen
- `tests/colonySkyline.test.ts` prüft in 10 Fällen Zentrumsplatzierung, eindeutige Plätze, Determinismus, Tiefensortierung, Baustellen aus der Warteschlange inklusive Fortschritt, Überlauf über 15 Zellen, Biom- und Planetentyp-Paletten, Fallback ohne Oberfläche und die Silhouettenzuordnung aller Katalogeinträge.
- `tests/colonyAdministrationUi.test.tsx` prüft in 8 Fällen zusätzlich Skyline-Markup, Hydrokuppel-Silhouette, Baustelle und Zählzeile.
- Die Suite umfasst **407 Tests in 36 Dateien**; `npm run lint` und `npm run build` sind sauber (nur die bestehende Chunk-Größenwarnung).
- **Bekannte Einschränkung:** Es gibt 15 Zellen; mehr Gebäude und Bauprojekte werden nicht gezeichnet (die Liste darunter bleibt vollständig).
- **Bekannte Einschränkung:** Die Formen sind Platzhalter und keine echten Tiles; die Ansicht zeigt keine Hexfelder, Distrikte oder Einheiten.
- **Bekannte Einschränkung:** Die Optik ist an Master of Orion 2 angelehnt, übernimmt aber keine Originalgrafiken.

## ADR-052: Acht Fraktionen, Startplatzierung, Schiffsanzeige, Flottensteuerung und Nachrichtenverlauf

### Kontext
Die Galaxie kannte bisher nur eine feste Spielerzivilisation und zwei namentlich fest verdrahtete KI-Reiche. Startpositionen wurden über feste Indexabstände vergeben, das Spielerstartsystem konnte leer bleiben oder nur Gasriesen enthalten, und fremde Flotten waren nur auf der Galaxiekarte sichtbar. Benachrichtigungen verschwanden je nach Kategorie unterschiedlich oder blieben dauerhaft stehen; ein Zoom-Reset trat nach fast jeder Aktion auf. Außerdem gab es keinen dauerhaft abrufbaren Nachrichtenverlauf. Alle Erweiterungen mussten die bestehende Galaxiegenerierung, Startflotte, Kolonisierung, Systemansichten, Routen und das versionierte Speicherformat weiterverwenden.

### Entscheidung
- **Fraktionsdaten (`src/data/factionCatalog.ts`).** Acht Fraktionen mit stabilen `HumanFactionId`s, Name, Kurzprofil, Hintergrund, visueller Identität, Farbe/Randfarbe, Emblem, Heimatregion und Flottenstil. Die Spielmechanik bleibt identisch; es werden keine Fraktionsboni erfunden. `pickAiFactionIds()` mischt die übrigen sieben deterministisch und liefert exakt 0–7 eindeutige IDs; `buildFactionAssignments()` erzeugt `player-empire` plus `civ-<factionId>`. `Civilization` erhält optionale `factionId`/`fleetStyleId`.
- **Auswahl und Spielstart.** `GalaxyConfig` erhält optionale `playerFactionId` und `aiFactionCount`; der `GalaxyCreationScreen` zeigt acht Karten und einen KI-Regler mit deterministischer Vorschau. `CivManager.configureHumanFactions()` baut die Zivilisationen nur bei einer neuen Galaxie auf; beim Laden kommen sie unverändert aus dem Spielstand. `galaxy.factionAssignments` wird mitgespeichert.
- **Startplatzierung (`src/generation/startPlacement.ts`).** Der Spieler behält System 0. Die Habitabilitätsprüfung nutzt dieselbe `HabitabilityEvaluator`-Logik wie die Kolonisation. Fehlt ein geeigneter Planet, werden nur die Planeten dieses Systems mit abgeleitetem Seed neu erzeugt; bei leerem System entstehen mindestens vier Bahnen, die Gürtel des Systems entfallen. Letzte Rückfallebene ist ein deterministisch habitabel gesetzter Planet, notfalls durch Umwandlung eines Gasriesen. Es wird keine Kolonie gegründet. KI-Starts werden gierig nach maximaler minimaler Hyperlane-Distanz gewählt; gewünscht ist `max(2, min(6, floor(systemCount/10)))`, bei kleinen Galaxien wird mit Warnung über `getStartPlacementWarnings()` gelockert.
- **Antriebsreichweite (`src/core/propulsion.ts`).** Die Hyperlane-Sprünge pro Runde hängen an vorhandenen Tech-IDs (`fusion_reactors` 2, `gravitic_engineering` 3, `zero_point_physics` 4), Basis bleibt 1. `FleetManager.advanceTurn(..., rangeHopsForCiv)` konsumiert die Stufe; ohne Technologie bleibt die bestehende Ein-Sprung-Regel unverändert.
- **Schiffsanzeige.** Beide Systemansichten und die Galaxiekarte lesen dieselben `Fleet`-Objekte. `systemFleetLayout.ts` platziert klickbare Marker außerhalb der äußeren Planetenbahn bzw. in der oberen Leiste der Detailansicht; `shipAssets.ts` ordnet die vorhandenen JPEGs unter `Tilesets/Raumschiffe` den Klassen zu. Korvette, Zerstörer und Kreuzer nutzen die Fregattengrafik als dokumentierten Fallback. `ShipInfoBar.tsx` zeigt Grafik, Name, Typ, Fraktion, System, Standort, Bewegung, Ziel, Reichweite und vorhandene Ladung; fehlende Werte werden als „unbekannt" bzw. „—" ausgewiesen, nicht erfunden. Fremde Flotten erscheinen nur in Systemen mit `discoveryStatus !== 'unexplored'`.
- **Flottensteuerung.** Erster Klick auf ein System prüft die Route und zeigt eine gestrichelte Vorschau mit Zielring; ein zweiter Klick auf dasselbe System oder „Auftrag erteilen" führt `commandFleetMove` bzw. `retargetFleet` aus. Ungültige Ziele werden mit Begründung abgewiesen. `cancelFleetMovement` bricht den Auftrag ab; `fleet:movement-cancelled` ist ein neues Event. Zoom und Kartenposition bleiben bei allen drei Aktionen unverändert.
- **Benachrichtigungen.** `NOTIFICATION_TTL_MS = 10_000` gilt einheitlich für alle Kategorien; `STICKY_CATEGORIES` ist leer. Der Timer hängt nur an der stabilen Meldungs-ID (`dismissRef`, Effekt nur auf `item.id`), damit wechselnde Callback-Identitäten ihn nicht neu starten. Jede Meldung ist unabhängig manuell schließbar.
- **Nachrichtenverlauf (`src/core/messageLog.ts`).** Persistenter `MessageLog` mit stabilen Schlüsseln, Betreff, Text, Kategorie, Runde, Zeit, Zielobjekt und Gelesen-Status; Limit 250. Dieselbe Brücke speist Popup und Verlauf über eine zentrale `record`-Senke, sodass ein Ereignis höchstens einmal im Verlauf landet. `MessageLogModal.tsx` bietet Kategorie-Filter, „nur ungelesen", Ziel-Navigation und „Alle gelesen". Die Instanz bleibt über Galaxiewechsel stabil (`clear()` statt Neuinstanz).
- **Zoom-Fix (`src/ui/galaxyCamera.ts`).** Ursache war die Objektidentität: `resetCamera` hing an `galaxy`, während `App.tsx` bei vielen Aktionen `setGalaxy({ ...engine.getGalaxy() })` erzeugt. Der Reset hängt jetzt an `galaxyCameraKey(galaxy)`; `computeGalaxyCamera` und `focusCameraOn` sind reine, testbare Helfer.
- **Speicherformat.** `CURRENT_SAVE_VERSION = 5` ergänzt `messageLog`, `stations` und `galaxy.factionAssignments`. Die v4→v5-Migration füllt fehlende Felder deterministisch, ohne Galaxie oder Zivilisationen neu zu erzeugen.
- **Raumstationen.** `SpaceStation`/`SpaceStationType` und `stationCatalog.ts` liefern nur eine erweiterbare Struktur; es gibt keine Stationsmechanik.

### Begründung
- Stabile IDs entkoppeln Spielstand und Anzeigenamen; Fraktionsboni bleiben eine spätere Balancing-Frage statt erfundener Startwerte.
- Die Wiederverwendung der echten `HabitabilityEvaluator`-Logik verhindert, dass die Garantie einen Planeten markiert, den die Kolonisation anschließend ablehnt.
- Ein dedizierter Startplatzierungsbaustein hält Galaxiegenerierung und Spielstand frei von Sonderfällen und macht Distanzwahl und Warnungen testbar.
- Dieselben `Fleet`-Daten in Karte und Systemansicht verhindern widersprüchliche Positionen und machen die Auswahl über Ansichtswechsel hinweg stabil.
- Ein zentraler `record`-Pfad ist die einzige verlässliche Stelle gegen doppelte Verlaufsmeldungen; getrennte Push-Aufrufe hätten bei Dedupe im Center sofort divergenten Verlauf erzeugt.
- Der Kameraschlüssel behebt die Ursache statt eines Symptom-Workarounds: Nicht jeder Datenrefresh ist eine neue Karte.

### Alternativen
- Acht Fraktionen mit eigenen Boni und Startbedingungen: verworfen, hätte ohne Balancing-Grundlage erfundene Werte erzeugt.
- KI-Fraktionen bei jedem Laden neu würfeln: verworfen, der Spielstand wäre nicht reproduzierbar.
- Starre Hyperlane-Mindestdistanz ohne Lockerung: verworfen, kleine Galaxien hätten weniger Startplätze als Fraktionen.
- Startplanet nur per Zufallsseed suchen und bei Misserfolg warnen: verworfen, die Anforderung verlangt einen garantiert habitablen Startplaneten.
- Eigene Schiffsobjekte pro Ansicht: verworfen, zwei Wahrheiten für Position und Ziel.
- Zoom-Reset über einen Timeout oder Flag unterdrücken: verworfen, hätte den Reset nur verschleiert.
- Nachrichtenverlauf als Teil des `NotificationCenter`: verworfen, Popup-Limit (8) und flüchtige Timer hätten den Verlauf abgeschnitten.
- Save-Version beibehalten und Felder rein optional lassen: verworfen, Fraktionszuweisung und Verlauf brauchen eine explizite Migrationsgrenze.

### Konsequenzen
- Neue Tests: `tests/factions.test.ts` (6), `tests/startPlacement.test.ts` (8), `tests/systemFleets.test.ts` (6), `tests/fleetCommands.test.ts` (5), `tests/messageLog.test.ts` (7), `tests/gameUi.test.tsx` (5).
- Die Suite umfasst **444 Tests in 42 Dateien**; `npm run lint` und `npm run build` sind sauber (nur die bestehende Chunk-Größenwarnung).
- **Bekannte Einschränkung:** Es gibt nur drei Schiffsbilder; Korvette, Zerstörer und Kreuzer teilen die Fregatte, und alle Fraktionen nutzen dieselben Dateien.
- **Bekannte Einschränkung:** Fraktionen haben keine eigenen Boni, Starttechnologien oder diplomatischen Beziehungen; nur Name, Farbe, Emblem, Hintergrund und Flottenstil unterscheiden sich.
- **Bekannte Einschränkung:** Antriebsreichweite erhöht nur die Sprünge pro Runde; sie ist keine taktische Treibstoff- oder Versorgungsregel.
- **Bekannte Einschränkung:** Raumstationen sind reine Datenstrukturen ohne Bau, Unterhalt oder Effekt.
- **Bekannte Einschränkung:** Der Verlauf ist auf 250 Einträge begrenzt und wird nicht nach Kategorien archiviert.

## ADR-053: Ankunftsprognose (ETA) und Zwischenziele für Flotten nach MoO2-Vorbild

### Kontext
Die Flottenbewegung kannte nur „ein Sprung pro Runde“ und ein Endziel. Wer wissen wollte, wann ein Verband ankommt, musste die Routenlänge selbst zählen; Zwischensterne ließen sich nicht als Teil eines Auftrags angeben. Master of Orion 2 zeigt beides sichtbar („n turns to star“, durchflogene Zwischensterne) und löst Bewegungen in einer festen Zugreihenfolge auf. Eine Übernahme durfte die bestehende Hyperlane-Mechanik, die Reichweitenableitung aus Techs und das Speicherformat nicht ersetzen.

### Entscheidung
- **Rundenzählung (`src/core/propulsion.ts`).** `turnsForHops(hops, rangeHops)` teilt die Sprünge aufgerundet durch die Reichweite; `normalizeRangeHops()` fängt fehlende, negative oder nicht-endliche Werte ab und fällt auf die Basisreichweite zurück. Die Rechnung entspricht der ETA-Logik aus MoO2, nicht dessen Treibstoffregeln.
- **Routenplanung (`src/core/fleetManager.ts`).** `planRoute()` verkettet Hyperlane-Pfade über optionale Zwischenziele, entfernt Doppelungen und nennt bei einem Bruch den betroffenen Abschnitt. `commandMoveFleet`, `retargetFleet`, `previewRoute` und `canReachSystem` nehmen `waypointSystemIds` optional entgegen; alle bisherigen Aufrufe bleiben unverändert gültig.
- **ETA-API.** `getRemainingHops()`, `getFleetEta()` und `getEtaToSystem()` liefern verbleibende Runden, verbleibende Sprünge, Sprünge pro Runde, nächstes System und Endziel. `GameEngine` reicht sie mit der Reichweite des jeweiligen Reiches durch.
- **Zugauflösung.** `advanceTurn` bewegt fliegende Verbände sortiert nach ID und meldet `movedFleetIds`/`hopsTraveled`. Die Sortierung macht die Auflösung unabhängig von der Einfügereihenfolge und damit save-/load-stabil.
- **Oberfläche.** `ShipInfoBar` zeigt „Ankunft: in N Runden (M Sprünge)“ bzw. „im Ziel“; die Zielvorschau ergänzt „ETA N Runden“.
- **Persistenz unverändert.** Zwischenziele liegen ausschließlich im bereits gespeicherten `pathSystemIds`. Es gibt kein neues `Fleet`-Feld und keine Save-Migration.

### Begründung
- Aufrunden ist die einzige Regel, die ohne neue Balancing-Werte auskommt und zur bestehenden „ein Sprung pro Runde“-Mechanik passt.
- Zwischenziele als verkettete Hyperlane-Pfade wiederzuverwenden hält die Route deterministisch und den Spielstand kompatibel.
- Eine stabile ID-Sortierung verhindert, dass sich das Zugergebnis allein durch Ladereihenfolge ändert.
- Die ETA ist reine Anzeige; sie greift nicht in Bewegung, Kampf oder Wirtschaft ein.

### Alternativen
- Treibstoff- und Reichweitenverlust sowie erzwungener Rückzug wie in MoO2: verworfen, würde die bestehende Reichweitenmechanik ersetzen.
- Flugabbruch-Verbot im Hyperraum: verworfen, `retargetFleet` ist bereits Teil der Flottensteuerung (ADR-052).
- Geschwindigkeit nach dem langsamsten Schiff: verworfen, Astraea kennt keine Schiffgeschwindigkeiten und würde Werte erfinden.
- Neues `Fleet`-Feld für Zwischenziele: verworfen, `pathSystemIds` enthält die Information bereits.
- ETA in der Engine vorausberechnen und speichern: verworfen, redundante Daten könnten vom tatsächlichen Pfad abweichen.

### Konsequenzen
- Neue bzw. erweiterte Tests: `tests/fleetCommands.test.ts` (13 Fälle inkl. ETA, Aufrundung, Zwischenziel-Durchflug, abgelehnter Zwischenziele, stabiler Bewegungsreihenfolge) und `tests/gameUi.test.tsx` (ShipInfoBar mit ETA).
- Die Suite umfasst **456 Tests in 42 Dateien**; `npm run lint` und `npm run build` sind sauber (nur die bestehende Chunk-Größenwarnung).
- Die MoO2-Belege (Symbole, LE-Struktur, Handbuchzitate, offene Fixup-Grenze) stehen in `docs/MOO2_TURNLOGIK_BEFUNDE.md`.
- **Bekannte Einschränkung:** Die ETA zählt nur Hyperlane-Sprünge; sie modelliert keine Treibstoffreserven, keine Out-of-Range-Verluste und keine Kommunikation im Hyperraum.
- **Bekannte Einschränkung:** Zwischenziele werden nicht in der Oberfläche gesetzt, sondern nur von der API durchgereicht; die Kartenauswahl nutzt weiterhin ein Endziel.

## ADR-054: Routenplanungsmodus auf der Galaxiekarte und sofortige Bewegung pro Runde

### Kontext
Die Flottensteuerung verlangte zwei Klicks auf dasselbe Zielsystem, und die Kartenlogik hob beim Klick auf ein System die Verbandsauswahl auf. Dadurch verschwand die Schiffsleiste vor dem zweiten Klick, und ein Auftrag ließ sich über die Karte praktisch nicht abschließen. Zusätzlich wurde jede Mausbewegung als Klick gewertet, weil die Drag-Erkennung die bereits aktualisierte Kameraposition erneut abzog. Eine Route war nur als gelbe Vorschau sichtbar, und der Auftrag bewegte den Verband erst beim Rundenwechsel.

### Entscheidung
- **Kartenklicks (`src/ui/components/GalaxyMapCanvas.tsx`).** Ein Klick auf ein System lässt die Verbandsauswahl bestehen; nur ein Klick ins Leere hebt sie auf. Die Drag-Erkennung nutzt einen eigenen Startpunkt in Client-Koordinaten und eine 5-px-Schwelle. Ein Ziehen löst keinen Klick aus.
- **Routenplanungsmodus (`src/App.tsx`).** `isRoutePlanning` gilt nur für einen ausgewählten eigenen Verband auf der Galaxiekarte. Ein Klick auf ein gültiges Ziel prüft die Route, erteilt den Auftrag und beendet den Modus. Abbruch, Schiffswechsel, Ansichtswechsel und Verlassen der Partie beenden den Modus ohne Bewegung.
- **Reine Helfer (`src/ui/routePlanning.ts`).** `canStartRoutePlanning`, `decideGalaxySystemClick`, `routePolylineScreenPoints` und `routePlanningStatusText` kapseln die Entscheidungen ohne React- oder Engine-Abhängigkeit und sind direkt testbar.
- **Rote Route.** Während der Planung wird die Systemkette unter dem Mauszeiger rot gestrichelt gezeichnet; nach dem Auftrag bleibt die tatsächliche Route des ausgewählten Verbands rot. Die Projektion rechnet ausschließlich aus Weltkoordinaten und der aktuellen Kamera.
- **Sofortige Bewegung (`FleetManager.moveFleetNow`).** Ein Auftrag bewegt den Verband sofort um höchstens seine Reichweite. `movedThisTurn` verhindert eine zweite Bewegung im selben Rundenwechsel; danach ist der Merker wieder frei. Ohne Sofortbewegung bleibt `advanceTurn` unverändert.
- **Keine neue Parallelsteuerung.** Inspector-Klicks wählen nur Systeme aus und lösen keine Bewegung aus. Das alte Zwei-Klick-Verfahren bleibt als Fallback erhalten.
- **Unverändert:** Reichweite aus `propulsion.ts`, Hyperlane-Routen, `pathSystemIds` als einzige Routenwahrheit, Save-Format ohne neues Pflichtfeld.

### Begründung
- Die Auswahl darf beim Zielklick nicht verschwinden, sonst kann kein Auftrag entstehen.
- Ein expliziter Modus trennt Zielauswahl von anderen UI-Klicks und macht den Abbruch eindeutig.
- Eine Bewegung pro Runde bleibt erhalten, weil der Rundenwechsel bereits gezogene Verbände überspringt.
- Die rote Route nutzt dieselbe `planRoute`-Logik wie der Auftrag und kann daher nicht von der realen Bewegung abweichen.

### Alternativen
- Zweiter Klick als einzigen Auslöser behalten: verworfen, der Modus wäre nicht eindeutig und der ursprüngliche Auswahlfehler bliebe.
- Bewegung rein grafisch animieren: verworfen, der Spielzustand wäre unecht.
- Bewegung ausschließlich im Rundenwechsel lassen: verworfen, die Anforderung verlangt eine tatsächlich ausgeführte Bewegung nach der Zielwahl.
- Neues `Fleet`-Feld für „bereits gezogen": verworfen, der Merker ist flüchtig und das Save-Format bleibt unverändert.
- Zielauswahl über den Inspector: verworfen, dort sind Systemklicks reine Navigation.

### Konsequenzen
- Neue Tests: `tests/routePlanning.test.ts` (15 Fälle zu Modus, Projektion, Vorschau-Parität, Reichweite, Doppelzug, ungültigem Ziel und ETA); `tests/gameUi.test.tsx` um drei ShipInfoBar-Fälle erweitert.
- Die Suite umfasst **474 Tests in 43 Dateien**; `npm run lint` und `npm run build` sind sauber (nur die bestehende Chunk-Größenwarnung).
- **Bekannte Einschränkung:** Der Sofortzug-Merker ist flüchtig. Wird mitten in der Runde gespeichert und geladen, kann ein Verband beim nächsten Rundenwechsel ein zweites Mal ziehen.
- **Bekannte Einschränkung:** Zwischenziele werden weiterhin nur über die API gesetzt; die Kartenplanung nutzt ein Endziel und die automatisch kürzeste Hyperlane-Route.
- **Bekannte Einschränkung:** Die Reichweite stammt aus der Reichsantriebsstufe, nicht aus einem separaten Triebswerk je Schiff; ein solches Feld gibt es im Datenmodell nicht.

## ADR-055: Kolonie-Kommando, Kolonie-Tiles, Kachel-Infos und Einheiten-Abwahl

### Kontext
Das Kolonie-Kommando war einreihig aufgebaut, die Ressourcenleiste lief über die volle Breite und die Navigation saß als Tab-Leiste oben; bei vielen Tabs wurden Einträge abgeschnitten. Die Planetenoberfläche zeichnete Stadtzentren nur als kleines Vektorsymbol, obwohl unter `Tilesets/Kolonie` drei isometrische Gesamtkomplexe für die drei Entwicklungsstufen lagen. Für Kacheln gab es keine zusammenhängende Informationsansicht: Vorkommen, Bebauungsstatus und Erträge waren über mehrere Bereiche verteilt oder fehlten ganz. Eine ausgewählte Einheit ließ sich nur umständlich wieder abwählen, weil der Klick auf ihre Kachel als Bewegungsbefehl galt und Escape die Oberfläche sofort verließ. Die Stufenaufwertung des Koloniezentrums war nur im `PlanetInspector` erreichbar; im Kommando fehlten Stufe, Voraussetzungen und konkrete Ablehnungsgründe. Schließlich zeigte die Schiffsleiste die neuen Bilder beschnitten (`object-cover`).

### Entscheidung
- **Kolonielayout (`ColonyManagementModal`).** Dreispaltiges Raster: Ressourcenübersicht und Staatskasse links (`aside`), aktiver Tab-Inhalt mittig, vertikale Navigationsleiste rechts (`nav[aria-label="Kolonieverwaltung"]`). Auf schmalen Viewports lautet die Reihenfolge Navigation → Ressourcen → Inhalt; der Inhalt bleibt scrollbar, die Navigation wird nicht abgeschnitten. Breite maximal `max-w-7xl`.
- **Stufenaufwertung.** Das Panel „Koloniezentrum" zeigt Entwicklungsstufe, Stadtzentrumsstufe, die vier Anforderungen (Bevölkerung, Mineralien, Seltene Ressourcen, Einfluss) farbcodiert, den konkreten Kostenabzug und den Status der nächsten Stufe. Der Knopf ruft den neuen Callback `onUpgradeTier` auf, der in `App.tsx` an `engine.upgradeColonyTier()` gebunden ist. Bei Ablehnung erscheint der Grund der Engine; bei Erfolg „Aufwertung erfolgreich: …". Es gibt keine zweite Aufwertungslogik.
- **Kolonie-Tiles (`src/ui/colonyTileAssets.ts`).** Die drei 1600 × 1600-PNGs sind keine Sprite-Sheets, sondern je ein transparenter isometrischer Gesamtkomplex. Zuordnung: `outpost` → `Start_Kolonie.png`, `settlement` → `Stufe_2_Kolonie.png`, `colony` → `Stufe_3_Kolonie.png`. Pro Stadtzentrum wird genau ein Bild gezeichnet, und zwar nach dem Kachel-Durchlauf, damit Nachbarkacheln den Komplex nicht überdecken. Fehlt die Datei, zeichnet der Canvas weiterhin den Vektor-Fallback. Einzelgebäude behalten ihre bisherigen Symbole.
- **Kachelinformation (`HexTileInspector`).** Der bestehende Inspector wird erweitert statt ersetzt: Geländetyp/Klima, Grunderträge, echte Zusatzerträge aus `DEPOSIT_CATALOG[...].yieldBonus`, Gefahr- und Terraforming-Status, Abschnitt „Bebauungsstatus" (Koloniezentrum mit Entwicklungs- und Gebäudestufe, Gebäude, Distrikt oder unbebaut) und stationierte Einheiten. Ohne aufgedecktes Vorkommen steht ausdrücklich „Keine besonderen Ressourcenvorkommen." Das Panel ist schließbar und wird bei jeder anderen Kachel neu befüllt.
- **Einheiten-Abwahl (`src/ui/surfaceSelection.ts`).** `resolveSurfaceClick()` entscheidet React-frei: Token-Treffer haben Vorrang, erneuter Klick auf denselben Token oder dieselbe Kachel hebt die Auswahl auf, eine andere Einheit übernimmt sie, Stadtzentren öffnen die Kolonie, freie Kacheln bleiben Bewegungsziel. Zusätzlich bietet der Inspector „Auswahl aufheben". Escape räumt auf der Oberfläche zuerst die Einheit, dann die Kachel und verlässt erst danach die Oberfläche; der globale App-Shortcut wurde entsprechend umgestellt.
- **Schiffsbilder (`src/ui/shipAssets.ts`, `ShipInfoBar`).** Zuordnung: `colony` → `Kolonie.jpg`, `scout` → `Forschung.jpeg`, `frigate` → `Fregatte.png`, `cruiser` → `schlachtschiff.png`; Korvette und Zerstörer nutzen die Fregatte als markierten Fallback. `Transporter.png` bleibt ohne passende Schiffsklasse und wird über `getUnmappedShipArtFileNames()` ausgewiesen. Die Vorschau nutzt `object-contain` in einer 40 × 20-Einheiten-Box, damit nichts abgeschnitten oder verzerrt wird.
- **Unverändert:** Wirtschafts-, Bau- und Forschungslogik, Save-Format (Version 5) und die bestehenden Kataloge. Es wurden keine Ressourcen, Kosten oder Triebswerkwerte erfunden.

### Begründung
- Das dreispaltige Layout trennt Orientierung (Ressourcen), Arbeit (Inhalt) und Navigation und verhindert abgeschnittene Tabs auch bei kleinen Fenstern.
- Die Aufwertung gehört in die Kommandozentrale, weil dort Stufe, Lager und Kosten sichtbar sind; die Engine bleibt alleinige Autorität über Kosten und Zustandswechsel.
- Die PNGs sind Gesamtkomplexe; eine Kachelraster-Zuordnung hätte die Grafik zerschnitten. Ein separater Renderdurchgang erhält die isometrische Wirkung.
- Eine reine Klickauflösungsfunktion macht die zuvor im Canvas verstreute, fehleranfällige Logik testbar und behebt die Ursache der fehlenden Abwahl statt nur die Oberfläche zu kaschieren.
- Der Inspector war bereits die zentrale Kachelansicht; eine Erweiterung vermeidet ein paralleles Informationsfenster.

### Alternativen
- Ressourcenleiste oben behalten und nur umbrechen: verworfen, die Navigationsleiste bliebe abgeschnitten und der Inhalt hätte weniger Höhe.
- Eigenes Aufwertungsfenster: verworfen, doppelte UI und doppelte Validierung.
- Kolonie-PNGs als Kachel-Sprite über jedes Feld legen: verworfen, die Assets enthalten keinen Kachelraster und würden verzerrt.
- Neues Kachel-Informationsmodal: verworfen, der Inspector enthält bereits Besitz-, Bau- und Einheitenaktionen.
- Abwahl nur über einen zusätzlichen Button: verworfen, die Ursache lag im Klickzustand; der Button bleibt als Ergänzung.
- Fehlende Schiffsbilder durch neue assets ersetzen: verworfen, es liegen keine Korvetten-/Zerstörergrafiken vor; der Fallback wird transparent markiert.

### Konsequenzen
- Neue Tests: `tests/guiOverhaul.test.tsx` (16 Fälle zu Asset-Zuordnung, Klickauflösung, Layout/Stufenpanel, Kachel-Info inklusive Gefahr und Zusatzerträgen, Schiffsleiste sowie Engine-Aufwertung mit Save/Load und Ablehnungsgrund).
- Die Suite umfasst **490 Tests in 44 Dateien**; `npm run lint` und `npm run build` sind sauber (nur die bestehende Chunk-Größenwarnung).
- Headless-Chrome-Abnahme: Save geladen, Kolonie-Tile sichtbar, Einheit per Button und Escape abwählbar, Spaltenpositionen geprüft, Aufwertung Außenposten → Siedlung mit Abzug 200 → 140 Mineralien und 60 → 50 Einfluss, nächste Stufe korrekt gesperrt, Kachelklicks aktualisieren das Info-Panel, keine Konsolenfehler.
- **Bekannte Einschränkung:** Es gibt keine Einzelgebäude-Tiles; nur der Stadtzentrum-Komplex ist grafisch ersetzt.
- **Bekannte Einschränkung:** Für Korvette und Zerstörer fehlen eigene Grafiken; beide nutzen die Fregatte. `Transporter.png` gehört zu keiner definierten Klasse.
- **Bekannte Einschränkung:** `Forschung.jpeg` und `Kolonie.jpg` sind JPEGs ohne Transparenz und wirken daher als Porträtkacheln, nicht als freigestellte Silhouetten.
- **Bekannte Einschränkung:** Der Koloniekomplex ist bewusst größer als eine Kachel und kann bei dicht benachbarten Stadtzentren visuell überlappen; die Klicklogik bleibt kachelbasiert.

## ADR-056: Lava-Tiles, Koloniezentrum-Aufwertung und isoliertes Testlabor

### Kontext
Drei Probleme trafen zusammen. Erstens lagen unter `Tilesets/Planetenbiome/Lava` echte, hochauflösende Lavakacheln, die der Renderer nicht einband: `lava` und `volcanic` wurden weiterhin als prozedurale Platzhalter gezeichnet, obwohl die Generierung diese Biome auf Vulkanwelten tatsächlich erzeugt. Zweitens blieb die Aufwertung des Koloniezentrums dauerhaft bei „0 Runden" stehen. Ursache war kein Zeit- oder GUI-Fehler, sondern `BUILDING_CATALOG.city_center.baseProductionCost = 0`: Daraus folgte `requiredProduction = 0`, der Auftrag wurde in die Warteschlange gelegt, aber `advanceQueue` addierte zuerst Produktion und verglich danach – der Eintrag blieb scheinbar ewig offen. Drittens fehlte ein Weg, Generator- und Mechanikverhalten ohne laufende Kampagne reproduzierbar zu prüfen.

### Entscheidung
- **Lava-Tiles über das bestehende Asset-System.** `src/ui/surfaceTileAssets.ts` bindet zusätzlich `Lava/lava_tile_*.png` und `Lava/mountain_hex_*.png` per `import.meta.glob` ein und normalisiert nur die Skalierungssuffixe (`_HEX_X4`, `_X3`). `src/ui/surfaceTileMapping.ts` ordnet zu: `lava` → `LAVA_TILE_2/0` (unpassierbar), `volcanic` → `LAVA_TILE_1/3/BASALT`, höheres `volcanic` → `LAVA_TILE_0`, Vulkanberge → `MOUNTAIN_HEX_0..3`, Vulkanhügel → Lavakruste plus `MOUNTAIN_HEX_3/1`, geschützte Landezone auf Vulkanwelten → Basalt. Die Kacheln besitzen einen transparenten Rand; ein `bleed`-Faktor von 1,18 vergrößert die Zeichenfläche, sodass die sichtbare Hex-Fläche exakt im Raster sitzt. Fehlt ein Bild, füllt weiterhin die `fallbackColor`; Gas-, Gift- und Fremdbiome behalten ihre Platzhalter.
- **Eine Bauzeitformel, ein Abschlussweg.** `BuildQueueManager.getUpgradeProductionCost()` ist die einzige Quelle für Ausbau-Bauzeit (`round(baseProductionCost * 0.8 * Zielstufe)`); GUI und Engine verwenden sie. Ausbauten mit Bauzeit 0 werden nicht eingereiht, sondern sofort abgeschlossen und über dieselbe Abschlussmeldung gemeldet (`completedImmediately`). Altbestände mit `requiredProduction = 0` werden beim nächsten Rundenwechsel kontrolliert abgeschlossen. `resolveRequiredProduction()` rekonstruiert fehlende oder ungültige Werte aus dem Katalog, `normalizeBuildQueue()` repariert beim Laden Fortschritt, Bauzeit und Duplikate. Ausbauten tragen `buildingInstanceId`, `buildingDefId` und `targetLevel`; die Zielstufe wird absolut gesetzt, sodass ein erneut verarbeiteter Auftrag keine zweite Stufe freischaltet.
- **Isoliertes Testlabor (`src/testing`).** Das Hauptmenü erhält den Eintrag „Testing" (`appMode: 'testing'`). `TestLab.tsx` ist eine eigenständige Shell mit `testLabRegistry.tsx`; jeder Ballon ist eine Komponente mit `onBackToMenu`. Der erste Ballon („Prozedurale Planetenoberfläche") erzeugt einen synthetischen Testplaneten und ruft den echten `SurfaceGenerator.generateSurface` mit Planetentyp, Breite (6–32), Höhe (6–24) und Seed auf. Er zeigt Signatur, Reproduzierbarkeitsvergleich, Canvas mit Zoom/Pan, Kachel-Info ohne Kolonieaktionen, Ressourcen-Toggle sowie echte Biome-, Vorkommens-, Gefahren-, Unpassierbarkeits-, Fluss-/Seen- und Höhenstatistiken. Kacheln werden nur in der Testansicht `visible` geschaltet und Vorkommen aufgedeckt.
- **Unverändert:** Katalogwerte, Generierungsbalance, Save-Format, Rundenlogik und Kampagnenzustand. Das Testlabor schreibt keine Spielstände und ruft keine Engine-Rundenlogik auf.

### Begründung
- Die Lavagrafiken waren bereits vorhanden; eine Einbindung über die bestehende Namensnormalisierung vermeidet ein paralleles Tileset-System und lässt weitere Biome nach demselben Muster ergänzen.
- Die 0-Runden-Ursache lag in den Daten, nicht in der Anzeige. Ein Sonderfall „sofort fertig" ist ehrlicher als eine erfundene Bauzeit und verhindert den hängenden Warteschlangeneintrag an der Wurzel.
- Absolute Zielstufen und Duplikatprüfung verhindern doppelte Aufwertungen, ohne das Save-Format zu brechen; alte Aufträge bleiben ladbar.
- Ein eigenständiges Testlabor mit Registry erlaubt weitere Ballons ohne Eingriff in Kampagnen-UI und ohne Testdaten in Spielständen.

### Alternativen
- Lava weiter als Platzhalter zeichnen: verworfen, die Assets liegen vor und die Anforderung nennt sie ausdrücklich.
- `city_center.baseProductionCost` auf einen Wert > 0 setzen: verworfen, das hätte Kosten und Balance erfunden und die Datenquelle verfälscht.
- 0-Runden-Aufträge in der GUI nur als „fertig" anzeigen: verworfen, der Auftrag wäre weiterhin nie abgeschlossen worden.
- Testlabor als Modal im laufenden Spiel: verworfen, damit wären Kampagnenzustand und Testdaten vermischt.
- Tests nur über Vitest: verworfen, die Oberfläche und das Rendering mussten zusätzlich im Browser geprüft werden.

### Konsequenzen
- Neue Tests: `tests/cityCenterUpgrade.test.tsx` (10 Fälle: Stufe 1→2, 2→3, Maximalstufe, reguläre Bauzeit über mehrere Runden, einmaliger Abschluss, Legacy-0-Runden, Duplikat, Save/Load, fehlende Oberfläche, GUI-Restzeit, Katalogtreue), `tests/lavaTiles.test.ts` (3 Fälle) und `tests/testLab.test.tsx` (9 Fälle); `tests/surface_tiles.test.ts` deckt Lava-/Vulkanzuordnung ab.
- Suite: **513 Tests in 47 Dateien** grün; `npm run lint` und `npm run build` sauber (nur die bestehende Chunk-Größenwarnung).
- Headless-Chrome-Abnahme: Menü → Testing → Oberflächenballon → Generieren zeigt echte Lavakacheln (18 × 10, 180 Kacheln, Signatur `958beb5b`), zweiter Lauf meldet „identisch", ungültige Breite zeigt „Breite muss zwischen 6 und 32 liegen.", Zurücksetzen stellt Standardwerte her und entfernt das Ergebnis, Rückkehr zu Testauswahl und Hauptmenü funktioniert, keine Konsolenfehler.
- **Bekannte Einschränkung:** Vulkanwelten des Generators bestehen mit dem Standard-Seed zu rund 77 % aus unpassierbarem Lavasee (Vulkanismus-Schwelle). Das ist bestehendes Generierungsverhalten und wurde bewusst nicht verändert; der Testballon macht es nur sichtbar.
- **Bekannte Einschränkung:** Es gibt fünf Lava- und vier Bergkacheln; große Oberflächen wiederholen Varianten sichtbar. Weitere Biomballons (Tiles, Gelände, Kolonie, Bewegung, Save/Load) sind in der Registry als „geplant" geführt.

## ADR-057: Neue Biom-Tiles, variable Oberflächengrößen, Ozean-Landgrenze, Gasförderung und Xenowelten

### Kontext
- Unter `Tilesets/Planetenbiome` lagen neue Ordner für Gasriesen, Giftwelten, Xenoplaneten und Gestein. Gas-, Gift- und Xeno-Biome wurden weiterhin als prozedurale Platzhalter gezeichnet, die Gesteinskacheln waren gar nicht eingebunden.
- Ozeanwelten hatten zwar ein Profil mit 90 % Wasser, aber keine harte Landobergrenze. Die Reparatur der Landezone konnte zusätzliches Land erzeugen; auf kleinen Karten wäre die 15-%-Grenze damit verletzbar gewesen.
- Gasriesen waren vollständig von der Kolonisation ausgeschlossen. Gewünscht ist eine reine Gasförderung ohne normale Bodenstädte.
- Alle Oberflächen waren fest 18 × 10 Kacheln groß, unabhängig von Planetentyp und Seed.
- Xenowelten fehlten als Planetentyp, obwohl die Tileset-Ordner und Biomtypen dafür vorhanden waren.

### Entscheidung
- **Neue Tiles über das bestehende Asset-System.** `src/ui/surfaceTileAssets.ts` bindet `Gasriesen/*/*.png`, `Giftwelten/*.png`, `Xenoplaneten/*.png` und `Gestein/*.png` über denselben Vite-Glob ein wie Lava. Die Namensnormalisierung entfernt nur Skalierungssuffixe (`_X2`, `_X3`, `_X4`, `_HEX_X*`). `src/ui/surfaceTileMapping.ts` ordnet zu: Gasriesen → `GAS_YELLOW_1..5` bzw. `GAS_BLUE_1..5` (Palette nach Planetenfarbe, Gelb als Standard), Giftwelten → `GIFT_EBENE`/`GIFT_EBEN`/`GIFT_EBENE_KRISTRAL`/`GIFT_LOCH`/`GIFT_WALD`/`GIFT_VERSEUCHTES_GEWAESSER` (auch als Säuresee statt Platzhalter), Xenowelten → `XENO_PLAIN_GROUND`, `XENO_SLIME_PLAIN_FIELDS`, `XENO_WOOD`, `XENO_CRYSTAL_WOOD`, `XENO_MUSHROOM_WOOD`, `XENO_CRYSTALS`, `XENO_MOUNTAINS`, `XENO_WATER_WITH_LAND`, `XENO_GROUND_HOLE`/`XENO_HOLE_IN_THE_GROUND`, `XENO_PLAN_FIELD_AILIEN_EGGS`, Gesteinswelten → `ROCK_HEX_0..2` für Gebirge. Die Lava-Zuordnung bleibt unverändert. Fehlt eine Datei, greift die Biome-Farbe; Platzhalter bleiben nur für fremdartige Biome außerhalb von Xeno-/Giftwelten.
- **Quadratische Punkt-Hex-Kacheln.** Die neuen Familien sind 1600 × 1600 (bzw. 256–3200 px) große Punkt-Hex-Grafiken mit transparentem Rand. Sie werden über `box: 'square'` gezeichnet, damit das Seitenverhältnis erhalten bleibt. Der `bleed`-Faktor wird je Datei aus dem tatsächlich sichtbaren Alpha-Rand bestimmt (Tabelle `SQUARE_ASSET_BLEED`, 1 / sichtbare Höhe plus 0,02 Reserve, z. B. Giftgewässer 1,32, Xeno-Wald 1,17, Gasblau 1,12). Ein fester Familienwert hätte bei den Giftwelten 14 % Lücken zwischen den Kacheln hinterlassen.
- **Variable Oberflächengröße.** Neu ist `src/surface/surfaceSize.ts` mit harten Grenzen 6–36 × 6–24 und maximal 864 Kacheln sowie typabhängigen Bereichen (Gestein 16–22 × 9–13, Ozean 18–26 × 10–15, Wüste 15–21 × 9–12, Eis 15–22 × 9–13, Vulkan/Gift 14–20 × 8–12, Gasriese 12–18 × 8–11, Xeno 17–24 × 10–14). `resolveSurfaceSize()` bevorzugt gespeicherte `planet.surfaceWidth/Height`, dann explizit übergebene Maße, sonst eine Seed-Variation aus `${galaxySeed}:${planet.id}:surface-size:v1`. `SurfaceManager` schreibt Maße, Oberflächen-Seed und `surfaceGenerated` zurück; `GENERATOR_VERSION` steigt auf 5.
- **Ozean-Landobergrenze.** Das Ozeanprofil hat `seaFraction 0.9`; die harte Grenze ist `floor(kacheln · 0,15)`, gezählt über die tatsächlichen Kacheln (Küsten zählen als Land). Die Landezone erzeugt kein neues Land: Vorhandenes Land wird aus abgelegenen Kacheln in den Kern und bis zu drei Nachbarn verschoben, die Spender werden Ozean. `enforceOceanLandCap` entfernt danach jede überschüssige Landkachel (niedrigste Elevation zuerst) und räumt Vorkommen, Gefahren, Flüsse und Seen konsistent auf.
- **Gasförderung statt Bodenkolonie.** `ColonizationValidator` lässt Gasriesen als Gasförderung zu (`allowed = true`, `assessment.canColonizeNormally = false`). `ColonyManager.foundColony` setzt dort `gas_extraction_hub` statt `city_center` und schnappt den Landepunkt deterministisch auf die nächstgelegene passierbare Landkachel. `buildingCatalog.ts` ergänzt `gas_extraction_hub` (nur Gasriesen) und `gas_collector` (nur Gasriesen, Biom `gas`); `technologyCatalog.ts` ergänzt `gas_extraction` (Engineering, Tier 2, 120, Voraussetzung `automated_assembly`). Die zentrale Prüfung liegt in `BuildValidationContext` (`planetType`, `completedTechIds`), das `validateBuildingPlacement`, `queueBuilding` und `findAvailableBuildCoord` auswerten; `GameEngine.queueBuilding` übergibt Planetentyp und erforschte Technologien. Ohne Kontext wird ein tech-gebundenes Gebäude abgelehnt. Der Gaskollektor produziert seltene Ressourcen, Energie und Produktion. Die Kolonieverwaltung filtert Baukarten nach Planetentyp, zeigt Tech-Sperren an und erkennt das Führungsgebäude über die Stadtzentrumskoordinate; die Skyline zeichnet eine eigene Gasförderplattform.
- **Xenowelten.** Neuer `PlanetType 'xeno'` mit Katalogeintrag, eigener Habitabilitätsbewertung und Oberflächenprofil (`seaFraction 0.24`, Flavor `xeno`, vorhandene Biome `alien`, `fungal_forest`, `jungle`, `forest`, `desert`, `marsh`, `impact_crater`, `hills`, `mountains`). Die Seltenheit ist zentral in `src/generation/planetGenerationConfig.ts` konfiguriert (Gewichte `inner 0.1`, `habitable 0.35`, `outer 0.5`); sie fließt in die bestehende gewichtete Zonenziehung ein, ohne eine zusätzliche Zufallsziehung oder einen Sondergenerator.

### Begründung
- Die Assets waren vorhanden; die Einbindung über das bestehende Glob-/Mapping-System vermeidet ein paralleles Tileset-System und lässt weitere Dateien nach demselben Muster ergänzen.
- Der gemessene `bleed` ist eine reine Darstellungsregel und ändert weder Biome noch Erträge.
- Größen-, Ozean- und Gasregeln sitzen in zentralen Modulen, damit Testlabor, Kampagne und KI dieselbe Wahrheit verwenden.
- Die verschobene Landezone erhält die Landmenge exakt; eine Ozeanwelt bleibt besiedelbar, ohne die 15-%-Grenze zu verletzen.
- Das Tech-Gate im Datenkatalog verhindert, dass direkte Bauaufrufe die Freischaltung umgehen.
- Xenowelten als Gewicht statt Sonderwurf bleiben seed-deterministisch und verändern die bestehende Generierung nicht strukturell.

### Alternativen
- Pro Biom einen eigenen Generator: verworfen, duplizierte Logik und abweichende Speicherpfade.
- Ozean-Landezone opfern oder auf Inseln verzichten: verworfen, die Welt wäre nicht gründbar.
- Landobergrenze nur über `seaFraction` erzwingen: verworfen, Rundung und Biomableitung konnten die Grenze überschreiten.
- Gasriesen weiter komplett sperren: verworfen, die Anforderung nennt Gaskollektoren ausdrücklich.
- Gasförderung über einen zweiten Kolonietyp: verworfen, unnötige Paralleldaten; die vorhandene Kolonie trägt nur ein anderes Führungsgebäude.
- Xenowelten in jedem System erzwingen: verworfen, das hätte die Kampagnenhäufigkeit verändert und eine zusätzliche Zufallsziehung nötig gemacht.
- Neue Ressourcen für Gas einführen: verworfen, `rareResources` und die bestehenden Erträge reichen aus.

### Konsequenzen
- Neue Tests: `tests/surfaceSizes.test.ts`, `tests/gasGiantBuildRules.test.ts`, `tests/xenoWorlds.test.ts`, `tests/surfaceTileAssets.test.ts` sowie `tests/helpers/surfaceFixtures.ts`; bestehende Generator-, Tile-, Kolonie-, Technologie- und Save-Tests wurden auf variable Größen, Version 5, Ozean-Cap, Gasförderung und Xenowelt angepasst.
- Suite: **532 Tests in 51 Dateien** grün; `npm run lint` und `npm run build` sind sauber (nur die bestehende Chunk-Größenwarnung).
- Headless-Chrome-Abnahme im Testlabor: Xenowelt 20 × 12 (240 Kacheln, 10 Biomtypen, Signatur `d61780fe`, identische Signatur beim zweiten Lauf), Ozeanwelt 6 × 6 (4 von 36 Kacheln Land = 11,1 %, Grenze 5) und 36 × 24 (86 von 864 = 10 %, Grenze 129), Gasriese 14 × 9 (126 Kacheln, ausschließlich `gas`, gelbe Palette), Giftwelt mit grünem Säuresee statt Platzhalter, Gesteinswelt mit Felskacheln im Gebirge; keine Konsolenfehler.
- Save-Kompatibilität: `surfaceWidth`/`surfaceHeight` sind optionale Planetenfelder; ältere Spielstände ohne Maße erhalten deterministisch eine Größe. Save-Version bleibt 5.
- **Bekannte Einschränkung:** Die Gasförderung ist über Engine- und Bauverwaltungstests abgedeckt; die Skyline- und Modal-Darstellung wurde im Browser nicht mit einer echten Gaskolonie durchgespielt. Die Führungsgebäude-Erkennung ist über Koordinaten unit-getestet.
- **Bekannte Einschränkung:** `rock_hex_3_x4.png` ist nicht quadratisch (256 × 296) und wird deshalb nicht als Gebirgskachel verwendet; die Gesteinswelten nutzen `ROCK_HEX_0..2`.
- **Bekannte Einschränkung:** Giftwelten behalten für Gebirge die allgemeinen `TILE_MOUNTAIN`-Kacheln, weil kein passendes Gift-Bergasset vorliegt.
- **Bekannte Einschränkung:** Die neuen 1600-px-Grafiken vergrößern den Build deutlich (mehrere MB pro Datei); eine spätere Kompression wäre sinnvoll, wurde aber nicht verändert.
