# irrational-benchmark: Design

Seite `irrational-benchmark.html`. Baut auf `tools/irrational.js` und dem Worker `tools/workers/irrational-worker.js` auf (Plan: `docs/plans/PLAN-irrational.md`, Abschnitt 10). Der Worker bleibt unveraendert.

## Ziel

Geraete- und Browser-Benchmark: Wie weit kommt dieses Geraet Richtung Unendlich, gemessen in Nachkommastellen je Konstante (pi, e, ln 2, sqrt 2, phi).

## Verhalten

- Konstante waehlen, Start nur per Knopf. Der Lauf geht weiter, solange der Tab offen ist, bis Stopp oder Grenze. Kein Zeitfenster.
- Kein Fairness-Ausgleich: Drosselung, Hitze und Hintergrund-Tab zaehlen mit. Es gibt keinen Ungueltig-Zustand.
- Stopp jederzeit; das Ergebnis (Zahl, Zeit, Marken, Kurve) bleibt stehen. Danach ist ein neuer Start moeglich.
- Der Lauf fordert Stufe fuer Stufe an (`want(digits + 1)`, der Worker verdoppelt selbst). Angezeigt wird die Stellenzahl der fertigen Stufen.
- Anzeige: Stellenzahl, Laufzeit, Marken "Zeit bis 10^5, 10^6, 10^7 ...", Kurve Stellen ueber Zeit (Canvas, logarithmische Stellenachse), Algorithmus der Konstante (eine Zeile).
- Grenze (`onLimit`): Stellenzahl der Grenze und Ursache. `device` = Speicher des Geraets, `engine` = Browsergrenze. Ein Programmfehler (`onError`) ist ein roter Fehler und wird nie als Grenze gezeigt.
- Ergebnisse nur lokal (Anzeige, `localStorage`, letzter Lauf je Konstante). Kein Server, keine Bestenliste.
- Ergebnisobjekt: `constant`, `algorithm`, `digits`, `startedAt`, `elapsedMs`, `marks[{exp, digits, reached, ms}]`, `points[[ms, digits]]`, `tail` (letzte 64 erreichte Stellen) mit `tailFrom`, `end` (`running|stopped|limit|error`), `limit`, `error`.
- Same-origin, keine CDN, Fonts oder Tracker. Farben nur ueber `meta.css`-Variablen (Fehlerrot ausgenommen). Im Menue ueber `tools/generate-menu.py` / `includes/something-in-the-body.html`.

## Testhaken

`window.irrationalBenchmarkTest` (vor dem Laden per Init-Skript gesetzt, nie ueber die URL) wird als Testoptionen an `Irrational.open` gereicht: `failReserve` (device), `maxPages` (engine), `failOther` (Programmfehler). Lesender Zustand: `window.irrationalBenchmark.state()`.

## Acceptance Criteria (aus AC 10 des Plans)

Pruefung: `bash tests/irrationalBenchmark/run.sh` (Playwright, Chromium, Firefox, WebKit gegen https://dev.0nefinity.love/irrational-benchmark).

1. Start per Knopf; die laufende Zahl steigt.
2. Marke 10^5 erscheint mit Zeit; die Kurve hat mindestens 2 Punkte und ist gezeichnet.
3. Stopp friert ein: Zahl, Zeit, Marken und Punkte aendern sich 3 s lang nicht.
4. Kein Ungueltig-Zustand.
5. Kuenstliche Grenze per Testhaken zeigt die Ursache, getrennt fuer `device` und `engine`; ein simulierter Programmfehler zeigt den roten Fehler und keine Grenze.
6. Keine Netzanfrage ausser same-origin (Request-Log); keine Konsolenfehler im Normalfall.
7. Die Navigationsquelle (`includes/something-in-the-body.html`) enthaelt den Link.
8. Mutanten (`bash tests/irrationalBenchmark/mutants.sh`: Stopp friert nicht ein, Ursache vertauscht, Programmfehler als Grenze, Marke fehlt, Kurve ohne Punkte) werden in allen drei Browsern rot, das Original gruen.

## Stufe 2 (nicht gebaut)

Eine faelschungssichere Bestenliste geht nur mit einer serverseitig frischen Zufallsaufgabe, etwa einer Pruefsumme ueber Stellen mit Nonce oder zufaelligen Positionen nahe der behaupteten Stellenzahl. Pi-Stellen sind oeffentlich, und Zeitmessung im Browser laesst sich faelschen; eine gemeldete Zahl oder Zeit belegt daher nichts. v1 baut nichts davon, haelt aber `digits`, `tail` und die Zeiten im Ergebnisobjekt vor.
