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
  var INSTANCE_BUDGET = 1500; // mirrors engine INSTANCE_CAP (not exported):
  // Instanzlisten leicht ÜBER dem Budget erzeugen ist ok — die Engine kappt
  // selbst und zeigt die Limit-Pille; weit darüber wäre nur Alloc-Verschwendung.

  /* ---------- helpers ---------- */

  // smooth falloff: 1 at the center, 0 at distance >= radius, C1-continuous.
  // kernel ('Kernel-Breite', co0rdinates-ε sinngemäß) shapes the profile:
  // u^kernel before the smoothstep — >1 = breiter/flacher Einflusskern,
  // <1 = schmal/spitz am Zentrum, 1 = unverändert (Default).
  function falloff(dist, radius, kernel) {
    if (!(radius > 0)) return 0;
    var u = dist / radius;
    if (u >= 1) return 0;
    if (u <= 0) return 1;
    if (kernel > 0 && kernel !== 1) u = Math.pow(u, kernel);
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
      // Chirp (co0rdinates-β sinngemäß): quadratische Phasen-Drift über den
      // Radius — nahe dem Zentrum fast unverändert, außen zunehmender Drall
      { key: 'chirp', ctrl: 'slider', label: 'Chirp', min: -100, max: 100, step: 1, value: 0 },
      { key: 'kernel', ctrl: 'slider', label: 'Kernel-Breite', min: 0.1, max: 5, step: 0.05, value: 1, decimals: 2 },
      { key: 'cx', ctrl: 'slider', label: 'Zentrum X', min: -2000, max: 2000, step: 1, value: 0 },
      { key: 'cy', ctrl: 'slider', label: 'Zentrum Y', min: -2000, max: 2000, step: 1, value: 0 }
    ],

    // twist/sog maps depend only on params; welle animates with t
    timeInvariant: function (block) { return block.params.art !== 'welle'; },

    force: function (block, t) {
      var p = block.params;
      var art = p.art;
      var strength = num(p.staerke, 0) / 100; // -1 .. 1
      // Radius frei: <=0 => falloff ist überall 0 => Kraft neutral
      var radius = num(p.radius, 420);
      var kernel = Math.abs(num(p.kernel, 1));
      var chirp = num(p.chirp, 0) / 100;
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
          var f = falloff(d, radius, kernel);
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
          var f = falloff(d, radius, kernel);
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
          var f = falloff(d, radius, kernel);
          if (f <= 0) return [x, y];
          var a = maxAngle * f;
          var ca = Math.cos(a), sa = Math.sin(a);
          return [cx + dx * ca - dy * sa, cy + dx * sa + dy * ca];
        };
      }

      if (chirp) {
        // Chirp: zusätzlicher Drall, dessen Winkel quadratisch mit dem
        // normierten Radius wächst (β·π·u²) — mit falloff multipliziert,
        // damit der Raum an der Radiusgrenze stetig bleibt
        var base = map;
        map = function (x, y) {
          var o = base(x, y);
          var dx = o[0] - cx, dy = o[1] - cy;
          var d = Math.hypot(dx, dy);
          var f = falloff(d, radius, kernel);
          if (f <= 0 || !(radius > 0)) return o;
          var u = d / radius;
          var a = chirp * Math.PI * u * u * f;
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
      p.cx = num(p.cx, 0) + dwx;
      p.cy = num(p.cy, 0) + dwy;
    },

    overlay: function (block, t, view) {
      var p = block.params;
      var s = Math.max(1e-6, view.scale);
      var cx = num(p.cx, 0);
      var cy = num(p.cy, 0);
      var r = Math.max(1, Math.abs(num(p.radius, 420)));
      return [
        { k: 'poly', pts: circlePts(cx, cy, r, 96), closed: true,
          w: 1.25 / s, col: 'rgba(168,184,232,0.55)', dash: [7 / s, 7 / s] },
        { k: 'dot', x: cx, y: cy, r: 4.5 / s, col: '#a8b8e8', glow: 8 }
      ];
    }
  });

  /* ================================================================
   * fraktal — affine self-similar repetition with opacity decay
   *
   * Ausbau nach circleheart.html Fraktalmodus (Z. 51-64 / Render-Loop):
   * - innere UND äußere Fraktale getrennt schaltbar. Wie im Original wird
   *   die Skalierung normalisiert: innen schrumpft immer (base<1), außen
   *   wächst immer (base>1), egal wie herum 'Skalierung/Schritt' steht.
   * - 'Fraktal-Verzögerung' (fractalDelay sinngemäß): Kopie k benutzt das
   *   Fraktal-Zentrum von vor k·delay Sekunden (History im block.state).
   *   Beim Ziehen des Zentrums schleppen die Kopien sichtbar nach; die
   *   Form-History des Originals ist im generischen Kraft-Modell nicht
   *   abbildbar (Kräfte sehen nur Matrizen, nicht die Emitter-Params).
   * ================================================================ */

  var FRAKTAL_HIST_MAX = 900; // ~15 s bei 60 fps

  // Zentrum von vor `ago` Sekunden aus der History (linear interpoliert)
  function fraktalHistCenter(hist, tNow, ago, cx, cy) {
    if (!hist.length || ago <= 0) return [cx, cy];
    var target = tNow - ago;
    var i = hist.length - 1;
    if (target >= hist[i].t) return [cx, cy];
    while (i > 0 && hist[i - 1].t > target) i--;
    if (i === 0) return [hist[0].x, hist[0].y];
    var a = hist[i - 1], b = hist[i];
    var span = b.t - a.t;
    var f = span > 1e-9 ? (target - a.t) / span : 1;
    return [a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f];
  }

  OneCanvas.registerBlock({
    type: 'fraktal',
    kind: 'kraft',
    label: 'Fraktal-Wiederholung',
    icon: '❂', // eigenes Icon (war ✦ wie verzerren/kaleidoskop)
    schema: [
      { key: 'anzahl', ctrl: 'slider', label: 'Anzahl', min: 0, max: 60, step: 1, value: 8 },
      { key: 'skalierung', ctrl: 'slider', label: 'Skalierung/Schritt', min: 0.5, max: 1.5, step: 0.01, value: 0.86, decimals: 2 },
      { key: 'rotation', ctrl: 'slider', label: 'Rotation/Schritt', min: -90, max: 90, step: 1, value: 12, unit: '°' },
      { key: 'abfall', ctrl: 'slider', label: 'Deckkraft-Abfall', min: 0, max: 1, step: 0.01, value: 0.35, decimals: 2 },
      { key: 'innen', ctrl: 'toggle', label: 'Innere Fraktale', value: true },
      { key: 'aussen', ctrl: 'toggle', label: 'Äußere Fraktale', value: false },
      { key: 'delay', ctrl: 'slider', label: 'Fraktal-Verzögerung', min: 0, max: 0.5, step: 0.01, value: 0, decimals: 2, unit: 's/Schritt' },
      // Default-Zentrum leicht versetzt: deckungsgleich mit einem
      // zentrierten Symbol wären alle Kopien unsichtbar gestapelt
      { key: 'cx', ctrl: 'slider', label: 'Zentrum X', min: -2000, max: 2000, step: 1, value: 60 },
      { key: 'cy', ctrl: 'slider', label: 'Zentrum Y', min: -2000, max: 2000, step: 1, value: 0 }
    ],

    // ohne Verzögerung hängen die Matrizen nur an params -> layer-cachebar;
    // mit Verzögerung wandern die Kopien der History hinterher (zeitvariant)
    timeInvariant: function (block) { return !num(block.params.delay, 0); },

    force: function (block, t) {
      var p = block.params;
      // frei nach oben, aber nie mehr Instanzen bauen als die Engine je
      // zeichnet (Budget+1 => Engine kappt und zeigt die Limit-Pille)
      var n = Math.min(INSTANCE_BUDGET + 1, Math.max(0, Math.round(num(p.anzahl, 0))));
      var s = num(p.skalierung, 1);
      var rot = num(p.rotation, 0) * DEG;
      var decay = clamp(num(p.abfall, 0), 0, 1);
      var cx = num(p.cx, 0);
      var cy = num(p.cy, 0);
      var inner = p.innen !== false;
      var outer = !!p.aussen;
      var delay = Math.max(0, num(p.delay, 0));
      var keep = 1 - decay; // alpha factor per step

      // Zentrum-History für die Verzögerung (ein Push pro Frame; force()
      // läuft pro Emitter, t ändert sich aber nur einmal pro Frame)
      var st = block.state || (block.state = {});
      if (!st.hist) st.hist = [];
      if (delay > 0) {
        if (st.histT !== t) {
          st.histT = t;
          st.hist.push({ t: t, x: cx, y: cy });
          if (st.hist.length > FRAKTAL_HIST_MAX) {
            st.hist.splice(0, st.hist.length - FRAKTAL_HIST_MAX);
          }
        }
      } else if (st.hist.length) {
        st.hist.length = 0;
        st.histT = null;
      }
      var hist = st.hist;

      // Skalierungs-Normalisierung wie das Original (circleheart Z. 397-399):
      // outwardBase wächst, inwardBase schrumpft — unabhängig davon, ob
      // 'Skalierung/Schritt' über oder unter 1 steht
      var absS = Math.abs(s);
      var degenerate = !(absS > 0) || Math.abs(absS - 1) <= 0.001;
      var outwardBase = absS < 1 ? (1 / s) : s;
      var inwardBase = absS < 1 ? s : (1 / s);

      // eine Instanz für Schritt k in Richtung base^k um das (ggf.
      // historische) Zentrum: T(c) · R(rot·k) · S(base^k) · T(-c)
      function stepInstance(base, k, alpha) {
        var f = Math.pow(base, k);
        if (!isFinite(f) || Math.abs(f) < 1e-6 || Math.abs(f) > 1e6) return null;
        var a = rot * k;
        var ca = Math.cos(a), sa = Math.sin(a);
        var c = delay > 0 ? fraktalHistCenter(hist, t, k * delay, cx, cy) : [cx, cy];
        var hx = c[0], hy = c[1];
        return {
          m: [
            ca * f, sa * f, -sa * f, ca * f,
            hx - (ca * hx - sa * hy) * f,
            hy - (sa * hx + ca * hy) * f
          ],
          alpha: alpha
        };
      }

      return {
        affine: true,
        instances: function () {
          var list = [{ m: IDENT, alpha: 1 }];
          if (degenerate || (!inner && !outer)) return list;
          var alpha, k, inst;
          if (inner) {
            alpha = 1;
            for (k = 1; k <= n && list.length <= INSTANCE_BUDGET; k++) {
              alpha *= keep;
              if (alpha < 0.004) break; // invisible copies waste the budget
              inst = stepInstance(inwardBase, k, alpha);
              if (!inst) break;
              list.push(inst);
            }
          }
          if (outer) {
            alpha = 1;
            for (k = 1; k <= n && list.length <= INSTANCE_BUDGET; k++) {
              alpha *= keep;
              if (alpha < 0.004) break;
              inst = stepInstance(outwardBase, k, alpha);
              if (!inst) break;
              list.push(inst);
            }
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
      p.cx = num(p.cx, 0) + dwx;
      p.cy = num(p.cy, 0) + dwy;
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
    icon: '❋', // eigenes Icon (war ✦ wie verzerren/fraktal)
    schema: [
      { key: 'segmente', ctrl: 'slider', label: 'Segmente', min: 0, max: 24, step: 1, value: 6 },
      { key: 'spiegeln', ctrl: 'toggle', label: 'Spiegeln', value: true },
      { key: 'offset', ctrl: 'slider', label: 'Winkel-Offset', min: -180, max: 180, step: 1, value: 0, unit: '°' },
      { key: 'deckkraft', ctrl: 'slider', label: 'Deckkraft', min: 0, max: 4, step: 0.05, value: 1, decimals: 2 }
    ],

    // instance matrices depend only on params -> layer-cache compatible
    timeInvariant: true,

    force: function (block) {
      var p = block.params;
      // 0 Segmente = Identität: leere Instanzliste -> die Engine normalisiert
      // sie zur Einheitsmatrix, der Inhalt bleibt unverändert sichtbar
      // (mathematisch ehrlich: 0 Symmetrie-Operationen = keine Veränderung).
      // Negative Werte: Drehrichtung ist symmetrisch -> Betrag.
      // Ober-Cap = Instanz-Budget+1: Engine kappt selbst + zeigt die Pille.
      var n = Math.min(INSTANCE_BUDGET + 1, Math.round(Math.abs(num(p.segmente, 0))));
      var mirror = !!p.spiegeln;
      var offset = num(p.offset, 0) * DEG;
      var deck = Math.max(0, num(p.deckkraft, 1));

      return {
        affine: true,
        instances: function () {
          if (!n) return []; // 0 = Identität
          // Weiß-Sättigungs-Schutz: Alpha ~ 1/sqrt(Instanzzahl),
          // 'Deckkraft' übersteuert (1 = Auto-Normalisierung)
          var nInst = mirror ? n * 2 : n;
          var alpha = Math.min(1, deck * 3 / Math.sqrt(nInst));
          if (alpha <= 0) return [];
          var list = [];
          for (var k = 0; k < n; k++) {
            var a = offset + (k / n) * Math.PI * 2;
            var ca = Math.cos(a), sa = Math.sin(a);
            // R(a)
            list.push({ m: [ca, sa, -sa, ca, 0, 0], alpha: alpha });
            // R(a) · scale(1,-1): mirror across the segment's base line
            if (mirror) list.push({ m: [ca, sa, sa, -ca, 0, 0], alpha: alpha });
          }
          return list;
        }
      };
    },

    // Ursprungs-Andeutung: Zentrum-Punkt + gestrichelte Segmentgrenzen
    overlay: function (block, t, view) {
      var p = block.params;
      var s = Math.max(1e-6, view.scale);
      var n = Math.min(48, Math.round(Math.abs(num(p.segmente, 0))));
      var offset = num(p.offset, 0) * DEG;
      var R = 110 / s; // bildschirm-konstant, dezent
      var prims = [
        { k: 'dot', x: 0, y: 0, r: 4.5 / s, col: '#a8b8e8', glow: 8 }
      ];
      for (var k = 0; k < n; k++) {
        var a = offset + (k / n) * Math.PI * 2;
        prims.push({
          k: 'poly', pts: [0, 0, Math.cos(a) * R, Math.sin(a) * R],
          w: 1 / s, dash: [5 / s, 5 / s], col: 'rgba(168,184,232,0.45)'
        });
      }
      return prims;
    }
  });
})();
