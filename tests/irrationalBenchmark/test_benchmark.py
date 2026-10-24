"""irrational-benchmark: AC 10 gegen die Live-Seite (URL=/HOST= ueberschreiben).
Testhaken nur per add_init_script (window.irrationalBenchmarkTest), nie ueber die URL.
Mutanten (MUT=...) muessen rot werden (Exit 1); Exit 3 = Muster nicht gefunden:
  nostop      Stopp beendet den Lauf nicht
  swapcause   Grenzursache device/engine vertauscht
  errorlimit  Programmfehler wird als Grenze gezeigt
  nomark      Marken fehlen
  nocurve     Kurve bekommt keine Punkte
  tailonly    Ansicht bekommt nur den Tail statt aller Stellen
  nocouple    Konstantenwechsel koppelt die Ansicht nicht um
  alliter     Renderer der Ansicht laeuft ueber alle Stellen statt ueber das Fenster (Modul-Mutant)
  nospread    Linienbeschriftungen weichen einander nicht aus
  noheading   Ueberschrift fehlt
  noaxistitle Achsentitel "Stellen" fehlt
  noticks     Zeit-Ticks fehlen
  labelleft   Label steht links vom Endpunkt seiner Linie
  noleader    ausgewichenes Label ohne Fuehrungslinie
Aufruf: BROWSER=chromium|firefox|webkit [MUT=...] python3 tests/irrationalBenchmark/test_benchmark.py"""
import os, sys, time, urllib.request
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'unfoldingPi'))
from playwright.sync_api import sync_playwright
from common import HOST, Res, mutate, ref

URL = os.environ.get('URL', HOST + '/irrational-benchmark')
B = os.environ.get('BROWSER', 'chromium')
MUT = os.environ.get('MUT', '')
R = Res()

MUTANTS = {
    'nostop': ("finish('stopped');", "void 0;"),
    'swapcause': ("lim.kind === 'device' ?", "lim.kind !== 'device' ?"),
    'errorlimit': ("result.error = e.message; finish('error'); } },",
                   "result.limit = { kind: 'device', reason: e.message, digits: result.digits }; finish('limit'); } },"),
    'nomark': ("if (!result.marks.some(", "if (false && !result.marks.some("),
    'nocurve': ("result.points.push([t, total]);", ""),
    'tailonly': ("view.appendDigits(u8, offset); return true;", "view.appendDigits(u8.subarray(Math.max(0, u8.length - 64)), offset + Math.max(0, u8.length - 64)); return true;"),
    'nospread': ("const LABEL_GAP = 13;", "const LABEL_GAP = 0;"),
    'labelleft': ("const x = Math.max(ex + 4, Math.min(ex + 6, w - 2 - tw));", "const x = ex - tw - 6;"),
    'noleader': ("const leader = Math.abs(e.y - e.ey) > 3;", "const leader = false;"),
    'noheading': ("<h1>irrational benchmark</h1>", ""),
    'noaxistitle': ("put('Stellen', 2,", "put('', 2,"),
    'noticks': ("for (let v = step; v <= tMax; v += step) {", "for (let v = step; v <= 0; v += step) {"),
    'nocouple': ("      coupleView(id);\n      result = load(id);", "      result = load(id);"),
}
MODULE_MUTANTS = {
    'alliter': ("const iLo = Math.max(0, iLinLo - 1 - K);", "const iLo = 0;"),
}


def state(p):
    return p.evaluate('window.irrationalBenchmark.state()')


def wait_for(p, cond, timeout):
    """True, sobald cond(state) gilt; False nach timeout Sekunden (kein Abbruch, damit Mutanten rot statt haengend enden)."""
    t0 = time.time()
    while time.time() - t0 < timeout:
        if cond(state(p)):
            return True
        time.sleep(0.2)
    return False


def page(br, init=None, width=1000):
    c = br.new_context(viewport={'width': width, 'height': 800})
    if init:
        c.add_init_script(init)
    if MUT in MUTANTS:
        mutate(c, '**/irrational-benchmark', *MUTANTS[MUT], label=MUT)
    if MUT in MODULE_MUTANTS:
        mutate(c, '**/tools/unfolding-view.js', *MODULE_MUTANTS[MUT], label=MUT)
    reqs, errs = [], []
    c.on('request', lambda r: reqs.append(r.url))
    p = c.new_page()
    p.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    p.on('pageerror', lambda e: errs.append(str(e)))
    p.goto(URL)
    p.wait_for_function('window.irrationalBenchmark')
    return c, p, reqs, errs


def vis(p, sel):
    return p.evaluate("(s)=>{const e=document.querySelector(s); return !!e && !e.hidden && getComputedStyle(e).display!=='none'}", sel)


def text(p, sel):
    return p.evaluate("(s)=>document.querySelector(s).innerText", sel)


def run_limit(br, kind, init):
    c, p, reqs, errs = page(br, init)
    p.click('#go')
    ok = wait_for(p, lambda s: s['end'] != 'running', 150)
    s = state(p)
    body = text(p, '#limit') if vis(p, '#limit') else ''
    other = 'Browser' if kind == 'device' else 'Speicher'
    want = 'Speicher' if kind == 'device' else 'Browser'
    R.check('%s: Lauf endet an einer Grenze' % kind, ok and s['end'] == 'limit', (s['end'], s['error']))
    R.check('%s: Ursache %s' % (kind, kind), s['limit'] and s['limit']['kind'] == kind, s['limit'])
    R.check('%s: Anzeige nennt die richtige Ursache' % kind, want in body and other not in body, body)
    R.check('%s: Stellenzahl der Grenze == laufende Zahl, > 0' % kind, s['limit'] and s['limit']['digits'] == s['digits'] > 0, (s['limit'], s['digits']))
    R.check('%s: kein roter Fehler' % kind, not vis(p, '#error') and s['error'] is None, s['error'])
    d = s['digits']
    time.sleep(1.5)
    R.check('%s: Zahl steht danach' % kind, state(p)['digits'] == d, d)
    c.close()


def run_error(br):
    c, p, reqs, errs = page(br, 'window.irrationalBenchmarkTest={failOther:true};')
    p.click('#go')
    wait_for(p, lambda s: s['end'] != 'running', 60)
    s = state(p)
    R.check('error: Fehlerzustand mit Meldung', s['end'] == 'error' and 'injected' in (s['error'] or ''), (s['end'], s['error']))
    R.check('error: roter Fehler sichtbar', vis(p, '#error') and 'injected' in text(p, '#error'), None)
    col = p.evaluate("getComputedStyle(document.getElementById('error')).color")
    R.check('error: Farbe rot', col.startswith('rgb(229, 72, 77)'), col)
    R.check('error: keine Grenze gezeigt', s['limit'] is None and not vis(p, '#limit'), s['limit'])
    R.check('error: console.error gemeldet', any('injected' in e for e in errs), errs[:1])
    c.close()


DRIFT_END = "(()=>{const d=document.getElementById('drift'); d.value=-1; d.dispatchEvent(new Event('input',{bubbles:true}));})()"
DRIFT_HOME = "(()=>{const d=document.getElementById('drift'); d.value=1; d.dispatchEvent(new Event('input',{bubbles:true}));})()"
DRIFT_STILL = "(()=>{const d=document.getElementById('drift'); d.value=0; d.dispatchEvent(new Event('input',{bubbles:true}));})()"


def run_until(p, n):
    p.click('#go')
    ok = wait_for(p, lambda s: s['digits'] >= n, 120)
    p.click('#go')
    return ok, state(p)


def run_view(br):
    c, p, reqs, errs = page(br)
    ok, s = run_until(p, 10000)
    n = s['digits']
    R.check('view: Lauf bis >= 10000 Stellen, gestoppt', ok and s['end'] == 'stopped', (s['end'], n))
    R.check('view: Ansicht haelt genau die berechneten Stellen', s['view'] and s['view']['digits'] == n, (s['view'], n))
    chain = p.evaluate('window.irrationalBenchmark.viewDigits()')
    dec = chain[2:]
    pi = ref('pi')
    R.check('view: Kette beginnt mit 3.', chain.startswith('3.'), chain[:4])
    R.check('view: Laenge der Kette == Stellenzahl + 2', len(chain) == n + 2, (len(chain), n))
    pos = [0, n // 2, n - 1]
    R.check('view: Anfang, Mitte, letzte Stelle == bekannte Stellen von pi',
            all(dec[i] == pi[i] for i in pos) and dec[:50] == pi[:50] and dec[n // 2 - 20:n // 2 + 20] == pi[n // 2 - 20:n // 2 + 20] and dec[n - 50:] == pi[n - 50:n],
            [(i, dec[i], pi[i]) for i in pos])
    R.check('view: alle Stellen == pi', dec == pi[:n], None)
    R.check('view: Symbol pi', s['view']['symbol'] == 'π', s['view']['symbol'])
    # bis ans Ende ziehen
    p.evaluate(DRIFT_END)
    reached = wait_for(p, lambda s: s['view']['endIndex'] >= n - 0.5, 60)
    p.evaluate(DRIFT_STILL)
    time.sleep(0.5)
    v = state(p)['view']
    R.check('view: Ziehen erreicht die letzte berechnete Stelle', reached, v)
    time.sleep(1)
    v2 = state(p)['view']
    R.check('view: ueber die letzte Stelle hinaus geht es nicht (endIndex <= %d)' % (n + 1), v2['endIndex'] <= n + 1 + 1e-6 and v2['digits'] == n, v2)
    p.evaluate(DRIFT_END)
    time.sleep(1.5)
    v3 = state(p)
    R.check('view: weiter Richtung Ende ziehen rechnet nichts nach, Kette waechst nicht',
            v3['view']['endIndex'] <= n + 1 + 1e-6 and v3['view']['digits'] == n and v3['digits'] == n and v3['end'] == 'stopped', v3['view'])
    p.evaluate(DRIFT_STILL)
    R.check('view: am Ende ist die Ansicht gezeichnet', p.evaluate("(()=>{const c=document.getElementById('digits'); const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data; for(let i=3;i<d.length;i+=4) if(d[i]) return true; return false;})()"), None)
    # zurueck an den Anfang
    p.evaluate(DRIFT_HOME)
    R.check('view: Ziehen zurueck erreicht den Anfang', wait_for(p, lambda s: s['view']['startIndex'] < 1, 60), state(p)['view'])
    p.evaluate(DRIFT_STILL)
    # Konstantenwechsel
    p.click('#consts button[data-id="e"]')
    s = state(p)
    chain_e = p.evaluate('window.irrationalBenchmark.viewDigits()')
    R.check('view: Wechsel auf e koppelt Symbol und Kette um', s['view']['symbol'] == 'e' and chain_e == '2.' and s['view']['digits'] == 0, (s['view'], chain_e[:6]))
    ok, s = run_until(p, 3000)
    chain_e = p.evaluate('window.irrationalBenchmark.viewDigits()')
    ee = ref('e')
    m = s['digits']
    R.check('view: e-Lauf: Ansicht zeigt die Stellen von e, nicht die von pi', ok and chain_e[:2] == '2.' and chain_e[2:2 + len(ee)] == ee[:m] and len(chain_e) == m + 2 and chain_e[2:20] != pi[:18] and s['view']['digits'] == m, (m, chain_e[:12]))
    R.check('view: keine Konsolenfehler', not errs, errs[:2])
    bad = [u for u in reqs if not (u.startswith(HOST + '/') or u.startswith('data:') or u.startswith('blob:'))]
    R.check('view: keine fremde Netzanfrage', not bad, bad[:3])
    c.close()


def seed(ids):
    import json
    pts = [[50 * (i + 1), int(10 ** (1 + i / 2.0))] for i in range(1, 9)]
    js = ''
    for i in ids:
        r = {'constant': i, 'algorithm': 'x', 'digits': pts[-1][1], 'startedAt': '2026-01-01T00:00:00Z', 'elapsedMs': pts[-1][0], 'marks': [], 'points': pts, 'tail': '', 'tailFrom': 0, 'end': 'stopped', 'limit': None, 'error': None}
        js += "localStorage.setItem('irrationalBenchmark.v1.%s', %s);" % (i, json.dumps(json.dumps(r)))
    return js


def chart_checks(p, tag, symbols, width):
    L = p.evaluate('window.irrationalBenchmark.labels()')
    W, H = L['width'], L['height']
    inside = lambda b: b['x0'] >= 0 and b['y0'] >= 0 and b['x1'] <= W and b['y1'] <= H
    R.check('%s: Achsentitel Stellen und Zeit' % tag, sorted(a['text'] for a in L['axes']) == ['Stellen', 'Zeit'], L['axes'])
    xt = [t for t in L['ticks'] if t['axis'] == 'x']
    yt = [t for t in L['ticks'] if t['axis'] == 'y']
    R.check('%s: Zeit-Ticks vorhanden, Werte und Lage steigen' % tag, len(xt) >= 1 and all(a['value'] < b['value'] and a['x'] < b['x'] for a, b in zip(xt, xt[1:])), xt)
    R.check('%s: Stellen-Ticks vorhanden (<= 4), Werte steigen, Lage faellt' % tag, 1 <= len(yt) <= 4 and all(a['value'] < b['value'] and a['y'] > b['y'] for a, b in zip(yt, yt[1:])), yt)
    R.check('%s: Tick-Text kurz' % tag, all(len(t['text']) <= 7 for t in L['ticks']), [t['text'] for t in L['ticks']])
    R.check('%s: Ticks liegen in der Flaeche (%d px)' % (tag, W), all(inside(t['box']) and 0 < t['x'] <= W and 0 < t['y'] < H for t in L['ticks']), None)
    got = sorted(l['text'] for l in L['lines'])
    R.check('%s: je Linie ein Label mit Symbol %s' % (tag, symbols), got == sorted(symbols), got)
    R.check('%s: Label rechts vom Endpunkt der eigenen Linie' % tag, all(l['box']['x0'] >= l['endX'] + 3 for l in L['lines']), [(l['text'], round(l['box']['x0']), round(l['endX'])) for l in L['lines']])
    R.check('%s: Label auf Hoehe des Endpunkts oder mit Fuehrungslinie' % tag, all(abs(l['y'] - l['endY']) <= 3 or l['leader'] for l in L['lines']), [(l['text'], round(l['y']), round(l['endY']), l['leader']) for l in L['lines']])
    allb = [(l['text'], l['box']) for l in L['lines']] + [(a['text'], a['box']) for a in L['axes']] + [(t['text'], t['box']) for t in L['ticks']]
    clash = [(a[0], b[0]) for i, a in enumerate(allb) for b in allb[i + 1:] if a[1]['x0'] < b[1]['x1'] and b[1]['x0'] < a[1]['x1'] and a[1]['y0'] < b[1]['y1'] and b[1]['y0'] < a[1]['y1']]
    R.check('%s: keine zwei Beschriftungen ueberlappen' % tag, not clash, clash)
    R.check('%s: alle Beschriftungen innerhalb des Canvas' % tag, all(inside(b) for _, b in allb), None)
    sw = p.evaluate('document.documentElement.scrollWidth')
    R.check('%s: kein Horizontal-Scroll' % tag, sw <= width, sw)


def run_chart(br):
    for width in (1000, 360):
        c, p, reqs, errs = page(br, seed(['pi', 'e']), width)
        chart_checks(p, 'chart seed %d px' % width, ['π', 'e'], width)
        c.close()
    c, p, reqs, errs = page(br, seed(['pi', 'e', 'ln2', 'sqrt2', 'phi']), 360)
    chart_checks(p, 'chart 5 Linien 360 px', ['π', 'e', 'ln 2', '√2', 'φ'], 360)
    c.close()
    c, p, reqs, errs = page(br, None, 360)
    run_until(p, 5000)
    p.click('#consts button[data-id="e"]')
    run_until(p, 5000)
    chart_checks(p, 'chart Lauf pi und e 360 px', ['π', 'e'], 360)
    R.check('chart: keine Konsolenfehler', not errs, errs[:2])
    c.close()


def run_heading(br):
    c, p, reqs, errs = page(br)
    h = p.evaluate("(()=>{const h=document.querySelector('h1'); return h?{t:h.innerText,f:getComputedStyle(h).fontFamily,s:getComputedStyle(h).fontSize,v:h.getBoundingClientRect().height>0}:null})()")
    p.goto(HOST + '/where-is-01')
    ref_h = p.evaluate("(()=>{const h=document.querySelector('h1'); return {f:getComputedStyle(h).fontFamily,s:getComputedStyle(h).fontSize}})()")
    R.check('Ueberschrift "irrational benchmark" sichtbar', h is not None and h['t'].strip() == 'irrational benchmark' and h['v'], h)
    R.check('Ueberschrift im meta.css-Stil (Schriftfamilie wie where-is-01, nicht groesser als dort)', h is not None and h['f'] == ref_h['f'] and float(h['s'][:-2]) <= float(ref_h['s'][:-2]), (h, ref_h))
    p.goto(HOST + '/unfoldingPi')
    p.wait_for_timeout(500)
    n = p.evaluate("[...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(e=>e.getBoundingClientRect().height>0&&e.innerText.trim()).length")
    R.check('unfoldingPi.html ohne sichtbare Ueberschrift', n == 0, n)
    c.close()


RENDER_PATCH = """(() => {
  if (window.__render) return;
  const cr = CanvasRenderingContext2D.prototype.clearRect, di = CanvasRenderingContext2D.prototype.drawImage;
  window.__render = { start: 0, end: 0, n: 0 };
  CanvasRenderingContext2D.prototype.clearRect = function (...a) { if (this.canvas.id === 'digits') { window.__render.start = performance.now(); window.__render.n = 0; } return cr.apply(this, a); };
  CanvasRenderingContext2D.prototype.drawImage = function (...a) { const r = di.apply(this, a); if (this.canvas.id === 'digits') { window.__render.end = performance.now(); window.__render.n++; } return r; };
})()"""
RENDER_TIME = """async () => {
  const v = document.getElementById('drift');
  const times = [];
  for (let k = 0; k < 15; k++) {
    v.value = -0.03; v.dispatchEvent(new Event('input', { bubbles: true }));   // Drift: jedes Bild neu
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    times.push(window.__render.end - window.__render.start);
  }
  v.value = 0; v.dispatchEvent(new Event('input', { bubbles: true }));
  times.sort((a, b) => a - b);
  return { median: times[Math.floor(times.length / 2)], n: window.__render.n };
}"""


def frame_cost(p):
    p.evaluate(RENDER_PATCH)
    p.evaluate(DRIFT_HOME)
    wait_for(p, lambda s: s['view']['startIndex'] < 1, 60)
    n = state(p)['view']['digits']
    p.evaluate("(()=>{const d=document.getElementById('drift'); d.value=-0.5; d.dispatchEvent(new Event('input',{bubbles:true}));})()")
    mid = wait_for(p, lambda s: s['view']['startIndex'] >= n * 0.4, 120)
    p.evaluate(DRIFT_STILL)
    time.sleep(0.3)
    out = p.evaluate(RENDER_TIME)
    out['mid'] = mid
    return out


def run_frames(br):
    c, p, reqs, errs = page(br)
    ok, s = run_until(p, 10000)
    small = frame_cost(p)
    n_small = state(p)['view']['digits']
    p.click('#go')
    ok2 = wait_for(p, lambda s: s['digits'] >= 1000000, 240)
    p.click('#go')
    s = state(p)
    R.check('frames: 1e6 Stellen gerechnet', ok and ok2 and s['view']['digits'] >= 1000000, (s['digits'], s['view']))
    big = frame_cost(p)
    R.check('frames: beide Messungen in der Mitte der Kette', small['mid'] and big['mid'], (small, big))
    R.check('frames: gleich viele Glyphen je Fenster (Fenster-Rendering), %d -> %d' % (small['n'], big['n']), big['n'] <= 3 * max(1, small['n']), (small, big))
    R.check('frames: Renderzeit 1e6 < 3 x Renderzeit 1e4 (+2 ms Rauschen): %.2f ms -> %.2f ms' % (small['median'], big['median']),
            big['median'] <= 3 * small['median'] + 2, (small, big))
    R.check('frames: Renderzeit 1e6 unter einem Bild (16 ms)', big['median'] < 16, big)
    R.check('frames: keine Konsolenfehler', not errs, errs[:2])
    c.close()


with sync_playwright() as pw:
    br = getattr(pw, B).launch()
    # Normalfall
    c, p, reqs, errs = page(br)
    s = state(p)
    R.check('Start-Zustand: idle, 0 Stellen, Knopf Start', s['end'] == 'idle' and s['digits'] == 0 and text(p, '#go') == 'Start', s['end'])
    time.sleep(1)
    R.check('ohne Start rechnet nichts', state(p)['digits'] == 0, None)
    p.click('#go')
    R.check('laeuft nach Knopf', wait_for(p, lambda s: s['running'] and s['digits'] > 0, 30), state(p)['end'])
    d1 = state(p)['digits']
    R.check('laufende Zahl steigt', wait_for(p, lambda s: s['digits'] > d1, 30), (d1, state(p)['digits']))
    R.check('Knopf zeigt Stopp', text(p, '#go') == 'Stopp', None)
    R.check('Marke 10^5 mit Zeit', wait_for(p, lambda s: any(m['exp'] == 5 and m['ms'] > 0 for m in s['marks']), 90), state(p)['marks'])
    R.check('Marke erscheint in der Anzeige', '10⁵' in text(p, '#marks') and 's' in text(p, '#marks'), text(p, '#marks'))
    R.check('Kurve hat >= 2 Punkte', len(state(p)['points']) >= 2, len(state(p)['points']))
    mono = all(a[0] <= b[0] and a[1] < b[1] for a, b in zip(state(p)['points'], state(p)['points'][1:]))
    R.check('Kurvenpunkte steigen in Zeit und Stellen', mono, None)
    R.check('Kurve ist gezeichnet', p.evaluate("(()=>{const c=document.getElementById('curve'); const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data; for(let i=3;i<d.length;i+=4) if(d[i]) return true; return false;})()"), None)
    p.click('#go')
    s1 = state(p)
    R.check('Stopp: Zustand stopped', s1['end'] == 'stopped' and not s1['running'], s1['end'])
    R.check('Stopp: Knopf zeigt Start', text(p, '#go') == 'Start', None)
    t1 = text(p, '#time'); n1 = text(p, '#count')
    time.sleep(3)
    s2 = state(p)
    R.check('Stopp friert 3 s ein (Zahl, Zeit, Marken, Punkte)',
            s2['digits'] == s1['digits'] and s2['elapsedMs'] == s1['elapsedMs'] and len(s2['marks']) == len(s1['marks']) and len(s2['points']) == len(s1['points'])
            and text(p, '#time') == t1 and text(p, '#count') == n1, (s1['digits'], s2['digits']))
    R.check('Ergebnis haelt die letzten Stellen vor', len(s2['tail']) > 0 and s2['tail'].isdigit(), s2['tail'][:20])
    body = p.evaluate('document.body.innerText').lower()
    R.check('kein Ungueltig-Zustand', 'ungültig' not in body and 'invalid' not in body and s2['end'] == 'stopped' and not vis(p, '#error'), None)
    bad = [u for u in reqs if not (u.startswith(HOST + '/') or u.startswith('data:') or u.startswith('blob:'))]
    R.check('keine Netzanfrage ausser same-origin (%d Anfragen)' % len(reqs), not bad, bad[:3])
    R.check('keine Konsolenfehler im Normalfall', not errs, errs[:2])
    # Neustart nach Stopp
    p.click('#go')
    R.check('Neustart nach Stopp rechnet neu', wait_for(p, lambda s: s['running'] and s['digits'] > 0 and s['digits'] < s1['digits'] + 1 and len(s['marks']) == 0, 30), state(p)['end'])
    p.click('#go')
    c.close()
    run_heading(br)
    run_chart(br)
    run_view(br)
    run_frames(br)
    # Grenzen und Fehler
    run_limit(br, 'device', 'window.irrationalBenchmarkTest={failReserve:3};')
    run_limit(br, 'engine', 'window.irrationalBenchmarkTest={maxPages:262};')
    run_error(br)
    # Navigationsquelle
    html = urllib.request.urlopen(HOST + '/includes/something-in-the-body.html').read().decode()
    R.check('Navigationsquelle enthaelt den Link', 'href="/irrational-benchmark.html"' in html, None)
    br.close()
R.done()
