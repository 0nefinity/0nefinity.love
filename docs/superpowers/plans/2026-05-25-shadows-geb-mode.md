# GEB-Mode (shadows.html) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a toggleable GEB mode to `shadows.html` that shows two vertically-stacked spheres lit by five lamps — one shared ∞ floor light through both, plus two wall lamps per sphere casting swapped `0`/`1` shadows.

**Architecture:** Mode A (toggle in the existing single file). The single-sphere/3-lamp mode stays the untouched default. A new `dualMode` flag (distinct from the pre-existing, unrelated `gebEnabled` glyph-cutout flag) builds a second sphere coupled to the first (same radius, automatic Y-offset, derived swapped glyphs) and two extra spotlights. Per-sphere shadow separation via narrow cones aimed at each sphere center; THREE.js layers as fallback.

**Tech Stack:** Plain ES module + three.js 0.168.0 (raymarching ShaderMaterial + customDepthMaterial for shadows). No build, no npm, no unit-test runner. **Verification is visual via Playwright** against `https://dev.0nefinity.love/shadows` (live-reload, no-cache; test user + script template per memory `reference_winkelgpt_playwright_visual_check` / `reference_0nefinity_dev_workflow`). Files served directly from the worktree — every save is live.

**Pre-flight (per repo CLAUDE.md / GitNexus rule):** Before editing any symbol, run `gitnexus_impact({target, direction:"upstream"})` and report blast radius. Run `gitnexus_detect_changes()` before each commit.

---

## File Structure

Single file touched: `shadows.html`. No new files (Mode A). Changes are localized to:

- **Globals/state** (~588–617): add `spheres` array, `dualMode` flag, extend lamp/spot holders + `lampStates`.
- **Glyph textures** (`updateGlyphTextures` ~1047): make per-sphere.
- **Sphere build** (`buildSphereWithShader` ~1980): build 1 or 2 spheres.
- **Lamps** (`addSpot`/`init` ~2779–3018, `updateGeometryFromParams` lamp block ~860–895): 3 or 5 spots.
- **URL state** (parse ~730–751, write ~783–793): `geb` key + extended lights mask.
- **UI** (controls HTML ~508–537, lamp-toggle wiring, `updateLampVisuals` ~1499): GEB toggle + 5 lamp rows.

Each task below is independently testable and committed separately.

---

## Task 1: Add `dualMode` flag + URL key (no behavior yet)

**Files:** Modify `shadows.html` (globals ~604–617; `PARAMS_CONFIG`/URL parse+write).

- [ ] **Step 1: Add the flag**

Near `let invertMode = false;` (line ~605) add:

```js
let dualMode = false;   // GEB-Mode (Hofstadter): 2 spheres + 5 lamps. NOT gebEnabled (that is the glyph-cutout flag).
```

- [ ] **Step 2: Parse `geb` from URL**

In the URL-parse block (~730–751, where `invertMode` is read from URL), add:

```js
if (urlParams.get('geb') === '1') dualMode = true;
```

(Use the same `urlParams` accessor already in that block — read the surrounding lines first to match the exact pattern.)

- [ ] **Step 3: Write `geb` to URL**

In the URL-write block (~783–793, where `invertMode` writes `inv`), add:

```js
if (dualMode) params_url.set('geb', '1'); else params_url.delete('geb');
```

(Match the exact URLSearchParams variable name used there — read first.)

- [ ] **Step 4: Verify (Playwright)**

Load `https://dev.0nefinity.love/shadows?geb=1`, then in console check `dualMode === true`. Load without param → `false`. No visual change yet (flag unused).

```
Expected: dualMode reflects ?geb=1; page renders exactly as before (single sphere).
```

- [ ] **Step 5: Commit**

```bash
git add shadows.html
git commit -m "feat(shadows): add dualMode flag + geb URL key (no behavior yet)"
```

---

## Task 2: Generalize state from single `sphereMesh` to `spheres[]`

**Files:** Modify `shadows.html` (globals ~589; `buildSphereWithShader` ~1980; `updateShaderUniforms` ~2046; every `sphereMesh.` reference).

**Goal:** Replace the single `sphereMesh` with an array `spheres` holding one entry in normal mode. Pure refactor — behavior identical.

- [ ] **Step 1: Find all references**

Run: `grep -n "sphereMesh" shadows.html` — enumerate every use (build, dispose, uniforms update, raycasting/hit-test, outline, scale). Read each site.

- [ ] **Step 2: Introduce the array**

At global scope (~589) keep `let sphereMesh;` for now AND add:

```js
let spheres = [];   // {mesh, depthMat, glyphTextures, glyphChars} per sphere; [0] is the primary
```

- [ ] **Step 3: Refactor `buildSphereWithShader` to push into `spheres`**

Wrap current body in a per-sphere builder. Keep building exactly one sphere; assign `sphereMesh = spheres[0].mesh` at the end so existing call-sites still work. Read current body (1980–2044) and transform: move geometry+material+depthMaterial creation into `function buildOneSphere(glyphChars, yOffset)` returning the entry; in `buildSphereWithShader` clear `spheres`, dispose old, then `spheres = [buildOneSphere(glyphChars, 0)]; sphereMesh = spheres[0].mesh;`.

- [ ] **Step 4: Verify regression (Playwright)**

Load `https://dev.0nefinity.love/shadows`. Confirm identical to before: one sphere, three shadows `0` (side) / `1` (back) / `∞` (floor). Screenshot + compare to a baseline screenshot taken before Task 2.

```
Expected: pixel-equivalent to pre-refactor single mode. spheres.length === 1.
```

- [ ] **Step 5: Commit**

```bash
git add shadows.html
git commit -m "refactor(shadows): hold sphere(s) in spheres[] array (single mode unchanged)"
```

---

## Task 3: Per-sphere glyph textures

**Files:** Modify `shadows.html` (`updateGlyphTextures` ~1047; the builder from Task 2).

**Goal:** `updateGlyphTextures` currently mutates the global `glyphTextures` and only sphere[0]'s uniforms. Make it operate per sphere entry using that entry's `glyphChars`.

- [ ] **Step 1: Add a per-entry texture updater**

Add:

```js
function updateGlyphTexturesFor(entry) {
  const rot0   = (params.glyphRot0   || 0) * Math.PI / 180;
  const rotInf = (params.glyphRotInf || 0) * Math.PI / 180;
  const rot1   = (params.glyphRot1   || 0) * Math.PI / 180;
  const t = entry.glyphTextures;
  if (t.x) { t.x.dispose(); t.x.image = null; }
  if (t.y) { t.y.dispose(); t.y.image = null; }
  if (t.z) { t.z.dispose(); t.z.image = null; }
  const isPrimary = (spheres[0] && entry === spheres[0]);
  const showL = isPrimary && activeGlyphTarget === 'left'  && cursorVisible;
  const showF = isPrimary && activeGlyphTarget === 'floor' && cursorVisible;
  const showR = isPrimary && activeGlyphTarget === 'right' && cursorVisible;
  t.x = createGlyphTexture(entry.glyphChars.left,  rot0,   showL);
  t.y = createGlyphTexture(entry.glyphChars.floor, rotInf, showF);
  t.z = createGlyphTexture(entry.glyphChars.right, rot1,   showR);
  if (entry.mesh && entry.mesh.material && entry.mesh.material.uniforms) {
    entry.mesh.material.uniforms.uGlyphTexX.value = t.x;
    entry.mesh.material.uniforms.uGlyphTexY.value = t.y;
    entry.mesh.material.uniforms.uGlyphTexZ.value = t.z;
  }
}
```

- [ ] **Step 2: Make `updateGlyphTextures` loop over spheres**

Replace the body of `updateGlyphTextures()` (1047–1073) with:

```js
function updateGlyphTextures() {
  spheres.forEach(updateGlyphTexturesFor);
  if (spheres[0]) glyphTextures = spheres[0].glyphTextures; // keep legacy global in sync
}
```

Ensure each entry is created with `glyphTextures: { x:null, y:null, z:null }` and a `glyphChars` (primary uses the global `glyphChars`).

- [ ] **Step 3: Verify regression (Playwright)**

Load single mode. Confirm `0/1/∞` still render; typing in the `0`/`1`/`∞` inputs still updates the sphere; cursor blink still works on the focused glyph.

```
Expected: single-mode glyph behavior unchanged.
```

- [ ] **Step 4: Commit**

```bash
git add shadows.html
git commit -m "refactor(shadows): per-sphere glyph textures"
```

---

## Task 4: Build the coupled second sphere when `dualMode` on

**Files:** Modify `shadows.html` (`buildSphereWithShader`; `updateGeometryFromParams` ~841 for scale/position).

**Goal:** When `dualMode`, build a second sphere: same radius, stacked along +Y by a fixed gap, glyphs = primary with `left`/`right` swapped, `floor` (∞) identical.

- [ ] **Step 1: Define the coupling + gap constant**

Add near other consts:

```js
const DUAL_GAP = 2.5; // center-to-center Y distance in sphere radii
function derivedGlyphs(base) { return { left: base.right, right: base.left, floor: base.floor }; }
```

- [ ] **Step 2: Build 1 or 2 spheres**

In `buildSphereWithShader`, after building sphere[0] at yOffset 0:

```js
if (dualMode) {
  const r = params.sphereRadius || 1;
  spheres.push(buildOneSphere(derivedGlyphs(glyphChars), -DUAL_GAP * r)); // primary above (+) , second below (-)
}
spheres.forEach(updateGlyphTexturesFor);
sphereMesh = spheres[0].mesh;
```

`buildOneSphere(glyphCharsArg, yOffset)` must set `mesh.position.y = yOffset` and `mesh.scale.setScalar(r)`.

- [ ] **Step 3: Apply Y-offset + radius on param change**

In `updateGeometryFromParams` where `sphereMesh.scale` is set (~841–843), loop instead:

```js
const r = Math.max(0.001, params.sphereRadius);
spheres.forEach((s, i) => {
  s.mesh.scale.setScalar(r);
  s.mesh.position.y = (i === 0 ? 0 : -DUAL_GAP * r);
});
```

Also update the per-sphere `uModelMatrixInverse` for each mesh (mirror the existing single-sphere inverse-matrix update in `updateShaderUniforms`, looping over `spheres`).

- [ ] **Step 4: Verify (Playwright)**

Load `?geb=1`. Expect two spheres stacked vertically. (Shadows may be wrong/missing until Task 5 — that's fine here.) `spheres.length === 2`; sphere[1].glyphChars has left/right swapped.

```
Expected: two stacked spheres visible; glyph swap present on sphere 2.
```

- [ ] **Step 5: Commit**

```bash
git add shadows.html
git commit -m "feat(shadows): build coupled second sphere in dualMode"
```

---

## Task 5: Five lamps in dualMode (shared ∞ + 2 wall lamps per sphere)

**Files:** Modify `shadows.html` (globals ~593–595; `init` lamp setup ~2839–3018; `updateGeometryFromParams` lamp block ~860–895; intensity update ~809–811).

**Goal:** Normal mode keeps 3 spots. dualMode uses 5: `spotFloor` (shared ∞, wide enough to cover both), and per-sphere `spotBackA/SideA` aimed at sphere[0], `spotBackB/SideB` aimed at sphere[1].

- [ ] **Step 1: Add holders**

Extend globals (~593):

```js
let spotBackB, spotSideB;        // second sphere's wall spots (dualMode only)
let lampBackB, lampSideB, lightConeBackB, lightConeSideB;
```

- [ ] **Step 2: Create the two extra spots in dualMode**

In `init()` after the existing three `addSpot(...)` calls, add (read the existing three calls first to copy positions/targets exactly):

```js
if (dualMode) {
  const d = params.lightDistance || 15;
  const yB = -DUAL_GAP * (params.sphereRadius || 1);
  // sphere[0] (top): retarget existing spotBack/spotSide to y=0 (already there)
  // sphere[1] (bottom): own back/side spots aimed at yB
  spotBackB = addSpot(spotIntensity(), 0, yB,  d, 0, yB, -params.wallDistance);
  spotSideB = addSpot(spotIntensity(), d, yB,  0, -params.wallDistance, yB, 0);
}
```

Define `spotIntensity()` to return the same intensity expression used for the existing spots (read ~806–811 to extract it; reuse, don't duplicate magic numbers).

- [ ] **Step 3: Aim the shared ∞ floor spot at both / widen cone**

The floor spot stays single. Ensure its target is the midpoint between spheres and its `angle` covers both. In `updateGeometryFromParams` floor-target block (~866–873), when dualMode set target.y to the stack midpoint `(0 + yB)/2` and bump effective cone if needed. Keep narrow `spotBack/Side` cones (15°) aimed at each sphere center so `0`/`1` shadows stay separated by height.

- [ ] **Step 4: Tear down extra spots when leaving dualMode**

In the dispose path of `buildSphereWithShader` (or a `rebuildScene`), remove `spotBackB/spotSideB` + their lamp meshes from the scene and null them when `!dualMode`, so toggling back to single mode restores exactly 3 lamps.

- [ ] **Step 5: Verify (Playwright)**

Load `?geb=1`. Expect on the floor a **single** `∞`; on back wall `1` (from sphere0, upper) and `0` (from sphere1, lower) at different heights; on side wall `0` (upper) and `1` (lower). Capture screenshot; verify via DOM that 5 SpotLights exist (`scene.children.filter(c=>c.isSpotLight).length === 5`).

```
Expected: exactly one ∞ on floor; swapped 0/1 on each wall, separated by height; 5 spotlights.
```

- [ ] **Step 6: Commit**

```bash
git add shadows.html
git commit -m "feat(shadows): five-lamp setup for dualMode (shared infinity + per-sphere walls)"
```

---

## Task 6: Shadow separation hardening

**Files:** Modify `shadows.html` (spot ranges/angles; optional THREE.js layers).

**Goal:** Guarantee sphere[1] does not cast a stray shadow into sphere[0]'s wall lamps and vice-versa.

- [ ] **Step 1: Tighten per-sphere spot range**

Set each wall spot's `distance`/`shadow.camera.far` so its frustum reaches its target sphere + wall but the narrow `angle` excludes the other sphere (vertical separation `DUAL_GAP` makes the other sphere fall outside a 15° cone at typical `lightDistance`). Verify by inspection.

- [ ] **Step 2: If stray shadows persist — layers fallback**

Assign `spheres[0].mesh.layers.set(1)`, `spheres[1].mesh.layers.set(2)`; set each wall spot to only its sphere's layer (`spot.layers.set(n)`); ∞ spot enabled on both layers. Confirm three.js applies layer filtering to the relevant shadow maps in this version; if not, fall back to geometric separation only and document the limitation in the spec.

- [ ] **Step 3: Verify (Playwright)**

Zoom each wall; confirm each wall shows exactly two clean glyphs (no doubled/ghost shadow from the wrong sphere). Screenshot both walls + floor.

```
Expected: each wall = two clean, separated glyphs; floor = one ∞. No ghosting.
```

- [ ] **Step 4: Commit**

```bash
git add shadows.html
git commit -m "fix(shadows): isolate per-sphere wall shadows in dualMode"
```

---

## Task 7: UI — GEB toggle + 5 lamp toggles + camera default

**Files:** Modify `shadows.html` (controls HTML ~508–537; lamp-toggle wiring; `updateLampVisuals` ~1499; camera init).

- [ ] **Step 1: Add the GEB toggle row**

After the "Show Lamps" row (~510–513) add:

```html
<div class="row toggle-row">
  <label for="gebMode">GEB-Mode</label>
  <input id="gebMode" type="checkbox">
</div>
```

- [ ] **Step 2: Wire the toggle**

Add a `change` listener on `#gebMode`: set `dualMode = e.target.checked`, then rebuild scene (spheres + lamps), update URL, sync the `#gebMode.checked` from `dualMode` on load. Read the existing `#showLamps` listener to match the established wiring pattern.

- [ ] **Step 3: Extend lamp visibility/toggle for 5 lamps**

Read `updateLampVisuals` (~1499–1520) and the lamp on/off interaction (search `lampStates.` assignments + tap handlers via `getAxisForObject`). Extend `lampStates` to carry the two extra wall lamps in dualMode and make `updateLampVisuals` show/hide `lampBackB/lampSideB` + cones accordingly. Use the existing `.geb-row` CSS class for any added rows.

- [ ] **Step 4: Camera default for stacked framing**

On entering dualMode, if camera is at default, recenter the orbit target to the stack midpoint and nudge `cameraDistance` so both spheres frame nicely (read the camera/OrbitControls init; adjust `controls.target.y` to midpoint). Don't override a user-customized camera (only when params are at defaults).

- [ ] **Step 5: Verify (Playwright)**

Toggle GEB on/off in the UI: scene rebuilds 2↔1 spheres and 5↔3 lamps; checkbox state matches; both spheres framed in view. Toggle each lamp; the right shadow appears/disappears.

```
Expected: UI toggle drives mode; lamp toggles work for all 5; camera frames the stack.
```

- [ ] **Step 6: Commit**

```bash
git add shadows.html
git commit -m "feat(shadows): GEB-mode UI toggle, 5 lamp controls, stacked camera default"
```

---

## Task 8: URL state round-trip (mode + extended lights mask) + back-button

**Files:** Modify `shadows.html` (URL parse ~730–751, write ~783–793).

**Goal:** `geb=1` + a lights bitmask that encodes 5 lamps in dualMode, 3 in single mode. Back-button navigable (per memory `feedback_back_button_principle`).

- [ ] **Step 1: Define mask order**

Document at the write site: single mode `lights=<floor><back><side>` (unchanged); dualMode `lights=<inf><s0back><s0side><s1back><s1side>`. Parse length to disambiguate (3 vs 5 chars).

- [ ] **Step 2: Implement parse/write**

Read existing lights parse (~749–751) and write (~791–793); branch on `dualMode` to emit/consume 3 or 5 bits into `lampStates`.

- [ ] **Step 3: Verify (Playwright)**

Set a non-default lamp combo in dualMode, copy URL, reload → identical state. Press browser Back after toggling GEB → returns to prior mode without skipping a structural step.

```
Expected: full state restored from URL; back-button steps are coherent.
```

- [ ] **Step 4: Commit**

```bash
git add shadows.html
git commit -m "feat(shadows): URL round-trip for dualMode + extended lights mask"
```

---

## Task 9: Full verification pass (golden path + mobile + dark + perf)

**Files:** none (verification only); fixes commit into the relevant task's area.

- [ ] **Step 1: Golden path (Playwright, desktop)**

Single mode unchanged (regression screenshot). `?geb=1`: two stacked spheres, one ∞ on floor, swapped clean `0`/`1` on the two walls. Screenshot all three surfaces.

- [ ] **Step 2: Mobile checklist (per `feedback_mobile_check_before_merge`)**

Emulate mobile viewport: GEB toggle + lamp toggles tap-targets ≥40px; control panel no overflow; no hover-only affordance; safe-area respected.

- [ ] **Step 3: Dark mode**

Confirm colors come from `meta.css` variables; toggle theme; spheres/shadows/lamps render correctly in both.

- [ ] **Step 4: Performance ("Gurke")**

5 shadow maps + 2 raymarching spheres: measure FPS. If low, reduce default `shadowMapSize` in dualMode and re-measure. Record numbers.

- [ ] **Step 5: Evidence before done**

Per `feedback_no_fixed_claim_without_verify`: attach screenshots + the spotlight-count DOM check + FPS number. Only then mark complete.

- [ ] **Step 6: Final commit (if fixes were needed)**

```bash
git add shadows.html
git commit -m "fix(shadows): GEB-mode verification pass adjustments"
```

---

## Self-Review (filled)

**Spec coverage:** 2 spheres (T2,T4) · 5 lamps shared-∞ (T5) · swapped 0/1 (T3,T4) · coupled sphere 2 (T4) · toggle Mode A + single default (T1,T7) · shadow isolation (T6) · URL state (T1,T8) · UI (T7) · verification incl. mobile/dark/perf (T9). All spec sections mapped.

**Placeholder scan:** open spec points (gap value, mask order, isolation method, flag name) are all resolved here — `DUAL_GAP=2.5`, mask order documented in T8, isolation T6, flag `dualMode` in T1.

**Type/name consistency:** `spheres[]` entries `{mesh, depthMat, glyphTextures, glyphChars}`; `buildOneSphere(glyphChars, yOffset)`; `derivedGlyphs(base)`; `updateGlyphTexturesFor(entry)`; `spotBackB/spotSideB`; `DUAL_GAP` — used consistently across T2–T8.
