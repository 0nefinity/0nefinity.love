// The world: c = c0 + 1/w, with c0 a point on the boundary of the Mandelbrot
// set that is fixed lazily, one level at a time, only as deep as the view needs.
// Level k pins c0 to within eps_k = EPS0 / SHRINK^k; a seed makes every choice
// reproducible, so places already seen never change (like a Minecraft seed).

const EPS0 = 1.6;
const SHRINK = 8;
const GRID = 48;
const GUARD_BITS = 64;
const MAX_ITER = 60000;

function iterationsFor(cPixel) {
  const d = Math.max(0, -Math.log10(cPixel));
  return Math.min(MAX_ITER, Math.round(800 + 40 * d));
}

function bitsFor(cPixel) {
  return Math.ceil(Math.log2(1 / cPixel)) + GUARD_BITS;
}

function shiftTo(v, from, to) {
  return to >= from ? v << BigInt(to - from) : v >> BigInt(from - to);
}

function rng(seed, k) {
  let a = (Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(k + 1, 0xc2b2ae35)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Reference orbit of c = (cr + i ci) / 2^P in BigInt fixed point, rounded to doubles.
// Stops at the first |Z| > 2 (that index is L) or at maxiter.
function referenceOrbit(cr, ci, P, maxiter) {
  const Zr = new Float64Array(maxiter + 1), Zi = new Float64Array(maxiter + 1);
  const Pb = BigInt(P), P1 = BigInt(P - 1);
  const scale = Math.pow(2, -P);
  let x = 0n, y = 0n, L = maxiter;
  for (let n = 1; n <= maxiter; n++) {
    const x2 = (x * x) >> Pb, y2 = (y * y) >> Pb, xy = (x * y) >> P1;
    x = x2 - y2 + cr;
    y = xy + ci;
    const a = Number(x) * scale, b = Number(y) * scale;
    Zr[n] = a;
    Zi[n] = b;
    if (a * a + b * b > 4) { L = n; break; }
  }
  return { Zr: Zr.slice(0, L + 1), Zi: Zi.slice(0, L + 1), L };
}

class World {
  constructor(seed, iteratePixel) {
    this.seed = seed >>> 0;
    this.iteratePixel = iteratePixel;
    this.P = GUARD_BITS;
    this.re = BigInt(Math.round(-0.5 * 2 ** GUARD_BITS));
    this.im = 0n;
    this.level = 0;
    this.eps = EPS0;
  }

  // Everything chosen after this level moves c0 by at most this much.
  drift() { return this.eps * SHRINK / (SHRINK - 1); }

  // One more level: among grid points within eps of c0 that lie within one grid
  // step of the boundary, pick one at random. Escape times then grow only
  // linearly with depth (about 8 iterations per decade, measured).
  refine() {
    const eps = this.eps, h = 2 * eps / GRID;
    const P = bitsFor(h);
    const cr = shiftTo(this.re, this.P, P), ci = shiftTo(this.im, this.P, P);
    let maxiter = iterationsFor(h);
    const out = new Float64Array(2);
    for (let attempt = 0; attempt < 3; attempt++, maxiter *= 2) {
      const ref = referenceOrbit(cr, ci, P, maxiter);
      const cand = [];
      let nearest = null;
      for (let j = 0; j < GRID; j++) {
        for (let i = 0; i < GRID; i++) {
          const dr = -eps + (i + 0.5) * h, di = -eps + (j + 0.5) * h;
          if (dr * dr + di * di > eps * eps) continue;
          this.iteratePixel(ref.Zr, ref.Zi, ref.L, dr, di, maxiter, out);
          if (out[0] === 0) continue;
          if (out[1] < h) cand.push([out[0], dr, di]);
          if (!nearest || out[1] < nearest[3]) nearest = [out[0], dr, di, out[1]];
        }
      }
      if (!cand.length && !nearest) continue;
      if (!cand.length) cand.push(nearest);
      const pick = cand[Math.floor(rng(this.seed, this.level)() * cand.length)];
      const f = 2 ** P;
      this.re = cr + BigInt(Math.round(pick[1] * f));
      this.im = ci + BigInt(Math.round(pick[2] * f));
      this.P = P;
      this.level++;
      this.eps = eps / SHRINK;
      return pick[0];
    }
    throw new Error(`Ebene ${this.level}: kein Randpunkt gefunden`);
  }

  // c0 + 1/w (w = (wr + i wi) / 2^Q; null for w = infinity) at P bits.
  centerAt(P, w) {
    let cr = shiftTo(this.re, this.P, P), ci = shiftTo(this.im, this.P, P);
    if (w) {
      const n = w.re * w.re + w.im * w.im;
      const sh = BigInt(P + w.Q);
      cr += (w.re << sh) / n;
      ci -= (w.im << sh) / n;
    }
    return { cr, ci };
  }

  // Decimal digits of c0 that no later level can change.
  digits() {
    const d = Math.max(0, Math.floor(-Math.log10(this.drift())));
    const fmt = (v) => {
      const neg = v < 0n;
      const a = (neg ? -v : v) * 10n ** BigInt(d) >> BigInt(this.P);
      const s = a.toString().padStart(d + 1, "0");
      return (neg ? "−" : "") + s.slice(0, s.length - d) + (d ? "," + s.slice(s.length - d) : "");
    };
    return { re: fmt(this.re), im: fmt(this.im), imNeg: this.im < 0n, count: d };
  }
}

if (typeof module !== "undefined") module.exports = { World, referenceOrbit, iterationsFor, bitsFor };
