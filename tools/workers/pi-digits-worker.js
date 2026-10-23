/**
 * Pi-Stellen-Worker (unbegrenzt, GMP/WASM, Chudnovsky mit Binary Splitting).
 *
 * Die Ganzzahlen liegen im WASM-Speicher von GMP, nicht in JS-BigInt: BigInt hat je Engine eine feste
 * Größengrenze (Firefox/Safari 2^20 Bit, Chromium 2^30 Bit), GMP nur die Grenze des Gerätespeichers.
 *
 * Nachrichten an den Worker:
 *   { type: 'init', reference: '3141...' }   Referenz-Anfang (Ziffern inkl. 3, ohne Punkt) zur Selbstprüfung
 *   { type: 'need', total: N }               Front: N Nachkommastellen werden gebraucht, der Worker hält VORRAT mal N bereit
 *
 * Ohne nutzbares WebAssembly (z. B. Safari im Lockdown-Modus) rechnet der Worker dieselbe Chudnovsky-Rechnung mit
 * JS-BigInt (Rückfall, begrenzt auf wenige 100.000 Stellen) und meldet das einmal als 'notice'.
 *
 * Herkunft und Lizenz: gmp-wasm 1.3.2 (https://github.com/Daninet/gmp-wasm, npm "gmp-wasm", Datei dist/mini.umd.min.js,
 * unverändert) bindet GMP (https://gmplib.org) ein; beide LGPL-3.0-only. Lizenztexte same-origin:
 * /tools/vendor/gmp-wasm/LICENSE-LGPL-3.0.txt und /tools/vendor/gmp-wasm/LICENSE-GPL-3.0.txt (LGPL-3.0 baut auf der GPL-3.0 auf),
 * Herkunft in /tools/vendor/gmp-wasm/README.md. Die Bibliothek bleibt als eigene Datei austauschbar.
 *
 * Nachrichten vom Worker:
 *   { type: 'notice', message }              Hinweis ohne Abbruch (Rückfall auf BigInt); die Seite rechnet weiter
 *   { type: 'digits', from, str }            Nachkommastellen from.. (0 = erste Stelle nach dem Punkt)
 *   { type: 'error', message }               Fehler oder falsche Stellen: danach liefert der Worker nichts mehr
 */
'use strict';

const GUARD = 30;
// Vorrat: der Worker hält mindestens VORRAT mal die gemeldete Front bereit und wächst je Stufe um denselben Faktor.
const VORRAT = 2;

let g = null; // GMP-Binding, gesetzt sobald das WASM instanziiert ist
let useBigInt = false; // Rückfall ohne WebAssembly
// BigInt hat je Engine eine feste Größengrenze; sie wird beim Vorrechnen gesucht (halbieren bis auf BIG_SUCHE Stellen genau).
const BIG_SUCHE = 2000;
let bigFail = Infinity; // kleinste Stellenzahl, an der BigInt scheiterte
let bigDone = false;    // Grenze auf BIG_SUCHE Stellen eingegrenzt: nicht weiter suchen
let bigError = '';
let front = 0;          // zuletzt gemeldete Front der Seite
let ready = false;
const C3_OVER_24 = 640320n ** 3n / 24n;
let have = 0;
let reference = '';
let failed = false;
let busy = false;
let wanted = 0;

function fail(message) {
    failed = true;
    postMessage({ type: 'error', message });
}

// WebAssembly vorhanden und benutzbar? Lockdown-Modus entfernt das Objekt oder lässt Module() scheitern.
function wasmUsable() {
    try {
        return typeof WebAssembly === 'object' && typeof WebAssembly.Module === 'function' &&
            new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])) instanceof WebAssembly.Module;
    } catch (e) {
        return false;
    }
}

function newMpz() {
    const p = g.mpz_t();
    g.mpz_init(p);
    return p;
}

function freeMpz(p) {
    g.mpz_clear(p);
    g.free(p);
}

// Binary Splitting über die Terme [a, b). Rückgabe [P, Q, T] als GMP-Zeiger; der Aufrufer gibt sie frei.
// P wird nur gebraucht, wo ein Elternknoten es multipliziert; am rechten Rand (needP = false) entfällt es.
function bs(a, b, needP, c3over24) {
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
        // T = P * (13591409 + 545140134 * a), negativ bei ungeradem a
        g.mpz_set_ui(T, 545140134);
        g.mpz_mul_ui(T, T, a);
        g.mpz_add_ui(T, T, 13591409);
        g.mpz_mul(T, T, P);
        if (a & 1) g.mpz_neg(T, T);
        if (!needP) { freeMpz(P); return [0, Q, T]; }
        return [P, Q, T];
    }
    const m = Math.floor((a + b) / 2);
    const [P1, Q1, T1] = bs(a, m, true, c3over24);
    const [P2, Q2, T2] = bs(m, b, needP, c3over24);
    // T = Q2*T1 + P1*T2, P = P1*P2, Q = Q1*Q2 (jeweils in Q1/T1/P1, die Hälften werden freigegeben)
    g.mpz_mul(T1, T1, Q2);
    g.mpz_addmul(T1, P1, T2);
    g.mpz_mul(Q1, Q1, Q2);
    if (needP) g.mpz_mul(P1, P1, P2);
    freeMpz(Q2); freeMpz(T2);
    if (P2) freeMpz(P2);
    if (!needP) freeMpz(P1);
    return [needP ? P1 : 0, Q1, T1];
}

function piDigits(decimals) {
    const n = decimals + GUARD;
    const terms = Math.floor(n / 14.18) + 2;
    if (6 * terms >= 2 ** 32) throw new Error('Rechenwerk-Grenze (32-Bit-Faktoren) erreicht');
    const c3over24 = newMpz();
    const sqrtC = newMpz(), pi = newMpz(), one = newMpz();
    try {
        // 640320^3 / 24
        g.mpz_ui_pow_ui(c3over24, 640320, 3);
        g.mpz_tdiv_q_2exp(c3over24, c3over24, 3); // /8
        const three = newMpz();
        g.mpz_set_ui(three, 3);
        g.mpz_tdiv_q(c3over24, c3over24, three);
        freeMpz(three);
        const [, Q, T] = bs(0, terms, false, c3over24);
        g.mpz_ui_pow_ui(one, 10, n);
        g.mpz_mul(one, one, one);
        g.mpz_mul_ui(one, one, 10005);
        g.mpz_sqrt(sqrtC, one);
        g.mpz_mul(Q, Q, sqrtC);
        g.mpz_mul_ui(Q, Q, 426880);
        g.mpz_tdiv_q(pi, Q, T);
        freeMpz(Q); freeMpz(T);
        // mpz_get_str liefert einen Zeiger auf ASCII-Ziffern im WASM-Speicher: "3" + Nachkommastellen
        const ptr = g.mpz_get_str(0, 10, pi);
        const str = new TextDecoder().decode(g.mem.subarray(ptr, ptr + decimals + 1));
        g.free(ptr);
        return str;
    } finally {
        freeMpz(c3over24); freeMpz(sqrtC); freeMpz(pi); freeMpz(one);
    }
}

function bsBig(a, b) {
    if (b - a === 1n) {
        let P, Q;
        if (a === 0n) {
            P = 1n; Q = 1n;
        } else {
            P = (6n * a - 5n) * (2n * a - 1n) * (6n * a - 1n);
            Q = a * a * a * C3_OVER_24;
        }
        let T = P * (13591409n + 545140134n * a);
        if (a & 1n) T = -T;
        return [P, Q, T];
    }
    const m = (a + b) / 2n;
    const [P1, Q1, T1] = bsBig(a, m);
    const [P2, Q2, T2] = bsBig(m, b);
    return [P1 * P2, Q1 * Q2, Q2 * T1 + P1 * T2];
}

// Newton mit Genauigkeitsverdopplung: Wurzel der oberen Hälfte der Bits, dann ein Newton-Schritt in voller Länge.
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

function piDigitsBig(decimals) {
    const n = BigInt(decimals + GUARD);
    const one = 10n ** n;
    const terms = BigInt(Math.floor((decimals + GUARD) / 14.18) + 2);
    const [, Q, T] = bsBig(0n, terms);
    const sqrtC = isqrtBig(10005n * one * one);
    const pi = (Q * 426880n * sqrtC) / T;
    return pi.toString().slice(0, decimals + 1); // "3" + Nachkommastellen
}


function work() {
    if (busy || failed || !ready) return;
    busy = true;
    try {
        while (have < wanted) {
            let target = Math.max(wanted, have * VORRAT, 2000);
            let s = null;
            if (useBigInt) {
                // Vorrat darf an der Engine-Grenze scheitern; nur wenn die Front selbst nicht mehr bedient werden kann, endet es laut.
                while (s === null && !bigDone) {
                    target = Math.min(target, bigFail - 1);
                    if (target <= have) break;
                    try {
                        s = piDigitsBig(target);
                    } catch (e) {
                        bigFail = target;
                        bigError = e && e.message ? e.message : String(e);
                        if (target - have > BIG_SUCHE) target = have + Math.floor((target - have) / 2);
                        else bigDone = true;
                    }
                }
                if (s === null) {
                    if (have < front) throw new Error('BigInt-Grenze erreicht bei ' + have + ' Stellen (' + bigError + ')');
                    return;
                }
            } else {
                s = piDigits(target);
            }
            if (reference) {
                if (!(s.length >= reference.length ? s.startsWith(reference) : reference.startsWith(s))) {
                    fail('Pi-Referenz stimmt nicht mit den berechneten Stellen überein');
                    return;
                }
            }
            const str = s.slice(1 + have);
            postMessage({ type: 'digits', from: have, str });
            have = target;
        }
    } catch (e) {
        fail('Pi-Berechnung fehlgeschlagen: ' + (e && e.message ? e.message : e));
    } finally {
        busy = false;
    }
}

onmessage = (ev) => {
    const m = ev.data || {};
    if (m.type === 'init') {
        reference = String(m.reference || '');
    } else if (m.type === 'need') {
        front = Math.max(front, Math.floor(m.total) || 0);
        wanted = Math.max(wanted, VORRAT * (Math.floor(m.total) || 0));
        work();
    }
};

if (!wasmUsable()) {
    useBigInt = true;
    ready = true;
    const message = 'WebAssembly nicht verfügbar: Pi wird mit BigInt gerechnet, die Stellenzahl ist begrenzt';
    console.warn('[pi-digits-worker] ' + message);
    postMessage({ type: 'notice', message });
} else {
    try {
        importScripts('/tools/vendor/gmp-wasm/gmp-wasm-1.3.2.mini.umd.min.js');
        self.gmp.init().then((lib) => {
            g = lib.binding;
            ready = true;
            work();
        }).catch((e) => fail('Pi-Rechenwerk nicht ladbar: ' + (e && e.message ? e.message : e)));
    } catch (e) {
        fail('Pi-Rechenwerk nicht ladbar: ' + (e && e.message ? e.message : e));
    }
}
