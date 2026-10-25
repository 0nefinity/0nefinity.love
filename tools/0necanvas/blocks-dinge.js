/* 0necanvas blocks: Dinge — gitter, kurve, symbol
 *
 * Registers three "ding" block types via OneCanvas.registerBlock.
 * See docs/superpowers/plans/2026-07-06-0necanvas-v1-plan.md section 3.
 *
 * Conventions (engine semantics):
 * - World units, origin = canvas center, y down.
 * - Primitive.rot is RADIANS; schema rotation sliders are DEGREES and
 *   converted on emit.
 * - poly.w is a world unit (scales with zoom). The grid deliberately uses
 *   w = 1/view.scale to stay a hairline on screen at any zoom.
 * - Lines are finely tessellated so non-affine forces can BEND them.
 */
(function () {
  'use strict';

  var DEG = Math.PI / 180;
  var LINE_SEGS = 24;      // segments per line across the screen (plan: ~24)
  var MAX_LINES = 140;     // per-direction safety cap when zoomed far out
  var VIEW_PAD = 0.15;     // extend grid beyond the view so warps don't expose ends

  function clamp(v, lo, hi) {
    v = Number(v);
    if (!isFinite(v)) return lo;
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function num(v, fallback) {
    v = Number(v);
    return isFinite(v) ? v : fallback;
  }

  function whiteCol(alpha) {
    return 'rgba(255,255,255,' + clamp(alpha, 0, 1).toFixed(3) + ')';
  }

  // dezentes Selektions-Overlay: gestrichelter Akzent-Kreis + Zentrum-Punkt
  // (Stil wie pfad/verzerren)
  function selCircleOverlay(cx, cy, r, view) {
    var s = Math.max(1e-6, view.scale);
    r = Math.max(Math.abs(r), 18 / s);
    var pts = [];
    for (var i = 0; i <= 64; i++) {
      var a = (i / 64) * Math.PI * 2;
      pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    return [
      { k: 'poly', pts: pts, closed: true, w: 1 / s, dash: [6 / s, 6 / s], col: 'rgba(168,184,232,0.5)' },
      { k: 'dot', x: cx, y: cy, r: 3 / s, col: 'rgba(168,184,232,0.8)' }
    ];
  }

  // straight line tessellated into n segments (n+1 points)
  function tessLine(x0, y0, x1, y1, n) {
    var pts = [];
    for (var i = 0; i <= n; i++) {
      var f = i / n;
      pts.push(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f);
    }
    return pts;
  }

  // circle around world origin, n points, meant for closed polys
  function circlePts(r, n) {
    var pts = [];
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2;
      pts.push(Math.cos(a) * r, Math.sin(a) * r);
    }
    return pts;
  }

  /* =====================================================================
     gitter — Koordinatengitter (kartesisch / polar)
     ===================================================================== */

  OneCanvas.registerBlock({
    type: 'gitter',
    kind: 'ding',
    label: 'Koordinatengitter',
    icon: '▦', // ▦
    schema: [
      { key: 'density', ctrl: 'slider', label: 'Dichte', min: 2, max: 80, step: 1, value: 20 },
      { key: 'brightness', ctrl: 'slider', label: 'Helligkeit', min: 0, max: 1, step: 0.01, value: 0.25, decimals: 2 },
      { key: 'axes', ctrl: 'toggle', label: 'Achsen zeigen', value: true },
      {
        key: 'mode', ctrl: 'select', label: 'Art',
        options: [
          { value: 'kartesisch', label: 'Kartesisch' },
          { value: 'polar', label: 'Polar' }
        ],
        value: 'kartesisch'
      }
    ],

    // emit depends only on params + view -> engine may layer-cache it
    timeInvariant: true,

    emit: function (block, t, dt, view) {
      var p = block.params;
      var a = clamp(p.brightness, 0, 1);
      if (a <= 0) return [];

      var col = whiteCol(a);
      var axCol = whiteCol(Math.min(1, a * 2.4));
      var hairW = 1 / view.scale; // ~1 CSS px regardless of zoom

      var padX = (view.right - view.left) * VIEW_PAD;
      var padY = (view.bottom - view.top) * VIEW_PAD;
      var left = view.left - padX;
      var right = view.right + padX;
      var top = view.top - padY;
      var bottom = view.bottom + padY;

      // Dichte frei (Betrag: eine Anzahl); 0 = kein Gitter, nur Achsen.
      // Perf schützt NICHT ein Param-Clamp, sondern das View-Budget
      // (MAX_LINES): zu dichte Gitter werden auf ein Vielfaches des
      // Abstands vergröbert statt abgeschnitten.
      var density = Math.abs(num(p.density, 0));
      // world-fixed spacing derived from density (stable while panning)
      var spacing = density > 0 ? 1000 / density : 0;
      var prims = [];
      var i, k, pts;

      if (!(spacing > 0)) {
        // kein Gitter — Achsen unten übernehmen
      } else if (p.mode === 'polar') {
        // radius range of the padded view rect as seen from the origin
        var nearX = clamp(0, left, right);
        var nearY = clamp(0, top, bottom);
        var minR = Math.hypot(nearX, nearY);
        var maxR = 0;
        var cornersX = [left, right];
        var cornersY = [top, bottom];
        for (i = 0; i < 2; i++) {
          for (k = 0; k < 2; k++) {
            maxR = Math.max(maxR, Math.hypot(cornersX[i], cornersY[k]));
          }
        }

        var ringSpacing = spacing;
        var ringCount = (maxR - minR) / ringSpacing;
        if (ringCount > MAX_LINES) ringSpacing *= Math.ceil(ringCount / MAX_LINES);

        var r0 = Math.max(1, Math.floor(minR / ringSpacing));
        var r1 = Math.ceil(maxR / ringSpacing);
        for (k = r0; k <= r1; k++) {
          prims.push({
            k: 'poly', pts: circlePts(k * ringSpacing, 96), closed: true,
            w: hairW, col: col
          });
        }

        // radial rays, count follows density; tessellated so warps bend them
        // (Cap = echtes Perf-Budget: jede Ray ist ein eigener Poly)
        var rays = Math.max(1, Math.min(2 * MAX_LINES, Math.round(density)));
        for (i = 0; i < rays; i++) {
          var ang = (i / rays) * Math.PI * 2;
          var cx = Math.cos(ang), cy = Math.sin(ang);
          prims.push({
            k: 'poly',
            pts: tessLine(cx * minR, cy * minR, cx * maxR, cy * maxR, LINE_SEGS),
            w: hairW, col: col
          });
        }
      } else {
        // cartesian: vertical + horizontal lines at multiples of spacing
        var span = Math.max(right - left, bottom - top);
        var lineCount = span / spacing;
        if (lineCount > MAX_LINES) spacing *= Math.ceil(lineCount / MAX_LINES);

        var kx0 = Math.floor(left / spacing);
        var kx1 = Math.ceil(right / spacing);
        for (k = kx0; k <= kx1; k++) {
          if (k === 0 && p.axes) continue; // axis drawn brighter below
          var gx = k * spacing;
          prims.push({
            k: 'poly', pts: tessLine(gx, top, gx, bottom, LINE_SEGS),
            w: hairW, col: col
          });
        }

        var ky0 = Math.floor(top / spacing);
        var ky1 = Math.ceil(bottom / spacing);
        for (k = ky0; k <= ky1; k++) {
          if (k === 0 && p.axes) continue;
          var gy = k * spacing;
          prims.push({
            k: 'poly', pts: tessLine(left, gy, right, gy, LINE_SEGS),
            w: hairW, col: col
          });
        }
      }

      if (p.axes) {
        prims.push({
          k: 'poly', pts: tessLine(0, top, 0, bottom, LINE_SEGS),
          w: hairW, col: axCol
        });
        prims.push({
          k: 'poly', pts: tessLine(left, 0, right, 0, LINE_SEGS),
          w: hairW, col: axCol
        });
      }

      return prims;
    },

    // Ursprungs-Andeutung: eine Gitterzelle als gestrichelter Akzent-Kreis
    overlay: function (block, t, view) {
      var density = Math.abs(num(block.params.density, 0));
      var r = density > 0 ? 1000 / density : 60 / Math.max(1e-6, view.scale);
      return selCircleOverlay(0, 0, r, view);
    }
  });

  /* =====================================================================
     kurve — parametrische Kurve (Kreis <-> Herz Morph, Welle, Puls)
     ===================================================================== */

  // ported 1:1 from circleheart.html drawShapePath: the heart is NOT a
  // heart formula but a deformed circle — top/bottom control points get
  // pushed down by `def` (px), distributed over the ring by a bend
  // function. theta in [0,2pi), y down (same as the original canvas).
  function curveBend(theta, cosT, sinT, mode) {
    if (mode === 'geometric') {
      var absCos = Math.abs(cosT);
      return Math.abs(sinT) - Math.sqrt(absCos * (1 - absCos));
    }
    if (mode === 'trueArc') {
      var thetaNorm = theta / (Math.PI / 2);        // 0..4
      var quadrant = Math.floor(thetaNorm);
      var s = thetaNorm - quadrant;                 // 0..1 within quadrant
      var t = (quadrant % 2 === 0) ? s : (1 - s);   // 0 -> 1 -> 0 -> 1 -> 0
      return 1 - Math.sqrt(1 - t * t);              // convex circular arc
    }
    var t2 = 1 - Math.abs(cosT);
    if (mode === 'arc') return 1 - Math.sqrt(1 - t2 * t2);
    if (mode === 'sin2') return t2 * t2;
    return t2; // 'cos'
  }

  // morph 100% == deformation of one radius (the original's snap point r):
  // the notch reaches the center, the tip reaches 2r below it — the
  // classic circleheart silhouette. Deformation scales linearly with morph.
  // Like the original (deformationTop/deformationBottom): the upper half
  // of the ring (sinT >= 0) uses morphTop, the lower half morphBottom;
  // the Morph slider is the 'both' macro, the two Verformung sliders are
  // additive offsets on top of it (old ?s= scenes stay identical at 0/0).
  function curvePoint(u, morphTop, morphBottom, size, mode) {
    var cosT = Math.cos(u);
    var sinT = Math.sin(u);
    var def = (sinT >= 0 ? morphTop : morphBottom) * size;
    return [
      size * cosT,
      -size * sinT + def * curveBend(u, cosT, sinT, mode)
    ];
  }

  OneCanvas.registerBlock({
    type: 'kurve',
    kind: 'ding',
    label: 'Kurve',
    icon: '◆', // ◆
    schema: [
      { key: 'size', ctrl: 'slider', label: 'Größe', min: 10, max: 600, step: 1, value: 160 },
      { key: 'morph', ctrl: 'slider', label: 'Morph Kreis ↔ Herz', min: 0, max: 100, step: 1, value: 72, unit: '%' },
      // Original deformationTop/Bottom: getrennte Verformung als Offsets
      // relativ zu Morph (0 = folgt Morph — Beide-gleich-Makro bleibt)
      { key: 'defOben', ctrl: 'slider', label: 'Verformung oben', min: -200, max: 200, step: 1, value: 0, unit: '%' },
      { key: 'defUnten', ctrl: 'slider', label: 'Verformung unten', min: -200, max: 200, step: 1, value: 0, unit: '%' },
      {
        key: 'bend', ctrl: 'select', label: 'Rundung',
        options: [
          { value: 'geometric', label: 'Geometrisch' },
          { value: 'cos', label: 'Cos' },
          { value: 'arc', label: 'Kreisbogen' },
          { value: 'sin2', label: 'Sin²' },
          { value: 'trueArc', label: 'Echter Bogen' }
        ],
        value: 'trueArc'
      },
      { key: 'freq', ctrl: 'slider', label: 'Wellen-Frequenz', min: 0, max: 40, step: 1, value: 0 },
      { key: 'amp', ctrl: 'slider', label: 'Wellen-Amplitude', min: 0, max: 100, step: 1, value: 0 },
      { key: 'width', ctrl: 'slider', label: 'Linienstärke', min: 0.5, max: 12, step: 0.1, value: 1.6, decimals: 1 },
      { key: 'glow', ctrl: 'slider', label: 'Glühen', min: 0, max: 40, step: 1, value: 14 },
      { key: 'fill', ctrl: 'toggle', label: 'Füllung', value: false },
      { key: 'pulse', ctrl: 'toggle', label: 'Pulsieren', value: true },
      { key: 'x', ctrl: 'slider', label: 'X', min: -2000, max: 2000, step: 1, value: 0 },
      { key: 'y', ctrl: 'slider', label: 'Y', min: -2000, max: 2000, step: 1, value: 0 },
      { key: 'rot', ctrl: 'slider', label: 'Rotation', min: -180, max: 180, step: 1, value: 0, unit: '°' }
    ],

    // emit output depends only on params (the pulse lives in anim());
    // the engine still skips layer caching while anim() returns a matrix
    timeInvariant: true,

    // Puls = reine per-Frame-Skalierung um (x,y) als innerste Matrix —
    // die emittierte Geometrie bleibt referenz-stabil, Sprite-Cache und
    // Achsen-Blits der Engine greifen trotz Pulsieren.
    anim: function (block, t) {
      var p = block.params;
      if (!p.pulse) return null;
      var q = 1 + 0.022 * Math.sin(t * 1.1);
      var px = num(p.x, 0);
      var py = num(p.y, 0);
      return [q, 0, 0, q, px * (1 - q), py * (1 - q)];
    },

    emit: function (block, t) {
      var p = block.params;
      var size = num(p.size, 0); // frei: negativ = gespiegelt

      var morph = num(p.morph, 0);
      // frei: negativ = invertiertes Herz; oben/unten = Original top/bottom
      var morphTop = (morph + num(p.defOben, 0)) / 100;
      var morphBottom = (morph + num(p.defUnten, 0)) / 100;
      var bendMode = p.bend;
      if (bendMode !== 'geometric' && bendMode !== 'cos' &&
          bendMode !== 'arc' && bendMode !== 'sin2') bendMode = 'trueArc';
      var freq = Math.round(num(p.freq, 0)); // integer keeps the loop closed
      var amp = num(p.amp, 0);
      var rot = num(p.rot, 0) * DEG;
      var px = num(p.x, 0);
      var py = num(p.y, 0);

      // Geometrie wird nur bei Param-Änderung neu gebaut — in ein FRISCHES
      // Array, denn die Engine erkennt Änderungen über Referenz-Identität
      // (Sprite-Cache-Signatur). Unverändert -> gleiche Referenz -> Cache.
      // (Puls-Kompromiss: die Wellen-Amplitude pulsiert mit — ±2.2% via
      // anim()-Matrix, unsichtbar.)
      var st = block.state || (block.state = {});
      var sig = size + '|' + morphTop + '|' + morphBottom + '|' + bendMode +
        '|' + freq + '|' + amp + '|' + rot + '|' + px + '|' + py;
      var N = 540; // plan: 360-720 points
      if (st.curveSig !== sig) {
        st.curveSig = sig;
        var base = st.curveBase = new Array(N * 2);
        var cosR = Math.cos(rot), sinR = Math.sin(rot);
        for (var i = 0; i < N; i++) {
          var u = (i / N) * Math.PI * 2;
          var pt = curvePoint(u, morphTop, morphBottom, size, bendMode);
          var x = pt[0], y = pt[1];

          if (freq !== 0 && amp !== 0) {
            // wave = radial sine offset, pushed along the point's own direction
            var d = Math.hypot(x, y);
            if (d > 1e-6) {
              var off = amp * Math.sin(u * freq);
              x += (x / d) * off;
              y += (y / d) * off;
            }
          }

          base[2 * i] = px + x * cosR - y * sinR;
          base[2 * i + 1] = py + x * sinR + y * cosR;
        }
      }

      var pts = st.curveBase;

      var prims = [];
      if (p.fill) {
        prims.push({
          k: 'poly', pts: pts, closed: true, w: 0,
          col: 'rgba(255,255,255,0.10)', fill: true
        });
      }
      prims.push({
        k: 'poly', pts: pts, closed: true,
        w: Math.max(0, num(p.width, 0)), // 0 = unsichtbar (Engine skippt w<=0)
        col: 'rgba(255,255,255,0.92)',
        glow: Math.max(0, num(p.glow, 0))
      });
      return prims;
    },

    hit: function (block, wx, wy, view) {
      var p = block.params;
      var dx = wx - num(p.x, 0);
      var dy = wy - num(p.y, 0);
      // deformed circle reaches (1+morph)*size below center; add wave
      // amplitude + a zoom-aware slack
      var mo = num(p.morph, 0);
      var m = Math.max(Math.abs(mo + num(p.defOben, 0)), Math.abs(mo + num(p.defUnten, 0))) / 100;
      var r = Math.abs(num(p.size, 0)) * (1 + m) + Math.abs(num(p.amp, 0)) + 12 / view.scale;
      return (dx * dx + dy * dy <= r * r) ? 'move' : null;
    },

    drag: function (block, handle, dwx, dwy) {
      if (handle !== 'move') return;
      block.params.x = num(block.params.x, 0) + dwx;
      block.params.y = num(block.params.y, 0) + dwy;
    },

    overlay: function (block, t, view) {
      var p = block.params;
      var mo = num(p.morph, 0);
      var m = Math.max(Math.abs(mo + num(p.defOben, 0)), Math.abs(mo + num(p.defUnten, 0))) / 100;
      var r = Math.abs(num(p.size, 0)) * (1 + m) + Math.abs(num(p.amp, 0));
      return selCircleOverlay(num(p.x, 0), num(p.y, 0), r, view);
    }
  });

  /* =====================================================================
     symbol — ein Zeichen / kurzer Text als Glyphe
     ===================================================================== */

  OneCanvas.registerBlock({
    type: 'symbol',
    kind: 'ding',
    label: 'Symbol',
    icon: '✧', // ✧
    schema: [
      { key: 'ch', ctrl: 'text', label: 'Zeichen', value: '∞', maxlen: 8 },
      { key: 'size', ctrl: 'slider', label: 'Größe', min: 8, max: 400, step: 1, value: 64 },
      { key: 'x', ctrl: 'slider', label: 'X', min: -2000, max: 2000, step: 1, value: 0 },
      { key: 'y', ctrl: 'slider', label: 'Y', min: -2000, max: 2000, step: 1, value: 0 },
      { key: 'rot', ctrl: 'slider', label: 'Rotation', min: -180, max: 180, step: 1, value: 0, unit: '°' },
      { key: 'glow', ctrl: 'slider', label: 'Glühen', min: 0, max: 40, step: 1, value: 8 },
      { key: 'alpha', ctrl: 'slider', label: 'Deckkraft', min: 0, max: 1, step: 0.01, value: 0.9, decimals: 2 }
    ],

    // emit depends only on params -> engine may layer-cache it
    timeInvariant: true,

    emit: function (block) {
      var p = block.params;
      var a = clamp(p.alpha, 0, 1);
      var ch = (p.ch == null) ? '' : String(p.ch);
      var size = num(p.size, 0);
      var rot = num(p.rot, 0) * DEG;
      // negative Größe = Punktspiegelung (Canvas kann keine negative
      // Fontgröße): Betrag + 180°-Drehung ist die ehrliche Entsprechung
      if (size < 0) { size = -size; rot += Math.PI; }
      if (a <= 0 || !ch || !(size > 0)) return []; // 0 = unsichtbar
      return [{
        k: 'glyph',
        ch: ch.slice(0, 8),
        x: num(p.x, 0),
        y: num(p.y, 0),
        size: size,
        rot: rot,
        col: whiteCol(a),
        glow: Math.max(0, num(p.glow, 0))
      }];
    },

    hit: function (block, wx, wy, view) {
      var p = block.params;
      var dx = wx - num(p.x, 0);
      var dy = wy - num(p.y, 0);
      // plan: radius ~ size/2; keep a minimum grab area on high zoom-out
      var r = Math.max(Math.abs(num(p.size, 0)) * 0.5, 24 / view.scale);
      return (dx * dx + dy * dy <= r * r) ? 'move' : null;
    },

    drag: function (block, handle, dwx, dwy) {
      if (handle !== 'move') return;
      block.params.x = num(block.params.x, 0) + dwx;
      block.params.y = num(block.params.y, 0) + dwy;
    },

    overlay: function (block, t, view) {
      var p = block.params;
      return selCircleOverlay(num(p.x, 0), num(p.y, 0),
        Math.abs(num(p.size, 0)) * 0.6, view);
    }
  });

  /* =====================================================================
     pfad — gezeichneter / editierbarer Kontrollpunkt-Pfad

     params.pts is a FLAT list [x0,y0,x1,y1,...] in block-local coords and
     serializes through params (state.js ?s=). Freehand strokes are
     decimated by the draw tool (ui.js) before they land here, so the
     list stays URL-friendly.
     Editing paradigm (from co0rdinates.html): every control point is its
     own drag handle; clicking a segment midpoint INSERTS a point there
     (hit() mutates pts for that one case); double-click deletes a point
     (ui.js calls def.doubleClick with the hit handle).
     hit() only exposes point/midpoint handles when the block is selected
     (view.selectedId, provided by ui.js makeView) — unselected paths are
     grabbed as a whole via their outline.
     ===================================================================== */

  var PFAD_SUB = 8;        // Catmull-Rom subdivisions per segment
  var PFAD_MAX_OUT = 2400; // cap on interpolated points per emit

  // default shape when added from the library: a gentle wave
  function pfadDefaultPts() {
    var pts = [];
    for (var i = 0; i <= 8; i++) {
      pts.push(-160 + i * 40, Math.round(Math.sin(i * 0.85) * 52));
    }
    return pts;
  }

  // Catmull-Rom through the control points; smooth in [0,1] blends between
  // the raw polyline (0) and the full spline (1)
  function pfadSmooth(src, closed, smooth) {
    var n = src.length >> 1;
    if (n < 3 || smooth <= 0) return src;
    var segs = closed ? n : n - 1;
    var sub = Math.max(2, Math.min(PFAD_SUB, Math.floor(PFAD_MAX_OUT / segs)));
    function ix(i) {
      if (closed) { i %= n; if (i < 0) i += n; }
      else i = i < 0 ? 0 : (i >= n ? n - 1 : i);
      return i * 2;
    }
    var out = [];
    for (var i = 0; i < segs; i++) {
      var a = ix(i - 1), b = ix(i), c = ix(i + 1), d = ix(i + 2);
      var x0 = src[a], y0 = src[a + 1], x1 = src[b], y1 = src[b + 1];
      var x2 = src[c], y2 = src[c + 1], x3 = src[d], y3 = src[d + 1];
      for (var k = 0; k < sub; k++) {
        var u = k / sub, u2 = u * u, u3 = u2 * u;
        var cx = 0.5 * (2 * x1 + (-x0 + x2) * u +
          (2 * x0 - 5 * x1 + 4 * x2 - x3) * u2 +
          (-x0 + 3 * x1 - 3 * x2 + x3) * u3);
        var cy = 0.5 * (2 * y1 + (-y0 + y2) * u +
          (2 * y0 - 5 * y1 + 4 * y2 - y3) * u2 +
          (-y0 + 3 * y1 - 3 * y2 + y3) * u3);
        var lx = x1 + (x2 - x1) * u;
        var ly = y1 + (y2 - y1) * u;
        out.push(lx + (cx - lx) * smooth, ly + (cy - ly) * smooth);
      }
    }
    if (!closed) out.push(src[2 * n - 2], src[2 * n - 1]);
    return out;
  }

  function distSeg2(px, py, ax, ay, bx, by) {
    var abx = bx - ax, aby = by - ay;
    var len2 = abx * abx + aby * aby;
    var t = len2 > 1e-12 ? ((px - ax) * abx + (py - ay) * aby) / len2 : 0;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    var dx = px - (ax + abx * t);
    var dy = py - (ay + aby * t);
    return dx * dx + dy * dy;
  }

  OneCanvas.registerBlock({
    type: 'pfad',
    kind: 'ding',
    label: 'Pfad',
    icon: '✎', // ✎
    schema: [
      // hidden: not rendered in the props panel, but serialized via params
      { key: 'pts', ctrl: 'hidden', value: pfadDefaultPts() },
      { key: 'glaettung', ctrl: 'slider', label: 'Glättung', min: 0, max: 1, step: 0.01, value: 1, decimals: 2 },
      { key: 'schliessen', ctrl: 'toggle', label: 'Schließen', value: false },
      { key: 'width', ctrl: 'slider', label: 'Linienstärke', min: 0.5, max: 12, step: 0.1, value: 2, decimals: 1 },
      { key: 'glow', ctrl: 'slider', label: 'Glühen', min: 0, max: 40, step: 1, value: 12 },
      { key: 'fill', ctrl: 'toggle', label: 'Füllung', value: false },
      { key: 'x', ctrl: 'slider', label: 'X', min: -2000, max: 2000, step: 1, value: 0 },
      { key: 'y', ctrl: 'slider', label: 'Y', min: -2000, max: 2000, step: 1, value: 0 },
      { key: 'rot', ctrl: 'slider', label: 'Rotation', min: -180, max: 180, step: 1, value: 0, unit: '°' }
    ],

    // schema defaults are shared references — give every block its own,
    // sanitized pts array (also runs after scene.load with URL data)
    init: function (block) {
      var raw = block.params.pts;
      var clean = [];
      if (raw && raw.length) {
        for (var i = 0; i + 1 < raw.length; i += 2) {
          var x = Number(raw[i]), y = Number(raw[i + 1]);
          if (isFinite(x) && isFinite(y)) clean.push(x, y);
        }
      }
      block.params.pts = clean;
    },

    // depends only on params -> layer-cache eligible
    timeInvariant: true,

    emit: function (block) {
      var p = block.params;
      var src = p.pts;
      if (!src || src.length < 4) return [];
      var smooth = clamp(p.glaettung, 0, 1);
      var closed = !!p.schliessen;
      var local = pfadSmooth(src, closed, smooth);
      var rot = (Number(p.rot) || 0) * DEG;
      var cosR = Math.cos(rot), sinR = Math.sin(rot);
      var px = Number(p.x) || 0;
      var py = Number(p.y) || 0;
      var pts = new Array(local.length);
      for (var i = 0; i < local.length; i += 2) {
        var x = local[i], y = local[i + 1];
        pts[i] = px + x * cosR - y * sinR;
        pts[i + 1] = py + x * sinR + y * cosR;
      }
      var prims = [];
      if (p.fill && src.length >= 6) {
        prims.push({
          k: 'poly', pts: pts, closed: true, w: 0,
          col: 'rgba(255,255,255,0.10)', fill: true
        });
      }
      prims.push({
        k: 'poly', pts: pts, closed: closed,
        w: Math.max(0, num(p.width, 0)), // 0 = unsichtbar
        col: 'rgba(255,255,255,0.92)',
        glow: Math.max(0, num(p.glow, 0))
      });
      return prims;
    },

    hit: function (block, wx, wy, view) {
      var p = block.params;
      var src = p.pts;
      if (!src || src.length < 4) return null;
      var s = Math.max(1e-6, view.scale);
      var rot = (Number(p.rot) || 0) * DEG;
      var cosR = Math.cos(rot), sinR = Math.sin(rot);
      var dx = wx - (Number(p.x) || 0);
      var dy = wy - (Number(p.y) || 0);
      // pointer in block-local coords (inverse rotate)
      var lx = dx * cosR + dy * sinR;
      var ly = -dx * sinR + dy * cosR;
      var n = src.length >> 1;
      var i, j;

      if (view.selectedId === block.id) {
        var rPt = 11 / s;
        for (i = 0; i < n; i++) {
          var pdx = lx - src[2 * i], pdy = ly - src[2 * i + 1];
          if (pdx * pdx + pdy * pdy <= rPt * rPt) return 'pt:' + i;
        }
        // click on a segment midpoint inserts a control point there
        var rMid = 9 / s;
        var segsM = p.schliessen ? n : n - 1;
        for (i = 0; i < segsM; i++) {
          j = (i + 1) % n;
          var mx = (src[2 * i] + src[2 * j]) / 2;
          var my = (src[2 * i + 1] + src[2 * j + 1]) / 2;
          var mdx = lx - mx, mdy = ly - my;
          if (mdx * mdx + mdy * mdy <= rMid * rMid) {
            src.splice(2 * i + 2, 0, Math.round(mx * 10) / 10, Math.round(my * 10) / 10);
            return 'pt:' + (i + 1);
          }
        }
      }

      // whole-path grab: distance to the control polygon
      var slack = Math.max(Math.abs(num(p.width, 0)), 14 / s);
      var segs = p.schliessen ? n : n - 1;
      for (i = 0; i < segs; i++) {
        j = (i + 1) % n;
        if (distSeg2(lx, ly, src[2 * i], src[2 * i + 1], src[2 * j], src[2 * j + 1]) <= slack * slack) {
          return 'move';
        }
      }
      return null;
    },

    drag: function (block, handle, dwx, dwy) {
      var p = block.params;
      if (handle === 'move') {
        p.x = (Number(p.x) || 0) + dwx;
        p.y = (Number(p.y) || 0) + dwy;
        return;
      }
      var m = /^pt:(\d+)$/.exec(handle);
      if (!m || !p.pts) return;
      var i = parseInt(m[1], 10) * 2;
      if (i + 1 >= p.pts.length) return;
      // world delta -> local delta (inverse rotate; translation cancels)
      var rot = (Number(p.rot) || 0) * DEG;
      var cosR = Math.cos(rot), sinR = Math.sin(rot);
      p.pts[i] += dwx * cosR + dwy * sinR;
      p.pts[i + 1] += -dwx * sinR + dwy * cosR;
    },

    // ui.js: double-click on a point handle deletes the point
    doubleClick: function (block, handle) {
      var m = /^pt:(\d+)$/.exec(handle || '');
      if (!m) return false;
      var p = block.params;
      if (!p.pts || p.pts.length <= 4) return false; // keep at least 2 points
      var i = parseInt(m[1], 10) * 2;
      if (i + 1 >= p.pts.length) return false;
      p.pts.splice(i, 2);
      return true;
    },

    overlay: function (block, t, view) {
      var p = block.params;
      var src = p.pts;
      if (!src || src.length < 4) return [];
      var s = Math.max(1e-6, view.scale);
      var rot = (Number(p.rot) || 0) * DEG;
      var cosR = Math.cos(rot), sinR = Math.sin(rot);
      var px = Number(p.x) || 0;
      var py = Number(p.y) || 0;
      var n = src.length >> 1;
      var world = new Array(src.length);
      var i;
      for (i = 0; i < src.length; i += 2) {
        var x = src[i], y = src[i + 1];
        world[i] = px + x * cosR - y * sinR;
        world[i + 1] = py + x * sinR + y * cosR;
      }
      var prims = [{
        k: 'poly', pts: world, closed: !!p.schliessen,
        w: 1 / s, col: 'rgba(168,184,232,0.35)', dash: [5 / s, 5 / s]
      }];
      // midpoint markers (insert affordance), dimmer than point handles
      var segs = p.schliessen ? n : n - 1;
      for (i = 0; i < segs; i++) {
        var j = (i + 1) % n;
        prims.push({
          k: 'dot',
          x: (world[2 * i] + world[2 * j]) / 2,
          y: (world[2 * i + 1] + world[2 * j + 1]) / 2,
          r: 2.6 / s, col: 'rgba(168,184,232,0.5)'
        });
      }
      for (i = 0; i < n; i++) {
        prims.push({
          k: 'dot', x: world[2 * i], y: world[2 * i + 1],
          r: 4.5 / s, col: '#a8b8e8', glow: 6
        });
      }
      return prims;
    }
  });
})();
