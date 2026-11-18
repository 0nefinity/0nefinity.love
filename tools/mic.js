(() => {
'use strict';

const $ = id => document.getElementById(id);
const stage = $('mic');
const cW = $('welle'), cM = $('mod'), cS = $('sg'), cP = $('spek');
const lesung = $('lesung');
const dpr = () => Math.min(window.devicePixelRatio || 1, 2);

// ---------- Farben nur aus meta.css ----------
function grau(name) {
  const c = document.createElement('canvas'); c.width = c.height = 1;
  const x = c.getContext('2d');
  x.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || (name === '--bg-color' ? 'black' : 'white');
  x.fillRect(0, 0, 1, 1);
  const d = x.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2]];
}
let BG = [0, 0, 0], FG = [255, 255, 255];
const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

// ---------- Fehler laut ----------
function fehler(e, wo) {
  console.error('mic', wo, e);
  const el = $('fehler');
  el.textContent = (e && e.name ? e.name + ': ' : '') + (e && e.message ? e.message : String(e));
  el.style.display = 'block';
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
}
const fehlerAus = () => { $('fehler').style.display = 'none'; };

// ---------- Zustand ----------
const P = {
  tempo: 1, st: 0, rueck: false, pegel: 1,
  filter: 'aus', fhz: 1000, fq: 1,
  echoS: 0.3, echoFb: 0.4, echoMix: 0, hallMix: 0, hallS: 2, verz: 0,
  tit: false, bit: false, steig: 'aus', leben: false, krebs: false, rekursiv: false, frei: false,
};
let src = new Float32Array(0);      // Quelle mono
let sr = 44100;
let sel = null;                     // {a,b} Anteile von src
let orig = new Float32Array(0);     // Region unverändert
let out = null;                     // {ch:[Float32Array], sr}
let ab = 0;                         // 0 original, 1 verändert
let f = 0;                          // Abspielposition 0..1 im hörbaren Puffer

let ac = null, anaIn = null, anaOut = null;
let rec = null;                     // {stream, node, chunks, n, mins, maxs, cur, curN}
let wiedergabe = null;              // {quelle, t0, dur}
let schleifeAn = false;             // Loop: Region (Auswahl oder alles) lückenlos wiederholen
let freiPos = 0;                    // Moment einfrieren: Stelle als Anteil von src
// Ein eingefrorener Moment hat kein Ende: er läuft im Kreis, auch ohne Loop.
const endlos = () => schleifeAn || (ab === 1 && !!out && out.frei != null);
const BLENDE = 0.02;                // s, Ein-/Ausblendung gegen Knackser beim Tauschen des Puffers
let rafId = 0;

// ---------- Audio-Kontext (iOS: in der Geste) ----------
function ctxHolen() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ac = new AC();
    anaIn = ac.createAnalyser(); anaOut = ac.createAnalyser();
    for (const a of [anaIn, anaOut]) { a.fftSize = 2048; a.minDecibels = -100; a.maxDecibels = -20; a.smoothingTimeConstant = 0.5; }
    anaOut.connect(ac.destination);
  }
  if (ac.state !== 'running') ac.resume().catch(e => fehler(e, 'resume'));
  return ac;
}
addEventListener('pointerdown', () => { try { ctxHolen(); } catch (e) { fehler(e, 'ctx'); } }, { once: true });

// ---------- FFT ----------
const NF = 2048;
const fftRe = new Float32Array(NF), fftIm = new Float32Array(NF);
const hann = new Float32Array(NF);
for (let i = 0; i < NF; i++) hann[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / NF);
const rev = new Uint16Array(NF);
for (let i = 0, bits = Math.log2(NF); i < NF; i++) { let r = 0; for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b); rev[i] = r; }
const cosT = new Float32Array(NF / 2), sinT = new Float32Array(NF / 2);
for (let i = 0; i < NF / 2; i++) { cosT[i] = Math.cos(2 * Math.PI * i / NF); sinT[i] = -Math.sin(2 * Math.PI * i / NF); }
function fft() {
  for (let i = 0; i < NF; i++) { const j = rev[i]; if (j > i) { let t = fftRe[i]; fftRe[i] = fftRe[j]; fftRe[j] = t; t = fftIm[i]; fftIm[i] = fftIm[j]; fftIm[j] = t; } }
  for (let len = 2; len <= NF; len <<= 1) {
    const h = len >> 1, step = NF / len;
    for (let i = 0; i < NF; i += len) for (let k = 0; k < h; k++) {
      const wr = cosT[k * step], wi = sinT[k * step];
      const a = i + k, b = a + h;
      const tr = fftRe[b] * wr - fftIm[b] * wi, ti = fftRe[b] * wi + fftIm[b] * wr;
      fftRe[b] = fftRe[a] - tr; fftIm[b] = fftIm[a] - ti;
      fftRe[a] += tr; fftIm[a] += ti;
    }
  }
}
// dB-Spektrum (1024 Bins) eines Fensters ab Position s
function spektrumAb(x, s, db) {
  for (let i = 0; i < NF; i++) { const v = s + i < x.length && s + i >= 0 ? x[s + i] : 0; fftRe[i] = v * hann[i]; fftIm[i] = 0; }
  fft();
  for (let k = 0; k < NF / 2; k++) db[k] = 20 * Math.log10(Math.hypot(fftRe[k], fftIm[k]) / (NF / 4) + 1e-9);
  return db;
}

// ---------- Tonhöhe (YIN) ----------
function yin(x, s, rate) {
  const W = 1024, tauMax = Math.min(W, Math.floor(rate / 60));
  if (s < 0 || s + W + tauMax > x.length) return 0;
  let e = 0; for (let i = 0; i < W; i++) e += x[s + i] * x[s + i];
  if (Math.sqrt(e / W) < 0.003) return 0;
  const d = new Float32Array(tauMax + 1);
  for (let t = 1; t <= tauMax; t++) { let sum = 0; for (let j = 0; j < W; j++) { const v = x[s + j] - x[s + j + t]; sum += v * v; } d[t] = sum; }
  let run = 0; d[0] = 1;
  for (let t = 1; t <= tauMax; t++) { run += d[t]; d[t] = d[t] * t / (run || 1); }
  const lo = Math.max(2, Math.floor(rate / 4000));
  let t = lo;
  while (t < tauMax) {
    if (d[t] < 0.15) { while (t + 1 < tauMax && d[t + 1] < d[t]) t++; break; }
    t++;
  }
  if (t >= tauMax) return 0;
  const a = d[t - 1], b = d[t], c = d[t + 1] ?? d[t];
  const den = a - 2 * b + c;
  const tau = den ? t + 0.5 * (a - c) / den : t;
  return rate / tau;
}
const NOTEN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function notenText(hz) {
  if (!(hz > 0)) return '';
  const m = 69 + 12 * Math.log2(hz / 440), r = Math.round(m), ct = Math.round((m - r) * 100);
  return NOTEN[((r % 12) + 12) % 12] + (Math.floor(r / 12) - 1) + ' ' + (ct >= 0 ? '+' : '') + ct;
}
function spitze(db, rate) {
  let k = 2, best = -1e9;
  for (let i = 2; i < db.length - 1; i++) if (db[i] > best) { best = db[i]; k = i; }
  if (best < -90) return 0;
  const a = db[k - 1], b = db[k], c = db[k + 1], den = a - 2 * b + c;
  const off = den ? 0.5 * (a - c) / den : 0;
  return (k + off) * rate / NF;
}

// ---------- Region, Verarbeitung ----------
function regionHolen() {
  if (!src.length) return new Float32Array(0);
  if (!sel) return src;
  const a = Math.floor(sel.a * src.length), b = Math.ceil(sel.b * src.length);
  return src.subarray(a, Math.max(a + 1, b));
}

// WSOLA und die 0n-Rechnungen (Ton im Ton, endlos steigend) laufen im Worker (tools/mic-worker.js); ein neuer Auftrag verwirft den laufenden.
let wk = null, wkJob = null;
const wsolaAsync = (x, rate, s) => workerAuftrag({ x, rate, s }).then(d => d && d.y);
// Antwort: {y, zusatz} (zusatz: Ebenen von Ton im Ton, Welten von game of life) oder null, wenn überholt.
function workerAuftrag(auftrag) {
  return new Promise((res, rej) => {
    if (wkJob) { wkJob(null); wk.terminate(); wk = null; wkJob = null; }
    const w = wk = new Worker('/tools/mic-worker.js');
    wkJob = res;
    w.onmessage = ev => { if (wk === w) wkJob = null; w.terminate(); res(ev.data); };
    w.onerror = e => { if (wk === w) wkJob = null; rej(new Error(e.message || 'worker')); };
    w.postMessage(auftrag);
  });
}

function hallImpuls(rate, sek) {
  const n = Math.max(1, Math.floor(sek * rate));
  let z = 123456789;
  const rnd = () => { z = (Math.imul(z, 1664525) + 1013904223) >>> 0; return z / 4294967296 * 2 - 1; };
  const b = new AudioBuffer({ length: n, numberOfChannels: 2, sampleRate: rate });
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = rnd() * Math.exp(-6.9 * i / n); }
  return b;
}
function kurve(k) {
  const n = 2048, c = new Float32Array(n), g = 1 + k * 20, nm = Math.tanh(g);
  for (let i = 0; i < n; i++) { const x = i * 2 / (n - 1) - 1; c[i] = Math.tanh(x * g) / nm; }
  return c;
}

let renderToken = 0, renderTimer = 0, renderOffen = null;
function planen() {
  clearTimeout(renderTimer);
  orig = regionHolen();
  renderTimer = setTimeout(() => { renderTimer = 0; renderOffen = rendern(); }, 150);
}
async function rendern() {
  const my = ++renderToken;
  try {
    const x0 = regionHolen();
    if (!x0.length) { out = null; return; }
    const v = await kette(x0, my);
    if (!v || my !== renderToken) return;
    let ch = v.ch, haupt = v.haupt;
    // rekursiv echo: jede Wiederholung ist die vorige, noch einmal durch die ganze Kette geschickt, und setzt
    // in der Mitte der vorigen ein. Jede Ebene enthält alle vorigen: ein Baum aus Echos von Echos.
    if (P.rekursiv) {
      const len0 = ch[0].length, grenze = Math.max(len0, Math.min(4 * len0, 60 * sr));
      const ebenen = [{ ch, start: 0 }];
      let ende = len0, start = 0, vor = v;
      for (let k = 1; Math.pow(0.6, k) >= 0.02; k++) {
        const m = new Float32Array(vor.ch[0].length);
        for (let i = 0; i < m.length; i++) m[i] = 0.5 * (vor.ch[0][i] + vor.ch[1][i]);
        const w = await kette(m, my);
        if (!w || my !== renderToken) return;
        start += Math.round(0.5 * vor.ch[0].length * vor.haupt);
        if (w.ch[0].length < 64 || start + w.ch[0].length > grenze) break;
        ebenen.push({ ch: w.ch, start, g: Math.pow(0.6, k) });
        ende = Math.max(ende, start + w.ch[0].length); vor = w;
      }
      const L = new Float32Array(ende), R = new Float32Array(ende);
      for (const e of ebenen) { const g = e.g || 1; for (let i = 0; i < e.ch[0].length; i++) { L[e.start + i] += g * e.ch[0][i]; R[e.start + i] += g * e.ch[1][i]; } }
      let m0 = 0, m1 = 0;
      for (let i = 0; i < len0; i++) m0 = Math.max(m0, Math.abs(ch[0][i]), Math.abs(ch[1][i]));
      for (let i = 0; i < ende; i++) m1 = Math.max(m1, Math.abs(L[i]), Math.abs(R[i]));
      if (m1 > Math.max(m0, 0.99) && m1 > 0) { const g = Math.max(m0, 0.99) / m1; for (let i = 0; i < ende; i++) { L[i] *= g; R[i] *= g; } }
      haupt = haupt * len0 / ende; ch = [L, R];
    }
    // haupt: Anteil des Puffers, den der Clip selbst füllt (danach nur Echo-/Hallfahne).
    out = { ch, sr, bit: P.bit, tit: v.tit, leben: v.leben, krebs: P.krebs, frei: v.frei, rekursiv: P.rekursiv, haupt };
    if (P.bit) einBit(out.ch);
    malSpurAbgeholt(my);
    if (wiedergabe) abspielen(f);
    zeichneAnalyse();
  } catch (e) { fehler(e, 'render'); }
}

// Die ganze Effektkette für einen Mono-Puffer x. Liefert {ch, haupt, tit, leben, frei} oder null, wenn überholt.
async function kette(x, my) {
    if (P.rueck) { x = Float32Array.from(x).reverse(); }
    let tit = null, leben = null, frei = null, d;
    // Krebs Kanon: der Clip und sein Krebs zugleich, vorwärts und rückwärts. In der Mitte begegnen sie sich.
    if (P.krebs) {
      const n = x.length, k = new Float32Array(n);
      let m0 = 0, m1 = 0;
      for (let i = 0; i < n; i++) { k[i] = x[i] + x[n - 1 - i]; m0 = Math.max(m0, Math.abs(x[i])); m1 = Math.max(m1, Math.abs(k[i])); }
      if (m1 > 0) for (let i = 0; i < n; i++) k[i] *= m0 / m1;
      x = k;
    }
    if (P.frei) {
      const a = sel ? sel.a : 0, b = sel ? sel.b : 1;
      let p = Math.max(0, Math.min(1, (freiPos - a) / Math.max(1e-9, b - a)));
      frei = a + p * (b - a);
      if (P.rueck) p = 1 - p;
      d = await workerAuftrag({ op: 'frei', x, rate: sr, p }); if (!d || my !== renderToken) return null; x = d.y;
    }
    if (P.tit) { d = await workerAuftrag({ op: 'tit', x, rate: sr }); if (!d || my !== renderToken) return null; x = d.y; tit = d.zusatz.ebenen; }
    if (P.steig !== 'aus') { d = await workerAuftrag({ op: P.steig, x, rate: sr }); if (!d || my !== renderToken) return null; x = d.y; }
    if (P.leben) { d = await workerAuftrag({ op: 'leben', x, rate: sr }); if (!d || my !== renderToken) return null; x = d.y; leben = d.zusatz; }
    const p =Math.pow(2, P.st / 12), t = Math.max(0.01, P.tempo), s = p / t;
    if (Math.abs(s - 1) > 1e-3) { x = await wsolaAsync(x, sr, s); if (x === null || my !== renderToken) return null; }
    await new Promise(r => setTimeout(r, 0));
    if (my !== renderToken) return null;
    const tail = (P.echoMix > 0 ? Math.min(P.echoS * 6, 8) : 0) + (P.hallMix > 0 ? P.hallS : 0);
    const len = Math.max(1, Math.ceil(x.length / p) + Math.ceil(tail * sr));
    const oc = new OfflineAudioContext(2, len, sr);
    const buf = oc.createBuffer(1, x.length, sr); buf.copyToChannel(x, 0);
    const q = oc.createBufferSource(); q.buffer = buf; q.playbackRate.value = p;
    const g = oc.createGain(); g.gain.value = P.pegel;
    q.connect(g);
    let k = g;
    if (P.filter !== 'aus') {
      const bq = oc.createBiquadFilter();
      bq.type = { low: 'lowpass', high: 'highpass', band: 'bandpass' }[P.filter];
      bq.frequency.value = Math.max(1, Math.min(P.fhz, sr / 2 - 1)); bq.Q.value = Math.max(0.0001, P.fq);
      k.connect(bq); k = bq;
    }
    if (P.verz > 0) {
      const w = oc.createWaveShaper(); w.curve = kurve(P.verz); w.oversample = '4x';
      k.connect(w); k = w;
    }
    k.connect(oc.destination);
    if (P.echoMix > 0) {
      const dl = oc.createDelay(10); dl.delayTime.value = Math.min(10, Math.max(0.001, P.echoS));
      const fb = oc.createGain(); fb.gain.value = Math.min(0.95, Math.max(0, P.echoFb));
      const wet = oc.createGain(); wet.gain.value = P.echoMix;
      k.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(wet); wet.connect(oc.destination);
    }
    if (P.hallMix > 0) {
      const cv = oc.createConvolver(); cv.buffer = hallImpuls(sr, Math.max(0.05, P.hallS));
      const wet = oc.createGain(); wet.gain.value = P.hallMix;
      k.connect(cv); cv.connect(wet); wet.connect(oc.destination);
    }
    q.start();
    const r = await oc.startRendering();
    if (my !== renderToken) return null;
    return { ch: [r.getChannelData(0), r.getChannelData(1)], haupt: Math.min(1, x.length / p / len), tit, leben, frei };
}

// 1-Bit: jeder Abtastwert wird 1 oder 0 (oben oder unten, sonst nichts). Was zu leise ist, um sich zu entscheiden,
// bleibt, was es war: Stille ist ein Bit, das sich nicht ändert.
function einBit(chs) {
  let m = 0;
  for (const d of chs) for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > m) m = v; }
  const schwelle = 0.02 * m, hoehe = 0.3 * Math.min(1, m);
  for (const d of chs) {
    let b = 1;
    for (let i = 0; i < d.length; i++) {
      const v = d[i];
      if (v > schwelle) b = 1; else if (v < -schwelle) b = 0;
      d[i] = b ? hoehe : -hoehe;
    }
  }
}

// hörbarer Puffer (mono für Analyse)
function hoerbar() {
  if (ab === 1 && out) {
    const a = out.ch[0], b = out.ch[1], m = new Float32Array(a.length);
    for (let i = 0; i < m.length; i++) m[i] = 0.5 * (a[i] + b[i]);
    return { x: m, rate: out.sr };
  }
  return { x: orig, rate: sr };
}
let hoerCache = { out: null, orig: null, ab: -1, v: null }, hoerVer = 0;
function hoerbarCache() {
  if (hoerCache.out !== out || hoerCache.orig !== orig || hoerCache.ab !== ab) { hoerCache = { out, orig, ab, v: hoerbar() }; hoerVer++; }
  return hoerCache.v;
}

// ---------- Wiedergabe ----------
function dauer() { const h = hoerbarCache(); return h.x.length / h.rate; }
function abspielen(von) {
  stopQuelle();
  const c = ctxHolen();
  const useOut = ab === 1 && out;
  const chs = useOut ? out.ch : [orig];
  const rate = useOut ? out.sr : sr;
  if (!chs[0].length) return;
  const b = c.createBuffer(chs.length, chs[0].length, rate);
  chs.forEach((d, i) => b.copyToChannel(d, i));
  const q = c.createBufferSource(); q.buffer = b; q.loop = endlos();
  const gn = c.createGain(); gn.gain.setValueAtTime(0, c.currentTime); gn.gain.linearRampToValueAtTime(1, c.currentTime + BLENDE);
  q.connect(gn); gn.connect(anaOut);
  const dur = b.duration;
  f = Math.min(Math.max(von, 0), 0.9999);
  q.onended = () => { if (wiedergabe && wiedergabe.quelle === q) { wiedergabe = null; f = 0; knoepfe(); zeichneAlles(); } };
  q.start(0, f * dur);
  wiedergabe = { quelle: q, gain: gn, t0: c.currentTime - f * dur, dur };
  knoepfe(); schleife();
}
function posF() {
  const x = (ac.currentTime - wiedergabe.t0) / wiedergabe.dur;
  return endlos() ? ((x % 1) + 1) % 1 : Math.min(1, x);
}
function stopQuelle() {
  if (wiedergabe) {
    const { quelle: q, gain: gn } = wiedergabe; wiedergabe = null; q.onended = null;
    try { const t = ac.currentTime; gn.gain.cancelScheduledValues(t); gn.gain.setValueAtTime(gn.gain.value, t); gn.gain.linearRampToValueAtTime(0, t + BLENDE); q.stop(t + BLENDE); } catch (e) { /* schon gestoppt */ }
  }
}
function pause() {
  if (!wiedergabe) return;
  f = posF();
  stopQuelle(); knoepfe(); zeichneAlles();
}
function spulen(neu) {
  f = Math.min(Math.max(neu, 0), 0.9999);
  if (wiedergabe) abspielen(f); else zeichneAlles();
}

// ---------- Clips, Verlauf, Bearbeiten, Speichern ----------
// Clip-Objekte sind unveränderlich ({id, name, data, sr}); Änderung = neues Objekt. Darum kostet ein Verlaufsschritt nur Verweise.
let clips = [], curId = null, nextId = 1;
let view = { a: 0, b: 1 };              // sichtbarer Ausschnitt der Welle (Anteile des Clips)
let zwischen = null;                    // Ablage {x, sr}
let undoSt = [], redoSt = [];
const VERLAUF = 30;
let zuletztId = null;
const aktuell = () => clips.find(c => c.id === curId) || null;
const snap = () => ({ clips, curId });

function ladeAktuell(cursor) {
  if (wiedergabe) stopQuelle();
  const c = aktuell();
  src = c ? c.data : new Float32Array(0);
  if (c) sr = c.sr;
  sel = null; f = 0;
  if (curId !== zuletztId) view = { a: 0, b: 1 };
  zuletztId = curId;
  if (cursor != null) f = P.rueck ? 1 - cursor : cursor;
  const sp = view.b - view.a, mn = Math.min(1, 64 / Math.max(1, src.length));
  view = { a: Math.max(0, Math.min(1 - Math.max(sp, mn), view.a)), b: 0 }; view.b = Math.min(1, view.a + Math.max(sp, mn));
  planen(); clipsZeichnen(); editKnoepfe(); knoepfe(); zeichneAlles(); scrollZeichnen();
}
function aendern(fn, cursor, nurListe) {
  undoSt.push(snap()); if (undoSt.length > VERLAUF) undoSt.shift(); redoSt = [];
  fn();
  if (nurListe) { clipsZeichnen(); editKnoepfe(); } else ladeAktuell(cursor);
  speichernPlanen();
}
function stellen(s) { clips = s.clips; curId = s.curId; ladeAktuell(); speichernPlanen(); }
function zurueck() { if (rec) return; const s = undoSt.pop(); if (!s) return; redoSt.push(snap()); stellen(s); }
function vor() { if (rec) return; const s = redoSt.pop(); if (!s) return; undoSt.push(snap()); stellen(s); }
function neuerClip(data, rate, name) {
  aendern(() => {
    const c = { id: nextId++, name: name || ('aufnahme ' + (clips.length + 1)), data, sr: rate };
    clips = [...clips, c]; curId = c.id;
  });
}
function waehlen(id) {
  if (rec || id === curId) return;
  curId = id; ladeAktuell(); speichernPlanen();
}

// ----- Bearbeiten (immer auf dem aktuellen Clip)
function concat(...teile) {
  const o = new Float32Array(teile.reduce((n, t) => n + t.length, 0)); let p = 0;
  for (const t of teile) { o.set(t, p); p += t.length; }
  return o;
}
function resample(x, von, nach) {
  if (von === nach || !x.length) return x;
  const n = Math.max(1, Math.round(x.length * nach / von)), y = new Float32Array(n), r = von / nach;
  for (let i = 0; i < n; i++) { const p = i * r, i0 = Math.floor(p), fr = p - i0; y[i] = x[Math.min(i0, x.length - 1)] * (1 - fr) + x[Math.min(i0 + 1, x.length - 1)] * fr; }
  return y;
}
function cursorIdx(len) { return Math.min(len, Math.max(0, Math.round(posAufQuelle(f) * len))); }
function bereich(len, mussSel) {
  if (sel) { const a = Math.max(0, Math.floor(sel.a * len)), b = Math.min(len, Math.ceil(sel.b * len)); if (b > a) return [a, b]; }
  return mussSel ? null : [0, len];
}
function bearbeiten(fn) {
  const c = aktuell(); if (!c || rec) return;
  if (wiedergabe) f = posF();
  const neu = fn(c); if (!neu) return;
  const cur = neu.cur; delete neu.cur;
  aendern(() => { clips = clips.map(k => k.id === c.id ? { ...k, ...neu } : k); }, cur == null ? 0 : cur / Math.max(1, neu.data.length));
}
const rampe = mitte => bearbeiten(k => {
  const r = bereich(k.data.length, false), d = Float32Array.from(k.data), n = r[1] - r[0];
  for (let i = 0; i < n; i++) d[r[0] + i] *= mitte(i, n);
  return { data: d, cur: r[0] };
});
const E = {
  trim() { bearbeiten(c => { const r = bereich(c.data.length, true); return r && { data: c.data.slice(r[0], r[1]), cur: 0 }; }); },
  schneiden() {
    bearbeiten(c => { const r = bereich(c.data.length, true); if (!r) return null; zwischen = { x: c.data.slice(r[0], r[1]), sr: c.sr }; return { data: concat(c.data.subarray(0, r[0]), c.data.subarray(r[1])), cur: r[0] }; });
  },
  entfernen() { bearbeiten(c => { const r = bereich(c.data.length, true); return r && { data: concat(c.data.subarray(0, r[0]), c.data.subarray(r[1])), cur: r[0] }; }); },
  kopieren() { const c = aktuell(); const r = c && bereich(c.data.length, true); if (!r) return; zwischen = { x: c.data.slice(r[0], r[1]), sr: c.sr }; editKnoepfe(); },
  einfuegen() {
    if (!zwischen) return;
    bearbeiten(c => { const x = resample(zwischen.x, zwischen.sr, c.sr), i = cursorIdx(c.data.length); return { data: concat(c.data.subarray(0, i), x, c.data.subarray(i)), cur: i + x.length }; });
  },
  luecke() {
    const inp = $('luecke'), sek = parseFloat(String(inp.value).replace(',', '.'));
    if (!(sek > 0)) { inp.classList.remove('wackel'); void inp.offsetWidth; inp.classList.add('wackel'); return; }
    bearbeiten(c => { const i = cursorIdx(c.data.length), n = Math.round(sek * c.sr); return { data: concat(c.data.subarray(0, i), new Float32Array(n), c.data.subarray(i)), cur: i + n }; });
  },
  teilen() {
    const c = aktuell(); if (!c || rec) return;
    if (wiedergabe) f = posF();
    const i = cursorIdx(c.data.length); if (i <= 0 || i >= c.data.length) return;
    aendern(() => {
      const zwei = { id: nextId++, name: c.name + ' 2', data: c.data.slice(i), sr: c.sr };
      const eins = { ...c, data: c.data.slice(0, i) };
      clips = clips.flatMap(k => k.id === c.id ? [eins, zwei] : [k]);
    }, 1);
  },
  einblenden() { rampe((i, n) => (i + 0.5) / n); },
  ausblenden() { rampe((i, n) => 1 - (i + 0.5) / n); },
  normalisieren() {
    bearbeiten(c => {
      const r = bereich(c.data.length, false); let pk = 0;
      for (let i = r[0]; i < r[1]; i++) { const v = Math.abs(c.data[i]); if (v > pk) pk = v; }
      if (pk < 1e-6) return null;
      const d = Float32Array.from(c.data), g = 0.97 / pk;
      for (let i = r[0]; i < r[1]; i++) d[i] *= g;
      return { data: d, cur: r[0] };
    });
  },
  anhaengen(id) {
    const c = aktuell(), t = clips.find(k => k.id === id); if (!c || !t || c === t || rec) return;
    aendern(() => {
      const neu = { ...t, data: concat(t.data, resample(c.data, c.sr, t.sr)) };
      clips = clips.filter(k => k.id !== c.id).map(k => k.id === t.id ? neu : k); curId = t.id;
    }, t.data.length / (t.data.length + Math.round(c.data.length * t.sr / c.sr)));
  },
  kopie() {
    const c = aktuell(); if (!c || rec) return;
    aendern(() => {
      const n = { id: nextId++, name: c.name + ' kopie', data: c.data, sr: c.sr };
      const i = clips.indexOf(c); clips = [...clips.slice(0, i + 1), n, ...clips.slice(i + 1)]; curId = n.id;
    });
  },
  loeschen() {
    const c = aktuell(); if (!c || rec) return;
    aendern(() => {
      const i = clips.indexOf(c); clips = clips.filter(k => k !== c);
      curId = clips.length ? clips[Math.min(i, clips.length - 1)].id : null;
    });
    toast('gelöscht', 'zurück', zurueck);
  },
};

// ----- Zoom
function setView(a, b) {
  const mn = Math.min(1, 64 / Math.max(1, src.length)), sp = Math.min(1, Math.max(mn, b - a));
  a = Math.max(0, Math.min(1 - sp, a)); view = { a, b: a + sp };
  zeichneWelle(); scrollZeichnen();
}
function zoomen(faktor) { const m = (view.a + view.b) / 2, sp = (view.b - view.a) * faktor; setView(m - sp / 2, m + sp / 2); }
function scrollZeichnen() {
  const sp = view.b - view.a, aus = sp >= 0.9999 || !src.length;
  $('scroll').hidden = aus;
  if (!aus) { $('daumen').style.left = view.a * 100 + '%'; $('daumen').style.width = sp * 100 + '%'; }
}
(() => {
  const tr = $('scroll'); let zieht = false;
  const setzen = e => { const r = tr.getBoundingClientRect(), m = (e.clientX - r.left) / r.width, sp = view.b - view.a; setView(m - sp / 2, m + sp / 2); };
  tr.addEventListener('pointerdown', e => { zieht = true; tr.setPointerCapture(e.pointerId); setzen(e); });
  tr.addEventListener('pointermove', e => { if (zieht) setzen(e); });
  const ende = () => { zieht = false; };
  tr.addEventListener('pointerup', ende); tr.addEventListener('pointercancel', ende);
})();

// ----- Oberfläche: Clip-Zeile, Werkzeugleiste, Meldung
const SVG = d => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '"/></svg>';
const WERKZEUG = [
  ['undo', 'rückgängig', 'M9 14 L4 9 L9 4 M4 9 H14 A6 6 0 0 1 14 21 H10', () => zurueck()],
  ['redo', 'wiederherstellen', 'M15 14 L20 9 L15 4 M20 9 H10 A6 6 0 0 0 10 21 H14', () => vor()],
  null,
  ['trim', 'trim: Auswahl behalten', 'M6 2 V18 H22 M2 6 H18 V22', () => E.trim()],
  ['cut', 'ausschneiden', 'M8 6 A3 3 0 1 1 5 3 A3 3 0 0 1 8 6 Z M8 18 A3 3 0 1 1 5 15 A3 3 0 0 1 8 18 Z M8 7.5 L21 18 M8 16.5 L21 6', () => E.schneiden()],
  ['copy', 'kopieren', 'M9 9 H20 V20 H9 Z M5 15 V4 H15', () => E.kopieren()],
  ['paste', 'einfügen', 'M9 4 H15 V7 H9 Z M7 5.5 H5 V21 H19 V5.5 H17', () => E.einfuegen()],
  ['split', 'teilen an der Abspielposition', 'M12 2 V22 M8 7 L4 12 L8 17 M16 7 L20 12 L16 17', () => E.teilen()],
  null,
  ['fadein', 'einblenden', 'M3 20 L21 20 L21 4 Z', () => E.einblenden()],
  ['fadeout', 'ausblenden', 'M3 4 V20 H21 Z', () => E.ausblenden()],
  ['norm', 'normalisieren', 'M12 3 V9 M9 6 L12 9 L15 6 M12 21 V15 M9 18 L12 15 L15 18 M4 12 H20', () => E.normalisieren()],
  null,
  ['zin', 'vergrößern', 'M10 4 A6 6 0 1 1 10 16 A6 6 0 1 1 10 4 M15 15 L21 21 M7 10 H13 M10 7 V13', () => zoomen(0.5)],
  ['zout', 'verkleinern', 'M10 4 A6 6 0 1 1 10 16 A6 6 0 1 1 10 4 M15 15 L21 21 M7 10 H13', () => zoomen(2)],
];
function werkzeugBauen() {
  const box = $('schnitt');
  for (const w of WERKZEUG) {
    if (!w) { const t = document.createElement('span'); t.className = 'trenn'; box.appendChild(t); continue; }
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'e-' + w[0]; b.title = w[1]; b.ariaLabel = w[1]; b.innerHTML = SVG(w[2]);
    b.addEventListener('click', w[3]); box.appendChild(b);
  }
  const lb = document.createElement('button');
  lb.type = 'button'; lb.id = 'e-luecke'; lb.className = 'wort'; lb.textContent = 'lücke'; lb.title = lb.ariaLabel = 'Stille einfügen an der Abspielposition';
  lb.addEventListener('click', () => E.luecke());
  const li = document.createElement('input');
  li.id = 'luecke'; li.type = 'text'; li.value = '1'; li.inputMode = 'decimal'; li.size = 3; li.title = li.ariaLabel = 'Länge der Lücke in Sekunden';
  li.autocomplete = 'off'; li.setAttribute('data-1p-ignore', ''); li.setAttribute('data-lpignore', 'true'); li.setAttribute('data-bwignore', ''); li.setAttribute('data-form-type', 'other');
  const ls = document.createElement('span'); ls.className = 'einheit'; ls.textContent = 's';
  box.append(lb, li, ls);
  const aus = document.createElement('select');
  aus.id = 'anhaengen'; aus.title = aus.ariaLabel = 'anhängen an';
  aus.addEventListener('change', () => { const v = Number(aus.value); aus.value = ''; if (v) E.anhaengen(v); });
  box.appendChild(aus);
  const akt = $('clipaktion');
  for (const [id, text, fn] of [['c-name', 'name', () => umbenennen()], ['c-kopie', 'kopie', () => E.kopie()], ['c-weg', 'löschen', () => E.loeschen()]]) {
    const b = document.createElement('button'); b.type = 'button'; b.id = id; b.textContent = text; b.title = b.ariaLabel = { name: 'Clip umbenennen', kopie: 'Clip duplizieren', 'löschen': 'Clip löschen' }[text];
    b.addEventListener('click', fn); akt.appendChild(b);
  }
}
function clipsZeichnen() {
  const hat = clips.length > 0;
  $('clips').hidden = $('schnitt').hidden = !hat;
  const ch = $('chips'); ch.textContent = '';
  for (const c of clips) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip' + (c.id === curId ? ' an' : ''); b.dataset.id = c.id;
    b.textContent = c.name; b.title = c.name; b.setAttribute('aria-pressed', String(c.id === curId));
    b.addEventListener('click', () => waehlen(c.id));
    ch.appendChild(b);
  }
  const an = ch.querySelector('.an'); if (an && an.scrollIntoView) an.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const s = $('anhaengen'); s.textContent = '';
  const o0 = document.createElement('option'); o0.value = ''; o0.textContent = 'anhängen an'; s.appendChild(o0);
  for (const c of clips) if (c.id !== curId) { const o = document.createElement('option'); o.value = c.id; o.textContent = c.name; s.appendChild(o); }
  s.value = ''; s.hidden = clips.length < 2;
}
function umbenennen() {
  const c = aktuell(); if (!c || rec) return;
  const chip = [...$('chips').children].find(b => b.dataset.id === String(c.id)); if (!chip) return;
  const inp = document.createElement('input');
  inp.className = 'chipname'; inp.value = c.name; inp.autocomplete = 'off'; inp.ariaLabel = 'Name';
  inp.setAttribute('data-1p-ignore', ''); inp.setAttribute('data-lpignore', 'true'); inp.setAttribute('data-bwignore', ''); inp.setAttribute('data-form-type', 'other');
  chip.replaceWith(inp); inp.focus(); inp.select();
  let fertig = false;
  const ok = () => {
    if (fertig) return; fertig = true;
    const n = inp.value.trim();
    if (n && n !== c.name) aendern(() => { clips = clips.map(k => k.id === c.id ? { ...k, name: n } : k); }, null, true); else clipsZeichnen();
  };
  inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') ok(); else if (e.key === 'Escape') { fertig = true; clipsZeichnen(); } });
  inp.addEventListener('blur', ok);
}
function editKnoepfe() {
  const hat = !!aktuell() && !rec, hatSel = hat && !!sel && src.length > 0;
  const st = { undo: undoSt.length > 0 && !rec, redo: redoSt.length > 0 && !rec, trim: hatSel, cut: hatSel, copy: hatSel, paste: hat && !!zwischen, split: hat, fadein: hat, fadeout: hat, norm: hat, zin: hat, zout: hat, luecke: hat };
  for (const k in st) { const b = $('e-' + k); if (b) b.disabled = !st[k]; }
  for (const id of ['c-name', 'c-kopie', 'c-weg']) $(id).disabled = !hat;
}
let toastT = 0;
function toastAus() { clearTimeout(toastT); $('toast').hidden = true; }
function toast(text, aktion, fn) {
  const t = $('toast'); t.textContent = '';
  const s = document.createElement('span'); s.textContent = text; t.appendChild(s);
  const b = document.createElement('button'); b.type = 'button'; b.textContent = aktion; b.title = b.ariaLabel = aktion;
  b.addEventListener('click', () => { toastAus(); fn(); }); t.appendChild(b);
  t.hidden = false; clearTimeout(toastT); toastT = setTimeout(toastAus, 5000);
}

// ----- Speichern (IndexedDB, im Hintergrund; scheitert es: sichtbare Meldung)
let idbP = null, gespeichert = new Map(), speicherT = 0, speicherKette = Promise.resolve();
function idb() {
  if (!idbP) idbP = new Promise((res, rej) => {
    if (!window.indexedDB) return rej(new Error('IndexedDB nicht verfügbar'));
    const q = indexedDB.open('mic', 1);
    q.onupgradeneeded = () => q.result.createObjectStore('k');
    q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
  });
  return idbP;
}
const txRun = (db, modus, fn) => new Promise((res, rej) => {
  const t = db.transaction('k', modus); const r = fn(t.objectStore('k'));
  t.oncomplete = () => res(r); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Speichern abgebrochen'));
});
async function speichernJetzt() {
  const db = await idb(), jetzt = clips, id = curId, nx = nextId;
  const neu = jetzt.filter(c => gespeichert.get(c.id) !== c);
  const weg = [...gespeichert.keys()].filter(k => !jetzt.some(c => c.id === k));
  await txRun(db, 'readwrite', s => {
    for (const c of neu) s.put({ id: c.id, name: c.name, data: c.data, sr: c.sr }, 'c' + c.id);
    for (const k of weg) s.delete('c' + k);
    s.put({ order: jetzt.map(c => c.id), curId: id, nextId: nx }, 'meta');
  });
  gespeichert = new Map(jetzt.map(c => [c.id, c]));
}
function speicherStarten() { speicherKette = speicherKette.then(speichernJetzt).catch(e => fehler(e, 'speichern')); return speicherKette; }
function speichernPlanen() { clearTimeout(speicherT); speicherT = setTimeout(() => { speicherT = 0; speicherStarten(); }, 400); }
function speicherFertig() { if (speicherT) { clearTimeout(speicherT); speicherT = 0; speicherStarten(); } return speicherKette; }
addEventListener('pagehide', () => { if (speicherT) { clearTimeout(speicherT); speicherT = 0; speicherStarten(); } });
async function clipsLaden() {
  try {
    const db = await idb();
    const [meta, alle] = await txRun(db, 'readonly', s => { const a = s.get('meta'), b = s.getAll(); return [a, b]; }).then(([a, b]) => [a.result, b.result]);
    if (!meta) return;
    const byId = new Map(alle.filter(x => x && x.data).map(c => [c.id, c]));
    const geladen = meta.order.map(i => byId.get(i)).filter(Boolean);
    if (!geladen.length || clips.length) return;
    clips = geladen; gespeichert = new Map(geladen.map(c => [c.id, c]));
    curId = byId.has(meta.curId) ? meta.curId : geladen[0].id;
    nextId = Math.max(meta.nextId || 1, ...geladen.map(c => c.id + 1));
    ladeAktuell();
  } catch (e) { fehler(e, 'laden'); }
}

// ---------- Aufnahme ----------
const BLK = 1024;
async function aufnahmeStart() {
  fehlerAus();
  if (wiedergabe) pause();
  const c = ctxHolen();
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { fehler(new Error('getUserMedia nicht verfügbar (https nötig)'), 'mic'); return; }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  } catch (e) { fehler(e, 'mic'); return; }
  try {
    await c.audioWorklet.addModule('/tools/mic-worklet.js');
    const qn = c.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(c, 'mic-aufnehmer', { numberOfOutputs: 1, outputChannelCount: [1] });
    const senke = c.createGain(); senke.gain.value = 0;
    qn.connect(anaIn); qn.connect(node); node.connect(senke); senke.connect(c.destination);
    rec = { stream, qn, node, senke, chunks: [], n: 0, mins: [], maxs: [], cmin: 1, cmax: -1, cn: 0 };
    node.port.onmessage = ev => {
      const d = ev.data; rec.chunks.push(d); rec.n += d.length;
      for (let i = 0; i < d.length; i++) {
        const v = d[i]; if (v < rec.cmin) rec.cmin = v; if (v > rec.cmax) rec.cmax = v;
        if (++rec.cn === BLK) { rec.mins.push(rec.cmin); rec.maxs.push(rec.cmax); rec.cmin = 1; rec.cmax = -1; rec.cn = 0; }
      }
    };
    clearSg();
    knoepfe(); schleife();
  } catch (e) { stream.getTracks().forEach(t => t.stop()); rec = null; fehler(e, 'worklet'); }
}
function aufnahmeStop() {
  if (!rec) return;
  const r = rec; rec = null;
  r.stream.getTracks().forEach(t => t.stop());
  r.node.port.onmessage = null;
  r.qn.disconnect(); r.node.disconnect(); r.senke.disconnect();
  const all = new Float32Array(r.n); let o = 0;
  for (const c of r.chunks) { all.set(c, o); o += c.length; }
  if (all.length) neuerClip(all, ac.sampleRate);
  knoepfe(); zeichneAlles();
}

// ---------- Datei laden ----------
async function dateiLaden(file) {
  fehlerAus();
  try {
    const c = ctxHolen();
    const ab_ = await file.arrayBuffer();
    const b = await c.decodeAudioData(ab_);
    const m = new Float32Array(b.length);
    for (let ch = 0; ch < b.numberOfChannels; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < m.length; i++) m[i] += d[i] / b.numberOfChannels; }
    neuerClip(m, b.sampleRate, file.name.replace(/\.[^.]*$/, '') || undefined);
  } catch (e) { fehler(e, 'laden'); }
}
$('datei').addEventListener('change', async e => { const fls = [...e.target.files]; e.target.value = ''; for (const fl of fls) await dateiLaden(fl); });
stage.addEventListener('dragover', e => e.preventDefault());
stage.addEventListener('drop', async e => { e.preventDefault(); for (const fl of [...e.dataTransfer.files]) await dateiLaden(fl); });

// ---------- WAV ----------
function wavBauen(chs, rate) {
  const n = chs[0].length, nc = chs.length, bytes = n * nc * 2;
  const buf = new ArrayBuffer(44 + bytes), dv = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); dv.setUint32(4, 36 + bytes, true); str(8, 'WAVE'); str(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, nc, true);
  dv.setUint32(24, rate, true); dv.setUint32(28, rate * nc * 2, true); dv.setUint16(32, nc * 2, true); dv.setUint16(34, 16, true);
  str(36, 'data'); dv.setUint32(40, bytes, true);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) {
    const v = Math.max(-1, Math.min(1, chs[c][i])); dv.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2;
  }
  return buf;
}
async function wavExport() {
  try {
    if (renderTimer) { clearTimeout(renderTimer); renderTimer = 0; renderOffen = rendern(); }
    if (renderOffen) await renderOffen;
    const chs = ab === 1 && out ? out.ch : [orig];
    const rate = ab === 1 && out ? out.sr : sr;
    if (!chs[0] || !chs[0].length) throw new Error('nichts aufgenommen');
    const url = URL.createObjectURL(new Blob([wavBauen(chs, rate)], { type: 'audio/wav' }));
    const a = document.createElement('a'); a.href = url; a.download = (aktuell() ? aktuell().name.replace(/[\\/:*?"<>|]+/g, '_') : 'mic') + '.wav';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (e) { fehler(e, 'wav'); }
}

// ---------- Zeichnen ----------
function dim(c) {
  const d = dpr(), w = Math.max(1, Math.round(c.clientWidth * d)), h = Math.max(1, Math.round(c.clientHeight * d));
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; return true; }
  return false;
}
const peakCache = new WeakMap();
function spitzen(x, cols, s0 = 0, s1 = x.length) {
  const k = cols; let e = peakCache.get(x);
  if (e && e.cols === k && e.s0 === s0 && e.s1 === s1) return e;
  const mn = new Float32Array(k), mx = new Float32Array(k), per = (s1 - s0) / k;
  for (let i = 0; i < k; i++) {
    const a = Math.floor(s0 + i * per), b = Math.max(a + 1, Math.floor(s0 + (i + 1) * per));
    let lo = 1, hi = -1; for (let j = a; j < b && j < x.length; j++) { const v = x[j]; if (v < lo) lo = v; if (v > hi) hi = v; }
    const leer = lo > hi;
    mn[i] = leer ? 0 : lo; mx[i] = leer ? 0 : hi;
  }
  e = { cols: k, s0, s1, mn, mx }; peakCache.set(x, e); return e;
}
function welleMalen(c, mn, mx, n) {
  const x = c.getContext('2d'), W = c.width, H = c.height, m = H / 2;
  x.clearRect(0, 0, W, H);
  x.fillStyle = rgb(FG, 0.25); x.fillRect(0, Math.floor(m), W, 1);
  if (!n) return;
  x.fillStyle = rgb(FG, 0.9);
  for (let i = 0; i < W; i++) {
    const j = Math.min(n - 1, Math.floor(i * n / W));
    const y1 = m - mx[j] * m, y2 = m - mn[j] * m;
    x.fillRect(i, y1, 1, Math.max(1, y2 - y1));
  }
}
function linieAn(c, q, a = 1) {
  const x = c.getContext('2d'), p = Math.round(q * c.width);
  x.fillStyle = rgb(FG, a); x.fillRect(p, 0, Math.max(1, Math.round(dpr())), c.height);
}
// game of life spielt den Clip G-mal hintereinander, je Generation einmal: jeder Durchlauf liegt wieder auf demselben Clip.
// Lange Clips: eine Generation dauert D (Anteil am Clip), der Clip läuft dabei weiter im Kreis.
const durchlauf = fr => out && out.leben ? (Math.min(fr / out.haupt, 0.99999) * out.leben.G * (out.leben.D || 1)) % 1 : fr;
function posAufQuelle(fr) {
  if (ab === 1 && out && out.frei != null) return out.frei;
  if (ab === 1) fr = durchlauf(fr);
  const a = sel ? sel.a : 0, b = sel ? sel.b : 1;
  return a + (P.rueck ? 1 - fr : fr) * (b - a);
}
function zeichneWelle() {
  dim(cW);
  const x = cW.getContext('2d'), W = cW.width, H = cW.height;
  if (rec) {
    const n = rec.mins.length, cols = Math.max(1, Math.floor(W / dpr()));
    if (n <= cols) welleMalen(cW, rec.mins, rec.maxs, n);
    else {
      const mn = new Float32Array(cols), mx = new Float32Array(cols), per = n / cols;
      for (let i = 0; i < cols; i++) { let lo = 1, hi = -1; for (let j = Math.floor(i * per); j < Math.floor((i + 1) * per); j++) { lo = Math.min(lo, rec.mins[j]); hi = Math.max(hi, rec.maxs[j]); } mn[i] = lo; mx[i] = hi; }
      welleMalen(cW, mn, mx, cols);
    }
    return;
  }
  const e = spitzen(src, W, view.a * src.length, view.b * src.length);
  welleMalen(cW, e.mn, e.mx, src.length ? W : 0);
  const vx = q => (q - view.a) / (view.b - view.a);
  const klemme = v => Math.max(0, Math.min(W, v));
  if (sel) {
    const xa = vx(sel.a) * W, xb = vx(sel.b) * W;
    x.fillStyle = rgb(BG, 0.65);
    x.fillRect(0, 0, Math.round(klemme(xa)), H);
    x.fillRect(Math.round(klemme(xb)), 0, W, H);
    if (xa >= 0 && xa <= W) linieAn(cW, vx(sel.a), 0.5);
    if (xb >= 0 && xb <= W) linieAn(cW, vx(sel.b), 0.5);
  }
  if (src.length) {
    const q = posAufQuelle(f), p = vx(q);
    if (p >= 0 && p <= 1) linieAn(cW, p, 1);
    // Krebs Kanon: der zweite Abspielkopf läuft gespiegelt, beide treffen sich in der Mitte.
    if (ab === 1 && out && out.krebs && out.frei == null) { const a = sel ? sel.a : 0, b = sel ? sel.b : 1, k = vx(a + b - q); if (k >= 0 && k <= 1) linieAn(cW, k, 1); }
  }
}
function zeichneMod() {
  dim(cM);
  const W = cM.width;
  if (!out || !src.length) { welleMalen(cM, null, null, 0); return; }
  if (ab === 1 && out.bit) { bitsMalen(); return; }
  if (ab === 1 && out.tit) { titMalen(); return; }
  const m = hoerbarCache(), e = spitzen(m.x, W);
  welleMalen(cM, e.mn, e.mx, W);
  linieAn(cM, f, 1);
}

// 1-Bit sichtbar: die Bits um den Abspielpunkt (eine halbe Sekunde), als 1 oben und 0 unten. Die Welle besteht aus ihren Bits.
function bitsMalen() {
  const x = cM.getContext('2d'), W = cM.width, H = cM.height, d = out.ch[0], n = d.length;
  x.clearRect(0, 0, W, H);
  const gr = Math.max(8, Math.floor(H * 0.42));
  x.font = gr + 'px ' + getComputedStyle(stage).fontFamily;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  const bw = Math.max(4, x.measureText('0').width * 1.15), k = Math.max(2, Math.floor(W / bw));
  const schritt = Math.max(1, Math.round(0.5 * out.sr / k)), mitte = Math.floor(f * n) - Math.floor(k / 2) * schritt;
  for (let j = 0; j < k; j++) {
    const i = mitte + j * schritt;
    if (i < 0 || i >= n) continue;
    const eins = d[i] > 0;
    x.fillStyle = rgb(FG, 0.9);
    x.fillText(eins ? '1' : '0', (j + 0.5) * W / k, eins ? H * 0.27 : H * 0.73);
  }
  x.fillStyle = rgb(FG, 0.25); x.fillRect(0, Math.floor(H / 2), W, 1);
  linieAn(cM, (Math.floor(k / 2) + 0.5) / k, 0.6);
}

// Ton im Ton sichtbar: ein Zoom in die Welle, der nie ankommt. Jede Ebene ist der ganze Clip, halb so lang, doppelt so oft;
// nach einer Verdopplung sieht die nächste Ebene aus wie die vorige, darum ist der Zoom eine Schleife. Die Umrisse
// kommen aus derselben Rechnung wie der Ton (tonImTon im Worker). Mitte = Abspielpunkt in jeder Kopie.
const ruhig = matchMedia('(prefers-reduced-motion: reduce)');
let titRaf = 0;
function titMalen() {
  const x = cM.getContext('2d'), W = cM.width, H = cM.height, m = H / 2, eb = out.tit, d = dpr();
  x.clearRect(0, 0, W, H);
  x.fillStyle = rgb(FG, 0.25); x.fillRect(0, Math.floor(m), W, 1);
  const z = ruhig.matches ? 0.35 : (performance.now() / 1600) % 1;
  const p = durchlauf(f), sp = Math.max(1, Math.round(d)), cols = Math.ceil(W / sp);
  for (let j = 0; j < eb.length; j++) {
    const t = j - z;
    if (t <= -1 || t >= 4) continue;
    const a = Math.sin(Math.PI * (t + 1) / 5) ** 2, k = Math.pow(2, t), { mn, mx } = eb[j], B = mn.length;
    let s = 1e-9; for (let i = 0; i < B; i++) s = Math.max(s, mx[i], -mn[i]);
    const amp = 0.9 * m / s;
    x.fillStyle = rgb(FG, 0.9 * a);
    let vor = -1;
    for (let c = 0; c < cols; c++) {
      const u = (c * sp / W - 0.5) * k + p, ph = u - Math.floor(u), b = Math.min(B - 1, Math.floor(ph * B));
      const y1 = m - mx[b] * amp, y2 = m - mn[b] * amp;
      x.fillRect(c * sp, y1, sp, Math.max(1, y2 - y1));
      const kachel = Math.floor(u);
      if (vor !== -1 && kachel !== vor) { x.fillStyle = rgb(FG, 0.18 * a); x.fillRect(c * sp, 0, 1, H); x.fillStyle = rgb(FG, 0.9 * a); }
      vor = kachel;
    }
  }
  linieAn(cM, 0.5, 0.5);
  if (!titRaf && !wiedergabe && !ruhig.matches) titRaf = requestAnimationFrame(() => { titRaf = 0; if (!wiedergabe && !rec && ab === 1 && out && out.tit && !out.bit) zeichneMod(); });
}

// Was unter dem Finger liegt: im Zoom die Stelle der deutlichsten Ebene, sonst einfach der Anteil.
function modSprung(q) {
  if (!(ab === 1 && out && out.tit && !out.bit)) return q;
  const z = ruhig.matches ? 0.35 : (performance.now() / 1600) % 1;
  let t = 0, best = -1;
  for (let j = 0; j < out.tit.length; j++) { const u = j - z; if (u <= -1 || u >= 4) continue; const a = Math.sin(Math.PI * (u + 1) / 5) ** 2; if (a > best) { best = a; t = u; } }
  const u = (q - 0.5) * Math.pow(2, t) + durchlauf(f), ph = u - Math.floor(u);
  return out.leben ? lebenSprung(ph) : ph;
}

// Spektrogramm
const SF0 = 30, SF1 = 16000, DBLO = -100, DBHI = -20;
let rowBin = null, rowBinH = 0, rowBinRate = 0;
function zeilenTabelle(H, rate) {
  if (rowBin && rowBinH === H && rowBinRate === rate) return rowBin;
  rowBin = new Float32Array(H); rowBinH = H; rowBinRate = rate;
  const hi = Math.min(SF1, rate / 2);
  for (let y = 0; y < H; y++) rowBin[y] = SF0 * Math.pow(hi / SF0, (H - 1 - y) / Math.max(1, H - 1)) * NF / rate;
  return rowBin;
}
function spalteMalen(img, col, db, rate) {
  const H = img.height, tab = zeilenTabelle(H, rate), d = img.data, W = img.width;
  for (let y = 0; y < H; y++) {
    const b = tab[y], i0 = Math.floor(b), fr = b - i0;
    const v = db[Math.min(db.length - 1, i0)] * (1 - fr) + db[Math.min(db.length - 1, i0 + 1)] * fr;
    const t = Math.max(0, Math.min(1, (v - DBLO) / (DBHI - DBLO)));
    const o = (y * W + col) * 4;
    d[o] = BG[0] + (FG[0] - BG[0]) * t; d[o + 1] = BG[1] + (FG[1] - BG[1]) * t; d[o + 2] = BG[2] + (FG[2] - BG[2]) * t; d[o + 3] = 255;
  }
}
let sgBild = null, sgKey = '';
function clearSg() {
  dim(cS);
  const x = cS.getContext('2d'); x.fillStyle = rgb(BG); x.fillRect(0, 0, cS.width, cS.height);
}
function sgStatisch() {
  dim(cS);
  const W = cS.width, H = cS.height, h = hoerbarCache();
  if (ab === 1 && out && out.leben && h.x.length) { lebenMalen(W, H, h); malSpurMalen(); return; }
  const key = [W, H, ab, hoerVer, h.x.length, h.rate, out ? out.ch[0].length : 0, src.length, sel ? sel.a + ',' + sel.b : '', JSON.stringify(P)].join('|');
  if (key !== sgKey) {
    sgKey = key;
    const img = new ImageData(W, H), db = new Float32Array(NF / 2);
    if (!h.x.length) { for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255; for (let i = 0; i < img.data.length; i += 4) { img.data[i] = BG[0]; img.data[i + 1] = BG[1]; img.data[i + 2] = BG[2]; } }
    else for (let col = 0; col < W; col++) {
      const s = Math.floor(col / W * h.x.length - NF / 2);
      spalteMalen(img, col, spektrumAb(h.x, s, db), h.rate);
    }
    sgBild = img;
  }
  cS.getContext('2d').putImageData(sgBild, 0, 0);
  if (h.x.length) linieAn(cS, f, 0.9);
  malSpurMalen();
}

// game of life sichtbar: das Spektrogramm einer Generation, darüber ihre Zellen. Der Abspielpunkt wischt die neue
// Generation über die alte; geboren hell, überlebt halb, gestorben ein Schatten. Man sieht, was man hört.
// Jede Spalte zeigt den Clip an der Stelle, an der sie zuletzt erklungen ist: bei kurzen Clips ist das die Wischblende
// von Generation zu Generation, bei langen wandert die Blende mit dem Clip, der unter den Generationen weiterläuft.
let lebenBild = null;
const lebenStand = () => { const { G, D = 1 } = out.leben; return Math.min(f / out.haupt, 0.99999) * G * D; };
function lebenZeit(cp, P) { const t = cp + Math.floor(P - cp); return t < 0 ? cp : t; }
function lebenMalen(W, H, h) {
  const x = cS.getContext('2d'), { welten, G, C, R, D = 1 } = out.leben, CR = C * R, P = lebenStand();
  const K = Math.min(W, 240), n = h.x.length, key = hoerVer + '|' + H + '|' + K;
  if (!lebenBild || lebenBild.key !== key) {
    const c = document.createElement('canvas'); c.width = K; c.height = H;
    lebenBild = { key, c, img: new ImageData(K, H), t: new Float64Array(K).fill(-1), db: new Float32Array(NF / 2) };
  }
  let neu = false;
  for (let col = 0; col < K; col++) {
    const t = lebenZeit((col + 0.5) / K, P);
    if (t === lebenBild.t[col]) continue;
    lebenBild.t[col] = t; neu = true;
    const s0 = Math.floor(Math.min(1, t / (G * D)) * out.haupt * n - NF / 2);
    spalteMalen(lebenBild.img, col, spektrumAb(h.x, s0, lebenBild.db), h.rate);
  }
  if (neu) lebenBild.c.getContext('2d').putImageData(lebenBild.img, 0, 0);
  x.fillStyle = rgb(BG); x.fillRect(0, 0, W, H);
  x.globalAlpha = 0.5; x.imageSmoothingEnabled = true;
  x.drawImage(lebenBild.c, 0, 0, W, H);
  x.globalAlpha = 1;
  const zelle = (gg, c, r) => gg >= 0 ? welten[gg * CR + c * R + r] : 0;
  for (let c = 0; c < C; c++) {
    const cp = (c + 0.5) / C, t = cp + Math.floor(P - cp);
    const jetzt = Math.min(G - 1, Math.floor((t < 0 ? cp : t) / D)), vorher = t < 0 ? -1 : jetzt - 1;
    const x0 = Math.round(c / C * W), x1 = Math.round((c + 1) / C * W);
    for (let r = 0; r < R; r++) {
      const da = zelle(jetzt, c, r), war = zelle(vorher, c, r);
      if (!da && !war) continue;
      const a = da ? (war ? 0.5 : 0.9) : 0.15;
      const y0 = Math.round((1 - (r + 1) / R) * (H - 1)), y1 = Math.round((1 - r / R) * (H - 1));
      x.fillStyle = rgb(FG, a); x.fillRect(x0 + 1, y0 + 1, Math.max(1, x1 - x0 - 1), Math.max(1, y1 - y0 - 1));
    }
  }
  linieAn(cS, P - Math.floor(P), 0.9);
}
// Klick ins Spektrogramm während game of life: an die Stelle q des Clips in der laufenden Generation.
function lebenSprung(q) {
  const { G, D = 1 } = out.leben, s = Math.floor(lebenStand() / D) * D;
  let t = s + (q - s - Math.floor(q - s));
  if (t >= G * D) t = Math.max(0, t - 1);   // der Clip kommt nicht mehr dorthin: die Stelle davor
  t = Math.min(G * D * 0.99999, t);
  return t / (G * D) * out.haupt;
}

// malen: Striche ins Spektrogramm werden Sinustöne im Clip (Worker-op 'malen'), als Bearbeitung mit Rückgängig.
// Ein Strich bleibt sichtbar, bis das Spektrogramm ihn selbst zeigt. Ein eigener Worker je Auftrag, damit Rendern ihn nicht verwirft.
let malAn = false, malStriche = [], malZug = null, malKette = Promise.resolve();
function sgZuQuelle(q) {
  if (ab === 1 && out && out.leben) { const a = sel ? sel.a : 0, b = sel ? sel.b : 1; return a + (P.rueck ? 1 - q : q) * (b - a); }
  if (ab === 1 && out) return posAufQuelle(q);
  return sel ? sel.a + q * (sel.b - sel.a) : q;
}
function malSpurMalen() {
  if (!malStriche.length) return;
  const x = cS.getContext('2d'), W = cS.width, H = cS.height;
  x.strokeStyle = rgb(FG, 0.95); x.lineWidth = Math.max(2, 2 * dpr()); x.lineCap = x.lineJoin = 'round';
  for (const s of malStriche) {
    const p = s.bild; if (!p.length) continue;
    x.beginPath();
    x.moveTo(p[0] * W, p[1] * H);
    for (let i = 2; i < p.length; i += 2) x.lineTo(p[i] * W, p[i + 1] * H);
    if (p.length === 2) x.lineTo(p[0] * W + 0.5, p[1] * H);
    x.stroke();
  }
}
function malSpurAbgeholt(my) { if (malStriche.some(s => s.T != null && my > s.T)) malStriche = malStriche.filter(s => s.T == null || my <= s.T); }
function wackeln(el) { el.classList.remove('wackel'); void el.offsetWidth; el.classList.add('wackel'); }
function malPunkt(e) {
  const r = cS.getBoundingClientRect(), qx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), qy = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
  malZug.bild.push(qx, qy); malZug.ton.push(sgZuQuelle(qx), 1 - qy);
}
function malStart(e) {
  if (rec || !aktuell()) { wackeln(cS); return; }
  cS.setPointerCapture(e.pointerId);
  malZug = { bild: [], ton: [], id: curId, T: null };
  malStriche.push(malZug); malPunkt(e); sgStatisch();
}
function malZiehen(e) { if (!malZug) return; for (const k of (e.getCoalescedEvents ? e.getCoalescedEvents() : [e])) malPunkt(k); sgStatisch(); }
function malEnde() {
  if (!malZug) return;
  const s = malZug; malZug = null;
  malKette = malKette.then(() => malEinarbeiten(s)).catch(e => { malStriche = malStriche.filter(k => k !== s); sgStatisch(); fehler(e, 'malen'); });
}
async function malEinarbeiten(s) {
  for (;;) {
    const c = clips.find(k => k.id === s.id);
    if (!c) { malStriche = malStriche.filter(k => k !== s); wackeln(cS); sgStatisch(); return; }
    const y = await new Promise((res, rej) => {
      const w = new Worker('/tools/mic-worker.js');
      w.onmessage = ev => { w.terminate(); res(ev.data.y); };
      w.onerror = e => { w.terminate(); rej(new Error(e.message || 'worker')); };
      w.postMessage({ op: 'malen', x: c.data, rate: c.sr, striche: [s.ton] });
    });
    const jetzt = clips.find(k => k.id === s.id);
    if (jetzt && jetzt.data !== c.data) continue;
    if (!jetzt) continue;
    const lief = !!wiedergabe, f0 = lief ? posF() : f, s0 = sel;
    aendern(() => { clips = clips.map(k => k.id === s.id ? { ...k, data: y } : k); }, null, s.id !== curId);
    if (s.id === curId) { sel = s0; f = f0; planen(); if (lief) abspielen(f); else zeichneAlles(); editKnoepfe(); }
    s.T = renderToken;
    if (s.id !== curId) malStriche = malStriche.filter(k => k !== s);
    return;
  }
}
const dbLive = new Float32Array(1024);
function sgLive() {
  const x = cS.getContext('2d'), W = cS.width, H = cS.height, cw = Math.max(1, Math.round(dpr()));
  anaIn.getFloatFrequencyData(dbLive);
  x.drawImage(cS, -cw, 0);
  const img = new ImageData(cw, H);
  for (let k = 0; k < cw; k++) spalteMalen(img, k, dbLive, ac.sampleRate);
  x.putImageData(img, W - cw, 0);
}

// Spektrum
const dbA = new Float32Array(NF / 2);
function spektrumMalen(db, rate) {
  dim(cP);
  const x = cP.getContext('2d'), W = cP.width, H = cP.height;
  x.clearRect(0, 0, W, H);
  if (!db) return;
  const hi = Math.min(SF1, rate / 2), l0 = Math.log(SF0), l1 = Math.log(hi);
  x.strokeStyle = rgb(FG, 0.9); x.lineWidth = dpr(); x.beginPath();
  for (let px = 0; px < W; px++) {
    const fq = Math.exp(l0 + (l1 - l0) * px / Math.max(1, W - 1)), b = fq * NF / rate;
    const i0 = Math.floor(b), fr = b - i0;
    const v = db[Math.min(db.length - 1, i0)] * (1 - fr) + db[Math.min(db.length - 1, i0 + 1)] * fr;
    const t = Math.max(0, Math.min(1, (v - DBLO) / (DBHI - DBLO)));
    const y = H - 1 - t * (H - 2);
    px ? x.lineTo(px, y) : x.moveTo(px, y);
  }
  x.stroke();
  const pk = spitze(db, rate);
  if (pk > SF0 && pk < hi) {
    const px = (Math.log(pk) - l0) / (l1 - l0) * W;
    x.fillStyle = rgb(FG, 0.35); x.fillRect(Math.round(px), 0, Math.max(1, Math.round(dpr())), H);
  }
}

// Analyse für ruhenden Zustand
function zeichneAnalyse() {
  const h = hoerbarCache();
  sgStatisch();
  zeichneMod();
  if (h.x.length) {
    const acc = new Float32Array(NF / 2), tmp = new Float32Array(NF / 2), n = 12;
    for (let i = 0; i < n; i++) { spektrumAb(h.x, Math.floor((i + 0.5) / n * h.x.length - NF / 2), tmp); for (let k = 0; k < acc.length; k++) acc[k] += Math.pow(10, tmp[k] / 10) / n; }
    for (let k = 0; k < acc.length; k++) acc[k] = 10 * Math.log10(acc[k] + 1e-18);
    spektrumMalen(acc, h.rate);
  } else spektrumMalen(null, sr);
  lesungRuhe();
}
function mm(s) { const m = Math.floor(s / 60); return m + ':' + (s - m * 60).toFixed(1).padStart(4, '0'); }
function lesungSetzen(hz, pk, t) {
  lesung.textContent = [hz > 0 ? notenText(hz) + '  ' + hz.toFixed(1) + ' Hz' : '', pk > 0 ? '^ ' + pk.toFixed(0) + ' Hz' : '', t != null ? mm(t) : ''].filter(Boolean).join('   ');
}
function lesungRuhe() {
  const h = hoerbarCache();
  if (!h.x.length) { lesung.textContent = ''; return; }
  const hs = [];
  for (let i = 0; i < 9; i++) { const v = yin(h.x, Math.floor((i + 0.5) / 9 * h.x.length - 512), h.rate); if (v > 0) hs.push(v); }
  hs.sort((a, b) => a - b);
  const pk = spitze(spektrumAb(h.x, Math.floor(f * h.x.length - NF / 2), dbA), h.rate);
  lesungSetzen(hs.length ? hs[hs.length >> 1] : 0, pk, f * h.x.length / h.rate);
}

function zeichneAlles() {
  zeichneWelle();
  if (rec) return;
  zeichneAnalyse();
}

// ---------- Schleife (live) ----------
function schleife() {
  if (rafId) return;
  const tick = () => {
    rafId = 0;
    if (rec) {
      if (dim(cS)) clearSg();
      zeichneWelle(); sgLive();
      anaIn.getFloatFrequencyData(dbLive); spektrumMalen(dbLive, ac.sampleRate);
      const tail = rec.chunks.length ? rec.chunks[rec.chunks.length - 1] : null;
      let hz = 0;
      if (tail && rec.n >= 2048) {
        const win = new Float32Array(2048); let o = 2048;
        for (let i = rec.chunks.length - 1; i >= 0 && o > 0; i--) { const c = rec.chunks[i], n = Math.min(o, c.length); win.set(c.subarray(c.length - n), o - n); o -= n; }
        hz = yin(win, 0, ac.sampleRate);
      }
      lesungSetzen(hz, spitze(dbLive, ac.sampleRate), rec.n / ac.sampleRate);
      rafId = requestAnimationFrame(tick);
    } else if (wiedergabe) {
      f = posF();
      { const sp = view.b - view.a, p = posAufQuelle(f);
        if (sp < 0.9999 && src.length && (p < view.a || p > view.b)) { const a0 = Math.max(0, Math.min(1 - sp, p - sp * 0.1)); view = { a: a0, b: a0 + sp }; scrollZeichnen(); } }
      zeichneWelle(); sgStatisch(); zeichneMod();
      anaOut.getFloatFrequencyData(dbLive); spektrumMalen(dbLive, ac.sampleRate);
      const h = hoerbarCache();
      lesungSetzen(yin(h.x, Math.floor(f * h.x.length), h.rate), spitze(dbLive, ac.sampleRate), f * wiedergabe.dur);
      rafId = requestAnimationFrame(tick);
    }
  };
  rafId = requestAnimationFrame(tick);
}

// ---------- Knöpfe ----------
function knoepfe() {
  $('recpunkt').setAttribute('d', rec ? 'M13 13 H27 V27 H13 Z' : 'M12 20 A8 8 0 1 0 28 20 A8 8 0 1 0 12 20 Z');
  $('rec').title = $('rec').ariaLabel = rec ? 'stopp' : 'aufnehmen';
  $('playform').setAttribute('d', wiedergabe ? 'M14 12 H18 V28 H14 Z M22 12 H26 V28 H22 Z' : 'M16 12 L28 20 L16 28 Z');
  $('loop').classList.toggle('an', schleifeAn); $('loop').setAttribute('aria-pressed', String(schleifeAn));
  $('play').title = $('play').ariaLabel = wiedergabe ? 'pause' : 'abspielen';
  $('ab0').classList.toggle('an', ab === 0);
  $('ab1').classList.toggle('an', ab === 1);
}
$('rec').addEventListener('click', () => { rec ? aufnahmeStop() : aufnahmeStart(); });
$('play').addEventListener('click', () => {
  if (rec) return;
  if (wiedergabe) return pause();
  try { abspielen(f >= 0.999 ? 0 : f); } catch (e) { fehler(e, 'play'); }
});
$('loop').addEventListener('click', () => {
  schleifeAn = !schleifeAn; knoepfe();
  if (wiedergabe) { f = posF(); wiedergabe.quelle.loop = endlos(); wiedergabe.t0 = ac.currentTime - f * wiedergabe.dur; }
});
function abSetzen(v) {
  if (ab === v) return; ab = v; knoepfe();
  if (wiedergabe) abspielen(f); else zeichneAlles();
}
$('ab0').addEventListener('click', () => abSetzen(0));
$('ab1').addEventListener('click', () => abSetzen(1));

// ---------- Zeiger ----------
function anteil(c, e) { const r = c.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); }
(() => {
  let x0 = null, bewegt = false, pinch = null;
  const ptr = new Map();
  const spanV = () => view.b - view.a;
  const qAnteil = e => view.a + anteil(cW, e) * spanV();
  const mitteX = () => { const [p, q] = [...ptr.values()], r = cW.getBoundingClientRect(); return { d: Math.abs(p - q) || 1, m: ((p + q) / 2 - r.left) / r.width }; };
  cW.addEventListener('pointerdown', e => {
    if (rec || !src.length) return;
    cW.setPointerCapture(e.pointerId); ptr.set(e.pointerId, e.clientX);
    if (ptr.size === 2) { x0 = null; const m = mitteX(); pinch = { d: m.d, v: { ...view }, anker: view.a + m.m * spanV() }; return; }
    x0 = qAnteil(e); bewegt = false;
  });
  cW.addEventListener('pointermove', e => {
    if (!ptr.has(e.pointerId)) return;
    ptr.set(e.pointerId, e.clientX);
    if (pinch && ptr.size >= 2) {
      const m = mitteX(), neu = (pinch.v.b - pinch.v.a) * pinch.d / m.d;
      setView(pinch.anker - m.m * neu, pinch.anker - m.m * neu + neu);
      return;
    }
    if (x0 == null) return;
    const q = qAnteil(e);
    if (!bewegt && Math.abs(q - x0) / spanV() * cW.clientWidth < 4) return;
    bewegt = true; sel = { a: Math.min(x0, q), b: Math.max(x0, q) }; zeichneWelle(); editKnoepfe();
  });
  const hoch = e => {
    const war = ptr.delete(e.pointerId);
    if (!war) return;
    if (pinch) { if (ptr.size < 2) pinch = null; x0 = null; return; }
    if (x0 == null) return;
    const q = qAnteil(e);
    if (e.type === 'pointercancel') { x0 = null; return; }
    if (bewegt) { if (sel.b - sel.a < 1e-4) sel = null; planen(); stopQuelle(); knoepfe(); f = 0; zeichneAlles(); }
    else { const had = !!sel; sel = null; if (had) { planen(); stopQuelle(); knoepfe(); } f = P.rueck ? 1 - q : q; if (P.frei) { freiPos = q; planen(); } if (had) zeichneAlles(); else spulen(f); }
    x0 = null;
  };
  cW.addEventListener('pointerup', hoch);
  cW.addEventListener('pointercancel', hoch);
  cW.addEventListener('wheel', e => {
    if (!src.length || rec) return;
    e.preventDefault();
    const r = cW.getBoundingClientRect(), m = (e.clientX - r.left) / r.width, sp = spanV();
    if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) { const d = (e.deltaX || e.deltaY) / r.width * sp; setView(view.a + d, view.b + d); return; }
    const neu = sp * Math.exp(e.deltaY * 0.002), anker = view.a + m * sp;
    setView(anker - m * neu, anker - m * neu + neu);
  }, { passive: false });
  cM.addEventListener('pointerdown', e => { if (!rec && src.length) spulen(modSprung(anteil(cM, e))); });
  cS.addEventListener('pointerdown', e => {
    if (malAn) { malStart(e); return; }
    if (rec || !src.length) return;
    const q = anteil(cS, e);
    if (ab === 1 && out && out.leben) spulen(lebenSprung(q));
    else spulen(q);
  });
  cS.addEventListener('pointermove', e => { if (malZug) malZiehen(e); });
  for (const t of ['pointerup', 'pointercancel']) cS.addEventListener(t, malEnde);
})();

// ---------- Panel ----------
const panel = Controls.createPanel({ position: 'left', mobileInitialOpenMode: 'peek' });
const neuPlanen = () => { planen(); resetsAbgleichen(); };

// Reglerwege: Position 0..1000 <-> Wert. Wahrnehmungsnah (log) wo der Wert ein Faktor ist, Rastpunkt (Detent) auf dem neutralen Wert.
const WEG = 1000, RAST = 0.025;
let fein = false;                       // Feinmodus: ganze Halbtöne aus, Nachkommastellen an
const fmt = (v, d) => String(Number(v.toFixed(d)));
function logWeg(min, max, neutral, dec, nudgeFaktor) {
  const l = Math.log(max / min), np = neutral == null ? null : Math.log(neutral / min) / l * WEG;
  return {
    toSliderValue: v => v <= min ? 0 : Math.min(WEG, Math.log(v / min) / l * WEG),
    fromSliderValue: p => {
      if (np != null && Math.abs(p - np) <= RAST * WEG) return neutral;
      return min * Math.exp(Math.max(0, Math.min(WEG, p)) / WEG * l);
    },
    nudge: (v, dir) => {
      const n = Math.max(v, min) * Math.pow(nudgeFaktor, dir);
      return Number(n.toFixed(dec));
    },
  };
}
const WEGE = {
  tempo: { ...logWeg(0.05, 8, 1, 2, 1.01), formatDisplayValue: v => fmt(v * 100, 0) + ' %',
    parseDisplayValue: s => parseFloat(String(s).replace(',', '.')) / 100,
    nudge: (v, dir) => Math.max(0, Number((v + dir * 0.01).toFixed(2))) },
  st: {
    toSliderValue: v => v,
    fromSliderValue: p => fein ? Math.round(p * 10) / 10 : Math.round(p),
    nudge: (v, dir) => Math.round(v + dir),
    formatDisplayValue: v => (v > 0 ? '+' : '') + fmt(v, 1),
    parseDisplayValue: s => parseFloat(String(s).replace(',', '.')),
  },
  pegel: {
    toSliderValue: v => v,
    fromSliderValue: p => Math.abs(p - 1) <= RAST * 4 ? 1 : p,
    nudge: (v, dir) => Math.max(0, Number((v + dir * 0.05).toFixed(2))),
  },
  fhz: logWeg(20, 24000, null, 0, Math.pow(2, 1 / 12)),
  fq: logWeg(0.1, 30, 1, 2, Math.pow(2, 1 / 6)),
  echoS: logWeg(0.001, 2, null, 3, Math.pow(2, 1 / 6)),
  hallS: logWeg(0.1, 10, null, 2, Math.pow(2, 1 / 6)),
};
const logKeys = new Set(['tempo', 'fhz', 'fq', 'echoS', 'hallS']);
const sl = (key, label, min, max, step, value, dec, fn) => {
  const w = WEGE[key];
  const cfg = { label, min, max, step, value, decimals: dec, onChange: v => { fn(v); neuPlanen(); } };
  if (w) {
    cfg.transform = w;
    if (logKeys.has(key)) { cfg.min = 0; cfg.max = WEG; cfg.step = 1; }
    if (key === 'st') cfg.step = 0.01;
  }
  return panel.addSlider(key, cfg);
};
panel
  .addButtonGroup('dateien', { buttons: [
    { key: 'laden', label: 'laden', onClick: () => $('datei').click() },
    { key: 'wav', label: 'wav', onClick: wavExport },
  ] })
  .addButtonGroup('schnitt', { buttons: [
    { key: 'trim', label: 'trim', onClick: () => E.trim() },
    { key: 'zurueck', label: 'zurück', onClick: () => zurueck() },
  ] })
  .addDivider();
sl('tempo', 'Tempo', 0.05, 8, 0.01, P.tempo, 2, v => { P.tempo = v; });
sl('st', 'Tonhöhe st', -48, 48, 0.1, P.st, 1, v => { P.st = v; });
panel.addToggle('rueck', { label: 'rückwärts', value: P.rueck, onChange: v => { P.rueck = v; f = 0; stopQuelle(); knoepfe(); neuPlanen(); } });
sl('pegel', 'Pegel', 0, 4, 0.01, P.pegel, 2, v => { P.pegel = v; });
panel.addDivider()
  .addSelect('filter', { label: 'Filter', value: P.filter, options: [
      { value: 'aus', label: 'aus' }, { value: 'low', label: 'low' }, { value: 'high', label: 'high' }, { value: 'band', label: 'band' }],
    onChange: v => { P.filter = v; neuPlanen(); } });
sl('fhz', 'Hz', 0, 24000, 1, P.fhz, 0, v => { P.fhz = v; });
sl('fq', 'Güte', 0.1, 30, 0.1, P.fq, 2, v => { P.fq = v; });
panel.addDivider();
sl('echoS', 'Echo s', 0.001, 2, 0.001, P.echoS, 3, v => { P.echoS = v; });
sl('echoFb', 'Echo fb', 0, 0.95, 0.01, P.echoFb, 2, v => { P.echoFb = v; });
sl('echoMix', 'Echo mix', 0, 1, 0.01, P.echoMix, 2, v => { P.echoMix = v; });
panel.addDivider();
sl('hallMix', 'Hall mix', 0, 1, 0.01, P.hallMix, 2, v => { P.hallMix = v; });
sl('hallS', 'Hall s', 0.1, 10, 0.1, P.hallS, 2, v => { P.hallS = v; });
panel.addDivider();
sl('verz', 'Verzerrung', 0, 1, 0.01, P.verz, 2, v => { P.verz = v; });
panel.addDivider()
  .addToggle('tit', { label: 'Ton im Ton', value: P.tit, onChange: v => { P.tit = v; neuPlanen(); } })
  .addToggle('bit', { label: '1-Bit', value: P.bit, onChange: v => { P.bit = v; neuPlanen(); } })
  .addSelect('steig', { label: 'endlos steigend', value: P.steig, options: [
      { value: 'aus', label: 'aus' }, { value: 'ton', label: 'Tonhöhe' }, { value: 'tempo', label: 'Tempo' }],
    onChange: v => { P.steig = v; neuPlanen(); } })
  .addToggle('leben', { label: 'game of life', value: P.leben, onChange: v => { P.leben = v; neuPlanen(); } })
  .addToggle('malen', { label: 'malen', value: false, onChange: v => { malAn = v; cS.classList.toggle('malt', v); } })
  .addToggle('krebs', { label: 'Krebs Kanon', value: P.krebs, onChange: v => { P.krebs = v; neuPlanen(); } })
  .addToggle('rekursiv', { label: 'rekursiv echo', value: P.rekursiv, onChange: v => { P.rekursiv = v; neuPlanen(); } })
  .addToggle('frei', { label: 'Moment einfrieren', value: P.frei, onChange: v => { if (v && !P.frei) freiPos = posAufQuelle(f); P.frei = v; neuPlanen(); } });

// Ziehen: eigener Zeiger statt nativem Range. Weiter weg vom Regler (senkrecht) = feiner (1, 1/4, 1/16 der Strecke),
// und Tonhöhe rastet auf ganze Halbtöne, solange der Finger nah dran bleibt.
for (const range of panel.el.querySelectorAll('.ctrl-range')) {
  const key = range.closest('.ctrl-row').dataset.key;
  let drag = null;
  const spanVon = () => ({ min: Number(range.min), max: Number(range.max) });
  const setzen = pos => { range.value = String(pos); range.dispatchEvent(new Event('input', { bubbles: true })); };
  const abs = e => { const r = range.getBoundingClientRect(), s = spanVon(); return s.min + Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * (s.max - s.min); };
  range.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    e.preventDefault(); range.setPointerCapture(e.pointerId);
    const r = range.getBoundingClientRect();
    drag = { x: e.clientX, y0: r.top + r.height / 2, pos: abs(e), faktor: 1 };
    fein = false; setzen(drag.pos);
  });
  range.addEventListener('pointermove', e => {
    if (!drag) return;
    const dy = Math.abs(e.clientY - drag.y0);
    const faktor = dy > 140 ? 1 / 16 : dy > 60 ? 1 / 4 : 1;
    if (faktor !== drag.faktor) { drag.x = e.clientX; drag.pos = Number(range.value); drag.faktor = faktor; }
    fein = key === 'st' && faktor < 1;
    const r = range.getBoundingClientRect(), s = spanVon();
    const pos = Math.min(s.max, Math.max(s.min, drag.pos + (e.clientX - drag.x) / r.width * (s.max - s.min) * faktor));
    setzen(pos);
  });
  const ende = () => { drag = null; fein = false; };
  range.addEventListener('pointerup', ende);
  range.addEventListener('pointercancel', ende);
  for (const t of ['mousedown', 'touchstart']) range.addEventListener(t, e => e.preventDefault(), { passive: false });
}

// Zurücksetzen je Feld: Knopf nur sichtbar (und bedienbar), wenn der Wert vom Standard abweicht.
const RESET_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12a7 7 0 1 0 2.2-5.1M4.5 4v4.5H9"/></svg>';
const resetKnoepfe = [];
for (const row of panel.el.querySelectorAll('.ctrl-row[data-key]')) {
  const key = row.dataset.key;
  if (!(key in P)) continue;
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'mic-reset'; b.innerHTML = RESET_SVG;
  b.title = b.ariaLabel = 'zurücksetzen';
  b.addEventListener('click', () => {
    const d = panel.defaultOf(key);
    panel.set(key, d); panel.params[key] = d;
    if (panel.callbacks[key]) panel.callbacks[key](d, key);
  });
  const grp = row.querySelector('.ctrl-slider-group');
  const trig = grp && grp.querySelector('.ctrl-config-trigger');
  if (grp) grp.insertBefore(b, trig || null); else row.appendChild(b);
  resetKnoepfe.push([key, b]);
}
function resetsAbgleichen() {
  for (const [key, b] of resetKnoepfe) {
    const d = panel.defaultOf(key), v = panel.params[key];
    const gleich = typeof v === 'number' ? Math.abs(v - d) < 1e-9 : v === d;
    b.classList.toggle('sichtbar', !gleich);
  }
}
resetsAbgleichen();
panel.el.addEventListener('pointerdown', () => { try { ctxHolen(); } catch (e) { fehler(e, 'ctx'); } });

// ---------- Layout ----------
function raumFuerPanel() {
  const r = panel.el.getBoundingClientRect();
  if (innerWidth <= 768) {
    stage.style.paddingLeft = '';
    stage.style.height = Math.max(0, r.top - stage.getBoundingClientRect().top) + 'px';
  } else {
    stage.style.height = '';
    stage.style.paddingLeft = (r.left < 1 && innerWidth - r.right >= 480) ? r.right + 'px' : '';
  }
}
function layout() { raumFuerPanel(); sgKey = ''; zeichneAlles(); if (rec) clearSg(); }
addEventListener('resize', layout);
stage.addEventListener('ctrl-panel-layout-change', layout);
document.addEventListener('ctrl-panel-layout-change', layout);

BG = grau('--bg-color'); FG = grau('--text-color');
// ---------- Tastatur ----------
stage.addEventListener('click', e => { const b = e.target.closest && e.target.closest('button'); if (b) b.blur(); });
document.addEventListener('keydown', e => {
  const t = e.target, tn = t && t.tagName;
  if (tn === 'INPUT' || tn === 'TEXTAREA' || tn === 'SELECT' || (t && t.isContentEditable)) return;
  const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? vor() : zurueck(); return; }
  if (mod && k === 'y') { e.preventDefault(); vor(); return; }
  if (mod && k === 'c') { if (sel) { e.preventDefault(); E.kopieren(); } return; }
  if (mod && k === 'x') { if (sel) { e.preventDefault(); E.schneiden(); } return; }
  if (mod && k === 'v') { if (zwischen) { e.preventDefault(); E.einfuegen(); } return; }
  if (mod || e.altKey) return;
  if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); if (!e.repeat) $('play').click(); return; }
  if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); E.entfernen(); }
});

werkzeugBauen();
clipsLaden();

knoepfe();
requestAnimationFrame(layout);

window.__mic = { planen, E, get malAn() { return malAn; }, get malStriche() { return malStriche; },
  malen: (ton, bild) => { const z = { bild: bild || [], ton, id: curId, T: null }; malStriche.push(z); return (malKette = malKette.then(() => malEinarbeiten(z))); },
  get f() { return f; }, zurueck, vor, setView, speicherFertig, get view() { return view; }, get clips() { return clips; }, get curId() { return curId; }, get zwischen() { return zwischen; }, get out() { return out; }, get src() { return src; }, get P() { return P; }, get freiPos() { return freiPos; }, set freiPos(v) { freiPos = v; planen(); }, get sel() { return sel; }, set sel(v) { sel = v; zeichneAlles(); editKnoepfe(); }, set f(v) { f = v; zeichneAlles(); }, renderFertig: async () => { if (renderTimer) { clearTimeout(renderTimer); renderTimer = 0; renderOffen = rendern(); } if (renderOffen) await renderOffen; } };

})();
