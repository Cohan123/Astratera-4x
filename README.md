# Astraea 4X – Galactic Foundations

> Modulares, rundenbasiertes Science-Fiction-4X-Strategiespiel  
> **Phase 1, Modul 1:** Technisches Fundament, prozedurale Galaxy-Karte & Rundenverwaltung  
> **Phase 1, Modul 2:** Sternensysteme, 2D-Systemkarte & prozedurale Planeten-Generierung  
> **Phase 1, Modul 3:** Habitabilität, Kolonisierung & Planeten-Aufklärung  
> **Phase 1, Modul 4:** Hex-Planetenoberfläche, Kolonieökonomie, Bauwesen, Forschung & Einheiten  
> **Phase 2 (abgeschlossen):** Terraforming-Projekte, Logistikrouten mit Frachterflotten, Multi-Tile-Distrikte, Planetenübersicht sowie Schiffskonstruktion & Kriegsflotten (Phase 4)  
> **Phase 3 (abgeschlossen):** Technologie-DAG, galaktischer Handel, Staatsfinanzen, Zölle/Blockaden/Eskorten und Privatsektor  
> **Phase 4 (abgeschlossen):** Schiffbau, Flotten, Diplomatie, Territorien sowie Reichsverwaltung mit Governance-Politik und inneren Fraktionen  
> **Phase 5 (abgeschlossen):** Dynamische Ereignisse, Ausgrabungsstätten und galaktische Krise mit galaktischer Chronik  
> **Phase 6 (in Arbeit):** Sieg- und Niederlagebedingungen, Punktewertung, Rangliste und Abschlussbildschirm  
> **Phase 6.2/6.3 (geplant):** KI-Expansion, Zielauswahl und Invasionen  
> **Feature-Paket (abgeschlossen):** Hauptmenü, Seed-Verwaltung, Startflotte & Kolonisationslogistik, zentrale Benachrichtigungen, Flottenmarker, vollständiger Spielstand

---

## 1. Projektziel & Vision

Astraea 4X ist ein rundenbasiertes Sci-Fi-Strategiespiel, das schrittweise in modularen Entwicklungsphasen realisiert wird:

- **Galaxy- & Sternensystem-Erkundung:** Strategische Übersicht über eine prozedural generierte Galaxie mit nahtlosem Wechsel in detaillierte Sternensysteme.
- **Sternensysteme & Planetenwelten:** 2D-Systemkarte mit Zentral- und Doppelsternen, elliptischen Keplerianischen Umlaufbahnen und differenzierten Planetentypen (konzeptionelle Orientierung: *Master of Orion*).
- **Planetenverwaltung & Siedlungsausbau:** Hex-basierte Planetenoberflächen mit Fog of War, Kolonieökonomie, Arbeitskraft-Zuteilung, Gebäuden und territorialer Expansion (konzeptionelle Orientierung: *Civilization* – umgesetzt in Modul 4).
- **Erzählweise & Galaxiegeschichte:** Dynamische Ereignisse, Vorläufer-Anomalien und historische Aufzeichnungen (konzeptionelle Orientierung: *Stellaris*).

---

## 2. Voraussetzungen & Technologie-Stack

- **Laufzeitumgebung:** Node.js (>= 18.x) oder kompatible Runtime
- **Frontend / Engine:** React 19 + TypeScript + Vite
- **Grafik / Rendering:** HTML5 2D Canvas mit HiDPI-Subpixel-Präzision, Frustum Culling & Retina-Support
- **Styling:** Tailwind CSS (Dark Space Tactical Design, 60-30-10 Farbdisziplin)
- **Test-Framework:** Vitest (532/532 automatisierte Unit- & Integrations-Tests in 51 Dateien) plus In-App-QA-Runner mit 23 Prüfkriterien
- **Persistenz:** Versionierte JSON-Serialisierung (`version: 4`) mit Migration von v1, v2 und v3 (LocalStorage & Datei-Download/Upload)

---

## 3. Installation & Start

### Abhängigkeiten installieren
```bash
npm install
```

### Entwicklungs-Server starten
```bash
npm run dev
```
Der Entwicklungsserver startet auf Port `3000` (z. B. `http://localhost:3000`).

### Linux-Launcher installieren (optional)
```bash
./install-linux-launcher.sh
```
Installiert den Menüeintrag **Astraea 4X** unter *Spiele* sowie das zugehörige Icon. Alternativ lässt sich das Spiel direkt starten:
```bash
./run-astraea.sh
```
Der Launcher erkennt eine bereits laufende Instanz, installiert bei Bedarf die Abhängigkeiten, sucht einen freien Port im Bereich `3000`–`3019`, startet Vite und öffnet den Browser. Das Terminalfenster bleibt geöffnet, solange der Entwicklungsserver läuft.

- Anderer Basisport: `ASTRAEA_PORT=4000 ./run-astraea.sh`
- Browser nicht automatisch öffnen: `ASTRAEA_NO_BROWSER=1 ./run-astraea.sh`
- Server-Log: `/tmp/astraea-4x-dev.log`

### Tests ausführen
```bash
npm test
```
Führt die Vitest-Suite aus (532 Tests in 51 Dateien: Galaxie, Systemkarte/Planeten, Systemansicht, Monde/Asteroidengürtel, Kolonisierung, Modul 4, Koloniestufen, KI-Reiche, KI-Flotten, KI-Diplomatie, Terraforming, Logistik, Distrikte, Technologie-DAG, galaktischer Handel, Privatsektor, Flotten, Flottenbefehle, Diplomatie, Wirtschaft Stufe A, Wirtschaft Stufe B, Oberflächengenerator, Oberflächen-Tiles, Kolonieverwaltung samt Verwaltungs-UI, Kolonie-Stadtansicht, Hydrologie, Territoriumsgrenzen, Steuerregler, Startflotte, Startplatzierung, Fraktionen, Benachrichtigungen, Nachrichtenverlauf, Flottendarstellung, Systemflotten/Kamera, Schiffsleiste/Nachrichten-UI, Spielstand-Vollständigkeit, Reichsverwaltung, Narrative Ebene, Sieg/Niederlage samt Zielanzeige und GUI-Überarbeitung mit Kolonie-Tiles, Kachel-Infos und Stufenaufwertung, Biom-Tiles, Oberflächengrößen, Ozean-Landgrenze, Gasförderung und Xenowelten).

### Produktions-Build erstellen
```bash
npm run build
```

---

## 4. Kernfunktionen nach Modul 1 bis Modul 4

### 4.1 Modul 1: Galaxie & Rundenfundament
- **Deterministische Galaxie-Generierung (Mulberry32 PRNG):** 100% reproduzierbar aus Seed & Konfiguration.
- **4 Galaxiegrößen:** Klein (25), Mittel (55), Groß (100), Episch (160 Systeme).
- **4 Galaxieformen:** Spirale, Elliptisch, Ring, Cluster.
- **Interaktive Galaxy-Karte:** Zoom, Pan, Spektralklassen mit dynamischer Korona, Hyperlane-Filamente, Zielretikel.
- **Zentraler TurnManager:** Atomarer Rundenwechsel mit Standard-Datumsformat (`2380.01`).

### 4.2 Modul 2: Sternensysteme, Systemkarte & Planeten
- **Zwei-Ebenen-Navigation:** Nahtloser Wechsel zwischen Galaxy-Karte und Systemkarte (Button „Systemkarte öffnen“, Klick auf System oder Taste `M`).
- **Zustandserhaltung:** Beide Ansichten greifen auf denselben Spielzustand zu; beim Ansichtswechsel werden keine Daten dupliziert oder neu generiert.
- **2D-Systemkarten-Renderer:**
  - Zentralstern mit Korona-Glow und Partikeln.
  - Optionale **Doppelsternsysteme** (Binary Stars mit gemeinsamem Baryzentrum).
  - Keplerianische Umlaufbahnen mit realitätsnaher Geschwindigkeitsabstufung.
  - Orbit-Animation zuschaltbar/pausierbar.
  - Stufenloses Zoomen und Verschieben innerhalb des Sternensystems.
  - **Zwei umschaltbare Darstellungen** („Umlaufbahnen" / „Detailansicht"): Die Detailansicht ordnet alle Planeten auf einer horizontalen, logarithmisch nach mittlerer Entfernung (AU) skalierten Achse an, erzwingt lesbare Mindestabstände, scrollt bei Platzmangel und zentriert die Auswahl; echte Monde erscheinen in beiden Ansichten als maximal vier Begleiterpunkte plus `+N`, Asteroidengürtel als Staub- bzw. Gürtelband zwischen den Planeten.
  - Der Ansichtswechsel ist rein visuell: Rundenstand, Orbitphase, Auswahl und Spielzustand bleiben unverändert; die zuletzt gewählte Ansicht bleibt innerhalb der Sitzung erhalten.
- **8 differenzierte Planetentypen:**
  1. *Ozeanplanet* (ausgedehnte Biosphären, hohe Habitabilität, höchstens 15 % Land)
  2. *Gesteinsplanet* (Terra-Typ mit Gebirgen und Bauslots)
  3. *Wüstenplanet* (aride Kruste mit seltenen Erden)
  4. *Eisplanet* (Kryowelt mit gefrorenen Ozeanen)
  5. *Vulkanplanet* (geothermisch aktiv, reich an Mineralien)
  6. *Gasriese* (massiv, stürmisch, mit planetarem Ringsystem; keine Bodenkolonie, nur Gasförderung)
  7. *Giftiger Planet* (ätzende Atmosphäre, Treibhauseffekt)
  8. *Xenowelt* (extrem selten, fremdartige Biosphäre; Gewicht zentral in `planetGenerationConfig.ts`)
- **Physikalische Planetendaten:**
  - Distanz in Astronomischen Einheiten (AU), Umlaufzeit in Tagen.
  - Oberflächentemperatur in Kelvin und Celsius mit Kategorisierung (*Tiefgefroren* bis *Glühend heiß*).
  - Atmosphärentypen (*Keine*, *Dünn*, *Atembar*, *Dicht*, *Ätzend*, *Giftig*).
  - Schwerkraft in G (*Niedrig*, *Standard*, *Hoch*, *Extrem*).
  - Habitabilitäts-Score (0–100%) mit Tier-Einteilung (*Unbewohnbar*, *Rau*, *Geeignet*, *Ideal*).
  - Bauslots (Größenklasse 10 bis 25) als Grundlage der Koloniegröße in Modul 4.
- **Planetenscan & Erkundungsaktion:**
  - Start einer Orbitalsonde analysiert planetare Spektren und schaltet detaillierte Atmosphärendaten frei.
- **Monde & Asteroidengürtel:**
  - Jeder Planet kann 0–14 echte Monde besitzen (`Moon`); Gasriesen erhalten bis zu vier Hauptmonde, die übrigen Planeten einen einzelnen Begleiter. Monde werden aus einem eigenen, deterministischen PRNG-Strom (`…:moons`) erzeugt, damit die bestehende Planeten- und Galaxiegenerierung bitgenau unverändert bleibt.
  - Asteroidengürtel (`AsteroidBelt`) entstehen mit 45 % Wahrscheinlichkeit als ein Gürtel, mit 15 % als zwei Gürtel in den Lücken zwischen den Planeten; innere/äußere AU-Grenzen, Dichte (0,35–0,85) und Zusammensetzung (`rocky`, `metallic`, `icy`) sind deterministisch aus `…:belts` abgeleitet.
- **Erweitertes Speichern & Laden:**
  - Alle generierten Planeten, Monde, Asteroidengürtel, Orbits und Untersuchungszustände werden versioniert persistiert.
  - Vollständige Abwärtskompatibilität für ältere Spielstände.

### 4.3 Modul 3: Habitabilität, Kolonisierung & Aufklärung
- **Deterministische Habitabilitätsbewertung:** Score 0–100% aus Atmosphäre, Temperatur, Wasser, Schwerkraft, Strahlung und Planetentyp, eingeteilt in fünf Tiers (`ideal`, `moderate`, `harsh`, `hostile`, `uninhabitable`) inklusive transparenter Faktorenmatrix.
- **Zentrale Kolonisierungsregeln (`ColonizationValidator`):** Planet muss analysiert, unbewohnt, ohne tödliche Strahlung und mit Habitabilität ≥ 15 % sein. Gasriesen erlauben keine normale Bodenkolonie, sind aber als reine Gasförderung zulässig; die Gebäuderegeln lassen dort ausschließlich Gasförderanlagen zu.
- **Koloniegründung (`ColonyManager`):** Atomare Zustandstransitionen (`colonizationStatus`, `colonyId`, `discoveryStatus`), automatische Startbevölkerung, Startlager und Ereignisse `colony:founded` / `colony:failed`. Für den Spieler prüft `GameEngine.foundColony()` zusätzlich Vermessung, Bewohnbarkeit und die Fracht eines bereitstehenden Kolonieschiffs; nach erfolgreicher Gründung wird das Schiff verbraucht (ADR-043).
- **Aufklärungsmodell (`PlanetDataFilter`):** Trennt Realität von Spielerwissen; Tiefenmesswerte bleiben bis zum Sondenscan verborgen.
- **Persistenz:** Kolonien, Aufklärungsstände und Planetendaten werden vollständig serialisiert.

### 4.4 Modul 4: Planetenoberfläche & Kolonieverwaltung
- **Prozedurale Hex-Oberfläche (ADR-049, ADR-057):** Die Oberfläche ist nicht mehr fest 18 × 10, sondern wird deterministisch aus Planetentyp, Planet-ID und Galaxie-Seed aufgelöst (`src/surface/surfaceSize.ts`): harte Grenzen 6–36 × 6–24, maximal 864 Kacheln, typabhängige Bereiche (z. B. Ozean 18–26 × 10–15, Gasriese 12–18 × 8–11, Xenowelt 17–24 × 10–14). Gespeicherte oder explizit übergebene Maße haben Vorrang. Generatorversion `GENERATOR_VERSION = 5`, Seed `${galaxySeed}:${planet.id}:surface:v5`; 17 Biome, Höhenstufen, Ressourcenvorkommen und Gefahrenzonen. Dwarf-Fortress-nahe Felder für Temperatur, Niederschlag, Abfluss und Wildheit erzeugen Klimagürtel, Regenschatten, Flussniederungen, Wälder, Dschungel, Marschen und Gletscher. Gasriesen erhalten eine reine Wolkenschicht, Vulkanwelten Lavaseen, Giftwelten Xenoflora, Xenowelten eine fremdartige Biosphäre aus vorhandenen Biomen.
- **Ozeanwelten (ADR-057):** Höchstens 15 % Land, mindestens 85 % Wasser, unabhängig von der Kartengröße. Die Landquote wird aus den tatsächlichen Kacheln gezählt (Küsten zählen als Land), die harte Grenze ist `floor(kacheln · 0,15)`. Die Landezone erzeugt kein zusätzliches Land, sondern verschiebt vorhandenes Land in Kern und bis zu drei Nachbarn; `enforceOceanLandCap` entfernt danach jede überschüssige Landkachel konsistent.
- **Pixel-Tiles (ADR-049, ADR-056, ADR-057):** `PlanetSurfaceCanvas` zeichnet die Kacheln aus `Tilesets/Planetenbiome` als Basis plus transparenten Aufsatz, mit deterministischer Variantenwahl, Küstenwasser und Höhenschattierung. Lava/Vulkangestein (`LAVA_TILE_*`, `MOUNTAIN_HEX_*`), Gasriesen (`GAS_YELLOW_*`, `GAS_BLUE_*` nach Planetenfarbe), Giftwelten (`GIFT_*`, inklusive Säuresee), Xenowelten (`XENO_*`) und Gesteinswelten (`ROCK_HEX_*` für Gebirge) nutzen echte Assets. Die quadratischen Punkt-Hex-Grafiken werden über `box: 'square'` und einen je Datei gemessenen `bleed`-Faktor lückenlos gezeichnet. Fehlt ein Bild, greift die Biome-Farbe; der prozedurale Platzhalter bleibt nur für fremdartige Biome außerhalb von Xeno-/Giftwelten und für fehlende Assets.
- **Fog of War & Sichtbarkeit:** `unseen` / `discovered` / `visible`, aufgedeckt über `SurfaceManager.revealTilesAround()` und Geländekosten-basierte Bewegung.
- **Kolonieökonomie (`EconomyEngine`):** Sieben Ressourcen (Nahrung, Produktion, Energie, Mineralien, seltene Ressourcen, Forschung, Einfluss), Brutto-/Nettoerträge, Unterhalt, Energiedefizit mit −25% Effizienz und Bevölkerungswachstum (`50 · pop^1.3`, habitabilitätsabhängig ×0,25–1,0).
- **Staatsfinanzen (Wirtschaft Stufe A, ADR-032):** Jede Kolonie besitzt einen Steuersatz (0–60 %, Standard 30 %), aus dem sich Korruption (tierabhängig 10–35 %, ab 40 % Steuersatz steigend) und Approval (0–100, Basis 50) ergeben. Die Steuereinnahmen (`Bevölkerungseinheiten × 6 × Steuersatz × (1 − Korruption)`) fließen pro Runde einmalig in die Staatskasse der Zivilisation; Approval wirkt auf das Bevölkerungswachstum (Faktor 0,5–1,5). Regler, Voreinstellungen und Projektion liegen im Tab „Steuern" des `ColonyManagementModal`. Das Bewegen des Reglers berechnet nur Steuerzustand und Erträge neu; Lagerbestände und Bevölkerung ändern sich erst im Rundenwechsel (ADR-040).
- **Wartungs- & Baukosten (Wirtschaft Stufe B, ADR-033):** Gebäude verursachen laufende Credit-Wartung (`creditUpkeepPerLevel × Stufe`, in `UpkeepCosts.credits`) und einmalige Credit-Baukosten, die beim Einreihen zusammen mit Mineralien und seltenen Ressourcen abgezogen werden. `GameEngine.endTurn()` verrechnet je Zivilisation Steuereinnahmen minus Wartung mit Untergrenze 0 (keine Schulden). Der `ColonyManagementModal` zeigt `Wartung: −… Cr/Rd.`, `◈`-Kosten je Baukarte und sperrt Bau/Ausbau bei zu kleiner Staatskasse.
- **Arbeitskraft & Bewirtschaftung:** Automatische Zuteilung der Bürger auf Hexfelder nach Arbeitsfokus (`balanced`, `food`, `production`, `energy`, `minerals`, `research`) mit Sperrung einzelner Tiles.
- **Territoriale Expansion:** Einfluss-basierte Gebietsansprüche mit gestaffelten Kosten (`15 + 5·Distanz + 2·bereits beanspruchte Tiles`).
- **Bauwesen (`BuildQueueManager`):** Gebäudekatalog mit Baukosten, Biomanbindung, Bauzeit, Upgrades (`Stufe × Level`) und Truppenrekrutierung über dieselbe Warteschlange. Ausbauten ohne definierte Bauzeit (Koloniezentrum, `baseProductionCost: 0`) werden sofort abgeschlossen, statt als 0-Runden-Eintrag in der Warteschlange zu hängen; gespeicherte Altbestände werden beim Rundenwechsel kontrolliert fertiggestellt, fehlende Bauzeiten beim Laden aus dem Katalog rekonstruiert (ADR-056).
- **Gasriesen & Gaskollektoren (ADR-057):** Auf Gasriesen ist keine normale Bodenkolonie möglich. Die Gründung erzeugt eine Gasförderplattform (`gas_extraction_hub`) statt eines Koloniezentrums; baubar sind dort ausschließlich Gebäude mit `allowedPlanetTypes: ['gas_giant']`. Der `gas_collector` produziert seltene Ressourcen, Energie und Produktion, benötigt die Technologie `gas_extraction` (Engineering, Tier 2, 120, Voraussetzung `automated_assembly`) und wird zentral über `BuildValidationContext` geprüft – auch direkte Bauaufrufe ohne Kontext werden abgelehnt.
- **Forschung (`ResearchManager`):** Technologiekatalog mit Voraussetzungs-DAG, Forschungsinvestition und Abschlusserkennung.
- **Oberflächeneinheiten (`UnitManager`):** Rekrutierung, Bewegungspunkte, Geländekosten und Pfadbewegung über Hexfelder.
- **Zivilisationen & KI (`CivManager`):** Spielerfraktion plus zwei KI-Fraktionen, die dieselben Regel-Validatoren für Expansion und Koloniegründung nutzen.
- **Kolonieverwaltungs-UI:** `PlanetSurfaceCanvas` (Hex-Karte, Zoom/Pan) und `ColonyManagementModal` mit sechs Tabs: Übersicht, Steuern, Bevölkerung, Bauwarteschlange, Bauplätze und Rekrutierung.
- **Koloniale Verwaltung (ADR-050):** Ein Klick auf ein Stadtzentrum oder „Kolonie verwalten" öffnet die Kommandozentrale der Kolonie. Der Tab „Steuern" bietet Regler (0–60 %, Schritt 5), Voreinstellungen 0/15/30/45/60, Einnahmen, Korruption, Wartung, Privatsektorsteuer, Netto-Credits und die projizierte Staatskasse. „Bevölkerung" zeigt Pops/Kolonisten, Wachstumsfortschritt, erwarteten Zuwachs pro Runde, Runden bis +1 Pop, Zufriedenheits- und Habitabilitätsfaktor, bewirtschaftete Felder, freie Arbeitskräfte und die Arbeitsfokusse. „Bauplätze" zeigt zusätzlich eine grafische Stadtansicht im Master-of-Orion-2-Stil: fertige Gebäude als Platzhalter-Silhouetten (Hydrokuppel als Halbkugel), laufende Bauprojekte als Baustelle mit Fortschritt, gedrosselte Gebäude abgedunkelt (ADR-051). Dazu zählt der Tab bebaute, freie, distriktbelegte und beanspruchte Felder und listet Ausbaukosten. Alle Werte stammen aus dem reinen View-Modell `src/ui/colonyAdministration.ts`; Schreibzugriffe laufen ausschließlich über Engine-Callbacks.
- **Kolonie-Kommando & Kolonie-Tiles (ADR-055):** Das `ColonyManagementModal` ist dreispaltig aufgebaut: Ressourcenübersicht und Staatskasse links, aktiver Tab-Inhalt mittig, vertikale Navigationsleiste rechts; auf schmalen Viewports ordnen sich Navigation, Ressourcen und Inhalt untereinander. Das Koloniezentrum-Panel zeigt Entwicklungsstufe, Stadtzentrumsstufe, Voraussetzungen und Kosten der nächsten Stufe und wertet über `engine.upgradeColonyTier()` auf; bei Ablehnung erscheint der konkrete fehlende Wert. Auf der Planetenoberfläche ersetzt je Entwicklungsstufe ein isometrischer Gesamtkomplex aus `Tilesets/Kolonie` (`Start_Kolonie.png`, `Stufe_2_Kolonie.png`, `Stufe_3_Kolonie.png`) den Vektor-Platzhalter am Stadtzentrum; fehlt eine Datei, bleibt der Vektor-Fallback. Einzelgebäude behalten ihre bisherigen Symbole.
- **Kachel-Informationsfenster (ADR-055):** Ein Klick auf eine Kachel ohne ausgewählte Einheit öffnet den `HexTileInspector` mit Geländetyp, Klima, Grunderträgen, echten Deposit-Zusatzerträgen, Gefahr-/Terraforming-Status, Bebauungsstatus (Koloniezentrum, Gebäude, Distrikt oder unbebaut) und stationierten Einheiten. Ohne aufgedecktes Vorkommen steht ausdrücklich „Keine besonderen Ressourcenvorkommen."; das Panel ist schließbar und aktualisiert sich bei jeder anderen Kachel.
- **Einheitenauswahl (ADR-055):** Erneutes Anklicken desselben Tokens oder derselben Kachel hebt die Auswahl auf, eine andere Einheit übernimmt sie; freie Kacheln bleiben Bewegungsziel. Zusätzlich gibt es „Auswahl aufheben" im Inspector. Escape räumt auf der Oberfläche zuerst die Einheit, dann die Kachel und verlässt erst danach die Planetenoberfläche. Die reine Entscheidungslogik liegt in `src/ui/surfaceSelection.ts` und ist ohne Canvas testbar.
- **Terraforming (`TerraformingManager`):** Klimaprojekte auf Planetenoberflächen mit Biom- und Atmosphärenziel, Habitabilitätsbewertung, Produktionskosten, Fortschritt pro Runde und Biom-Abschluss; UI über `TerraformingModal`.
- **Logistik (`LogisticsManager`):** Frachterrouten zwischen eigenen Kolonien mit Kapazität pro Frachter (15), Tech-Freischaltung (`planetary_logistics_prep`), Reserven/Zielbeständen und deterministischem Transfer in `endTurn`. Jede Route spawnt 1–5 Einzelfrachter mit distanzabhängiger Reisezeit, Belade-/Rückflugphasen und Ankunftstransfer; UI über `LogisticsModal` (ADR-020).
- **Multi-Tile-Distrikte (`DistrictManager`):** Vier datengetriebene Distrikte (`DISTRICT_CATALOG`) mit Footprints über 2–3 Hexfelder, Mineral-/Rare-Kosten, Energie-Unterhalt, optionalen Tech-Gates (`automated_assembly`, `orbital_surveying`) und eigenen Erträgen; Platzierung/Abriss über den `HexTileInspector` (ADR-018).
- **Planetenübersicht (`PlanetsOverviewModal`):** Aggregierte Reichsstatistik, Kolonieliste mit Sprung in Oberfläche, Kolonieverwaltung oder Systemansicht.
- **Koloniestufen:** Entwicklung von Außenposten über Siedlung zur Kolonie mit Technologie- und Ausbauvoraussetzungen, KI-Aufstieg im Rundenwechsel und Stufenanzeige in Inspektoren und Übersichten.
- **KI-Präsenz & KI-Flotten (ADR-028):** Jedes KI-Reich startet mit eigener Heimatkolonie (Stufe `colony`, 3.000 Kolonisten) und Starttechnologien; im Rundenwechsel füllen KI-Reiche ihre Werftdocks und lassen eigene Flotten zwischen eigenen Systemen patrouillieren.
- **Territoriumskarte (ADR-029):** Die Galaxiekarte färbt besessene Systeme nach Zivilisation (Halo, Besitzerring, farbige Namen mit `◆`), zeigt den Besitzernamen bei Auswahl oder Zoom > 1 und erklärt die Farben über eine Legende sowie eine `Territorium:`-Zeile im Hover-Tooltip.
- **Reichsverwaltung & innere Fraktionen (ADR-046):** `EmpireManager` verwaltet je Reich eine Governance-Politik (`balanced`, `industry`, `science`, `military`) und drei Fraktionen (Industrie, Wissenschaft, Militär). Die Verwaltungskapazität wächst mit Forschung und Staatskasse, die Last mit Koloniestufen und Distrikten; Overextension senkt Effizienz und Zustimmung. Fraktionsloyalität und -einfluss werden am Rundenende aus Produktion/Forschung pro Kopf, Steuern, Handelsrouten, Kriegen und Verwaltungslast neu bewertet. Eine dominante, loyale Fraktion verstärkt ihren Schwerpunkt um 5 %; Unruhe unter 30 Loyalität wird zentral gemeldet. UI im `EmpireModal` und über den „Reich"-Knopf mit Unruhe-Abzeichen.
- **Narrative Ebene (ADR-047):** Acht datengetriebene Ereignisse mit je drei Entscheidungen wirken auf Staatskasse, Forschung und Fraktionsloyalität und setzen dauerhafte Flags; die Auswahl ist deterministisch aus Seed, Reich und Runde. Bis zu zwölf Ausgrabungsstätten entstehen deterministisch auf Planeten, werden erst nach vollständiger Analyse aufgedeckt und schreiten mit der Forschung pro Runde fort. Ab Runde 40 oder nach zwei abgeschlossenen Grabungen beginnt eine galaktische Krise, die in vier Stufen verläuft und über 150-◈-Beiträge eingedämmt werden kann. `NarrativeModal` bündelt Entscheidungen, Grabungen, Krisenstatus und Chronik; der „Chronik"-Knopf zeigt offene Ereignisse und aktive Krisen an.
- **Sieg, Niederlage & Punkte (ADR-048):** Drei deterministische Siegbedingungen – **Dominanz** (≥ 60 % der besiedelten Systeme und acht eigene Kolonien), **Transzendenz** (drei Tier-4-Technologien) und **Chronik** (drei Ausgrabungen und eingedämmte Krise) – sowie die Niederlage **Auslöschung** bei Verlust der letzten Kolonie. Der Ausgang friert nach dem ersten Ergebnis ein und wird mit Punkteaufschlüsselung und Rangliste gespeichert. `EndScreen` zeigt Sieg oder Niederlage; nach einem Sieg ist die Partie als Sandbox fortsetzbar. `VictoryModal` („Menü → Ziele & Punkte") zeigt den Fortschritt aller Bedingungen.
- **Persistenz v4:** Speicherformat `version: 4` inklusive Oberflächen, Kolonien (mit Steuersatz, Korruption, Approval und Steuereinnahmen), Forschungsständen, Zivilisationen (mit Staatskasse), Monden und Asteroidengürteln; v1-, v2- und v3-Spielstände werden automatisch migriert (v2 erhält leere Gürtel und deterministische Legacy-Monde aus `moonsCount`, v3 erhält Staatskassen- und Koloniefinanzwerte). Die in Stufe B ergänzten Credit-Bau- und Wartungskosten stammen aus dem Code-Katalog (`buildingCatalog.ts`), nicht aus dem Spielstand, und ändern das Speicherformat daher nicht. `empireStates` (Politik, Cooldown, Fraktionen), `narrative` und `outcome` sind optionale Felder; ältere Spielstände erhalten Standardwerte bzw. starten ohne Ausgang.

### 4.5 Spielstart, Bedienung & Benachrichtigungen (Feature-Paket)
- **Hauptmenü (`MainMenu`):** Neues Spiel, Spiel laden, Galaxie-Seeds verwalten, Roadmap, QA-Tests, Testing und Spiel beenden; dazu eine Schnellspeicher-Kachel und die zuletzt gestartete Galaxie mit „Mit diesem Seed fortfahren". Roadmap und QA sind aus dem Spielmenü ins Hauptmenü gewandert; das Spielmenü enthält nur noch Speicherstände, Hauptmenü und Spiel beenden (ADR-041).
- **Isoliertes Testlabor (ADR-056, ADR-057):** „Testing" öffnet eine eigene Ansicht außerhalb der Kampagne. Die Registry `src/testing/testLabRegistry.tsx` listet Testballons als eigenständige Komponenten; der erste Ballon führt den echten `SurfaceGenerator` mit Planetentyp (inklusive Xenowelt und Gasriese), Breite 6–36, Höhe 6–24 und Seed aus und zeigt Reproduzierbarkeitssignatur, Kacheln, Land-/Wasserstatistik mit Ozean-Landobergrenze, Kachel-Info, Ressourcen-Toggle sowie Biome-, Vorkommens-, Gefahren- und Höhenstatistiken. Weitere Ballons (Biom-Tiles, Gelände & Ressourcen, Kolonie, Bewegung, Speichern/Laden) sind als „geplant" geführt. Das Labor schreibt keine Spielstände und löst keine Rundenwechsel aus.
- **Galaxieerstellung (`GalaxyCreationScreen`):** „Neue Galaxie erschaffen" nutzt die bestehenden Generatorparameter (Größen-Presets, Form, Seed mit Zufallsbutton, Systemanzahl, Mindestabstand, Name). Neu sind die Auswahl einer von acht menschlichen Fraktionen (Name, Kurzprofil, Hintergrund, Farbe, Emblem, Flottenstil) und ein Regler für 0–7 KI-Gegner mit deterministischer Vorschau. „Mit bestehendem Seed fortfahren" lädt eine gespeicherte Konfiguration (ADR-042, ADR-052).
- **Seed-Bibliothek (`SeedLibrary`):** Jeder Spielstart merkt sich Seed, Parameter, erzeugte Systemanzahl, Generatorversion und Zeitstempel unter `astraea_4x_seed_library`. Gleiche Konfigurationen ergeben denselben Eintrag; maximal 100 Einträge. Ein geladener Spielstand enthält die vollständige Galaxie und regeneriert nichts.
- **Startflotte:** Kleine Fregatte, Aufklärungsschiff und Kolonieschiff stehen als drei getrennte Verbände im Heimatsystem. Kolonisten und Gründungsgüter liegen ausschließlich in der Schifffracht; es gibt keine automatische Kolonie und keine doppelte Gutschrift im globalen Lager (ADR-043).
- **Kolonisation mit Logistik:** Eine Gründung setzt Vermessung, ausreichende Habitabilität und ein beladenes Kolonieschiff voraus. `provisionColonyShip()` stellt ein Schiff bereit; nach der Gründung ist es verbraucht. Der `PlanetInspector` warnt bei fehlender Fracht und sperrt den Knopf.
- **Zentrale Benachrichtigungen:** Bau-, Rekrutierungs-, Forschungs-, Kolonisations-, Erkundungs- und Flottenabschlüsse laufen über `NotificationCenter` und `NotificationStack`. Meldungen stapeln sich überlappungsfrei, Duplikate werden per Schlüssel verworfen, jede Meldung schließt nach 10 Sekunden automatisch und lässt sich zusätzlich manuell schließen. Der gespeicherte Nachrichtenverlauf (`MessageLog`) bleibt als Journal über „Menü → Nachrichtenverlauf" jederzeit erreichbar und wird nur auf Wunsch geöffnet, filtert nach Kategorie, zeigt Runde, Betreff, Zielobjekt und Gelesen-Status und übersteht Speichern/Laden (ADR-044, ADR-052).
- **Flotten auf der Galaxiekarte:** Jede dominante Schiffsklasse hat eine eigene Silhouette und Farbe. Marker liegen ringförmig um das System, sind einzeln anklickbar und zeigen bei Auswahl Status, Ziel und Fracht. Handelsrouten bleiben sichtbar, änderbar und entfernbar; Flottenroute und Fracht überstehen den Spielstand (ADR-045).
- **Schiffe in beiden Systemansichten:** Umlaufbahn- und Detailansicht zeichnen dieselben `Fleet`-Daten als klickbare Marker außerhalb der Planetenbahnen bzw. in der oberen Leiste. Die Schiffsleiste zeigt Grafik aus `Tilesets/Raumschiffe` (Kolonie, Aufklärer, Fregatte, Kreuzer), Name, Typ, Fraktion, System, Standort, Bewegung, Ziel, antriebsabhängige Reichweite und vorhandene Ladung. Die Grafik wird vollständig per `object-contain` dargestellt; Korvette und Zerstörer nutzen die Fregatte als markierten Fallback (ADR-052, ADR-055).
- **Flottensteuerung über die Galaxiekarte:** Eigenes Schiff wählen, Zielsystem anklicken (gestrichelte Routenvorschau mit Sprungzahl), dasselbe System erneut anklicken oder „Auftrag erteilen" bestätigen. Ungültige Ziele werden mit Begründung abgewiesen; laufende Aufträge lassen sich umleiten oder abbrechen. Zoom und Kartenposition bleiben dabei unverändert (ADR-052).
- **Steuerregler ohne Nebenwirkung:** `setColonyTaxRate`, `setColonyWorkFocus` und `upgradeColonyTier` berechnen nur den Zustand neu. Ein vollständiger Wirtschaftszug mit Lagergewinnen und Wachstum läuft ausschließlich im Rundenwechsel (ADR-040).

---

## 5. Dokumentationsübersicht

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): Detaillierte Schichtenarchitektur und Modulgrenzen.
- [`docs/PHASE_1.md`](docs/PHASE_1.md): Dokumentation und Testergebnisse für Modul 1 bis Modul 4.
- [`docs/ROADMAP.md`](docs/ROADMAP.md): Vollständige Phasenübersicht und aktueller Umsetzungsstand.
- [`docs/MOO2_TURNLOGIK_BEFUNDE.md`](docs/MOO2_TURNLOGIK_BEFUNDE.md): Belege zur Zug- und Flottenlogik von Master of Orion 2 (Beobachtung, Inferenz, Unbekannt).
- [`docs/DECISIONS.md`](docs/DECISIONS.md): Architectural Decision Records (ADR-001 bis ADR-057).
