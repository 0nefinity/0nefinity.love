/**
 * Irrational: Stellen irrationaler Konstanten im Browser (global `Irrational`, kein Bundler, keine UI).
 * Rechnet im Worker /tools/workers/irrational-worker.js (GMP/WASM, Rueckfall BigInt).
 *
 *   const h = Irrational.open('pi', {
 *     onDigits(u8, offset) {},          // u8: ASCII-Ziffern '0'..'9', offset = Nachkommastelle des ersten Bytes (0 = erste nach dem Komma)
 *     onLimit({ kind, reason, digits }) {}, // kind 'engine' (Rechenwerk-Grenze) | 'device' (Geraet gibt keinen Speicher mehr)
 *     onNotice(message) {},             // nicht sperrend: Rueckfall auf BigInt (kein WebAssembly)
 *     onError(err) {},                  // alles andere, laut
 *   });
 *   h.want(n); h.state(); h.close();
 */
(function (root) {
    'use strict';

    const WORKER_URL = '/tools/workers/irrational-worker.js';

    // intPart: Ganzzahlteil, nicht in den gelieferten Stellen enthalten (onDigits liefert nur Nachkommastellen).
    const constants = [
        { id: 'pi', name: 'Kreiszahl', symbol: 'π', intPart: '3', algorithm: 'Chudnovsky, binary splitting', source: 'https://en.wikipedia.org/wiki/Chudnovsky_algorithm' },
        { id: 'e', name: 'Eulersche Zahl', symbol: 'e', intPart: '2', algorithm: 'Taylor series sum 1/k!, binary splitting', source: 'https://en.wikipedia.org/wiki/E_(mathematical_constant)' },
        { id: 'ln2', name: 'Natuerlicher Logarithmus von 2', symbol: 'ln 2', intPart: '0', algorithm: 'Machin-like acoth formula, binary splitting', source: 'https://en.wikipedia.org/wiki/Natural_logarithm_of_2' },
        { id: 'sqrt2', name: 'Wurzel aus 2', symbol: '√2', intPart: '1', algorithm: 'integer square root (mpz_sqrt)', source: 'https://en.wikipedia.org/wiki/Square_root_of_2' },
        { id: 'phi', name: 'Goldener Schnitt', symbol: 'φ', intPart: '1', algorithm: 'integer square root (mpz_sqrt), (1+sqrt5)/2', source: 'https://en.wikipedia.org/wiki/Golden_ratio' },
    ];

    function open(id, handlers, testOptions) {
        const c = constants.find((k) => k.id === id);
        if (!c) throw new Error('Irrational.open: unbekannte Konstante ' + id);
        const h = handlers || {};
        const worker = new Worker(WORKER_URL);
        const st = { digits: 0, limit: null, algorithm: c.algorithm };
        let closed = false;

        const err = (message) => {
            const e = new Error(message);
            console.error('[Irrational] ' + message);
            if (h.onError) h.onError(e);
            else throw e;
        };

        worker.onmessage = (ev) => {
            if (closed) return;
            const m = ev.data;
            if (m.type === 'digits') {
                st.digits = m.total;
                if (h.onDigits) h.onDigits(m.buf, m.from);
            } else if (m.type === 'notice') {
                st.algorithm = c.algorithm + ' (BigInt fallback)';
                if (h.onNotice) h.onNotice(m.message);
            } else if (m.type === 'limit') {
                st.limit = { kind: m.kind, reason: m.reason, digits: m.digits };
                if (m.kind === 'engine') console.warn('[Irrational] ' + id + ': engine limit at ' + m.digits + ' digits: ' + m.reason);
                if (h.onLimit) h.onLimit(st.limit);
            } else if (m.type === 'error') {
                err(m.message);
            }
        };
        worker.onerror = (ev) => err('Worker-Fehler: ' + (ev.message || 'unbekannt'));

        if (testOptions) worker.postMessage(Object.assign({ type: 'test' }, testOptions));
        worker.postMessage({ type: 'open', id, intLen: c.intPart === '0' ? 0 : c.intPart.length }); // ln2: der Ergebnis-String hat keine fuehrende 0

        return {
            want(n) { if (!closed) worker.postMessage({ type: 'want', total: n }); },
            close() { closed = true; worker.terminate(); },
            state() { return { digits: st.digits, limit: st.limit, algorithm: st.algorithm }; },
        };
    }

    root.Irrational = { constants, open };
})(typeof self !== 'undefined' ? self : this);
