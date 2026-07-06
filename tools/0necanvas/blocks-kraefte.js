/* 0necanvas force blocks — verzerren, fraktal, kaleidoskop
 *
 * Registers three 'kraft' block types via OneCanvas.registerBlock.
 * See docs/superpowers/plans/2026-07-06-0necanvas-v1-plan.md section 4.
 *
 * Engine conventions honored (see engine.js header):
 * - Matrix format is canvas order [a,b,c,d,e,f]: x'=ax+cy+e, y'=bx+dy+f.
 * - All rotations are RADIANS internally; schemas expose degrees ("°") and
 *   convert inside force().
 * - Instance entries may be {m:[...], alpha} — alpha multiplies color alpha.
 * - Overlay prims: col omitted = engine accent; poly.w and dash are world
 *   units, divided by view.scale to stay constant on screen.
 */
(function () {
  'use strict';

  if (!window.OneCanvas || typeof window.OneCanvas.registerBlock !== 'function') {
    console.error('blocks-kraefte.js: OneCanvas engine missing (script order?)');
    return;
  }

  var DEG = Math.PI / 180;
  var IDENT = [1, 0, 0, 1, 0, 0];

  /* ---------- helpers ---------- */

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

  // smooth falloff: 1 at the center, 0 at distance >= radius, C1-continuous
  function falloff(dist, radius) {
    if (!(radius > 0)) return 0;
    var u = dist / radius;
    if (u >= 1) return 0;
    if (u <= 0) return 1;
    return 1 - u * u * (3 - 2 * u); // 1 - smoothstep(0, 1, u)
  }

  function num(v, fallback) {
    v = Number(v);
    return isFinite(v) ? v : fallback;
  }

  // circle as tessellated poly points (for the dashed overlay ring)
  function circlePts(cx, cy, r, n) {
    var pts = [];
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2;
      pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    return pts;
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  /* ================================================================
   * verzerren — non-affine space warp (twist / wave / suction)
   * ================================================================ */

  OneCanvas.registerBlock({
    type: 'verzerren',
    kind: 'kraft',
    label: 'Raum verzerren',
    icon: '✦', // ✦
    schema: [
      { key: 'art', ctrl: 'select', label: 'Art', value: 'twist', options: [
        { value: 'twist', label: 'Twist' },
        { value: 'welle', label: 'Welle' },
        { value: 'sog', label: 'Sog' }
      ] },
      { key: 'staerke', ctrl: 'slider', label: 'Stärke', min: -100, max: 100, step: 1, value: 30 },
      { key: 'radius', ctrl: 'slider', label: 'Radius', min: 20, max: 2000, step: 1, value: 420 },
      { key: 'cx', ctrl: 'slider', label: 'Zentrum X', min: -2000, max: 2000, step: 1, value: 0 },
      { key: 'cy', ctrl: 'slider', label: 'Zentrum Y', min: -2000, max: 2000, step: 1, value: 0 }
    ],

    force: function (block, t) {
      var p = block.params;
      var art = p.art;
      var strength = num(p.staerke, 0) / 100; // -1 .. 1
      var radius = Math.max(1, num(p.radius, 420));
      var cx = num(p.cx, 0);
      var cy = num(p.cy, 0);

      var map;
      if (art === 'welle') {
        // radial sine displacement, gently animated over time
        var amp = strength * radius * 0.22;
        var freq = (Math.PI * 2 * 3) / radius; // ~3 wave periods inside the radius
        var phase = t * 1.4;
        map = function (x, y) {
          var dx = x - cx, dy = y - cy;
          var d = Math.hypot(dx, dy);
          var f = falloff(d, radius);
          if (f <= 0 || d < 1e-6) return [x, y];
          var off = Math.sin(d * freq - phase) * amp * f;
          var k = (d + off) / d;
          return [cx + dx * k, cy + dy * k];
        };
      } else if (art === 'sog') {
        // scale toward (or away from) the center
        map = function (x, y) {
          var dx = x - cx, dy = y - cy;
          var d = Math.hypot(dx, dy);
          var f = falloff(d, radius);
          if (f <= 0 || d < 1e-6) return [x, y];
          var k = Math.max(0, 1 - strength * f);
          return [cx + dx * k, cy + dy * k];
        };
      } else {
        // twist: rotation around the center, proportional to falloff
        var maxAngle = strength * Math.PI; // up to ±180° at the center
        map = function (x, y) {
          var dx = x - cx, dy = y - cy;
          var d = Math.hypot(dx, dy);
          var f = falloff(d, radius);
          if (f <= 0) return [x, y];
          var a = maxAngle * f;
          var ca = Math.cos(a), sa = Math.sin(a);
          return [cx + dx * ca - dy * sa, cy + dx * sa + dy * ca];
        };
      }

      return { affine: false, map: map };
    },

    hit: function (block, wx, wy, view) {
      var p = block.params;
      var grab = 24 / Math.max(1e-6, view.scale);
      var d = Math.hypot(wx - num(p.cx, 0), wy - num(p.cy, 0));
      return d <= grab ? 'center' : null;
    },

    drag: function (block, handle, dwx, dwy) {
      if (handle !== 'center') return;
      var p = block.params;
      p.cx = clamp(num(p.cx, 0) + dwx, -2000, 2000);
      p.cy = clamp(num(p.cy, 0) + dwy, -2000, 2000);
    },

    overlay: function (block, t, view) {
      var p = block.params;
      var s = Math.max(1e-6, view.scale);
      var cx = num(p.cx, 0);
      var cy = num(p.cy, 0);
      var r = Math.max(1, num(p.radius, 420));
      return [
        { k: 'poly', pts: circlePts(cx, cy, r, 96), closed: true,
          w: 1.25 / s, col: 'rgba(168,184,232,0.55)', dash: [7 / s, 7 / s] },
        { k: 'dot', x: cx, y: cy, r: 4.5 / s, col: '#a8b8e8', glow: 8 }
      ];
    }
  });

  /* ================================================================
   * fraktal — affine self-similar repetition with opacity decay
   * ================================================================ */

  OneCanvas.registerBlock({
    type: 'fraktal',
    kind: 'kraft',
    label: 'Fraktal-Wiederholung',
    icon: '✦', // ✦
    schema: [
      { key: 'anzahl', ctrl: 'slider', label: 'Anzahl', min: 0, max: 60, step: 1, value: 8 },
      { key: 'skalierung', ctrl: 'slider', label: 'Skalierung/Schritt', min: 0.5, max: 1.5, step: 0.01, value: 0.86, decimals: 2 },
      { key: 'rotation', ctrl: 'slider', label: 'Rotation/Schritt', min: -90, max: 90, step: 1, value: 12, unit: '°' },
      { key: 'abfall', ctrl: 'slider', label: 'Deckkraft-Abfall', min: 0, max: 1, step: 0.01, value: 0.35, decimals: 2 },
      { key: 'cx', ctrl: 'slider', label: 'Zentrum X', min: -2000, max: 2000, step: 1, value: 0 },
      { key: 'cy', ctrl: 'slider', label: 'Zentrum Y', min: -2000, max: 2000, step: 1, value: 0 }
    ],

    force: function (block) {
      var p = block.params;
      var n = Math.max(0, Math.round(num(p.anzahl, 0)));
      var s = num(p.skalierung, 1);
      var rot = num(p.rotation, 0) * DEG;
      var decay = clamp(num(p.abfall, 0), 0, 1);
      var cx = num(p.cx, 0);
      var cy = num(p.cy, 0);

      // step matrix M = T(cx,cy) · R(rot) · S(s) · T(-cx,-cy)
      var ca = Math.cos(rot), sa = Math.sin(rot);
      var step = [
        ca * s, sa * s, -sa * s, ca * s,
        cx - (ca * cx - sa * cy) * s,
        cy - (sa * cx + ca * cy) * s
      ];
      var keep = 1 - decay; // alpha factor per step

      return {
        affine: true,
        instances: function () {
          var list = [{ m: IDENT, alpha: 1 }];
          var m = IDENT;
          var alpha = 1;
          for (var k = 1; k <= n; k++) {
            m = matMul(step, m); // powers of the step matrix
            alpha *= keep;
            if (alpha < 0.004) break; // invisible copies waste the budget
            list.push({ m: m, alpha: alpha });
          }
          return list;
        }
      };
    },

    hit: function (block, wx, wy, view) {
      var p = block.params;
      var grab = 24 / Math.max(1e-6, view.scale);
      var d = Math.hypot(wx - num(p.cx, 0), wy - num(p.cy, 0));
      return d <= grab ? 'center' : null;
    },

    drag: function (block, handle, dwx, dwy) {
      if (handle !== 'center') return;
      var p = block.params;
      p.cx = clamp(num(p.cx, 0) + dwx, -2000, 2000);
      p.cy = clamp(num(p.cy, 0) + dwy, -2000, 2000);
    },

    overlay: function (block, t, view) {
      var p = block.params;
      var s = Math.max(1e-6, view.scale);
      return [
        { k: 'dot', x: num(p.cx, 0), y: num(p.cy, 0), r: 4.5 / s, col: '#a8b8e8', glow: 8 }
      ];
    }
  });

  /* ================================================================
   * kaleidoskop — rotation + mirror matrices around the world origin
   * ================================================================ */

  OneCanvas.registerBlock({
    type: 'kaleidoskop',
    kind: 'kraft',
    label: 'Kaleidoskop',
    icon: '✦', // ✦
    schema: [
      { key: 'segmente', ctrl: 'slider', label: 'Segmente', min: 1, max: 24, step: 1, value: 6 },
      { key: 'spiegeln', ctrl: 'toggle', label: 'Spiegeln', value: true },
      { key: 'offset', ctrl: 'slider', label: 'Winkel-Offset', min: -180, max: 180, step: 1, value: 0, unit: '°' }
    ],

    force: function (block) {
      var p = block.params;
      var n = Math.max(1, Math.round(num(p.segmente, 1)));
      var mirror = !!p.spiegeln;
      var offset = num(p.offset, 0) * DEG;

      return {
        affine: true,
        instances: function () {
          var list = [];
          for (var k = 0; k < n; k++) {
            var a = offset + (k / n) * Math.PI * 2;
            var ca = Math.cos(a), sa = Math.sin(a);
            // R(a)
            list.push([ca, sa, -sa, ca, 0, 0]);
            // R(a) · scale(1,-1): mirror across the segment's base line
            if (mirror) list.push([ca, sa, sa, -ca, 0, 0]);
          }
          return list;
        }
      };
    }
  });
})();
