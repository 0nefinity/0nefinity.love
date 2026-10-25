"""Front-Test: Pi endet nie. Drift auf Maximum; Stellen kommen nach (>= 2e6 in LIMIT s), korrekt, Anzeige springt nicht zurueck.
BROWSER=chromium|firefox|webkit [LIMIT=25] [TARGET=2000000]"""
import os, time
from playwright.sync_api import sync_playwright
from common import *

B = os.environ.get('BROWSER', 'chromium')
CHR = B == 'chromium'  # Firefox/WebKit rechnen messbar langsamer (Firefox ~2x): 1e6 in 150 s statt 2e6 in 25 s
TARGET = int(os.environ.get('TARGET', '2000000' if CHR else '1000000'))
LIMIT = float(os.environ.get('LIMIT', '25' if CHR else '150'))
R = Res()
with sync_playwright() as pw:
    br = getattr(pw, B).launch()
    c = br.new_context(viewport={'width': 1000, 'height': 600})
    c.add_init_script('window.unfoldingPiTest=Object.assign(window.unfoldingPiTest||{},{file:false});')  # Geraete-Front pruefen: ohne Pi-Datei
    p = c.new_page()
    errs = []
    p.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    p.on('pageerror', lambda e: errs.append(str(e)))
    p.goto(URL); p.wait_for_function('window.unfoldingPi')
    p.evaluate(KICK)
    t0 = time.time(); reached = None; sawwait = False; samples = []
    while time.time() - t0 < LIMIT:
        s = p.evaluate('window.unfoldingPi.state()')
        n = s['chainLength'] - 2
        sawwait = sawwait or s['waiting']
        samples.append((round(time.time() - t0, 1), n, round(s['startIndex'])))
        if n >= TARGET: reached = time.time() - t0; break
        time.sleep(0.5)
    print('Verlauf (s, Stellen, startIndex):', samples[::4] + samples[-1:], flush=True)
    R.check('%s: %d Stellen in %ds' % (B, TARGET, LIMIT), reached is not None, 'nach %.1fs' % reached if reached else samples[-1])
    R.check('Wartezustand sichtbar (waiting)', sawwait)
    if reached:
        time.sleep(2)
        s = p.evaluate('window.unfoldingPi.state()')
        ch = p.evaluate('window.unfoldingPi.digits()')
        ref_pi = ref('pi')
        R.check('Stellen 99991-100000 = 5493624646', ch[99991 + 1:100000 + 2] == '5493624646', ch[99991 + 1:100000 + 2])
        R.check('Stellen 999991-1000000 = 5779458151', ch[999991 + 1:1000000 + 2] == '5779458151', ch[999991 + 1:1000000 + 2])
        R.check('erste 400000 Stellen == Referenz (mpmath)', ch[2:400002] == ref_pi[:400000])
        R.check('Anzeige liegt an der Front (nicht am Anfang)', s['startIndex'] > TARGET * 0.95, s['startIndex'])
        n1 = s['chainLength']
        t1 = time.time(); n2 = n1
        while time.time() - t1 < (15 if CHR else 120) and n2 <= n1:  # naechste Stufe verdoppelt: kommt spaeter, je groesser die Kette
            time.sleep(1); n2 = p.evaluate('window.unfoldingPi.state()')['chainLength']
        R.check('Kette waechst weiter (kein Ende)', n2 > n1, (n1, n2))
        R.check('kein Fehlerzustand', p.evaluate('window.unfoldingPi.state().error') is None and not errs, errs[:2])
    br.close()
R.done()
