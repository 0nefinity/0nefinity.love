# 1c0de.html - Uebergabe

Datei: `1c0de.html` (Repo 0nefinity.love, PR #179). Quelltext einer Seite wird als Kalligramm gesetzt (Text-Form oder rotierendes 018-Symbol).

## Aufbau
- Maske: Canvas, Form (Text-Form oder Symbol) zeichnen, Alpha-Schwelle (018: 16) -> Zelle innen/aussen. Zellgroesse = exakte Monospace-Zelle (Breite/Hoehe gemessen in `#mass`), line-height = Zellhoehe, Schrittweite 1/8 Geraete-Pixel.
- Raster: Quelle ohne Whitespace, Codepoints (astralsicher). Binaere Suche nach kleinster Spaltenzahl c, bei der Zellzahl >= N. Zeilen = round(c*Aspekt*cw/ch). Max. `MASKE_B` = 1600 Spalten.
- Fuellung: nach Index der Reihe nach, bei Ende von vorn (Wiederholung). Leerzeichen am Zeilenende gekuerzt. Nicht-Leerraum == Code in Reihenfolge.
- Fuellcode 018: Ausschnitt aus `/0nefinity.js` von `function drawFrameWithAngle(` bis `// Funktion zum Zuschneiden transparenter` (der Code, der das Startseiten-Symbol zeichnet).
- Animation 018: Geometrie identisch zum Favicon/Startseite (`drawFrameWithAngle`, `AUTO_SPEED_CONFIG`). Virtueller 60-Hz-Takt (`zeit`), ein c x z Canvas (`willReadFrequently`) direkt, pro Frame zeichnen + getImageData + Maske, Textknoten nur bei Aenderung, einmal pro Frame. Spaltenzahl aus 12 Probewinkeln, Reserve x1.15. `prefers-reduced-motion`: ein Frame.
- Ansicht: `tools/zoom.js` (Zoom2D, Config 1c0de.html:794): Rad 3 % je Schritt, Zoom unter Zeiger/Pinch-Mitte, Ziehen mit Maus und Finger, Pan unbegrenzt, Zoom nach aussen unbegrenzt (minScale 0). Die Bildmitte ist `ansichtMitte(sv)` (Zeile ~447ff); `groesseSetzen` (566) setzt `#fern`/`#nah`/`#muster` aus derselben Mitte. Regler "groesse" 0..4 ist Zusatzzoom, 0 erlaubt. Panel (`imPanel`) bleibt von Zoom/Pan ausgenommen.
- Resize/Rotation: 150 ms entprellt, Text-Modus baut neu, 018 passt nur Groesse an; kein Reload.

## Nah/Fern-Technik (aus bibelaufdenpunkt.html uebernommen)
Zwei Ebenen: `#muster` (echter Text, nah) und Canvas `#fern` (Form als Textur, fern). Ueberblendung per CSS-Opacity mit `smoothstep(FERN_START, FERN_ENDE, Zeichengroesse in Geraete-Pixel)`: 1.5 / 4 (dort 3.2 / 10). Text wird unterhalb der Schwelle gar nicht gebaut. Farbe der Textur per `source-in`. Nicht uebernommen: progressive Texturstufen, Presence-Overlay. Gleiche Technik fuer das Gesamtcode-Symbol verwenden: Fern-Textur aus derselben Maske, Opacity-Kopplung an Zeichengroesse.

## Messwerte
018 bei 4x CPU-Drosselung: 21-23 Updates/s (vorher 7.2), ungedrosselt 30/s. Kein Querscroll (Pixel 7, iPhone 390x844, Desktop 1440x900, hoch und quer).

## Bekannte Grenzen
- Ebenenversatz fern/nah gemessen < 1 CSS px (Text 0.14-0.63, Projekt <= 0.73 Canvas-px).
- Panel-Ueberlappung wird bei der Passung ignoriert.
- Schwellen 1.5/4 nach Augenmass, nicht pro Geraet getunt.
- Bei 4x Drosselung nur knapp ueber 20/s.

## Ursache der Doppelzeichen (behoben)
Die DOM-Box von `#muster` ist so breit wie die breiteste Zeile (Leerzeichen am Zeilenende gekuerzt) und so hoch wie die gerenderten Zeilen (leere Schlusszeile entfaellt). Das 018-Raster hat ~15 % Leerrand (563 Spalten, breiteste Zeile 481), `Box/raster.spalten` war daher eine falsche Zellgroesse und das Gitter wurde nach der Box zentriert, die Fern-Textur deckt aber das ganze Gitter: Versatz 1.17x. Fix: `textMasse` (Spalten/Zeilen der echten Box), Zellgroesse = Box / textMasse, Gitter aus der Ansichtsmitte zentriert. Chrome rastet den Zeilenabstand auf 1/64 px; die echte Box ist Referenz.

## Inventar bibelaufdenpunkt.html (Zeile : Inhalt : Status)
- 209 `touch-action: none` auf dem Container : uebernommen (zoom.js setzt es).
- 410-413 `CONFIG.ZOOM`, Radschritt 0.03 : uebernommen (wheelSpeed 0.03).
- 747 `getViewportMetrics` (Container-Rect als Bezug) : uebernommen als `ansichtMitte`.
- 3511 `beginScenePan`, 3547 `updateScenePinch` : Pan mit Maus/Finger, Pinch mit Mittelpunkt als Anker : durch Zoom2D abgedeckt.
- 3875 `wheel` am Container : Zoom am Zeiger : uebernommen.
- 3910 `touchmove`, 3921 `touchend`: nach Pinch zieht der verbliebene Finger weiter : uebernommen in `tools/zoom.js` onTouchEnd.
- 3584-3773 Textur/Blend/`applyTransform` (3671) : Fern/Nah-Ueberblendung : sinngemaess uebernommen (weich()).
- 3934 `resize` (1629-1660 Auto-Fit) : 150 ms entprellt, Mitte neu : uebernommen (Layout-Mitte bleibt, kein Reload).
- Nicht uebernommen: progressive Texturstufen und Neurender-Schwellen (Zeichenzahl hier klein genug), Presence-Overlay, Drop-Bible-Overlay, Fluestertexte, Karussell (6892ff), `viewAutoFit`.
- In der Quelle nicht vorhanden (daher nichts zu portieren): Traegheit, Doppeltipp auf der Szene, Tastatur-Pan/Zoom, URL-/History-Zustand, visualViewport.

## Seite-Feld
Eingabe in der Panelzeile "Seite" nutzt `window.menuSuche.suchen()` aus `meta.js` (gleiche Fuzzy-Suche und `includes/search-index.json` wie das Menue). Treffer als Liste (`ctrl-select-popup`), Pfeiltasten/Enter/Klick laden die Seite als Quelle; Liste scrollt im Panel sichtbar.
