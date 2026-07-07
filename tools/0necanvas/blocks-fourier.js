/* 0necanvas blocks — Fourier-Zeichner (Erzeuger)
 *
 * Ports the fourieous.html math into a single registerBlock:
 * - Text -> ORDERED outline points: per-char offscreen canvas pixel scan,
 *   Moore-neighbor contour tracing (edge pixels walked clockwise), contours
 *   sorted largest-first, proportionally resampled (~400 pts/char), each
 *   point tagged with a contourId (needed for gap/jump detection).
 * - DFT (fourieous computeDFT): X_k = 1/N * sum_n z_n * e^(-2*pi*i*k*n/N)
 *   with z = x + i*y, k = -N/2 .. N/2. Stored as {freq, amp, phase}.
 * - Reconstruction = chain of rotating pointers: position(t) =
 *   sum_k amp_k * e^(i*(freq'_k * t + phase_k)), t in [0, 2*pi).
 * - Frequency play (the 3 strongest fourieous manipulations): sort mode
 *   (chain draw order: amplitude/frequency/seeded random — the tip path is
 *   order-invariant, the visible circle chain is not), freq scale
 *   (freq' = freq * scale; non-integer scale breaks curve closure ->
 *   spirograph drift) and freq offset (freq' = freq*scale + offset; global
 *   extra rotation). DC (freq 0) is never manipulated, as in the original.
 *
 * Caching (all in block.state, three levels so slider scrubs stay cheap):
 *   text+fontSize -> contour points + DFT coefficients (heaviest)
 *   circles+freqScale+freqOffset -> coefficient subset + precomputed cycle
 *   sort -> chain display order
 * The trace cycle is precomputed once (fourieous precomputeCycle) at
 * <= CYCLE_MAX samples; emit only windows/transforms it per frame.
 */
(function () {
  'use strict';

  var TAU = Math.PI * 2;
  var FONT = 'Georgia, "Times New Roman", serif';
  var TARGET_PER_CHAR = 400;  // resampled outline points per character
  var MAX_POINTS = 1000;      // combined DFT input cap (O(N^2) once per change)
  var CYCLE_MIN = 600;
  var CYCLE_MAX = 1400;       // trace sample cap (fps guard)
  var BASE_PERIOD = 10;       // seconds per full drawing at Tempo 1
  var MAX_CHARS = 12;
  var SEED = 42;              // fixed: reproducible 'zufall' order
  var TRAIL_BUCKETS = 6;      // alpha steps of the fading tail
  var CHAIN_COL = 'rgba(255,255,255,0.15)';
  var ARM_COL = 'rgba(255,255,255,0.30)';
  var TRACE_ALPHA = 0.92;

  function clamp(v, lo, hi) {
    v = Number(v);
    if (!isFinite(v)) return lo;
    return v < lo ? lo : (v > hi ? hi : v);
  }

  /* ---- seeded shuffle (fourieous port, reproducible random order) ---- */

  function seededRandom(seed) {
    var x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }

  function shuffleWithSeed(array, seed) {
    var result = array.slice();
    var currentSeed = seed;
    for (var i = result.length - 1; i > 0; i--) {
      var j = Math.floor(seededRandom(currentSeed++) * (i + 1));
      var tmp = result[i];
      result[i] = result[j];
      result[j] = tmp;
    }
    return result;
  }

  /* ---- text -> ordered contour points (fourieous pixel-scan port) ---- */

  var measCtx = null;
  function measureChar(ch, fontSize) {
    if (!measCtx) {
      var c = document.createElement('canvas');
      c.width = 8; c.height = 8;
      measCtx = c.getContext('2d');
    }
    measCtx.font = fontSize + 'px ' + FONT;
    return measCtx.measureText(ch).width;
  }

  // Moore-neighbor tracing over the alpha channel of a rendered glyph.
  // Returns [{x, y, cid}, ...] relative to the glyph center, contours
  // largest-first, resampled to ~TARGET_PER_CHAR points total.
  function extractContour(ch, fontSize) {
    var pad = 20;
    var w = Math.ceil(Math.max(fontSize, measureChar(ch, fontSize))) + pad * 2;
    var h = Math.ceil(fontSize * 1.6) + pad * 2;
    var cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    var g = cv.getContext('2d', { willReadFrequently: true });
    g.clearRect(0, 0, w, h);
    g.font = fontSize + 'px ' + FONT;
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(ch, w / 2, h / 2);

    var data;
    try {
      data = g.getImageData(0, 0, w, h).data;
    } catch (e) {
      console.error('0necanvas fourier: getImageData failed', e);
      return [];
    }

    function filled(x, y) {
      if (x < 0 || x >= w || y < 0 || y >= h) return false;
      return data[(y * w + x) * 4 + 3] > 128;
    }
    function edge(x, y) {
      if (!filled(x, y)) return false;
      return !filled(x - 1, y) || !filled(x + 1, y) ||
             !filled(x, y - 1) || !filled(x, y + 1);
    }

    // Moore neighbors clockwise, start: left (same table as fourieous)
    var moore = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]];
    var visited = new Uint8Array(w * h);
    var contours = [];

    for (var sy = 0; sy < h; sy++) {
      for (var sx = 0; sx < w; sx++) {
        if (!edge(sx, sy) || visited[sy * w + sx]) continue;
        var contour = []; // flat [x,y,...] relative to glyph center
        var x = sx, y = sy, dir = 0;
        do {
          contour.push(x - w / 2, y - h / 2);
          visited[y * w + x] = 1;
          var found = false;
          var searchStart = (dir + 5) % 8; // come-from direction + 135 deg back
          for (var i = 0; i < 8; i++) {
            var cd = (searchStart + i) % 8;
            var nx = x + moore[cd][0], ny = y + moore[cd][1];
            var isStart = (nx === sx && ny === sy);
            if (nx >= 0 && nx < w && ny >= 0 && ny < h &&
                edge(nx, ny) && (isStart || !visited[ny * w + nx])) {
              x = nx; y = ny; dir = cd; found = true;
              break;
            }
          }
          if (!found) break;
        } while (x !== sx || y !== sy);
        if (contour.length >= 6) contours.push(contour);
      }
    }

    if (!contours.length) return [];
    contours.sort(function (a, b) { return b.length - a.length; }); // outer first

    // proportional resample with per-point contourId
    var totalOrig = 0;
    for (var ci = 0; ci < contours.length; ci++) totalOrig += contours[ci].length / 2;
    var out = [];
    for (ci = 0; ci < contours.length; ci++) {
      var comp = contours[ci];
      var n = comp.length / 2;
      var target = Math.max(20, Math.round((n / totalOrig) * TARGET_PER_CHAR));
      if (target > n) target = n;
      var step = n / target;
      for (var k = 0; k < target; k++) {
        var idx = Math.floor(k * step);
        out.push({ x: comp[idx * 2], y: comp[idx * 2 + 1], cid: ci });
      }
    }
    return out;
  }

  // whole text -> single ordered, centroid-centered point list (unified
  // path: one DFT / one epicycle chain draws all characters left to right)
  function buildTextPoints(text, fontSize) {
    var tracking = fontSize * 0.08;
    var spaceAdv = fontSize * 0.3;
    var all = [];
    var currentX = 0;
    var globalCid = 0;

    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (ch === ' ' || ch === '\t' || ch === '\n') {
        currentX += spaceAdv;
        continue;
      }
      var adv = measureChar(ch, fontSize);
      var pts = extractContour(ch, fontSize);
      if (!pts.length) {
        console.warn('0necanvas fourier: keine Kontur für "' + ch + '"');
        currentX += adv + tracking;
        continue;
      }
      var maxLocal = 0;
      var cx = currentX + adv / 2;
      for (var j = 0; j < pts.length; j++) {
        var p = pts[j];
        if (p.cid > maxLocal) maxLocal = p.cid;
        all.push({ x: p.x + cx, y: p.y, cid: globalCid + p.cid });
      }
      globalCid += maxLocal + 1;
      currentX += adv + tracking;
    }

    var n = all.length;
    if (n < 8) return null;

    // cap combined size (DFT is O(N^2)); stride resample preserves order+cid
    if (n > MAX_POINTS) {
      var res = [];
      var step = n / MAX_POINTS;
      for (var r = 0; r < MAX_POINTS; r++) res.push(all[Math.floor(r * step)]);
      all = res;
      n = all.length;
    }

    // center on centroid -> DC coefficient becomes 0, block draws around x/y
    var mx = 0, my = 0;
    for (i = 0; i < n; i++) { mx += all[i].x; my += all[i].y; }
    mx /= n; my /= n;
    var xs = new Float64Array(n);
    var ys = new Float64Array(n);
    var cid = new Int32Array(n);
    var maxR = 1;
    for (i = 0; i < n; i++) {
      xs[i] = all[i].x - mx;
      ys[i] = all[i].y - my;
      cid[i] = all[i].cid;
      var d = Math.hypot(xs[i], ys[i]);
      if (d > maxR) maxR = d;
    }
    return { xs: xs, ys: ys, cid: cid, n: n, maxR: maxR };
  }

  /* ---- DFT (exact fourieous computeDFT port) ---- */

  // X_k = 1/N * sum_n (x_n + i*y_n) * e^(-2*pi*i*k*n/N), k = -N/2..N/2
  function computeDFT(geo) {
    var N = geo.n;
    var xs = geo.xs, ys = geo.ys;
    var halfN = Math.floor(N / 2);
    var coeffs = [];
    for (var k = -halfN; k <= halfN; k++) {
      var re = 0, im = 0;
      for (var n = 0; n < N; n++) {
        var angle = (TAU * k * n) / N;
        var c = Math.cos(angle), s = Math.sin(angle);
        re += xs[n] * c + ys[n] * s;
        im += ys[n] * c - xs[n] * s;
      }
      re /= N;
      im /= N;
      coeffs.push({
        freq: k,
        amp: Math.sqrt(re * re + im * im),
        phase: Math.atan2(im, re)
      });
    }
    return coeffs;
  }

  // DC always included, remaining slots = strongest amplitudes (fourieous
  // coeffsToUse rule — the tip path uses these regardless of sort mode)
  function selectCoeffs(coeffs, maxCircles) {
    var dc = null;
    var rest = [];
    for (var i = 0; i < coeffs.length; i++) {
      if (coeffs[i].freq === 0) dc = coeffs[i];
      else rest.push(coeffs[i]);
    }
    rest.sort(function (a, b) { return b.amp - a.amp; });
    var nRest = Math.min(rest.length, dc ? maxCircles - 1 : maxCircles);
    var use = rest.slice(0, nRest);
    if (dc) use.unshift(dc);
    return use;
  }

  function sortForDisplay(use, mode) {
    var sorted = use.slice();
    if (mode === 'frequenz') {
      sorted.sort(function (a, b) {
        var aa = Math.abs(a.freq), ab = Math.abs(b.freq);
        if (aa !== ab) return aa - ab;
        return a.freq - b.freq;
      });
    } else if (mode === 'zufall') {
      sorted = shuffleWithSeed(sorted, SEED);
    } else {
      sorted.sort(function (a, b) { return b.amp - a.amp; });
    }
    return sorted;
  }

  // fourieous manipulateFrequency, reduced to the two ported knobs;
  // DC (freq 0) is handled by the callers and never manipulated
  function manipFreq(freq, scale, offset) {
    return freq * scale + offset;
  }

  /* ---- cycle precompute (fourieous precomputeCycle port) ---- */

  function precomputeCycle(use, geo, fScale, fOffset) {
    var N = geo.n;
    var cl = Math.max(CYCLE_MIN, Math.min(CYCLE_MAX, 2 * N));
    var xs = new Float64Array(cl);
    var ys = new Float64Array(cl);
    var jump = new Uint8Array(cl);
    var m = use.length;

    for (var i = 0; i < cl; i++) {
      var t = (i / cl) * TAU;
      var x = 0, y = 0;
      for (var j = 0; j < m; j++) {
        var c = use[j];
        var f = c.freq === 0 ? 0 : manipFreq(c.freq, fScale, fOffset);
        var ang = f * t + c.phase;
        x += c.amp * Math.cos(ang);
        y += c.amp * Math.sin(ang);
      }
      xs[i] = x;
      ys[i] = y;

      // gap detection: pen jumps when the source contour changes
      var srcIdx = Math.floor((i / cl) * N) % N;
      var prevIdx = (i - 1 + cl) % cl;
      var prevSrc = Math.floor((prevIdx / cl) * N) % N;
      if (geo.cid[srcIdx] !== geo.cid[prevSrc]) jump[i] = 1;
    }

    // non-integer freq scale breaks closure: don't draw the wrap segment
    var dx = xs[cl - 1] - xs[0], dy = ys[cl - 1] - ys[0];
    if (Math.hypot(dx, dy) > geo.maxR * 0.04) jump[0] = 1;

    return { xs: xs, ys: ys, jump: jump, n: cl };
  }

  /* ---- state / cache ---- */

  function freshState() {
    return { phase: 0, total: 0, sigT: null, sigC: null, sigS: null };
  }

  function ensureCache(block) {
    var p = block.params;
    var st = block.state;
    var fontSize = clamp(p.fontSize, 20, 400);
    var text = String(p.text == null ? '' : p.text).slice(0, MAX_CHARS);

    var sigT = text + '' + fontSize;
    if (st.sigT !== sigT) {
      st.sigT = sigT;
      st.geo = buildTextPoints(text, fontSize);
      st.coeffs = st.geo ? computeDFT(st.geo) : null;
      st.sigC = null;
      st.sigS = null;
    }
    if (!st.coeffs) return false;

    var circles = Math.round(clamp(p.circles, 2, 400));
    var fs = clamp(p.freqScale, -8, 8);
    var fo = Math.round(clamp(p.freqOffset, -100, 100));
    var sigC = circles + '|' + fs + '|' + fo;
    if (st.sigC !== sigC) {
      st.sigC = sigC;
      st.use = selectCoeffs(st.coeffs, circles);
      st.cycle = precomputeCycle(st.use, st.geo, fs, fo);
      st.sigS = null;
    }

    var sigS = String(p.sort);
    if (st.sigS !== sigS) {
      st.sigS = sigS;
      st.order = sortForDisplay(st.use, p.sort);
    }
    return true;
  }

  /* ---- trail bucket colors (stable strings -> engine style groups) ---- */

  var bucketCols = [];
  for (var bi = 0; bi < TRAIL_BUCKETS; bi++) {
    var ba = 0.10 + (TRACE_ALPHA - 0.10) * ((bi + 1) / TRAIL_BUCKETS);
    bucketCols.push('rgba(255,255,255,' + ba.toFixed(3) + ')');
  }
  var traceCol = 'rgba(255,255,255,' + TRACE_ALPHA + ')';

  /* ---- block ---- */

  OneCanvas.registerBlock({
    type: 'fourier',
    kind: 'erzeuger',
    label: 'Fourier-Zeichner',
    icon: '∮',
    schema: [
      { key: 'text', ctrl: 'text', label: 'Text', value: '0', maxlen: MAX_CHARS },
      { key: 'circles', ctrl: 'slider', label: 'Kreise', min: 2, max: 300, step: 1, value: 80 },
      { key: 'tempo', ctrl: 'slider', label: 'Tempo', min: 0.1, max: 8, step: 0.1, value: 1, decimals: 1 },
      { key: 'trail', ctrl: 'slider', label: 'Nachleuchten', min: 5, max: 100, step: 1, value: 100, unit: '%' },
      { key: 'showCircles', ctrl: 'toggle', label: 'Kreise zeigen', value: true },
      {
        key: 'sort', ctrl: 'select', label: 'Sortierung',
        options: [
          { value: 'amplitude', label: 'Amplitude' },
          { value: 'frequenz', label: 'Frequenz' },
          { value: 'zufall', label: 'Zufall' }
        ],
        value: 'amplitude'
      },
      { key: 'freqScale', ctrl: 'slider', label: 'Frequenz-Skala', min: -3, max: 3, step: 0.05, value: 1, decimals: 2 },
      { key: 'freqOffset', ctrl: 'slider', label: 'Frequenz-Versatz', min: -30, max: 30, step: 1, value: 0 },
      { key: 'fontSize', ctrl: 'slider', label: 'Schriftgröße', min: 40, max: 300, step: 2, value: 120 },
      { key: 'size', ctrl: 'slider', label: 'Größe', min: 10, max: 400, step: 1, value: 160, unit: '%' },
      { key: 'width', ctrl: 'slider', label: 'Linienstärke', min: 0.5, max: 8, step: 0.1, value: 1.6, decimals: 1 },
      { key: 'glow', ctrl: 'slider', label: 'Glühen', min: 0, max: 40, step: 1, value: 12 },
      { key: 'x', ctrl: 'slider', label: 'X', min: -2000, max: 2000, step: 1, value: 0 },
      { key: 'y', ctrl: 'slider', label: 'Y', min: -2000, max: 2000, step: 1, value: 0 }
    ],

    init: function (block) {
      block.state = freshState();
    },

    emit: function (block, t, dt, view) {
      var p = block.params;
      var st = block.state;
      if (!st || typeof st.phase !== 'number') st = block.state = freshState();
      if (!ensureCache(block)) return [];

      var cyc = st.cycle;
      var cl = cyc.n;
      var scale = clamp(p.size, 1, 2000) / 100;
      var ox = clamp(p.x, -2000, 2000);
      var oy = clamp(p.y, -2000, 2000);
      var glow = clamp(p.glow, 0, 40);
      var width = clamp(p.width, 0.5, 12);
      var hairW = 1 / (view && view.scale > 0 ? view.scale : 1);

      // drawing parameter loops 0..1 (one full cycle = one drawn figure)
      var tempo = clamp(p.tempo, 0, 20);
      st.phase = (st.phase + dt * tempo / BASE_PERIOD) % 1;
      if (st.total < 2) st.total += dt * tempo / BASE_PERIOD;

      var prims = [];
      var i, j;

      /* -- epicycle chain: positions in display (sort) order -- */
      var order = st.order;
      var tt = st.phase * TAU;
      var m = order.length;
      var posX = new Float64Array(m + 1);
      var posY = new Float64Array(m + 1);
      posX[0] = ox; posY[0] = oy;
      var cx = ox, cy = oy;
      for (i = 0; i < m; i++) {
        var c = order[i];
        var f = c.freq === 0 ? 0 : manipFreq(c.freq, clamp(p.freqScale, -8, 8), Math.round(clamp(p.freqOffset, -100, 100)));
        var ang = f * tt + c.phase;
        cx += c.amp * scale * Math.cos(ang);
        cy += c.amp * scale * Math.sin(ang);
        posX[i + 1] = cx;
        posY[i + 1] = cy;
      }

      if (p.showCircles) {
        // thin circles around each chain joint (skip sub-pixel ones)
        for (i = 0; i < m; i++) {
          var r = order[i].amp * scale;
          var screenR = r * view.scale;
          if (screenR < 0.6) continue;
          var segs = screenR > 100 ? 44 : (screenR > 25 ? 26 : 14);
          var cpts = [];
          for (j = 0; j < segs; j++) {
            var a = (j / segs) * TAU;
            cpts.push(posX[i] + Math.cos(a) * r, posY[i] + Math.sin(a) * r);
          }
          prims.push({ k: 'poly', pts: cpts, closed: true, w: hairW * 0.9, col: CHAIN_COL });
        }
        // pointer arms: one polyline through all joints
        var apts = [];
        for (i = 0; i <= m; i++) apts.push(posX[i], posY[i]);
        prims.push({ k: 'poly', pts: apts, w: hairW, col: ARM_COL });
      }

      /* -- trace: window of the precomputed cycle up to the current pen -- */
      var trail = clamp(p.trail, 5, 100) / 100;
      var pos = Math.floor(st.phase * cl) % cl;
      var visN = Math.min(cl, Math.floor(Math.min(st.total, trail) * cl));
      if (visN >= 2) {
        var fade = trail < 0.995;
        var start = pos - visN + 1;
        var cur = null;
        var curBucket = -1;
        var lastX = 0, lastY = 0, has = false;
        for (var k = 0; k < visN; k++) {
          var idx = ((start + k) % cl + cl) % cl;
          var bucket = fade
            ? Math.min(TRAIL_BUCKETS - 1, Math.floor((k / visN) * TRAIL_BUCKETS))
            : 0;
          var wx = ox + cyc.xs[idx] * scale;
          var wy = oy + cyc.ys[idx] * scale;
          if (cyc.jump[idx] || bucket !== curBucket || !cur) {
            if (cur && cur.length >= 4) {
              prims.push({
                k: 'poly', pts: cur, w: width, glow: glow,
                col: fade ? bucketCols[curBucket] : traceCol
              });
            }
            cur = [];
            // continuity: bucket switch keeps the previous point,
            // a real pen jump does not
            if (!cyc.jump[idx] && has) cur.push(lastX, lastY);
            curBucket = bucket;
          }
          cur.push(wx, wy);
          lastX = wx; lastY = wy; has = true;
        }
        if (cur && cur.length >= 4) {
          prims.push({
            k: 'poly', pts: cur, w: width, glow: glow,
            col: fade ? bucketCols[curBucket] : traceCol
          });
        }
      }

      // pen tip: chain end (identical to the current trace point)
      prims.push({
        k: 'dot', x: posX[m], y: posY[m],
        r: Math.max(width * 1.1, 2 * hairW),
        col: 'rgba(255,255,255,0.95)', glow: Math.min(glow, 14)
      });

      return prims;
    },

    hit: function (block, wx, wy, view) {
      var p = block.params;
      var st = block.state;
      var maxR = (st && st.geo) ? st.geo.maxR : 120;
      var r = maxR * clamp(p.size, 1, 2000) / 100 + 20 / view.scale;
      var dx = wx - p.x, dy = wy - p.y;
      return (dx * dx + dy * dy <= r * r) ? 'move' : null;
    },

    drag: function (block, handle, dwx, dwy) {
      if (handle !== 'move') return;
      block.params.x = clamp(block.params.x + dwx, -2000, 2000);
      block.params.y = clamp(block.params.y + dwy, -2000, 2000);
    },

    overlay: function (block, t, view) {
      var p = block.params;
      var st = block.state;
      var maxR = (st && st.geo) ? st.geo.maxR : 120;
      var r = Math.max(1, maxR * clamp(p.size, 1, 2000) / 100);
      var w = 1 / (view.scale > 0 ? view.scale : 1);
      var pts = [];
      var n = 72;
      for (var i = 0; i <= n; i++) {
        var a = (i / n) * TAU;
        pts.push(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
      }
      return [
        { k: 'poly', pts: pts, closed: true, w: w, dash: [8 * w, 8 * w], col: 'rgba(168,184,232,0.5)' },
        { k: 'dot', x: p.x, y: p.y, r: 2.5 * w, col: 'rgba(168,184,232,0.8)' }
      ];
    }
  });
})();
