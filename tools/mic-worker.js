// WSOLA: Dehnung um Faktor s ohne Tonhöhenänderung. Läuft im Worker, damit lange Clips die Seite nicht anhalten.
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
  return y.slice(0, Math.round(x.length * s));
}

// ---------- 0n: Ton im Ton, endlos steigend ----------
function spitzeVon(x) { let m = 0; for (let i = 0; i < x.length; i++) { const v = Math.abs(x[i]); if (v > m) m = v; } return m; }
function aufSpitze(y, ziel) { const m = spitzeVon(y); if (m > 0 && ziel > 0) { const g = ziel / m; for (let i = 0; i < y.length; i++) y[i] *= g; } return y; }

// Ton im Ton: jede Ebene ist der ganze Clip noch einmal, halb so lang und eine Oktave höher, 2^k-mal hintereinander.
// Tief genug unten wiederholt sich der Clip so schnell, dass er selbst zum Ton wird.
function tonImTon(x, rate) {
  const n = x.length, y = Float32Array.from(x);
  let ebene = x, g = 1;
  for (let k = 1; ebene.length >> 1 >= 32; k++) {
    const h = new Float32Array(ebene.length >> 1);
    for (let i = 0; i < h.length; i++) h[i] = 0.5 * (ebene[2 * i] + ebene[2 * i + 1]);
    ebene = h; g *= 0.7;
    const m = h.length, rand = Math.max(1, Math.min(m >> 3, Math.round(0.002 * rate)));
    const kachel = Float32Array.from(h);
    for (let i = 0; i < rand; i++) { const w = i / rand; kachel[i] *= w; kachel[m - 1 - i] *= w; }
    for (let i = 0; i < n; i++) y[i] += g * kachel[i % m];
  }
  return aufSpitze(y, spitzeVon(x));
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

self.onmessage = ev => {
  const { op, x, rate, s } = ev.data;
  const y = op === 'tit' ? tonImTon(x, rate) : op === 'ton' ? steigTon(x, rate) : op === 'tempo' ? steigTempo(x, rate) : wsola(x, rate, s);
  self.postMessage({ y }, [y.buffer]);
};
