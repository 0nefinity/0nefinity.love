# unfoldingPi — Design

**Status:** v2 umgesetzt, 2026-10-23
**Datei:** `unfoldingPi.html`, Worker `tools/workers/pi-digits-worker.js`
**Quelle der Wünsche:** Tims Prompts vom 18.05.2026 (`~/.tmux/018-pi-falten-prompts.md`)

## Konzept

Pi als Kette von Zeichen (`3`, `.`, `1`, `4`, `1`, `5` ...), die an beiden
Enden ins Nichts verdichtet wird. Eine Zahlenfolge ohne Dicke lässt sich
unendlich oft in einen Punkt falten. Die Seite zeigt ein Fenster auf diese
Kette; an den Rändern stauchen sich Zeichen und Abstände, bis sie zu einer
hellen Linie zusammenfallen. Kein Text, kein Titel.

## Modell

Zustand (Bildschirm-Pixel): `L`, `R` (die beiden Enden), `X0` (linke Kante
von Zeichen 0, der `3`), `d` (Verdichtungsstrecke), `w` (Zeichenbreite).

Zeichen `i` liegt linear bei `p = X0 + i*w`. Warp von `p` auf Bildschirm-x:

| Bereich | x |
|---|---|
| `L+d <= p <= R-d` | `p` |
| `p > R-d` | `R - d * exp(-(p-(R-d))/d)` |
| `p < L+d` | `L + d * exp((p-(L+d))/d)` |
| `d = 0` | alles jenseits des Randes landet auf dem Rand |

Jedes Zeichen wird mit `scaleX` = lokale Ableitung gezeichnet (Zeichen und
Abstand stauchen gemeinsam). Der Zeichenvorrat liegt als x-Mipmap-Atlas vor.

### Linie aus Verdichtung

Die Linie wird nicht gemalt. Ein Zeichen wird horizontal höchstens bis auf die
Strichstärke der Schrift gestaucht (Mindest-Tintenbreite
`max(2 Gerätepixel, 0,08 * font-size)`, Courier-Strich ca. 0,08 em); der
Vorschub geht weiter gegen 0. Unter dieser Breite wird das Zeichen als
Silhouette gezeichnet (je Zeile die stärkste Tinte, eine Spalte breit, auf
Strichbreite gezogen), sodass schon wenige Stellen eine geschlossene Zeile
ergeben. Die Zeichen liegen zu vielen im selben Streifen; Source-over-Alpha
sättigt es zusätzlich, pro Rand werden so viele weitere Zeichen gezeichnet,
bis die Spalte gesättigt ist (`160 + d/w*ln(d*dpr)`, höchstens 4000). Ergebnis:
ein satter Strich so dick wie ein Ziffernstrich und so hoch wie die Ziffern.
Farbe aus
`meta.css` (`--text-color`), dunkel und hell lesbar.

Voreinstellung `d = w`: Verdichtung nur innerhalb der letzten Zeichenzelle.
Einstellbar über `tools/controls.js` (Regler "Verdichtung", 0 erlaubt, nach
oben offen).

### Gewählte Lesarten

- Solange links nichts eingerollt ist, IST die `3` das linke Ende.
- Die `3` ziehen trägt die Kette (rechtes Ende bleibt); eine Linie ziehen
  bewegt nur das Ende, die Kette steht.
- Slider nach links: Kette läuft nach links in die vordere Linie; nach rechts:
  rückwärts, Halt, sobald die `3` wieder vorn steht. Der Slider federt nicht
  zurück.
- Der Dezimalpunkt gehört zur Kette (Index 1).
- Startzustand: `3` plus genau eine Zelle, in der sich ".14159..." verdichtet,
  Gruppe mittig.
- Fehlen links eingerollte Ziffern, gibt es dort keine Linie; ihre Dichte
  wächst mit der Zahl eingerollter Stellen.

## Interaktion

| Geste | Wirkung |
|---|---|
| Rechte Linie ziehen | `R` bewegt sich, Kette steht, Stellen erscheinen oder verschwinden |
| `3` ziehen (nichts links eingerollt) | `X0` und linkes Ende wandern, `R` bleibt |
| Linke Linie ziehen (links eingerollt) | `L` bewegt sich, Kette steht; erreicht sie die `3`, geht es nahtlos in "3 ziehen" über |
| Wischen auf der Kette | Kette folgt dem Finger, `L` und `R` stehen; erreicht die `3` die Front, folgt das linke Ende der `3` |
| Slider unten (Mitte = Stopp) | exponentielle Kennlinie, nach oben offen; Maximum ist die Rechen- und Zeichengeschwindigkeit, die Kette wartet am Rechenlimit |
| Fenstergröße | Enden bleiben im Bild |

Pointer Events, `touch-action: none`, `setPointerCapture`, Trefferflächen
mindestens 40 px breit.

## Architektur

- Eine DPR-scharfe Canvas, ein Slider, sonst kein DOM.
- Pi-Stellen: Web Worker `tools/workers/pi-digits-worker.js`
  (Chudnovsky, BigInt, Binary Splitting, unbegrenzt in Blöcken, Zielgröße
  verdoppelt sich). 1000 Stellen als eingebettete Reserve, damit der Start
  sofort steht und der Worker dagegen geprüft wird.
- Pi endet nie (Fix 2026-10-23). Es gibt keine feste Stellengrenze; einzige
  Grenze ist die Rechenleistung. Die Quadratwurzel läuft per Newton mit
  Genauigkeitsverdopplung (vorher volle Newton-Schritte: bei 1e6 Stellen
  7,6 s statt 2,7 s). Die Seite fordert das Doppelte der Front an, der
  Worker rechnet die nächste Stufe also, sobald die Anzeige die Hälfte des
  Vorrats erreicht. Steht die Anzeige an der letzten Stelle, wartet sie
  (`.stage.warte`, dezent pulsierende Linie, `state().waiting`), ohne
  Fehler und ohne Rücksprung. Inkrementelles Binary Splitting war
  gemessen langsamer und ist nicht eingebaut.
- Fail loud: Worker-Fehler oder falsche Stellen führen zu `console.error`,
  rotem Rahmen (`.stage.fehler`), gestopptem Slider und eingefrorener Kette.
  Kein stiller Fallback.
- Nur lesende Testschnittstelle: `window.unfoldingPi.state()` mit
  `{L, R, X0, d, startIndex, endIndex, visibleCount, velocity, error, ...}`.
- Strikt same-origin, keine Fremdressourcen.

## Acceptance Criteria

Prüfbar per Playwright gegen `https://dev.0nefinity.love/unfoldingPi` über
`window.unfoldingPi.state()` (Pixelprobe per `getImageData` auf der Canvas).

1. Start: `startIndex 0`, `visibleCount 1`, Gruppe mittig.
2. Pixeltest: Randspalte über Ziffernhöhe mit Mittelwert >= 0.9 und Minimum
   >= 0.6 der Textfarbe, rechts im Start, beide Seiten nach Wischen mit
   vielen eingerollten Stellen, auch im hellen Thema; links ohne Einrollung
   keine Linie.
3. Rechte Linie, `3`, linke Linie, Wischen, Slider links (startIndex wächst),
   Slider Mitte (steht), Slider rechts (sinkt, Halt bei 0) verändern den
   Zustand wie in der Tabelle; Maus und Touch.
4. Die ersten 3000 Stellen des Workers stimmen mit einer unabhängigen
   Referenz (Machin) überein; die Reserve ebenso. Stellen 99.991-100.000 =
   5493624646 und 999.991-1.000.000 = 5779458151 (gegen mpmath geprüft).
5. Keine Konsolenfehler, alle Requests same-origin, Fehlerpfad zeigt
   `error`, `console.error` und roten Rahmen.
6. Mobil (390x844): Startzustand im Bild, Linie satt.
