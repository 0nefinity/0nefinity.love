# tests/irrational

Tests fuer `tools/workers/irrational-worker.js` und `tools/irrational.js`. Alles auf einmal: `bash tests/irrational/run.sh` (nur Node: `... node`, nur Browser: `... browser`; Browser laufen gegen die Live-URL https://dev.0nefinity.love, `URL=` ueberschreibt).

| Datei | Prueft |
|---|---|
| `test_patch.js` | Bundle-Patch: Maximum 32768 -> 65536 Seiten, Original unveraendert, Skript reproduzierbar, bricht bei Doppelanwendung ab |
| `test_engine.js stages` | je Konstante 1e5 Stellen (pi 4e5) gleich mpmath, lueckenlose Bloecke |
| `test_engine.js a1` | Maximum 65536; mehr als 2 GiB belegt; Zeiger >= 2^31 (`>>> 0`); danach 1e5 pi-Stellen korrekt |
| `test_engine.js a2` | Limit `engine` vor dem Rechnen (Maximum gesenkt), Limit `device` bei injiziertem Allokationsfehler, andere Fehler -> `error` |
| `test_engine.js a3` | BigInt-Rueckfall 1e4 Stellen je Konstante, laut (notice + console.warn), Limit stets `engine` |
| `test_engine.js a4` | hinterlegte Byte/Stelle >= gemessen |
| `test_browser.py` | 1e5 Stellen je Konstante in chromium, firefox, webkit ueber `Irrational.open` (`harness.html`) |
| `measure-bpd.js`, `bench-throughput.js` | Messungen (unten) |

Referenzen `ref/*.txt` (Nachkommastellen, abgeschnitten): `python3 gen-refs.py` (mpmath). Im Browser per `?raw=1` geholt (sonst liefert .htaccess den Text-Viewer).

Testparameter (Maximum senken, Fehler injizieren, Ballast) gehen nur ueber die Nachricht `{type:'test'}` vor `open`, nie ueber URL.

## Speicherbedarf (Byte je Stelle, WASM-Linearspeicher)

Messbefehl `node tests/irrational/measure-bpd.js <stellen> [ids]`, Datum 2026-10-23. Hinterlegt (aufgerundet) in `BYTES_PER_DIGIT` im Worker; Sicherheitsfaktor 1,25.

| Konstante | gemessen | hinterlegt |
|---|---|---|
| pi | 11,11 (2e6), 10,73 (8e6) | 12 |
| e | 8,65 (2e6), 9,45 (1,6e7) | 10 |
| ln2 | 12,16 (2e6), 11,79 (8e6) | 13 |
| sqrt2, phi | 8,45 (2e6, 16 MiB Grundspeicher), 6,01 (1,6e7) | 9 |

Daraus folgt eine Engine-Grenze bei 4 GiB von etwa 2,8e8 Stellen (pi).

## Durchsatz (Plan AC7)

`node tests/irrational/bench-throughput.js 1000000 3`: pi, 1e6 Stellen in einer Stufe, abwechselnd, Host unter Last.
Median alt (`pi-digits-worker.js`) 2,13 s, neu 2,13 s, Verhaeltnis 1,00. Kein Rueckschritt.

## Mutationslauf

`IRRATIONAL_WORKER=<Kopie> node tests/irrational/test_engine.js a2`, Kopien per sed aus dem Worker:

- Vorabpruefung umgedreht (`target > fit` -> `target < fit`, Marke `MUT:precheck`): rot, Fall "engine vor dem Rechnen" meldet `error` statt `limit` (es wird gerechnet); der Fall mit 50 Mio. Stellen rechnet danach ohne Ende.
- Klassifikation umgedreht (`cur + req <= maxBytes()` -> `>`, Marke `MUT:classify`): rot, "device" wird `engine` und umgekehrt (2 FAIL).
Der unveraenderte Worker: ALL PASS.
