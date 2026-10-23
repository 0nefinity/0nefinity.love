/**
 * Worker fuer Stellen irrationaler Konstanten (pi, e, ln 2, sqrt 2, phi) mit GMP/WASM.
 *
 * Algorithmen (Klasse wie y-cruncher, nicht dieselbe Implementierung: GMP-Multiplikation, ein Kern):
 *   pi     Chudnovsky, Binary Splitting
 *   e      Taylorreihe sum 1/k!, Binary Splitting
 *   ln2    Machin-artig: 144 acoth 251 + 54 acoth 449 - 38 acoth 4801 + 62 acoth 8749, je Reihe Binary Splitting
 *   sqrt2  mpz_sqrt auf skaliertem Integer (Zimmermann, O(M(n)))
 *   phi    (1 + sqrt 5) / 2 ueber mpz_sqrt
 *
 * Nachrichten an den Worker:
 *   { type: 'open', id, intLen } Konstante waehlen ('pi' | 'e' | 'ln2' | 'sqrt2' | 'phi'), startet das Laden der Engine;
 *                               intLen = Ziffern des Ganzzahlteils im Ergebnis-String (ln2: 0), Quelle: Irrational.constants
 *   { type: 'want', total }     Stellen bis total (Nachkommastellen) anfordern, idempotent, steigend
 *   { type: 'test', ... }       nur Tests (kein Weg fuer Nutzer): maxPages, failAlloc, failOther, ballastBytes, bigintMaxBits
 *
 * Nachrichten vom Worker:
 *   { type: 'info', mode: 'wasm'|'bigint', maxPages }
 *   { type: 'digits', from, buf, total, memBytes, maxPtr }   buf = Uint8Array (ASCII-Ziffern '0'..'9', Transfer), ab Nachkommastelle `from`
 *   { type: 'limit', kind: 'engine'|'device', reason, digits }  genau einmal, danach liefert der Worker nichts mehr
 *   { type: 'notice', message }  Rueckfall auf BigInt
 *   { type: 'error', message }   jeder andere Fehler (laut), danach liefert der Worker nichts mehr
 *
 * Speicher: das WASM kommt aus tools/vendor/gmp-wasm/gmp-wasm-1.3.2.mini.4gib.umd.min.js (Memory-Maximum 4 GiB, siehe README dort).
 * Zeiger aus WASM sind bei Speicher > 2 GiB als i32 negativ: immer mit >>> 0 lesen.
 * Lizenz: gmp-wasm / GMP LGPL-3.0, Texte unter /tools/vendor/gmp-wasm/.
 */
'use strict';

const GUARD = 30;           // Schutzstellen: gerechnet wird mit target + GUARD Stellen, freigegeben nur target
const HEAD_CHECK = 1000;    // die ersten Stellen jeder Stufe muessen mit denen der ersten Stufe uebereinstimmen
const MIN_STAGE = 2000;
const PAGE = 65536;
const MODULE_MAX_PAGES = 65536; // Memory-Maximum des gepatchten Bundles (4 GiB); test_engine.js a1 vergleicht mit dem Bundle
const SAFETY = 1.25;        // Sicherheitsfaktor auf den geschaetzten Speicherbedarf einer Stufe
const BUNDLE = '/tools/vendor/gmp-wasm/gmp-wasm-1.3.2.mini.4gib.umd.min.js';

// Gemessener Speicher des WASM-Linearspeichers in Byte je Stelle (Maximum ueber die Stufen), aufgerundet.
// Messbefehl (Quelle): node tests/irrational/measure-bpd.js 2000000 ; node tests/irrational/measure-bpd.js 16000000 sqrt2,phi,e ; node tests/irrational/measure-bpd.js 8000000 pi,ln2
// Messwerte 2026-10-23: pi 11.11 (2e6) 10.73 (8e6); e 8.65 (2e6) 9.45 (1.6e7); ln2 12.16 (2e6) 11.79 (8e6); sqrt2/phi 8.45 (2e6, Grundspeicher 16 MiB) 6.01 (1.6e7)
const BYTES_PER_DIGIT = {
    pi: 12,
    e: 10,
    ln2: 13,
    sqrt2: 9,
    phi: 9,
};

const C3_OVER_24 = 640320n ** 3n / 24n;
// ln 2 = sum coef * acoth(x), geprueft gegen mpmath (tests/irrational)
const LN2_TERMS = [[144, 251], [54, 449], [-38, 4801], [62, 8749]];

let id = null;
let intLen = 0;             // Ziffern des Ganzzahlteils im Ergebnis-String
let g = null;               // GMP-Binding
let mode = null;            // 'wasm' | 'bigint'
let ready = false;
let have = 0;               // gelieferte Nachkommastellen
let wanted = 0;
let busy = false;
let limited = false;
let failed = false;
let head = null;            // erste Stellen der ersten Stufe (Selbstpruefung)
let maxPtr = 0;
let allocCount = 0;
let bigFail = Infinity;
const cfg = { maxPages: MODULE_MAX_PAGES, failAlloc: 0, failOther: false, ballastBytes: 0, bigintMaxBits: 0 };

function fail(message) {
    failed = true;
    postMessage({ type: 'error', message });
}

function limit(kind, reason) {
    limited = true;
    g = null; // Instanz verwerfen
    postMessage({ type: 'limit', kind, reason, digits: have });
}

function wasmUsable() {
    try {
        return typeof WebAssembly === 'object' && typeof WebAssembly.Module === 'function' &&
            new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])) instanceof WebAssembly.Module;
    } catch (e) {
        return false;
    }
}

function memBytes() {
    return g ? g.mem.buffer.byteLength : 0;
}

function maxBytes() {
    return cfg.maxPages * PAGE;
}

// Stellen, die eine Stufe hoechstens haben darf, damit der geschaetzte Bedarf unter dem Modul-Maximum bleibt.
function fitDigits() {
    return Math.floor(maxBytes() / (BYTES_PER_DIGIT[id] * SAFETY)) - GUARD;
}

function estimateBytes(digits) {
    return BYTES_PER_DIGIT[id] * (digits + GUARD) * SAFETY;
}

function isAllocFailure(e) {
    const msg = e && e.message ? e.message : String(e);
    return /Fatal error in gmp-wasm|out of memory|Maximum memory size|memory\.grow|allocation failed|Invalid typed array length/i.test(msg) ||
        (e instanceof RangeError && !/BigInt/i.test(msg));
}

// ---------- GMP-Helfer ----------

function newMpz() {
    if (cfg.failAlloc && ++allocCount === cfg.failAlloc) throw new Error('Fatal error in gmp-wasm (injected by test)');
    if (cfg.failOther) throw new Error('injected non-allocation failure (test)');
    const p = g.mpz_t() >>> 0;
    if (p > maxPtr) maxPtr = p;
    g.mpz_init(p);
    return p;
}

function freeMpz(p) {
    g.mpz_clear(p);
    g.free(p);
}

function assertU32(maxFactor) {
    if (maxFactor >= 2 ** 32) throw new Error('32-bit factor limit of the mpz_*_ui calls reached');
}

function pow10(n) {
    const p = newMpz();
    g.mpz_ui_pow_ui(p, 10, n);
    return p;
}

// ---------- pi (Chudnovsky) ----------

function bsPi(a, b, needP, c3over24) {
    if (b - a === 1) {
        const P = newMpz(), Q = newMpz(), T = newMpz();
        if (a === 0) {
            g.mpz_set_ui(P, 1);
            g.mpz_set_ui(Q, 1);
        } else {
            g.mpz_set_ui(P, 6 * a - 5);
            g.mpz_mul_ui(P, P, 2 * a - 1);
            g.mpz_mul_ui(P, P, 6 * a - 1);
            g.mpz_mul_ui(Q, c3over24, a);
            g.mpz_mul_ui(Q, Q, a);
            g.mpz_mul_ui(Q, Q, a);
        }
        g.mpz_set_ui(T, 545140134);
        g.mpz_mul_ui(T, T, a);
        g.mpz_add_ui(T, T, 13591409);
        g.mpz_mul(T, T, P);
        if (a & 1) g.mpz_neg(T, T);
        if (!needP) { freeMpz(P); return [0, Q, T]; }
        return [P, Q, T];
    }
    const m = Math.floor((a + b) / 2);
    const [P1, Q1, T1] = bsPi(a, m, true, c3over24);
    const [P2, Q2, T2] = bsPi(m, b, needP, c3over24);
    g.mpz_mul(T1, T1, Q2);
    g.mpz_addmul(T1, P1, T2);
    g.mpz_mul(Q1, Q1, Q2);
    if (needP) g.mpz_mul(P1, P1, P2);
    freeMpz(Q2); freeMpz(T2);
    if (P2) freeMpz(P2);
    if (!needP) freeMpz(P1);
    return [needP ? P1 : 0, Q1, T1];
}

// floor(pi * 10^n) (bis auf wenige Einheiten der letzten Stelle)
function calcPi(n) {
    const terms = Math.floor(n / 14.18) + 2;
    assertU32(6 * terms);
    const c3over24 = newMpz(), sqrtC = newMpz(), pi = newMpz(), one = newMpz(), three = newMpz();
    try {
        g.mpz_ui_pow_ui(c3over24, 640320, 3);
        g.mpz_tdiv_q_2exp(c3over24, c3over24, 3);
        g.mpz_set_ui(three, 3);
        g.mpz_tdiv_q(c3over24, c3over24, three);
        const [, Q, T] = bsPi(0, terms, false, c3over24);
        g.mpz_ui_pow_ui(one, 10, 2 * n);
        g.mpz_mul_ui(one, one, 10005);
        g.mpz_sqrt(sqrtC, one);
        g.mpz_mul(Q, Q, sqrtC);
        g.mpz_mul_ui(Q, Q, 426880);
        g.mpz_tdiv_q(pi, Q, T);
        freeMpz(Q); freeMpz(T);
        return pi;
    } catch (e) {
        freeMpz(pi);
        throw e;
    } finally {
        freeMpz(c3over24); freeMpz(sqrtC); freeMpz(one); freeMpz(three);
    }
}

// ---------- e (sum 1/k!) ----------

// Terme k in [a, b), a >= 1: Q = prod k, T = Summe-Zaehler (Summe = T / Q)
function bsE(a, b) {
    if (b - a === 1) {
        const Q = newMpz(), T = newMpz();
        g.mpz_set_ui(Q, a);
        g.mpz_set_ui(T, 1);
        return [Q, T];
    }
    const m = Math.floor((a + b) / 2);
    const [Q1, T1] = bsE(a, m);
    const [Q2, T2] = bsE(m, b);
    g.mpz_mul(T1, T1, Q2);
    g.mpz_add(T1, T1, T2);
    g.mpz_mul(Q1, Q1, Q2);
    freeMpz(Q2); freeMpz(T2);
    return [Q1, T1];
}

// kleinstes N mit N! > 10^(n+8)
function termsForE(n) {
    const target = (n + 8) * Math.LN10;
    const lf = (N) => N * Math.log(N) - N + 0.5 * Math.log(2 * Math.PI * N);
    let lo = 1, hi = 2;
    while (lf(hi) < target) { lo = hi; hi *= 2; }
    while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        if (lf(mid) < target) lo = mid; else hi = mid;
    }
    return hi + 1;
}

function calcE(n) {
    const N = termsForE(n);
    assertU32(N);
    const [Q, T] = bsE(1, N + 1);
    const r = newMpz();
    try {
        g.mpz_add(T, T, Q);                  // Q + T  (e = 1 + T/Q = (Q+T)/Q)
        const s = pow10(n);
        g.mpz_mul(T, T, s);
        freeMpz(s);
        g.mpz_tdiv_q(r, T, Q);
        return r;
    } catch (e) {
        freeMpz(r);
        throw e;
    } finally {
        freeMpz(Q); freeMpz(T);
    }
}

// ---------- ln 2 (Machin-artig, acoth) ----------

// acoth(x) = sum_{k>=0} 1/((2k+1) x^(2k+1)); Terme k in [a, b): Q = prod q_k (q_0 = 1, q_k = x^2), B = prod (2k+1), T = S*B*Q
function bsAcoth(x, a, b) {
    if (b - a === 1) {
        const Q = newMpz(), B = newMpz(), T = newMpz();
        g.mpz_set_ui(Q, a === 0 ? 1 : x * x);
        g.mpz_set_ui(B, 2 * a + 1);
        g.mpz_set_ui(T, 1);
        return [Q, B, T];
    }
    const m = Math.floor((a + b) / 2);
    const [Q1, B1, T1] = bsAcoth(x, a, m);
    const [Q2, B2, T2] = bsAcoth(x, m, b);
    const t = newMpz();
    g.mpz_mul(t, B2, Q2);
    g.mpz_mul(T1, T1, t);
    freeMpz(t);
    g.mpz_mul(T2, T2, B1);
    g.mpz_add(T1, T1, T2);
    g.mpz_mul(Q1, Q1, Q2);
    g.mpz_mul(B1, B1, B2);
    freeMpz(Q2); freeMpz(B2); freeMpz(T2);
    return [Q1, B1, T1];
}

function calcLn2(n) {
    const acc = newMpz(), r = newMpz();
    try {
        for (const [coef, x] of LN2_TERMS) {
            const N = Math.ceil((n + 10) / (2 * Math.log10(x))) + 1;
            assertU32(2 * N + 1);
            const [Q, B, T] = bsAcoth(x, 0, N);
            const s = pow10(n); // erst nach bsAcoth: eine ueber die Rekursion gehaltene Potenz hob den Spitzenspeicher auf 14,4 B/Stelle (Test A4)
            g.mpz_mul(T, T, s);
            freeMpz(s);
            g.mpz_mul(Q, Q, B);
            g.mpz_mul_ui(Q, Q, x);
            g.mpz_tdiv_q(r, T, Q);          // floor(10^n * acoth(x))
            freeMpz(Q); freeMpz(B); freeMpz(T);
            if (coef > 0) g.mpz_addmul_ui(acc, r, coef); else g.mpz_submul_ui(acc, r, -coef);
        }
        return acc;
    } catch (e) {
        freeMpz(acc);
        throw e;
    } finally {
        freeMpz(r);
    }
}

// ---------- Wurzeln ----------

function calcSqrt(n, radicand) {
    const r = newMpz(), t = pow10(2 * n);
    try {
        g.mpz_mul_ui(t, t, radicand);
        g.mpz_sqrt(r, t);
        return r;
    } catch (e) {
        freeMpz(r);
        throw e;
    } finally {
        freeMpz(t);
    }
}

function calcPhi(n) {
    const s = calcSqrt(n, 5);
    const one = pow10(n);
    try {
        g.mpz_add(s, s, one);
        g.mpz_tdiv_q_2exp(s, s, 1);
        return s;
    } catch (e) {
        freeMpz(s);
        throw e;
    } finally {
        freeMpz(one);
    }
}

function calcWasm(n) {
    switch (id) {
        case 'pi': return calcPi(n);
        case 'e': return calcE(n);
        case 'ln2': return calcLn2(n);
        case 'sqrt2': return calcSqrt(n, 2);
        case 'phi': return calcPhi(n);
        default: throw new Error('unbekannte Konstante ' + id);
    }
}

// Stufe mit GMP: Ziffern [have, target) als Uint8Array (ASCII); prueft die Stufenkopf-Stellen gegen die erste Stufe.
function stageWasm(target) {
    const n = target + GUARD;
    const r = calcWasm(n);
    let ptr = 0;
    try {
        ptr = g.mpz_get_str(0, 10, r) >>> 0;
        const mem = new Uint8Array(g.mem.buffer);
        const len = n + intLen;
        if (mem[ptr + len] !== 0) throw new Error('unerwartete Ziffernzahl des Ergebnisses (Rechenfehler)');
        checkGuard(mem, ptr + intLen, target);
        checkHead(mem.subarray(ptr + intLen, ptr + intLen + Math.min(HEAD_CHECK, target)));
        const out = new Uint8Array(target - have);
        out.set(mem.subarray(ptr + intLen + have, ptr + intLen + target));
        return out;
    } finally {
        if (ptr) g.free(ptr);
        freeMpz(r);
    }
}

// Schutzstellen duerfen nicht alle 0 oder alle 9 sein (sonst koennte der Rechenfehler die letzten freigegebenen Stellen kippen).
function checkGuard(bytes, off, target) {
    let z = true, nine = true;
    for (let i = 0; i < GUARD; i++) {
        const c = bytes[off + target + i];
        if (c !== 48) z = false;
        if (c !== 57) nine = false;
    }
    if (z || nine) throw new Error('Schutzstellen nicht eindeutig (alle ' + (z ? '0' : '9') + '), Stelle ' + target + ' nicht sicher');
}

function checkHead(h) {
    if (head === null) { head = Uint8Array.from(h); return; }
    const k = Math.min(head.length, h.length);
    for (let i = 0; i < k; i++) {
        if (head[i] !== h[i]) throw new Error('Kontrollstellen stimmen nicht mit der ersten Stufe ueberein (Stelle ' + (i + 1) + ')');
    }
}

// ---------- BigInt-Rueckfall ----------

function checkBits(v) {
    if (cfg.bigintMaxBits && v > (1n << BigInt(cfg.bigintMaxBits))) throw new RangeError('Maximum BigInt size exceeded (test limit)');
    return v;
}

function bsPiBig(a, b) {
    if (b - a === 1n) {
        let P, Q;
        if (a === 0n) { P = 1n; Q = 1n; } else {
            P = (6n * a - 5n) * (2n * a - 1n) * (6n * a - 1n);
            Q = a * a * a * C3_OVER_24;
        }
        let T = P * (13591409n + 545140134n * a);
        if (a & 1n) T = -T;
        return [P, Q, T];
    }
    const m = (a + b) / 2n;
    const [P1, Q1, T1] = bsPiBig(a, m);
    const [P2, Q2, T2] = bsPiBig(m, b);
    return [checkBits(P1 * P2), checkBits(Q1 * Q2), checkBits(Q2 * T1 + P1 * T2)];
}

function bsEBig(a, b) {
    if (b - a === 1n) return [a, 1n];
    const m = (a + b) / 2n;
    const [Q1, T1] = bsEBig(a, m);
    const [Q2, T2] = bsEBig(m, b);
    return [checkBits(Q1 * Q2), checkBits(T1 * Q2 + T2)];
}

function bsAcothBig(x, a, b) {
    if (b - a === 1n) return [a === 0n ? 1n : x * x, 2n * a + 1n, 1n];
    const m = (a + b) / 2n;
    const [Q1, B1, T1] = bsAcothBig(x, a, m);
    const [Q2, B2, T2] = bsAcothBig(x, m, b);
    return [checkBits(Q1 * Q2), checkBits(B1 * B2), checkBits(T1 * B2 * Q2 + T2 * B1)];
}

function isqrtBig(n) {
    return isqrtBitsBig(n, n.toString(2).length);
}

function isqrtBitsBig(n, bits) {
    if (n < (1n << 52n)) {
        let r = BigInt(Math.floor(Math.sqrt(Number(n))));
        while (r * r > n) r--;
        while ((r + 1n) * (r + 1n) <= n) r++;
        return r;
    }
    const s = bits >> 2;
    const a = isqrtBitsBig(n >> BigInt(2 * s), bits - 2 * s);
    const x = (a + 1n) << BigInt(s);
    let y = (x + n / x) >> 1n;
    let d = n - y * y;
    while (d < 0n) { d += 2n * y - 1n; y--; }
    return y;
}

// floor(wert * 10^n) als BigInt
function calcBig(n) {
    const one = checkBits(10n ** BigInt(n));
    switch (id) {
        case 'pi': {
            const terms = BigInt(Math.floor(n / 14.18) + 2);
            const [, Q, T] = bsPiBig(0n, terms);
            return checkBits(Q * 426880n * isqrtBig(checkBits(10005n * one * one))) / T;
        }
        case 'e': {
            const [Q, T] = bsEBig(1n, BigInt(termsForE(n)) + 1n);
            return checkBits(one * (Q + T)) / Q;
        }
        case 'ln2': {
            let acc = 0n;
            for (const [coef, x] of LN2_TERMS) {
                const N = BigInt(Math.ceil((n + 10) / (2 * Math.log10(x))) + 1);
                const [Q, B, T] = bsAcothBig(BigInt(x), 0n, N);
                acc += BigInt(coef) * (checkBits(one * T) / (Q * B * BigInt(x)));
            }
            return acc;
        }
        case 'sqrt2': return isqrtBig(checkBits(2n * one * one));
        case 'phi': return (one + isqrtBig(checkBits(5n * one * one))) >> 1n;
        default: throw new Error('unbekannte Konstante ' + id);
    }
}

function stageBig(target) {
    const n = target + GUARD;
    const s = calcBig(n).toString();
    if (s.length !== n + intLen) throw new Error('unerwartete Ziffernzahl des Ergebnisses (Rechenfehler)');
    const bytes = new TextEncoder().encode(s);
    checkGuard(bytes, intLen, target);
    checkHead(bytes.subarray(intLen, intLen + Math.min(HEAD_CHECK, target)));
    return bytes.slice(intLen + have, intLen + target);
}

// ---------- Hauptschleife ----------

function work() {
    if (busy || failed || limited || !ready) return;
    busy = true;
    let target = 0;
    try {
        if (mode === 'wasm' && cfg.ballastBytes) makeBallast();
        while (have < wanted && !limited) {
            target = Math.max(wanted, have * 2, MIN_STAGE);
            if (mode === 'wasm') {
                const fit = fitDigits();
                if (target > fit) target = fit; // MUT:precheck
                if (target <= have) {
                    limit('engine', 'next stage needs about ' + Math.round(estimateBytes(Math.max(wanted, have + 1)) / 2 ** 20) + ' MiB, module maximum is ' + Math.round(maxBytes() / 2 ** 20) + ' MiB');
                    break;
                }
            } else {
                target = Math.min(target, bigFail - 1);
                if (target <= have) {
                    limit('engine', 'BigInt size limit of this browser engine (no WebAssembly)');
                    break;
                }
            }
            let buf;
            if (mode === 'wasm') {
                buf = stageWasm(target);
            } else {
                try {
                    buf = stageBig(target);
                } catch (e) {
                    if (!(e instanceof RangeError)) throw e;
                    bigFail = have + Math.floor((target - have) / 2) + 1; // Grenze halbieren, bis Zuwachs <= MIN_STAGE
                    if (target - have <= MIN_STAGE) {
                        limit('engine', 'BigInt size limit of this browser engine (no WebAssembly): ' + e.message);
                        break;
                    }
                    continue;
                }
            }
            const from = have;
            have = target;
            postMessage({ type: 'digits', from, buf, total: have, memBytes: memBytes(), maxPtr }, [buf.buffer]);
        }
    } catch (e) {
        if (mode === 'wasm' && isAllocFailure(e)) {
            const cur = memBytes();
            const req = estimateBytes(target);
            const reason = 'allocation failed at ' + Math.round(cur / 2 ** 20) + ' MiB (' + (e && e.message ? e.message : e) + ')';
            if (cur + req <= maxBytes()) limit('device', reason); // MUT:classify
            else limit('engine', reason);
        } else {
            fail('irrational-worker: ' + id + ' computation failed: ' + (e && e.stack ? e.stack : e));
        }
    } finally {
        busy = false;
    }
}

// Nur Tests: belegt Speicher in 64-MiB-Bloecken, gibt den letzten wieder frei; die naechsten Allokationen liegen dann ueber 2 GiB.
function makeBallast() {
    const chunk = 64 * 2 ** 20;
    let total = 0, last = 0;
    while (total < cfg.ballastBytes) {
        const p = g.malloc(chunk) >>> 0;
        if (!p) throw new Error('Fatal error in gmp-wasm (ballast malloc failed at ' + total + ' bytes)');
        last = p;
        total += chunk;
    }
    if (last) g.free(last);
    cfg.ballastBytes = 0;
}

function start() {
    const info = (m) => postMessage({ type: 'info', mode: m, maxPages: cfg.maxPages });
    const toBigInt = (why) => {
        mode = 'bigint';
        ready = true;
        const message = why + ': ' + id + ' is computed with BigInt, the number of digits is limited';
        console.warn('[irrational-worker] ' + message);
        postMessage({ type: 'notice', message });
        info('bigint');
        work();
    };
    if (!wasmUsable()) return toBigInt('WebAssembly not available');
    try {
        importScripts(BUNDLE);
        self.gmp.init().then((lib) => {
            g = lib.binding;
            mode = 'wasm';
            ready = true;
            info('wasm');
            work();
        }).catch((e) => toBigInt('GMP/WASM could not be loaded (' + (e && e.message ? e.message : e) + ')'));
    } catch (e) {
        toBigInt('GMP/WASM could not be loaded (' + (e && e.message ? e.message : e) + ')');
    }
}

onmessage = (ev) => {
    const m = ev.data || {};
    if (m.type === 'test') {
        if (id !== null) return fail('irrational-worker: test message after open');
        for (const k of Object.keys(cfg)) if (k in m) cfg[k] = m[k];
    } else if (m.type === 'open') {
        if (id !== null) return fail('irrational-worker: open called twice');
        if (!BYTES_PER_DIGIT[m.id]) return fail('irrational-worker: unknown constant ' + m.id);
        if (!Number.isInteger(m.intLen) || m.intLen < 0) return fail('irrational-worker: open without valid intLen');
        id = m.id;
        intLen = m.intLen;
        start();
    } else if (m.type === 'want') {
        wanted = Math.max(wanted, Math.floor(m.total) || 0);
        work();
    }
};
