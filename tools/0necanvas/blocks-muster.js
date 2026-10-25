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
  var INSTANCE_BUDGET = 1500; // mirrors engine INSTANCE_CAP (not exported)
  var LINIEN_MAX = 2000;      // echtes Perf-Budget: Polys pro linienschar-Frame
  var SPIRALE_MAX_PTS = 16000; // echtes Perf-Budget: Punkte pro spirale-Frame

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

  /* ================================================================
   * tapete — Kaleidoskop-Tapete (Kraft)
   *
   * Plane-filling triangle symmetry instead of radial kaleidoscope.
   * Ported from 1kaleidosk0p.html: hex-offset triangle lattice, per
   * cell 3 rotations (0/120/240 deg) and optionally their mirrors
   * (scale(-1,1) before the rotation) — 6 transforms per cell.
   *
   * 'Nahtlos': das Original clippt jede Zelle aufs Dreieck (SVG clipPath)
   * — Engine-Instanzen sind reine Matrizen, Clipping gibt es nicht.
   * Stattdessen der physikalische Kaleidoskop-Trick: die Ebene wird mit
   * SPIEGELUNGEN an den drei Dreieckskanten gekachelt (p6m-Gruppe, per
   * BFS vom Basis-Dreieck aus aufgezählt). Benachbarte Kopien sind dann
   * exakt die Kanten-Spiegelbilder voneinander: alles, was eine Kante
   * kreuzt, setzt sich drüben spiegel-stetig fort — nahtloses Parkett
   * ohne Clip (Inhalt größer als die Zelle überlagert sich symmetrisch,
   * die Alpha-Normalisierung fängt das ab).
   * ================================================================ */

  // canvas-order matrix product: result applies m2 first, then m1
  function matMul(m1, m2) {
    return [
      m1[0] * m2[0] + m1[2] * m2[1],
      m1[1] * m2[0] + m1[3] * m2[1],
      m1[0] * m2[2] + m1[2] * m2[3],
      m1[1] * m2[2] + m1[3] * m2[3],
      m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
      m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
    ];
  }

  function matApply(m, x, y) {
    return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  }

  // Spiegelung an der Geraden durch (ax,ay)-(bx,by) als canvas-Matrix
  function reflectMat(ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var len2 = dx * dx + dy * dy;
    if (!(len2 > 1e-12)) return [1, 0, 0, 1, 0, 0];
    var c = (dx * dx - dy * dy) / len2;
    var s = 2 * dx * dy / len2;
    return [c, s, s, -c, ax - (c * ax + s * ay), ay - (s * ax - c * ay)];
  }

  // BFS über das Dreiecks-Parkett: startend beim Basis-Dreieck wird jede
  // Kante gespiegelt; jede erreichte Dreiecksposition liefert genau eine
  // Instanzmatrix. BFS = zentrum-nah zuerst (Engine kappt hinten).
  function seamlessInstances(size, rowH, offset, target, alpha) {
    var ca = Math.cos(offset), sa = Math.sin(offset);
    function rotPt(x, y) { return [x * ca - y * sa, x * sa + y * ca]; }
    var base = [
      rotPt(0, -rowH / 2),
      rotPt(size / 2, rowH / 2),
      rotPt(-size / 2, rowH / 2)
    ];
    var IDENT = [1, 0, 0, 1, 0, 0];
    var seen = new Set();
    function keyOf(v) {
      var cx = (v[0][0] + v[1][0] + v[2][0]) / 3;
      var cy = (v[0][1] + v[1][1] + v[2][1]) / 3;
      return Math.round(cx * 6 / size) + ':' + Math.round(cy * 6 / size);
    }
    var queue = [{ m: IDENT, v: base }];
    seen.add(keyOf(base));
    var list = [];
    var qi = 0;
    while (qi < queue.length && list.length < target) {
      var cur = queue[qi++];
      list.push({ m: cur.m, alpha: alpha });
      for (var e = 0; e < 3; e++) {
        var a = cur.v[e], b = cur.v[(e + 1) % 3], c = cur.v[(e + 2) % 3];
        var R = reflectMat(a[0], a[1], b[0], b[1]);
        var nc = matApply(R, c[0], c[1]);
        var nv = [a, b, nc];
        var k = keyOf(nv);
        if (seen.has(k)) continue;
        seen.add(k);
        queue.push({ m: matMul(R, cur.m), v: nv });
      }
    }
    return list;
  }

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
      // Kanten-Spiegel-Parkett statt Zell-Rotationen (siehe Kommentar oben)
      { key: 'nahtlos', ctrl: 'toggle', label: 'Nahtlos (Kanten-Spiegel)', value: false },
      { key: 'offset', ctrl: 'slider', label: 'Winkel-Offset', min: -180, max: 180, step: 1, value: 0, unit: '°' },
      { key: 'deckkraft', ctrl: 'slider', label: 'Deckkraft', min: 0, max: 4, step: 0.05, value: 1, decimals: 2 }
    ],

    // instance matrices depend only on params -> layer-cache compatible
    timeInvariant: true,

    force: function (block) {
      var p = block.params;
      var size = num(p.zellgroesse, 260);
      var rows = Math.max(0, Math.round(num(p.zeilen, 0)));
      var cols = Math.max(0, Math.round(num(p.spalten, 0)));
      var mirror = !!p.spiegeln;
      var offset = num(p.offset, 0) * DEG;
      var deck = Math.max(0, num(p.deckkraft, 1));
      var rowH = size * Math.sqrt(3) / 2; // reference: height = size*sqrt(3)/2

      // K1-Fix: Zellzahl VOR der Schleife deckeln. Benötigte Instanzen =
      // (2*rows)*(2*cols)*perCell; alles darüber würde nur materialisiert,
      // um von der Engine sofort weggekappt zu werden (bei zeilen=1e6 waren
      // das 8 Mio. Zellen -> OOM). Wir reduzieren rows/cols proportional
      // (die Zellen sind zentrum-sortiert, also fällt nur Peripherie weg)
      // und erzeugen bewusst EINE Zelle Überhang über dem Engine-Budget,
      // damit die Engine selbst kappt und die Instanz-Limit-Pille zeigt.
      var perCell = mirror ? 6 : 3;
      var maxCells = Math.floor(INSTANCE_BUDGET / perCell) + 1;
      var needCells = 4 * rows * cols;
      if (needCells > maxCells) {
        var f = Math.sqrt(maxCells / needCells);
        var r2 = Math.max(1, Math.round(rows * f));
        var c2 = Math.max(1, Math.round(cols * f));
        // max(1)-Klemmen können eine Achse aufblähen -> gegenrechnen
        r2 = Math.min(r2, Math.max(1, Math.ceil(maxCells / (4 * c2))));
        c2 = Math.min(c2, Math.max(1, Math.ceil(maxCells / (4 * r2))));
        rows = r2;
        cols = c2;
      }

      var seamless = !!p.nahtlos;

      return {
        affine: true,
        instances: function () {
          if (!rows || !cols) return []; // 0 = Identität (keine Wiederholung)

          if (seamless) {
            // Spiegel-Parkett (p6m): Dreieckszahl ~ Fläche des Normal-Modus
            // (4·rows·cols Zellen ≙ 8·rows·cols Dreiecke), Engine-Budget+1
            var target = Math.min(INSTANCE_BUDGET + 1, Math.max(1, 8 * rows * cols));
            var aSeam = Math.min(1, deck * 3 / Math.sqrt(Math.max(1, target)));
            if (aSeam <= 0) return [];
            return seamlessInstances(Math.abs(size) || 1, Math.abs(rowH) || 1,
              offset, target, aSeam);
          }

          // Weiß-Sättigungs-Schutz: pro-Instanz-Alpha ~ 1/sqrt(n), damit
          // additive Überlagerung vieler Kopien nicht ins Weiße kippt;
          // 'Deckkraft' übersteuert (1 = Auto-Normalisierung)
          var nInst = 4 * rows * cols * perCell;
          var alpha = Math.min(1, deck * 3 / Math.sqrt(Math.max(1, nInst)));
          if (alpha <= 0) return [];

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
              list.push({ m: [ca, sa, -sa, ca, cx, cy], alpha: alpha });
              // T(cx,cy) · scale(-1,1) · R(a)  (reference transform order)
              if (mirror) list.push({ m: [-ca, sa, sa, ca, cx, cy], alpha: alpha });
            }
          }
          return list;
        }
      };
    },

    // Zell-Andeutung: gestrichelte Referenzzelle (Breite = Zellgröße,
    // Höhe = Reihenhöhe) am Ursprung + Zentrum-Punkt
    overlay: function (block, t, view) {
      var p = block.params;
      var s = Math.max(1e-6, view.scale);
      var size = Math.abs(num(p.zellgroesse, 260));
      var rowH = size * Math.sqrt(3) / 2;
      var hw = Math.max(size / 2, 12 / s);
      var hh = Math.max(rowH / 2, 12 / s);
      return [
        { k: 'poly', pts: [-hw, -hh, hw, -hh, hw, hh, -hw, hh], closed: true,
          w: 1 / s, dash: [6 / s, 6 / s], col: 'rgba(168,184,232,0.5)' },
        { k: 'dot', x: 0, y: 0, r: 3 / s, col: 'rgba(168,184,232,0.8)' }
      ];
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
      { key: 'groesse', ctrl: 'slider', label: 'Zeichengröße', min: 10, max: 600, step: 1, value: 150 },
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
      var s = num(p.groesse, 0); // frei: negativ = Punktspiegelung
      var rot = num(p.rot, 0) * DEG;
      var cosR = Math.cos(rot), sinR = Math.sin(rot);
      var px = num(p.x, 0);
      var py = num(p.y, 0);
      var glow = Math.max(0, num(p.glow, 0));
      var col = whiteCol(0.92);

      var ch = (p.symbolch == null ? '' : String(p.symbolch)).trim().slice(0, 2);
      var sAbs = Math.abs(s);
      var dotR = Math.max(0.35, sAbs * scan.spacingEm * 0.34);
      var glyphSize = Math.max(1, sAbs * scan.spacingEm * 1.3);

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
      var s = Math.abs(num(p.groesse, 0));
      var hw = scan ? scan.halfWEm * s : s;
      var hh = scan ? scan.halfHEm * s : s * 0.5;
      var r = Math.max(Math.hypot(hw, hh), 24 / view.scale);
      var dx = wx - num(p.x, 0), dy = wy - num(p.y, 0);
      return (dx * dx + dy * dy <= r * r) ? 'move' : null;
    },

    drag: function (block, handle, dwx, dwy) {
      if (handle !== 'move') return;
      block.params.x = num(block.params.x, 0) + dwx;
      block.params.y = num(block.params.y, 0) + dwy;
    },

    // gestrichelte Bounding-Box um den gescannten Text + Zentrum-Punkt
    overlay: function (block, t, view) {
      var p = block.params;
      var scan = block.state && block.state.scan;
      var vs = Math.max(1e-6, view.scale);
      var s = Math.abs(num(p.groesse, 0));
      var hw = Math.max(scan ? scan.halfWEm * s : s, 14 / vs);
      var hh = Math.max(scan ? scan.halfHEm * s : s * 0.5, 14 / vs);
      var rot = num(p.rot, 0) * DEG;
      var cosR = Math.cos(rot), sinR = Math.sin(rot);
      var px = num(p.x, 0), py = num(p.y, 0);
      var loc = [-hw, -hh, hw, -hh, hw, hh, -hw, hh];
      var pts = [];
      for (var i = 0; i < loc.length; i += 2) {
        pts.push(px + loc[i] * cosR - loc[i + 1] * sinR,
                 py + loc[i] * sinR + loc[i + 1] * cosR);
      }
      return [
        { k: 'poly', pts: pts, closed: true, w: 1 / vs, dash: [6 / vs, 6 / vs], col: 'rgba(168,184,232,0.5)' },
        { k: 'dot', x: px, y: py, r: 3 / vs, col: 'rgba(168,184,232,0.8)' }
      ];
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
      // echtes Perf-Budget (Linien = einzelne Polys); kein Geschmacks-Cap
      if (n > LINIEN_MAX) n = LINIEN_MAX;
      var spacing = num(p.abstand, 0);
      var ang = num(p.winkel, 0) * DEG;
      var len = num(p.laenge, 0);
      var w = Math.max(0, num(p.staerke, 0)); // 0 = unsichtbar (Engine skippt w<=0)
      var px = num(p.x, 0);
      var py = num(p.y, 0);

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
      var span = n > 1 ? (n - 1) * Math.abs(num(p.abstand, 0)) / 2 : 0;
      var r = Math.hypot(Math.abs(num(p.laenge, 0)) / 2, span) + 16 / view.scale;
      var dx = wx - num(p.x, 0), dy = wy - num(p.y, 0);
      return (dx * dx + dy * dy <= r * r) ? 'move' : null;
    },

    drag: function (block, handle, dwx, dwy) {
      if (handle !== 'move') return;
      block.params.x = num(block.params.x, 0) + dwx;
      block.params.y = num(block.params.y, 0) + dwy;
    },

    // gestrichelte Bounding-Box entlang der Linienrichtung + Zentrum-Punkt
    overlay: function (block, t, view) {
      var p = block.params;
      var vs = Math.max(1e-6, view.scale);
      var n = Math.max(0, Math.round(num(p.anzahl, 0)));
      var span = n > 1 ? (n - 1) * Math.abs(num(p.abstand, 0)) / 2 : 0;
      var hl = Math.max(Math.abs(num(p.laenge, 0)) / 2, 14 / vs);
      var hs = Math.max(span, 14 / vs);
      var ang = num(p.winkel, 0) * DEG;
      var dirX = Math.cos(ang), dirY = Math.sin(ang);
      var perX = -dirY, perY = dirX;
      var px = num(p.x, 0), py = num(p.y, 0);
      var pts = [
        px - dirX * hl - perX * hs, py - dirY * hl - perY * hs,
        px + dirX * hl - perX * hs, py + dirY * hl - perY * hs,
        px + dirX * hl + perX * hs, py + dirY * hl + perY * hs,
        px - dirX * hl + perX * hs, py - dirY * hl + perY * hs
      ];
      return [
        { k: 'poly', pts: pts, closed: true, w: 1 / vs, dash: [6 / vs, 6 / vs], col: 'rgba(168,184,232,0.5)' },
        { k: 'dot', x: px, y: py, r: 3 / vs, col: 'rgba(168,184,232,0.8)' }
      ];
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
      var turns = num(p.windungen, 0); // frei: negativ = Gegenrichtung
      var radius = num(p.radius, 0);   // frei: negativ = gespiegelt
      var pitch = num(p.steigung, 0);
      var depth = clamp(p.tiefe, 0, 1); // Mischfaktor, mathematisch 0..1
      var ppw = Math.max(1, Math.round(Math.abs(num(p.ppw, 48))));
      var baseW = Math.max(0, num(p.staerke, 0)); // 0 = unsichtbar
      var rot = num(p.rot, 0) * DEG;
      var cosR = Math.cos(rot), sinR = Math.sin(rot);
      var px = num(p.x, 0);
      var py = num(p.y, 0);

      var U = turns * Math.PI * 2;
      if (!turns || (!radius && !pitch)) return [];

      // echtes Perf-Budget: Gesamtpunkte kappen (nicht die Params selbst)
      var N = Math.max(2, Math.min(SPIRALE_MAX_PTS, Math.round(Math.abs(turns) * ppw)));
      var totalH = turns * pitch;
      // more pitch -> the coil tilts toward side view: rings squash in y
      var squash = 1 / (1 + Math.abs(pitch) / 80);

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
          w: Math.max(0, baseW * wf),
          col: whiteCol(a),
          glow: zMid > 0 ? glow : glow * 0.4
        });
      }
      return prims;
    },

    hit: function (block, wx, wy, view) {
      var p = block.params;
      var radius = Math.abs(num(p.radius, 0));
      var halfH = Math.abs(num(p.windungen, 0) * num(p.steigung, 0)) / 2;
      var r = Math.max(Math.hypot(radius, halfH + radius), 24 / view.scale);
      var dx = wx - num(p.x, 0), dy = wy - num(p.y, 0);
      return (dx * dx + dy * dy <= r * r) ? 'move' : null;
    },

    drag: function (block, handle, dwx, dwy) {
      if (handle !== 'move') return;
      block.params.x = num(block.params.x, 0) + dwx;
      block.params.y = num(block.params.y, 0) + dwy;
    },

    overlay: function (block, t, view) {
      var p = block.params;
      var radius = Math.abs(num(p.radius, 0));
      var halfH = Math.abs(num(p.windungen, 0) * num(p.steigung, 0)) / 2;
      return selCircleOverlay(num(p.x, 0), num(p.y, 0),
        Math.hypot(radius, halfH + radius), view);
    }
  });
})();
