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

  function whiteCol(alpha) {
    return 'rgba(255,255,255,' + clamp(alpha, 0, 1).toFixed(3) + ')';
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

      // world-fixed spacing derived from density (stable while panning)
      var spacing = 1000 / clamp(p.density, 2, 80);
      var prims = [];
      var i, k, pts;

      if (p.mode === 'polar') {
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
        var rays = Math.max(4, Math.min(90, Math.round(clamp(p.density, 2, 80))));
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
  function curvePoint(u, morph, size, mode) {
    var cosT = Math.cos(u);
    var sinT = Math.sin(u);
    var def = morph * size; // defTop == defBottom (original 'both' drag)
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
      {
        key: 'bend', ctrl: 'select', label: 'Rundung',
        options: [
          { value: 'geometric', label: 'Geometrisch' },
          { value: 'cos', label: 'Cos' },
          { value: 'arc', label: 'Kreisbogen' },
          { value: 'sin2', label: 'Sin²' },
          { value: 'trueArc', label: 'TrueArc' }
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

    // static unless the pulse animation is on
    timeInvariant: function (block) { return !block.params.pulse; },

    emit: function (block, t) {
      var p = block.params;
      var size = clamp(p.size, 1, 5000);
      if (p.pulse) size *= 1 + 0.022 * Math.sin(t * 1.1);

      var morph = clamp(p.morph, 0, 100) / 100;
      var bendMode = p.bend;
      if (bendMode !== 'geometric' && bendMode !== 'cos' &&
          bendMode !== 'arc' && bendMode !== 'sin2') bendMode = 'trueArc';
      var freq = Math.round(clamp(p.freq, 0, 40)); // integer keeps the loop closed
      var amp = clamp(p.amp, 0, 100);
      var rot = clamp(p.rot, -180, 180) * DEG;
      var cosR = Math.cos(rot), sinR = Math.sin(rot);
      var px = clamp(p.x, -2000, 2000);
      var py = clamp(p.y, -2000, 2000);

      var N = 540; // plan: 360-720 points
      var pts = [];
      for (var i = 0; i < N; i++) {
        var u = (i / N) * Math.PI * 2;
        var pt = curvePoint(u, morph, size, bendMode);
        var x = pt[0], y = pt[1];

        if (freq > 0 && amp > 0) {
          // wave = radial sine offset, pushed along the point's own direction
          var d = Math.hypot(x, y);
          if (d > 1e-6) {
            var off = amp * Math.sin(u * freq);
            x += (x / d) * off;
            y += (y / d) * off;
          }
        }

        pts.push(
          px + x * cosR - y * sinR,
          py + x * sinR + y * cosR
        );
      }

      var prims = [];
      if (p.fill) {
        prims.push({
          k: 'poly', pts: pts, closed: true, w: 0,
          col: 'rgba(255,255,255,0.10)', fill: true
        });
      }
      prims.push({
        k: 'poly', pts: pts, closed: true,
        w: clamp(p.width, 0.5, 12),
        col: 'rgba(255,255,255,0.92)',
        glow: clamp(p.glow, 0, 40)
      });
      return prims;
    },

    hit: function (block, wx, wy, view) {
      var p = block.params;
      var dx = wx - p.x;
      var dy = wy - p.y;
      // deformed circle reaches (1+morph)*size below center; add wave
      // amplitude + a zoom-aware slack
      var m = clamp(p.morph, 0, 100) / 100;
      var r = clamp(p.size, 1, 5000) * (1 + m) + clamp(p.amp, 0, 100) + 12 / view.scale;
      return (dx * dx + dy * dy <= r * r) ? 'move' : null;
    },

    drag: function (block, handle, dwx, dwy) {
      if (handle !== 'move') return;
      block.params.x = clamp(block.params.x + dwx, -2000, 2000);
      block.params.y = clamp(block.params.y + dwy, -2000, 2000);
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
      if (a <= 0 || !ch) return [];
      return [{
        k: 'glyph',
        ch: ch.slice(0, 8),
        x: clamp(p.x, -2000, 2000),
        y: clamp(p.y, -2000, 2000),
        size: clamp(p.size, 1, 2000),
        rot: clamp(p.rot, -180, 180) * DEG,
        col: whiteCol(a),
        glow: clamp(p.glow, 0, 40)
      }];
    },

    hit: function (block, wx, wy, view) {
      var p = block.params;
      var dx = wx - p.x;
      var dy = wy - p.y;
      // plan: radius ~ size/2; keep a minimum grab area on high zoom-out
      var r = Math.max(clamp(p.size, 1, 2000) * 0.5, 24 / view.scale);
      return (dx * dx + dy * dy <= r * r) ? 'move' : null;
    },

    drag: function (block, handle, dwx, dwy) {
      if (handle !== 'move') return;
      block.params.x = clamp(block.params.x + dwx, -2000, 2000);
      block.params.y = clamp(block.params.y + dwy, -2000, 2000);
    }
  });
})();
