// ---------- 0n: Ton im Ton, endlos steigend ----------
function spitzeVon(x) { let m = 0; for (let i = 0; i < x.length; i++) { const v = Math.abs(x[i]); if (v > m) m = v; } return m; }
function aufSpitze(y, ziel) { const m = spitzeVon(y); if (m > 0 && ziel > 0) { const g = ziel / m; for (let i = 0; i < y.length; i++) y[i] *= g; } return y; }

// Ton im Ton: jede Ebene ist der ganze Clip noch einmal, halb so lang und eine Oktave höher, 2^k-mal hintereinander.
// Tief genug unten wiederholt sich der Clip so schnell, dass er selbst zum Ton wird.
function tonImTon(x, rate, zusatz = {}) {
  const n = x.length, y = Float32Array.from(x);
  let ebene = x, g = 1;
  const ebenen = zusatz.ebenen = [umriss(x)];
  for (let k = 1; ebene.length >> 1 >= 32; k++) {
    const h = new Float32Array(ebene.length >> 1);
    for (let i = 0; i < h.length; i++) h[i] = 0.5 * (ebene[2 * i] + ebene[2 * i + 1]);
    ebene = h; g *= 0.7; ebenen.push(umriss(h));
    const m = h.length, rand = Math.max(1, Math.min(m >> 3, Math.round(0.002 * rate)));
    const kachel = Float32Array.from(h);
    for (let i = 0; i < rand; i++) { const w = i / rand; kachel[i] *= w; kachel[m - 1 - i] *= w; }
    for (let i = 0; i < n; i++) y[i] += g * kachel[i % m];
  }
  return aufSpitze(y, spitzeVon(x));
}

// Umriss einer Ebene (min/max in B Fächern): daraus zeichnet die Seite den Zoom, aus derselben Pyramide, die klingt.
function umriss(e, B = 512) {
  const mn = new Float32Array(B), mx = new Float32Array(B), per = e.length / B;
  for (let b = 0; b < B; b++) {
    const a = Math.floor(b * per), z = Math.max(a + 1, Math.floor((b + 1) * per));
    let lo = 0, hi = 0; for (let i = a; i < z && i < e.length; i++) { const v = e[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
    mn[b] = lo; mx[b] = hi;
  }
  return { mn, mx };
}

// Endlos steigend: V Stimmen im Oktavabstand, alle steigen; was oben leise verschwindet, kommt unten leise wieder herein.
// Über die Cliplänge steigt es um ganze Oktaven, damit die Schleife nahtlos weiter steigt.
const V = 4;
const huelle = u => 0.5 - 0.5 * Math.cos(2 * Math.PI * u / V);
function oktavenProClip(n, rate) { return Math.max(1, Math.round(n / rate / 3)); }

// Tonhöhe: Granular-Pitchshift mit zwei Lesezeigern (sin²-Überblendung), Verhältnis gleitet stetig.
function steigTon(x, rate) {
  const n = x.length, y = new Float32Array(n), O = oktavenProClip(n, rate), G = Math.max(64, Math.round(0.05 * rate));
  const lies = t => { if (t < 0) return 0; const i = Math.floor(t), fr = t - i; return i + 1 < n ? x[i] * (1 - fr) + x[i + 1] * fr : 0; };
  for (let v = 0; v < V; v++) {
    let d = 0;
    for (let i = 0; i < n; i++) {
      const u = (v + O * i / n) % V, r = Math.pow(2, u - V / 2), a = huelle(u);
      d -= r - 1; d = ((d % G) + G) % G;
      const d2 = (d + G / 2) % G, w1 = Math.sin(Math.PI * d / G) ** 2, w2 = 1 - w1;
      y[i] += a * (w1 * lies(i - d) + w2 * lies(i - d2));
    }
  }
  return aufSpitze(y, spitzeVon(x));
}

// Tempo (Risset-Rhythmus): jede Stimme liest den Clip doppelt so schnell wie die darunter, Körner in Originaltonhöhe.
// Wer oben herausfällt, steigt unten mit halber Position der neuen Nachbarin wieder ein: der Takt bleibt verzahnt.
// Achilles und die Schildkröte: jede Stimme ist doppelt so schnell wie die vor ihr, und keine kommt je an.
function steigTempo(x, rate) {
  const n = x.length, y = new Float32Array(n), O = oktavenProClip(n, rate);
  const N = 2 * Math.max(32, Math.round(0.03 * rate)), H = N / 2, win = new Float32Array(N);
  for (let j = 0; j < N; j++) win[j] = 0.5 - 0.5 * Math.cos(2 * Math.PI * j / N);
  const pos = new Float64Array(V), uAlt = new Float64Array(V).fill(-1);
  for (let t = 0; t < n; t += H) {
    for (let v = 0; v < V; v++) {
      const u = (v + O * t / n) % V;
      if (u < uAlt[v]) pos[v] = pos[(v + 1) % V] / 2;
      uAlt[v] = u;
      const a = huelle(u), s0 = Math.floor(pos[v]);
      for (let j = 0; j < N && t + j < n; j++) y[t + j] += a * win[j] * x[(s0 + j) % n];
      pos[v] += Math.pow(2, u - V / 2) * H;
    }
  }
  return aufSpitze(y, spitzeVon(x));
}

// ---------- 0n: Spektrogramm (game of life, malen) ----------
// Frequenzachse wie das Spektrogramm der Seite: logarithmisch von SF0 bis min(SF1, rate/2).
const SF0 = 30, SF1 = 16000;
const hoch = rate => Math.min(SF1, rate / 2);
const hzVon = (v, rate) => SF0 * Math.pow(hoch(rate) / SF0, v);

const LN = 2048, LH = 256;
const lRev = new Uint16Array(LN), lCos = new Float64Array(LN / 2), lSin = new Float64Array(LN / 2), lWin = new Float64Array(LN);
for (let i = 0, bits = Math.log2(LN); i < LN; i++) { let r = 0; for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b); lRev[i] = r; }
for (let i = 0; i < LN / 2; i++) { lCos[i] = Math.cos(2 * Math.PI * i / LN); lSin[i] = -Math.sin(2 * Math.PI * i / LN); }
for (let i = 0; i < LN; i++) lWin[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / LN);
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

// Oszillator mit Hüllkurve je Spalte (linear zwischen Spaltenmitten), Phase per Drehung statt Math.sin je Wert.
function oszillator(y, o, n, hz, rate, amp, spalten, phase) {
  const K = amp.length, dw = 2 * Math.PI * hz / rate, cr = Math.cos(dw), si = Math.sin(dw);
  let c = Math.cos(phase), s = Math.sin(phase);
  const mitte = j => Math.round((j + 0.5) * n / spalten);
  for (let j = -1; j < K; j++) {
    const a0 = amp[Math.max(0, j)], a1 = amp[Math.min(K - 1, j + 1)];
    const s0 = j < 0 ? 0 : mitte(j), s1 = j + 1 >= K ? n : mitte(j + 1);
    if (s1 <= s0) continue;
    if (a0 === 0 && a1 === 0) { const d = (s1 - s0) * dw; const c2 = Math.cos(d), s2 = Math.sin(d); [c, s] = [c * c2 - s * s2, c * s2 + s * c2]; continue; }
    const da = (a1 - a0) / (s1 - s0);
    for (let i = s0, a = a0; i < s1; i++, a += da) { y[o + i] += a * s; const t = c * cr - s * si; s = c * si + s * cr; c = t; }
    const r = 1 / Math.hypot(c, s); c *= r; s *= r;
  }
  return Math.atan2(s, c);
}

// Game of Life im Spektrogramm: die Bänder des Clips sind die Zellen (Zeilen = Frequenz, Spalten = Zeit).
// Generation 0 ist der Clip selbst; jede weitere Generation spielt den Clip noch einmal durch ihre Welt:
// lebende Zellen lassen den Clip durch, tote schweigen, neu geborene singen in ihrer Bandfrequenz.
const LR = 48, LC = 96;
function leben(x, rate, zusatz = {}) {
  const n = x.length, dur = n / rate, hi = hoch(rate);
  // Kurze Clips: eine Generation = ein Durchlauf. Lange: eine Generation alle 2,5 s, der Clip läuft weiter,
  // Ausgabe höchstens so lang wie der Clip oder 30 s. So hat jede Welt Zeit, sich zu entwickeln.
  let G, D;
  if (dur <= 2.5) { D = n; G = Math.max(2, Math.min(32, Math.round(30 / Math.max(dur, 0.05)))); }
  else { const T = Math.max(n, Math.round(30 * rate)); G = Math.max(12, Math.min(64, Math.round(T / (2.5 * rate)))); D = Math.ceil(T / G); }
  const F = Math.ceil(n / LH) + 1, B = LN / 2 + 1;
  const re = new Float64Array(LN), im = new Float64Array(LN);
  const band = new Int16Array(B), spalteVon = fr => Math.min(LC - 1, Math.max(0, Math.floor(fr * LH / n * LC)));
  for (let k = 0; k < B; k++) { const hz = k * rate / LN; band[k] = hz < SF0 || hz > hi ? -1 : Math.min(LR - 1, Math.floor(LR * Math.log(hz / SF0) / Math.log(hi / SF0))); }
  const E = new Float64Array(LC * LR), zahl = new Float64Array(LC * LR);
  for (let fr = 0; fr < F; fr++) {
    const s0 = fr * LH - LN / 2;
    for (let i = 0; i < LN; i++) { const j = s0 + i; re[i] = j >= 0 && j < n ? x[j] * lWin[i] : 0; im[i] = 0; }
    fftL(re, im);
    const c = spalteVon(fr);
    for (let k = 0; k < B; k++) {
      if (band[k] >= 0) { const z = c * LR + band[k]; E[z] += Math.hypot(re[k], im[k]); zahl[z]++; }
    }
  }
  let eMax = 0;
  for (let z = 0; z < E.length; z++) { if (zahl[z]) E[z] /= zahl[z]; if (E[z] > eMax) eMax = E[z]; }
  const voll = Array.from(E).filter(v => v > 0).sort((a, b) => a - b);
  const schwelle = Math.max(voll.length ? voll[Math.floor(voll.length * 0.65)] : 0, 0.08 * eMax, 1e-9);

  // Welten: Uint8 je Generation, Torus (der Rand der Zeit grenzt an ihren Anfang, die tiefste Frequenz an die höchste).
  const welten = new Uint8Array(G * LC * LR), saat = new Uint8Array(LC * LR);
  for (let z = 0; z < saat.length; z++) saat[z] = E[z] >= schwelle ? 1 : 0;
  welten.set(saat, 0);
  for (let g = 1; g < G; g++) {
    const alt = welten.subarray((g - 1) * LC * LR, g * LC * LR), neu = welten.subarray(g * LC * LR, (g + 1) * LC * LR);
    let lebt = 0;
    for (let c = 0; c < LC; c++) for (let r = 0; r < LR; r++) {
      let nb = 0;
      for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) if (dc || dr) nb += alt[((c + dc + LC) % LC) * LR + (r + dr + LR) % LR];
      const z = c * LR + r, v = nb === 3 || (nb === 2 && alt[z]) ? 1 : 0;
      neu[z] = v; lebt += v;
    }
    // Stirbt die Welt aus oder erstarrt sie, sät der Clip sie neu: Leben kommt aus dem, was klingt.
    const vor2 = g >= 2 ? welten.subarray((g - 2) * LC * LR, (g - 1) * LC * LR) : null;
    let gleich = true, gleich2 = !!vor2;
    for (let z = 0; z < neu.length && (gleich || gleich2); z++) { if (neu[z] !== alt[z]) gleich = false; if (vor2 && neu[z] !== vor2[z]) gleich2 = false; }
    if (!lebt || gleich || gleich2) for (let z = 0; z < neu.length; z++) neu[z] |= saat[z];
  }

  // Klang: eine gleichmäßige STFT über die ganze Ausgabe. Der Clip läuft im Kreis (Lesezeiger mod n),
  // die Welt wechselt alle D Samples; Maske aus der Welt, dazu Töne der Neugeborenen.
  const L = G * D, y = new Float32Array(L), normP = new Float64Array(LH);
  for (let k = 0; k < LH; k++) for (let i = k; i < LN; i += LH) normP[k] += lWin[i] * lWin[i];
  const spitze = spitzeVon(x) || 1, fz = new Float64Array(LR), phase = new Float64Array(LR);
  for (let r = 0; r < LR; r++) fz[r] = hzVon((r + 0.5) / LR, rate);
  const mod = (a, m) => ((a % m) + m) % m;
  for (let fr = -LN / LH / 2; fr * LH - LN / 2 < L; fr++) {
    const o = fr * LH, s0 = o - LN / 2, g = Math.max(0, Math.min(G - 1, Math.floor(o / D)));
    const w = welten.subarray(g * LC * LR, (g + 1) * LC * LR);
    const u = mod(o, n) / n * LC - 0.5, fu = Math.floor(u), c0 = mod(fu, LC), c1 = (c0 + 1) % LC, t = u - fu;
    let still = true;
    for (let r = 0; r < LR && still; r++) if (w[c0 * LR + r] || w[c1 * LR + r]) still = false;
    if (still) continue;
    // Spektrum je Rahmen neu statt gespeichert: der Speicher bleibt klein, egal wie lang der Clip ist.
    for (let i = 0; i < LN; i++) { re[i] = x[mod(s0 + i, n)] * lWin[i]; im[i] = 0; }
    fftL(re, im);
    for (let k = 0; k < B; k++) {
      const r = band[k], m = r < 0 ? 0 : w[c0 * LR + r] * (1 - t) + w[c1 * LR + r] * t;
      re[k] *= m; im[k] *= m;
    }
    for (let k = 1; k < LN / 2; k++) { re[LN - k] = re[k]; im[LN - k] = -im[k]; }
    for (let k = 0; k < LN; k++) im[k] = -im[k];
    fftL(re, im);
    for (let i = 0; i < LN; i++) { const j = s0 + i; if (j >= 0 && j < L) y[j] += re[i] / LN * lWin[i] / normP[i % LH]; }
  }
  const K2 = Math.max(2, Math.round(LC * D / n)), amp = new Float32Array(K2), lebend = new Float32Array(LC);
  for (let g = 0; g < G; g++) {
    const w = welten.subarray(g * LC * LR, (g + 1) * LC * LR);
    for (let c = 0; c < LC; c++) { let l = 0; for (let q = 0; q < LR; q++) l += w[c * LR + q]; lebend[c] = l; }
    for (let r = 0; r < LR; r++) {
      let jemand = false;
      for (let j = 0; j < K2; j++) {
        const c = Math.min(LC - 1, Math.floor(mod(g * D + (j + 0.5) * D / K2, n) / n * LC)), z = c * LR + r;
        amp[j] = w[z] && E[z] < schwelle ? 0.35 * spitze / Math.sqrt(lebend[c]) : 0; if (amp[j]) jemand = true;
      }
      if (jemand) phase[r] = oszillator(y, g * D, D, fz[r], rate, amp, K2, phase[r]);
      else phase[r] += 2 * Math.PI * fz[r] * D / rate;
    }
  }
  zusatz.welten = welten; zusatz.G = G; zusatz.C = LC; zusatz.R = LR; zusatz.D = D / n;
  return aufSpitze(y, spitze);
}

// Malen: Striche (u = Anteil am Clip, v = Höhe im Spektrogramm, 0 unten) werden zu Sinustönen auf genau der Frequenz,
// auf der sie im Spektrogramm liegen. Was man hineinmalt, malt das Spektrogramm wieder heraus.
const MR = 256;
function malen(x, rate, striche) {
  const n = x.length, T = Math.max(32, Math.min(4096, Math.round(n / rate * 200)));
  const tinte = new Float32Array(MR * T);
  const tupfen = (u, v) => {
    const cx = u * T - 0.5, cy = v * (MR - 1);
    for (let r = Math.floor(cy - 1.5); r <= Math.ceil(cy + 1.5); r++) for (let c = Math.floor(cx - 1); c <= Math.ceil(cx + 1); c++) {
      if (r < 0 || r >= MR || c < 0 || c >= T) continue;
      const d = ((r - cy) / 1.1) ** 2 + ((c - cx) / 1.2) ** 2, w = Math.max(0, 1 - d);
      if (w > tinte[r * T + c]) tinte[r * T + c] = w;
    }
  };
  for (const s of striche) {
    if (s.length < 2) continue;
    tupfen(s[0], s[1]);
    for (let i = 2; i + 1 < s.length; i += 2) {
      const du = (s[i] - s[i - 2]) * T, dv = (s[i + 1] - s[i - 1]) * (MR - 1), k = Math.max(1, Math.ceil(Math.hypot(du, dv) * 2));
      for (let j = 1; j <= k; j++) tupfen(s[i - 2] + (s[i] - s[i - 2]) * j / k, s[i - 1] + (s[i + 1] - s[i - 1]) * j / k);
    }
  }
  const p = new Float32Array(n), amp = new Float32Array(T);
  for (let r = 0; r < MR; r++) {
    let jemand = false;
    for (let c = 0; c < T; c++) { amp[c] = tinte[r * T + c]; if (amp[c]) jemand = true; }
    if (jemand) oszillator(p, 0, n, hzVon(r / (MR - 1), rate), rate, amp, T, r * 2.399963);
  }
  const sx = spitzeVon(x), sp = spitzeVon(p);
  if (sp > 0) { const g = Math.max(0.5 * sx, 0.25) / sp; for (let i = 0; i < n; i++) p[i] = x[i] + g * p[i]; } else p.set(x);
  const sy = spitzeVon(p);
  return sy > 0.99 ? aufSpitze(p, 0.99) : p;
}

// Moment einfrieren: das Spektrum an der Stelle p (Anteil am Clip) klingt weiter, jede Teilfrequenz dreht ihre
// Phase im eigenen Tempo, ein Hauch Zufall hält es lebendig. Tempo und Zufall sind so gerundet, dass nach L Samples
// jede Phase genau dort steht, wo sie anfing: der Moment ist ein Kreis, der Loop hat keine Naht und braucht keine Blende.
function einfrieren(x, rate, p) {
  const n = x.length, HF = LH * 2, nH = Math.max(8, Math.round(4 * rate / HF)), L = nH * HF;
  const c = Math.round(p * n), B = LN / 2 + 1, TAU = 2 * Math.PI;
  const re = new Float64Array(LN), im = new Float64Array(LN), mag = new Float64Array(B), dphi = new Float64Array(B), ph0 = new Float64Array(B);
  const rahmen = s0 => { for (let i = 0; i < LN; i++) { const j = s0 + i; re[i] = j >= 0 && j < n ? x[j] * lWin[i] : 0; im[i] = 0; } fftL(re, im); };
  // Betrag gemittelt über drei Nachbarrahmen, Phasenvorschub aus zwei Rahmen im Abstand HF.
  for (const d of [-HF, 0, HF]) { rahmen(c - LN / 2 + d); for (let k = 0; k < B; k++) mag[k] += Math.hypot(re[k], im[k]) / 3; }
  rahmen(c - LN / 2); for (let k = 0; k < B; k++) ph0[k] = Math.atan2(im[k], re[k]);
  rahmen(c - LN / 2 + HF);
  for (let k = 0; k < B; k++) { const d = Math.atan2(im[k], re[k]) - ph0[k]; dphi[k] = TAU * Math.round(d * nH / TAU) / nH; }
  // Zufall als Irrfahrt, die zu sich zurückkehrt (Mittel abgezogen): Summe über den Kreis = 0.
  let zufall = 0x018;
  const wuerfel = () => { zufall = (zufall * 1103515245 + 12345) >>> 0; return zufall / 4294967296 - 0.5; };
  const irr = new Float32Array(B * nH);
  for (let k = 0; k < B; k++) {
    let m = 0; for (let h = 0; h < nH; h++) { const w = 0.25 * wuerfel(); irr[k * nH + h] = w; m += w; }
    m /= nH; let acc = 0; for (let h = 0; h < nH; h++) { acc += irr[k * nH + h] - m; irr[k * nH + h] = acc; }
  }
  const Y = L + 2 * LN, y = new Float32Array(Y + LN), normP = new Float64Array(HF);
  for (let k = 0; k < HF; k++) for (let i = k; i < LN; i += HF) normP[k] += lWin[i] * lWin[i];
  for (let h = 0, o = 0; o < Y; h++, o += HF) {
    const hh = h % nH;
    for (let k = 0; k < B; k++) { const f = ph0[k] + hh * dphi[k] + irr[k * nH + hh]; re[k] = mag[k] * Math.cos(f); im[k] = mag[k] * Math.sin(f); }
    for (let k = 1; k < LN / 2; k++) { re[LN - k] = re[k]; im[LN - k] = -im[k]; }
    for (let k = 0; k < LN; k++) im[k] = -im[k];
    fftL(re, im);
    for (let i = 0; i < LN; i++) y[o + i] += re[i] / LN * lWin[i] / normP[i % HF];
  }
  // Ab LN ist das Fenster eingeschwungen; ein Kreisumlauf von dort.
  const z = y.slice(LN, LN + L);
  // Lautheit wie die eingefrorene Stelle (RMS über ein Fenster), Spitze unter 1.
  let e = 0, m = 0; for (let i = Math.max(0, c - LN); i < Math.min(n, c + LN); i++) { e += x[i] * x[i]; m++; }
  let ez = 0; for (let i = 0; i < L; i++) ez += z[i] * z[i];
  const ziel = Math.sqrt(e / Math.max(1, m)), ist = Math.sqrt(ez / L);
  if (ist > 1e-9) { const g = ziel / ist; for (let i = 0; i < L; i++) z[i] *= g; }
  return spitzeVon(z) > 0.99 ? aufSpitze(z, 0.99) : z;
}

self.onmessage = ev => {
  const { op, x, rate, striche, p } = ev.data, zusatz = {};
  const y = op === 'tit' ? tonImTon(x, rate, zusatz) : op === 'ton' ? steigTon(x, rate) : op === 'tempo' ? steigTempo(x, rate)
    : op === 'leben' ? leben(x, rate, zusatz) : op === 'malen' ? malen(x, rate, striche) : op === 'frei' ? einfrieren(x, rate, p) : null;
  if (!y) throw new Error('op ' + op);
  self.postMessage({ y, zusatz }, [y.buffer]);
};
