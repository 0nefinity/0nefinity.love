# 0necanvas — Atelier-Redesign (Sieger des Design-Wettbewerbs + Veredelung)

- **Datum:** 2026-07-08
- **Grundlage:** Design-Wettbewerb 2026-07-07 (3 Mockups, Crit-Verdict).
  Sieger: **Atelier** („das Werk ist der Star") — einziger Entwurf, bei dem der
  Bildschirm dem Kunstwerk gehört; Defizite additiv behebbar.
- **Visuelle Referenz:** `0necanvas-design-atelier.html` (live:
  /0necanvas-design-atelier). Grafts aus `-werkbank` und `-null`.
- **Ziel-App:** `0necanvas.html` + `tools/0necanvas/` (Engine + controls.js-
  Panel bleiben; reines UI-Layer-Redesign).

## Kern-Prinzipien

1. **Der Bildschirm gehört dem Werk**: Canvas full-bleed (100dvw/dvh), keine
   Layout-Partition. UI liegt als Edge-Layer darüber und **dimmt bei
   Inaktivität weg** (3,5 s → Opacity 0.05; Pointer-Move zurück; kein Dim
   solange Panel offen oder Slider-Drag).
2. **controls.js unangetastet**: nur Reposition + Rahmen + Kontext-Ribbon
   („Kurve — Ding · 3 von 5 · im Feld von: Raum verzerren"). DOM der
   controls.js-Zeilen bleibt byte-identisch.
3. **0nefinity-Identität**: dunkel, EINE Akzentfarbe, Deutsch, keine Emojis,
   Strahl-Poesie statt Adobe-Chrome.

## Veredelung (Crit-Beschluss — 6 Grafts)

1. **⌘K-Kommando-Palette** + Shortcuts V/W/Z (Werkzeuge), F (Fokus), A
   (Bibliothek), H (?), ⌘D (Duplizieren) — Suche matcht Befehle UND
   Baustein-Namen/Kategorien, Empty-State („nichts gefunden — ⏎ öffnet
   Bibliothek"). [aus Werkbank]
2. **„wirkt ↓ n"-Tag** an Kraft-Zeilen + permanente Scope-Spalte im
   geöffneten Stapel. [aus Werkbank]
3. **Status-Chip** (Zoom % live, fps, Instanzen) unten, dimmt mit weg.
   [aus Werkbank]
4. **Strahl-Semantik im Stapel**: Blick/Auge als stiller Endpunkt oben,
   0/Ursprung unten; Icon-Grammatik: Dinge massiv, Erzeuger ausstrahlend,
   Kräfte im Linsenring. [aus Null]
5. **Mobile Drill-in-Sheet**: Peek (Mini-Strahl-Strip im Griff) / Halb / Voll;
   Stapel → Baustein → Regler mit Zurück-Pfeil; **Pill-Zeile bleibt bei
   offenem Sheet erreichbar** (Mockup-Regression nicht wiederholen). [aus Null]
6. **Flüstersätze** als Bibliotheks-Copy („Der Raum gibt nach.", „Vom Kreis
   zum Herzen — dieselbe Linie."), Kachel-Layout von Atelier. [aus Null]

## Roadmap (verbindlich, 3 Stufen)

**Stufe 1 — Stiller Rand + lesbarer Stapel** (reines UI-Layer):
Edge-Layer (Wortmarke + Aktionen + Werkzeug-Kapsel) über full-bleed Canvas;
Idle-Dim; Stapel im Atelier-Stil + Strahl-Semantik + „wirkt ↓ n"/Scope-Spalte,
kollabiert zur Glyphen-Spine rechts (Spine besser sichtbar als im Mockup —
Crit-Kritik!); Bibliothek: 3 Familien, SVG-Miniaturen, Flüstersätze, Suchfeld;
controls.js repositioniert + Kontext-Ribbon. Neues landet unter Kräften +
Undo-Toast (existiert).
*Acceptance:* Canvas 100dvh/dvw ohne Partition; controls.js-Zeilen-DOM
byte-identisch; Idle-Dim per Playwright-Timer-Test; 0 Console-Errors; 0px
Overflow (Desktop 1440×900 + Mobil 390×844); Tap-Targets ≥44px.

**Stufe 2 — Kontext am Objekt + Kausalität**:
Werk-Antippen → Live-Hüllbox + Chip über der Form (Name, Gattung,
Regler-Shortcut, Duplizieren, Löschen); Verzerren-Drag pulsiert
Kraft-Glyphe; Kraft-Selektion zieht Scope-Linie + Erklärzeile; Fokus-Modus
(◐) mit atmendem Rückkehr-Punkt; Flüster-Onboarding (3 verankerte Zeilen,
verschwinden bei Erstinteraktion — KEIN Modal; ersetzt bisherige Hint-Karte).
*Acceptance:* Klickpfad tippe-Werk→Chip→Regler ändert Canvas-Pixel
(Screenshot-Diff); Escape schließt in definierter Reihenfolge.

**Stufe 3 — Power + Mobile-Feinschliff**:
⌘K-Palette + alle Shortcuts + Empty-State; Status-Chip live; Mobile
Drill-in-Sheet (Peek/Halb/Voll, Zurück-Pfeil, Pills nie überdeckt).
Optional (nur wenn stabil): Null-Konstellation als alternativer poetischer
Bibliotheks-Einstieg hinter Toggle — nie einziger Pfad.
*Acceptance:* Palette-Suche „kraft"/„herz" liefert Treffer; Mobile: Stapel-Pill
nach Werk-Selektion tappbar ohne Zwischenschritt; fps-Anzeige = echte
rAF-Messung.

## Nicht-Ziele

- Kein Engine-/Block-Umbau (nur UI-Layer + minimale Hooks wie Bounds-Abfrage).
- controls.js-Innenleben tabu (Tims Entscheidung: Original-Handling gesetzt).
- Funktions-Regression verboten: alles aus Wellen A–C bleibt (Zeichnen,
  Kräfte-Einfüge-Logik, Undo, Einpassen/Neu, PNG-Export, Duplizieren,
  Patterns, ?s=-Kompatibilität).
