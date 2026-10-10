"use strict";

const START_R = 2.5;
const ROWS = 8;
const ITER_CAP = 1000000;
const PROBE = 200000;
const MIN_R = 1e-280;         // keeps Q below 1024, where 2^Q still fits a double
const MAX_R = 1e270;          // keeps pan steps times 2^Q inside doubles

const canvas = document.getElementById("bild");
const ctx = canvas.getContext("2d");
const snap = document.createElement("canvas");
const sctx = snap.getContext("2d");
const small = document.createElement("canvas");
const smctx = small.getContext("2d");
const $ = (id) => document.getElementById(id);

const workers = Array.from(
  { length: Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1)) },
  () => {
    const w = new Worker("worker.js");
    w.onerror = (e) => fail(new Error("Worker: " + e.message));
    return w;
  });

let chain, view, snapView = null;
let gen = 0, timer = 0, lastBoost = 1;

// ---- view: center u = (re + i im) / 2^Q as BigInt (level 0 coordinates), half height r ----

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
  return { W, H, s: 2 * v.r / H, reach: v.r * Math.hypot(1, W / H) };
}

// Levels the view needs: from `low` (the lowest whose whole set is wider than two
// pixels) up to `top`, one above the lowest level whose |c| <= 2 holds the window.
// null where the chain ends.
function plan(v) {
  if (!(v.r >= MIN_R && v.r <= MAX_R)) return null;
  const g = geometry(v);
  const lamAbs = (j) => Math.hypot(chain.at(j).lam[0], chain.at(j).lam[1]);
  let low = 0;
  while (lamAbs(low) * g.s > 1) if (!chain.at(++low)) return null;
  for (let k = low; ; k++) {
    if (!chain.at(k + 1)) return null;
    const c = chain.centerAt(k, v, 64);
    if (Math.hypot(toNum(c.cr, 64), toNum(c.ci, 64)) + g.reach * lamAbs(k) <= 2) return { low, top: k + 1 };
  }
}

const inBounds = (v) => plan(v) !== null;

// Move the view: zoom by f about screen point (px, py), then pan by (dx, dy) pixels.
function transform(f, px, py, dx, dy) {
  if (!(f > 0 && f < Infinity)) return;
  const g = geometry(view);
  const ar = (px - g.W / 2) * g.s, ai = (g.H / 2 - py) * g.s;
  const mr = ar * (1 - f) - dx * g.s * f, mi = ai * (1 - f) + dy * g.s * f;
  const next = { re: view.re, im: view.im, Q: view.Q, r: view.r * f };
  setQ(next, needQ(next.r));
  const scale = Math.pow(2, next.Q);
  next.re += BigInt(Math.round(mr * scale));
  next.im += BigInt(Math.round(mi * scale));
  try {
    if (!inBounds(next)) { flash(); return; }
  } catch (err) {
    return fail(err);
  }
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

function runPass(fid, g, p, levels, sink) {
  const frame = { type: "frame", fid, W: g.W, H: g.H, s: g.s, top: p.top, low: p.low, levels, rounds: RENORM };
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
    const p = plan(v);
    if (!p) throw new Error("Ansicht außerhalb der Kette");
    showReadouts();
    const q = { ...g, W: Math.ceil(g.W / 4), H: Math.ceil(g.H / 4), s: g.s * 4 };
    small.width = q.W;
    small.height = q.H;
    // Per level: reference orbit at the view center in that level's coordinates.
    // Pixels near the reference escape about when it does; iteration limits then
    // scale together while the preview shows escapes crowding against them.
    const base = [];
    for (let j = p.low; j <= p.top; j++) {
      const L = chain.at(j), lamAbs = Math.hypot(L.lam[0], L.lam[1]);
      const P = Math.max(64, Math.ceil(Math.log2(1 / (lamAbs * g.s))) + 64);
      const c = chain.centerAt(j, v, P);
      const ref = referenceOrbit(c.cr, c.ci, P, PROBE);
      base.push({ c, P, ref, len: PROBE, need: Math.max(iterationsFor(lamAbs * g.s) + (j > 0 ? 20 * L.q : 0),
        ref.L < PROBE ? Math.ceil(ref.L * 1.5) : 0),
        level: { q: L.q, l: L.l, lr: L.lam[0], li: L.lam[1], lamAbs, offset: L.offset,
          cr: toNum(c.cr, P), ci: toNum(c.ci, P) } });
      if (my !== gen) return;
    }
    const levels = (boost) => base.map((b) => {
      const maxiter = Math.min(ITER_CAP, boost * b.need);
      if (maxiter > b.len && b.ref.L === b.len) {   // reference still bounded: extend it
        b.ref = referenceOrbit(b.c.cr, b.c.ci, b.P, maxiter);
        b.len = maxiter;
      }
      return { ...b.level, Zr: b.ref.Zr, Zi: b.ref.Zi, L: b.ref.L, maxiter };
    });
    let boost = lastBoost, lv;
    for (let raise = 0; ; raise++) {
      lv = levels(boost);
      if (my !== gen) return;
      const st = await runPass(my * 2, q, p, lv,
        (m) => smctx.putImageData(new ImageData(m.px, q.W, m.y1 - m.y0), 0, m.y0));
      if (st === null || my !== gen) return;
      const crowded = st.inside > 0 && st.late > 0.002 * q.W * q.H;
      if (!crowded || raise === 2 || lv.every((l) => l.maxiter >= ITER_CAP)) break;
      boost *= 4;
    }
    lastBoost = Math.max(1, boost / 2);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(small, 0, 0, q.W * 4, q.H * 4);
    keepSnapshot(v);

    const done = await runPass(my * 2 + 1, g, p, lv,
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

// Level whose set the window shows at about its own scale: the largest j that is
// still at least 1/50 of the window.
function showReadouts() {
  let j = 0;
  for (let k = 1; chain.at(k) && Math.hypot(...chain.at(k).lam) * view.r >= 0.05; k++) j = k;
  const z = Math.log10(START_R / view.r);
  $("zoom").textContent = (z >= 0 ? "rein " : "raus ") + "10^" + Math.abs(z).toFixed(1);
  $("welt").textContent = chain.seed;
  $("ebene").textContent = j;
}

// ---- state in the URL ----

function hex(v) { return (v < 0n ? "-" : "") + (v < 0n ? -v : v).toString(16); }
function unhex(s) { return s[0] === "-" ? -BigInt("0x" + s.slice(1)) : BigInt("0x" + s); }

function writeHash() {
  history.replaceState(null, "",
    `#welt=${chain.seed}&u=${hex(view.re)},${hex(view.im)},${view.Q}&r=${view.r.toExponential(6)}`);
}

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const seed = parseInt(p.get("welt"), 10);
  const w = (p.get("u") || "").split(",");
  const r = parseFloat(p.get("r"));
  let view = null;
  chain = new Chain(Number.isFinite(seed) ? seed : 1);
  if (p.has("u")) {
    try {
      const Q = +w[2];
      if (w.length !== 3 || !Number.isInteger(Q) || Q < 64 || Q > 1000) throw new Error();
      view = { re: unhex(w[0]), im: unhex(w[1]), Q, r };
    } catch {
      view = null;
    }
    if (!view || !inBounds(view)) {
      view = null;
      $("fehler").textContent = "Link unvollständig, zeige die Startansicht.";
      $("fehler").hidden = false;
    }
  }
  return { seed: Number.isFinite(seed) ? seed : null, view };
}

function start(seed, v) {
  if (seed !== chain.seed) chain = new Chain(seed);
  view = v || { re: 0n, im: 0n, Q: 64, r: START_R };
  snapView = null;
  lastBoost = 1;
  writeHash();
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

$("startknopf").addEventListener("click", () => start(chain.seed, null));
$("neuknopf").addEventListener("click", () => start((Math.random() * 1e9) >>> 0, null));
window.addEventListener("resize", resize);

const dpr0 = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = Math.round(canvas.clientWidth * dpr0);
canvas.height = Math.round(canvas.clientHeight * dpr0);
const initial = readHash();
start(initial.seed ?? 1, initial.view);
