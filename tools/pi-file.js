/*
 * PiFile: liest Pi-Stellen aus der selbst gehosteten b196-Datei per HTTP-Range (same-origin), haelt nur wenige Gruppen.
 * Klassisches Script, kein Build. Setzt das Global `PiFile`. Format: /pi-daten/pi-1e9.txt
 *   Kopf 32 Byte ("PI59", Version, 59, 196, Bitreihenfolge, Stellenzahl, Blockzahl), dann je 59 Ziffern als eine Zahl in 196 Bit,
 *   MSB zuerst, bitdicht ohne Byte-Ausrichtung. Block b = Nachkommastellen 59b+1..59b+59 bei Bit 196b (ab Byte 32).
 *   Letzter Block: Ziffern rechts mit Nullen aufgefuellt (Fuellziffern muessen 0 sein und werden nie gezeigt).
 *
 *   const f = PiFile.create({ url, digits, onError(err), onChange() });
 *   f.length            // Kettenlaenge wie in UnfoldingView: Index 0 = "3", 1 = ".", 2.. = Nachkommastellen
 *   f.at(i)             // ASCII-Code der Stelle an Kettenindex i, 0 solange die Gruppe noch nicht da ist
 *   f.want(lo, hi, step)// sichtbares Fenster (Kettenindizes) und Versatz je Bild; holt Fenster entlang der Bahn gebuendelt vor
 *   f.stats()  f.close()
 *   PiFile.decodeGroup(bytes, nblocks, valid)  // Decoder: 8 Bloecke (196 Byte) -> 472 ASCII-Codes
 *
 * Cache-Einheit ist die Gruppe: 8 Bloecke = 472 Ziffern = 196 Byte (byteausgerichtet, Byte 32+196g).
 * Zuerst wird der Kopf gelesen und geprueft (falsches Magic/Version/Groesse -> Fehler), danach die Daten.
 * Abruf: fehlende Gruppen der naechsten Bilder gehen als EIN Multi-Range-Request (hoechstens 350 Bereiche, mehr sprengt das
 * Header-Limit des Servers); Gruppen von verlassenen Fenstern werden nicht geladen, laufende Anfragen ohne Nutzen abgebrochen.
 * Fehler (Netz, Nicht-206, falsche Laenge/Bereiche, fehlende Teile, Blockwert >= 10^59, Fuellziffern) rufen genau einmal onError und
 * schliessen den Leser; kein stilles Weiterlaufen. Ein Nicht-206 wird nie gelesen (ungueltiges If-Range lieferte sonst 400 MB).
 */
(() => {
  'use strict';

  const HEADER = 32;                  // Byte
  const D = 59, BITS = 196;           // Ziffern und Bit je Block
  const GB = 8;                       // Bloecke je Gruppe: 8 * 196 Bit = 196 Byte, byteausgerichtet
  const GBYTES = GB * BITS / 8;       // 196
  const GD = GB * D;                  // 472 Ziffern je Gruppe
  const MAX_BLOCKS = 352;             // harte Grenze des Gruppen-Caches (352 * 472 = 166k Ziffern)
  const MAX_RANGES = 350;             // je Request (Server: Header-Limit)
  const MAX_INFLIGHT = 2;
  const LOOK = 60;                    // Bilder Vorlauf
  const NEAR = 30;                    // fehlt davon etwas, wird nachgeladen (sonst nicht: kein Request je Bild)
  const LIM = 10n ** 59n, MASK = (1n << 196n) - 1n;

  class PiFileError extends Error {}

  // Gruppe -> ASCII-Codes. src: mindestens ceil(196 * nblocks / 8) Byte ab Gruppenanfang; valid = echte Ziffern der Gruppe.
  function decodeGroup(src, nblocks, valid, label) {
    const dv = new DataView(src.buffer, src.byteOffset, src.byteLength);
    const out = new Uint8Array(GD);
    for (let k = 0; k < nblocks; k++) {
      const at = (BITS * k) >> 3;                                   // 25 Byte decken den Block ab (4 Rand-Bit)
      if (at + 25 > src.length) throw new PiFileError('Pi-Datei: Gruppe ' + label + ' zu kurz');
      let v = (((dv.getBigUint64(at) << 64n) | dv.getBigUint64(at + 8)) << 64n | dv.getBigUint64(at + 16)) << 8n | BigInt(src[at + 24]);
      v = (k & 1) ? v & MASK : v >> 4n;                             // ungerades k beginnt im Halbbyte
      if (v >= LIM) throw new PiFileError('Pi-Datei: Blockwert >= 10^59 in Gruppe ' + label + ' Block ' + k);
      const s = v.toString();
      const o = k * D + D - s.length;
      for (let q = k * D; q < o; q++) out[q] = 48;
      for (let q = 0; q < s.length; q++) out[o + q] = s.charCodeAt(q);
    }
    for (let q = valid; q < nblocks * D; q++) if (out[q] !== 48) throw new PiFileError('Pi-Datei: Fuellziffer ungleich 0 in Gruppe ' + label);
    return out;
  }

  function create(opts) {
    const url = opts.url, digits = opts.digits;
    if (!url || !(digits > 0)) throw new TypeError('PiFile.create: url und digits noetig');
    const nBlocks = Math.ceil(digits / D);
    const nGroups = Math.ceil(nBlocks / GB);
    const bytes = HEADER + Math.ceil(nBlocks * BITS / 8);
    const count = digits;             // Nachkommastellen
    const length = count + 2;
    const cache = new Map();          // Gruppe -> { data, use }
    const inflight = [];              // { ctrl, blocks:Set }
    let keep = new Set(), near = new Set();
    let tick = 0, closed = false, failed = null, ready = false, headCtrl = null;
    let lastBlk = -1, lastData = null;
    const st = { requests: 0, aborted: 0, ranges: 0, bytesIn: 0, blocksLoaded: 0 };
    const ascii = new TextDecoder('latin1');

    const blkOfIdx = (i) => Math.floor((Math.max(2, Math.min(length - 1, i)) - 2) / GD);

    function fail(e) {
      if (failed) return;
      failed = e instanceof Error ? e : new PiFileError(String(e));
      closed = true;
      for (const r of inflight) r.ctrl.abort();
      if (headCtrl) headCtrl.abort();
      inflight.length = 0;
      cache.clear(); lastBlk = -1; lastData = null;
      console.error('[PiFile] ' + failed.message);
      if (opts.onError) opts.onError(failed);
    }

    function at(i) {
      const j = i - 2;
      if (j < 0 || j >= count) return 0;
      const b = Math.floor(j / GD);
      let data;
      if (b === lastBlk) data = lastData;
      else {
        const e = cache.get(b);
        if (!e) return 0;
        lastBlk = b; lastData = data = e.data;
      }
      return data[j - b * GD];
    }

    function checkHeader(h) {
      const bad = (m) => { throw new PiFileError('Pi-Datei: Kopf ungueltig (' + m + ')'); };
      if (h.length !== HEADER) bad('Laenge ' + h.length);
      if (String.fromCharCode(h[0], h[1], h[2], h[3]) !== 'PI59') bad('Magic');
      if (h[4] !== 1) bad('Version ' + h[4]);
      if (h[5] !== D || h[6] !== BITS) bad('Block ' + h[5] + ' Ziffern/' + h[6] + ' Bit');
      if (h[7] !== 0) bad('Bitreihenfolge ' + h[7]);
      const dv = new DataView(h.buffer, h.byteOffset, h.byteLength);
      if (dv.getBigUint64(8) !== BigInt(digits)) bad('Stellen ' + dv.getBigUint64(8) + ' statt ' + digits);
      if (dv.getBigUint64(16) !== BigInt(nBlocks)) bad('Bloecke ' + dv.getBigUint64(16) + ' statt ' + nBlocks);
      for (let k = 24; k < 32; k++) if (h[k] !== 0) bad('reserviert');
    }

    async function loadHeader() {
      headCtrl = new AbortController();
      st.requests++; st.ranges++;
      try {
        const res = await fetch(url, { headers: { Range: 'bytes=0-' + (HEADER - 1) }, signal: headCtrl.signal, credentials: 'same-origin' });
        if (res.status !== 206) { headCtrl.abort(); throw new PiFileError('Pi-Datei: Antwort ' + res.status + ' statt 206 (' + url + ')'); }
        const body = new Uint8Array(await res.arrayBuffer());
        st.bytesIn += body.length;
        verify([singlePart(res, body)], [[0, HEADER - 1]]);
        checkHeader(body);
      } catch (e) {
        if (closed) return;
        fail(e instanceof PiFileError ? e : new PiFileError('Pi-Datei nicht ladbar: ' + (e && e.message ? e.message : e)));
        return;
      }
      headCtrl = null;
      ready = true;
      pump();
    }

    // Fenster entlang der Bahn: k = 0 ist das sichtbare, k bis LOOK die erwarteten (Versatz step je Bild).
    function plan(lo, hi, step) {
      const k2 = new Set(), n2 = new Set();
      for (let k = 0; k <= LOOK; k++) {
        const a = blkOfIdx(Math.round(lo + k * step) - 2), b = blkOfIdx(Math.round(hi + k * step) + 2);
        for (let x = Math.min(a, b); x <= Math.max(a, b); x++) {
          if (k2.size >= MAX_BLOCKS && !k2.has(x)) continue;
          k2.add(x);
          if (k <= NEAR) n2.add(x);
        }
      }
      keep = k2; near = n2;
    }

    function want(lo, hi, step) {
      if (closed) return;
      if (!(hi >= lo) || !Number.isFinite(step)) return;
      plan(lo, hi, step);
      tick++;
      for (const b of keep) { const e = cache.get(b); if (e) e.use = tick; }
      // verlassene Fenster: Anfragen, von denen nichts mehr gebraucht wird, abbrechen
      for (let n = inflight.length - 1; n >= 0; n--) {
        const r = inflight[n];
        let useful = false;
        for (const b of r.blocks) if (keep.has(b)) { useful = true; break; }
        if (!useful) { r.ctrl.abort(); inflight.splice(n, 1); st.aborted++; }
      }
      if (cache.size > MAX_BLOCKS) evict();
      pump();
    }

    function evict() {
      const arr = [...cache.entries()].sort((x, y) => x[1].use - y[1].use);
      for (const [b] of arr) {
        if (cache.size <= MAX_BLOCKS) break;
        cache.delete(b);
        if (b === lastBlk) { lastBlk = -1; lastData = null; }
      }
    }

    function pump() {
      if (closed || !ready || inflight.length >= MAX_INFLIGHT) return;
      const pending = new Set();
      for (const r of inflight) for (const b of r.blocks) pending.add(b);
      let urgent = false;
      const need = [];
      for (const b of keep) {
        if (cache.has(b) || pending.has(b)) continue;
        need.push(b);
        if (near.has(b)) urgent = true;
      }
      if (!urgent) return;
      need.sort((x, y) => x - y);
      // benachbarte Bloecke zu einem Bereich
      const ranges = [];
      let taken = [];
      for (const b of need) {
        const last = ranges[ranges.length - 1];
        if (last && last.b === b - 1) { last.b = b; taken.push(b); continue; }
        if (ranges.length >= MAX_RANGES) break;
        ranges.push({ a: b, b }); taken.push(b);
      }
      send(ranges, taken);
    }

    async function send(ranges, taken) {
      const ctrl = new AbortController();
      const req = { ctrl, blocks: new Set(taken) };
      inflight.push(req);
      const spans = ranges.map((r) => [HEADER + r.a * GBYTES, Math.min(HEADER + (r.b + 1) * GBYTES, bytes) - 1]);
      st.requests++; st.ranges += spans.length;
      try {
        const res = await fetch(url, { headers: { Range: 'bytes=' + spans.map((s) => s[0] + '-' + s[1]).join(',') }, signal: ctrl.signal, credentials: 'same-origin' });
        if (res.status !== 206) { ctrl.abort(); throw new PiFileError('Pi-Datei: Antwort ' + res.status + ' statt 206 (' + url + ')'); }
        const body = new Uint8Array(await res.arrayBuffer());
        st.bytesIn += body.length;
        const parts = spans.length === 1 ? [singlePart(res, body, spans[0])] : multiParts(res, body);
        verify(parts, spans);
        const n = inflight.indexOf(req);
        if (n < 0) return;   // inzwischen abgebrochen: Antwort verwerfen
        inflight.splice(n, 1);
        store(parts);
      } catch (e) {
        if (ctrl.signal.aborted && !failed && inflight.indexOf(req) < 0) return;   // gewollt abgebrochen
        const n = inflight.indexOf(req); if (n >= 0) inflight.splice(n, 1);
        fail(e instanceof PiFileError ? e : new PiFileError('Pi-Datei nicht ladbar: ' + (e && e.message ? e.message : e)));
        return;
      }
      if (opts.onChange) opts.onChange();
      pump();
    }

    function parseRange(text) {
      const m = /^\s*bytes\s+(\d+)-(\d+)\/(\d+)\s*$/i.exec(text || '');
      if (!m) throw new PiFileError('Pi-Datei: Content-Range fehlt oder unlesbar: ' + text);
      return { a: +m[1], b: +m[2], total: +m[3] };
    }
    function singlePart(res, body) {
      const r = parseRange(res.headers.get('content-range'));
      return { a: r.a, b: r.b, total: r.total, data: body };
    }
    function multiParts(res, body) {
      const ct = res.headers.get('content-type') || '';
      if (!/^multipart\/byteranges/i.test(ct)) throw new PiFileError('Pi-Datei: erwartet multipart/byteranges, bekam ' + ct);
      // WebKit reicht den Begrenzer bei umgeleiteten Antworten (Playwright-fulfill) nicht im Content-Type durch: dann aus dem Koerper lesen, die Struktur wird unten Byte fuer Byte geprueft.
      const m = /boundary=("?)([^";]+)\1/i.exec(ct) || /^(?:\r\n)?--([^\r\n]+)\r\n/.exec(ascii.decode(body.subarray(0, 200)));
      if (!m) throw new PiFileError('Pi-Datei: multipart ohne Begrenzer im Content-Type: ' + ct);
      const dash = new TextEncoder().encode('--' + m[m.length - 1]);
      const parts = [];
      let pos = find(body, dash, 0);
      if (pos < 0) throw new PiFileError('Pi-Datei: multipart ohne Begrenzer');
      for (;;) {
        pos += dash.length;
        if (body[pos] === 45 && body[pos + 1] === 45) break;   // Endmarke
        if (body[pos] !== 13 || body[pos + 1] !== 10) throw new PiFileError('Pi-Datei: multipart zerstoert (nach Begrenzer)');
        pos += 2;
        const he = find(body, [13, 10, 13, 10], pos);
        if (he < 0) throw new PiFileError('Pi-Datei: multipart ohne Kopfende');
        const head = ascii.decode(body.subarray(pos, he));
        const cr = /content-range:\s*([^\r\n]+)/i.exec(head);
        const r = parseRange(cr ? cr[1] : '');
        pos = he + 4;
        const len = r.b - r.a + 1;
        if (len < 1 || pos + len > body.length) throw new PiFileError('Pi-Datei: multipart-Teil zu kurz');
        parts.push({ a: r.a, b: r.b, total: r.total, data: body.subarray(pos, pos + len) });
        pos += len;
        if (body[pos] !== 13 || body[pos + 1] !== 10) throw new PiFileError('Pi-Datei: multipart zerstoert (nach Teil)');
        pos += 2;
        if (!match(body, dash, pos)) throw new PiFileError('Pi-Datei: multipart zerstoert (Begrenzer fehlt)');
      }
      return parts;
    }
    function match(buf, pat, at0) {
      for (let k = 0; k < pat.length; k++) if (buf[at0 + k] !== pat[k]) return false;
      return true;
    }
    function find(buf, pat, from) {
      for (let i = from; i + pat.length <= buf.length; i++) if (buf[i] === pat[0] && match(buf, pat, i)) return i;
      return -1;
    }

    // Jeder angefragte Bereich muss genau einmal, in Reihenfolge, mit richtiger Laenge und Dateigroesse da sein.
    function verify(parts, spans) {
      if (parts.length !== spans.length) throw new PiFileError('Pi-Datei: ' + parts.length + ' Teile statt ' + spans.length + ' (Teil fehlt)');
      parts.forEach((p, k) => {
        if (p.a !== spans[k][0] || p.b !== spans[k][1]) throw new PiFileError('Pi-Datei: Bereich ' + p.a + '-' + p.b + ' statt ' + spans[k][0] + '-' + spans[k][1]);
        if (p.total !== bytes) throw new PiFileError('Pi-Datei: Dateigroesse ' + p.total + ' statt ' + bytes);
        if (p.data.length !== p.b - p.a + 1) throw new PiFileError('Pi-Datei: Laenge ' + p.data.length + ' statt ' + (p.b - p.a + 1));
      });
    }

    function store(parts) {
      for (const p of parts) {
        for (let o = 0; o < p.data.length; o += GBYTES) {
          const b = (p.a - HEADER + o) / GBYTES;
          const nb = Math.min(GB, nBlocks - b * GB);
          const data = decodeGroup(p.data.subarray(o, o + GBYTES), nb, Math.min(GD, digits - b * GD), b);
          st.blocksLoaded++;
          if (!keep.has(b)) continue;   // Fenster inzwischen verlassen
          cache.set(b, { data, use: tick });
        }
      }
      if (cache.size > MAX_BLOCKS) evict();
    }

    function close() {
      closed = true;
      for (const r of inflight) r.ctrl.abort();
      if (headCtrl) headCtrl.abort();
      inflight.length = 0;
      cache.clear(); lastBlk = -1; lastData = null;
    }

    loadHeader();
    return {
      length, at, want, close,
      stats() { return Object.assign({ cached: cache.size, inflight: inflight.length, maxBlocks: MAX_BLOCKS, failed: failed ? failed.message : null }, st); }
    };
  }

  window.PiFile = { create, decodeGroup, PiFileError };
})();
