"use strict";

const START_R = 2.5;
const TILE = 64;
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

const refWorker = new Worker("refworker.js");
refWorker.onerror = (e) => fail(new Error("Referenz-Worker: " + e.message));
const refWaiting = new Map();
let refId = 0;
refWorker.onmessage = (e) => {
  const { id, ...ref } = e.data;
  refWaiting.get(id)(ref);
  refWaiting.delete(id);
};
function orbit(c, P, maxiter) {
  return new Promise((resolve) => {
    refWaiting.set(++refId, resolve);
    refWorker.postMessage({ id: refId, cr: c.cr, ci: c.ci, P, maxiter });
  });
}

let chain, view, snapView = null;
let gen = 0, timer = 0, lastBoost = 1;
// Reference orbits per level, reused while the view stays near them.
let refCache = new Map();
// Finished tiles of the current frame, kept for repainting in another look.
let field = null;

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
  ctx.fillStyle = "#000";
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

// Tiles nearest the center first, so the middle of the picture appears first.
function tiles(g) {
  const list = [];
  for (let y = 0; y < g.H; y += TILE) {
    for (let x = 0; x < g.W; x += TILE) list.push({ x0: x, y0: y, x1: Math.min(g.W, x + TILE), y1: Math.min(g.H, y + TILE) });
  }
  const d = (t) => Math.hypot(t.x0 + TILE / 2 - g.W / 2, t.y0 + TILE / 2 - g.H / 2);
  return list.sort((a, b) => d(a) - d(b));
}

function runPass(fid, g, p, levels, sink) {
  const frame = { type: "frame", fid, W: g.W, H: g.H, s: g.s, top: p.top, low: p.low, levels, rounds: RENORM };
  const jobs = tiles(g);
  let pending = jobs.length;
  const stats = { late: 0, inside: 0 };
  return new Promise((resolve, reject) => {
    const next = (w) => {
      if (fid !== gen * 2 && fid !== gen * 2 + 1) return resolve(null);
      const t = jobs.shift();
      if (t) w.postMessage({ fid, ...t });
    };
    for (const w of workers) {
      w.onmessage = (e) => {
        const m = e.data;
        if (m.fid !== fid) return;
        try {
          sink(m);
        } catch (err) {
          jobs.length = 0;
          return reject(err);
        }
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

// Reference orbit for level j near the view center: reused while it lies within
// two view radii and has enough precision, otherwise computed anew.
async function reference(j, v, g, P) {
  const L = chain.at(j), lamAbs = Math.hypot(L.lam[0], L.lam[1]);
  const old = refCache.get(j);
  if (old && old.P >= P - 16) {
    const c = chain.centerAt(j, v, old.P);
    const d0r = toNum(c.cr - old.c.cr, old.P), d0i = toNum(c.ci - old.c.ci, old.P);
    if (Math.hypot(d0r, d0i) <= 2 * g.reach * lamAbs) return { b: old, d0r, d0i, c };
  }
  const c = chain.centerAt(j, v, P);
  const b = { c, P, ref: await orbit(c, P, PROBE), len: PROBE };
  refCache.set(j, b);
  return { b, d0r: 0, d0i: 0, c };
}

async function render() {
  const my = ++gen;
  const shown = view, v = { ...view };
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
      const r = await reference(j, v, g, P);
      if (my !== gen) return;
      base.push({ b: r.b, need: Math.max(iterationsFor(lamAbs * g.s) + (j > 0 ? 20 * L.q : 0),
        r.b.ref.L < PROBE ? Math.ceil(r.b.ref.L * 1.5) : 0),
        level: { q: L.q, l: L.l, lr: L.lam[0], li: L.lam[1], lamAbs, offset: L.offset,
          cr: toNum(r.c.cr, r.b.P), ci: toNum(r.c.ci, r.b.P), d0r: r.d0r, d0i: r.d0i } });
    }
    const levels = async (boost) => {
      const lv = [];
      for (const { b, need, level } of base) {
        const maxiter = Math.min(ITER_CAP, boost * need);
        if (maxiter > b.len && b.ref.L === b.len) {   // reference still bounded: extend it
          b.ref = await orbit(b.c, b.P, maxiter);
          b.len = maxiter;
        }
        lv.push({ ...level, Zr: b.ref.Zr, Zi: b.ref.Zi, L: b.ref.L, maxiter });
      }
      return lv;
    };
    let boost = lastBoost, lv;
    for (let raise = 0; ; raise++) {
      lv = await levels(boost);
      if (my !== gen) return;
      const st = await runPass(my * 2, q, p, lv, (m) => paintTile(smctx, m));
      if (st === null || my !== gen) return;
      const crowded = st.inside > 0 && st.late > 0.002 * q.W * q.H;
      if (!crowded || raise === 2 || lv.every((l) => l.maxiter >= ITER_CAP)) break;
      boost *= 4;
    }
    lastBoost = Math.max(1, boost / 2);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(small, 0, 0, q.W * 4, q.H * 4);
    keepSnapshot(v);

    field = { view: shown, W: g.W, H: g.H, tiles: [] };
    const f = field;
    const done = await runPass(my * 2 + 1, g, p, lv, (m) => {
      f.tiles.push(m);
      paintTile(ctx, m);
    });
    if (done === null || my !== gen) return;
    keepSnapshot(v);
    busy(false);
  } catch (err) {
    fail(err);
  }
}

// ---- color: band value and line distance per pixel, mapped by the palette ----

const PALETTES = {
  grau: { name: "Grau", inside: [0, 0, 0], deep: [8, 8, 8], tide: [58, 58, 58], glow: [242, 242, 242] },
  negativ: { name: "Negativ", inside: [250, 250, 250], deep: [244, 244, 244], tide: [196, 196, 196], glow: [12, 12, 12] },
  linien: { name: "Linien", inside: [0, 0, 0], deep: [0, 0, 0], tide: [10, 10, 10], glow: [255, 255, 255] },
  blau: { name: "Blau", inside: [1, 2, 4], deep: [5, 7, 13], tide: [17, 33, 58], glow: [200, 224, 246] },
  glut: { name: "Glut", inside: [0, 0, 0], deep: [10, 5, 3], tide: [70, 30, 10], glow: [255, 214, 160] },
};

const look = { palette: "grau", bands: 2.4, lines: 1 };
let stored = null;
try {
  stored = localStorage.getItem("mandelbrot-look");
} catch (err) {
  storeFailed("Farbe gilt nur bis zum Neuladen, der Browser speichert nichts", err);
}
try {
  const saved = JSON.parse(stored || "null");
  const ok = (x) => typeof x === "number" && x >= 0 && x < Infinity;
  if (saved && Object.prototype.hasOwnProperty.call(PALETTES, saved.palette) && ok(saved.bands) && ok(saved.lines)) {
    Object.assign(look, { palette: saved.palette, bands: +saved.bands, lines: +saved.lines });
  } else if (saved) {
    throw new Error("unbekannte Werte");
  }
} catch (err) {
  storeFailed("Gespeicherte Farbe nicht lesbar, zeige Grau", err);
}

// Never replaces a message already shown: a render error outranks this note.
function storeFailed(text, err) {
  console.error(err);
  if (!$("fehler").hidden) return;
  $("fehler").textContent = text + ".";
  $("fehler").hidden = false;
}

function paintTile(target, m) {
  const tw = m.x1 - m.x0, th = m.y1 - m.y0;
  const px = new Uint8ClampedArray(tw * th * 4);
  const pal = PALETTES[look.palette], { bands, lines } = look;
  for (let k = 0; k < tw * th; k++) {
    const v = m.res[2 * k], o = 4 * k;
    px[o + 3] = 255;
    if (v === -Infinity) { px[o] = pal.inside[0]; px[o + 1] = pal.inside[1]; px[o + 2] = pal.inside[2]; continue; }
    const d = m.res[2 * k + 1];
    const line = lines * (0.75 * Math.exp(-d * 1.6) + 0.08 * Math.exp(-d * 0.12));
    const gl = line > 1 ? 1 : line;
    const band = 0.5 + 0.5 * Math.cos(v * bands);
    for (let c = 0; c < 3; c++) {
      const b = pal.deep[c] + (pal.tide[c] - pal.deep[c]) * band;
      px[o + c] = b + (pal.glow[c] - b) * gl;
    }
  }
  target.putImageData(new ImageData(px, tw, th), m.x0, m.y0);
}

// Repaint the finished part of the frame in the current look, at most once per
// display frame while a slider is dragged.
let recolorQueued = false;
function recolor() {
  if (recolorQueued) return;
  recolorQueued = true;
  requestAnimationFrame(() => {
    recolorQueued = false;
    if (field && field.view === view && field.W === canvas.width && field.H === canvas.height) {
      for (const t of field.tiles) paintTile(ctx, t);
      if (!$("status").classList.contains("an")) keepSnapshot(view);
    }
    try {
      localStorage.setItem("mandelbrot-look", JSON.stringify(look));
    } catch (err) {
      storeFailed("Farbe gilt nur bis zum Neuladen, der Browser speichert nichts", err);
    }
  });
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
    `#welt=${chain.seed}&u=${hex(view.re)},${hex(view.im)},${view.Q}&r=${view.r.toExponential(6).replace("+", "")}`);
}

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const raw = p.get("welt");
  const seed = /^\d{1,10}$/.test(raw || "") && +raw < 2 ** 32 ? +raw : NaN;
  if (raw !== null && !Number.isFinite(seed)) {
    $("fehler").textContent = "Welt im Link ungültig, zeige Welt 1.";
    $("fehler").hidden = false;
  }
  const w = (p.get("u") || "").split(",");
  // Older links wrote "e+4", which URLSearchParams reads as "e 4".
  const r = parseFloat((p.get("r") || "").replace(" ", "+"));
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
  if (seed !== chain.seed) { chain = new Chain(seed); refCache = new Map(); }
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
  if (e.target instanceof HTMLInputElement) return;
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

// ---- look panel ----

const swatch = (pal) => {
  const stops = [pal.deep, pal.tide, pal.glow].map((c) => `rgb(${c.join(",")})`);
  return `linear-gradient(135deg, ${stops[0]}, ${stops[1]} 55%, ${stops[2]})`;
};
for (const [id, pal] of Object.entries(PALETTES)) {
  const b = document.createElement("button");
  b.type = "button";
  b.dataset.palette = id;
  const m = document.createElement("span");
  m.className = "muster";
  m.style.background = swatch(pal);
  b.append(m, pal.name);
  b.addEventListener("click", () => { look.palette = id; syncLook(); recolor(); });
  $("paletten").append(b);
}
function syncLook() {
  for (const b of $("paletten").children) b.setAttribute("aria-pressed", String(b.dataset.palette === look.palette));
  $("baender").value = look.bands;
  $("linien").value = look.lines;
}
$("baender").addEventListener("input", (e) => { look.bands = +e.target.value; recolor(); });
$("linien").addEventListener("input", (e) => { look.lines = +e.target.value; recolor(); });
$("farbknopf").addEventListener("click", () => {
  const open = $("farben").hidden;
  $("farben").hidden = !open;
  $("farbknopf").setAttribute("aria-expanded", String(open));
});
syncLook();

$("startknopf").addEventListener("click", () => start(chain.seed, null));
$("neuknopf").addEventListener("click", () => start((Math.random() * 1e9) >>> 0, null));
window.addEventListener("resize", resize);

const dpr0 = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = Math.round(canvas.clientWidth * dpr0);
canvas.height = Math.round(canvas.clientHeight * dpr0);
const initial = readHash();
start(initial.seed ?? 1, initial.view);
