# unfoldingPi — Design

**Status:** v1 spec
**Datum:** 2026-05-18
**Ziel:** Interaktives Tool, das die Idee „Pi mit Dicke 0 lässt sich aus einem Punkt aufrollen und in einem Punkt einrollen" anfassbar macht.

---

## Konzept

Pi hat unendlich viele Dezimalstellen. Jede Stelle ist „dimensionslos" — eine Position ohne Ausdehnung. Damit lässt sich der ganze Pi-Strang gedanklich in einen 0-Dicke-Punkt **aufrollen**. Der Punkt enthält Pi vollständig.

Aus zwei solchen Punkten kann man Pi **entrollen**, indem man sie auseinanderzieht. Dazwischen wird ein Stück Pi sichtbar — die Stellen, die gerade nicht in einem der beiden Punkte aufgerollt sitzen. Schiebt man die Punkte wieder zusammen, verschwindet Pi wieder vollständig im Punkt.

Beide Endpunkte enthalten in jedem Moment „den ganzen Rest von Pi" — Pi ist nicht weg, nur uneingerollt.

### Mental-Modell: Pumpen-Stream

- **Zwei Anker** (linker + rechter), beide visuell als dünner Strich
- Dazwischen: das **Pi-Fenster** = sichtbarer Ausschnitt aus dem Pi-Stream
- **Anker draggen** → Fenster-Breite ändert sich → mehr oder weniger Stellen sichtbar
- **Folge swipen** → Offset im Stream verschiebt sich (Fenster-Breite bleibt, andere Stellen drin)
- Stellen die rauslaufen → rollen in den jeweiligen Anker (ins Unendlich)
- **Slider unten** → automatischer Stream-Drift, Geschwindigkeit = Slider-Ausschlag

### Pi-Anfang (`3`)

Initialer Zustand: linker Anker hat den Wert `3` (Pi materialisiert dort als Start). Rechter Anker ist direkt daneben, kein Pi dazwischen sichtbar. Beim Ziehen entrollt die Folge `.141592...` rechts der `3`.

Die `3` ist **nicht speziell** — sie ist nur der erste materialisierte 0-Punkt. Beim Swipen nach links rollt sie selbst auch wieder in den linken Unendlich-Anker rein, kann komplett unsichtbar werden.

---

## UI

```
┌─────────────────────────────────────────────────┐
│                                                 │
│                                                 │
│         3 1 4 1 5 9 2 6 5 3 5 8 9              │
│         ↑                       ↑               │
│       linker                  rechter           │
│       Anker                   Anker             │
│                                                 │
│  ◄────────────────●─────────────────►          │
│                  Slider                         │
└─────────────────────────────────────────────────┘
```

- **Schriftart:** `Courier New` monospace (konsistent mit `numberline.html`, `taschenrechner`)
- **Farben:** `meta.css` Variablen (`--bg-color`, `--text-color`)
- **Anker:** vertikaler Strich, 2px breit, full-height-Zeile, gleiche Farbe wie Text
- **Pi-Stellen:** zentriert in einer Zeile, fixed font-size, single-line
- **Slider:** unter der Folge, Thumb mittig (= Stop), Range optisch unbegrenzt, links = nach-links-drift, rechts = nach-rechts-drift

## Interaktionen

| Aktion | Effekt |
|---|---|
| Drag linker Anker nach links | Fenster wird breiter, Pi entrollt zwischen Ankern (mehr Stellen sichtbar links) |
| Drag linker Anker nach rechts | Fenster wird schmaler, Pi rollt wieder rein |
| Drag rechter Anker nach rechts | Wie oben, aber Pi entrollt rechts |
| Drag rechter Anker nach links | Pi rollt rechts wieder ein |
| Swipe auf der Folge | Stream-Offset verschiebt sich — Stellen rollen in einem Anker rein, im anderen raus |
| Slider nach links | Auto-Drift nach links, Speed ∝ Ausschlag |
| Slider mittig | Stop |
| Slider nach rechts | Auto-Drift nach rechts, Speed ∝ Ausschlag |
| Slider loslassen | Slider snapt zurück in die Mitte? **Offen** — v1: Slider bleibt wo gelassen |

Touch + Maus + Stylus über Pointer Events.

## Architektur

### v1 Stack

- **Plain HTML/CSS/JS**, kein Build
- **DOM-spans + CSS transform** für die Folge (jedes Zeichen = `<span>`, alles in einem Container mit `transform: translateX(offset)`)
- **Pi-Source:** initial 5000 Stellen inline als String. Reicht für die meisten Sessions.
- **Lazy growth:** wenn User Richtung Stream-Ende driftet → on-demand mehr Stellen nachladen (v1: aus inline-string, v2: Web Worker mit Spigot-Algorithmus)
- **Pointer Events** für Drag (vereint Maus/Touch/Stylus)
- **requestAnimationFrame-Loop** für Slider-Auto-Drift

### Komponenten

1. **`unfoldingPi.html`** — Layout + inline Script
2. **Pi-Source-Modul** (inline in script tag, v1): konstanter String + Lazy-Cursor
3. **State:**
   - `streamOffset` (int) — welche Pi-Stelle sitzt am linken Anker (default 0 = die `3`)
   - `windowSize` (int) — wieviele Stellen sichtbar (default 1 — nur die `3`)
   - `leftAnchorPos`, `rightAnchorPos` (px) — Anker-Positionen am Bildschirm
   - `driftSpeed` (float, stellen/sec) — Slider-Output
4. **Render-Funktion:** baut DOM aus `state` (oder updated minimal-diff)
5. **Drag-Handler:** pointerdown auf Anker oder Folge → updated state
6. **rAF-Loop:** wenn `driftSpeed != 0` → `streamOffset += driftSpeed * dt`, re-render

### Out of Scope für v1

- Spiegel-Pi / Pi-in-beide-Richtungen (kommt v2 wenn v1 funktioniert)
- Bi-infinite Strings (formales Objekt, separates Tool)
- Andere irrationale Zahlen (Slider zum Konstanten-Wechsel) — v2
- Web Worker für unbegrenzte Pi-Generierung — v2 falls 5000 Stellen nicht reichen
- Mobile-spezifische UX-Optimierungen (Tap-Targets, Safe-Area) — wird beim Test pro Memory `feedback_mobile_check_before_merge` geprüft

## Performance-Budget

- Soll auf „Gurken"-HW flüssig laufen (Tim's CLAUDE.md)
- Sichtbar gleichzeitig: ≤ ~500 Stellen (bei breitem Display + großem Fenster) — easy für DOM
- Drift-Loop: 60fps zielen, fps-Drop OK aber kein Stutter

## Essay-Sektion

Direkt auf der `unfoldingPi.html` als kurzer Intro-Text (oben oder ausklappbar): erklärt das Konzept „Pi mit Dicke 0", wieso beide Anker den Rest enthalten, und dass die `3` nicht speziell ist. Stil entsprechend der bestehenden Essay-Pages (`einPunkt.md`, `der.punkt`, `was-ist-die-eine-null`).

## Test-Plan

1. Tool öffnet → sieht `3 |` mittig + Slider unten
2. Drag rechten Strich nach rechts → `3.141592...` entrollt
3. Drag linken Strich (`3`) nach links → mehr Stellen zwischen ihnen
4. Swipe Folge nach links → `3` verschwindet im linken Strich, neue Stellen kommen rechts
5. Slider nach links → Auto-Drift nach links
6. Slider mittig → Stop
7. Slider nach rechts → Auto-Drift rückwärts
8. Mobile: Touch funktioniert wie Maus, Anker-Tap-Targets ≥40px
9. Mit `meta.css` Dark/Light Mode: Striche und Stellen lesbar in beiden
