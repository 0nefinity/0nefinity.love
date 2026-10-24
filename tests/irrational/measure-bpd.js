// Misst den WASM-Speicherbedarf (Byte je Stelle) des irrational-worker je Konstante.
// Aufruf: node tests/irrational/measure-bpd.js [stellen=2000000] [id,id,...]
'use strict';
const { createWorker } = require('./lib/vmworker');
const N = Number(process.argv[2] || 2000000);
const IDS = (process.argv[3] || 'pi,e,ln2,sqrt2,phi').split(',');
(async () => {
    for (const id of IDS) {
        const w = createWorker();
        w.send({ type: 'test', noReserve: true });
        w.send({ type: 'open', id });
        w.send({ type: 'want', total: N });
        const t0 = Date.now();
        await w.digitsUpTo(N, 600000);
        const mem = Math.max(...w.messages.filter((m) => m.type === 'digits').map((m) => m.memBytes));
        console.log(id, 'digits=' + N, 'memBytes=' + mem, 'B/digit=' + (mem / N).toFixed(2), 'sec=' + ((Date.now() - t0) / 1000).toFixed(1));
    }
})().catch((e) => { console.error(e); process.exit(1); });
