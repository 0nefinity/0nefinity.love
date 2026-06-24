# SVG-Outline-Lupe — Design

**Datum:** 2026-06-24
**Status:** Spec (zur Review)
**Scope:** Minimal — die eine ausgelieferte Schrift (Ysabeau) perfekt + kugelsicher. Kein generischer Any-Font-Algorithmus, kein visuelles Font-Tool (beides bewusst out of scope).

## Problem

Die Such-/Menü-Lupe wird aus den Schrift-Glyphen „0" (Linse) und „1" (Stiel) gebaut. Als **Webfont** rendern ist fragil: auf no-JS-Clients bei kaltem Cache rastert der rotierte Glyph auf einem Compositing-Layer einmal im Fallback-Font und wird ohne JS-Repaint nie neu gemalt → falsche Schrift. Diverse Fixes (translateZ, font-display, Re-Raster-Animationen, eager-load, inline-Subset-`@font-face`) wirkten im Headless-Test, aber **nicht** in echten Browsern (Chrome/Firefox, frisches Inkognito). Headless-Chromium ist toleranter als echte Browser → wiederholte Fehlalarme, weil Webfont-Rendering umgebungsabhängig ist.

## Lösung

Die Lupe **nicht** aus einem geladenen Webfont rendern, sondern aus den **Glyph-Outlines als Inline-SVG-Pfaden**. Die „0"- und „1"-Konturen werden einmalig (build-time, `fonttools`) aus der Ysabeau-Datei extrahiert und als feste `<path d="…">` ins CSS/HTML gebacken.

**Warum das alle Probleme löst:**
- Kein `@font-face`, kein Font-Download, kein CSP-Font-Thema, kein Fallback **möglich** — die ganze Bug-Klasse entfällt.
- Echte Ysabeau-Glyphen (exakte Outlines, optisch identisch zur Schrift).
- Exakte, messbare Geometrie → perfekte Ausrichtung von Linse + Stiel + ⊘.
- **Deterministisch** — SVG rendert in jedem Browser pixelgleich. Verifikation im Headless = Realität (Ende der Fehlalarme).

## Geometrie / Alignment-Methode

Aus der wght-400-Instanz von Ysabeau (`fontTools.varLib.instancer wght=400`), unitsPerEm 1000:

- **Linse** = „0", bbox `(42, -5, 478, 419)` → Mittelpunkt `(260, 207)`, Radius `r ≈ 215`.
- **Stiel** = „1", bbox `(34, 0, 243, 414)`, Stiel-Spitze (oben-Mitte) `(138, 414)`.
- **Anschluss:** Der Stiel sitzt am Linsenrand in Richtung −45° (rechts-unten am Schirm): Punkt `(412, 55)` in Font-Units (y-up). Die „1" wird um −45° rotiert und mit ihrer Spitze an diesen Punkt gesetzt, sodass sie tangential nach außen zeigt.
- Font-Units sind y-up → SVG (y-down) via `transform="scale(1,-1)"` auf der Gruppe spiegeln.

Die **finalen** Transform-Werte/`viewBox` werden in der Implementierung per Screenshot-Iteration sauber getrimmt (die obigen Werte sind der berechnete Startpunkt). Acceptance ist visuell + deterministisch, nicht ein fixer Zahlenwert.

## Komponenten

1. **Glyph-Extraktion (einmaliger Build-Schritt).** `fonttools`: Ysabeau → wght=400 instanzieren → „0" und „1" via `SVGPathPen` als Pfad-`d` exportieren. Output: zwei Pfad-Strings + bboxes. (venv unter `/tmp/ft-venv` existiert; Vorgehen dokumentiert, kein Runtime-Dependency.)

2. **Loupe-SVG-Markup** (inline, ~0,8 KB):
   ```html
   <svg class="meta-loupe" viewBox="…" aria-hidden="true" focusable="false">
     <g class="meta-loupe-lens"><path d="…0…"/></g>
     <g class="meta-loupe-handle"><path d="…1…"/></g>
   </svg>
   ```
   `fill: var(--text-color)`. Größe/Position via CSS (ersetzt das bisherige font-size-basierte Lupen-Styling).

3. **Menü-Integration.** Die zwei `<span class="menu-loupe">0</span><span class="menu-loupe-handle">1</span>` im Body-Include werden durch das SVG ersetzt — **in `tools/generate-menu.py`** (das die Nav-HTML inkl. `.menu-search` bäckt) und im regenerierten `includes/something-in-the-body.html`. CSS in `meta.css` positioniert das SVG links im Suchfeld (gleiche Optik/Größe wie bisher).

4. **⊘-Stoppschild (no-JS).** Bei Klick auf das deaktivierte Suchfeld:
   `.menu-search:has(input:disabled:active) .meta-loupe-handle { transform: … }` — der Stiel „1" rotiert/verschiebt sich, sodass er als Diagonale mittig durch die Linse „0" geht = ⊘. Reine CSS-Transform auf der SVG-Gruppe, kein JS. **Kein Font-Freeze**, da kein Font zu swappen ist (SVG-Pfade rastern immer korrekt).

5. **`where-is-01.html`.** Die Cursor-Lupe (`.cursor-loupe::before/::after`, content '0'/'1') wird durch dasselbe Inline-SVG ersetzt; das bestehende JS (`Zoom2D`, folgt dem Pointer) bleibt und skaliert/positioniert das SVG statt der Pseudo-Elemente.

## Cleanup (Teil dieser Arbeit)

Da der Webfont-Weg ersetzt wird, **entfernen**:
- `@font-face { font-family: 'YsabeauLoupe'; … base64 … }` + die `font-family: 'YsabeauLoupe'`-Referenz in `meta.css`.
- Die alten `.menu-loupe` / `.menu-loupe-handle` Font-/Transform-Regeln (durch SVG-Styling ersetzt).
- CSP: `font-src 'self' data:` → zurück auf `font-src 'self'` (das `data:` war nur für den Font-Embed; SVG braucht es nicht → strikte CSP wiederherstellen).

## Out of scope

- Generischer „jede Font-Datei zur Laufzeit"-Algorithmus.
- Visuelles Font-Picker-Tool in `where-is-01`.
- Änderung der normalen (mit-JS) Such-Funktionalität.

## Acceptance Criteria (messbar / deterministisch)

1. **Keine Font-Abhängigkeit der Lupe:** `grep` zeigt keine `@font-face`-`YsabeauLoupe` und keine `font-family`-Lupe mehr in `meta.css`; Lupe ist Inline-SVG. CSP-Header wieder `font-src 'self'` (curl).
2. **Identisch mit/ohne JS:** Playwright-Screenshot der Menü-Lupe JS-on und JS-off sind visuell gleich (beide = Ysabeau-Lupe).
3. **Font-unabhängig bewiesen:** Screenshot mit **allen** Font-Requests geblockt (`route` abort `*.ttf`/`*.woff*`) → Lupe rendert unverändert korrekt.
4. **⊘ formt sich:** Screenshot bei `:active` auf dem disabled Suchfeld → erkennbares Stoppschild (Diagonale mittig durch die Linse).
5. **where-is-01:** Cursor-Lupe ist das SVG und folgt dem Pointer (JS-on).
6. **No-regression:** `tools/check-no-js-page.py` PASS auf testseite + einer konvertierten Seite; Menü-Links unverändert; `node --check`/CSS-Braces ok.
7. **Echter-Browser-Check:** Headless täuschte bei Webfonts — hier irrelevant, weil SVG deterministisch rendert. Tim verifiziert final in frischem Inkognito (Chrome + Firefox): Lupe + ⊘ korrekt ohne JS.

## Risiken / offene Punkte

- Exakte optische Trimmung (viewBox, Stiel-Länge, Gap zur Linse) per Screenshot-Iteration — kein Blocker, nur Feinarbeit.
- `meta.css` enthält noch eine zweite Ysabeau-`@font-face` (Fallback, Zeile ~594) und die un0nefinity-Fonts für ANDERE Seiten-Texte — **nicht** anfassen, nur die Lupen-spezifischen Font-Regeln entfernen.
