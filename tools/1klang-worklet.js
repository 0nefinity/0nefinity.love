// AudioWorklet for 1klang.html. The formula is evaluated here, never on the page's main thread:
// the worklet scope has no DOM, no fetch, no storage. It is checked against a whitelist
// before it is compiled, so a shared URL can only ever run arithmetic.
//
// Formula language 1 (default): fractions. "1 - 1/4" takes the last quarter of every beat away,
// "1 - 1/4 alle 4" the last quarter of every 4 beats (= every 4th beat), several terms subtract.
// Formula language 2 (anything else): arithmetic in t (seconds), p (position in the beat), n (beat number), f.
//
// carrier on:  sound = wave(f) * clamp(formula, 0, 1)   (1 = the tone, taking away makes gaps)
// carrier off: sound = clamp(formula, -1, 1)            (the formula is the membrane itself)

const MATH = {
  pi: Math.PI, e: Math.E,
  sin: Math.sin, cos: Math.cos, tan: Math.tan, abs: Math.abs, exp: Math.exp, log: Math.log,
  floor: Math.floor, ceil: Math.ceil, round: Math.round, sqrt: Math.sqrt, pow: Math.pow,
  min: Math.min, max: Math.max, sign: Math.sign,
  fract: x => x - Math.floor(x),
  rnd: x => { const s = Math.sin(x * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); },
};
const VARS = ['t', 'p', 'n', 'f'];
const NAMES = new Set([...Object.keys(MATH), ...VARS]);
const MAX_LEN = 400;

const FRAC_TERM = String.raw`\s*-\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)(?:\s+alle\s+(\d+(?:\.\d+)?))?`;
const FRAC_ALL = new RegExp('^\\s*1(?:' + FRAC_TERM + ')*\\s*$', 'i');

// "1 - 1/4 - 1/16 alle 4" -> { terms: [{ r: 0.25, N: 1 }, { r: 0.0625, N: 4 }] }, or { error } / null (not a fraction formula)
function fractions(src) {
  if (!FRAC_ALL.test(src)) return null;
  const terms = [];
  const re = new RegExp(FRAC_TERM, 'gi');
  let m;
  while ((m = re.exec(src.replace(/^\s*1/, ''))) !== null) {
    const a = parseFloat(m[1]), b = parseFloat(m[2]), N = m[3] === undefined ? 1 : parseFloat(m[3]);
    if (b === 0) return { error: 'durch 0' };
    if (N === 0) return { error: 'alle 0' };
    if (a > 0) terms.push({ r: Math.min(1, a / b), N });
  }
  return { terms };
}

// Returns { fn } or { error }. Never evaluates anything outside the whitelist.
function compile(expr) {
  if (typeof expr !== 'string') return { error: 'keine Formel' };
  const src = expr.trim();
  if (src === '') return { fn: () => 0 };
  if (src.length > MAX_LEN) return { error: 'zu lang' };
  const fr = fractions(src);
  if (fr) {
    if (fr.error) return fr;
    const terms = fr.terms;
    return { terms, fn: (t, p, n) => { const x = n + p; for (const k of terms) { const q = x / k.N; if (q - Math.floor(q) >= 1 - k.r) return 0; } return 1; } };
  }
  if (!/^[0-9a-zA-Z_\s+\-*/%&|^~<>=!?:(),.]*$/.test(src)) {
    return { error: 'Zeichen nicht erlaubt: ' + src.replace(/[0-9a-zA-Z_\s+\-*/%&|^~<>=!?:(),.]/g, '').slice(0, 5) };
  }
  const bare = src.replace(/(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi, '0');
  for (const id of bare.match(/[A-Za-z_][A-Za-z_0-9]*/g) || []) {
    if (!NAMES.has(id)) return { error: 'unbekannt: ' + id };
  }
  if (/(^|[^=!<>])=($|[^=])/.test(bare.replace(/===?|!==?|<=|>=/g, ''))) return { error: 'Zuweisung nicht erlaubt' };
  let fn;
  try {
    const names = Object.keys(MATH);
    fn = new Function(...names, 'return function (t, p, n, f) { return +(' + src + '); };')(...names.map(k => MATH[k]));
    fn(0, 0, 0, 220); fn(0.37, 0.5, 3, 220);
  } catch (e) {
    return { error: String(e && e.message || e).replace(/^.*?: /, '') };
  }
  return { fn };
}

const TWO_PI = Math.PI * 2;
const wave = {
  sin: x => Math.sin(TWO_PI * x),
  tri: x => 1 - 4 * Math.abs(x - 0.5),
  square: x => (x < 0.5 ? 1 : -1),
  saw: x => 2 * x - 1,
};

class Klang extends AudioWorkletProcessor {
  constructor() {
    super();
    this.prm = { f: 220, w: 'sin', tempo: 2, smooth: true, carrier: true };
    this.expr = '1';
    this.fn = () => 1;
    this.terms = [];
    this.beat = 0;            // beats played (phase accumulator, so tempo changes never jump)
    this.tone = 0;
    this.samples = 0;
    this.gs = 1;
    this.sincePost = 0;
    this.port.onmessage = ev => {
      try { this.handle(ev.data); } catch (e) { this.port.postMessage({ type: 'fehler', text: String(e && e.message || e) }); }
    };
  }

  handle(m) {
    if (m.type === 'param') {
      Object.assign(this.prm, m.prm);
    } else if (m.type === 'formel') {
      if (m.expr !== this.expr) {
        this.expr = m.expr;
        const r = compile(m.expr);
        if (r.fn) { this.fn = r.fn; this.terms = r.terms || null; }   // last valid formula keeps running
        this.error = r.fn ? '' : r.error;
      }
      this.port.postMessage({ type: 'formel-fehler', text: this.error || '' });
    } else if (m.type === 'vorschau') {
      this.port.postMessage({ type: 'vorschau', id: m.id, cols: this.vorschau(m.von, m.beats, m.points), von: m.von, beats: m.beats });
    }
  }

  // formula value at a point, as the carrier gain (0..1) or as the signal itself (-1..1)
  level(t, p, n, f) {
    const v = this.fn(t, p, n, f);
    const x = v === v ? v : 0;                    // NaN counts as 0
    if (this.prm.carrier) return x < 0 ? 0 : x > 1 ? 1 : x;
    return x < -1 ? -1 : x > 1 ? 1 : x;
  }

  // Per column over [von, von + beats): lowest and highest level, coverage (share of the column that sounds)
  // and kerb (a gap narrower than the column). Any zoom, from single samples to days.
  vorschau(von, beats, cols) {
    const lo = new Float32Array(cols), hi = new Float32Array(cols), cov = new Float32Array(cols), kerb = new Uint8Array(cols);
    const { f, tempo } = this.prm;
    const d = tempo / sampleRate;
    const w = beats / cols;
    const at = x => { const n = Math.floor(x); return this.level(tempo > 0 ? x / tempo : 0, x - n, n, f); };
    const snap = x => (d > 0 ? Math.floor(x / d + 1e-9) * d : x);
    const K = this.terms ? 16 : 6;
    for (let i = 0; i < cols; i++) {
      const x0 = von + i * w;
      if (d > 0 && w <= d * 1.0001) {              // a column is at most one sample: show what the ear gets
        const v = at(snap(x0)); lo[i] = hi[i] = cov[i] = v; continue;
      }
      let mn = Infinity, mx = -Infinity, sum = 0, off = 0, aus = 0;
      for (let j = 0; j < K; j++) {
        off = (off + 0.6180339887) % 1;
        const v = at(snap(x0 + (j + off) / K * w));
        if (v < mn) mn = v; if (v > mx) mx = v; sum += v; if (v < 0.5) aus++;
      }
      cov[i] = sum / K;
      if (this.terms) {                            // exact for fraction formulas: one gap anywhere in the column counts
        const x1 = x0 + w;
        let luecke = false, voll = false, schmal = false;
        for (const k of this.terms) {
          const N = k.N, kk = Math.floor(x0 / N);
          const s0 = kk * N + (1 - k.r) * N, e0 = (kk + 1) * N;
          const s1 = e0 + (1 - k.r) * N;
          const trifft = (e0 > x0 && s0 < x1) || s1 < x1;
          if (trifft) { luecke = true; if (k.r * N < w) schmal = true; }
          if (x0 >= s0 && x1 <= e0) voll = true;
        }
        mn = luecke ? 0 : 1; mx = voll ? 0 : 1;
        kerb[i] = luecke && !voll && schmal ? 1 : 0;
      } else {
        kerb[i] = mn < 0.5 && aus === 1 ? 1 : 0;
      }
      lo[i] = mn; hi[i] = mx;
    }
    return { lo, hi, cov, kerb };
  }

  process(_in, outputs) {
    const out = outputs[0][0];
    const { f, w, tempo, smooth, carrier } = this.prm;
    const shape = wave[w] || wave.sin;
    const dBeat = tempo / sampleRate;
    const dTone = f / sampleRate;
    const alpha = 1 - Math.exp(-1 / (sampleRate * 0.00025));   // 0.25 ms: kills clicks, keeps gaps of a few samples audible
    for (let i = 0; i < out.length; i++) {
      const n = Math.floor(this.beat);
      const g = this.level(this.samples / sampleRate, this.beat - n, n, f);
      this.gs = smooth ? this.gs + (g - this.gs) * alpha : g;
      out[i] = carrier ? shape(this.tone) * this.gs : this.gs;
      this.beat += dBeat;
      this.tone += dTone; if (this.tone >= 1) this.tone -= Math.floor(this.tone);
      this.samples++;
    }
    for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out);
    this.sincePost += out.length;
    if (this.sincePost >= sampleRate / 30) {
      this.sincePost = 0;
      this.port.postMessage({ type: 'takt', beat: this.beat });
    }
    return true;
  }
}

registerProcessor('1klang', Klang);

// Gate function exposed for unit tests (node), harmless inside the worklet scope.
if (typeof module !== 'undefined') module.exports = { compile, wave };
