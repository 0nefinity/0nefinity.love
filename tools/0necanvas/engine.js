/* 0necanvas engine — window.OneCanvas
 *
 * Block registry + scene + render pipeline with domain-transform forces.
 * See docs/superpowers/plans/2026-07-06-0necanvas-v1-plan.md section 2
 * for the frozen interface this file implements.
 *
 * Conventions:
 * - World coordinates: origin = canvas center, y down, zoom-independent.
 * - Primitive.rot and matrix rotations are RADIANS.
 * - Line widths (poly.w) are world units: they scale with camera zoom and
 *   with affine instance matrices (fractal copies get thinner strokes).
 * - Extension over plan: poly primitives may carry `dash: number[]`
 *   (world units), used by force overlays (dashed radius circle).
 * - Extension over plan: instance entries may be `[a,b,c,d,e,f]` or
 *   `{m:[a,b,c,d,e,f], alpha}` — alpha multiplies the color alpha.
 *
 * Performance architecture (the instance fanout — e.g. fraktal x
 * kaleidoskop — multiplies every draw call, so per-draw cost must be
 * near-constant):
 * - The affine tail of a force chain stays symbolic (matrices), geometry
 *   is only materialized when a non-affine map sits ABOVE instance forces.
 * - Glowing path prims are rendered ONCE per frame into an offscreen
 *   sprite (real shadowBlur) and blitted per instance; shadowBlur never
 *   runs per instance.
 * - Glyphs are drawn from a persistent sprite cache (ch/color/glow/size
 *   bucket) — no per-glyph fillText or shadowBlur in the hot loop.
 * - Non-glowing paths are grouped by style into one Path2D and stroked
 *   with bevel joins; polylines are decimated to sub-pixel tolerance.
 * - Instances that are fully transparent or outside the padded view are
 *   skipped.
 * - Layer cache: emitters whose output is time-invariant (def.timeInvariant,
 *   boolean or predicate(block)) and whose whole force chain is likewise
 *   time-invariant are rendered ONCE into an offscreen layer and blitted
 *   as a single drawImage per frame. This removes the dominant steady-state
 *   cost (e.g. a full-screen grid stroked per fraktal x kaleidoskop
 *   instance). Any param/camera/viewport change invalidates the layer;
 *   continuous changes (drags, slider scrubs) bypass the cache and render
 *   live until the scene settles.
 */
(function () {
  'use strict';

  var INSTANCE_CAP = 1500;
  var ACCENT = '#a8b8e8';
  var GLYPH_FONT = 'Georgia, "Times New Roman", serif';
  var IDENT = [1, 0, 0, 1, 0, 0];

  var ALPHA_SKIP = 0.02;        // instances dimmer than this are invisible on dark bg
  var DECIM_TOL_PX = 0.5;       // device-px tolerance for polyline decimation
  var SPRITE_COST_BUDGET = 4.5e6; // max estimated blit pixels per block per frame
  var SPRITE_MAX_DIM = 2048;    // max block-sprite dimension in px
  var GLYPH_MAX_FONT = 512;     // glyph sprites above this are upscaled on blit
  var GLYPH_CACHE_MAX = 1024;   // entry cap
  var GLYPH_CACHE_MAX_PX = 1.6e7; // total pixel cap across cached sprites
  // small glyphs get rotation baked into the cached sprite and are blitted
  // axis-aligned at integer coords — ~8x cheaper than a transformed blit
  // in software rasterization (measured).
  var GLYPH_SMALL_DEV = 48;     // device-px threshold for the small-glyph path
  var GLYPH_ROT_STEPS = 48;     // 7.5 degree rotation quantization
  var GLYPH_ROT_STEP = Math.PI * 2 / GLYPH_ROT_STEPS;
  var LOG_112 = Math.log(1.12); // fine size buckets (small glyphs)
  var LOG_125 = Math.log(1.25); // coarse size buckets (large glyphs)
  // adaptive instance budget (LOD): the fixed cap is the ceiling, but on
  // slow devices/software raster the effective budget shrinks until the
  // frame time fits, and grows back when there is headroom. Truncation
  // surfaces through the existing instanceLimitHit UI hint.
  var DYN_MIN = 36;
  var FRAME_SLOW_MS = 26;       // shrink above this smoothed frame time
  var FRAME_FAST_MS = 17;       // grow below this (only while capped)
  var FRAME_TARGET_MS = 24;
  // layer cache for time-invariant emitter/force-chain combinations
  var LAYER_MAX = 6;            // max cached full-size layers per scene
  var LAYER_HOT_MS = 300;       // continuous invalidation window -> render live

  var defs = new Map();      // type -> def
  var defOrder = [];         // registration order (library listing)

  /* ---------- matrix helpers (canvas order: x'=ax+cy+e, y'=bx+dy+f) ---------- */

  function matMul(m1, m2) {
    // result applies m2 first, then m1
    return [
      m1[0] * m2[0] + m1[2] * m2[1],
      m1[1] * m2[0] + m1[3] * m2[1],
      m1[0] * m2[2] + m1[2] * m2[3],
      m1[1] * m2[2] + m1[3] * m2[3],
      m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
      m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
    ];
  }

  function matApplyX(m, x, y) { return m[0] * x + m[2] * y + m[4]; }
  function matApplyY(m, x, y) { return m[1] * x + m[3] * y + m[5]; }
  function matRot(m) { return Math.atan2(m[1], m[0]); }
  function matScale(m) { return Math.hypot(m[0], m[1]); }

  /* ---------- color parsing (cached) ----------
   * Splits any CSS color the blocks use (rgba()/rgb()/#hex) into an opaque
   * rgb string + alpha, so alpha can be composed with instance/prim alpha
   * via globalAlpha and sprites can be cached per-rgb. */

  var colCache = new Map();

  function parseCol(col) {
    var c = colCache.get(col);
    if (c) return c;
    var r = 255, g = 255, b = 255, a = 1, m;
    if ((m = /^rgba?\(([^)]+)\)$/.exec(col))) {
      var parts = m[1].split(',');
      r = parseFloat(parts[0]); g = parseFloat(parts[1]); b = parseFloat(parts[2]);
      a = parts.length > 3 ? parseFloat(parts[3]) : 1;
      c = { rgb: 'rgb(' + r + ',' + g + ',' + b + ')', a: a };
    } else if ((m = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/.exec(col))) {
      var v = parseInt(m[1], 16);
      c = {
        rgb: 'rgb(' + ((v >> 16) & 255) + ',' + ((v >> 8) & 255) + ',' + (v & 255) + ')',
        a: m[2] ? parseInt(m[2], 16) / 255 : 1
      };
    } else {
      c = { rgb: col, a: 1 }; // named colors etc.: use as-is, alpha unknown
    }
    if (!isFinite(c.a)) c.a = 1;
    c.a = c.a < 0 ? 0 : (c.a > 1 ? 1 : c.a);
    if (colCache.size > 512) colCache.clear();
    colCache.set(col, c);
    return c;
  }

  /* ---------- glyph sprite cache ---------- */

  var glyphCache = new Map();
  var glyphCachePx = 0;
  var measureCtx = null;

  function glyphBucket(deviceSize, logStep) {
    if (!(deviceSize > 1)) return 2;
    var f = Math.round(Math.exp(Math.round(Math.log(deviceSize) / logStep) * logStep));
    if (f < 2) f = 2;
    if (f > GLYPH_MAX_FONT) f = GLYPH_MAX_FONT;
    return f;
  }

  // rotStep: integer 0..GLYPH_ROT_STEPS-1 to bake rotation into the sprite,
  // or -1 for an unrotated sprite (rotation applied via transform on blit)
  function getGlyphSprite(ch, rgb, glow, fontSize, rotStep) {
    var key = ch + '' + rgb + '' + glow + '' + fontSize + '' + rotStep;
    var spr = glyphCache.get(key);
    if (spr) return spr;

    if (!measureCtx) {
      var mc = document.createElement('canvas');
      mc.width = 8; mc.height = 8;
      measureCtx = mc.getContext('2d');
    }
    var font = '100 ' + fontSize + 'px ' + GLYPH_FONT;
    measureCtx.font = font;
    measureCtx.textAlign = 'center';
    measureCtx.textBaseline = 'middle';
    var met = measureCtx.measureText(ch);
    var hw = Math.max(
      met.width / 2,
      met.actualBoundingBoxLeft || 0,
      met.actualBoundingBoxRight || 0,
      fontSize * 0.3
    );
    var hh = Math.max(
      met.actualBoundingBoxAscent || fontSize * 0.75,
      met.actualBoundingBoxDescent || 0,
      fontSize * 0.4
    );
    var pad = Math.ceil(glow * 1.6 + fontSize * 0.08 + 2);
    var ang = 0;
    if (rotStep >= 0) {
      ang = rotStep * GLYPH_ROT_STEP;
      var ca = Math.abs(Math.cos(ang)), sa = Math.abs(Math.sin(ang));
      var rhw = hw * ca + hh * sa;
      var rhh = hw * sa + hh * ca;
      hw = rhw; hh = rhh;
    }
    var W = Math.min(2048, Math.ceil(hw * 2) + pad * 2);
    var H = Math.min(2048, Math.ceil(hh * 2) + pad * 2);

    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var g = c.getContext('2d');
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = rgb;
    if (glow > 0) {
      g.shadowBlur = glow;
      g.shadowColor = rgb;
    }
    if (ang) {
      g.translate(W / 2, H / 2);
      g.rotate(ang);
      g.fillText(ch, 0, 0);
    } else {
      g.fillText(ch, W / 2, H / 2);
    }

    spr = { c: c, hw: W / 2, hh: H / 2, fontSize: fontSize };
    glyphCachePx += W * H;
    if (glyphCache.size >= GLYPH_CACHE_MAX || glyphCachePx > GLYPH_CACHE_MAX_PX) {
      glyphCache.clear();
      glyphCachePx = W * H;
    }
    glyphCache.set(key, spr);
    return spr;
  }

  /* ---------- block sprite scratch canvas (grow-only, reused) ---------- */

  var scratch = null;
  var scratchCtx = null;

  function getScratch(w, h) {
    if (!scratch) {
      scratch = document.createElement('canvas');
      scratchCtx = scratch.getContext('2d');
    }
    if (scratch.width < w) scratch.width = Math.ceil(w);
    if (scratch.height < h) scratch.height = Math.ceil(h);
    scratchCtx.setTransform(1, 0, 0, 1, 0, 0);
    scratchCtx.clearRect(0, 0, w, h);
    return scratchCtx;
  }

  /* ---------- registry ---------- */

  function registerBlock(def) {
    if (!def || typeof def.type !== 'string' || !def.type) {
      throw new Error('OneCanvas.registerBlock: def.type (string) required');
    }
    if (def.kind !== 'ding' && def.kind !== 'erzeuger' && def.kind !== 'kraft') {
      throw new Error('OneCanvas.registerBlock(' + def.type + '): kind must be ding|erzeuger|kraft');
    }
    if (def.kind === 'kraft' && typeof def.force !== 'function') {
      console.warn('OneCanvas: kraft block "' + def.type + '" has no force()');
    }
    if (def.kind !== 'kraft' && typeof def.emit !== 'function') {
      console.warn('OneCanvas: block "' + def.type + '" has no emit()');
    }
    if (defs.has(def.type)) {
      console.warn('OneCanvas: block type "' + def.type + '" re-registered, overriding');
      var idx = defOrder.findIndex(function (d) { return d.type === def.type; });
      if (idx >= 0) defOrder.splice(idx, 1);
    }
    defs.set(def.type, def);
    defOrder.push(def);
  }

  function blockDefs() {
    return defOrder.slice();
  }

  function defaultsFromSchema(schema) {
    var p = {};
    (schema || []).forEach(function (entry) { p[entry.key] = entry.value; });
    return p;
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  // def.timeInvariant: true, or predicate(block) — declares that emit()/
  // force() output depends only on params (not on t/dt), enabling the
  // layer cache. Absent/false = always live.
  function isTimeInvariant(def, block) {
    var ti = def.timeInvariant;
    if (typeof ti === 'function') {
      try { return !!ti(block); } catch (e) { return false; }
    }
    return ti === true;
  }

  /* ---------- primitive helpers ---------- */

  function clonePrim(p) {
    var c = { k: p.k, col: p.col, glow: p.glow || 0, _alpha: (p._alpha == null ? 1 : p._alpha) };
    if (p.k === 'poly') {
      c.pts = p.pts.slice();
      c.closed = !!p.closed;
      c.w = (p.w == null ? 1 : p.w);
      c.fill = !!p.fill;
      if (p.dash) c.dash = p.dash;
    } else if (p.k === 'glyph') {
      c.ch = p.ch; c.x = p.x; c.y = p.y;
      c.size = p.size; c.rot = p.rot || 0;
    } else if (p.k === 'dot') {
      c.x = p.x; c.y = p.y; c.r = p.r;
    }
    return c;
  }

  // returns a NEW prim: p transformed by instance matrix entry {m, alpha}
  function transformPrim(p, mo) {
    var m = mo.m;
    var c = clonePrim(p);
    c._alpha = (p._alpha == null ? 1 : p._alpha) * mo.alpha;
    if (p.k === 'poly') {
      var pts = c.pts;
      for (var i = 0; i < pts.length; i += 2) {
        var x = pts[i], y = pts[i + 1];
        pts[i] = matApplyX(m, x, y);
        pts[i + 1] = matApplyY(m, x, y);
      }
      // stroke width scales with the matrix (world-space width)
      c.w = c.w * matScale(m);
    } else {
      // glyph/dot: transform the anchor only (V1 simplification)
      var ax = matApplyX(m, p.x, p.y);
      var ay = matApplyY(m, p.x, p.y);
      c.x = ax; c.y = ay;
      if (p.k === 'glyph') {
        c.rot = (p.rot || 0) + matRot(m);
        c.size = p.size * matScale(m);
      } else {
        c.r = p.r * matScale(m);
      }
    }
    return c;
  }

  // mutates prim in place: all points/anchors through non-affine map
  function mapPrim(p, map) {
    if (p.k === 'poly') {
      var pts = p.pts;
      for (var i = 0; i < pts.length; i += 2) {
        var out = map(pts[i], pts[i + 1]);
        pts[i] = out[0];
        pts[i + 1] = out[1];
      }
    } else {
      var o = map(p.x, p.y);
      p.x = o[0];
      p.y = o[1];
    }
  }

  function normalizeInstances(list) {
    var out = [];
    if (list && list.length) {
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        if (Array.isArray(e) && e.length === 6) {
          out.push({ m: e, alpha: 1 });
        } else if (e && Array.isArray(e.m) && e.m.length === 6) {
          out.push({ m: e.m, alpha: (e.alpha == null ? 1 : e.alpha) });
        }
      }
    }
    if (!out.length) out.push({ m: IDENT, alpha: 1 });
    return out;
  }

  // greedy sub-pixel polyline decimation: drops points that deviate less
  // than tol (world units) from the local chord. Returns original array
  // when nothing significant can be dropped.
  function decimatePts(pts, tol) {
    var n = pts.length >> 1;
    if (n <= 16) return pts;
    var t2 = tol * tol;
    var out = [pts[0], pts[1]];
    var ax = pts[0], ay = pts[1];
    for (var i = 1; i < n - 1; i++) {
      var bx = pts[2 * i], by = pts[2 * i + 1];
      var cx = pts[2 * i + 2], cy = pts[2 * i + 3];
      var ux = cx - ax, uy = cy - ay;
      var vx = bx - ax, vy = by - ay;
      var L2 = ux * ux + uy * uy;
      var d2;
      if (L2 < 1e-12) {
        d2 = vx * vx + vy * vy;
      } else {
        var cr = ux * vy - uy * vx;
        d2 = (cr * cr) / L2;
      }
      if (d2 > t2) {
        out.push(bx, by);
        ax = bx; ay = by;
      }
    }
    out.push(pts[2 * n - 2], pts[2 * n - 1]);
    return (out.length < pts.length - 8) ? out : pts;
  }

  /* ---------- scene ---------- */

  function createScene(canvasEl) {
    var ctx = canvasEl.getContext('2d');
    var idCounter = 0;
    var stackCbs = [];
    var selectCbs = [];
    var cssW = 1, cssH = 1, dpr = 1;
    var rafId = 0;
    var tPrev = null;
    var t = 0;
    var capHit = false;      // per-frame truncation flag
    var instBudget = 0;      // per-frame remaining instance budget
    var dynCap = INSTANCE_CAP; // adaptive budget (LOD controller, see frame())
    var dynCooldown = 0;     // frames to wait before the next cap adjustment
    var drawnTotal = 0;      // instances consumed in the current frame
    var lastDrawn = 0;       // ... in the previous frame
    var frameEma = 0;        // smoothed frame interval (ms)
    var layers = new Map();  // block.id -> cached offscreen layer

    var sc = {
      blocks: [],                       // bottom -> top
      camera: { x: 0, y: 0, scale: 1 },
      selectedId: null,
      defs: defs,
      instanceLimitHit: false,
      fps: 0
    };

    /* ----- stack management ----- */

    function pruneLayers() {
      if (!layers.size) return;
      layers.forEach(function (_, id) {
        if (indexOfId(id) < 0) layers.delete(id);
      });
    }

    function fireStack() {
      pruneLayers();
      for (var i = 0; i < stackCbs.length; i++) {
        try { stackCbs[i](sc); } catch (e) { console.error('OneCanvas onStackChange handler failed', e); }
      }
    }

    function fireSelect() {
      for (var i = 0; i < selectCbs.length; i++) {
        try { selectCbs[i](sc.selectedId, sc); } catch (e) { console.error('OneCanvas onSelect handler failed', e); }
      }
    }

    function indexOfId(id) {
      for (var i = 0; i < sc.blocks.length; i++) {
        if (sc.blocks[i].id === id) return i;
      }
      return -1;
    }

    sc.add = function (type) {
      var def = defs.get(type);
      if (!def) throw new Error('OneCanvas: unknown block type "' + type + '"');
      var block = {
        id: 'b' + (++idCounter),
        type: type,
        name: def.label || type,
        visible: true,
        params: defaultsFromSchema(def.schema),
        state: {}
      };
      if (typeof def.init === 'function') def.init(block);
      sc.blocks.push(block);
      fireStack();
      return block;
    };

    sc.remove = function (id) {
      var idx = indexOfId(id);
      if (idx < 0) return;
      sc.blocks.splice(idx, 1);
      if (sc.selectedId === id) {
        sc.selectedId = null;
        fireSelect();
      }
      fireStack();
    };

    sc.move = function (id, newIndex) {
      var idx = indexOfId(id);
      if (idx < 0) return;
      var block = sc.blocks.splice(idx, 1)[0];
      if (!(newIndex >= 0)) newIndex = 0;
      if (newIndex > sc.blocks.length) newIndex = sc.blocks.length;
      sc.blocks.splice(newIndex, 0, block);
      fireStack();
    };

    sc.select = function (id) {
      var next = id || null;
      if (next !== null && indexOfId(next) < 0) next = null;
      sc.selectedId = next;
      fireSelect();
    };

    sc.onStackChange = function (cb) { if (typeof cb === 'function') stackCbs.push(cb); };
    sc.onSelect = function (cb) { if (typeof cb === 'function') selectCbs.push(cb); };

    sc.serialize = function () {
      return {
        v: 1,
        camera: { x: sc.camera.x, y: sc.camera.y, scale: sc.camera.scale },
        blocks: sc.blocks.map(function (b) {
          return {
            type: b.type,
            name: b.name,
            visible: !!b.visible,
            params: deepClone(b.params)
          };
        })
      };
    };

    sc.load = function (obj) {
      if (!obj || !Array.isArray(obj.blocks)) {
        throw new Error('OneCanvas: invalid scene object');
      }
      sc.blocks.length = 0;
      idCounter = 0;
      for (var i = 0; i < obj.blocks.length; i++) {
        var bd = obj.blocks[i];
        var def = defs.get(bd && bd.type);
        if (!def) {
          console.warn('OneCanvas.load: unknown block type skipped:', bd && bd.type);
          continue;
        }
        var block = {
          id: 'b' + (++idCounter),
          type: bd.type,
          name: (typeof bd.name === 'string' && bd.name) ? bd.name : (def.label || bd.type),
          visible: bd.visible !== false,
          params: defaultsFromSchema(def.schema),
          state: {}
        };
        if (bd.params && typeof bd.params === 'object') {
          for (var key in block.params) {
            if (Object.prototype.hasOwnProperty.call(bd.params, key)) {
              block.params[key] = bd.params[key];
            }
          }
        }
        if (typeof def.init === 'function') def.init(block);
        sc.blocks.push(block);
      }
      if (obj.camera && typeof obj.camera === 'object') {
        sc.camera.x = Number(obj.camera.x) || 0;
        sc.camera.y = Number(obj.camera.y) || 0;
        var s = Number(obj.camera.scale);
        sc.camera.scale = (s > 0 && isFinite(s)) ? s : 1;
      }
      sc.selectedId = null;
      dynCap = INSTANCE_CAP; // fresh scene: let the LOD controller re-settle
      fireSelect();
      fireStack();
    };

    // helpers beyond the plan (documented in the task report):
    // convert canvas-local CSS px <-> world coordinates
    sc.screenToWorld = function (sx, sy) {
      var s = sc.camera.scale;
      return [
        (sx - cssW / 2) / s + sc.camera.x,
        (sy - cssH / 2) / s + sc.camera.y
      ];
    };
    sc.worldToScreen = function (wx, wy) {
      var s = sc.camera.scale;
      return [
        (wx - sc.camera.x) * s + cssW / 2,
        (wy - sc.camera.y) * s + cssH / 2
      ];
    };
    sc.destroy = function () {
      cancelAnimationFrame(rafId);
      if (ro) ro.disconnect();
    };

    /* ----- resize / DPR ----- */

    function resize() {
      var rect = canvasEl.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cssW = Math.max(1, rect.width);
      cssH = Math.max(1, rect.height);
      var pw = Math.round(cssW * dpr);
      var ph = Math.round(cssH * dpr);
      if (canvasEl.width !== pw) canvasEl.width = pw;
      if (canvasEl.height !== ph) canvasEl.height = ph;
    }

    var ro = null;
    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(resize);
      ro.observe(canvasEl);
    } else {
      window.addEventListener('resize', resize);
    }
    resize();

    /* ----- view ----- */

    function computeView() {
      var s = sc.camera.scale;
      var halfW = cssW / 2 / s;
      var halfH = cssH / 2 / s;
      return {
        w: cssW,
        h: cssH,
        dpr: dpr,
        scale: s,
        left: sc.camera.x - halfW,
        right: sc.camera.x + halfW,
        top: sc.camera.y - halfH,
        bottom: sc.camera.y + halfH
      };
    }

    function cameraMatrix() {
      var s = sc.camera.scale;
      return [s, 0, 0, s, cssW / 2 - sc.camera.x * s, cssH / 2 - sc.camera.y * s];
    }

    function setT(m) {
      ctx.setTransform(dpr * m[0], dpr * m[1], dpr * m[2], dpr * m[3], dpr * m[4], dpr * m[5]);
    }

    /* ----- drawing primitives (overlay path — few prims, once per frame) ----- */

    function drawPathPrim(p, path, extraAlpha) {
      var a = (p._alpha == null ? 1 : p._alpha) * extraAlpha;
      if (a <= 0) return;
      ctx.globalAlpha = Math.min(1, a);
      ctx.shadowBlur = p.glow || 0;
      ctx.shadowColor = p.glow ? p.col : 'rgba(0,0,0,0)';
      if (p.k === 'dot') {
        ctx.fillStyle = p.col;
        ctx.fill(path);
        return;
      }
      if (p.fill) {
        ctx.fillStyle = p.col;
        ctx.fill(path);
      }
      if (p.w > 0) {
        if (p.dash) ctx.setLineDash(p.dash); else ctx.setLineDash([]);
        ctx.strokeStyle = p.col;
        ctx.lineWidth = p.w;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke(path);
        if (p.dash) ctx.setLineDash([]);
      }
    }

    function drawGlyph(p, x, y, size, rot, extraAlpha) {
      var a = (p._alpha == null ? 1 : p._alpha) * extraAlpha;
      if (a <= 0 || !(size > 0)) return;
      ctx.globalAlpha = Math.min(1, a);
      ctx.shadowBlur = p.glow || 0;
      ctx.shadowColor = p.glow ? p.col : 'rgba(0,0,0,0)';
      ctx.fillStyle = p.col;
      ctx.font = '100 ' + size + 'px ' + GLYPH_FONT;
      if (rot) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.fillText(p.ch, 0, 0);
        ctx.restore();
      } else {
        ctx.fillText(p.ch, x, y);
      }
    }

    function buildPath(p) {
      var path = new Path2D();
      if (p.k === 'poly') {
        var pts = p.pts;
        if (pts && pts.length >= 4) {
          path.moveTo(pts[0], pts[1]);
          for (var i = 2; i < pts.length; i += 2) path.lineTo(pts[i], pts[i + 1]);
          if (p.closed) path.closePath();
        }
      } else if (p.k === 'dot') {
        path.arc(p.x, p.y, Math.max(0, p.r), 0, Math.PI * 2);
      }
      return path;
    }

    // draw fully materialized world-space prims under the camera transform
    function drawPrimsWorld(prims, camM) {
      setT(camM);
      for (var i = 0; i < prims.length; i++) {
        var p = prims[i];
        if (p.k === 'glyph') {
          drawGlyph(p, p.x, p.y, p.size, p.rot || 0, 1);
        } else {
          drawPathPrim(p, buildPath(p), 1);
        }
      }
    }

    /* ----- instanced drawing ----- */

    // world-space bbox of transformed bbox corners vs padded view rect
    function instVisible(bb, m, view, pad) {
      var x0 = matApplyX(m, bb.minX, bb.minY), y0 = matApplyY(m, bb.minX, bb.minY);
      var x1 = matApplyX(m, bb.maxX, bb.minY), y1 = matApplyY(m, bb.maxX, bb.minY);
      var x2 = matApplyX(m, bb.minX, bb.maxY), y2 = matApplyY(m, bb.minX, bb.maxY);
      var x3 = matApplyX(m, bb.maxX, bb.maxY), y3 = matApplyY(m, bb.maxX, bb.maxY);
      var minX = Math.min(x0, x1, x2, x3), maxX = Math.max(x0, x1, x2, x3);
      var minY = Math.min(y0, y1, y2, y3), maxY = Math.max(y0, y1, y2, y3);
      return !(maxX < view.left - pad || minX > view.right + pad ||
               maxY < view.top - pad || minY > view.bottom + pad);
    }

    // render path prims once into the scratch canvas with true shadowBlur
    function renderSprite(paths, bb, k) {
      var w = (bb.maxX - bb.minX) * k;
      var h = (bb.maxY - bb.minY) * k;
      var g = getScratch(w, h);
      g.setTransform(k, 0, 0, k, -bb.minX * k, -bb.minY * k);
      g.lineJoin = 'round';
      g.lineCap = 'round';
      for (var i = 0; i < paths.length; i++) {
        var p = paths[i];
        var a = p._alpha == null ? 1 : p._alpha;
        if (a <= 0) continue;
        g.globalAlpha = Math.min(1, a);
        g.shadowBlur = p.glow || 0;
        g.shadowColor = p.glow ? p.col : 'rgba(0,0,0,0)';
        var path = buildPath(p);
        if (p.k === 'dot') {
          g.fillStyle = p.col;
          g.fill(path);
          continue;
        }
        if (p.fill) {
          g.fillStyle = p.col;
          g.fill(path);
        }
        if (p.w > 0) {
          if (p.dash) g.setLineDash(p.dash); else g.setLineDash([]);
          g.strokeStyle = p.col;
          g.lineWidth = p.w;
          g.stroke(path);
          if (p.dash) g.setLineDash([]);
        }
      }
      g.setLineDash([]);
      return { w: w, h: h };
    }

    // Central instanced draw: prims (post-map, world space) x affine
    // instance matrices. Glyphs go through the sprite cache; glowing path
    // sets are baked to a per-frame block sprite; plain paths are grouped
    // into shared Path2Ds and stroked per instance.
    function drawInstanced(prims, instances, camM, view) {
      var glyphs = null, paths = null, hasGlow = false;
      var i, p;
      for (i = 0; i < prims.length; i++) {
        p = prims[i];
        if (p.k === 'glyph') {
          (glyphs || (glyphs = [])).push(p);
        } else {
          (paths || (paths = [])).push(p);
          if (p.glow > 0) hasGlow = true;
        }
      }

      var maxScale = 0, aliveScaleSq = 0;
      for (i = 0; i < instances.length; i++) {
        var isc = matScale(instances[i].m);
        if (isc > maxScale) maxScale = isc;
        if (instances[i].alpha > ALPHA_SKIP) aliveScaleSq += isc * isc;
      }
      if (!(maxScale > 0)) maxScale = 1;

      var inst, ii, gi;

      if (paths) {
        // decimate dense polylines to sub-pixel tolerance (visually lossless)
        var tol = DECIM_TOL_PX / (view.scale * maxScale * dpr);
        var maxHalfW = 0, maxGlow = 0;
        var bb = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
        for (i = 0; i < paths.length; i++) {
          p = paths[i];
          if (p.k === 'poly' && p.pts.length > 48) {
            var dec = decimatePts(p.pts, tol);
            if (dec !== p.pts) {
              // shallow copy: never mutate the block's emitted prim
              var np = {};
              for (var key in p) np[key] = p[key];
              np.pts = dec;
              paths[i] = p = np;
            }
          }
          if (p.k === 'poly') {
            var pts = p.pts;
            for (var pi = 0; pi < pts.length; pi += 2) {
              if (pts[pi] < bb.minX) bb.minX = pts[pi];
              if (pts[pi] > bb.maxX) bb.maxX = pts[pi];
              if (pts[pi + 1] < bb.minY) bb.minY = pts[pi + 1];
              if (pts[pi + 1] > bb.maxY) bb.maxY = pts[pi + 1];
            }
            if (p.w / 2 > maxHalfW) maxHalfW = p.w / 2;
          } else { // dot
            if (p.x - p.r < bb.minX) bb.minX = p.x - p.r;
            if (p.x + p.r > bb.maxX) bb.maxX = p.x + p.r;
            if (p.y - p.r < bb.minY) bb.minY = p.y - p.r;
            if (p.y + p.r > bb.maxY) bb.maxY = p.y + p.r;
          }
          if (p.glow > maxGlow) maxGlow = p.glow;
        }
        // pad: stroke half width (world) + glow (device px -> world)
        var padW = maxHalfW + (maxGlow * 2 + 2) / (view.scale * dpr);
        bb.minX -= padW; bb.minY -= padW; bb.maxX += padW; bb.maxY += padW;

        var k = view.scale * dpr;
        var sw = (bb.maxX - bb.minX) * k;
        var sh = (bb.maxY - bb.minY) * k;
        var blitCost = sw * sh * aliveScaleSq;
        var useSprite = hasGlow && sw > 2 && sh > 2 &&
          sw <= SPRITE_MAX_DIM && sh <= SPRITE_MAX_DIM &&
          blitCost <= SPRITE_COST_BUDGET;

        var cullPad = padW;

        if (useSprite) {
          renderSprite(paths, bb, k);
          ctx.shadowBlur = 0;
          for (ii = 0; ii < instances.length; ii++) {
            inst = instances[ii];
            if (inst.alpha <= ALPHA_SKIP) continue;
            if (!instVisible(bb, inst.m, view, cullPad)) continue;
            // device = dpr*camM o inst.m o (sprite px -> world)
            var mw = matMul(camM, inst.m);
            ctx.setTransform(
              dpr * mw[0] / k, dpr * mw[1] / k,
              dpr * mw[2] / k, dpr * mw[3] / k,
              dpr * (mw[0] * bb.minX + mw[2] * bb.minY + mw[4]),
              dpr * (mw[1] * bb.minX + mw[3] * bb.minY + mw[5])
            );
            ctx.globalAlpha = Math.min(1, inst.alpha);
            ctx.drawImage(scratch, 0, 0, sw, sh, 0, 0, sw, sh);
          }
        } else {
          // group by style into shared Path2Ds (one stroke per group/instance)
          var groups = [];
          var gmap = new Map();
          for (i = 0; i < paths.length; i++) {
            p = paths[i];
            var gkey = p.k + '|' + p.col + '|' + (p.w || 0) + '|' + (p.glow || 0) +
              '|' + (p.fill ? 1 : 0) + '|' + (p.dash ? p.dash.join(',') : '') +
              '|' + (p._alpha == null ? 1 : p._alpha);
            var grp = gmap.get(gkey);
            if (!grp) {
              grp = { proto: p, path: new Path2D() };
              gmap.set(gkey, grp);
              groups.push(grp);
            }
            if (p.k === 'poly') {
              var gp = p.pts;
              if (gp.length >= 4) {
                grp.path.moveTo(gp[0], gp[1]);
                for (var gj = 2; gj < gp.length; gj += 2) grp.path.lineTo(gp[gj], gp[gj + 1]);
                if (p.closed) grp.path.closePath();
              }
            } else {
              grp.path.moveTo(p.x + p.r, p.y);
              grp.path.arc(p.x, p.y, Math.max(0, p.r), 0, Math.PI * 2);
            }
          }

          ctx.shadowBlur = 0;
          ctx.lineJoin = 'bevel';
          ctx.lineCap = 'round';
          for (ii = 0; ii < instances.length; ii++) {
            inst = instances[ii];
            if (inst.alpha <= ALPHA_SKIP) continue;
            if (!instVisible(bb, inst.m, view, cullPad)) continue;
            setT(matMul(camM, inst.m));
            for (gi = 0; gi < groups.length; gi++) {
              var g2 = groups[gi];
              var pr = g2.proto;
              var pc = parseCol(pr.col);
              var a = pc.a * (pr._alpha == null ? 1 : pr._alpha) * inst.alpha;
              if (a <= 0.003) continue;
              if (pr.k === 'dot' || pr.fill) {
                ctx.fillStyle = pc.rgb;
                if (pr.glow > 0) {
                  // cheap halo: wide low-alpha stroke around the shape
                  ctx.strokeStyle = pc.rgb;
                  ctx.globalAlpha = Math.min(1, a * 0.22);
                  ctx.lineWidth = pr.glow * 0.9;
                  ctx.stroke(g2.path);
                }
                ctx.globalAlpha = Math.min(1, a);
                ctx.fill(g2.path);
                if (pr.k === 'dot') continue;
              }
              if (pr.w > 0) {
                if (pr.dash) ctx.setLineDash(pr.dash);
                ctx.strokeStyle = pc.rgb;
                if (pr.glow > 0) {
                  // layered-stroke glow approximation (shadowBlur is too
                  // slow to run per instance in software rasterization)
                  ctx.globalAlpha = Math.min(1, a * 0.10);
                  ctx.lineWidth = pr.w + pr.glow * 1.9;
                  ctx.stroke(g2.path);
                  ctx.globalAlpha = Math.min(1, a * 0.16);
                  ctx.lineWidth = pr.w + pr.glow * 0.8;
                  ctx.stroke(g2.path);
                }
                ctx.globalAlpha = Math.min(1, a);
                ctx.lineWidth = pr.w;
                ctx.stroke(g2.path);
                if (pr.dash) ctx.setLineDash([]);
              }
            }
          }
        }
      }

      if (glyphs) {
        ctx.shadowBlur = 0;
        var kDev = view.scale * dpr;
        var identSet = false;
        for (ii = 0; ii < instances.length; ii++) {
          inst = instances[ii];
          if (inst.alpha <= ALPHA_SKIP) continue;
          var im = inst.m;
          var iRot = matRot(im);
          var iScale = matScale(im);
          for (gi = 0; gi < glyphs.length; gi++) {
            p = glyphs[gi];
            var pc2 = parseCol(p.col);
            var a2 = pc2.a * (p._alpha == null ? 1 : p._alpha) * inst.alpha;
            if (a2 <= 0.012) continue;
            var ax = matApplyX(im, p.x, p.y);
            var ay = matApplyY(im, p.x, p.y);
            var half = p.size * iScale; // generous half-extent for culling
            if (ax + half < view.left || ax - half > view.right ||
                ay + half < view.top || ay - half > view.bottom) continue;
            var devSize = p.size * iScale * kDev;
            if (devSize < 0.8) continue;
            var rot = (p.rot || 0) + iRot;
            var spr;
            if (devSize <= GLYPH_SMALL_DEV) {
              // small glyph: rotation baked into the sprite, axis-aligned
              // integer blit (fast path in software raster)
              var rs = Math.round(rot / GLYPH_ROT_STEP) % GLYPH_ROT_STEPS;
              if (rs < 0) rs += GLYPH_ROT_STEPS;
              spr = getGlyphSprite(p.ch, pc2.rgb, p.glow || 0,
                glyphBucket(devSize, LOG_112), rs);
              if (!identSet) {
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                identSet = true;
              }
              ctx.globalAlpha = Math.min(1, a2);
              ctx.drawImage(spr.c,
                Math.round(dpr * matApplyX(camM, ax, ay) - spr.hw),
                Math.round(dpr * matApplyY(camM, ax, ay) - spr.hh));
            } else {
              spr = getGlyphSprite(p.ch, pc2.rgb, p.glow || 0,
                glyphBucket(devSize, LOG_125), -1);
              var kk = devSize / spr.fontSize;
              var co = Math.cos(rot) * kk, si = Math.sin(rot) * kk;
              ctx.setTransform(
                co, si, -si, co,
                dpr * matApplyX(camM, ax, ay),
                dpr * matApplyY(camM, ax, ay)
              );
              identSet = false;
              ctx.globalAlpha = Math.min(1, a2);
              ctx.drawImage(spr.c, -spr.hw, -spr.hh);
            }
          }
        }
      }
    }

    /* ----- per-block chain processing ----- */

    // Applies the force chain (nearest first). Affine instance forces stay
    // symbolic as combined matrices; geometry is only materialized when a
    // non-affine map sits above already-collected instances.
    // Returns the number of instances consumed from the budget.
    function processBlock(prims, chain, camM, view, localBudget) {
      // Pre-collect instance lists and allocate the budget OUTERMOST first,
      // so e.g. a kaleidoscope above a fractal keeps its full symmetry and
      // the fractal loses depth (its faintest copies) instead.
      var lists = [];
      var s, spec;
      for (s = 0; s < chain.length; s++) {
        spec = chain[s];
        if (spec.instances) {
          lists.push(normalizeInstances(spec.instances()));
        } else {
          lists.push(null);
        }
      }
      var b = Math.max(1, localBudget);
      for (var li = lists.length - 1; li >= 0; li--) {
        if (!lists[li]) continue;
        var n = lists[li].length;
        var keepN = Math.min(n, b);
        if (keepN < n) {
          lists[li] = lists[li].slice(0, keepN);
          capHit = true;
        }
        b = Math.max(1, Math.floor(b / keepN));
      }

      var work = prims;
      var owned = false;   // work prims are private clones (safe to mutate)
      var combined = [{ m: IDENT, alpha: 1 }];
      var unitCost = 1;    // variants already baked into `work`

      for (s = 0; s < chain.length; s++) {
        spec = chain[s];
        if (lists[s]) {
          var mats = lists[s];
          var next = [];
          for (var mi = 0; mi < mats.length; mi++) {
            for (var ci = 0; ci < combined.length; ci++) {
              // later force applies after the earlier: p' = M_later * (M_earlier * p)
              next.push({
                m: matMul(mats[mi].m, combined[ci].m),
                alpha: mats[mi].alpha * combined[ci].alpha
              });
            }
          }
          combined = next;
        }
        if (typeof spec.map === 'function') {
          if (combined.length > 1 || combined[0].m !== IDENT || combined[0].alpha !== 1) {
            // bake pending affine instances into materialized prim copies
            var out = [];
            for (var c2 = 0; c2 < combined.length; c2++) {
              for (var wi = 0; wi < work.length; wi++) {
                out.push(transformPrim(work[wi], combined[c2]));
              }
            }
            work = out;
            owned = true;
            unitCost *= combined.length;
            combined = [{ m: IDENT, alpha: 1 }];
          } else if (!owned) {
            var cl = [];
            for (var wj = 0; wj < work.length; wj++) cl.push(clonePrim(work[wj]));
            work = cl;
            owned = true;
          }
          for (var wk = 0; wk < work.length; wk++) mapPrim(work[wk], spec.map);
        }
      }

      var total = unitCost * combined.length;
      if (total > localBudget) { // safety net; allocation should prevent this
        var keep = Math.max(0, Math.floor(localBudget / unitCost));
        combined.length = keep;
        capHit = true;
        total = unitCost * combined.length;
      }
      if (!combined.length || !work.length) return total;
      drawInstanced(work, combined, camM, view);
      return total;
    }

    /* ----- layer cache (time-invariant emitter + force chain) ----- */

    // Renders the block's fully composed result into an offscreen layer
    // once and blits it per frame while its signature (params, chain,
    // camera, viewport) stays unchanged. During continuous invalidation
    // (drag/scrub) it renders live at the frame budget instead, so
    // interaction stays responsive; the cache rebuilds when input settles.
    // Returns the instances consumed from the per-frame budget (0 when
    // served from or rebuilt into the cache — rebuild cost is one-off).
    function renderCachedBlock(block, def, chain, camM, view, sig, localBudget, dt) {
      var layer = layers.get(block.id);
      if (!layer) {
        layer = { canvas: null, ctx: null, sig: null, valid: false, capHit: false, lastChange: -1e9 };
        layers.set(block.id, layer);
      }
      var now = performance.now();
      var hot = false;
      if (layer.sig !== sig) {
        hot = (now - layer.lastChange) < LAYER_HOT_MS;
        layer.lastChange = now;
        layer.sig = sig;
        layer.valid = false;
      }
      var pw = canvasEl.width, ph = canvasEl.height;
      if (layer.valid && layer.canvas &&
          layer.canvas.width === pw && layer.canvas.height === ph) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        ctx.drawImage(layer.canvas, 0, 0);
        if (layer.capHit) capHit = true;
        return 0;
      }

      var prims;
      try {
        prims = def.emit(block, t, dt, view) || [];
      } catch (e) {
        console.error('OneCanvas: emit failed for "' + block.type + '"', e);
        return 0;
      }
      if (!prims.length) {
        layer.valid = false;
        return 0;
      }

      if (hot) {
        // interaction in progress: skip the cache, draw at the live budget
        return processBlock(prims, chain, camM, view, localBudget);
      }

      if (!layer.canvas) {
        layer.canvas = document.createElement('canvas');
        layer.ctx = layer.canvas.getContext('2d');
      }
      if (layer.canvas.width !== pw) layer.canvas.width = pw;
      if (layer.canvas.height !== ph) layer.canvas.height = ph;
      layer.ctx.setTransform(1, 0, 0, 1, 0, 0);
      layer.ctx.clearRect(0, 0, pw, ph);

      var mainCtx = ctx;
      var outerCap = capHit;
      capHit = false;
      ctx = layer.ctx; // all draw helpers write through the `ctx` closure var
      try {
        // full budget: the cost is amortized over every cached frame
        processBlock(prims, chain, camM, view, INSTANCE_CAP);
      } finally {
        ctx = mainCtx;
      }
      layer.capHit = capHit;
      capHit = capHit || outerCap;
      layer.valid = true;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.drawImage(layer.canvas, 0, 0);
      return 0;
    }

    /* ----- frame ----- */

    function render(dt) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      capHit = false;
      instBudget = Math.min(INSTANCE_CAP, dynCap);
      drawnTotal = 0;

      var view = computeView();
      var camM = cameraMatrix();

      // count emitters up front so the budget is shared fairly between them
      var emittersLeft = 0;
      for (var e0 = 0; e0 < sc.blocks.length; e0++) {
        var b0 = sc.blocks[e0];
        if (!b0.visible) continue;
        var d0 = defs.get(b0.type);
        if (d0 && d0.kind !== 'kraft' && typeof d0.emit === 'function') emittersLeft++;
      }

      for (var i = 0; i < sc.blocks.length; i++) {
        var block = sc.blocks[i];
        if (!block.visible) continue;
        var def = defs.get(block.type);
        if (!def || def.kind === 'kraft' || typeof def.emit !== 'function') continue;

        // force chain first (visible kraft blocks ABOVE this block, nearest
        // first) — needed before emit to decide layer-cache eligibility
        var chain = [];
        var chainMeta = null; // [type, params, ...] for the cache signature
        var cacheable = isTimeInvariant(def, block);
        for (var j = i + 1; j < sc.blocks.length; j++) {
          var fb = sc.blocks[j];
          if (!fb.visible) continue;
          var fdef = defs.get(fb.type);
          if (!fdef || fdef.kind !== 'kraft' || typeof fdef.force !== 'function') continue;
          var spec;
          try {
            spec = fdef.force(fb, t);
          } catch (e) {
            console.error('OneCanvas: force failed for "' + fb.type + '"', e);
            continue;
          }
          if (!spec) continue;
          chain.push(spec);
          if (cacheable) {
            if (isTimeInvariant(fdef, fb)) {
              (chainMeta || (chainMeta = [])).push(fb.type, fb.params);
            } else {
              cacheable = false;
            }
          }
        }

        if (instBudget < 1) {
          capHit = true;
          break;
        }
        var local = Math.max(1, Math.floor(instBudget / Math.max(1, emittersLeft)));
        var used = 0;
        if (cacheable && (layers.has(block.id) || layers.size < LAYER_MAX)) {
          var sig = JSON.stringify([
            block.params, chainMeta,
            sc.camera.x, sc.camera.y, sc.camera.scale,
            cssW, cssH, dpr
          ]);
          used = renderCachedBlock(block, def, chain, camM, view, sig, local, dt);
        } else {
          var prims;
          try {
            prims = def.emit(block, t, dt, view) || [];
          } catch (e) {
            console.error('OneCanvas: emit failed for "' + block.type + '"', e);
            emittersLeft--;
            continue;
          }
          if (prims.length) used = processBlock(prims, chain, camM, view, local);
        }
        instBudget -= used;
        drawnTotal += used;
        emittersLeft--;
      }

      // selection overlay: untransformed by forces, camera only, accent color
      if (sc.selectedId) {
        var selIdx = indexOfId(sc.selectedId);
        if (selIdx >= 0) {
          var sb = sc.blocks[selIdx];
          var sdef = defs.get(sb.type);
          if (sdef && typeof sdef.overlay === 'function') {
            var oprims;
            try {
              oprims = sdef.overlay(sb, t, view) || [];
            } catch (e) {
              console.error('OneCanvas: overlay failed for "' + sb.type + '"', e);
              oprims = [];
            }
            if (oprims.length) {
              var styled = [];
              for (var oi = 0; oi < oprims.length; oi++) {
                var op = clonePrim(oprims[oi]);
                if (!op.col) op.col = ACCENT;
                styled.push(op);
              }
              drawPrimsWorld(styled, camM);
            }
          }
        }
      }

      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.setLineDash([]);

      sc.instanceLimitHit = capHit;
    }

    function frame(ms) {
      rafId = requestAnimationFrame(frame);
      if (window.devicePixelRatio && Math.min(window.devicePixelRatio, 2) !== dpr) resize();
      if (tPrev === null) tPrev = ms;
      var dtMs = ms - tPrev;
      var dt = Math.min(0.1, Math.max(0, dtMs / 1000));
      tPrev = ms;
      t += dt;
      if (dt > 0) {
        var inst = 1 / dt;
        sc.fps = sc.fps ? sc.fps * 0.9 + inst * 0.1 : inst;
      }

      // adaptive instance budget: proportional shrink when frames run slow
      // with a big fanout, slow growth while capped and fast. A cooldown
      // lets the frame-time EMA settle after each change — without it the
      // controller oscillates between too-slow and too-small.
      if (dtMs > 0) {
        frameEma = frameEma ? frameEma * 0.8 + dtMs * 0.2 : dtMs;
        if (dynCooldown > 0) {
          dynCooldown--;
        } else if (frameEma > FRAME_SLOW_MS && lastDrawn > DYN_MIN && dynCap > DYN_MIN) {
          dynCap = Math.max(DYN_MIN, Math.floor(
            Math.min(dynCap, lastDrawn) * Math.max(0.3, FRAME_TARGET_MS / frameEma)));
          dynCooldown = 12;
        } else if (frameEma < FRAME_FAST_MS && sc.instanceLimitHit && dynCap < INSTANCE_CAP) {
          dynCap = Math.min(INSTANCE_CAP, dynCap + Math.max(4, dynCap >> 3));
          dynCooldown = 12;
        }
      }

      try {
        render(dt);
      } catch (e) {
        console.error('OneCanvas: render frame failed', e);
      }
      lastDrawn = drawnTotal;
    }

    rafId = requestAnimationFrame(frame);
    return sc;
  }

  window.OneCanvas = {
    registerBlock: registerBlock,
    createScene: createScene,
    blockDefs: blockDefs
  };
})();
