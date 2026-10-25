// Decoder- und Kopf-Test fuer tools/pi-file.js (b196-Format) unter node, ohne Browser.
// Aufruf: node decoder.js [pfad-zu-pi-1e9.b196]   (MUT_SRC=<datei> prueft eine mutierte Kopie von pi-file.js)
// Ausgabe: je Pruefung "PASS|FAIL name"; Exit 1 bei einem FAIL.
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = process.env.MUT_SRC || path.join(__dirname, '..', '..', 'tools', 'pi-file.js');
const FILE = process.argv[2] || '/var/www/pi-daten/pi-1e9.b196';
const REF = JSON.parse(fs.readFileSync(path.join(__dirname, 'pi-ref-samples.json'), 'utf8')).samples;

let fetchImpl = null;
global.window = {};
global.fetch = (...a) => fetchImpl(...a);
global.console = Object.assign(Object.create(console), { error() {} });
(0, eval)(fs.readFileSync(SRC, 'utf8'));
const PiFile = global.window.PiFile;

let bad = 0;
function check(name, ok, info) {
  if (!ok) bad++;
  process.stdout.write((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' ' + String(info).slice(0, 300)) + '\n');
}
function throws(fn, re) { try { fn(); } catch (e) { return re.test(e.message) && e instanceof PiFile.PiFileError; } return false; }

// ---- Encoder (eigener Code, unabhaengig vom Decoder) ----
function encode(digits, count) {   // digits: String aller Nachkommastellen -> Uint8Array der ganzen Datei
  const D = 59, nBlocks = Math.ceil(count / D);
  let bits = '';
  for (let b = 0; b < nBlocks; b++) {
    let chunk = digits.slice(b * D, b * D + D);
    chunk = chunk + '0'.repeat(D - chunk.length);
    bits += BigInt(chunk).toString(2).padStart(196, '0');
  }
  while (bits.length % 8) bits += '0';
  const out = new Uint8Array(32 + bits.length / 8);
  out.set([0x50, 0x49, 0x35, 0x39, 1, 59, 196, 0]);
  const dv = new DataView(out.buffer);
  dv.setBigUint64(8, BigInt(count)); dv.setBigUint64(16, BigInt(nBlocks));
  for (let i = 0; i < bits.length / 8; i++) out[32 + i] = parseInt(bits.slice(8 * i, 8 * i + 8), 2);
  return out;
}
let seed = 12345;
function rnd(n) { let s = ''; for (let i = 0; i < n; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; s += (seed >> 16) % 10; } return s; }

// ---- Attrappen-Server ----
function serve(file, tamper) {
  fetchImpl = async (url, opts) => {
    const rng = (opts.headers.Range || '').replace('bytes=', '').split(',').map((x) => x.split('-').map(Number));
    let r = { status: 206, parts: rng.map(([a, b]) => ({ a, b: Math.min(b, file.length - 1) })) };
    if (tamper) r = tamper(r, file) || r;
    const mk = (p) => ({ a: p.a, b: p.b, data: p.data || file.subarray(p.a, p.b + 1), total: p.total || file.length });
    const parts = r.parts.map(mk);
    if (parts.length === 1) {
      return { status: r.status, headers: { get: (k) => k.toLowerCase() === 'content-range' ? 'bytes ' + parts[0].a + '-' + parts[0].b + '/' + parts[0].total : null }, arrayBuffer: async () => parts[0].data.slice().buffer };
    }
    const enc = new TextEncoder(), chunks = [];
    for (const p of parts) { chunks.push(enc.encode('--BND\r\nContent-Type: application/octet-stream\r\nContent-Range: bytes ' + p.a + '-' + p.b + '/' + p.total + '\r\n\r\n'), p.data, enc.encode('\r\n')); }
    chunks.push(enc.encode('--BND--\r\n'));
    const body = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
    let o = 0; for (const c of chunks) { body.set(c, o); o += c.length; }
    return { status: r.status, headers: { get: (k) => k.toLowerCase() === 'content-type' ? 'multipart/byteranges; boundary=BND' : null }, arrayBuffer: async () => body.buffer };
  };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function run(file, count, wants, tamper) {
  serve(file, tamper);
  let err = null, changes = 0;
  const f = PiFile.create({ url: '/x', digits: count, onError: (e) => { err = err || e; err.n = (err.n || 0) + 1; }, onChange: () => changes++ });
  for (const w of wants) f.want(w[0], w[1], w[2] || 0);
  for (let t = 0; t < 40 && !err && changes < 1; t++) await sleep(10);
  await sleep(30);
  for (const w of wants) f.want(w[0], w[1], w[2] || 0);
  await sleep(60);
  return { f, err };
}
function read(f, lo, n) { let s = ''; for (let i = lo; i < lo + n; i++) { const c = f.at(i); s += c ? String.fromCharCode(c) : '?'; } return s; }

(async () => {
  // d1 Synthetische Datei: Bloecke an geraden/ungeraden Positionen, Gruppengrenzen, letzter unvollstaendiger Block
  const N = 1000;                       // 16 volle Bloecke + 56 Ziffern, 3 Gruppen (8, 8, 1)
  const digits = rnd(N);
  const file = encode(digits, N);
  check('d1 Dateigroesse 32 + ceil(17*196/8)', file.length === 32 + Math.ceil(17 * 196 / 8), file.length);
  // Decoder direkt, jede Gruppe
  for (const [g, nb, valid] of [[0, 8, 472], [1, 8, 472], [2, 1, 56]]) {
    const out = PiFile.decodeGroup(file.subarray(32 + 196 * g, 32 + 196 * g + (nb === 8 ? 196 : 25)), nb, valid, g);
    const want = digits.slice(472 * g, 472 * g + valid);
    const got = String.fromCharCode(...out.subarray(0, valid));
    check('d1 decodeGroup ' + g + ' (' + nb + ' Bloecke, gerade+ungerade b)', got === want, got.slice(0, 40) + ' / ' + want.slice(0, 40));
  }
  {
    const { f, err } = await run(file, N, [[2, 2 + N]]);
    check('d2 Leser: alle ' + N + ' Stellen = Quelle (ueber alle Byte-Grenzen, letzter Block)', !err && read(f, 2, N) === digits, err ? err.message : read(f, 2, 40));
    check('d2 hinter dem Ende nie eine Fuellziffer (at -> 0)', f.at(2 + N) === 0 && f.at(2 + N + 3) === 0 && f.length === N + 2, f.at(2 + N));
    check('d2 Index 0/1 (3 und Punkt) gehoeren dem Geraet: at -> 0', f.at(0) === 0 && f.at(1) === 0, '');
    f.close();
  }
  {
    // Fenster, die nur die zweite/dritte Gruppe holen (getrennte Bereiche -> Multi-Range)
    const { f, err } = await run(file, N, [[2, 10, 944]]);
    check('d3 Multi-Range: erste und letzte Gruppe', !err && read(f, 2, 10) === digits.slice(0, 10) && read(f, 2 + 944, 56) === digits.slice(944), err ? err.message : '');
    f.close();
  }

  // e* Fehler
  const dig2 = (mut) => { const c = file.slice(); mut(c); return c; };
  let r = await run(dig2((c) => { c[0] = 0x58; }), N, [[2, 100]]);
  check('e1 falsches Magic -> lauter Fehler (genau einmal)', r.err && /Kopf ungueltig \(Magic\)/.test(r.err.message) && r.err.n === 1, r.err && r.err.message);
  r = await run(dig2((c) => { c[4] = 2; }), N, [[2, 100]]);
  check('e2 falsche Version -> lauter Fehler', r.err && /Version/.test(r.err.message), r.err && r.err.message);
  r = await run(dig2((c) => { c[5] = 60; }), N, [[2, 100]]);
  check('e3 falsche Blockgroesse -> lauter Fehler', r.err && /Block/.test(r.err.message), r.err && r.err.message);
  r = await run(dig2((c) => { c[7] = 1; }), N, [[2, 100]]);
  check('e4 falsche Bitreihenfolge -> lauter Fehler', r.err && /Bitreihenfolge/.test(r.err.message), r.err && r.err.message);
  r = await run(dig2((c) => { c[15] ^= 1; }), N, [[2, 100]]);
  check('e5 Stellenzahl im Kopf passt nicht -> lauter Fehler', r.err && /Stellen/.test(r.err.message), r.err && r.err.message);
  r = await run(file, N, [[2, 100]], (x) => { x.parts.forEach((p) => { p.total = file.length + 1; }); });
  check('e6 Gesamtgroesse passt nicht zum Kopf -> lauter Fehler', r.err && /Dateigroesse/.test(r.err.message), r.err && r.err.message);
  r = await run(dig2((c) => { c.fill(0xff, 32, 38); }), N, [[2, 100]]);
  check('e7 Blockwert >= 10^59 -> lauter Fehler', r.err && /Blockwert/.test(r.err.message), r.err && r.err.message);
  // Fuellziffer ungleich 0 im letzten Block: letzter Block = Ziffernwert mit gesetzter Fuellziffer
  const badFill = encode(digits + '5', N + 1);  // Block 16 hat 57 Ziffern; Kopf sagt aber N Stellen -> Fuellung enthaelt 5
  badFill.set(file.subarray(0, 32));
  r = await run(badFill, N, [[2 + 944, 2 + N]]);
  check('e8 Fuellziffer ungleich 0 -> lauter Fehler', r.err && /Fuellziffer/.test(r.err.message), r.err && r.err.message);
  r = await run(file, N, [[2, 100]], (x) => { if (x.parts[0].a > 0) x.status = 200; });
  check('e9 Antwort 200 statt 206 -> lauter Fehler', r.err && /200/.test(r.err.message), r.err && r.err.message);
  r = await run(file, N, [[2, 100]], (x) => { if (x.parts[0].a > 0) x.parts[0].data = file.subarray(x.parts[0].a, x.parts[0].b); });
  check('e10 Laenge der Daten passt nicht -> lauter Fehler', r.err && /Laenge/.test(r.err.message), r.err && r.err.message);
  check('e11 decodeGroup: zu kurze Gruppe -> Fehler', throws(() => PiFile.decodeGroup(file.subarray(32, 32 + 100), 8, 472, 0), /zu kurz/), '');

  // f1 Stichproben gegen die echte Datei (feste Referenzziffern aus pi-1e9.bcd, AGM-geprueft)
  if (!fs.existsSync(FILE)) { check('f0 Datei vorhanden ' + FILE, false, 'fehlt'); }
  else {
    const fd = fs.openSync(FILE, 'r');
    const rd = (a, n) => { const b = Buffer.alloc(n); fs.readSync(fd, b, 0, n, a); return new Uint8Array(b); };
    const hdr = rd(0, 32);
    const dv = new DataView(hdr.buffer);
    check('f0 Kopf der echten Datei: PI59, v1, 59/196, MSB, 1e9 Stellen, 16949153 Bloecke',
      String.fromCharCode(...hdr.subarray(0, 4)) === 'PI59' && hdr[4] === 1 && hdr[5] === 59 && hdr[6] === 196 && hdr[7] === 0 && dv.getBigUint64(8) === 1000000000n && dv.getBigUint64(16) === 16949153n, Array.from(hdr));
    const total = fs.fstatSync(fd).size, DIG = 1e9;
    for (const s of REF) {
      let got = '';
      const g0 = Math.floor((s.d - 1) / 472), g1 = Math.floor((s.d + s.n - 2) / 472);
      let all = '';
      for (let g = g0; g <= g1; g++) {
        const nb = Math.min(8, 16949153 - 8 * g);
        const len = Math.min(196, total - 32 - 196 * g);
        const out = PiFile.decodeGroup(rd(32 + 196 * g, len), nb, Math.min(472, DIG - 472 * g), g);
        const valid = Math.min(472, DIG - 472 * g);
        all += String.fromCharCode(...out.subarray(0, valid));
      }
      got = all.slice(s.d - 1 - 472 * g0, s.d - 1 - 472 * g0 + s.n);
      check('f1 Stellen ' + s.d + '..' + (s.d + s.n - 1) + ' = Referenz (' + (g0 === g1 ? 'Gruppe ' + g0 : 'Gruppen ' + g0 + '-' + g1) + ')', got === s.digits, got.slice(0, 30) + ' / ' + s.digits.slice(0, 30));
    }
    // letzter Block: 32 echte Ziffern, Fuellung 0 (Dateiende)
    const lastG = 16949152 >> 3;
    const out = PiFile.decodeGroup(rd(32 + 196 * lastG, total - 32 - 196 * lastG), 1, 32, lastG);
    check('f2 letzter Block: 32 Ziffern + 27 Nullen Fuellung', String.fromCharCode(...out.subarray(0, 32)) === REF[REF.length - 1].digits.slice(-32) && out.subarray(32, 59).every((c) => c === 48), '');
    check('f2 Dateigroesse = 32 + ceil(16949153*196/8)', total === 415254281, total);
    // Leser gegen echte Datei im Browser-Pfad (Attrappen-Server liefert Bytes der echten Datei, nur Anfang+Ende)
  }
  console.log(bad ? bad + ' FEHLER' : 'alles gruen');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.log('FAIL Abbruch ' + (e && e.stack || e)); process.exit(1); });
