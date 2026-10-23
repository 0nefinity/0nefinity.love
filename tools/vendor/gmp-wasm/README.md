# gmp-wasm 1.3.2 (mini)

GMP (Ganzzahl-Arithmetik) als WebAssembly, selbst gehostet, same-origin.

- Paket: https://www.npmjs.com/package/gmp-wasm, Version 1.3.2, Datei `dist/mini.umd.min.js` (WASM eingebettet).
- Lizenz: LGPL-3.0-only (Paket-`package.json`). Die Datei ist unveraendert, so kann sie jederzeit durch eine andere Build-Version ersetzt werden.
- Lizenztexte (Volltext, same-origin abrufbar): `LICENSE-LGPL-3.0.txt` (aus dem Paket) und `LICENSE-GPL-3.0.txt` (GPL-3.0, auf der die LGPL-3.0 aufbaut; aus `/usr/share/common-licenses/GPL-3` des Servers).
- Quellen: GMP https://gmplib.org, Binding https://github.com/Daninet/gmp-wasm
- Benutzt von `tools/workers/pi-digits-worker.js` (unfoldingPi).
- Die `.htaccess` in diesem Ordner sorgt dafuer, dass `.txt` und `.md` als Text statt ueber den HTML-Textviewer der Wurzel-`.htaccess` ausgeliefert werden.
