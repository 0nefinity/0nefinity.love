# 0necanvas — das eine Tool: alle 0nefinity-Fähigkeiten auf einer Leinwand

- **Datum:** 2026-07-06
- **Repo:** `dev.0nefinity.love` (Branch `claude-dev`)
- **Status:** Design / Spec (Brainstorming mit Tim abgeschlossen, Mockup abgenommen)
- **Vorgänger-Kontext:** Der KI-Fahrer-Teil (Spec `2026-07-06-0ne-studio-...`) ist
  zurückgestellt. Dieses Projekt ist die andere Hälfte: das Meta-Tool für Menschen.
- **Bau:** Multi-Agent-Workflow, Builder-Agenten auf **Fable 5**, Verifikation via
  Playwright gegen die Live-Dev-Domain.

---

## 1. Nordstern

Statt ~40 verstreuter Einzel-Tools **ein Tool**: eine Leinwand, auf der die
Fähigkeiten aller Unter-Tools als frei kombinierbare Bausteine existieren.
Tims Formulierung: „Koordinatensystem, darüber spawnen, den Raum verzerren,
Symbole/Geometrie bewegbar — alle Sachen, die auf den einzelnen Sachen gehen,
auf alles anwendbar, auf einer einzigen Oberfläche."

Die 40 Alt-Tools werden **nicht angefasst** — sie bleiben als eigenständige
Seiten und dienen als Konzept-Quelle. 0necanvas ist rein additiv.

## 2. Das Modell: Stapel aus Dingen, Erzeugern, Kräften

Von Tim bestätigt („trifft es ziemlich gut"):

- **Dinge** — was auf der Fläche IST: Koordinatengitter, parametrische Kurve
  (Kreis↔Herz-Morph, Wellen), Symbol/Text. Anfassbar, bewegbar.
- **Erzeuger** — was Dinge HERVORBRINGT: Spawner (V1); Game-of-Life,
  wachsende Linien, Fourier (Phase 2).
- **Kräfte** — was auf **alles darunter** wirkt (Einstellungsebenen-Prinzip):
  Raum verzerren, Fraktal-Wiederholung, Kaleidoskop/Spiegeln.

**Tims Vereinigung (2026-07-06, nach Build-Start):** Dinge und Erzeuger sind
wesensgleich — ein Ding ist ein Erzeugnis, das schon da ist (0 ≡ 1 ≡ ∞: leer ≡
ein Ding ≡ Strom). Weil Dinge reine Geometrie-Emitter sind, ist jedes Ding
automatisch ein **Stempel**: Der Spawner bekommt (direkt nach V1-Landung, V1.1)
einen Parameter **„Was wird erzeugt"** — Auswahl über alle registrierten
Ding-Typen — und emittiert pro Partikel dessen Geometrie (verschoben, skaliert,
altersverblassend). Damit spawnen Koordinatensysteme wie Sand, Herzen spawnen
Herzen. Die drei Kategorien bleiben als Bibliotheks-Sichten: Dinge = was sein
kann, Erzeuger = wie viele/wann, Kräfte = wie der Raum sie behandelt.

Ein Werk = geordneter Stapel von Baustein-Instanzen + Kamera. Serialisierbar
als JSON → URL (`?s=`), damit jeder Fund wiederauffindbar/teilbar ist.

## 3. UI (per Klick-Dummy validiert: `/meta-mockup`)

Photoshop-Prinzip — **Selektion statt Sortierung**, man sieht nie alle Regler:

- **Leinwand** mittig, füllt den Raum. Dunkel by design.
- **Stapel-Panel** rechts: Baustein-Liste (Typ-Icon, Name, Auge-Toggle,
  Drag-Reorder), Plus-Button.
- **Eigenschaften-Panel**: nur die Regler des angewählten Bausteins
  (~5–15 — die Größenordnung eines heutigen Einzel-Tools pro Blick).
- **Bibliothek-Overlay** (Plus): drei Tabs Dinge/Erzeuger/Kräfte, Kacheln.
- **Topbar**: Titel, Werkzeuge, Aktionen (Teilen/Vollbild).
- **Mobil** (<900px): Stapel+Eigenschaften als Bottom-Sheet mit Tabs,
  Tap-Targets ≥40px, kein Hover-only.

**Canvas-Interaktion** (Tims Entscheidung — Hybrid):
- **Standard = direkt anfassen**: Tipp auf ein Ding wählt es an (Panel springt
  mit), Ziehen bewegt es; leere Fläche ziehen = Pan; Wheel/Pinch = Zoom.
- **Werkzeugauswahl** zusätzlich für Kraft-Eingriffe: Werkzeug „Verzerren" →
  Ziehen auf der Leinwand verschiebt das Verzerr-Zentrum (Radius als
  On-Canvas-Kreis sichtbar).

**Look**: wie der abgenommene Mockup — viel Schwarz, weiß/graue Akzente, eine
ruhige Akzentfarbe (Perlblau #a8b8e8), klare Kanten, Verdana-Stack, keine
Emojis, UI-Sprache Deutsch. Strikt same-origin (CSP `default-src 'self'`).

## 4. Architektur-Kern: Geometrie-Pipeline mit Domain-Transformationen

Die zentrale Erkenntnis: alle V1-Kräfte sind **Raum-Abbildungen**.

- Dinge/Erzeuger malen nicht direkt, sie **emittieren Geometrie**
  (Polylinien/Glyphen/Punkte als Punktlisten, adaptiv tesselliert).
- Kräfte transformieren diese Geometrie:
  - **Kaleidoskop** = N Spiegel-/Rotations-Matrizen (affin, one-to-many)
  - **Fraktal-Wiederholung** = N Skalier-/Rotations-Matrizen (affin, one-to-many)
  - **Raum verzerren** = freie Punktabbildung `(x,y)→(x',y')` (nicht-affin)
- Eine Kraft wirkt auf alles unter ihr im Stapel; mehrere Kräfte verschachteln
  (die nächstgelegene zuerst, die oberste zuletzt).
- **Fast-Path**: sind alle Kräfte über einem Block affin, wird per
  `Path2D` + `setTransform` instanziert (schnell). Sonst Vertex-Transform mit
  Instanz-Kappe (~1500, dezenter UI-Hinweis bei Erreichen).
- Glyphen (Text/Symbole) werden am **Anker** transformiert (Position +
  Rotation), die Glyphe selbst bleibt unverzerrt — bewusste V1-Vereinfachung.

Render: ein `<canvas>`, Canvas2D, eigene rAF-Loop, Kamera (Pan/Zoom, DPR-aware).
Kein WebGL in V1 (VPS-Software-Rendering, Einfachheit); die Pipeline ist so
geschnitten, dass ein WebGL-Backend später austauschbar wäre.

## 5. V1-Umfang (Tims Auswahl)

**Dinge:** Koordinatengitter · Kurve (Kreis↔Herz-Morph, Wellen-Freq/Amp,
Größe, Linienstärke, Glühen, Füllung, Pulsieren) · Symbol/Text (Zeichen, Größe,
Position, Rotation).
**Erzeuger:** Spawner (Rate, Lebensdauer, Größe, Symbolset, Drift, Spawn-Bereich).
**Kräfte:** Raum verzerren (Zentrum, Radius, Stärke, Art: Twist/Welle/Sog) ·
Fraktal-Wiederholung (Anzahl, Skalierung, Rotation/Schritt, Deckkraft-Abfall,
Zentrum) · Kaleidoskop (Segmente, Spiegeln an/aus, Winkel-Offset).

Default-Szene beim ersten Laden (ohne `?s=`): Gitter + Herz-Kurve + Symbol ∞ +
Spawner + dezente Verzerrung — der Mockup-Look, aber echt.

**Phase 2 (nicht V1):** Game-of-Life/Wachstum/Fourier als Erzeuger, Moiré,
Physik (sprinky), Preset-Galerie, Video-Export, `OneTool`-Vertrag fürs
KI-Bedienen (zurückgestelltes Schwester-Projekt), Migration von Alt-Tool-Looks
als Presets.

## 6. Nicht-Ziele (YAGNI)

- Kein Umbau/Anfassen der 40 Alt-Tools, kein Umbau von `controls.js`/`meta.js`.
- Kein WebGL, kein Build-System, keine externen Ressourcen.
- Kein Node-Editor/Signalfluss-Graph (Stapel reicht für V1).
- Kein Video-Export in V1 (Screenshot des Browsers reicht vorerst; URL hält
  das Werk).
- Keine Undo-History in V1 (URL-State mildert; Phase 2).
- Eigenschaften-Panel ist ein **eigener schema-getriebener Renderer** im
  Mockup-Stil, NICHT `controls.js` (dessen Floating-Panels passen nicht ins
  Sidebar-Layout; controls.js bleibt unberührt).

## 7. Dateien (alle NEU, nichts Bestehendes wird geändert)

```
0necanvas.html                     Seite: Layout, Panels-DOM, Boot
tools/0necanvas/0necanvas.css      Styles (Mockup-Ästhetik)
tools/0necanvas/engine.js          window.OneCanvas: Registry, Szene, Pipeline
tools/0necanvas/blocks-dinge.js    Gitter, Kurve, Symbol
tools/0necanvas/blocks-erzeuger.js Spawner
tools/0necanvas/blocks-kraefte.js  Verzerren, Fraktal, Kaleidoskop
tools/0necanvas/ui.js              Stapel, Bibliothek, Eigenschaften, Gesten, Werkzeuge
tools/0necanvas/state.js           Szene ↔ JSON ↔ URL (?s=, base64url, debounced)
```

Live-URL: `https://dev.0nefinity.love/0necanvas` (Clean-URL via .htaccess-Muster,
Datei schreiben = sofort live).

## 8. Acceptance Criteria (Playwright-prüfbar gegen die Live-Dev-URL)

- **AC1 Laden:** Seite lädt, 0 Console-Errors, Canvas sichtbar und nicht leer
  (Pixel-Check), Default-Szene rendert.
- **AC2 Bibliothek:** alle 7 Block-Typen einzeln hinzufügbar; jeder erscheint
  im Stapel, Eigenschaften-Panel zeigt seine Regler; 0 Errors.
- **AC3 Regler wirken:** Slider-Änderung (z.B. Kurven-Größe) → Canvas-Pixel-Diff
  >1%; Wert im Panel aktualisiert.
- **AC4 Stapel-Ordnung wirkt:** Kraft unter ein Ding geschoben → das Ding ist
  nicht mehr betroffen (Pixel-Beweis).
- **AC5 Direkt anfassen:** Drag auf ein Symbol bewegt es (Param + Pixel-Diff);
  Wheel-Zoom wirkt; leere-Fläche-Drag pannt.
- **AC6 Werkzeug Verzerren:** Werkzeug aktivieren + Drag verschiebt das
  Verzerr-Zentrum sichtbar.
- **AC7 URL-State:** Param ändern → `?s=` ändert sich; Reload derselben URL →
  identische Szene (Params gleich, Screenshot ähnlich).
- **AC8 Kräfte:** Kaleidoskop erzeugt sichtbare Symmetrie; Fraktal erzeugt
  sichtbare Kopien (Pixel-Checks).
- **AC9 Performance:** Referenz-Szene (Gitter + Kurve + Spawner + alle 3 Kräfte,
  moderate Werte) ≥30 fps über 5 s (rAF-Zähler via `page.evaluate`).
- **AC10 Mobil:** 390×844: kein horizontaler Overflow, Bottom-Sheet-Tabs
  funktionieren, Tap-Targets ≥40px.
- **AC11 Design:** Screenshots Desktop+Mobil bestehen einen Vision-Review gegen
  die 0nefinity-Ästhetik (dunkel, edel, ruhig, konsistent, keine Layout-Brüche).
