/*
 * UnfoldingView: rollt eine Ziffernkette auf einem Canvas ab (links eingerollt, rechts verdichtet), mit Ziehen/Wischen.
 * Klassisches Script, kein Build, same-origin. Setzt das Global `UnfoldingView`.
 *
 *   const view = UnfoldingView.create(canvas, {
 *     drift()           // optional: Reglerwert -1..1 (0 = Stillstand), je Bild gelesen
 *     onNeedDigits(n)   // optional: die Ansicht braucht Nachkommastellen bis n (Vorrat); der Besitzer rechnet/laedt nach
 *     onFront(atFront)  // optional: je Bild, true = sichtbares Fenster reicht an die letzte bekannte Stelle
 *     onD(d)            // optional: die Ansicht hat die Verdichtung selbst geaendert (Fensterwechsel)
 *     intPart, decimals // optional: Anfangskette (Ganzzahl, Nachkommastellen), schon beim ersten Layout da (sonst '0.')
 *     colorElement      // optional: Element, dessen CSS-Farbe die Schrift bestimmt (Standard: canvas)
 *   });
 *   view.setDigits(intPart, decimals)   // Kette neu: Ganzzahl, ".", bekannte Nachkommastellen (ASCII-String)
 *   view.appendDigits(u8, offset)       // wie Irrational.onDigits: ASCII-Bytes '0'..'9', offset = Nachkommastelle des ersten Bytes
 *   view.rewind()                       // zurueck zum Anfang (die Ganzzahl vorn)
 *   view.setD(v)  view.setLocked(b)  view.invalidate()  view.refreshColor()
 *   view.setRemote(r)                   // optional: Ziffernquelle jenseits der Kette (z. B. tools/pi-file.js): r.length (Kettenlaenge
 *                                       // gesamt), r.at(i) (ASCII-Code oder 0 = noch nicht da), r.want(lo, hi, step) (Fenster, Versatz je Bild).
 *                                       // Ziffern aus r (Index >= Kettenlaenge) sind dezent gedaempft, noch fehlende ein ruhiger Strich.
 *   view.state()  view.digits()  view.shown()   // nur lesend (Tests)
 *   view.destroy()                      // Listener, Beobachter und Bildschleife weg
 *
 * Fehler werfen: appendDigits wirft UnfoldingView.DigitError bei Luecke/Widerspruch (Meldung ist fertig lesbar), sonst die
 * urspruengliche Ausnahme (z. B. RangeError an der Stringgrenze). Kein stilles Verschlucken; der Besitzer entscheidet.
 * Gerendert wird nur das sichtbare Fenster (iLo..iHi); Atlas je Zeichen/Farbe/Groesse einmal.
 */
(() => {
  'use strict';

  const MARGIN = 8;          // Mindestabstand der Enden zum Bildrand (px)
  const HIT = 20;            // halbe Trefferbreite (>= 40px breit)
  const GLYPHS = '0123456789.';
  const DEAD_ZONE = 0.02;    // |Regler| darunter gilt als Mitte: kein Kriechen
  const FILE_ALPHA = 0.7;    // Ziffern aus der Quelle jenseits der Kette: leicht gedaempft
  const PENDING_ALPHA = 0.1; // noch nicht geladene Stelle: leiser Strich statt einer Ziffer
  const rateOf = (s) => Math.sign(s) * (Math.pow(10, 10 * Math.abs(s)) - 1);

  class DigitError extends Error {}

  function create(canvas, opts) {
    opts = opts || {};
    if (!canvas || typeof canvas.getContext !== 'function') throw new TypeError('UnfoldingView.create: canvas fehlt');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('UnfoldingView.create: kein 2D-Kontext');
    const colorEl = opts.colorElement || canvas;
    const decoder = new TextDecoder('latin1');

    // Die Kette liegt als Bytes (ASCII): Ganzzahl, ".", Nachkommastellen. Index 0 = Ganzzahl. Kein String: keine Stringgrenze,
    // ein Byte je Stelle; chainLen zaehlt die belegten Bytes, buf waechst durch Verdoppeln.
    let buf = new Uint8Array(64), chainLen = 0;
    function setChain(intPart, decimals) {
      const head = String(intPart) + '.' + (decimals || '');
      if (buf.length < head.length) buf = new Uint8Array(Math.max(head.length, 64));
      for (let i = 0; i < head.length; i++) buf[i] = head.charCodeAt(i);
      chainLen = head.length;
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
    let L = 0, R = 0, X0 = 0, d = 24;
    let color = '#fff';
    let atlas = null, atlasKey = '', inkTop = 0, inkBottom = 0;
    let dirty = true;
    let velocity = 0, drawnCount = 0;
    let locked = false;
    let drag = null;
    let last = 0;
    let rafId = 0;
    let destroyed = false;
    let remote = null;
    let step = 0, blur = 0, sausen = false;      // Versatz je Bild (Zeichen), Schleier (px), Fenster liegen auseinander
    const dts = [];                              // letzte Bilddauern (ms): Takt der Anzeige
    let period = 1 / 60;
    let shownLo = 0, shownCodes = new Uint8Array(0), shownMark = new Uint8Array(0), shownN = 0;

    const deff = () => Math.max(0, Math.min(d, (W - 2 * MARGIN) / 2));
    const startIdx = () => (L + deff() - X0) / w;            // Index des ersten linear sichtbaren Zeichens
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
      dirty = true;
    }
    function appendDigits(u8, offset) {
      if (!(u8 instanceof Uint8Array)) throw new TypeError('appendDigits erwartet ein Uint8Array');
      const have = chainLen - 2;
      if (offset > have) throw new DigitError('Luecke in den Stellen bei ' + have);
      const skip = have - offset;
      if (skip > 0) {
        const ov = Math.min(skip, u8.length);
        for (let k = 0; k < ov; k++) if (u8[k] !== buf[2 + offset + k]) throw new DigitError('Stellen widersprechen den bekannten Stellen');
      }
      if (skip >= u8.length) return;
      const add = u8.length - skip;
      reserve(chainLen + add);
      buf.set(u8.subarray(skip), chainLen);
      chainLen += add;
      dirty = true;
    }

    // ─── Geometrie ───
    function warp(p, dd) {
      if (dd <= 0) return p < L ? L : (p > R ? R : p);
      if (p > R - dd) return R - dd * Math.exp(-(p - (R - dd)) / dd);
      if (p < L + dd) return L + dd * Math.exp((p - (L + dd)) / dd);
      return p;
    }
    // Anzahl zusätzlicher Zeichen jenseits der linearen Zone, bis die Deckung gesättigt ist.
    function stackCount(dd) {
      return Math.min(4000, Math.ceil((dd / w) * Math.log(Math.max(dd * dpr, 1))) + 160);
    }

    // Strichstärke der Schrift (Courier ca. 0,08 em), mindestens 2 Geräte-Pixel: so schmal werden Zeichen höchstens.
    const minInk = () => Math.max(2 / dpr, S * 0.08);

    function settle(mode) {
      const dd = deff();
      R = Math.min(R, X0 + avail() + dd, W - MARGIN);   // erzwingt zugleich X0 >= R - dd - avail()
      if (mode === 'three') {
        X0 = Math.min(X0, R - dd);
        L = Math.max(MARGIN, X0 - dd);
      } else {
        if (X0 > L + dd) L = X0 - dd;
        L = Math.max(MARGIN, Math.min(L, R - 2 * dd));
        if (X0 > L + dd) X0 = L + dd;
      }
      R = Math.max(R, L + 2 * dd);
      dirty = true;
    }

    function clampX0() { X0 = Math.max(X0, R - deff() - avail()); }

    function rolledLeft() { return X0 < L + deff() - 0.5; }

    // ─── Atlas: je Zeichen mehrere Breitenstufen (Mipmap in x) ───
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
      for (const ch of GLYPHS) {
        const levels = [];
        let cw = wd;
        let c = document.createElement('canvas'); c.width = cw; c.height = hd;
        let g = c.getContext('2d');
        g.fillStyle = color;
        g.font = (S * dpr) + 'px ' + fam;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(ch, cw / 2, hd / 2);
        levels.push(c);
        const cw0 = cw;
        while (cw > 1) {
          const nw = Math.max(1, Math.ceil(cw / 2));
          const n = document.createElement('canvas'); n.width = nw; n.height = hd;
          const ng = n.getContext('2d');
          ng.imageSmoothingEnabled = true; ng.imageSmoothingQuality = 'high';
          ng.drawImage(levels[levels.length - 1], 0, 0, cw, hd, 0, 0, nw, hd);
          levels.push(n); cw = nw;
        }
        // Silhouette: je Zeile die stärkste Tinte des Zeichens, eine Spalte breit (das Zeichen "bis auf Strichstärke" gestaucht).
        const rowMax = rowMaxAlpha(g.getImageData(0, 0, cw0, hd).data, cw0, hd);
        const bar = document.createElement('canvas'); bar.width = 1; bar.height = hd;
        const bg = bar.getContext('2d'), bd = bg.createImageData(1, hd);
        const [br, bgc, bb] = rgb;
        for (let y = 0; y < hd; y++) {
          bd.data[y * 4] = br; bd.data[y * 4 + 1] = bgc; bd.data[y * 4 + 2] = bb; bd.data[y * 4 + 3] = rowMax[y];
        }
        bg.putImageData(bd, 0, 0);
        atlas[ch] = { levels, wd, hd, bar, rowMax };
      }
      let top = -1, bot = -1;
      atlas['8'].rowMax.forEach((m, y) => { if (m > 40) { if (top < 0) top = y; bot = y; } });
      inkTop = top; inkBottom = bot;
      atlasKey = color + '|' + S + '|' + dpr + '|' + w;
    }

    // ─── Rendern (nur das sichtbare Fenster iLo..iHi) ───
    function render() {
      dirty = false;
      if (!atlas || atlasKey !== color + '|' + S + '|' + dpr + '|' + w) buildAtlas();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = true;
      const dd = deff();
      const px = 1 / dpr;
      const inkMin = minInk();
      const Ld = Math.round(L * dpr) * px, Rd = Math.round(R * dpr) * px;
      const iLinLo = Math.ceil((L + dd - X0) / w - 1e-9);
      const iLinHi = Math.floor((R - dd - X0) / w + 1e-9) - 1;
      const K = stackCount(dd);
      const iLo = Math.max(0, iLinLo - 1 - K);
      const iHi = Math.min(total() - 1, iLinHi + 1 + K);
      // Die Ansicht meldet nur die echte Front; den Vorrat darüber legt der Besitzer fest.
      if (opts.onNeedDigits) opts.onNeedDigits(iLinHi + 2 + K + 100);
      if (opts.onFront) opts.onFront(iLinHi >= total() - 3);
      if (remote) remote.want(iLo, iHi, step);
      const wd = atlas['0'].wd, hd = atlas['0'].hd;
      const y0 = Math.round(H * dpr / 2 - hd / 2);
      let n = 0;
      if (shownCodes.length < iHi - iLo + 1) { shownCodes = new Uint8Array(Math.max(iHi - iLo + 1, shownCodes.length * 2)); shownMark = new Uint8Array(shownCodes.length); }
      shownMark.fill(0, 0, iHi - iLo + 1);
      shownLo = iLo; shownN = Math.max(0, iHi - iLo + 1);
      // Schleier in Fahrtrichtung: Abbilder hinter der Bewegung (Kette laeuft nach links bei step > 0, die Abbilder liegen rechts davon)
      const passes = blur > 0 ? 4 : 1;
      for (let pass = passes - 1; pass >= 0; pass--) {
        const off = pass === 0 ? 0 : Math.sign(step) * blur * pass / (passes - 1);
        const mul = pass === 0 ? 1 : 0.22 / pass;
        n = 0;
        for (let i = iLo; i <= iHi; i++) {
          const pa = X0 + i * w;
          const xa = warp(pa, dd), xb = warp(pa + w, dd);
          const nat = xb - xa;
          const dw = Math.max(nat, inkMin);
          let cx = (xa + xb) / 2;
          cx = Math.max(Ld + dw / 2, Math.min(Rd - dw / 2, cx));
          const fromRemote = i >= chainLen;
          const code = fromRemote ? (remote ? remote.at(i) : 0) : buf[i];
          if (pass === 0) shownCodes[i - iLo] = code;
          let wDev = dw * dpr, xDev = (cx - dw / 2 + off) * dpr;
          if (!code) {
            if (fromRemote && remote) {
              ctx.globalAlpha = PENDING_ALPHA * mul;
              if (pass === 0) shownMark[i - iLo] = Math.round(PENDING_ALPHA * 100);
              ctx.drawImage(atlas['0'].bar, xDev + wDev * 0.4, y0, Math.max(1, wDev * 0.2), hd);
              ctx.globalAlpha = 1;
            }
            continue;
          }
          const g = atlas[String.fromCharCode(code)];
          if (!g) continue;
          if (wDev > wd * 0.999) { wDev = wd; xDev = Math.round(xDev); }
          const al = (fromRemote ? FILE_ALPHA : 1) * mul;
          ctx.globalAlpha = al;
          if (pass === 0) shownMark[i - iLo] = Math.round(al * 100);
          // Unter Strichstärke: die Silhouette-Spalte auf Strichbreite ziehen.
          if (nat < inkMin) { ctx.drawImage(g.bar, xDev, y0, wDev, hd); n++; continue; }
          const k = Math.max(0, Math.min(g.levels.length - 1, Math.floor(Math.log2(wd / wDev))));
          ctx.drawImage(g.levels[k], xDev, y0, wDev, hd);
          n++;
        }
      }
      ctx.globalAlpha = 1;
      drawnCount = n;
    }

    // ─── Layout ───
    function measure() {
      const r = canvas.getBoundingClientRect();
      const ndpr = window.devicePixelRatio || 1;
      const nS = Math.min(56, Math.max(28, Math.round(window.innerWidth * 0.06)));
      ctx.font = (nS * ndpr) + 'px "Courier New", Courier, monospace';
      const nw = Math.max(1, Math.round(ctx.measureText('0').width)) / ndpr;
      return { cw: r.width, ch: r.height, ndpr, nS, nw };
    }
    function applySize(first) {
      const m = measure();
      const oldIdx = startIdx();
      const wasDefaultD = Math.abs(d - w) < 0.01;
      W = m.cw; H = m.ch; dpr = m.ndpr; S = m.nS; w = m.nw;
      const cwDev = Math.max(1, Math.round(W * dpr)), chDev = Math.max(1, Math.round(H * dpr));
      if (canvas.width !== cwDev) canvas.width = cwDev;
      if (canvas.height !== chDev) canvas.height = chDev;
      if (first) {
        d = w;
        L = (W - 3 * w) / 2; X0 = L + d; R = X0 + w + d;
      } else {
        if (wasDefaultD) { d = w; if (opts.onD) opts.onD(d); }
        const cap = (W - 2 * MARGIN) / 2;
        if (d > cap) { d = cap; if (opts.onD) opts.onD(d); }   // sonst springt R beim Wiedervergroessern nach aussen
        const dd = deff();
        X0 = L + dd - oldIdx * w;
        L = Math.min(L, W - MARGIN); R = Math.min(R, W - MARGIN);
      }
      settle(rolledLeft() ? 'x' : 'three');
      if (drag) drag.rebase = true;   // der nächste pointermove setzt die Zugwerte neu, sonst springt er
    }

    // ─── Interaktion ───
    const rect = () => canvas.getBoundingClientRect();
    // Der nächste Griff gewinnt: die 3 (nur solange links nichts eingerollt ist), R, L (nur wenn eingerollt).
    function hitTest(x) {
      const rolled = rolledLeft();
      const cands = [];
      if (!rolled && x >= X0 - HIT && x <= X0 + w) cands.push(['three', Math.abs(x - (X0 + w / 2))]);
      if (Math.abs(x - R) <= HIT) cands.push(['R', Math.abs(x - R)]);
      if (rolled && Math.abs(x - L) <= HIT) cands.push(['L', Math.abs(x - L)]);
      if (cands.length) return cands.reduce((a, c) => (c[1] < a[1] ? c : a))[0];
      return x > L && x < R ? 'swipe' : null;
    }
    function onDown(e) {
      if (drag || locked) return;
      const x = e.clientX - rect().left;
      const mode = hitTest(x);
      if (!mode) return;
      drag = { id: e.pointerId, mode, x0: x, X0, L, R };
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
    function onMove(e) {
      const x = e.clientX - rect().left;
      if (!drag || drag.id !== e.pointerId) {
        const h = hitTest(x);
        canvas.style.cursor = h === 'swipe' ? 'grab' : (h ? 'ew-resize' : 'default');
        return;
      }
      if (drag.rebase) { drag.rebase = false; drag.X0 = X0; drag.L = L; drag.R = R; drag.x0 = x; }
      const dx = x - drag.x0, dd = deff();
      let mode = 'x';
      if (drag.mode === 'R') {
        R = Math.max(L + 2 * dd, Math.min(W - MARGIN, drag.R + dx));
      } else if (drag.mode === 'three') {
        X0 = drag.X0 + dx;
        mode = 'three';
      } else if (drag.mode === 'L') {
        const Lt = Math.max(MARGIN, Math.min(R - 2 * dd, drag.L + dx));
        if (Lt + dd <= X0) {
          drag.mode = 'three'; drag.x0 = x; X0 = Lt + dd; drag.X0 = X0;
          mode = 'three';
        } else {
          L = Lt;
        }
      } else {
        X0 = drag.X0 + dx;
        clampX0();
      }
      settle(mode);
      e.preventDefault();
    }
    function endDrag(e) {
      if (!drag || drag.id !== e.pointerId) return;
      drag = null;
      // Der Zeiger kann schon losgelassen sein (lostpointercapture, pointercancel): dann wirft release nur diese eine Klasse.
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    }
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('lostpointercapture', endDrag);

    // ─── Drift: Mitte = Stillstand, exponentielle Kennlinie, nach oben offen ───
    function frame(now) {
      if (destroyed) return;
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      const sv = opts.drift ? (parseFloat(opts.drift()) || 0) : 0;
      const rate = locked || Math.abs(sv) < DEAD_ZONE ? 0 : rateOf(-sv);
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
        const visW = Math.max(1, (R - L - 2 * deff()) / w);
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
        if (rate < 0) X0 = Math.min(X0, Math.max(prev, L + deff()));   // rückwärts: stoppt, wenn die 3 vorn ist
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

    // ─── Verdichtung ───
    // Nur die Stauchzone aendert sich: R, X0 und (eingerollt) L bleiben stehen, nichts springt. Was nicht passt, wird
    // am Regler begrenzt: Eingerollt hoechstens der halbe Abstand der Enden, sonst auch noch der Platz rechts der 3.
    // Ist nichts eingerollt, ist L unsichtbar und folgt der 3. Zeigt die Kette an die Front, rueckt nur R nach.
    function maxD(unrolled) {
      const cap = (W - 2 * MARGIN) / 2;
      return Math.max(0, Math.min(cap, unrolled ? Math.min(R - X0, (R - MARGIN) / 2) : (R - L) / 2));
    }
    function setD(v) {
      const unrolled = !rolledLeft();
      const want = Math.max(0, v);
      d = Math.min(want, maxD(unrolled));
      if (unrolled) L = Math.max(MARGIN, X0 - deff());
      R = Math.min(R, X0 + avail() + deff());
      dirty = true;
      if (d !== want && opts.onD) opts.onD(d);   // der Regler springt auf den moeglichen Wert zurueck
    }
    function rewind() {
      X0 = L + deff();
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
      canvas.removeEventListener('pointerup', endDrag);
      canvas.removeEventListener('pointercancel', endDrag);
      canvas.removeEventListener('lostpointercapture', endDrag);
      canvas.style.cursor = '';
      drag = null;
    }

    return {
      setDigits, appendDigits, rewind, setD, destroy, refreshColor, setRemote,
      setLocked(b) { locked = !!b; },
      invalidate() { dirty = true; },
      digits() { return decoder.decode(buf.subarray(0, chainLen)); },
      // Was das letzte Bild an Ziffern zeigte: ab Kettenindex lo, ASCII ('0' = nicht geladen), fromRemote = erster Index aus der Quelle
      shown() { return { lo: shownLo, codes: decoder.decode(shownCodes.subarray(0, shownN).map((c) => c || 63)), fromRemote: chainLen, marks: Array.from(shownMark.subarray(0, shownN)) }; },
      state() {
        const dd = deff();
        const startIndex = Math.max(0, startIdx());
        const endIndex = Math.max(0, (R - dd - X0) / w);
        return {
          L, R, X0, d, dEff: dd, w, W, H, dpr,
          startIndex, endIndex,
          visibleCount: Math.max(0, Math.floor(endIndex) - Math.ceil(startIndex - 1e-9)),
          velocity, drawnCount,
          chainLength: chainLen, totalLength: total(), step, blur, sausen,
          inkTop: atlas ? inkTop / dpr + (H / 2 - atlas['0'].hd / dpr / 2) : null,   // null bis zum ersten Bild
          inkBottom: atlas ? inkBottom / dpr + (H / 2 - atlas['0'].hd / dpr / 2) : null,
          minInk: minInk(),
          color
        };
      }
    };
  }

  window.UnfoldingView = { create, DigitError };
})();
