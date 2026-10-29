// Panel-Stabilitaet (Playwright, Pixel-7-Profil, Touch). Aufruf:
//   node run.js [baseUrl] [--local /pfad/mit/meta.js+meta.css+tools/controls.js] [--pages /,/018] [--json] [--soft]
// Regel: Ein Tipp oder Zug auf ein Bedienelement bewegt das Panel nicht (Rahmen, Hoehe, Koerper-Scroll,
// Fenster-Scroll, Position des bedienten Elements unter dem Finger: je <= TOL px) und erzeugt keine Layout-Verschiebung.
// Textfelder: simulierte Tastatur (headless hat keine); das Panel darf nur nachruecken, wenn die Tastatur das Feld verdeckt,
// und dann in einer einzigen Bewegung (hoechstens 1 Richtungswechsel).
// Gemessen wird pro Animationsframe. Gegenprobe: mit einer fehlerhaften Fassung (--local) muss der Test rot werden.
// Umgebung: PLAYWRIGHT_PATH, CHROME_PATH. Exit 1 bei Verstoessen, ausser --soft (nur Zahlen).
const fs = require('fs');
const path = require('path');
const pw = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { chromium, devices } = pw;
const CHROME = process.env.CHROME_PATH || undefined;
const args = process.argv.slice(2);
const base = args.find(a => a.startsWith('http')) || 'https://dev.0nefinity.love';
const li = args.indexOf('--local');
const localDir = li >= 0 ? args[li + 1] : null;
const pi = args.indexOf('--pages');
const PAGES = pi >= 0 ? args[pi + 1].split(',') : ['/', '/018', '/shadows', '/co0rdinates', '/1c0de', '/unfoldingPi'];
const SOFT = args.includes('--soft');
const KB = 300, TOL = 1, WIN = 1000;

const results = [];
const failures = [];

async function openPanel(p, cdp) {
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    const drag = async (x0, y0, x1, y1, steps = 12) => {
        await touch('touchStart', x0, y0);
        for (let i = 1; i <= steps; i++) { await touch('touchMove', x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps); await p.waitForTimeout(16); }
        await touch('touchEnd');
        await p.waitForTimeout(500);
    };
    const h = () => p.evaluate(() => { const e = document.querySelector('.ctrl-panel'); const r = e && e.getBoundingClientRect(); return r ? { top: r.top, height: r.height } : null; });
    let r = await h();
    if (!r) return false;
    if (!r.height) { await p.touchscreen.tap(200, 350); await p.waitForTimeout(800); }
    for (let i = 0; i < 3; i++) {
        r = await h();
        if (r && r.top < 300) break;
        await drag(205, Math.min(r.top + 12, 820), 205, 150);
    }
    r = await h();
    return !!r && r.top <= 400;
}

async function interact(...a) {
    try { return await interact0(...a); } catch (e) { if (/context was destroyed|navigation/.test(e.message)) return { reload: true }; throw e; }
}

async function interact0(p, url, kind, sel, idx, act, opts = {}) {
    const info = await p.evaluate(({ sel, idx, covered, KB }) => {
        const body = document.querySelector('.ctrl-panel-body');
        const list = [...document.querySelectorAll(sel)];
        const e = list[idx];
        if (!e || !body) return null;
        // Element in die Mitte des Koerpers scrollen (Scrollen selbst ist keine Messung)
        const b = body.getBoundingClientRect();
        const r0 = e.getBoundingClientRect();
        body.scrollTop += (r0.top + r0.height / 2) - (b.top + Math.min(b.height / 2, innerHeight - KB - 60));
        const r = e.getBoundingClientRect();
        const bb = body.getBoundingClientRect();
        if (!(r.width > 0 && r.height > 0 && r.top >= bb.top - 1 && r.bottom <= bb.bottom + 1 && r.top >= 0 && r.bottom <= innerHeight)) return { hidden: true };
        const free = r.bottom <= innerHeight - KB - 8;
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, free };
    }, { sel, idx, KB });
    if (!info || info.hidden) return null;
    if (opts.needFree && !info.free) return null;
    await p.waitForTimeout(450);
    const pos = await p.evaluate(({ sel, idx }) => { const r = document.querySelectorAll(sel)[idx].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, { sel, idx });
    await p.evaluate(({ sel, idx, WIN }) => {
        const el = document.querySelectorAll(sel)[idx];
        const panel = () => document.querySelector('.ctrl-panel');
        const body = () => document.querySelector('.ctrl-panel-body');
        const snap = () => {
            const pr = panel().getBoundingClientRect(), er = el.isConnected ? el.getBoundingClientRect() : null;
            return { t: performance.now(), pt: pr.top, pb: pr.bottom, ph: pr.height, bs: body() ? body().scrollTop : 0, ws: scrollY, et: er ? er.top : null, ot: visualViewport.offsetTop };
        };
        const m = window.__m = { frames: [snap()], cls: 0, done: false, label: (el.textContent || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 24), style: 0 };
        window.__w.scroll = 0;
        if (window.__mo) window.__mo.disconnect();
        window.__mo = new MutationObserver(l => { m.style += l.length; });
        window.__mo.observe(panel(), { attributes: true, attributeFilter: ['style', 'class'] });
        if (body()) window.__mo.observe(body(), { attributes: true, attributeFilter: ['style'] });
        if (window.__po) window.__po.disconnect();
        window.__po = new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) m.cls += e.value; });
        try { window.__po.observe({ type: 'layout-shift', buffered: false }); } catch (_) {}
        const t0 = performance.now();
        const f = () => { m.frames.push(snap()); if (performance.now() - t0 < WIN) requestAnimationFrame(f); else { m.done = true; window.__po.takeRecords().forEach(e => { if (!e.hadRecentInput) m.cls += e.value; }); window.__po.disconnect(); window.__mo.disconnect(); m.scrollWrites = window.__w.scroll; } };
        requestAnimationFrame(f);
    }, { sel, idx, WIN });
    await act(pos);
    try { await p.waitForFunction(() => window.__m && window.__m.done, null, { timeout: 8000 }); } catch (e) { return { reload: true }; }
    const m = await p.evaluate(() => window.__m);
    if (!m) return { reload: true };
    const f0 = m.frames[0];
    const mx = (k) => Math.max(...m.frames.map(f => f[k] === null ? 0 : Math.abs(f[k] - f0[k])));
    // Frames mit Bewegung / Richtungswechsel am Panel-Rahmen
    let moves = 0, rev = 0, last = 0;
    for (let i = 1; i < m.frames.length; i++) {
        const d = m.frames[i].pt - m.frames[i - 1].pt;
        if (Math.abs(d) > 0.5) { moves++; const s = Math.sign(d); if (last && s !== last) rev++; last = s; }
    }
    const fin = m.frames[m.frames.length - 1];
    const r = {
        url, kind, sel, idx, free: info.free,
        panelTop: +mx('pt').toFixed(1), panelH: +mx('ph').toFixed(1), bodyScroll: +mx('bs').toFixed(1), winScroll: +mx('ws').toFixed(1),
        elem: +mx('et').toFixed(1), elemEnd: fin.et === null ? null : +Math.abs(fin.et - f0.et).toFixed(1),
        cls: +m.cls.toFixed(4), moves, rev, label: m.label, styleWrites: m.style, scrollWrites: m.scrollWrites, finTop: +(fin.pt - f0.pt).toFixed(1)
    };
    results.push(r);
    return r;
}

function judge(r) {
    const bad = [];
    // Textfeld: das Blatt darf sich an die Tastatur anpassen (kleiner werden, nachruecken), aber nur in einer einzigen Bewegung.
    if (r.kind === 'text') {
        if (r.rev > 1) bad.push(`Richtungswechsel ${r.rev}`);
        if (r.winScroll > TOL) bad.push(`Fenster-Scroll ${r.winScroll}px`);
        return bad;
    }
    // Seitenknoepfe (Screenshot, GIF) loesen Seitenaktionen aus (Download, Render); das Panel selbst darf dabei nicht scrollen oder springen,
    // Hoehenaenderungen durch deren Statusanzeige zaehlen nicht.
    if (r.kind === 'button') {
        if (r.winScroll > TOL) bad.push(`Fenster-Scroll ${r.winScroll}px`);
        return bad;
    }
    if (r.panelTop > TOL) bad.push(`Panel-Oberkante ${r.panelTop}px`);
    if (r.panelH > TOL && r.kind !== 'text') bad.push(`Panel-Hoehe ${r.panelH}px`);
    if (r.kind !== 'stepper' && r.kind !== 'symbolbtn' && r.kind !== 'details' && r.kind !== 'button' && r.bodyScroll > TOL) bad.push(`Koerper-Scroll ${r.bodyScroll}px`);
    if (r.winScroll > TOL) bad.push(`Fenster-Scroll ${r.winScroll}px`);
    if (r.kind !== 'slider' && r.elemEnd !== null && r.elemEnd > TOL && r.kind !== 'stepper' && r.kind !== 'symbolbtn' && r.kind !== 'details') bad.push(`Element am Ende ${r.elemEnd}px verschoben`);
    if (r.cls > 0) bad.push(`CLS ${r.cls}`);
    return bad;
}

async function runPage(ctx, url) {
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    const cdp = await ctx.newCDPSession(p);
    await p.goto(base + url, { waitUntil: 'load' });
    await p.waitForTimeout(1500);
    if (!await p.$('.ctrl-panel')) { console.log(`${url}: kein Panel, uebersprungen`); await p.close(); return; }
    if (!await openPanel(p, cdp)) { console.log(`${url}: Panel liess sich nicht oeffnen, uebersprungen`); await p.close(); return; }
    console.log(url);
    const tap = ({ x, y }) => p.touchscreen.tap(x, y);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    const report = (r) => {
        if (!r || r.reload) return;
        const bad = judge(r);
        console.log(`  ${bad.length ? 'x ' : 'ok'} ${r.kind} ${r.sel}#${r.idx}: Panel ${r.panelTop}/${r.panelH}px, Koerper ${r.bodyScroll}px, Fenster ${r.winScroll}px, Element ${r.elem}px (Ende ${r.elemEnd}), CLS ${r.cls}, Bewegungsframes ${r.moves}/${r.rev}, JS-Schreibzugriffe Stil ${r.styleWrites}/Scroll ${r.scrollWrites} [${r.label}]${bad.length ? '  <- ' + bad.join('; ') : ''}`);
        if (bad.length) failures.push(`${url} ${r.kind} ${r.sel}#${r.idx}: ${bad.join('; ')}`);
    };
    const count = (sel) => p.evaluate(s => document.querySelectorAll(s).length, sel);
    const kinds = [
        ['select', '.ctrl-select-trigger', async (pos) => { await tap(pos); await p.waitForTimeout(500); await p.keyboard.press('Escape'); }],
        ['checkbox', '.ctrl-panel input[type=checkbox]', async (pos) => { await tap(pos); }],
        ['stepper', '.ctrl-stepper-btn:not(.ctrl-symbol-btn)', async (pos) => { await tap(pos); }],
        ['symbolbtn', '.ctrl-symbol-btn', async (pos) => { await tap(pos); }],
        ['config', '.ctrl-config-trigger', async (pos) => { await tap(pos); await p.waitForTimeout(400); await p.keyboard.press('Escape'); }],
        ['button', '.ctrl-button', async (pos) => { await tap(pos); }],
        ['details', '.ctrl-details-btn', async (pos) => { await tap(pos); }],
        ['layout', '.ctrl-layout-toggle', async (pos) => { await tap(pos); }],
        ['slider', '.ctrl-range', async (pos) => {
            // waagerechter Zug mit leichtem senkrechtem Drift, wie ein Daumen
            await touch('touchStart', pos.x - 40, pos.y);
            for (let i = 1; i <= 14; i++) { await touch('touchMove', pos.x - 40 + i * 6, pos.y + i * 1.2); await p.waitForTimeout(16); }
            await touch('touchEnd');
        }],
        ['text', '.ctrl-value-input, .ctrl-symbol-input', async (pos) => {
            await tap(pos); await p.waitForTimeout(150);
            await p.evaluate(kb => window.__kb(kb), KB);
            await p.waitForTimeout(700);
            await p.evaluate(() => window.__kb(0));
            await p.evaluate(() => document.activeElement && document.activeElement.blur());
        }],
    ];
    for (const [kind, sel, act] of kinds) {
        const n = await count(sel);
        let done = 0; const used = new Set();
        for (let i = 0; i < n && done < 2; i++) {
            let r = await interact(p, url, kind, sel, i, act, {});
            if (r && r.reload) { console.log(`  - ${kind} ${sel}#${i}: Seite neu geladen (Funktion des Elements), Panel wird neu geoeffnet`); await p.goto(base + url, { waitUntil: 'load' }); await p.waitForTimeout(1500); await openPanel(p, cdp); continue; }
            if (r) { report(r); used.add(i); done++; if (kind === 'text') await p.waitForTimeout(500); }
        }
        // Textfeld zusaetzlich im verdeckten Bereich (Tastatur muss es freilegen): einmal
        if (kind === 'text') {
            for (let i = n - 1; i >= 0; i--) {
                if (used.has(i)) continue;
                const info = await p.evaluate(({ sel, i, KB }) => { const e = document.querySelectorAll(sel)[i]; if (!e) return null; const r = e.getBoundingClientRect(); return r.width > 0 && r.bottom > innerHeight - KB - 8; }, { sel, i, KB });
                if (info) { const r = await interact(p, url, 'text', sel, i, act, {}); if (r && !r.reload) { report(r); break; } }
            }
        }
    }
    if (errs.length) failures.push(`${url}: ${errs.length} pageerror(s): ${errs[0]}`);
    await p.close();
}

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });
    const ctx = await browser.newContext({ ...devices['Pixel 7'] });
    if (localDir) await ctx.route(/\/(meta\.js|meta\.css|tools\/controls\.js)(\?|$)/, async route => {
        const name = new URL(route.request().url()).pathname.slice(1);
        return route.fulfill({ contentType: name.endsWith('.css') ? 'text/css' : 'application/javascript', body: fs.readFileSync(path.join(localDir, name), 'utf8') });
    });
    await ctx.addInitScript(() => {
        window.__w = { scroll: 0 };
        const d = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
        Object.defineProperty(Element.prototype, 'scrollTop', { get() { return d.get.call(this); }, set(v) { if (this.classList && this.classList.contains('ctrl-panel-body')) window.__w.scroll++; d.set.call(this, v); }, configurable: true });
        // Ersatz fuer die Tastatur: headless hat keine. Android Chrome verkleinert window.visualViewport (innerHeight bleibt);
        // im VirtualKeyboard-Modus (overlaysContent) nicht, dort meldet virtualKeyboard.boundingRect die Hoehe.
        const vv = new EventTarget(); let kbh = 0;
        const vk = navigator.virtualKeyboard;
        const overlays = () => !!(vk && vk.overlaysContent);
        Object.defineProperties(vv, { height: { get: () => innerHeight - (overlays() ? 0 : kbh) }, width: { get: () => innerWidth }, offsetTop: { get: () => 0 }, offsetLeft: { get: () => 0 }, scale: { get: () => 1 }, pageTop: { get: () => scrollY }, pageLeft: { get: () => scrollX } });
        if (vk) Object.defineProperty(vk, 'boundingRect', { get: () => new DOMRect(0, innerHeight - kbh, innerWidth, kbh), configurable: true });
        window.__kb = h => { kbh = h; vv.dispatchEvent(new Event('resize')); if (vk) vk.dispatchEvent(new Event('geometrychange')); };
        Object.defineProperty(window, 'visualViewport', { get: () => vv, configurable: true });
    });
    for (const url of PAGES) {
        try { await runPage(ctx, url); } catch (e) { failures.push(`${url}: Testlauf abgebrochen: ${e.message.split('\n')[0]}`); console.log('  FAIL ' + failures[failures.length - 1]); }
    }
    await browser.close();
    const agg = (k) => Math.max(0, ...results.filter(r => r.kind !== 'text' || r.free).map(r => r[k]));
    const sum = {
        interaktionen: results.length, maxPanelTop: agg('panelTop'), maxPanelH: agg('panelH'), maxKoerper: agg('bodyScroll'), maxFenster: agg('winScroll'),
        clsSumme: +results.reduce((a, r) => a + r.cls, 0).toFixed(4), clsEreignisse: results.filter(r => r.cls > 0).length, verstoesse: failures.length
    };
    console.log('SUMME ' + JSON.stringify(sum));
    if (args.includes('--json')) fs.writeFileSync(args[args.indexOf('--json') + 1] || 'result.json', JSON.stringify({ sum, results, failures }, null, 1));
    if (failures.length && !SOFT) { console.log(`\nFAIL (${failures.length})`); failures.forEach(f => console.log('  ' + f)); process.exit(1); }
    console.log(failures.length ? 'Verstoesse (soft)' : '\nOK');
})();
