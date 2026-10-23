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
 * Nachrichten vom Worker:
 *   { type: 'digits', from, str }            Nachkommastellen from.. (0 = erste Stelle nach dem Punkt)
 *   { type: 'error', message }               Fehler oder falsche Stellen: danach liefert der Worker nichts mehr
 */
'use strict';

const GUARD = 30;
// Vorrat: der Worker hält mindestens VORRAT mal die gemeldete Front bereit und wächst je Stufe um denselben Faktor.
const VORRAT = 2;

let g = null; // GMP-Binding, gesetzt sobald das WASM instanziiert ist
let have = 0;
let reference = '';
let failed = false;
let busy = false;
let wanted = 0;

function fail(message) {
    failed = true;
    postMessage({ type: 'error', message });
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

function work() {
    if (busy || failed || !g) return;
    busy = true;
    try {
        while (have < wanted) {
            const target = Math.max(wanted, have * VORRAT, 2000);
            const s = piDigits(target);
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
        wanted = Math.max(wanted, VORRAT * (Math.floor(m.total) || 0));
        work();
    }
};

try {
    importScripts('/tools/vendor/gmp-wasm/gmp-wasm-1.3.2.mini.umd.min.js');
    self.gmp.init().then((lib) => {
        g = lib.binding;
        work();
    }).catch((e) => fail('Pi-Rechenwerk nicht ladbar: ' + (e && e.message ? e.message : e)));
} catch (e) {
    fail('Pi-Rechenwerk nicht ladbar: ' + (e && e.message ? e.message : e));
}
