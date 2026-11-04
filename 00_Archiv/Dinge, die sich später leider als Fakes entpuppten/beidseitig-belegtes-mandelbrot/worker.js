importScripts("perturb.js");

// One frame = the view plus one reference orbit per visible level; jobs are tiles.
// A pixel starts at the top level and moves one level down while it lies in that
// level's copy of the next lower one; where it stops, it is iterated for real.
// Result per pixel: [band value, distance to the set in pixels]; band is
// -Infinity inside the set. Coloring happens on the main thread.
let frame = null;

const RHO2 = 50 * 50;   // beyond |m| = 50 nothing belongs to the copy
const MIN_BLOCK = 6;

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === "frame") {
    frame = m;
    const reach = m.s * Math.hypot(m.W, m.H) / 2;
    for (const lv of m.levels) {
      const bla = buildBLA(lv.Zr, lv.Zi, lv.L, Math.hypot(lv.d0r, lv.d0i) + reach * lv.lamAbs, lv.maxiter);
      // probe a corner and halfway to it; skips help only where deltas stay small
      const pays = (f) => {
        const ur = f * m.W / 2 * m.s, ui = f * m.H / 2 * m.s;
        return blaPays(lv.Zr, lv.Zi, lv.L, lv.d0r + lv.lr * ur - lv.li * ui, lv.d0i + lv.lr * ui + lv.li * ur, lv.maxiter, bla);
      };
      lv.bla = pays(1) || pays(0.5) ? bla : null;
    }
    return;
  }
  if (!frame || m.fid !== frame.fid) return;
  const { W, H, s, top, low, levels, rounds } = frame;
  const { x0, y0, x1, y1 } = m;
  const tw = x1 - x0, th = y1 - y0;
  const res = new Float32Array(tw * th * 2);
  const done = new Uint8Array(tw * th);
  const out = new Float64Array(2);
  let late = 0, inside = 0, near = true;

  // Returns true if the pixel is inside the set. The cycle check runs only next
  // to inside pixels (`near`); elsewhere it would slow down every escaping pixel.
  const pixel = (x, y) => {
    const k = (y - y0) * tw + (x - x0);
    if (done[k]) return res[2 * k] === -Infinity;
    done[k] = 1;
    const ur = (x + 0.5 - W / 2) * s, ui = (H / 2 - y - 0.5) * s;
    let j = top, lv;
    for (;;) {
      lv = levels[j - low];
      let q = 0;
      if (j > low) {
        const b = levels[j - 1 - low];
        const mr = b.cr + b.lr * ur - b.li * ui, mi = b.ci + b.lr * ui + b.li * ur;
        if (mr * mr + mi * mi < RHO2) q = lv.q;
      }
      // d0: view center minus the reference point, which may lie off center
      const dcr = lv.d0r + lv.lr * ur - lv.li * ui, dci = lv.d0i + lv.lr * ui + lv.li * ur;
      if (!iteratePixel(lv.Zr, lv.Zi, lv.L, dcr, dci, lv.maxiter, out, q, lv.l[0], lv.l[1], rounds, lv.bla, near)) break;
      j--;
    }
    const esc = out[0];
    near = esc === 0;
    if (near) { res[2 * k] = -Infinity; res[2 * k + 1] = 0; inside++; return true; }
    if (esc > lv.maxiter / 2) late++;
    // escape counts of level j shrink by q_j one level down; offset keeps colors continuous
    res[2 * k] = Math.log2(esc) - lv.offset;
    res[2 * k + 1] = out[1] / lv.lamAbs / s;
    return false;
  };

  // Mariani-Silver for the inside only: the set is full (its complement is
  // connected), so a rectangle whose border lies in the set is in the set.
  const block = (bx0, by0, bx1, by1) => {
    if (bx1 - bx0 <= MIN_BLOCK || by1 - by0 <= MIN_BLOCK) {
      for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) pixel(x, y);
      return;
    }
    let all = true;
    for (let x = bx0; x < bx1; x++) { all = pixel(x, by0) && all; all = pixel(x, by1 - 1) && all; }
    for (let y = by0 + 1; y < by1 - 1; y++) { all = pixel(bx0, y) && all; all = pixel(bx1 - 1, y) && all; }
    if (all) {
      for (let y = by0 + 1; y < by1 - 1; y++) {
        for (let x = bx0 + 1; x < bx1 - 1; x++) {
          const k = (y - y0) * tw + (x - x0);
          if (!done[k]) { done[k] = 1; res[2 * k] = -Infinity; inside++; }
        }
      }
      return;
    }
    const mx = (bx0 + bx1) >> 1, my = (by0 + by1) >> 1;
    block(bx0, by0, mx, my);
    block(mx, by0, bx1, my);
    block(bx0, my, mx, by1);
    block(mx, my, bx1, by1);
  };

  block(x0, y0, x1, y1);
  self.postMessage({ fid: m.fid, x0, y0, x1, y1, res, late, inside }, [res.buffer]);
};
