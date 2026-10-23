"""Fehlerpfade mit Worker-Attrappe (route auf irrational-worker.js):
 a4  Ausnahme beim Anhaengen (digits mit unlesbarem buf) -> fail(): state.error, Fehlerrahmen, console.error
 t2  Worker meldet 'error' waehrend die Anzeige an der Front wartet -> .warte weg, Fehlerrahmen
BROWSER=...  MUT=notry|swallow (a4) | nopiError (t2) | ident (Kontrolle, bleibt gruen)"""
import os
from playwright.sync_api import sync_playwright
from common import *

MUT = os.environ.get('MUT', ''); B = os.environ.get('BROWSER', 'chromium')
STUB_A4 = "onmessage=(e)=>{ if(e.data.type==='want') setTimeout(()=>postMessage({type:'digits',from:0,buf:12345,total:5}),300); };"
STUB_T2 = "onmessage=(e)=>{ if(e.data.type==='want') setTimeout(()=>postMessage({type:'error',message:'Testfehler'}),2500); };"
M = {'nopiError': ("stage.classList.toggle('warte', !piError && ", "stage.classList.toggle('warte', ")}
R = Res()
with sync_playwright() as pw:
    br = getattr(pw, B).launch()
    # a4
    c = br.new_context(viewport={'width': 1000, 'height': 600})
    c.route('**/irrational-worker.js', lambda r: r.fulfill(body=STUB_A4, content_type='application/javascript'))
    if MUT == 'notry':
        mutate(c, '**/unfoldingPi', ["      try {\n        const have = chain.length - 2;", "      } catch (e) {\n        if (e instanceof RangeError) {"], ["      if (true) {\n        const have = chain.length - 2;", "      } else {\n        if (e instanceof RangeError) {"], 'notry')
    if MUT == 'swallow':
        mutate(c, '**/unfoldingPi', "fail('Stellen nicht verarbeitbar: ' + (e && e.message ? e.message : e));", "", 'swallow')
    p = c.new_page(); errs = []
    p.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    p.goto(URL); p.wait_for_function('window.unfoldingPi')
    p.evaluate(KICK)
    try:
        p.wait_for_function("window.unfoldingPi.state().error", timeout=8000)
    except Exception:
        pass
    p.wait_for_timeout(500)
    s = p.evaluate('window.unfoldingPi.state()')
    cls = p.evaluate("document.querySelector('.stage').className").split()
    R.check('a4 Fehlerzustand gesetzt (state.error)', bool(s['error']), s['error'])
    R.check('a4 Fehlerrahmen sichtbar', 'fehler' in cls, cls)
    R.check('a4 .warte weg, Drift gesperrt', 'warte' not in cls and p.evaluate("document.getElementById('drift').disabled"), cls)
    R.check('a4 console.error gemeldet', any('Stellen nicht verarbeitbar' in e for e in errs), errs[:2])
    c.close()
    # t2
    c = br.new_context(viewport={'width': 1000, 'height': 600})
    c.route('**/irrational-worker.js', lambda r: r.fulfill(body=STUB_T2, content_type='application/javascript'))
    if MUT == 'ident': route_text(c, '**/unfoldingPi', lambda t: t, 'ident')
    elif MUT in M: mutate(c, '**/unfoldingPi', M[MUT][0], M[MUT][1], MUT)
    p = c.new_page()
    p.goto(URL); p.wait_for_function('window.unfoldingPi')
    p.evaluate(KICK); p.wait_for_timeout(1200)
    s = p.evaluate('window.unfoldingPi.state()')
    R.check('t2 Attrappe wartet an der Front (waiting, noch kein Fehler)', s['waiting'] and s['error'] is None, (s['waiting'], s['error']))
    p.evaluate(KICK)
    p.wait_for_function("window.unfoldingPi.state().error", timeout=15000)
    p.wait_for_timeout(500)
    cls = p.evaluate("document.querySelector('.stage').className")
    s = p.evaluate('window.unfoldingPi.state()')
    R.check('t2 Fehlerrahmen gesetzt', 'fehler' in cls.split(), cls)
    R.check('t2 .warte nach fail() entfernt und bleibt weg', 'warte' not in cls.split() and not s['waiting'], cls)
    br.close()
R.done()
