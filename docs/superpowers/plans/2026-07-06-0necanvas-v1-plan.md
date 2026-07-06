# 0necanvas V1 — Implementierungsplan (bindende Interfaces)

Spec: `docs/superpowers/specs/2026-07-06-0necanvas-meta-tool-design.md` (zuerst lesen).
Dieser Plan definiert die **eingefrorenen Schnittstellen**. Builder-Agenten
implementieren ihre Task-Dateien EXAKT gegen diese Signaturen. Abweichungen nur,
wenn technisch zwingend — dann im Abschlussbericht begründen.

## 0. Regeln für alle Tasks

- Repo: `/home/timbr/0nefinity/dev.0nefinity.love` (Docroot, Datei = sofort live).
- NUR die eigenen Task-Dateien schreiben. NIE ändern: `tools/controls.js`,
  `meta.js`, `meta.css`, `.htaccess`, `includes/*`, bestehende Tool-Seiten.
- Plain JS (ES2020, `<script src>`-Reihenfolge, keine Module-Imports, kein
  Build), strikt same-origin, keine externen Ressourcen.
- Jede Datei kapselt sich als IIFE und hängt genau EIN definiertes Global an
  `window` (bzw. registriert sich via `OneCanvas.registerBlock`).
- UI-Texte Deutsch, Code+Kommentare Englisch, keine Emojis (Unicode ✦◆▦✧∞ ok).
- Look-Referenz: `meta-mockup.html` (lesen; CSS-Muster übernehmen).
- Kein git. Verifikation je Task: `node --check <datei>` mindestens.

## 1. Datenmodell

```js
// Ein Block im Stapel (params = nur serialisierbare Werte):
block = {
  id: 'b1',            // 'b' + laufende Nummer, engine-vergeben
  type: 'kurve',       // registrierter Block-Typ
  name: 'Herz-Kurve',  // anzeigename, default = def.label
  visible: true,
  params: { ... },     // aus def.schema-Defaults geklont
  state: { ... }       // NICHT serialisiert; Sim-Zustand (z.B. Partikel)
}

// Szene: blocks[0] = unterste Ebene. Kräfte wirken auf alle Blöcke mit
// kleinerem Index (alles "unter" ihnen).
scene = { blocks: [...], camera: { x: 0, y: 0, scale: 1 } }
```

Weltkoordinaten: Ursprung = Canvas-Mitte, y nach unten, unabhängig von Zoom.
Kamera wird nur beim Zeichnen angewandt.

## 2. engine.js — `window.OneCanvas` (Task A)

```js
OneCanvas.registerBlock(def)
// def = {
//   type: string, kind: 'ding'|'erzeuger'|'kraft',
//   label: string, icon: string,           // 1 Unicode-Zeichen
//   schema: SchemaEntry[],                 // s.u.; liefert auch die Defaults
//   init(block)?: void,                    // block.state initialisieren
//   emit(block, t, dt, view)?: Primitive[],// PFLICHT für ding+erzeuger
//   force(block, t)?: ForceSpec,           // PFLICHT für kraft
//   hit(block, wx, wy, view)?: string|null,   // handle-id oder null
//   drag(block, handle, dwx, dwy)?: void,     // mutiert block.params
//   overlay(block, t, view)?: Primitive[]  // nur bei Selektion gezeichnet
//                                          // (z.B. Verzerr-Radius-Kreis)
// }

// SchemaEntry (treibt Eigenschaften-Panel UND Serialisierung):
{ key, ctrl: 'slider', label, min, max, step, value, decimals?, unit? }
{ key, ctrl: 'toggle', label, value }
{ key, ctrl: 'select', label, options: [{value, label}], value }
{ key, ctrl: 'text',   label, value, maxlen? }

// Primitive (alles, was Dinge/Erzeuger emittieren):
{ k: 'poly',  pts: number[] /*x0,y0,x1,y1,…*/, closed?, w, col, glow?, fill? }
{ k: 'glyph', ch, x, y, size, rot?, col, glow? }
{ k: 'dot',   x, y, r, col, glow? }
// col = CSS-Farbstring; glow = shadowBlur-px (0/undefined = aus)

// ForceSpec (eine Kraft ist eine Raum-Abbildung):
{
  map?: (x, y) => [number, number],  // nicht-affin (Verzerren)
  instances?: () => number[][],      // Liste von 2D-Matrizen [a,b,c,d,e,f]
                                     // (Kaleidoskop/Fraktal; default [I])
  affine: boolean                    // true wenn KEIN map (Fast-Path erlaubt)
}

OneCanvas.createScene(canvasEl) => sc   // startet eigene rAF-Loop
sc.add(type) => block                   // ans OBERE Ende des Stapels
sc.remove(id); sc.move(id, newIndex)
sc.blocks                               // live-Array (bottom→top)
sc.select(id|null); sc.selectedId
sc.camera                               // {x,y,scale} mutierbar
sc.onStackChange(cb); sc.onSelect(cb)   // UI-Hooks (mehrfach registrierbar)
sc.serialize() => plainObject           // {v:1, camera, blocks:[{type,name,visible,params}]}
sc.load(plainObject)                    // ersetzt Stapel (ruft init je Block)
sc.defs                                 // Map type→def (für Bibliothek/Panel)
sc.instanceLimitHit                     // bool, letzte Frame-Info (UI-Hinweis)
sc.fps                                  // gleitender Mittelwert (für AC9)
OneCanvas.blockDefs()                   // alle registrierten defs (Reihenfolge = Registrierung)
```

**Render-Pipeline pro Frame** (Herzstück, sorgfältig!):
1. `t`, `dt` fortschreiben (Sekunden).
2. Für jeden sichtbaren Ding/Erzeuger-Block i (bottom→top):
   `prims = def.emit(block, t, dt, view)`.
3. Kräfte-Kette: alle sichtbaren Kraft-Blöcke mit Index > i, sortiert
   aufsteigend (die nächstgelegene zuerst, die oberste zuletzt). Für jede:
   - `instances`: repliziere prims mit matrix-transformierten Punkten
     (Glyph/Dot: Anker transformieren, `rot` += Matrix-Rotation,
     `size`/`r` *= Matrix-Scale).
   - `map`: alle Punkte/Anker durch `map` schicken.
4. Zeichnen mit Kamera-Transform. **Fast-Path**: Wenn ALLE Kräfte über Block i
   affin sind, baue `Path2D` einmal aus den Roh-prims und zeichne pro
   kombinierter Instanz-Matrix mit `ctx.setTransform` (Matrizen-Produkt
   Kamera×Kette). Sonst Vertex-Pfad.
5. Instanz-Kappe: max 1500 gezeichnete Instanzen/Frame gesamt;
   darüber abschneiden + `sc.instanceLimitHit = true`.
6. Selektierter Block: `overlay()`-Primitives ungetransformt (nur Kamera)
   obendrauf, Akzentfarbe.
7. Canvas ist DPR-aware (devicePixelRatio, resize-Handler) und füllt seinen
   Container.

**Task A umfasst außerdem:** `0necanvas.html` + `tools/0necanvas/0necanvas.css`.
HTML-Layout gemäß Mockup: Topbar (Titel „0nefinity — canvas", Werkzeug-Buttons
✥ Bewegen / ≈ Verzerren, rechts ⧉ Teilen ⛶ Vollbild), Canvas-Container,
rechte Sidebar (Stapel-Sektion + Eigenschaften-Sektion), Bibliothek-Overlay
(leer, ui.js füllt), Mobile-Bottom-Sheet-Struktur (<900px, Tabs Bausteine/
Eigenschaften). Script-Reihenfolge:
`engine.js → blocks-dinge.js → blocks-erzeuger.js → blocks-kraefte.js →
state.js → ui.js → inline boot`. Boot: `?selftest=1` → Testblock + Log
`ENGINE OK`; sonst: `state.js`-Load aus URL oder Default-Szene (s. Task B3/ui).
Die Panels-DOM-Struktur mit Klassen/IDs im HTML anlegen und in diesem Plan-Stil
dokumentieren (ui.js greift per `document.getElementById` zu):
`#oc-canvas, #oc-stack-list, #oc-props-body, #oc-props-title, #oc-lib-overlay,
#oc-lib-grid, #oc-lib-tabs, #oc-add-btn, #oc-tool-move, #oc-tool-warp,
#oc-share-btn, #oc-fullscreen-btn, #oc-sheet-tabs` (mobil).

## 3. blocks-dinge.js (Task B1)

Drei `OneCanvas.registerBlock`-Aufrufe:

**`gitter`** (▦, Ding): Koordinatengitter. Schema: Dichte (slider 2–80, 20),
Helligkeit (0–1, 0.25), Achsen zeigen (toggle, an), Art (select:
kartesisch/polar). Emit: Linien als poly-Primitives über den sichtbaren
Weltbereich (view liefert Grenzen), feine Tessellierung (~24 Punkte pro
Linien-Segment über den Schirm — Kräfte sollen Linien KRÜMMEN können).

**`kurve`** (◆, Ding): parametrische Kurve. Schema: Größe (10–600, 160),
Morph Kreis↔Herz (0–100 %, 72), Wellen-Frequenz (0–40, 0), Wellen-Amplitude
(0–100, 0), Linienstärke (0.5–12, 1.6), Glühen (0–40, 14), Füllung (toggle,
aus), Pulsieren (toggle, an), X (-2000–2000, 0), Y (-2000–2000, 0),
Rotation (-180–180, 0). Emit: 360–720 Punkte Polar-Parametrisierung,
Herz-Formel↔Kreis linear gemorpht, Welle = radialer Sinus-Aufschlag,
Pulsieren = sanfte Größen-Oszillation mit t. hit/drag: Treffer innerhalb
Bounding-Radius → handle 'move' → drag verschiebt X/Y.

**`symbol`** (✧, Ding): Schema: Zeichen (text, '∞', maxlen 8), Größe (8–400,
64), X, Y, Rotation, Glühen (0–40, 8), Deckkraft (0–1, 0.9 → in col einrechnen).
Emit: ein glyph-Primitive. hit/drag wie kurve (Radius ≈ size/2).

## 4. blocks-kraefte.js (Task B2)

**`verzerren`** (✦, Kraft): Schema: Art (select: Twist/Welle/Sog, Twist),
Stärke (-100–100, 30), Radius (20–2000, 420), Zentrum X, Zentrum Y (-2000–2000,
0/0). force(): `{ affine:false, map }` mit weichem Falloff
(smoothstep auf Distanz/Radius): Twist = Rotation um Zentrum proportional
Falloff×Stärke; Welle = radiale Sinus-Verschiebung; Sog = Skalierung zum
Zentrum. `hit`: nahe Zentrum (Weltradius ~24/scale) → 'center';
`drag`: Zentrum verschieben. `overlay`: gestrichelter Kreis (Radius) + Punkt.

**`fraktal`** (✦, Kraft): Schema: Anzahl (0–60, 8), Skalierung/Schritt
(0.5–1.5, 0.86), Rotation/Schritt (-90–90, 12), Deckkraft-Abfall (0–1, 0.35),
Zentrum X/Y. force(): `{ affine:true, instances }` = [I, M, M², …] mit
M = translate(cx,cy)·rotate(rot)·scale(s)·translate(-cx,-cy). Deckkraft-Abfall:
instances liefert zusätzlich pro Matrix einen alpha-Faktor — Engine-Erweiterung:
Matrix-Einträge als `{m:[…], alpha}` erlaubt (Engine: `alpha` default 1,
multipliziert col-Alpha beim Zeichnen). overlay: Zentrum-Punkt.

**`kaleidoskop`** (✦, Kraft): Schema: Segmente (1–24, 6), Spiegeln (toggle, an),
Winkel-Offset (-180–180, 0). force(): `{ affine:true, instances }` =
Rotationen um Welt-Ursprung in 360/n-Schritten; bei Spiegeln zusätzlich
gespiegelte Varianten (scale(1,-1) vor Rotation).

## 5. blocks-erzeuger.js + state.js (Task B3)

**`spawner`** (✧, Erzeuger): Schema: Rate/s (0–60, 4), Lebensdauer s (0.5–20, 6),
Größe min (4–200, 10), Größe max (4–200, 28), Symbole (text, '∞ 0 1',
space-getrennt), Drift (0–200, 18), Streuradius (0–2000, 420), Glühen (0–40, 6).
init(): `block.state = {particles: [], acc: 0, rng-Zähler}`. emit(): Zeit
akkumulieren, deterministisch-pseudozufällig spawnen (mulberry32 o.ä., Seed im
state), Partikel altern/driften/ausfaden (Alpha über Lebenszeit), als
glyph-Primitives zurückgeben.

**state.js — `window.OneCanvasState`:**
```js
OneCanvasState.bind(sc)   // beobachtet Szene: onStackChange + Param-Änderungen
                          // (ui.js ruft OneCanvasState.touch() nach jedem
                          // Param-Write) → debounced 500ms:
                          // history.replaceState mit ?s=<base64url(JSON)>
OneCanvasState.touch()
OneCanvasState.loadFromUrl(sc) => boolean  // true wenn ?s= geladen wurde
OneCanvasState.shareUrl() => string        // aktuelle URL für Teilen-Button
```
base64url = btoa(JSON) mit +/→-_ und ohne =. Fehlertolerant laden (kaputtes
`?s=` → false, Console-Warn, Default-Szene).

## 6. ui.js (Task B4) — `window.OneCanvasUI`

`OneCanvasUI.init(sc)`:
- **Stapel-Panel** (`#oc-stack-list`): rendert `sc.blocks` **oben=oberste
  Ebene** (Array reversed anzeigen). Zeile: Drag-Handle (echtes Drag-Reorder,
  Pointer-Events, mobil ≥40px), Typ-Icon, KIND-Label klein + Name, Auge-Toggle.
  Klick = `sc.select(id)`. Kontext: Löschen-Button (✕) bei Hover/Selektion.
- **Eigenschaften-Panel** (`#oc-props-body`): schema-getriebener Renderer im
  Mockup-Stil (Slider mit Label+Wertanzeige, Toggle-Switch, Select, Textfeld).
  onInput → `block.params[key] = v` + `OneCanvasState.touch()`. Rendert neu
  bei `sc.onSelect`.
- **Bibliothek** (`#oc-lib-overlay`): Tabs Dinge/Erzeuger/Kräfte aus
  `OneCanvas.blockDefs()` gruppiert; Kachel-Klick → `sc.add(type)` +
  select + Overlay zu.
- **Werkzeuge**: Zustand `tool = 'move'|'warp'`. Topbar-Buttons togglen.
  - move: pointerdown auf Canvas → hit-test top→bottom über Dinge mit `hit()`
    → Treffer: select + drag-Loop (Weltkoordinaten-Delta an `def.drag`);
    kein Treffer: Kamera-Pan. Wheel: Zoom auf Cursor (0.05–50). Pinch: 2-Pointer.
  - warp: pointerdown/drag → an den SELEKTIERTEN Verzerren-Block (oder den
    obersten, falls keiner selektiert; keiner vorhanden → automatisch einen
    hinzufügen) → Zentrum = Pointer-Weltposition (live).
- **Teilen-Button**: kopiert `OneCanvasState.shareUrl()` in Clipboard,
  kurzes „Kopiert"-Feedback. **Vollbild**: `requestFullscreen` auf dem
  Canvas-Container.
- **Mobil**: Sheet-Tabs Bausteine/Eigenschaften; bei `sc.onSelect` automatisch
  zum Eigenschaften-Tab wechseln.
- **Default-Szene** (Funktion `OneCanvasUI.buildDefaultScene(sc)`, Boot ruft
  sie wenn `loadFromUrl` false): Gitter (Helligkeit 0.18) + Kurve (Herz 72%,
  Glühen 14) + Symbol ∞ (dezent, hinter der Kurve) + Spawner (Rate 2) +
  Verzerren (Welle, Stärke 12, Radius 700). Kurve selektieren.
- **Instanz-Limit-Hinweis**: dezente Topbar-Pille wenn `sc.instanceLimitHit`.

## 7. Integrations-Task (C)

Alle Dateien zusammenbringen: Script-Reihenfolge, API-Drift zwischen Modulen
auflösen (Integrator darf ALLE `tools/0necanvas/*` + `0necanvas.html`
editieren), Default-Szene beim Load, Smoke-Test via Playwright (0 Errors,
Canvas non-blank, Block hinzufügen, Regler wirkt), iterieren bis grün.

## 8. Verifikation (D) — gegen `https://dev.0nefinity.love/0necanvas`

AC1–AC11 aus der Spec, aufgeteilt auf 4 parallele Prüfer (core / interaction /
forces-perf / mobile-design), hart und adversarial (unklar = fail), Screenshots
in den Session-Scratchpad. Fix-Runden (max 2) durch Fable-Fixer, dann Re-Verify.

## 9. Abschluss (durch den Orchestrator, nicht die Agenten)

Commit + Push auf `claude-dev`, Kurzbericht an Tim mit Live-URL.
