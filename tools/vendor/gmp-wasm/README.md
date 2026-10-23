# gmp-wasm 1.3.2 (mini)

GMP (Ganzzahl-Arithmetik) als WebAssembly, selbst gehostet, same-origin.

- Paket: https://www.npmjs.com/package/gmp-wasm, Version 1.3.2, Datei `dist/mini.umd.min.js` (WASM eingebettet).
- Lizenz: LGPL-3.0-only (Paket-`package.json`), Volltext in `LICENSE-LGPL-3.0.txt`. Die Datei ist unveraendert, so kann sie jederzeit durch eine andere Build-Version ersetzt werden.
- Quellen: GMP https://gmplib.org, Binding https://github.com/Daninet/gmp-wasm
- Benutzt von `tools/workers/pi-digits-worker.js` (unfoldingPi).
