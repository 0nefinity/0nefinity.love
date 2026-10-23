// Durchsatz pi: neuer irrational-worker gegen alten pi-digits-worker, gleiche Stelle, abwechselnd, Median.
// Der alte Worker ist aus dem Baum entfernt; er wird aus Commit 839eac73 in eine Temp-Datei geholt.
// Aufruf: node tests/irrational/bench-throughput.js [stellen=1000000] [laeufe=3]
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { createWorker, ROOT } = require('./lib/vmworker');
const N = Number(process.argv[2] || 1000000);
const RUNS = Number(process.argv[3] || 3);
const OLD = path.join(os.tmpdir(), 'pi-digits-worker-839eac73.js');
fs.writeFileSync(OLD, execFileSync('git', ['show', '839eac73:tools/workers/pi-digits-worker.js'], { cwd: ROOT }));

async function runNew() {
    const w = createWorker();
    const t0 = process.hrtime.bigint();
    w.send({ type: 'open', id: 'pi' });
    w.send({ type: 'want', total: N });
    await w.waitFor((m) => (m.type === 'digits' && m.total >= N) || m.type === 'error' || m.type === 'limit', 300000);
    return Number(process.hrtime.bigint() - t0) / 1e9;
}
async function runOld() {
    const w = createWorker({ workerPath: OLD });
    const t0 = process.hrtime.bigint();
    w.send({ type: 'need', total: N / 2 }); // alter Worker rechnet 2 * total
    await w.waitFor((m) => (m.type === 'digits' && m.from + m.str.length >= N) || m.type === 'error', 300000);
    return Number(process.hrtime.bigint() - t0) / 1e9;
}
const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
(async () => {
    const o = [], n = [];
    for (let i = 0; i < RUNS; i++) {
        o.push(await runOld()); n.push(await runNew());
        console.log('lauf', i + 1, 'alt', o[i].toFixed(2), 's', 'neu', n[i].toFixed(2), 's');
    }
    console.log('Median alt', med(o).toFixed(2), 's  neu', med(n).toFixed(2), 's  Verhaeltnis neu/alt', (med(n) / med(o)).toFixed(2), ' (' + N + ' Stellen pi)');
})().catch((e) => { console.error(e); process.exit(1); });
