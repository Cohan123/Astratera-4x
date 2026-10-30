# Astraea 4X – Architektur & Modulgrenzen (Phase 1: Modul 1 bis 4)

## 1. Architekturübersicht

Die Architektur von Astraea 4X basiert auf einer **strikt entkoppelten Schichtenarchitektur**. Die gesamte Spiellogik besitzt keinerlei Abhängigkeiten zur Benutzeroberfläche (React) und kann vollständig isoliert instanziiert und via Vitest automatisiert getestet werden.

```
+-----------------------------------------------------------------------------------------+
|                                     UI LAYER                                            |
|   TopNavBar  |  GalaxyMapCanvas  |  SystemMapCanvas  |  PlanetSurfaceCanvas              |
|   SystemInspector  |  PlanetInspector  |  HexTileInspector  |  NotificationStack       |
|   MainMenu  |  GalaxyCreationScreen  |  SeedLibraryModal                                |
|   Modals (SaveLoad, TechTree, ColonyManagement, PlanetsOverview,                        |
|           QA Diagnostics, Roadmap)                                                      |
+-----------------------------------------------------------------------------------------+
                                             │ (Events / Hooks / Direct Engine Actions)
                                             ▼
+-----------------------------------------------------------------------------------------+
|                                    CORE ENGINE                                          |
|                GameEngine (Fassade & Koordinator aller Subsysteme)                      |
+-----------------------------------------------------------------------------------------+
         │                         │                               │
         ▼                         ▼                               ▼
+-----------------+      +--------------------+          +--------------------+
|   TURN SYSTEM   |      |   GALAXY & SYSTEM  |          |    EVENT SYSTEM    |
|   TurnManager   |      | Galaxy, StarSystem |          |      EventBus      |
+-----------------+      +--------------------+          +--------------------+
         │                         │                               │
         ▼                         ▼                               ▼
+-----------------+      +--------------------+          +--------------------+
| COLONY & SURVEY |      | GENERATION MODULE  |          |    SAVE SYSTEM     |
| HabitabilityEval|      | PRNG, GalaxyGen,   |          |    SaveManager     |
| ColonizeRules   |      | PlanetGenerator,   |          | (versioned payload)|
| ColonyManager   |      | SurfaceGenerator   |          +--------------------+
| PlanetDataFilter|      +--------------------+
+-----------------+
         │
         ▼
+------------------------------------------------------------------+
|                    PLANETARY SIMULATION (Modul 4)                |
| SurfaceManager | EconomyEngine | ColonyExpansion | BuildQueueMgr |
| UnitManager    | ResearchMgr   | CivManager                          |
+------------------------------------------------------------------+
```

---

## 2. Modulgrenzen und Verantwortlichkeiten

### 2.1 Core Engine (`src/core/`)
- **`GameEngine`**: Zentraler Zustandskoordinator. Hält die aktuelle Galaxie, die Rundenverwaltung, den aktiven Ansichtsmodus (`viewMode: 'galaxy' | 'system' | 'surface'`), das ausgewählte Sternensystem, den ausgewählten Planeten, das ausgewählte Hexfeld (`selectedHexCoord`), die ausgewählte Einheit (`selectedUnitId`) sowie Kolonien und Oberflächeneinheiten. Bietet atomare Methoden für Spielaktionen (`enterSystemView()`, `leaveSystemView()`, `enterSurfaceView()`, `leaveSurfaceView()`, `selectPlanet()`, `surveyPlanet()`, `surveySystem()`, `foundColony()`, `selectUnit()`, `setColonyWorkFocus()`, `setColonyTaxRate()`, `endTurn()`, `quickSave()`, `quickLoad()`).
- **`types.ts`**: Domänenmodelle für Galaxie, Sternensysteme, Sterne, Doppelsterne, Planeten, Kolonien, Habitabilitäts-Faktoren, Hex-Oberflächen, Gebäude, Bauprojekte, Einheiten, Forschung und Zivilisationen. `LogisticsRoute`, `TerraformingProject`, Multi-Tile-Distrikte (`DistrictDef`/`DistrictInstance`) sowie `GalacticTradeRoute`/`GalacticTradeConvoy` und die Flottenmodelle `ShipDef`/`Fleet`/`ShipBuildOrder` sowie die Diplomatiemodelle `DiplomaticPair`/`DiplomacyResult` und die Reichsmodelle `EmpireState`/`FactionState`/`EmpireModifiers` sind implementiert und werden über `TerraformingManager`, `LogisticsManager`, `DistrictManager`, `GalacticTradeManager`, `FleetManager`, `DiplomacyManager` bzw. `EmpireManager` verwaltet.

### 2.2 Erkundungs- und Kolonisierungssystem (`src/core/`)
- **`HabitabilityEvaluator`**:
  - Berechnet deterministisch einen Habitabilitäts-Score von 0 bis 100%.
  - Klassifiziert in 5 standardisierte Tiers:
    - `ideal`: Sehr gut geeignet (≥ 80%)
    - `moderate`: Gut geeignet (60–79%)
    - `harsh`: Bedingt geeignet (40–59%)
    - `hostile`: Schwer besiedelbar (15–39%)
    - `uninhabitable`: Für normale Besiedelung ungeeignet (< 15%)
  - Generiert transparente, nachvollziehbare Faktoren (Atmosphäre, Temperatur, Wasser, Schwerkraft, Strahlung, Planetentyp).
- **`ColonizationValidator`**:
  - Zentrale Regelinstanz für Besiedelbarkeit.
  - Prüft zwingende Voraussetzungen:
    1. Planet muss vollständig analysiert sein (`surveyStatus === 'analyzed'`).
    2. Planet darf nicht bereits kolonisiert sein.
    3. Gasriesen erlauben keine normale Bodenkolonie; zulässig ist ausschließlich eine Gasförderung (Plattform plus Gaskollektoren). `ColonizationValidator` meldet dafür `allowed = true` mit `assessment.canColonizeNormally = false`; die Gebäuderegeln begrenzen die Bebauung auf `allowedPlanetTypes: ['gas_giant']`.
    4. Tödliche kosmische Strahlung (`radiationHazard === 'lethal'`) blockiert Kolonisation.
    5. Mindesthabitabilität (≥ 15%) muss erfüllt sein.
- **`ColonyManager`**:
   - Erstellt und verwaltet `Colony`-Entitäten.
   - Führt atomare Zustandstransitionen durch (`planet.colonizationStatus = 'colonized'`, `planet.colonyId = colonyId`, `system.discoveryStatus = 'colonized'`).
   - Setzt in Modul 4 zusätzlich Startbevölkerung (1.000), Startlager, Stadtzentrum-Gebäude, Bewirtschaftungsfelder sowie Finanzstartwerte (Steuersatz 30 %, Korruption 0, Approval 50) und ruft die erste Ökonomiesimulation auf. Auf Gasriesen entsteht statt `city_center` die `gas_extraction_hub`; ein Wunsch-Landepunkt wird deterministisch auf die nächstgelegene passierbare Landkachel geschnappt (ADR-057).
   - Emittiert Ereignisse `colony:founded` und `colony:failed`.
- **`PlanetDataFilter`**:
   - Trennt zugrundeliegende Realität von Spieler-Aufklärungsdaten.
   - Hält tiefe Messwerte bis zum Orbitalsonden-Scan verborgen.

### 2.3 Oberflächen-System (`src/surface/`)
- **`SurfaceGenerator`**:
   - Erzeugt pro Planet eine deterministische Hex-Karte mit variablem Format. Ohne gespeicherte oder explizit übergebene Maße löst `src/surface/surfaceSize.ts` die Größe aus Planetentyp, Planet-ID und Galaxie-Seed auf (harte Grenzen 6–36 × 6–24, maximal 864 Kacheln). Die alten Standardmaße 18 × 10 bleiben nur der Rückfallwert.
   - Seed: `${galaxySeed}:${planet.id}:surface:v${GENERATOR_VERSION}` mit `GENERATOR_VERSION = 5` (ADR-049, ADR-057). Der Größen-Seed ist getrennt (`…:surface-size:v1`), damit Größenänderungen nicht alle Biomdaten neu würfeln.
   - Mehrfeldmodell (ADR-034/ADR-049): sechs getrennte `ValueNoise2D`-Felder (Elevation, Temperatur inkl. Breitengrad, Niederschlag inkl. Klimagürteln, Vulkanismus, Impakt, Wildheit) werden pro Kachel ausgewertet; planetentypische Profile liefern Meeresanteil, Landband-Gewichte, Klima- und Vulkanismusbasis sowie den Flavor (`terran`, `arid`, `frozen`, `volcanic`, `toxic`, `xeno`, `gas`).
   - Klimakopplung: Höhenlapse kühlt Mittelland und Hochland (Band 2 −0,08, Band 3 −0,22); Kryowelten sind auf 0,28 Temperatur gedeckelt, aride Welten auf 0,42 Niederschlag. Küstenfeuchte per BFS-Abstand zum Ozean, orografischer Regenschatten mit Westwind, Fluss- und Seenähe mit +0,15 Niederschlag.
   - Quantil-Bänder: Die sortierte Rohelevation wird in 0 = Meer, 1 = Tiefland, 2 = Mittelland, 3 = Hochland quantisiert; die Bänder halten den Meeresanteil des Profils exakt ein. Das Biom leitet sich aus Band plus Temperatur, Niederschlag, Abfluss, Vulkanismus, Impakt und Wildheit ab (`terrainNoise.ts` liefert das Rauschen). Band 0 ist auf Vulkanwelten ein Lavasee.
   - Biommatrix: Band 3 = Gebirge, Band 2 = Hügel/Gletscher/Vulkanit, Band 1 = Krater, Schnee, Tundra, Marsch, Wüste, Xenoflora/Pilzwald, Dschungel, Wald oder Ebene. Giftwelten erzeugen `alien`/`toxic`, Vulkanwelten `lava`/`volcanic`.
   - Gasriesen: reine `gas`-Wolkenschicht ohne Hydrologie, Vorkommen, Gefahren und Landezone (ADR-049); seit ADR-057 mit echten Gas-Tiles gerendert.
   - Landezone: Kartenmitte (`floor(width/4)`, `floor(height/2)`) und ihre sechs Nachbarn werden auf passierbares Land (Band 1/2) repariert und über `ensureArableBiome` auf ertragreiche Biome (`plains`, `forest`, `jungle`, `marsh`, `fungal_forest`, `hills`) abgebildet; die Zone bleibt immer gefahrlos. Auf Ozeanwelten wird kein zusätzliches Land erzeugt: Vorhandenes Land wird aus abgelegenen Kacheln in Kern und bis zu drei Nachbarn verschoben, sodass die Gesamtlandmenge konstant bleibt (ADR-057).
   - Ozean-Landobergrenze (ADR-057): `OCEAN_MAX_LAND_FRACTION = 0.15`; das Profil setzt `seaFraction 0.9`, die harte Grenze ist `floor(kacheln · 0,15)`. Nach der Biomableitung entfernt `enforceOceanLandCap` jede überschüssige Landkachel (niedrigste Elevation zuerst) und räumt Vorkommen, Gefahren, Flüsse und Seen konsistent auf; die geschützte Landezone bleibt erhalten.
   - Ressourcenvorkommen (`depositRoll < 0.28`, nie auf Ozean, Gas oder Lavasee) und Gefahren (`habitability < 40 ? 0.25 : 0.08`); Verteilung und Reparaturen sind an den Oberflächen-Seed gebunden und damit speicherstabil.
   - Hydrologie (ADR-037): `Hydrology.compute` leitet per Priority-Flood auf der Rohelevation Abflussmengen, Fließrichtungen und Seen ab. Auslässe sind Ozean und Kartenrand; Wasser fließt strikt bergab, Abfluss akkumuliert rückwärts über die Flut-Reihenfolge. `RIVER_THRESHOLD = 5` markiert Flüsse, `LAKE_MIN_RISE = 0.005` Seen; Fluss- und Seenachbarn erhalten +0,15 Feuchtigkeit (nie auf Ozean). Die Kacheln tragen `riverDischarge`, `flowsTo`, `isLake` sowie die optionalen Klimawerte `temperature`, `rainfall`, `drainage` und `savagery` (ADR-049); `PlanetSurfaceCanvas` zeichnet Seen und Flusslinien, der `HexTileInspector` weist Gewässer und Klima aus.
   - `SurfaceManager.findOptimalColonyLandingSite` schließt alle Biome mit `isImpassable` aus dem `BIOME_CATALOG` aus (ADR-049).
- **`hexMath`**: Axiale Hex-Koordinaten, Nachbarschaften, Distanz, Ring- und Spiralausdehnung, Pixel-/Hex-Konvertierung.
- **`SurfaceManager`**: Hält alle `PlanetSurface`-Objekte, erzeugt sie bei Bedarf (`getOrCreateSurface`), serialisiert sie für Speicherstände und deckt Felder im Radius auf (`revealTilesAround`).
- **Tile-Darstellung (`src/ui/surfaceTileMapping.ts`, `src/ui/surfaceTileAssets.ts`)**: Die reine Mapping-Schicht übersetzt Biom, Planetentyp, Küsten- und Gewässernähe in Basis-/Aufsatz-Tiles, Tönungen, Kraterringe oder prozedurale Platzhalter (`alien` außerhalb von Xeno-/Giftwelten); die Variantenwahl ist ein FNV-1a-Hash aus Oberflächen-Seed und Kachelschlüssel. Lava und Vulkangelände nutzen die echten Kacheln unter `Tilesets/Planetenbiome/Lava` (`LAVA_TILE_0..3`, `LAVA_TILE_BASALT`, `MOUNTAIN_HEX_0..3`), seit ADR-057 zusätzlich Gasriesen (`GAS_YELLOW_*`, `GAS_BLUE_*`), Giftwelten (`GIFT_*`), Xenowelten (`XENO_*`) und Gesteinswelten (`ROCK_HEX_*`). Die neuen Familien sind quadratische Punkt-Hex-Grafiken und werden über `box: 'square'` mit einem je Datei gemessenen `bleed`-Faktor gezeichnet, damit der transparente Rand benachbarte Kacheln lückenlos schließt. Die Asset-Schicht bindet die einzelnen `TILE_*.png` sowie Lava-, Berg-, Gas-, Gift-, Xeno- und Gesteinsdateien per Vite-Glob ein, normalisiert Skalierungssuffixe, cached decodierte Bilder und lässt die großen Referenz-Spritesheets aus (ADR-049, ADR-057).

### 2.4 Kolonieökonomie (`src/core/economyEngine.ts`)
- Simuliert pro Runde Erträge, Unterhalt, Energiedefizit und Bevölkerungswachstum.
- Sieben Ressourcen: Nahrung, Produktion, Energie, Mineralien, seltene Ressourcen, Forschung, Einfluss.
- `allocateCitizenWorkforce` priorisiert Hexfelder nach Arbeitsfokus und respektiert gesperrte Tiles sowie das automatisch versorgte Stadtzentrum.
- Wachstumsschwelle: `Math.round(50 * pop^1.3)` auf Basis der Bevölkerungs-Einheiten (1.000 Einwohner = 1 Pop).
- **Staatsfinanzen (Stufe A, ADR-032):** `normalizeTaxRate` klemmt den Steuersatz auf 0–60 % (Default 30). `calculateCorruption` wächst mit Steuersatz über 40 % und sinkt mit der Entwicklungsstufe (outpost 0,35 / settlement 0,2 / colony 0,1). `calculateApproval` bildet 50 Punkte bei 30 % Steuer plus Stufenbonus (0/5/10), geklemmt auf 0–100; `calculateApprovalGrowthFactor` übersetzt das in 0,5–1,5 (bei 50 exakt 1,0). `calculateTaxRevenue` berechnet `Pop-Einheiten × 6 × Steuersatz × (1 − Korruption)` und schreibt `taxRate`, `corruption`, `approval` und `taxRevenue` in die Kolonie. Die Staatskasse wird pro Zivilisation genau einmal in `GameEngine.endTurn()` gutgeschrieben, damit mehrere Kolonien nicht doppelt zählen.
- **Wartung & Baukosten (Stufe B, ADR-033):** `calculateYields` summiert zusätzlich `(creditUpkeepPerLevel ?? 0) · Stufe` aller aktiven Gebäude und rundet auf eine Dezimale (`UpkeepCosts.credits`). Der Schritt „B3. Staatskasse" in `GameEngine.endTurn()` verrechnet je Zivilisation `treasury = max(0, round1(treasury + Steuereinnahmen + Handelssteuer − Credit-Wartung))`; Schulden entstehen nicht. Einmalige Credit-Baukosten (`BuildingDef.creditCost`) werden beim Einreihen über einen optionalen `treasuryHolder` abgezogen; ohne Holder bleibt der Aufruf creditfrei (Alt-Tests, KI-Pfad).
- **Verwaltungsansicht (ADR-050):** `src/ui/colonyAdministration.ts` projiziert Steuern, Bevölkerung und Bauplätze für die UI, ohne Kolonie oder Vorräte zu verändern. Die Gutschrift bleibt ausschließlich im Rundenwechsel; der Steuern-Tab zeigt dieselbe Rechnung (Steuern + Privatsektor − Wartung) als Vorschau.

### 2.5 Territorium (`src/core/colonyExpansion.ts`)
- Berechnet Anspruchskosten als `15 + 5 · Distanz zum Stadtzentrum + 2 · bereits beanspruchte Tiles`.
- Beansprucht Hexfelder über Einfluss aus dem Kolonielager und aktualisiert `claimedByColonyId` / `claimedByCivId`.

### 2.6 Bauwesen (`src/core/buildQueueManager.ts`)
- Ein Projekt pro Kolonie und Runde (`buildQueue[0]`).
- Gebäudebau prüft Definition, Territorium, Belegung und Biomanbindung.
- **Zentrale Planetentyp- und Tech-Regeln (ADR-057):** `BuildValidationContext` übergibt `planetType` und `completedTechIds` an `validateBuildingPlacement`, `queueBuilding` und `findAvailableBuildCoord`. `allowedPlanetTypes`/`disallowedPlanetTypes` und `requiredTechId` werden ausschließlich dort ausgewertet; ohne Kontext wird ein tech-gebundenes Gebäude abgelehnt. Auf Gasriesen bleibt dadurch nur der Gaskollektor baubar, normale Bodenbauten sind gesperrt.
- Credit-Baukosten (`BuildingDef.creditCost`) werden beim Einreihen upfront über den optionalen `treasuryHolder` abgezogen; die Prüfreihenfolge ist Mineralien → seltene Ressourcen → Credits (atomar). Ohne Holder entfällt die Credit-Prüfung.
- Upgrades skalieren Kosten und Produktion mit der Zielstufe (`Stufe × Level`); die Credit-Ausbaukosten betragen `Math.round(creditCost · 0,75 · Zielstufe)`.
- Truppenrekrutierung nutzt dieselbe Warteschlange und zieht Mineralien bzw. seltene Ressourcen sofort ab.
- `advanceQueue` schreitet mit der Produktion der Kolonie fort und stellt fertige Gebäude/Einheiten bereit.
- **0-Bauzeit und Altbestände (ADR-056):** `getUpgradeProductionCost()` ist die gemeinsame Bauzeitformel (`round(baseProductionCost · 0,8 · Zielstufe)`), die auch die GUI nutzt. Ausbauten mit Bauzeit 0 (Koloniezentrum) werden sofort abgeschlossen und nicht eingereiht; gespeicherte 0-Runden-Aufträge schließt der nächste Rundenwechsel kontrolliert ab. `normalizeBuildQueue()` repariert beim Laden Fortschritt und Bauzeit, entfernt Duplikate und ergänzt `buildingInstanceId`/`buildingDefId`. `targetLevel` wird absolut gesetzt, damit ein Auftrag keine zweite Stufe freischalten kann.
- **Bauplatz-Begriff (ADR-050):** Ein Bauplatz ist ein beanspruchtes Hexfeld ohne Stadtzentrum, Gebäude oder Distrikt; die Verwaltung zählt ihn mit denselben Bedingungen wie `validateBuildingPlacement` und zeigt Biom-/Tech-Sperren erst am konkreten Gebäude.

### 2.7 Einheiten (`src/core/unitManager.ts`)
- Statische API für Erzeugung, Bewegungspunkte und Rundenreset.
- Bewegung entlang eines Pfads mit Geländekosten aus dem Biomkatalog.
- Einheiten werden im `GameEngine`-Zustand (`units: SurfaceUnit[]`) gehalten und über `selectUnit()` fokussiert.

### 2.8 Forschung & Zivilisationen (`src/core/researchManager.ts`, `src/core/civManager.ts`)
- **`ResearchManager`**: validiert Voraussetzungen im Technologie-DAG, verwaltet `currentTechId` / `currentTechInvested` und schließt Technologien bei Erreichen der Kosten ab.
- **`techGraph` (`src/core/techGraph.ts`):** Einzige Validierungsinstanz für den Katalog (`validateTechGraph`/`validateTechCatalog`: Existenz, Zyklusfreiheit, strikt steigende Tier-Voraussetzungen, gültige Unlocks, konsistente `exclusiveGroup`s) sowie deterministische Helfer für Tiefe, Prerequisite-Closure, direkte/transitive Abhängige, Tier-Sortierung, fehlende Voraussetzungen, Spezialisierungsrivalen und Forschungsstatus.
- **`CivManager`**: initialisiert Spieler- und KI-Fraktionen mit Farben, Forschungsständen und Ressourcen; `executeAITurns` nutzt dieselben Regel-Validatoren wie der Spieler (Expansion, Koloniegründung) und läuft vor der Ökonomiesimulation.

### 2.8a Terraforming (`src/core/terraformingManager.ts`)
- Projektverwaltung pro Planet mit Ziel-Biom und/oder Ziel-Atmosphäre.
- Tech-Gate `atmospheric_scrubbers`; nur transformierbare Biome (`desert`, `tundra`, `volcanic`, `toxic`, `impact_crater`).
- Kosten skalieren mit der aktuellen Habitabilität (`240 + max(0, 100 - Habitabilität) · 8`) plus Aufschläge für Biom-/Atmosphärenziel.
- `advanceTurn` schreibt Fortschritt aus der Kolonieproduktion fort, setzt bei Abschluss `biome`/`atmosphere` und löst `terraforming:*`-Events aus.

### 2.8b Logistik (`src/core/logisticsManager.ts`)
- Frachterrouten zwischen zwei aktiven Kolonien derselben Zivilisation; Tech-Gate `planetary_logistics_prep`.
- Kapazität `Frachter · 15` (maximal 5 Frachter pro Route).
- `advanceTurn` transferiert deterministisch `food`, `minerals` und `rareResources`: verfügbar abzüglich Reserve, Bedarf bis Zielbestand, begrenzt durch die Routenkapazität.
- Routen werden im Spielstand persistiert und im `endTurn` vor dem Autosave ausgeführt.

### 2.8c Distrikte (`src/core/districtManager.ts`, `src/data/districtCatalog.ts`)
- Vier datengetriebene Distrikte (`residential_block`, `industrial_park`, `agro_complex`, `research_campus`) mit axialen Footprints (2–3 Hexfelder), Mineral-/Seltenkosten, Energieunterhalt und Erträgen pro Runde; `industrial_park` und `research_campus` sind über `automated_assembly` bzw. `orbital_surveying` freigeschaltet.
- `DistrictManager` ist zustandslos: Distrikte leben in `Colony.districts`, die Belegung auf der Oberfläche in `PlanetHexTile.districtInstanceId`.
- `canPlaceDistrict` prüft Definition, Tech-Gate, Fläche, Territorium (`claimedByColonyId`), Stadtzentrum, Gebäude, Überlappung, Duplikate und Lagerbestand; `placeDistrict` zieht Kosten ab und bereinigt `workedHexKeys`.
- `calculateDistrictYields` summiert Erträge und Unterhalt; `EconomyEngine` übernimmt das Ergebnis vor dem Bürger-Nahrungsverbrauch.
- `syncSurfaceMarkers` rekonstruiert Marker aus Koloniedaten (Save-Migration), `clearSurfaceMarkers` entfernt verwaiste Marker.

### 2.8d Galaktischer Handel (`src/core/galacticTradeManager.ts`)
- `GalacticTradeRoute` verbindet zwei aktive Kolonien derselben Zivilisation in unterschiedlichen Systemen; Tech-Gate `interstellar_freight_network`.
- Pfadsuche ist ein ungerichteter BFS über `Galaxy.hyperlanes` mit sortierten Nachbarn: kürzester, bei Gleichstand lexikografisch kleinster Pfad; ohne Pfad wird die Route abgelehnt.
- Kapazität `Frachter · 15` (maximal 5), erlaubte Ressourcen `food`, `minerals`, `rareResources`; die Kombination Quelle + Ziel + Ressource ist eindeutig, Gegenrichtungen sind eigene Routen.
- Ein `GalacticTradeConvoy` pro Route; `advanceTurn` bewegt und liefert zuerst (`outbound` → `inbound`), lädt danach `min(Kapazität, Quellbestand − Reserve, Zielbedarf − Bestand − In-Transit)`.
- Pausierte Routen laden nicht nach; bei inaktivem Ziel bleibt die Fracht im Orbit. Entfernen löscht den Konvoi.
- Persistenz über optionale Felder `galacticTradeRoutes`/`galacticTradeConvoys` ohne zusätzliche Schemafelder (heute Save v5).
- **Zoll (ADR-038):** `route.tariffRate` ist ganzzahlig auf 0–20 geklemmt. Der Zoll wird nur beim Liefern auf die tatsächlich gelieferten Einheiten der Routenressource erhoben (`round1(Einheiten · 0,25 · Zoll/100)`) und der Staatskasse der besitzenden Zivilisation gutgeschrieben; `setRouteTariff` validiert atomar und emittiert `galactic-trade:route-tariff-changed`.
- **Blockade (ADR-038):** `updateBlockades` leitet den Zustand vor jeder Bewegung aus den Flottenpositionen zu Rundenbeginn und den Kriegsbeziehungen ab. Ein System des Pfads gilt als blockiert, wenn dort eine verfeindete Flotte steht und keine zugewiesene eigene Flotte `stationed` ist; `blockadedSystemIds` listet die Systeme in Pfadreihenfolge. Blockierte Routen laden nicht, ankommende Konvois halten ihre Fracht im Zielorbit. `loadRoutes` verwirft den gespeicherten Zustand, damit er im nächsten Zug neu berechnet wird.
- **Eskorten (ADR-038):** `route.escortFleetIds` ist dedupliziert und sortiert; `setRouteEscorts` prüft alle IDs vor der Zuweisung gegen den Flottenbestand und den Status `stationed` und ändert bei einem Fehler nichts.

### 2.8e Schiffbau & Flotten (`src/core/fleetManager.ts`, `src/data/shipCatalog.ts`)
- `SHIP_CATALOG` enthält Korvette, Zerstörer und Kreuzer mit Hüll-, Angriffs- und Verteidigungswerten, Produktions-/Mineralien-/Rare-Kosten und Tech-Gate (`advanced_metallurgy`, `fusion_reactors`, `gravitic_engineering`).
- Nur Kolonien der Stufe `colony` bauen Schiffe (`SHIPYARD_REQUIRED_TIER`); `canBuildShip` prüft Werftstufe, Tech-Gate, bekannte Schiffsklasse und Lagerbestände.
- `queueShipBuild` bucht Mineralien und Rare-Ressourcen sofort ab; `getShipyardCapacity` leitet 1–4 parallele Werftdocks aus der Bevölkerung ab (1 Dock je 2.000 Kolonisten über 1.000). Jeder aktive Dock erhält pro Runde den vollen Anteil `max(1, floor(netYields.production · 0.5))` (`SHIPYARD_PRODUCTION_SHARE = 0.5`); die Vergabe erfolgt FIFO über `usedSlips`, überzählige Aufträge warten auf einen freien Dock.
- Fertige Schiffe werden in die Flotte der Zivilisation im System eingegliedert (`ensureFleetAt`, `fleet_${civId}_${systemId}_${seq}`, Name `Flotte ${system.name}`); `Fleet.ships` stapelt `{ shipDefId, count }`, `getFleetStrength` summiert Hüll-/Angriffs-/Verteidigungswerte.
- **Routen & Zwischenziele (ADR-053):** `planRoute()` verkettet den ungerichteten, sortierten BFS über `Galaxy.hyperlanes` über optionale `waypointSystemIds`. Ein Zwischenziel wird durchflogen, ohne den Auftrag zu beenden; ein nicht erreichbarer Abschnitt nennt das betroffene Zwischenziel in der Begründung. `commandMoveFleet`, `retargetFleet`, `previewRoute` und `canReachSystem` nehmen Zwischenziele optional entgegen, bestehende Aufrufe bleiben gültig.
- **Zugauflösung:** `advanceTurn` bewegt fliegende Verbände sortiert nach ID (save-/load-stabil) und legt pro Runde bis zu `rangeHopsForCiv` Hyperlane-Schritte zurück. `FleetTurnSummary` meldet `movedFleetIds` und `hopsTraveled`; die Reise endet mit `fleet:arrived`.
- **ETA (ADR-053):** `getRemainingHops()`, `getFleetEta()` und `getEtaToSystem()` zählen verbleibende Hyperlane-Sprünge und teilen sie aufgerundet durch die Reichweite (`turnsForHops`). Das ist die Rundenzählung aus Master of Orion 2 („n turns to star“), ohne Treibstoff- oder Geschwindigkeitsregeln zu erfinden. Die Belege stehen in [`MOO2_TURNLOGIK_BEFUNDE.md`](MOO2_TURNLOGIK_BEFUNDE.md).
- `ShipInfoBar` zeigt „Ankunft: in N Runden (M Sprünge)“ bzw. „im Ziel“; die Zielvorschau ergänzt die ETA des ausgewählten Ziels. Save-Format unverändert: Zwischenziele liegen ausschließlich im bereits persistierten `pathSystemIds`.
- **Routenplanungsmodus (ADR-054):** `ShipInfoBar` bietet für eigene Verbände „Route planen“ an. Im Modus zeigt die Leiste „Routenplanung aktiv – Zielsystem auswählen“ plus „Planung abbrechen“, die Karte einen roten Modus-Hinweis. Ein Klick auf ein gültiges Ziel prüft und committet sofort; Abbruch, Schiffswechsel, Ansichtswechsel und Verlassen der Partie beenden den Modus ohne Bewegung. Inspector-Klicks wählen nur Systeme aus.
- **Rote Route & Kartenklicks (ADR-054):** `src/ui/routePlanning.ts` kapselt `canStartRoutePlanning`, `decideGalaxySystemClick`, `routePolylineScreenPoints` und `routePlanningStatusText`. Die Route wird aus Weltkoordinaten und der aktuellen Kamera projiziert, folgt Zoom/Pan und nutzt dieselbe `planRoute`-Logik wie der Auftrag. Ein Systemklick lässt die Verbandsauswahl bestehen; nur ein Klick ins Leere hebt sie auf. Ziehen wird über einen eigenen Client-Startpunkt und eine 5-px-Schwelle von Klicks getrennt.
- **Sofortige Bewegung (ADR-054):** `FleetManager.moveFleetNow()` bewegt einen frisch beorderten Verband sofort um höchstens seine Reichweite. `movedThisTurn` verhindert eine Doppelbewegung im anschließenden `advanceTurn`; danach ist der Merker frei. Ohne Sofortbewegung bleibt der Rundenwechsel unverändert.
- **Unterstützungsschiffe (ADR-043):** `src/data/supportShipCatalog.ts` enthält die nicht baubaren Startschiffe `frigate`, `scout` und `colony`. `getShipDef()`, `BUILDABLE_SHIP_IDS` und `getBuildableShipDefs()` führen Haupt- und Unterstützungskatalog zusammen; nur das Kolonieschiff ist über `advanced_metallurgy` (120 Produktion, 90 Mineralien, 15 Seltene) baubar. Beim Abschluss eines Kolonieschiff-Auftrags wird `Fleet.cargo` mit `COLONIZATION_SUPPLY` befüllt; `cloneFleet` kopiert die Fracht.
- **Marker (ADR-045):** `dominantFleetClass()` wählt die schwerste Schiffsklasse eines Verbands, `fleetMarkerOffset()` verteilt Marker ringförmig (maximal sechs pro Ring). Form und Farbe unterscheiden die Klassen; die Trefferprüfung im Canvas läuft vor der Systemauswahl und nutzt dasselbe Layout. Ausgewählte Verbände erhalten einen Ring und eine Info-Karte mit Status, Ziel und Fracht.
- Persistenz über optionale Felder `fleets`/`shipBuildOrders` ohne zusätzliche Schemafelder (heute Save v5); UI in `FleetModal`, Kartenmarker und Restrouten im `GalaxyMapCanvas`.

### 2.8f Diplomatie (`src/core/diplomacyManager.ts`)
- Ein symmetrischer `DiplomaticPair` pro Zivilisationspaar mit sortierten IDs, `relation` (`'peace'` | `'war'`) und `sinceTurn`; Frieden ist der Standard, `syncCivilizations` legt fehlende Paare an, behält bestehende Beziehungen und entfernt Paare unbekannter Zivilisationen.
- `declareWar` prüft Existenz beider Reiche, Duplikate und bereits bestehenden Krieg; `makePeace` verlangt einen laufenden Krieg und mindestens `PEACE_MIN_WAR_TURNS = 3` Runden Kriegsdauer (`currentTurn - sinceTurn >= 3`).
- Erfolgreiche Wechsel emittieren `diplomacy:war-declared` bzw. `diplomacy:peace-made` (mit `turnsAtWar`); Ablehnungen liefern deutsche Begründungen statt Ausnahmen.
- Der `FleetManager` erhält die Beziehung über das Interface `WarRelationLookup`; `resolveBattles` kämpft nur bei `isAtWar`, ein `null`-Lookup erhält das bisherige Verhalten (alle Paare feindlich).
- Persistenz über das optionale Feld `diplomacy` ohne zusätzliche Schemafelder (heute Save v5); die UI besteht aus `DiplomacyModal` und dem „Diplomatie"-Knopf mit Kriegsabzeichen in der `TopNavBar`.

### 2.8g KI-Präsenz & KI-Flotten (`src/core/GameEngine.ts`, `src/core/fleetManager.ts`)
- `initializeAiPresence` läuft im `GameEngine`-Konstruktor und nach jedem `generateNewGalaxy`, nie beim Laden eines Spielstands; KI-Reiche starten dadurch auch in bestehenden Spielen ohne eigenes Territorium.
- Der Spieler-Heimatplanet wird dem festen Eigentümer `faction-player-home` zugeordnet; jede KI-Zivilisation erhält genau ein eigenes Heimatsystem. Die Slots werden über `anchor = floor(systemCount · (index + 1) / (aiCivs + 1))` verteilt, Kollisionen über Offsets `[anchor, anchor + 1, anchor − 1, …]` auf noch herrenlose Systeme aufgelöst.
- Heimatplanet-Kriterien: kein Gasriese, keine tödliche Strahlung, Habitabilität ≥ `AI_HOME_MIN_HABITABILITY = 50`; Sortierung nach Habitabilität absteigend, dann `id` aufsteigend. Die Gründung nutzt unverändert `foundColony` (inkl. `colony:founded`), hebt die Kolonie anschließend auf Stufe `colony`, setzt `AI_HOME_POPULATION = 3000` samt neu berechnetem `growthFoodRequired` und simuliert die Ökonomie erneut; System-Owner, `colonized`-Status und `civ.homeSystemId` werden atomar nachgezogen.
- `AI_STARTING_TECHS` (`automated_assembly`, `advanced_metallurgy`) wird pro KI-Zivilisation idempotent vergeben — der Hook `grantAiStartingTechnologies` repariert damit auch Spielstände, die vor Stage B gespeichert wurden.
- `FleetManager.executeAiFleetTurn(civId, colonies, completedTechIds, turn)` ist zweiphasig: Phase 1 füllt je eigener aktiver Kolonie freie Werftdocks der Reihe nach mit dem ersten baubaren Muster aus `AI_SHIP_PRIORITY` (Korvette → Zerstörer → Kreuzer) über `queueShipBuild`; Phase 2 lässt jede stationierte, nicht leere eigene Flotte zyklisch zum nächsten eigenen System patrouillieren (`commandMoveFleet`). Bei weniger als zwei eigenen Systemen entfällt die Patrouille.
- Beide Schritte laufen im `endTurn` als Hook (1b) pro Nicht-Spieler-Zivilisation **vor** der Ökonomie- und Bauphase; frisch eingereihte Aufträge erhalten dadurch noch in derselben Runde Produktionspunkte.
- Es entstehen keine neuen Save-Felder und keine neuen Events; KI-Flotten nutzen `fleet:*`. KI-Kriegserklärungen waren in ADR-027 noch ausgeklammert; seit ADR-035 übernimmt der separate `AiDiplomacyManager` (Abschnitt 2.8j) Krieg und Frieden, sodass KI-Flotten auch ohne Spieleraktion aufeinandertreffen können.

### 2.8h Territoriumseinfärbung der Galaxiekarte (`src/ui/components/GalaxyMapCanvas.tsx`)
- Der Canvas erhält die optionale Prop `civilizations?: Civilization[]` (Default `[]`); `App.tsx` übergibt `engine.getCivManager().getCivilizations()` direkt. Es entsteht kein zusätzlicher State, keine Engine-Änderung und kein neues Save-Feld (ADR-029).
- `resolveOwnerCiv(ownerFactionId)` löst zuerst die exakte Zivilisations-ID auf; nur der Legacy-Wert `faction-player-home` fällt auf die Zivilisation mit `isPlayer` zurück. Eine gesetzte, unbekannte ID bleibt bewusst ohne Ring und erscheint im Tooltip als `Unbekannte Macht`.
- Je besessenem System werden drei Ebenen gezeichnet: ein radialer Territoriums-Halo bis `baseRadius · 6.5 + 12` (Alpha `0.2 → 0.09 → 0`), ein Besitzerring bei `baseRadius + 5.5` (Spieler durchgezogen, KI gestrichelt `[5, 3]`, Farbe `borderColor`) und der unverändert besitzunabhängige Besiedelt-Beacon bei `baseRadius + 10`. Auswahl- und Hover-Ringe bleiben bei `baseRadius + 14` und haben Vorrang.
- Labels besessener Systeme nutzen `civ.color` mit `◆`-Präfix; der Besitzername im Untertitel erscheint nur bei Auswahl oder `camera.zoom > 1`. Unten rechts erklärt eine Legende „Territorien" die Farben (ausgeblendet unterhalb des `md`-Breakpoints), und der Hover-Tooltip enthält eine `Territorium:`-Zeile mit den Fallbacks `Unbekannte Macht` bzw. `Niemandsland`.
- Die Kodierung ist rein darstellend: `StarSystem.ownerFactionId` bleibt die einzige Besitzwahrheit, Besitzvergabe und Kampflogik werden nicht berührt.

### 2.8i Systemansicht: Umlaufbahnen & Detailachse (`src/ui/systemViewLayout.ts`)
- `systemViewLayout.ts` ist ein reines Geometrie- und Hit-Test-Modul ohne Zeichenlogik. Canvas und Tests verwenden dieselben Funktionen, damit Darstellung und Klickziele nicht auseinanderlaufen (ADR-030).
- **Sortierung:** `sortPlanetsByDistance` ordnet nach `orbitDistanceAu`, bei Gleichstand nach `orbitIndex`, zuletzt nach `id`; die Eingabeliste wird nicht mutiert.
- **Detail-Layout:** `detailLayout(planets, viewportWidth, viewportHeight, scroll)` setzt den Stern auf `DETAIL_LEFT_MARGIN + DETAIL_STAR_RADIUS = 58` (y = Fenstermitte) und den ersten Planeten exakt auf `startX = Stern-x + Sternradius + DETAIL_STAR_GAP` (= 148). Die x-Positionen folgen `log1p(max(0, orbitDistanceAu))`; bei identischer Distanz wird gleichmäßig über `i / (count - 1)` verteilt, ein einzelner Planet sitzt bei `startX + naturalWidth * 0.45`.
- **Platzreservierung:** `naturalWidth = width - DETAIL_RIGHT_MARGIN - maxRadius - startX` reserviert bereits den größten Planetenradius. Dadurch entsteht ein Scrollbalken nur bei echtem Überlauf durch `DETAIL_MIN_GAP` (132 px), nicht bei normalen Systemen. Anschließend werden Mindestabstände sequenziell erzwungen; `contentWidth = max(width, letzte x + letzter Radius + DETAIL_RIGHT_MARGIN)`, `maxScroll = max(0, contentWidth - width)`.
- **Radien:** `detailPlanetRadius` liefert zoomunabhängig 14–36 px und skaliert Gasriesen um 1.3; `planetVisualRadius` bleibt die Orbitansicht (Zoomfaktor, Gasriesen 1.45).
- **Monde:** `moonOrbitRadius` und `moonOrbitAngle` liefern die Punktgeometrie für echte Monde. In beiden Ansichten werden maximal vier Begleiter gezeichnet (Hauptmonde zuerst), Überzählige als `+N`; Planeten ohne `moons`-Array fallen auf die alte `moonsCount`-Punktreihe zurück.
- **Asteroidengürtel:** `beltOrbitRadius`, `beltOrbitLabel`, `beltRingHalfWidth` und `computeBeltOrbitRings` bilden Gürtel als Ringe in der Orbitansicht ab; `detailBeltPosition` platziert Gürtelbänder zwischen den Planeten der Detailachse. Die Ringradien fließen in die Kamera-Grenzen ein, damit äußere Gürtel sichtbar bleiben.
- **Scroll & Auswahl:** `clampDetailScroll` klemmt inklusive negativer Werte und `NaN`; `findScrollForPlanet` zentriert die Auswahl auf 45 % der sichtbaren Breite (`layout.contentWidth - layout.maxScroll`) und klemmt am Rand. `hitTestPlanets(placements, point, extraRadius = 4)` wählt bei Überlappung den nächstgelegenen Treffer; der Canvas nutzt 12 px Toleranz und dieselbe Trefferliste wie das Rendering.
- **Canvas-Integration:** `SystemMapCanvas` hält den Modus in einem State, der aus einem modulweiten `preferredViewMode` initialisiert wird, und bietet ein Segmented-Control „Umlaufbahnen"/„Detailansicht". Der Wechsel löscht nur den Hover; Rundenstand, Orbitphase (`isOrbiting` läuft in beiden Modi weiter), Auswahl und Engine-Zustand bleiben unberührt.
- **Auswahlbrücke:** `onSelectPlanet` akzeptiert `Planet | null`; ein Klick ins Leere ruft `engine.selectPlanet(null)` auf. `PlanetInspector` listet die Planeten über dieselbe Sortierung, damit Liste und Achse dieselbe Reihenfolge zeigen.
- Die Ansicht selbst erzeugt keine zusätzlichen Save-Felder; die Sitzungspräferenz ist bewusst nicht persistiert. Monde und Gürtel sind dagegen Teil des Spielzustands und werden über den Spielstand (Save v5) persistiert.

### 2.8j Deterministische KI-Diplomatie (`src/core/aiDiplomacyManager.ts`)
- Der `AiDiplomacyManager` ist zustandslos und erhält im Konstruktor nur den `DiplomacyManager`; alle Beziehungen bleiben dort die einzige Wahrheit. `executeTurn(currentTurn, civs)` arbeitet auf einem pro Runde in `GameEngine.buildAiDiplomacySnapshot()` erzeugten Snapshot `{ id, isPlayer, colonyCount, militaryStrength }`, wobei `militaryStrength = Math.round(Σ attack + hull)` aller Flotten ist.
- Der Rundenakt läuft in `endTurn` als Schritt **1c** — nach der KI-Flotten-Schleife (1b) und vor der globalen Simulationsphase. Frieden wird zuerst geprüft, Kriegserklärungen nur an Prüftagen (`isWarCheckTurn`: Runde ≥ `AI_DIPLOMACY_GRACE_TURNS = 12` und `(turn − 12) % 4 === 0`).
- Kriegserklärung setzt ein zulässiges Ziel voraus: kein Spieler, mindestens eine Kolonie, nicht bereits im Krieg, eigener Kriegszähler unter `AI_MAX_WARS_PER_CIV = 1`, eigene Stärke ≥ `AI_MIN_MILITARY_STRENGTH = 80` und mindestens `AI_WAR_STRENGTH_RATIO = 1.2`-fache Zielstärke. Gewählt wird das schwächste zulässige Reich mit ID-Tiebreak; nach der ersten erfolgreichen Erklärung bricht die Prüfung global ab, sodass pro Prüftag höchstens ein KI-Krieg entsteht.
- Frieden schließt eine KI, wenn die schwächere Seite mindestens `AI_PEACE_MIN_WAR_TURNS = 6` Runden Krieg führt oder eine KI-Seite `AI_MAX_WAR_TURNS = 18` Runden erreicht; danach gilt ein Cooldown von `AI_PEACE_COOLDOWN_TURNS = 10` Runden für dasselbe Paar. Der Spielerfrieden bleibt an die bestehende `PEACE_MIN_WAR_TURNS`-Regel gebunden.
- Ergebnisse werden als `{ declaredWars, peaceTreaties }` frisch zurückgegeben; Ereignisse bleiben `diplomacy:war-declared`/`diplomacy:peace-made` aus dem `DiplomacyManager`. Es entstehen keine neuen Save-Felder (Save v5) und keine Invasionslogik — KI-Kriege wirken nur über `resolveBattles` bei Co-Location verfeindeter Flotten (ADR-035).

### 2.8k Durchgehende Territoriumsgrenzen (`src/ui/territoryBorders.ts`)
- `computeTerritoryBorders(sites, options?)` ist ein reines Geometriemodul ohne Canvas-Bezug (ADR-036). Eingabe ist eine Liste `TerritorySite` (`id`, `x`, `y`, `ownerFactionId`); Systeme ohne Besitzer werden ignoriert, ebenso Paare mit identischem Besitzer.
- Für jedes Nachbarpaar unterschiedlicher Besitzer wird die Mittelsenkrechte der Verbindungslinie als Grenzkandidat gebildet und anschließend mit einem Quadrat um beide Systeme geclippt (`DEFAULT_TERRITORY_CLIP_RADIUS = 160`, Sutherland-Hodgman gegen **alle** Systeme, `EPSILON = 1e-7`). Dadurch endet eine Grenze nie in der Mitte zwischen zwei weit entfernten Systemen, sondern nur zwischen tatsächlichen Nachbarn.
- Jedes Paar liefert höchstens ein Segment: Die Dedupe läuft über die kleinere System-ID als Schlüssel, sodass dieselbe Grenze nicht doppelt gezeichnet wird. Segmente unterhalb `DEFAULT_TERRITORY_MIN_SEGMENT_LENGTH = 0.5` entfallen; die Ausgabe wird über `compareSegments` (Startpunkt, Endpunkt, Besitzer) deterministisch sortiert.
- Die Segmente tragen `ownerFactionId` und `otherOwnerFactionId`, damit der Canvas beide Seiten verschiedenfarbig zeichnen kann. Es entstehen keine Spieldaten: `StarSystem.ownerFactionId` bleibt die einzige Besitzwahrheit, es gibt keine Save-Felder und keine Engine-Änderung.
- **Canvas-Integration:** `GalaxyMapCanvas` berechnet die Grenzen in einem `useMemo` über `galaxy.systems` (Kommentar „Grenzverlauf nur neu berechnen, wenn sich die Systeme selbst ändern.") und zeichnet sie im Layer „3a. Draw Territory Borders" vor den Handelsrouten. Pro Segment entstehen zwei senkrecht versetzte Striche (±0,9 px) in den Farben der beiden Besitzer (Alpha `0.55`, Fallback `rgba(148, 163, 184, 0.4)`), `lineWidth = max(1, 1.1 * camera.zoom)` und `lineCap = 'round'`; `ctx.save()`/`ctx.restore()` kapseln den Stil.
- **Bekannte Einschränkung:** Jedes Segment wird als Gerade zwischen zwei Clip-Punkten gezeichnet; es gibt keine Glättung, keine Animation und keine Darstellung umkämpfter Systeme oder Einflussradien über mehrere Systeme.

### 2.8l Privatsektor (`src/core/privateSectorManager.ts`)
- `PrivateSectorManager` ist ein zustandsarmes Modul (ADR-039): Es hält nur den Bericht der letzten Runde, alle Kennzahlen sind statische, pure Funktionen. Es gibt keine privaten Schiffe, Routen oder Save-Felder.
- Handelsvolumen je Kolonie: `round1(Bevölkerungs-Einheiten · 6 · Stufenfaktor · Zufriedenheit/100)` mit `0,5 / 1 / 1,5` für `outpost` / `settlement` / `colony`. Die Zufriedenheit wird über `EconomyEngine.calculateApproval` aus Steuersatz und Stufe abgeleitet, nicht aus `colony.approval` gelesen.
- Handelssteuer: `round1(Volumen · 0,25)` je Kolonie, je Zivilisation summiert und in `endTurn` einmal der Staatskasse gutgeschrieben.
- Umverteilung: Je Zivilisation und Ressource (`food`, `minerals`, `rareResources`) geben aktive Kolonien oberhalb der Reserve `60/60/25` ab und füllen Empfänger unter `40/40/15` auf. Die gemeinsame Kapazität jeder Kolonie beträgt `max(1, Bevölkerungs-Einheiten · Stufenfaktor)` Einheiten pro Runde über alle Güter (`outpost 1`, `settlement 2`, `colony 3`). Beträge sind ganzzahlig, Güter bleiben erhalten.
- Determinismus: Zivilisationen nach ID, Kolonien nach ID, Ressourcen in fester Reihenfolge, Geber nach Überschuss absteigend, Empfänger nach Bestand aufsteigend, jeweils mit ID-Tiebreak.
- Integration: Der Schritt „B2. Privatsektor" läuft nach der Ökonomie- und vor der Logistikphase; „B3. Staatskasse" addiert die Handelssteuer. `GameEngine.getPrivateSectorReport(civId)` liest den letzten Bericht; `clear()` verwirft ihn bei Galaxiewechsel und nach dem Laden.
- UI: Privatsektor-Streifen in `PlanetsOverviewModal` (Volumen, Steuer, Kapazität, letzte Umverteilung) und Handelssteuerzeile in der Finanzkachel des `ColonyManagementModal`.
- **Bekannte Einschränkung:** Keine Preise, Märkte oder Handelsgüter; zivile Fracht reist ohne Reisezeit und ohne Fahrzeuge. Der Steuersatz ist mit 25 % fest im Code, und KI-Reiche treffen keine eigenen Privatsektor-Entscheidungen.

### 2.8m Startflotte & Kolonisationslogistik (`src/core/startingFleet.ts`, `src/core/colonizationRules.ts`)
- `STARTING_SHIPS` beschreibt die drei Startverbände (Kleine Fregatte, Aufklärungsschiff, Kolonieschiff); `createStartingFleets(civId)` erzeugt drei getrennte `Fleet`-Objekte mit deterministischen IDs `fleet_<civId>_start_<key>` in `galaxy.systems[0]`. Getrennte Verbände sind einzeln auswählbar und werden getrennt gezeichnet (ADR-043).
- Kolonisten und Gründungsgüter liegen ausschließlich in `Fleet.cargo` (`FleetCargo`); es gibt keine Gutschrift in einem globalen Lager und keine automatische Kolonie beim Spielstart.
- `COLONIZATION_SUPPLY`, `checkColonySupply()` und `ColonizationValidator` bündeln die Prüfungen: Vermessung, Habitabilität und ausreichende Fracht. `GameEngine.foundColony()` wendet sie auf den Spielerpfad an, verbraucht bei Erfolg das Kolonieschiff und entfernt es aus dem System; `ColonyManager.foundColony()` bleibt über den optionalen neunten Parameter `ColonyFoundingSupply` für die KI permissiv.
- `GameEngine.provisionColonyShip(systemId, cargo?)` ist die öffentliche Bereitstellungs-API; `getColonyShipForSystem()` und `consumeColonizationSupply()` kapseln Suche und Verbrauch.
- **Bekannte Einschränkung:** Es gibt kein Nachladen eines vorhandenen Kolonieschiffs; es wird entweder verbraucht oder bleibt mit seiner Fracht stationiert.

### 2.8n Benachrichtigungssystem (`src/core/notificationCenter.ts`, `src/core/notificationBridge.ts`, `src/core/messageLog.ts`)
- `NotificationCenter` ist die einzige Senke für Abschluss- und Warnmeldungen (ADR-044). Eine Meldung besteht aus ID, Kategorie, Text, stabilem Schlüssel, Runde und Zeitstempel; `push()` verwirft Duplikate mit demselben aktiven Schlüssel, `NOTIFICATION_LIMIT = 8` verdrängt die ältesten Einträge.
- Der Kern kennt keine Timer und keine React-Abhängigkeit. `subscribe()`, `dismiss()` und `clear()` liefern Momentaufnahmen; die Darstellung entscheidet über Ablaufzeiten.
- Seit ADR-052 gilt eine einheitliche Anzeigedauer `NOTIFICATION_TTL_MS = 10_000` für alle Kategorien; `STICKY_CATEGORIES` ist leer. Der Timer hängt nur an der stabilen Meldungs-ID, damit wechselnde Callback-Identitäten ihn nicht neu starten.
- `MessageLog` ist der persistente, vom Popup getrennte Verlauf. `push()` dedupliziert über denselben Schlüssel wie das Center, `markRead`/`markUnread`/`markAllRead` verwalten den Status, `MESSAGE_LOG_LIMIT = 250` begrenzt den Speicher. `loadSnapshot()` lädt in dasselbe Objekt, damit UI-Abonnements stabil bleiben.
- `attachNotificationBridge(center, eventBus, resolvers)` übersetzt `turn:changed`, `system:surveyed`, `planet:surveyed`, `colony:founded`, `colony:failed`, `hex:claimed`, `build:queued`, `build:completed`, `unit:recruited`, `research:completed`, `colony:tierChanged`, `fleet:ship-built`, `fleet:arrived` sowie die Narrativ- und Reichsereignisse. Alle Meldungen tragen Betreff und optional ein Zielobjekt (`system`, `planet`, `colony`, `fleet`, `research`, `faction`). Eine zentrale `record`-Senke schreibt zuerst ins Center und nur bei Annahme in den Verlauf; dadurch entstehen keine Duplikate. `game:loaded` leert Popup und Verlauf; Ereignisse fremder Zivilisationen werden anhand `playerCivId` verworfen.
- Bau-, Rekrutierungs- und Schiffsbaumeldungen tragen die Runde im Schlüssel: derselbe Auftrag darf in einer späteren Runde erneut melden, ein erneutes Laden erzeugt aber keine Dublette.
- `GameEngine.emitBuildCompletion()` wird in `endTurn` nach `BuildQueueManager.advanceQueue()` aufgerufen und erzeugt `build:completed` bzw. `unit:recruited`; KI-Kolonien werden dabei gefiltert.
- Die UI (`NotificationStack.tsx`) zeigt einen vertikalen, überlappungsfreien Stapel mit einheitlicher 10-Sekunden-Frist und Schließen-Knopf. Manuelle Hinweise aus `App.tsx` laufen über `notify(...)` in dasselbe Center und werden bei Annahme zusätzlich in den Verlauf geschrieben, damit auch abgelaufene Popups nachlesbar bleiben. Startwarnungen der KI-Platzierung erscheinen nach dem Galaxiewechsel auf demselben Weg. `MessageLogModal.tsx` bietet Kategorie-Filter, „nur ungelesen", Ziel-Navigation und „Alle gelesen".

### 2.8o Reichsverwaltung & innere Fraktionen (`src/core/empireManager.ts`)
- `EmpireManager` hält je Zivilisation einen `EmpireState` mit Governance-Politik, Cooldown und den drei Fraktionen `industrialists`, `scientists` und `militarists`. Die Fraktionen starten mit Einfluss 34/33/33 und Loyalität 50; `balanced` ist der neutrale Standard (ADR-046).
- Kennzahlen werden aus einem `EmpireSnapshot` abgeleitet: Kolonien, gewichtete Verwaltungslast, Distrikte, Bevölkerung, Produktion/Forschung pro Kopf, durchschnittlicher Steuersatz, Flottenstärke, Kriege, Handelsrouten, abgeschlossene Technologien und Staatskasse. `buildEmpireSnapshot()` erzeugt ihn aus den Kolonien und optionalen Kennzahlen.
- `getAdministration()` berechnet `capacity = 4 + floor(Techs/2) + floor(Staatskasse/1500)` und `load = Koloniestufen (1/2/3) + ceil(Distrikte/4)`. Overextension senkt die Effizienz (`max(0,5; 1 − 0,1 · Overextension)`) und die Zustimmung (`min(10; 2 · Overextension)`).
- `getModifiers()` liefert Produktions-, Forschungs- und Einflussmultiplikatoren sowie einen Zustimmungsmodifikator. `industry` gibt Produktion ×1,15, `science` Forschung ×1,15, `military` Einfluss ×1,15 und Produktion ×1,05; Zustimmungsabzüge −3/−3/−2. Die gewichtete Loyalität moduliert die Zustimmung um −5 bis +5, eine dominante Fraktion (Einfluss ≥ 40, Loyalität ≥ 60) verstärkt ihren Schwerpunkt um 5 %.
- `setPolicy()` prüft Politik, Gleichheit und den Cooldown von `EMPIRE_POLICY_COOLDOWN_TURNS = 5`; `advanceTurn()` bewertet alle Reiche deterministisch in `civId`-Reihenfolge. Die neue Loyalität ist ein 50/50-Mittel aus altem Wert und Zielwert, der Einfluss wird 70/30 fortgeschrieben und auf 100 normiert. KI-Reiche wechseln alle zehn Runden zur Politik ihrer dominanten Fraktion.
- Unruhe unter 30 Loyalität erzeugt `empire:faction-unrest`; ab 40 wird sie über `empire:faction-recovered` beigelegt. Die Meldungsbrücke entfernt die zugehörige Warnung per stabilem Schlüssel.
- `GameEngine.endTurn()` berechnet die Modifikatoren vor der Ökonomie aus dem Zustand der letzten Runde und ruft `advanceTurn()` nach Kämpfen und vor dem Auto-Save auf. Der erste Rundenwechsel bleibt dadurch neutral. `empireStates` ist ein optionales Save-Feld; `CURRENT_SAVE_VERSION` bleibt 4.
- **Bekannte Einschränkung:** Fraktionen haben keine eigenen Aktionen oder Wahlen; Unruhe wirkt nur über Loyalität und Zustimmung. Die Zielwerte sind nicht an langen Partien kalibriert.

### 2.8p Narrative Ebene & Galaxiegeschichte (`src/core/narrativeManager.ts`, `src/data/narrativeEvents.ts`)
- `NarrativeManager` bündelt drei Bausteine je Zivilisation bzw. Galaxie: dynamische Ereignisse, Ausgrabungsstätten und genau eine galaktische Krise (ADR-047). Das Modul ist React- und EventBus-frei; `GameEngine` bucht Credits, Forschung und Fraktionsloyalität.
- **Ereignisse:** `src/data/narrativeEvents.ts` enthält acht einmalige Ereignisse mit je drei Entscheidungen. Die Auswahl filtert nach `minTurn`, Chronik und Flags und zieht gewichtet über `SeededPRNG(seed:narrative:civId:turn)`. Nur das Spieler-Reich erhält offene Entscheidungen; die Chronik speichert höchstens 40 Einträge. Negative Credit-Wirkungen werden vor dem Entschluss geprüft, unbekannte oder unbezahlbare Entscheidungen lassen das Ereignis offen.
- **Ausgrabungsstätten:** `generateExcavationSites` bevorzugt Planeten mit `anomalyDetected`, füllt bei Bedarf mit Nicht-Gasriesen auf und erzeugt höchstens zwölf deterministische Stätten. Eine Stätte wird erst nach einer vollständigen Planetenanalyse aufgedeckt; pro Reich ist höchstens eine Grabung aktiv. Start kostet 75 ◈, der Fortschritt ist `clamp(5 + floor(Forschung/Runde / 10), 5, 25)`, der Abschluss vergibt Credits und Forschung und setzt `excavation_completed`.
- **Krise:** Start ab Runde 40 oder nach zwei abgeschlossenen Ausgrabungen, sofern das Spieler-Reich mindestens eine Kolonie besitzt. Stufen `signal → awakening → resolution → resolved` wechseln alle acht Runden. Eindämmung kostet 150 ◈ und bringt 20 Fortschritt; ab 60 endet die Krise als `contained`, sonst als `ignored`.
- `getCrisisModifiers()` liefert neutrale Werte vor dem Ausbruch und stufenabhängige Produktions-/Forschungs-/Zustimmungsmodifikatoren. `GameEngine.getCombinedModifiers()` multipliziert sie mit den Reichsmodifikatoren; die narrative Phase läuft nach der Ökonomie und vor der Reichsbewertung sowie dem Auto-Save.
- **Persistenz:** `SaveGameData.narrative` ist optional (`civStates`, `sites`, `crisis`); `CURRENT_SAVE_VERSION` bleibt 4. Beim Laden werden ungültige Stufen, Flags, IDs und Zahlen normalisiert; fehlende narrative Daten erzeugen neue Stätten und Standardzustände.

### 2.8q Sieg, Niederlage & Punktewertung (`src/core/victoryManager.ts`)
- `VictoryManager` ist React-frei und wertet einen `VictorySnapshot` aus: je Reich Kolonien, besiedelte Systeme, Bevölkerung, abgeschlossene Technologien, Staatskasse, Flottenstärke, abgeschlossene Ausgrabungen sowie Krisenstufe und -ausgang.
- **Siege:** `domination` (≥ 60 % der besiedelten Systeme und ≥ 8 eigene Kolonien), `science` (drei Tier-4-Technologien) und `narrative` (drei Ausgrabungen und Krise `contained`). **Niederlage:** `elimination`, sobald ein Reich mit früherer Kolonie keine mehr besitzt. Geprüft wird Niederlage → Dominanz → Transzendenz → Chronik.
- **Einfrieren:** Nach dem ersten Ergebnis bleibt `GameOutcome` unverändert (Status, Bedingung, Runde, Punkte); nur `peakColonyCount` wächst weiter. Dadurch bleibt ein geladener Endstand reproduzierbar.
- **Punkte:** Kolonien 50, je 1.000 Bevölkerung 1, Technologie 10, je 10 Flottenstärke 1, je 100 ◈ 1, Ausgrabung 25, eingedämmte Krise 75. `buildRanking()` sortiert alle Reiche nach Punkten, Kolonien, Technologien und `civId`.
- **Engine-Integration:** `GameEngine.endTurn()` wertet als Schritt 2.6 nach Narrativ und Reichsverwaltung aus und speichert das Ergebnis im Auto-Save. Die Auswertung bucht keine Ressourcen; der erste Rundenwechsel bleibt neutral.
- **Persistenz:** `SaveGameData.outcome` ist optional; seit ADR-052 ist Save-Version 5. Altstände starten offen, ungültige Ausgänge werden verworfen, `peakColonyCount` wird beim Laden auf mindestens die aktuelle Koloniezahl gehoben.
- **UI:** `EndScreen` zeigt Sieg/Niederlage, Bedingung, Runde, Punkteaufschlüsselung und Rangliste; nach einem Sieg ist die Partie als Sandbox fortsetzbar. `VictoryModal` („Menü → Ziele & Punkte") zeigt die drei Bedingungen mit Fortschrittsbalken, Punkte und Rangliste. `App.tsx` wechselt nach Rundenwechsel oder Laden eines Endstands in den Modus `gameOver`.

### 2.8r Menschliche Fraktionen, Startplatzierung und Flottensteuerung (ADR-052)
- **Fraktionskatalog (`src/data/factionCatalog.ts`):** Acht Fraktionen mit stabilen `HumanFactionId`s (`thulea`, `hesperia`, `fusang`, `sibiria`, `columbia`, `alkebu`, `moana`, `levantia`), Name, Kurzprofil, Hintergrundgeschichte, visueller Identität, Farbe/Randfarbe, Emblem, Heimatregion und Flottenstil. Die Mechanik bleibt für alle gleich; es werden keine Boni erfunden. `pickAiFactionIds(seed, playerFactionId, count)` mischt die übrigen sieben deterministisch über `SeededPRNG`, schließt die Spielerfraktion aus und liefert exakt 0–7 eindeutige IDs. `buildFactionAssignments()` erzeugt die Spielerzuweisung `player-empire` plus `civ-<factionId>`.
- **Startplatzierung (`src/generation/startPlacement.ts`):** Der Spieler behält System 0. `ensurePlayerHomeHabitability()` prüft mit derselben `HabitabilityEvaluator`-Logik wie die Kolonisation; fehlt ein geeigneter Planet, werden ausschließlich die Planeten dieses Systems mit abgeleitetem Seed neu erzeugt (Gürtel des Systems entfallen), mindestens vier Bahnen bei leerem System. Als letzte Rückfallebene wird ein Planet deterministisch habitabel gesetzt. Es wird keine Kolonie gegründet. `selectAiHomeSystems()` wählt KI-Starts gierig nach maximaler minimaler Hyperlane-Distanz; Wunsch `max(2, min(6, floor(systemCount/10)))`, Lockerung mit Warnung über `getStartPlacementWarnings()`.
- **Antrieb (`src/core/propulsion.ts`):** `getPropulsionRange()` leitet die Hyperlane-Sprünge pro Runde aus vorhandenen Techs ab (`fusion_reactors` 2, `gravitic_engineering` 3, `zero_point_physics` 4), Basis 1. `FleetManager.advanceTurn(..., rangeHopsForCiv)` nutzt den Wert; der bisherige Ein-Sprung-Standard bleibt. `normalizeRangeHops()` fängt fehlende, negative oder nicht-endliche Werte ab, `turnsForHops()` liefert die aufgerundete Rundenzahl für die ETA (ADR-053).
- **Flottenbefehle (`src/core/fleetManager.ts`):** `previewRoute()` und `canReachSystem()` prüfen ohne Nebenwirkung; `retargetFleet()` berechnet die Route ab dem aktuellen System neu; `cancelFleetMovement()` stoppt den Verband im aktuellen System. `fleet:movement-cancelled` ist ein neues Event. Ein zweiter Bewegungsauftrag während eines Flugs bleibt abgewiesen. Seit ADR-054 führt `moveFleetNow()` den Auftrag sofort bis zur Reichweite aus; `src/ui/routePlanning.ts` liefert die testbaren Entscheidungen des Planungsmodus.
- **Sichtbarkeit:** `GameEngine.getVisibleFleetsForSystem()` zeigt eigene Verbände immer, fremde nur in Systemen mit `discoveryStatus !== 'unexplored'`. Beide Systemansichten und die Galaxiekarte lesen dieselben `Fleet`-Objekte.
- **Schiffsdarstellung:** `src/ui/shipAssets.ts` ordnet die vorhandenen JPEGs unter `Tilesets/Raumschiffe` den Klassen zu (`Kolonie.jpg`, `Forschung.jpg`, `Fregatte.jpg`); Korvette, Zerstörer und Kreuzer nutzen die Fregatte als dokumentierten Fallback. `src/ui/systemFleetLayout.ts` platziert Marker außerhalb der äußersten Planetenbahn bzw. in der oberen Leiste der Detailansicht und liefert den Hit-Test. `ShipInfoBar.tsx` zeigt nur vorhandene Werte.
- **Kamera:** `src/ui/galaxyCamera.ts` kapselt `computeGalaxyCamera`, `focusCameraOn` und `galaxyCameraKey`. `GalaxyMapCanvas` setzt die Kamera nur bei neuem `galaxyCameraKey` zurück; Datenrefreshs mit derselben Galaxie-ID ändern Zoom und Position nicht mehr.
- **Nachrichtenverlauf & Speicherung:** `MessageLog` wird über die Brücke gespeist, in `SaveGameData.messageLog` gespeichert und überlebt Galaxiewechsel durch `clear()` statt Neuinstanz. `CURRENT_SAVE_VERSION = 5` ergänzt `messageLog`, `stations` und `galaxy.factionAssignments`; die v4→v5-Migration füllt fehlende Felder deterministisch, ohne Zivilisationen oder Galaxie neu zu erzeugen.

### 2.9 Turn System (`src/core/TurnManager.ts`)
- Verwaltet die Spielrunden unabhängig von Darstellungsmodi.
- Erhöht die Runde kontrolliert um exakt 1.
- Berechnet die galaktische Zeitrechnung (`2380.01`).
- Bietet Listener-Hooks (`registerTurnHook`) sowie globale Benachrichtigungen über den EventBus.

### 2.10 Event System (`src/core/EventBus.ts`)
- Stark typisierter Publish/Subscribe-Bus.
- Ereignisse:
  - `turn:changed`: Aktuelle und vorherige Runden, Datumsstring.
  - `system:selected`: Ausgewähltes Sternensystem.
  - `system:surveyed`: System-Aufklärung.
  - `planet:selected`: Ausgewählter Planet.
  - `planet:surveyed`: Planetare Spektralanalyse / Sonden-Scan.
  - `colony:founded`: Erfolgreich gegründete Kolonie.
  - `colony:failed`: Abgelehnte Koloniegründung mit Begründung.
  - `colony:taxRateChanged`: Geänderter Steuersatz einer Kolonie.
  - `view:changed`: Umschalten zwischen `'galaxy'`, `'system'` und `'surface'`.
  - `unit:selected`: Ausgewählte Oberflächeneinheit.
  - `galaxy:generated`: Neue Galaxie generiert.
  - `terraforming:started` / `terraforming:progress` / `terraforming:completed` / `terraforming:cancelled`: Klimaprojekte.
  - `logistics:route-created` / `logistics:route-removed` / `logistics:transfer`: Frachterrouten und Transfers.
  - `galactic-trade:route-created` / `route-removed` / `convoy-departed` / `convoy-arrived` / `transfer`: Interstellare Handelsrouten und Konvois.
  - `galactic-trade:route-tariff-changed` / `route-escorts-changed` / `route-blockaded` / `route-unblockaded`: Zoll-, Eskorten- und Blockadeänderungen (ADR-038).
  - `fleet:created` / `fleet:ship-built` / `fleet:movement-started` / `fleet:arrived` / `fleet:removed`: Flottenerzeugung, Schiffsfertigstellung, Bewegungsstart, Ankunft und Auflösung.
  - `build:completed` / `unit:recruited`: abgeschlossener Bau- bzw. Ausbauauftrag und fertig rekrutierte Oberflächeneinheit (ADR-044); von `GameEngine.emitBuildCompletion()` erzeugt.
  - `district:placed` / `district:removed`: Platzierung bzw. Abriss eines Distrikts.
  - `diplomacy:war-declared` / `diplomacy:peace-made`: Kriegserklärung und Friedensschluss zwischen zwei Zivilisationen.
  - `empire:policy-changed` / `empire:faction-unrest` / `empire:faction-recovered`: Politikwechsel, Fraktionsunruhe und beigelegte Unruhe (ADR-046).
  - `narrative:excavation-discovered` / `excavation-started` / `excavation-completed`: Aufdeckung, Beginn und Abschluss einer Ausgrabungsstätte (ADR-047).
  - `narrative:event-pending` / `narrative:event-resolved`: offene Entscheidung und getroffene Wahl (ADR-047).
  - `narrative:crisis-started` / `crisis-stage` / `crisis-contained` / `crisis-resolved`: Beginn, Stufenwechsel, Eindämmungsbeitrag und Ausgang der galaktischen Krise (ADR-047).
  - `game:saved` / `game:loaded`: Persistenzereignisse.

### 2.11 Generation Module (`src/generation/`)
- **`SeededPRNG`**: 32-Bit Mulberry32-Algorithmus. Garantiert deterministische Zufallszahlen auf Basis von Seeds.
- **`StarNameGenerator`**: Generiert abwechslungsreiche, authentische Sci-Fi-Sternennamen.
- **`GalaxyGenerator`**: Setzt Konfiguration in Galaxiedaten um, implementiert Mindestabstände und berechnet Hyperlanes. Zusätzlich erzeugt `generateAsteroidBelts` pro System aus dem eigenen Seed `${galaxySeed}:${systemId}:belts` null bis zwei Gürtel in den Lücken der sortierten Planeten; Roll `< 0.45` ergibt einen, `< 0.6` zwei Gürtel, sonst keinen. `innerAu`/`outerAu`/`midpointAu`, `density` (0,35–0,85) und `composition` sind deterministisch; die bestehende Systemgenerierung bleibt unverändert.
- **`PlanetGenerator`**:
  - Nutzt isolierte, deterministisch abgeleitete Seeds (`${galaxySeed}:${systemId}:planets`).
  - Verhindert, dass das Untersuchen oder Erzeugen eines Systems die Zufallszustände anderer Systeme beeinflusst.
  - Berechnet habitable Zonen abhängig von der Leuchtkraft des Sterns ($d_{hab} \sim \sqrt{L_\odot}$).
  - Berechnet Keplerianische Umlaufzeiten ($T \sim \sqrt{a^3 / M_\odot} \times 365\text{ Tage}$).
  - Berechnet physikalische Umweltparameter und Basis-Habitabilität.
  - Erzeugt echte Monde über `generateMoons` mit eigenem Seed `${galaxySeed}:${systemId}:${planetId}:moons`: 0–14 Begleiter, Hauptmond-Regel für Gasriesen, Typ (`rocky`, `icy`, `volcanic`, `metallic`), Radius, Umlaufzeit und Farbe. `Planet.moons` ergänzt das bestehende Kompatibilitätsfeld `moonsCount`, ohne dessen Bedeutung zu ändern.

### 2.12 Save System (`src/save/saveManager.ts`)
- Versioniertes Speicherformat (`CURRENT_SAVE_VERSION = 5`).
- Migration von v1-Spielständen (ergänzt Zivilisationen, Oberflächen und Forschungsstände).
- Migration von v2-Spielständen: ergänzt pro System `asteroidBelts` und pro Planet `moons`; Legacy-Monde werden deterministisch aus `moonsCount` abgeleitet (`createLegacyMoons`), ohne Zufall und ohne bestehende Planeten zu verändern.
- Migration von v3-Spielständen: ergänzt `Civilization.treasury` (Fallback 500/300) und die Koloniefinanzfelder `taxRate`, `corruption`, `approval`, `taxRevenue` über `EconomyEngine` mit `developmentTier ?? 'outpost'` als Stufenfallback.
- Migration von v4-Spielständen (ADR-052): ergänzt `messageLog` (leer), `stations` (leer) und `galaxy.factionAssignments`. Die Zuweisung wird aus den vorhandenen Zivilisationen deterministisch abgeleitet, ohne doppelte Fraktionen; Galaxie und Zivilisationen bleiben unverändert.
- Validierung bei der Deserialisierung (Schutz gegen inkonsistente Schemas, Ablehnung neuerer Versionen).
- Serialisiert Galaxie-, Planeten-, Monde-, Gürtel-, Kolonie-, Oberflächen-, Einheiten-, Forschungs- und Zivilisationsdaten vollständig inklusive Staatskasse und Koloniefinanzen.
- Serialisiert Flotten inklusive `Fleet.cargo`, optionale `empireStates`, narrative Daten, `messageLog`, `stations` und `galaxy.factionAssignments`. Fehlende optionale Felder bleiben lesbar und werden migriert.
- **Keine Neugenerierung beim Laden (ADR-042):** Der Spielstand enthält die vollständige Galaxie; `restoreFromSaveData()` übernimmt Systeme und Planeten unverändert und greift nicht auf `GalaxyGenerator` oder `PlanetGenerator` zu. Nur fehlende Planetenfelder älterer Stände werden wie bisher ergänzt.
- **Seed-Bibliothek (`src/save/seedLibrary.ts`):** speichert bis zu `MAX_SEED_ENTRIES = 100` Konfigurationen unter `astraea_4x_seed_library`. Ein Eintrag enthält ID (`seedConfigSignature` aus Seed, Größe, Form, Systemanzahl, Breite, Höhe und Mindestabstand), Name, Seed, `GalaxyConfig`, erzeugte Systemanzahl, `generatorVersion`, `surfaceGeneratorVersion`, `createdAt` und `lastStartedAt`. Sie ist eine Beschreibung von Konfigurationen, kein Ersatz für den Spielstand.
- Abwärtskompatibel mit vorherigen Spielständen.

### 2.13 UI Module (`src/ui/`)
- **`MainMenu`**: Startbildschirm mit Neues Spiel, Spiel laden, Galaxie-Seeds verwalten, Roadmap, QA-Tests, Testing und Spiel beenden sowie Schnellspeicher-Kachel und „Mit diesem Seed fortfahren" (ADR-041). `App.tsx` schaltet über `appMode` zwischen `menu`, `creation`, `game`, `gameOver`, `ended` und `testing`.
- **`GalaxyCreationScreen`**: zwei Wege – „Neue Galaxie erschaffen" mit den bestehenden Generatorparametern und „Mit bestehendem Seed fortfahren" mit der Seed-Bibliothek (ADR-042). `SeedLibraryModal` verwaltet, benennt und entfernt Einträge.
- **`NotificationStack`**: überlappungsfreier vertikaler Stapel aus `NotificationCenter`-Meldungen mit einheitlicher 10-Sekunden-Frist, Schließen-Knopf und stabilen Timern (ADR-044, ADR-052).
- **`MessageLogModal`** / **`MessageLog`**: gespeicherter Nachrichtenverlauf mit Kategorie-Filter, „nur ungelesen", Betreff, Text, Runde/Zeit, Zielobjekt und Gelesen-Status; über „Menü → Nachrichtenverlauf" in der `TopNavBar` auf Wunsch geöffnet und über das Kreuz, den Hintergrund oder Escape geschlossen (ADR-052).
- **`TopNavBar`**: 3-Zonen-Header (Brand · Navigation mit Schnellwechsel Galaxy/System/Oberfläche · Rundenwechsel-Aktion & Koloniezähler); das Spielmenü enthält Nachrichtenverlauf, Speicherstände, Hauptmenü und Spiel beenden; ein Zähler am Menüknopf zeigt ungelesene Meldungen. Der „Chronik"-Knopf zeigt offene Ereignisse und aktive Krisen an (ADR-047).
- **`GalaxyMapCanvas`**: 2D-Canvas der Galaxie mit Pan/Zoom, Hyperlanes, Retikeln, Kolonie-Territoriumsmarkern, durchgehenden Territoriumsgrenzen sowie ressourcenfarbenen galaktischen Handelsrouten und Konvoimarkern; besessene Systeme werden nach Zivilisation eingefärbt (Halo, Besitzerring, `◆`-Label, Legende, `Territorium:`-Tooltip, ADR-029), Grenzlinien zwischen Territorien als zweifarbige Offset-Striche (ADR-036). Flottenmarker besitzen eine Silhouette je dominanter Schiffsklasse, werden ringförmig versetzt und nach Sternen/Labels gezeichnet; Klickpriorität, Auswahlring und Info-Karte inklusive Fracht (ADR-045). Eine gelbe gestrichelte Vorschau zeigt die Route eines noch nicht bestätigten Ziels samt Zielring (ADR-052). Die Kamera wird nur bei neuem `galaxyCameraKey` zurückgesetzt, nicht bei jedem Datenrefresh.
- **`territoryBorders`**: reines Geometriemodul, das aus benachbarten Systemen unterschiedlicher Besitzer die geclippten Mittelsenkrechten als `TerritoryBorderSegment` ableitet; von Canvas und Vitest-Suite gemeinsam genutzt.
- **`SystemMapCanvas`**: 2D-Canvas des Sternensystems mit Zentralstern/Doppelsternen, animierten Orbits, Ringen, Atmosphären und Kolonie-Beacons; zeichnet echte Monde (maximal vier Punkte plus `+N`) sowie Asteroidengürtel als deterministische Staubringe in der Orbitansicht und als Gürtelbänder in der Detailachse; umschaltbar zwischen Umlaufbahnen und horizontaler, logarithmisch skalierter Detailachse inklusive Scroll und auswahlzentrierter Position (ADR-030, ADR-031). Flottenmarker beider Ansichten nutzen `systemFleetLayout.ts` und dieselben `Fleet`-Daten; sie liegen außerhalb der Planetenbahnen bzw. in der oberen Leiste, sind klickbar und nach Reichsfarbe unterscheidbar (ADR-052).
- **`systemFleetLayout`**, **`shipAssets`**, **`ShipInfoBar`**: Markerplatzierung und Hit-Test, Zuordnung der vorhandenen Schiffsbilder inklusive dokumentiertem Fallback sowie die untere Schiffsleiste mit Grafik, Typ, Fraktion, Standort, Bewegung, Ziel, Reichweite und Ladung (ADR-052). `shipAssets.ts` ordnet Kolonie, Aufklärer, Fregatte und Kreuzer den Dateien aus `Tilesets/Raumschiffe` zu; Korvette und Zerstörer verwenden die Fregatte als markierten Fallback, `Transporter.png` bleibt über `getUnmappedShipArtFileNames()` dokumentiert unzugeordnet. Die Leiste zeigt das Bild vollständig per `object-contain` statt beschnitten per `object-cover` (ADR-055).
- **`systemViewLayout`**: reines Layout-/Hit-Test-Modul für Sortierung, Orbit- und Detailgeometrie, Scroll-Klemmung sowie Treffererkennung; von Canvas und Vitest-Suite gemeinsam genutzt.
- **`PlanetSurfaceCanvas`**: 2D-Canvas der Hex-Oberfläche mit Zoom/Pan, Pixel-Tiles aus `Tilesets/Planetenbiome`, echten Lava-/Vulkankacheln, prozeduralen Platzhaltern für Gas/Gift/Xeno, Fog of War, Territorialgrenzen, Gebäuden und Einheiten (ADR-049, ADR-056). Stadtzentren erhalten nach dem Kachel-Durchlauf einen isometrischen Koloniekomplex aus `Tilesets/Kolonie` passend zur Entwicklungsstufe (`colonyTileAssets.ts`); fehlt die Grafik, bleibt der Vektor-Fallback. Klicks werden über die reine Funktion `resolveSurfaceClick` (`surfaceSelection.ts`) in Token-Auswahl, Abwahl, Kolonieöffnung, Bewegung oder Kachelauswahl übersetzt (ADR-055). Für das Testlabor lassen sich Zurück-Knopf und Vorkommens-Aufdeckung per Prop steuern.
- **`colonyTileAssets`** / **`surfaceSelection`**: `colonyTileAssets.ts` bindet die drei 1600 × 1600-PNGs unter `Tilesets/Kolonie` per Vite-Glob ein, ordnet sie den Stufen `outpost`/`settlement`/`colony` zu, lädt sie lazy und meldet nicht zugeordnete Dateien. `surfaceSelection.ts` ist eine React-freie Entscheidungsfunktion für Oberflächenklicks; erneutes Anklicken derselben Einheit hebt die Auswahl auf, eine andere Einheit übernimmt sie, Stadtzentren öffnen die Verwaltung, freie Kacheln bleiben Bewegungsziel (ADR-055).
- **`SystemInspector`**: Astrophysikalische Telemetrie, Planetenliste und System-Kolonienübersicht.
- **`PlanetInspector`**: Detaillierte Umweltmesswerte, Bauslots, Habitabilitäts-Faktorenmatrix, Scan-Aktion, Kolonisierungsprüfung und Außenpostengründung.
- **`HexTileInspector`**: Tile-Details (Biom, Erträge, Vorkommen, Gefahr, Besitz), Klima/Niederschlag/Abfluss aus der Weltgenerierung sowie Aktionen für Bau, Einheiten und Distrikte (Platzierung aus `DISTRICT_CATALOG` inklusive Kosten-/Tech-Prüfung, Abriss belegter Distrikte). Das Panel zeigt Geländetyp, echte Deposit-Zusatzerträge aus `DEPOSIT_CATALOG`, Gefahr-/Terraforming-Status und einen eigenen Abschnitt „Bebauungsstatus" (Koloniezentrum samt Entwicklungsstufe und Gebäudestufe, Gebäude, Distrikt oder unbebaut). Ohne aufgedecktes Vorkommen steht ausdrücklich „Keine besonderen Ressourcenvorkommen."; der Schließen-Knopf besitzt ein `aria-label`. Bei ausgewählter Einheit erscheint ein Banner mit „Auswahl aufheben", und ein Klick auf dieselbe Einheit in der Truppenliste hebt die Auswahl ebenfalls auf (ADR-055).
- **`ColonyManagementModal`**: Kommandozentrale mit sechs Tabs – Übersicht, Steuern, Bevölkerung, Bauwarteschlange, Bauplätze und Rekrutierung (ADR-050). Das Layout ist dreispaltig: Ressourcenübersicht inklusive Staatskasse links, aktiver Tab-Inhalt mittig, vertikale Navigation rechts; auf schmalen Viewports ordnen sich Navigation, Ressourcen und Inhalt untereinander, ohne dass Menüpunkte abgeschnitten werden. Der Oberflächenklick startet in der Übersicht, das Baumenü in der Warteschlange. Übersicht: Kolonieprofil, Kennzahlen, Territoriumszeile, Direkteinstiege in Steuern/Bevölkerung und gesammelte Warnhinweise. Steuern: Regler (0–60 %, Schritt 5), Voreinstellungen 0/15/30/45/60, Einnahmen, Korruption, Wartung, Privatsektorsteuer, Netto-Credits und projizierte Staatskasse. Bevölkerung: Pops/Kolonisten, Wachstumsprognose inklusive Runden bis +1 Pop, Zufriedenheits- und Habitabilitätsfaktor, bewirtschaftete Felder, freie Arbeitskräfte und Arbeitsfokus. Bauplätze: gebaut/frei/distriktbelegt/Territorium, grafische Stadtansicht im MoO2-Stil und Gebäudeliste mit Ausbaukosten. Die Stadtansicht zeigt fertige Gebäude als Platzhalter-Silhouetten (Hydrokuppel = Halbkugel), laufende Bauprojekte als Baustelle mit Fortschritt und gedrosselte Gebäude abgedunkelt (ADR-051). Baukarten zeigen Verfügbarkeits-Chips („Verfügbar", „Ressourcen fehlen", „Bauplatz gesperrt"), `◈`-Kosten und sperren Bau/Ausbau bei unzureichender Staatskasse. Das Koloniezentrum-Panel zeigt Entwicklungsstufe, Stadtzentrumsstufe, Voraussetzungen und Kosten der nächsten Stufe; die Aufwertung läuft über `onUpgradeTier`/`engine.upgradeColonyTier()`, zieht die Kosten ab und meldet Erfolg oder den konkreten fehlenden Wert (ADR-055).
- **`ColonySkyline`** / **`colonySkyline`**: deterministische SVG-Stadtansicht im Tab „Bauplätze“ (ADR-051). `colonySkyline.ts` ordnet Gebäude und Bauprojekte von der Mitte nach außen auf 3 × 5 Zellen, hasht den Jitter aus Kolonie- und Gebäude-ID (FNV-1a) und leitet sieben Geländepaletten aus Biom bzw. Planetentyp ab. `ColonySkyline.tsx` zeichnet je Gebäudetyp eine eigene Platzhalter-Silhouette, Ausbaustufen als Anbauten und Stufenpunkte, Baustellen mit Kran und Fortschrittsbalken sowie Sterne und Geländetupfer; keine Bildassets, keine Schreibzugriffe.
- **`colonyAdministration`**: reines View-Modell für die Verwaltung (`getTaxProjection`, `getPopulationForecast`, `getBuildingSlotSummary`, `COLONY_TIER_LABELS`). Es liest nur und verändert weder Vorräte noch Bevölkerung; schreibende Aktionen laufen über die Engine-Callbacks. Die Slot-Zählung teilt die Bedingungen mit `BuildQueueManager.validateBuildingPlacement` (ADR-050).
- **`TerraformingModal`**, **`LogisticsModal`**: Klimaprojekte, lokale Frachterrouten mit Frachterflotten-Status sowie interstellare Handelsrouten mit Konvoistatus, Anlageformular und Pause/Aktivieren/Entfernen.
- **`FleetModal`**, **`DiplomacyModal`**: Flottenübersicht mit Schiffbau und Bewegungsbefehlen sowie Beziehungsliste pro Reich mit Kriegserklärung, Friedensschluss, Kriegsdauer und Regelhinweisen; der „Diplomatie"-Knopf in der `TopNavBar` zeigt die Zahl laufender Kriege.
- **`EmpireModal`**: Reichsverwaltung mit Verwaltungslast und Effizienz, vier Politikfeldern inklusive Cooldown, drei Fraktionskarten mit Einfluss/Loyalität und den aktuellen Modifikatoren; der „Reich"-Knopf in der `TopNavBar` zeigt unruhige Fraktionen an (ADR-046).
- **`NarrativeModal`**: Galaktische Chronik mit offener Entscheidung samt Kostenprüfung, Ausgrabungsstätten mit Fortschritt und Startaktion, Krisenstufe mit Eindämmungsbalken und Finanzierungsaktion sowie der letzten Entscheidungshistorie. Das Modal rechnet nichts nach und bezieht alle Werte aus `NarrativeOverview` (ADR-047).
- **`VictoryModal`**, **`EndScreen`**: Zielanzeige mit drei Siegbedingungen, Fortschrittsbalken, Punkteaufschlüsselung und Rangliste („Menü → Ziele & Punkte") sowie Abschlussbildschirm für Sieg oder Niederlage inklusive Sandbox-Fortsetzung nach einem Sieg. Beide beziehen ihre Werte aus `VictoryOverview` bzw. `GameOutcome` (ADR-048).
- **`TechTreeModal`**, **`PlanetsOverviewModal`**, **`SaveLoadModal`**, **`TestRunnerModal`**, **`PhaseRoadmapModal`**: Forschungsbaum, Planetenübersicht, Persistenz, In-App-QA und Roadmap.

### 2.14 Testlabor (`src/testing/`, ADR-056)
- **`TestLab.tsx`**: eigenständige Vollbild-Shell außerhalb der Kampagne (`appMode === 'testing'`), erreichbar über „Testing" im Hauptmenü. Zeigt die Ballon-Registry als Karten mit Status „Verfügbar"/„Geplant" und hält den aktiven Ballon nur im React-State.
- **`testLabRegistry.tsx`**: einzige Erweiterungsstelle. Jeder Eintrag besitzt `id`, `title`, `description`, `category`, `status`, optionale Komponente und `plannedNote`. Neue Tests werden als weitere Komponente mit `TestBalloonProps` ergänzt, ohne das Labor zu ändern.
- **`surfaceTestUtils.ts`**: DOM-freie Helfer für den Oberflächenballon. `createTestPlanet()` erzeugt einen synthetischen Planeten (ID `test-<typ>`, kein Koloniebezug), `generateTestSurface()` ruft den echten `SurfaceGenerator.generateSurface(planet, seed, width, height)` auf, schaltet Kacheln nur in der Kopie `visible` und deckt Vorkommen auf. `computeSurfaceStatistics()` zählt Biome, Vorkommen, Gefahren, unpassierbare Felder, Flüsse, Seen und Höhen aus dem Ergebnis; `surfaceSignature()` liefert einen FNV-1a-Fingerabdruck für den Reproduzierbarkeitsvergleich.
- **`balloons/SurfaceGeneratorBalloon.tsx`**: vollständiger erster Ballon mit Planetentyp (inkl. Vulkanwelt), Breite 6–32, Höhe 6–24, Seed manuell oder automatisch, Generieren, Zurücksetzen, Validierungsfehlern, Signatur und „identisch/abweichend", Canvas mit Zoom/Pan, Kachel-Info ohne Kolonieaktionen, Ressourcen-Toggle und echten Statistiken. Es werden keine Engine-, Runden- oder Speicherfunktionen aufgerufen.

---

## 3. Phase-2-Stand & offene Andockpunkte

Modul 4 hat die Kolonieverwaltung vollständig umgesetzt; Terraforming, Logistikrouten inklusive Frachterflotten und Multi-Tile-Distrikte sind als Phase-2-Bausteine implementiert.

**Umgesetzt:**
1. **`TerraformingProject` (`src/core/terraformingManager.ts`):** Projekte mit `planetId`, `targetBiome`, `targetAtmosphere`, `progress` und `totalRequired`; Tech-Gate `atmospheric_scrubbers`, Kosten aus Habitabilität und Zielzustand, Fortschritt pro Runde, Abschluss setzt Biom und/oder Atmosphäre und löst `terraforming:*`-Events aus.
2. **`LogisticsRoute` (`src/core/logisticsManager.ts`):** Routen mit Quelle, Ziel, `capacityPerTurn`, `freighterCount` und `isActive`; Tech-Gate `planetary_logistics_prep`, maximal 5 Frachter à 15 Kapazität, Reserven und Zielbestände pro Ressource, deterministischer Transfer in `endTurn` mit `logistics:*`-Events.
3. **`DistrictInstance` (`src/core/districtManager.ts`, `src/data/districtCatalog.ts`):** Datengetriebener Katalog mit vier Distrikten und Footprints über 2–3 Hexe; `canPlaceDistrict` prüft Tech-Gate, Oberflächen- und Territoriumsgrenzen, Stadtzentrum, Gebäude- und Distriktüberlappung sowie Lagerbestände; `placeDistrict`/`removeDistrict` pflegen `Colony.districts` und `PlanetHexTile.districtInstanceId` (inklusive `syncSurfaceMarkers` nach Save-Restore); `calculateDistrictYields` fließt in `EconomyEngine` ein, `district:*`-Events melden Änderungen (ADR-018).
4. **Habitabilitäts-Wachstumsmultiplikator (`src/core/economyEngine.ts`):** `calculateGrowthMultiplier` bildet `clamp(habitability, 0, 100) / 100` mit Untergrenze 0,25; der Multiplikator skaliert ausschließlich positiven `growthFoodProgress`-Zuwachs (Defizit-Strafe bleibt unverändert), Rundung auf zwei Dezimalstellen; `ColonyManagementModal` zeigt den Faktor neben dem Wachstumsbalken (ADR-019).
5. **`FreighterFleet` (`src/core/logisticsManager.ts`):** Jede Route spawnt 1–5 deterministische Frachter (`fleet_${routeId}_${n}`, Kapazität 15) mit Status `loading`/`outbound`/`inbound`, `progress` und `cargo`; `advanceTurn` belädt über Reserve/Zielbestand/In-Transit, liefert bei Ankunft, schickt den Frachter auf den Rückweg (`2 × travelTurns`) und emittiert `logistics:fleet-departed`/`logistics:fleet-arrived`; die Reisezeit kommt aus einem distanzbasierten Resolver in `GameEngine` (1–20 Runden), Persistenz über `freighterFleets`, Anzeige im `LogisticsModal` (ADR-020).

**Umgesetzt:**
6. **Technologie-DAG:** Vier Stufen, drei Forschungsbereiche, 21 Technologien inklusive sechs doktrinärer Tier-4-Spezialisierungen (drei exklusive Paare), Graph-Validierung, Spezialisierungssperren und Tier-/Voraussetzungsanzeige im `TechTreeModal` (ADR-021).
7. **Galaktischer Handel:** `GalacticTradeManager` mit BFS-Pfadsuche über Hyperlanes, Tech-Gate `interstellar_freight_network`, zwei Validierungsebenen (Endpunkte, Ressource, Frachterzahl, Duplikate), Zwei-Phasen-Konvoilauf, Reserve-/Zielbestands-/In-Transit-Anrechnung, Pause- und Orbit-Semantik, optionale Persistenz sowie Kartenoverlay und `LogisticsModal`-Integration (ADR-022).
8. **Schiffbau & Flotten:** `FleetManager` mit werftgebundenem Schiffbau (Kolonienstufe `colony`, 50 % Produktionsanteil, sofortige Materialkosten), Schiffskatalog mit Tech-Gates, Flottenzusammenführung pro Zivilisation und System, Stärkeberechnung, Hyperlane-Bewegung mit einem Schritt pro Runde, optionaler Persistenz sowie `FleetModal` und Kartenoverlay (ADR-023).
9. **Diplomatie:** `DiplomacyManager` mit einem symmetrischen Beziehungsdatensatz pro Zivilisationspaar, Frieden als Standard, validierter Kriegserklärung, Friedensschluss erst nach `PEACE_MIN_WAR_TURNS` Runden, `diplomacy:*`-Events, kriegsgebundenem Kampf über `WarRelationLookup`, optionaler Persistenz sowie `DiplomacyModal` und Kriegsabzeichen in der `TopNavBar` (ADR-027).
10. **KI-Diplomatie:** `AiDiplomacyManager` als zustandsloser Rundenakt 1c mit Stärke-Snapshot, Kriegserklärungen an Prüftagen (ab Runde 12, alle 4 Runden, Mindeststärke 80, Überlegenheitsfaktor 1,2, max. ein Krieg je Reich und Prüftag) und Friedensschlüssen der schwächeren Seite ab 6 Kriegsrunden bzw. nach 18 Runden Kriegsmüdigkeit inklusive 10-Runden-Cooldown; keine neuen Save-Felder, keine Invasions-KI (ADR-035).
11. **Durchgehende Territoriumsgrenzen:** `computeTerritoryBorders` (`src/ui/territoryBorders.ts`) leitet aus benachbarten Systemen unterschiedlicher Besitzer geclippte Mittelsenkrechten ab (Clip-Radius 160, Sutherland-Hodgman gegen alle Systeme, Dedupe je Systempaar, deterministische Sortierung); `GalaxyMapCanvas` zeichnet sie zweifarbig vor den Handelsrouten. Rein abgeleitete Renderdaten ohne Save-Felder oder Engine-Änderung (ADR-036).
12. **Flüsse und Seen:** `Hydrology` (`src/surface/hydrology.ts`) berechnet per Priority-Flood mit stabilem Min-Heap deterministisch Abfluss, Fließrichtung und Seen auf der Rohelevation; der `SurfaceGenerator` schreibt `riverDischarge`, `flowsTo` und `isLake` in die Kacheln und erhöht die Feuchtigkeit im Gewässerumfeld. `PlanetSurfaceCanvas` und `HexTileInspector` stellen die Gewässer dar. Kein Save-Bump, da die Felder optional sind; `GENERATOR_VERSION` steigt mit ADR-037 auf 3, mit ADR-049 auf 4 und mit ADR-057 auf 5.
13. **Reichsverwaltung & Fraktionen:** `EmpireManager` mit Verwaltungskapazität, vier Governance-Politiken, drei Fraktionen, deterministischer Rundenbewertung, KI-Politikwechsel und optionaler Persistenz (`empireStates`); `EmpireModal` und „Reich"-Knopf mit Unruhe-Abzeichen. Modifikatoren wirken ab der Folgerunde, der erste Zug bleibt neutral (ADR-046).
