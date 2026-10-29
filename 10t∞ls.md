# 10t∞ls

Was auf einzelnen Seiten schon gelöst ist, steht hier. Vor jedem Neubau nachsehen und Vorhandenes wiederverwenden. Ausgereiftes, das öfter gebraucht wird, wird bei Bedarf zu gemeinsamen Bausteinen unter `tools/` herausgelöst.

Die gemeinsame Infrastruktur (`meta.js`, `controls.js`, `zoom.js`, `0nefinity.js`, `tools/*`) beschreibt `AGENTS.md`; hier stehen davon nur konkrete, einzeln nutzbare Funktionen. Pro Eintrag: Datei mit Funktionsnamen, Was, Reife (ausgefeilt / brauchbar / roh), Nutzbarkeit (direkt / herauslösen / Muster). Zeilennummern sind ungefähr und veralten; Funktionsnamen suchen. Pfade relativ zum Repo-Wurzelverzeichnis. Neue Technik auf einer Seite: Eintrag oder Halbsatz hier ergänzen.

## Schrift und Text auf Raster/Punkte

### Text zu Zellmaske mit Supersampling
`10sand.html` (`getStampMask(text, fontPx, ss)`, `stampTextAt()`, `stampCharAt()`, `forEachCellOnLine()`). Text in Offscreen-Canvas rastern, per Max-Alpha herunterrechnen, Schwelle 96, Ausgabe `{dx, dy, cp}` als Typed Arrays mit Zeichenzuordnung je Spalte; Cache `stampMaskCache`; Linienmalen ohne Lücken. Ausgefeilt; `getStampMask` ist weitgehend eigenständig (herauslösen).

### Text auf N Punkte abtasten, mehrere Verteilmodi
`pointfont.html` (inline, keine Fremd-Skripte außer `controls.js`/`zoom.js`: `renderPoints()`, `selectGridPointsForBox()`, `selectContourPointsForChar()`, `selectPackedPointsForChar()`, `selectMaxDistancePointsForChar()` mit `relaxMaxDistSelection()` und inkrementellem `expand…`/`shrink…Selection`, `selectContourPointsLooseForChar()`, `getBgPoints()` mit `seededRandom`). Text groß auf Canvas, `getImageData`, je Zeichen N Punkte aus den Tintenpixeln wählen: Raster, Kontur, dichteste Packung, maximaler Abstand (mit Relaxation); +/-1 Punkt wird inkrementell gerechnet, eigene Caches je Modus. Punkt-Sprites einmal in OffscreenCanvas gerendert und per `drawImage` gesetzt (`createOrGetCachedSprite`); unsichtbarer selektierbarer Text-Overlay über dem Canvas, damit Text kopierbar bleibt; Zoom über `Zoom2D`. Brauchbar bis ausgefeilt (Seite 2000 Zeilen, Funktionen inline, herauslösen nötig). Ähnlich auch in: `Kuriositäten/musterpointfont.html` (`renderPoints()`, roh: lineare Pixelauswahl, feste 150 px).

### Glyph-Grenzen und optischer Mittelpunkt per Alpha-Scan
`adding-circles.html` (`measureGlyphPixels()`), `fonts-of-0nefinity.html` (`getTextMetrics()`, `getPixelBounds()`, `getDominantStemCenterX()`), `0neSlider.html` (`createGlyphImage()` liefert zugeschnittenen Glyph als dataURL mit Mittelpunkt-Offset), `unfoldingPi.html` (`dotMetrics()`, Tinte statt TextMetrics wegen WebKit). Misst Breite, Höhe, Schwerpunkt, Hauptstamm echter Tinte statt Font-Metriken; Alpha-Schwelle gegen Antialiasing. `measureGlyphPixels` und `createGlyphImage` direkt kopierbar (reine Funktionen), `getPixelBounds` aus fonts-of-0nefinity ist die ausgefeilteste (zwei Canvas-Kontexte nötig). Ähnlich auch in: `Kuriositäten/0neSlider- ist es ein Spiel Fragezeichen.html` (`measureGlyph()`).

### Schrift wirklich geladen? Glyph vorhanden?
`fonts-of-0nefinity.html` (`fontLooksApplied()`, `loadAndVerifyFont()`, `hydrateFonts()` mit 3 parallelen Arbeitern): Breiten- und Pixelvergleich gegen serif/sans/mono, bis 5 Versuche mit Wartezeit; Normalisierung aller Schriften auf gleiche optische Größe. Ausgefeilt, herauslösen. `heart.html` (`fontHasGlyph()`): FontFaceObserver-Technik, Breite "Font, serif" gegen "serif"; klein, brauchbar, direkt kopierbar (leicht falsch bei gleich breiten Glyphen).

### Glyph-Atlas und Sprite-Pool
`10sand.html` (`ensureHiresAtlas()`, `getHiresGlyph()`, `updateHiresAtlasTexture()`: 64-px-Glyphen in 16x16-Atlas, Neuaufbau bei Farbwechsel, CSS-Farben nur alle 30 Frames lesen), `game0f1ife.html` (`ensureGlyphAtlas()`: Zeichen einmal in Offscreen-Canvas, dann `drawImage`), `tools/unfolding-view.js` (`buildAtlas()`), `n0thingsp1s.html` und `0sp1wns.html` (`createTextTexture()`, `rebuildTextureCache()`, `getSprite()`/`recycleSprite()`: Pixi-Sprite-Pool mit Textur-Cache in 2x). Brauchbar bis ausgefeilt; Muster für jedes Raster oder jeden Baum aus Zeichen, herauslösen.

### Glyph-Kontur und Skelett (Moore-Tracing, Zhang-Suen)
`co0rdinates.html` (`extractCharContour()`, `zhangSuenThin()`, `extractCharSkeleton()`, `resamplePath()`, `connectContours()`, `normalizeContour()`, `computeWindingArea()`, `layoutTextContours()`, `generateTextControlPoints()`), `fourieous.html` (`extractContourFromCanvas()`, `mergeContoursWithIds()`, `resampleContour()`, `optimizeContourOrder()`). Glyph-Umriss per Randverfolgung, optional ausgedünntes Skelett, gleichmäßig nach Bogenlänge neu abgetastet, mehrere Zeichen zu einem Pfad. Brauchbar; Funktionen weitgehend rein, aber inline in großen Seiten (herauslösen). Ähnlich auch in: `Kuriositäten/bitte keine Hakenkreuze/bitte warum quadrat machen Hakenkreuz - co0rdinates.html` (ältere Fassung).

### Glyph zu Signed-Distance-Field (zwei Verfahren)
`shadows.html` (`edt1d()`, `edt2d()`, `canvasToSdfTexture()`, `makeSdfTexture()`): exakte Distanztransformation nach Felzenszwalb mit Subpixel aus Antialiasing, Half-Float als Three.js-`DataTexture`; ausgefeilt, braucht nur `THREE.DataTexture`/`DataUtils`. `fractal0ne.html` (`WORKER_SRC`, `generateSdfTexture()`, `uploadSdfTexture()`, `packFloat16()`): Jump-Flooding im Worker per Blob-URL, Int32-Seeds, Job-IDs verwerfen veraltete Aufträge; `WORKER_SRC` direkt kopierbar (Eingabe width/height/alpha, Ausgabe dist).

### Glyph-Tintenwert
`bibelaufdenpunkt.html` (`getGlyphPresenceWeight()`, mit Cache): Tintenmenge pro Zeichen (0..1) als Gewicht. Brauchbar, herauslösen.

## Text-Layout und Textdarstellung

### Gedrehte Textzeilen aus Bitmaps
`EinNullgespräch.html` (`wrap()`, `layout(force)`, `makeSprite()`, `buildChunk()`, `fold(j)`, `place(k)`, `draw()`, `drawReference()`). Wortumbruch per `measureText` (überlange Wörter zeichenweise), Ankerzeile bleibt beim Umbruch, Zeilen-Bitmaps in 6-ms-Häppchen per `setTimeout`, pixelgenaue Geräte-Ausrichtung, Zeilen gedreht und versetzt mit periodischem Falten, exaktes Culling gedrehter Rechtecke, `fillText`-Fallback. `drawReference()` ist die Testgrundwahrheit, Testhaken in `window.einNullgespraech`, Fehler brechen sichtbar ab (`fail()`). Ausgefeilt, herauslösen.

### Text in Kreisform setzen
`bibelaufdenpunkt.html` (`solveCircleRadius()` findet per Bisektion den kleinsten Radius für N Zeichen, `allocateCircleRowCharCounts()` verteilt nach Größte-Reste-Verfahren, `buildCircleLayout()`, `buildLineLayout()`, `getVirtualLineRowAt()` für Millionen Zeichen): ausgefeilt, die beiden Rechenfunktionen direkt kopierbar, Layout hängt am globalen `state`. Einfachere Variante: `Kuriositäten/bibleegg.html` (`generateLines()`, Sehnenlänge `sqrt(r²-y²)`, automatische Schriftverkleinerung, Kürzung nach Zoomstufe). Ähnlich auch in: `kreisausdingen.html` (`draw()`, n Zeichen gleichmäßig auf Kreis, je Zeichen `translate/rotate`, Radius relativ zur kürzeren Seite; `startHold()`), `Kuriositäten/kreisausdingen-goes-spiral.html` (Zeichen auf Spirale, Radius = base + progress*spiralFactor, URL-Parameter `anzahl`/`zeichen`; Variante `-anotherone.html`).

### Text auf Archimedischer Spirale
`1+0.html` (ganze Datei): vorgerendertes "+0"-Bild akkumulierend auf Spirale in Offscreen-Canvas gesetzt (`deltaAngle=PI/20`, `spacing=0.5*fontSize`). Brauchbar, herauslösen.

### Riesentext zoombar rendern (Texturstufen, Nah/Fern-Überblendung)
`bibelaufdenpunkt.html` (`renderTexture()`, `renderNahTexture()`, `getEffectiveFernTextureMaxSize()`, `getBlendThresholds()`, `scheduleProgressiveRefinement()`, `applyTransform()`, `updateBlend()`; `getGlTextureMaxSizeHint()` direkt kopierbar). Millionen Zeichen als Canvas-Textur in Stufen, beim Hineinzoomen durch scharfen Nahtext ersetzt und überblendet; Texturgröße nach `MAX_TEXTURE_SIZE`, `deviceMemory`, DPR; progressive Nachschärfung; Freigabe von Canvas-Ressourcen. Ausgefeilt, aber monolithisch (nur Muster). Die Seite hat ältere Stände `bibelaufdenpunkt copy*.html`; maßgeblich ist `bibelaufdenpunkt.html`. Ganzes Projekt (Millionen Zeichen) als rotierendes Symbol: `1c0de.html` (`projektAufbauen()`, `projektZeichnen()`; Glyph-Sprites als Zeilenläufe, je Instanz eine Fern-Textur aus echtem Text für das Moiré, Nahtext nur für die sichtbaren Zeilen, Quelltext aus `includes/code-bundle.txt` von `tools/generate-code-bundle.py`; Zellgröße der Ebenen aus der echten Textbox geteilt durch Spalten/Zeilen des gerenderten Textes, nicht aus dem Raster; Seitenwahl über `window.menuSuche.suchen()` aus `meta.js`).

### Pre-Blöcke auf Textbreite einpassen
`meta.js` (`getLongestPreLine()`, `fitPreBlocksToTextWidth()`, `scheduleFitPreBlocks()`): ASCII-Art-`<pre>` auf die Breite der längsten Zeile skalieren, gebündelt per Scheduler. Brauchbar, direkt kopierbar.

### Text auf SVG-Pfad
`Kuriositäten/bitte keine Hakenkreuze/ausversehen_Hakenkreuz.html` (`calculateFontSize()`): SVG `textPath` auf Linie oder Kreis, Schriftgröße aus `getTotalLength` und `textLength`. Roh.

### Mehrfach-Ketten-Layout (Stern/Kette) mit Tintenmaske
`unfoldingPi.html` (`layoutMulti()`, `inkMask()`, `starLocal()`, `parseDE()`): n gedrehte Canvas als Stern (Winkel 360/n, Länge bis zum Bildrand, Leserichtung der unteren Hälfte umgekehrt) oder Kette; CSS-Maske am Punkt. Brauchbar, seitenspezifisch mit Safari-Workarounds (herauslösen).

### Mathe-Formel aus MathML verschachteln und einpassen
`identitätskrise.html` (`generateMathMLFormula()` setzt Operator-Vorlagen aus `/identities.json` von innen nach außen ineinander, `adjustFormulaScale()` skaliert die Formel per CSS-Transform auf den Container mit Randfaktor 0.9, kompaktes URL-Format `?ANZAHL*OP1,OP2` in `parseURLParams()`/`updateURL()`). Brauchbar, herauslösen.

### Eingabe-Ersetzung pi(n)/e(n) mit Tippfehlern
`tools/math-notation.js` (`replacePiCalls()`, `replaceECalls()`, `getCaretRect()`, `caretRectFromMirror()`, `damerauLevenshtein()`, `classifyWord()`): ersetzt in Input/Textarea/contenteditable `pi(n)`/`e(n)` durch n Stellen, schlägt π oder ∞ vor (auch bei Tippfehlern), Hilfsbox am Cursor (Spiegel-Div misst Caret-Position). Ausgefeilt; direkt per `<script src="/tools/math-notation.js" defer>`, die beiden Hilfsfunktionen einzeln herauslösbar.

### Symbolwechsel bei Hover (0/1/∞)
`018-transform.js` (`getNextSymbol()`): Zeichen bei Hover in Spans gewickelt und durch 0, 1, ∞ rotiert, CSS-Puls. Brauchbar, direkt einbindbar.

### Fuzzy-Menüsuche mit Aliasen und Phonetik
`meta.js` (`initMenuSearch()`, `compact()`, `fuzzyDist()` nach Sellers, `termScore()`, `search()`, `renderLabel()`, Inhaltssuche `loadContent()/contentMatch()/renderSnippet()`): normalisiert Akzente/Umlaute/π/∞, Wortanfang, Teilstring, Tippfehler bis Distanz 2, k/c, s/z, 0/o gleich, Aliasgruppen (inf = unendlich), Hervorhebung mit `<mark>`, Snippets. Ausgefeilt; `compact`, `fuzzyDist`, `termScore`, `search` arbeiten auf einer Eintragsliste und sind aus dem DOM-Teil herauslösbar.

## Canvas/WebGL-Rendering

### WebGL2-Mandelbrot mit Perturbation (Shader)
`gespiegeltes-mandelbrot.html` (Fragment-Shader `FS`, `uploadRef()`, `draw()`, `probe()`, `snap()`, `zoomAt()`): Referenzorbit als Float-Textur (RG32F, 4096 breit), Pixel iterieren nur die Differenz mit Rebasing, Kreisinversion fürs Äußere, skalierte Distanzschätzung, Zoom bis 1e-30, Kontextverlust-Meldung, Zustand in URL, rAF-Bündelung. Ausgefeilt; Shader-String plus `uploadRef`/`draw` als Modul herauslösbar.

### Raymarching mit zusammensetzbarer GLSL-Fold-Pipeline
`fractal0ne.html` (`buildFragmentShader()`, `buildProgram()`, `camBasis()`, `euler3x3Inv()`, `rayThroughCursor()`, `buildPanel()`/`renderPipeline()`, `encodeState()/decodeState()`; Tabelle `FOLDS`): Fragment-Shader wird zur Laufzeit aus einer Liste von Faltungs-Bausteinen zusammengesetzt, Marsch über Text-SDF, freie Kamera, Mausstrahl-Pick, Presets, Zustand in URL. Brauchbar; Shader-Generator-Muster.

### Volumetrischer Spot-Nebel mit Glyph-Löchern (Three.js)
`shadows.html` (`createFogMaterial()`, `buildOneSphere()`, `updateShaderUniforms()`, `updateFogUniforms()`): `ShaderMaterial`, bei dem drei Glyph-SDF-Texturen als Löcher einer Kugel wirken; Spot-Winkel, Penumbra, Zerfall, Invert-Modus. Brauchbar, stark szenengekoppelt (Shader-Strings plus Uniform-Satz herauslösen; three@0.168 liegt unter `/tools/vendor/three/`).

### Shader-Helfer und Kreisschar in vier Techniken
`fun-with-circles/shader-kreise.html` (`createShader()`/`createProgram()` mit Fehlerlog, Fragment-Shader mit Schleife und `smoothstep`), `fun-with-circles/kreise-auf-einem-canvas.html`, `kreise-p5.html`, `cssKreise.html`; `radialfun.html` vergleicht Kreisverteilung `theta = i*360/n` in CSS, Canvas, SVG, Three.js (Farbe aus CSS-Variable mit Cache-Leerung). Roh bis brauchbar; `createShader/createProgram` als Standardhelfer, `syncInputs` (Range plus Zahlfeld synchron) als Eingabemuster. Ähnlich auch in: `fun-with-circles/Weiße Kreise.html` (Canvas-Variante, gleiches Prinzip).

### Löcher per SVG-Maske
`holes.html` (`class Hole`, `class HoleManager`, `.black-layer { mask: url(#holeMask) }`): schwarze Ebene über weißer, Löcher als SVG-Kreise in einer Maske mit Ein-/Ausblendanimation, Lebensdauer, Modi (Klick, Maus, Auto, Zufall). Roh bis brauchbar; Maskentechnik als Vorlage.

### SVG-Kaleidoskop per `<use>`
`1kaleidosk0p.html`: Dreieck mit `clipPath`, 6 Transformationen (3 Rotationen x Spiegelung) pro Zelle über `<use>`, 80x80 Dreiecksgitter, Drag verschiebt per `getScreenCTM().inverse()`. Brauchbar, klein.

### Kugel mit Glühen (Radialverlauf)
`riemann-leuchtet.html` (`drawRiemannSphere()`, `drawGlow()`, `isPointOnSphere()`): Canvas-Linienkugel mit mehrschichtigem Radialverlauf-Glühen nach Intensität, Hit-Test, Touch/Maus. Roh; `drawGlow` ist ein kleiner Effekt zum Herauslösen.

### Quadratischer virtueller Zeichenraum
`heart.html` (`_018Space.getCanvasRealm()`, genutzt in `drawFrame()`): rechnet 0..1-Koordinaten und Schriftgrößen in einen zentrierten Quadratbereich um, unabhängig vom Seitenverhältnis. Brauchbar, IIFE direkt kopierbar.

### Löschfreie Dithering-Rezepte
`dithering.html`: zwei Grautöne (#646464/#656565) als Streifenmuster gegen 0,1-s-Flackern. Roh; CSS-Rezepte als Zeilenkopie.

## Animation und Tempo

### Auto-Tempo-Programm mit Cosinus-Rampen
`0nefinity.js` (`computeAutoSpeed()`, `computeIsInHoldPhase()`, `AUTO_SPEED_CONFIG`, `SPEED_STEPS`; Ease `(1-cos(pi t))/2`): Startrampe plus zyklische Tempo-Stufen, liefert Tempo und Haltephase aus der verstrichenen Zeit. Brauchbar, an Seitenzustand gekoppelt. Ähnlich auch in: `meta.js` (`faviconAutoSpeed()`, derselbe Zeitplan, herauslösbar).

### Zeitverzerrung mit stetigem Faktorwechsel
`0nefinity.js` (`getWarpedElapsed()`, `updateSnapshotFactor()`, `saveSnapshot()`, `loadSnapshot()`): verzerrte Zeit als Integral des Tempo-Faktors, Snapshot beim Faktorwechsel hält die Animation sprungfrei, Persistenz in localStorage. Brauchbar, herauslösen.

### Bildwiederholrate erkennen, DPR-Canvas, Drift-Schutz
`0nefinity.js` (`animate(timestamp)`): Hz-Schätzung über Median von 30 dt-Samples, DPR-bewusste Canvas-Größe (`setTransform(dpr…)`), Winkel `% 360` gegen Float-Drift, `lastTimestamp`-Reset bei `visibilitychange`. Brauchbar, herauslösen.

### Animiertes Favicon mit Frame-Cache
`meta.js` (`drawFaviconFrame()`, `startFaviconAnimation()`, `faviconAutoSpeed()`, `favParam()`): 180 Frames im 2°-Raster, lazy per `requestIdleCallback` als dataURL vorberechnet, Tab-Pause-sicher (virtuelle Frames), respektiert reduced-motion, Parameter aus URL und sessionStorage. Ausgefeilt; `drawFaviconFrame` und das Cache-/Idle-Muster herauslösbar.

### Zeitachsen-Animation mit Rückwärtslauf
`biggercontext/test.html` (`seg(t, von, bis)`, `measure()`, `boxDist()`, `infPathD()`, `render(t)`, `loop(dir, speed, done)`): Segmente auf einer Zeitachse, Balken morpht in 96 Punkten in eine Lemniskate, Elemente fliegen auf Dreieckspositionen; vorwärts und rückwärts mit Tempo abspielbar, `prefers-reduced-motion`, Layout aus gemessenen Boxen. Ausgefeilt; `infPathD()` und `boxDist()` direkt kopierbar, Playback-Muster übertragbar.

### Verlaufsspeicher als Ringpuffer (Zeitversatz)
`circleheart.html` (`getHistoricalState(framesAgo)`, Ringpuffer `historyTop/Bottom/OffX/OffY`, `bendFunctions`, `applySnap()`): Float32Array-Ringpuffer (100000 Frames), linear interpoliert zurückgelesen, damit innere Elemente mit Verzögerung folgen; Biegefunktionen und Einrasten. Brauchbar; Ringpuffer (20 Zeilen) direkt kopierbar.

### Easing, Fade und Pfad zeichnen
`divide-the-light.js` (`easeInExpo()` `2^(10(t-1))`, `changeBackgroundColor()` setzt `--bg-color`): direkt kopierbar. `why-coordinatesystem-is-chicken.html` (`easeInOutQuad()`, `animate()`): SVG-Pfad per `strokeDashoffset` zeichnen, Koordinatensystem per `getPointAtLength` mitführen, Phasenzyklus; Muster.

### Phasen-Tempo: Zahl wird zu Rauschen
`rlz8.html` (`calculateTickRate()`, `calculateIncrementPhase2()`, `calculateFlickerIntensity()`, `calculateSyncFactor()`, `generateInfinityFlicker()`, `startHolding()`, `isNumberOverflowing()`): Gedrückthalten lässt eine BigInt-Zahl exponentiell wachsen (Tick 50 auf 5 ms, Inkrement 1 %), Ziffern flackern zu 0/1/∞ und gleichen sich an; Überlauf-Erkennung per Breitenmessung. Roh bis brauchbar; Kennlinien-Funktionen sind rein.

### Punkt auf Kreisbahn mit Tempo-Stufen
`einst-rannte-ein-punkt-im-kreis.html` (`animate()`, `formatSpeed()`): Winkelinkrement mit Spur aus Liniensegmenten, Tempo pro Klick mal 10, Anzeige in Exponentialschreibweise. Roh (Tempo pro Frame, nicht zeitbasiert).

### Rekursives Herauszoomen per Rahmen (CSS)
`Kuriositäten/zoomfailpercussionvisualizer.html` (`handleZoom()`): hüllt den Screen in einen neuen Rahmen, CSS-Transition scale 0.8 auf 1, Leertaste löst aus. Roh (DOM wächst unendlich); Muster.

## Zoom, Pan, Eingabe

### Verteilbarer 2D-Zoom/Pan-Helfer
`tools/zoom.js` (`createZoom2D({container, content, …})`, `zoomAt()`, `screenToWorld()`, `setView()`, `dampingLoop()`): Rad, Maus-Drag, Zwei-Finger-Pinch um den Fixpunkt, Skalengrenzen 1e-9..1e6, optionale Trägheit, animiertes `setView`, Hooks zum Ignorieren von Gesten. Brauchbar; direkt. Der Standard für neue Seiten; die Eigenbauten unten sind Alternativen mit anderem Schwerpunkt.

### Gesten-Modul ohne Abhängigkeiten
`tools/gesten.js` (`Gesten.attach(el, {getView, setView, minScale, maxScale, excludeSelector, wheelStep})`, `ankern()`, `klemmen()`): Modell aus `bibelaufdenpunkt.html` herausgelöst. Rad (3 %), Maus-Drag, Pinch mit wandernder Mitte, Finger loslassen: der andere schwenkt ohne Sprung weiter; Weltpunkt unter Zeiger/Fingern bleibt auf < 1 px stehen; Grenzen `null` = unbegrenzt; Panel per `excludeSelector` ausgenommen. Test `tests/gesten/run.js` (mit Gegenprobe). Genutzt von `1c0de.html`. Brauchbar; direkt. Für Seiten, die nur Ansicht setzen wollen, ohne Zoom2D.

### Zoom/Pan/Pinch-Eigenbauten
`10sand.html` (`ZOOM_CONFIG` 1e-5..1e4, `setupZoomPanEvents()`, `syncGridToScreen()`, `screenToWorld()`/`worldToScreen()`, `worldToGridIndex()`; Ziel-/Ist-Werte mit Damping 0.5, das Grid wächst per `gridOffsetX/Y` in negative Richtung): ausgefeilt. `beidseitig-belegtes-mandelbrot/app.js` (`zoomSmooth()`/`glideStep()`: Zoom als Logarithmus gesammelt und pro Frame zu einem Drittel verbraucht; Ansicht als BigInt-Hex im URL-Hash): brauchbar bis ausgefeilt, das Log-Gleiten ist direkt übertragbar. `bibelaufdenpunkt.html` (`beginScenePan()`, `updateScenePinch()`, `handleWheel()`), `fonts-of-0nefinity.html` (`zoomAtClient()`, `updatePinch()`, DOM-Transform), `moire effect fractal math art generator.html` (`zoom()`, `pan()`, `redraw()` per `setTransform`, 7 Zeilen): alle fixieren die Weltkoordinate unter Finger/Zeiger, brauchbar. `0neSlider.html` (`initSliderZoomInteraction()`): Zoom des Slider-Bereichs.

### Hold-Repeat, Winkel zwischen zwei Fingern
`kreisausdingen.html` (`startHold()` 500 ms, dann 100 ms), `tools/controls.js` (Haltetaste 400/80 ms), `tools/cookies-banner.js` (`holdable()`), `Kuriositäten/kreisausdingen-goes-spiral.html` (`startHold(action, 500, 100)`, `getAngleBetweenTouches()`, Wheel/Shift-Wheel, `resizeCanvas()` über `getBoundingClientRect` für Firefox Mobile). Brauchbar; `holdable()` und `startHold` direkt kopierbar.

### Drehknopf-Geste
`EinNullgespräch.html` (`polar()`, `knobMove()`, Zwei-Finger- und Mausrad-Scroll): Winkelzuwachs normalisiert (Sprung über 180° abgefangen), Abstand vom Zentrum schiebt zusätzlich. Ausgefeilt, herauslösen.

### Multitouch-Halter mit Gleiten
`0klang.html` (`halter`-Map, `greifen()`, `loslassen()`, Zähler pro Note, `gleite()`): Pointer-Multitouch für Tasten und Akkord-Pads, Zähler verhindert vorzeitiges Abschalten bei mehreren Haltern. Brauchbar, herauslösen.

### Editor für Kontrollpunkte: Hit-Test, Undo, Zustandsübergang
`co0rdinates.html` (`screenToMath()`/`mathToScreen()`, `distanceToSegment()`, `getInteractionTarget()`, Pointer-Handler, `snapshotState()`/`restoreModuleState()`, `animateStateTransition()`, `animateReset()`): Hover, Löschabzeichen, Radiusziehen per Drag, Undo-Snapshots, Auto-Zoomfenster. Brauchbar bis ausgefeilt; Hit-Test-Funktionen kopierbar.

### Verschachtelte Kreise bearbeiten
`integralisierungstool/integralizer.js` (`Circle`/`TextElement`, Zustandsautomat `STATE`, `startRenderLoop()` mit Dirty-Flag, `getElementAtPosition()`, `autoLayoutChildren()`, `avoidOverlaps()`, `serializeToURL()`/`loadFromURL()`): Kreise und Texte ziehen, skalieren, verschachteln; Kinder radial um den Elternkreis; Baum als JSON in Base64 in der URL (`?data=`); Rendern nur bei Änderung. Brauchbar; `avoidOverlaps` kopierbar, Serialisierung und Dirty-Loop als Muster.

### Glyph-Slider (Track "1", Thumb "0")
`0neSlider.html` (`renderSliderImages()`, `setThumbPosition()`, `valueToNormalized()`, `normalizedToValue()`, `setSliderValue()`, `updateSlider1Display()` als Kette aus Spans, `getBaseChainLength()`, Stepper mit Hold-Repeat; `initSnakeWebGL()` ungenutzt). Schlanke Varianten: `0neotherSlider.html`, `Kuriositäten/ai-slop/an0therSlider.html` (unsichtbares `<input type=range>` plus Glyph-/SVG-Text-Thumb als data-URI). Brauchbar bis roh, herauslösen.

### Dynamische Regler-Schrittweite um 1
`shadows.html` (`getDynamicStepForValue()`, `formatValueUnlimited()`): ab Wert 1 fester Schritt, darunter 0.1/0.01/0.001 passend zur Größenordnung, auch abwärts. Roh bis brauchbar, reine Funktion.

### Einstellpanel-Bibliothek
`tools/controls.js` (`Controls.createPanel()`, `addSlider()`, `addToggle()`, `addSelect()`, `addCountPicker()`, `addPatternPicker()`, `addMetricsOverlay()`, `addResetButton()`, `addPauseButton()`, `savePreset()`; Hilfen `preciseAdd`, `preciseScaleByTen`, `scaleStepLogarithmically`, `defaultsToast`). Desktop-Panel und Mobil-Sheet, Regler mit Decimal-Präzision, logarithmischen Schritten, wachsender Skala, Reset mit Rückgängig, Presets, FPS-Overlay. Ausgefeilt, durch Playwright-Tests mit Gegenprobe abgedeckt; direkt (`/tools/controls.js` plus `meta.css`/`meta.js`). `tools/controls copy.js` ist eine Altkopie. Kleines Beispiel mit p5: `whitelines.html` (`setup()`, `draw()`, `resizeToContainer()` mit ResizeObserver).

### Bestätigungsdialog als Promise
`tools/dialog.js` (`window._018Dialog.confirm()`): Modal mit confirm/cancel/dismiss, Fokus-Rückgabe, Escape/Enter, ARIA; Promise liefert die Aktion. Brauchbar, direkt.

### Dateiablage per Drag and Drop
`bibelaufdenpunkt.html` (`handleUploadZoneDrop()`, `transferAcceptsTxt()`, `processUploadFiles()`, `downloadTextAsTxt()`): Drop-Zone prüft DataTransfer schon beim Drag-Over, nimmt .txt auf, Download als .txt. Brauchbar, herauslösen.

### Foto-Overlay mit Drag/Resize/Rotate-Griffen
`0nefinity.js` (`createEditablePhoto()` mit `startDragging()`, `startResizing()`, `startRotation()`). Brauchbar, herauslösen; ältere Stände in `0nefinity copy.js`, `0nefinity-old.js`, `0nefinity-test.js`.

## Zahlen und Präzision

### Irrationale Konstanten im Worker (Milliarden Stellen)
`tools/irrational.js` (`Irrational.open('pi', {onDigits, onLimit, onNotice, onError})`, `h.want(n)`) und `tools/workers/irrational-worker.js` (`calcPi()`, `calcE()`, `calcLn2()`, `calcSqrt()`, `calcPhi()`, `reserve()`): pi (Chudnovsky), e, ln2, sqrt2, phi mit Binary Splitting über GMP/WASM, stufenweise wachsend, ASCII-Ziffern per Transfer-Buffer, BigInt-Rückfall ohne WASM. Ausgefeilt (Speicherbedarf gemessen, Stufen gegen die erste geprüft, Tests mit Fehlerinjektion, fail loud). Direkt per `<script src="/tools/irrational.js">`, braucht Worker-Datei und `/tools/vendor/gmp-wasm/`; `bsPiBig`, `bsEBig`, `bsAcothBig`, `isqrtBig` als reine BigInt-Funktionen herauslösbar.

### Pi-Ziffern aus Datei per HTTP-Range
`tools/pi-file.js` (`PiFile.create()`, `decodeGroup()`, `plan()`, `send()`, `multiParts()`, `evict()`, `count()`): liest aus einer 1e9-Pi-Datei (59 Ziffern in 196 Bit) per Multi-Range-Requests, LRU-Cache weniger 472-Ziffern-Gruppen, Vorladen entlang der Bildbahn, bricht unnötige Anfragen ab, zählt Ziffernhäufigkeit. Ausgefeilt (jeder Fehler genau einmal laut); direkt (Global `PiFile`). `multiParts`/`parseRange` für jede große Binärdatei mit Range-Zugriff herauslösbar.

### Pi mit Decimal.js (einfache Fassung)
`kreisausdingen.html` (`calculatePi()`, `isPiPrefix()`, `getNextPiDigit()`, Cache `piCache`) und `Kuriositäten/kreisausdingen-weird-8.html` (zusätzlich `incrementRadius()`, Infinite-Modus mit konzentrischen Kreisen; braucht `/tools/tools/decimal.js`). Chudnovsky mit Präzision digits+10, Ziffern-Cache, Präfixprüfung der Eingabe. Roh bis brauchbar (Fakultät naiv, synchron im Hauptthread); für große Stellenzahlen `tools/irrational.js` bevorzugen.

### Pi-Ziffern als Preise, große Tabellen virtualisieren
`buyPi.html` (`validateConfiguration()`, `formatPriceFromDigits()` mit Erhalt führender Nullen, `formatNumber()`, Clusterize-Aufruf): 292000 Pi-Ziffern als String, Blöcke als Preise gelesen und gegen Stripe-Grenzen geprüft, bis 36500 Zeilen mit Clusterize.js virtualisiert (nur ~6 Blöcke im DOM). Brauchbar; Clusterize-Einbindung als Muster, die Ziffern besser aus Datei laden.

### Große Zahlen formatieren, Modus-Strings parsen
`kreisausdingen.html` (`parseModeString()`, `calculateDisplay()`, `modeToURLString()`: Regex-Parser für `double(4)`, `ten(-2)`, `011001(3)`, `infinite(8)`, 2^n und 10^n exakt mit Decimal.js) und `numberline.html` (`formatLargeNumber()` per BigInt, `changeFactor()` mit exponentieller Interpolation `start*(end/start)^progress`, bis 1e308 dann "∞", Schrift schrumpft bis es passt). Brauchbar; `formatLargeNumber` und die Interpolation direkt kopierbar, der Parser hängt am Modus-Vokabular. Ähnlich auch in: `tools/cookies-banner.js` (`parseCount()`, `wholePart()`, `money()`: BigInt-Zähler mit Intl-Währungsformat und 256-Bit-Zufallsschlüssel per `crypto.getRandomValues`).

### Reproduzierbarer Zufall und Permutation
`beidseitig-belegtes-mandelbrot/chain.js` (`rng(seed, k)`, mulberry32-artig): direkt kopierbar, die beste Wahl. `bibelaufdenpunkt.html` (`createAffinePermutationParams()`, `permuteAffineIndex()`: Pseudo-Permutation beliebiger Länge ohne Array nach `a*i+b mod n` mit teilerfremdem a; `hashSpiritUnit()` Integer-Hash; Remix-Funktionen über Wort/Satz/Zeichen mit Locale-Sortierung, abbrechbar): Permutation und Hash direkt kopierbar. `fourieous.html` (`seededRandom()` per Sinus-Hash, `shuffleWithSeed()`, `sortCoefficients()`): roh, der Sinus-Hash verteilt schlecht. `10sand.html` nutzt Hash-Zufall `(x*73856093 ^ y*19349663 ^ frameId)&1` je Zelle.

### Taschenrechner-Auswertung in Echtzeit
`taschenrechner.html` (`evaluateFormula()`, `chooseOperator()`, `calculate()`): Token-Liste, Ergebnis über `Function(...)`. Roh (Number statt BigInt/Decimal, wertet Eingabe aus); nur Idee.

## Geometrie (Kreise, Spiralen, Fraktale)

### Tiefer Mandelbrot per Perturbation und BLA (CPU)
`beidseitig-belegtes-mandelbrot/perturb.js` (`iteratePixel()`, `iterateLean()`, `blaPays()`, `buildBLA()`): Delta-Iteration um eine hochgenaue Referenzbahn mit Rebasing, Bilinear Approximation (überspringt 2^k Schritte), Brent-Zyklenerkennung für Innenpunkte, glatter Escape-Wert, Distanzschätzung; die Kette funktioniert bis Zoom ca. 1e-280. Ausgefeilt; reine Funktionen auf Float64Arrays, per `importScripts`/`module.exports` nutzbar (Eingabe `Zr, Zi, L` aus `referenceOrbit()`).

### Referenzbahn in BigInt-Festkomma und Minibrot-Kette
`beidseitig-belegtes-mandelbrot/chain.js` (`referenceOrbit()`, `fixed()`, `shiftTo()`; `findMinibrot()`, `nucleus()`, `exactPeriod()`, `atomPeriod()`, `class Chain` mit `at()`, `centerAt()`). Rechnet z²+c in BigInt beliebiger Bitzahl und rundet auf Doubles, Schutz gegen `Number(BigInt)` = Infinity jenseits 2^1024; aus einem Seed entsteht lazy eine unendliche Kette echter Mandelbrot-Mengen (Newton findet die Kerne, nur + - * / sqrt, damit alle Browser dasselbe liefern). Brauchbar bis ausgefeilt; direkt importierbar (`module.exports`), `Chain` setzt `perturb.js` voraus.

### Gaußsche RBF-Verformung per FFT
`co0rdinates.html` (`gaussian()`, `prepareStateForRendering()`, `getDisplacementForState()`, `fftInPlace()`, `computeBaseSpectrum()`, `applySpectralModifiers()`, `generateShapeControlPoints()`, `getPolygonVertices()`, `getStarVertices()`): Koordinatengitter durch Kontrollpunkte mit Gaußgewichten verbogen (Gewicht aus dist² ohne sqrt, Early-Exit unter 1e-7); für Punkte auf geschlossener Kurve löst eine zirkulante RBF-Matrix per Radix-2-FFT die Zielverschiebung, Twist/Skalierung im Spektrum. Ausgefeilt; `fftInPlace()` und `gaussian()` direkt kopierbar. Ähnlich auch in: `Kuriositäten/bitte keine Hakenkreuze/bitte warum quadrat machen Hakenkreuz - co0rdinates.html` (ältere Fassung, 76 KB). Unendliche Ebene: Ansicht als Weltpunkt in der Bildmitte plus Zoom (`computeCover()`: Quadtree-Urbild des Bildausschnitts unter der Verzerrung mit Lipschitz-Schranke, Linien nur dort fein abgetastet, wo ein Kontrollpunkt wirkt; `drawGrid()`: Zehnerstufen mit Einblenden beim Zoomen; Zoom 1e-5 bis 1e4, Ansichtsmitte bis etwa 1e8).

### Text zu Fourier-Epizykeln
`fourieous.html` (`extractContourFromCanvas()`, `computeDFT()`, `precomputeCycle()`, `drawEpicycles()`, `drawTrace()`): Glyph auf Canvas, Randtracing, auf ca. 400 Punkte resampelt, DFT zu Koeffizienten, Epizykel-Zeichnung mit Spur; mehrere Zeichen getrennt oder vereinigt. Brauchbar (DFT O(N²), bei 400 Punkten ok); `extractContourFromCanvas` und `computeDFT` eigenständig herauslösbar.

### Federkette in 3D mit Orbit-Kamera
`sprinky.html` (`step()`, `updateCamera()`, `worldToScreen()`, `screenRay()`, `intersectRayPlane()`, `rotateAroundAxis()`, `pick()`, `draw()`): Punkt-Masse-Feder mit Dämpfung, Biegesteifigkeit und Reibung, greifbar per Ray-Picking auf Ebene, Mini-Vektor-Mathe und Orbit-Kamera ohne Bibliothek, Wandkollision. Brauchbar, herauslösen. Ältere 2D-Vorstufe: `spirals copy.html`; Variante: `sprinky copy.html`.

### Konzentrische Kreise: Export und Video-Zoomfahrt
`millionen_Kreise_aufnehmen.html` (`drawCircles()`, Download- und Record-Handler, `animateZoom()`): geometrische Kreisfolge (Faktor 1,01), nur sichtbare Radien (Abbruch bei Bilddiagonale), PNG-Export in Wunschgröße mit skalierter Linienbreite, WebM-Aufnahme per `captureStream(30)` + `MediaRecorder` (VP9). Brauchbar; der Aufnahme-Ablauf ist herauslösbar.

### Unendliche Linien mit Moiré
`moire effect fractal math art generator.html` (`drawInfiniteLine()`, `isNearLine()`): Freihand-Linien werden zu Geraden mit parallelen Kopien im Abstand. Roh (zeichnet jedes Mal alles neu, Spanne fest ±1000).

### Ziffernband mit Verdichtungszone
`tools/unfolding-view.js` (`UnfoldingView.create()`, `buildAtlas()`, `deposit()`/`flush()`, `warp()`, `autoD()`, `hitTest()`, `setRemote()`): unendlich lange Ziffernkette auf Canvas, links eingerollt, Mitte lesbar, rechts verdichtet (Tinte bleibt erhalten, Haarlinie statt Verblassen); Ziehen/Wischen/Rad, Tempo bis 1e10 Stellen/s, Glyph-Atlas je Zeichen/Farbe/Größe, Ziffernquelle von `Irrational` oder `PiFile`. Ausgefeilt (Tests, `DigitError` bei Lücke); direkt (Global `UnfoldingView`).

## Audio

### Rauschpuffer und Bandpass-Kaskaden (WebAudio)
`0klang.html` (`rauschPuffer(rosa)`, `stufenQ()`, `teiltoeneBauen()`, `stimmeAn()`, `stimmeAus()`, `stimmeTon()`, `gleite()`, `zeichnen()`, `pegelLesen()`): 6-s-Rauschpuffer, rosa per Paul-Kellet-Filter, nahtloser Loop per Crossfade-Tail, RMS-Normierung; zwei kaskadierte Bandpässe mit Breite in Cent; `setTargetAtTime`-Gleiten mit `cancelScheduledValues`; Limiter per DynamicsCompressor; zwei Analyser (fftSize 16384) mit Spektrum-Zeichnung; Mikrofon ohne Echo-/Noise-Cancel. Ausgefeilt, herauslösen.

### Isochroner Pulston mit Analyser
`tones.html` (`class ToneGenerator`: `start()`, `stop()`): Sinus-Oszillator, Gain als Pulsmodulation, AnalyserNode, FFT-Visualisierung, Parameter live. Roh bis brauchbar; Klasse eigenständig.

## Worker und Performance

### Kachel-Rendering mit Worker-Pool und Zoom-Vorschau
`beidseitig-belegtes-mandelbrot/app.js` (`tiles()`, `runPass()`, `render()`, `transform()`, `preview()`, `keepSnapshot()`), `worker.js`, `refworker.js`. 64-px-Kacheln, Mitte zuerst, Pool holt Kacheln, veraltete Ergebnisse verfallen per Generationszähler; erst Viertelauflösung, dann scharf; der alte Frame wird beim Zoomen skaliert als Vorschau gezeigt; Referenzbahn in eigenem Worker; Float32Array-Transfer. Ausgefeilt; `tiles()`/`runPass()` für andere Kachelaufgaben herauslösbar.

### Zeilenbänder an Worker-Pool (Mandelbrot)
`normales-mandelbrot.html` (`pass()`, `render()`, `preview()`, `keepSnap()`, `zoomAt()`) und `tools/workers/normales-mandelbrot-worker.js` (`self.onmessage`, Nachricht `{id,w,row0,row1,x0,y0,s,k,maxit}`). hardwareConcurrency-1 (max. 8) Worker rechnen z <- k z² + c in 16-Zeilen-Bändern, Mitte zuerst, grober Durchgang (step 4) dann voll; Generationszähler, Snapshot-Canvas als Vorschau, Distanzschätzung `|z| ln|z| / |dz/dc|`, Kardioiden-/Bulb-Test, adaptive maxit nach Zoomtiefe. Ausgefeilt; Worker direkt kopierbar, für andere Pixelfunktionen nur den Rechenkern tauschen.

### Game of Life unbegrenzt im Worker
`tools/workers/game0f1ife-worker.js` (`cellKey()`, `parseKey()`, `nextGeneration()`; Nachrichten init/config/viewport/step) und `game0f1ife.html` (`initWorker`, `syncViewportToWorker`, `gameLoop()`): Sparse Set lebender Zellen (2^21-Koordinatenraum als ein Zahlenschlüssel), Nachbarzählung per Map, frei einstellbare Regeln, spontanes Leben und Zufallstod, Viewport an den Worker. Ausgefeilt; Worker direkt importierbar.

### Fallsand-Zellularautomat und DOM-Hindernisse
`10sand.html` (`stepSand()`, `updateCell()`; `getUiScreenRects()`, `isCellFullyCoveredByUi()`, `clearSandUnderRect()`, `clearSandAlongRectPath()`): Fallsand auf Typed Arrays (`grid`, `glyph`, `velocity`, `obstacle`), wechselnde Scanrichtung, Hash-Zufall für die Diagonale, optionale Schwerkraft in m/s²; DOM-Rechtecke blockieren Zellen, Sand unter UI wird weggeräumt, auch entlang des Bewegungspfads. Ausgefeilt bzw. brauchbar, herauslösen.

### Text-Sprite-Baumsimulation
`n0thingsp1s.html` (`createNode()`, `killNode()`, `spawnChild()`, `simulationStep()`, Pool und Textur-Cache) und `0sp1wns.html` (dasselbe, kleiner, 20 KB; `getRandomSpawnPosition()` aus dem sichtbaren Bereich). Rekursives Wachstum und Sterben von Knoten mit Winkel und Eltern-Beziehung, Zoom über `Zoom2D` mit Dämpfung. Brauchbar; Simulation einfach, Pool/Cache sind das Wertvolle.

### GIF-Export aus Alpha-Frames
`0nefinity.js` (`renderAlphaFrame()`, `encodeGif()`, `createGif()`, `captureLiveFrames()`, `trimTransparentEdges()`, `cssColorToRgb()`, `loadGifEncoder()`): Alpha-Kanal als 256-stufiger Palettenindex zwischen Hinter- und Vordergrundfarbe, gemeinsame Bounding-Box über alle Frames, `await nextTick()` entlastet den UI-Thread. Ausgefeilt, herauslösen; braucht `/tools/gif-encoder.js` (`GifEncoder`, `lzw()`, GIF89a ohne Bibliothek, Palette liefert der Aufrufer, brauchbar, direkt).

### Dev-Live-Reload mit Fail-loud
`tools/live-reload.js`: fragt `/_devmtime.php` alle 2 s ab, lädt bei Änderung neu, pausiert bei verstecktem Tab, meldet Ausfall genau einmal (bfcache berücksichtigt). Brauchbar; direkt, braucht den Server-Endpunkt.

## Zustand, URL, Tests, Sonstiges

### Zustand in URL-Parametern
`EinNullgespräch.html` (`setState()`, `saveUrl()`, `loadUrl()`; `animateTo()`/`stepAnim()` mit Ease-in-out): `history.replaceState` entprellt auf 250 ms, ausgefeilt, kleine Teile kopierbar. `shadows.html` (`readParamsFromURL()`, `updateURLFromParams()`, `scheduleURLUpdate()`, deklarative `PARAMS_CONFIG` mit urlKey/min/max/default): brauchbar, Muster. Weitere Fälle: `gespiegeltes-mandelbrot.html` (`saveUrl/loadUrl`), `fractal0ne.html` (`encodeState/decodeState`), Mandelbrot-Kette (BigInt-Hex im Hash).

### Playwright-Testmuster fürs Panel
`tests/lib/pages.js` (`panelPages()`), `tests/*/run.js` (autofill, menu-search, panel-jump, reset-choreo, sheet-open, slider-touch, speed-range): gemeinsame Seitenliste per Dateisuche, Pixel-7-Profil, simulierte Tastatur (visualViewport), `--local` tauscht Dateien der Live-Seite per Route aus, `--no-guard`/`--no-grow` als Gegenprobe (Test muss rot werden), Messung pro Frame. Ausgefeilt; Vorlage kopieren.

### Sitemap-XML laden
`sitemap.html` (`loadSitemap()`): `/sitemap.xml` laden, mit DOMParser parsen, Parserfehler prüfen, Liste bauen. Roh; abschreiben.

### iframe-Chat-Knopf (nur dev)
`tools/claude-chat.js`: Knopf und einklappbarer Rahmen mit iframe auf eigenem Origin, nur nach Login-Check sichtbar, Zustand gemerkt. Brauchbar, nur Dev-Hostnamen.
