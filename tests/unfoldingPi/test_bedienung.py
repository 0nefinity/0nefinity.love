"""Bedienung von unfoldingPi: der Verdichtungs-Regler (P, Schluessel d) aendert nur die Stauchzone.
 a  Start (nichts eingerollt): Regler bewegt weder R noch die 3; zu grosse Werte springen am Regler zurueck
 b  eingerollt: Regler bewegt weder L noch R noch die 3; hin und zurueck springt nichts
 c  d = 0 ist erlaubt (L liegt auf der 3)
 d  Fenster klein und wieder gross: d bleibt begrenzt, R springt beim Vergroessern nicht nach aussen
 e  die 3 ziehen nach einem Reglerwechsel folgt der Maus
 f  Titel "(un)foldingPi", Menue-Eintrag, /foldingPi leitet auf /unfoldingPi, Seite ohne sichtbaren Text
Nur Maus (Playwright), Canvas liegt im Seitenrand bei (32,32).
BROWSER=...  MUT=oldsetd|noclamp|nosnap|nocapresize|notitle|text (Mutanten, muessen rot werden; Exit 1)
Aufruf: BROWSER=chromium|firefox|webkit [MUT=...] python3 tests/unfoldingPi/test_bedienung.py"""
import os
from playwright.sync_api import sync_playwright
from common import *

B = os.environ.get('BROWSER', 'chromium')
MUT = os.environ.get('MUT', '')
MOD = '**/tools/unfolding-view.js'
MUTANTS = {
    # alter Weg: setD ging durch settle() und schob dabei die 3 und L
    'oldsetd': ("      d = Math.min(want, maxD(unrolled));\n      if (unrolled) L = Math.max(MARGIN, X0 - deff());\n      R = Math.min(R, X0 + avail() + deff());",
                "      d = want;\n      X0 = Math.min(X0, R - deff());\n      settle(unrolled ? 'three' : 'x');"),
    'noclamp': ("d = Math.min(want, maxD(unrolled));", "d = want;"),
    'nosnap': ("if (d !== want && opts.onD) opts.onD(d);", ""),
    'notitle': ("<title>(un)foldingPi</title>", "<title>unfoldingPi</title>"),
    'text': ("<canvas id=\"pi\"></canvas>", "<canvas id=\"pi\"></canvas><p>Text</p>"),
    'nocapresize': ("if (d > cap) { d = cap; if (opts.onD) opts.onD(d); }", ""),
}
PAGE_MUTANTS = ('notitle', 'text')
R = Res()
check = R.check
OX = 32
SET = """(v) => { const i = document.querySelector('.ctrl-panel input[type=range]'); i.value = v;
  i.dispatchEvent(new Event('input', {bubbles: true})); i.dispatchEvent(new Event('change', {bubbles: true})); }"""
GET = "() => parseFloat(document.querySelector('.ctrl-panel input[type=range]').value)"
Y = 360


def st(p): return p.evaluate('window.unfoldingPi.state()')
def mv(p, x, y=Y, steps=1): p.mouse.move(x + OX, y + OX, steps=steps)
def drag(p, x0, dx):
    mv(p, x0); p.mouse.down(); mv(p, x0 + dx, steps=8); p.mouse.up()
def same(a, b, keys): return all(abs(a[k] - b[k]) <= 0.6 for k in keys)
def pos(s): return {k: round(s[k], 1) for k in ('L', 'R', 'X0', 'd')}


with sync_playwright() as pw:
    br = getattr(pw, B).launch()
    c = br.new_context(viewport={'width': 1280, 'height': 720})
    if MUT:
        mutate(c, '**/unfoldingPi' if MUT in PAGE_MUTANTS else MOD, MUTANTS[MUT][0], MUTANTS[MUT][1], MUT)
    p = c.new_page()
    errs = []
    p.on('pageerror', lambda e: errs.append(str(e)))
    p.goto(URL, wait_until='networkidle')
    p.wait_for_function('window.unfoldingPi && window.unfoldingPi.state().drawnCount > 0')
    p.wait_for_timeout(500)

    # a: Start, nichts eingerollt
    s0 = st(p)
    p.evaluate(SET, 100)
    s1 = st(p)
    check('a Regler laesst R und die 3 stehen', same(s0, s1, ('R', 'X0')), (pos(s0), pos(s1)))
    check('a d passt in den Platz rechts der 3 (R - X0)', s1['d'] <= s1['R'] - s1['X0'] + 0.6, pos(s1))
    check('a Regler zeigt den wirklichen Wert', abs(p.evaluate(GET) - s1['d']) < 0.6, (p.evaluate(GET), s1['d']))
    p.evaluate(SET, 10)
    s2 = st(p)
    check('a kleineres d: R und 3 bleiben, L folgt der 3', same(s0, s2, ('R', 'X0')) and abs(s2['L'] - (s2['X0'] - s2['d'])) <= 0.6, pos(s2))

    # b: eingerollt (R nach rechts, die 3 nach links, L nach rechts)
    p.evaluate(SET, 40)
    s = st(p)
    drag(p, s['R'], 200)
    s = st(p); drag(p, s['X0'] + 5, -(s['X0'] - 20))
    s = st(p); drag(p, s['L'], 60)
    sb = st(p)
    check('b eingerollt (3 liegt links von L + d)', sb['X0'] < sb['L'] + sb['dEff'] - 0.5, pos(sb))
    for v in (20, 60, 25, 40):
        p.evaluate(SET, v)
        sv = st(p)
        check('b d=%s: L, R, 3 bleiben' % v, same(sb, sv, ('L', 'R', 'X0')), (pos(sb), pos(sv)))
    p.evaluate(SET, 400)
    sv = st(p)
    check('b d=400: L, R, 3 bleiben, d <= halber Abstand der Enden', same(sb, sv, ('L', 'R', 'X0')) and sv['d'] <= (sv['R'] - sv['L']) / 2 + 0.6, pos(sv))
    check('b Regler zeigt den wirklichen Wert', abs(p.evaluate(GET) - sv['d']) < 0.6, (p.evaluate(GET), sv['d']))
    p.evaluate(SET, 40)
    sv = st(p)
    check('b zurueck auf 40: L springt nicht', same(sb, sv, ('L', 'R', 'X0')), (pos(sb), pos(sv)))

    # c: d = 0
    p.evaluate(SET, 0)
    sv = st(p)
    check('c d=0 erlaubt, Enden bleiben', sv['d'] == 0 and same(sb, sv, ('L', 'R', 'X0')), pos(sv))

    # d: Fenstergroesse
    p.evaluate(SET, 400)
    p.set_viewport_size({'width': 800, 'height': 720}); p.wait_for_timeout(400)
    ss = st(p)
    cap = (ss['W'] - 16) / 2
    check('d klein: d <= Kappe (W-16)/2', ss['d'] <= cap + 0.6, (ss['d'], cap))
    check('d klein: Regler zeigt den wirklichen Wert', abs(p.evaluate(GET) - ss['d']) < 0.6, (p.evaluate(GET), ss['d']))
    p.set_viewport_size({'width': 1600, 'height': 720}); p.wait_for_timeout(400)
    sg = st(p)
    check('d wieder gross: R springt nicht nach aussen', sg['R'] <= ss['R'] + 0.6, (pos(ss), pos(sg)))
    check('d wieder gross: d bleibt der Reglerwert', abs(p.evaluate(GET) - sg['d']) < 0.6, (p.evaluate(GET), sg['d']))

    # e: die 3 ziehen nach Reglerwechsel (neu laden: sauberer Start)
    p.set_viewport_size({'width': 1280, 'height': 720})
    p.goto(URL, wait_until='networkidle'); p.wait_for_timeout(600)
    p.evaluate(SET, 30)
    s = st(p)
    drag(p, s['X0'] + 5, -120)
    se = st(p)
    check('e die 3 folgt der Maus (-120)', abs((se['X0'] - s['X0']) + 120) <= 1.5, (pos(s), pos(se)))
    check('e Regler wirkt weiter: R bleibt', (p.evaluate(SET, 60), same(se, st(p), ('R',)))[1])
    check('e keine Seitenfehler', not errs, errs)

    # f: Umbenennung
    check('f Titel (un)foldingPi', p.title() == '(un)foldingPi', p.title())
    check('f Menue-Eintrag (un)foldingPi -> /unfoldingPi.html', p.evaluate("[...document.querySelectorAll('#file-list a')].some(a => a.textContent === '(un)foldingPi' && a.getAttribute('href') === '/unfoldingPi.html')"))
    r = c.request.get(HOST + '/foldingPi', max_redirects=0)
    check('f /foldingPi leitet auf /unfoldingPi', r.status in (301, 302) and r.headers.get('location') == HOST + '/unfoldingPi', (r.status, r.headers.get('location')))
    txt = p.evaluate("""() => { const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n; (n = w.nextNode());) { const t = n.textContent.trim(); const e = n.parentElement;
        if (!t || e.closest('script,style,noscript,#meta-nav,.ctrl-panel')) continue;
        if (getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden') out.push(t); }
      return out; }""")
    check('f Seite ohne sichtbaren Text (ausser Menue und Regler)', txt == [], txt[:3])
    br.close()
R.done()
