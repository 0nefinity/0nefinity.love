// Zoom-Anker-Test fuer co0rdinates (Playwright). Aufruf:
//   node run.js [baseUrl]
// Regel: Beim Zoomen (Mausrad, Pinch) bleibt der sichtbare Weltpunkt unter Cursor/Pinch-Mitte stehen
// (Abweichung < 1 px), mit und ohne Verzerrungspunkte, Desktop und Pixel 7.
// Sichtbarer Punkt = Urbild des Bildschirmpunkts unter der Verzerrung (m + D(m) = screenToMath).
// Playwright/Chromium per Umgebung: PLAYWRIGHT_PATH, CHROME_PATH.
const { chromium, devices } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const CHROME = process.env.CHROME_PATH || undefined;
const base = process.argv.slice(2).find(a => a.startsWith('http')) || 'https://dev.0nefinity.love';
const fails = [];
const check = (ok, msg) => { console.log(ok ? 'ok ' : 'x  ', msg); if (!ok) fails.push(msg); };

const HELPERS = () => {
    window.__pre = (sx, sy) => {
        const u = screenToMath(sx, sy);
        let mx = u.x, my = u.y;
        for (let i = 0; i < 200; i++) { const d = getDisplacement(mx, my); mx = u.x - d.dx; my = u.y - d.dy; }
        return { x: mx, y: my };
    };
    window.__scr = m => transformPoint(m.x, m.y);
    window.__home = () => { viewX = 0; viewY = 0; setViewZoom(1); draw(); };
};

async function run(name, opts, warp) {
    const label = `${name} ${warp ? 'warp' : 'plain'}`;
    const b = await chromium.launch({ executablePath: CHROME });
    const ctx = await b.newContext(opts);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + '/co0rdinates', { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    await page.evaluate(HELPERS);
    if (warp) await page.evaluate(() => {
        controlPoints.push({ id: 'a', x: 0.3, y: 0.1, dx: 0.6, dy: 0.4, radius: 0.8 }, { id: 'b', x: -0.5, y: -0.3, dx: -0.3, dy: 0.2, radius: 0.8 });
        invalidateCurrentStateCache(); draw();
    });
    const R = await page.evaluate(() => { const r = canvas.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; });

    // Mausrad: mehrere Cursorpositionen (auch aussermittig), rein und raus, 60 Schritte tief
    let worst = 0;
    for (const [fx, fy] of [[0.5, 0.5], [0.8, 0.3], [0.15, 0.7], [0.9, 0.9], [0.1, 0.1]]) {
        await page.evaluate(() => __home());
        const sx = fx * R.w, sy = fy * R.h;
        await page.mouse.move(R.l + sx, R.t + sy);
        const dirs = [...Array(60).fill(-100), ...Array(10).fill(100)];
        for (const dir of dirs) {
            const before = await page.evaluate(([x, y]) => __pre(x, y), [sx, sy]);
            await page.mouse.wheel(0, dir);
            await page.waitForTimeout(15);
            const a = await page.evaluate(m => __scr(m), before);
            worst = Math.max(worst, Math.hypot(a.x - sx, a.y - sy));
        }
    }
    check(worst < 1, `${label} wheel worst drift ${worst.toFixed(3)} px`);

    // Pinch ueber CDP mit aussermittiger Mitte; Finger bleiben im Fenster
    const cdp = await ctx.newCDPSession(page);
    const send = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
    let worstP = 0;
    for (const [fx, fy, sequential] of [[0.7, 0.35, false], [0.45, 0.6, false], [0.6, 0.5, true]]) {
        await page.evaluate(() => __home());
        const mx = R.l + fx * R.w, my = R.t + fy * R.h;
        const pts = h => [{ x: mx - h, y: my, id: 1 }, { x: mx + h, y: my, id: 2 }];
        if (sequential) {
            // erster Finger zieht kurz (legt einen Verzerrungspunkt an), zweiter Finger setzt auf
            await send('touchStart', [{ x: mx - 30, y: my, id: 1 }]);
            await page.waitForTimeout(60);
            await send('touchMove', [{ x: mx - 30, y: my + 4, id: 1 }]);
            await page.waitForTimeout(60);
            await send('touchStart', [{ x: mx - 30, y: my + 4, id: 1 }, { x: mx + 30, y: my, id: 2 }]);
        } else {
            await send('touchStart', pts(30));
        }
        await page.waitForTimeout(60);
        const midX = sequential ? mx : mx, midY = sequential ? my + 2 : my;
        const before = await page.evaluate(([x, y]) => __pre(x, y), [midX - R.l, midY - R.t]);
        for (const h of [40, 55, 75, 100, 130]) {
            await send('touchMove', [{ x: mx - h, y: sequential ? my + 4 : my, id: 1 }, { x: mx + h, y: sequential ? my : my, id: 2 }]);
            await page.waitForTimeout(40);
            const a = await page.evaluate(m => __scr(m), before);
            worstP = Math.max(worstP, Math.hypot(a.x - (midX - R.l), a.y - (midY - R.t)));
        }
        await send('touchEnd', []);
        const z = await page.evaluate(() => viewZoom);
        check(z > 1.5, `${label} pinch zoomed (z=${z.toFixed(2)})`);
    }
    check(worstP < 1, `${label} pinch worst drift ${worstP.toFixed(3)} px`);
    check(errors.length === 0, `${label} no page errors ${errors.join('; ')}`);
    await b.close();
}

(async () => {
    for (const warp of [false, true]) {
        await run('desktop', { viewport: { width: 1280, height: 800 } }, warp);
        await run('pixel7', devices['Pixel 7'], warp);
    }
    console.log(fails.length ? `FAILED ${fails.length}` : 'ALL PASS');
    process.exit(fails.length ? 1 : 0);
})();
