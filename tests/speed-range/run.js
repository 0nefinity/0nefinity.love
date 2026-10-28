// Tempo-Skala-Test (Playwright, Pixel-7-Profil). Aufruf:
//   node run.js [baseUrl] [--local /pfad/zum/repo] [--no-grow] [--page /018]
// Regel: Der Speed-Regler waechst mit dem hoechsten erreichten Wert (Spitze x 2), sinkt in der Sitzung nie,
// man kann ueber das alte Ende hinaus per Ziehen und per Tippen weiter erhoehen. Neue Sitzung: wieder die Config-Obergrenze.
// --local liefert meta.js, meta.css, 0nefinity.js und tools/controls.js aus dem Checkout.
// --no-grow entfernt "grow: true" aus 0nefinity.js (Gegenprobe: der Test muss rot werden).
// Playwright/Chromium per Umgebung: PLAYWRIGHT_PATH, CHROME_PATH.
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const CHROME = process.env.CHROME_PATH || undefined;
const args = process.argv.slice(2);
const base = args.find(a => a.startsWith('http')) || 'https://dev.0nefinity.love';
const li = args.indexOf('--local');
const localDir = li >= 0 ? args[li + 1] : null;
const noGrow = args.includes('--no-grow');
const pi = args.indexOf('--page');
const PAGE = pi >= 0 ? args[pi + 1] : '/018';
const failures = [];
const check = (name, ok, info) => { console.log(`  ${ok ? 'ok' : 'x '} ${name}${info ? ': ' + info : ''}`); if (!ok) failures.push(`${name} ${info || ''}`); };

async function newCtx(browser) {
    const ctx = await browser.newContext({ ...devices['Pixel 7'] });
    if (localDir) {
        await ctx.route(/\/(meta\.js|meta\.css|0nefinity\.js|tools\/controls\.js)(\?|$)/, async route => {
            const u = route.request().url();
            const name = u.includes('controls.js') ? 'tools/controls.js' : u.includes('meta.css') ? 'meta.css' : u.includes('0nefinity.js') ? '0nefinity.js' : 'meta.js';
            let body = fs.readFileSync(path.join(localDir, name), 'utf8');
            if (noGrow && name === '0nefinity.js') body = body.replace(/ grow: true,/g, '');
            return route.fulfill({ contentType: name.endsWith('.css') ? 'text/css' : 'application/javascript', body });
        });
    }
    return ctx;
}

async function openPage(ctx, tab) {
    // tab: vorhandener Tab (Neuladen behaelt sessionStorage, ein neuer Tab nicht)
    const p = tab || await ctx.newPage();
    if (!tab) p.on('pageerror', e => console.log('  pageerror: ' + e.message));
    const cdp = await ctx.newCDPSession(p);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    const gesture = async (x0, y0, x1, y1, steps = 16) => {
        await touch('touchStart', x0, y0);
        for (let i = 1; i <= steps; i++) { await touch('touchMove', x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps); await p.waitForTimeout(16); }
        await touch('touchEnd');
        await p.waitForTimeout(400);
    };
    await p.goto(base + PAGE, { waitUntil: 'load' });
    await p.waitForTimeout(1500);
    await p.touchscreen.tap(200, 350); await p.waitForTimeout(800);
    for (let i = 0; i < 3; i++) {
        const top = await p.evaluate(() => document.querySelector('.ctrl-panel').getBoundingClientRect().top);
        if (top < 300) break;
        await gesture(205, Math.min(top + 12, 820), 205, 150);
    }
    await p.waitForTimeout(500);
    const speed = () => p.evaluate(() => {
        const row = document.querySelector('[data-key="speed"]');
        const r = row.querySelector('.ctrl-range');
        row.scrollIntoView({ block: 'center' });
        const b = r.getBoundingClientRect();
        return { min: +r.min, max: +r.max, value: +r.value, shown: parseFloat(row.querySelector('.ctrl-value-input').value), left: b.left, width: b.width, mid: b.top + b.height / 2 };
    });
    const type = async (v) => {
        await p.evaluate(() => document.querySelector('[data-key="speed"] .ctrl-value-input').scrollIntoView({ block: 'center' }));
        const inp = p.locator('[data-key="speed"] .ctrl-value-input');
        await inp.click(); await inp.fill(String(v)); await inp.press('Enter');
        await p.waitForTimeout(300);
    };
    const auto = async (on) => {
        const cb = p.locator('[data-key="auto"] input[type="checkbox"]');
        if ((await cb.isChecked()) !== on) await p.evaluate(() => document.querySelector('[data-key="auto"] input[type="checkbox"]').click());
        await p.waitForTimeout(300);
    };
    return { p, gesture, speed, type, auto };
}

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });
    const ctx = await newCtx(browser);
    let { p, gesture, speed, type, auto } = await openPage(ctx);
    const s0 = await speed();
    check('Start: Obergrenze = Config', s0.max === 1440, `max ${s0.max}`);

    // Auto an, Tempo ueber die Config-Obergrenze, dann Auto aus
    await auto(true);
    await type(3000);
    await auto(false);
    await p.waitForTimeout(300);
    let s = await speed();
    check('Auto aus: Obergrenze >= aktuelles Tempo', s.max >= s.shown && s.shown >= 1440, `max ${s.max}, Tempo ${s.shown}`);
    check('Auto aus: Regler steht nicht am Anschlag', s.value < s.max, `value ${s.value} / max ${s.max}`);

    // Weiter erhoehen per Ziehen (Daumen ganz nach rechts)
    const x0 = s.left + (s.value - s.min) / (s.max - s.min) * s.width;
    const before = s.shown;
    await gesture(x0, s.mid, s.left + s.width + 30, s.mid + 2);
    s = await speed();
    check('Ziehen nach rechts erhoeht das Tempo', s.shown > before, `${before} -> ${s.shown}`);
    check('Nach dem Ziehen: Obergrenze >= Tempo', s.max >= s.shown, `max ${s.max}, Tempo ${s.shown}`);

    // Am Ende weiterziehen: mehrfach, muss immer weiter hoch gehen
    let last = s.shown;
    for (let i = 0; i < 2; i++) {
        s = await speed();
        const tx = s.left + (s.value - s.min) / (s.max - s.min) * s.width;
        await gesture(tx, s.mid, s.left + s.width + 30, s.mid + 2);
        s = await speed();
        check(`Ziehen ans Ende, Runde ${i + 1}: Tempo steigt weiter`, s.shown > last, `${last} -> ${s.shown}`);
        last = s.shown;
    }

    // Tippen weit darueber
    await type(20000);
    s = await speed();
    check('Tippen ueber die Obergrenze hebt sie an (nicht gekappt)', s.shown === 20000 && s.max >= 20000, `Tempo ${s.shown}, max ${s.max}`);
    const grown = s.max;

    // Langsamer: Obergrenze bleibt
    await type(5);
    s = await speed();
    check('Langsamer gestellt: Obergrenze bleibt', s.max === grown && s.shown === 5, `max ${s.max} (vorher ${grown}), Tempo ${s.shown}`);
    await type(0);
    s = await speed();
    check('0 ist ein Wert', s.shown === 0 && s.max === grown, `Tempo ${s.shown}, max ${s.max}`);

    // Neu laden in derselben Sitzung
    ({ p, gesture, speed, type, auto } = await openPage(ctx, p));
    s = await speed();
    check('Neu laden (gleiche Sitzung): Obergrenze bleibt', s.max >= grown, `max ${s.max}, erwartet >= ${grown}`);
    await ctx.close();

    // Neue Sitzung
    const ctx2 = await newCtx(browser);
    ({ p, gesture, speed, type, auto } = await openPage(ctx2));
    s = await speed();
    check('Neue Sitzung: wieder Config-Obergrenze', s.max === 1440, `max ${s.max}`);
    await ctx2.close();
    await browser.close();
    if (failures.length) { console.log(`\nFAIL (${failures.length}):`); failures.forEach(f => console.log('  ' + f)); process.exit(1); }
    console.log('\nOK');
})();
