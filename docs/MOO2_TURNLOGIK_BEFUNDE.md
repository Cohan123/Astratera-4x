# Master of Orion 2 – Befunde zur Zug- und Flottenlogik

Stand: 29.10.2026

Dieses Dokument trennt strikt zwischen **Beobachtung** (direkt aus dem
Artefakt oder Handbuch belegbar), **Inferenz** (begründete Schlussfolgerung)
und **Unbekannt** (nicht belegt). Es enthält keinen dekompilierten Quelltext
und keine erfundenen Werte. Die Übertragung auf Astraea 4X steht am Ende.

## 1. Ziel und Vorgehen

Untersucht werden sollte, wie Master of Orion 2 (Heroic/GOG-DOS-Installation)
seinen Zug auflöst und wie Flottenbewegung, Zwischenziele und Ankunftszeiten
zusammenhängen – als Vorlage für eine behutsame Erweiterung von Astraea 4X.
Werkzeug war REA; ergänzend wurden das offizielle Handbuch und ein eigener
LE-Parser verwendet.

## 2. Artefakt

| Feld | Wert |
| --- | --- |
| Datei | `Orion2.exe` (Heroic/GOG-Installation, DOS-Version) |
| SHA-256 | `e38efc2765caf45670f1574cab000c3700577d3f3fa5f73781563163a764a829` |
| Größe | 1.512.404 Bytes |

### Beobachtung: Schichten der Datei

| Bereich | Datei-Offset | Inhalt |
| --- | --- | --- |
| DOS/MZ-Stub | `0x00000`–`0x0E67B` | 16-Bit-Stub, startet den Extender |
| BW-Modul | `0x0F474` (62.580) | `4GWPRO.EXP`, DOS-4GW-Extender; `next_module` = 157.268 |
| MZ-Stub | `0x26654` (157.268) | zweiter 16-Bit-Stub |
| LE-Modul | `0x292E4` (168.676) | 32-Bit-Linear-Executable des Spiels |
| Debug-/Symbolblob | `0x2052E4` | 493.638 Bytes Symbol- und Modulmetadaten |

**Inferenz:** Das Spiel ist kein DOS/16M-BW-Programm. Der BW-Anteil ist nur der
DOS/4GW-Extender; die eigentliche Spiellogik liegt im LE-Modul. Deshalb ist
der LE-Header die richtige Analysebasis.

## 3. LE-Header (dekodiert)

| Feld | Wert |
| --- | --- |
| Pages | 365 × 4096 Bytes |
| Objekte | 2 |
| EIP | Objekt 1, Offset `0xFFEFC` |
| ESP | Objekt 2, Offset `0x5DCD0` |
| Object-Page-Table | LE+`0xF4`, 4 Bytes pro Page |
| Fixup-Page-Table | LE+`0x6B1`, 366 × u32 |
| Fixup-Record-Table | LE+`0xC69` |
| Datenpages (LE-relativ) | `0x6F000` (Datei `0x982E4`) |

### Extrahierte Objekte

| Objekt | Bytes | Pages | SHA-256 |
| --- | --- | --- | --- |
| Objekt 1 (Code) | 1.413.120 | 345 | `76fe4ba3c2ccd03cb5f0869f3dcd5ba6f71ed13bdbe06e8d167a87e95b8d40f4` |
| Objekt 2 (Daten) | 81.920 | 20 | `a40f9fbefe1f270a0b10b6f629d8d03b492b6301c715c892452d3c7239bc2ecd` |

**Beobachtung:** `EIP 0xFFEFC` liegt in Objekt 1 und zeigt auf plausiblen
32-Bit-Funktionscode. Lineare Basis: Objekt 1 bei `0x10000`, Objekt 2 bei
`0x169000`.

## 4. Symboltabelle

**Beobachtung:** Ab Blob-Offset `0x3F16D` liegen 7.801 Datensätze im Format

```
[u8 Länge][Name (Länge Bytes)][u32 Adresse][5 Byte Metadaten]
```

Metadaten: `meta[0]` = 1 (Code) oder 2 (Daten), `meta[1]` = `0x00`,
`meta[2]` = Modul-/Dateiindex, `meta[3..4]` = Typ-Tail. Die Adressen sind
modulrelativ und überlappen zwischen Modulen (z. B. Modul 6: `0x3822`–`0x58A8`,
Modul 7: `0x3A3D`–`0x58AC`).

### Zielfunktionen der Zug- und Bewegungslogik

| Symbol | Adresse | Modul |
| --- | --- | --- |
| `Next_Turn_Calc_` | `0x3822` | `0x06` |
| `Do_Autosave_` | `0x3870` | `0x06` |
| `Next_Turn_` | `0x39E8` | `0x06` |
| `Get_Winner_` | `0x58A8` | `0x06` |
| `Do_Next_Turn_` | `0x73532` | `0x34` |
| `Do_Begin_Of_Turn_` | `0x7AF32` | `0x35` |
| `Parsecs_Between_Stars_` | `0xDBECF` | `0x6A` |
| `Dist_Between_Stars_` | `0x6B0DF` | `0x31` |
| `Build_Parsec_Star_Distances_` | `0x52C6B` | `0x25` |
| `Ship_Range_` | `0xEF4CD` | `0x77` |
| `Star_In_Extended_Range_Of_Player_` | `0xEF6A2` | `0x77` |
| `Move_Ships_With_Possible_Intermediate_` | `0xC7B2C` | `0x5F` |
| `Ship_N_Turns_To_Star_With_Intermediate_` | `0xC3A4C` | `0x5C` |
| `Compute_Star_Player_Range_Info_` | `0xC3D18` | `0x5C` |
| `Player_N_Turns_From_Star_To_Star_` | `0xEFCEC` | `0x77` |
| `Make_Ships_Move_To_` | `0xEFDAD` | `0x77` |
| `Ship_Is_Moving_` | `0xEFDBE` | `0x77` |
| `Make_Ship_Arrive_At_Star_` | `0xEFECE` | `0x77` |
| `Move_All_Ships_Toward_Stars_` | `0xEFFF4` | `0x77` |
| `Update_Ship_ETAs_` | `0xF04FD` | `0x77` |
| `Get_ETA_To_Star_` | `0x8A64F` | `0x3B` |
| `Lose_Out_Of_Range_Ships_` | `0xDD8EC` | `0x6D` |
| `Player_Lose_Out_Of_Range_Ships_` | `0xDD8A3` | `0x6C` |

**Inferenz:** Die Namensliste belegt die Struktur der Zuglogik, nicht ihre
Interna: ein zentraler Zugrechner, ein Rundenbeginn, eine getrennte
Bewegungsphase und eine eigene ETA-Aktualisierung. „Intermediate“ im Namen
bestätigt, dass Zwischensterne ein eigenes Konzept sind.

## 5. Handbuch-Evidenz

Zitiert nach der mitgelieferten `Manual.PDF` (Seitenangaben der gedruckten
Seiten):

- Antriebe und Treibstoff: 2–7 Parsec pro Runde; Standard-/Deuterium-/Iridium-
  Fuel-Cells reichen für 4/6/9 Parsec **und zurück**; Extended Fuel Tanks
  erhöhen die Reichweite um 50 % (S. 77–78, 110–111).
- Reichweite eines Verbands: „No fleet can travel any farther from one of your
  colonies or outposts than the shortest range of any ship in that fleet. The
  fleet also travels at the speed of its slowest ship.“ (S. 110–111)
- Out-of-Range: Wird ein Verband nachträglich out of range, „that fleet
  immediately retreats to the nearest friendly colony.“ (S. 110–111)
- Hyperraum: „Once a fleet is in hyperspace … you can no longer contact it to
  give orders“, außer mit entsprechender Kommunikationstechnik (S. 110–111).
- Zugende: Der Zeitlauf stoppt u. a. bei „One of your fleets has arrived at its
  destination.“ (S. 29)

## 6. Fixup-Versuch und seine Grenze

**Beobachtung:** Der Fixup-Record-Parser konsumiert alle 365 Pages exakt
(driftfrei) und findet ausschließlich zwei Record-Formen: 11.165 ×
`(Quelle 7, Ziel 0, 2 Byte)` und 40.186 × `(Quelle 7, Ziel 0, 4 Byte)` –
insgesamt 51.351 Records. Ziele sind überwiegend Objekt 2 (48.094), seltener
Objekt 1 (3.257).

**Beobachtung:** Nur 1.301 der 51.351 Ziel-Slots sind vor der Fixup-Anwendung
vollständig null (2,5 %). Nach Anwendung der Fixups findet sich für die
String-Adresse von `"in next-turn"` (`0x166D3C` im linearen Abbild) **kein**
einziger 32-Bit-Verweis. Geschriebene Slots landen teils mitten in
Stringliteralen statt auf Pointer-Feldern.

**Inferenz:** Die Record-Struktur ist korrekt geparst, aber die Quelle-Offsets
sind anders zu interpretieren als „Byte-Offset within page“ (naheliegend:
andere Bezugsbasis oder zusätzliche Listenkodierung). Ohne korrekte
Quellzuordnung sind absolute Adressen im Image nicht auflösbar.

**Unbekannt:**

- Zuordnung Quelle → konkreter Pointer-Slot.
- Basisadresse pro Modul im Code-Objekt; die Symboladressen sind modulrelativ
  und ohne diese Basis nicht auf lineare Adressen abbildbar.
- Vollständige Modulpfad-Tabelle (133 Pfadtreffer `L:\MOX\…`/`D:\MOX\…` im
  Blob-Bereich `0x35F33`–`0x374E7`, Muster `[u8 0][u8 Länge][Pfad]`, Record-
  Größe/Padding noch nicht bestimmt). Damit sind Modulindizes wie `0x77` noch
  keinem sicheren Quelldateinamen zugeordnet.
- Echte Dekompilation: Ghidra 12.1 besitzt keinen LE-Loader (nur MZ/NE/PE);
  ein Raw-Import der extrahierten Objekte wäre der nächste Schritt.

**Konsequenz für die Dokumentation:** Alle Aussagen zur Zugreihenfolge stützen
sich auf Symbole, Handbuch und beobachtbares Spielverhalten – nicht auf
dekompilierten Code.

## 7. Übertragung auf Astraea 4X (ADR-053)

Übernommen wurden nur Äquivalente, die die bestehende Architektur erweitern:

| MoO2-Beobachtung | Astraea-Umsetzung |
| --- | --- |
| ETA in Runden über Distanz und Reichweite | `turnsForHops(hops, rangeHops)` = aufgerundete Sprünge ÷ Sprünge pro Runde |
| Zwischensterne als Teil der Route | optionales `waypointSystemIds`, verkettete Hyperlane-Pfade über `planRoute()` |
| Feste Auflösungsreihenfolge pro Runde | `advanceTurn` bewegt Verbände sortiert nach ID |
| Ankunft beendet den Zug | `fleet:arrived`, `arrivedFleetIds`, `movedFleetIds`, `hopsTraveled` |
| „n turns to star“ in der Oberfläche | `ShipInfoBar` zeigt „Ankunft: in N Runden (M Sprünge)“ |

**Bewusst nicht übernommen** (würde bestehende Mechanik ersetzen):

- Treibstoff- und Reichweitenverlust sowie erzwungener Rückzug bei Out-of-Range.
- Flugabbruch-Verbot im Hyperraum; Astraea erlaubt `retargetFleet` im Flug.
- Geschwindigkeit nach dem langsamsten Schiff; Astraea nutzt die Reichweite
  des Reiches.
- Kein neues Save-Feld: Zwischenziele stecken ausschließlich im bereits
  persistierten `pathSystemIds`.

## 8. Reproduktion

```bash
# Symboltabelle
python3 - <<'PY'
# Blob ab 0x2052E4, Records ab 0x3F16D, Format siehe Abschnitt 4
PY

# Fixup-Statistik (nur Diagnose, keine gültige Linearisierung)
python3 /tmp/opencode/lefix.py
```

Die extrahierten Objekte und `moosyms.json` liegen unter `/tmp/opencode/`
und sind nicht Teil des Repositories.
