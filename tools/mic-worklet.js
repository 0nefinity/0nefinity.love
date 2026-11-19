class Aufnehmer extends AudioWorkletProcessor {
  process(inputs) {
    const kanaele = inputs[0];
    if (!kanaele || !kanaele.length) return true;
    const n = kanaele[0].length;
    const aus = new Float32Array(n);
    for (let c = 0; c < kanaele.length; c++) {
      const k = kanaele[c];
      for (let i = 0; i < n; i++) aus[i] += k[i] / kanaele.length;
    }
    this.port.postMessage(aus, [aus.buffer]);
    return true;
  }
}
registerProcessor('mic-aufnehmer', Aufnehmer);

// Spieler: Scrubben (Band unter dem Finger) und Moment einfrieren, beides im Audio-Thread, damit jede Bewegung im
// nächsten Block (128 Samples) hörbar ist. Der Puffer kommt einmal, danach nur noch Positionen.
const LN = 2048, HF = 512, B = LN / 2 + 1, TAU = 2 * Math.PI;
const lRev = new Uint16Array(LN), lCos = new Float64Array(LN / 2), lSin = new Float64Array(LN / 2), lWin = new Float64Array(LN), normP = new Float64Array(HF);
for (let i = 0, bits = Math.log2(LN); i < LN; i++) { let r = 0; for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b); lRev[i] = r; }
for (let i = 0; i < LN / 2; i++) { lCos[i] = Math.cos(TAU * i / LN); lSin[i] = -Math.sin(TAU * i / LN); }
for (let i = 0; i < LN; i++) lWin[i] = 0.5 - 0.5 * Math.cos(TAU * i / LN);
for (let k = 0; k < HF; k++) for (let i = k; i < LN; i += HF) normP[k] += lWin[i] * lWin[i];
function fftL(re, im) {
  for (let i = 0; i < LN; i++) { const j = lRev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let len = 2; len <= LN; len <<= 1) {
    const h = len >> 1, step = LN / len;
    for (let i = 0; i < LN; i += len) for (let k = 0; k < h; k++) {
      const wr = lCos[k * step], wi = lSin[k * step], a = i + k, b = a + h;
      const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
      re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
    }
  }
}
function hermite(d, n, pos) {
  const i = Math.floor(pos), t = pos - i;
  const x0 = d[i > 0 ? i - 1 : 0], x1 = d[i], x2 = d[i + 1 < n ? i + 1 : n - 1], x3 = d[i + 2 < n ? i + 2 : n - 1];
  const c1 = 0.5 * (x2 - x0), c2 = x0 - 2.5 * x1 + 2 * x2 - 0.5 * x3, c3 = 0.5 * (x3 - x0) + 1.5 * (x1 - x2);
  return ((c3 * t + c2) * t + c1) * t + x1;
}

class Spieler extends AudioWorkletProcessor {
  constructor() {
    super();
    this.L = null; this.R = null; this.n = 0; this.spitze = 0; this.bit = false; this.bitStand = 1;
    this.modus = 0;                       // 0 still, 1 scrub, 2 frei
    this.env = 0; this.envZiel = 0; this.envD = 1 / (0.008 * sampleRate);
    // Zwei hintereinander geschaltete Tiefpässe (kritisch gedämpft): die Leseposition folgt dem Finger ohne Sprung,
    // ihre Geschwindigkeit ist das Tempo, rückwärts ist rückwärts. Stillhalten ist Stille (Gleichanteil-Filter).
    this.ziel = 0; this.p1 = 0; this.p2 = 0; this.a = 1 - Math.exp(-1 / (0.008 * sampleRate));
    this.dcR = 1 - TAU * 15 / sampleRate; this.dx = [0, 0]; this.dy = [0, 0];
    this.re = new Float64Array(LN); this.im = new Float64Array(LN);
    this.mag = new Float64Array(B); this.dphi = new Float64Array(B); this.ph = new Float64Array(B); this.phA = new Float64Array(B);
    this.ola = new Float64Array(LN); this.blk = new Float32Array(HF); this.bi = HF;
    this.neuC = -1; this.zielRms = 0; this.rs = -1; this.g = -1; this.zufall = 0x018;
    this.port.onmessage = e => this.nachricht(e.data);
  }
  nachricht(m) {
    if (m.t === 'puffer') {
      this.L = m.ch[0]; this.R = m.ch[1] || m.ch[0]; this.n = this.L.length; this.bit = !!m.bit;
      let s = 0; for (const d of m.ch) for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > s) s = v; }
      this.spitze = s;
    } else if (m.t === 'scrub' && this.n) {
      if (this.modus !== 1) { this.p1 = this.p2 = m.von != null ? m.von : m.z; this.dx = [0, 0]; this.dy = [0, 0]; this.env = 0; this.modus = 1; }
      this.ziel = m.z; this.envZiel = 1;
    } else if (m.t === 'frei' && this.n) {
      if (this.modus !== 2) { this.freiStart(m.c); this.env = 0; this.modus = 2; } else this.neuC = m.c;
      this.envZiel = 1;
    } else if (m.t === 'aus') this.envZiel = 0;
    if (m.id != null) this.port.postMessage({ t: 'echo', id: m.id, ct: currentTime });
  }
  mono(j) { return j >= 0 && j < this.n ? 0.5 * (this.L[j] + this.R[j]) : 0; }
  // Betrag gemittelt über drei Nachbarrahmen, Phasenvorschub je Hop aus zwei Rahmen im Abstand HF.
  analyse(c) {
    c = Math.round(c);
    const { re, im, mag, dphi, phA } = this;
    mag.fill(0);
    for (let r = 0; r < 3; r++) {
      const s0 = c - LN / 2 + (r - 1) * HF;
      for (let i = 0; i < LN; i++) { re[i] = this.mono(s0 + i) * lWin[i]; im[i] = 0; }
      fftL(re, im);
      for (let k = 0; k < B; k++) {
        mag[k] += Math.hypot(re[k], im[k]) / 3;
        if (r === 1) phA[k] = Math.atan2(im[k], re[k]);
        else if (r === 2) dphi[k] = Math.atan2(im[k], re[k]) - phA[k];
      }
    }
    let e = 0, m = 0;
    for (let j = Math.max(0, c - LN); j < Math.min(this.n, c + LN); j++) { const v = this.mono(j); e += v * v; m++; }
    this.zielRms = Math.sqrt(e / Math.max(1, m));
  }
  freiStart(c) {
    this.analyse(c); this.ph.set(this.phA); this.ola.fill(0);
    // Drei Hops vorweg: der erste hörbare Block hat schon die volle Überlappung, also sofort volle Lautheit.
    for (let h = 0; h < 3; h++) this.hop();
    this.rs = -1; this.g = -1; this.bi = HF; this.neuC = -1;
  }
  hop() {
    if (this.neuC >= 0) { this.analyse(this.neuC); this.neuC = -1; }
    const { re, im, mag, dphi, ph, ola, blk } = this;
    for (let k = 0; k < B; k++) {
      this.zufall = (this.zufall * 1103515245 + 12345) >>> 0;
      const p = ph[k] = (ph[k] + dphi[k] + 0.25 * (this.zufall / 4294967296 - 0.5)) % TAU;
      re[k] = mag[k] * Math.cos(p); im[k] = -mag[k] * Math.sin(p);
    }
    for (let k = 1; k < LN / 2; k++) { re[LN - k] = re[k]; im[LN - k] = -im[k]; }
    fftL(re, im);
    for (let i = 0; i < LN; i++) ola[i] += re[i] / LN * lWin[i] / normP[i % HF];
    let e = 0;
    for (let i = 0; i < HF; i++) { blk[i] = ola[i]; e += ola[i] * ola[i]; }
    ola.copyWithin(0, HF); ola.fill(0, LN - HF);
    // Lautheit wie die eingefrorene Stelle, Verstärkung gleitet über den Block.
    const r = Math.sqrt(e / HF);
    this.rs = this.rs < 0 ? r : 0.7 * this.rs + 0.3 * r;
    const gn = this.rs > 1e-7 ? Math.min(8, Math.max(0.125, this.zielRms / this.rs)) : 0;
    const g0 = this.g < 0 ? gn : this.g;
    for (let i = 0; i < HF; i++) blk[i] *= g0 + (gn - g0) * i / HF;
    this.g = gn; this.bi = 0;
  }
  process(inputs, outputs) {
    const o = outputs[0], oL = o[0], oR = o[1] || o[0], N = oL.length;
    if (!this.modus || !this.n) return true;
    const { L, R, n, a, dcR, dx, dy } = this, hoch = n - 1.000001;
    const sw = 0.02 * this.spitze, hh = this.spitze;
    for (let i = 0; i < N; i++) {
      if (this.env < this.envZiel) this.env = Math.min(this.envZiel, this.env + this.envD);
      else if (this.env > this.envZiel) this.env = Math.max(this.envZiel, this.env - this.envD);
      let vl, vr;
      if (this.modus === 1) {
        this.p1 += a * (this.ziel - this.p1); this.p2 += a * (this.p1 - this.p2);
        const pos = this.p2 < 0 ? 0 : this.p2 > hoch ? hoch : this.p2;
        const xl = hermite(L, n, pos), xr = R === L ? xl : hermite(R, n, pos);
        vl = dy[0] = xl - dx[0] + dcR * dy[0]; dx[0] = xl;
        vr = dy[1] = xr - dx[1] + dcR * dy[1]; dx[1] = xr;
      } else {
        if (this.bi >= HF) this.hop();
        let v = this.blk[this.bi++];
        if (this.bit) { if (v > sw) this.bitStand = 1; else if (v < -sw) this.bitStand = 0; v = this.bitStand ? hh : -hh; }
        vl = vr = v > 0.99 ? 0.99 : v < -0.99 ? -0.99 : v;
      }
      oL[i] = vl * this.env; if (oR !== oL) oR[i] = vr * this.env;
    }
    if (this.env === 0 && this.envZiel === 0) this.modus = 0;
    return true;
  }
}
registerProcessor('mic-spieler', Spieler);

// Motor: Tempo und Tonhöhe unabhängig voneinander, live. WSOLA im Audio-Thread: Körner von G Samples, halb
// überlappend (Hann periodisch, Summe genau 1). Jedes Korn liest mit der Tonhöhe p, rückt mit dem Tempo t vor und
// sucht sich in ±10 ms die Stelle, die zum vorigen Korn passt. t = p = 1 ist genau der Clip, Sample für Sample.
const G = 2048, HA = G / 2, gWin = new Float32Array(G);
for (let i = 0; i < G; i++) gWin[i] = 0.5 - 0.5 * Math.cos(TAU * i / G);
class Motor extends AudioWorkletProcessor {
  constructor(o) {
    super();
    const q = (o && o.processorOptions) || {};
    this.x = new Float32Array(0); this.n = 0;
    this.t = 1; this.p = 1; this.loop = false; this.tailN = 0;
    this.an = false; this.env = 0; this.envZiel = 0; this.envD = 1 / (0.004 * sampleRate);
    this.acc = new Float64Array(G); this.ai = HA; this.kopf = 0; this.nom = 0; this.s = 0; this.nach = -1;
    this.wartet = null; this.blk = 0; this.gen = 0; this.suchR = Math.round(0.01 * sampleRate); this.tpl = new Float64Array(HA);
    if (q.x) this.puffer(q.x);
    this.setzen(q);
    if (q.spiel) this.spiel(q.spiel);
    this.port.onmessage = e => this.nachricht(e.data);
  }
  puffer(x) { this.x = x; this.n = x.length; }
  setzen(m) {
    if (m.tempo != null) this.t = Math.max(0.01, m.tempo);
    if (m.p != null) this.p = m.p;
    if (m.loop != null) this.loop = !!m.loop;
    if (m.tailN != null) this.tailN = Math.max(0, m.tailN);
  }
  spiel(m) {
    this.setzen(m);
    const ziel = { pos: Math.min(Math.max(0, Math.round(m.pos || 0)), this.n), nach: m.nach != null ? m.nach : -1, gen: m.gen };
    if (this.an && this.env > 0 && !m.sofort) { this.wartet = ziel; this.envZiel = 0; return; }
    this.start(ziel); this.an = true; this.env = m.sofort ? 1 : 0; this.envZiel = 1;
  }
  nachricht(m) {
    if (m.t === 'puffer') this.puffer(m.x);
    else if (m.t === 'param') this.setzen(m);
    else if (m.t === 'spiel') this.spiel(m);
    else if (m.t === 'aus') { this.envZiel = 0; this.wartet = null; }
    if (m.id != null) this.port.postMessage({ t: 'echo', id: m.id, ct: currentTime });
  }
  lies(pos) {
    const d = this.x, n = this.n, i = Math.floor(pos);
    if (i < -1 || i >= n) return 0;
    const t = pos - i, x1 = i >= 0 ? d[i] : 0;
    if (t === 0) return x1;
    const x0 = i > 0 ? d[i - 1] : 0, x2 = i + 1 < n ? d[i + 1] : 0, x3 = i + 2 < n ? d[i + 2] : 0;
    const c1 = 0.5 * (x2 - x0), c2 = x0 - 2.5 * x1 + 2 * x2 - 0.5 * x3, c3 = 0.5 * (x3 - x0) + 1.5 * (x1 - x2);
    return ((c3 * t + c2) * t + c1) * t + x1;
  }
  nah(pos) { const i = Math.round(pos); return i >= 0 && i < this.n ? this.x[i] : 0; }
  // Korn mit Quellmitte s, Mitte bei acc[mitte]; nur der Teil, der in acc liegt.
  korn(s, mitte) {
    const p = this.p, acc = this.acc, j0 = Math.max(0, HA - mitte), j1 = Math.min(G, G + HA - mitte);
    for (let j = j0; j < j1; j++) acc[mitte - HA + j] += gWin[j] * this.lies(s + p * (j - HA));
  }
  // Verschiebung d, mit der das neue Korn (Nennmitte sNom) das vorige (Mitte sL) am besten fortsetzt.
  suche(sL, sNom) {
    const p = this.p, tp = this.tpl, R = this.suchR, basis = sNom - p * HA;
    let ea = 0;
    for (let m = 0; m < HA; m++) { const v = this.nah(sL + p * m); tp[m] = v; ea += v * v; }
    if (ea < 1e-12) return 0;
    const korr = (d, st) => {
      let ab = 0, bb = 0;
      for (let m = 0; m < HA; m += st) { const v = this.nah(basis + d + p * m); ab += tp[m] * v; bb += v * v; }
      return bb > 1e-12 ? ab / Math.sqrt(bb) : -Infinity;
    };
    let best = 0, bv = korr(0, 4);
    for (let d = -R; d <= R; d += 8) { if (d === 0) continue; const v = korr(d, 4); if (v > bv + 1e-9 * Math.abs(bv)) { bv = v; best = d; } }
    let fein = best; bv = korr(best, 1);
    for (let d = best - 7; d <= best + 7; d++) { if (d === best) continue; const v = korr(d, 1); if (v > bv + 1e-9 * Math.abs(bv)) { bv = v; fein = d; } }
    return fein;
  }
  start(z) {
    this.acc.fill(0);
    if (z.gen != null) this.gen = z.gen;
    this.kopf = this.nom = this.s = z.pos;
    this.korn(z.pos, 0);
    this.nom = z.pos + this.t * HA;
    this.s = this.nom + this.suche(z.pos, this.nom);
    this.korn(this.s, HA);
    this.ai = 0; this.nach = z.pos >= this.n ? Math.max(0, z.nach) : -1;
  }
  schritt() {
    const acc = this.acc;
    acc.copyWithin(0, HA); acc.fill(0, HA);
    this.kopf = this.nom;
    this.nom += this.t * HA;
    const s = this.nom + this.suche(this.s, this.nom);
    this.korn(s, HA); this.s = s; this.ai = 0;
  }
  process(_, outputs) {
    const o = outputs[0][0], N = o.length;
    if (this.an) {
      for (let i = 0; i < N; i++) {
        if (this.env < this.envZiel) this.env = Math.min(this.envZiel, this.env + this.envD);
        else if (this.env > this.envZiel) this.env = Math.max(this.envZiel, this.env - this.envD);
        if (this.env === 0 && this.envZiel === 0) {
          if (!this.wartet) { this.an = false; break; }
          this.start(this.wartet); this.wartet = null; this.envZiel = 1;
        }
        if (this.ai >= HA) this.schritt();
        o[i] = this.acc[this.ai++] * this.env;
        if (this.nach < 0) { if (this.kopf + this.t * this.ai >= this.n) this.nach = 0; }
        else if (++this.nach >= this.tailN) {
          // Das Ende der Schleife ist ihre 0.
          if (this.loop) this.start({ pos: 0, nach: -1 });
          else { this.an = false; this.env = this.envZiel = 0; this.port.postMessage({ t: 'ende', gen: this.gen }); break; }
        }
      }
    }
    if ((++this.blk & 3) === 0 && this.an) this.port.postMessage({ t: 'stand', pos: this.kopf + this.t * this.ai, nach: this.nach, ct: currentTime, gen: this.gen });
    return true;
  }
}
registerProcessor('mic-motor', Motor);

// Ende der Kette: 1-Bit live. Jeder Wert wird oben oder unten, Schwelle und Höhe aus der Spitze S des Clips
// (mal Pegel), damit es genau zwei Werte gibt, live wie im Export. Aus: unverändert durch.
class Ende extends AudioWorkletProcessor {
  constructor(o) {
    super();
    const q = (o && o.processorOptions) || {};
    this.bit = !!q.bit; this.S = q.S || 0; this.b = [1, 1];
    this.port.onmessage = e => {
      const m = e.data;
      if (m.bit != null) this.bit = !!m.bit;
      if (m.S != null) this.S = m.S;
      if (m.id != null) this.port.postMessage({ t: 'echo', id: m.id, ct: currentTime });
    };
  }
  process(inputs, outputs) {
    const ein = inputs[0], aus = outputs[0], N = aus[0].length;
    const sw = 0.02 * this.S, h = 0.3 * Math.min(1, this.S);
    for (let c = 0; c < aus.length; c++) {
      const x = ein[c] || ein[0], y = aus[c];
      if (!this.bit) { if (x) y.set(x); continue; }
      let b = this.b[c];
      for (let i = 0; i < N; i++) { const v = x ? x[i] : 0; if (v > sw) b = 1; else if (v < -sw) b = 0; y[i] = b ? h : -h; }
      this.b[c] = b;
    }
    return true;
  }
}
registerProcessor('mic-ende', Ende);
