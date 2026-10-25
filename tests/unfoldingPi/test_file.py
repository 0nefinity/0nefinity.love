"""Pi-Stellendatei (tools/pi-file.js, /pi-daten/pi-1e9.b196) in unfoldingPi:
 r1  Range-Lesen: Stellen an mehreren Positionen stimmen mit der Datei (und den bekannten Stellen 1-20, 762-767)
 s1  Nahtstelle Geraet/Datei: keine Luecke, keine Verschiebung, Kennzeichnung wechselt genau an der Kettenlaenge
 e*  Fehlerweg: 404, 200 statt 206, fehlender Teil, falsches Content-Range/Dateigroesse, Blockwert >= 10^59, falscher Kopf -> sichtbarer Fehler
 m1  Speicher: nach Sausen ueber viele Fenster bleibt der Block-Cache begrenzt
 h1  Ehrlichkeit bei Hoechsttempo: Stichproben-Fenster gegen die Datei; Datenrate (KB/s), Anfragen je Sekunde
 a1  Verlassene Fenster: langsame Anfragen werden abgebrochen, waehrend des Ladens keine falschen Ziffern (Platzhalter)
BROWSER=...  MUT=<name> (siehe mutants.sh)"""
import os, re, sys, time, urllib.request
from playwright.sync_api import sync_playwright
from common import *

MUT = os.environ.get('MUT', ''); B = os.environ.get('BROWSER', 'chromium')
FILE_URL = HOST + '/pi-daten/pi-1e9.b196'
SET = "(v)=>{const d=document.getElementById('drift'); d.value=v; d.dispatchEvent(new Event('input',{bubbles:true}));}"
SAMPLER = """(ms)=>new Promise(res=>{const out=[];const t0=performance.now();
 function f(t){const s=window.unfoldingPi.shown();out.push([s.lo,s.codes,s.marks,s.fromRemote]);
 if(t-t0<ms)requestAnimationFrame(f);else res(out);}requestAnimationFrame(f);})"""

MUTS = {   # name: (route-Muster, alt, neu)
    'shift':     ('**/pi-file.js', "const j = i - 2;", "const j = i - 1;"),
    'noseam':    ('**/unfolding-view.js', "const fromRemote = i >= chainLen;", "const fromRemote = i > chainLen;"),
    'nomark':    ('**/unfolding-view.js', "const FILE_ALPHA = 0.7;", "const FILE_ALPHA = 1;"),
    'nopending': ('**/unfolding-view.js', "const PENDING_ALPHA = 0.1;", "const PENDING_ALPHA = 0;"),
    'non206':    ('**/pi-file.js', "if (res.status !== 206) { ctrl", "if (false) { ctrl"),
    'non206h':   ('**/pi-file.js', "if (res.status !== 206) { headCtrl", "if (false) { headCtrl"),
    'nocount':   ('**/pi-file.js', "if (parts.length !== spans.length) throw", "if (false) throw"),
    'norange':   ('**/pi-file.js', "if (p.a !== spans[k][0] || p.b !== spans[k][1]) throw", "if (false) throw"),
    'nototal':   ('**/pi-file.js', "if (p.total !== bytes) throw", "if (false) throw"),
    'nolim':     ('**/pi-file.js', "if (v >= LIM) throw", "if (false) throw"),
    'nomagic':   ('**/pi-file.js', "!== 'PI59') bad", "!== 'PI59' && false) bad"),
    'noevict':   ('**/pi-file.js', "function evict() {", "function evict() { return;"),
    'noabort':   ('**/pi-file.js', "if (!useful) {", "if (false) {"),
    'nolook':    ('**/pi-file.js', "const LOOK = 60;", "const LOOK = 0;"),
    'nohyst':    ('**/unfolding-view.js', "if (Math.abs(est - period) > 0.12 * period) period = est;", "period = est;"),
    'noonerror': ('**/unfoldingPi', "onError: (e) => fail('Pi-Datei: ' + e.message),", "onError: () => {},"),
}
if MUT and MUT != 'ident' and MUT not in MUTS:
    print('unbekannter Mutant', MUT); sys.exit(2)


def ref_digits(d, n):
    """Nachkommastellen d..d+n-1 (1-basiert) aus der b196-Datei per Range, eigener Entpacker (59 Ziffern je 196 Bit, MSB zuerst)."""
    b0, b1 = (d - 1) // 59, (d + n - 2) // 59
    lo, hi = 32 + (196 * b0 >> 3), 32 + ((196 * (b1 + 1) + 7) >> 3) - 1
    rq = urllib.request.Request(FILE_URL, headers={'Range': 'bytes=%d-%d' % (lo, hi)})
    with urllib.request.urlopen(rq) as r:
        assert r.status == 206, r.status
        body = r.read()
    big = int.from_bytes(body, 'big'); tot = 8 * len(body); skip = 196 * b0 - 8 * (196 * b0 >> 3)
    s = ''.join('%059d' % ((big >> (tot - skip - 196 * (k + 1))) & ((1 << 196) - 1)) for k in range(b1 - b0 + 1))
    off = (d - 1) - 59 * b0
    return s[off:off + n]


def new_ctx(br, test_cfg=None, vp=(1000, 600)):
    c = br.new_context(viewport={'width': vp[0], 'height': vp[1]})
    if test_cfg:
        c.add_init_script('window.unfoldingPiTest = ' + test_cfg + ';')
    if MUT == 'ident': route_text(c, '**/unfoldingPi', lambda t: t, 'ident')
    elif MUT in MUTS:
        pat, a, b = MUTS[MUT]; mutate(c, pat, a, b, MUT)
    return c


def open_page(c):
    p = c.new_page(); errs = []
    p.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    p.goto(URL); p.wait_for_function('window.unfoldingPi')
    return p, errs


def cr_shift(m):
    return b'Content-Range: bytes %d-%d/%s' % (int(m[1]) ^ 1, int(m[2]) ^ 1, m[3])


R = Res()
with sync_playwright() as pw:
    br = getattr(pw, B).launch()

    # r1 Range-Lesen
    c = new_ctx(br); p, errs = open_page(c)
    pos = [1, 762, 100000, 100001, 4097, 12345678, 250000001, 500000000, 999999981]
    for d in pos:
        try:
            p.wait_for_function('([a,b])=>{window.unfoldingPi.fileWant(a,b);return window.unfoldingPi.fileAt(a)>0&&window.unfoldingPi.fileAt(b)>0}', arg=[d + 1, d + 20], timeout=10000)
        except Exception:
            pass
        got = ''.join(chr(x) for x in p.evaluate('(a)=>{const o=[];for(let i=a;i<a+20;i++)o.push(window.unfoldingPi.fileAt(i));return o;}', d + 1) if x)
        want = ref_digits(d, 20)
        R.check('r1 Stellen %d..%d aus der Seite = Datei' % (d, d + 19), got == want, (got, want))
    p.evaluate('([a,b])=>window.unfoldingPi.fileWant(a,b)', [2, 30])
    try:
        p.wait_for_function('()=>window.unfoldingPi.fileAt(21)>0', timeout=8000)
    except Exception:
        pass
    first = ''.join(chr(p.evaluate('(i)=>window.unfoldingPi.fileAt(i)', i) or 63) for i in range(2, 22))
    R.check('r1 Stellen 1-20 = 14159265358979323846', first == '14159265358979323846', first)
    p.evaluate('([a,b])=>window.unfoldingPi.fileWant(a,b)', [763, 770])
    try:
        p.wait_for_function('()=>window.unfoldingPi.fileAt(768)>0', timeout=8000)
    except Exception:
        pass
    nines = ''.join(chr(p.evaluate('(i)=>window.unfoldingPi.fileAt(i)', i) or 63) for i in range(763, 769))
    R.check('r1 Stellen 762-767 = 999999 (Feynman-Punkt)', nines == '999999', nines)
    R.check('r1 kein Fehler', not p.evaluate('window.unfoldingPi.state().error') and not errs, errs[:2])
    c.close()

    # s1 Nahtstelle
    c = new_ctx(br, '{deviceDigits: 300}'); p, errs = open_page(c)
    p.wait_for_function('window.unfoldingPi.state().chainLength >= 300', timeout=20000)
    p.wait_for_timeout(500)
    seam = p.evaluate('window.unfoldingPi.state().chainLength')
    p.evaluate(SET, -0.2)
    try:
        p.wait_for_function('(s)=>window.unfoldingPi.state().startIndex >= s - 12', arg=seam, timeout=40000)
    except Exception:
        pass
    p.evaluate(SET, 0)
    p.wait_for_timeout(300)
    try:
        p.wait_for_function("()=>!window.unfoldingPi.shown().codes.includes('?')", timeout=10000)
    except Exception:
        pass
    p.wait_for_timeout(200)
    sh = p.evaluate('window.unfoldingPi.shown()'); st = p.evaluate('window.unfoldingPi.state()')
    lo, codes, marks, seam = sh['lo'], sh['codes'], sh['marks'], sh['fromRemote']
    dev = p.evaluate('window.unfoldingPi.digits()')
    full = '3.' + ref('pi')
    R.check('s1 Naht liegt im gezeigten Fenster', lo < seam < lo + len(codes), (lo, seam, len(codes)))
    exp = full[lo:lo + len(codes)]
    R.check('s1 gezeigte Ziffern = Pi ueber die Naht (keine Luecke, keine Verschiebung)', codes == exp, (codes[:40], exp[:40]))
    R.check('s1 Geraet-Teil stammt aus der Kette', codes[:max(0, seam - lo)] == dev[lo:seam], '')
    left = marks[:max(0, seam - lo)]; right = marks[max(0, seam - lo):]
    R.check('s1 Kennzeichnung: vor der Naht voll (100), ab der Naht gedaempft (70)', bool(left) and set(left) == {100} and bool(right) and set(right) == {70}, (set(left), set(right)))
    R.check('s1 kein Fehler', not st['error'] and not errs, errs[:2])
    c.close()

    # e* Fehlerwege
    def fehler(name, handler, expect=None, drive=None):
        c = new_ctx(br, '{deviceDigits: 300}')
        c.route('**/pi-daten/**', handler)
        p, errs = open_page(c)
        p.wait_for_function('window.unfoldingPi.state().chainLength >= 300', timeout=20000)
        if drive is None: p.evaluate(KICK)
        else: p.evaluate(SET, drive)
        try:
            p.wait_for_function('window.unfoldingPi.state().error', timeout=10000)
        except Exception:
            pass
        p.wait_for_timeout(300)
        s = p.evaluate('window.unfoldingPi.state()')
        cls = p.evaluate("document.querySelector('.stage').className").split()
        msg = s['error'] or ''
        R.check('%s Fehler gemeldet (state.error)' % name, 'Pi-Datei' in msg and (expect is None or expect in msg), msg)
        R.check('%s Fehlerrahmen, Drift gesperrt, console.error' % name,
                'fehler' in cls and p.evaluate("document.getElementById('drift').disabled") and any('Pi-Datei' in e or 'PiFile' in e for e in errs), (cls, errs[:1]))
        c.close()

    def h404(r): r.fulfill(status=404, body='nicht da', content_type='text/plain')
    fehler('e1 404', h404)

    def is_head(r): return r.request.headers.get('range', '') == 'bytes=0-31'
    def h200d(r):
        if is_head(r): r.continue_(); return
        resp = r.fetch()
        r.fulfill(status=200, headers=dict(resp.headers), body=resp.body())
    fehler('e2d 200 statt 206 (Daten, gueltiger Inhalt)', h200d, '200')

    def h200h(r):
        if not is_head(r): r.continue_(); return
        resp = r.fetch()
        r.fulfill(status=200, headers=dict(resp.headers), body=resp.body())
    fehler('e2h 200 statt 206 (Kopf, gueltiger Inhalt)', h200h, '200')

    def hmissing(r):
        rng = r.request.headers.get('range', '')
        parts = rng.replace('bytes=', '').split(',')
        if len(parts) >= 2:
            hh = dict(r.request.headers); hh['range'] = 'bytes=' + ','.join(parts[:-1])
            resp = r.fetch(headers=hh); body = resp.body(); hd = dict(resp.headers)
            ctk = [k for k in hd if k.lower() == 'content-type']
            if not any('boundary' in hd[k] for k in ctk):   # WebKit-Route liefert den Parameter nicht mit: aus dem Rumpf lesen
                for k in ctk: del hd[k]
                hd['content-type'] = 'multipart/byteranges; boundary=' + body.split(b'\r\n', 1)[0][2:].decode()
            r.fulfill(status=206, headers=hd, body=body)
        else:
            r.continue_()
    fehler('e3 Teil fehlt', hmissing, 'Teile statt', drive=-0.8)

    def hshift(r):
        resp = r.fetch(); hd = dict(resp.headers); body = resp.body()
        if 'content-range' in hd:
            hd['content-range'] = re.sub(r'bytes (\d+)-(\d+)/(\d+)', lambda m: 'bytes %d-%d/%s' % (int(m[1]) ^ 1, int(m[2]) ^ 1, m[3]), hd['content-range'])
        else:
            body = re.sub(rb'Content-Range: bytes (\d+)-(\d+)/(\d+)', cr_shift, body, count=1)
        r.fulfill(status=206, headers=hd, body=body)
    fehler('e4 falsches Content-Range', hshift, 'Bereich')

    def htotal(r):
        resp = r.fetch(); body = resp.body(); hd = dict(resp.headers)
        if 'content-range' in hd:
            hd['content-range'] = hd['content-range'].replace('/415254281', '/415254282')
        body = body.replace(b'/415254281', b'/415254282')
        r.fulfill(status=206, headers=hd, body=body)
    fehler('e5 falsche Dateigroesse', htotal, 'Dateigroesse')

    def hdigits(r):
        resp = r.fetch(); body = bytearray(resp.body())
        if body[:4] == b'PI59':   # Kopfantwort bleibt heil
            r.fulfill(status=206, headers=dict(resp.headers), body=bytes(body)); return
        i = body.index(b'\r\n\r\n') + 4 if body[:2] == b'--' else 0
        body[i:i + 6] = b'\xff' * 6   # erster Block der ersten Gruppe >= 10^59
        r.fulfill(status=206, headers=dict(resp.headers), body=bytes(body))
    fehler('e6 Blockwert >= 10^59', hdigits, 'Blockwert')

    def hmagic(r):
        resp = r.fetch(); body = bytearray(resp.body())
        if body[:4] == b'PI59': body[0] = 0x58
        r.fulfill(status=206, headers=dict(resp.headers), body=bytes(body))
    fehler('e8 falscher Kopf (Magic)', hmagic, 'Kopf')

    def hcut(r):
        resp = r.fetch(); body = resp.body()
        r.fulfill(status=206, headers=dict(resp.headers), body=body[:max(1, len(body) // 2)])
    fehler('e7 abgeschnittene Antwort', hcut)

    # m1 / h1 Hoechsttempo (s = -0.8: 1e8 Zeichen/s, 6e8 Stellen in 6 s)
    c = new_ctx(br, '{deviceDigits: 300}'); p, errs = open_page(c)
    p.wait_for_function('window.unfoldingPi.state().chainLength >= 300', timeout=20000)
    p.wait_for_timeout(500)
    p.evaluate(SET, -0.8)
    t0 = time.time()
    samples = p.evaluate(SAMPLER, 9500)
    dt = time.time() - t0
    f = p.evaluate('window.unfoldingPi.file()'); s = p.evaluate('window.unfoldingPi.state()')
    R.check('m1 Block-Cache begrenzt (cached <= maxBlocks)', f['cached'] <= f['maxBlocks'], f)
    R.check('m1 viele Fenster durchlaufen (mehr Bloecke geladen als der Cache fasst)', f['blocksLoaded'] > f['maxBlocks'], f['blocksLoaded'])
    R.check('h1 kein Fehler, Sausen laeuft (Fenster liegen auseinander)', not s['error'] and s['sausen'] and abs(s['step']) > 330 and not errs, (s['error'], s['sausen'], s['step']))
    nfr = len(samples)
    loaded = [x for x in samples if '?' not in x[1]]
    R.check('h1 mindestens 95 %% der Bilder voll geladen (%d von %d)' % (len(loaded), nfr), len(loaded) >= 0.95 * nfr, (len(loaded), nfr))
    los = [x[0] for x in samples]
    R.check('h1 Richtung: Fenster rueckt in jedem Bild vorwaerts', all(b > a for a, b in zip(los, los[1:])), '')
    bad = 0; checked = 0
    for x in loaded[::max(1, len(loaded) // 40)]:
        lo, codes = x[0], x[1]
        if lo < 400: continue
        checked += 1
        if ref_digits(lo - 1, len(codes)) != codes: bad += 1
    R.check('h1 Ehrlichkeit: %d Stichproben-Fenster = Datei an der richtigen Position' % checked, checked >= 20 and bad == 0, (checked, bad))
    rate = f['bytesIn'] / dt / 1024
    rps = f['requests'] / dt
    print('MESSUNG Hoechsttempo: %.1f KB/s, %.1f Requests/s, %d Bilder in %.1f s (%.0f fps), Schritt %.3g Stellen/Bild, Fenster %d Stellen, bis Stelle %.3g' %
          (rate, rps, nfr, dt, nfr / dt, s['step'], len(samples[-1][1]), s['startIndex']), flush=True)
    R.check('h1 Anfragen gebuendelt: hoechstens 4 Requests/s (%.1f), Ranges je Request %.0f' % (rps, f['ranges'] / max(1, f['requests'])), rps <= 4, f)
    R.check('h1 Datenrate unter 100 KB/s (%.1f)' % rate, rate < 100, rate)
    c.close()

    # j1 Takt-Jitter (Zeitstempel um 3 % schwankend; Firefox liefert 16/17 ms): Versatz je Bild bleibt gleich, Bahn bleibt vorausholbar
    c = new_ctx(br, '{deviceDigits: 300}')
    c.add_init_script("(()=>{const r=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=(f)=>r((t)=>f(t+8*Math.sin(t/230)));})();")
    p, errs = open_page(c)
    p.wait_for_function('window.unfoldingPi.state().chainLength >= 300', timeout=20000)
    p.wait_for_timeout(500)
    p.evaluate(SET, -0.8)
    p.wait_for_timeout(600)
    samples = p.evaluate(SAMPLER, 4000)
    f = p.evaluate('window.unfoldingPi.file()')
    diffs = [round(b[0] - a[0]) for a, b in zip(samples, samples[1:])]
    mode = max(set(diffs), key=diffs.count)
    same = sum(1 for x in diffs if abs(x - mode) <= 1e-3 * abs(mode)) / len(diffs)
    R.check('j1 Versatz je Bild gleichbleibend trotz Takt-Jitter (%.0f %% der Bilder auf dem Raster, ausgefallene Bilder ausgenommen)' % (100 * same), same >= 0.7, (mode, same))
    R.check('j1 vorausgeholte Bahn trifft: hoechstens 4 Requests/s (%d in 4,6 s)' % f['requests'], f['requests'] <= 18, f)
    c.close()

    # a1 verlassene Fenster / Platzhalter waehrend des Ladens
    c = new_ctx(br, '{deviceDigits: 300}')

    slow_n = [0]

    def hslow(r):
        slow_n[0] += 1
        if slow_n[0] <= 25: time.sleep(0.8)   # begrenzt: bei Anfrageflut (Mutant) bliebe die Schleife sonst Minuten blockiert
        r.continue_()
    c.route('**/pi-daten/**', hslow)
    p, errs = open_page(c)
    p.wait_for_function('window.unfoldingPi.state().chainLength >= 300', timeout=20000)
    p.evaluate(SET, -0.6)
    samples = p.evaluate(SAMPLER, 5000)
    f = p.evaluate('window.unfoldingPi.file()')
    R.check('a1 verlassene Anfragen abgebrochen (aborted=%d)' % f['aborted'], f['aborted'] > 0, f)
    pend = [x for x in samples if '?' in x[1]]
    R.check('a1 waehrend des Ladens Platzhalter (%d Bilder)' % len(pend), len(pend) > 10, len(pend))
    wrong = 0
    for x in pend:
        for ch, mk in zip(x[1], x[2]):
            if (ch == '?') != (mk == 10): wrong += 1
    R.check('a1 nur Platzhalter, keine falschen Ziffern (fehlende Stelle <-> Marke 10)', wrong == 0, wrong)
    s = p.evaluate('window.unfoldingPi.state()')
    R.check('a1 kein Fehler', not s['error'], s['error'])
    c.close()
    br.close()
R.done()
