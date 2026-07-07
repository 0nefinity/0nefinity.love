/* 0necanvas blocks: Muster — tapete, textpunkte, linienschar, spirale
 *
 * Registers one 'kraft' and three 'ding' block types via
 * OneCanvas.registerBlock. Math ported from the standalone tools:
 * - tapete:      1kaleidosk0p.html (triangle lattice, 3 rotations x mirror)
 * - textpunkte:  Kuriositäten/musterpointfont.html (pixel-scan point font)
 * - linienschar: moire effect fractal math art generator.html (line family)
 * - spirale:     spirals copy.html (helix geometry only, no physics)
 *
 * Engine conventions honored (see engine.js header):
 * - World units, origin = canvas center, y down; rotations RADIANS
 *   internally, schema sliders in degrees.
 * - Instance entries may be {m:[a,b,c,d,e,f], alpha}.
 * - Lines are tessellated so non-affine forces can bend them.
 */
(function () {
  'use strict';

  if (!window.OneCanvas || typeof window.OneCanvas.registerBlock !== 'function') {
    console.error('blocks-muster.js: OneCanvas engine missing (script order?)');
    return;
  }

  var DEG = Math.PI / 180;
  var LINE_SEGS = 24; // tessellation per line (warp-bendable, like gitter)

  function num(v, fallback) {
    v = Number(v);
    return isFinite(v) ? v : fallback;
  }

  function clamp(v, lo, hi) {
    v = Number(v);
    if (!isFinite(v)) return lo;
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function whiteCol(alpha) {
    return 'rgba(255,255,255,' + clamp(alpha, 0, 1).toFixed(3) + ')';
  }

  // deterministic 0..1 hash (no state, stable across frames/sessions)
  function hash01(i) {
    var s = Math.sin((i + 1) * 127.1) * 43758.5453;
    return s - Math.floor(s);
  }

  /* ================================================================
   * tapete — Kaleidoskop-Tapete (Kraft)
   *
   * Plane-filling triangle symmetry instead of radial kaleidoscope.
   * Ported from 1kaleidosk0p.html: hex-offset triangle lattice, per
   * cell 3 rotations (0/120/240 deg) and optionally their mirrors
   * (scale(-1,1) before the rotation) — 6 transforms per cell.
   * ================================================================ */

  OneCanvas.registerBlock({
    type: 'tapete',
    kind: 'kraft',
    label: 'Kaleidoskop-Tapete',
    icon: '▲', // ▲
    schema: [
      { key: 'zellgroesse', ctrl: 'slider', label: 'Zellgröße', min: 40, max: 1200, step: 1, value: 260 },
      { key: 'zeilen', ctrl: 'slider', label: 'Zeilen', min: 0, max: 8, step: 1, value: 2 },
      { key: 'spalten', ctrl: 'slider', label: 'Spalten', min: 0, max: 8, step: 1, value: 2 },
      { key: 'spiegeln', ctrl: 'toggle', label: 'Spiegeln', value: true },
      { key: 'offset', ctrl: 'slider', label: 'Winkel-Offset', min: -180, max: 180, step: 1, value: 0, unit: '°' }
    ],

    // instance matrices depend only on params -> layer-cache compatible
    timeInvariant: true,

    force: function (block) {
      var p = block.params;
      var size = Math.max(1, num(p.zellgroesse, 260));
      var rows = Math.max(0, Math.round(num(p.zeilen, 0)));
      var cols = Math.max(0, Math.round(num(p.spalten, 0)));
      var mirror = !!p.spiegeln;
      var offset = num(p.offset, 0) * DEG;
      var rowH = size * Math.sqrt(3) / 2; // reference: height = size*sqrt(3)/2

      return {
        affine: true,
        instances: function () {
          if (!rows || !cols) return []; // 0 = keine Wiederholung (Identität)

          // cell centers, hex-offset lattice as in the reference:
          // x = c*size + (r odd ? size/2 : 0), y = r*rowH
          var cells = [];
          for (var r = -rows; r < rows; r++) {
            var odd = ((r % 2) + 2) % 2; // JS: -1 % 2 === -1
            for (var c = -cols; c < cols; c++) {
              var x = c * size + (odd ? size / 2 : 0);
              var y = r * rowH;
              cells.push([x, y, x * x + y * y]);
            }
          }
          // center-first: the engine truncates instance lists from the
          // front when the budget is hit, so the periphery is dropped
          cells.sort(function (a, b) { return a[2] - b[2]; });

          var list = [];
          for (var i = 0; i < cells.length; i++) {
            var cx = cells[i][0], cy = cells[i][1];
            for (var k = 0; k < 3; k++) {
              var a = offset + k * (Math.PI * 2 / 3);
              var ca = Math.cos(a), sa = Math.sin(a);
              // T(cx,cy) · R(a)
              list.push([ca, sa, -sa, ca, cx, cy]);
              // T(cx,cy) · scale(-1,1) · R(a)  (reference transform order)
              if (mirror) list.push([-ca, sa, sa, ca, cx, cy]);
            }
          }
          return list;
        }
      };
    }
  });

  /* ================================================================
   * textpunkte — Text als Punkte (Ding)
   *
   * Renders the text once onto an offscreen canvas, scans lit pixels
   * (musterpointfont.html technique), reduces them deterministically
   * to N points and emits dots (or small glyphs). The scan result is
   * cached in block.state and only rebuilt when text/density change;
   * font size, position and rotation are applied at emit time (the
   * cached points are em-normalized).
   * ================================================================ */

  var SCAN_FONT = 130;   // px, internal scan resolution (em reference)
  var SCAN_STEP = 2;     // sample every 2nd pixel
  var SCAN_MAX_W = 2800; // offscreen canvas width cap
  var SCAN_FAMILY = 'Georgia, "Times New Roman", serif'; // engine glyph family

  var scanCanvas = null;
  var scanCtx = null;

  // -> { pts: [emX,emY,...], halfWEm, halfHEm, spacingEm }
  function scanTextPoints(text, density) {
    if (!scanCanvas) {
      scanCanvas = document.createElement('canvas');
      scanCtx = scanCanvas.getContext('2d', { willReadFrequently: true });
    }
    var g = scanCtx;
    var font = '700 ' + SCAN_FONT + 'px ' + SCAN_FAMILY;
    g.font = font;
    var met = g.measureText(text);
    var pad = Math.ceil(SCAN_FONT * 0.25);
    var W = Math.min(SCAN_MAX_W, Math.ceil(met.width) + pad * 2);
    var H = Math.ceil(SCAN_FONT * 1.7);
    if (scanCanvas.width !== W) scanCanvas.width = W;
    if (scanCanvas.height !== H) scanCanvas.height = H;

    g.clearRect(0, 0, W, H);
    g.font = font; // canvas resize resets ctx state
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillStyle = '#fff';
    g.fillText(text, pad, H / 2);

    var data = g.getImageData(0, 0, W, H).data;
    var cx = pad + met.width / 2;
    var cy = H / 2;
    var lit = [];
    for (var y = 0; y < H; y += SCAN_STEP) {
      var row = y * W;
      for (var x = 0; x < W; x += SCAN_STEP) {
        if (data[(row + x) * 4 + 3] > 127) lit.push(x, y);
      }
    }

    var litCount = lit.length / 2;
    var n = Math.min(density, litCount);
    var pts = [];
    var halfW = 1e-6, halfH = 1e-6;
    var jit = (SCAN_STEP * 0.45) / SCAN_FONT;
    for (var i = 0; i < n; i++) {
      // deterministic stride sampling + tiny hash jitter so the point
      // cloud does not read as scanlines
      var idx = Math.floor(i * litCount / n);
      var ex = (lit[idx * 2] - cx) / SCAN_FONT + (hash01(i) - 0.5) * 2 * jit;
      var ey = (lit[idx * 2 + 1] - cy) / SCAN_FONT + (hash01(i + 7919) - 0.5) * 2 * jit;
      pts.push(ex, ey);
      if (Math.abs(ex) > halfW) halfW = Math.abs(ex);
      if (Math.abs(ey) > halfH) halfH = Math.abs(ey);
    }

    // average point spacing (em) from covered area — drives dot radius
    var areaPx = litCount * SCAN_STEP * SCAN_STEP;
    var spacingEm = n > 0 ? Math.sqrt(areaPx / n) / SCAN_FONT : 0;

    return { pts: pts, halfWEm: halfW, halfHEm: halfH, spacingEm: spacingEm };
  }

  function textpunkteCache(block) {
    var p = block.params;
    var text = (p.text == null ? '' : String(p.text)).slice(0, 60);
    var density = Math.max(0, Math.round(num(p.dichte, 0)));
    if (!text.trim() || density < 1) return null;
    var key = density + '|' + text;
    var st = block.state;
    if (st.scanKey !== key) {
      st.scanKey = key;
      st.scan = scanTextPoints(text, density);
    }
    return st.scan;
  }

  OneCanvas.registerBlock({
    type: 'textpunkte',
    kind: 'ding',
    label: 'Text als Punkte',
    icon: '∴', // ∴
    schema: [
      { key: 'text', ctrl: 'text', label: 'Text', value: '0nefinity', maxlen: 60 },
      { key: 'groesse', ctrl: 'slider', label: 'Schriftgröße', min: 10, max: 600, step: 1, value: 150 },
      { key: 'dichte', ctrl: 'slider', label: 'Punktdichte', min: 0, max: 1200, step: 1, value: 420 },
      { key: 'symbolch', ctrl: 'text', label: 'Punktsymbol (leer = Punkte)', value: '', maxlen: 2 },
      { key: 'glow', ctrl: 'slider', label: 'Glühen', min: 0, max: 40, step: 1, value: 7 },
      { key: 'x', ctrl: 'slider', label: 'X', min: -2000, max: 2000, step: 1, value: 0 },
      { key: 'y', ctrl: 'slider', label: 'Y', min: -2000, max: 2000, step: 1, value: 0 },
      { key: 'rot', ctrl: 'slider', label: 'Rotation', min: -180, max: 180, step: 1, value: 0, unit: '°' }
    ],

    // emit depends only on params -> engine may layer-cache it
    timeInvariant: true,

    init: function (block) {
      block.state = { scanKey: null, scan: null };
    },

    emit: function (block) {
      var scan = textpunkteCache(block);
      if (!scan || !scan.pts.length) return [];

      var p = block.params;
      var s = clamp(p.groesse, 1, 4000);
      var rot = clamp(p.rot, -180, 180) * DEG;
      var cosR = Math.cos(rot), sinR = Math.sin(rot);
      var px = clamp(p.x, -2000, 2000);
      var py = clamp(p.y, -2000, 2000);
      var glow = clamp(p.glow, 0, 40);
      var col = whiteCol(0.92);

      var ch = (p.symbolch == null ? '' : String(p.symbolch)).trim().slice(0, 2);
      var dotR = Math.max(0.35, s * scan.spacingEm * 0.34);
      var glyphSize = Math.max(1, s * scan.spacingEm * 1.3);

      var pts = scan.pts;
      var prims = [];
      for (var i = 0; i < pts.length; i += 2) {
        var lx = pts[i] * s, ly = pts[i + 1] * s;
        var wx = px + lx * cosR - ly * sinR;
        var wy = py + lx * sinR + ly * cosR;
        if (ch) {
          prims.push({ k: 'glyph', ch: ch, x: wx, y: wy, size: glyphSize, rot: rot, col: col, glow: glow });
        } else {
          prims.push({ k: 'dot', x: wx, y: wy, r: dotR, col: col, glow: glow });
        }
      }
      return prims;
    },

    hit: function (block, wx, wy, view) {
      var p = block.params;
      var scan = block.state && block.state.scan;
      var s = clamp(p.groesse, 1, 4000);
      var hw = scan ? scan.halfWEm * s : s;
      var hh = scan ? scan.halfHEm * s : s * 0.5;
      var r = Math.max(Math.hypot(hw, hh), 24 / view.scale);
      var dx = wx - p.x, dy = wy - p.y;
      return (dx * dx + dy * dy <= r * r) ? 'move' : null;
    },

    drag: function (block, handle, dwx, dwy) {
      if (handle !== 'move') return;
      block.params.x = clamp(block.params.x + dwx, -2000, 2000);
      block.params.y = clamp(block.params.y + dwy, -2000, 2000);
    }
  });

  /* ================================================================
   * linienschar — N parallele Linien (Ding)
   *
   * Line family from the moiré generator: evenly spaced parallel
   * lines around a center. Two overlaid instances with slightly
   * different angle/spacing create moiré. Lines are tessellated so
   * warps can bend them.
   * ================================================================ */

  OneCanvas.registerBlock({
    type: 'linienschar',
    kind: 'ding',
    label: 'Linienschar',
    icon: '≡', // ≡
    schema: [
      { key: 'anzahl', ctrl: 'slider', label: 'Anzahl', min: 0, max: 200, step: 1, value: 24 },
      { key: 'abstand', ctrl: 'slider', label: 'Abstand', min: 0, max: 1000, step: 1, value: 26 },
      { key: 'winkel', ctrl: 'slider', label: 'Winkel', min: -180, max: 180, step: 1, value: 0, unit: '°' },
      { key: 'laenge', ctrl: 'slider', label: 'Länge', min: 10, max: 8000, step: 10, value: 900 },
      { key: 'staerke', ctrl: 'slider', label: 'Linienstärke', min: 0.1, max: 12, step: 0.1, value: 1.2, decimals: 1 },
      { key: 'x', ctrl: 'slider', label: 'X', min: -2000, max: 2000, step: 1, value: 0 },
      { key: 'y', ctrl: 'slider', label: 'Y', min: -2000, max: 2000, step: 1, value: 0 }
    ],

    // emit depends only on params -> engine may layer-cache it
    timeInvariant: true,

    emit: function (block) {
      var p = block.params;
      var n = Math.max(0, Math.round(num(p.anzahl, 0)));
      if (!n) return [];
      var spacing = Math.max(0, num(p.abstand, 0));
      var ang = clamp(p.winkel, -180, 180) * DEG;
      var len = clamp(p.laenge, 1, 20000);
      var w = clamp(p.staerke, 0.1, 12);
      var px = clamp(p.x, -2000, 2000);
      var py = clamp(p.y, -2000, 2000);

      var dirX = Math.cos(ang), dirY = Math.sin(ang);
      var perX = -dirY, perY = dirX;
      var col = whiteCol(0.72);

      var prims = [];
      for (var i = 0; i < n; i++) {
        var off = (i - (n - 1) / 2) * spacing;
        var cx = px + perX * off;
        var cy = py + perY * off;
        var x0 = cx - dirX * len / 2, y0 = cy - dirY * len / 2;
        var x1 = cx + dirX * len / 2, y1 = cy + dirY * len / 2;
        var pts = [];
        for (var k = 0; k <= LINE_SEGS; k++) {
          var f = k / LINE_SEGS;
          pts.push(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f);
        }
        prims.push({ k: 'poly', pts: pts, w: w, col: col });
      }
      return prims;
    },

    hit: function (block, wx, wy, view) {
      var p = block.params;
      var n = Math.max(0, Math.round(num(p.anzahl, 0)));
      var span = n > 1 ? (n - 1) * Math.max(0, num(p.abstand, 0)) / 2 : 0;
      var r = Math.hypot(clamp(p.laenge, 1, 20000) / 2, span) + 16 / view.scale;
      var dx = wx - p.x, dy = wy - p.y;
      return (dx * dx + dy * dy <= r * r) ? 'move' : null;
    },

    drag: function (block, handle, dwx, dwy) {
      if (handle !== 'move') return;
      block.params.x = clamp(block.params.x + dwx, -2000, 2000);
      block.params.y = clamp(block.params.y + dwy, -2000, 2000);
    }
  });

  /* ================================================================
   * spirale — Spirale / Helix (Ding)
   *
   * Geometry from spirals copy.html (render section only, no
   * physics): archimedean spiral in the plane; Steigung stretches it
   * into a helix along its axis (each turn advances). 3D depth
   * (z = sin(u)) modulates alpha and stroke width — front of the
   * coil bright and thick, back dim and thin. Depth-modulated arcs
   * are emitted as short polys with quantized styles so the engine
   * can batch them.
   * ================================================================ */

  OneCanvas.registerBlock({
    type: 'spirale',
    kind: 'ding',
    label: 'Spirale / Helix',
    icon: '↻', // ↻
    schema: [
      { key: 'windungen', ctrl: 'slider', label: 'Windungen', min: 0, max: 40, step: 0.5, value: 6, decimals: 1 },
      { key: 'radius', ctrl: 'slider', label: 'Radius', min: 0, max: 2000, step: 1, value: 170 },
      { key: 'steigung', ctrl: 'slider', label: 'Steigung', min: 0, max: 500, step: 1, value: 0 },
      { key: 'tiefe', ctrl: 'slider', label: '3D-Tiefe', min: 0, max: 1, step: 0.01, value: 0.65, decimals: 2 },
      { key: 'ppw', ctrl: 'slider', label: 'Punkte/Windung', min: 4, max: 120, step: 1, value: 48 },
      { key: 'staerke', ctrl: 'slider', label: 'Linienstärke', min: 0.1, max: 12, step: 0.1, value: 1.4, decimals: 1 },
      { key: 'x', ctrl: 'slider', label: 'X', min: -2000, max: 2000, step: 1, value: 0 },
      { key: 'y', ctrl: 'slider', label: 'Y', min: -2000, max: 2000, step: 1, value: 0 },
      { key: 'rot', ctrl: 'slider', label: 'Rotation', min: -180, max: 180, step: 1, value: 0, unit: '°' }
    ],

    // emit depends only on params -> engine may layer-cache it
    timeInvariant: true,

    emit: function (block) {
      var p = block.params;
      var turns = clamp(p.windungen, 0, 200);
      var radius = Math.max(0, num(p.radius, 0));
      var pitch = Math.max(0, num(p.steigung, 0));
      var depth = clamp(p.tiefe, 0, 1);
      var ppw = Math.max(4, Math.round(num(p.ppw, 48)));
      var baseW = clamp(p.staerke, 0.1, 12);
      var rot = clamp(p.rot, -180, 180) * DEG;
      var cosR = Math.cos(rot), sinR = Math.sin(rot);
      var px = clamp(p.x, -2000, 2000);
      var py = clamp(p.y, -2000, 2000);

      var U = turns * Math.PI * 2;
      if (!(U > 0) || (!(radius > 0) && !(pitch > 0))) return [];

      var N = Math.max(2, Math.round(turns * ppw));
      var totalH = turns * pitch;
      // more pitch -> the coil tilts toward side view: rings squash in y
      var squash = 1 / (1 + pitch / 80);

      // sample points (world) + depth per point
      var xs = new Array(N + 1), ys = new Array(N + 1), zs = new Array(N + 1);
      for (var i = 0; i <= N; i++) {
        var f = i / N;
        var u = U * f;
        var r = radius * f; // archimedean growth from the center
        var lx = Math.cos(u) * r;
        var ly = Math.sin(u) * r * squash + (f - 0.5) * totalH;
        xs[i] = px + lx * cosR - ly * sinR;
        ys[i] = py + lx * sinR + ly * cosR;
        zs[i] = Math.sin(u); // -1 (back) .. +1 (front)
      }

      var glow = 8;
      var prims = [];
      if (depth <= 0) {
        var flat = [];
        for (i = 0; i <= N; i++) flat.push(xs[i], ys[i]);
        prims.push({ k: 'poly', pts: flat, w: baseW, col: whiteCol(0.9), glow: glow });
        return prims;
      }

      // depth-modulated arcs: ~8 chunks per turn, styles quantized so
      // equal-depth arcs share one stroke batch in the engine
      var chunk = Math.max(2, Math.round(ppw / 8));
      for (var i0 = 0; i0 < N; i0 += chunk) {
        var i1 = Math.min(N, i0 + chunk);
        var zMid = zs[Math.min(N, i0 + ((i1 - i0) >> 1))];
        var a = 0.9 * (1 - depth * 0.5 * (1 - zMid)); // front 0.9, back 0.9*(1-depth)
        a = Math.round(clamp(a, 0.04, 1) * 20) / 20;
        var wf = Math.round((1 + depth * 0.45 * zMid) * 10) / 10;
        var pts = [];
        for (i = i0; i <= i1; i++) pts.push(xs[i], ys[i]);
        prims.push({
          k: 'poly', pts: pts,
          w: Math.max(0.1, baseW * wf),
          col: whiteCol(a),
          glow: zMid > 0 ? glow : glow * 0.4
        });
      }
      return prims;
    },

    hit: function (block, wx, wy, view) {
      var p = block.params;
      var radius = Math.max(0, num(p.radius, 0));
      var halfH = clamp(p.windungen, 0, 200) * Math.max(0, num(p.steigung, 0)) / 2;
      var r = Math.max(Math.hypot(radius, halfH + radius), 24 / view.scale);
      var dx = wx - p.x, dy = wy - p.y;
      return (dx * dx + dy * dy <= r * r) ? 'move' : null;
    },

    drag: function (block, handle, dwx, dwy) {
      if (handle !== 'move') return;
      block.params.x = clamp(block.params.x + dwx, -2000, 2000);
      block.params.y = clamp(block.params.y + dwy, -2000, 2000);
    }
  });
})();
