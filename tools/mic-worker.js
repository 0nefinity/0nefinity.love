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

self.onmessage = ev => {
  const { x, rate, s } = ev.data;
  const y = wsola(x, rate, s);
  self.postMessage({ y }, [y.buffer]);
};
