# PLAN: tools/irrational.js - geraeteadaptive Stellen irrationaler Konstanten

Stand 2026-10-23, Ausgang `839eac73` (claude-dev). Erster Nutzer: `unfoldingPi.html`.

## Fassung 2 (gilt) - nach attack-plan

Fassung 1 (unten, unveraendert stehen gelassen) ist **gekippt**. Treffer des
Widerlegers, selbst nachgeprueft wo tragend:

- blockierend: "grow scheitert unter dem Maximum = Geraet" haelt nicht in beide
  Richtungen. Bei echter Speichernot kommt meist ein Tab-Absturz
  (`/proc/sys/vm/overcommit_memory` = 0 auf diesem Host, nachgesehen; OOM-Killer,
  iOS jetsam) -> nie ein Hinweis. Und grow kann aus Prozess-Policy scheitern
  (iOS ~300-500 MB fuer WASM, WebKit-Bug 269777; Adressraum).
- billiger: 4 GiB gibt es mit einem Byte im vorhandenen gmp-wasm (Memory-Maximum
  32768 -> 65536 Seiten), Probe des Widerlegers: zweimal 1500 MiB allokierbar
  statt einmal. Eigener C/emscripten-Build nur fuer Memory64 noetig; kein
  belegter wasm64-GMP-Build, emsdk fehlt, und 16 GiB erreicht man erst nach
  ~7-10 h Rechnen auf diesem Host.
- Messkorrektur: WASM-Speicher ~11,3 B/Stelle (nicht 16) -> 2 GiB bei ~1,9e8,
  4 GiB bei ~3,8e8 Stellen (pi; andere Konstanten im Bau messen).
- Zeit: bis 4 GiB hochgerechnet 1,4-2,1 h Rechenzeit auf diesem Host.
- Auflagen: Klassifikation ueber angeforderte Groesse statt nur aktuelle;
  Tests, die alte Pfade pruefen (rep2/common.py, test_a1.py, Nav-Include), mit
  umziehen; BigInt-Rueckfall je Konstante, dort Grenze immer `engine`;
  Engine-Ende nicht still; postMessage mit Transfer; ln2 mit der schneller
  konvergierenden Formel.

### Entscheidung

1. **Kein eigener C-Build in v1.** gmp-wasm 1.3.2 mini bleibt, das eingebettete
   WASM wird reproduzierbar gepatcht (Skript im Repo, `tools/vendor/gmp-wasm/
   patch-4gib.js`, README nennt Aenderung und Grund, LGPL bleibt erfuellt:
   unverandertes Original plus Patch-Skript same-origin). Maximum = 4 GiB =
   Hoechstwert fuer wasm32 in jeder Engine. Zeiger im JS mit `>>> 0` lesen; ein
   Test rechnet, nachdem > 2 GiB Speicher belegt sind, und vergleicht Stellen.
   Memory64 (16 GiB, eigener GMP-Build) ist Stufe 2 nach Vorversuch.
2. **Engine in einem Worker** `tools/workers/irrational-worker.js` (ersetzt
   `pi-digits-worker.js`): Binary Splitting in JS ueber `mpz_*` fuer pi
   (Chudnovsky), e (sum 1/k!), ln2 (Machin-artig, ArcCoth-Formel
   144 acoth 251 + 54 acoth 449 - 38 acoth 4801 + 62 acoth 8749, gegen die
   Dreierformel und mpmath geprueft), Wurzel per `mpz_sqrt` (O(M(n)), Klasse
   Newton) fuer sqrt2 und phi. Stufen mit Zielverdopplung, nur neue Stellen,
   `Uint8Array` per Transfer. Schutzstellen + Fehlerschranke wie heute.
3. **Grenzen, ehrlich**:
   - `engine`: die naechste Stufe braucht laut gemessener B/Stelle der Konstante
     (+ Sicherheitsfaktor) mehr als das Modul-Maximum, oder BigInt-Rueckfall
     an seiner Grenze, oder Zeichenkettengrenze der Seite. Wird **vor** dem
     Rechnen erkannt. Kein Hardware-Hinweis. Ende nicht still: `console.warn`,
     `state().limit`, Anzeige steht an der letzten Stelle (Wartelinie hoert auf
     zu pulsieren).
   - `device`: GMP-Allokation scheitert, obwohl aktuelle Groesse + angeforderte
     Groesse <= Modul-Maximum (eigene Allokationsbuchhaltung im Worker ueber die
     Exporte; nach Abbruch Instanz neu). Dann der Hinweis "use better hardware
     to get access to more digits". Begruendung: in allen bekannten Ursachen
     (RAM, iOS-Prozesslimit skaliert mit Geraet, 32-Bit-Adressraum) kommt ein
     besseres Geraet weiter. Annahme, im Spec benannt.
   - Tab-Absturz durch OOM: nicht abfangbar, kein Hinweis, keine Luege. Spec
     nennt das.
   - Zeit: keine Grenze; die Anzeige wartet. Mehr Leistung = mehr Stellen je
     Zeit; das ist die Kopplung an das Geraet, die fuer fast alle Nutzer greift
     (4 GiB erst nach Stunden).
4. Algorithmusgarantie: "beste Klasse" = Formel/Komplexitaet wie y-cruncher
   (Belege oben). Nicht gleiche Implementierung (y-cruncher: eigene FFT, Mehrkern,
   Out-of-Core). Spec sagt das so.
5. API `tools/irrational.js`, Kette, unfoldingPi-UI, Spec, Tests, Benchmark:
   wie Fassung 1 Punkte 3, 6, 8, 9, 10; Kette bleibt String (4 GiB-Grenze
   ~3,8e8 < V8-Stringgrenze 5,36e8; die kleinere zaehlt als `engine`).
6. Tests, die alte Pfade pruefen, ziehen mit um (rep2/common.py Route auf neuen
   Worker, test_a1.py Lizenzpfade + Patch-Skript, Nav-Include neu erzeugen per
   `tools/generate-menu.py`).

### Zusaetzliche Acceptance Criteria (Fassung 2)

- A1 Patch: Memory-Maximum im ausgelieferten WASM = 65536 Seiten (Skript liest
  es aus); Test belegt > 2 GiB und rechnet danach 1e5 Stellen pi korrekt.
- A2 Klassifikation: Test mit kuenstlich gesenktem Maximum (Patch-Variante nur
  im Test) -> `engine` vor dem Rechnen; Test mit injiziertem Allokationsfehler
  unter dem Maximum -> `device`; Mutant (Vergleich umgedreht) rot.
- A3 BigInt-Rueckfall: jede Konstante ohne WebAssembly 1e4 Stellen korrekt;
  Grenze dort immer `engine`.
- A4 B/Stelle je Konstante gemessen und im Worker als Konstante mit Quelle
  (Messbefehl) hinterlegt.
- A5 AC7 gilt fuer den gepatchten Build gegen den heutigen.
- In Fassung 1 unten gelten fuer v1 nicht: Punkt 1 (C-Build), Punkt 5
  (Uint8Array-Kette), AC1/AC8 "beide Builds/.wasm" (es gibt einen gepatchten
  Build, eingebettet im Bundle).

---

## Fassung 1 (gekippt, Original)

## Auftrag (Tim)

Stellen an die Geraeteleistung koppeln: mehr Power, mehr Stellen, so effizient
wie moeglich. Ein winziger grauer Hinweis ("use better hardware to get access to
more digits") nur, wenn garantiert ist, dass schon der beste Algorithmus laeuft.
Konstante waehlbar (pi, e, Wurzel 2, goldener Schnitt, weitere). Wiederverwendbar
als `tools/irrational.js`.

## Problem, gemessen

- Heute: `tools/workers/pi-digits-worker.js`, Chudnovsky + Binary Splitting in
  rohen `mpz_*`-Aufrufen ueber `gmp-wasm` 1.3.2 mini (nur mpz/mpq, kein MPFR).
- Das WASM-Memory ist mit Maximum 32768 Seiten = **2 GiB** gebaut (fest, gemessen
  per `WebAssembly.Module.exports`/Memory-Abschnitt, BESTAND.md). Folge: Ende bei
  ca. 65-100 Mio. Stellen, auf jedem Geraet gleich. Bessere Hardware bringt
  darueber **nichts**; der gewuenschte Hinweis waere dort gelogen.
- node v22, Host unter Last (Load 45-90/16 Kerne): 1e6 Stellen 5,9 s / 70 MB,
  4e6 26,3 s / 109 MB, 1,6e7 113 s / 253 MB (~16 Byte/Stelle Spitze).
- Im Hauptthread liegt die Kette als ein JS-String (`chain +=`). V8-Strings enden
  bei 2^29-24 Zeichen (~536 Mio.); das waere die naechste feste Grenze.
- Spec `docs/specs/2026-05-18-unfoldingPi-design.md` Z. 86-87 behauptet "keine
  feste Stellengrenze; einzige Grenze ist ... Speicher des Geraets" -> falsch.

## Algorithmen je Konstante (Massstab y-cruncher)

| Konstante | Algorithmus | Beleg |
|---|---|---|
| pi | Chudnovsky, Binary Splitting | numberworld.org/misc_runs/pi-5t/details.html: "Chudnovsky's Formula was used with Binary Splitting" |
| e | Taylorreihe sum 1/k!, Binary Splitting | numberworld.org/y-cruncher/internals/formulas.html: "Taylor Series of exp(1)" |
| sqrt 2 | Newton-Klasse, O(M(n)) | formulas.html: "1st order Newton's Method" |
| phi=(1+sqrt5)/2 | wie sqrt, dann (1+s)/2 | formulas.html (wie oben) |
| ln 2 | Machin-artige ArcCoth-Formel, je Term Binary Splitting | formulas.html: "machin-like formulas for the log of any small integer" |

Wurzel: GMP `mpz_sqrt` ist Zimmermanns Karatsuba-Square-Root, asymptotisch O(M(n))
wie Newton. Wird im Bau gegen eine eigene Newton-Iteration (1/sqrt, Genauigkeit
verdoppelnd) gemessen; das Schnellere bleibt, beide sind dieselbe Klasse.

ln 2 Formel: eine Machin-artige ArcCoth-Formel (Kandidat 18 acoth 26 - 2 acoth 4801
+ 8 acoth 8749, aus Rekordbericht; im Test gegen mpmath und gegen eine zweite
Formel geprueft, da die Quelle 404 lieferte).

**Nicht in v1** (kein belegter Bestalgorithmus): Euler-Mascheroni gamma
(Brent-McMillan nicht belegt), zeta(3), Catalan (y-cruncher nutzt seit v0.8.3
andere Formeln, Guillera/Pilehrood fuer Catalan; konkrete Formeln unbelegt).
Ohne Beleg keine "bester Algorithmus"-Garantie -> Stufe 2.

"Bester Algorithmus" heisst hier: dieselbe Formel und Komplexitaetsklasse wie
y-cruncher. Nicht dieselbe Implementierung: y-cruncher hat eigene FFT/NTT,
Mehrkern und Out-of-Core; wir haben GMP-Multiplikation, einen Kern.

## Entwurf

1. **Eigenes WASM statt gmp-wasm-Binding.** Eine C-Datei
   (`tools/irrational/irrational.c`) mit Binary Splitting fuer pi, e, ln2 und
   Wurzel fuer sqrt2/phi, gegen GMP 6.3.0 (LGPL-3.0, statisch) mit emscripten
   gebaut. Export: `compute(const_id, digits) -> char*` (Dezimalstellen nach dem
   Komma), `free_result`. Zwei Builds aus derselben Quelle:
   - `irrational32.wasm`: wasm32, `MAXIMUM_MEMORY=4GB` (Engine-Hoechstwert wasm32).
   - `irrational64.wasm`: Memory64, Maximum 16 GiB, nur geladen, wenn
     `WebAssembly.validate` eines Memory64-Mini-Moduls true liefert.
   Build-Skript `tools/irrational/build.sh` pinnt emsdk- und GMP-Version mit
   sha256; Quelle, Skript und Lizenztexte liegen same-origin (LGPL: Neulinken
   moeglich). Kein CDN.
2. **Worker** `tools/workers/irrational-worker.js`: laedt das passende WASM,
   rechnet Stufen mit Zielverdopplung (wie heute), schickt nur neue Stellen.
   Gesicherte Stellen: mit Schutzstellen rechnen und nur Stellen freigeben, die
   durch eine Fehlerschranke sicher sind (kein ...999-Kippen).
3. **API `tools/irrational.js`** (klein):
   ```js
   const src = Irrational.open('pi', { onDigits(chunk, total){}, onLimit(info){}, onError(err){} });
   src.want(n);   // Stellen bis n anfordern (Vorrat), idempotent
   src.close();
   Irrational.constants  // [{id:'pi', label:'π', algorithm:'Chudnovsky, binary splitting'}, ...]
   ```
   `onLimit({kind:'device'|'engine', digits})` genau einmal; `onError` laut (fail loud).
4. **Grenzklassen (Ehrlichkeit)**:
   - `device`: Speicherwachstum (`memory.grow`/malloc) scheitert **unterhalb**
     des deklarierten Maximums des geladenen Moduls -> das Geraet/der Browser
     hat keinen Speicher mehr. Nur dann der Hinweis.
   - `engine`: die Rechnung braucht mehr als das Modul-Maximum (4 GiB wasm32 bzw.
     16 GiB Memory64) -> vorher abschaetzen (Bytes/Stelle gemessen) und nicht
     erst anlaufen. Kein Hardware-Hinweis.
   - Zeit ist keine Grenze: langsame Geraete warten (bestehender Wartezustand).
5. **Kette ohne String-Grenze**: Stellen in der Seite als Liste von
   `Uint8Array`-Bloecken statt eines JS-Strings; Zugriff per Index. Damit ist die
   Kette nur durch den Speicher begrenzt (Hauptthread = Geraet).
6. **unfoldingPi**: Konstantenwahl per `panel.addSelect` im bestehenden
   controls.js-Feld (Labels pi, e, sqrt2, phi, ln 2). Wechsel setzt die Kette
   zurueck und laedt die Reserve der Konstante (je 1000 Stellen eingebettet zur
   Pruefung des Workers). Seitentitel/URL bleibt. Hinweis: englisch,
   `font-size` klein, `color: var(--text-color)` mit niedriger Deckkraft, erst bei
   `onLimit.kind==='device'`, Text "use better hardware to get access to more
   digits". Bei `engine`: kein Text, die Anzeige steht an der letzten Stelle wie
   im Wartezustand, kein roter Rahmen. Sonst kein Text auf der Seite.
7. **Alter Worker** `pi-digits-worker.js` und `tools/vendor/gmp-wasm/` werden
   entfernt, wenn nichts anderes sie laedt (grep), samt BigInt-Rueckfall nach
   dem Muster von heute im neuen Worker (ohne WebAssembly: BigInt, Hinweisrahmen
   wie bisher).
8. **Spec** korrigieren: feste Grenzen nennen (wasm32 4 GiB, Memory64 16 GiB,
   Safari ohne Memory64), Grenzklassen, Konstanten, Stufe 2.
9. **Tests ins Repo** (`tests/irrational/`): node-Tests der Engine gegen
   mpmath-Referenzen (Python erzeugt `ref/<id>.txt`, 1e5 Stellen je Konstante,
   pi zusaetzlich 4e5 aus vorhandener Referenz) und Playwright-Tests der Seite
   (Chrome/Firefox/WebKit), ausgehend von den Scratchpad-Tests der Vorlaeufe
   (`bau/test_pi.py`, `bau2/test_front.py`, `rep2/*`), die mit ins Repo gehen.

10. **Letzte Etappe: `irrational-benchmark.html`** (Tims Name), baut auf
    irrational.js auf. Konstante waehlen, Start nur per Knopf, Stopp jederzeit
    (Ergebnis bleibt stehen). Kein Zeitfenster (Tim, 2. Korrektur): der Lauf
    geht weiter, solange der Tab offen ist, bis Stopp oder Grenze. Anzeige:
    laufende Stellenzahl (fertig gerechnete Stufen), Marken "Zeit bis 10^5,
    10^6, 10^7 ...", ruhige Kurve Stellen ueber Zeit (Canvas, log-Achse), und
    bei Grenze wo (Stellen) und warum (Speicher des Geraets / Browsergrenze).
    Keine Fairness-Korrektur (Tim): Drosselung durch Hitze oder versteckten Tab
    zaehlt mit, kein Ungueltig-Zustand; das Ergebnis ist, was Geraet + Browser
    geschafft haben. Ergebnisse nur lokal (Anzeige, optional localStorage), kein
    Server, keine Bestenliste; das Ergebnisobjekt behaelt aber Konstante,
    Stellenzahl, Zeitfenster und die letzten erreichten Stellen, damit Stufe 2
    darauf aufsetzen kann. Je Konstante Algorithmus nennen; bei Grenze die
    Ursache (Speicher des Geraets / Browsergrenze / Zeitfenster). Dunkel, ruhig,
    wenig Text (design-tim), im Nav auffindbar (Menue-Mechanik des Repos).
    Kommt erst nach Engine und unfoldingPi.

## Ausdruecklich nicht drin

- Out-of-Core (Zwischenergebnisse in OPFS wie y-cruncher Swap-Modus): Stufe 2.
  Braucht eigene Out-of-Core-Multiplikation; Wochen, nicht Tage.
- Mehrkern (Binary Splitting auf mehrere Worker verteilt): Stufe 2. GMP ist
  einkernig; Zusammenfuehren kopiert grosse Zahlen zwischen Workern.
- gamma, zeta(3), Catalan: Stufe 2 (siehe oben).
- Faelschungssichere Bestenliste: Stufe 2. Ein Ergebnis wird nicht als Zahl
  gemeldet, sondern durch Stellen belegt: der Server nennt zufaellige
  Positionen nahe der behaupteten Stellenzahl, der Client liefert die Ziffern
  dort, der Server prueft stichprobenartig gegen eigene Referenz. v1 baut nichts
  davon, haelt aber die erreichten Stellen im Ergebnis vor.
- `navigator.deviceMemory` als Grenze: nein, nur Chromium, gekappt; die echte
  Grenze ist das Scheitern der Allokation.
- Inkrementelles Weiterrechnen statt Neuberechnung je Stufe: nein (Verdopplung
  kostet hoechstens Faktor 2, frueher gemessen langsamer).
- Kein Text ausser dem Hinweis; keine Anzeige von Algorithmus oder Stellenzahl.

## Bekannte Grenzen

- Safari/WebKit ohne Memory64: Obergrenze wasm32 4 GiB (engine) -> etwa
  2-2,5e8 Stellen (hochgerechnet aus 16 B/Stelle, im Bau zu messen).
- Chrome/Firefox mit Memory64: 16 GiB; Geraete mit weniger freiem Speicher
  scheitern vorher (device, Hinweis ehrlich).
- Wie weit ein Durchschnittsgeraet in welcher Zeit kommt, wird im Bau gemessen
  (node + Chromium headless auf diesem Host) und in die Spec geschrieben.
- Ob Engines `memory.grow` unterhalb des Maximums zuverlaessig mit Fehler statt
  Tab-Absturz beantworten, ist offen (Tab-Absturz = keine Meldung moeglich).

## Acceptance Criteria

1. node-Test: jede Konstante in beiden Builds (wasm32, Memory64 unter node 22)
   liefert 1e5 Stellen identisch mit mpmath-Referenz; pi 4e5 identisch mit
   `pi_ref.txt`. Mutant (eine Konstante falscher Term) -> rot.
2. Stufen: `want(2e6)` liefert nur aufsteigende, lueckenlose Bloecke; Summe ==
   Referenzpraefix.
3. Grenzklasse: Test mit kuenstlich kleinem Modul-Maximum (Build-Variante oder
   Speicherlimit-Parameter) -> `onLimit.kind==='engine'` ohne Hinweis; Test mit
   simuliertem Allokationsfehler unter Maximum -> `device` mit Hinweis.
   Mutant (Klassen vertauscht) -> rot.
4. Playwright Chrome/Firefox/WebKit gegen https://dev.0nefinity.love/unfoldingPi:
   Konstantenwahl schaltet um, erste 1000 Stellen jeder Konstante korrekt; Seite
   ohne Konsolenfehler; ohne Grenze kein sichtbarer Text ausser vorher vorhandenem.
5. Bestehende Tests (aus Scratchpad ins Repo uebernommen) gruen.
6. Hinweistext erscheint nur bei `device` (Test 3) und ist englisch, grau, klein.
7. Durchsatz: pi 1e6 Stellen im Worker nicht langsamer als heute (Vergleich auf
   demselben Host, gleiche Last-Messung hintereinander).
8. `curl -sI` auf Seite, Worker, beide `.wasm` (Content-Type application/wasm),
   Lizenztexte (text/plain) liefert 200 same-origin.
9. Spec nennt keine "unbegrenzt"-Behauptung mehr ohne Grenzklassen.
10. Benchmark: Playwright startet Lauf per Knopf in Chrome/Firefox/WebKit,
    laufende Zahl steigt, Marke 1e5 erscheint mit Zeit, Kurve hat >= 2 Punkte,
    Stopp friert Ergebnis ein (Zahl aendert sich danach 3 s nicht);
    kein Ungueltig-Zustand; kuenstliche Grenze (Test-Parameter) zeigt Ursache;
    keine Netzanfrage ausser same-origin Assets (Request-Log); Seite im Menue
    (`curl` der Navigationsquelle enthaelt den Link).
