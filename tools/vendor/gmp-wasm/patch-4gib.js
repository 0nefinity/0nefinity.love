#!/usr/bin/env node
'use strict';
// Erzeugt aus gmp-wasm-1.3.2.mini.umd.min.js (unveraendert) ein Bundle, dessen eingebettetes WASM
// ein Memory-Maximum von 65536 Seiten (4 GiB) statt 32768 (2 GiB) deklariert.
// Aufruf: node patch-4gib.js [eingabe] [ausgabe]
// Ablauf: Base64-Literal im Bundle -> raw deflate -> WASM -> Memory-Sektion (id 5): LEB128 32768 = 80 80 02
// wird 80 80 04 (65536), gleiche Byte-Laenge -> neu deflaten, Base64, Literal ersetzen.
// Bricht laut ab, wenn das Muster nicht genau einmal vorkommt.
// Die Sektion-Lesung gibt es absichtlich ein zweites Mal unabhaengig in tests/irrational/lib/wasm-limits.js: die Pruefung soll nicht vom Patch-Skript abhaengen.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const dir = __dirname;
const input = process.argv[2] || path.join(dir, 'gmp-wasm-1.3.2.mini.umd.min.js');
const output = process.argv[3] || path.join(dir, 'gmp-wasm-1.3.2.mini.4gib.umd.min.js');

function die(msg) { console.error('patch-4gib: ' + msg); process.exit(1); }

const src = fs.readFileSync(input, 'utf8');
const re = /H\("([A-Za-z0-9+\/=]{1000,})"\),r=new Uint8Array\((\d+)\)/g;
const hits = [...src.matchAll(re)];
if (hits.length !== 1) die('eingebettetes WASM-Literal: ' + hits.length + ' Treffer, erwartet genau 1');
const b64 = hits[0][1];
const wasmLen = Number(hits[0][2]);
const wasm = zlib.inflateRawSync(Buffer.from(b64, 'base64'));
if (wasm.length !== wasmLen) die('WASM-Laenge ' + wasm.length + ' != erwartet ' + wasmLen);
if (wasm.readUInt32BE(0) !== 0x0061736d) die('keine WASM-Magic');

function leb(buf, p) {
    let n = 0, sh = 0, x;
    do { x = buf[p.i++]; n += (x & 127) * 2 ** sh; sh += 7; } while (x & 128);
    return n;
}
let pos = 8, memSections = 0, patchAt = -1;
while (pos < wasm.length) {
    const id = wasm[pos++];
    const p = { i: pos };
    const len = leb(wasm, p);
    const start = p.i;
    if (id === 5) {
        memSections++;
        const q = { i: start };
        if (leb(wasm, q) !== 1) die('Memory-Sektion: nicht genau ein Speicher');
        if (leb(wasm, q) !== 1) die('Memory-Sektion: kein Maximum deklariert');
        leb(wasm, q); // min
        const maxAt = q.i;
        if (leb(wasm, q) !== 32768) die('Memory-Maximum ist nicht 32768 Seiten (schon gepatcht oder andere Version)');
        if (wasm[maxAt] !== 0x80 || wasm[maxAt + 1] !== 0x80 || wasm[maxAt + 2] !== 0x02 || q.i !== maxAt + 3) die('unerwartete LEB-Kodierung des Maximums');
        patchAt = maxAt;
    }
    pos = start + len;
}
if (memSections !== 1 || patchAt < 0) die('Memory-Sektionen: ' + memSections + ', erwartet genau 1');
wasm[patchAt + 2] = 0x04; // 0x80 0x80 0x04 = 65536

const newB64 = zlib.deflateRawSync(wasm, { level: 9 }).toString('base64');
const idx = src.indexOf(b64);
if (idx < 0 || src.indexOf(b64, idx + 1) >= 0) die('Base64-Literal nicht eindeutig im Bundle');
const out = src.slice(0, idx) + newB64 + src.slice(idx + b64.length);
fs.writeFileSync(output, out);
console.log('patch-4gib: ' + output + ' geschrieben, Memory-Maximum 32768 -> 65536 Seiten');
