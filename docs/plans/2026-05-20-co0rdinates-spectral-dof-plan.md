# co0rdinates Spektrale DOF — Implementierungs-Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [docs/specs/2026-05-20-co0rdinates-spectral-dof-design.md](../specs/2026-05-20-co0rdinates-spectral-dof-design.md)

**Goal:** Drei kontinuierliche Slider (Kernel-Breite ε, Twist α, Stärke s) zur Modulation der Form-Verzerrung in `co0rdinates.html`. Form-Identität bleibt, jeder Slider gibt einen kontinuierlichen ℝ-Range — ∞³ Kombinationsraum.

**Architecture:** `solveCirculantRBF` wird in `computeBaseSpectrum` (FFT-Eigenwert-Division, ε-abhängig) und `applySpectralModifiers` (Twist via Hermitian-symmetrischer Phasen-Multiplikation + Skalar-Skalierung + IFFT) zerlegt. Spektrum wird im Form-State gecached. ε-Änderung → Re-Solve. α/s-Änderung → nur Re-Modifier-IFFT.

**Tech Stack:** Vanilla JS, kein Build-System. Bearbeitet wird ausschließlich `/home/timbr/0nefinity/dev.0nefinity.love/co0rdinates.html`. Visuelle Verifikation via Playwright auf https://dev.0nefinity.love/co0rdinates.html (Live-Reload aktiv, kein Cache).

**Branch:** `claude-dev` im Dev-Worktree.

---

## Files

- Modify: `/home/timbr/0nefinity/dev.0nefinity.love/co0rdinates.html`
  - `solveCirculantRBF` (Zeile 837-884): zerlegen
  - `generateShapeControlPoints` (Zeile 1104-1143): Spektrum cachen, Modifier anwenden
  - `applyShape` (Zeile 1145-1183): Spektrum in State packen
  - UI-Panel-Block (Zeile 1843-1882): drei Slider + Reset hinzufügen
  - Slider-Handler: neue Funktionen `reapplyShapeModifiers`, `resolveShapeWithEpsilon`

Keine neuen Dateien. Keine Änderungen an `meta.css`, `meta.js`, `controls.js`.

---

## Task 1: Solver zerlegen — `computeBaseSpectrum` + `applySpectralModifiers`

**Files:**
- Modify: `co0rdinates.html` (Zeile 837-884, Block `solveCirculantRBF`)

Ziel: Math-Funktion in zwei zerlegen ohne Verhaltensänderung. `solveCirculantRBF(n, tDx, tDy, r)` bleibt als Convenience-Wrapper bestehen, ruft die neuen Funktionen mit Default-Params auf (twist=0, scale=1). Bit-exakt selbes Ergebnis.

- [ ] **Step 1.1: `solveCirculantRBF` finden und ersetzen**

Aktuellen Block (Zeile 837 bis 884) durch folgendes ersetzen:

```js
        // Berechnet das Basis-Spektrum S_base[k] = T[k] / λ(ε)[k] der RBF-Lösung
        // ohne Twist/Skalierung. n MUSS 2er-Potenz sein.
        function computeBaseSpectrum(n, targetDx, targetDy, radius) {
            // Erste Zeile der zirkulanten Matrix
            const w0Re = new Float64Array(n);
            for (let j = 0; j < n; j++) {
                w0Re[j] = gaussian(2 * Math.sin(Math.PI * j / n), radius);
            }
            const w0Im = new Float64Array(n);
            fftInPlace(w0Re, w0Im, false);

            // FFT der Zielverschiebungen
            const txRe = new Float64Array(n);
            const txIm = new Float64Array(n);
            const tyRe = new Float64Array(n);
            const tyIm = new Float64Array(n);
            for (let i = 0; i < n; i++) { txRe[i] = targetDx[i]; tyRe[i] = targetDy[i]; }
            fftInPlace(txRe, txIm, false);
            fftInPlace(tyRe, tyIm, false);

            // Division im Frequenzraum: S_base = T / λ
            const dxRe = new Float64Array(n);
            const dxIm = new Float64Array(n);
            const dyRe = new Float64Array(n);
            const dyIm = new Float64Array(n);
            for (let k = 0; k < n; k++) {
                const eR = w0Re[k], eI = w0Im[k];
                const denom = eR * eR + eI * eI;
                if (denom < 1e-30) continue; // bleibt 0
                const invD = 1 / denom;
                dxRe[k] = (txRe[k] * eR + txIm[k] * eI) * invD;
                dxIm[k] = (txIm[k] * eR - txRe[k] * eI) * invD;
                dyRe[k] = (tyRe[k] * eR + tyIm[k] * eI) * invD;
                dyIm[k] = (tyIm[k] * eR - tyRe[k] * eI) * invD;
            }
            return { dxRe, dxIm, dyRe, dyIm };
        }

        // Wendet Twist (lineare Phasen-Drift im FFT-Spektrum) und Skalierung an,
        // führt IFFT durch und liefert reelle Verschiebungs-Werte pro Kontrollpunkt.
        // Phase wird Hermitian-symmetrisch appliziert damit IFFT-Output reell bleibt.
        function applySpectralModifiers(spectrum, twist, scale) {
            const n = spectrum.dxRe.length;
            const dxRe = new Float64Array(n);
            const dxIm = new Float64Array(n);
            const dyRe = new Float64Array(n);
            const dyIm = new Float64Array(n);

            // DC bleibt reell, nur skaliert
            dxRe[0] = scale * spectrum.dxRe[0];
            dyRe[0] = scale * spectrum.dyRe[0];

            const half = n >> 1;
            for (let k = 1; k < half; k++) {
                const c = Math.cos(twist * k);
                const s = Math.sin(twist * k);
                // F[k] *= scale · e^(iαk)
                const xR = spectrum.dxRe[k] * c - spectrum.dxIm[k] * s;
                const xI = spectrum.dxRe[k] * s + spectrum.dxIm[k] * c;
                const yR = spectrum.dyRe[k] * c - spectrum.dyIm[k] * s;
                const yI = spectrum.dyRe[k] * s + spectrum.dyIm[k] * c;
                dxRe[k] = scale * xR;
                dxIm[k] = scale * xI;
                dyRe[k] = scale * yR;
                dyIm[k] = scale * yI;
                // Hermitian-Spiegel: F[n-k] = conj(F[k])
                dxRe[n - k] =  dxRe[k];
                dxIm[n - k] = -dxIm[k];
                dyRe[n - k] =  dyRe[k];
                dyIm[n - k] = -dyIm[k];
            }
            // Nyquist (N gerade): rein reell, mit cos-Faktor
            if ((n & 1) === 0) {
                const cn = Math.cos(twist * half);
                dxRe[half] = scale * spectrum.dxRe[half] * cn;
                dyRe[half] = scale * spectrum.dyRe[half] * cn;
            }

            fftInPlace(dxRe, dxIm, true);
            fftInPlace(dyRe, dyIm, true);

            const dx = new Array(n);
            const dy = new Array(n);
            for (let i = 0; i < n; i++) { dx[i] = dxRe[i]; dy[i] = dyRe[i]; }
            return { dx, dy };
        }

        // Backward-compat wrapper: solveCirculantRBF(...) = applySpectralModifiers(computeBaseSpectrum(...), 0, 1)
        function solveCirculantRBF(n, targetDx, targetDy, radius) {
            const spectrum = computeBaseSpectrum(n, targetDx, targetDy, radius);
            return applySpectralModifiers(spectrum, 0, 1);
        }
```

- [ ] **Step 1.2: Visual-Verify keine Regression**

Browser laden: https://dev.0nefinity.love/co0rdinates.html

Erwartung: Seite lädt, freie Kontrollpunkte funktionieren wie vorher. Klick auf Quadrat (◻) → Quadrat-Verzerrung erscheint exakt wie vorher.

Falls Form unverändert aussieht → OK, Refactor ist transparent.

- [ ] **Step 1.3: Commit**

```bash
git add co0rdinates.html
git commit -m "refactor(co0rdinates): split solveCirculantRBF into computeBaseSpectrum + applySpectralModifiers

Defaults (twist=0, scale=1) reproduzieren bit-exakt das aktuelle Verhalten.
Vorbereitung für spektrale DOF-Slider."
```

---

## Task 2: Spektrum im Form-State cachen

**Files:**
- Modify: `co0rdinates.html` — `generateShapeControlPoints` (Zeile 1104), `applyShape` (Zeile 1145)

Ziel: `generateShapeControlPoints` gibt zusätzlich das Basis-Spektrum zurück. `applyShape` packt es in den State damit Slider live darauf operieren können.

- [ ] **Step 2.1: `generateShapeControlPoints` umbauen**

Aktuelle Funktion (Zeile 1104-1143) ersetzen durch:

```js
        function generateShapeControlPoints(shapeId, spectralParams = { twist: 0, scale: 1, kernelWidth: 1.0 }) {
            const shapeDef = shapeDefinitions[shapeId];
            if (!shapeDef) return { points: [], spectrum: null, autoRadius: null };

            const vertices = shapeDef.vertices();
            if (vertices.length < 3) return { points: [], spectrum: null, autoRadius: null };

            const numPoints = 256;
            const spacing = 2 * Math.PI / numPoints;
            const autoRadius = spacing * spectralParams.kernelWidth;

            const naiveDx = new Array(numPoints);
            const naiveDy = new Array(numPoints);
            const circlePositions = new Array(numPoints);

            for (let i = 0; i < numPoints; i++) {
                const angle = (i / numPoints) * 2 * Math.PI;
                const cx = Math.cos(angle);
                const cy = Math.sin(angle);
                circlePositions[i] = { x: cx, y: cy };

                const r = shapeRadiusAtAngle(vertices, angle);
                naiveDx[i] = (r - 1) * cx;
                naiveDy[i] = (r - 1) * cy;
            }

            const spectrum = computeBaseSpectrum(numPoints, naiveDx, naiveDy, autoRadius);
            const solved = applySpectralModifiers(spectrum, spectralParams.twist, spectralParams.scale);

            const points = circlePositions.map((pos, i) => ({
                id: `shape-${i}`,
                x: pos.x,
                y: pos.y,
                dx: solved.dx[i],
                dy: solved.dy[i],
                radius: autoRadius
            }));

            return { points, spectrum, autoRadius };
        }
```

- [ ] **Step 2.2: Default `spectralParams` in config**

In der `config`-Definition (ca. Zeile 105-130, suchen nach `let config =` oder `const config =`) hinzufügen:

```js
        // Zusätzlich in config:
        // (suchen nach influenceRadius-Zeile, danach einfügen)
        spectralParams: {
            kernelWidth: 1.0,
            twist: 0,
            scale: 1.0
        },
```

Falls config ein `let`-Object ist: einfach Property hinzufügen. Falls es im Konstruktor erzeugt wird: dort.

- [ ] **Step 2.3: `applyShape` aktualisieren**

Aktuelle Funktion (Zeile 1145-1183) ersetzen durch:

```js
        function applyShape(shapeId) {
            if (!shapeId) {
                activeShape = null;
                const textToRestore = savedText;
                syncShapeTextUI();
                if (textToRestore && textToRestore.trim()) {
                    applySymbol(textToRestore);
                } else {
                    startReset();
                }
                return;
            }

            activeShape = shapeId;
            syncShapeTextUI();

            const sp = config.spectralParams;
            const result = generateShapeControlPoints(shapeId, sp);
            if (result.points.length === 0) return;

            const newState = {
                controlPoints: result.points,
                config: {
                    influenceRadius: config.influenceRadius,
                    applyToAll: false,
                    showControlPoints: config.showControlPoints,
                    gridDensity: config.gridDensity,
                    showAxes: config.showAxes,
                    showGrid: config.showGrid,
                    spectralParams: { ...sp }
                },
                activeShape: activeShape,
                savedText: savedText,
                _shapeSpectrum: result.spectrum
            };

            // Aktiven Spektrum-Cache am Top-Level halten für Slider-Live-Modifier
            activeShapeSpectrum = result.spectrum;

            if (window.undoRedoPanel) {
                window.undoRedoPanel.saveState(newState);
            }
            startStateTransition(newState);
        }
```

- [ ] **Step 2.4: Modul-Level Cache-Variable**

In der Nähe von `let activeShape = null;` (Zeile 139) hinzufügen:

```js
        let activeShape = null;
        let activeShapeSpectrum = null;  // FFT-Spektrum des aktiven Forms, für Slider-Modifier
```

- [ ] **Step 2.5: Visual-Verify**

Browser-Reload. Quadrat klicken. Erwartung: gleiche Darstellung wie vor Task 2. Spektrum-Cache greift, aber Default-Params bewirken keine Änderung.

- [ ] **Step 2.6: Commit**

```bash
git add co0rdinates.html
git commit -m "feat(co0rdinates): cache shape spectrum in state for spectral DOF sliders"
```

---

## Task 3: UI — drei Slider + Reset hinzufügen

**Files:**
- Modify: `co0rdinates.html` — UI-Panel-Setup, nach Zeile 1882 (`window._shapeBtnEls = shapeBtnEls;`)

Ziel: Drei Slider unter den Shape-Buttons. Reset-Button. Visibility: nur sichtbar wenn `activeShape !== null`.

- [ ] **Step 3.1: Slider-Block nach shapeRow einfügen**

Direkt nach `window._shapeBtnEls = shapeBtnEls;` (Zeile 1882) folgenden Block einfügen:

```js
            // ============================================
            // SPEKTRALE DOF-SLIDER
            // ============================================
            const spectralRow = document.createElement('div');
            spectralRow.className = 'ctrl-row';
            spectralRow.dataset.key = 'spectralDof';
            spectralRow.style.cssText = 'flex-direction:column; align-items:stretch; gap:6px;';

            const spectralHeader = document.createElement('div');
            spectralHeader.style.cssText = 'display:flex; justify-content:space-between; align-items:center;';
            const spectralLabel = document.createElement('label');
            spectralLabel.className = 'ctrl-label';
            spectralLabel.textContent = 'Verzerrungs-DOF';
            const resetBtn = document.createElement('button');
            resetBtn.type = 'button';
            resetBtn.textContent = '↺';
            resetBtn.title = 'Zurücksetzen';
            resetBtn.style.cssText = 'width:28px; height:28px; min-width:40px; min-height:40px; padding:0; font-size:14px; border:1px solid var(--text-color, #fff); background:transparent; color:var(--text-color, #fff); border-radius:4px; cursor:pointer; opacity:0.7;';
            spectralHeader.appendChild(spectralLabel);
            spectralHeader.appendChild(resetBtn);
            spectralRow.appendChild(spectralHeader);

            window._spectralSliders = {};

            function makeSpectralSlider(key, displayLabel, min, max, step, decimals) {
                const wrap = document.createElement('div');
                wrap.style.cssText = 'display:flex; align-items:center; gap:6px;';
                const lbl = document.createElement('span');
                lbl.textContent = displayLabel;
                lbl.style.cssText = 'flex:0 0 90px; font-size:12px; opacity:0.85;';
                const range = document.createElement('input');
                range.type = 'range';
                range.min = String(min);
                range.max = String(max);
                range.step = String(step);
                range.value = String(config.spectralParams[key]);
                range.style.cssText = 'flex:1; min-height:40px;';
                const valTxt = document.createElement('span');
                valTxt.textContent = config.spectralParams[key].toFixed(decimals);
                valTxt.style.cssText = 'flex:0 0 48px; text-align:right; font-size:12px; font-variant-numeric:tabular-nums; opacity:0.85;';
                range.addEventListener('input', () => {
                    const v = parseFloat(range.value);
                    config.spectralParams[key] = v;
                    valTxt.textContent = v.toFixed(decimals);
                    onSpectralParamChange(key);
                });
                wrap.appendChild(lbl);
                wrap.appendChild(range);
                wrap.appendChild(valTxt);
                spectralRow.appendChild(wrap);
                window._spectralSliders[key] = { range, valTxt, decimals };
            }

            makeSpectralSlider('kernelWidth', 'Kernel-Breite ε', 0.1, 5.0, 0.05, 2);
            makeSpectralSlider('twist',       'Twist α',         -6.28, 6.28, 0.02, 2);
            makeSpectralSlider('scale',       'Stärke s',        -2.0, 2.0, 0.05, 2);

            resetBtn.addEventListener('click', () => {
                config.spectralParams.kernelWidth = 1.0;
                config.spectralParams.twist = 0;
                config.spectralParams.scale = 1.0;
                syncSpectralSliderUI();
                if (activeShape) {
                    onSpectralParamChange('kernelWidth');
                }
            });

            panel._currentContainer.appendChild(spectralRow);

            function syncSpectralSliderUI() {
                for (const [key, ui] of Object.entries(window._spectralSliders)) {
                    const v = config.spectralParams[key];
                    ui.range.value = String(v);
                    ui.valTxt.textContent = v.toFixed(ui.decimals);
                }
            }

            function updateSpectralRowVisibility() {
                spectralRow.style.display = activeShape ? 'flex' : 'none';
            }
            updateSpectralRowVisibility();
            window._updateSpectralRowVisibility = updateSpectralRowVisibility;
```

- [ ] **Step 3.2: Sichtbarkeit bei Shape-Toggle aktualisieren**

In `syncShapeTextUI` (Zeile 1186 ff) am Ende, vor der schließenden Klammer der Funktion, einfügen:

```js
            // Spektrale Slider mit Shape-Aktivität synchron
            if (typeof window._updateSpectralRowVisibility === 'function') {
                window._updateSpectralRowVisibility();
            }
```

- [ ] **Step 3.3: Stub-Handler hinzufügen (noch ohne Logik)**

Vor `applyShape` (Zeile 1145) folgenden Stub einfügen — Logik kommt in Task 4:

```js
        // Wird aufgerufen wenn ein spektraler Parameter geändert wurde.
        // key: 'kernelWidth' | 'twist' | 'scale'
        // kernelWidth verlangt Re-Solve, twist/scale nur Re-Modifier (Spektrum-Cache).
        function onSpectralParamChange(key) {
            // Stub — implementiert in Task 4
            console.log('spectralParam changed:', key, config.spectralParams[key]);
        }
```

- [ ] **Step 3.4: Visual-Verify UI rendert**

Browser-Reload. Form klicken (z.B. Quadrat). Erwartung: 3 Slider erscheinen unter den Shape-Buttons mit Werten ε=1.00, α=0.00, s=1.00. Slider lassen sich bewegen, Werte in Anzeige updaten, aber Bild ändert sich noch nicht (Handler noch Stub). Console zeigt Log-Ausgaben. Form abwählen → Slider verschwinden.

- [ ] **Step 3.5: Mobile-Visual-Verify**

Browser-DevTools: Viewport auf 375×812 stellen, Reload, Form aktivieren. Slider müssen tap-bar sein (≥40px Höhe), Labels lesbar, kein Overflow.

- [ ] **Step 3.6: Commit**

```bash
git add co0rdinates.html
git commit -m "feat(co0rdinates): UI for spectral DOF sliders (ε, α, s) + reset

Stub-Handler. Slider werden in Task 4 verdrahtet."
```

---

## Task 4: Slider verdrahten — ε re-solves, α/s nutzen Spektrum-Cache

**Files:**
- Modify: `co0rdinates.html` — `onSpectralParamChange`-Funktion (in Task 3 als Stub angelegt)

Ziel: Slider-Bewegung führt zu sichtbarer Verzerrungs-Änderung. ε löst neu (Spektrum neu rechnen). α/s nutzen gecachtes Spektrum.

- [ ] **Step 4.1: `onSpectralParamChange` implementieren**

Stub aus Task 3.3 ersetzen durch:

```js
        function onSpectralParamChange(key) {
            if (!activeShape) return;
            finishStateTransition();

            const sp = config.spectralParams;

            if (key === 'kernelWidth') {
                // Re-Solve: neue Kernel-Breite ändert die zirkulante Matrix
                const result = generateShapeControlPoints(activeShape, sp);
                if (result.points.length === 0) return;
                activeShapeSpectrum = result.spectrum;
                controlPoints = result.points.map(p => normalizeControlPoint(p));
            } else {
                // Twist oder Scale: gecachtes Spektrum verwenden, nur Modifier + IFFT
                if (!activeShapeSpectrum) {
                    const result = generateShapeControlPoints(activeShape, sp);
                    if (result.points.length === 0) return;
                    activeShapeSpectrum = result.spectrum;
                    controlPoints = result.points.map(p => normalizeControlPoint(p));
                } else {
                    const solved = applySpectralModifiers(activeShapeSpectrum, sp.twist, sp.scale);
                    const numPoints = solved.dx.length;
                    for (let i = 0; i < numPoints && i < controlPoints.length; i++) {
                        const angle = (i / numPoints) * 2 * Math.PI;
                        controlPoints[i].x = Math.cos(angle);
                        controlPoints[i].y = Math.sin(angle);
                        controlPoints[i].dx = solved.dx[i];
                        controlPoints[i].dy = solved.dy[i];
                    }
                }
            }

            // Cache-Invalidation und neu zeichnen
            if (typeof invalidateCurrentStateCache === 'function') {
                invalidateCurrentStateCache();
            }
            // _prepared-Flag der Punkte zurücksetzen damit prepareStateForRendering neu greift
            for (const cp of controlPoints) {
                cp._invR2 = undefined;
                cp._cutoff2 = undefined;
                cp._rIsZero = undefined;
            }
            const state = getCurrentState();
            if (state) state._prepared = false;

            draw();
        }
```

- [ ] **Step 4.2: Visual-Verify ε (Kernel-Breite)**

Browser-Reload. Quadrat aktivieren. ε-Slider langsam von 1.0 nach 0.3 ziehen. Erwartung: Form-Konturen werden schärfer, Verzerrung lokaler. ε auf 3.0: Form rundet sich, Verzerrung verteilt sich weiter im Raum.

- [ ] **Step 4.3: Visual-Verify α (Twist)**

ε zurück auf 1.0 (Reset-Button). α-Slider auf +0.5: Quadrat-Form wird sichtbar gedreht/verspiralisiert (Pinwheel-Effekt). α auf -0.5: Gegenrotation. α auf 1.5: stark verdreht, fast Hakenkreuz-artig.

- [ ] **Step 4.4: Visual-Verify s (Stärke)**

α zurück auf 0. s-Slider auf 0: keine Verzerrung — Gitter bleibt unverzerrt, kein Quadrat sichtbar. s auf -1: Form invertiert (Anti-Form, Kissen-artig). s auf 2: Form schießt nach außen über.

- [ ] **Step 4.5: Orthogonalität testen**

ε=1.5, α=0.3, s=1.2 gleichzeitig setzen. Erwartung: alle drei Effekte überlagert sich, kein gegenseitiges Drift. Reset-Button → exakt Default-Bild.

- [ ] **Step 4.6: Performance-Check**

Slider schnell hin- und her bewegen. Erwartung: flüssiges Update ohne Lag (Re-Solve ist O(N log N) für N=256 = ~2k Ops, sollte <1ms sein).

- [ ] **Step 4.7: Commit**

```bash
git add co0rdinates.html
git commit -m "feat(co0rdinates): wire spectral DOF sliders to live displacement update

ε triggert Re-Solve, α/s nutzen gecachtes Spektrum (nur Re-IFFT)."
```

---

## Task 5: Playwright-Verification + Mobile-Check

**Files:**
- Create: `/tmp/co0rd-spectral-verify.js` (temporäres Playwright-Script, nicht im Repo)

Ziel: Visuelle Regression + Extreme-Werte automatisiert gegenchecken. Screenshots der erwarteten Test-States sammeln.

- [ ] **Step 5.1: Playwright-Verify-Script erstellen**

Datei `/tmp/co0rd-spectral-verify.js`:

```js
const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto('https://dev.0nefinity.love/co0rdinates.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    const screenshot = async (name) => {
        await page.screenshot({ path: `/tmp/co0rd-${name}.png`, fullPage: false });
        console.log('saved', name);
    };

    // Default-State (Baseline)
    await screenshot('00-default');

    // Quadrat aktivieren
    await page.click('button[data-shape-id="square"]');
    await page.waitForTimeout(400);
    await screenshot('01-square-defaults');

    // Setzt einen Slider via DOM-Event
    const setSlider = async (key, value) => {
        await page.evaluate(({ key, value }) => {
            const ui = window._spectralSliders[key];
            ui.range.value = String(value);
            ui.range.dispatchEvent(new Event('input', { bubbles: true }));
        }, { key, value });
        await page.waitForTimeout(200);
    };

    await setSlider('kernelWidth', 0.3);
    await screenshot('02-eps-low');
    await setSlider('kernelWidth', 3.0);
    await screenshot('03-eps-high');
    await setSlider('kernelWidth', 1.0);

    await setSlider('twist', 0.6);
    await screenshot('04-twist-positive');
    await setSlider('twist', -0.6);
    await screenshot('05-twist-negative');
    await setSlider('twist', 0);

    await setSlider('scale', 0);
    await screenshot('06-scale-zero');
    await setSlider('scale', -1);
    await screenshot('07-scale-inverse');
    await setSlider('scale', 2);
    await screenshot('08-scale-overshoot');

    // Reset
    await page.click('button[title="Zurücksetzen"]');
    await page.waitForTimeout(400);
    await screenshot('09-after-reset');

    // Mobile-Viewport
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(300);
    await screenshot('10-mobile-square');

    await browser.close();
})();
```

- [ ] **Step 5.2: Playwright-Verify ausführen**

```bash
cd /tmp && npm i playwright 2>&1 | tail -1 && node co0rd-spectral-verify.js
```

Erwartung: alle 11 Screenshots gespeichert ohne Errors.

- [ ] **Step 5.3: Screenshots durchsehen**

Für jeden Screenshot prüfen:
- `00-default`: leere Seite mit Gitter
- `01-square-defaults`: Quadrat-Verzerrung wie immer
- `02-eps-low`: schärfere Form, evtl. sichtbares Ringing
- `03-eps-high`: weicher gerundetes Polygon, Verzerrung verteilt
- `04-twist-positive`: gedrehtes Pinwheel
- `05-twist-negative`: andere Drehrichtung
- `06-scale-zero`: Gitter unverzerrt, keine Form-Wirkung
- `07-scale-inverse`: inverse Form (Kissen)
- `08-scale-overshoot`: Form überschießt
- `09-after-reset`: identisch zu `01-square-defaults`
- `10-mobile-square`: Mobile-Layout funktioniert, Slider bedienbar

Falls Screenshot fehlerhaft: Defekt diagnostizieren, fix, neu testen.

- [ ] **Step 5.4: Reset-Bit-Exakt-Check**

Diff `01-square-defaults` mit `09-after-reset`:

```bash
cmp /tmp/co0rd-01-square-defaults.png /tmp/co0rd-09-after-reset.png && echo "BIT-IDENTICAL" || echo "DIFFER — investigate"
```

Erwartung: BIT-IDENTICAL.

- [ ] **Step 5.5: Screenshot-Bericht an Tim**

Wichtigste Screenshots an Tim senden (default, twist, scale-zero, mobile).

---

## Task 6: Text-Modus — Linie/Umriss-Toggle

**Files:**
- Modify: `co0rdinates.html`
  - Neue Funktion `extractCharSkeleton` neben `extractCharContour` (Zeile 619)
  - `extractCharContour`-Aufruf in `layoutTextContours` (Zeile 918) verzweigt je nach Modus
  - UI-Toggle in Panel-Setup (nach Spektral-Slider-Block)
  - `config.textRenderMode` ('outline' | 'line')

Ziel: Optional Zeichen als Skelett-Linien statt als Außenkontur. Aktuelle Default-Optik bleibt 'outline'. Zhang-Suen-Thinning auf der Raster-Bitmap erzeugt 1-Pixel-Skelett; DFS extrahiert zusammenhängende Pfad-Segmente, die per `connectContours` in den bestehenden Path-Pipeline-Pfad fließen.

- [ ] **Step 6.1: `config.textRenderMode` einführen**

In `config`-Definition hinzufügen:

```js
        textRenderMode: 'outline',  // 'outline' | 'line'
```

- [ ] **Step 6.2: `extractCharSkeleton`-Funktion**

Nach `extractCharContour` (ende ca. Zeile 684) einfügen:

```js
        // Zhang-Suen-Thinning: reduziert gefüllte Pixel auf 1-Pixel-Skelett.
        // Mutiert das übergebene boolesche Array. Klassischer 2-Pass-Algorithmus.
        function zhangSuenThin(filled, w, h) {
            const idx = (x, y) => y * w + x;
            const get = (x, y) => x >= 0 && x < w && y >= 0 && y < h && filled[idx(x, y)];

            let changed = true;
            while (changed) {
                changed = false;
                for (let pass = 0; pass < 2; pass++) {
                    const toRemove = [];
                    for (let y = 1; y < h - 1; y++) {
                        for (let x = 1; x < w - 1; x++) {
                            if (!filled[idx(x, y)]) continue;
                            const p = [
                                get(x,   y-1), get(x+1, y-1), get(x+1, y),
                                get(x+1, y+1), get(x,   y+1), get(x-1, y+1),
                                get(x-1, y),   get(x-1, y-1)
                            ];
                            const B = p.reduce((s, v) => s + (v ? 1 : 0), 0);
                            if (B < 2 || B > 6) continue;
                            let A = 0;
                            for (let i = 0; i < 8; i++) {
                                if (!p[i] && p[(i + 1) % 8]) A++;
                            }
                            if (A !== 1) continue;
                            // Pass 0: P2*P4*P6 = 0, P4*P6*P8 = 0 (Indizes 0,2,4 und 2,4,6)
                            // Pass 1: P2*P4*P8 = 0, P2*P6*P8 = 0 (Indizes 0,2,6 und 0,4,6)
                            const c1 = pass === 0 ? (p[0] && p[2] && p[4]) : (p[0] && p[2] && p[6]);
                            const c2 = pass === 0 ? (p[2] && p[4] && p[6]) : (p[0] && p[4] && p[6]);
                            if (c1 || c2) continue;
                            toRemove.push(idx(x, y));
                        }
                    }
                    if (toRemove.length > 0) {
                        for (const i of toRemove) filled[i] = false;
                        changed = true;
                    }
                }
            }
        }

        // Extrahiert das Skelett eines Zeichens als ein oder mehrere offene Pfade.
        // Jeder Pfad ist eine Sequenz von 8-Neighbor-verbundenen Skelett-Pixeln.
        function extractCharSkeleton(char, fontFamily, fontSize) {
            const padding = 20;
            const size = fontSize + padding * 2;
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = size;
            tempCanvas.height = size;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.clearRect(0, 0, size, size);
            tempCtx.font = `${fontSize}px ${fontFamily}`;
            tempCtx.fillStyle = 'white';
            tempCtx.textBaseline = 'middle';
            tempCtx.textAlign = 'center';
            tempCtx.fillText(char, size / 2, size / 2);

            const data = tempCtx.getImageData(0, 0, size, size).data;
            const filled = new Array(size * size);
            for (let i = 0; i < size * size; i++) {
                filled[i] = data[i * 4 + 3] > 128;
            }

            zhangSuenThin(filled, size, size);

            // Pfade extrahieren: starte an Endpunkten (Skelett-Pixel mit nur 1 Nachbar),
            // sonst beliebiger ungesichteter Skelett-Pixel.
            const idx = (x, y) => y * size + x;
            const neighbors = [
                [-1, -1], [0, -1], [1, -1],
                [-1,  0],          [1,  0],
                [-1,  1], [0,  1], [1,  1]
            ];
            const countNeighbors = (x, y) => {
                let c = 0;
                for (const [dx, dy] of neighbors) {
                    if (filled[idx(x + dx, y + dy)]) c++;
                }
                return c;
            };
            const visited = new Array(size * size).fill(false);

            const tryStartFromCondition = (cond) => {
                for (let y = 0; y < size; y++) {
                    for (let x = 0; x < size; x++) {
                        if (!filled[idx(x, y)] || visited[idx(x, y)]) continue;
                        if (!cond(x, y)) continue;
                        return { x, y };
                    }
                }
                return null;
            };

            const paths = [];
            while (true) {
                // Bevorzugt Endpunkte, sonst beliebige unbesuchte Pixel
                let start = tryStartFromCondition((x, y) => countNeighbors(x, y) === 1)
                         || tryStartFromCondition(() => true);
                if (!start) break;

                const path = [];
                let cx = start.x, cy = start.y;
                while (true) {
                    visited[idx(cx, cy)] = true;
                    path.push({ x: cx - size / 2, y: -(cy - size / 2) });
                    let nextX = -1, nextY = -1;
                    for (const [dx, dy] of neighbors) {
                        const nx = cx + dx, ny = cy + dy;
                        if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
                        if (!filled[idx(nx, ny)] || visited[idx(nx, ny)]) continue;
                        nextX = nx; nextY = ny;
                        break;
                    }
                    if (nextX === -1) break;
                    cx = nextX; cy = nextY;
                }

                if (path.length >= 2) paths.push(path);
            }

            paths.sort((a, b) => b.length - a.length);
            return paths;
        }
```

- [ ] **Step 6.3: `layoutTextContours` verzweigen**

In `layoutTextContours` (Zeile 918) den `extractCharContour`-Aufruf ersetzen durch:

```js
                        const extractor = config.textRenderMode === 'line'
                            ? extractCharSkeleton
                            : extractCharContour;
                        const contours = extractor(ch, fontFamily, fontSize);
```

- [ ] **Step 6.4: UI-Toggle hinzufügen**

Nach dem Spektral-Slider-Block (Ende von Task 3.1) einfügen:

```js
            // Text-Render-Mode-Toggle (Linie vs. Umriss)
            const renderModeRow = document.createElement('div');
            renderModeRow.className = 'ctrl-row';
            renderModeRow.dataset.key = 'textRenderMode';
            const renderModeLabel = document.createElement('label');
            renderModeLabel.className = 'ctrl-label';
            renderModeLabel.textContent = 'Text-Stil';
            const renderModeGroup = document.createElement('div');
            renderModeGroup.style.cssText = 'display:flex; gap:4px;';

            const modeButtons = [
                { id: 'outline', label: 'Umriss' },
                { id: 'line',    label: 'Linie'  }
            ];
            const modeBtnEls = {};
            for (const m of modeButtons) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.textContent = m.label;
                btn.dataset.modeId = m.id;
                btn.style.cssText = 'min-width:60px; min-height:40px; padding:0 10px; font-size:13px; border:1px solid var(--text-color, #fff); background:transparent; color:var(--text-color, #fff); border-radius:4px; cursor:pointer; opacity:0.5; transition:opacity 0.15s, background 0.15s;';
                btn.addEventListener('click', () => {
                    if (config.textRenderMode === m.id) return;
                    config.textRenderMode = m.id;
                    syncTextRenderModeUI();
                    // Falls Text gerade aktiv ist → neu rendern
                    const currentText = panel.get('symbol');
                    if (currentText && currentText.trim() && !activeShape) {
                        applySymbol(currentText);
                    }
                });
                modeBtnEls[m.id] = btn;
                renderModeGroup.appendChild(btn);
            }
            renderModeRow.appendChild(renderModeLabel);
            renderModeRow.appendChild(renderModeGroup);
            panel._currentContainer.appendChild(renderModeRow);

            function syncTextRenderModeUI() {
                for (const [id, btn] of Object.entries(modeBtnEls)) {
                    const active = config.textRenderMode === id;
                    btn.style.opacity = active ? '1' : '0.5';
                    btn.style.background = active ? 'var(--text-color, #fff)' : 'transparent';
                    btn.style.color = active ? 'var(--bg-color, #000)' : 'var(--text-color, #fff)';
                }
            }
            syncTextRenderModeUI();
```

- [ ] **Step 6.5: Visual-Verify**

Browser-Reload. Text eingeben (z.B. "A"). Default: Umriss-Modus, Buchstabe als gefüllter Umriss. Klick auf "Linie": Buchstabe wird zur Skelett-Linie (mittlere Achse von A: Spitze nach oben, Schenkel nach unten, Querstrich).

Test mit längerem Text "HALLO" und mit Sonderzeichen.

- [ ] **Step 6.6: Playwright-Verify Text-Modi**

Im Script aus Task 5 zusätzlich:

```js
    // Text-Modus
    await page.evaluate(() => {
        window.undoRedoPanel.set('symbol', 'A');
    });
    await page.waitForTimeout(500);
    await screenshot('11-text-outline-default');

    await page.click('button[data-mode-id="line"]');
    await page.waitForTimeout(500);
    await screenshot('12-text-line-mode');
```

Erwartung: `11` zeigt A als Umriss-Verzerrung, `12` als Linien-Skelett-Verzerrung.

- [ ] **Step 6.7: Commit**

```bash
git add co0rdinates.html
git commit -m "feat(co0rdinates): text render mode toggle — outline vs. line skeleton

Zhang-Suen-Thinning erzeugt 1-Pixel-Skelett aus gerasterten Zeichen.
DFS extrahiert verbundene Pfad-Segmente. Default bleibt outline."
```

---

## Self-Review

Spec-Coverage Check:
- ✅ Kernel-Breite ε: Task 1 (computeBaseSpectrum nutzt radius), Task 3 (Slider), Task 4 (Re-Solve-Handler)
- ✅ Twist α: Task 1 (applySpectralModifiers Hermitian-symmetrisch), Task 3 (Slider), Task 4 (Re-IFFT-Handler)
- ✅ Stärke s: Task 1 (applySpectralModifiers scale), Task 3 (Slider), Task 4 (Handler)
- ✅ Defaults bit-exakt: Task 1 Step 1.2 visual, Task 5 Step 5.4 cmp
- ✅ Sliders nur bei activeShape: Task 3.1 updateSpectralRowVisibility + Task 3.2 in syncShapeTextUI
- ✅ Reset-Button: Task 3.1
- ✅ Mobile: Task 3.5, Task 5 Step 5.1 mobile-viewport
- ✅ Playwright-Verify: Task 5
- ✅ Text-Linien-Modus (Spec-Erweiterung): Task 6 (Zhang-Suen-Thinning + DFS-Pfad-Tracing + UI-Toggle)
- ⚠️ URL-State-Sync: in Spec aufgeführt, aber als Out-of-Scope für v1 hier dokumentiert. Bei Bedarf separat in v2-Plan.

Out-of-Scope für v1 (bewusst nicht implementiert):
- URL-Query-Param-Sync (`?eps=1.5&twist=0.785&scale=1.0`) — kann in v2 ergänzt werden
- Undo/Redo-Integration der Slider-Werte (aktuell werden Slider nicht im Undo-Stack erfasst)
- Slider-Werte in Form-Switch persistieren (beim Wechsel Form → Form werden Slider auf Default zurückgesetzt)

Typkonsistenz:
- `spectrum`-Objekt: `{ dxRe, dxIm, dyRe, dyIm }` Float64Array — konsistent in Task 1, 2, 4
- `spectralParams`: `{ kernelWidth, twist, scale }` Number — konsistent in Task 2, 3, 4
- `generateShapeControlPoints` Rückgabewert: `{ points, spectrum, autoRadius }` — geändert in Task 2, alle Aufrufer angepasst in Task 2.3 (applyShape) und Task 4.1 (onSpectralParamChange)
