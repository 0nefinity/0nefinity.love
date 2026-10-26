/*
 * UnfoldingView: rollt eine Ziffernkette auf einem Canvas ab (links eingerollt, rechts verdichtet), mit Ziehen/Wischen.
 * Klassisches Script, kein Build, same-origin. Setzt das Global `UnfoldingView`.
 *
 *   const view = UnfoldingView.create(canvas, {
 *     rate()            // optional: Stellen/s (positiv = vorwaerts, 0 = Stillstand), je Bild gelesen; hat Vorrang vor drift()
 *     drift()           // optional: Reglerwert -1..1 (0 = Stillstand), exponentielle Kennlinie bis 1e10 Stellen/s
 *     onNeedDigits(n)   // optional: die Ansicht braucht Nachkommastellen bis n (Vorrat); der Besitzer rechnet/laedt nach
 *     onFront(atFront)  // optional: je Bild, true = sichtbares Fenster reicht an die letzte bekannte Stelle
 *     factor            // optional: Verdichtungsfaktor 0..1 (Standard DEFAULT_FACTOR), siehe Auto-Verdichtung unten
 *     onPointerInfo(i)  // optional: Ziffer/Zone unter Zeiger oder Tap geaendert: null, {kind:'digit', index}, {kind:'left', hi},
 *                       // {kind:'right', lo} (bis zur letzten Stelle und darueber hinaus) oder {kind:'all'} (nichts lesbar)
 *     intPart, decimals // optional: Anfangskette (Ganzzahl, Nachkommastellen), schon beim ersten Layout da (sonst '0.')
 *     colorElement      // optional: Element, dessen CSS-Farbe die Schrift bestimmt (Standard: canvas)
 *     dir               // optional: 'r' (Standard) oder 'l': gespiegelt, die Kette laeuft nach links, Ziffern bleiben aufrecht
 *     dot               // optional: false = den Punkt nicht zeichnen (der Besitzer zeichnet das centrum); sonst das Glyph "." der Schrift
 *     fixedStart        // optional: true = nur das aeussere Ende R ist greifbar; Anfang (3/centrum), L, Wischen und Mausrad sind gesperrt
 *     origin            // optional: Lage der Ganzzahl beim Start (CSS-px ab Anfang der Achse; Standard: Mitte)
 *     unrolled          // optional: true = ausgerollt starten (R am Rand), bis zum ersten Ziehen/Rad
 *     fontPx            // optional: Schriftgroesse in CSS-px (Zahl oder Funktion); Standard 6 % der Fensterbreite, 28..56
 *     localX(e)         // optional: Zeigerlage auf der Achse (CSS-px, ungespiegelt) fuer gedrehte Canvas; die Groesse kommt
 *                       // dann aus dem Layout (clientWidth/clientHeight), nicht aus der gedrehten Huelle
 *   });
 *   view.resize()                       // neu messen, nachdem der Besitzer die Canvas umgelegt hat
 *   view.setDigits(intPart, decimals)   // Kette neu: Ganzzahl, ".", bekannte Nachkommastellen (ASCII-String)
 *   view.appendDigits(u8, offset)       // wie Irrational.onDigits: ASCII-Bytes '0'..'9', offset = Nachkommastelle des ersten Bytes
 *   view.rewind()                       // zurueck zum Anfang (die Ganzzahl vorn)
 *   view.setFactor(f)  view.setLocked(b)  view.invalidate()  view.refreshColor()
 *   view.setRemote(r)                   // optional: Ziffernquelle jenseits der Kette (z. B. tools/pi-file.js): r.length (Kettenlaenge
 *                                       // gesamt), r.at(i) (ASCII-Code oder 0 = noch nicht da), r.want(lo, hi, step) (Fenster, Versatz je Bild).
 *                                       // Ziffern aus r (Index >= Kettenlaenge) sind dezent gedaempft, noch fehlende ein ruhiger Strich
 *                                       // (gestaucht zaehlen sie wie Ziffern mittlerer Tinte).
 *   view.setHover(x)                    // Zeigerposition (CSS-px im Canvas) oder null; Maus und Tap setzen sie selbst
 *   view.state()  view.digits()  view.shown()  view.columns()  view.glyphInk()   // nur lesend (Tests)
 *   view.destroy()                      // Listener, Beobachter und Bildschleife weg
 *
 * Fehler werfen: appendDigits wirft UnfoldingView.DigitError bei Luecke/Widerspruch (Meldung ist fertig lesbar), sonst die
 * urspruengliche Ausnahme (z. B. RangeError an der Stringgrenze). Kein stilles Verschlucken; der Besitzer entscheidet.
 * Einzeln gezeichnet werden nur Ziffern ab 1 Geraetepixel Breite; Atlas je Zeichen/Farbe/Groesse einmal.
 * Stauchzone: Tinte bleibt erhalten. Eine gestauchte Ziffer gibt ihre ganze Tinte (Flaeche der Glyphe) an die Spalten ab,
 * die sie ueberdeckt; je Geraetepixel addiert sich die Tinte zur Deckkraft (hoechstens 1). So wird die Zone schmaler und
 * satter, nie blasser, und bleibt bis zuletzt eine Haarlinie, solange dort Ziffern liegen (auch bei d = 0).
 * Auto-Verdichtung: die Zonenbreite d folgt dem Abstand der Enden D = R - L, d = f * max(0, D - w) (hoechstens D/2). Beim
 * Laden liegen die Enden eine Ziffer weit auseinander: nur die Ganzzahl ist lesbar, d = 0, der Rest liegt als Haarlinie an
 * der Kommaposition. Je weiter die Enden auseinander, desto breiter die Zone; zusammengeschoben geht d stetig auf 0.
 * Die Enden sind ungleich: rechts liegt der unendliche Rest (Zone d, satt), links liegen genau die hineingeschobenen Stellen.
 * Ihre Zone ist dL = d (1 - e^(-u/d)) breit (u = Laenge der hineingeschobenen Stellen), die 3 liegt immer genau auf L:
 * nichts hineingeschoben, kein linker Strich (offen ist L = X0); je mehr hinein, desto breiter und satter.
 * Gestauchte Ziffern geben ihre Seitenraender ab (Fenster auf die Tinte der Glyphe), damit kein Spalt vor den Enden bleibt.
 * Mausrad und Trackpad schieben die Kette (runter/rechts = weiter, wie Lesen), die Seite scrollt dabei nicht.
 * Faktor ueber 0,5: d bleibt bei f = 0,5, dazu mischt lambda = 2f - 1 die Gleichverteilung aller vorhandenen Stellen
 * zwischen L und R hinein (pos = M + lambda (U - M)). Bei f = 1 ist jede Stelle (R - L) / N breit: ein satter Balken.
 * Stauchzonen unter 1 Geraetepixel je Ziffer entstehen spaltenweise aus gezaehlten Ziffern: je Spalte die Zahl jedes
 * Ziffernwerts (Kette: Praefixsummen; Quelle: r.count(lo, hi, out)), mal der Zeilentinte seiner Glyphe. Annahmen, im Code
 * markiert: noch nicht geladene Stellen zaehlen mit der mittleren Tinte aller Glyphen; hinter der letzten Stelle
 * (Unendlich) liegt eine satte Spalte mittlerer Tinte.
 */
(() => {
  'use strict';

  const MARGIN = 8;          // Mindestabstand der Enden zum Bildrand (px)
  const HIT = 20;            // halbe Trefferbreite (>= 40px breit)
  const GLYPHS = '0123456789.';
  const DEAD_ZONE = 0.02;    // |Regler| darunter gilt als Mitte: kein Kriechen
  const FILE_ALPHA = 0.7;    // Ziffern aus der Quelle jenseits der Kette: leicht gedaempft
  const PENDING_ALPHA = 0.1; // noch nicht geladene Stelle: leiser Strich statt einer Ziffer
  const DEFAULT_FACTOR = 0.2;
  const rateOf = (s) => Math.sign(s) * (Math.pow(10, 10 * Math.abs(s)) - 1);

  class DigitError extends Error {}
  // 0..1 (ueber 0,5 mischt sich die Gleichverteilung hinein); keine Zahl ist ein Fehler des Besitzers.
  function clampFactor(f) {
    const v = +f;
    if (!Number.isFinite(v)) throw new TypeError('UnfoldingView: factor muss eine Zahl sein, war ' + f);
    return Math.max(0, Math.min(1, v));
  }

  function create(canvas, opts) {
    opts = opts || {};
    if (!canvas || typeof canvas.getContext !== 'function') throw new TypeError('UnfoldingView.create: canvas fehlt');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('UnfoldingView.create: kein 2D-Kontext');
    const colorEl = opts.colorElement || canvas;
    if (opts.dir !== undefined && opts.dir !== 'l' && opts.dir !== 'r') throw new TypeError("UnfoldingView: dir muss 'l' oder 'r' sein, war " + opts.dir);
    const mirror = opts.dir === 'l';
    if (![undefined, true, false].includes(opts.dot)) throw new TypeError('UnfoldingView: dot muss true oder false sein, war ' + opts.dot);
    function fontOf() {
      const v = +(typeof opts.fontPx === 'function' ? opts.fontPx() : opts.fontPx);
      if (!(v > 0) || !Number.isFinite(v)) throw new TypeError('UnfoldingView: fontPx muss eine positive Zahl sein, war ' + v);
      return v;
    }
    let unroll = !!opts.unrolled;
    const decoder = new TextDecoder('latin1');

    // Die Kette liegt als Bytes (ASCII): Ganzzahl, ".", Nachkommastellen. Index 0 = Ganzzahl. Kein String: keine Stringgrenze,
    // ein Byte je Stelle; chainLen zaehlt die belegten Bytes, buf waechst durch Verdoppeln.
    let buf = new Uint8Array(64), chainLen = 0, headLen = 2;
    let cpre = new Uint32Array(0), cpreN = 0;   // Praefixsummen der Kette je Zeichen, siehe chainPre
    function setChain(intPart, decimals) {
      const head = String(intPart) + '.' + (decimals || '');
      if (buf.length < head.length) buf = new Uint8Array(Math.max(head.length, 64));
      for (let i = 0; i < head.length; i++) buf[i] = head.charCodeAt(i);
      chainLen = head.length;
      headLen = String(intPart).length + 1;
      cpreN = 0;
    }
    function reserve(n) {
      if (n <= buf.length) return;
      const nb = new Uint8Array(Math.max(n, buf.length * 2));
      nb.set(buf.subarray(0, chainLen));
      buf = nb;
    }
    setChain(opts.intPart === undefined ? '0' : opts.intPart, opts.decimals);
    // ─── Zustand ───
    // L, R: Bildschirmpositionen der Enden; X0: lineare Position (linke Kante) von Zeichen 0; d: Verdichtungsdistanz.
    let W = 0, H = 0, dpr = 1, S = 40, w = 24;
    let L = 0, R = 0, X0 = 0, d = 0;
    let factor = clampFactor(opts.factor === undefined ? DEFAULT_FACTOR : opts.factor);
    let color = '#fff';
    let atlas = null, atlasKey = '', inkTop = 0, inkBottom = 0, atlasRgb = [0, 0, 0], gw = 1, gh = 1;
    // Stauchzone, einmal je Bild ausgegeben: ink[c * gh + y] traegt die Tinte gestauchter Ziffern ab 1 Geraetepixel Breite,
    // acc[c * NGA + t] die Zahl der Ziffern t (Anteil) unter 1 Geraetepixel; t = AVG ist eine noch fehlende Stelle.
    const NG = GLYPHS.length, AVG = NG, NGA = NG + 1;
    let acc = new Float32Array(0), ink = new Float32Array(0), accCols = 0, flushCanvas = null, flushCtx = null;
    const zoneL = { lo: Infinity, hi: -1 }, zoneR = { lo: Infinity, hi: -1 };
    let dirty = true;
    let velocity = 0, drawnCount = 0;
    let locked = false;
    let drag = null;
    let last = 0, curRate = 0;
    let rafId = 0;
    let destroyed = false;
    let remote = null;
    let step = 0, blur = 0, sausen = false;      // Versatz je Bild (Zeichen), Schleier (px), Fenster liegen auseinander
    const dts = [];                              // letzte Bilddauern (ms): Takt der Anzeige
    let period = 1 / 60;
    let shownLo = 0, shownCodes = new Uint8Array(0), shownMark = new Uint8Array(0), shownN = 0;

    const deff = () => Math.max(0, Math.min(d, (W - 2 * MARGIN) / 2));
    // Linkes Ende: h = L - X0 ist die Strecke, um die die Kette links hinter L steht. Hineingeschoben ist die Laenge u mit
    // h = u - dd (1 - e^(-u/dd)): die linke Zone ist dann dL = u - h breit und die 3 liegt genau auf L.
    let uKey = '', uVal = 0;
    function leftU(dd) {
      const h = L - X0;
      if (!(h > 0)) return 0;
      if (!(dd > 0)) return h;
      const key = L + '|' + X0 + '|' + dd;
      if (key === uKey) return uVal;
      let lo = h, hi = h + dd;
      for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (m - dd * (1 - Math.exp(-m / dd)) < h) lo = m; else hi = m; }
      uKey = key; uVal = (lo + hi) / 2;
      return uVal;
    }
    const hOf = (u, dd) => (dd > 0 ? u - dd * (1 - Math.exp(-u / dd)) : u);
    const startIdx = () => leftU(deff()) / w;                 // Index des ersten linear sichtbaren Zeichens
    const total = () => remote ? Math.max(chainLen, remote.length) : chainLen;
    const avail = () => Math.max(0, total() - 2) * w;   // Länge aller Nachkommastellen

    // Textfarbe einmal lesen, nicht je Bild; bei Theme-Wechsel (Inline-Variablen/Klassen an html/body, Systemschema) neu.
    function refreshColor() {
      const cs = getComputedStyle(colorEl).color;
      if (cs !== color) { color = cs; dirty = true; }
    }

    // ─── Ziffern ───
    function setDigits(intPart, decimals) {
      setChain(intPart, decimals);
      keepUnrolled();
      dirty = true;
    }
    // Ausgerollt starten: settle deckelt R auf die vorhandene Kette, also nach jedem Nachladen wieder an den Rand.
    function keepUnrolled() {
      if (!unroll || !(W > 0)) return;
      R = W - MARGIN;
      settle('three');
    }
    function appendDigits(u8, offset) {
      if (!(u8 instanceof Uint8Array)) throw new TypeError('appendDigits erwartet ein Uint8Array');
      const have = chainLen - headLen;
      if (offset > have) throw new DigitError('Luecke in den Stellen bei ' + have);
      const skip = have - offset;
      if (skip > 0) {
        const ov = Math.min(skip, u8.length);
        for (let k = 0; k < ov; k++) if (u8[k] !== buf[headLen + offset + k]) throw new DigitError('Stellen widersprechen den bekannten Stellen');
      }
      if (skip >= u8.length) return;
      const add = u8.length - skip;
      reserve(chainLen + add);
      buf.set(u8.subarray(skip), chainLen);
      chainLen += add;
      keepUnrolled();
      dirty = true;
    }

    // ─── Geometrie ───
    // Rechts: unendlich viele Stellen in der Zone d vor R. Links: nur die hineingeschobenen, ihre Zone endet bei
    // lzB = X0 + u; dieselbe Exponentialkurve, so verschoben, dass Zeichen 0 genau auf L liegt.
    function warp(p, dd) {
      if (dd <= 0) return p < L ? L : (p > R ? R : p);
      if (p > R - dd) return R - dd * Math.exp(-(p - (R - dd)) / dd);
      const lzB = X0 + leftU(dd);
      if (p < lzB) return lzB - dd + dd * Math.exp((p - lzB) / dd);
      return p;
    }
    // Anzahl zusätzlicher Zeichen jenseits der linearen Zone, bis die Deckung gesättigt ist.
    function stackCount(dd) {
      return Math.min(4000, Math.ceil((dd / w) * Math.log(Math.max(dd * dpr, 1))) + 160);
    }

    // Zonenbreite aus dem Abstand der Enden; offen folgt L der 3 (L = X0), eingerollt ist L ein echtes Ende.
    function autoD() {
      const f = Math.min(factor, 0.5);
      d = Math.min(f * Math.max(0, R - L - w), Math.max(0, (R - L) / 2));
    }
    function settle(mode) {
      if (mode === 'three') L = Math.max(MARGIN, Math.min(X0, R));
      else if (X0 > L) L = X0;
      autoD();
      const dd = deff();
      R = Math.min(R, X0 + Math.max(w, avail()) + dd, W - MARGIN);   // die Ganzzahl bleibt sichtbar; sonst X0 >= R - dd - avail()
      if (mode === 'three') {
        X0 = Math.min(X0, R - dd);
        L = Math.max(MARGIN, X0);
      } else {
        L = Math.max(MARGIN, Math.min(L, R - 2 * dd));
        if (X0 > L) X0 = L;
      }
      R = Math.max(R, L + 2 * dd);
      dirty = true;
    }

    function clampX0() { X0 = Math.max(X0, R - deff() - avail()); }

    function rolledLeft() { return X0 < L - 0.5; }

    // ─── Atlas: je Zeichen das Bild, die Silhouette und die Tinte je Spalte ───
    function rowMaxAlpha(data, width, height) {
      const out = new Uint8Array(height);
      for (let y = 0; y < height; y++) {
        let m = 0;
        for (let x = 0; x < width; x++) { const a = data[(y * width + x) * 4 + 3]; if (a > m) m = a; }
        out[y] = m;
      }
      return out;
    }
    function buildAtlas() {
      const wd = Math.max(1, Math.round(w * dpr));
      const hd = Math.ceil(S * 1.3 * dpr);
      const fam = '"Courier New", Courier, monospace';
      atlas = {};
      const probe = document.createElement('canvas').getContext('2d');
      probe.fillStyle = color; probe.fillRect(0, 0, 1, 1);
      const rgb = probe.getImageData(0, 0, 1, 1).data;
      const cums = [], exts = [];
      for (const ch of GLYPHS) {
        const c = document.createElement('canvas'); c.width = wd; c.height = hd;
        const g = c.getContext('2d');
        g.fillStyle = color;
        g.font = (S * dpr) + 'px ' + fam;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        if (mirror) g.setTransform(-1, 0, 0, 1, wd, 0);
        if (ch !== '.' || opts.dot !== false) g.fillText(ch, wd / 2, hd / 2);
        const data = g.getImageData(0, 0, wd, hd).data;
        // Silhouette: je Zeile die stärkste Tinte des Zeichens, eine Spalte breit (ruhiger Strich fuer fehlende Stellen).
        const rowMax = rowMaxAlpha(data, wd, hd);
        const bar = document.createElement('canvas'); bar.width = 1; bar.height = hd;
        const bg = bar.getContext('2d'), bd = bg.createImageData(1, hd);
        for (let y = 0; y < hd; y++) {
          bd.data[y * 4] = rgb[0]; bd.data[y * 4 + 1] = rgb[1]; bd.data[y * 4 + 2] = rgb[2]; bd.data[y * 4 + 3] = rowMax[y];
        }
        bg.putImageData(bd, 0, 0);
        // Tinte links von Quellspalte s, je Zeile: cum[s * hd + y] (s = 0..wd). cum[wd * hd + y] ist die ganze Tinte der Zeile
        // in Geraetepixeln; sie bleibt beim Stauchen erhalten.
        const cum = new Float32Array((wd + 1) * hd);
        for (let s = 0; s < wd; s++) {
          for (let y = 0; y < hd; y++) cum[(s + 1) * hd + y] = cum[s * hd + y] + data[(y * wd + s) * 4 + 3] / 255;
        }
        cums.push(cum);
        // Tintenausdehnung: erste und letzte Spalte mit Deckung (Seitenraender liegen davor und dahinter).
        let e0 = wd, e1 = 0;
        for (let s = 0; s < wd; s++) for (let y = 0; y < hd; y++) if (data[(y * wd + s) * 4 + 3]) { if (s < e0) e0 = s; if (s + 1 > e1) e1 = s + 1; break; }
        if (e1 <= e0) { e0 = 0; e1 = wd; }
        exts.push([e0, e1]);
        atlas[ch] = { img: c, bar, rowMax, cum, t: GLYPHS.indexOf(ch) };
      }
      // ANNAHME (nicht gezaehlt): eine noch fehlende Stelle und Unendlich tragen die mittlere Tinte der zehn Ziffern.
      const avg = new Float32Array((wd + 1) * hd);
      for (let k = 0; k < 10; k++) { const cu = cums[k]; for (let i = 0; i < avg.length; i++) avg[i] += cu[i] / 10; }
      cums.push(avg);
      atlas.cums = cums;
      exts.push([Math.min(...exts.slice(0, 10).map((e) => e[0])), Math.max(...exts.slice(0, 10).map((e) => e[1]))]);
      atlas.exts = exts;
      // Unterstrich der Stellenanzeige: ein Pixel in Textfarbe, gestreckt gezeichnet (kein fillRect).
      const ul = document.createElement('canvas'); ul.width = 1; ul.height = 1;
      const ug = ul.getContext('2d'), ud = ug.createImageData(1, 1);
      ud.data[0] = rgb[0]; ud.data[1] = rgb[1]; ud.data[2] = rgb[2]; ud.data[3] = 255;
      ug.putImageData(ud, 0, 0);
      atlas.ul = ul;
      atlasRgb = [rgb[0], rgb[1], rgb[2]];
      gw = wd; gh = hd;
      let top = -1, bot = -1;
      atlas['8'].rowMax.forEach((m, y) => { if (m > 40) { if (top < 0) top = y; bot = y; } });
      inkTop = top; inkBottom = bot;
      atlasKey = color + '|' + S + '|' + dpr + '|' + w;
    }

    // ─── Lage der Ziffern: Auto-Verdichtung gemischt mit der Gleichverteilung ───
    // M(i) = warp(X0 + i w): Ziffern in Lesebreite, verdichtet an den Enden (Faktor bis 0,5). Ueber 0,5 mischt lambda = 2f - 1
    // die Gleichverteilung U(i) aller vorhandenen Stellen zwischen L und R hinein: pos(i) = M(i) + lambda (U(i) - M(i)).
    // Beide steigen mit i, also auch die Mischung; bei f = 1 liegt jede Stelle gleich breit zwischen L und R.
    let pDd = 0, pLam = 0, pN = 1;
    function prep() { pDd = deff(); pLam = Math.max(0, 2 * factor - 1); pN = Math.max(1, total()); }
    function posOf(i) {
      const m = warp(X0 + i * w, pDd);
      if (!pLam) return m;
      const u = L + (R - L) * Math.min(Math.max(i, 0), pN) / pN;
      return m + pLam * (u - m);
    }
    // Stetige Umkehrung: Index (mit Anteil) an der Stelle x, gesucht in [i0, i1].
    function inv(x, i0, i1) {
      let lo = i0, hi = i1;
      while (hi - lo > 1) { const m = Math.floor((lo + hi) / 2); if (posOf(m) <= x) lo = m; else hi = m; }
      const a = posOf(lo), b = posOf(lo + 1);
      return b > a ? lo + Math.min(1, Math.max(0, (x - a) / (b - a))) : lo + 1;
    }
    // Ziffern mit Breite >= th: die Breiten steigen bis zur Mitte und fallen danach, also ein zusammenhaengender Bereich.
    function span(th) {
      const N = pN, wid = (i) => posOf(i + 1) - posOf(i);
      const ip = Math.min(N - 1, Math.max(0, Math.floor(((L + R) / 2 - X0) / w)));
      if (!(wid(ip) >= th)) return null;
      let lo = 0, hi = ip;
      while (lo < hi) { const m = Math.floor((lo + hi) / 2); if (wid(m) >= th) hi = m; else lo = m + 1; }
      const a = lo;
      lo = ip; hi = N - 1;
      while (lo < hi) { const m = Math.ceil((lo + hi) / 2); if (wid(m) >= th) lo = m; else hi = m - 1; }
      return [a, lo];
    }

    // ─── Gezaehlte Haeufigkeit je Zeichen (Stauchzone) ───
    // Kette: Praefix je Block von CB Zeichen (lazy, gilt bis setChain). Quelle: remote.count (gezaehlt aus den geladenen Gruppen).
    const TYPE = new Uint8Array(256).fill(255);
    for (let k = 0; k < 10; k++) TYPE[48 + k] = k;
    TYPE[46] = 10;
    const CB = 64;
    // cpre[b * NG + t]: Zahl der Zeichen t in buf[0, b * CB) (oben bei buf angelegt, setChain leert es)
    function chainPre(x, s, out) {
      const blk = Math.floor(x / CB);
      if (blk >= cpreN) {
        if (cpre.length < (blk + 1) * NG) { const nb = new Uint32Array(Math.max((blk + 1) * NG, cpre.length * 2)); nb.set(cpre.subarray(0, cpreN * NG)); cpre = nb; }
        if (cpreN === 0) { cpre.fill(0, 0, NG); cpreN = 1; }
        for (; cpreN <= blk; cpreN++) {
          const o = cpreN * NG, p = o - NG;
          for (let t = 0; t < NG; t++) cpre[o + t] = cpre[p + t];
          for (let i = (cpreN - 1) * CB; i < cpreN * CB; i++) { const t = TYPE[buf[i]]; if (t < NG) cpre[o + t]++; }
        }
      }
      const o = blk * NG;
      for (let t = 0; t < NG; t++) out[t] += s * cpre[o + t];
      for (let i = blk * CB; i < x; i++) { const t = TYPE[buf[i]]; if (t < NG) out[t] += s; }
    }
    const cntC = new Float64Array(NG), cntF = new Float64Array(10);
    let cntMiss = 0;
    function addOne(k, q) {
      if (!(q > 0) || k < 0 || k >= pN) return;
      if (k < chainLen) { const t = TYPE[buf[k]]; if (t < NG) cntC[t] += q; return; }
      const c = remote ? remote.at(k) : 0;
      if (c) cntF[c - 48] += q; else cntMiss += q;
    }
    // Kettenindizes [a, b), reell: die Randziffern zaehlen anteilig, alles dazwischen ganz.
    function addRange(a, b) {
      const ka = Math.ceil(a), kb = Math.floor(b);
      if (kb < ka) { addOne(Math.floor(a), b - a); return; }
      addOne(ka - 1, ka - a);
      if (kb > ka) {
        const c1 = Math.min(kb, chainLen);
        if (c1 > ka) { chainPre(c1, 1, cntC); chainPre(ka, -1, cntC); }
        const r0 = Math.max(ka, chainLen);
        if (kb > r0) { const got = remote ? remote.count(r0, kb, cntF) : 0; cntMiss += kb - r0 - got; }
      }
      addOne(kb, b - kb);
    }
    // Stellen [i0, i1) spaltenweise: je Geraetepixel die gezaehlten Ziffern, ihre Tinte legt flush darauf (Summe der Profile).
    let colLog = null, depLog = null, drawLog = null;
    function region(i0, i1, zone) {
      if (!(i1 > i0)) return;
      const x0 = posOf(i0) * dpr, x1 = posOf(i1) * dpr;
      let c0 = Math.floor(x0), c1 = Math.ceil(x1) - 1;
      if (c1 < c0) { if (zone === zoneR) c0 = c1; else c1 = c0; }
      let a = i0;
      for (let c = c0; c <= c1; c++) {
        const b = c === c1 ? i1 : Math.max(a, inv((c + 1) / dpr, Math.floor(a), i1));
        if (c >= 0 && c < accCols) {
          cntC.fill(0); cntF.fill(0); cntMiss = 0;
          addRange(a, b);
          const o = c * NGA;
          for (let t = 0; t < 10; t++) acc[o + t] += cntC[t] + FILE_ALPHA * cntF[t];
          acc[o + 10] += cntC[10];
          acc[o + AVG] += FILE_ALPHA * cntMiss;   // ANNAHME: noch nicht geladene Stellen zaehlen mit der mittleren Tinte
          mark(zone, c);
          if (colLog) colLog.set(c, { c, a, b, zone: zone === zoneL ? 'L' : 'R', cntC: Array.from(cntC), cntF: Array.from(cntF), miss: cntMiss, inf: 0 });
        }
        a = b;
      }
    }
    // Unendlich: hinter der letzten vorhandenen Stelle geht die Zahl weiter. ANNAHME (nicht gezaehlt): mittlere Tinte, so viel,
    // dass die Spalte an der letzten Stelle satt ist; sie markiert das Ende der Daten als Haarlinie.
    const INF_INK = 1e4;
    function infinity() {
      const c = Math.ceil(posOf(pN) * dpr) - 1;
      if (c < 0 || c >= accCols) return;
      acc[c * NGA + AVG] += INF_INK;
      mark(zoneR, c);
      if (colLog) { const r = colLog.get(c) || { c, a: pN, b: pN, zone: 'R', cntC: new Array(NG).fill(0), cntF: new Array(10).fill(0), miss: 0, inf: 0 }; r.inf = INF_INK; colLog.set(c, r); }
    }

    // ─── Stellenanzeige: Ziffer oder Zone unter dem Zeiger ───
    let hoverX = null, info = null, infoKey = 'null';
    function pointerInfo() {
      if (hoverX === null) return null;
      const x = hoverX, N = pN;
      // Zusammengeschoben ist der Strich kaum breiter als eine Linie: dann gilt die Greifweite HIT, sonst trifft man ihn nicht.
      const tol = R - L < 2 * HIT ? HIT : 6;
      if (x < L - tol || x > R + tol) return null;
      const rs = span(0.5 * w);
      if (!rs) return { kind: 'all' };
      const ra = rs[0], rb = rs[1];
      if (ra > 0 && x < posOf(ra) + 2) return { kind: 'left', hi: ra - 1 };
      if (rb < N - 1 && x >= posOf(rb + 1) - 2) return { kind: 'right', lo: rb + 1 };
      const k = Math.min(rb, Math.max(ra, Math.floor(inv(x, ra, rb + 1))));
      return { kind: 'digit', index: k, x0: posOf(k), x1: posOf(k + 1) };
    }
    function underline(y0) {
      if (!info || info.kind !== 'digit') return;
      const xa = info.x0 * dpr, wd = (info.x1 - info.x0) * dpr;
      ctx.globalAlpha = 0.5;
      ctx.drawImage(atlas.ul, xa + wd * 0.15, y0 + inkBottom + Math.round(4 * dpr), wd * 0.7, Math.max(1, Math.round(dpr)));
      if (drawLog) drawLog.push([xa + wd * 0.15, wd * 0.7]);
      ctx.globalAlpha = 1;
    }

    // ─── Rendern (lesbare Ziffern einzeln, die Stauchzonen spaltenweise aus gezaehlten Ziffern) ───
    let ja = 0, jb = -1, renderMs = 0;
    function render() {
      const tStart = performance.now();
      dirty = false;
      if (!atlas || atlasKey !== color + '|' + S + '|' + dpr + '|' + w) buildAtlas();
      // save/restore je Bild: ohne zeichnete WebKit gelegentlich ein Bild ungespiegelt und liess es stehen (dir 'l')
      ctx.save();
      ctx.setTransform(mirror ? -1 : 1, 0, 0, 1, mirror ? canvas.width : 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = true;
      prep();
      const dd = pDd, N = total();
      const iLinLo = Math.ceil(leftU(dd) / w - 1e-9);
      const iLinHi = Math.floor((R - dd - X0) / w + 1e-9) - 1;
      const K = stackCount(dd);
      const iLo = Math.max(0, iLinLo - 1 - K);
      const iHi = Math.min(N - 1, iLinHi + 1 + K);
      // Die Ansicht meldet nur die echte Front; den Vorrat darüber legt der Besitzer fest.
      if (opts.onNeedDigits) opts.onNeedDigits(iLinHi + 2 + K + 100);
      if (opts.onFront) opts.onFront(iLinHi >= N - 3);
      // Einzeln gezeichnet wird, was mindestens ein Geraetepixel breit ist (ja..jb); alles andere zaehlt region().
      const sp = span(1 / dpr);
      if (sp) { ja = sp[0]; jb = sp[1]; } else { ja = 0; jb = -1; }
      const sLo = sp ? Math.min(iLo, ja) : iLo, sHi = sp ? Math.max(iHi, jb) : iHi;
      if (remote) remote.want(sLo, sHi, step);
      const wd = gw, hd = gh;
      const y0 = Math.round(H * dpr / 2 - hd / 2);
      const mid = (L + R) / 2;
      if (accCols !== canvas.width || ink.length !== canvas.width * hd) {
        accCols = canvas.width; acc = new Float32Array(accCols * NGA); ink = new Float32Array(accCols * hd);
      }
      let n = 0;
      const sN = Math.max(0, sHi - sLo + 1);
      if (shownCodes.length < sN) { shownCodes = new Uint8Array(Math.max(sN, shownCodes.length * 2)); shownMark = new Uint8Array(shownCodes.length); }
      shownMark.fill(0, 0, sN);
      shownLo = sLo; shownN = sN;
      // Schleier in Fahrtrichtung: Abbilder hinter der Bewegung (Kette laeuft nach links bei step > 0, die Abbilder liegen rechts davon).
      // Nur lesbare Ziffern bekommen Abbilder, beschnitten auf die lineare Zone: versetzt abgelegte Stauchtinte wuerde wieder
      // satt und ergaebe je Abbild einen eigenen Strich (frueher vier Striche, teils jenseits der Enden).
      const passes = blur > 0 ? 4 : 1;
      const gLo = posOf(Math.max(iLinLo, ja)) * dpr, gHi = posOf(Math.min(iLinHi, jb) + 1) * dpr;
      for (let pass = passes - 1; pass >= 0; pass--) {
        const off = pass === 0 ? 0 : Math.sign(step) * blur * pass / (passes - 1);
        const mul = pass === 0 ? 1 : 0.22 / pass;
        n = 0;
        for (let i = sLo; i <= sHi; i++) {
          const fromRemote = i >= chainLen;
          const code = fromRemote ? (remote ? remote.at(i) : 0) : buf[i];
          if (i < ja || i > jb) {
            // gestaucht unter einem Geraetepixel: nur festhalten, die Tinte kommt aus der Zaehlung (region)
            if (pass !== 0) continue;
            shownCodes[i - sLo] = code;
            if (code) { shownMark[i - sLo] = Math.round((fromRemote ? FILE_ALPHA : 1) * 100); n++; }
            else if (fromRemote && remote) shownMark[i - sLo] = Math.round(PENDING_ALPHA * 100);
            continue;
          }
          const xa = posOf(i), xb = posOf(i + 1);
          const nat = xb - xa;
          if (pass === 0) shownCodes[i - sLo] = code;
          let wDev = nat * dpr, xDev = (xa + off) * dpr;
          if (!code) {
            if (fromRemote && remote) {
              if (pass === 0) shownMark[i - sLo] = Math.round(PENDING_ALPHA * 100);
              // Die Stelle kommt sicher: lesbar ein ruhiger Strich, gestaucht geht er stetig in die mittlere Tinte einer
              // Ziffer ueber (ab halber Breite ganz), damit die Stauchzone beim Nachladen nicht ausduennt.
              const fade = Math.max(0, Math.min(1, (nat / w - 0.5) / 0.5));
              if (fade > 0) {
                ctx.globalAlpha = PENDING_ALPHA * mul * fade;
                if (pass === 0) { ctx.drawImage(atlas['0'].bar, xDev + wDev * 0.4, y0, Math.max(1, wDev * 0.2), hd); if (drawLog) drawLog.push([xDev + wDev * 0.4, Math.max(1, wDev * 0.2)]); }
                else drawCropped(atlas['0'].bar, xDev + wDev * 0.4, Math.max(1, wDev * 0.2), y0, hd, gLo, gHi);
                ctx.globalAlpha = 1;
              }
              if (fade < 1 && pass === 0) { if (depLog) depLog.push({ i, code: 0, x: xDev, w: wDev, al: FILE_ALPHA * mul * (1 - fade) }); deposit(xa < mid ? zoneL : zoneR, AVG, xDev, wDev, FILE_ALPHA * mul * (1 - fade)); }
            }
            continue;
          }
          const g = atlas[String.fromCharCode(code)];
          if (!g) continue;
          if (wDev > wd * 0.999) { wDev = wd; xDev = Math.round(xDev); }
          const al = (fromRemote ? FILE_ALPHA : 1) * mul;
          if (pass === 0) shownMark[i - sLo] = Math.round(al * 100);
          n++;
          // Gestaucht: die ganze Tinte der Ziffer in ihre Spalten (Tinte bleibt erhalten, kein Mindestmass).
          if (wDev < wd * 0.999) {
            if (pass === 0) { if (depLog) depLog.push({ i, code, x: xDev, w: wDev, al }); deposit(xa < mid ? zoneL : zoneR, g.t, xDev, wDev, al); }
            continue;
          }
          ctx.globalAlpha = al;
          if (pass === 0) { ctx.drawImage(g.img, xDev, y0, wDev, hd); if (drawLog) drawLog.push([xDev, wDev]); }
          else drawCropped(g.img, xDev, wDev, y0, hd, gLo, gHi);
        }
      }
      ctx.globalAlpha = 1;
      if (sp) { region(0, ja, zoneL); region(jb + 1, N, zoneR); }
      else region(0, N, zoneR);
      infinity();
      flush(zoneL, y0, hd);
      flush(zoneR, y0, hd);
      const ni = pointerInfo(), nk = ni ? ni.kind + '|' + (ni.index ?? '') + '|' + (ni.hi ?? '') + '|' + (ni.lo ?? '') : 'null';
      info = ni;
      underline(y0);
      ctx.restore();
      if (nk !== infoKey) { infoKey = nk; if (opts.onPointerInfo) opts.onPointerInfo(ni); }
      drawnCount = n;
      renderMs = performance.now() - tStart;
    }

    // Bild (Breite wDev ab xDev) nur im Bereich [lo, hi) zeichnen: Quellausschnitt statt Clip-Pfad.
    function drawCropped(img, xDev, wDev, y0, hd, lo, hi) {
      const a = Math.max(xDev, lo), b = Math.min(xDev + wDev, hi);
      if (!(b > a) || !(wDev > 0)) return;
      if (drawLog) drawLog.push([a, b - a]);
      const k = img.width / wDev;
      ctx.drawImage(img, (a - xDev) * k, 0, (b - a) * k, img.height, a, y0, b - a, hd);
    }
    function mark(zone, c) { if (c < zone.lo) zone.lo = c; if (c > zone.hi) zone.hi = c; }
    // Ziffer t (Breite wDev >= 1 Geraetepixel ab xDev, Deckkraft al) gibt ihre ganze Tinte an die ueberdeckten Spalten ab:
    // auf Spalte c fallen die Quellspalten [u0, u1) aus dem Fenster [s0, s1), ihre Summe mal al. Das Fenster ist bei voller
    // Breite die ganze Glyphe und schrumpft bis 0,85 Breite auf die Tinte: gestauchte Ziffern geben ihre Seitenraender ab,
    // sonst bliebe vor jedem Ende eine leere Spalte. Schmalere Ziffern zaehlt region().
    function deposit(zone, t, xDev, wDev, al) {
      const end = xDev + wDev;
      const cum = atlas.cums[t], hd = gh, ex = atlas.exts[t];
      const k = Math.max(0, Math.min(1, (wDev / gw - 0.85) / 0.15));
      const s0 = ex[0] * (1 - k), s1 = gw - (gw - ex[1]) * (1 - k), sc = (s1 - s0) / wDev;
      if (depLog) { const e = depLog[depLog.length - 1]; if (e && e.x === xDev && e.w === wDev) { e.s0 = s0; e.s1 = s1; } }
      for (let c = Math.floor(xDev); c < end; c++) {
        if (c < 0 || c >= accCols) continue;
        const part = Math.min(c + 1, end) - Math.max(c, xDev);
        if (part <= 0) continue;
        const u0 = s0 + (Math.max(c, xDev) - xDev) * sc, u1 = Math.min(s1, u0 + part * sc);
        const i0 = Math.min(gw - 1, Math.floor(u0)), f0 = u0 - i0, i1 = Math.min(gw - 1, Math.floor(u1)), f1 = u1 - i1;
        const a0 = i0 * hd, a1 = i1 * hd, o = c * hd;
        for (let y = 0; y < hd; y++) {
          const p0 = cum[a0 + y] + f0 * (cum[a0 + hd + y] - cum[a0 + y]);
          const p1 = cum[a1 + y] + f1 * (cum[a1 + hd + y] - cum[a1 + y]);
          ink[o + y] += (p1 - p0) * al;
        }
        mark(zone, c);
      }
    }
    // Je Spalte und Zeile: Tinte der breiteren Ziffern plus Zeilentinte (cum der vollen Breite) mal gezaehlter Haeufigkeit,
    // als Deckkraft min(1, Summe). Nichts wird gemittelt: mehr Ziffern je Spalte, mehr Tinte.
    function flush(zone, y0, hd) {
      if (zone.hi < zone.lo) { zone.lo = Infinity; zone.hi = -1; return; }
      const lo = zone.lo, cw = zone.hi - lo + 1;
      if (!flushCanvas) { flushCanvas = document.createElement('canvas'); flushCtx = flushCanvas.getContext('2d'); }
      if (flushCanvas.width < cw || flushCanvas.height !== hd) { flushCanvas.width = Math.max(cw, flushCanvas.width); flushCanvas.height = hd; }
      const img = flushCtx.createImageData(cw, hd), px = img.data;
      const [r, gc, b] = atlasRgb;
      const off = gw * hd, cums = atlas.cums;
      for (let x = 0; x < cw; x++) {
        const c = lo + x, base = c * NGA, o = c * hd;
        const rec = colLog ? colLog.get(c) : null;
        if (rec) { let s = 0; for (let y = 0; y < hd; y++) s += ink[o + y]; rec.pure = s === 0; }
        for (let t = 0; t < NGA; t++) {
          const a = acc[base + t];
          if (!a) continue;
          const cu = cums[t];
          for (let y = 0; y < hd; y++) ink[o + y] += a * cu[off + y];
        }
        if (rec) { let s = 0, m = 0; for (let y = 0; y < hd; y++) { s += ink[o + y]; if (ink[o + y] > m) m = ink[o + y]; } rec.raw = s; rec.max = m; rec.y0 = y0; rec.rows = Array.from(ink.subarray(o, o + hd)); }
        for (let y = 0; y < hd; y++) { const q = (y * cw + x) * 4; px[q] = r; px[q + 1] = gc; px[q + 2] = b; px[q + 3] = ink[o + y] * 255; }   // Uint8Clamped kappt bei 255
        acc.fill(0, base, base + NGA);
        ink.fill(0, o, o + hd);
      }
      flushCtx.putImageData(img, 0, 0);
      ctx.drawImage(flushCanvas, 0, 0, cw, hd, lo, y0, cw, hd);
      zone.lo = Infinity; zone.hi = -1;
    }

    // ─── Layout ───
    function measure() {
      const r = opts.localX ? { width: canvas.clientWidth, height: canvas.clientHeight } : canvas.getBoundingClientRect();
      const ndpr = window.devicePixelRatio || 1;
      const nS = opts.fontPx ? fontOf() : Math.min(56, Math.max(28, Math.round(window.innerWidth * 0.06)));
      ctx.font = (nS * ndpr) + 'px "Courier New", Courier, monospace';
      const nw = Math.max(1, Math.round(ctx.measureText('0').width)) / ndpr;
      return { cw: r.width, ch: r.height, ndpr, nS, nw };
    }
    function applySize(first) {
      const m = measure();
      const oldIdx = startIdx();
      W = m.cw; H = m.ch; dpr = m.ndpr; S = m.nS; w = m.nw;
      const cwDev = Math.max(1, Math.round(W * dpr)), chDev = Math.max(1, Math.round(H * dpr));
      if (canvas.width !== cwDev) canvas.width = cwDev;
      if (canvas.height !== chDev) canvas.height = chDev;
      if (first) {
        X0 = opts.origin !== undefined ? +opts.origin : Math.round((W - w) / 2); L = X0; R = X0 + w;
        if (!Number.isFinite(X0)) throw new TypeError('UnfoldingView: origin muss eine Zahl sein, war ' + opts.origin);
        if (opts.unrolled) R = W - MARGIN;
      } else {
        X0 = L - hOf(oldIdx * w, deff());
        L = Math.min(L, W - MARGIN); R = Math.min(R, W - MARGIN);
      }
      settle(rolledLeft() ? 'x' : 'three');
      keepUnrolled();
      if (drag) drag.rebase = true;   // der nächste pointermove setzt die Zugwerte neu, sonst springt er
    }

    // ─── Interaktion ───
    const rect = () => canvas.getBoundingClientRect();
    function local(e) {
      let x = opts.localX ? +opts.localX(e) : e.clientX - rect().left;
      if (mirror) x = W - x;
      return x;
    }
    // Der nächste Griff gewinnt: die 3 (nur solange links nichts eingerollt ist), R, L (nur wenn eingerollt).
    function hitTest(x) {
      if (opts.fixedStart) return Math.abs(x - R) <= HIT ? 'R' : null;
      const rolled = rolledLeft();
      const cands = [];
      const t0 = posOf(0), t1 = Math.max(posOf(1), t0);
      if (!rolled && x >= t0 - HIT && x <= t1) cands.push(['three', Math.abs(x - (t0 + t1) / 2)]);
      if (Math.abs(x - R) <= HIT) cands.push(['R', Math.abs(x - R)]);
      if (rolled && Math.abs(x - L) <= HIT) cands.push(['L', Math.abs(x - L)]);
      // Zusammengeschoben liegen L und R aufeinander: die Seite des Zeigers entscheidet, sonst liesse sich L nie mehr greifen.
      const nearR = Math.abs(x - R) <= HIT, nearL = Math.abs(x - L) <= HIT;
      if (rolled && nearR && nearL) return x < (L + R) / 2 ? 'L' : 'R';
      if (cands.length) return cands.reduce((a, c) => (c[1] < a[1] ? c : a))[0];
      return x > L && x < R ? 'swipe' : null;
    }
    // Tap: Touch/Stift, hoechstens TAP_SLOP px Weg und TAP_MS lang. Erst jenseits von TAP_SLOP beginnt das Ziehen.
    const TAP_SLOP = 8, TAP_MS = 500;
    let tap = null;
    function setHover(x) {
      const v = x === null || x === undefined ? null : +x;
      if (v !== null && !Number.isFinite(v)) throw new TypeError('setHover: x muss eine Zahl oder null sein, war ' + x);
      if (v !== hoverX) { hoverX = v; dirty = true; }
    }
    function onDown(e) {
      const x = local(e);
      if (e.pointerType !== 'mouse') tap = { id: e.pointerId, x, y: e.clientY, t: performance.now() };
      if (drag || locked) return;
      const mode = hitTest(x);
      if (!mode) return;
      drag = { id: e.pointerId, mode, x0: x, X0, L, R, slop: e.pointerType !== 'mouse' };
      unroll = false;
      setHover(x);   // Greifen zeigt die Stelle unter dem Finger, auch auf dem Handy
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
    function onMove(e) {
      const x = local(e);
      if (tap && tap.id === e.pointerId && Math.hypot(x - tap.x, e.clientY - tap.y) > TAP_SLOP) tap = null;
      if (e.pointerType === 'mouse' || (drag && drag.id === e.pointerId)) setHover(x);
      if (!drag || drag.id !== e.pointerId) {
        const h = hitTest(x);
        canvas.style.cursor = h === 'swipe' ? 'grab' : (h ? 'ew-resize' : 'default');
        return;
      }
      if (drag.slop) { if (Math.abs(x - drag.x0) <= TAP_SLOP) return; drag.slop = false; }
      if (drag.rebase) { drag.rebase = false; drag.X0 = X0; drag.L = L; drag.R = R; drag.x0 = x; }
      const dx = x - drag.x0, dd = deff();
      let mode = 'x';
      if (drag.mode === 'R') {
        if (!rolledLeft()) mode = 'three';   // offen: die 3 bleibt, L folgt ihr mit der wachsenden Zone
        R = Math.max(L, Math.min(W - MARGIN, drag.R + dx));   // bis ganz auf L: d schrumpft mit dem Abstand
        // Am Datenende (Sausen holt es schnell ein) deckelt settle R auf X0 + avail() + dd: die Kette rueckt nach, R folgt dem Zeiger.
        const end = X0 + avail() + dd;
        if (R > end) X0 = R - dd - avail();
      } else if (drag.mode === 'three') {
        X0 = drag.X0 + dx;
        mode = 'three';
      } else if (drag.mode === 'L') {
        const Lt = Math.max(MARGIN, Math.min(R, drag.L + dx));
        // Erreicht L die 3, zieht L die 3 mit (offen: X0 = L).
        if (Lt <= X0) { L = Lt; X0 = Lt; mode = 'three'; }
        else L = Lt;
      } else {
        X0 = drag.X0 + dx;
        clampX0();
      }
      settle(mode);
      e.preventDefault();
    }
    function onUp(e) {
      if (tap && tap.id === e.pointerId) {
        const ok = performance.now() - tap.t < TAP_MS;
        const x = tap.x;
        tap = null;
        if (ok) setHover(x);
      }
      endDrag(e);
    }
    function onLeave(e) { if (e.pointerType === 'mouse') setHover(null); }
    function onCancel(e) { tap = null; endDrag(e); }
    function endDrag(e) {
      if (!drag || drag.id !== e.pointerId) return;
      drag = null;
      // Der Zeiger kann schon losgelassen sein (lostpointercapture, pointercancel): dann wirft release nur diese eine Klasse.
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    }
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onCancel);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('lostpointercapture', endDrag);
    // Mausrad und Trackpad: runter (oder rechts) schiebt die Kette weiter, wie beim Lesen nach unten; hoch schiebt zurueck bis
    // die 3 wieder vorn steht. Die Seite scrollt dabei nicht (passive: false, preventDefault).
    function onWheel(e) {
      e.preventDefault();
      if (locked || opts.fixedStart) return;
      unroll = false;
      const unit = e.deltaMode === 1 ? 16 : (e.deltaMode === 2 ? W : 1);
      const delta = (e.deltaY + e.deltaX) * unit;
      if (!delta) return;
      const prev = X0;
      X0 -= delta;
      if (delta < 0) X0 = Math.min(X0, Math.max(prev, L));
      clampX0();
      settle('x');
    }
    canvas.addEventListener('wheel', onWheel, { passive: false });

    // ─── Drift: Mitte = Stillstand, exponentielle Kennlinie, nach oben offen ───
    function frame(now) {
      if (destroyed) return;
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      const sv = opts.drift ? (parseFloat(opts.drift()) || 0) : 0;
      const rate = locked ? 0 : (opts.rate ? (+opts.rate() || 0) : (Math.abs(sv) < DEAD_ZONE ? 0 : rateOf(-sv)));
      curRate = rate;
      const before = startIdx();
      let dtEff = dt;
      if (remote) {
        if (dt > 0) {
          dts.push(dt * 1000); if (dts.length > 30) dts.shift();
          const sorted = dts.slice().sort((a, b) => a - b);
          // Der Takt aendert sich nur bei echter Abweichung (Hysterese): ein Wackeln um eine Millisekunde (16/17 ms)
          // verschoebe sonst den Versatz je Bild und damit die vorausgeholte Bahn.
          const est = Math.min(1 / 20, Math.max(1 / 240, sorted[sorted.length >> 1] / 1000));
          if (Math.abs(est - period) > 0.12 * period) period = est;
        }
        // Sausen: rueckt die Kette je Bild weiter als das Fenster breit ist, liegen die Fenster auseinander. Dann haengt der
        // Versatz am Bildtakt (ganze Takte), nicht an der Bilddauer: die Fenster liegen auf einem festen Raster und lassen sich
        // vorausholen, auch wenn ein Bild ausfaellt.
        const visW = Math.max(1, (R - deff() - X0 - leftU(deff())) / w);
        const adv = Math.abs(rate) * dt;
        const wasBlur = blur;
        sausen = rate !== 0 && dt > 0 && adv > visW;
        if (sausen) {
          dtEff = Math.max(1, Math.round(dt / period)) * period;
          step = rate * period;
          blur = Math.min(1, Math.log2(adv / visW) / 3) * 0.8 * w;
        } else {
          step = rate * dt;
          blur = 0;
        }
        if (blur !== wasBlur) dirty = true;
      }
      if (rate !== 0 && dt > 0) {
        const prev = X0;
        X0 -= rate * w * dtEff;   // links (rate > 0): Kette läuft nach links
        if (rate < 0) X0 = Math.min(X0, Math.max(prev, L));   // rückwärts: stoppt, wenn die 3 vorn ist
        clampX0();
        settle(drag && drag.mode === 'three' ? 'three' : 'x');
      }
      if (dirty) render();
      const after = startIdx();
      velocity = dt > 0 ? (after - before) / dt : 0;
      rafId = requestAnimationFrame(frame);
    }

    function setRemote(r) {
      remote = r || null;
      step = 0; blur = 0; sausen = false;
      dirty = true;
    }

    // ─── Verdichtungsfaktor ───
    // Nur die Stauchzone aendert sich: R, X0 und (eingerollt) L bleiben stehen. Offen folgt L der 3.
    function setFactor(f) {
      factor = clampFactor(f);
      settle(rolledLeft() ? 'x' : 'three');
    }
    function resize() { applySize(false); }
    function rewind() {
      X0 = L;
      settle('three');
    }

    // ─── Boot ───
    const onResize = () => applySize(false);
    applySize(true);
    window.addEventListener('resize', onResize);
    refreshColor();
    const themeObs = new MutationObserver(refreshColor);
    for (const el of [document.documentElement, document.body]) themeObs.observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
    const scheme = window.matchMedia('(prefers-color-scheme: dark)');
    scheme.addEventListener('change', refreshColor);
    rafId = requestAnimationFrame(frame);

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      themeObs.disconnect();
      scheme.removeEventListener('change', refreshColor);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('lostpointercapture', endDrag);
      canvas.removeEventListener('wheel', onWheel, { passive: false });
      canvas.style.cursor = '';
      drag = null;
    }

    function renderLog() {
      colLog = new Map(); depLog = []; drawLog = [];
      try {
        render();
        return { cols: Array.from(colLog.values()).sort((p, q) => p.c - q.c), deps: depLog, draws: drawLog };
      } finally { colLog = null; depLog = null; drawLog = null; }
    }

    return {
      setDigits, appendDigits, rewind, resize, setFactor, destroy, refreshColor, setRemote,
      setLocked(b) { locked = !!b; },
      setHover,
      // Testhaken: ein Bild rendern und je Stauchspalte festhalten, was dort gezaehlt wurde (Kettenbereich a..b, Zahl je Zeichen
      // aus Kette und Quelle, fehlende Stellen, Unendlich) und welche Tinte die Spalte vor der Kappung traegt (raw: Summe ueber
      // die Zeilen, max: staerkste Zeile; pure: nur gezaehlte Tinte, keine breitere Ziffer).
      columns() { return renderLog().cols; },
      // Testhaken: wie columns(), dazu jede abgelegte Ziffer der Stauchzone (Kettenindex i, Zeichencode, Lage x/w in
      // Geraetepixeln, Deckkraft al; code 0 = fehlende Stelle) und jedes einzeln gezeichnete Bild ([x, w]).
      renderLog,
      // Deckung jedes Zeichenbilds im Atlas (GLYPHS-Reihenfolge), je Bild gw x gh Alphawerte zeilenweise, aus den Bildern selbst
      glyphAlpha() {
        if (!atlas) return null;
        return Array.from(GLYPHS, (ch) => {
          const d = atlas[ch].img.getContext('2d').getImageData(0, 0, gw, gh).data, a = new Array(gw * gh);
          for (let k = 0; k < a.length; k++) a[k] = d[k * 4 + 3];
          return a;
        });
      },
      // Zeilentinte je Zeichen t (GLYPHS, dann t = 11 mittlere Tinte): Summe der Deckung jeder Zeile in Geraetepixeln
      glyphInk() {
        if (!atlas) return null;
        return { glyphs: GLYPHS, rows: atlas.cums.map((cu) => Array.from(cu.subarray(gw * gh, gw * gh + gh))), gw, gh, dpr };
      },
      invalidate() { dirty = true; },
      digits() { return decoder.decode(buf.subarray(0, chainLen)); },
      // Was das letzte Bild an Ziffern zeigte: ab Kettenindex lo, ASCII ('0' = nicht geladen), fromRemote = erster Index aus der Quelle
      shown() { return { lo: shownLo, codes: decoder.decode(shownCodes.subarray(0, shownN).map((c) => c || 63)), fromRemote: chainLen, marks: Array.from(shownMark.subarray(0, shownN)) }; },
      state() {
        const dd = deff();
        const startIndex = Math.max(0, startIdx());
        const endIndex = Math.max(0, (R - dd - X0) / w);
        return {
          L, R, X0, d, dEff: dd, factor, w, W, H, dpr, uLeft: leftU(dd),
          startIndex, endIndex,
          visibleCount: Math.max(0, Math.floor(endIndex) - Math.ceil(startIndex - 1e-9)),
          velocity, drawnCount,
          chainLength: chainLen, totalLength: total(), step, blur, sausen,
          inkTop: atlas ? inkTop / dpr + (H / 2 - gh / dpr / 2) : null,   // null bis zum ersten Bild
          inkBottom: atlas ? inkBottom / dpr + (H / 2 - gh / dpr / 2) : null,
          rate: curRate,
          lambda: Math.max(0, 2 * factor - 1), ja, jb, renderMs,
          hover: info ? Object.assign({}, info) : null,
          hoverX,
          color
        };
      }
    };
  }

  window.UnfoldingView = { create, DigitError, DEFAULT_FACTOR, MARGIN };
})();
