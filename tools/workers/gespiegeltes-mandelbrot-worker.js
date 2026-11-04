// Snap points for beidseitig-belegtes-mandelbrot.html, found on the device while it idles:
// verified Misiurewicz points (z_{k+p} = z_k for the orbit of 0, k >= 1) around the
// mirror point, first coarse, then finer and finer, nearest first. In doubles; the page
// refines a point exactly only when it snaps to it.
//
// in:  { typ: "ort", cx, cy, k, D }  mirror point, c per pixel, view size in pixels
//      { typ: "pause", an }          tab hidden
//      { typ: "takt", faktor }       the page's frames got slow (> 1) or are fine (< 1)
// out: { typ: "punkte", p }         Float64Array [x, y, k, p, ...]

const NMAX = 600, PMAX = 8, TRIES = 64;
let ort = null, anker = null, pause = false, ruhe = 0, laeuft = false;
let stufe = 0, zelle = 0, spirale = null;
const schon = new Set();
const aus = [];

onmessage = (e) => {
  const m = e.data;
  if (m.typ === "pause") pause = m.an;
  if (m.typ === "takt") ruhe = Math.min(64, Math.max(0, m.faktor > 1 ? Math.max(4, ruhe * 2) : ruhe / 2 - 1));
  if (m.typ === "ort") {
    // a new place or scale starts over from the coarse grid; what was found stays found
    const neu = !anker || m.k > 2 * anker.k || m.k < anker.k / 2 || Math.hypot(m.cx - anker.cx, m.cy - anker.cy) > 16 * m.k;
    ort = m;
    if (neu) { anker = m; stufe = 0; zelle = 0; spirale = null; }
  }
  if (!laeuft) { laeuft = true; setTimeout(arbeite, 0); }
};

function arbeite() {
  if (pause || !ort) { laeuft = false; return; }
  const t0 = performance.now();
  let fertig = false;
  while (performance.now() - t0 < 10 && !(fertig = !schritt())) {}
  if (aus.length) {
    postMessage({ typ: "punkte", p: Float64Array.from(aus), k: ort.k });
    aus.length = 0;
  }
  if (fertig) { laeuft = false; return; }
  setTimeout(arbeite, ruhe * 10);
}

// cells of the current level, spiralling out from the mirror point; false once the
// finest level a pixel can show is done
function schritt() {
  const s = ort.k * 32 / 2 ** stufe;
  if (s < ort.k || s < 4e-15 * (1 + Math.hypot(ort.cx, ort.cy))) return false;
  if (!spirale) spirale = { n: Math.ceil(ort.D / 2 * ort.k / s), x0: ort.cx, y0: ort.cy, s };
  const { n, x0, y0 } = spirale;
  if (zelle >= (2 * n + 1) ** 2) { stufe++; zelle = 0; spirale = null; return true; }
  const [i, j] = spiral(zelle++);
  suche(x0 + i * s, y0 + j * s, s);
  return true;
}
// the n-th cell of a square spiral around (0, 0)
function spiral(n) {
  if (n === 0) return [0, 0];
  const r = Math.ceil((Math.sqrt(n + 1) - 1) / 2), q = n - (2 * r - 1) ** 2, l = 2 * r;
  if (q < l) return [r, -r + 1 + q];
  if (q < 2 * l) return [r - 1 - (q - l), r];
  if (q < 3 * l) return [-r, r - 1 - (q - 2 * l)];
  return [-r + 1 + (q - 3 * l), -r];
}

// one cell of size s around (cx, cy): if the boundary passes through, a root inside the
// cell, else one close by (as the shipped table was made)
function suche(cx, cy, s) {
  const de = abstand(cx, cy);
  if (!(de < s)) return;
  const zs = new Float64Array(2 * NMAX + 2), ds = new Float64Array(2 * NMAX + 2);
  let zx = 0, zy = 0, dx = 0, dy = 0, L = 0;
  for (let n = 1; n <= NMAX; n++) {
    const t = 2 * (zx * dx - zy * dy) + 1;
    dy = 2 * (zx * dy + zy * dx);
    dx = t;
    const u = zx * zx - zy * zy + cx;
    zy = 2 * zx * zy + cy;
    zx = u;
    if (!(zx * zx + zy * zy < 1e6 && Math.abs(dx) + Math.abs(dy) < 1e150)) break;
    zs[2 * n] = zx; zs[2 * n + 1] = zy; ds[2 * n] = dx; ds[2 * n + 1] = dy; L = n;
  }
  const cs = [];
  for (let k = 1; k < L; k++)
    for (let p = 1; p <= PMAX && k + p <= L; p++) {
      const i = 2 * k, j = 2 * (k + p);
      const gx = zs[j] - zs[i], gy = zs[j + 1] - zs[i + 1], hx = ds[j] - ds[i], hy = ds[j + 1] - ds[i + 1];
      const h2 = hx * hx + hy * hy;
      if (!(h2 > 0)) continue;
      const q = (gx * gx + gy * gy) / h2;
      if (q < 16 * s * s) cs.push({ k, p, q });
    }
  cs.sort((a, b) => a.k + a.p - b.k - b.p || a.q - b.q);
  for (let pass = 0; pass < 2; pass++)
    for (let t = 0; t < cs.length && t < TRIES; t++) {
      const { k, p } = cs[t];
      const c = newton(cx, cy, k, p);
      if (!c) continue;
      const fern = pass === 0 ? Math.max(Math.abs(c[0] - cx), Math.abs(c[1] - cy)) > s / 2 : Math.hypot(c[0] - cx, c[1] - cy) > 1.5 * s;
      if (fern || !stoesst(c[0], c[1], k, p)) continue;
      const key = Math.round(c[0] * 1e12) + "," + Math.round(c[1] * 1e12);
      if (!schon.has(key)) {
        schon.add(key);
        aus.push(c[0], c[1], k, p);
      }
      return;
    }
}

// distance estimate outside M; Infinity inside, or when 4000 steps do not tell
// (the cell is skipped then)
function abstand(cx, cy) {
  const q = (cx - 0.25) ** 2 + cy * cy;
  if (q * (q + cx - 0.25) <= cy * cy / 4 || (cx + 1) ** 2 + cy * cy <= 1 / 16) return Infinity;
  let zx = 0, zy = 0, dx = 0, dy = 0;
  for (let n = 0; n < 4000; n++) {
    const t = 2 * (zx * dx - zy * dy) + 1;
    dy = 2 * (zx * dy + zy * dx);
    dx = t;
    const u = zx * zx - zy * zy + cx;
    zy = 2 * zx * zy + cy;
    zx = u;
    const a = zx * zx + zy * zy;
    if (a > 1e12) {
      const az = Math.sqrt(a);
      return az * Math.log(az) / Math.hypot(dx, dy);
    }
  }
  return Infinity;
}

// the page's misNewton, step for step
function newton(cx, cy, k, p) {
  for (let it = 0; it < 40; it++) {
    let zx = 0, zy = 0, dx = 0, dy = 0, ax = 0, ay = 0, bx = 0, by = 0;
    for (let n = 1; n <= k + p; n++) {
      const t = 2 * (zx * dx - zy * dy) + 1;
      dy = 2 * (zx * dy + zy * dx);
      dx = t;
      const u = zx * zx - zy * zy + cx;
      zy = 2 * zx * zy + cy;
      zx = u;
      if (n === k) { ax = zx; ay = zy; bx = dx; by = dy; }
    }
    const gx = zx - ax, gy = zy - ay, hx = dx - bx, hy = dy - by;
    const h2 = hx * hx + hy * hy;
    if (!(h2 > 0)) return null;
    const sx = (gx * hx + gy * hy) / h2, sy = (gy * hx - gx * hy) / h2;
    cx -= sx;
    cy -= sy;
    if (!(Math.abs(cx) < 4 && Math.abs(cy) < 4)) return null;
    if (Math.hypot(sx, sy) < 1e-14 * (1 + Math.hypot(cx, cy))) return [cx, cy];
  }
  return null;
}

// the cycle repels by at least 1/16 bit per step, as misVerify asks
function stoesst(cx, cy, k, p) {
  let zx = 0, zy = 0, lam = 0;
  for (let n = 1; n <= k + p; n++) {
    if (n > k) lam += Math.log2(2 * Math.hypot(zx, zy));
    const u = zx * zx - zy * zy + cx;
    zy = 2 * zx * zy + cy;
    zx = u;
  }
  return lam >= p / 16;
}
