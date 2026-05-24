# fractal0ne — Design

**Datum:** 2026-05-24
**Datei:** `fractal0ne.html` (Root)
**Quelle / Inspiration:** [HackerPoet/PySpace](https://github.com/HackerPoet/PySpace) — GLSL ray-marcher mit space-folding distance estimators (Sierpinski, Menger, Mandelbox, Sphere, Box, Plane).

---

## Ziel

Web-Tool: beliebigen Text im Browser zu einem 3D-Fraktal falten lassen. Live editierbar (Text, Folds, Farben, Position). Steht standalone in `dev.0nefinity.love/fractal0ne.html`.

## Architektur

```
HTML  ─┬─ <canvas>            (Fullscreen, WebGL2)
       ├─ Panel (controls.js) (Settings rechts oben, draggable)
       └─ <script>  ─┬─ Main-Thread: WebGL Setup, Render-Loop, UI-Wiring
                     └─ Worker (sdf-worker.js inline als Blob)
                          └─ Jump-Flood SDF aus Canvas-Text
```

### Renderer
- **WebGL2 fullscreen-quad** (kein three.js — overkill für Single-Shader).
- Vertex-Shader trivial: NDC-Quad.
- Fragment-Shader: Raymarcher, DE = User-Fold-Pipeline → Text-SDF (extrudiert).

### Text → 2D-SDF (Worker)
1. Offscreen-Canvas, Größe konfigurierbar (default 512×512), Text mit gewähltem System-Font zentriert zeichnen (weiß auf schwarz).
2. Binary-Mask aus ImageData (alpha threshold).
3. Jump-Flooding-Algorithm:
   - Zwei JFA-Pässe (innere + äußere Front)
   - log2(N) Iterationen mit halbierendem step
   - Signed Distance = outside_dist − inside_dist (in Pixeln)
4. Normalisierung auf [-1, 1] basierend auf max-extent.
5. Übergabe Main-Thread via `transferable` `Float32Array`.
6. Upload als `RG16F`-Texture (R: distance, G: reserve).

Re-Run-Trigger: Text-Änderung, Font-Änderung, Auflösungs-Änderung. Cancel-Token verwirft veraltete Worker-Outputs.

### 3D-SDF Pipeline (im Shader)

```glsl
float DE(vec3 p) {
    // 1. User-Folds auf Welt-Punkt p (replizieren den Text)
    vec4 z = vec4(p, 1.0);
    for (int i = 0; i < ITERATIONS; i++) {
        // [PIPELINE_INJECT] — generierter GLSL aus Pipeline-Array
    }
    p = z.xyz / z.w;

    // 2. In Text-local transformieren
    p = p - uTextPos;
    p = uTextRotInv * p;
    p /= uTextScale;

    // 3. 2D-SDF sampeln + Z-extrude
    vec2 uv = p.xy * 0.5 + 0.5;
    float d2 = texture(uSdf, uv).r;
    float dz = abs(p.z) - uTextThickness;
    vec2 q = vec2(d2, dz);
    float d = min(max(q.x, q.y), 0.0) + length(max(q, 0.0));

    return d * uTextScale;
}
```

### Fold-Pipeline (modular)
Pipeline = JS-Array `[{type, params}, ...]`.

| Type | GLSL | Params |
|------|------|--------|
| `sierpinski` | sierpinski-fold | — |
| `menger` | menger-fold | — |
| `sphere` | sphere-fold | minR, maxR |
| `box` | box-fold | r (vec3) |
| `abs` | abs-fold | center (vec3) |
| `plane` | plane-fold | normal (vec3), d |
| `rotX`/`rotY`/`rotZ` | rotation | angle |
| `scale` | uniform scale | s |
| `translate` | translation | offset (vec3) |

Bei Pipeline-Änderung: GLSL-String aus Template + Array bauen, Shader neu kompilieren, alten freigeben. Compile-Cost ~10-30ms.

### Steuerung (6-DoF)
- **LMB-Drag** = Translate XY der Text-Position
- **RMB-Drag** / Shift+LMB = Rotate Yaw + Pitch
- **Mausrad** = Translate Z
- **Pinch-Touch** = Scale
- **2-Finger-Touch** = Rotate
- Panel hat zusätzlich 6 Slider (XYZ Position + Euler XYZ) + "Zentrieren"-Button

### Settings-Panel
controls.js-Pattern (existing). Draggable, oben rechts. Sektionen:
1. **Text:** Input-Field (live), Font-Dropdown
2. **Geometrie:** Extrusion-Dicke, Scale, Iterations
3. **Position/Rotation:** 6 Slider + Zentrieren
4. **Folds:** Pipeline-Editor (add/remove/reorder/edit)
5. **Farben:** Hintergrund, Vordergrund, Glow — via `meta.css`-Variablen wo möglich, sonst color-picker
6. **Performance:** Resolution-Scale (1.0 / 0.75 / 0.5 / 0.25), Max-Steps (32/64/128)
7. **Presets:** "klar", "kristallin", "chaotisch", "leer", "PySpace-Mandelbox"
8. **Share:** "URL kopieren" Button

### Persistenz
- Alle Settings in URL-Query: `?text=...&font=...&pipeline=<base64-json>&pos=x,y,z&rot=x,y,z&iter=8&...`
- `history.replaceState` bei jeder Änderung (debounced 300ms)
- Beim Load: URL parsen, sonst Defaults

## Performance-Strategie (Gurke-Kompatibel)
- Default Resolution = innerHeight ≤ 720 → 1.0, sonst 0.75
- Default Max-Marches = 64
- `MIN_DIST = 0.001`, `MAX_DIST = 20`
- Render nur wenn dirty (input fired oder auto-rotate aktiv)
- Worker für SDF-Gen, nie Main-Thread blockieren
- Bei mobile (`navigator.userAgent` + `pointer:coarse`): Resolution-Scale 0.5, MaxMarches 48

## Mobile (Pflicht-Check)
- Touch-Events parallel zu Maus
- Buttons ≥40px tap-target
- Panel: auf <768px → bottom-sheet, swipe-collapse
- `viewport-meta` mit `user-scalable=no` (verhindert Pinch-Zoom-Konflikt mit Tool-Pinch)
- Safe-Area-Insets respektieren

## Dark-Mode
- UI-Farben aus `meta.css`-Variablen
- Fraktal-Farben unabhängig (User-wählbar)
- Default-Foreground-Farbe respektiert `--text-color`

## Out-of-Bounds-Verhalten
"Text rumschieben, auch teilweise außerhalb" — natürlich gegeben durch:
- Ray-March läuft fullscreen
- Text-Position-Slider unbounded (CLAUDE.md-Regel: Ranges → ∞)
- Wenn Text aus Sicht raus: ray hits nothing in Richtung → background-color
- Folds replizieren den Text — kann sein dass Kopien sichtbar bleiben

## Fehler-Handling
- WebGL2 nicht verfügbar → Banner "WebGL2 nötig, [browser-update-link]" + WebGL1 fallback?  Nein — keep simple, nur Banner.
- Shader-Compile-Fehler (User-Pipeline kaputt) → Catch, letzte gute Pipeline behalten, Toast "Fold-Konfiguration ungültig"
- Worker-Fehler → Fallback: 1D-distance-transform im Main-Thread (slower aber works)

## Testplan (vor "fertig"-Claim)
1. **Local:** `curl https://dev.0nefinity.love/fractal0ne.html` → 200
2. **Visual:** Browser-Aufruf, Default-State zeigt Text "0NE" mit Default-Fold-Pipeline
3. **Interaktion:** Text ändern → re-render. Fold hinzufügen → re-compile + re-render. Drag → bewegt.
4. **Mobile-Sim:** Chrome DevTools → iPhone → 1-finger drag, 2-finger pinch funktionieren.
5. **URL-Round-trip:** Settings ändern, URL kopieren, neu öffnen → identischer State.
6. **Dark/Light:** Toggle prüfen (UI Lesbarkeit, Fraktal unverändert).
7. **Performance:** Auf Default-Settings stabile 60fps Desktop, ≥30fps Mobile.

## Out-of-Scope (NICHT bauen)
- Video-Export
- Audio-reactive Animations
- Mehr als 1 Text gleichzeitig
- Speichern von Presets in localStorage (URL-Share reicht)
- 3D-OBJ-Export

## Open Questions (entscheide ich im Trust-Mode)
- ~~Renderer:~~ plain WebGL2, kein three.js
- ~~SDF-Auflösung:~~ 512×512
- Default-Pipeline beim ersten Load: `[boxFold(r=1), sphereFold(0.5, 2.0), scale(2.0), rotY(0.3)]`, iter=8
- Default-Text: `"0NE"`
- Default-Font: System-Sans-Serif

---

**Folge-Plan:** Direkt Implementierung — keine separate writing-plans-Stufe (Trust-Mode + Goal "bau es jetzt"). Bei Komplikationen Stop und nachfragen.
