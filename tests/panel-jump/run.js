// Panel-Sprung-Test (Playwright, Pixel-7-Profil, simulierte Tastatur). Aufruf:
//   node run.js [baseUrl] [--local /pfad/zum/repo] [--all | --pages /018,/]
// Regel: das bediente Element bleibt auf seiner Bildschirmposition (Toleranz 1 px), auch wenn die Tastatur aufgeht.
// Gemessen wird pro Frame; zaehlt nur, was mindestens 2 Frames anhaelt oder am Ende noch da ist.
// Tastatur: Android Chrome verkleinert nur window.visualViewport (innerHeight bleibt); headless kann das nur ueber einen Ersatz.
// --local liefert meta.js, meta.css und tools/controls.js aus dem Checkout. Gegenprobe: mit altem controls.js muss der Test rot werden.
// Playwright/Chromium per Umgebung: PLAYWRIGHT_PATH, CHROME_PATH.
const fs = require('fs');
const path = require('path');
const { panelPages } = require('../lib/pages.js');
const pw = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { chromium, devices } = pw;
const CHROME = process.env.CHROME_PATH || undefined;

const args = process.argv.slice(2);
const base = args.find(a => a.startsWith('http')) || 'https://dev.0nefinity.love';
const li = args.indexOf('--local');
const localDir = li >= 0 ? args[li + 1] : null;
const pi = args.indexOf('--pages');
const repo = path.resolve(__dirname, '../..');
const PAGES = args.includes('--all') ? panelPages(repo) : pi >= 0 ? args[pi + 1].split(',') : ['/018', '/'];
const KB = 300;
const TOL = 1;

const failures = [];
const fail = (m) => { failures.push(m); console.log('  FAIL ' + m); };

async function run(p, cdp, url) {
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    const drag = async (x0, y0, x1, y1, steps = 12) => {
        await touch('touchStart', x0, y0);
        for (let i = 1; i <= steps; i++) { await touch('touchMove', x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps); await p.waitForTimeout(16); }
        await touch('touchEnd');
        await p.waitForTimeout(500);
    };
    await p.goto(base + url, { waitUntil: 'load' });
    await p.waitForTimeout(1500);
    if (!await p.$('.ctrl-panel')) return console.log(`${url}: kein Panel, uebersprungen`);
    // Panel oeffnen: Seitensymbol antippen blendet es ein, Griff nach oben ziehen
    await p.touchscreen.tap(200, 350); await p.waitForTimeout(800);
    // Griff (Oberkante des Panels) nach oben ziehen, bis das Panel weit offen ist
    for (let i = 0; i < 3; i++) {
        const top = await p.evaluate(() => document.querySelector('.ctrl-panel').getBoundingClientRect().top);
        if (top < 300) break;
        await drag(205, Math.min(top + 12, 820), 205, 150);
    }
    const openTop = await p.evaluate(() => document.querySelector('.ctrl-panel').getBoundingClientRect().top);
    if (openTop > 400) return console.log(`  - Panel liess sich nicht oeffnen (Oberkante ${Math.round(openTop)}px), uebersprungen`);

    // misst das Element ueber ein Fenster, liefert maximale dauerhafte und Endabweichung
    const measure = async (sel, idx, act, ms = 900) => {
        const before = await p.evaluate(({ sel, idx }) => { const e = document.querySelectorAll(sel)[idx]; if (!e) return null; const r = e.getBoundingClientRect(); return r.top + r.height / 2; }, { sel, idx });
        if (before === null) return null;
        await p.evaluate(({ sel, idx, ms }) => {
            window.__m = { dev: [], done: false };
            const t0 = performance.now();
            const f = () => { const e = document.querySelectorAll(sel)[idx]; const r = e && e.getBoundingClientRect(); window.__m.dev.push(r ? r.top + r.height / 2 : null); if (performance.now() - t0 < ms) requestAnimationFrame(f); else window.__m.done = true; };
            requestAnimationFrame(f);
        }, { sel, idx, ms });
        await act();
        await p.waitForFunction(() => window.__m.done, null, { timeout: 5000 });
        const dev = (await p.evaluate(() => window.__m.dev)).map(y => y === null ? null : y - before);
        let sustained = 0;
        for (let i = 1; i < dev.length; i++) if (dev[i] !== null && dev[i - 1] !== null && Math.abs(dev[i]) > TOL && Math.abs(dev[i - 1]) > TOL) sustained = Math.max(sustained, Math.min(Math.abs(dev[i]), Math.abs(dev[i - 1])));
        const last = dev[dev.length - 1];
        return { sustained: Math.round(sustained), final: last === null ? null : Math.round(last) };
    };
    const center = (sel, idx) => p.evaluate(({ sel, idx }) => { const r = document.querySelectorAll(sel)[idx].getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, { sel, idx });
    const check = (name, r) => {
        if (!r) return;
        const bad = r.sustained > TOL || (r.final !== null && Math.abs(r.final) > TOL);
        console.log(`  ${bad ? 'x' : 'ok'} ${name}: dauerhaft ${r.sustained}px, am Ende ${r.final}px`);
        if (bad) fail(`${url}: ${name} sprang (dauerhaft ${r.sustained}px, Ende ${r.final}px)`);
    };
    const kbOff = () => p.evaluate(() => window.__kb(0));
    const tapAt = async (sel, idx) => { const [x, y] = await center(sel, idx); await p.touchscreen.tap(x, y); };

    await p.waitForTimeout(800);
    // Eingabefelder im Panel: antippen, Tastatur auf, Tastatur zu
    for (const [name, sel] of [['Symbolfeld', '.ctrl-symbol-input'], ['Suchfeld', '.ctrl-panel-body input[type=search]:not(.ctrl-symbol-input)']]) {
        // Nur ein Feld, das sichtbar ist und die Tastatur nicht verdeckt: sonst muss das Panel legitim nachruecken
        const idx = await p.evaluate(({ sel, KB }) => {
            const body = document.querySelector('.ctrl-panel-body').getBoundingClientRect();
            return [...document.querySelectorAll(sel)].findIndex(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.top >= body.top + 4 && r.bottom <= Math.min(body.bottom, innerHeight - KB - 8); });
        }, { sel, KB });
        if (idx < 0) { console.log(`  - ${name}: kein Feld im freien Bereich, uebersprungen`); continue; }
        const r = await measure(sel, idx, async () => { await tapAt(sel, idx); await p.waitForTimeout(150); await p.evaluate(kb => window.__kb(kb), KB); });
        check(`${name} antippen + Tastatur`, r);
        await kbOff(); await p.evaluate(() => document.activeElement && document.activeElement.blur()); await p.waitForTimeout(600);
    }
    // Plus, Minus: Knopf bleibt unter dem Finger
    const nb = await p.evaluate(() => document.querySelectorAll('.ctrl-symbol-btn').length);
    for (let i = 0; i < nb; i++) {
        const label = await p.evaluate(i => document.querySelectorAll('.ctrl-symbol-btn')[i].textContent, i);
        const dis = await p.evaluate(i => document.querySelectorAll('.ctrl-symbol-btn')[i].disabled, i);
        if (dis) continue;
        // Ganz nach unten gescrollt: sonst gibt es bei scrollTop 0 nichts zum Nachrutschen und die Zeile darueber fehlt schlicht
        await p.evaluate(() => { const b = document.querySelector('.ctrl-panel-body'); b.scrollTop = b.scrollHeight; });
        await p.waitForTimeout(300);
        const r = await measure('.ctrl-symbol-btn', i, async () => { await tapAt('.ctrl-symbol-btn', i); });
        check(`Knopf ${label}`, r);
        if (label === '+') { await p.waitForTimeout(300); }
    }
    return true;
}

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });
    const ctx = await browser.newContext({ ...devices['Pixel 7'] });
    if (localDir) await ctx.route(/\/(meta\.js|meta\.css|tools\/controls\.js)(\?|$)/, async route => {
        const u = route.request().url();
        const name = u.includes('controls.js') ? 'tools/controls.js' : u.includes('meta.css') ? 'meta.css' : 'meta.js';
        return route.fulfill({ contentType: name.endsWith('.css') ? 'text/css' : 'application/javascript', body: fs.readFileSync(path.join(localDir, name), 'utf8') });
    });
    await ctx.addInitScript(() => {
        const vv = new EventTarget(); let kbh = 0;
        Object.defineProperties(vv, { height: { get: () => innerHeight - kbh }, width: { get: () => innerWidth }, offsetTop: { get: () => 0 }, offsetLeft: { get: () => 0 }, scale: { get: () => 1 }, pageTop: { get: () => 0 }, pageLeft: { get: () => 0 } });
        window.__kb = h => { kbh = h; vv.dispatchEvent(new Event('resize')); };
        Object.defineProperty(window, 'visualViewport', { get: () => vv, configurable: true });
    });
    for (const url of PAGES) {
        const p = await ctx.newPage();
        const errs = [];
        p.on('pageerror', e => errs.push(e.message));
        const cdp = await ctx.newCDPSession(p);
        console.log(url);
        try { await run(p, cdp, url); } catch (e) { fail(`${url}: Testlauf abgebrochen: ${e.message.split('\n')[0]}`); }
        if (errs.length) fail(`${url}: ${errs.length} pageerror(s): ${errs[0]}`);
        await p.close();
    }
    await browser.close();
    if (failures.length) { console.log(`\nFAIL (${failures.length})`); process.exit(1); }
    console.log(`\nOK: ${PAGES.length} Seiten`);
})();
