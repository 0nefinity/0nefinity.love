'use strict';
// Liest das Memory-Limit (min/max in Seiten) des in ein gmp-wasm-Bundle eingebetteten WASM.
// Unabhaengig vom Patch-Skript: das Bundle wird in einem vm-Kontext ausgefuehrt, WebAssembly.compile
// faengt die Bytes ab, die Sektion 5 (Memory) wird selbst geparst.
// Die Sektion-Lesung steht absichtlich ein zweites Mal hier (auch in tools/vendor/gmp-wasm/patch-4gib.js): die Pruefung soll nicht vom Patch-Skript abhaengen, das sie prueft.
const vm = require('vm');
const fs = require('fs');

function leb(b, p) {
    let n = 0, sh = 0, x;
    do { x = b[p.i++]; n += (x & 127) * 2 ** sh; sh += 7; } while (x & 128);
    return n;
}

function parseMemory(wasm) {
    const p = { i: 8 };
    let found = null;
    while (p.i < wasm.length) {
        const id = wasm[p.i++];
        const len = leb(wasm, p);
        if (id === 5) {
            const q = { i: p.i };
            const count = leb(wasm, q);
            if (count !== 1) throw new Error('memory count ' + count);
            const flags = leb(wasm, q);
            const min = leb(wasm, q);
            const max = flags & 1 ? leb(wasm, q) : null;
            found = { min, max, flags };
        }
        p.i += len;
    }
    if (!found) throw new Error('no memory section');
    return found;
}

async function memoryLimits(bundlePath) {
    const src = fs.readFileSync(bundlePath, 'utf8');
    let captured = null;
    const WA = Object.create(WebAssembly);
    WA.compile = (bytes) => { captured = Buffer.from(bytes); return WebAssembly.compile(bytes); };
    const ctx = { console, TextDecoder, TextEncoder, WebAssembly: WA };
    ctx.self = ctx; ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    await ctx.gmp.init();
    if (!captured) throw new Error('WASM nicht abgefangen');
    return parseMemory(captured);
}

module.exports = { memoryLimits, parseMemory };
