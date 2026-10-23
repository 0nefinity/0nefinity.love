"""Grenzen auf der Seite: device zeigt den kleinen Hinweis, engine zeigt KEINEN Text (nur console.warn),
ohne Grenze steht kein Hinweis im DOM. Testhaken: window.unfoldingPiTest (per add_init_script, nie ueber die URL).
Mutanten (MUT=...) muessen rot werden (Exit 1):
  invert   Bedingung kind === 'device' umgedreht
  always   Hinweis bei jedem Limit
Aufruf: BROWSER=chromium|firefox|webkit [MUT=...] python3 tests/unfoldingPi/test_limits.py"""
import os, time
from playwright.sync_api import sync_playwright
from common import *

B = os.environ.get('BROWSER', 'chromium')
MUT = os.environ.get('MUT', '')
R = Res()
DEVICE = 'window.unfoldingPiTest={failAlloc:50};'
ENGINE = 'window.unfoldingPiTest={maxPages:262};'


def run(br, name, init, expect):
    c = br.new_context(viewport={'width': 1000, 'height': 600})
    if init:
        c.add_init_script(init)
    if MUT == 'invert':
        mutate(c, '**/unfoldingPi', "lim.kind === 'device'", "lim.kind !== 'device'", 'invert')
    elif MUT == 'always':
        mutate(c, '**/unfoldingPi', "lim.kind === 'device'", "true", 'always')
    p = c.new_page()
    errs, warns = [], []
    p.on('console', lambda m: (errs if m.type == 'error' else warns if m.type == 'warning' else []).append(m.text))
    p.on('pageerror', lambda e: errs.append(str(e)))
    p.goto(URL)
    p.wait_for_function('window.unfoldingPi')
    p.evaluate(KICK)
    t0 = time.time()
    if expect != 'none':
        while time.time() - t0 < 240 and not p.evaluate('window.unfoldingPi.state().limit'):
            time.sleep(0.3)
    else:
        time.sleep(4)
    p.wait_for_timeout(500)
    s = p.evaluate('window.unfoldingPi.state()')
    body = p.evaluate('document.body.innerText')
    hint = p.evaluate("(()=>{const e=document.getElementById('limit-hint'); return e? {text:e.textContent, size:parseFloat(getComputedStyle(e).fontSize), op:parseFloat(getComputedStyle(e).opacity)} : null})()")
    lim = s.get('limit')
    if expect == 'device':
        R.check('%s device: Limit-Art device' % name, lim and lim['kind'] == 'device', lim)
        R.check('%s device: Hinweistext exakt im DOM' % name, hint and hint['text'] == HINT, hint)
        R.check('%s device: klein und gedaempft' % name, hint and hint['size'] <= 13 and hint['op'] < 0.8, hint)
        R.check('%s device: kein Fehlerzustand' % name, s['error'] is None and not errs and not p.evaluate("document.getElementById('stage').classList.contains('fehler')"), (s['error'], errs[:1]))
    elif expect == 'engine':
        R.check('%s engine: Limit-Art engine' % name, lim and lim['kind'] == 'engine', lim)
        R.check('%s engine: kein Hinweis-Element' % name, hint is None, hint)
        R.check('%s engine: kein Text auf der Seite (Stage leer, kein Hinweiswort)' % name, p.evaluate("document.getElementById('stage').innerText").strip() == '' and 'hardware' not in body.lower(), repr(body[:80]))
        R.check('%s engine: console.warn "engine limit"' % name, any('engine limit' in w for w in warns), warns[:2])
        R.check('%s engine: kein Fehler, nicht wartend' % name, s['error'] is None and not errs and not s['waiting'], (s['error'], errs[:1], s['waiting']))
        n1 = s['chainLength']
        p.wait_for_timeout(1500)
        R.check('%s engine: Anzeige bleibt stehen (Kette waechst nicht)' % name, p.evaluate('window.unfoldingPi.state().chainLength') == n1, n1)
    else:
        R.check('%s ohne Grenze: kein Limit' % name, not lim, lim)
        R.check('%s ohne Grenze: kein Hinweis im DOM' % name, hint is None and 'hardware' not in body.lower(), hint)
        R.check('%s ohne Grenze: Stellen kommen' % name, s['chainLength'] > 3000 and s['error'] is None, s['chainLength'])
    c.close()


with sync_playwright() as pw:
    br = getattr(pw, B).launch()
    run(br, B + '/' + (MUT or 'orig') + '/device', DEVICE, 'device')
    run(br, B + '/' + (MUT or 'orig') + '/engine', ENGINE, 'engine')
    run(br, B + '/' + (MUT or 'orig') + '/none', None, 'none')
    br.close()
R.done()
