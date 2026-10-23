'use strict';
// A1 (Teil 1): Memory-Maximum im Ausgabe-Bundle = 65536 Seiten, Original unveraendert (32768).
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { memoryLimits } = require('./lib/wasm-limits');

const ROOT = path.resolve(__dirname, '..', '..');
const DIR = path.join(ROOT, 'tools/vendor/gmp-wasm');
const ORIG = path.join(DIR, 'gmp-wasm-1.3.2.mini.umd.min.js');
const OUT = path.join(DIR, 'gmp-wasm-1.3.2.mini.4gib.umd.min.js');
let fails = 0;
function check(name, ok, info) { console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? ' ' + info : '')); if (!ok) fails++; }

(async () => {
    const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
    const shaBefore = sha(ORIG);
    const o = await memoryLimits(ORIG);
    check('Original: Maximum 32768 Seiten (2 GiB)', o.max === 32768, JSON.stringify(o));
    const l = await memoryLimits(OUT);
    check('gepatchtes Bundle: Maximum 65536 Seiten (4 GiB)', l.max === 65536, JSON.stringify(l));
    check('Minimum unveraendert', l.min === o.min);
    check('Original nach Patch unveraendert (sha256)', sha(ORIG) === shaBefore);

    // Reproduzierbar: frischer Lauf des Skripts erzeugt Bundle mit gleichem Limit; zweiter Lauf auf schon gepatchte Datei bricht laut ab.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'patch4-'));
    const out2 = path.join(tmp, 'x.js');
    execFileSync('node', [path.join(DIR, 'patch-4gib.js'), ORIG, out2]);
    check('Skript reproduziert Maximum 65536', (await memoryLimits(out2)).max === 65536);
    let aborted = false;
    try { execFileSync('node', [path.join(DIR, 'patch-4gib.js'), out2, path.join(tmp, 'y.js')], { stdio: 'pipe' }); } catch (e) { aborted = e.status !== 0; }
    check('Skript bricht laut ab, wenn Muster nicht genau 32768 ist', aborted);
    fs.rmSync(tmp, { recursive: true });
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('FAIL Ausnahme', e); process.exit(1); });
