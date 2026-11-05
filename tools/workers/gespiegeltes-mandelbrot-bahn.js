// Reference orbits for beidseitig-belegtes-mandelbrot: Z_0 = 0, Z_{n+1} = Z_n^2 + c, exact in
// BigInt fixed point (value = b / 2^PB), handed over as float32 pairs.
// Also the exact Misiurewicz points (z_{k+p} = z_k): refining, checking, and finding one
// near any point at any depth.
// The page loads this file as a script (cheap orbits, right away) and as a worker (deep
// ones: thousands of bits times as many steps as the view is deep, too long for the thread
// that keeps drag and pinch smooth). A newer view makes the page drop the worker mid-orbit.
(function () {
  // exact: fixed point (else doubles, enough while the finest pixel is coarser than 1e-12).
  // per = { k, p }: c is a Misiurewicz point, Z_{k+p} = Z_k. From there on the orbit only
  // goes round: after k + p exact steps the rest is the same cycle again, as long as wanted.
  // Computed on, rounding would push the orbit off its repelling cycle; copied, it stays.
  function bahn(cx, cy, L, PB, exact, per) {
    const data = new Float32Array(4096 * Math.ceil(L / 4096) * 2);
    let n = 1;
    const kreis = per ? per.k + per.p : Infinity;
    if (exact) {
      const PBn = BigInt(PB), s1 = PBn - 1n, d = PBn - 60n, f = 2 ** -60;
      let zx = 0n, zy = 0n;
      for (; n < L && n <= kreis; n++) {
        const xx = (zx * zx) >> PBn, yy = (zy * zy) >> PBn;
        zy = ((zx * zy) >> s1) + cy;
        zx = xx - yy + cx;
        const x = Number(zx >> d) * f, y = Number(zy >> d) * f;
        data[2 * n] = x;
        data[2 * n + 1] = y;
        if (x * x + y * y > 1e6) return { data, L: n + 1, escaped: true };
      }
    } else {
      const x0 = ldexp(Number(cx >> BigInt(Math.max(0, PB - 60))), -Math.min(PB, 60));
      const y0 = ldexp(Number(cy >> BigInt(Math.max(0, PB - 60))), -Math.min(PB, 60));
      let zx = 0, zy = 0;
      for (; n < L && n <= kreis; n++) {
        const t = zx * zx - zy * zy + x0;
        zy = 2 * zx * zy + y0;
        zx = t;
        data[2 * n] = zx;
        data[2 * n + 1] = zy;
        if (zx * zx + zy * zy > 1e6) return { data, L: n + 1, escaped: true };
      }
    }
    if (n <= kreis) return { data, L: n, escaped: false };
    // round and round: the cycle once more for every turn still to go
    for (let m = 2 * n, q = 2 * per.p; m < 2 * L; m++) data[m] = data[m - q];
    return { data, L, escaped: false };
  }
  function ldexp(x, n) {
    while (n > 1000) { x *= 2 ** 1000; n -= 1000; }
    while (n < -1000) { x *= 2 ** -1000; n += 1000; }
    return x * 2 ** n;
  }
  const ab = (b) => (b < 0n ? -b : b);
  const bitLen = (b) => ab(b).toString(16).length * 4;
  // log2 |b / 2^PB|, for any size
  function lg2(b, PB) {
    if (b === 0n) return -Infinity;
    b = ab(b);
    const drop = Math.max(0, bitLen(b) - 64);
    return Math.log2(Number(b >> BigInt(drop))) + drop - PB;
  }

  // the first candidate that does not escape before `want` steps, else the longest;
  // i says which one it is. Only the first may be the Misiurewicz point itself.
  function beste(cands, L, PB, exact, per, want) {
    let best = null;
    for (let i = 0; i < cands.length; i++) {
      const o = bahn(cands[i][0], cands[i][1], L, PB, exact, i ? null : per);
      o.i = i;
      if (!best || o.L > best.L) best = o;
      if (!o.escaped || o.L >= want) break;
    }
    return best;
  }

  // ---- Misiurewicz points: z_{k+p} = z_k for the orbit of 0, k >= 1 ----
  // One Newton step for z_{k+p} - z_k at c, exact orbit in fixed point; dz/dc only as a
  // double times 2^e (Newton needs it to a few digits, not to all PB bits: a third of the
  // cost). Also log2 of the cycle's multiplier. null if the orbit escapes.
  function schritt(cx, cy, k, p, PB) {
    const PBn = BigInt(PB), s1 = PBn - 1n, d = PBn - 60n, f = 2 ** -60, esc = 8n << PBn;
    let zx = 0n, zy = 0n, ax = 0n, ay = 0n, mx = 0, my = 0, e = 0, bx = 0, by = 0, be = 0, lam = 0, g = 1;
    for (let n = 1; n <= k + p; n++) {
      const x = Number(zx >> d) * f, y = Number(zy >> d) * f;
      if (n > k) lam += 1 + Math.log2(x * x + y * y) / 2;
      const nx = 2 * (x * mx - y * my) + g;
      my = 2 * (x * my + y * mx);
      mx = nx;
      if (Math.max(Math.abs(mx), Math.abs(my)) > 2 ** 200) { mx *= 2 ** -200; my *= 2 ** -200; e += 200; g = 2 ** -e; }
      const xx = (zx * zx) >> PBn, yy = (zy * zy) >> PBn;
      zy = ((zx * zy) >> s1) + cy;
      zx = xx - yy + cx;
      if (ab(zx) + ab(zy) > esc) return null;
      if (n === k) { ax = zx; ay = zy; bx = mx; by = my; be = e; }
    }
    const gx = zx - ax, gy = zy - ay, q = 2 ** (be - e), hx = mx - bx * q, hy = my - by * q;
    const h2 = hx * hx + hy * hy;
    if (!(h2 > 0) || !Number.isFinite(h2)) return { sx: 0n, sy: 0n, lam, flach: true };
    // step = g / h = g * conj(h) / |h|^2, the double factor as a 53-bit integer
    const ux = hx / h2, uy = -hy / h2, m = Math.floor(Math.log2(Math.max(Math.abs(ux), Math.abs(uy))));
    const Ux = BigInt(Math.round(ux * 2 ** (52 - m))), Uy = BigInt(Math.round(uy * 2 ** (52 - m)));
    const sh = 52 - m + e;
    const rx = gx * Ux - gy * Uy, ry = gx * Uy + gy * Ux;
    return sh >= 0 ? { sx: rx >> BigInt(sh), sy: ry >> BigInt(sh), lam } : { sx: rx << BigInt(-sh), sy: ry << BigInt(-sh), lam };
  }
  // Newton from a nearby start; null if the orbit escapes.
  // lmax: no step longer than 2^lmax (far from the root Newton jumps wildly with large k)
  function refine(cx, cy, k, p, PB, lmax = Infinity) {
    for (let it = 0; it < 40; it++) {
      const s = schritt(cx, cy, k, p, PB);
      if (!s) return null;
      if (s.flach) break;
      let { sx, sy } = s;
      const over = Math.ceil(lg2(ab(sx) + ab(sy), PB) - lmax);
      if (over > 0) { sx >>= BigInt(over); sy >>= BigInt(over); }
      cx -= sx;
      cy -= sy;
      if (ab(sx) + ab(sy) < 256n) break;
    }
    return [cx, cy];
  }
  // exact check of a refined root: the next Newton step is below half the working
  // precision, and the cycle repels (a centre has 0 on its cycle and attracts: finite).
  // Barely repelling cycles are endless too, but grow so slowly per turn that far out
  // the iteration limit runs out first and the view goes flat: at least 1/16 bit per step.
  function verify(cx, cy, k, p, PB) {
    const s = schritt(cx, cy, k, p, PB);
    if (!s || s.flach || !(s.lam >= p / 16)) return false;
    // in log2: 2^(-PB/2) itself is 0 as a double from PB = 2150 on
    return lg2(ab(s.sx) + ab(s.sy), PB) < -PB / 2;
  }
  const logadd = (a, b) => {
    const m = Math.max(a, b);
    return m === -Infinity ? m : m + Math.log2(2 ** (a - m) + 2 ** (b - m));
  };

  // A Misiurewicz point less than 2^lR from t = (tx, ty), exact, at any depth.
  // The orbit of t exactly, z_n as doubles (|z| < 2: plenty), dz_n/dc as mantissa * 2^e.
  // Where z_{k+p} - z_k divided by its derivative is short, a root of z_{k+p} = z_k lies
  // about that far away: the shortest such steps are refined and checked. Only steps where
  // that difference is above double rounding and 2^lR times dz/dc still small (linear) count;
  // the orbit stops where the latter ends.
  function nahe(tx, ty, lR, PB, kmax = 1e5) {
    const PBn = BigInt(PB), s1 = PBn - 1n, d = PBn - 60n, f = 2 ** -60;
    const zs = [0, 0], ds = [0, 0], es = [0];
    let zx = 0n, zy = 0n, mx = 0, my = 0, e = 0;
    for (let n = 1; n <= kmax; n++) {
      const x = Number(zx >> d) * f, y = Number(zy >> d) * f, one = 2 ** -e;
      const nx = 2 * (x * mx - y * my) + one;
      my = 2 * (x * my + y * mx);
      mx = nx;
      const a = Math.max(Math.abs(mx), Math.abs(my));
      if (a > 2 ** 200) { const k = Math.round(Math.log2(a)); mx *= 2 ** -k; my *= 2 ** -k; e += k; }
      const xx = (zx * zx) >> PBn, yy = (zy * zy) >> PBn;
      zy = ((zx * zy) >> s1) + ty;
      zx = xx - yy + tx;
      const X = Number(zx >> d) * f, Y = Number(zy >> d) * f;
      if (!(X * X + Y * Y < 64)) break;
      zs.push(X, Y);
      ds.push(mx, my);
      es.push(e);
      if (Math.log2(Math.hypot(mx, my)) + e + lR > 60) break;
    }
    const L = es.length, cands = [];
    for (let k = 1; k < L; k++)
      for (let p = 1; p <= 8 && k + p < L; p++) {
        const i = k, j = k + p;
        const gx = zs[2 * j] - zs[2 * i], gy = zs[2 * j + 1] - zs[2 * i + 1];
        // below that the difference of two doubles is rounding, not distance
        if (Math.hypot(gx, gy) < 2 ** -40) continue;
        // h = ds_j 2^es_j - ds_i 2^es_i in the larger exponent
        const E = es[j], q = 2 ** (es[i] - E);
        const hx = ds[2 * j] - ds[2 * i] * q, hy = ds[2 * j + 1] - ds[2 * i + 1] * q;
        const ls = Math.log2(Math.hypot(gx, gy)) - Math.log2(Math.hypot(hx, hy)) - E;
        if (ls < lR) cands.push({ k, p, ls });
      }
    cands.sort((u, v) => u.ls - v.ls);
    // Newton in doubles first (cheap), for many candidates; the roots it reaches within
    // 2^lR, nearest first, then exactly: from there one or two full-precision steps
    const roots = [], seen = new Set();
    for (const { k, p } of cands.slice(0, 64)) {
      const q = nahNewton(zs, k, p, lR);
      if (!q) continue;
      const key = q[0].toPrecision(6) + "," + q[1].toPrecision(6) + "," + q[2];
      if (seen.has(key)) continue;
      seen.add(key);
      const l = Math.log2(Math.hypot(q[0], q[1])) + q[2];
      if (l < lR) roots.push({ k, p, q, l });
    }
    roots.sort((u, v) => u.l - v.l);
    for (const { k, p, q } of roots.slice(0, 6)) {
      const big = (m) => { const e = q[2] + PB - 52; const b = BigInt(Math.round(m * 2 ** 52)); return e >= 0 ? b << BigInt(e) : b >> BigInt(-e); };
      const c = refine(tx + big(q[0]), ty + big(q[1]), k, p, PB, lR - 2);
      if (!c) continue;
      if (logadd(2 * lg2(c[0] - tx, PB), 2 * lg2(c[1] - ty, PB)) / 2 >= lR) continue;
      if (!verify(c[0], c[1], k, p, PB)) continue;
      return kurz(c, k, p, PB, lR);
    }
    return null;
  }
  // Newton for z_{k+p} = z_k at c = t + d, in doubles around the exact orbit Z of t (zs):
  // z = Z + e with e' = 2 Z e + e^2 + d. d, e and dz/dc as mantissa * 2^exponent, so they
  // hold at any depth. d as [x, y, exponent], or null if it leaves 2^lR or does not settle.
  function nahNewton(zs, k, p, lR) {
    let qx = 0, qy = 0, qe = Math.floor(lR), lsAlt = Infinity;
    const norm = (x, y, e) => {
      const a = Math.max(Math.abs(x), Math.abs(y));
      if (a === 0) return [0, 0, e];
      const s = Math.floor(Math.log2(a));
      return [x * 2 ** -s, y * 2 ** -s, e + s];
    };
    for (let it = 0; it < 40; it++) {
      let ex = 0, ey = 0, ee = qe, Dx = 0, Dy = 0, De = 0;
      let ax = 0, ay = 0, ae = 0, bx = 0, by = 0, be = 0;
      // the powers of two change only when an exponent does
      let f = 2 ** ee, g = 1, h = 1;
      for (let n = 0; n < k + p; n++) {
        const Zx = zs[2 * n], Zy = zs[2 * n + 1];
        const zx = Zx + ex * f, zy = Zy + ey * f;
        // dz/dc: 2 z D + 1
        const nDx = 2 * (zx * Dx - zy * Dy) + g;
        Dy = 2 * (zx * Dy + zy * Dx);
        Dx = nDx;
        // e: 2 Z e + e^2 + d, all in units of 2^ee
        const nex = 2 * (Zx * ex - Zy * ey) + (ex * ex - ey * ey) * f + qx * h;
        ey = 2 * (Zx * ey + Zy * ex) + 2 * ex * ey * f + qy * h;
        ex = nex;
        if (!(zx * zx + zy * zy < 64)) return null;
        const a = Math.max(Math.abs(ex), Math.abs(ey));
        if (a > 2 ** 60 || (a < 2 ** -60 && a > 0)) { [ex, ey, ee] = norm(ex, ey, ee); f = 2 ** ee; h = 2 ** (qe - ee); }
        if (Math.max(Math.abs(Dx), Math.abs(Dy)) > 2 ** 60) { [Dx, Dy, De] = norm(Dx, Dy, De); g = 2 ** -De; }
        if (n + 1 === k) { ax = ex; ay = ey; ae = ee; bx = Dx; by = Dy; be = De; }
      }
      // G = Z_{k+p} - Z_k + e_{k+p} - e_k (O(1) or less: plain doubles); H = D_{k+p} - D_k
      const j = k + p, fj = 2 ** ee, fk = 2 ** ae;
      const Gx = zs[2 * j] - zs[2 * k] + ex * fj - ax * fk, Gy = zs[2 * j + 1] - zs[2 * k + 1] + ey * fj - ay * fk;
      const r = 2 ** (be - De), Hx = Dx - bx * r, Hy = Dy - by * r, H2 = Hx * Hx + Hy * Hy;
      if (!(H2 > 0)) return null;
      // step = G / H, at 2^-De; d -= step
      let [sx, sy, se] = norm((Gx * Hx + Gy * Hy) / H2, (Gy * Hx - Gx * Hy) / H2, -De);
      if (!Number.isFinite(sx + sy)) return null;
      // far from the root Newton jumps wildly: no step longer than a quarter of the radius
      se = Math.min(se, Math.floor(lR) - 3);
      const E = Math.max(qe, se);
      [qx, qy, qe] = norm(qx * 2 ** (qe - E) - sx * 2 ** (se - E), qy * 2 ** (qe - E) - sy * 2 ** (se - E), E);
      const lq = Math.log2(Math.hypot(qx, qy)) + qe;
      if (lq > lR + 1) return null;
      // settled: tiny against d, or small and no longer shrinking (rounding of G); the
      // exact steps afterwards do the rest
      const ls = Math.log2(Math.hypot(sx, sy)) + se;
      if (ls < Math.max(lq, lR - 30) - 100 || (ls < lR - 30 && ls > lsAlt - 1)) return [qx, qy, qe];
      lsAlt = ls;
    }
    return null;
  }
  // found as a root with some k and p: the smallest preperiod and period it really has
  function kurz(c, k, p, PB, lR) {
    const PBn = BigInt(PB), s1 = PBn - 1n, zs = [0n, 0n];
    let zx = 0n, zy = 0n;
    for (let n = 1; n <= k + p; n++) {
      const xx = (zx * zx) >> PBn, yy = (zy * zy) >> PBn;
      zy = ((zx * zy) >> s1) + c[1];
      zx = xx - yy + c[0];
      zs.push(zx, zy);
    }
    const gleich = (i, j) => logadd(2 * lg2(zs[2 * i] - zs[2 * j], PB), 2 * lg2(zs[2 * i + 1] - zs[2 * j + 1], PB)) / 2 < -PB / 3;
    // rounding grows along the repelling cycle: compare early, where the orbit is still exact
    let kk = 1;
    while (kk < k && !gleich(kk, kk + p)) kk++;
    let pp = p;
    for (let q = 1; q < p; q++) if (p % q === 0 && gleich(kk, kk + q)) { pp = q; break; }
    if (kk === k && pp === p) return { e: c, k, p, PB };
    const e = refine(c[0], c[1], kk, pp, PB);
    // a root that close but elsewhere has other (k, p): then the found ones stay
    const da = e && logadd(2 * lg2(e[0] - c[0], PB), 2 * lg2(e[1] - c[1], PB)) / 2;
    return e && da < Math.min(-PB / 2, lR - 20) && verify(e[0], e[1], kk, pp, PB) ? { e, k: kk, p: pp, PB } : { e: c, k, p, PB };
  }

  if (typeof document === "undefined") {
    self.onmessage = (e) => {
      if (e.data.nahe) {
        const { tx, ty, lR, PB, id } = e.data.nahe;
        self.postMessage({ nahe: nahe(tx, ty, lR, PB), id });
        return;
      }
      const { cands, L, PB, exact, per, want } = e.data;
      const o = beste(cands, L, PB, exact, per, want);
      self.postMessage(o, [o.data.buffer]);
    };
  } else {
    window.spiegelBahnen = beste;
    window.spiegelMis = { refine, verify, nahe, lg2 };
  }
})();
