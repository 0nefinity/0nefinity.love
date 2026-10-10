// The world: an endless chain of real Mandelbrot sets, each one sitting inside
// the next as one of its minibrots. Level 0 is the textbook set in u. Level j is
// the true set in c_j = b_j + beta_j * c_(j-1): b_j is the nucleus of a primitive
// minibrot of period q_j and beta_j its size, so all of level j-1 reappears in
// level j at b_j. A seed makes every choice reproducible; levels are found lazily.

const SMIN = 1e-7, SMAX = 1e-4;   // minibrot size: smaller copies are truer copies
const DMAX = 0.005;               // allowed shape error of the copy (measured)
const QMIN = 12;                  // short periods leave the renormalization test too loose
const RENORM = 10;                // rounds a point must stay in the copy to belong to it
const FIX = 1100;                 // fixed-point bits that hold every double exactly
const LAM_MIN = 1e-290;           // the chain stops where beta products leave doubles
const MAX_ITER = 60000;

function iterationsFor(cPixel) {
  const d = Math.max(0, -Math.log10(cPixel));
  return Math.min(MAX_ITER, Math.round(800 + 40 * d));
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

// Exact x * 2^FIX as BigInt.
const bits = new DataView(new ArrayBuffer(8));
function fixed(x) {
  if (x === 0) return 0n;
  bits.setFloat64(0, x);
  const hi = bits.getUint32(0), lo = bits.getUint32(4);
  const ex = (hi >>> 20) & 0x7ff;
  let m = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  if (ex) m |= 1n << 52n;
  m <<= BigInt((ex || 1) - 1075 + FIX);
  return x < 0 ? -m : m;
}

// Reference orbit of c = (cr + i ci) / 2^P in BigInt fixed point, rounded to doubles.
// Stops at the first |Z| > 2 (that index is L) or at maxiter.
function referenceOrbit(cr, ci, P, maxiter) {
  const Zr = new Float64Array(maxiter + 1), Zi = new Float64Array(maxiter + 1);
  const Pb = BigInt(P), P1 = BigInt(P - 1);
  // Number() of a BigInt beyond 2^1024 is Infinity: drop low bits first
  const cut = Math.max(0, P - 960), cutB = BigInt(cut);
  const scale = Math.pow(2, cut - P);
  let x = 0n, y = 0n, L = maxiter;
  for (let n = 1; n <= maxiter; n++) {
    const x2 = (x * x) >> Pb, y2 = (y * y) >> Pb, xy = (x * y) >> P1;
    x = x2 - y2 + cr;
    y = xy + ci;
    const a = Number(x >> cutB) * scale, b = Number(y >> cutB) * scale;
    Zr[n] = a;
    Zi[n] = b;
    if (a * a + b * b > 4) { L = n; break; }
  }
  return { Zr: Zr.slice(0, L + 1), Zi: Zi.slice(0, L + 1), L };
}

// ---- finding minibrots, in doubles (only + - * / sqrt, so every browser picks the same) ----

const cabs = (r, i) => Math.sqrt(r * r + i * i);

function nucleus(cr, ci, p) {
  for (let s = 0; s < 60; s++) {
    let zr = 0, zi = 0, dr = 0, di = 0;
    for (let n = 0; n < p; n++) {
      const t = 2 * (zr * dr - zi * di) + 1;
      di = 2 * (zr * di + zi * dr);
      dr = t;
      const u = zr * zr - zi * zi + cr;
      zi = 2 * zr * zi + ci;
      zr = u;
    }
    const d = dr * dr + di * di;
    const sr = (zr * dr + zi * di) / d, si = (zi * dr - zr * di) / d;
    cr -= sr;
    ci -= si;
    if (!(Math.abs(cr) < 4 && Math.abs(ci) < 4)) return null;
    if (cabs(sr, si) < 1e-17 * Math.max(1, cabs(cr, ci))) break;
  }
  return [cr, ci];
}

function exactPeriod(cr, ci, pmax) {
  let zr = 0, zi = 0;
  for (let k = 1; k <= pmax; k++) {
    const t = zr * zr - zi * zi + cr;
    zi = 2 * zr * zi + ci;
    zr = t;
    if (cabs(zr, zi) < 1e-9) return k;
  }
  return 0;
}

// Size and multiplier of the minibrot with nucleus c and period q (mathr's estimate):
// l = prod 2 z_i, beta = 1 / (b l^2) with b = 1 + sum 1/l_i.
function shape(cr, ci, q) {
  let zr = 0, zi = 0, lr = 1, li = 0, br = 1, bi = 0;
  for (let i = 1; i < q; i++) {
    const t = zr * zr - zi * zi + cr;
    zi = 2 * zr * zi + ci;
    zr = t;
    const u = 2 * (zr * lr - zi * li);
    li = 2 * (zr * li + zi * lr);
    lr = u;
    const d = lr * lr + li * li;
    br += lr / d;
    bi -= li / d;
  }
  const l2r = lr * lr - li * li, l2i = 2 * lr * li;
  const dr = br * l2r - bi * l2i, di = br * l2i + bi * l2r;
  const d = dr * dr + di * di;
  return { beta: [dr / d, -di / d], l: [lr, li] };
}

// Worst relative misplacement of three landmark bulbs of the copy.
const LANDMARKS = [[-1, 0, 2], [-0.12256116687665362, 0.7448617666197442, 3], [-1.7548776662466927, 0, 3]];
function distortion(b, beta, q) {
  let worst = 0;
  const ab = cabs(beta[0], beta[1]);
  for (const [mr, mi, k] of LANDMARKS) {
    const gr = b[0] + beta[0] * mr - beta[1] * mi, gi = b[1] + beta[0] * mi + beta[1] * mr;
    const n = nucleus(gr, gi, q * k);
    if (!n) return Infinity;
    worst = Math.max(worst, cabs(n[0] - gr, n[1] - gi) / ab);
  }
  return worst;
}

function escapes(cr, ci, max) {
  let zr = 0, zi = 0;
  for (let n = 1; n <= max; n++) {
    const t = zr * zr - zi * zi + cr;
    zi = 2 * zr * zi + ci;
    zr = t;
    if (zr * zr + zi * zi > 4) return n;
  }
  return 0;
}

function atomPeriod(cr, ci, pmax) {
  let zr = 0, zi = 0, best = Infinity, p = 0;
  for (let n = 1; n <= pmax; n++) {
    const t = zr * zr - zi * zi + cr;
    zi = 2 * zr * zi + ci;
    zr = t;
    const a = zr * zr + zi * zi;
    if (a > 4) break;
    if (a < best) { best = a; p = n; }
  }
  return p;
}

// Random points near the boundary lead, via their atom domain, to minibrots;
// keep the first one that is small and true enough.
function findMinibrot(seed, level) {
  const rand = rng(seed, 1000 + level);
  for (let tries = 0; tries < 200000; tries++) {
    const cr = -2 + 2.5 * rand(), ci = -1.2 + 2.4 * rand();
    if (escapes(cr, ci, 2000) < 40) continue;
    const p = atomPeriod(cr, ci, 400);
    if (!p) continue;
    const b = nucleus(cr, ci, p);
    if (!b) continue;
    const q = exactPeriod(b[0], b[1], p);
    if (q < QMIN) continue;
    const { beta, l } = shape(b[0], b[1], q);
    const size = cabs(beta[0], beta[1]);
    if (!(size >= SMIN && size <= SMAX)) continue;
    if (!(distortion(b, beta, q) <= DMAX)) continue;
    return { b, beta, l, q };
  }
  throw new Error(`Ebene ${level}: keine passende Kopie gefunden`);
}

class Chain {
  constructor(seed) {
    this.seed = seed >>> 0;
    // A_j + Lambda_j u = c_j, kept exactly at scale 2^(FIX (j + 1)); lam = Lambda_j in doubles
    this.levels = [{ q: 1, l: [1, 0], lam: [1, 0], offset: 0, Ar: 0n, Ai: 0n, Lr: 1n << BigInt(FIX), Li: 0n }];
  }

  // Level j, found on first use; null where the chain leaves the range of doubles.
  at(j) {
    while (this.levels.length <= j) {
      const k = this.levels.length, prev = this.levels[k - 1];
      if (Math.hypot(prev.lam[0], prev.lam[1]) * SMAX < LAM_MIN) return null;
      const { b, beta, l, q } = findMinibrot(this.seed, k);
      const br = fixed(beta[0]), bi = fixed(beta[1]), sh = BigInt(FIX * k);
      this.levels.push({
        q, l,
        lam: [beta[0] * prev.lam[0] - beta[1] * prev.lam[1], beta[0] * prev.lam[1] + beta[1] * prev.lam[0]],
        offset: prev.offset + Math.log2(q),
        Ar: (fixed(b[0]) << sh) + br * prev.Ar - bi * prev.Ai,
        Ai: (fixed(b[1]) << sh) + br * prev.Ai + bi * prev.Ar,
        Lr: br * prev.Lr - bi * prev.Li,
        Li: br * prev.Li + bi * prev.Lr,
      });
    }
    return this.levels[j];
  }

  // c_j at the view center u = (re + i im) / 2^Q, as BigInt at P bits.
  centerAt(j, v, P) {
    const L = this.at(j), S = FIX * (j + 1);
    const cr = (L.Ar << BigInt(v.Q)) + L.Lr * v.re - L.Li * v.im;
    const ci = (L.Ai << BigInt(v.Q)) + L.Lr * v.im + L.Li * v.re;
    return { cr: shiftTo(cr, S + v.Q, P), ci: shiftTo(ci, S + v.Q, P) };
  }
}

if (typeof module !== "undefined") {
  module.exports = { Chain, referenceOrbit, iterationsFor };
}
