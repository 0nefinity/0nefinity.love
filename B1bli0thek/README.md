# inf-Elemente

Jedes Grundelement des Browsers als Web Component, das sich wiederholen, verschieben, krümmen und skalieren lässt.
Ein ES-Modul je Element, ohne Abhängigkeiten. `alle.js` registriert alle auf einmal.
Der sichtbare Name steht nur in `name.js`. Alle Pfade sind relativ, der Ordner lässt sich umbenennen.

## Einbinden

Alle Elemente:

```html
<script type="module" src="./alle.js"></script>
<inf-button></inf-button>
```

Nur eines:

```html
<script type="module" src="./inf-line.js"></script>
<inf-line repeat="∞" bend="2"></inf-line>
```

Das Element ist ein Block mit `height: 16rem`; Größe per CSS setzen, z. B. `inf-box { height: 100vh; }`.

## Gemeinsame Attribute

Die Attribute setzen den Startzustand. Jede Geste schreibt den neuen Zustand zurück in die Attribute, sie sind die API.

| Attribut | Wert | Bedeutung |
|---|---|---|
| `repeat` | Zahl oder `∞` | Anzahl Kopien, `0` ist erlaubt |
| `bend` | Grad | Krümmung je Kopie |
| `scale` | Faktor | Größe je Kopie im Verhältnis zur vorigen |
| `angle` | Grad | Richtung, in die die Reihe wächst |
| `space` | px | Schritt zwischen Kopien: `0` legt alle deckungsgleich übereinander, positive Werte führen sie auseinander. Ohne Attribut: Abstand aus der Größe |
| `gap` | px oder `auto` | fester Schritt statt Abstand aus der Größe |
| `shift` | `x y` in px | Verschiebung des Ursprungs |
| `rotate` | `false` | Kopien folgen der Krümmung nicht mit |
| `bare` | (ohne Wert) | blendet die eigene Leiste (nur 0 1 ∞) aus |
| `capacity` | (ohne Wert) | Kapazitätsmodus (`∞+`): bei `∞` darf die Zahl der Kopien 80 % eines Bildtakts verbrauchen statt 35 %; Entfernen setzt sofort zurück |

Die Leiste jedes Elements hat nur 0 1 ∞. Alles andere (Form, Text, `∞+`, Krümmung, Winkel, Abstand, Größe) liegt im eingeklappten controls.js-Panel der Seite darunter; es lässt sich am Griff hochziehen (Maus oder Wischen), die Leiste fährt oben auf der Kante mit. Die Seite setzt dafür `--leiste-hoch` und `--leiste-versatz` (px) auf das Element. Doppeltipp auf einen Regler setzt ihn auf 0 (Größe auf 1). Das Feld „Anzahl“ im Panel setzt `repeat` auf eine endliche Zahl (große Zahlen erlaubt, `∞` als Text schaltet auf adaptiv); bei ∞ läuft das Feld mit. Links in der Griffzeile steht dezent die Gesamtzahl der Kopien, dieselbe Zahl wie im Feld „Anzahl“ (`∞`, wenn die Reihe nie endet); Antippen öffnet das Panel und setzt den Cursor ins Feld. Das Element meldet die Zahl als Ereignis `inf-zaehl` (`detail: { gezeigt, ziel, grund }`, auch `el.gezaehlt`). Bei `∞` steht dort `∞`, wenn das Bild das unendliche ist; sonst die Zahl der gezeichneten Kopien mit einem Wort, warum nicht (`grund`: `dicht`, `schwingt`, `DOM`). Unter den Reglern steht, womit gezeichnet wird (`GPU`, `Software` oder `unbekannt`, mit Name des Renderers; ohne WebGL2 `DOM`). Meldungen wie „Rückgängig“ sitzen immer über Panel-Oberkante und 0/1/∞-Leiste, nie darauf (`Controls.keepClear`).

`∞` heißt unendlich, nicht viel. `∞` bleibt `∞`, egal welcher Regler sich danach bewegt; nur 0, 1 oder eine eingetippte Anzahl verlassen es. Gezeichnet wird das Grenzbild der unendlichen Folge (siehe Geschlossene Form). Wo das nicht exakt geht, zählt der Zähler ehrlich die gezeichneten Kopien mit einem Wort: `dicht` (mehr als 4 194 304 Orte im Bild, oder der Kreis schließt sich nicht auf 0,001°), `schwingt` (wachsende Spirale ohne Drehung, deren Grenzpunkt in der Kopie liegt), `DOM` (Elemente ohne Faltung, und der DOM-Weg).

Adaptiv ist nur, was endlich ist, und die Qualität: Auf dem DOM-Weg (und bei endlichen Anzahlen) misst jedes Element, was das Gerät schafft. Es beginnt bei 720 Kopien und vergrößert die Zahl, solange Layoutzeit und Bildtakt (gemessen gegen die Bildwiederholrate des Bildschirms) Luft lassen; ruckelt es, geht die Zahl wieder zurück, nie unter 720. Keine Pauschale, die Obergrenze ist nur Schutz (4 194 304 gefaltete Kopien, 6000 auf dem DOM-Weg).

Faltung (`faltung.js`): Bei `button`, `line`, `field`, `link`, `box`, `image`, `letter` und `text` bleibt nur die erste Periode echtes DOM (eine Kopie, bei `text` eine je Form). Von ihr nimmt die Seite ein Bild (SVG-`foreignObject`) und zeichnet es per WebGL2-Instancing an jeden weiteren Ort, je Kopie nur x, y, Drehung, Größe. Ein Klick auf ein Spiegelbild geht an dieselbe Stelle der echten Kopie, Eingaben erneuern das Bild. Ohne WebGL2 bleibt alles DOM (eine Meldung in der Konsole). `list`, `table`, `range` und `check` bleiben DOM.

Geschlossene Form: Ist der Pfad periodisch (Drehung an, oder gerade, oder fester `gap`), rechnet die CPU keine Orte mehr. Kopie i = qP + r liegt bei z_r + D_r·(Wᵠ−1)/(W−1) mit W = scaleᴾ·e^{iPβ}; der Vertex-Shader rechnet das je Instanz aus der Instanz-Nummer. Gezeichnet wird nur das Fenster, das den Bildschirm berührt. Bei `∞` je Fall das Grenzbild:
- Stapel (alle Kopien aufeinander, Größe 1): ein Fragment-Shader rechnet je Bildpunkt die Deckkraft 1−(1−a)ᵐ, auch für m = ∞.
- Gerade Reihe, Strahl (Größe 1, ohne Krümmung): jeder Bildpunkt sieht nur endlich viele Kopien; alle, die das Bild berühren, werden gezeichnet.
- Kreis (Größe 1): `bend` steht auf 0,001° genau, also schließt sich die Bahn nach b Perioden. Eine Runde wird in eine Ablage gezeichnet (Deckung F, Deckkraft A); unendlich viele Runden übereinander haben den Fixpunkt F/A, den ein letzter Pass ins Bild schreibt (A unter 1/255 ist Filterrest, kein Stoff, und bleibt F).
- Schrumpfend (Spirale, Reihe, Nest): Kopien bis dorthin, wo der ganze Rest weniger als 1/256 Bildpunkt bedeckt (geometrische Reihe der Flächen). Kopien unter 2 Bildpunkten zeichnet der Shader als Fleck mit ihrer echten Fläche und der mittleren Farbe (gröbste Mipmap), so landet die Dichte am Grenzpunkt.
- Wachsend: bis die Kopie 64 Bildschirmdiagonalen misst (der Bildschirm ist dann kleiner als ein halber Texel); verlassen die Kopien das Bild, ist das exakt.

Endliche Anzahlen zeichnen beim Kreis eine Runde, bei der Spirale bis die Kopien unter einen halben Pixel schrumpfen. Klicks auf Spiegelbilder findet die Seite über dieselbe Formel.

Methoden: `mehr(n)`, `unendlich()`, `eins()`, `ursprung()`, `kruemme(grad)`, `skaliere(faktor)`, `verschiebe(dx, dy)`, `vermessen()`.
Lesbar: `zustand`, `kopien`, `kapazitaet`. Ereignis bei jeder Änderung: `inf-change` (Detail = `zustand`).

Gesten: ein Finger zieht, zwei Finger drehen (krümmen) und spreizen (skalieren). Mausrad krümmt, mit Umschalt/Strg skaliert es.
Tasten: Pfeile verschieben (mit Umschalt weiter), `+` `-` eine Kopie mehr/weniger, `[` `]` krümmen, `,` `.` skalieren, `0` zurück, `8` unendlich.

## Elemente

Button, jeder Druck ein Button mehr. `label` (Standard `Button`) ändert den Text, `shape` die Form: `eckig`, `rund`, `pille`, `kreis`. Im Panel der Seite: Auswahl für `shape`, Textfeld für `label`:
```html
<inf-button label="Button" shape="rund"></inf-button>
```

Linie (`art` wie `border-style`):
```html
<inf-line length="50vmin" weight="1px" art="dashed"></inf-line>
```

Textfeld, alle Kopien schreiben mit (`multiline` für mehrzeilig):
```html
<inf-field value="018"></inf-field>
```

Checkbox oder Radio, die Wahl läuft als Welle durch:
```html
<inf-check type="radio"></inf-check>
```

Schieberegler mit Nullpunkt in der Mitte (Mittelmarke, Doppelklick/Doppeltipp setzt auf 0; `min`/`max` frei, auch negativ), alle folgen um `phase` versetzt:
```html
<inf-range min="-100" max="100" value="0" phase="7"></inf-range>
```

Link; ohne `href` gibt er sich selbst ein weiteres Mal, mit `href` ist er ein echter Link:
```html
<inf-link text="∞" href="/018"></inf-link>
```

Bild, ineinander:
```html
<inf-image src="../assets/circle.svg" size="60vmin" scale="0.8"></inf-image>
```

Liste (`type="ul"` für Punkte, `marker` ersetzt den Punkt):
```html
<inf-list type="ul" text="0" marker="1"></inf-list>
```

Tabelle (`cell="index"` schreibt Zeile und Spalte in jede Zelle):
```html
<inf-table cols="5" cell="index"></inf-table>
```

Box, Antippen schaltet die Ecken durch:
```html
<inf-box size="60vmin" radius="0" border="1" shadow="0"></inf-box>
```

Text in jeder Form (`form="alle"`, eine Form wie `h1` oder eine Liste `h1 p code`):
```html
<inf-text form="h1 p code" text="0 1 ∞"></inf-text>
```

Buchstabe, jedes Zeichen:
```html
<inf-letter char="∞" size="8rem"></inf-letter>
```

## Neues Element

Eine Datei `inf-<name>.js`, die von `InfElement` aus `kern.js` erbt und `baueKopie(i)` (und bei Bedarf `fuelleKopie(k, i)`) überschreibt, dann eine Zeile in `elemente` in `alle.js`. Die Sammelseite liest die Liste von dort.
