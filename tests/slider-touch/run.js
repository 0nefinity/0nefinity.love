// Regler-Touch-Test (Playwright, Pixel-7-Profil). Aufruf:
//   node run.js [baseUrl] [--local /pfad/zum/repo] [--pages /shadows,/018]
// Regel: Touch-Regler uebernehmen erst bei klar waagerechter Bewegung. Senkrechtes Wischen scrollt das Panel und laesst den Wert,
// Antippen der Bahn aendert nichts. Maus (Klick auf die Bahn) bleibt wie sie war.
// --local liefert meta.js, meta.css und tools/controls.js aus dem Checkout. Gegenprobe: mit altem controls.js/meta.css muss der Test rot werden.
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
const PAGES = pi >= 0 ? args[pi + 1].split(',') : ['/shadows', '/018'];
const failures = [];
const check = (url, name, ok, info) => { console.log(`  ${ok ? 'ok' : 'x '} ${name}${info ? ': ' + info : ''}`); if (!ok) failures.push(`${url}: ${name} ${info || ''}`); };

async function run(ctx, url) {
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    const cdp = await ctx.newCDPSession(p);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    const gesture = async (x0, y0, x1, y1, steps = 14) => {
        await touch('touchStart', x0, y0);
        for (let i = 1; i <= steps; i++) { await touch('touchMove', x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps); await p.waitForTimeout(16); }
        await touch('touchEnd');
        await p.waitForTimeout(400);
    };
    await p.goto(base + url, { waitUntil: 'load' });
    await p.waitForTimeout(1500);
    await p.touchscreen.tap(200, 350); await p.waitForTimeout(800);
    for (let i = 0; i < 3; i++) {
        const top = await p.evaluate(() => document.querySelector('.ctrl-panel').getBoundingClientRect().top);
        if (top < 300) break;
        await gesture(205, Math.min(top + 12, 820), 205, 150);
    }
    const info = () => p.evaluate(() => {
        const body = document.querySelector('.ctrl-panel-body').getBoundingClientRect();
        const list = [...document.querySelectorAll('.ctrl-panel input.ctrl-range')].map((e, i) => { const r = e.getBoundingClientRect(); const k = e.closest('[data-key]'); return { i, key: k ? k.dataset.key : '', left: r.left, width: r.width, mid: r.top + r.height / 2, min: +e.min, max: +e.max, value: +e.value, vis: r.width > 0 && r.top > body.top + 10 && r.bottom < body.bottom - 10 }; });
        return list.filter(x => x.vis && !/speed|auto/i.test(x.key));
    });
    const val = i => p.evaluate(i => +document.querySelectorAll('.ctrl-panel input.ctrl-range')[i].value, i);
    const scroll = () => p.evaluate(() => document.querySelector('.ctrl-panel-body').scrollTop);
    // Regler mit Auto (Drift) scheiden aus: der Wert muss von selbst stillstehen
    const before = await info();
    await p.waitForTimeout(600);
    const after = await info();
    const sliders = before.filter(b => { const a = after.find(x => x.i === b.i); return a && a.value === b.value; });
    if (!sliders.length) { check(url, 'sichtbarer Regler gefunden', false); await p.close(); return; }
    const s = sliders[0];
    // Thumb-Position und eine Stelle auf der Bahn weit davon entfernt
    const thumbX = s.left + (s.value - s.min) / (s.max - s.min) * s.width;
    const farX = thumbX > s.left + s.width / 2 ? s.left + s.width * 0.15 : s.left + s.width * 0.85;
    // 1. Antippen der Bahn
    const v0 = await val(s.i);
    await p.touchscreen.tap(farX, s.mid); await p.waitForTimeout(300);
    check(url, 'Antippen der Bahn aendert den Wert nicht', (await val(s.i)) === v0, `${v0} -> ${await val(s.i)}`);
    // 2. senkrechtes Wischen ab dem Regler
    await p.evaluate(() => { document.querySelector('.ctrl-panel-body').scrollTop = 0; });
    const sc0 = await scroll();
    await gesture(thumbX, s.mid + 60 > 800 ? s.mid : s.mid, thumbX + 4, s.mid - 140);
    const v1 = await val(s.i), sc1 = await scroll();
    check(url, 'senkrechtes Wischen laesst den Wert', v1 === v0, `${v0} -> ${v1}`);
    check(url, 'senkrechtes Wischen scrollt das Panel', sc1 !== sc0, `scrollTop ${sc0} -> ${sc1}`);
    // 3. waagerechtes Ziehen (neue Messung, Panel kann gescrollt haben)
    const cur = await info();
    const s2 = cur.find(x => x.i === s.i) || cur[0];
    const tx = s2.left + (s2.value - s2.min) / (s2.max - s2.min) * s2.width;
    const dir = tx > s2.left + s2.width / 2 ? -1 : 1;
    const vb = await val(s2.i);
    await gesture(tx, s2.mid, tx + dir * s2.width * 0.3, s2.mid + 3);
    const vc = await val(s2.i);
    check(url, 'waagerechtes Ziehen aendert den Wert', vc !== vb, `${vb} -> ${vc}`);
    // 4. Maus bleibt wie sie war
    const mctx = await ctx.browser().newContext({ viewport: { width: 1200, height: 800 } });
    const m = await mctx.newPage();
    if (localDir) await routeLocal(mctx);
    await m.goto(base + url, { waitUntil: 'load' }); await m.waitForTimeout(1500);
    const box = await m.evaluate(() => { const e = [...document.querySelectorAll('.ctrl-panel input.ctrl-range')].find(e => e.getBoundingClientRect().width > 50); if (!e) return null; const r = e.getBoundingClientRect(); return { i: [...document.querySelectorAll('.ctrl-panel input.ctrl-range')].indexOf(e), left: r.left, width: r.width, mid: r.top + r.height / 2, v: +e.value, min: +e.min, max: +e.max }; });
    if (box) {
        const mt = box.left + (box.v - box.min) / (box.max - box.min) * box.width;
        const mx = mt > box.left + box.width / 2 ? box.left + box.width * 0.15 : box.left + box.width * 0.85;
        await m.mouse.click(mx, box.mid); await m.waitForTimeout(300);
        const mv = await m.evaluate(i => +document.querySelectorAll('.ctrl-panel input.ctrl-range')[i].value, box.i);
        check(url, 'Maus-Klick auf die Bahn setzt den Wert (Desktop unveraendert)', mv !== box.v, `${box.v} -> ${mv}`);
    } else console.log('  - Desktop: kein sichtbarer Regler');
    await mctx.close();
    if (errs.length) check(url, 'keine pageerrors', false, errs[0]);
    await p.close();
}

let routeLocal;
(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });
    routeLocal = c => c.route(/\/(meta\.js|meta\.css|tools\/controls\.js)(\?|$)/, async route => {
        const u = route.request().url();
        const name = u.includes('controls.js') ? 'tools/controls.js' : u.includes('meta.css') ? 'meta.css' : 'meta.js';
        return route.fulfill({ contentType: name.endsWith('.css') ? 'text/css' : 'application/javascript', body: fs.readFileSync(path.join(localDir, name), 'utf8') });
    });
    const ctx = await browser.newContext({ ...devices['Pixel 7'] });
    if (localDir) await routeLocal(ctx);
    for (const url of PAGES) { console.log(url); try { await run(ctx, url); } catch (e) { check(url, 'Testlauf', false, e.message.split('\n')[0]); } }
    await browser.close();
    if (failures.length) { console.log(`\nFAIL (${failures.length})`); process.exit(1); }
    console.log(`\nOK: ${PAGES.length} Seiten`);
})();
