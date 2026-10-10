"use strict";

const START_R = 2.5;
const DEPTH_LIMIT = 1e-140;   // smallest c pixel: doubles run out near 1e-300 once squared
const ROWS = 8;
const ITER_CAP = 1000000;
const PROBE = 200000;

const canvas = document.getElementById("bild");
const ctx = canvas.getContext("2d");
const snap = document.createElement("canvas");
const sctx = snap.getContext("2d");
const small = document.createElement("canvas");
const smctx = small.getContext("2d");
const $ = (id) => document.getElementById(id);

const workers = Array.from(
  { length: Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1)) },
  () => new Worker("worker.js"));

let world, view, snapView = null;
let gen = 0, timer = 0, lastMaxiter = 0;

// ---- view: center w = (re + i im) / 2^Q as BigInt, half height r as double ----

function toNum(v, Q) {
  const bits = v.toString(2).length;
  const cut = Math.max(0, bits - 60);
  return Number(v >> BigInt(cut)) * Math.pow(2, cut - Q);
}

function needQ(r) { return Math.max(64, Math.ceil(Math.log2(1 / r)) + 64); }

function setQ(v, Q) {
  if (Q > v.Q) { const sh = BigInt(Q - v.Q); v.re <<= sh; v.im <<= sh; v.Q = Q; }
}

function geometry(v) {
  const W = canvas.width, H = canvas.height;
  const wcr = toNum(v.re, v.Q), wci = toNum(v.im, v.Q);
  const s = 2 * v.r / H;
  const reach = v.r * Math.hypot(1, W / H);
  const maxW = Math.hypot(wcr, wci) + reach;
  return { W, H, s, wcr, wci, maxW, cPix: s / maxW / maxW, inner: Math.hypot(wcr, wci) > 4 * reach };
}

// Move the view: zoom by f about screen point (px, py), then pan by (dx, dy) pixels.
function transform(f, px, py, dx, dy) {
  const g = geometry(view);
  const ar = (px - g.W / 2) * g.s, ai = (g.H / 2 - py) * g.s;
  const mr = ar * (1 - f) - dx * g.s * f, mi = ai * (1 - f) + dy * g.s * f;
  const next = { re: view.re, im: view.im, Q: view.Q, r: view.r * f };
  setQ(next, needQ(next.r));
  const scale = Math.pow(2, next.Q);
  next.re += BigInt(Math.round(mr * scale));
  next.im += BigInt(Math.round(mi * scale));
  const ng = geometry(next);
  if (ng.cPix < DEPTH_LIMIT || ng.maxW > 1e140) { flash(); return; }
  view = next;
  preview();
  writeHash();
  clearTimeout(timer);
  timer = setTimeout(render, 160);
}

// ---- drawing ----

function preview() {
  if (!snapView) return;
  const g = geometry(view);
  const Q = Math.max(view.Q, snapView.Q);
  const a = { ...view }, b = { ...snapView };
  setQ(a, Q); setQ(b, Q);
  const shr = toNum(a.re - b.re, Q) / g.s, shi = toNum(a.im - b.im, Q) / g.s;
  const k = snapView.r / view.r;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#020306";
  ctx.fillRect(0, 0, g.W, g.H);
  ctx.setTransform(k, 0, 0, k, g.W / 2 * (1 - k) - shr, g.H / 2 * (1 - k) + shi);
  ctx.drawImage(snap, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function keepSnapshot(v) {
  snap.width = canvas.width;
  snap.height = canvas.height;
  sctx.drawImage(canvas, 0, 0);
  snapView = { ...v };
}

function runPass(fid, g, ref, maxiter, sink) {
  const frame = { type: "frame", fid, W: g.W, H: g.H, s: g.s, wcr: g.wcr, wci: g.wci,
    inner: g.inner, Zr: ref.Zr, Zi: ref.Zi, L: ref.L, maxiter };
  const jobs = [];
  for (let y = 0; y < g.H; y += ROWS) jobs.push(y);
  let pending = jobs.length;
  const stats = { late: 0, inside: 0 };
  return new Promise((resolve) => {
    const next = (w) => {
      if (fid !== gen * 2 && fid !== gen * 2 + 1) return resolve(null);
      const y0 = jobs.shift();
      if (y0 !== undefined) w.postMessage({ fid, y0, y1: Math.min(g.H, y0 + ROWS) });
    };
    for (const w of workers) {
      w.onmessage = (e) => {
        const m = e.data;
        if (m.fid !== fid) return;
        sink(m);
        stats.late += m.late;
        stats.inside += m.inside;
        if (--pending === 0) return resolve(stats);
        next(w);
      };
      w.postMessage(frame);
      next(w);
    }
  });
}

async function render() {
  const my = ++gen;
  const v = { ...view };
  const g = geometry(v);
  busy(true);
  try {
    let n = 0;
    while (world.drift() > 0.2 * g.cPix) {
      world.refine();
      if (++n % 6 === 0) {
        showDigits();
        await new Promise((r) => setTimeout(r));
        if (my !== gen) return;
      }
    }
    showDigits();
    const P = Math.ceil(Math.log2(1 / g.cPix)) + 64;
    const c = world.centerAt(P, g.inner ? v : null);
    const q = { ...g, W: Math.ceil(g.W / 4), H: Math.ceil(g.H / 4), s: g.s * 4 };
    small.width = q.W;
    small.height = q.H;
    // Iteration limit: pixels near the reference escape about when it does; the
    // preview then shows whether escapes still crowd against the limit.
    let ref = referenceOrbit(c.cr, c.ci, P, PROBE);
    let maxiter = Math.min(ITER_CAP, Math.max(iterationsFor(g.cPix), lastMaxiter,
      ref.L < PROBE ? Math.ceil(ref.L * 1.5) : 0));
    for (let raise = 0; ; raise++) {
      if (maxiter > PROBE && ref.L === PROBE) ref = referenceOrbit(c.cr, c.ci, P, maxiter);
      if (my !== gen) return;
      const st = await runPass(my * 2, q, ref, maxiter,
        (m) => smctx.putImageData(new ImageData(m.px, q.W, m.y1 - m.y0), 0, m.y0));
      if (st === null || my !== gen) return;
      const crowded = st.inside > 0 && st.late > 0.002 * q.W * q.H;
      if (!crowded || raise === 2 || maxiter >= ITER_CAP) break;
      maxiter = Math.min(ITER_CAP, maxiter * 4);
    }
    lastMaxiter = Math.max(iterationsFor(g.cPix), Math.round(maxiter / 2));
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(small, 0, 0, q.W * 4, q.H * 4);
    keepSnapshot(v);

    const done = await runPass(my * 2 + 1, g, ref, maxiter,
      (m) => ctx.putImageData(new ImageData(m.px, g.W, m.y1 - m.y0), 0, m.y0));
    if (done === null || my !== gen) return;
    keepSnapshot(v);
    busy(false);
  } catch (err) {
    fail(err);
  }
}

// ---- readouts ----

function busy(on) { $("status").classList.toggle("an", on); }

function fail(err) {
  busy(false);
  $("fehler").textContent = "Fehler: " + err.message;
  $("fehler").hidden = false;
  console.error(err);
}

let flashTimer = 0;
function flash() {
  $("grenze").hidden = false;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { $("grenze").hidden = true; }, 1800);
}

function showDigits() {
  const d = world.digits();
  const im = d.im.replace("−", "");
  $("c0").textContent = `${d.re} ${d.imNeg ? "−" : "+"} ${im} i`;
  $("stellen").textContent = d.count;
  const z = Math.log10(START_R / view.r);
  $("zoom").textContent = (z >= 0 ? "rein " : "raus ") + "10^" + Math.abs(z).toFixed(1);
  $("welt").textContent = world.seed;
}

// ---- state in the URL ----

function hex(v) { return (v < 0n ? "-" : "") + (v < 0n ? -v : v).toString(16); }
function unhex(s) { return s[0] === "-" ? -BigInt("0x" + s.slice(1)) : BigInt("0x" + s); }

function writeHash() {
  history.replaceState(null, "",
    `#welt=${world.seed}&w=${hex(view.re)},${hex(view.im)},${view.Q}&r=${view.r.toExponential(6)}`);
}

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const seed = parseInt(p.get("welt"), 10);
  const w = (p.get("w") || "").split(",");
  const r = parseFloat(p.get("r"));
  return {
    seed: Number.isFinite(seed) ? seed : null,
    view: w.length === 3 && r > 0 ? { re: unhex(w[0]), im: unhex(w[1]), Q: +w[2], r } : null,
  };
}

function start(seed, v) {
  world = new World(seed, iteratePixel);
  view = v || { re: 0n, im: 0n, Q: 64, r: START_R };
  snapView = null;
  writeHash();
  showDigits();
  render();
}

// ---- input ----

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(canvas.clientWidth * dpr);
  canvas.height = Math.round(canvas.clientHeight * dpr);
  preview();
  clearTimeout(timer);
  timer = setTimeout(render, 160);
}

function devPx(e) {
  const b = canvas.getBoundingClientRect();
  return [(e.clientX - b.left) * canvas.width / b.width, (e.clientY - b.top) * canvas.height / b.height];
}

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const [x, y] = devPx(e);
  const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1;
  transform(Math.pow(1.0015, e.deltaY * unit), x, y, 0, 0);
}, { passive: false });

const pointers = new Map();
canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, devPx(e));
});
canvas.addEventListener("pointermove", (e) => {
  if (!pointers.has(e.pointerId)) return;
  const before = [...pointers.values()];
  pointers.set(e.pointerId, devPx(e));
  const after = [...pointers.values()];
  if (after.length === 1) {
    transform(1, 0, 0, after[0][0] - before[0][0], after[0][1] - before[0][1]);
  } else if (after.length >= 2) {
    const mid = (p) => [(p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2];
    const dist = (p) => Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]);
    const [m0, m1] = [mid(before), mid(after)];
    transform(dist(before) / dist(after), m0[0], m0[1], m1[0] - m0[0], m1[1] - m0[1]);
  }
});
const lift = (e) => pointers.delete(e.pointerId);
canvas.addEventListener("pointerup", lift);
canvas.addEventListener("pointercancel", lift);

window.addEventListener("keydown", (e) => {
  const W = canvas.width, H = canvas.height, step = H / 8;
  const keys = {
    "+": [0.5, 0, 0], "=": [0.5, 0, 0], "-": [2, 0, 0],
    ArrowLeft: [1, step, 0], ArrowRight: [1, -step, 0], ArrowUp: [1, 0, step], ArrowDown: [1, 0, -step],
  };
  const k = keys[e.key];
  if (!k) return;
  e.preventDefault();
  transform(k[0], W / 2, H / 2, k[1], k[2]);
});

$("startknopf").addEventListener("click", () => start(world.seed, null));
$("neuknopf").addEventListener("click", () => start((Math.random() * 1e9) >>> 0, null));
window.addEventListener("resize", resize);

const initial = readHash();
const dpr0 = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = Math.round(canvas.clientWidth * dpr0);
canvas.height = Math.round(canvas.clientHeight * dpr0);
start(initial.seed ?? 1, initial.view);
