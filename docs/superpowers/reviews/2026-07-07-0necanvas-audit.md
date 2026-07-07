# 0necanvas — Voll-Audit 2026-07-07

9 Prüfer: 6 Dimensionen (Kompositions-Matrix, Interaktion, Vollständigkeit vs.
Originale, Robustheit, UI/UX, Konzept-Treue) als Workflow + 3 Einzelprüfer
(Geräte-/Browser-Matrix, Performance-Profiling, Unknown-Unknowns).
Alle Findings mit Playwright-/Code-Evidenz. Vollständige Details:
`2026-07-07-0necanvas-audit-findings.json` (41 gemergte Findings).

## Executive Summary

Fundament trägt: alle Engines (Chromium/Firefox/WebKit) grün, alle Viewports
320–2560px sauber, kein Memory-Leak, Laden exzellent (65 KB gz, <60 ms erster
Frame), JS <2 % Frame-Zeit, Sicherheits-/CSP-konform. Die Schwächen sind
(1) zwei Crash-/Verlust-Kanten, (2) ein systemisches „Freiheits"-Problem
(harte Clamps widersprechen der ∞-Philosophie und der Soft-Range-UI),
(3) Interaktions-Lücken (Overlays, Bewegbarkeit, Kamera-Rettung),
(4) Portierungs-Lücken gegenüber den Originalen.

## Kritisch (2)

- **K1 Tapete-OOM:** `zeilen`/`spalten`=1e6 getippt → Tab friert >15 s, Renderer
  crasht (Zellliste wird VOR dem Instanz-Budget materialisiert,
  blocks-muster.js:92-117). → Welle A
- **K2 URL >8 KB:** ~12 gemalte Striche → `?s=` überschreitet Server-Limit →
  Share-Link tot, **F5 = Szene weg** (414/Connection Closed). state.js ohne
  Längenprüfung. → **von Tim deprioritisiert („erst mal nicht so wichtig")**,
  nicht vergessen.

## Mittel (22) — Cluster

- **Freiheit/Philosophie (Welle A):** Positions-Käfig ±2000 in emit()+drag()
  aller Blöcke (Kamera pannt unendlich, Objekte kleben an unsichtbarer Wand;
  exakte Stellen im JSON) · systemische Render-Clamps (width/glow/density/
  morph/… — getippte Soft-Range-Werte wirkungslos; morph=-80 ≡ 0 statt
  invertiertem Herz) · 0-Regel-Verstöße (segmente min 1, width min 0.5 …).
- **Komposition (Welle A):** Spawner-Select kennt 4 neue Dinge nicht
  (Ladereihenfolge; Runtime kann alle 8) · Symbol+Verzerren wirkungslos bei
  Default (Anker=Fixpunkt; Glyphen unter map ohne Rotations-Schätzung) ·
  Fraktal über Symbol unsichtbar (Default-Zentrum deckungsgleich) ·
  Tapete sättigt Screen zu Weiß (keine Alpha-Normalisierung; 99,98 % Coverage) ·
  Prim-Kosten fehlen im LOD-Budget (20 Blöcke → 3 fps nach 3 min, kein Leak).
- **Interaktion (Welle A):** spawner/zellautomat/textbaum nicht positionierbar
  (kein x/y, kein hit/drag) · 8 von 17 Typen ohne Selektions-Overlay ·
  keine Kamera-Rettung (Zoom-to-fit/Neu fehlen; verlorene Kamera wird sogar
  in ?s= persistiert) · kein Undo (Löschen irreversibel; replaceState) ·
  Stapel-Reorder ohne Autoscroll · Warp-Werkzeug ignoriert Klickposition ·
  neue Blöcke landen immer ÜBER allen Kräften · Mobile-Sheet startet auf
  „Eigenschaften", Griff-Balken ohne Funktion · 1e6-Werte quasi-freezen ohne
  UI-Signal.
- **Onboarding:** Kern-Modell (Kräfte wirken nach unten) nirgends erklärt;
  Leerzustände stumm; Kraft allein auf leerer Szene zeigt nichts (ohne Hinweis).
- **Portierungs-Lücken (Welle B, Features):** GoL ohne die 22 Original-Patterns ·
  fourier ohne 4 der 6 Freq-Manipulationen · kurve ohne getrennte
  oben/unten-Verformung · fraktal-Kraft schwächer als circleheart-Fraktalmodus
  (innere/äußere, Delay) · ringschrift ohne echte Pi-Berechnung · verzerren
  ohne Chirp/Kernel-Formen · tapete ohne Dreieck-Clipping (kein nahtloses
  Parkett).
- **Umgebung:** `/0necanvas/` (Trailing-Slash) → HTTP 500 · schwere Szenen
  auf 4-6× gedrosselter CPU 5-8 fps (LOD rettet Bild, nicht Bedienung).

## Klein (11) / Ideen (6)

Duplizieren+Umbenennen fehlen · kein PNG-Export (Rechtsklick-PNG transparent) ·
load() ohne Typ-Validierung · Zeichnen-Wackler hinterlässt unsichtbare
2-Punkt-Pfade · Default-Optik spawner/textbaum wirkt anfangs leer ·
Benennungs-Inkonsistenzen (Strichstärke/Linienstärke…) · Icon-Doppelung ✦ bei
3 Kräften · Mobile-Werkzeuge ohne Label · „TrueArc"-Jargon · Favicon-404 +
kein og/description · kein Weg zurück zur Site (Wordmark nicht verlinkt) ·
Drucken weiß · 100vw-Clip bei Scrollbar · dvh ohne Fallback ·
prefers-reduced-motion ignoriert · Cache-Buster fehlt (für Live-Deploy) ·
localStorage-Autosave-Idee · Details im JSON.

## Performance-Profil (eigener Bericht)

Engpass = natives Rastern transformierter Sprite-Blits, nicht JS. Optimierungs-
Liste nach Gewinn/Aufwand: (1) axis-aligned Blits für kleine Instanzen (19×
gemessen) · (2) kurve-Pulse als Transform statt Geometrie-Neubau · (3) map-
Signatur ohne Array-Alloc · (4) Layer-Rebuild-Spikes budgetieren · (5) Default-
Szene cachebar (welle-Warp macht Chain time-variant). Bereits gut: Glow via
Offscreen-Composite (1× shadowBlur/Frame), Text-Scans gecacht, Layer-Cache
arbeitet korrekt, kein Leak.

## Fix-Plan

- **Welle A (sofort):** K1 + Freiheits-Cluster + Kompositions-Cluster +
  Interaktions-Cluster (ohne Undo-Vollausbau: nur Ein-Schritt-Undo fürs
  Löschen). Zwei Agenten, Datei-partitioniert (engine/ui vs. blocks-*).
- **Welle B (danach):** Portierungs-Lücken (Features), Onboarding-Hint,
  PNG-Export, Duplizieren, Benennungen, Site-Integration (Favicon, Wordmark-
  Link, og-Tags).
- **Welle C:** Perf-Optimierungen 1-4, Trailing-Slash-500 (Server), K2-URL
  (wenn Tim wieder priorisiert).
