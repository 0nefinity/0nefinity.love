// Sheet-Oeffnungstest (Playwright, Pixel-7-Profil). Aufruf:
//   node run.js [baseUrl] [--local /pfad/zum/repo] [--pages /018,/]
// Regel: Tippt man auf Mobil das Symbol im Kunstwerk, klappt das Panel auf ca. 30 % der Viewport-Hoehe auf (nicht nur
// als schmaler Streifen unten). Hat der Nutzer die Hoehe vorher selbst gezogen, gilt seine.
// --local liefert meta.js, meta.css, 0nefinity.js und tools/controls.js aus dem Checkout. Gegenprobe: mit altem Stand rot.
// Playwright/Chromium per Umgebung: PLAYWRIGHT_PATH, CHROME_PATH.
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const CHROME = process.env.CHROME_PATH || undefined;
const args = process.argv.slice(2);
const base = args.find(a => a.startsWith('http')) || 'https://dev.0nefinity.love';
const li = args.indexOf('--local');
const localDir = li >= 0 ? args[li + 1] : null;
const pi = args.indexOf('--pages');
const PAGES = pi >= 0 ? args[pi + 1].split(',') : ['/018', '/'];
const SHOT = process.env.SHOT_DIR || null;
const failures = [];
const check = (name, ok, info) => { console.log(`  ${ok ? 'ok' : 'x '} ${name}${info ? ': ' + info : ''}`); if (!ok) failures.push(`${name} ${info || ''}`); };

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });
    for (const url of PAGES) {
        console.log(url);
        const ctx = await browser.newContext({ ...devices['Pixel 7'] });
        if (localDir) {
            await ctx.route(/\/(meta\.js|meta\.css|0nefinity\.js|tools\/controls\.js)(\?|$)/, async route => {
                const u = route.request().url();
                const name = u.includes('controls.js') ? 'tools/controls.js' : u.includes('meta.css') ? 'meta.css' : u.includes('0nefinity.js') ? '0nefinity.js' : 'meta.js';
                return route.fulfill({ contentType: name.endsWith('.css') ? 'text/css' : 'application/javascript', body: fs.readFileSync(path.join(localDir, name), 'utf8') });
            });
        }
        const p = await ctx.newPage();
        p.on('pageerror', e => check('kein Seitenfehler', false, e.message));
        const cdp = await ctx.newCDPSession(p);
        const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
        await p.goto(base + url, { waitUntil: 'load' });
        await p.waitForTimeout(1800);
        const m = () => p.evaluate(() => {
            const el = document.querySelector('.ctrl-panel');
            const r = el.getBoundingClientRect();
            const vh = window.innerHeight;
            const sym = document.querySelector('.ctrl-symbol-input, [data-key="labels"]');
            const sr = sym && sym.getBoundingClientRect();
            const vis = Math.max(0, vh - r.top);
            return { disp: getComputedStyle(el).display, top: Math.round(r.top), vh, vis, frac: vis / vh, symVisible: !!sr && sr.height > 0 && sr.top >= r.top && sr.bottom <= vh };
        });
        await p.touchscreen.tap(200, 350); await p.waitForTimeout(900);
        let s = await m();
        console.log('  ' + JSON.stringify(s));
        if (SHOT) await p.screenshot({ path: path.join(SHOT, 'sheet' + url.replace(/\W/g, '_') + '-auto.png') });
        check('Panel nach Tap sichtbar', s.disp !== 'none');
        check('Panelhoehe nach Tap ca. 30 %', s.frac >= 0.28 && s.frac <= 0.40, (s.frac * 100).toFixed(1) + ' %');
        // Nutzer zieht das Panel auf ca. 55 %, versteckt es per Tap und holt es zurueck: seine Hoehe gilt
        const target = Math.round(s.vh * 0.45);
        const top = s.top;
        await touch('touchStart', 205, top + 12);
        for (let k = 1; k <= 14; k++) { await touch('touchMove', 205, top + 12 + (target - top) * k / 14); await p.waitForTimeout(16); }
        await touch('touchEnd'); await p.waitForTimeout(600);
        const dragged = await m();
        await p.touchscreen.tap(200, 150); await p.waitForTimeout(500);
        await p.touchscreen.tap(200, 150); await p.waitForTimeout(900);
        const again = await m();
        console.log('  gezogen ' + dragged.top + ' -> nach Aus/An ' + again.top);
        check('selbst gezogene Hoehe gilt', Math.abs(again.top - dragged.top) <= 2, `${dragged.top} vs ${again.top}`);
        await ctx.close();
    }
    await browser.close();
    if (failures.length) { console.log('\nFEHLER:\n' + failures.join('\n')); process.exit(1); }
    console.log('\nalles gruen');
})().catch(e => { console.error(e); process.exit(2); });
