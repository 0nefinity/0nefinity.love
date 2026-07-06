# 0ne Studio — KI bedient die visuellen Tools, du schaust live zu

- **Datum:** 2026-07-06 (rev. 2 — nach Unknown-Unknowns-Analyse, drei Code-/Infra-Sonden)
- **Repo:** `dev.0nefinity.love` (Branch `claude-dev`)
- **Status:** Design / Spec (Brainstorming + Risiko-Analyse abgeschlossen)
- **Modell-Arbeitsteilung:** Research + Spec + Plan mit Opus 4.8.
  **Fable 5 baut den Code-Anteil (`controls.js`-Vertrag + Fahrer-Loop).**
  **Die VPS-Infra (Xvfb/VNC/expose-Härtung) baut Claude im Chat mit Tims
  Freigabe** — Prod-Sysadmin gehört nicht in einen autonomen Modell-Lauf.

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

**Verifizierte Realitäten, die das Design einpreisen muss** (Code-Sonde):
- **Blast-Radius:** `controls.js` wird via SSI-Head-Include
  (`includes/something-in-the-head.html:9`) von **92 Seiten** geladen (22 mit
  aktivem Panel), **ohne Cache-Buster**. Die Erweiterung MUSS strikt additiv
  sein: nur neuer Code, keine Änderung am bestehenden Slider/Toggle-Pfad.
- **Kein globaler Panel-Zugriff:** Tools halten `const panel` block-lokal.
  → `Controls.createPanel` registriert jede Instanz in einem Modul-Register.
- **Mehrere Panels pro Seite existieren** (`whitelines.html`: 2 Panels); Keys
  sind nur panel-lokal eindeutig. → `schema()` namespaced: `panelIndex` +
  qualifizierter Key (`p0.fractalCount`), unqualifizierte Keys werden
  aufgelöst, solange eindeutig.
- **onChange ist NICHT uniform:** (a) manche rufen `draw()` direkt
  (circleheart), (b) viele setzen nur die Variable und verlassen sich auf die
  Dauer-rAF-Loop (heart, whitelines, sprinky — funktioniert, nächster Frame),
  (c) **state-gated:** `fourieous` (`if (app.isRunning) processText()`),
  `co0rdinates`, `game0f1ife` (paused) zeichnen im gestoppten Zustand NICHT.
  (d) `tones.html` ist **Audio, kein Visual** — plus Autoplay-Sperre
  (AudioContext braucht User-Geste).
  → Konsequenz: `OneTool.set()` garantiert „Wert gesetzt + UI synchron +
  Callback gefeuert", aber NICHT „Bild hat sich geändert". Der Fahrer prüft
  visuell (Screenshot-Diff) und weiß: kein Diff ≠ Fehler, evtl. gestopptes
  Tool. `schema()` liefert dafür ein Feld `pageInfo` (Canvas gefunden? rAF
  aktiv? — best effort). Audio-Tools sind Nicht-Ziel dieses Tasks.
- **Reset ist nicht ableitbar:** `addResetButton` rendert nur einen Button,
  Reset-Logik lebt im Tool; Initial-VALUES werden nirgends gespeichert.
  → `OneTool` schneidet die Initialwerte beim ersten `addX()` mit
  (`initialValue` pro Control) und `reset()` = `setMany(initialValues)`.
- **Canvas-Auswahl:** controls.js erzeugt selbst kleine Canvases
  (Pattern-Picker-Icons), Tools haben Offscreen-Buffer, p5-Canvas entsteht
  erst zur Laufzeit. → Heuristik: größtes **sichtbares, im Viewport
  gerendertes** `<canvas>` das NICHT innerhalb eines `.ctrl-`/Panel-DOM liegt;
  Auswahl lazy zum Aufrufzeitpunkt (nicht beim Load, wegen p5); `opts.selector`
  als Override. Für circleheart trivial: `#canvas`.

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
     Tool-Canvas (Heuristik oben; optional `opts.selector`),
     `canvas.captureStream(opts.fps ?? 30)`, `MediaRecorder` mit
     **`isTypeSupported()`-Fallback-Kette** `vp9 → vp8 → video/webm` (NICHT
     hart vp9), sammelt Chunks, nach `seconds` Stop → Blob → Auto-Download
     **und** Rückgabe der Blob-URL. Generalisiert das verifizierte Muster aus
     `millionen_Kreise_aufnehmen.html:250-269`. Canvas muss während der
     Aufnahme sichtbar bleiben (kein `display:none`, sonst friert der Stream).
     CSP ist bereits kompatibel (`media-src`/`img-src`/`worker-src` erlauben
     `blob:`/`data:`, `.htaccess:101`) — keine Header-Änderung nötig.
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

**Verifizierter Bestand (Infra-Sonde):** Xvfb 21.1, x11vnc 0.9.16, websockify
0.10, noVNC 1.3 sind **bereits installiert**; Playwright 1.61 + gecachte
Chromium-Builds vorhanden. 16 Cores / ~41 GiB frei — Budget locker. Nächster
freier expose-Port: **9004** (9xxx laut Erfahrung vom Hoster nicht gefiltert).
Kein `/dev/dri` → reines Software-Rendering (für Canvas2D egal, siehe unten).
System-Chromium ist ein Snap (Confinement-Zicken) → **Playwright-Chromium
verwenden**, headed gegen `DISPLAY=:99`.

**Kette:**
1. **Virtuelles Display** — `Xvfb :99` (1920×1080).
2. **Sichtbarer Playwright-Chromium** in diesem Display (`headless: false`,
   `env DISPLAY=:99`).
3. **VNC-Server** — `x11vnc -display :99 -viewonly -rfbauth <passwd-file>`.
4. **Web-Brücke** — `websockify --web /usr/share/novnc` (noVNC-Viewer,
   zusätzlich `view_only`).
5. **Öffentlich machen** — `sudo expose 0ne-studio 9004ff` → HTTPS-URL für Tim.

**SICHERHEITS-HÄRTUNG (PFLICHT, verifizierter Befund):** Das expose-Skript
(`/usr/local/bin/expose`) erzeugt nginx-Blöcke **ohne jede Auth** — kein
Basic-Auth, kein Token, keine IP-Allowlist; self-signed-Warnung ist kein
Schutz. Ein ungeschützter Live-Browser wäre für jeden Port-Scanner einsehbar
und (bei VNC-Default) **steuerbar** — und ein steuerbarer Browser auf dem
Prod-VPS kann auf `localhost`-Services/interne Dashboards navigieren
(SSRF-artiges Loch). Deshalb, bevor irgendetwas online geht, alle drei:
1. `x11vnc -viewonly` (Server nimmt keine Eingaben an) **und** noVNC
   `view_only`,
2. **Zugangsschutz** — VNC-Passwort (`-rfbauth`) und/oder `auth_basic` im
   nginx-Block,
3. **Browser einsperren:** die Chromium-Instanz nur auf `dev.0nefinity.love`
   fahren (Playwright-Kontext ohne weitere Tabs; keine internen URLs öffnen).

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

**Ehrliche Grenzen des Sehkanals (eingepreist):**
- **Claude sieht Standbilder, kein Bewegtbild.** Bewegungs-Ästhetik (Loop,
  Rhythmus, Flackern) ist aus Einzelframes kaum beurteilbar. Gegenmittel:
  **Frame-Folgen** sampeln (3–5 Screenshots über 1–2 s, als Bildserie lesen)
  oder kurzes `record()` + Frames extrahieren. Für Bewegungs-Urteile ist das
  der Standardweg, nicht die Ausnahme.
- **Latenz:** Action → Screenshot → Vision-Read dauert Sekunden. Für Tim fühlt
  sich der Stream flüssig an; Claudes Züge kommen im Sekunden-Takt
  (Stop-and-Go, kein kontinuierliches „Spielen"). Erwartung so setzen.
- **Kein Pixel-Diff ≠ Fehler:** bei state-gated Tools (fourieous gestoppt,
  game0f1ife pausiert) ändert Setzen nichts Sichtbares — der Fahrer prüft dann
  `pageInfo`/Tool-State statt blind zu eskalieren.

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
   - **Explorer mit Nicht-LLM-Stack (Tims Frage nach „anderen KI-Formen"):**
     LLMs sind für Echtzeit-Visuelles nicht optimal — aber spezialisierte
     Komponenten ergänzen sie: ein **Ästhetik-Scorer** (CLIP-artiges
     Vision-Modell, ~100 ms/Bild, CPU-tauglich) bewertet Varianten massenhaft;
     ein **Optimierer** (CMA-ES / evolutionäre Suche) fährt den Parameterraum
     mit dem Scorer als Fitness-Funktion (etabliertes Feld: CLIP-guided
     evolution). Der Scorer lässt sich auf **Tims Geschmack kalibrieren**
     (100–200 bewertete Screenshots → kleiner Kopf auf CLIP-Features; Inferenz
     auf dem VPS machbar, kein GPU-Training nötig). Rollen: Optimierer/Scorer
     erkunden schnell und dumm, Claude dirigiert und kuratiert, Tim lenkt.
     **Genau dafür ist `schema()` von Tag 1 optimierer-tauglich** (sauberes
     JSON, Typen, Ranges = Genom-Definition). Echtes RL-Training auf den Tools:
     bewusst verworfen (Reward-Funktion ungelöst, Forschungsaufwand).
   - **Gesten-Deklaration (`hotspots()`-Hook):** Tools melden ihre Ziehpunkte
     und Gesten-Semantik → KI-Gesten generisch statt per Code-Lektüre. Phase 2.
   - **Look speichern (config→URL-Serialisierung):** gefundene Einstellungen
     festhalten/teilen; ohne das ist ein Fund nach Reload weg (nur Video
     bleibt). Phase 2.
   - **Migration weiterer Ad-hoc-Tools auf `controls.js`** = Vereinheitlichung,
     jedes migrierte Tool wird automatisch KI-fähig. WebGL-Tools (12 Dateien,
     u.a. fractal0ne, shadows) brauchen dabei Extra-Sorgfalt: SwiftShader-Flags,
     ggf. `preserveDrawingBuffer`, Framerate pro Tool empirisch testen.

---

## 5. Nicht-Ziele (YAGNI)

- **Keine große Vereinheitlichung / neue gemeinsame Render-Engine.** Die 40
  Tools werden NICHT umgeschrieben. Migration erfolgt später, tool-für-tool.
- **Kein eingebettetes LLM in der Seite.** CSP bleibt strikt same-origin; die KI
  fährt von außen.
- **Kein Eingriff in einzelne Tool-Dateien** für den Vertrag (nur `controls.js`).
- **Keine Persistenz-/URL-State-Vereinheitlichung** in diesem Task (Phase 2).
- **Kein separates CLI/Skill** für den Fahrer in diesem Task (Claude fährt ad-hoc).
- **Keine Audio-Tools** (`tones.html`): OneTool.set funktioniert dort technisch,
  aber „sehen" gibt es nicht und Autoplay-Sperre blockt den Ton — außerhalb
  des Scopes.
- **Kein hotspots()-Hook, kein Ästhetik-Scorer/Optimierer** in diesem Bau —
  beides Phase 2+, das Fundament wird nur dafür vorbereitet (schema()-Format).
- **Kein RL-Training / Modell-Feintuning auf Tool-Bedienung.**

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

**AC4 — Livestream erreichbar UND abgesichert.** (a) Die veröffentlichte
noVNC-URL zeigt den Chromium; Aktionen aus Playwright erscheinen im Stream.
(b) **Ohne Credentials kein Zugriff:** `curl -sI <url>` ohne Auth → 401 (bzw.
VNC-Connect ohne Passwort scheitert). (c) **View-only:** Maus/Tastatur-Events
aus dem noVNC-Client bewegen den Browser NICHT (x11vnc `-viewonly`).
*Auto-Check:* curl mit/ohne Auth; view-only per Test-Input. *Manuell:* Tim
sieht den Browser live.

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
  Zielen (circleheart: Greif-Radius 20 px um Kontrollpunkte, vertikaler Zug =
  Deformation, Zug am Zentrum = Fraktal-Offset). `hotspots()`-Hook: Phase 2 —
  nach der ersten Session neu bewerten, ob er doch zentral ist.
- **Deterministische/reproduzierbare Videos:** aktuell Echtzeit-Capture
  (Wall-Clock). Für exakt reproduzierbare Renders bräuchte man eine Zeit-Achse
  („seek to t") pro Tool — heterogen, vertagt.
- **Pause/A-B-Vergleich:** dauerhaft animierende Tools machen faire Vergleiche
  zweier Settings schwer (Zufallsframes). Pause/Seek-Contract vertagt; MVP:
  Frame-Folgen sampeln.
- **Doku-Drift:** `dev.0nefinity.love/CLAUDE.md` nennt einen Dev-Worktree-Pfad
  (`.../0nefinity-dev/`), der nicht dem realen Layout entspricht (aktive Dateien
  liegen direkt unter `dev.0nefinity.love/`). Bei Gelegenheit korrigieren.

---

## 8. Betroffene Dateien & Arbeitsteilung

**Fable 5 (Code, Repo):**
- **Ändern:** `tools/controls.js` — Panel-Registry (in `createPanel`),
  `window.OneTool`-Fassade (schema/get/set/setMany/record/snapshot/reset,
  Initial-Value-Mitschnitt, Panel-Namespacing), strikt additiv.
- **Unberührt:** `circleheart.html`, alle anderen Tool-Dateien, `.htaccess`
  (CSP passt bereits).
- **Neu:** Playwright-Testskript für AC1/AC2/AC3/AC5 (Ort: `test-results/`
  bzw. Scratch, nicht Site-Docroot).

**Claude im Chat, mit Tim-Freigabe (Prod-Infra, NICHT Fable):**
- Xvfb/x11vnc/websockify-Startskript + Passwort-Setup (außerhalb des
  Site-Docroots), `sudo expose`, Auth-Härtung des nginx-Blocks, AC4-Verifikation.

**Kein Cache-Buster vorhanden** (`controls.js` wird unversioniert von 92 Seiten
via SSI-Include geladen) — dev-Domain ist No-Cache, daher kein Busting nötig;
für die Live-Domain bei späterem Deploy prüfen.
