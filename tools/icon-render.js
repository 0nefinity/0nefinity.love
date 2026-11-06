// Rechnet ein Symbol (Teile = Glyphen-Umrisse samt Lage) in SVG-Inhalt um. Einziger Renderer: der
// Icon-Designer (/icon-entwuerfe) ruft ihn beim Speichern auf und legt das Ergebnis als "inhalt" in
// tools/editor-symbole.js ab; Menue, Editor und die anderen Seiten setzen nur noch diesen Text ein.
// Teil: d (Umriss, Glyphe auf Grundlinie 0), x/y (Verschiebung), drehung/neigung (Grad), skalaX/skalaY,
// kruemmung (Grad Bogen ueber die Breite), aussparung (Strichbreite, mit der das Teil alle Teile davor
// ausschneidet), stopp [dx, dy] (Versatz im Stoppschild der Menue-Lupe). Drehen, Neigen und Skalieren
// wirken um die Mitte des Teils.
(function (root) {
  'use strict';

  function num(v, digits) {
    let s = (+v).toFixed(digits);
    if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s === '-0' ? '0' : s;
  }

  function parse(d) {
    const tokens = String(d).match(/[MLHVQCZmlhvqcz]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) || [];
    const segs = [];
    let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0;
    const n = () => {
      const v = parseFloat(tokens[i++]);
      if (!Number.isFinite(v)) throw new Error('Umriss nicht lesbar: ' + String(d).slice(0, 40));
      return v;
    };
    while (i < tokens.length) {
      if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++];
      const rel = cmd === cmd.toLowerCase();
      const ox = rel ? x : 0, oy = rel ? y : 0;
      switch (cmd.toUpperCase()) {
        case 'M': x = ox + n(); y = oy + n(); sx = x; sy = y; segs.push({ c: 'M', p: [x, y] }); cmd = rel ? 'l' : 'L'; break;
        case 'L': x = ox + n(); y = oy + n(); segs.push({ c: 'L', p: [x, y] }); break;
        case 'H': x = ox + n(); segs.push({ c: 'L', p: [x, y] }); break;
        case 'V': y = oy + n(); segs.push({ c: 'L', p: [x, y] }); break;
        case 'Q': { const p = [ox + n(), oy + n(), ox + n(), oy + n()]; x = p[2]; y = p[3]; segs.push({ c: 'Q', p }); break; }
        case 'C': { const p = [ox + n(), oy + n(), ox + n(), oy + n(), ox + n(), oy + n()]; x = p[4]; y = p[5]; segs.push({ c: 'C', p }); break; }
        case 'Z': x = sx; y = sy; segs.push({ c: 'Z', p: [] }); break;
        default: throw new Error('Pfadbefehl nicht unterstuetzt: ' + cmd);
      }
    }
    return segs;
  }

  function serialize(segs) {
    return segs.map((s) => s.c + s.p.map((v) => num(v, 1)).join(' ')).join('');
  }

  // Exakte Huelle (wie getBBox): Endpunkte plus Extremstellen der Kurven.
  function bbox(segs) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, cx = 0, cy = 0, sx = 0, sy = 0;
    const add = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
    for (const s of segs) {
      const p = s.p;
      if (s.c === 'M') { cx = sx = p[0]; cy = sy = p[1]; add(cx, cy); continue; }
      if (s.c === 'Z') { cx = sx; cy = sy; continue; }
      if (s.c === 'Q') {
        for (const k of [0, 1]) {
          const a = k ? cy : cx, den = a - 2 * p[k] + p[2 + k];
          const t = den ? (a - p[k]) / den : -1;
          if (t > 0 && t < 1) {
            const u = 1 - t;
            add(u * u * cx + 2 * u * t * p[0] + t * t * p[2], u * u * cy + 2 * u * t * p[1] + t * t * p[3]);
          }
        }
      } else if (s.c === 'C') {
        for (const k of [0, 1]) {
          const a = k ? cy : cx, b = p[k], c = p[2 + k], e = p[4 + k];
          const qa = -a + 3 * b - 3 * c + e, qb = 2 * (a - 2 * b + c), qc = b - a;
          const ts = [];
          if (Math.abs(qa) < 1e-12) { if (qb) ts.push(-qc / qb); } else {
            const disc = qb * qb - 4 * qa * qc;
            if (disc >= 0) { const r = Math.sqrt(disc); ts.push((-qb + r) / (2 * qa), (-qb - r) / (2 * qa)); }
          }
          for (const t of ts) if (t > 0 && t < 1) add(...cubicAt([cx, cy], p, t));
        }
      }
      const n = p.length;
      cx = p[n - 2]; cy = p[n - 1];
      add(cx, cy);
    }
    if (x0 === Infinity) return { x: 0, y: 0, w: 0, h: 0 };
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  function cubicAt(s, p, t) {
    const u = 1 - t;
    return [0, 1].map((k) => u * u * u * s[k] + 3 * u * u * t * p[k] + 3 * u * t * t * p[2 + k] + t * t * t * p[4 + k]);
  }

  // Kruemmung: Teil auf einen Kreisbogen legen (Mitte unter/ueber dem Teil). Strecken und Kurven werden
  // vorher unterteilt, damit der Bogen rund wird.
  function bend(segs, deg) {
    const b = bbox(segs);
    if (!deg || !b.w) return segs;
    const R = b.w / (deg * Math.PI / 180);
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const warp = (x, y) => {
      const a = (x - cx) / R, r = R - (y - cy);
      return [cx + r * Math.sin(a), cy + R - r * Math.cos(a)];
    };
    const out = [];
    let px = 0, py = 0, sx = 0, sy = 0;
    const lerp = (a, b, t) => a + (b - a) * t;
    for (const s of segs) {
      const p = s.p;
      if (s.c === 'M') { px = sx = p[0]; py = sy = p[1]; out.push({ c: 'M', p: warp(px, py) }); continue; }
      if (s.c === 'L' || s.c === 'Z') {
        const ex = s.c === 'Z' ? sx : p[0], ey = s.c === 'Z' ? sy : p[1];
        for (let k = 1; k <= 8; k++) out.push({ c: 'L', p: warp(lerp(px, ex, k / 8), lerp(py, ey, k / 8)) });
        if (s.c === 'Z') out.push({ c: 'Z', p: [] });
        px = ex; py = ey;
        continue;
      }
      // Kurven in 4 Stuecke teilen (de Casteljau), Kontrollpunkte mitbiegen.
      const pts = [[px, py]];
      for (let k = 0; k < p.length; k += 2) pts.push([p[k], p[k + 1]]);
      for (let k = 0; k < 4; k++) {
        const t0 = k / 4, t1 = (k + 1) / 4;
        const piece = sub(pts, t0, t1);
        out.push({ c: s.c, p: piece.slice(1).flatMap(([x, y]) => warp(x, y)) });
      }
      px = p[p.length - 2]; py = p[p.length - 1];
    }
    return out;
  }

  // Teilstueck [t0, t1] einer Bezierkurve (Kontrollpunkte pts).
  function sub(pts, t0, t1) {
    const split = (q, t) => { // linke und rechte Haelfte bei t
      const left = [q[0]], right = [q[q.length - 1]];
      let cur = q;
      while (cur.length > 1) {
        const nx = [];
        for (let i = 0; i < cur.length - 1; i++) nx.push([cur[i][0] + (cur[i + 1][0] - cur[i][0]) * t, cur[i][1] + (cur[i + 1][1] - cur[i][1]) * t]);
        left.push(nx[0]); right.unshift(nx[nx.length - 1]);
        cur = nx;
      }
      return [left, right];
    };
    const right = split(pts, t0)[1];
    return split(right, t0 < 1 ? (t1 - t0) / (1 - t0) : 0)[0];
  }

  const mul = (A, B) => [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3],
    A[1] * B[2] + A[3] * B[3], A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];

  function matrix(t, b) {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const r = (t.drehung ?? 0) * Math.PI / 180, k = (t.neigung ?? 0) * Math.PI / 180;
    let M = [1, 0, 0, 1, (t.x ?? 0) + cx, (t.y ?? 0) + cy];
    M = mul(M, [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]);
    M = mul(M, [1, 0, Math.tan(k), 1, 0, 0]);
    M = mul(M, [t.skalaX ?? 1, 0, 0, t.skalaY ?? 1, 0, 0]);
    return mul(M, [1, 0, 0, 1, -cx, -cy]);
  }

  function transformAttr(M) {
    const lin = [M[0], M[1], M[2], M[3]].map((v) => +v.toFixed(6));
    if (lin[0] === 1 && lin[1] === 0 && lin[2] === 0 && lin[3] === 1) {
      const e = num(M[4], 3), f = num(M[5], 3);
      return e === '0' && f === '0' ? '' : `translate(${e} ${f})`;
    }
    return `matrix(${lin.map((v) => num(v, 6)).join(' ')} ${num(M[4], 3)} ${num(M[5], 3)})`;
  }

  // Form eines Teils: gebogener Umriss (oder der Umriss unveraendert) plus Transform-Attribut.
  function form(t) {
    const segs = parse(t.d);
    const bent = t.kruemmung ? bend(segs, t.kruemmung) : null;
    const d = bent ? serialize(bent) : t.d;
    const tf = transformAttr(matrix(t, bbox(bent || segs)));
    return { d, tf, path: `<path d="${d}"${tf ? ` transform="${tf}"` : ''}/>` };
  }

  // SVG-Inhalt eines Symbols. "{id}" steht fuer eine je Einbau eindeutige Masken-Kennung.
  function render(sym) {
    const teile = sym.teile || [];
    const forms = teile.map(form);
    const [vx, vy, vw, vh] = sym.viewBox;
    const box = `x="${num(vx - vw, 3)}" y="${num(vy - vh, 3)}" width="${num(3 * vw, 3)}" height="${num(3 * vh, 3)}"`;
    const masks = new Map();
    let out = '';
    teile.forEach((t, i) => {
      const cutters = [];
      for (let j = i + 1; j < teile.length; j++) if ((teile[j].aussparung ?? 0) > 0) cutters.push(j);
      let el = forms[i].path;
      if (cutters.length) {
        const key = cutters.join(',');
        if (!masks.has(key)) masks.set(key, { cutters, id: '' });
        const m = masks.get(key);
        el = forms[i].tf ? `<g mask="url(#M${key})">${el}</g>` : el.replace('/>', ` mask="url(#M${key})"/>`);
        m.used = true;
      }
      if (t.stopp && (t.stopp[0] || t.stopp[1])) {
        el = `<g class="sym-teil" style="--stopp-x:${num(t.stopp[0], 3)}px;--stopp-y:${num(t.stopp[1], 3)}px">${el}</g>`;
      }
      out += el;
    });
    let defs = '';
    let n = 0;
    for (const [key, m] of masks) {
      const id = masks.size === 1 ? '{id}' : `{id}-${++n}`;
      out = out.split(`url(#M${key})`).join(`url(#${id})`);
      defs += `<mask id="${id}" maskUnits="userSpaceOnUse" ${box}><rect ${box} fill="#fff"/>` +
        m.cutters.map((j) => `<g fill="#000" stroke="#000" stroke-width="${num(teile[j].aussparung, 3)}" stroke-linejoin="round">${forms[j].path}</g>`).join('') +
        '</mask>';
    }
    return defs + out;
  }

  const api = { parse, serialize, bbox, bend, matrix, form, render, num };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OneIconRender = api;
})(typeof window !== 'undefined' ? window : globalThis);
