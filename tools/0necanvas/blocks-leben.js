/* 0necanvas blocks — Leben (lebendige Erzeuger + Ring/Spiral-Schrift)
 *
 * Vier Bausteine rund um wachsende / wuchernde Systeme:
 *
 * - zellautomat  (erzeuger) — Game of Life als sparse Set lebender Zellen
 *   (Referenz: /game0f1ife.html + /tools/workers/game0f1ife-worker.js).
 *   Sim-Tickrate ist vom Render entkoppelt (Schritte/s als Param, max
 *   Schritte pro Frame gekappt — kein Web Worker in diesem Schritt).
 * - strahlen     (erzeuger) — Strahlenbüschel aus dem Zentrum
 *   (Referenz: /whitelines.html): Winkelliste wächst pro Frame, Linien
 *   mit Zwischenpunkten, damit Kräfte (warp) sie biegen können.
 * - ringschrift  (ding)     — Zeichensequenz auf Ring oder Spirale
 *   (Referenz: /kreisausdingen.html + Kuriositäten/…-goes-spiral.html).
 *   Als DING registriert: die Anordnung ist rein aus params + t ableitbar
 *   (Rotationsphase = t * Drehgeschwindigkeit, kein State nötig) — so
 *   greift bei Drehgeschwindigkeit 0 der Layer-Cache der Engine und der
 *   Baustein ist praktisch gratis.
 * - textbaum     (erzeuger) — wuchernder Text-Baum
 *   (Referenz: /n0thingsp1s.html): Nodes spawnen Kinder im Abstand,
 *   sterben mit Chance (Teilbaum stirbt mit), Kanten optional als Linien.
 *
 * Konventionen wie blocks-erzeuger.js: deterministisches mulberry32-PRNG
 * im block.state (fester Seed => gleiche Szene reproduziert das gleiche
 * Leben), Serialisierung NUR über params (state wird bei sc.load via
 * init() frisch aufgebaut), Fade über prim._alpha, harte Caps gegen
 * Explosion (Zellen 4000, Strahlen 2000, Nodes 1500).
 */
(function () {
  'use strict';

  if (!window.OneCanvas || typeof window.OneCanvas.registerBlock !== 'function') {
    console.error('0necanvas blocks-leben: OneCanvas fehlt (Script-Reihenfolge?)');
    return;
  }

  var TAU = Math.PI * 2;
  var DEG = Math.PI / 180;
  var INK = 'rgba(226,231,244,0.92)';       // Standard-Zeichenfarbe (wie spawner)
  var INK_SOFT = 'rgba(226,231,244,0.6)';
  var EDGE_COL = 'rgba(168,184,232,0.4)';   // Akzent, gedimmt (Kanten)
  var OVERLAY_COL = 'rgba(168,184,232,0.5)';

  /* ---------- deterministisches PRNG (Muster wie blocks-erzeuger.js) ---------- */

  function mulberry32Next(state) {
    var z = (state.s = (state.s + 0x6D2B79F5) | 0);
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  }

  /* ---------- gemeinsame Helfer ---------- */

  function clamp(v, lo, hi) {
    v = Number(v);
    if (!isFinite(v)) return lo;
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function tokensFromParam(str, fallback) {
    var list = String(str == null ? '' : str).split(/\s+/).filter(function (s) {
      return s.length > 0;
    });
    return list.length ? list : fallback;
  }

  // gestrichelter Streuradius-Kreis als Auswahl-Overlay (wie spawner)
  function radiusOverlay(r, view, cx, cy) {
    r = Math.max(1, r);
    var pts = [];
    var n = 72;
    for (var i = 0; i <= n; i++) {
      var a = (i / n) * TAU;
      pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    var w = 1 / (view.scale > 0 ? view.scale : 1);
    return [
      { k: 'poly', pts: pts, closed: true, w: w, dash: [8 * w, 8 * w], col: OVERLAY_COL },
      { k: 'dot', x: cx, y: cy, r: 2.5 * w, col: 'rgba(168,184,232,0.8)' }
    ];
  }

  /* =====================================================================
     1) zellautomat — Game of Life (sparse Set, entkoppelte Tickrate)
     ===================================================================== */

  var GOL_SEED = 0x0f11fe;
  var GOL_MAX_CELLS = 4000;      // Kappe gegen Explosion
  var GOL_MAX_STEPS = 4;         // max Sim-Schritte pro Frame (Drossel)
  // Integer-Key wie in der Referenz (game0f1ife-worker.js)
  var GOL_OFF = 0x8000;          // Koordinaten ±32768 Zellen reichen locker
  var GOL_RANGE = 0x10000;

  function golKey(x, y) { return (x + GOL_OFF) + (y + GOL_OFF) * GOL_RANGE; }
  function golX(key) { return (key % GOL_RANGE) - GOL_OFF; }
  function golY(key) { return Math.floor(key / GOL_RANGE) - GOL_OFF; }

  // Original-Pattern-Bibliothek aus game0f1ife.html (LifeWiki-verifiziert),
  // 1:1 übernommen — gerendert vom controls.js addPatternPicker
  var GOL_PATTERNS = [
    // Still Lifes
    { id: 'block', name: 'Block', cells: [[0,0],[1,0],[0,1],[1,1]] },
    { id: 'beehive', name: 'Beehive', cells: [[1,0],[2,0],[0,1],[3,1],[1,2],[2,2]] },
    { id: 'loaf', name: 'Loaf', cells: [[1,0],[2,0],[0,1],[3,1],[1,2],[3,2],[2,3]] },
    { id: 'boat', name: 'Boat', cells: [[0,0],[1,0],[0,1],[2,1],[1,2]] },
    { id: 'tub', name: 'Tub', cells: [[1,0],[0,1],[2,1],[1,2]] },
    // Oscillators
    { id: 'blinker', name: 'Blinker', cells: [[0,0],[1,0],[2,0]] },
    { id: 'toad', name: 'Toad', cells: [[1,0],[2,0],[3,0],[0,1],[1,1],[2,1]] },
    { id: 'beacon', name: 'Beacon', cells: [[0,0],[1,0],[0,1],[1,1],[2,2],[3,2],[2,3],[3,3]] },
    { id: 'clock', name: 'Clock', cells: [[2,0],[0,1],[2,1],[1,2],[3,2],[1,3]] },
    { id: 'pulsar', name: 'Pulsar', cells: [
      [2,0],[3,0],[4,0],[8,0],[9,0],[10,0],
      [0,2],[5,2],[7,2],[12,2],
      [0,3],[5,3],[7,3],[12,3],
      [0,4],[5,4],[7,4],[12,4],
      [2,5],[3,5],[4,5],[8,5],[9,5],[10,5],
      [2,7],[3,7],[4,7],[8,7],[9,7],[10,7],
      [0,8],[5,8],[7,8],[12,8],
      [0,9],[5,9],[7,9],[12,9],
      [0,10],[5,10],[7,10],[12,10],
      [2,12],[3,12],[4,12],[8,12],[9,12],[10,12]
    ] },
    { id: 'pentadecathlon', name: 'Pentadecathlon', cells: [
      [1,0],[2,0],[3,0],[0,1],[4,1],[0,2],[4,2],[1,3],[2,3],[3,3],
      [1,6],[2,6],[3,6],[0,7],[4,7],[0,8],[4,8],[1,9],[2,9],[3,9]
    ] },
    // Spaceships
    { id: 'glider', name: 'Glider', cells: [[1,0],[2,1],[0,2],[1,2],[2,2]] },
    { id: 'lwss', name: 'LWSS', cells: [
      [1,0],[2,0],[3,0],[4,0],[0,1],[4,1],[4,2],[0,3],[3,3]
    ] },
    { id: 'mwss', name: 'MWSS', cells: [
      [1,0],[2,0],[3,0],[4,0],[5,0],[0,1],[5,1],[5,2],[0,3],[4,3],[2,4]
    ] },
    { id: 'hwss', name: 'HWSS', cells: [
      [1,0],[2,0],[3,0],[4,0],[5,0],[6,0],[0,1],[6,1],[6,2],[0,3],[5,3],[2,4],[3,4]
    ] },
    // Methuselahs
    { id: 'rpentomino', name: 'R-pentomino', cells: [[1,0],[2,0],[0,1],[1,1],[1,2]] },
    { id: 'acorn', name: 'Acorn', cells: [[1,0],[3,1],[0,2],[1,2],[4,2],[5,2],[6,2]] },
    { id: 'diehard', name: 'Diehard', cells: [[6,0],[0,1],[1,1],[1,2],[5,2],[6,2],[7,2]] },
    { id: 'bheptomino', name: 'B-heptomino', cells: [[0,0],[1,0],[2,0],[0,1],[1,1],[2,2],[1,3]] },
    // Gun (Gosper Glider Gun)
    { id: 'glidergun', name: 'Glider Gun', cells: [
      [0,4],[0,5],[1,4],[1,5],
      [10,4],[10,5],[10,6],[11,3],[11,7],[12,2],[12,8],[13,2],[13,8],
      [14,5],[15,3],[15,7],[16,4],[16,5],[16,6],[17,5],
      [20,2],[20,3],[20,4],[21,2],[21,3],[21,4],[22,1],[22,5],
      [24,0],[24,1],[24,5],[24,6],
      [34,2],[34,3],[35,2],[35,3]
    ] },
    // Puffer 1 (Bill Gosper's puffer train)
    { id: 'puffer1', name: 'Puffer 1', cells: [
      [0,0],[0,1],[0,2],[0,3],[0,4],[1,0],[1,4],[2,4],[3,0],[3,3],
      [5,1],[5,2],[6,1],[6,2],[7,2]
    ] },
    // Spaceship flotilla
    { id: 'flotilla', name: 'Flotilla', cells: [
      [1,0],[2,0],[3,0],[4,0],[0,1],[4,1],[4,2],[0,3],[3,3],
      [1,6],[2,6],[3,6],[4,6],[0,7],[4,7],[4,8],[0,9],[3,9]
    ] }
  ];

  function golFindPattern(id) {
    if (!id) return null;
    for (var i = 0; i < GOL_PATTERNS.length; i++) {
      if (GOL_PATTERNS[i].id === id) return GOL_PATTERNS[i];
    }
    return null;
  }

  // Pattern zentriert als Start-Population setzen (statt Zufalls-Suppe)
  function golSeedPattern(st, pattern) {
    var cells = pattern.cells;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    var i;
    for (i = 0; i < cells.length; i++) {
      if (cells[i][0] < minX) minX = cells[i][0];
      if (cells[i][0] > maxX) maxX = cells[i][0];
      if (cells[i][1] < minY) minY = cells[i][1];
      if (cells[i][1] > maxY) maxY = cells[i][1];
    }
    var ox = Math.round((minX + maxX) / 2);
    var oy = Math.round((minY + maxY) / 2);
    for (i = 0; i < cells.length; i++) {
      st.cells.add(golKey(cells[i][0] - ox, cells[i][1] - oy));
    }
  }

  // Start-Population nach params: gewähltes Pattern oder Zufalls-Suppe
  function golSeed(st, params) {
    var pattern = golFindPattern(params.pattern);
    if (pattern) golSeedPattern(st, pattern);
    else golSeedSoup(st, params);
  }

  // zufällige Suppe im Streuradius (deterministisch über rng)
  function golSeedSoup(st, params) {
    var cellSize = Math.max(1, Number(params.cellSize) || 1);
    var rCells = Math.max(1, (Number(params.radius) || 0) / cellSize);
    var count = Math.min(GOL_MAX_CELLS, Math.floor(Math.PI * rCells * rCells * 0.32));
    if (count < 4) count = 4;
    for (var i = 0; i < count; i++) {
      var rr = Math.sqrt(mulberry32Next(st.rng)) * rCells;
      var aa = mulberry32Next(st.rng) * TAU;
      st.cells.add(golKey(Math.round(Math.cos(aa) * rr), Math.round(Math.sin(aa) * rr)));
    }
  }

  // eine Generation: Batch-Nachbarzählung über Map (nur lebende Zellen
  // + deren Nachbarn werden angefasst) — Algorithmus aus der Referenz
  function golStep(st, params) {
    var birth = Math.round(clamp(params.birth, 0, 8));
    var sMin = Math.round(clamp(params.survMin, 0, 8));
    var sMax = Math.round(clamp(params.survMax, 0, 8));
    if (sMax < sMin) { var tmp = sMin; sMin = sMax; sMax = tmp; }
    var death = clamp(params.death, 0, 100) / 100;

    var cells = st.cells;
    var counts = new Map();
    cells.forEach(function (key) {
      var x = golX(key), y = golY(key);
      for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          var nk = golKey(x + dx, y + dy);
          counts.set(nk, (counts.get(nk) || 0) + 1);
        }
      }
    });

    var next = new Set();
    counts.forEach(function (count, key) {
      var alive = cells.has(key);
      var willLive = alive
        ? (count >= sMin && count <= sMax)
        : (count === birth);
      if (willLive && death > 0 && mulberry32Next(st.rng) < death) willLive = false;
      if (willLive) next.add(key);
    });
    // isolierte Zellen (0 Nachbarn) sterben — außer Überleben-min ist 0
    if (sMin === 0) {
      cells.forEach(function (key) {
        if (!counts.has(key) &&
            !(death > 0 && mulberry32Next(st.rng) < death)) {
          next.add(key);
        }
      });
    }
    st.cells = next;

    // Spontanleben: zufällige Funken im Streuradius (belebt auch eine
    // komplett tote Suppe wieder) — erwartete Funken/Schritt = Rate% * 0.4
    var spont = clamp(params.spont, 0, 100) / 100;
    if (spont > 0) {
      st.spontAcc += spont * 40;
      var sparks = Math.floor(st.spontAcc);
      st.spontAcc -= sparks;
      if (sparks > 0) {
        var cellSize = Math.max(1, Number(params.cellSize) || 1);
        var rCells = Math.max(1, (Number(params.radius) || 0) / cellSize);
        for (var i = 0; i < sparks; i++) {
          var rr = Math.sqrt(mulberry32Next(st.rng)) * rCells;
          var aa = mulberry32Next(st.rng) * TAU;
          st.cells.add(golKey(Math.round(Math.cos(aa) * rr), Math.round(Math.sin(aa) * rr)));
        }
      }
    }

    // Kappe: älteste Einträge (Insertion-Order des Sets) fallen zuerst
    if (st.cells.size > GOL_MAX_CELLS) {
      var drop = st.cells.size - GOL_MAX_CELLS;
      var it = st.cells.values();
      while (drop-- > 0) st.cells.delete(it.next().value);
    }
  }

  OneCanvas.registerBlock({
    type: 'zellautomat',
    kind: 'erzeuger',
    label: 'Zell-Automat',
    icon: '▚',
    schema: [
      // Original-Patterns (game0f1ife): Wahl ersetzt die Start-Suppe,
      // null/'Zeichnen'-Kachel = Zufalls-Suppe im Streuradius
      { key: 'pattern', ctrl: 'patterns', label: 'Start-Muster', value: null, patterns: GOL_PATTERNS },
      { key: 'tick', ctrl: 'slider', label: 'Schritte pro Sekunde', min: 0, max: 60, step: 0.5, value: 8, decimals: 1, unit: '/s' },
      { key: 'birth', ctrl: 'slider', label: 'Geburt bei Nachbarn', min: 0, max: 8, step: 1, value: 3 },
      { key: 'survMin', ctrl: 'slider', label: 'Überleben min', min: 0, max: 8, step: 1, value: 2 },
      { key: 'survMax', ctrl: 'slider', label: 'Überleben max', min: 0, max: 8, step: 1, value: 3 },
      { key: 'spont', ctrl: 'slider', label: 'Spontanleben', min: 0, max: 5, step: 0.05, value: 0.6, decimals: 2, unit: '%' },
      { key: 'death', ctrl: 'slider', label: 'Zufallstod', min: 0, max: 5, step: 0.05, value: 0, decimals: 2, unit: '%' },
      { key: 'symbol', ctrl: 'text', label: 'Zellsymbol (leer = Punkte)', value: '', maxlen: 8 },
      { key: 'cellSize', ctrl: 'slider', label: 'Zellgröße', min: 2, max: 80, step: 1, value: 12 },
      { key: 'radius', ctrl: 'slider', label: 'Streuradius', min: 0, max: 2000, step: 10, value: 320 },
      { key: 'x', ctrl: 'slider', label: 'X', min: -2000, max: 2000, step: 1, value: 0 },
      { key: 'y', ctrl: 'slider', label: 'Y', min: -2000, max: 2000, step: 1, value: 0 }
    ],
    init: function (block) {
      var st = block.state = {
        cells: new Set(),
        rng: { s: GOL_SEED },
        acc: 0,
        spontAcc: 0,
        patternSig: String(block.params.pattern || '')
      };
      golSeed(st, block.params); // load(): params sind hier schon gemerged
    },
    emit: function (block, t, dt, view) {
      var p = block.params;
      var st = block.state;
      if (!st || !st.cells) {
        st = block.state = {
          cells: new Set(), rng: { s: GOL_SEED }, acc: 0, spontAcc: 0,
          patternSig: String(p.pattern || '')
        };
        golSeed(st, p);
      }

      // Pattern-Wechsel im Panel: Start-Population live neu setzen
      var patSig = String(p.pattern || '');
      if (st.patternSig !== patSig) {
        st.patternSig = patSig;
        st.cells = new Set();
        golSeed(st, p);
      }

      // Sim-Tick entkoppelt vom Render: Schritte/s akkumulieren, pro
      // Frame max GOL_MAX_STEPS ausführen, Rest verwerfen (kein Backlog)
      var tick = Math.max(0, Number(p.tick) || 0); // frei, Drossel = GOL_MAX_STEPS
      st.acc += tick * dt;
      var steps = Math.floor(st.acc);
      st.acc -= steps;
      if (steps > GOL_MAX_STEPS) steps = GOL_MAX_STEPS;
      for (var s = 0; s < steps; s++) golStep(st, p);

      var cellSize = Math.max(1, Number(p.cellSize) || 1);
      var px = Number(p.x) || 0, py = Number(p.y) || 0;
      var sym = String(p.symbol == null ? '' : p.symbol).trim();
      var prims = [];
      if (sym) {
        var gs = cellSize * 0.85;
        st.cells.forEach(function (key) {
          prims.push({
            k: 'glyph', ch: sym,
            x: px + golX(key) * cellSize, y: py + golY(key) * cellSize,
            size: gs, rot: 0, col: INK, glow: 0
          });
        });
      } else {
        var r = cellSize * 0.34;
        st.cells.forEach(function (key) {
          prims.push({
            k: 'dot',
            x: px + golX(key) * cellSize, y: py + golY(key) * cellSize,
            r: r, col: INK, glow: 0
          });
        });
      }
      return prims;
    },
    // Zentrum-Handle (Muster wie strahlen)
    hit: function (block, wx, wy, view) {
      var dx = wx - (Number(block.params.x) || 0);
      var dy = wy - (Number(block.params.y) || 0);
      var r = Math.max(40, 24 / view.scale);
      return (dx * dx + dy * dy <= r * r) ? 'move' : null;
    },
    drag: function (block, handle, dwx, dwy) {
      if (handle !== 'move') return;
      var p = block.params;
      p.x = (Number(p.x) || 0) + dwx;
      p.y = (Number(p.y) || 0) + dwy;
    },
    overlay: function (block, t, view) {
      var p = block.params;
      return radiusOverlay(p.radius, view, Number(p.x) || 0, Number(p.y) || 0);
    }
  });

  /* =====================================================================
     2) strahlen — Strahlenbüschel (Referenz: whitelines.html)
     ===================================================================== */

  var RAY_SEED = 0x11fe5;
  var RAY_MAX = 2000;        // Winkelliste kappen
  var RAY_SEGS = 6;          // Zwischenpunkte pro Linie (warp-biegbar)

  OneCanvas.registerBlock({
    type: 'strahlen',
    kind: 'erzeuger',
    label: 'Strahlenbüschel',
    icon: '✶',
    schema: [
      { key: 'perFrame', ctrl: 'slider', label: 'Linien pro Frame', min: 0, max: 20, step: 0.5, value: 1, decimals: 1 },
      { key: 'stop', ctrl: 'toggle', label: 'Keine neuen', value: false },
      { key: 'reroll', ctrl: 'toggle', label: 'Winkel neu würfeln', value: false },
      { key: 'width', ctrl: 'slider', label: 'Linienstärke', min: 0.1, max: 12, step: 0.1, value: 1, decimals: 1 },
      { key: 'length', ctrl: 'slider', label: 'Länge', min: 0, max: 4000, step: 10, value: 900 },
      { key: 'x', ctrl: 'slider', label: 'X', min: -2000, max: 2000, step: 1, value: 0 },
      { key: 'y', ctrl: 'slider', label: 'Y', min: -2000, max: 2000, step: 1, value: 0 }
    ],
    init: function (block) {
      block.state = { angles: [], rng: { s: RAY_SEED }, acc: 0 };
    },
    emit: function (block, t, dt, view) {
      var p = block.params;
      var st = block.state;
      if (!st || !st.angles) {
        st = block.state = { angles: [], rng: { s: RAY_SEED }, acc: 0 };
      }

      if (!p.stop) {
        st.acc += clamp(p.perFrame, 0, 200);
        var births = Math.floor(st.acc);
        st.acc -= births;
        for (var b = 0; b < births; b++) {
          st.angles.push(mulberry32Next(st.rng) * TAU);
        }
        if (st.angles.length > RAY_MAX) {
          st.angles.splice(0, st.angles.length - RAY_MAX);
        }
      }
      if (p.reroll) {
        for (var i = 0; i < st.angles.length; i++) {
          st.angles[i] = mulberry32Next(st.rng) * TAU;
        }
      }

      var cx = Number(p.x) || 0, cy = Number(p.y) || 0;
      var len = Number(p.length) || 0; // frei: negativ = Gegenrichtung
      var w = Math.max(0, Number(p.width) || 0); // 0 = unsichtbar
      var prims = [];
      if (!len || !(w > 0)) return prims;
      for (var j = 0; j < st.angles.length; j++) {
        var a = st.angles[j];
        var dx = Math.cos(a), dy = Math.sin(a);
        // Zwischenpunkte, damit warp die Strahlen biegen kann
        var pts = new Array((RAY_SEGS + 1) * 2);
        for (var k = 0; k <= RAY_SEGS; k++) {
          var f = (k / RAY_SEGS) * len;
          pts[2 * k] = cx + dx * f;
          pts[2 * k + 1] = cy + dy * f;
        }
        // einheitlicher Stil => Engine fasst alle Linien zu EINEM
        // Path2D-Stroke zusammen (billig auch bei 2000 Strahlen)
        prims.push({ k: 'poly', pts: pts, closed: false, w: w, col: INK_SOFT, glow: 0 });
      }
      return prims;
    },
    hit: function (block, wx, wy, view) {
      var dx = wx - (Number(block.params.x) || 0);
      var dy = wy - (Number(block.params.y) || 0);
      var r = Math.max(40, 24 / view.scale);
      return (dx * dx + dy * dy <= r * r) ? 'move' : null;
    },
    drag: function (block, handle, dwx, dwy) {
      if (handle !== 'move') return;
      block.params.x = (Number(block.params.x) || 0) + dwx;
      block.params.y = (Number(block.params.y) || 0) + dwy;
    },
    overlay: function (block, t, view) {
      var w = 1 / (view.scale > 0 ? view.scale : 1);
      var cx = Number(block.params.x) || 0, cy = Number(block.params.y) || 0;
      return [
        { k: 'dot', x: cx, y: cy, r: 3 * w, col: 'rgba(168,184,232,0.8)' }
      ];
    }
  });

  /* =====================================================================
     3) ringschrift — Zeichensequenz auf Ring oder Spirale
     (Referenz: kreisausdingen.html + kreisausdingen-goes-spiral.html)

     Als DING registriert: kein State nötig, die Rotationsphase kommt
     direkt aus t * Drehgeschwindigkeit. Bei Drehgeschwindigkeit 0 ist der
     Baustein zeit-invariant => Layer-Cache der Engine greift.
     ===================================================================== */

  // die ersten 200 Nachkommastellen von Pi als Sofort-Startwert; alles
  // darüber rechnet ringPiEnsure on demand mit decimal.js nach
  var PI_TEXT = '3.' +
    '14159265358979323846' + '26433832795028841971' +
    '69399375105820974944' + '59230781640628620899' +
    '86280348253421170679' + '82148086513282306647' +
    '09384460955058223172' + '53594081284811174502' +
    '84102701938521105559' + '64462294895493038196';

  var RING_MAX_CHARS = 2000;
  var PI_MAX_DIGITS = RING_MAX_CHARS; // echtes Budget: mehr würde eh gekappt

  /* ---- echtes Pi on demand (decimal.js, Machin-Formel, chunked) ----
   * π = 16·arctan(1/5) − 4·arctan(1/239). Die arctan-Reihen laufen in
   * ~12ms-Häppchen über setTimeout, damit auch 1000+ Stellen die UI nie
   * einfrieren. Cache modulweit (Pi ist Pi); während einer laufenden
   * Berechnung rendert die Ringschrift den bisherigen Stand und ist
   * zeitvariant (Layer-Cache pausiert, greift nach Fertigstellung neu). */

  var piCache = { digits: 200, text: PI_TEXT };
  var piPending = false;
  var piWantDigits = 0;

  function piArctanInv(D, x, nDigits, cb) {
    var xsqInv = new D(1).div(x * x);
    var term = new D(1).div(x);
    var sum = new D(term);
    var k = 1;
    var sign = -1;
    function stepChunk() {
      var deadline = Date.now() + 12;
      while (Date.now() < deadline) {
        term = term.times(xsqInv);
        var add = term.div(2 * k + 1);
        sum = sign > 0 ? sum.plus(add) : sum.minus(add);
        sign = -sign;
        k++;
        if (add.e < -(nDigits + 4)) { cb(sum); return; }
      }
      setTimeout(stepChunk, 0);
    }
    stepChunk();
  }

  function ringPiEnsure(nDigits) {
    nDigits = Math.min(PI_MAX_DIGITS, Math.max(1, Math.round(nDigits)));
    if (piCache.digits >= nDigits) return;
    piWantDigits = Math.max(piWantDigits, nDigits);
    if (piPending) return;
    if (!window.Decimal) {
      console.warn('0necanvas ringschrift: decimal.js fehlt — Pi bleibt bei ' + piCache.digits + ' Stellen');
      return;
    }
    piPending = true;
    var want = piWantDigits;
    var D = window.Decimal.clone({ precision: want + 12 });
    piArctanInv(D, 5, want, function (a5) {
      piArctanInv(D, 239, want, function (a239) {
        try {
          var pi = a5.times(16).minus(a239.times(4));
          piCache = { digits: want, text: pi.toFixed(want) };
        } catch (e) {
          console.error('0necanvas ringschrift: Pi-Berechnung fehlgeschlagen', e);
        }
        piPending = false;
        if (piWantDigits > piCache.digits) ringPiEnsure(piWantDigits);
      });
    });
  }

  function ringPiText(nDigits) {
    nDigits = Math.min(PI_MAX_DIGITS, Math.max(1, Math.round(nDigits)));
    if (piCache.digits < nDigits) {
      ringPiEnsure(nDigits);
      return piCache.text; // bisheriger Stand, bis die Berechnung fertig ist
    }
    return piCache.text.slice(0, nDigits + 2); // '3.' + n Nachkommastellen
  }

  function ringChars(str, piDigits) {
    var s = String(str == null ? '' : str);
    // Array.from: Unicode-korrekt (Surrogate-Paare bleiben ganz)
    var arr = Array.from(s.replace(/\s+/g, ''));
    if (!arr.length) arr = Array.from(ringPiText(piDigits));
    if (arr.length > RING_MAX_CHARS) arr.length = RING_MAX_CHARS;
    return arr;
  }

  OneCanvas.registerBlock({
    type: 'ringschrift',
    kind: 'ding',
    label: 'Ring-Schrift',
    icon: '◌',
    schema: [
      { key: 'text', ctrl: 'text', label: 'Text (leer = π)', value: '', maxlen: 2100 },
      { key: 'ziffern', ctrl: 'slider', label: 'π-Ziffern', min: 1, max: 1000, step: 1, value: 200 },
      {
        key: 'mode', ctrl: 'select', label: 'Anordnung',
        options: [
          { value: 'ring', label: 'Ring' },
          { value: 'spirale', label: 'Spirale' }
        ],
        value: 'spirale'
      },
      { key: 'radius', ctrl: 'slider', label: 'Radius', min: 0, max: 2000, step: 1, value: 120 },
      { key: 'wind', ctrl: 'slider', label: 'Windungsabstand', min: -200, max: 200, step: 1, value: 34 },
      { key: 'size', ctrl: 'slider', label: 'Zeichengröße', min: 4, max: 160, step: 1, value: 22 },
      { key: 'rotChar', ctrl: 'slider', label: 'Rotation je Zeichen', min: -180, max: 180, step: 1, value: 0, unit: '°' },
      { key: 'speed', ctrl: 'slider', label: 'Drehgeschwindigkeit', min: -180, max: 180, step: 1, value: 6, unit: '°/s' },
      { key: 'x', ctrl: 'slider', label: 'X', min: -2000, max: 2000, step: 1, value: 0 },
      { key: 'y', ctrl: 'slider', label: 'Y', min: -2000, max: 2000, step: 1, value: 0 }
    ],
    timeInvariant: function (block) {
      if (Number(block.params.speed)) return false;
      // Pi-Bedarf HIER anmelden (läuft vor emit): solange die gewünschten
      // Ziffern fehlen, live rendern — sonst schreibt der Layer-Cache den
      // alten Ziffern-Stand unter der neuen Param-Signatur fest
      var s = String(block.params.text == null ? '' : block.params.text);
      if (!s.replace(/\s+/g, '').length) {
        var want = Math.min(PI_MAX_DIGITS, Math.max(1, Math.round(Number(block.params.ziffern) || 200)));
        if (piCache.digits < want) {
          ringPiEnsure(want);
          return false;
        }
      }
      return true;
    },
    emit: function (block, t) {
      var p = block.params;
      var chars = ringChars(p.text, Number(p.ziffern) || 200);
      var n = chars.length;
      var cx = Number(p.x) || 0, cy = Number(p.y) || 0;
      var size = Math.max(0, Number(p.size) || 0); // 0 = unsichtbar klein
      // Radius frei: negativ invertiert (Punkt liegt am Gegenwinkel) —
      // cos/sin mit negativem r leisten das von selbst, kein Math.max(1)
      var radius = Number(p.radius) || 0;
      var extraRot = (Number(p.rotChar) || 0) * DEG;
      var phase = ((Number(p.speed) || 0) * DEG) * t - Math.PI / 2;

      var prims = [];
      var i, ang, r, gx, gy;
      if (p.mode === 'spirale') {
        // Archimedische Spirale mit konstantem Bogenabstand zwischen den
        // Zeichen: r wächst um `wind` pro voller Windung
        var wind = Number(p.wind) || 0;
        var spacing = Math.max(size * 1.12, 2);
        ang = 0;
        for (i = 0; i < n; i++) {
          r = radius + wind * (ang / TAU);
          var a = ang + phase;
          gx = cx + Math.cos(a) * r;
          gy = cy + Math.sin(a) * r;
          prims.push({
            k: 'glyph', ch: chars[i], x: gx, y: gy, size: size,
            rot: a + Math.PI / 2 + extraRot, col: INK, glow: 0
          });
          // Schrittweite über |r| (mit Untergrenze), sonst Endlos-Stau bei r~0
          ang += spacing / Math.max(1, Math.abs(r));
        }
      } else {
        // Ring: gleichmäßig verteilt (wie die Referenz)
        r = radius;
        for (i = 0; i < n; i++) {
          ang = (i / n) * TAU + phase;
          gx = cx + Math.cos(ang) * r;
          gy = cy + Math.sin(ang) * r;
          prims.push({
            k: 'glyph', ch: chars[i], x: gx, y: gy, size: size,
            rot: ang + Math.PI / 2 + extraRot, col: INK, glow: 0
          });
        }
      }
      return prims;
    },
    hit: function (block, wx, wy, view) {
      var p = block.params;
      var dx = wx - (Number(p.x) || 0);
      var dy = wy - (Number(p.y) || 0);
      var outer = Math.abs(Number(p.radius) || 0);
      if (p.mode === 'spirale') {
        outer += Math.abs(Number(p.wind) || 0) * 6; // grob: einige Windungen
      }
      var r = outer + Math.max(0, Number(p.size) || 0) + 12 / view.scale;
      return (dx * dx + dy * dy <= r * r) ? 'move' : null;
    },
    drag: function (block, handle, dwx, dwy) {
      if (handle !== 'move') return;
      block.params.x = (Number(block.params.x) || 0) + dwx;
      block.params.y = (Number(block.params.y) || 0) + dwy;
    },
    overlay: function (block, t, view) {
      var p = block.params;
      return radiusOverlay(Math.abs(Number(p.radius) || 0), view, Number(p.x) || 0, Number(p.y) || 0);
    }
  });

  /* =====================================================================
     4) textbaum — wuchernder Text-Baum (Referenz: n0thingsp1s.html)
     ===================================================================== */

  var TREE_SEED = 0x7ee5;
  var TREE_MAX_NODES = 1500;
  var TREE_TICK = 8;            // Sim-Schritte/s (Chancen gelten pro Schritt)
  var TREE_MAX_STEPS = 3;       // Drossel pro Frame
  var TREE_FADE_IN = 0.6;       // s

  function treeState() {
    return {
      nodes: new Map(),         // id -> node
      nextId: 1,
      rng: { s: TREE_SEED },
      acc: 0,
      simT: 0
    };
  }

  function treeSpawnRoot(st, params) {
    var radius = Math.max(0, Number(params.radius) || 0);
    var toks = tokensFromParam(params.tokens, ['∞']);
    var rr = Math.sqrt(mulberry32Next(st.rng)) * radius;
    var aa = mulberry32Next(st.rng) * TAU;
    var id = st.nextId++;
    st.nodes.set(id, {
      id: id,
      ch: toks[Math.floor(mulberry32Next(st.rng) * toks.length) % toks.length],
      x: Math.cos(aa) * rr, y: Math.sin(aa) * rr,
      parent: 0, children: [], born: st.simT
    });
    return id;
  }

  function treeSpawnChild(st, parent, params) {
    var toks = tokensFromParam(params.tokens, ['∞']);
    var spacing = clamp(params.spacing, 0, 4000);
    var ang = mulberry32Next(st.rng) * TAU;
    var id = st.nextId++;
    var node = {
      id: id,
      ch: toks[Math.floor(mulberry32Next(st.rng) * toks.length) % toks.length],
      x: parent.x + Math.cos(ang) * spacing,
      y: parent.y + Math.sin(ang) * spacing,
      parent: parent.id, children: [], born: st.simT
    };
    parent.children.push(id);
    st.nodes.set(id, node);
  }

  // Teilbaum iterativ töten (Rekursionstiefe unbegrenzt vermeiden)
  function treeKill(st, node) {
    var stack = [node.id];
    while (stack.length) {
      var id = stack.pop();
      var n = st.nodes.get(id);
      if (!n) continue;
      for (var i = 0; i < n.children.length; i++) stack.push(n.children[i]);
      st.nodes.delete(id);
    }
    var p = st.nodes.get(node.parent);
    if (p) {
      var idx = p.children.indexOf(node.id);
      if (idx >= 0) p.children.splice(idx, 1);
    }
  }

  function treeStep(st, params) {
    st.simT += 1 / TREE_TICK;
    var spawnC = clamp(params.spawnChance, 0, 100) / 100;
    var childC = clamp(params.childChance, 0, 100) / 100;
    var deathC = clamp(params.deathChance, 0, 100) / 100;
    var maxKids = Math.round(clamp(params.maxChildren, 0, 32));

    // 1) neue Wurzel aus dem Nichts
    if (st.nodes.size < TREE_MAX_NODES && mulberry32Next(st.rng) < spawnC) {
      treeSpawnRoot(st, params);
    }

    // 2) pro Node: Sterbe-Check, dann Kind-Check (Snapshot, wie Referenz)
    var snapshot = Array.from(st.nodes.values());
    for (var i = 0; i < snapshot.length; i++) {
      var node = snapshot[i];
      if (!st.nodes.has(node.id)) continue; // schon mit Teilbaum gestorben
      if (deathC > 0 && mulberry32Next(st.rng) < deathC) {
        treeKill(st, node);
        continue;
      }
      if (node.children.length < maxKids &&
          st.nodes.size < TREE_MAX_NODES &&
          mulberry32Next(st.rng) < childC) {
        treeSpawnChild(st, node, params);
      }
    }
  }

  OneCanvas.registerBlock({
    type: 'textbaum',
    kind: 'erzeuger',
    label: 'Text-Baum',
    icon: '⑂',
    schema: [
      { key: 'tokens', ctrl: 'text', label: 'Tokens (Leerzeichen-getrennt)', value: '0 1 ∞', maxlen: 64 },
      // Defaults so, dass nach ~2s ein sichtbarer Baum steht
      { key: 'spawnChance', ctrl: 'slider', label: 'Wurzel-Chance', min: 0, max: 100, step: 0.5, value: 16, decimals: 1, unit: '%' },
      { key: 'childChance', ctrl: 'slider', label: 'Kind-Chance', min: 0, max: 100, step: 0.5, value: 22, decimals: 1, unit: '%' },
      { key: 'deathChance', ctrl: 'slider', label: 'Sterbe-Chance', min: 0, max: 100, step: 0.5, value: 2.5, decimals: 1, unit: '%' },
      { key: 'maxChildren', ctrl: 'slider', label: 'Max Kinder', min: 0, max: 12, step: 1, value: 3 },
      { key: 'spacing', ctrl: 'slider', label: 'Abstand', min: 4, max: 400, step: 1, value: 46 },
      { key: 'size', ctrl: 'slider', label: 'Zeichengröße', min: 4, max: 120, step: 1, value: 26 },
      { key: 'radius', ctrl: 'slider', label: 'Streuradius', min: 0, max: 2000, step: 10, value: 480 },
      { key: 'edges', ctrl: 'toggle', label: 'Verbindungslinien', value: true },
      { key: 'x', ctrl: 'slider', label: 'X', min: -2000, max: 2000, step: 1, value: 0 },
      { key: 'y', ctrl: 'slider', label: 'Y', min: -2000, max: 2000, step: 1, value: 0 }
    ],
    init: function (block) {
      var st = block.state = treeState();
      // sofort lebendig: ein paar Wurzeln + einige Vorab-Schritte
      for (var i = 0; i < 4; i++) treeSpawnRoot(st, block.params);
      for (var s = 0; s < 8; s++) treeStep(st, block.params);
    },
    emit: function (block, t, dt, view) {
      var p = block.params;
      var st = block.state;
      if (!st || !st.nodes) st = block.state = treeState();

      st.acc += TREE_TICK * dt;
      var steps = Math.floor(st.acc);
      st.acc -= steps;
      if (steps > TREE_MAX_STEPS) steps = TREE_MAX_STEPS;
      for (var s = 0; s < steps; s++) treeStep(st, p);
      // Zeit auch zwischen Schritten weich weiterlaufen lassen (Fade-In)
      var simNow = st.simT + st.acc / TREE_TICK;

      var size = Math.max(0, Number(p.size) || 0); // 0 = unsichtbar klein
      var px = Number(p.x) || 0, py = Number(p.y) || 0;
      var edgeW = 0.7;
      var prims = [];
      var edges = !!p.edges;
      st.nodes.forEach(function (node) {
        var a = Math.min(1, (simNow - node.born) / TREE_FADE_IN);
        // quantisiert, damit die Engine gleichaltrige Kanten zu einem
        // Stil-Group/Path2D zusammenfassen kann (weniger Strokes)
        a = Math.ceil(a * 8) / 8;
        if (a <= 0.01) a = 0.125;
        if (edges && node.parent) {
          var par = st.nodes.get(node.parent);
          if (par) {
            // Mittelpunkt als Zwischenpunkt, damit warp die Kante biegt
            prims.push({
              k: 'poly',
              pts: [px + par.x, py + par.y,
                    px + (par.x + node.x) / 2, py + (par.y + node.y) / 2,
                    px + node.x, py + node.y],
              closed: false, w: edgeW, col: EDGE_COL, glow: 0, _alpha: a
            });
          }
        }
        prims.push({
          k: 'glyph', ch: node.ch, x: px + node.x, y: py + node.y,
          size: size, rot: 0, col: INK, glow: 0, _alpha: a
        });
      });
      return prims;
    },
    // Zentrum-Handle (Muster wie strahlen)
    hit: function (block, wx, wy, view) {
      var dx = wx - (Number(block.params.x) || 0);
      var dy = wy - (Number(block.params.y) || 0);
      var r = Math.max(40, 24 / view.scale);
      return (dx * dx + dy * dy <= r * r) ? 'move' : null;
    },
    drag: function (block, handle, dwx, dwy) {
      if (handle !== 'move') return;
      var p = block.params;
      p.x = (Number(p.x) || 0) + dwx;
      p.y = (Number(p.y) || 0) + dwy;
    },
    overlay: function (block, t, view) {
      var p = block.params;
      return radiusOverlay(p.radius, view, Number(p.x) || 0, Number(p.y) || 0);
    }
  });
})();
