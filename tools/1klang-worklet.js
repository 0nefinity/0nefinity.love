// AudioWorklet for 1klang.html. The formula is evaluated here, never on the page's main thread:
// the worklet scope has no DOM, no fetch, no storage. It is checked against a whitelist
// before it is compiled, so a shared URL can only ever run arithmetic.
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

// Returns { fn } or { error }. Never evaluates anything outside the whitelist.
function compile(expr) {
  if (typeof expr !== 'string') return { error: 'keine Formel' };
  const src = expr.trim();
  if (src === '') return { fn: () => 0 };
  if (src.length > MAX_LEN) return { error: 'zu lang' };
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
        if (r.fn) this.fn = r.fn;                 // last valid formula keeps running
        this.error = r.fn ? '' : r.error;
      }
      this.port.postMessage({ type: 'formel-fehler', text: this.error || '' });
    } else if (m.type === 'vorschau') {
      this.port.postMessage({ type: 'vorschau', id: m.id, gate: this.vorschau(m.von, m.beats, m.points), von: m.von, beats: m.beats });
    }
  }

  // formula value at a point, as the carrier gain (0..1) or as the signal itself (-1..1)
  level(t, p, n, f) {
    const v = this.fn(t, p, n, f);
    const x = v === v ? v : 0;                    // NaN counts as 0
    if (this.prm.carrier) return x < 0 ? 0 : x > 1 ? 1 : x;
    return x < -1 ? -1 : x > 1 ? 1 : x;
  }

  // Values over [von, von + beats) in beats, sampled at any resolution (zoom down to single samples).
  vorschau(von, beats, points) {
    const out = new Float32Array(points);
    const { f, tempo } = this.prm;
    for (let i = 0; i < points; i++) {
      let x = von + (i / points) * beats;
      if (tempo > 0) { const d = tempo / sampleRate; x = Math.floor(x / d + 1e-9) * d; }   // zoomed to single samples, show what the ear gets
      const n = Math.floor(x);
      out[i] = this.level(tempo > 0 ? x / tempo : 0, x - n, n, f);
    }
    return out;
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
