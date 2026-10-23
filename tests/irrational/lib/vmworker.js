'use strict';
// Laedt tools/workers/irrational-worker.js unveraendert in einen vm-Kontext mit Worker-Globals
// (postMessage, onmessage, importScripts, self). Eigene Realm, Nachrichten werden gesammelt.
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const DEFAULT_WORKER = path.join(ROOT, 'tools/workers/irrational-worker.js');

function createWorker(opts = {}) {
    const workerPath = opts.workerPath || process.env.IRRATIONAL_WORKER || DEFAULT_WORKER;
    const messages = [];
    const warnings = [];
    const waiters = [];
    const ctx = {
        console: { log: console.log, error: console.error, warn: (...a) => warnings.push(a.join(' ')) },
        TextDecoder, TextEncoder,
        WebAssembly: opts.noWasm ? undefined : WebAssembly,
        BigInt, Math, Promise, Error, RangeError, TypeError, setTimeout, clearTimeout,
        onmessage: null,
    };
    ctx.self = ctx;
    ctx.globalThis = ctx;
    ctx.postMessage = (msg, transfer) => {
        messages.push(msg);
        for (const w of waiters.slice()) w();
    };
    ctx.importScripts = (url) => {
        if (opts.failImport) throw new Error('importScripts blockiert (Test)');
        const f = path.join(ROOT, url.replace(/^\//, ''));
        vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
    };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(workerPath, 'utf8'), ctx, { filename: workerPath });
    if (typeof ctx.onmessage !== 'function') throw new Error('Worker setzt onmessage nicht');

    const api = {
        messages, warnings,
        send(msg) { ctx.onmessage({ data: msg }); },
        waitFor(pred, ms = 120000) {
            return new Promise((resolve, reject) => {
                const check = () => {
                    const hit = messages.find(pred);
                    if (hit) { cleanup(); resolve(hit); }
                };
                const t = setTimeout(() => { cleanup(); reject(new Error('Zeitueberschreitung beim Warten auf Nachricht')); }, ms);
                const cleanup = () => { clearTimeout(t); const i = waiters.indexOf(check); if (i >= 0) waiters.splice(i, 1); };
                waiters.push(check);
                check();
            });
        },
        // Alle bisher gelieferten Ziffern als String (prueft zugleich Luecken und Reihenfolge).
        digits() {
            let s = '';
            for (const m of messages) {
                if (m.type !== 'digits') continue;
                if (m.from !== s.length) throw new Error('Luecke/Ueberlappung: from=' + m.from + ' erwartet ' + s.length);
                s += Buffer.from(m.buf.buffer, m.buf.byteOffset, m.buf.length).toString('latin1');
            }
            return s;
        },
        async digitsUpTo(n, timeout) {
            await api.waitFor((m) => (m.type === 'digits' && m.from + m.buf.length >= n) || m.type === 'limit' || m.type === 'error', timeout);
            return api.digits();
        },
    };
    return api;
}

function ref(id) {
    return fs.readFileSync(path.join(__dirname, '..', 'ref', id + '.txt'), 'latin1');
}

module.exports = { createWorker, ref, ROOT, DEFAULT_WORKER };
