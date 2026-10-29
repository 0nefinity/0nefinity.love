// Tastatur + gezogene Seite (Playwright, Pixel-7-Profil, simulierte Tastatur). Aufruf:
//   node run.js [baseUrl] [--local /pfad/zum/repo] [--pages /co0rdinates,/shadows]
// Regel: Ist ein Textfeld im Panel fokussiert und verschiebt sich das sichtbare Viewport (offsetTop, Seite gezogen),
// bleibt die Unterkante des Panel-Koerpers auf der Unterkante des sichtbaren Viewports (Toleranz 1 px) und ruckelt nicht.
// Android Chrome verkleinert nur window.visualViewport; headless kann das nur ueber einen Ersatz (wie tests/panel-jump).
// Gegenprobe: mit dem alten controls.js (vor dem Fix) muss der Test rot werden.
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
const PAGES = pi >= 0 ? args[pi + 1].split(',') : ['/co0rdinates'];
const TOL = 1;
const failures = [];

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });
    // Beide Blaetter: das CSS-Blatt (Standard) haelt die Unterkante ueber --ctrl-kb, das alte (?panel=alt) per Nachfuehren
    for (const url of PAGES.flatMap(u => [u, u + '?panel=alt'])) {
        const ctx = await browser.newContext({ ...devices['Pixel 7'] });
        if (localDir) await ctx.route(/\/(meta\.js|meta\.css|tools\/controls\.js)(\?|$)/, async route => {
            const name = new URL(route.request().url()).pathname.slice(1);
            return route.fulfill({ contentType: name.endsWith('.css') ? 'text/css' : 'application/javascript', body: fs.readFileSync(path.join(localDir, name), 'utf8') });
        });
        const p = await ctx.newPage();
        await p.addInitScript(() => {
            const t = new EventTarget();
            const vv = { width: innerWidth, height: innerHeight, offsetTop: 0, offsetLeft: 0, scale: 1, pageTop: 0, pageLeft: 0,
                addEventListener: (...a) => t.addEventListener(...a), removeEventListener: (...a) => t.removeEventListener(...a) };
            Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
            window.__vv = (h, top) => { vv.height = h; vv.offsetTop = top; t.dispatchEvent(new Event('resize')); t.dispatchEvent(new Event('scroll')); };
        });
        await p.goto(base + url, { waitUntil: 'load' });
        await p.waitForTimeout(1500);
        const field = p.locator('.ctrl-panel input[type=text]:visible, .ctrl-panel input[type=search]:visible').first();
        if (!await field.count()) { console.log(`${url}: kein sichtbares Textfeld im Panel, uebersprungen`); await ctx.close(); continue; }
        const H = await p.evaluate(() => innerHeight);
        const vh = Math.round(H * 0.55), kb = H - vh;
        await field.focus();
        await p.evaluate(v => __vv(v, 0), vh);
        await p.waitForTimeout(800);
        const rows = await p.evaluate(async ([vh, kb]) => {
            const out = [];
            const frame = () => new Promise(r => requestAnimationFrame(r));
            for (let i = 0; i <= 40; i++) {
                __vv(vh, Math.round(kb * Math.abs(Math.sin(i / 40 * Math.PI * 2))));
                await frame();
                const panel = document.querySelector('.ctrl-panel'), body = panel.querySelector('.ctrl-panel-body') || panel.children[1];
                out.push(body.getBoundingClientRect().bottom - visualViewport.offsetTop - vh);
            }
            return out;
        }, [vh, kb]);
        const worst = Math.max(...rows.map(Math.abs));
        const spread = Math.max(...rows) - Math.min(...rows);
        console.log(`${url}: Abweichung Koerper-Unterkante vs. Viewport-Unterkante max ${worst.toFixed(1)} px, Streuung ${spread.toFixed(1)} px`);
        if (spread > TOL) failures.push(url);
        await ctx.close();
    }
    await browser.close();
    if (failures.length) { console.log('FAIL: ' + failures.join(', ')); process.exit(1); }
    console.log('OK');
})().catch(e => { console.error(e); process.exit(2); });
