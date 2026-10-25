# Tests unfoldingPi

Alle Tests laufen gegen die Live-Seite https://dev.0nefinity.love/unfoldingPi (Playwright Python, Chromium, Firefox, WebKit). Die Dateien sind sofort live, es gibt keinen Build.

    bash tests/unfoldingPi/run.sh        # alles, danach tests/irrational/run.sh und tests/irrationalBenchmark/run.sh
    SKIP_BENCH=1 bash tests/unfoldingPi/run.sh   # ohne Benchmark-Suite (SKIP_B1=1: ohne tests/irrational)
    BROWSERS=chromium bash tests/unfoldingPi/run.sh
    bash tests/unfoldingPi/mutants.sh    # jeder Mutant muss rot werden

| Datei | Prüft |
|---|---|
| `test_constants.py` | pi, e, ln 2, √2, φ gegen `tests/irrational/ref`; Auswahlfeld; unbekannte Konstante ist laut |
| `test_limits.py` | device: kleiner grauer Hinweis; engine: kein Text, `console.warn`; ohne Grenze kein Hinweis |
| `test_ui.py` | Gesten, Pixelproben, Layout (nur Chromium, Touch per CDP) |
| `test_front.py` | Kette wächst an der Front, Stellen korrekt (Chromium 2e6 in 25 s, sonst 1e6 in 150 s) |
| `test_nowasm.py` | Rückfall auf BigInt ohne WebAssembly: Hinweisrahmen, `console.warn`; Firefox/WebKit enden bei 96000 Stellen als engine-Grenze |
| `test_errors.py` | Fehlerpfade mit Worker-Attrappe |
| `test_restart.py` | Konstantenwechsel nach Fehler (`?c=foo`, Fehler mitten im Lauf): Fehler-/Grenzzustand ist zurueckgesetzt, Kette waechst, Stellen 2.71828 |
| `test_view_module.py` | Abroll-Modul `tools/unfolding-view.js`: unfoldingPi laedt es; mit fremder Ziffernquelle auf leerer Seite (create, setDigits/appendDigits, nur sichtbares Fenster, DigitError, Sperre, Ziehen); destroy entfernt Listener und Bildschleife |
| `test_bedienung.py` | Bedienung: Verdichtungs-Regler (P) aendert nur die Stauchzone (Start, eingerollt, d=0, Fenster klein/gross, danach die 3 ziehen) |
| `test_file.py` | Pi-Stellendatei `/pi-daten/pi-1e9.bcd` (Range-Lesen, Naht Geraet/Datei, Fehlerwege e1-e7, Block-Cache, Ehrlichkeit bei Hoechsttempo samt KB/s, Abbruch verlassener Fenster) |
| `test_big.py` | 3e5 Stellen in jedem Browser, Kette wächst weiter |
| `test_license.py` | Auslieferung, Content-Types, Lizenztexte, alter Worker 404 (nur einmal) |

Testhaken: `window.unfoldingPiTest` (per `add_init_script`, nie über die URL) wird an `Irrational.open` gereicht, z. B. `{failReserve:3}` (device: die Vorab-Reservierung der dritten Stufe liefert 0, also scheitert `memory.grow`), `{gmpAbort:50}` (echter GMP-Abbruch durch Division durch 0: muss roten Fehler zeigen, nie den Hinweis) oder `{maxPages:262}` (engine bei etwa 1,14e6 Stellen pi).

## Benchmark-Suite

`run.sh` startet am Ende `tests/irrationalBenchmark/run.sh` (Seite `irrational-benchmark`: Lauf, Ansicht, Diagramm-Beschriftung, Ueberschrift; `unfoldingPi.html` bleibt ohne Ueberschriftentext, geprueft dort). Log: `/tmp/unfoldingPi-bench.log`, Einzellogs `/tmp/irrationalBenchmark-<browser>.log`. Mutanten: `tests/irrationalBenchmark/mutants.sh`.

## Mutanten

`mutants.sh` startet am Ende auch `tests/irrational/mutants.sh` (Worker-Mutanten). Die Skripte setzen `PYTHONDONTWRITEBYTECODE=1`, damit kein `__pycache__` im oeffentlich ausgelieferten Baum entsteht; Einzelaufrufe `python3 tests/...` ebenso mit `PYTHONDONTWRITEBYTECODE=1`. `mutants.sh` ändert die ausgelieferte Datei per Route und erwartet Exit 1. Exit 3 heißt: Muster nicht gefunden, der Mutant ist wirkungslos.

| Test | MUT | Änderung |
|---|---|---|
| limits | invert | `lim.kind === 'device'` umgedreht |
| limits | always | Hinweis bei jedem Limit |
| nowasm | norfall | BigInt-Rückfall im Worker abgeschaltet |
| nowasm | nonotice | Worker schickt kein `notice` |
| nowasm | nowarn | Seite ohne `console.warn` |
| nowasm | nohint | Seite ohne Klasse `hinweis` |
| errors | notry | Anhängen ohne `try` |
| errors | swallow | Fehler verschluckt |
| errors | nopiError | `.warte` ohne `!piError` |
| restart | nopiError_reset | `startWorker()` setzt `piError` nicht zurueck |
| restart | nodrift_reset | Drift bleibt nach Neustart gesperrt |
| restart | nofehlerclass_reset | Fehlerrahmen bleibt nach Neustart |
| view_module | nolistener | `destroy()` entfernt den Zeiger-Listener nicht |
| view_module | noresize | `destroy()` entfernt den Resize-Listener nicht |
| view_module | noraf | `destroy()` bricht die Bildschleife nicht ab |
| bedienung | oldsetd | Regler geht wieder durch `settle()` und schiebt die 3 und L |
| bedienung | noclamp | d wird nicht auf das Moegliche begrenzt (L springt) |
| bedienung | nosnap | Regler springt bei zu grossem Wert nicht zurueck |
| bedienung | nocapresize | Fenster klein: d bleibt ueber der Kappe, R springt beim Vergroessern |
| bedienung | notitle | Titel wieder "unfoldingPi" |
| bedienung | text | sichtbarer Text auf der Seite |
| big | cap | Testhaken `failReserve:3` täuscht Speichermangel vor |
| limits | textclass | Worker wertet "Fatal error in gmp-wasm" per Fehlertext als Speichermangel (GMP-Abbruch zeigt Hinweis) |
| limits | noreserve | Worker meldet scheiterndes `memory.grow` nicht |

`test_ui.py` hat eigene Mutanten über `MUT` (revstop, nolost, norebase im Modul `tools/unfolding-view.js`; sliderpad, sliderleft in der Seite).

Nicht tötbar und deshalb nicht in der Liste: die Zeile `stage.classList.remove('warte', ...)` in `fail()`, weil `toggle('warte', !piError && ...)` dasselbe tut. Ebenso `console.warn` in `irrational.js`, weil der Worker selbst warnt.

## Bedienung

Spec der Bedienung von unfoldingPi (geprueft in `test_bedienung.py`, Gesten in `test_ui.py`):

- Der Verdichtungs-Regler (P, Schluessel `d`) aendert nur die Breite der Stauchzonen an den Enden. Die Enden L und R sowie die Position der Ziffern (die 3) bleiben dabei stehen; nichts springt, auch nicht beim Zurueckdrehen.
- Nicht jeder Wert passt. Ist nichts eingerollt, passt hoechstens der Platz rechts der 3 (R - X0); eingerollt hoechstens der halbe Abstand der Enden; immer hoechstens die halbe Fensterbreite. Darueber wird d begrenzt und der Regler springt auf den wirklichen Wert zurueck (er zeigt nie etwas anderes als die Ansicht). d = 0 ist erlaubt.
- Ist nichts eingerollt, ist L unsichtbar und folgt der 3 im Abstand d. Reicht die Kette rechts nicht bis R, rueckt nur R heran, die Ziffern bleiben.
- Wird das Fenster kleiner, wird d auf die halbe Breite begrenzt (Regler folgt); beim Vergroessern springt R nicht nach aussen.
- Enden ziehen, die 3 ziehen und Swipen arbeiten unabhaengig vom Regler weiter und nutzen das aktuelle d. Einen Schwung nach dem Swipe gibt es nicht; Dauerlauf (Drift) und Regler stoeren sich nicht, weil der Regler nur d setzt.

## Pi-Datei (virtualisiertes Pi)

- Jenseits der am Geraet gerechneten Stellen (Testhaken `deviceDigits`, Standard 100000) liest `tools/pi-file.js` die Stellen per HTTP-Range aus `/pi-daten/pi-1e9.bcd` (1e9 Stellen, BCD). Nur pi; auf dem Live-Host fehlt die Datei, dann meldet die Seite einen roten Fehler (`Pi-Datei: ...`), sobald das erste Dateifenster gebraucht wird.
- Testhaken `file:false` schaltet die Datei ab (Tests der Geraete-Front/-Grenzen), `fileUrl` ueberschreibt die URL.
- Kennzeichnung: Dateistellen mit Deckkraft 0,7 (Geraet 1,0), noch nicht geladene Stellen als blasser Balken (0,1). Kein Text.
- Streng: jedes Nicht-206, falsche Teilezahl, falsches Content-Range, falsche Dateigroesse, Nibbles > 9, falsche Laenge -> ein Fehler, Leser schliesst, `console.error`.
- Bloecke zu 128 Byte, LRU 640 Bloecke, hoechstens 350 Bereiche je Request, 2 Requests gleichzeitig, Abbruch (AbortController), wenn kein Block der Anfrage mehr gebraucht wird.
- Takt: die Bildperiode wechselt nur bei mehr als 12 % Abweichung (Hysterese); sonst verschoebe ein 16/17-ms-Wackeln (Firefox) die vorausgeholte Bahn (8x mehr Datenverkehr gemessen). Test j1, Mutant nohyst.
- Sausen: liegt der Vorschub je Bild ueber einer linearen Ziffer, rastet der Schritt auf die Bildperiode (Fenster springen im festen Abstand) und Wischer (Blur) deutet die Bewegung an. Kippgrenze gemessen (geometrisch, nicht per Auge): ab Regler etwa -0,18 je lineare Ziffer, ab etwa -0,43 sind aufeinanderfolgende Fenster (330 Stellen) ueberlappungsfrei.
- Datenrate bei Hoechsttempo (Regler -0,8, 6 s, chromium): etwa 27 KB/s, 2,4 Requests/s mit je etwa 28 Bereichen (`test_file.py` druckt die MESSUNG-Zeile).
