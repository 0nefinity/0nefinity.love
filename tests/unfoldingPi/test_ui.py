import os, tempfile
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
from common import *

OUT = os.environ.get('OUT') or tempfile.mkdtemp(prefix='unfoldingPi-ui-') + '/'
R = Res()
check = R.check

# Mutanten: MUT=<name> ersetzt Code der Seite per Route (Test muss dann rot werden).
MUTANTS = {
  'revstop':  ("if (rate < 0) X0 = Math.min(X0, Math.max(prev, L + deff()));", "if (false) X0 = Math.min(X0, Math.max(prev, L + deff()));"),
  'nolost':   ("canvas.addEventListener('lostpointercapture', endDrag);", ""),
  'norebase': ("if (drag) drag.rebase = true;", ""),
}
MODULE_MUTANTS = ('revstop', 'nolost', 'norebase')   # der Code liegt in tools/unfolding-view.js, nicht in der Seite
MUT = os.environ.get('MUT')
def mk(br, **kw):
    c = br.new_context(**kw)
    if MUT:
        mutate(c, '**/tools/unfolding-view.js' if MUT in MODULE_MUTANTS else '**/unfoldingPi', *MUTANTS[MUT], label=MUT)
    return c

PI = ref('pi')[:3000]

def st(p): return p.evaluate('window.unfoldingPi.state()')

COLPROBE = """
(side) => {
  const s = window.unfoldingPi.state();
  const c = document.getElementById('pi');
  const g = c.getContext('2d');
  const dpr = s.dpr;
  const x = side === 'R' ? Math.round(s.R * dpr) - 1 : Math.round(s.L * dpr);
  const top = Math.ceil(s.inkTop * dpr) , bot = Math.floor(s.inkBottom * dpr);
  const d = g.getImageData(x, top, 1, bot - top + 1).data;
  let sum = 0, min = 255, n = 0;
  for (let i = 3; i < d.length; i += 4) { sum += d[i]; if (d[i] < min) min = d[i]; n++; }
  return { mean: sum / n / 255, min: min / 255, rows: n, x };
}
"""

OX = [0, 0]
def mouse_drag(p, x0, y, x1, steps=20):
    x0 += OX[0]; x1 += OX[0]; y += OX[1]
    p.mouse.move(x0, y); p.mouse.down()
    p.mouse.move(x1, y, steps=steps); p.mouse.up()

with sync_playwright() as pw:
    br = pw.chromium.launch()
    ctx = mk(br, viewport={'width': 1280, 'height': 720}, device_scale_factor=2, has_touch=True)
    page = ctx.new_page()
    errors, reqs = [], []
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('request', lambda r: reqs.append(r.url))
    page.goto(URL, wait_until='networkidle')
    page.wait_for_function('window.unfoldingPi && window.unfoldingPi.state().chainLength > 1500', timeout=60000)
    page.wait_for_timeout(300)
    rc = page.evaluate("(() => { const r = document.getElementById('pi').getBoundingClientRect(); return [r.left, r.top]; })()")
    OX[0], OX[1] = rc
    print('canvas offset', rc)
    s = st(page)
    page.screenshot(path=OUT + 'start.png')
    check('1a start: 3 allein, nichts eingerollt', s['startIndex'] == 0 and s['visibleCount'] == 1 and abs(s['R'] - s['L'] - 3 * s['w']) < 0.01, s)
    check('1b start: Gruppe mittig', abs((s['L'] + s['R']) / 2 - s['W'] / 2) < 1, (s['L'], s['R'], s['W']))
    pr = page.evaluate(COLPROBE, 'R')
    check('2a rechte Kante traegt Tinte (verdichtete Ziffern)', pr['mean'] >= 0.05, pr)
    check('2b links nichts eingerollt: keine Linie', st(page)['startIndex'] == 0 and page.evaluate(COLPROBE, 'L')['mean'] < 0.1, page.evaluate(COLPROBE, 'L'))

    # 3a: rechtes Ende ziehen
    s0 = st(page); y = s0['H'] / 2
    # Canvas-Offset oben = 0 (Canvas beginnt bei y=0)
    mouse_drag(page, s0['R'], y, s0['R'] + 300)
    s1 = st(page)
    check('3a R ziehen: R +300, X0 gleich, mehr Stellen', abs(s1['R'] - s0['R'] - 300) < 2 and s1['X0'] == s0['X0'] and s1['visibleCount'] > s0['visibleCount'], (s0['R'], s1['R'], s1['visibleCount']))
    # 3b: die 3 ziehen nach links: R bleibt, X0 -100
    mouse_drag(page, s1['X0'] + s1['w'] / 2, y, s1['X0'] + s1['w'] / 2 - 100)
    s2 = st(page)
    check('3b 3 ziehen links: X0 -100, R gleich, endIndex waechst', abs(s2['X0'] - s1['X0'] + 100) < 2 and s2['R'] == s1['R'] and s2['endIndex'] > s1['endIndex'] and s2['startIndex'] == 0, (s1['X0'], s2['X0'], s2['endIndex']))
    # 3b2: die 3 nach rechts: Stellen gehen rechts hinein
    mouse_drag(page, s2['X0'] + s2['w'] / 2, y, s2['X0'] + s2['w'] / 2 + 60)
    s2b = st(page)
    check('3b2 3 ziehen rechts: endIndex sinkt, R gleich', s2b['endIndex'] < s2['endIndex'] and s2b['R'] == s2['R'], (s2['endIndex'], s2b['endIndex']))
    # 3c: swipe links in der Mitte: L,R stehen, startIndex waechst
    mid = (s2b['L'] + s2b['R']) / 2
    for _ in range(8):
        mouse_drag(page, mid, y, mid - 250)
    s3 = st(page)
    check('3c swipe links: L,R stehen, startIndex waechst, 3 verschwindet', s3['L'] == s2b['L'] and s3['R'] == s2b['R'] and s3['startIndex'] > s2b['startIndex'] + 5, (s2b['startIndex'], s3['startIndex']))
    page.screenshot(path=OUT + 'beide-linien.png')
    pl = page.evaluate(COLPROBE, 'L'); pr2 = page.evaluate(COLPROBE, 'R')
    check('2c linke Kante traegt Tinte nach Swipe', pl['mean'] >= 0.05, pl)
    check('2d rechte Kante traegt Tinte nach Swipe', pr2['mean'] >= 0.05, pr2)
    # 3d: linke Linie ziehen (nach links: Stellen kommen heraus), X0 gleich
    mouse_drag(page, s3['L'], y, s3['L'] - 40)
    s4 = st(page)
    check('3d linke Linie links: startIndex sinkt, X0 gleich', s4['startIndex'] < s3['startIndex'] and s4['X0'] == s3['X0'] and s4['L'] < s3['L'], (s3['startIndex'], s4['startIndex']))
    mouse_drag(page, s4['L'], y, s4['L'] + 40)
    s4b = st(page)
    check('3d2 linke Linie rechts: startIndex waechst', s4b['startIndex'] > s4['startIndex'], (s4['startIndex'], s4b['startIndex']))
    # 3e: erst fast zurueck wischen, dann linke Linie weit nach links: Uebergang in "3 ziehen"
    sx = st(page)
    k = max(0, sx['startIndex'] - 3)
    mid = (sx['L'] + sx['R']) / 2
    while k > 0:
        step = min(k * sx['w'], 400)
        mouse_drag(page, mid, y, mid + step); k -= step / sx['w']
    sa = st(page)
    page.mouse.move(sa['L'] + OX[0], y + OX[1]); page.mouse.down()
    page.mouse.move(8 + OX[0], y + OX[1], steps=40)
    s5 = st(page)
    page.mouse.up()
    check('3e linke Linie bis 3 erreicht: startIndex 0, 3 wird mitgezogen (X0 < alt)', s5['startIndex'] == 0 and s5['X0'] < sa['X0'] and abs(s5['X0'] - (s5['L'] + s5['dEff'])) < 1e-6, (sa['startIndex'], s5['startIndex'], sa['X0'], s5['X0']))
    # 3f: swipe rechts bis 3 zurueck vorn
    s6 = st(page)
    mid = (s6['L'] + s6['R']) / 2
    mouse_drag(page, mid, y, mid + 600)
    s7 = st(page)
    check('3f swipe rechts: 3 vorn, kein Spalt (X0 == L+d)', s7['startIndex'] == 0 and abs(s7['X0'] - (s7['L'] + s7['dEff'])) < 1e-6, (s7['startIndex'], s7['X0'], s7['L']))
    # 3f2: erst nach links rollen (Swipe), dann rechts weit: 3 wieder vorn
    mid = (s7['L'] + s7['R']) / 2
    for _ in range(3): mouse_drag(page, mid, y, mid - 300)
    sm = st(page)
    for _ in range(4): mouse_drag(page, mid, y, mid + 300)
    s7b = st(page)
    check('3f2 Swipe rechts zurueck: 3 vorn, Fenster ohne Spalt', sm['startIndex'] > 20 and s7b['startIndex'] == 0 and abs(s7b['X0'] - (s7b['L'] + s7b['dEff'])) < 1e-6, (sm['startIndex'], s7b['startIndex']))

    # Slider
    sl = lambda v: page.evaluate(DRIFT, v)
    s8 = st(page)
    sl(-0.35); page.wait_for_timeout(1500)
    a = st(page)
    page.wait_for_timeout(1500)
    b = st(page)
    check('3g Slider links: startIndex waechst ueber Zeit', a['startIndex'] > s8['startIndex'] and b['startIndex'] > a['startIndex'] and b['velocity'] > 0, (s8['startIndex'], a['startIndex'], b['startIndex'], b['velocity']))
    sl(0); page.wait_for_timeout(300)
    c1 = st(page); page.wait_for_timeout(500); c2 = st(page)
    check('3h Slider Mitte: Stillstand', c1['startIndex'] == c2['startIndex'], (c1['startIndex'], c2['startIndex']))
    sl(0); page.wait_for_timeout(200)
    sl(0.4); page.wait_for_timeout(3000)
    e = st(page)
    check('3i Slider rechts: sinkt und stoppt bei 0', e['startIndex'] < c2['startIndex'] and e['startIndex'] == 0, (c2['startIndex'], e['startIndex']))
    # 3i2: Rueckwaertsstopp an der 3 auf frischer Seite (R mit Luft), danach stehen X0 und L ueber mehrere Frames
    sp = page.context.new_page(); sp.goto(URL, wait_until='networkidle'); sp.wait_for_timeout(800)
    L_start = st(sp)['L']
    sp.evaluate(DRIFT, -0.35); sp.wait_for_timeout(1200)
    sp.evaluate(DRIFT, 0.4); sp.wait_for_timeout(3000)
    e2 = st(sp); sp.wait_for_timeout(800); e3 = st(sp)
    check('3i2 Rueckwaertsstopp an der 3: X0 und L stehen (Frames danach gleich)', e2['startIndex'] == 0 and e3['X0'] == e2['X0'] and e3['L'] == e2['L'] == L_start and abs(e3['X0'] - (e3['L'] + e3['dEff'])) < 1e-6, (L_start, e2['X0'], e3['X0'], e2['L'], e3['L']))
    sp.close()
    sl(-1); page.wait_for_timeout(2500)
    f = st(page)
    check('3j Slider Anschlag links: laeuft schnell, Rechengrenze, kein Fehler', f['startIndex'] > 1000 and f['error'] is None, (f['startIndex'], f['chainLength']))
    sl(0.8); page.wait_for_timeout(2500)
    sl(0)
    page.wait_for_timeout(300)

    # Touch (CDP -> Pointer Events mit pointerType touch)
    page.evaluate("window.__pt = []; document.getElementById('pi').addEventListener('pointerdown', e => window.__pt.push(e.pointerType))")
    t0 = st(page); print('T0', {k: t0[k] for k in ('L','R','X0','startIndex','W')})
    cdp = ctx.new_cdp_session(page)
    def touch(typ, x, y2):
        pts = [] if typ == 'touchEnd' else [{'x': x, 'y': y2}]
        cdp.send('Input.dispatchTouchEvent', {'type': typ, 'touchPoints': pts})
    touch('touchStart', t0['R'] + OX[0], y + OX[1])
    for i in range(1, 11): touch('touchMove', t0['R'] + OX[0] + i * 20, y + OX[1])
    touch('touchEnd', 0, 0)
    t1 = st(page)
    types = page.evaluate('window.__pt')
    check('3k Touch: R ziehen via pointerType touch', 'touch' in types and abs(t1['R'] - t0['R'] - 200) < 3, (types, t0['R'], t1['R']))
    # Touch-Swipe
    mid = (t1['L'] + t1['R']) / 2
    touch('touchStart', mid + OX[0], y + OX[1])
    for i in range(1, 11): touch('touchMove', mid + OX[0] - i * 15, y + OX[1])
    touch('touchEnd', 0, 0)
    t2 = st(page)
    check('3l Touch swipe: startIndex waechst', t2['startIndex'] > t1['startIndex'], (t1['startIndex'], t2['startIndex']))

    # 3m: lostpointercapture beendet den Zug wie pointercancel
    sl(0); page.wait_for_timeout(200)
    m0 = st(page)
    page.mouse.move(m0['R'] + OX[0], y + OX[1]); page.mouse.down(); page.mouse.move(m0['R'] + OX[0] + 30, y + OX[1], steps=5)
    m1 = st(page)
    page.evaluate("document.getElementById('pi').dispatchEvent(new PointerEvent('lostpointercapture', {pointerId: 1}))")
    page.mouse.move(m0['R'] + OX[0] + 90, y + OX[1], steps=5)
    m2 = st(page)
    page.mouse.up()
    check('3m lostpointercapture beendet den Zug (R bewegt sich danach nicht mehr)', abs(m1['R'] - m0['R'] - 30) < 2 and m2['R'] == m1['R'], (m0['R'], m1['R'], m2['R']))

    # 3n: Resize mitten im Ziehen: kein Sprung
    rp = page.context.new_page()
    rp.set_viewport_size({'width': 1000, 'height': 700})
    rp.goto(URL, wait_until='networkidle'); rp.wait_for_timeout(800)
    r0 = st(rp)
    rox, roy = rp.evaluate("(() => { const r = document.getElementById('pi').getBoundingClientRect(); return [r.left, r.top]; })()")
    gx = r0['X0'] + r0['w'] / 2
    rp.mouse.move(gx + rox, r0['H'] / 2 + roy); rp.mouse.down(); rp.mouse.move(gx - 60 + rox, r0['H'] / 2 + roy, steps=5)
    rp.set_viewport_size({'width': 700, 'height': 700}); rp.wait_for_timeout(300)
    r1 = st(rp)
    rp.mouse.move(gx - 59 + rox, r0['H'] / 2 + roy, steps=1); rp.wait_for_timeout(100)
    r2 = st(rp)
    rp.mouse.up()
    check('3n Resize mitten im Ziehen: naechster Zugschritt springt nicht', abs(r2['X0'] - r1['X0']) < 3 and r1['W'] < r0['W'] - 100, (r1['X0'], r2['X0'], r1['W']))
    rp.close()

    # 4 Pi-Stellen
    chain = page.evaluate('window.unfoldingPi.digits()')
    dec = chain[2:]
    n = min(len(dec), 3000)
    check('4a Worker-Stellen == Referenz (mpmath, tests/irrational/ref)', dec[:n] == PI[:n] and n >= 1500, 'verglichen %d Stellen' % n)
    check('4b Reserve (erste 998) == Referenz', chain[2:1000] == PI[:998], '')

    # Dark/Light
    page.evaluate("document.documentElement.style.setProperty('--bg-color','white'); document.documentElement.style.setProperty('--text-color','black')")
    sl(0); page.wait_for_timeout(200)
    # Zeichnen erzwingen: kleiner Swipe
    tl = st(page)
    mid = (tl['L'] + tl['R']) / 2
    mouse_drag(page, mid, y, mid - 5)
    page.wait_for_timeout(200)
    page.screenshot(path=OUT + 'light.png')
    tl2 = st(page)
    pr3 = page.evaluate(COLPROBE, 'R')
    check('5a Light: Textfarbe dunkel, Kante traegt Tinte', tl2['color'] == 'rgb(0, 0, 0)' and pr3['mean'] >= 0.05, (tl2['color'], pr3))
    page.evaluate("document.documentElement.style.removeProperty('--bg-color'); document.documentElement.style.removeProperty('--text-color')")

    ext = [u for u in reqs if urlparse(u).netloc not in (urlparse(HOST).netloc,) and not u.startswith('data:') and not u.startswith('blob:')]
    check('5b alle Requests same-origin', not ext, (len(reqs), ext[:5]))
    check('5c keine Konsolenfehler', not errors, errors[:5])
    check('5d kein Pi-Fehlerzustand', st(page)['error'] is None, '')

    # Fehlerpfad: manipulierte Referenz -> sichtbarer Fehlerzustand
    p2 = ctx.new_page()
    p2.route('**/unfoldingPi', lambda r: r.fulfill(response=r.fetch(), body=r.fetch().text().replace('RESERVE.slice(1)', "RESERVE.slice(1).replace('1415','1416')"), content_type='text/html'))
    errs2 = []
    p2.on('console', lambda m: errs2.append(m.text) if m.type == 'error' else None)
    p2.goto(URL, wait_until='networkidle'); p2.wait_for_timeout(3000)
    s_err = st(p2)
    check('5e Fehlerpfad: falsche Stellen -> error-Zustand + console.error + Rahmen', s_err['error'] is not None and errs2 and p2.evaluate("document.getElementById('stage').classList.contains('fehler')"), (s_err['error'], errs2[:1]))
    p2.close()
    ctx.close()

    # 7 Hit-Test: naechster Griff gewinnt; Hell = Dunkel
    d7 = mk(br, viewport={'width': 1440, 'height': 1100}, device_scale_factor=1)
    p7 = d7.new_page()
    p7.goto(URL, wait_until='networkidle'); p7.wait_for_timeout(800)
    p7.evaluate("""(() => { const i = document.querySelector('.ctrl-row[data-key="d"] input[type=range]'); i.value = 2; i.dispatchEvent(new Event('input', {bubbles: true})); i.dispatchEvent(new Event('change', {bubbles: true})); })()""")
    p7.wait_for_timeout(200)
    h0 = st(p7)
    check('7b0 Verdichtung klein gesetzt', h0['dEff'] < 5, h0['dEff'])
    yy = h0['H'] / 2
    ox, oy = p7.evaluate("(() => { const r = document.getElementById('pi').getBoundingClientRect(); return [r.left, r.top]; })()")
    p7.mouse.move(h0['R'] + ox, yy + oy); p7.mouse.down(); p7.mouse.move(h0['X0'] + h0['w'] + 2 + ox, yy + oy, steps=10); p7.mouse.up()
    h0 = st(p7)
    check('7b1 R direkt an die 3 herangezogen', h0['R'] - (h0['X0'] + h0['w']) < 5, (h0['R'], h0['X0'], h0['w']))
    gx = h0['X0'] + h0['w'] - 1   # innerhalb der 3-Zone, aber R ist naeher
    p7.mouse.move(gx + ox, yy + oy); p7.mouse.down(); p7.mouse.move(gx + 50 + ox, yy + oy, steps=10); p7.mouse.up()
    h1 = st(p7)
    check('7b Hit-Test: naechster Griff (R) gewinnt gegen die 3', abs(h1['R'] - h0['R'] - 50) < 2 and h1['X0'] == h0['X0'], (h0['R'], h1['R'], h0['X0'], h1['X0']))
    SUMJS = "(() => { const c = document.getElementById('pi'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) n += d[i]; return n; })()"
    ink_dark = p7.evaluate(SUMJS)
    p7.evaluate("document.documentElement.style.setProperty('--bg-color','white'); document.documentElement.style.setProperty('--text-color','black')")
    p7.wait_for_timeout(300)
    p7.screenshot(path=OUT + 'v2-hell.png')
    ink_light = p7.evaluate(SUMJS)
    hs = st(p7)
    check('7c Hellmodus: Farbe wechselt ohne Eingabe, Linie/Ziffern gerendert (Deckung ~ Dunkel)', hs['color'] == 'rgb(0, 0, 0)' and ink_dark > 0 and abs(ink_light - ink_dark) / ink_dark < 0.1, (hs['color'], ink_dark, ink_light))
    p7.evaluate("document.documentElement.style.removeProperty('--bg-color'); document.documentElement.style.removeProperty('--text-color')")
    p7.wait_for_timeout(300)
    p7.reload(wait_until='networkidle'); p7.wait_for_timeout(800)
    p7.screenshot(path=OUT + 'v2-dunkel.png')
    d7.close()

    # 6 Mobil
    mctx = mk(br, viewport={'width': 390, 'height': 844}, device_scale_factor=3, has_touch=True, is_mobile=True)
    mp = mctx.new_page()
    merr = []
    mp.on('console', lambda m: merr.append(m.text) if m.type == 'error' else None)
    mp.goto(URL, wait_until='networkidle'); mp.wait_for_timeout(800)
    ms = st(mp)
    mp.screenshot(path=OUT + 'v2-mobil.png')
    mpr = mp.evaluate(COLPROBE, 'R')
    check('6 Mobil 390x844: Startzustand, Kante mit Tinte, in Bild', ms['L'] >= 8 and ms['R'] <= 390 - 8 and mpr['mean'] >= 0.05 and not merr, (ms['L'], ms['R'], mpr, merr[:2]))
    mctx.close()
    br.close()

R.done()
