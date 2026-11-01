// Reference orbits for gespiegeltes-mandelbrot: Z_0 = 0, Z_{n+1} = Z_n^2 + c, exact in
// BigInt fixed point (value = b / 2^PB), handed over as float32 pairs.
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

  if (typeof document === "undefined") {
    self.onmessage = (e) => {
      const { cands, L, PB, exact, per, want } = e.data;
      const o = beste(cands, L, PB, exact, per, want);
      self.postMessage(o, [o.data.buffer]);
    };
  } else {
    window.spiegelBahnen = beste;
  }
})();
