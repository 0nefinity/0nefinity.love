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
const endlos = () => schleifeAn;
// Moment einfrieren klingt im Audio-Thread an der Stelle f, ohne Rendern: Umschalten und Verschieben sind sofort hörbar.
const gefroren = () => P.frei && ab === 1 && !!out;
let scrub = null;                   // {warSpielend, n}: Finger hält das Band
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
    const c = ac;
    spielerBereit = c.audioWorklet.addModule('/tools/mic-worklet.js').then(() => {
      spieler = new AudioWorkletNode(c, 'mic-spieler', { numberOfInputs: 0, outputChannelCount: [2] });
      spieler.connect(anaOut);
      spieler.port.onmessage = ev => spielerEcho(ev.data);
      spieler.onprocessorerror = () => fehler(new Error('spieler'), 'worklet');
      lg = graphBauen(c, {});
      lg.motor.port.onmessage = ev => motorPost(ev.data);
      lg.motor.onprocessorerror = () => fehler(new Error('motor'), 'worklet');
      lg.ende.onprocessorerror = () => fehler(new Error('ende'), 'worklet');
      setzen(lg, P, true);
    }).catch(e => fehler(e, 'worklet'));
  }
  if (ac.state !== 'running') ac.resume().catch(e => fehler(e, 'resume'));
  return ac;
}
addEventListener('pointerdown', () => { try { ctxHolen(); } catch (e) { fehler(e, 'ctx'); } }, { once: true });

// ---------- Spieler im Audio-Thread (tools/mic-worklet.js): Scrubben, Moment einfrieren ----------
// Der Puffer geht einmal hinüber, danach nur Positionen. Jede Nachricht kommt mit der Blockzeit zurück, in der sie
// angekommen ist: daraus die Latenz (latenzen, für Messungen).
let spieler = null, spielerBereit = null, spielerPuf = null, spielerId = 0;
const spielerOffen = new Map(), latenzen = [];
function idMerken(m) {
  m.id = ++spielerId;
  if (spielerOffen.size > 500) spielerOffen.clear();
  const ts = ac.getOutputTimestamp ? ac.getOutputTimestamp() : null;
  spielerOffen.set(m.id, { t: performance.now(), ctx: ac.currentTime, aus: ts && ts.contextTime > 0 ? ts.contextTime : null, art: m.t });
}
function spielerSenden(m, transfer = []) {
  idMerken(m);
  if (spieler) spieler.port.postMessage(m, transfer);
  else spielerBereit.then(() => { if (spieler) spieler.port.postMessage(m, transfer); });
}
function spielerEcho(d) {
  const o = spielerOffen.get(d.id);
  if (!o) return;
  spielerOffen.delete(d.id);
  latenzen.push({ art: o.art, ms: performance.now() - o.t, block: (d.ct - o.ctx) * 1000, hoerbar: o.aus != null ? (d.ct - o.aus) * 1000 : null });
  if (latenzen.length > 400) latenzen.shift();
}
// Motor: Tempo und Tonhöhe im Audio-Thread. Er meldet, wo er steht, und wann er fertig ist.
function motorSenden(m, transfer = []) {
  if (!lg) return;
  idMerken(m);
  lg.motor.port.postMessage(m, transfer);
}
function motorPost(d) {
  if (d.t === 'echo') return spielerEcho(d);
  const w = wiedergabe;
  if (!w || !w.motor || !w.st || d.gen !== w.st.gen) return;
  if (d.t === 'stand') w.st = { pos: d.pos, nach: d.nach, ct: d.ct, gen: d.gen };
  else if (d.t === 'ende') { wiedergabe = null; f = 0; knoepfe(); zeichneAlles(); }
}
let spielerN = 0;
function spielerPuffer() {
  const useOut = ab === 1 && out, chs = useOut ? out.ch : [orig], rate = useOut ? out.sr : sr;
  if (!chs[0].length) return 0;
  if (spielerPuf !== chs[0]) {
    spielerPuf = chs[0];
    // Der Spieler zählt in Samples des Audio-Takts; fremde Raten einmal linear umrechnen, nicht bei jeder Bewegung.
    const kopie = chs.map(d => umrechnen(d, rate));
    spielerN = kopie[0].length;
    spielerSenden({ t: 'puffer', ch: kopie, bit: !!(useOut && out.bit) }, kopie.map(d => d.buffer));
  }
  return spielerN;
}
// Scrubben: das Band unter dem Finger. Vorwärts, rückwärts, schnell, langsam, still.
function scrubStart(fNeu) {
  ctxHolen();
  const n = spielerPuffer();
  if (!n) return false;
  scrub = { warSpielend: !!wiedergabe, n };
  if (!gefroren()) stopQuelle();
  scrubZu(fNeu, true);
  schleife();
  return true;
}
function scrubZu(fNeu, start) {
  const alt = f;
  f = Math.min(Math.max(fNeu, 0), 0.9999);
  if (gefroren()) spielerSenden({ t: 'frei', c: f * scrub.n });
  else spielerSenden(start ? { t: 'scrub', z: f * scrub.n, von: alt * scrub.n } : { t: 'scrub', z: f * scrub.n });
}
function scrubEnde() {
  if (!scrub) return;
  const s = scrub; scrub = null;
  if (gefroren()) { if (!s.warSpielend || !wiedergabe) spielerSenden({ t: 'aus' }); }
  else { spielerSenden({ t: 'aus' }); if (s.warSpielend) abspielen(f); }
  if (!wiedergabe) zeichneAlles();
}

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
const yinA = new Float32Array(NF), yinAi = new Float32Array(NF);
// Differenzfunktion über die Kreuzkorrelation im Frequenzraum: d(t) = E(0) + E(t) - 2 r(t), dieselbe Kurve in einem Bruchteil der Zeit.
function yin(x, s, rate) {
  const W = 1024, tauMax = Math.min(W, Math.floor(rate / 60));
  if (s < 0 || s + W + tauMax > x.length) return 0;
  let e = 0; for (let i = 0; i < W; i++) e += x[s + i] * x[s + i];
  if (Math.sqrt(e / W) < 0.003) return 0;
  for (let i = 0; i < NF; i++) { fftRe[i] = i < W ? x[s + i] : 0; fftIm[i] = 0; }
  fft(); yinA.set(fftRe); yinAi.set(fftIm);
  for (let i = 0; i < NF; i++) { fftRe[i] = i < W + tauMax ? x[s + i] : 0; fftIm[i] = 0; }
  fft();
  for (let k = 0; k < NF; k++) {
    const re = yinA[k] * fftRe[k] + yinAi[k] * fftIm[k], im = yinA[k] * fftIm[k] - yinAi[k] * fftRe[k];
    fftRe[k] = re; fftIm[k] = -im;
  }
  fft();
  const d = new Float32Array(tauMax + 1);
  let E = e;
  for (let t = 1; t <= tauMax; t++) {
    E += x[s + W - 1 + t] * x[s + W - 1 + t] - x[s + t - 1] * x[s + t - 1];
    d[t] = Math.max(0, e + E - 2 * fftRe[t] / NF);
  }
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

// Die 0n-Rechnungen (Ton im Ton, endlos steigend, game of life) laufen im Worker (tools/mic-worker.js); ein neuer Auftrag verwirft den laufenden.
let wk = null, wkJob = null;
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
// Hall-Länge in Halbtonschritten (Faktor 2^(1/12)): so wenige Impulse wie nötig, live und im Export dieselben.
const hallQ = s => Math.max(0.05, Math.pow(2, Math.round(Math.log2(Math.max(0.05, s)) * 12) / 12));
const impulse = new Map();
function impulsHolen(rate, q) {
  const k = rate + '|' + q;
  let b = impulse.get(k);
  if (!b) { b = hallImpuls(rate, q); impulse.set(k, b); if (impulse.size > 6) impulse.delete(impulse.keys().next().value); }
  return b;
}
function kurve(k) {
  const n = 2048, c = new Float32Array(n), g = 1 + k * 20, nm = Math.tanh(g);
  for (let i = 0; i < n; i++) { const x = i * 2 / (n - 1) - 1; c[i] = Math.tanh(x * g) / nm; }
  return c;
}
const kurven = new Map();
function kurveHolen(k) {
  let c = kurven.get(k);
  if (!c) { c = kurve(k); kurven.set(k, c); if (kurven.size > 64) kurven.delete(kurven.keys().next().value); }
  return c;
}

// ---------- Kette: ein Graph für Hören und Export ----------
// Motor (Tempo, Tonhöhe) -> Pegel -> Filter -> Verzerrung -> M -> trocken + Echo + Hall -> Ende (1-Bit).
// Live hängt er dauerhaft am Ausgang und jeder Regler setzt nur Werte, im nächsten Audio-Block hörbar.
// Der Export baut denselben Graphen offline: was man hört, ist was man bekommt.
const FILTER = { low: 'lowpass', high: 'highpass', band: 'bandpass' };
let lg = null;                          // der Live-Graph
let motorGen = 0;
function graphBauen(c, opt = {}) {
  const live = !opt.offline;
  const gain = v => { const g = c.createGain(); g.gain.value = v; return g; };
  const g = { c, live, R: c.sampleRate, n: opt.n || 0, S: opt.S || 0, kurveK: -1, hall: [], hallKey: null, rDl: null, rMax: 0 };
  g.motor = new AudioWorkletNode(c, 'mic-motor', { numberOfInputs: 0, outputChannelCount: [1], processorOptions: opt.motor || {} });
  g.pegel = gain(1); g.durch = gain(1); g.fAus = gain(1);
  g.motor.connect(g.pegel); g.pegel.connect(g.durch); g.durch.connect(g.fAus);
  g.bq = {}; g.bqG = {};
  for (const k in FILTER) {
    const b = c.createBiquadFilter(), bg = gain(0); b.type = FILTER[k];
    g.pegel.connect(b); b.connect(bg); bg.connect(g.fAus); g.bq[k] = b; g.bqG[k] = bg;
  }
  g.vDry = gain(1); g.vWet = gain(0); g.shaper = c.createWaveShaper(); g.M = gain(1);
  g.fAus.connect(g.vDry); g.vDry.connect(g.M); g.fAus.connect(g.shaper); g.shaper.connect(g.vWet); g.vWet.connect(g.M);
  g.sum = gain(1); g.M.connect(g.sum);
  // Offline steht das Echo still: ein Puffer genau so lang wie es, nicht zehn Sekunden auf Vorrat (das kostete beim Ziehen 70 ms).
  g.dl = c.createDelay(live ? 10 : Math.min(10, Math.max(0.001, P.echoS)) + 0.001); g.fb = gain(0); g.eWet = gain(0);
  g.M.connect(g.dl); g.dl.connect(g.fb); g.fb.connect(g.dl); g.dl.connect(g.eWet); g.eWet.connect(g.sum);
  g.hWet = gain(0); g.hWet.connect(g.sum);
  g.ende = new AudioWorkletNode(c, 'mic-ende', { numberOfInputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit', processorOptions: opt.ende || {} });
  g.sum.connect(g.ende);
  // rekursiv echo: was herauskommt, geht nach einer halben Cliplänge wieder vorne hinein, leiser. Jede Wiederholung
  // enthält alle vorigen: ein Baum aus Echos von Echos.
  g.rG = gain(0); g.rG.connect(g.pegel);
  if (live) { g.tor = gain(0); g.ende.connect(g.tor); g.tor.connect(anaOut); } else g.ende.connect(c.destination);
  return g;
}
// Länge in Samples bei Rate R: Clip (Tempo), Fahne (Echo, Hall), bei rekursiv der Baum dahinter.
function laengen(n, R, P) {
  const t = Math.max(0.01, P.tempo), clip = n / t;
  const fahne = Math.ceil(((P.echoMix > 0 ? Math.min(6 * P.echoS, 8) : 0) + (P.hallMix > 0 ? P.hallS : 0)) * R);
  let total = Math.max(1, Math.ceil(clip) + fahne);
  if (P.rekursiv) total += Math.ceil(Math.min(3 * total, 60 * R));
  return { t, clip, tail: total - Math.ceil(clip), total };
}
const tonP = P => Math.pow(2, P.st / 12);
function setzen(g, P, sofort) {
  const c = g.c, t0 = c.currentTime;
  const set = (prm, v) => { if (sofort) { prm.cancelScheduledValues(0); prm.value = v; } else prm.setTargetAtTime(v, t0, 0.005); };
  set(g.pegel.gain, P.pegel);
  set(g.durch.gain, P.filter === 'aus' ? 1 : 0);
  const fhz = Math.max(1, Math.min(P.fhz, g.R / 2 - 1)), q = Math.max(1e-4, P.fq);
  for (const k in FILTER) { set(g.bqG[k].gain, P.filter === k ? 1 : 0); set(g.bq[k].frequency, fhz); set(g.bq[k].Q, q); }
  const vk = Math.round(P.verz / 0.005) * 0.005;
  if (vk > 0 && vk !== g.kurveK) { g.shaper.curve = kurveHolen(vk); g.kurveK = vk; }
  const os = vk > 0 ? '4x' : 'none';
  if (g.shaper.oversample !== os) g.shaper.oversample = os;
  set(g.vDry.gain, vk > 0 ? 0 : 1); set(g.vWet.gain, vk > 0 ? 1 : 0);
  set(g.dl.delayTime, Math.min(10, Math.max(0.001, P.echoS)));
  const fb = Math.min(0.95, Math.max(0, P.echoFb));
  set(g.fb.gain, fb); set(g.eWet.gain, P.echoMix);
  set(g.hWet.gain, P.hallMix);
  if (P.hallMix > 0) hallSetzen(g, hallQ(P.hallS));
  const L = laengen(g.n, g.R, P);
  if (P.rekursiv) {
    const d = Math.min(60, Math.max(0.01, 0.5 * L.clip / g.R));
    if (!g.rDl || g.rMax < d) {
      const alt = g.rDl;
      g.rMax = g.live ? Math.min(60, Math.max(1, 2 * d)) : d;
      g.rDl = c.createDelay(g.rMax); g.rDl.delayTime.value = d;
      g.sum.connect(g.rDl); g.rDl.connect(g.rG);
      if (alt) { alt.disconnect(); g.sum.disconnect(alt); }
    } else set(g.rDl.delayTime, d);
    // Schleifenverstärkung unter 0.6: die Wiederholungen werden leiser, egal wie laut Echo und Hall sind.
    const vg = vk > 0 ? (1 + 20 * vk) / Math.tanh(1 + 20 * vk) : 1;
    const fg = P.filter === 'low' || P.filter === 'high' ? Math.pow(10, q / 20) : 1;
    set(g.rG.gain, 0.6 / Math.max(1, P.pegel * (1 + P.echoMix / (1 - fb)) * (1 + P.hallMix) * vg * fg));
  } else set(g.rG.gain, 0);
  if (g.live) {
    motorSenden({ t: 'param', tempo: P.tempo, p: tonP(P), tailN: L.tail, loop: endlos() });
    g.ende.port.postMessage({ bit: P.bit, S: g.S * P.pegel });
  }
}
// Hall: ein Faltungsknoten je Länge. Live wird der neue im Hintergrund gebaut und über 40 ms eingeblendet.
function hallSetzen(g, q) {
  if (g.hallKey === q) return;
  g.hallKey = q;
  if (!g.live) {
    const cv = g.c.createConvolver(); cv.buffer = impulsHolen(g.R, q);
    g.M.connect(cv); cv.connect(g.hWet);
    return;
  }
  if (g.hallBaut) return;
  g.hallBaut = true;
  setTimeout(function bau() {
    try {
      const q = g.hallKey, c = g.c, t = c.currentTime;
      const cv = c.createConvolver(); cv.buffer = impulsHolen(g.R, q);
      const xg = c.createGain(); xg.gain.setValueAtTime(0, t); xg.gain.linearRampToValueAtTime(1, t + 0.04);
      g.M.connect(cv); cv.connect(xg); xg.connect(g.hWet);
      for (const h of g.hall) {
        h.xg.gain.cancelScheduledValues(t); h.xg.gain.setValueAtTime(h.xg.gain.value, t); h.xg.gain.linearRampToValueAtTime(0, t + 0.04);
        setTimeout(() => { g.M.disconnect(h.cv); h.xg.disconnect(); }, 120);
      }
      g.hall = [{ cv, xg, q }];
      if (g.hallKey !== q) setTimeout(bau, 0); else g.hallBaut = false;
    } catch (e) { g.hallBaut = false; fehler(e, 'hall'); }
  }, 0);
}

// Vorlauf: was der Motor liest. Rückwärts und Krebs sofort, die 0n-Rechnungen im Worker. Bis sie da sind, klingt der alte Puffer weiter.
let vl = null;
function vorlauf() {
  const key = [src, sel && sel.a, sel && sel.b, P.rueck, P.krebs, P.tit, P.steig, P.leben];
  if (vl && vl.key.every((k, i) => k === key[i])) return vl;
  let x = regionHolen();
  if (P.rueck) x = Float32Array.from(x).reverse();
  // Krebs Kanon: der Clip und sein Krebs zugleich, vorwärts und rückwärts. In der Mitte begegnen sie sich.
  if (P.krebs) {
    const n = x.length, k = new Float32Array(n);
    let m0 = 0, m1 = 0;
    for (let i = 0; i < n; i++) { k[i] = x[i] + x[n - 1 - i]; m0 = Math.max(m0, Math.abs(x[i])); m1 = Math.max(m1, Math.abs(k[i])); }
    if (m1 > 0) for (let i = 0; i < n; i++) k[i] *= m0 / m1;
    x = k;
  }
  const spitzeVon = y => { let m = 0; for (let i = 0; i < y.length; i++) { const v = Math.abs(y[i]); if (v > m) m = v; } return m; };
  const e = vl = { key, wert: null, prom: null };
  const ops = [P.tit && 'tit', P.steig !== 'aus' && P.steig, P.leben && 'leben'].filter(Boolean);
  if (!ops.length) { e.wert = { x, S: spitzeVon(x), tit: null, leben: null }; e.prom = Promise.resolve(e.wert); return e; }
  e.prom = (async () => {
    let tit = null, leben = null;
    try {
      for (const op of ops) {
        const d = await workerAuftrag({ op, x, rate: sr });
        if (!d) { if (vl === e) vl = null; return null; }
        x = d.y;
        if (op === 'tit') tit = d.zusatz.ebenen;
        if (op === 'leben') leben = d.zusatz;
      }
    } catch (err) { if (vl === e) vl = null; throw err; }
    e.wert = { x, S: spitzeVon(x), tit, leben };
    if (vl === e && wiedergabe && wiedergabe.motor && wiedergabe.st) motorPuffer();
    return e.wert;
  })();
  return e;
}
// Fremde Raten einmal linear auf den Audio-Takt umrechnen, nicht bei jeder Bewegung.
function umrechnen(d, rate) {
  const k = rate / ac.sampleRate;
  if (k === 1) return d.slice();
  const n = Math.max(1, Math.round(d.length / k)), y = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i * k, j = Math.floor(x), t = x - j; y[i] = (d[j] || 0) * (1 - t) + (d[j + 1] || 0) * t; }
  return y;
}
function motorPuffer() {
  const v = vl && vl.wert;
  if (!lg || !v || lg.quelle === v.x) return;
  lg.quelle = v.x;
  const y = umrechnen(v.x, sr);
  lg.n = y.length; lg.S = v.S;
  motorSenden({ t: 'puffer', x: y }, [y.buffer]);
  setzen(lg, P, false);
}
// Jeder Regler: sofort in den Live-Graphen. Das Bild (Welle, Spektrum, Export) rechnet planen() hinterher.
function liveSetzen() {
  if (!lg) return;
  try {
    if (wiedergabe && wiedergabe.motor) { const v = vorlauf(); if (v.wert) motorPuffer(); }
    setzen(lg, P, false);
  } catch (e) { fehler(e, 'live'); }
}

let renderToken = 0, renderTimer = 0, renderOffen = null;
// Regler warten 150 ms auf Ruhe, Schalter rendern sofort. Hören wartet auf nichts davon.
function planen(warte = 150) {
  clearTimeout(renderTimer);
  orig = regionHolen();
  renderTimer = setTimeout(() => { renderTimer = 0; renderOffen = rendern(); }, warte);
}
async function rendern() {
  const my = ++renderToken;
  try {
    if (!regionHolen().length) { out = null; return; }
    const v = await vorlauf().prom;
    if (!v || my !== renderToken) return;
    const L = laengen(v.x.length, sr, P);
    const oc = new OfflineAudioContext(2, L.total, sr);
    await oc.audioWorklet.addModule('/tools/mic-worklet.js');
    if (my !== renderToken) return;
    const g = graphBauen(oc, { offline: true, n: v.x.length, S: v.S,
      motor: { x: v.x, tempo: P.tempo, p: tonP(P), loop: false, tailN: L.tail, spiel: { pos: 0, nach: -1, sofort: true } },
      ende: { bit: P.bit, S: v.S * P.pegel } });
    setzen(g, P, true);
    const t0 = performance.now();
    const r = await oc.startRendering();
    renderMs.push({ ms: performance.now() - t0, s: L.total / sr });
    if (renderMs.length > 50) renderMs.shift();
    if (my !== renderToken) return;
    // haupt: Anteil des Puffers, den der Clip selbst füllt (danach nur Echo-/Hallfahne).
    out = { ch: [r.getChannelData(0), r.getChannelData(1)], sr, bit: P.bit, tit: v.tit, leben: v.leben, krebs: P.krebs, rekursiv: P.rekursiv, haupt: Math.min(1, L.clip / L.total) };
    malSpurAbgeholt(my);
    if (wiedergabe && !wiedergabe.motor) abspielen(f);
    if (scrub) { scrub.n = spielerPuffer(); scrubZu(f); }
    zeichneAnalyse();
  } catch (e) { fehler(e, 'render'); }
}
const renderMs = [];

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
  if (ab === 1 && !gefroren() && regionHolen().length) return motorAbspielen(von);
  stopQuelle();
  const c = ctxHolen();
  const useOut = ab === 1 && out;
  const chs = useOut ? out.ch : [orig];
  const rate = useOut ? out.sr : sr;
  if (!chs[0].length) return;
  if (gefroren()) {
    // Eingefroren: kein Buffer-Start, der Spieler hält den Moment unter dem Kopf, sofort.
    f = Math.min(Math.max(von, 0), 0.9999);
    const n = spielerPuffer();
    spielerSenden({ t: 'frei', c: f * n });
    wiedergabe = { frei: true, dur: chs[0].length / rate, t0: 0 };
    knoepfe(); schleife();
    return;
  }
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
// Verändert hören: der Motor spielt die Region live durch den Live-Graphen, jeder Regler greift im nächsten Block.
function motorAbspielen(von) {
  if (!(wiedergabe && wiedergabe.motor)) stopQuelle();
  ctxHolen();
  f = Math.min(Math.max(von, 0), 0.9999);
  const v = vorlauf();
  const w = wiedergabe = { motor: true, st: null, von: f };
  knoepfe(); schleife();
  if (lg && v.wert) motorStart(w);
  else Promise.all([spielerBereit, v.prom]).then(() => { if (wiedergabe === w && lg && vl && vl.wert) motorStart(w); }).catch(e => fehler(e, 'motor'));
}
function motorStart(w) {
  motorPuffer();
  const L = laengen(lg.n, lg.R, P), o = w.von * L.total;
  const pos = Math.min(Math.round(o * L.t), lg.n), nach = o >= L.clip ? Math.round(o - L.clip) : -1;
  setzen(lg, P, false);
  const gen = ++motorGen;
  motorSenden({ t: 'spiel', pos, nach, gen, loop: endlos() });
  const t = ac.currentTime, g = lg.tor.gain;
  g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(1, t + BLENDE);
  w.st = { pos, nach, ct: t, gen };
}
function posF() {
  if (wiedergabe.frei) return f;
  if (wiedergabe.motor) {
    const st = wiedergabe.st;
    if (!st || !lg) return wiedergabe.von;
    const L = laengen(lg.n, lg.R, P), dt = Math.max(0, ac.currentTime - st.ct) * lg.R;
    let o = st.nach < 0 ? Math.min(st.pos / L.t + dt, L.total) : Math.ceil(L.clip) + st.nach + dt;
    if (endlos()) o %= L.total;
    return Math.min(0.9999, o / L.total);
  }
  const x = (ac.currentTime - wiedergabe.t0) / wiedergabe.dur;
  return endlos() ? ((x % 1) + 1) % 1 : Math.min(1, x);
}
function stopQuelle() {
  if (wiedergabe && wiedergabe.motor) {
    wiedergabe = null; motorGen++;
    motorSenden({ t: 'aus' });
    const t = ac.currentTime, g = lg.tor.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + BLENDE);
    return;
  }
  if (wiedergabe && wiedergabe.frei) { wiedergabe = null; if (!scrub) spielerSenden({ t: 'aus' }); return; }
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

// ---------- Mikrofon wählen ----------
const micSchluessel = 'mic.eingang';
function micGemerkt() { try { return localStorage.getItem(micSchluessel) || ''; } catch (e) { return ''; } }
function micMerken(id) { try { id ? localStorage.setItem(micSchluessel, id) : localStorage.removeItem(micSchluessel); } catch (e) { console.warn('mic: Auswahl nicht gespeichert', e); } }
let micGeraete = [];
// Namen gibt es erst nach der ersten Freigabe; "communications" und ein "default", das ein echtes Gerät doppelt, fallen weg.
async function micListe(stream) {
  const md = navigator.mediaDevices, sel = $('quellewahl'), box = $('quelle');
  if (!md || !md.enumerateDevices) return;
  try {
    const alle = (await md.enumerateDevices()).filter(d => d.kind === 'audioinput' && d.deviceId !== 'communications');
    micGeraete = alle.filter(d => d.deviceId !== 'default' || !alle.some(o => o !== d && o.groupId && o.groupId === d.groupId));
    const tr = stream && stream.getAudioTracks()[0], aktiv = (tr && tr.getSettings().deviceId) || micGemerkt();
    const gemerkt = micGemerkt();
    if (gemerkt && !micGeraete.some(d => d.deviceId === gemerkt) && micGeraete.some(d => d.label)) {
      micMerken(''); fehler({ message: 'gewähltes Mikrofon nicht gefunden, nehme das Standard-Mikrofon' }, 'mic');
    }
    sel.textContent = '';
    micGeraete.forEach((d, i) => { const o = document.createElement('option'); o.value = d.deviceId; o.textContent = d.label || 'mikrofon' + (micGeraete.length > 1 ? ' ' + (i + 1) : ''); sel.appendChild(o); });
    const ziel = micGeraete.find(d => d.deviceId === micGemerkt()) || micGeraete.find(d => d.deviceId === aktiv) || micGeraete.find(d => d.deviceId === 'default') || micGeraete[0];
    if (ziel) sel.value = ziel.deviceId;
    sel.classList.toggle('einzeln', micGeraete.length < 2);
    sel.tabIndex = micGeraete.length < 2 ? -1 : 0;
    box.hidden = !micGeraete.length;
  } catch (e) { fehler(e, 'mic-liste'); }
}
$('quellewahl').addEventListener('change', e => { micMerken(e.target.value); });
if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) navigator.mediaDevices.addEventListener('devicechange', () => micListe());
micListe();

// ---------- Aufnahme ----------
const BLK = 1024;
async function aufnahmeStart() {
  fehlerAus();
  if (wiedergabe) pause();
  const c = ctxHolen();
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { fehler(new Error('getUserMedia nicht verfügbar (https nötig)'), 'mic'); return; }
  let stream;
  const roh = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
  try {
    const gemerkt = micGemerkt();
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: gemerkt ? { ...roh, deviceId: { exact: gemerkt } } : roh });
    } catch (e) {
      if (!gemerkt || (e.name !== 'OverconstrainedError' && e.name !== 'NotFoundError')) throw e;
      micMerken('');
      fehler({ message: 'gewähltes Mikrofon nicht gefunden, nehme das Standard-Mikrofon' }, 'mic');
      stream = await navigator.mediaDevices.getUserMedia({ audio: roh });
    }
  } catch (e) { fehler(e, 'mic'); return; }
  micListe(stream);
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
    let chs = ab === 1 && out ? out.ch : [orig];
    const rate = ab === 1 && out ? out.sr : sr;
    if (!chs[0] || !chs[0].length) throw new Error('nichts aufgenommen');
    if (gefroren()) {
      // Der eingefrorene Moment wird erst hier zu einer Datei, hören geht ohne Rechnen.
      const a = chs[0], b = chs[1] || a, m = new Float32Array(a.length);
      for (let i = 0; i < m.length; i++) m[i] = 0.5 * (a[i] + b[i]);
      const d = await workerAuftrag({ op: 'frei', x: m, rate, p: f });
      if (!d || !d.y) throw new Error('einfrieren');
      const z = d.y;
      if (out.bit) einBit([z]);
      chs = [z, z];
    }
    const url = URL.createObjectURL(new Blob([wavBauen(chs, rate)], { type: 'audio/wav' }));
    const a = document.createElement('a'); a.href = url; a.download = (aktuell() ? aktuell().name.replace(/[\\/:*?"<>|]+/g, '_') : 'mic') + '.wav';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (e) { fehler(e, 'wav'); }
}

// ---------- Zeichnen ----------
// Größen kommen vom ResizeObserver: clientWidth/clientHeight im Bildtakt erzwingen sonst bei jedem Zug ein Layout.
const grossen = new WeakMap();
const grossenBeob = new ResizeObserver(es => { for (const e of es) grossen.set(e.target, [e.target.clientWidth, e.target.clientHeight]); });
function dim(c) {
  let g = grossen.get(c);
  if (!g) { g = [c.clientWidth, c.clientHeight]; grossen.set(c, g); grossenBeob.observe(c); }
  const d = dpr(), w = Math.max(1, Math.round(g[0] * d)), h = Math.max(1, Math.round(g[1] * d));
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
// Die ruhende Welle ändert sich nur mit Clip, Breite, Höhe und Farbe: beim zweiten Bild mit denselben Spitzen wird sie
// einmal in eine Bitmap gemalt, danach kopiert drawImage sie (statt 800 fillRect je Bild und Leinwand).
const welleBm = new WeakMap();
function welleStrich(x, W, H, mn, mx, n) {
  const m = H / 2;
  x.fillStyle = rgb(FG, 0.25); x.fillRect(0, Math.floor(m), W, 1);
  if (!n) return;
  x.fillStyle = rgb(FG, 0.9);
  for (let i = 0; i < W; i++) {
    const j = Math.min(n - 1, Math.floor(i * n / W));
    const y1 = m - mx[j] * m, y2 = m - mn[j] * m;
    x.fillRect(i, y1, 1, Math.max(1, y2 - y1));
  }
}
function welleMalen(c, mn, mx, n) {
  const x = c.getContext('2d'), W = c.width, H = c.height, fg = rgb(FG, 0);
  x.clearRect(0, 0, W, H);
  let e = welleBm.get(c);
  const gleich = e && e.mn === mn && e.n === n && e.W === W && e.H === H && e.fg === fg;
  if (gleich && e.bm) { x.drawImage(e.bm, 0, 0); return; }
  if (gleich && mn) {
    e.bm = document.createElement('canvas'); e.bm.width = W; e.bm.height = H;
    welleStrich(e.bm.getContext('2d'), W, H, mn, mx, n);
    x.drawImage(e.bm, 0, 0); return;
  }
  welleBm.set(c, { mn, n, W, H, fg, bm: null });
  welleStrich(x, W, H, mn, mx, n);
}
function linieAn(c, q, a = 1) {
  const x = c.getContext('2d'), p = Math.round(q * c.width);
  x.fillStyle = rgb(FG, a); x.fillRect(p, 0, Math.max(1, Math.round(dpr())), c.height);
}
// game of life spielt den Clip G-mal hintereinander, je Generation einmal: jeder Durchlauf liegt wieder auf demselben Clip.
// Lange Clips: eine Generation dauert D (Anteil am Clip), der Clip läuft dabei weiter im Kreis.
const durchlauf = fr => out && out.leben ? (Math.min(fr / out.haupt, 0.99999) * out.leben.G * (out.leben.D || 1)) % 1 : fr;
function posAufQuelle(fr) {
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
    if (ab === 1 && out && out.krebs && !gefroren()) { const a = sel ? sel.a : 0, b = sel ? sel.b : 1, k = vx(a + b - q); if (k >= 0 && k <= 1) linieAn(cW, k, 1); }
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
const sgBitmap = document.createElement('canvas');
let sgSchmutz = true, sgGemalt = null, sgNeu = true, sgDx = null, sgBitmapOk = false;
let sgBild = null, sgKey = '', sgSpalten = null, sgTeil = false, sgWeiter = 0;
function clearSg() {
  sgGemalt = null; dim(cS);
  const x = cS.getContext('2d'); x.fillStyle = rgb(BG); x.fillRect(0, 0, cS.width, cS.height);
}
function sgStatisch() {
  dim(cS);
  const W = cS.width, H = cS.height, h = hoerbarCache();
  if (ab === 1 && out && out.leben && h.x.length) { sgGemalt = null; lebenMalen(W, H, h); malSpurMalen(); return; }
  const key = [W, H, ab, hoerVer, h.x.length, h.rate, out ? out.ch[0].length : 0, src.length, sel ? sel.a + ',' + sel.b : ''].join('|');
  if (key !== sgKey || sgTeil) {
    const ganz = key !== sgKey;
    sgKey = key;
    const alt = sgBild && sgBild.width === W && sgBild.height === H;
    const img = alt ? sgBild : new ImageData(W, H), db = new Float32Array(NF / 2);
    if (!h.x.length || !alt) { for (let i = 0; i < img.data.length; i += 4) { img.data[i] = BG[0]; img.data[i + 1] = BG[1]; img.data[i + 2] = BG[2]; img.data[i + 3] = 255; } }
    sgTeil = false;
    if (!h.x.length || !alt) sgDx = null;
    if (h.x.length) {
      // Die FFT-Spalten hängen nur von Clip und Breite ab, nicht von der Höhe: beim Verschieben des Panels ändert sich nur die Höhe.
      // Sie entstehen in Scheiben zu 6 ms je Bild: das neue Spektrogramm wischt über das alte, die Hand am Regler ruckelt nie.
      const half = NF / 2, ck = hoerVer + '|' + W + '|' + h.x.length;
      if (!sgSpalten || sgSpalten.key !== ck || sgSpalten.x !== h.x) sgSpalten = { key: ck, x: h.x, cols: new Float32Array(W * half), n: 0 };
      const S = sgSpalten, von = ganz || !alt ? 0 : S.n, t0 = performance.now();
      while (S.n < W && (S.n === von || performance.now() - t0 < 6)) {
        const col = S.n++;
        spektrumAb(h.x, Math.floor(col / W * h.x.length - NF / 2), db); S.cols.set(db, col * half);
      }
      for (let col = von; col < S.n; col++) spalteMalen(img, col, S.cols.subarray(col * half, (col + 1) * half), h.rate);
      sgDx = !alt ? null : sgSchmutz ? (sgDx ? [Math.min(sgDx[0], von), S.n] : null) : [von, S.n];
      if (S.n < W) {
        sgTeil = true;
        if (!sgWeiter) sgWeiter = requestAnimationFrame(() => { sgWeiter = 0; if (sgTeil) sgStatisch(); });
      }
    }
    sgBild = img; sgSchmutz = true;
  }
  if (sgSchmutz || sgBitmap.width !== W || sgBitmap.height !== H) {
    // Das Bild ändert sich selten; im Bildtakt zeichnet nur drawImage (GPU) statt putImageData (CPU-Kopie von ~2 MB).
    if (sgBitmap.width !== W || sgBitmap.height !== H) { sgBitmap.width = W; sgBitmap.height = H; sgBitmapOk = false; }
    const bx = sgBitmap.getContext('2d');
    if (sgDx && sgBitmapOk) bx.putImageData(sgBild, 0, 0, sgDx[0], 0, sgDx[1] - sgDx[0], H); else bx.putImageData(sgBild, 0, 0);
    sgSchmutz = false; sgNeu = true; sgDx = null; sgBitmapOk = true;
  }
  const cx = cS.getContext('2d'), lw = Math.max(1, Math.round(dpr())), lp = Math.round(f * W);
  if (sgGemalt && sgGemalt.W === W && sgGemalt.H === H && !sgNeu && !malStriche.length) {
    // Nur der Abspielstrich bewegt sich: den alten Streifen aus der Bitmap zurückholen, statt die ganze Leinwand zu kopieren.
    const q = sgGemalt.p, x0 = Math.max(0, Math.min(q, lp) - 1), x1 = Math.min(W, Math.max(q, lp) + lw + 1);
    cx.drawImage(sgBitmap, x0, 0, x1 - x0, H, x0, 0, x1 - x0, H);
  } else cx.drawImage(sgBitmap, 0, 0);
  sgNeu = false;
  if (h.x.length) linieAn(cS, f, 0.9);
  malSpurMalen();
  sgGemalt = { W, H, p: lp };
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
  sgGemalt = null;
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
let mittelSpek = null;
function zeichneAnalyse(nurBild) {
  const h = hoerbarCache();
  sgStatisch();
  zeichneMod();
  if (h.x.length) {
    if (!mittelSpek || mittelSpek.x !== h.x || mittelSpek.ver !== hoerVer) {
      const acc = new Float32Array(NF / 2), tmp = new Float32Array(NF / 2), n = 12;
      for (let i = 0; i < n; i++) { spektrumAb(h.x, Math.floor((i + 0.5) / n * h.x.length - NF / 2), tmp); for (let k = 0; k < acc.length; k++) acc[k] += Math.pow(10, tmp[k] / 10) / n; }
      for (let k = 0; k < acc.length; k++) acc[k] = 10 * Math.log10(acc[k] + 1e-18);
      mittelSpek = { x: h.x, ver: hoerVer, acc };
    }
    spektrumMalen(mittelSpek.acc, h.rate);
  } else spektrumMalen(null, sr);
  if (!nurBild && !wiedergabe && !scrub) lesungRuhe();
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

function zeichneAlles(nurBild) {
  zeichneWelle();
  if (rec) return;
  zeichneAnalyse(nurBild);
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
    } else if (wiedergabe || scrub) {
      if (wiedergabe && !scrub) f = posF();
      { const sp = view.b - view.a, p = posAufQuelle(f);
        if (!scrub && sp < 0.9999 && src.length && (p < view.a || p > view.b)) { const a0 = Math.max(0, Math.min(1 - sp, p - sp * 0.1)); view = { a: a0, b: a0 + sp }; scrollZeichnen(); } }
      zeichneWelle(); sgStatisch(); zeichneMod();
      anaOut.getFloatFrequencyData(dbLive); spektrumMalen(dbLive, ac.sampleRate);
      const h = hoerbarCache();
      lesungSetzen(yin(h.x, Math.floor(f * h.x.length), h.rate), spitze(dbLive, ac.sampleRate), f * dauer());
      rafId = requestAnimationFrame(tick);
    }
  };
  rafId = requestAnimationFrame(tick);
}

// ---------- Knöpfe ----------
function knoepfe() {
  $('recpunkt').setAttribute('d', rec ? 'M13 13 H27 V27 H13 Z' : 'M12 20 A8 8 0 1 0 28 20 A8 8 0 1 0 12 20 Z');
  $('rec').title = $('rec').ariaLabel = rec ? 'stopp' : 'aufnehmen';
  $('quellewahl').disabled = !!rec;
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
  if (wiedergabe && wiedergabe.motor) motorSenden({ t: 'param', loop: endlos() });
  else if (wiedergabe && !wiedergabe.frei) { f = posF(); wiedergabe.quelle.loop = endlos(); wiedergabe.t0 = ac.currentTime - f * wiedergabe.dur; }
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
  let x0 = null, bewegt = false, pinch = null, lp = false, lpTimer = 0;
  const ptr = new Map();
  const lpAus = () => { clearTimeout(lpTimer); lpTimer = 0; };
  // Quelle (Anteil am Clip) -> Kopf (Anteil an dem, was man hört): innerhalb der Auswahl, rückwärts gespiegelt.
  const welleF = q => { const a = sel ? sel.a : 0, b = sel ? sel.b : 1; let u = Math.min(1, Math.max(0, (q - a) / Math.max(1e-9, b - a))); return P.rueck ? 1 - u : u; };
  const spanV = () => view.b - view.a;
  const qAnteil = e => view.a + anteil(cW, e) * spanV();
  const mitteX = () => { const [p, q] = [...ptr.values()], r = cW.getBoundingClientRect(); return { d: Math.abs(p - q) || 1, m: ((p + q) / 2 - r.left) / r.width }; };
  cW.addEventListener('pointerdown', e => {
    if (rec || !src.length) return;
    cW.setPointerCapture(e.pointerId); ptr.set(e.pointerId, e.clientX);
    if (ptr.size === 2) { lpAus(); if (lp) { lp = false; scrubEnde(); } x0 = null; const m = mitteX(); pinch = { d: m.d, v: { ...view }, anker: view.a + m.m * spanV() }; return; }
    x0 = qAnteil(e); bewegt = false; lp = false;
    // Gedrückt halten: das Band liegt unter dem Finger.
    lpAus(); lpTimer = setTimeout(() => { lpTimer = 0; if (x0 != null && !bewegt && ptr.size === 1) lp = scrubStart(welleF(x0)); }, 250);
  });
  cW.addEventListener('contextmenu', e => { if (lp || lpTimer) e.preventDefault(); });
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
    if (lp) { scrubZu(welleF(q)); return; }
    if (!bewegt && Math.abs(q - x0) / spanV() * cW.clientWidth < 4) return;
    lpAus(); bewegt = true; sel = { a: Math.min(x0, q), b: Math.max(x0, q) }; zeichneWelle(); editKnoepfe();
  });
  const hoch = e => {
    const war = ptr.delete(e.pointerId);
    if (!war) return;
    lpAus();
    if (lp) { lp = false; x0 = null; scrubEnde(); return; }
    if (pinch) { if (ptr.size < 2) pinch = null; x0 = null; return; }
    if (x0 == null) return;
    const q = qAnteil(e);
    if (e.type === 'pointercancel') { x0 = null; return; }
    if (bewegt) { if (sel.b - sel.a < 1e-4) sel = null; planen(); stopQuelle(); knoepfe(); f = 0; zeichneAlles(); }
    else { const had = !!sel; sel = null; if (had) { planen(); stopQuelle(); knoepfe(); } f = P.rueck ? 1 - q : q; if (had) zeichneAlles(); else spulen(f); }
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
  // Spektrogramm und Modulation: Tippen springt, Ziehen scrubbt (der Ton folgt dem Finger, vor und zurück).
  const kratzen = (c, abbild) => {
    let z = null;
    c.addEventListener('pointerdown', e => {
      if (c === cS && malAn) return;
      if (rec || !src.length) return;
      c.setPointerCapture(e.pointerId);
      z = { id: e.pointerId, x: e.clientX, an: false };
      spulen(abbild(anteil(c, e)));
    });
    c.addEventListener('pointermove', e => {
      if (!z || e.pointerId !== z.id) return;
      if (!z.an) { if (Math.abs(e.clientX - z.x) < 3) return; z.an = scrubStart(abbild(anteil(c, e))); return; }
      scrubZu(abbild(anteil(c, e)));
    });
    const los = e => { if (!z || e.pointerId !== z.id) return; const an = z.an; z = null; if (an) scrubEnde(); };
    c.addEventListener('pointerup', los); c.addEventListener('pointercancel', los);
  };
  kratzen(cM, q => modSprung(q));
  kratzen(cS, q => ab === 1 && out && out.leben ? lebenSprung(q) : q);
  cS.addEventListener('pointerdown', e => { if (malAn) malStart(e); });
  cS.addEventListener('pointermove', e => { if (malZug) malZiehen(e); });
  for (const t of ['pointerup', 'pointercancel']) cS.addEventListener(t, malEnde);
})();

// ---------- Panel ----------
const panel = Controls.createPanel({ position: 'left', mobileInitialOpenMode: 'peek' });
const neuPlanen = () => { liveSetzen(); planen(); resetsAbgleichen(); };
const sofortPlanen = () => { liveSetzen(); planen(0); resetsAbgleichen(); };

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
    onChange: v => { P.filter = v; sofortPlanen(); } });
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
  .addToggle('tit', { label: 'Ton im Ton', value: P.tit, onChange: v => { P.tit = v; sofortPlanen(); } })
  .addToggle('bit', { label: '1-Bit', value: P.bit, onChange: v => { P.bit = v; sofortPlanen(); } })
  .addSelect('steig', { label: 'endlos steigend', value: P.steig, options: [
      { value: 'aus', label: 'aus' }, { value: 'ton', label: 'Tonhöhe' }, { value: 'tempo', label: 'Tempo' }],
    onChange: v => { P.steig = v; sofortPlanen(); } })
  .addToggle('leben', { label: 'game of life', value: P.leben, onChange: v => { P.leben = v; sofortPlanen(); } })
  .addToggle('malen', { label: 'malen', value: false, onChange: v => { malAn = v; cS.classList.toggle('malt', v); } })
  .addToggle('krebs', { label: 'Krebs Kanon', value: P.krebs, onChange: v => { P.krebs = v; sofortPlanen(); } })
  .addToggle('rekursiv', { label: 'rekursiv echo', value: P.rekursiv, onChange: v => { P.rekursiv = v; sofortPlanen(); } })
  .addToggle('frei', { label: 'Moment einfrieren', value: P.frei, onChange: v => { const p = wiedergabe ? posF() : f; P.frei = v; resetsAbgleichen(); if (wiedergabe) abspielen(p); else zeichneAlles(); } });

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
// Das Panel meldet beim Ziehen mehrfach je Bild (resize, layout-change auf Panel und Dokument): einmal je Bild zeichnen.
let layoutRaf = 0;
function layout() { if (layoutRaf) return; layoutRaf = requestAnimationFrame(() => { layoutRaf = 0; raumFuerPanel(); sgKey = ''; zeichneAlles(true); if (rec) clearSg(); }); }
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

window.__mic = { planen, E, liveSetzen, get lg() { return lg; }, get wiedergabe() { return wiedergabe; }, get motorLaeuft() { return !!(wiedergabe && wiedergabe.motor && wiedergabe.st); }, get renderMs() { return renderMs; }, get malAn() { return malAn; }, get malStriche() { return malStriche; },
  malen: (ton, bild) => { const z = { bild: bild || [], ton, id: curId, T: null }; malStriche.push(z); return (malKette = malKette.then(() => malEinarbeiten(z))); },
  get f() { return f; }, zurueck, vor, setView, speicherFertig, get view() { return view; }, get clips() { return clips; }, get curId() { return curId; }, get zwischen() { return zwischen; }, get out() { return out; }, get src() { return src; }, get P() { return P; }, get latenzen() { return latenzen; }, get anaOut() { return anaOut; }, get scrub() { return scrub; }, get ac() { return ac; }, get gefroren() { return gefroren(); }, get sel() { return sel; }, set sel(v) { sel = v; zeichneAlles(); editKnoepfe(); }, set f(v) { f = v; zeichneAlles(); }, renderFertig: async () => { if (renderTimer) { clearTimeout(renderTimer); renderTimer = 0; renderOffen = rendern(); } if (renderOffen) await renderOffen; while (sgTeil) await new Promise(r => requestAnimationFrame(r)); } };

})();
