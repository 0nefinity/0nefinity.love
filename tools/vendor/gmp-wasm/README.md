# gmp-wasm 1.3.2 (mini)

GMP (Ganzzahl-Arithmetik) als WebAssembly, selbst gehostet, same-origin.

- Paket: https://www.npmjs.com/package/gmp-wasm, Version 1.3.2, Datei `dist/mini.umd.min.js` (WASM eingebettet).
- Lizenz: LGPL-3.0-only (Paket-`package.json`). Die Datei ist unveraendert, so kann sie jederzeit durch eine andere Build-Version ersetzt werden.
- Lizenztexte (Volltext, same-origin abrufbar): `LICENSE-LGPL-3.0.txt` (aus dem Paket) und `LICENSE-GPL-3.0.txt` (GPL-3.0, auf der die LGPL-3.0 aufbaut; aus `/usr/share/common-licenses/GPL-3` des Servers).
- Quellen: GMP https://gmplib.org, Binding https://github.com/Daninet/gmp-wasm
- Benutzt von `tools/workers/pi-digits-worker.js` (unfoldingPi).
- Die `.htaccess` in diesem Ordner sorgt dafuer, dass `.txt` und `.md` als Text statt ueber den HTML-Textviewer der Wurzel-`.htaccess` ausgeliefert werden.

## Gepatchtes Bundle: Speichermaximum 4 GiB

`gmp-wasm-1.3.2.mini.4gib.umd.min.js` ist dasselbe Bundle mit **einer** geaenderten Zahl im eingebetteten WASM:
das Memory-Maximum steht dort auf 65536 Seiten (4 GiB, Hoechstwert fuer wasm32 in jeder Engine) statt 32768 Seiten (2 GiB).
Das Minimum (258 Seiten) und der gesamte Code bleiben unveraendert; das Original `gmp-wasm-1.3.2.mini.umd.min.js` liegt unveraendert daneben.

- Warum: Das Original deckelt jede Rechnung bei 2 GiB, auf jedem Geraet gleich. Gemessen: mit dem Patch lassen sich ca. 4032 MiB statt 1984 MiB allokieren.
- Reproduzieren: `node patch-4gib.js` (Eingabe: das Original, Ausgabe: das 4gib-Bundle). Das Skript entpackt das Base64-Literal (raw deflate), sucht die Memory-Sektion (id 5), prueft, dass genau ein Speicher mit Maximum 32768 (LEB128 `80 80 02`) existiert, setzt `80 80 04` und packt neu. Passt das Muster nicht genau einmal, bricht es mit Fehler ab. Die deflate-Ausgabe haengt von der zlib-Version ab; verglichen wird der entpackte WASM-Inhalt, nicht die Bundle-Bytes.
- Pruefen: `node tests/irrational/test_patch.js` liest das Maximum unabhaengig aus dem Bundle (WASM abfangen, Sektion parsen) und erwartet 65536.
- Lizenz: LGPL-3.0 bleibt erfuellt. Original, Patch-Skript (Quelltext) und Lizenztexte liegen same-origin; wer das Bundle austauschen will, ersetzt die Datei oder fuehrt das Skript auf einer anderen Fassung aus. Der Patch aendert nur eine Konstante im Binaer, der GMP-Quelltext ist unveraendert (https://gmplib.org).
- Benutzt von `tools/workers/irrational-worker.js`.
