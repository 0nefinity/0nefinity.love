"""Grosse Ketten in jedem Browser: >= TARGET Stellen korrekt, kein Fehler, Kette waechst weiter.
BROWSER=chromium|firefox|webkit [TARGET=300000]   MUT=cap (Testhaken failReserve:3 simuliert Speichermangel, Test muss rot werden)"""
import os, time
from playwright.sync_api import sync_playwright
from common import *

B = os.environ.get('BROWSER', 'firefox'); TARGET = int(os.environ.get('TARGET', '300000'))
LIMIT = float(os.environ.get('LIMIT', '300')); GROWTH_LIMIT = float(os.environ.get('GROWTH_LIMIT', '300'))
R = Res()
with sync_playwright() as pw:
    br = getattr(pw, B).launch()
    c = br.new_context(viewport={'width': 1000, 'height': 600})
    if os.environ.get('MUT') == 'cap':
        c.add_init_script('window.unfoldingPiTest={failReserve:3};')
    p = c.new_page(); errs = []
    p.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    p.on('pageerror', lambda e: errs.append(str(e)))
    p.goto(URL); p.wait_for_function('window.unfoldingPi')
    p.evaluate(KICK)
    t0 = time.time(); reached = None; err = None
    while time.time() - t0 < LIMIT:
        s = p.evaluate('window.unfoldingPi.state()'); n = s['chainLength'] - 2
        if s['error'] or s['limit']: err = s['error'] or s['limit']; break
        if n >= TARGET: reached = time.time() - t0; break
        time.sleep(0.5)
    print(B, 'Stellen', p.evaluate('window.unfoldingPi.state().chainLength') - 2, 'Fehler/Limit:', err, flush=True)
    R.check('%s: %d Stellen ohne Fehler/Limit' % (B, TARGET), reached is not None, 'nach %.1fs' % reached if reached else err)
    if reached:
        ch = p.evaluate('window.unfoldingPi.digits()')
        R.check('Stellen 99991-100000 = 5493624646', ch[99991 + 1:100000 + 2] == '5493624646', ch[99991 + 1:100000 + 2])
        R.check('erste 300000 Stellen == Referenz', ch[2:300002] == ref('pi')[:300000])
        n1 = p.evaluate('window.unfoldingPi.state()')['chainLength']; t1 = time.time()
        while time.time() - t1 < GROWTH_LIMIT:
            time.sleep(1); s = p.evaluate('window.unfoldingPi.state()')
            if s['chainLength'] > n1: break
        R.check('Kette waechst weiter', s['chainLength'] > n1, (n1, s['chainLength']))
        R.check('kein Fehlerzustand', s['error'] is None and not errs, errs[:2])
    br.close()
R.done()
