importScripts("perturb.js");

// One frame = one reference orbit plus view parameters; jobs are row ranges.
let frame = null;

const GLOW = [200, 224, 246];
const DEEP = [5, 7, 13];
const TIDE = [17, 33, 58];

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === "frame") { frame = m; return; }
  if (!frame || m.fid !== frame.fid) return;
  const { W, H, s, wcr, wci, inner, Zr, Zi, L, maxiter } = frame;
  const { y0, y1 } = m;
  const px = new Uint8ClampedArray((y1 - y0) * W * 4);
  const out = new Float64Array(2);
  let k = 0, late = 0, inside = 0;
  for (let y = y0; y < y1; y++) {
    const di = (H / 2 - y - 0.5) * s;
    for (let x = 0; x < W; x++, k += 4) {
      const dr = (x + 0.5 - W / 2) * s;
      const wr = wcr + dr, wi = wci + di;
      const aw = Math.hypot(wr, wi);
      let dcr, dci;
      if (inner) {
        // c - c_ref = 1/w - 1/wc = -d / (wc * w), exact in relative terms
        const qr = wcr * wr - wci * wi, qi = wcr * wi + wci * wr;
        const q2 = qr * qr + qi * qi;
        dcr = -(dr * qr + di * qi) / q2;
        dci = -(di * qr - dr * qi) / q2;
      } else {
        dcr = wr / aw / aw;
        dci = -wi / aw / aw;
      }
      iteratePixel(Zr, Zi, L, dcr, dci, maxiter, out);
      const esc = out[0];
      if (esc === 0) { px[k] = 1; px[k + 1] = 2; px[k + 2] = 4; px[k + 3] = 255; inside++; continue; }
      if (esc > maxiter / 2) late++;
      // distance to the set in screen pixels: |dw| = |w|^2 |dc|
      const dpx = out[1] * (aw / s) * aw;
      const line = 0.75 * Math.exp(-dpx * 1.6) + 0.08 * Math.exp(-dpx * 0.12);
      const g = line > 1 ? 1 : line;
      const band = 0.5 + 0.5 * Math.cos(Math.log2(esc) * 2.4);
      for (let c = 0; c < 3; c++) {
        const base = DEEP[c] + (TIDE[c] - DEEP[c]) * band;
        px[k + c] = base + (GLOW[c] - base) * g;
      }
      px[k + 3] = 255;
    }
  }
  self.postMessage({ fid: m.fid, y0, y1, px, late, inside }, [px.buffer]);
};
