"use strict";

// Iterates z <- k z^2 + c from z = 0 for a band of rows and returns gray pixels.
// For k != 0 the set is M / k (z = w / k turns it into w <- w^2 + k c), so the
// cardioid and bulb tests run on k c. The escape test uses a large radius B / |k|
// instead of 2 / |k|, which keeps the distance estimate accurate; it does not
// change which points belong to the set.
const B = 1e3;
const INSIDE = 18;

self.onmessage = (e) => {
  const { id, w, row0, row1, x0, y0, s, k, maxit } = e.data;
  const out = new Uint8ClampedArray(w * (row1 - row0) * 4);
  const R2 = k === 0 ? Infinity : (B / Math.abs(k)) ** 2;
  const logK = Math.log(Math.abs(k));
  let p = 0;
  for (let y = row0; y < row1; y++) {
    const ci = y0 - (y + 0.5) * s;
    for (let x = 0; x < w; x++, p += 4) {
      const cr = x0 + (x + 0.5) * s;
      out[p + 3] = 255;
      if (inMainParts(k * cr, k * ci) || k === 0) {
        out[p] = out[p + 1] = out[p + 2] = INSIDE;
        continue;
      }
      let zr = 0, zi = 0, dr = 0, di = 0, n = 0, r2 = 0;
      for (; n < maxit; n++) {
        // dz/dc <- 2 k z dz/dc + 1, before z moves on
        const ndr = 2 * k * (zr * dr - zi * di) + 1;
        di = 2 * k * (zr * di + zi * dr);
        dr = ndr;
        const nzr = k * (zr * zr - zi * zi) + cr;
        zi = 2 * k * zr * zi + ci;
        zr = nzr;
        r2 = zr * zr + zi * zi;
        if (r2 > R2) break;
      }
      if (n === maxit) {
        out[p] = out[p + 1] = out[p + 2] = INSIDE;
        continue;
      }
      // distance to the set in c units: |z| ln|k z| / |dz/dc|, then in pixels
      const az = Math.sqrt(r2);
      const d = az * (Math.log(az) + logK) / Math.hypot(dr, di);
      const t = Math.max(0, 1 - Math.log2(1 + d / s) / 7);
      const g = 6 + 240 * t * t * t;
      out[p] = out[p + 1] = out[p + 2] = g;
    }
  }
  self.postMessage({ id, row0, row1, out }, [out.buffer]);
};

// main cardioid and period-2 bulb of the classic set, in w-coordinates
function inMainParts(r, i) {
  const x = r - 0.25, q = x * x + i * i;
  if (q * (q + x) <= 0.25 * i * i) return true;
  return (r + 1) * (r + 1) + i * i <= 0.0625;
}
