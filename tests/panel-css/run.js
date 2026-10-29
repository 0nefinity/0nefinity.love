// Vergleich altes Handy-Blatt gegen ?panel=css (Playwright, Pixel-7-Profil). Aufruf:
//   node run.js [baseUrl] [--local /pfad/zum/repo] [--pages /pointfont,/1c0de]
// Je Seite und Variante: Stil-/Klassen-Schreibzugriffe auf Panel und Panel-Koerper (die Lage des Blatts) waehrend 60 Viewport-Ereignissen (Tastatur offen, Seite gezogen),
// Unterkante des Panels gegen Unterkante des sichtbaren Bereichs, Antippen/Ziehen am Griff.
// Tastatur: alt = verkleinertes visualViewport (Android ohne interactive-widget), css = verkleinertes Layout-Viewport
// (interactive-widget=resizes-content). Regel fuer css: 0 Panel-Schreibzugriffe bei Viewport-Ereignissen, Unterkante 0 px,
// Tipp schliesst und oeffnet, Zug nach oben vergroessert. Umgebung: PLAYWRIGHT_PATH, CHROME_PATH. Exit 1 bei Verstoss.
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const CHROME = process.env.CHROME_PATH || undefined;
const args = process.argv.slice(2);
const base = args.find(a => a.startsWith('http')) || 'https://dev.0nefinity.love';
const li = args.indexOf('--local');
const localDir = li >= 0 ? args[li + 1] : null;
const pi = args.indexOf('--pages');
const PAGES = pi >= 0 ? args[pi + 1].split(',') : ['/pointfont', '/1c0de'];
const failures = [];

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });
    for (const page of PAGES) for (const variant of ['alt', 'css']) {
        const ctx = await browser.newContext({ ...devices['Pixel 7'] });
        if (localDir) await ctx.route(/\/(meta\.js|meta\.css|tools\/controls\.js)(\?|$)/, async route => {
            const name = new URL(route.request().url()).pathname.slice(1);
            return route.fulfill({ contentType: name.endsWith('.css') ? 'text/css' : 'application/javascript', body: fs.readFileSync(path.join(localDir, name), 'utf8') });
        });
        const p = await ctx.newPage();
        const errs = [];
        p.on('pageerror', e => errs.push(e.message));
        await p.addInitScript(() => {
            const t = new EventTarget();
            const vv = { width: innerWidth, height: innerHeight, offsetTop: 0, offsetLeft: 0, scale: 1, pageTop: 0, pageLeft: 0,
                addEventListener: (...a) => t.addEventListener(...a), removeEventListener: (...a) => t.removeEventListener(...a) };
            Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
            window.__vv = (h, top) => { vv.height = h; vv.offsetTop = top; t.dispatchEvent(new Event('resize')); t.dispatchEvent(new Event('scroll')); };
            window.__pw = 0;
            new MutationObserver(l => { for (const m of l) if (m.target.matches && m.target.matches('.ctrl-panel, .ctrl-panel-body')) window.__pw++; })
                .observe(document, { attributes: true, attributeFilter: ['style', 'class'], subtree: true });
        });
        await p.goto(base + page + (variant === 'css' ? '?panel=css' : ''), { waitUntil: 'load' });
        await p.waitForTimeout(2000);
        if (!await p.$('.ctrl-panel')) { console.log(`${page}: kein Panel, uebersprungen`); await ctx.close(); continue; }
        const H = await p.evaluate(() => innerHeight), W = await p.evaluate(() => innerWidth);
        const rect = () => p.evaluate(() => { const b = document.querySelector('.ctrl-panel').getBoundingClientRect(); return { top: b.top, h: b.height, bottom: b.bottom }; });
        const handle = () => p.evaluate(() => { const b = document.querySelector('.ctrl-drag-handle').getBoundingClientRect(); return { x: b.left + 20, y: b.top + b.height / 2 }; });

        // Verstecktes Panel (z. B. /018): wie in tests/panel-stabil per Tipp auf die Szene einblenden
        if (!(await rect()).h) { await p.touchscreen.tap(200, 350); await p.waitForTimeout(800); }
        // Griff: Tipp zu, Tipp auf, Zug nach oben
        const r0 = await rect();
        let h = await handle();
        await p.touchscreen.tap(h.x, h.y); await p.waitForTimeout(500);
        const zu = await rect();
        h = await handle();
        await p.touchscreen.tap(h.x, h.y); await p.waitForTimeout(500);
        const auf = await rect();
        // Ist schon alles sichtbar, kann ein Zug nach oben nichts vergroessern
        const mehr = await p.evaluate(() => { const b = document.querySelector('.ctrl-panel-body'); return b.scrollHeight > b.clientHeight + 1; });
        const cdp = await ctx.newCDPSession(p);
        const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
        h = await handle();
        await touch('touchStart', h.x, h.y);
        for (let i = 1; i <= 10; i++) { await touch('touchMove', h.x, h.y - i * 15); await p.waitForTimeout(16); }
        await touch('touchEnd'); await p.waitForTimeout(400);
        const hoch = await rect();

        // Tastatur + gezogene Seite
        let kbBottom = null, vpWrites = null;
        const field = p.locator('.ctrl-panel input[type=text], .ctrl-panel input[type=search], .ctrl-panel textarea').first();
        if (await field.count()) {
            await field.focus();
            const vh = Math.round(H * 0.6);
            if (variant === 'css') await p.setViewportSize({ width: W, height: vh });
            await p.evaluate(v => __vv(v, 0), vh);
            await p.waitForTimeout(800);
            kbBottom = +((await rect()).bottom - vh).toFixed(1);
            const w0 = await p.evaluate(() => window.__pw);
            await p.evaluate(async vh => {
                const frame = () => new Promise(r => requestAnimationFrame(r));
                for (let i = 0; i < 60; i++) { __vv(vh, Math.round(30 * Math.abs(Math.sin(i / 10)))); await frame(); }
            }, vh);
            vpWrites = await p.evaluate(() => window.__pw) - w0;
        }
        const line = { page, variant, start: Math.round(r0.h), zu: Math.round(zu.h), auf: Math.round(auf.h), hoch: Math.round(hoch.h), mehr, kbBottom, vpWrites, errors: errs.length };
        console.log(JSON.stringify(line));
        if (variant === 'css') {
            if (vpWrites) failures.push(`${page} css: ${vpWrites} Panel-Schreibzugriffe bei 60 Viewport-Ereignissen`);
            if (kbBottom !== null && Math.abs(kbBottom) > 1) failures.push(`${page} css: Unterkante ${kbBottom}px neben der Tastatur`);
            if (!(zu.h < r0.h - 20)) failures.push(`${page} css: Tipp schliesst nicht`);
            if (Math.abs(auf.h - r0.h) > 1) failures.push(`${page} css: Tipp oeffnet nicht auf die alte Hoehe`);
            if (mehr && !(hoch.h > auf.h + 50)) failures.push(`${page} css: Zug nach oben vergroessert nicht`);
        }
        if (errs.length) failures.push(`${page} ${variant}: pageerror ${errs[0]}`);
        await ctx.close();
    }
    await browser.close();
    if (failures.length) { console.log('FAIL'); failures.forEach(f => console.log('  ' + f)); process.exit(1); }
    console.log('OK');
})().catch(e => { console.error(e); process.exit(2); });
