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
};
let src = new Float32Array(0);      // Quelle mono
let sr = 44100;
let sel = null;                     // {a,b} Anteile von src
let orig = new Float32Array(0);     // Region unverändert
let out = null;                     // {ch:[Float32Array], sr}
let ab = 0;                         // 0 original, 1 verändert
let f = 0;                          // Abspielposition 0..1 im hörbaren Puffer
const undo = [];

let ac = null, anaIn = null, anaOut = null;
let rec = null;                     // {stream, node, chunks, n, mins, maxs, cur, curN}
let wiedergabe = null;              // {quelle, t0, dur}
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

// WSOLA: Dehnung um Faktor s ohne Tonhöhenänderung
function wsola(x, rate, s) {
  const N = 2 * Math.round(0.02 * rate), Hs = N / 2, Ha = Hs / s, tol = Math.round(0.01 * rate);
  const frames = Math.ceil(x.length * s / Hs) + 1;
  const pad = N + tol + 2;
  const xp = new Float32Array(x.length + 2 * pad + N * 2);
  xp.set(x, pad);
  const y = new Float32Array(frames * Hs + N);
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  const cs = x.length > rate * 20 ? 8 : 4;
  let prev = pad;
  for (let k = 0; k < frames; k++) {
    const nominal = pad + Math.round(k * Ha);
    let best = nominal;
    if (k > 0) {
      const ref = prev + Hs;
      let bc = -Infinity;
      for (let dl = -tol; dl <= tol; dl += 2) {
        const c = nominal + dl;
        if (c < 0 || c + N >= xp.length) continue;
        let sum = 0;
        for (let i = 0; i < N; i += cs) sum += xp[ref + i] * xp[c + i];
        if (sum > bc) { bc = sum; best = c; }
      }
    }
    const o = k * Hs;
    for (let i = 0; i < N; i++) y[o + i] += xp[best + i] * win[i];
    prev = best;
  }
  return y.subarray(0, Math.round(x.length * s));
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
    let x = regionHolen();
    if (!x.length) { out = null; return; }
    if (P.rueck) { x = Float32Array.from(x).reverse(); }
    const p = Math.pow(2, P.st / 12), t = Math.max(0.01, P.tempo), s = p / t;
    if (Math.abs(s - 1) > 1e-3) x = wsola(x, sr, s);
    await new Promise(r => setTimeout(r, 0));
    if (my !== renderToken) return;
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
    if (my !== renderToken) return;
    out = { ch: [r.getChannelData(0), r.getChannelData(1)], sr: r.sampleRate };
    if (wiedergabe) abspielen(f);
    zeichneAnalyse();
  } catch (e) { fehler(e, 'render'); }
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
let hoerCache = { out: null, orig: null, ab: -1, v: null };
function hoerbarCache() {
  if (hoerCache.out !== out || hoerCache.orig !== orig || hoerCache.ab !== ab) { hoerCache = { out, orig, ab, v: hoerbar() }; }
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
  const q = c.createBufferSource(); q.buffer = b; q.connect(anaOut);
  const dur = b.duration;
  f = Math.min(Math.max(von, 0), 0.9999);
  q.onended = () => { if (wiedergabe && wiedergabe.quelle === q) { wiedergabe = null; f = 0; knoepfe(); zeichneAlles(); } };
  q.start(0, f * dur);
  wiedergabe = { quelle: q, t0: c.currentTime - f * dur, dur };
  knoepfe(); schleife();
}
function stopQuelle() {
  if (wiedergabe) { const q = wiedergabe.quelle; wiedergabe = null; q.onended = null; try { q.stop(); } catch (e) { /* schon gestoppt */ } }
}
function pause() {
  if (!wiedergabe) return;
  f = Math.min(1, (ac.currentTime - wiedergabe.t0) / wiedergabe.dur);
  stopQuelle(); knoepfe(); zeichneAlles();
}
function spulen(neu) {
  f = Math.min(Math.max(neu, 0), 0.9999);
  if (wiedergabe) abspielen(f); else zeichneAlles();
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
  if (all.length) neueQuelle(all, ac.sampleRate);
  knoepfe(); zeichneAlles();
}
function neueQuelle(x, rate) {
  if (src.length) { undo.push({ src, sr, sel }); if (undo.length > 5) undo.shift(); }
  src = x; sr = rate; sel = null; f = 0; peakCache = new Map();
  stopQuelle(); planen(); zeichneAlles();
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
    neueQuelle(m, b.sampleRate);
  } catch (e) { fehler(e, 'laden'); }
}
$('datei').addEventListener('change', e => { const fl = e.target.files[0]; if (fl) dateiLaden(fl); e.target.value = ''; });
stage.addEventListener('dragover', e => e.preventDefault());
stage.addEventListener('drop', e => { e.preventDefault(); const fl = e.dataTransfer.files[0]; if (fl) dateiLaden(fl); });

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
    const a = document.createElement('a'); a.href = url; a.download = 'mic.wav';
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
let peakCache = new Map();
function spitzen(x, cols) {
  const k = cols; let e = peakCache.get(x);
  if (e && e.cols === k) return e;
  const mn = new Float32Array(k), mx = new Float32Array(k), per = x.length / k;
  for (let i = 0; i < k; i++) {
    const a = Math.floor(i * per), b = Math.max(a + 1, Math.floor((i + 1) * per));
    let lo = 1, hi = -1; for (let j = a; j < b && j < x.length; j++) { const v = x[j]; if (v < lo) lo = v; if (v > hi) hi = v; }
    mn[i] = x.length ? lo : 0; mx[i] = x.length ? hi : 0;
  }
  e = { cols: k, mn, mx }; peakCache.set(x, e); return e;
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
function posAufQuelle(fr) {
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
  const e = spitzen(src, W);
  welleMalen(cW, e.mn, e.mx, src.length ? W : 0);
  if (sel) {
    x.fillStyle = rgb(BG, 0.65);
    x.fillRect(0, 0, Math.round(sel.a * W), H);
    x.fillRect(Math.round(sel.b * W), 0, W, H);
    linieAn(cW, sel.a, 0.5); linieAn(cW, sel.b, 0.5);
  }
  if (src.length) linieAn(cW, posAufQuelle(f), 1);
}
function zeichneMod() {
  dim(cM);
  const W = cM.width;
  if (!out || !src.length) { welleMalen(cM, null, null, 0); return; }
  const m = hoerbarCache(), e = spitzen(m.x, W);
  welleMalen(cM, e.mn, e.mx, W);
  linieAn(cM, f, 1);
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
  const key = [W, H, ab, h.x.length, h.rate, out ? out.ch[0].length : 0, src.length, sel ? sel.a + ',' + sel.b : '', JSON.stringify(P)].join('|');
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
      f = Math.min(1, (ac.currentTime - wiedergabe.t0) / wiedergabe.dur);
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
  $('recpunkt').classList.toggle('voll', !!rec);
  $('playform').setAttribute('d', wiedergabe ? 'M16 13 V27 M24 13 V27' : 'M16 17 L21 13 L21 27');
  $('ab0').classList.toggle('an', ab === 0);
  $('ab1').classList.toggle('an', ab === 1);
}
$('rec').addEventListener('click', () => { rec ? aufnahmeStop() : aufnahmeStart(); });
$('play').addEventListener('click', () => {
  if (rec) return;
  if (wiedergabe) return pause();
  try { abspielen(f >= 0.999 ? 0 : f); } catch (e) { fehler(e, 'play'); }
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
  let x0 = null, bewegt = false;
  cW.addEventListener('pointerdown', e => { if (rec || !src.length) return; cW.setPointerCapture(e.pointerId); x0 = anteil(cW, e); bewegt = false; });
  cW.addEventListener('pointermove', e => {
    if (x0 == null) return;
    const q = anteil(cW, e);
    if (!bewegt && Math.abs(q - x0) * cW.clientWidth < 4) return;
    bewegt = true; sel = { a: Math.min(x0, q), b: Math.max(x0, q) }; zeichneWelle();
  });
  cW.addEventListener('pointerup', e => {
    if (x0 == null) return;
    const q = anteil(cW, e);
    if (bewegt) { if (sel.b - sel.a < 1e-4) sel = null; planen(); stopQuelle(); knoepfe(); f = 0; zeichneAlles(); }
    else { const had = !!sel; sel = null; if (had) { planen(); stopQuelle(); knoepfe(); } f = P.rueck ? 1 - q : q; if (had) zeichneAlles(); else spulen(f); }
    x0 = null;
  });
  for (const c of [cS, cM]) c.addEventListener('pointerdown', e => { if (!rec && src.length) spulen(anteil(c, e)); });
})();

// ---------- Panel ----------
const panel = Controls.createPanel({ position: 'left', mobileInitialOpenMode: 'peek' });
const neuPlanen = () => { planen(); };
const sl = (key, label, min, max, step, value, dec, fn) => panel.addSlider(key, { label, min, max, step, value, decimals: dec, onChange: v => { fn(v); neuPlanen(); } });
panel
  .addButtonGroup('dateien', { buttons: [
    { key: 'laden', label: 'laden', onClick: () => $('datei').click() },
    { key: 'wav', label: 'wav', onClick: wavExport },
  ] })
  .addButtonGroup('schnitt', { buttons: [
    { key: 'trim', label: 'trim', onClick: () => {
        if (!sel || !src.length) return;
        const r = Float32Array.from(regionHolen()); neueQuelle(r, sr);
      } },
    { key: 'zurueck', label: 'zurück', onClick: () => {
        const u = undo.pop(); if (!u) return;
        src = u.src; sr = u.sr; sel = u.sel; f = 0; peakCache = new Map(); stopQuelle(); knoepfe(); planen(); zeichneAlles();
      } },
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
sl('fq', 'Güte', 0.1, 30, 0.1, P.fq, 1, v => { P.fq = v; });
panel.addDivider();
sl('echoS', 'Echo s', 0.001, 2, 0.001, P.echoS, 3, v => { P.echoS = v; });
sl('echoFb', 'Echo fb', 0, 0.95, 0.01, P.echoFb, 2, v => { P.echoFb = v; });
sl('echoMix', 'Echo mix', 0, 1, 0.01, P.echoMix, 2, v => { P.echoMix = v; });
panel.addDivider();
sl('hallMix', 'Hall mix', 0, 1, 0.01, P.hallMix, 2, v => { P.hallMix = v; });
sl('hallS', 'Hall s', 0.1, 10, 0.1, P.hallS, 1, v => { P.hallS = v; });
panel.addDivider();
sl('verz', 'Verzerrung', 0, 1, 0.01, P.verz, 2, v => { P.verz = v; });
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
knoepfe();
requestAnimationFrame(layout);

window.__mic = { planen, get out() { return out; }, get src() { return src; }, get P() { return P; }, get sel() { return sel; }, renderFertig: async () => { if (renderTimer) { clearTimeout(renderTimer); renderTimer = 0; renderOffen = rendern(); } if (renderOffen) await renderOffen; } };

})();
