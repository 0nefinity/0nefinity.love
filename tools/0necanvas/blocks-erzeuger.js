/* 0necanvas blocks — Erzeuger (Task B3, template stamping V1.1)
 *
 * Registers the `spawner` block: emits short-lived particles that age,
 * drift and fade. All randomness comes from a deterministic mulberry32
 * PRNG whose state lives in block.state (fixed seed per init, so the same
 * scene reproduces the same spawn pattern).
 *
 * V1.1 — "Was wird erzeugt": every registered ding type is a STAMP
 * (0 ≡ 1 ≡ ∞: a ding is an already-present Erzeugnis). The `template`
 * select picks either classic text glyphs ('symbols', default — backward
 * compatible) or a ding type whose emitted geometry (schema defaults,
 * view-dependent dinge get a small synthetic view) is stamped per
 * particle: translated to the particle, scaled to particle size relative
 * to the template extent, rotated, and faded via prim._alpha. Template
 * geometry is decimated once per frame and heavy templates shrink the
 * particle cap (point budget) so scenes stay responsive.
 *
 * See docs/superpowers/plans/2026-07-06-0necanvas-v1-plan.md section 5.
 * Engine semantics: Primitive.rot is RADIANS; unseen blocks are not
 * emitted (simulation pauses while hidden — engine behavior).
 */
(function () {
  'use strict';

  var TAU = Math.PI * 2;
  var SEED = 0x0181f1; // fixed: deterministic across reloads of the same scene
  var MAX_PARTICLES = 400; // safety cap (rate*life can exceed 1000 otherwise)
  var BASE_ALPHA = 0.85;
  var FADE_IN_FRAC = 0.12; // first 12% of life fades in

  /* ---- template stamping (V1.1) ---- */
  var TPL_POINT_BUDGET = 9000;   // total emitted poly points across particles
  var TPL_MAX_TURN = 0.3;        // rad of accumulated turn per kept point
  var TPL_ALPHA_STEPS = 24;      // fade quantization -> engine style-groups merge
  var TPL_MIN_PARTICLES = 8;
  var TPL_LABELS = { kurve: 'Kurve/Herz' };
  // synthetic view for view-dependent dinge (e.g. gitter): a small bounded
  // patch instead of the real viewport, so the stamp has finite extent
  var TPL_VIEW = {
    w: 200, h: 200, dpr: 1, scale: 1,
    left: -100, right: 100, top: -100, bottom: 100
  };

  // mulberry32: tiny deterministic PRNG; state is a single uint32
  function mulberry32Next(state) {
    var z = (state.s = (state.s + 0x6D2B79F5) | 0);
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  }

  function symbolsFromParam(str) {
    var list = String(str == null ? '' : str).split(/\s+/).filter(function (s) {
      return s.length > 0;
    });
    return list.length ? list : ['∞'];
  }

  /* ---------- template stamping helpers ---------- */

  // options for "Was wird erzeugt": classic glyphs + one entry per ding.
  // Script order (0necanvas.html) loads blocks-dinge.js before this file,
  // so all ding types are registered here; a static fallback covers the
  // (unexpected) case of an empty registry so the select never breaks.
  function templateOptions() {
    var opts = [{ value: 'symbols', label: 'Symbole' }];
    var all = (window.OneCanvas && typeof OneCanvas.blockDefs === 'function')
      ? OneCanvas.blockDefs() : [];
    for (var i = 0; i < all.length; i++) {
      var d = all[i];
      if (d.kind !== 'ding') continue;
      if (d.type.charAt(0) === '_') continue; // internal (selftest)
      if (typeof d.emit !== 'function') continue;
      opts.push({ value: d.type, label: TPL_LABELS[d.type] || d.label || d.type });
    }
    if (opts.length === 1) {
      console.warn('0necanvas spawner: no ding types registered before spawner — check script order');
    }
    return opts;
  }

  function findDingDef(type) {
    var all = OneCanvas.blockDefs();
    for (var i = 0; i < all.length; i++) {
      if (all[i].type === type && all[i].kind === 'ding' &&
          typeof all[i].emit === 'function') return all[i];
    }
    return null;
  }

  // synthetic block with the ding's schema DEFAULTS (cached per type)
  var tplBlocks = {};
  function templateBlock(def) {
    var b = tplBlocks[def.type];
    if (b) return b;
    var params = {};
    var schema = def.schema || [];
    for (var i = 0; i < schema.length; i++) params[schema[i].key] = schema[i].value;
    b = {
      id: '_tpl_' + def.type, type: def.type,
      name: def.label || def.type, visible: true,
      params: params, state: {}
    };
    if (typeof def.init === 'function') {
      try { def.init(b); } catch (e) { console.warn('0necanvas spawner: template init failed for "' + def.type + '"', e); }
    }
    tplBlocks[def.type] = b;
    return b;
  }

  // angle-based decimation: keep a point once the accumulated direction
  // change exceeds TPL_MAX_TURN or the chord since the last kept point
  // exceeds extent/6. Smooth curves become ~20-40-gons (plenty for small
  // stamps), straight lines keep a few interior points so warps above the
  // spawner can still bend them.
  function decimateTplPts(pts, extent) {
    var n = pts.length >> 1;
    if (n <= 12) return pts;
    var maxLen2 = (extent / 6) * (extent / 6);
    var out = [pts[0], pts[1]];
    var keptX = pts[0], keptY = pts[1];
    var prevX = pts[0], prevY = pts[1];
    var prevAng = null;
    var turn = 0;
    for (var i = 1; i < n - 1; i++) {
      var x = pts[2 * i], y = pts[2 * i + 1];
      var dx = x - prevX, dy = y - prevY;
      if (dx * dx + dy * dy < 1e-12) continue;
      var ang = Math.atan2(dy, dx);
      if (prevAng != null) {
        var d = ang - prevAng;
        if (d > Math.PI) d -= TAU;
        else if (d < -Math.PI) d += TAU;
        turn += Math.abs(d);
      }
      prevAng = ang;
      prevX = x; prevY = y;
      var kx = x - keptX, ky = y - keptY;
      if (turn >= TPL_MAX_TURN || kx * kx + ky * ky >= maxLen2) {
        out.push(x, y);
        keptX = x; keptY = y;
        turn = 0;
      }
    }
    out.push(pts[2 * n - 2], pts[2 * n - 1]);
    return out;
  }

  // emit the template ding once (per frame), measure its extent, decimate
  // its polylines and estimate a per-stamp cost for the particle budget
  function buildTemplate(def, t, dt) {
    var prims;
    try {
      prims = def.emit(templateBlock(def), t, dt, TPL_VIEW) || [];
    } catch (e) {
      console.error('0necanvas spawner: template emit failed for "' + def.type + '"', e);
      return null;
    }
    if (!prims.length) return null;

    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    var i, j, p, pts;
    for (i = 0; i < prims.length; i++) {
      p = prims[i];
      if (p.k === 'poly') {
        pts = p.pts;
        for (j = 0; j < pts.length; j += 2) {
          if (pts[j] < minX) minX = pts[j];
          if (pts[j] > maxX) maxX = pts[j];
          if (pts[j + 1] < minY) minY = pts[j + 1];
          if (pts[j + 1] > maxY) maxY = pts[j + 1];
        }
      } else if (p.k === 'glyph') {
        var hg = (p.size || 0) * 0.6;
        if (p.x - hg < minX) minX = p.x - hg;
        if (p.x + hg > maxX) maxX = p.x + hg;
        if (p.y - hg < minY) minY = p.y - hg;
        if (p.y + hg > maxY) maxY = p.y + hg;
      } else if (p.k === 'dot') {
        if (p.x - p.r < minX) minX = p.x - p.r;
        if (p.x + p.r > maxX) maxX = p.x + p.r;
        if (p.y - p.r < minY) minY = p.y - p.r;
        if (p.y + p.r > maxY) maxY = p.y + p.r;
      }
    }
    var extent = Math.max(maxX - minX, maxY - minY);
    if (!(extent > 1e-6)) extent = 1;

    var cost = 0;
    var out = [];
    for (i = 0; i < prims.length; i++) {
      p = prims[i];
      if (p.k === 'poly') {
        var dec = decimateTplPts(p.pts, extent);
        if (dec !== p.pts) {
          var np = {};
          for (var key in p) np[key] = p[key];
          np.pts = dec;
          p = np;
        }
        cost += (p.pts.length >> 1) + 6; // points + per-poly stroke overhead
      } else {
        cost += 12;
      }
      out.push(p);
    }
    return { prims: out, extent: extent, cost: cost };
  }

  // clone template prims onto one particle: translate/scale/rotate, fade
  // via _alpha (engine composes it with the prim color's own alpha)
  function stampParticle(tpl, q, alpha, hairW, out) {
    var s = q.size / tpl.extent;
    var cosR = Math.cos(q.rot), sinR = Math.sin(q.rot);
    for (var i = 0; i < tpl.prims.length; i++) {
      var p = tpl.prims[i];
      var a = (p._alpha == null ? 1 : p._alpha) * alpha;
      if (a <= 0.004) continue;
      var glow = p.glow ? p.glow * s : 0;
      if (glow < 0.4) glow = 0; // sub-pixel glow: skip the extra strokes
      if (p.k === 'poly') {
        var src = p.pts;
        var n = src.length;
        var pts = new Array(n);
        for (var j = 0; j < n; j += 2) {
          var x = src[j] * s, y = src[j + 1] * s;
          pts[j] = q.x + x * cosR - y * sinR;
          pts[j + 1] = q.y + x * sinR + y * cosR;
        }
        out.push({
          k: 'poly', pts: pts, closed: !!p.closed, fill: !!p.fill,
          w: p.w > 0 ? Math.max(p.w * s, hairW) : 0,
          col: p.col, glow: glow, _alpha: a
        });
      } else if (p.k === 'glyph') {
        var gx = p.x * s, gy = p.y * s;
        out.push({
          k: 'glyph', ch: p.ch,
          x: q.x + gx * cosR - gy * sinR,
          y: q.y + gx * sinR + gy * cosR,
          size: p.size * s, rot: (p.rot || 0) + q.rot,
          col: p.col, glow: glow, _alpha: a
        });
      } else if (p.k === 'dot') {
        var dx = p.x * s, dy = p.y * s;
        out.push({
          k: 'dot',
          x: q.x + dx * cosR - dy * sinR,
          y: q.y + dx * sinR + dy * cosR,
          r: p.r * s, col: p.col, glow: glow, _alpha: a
        });
      }
    }
  }

  function spawnParticle(p, rng) {
    var syms = symbolsFromParam(p.symbols);
    var sMin = Math.min(p.sizeMin, p.sizeMax);
    var sMax = Math.max(p.sizeMin, p.sizeMax);
    // sqrt for uniform distribution over the disc area
    var r = Math.sqrt(mulberry32Next(rng)) * p.radius;
    var ang = mulberry32Next(rng) * TAU;
    var driftAng = mulberry32Next(rng) * TAU;
    var driftMag = p.drift * (0.4 + 0.6 * mulberry32Next(rng));
    return {
      ch: syms[Math.floor(mulberry32Next(rng) * syms.length) % syms.length],
      x: Math.cos(ang) * r,
      y: Math.sin(ang) * r,
      vx: Math.cos(driftAng) * driftMag,
      vy: Math.sin(driftAng) * driftMag,
      size: sMin + (sMax - sMin) * mulberry32Next(rng),
      rot: (mulberry32Next(rng) - 0.5) * 0.9,
      vrot: (mulberry32Next(rng) - 0.5) * 0.6,
      age: 0,
      life: p.life
    };
  }

  OneCanvas.registerBlock({
    type: 'spawner',
    kind: 'erzeuger',
    label: 'Spawner',
    icon: '✧',
    schema: [
      { key: 'template', ctrl: 'select', label: 'Was wird erzeugt', options: templateOptions(), value: 'symbols' },
      { key: 'rate', ctrl: 'slider', label: 'Rate', min: 0, max: 60, step: 0.5, value: 4, decimals: 1, unit: '/s' },
      { key: 'life', ctrl: 'slider', label: 'Lebensdauer', min: 0.5, max: 20, step: 0.5, value: 6, decimals: 1, unit: 's' },
      { key: 'sizeMin', ctrl: 'slider', label: 'Größe min', min: 4, max: 200, step: 1, value: 10 },
      { key: 'sizeMax', ctrl: 'slider', label: 'Größe max', min: 4, max: 200, step: 1, value: 28 },
      { key: 'symbols', ctrl: 'text', label: 'Symbole', value: '∞ 0 1', maxlen: 32 },
      { key: 'drift', ctrl: 'slider', label: 'Drift', min: 0, max: 200, step: 1, value: 18 },
      { key: 'radius', ctrl: 'slider', label: 'Streuradius', min: 0, max: 2000, step: 10, value: 420 },
      { key: 'glow', ctrl: 'slider', label: 'Glühen', min: 0, max: 40, step: 1, value: 6 }
    ],
    init: function (block) {
      block.state = {
        particles: [],
        acc: 0,
        rng: { s: SEED }
      };
    },
    emit: function (block, t, dt, view) {
      var p = block.params;
      var st = block.state;
      if (!st || !st.particles) {
        // defensive: state lost (e.g. hot re-register) — rebuild
        st = block.state = { particles: [], acc: 0, rng: { s: SEED } };
      }

      // template stamping (V1.1): resolve the ding to stamp per particle;
      // unknown/legacy values fall back to classic glyphs ('symbols')
      var tpl = null;
      if (p.template && p.template !== 'symbols') {
        var tplDef = findDingDef(String(p.template));
        if (tplDef) tpl = buildTemplate(tplDef, t, dt);
      }

      // heavy templates shrink the particle cap (fixed point budget)
      var maxP = MAX_PARTICLES;
      if (tpl) {
        maxP = Math.max(TPL_MIN_PARTICLES, Math.min(MAX_PARTICLES,
          Math.floor(TPL_POINT_BUDGET / Math.max(8, tpl.cost))));
      }

      // age + move existing particles, drop the dead
      var alive = [];
      for (var i = 0; i < st.particles.length; i++) {
        var pt = st.particles[i];
        pt.age += dt;
        if (pt.age >= pt.life) continue;
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.rot += pt.vrot * dt;
        alive.push(pt);
      }
      st.particles = alive;

      // spawn: accumulate fractional births, deterministic PRNG per birth
      st.acc += (p.rate > 0 ? p.rate : 0) * dt;
      var births = Math.floor(st.acc);
      st.acc -= births;
      for (var b = 0; b < births; b++) {
        st.particles.push(spawnParticle(p, st.rng));
      }
      if (st.particles.length > maxP) {
        st.particles.splice(0, st.particles.length - maxP);
      }

      // emit particles: template geometry stamps or classic glyphs, both
      // fading with age (glyphs bake alpha into col, stamps use _alpha)
      var hairW = 0.75 / (view && view.scale > 0 ? view.scale : 1);
      var prims = [];
      for (var j = 0; j < st.particles.length; j++) {
        var q = st.particles[j];
        var frac = q.age / q.life;
        var fadeIn = Math.min(1, frac / FADE_IN_FRAC);
        var fadeOut = 1 - frac;
        var a = BASE_ALPHA * fadeIn * fadeOut * fadeOut; // ease-out fade
        if (a <= 0.003) continue;
        if (tpl) {
          // quantize the fade so the engine's style groups merge across
          // particles of similar age (fewer stroke passes per frame)
          var aq = Math.ceil(a * TPL_ALPHA_STEPS) / TPL_ALPHA_STEPS;
          stampParticle(tpl, q, aq, hairW, prims);
        } else {
          prims.push({
            k: 'glyph',
            ch: q.ch,
            x: q.x,
            y: q.y,
            size: q.size,
            rot: q.rot,
            col: 'rgba(226,231,244,' + a.toFixed(3) + ')',
            glow: p.glow
          });
        }
      }
      return prims;
    },
    // no hit/drag: spawner has no position params in V1
    overlay: function (block, t, view) {
      // dashed scatter-radius circle as selection aid
      var r = Math.max(1, block.params.radius);
      var pts = [];
      var n = 72;
      for (var i = 0; i <= n; i++) {
        var a = (i / n) * TAU;
        pts.push(Math.cos(a) * r, Math.sin(a) * r);
      }
      var w = 1 / (view.scale > 0 ? view.scale : 1);
      return [
        { k: 'poly', pts: pts, closed: true, w: w, dash: [8 * w, 8 * w], col: 'rgba(168,184,232,0.5)' },
        { k: 'dot', x: 0, y: 0, r: 2.5 * w, col: 'rgba(168,184,232,0.8)' }
      ];
    }
  });
})();
