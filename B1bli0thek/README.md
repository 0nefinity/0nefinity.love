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
| `space` | px | Abstand zwischen Kopien |
| `gap` | px oder `auto` | fester Schritt statt Abstand aus der Größe |
| `shift` | `x y` in px | Verschiebung des Ursprungs |
| `rotate` | `false` | Kopien folgen der Krümmung nicht mit |
| `bare` | (ohne Wert) | blendet die Leiste 0 1 ∞ aus |

Methoden: `mehr(n)`, `unendlich()`, `ursprung()`, `kruemme(grad)`, `skaliere(faktor)`, `verschiebe(dx, dy)`, `vermessen()`.
Lesbar: `zustand`, `kopien`. Ereignis bei jeder Änderung: `inf-change` (Detail = `zustand`).

Gesten: ein Finger zieht, zwei Finger drehen (krümmen) und spreizen (skalieren). Mausrad krümmt, mit Umschalt/Strg skaliert es.
Tasten: Pfeile verschieben (mit Umschalt weiter), `+` `-` eine Kopie mehr/weniger, `[` `]` krümmen, `,` `.` skalieren, `0` zurück, `8` unendlich.

## Elemente

Button, jeder Druck ein Button mehr:
```html
<inf-button label="1"></inf-button>
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

Schieberegler, alle folgen um `phase` versetzt:
```html
<inf-range min="0" max="100" value="50" phase="7"></inf-range>
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
