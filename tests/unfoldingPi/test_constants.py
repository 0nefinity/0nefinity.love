"""Konstantenwahl auf der Seite: jede Konstante liefert korrekte Stellen gegen die mpmath-Referenz (tests/irrational/ref),
ueber ?c=<id> und ueber das Auswahlfeld im controls.js-Panel (Wechsel startet die Kette neu).
Aufruf: BROWSER=chromium|firefox|webkit [N=20000] python3 tests/unfoldingPi/test_constants.py"""
import os, time
from playwright.sync_api import sync_playwright
from common import *

B = os.environ.get('BROWSER', 'chromium')
N = int(os.environ.get('N', '20000'))
INT = {'pi': '3', 'e': '2', 'ln2': '0', 'sqrt2': '1', 'phi': '1'}
SYMBOL = {'pi': 'π', 'e': 'e', 'ln2': 'ln 2', 'sqrt2': '√2', 'phi': 'φ'}
R = Res()


def wait_digits(p, n, limit=120):
    t0 = time.time()
    while time.time() - t0 < limit:
        s = p.evaluate('window.unfoldingPi.state()')
        if s['error']:
            return s
        if s['chainLength'] - 2 >= n:
            return s
        time.sleep(0.3)
    return p.evaluate('window.unfoldingPi.state()')


with sync_playwright() as pw:
    br = getattr(pw, B).launch()
    for cid in ['pi', 'e', 'ln2', 'sqrt2', 'phi']:
        c = br.new_context(viewport={'width': 1000, 'height': 600})
        p = c.new_page()
        errs = []
        p.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        p.on('pageerror', lambda e: errs.append(str(e)))
        p.goto(URL + '?c=' + cid)
        p.wait_for_function('window.unfoldingPi')
        p.evaluate(KICK)
        s = wait_digits(p, N)
        ch = p.evaluate('window.unfoldingPi.digits()')
        R.check('%s ?c=%s: Konstante gesetzt, Ganzzahlteil' % (B, cid), s.get('constant') == cid and ch[:2] == INT[cid] + '.', (s.get('constant'), ch[:2]))
        n = len(ch) - 2
        R.check('%s %s: >= %d Stellen == Referenz' % (B, cid, N), n >= N and ch[2:2 + min(n, len(ref(cid)))] == ref(cid)[:min(n, len(ref(cid)))], 'n=%d' % n)
        R.check('%s %s: kein Fehler, kein Hinweistext' % (B, cid), s['error'] is None and not errs and p.evaluate("document.querySelector('.limit-hint')") is None, (s['error'], errs[:1]))
        R.check('%s %s: Titel traegt das Symbol' % (B, cid), SYMBOL[cid] in p.title() or (cid == 'pi' and 'Pi' in p.title()), p.title())
        c.close()

    # Wechsel per Auswahlfeld: pi -> e, Kette startet neu
    c = br.new_context(viewport={'width': 1000, 'height': 600})
    p = c.new_page()
    errs = []
    p.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    p.on('pageerror', lambda e: errs.append(str(e)))
    p.goto(URL)
    p.wait_for_function('window.unfoldingPi')
    p.evaluate(KICK)
    s = wait_digits(p, 5000)
    R.check('%s Auswahl: Start mit pi' % B, s['constant'] == 'pi' and p.evaluate('window.unfoldingPi.digits()').startswith('3.14159'), s['constant'])
    p.evaluate(DRIFT, 0)
    trig = p.locator('.ctrl-row[data-key="const"] .ctrl-select-trigger')
    R.check('%s Auswahl: Select "const" im Panel vorhanden' % B, trig.count() == 1)
    trig.click()
    labels = p.locator('.ctrl-select-option').all_inner_texts()
    R.check('%s Auswahl: Optionen pi, e, √2, φ, ln 2' % B, [x.strip() for x in labels] == ['π', 'e', '√2', 'φ', 'ln 2'] or sorted(x.strip() for x in labels) == sorted(['π', 'e', '√2', 'φ', 'ln 2']), labels)
    p.locator('.ctrl-select-option', has_text='e').first.click()
    p.wait_for_function("window.unfoldingPi.state().constant === 'e'", timeout=5000)
    s0 = p.evaluate('window.unfoldingPi.state()')
    R.check('%s Auswahl: e gewaehlt, Kette neu (startIndex 0, beginnt mit 2.)' % B, s0['startIndex'] == 0 and p.evaluate('window.unfoldingPi.digits()').startswith('2.'), (s0['startIndex'], s0['chainLength']))
    p.evaluate(KICK)
    s = wait_digits(p, 5000)
    ch = p.evaluate('window.unfoldingPi.digits()')
    R.check('%s Auswahl: e liefert Stellen == Referenz, kein pi-Rest' % B, s['constant'] == 'e' and ch[:3] == '2.7' and ch[2:5002] == ref('e')[:5000], ch[:12])
    R.check('%s Auswahl: URL traegt ?c=e' % B, 'c=e' in p.url, p.url)
    # zurueck auf pi
    p.evaluate(DRIFT, 0)
    p.locator('.ctrl-row[data-key="const"] .ctrl-select-trigger').click()
    p.locator('.ctrl-select-option', has_text='π').first.click()
    p.wait_for_function("window.unfoldingPi.state().constant === 'pi'", timeout=5000)
    p.evaluate(KICK)
    s = wait_digits(p, 5000)
    R.check('%s Auswahl: zurueck auf pi == Referenz' % B, p.evaluate('window.unfoldingPi.digits()')[2:5002] == ref('pi')[:5000] and s['error'] is None and not errs, errs[:1])
    c.close()

    # unbekannte Konstante in der URL: laut, kein stiller Rueckfall
    c = br.new_context(viewport={'width': 1000, 'height': 600})
    p = c.new_page()
    errs = []
    p.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    p.goto(URL + '?c=gamma')
    p.wait_for_function('window.unfoldingPi')
    p.wait_for_timeout(500)
    s = p.evaluate('window.unfoldingPi.state()')
    R.check('%s ?c=gamma: sichtbarer Fehlerzustand + console.error' % B, bool(s['error']) and bool(errs) and p.evaluate("document.getElementById('stage').classList.contains('fehler')"), (s['error'], errs[:1]))
    c.close()
    br.close()
R.done()
