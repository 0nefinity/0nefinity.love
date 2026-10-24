'use strict';
// Node-Tests der Engine (tools/workers/irrational-worker.js im vm-Kontext) gegen mpmath-Referenzen.
// Aufruf: node test_engine.js [a1|a2|a3|a4|a5|stages|all]   (Env IRRATIONAL_WORKER = Mutant-Worker)
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
    await w.waitFor((m) => m.type === 'info');
    // Rueckgabezeiger von mpz_get_str (Ergebnisstring) mitschreiben, roh wie vom Binding geliefert
    w.run(`(function(){ const o = g.mpz_get_str; globalThis.__strPtrs = []; g.mpz_get_str = function () { const r = o.apply(this, arguments); __strPtrs.push(r); return r; }; })()`);
    w.send({ type: 'want', total: 100000 });
    const s = await w.digitsUpTo(100000, 200000);
    const err = w.messages.find((m) => m.type === 'error' || m.type === 'limit');
    const info = w.messages.find((m) => m.type === 'info');
    const last = w.messages.filter((m) => m.type === 'digits').pop();
    check('A1 Worker-Maximum == Maximum im Bundle (65536 Seiten)', info && info.maxPages === 65536 && l.max === 65536, JSON.stringify({ worker: info && info.maxPages, bundle: l.max }));
    check('A1 > 2 GiB belegt', last && last.memBytes > 2 * GiB, 'memBytes=' + (last && (last.memBytes / GiB).toFixed(2)) + ' GiB');
    check('A1 Zeiger >= 2^31 gelesen (>>> 0)', last && last.maxPtr >= 2 ** 31, 'maxPtr=' + (last && last.maxPtr));
    const strPtrs = w.run('__strPtrs');
    check('A1 Ergebnisstring (mpz_get_str) liegt oberhalb 2^31 und wird korrekt gelesen', strPtrs.length > 0 && Math.max(...strPtrs.map((x) => x >>> 0)) >= 2 ** 31, 'Zeiger=' + strPtrs.map((x) => (x >>> 0).toString(16)).join(','));
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
    // device: memory.grow scheitert (Vorab-Reservierung liefert 0), Bedarf unter dem Maximum
    {
        const w = createWorker();
        w.send({ type: 'test', failReserve: 2 });
        w.send({ type: 'open', id: 'pi' });
        w.send({ type: 'want', total: 5000 });
        await w.digitsUpTo(5000);
        w.send({ type: 'want', total: 20000 });
        const lim = await w.waitFor((m) => m.type === 'limit' || m.type === 'error');
        check('A2 device: grow scheitert in der zweiten Stufe -> kind device mit gelieferten Stellen', lim.type === 'limit' && lim.kind === 'device' && lim.digits > 0, JSON.stringify(lim));
        w.send({ type: 'want', total: 9000 });
        await new Promise((r) => setTimeout(r, 200));
        check('A2 device: genau ein limit, Instanz verworfen (keine weiteren Nachrichten)', w.messages.filter((m) => m.type === 'limit').length === 1 && w.messages.filter((m) => m.type === 'digits').every((m) => m.total <= lim.digits));
    }
    // Grenzfaelle: pi-Stufe 1,43e8 (Bedarf ca. 2045 MiB) und letzte Stufe (Bedarf ca. 4 GiB): scheitert grow, ist es immer das Geraet
    for (const [name, total] of [['pi-Stufe 1,43e8', 143000000], ['letzte Stufe (Bedarf ca. 4 GiB)', 400000000]]) {
        const w = createWorker();
        w.send({ type: 'test', failReserve: 1 });
        w.send({ type: 'open', id: 'pi' });
        w.send({ type: 'want', total });
        const lim = await w.waitFor((m) => m.type === 'limit' || m.type === 'error');
        check('A2 device: ' + name + ', grow scheitert -> kind device', lim.type === 'limit' && lim.kind === 'device' && lim.digits === 0, JSON.stringify(lim));
    }
    // Reservierung ueber echtes malloc: liefert es 0 (grow scheitert), ist es device; Anfragen nie groesser als Maximum - Grundspeicher
    // (Grundspeicher hier unabhaengig vom Worker gemessen: Linearspeicher direkt nach dem Laden). Kleines Modul-Maximum, damit ein
    // Mutant ohne Pruefung nur kurz rechnet statt 4 GiB zu fuellen.
    {
        const MAXP = 3000;
        const w = createWorker();
        w.send({ type: 'test', maxPages: MAXP });
        w.send({ type: 'open', id: 'pi' });
        await w.waitFor((m) => m.type === 'info');
        const base = Number(w.run('memBytes()'));
        w.run('globalThis.__asked = []; (function(){ const o = g.malloc; g.malloc = function (n) { __asked.push(n); return n > 1.2e8 ? 0 : o.call(this, n); }; })()');
        w.send({ type: 'want', total: 400000000 });
        const lim = await w.waitFor((m) => m.type === 'limit' || m.type === 'error', 120000);
        const asked = w.run('__asked');
        const cap = MAXP * 65536 - base;
        check('A2 device: echtes malloc liefert 0 -> kind device; zwei Versuche, beide <= Maximum - Grundspeicher, der erste nahe daran, der zweite kleiner',
            lim.kind === 'device' && asked.length === 2 && asked[0] <= cap && asked[0] > 0.9 * cap && asked[1] < asked[0], JSON.stringify({ lim, asked, cap }));
        check('A2 device: Reason nennt die tatsaechlich angefragte Menge (zweiter Versuch)', lim.reason.includes('about ' + Math.round(asked[1] / 2 ** 20) + ' MiB for'), lim.reason);
    }
    // Frischer Worker: die Reservierung fuer die groesste Stufe gelingt mit dem ersten Versuch (kein device-Limit, wenn malloc echt ist);
    // der Grundspeicher fliesst in die Obergrenze ein, sonst wuerde 2^32-1 angefragt und der erste Versuch scheitern
    {
        const w = createWorker();
        w.send({ type: 'open', id: 'pi' });
        await w.waitFor((m) => m.type === 'info');
        const base = Number(w.run('memBytes()'));
        w.run('globalThis.__asked = []; (function(){ const o = g.malloc; g.malloc = function (n) { __asked.push(n); return o.call(this, n); }; })()');
        const ok = w.run('reserve(fitDigits())');
        const asked = w.run('__asked');
        check('A2 reserve(fitDigits()) am frischen Worker: true im ersten Versuch, Anfrage <= Maximum - Grundspeicher', ok === true && asked.length === 1 && asked[0] <= 65536 * 65536 - base, JSON.stringify({ ok, asked, base }));
    }
    // Reservierung wird freigegeben: danach liegt der Heap-Anfang wieder frei (malloc(8) liefert denselben Zeiger wie vorher)
    {
        const w = createWorker();
        w.send({ type: 'open', id: 'pi' });
        await w.waitFor((m) => m.type === 'info');
        const before = w.run('(function(){ const p = g.malloc(8) >>> 0; g.free(p); return p; })()');
        const ok = w.run('reserve(2000000)');
        const after = w.run('(function(){ const p = g.malloc(8) >>> 0; g.free(p); return p; })()');
        check('A2 reserve gibt frei: Heap-Anfang nach der Reservierung wie vorher', ok === true && before > 0 && after === before, JSON.stringify({ ok, before, after }));
    }
    // Zwei Versuche: scheitert nur der erste (mit Sicherheitsfaktor), kommt die Stufe; scheitern beide, ist es device
    {
        const w = createWorker();
        w.send({ type: 'test', failReserve: 1, failTries: 1 });
        w.send({ type: 'open', id: 'pi' });
        w.send({ type: 'want', total: 5000 });
        const s = await w.digitsUpTo(5000);
        check('A2 erster Versuch scheitert, zweiter gelingt -> kein Limit, Stellen kommen', s.slice(0, 5000) === ref('pi').slice(0, 5000) && !w.messages.some((m) => m.type === 'limit' || m.type === 'error'), JSON.stringify(w.messages.find((m) => m.type === 'limit' || m.type === 'error') || ''));
    }
    {
        const w = createWorker();
        w.send({ type: 'test', failReserve: 1 });
        w.send({ type: 'open', id: 'pi' });
        w.send({ type: 'want', total: 5000 });
        const lim = await w.waitFor((m) => m.type === 'limit' || m.type === 'error');
        check('A2 beide Versuche scheitern -> device', lim.type === 'limit' && lim.kind === 'device', JSON.stringify(lim));
        check('A2 device-Reason kleiner Stufe: sinnvolle Einheit, kein "about 0 MiB"', /about \d+ KiB for/.test(lim.reason) && !/about 0 MiB/.test(lim.reason), lim.reason);
    }
    // GMP-Abbruch ohne Speicherursache (Division durch 0 in GMP, Meldung "Fatal error in gmp-wasm") ist ein Fehler, kein Hinweis
    {
        const w = createWorker();
        w.send({ type: 'test', gmpAbort: 50 });
        w.send({ type: 'open', id: 'pi' });
        w.send({ type: 'want', total: 5000 });
        const m = await w.waitFor((m) => m.type === 'limit' || m.type === 'error');
        check('A2 GMP-Abbruch (Division durch 0) -> type error, nicht limit', m.type === 'error' && /Fatal error in gmp-wasm/.test(m.message) && !w.messages.some((x) => x.type === 'limit'), JSON.stringify(m).slice(0, 200));
    }
    // Allokationsfehler waehrend der Rechnung trotz Vorab-Reservierung: ehrlich laut, kein Hinweis
    {
        const w = createWorker();
        w.send({ type: 'open', id: 'pi' });
        await w.waitFor((m) => m.type === 'info');
        w.run('(function(){ const o = g.mpz_ui_pow_ui; g.mpz_ui_pow_ui = function () { throw new RangeError("WebAssembly.Memory.grow(): Maximum memory size exceeded"); }; })()');
        w.send({ type: 'want', total: 5000 });
        const m = await w.waitFor((m) => m.type === 'limit' || m.type === 'error');
        check('A2 Allokationsfehler in der Rechnung -> type error, nicht limit', m.type === 'error' && !w.messages.some((x) => x.type === 'limit'), JSON.stringify(m).slice(0, 200));
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
    const N = 2000000;
    for (const id of IDS) {
        const w = createWorker();
        w.send({ type: 'test', noReserve: true }); // echter Spitzenverbrauch, nicht die Reservierung
        const bpd = Number(w.run('BYTES_PER_DIGIT.' + id)); // Wert des geladenen Workers (auch bei IRRATIONAL_WORKER=Mutant)
        w.send({ type: 'open', id });
        w.send({ type: 'want', total: N });
        await w.digitsUpTo(N, 200000);
        const last = w.messages.filter((x) => x.type === 'digits').pop();
        const measured = last.memBytes / last.total;
        check('A4 ' + id + ': hinterlegte B/Stelle (' + bpd + ') >= gemessen (' + measured.toFixed(2) + ' bei ' + last.total + ' Stellen)', bpd >= measured, '');
    }
}

// Selbstpruefungen des Workers (checkGuard, checkHead): direkt und ueber den Rechenweg (Rechenergebnis verfaelscht).
async function a5() {
    // direkt
    {
        const w = createWorker();
        const G = w.run('GUARD');
        const thrown = (code) => { try { w.run(code); return false; } catch (e) { return true; } };
        const mk = (fill) => `(new Uint8Array(5000)).fill(${fill})`;
        check('A5 checkGuard: alle 0 wirft', thrown(`checkGuard(${mk(48)}, 1, 100)`));
        check('A5 checkGuard: alle 9 wirft', thrown(`checkGuard(${mk(57)}, 1, 100)`));
        check('A5 checkGuard: gemischte Schutzstellen werfen nicht', !thrown(`(function(){ const b=${mk(48)}; b[1+100+${G - 1}]=49; checkGuard(b, 1, 100); })()`));
        check('A5 checkHead: erste Stufe setzt Kopf, gleicher Kopf wirft nicht, falscher Kopf wirft',
            !thrown('checkHead(Uint8Array.from([49,50,51,52]))') && !thrown('checkHead(Uint8Array.from([49,50,51,52,53]))') && thrown('checkHead(Uint8Array.from([49,50,52,52]))'));
    }
    // ueber den Rechenweg: calcWasm bzw. calcBig liefert eine verfaelschte Zahl der richtigen Laenge
    const variants = {
        wasm: (kind) => `(function(){ let calls = 0; calcWasm = function (n) {
            const L = n + intLen; const p = newMpz(); g.mpz_ui_pow_ui(p, 10, L - 1);
            ${kind === 'zero' ? '' : 'g.mpz_add_ui(p, p, 12345);'}
            if (${kind === 'head'} && ++calls >= 2) { const q = newMpz(); g.mpz_ui_pow_ui(q, 10, L - 1 - intLen - 100); g.mpz_add(p, p, q); freeMpz(q); }
            return p; }; })()`,
        bigint: (kind) => `(function(){ let calls = 0; calcBig = function (n) {
            const L = n + intLen; let p = 10n ** BigInt(L - 1);
            ${kind === 'zero' ? '' : kind === 'nine' ? 'p = p * 10n - 1n;' : 'p += 12345n;'}
            if (${kind === 'head'} && ++calls >= 2) p += 10n ** BigInt(L - 1 - intLen - 100);
            return p; }; })()`,
    };
    for (const mode of ['wasm', 'bigint']) {
        for (const kind of ['ok', 'zero', 'nine', 'head']) {
            if (mode === 'wasm' && kind === 'nine') continue;
            const w = createWorker({ noWasm: mode === 'bigint' });
            w.send({ type: 'open', id: 'pi' });
            await w.waitFor((m) => m.type === 'info');
            w.run(variants[mode](kind));
            w.send({ type: 'want', total: 5000 });
            const first = await w.waitFor((m) => m.type === 'digits' || m.type === 'error' || m.type === 'limit');
            if (kind === 'head' || kind === 'ok') {
                if (first.type !== 'digits') { check('A5 ' + mode + ' ' + kind + ': erste Stufe geliefert', false, JSON.stringify(first)); continue; }
                w.send({ type: 'want', total: 20000 });
                await w.waitFor((m) => m.type === 'error' || (m.type === 'digits' && m.total >= 20000));
            }
            const err = w.messages.find((m) => m.type === 'error');
            const want = { ok: null, zero: /Schutzstellen/, nine: /Schutzstellen/, head: /Kontrollstellen/ }[kind];
            check('A5 ' + mode + ' ' + kind + (want ? ': Selbstpruefung meldet error' : ': Kontrolle ohne Verfaelschung, kein error'),
                want ? err && want.test(err.message) && !w.messages.some((m) => m.type === 'digits' && m.total > (kind === 'head' ? 5000 : 0)) : !err && w.messages.some((m) => m.type === 'digits'),
                err ? err.message.split('\n')[0] : '');
        }
    }
}

(async () => {
    if (run('stages')) await stages();
    if (run('a1')) await a1();
    if (run('a2')) await a2();
    if (run('a3')) await a3();
    if (run('a4')) await a4();
    if (run('a5')) await a5();
    console.log(fails ? 'FAILED ' + fails : 'ALL PASS');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('FAIL Ausnahme', e); process.exit(1); });
