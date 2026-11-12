// Formula language of 1klang.html (t in beats). Used by the worklet (compile, sound) and the page (parse, MathML).
// No eval, no new Function: tokenizer, recursive parser, closures. Nothing outside the grammar can run.
//
//   [a, b) mod N      1 while (t mod N) lies in [a, b), else 0. "(" after the interval: indicator of that argument instead.
//   prod(k=1..inf) x  product / sum (sum(...)), "inf" runs as far as the resolution (sample, pixel) reaches.
//   E(k, n, r)        Euclidean rhythm: k hits spread evenly over n steps of one beat, rotated by r (Bjorklund, Toussaint 2005).
//   1 - 1/4           short form: last quarter of every beat gone;  1 - 1/4 alle 4  every 4th beat gone.

const MAX_LEN = 400;
const MAX_TERME = 60;        // "inf" reaches this far at most
const MAX_ENDLICH = 2000;    // finite upper bounds
const TIEFE = 12;

let RES = 0;                 // resolution in beats: what a sample / a pixel column spans
export function setRes(r) { RES = r > 0 ? r : 0; }

export class FormelFehler extends Error {}
const fehler = m => { throw new FormelFehler(m); };

// ---------- tokens ----------
function tokens(src) {
  const s = src.replace(/∞/g, ' inf ').replace(/π/g, ' pi ').replace(/[·×]/g, '*').replace(/−/g, '-');
  const out = [];
  const re = /\s*(?:(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z_0-9]*)|(\.\.)|([-+*/^()[\],=]))/y;
  let i = 0;
  while (i < s.length) {
    if (/^\s*$/.test(s.slice(i))) break;
    re.lastIndex = i;
    const m = re.exec(s);
    if (!m) fehler('Zeichen nicht erlaubt: ' + s.slice(i).trim().charAt(0));
    if (m[1] !== undefined) out.push({ k: 'num', v: parseFloat(m[1]) });
    else if (m[2] !== undefined) out.push({ k: 'id', v: m[2] });
    else out.push({ k: 'op', v: m[3] || m[4] });
    i = re.lastIndex;
  }
  return out;
}

// ---------- parser ----------
const F1 = {
  frac: x => x - Math.floor(x), fract: x => x - Math.floor(x),
  floor: Math.floor, ceil: Math.ceil, round: Math.round, abs: Math.abs, sqrt: Math.sqrt,
  sin: Math.sin, cos: Math.cos, tan: Math.tan, exp: Math.exp, log: Math.log, sign: Math.sign,
  rnd: x => { const s = Math.sin(x * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); },
};
const mod = (a, b) => a - b * Math.floor(a / b);
const F2 = { pow: Math.pow, mod };
const FN = { min: Math.min, max: Math.max };
const KONST = { pi: Math.PI, e: Math.E, inf: Infinity };
const VARS = new Set(['t', 'p', 'n', 'f']);

export function parse(src) {
  if (typeof src !== 'string') fehler('keine Formel');
  if (src.length > MAX_LEN) fehler('zu lang');
  const tk = tokens(src);
  if (!tk.length) fehler('leer');
  let i = 0;
  const isOp = v => tk[i] && tk[i].k === 'op' && tk[i].v === v;
  const isId = v => tk[i] && tk[i].k === 'id' && tk[i].v === v;
  const want = v => { if (!isOp(v)) fehler(tk[i] ? '"' + v + '" fehlt vor "' + (tk[i].v) + '"' : '"' + v + '" fehlt am Ende'); i++; };

  const expr = () => {
    let a = term();
    while (isOp('+') || isOp('-')) { const op = tk[i++].v; a = { t: 'bin', op, a, b: term() }; }
    return a;
  };
  const term = () => {
    let a = unary();
    for (;;) {
      if (isOp('*') || isOp('/')) { const op = tk[i++].v; a = { t: 'bin', op, a, b: unary() }; }
      else if (isId('mod')) { i++; a = { t: 'bin', op: 'mod', a, b: unary() }; }
      else return a;
    }
  };
  const unary = () => {
    if (isOp('-')) { i++; return { t: 'neg', a: unary() }; }
    if (isOp('+')) { i++; return unary(); }
    return power();
  };
  const power = () => {
    const a = atom();
    if (isOp('^')) { i++; return { t: 'bin', op: '^', a, b: unary() }; }
    return a;
  };
  const atom = () => {
    const tok = tk[i];
    if (!tok) fehler('Formel endet zu früh');
    if (tok.k === 'num') { i++; return { t: 'num', v: tok.v }; }
    if (isOp('(')) { i++; const e = expr(); want(')'); return e; }
    if (isOp('[')) return intervall();
    if (tok.k === 'id') {
      i++;
      const name = tok.v;
      const call = isOp('(');
      if (call && (name === 'prod' || name === 'sum')) return gross(name);
      if (call) {
        i++;
        const args = [];
        if (!isOp(')')) { args.push(expr()); while (isOp(',')) { i++; args.push(expr()); } }
        want(')');
        return aufruf(name, args);
      }
      if (name in KONST) return { t: 'const', n: name };
      if (VARS.has(name)) return { t: 'var', n: name };
      return { t: 'name', n: name };     // loop variable, resolved by the compiler (error "unbekannt" if none)
    }
    fehler('unerwartet: ' + tok.v);
  };
  const aufruf = (name, args) => {
    const n = args.length;
    if (name === 'E') { if (n < 2 || n > 3) fehler('E braucht 2 oder 3 Argumente: E(k, n, r)'); return { t: 'euk', k: args[0], n: args[1], r: args[2] || null }; }
    if (name in F1) { if (n !== 1) fehler(name + ' braucht 1 Argument'); }
    else if (name in F2) { if (n !== 2) fehler(name + ' braucht 2 Argumente'); }
    else if (name in FN) { if (n < 1) fehler(name + ' braucht Argumente'); }
    else fehler('unbekannt: ' + name);
    return { t: 'call', n: name, args };
  };
  const intervall = () => {
    i++;
    const a = expr(); want(',');
    const b = expr();
    let close;
    if (isOp(')')) close = ')'; else if (isOp(']')) close = ']'; else fehler('")" oder "]" fehlt am Intervall');
    i++;
    let arg = null, m = null;
    if (isId('mod')) { i++; m = power(); }
    else if (isOp('(')) { i++; arg = expr(); want(')'); }
    return { t: 'ind', a, b, close, arg, mod: m };
  };
  const gross = op => {
    i++;   // "("
    const tok = tk[i];
    if (!tok || tok.k !== 'id') fehler(op + ' braucht eine Variable: ' + op + '(k=1..inf)');
    i++;
    want('=');
    const von = expr();
    want('..');
    const bis = expr();
    want(')');
    return { t: 'big', op, v: tok.v, von, bis, body: term() };
  };

  const ast = expr();
  if (i < tk.length) fehler('unerwartet: ' + tk[i].v);
  return ast;
}

// ---------- short form: "1 - 1/4 - 1/16 alle 4" ----------
const FRAC_TERM = String.raw`\s*-\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)(?:\s+alle\s+(\d+(?:\.\d+)?))?`;
const FRAC_ALL = new RegExp('^\\s*1(?:' + FRAC_TERM + ')*\\s*$', 'i');

// the same formula in long form: 1 - [(1-r)N, N) mod N. null: not a short form.
export function kurzform(src) {
  if (!FRAC_ALL.test(src)) return null;
  const re = new RegExp(FRAC_TERM, 'gi');
  let ast = { t: 'num', v: 1 }, m;
  const rest = src.replace(/^\s*1/, '');
  while ((m = re.exec(rest)) !== null) {
    const a = parseFloat(m[1]), b = parseFloat(m[2]), N = m[3] === undefined ? 1 : parseFloat(m[3]);
    if (b === 0) fehler('durch 0');
    if (N === 0) fehler('alle 0');
    if (!(a > 0)) continue;
    const r = Math.min(1, a / b);
    ast = { t: 'bin', op: '-', a: ast, b: { t: 'ind', a: { t: 'num', v: (1 - r) * N }, b: { t: 'num', v: N }, close: ')', arg: null, mod: { t: 'num', v: N } } };
  }
  return ast;
}

// goes into this language (t in beats) or stays with the old arithmetic (t in seconds)?
export function istNeu(src) {
  return FRAC_ALL.test(src) || /[[∞π·×−]|\b(?:prod|sum|inf|mod|alle|frac|E)\b/.test(src);
}

// ---------- compiler ----------
function euklid(k, n, r, x) {
  n = Math.floor(n);
  if (!(n >= 1)) return 0;
  k = Math.max(0, Math.min(n, Math.floor(k)));
  if (k === 0) return 0;
  const i = mod(Math.floor(x) - Math.floor(r || 0), n);
  return Math.floor(i * k / n) !== Math.floor((i - 1) * k / n) ? 1 : 0;
}

function comp(node, S) {
  switch (node.t) {
    case 'num': { const v = node.v; return () => v; }
    case 'const': { const v = KONST[node.n]; return () => v; }
    case 'var':
      switch (node.n) {
        case 't': return x => x;
        case 'p': return x => x - Math.floor(x);
        case 'n': return x => Math.floor(x);
        default: return (x, f) => f;
      }
    case 'name': {
      const idx = S.names.lastIndexOf(node.n);
      if (idx < 0) fehler('unbekannt: ' + node.n);
      const L = S.L;
      return () => L[idx];
    }
    case 'neg': { const a = comp(node.a, S); return (x, f) => -a(x, f); }
    case 'bin': {
      if (node.op === '/' && node.b.t === 'num' && node.b.v === 0) fehler('durch 0');
      const a = comp(node.a, S), b = comp(node.b, S);
      switch (node.op) {
        case '+': return (x, f) => a(x, f) + b(x, f);
        case '-': return (x, f) => a(x, f) - b(x, f);
        case '*': return (x, f) => a(x, f) * b(x, f);
        case '/': return (x, f) => a(x, f) / b(x, f);
        case '^': return (x, f) => Math.pow(a(x, f), b(x, f));
        default: return (x, f) => mod(a(x, f), b(x, f));
      }
    }
    case 'call': {
      const args = node.args.map(a => comp(a, S));
      if (node.n in F1) { const g = F1[node.n], a = args[0]; return (x, f) => g(a(x, f)); }
      if (node.n in F2) { const g = F2[node.n], a = args[0], b = args[1]; return (x, f) => g(a(x, f), b(x, f)); }
      const g = FN[node.n];
      return (x, f) => g(...args.map(a => a(x, f)));
    }
    case 'euk': {
      const k = comp(node.k, S), n = comp(node.n, S), r = node.r ? comp(node.r, S) : () => 0;
      return (x, f) => euklid(k(x, f), n(x, f), r(x, f), x);
    }
    case 'ind': {
      const a = comp(node.a, S), b = comp(node.b, S), zu = node.close === ']';
      let v;
      if (node.mod) {
        const N = comp(node.mod, S);
        v = (x, f) => { const n = N(x, f); return n > 0 ? mod(x, n) : NaN; };
      } else if (node.arg) v = comp(node.arg, S);
      else v = x => x;
      return (x, f) => { const y = v(x, f); return y >= a(x, f) && (zu ? y <= b(x, f) : y < b(x, f)) ? 1 : 0; };
    }
    case 'big': {
      if (S.names.length >= TIEFE) fehler('zu tief verschachtelt');
      const von = comp(node.von, S), bis = comp(node.bis, S);
      const idx = S.names.length;
      S.names.push(node.v);
      const body = comp(node.body, S);
      S.names.pop();
      const L = S.L, produkt = node.op === 'prod';
      return (x, f) => {
        const a = Math.ceil(von(x, f)), b = bis(x, f);
        if (!(a === a) || !(b === b)) return NaN;
        const unendlich = b === Infinity;
        const letzt = unendlich ? a + MAX_TERME - 1 : Math.min(b, a + MAX_ENDLICH - 1);
        let acc = produkt ? 1 : 0;
        for (let k = a; k <= letzt; k++) {
          L[idx] = k;
          const v = body(x, f);
          // bis unendlich, solange das Sample reicht: a term that changes within one resolution step is below what can be seen or heard
          if (unendlich && RES > 0 && (body(x + RES / 2, f) !== v || body(x + RES, f) !== v)) break;
          if (produkt) { acc *= v; if (acc === 0) break; } else acc += v;
        }
        return acc;
      };
    }
  }
  fehler('intern: ' + node.t);
}

// every constant? (no t, p, n, f, loop variable, product)
function konstant(node) {
  if (!node || typeof node !== 'object') return true;
  if (Array.isArray(node)) return node.every(konstant);
  if (node.t === 'var' || node.t === 'name' || node.t === 'big') return false;
  return Object.keys(node).every(k => k === 't' || konstant(node[k]));
}

// "1 - [a,b) mod N - ..." with constant a, b, N: the gaps are known exactly. null: any other formula (the preview samples).
export function terme(ast) {
  const out = [];
  let n = ast;
  while (n.t === 'bin' && n.op === '-') {
    const g = n.b;
    if (g.t !== 'ind' || !g.mod || g.arg || !konstant(g)) return null;
    const S = { L: new Float64Array(TIEFE), names: [] };
    const N = comp(g.mod, S)(0, 0);
    let a = comp(g.a, S)(0, 0), b = comp(g.b, S)(0, 0);
    if (!(N > 0) || a !== a || b !== b) return null;
    a = Math.max(0, a); b = Math.min(N, b);
    if (b > a) out.push({ a, b, N });
    n = n.a;
  }
  if (!(n.t === 'num' && n.v === 1)) return null;
  return out.reverse();
}

// Returns { fn(t, p, n, f), ast, terms } or { error }. t is ignored: this language runs in beats (n + p).
export function kompiliere(src) {
  try {
    const ast = kurzform(src) || parse(src);
    const S = { L: new Float64Array(TIEFE), names: [] };
    const core = comp(ast, S);
    const proben = [0, 0.37, 1.5, 7.25].map(x => core(x, 220));
    if (proben.every(v => !Number.isFinite(v))) fehler('Ergebnis nicht endlich');
    return { fn: (_t, p, n, f) => core(n + p, f), ast, terms: terme(ast) };
  } catch (e) {
    if (e instanceof FormelFehler) return { error: e.message };
    throw e;
  }
}

// Page side: { legacy: true } (old arithmetic), { ast } or { error }
export function analysiere(src) {
  const s = String(src).trim();
  if (s === '' || !istNeu(s)) return { legacy: true };
  const r = kompiliere(s);
  return r.error ? { error: r.error } : { ast: r.ast };
}

// ---------- MathML (page side only: needs a DOM) ----------
const NS = 'http://www.w3.org/1998/Math/MathML';

function bruch(v) {
  if (!Number.isFinite(v) || Number.isInteger(v)) return null;
  const a = Math.abs(v);
  for (let q = 2; q <= 64; q++) {
    const p = Math.round(a * q);
    if (p > 0 && Math.abs(p / q - a) < 1e-9) return { s: v < 0 ? -1 : 1, p, q };
  }
  return null;
}

function rang(node) {
  switch (node.t) {
    case 'num': return node.v < 0 ? 1 : bruch(node.v) ? 3 : 5;
    case 'bin': return node.op === '+' || node.op === '-' ? 1 : node.op === '/' ? 3 : node.op === '^' ? 4 : 2;
    case 'neg': return 1;
    case 'big': return 1.5;
    default: return 5;
  }
}

export function mathml(ast, doc = document) {
  const el = (tag, ...kids) => {
    const e = doc.createElementNS(NS, tag);
    for (const k of kids) e.append(typeof k === 'string' ? doc.createTextNode(k) : k);
    return e;
  };
  const mi = (s, normal) => { const e = el('mi', s); if (normal) e.setAttribute('mathvariant', 'normal'); return e; };
  const mo = s => el('mo', s);
  const klammer = (...inner) => el('mrow', mo('('), ...inner, mo(')'));
  const mit = (node, min) => rang(node) < min ? klammer(r(node)) : r(node);
  const zahl = v => {
    const b = bruch(v);
    if (!b) return el('mn', String(v));
    const f = el('mfrac', el('mn', String(b.p)), el('mn', String(b.q)));
    return b.s < 0 ? el('mrow', mo('−'), f) : f;
  };
  const r = node => {
    switch (node.t) {
      case 'num': return node.v < 0 && !bruch(node.v) ? el('mrow', mo('−'), el('mn', String(-node.v))) : zahl(node.v);
      case 'const': return node.n === 'inf' ? mi('∞', true) : node.n === 'pi' ? mi('π', true) : mi('e', true);
      case 'var': case 'name': return mi(node.n);
      case 'neg': return el('mrow', mo('−'), mit(node.a, 2));
      case 'bin':
        switch (node.op) {
          case '+': return el('mrow', mit(node.a, 1), mo('+'), mit(node.b, 1));
          case '-': return el('mrow', mit(node.a, 1), mo('−'), mit(node.b, 2));
          case '*': return el('mrow', mit(node.a, 2), mo('⋅'), mit(node.b, 2));
          case '/': return el('mfrac', r(node.a), r(node.b));
          case '^': return el('msup', mit(node.a, 5), r(node.b));
          default: return el('mrow', mit(node.a, 3), mo('mod'), mit(node.b, 3));
        }
      case 'call':
        if (node.n === 'sqrt') return el('msqrt', r(node.args[0]));
        if (node.n === 'abs') return el('mrow', mo('|'), r(node.args[0]), mo('|'));
        if (node.n === 'floor') return el('mrow', mo('⌊'), r(node.args[0]), mo('⌋'));
        if (node.n === 'ceil') return el('mrow', mo('⌈'), r(node.args[0]), mo('⌉'));
        return el('mrow', mi(node.n === 'fract' ? 'frac' : node.n, true), mo('⁡'), klammer(...komma(node.args.map(r))));
      case 'euk':
        return el('mrow', mi('E'), mo('⁡'), klammer(...komma([r(node.k), r(node.n), ...(node.r ? [r(node.r)] : [])])));
      case 'ind': {
        const grenzen = el('mrow', mo('['), r(node.a), mo(','), r(node.b), mo(node.close));
        const arg = node.mod ? el('mrow', mi('t'), mo('mod'), mit(node.mod, 3)) : node.arg ? r(node.arg) : mi('t');
        return el('mrow', el('msub', mi('\u{1D7D9}', true), grenzen), klammer(arg));
      }
      case 'big': {
        const zeichen = node.op === 'prod' ? '∏' : '∑';
        const unten = el('mrow', mi(node.v), mo('='), r(node.von));
        return el('mrow', el('munderover', mo(zeichen), unten, r(node.bis)), mit(node.body, 2));
      }
    }
    return mi('?');
  };
  const komma = list => list.flatMap((k, i) => i ? [mo(','), k] : [k]);
  const math = el('math', el('mrow', mi('f'), klammer(mi('t')), mo('='), r(ast)));
  math.setAttribute('display', 'block');
  return math;
}
