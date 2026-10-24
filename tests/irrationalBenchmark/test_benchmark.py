"""irrational-benchmark: AC 10 gegen die Live-Seite (URL=/HOST= ueberschreiben).
Testhaken nur per add_init_script (window.irrationalBenchmarkTest), nie ueber die URL.
Mutanten (MUT=...) muessen rot werden (Exit 1); Exit 3 = Muster nicht gefunden:
  nostop      Stopp beendet den Lauf nicht
  swapcause   Grenzursache device/engine vertauscht
  errorlimit  Programmfehler wird als Grenze gezeigt
  nomark      Marken fehlen
  nocurve     Kurve bekommt keine Punkte
  menu        (kein Seitenmutant) nicht vorhanden
Aufruf: BROWSER=chromium|firefox|webkit [MUT=...] python3 tests/irrationalBenchmark/test_benchmark.py"""
import os, sys, time, urllib.request
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'unfoldingPi'))
from playwright.sync_api import sync_playwright
from common import Res, mutate

HOST = os.environ.get('HOST', 'https://dev.0nefinity.love')
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


def page(br, init=None):
    c = br.new_context(viewport={'width': 1000, 'height': 800})
    if init:
        c.add_init_script(init)
    if MUT:
        mutate(c, '**/irrational-benchmark', *MUTANTS[MUT], label=MUT)
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
    # Grenzen und Fehler
    run_limit(br, 'device', 'window.irrationalBenchmarkTest={failReserve:3};')
    run_limit(br, 'engine', 'window.irrationalBenchmarkTest={maxPages:262};')
    run_error(br)
    # Navigationsquelle
    html = urllib.request.urlopen(HOST + '/includes/something-in-the-body.html').read().decode()
    R.check('Navigationsquelle enthaelt den Link', 'href="/irrational-benchmark.html"' in html, None)
    br.close()
R.done()
