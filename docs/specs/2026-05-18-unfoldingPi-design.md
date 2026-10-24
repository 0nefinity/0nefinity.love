# unfoldingPi — Design

**Status:** v2 umgesetzt, 2026-10-23
**Datei:** `unfoldingPi.html`, Modul `tools/irrational.js`, Worker `tools/workers/irrational-worker.js`
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
- Stellen: gemeinsames Modul `tools/irrational.js` (global `Irrational`) mit
  Worker `tools/workers/irrational-worker.js`. Es rechnet pi, e, ln 2, √2 und
  φ; die Seite wählt per `panel.addSelect` (oder `?c=`), ein Wechsel startet
  die Kette neu. Algorithmus je Konstante nach dem Vorbild von y-cruncher:
  pi Chudnovsky, e Taylorreihe, ln 2 Machin-artige acoth-Formel (jeweils
  Binary Splitting), √2 und φ ganzzahlige Wurzel (`mpz_sqrt`); Quellen im
  Plan `docs/plans/PLAN-irrational.md`. 1000 Stellen pi als eingebettete
  Reserve, damit der Start sofort steht und der Worker dagegen geprüft wird.
  Die Seite fordert das Doppelte der Front an; steht die Anzeige an der
  letzten Stelle, wartet sie (`.stage.warte`, `state().waiting`), ohne
  Fehler und ohne Rücksprung. Nach einem Fehler ist `.warte` weg.
- Grenzen: Die Kette ist nicht unendlich. Zeit ist keine Grenze, Speicher
  ist eine. Ganzzahlen liegen in GMP als WebAssembly (`gmp-wasm` 1.3.2 mini,
  LGPL-3.0, gehostet in `tools/vendor/gmp-wasm/`). Das wasm32-Modul
  adressiert höchstens 4 GiB; ein Byte-Patch (`patch-4gib.js`) hebt die
  Standardgrenze darauf an. Das ergibt etwa 2,8e8 Stellen pi; je Stelle
  braucht pi 12 Byte, e 10, ln 2 13, √2 und φ 9. Dazu kommt die
  V8-Stringgrenze von etwa 5,36e8 Zeichen. Der Worker meldet genau eine
  Grenze, in zwei Klassen:
  - `engine`: Rechenwerk oder Stringgrenze (4 GiB, Stringlänge, BigInt-Grenze
    der Engine). Auf der Seite steht kein Text, nur `console.warn`; die
    Anzeige bleibt stehen.
  - `device`: das Gerät gibt keinen Speicher mehr her. Vor jeder Stufe
    reserviert der Worker den geschätzten Bedarf (malloc, sofort frei; der
    Linearspeicher wächst dabei per `memory.grow`), gedeckelt auf Modul-
    Maximum minus Grundspeicher. Scheitert dieses `memory.grow`, ist das die
    Gerätegrenze, auch in der letzten Stufe (Bedarf etwa 4 GiB). Die Engine-
    Grenze meldet nur die Vorabprüfung (nächste Stufe passt nicht unter 4 GiB).
    Die Seite zeigt einen winzigen grauen Hinweis auf Englisch: "use better
    hardware to get access to more digits". Annahme dahinter: ein besseres
    Gerät kommt weiter.
  Stürzt der Tab bei Speichermangel ab, lässt sich das nicht abfangen; dann
  gibt es keinen Hinweis. Alles andere meldet `error` laut (`console.error`,
  roter Rahmen), nie still. Der Fehlertext wird nie zur Klassifikation
  gelesen: ein GMP-Abbruch ("Fatal error in gmp-wasm" ist auch die Meldung für
  Division durch 0) und ein Allokationsfehler mitten in der Rechnung sind
  Fehler, kein Hinweis. Messung und Tests: `tests/irrational/`,
  `tests/unfoldingPi/`.
- Stufe 2 (nicht gebaut): Memory64 oder ein eigener GMP-Build ohne 4-GiB-Grenze,
  Out-of-Core über OPFS, Mehrkern, weitere Konstanten (γ, ζ(3), Catalan). Für
  eine spätere fälschungssichere Benchmark-Bestenliste würde das Ergebnis
  nicht als Zahl eingereicht, sondern über Stellen belegt, die der Server
  stichprobenartig nachrechnet. Wer die Stellen hat, hat gerechnet.
- Rückfall ohne WebAssembly (Safari im Lockdown-Modus): ist `WebAssembly`
  nicht vorhanden oder nicht benutzbar, rechnet der Worker dieselbe Konstante
  mit JS-BigInt und schickt einmal `{type:'notice'}`. Die Seite zeigt das ohne
  Text als dünnen ockerfarbenen Rahmen (`.stage.hinweis`, `state().notice`)
  plus `console.warn`; der Drift läuft weiter. In Firefox und Safari endet
  die Kette dort an der BigInt-Grenze der Engine (ab etwa 1e5 Stellen); das
  ist eine `engine`-Grenze: kein Text, `console.warn`, Anzeige bleibt stehen.
  Scheitert das Laden des Bundles bei vorhandenem WebAssembly, greift
  derselbe Rückfall samt `notice` mit dem Grund; still ist er nie.
- Lizenz und Herkunft: `gmp-wasm` 1.3.2 (npm, `dist/mini.umd.min.js`,
  unverändert) und GMP stehen unter LGPL-3.0-only. Die Texte liegen same-origin
  als `tools/vendor/gmp-wasm/LICENSE-LGPL-3.0.txt` und `LICENSE-GPL-3.0.txt`
  (GPL aus `/usr/share/common-licenses/GPL-3`), Herkunft in `README.md` daneben
  und als Kommentar im Worker; auf der Seite steht dazu kein Text. Die
  Ordner-`.htaccess` dort schaltet den Textviewer der Wurzel-`.htaccess` für
  `.txt` und `.md` ab, sonst lieferte der Server eine HTML-Seite aus.
- `worker.onmessage` fängt Ausnahmen beim Anhängen neuer Stellen ab und meldet
  sie über `fail('Stellen nicht verarbeitbar: ...')`.
- Fail loud: Worker-Fehler oder falsche Stellen führen zu `console.error`,
  rotem Rahmen (`.stage.fehler`), gestopptem Slider und eingefrorener Kette.
  Kein stiller Fallback; der einzige Rückfall (BigInt ohne WebAssembly) meldet
  sich sichtbar und per `console.warn`.
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
