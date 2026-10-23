"""Ohne WebAssembly (z. B. Safari Lockdown Mode): Rueckfall auf BigInt, gelber Hinweisrahmen + console.warn, Drift laeuft weiter.
Chromium: >= TARGET Stellen. Firefox/WebKit: laufen bei ca. 96000 Stellen in die BigInt-Grenze; das ist eine Rechenwerk-Grenze (engine):
kein Fehler, kein Text auf der Seite, console.warn, die Anzeige bleibt stehen.
BROWSER=chromium|firefox|webkit [TARGET=100000]   MUT=norfall|nonotice|nowarn|nohint (Mutanten, muessen rot werden)"""
import os, time
from playwright.sync_api import sync_playwright
from common import *

B = os.environ.get('BROWSER', 'chromium'); TARGET = int(os.environ.get('TARGET', '100000' if B == 'chromium' else '90000')); LIMIT = float(os.environ.get('LIMIT', '300'))  # BigInt-Grenze Firefox/WebKit: 96000 Stellen
MUT = os.environ.get('MUT', '')
NOWASM = 'self.WebAssembly=undefined;'
R = Res()
with sync_playwright() as pw:
    br = getattr(pw, B).launch(); c = br.new_context(viewport={'width': 1000, 'height': 600})
    WM = {'norfall': ("const toBigInt = (why) => {", "const toBigInt = (why) => { return;"), 'nonotice': ("postMessage({ type: 'notice', message });", "")}.get(MUT)
    prepend_worker(c, NOWASM, WM)
    if MUT == 'nowarn': mutate(c, '**/unfoldingPi', "console.warn('[unfoldingPi] ' + message);", "", 'nowarn')
    if MUT == 'nohint': mutate(c, '**/unfoldingPi', "stage.classList.add('hinweis');", "", 'nohint')
    p = c.new_page(); warns = []; errs = []
    p.on('console', lambda m: warns.append(m.text) if m.type == 'warning' else None)
    p.on('pageerror', lambda e: errs.append(str(e)))
    p.goto(URL); p.wait_for_function('window.unfoldingPi')
    p.evaluate(KICK)
    t0 = time.time(); n = 0
    while time.time() - t0 < LIMIT:
        s = p.evaluate('window.unfoldingPi.state()'); n = s['chainLength'] - 2
        if s['error'] or s['limit'] or n >= TARGET: break
        time.sleep(0.5)
    print(B, 'Stellen', n, 'limit', s['limit'], 'Fehler', s['error'], 'nach %.0fs' % (time.time() - t0), flush=True)
    R.check('%s: >= %d Stellen ohne WebAssembly, kein Fehler' % (B, TARGET), n >= TARGET and s['error'] is None, (n, s['error']))
    if n >= 100000:
        ch = p.evaluate('window.unfoldingPi.digits()')
        R.check('Stellen 99991-100000 = 5493624646', ch[99991 + 1:100000 + 2] == '5493624646', ch[99991 + 1:100000 + 2])
    st = p.evaluate('window.unfoldingPi.state()')
    cls = p.evaluate("document.querySelector('.stage').className").split()
    R.check('kein Fehlerrahmen, kein Fehlerzustand', 'fehler' not in cls and st['error'] is None, (cls, st['error']))
    R.check('Hinweis sichtbar (Klasse hinweis + state.notice)', 'hinweis' in cls and bool(st.get('notice')), (cls, st.get('notice')))
    R.check('console.warn gemeldet', any(w.startswith('[unfoldingPi]') and 'WebAssembly' in w for w in warns), warns[:2])
    R.check('Drift nicht gesperrt', not p.evaluate("document.getElementById('drift').disabled"))
    if B != 'chromium' and os.environ.get('GRENZE', '1') == '1':
        try:
            p.wait_for_function("window.unfoldingPi.state().limit", timeout=int(LIMIT * 1000))
        except Exception:
            pass
        st = p.evaluate('window.unfoldingPi.state()')
        R.check('Grenze ist engine, kein Fehler', bool(st['limit']) and st['limit']['kind'] == 'engine' and st['error'] is None, (st['limit'], st['error']))
        R.check('Grenze: kein Text auf der Stage, kein Hinweis-Element, Drift nicht gesperrt', p.evaluate("document.getElementById('stage').innerText").strip() == '' and p.evaluate("document.getElementById('limit-hint')") is None and not p.evaluate("document.getElementById('drift').disabled"))
        R.check('Grenze: console.warn "engine limit"', any('engine limit' in w for w in warns), warns[-2:])
        R.check('beim Ende >= %d Stellen geliefert' % TARGET, st['chainLength'] - 2 >= TARGET, st['chainLength'] - 2)
    br.close()
R.done()
