importScripts("perturb.js");

// One frame = the view plus one reference orbit per visible level; jobs are row ranges.
// A pixel starts at the top level and moves one level down while it lies in that
// level's copy of the next lower one; where it stops, it is iterated for real.
let frame = null;

const GLOW = [200, 224, 246];
const DEEP = [5, 7, 13];
const TIDE = [17, 33, 58];
const RHO2 = 50 * 50;   // beyond |m| = 50 nothing belongs to the copy

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === "frame") { frame = m; return; }
  if (!frame || m.fid !== frame.fid) return;
  const { W, H, s, top, low, levels, rounds } = frame;
  const { y0, y1 } = m;
  const px = new Uint8ClampedArray((y1 - y0) * W * 4);
  const out = new Float64Array(2);
  let k = 0, late = 0, inside = 0;
  for (let y = y0; y < y1; y++) {
    const ui = (H / 2 - y - 0.5) * s;
    for (let x = 0; x < W; x++, k += 4) {
      const ur = (x + 0.5 - W / 2) * s;
      let j = top, lv;
      for (;;) {
        lv = levels[j - low];
        let q = 0;
        if (j > low) {
          const b = levels[j - 1 - low];
          const mr = b.cr + b.lr * ur - b.li * ui, mi = b.ci + b.lr * ui + b.li * ur;
          if (mr * mr + mi * mi < RHO2) q = lv.q;
        }
        const dcr = lv.lr * ur - lv.li * ui, dci = lv.lr * ui + lv.li * ur;
        if (!iteratePixel(lv.Zr, lv.Zi, lv.L, dcr, dci, lv.maxiter, out, q, lv.l[0], lv.l[1], rounds)) break;
        j--;
      }
      const esc = out[0];
      if (esc === 0) { px[k] = 1; px[k + 1] = 2; px[k + 2] = 4; px[k + 3] = 255; inside++; continue; }
      if (esc > lv.maxiter / 2) late++;
      const dpx = out[1] / lv.lamAbs / s;
      const line = 0.75 * Math.exp(-dpx * 1.6) + 0.08 * Math.exp(-dpx * 0.12);
      const g = line > 1 ? 1 : line;
      // escape counts of level j shrink by q_j one level down; offset keeps colors continuous
      const band = 0.5 + 0.5 * Math.cos((Math.log2(esc) - lv.offset) * 2.4);
      for (let c = 0; c < 3; c++) {
        const base = DEEP[c] + (TIDE[c] - DEEP[c]) * band;
        px[k + c] = base + (GLOW[c] - base) * g;
      }
      px[k + 3] = 255;
    }
  }
  self.postMessage({ fid: m.fid, y0, y1, px, late, inside }, [px.buffer]);
};
