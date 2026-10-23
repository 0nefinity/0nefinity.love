'use strict';
// Node-Tests der Engine (tools/workers/irrational-worker.js im vm-Kontext) gegen mpmath-Referenzen.
// Aufruf: node test_engine.js [a1|a2|a3|a4|stages|all]   (Env IRRATIONAL_WORKER = Mutant-Worker)
const { createWorker, ref } = require('./lib/vmworker');
const path = require('path');
const { memoryLimits } = require('./lib/wasm-limits');
const { ROOT } = require('./lib/vmworker');

const IDS = ['pi', 'e', 'ln2', 'sqrt2', 'phi'];
let fails = 0;
function check(name, ok, info) { console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  ' + info : '')); if (!ok) fails++; }
const which = process.argv[2] || 'all';
const run = (k) => which === 'all' || which === k;

async function stages() {
    for (const id of IDS) {
        const w = createWorker();
        w.send({ type: 'open', id });
        w.send({ type: 'want', total: 1000 });
        await w.digitsUpTo(1000);
        w.send({ type: 'want', total: 100000 });
        const s = await w.digitsUpTo(100000);
        const r = ref(id);
        const info = w.messages.find((m) => m.type === 'info');
        const blocks = w.messages.filter((m) => m.type === 'digits').length;
        check('Stufen ' + id + ': 1e5 Stellen == mpmath, lueckenlos, Modus wasm', s.length >= 100000 && s.slice(0, 100000) === r.slice(0, 100000) && info && info.mode === 'wasm',
            'Bloecke=' + blocks + ' Stellen=' + s.length);
        check('Stufen ' + id + ': mehr als ein Block (nur neue Stellen)', blocks >= 2);
        check('Stufen ' + id + ': kein error/limit', !w.messages.some((m) => m.type === 'error' || m.type === 'limit'), JSON.stringify(w.messages.find((m) => m.type === 'error' || m.type === 'limit') || ''));
    }
    // pi 4e5 gegen Referenz
    const w = createWorker();
    w.send({ type: 'open', id: 'pi' });
    w.send({ type: 'want', total: 400000 });
    const s = await w.digitsUpTo(400000);
    check('pi 4e5 Stellen == mpmath', s.slice(0, 400000) === ref('pi'));
}

async function a1() {
    const l = await memoryLimits(path.join(ROOT, 'tools/vendor/gmp-wasm/gmp-wasm-1.3.2.mini.4gib.umd.min.js'));
    const w = createWorker();
    const GiB = 1024 ** 3;
    w.send({ type: 'test', ballastBytes: 2.3 * GiB });
    w.send({ type: 'open', id: 'pi' });
    w.send({ type: 'want', total: 100000 });
    const s = await w.digitsUpTo(100000, 200000);
    const err = w.messages.find((m) => m.type === 'error' || m.type === 'limit');
    const info = w.messages.find((m) => m.type === 'info');
    const last = w.messages.filter((m) => m.type === 'digits').pop();
    check('A1 Worker-Maximum == Maximum im Bundle (65536 Seiten)', info && info.maxPages === 65536 && l.max === 65536, JSON.stringify({ worker: info && info.maxPages, bundle: l.max }));
    check('A1 > 2 GiB belegt', last && last.memBytes > 2 * GiB, 'memBytes=' + (last && (last.memBytes / GiB).toFixed(2)) + ' GiB');
    check('A1 Zeiger >= 2^31 gelesen (>>> 0)', last && last.maxPtr >= 2 ** 31, 'maxPtr=' + (last && last.maxPtr));
    check('A1 danach 1e5 Stellen pi korrekt', !err && s.slice(0, 100000) === ref('pi').slice(0, 100000), err ? JSON.stringify(err) : '');
}

async function a2() {
    // engine VOR dem Rechnen: Maximum 0 -> sofort limit; failOther wuerde bei jedem Rechenversuch 'error' ausloesen
    {
        const w = createWorker();
        w.send({ type: 'test', maxPages: 0, failOther: true });
        w.send({ type: 'open', id: 'pi' });
        w.send({ type: 'want', total: 5000 });
        const lim = await w.waitFor((m) => m.type === 'limit' || m.type === 'error');
        check('A2 engine vor dem Rechnen (kein Rechenversuch, keine Ziffern)', lim.type === 'limit' && lim.kind === 'engine' && lim.digits === 0 && !w.messages.some((m) => m.type === 'digits'), JSON.stringify(lim));
    }
    // engine: Maximum kuenstlich gesenkt, Limit vor dem Rechnen (keine Ziffern ueber dem Limit, kein Rechnen noetig)
    {
        const w = createWorker();
        w.send({ type: 'test', maxPages: 270 }); // 270 Seiten = ca. 17,7 MB: pi reicht dort nur bis ~1,2e6 Stellen
        w.send({ type: 'open', id: 'pi' });
        w.send({ type: 'want', total: 50000000 });
        const lim = await w.waitFor((m) => m.type === 'limit' || m.type === 'error');
        const digs = w.messages.filter((m) => m.type === 'digits').reduce((a, m) => a + m.buf.length, 0);
        check('A2 engine: Maximum gesenkt -> limit kind engine', lim.type === 'limit' && lim.kind === 'engine', JSON.stringify(lim));
        check('A2 engine: digits im Limit == gelieferte Stellen und Stellen stimmen', lim.digits === digs && digs > 0 && w.digits().slice(0, 400000) === ref('pi').slice(0, Math.min(digs, 400000)), 'digits=' + digs);
    }
    // device: Allokationsfehler injiziert, Groesse + Anforderung unter Maximum
    {
        const w = createWorker();
        w.send({ type: 'test', failAlloc: 50 });
        w.send({ type: 'open', id: 'pi' });
        w.send({ type: 'want', total: 5000 });
        const lim = await w.waitFor((m) => m.type === 'limit' || m.type === 'error');
        check('A2 device: injizierter Allokationsfehler unter Maximum -> kind device', lim.type === 'limit' && lim.kind === 'device', JSON.stringify(lim));
        w.send({ type: 'want', total: 9000 });
        await new Promise((r) => setTimeout(r, 200));
        check('A2 device: genau ein limit, Instanz verworfen (keine weiteren Nachrichten)', w.messages.filter((m) => m.type === 'limit').length === 1 && !w.messages.some((m) => m.type === 'digits'));
    }
    // Fehler am Maximum: gleicher injizierter Fehler, aber Groesse + Anforderung > Maximum -> engine
    {
        const w = createWorker();
        w.send({ type: 'test', failAlloc: 50, maxPages: 258 });
        w.send({ type: 'open', id: 'pi' });
        w.send({ type: 'want', total: 5000 });
        const lim = await w.waitFor((m) => m.type === 'limit' || m.type === 'error');
        check('A2 engine nach Allokationsfehler: Groesse + Anforderung > Maximum', lim.type === 'limit' && lim.kind === 'engine', JSON.stringify(lim));
    }
    // jeder andere Fehler -> error, nie still
    {
        const w = createWorker();
        w.send({ type: 'test', failOther: true });
        w.send({ type: 'open', id: 'pi' });
        w.send({ type: 'want', total: 3000 });
        const m = await w.waitFor((m) => m.type === 'limit' || m.type === 'error');
        check('A2 anderer Fehler -> type error (fail loud)', m.type === 'error' && /injected/.test(m.message), JSON.stringify(m));
    }
}

async function a3() {
    for (const id of IDS) {
        const w = createWorker({ noWasm: true });
        w.send({ type: 'open', id });
        w.send({ type: 'want', total: 10000 });
        const s = await w.digitsUpTo(10000, 60000);
        const info = w.messages.find((m) => m.type === 'info');
        check('A3 BigInt ' + id + ': 1e4 Stellen == mpmath', s.length >= 10000 && s.slice(0, 10000) === ref(id).slice(0, 10000) && info && info.mode === 'bigint', 'len=' + s.length);
        check('A3 BigInt ' + id + ': meldet sich (notice + console.warn)', w.messages.some((m) => m.type === 'notice') && w.warnings.length > 0);
    }
    // WASM-Laden scheitert -> BigInt-Rueckfall (laut)
    {
        const w = createWorker({ failImport: true });
        w.send({ type: 'open', id: 'e' });
        w.send({ type: 'want', total: 3000 });
        const s = await w.digitsUpTo(3000);
        check('A3 importScripts scheitert -> BigInt-Rueckfall laut', s.slice(0, 3000) === ref('e').slice(0, 3000) && w.messages.some((m) => m.type === 'notice') && w.warnings.length > 0);
    }
    // Grenze im BigInt-Modus ist immer engine (kuenstlich: Test-Obergrenze fuer BigInt-Bits)
    {
        const w = createWorker({ noWasm: true });
        w.send({ type: 'test', bigintMaxBits: 20000 });
        w.send({ type: 'open', id: 'sqrt2' });
        w.send({ type: 'want', total: 200000 });
        const lim = await w.waitFor((m) => m.type === 'limit' || m.type === 'error', 60000);
        check('A3 BigInt-Grenze -> limit kind engine', lim.type === 'limit' && lim.kind === 'engine' && lim.digits > 0, JSON.stringify(lim));
        check('A3 BigInt-Grenze: gelieferte Stellen korrekt', w.digits() === ref('sqrt2').slice(0, w.digits().length));
        check('A3 BigInt-Grenze: console.warn', w.warnings.length > 0);
    }
}

async function a4() {
    const fs = require('fs');
    const src = fs.readFileSync(path.join(ROOT, 'tools/workers/irrational-worker.js'), 'utf8');
    const N = 2000000;
    for (const id of IDS) {
        const m = new RegExp("BYTES_PER_DIGIT[\\s\\S]*?\\b" + id + ":\\s*([0-9.]+)").exec(src);
        const bpd = m ? Number(m[1]) : NaN;
        const w = createWorker();
        w.send({ type: 'open', id });
        w.send({ type: 'want', total: N });
        await w.digitsUpTo(N, 200000);
        const last = w.messages.filter((x) => x.type === 'digits').pop();
        const measured = last.memBytes / last.total;
        check('A4 ' + id + ': hinterlegte B/Stelle (' + bpd + ') >= gemessen (' + measured.toFixed(2) + ' bei ' + last.total + ' Stellen)', bpd >= measured, '');
    }
}

(async () => {
    if (run('stages')) await stages();
    if (run('a1')) await a1();
    if (run('a2')) await a2();
    if (run('a3')) await a3();
    if (run('a4')) await a4();
    console.log(fails ? 'FAILED ' + fails : 'ALL PASS');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('FAIL Ausnahme', e); process.exit(1); });
