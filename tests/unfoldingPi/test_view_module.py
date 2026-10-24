"""Gemeinsames Abroll-Modul tools/unfolding-view.js:
 a  unfoldingPi laedt das Modul (Script-Tag, Global) und zeichnet damit
 b  das Modul laeuft mit fremder Ziffernquelle auf einer leeren Seite (create, setDigits/appendDigits, Fenster gerendert,
    Luecke/Widerspruch werfen DigitError, onNeedDigits/onFront melden)
 c  destroy: Zeigerbeobachter, Resize-Listener und Bildschleife sind weg
BROWSER=...  MUT=nolistener|noresize|noraf (Mutanten im Modul, muessen rot werden; Exit 1)
Aufruf: BROWSER=chromium|firefox|webkit [MUT=...] python3 tests/unfoldingPi/test_view_module.py"""
import os
from playwright.sync_api import sync_playwright
from common import *

B = os.environ.get('BROWSER', 'chromium')
MUT = os.environ.get('MUT', '')
MOD = '**/tools/unfolding-view.js'
MUTANTS = {
    'nolistener': ("canvas.removeEventListener('pointermove', onMove);", ""),
    'noresize': ("window.removeEventListener('resize', onResize);", ""),
    'noraf': ("cancelAnimationFrame(rafId);", ""),
}
R = Res()
check = R.check

PAGE = '<body style="margin:0"><canvas id="c" style="display:block;width:100%;height:200px"></canvas></body>'
SETUP = """(() => {
  window.rafCalls = 0; window.cancelCalls = 0; window.need = []; window.front = [];
  const raf = window.requestAnimationFrame.bind(window), cancel = window.cancelAnimationFrame.bind(window);
  window.requestAnimationFrame = (f) => { window.rafCalls++; return raf(f); };
  window.cancelAnimationFrame = (i) => { window.cancelCalls++; return cancel(i); };
  window.cv = document.getElementById('c');
  window.v = UnfoldingView.create(window.cv, { onNeedDigits: (n) => window.need.push(n), onFront: (b) => window.front.push(b) });
  window.v.setDigits('3', '1415926535');
})()"""
ASCII = "(s) => Uint8Array.from(s, (c) => c.charCodeAt(0))"

with sync_playwright() as pw:
    br = getattr(pw, B).launch()
    c = br.new_context(viewport={'width': 800, 'height': 400})
    if MUT:
        mutate(c, MOD, MUTANTS[MUT][0], MUTANTS[MUT][1], MUT)
    p = c.new_page()
    errs = []
    p.on('pageerror', lambda e: errs.append(str(e)))
    p.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)

    # a: die Seite nutzt das Modul
    p.goto(URL)
    p.wait_for_function('window.unfoldingPi && window.unfoldingPi.state().drawnCount > 0')
    check('a Script-Tag fuer das Modul in unfoldingPi', p.evaluate("!!document.querySelector('script[src=\"/tools/unfolding-view.js\"]')"))
    check('a Global UnfoldingView.create vorhanden', p.evaluate("typeof UnfoldingView === 'object' && typeof UnfoldingView.create === 'function'"))
    check('a Seite hat keine eigene Atlas-Funktion mehr', not p.evaluate("document.documentElement.outerHTML.includes('function buildAtlas')"))

    # b: fremde Ziffernquelle auf leerer Seite
    p.goto('about:blank')
    errs.clear()  # Seitenwechsel bricht den Poll von live-reload (Firefox) ab: kein Fehler des Moduls
    p.set_content(PAGE)
    p.add_script_tag(url=HOST + '/tools/unfolding-view.js')
    p.evaluate(SETUP)
    p.wait_for_function('window.v.state().drawnCount > 0')
    s = p.evaluate('window.v.state()')
    check('b Fenster gerendert (drawnCount > 0)', s['drawnCount'] > 0, s['drawnCount'])
    check('b Kette = Ganzzahl . Stellen', p.evaluate('window.v.digits()') == '3.1415926535')
    ink = p.evaluate("(() => { const d = window.cv.getContext('2d').getImageData(0, 0, window.cv.width, window.cv.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; })()")
    check('b Canvas hat Tinte', ink > 100, ink)
    check('b onNeedDigits meldet Vorrat', p.evaluate('window.need.length > 0 && window.need.every((n) => n > 0)'))
    p.evaluate("window.v.setDigits('3', '')")
    p.wait_for_timeout(200)
    check('b onFront: kurze Kette, Front sichtbar', p.evaluate('window.front[window.front.length - 1]') is True)
    p.evaluate("window.v.setDigits('3', '1415926535')")
    p.wait_for_timeout(200)
    check('b onFront: laengere Kette, Front nicht sichtbar', p.evaluate('window.front[window.front.length - 1]') is False)
    p.evaluate("window.v.appendDigits((%s)('89793'), 10)" % ASCII)
    check('b appendDigits haengt an', p.evaluate('window.v.digits()') == '3.141592653589793')
    p.evaluate("window.v.appendDigits((%s)('7932384'), 12)" % ASCII)
    check('b ueberlappender Anhang nimmt nur Neues', p.evaluate('window.v.digits()') == '3.141592653589793' + '2384', p.evaluate('window.v.digits()'))
    gap = p.evaluate("(() => { try { window.v.appendDigits((%s)('1'), 99); return 'kein Fehler'; } catch (e) { return [e instanceof UnfoldingView.DigitError, e.message]; } })()" % ASCII)
    check('b Luecke wirft DigitError', gap == [True, 'Luecke in den Stellen bei 19'], gap)
    bad = p.evaluate("(() => { try { window.v.appendDigits((%s)('00'), 0); return 'kein Fehler'; } catch (e) { return [e instanceof UnfoldingView.DigitError, e.message]; } })()" % ASCII)
    check('b Widerspruch wirft DigitError', bad == [True, 'Stellen widersprechen den bekannten Stellen'], bad)
    p.evaluate("window.v.setDigits('3', '14159265358979323846'.repeat(1000))")
    p.wait_for_timeout(300)
    s = p.evaluate('window.v.state()')
    check('b nur das sichtbare Fenster wird gezeichnet', 0 < s['drawnCount'] < 400 and s['chainLength'] > 20000, (s['drawnCount'], s['chainLength']))
    p.mouse.move(p.evaluate('window.v.state().R'), 100)
    check('b Zeiger am rechten Griff: Cursor ew-resize', p.evaluate('window.cv.style.cursor') == 'ew-resize', p.evaluate('window.cv.style.cursor'))
    p.evaluate("window.v.setLocked(true)")
    x0 = p.evaluate('window.v.state().X0')
    p.mouse.down(); p.mouse.move(300, 100); p.mouse.up()
    check('b gesperrt: Ziehen bewegt nichts', p.evaluate('window.v.state().X0') == x0)
    p.evaluate("window.v.setLocked(false)")
    p.mouse.move(400, 100); p.mouse.down(); p.mouse.move(300, 100, steps=4); p.mouse.up()
    check('b entsperrt: Ziehen rollt ab', p.evaluate('window.v.state().X0') != x0, (x0, p.evaluate('window.v.state().X0')))

    # c: destroy
    w0 = p.evaluate('window.v.state().W')
    p.evaluate('window.v.destroy()')
    check('c destroy hat die Bildschleife abgebrochen', p.evaluate('window.cancelCalls') >= 1, p.evaluate('window.cancelCalls'))
    p.wait_for_timeout(200)
    n0 = p.evaluate('window.rafCalls')
    p.wait_for_timeout(300)
    check('c keine Bilder mehr nach destroy', p.evaluate('window.rafCalls') == n0, (n0, p.evaluate('window.rafCalls')))
    check('c Cursor zurueckgesetzt', p.evaluate('window.cv.style.cursor') == '', p.evaluate('window.cv.style.cursor'))
    p.mouse.move(405, 100); p.mouse.move(410, 100)
    check('c Zeiger-Listener entfernt (Cursor bleibt leer)', p.evaluate('window.cv.style.cursor') == '', p.evaluate('window.cv.style.cursor'))
    p.set_viewport_size({'width': 500, 'height': 400})
    p.wait_for_timeout(300)
    check('c Resize-Listener entfernt (W bleibt)', p.evaluate('window.v.state().W') == w0, (w0, p.evaluate('window.v.state().W')))
    p.evaluate('window.v.destroy()')
    check('c destroy zweimal ist harmlos', True)
    check('keine Konsolenfehler/pageerror', not errs, errs[:2])
    br.close()
R.done()
