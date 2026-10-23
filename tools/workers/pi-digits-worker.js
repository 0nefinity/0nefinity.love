/**
 * Pi-Stellen-Worker (unbegrenzt, BigInt, Chudnovsky mit Binary Splitting).
 *
 * Nachrichten an den Worker:
 *   { type: 'init', reference: '3141...' }   Referenz-Anfang (Ziffern inkl. 3, ohne Punkt) zur Selbstprüfung
 *   { type: 'need', total: N }               mindestens N Nachkommastellen liefern
 *
 * Nachrichten vom Worker:
 *   { type: 'digits', from, str }            Nachkommastellen from.. (0 = erste Stelle nach dem Punkt)
 *   { type: 'error', message }               Fehler oder falsche Stellen: danach liefert der Worker nichts mehr
 */
'use strict';

const C3_OVER_24 = 640320n ** 3n / 24n;
const GUARD = 30;

let have = 0;
let reference = '';
let failed = false;
let busy = false;
let wanted = 0;

function bs(a, b) {
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
    const [P1, Q1, T1] = bs(a, m);
    const [P2, Q2, T2] = bs(m, b);
    return [P1 * P2, Q1 * Q2, Q2 * T1 + P1 * T2];
}

function isqrt(n) {
    if (n < 2n) return n;
    let x = 1n << BigInt((n.toString(2).length + 1) >> 1);
    for (;;) {
        const y = (x + n / x) >> 1n;
        if (y >= x) return x;
        x = y;
    }
}

function piDigits(decimals) {
    const n = BigInt(decimals + GUARD);
    const one = 10n ** n;
    const terms = BigInt(Math.floor((decimals + GUARD) / 14.18) + 2);
    const [, Q, T] = bs(0n, terms);
    const sqrtC = isqrt(10005n * one * one);
    const pi = (Q * 426880n * sqrtC) / T;
    return pi.toString().slice(0, decimals + 1); // "3" + Nachkommastellen
}

function fail(message) {
    failed = true;
    postMessage({ type: 'error', message });
}

function work() {
    if (busy || failed) return;
    busy = true;
    try {
        while (have < wanted) {
            const target = Math.max(wanted, have * 2, 2000);
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
        wanted = Math.max(wanted, Math.floor(m.total) || 0);
        work();
    }
};
