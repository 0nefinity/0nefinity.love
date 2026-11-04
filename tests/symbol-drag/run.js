// 018-Symbol der Startseite: eine Touch-Geste bewegt entweder das Symbol oder die Seite, nie beides (Playwright, Pixel-7-Profil). Aufruf:
//   node run.js [baseUrl] [--local /pfad/zum/repo]
// 1. Echter Touch-Zug auf dem Symbol: Symbol wandert, Seite bleibt bei scrollY 0.
// 2. Echter Touch-Zug unterhalb der Symbol-Zone: Seite scrollt, Symbol bleibt.
// 3. Touch-Ereignisse mit cancelable=false (so meldet der Browser eine Geste, die er schon scrollt, z. B. waehrend die Seite noch gleitet):
//    das Symbol darf sich nicht mitbewegen. Vor dem Fix lief es mit, waehrend die Seite scrollte.
// Umgebung: PLAYWRIGHT_PATH, CHROME_PATH. Exit 1 bei Verstoss.
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const CHROME = process.env.CHROME_PATH || undefined;
const args = process.argv.slice(2);
const base = args.find(a => a.startsWith('http')) || 'https://dev.0nefinity.love';
const li = args.indexOf('--local');
const localDir = li >= 0 ? args[li + 1] : null;
const failures = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function open(browser) {
    const ctx = await browser.newContext({ ...devices['Pixel 7'] });
    if (localDir) await ctx.route(/\/(0nefinity\.js|tools\/zoom\.js)(\?|$)/, async route => {
        const name = new URL(route.request().url()).pathname.slice(1);
        return route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(localDir, name), 'utf8') });
    });
    const p = await ctx.newPage();
    // Zoom-Zustand des Symbols mitlesen, ohne die Seite zu aendern
    await p.addInitScript(() => {
        let z;
        Object.defineProperty(window, 'Zoom2D', { configurable: true, get: () => z, set: v => {
            const orig = v.createZoom2D;
            z = { ...v, createZoom2D: o => { const ot = o.onTransform; o.onTransform = s => { window.__zs = s; if (ot) ot(s); }; return orig(o); } };
        } });
    });
    await p.goto(base + '/', { waitUntil: 'networkidle' });
    await sleep(1500);
    return { ctx, p, cdp: await ctx.newCDPSession(p) };
}

const state = p => p.evaluate(() => ({ sy: Math.round(scrollY), x: window.__zs.offsetX, y: window.__zs.offsetY, ih: innerHeight }));

async function realDrag(cdp, x, y, dy) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= 10; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + dy * i / 10 }] });
        await sleep(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(500);
}

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });

    {
        const { ctx, p, cdp } = await open(browser);
        const s0 = await state(p);
        await realDrag(cdp, s0.x, s0.y - s0.sy, 120);
        const s1 = await state(p);
        console.log(`auf dem Symbol: scrollY ${s0.sy}->${s1.sy}, Symbol dy ${Math.round(s1.y - s0.y)}`);
        if (s1.sy !== s0.sy) failures.push('Zug auf dem Symbol scrollt die Seite');
        if (Math.abs(s1.y - s0.y) < 60) failures.push('Zug auf dem Symbol bewegt das Symbol nicht');
        await ctx.close();
    }
    {
        const { ctx, p, cdp } = await open(browser);
        const s0 = await state(p);
        await realDrag(cdp, s0.x, Math.round(s0.ih * 0.85), -200);
        const s1 = await state(p);
        console.log(`unter der Zone: scrollY ${s0.sy}->${s1.sy}, Symbol dy ${Math.round(s1.y - s0.y)}`);
        if (s1.sy <= s0.sy) failures.push('Zug unter der Symbol-Zone scrollt die Seite nicht');
        if (s1.y !== s0.y || s1.x !== s0.x) failures.push('Zug unter der Symbol-Zone bewegt das Symbol');
        await ctx.close();
    }
    {
        const { ctx, p } = await open(browser);
        const s0 = await state(p);
        await p.evaluate(({ x, y }) => {
            const layer = document.getElementById('interactionLayer');
            const fire = (type, cy) => {
                const t = new Touch({ identifier: 7, target: layer, clientX: x, clientY: cy });
                layer.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: false, touches: type === 'touchend' ? [] : [t], targetTouches: type === 'touchend' ? [] : [t], changedTouches: [t] }));
            };
            fire('touchstart', y);
            for (let i = 1; i <= 10; i++) fire('touchmove', y + 12 * i);
            fire('touchend', y + 120);
        }, { x: s0.x, y: s0.y - s0.sy });
        await sleep(500);
        const s1 = await state(p);
        console.log(`nicht abbrechbare Geste: Symbol dy ${Math.round(s1.y - s0.y)}`);
        if (Math.abs(s1.y - s0.y) > 1) failures.push('Symbol laeuft mit, obwohl der Browser die Geste schon scrollt');
        await ctx.close();
    }

    await browser.close();
    if (failures.length) { console.log('VERSTOSS:\n- ' + failures.join('\n- ')); process.exit(1); }
    console.log('ok');
})().catch(e => { console.error(e); process.exit(1); });
