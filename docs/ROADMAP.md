# Astraea 4X – Entwicklungs-Roadmap

Diese Roadmap beschreibt die iterative Entwicklung von Astraea 4X über sieben geplante Entwicklungsphasen.

---

## Übersicht der Phasen

```
Phase 1 – Modul 1: Technisches Fundament & Galaxy-Karte           [ABGESCHLOSSEN]
   │
   ▼
Phase 1 – Modul 2: Sternensysteme, Systemkarte & Planeten         [ABGESCHLOSSEN]
   │
   ▼
Phase 1 – Modul 3: Planeten, Erkundung & Kolonisierung            [ABGESCHLOSSEN]
   │
   ▼
Phase 1 – Modul 4: Kolonieverwaltung, Hex-Oberfläche & Ausbau     [ABGESCHLOSSEN]
   │
   ▼
Phase 2: Distrikte, Terraforming & Logistik                       [ABGESCHLOSSEN]
   │
   ▼
Phase 3: Wirtschaft, Ressourcen & Technologiebaum                 [ABGESCHLOSSEN]
   │
   ▼
Phase 4: Reichsverwaltung, Fraktionen & Flotten                   [ABGESCHLOSSEN]
   │
   ▼
Phase 5: Narrative Ebene & Galaxiegeschichte                      [ABGESCHLOSSEN]
   │
   ▼
Phase 6: Sieg, Niederlage & Punktewertung                         [IN ARBEIT]
```

---

## Phase 1 – Modul 1: Technisches Fundament & Galaxy-Karte (Abgeschlossen)
- **Fokus:** Stabile Systemarchitektur, prozedurale 2D-Galaxie, Seeded PRNG, Spektralklassen, Hyperlanes, Rundenverwaltung, EventBus, versioniertes Speichern/Laden.
- **Status:** 100% implementiert und durch 10 Tests verifiziert.

---

## Phase 1 – Modul 2: Sternensysteme, Systemkarte & Planeten (Abgeschlossen)
- **Fokus:** Zwei-Ebenen-Navigation, 2D-Systemkarte mit Zentral- und Doppelsternen, Keplerianische Orbits, 7 differenzierte Planetentypen, physikalische Umwelttelemetrie, Habitabilitätsmodell und Sonden-Scans.
- **Nachtrag – Detailansicht (ADR-030):** Die Systemkarte bietet zusätzlich zur Orbitansicht eine horizontale, logarithmisch nach mittlerer Entfernung skalierte Planetenachse mit Mindestabständen, Scroll, auswahlzentrierter Position, Mondpunkten und einem rein visuellen Umschalter. Die Geometrie liegt im zeichenfreien Modul `src/ui/systemViewLayout.ts` und ist durch 22 eigene Tests abgesichert.
- **Nachtrag – Monde & Asteroidengürtel (ADR-031):** `PlanetGenerator.generateMoons` erzeugt pro Planet 0–14 echte Monde aus dem eigenen Seed `${galaxySeed}:${systemId}:${planetId}:moons` (Gasriesen bis zu vier Hauptmonde, Typen `rocky`/`icy`/`volcanic`/`metallic`). `GalaxyGenerator.generateAsteroidBelts` legt aus `${galaxySeed}:${systemId}:belts` null bis zwei Gürtel in die Lücken der sortierten Planeten. Beides ist additiv: `Planet.moons` ergänzt `moonsCount`, `StarSystem.asteroidBelts` ist optional, und Save v3 persistiert die neuen Daten inklusive v2-Migration.
- **Status:** 100% implementiert und durch 10 zusätzliche Tests (gesamt 20) verifiziert; die Detailansicht erweitert die Systemkarte um 22 Tests, Monde und Gürtel um 8 weitere in `tests/moons_and_belts.test.ts`. Die gesamte Suite umfasst **201 Tests in 16 Dateien**.

---

## Phase 1 – Modul 3: Planeten, Erkundung & Kolonisierung (Abgeschlossen)
- **Konzeptionelles Vorbild:** *Master of Orion* & *Civilization*
- **Fokus:**
  1. **Systematische Planetenaufklärung:**
     - `PlanetDataFilter` schützt verdeckte Umwelttelemetrie vor Scans.
     - Sonden-Scan überführt Planeten gezielt von `surveyed` nach `analyzed`.
  2. **Habitabilitäts-Faktorenmatrix (`HabitabilityEvaluator`):**
     - 0–100% Score mit transparenter Aufschlüsselung von Atmosphäre, Temperatur, Wasser, Schwerkraft und Strahlung.
     - 5 standardisierte Tiers: Sehr gut geeignet, Gut geeignet, Bedingt geeignet, Schwer besiedelbar, Ungeeignet.
  3. **Kolonisationsbarrieren & Validierung (`ColonizationValidator`):**
     - Gasriesen (0%) und tödliche Strahlung (`lethal`) blockieren Bodenkolonisierung strikt.
     - Nur analysierte, geeignete Himmelskörper können besiedelt werden.
  4. **Kolonie-Gründung & Atomare Bindung (`ColonyManager`):**
     - Erstellung von `Colony`-Entitäten mit Name, Gründungsdatum, 1.000 Kolonisten, Bauslots und Status.
     - Atomare Synchronisation von Planet (`colonized`) und Sternensystem (`colonized`).
     - Kolonie-Beacons auf System- und Galaxy-Karten.
- **Status:** 100% implementiert und durch 10 zusätzliche Tests (gesamt 30) verifiziert.

---

## Phase 1 – Modul 4: Kolonieverwaltung, Hex-Oberfläche & Ausbau (Abgeschlossen)
- **Konzeptionelles Vorbild:** *Civilization* & *Stellaris*
- **Fokus:**
  1. **Prozedurale Planetenoberfläche (`SurfaceGenerator` / `SurfaceManager`):**
     - Deterministische 18×10-Hex-Raster pro Planet mit eigener `GENERATOR_VERSION` und Seed `${galaxySeed}:${planetId}:surface:v4` (ADR-049).
     - 17 Biome, Höhenstufen, Ressourcenvorkommen, Gefahrenzonen, Flüsse und Seen sowie Nebel des Krieges (`unseen` → `visible`); Klimagürtel, Regenschatten, Abfluss und Wildheit steuern die Biomverteilung.
     - Reproduzierbare Oberflächen unabhängig von der Ladereihenfolge.
  2. **Wirtschaft & Arbeitskräfte (`EconomyEngine`):**
     - Sieben Ressourcen: Nahrung, Produktion, Energie, Mineralien, seltene Ressourcen, Forschung, Einfluss.
     - Tile-basierte Erträge, Arbeitskraft-Zuweisung mit Prioritäten und Sperren (`isWorkPrioritized`, `isWorkLocked`), Stadtzentrum als autarke Grundversorgung.
     - Bevölkerungswachstum über `calculateGrowthRequired(pop)`; Energiedefizit reduziert die Effizienz um 25%.
  3. **Territorium & Expansion (`ColonyExpansion`):**
     - Einflusskosten `15 + 5 × Distanz + 2 × bereits beanspruchte Tiles`, Claim angrenzender Hexfelder.
  4. **Bauwesen (`BuildQueueManager`):**
     - Sequentielle Bauwarteschlange mit Gebäuden, Upgrades (Kostenfaktor 0,75/0,8 pro Stufe) und Truppenrekrutierung.
     - Vollständige Validierung von Biom, Territorium, Baufreiheit, Kosten und Maximalstufe.
  5. **Forschung (`ResearchManager` & Tech-Tree):**
     - Technologiekatalog mit Voraussetzungen (`prerequisites`), Investitionsfortschritt und Abschlusswechsel.
     - Forschungserträge aller Kolonien werden pro Fraktion aggregiert.
  6. **Oberflächeneinheiten (`UnitManager`):**
     - Einheitenkatalog, Bewegungspunkte, Geländekosten, A*-Pfadsuche und Runden-Reset.
  7. **Fraktionen & KI-Grundlagen (`CivManager`):**
     - Drei Fraktionen (Spieler + zwei KI), Forschungsstatus pro Fraktion und KI-Rundenaktivitäten über dieselben Regel-Validatoren.
  8. **UI-Ebene:**
     - `PlanetSurfaceCanvas`, `HexTileInspector`, `ColonyManagementModal` (Übersicht, Steuern, Bevölkerung, Warteschlange, Bauplätze, Rekrutierung; ADR-050), `TechTreeModal`, `PlanetsOverviewModal`.
  9. **Persistenz v2:**
     - Speicherformat Version 2 inkl. Oberflächen, Kolonien, Fraktionen und Bauprojekten; Migration von v1. Seit ADR-032 ist das aktuelle Schema Version 4 (zusätzlich Staatskasse und Koloniefinanzen).
- **Status:** 100% implementiert und durch 15 zusätzliche Tests (Modul 4) verifiziert; die gesamte Suite umfasst inzwischen 101 Tests in 8 Dateien, zusätzlich 23 In-App-QA-Tests im Test-Runner.

---

## Phase 2: Distrikte, Terraforming & Logistik (Abgeschlossen)
- **Konzeptionelles Vorbild:** *Civilization* & *Stellaris*
- **Bereits umgesetzt:**
  - Kachelbasiertes Bauen auf dem Hex-Raster inkl. Gebäudekatalog, Biomen und Upgrades (Modul 4).
  - Bevölkerung, Arbeitskraft-Zuweisung und lokale Ressourcenproduktion (Modul 4).
  - Habitabilität skaliert die Nahrungserträge (Faktor 0,4–1,0) in der Wirtschaftssimulation (Modul 4).
  - **Terraforming-Projekte:** `TerraformingProject` (Biom-/Atmosphärenwechsel) mit Habitabilitätskosten, Fortschritt pro Runde, Tech-Gate `atmospheric_scrubbers` und eigener UI (`TerraformingModal`), verifiziert durch 7 Tests.
  - **Logistikrouten:** `LogisticsRoute` zwischen eigenen Kolonien mit Tech-Gate `planetary_logistics_prep`, bis zu 5 Frachtern à 15 Kapazität, Reserven/Zielbeständen und deterministischem Transfer in `endTurn`, verifiziert durch 10 Tests.
  - **Frachterflotten:** Jede Route spawnt deterministische Einzelfrachter mit echtem Standort, distanzabhängiger Reisezeit (1–20 Runden), Belade-/Abfahrt-/Rückflugphasen, Ankunftstransfer und optionaler Persistenz (`freighterFleets`); Statusanzeige im `LogisticsModal`, verifiziert durch 8 Tests (ADR-020).
  - **Multi-Tile-Distrikte:** `DISTRICT_CATALOG` mit vier Distrikten über 2–3 Hexfelder, Platzierungs-/Abrisslogik inklusive Tech-Gates, Kosten, Flächenbelegung und Distrikterträgen in `EconomyEngine`, UI im `HexTileInspector`, verifiziert durch 13 Tests (ADR-018).
  - **Habitabilitäts-Wachstumsmultiplikator:** `EconomyEngine.calculateGrowthMultiplier()` skaliert den positiven Wachstumsfortschritt mit der Planet-Habitabilität (×0,25–1,0, Floor 25 %), sichtbar in `ColonyManagementModal`, verifiziert durch 3 Tests (ADR-019).
  - **Planetenübersicht:** `PlanetsOverviewModal` mit Reichsstatistik und Direktsprüngen in Oberfläche, Kolonieverwaltung und Systemansicht.
  - **Schiffskonstruktion & Kriegsflotten:** vollständig in Phase 4 umgesetzt (ADR-023 bis ADR-026): werftgebundener Bau von Korvetten, Zerstörern und Kreuzern mit Tech-Gates, Schiffsunterhalt, Hyperlane-Bewegung, automatische Gefechte und KI-Flotten.

---

## Phase 3: Wirtschaft, galaktische Ressourcen & Technologiebaum (Abgeschlossen)
- **Bereits umgesetzt:** Technologiekatalog mit Voraussetzungsgraph, Forschungsinvestition und Abschlusslogik; sieben Ressourcen inkl. Energiebilanz.
- **Technologie-DAG (ADR-021):** Vollständiger Baum mit vier Stufen und drei Forschungsbereichen (Physik, Gesellschaft, Ingenieurwesen), 21 Technologien inkl. sechs doktrinärer Tier-4-Spezialisierungen in drei exklusiven Paaren, zentraler Graph-Validierung (`validateTechGraph`) und deterministischen Helfern für Tiefe, Abhängigkeiten, Closure und Spezialisierungssperren; verifiziert durch 15 Tests.
- **Galaktische Handelsrouten (ADR-022):** `GalacticTradeRoute`/`GalacticTradeConvoy` zwischen eigenen Kolonien über den Hyperlane-Graphen mit Tech-Gate `interstellar_freight_network`, deterministischer BFS-Pfadsuche, Frachterkapazität à 15, Zwei-Phasen-Transfer (Bewegen/Liefern, dann Beladen) mit Reserven, Zielbeständen und In-Transit-Anrechnung, Pause-/Orbit-Semantik, optionaler Persistenz (`galacticTradeRoutes`/`galacticTradeConvoys`), Kartenoverlay im `GalaxyMapCanvas` und Anlage-/Status-UI im `LogisticsModal`; verifiziert durch 13 Tests.
- **Wirtschaft Stufe A (ADR-032):** Staatskasse je Zivilisation (Start 500/300 Credits), Steuersatz pro Kolonie (0–60 %, Standard 30 %), Korruption mit stufenabhängiger Basis (0,35/0,2/0,1, ab 40 % steigend), Approval (`50 − (Steuersatz − 30) · 0,8` plus Stufenbonus 0/5/10) mit Wachstumsfaktor 0,5–1,5 und Steuereinnahmen `Bevölkerungseinheiten · 6 · Steuersatz · (1 − Korruption)`. Einmalige Treasury-Gutschrift je Runde in `GameEngine.endTurn()`, Event `colony:taxRateChanged`, Finanzkacheln und Steuersatz-Regler im `ColonyManagementModal`, Save v4 inkl. v3→v4-Migration; verifiziert durch 8 Tests.
- **Wirtschaft Stufe B (ADR-033):** Credit-Wartung je Gebäude (`creditUpkeepPerLevel × Stufe`, in `UpkeepCosts.credits`), einmalige Credit-Baukosten beim Einreihen (Prüfreihenfolge Mineralien → seltene Ressourcen → Credits), Credit-Ausbaukosten `creditCost · 0,75 · Zielstufe` und Ausgabenverrechnung in `GameEngine.endTurn()` (`max(0, Steuereinnahmen − Wartung)`, keine Schulden; seit ADR-039 zusätzlich um die Handelssteuer des Privatsektors erhöht). UI: Wartungszeile, `◈`-Kosten und gesperrte Baukarten im `ColonyManagementModal`; keine Save-Migration nötig, da die Kosten im Code-Katalog liegen; verifiziert durch 8 Tests.
- **Handelszölle, Blockaden und Eskorten (ADR-038):** `GalacticTradeRoute` erhält optionale Felder `tariffRate` (0–20 %, ganzzahlig), `escortFleetIds`, `isBlockaded` und `blockadedSystemIds`. Der Zoll wird nur auf tatsächlich gelieferte Einheiten erhoben (`Einheiten · 0,25 · Zoll/100`, auf eine Dezimale gerundet) und der Staatskasse des Routenbesitzers gutgeschrieben. Blockaden werden in jedem `advanceTurn` aus Flottenpositionen und Kriegsbeziehungen **abgeleitet** (eigene stationierte Eskorte hebt sie auf) und beim Laden verworfen; blockierte Routen laden nicht und halten ankommende Fracht im Zielorbit. Zoll- und Eskortenvalidierung ist atomar, Eskorten werden dedupliziert und sortiert. UI: Zollfeld, Eskortenauswahl und Blockadewarnung im `LogisticsModal`, rot gestrichelte Blockaderouten im `GalaxyMapCanvas`; verifiziert durch 22 Tests in `galacticTrade.test.ts`.
- **Privatsektor (ADR-039):** Neues Modul `src/core/privateSectorManager.ts`. Zivile Händler zahlen eine Handelssteuer von 25 % des aus Bevölkerung, Entwicklungsstufe und (abgeleiteter) Zufriedenheit berechneten Handelsvolumens in die Staatskasse und gleichen innerhalb eines Reiches kleine Engpässe aus: Geber oberhalb der Reserve 60/60/25 füllen Empfänger unter 40/40/15 auf, begrenzt auf eine gemeinsame Frachtkapazität von 1/2/3 Einheiten je Bevölkerungs-Einheit und Runde. Vollständig deterministisch, ganzzahlig, gütererhaltend, ohne neue Schiffe oder Save-Felder; Berichte nur im Speicher. UI: Privatsektor-Streifen in `PlanetsOverviewModal`, Handelssteuerzeile im `ColonyManagementModal`; verifiziert durch 13 Tests.
- **Status:** Alle in dieser Phase gelisteten Punkte sind umgesetzt. Die Suite umfasst aktuell **339 Tests in 29 Dateien** (Stand: Abschluss Phase 4).

---

## Phase 4: Reichsverwaltung, Fraktionen & Flotten (Abgeschlossen)
- **Bereits umgesetzt (Modul 4):** Fraktionsmodell, Forschungsstatus pro Fraktion, Oberflächeneinheiten und KI-Grundaktivitäten.
- **Schiffbau & Flotten (ADR-023):** `FleetManager` mit werftgebundenem Schiffbau (nur Kolonien der Stufe `colony`, 50 % Produktionsanteil, sofortige Mineralien-/Rare-Kosten), Katalog aus Korvette, Zerstörer und Kreuzer mit Tech-Gates, blockierender Auftragswarteschlange pro Kolonie, Flottenzusammenführung pro Zivilisation und System, Stärkeberechnung, Hyperlane-Bewegung mit einem Schritt pro Runde, optionaler Persistenz (`fleets`/`shipBuildOrders`), `FleetModal` und Kartenoverlay im `GalaxyMapCanvas`; verifiziert durch 13 Tests.
- **Schiffsunterhalt (ADR-024):** `ShipDef.energyUpkeep` (Korvette 1, Zerstörer 2, Kreuzer 4), Einbeziehung als externer Energieanteil in `calculateYields`/`simulateTurnEconomy`, gleichmäßige Verteilung des Unterhalts einer Zivilisation auf ihre aktiven Kolonien mit deterministischem Rest, Anzeige in `FleetModal` und Kolonieverwaltung; verifiziert durch 3 Tests.
- **Kampf- und Schadensmodell (ADR-025):** automatische Gefechte am Rundenende zwischen kampffähigen Flotten verschiedener Zivilisationen im selben System, paarweise Auflösung in `civId`-Reihenfolge, simultaner Schaden mit Screening nach Hülle, maximal 30 Gefechtsrunden, Rückschreiben der Verluste auf die Stapel und Entfernen vernichteter Flotten, Gefechtsberichte (`BATTLE_REPORT_LIMIT` 20) nur im Speicher mit `fleet:battle`-Event, Abschnitt „Kampfberichte" im `FleetModal`; verifiziert durch 5 Tests. Seit ADR-028 besitzen KI-Reiche eigene Flotten; im Normalspiel entstehen Gefechte weiterhin erst nach einer Kriegserklärung des Spielers.
- **Werftkapazität (ADR-026):** `getShipyardCapacity` leitet 1–4 parallele Werftdocks aus der Bevölkerung ab (1 Dock je 2.000 Kolonisten über 1.000, Obergrenze 4), jeder aktive Dock erhält den vollen 50-%-Produktionsanteil, FIFO-Vergabe über `usedSlips` mit Warteschlange für den Rest, Anzeige von Dockzahl und „Dock aktiv"/„wartet auf Dock" im `FleetModal`; verifiziert durch 4 Tests.
- **Diplomatie-Grundmodell (ADR-027):** `DiplomacyManager` mit einem symmetrischen Beziehungsdatensatz pro Zivilisationspaar (`peace`/`war`, `sinceTurn`), Frieden als Standard, validierter Kriegserklärung, Frieden erst nach `PEACE_MIN_WAR_TURNS = 3` Runden, Events `diplomacy:war-declared`/`diplomacy:peace-made`, Kriegsprüfung im Kampf über `WarRelationLookup` (nur Kriegspaare kämpfen), optionaler Persistenz (`diplomacy`, heute Teil von Save v4), `DiplomacyModal` und „Diplomatie"-Knopf mit Kriegsabzeichen in der `TopNavBar`; verifiziert durch 14 Tests.
- **KI-Präsenz (ADR-028):** `initializeAiPresence` vergibt beim Start und nach jeder neuen Galaxie je ein Heimatsystem pro KI-Reich (Habitabilität ≥ 50, keine Gasriesen, keine tödliche Strahlung, deterministische Slot-Verteilung mit Offset-Auflösung), gründet dort über die bestehenden Kolonisationsregeln eine Heimatkolonie auf Stufe `colony` mit 3.000 Kolonisten und setzt `civ.homeSystemId`; der Spieler-Heimatplanet erhält den festen Eigentümer `faction-player-home`. `AI_STARTING_TECHS` (`automated_assembly`, `advanced_metallurgy`) wird idempotent vergeben und repariert damit auch ältere Spielstände; verifiziert durch 4 Tests.
- **KI-Flotten (ADR-028):** `FleetManager.executeAiFleetTurn` füllt pro KI-Zivilisation freie Werftdocks nach `AI_SHIP_PRIORITY` (Korvette → Zerstörer → Kreuzer) und lässt stationierte eigene Flotten zyklisch zwischen eigenen Systemen patrouillieren; der Hook läuft im `endTurn` vor der Ökonomiephase, damit neue Aufträge sofort Produktion erhalten. Keine neuen Save-Felder und keine neuen Events; verifiziert durch 8 Tests.
- **Territoriumseinfärbung der Galaxiekarte (ADR-029):** `GalaxyMapCanvas` erhält die optionale `civilizations`-Prop und zeichnet je besessenem System einen farbigen Territoriums-Halo, einen Besitzerring (Spieler durchgezogen, KI gestrichelt) sowie farbige Namen mit `◆`; Besitzername im Untertitel bei Auswahl oder Zoom > 1, Legende „Territorien" unten rechts und eine `Territorium:`-Zeile im Hover-Tooltip mit den Fallbacks `Unbekannte Macht` und `Niemandsland`. Keine neuen Spieldaten, kein Save-Feld, keine Engine-Änderung; verifiziert durch `tsc --noEmit`, die unveränderte Suite (171 Tests), den Produktionsbuild und eine visuelle Abnahme im Headless-Chrome (Legende, Spielerring, gestrichelter KI-Ring, `◆`-Label und `Territorium:`-Tooltip).
- **KI-Diplomatie (ADR-035):** `AiDiplomacyManager` erklärt an Prüftagen (ab Runde 12, alle 4 Runden) deterministisch Krieg gegen das schwächste zulässige Reich (Mindeststärke 80, Überlegenheit 1,2, höchstens ein Krieg je Reich und Ziel, höchstens eine Erklärung pro Prüftag) und schließt Frieden ab 6 Kriegsrunden durch die schwächere Seite bzw. ab 18 Runden durch Kriegsmüdigkeit, mit 10-Runden-Cooldown; der Rundenakt läuft als Schritt 1c vor der Simulationsphase, ohne neue Save-Felder und ohne Invasions-KI; verifiziert durch 12 Tests.
- **Durchgehende Territoriumsgrenzen (ADR-036):** `computeTerritoryBorders` in `src/ui/territoryBorders.ts` leitet aus benachbarten Systemen unterschiedlicher Besitzer die Mittelsenkrechten ab, schneidet sie mit einem Clip-Radius von 160 um beide Systeme (Sutherland-Hodgman gegen alle Systeme), dedupliziert je Systempaar und sortiert die Segmente deterministisch. `GalaxyMapCanvas` zeichnet sie als zweifarbige, leicht versetzte Striche vor den Handelsrouten. Rein abgeleitete Renderdaten: keine neuen Save-Felder, keine Engine-Änderung; verifiziert durch 15 neue Tests (Suite: 252 Tests in 21 Dateien).
- **Steuerregler ohne Exploit (ADR-040):** `EconomyEngine` trennt reine Neuberechnung (`recalculateYields`, `recalculateTaxState`) vom vollständigen Wirtschaftszug (`simulateTurnEconomy`). `GameEngine.setColonyTaxRate`, `setColonyWorkFocus` und `upgradeColonyTier` verändern nur noch Parameter, keine Lagerbestände und keine Bevölkerung. Der Arbeitsfokus nutzt jetzt `findPlanetById`. `tests/taxRate.test.ts` prüft in 9 Fällen Erhöhen, Senken, Zurücksetzen, Wiederholung, Produktion/Verbrauch, Speichern/Laden, unveränderte andere Kolonien und den fehlenden Exploit.
- **Hauptmenü und App-Modi (ADR-041):** `appMode: 'menu' | 'creation' | 'game' | 'ended'` in `App.tsx`; `MainMenu.tsx` mit Neues Spiel, Spiel laden, Galaxie-Seeds verwalten, Roadmap, QA-Tests und Spiel beenden, dazu Schnellspeicher-Kachel und „Mit diesem Seed fortfahren". Roadmap/QA/Speicherstände/Seed-Bibliothek liegen im Menümodus; das Spielmenü enthält nur noch Speicherstände, Hauptmenü und Spiel beenden. `GalaxyGenModal.tsx` entfällt.
- **Seed-Bibliothek (ADR-042):** `src/save/seedLibrary.ts` speichert bis zu 100 Konfigurationen unter `astraea_4x_seed_library` mit stabiler ID aus `seedConfigSignature` (Seed, Größe, Form, Systemanzahl, Breite, Höhe, Mindestabstand), erzeugter Systemanzahl, Generatorversion und Zeitstempeln. `GalaxyCreationScreen.tsx` bietet „Neue Galaxie erschaffen" und „Mit bestehendem Seed fortfahren"; `SeedLibraryModal.tsx` verwaltet Einträge. Geladene Spielstände enthalten die vollständige Galaxie und regenerieren nichts.
- **Startflotte und Kolonisationslogistik (ADR-043):** Drei einzelne Verbände (Kleine Fregatte, Aufklärungsschiff, Kolonieschiff) mit deterministischen IDs in `galaxy.systems[0]`; Kolonisten und Gründungsgüter liegen ausschließlich in `Fleet.cargo`, keine globale Duplizierung und keine automatische Kolonie. `supportShipCatalog.ts` trennt Startschiffe vom baubaren Katalog (nur Kolonieschiff). `GameEngine.foundColony` erzwingt Vermessung, Bewohnbarkeit und ausreichende Fracht und verbraucht das Schiff; `provisionColonyShip` ist die öffentliche Bereitstellungs-API. `tests/startingFleet.test.ts` prüft 10 Fälle.
- **Zentrales Benachrichtigungssystem (ADR-044):** `src/core/notificationCenter.ts` (maximal 8 Meldungen, Duplikat-Schutz per Schlüssel, dauerhafte Warnungen, keine Timer) und `src/core/notificationBridge.ts` (EventBus → Meldungen, KI-Filter, Leeren bei `game:loaded`). Neue Events `build:completed` und `unit:recruited` aus `GameEngine.emitBuildCompletion()`. `NotificationStack.tsx` zeigt überlappungsfreie Karten mit eigener Ablaufzeit; alle alten `turnNotification`/`setTimeout`-Ketten sind entfernt. `tests/notifications.test.ts` prüft 13 Fälle.
- **Flottenmarker, Routen und Spielstand (ADR-045):** Eigene Silhouette und Farbe je dominanter Schiffsklasse, Ringlayout über `fleetMarkerOffset()` (maximal sechs pro Ring), Klickpriorität für Verbände vor Systemen, Auswahlring und Info-Karte mit Fracht. Marker werden nach Sternen und Labels gezeichnet. Handelsrouten bleiben sichtbar, änderbar und entfernbar; Flottenroute, Ziel und Fracht überstehen den Spielstand. `tests/fleetRendering.test.ts` (7 Fälle) und `tests/saveLoadFeature.test.ts` (3 Fälle) sichern das ab.
- **Reichsverwaltung & innere Fraktionen (ADR-046):** `EmpireManager` mit drei Fraktionen (`industrialists`, `scientists`, `militarists`), vier Governance-Politiken (`balanced`, `industry`, `science`, `military`) und einem Politik-Cooldown von 5 Runden. Verwaltungskapazität `4 + floor(Techs/2) + floor(Staatskasse/1500)` gegen eine Last aus Koloniestufen (1/2/3) und Distrikten (je 4 = 1); Overextension senkt Effizienz und Zustimmung. Fraktionsloyalität und -einfluss werden am Rundenende aus Produktion/Forschung pro Kopf, Steuersatz, Handelsrouten, Kriegen und Verwaltungslast neu bewertet; die gewichtete Loyalität moduliert die Zustimmung, eine dominante loyale Fraktion gibt +5 % auf ihren Schwerpunkt. Ereignisse `empire:policy-changed`, `empire:faction-unrest`, `empire:faction-recovered`; `EmpireModal` und „Reich"-Knopf mit Unruhe-Abzeichen; `empireStates` optional in Save v4. Erst der zweite Rundenwechsel spürt die Modifikatoren, der erste bleibt neutral. `tests/empire.test.ts` prüft 14 Fälle.
- **Teststand:** **339 Tests in 29 Dateien**, `npm run lint` und `npm run build` sauber (nur die bestehende Chunk-Größenwarnung).

---

## Phase 5: Narrative Ebene & Galaxiegeschichte (Abgeschlossen)
- **Fokus:** Datengetriebene Ereignisse, Ausgrabungsstätten auf Planeten und eine spät einsetzende galaktische Krise, ohne ein paralleles Wirtschafts- oder Speichersystem.
- **Status:** Alle in dieser Phase gelisteten Punkte sind umgesetzt. Die Suite umfasst **352 Tests in 30 Dateien** (Stand: Abschluss Phase 5).
- **Dynamische Ereignisse (ADR-047):** `src/data/narrativeEvents.ts` enthält acht einmalige Ereignisse mit je drei Entscheidungen und Wirkungen auf Staatskasse, Forschung, Fraktionsloyalität und dauerhafte Flags. Die Auswahl erfolgt deterministisch aus Galaxie-Seed, Reich und Runde; nur das Spieler-Reich erhält offene Entscheidungen. Negative Credit-Kosten werden vor dem Entschluss gegen die Staatskasse geprüft, unbekannte oder unbezahlbare Entscheidungen lassen das Ereignis offen.
- **Ausgrabungsstätten (ADR-047):** Bis zu zwölf Stätten werden deterministisch aus Planeten mit Anomalie erzeugt (bei Bedarf aufgefüllt), sind zunächst unentdeckt und erscheinen erst nach einer vollständigen Planetenanalyse. Pro Reich läuft höchstens eine Grabung; Start kostet 75 ◈, der Fortschritt beträgt `clamp(5 + floor(Forschung/Runde / 10), 5, 25)`, der Abschluss vergibt Credits und Forschung und setzt das Flag `excavation_completed`.
- **Galaktische Krise (ADR-047):** Die Krise startet ab Runde 40 oder nach zwei abgeschlossenen Ausgrabungen, sofern das Spieler-Reich mindestens eine Kolonie besitzt. Sie durchläuft `signal → awakening → resolution → resolved` im Abstand von acht Runden. Eindämmung kostet 150 ◈ und bringt 20 Fortschritt; ab 60 gilt die Krise als `contained`, sonst als `ignored`. Die Krisenmodifikatoren werden mit den Reichsmodifikatoren kombiniert und bleiben vor dem Ausbruch neutral.
- **Persistenz & UI (ADR-047):** `SaveGameData.narrative` ist optional; Save-Version bleibt 4, alte Spielstände erzeugen neue Stätten. `NarrativeModal` bündelt offene Entscheidungen, Ausgrabungen, Krisenstatus und Chronik; die `TopNavBar` erhält „Chronik" mit Abzeichen für offene Ereignisse und aktive Krisen. Nach einem Rundenwechsel mit offenem Ereignis öffnet sich die Chronik automatisch.
- **Meldungen (ADR-047):** Die Benachrichtigungsbrücke übersetzt Entdeckung, Start und Abschluss von Ausgrabungen, offene/entschiedene Ereignisse sowie Beginn, Stufenwechsel, Eindämmung und Ausgang der Krise. Ereignis- und Krisenwarnungen sind dauerhaft und werden über stabile Schlüssel ersetzt oder entfernt.
- **Teststand:** **352 Tests in 30 Dateien**, `npm run lint` und `npm run build` sauber (nur die bestehende Chunk-Größenwarnung).

---

## Phase 6: Sieg, Niederlage & Punktewertung (In Arbeit)
- **Fokus:** Die Partie erhält ein Ziel und ein Ende, ohne ein zweites Wirtschafts- oder Speichersystem. Alle Kennzahlen werden aus vorhandenen Daten abgeleitet.
- **Status:** Modul 6.1 (Sieg, Niederlage, Punkte, Abschlussbildschirm) ist umgesetzt. KI-Expansion und Invasionen als Modul 6.2/6.3 stehen noch aus.
- **Sieg- und Niederlagebedingungen (ADR-048):** Drei Siege – **Dominanz** (mindestens 60 % der besiedelten Systeme und acht eigene Kolonien), **Transzendenz** (drei abgeschlossene Tier-4-Technologien) und **Chronik** (drei abgeschlossene Ausgrabungen plus eingedämmte Krise) – sowie eine Niederlage: **Auslöschung** bei Verlust der letzten Kolonie. Die Auswertung läuft in `GameEngine.endTurn()` nach Narrativ und Reichsverwaltung; sie verändert weder Wirtschaft noch Forschung.
- **Einfrieren des Ausgangs (ADR-048):** Nach dem ersten Sieg oder der ersten Niederlage bleibt `GameOutcome` unverändert; nur der Höchststand eigener Kolonien wird weitergeführt. Ein geladener Endstand öffnet direkt den Abschlussbildschirm.
- **Punkte und Rangliste (ADR-048):** Kolonien 50, je 1.000 Bevölkerung 1, Technologien 10, je 10 Flottenstärke 1, je 100 ◈ Staatskasse 1, Ausgrabungen 25, eingedämmte Krise 75. Die Rangliste umfasst alle Reiche und sortiert nach Punkten, Kolonien, Technologien und ID.
- **Persistenz (ADR-048):** `SaveGameData.outcome` ist optional; Save-Version bleibt 4. Alte Spielstände starten offen, beschädigte Ausgänge werden verworfen.
- **UI (ADR-048):** `EndScreen` zeigt Sieg oder Niederlage, Bedingung, Runde, Punkteaufschlüsselung und Rangliste; nach einem Sieg ist die Partie als Sandbox fortsetzbar. `VictoryModal` zeigt alle drei Siegbedingungen mit Fortschrittsbalken, Punkte und Rangliste und ist über „Menü → Ziele & Punkte" erreichbar.
- **Oberflächen-Overhaul (ADR-049):** `GENERATOR_VERSION = 4` mit sechs Rauschfeldern (Elevation, Temperatur, Niederschlag, Vulkanismus, Impakt, Wildheit), Klimagürteln, Höhenlapse, Küstenfeuchte, orografischem Regenschatten und Abfluss. Neue Biome `forest`, `jungle`, `marsh`, `snow`, `lava`, `alien` und `gas`; Gasriesen erhalten eine reine Wolkenschicht, Vulkanwelten Lavaseen, Giftwelten Xenoflora. Die Oberfläche zeichnet Pixel-Tiles aus `Tilesets/Planetenbiome` mit deterministischer Variantenwahl und prozeduralen Platzhaltern für fehlende Grafik. Klimawerte sind optionale Kachelfelder, Save-Version bleibt 4.
- **Koloniale Verwaltung (ADR-050):** Der Klick auf ein Stadtzentrum öffnet die Kommandozentrale der Kolonie mit sechs Bereichen. „Steuern" bündelt Regler (0–60 %, Schritt 5), Voreinstellungen, Korruption, Wartung, Privatsektorsteuer sowie die projizierte Staatskasse; „Bevölkerung" zeigt Wachstumsprognose, Runden bis +1 Pop, Zufriedenheits-/Habitabilitätsfaktor, Arbeitskräfte und Fokuswahl; „Bauplätze" zählt bebaute, freie und distriktbelegte Felder und zeigt eine grafische Stadtansicht im MoO2-Stil (ADR-051). Die Werte stammen aus dem reinen View-Modell `src/ui/colonyAdministration.ts`; Anzeigen lösen keinen Wirtschaftszug aus.
- **Grafische Kolonieansicht (ADR-051):** `src/ui/colonySkyline.ts` platziert fertige Gebäude und Bauprojekte deterministisch auf 3 × 5 Zellen und leitet die Geländepalette aus Biom bzw. Planetentyp ab; `ColonySkyline.tsx` zeichnet je Gebäudetyp eine Platzhalter-Silhouette (Hydrokuppel als Halbkugel), Baustellen mit Fortschritt und gedrosselte Gebäude mit Warnsymbol. Keine Bildassets, kein Save-Format-Update.
- **Menschliche Fraktionen & Startaufstellung (ADR-052):** Acht datengetriebene Fraktionen mit stabilen IDs, Hintergrund, Farbe, Emblem und Flottenstil; Auswahl im `GalaxyCreationScreen`, KI-Regler 0–7 mit deterministischer Vorschau. Die Zuweisung wird im Spielstand gespeichert und beim Laden nicht neu gewürfelt. KI-Starts werden gierig nach maximaler Hyperlane-Distanz verteilt und bei kleinen Galaxien mit Warnung gelockert; das Spielerstartsystem erhält garantiert einen echt habitablen Planeten, ohne automatische Kolonie.
- **Schiffe in beiden Systemansichten (ADR-052):** `systemFleetLayout.ts` platziert klickbare Flottenmarker außerhalb der Planetenbahnen bzw. oberhalb der Detailreihe; `shipAssets.ts` ordnet die vorhandenen JPEGs aus `Tilesets/Raumschiffe` zu und markiert fehlende Klassen als Fallback. `ShipInfoBar` zeigt nur vorhandene Werte inklusive antriebsabhängiger Reichweite und Ladung.
- **Flottensteuerung & Nachrichtenverlauf (ADR-052):** Zielprüfung mit gestrichelter Routenvorschau, Bestätigung, Zieländerung und Abbruch; ungültige Ziele werden begründet abgewiesen. Der persistente `MessageLog` ergänzt die Popups als Journal mit Kategorie-Filter, Zielnavigation und Gelesen-Status und wird nur über das Menü geöffnet. Benachrichtigungen schließen einheitlich nach 10 Sekunden; der Kamera-Fix verhindert Zoom-Resets bei Datenrefreshs. Spielstände verwenden Version 5.
- **Flotten-ETA & Zwischenziele (ADR-053):** `planRoute()` verkettet Hyperlane-Pfade über optionale Zwischenziele; `getFleetEta()`/`getEtaToSystem()` zählen verbleibende Sprünge und runden auf Runden auf. `advanceTurn` löst Bewegungen stabil nach Flotten-ID auf und meldet `movedFleetIds`/`hopsTraveled`. `ShipInfoBar` zeigt „Ankunft: in N Runden (M Sprünge)“ bzw. „im Ziel“. Das Speicherformat bleibt unverändert. Belege: `docs/MOO2_TURNLOGIK_BEFUNDE.md`.
- **Routenplanung auf der Karte (ADR-054):** `ShipInfoBar` bietet „Route planen“; im Modus zeigt die Karte einen roten Hinweis und die Route rot gestrichelt. Ein Klick auf ein gültiges Ziel committet sofort, `moveFleetNow()` führt die Bewegung bis zur Reichweite aus, `movedThisTurn` verhindert den Doppelzug im Rundenwechsel. Kartenklicks lassen die Verbandsauswahl bestehen; Ziehen löst keinen Klick mehr aus. Reine Helfer in `src/ui/routePlanning.ts`.
- **GUI-Überarbeitung: Kolonie-Kommando, Kolonie-Tiles & Kachel-Infos (ADR-055):** Das `ColonyManagementModal` ist dreispaltig (Ressourcen links, Inhalt mittig, vertikale Navigation rechts) und zeigt ein Koloniezentrum-Panel mit Entwicklungsstufe, Voraussetzungen, Kosten und konkreter Ablehnung; die Aufwertung nutzt die bestehende `upgradeColonyTier`-Logik. Stadtzentren zeichnen isometrische Gesamtkomplexe aus `Tilesets/Kolonie` je Stufe, mit Vektor-Fallback. Der `HexTileInspector` zeigt Gelände, echte Deposit-Zusatzerträge, Gefahr/Terraforming, Bebauungsstatus und „Keine besonderen Ressourcenvorkommen."; Einheiten lassen sich per Token-/Kachelklick, Inspector-Knopf oder Escape wieder abwählen. Die Schiffsleiste verwendet die neuen Bilder vollständig per `object-contain`.
- **Teststand:** **490 Tests in 44 Dateien**, `npm run lint` und `npm run build` sauber (nur die bestehende Chunk-Größenwarnung).
- **Nächste Module:** 6.2 KI-Expansion und Zielauswahl, 6.3 Invasion und Eroberung von Kolonien, danach Balance und Onboarding.
