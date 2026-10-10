// z -> z^2 + c for one pixel, as a perturbation delta around a high-precision
// reference orbit (Zr, Zi; indices 0..L). Rebasing (delta := full z, n := 0)
// replaces glitch detection and lets the reference end early.
// out[0]: smooth escape count, 0 = did not escape within maxiter or found inside.
// out[1]: distance estimate to the Mandelbrot set, in c units.
// With q > 0 the pixel is also tested for membership in the copy of the next
// lower level: every q steps the renormalized Z = l z must stay within 4. If it
// does for `rounds` rounds the function returns true and out is not set.
// Inside points are caught early: Brent's cycle check on the full z, confirmed by
// the multiplier (product of 2z since the checkpoint) being below 1, i.e. the
// orbit has settled on an attracting cycle. The check costs about 40 % on escaping
// pixels, so callers switch it on (`cycles`) only where inside points are expected.
// Bilinear approximation (bla, from buildBLA) skips 2^k steps at once while the
// delta is small enough that delta^2 does not matter: delta' = A delta + B dc.
const EPS2 = 1e-24;
const BLA_MIN_K = 3;   // shorter skips cost more in lookups than they save

function iteratePixel(Zr, Zi, L, dcr, dci, maxiter, out, q = 0, lr = 0, li = 0, rounds = 0, bla = null, cycles = true) {
  if (!bla && !cycles) return iterateLean(Zr, Zi, L, dcr, dci, maxiter, out, q, lr, li, rounds);
  let dr = 0, di = 0, n = 0, der = 0, dei = 0, phase = q, left = rounds;
  let sr = 0, si = 0, mr = 1, mi = 0, window = 8, mark = 8;
  // after a failed attempt try again later and later, so views where skips are
  // rare do not pay for the lookup on every step
  let retry = 0, backoff = 1;
  for (let it = 0; it < maxiter;) {
    if (bla && it >= retry && n > 0 && phase < 0) {
      const d2 = dr * dr + di * di;
      // R shrinks with k at a fixed start, so climb until a level fails
      let top = n === 1 ? bla.K : 31 - Math.clz32((n - 1) & -(n - 1)), k = 0;
      if (top > bla.K) top = bla.K;
      while (k < top) {
        const lv = bla.levels[k + 1], i = (n - 1) >> (k + 1);
        if (i >= lv.count || !(d2 < lv.R2[i]) || it + (2 << k) > maxiter) break;
        k++;
      }
      if (k < BLA_MIN_K) {
        if (top > 0) { retry = it + backoff; if (backoff < 64) backoff *= 2; }
      } else {
        backoff = 1;
        const i = (n - 1) >> k, lv = bla.levels[k];
        const Ar = lv.Ar[i], Ai = lv.Ai[i], Br = lv.Br[i], Bi = lv.Bi[i];
        const ndr = Ar * dr - Ai * di + Br * dcr - Bi * dci;
        di = Ar * di + Ai * dr + Br * dci + Bi * dcr;
        dr = ndr;
        const t = Ar * der - Ai * dei + Br;
        dei = Ar * dei + Ai * der + Bi;
        der = t;
        n += 1 << k;
        it += 1 << k;
        const fr = Zr[n] + dr, fi = Zi[n] + di;
        if (cycles) {
          const u = Ar * mr - Ai * mi;
          mi = Ar * mi + Ai * mr;
          mr = u;
          if (it >= mark) { sr = fr; si = fi; mr = 1; mi = 0; window *= 2; mark = it + window; }
        }
        if (n === L || fr * fr + fi * fi < dr * dr + di * di) { dr = fr; di = fi; n = 0; }
        continue;
      }
    }
    const Zrn = Zr[n], Zin = Zi[n];
    const zr = Zrn + dr, zi = Zin + di;
    const t = 2 * (zr * der - zi * dei) + 1;
    dei = 2 * (zr * dei + zi * der);
    der = t;
    if (cycles) {
      const u = 2 * (zr * mr - zi * mi);
      mi = 2 * (zr * mi + zi * mr);
      mr = u;
    }
    const nr = 2 * (Zrn * dr - Zin * di) + dr * dr - di * di + dcr;
    di = 2 * (Zrn * di + Zin * dr) + 2 * dr * di + dci;
    dr = nr;
    n++;
    it++;
    const fr = Zr[n] + dr, fi = Zi[n] + di;
    const r2 = fr * fr + fi * fi;
    if (!(r2 <= 1e8)) {
      const az = Math.sqrt(r2);
      if (!isFinite(az)) { out[0] = it; out[1] = 0; return false; }
      out[0] = it + 1 - Math.log2(Math.log(az));
      out[1] = az * Math.log(az) / Math.hypot(der, dei);
      return false;
    }
    if (--phase === 0) {
      const ar = lr * fr - li * fi, ai = lr * fi + li * fr;
      if (ar * ar + ai * ai > 16) phase = -1;
      else if (--left === 0) return true;
      else phase = q;
    }
    if (cycles) {
      const er = fr - sr, ei = fi - si;
      if (er * er + ei * ei < EPS2 && mr * mr + mi * mi < 1) break;
      if (it >= mark) { sr = fr; si = fi; mr = 1; mi = 0; window *= 2; mark = it + window; }
    }
    if (n === L || r2 < dr * dr + di * di) { dr = fr; di = fi; n = 0; }
  }
  out[0] = 0;
  out[1] = 0;
  return false;
}

// The same iteration without skips and cycle check. Kept apart because the mere
// presence of those paths slows the loop by about 15 %, and most pixels of
// shallow views need neither.
function iterateLean(Zr, Zi, L, dcr, dci, maxiter, out, q, lr, li, rounds) {
  let dr = 0, di = 0, n = 0, der = 0, dei = 0, phase = q, left = rounds;
  for (let it = 1; it <= maxiter; it++) {
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
      if (!isFinite(az)) { out[0] = it; out[1] = 0; return false; }
      out[0] = it + 1 - Math.log2(Math.log(az));
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

// Whether skips pay off for a level: follow the pixel farthest from the reference
// (worst case, largest delta) exactly and count the steps at which a skip of at
// least 2^BLA_MIN_K would have been allowed.
function blaPays(Zr, Zi, L, dcr, dci, maxiter, bla) {
  if (!bla || bla.K < BLA_MIN_K) return false;
  const lv = bla.levels[BLA_MIN_K], span = 1 << BLA_MIN_K;
  let dr = 0, di = 0, n = 0, hits = 0, it = 1;
  for (; it <= maxiter; it++) {
    if (n > 0 && ((n - 1) & (span - 1)) === 0) {
      const i = (n - 1) >> BLA_MIN_K;
      if (i < lv.count && dr * dr + di * di < lv.R2[i]) hits++;
    }
    const Zrn = Zr[n], Zin = Zi[n];
    const nr = 2 * (Zrn * dr - Zin * di) + dr * dr - di * di + dcr;
    di = 2 * (Zrn * di + Zin * dr) + 2 * dr * di + dci;
    dr = nr;
    n++;
    const fr = Zr[n] + dr, fi = Zi[n] + di;
    const r2 = fr * fr + fi * fi;
    if (!(r2 <= 1e8)) break;
    if (n === L || r2 < dr * dr + di * di) { dr = fr; di = fi; n = 0; }
  }
  // a hit saves up to span steps; worth it once a tenth of the steps could be skipped
  return hits * span > 0.1 * it;
}

// Table of bilinear steps: level k entry i covers steps 1 + i 2^k .. (i + 1) 2^k,
// valid while |delta| < R. One step from m is A = 2 Z_m, B = 1, valid while the
// dropped delta^2 stays below BLA_EPS of the kept 2 Z_m delta. Merging x then y:
// A = Ay Ax, B = Ay Bx + By, R = min(Rx, (Ry - |Bx| dcMax) / |Ax|).
const BLA_EPS = 1e-12;
const BLA_MAX = 1 << 17;   // table covers this many steps, bounding memory per worker

function buildBLA(Zr, Zi, L, dcMax, maxiter) {
  const T = Math.min(L - 1, maxiter, BLA_MAX);
  if (T < 2) return null;
  const levels = [null];
  let prev = null;
  for (let k = 1; (T >> k) >= 1; k++) {
    const count = T >> k;
    const Ar = new Float64Array(count), Ai = new Float64Array(count);
    const Br = new Float64Array(count), Bi = new Float64Array(count), R2 = new Float64Array(count);
    for (let i = 0; i < count; i++) {
      let xAr, xAi, xBr, xBi, xR, yAr, yAi, yBr, yBi, yR;
      if (k === 1) {
        const m = 1 + 2 * i;
        xAr = 2 * Zr[m]; xAi = 2 * Zi[m]; xBr = 1; xBi = 0; xR = BLA_EPS * Math.hypot(xAr, xAi);
        yAr = 2 * Zr[m + 1]; yAi = 2 * Zi[m + 1]; yBr = 1; yBi = 0; yR = BLA_EPS * Math.hypot(yAr, yAi);
      } else {
        const a = 2 * i, b = 2 * i + 1;
        xAr = prev.Ar[a]; xAi = prev.Ai[a]; xBr = prev.Br[a]; xBi = prev.Bi[a]; xR = Math.sqrt(prev.R2[a]);
        yAr = prev.Ar[b]; yAi = prev.Ai[b]; yBr = prev.Br[b]; yBi = prev.Bi[b]; yR = Math.sqrt(prev.R2[b]);
      }
      Ar[i] = yAr * xAr - yAi * xAi;
      Ai[i] = yAr * xAi + yAi * xAr;
      Br[i] = yAr * xBr - yAi * xBi + yBr;
      Bi[i] = yAr * xBi + yAi * xBr + yBi;
      const ax = Math.hypot(xAr, xAi);
      const r = Math.min(xR, Math.max(0, (yR - Math.hypot(xBr, xBi) * dcMax) / ax));
      R2[i] = r > 0 && isFinite(r) ? r * r : 0;
    }
    prev = { count, Ar, Ai, Br, Bi, R2 };
    levels.push(prev);
  }
  return { K: levels.length - 1, levels };
}

if (typeof module !== "undefined") module.exports = { iteratePixel, buildBLA, blaPays };
