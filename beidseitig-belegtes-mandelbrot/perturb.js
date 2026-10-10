// z -> z^2 + c for one pixel, as a perturbation delta around a high-precision
// reference orbit (Zr, Zi; indices 0..L). Rebasing (delta := full z, n := 0)
// replaces glitch detection and lets the reference end early.
// out[0]: smooth escape count, 0 = did not escape within maxiter.
// out[1]: distance estimate to the Mandelbrot set, in c units.
// With q > 0 the pixel is also tested for membership in the copy of the next
// lower level: every q steps the renormalized Z = l z must stay within 4. If it
// does for `rounds` rounds the function returns true and out is not set.
function iteratePixel(Zr, Zi, L, dcr, dci, maxiter, out, q = 0, lr = 0, li = 0, rounds = 0) {
  let dr = 0, di = 0, n = 0, der = 0, dei = 0, phase = q, left = rounds;
  for (let it = 0; it < maxiter; it++) {
    const Zrn = Zr[n], Zin = Zi[n];
    const zr = Zrn + dr, zi = Zin + di;
    const t = 2 * (zr * der - zi * dei) + 1;
    dei = 2 * (zr * dei + zi * der);
    der = t;
    const nr = 2 * (Zrn * dr - Zin * di) + dr * dr - di * di + dcr;
    di = 2 * (Zrn * di + Zin * dr) + 2 * dr * di + dci;
    dr = nr;
    n++;
    const fr = Zr[n] + dr, fi = Zi[n] + di;
    const r2 = fr * fr + fi * fi;
    if (!(r2 <= 1e8)) {
      const az = Math.sqrt(r2);
      if (!isFinite(az)) { out[0] = it + 1; out[1] = 0; return false; }
      out[0] = it + 2 - Math.log2(Math.log(az));
      out[1] = az * Math.log(az) / Math.hypot(der, dei);
      return false;
    }
    if (--phase === 0) {
      const ar = lr * fr - li * fi, ai = lr * fi + li * fr;
      if (ar * ar + ai * ai > 16) phase = -1;
      else if (--left === 0) return true;
      else phase = q;
    }
    if (n === L || r2 < dr * dr + di * di) { dr = fr; di = fi; n = 0; }
  }
  out[0] = 0;
  out[1] = 0;
  return false;
}

if (typeof module !== "undefined") module.exports = { iteratePixel };
