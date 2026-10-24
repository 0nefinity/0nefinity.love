"""Neustart nach Fehler: der Konstantenwechsel setzt Fehler- und Grenzzustand komplett zurueck.
 r1  ?c=foo (Fehler beim Laden) -> Wechsel auf e: Kette waechst, kein Fehlerrahmen, Stellen beginnen mit 2.71828
 r2  Fehler mitten im Lauf (erster Worker ist eine Attrappe, die 'error' meldet) -> Wechsel auf e: laeuft wieder
BROWSER=...  MUT=nopiError_reset | nodrift_reset | nofehlerclass_reset (je ein Reset in startWorker entfernt) | ident"""
import os, re
from playwright.sync_api import sync_playwright
from common import *

MUT = os.environ.get('MUT', ''); B = os.environ.get('BROWSER', 'chromium')
STUB_ERR = "onmessage=(e)=>{ if(e.data.type==='want') setTimeout(()=>postMessage({type:'error',message:'Testfehler'}),300); };"
M = {'nopiError_reset': ("      piError = null;\n      driftEl.disabled = false;", "      driftEl.disabled = false;"),
     'nodrift_reset': ("      driftEl.disabled = false;\n", ""),
     'nofehlerclass_reset': ("'warte', 'hinweis', 'fehler');\n      const old", "'warte', 'hinweis');\n      const old")}
PAGE_RE = re.compile(r'/unfoldingPi(\?.*)?$')  # glob '**/unfoldingPi' greift nicht auf ?c=foo
R = Res()


def switch_to_e(p):
    p.locator('.ctrl-row[data-key="const"] .ctrl-select-trigger').click()
    p.locator('.ctrl-select-option', has_text=re.compile(r'^\s*e\s*$')).first.click()


def check_running(p, name):
    try:
        p.wait_for_function("window.unfoldingPi.state().constant === 'e' && window.unfoldingPi.state().chainLength > 20", timeout=20000)
    except Exception:
        pass
    p.wait_for_timeout(500)
    s = p.evaluate('window.unfoldingPi.state()')
    cls = p.evaluate("document.querySelector('.stage').className").split()
    ch = p.evaluate('window.unfoldingPi.digits()')
    R.check(name + ' kein Fehlerzustand', s['error'] is None, s['error'])
    R.check(name + ' kein Fehlerrahmen', 'fehler' not in cls, cls)
    R.check(name + ' Drift frei', not p.evaluate("document.getElementById('drift').disabled"))
    R.check(name + ' Stellen beginnen mit 2.71828', ch.startswith('2.71828'), ch[:12])
    n1 = s['chainLength']
    p.evaluate(KICK)
    try:
        p.wait_for_function('window.unfoldingPi.state().chainLength > %d' % n1, timeout=30000)
    except Exception:
        pass
    n2 = p.evaluate('window.unfoldingPi.state().chainLength')
    R.check(name + ' Kette waechst', n2 > n1, (n1, n2))


def ctx_for(br):
    c = br.new_context(viewport={'width': 1000, 'height': 600})
    if MUT == 'ident': route_text(c, PAGE_RE, lambda t: t, 'ident')
    elif MUT in M: mutate(c, PAGE_RE, M[MUT][0], M[MUT][1], MUT)
    return c


with sync_playwright() as pw:
    br = getattr(pw, B).launch()
    # r1
    c = ctx_for(br); p = c.new_page()
    p.goto(URL + '?c=foo'); p.wait_for_function('window.unfoldingPi')
    s = p.evaluate('window.unfoldingPi.state()')
    cls = p.evaluate("document.querySelector('.stage').className").split()
    R.check('r1 ?c=foo zeigt Fehler', bool(s['error']) and 'fehler' in cls, (s['error'], cls))
    switch_to_e(p)
    check_running(p, 'r1')
    c.close()
    # r2
    c = ctx_for(br)
    cnt = {'n': 0}
    def h(r):
        cnt['n'] += 1
        if cnt['n'] == 1: r.fulfill(body=STUB_ERR, content_type='application/javascript')
        else: r.continue_()
    c.route('**/irrational-worker.js', h)
    p = c.new_page()
    p.goto(URL); p.wait_for_function('window.unfoldingPi')
    p.wait_for_function('window.unfoldingPi.state().error', timeout=15000)
    cls = p.evaluate("document.querySelector('.stage').className").split()
    R.check('r2 Fehler mitten im Lauf sichtbar', 'fehler' in cls, cls)
    switch_to_e(p)
    check_running(p, 'r2')
    br.close()
R.done()
