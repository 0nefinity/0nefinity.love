/* 0necanvas blocks — Erzeuger (Task B3)
 *
 * Registers the `spawner` block: emits short-lived glyph particles that
 * age, drift and fade. All randomness comes from a deterministic mulberry32
 * PRNG whose state lives in block.state (fixed seed per init, so the same
 * scene reproduces the same spawn pattern).
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
      if (st.particles.length > MAX_PARTICLES) {
        st.particles.splice(0, st.particles.length - MAX_PARTICLES);
      }

      // emit as glyph primitives with alpha over lifetime baked into col
      var prims = [];
      for (var j = 0; j < st.particles.length; j++) {
        var q = st.particles[j];
        var frac = q.age / q.life;
        var fadeIn = Math.min(1, frac / FADE_IN_FRAC);
        var fadeOut = 1 - frac;
        var a = BASE_ALPHA * fadeIn * fadeOut * fadeOut; // ease-out fade
        if (a <= 0.003) continue;
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
