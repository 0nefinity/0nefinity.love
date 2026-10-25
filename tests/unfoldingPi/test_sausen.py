"""Sausen und Stauchzone von unfoldingPi (alle Browser).
 1  Stauchzone aus Ziffern: kein Ersatzstrich (keine Rechteck-/Pfad-Aufrufe auf #pi, gezeichnete Breite nicht groesser
    als das Bild), Helligkeit an der Kante wie die mittlere Deckung der Ziffern, Tinte bis an R, ohne Spruenge
 2  Enden ziehen waehrend des Sausens (vorwaerts R, auch am Datenende; rueckwaerts R; vorwaerts L), Maus; Touch in chromium
 3  Sausen-Regler im controls.js-Panel, beim Laden sichtbar (Desktop und Handy)
 4  Standard: volle Auslenkung laeuft fluessig (<= 1 Stelle je Bild); Grenzen im Popup (min/max) wirken
BROWSER=...  MUT=fillstrich|oldbar|noendfollow|peekpanel|olddefault|fixgrenze (muessen rot werden; Exit 1)
Aufruf: BROWSER=chromium|firefox|webkit [MUT=...] python3 tests/unfoldingPi/test_sausen.py"""
import os
from playwright.sync_api import sync_playwright
from common import *

B = os.environ.get('BROWSER', 'chromium')
MUT = os.environ.get('MUT', '')
MOD = '**/tools/unfolding-view.js'
PAGE = '**/unfoldingPi'
MUTANTS = {
    # Ersatzstrich durch die Hintertuer: ein Rechteck je aggregierter Spalte
    'fillstrich': (MOD, "if (c < zone.lo) zone.lo = c;", "ctx.fillRect(c, 0, 1, 1); if (c < zone.lo) zone.lo = c;"),
    # alter Weg: unter einem Pixel die Silhouette auf Mindestbreite gezogen
    'oldbar': (MOD, "if (wDev < 1) { accumulate(xa < mid ? zoneL : zoneR, g.t, xDev, wDev, al); continue; }",
               "if (wDev < 1) { ctx.globalAlpha = al; ctx.drawImage(g.bar, xDev, y0, Math.max(4, wDev), hd); continue; }"),
    'noendfollow': (MOD, "if (R > end) X0 = R - dd - avail();", ""),
    'peekpanel': (PAGE, "Controls.createPanel({ position: 'left', id: 'pi-compression' })",
                  "Controls.createPanel({ position: 'left', id: 'pi-compression', mobileInitialOpenMode: 'peek' })"),
    'olddefault': (PAGE, "const DRIFT_MAX = 30;", "const DRIFT_MAX = 1e10;"),
    # feste Obergrenze trotz Popup
    'fixgrenze': (PAGE, "onChange: (v) => { driftValue = +v || 0; }", "onChange: (v) => { driftValue = Math.max(-DRIFT_MAX, Math.min(DRIFT_MAX, +v || 0)); }"),
}
R = Res()
check = R.check
Y = 0.5   # Zeile der Ziffern: Mitte der Leinwand

INSTR = """(() => {
  const P = CanvasRenderingContext2D.prototype, log = window.__cv = { bad: {}, renders: 0, drawW: 0, maxW: 0 };
  const mine = (c) => c && c.canvas && c.canvas.id === 'pi';
  for (const m of ['fillRect', 'strokeRect', 'rect', 'lineTo', 'stroke', 'fill']) {
    const o = P[m];
    P[m] = function (...a) { if (mine(this)) log.bad[m] = (log.bad[m] || 0) + 1; return o.apply(this, a); };
  }
  const cr = P.clearRect;
  P.clearRect = function (...a) {
    if (mine(this)) { if (log.renders) log.maxW = Math.max(log.maxW, log.drawW); log.renders++; log.drawW = 0; }
    return cr.apply(this, a);
  };
  const di = P.drawImage;
  P.drawImage = function (...a) {
    if (mine(this)) log.drawW += a.length >= 9 ? a[7] : (a.length >= 5 ? a[3] : a[0].width);
    return di.apply(this, a);
  };
})()"""

PROBE = """() => {
  const s = window.unfoldingPi.state(), g = document.getElementById('pi').getContext('2d'), dpr = s.dpr;
  const top = Math.ceil(s.inkTop * dpr), bot = Math.floor(s.inkBottom * dpr), h = bot - top + 1;
  const x0 = Math.round(s.L * dpr), x1 = Math.round(s.R * dpr), n = x1 - x0;
  const d = g.getImageData(x0, top, n, h).data, col = new Array(n).fill(0);
  for (let y = 0; y < h; y++) for (let x = 0; x < n; x++) col[x] += d[(y * n + x) * 4 + 3];
  return { col: col.map((v) => v / h / 255), linLo: Math.round((s.L + s.dEff) * dpr) - x0, linHi: Math.round((s.R - s.dEff) * dpr) - x0, dpr };
}"""

# Sausen setzen: Wert in Stellen/s (negativ = links = vorwaerts); die Grenze wird bei Bedarf mitgezogen.
DRIFT_RAW = """(v) => { const c = window.unfoldingPi.controls, a = Math.abs(v);
  if (a) c.setSliderConfig('drift', { min: -a, max: a });
  const r = document.getElementById('drift'); r.value = v; r.dispatchEvent(new Event('input', { bubbles: true })); }"""
SETD = """(v) => { const i = document.querySelector('.ctrl-row[data-key="d"] input[type=range]'); i.value = v;
  i.dispatchEvent(new Event('input', { bubbles: true })); }"""
JUMPS = """(ms) => new Promise((res) => { const out = []; let last = window.unfoldingPi.state().startIndex; const t0 = performance.now();
  const f = () => { const s = window.unfoldingPi.state().startIndex; out.push(s - last); last = s;
    if (performance.now() - t0 < ms) requestAnimationFrame(f); else res(out); }; requestAnimationFrame(f); })"""


def st(p): return p.evaluate('window.unfoldingPi.state()')


def ctx_new(br, mobile=False, dpr=2):
    kw = {'viewport': {'width': 390, 'height': 844} if mobile else {'width': 1280, 'height': 800}, 'device_scale_factor': dpr}
    if mobile and B != 'firefox':   # Playwright-Firefox: mit has_touch loest die Maus keine Pointer-Events aus (nur mousedown)
        kw['has_touch'] = True
        kw['is_mobile'] = True
    c = br.new_context(**kw)
    if MUT:
        pat, a, b = MUTANTS[MUT]
        mutate(c, pat, a, b, MUT)
    return c


def open_page(c, instr=False):
    p = c.new_page()
    errs = []
    p.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    p.on('pageerror', lambda e: errs.append(str(e)))
    if instr: p.add_init_script(INSTR)
    p.goto(URL, wait_until='networkidle')
    p.wait_for_function('window.unfoldingPi && window.unfoldingPi.state().chainLength > 1500', timeout=60000)
    p.wait_for_timeout(300)
    r = p.evaluate("(() => { const r = document.getElementById('pi').getBoundingClientRect(); return [r.left, r.top, r.height]; })()")
    return p, errs, r


def drag(p, r, x0, x1, steps=12):
    y = r[1] + r[2] * Y
    p.mouse.move(r[0] + x0, y); p.mouse.down()
    p.mouse.move(r[0] + x1, y, steps=steps); p.mouse.up()


with sync_playwright() as pw:
    br = getattr(pw, B).launch()

    # ── 1 Stauchzone aus Ziffern ──
    for label, mobile, dpr in (('Desktop', False, 2), ('Handy', True, 3)):
        c = ctx_new(br, mobile, dpr)
        p, errs, r = open_page(c, instr=True)
        s = st(p)
        drag(p, r, s['R'], s['W'] - 30)
        p.evaluate(SETD, min(200, s['W'] / 4))
        p.wait_for_timeout(400)
        p.evaluate('window.__cv.maxW = 0; window.__cv.drawW = 0; window.__cv.renders = 0; window.__cv.bad = {}')
        p.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
        p.evaluate("window.dispatchEvent(new Event('resize'))")
        p.wait_for_timeout(500)
        cv = p.evaluate('(() => { const l = window.__cv; return { bad: l.bad, renders: l.renders, maxW: Math.max(l.maxW, l.drawW) }; })()')
        s = st(p)
        limit = s['W'] * s['dpr'] * 1.05 + 8
        check('1a %s: keine Rechteck-/Pfad-Aufrufe auf #pi' % label, cv['renders'] > 0 and not cv['bad'], cv)
        check('1b %s: gezeichnete Breite je Bild <= Bildbreite (kein uebereinandergelegter Ersatzstrich)' % label,
              cv['renders'] > 0 and cv['maxW'] <= limit, (round(cv['maxW']), round(limit), s['dEff']))
        pr = p.evaluate(PROBE)
        col, lo, hi = pr['col'], pr['linLo'], pr['linHi']
        C = sum(col[lo:hi]) / max(1, hi - lo)
        edge = sum(col[-8:]) / 8
        ink_to = max([i for i, v in enumerate(col) if v > 0.01] or [-1])
        check('1c %s: Kante so hell wie die mittlere Ziffern-Deckung (0.4..1.5 C)' % label,
              C > 0.05 and 0.4 * C <= edge <= 1.5 * C, ('C=%.3f' % C, 'Kante=%.3f' % edge, 'L/R/dEff', round(s['L']), round(s['R']), round(s['dEff']), lo, hi))
        check('1d %s: Tinte bis <= 2 Geraetepx vor R' % label, ink_to >= len(col) - 1 - 2, (ink_to, len(col)))
        # stetig: dort, wo die Ziffern schmaler als 12 Geraetepx werden (Mipstufen, dann Aggregation unter 1 px), bleibt das
        # Mittel ueber Fenster von 6 Spalten im Band der mittleren Ziffern-Deckung (Textur breiter Ziffern schwankt, ein Strich nicht) (Ziffernbreite an x: w * (R - x) / dEff)
        dense = int(12 * s['dEff'] / s['w'])
        zone = col[max(hi, len(col) - dense):]
        wins = [sum(zone[i:i + 6]) / 6 for i in range(0, len(zone) - 5, 6)]
        lo_w, hi_w = min(wins or [0]), max(wins or [0])
        check('1e %s: Helligkeit entlang der Verdichtung bleibt im Band der Ziffern-Deckung (0.4..2.2 C; alter Ersatzstrich ~3.5 C)' % label,
              len(wins) > 4 and lo_w >= 0.4 * C and hi_w <= 2.2 * C, ('min=%.3f' % lo_w, 'max=%.3f' % hi_w, 'C=%.3f' % C, [round(v, 2) for v in wins[-12:]]))
        check('1f %s: keine Konsolenfehler' % label, not errs, errs[:3])
        c.close()

    # ── 2 Enden ziehen beim Sausen ──
    c = ctx_new(br)
    p, errs, r = open_page(c)
    p.evaluate(DRIFT_RAW, -1e10)
    p.wait_for_timeout(1500)
    s0 = st(p)
    drag(p, r, s0['R'], s0['R'] + 200)
    p.wait_for_timeout(200)
    s1 = st(p)
    check('2a vorwaerts am Datenende: R folgt dem Zeiger (+200)', s0['rate'] > 1e9 and s1['R'] >= s0['R'] + 150 and abs(s1['R'] - s0['R'] - 200) < 5,
          (s0['rate'], round(s0['R']), round(s1['R'])))
    s1b = st(p)
    drag(p, r, s1b['L'], s1b['L'] + 100)
    p.wait_for_timeout(200)
    s2 = st(p)
    check('2b vorwaerts: L folgt dem Zeiger (+100)', abs(s2['L'] - s1b['L'] - 100) < 5, (round(s1b['L']), round(s2['L'])))
    c2 = ctx_new(br)
    p2, errs2, r2 = open_page(c2)
    p2.evaluate(DRIFT_RAW, -3000)
    p2.wait_for_timeout(400)
    p2.evaluate(DRIFT_RAW, 3000)
    p2.wait_for_timeout(100)
    s3 = st(p2)
    drag(p2, r2, s3['R'], s3['R'] + 100)
    s4 = st(p2)
    check('2c rueckwaerts: R folgt dem Zeiger (+100)', s3['rate'] < 0 and abs(s4['R'] - s3['R'] - 100) < 5, (s3['rate'], round(s3['R']), round(s4['R'])))
    check('2c2 keine Konsolenfehler', not errs2, errs2[:3])
    c2.close()
    if B == 'chromium':
        p.evaluate(DRIFT_RAW, -1e10)
        p.wait_for_timeout(800)
        cdp = c.new_cdp_session(p)
        def touch(typ, x):
            pts = [] if typ == 'touchEnd' else [{'x': r[0] + x, 'y': r[1] + r[2] * Y}]
            cdp.send('Input.dispatchTouchEvent', {'type': typ, 'touchPoints': pts})
        t0 = st(p)
        touch('touchStart', t0['R'])
        for i in range(1, 11): touch('touchMove', t0['R'] + i * 15)
        touch('touchEnd', 0)
        p.wait_for_timeout(200)
        t1 = st(p)
        check('2d Touch vorwaerts am Datenende: R folgt dem Finger (+150)', abs(t1['R'] - t0['R'] - 150) < 5, (round(t0['R']), round(t1['R'])))
    check('2e keine Konsolenfehler', not errs, errs[:3])
    c.close()

    # ── 3 Regler im Menue, beim Laden sichtbar ──
    for label, mobile in (('Desktop', False), ('Handy', True)):
        c = ctx_new(br, mobile, 2)
        p, errs, r = open_page(c)
        p.wait_for_timeout(700)   # das Panel faehrt auf
        hit = p.evaluate("""(() => { const d = document.getElementById('drift'); if (!d) return { ok: false, why: 'kein #drift' };
          const row = d.closest('.ctrl-row'), b = d.getBoundingClientRect(), x = b.left + b.width / 2, y = b.top + b.height / 2;
          const el = document.elementFromPoint(x, y);
          return { ok: el === d, inPanel: !!d.closest('.ctrl-panel'), key: row && row.dataset.key, old: !!document.querySelector('.slider-row'),
                   x: Math.round(x), y: Math.round(y), vh: innerHeight, el: el ? (el.id || el.className) : null }; })()""")
        check('3a %s: Sausen-Regler im Panel, beim Laden sichtbar und greifbar' % label,
              hit['ok'] and hit['inPanel'] and hit['key'] == 'drift' and not hit['old'], hit)
        s = st(p)
        check('3b %s: Ruhe beim Laden (Regler in der Mitte)' % label, s['rate'] == 0 and s['startIndex'] == 0, (s['rate'], s['startIndex']))
        c.close()

    # ── 4 Standard fluessig, Grenzen im Popup ──
    c = ctx_new(br)
    p, errs, r = open_page(c)

    def setr(v):
        p.evaluate("""(v) => { const r = document.getElementById('drift'); r.value = v === 'min' ? r.min : (v === 'max' ? r.max : v); r.dispatchEvent(new Event('input', { bubbles: true })); }""", v)
        p.wait_for_timeout(300)   # die Rate liest die Ansicht im naechsten Bild (WebKit unter Last: mehrere Bilder)
    setr('min')
    p.wait_for_timeout(500)
    s = st(p)
    jumps = sorted(p.evaluate(JUMPS, 1500))
    p90 = jumps[int(len(jumps) * 0.9)] if jumps else 99
    check('4a Standard voll links: 30 Stellen/s, <= 1 Stelle je Bild (90%%)', abs(s['rate'] - 30) < 1e-9 and p90 <= 1.0 and jumps[-1] > 0,
          (s['rate'], round(p90, 3), round(jumps[-1], 3), len(jumps)))
    setr('max')
    s = st(p)
    check('4b Standard voll rechts: -30 Stellen/s', abs(s['rate'] + 30) < 1e-9, s['rate'])

    def popup(key, val):
        p.click('.ctrl-row[data-key="drift"] .ctrl-config-trigger')
        inp = p.locator('.ctrl-config-input[data-config="%s"]' % key).first
        inp.fill(val)
        inp.press('Enter')        # wie ein Mensch: Enter uebernimmt (blur -> change); Escape verwirft
        p.mouse.click(r[0] + 640, r[1] + 60)
    popup('min', '-1e6')
    setr('min')
    s = st(p)
    check('4c Popup min -1e6 -> voll links 1e6 Stellen/s', abs(s['rate'] - 1e6) < 1, s['rate'])
    popup('max', '5000')
    setr('max')
    s = st(p)
    check('4d Popup max 5000 -> voll rechts -5000 Stellen/s', abs(s['rate'] + 5000) < 1, s['rate'])
    setr(0.3)
    s = st(p)
    check('4e Totzone: knapp neben der Mitte steht die Kette', s['rate'] == 0, s['rate'])
    check('4f keine Konsolenfehler', not errs, errs[:3])
    c.close()
    br.close()
R.done()
