/*
 * PiFile: liest Pi-Stellen aus der selbst gehosteten BCD-Datei per HTTP-Range (same-origin), haelt nur wenige Bloecke.
 * Klassisches Script, kein Build. Setzt das Global `PiFile`. Format: /pi-daten/pi-1e9.txt
 *   2 Ziffern je Byte (BCD, hohes Nibble zuerst), kein Kopf, Byte 0 = Nachkommastellen 1 und 2.
 *
 *   const f = PiFile.create({ url, bytes, onError(err), onChange() });
 *   f.length            // Kettenlaenge wie in UnfoldingView: Index 0 = "3", 1 = ".", 2.. = Nachkommastellen
 *   f.at(i)             // ASCII-Code der Stelle an Kettenindex i, 0 solange der Block noch nicht da ist
 *   f.want(lo, hi, step)// sichtbares Fenster (Kettenindizes) und Versatz je Bild; holt Fenster entlang der Bahn gebuendelt vor
 *   f.stats()  f.close()
 *
 * Abruf: fehlende Bloecke der naechsten Bilder gehen als EIN Multi-Range-Request (hoechstens 350 Bereiche, mehr sprengt das
 * Header-Limit des Servers); Bloecke von verlassenen Fenstern werden nicht geladen, laufende Anfragen ohne Nutzen abgebrochen.
 * Fehler (Netz, Nicht-206, falsche Laenge/Bereiche, fehlende Teile, ungueltige Ziffern) rufen genau einmal onError und
 * schliessen den Leser; kein stilles Weiterlaufen. Ein Nicht-206 wird nie gelesen (ungueltiges If-Range lieferte sonst 500 MB).
 */
(() => {
  'use strict';

  const BLOCK_SHIFT = 7;              // 128 Byte = 256 Ziffern je Block
  const BLOCK = 1 << BLOCK_SHIFT;
  const MAX_BLOCKS = 640;             // harte Grenze des Block-Caches (80 KB)
  const MAX_RANGES = 350;             // je Request (Server: Header-Limit)
  const MAX_INFLIGHT = 2;
  const LOOK = 60;                    // Bilder Vorlauf
  const NEAR = 30;                    // fehlt davon etwas, wird nachgeladen (sonst nicht: kein Request je Bild)

  class PiFileError extends Error {}

  function create(opts) {
    const url = opts.url, bytes = opts.bytes;
    if (!url || !(bytes > 0)) throw new TypeError('PiFile.create: url und bytes noetig');
    const count = bytes * 2;          // Nachkommastellen
    const length = count + 2;
    const cache = new Map();          // Block -> { data, use }
    const inflight = [];              // { ctrl, blocks:Set }
    let keep = new Set(), near = new Set();
    let tick = 0, closed = false, failed = null;
    let lastBlk = -1, lastData = null;
    const st = { requests: 0, aborted: 0, ranges: 0, bytesIn: 0, blocksLoaded: 0 };
    const ascii = new TextDecoder('latin1');

    const blkOfIdx = (i) => (Math.max(2, Math.min(length - 1, i)) - 2 >> 1) >> BLOCK_SHIFT;

    function fail(e) {
      if (failed) return;
      failed = e instanceof Error ? e : new PiFileError(String(e));
      closed = true;
      for (const r of inflight) r.ctrl.abort();
      inflight.length = 0;
      cache.clear(); lastBlk = -1; lastData = null;
      console.error('[PiFile] ' + failed.message);
      if (opts.onError) opts.onError(failed);
    }

    function at(i) {
      const j = i - 2;
      if (j < 0 || j >= count) return 0;
      const byte = j >> 1, b = byte >> BLOCK_SHIFT;
      let data;
      if (b === lastBlk) data = lastData;
      else {
        const e = cache.get(b);
        if (!e) return 0;
        lastBlk = b; lastData = data = e.data;
      }
      const v = data[byte & (BLOCK - 1)];
      return 48 + ((j & 1) ? v & 15 : v >> 4);
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
      if (closed || inflight.length >= MAX_INFLIGHT) return;
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
      const spans = ranges.map((r) => [r.a * BLOCK, Math.min((r.b + 1) * BLOCK, bytes) - 1]);
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
        for (let o = 0; o < p.data.length; o += BLOCK) {
          const b = (p.a + o) >> BLOCK_SHIFT;
          const data = p.data.slice(o, o + BLOCK);
          for (let k = 0; k < data.length; k++) {
            const v = data[k];
            if ((v >> 4) > 9 || (v & 15) > 9) throw new PiFileError('Pi-Datei: ungueltige Ziffern im Block ' + b);
          }
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
      inflight.length = 0;
      cache.clear(); lastBlk = -1; lastData = null;
    }

    return {
      length, at, want, close,
      stats() { return Object.assign({ cached: cache.size, inflight: inflight.length, maxBlocks: MAX_BLOCKS, failed: failed ? failed.message : null }, st); }
    };
  }

  window.PiFile = { create, PiFileError };
})();
