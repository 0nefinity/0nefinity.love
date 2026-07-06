# 0ne Studio — KI bedient die visuellen Tools, du schaust live zu

- **Datum:** 2026-07-06
- **Repo:** `dev.0nefinity.love` (Branch `claude-dev`)
- **Status:** Design / Spec (Brainstorming abgeschlossen)
- **Modell-Arbeitsteilung:** Research + Spec + Plan mit Opus 4.8. **Der Bau erfolgt mit Fable 5.**

---

## 1. Nordstern

Eine KI (Claude, von außen per Browser-Automation) soll die verstreuten visuellen
Tools von 0nefinity **wie ein Mensch bedienen** können: Regler drehen, direkt auf
dem Canvas ziehen, das Ergebnis **sehen**, beurteilen, nachjustieren, Video
rausrendern. Tim schaut dabei in **Echtzeit** zu — ein Livestream davon, wie die
KI spielt und Erkenntnisse gewinnt.

Zweitrangig, aber als angenehme Konsequenz: das ist zugleich der Weg zur
**Vereinheitlichung**. Jedes Tool, das auf `controls.js` gehoben wird, wird
dadurch automatisch KI-fähig. Kein separater Umbau nötig.

---

## 2. Kernidee: ein Vertrag, zwei Nutzer

Meta-Tool und KI-Steuerung sind **dasselbe Problem**. Wenn jedes Tool eine
Standard-Schnittstelle freilegt — „hier sind meine Regler und ihre Grenzen, lies
und setz sie, nimm ein Video auf" — dann kann sowohl ein Menschen-Hub als auch
eine KI (von außen) alle Tools gleich bedienen.

Der Angelpunkt existiert bereits: **`tools/controls.js`** kennt intern jeden
Regler samt Grenzen (~15–20 der neueren Tools nutzen es). Eine Änderung an
dieser einen Datei schaltet alle diese Tools gleichzeitig frei.

---

## 3. Architektur — drei Bausteine

### Baustein 1 — Der Vertrag: `window.OneTool` in `controls.js`

Eine schlanke Fassade, die über alle registrierten `ControlPanel`-Instanzen
introspiziert und sie programmatisch bedient.

**Was `controls.js` heute schon hat** (verankert am Code):
- Global `window.Controls`, Panels via `Controls.createPanel({position})`.
- `ControlPanel.get(key)` (Z. 3429) → liest `this.params[key]`.
- `ControlPanel.set(key, value)` (Z. 3436) → schreibt `this.params[key]` **und
  aktualisiert die sichtbare UI** (Slider, Toggle, Select, CountPicker). **Feuert
  aber `onChange` NICHT** → der Canvas zeichnet nicht neu.
- Interne Register pro Panel: `this.params` (Wert), `this.callbacks` (onChange),
  `this._sliderConfigs` (min/max/step/decimals), `this._selectControls`,
  `this._countPickerControls`. DOM-Rows tragen `data-key`.

**Was zu bauen ist:**

1. **Panel-Registry.** In `Controls.createPanel(...)` jede neu erzeugte
   `ControlPanel` in ein Modul-globales Array `registeredPanels` pushen.

2. **`window.OneTool`-Fassade** mit:
   - `OneTool.schema()` → Array aller Regler über alle Panels. Pro Eintrag:
     `{ key, type, label, value, min?, max?, step?, decimals?, options? }`.
     Zusammengesetzt aus `params` (value), `_sliderConfigs` (min/max/step/decimals
     für Slider), `_selectControls` (options), sowie Typ-Erkennung (slider /
     toggle / select / countpicker / text) anhand der vorhandenen internen Maps.
   - `OneTool.get(key)` → aktueller Wert (delegiert an das Panel, das `key` führt).
   - `OneTool.set(key, value)` → **muss den Effekt wirklich auslösen.** Ablauf:
     `panel.set(key, value)` (UI + `params` aktualisieren) **danach**
     `panel.callbacks[key]?.(value, key)` (onChange feuern → im Tool wird die
     lose `let`-Variable gesetzt **und** `draw()` gerufen). Genau dieser
     Zwei-Schritt ist der eine notwendige Fix.
   - `OneTool.setMany(patch)` → mehrere Werte auf einmal (`{fractalCount: 500,
     fractalScale: 1.2}`), am Ende genau ein Redraw pro betroffenem Tool ist
     akzeptabel (jeder `set` triggert eh `draw()`; Tools sind idempotent im
     `draw()`).
   - `OneTool.record(seconds, opts?)` → generischer Video-Export. Findet den
     Tool-Canvas (Default: größtes sichtbares `<canvas>`; optional
     `opts.selector`), `canvas.captureStream(opts.fps ?? 60)`, `MediaRecorder`
     (Codec `video/webm`), sammelt Chunks, nach `seconds` Stop → Blob →
     Auto-Download **und** Rückgabe eines Handles/der Blob-URL. Generalisiert die
     bereits existierende MediaRecorder-Logik aus `millionen_Kreise_aufnehmen.html`.
   - `OneTool.snapshot(opts?)` → `canvas.toDataURL('image/png')` des Tool-Canvas
     (Bonus für den Menschen-Hub; für die KI ist der Playwright-Screenshot der
     primäre Sehkanal, siehe Baustein 3).
   - `OneTool.reset()` → delegiert an vorhandene Reset-Buttons/`addResetButton`,
     falls registriert (best effort).

**Wichtige Randbedingungen:**
- **Kein Eingriff in die einzelnen Tools** (circleheart bleibt unberührt). Der
  Vertrag lebt vollständig in `controls.js`.
- **Same-origin / CSP bleibt strikt.** `OneTool` ruft nichts Externes; reines
  In-Page-JS. Kein eingebettetes Modell.
- **Rückwärtskompatibel.** Bestehende Tools funktionieren unverändert; `OneTool`
  ist rein additiv.

### Baustein 2 — Das Schaufenster: noVNC-Livestream

Claude läuft headless auf dem VPS; `localhost` ist für Tim nicht erreichbar.
Deshalb ein sichtbarer Browser, dessen Bild als Webseite zu Tim gestreamt wird.

**Kette:**
1. **Virtuelles Display** — `Xvfb` (z.B. `:99`, 1920×1080).
2. **Sichtbarer Chromium** in diesem Display, von Playwright gesteuert
   (`headless: false`, `env DISPLAY=:99`), bzw. Playwright verbindet sich per
   `chromium.launch({ headless:false })` mit gesetztem `DISPLAY`.
3. **VNC-Server** auf das Display — `x11vnc -display :99`.
4. **Web-Brücke** — `noVNC` + `websockify` machen daraus eine HTTPS-fähige
   Webseite (reiner Viewer, read-only reicht für Tim).
5. **Öffentlich machen** — `sudo expose 0ne-studio <port>` (Port 9001+, siehe
   `reference_expose_script.md`) → HTTPS-URL, die Tim öffnet.

**Ergebnis:** Tim öffnet die URL und sieht den echten Browser — Mauszeiger,
springende Slider, sich änderndes Canvas — live, während Claude arbeitet. Claudes
Erkenntnisse laufen parallel im Chat.

**Werkzeug-agnostisch:** der Stream zeigt jede Seite, auch Ad-hoc-Tools ohne
`OneTool`.

### Baustein 3 — Der Fahrer: Claude via Playwright, zwei Eingabekanäle

Kein separates CLI-Werkzeug. Claude fährt ad-hoc, verbindet sich mit dem
sichtbaren Chromium (Baustein 2). Zwei Eingabekanäle, **beide im Stream sichtbar**:

- **Kanal A — Regler:** `page.evaluate(() => window.OneTool.set(key, value))`.
  Slider bewegen sich sichtbar, Canvas zeichnet neu.
- **Kanal B — Gesten (Canvas):** echte Maus/Touch-Züge via Playwright
  (`page.mouse.move/down/up`, ggf. `page.touchscreen`). Für circleheart: eine
  **vertikale Zieh-Bewegung** nahe eines Kontrollpunkts verzieht die Deformation
  oben/unten; Ziehen am Fraktal-Zentrum verschiebt dessen Offset. Koordinatenraum
  ist **Pixel** relativ zum Canvas; Greif-Radius `GRAB_RADIUS = 20 px` um
  berechnete Punkte. Damit die KI die Greifpunkte trifft: Toggle `showCenter`
  einschalten (zeichnet die Handles), Screenshot, Handle-Position visuell/aus DOM
  bestimmen, dorthin zielen.

**Sehkanal (Feedback-Loop):** `page.screenshot()` → Datei → Claude liest das Bild
(Vision) → beurteilt → justiert nach. Der Loop:
`öffnen → schema() lesen → set()/Geste → screenshot → beurteilen → nachjustieren
→ bei Gefallen record()`.

---

## 4. Gestufte Einführung

1. **Fundament (Baustein 1 + 2):** `OneTool` in `controls.js` + noVNC-Livestream.
2. **Erster Beweis (dieser Task):** eine **Live-Session an `circleheart.html`**
   mit Fraktalmodus. Claude schaltet `isFractal` ein, fährt `fractalScale`,
   `fractalCount`, `fractalRotation`, `fractalOpacity`; zieht per Geste am
   Fraktal-Zentrum und an den Deformations-Punkten; nimmt am Ende ~5 s Video auf.
   Tim schaut live zu.
3. **Danach (spätere Tasks), auf demselben Fundament:**
   - **Prompt → Video** (autonomer Batch): „mach ein hypnotisches Muster, 10 s,
     dunkel" → Tool wählen, Werte drehen, rendern, abliefern.
   - **Explorer/Kurator:** Parameterraum systematisch absuchen, visuell bewerten,
     kuratierte Auswahl präsentieren.
   - **Migration weiterer Ad-hoc-Tools auf `controls.js`** = Vereinheitlichung,
     jedes migrierte Tool wird automatisch KI-fähig.

---

## 5. Nicht-Ziele (YAGNI)

- **Keine große Vereinheitlichung / neue gemeinsame Render-Engine.** Die 40
  Tools werden NICHT umgeschrieben. Migration erfolgt später, tool-für-tool.
- **Kein eingebettetes LLM in der Seite.** CSP bleibt strikt same-origin; die KI
  fährt von außen.
- **Kein Eingriff in einzelne Tool-Dateien** für den Vertrag (nur `controls.js`).
- **Keine Persistenz-/URL-State-Vereinheitlichung** in diesem Task.
- **Kein separates CLI/Skill** für den Fahrer in diesem Task (Claude fährt ad-hoc).

---

## 6. Acceptance Criteria (messbar, wo möglich auto-prüfbar)

**AC1 — Introspektion.** Auf `circleheart.html` liefert
`window.OneTool.schema()` Einträge für mindestens `isFractal` (type toggle),
`fractalScale` (min −100, max 100, step 0.01), `fractalCount` (min 0, max 1000,
step 1), `fractalRotation` (min −360, max 360), `bendMode` (type select mit
Optionen). *Auto-Check:* Playwright `evaluate` → JSON gegen erwartete Keys/Ranges
assert.

**AC2 — Setzen wirkt sichtbar UND rendert.** Nach
`window.OneTool.set('fractalCount', 600)` gilt: (a) sichtbarer Slider zeigt 600
(DOM `[data-key="fractalCount"]` range/input value === "600"), (b) der Canvas hat
sich verändert. *Auto-Check:* Screenshot vor/nach, Pixel-Differenz über Schwelle
(> 1 % geänderte Pixel); DOM-Value-Assert. Voraussetzung erfüllt, weil `OneTool.set`
den `onChange`-Callback feuert (nicht nur `panel.set`).

**AC3 — Video-Export.** `window.OneTool.record(3)` erzeugt eine `.webm`-Datei
≥ 10 KB mit gültigem WebM-Header. *Auto-Check:* Download-Datei existiert, Größe,
Magic-Bytes `1A 45 DF A3`.

**AC4 — Livestream erreichbar.** Die per `sudo expose` veröffentlichte noVNC-URL
antwortet über HTTPS mit 200 und zeigt den Chromium; Aktionen aus Playwright
erscheinen im Stream. *Auto-Check:* `curl -sI <url>` → 200. *Manuell:* Tim sieht
den Browser live.

**AC5 — Gesten-Eingabe wirkt.** Ein per Playwright synthetisierter vertikaler
Zug nahe des oberen Kontrollpunkts ändert `deformationTop` (bzw. sichtbar die
Herz-/Kreis-Kurve). *Auto-Check:* Canvas-Pixel-Differenz vor/nach dem Zug über
Schwelle; optional Debug-Read des Werts.

**AC6 — End-to-End-Beweis.** Eine Live-Session an `circleheart` (Fraktalmodus)
läuft durch: Fraktal an → mehrere Parameter gefahren → mindestens eine
Canvas-Geste → 5 s Video gespeichert. Tim hat live zugeschaut. *Manuell +
Artefakt:* die gespeicherte `.webm` + der Chatverlauf mit Screenshots.

---

## 7. Offene Punkte / bewusst vertagt

- **Greifpunkt-Erkennung für Gesten:** MVP über `showCenter`-Toggle + visuelles
  Zielen. Ein optionaler `OneTool.hotspots()`-Hook (Tool meldet Screen-Positionen
  seiner Ziehpunkte) wäre sauberer — pro Tool etwas Arbeit, deshalb später.
- **Deterministische/reproduzierbare Videos:** aktuell Echtzeit-Capture
  (Wall-Clock). Für exakt reproduzierbare Renders bräuchte man eine Zeit-Achse
  („seek to t") pro Tool — heterogen, vertagt.
- **Canvas-Auswahl bei Mehr-Canvas-Seiten:** Default „größtes sichtbares Canvas";
  bei Bedarf `opts.selector`.
- **Doku-Drift:** `dev.0nefinity.love/CLAUDE.md` nennt einen Dev-Worktree-Pfad
  (`.../0nefinity-dev/`), der nicht dem realen Layout entspricht (aktive Dateien
  liegen direkt unter `dev.0nefinity.love/`). Bei Gelegenheit korrigieren.

---

## 8. Betroffene Dateien

- **Ändern:** `tools/controls.js` — Panel-Registry + `window.OneTool`-Fassade +
  `OneTool.set` mit Callback-Auslösung + `OneTool.record/snapshot`.
- **Unberührt:** `circleheart.html` und alle anderen Tool-Dateien.
- **Neu (Betrieb, nicht im Repo-Docroot):** noVNC/Xvfb/x11vnc-Setup-Skript auf
  dem VPS (Ort außerhalb `dev.0nefinity.love/`, da nicht Teil der Site).
- **Cache-Buster:** falls `controls.js` über eine `?v=`-Query geladen wird,
  hochzählen (0nefinity-Konvention prüfen).
