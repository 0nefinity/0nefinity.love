// Reset-/Neuladen-Test fuer die Speed-Choreografie (Playwright, Pixel-7-Profil). Aufruf:
//   node run.js [baseUrl] [--local /pfad/zum/repo] [--page /018]
// Regel: Reset (und Rueckgaengig) fasst die Choreografie mit an; Neuladen startet ohne liegengebliebene Choreografie;
// die freigeschaltete Speed-Skala (sessionStorage) bleibt nach Reset und Neuladen.
// --local liefert meta.js, meta.css, 0nefinity.js und tools/controls.js aus dem Checkout.
// Playwright/Chromium per Umgebung: PLAYWRIGHT_PATH, CHROME_PATH.
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const CHROME = process.env.CHROME_PATH || undefined;
const args = process.argv.slice(2);
const base = args.find(a => a.startsWith('http')) || 'https://dev.0nefinity.love';
const li = args.indexOf('--local');
const localDir = li >= 0 ? args[li + 1] : null;
const pi = args.indexOf('--page');
const PAGE = pi >= 0 ? args[pi + 1] : '/018';
const failures = [];
const check = (name, ok, info) => { console.log(`  ${ok ? 'ok' : 'x '} ${name}${info ? ': ' + info : ''}`); if (!ok) failures.push(`${name} ${info || ''}`); };

async function open(ctx, tab) {
    const p = tab || await ctx.newPage();
    if (!tab) p.on('pageerror', e => { errors.push(e.message); console.log('  pageerror: ' + e.message); });
    await p.goto(base + PAGE, { waitUntil: 'load' });
    await p.waitForTimeout(1500);
    await p.waitForSelector('[data-key="autoStep0"]', { state: 'attached', timeout: 8000 });
    await openPanel(ctx, p);
    return p;
}
async function openPanel(ctx, p) {
    const cdp = await ctx.newCDPSession(p);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    await p.touchscreen.tap(200, 350); await p.waitForTimeout(800);
    for (let i = 0; i < 3; i++) {
        const top = await p.evaluate(() => document.querySelector('.ctrl-panel').getBoundingClientRect().top);
        if (top < 300) break;
        await touch('touchStart', 205, Math.min(top + 12, 820));
        for (let k = 1; k <= 16; k++) { await touch('touchMove', 205, Math.min(top + 12, 820) + (150 - Math.min(top + 12, 820)) * k / 16); await p.waitForTimeout(16); }
        await touch('touchEnd'); await p.waitForTimeout(400);
    }
    await p.waitForTimeout(500);
    await p.evaluate(() => { const sub = document.querySelector('[data-key="autoStep0"]').closest('.ctrl-details'); if (sub.hidden) document.querySelector('[data-key="auto"] .ctrl-details-btn').click() });
    await p.waitForTimeout(500);
}
const errors = [];
const step0 = p => p.evaluate(() => [...document.querySelectorAll('[data-key="autoStep0"] input')].map(i => i.value));
const stepCount = p => p.evaluate(() => document.querySelectorAll('[data-key^="autoStep"]').length);
const peak = p => p.evaluate(() => +document.querySelector('[data-key="speed"] .ctrl-range').max);

async function setStep0(p, v) {
    await p.evaluate(() => document.querySelector('[data-key="autoStep0"] input').scrollIntoView({ block: 'center' }));
    const inp = p.locator('[data-key="autoStep0"] input').first();
    await inp.click({ force: true }); await inp.fill(String(v)); await inp.press('Enter');
    await p.waitForTimeout(300);
}
async function addStep(p) {
    await p.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '+ Step').click());
    await p.waitForTimeout(300);
}
const clickReset = async p => { await p.evaluate(() => document.querySelector('.ctrl-reset-btn').click()); await p.waitForTimeout(600); };
const clickUndo = async p => { await p.evaluate(() => [...document.querySelectorAll('.ctrl-reset-toast button')].find(b => b.textContent === 'Rückgängig').click()); await p.waitForTimeout(600); };

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });
    const ctx = await browser.newContext({ ...devices['Pixel 7'] });
    if (localDir) {
        await ctx.route(/\/(meta\.js|meta\.css|0nefinity\.js|tools\/controls\.js)(\?|$)/, async route => {
            const u = route.request().url();
            const name = u.includes('controls.js') ? 'tools/controls.js' : u.includes('meta.css') ? 'meta.css' : u.includes('0nefinity.js') ? '0nefinity.js' : 'meta.js';
            return route.fulfill({ contentType: name.endsWith('.css') ? 'text/css' : 'application/javascript', body: fs.readFileSync(path.join(localDir, name), 'utf8') });
        });
    }
    let p = await open(ctx);
    const defStep0 = await step0(p);
    const defCount = await stepCount(p);
    check('Ausgangslage: Default-Stufe 1', defStep0[0] === '120', JSON.stringify(defStep0));

    console.log('Reset');
    await setStep0(p, 777);
    await addStep(p);
    check('Choreografie geaendert', (await step0(p))[0] === '777' && (await stepCount(p)) === defCount + 1);
    // Speed-Skala freischalten: hoher Wert per Tippen
    await p.evaluate(() => { const c = document.querySelector('[data-key="auto"] input[type="checkbox"]'); if (c.checked) c.click(); });
    await p.waitForTimeout(300);
    const sp = p.locator('[data-key="speed"] .ctrl-value-input');
    await sp.click({ force: true }); await sp.fill('5000'); await sp.press('Enter'); await p.waitForTimeout(400);
    const grown = await peak(p);
    check('Skala gewachsen', grown >= 5000, String(grown));
    await clickReset(p);
    check('Reset: Stufe 1 wieder Default', (await step0(p))[0] === defStep0[0], JSON.stringify(await step0(p)));
    check('Reset: Stufenzahl wieder Default', (await stepCount(p)) === defCount, String(await stepCount(p)));
    check('Reset: Auto wieder an', await p.evaluate(() => document.querySelector('[data-key="auto"] input[type="checkbox"]').checked));
    const spd = await p.evaluate(() => parseFloat(document.querySelector('[data-key="speed"] .ctrl-value-input').value));
    check('Reset: Speed auf Choreografie-Start (nicht 5000)', spd < 100, String(spd));
    check('Reset: Skala bleibt', (await peak(p)) >= grown, String(await peak(p)));
    await clickUndo(p);
    check('Rueckgaengig: Choreografie zurueck', (await step0(p))[0] === '777' && (await stepCount(p)) === defCount + 1, JSON.stringify(await step0(p)) + ' n=' + await stepCount(p));

    console.log('Neuladen');
    await p.reload({ waitUntil: 'load' });
    await p.waitForSelector('[data-key="autoStep0"]', { state: 'attached', timeout: 8000 });
    await p.waitForTimeout(800);
    await openPanel(ctx, p);
    check('Neuladen: Choreografie weg', (await step0(p))[0] === defStep0[0] && (await stepCount(p)) === defCount, JSON.stringify(await step0(p)) + ' n=' + await stepCount(p));
    check('Neuladen: Skala bleibt', (await peak(p)) >= grown, String(await peak(p)));
    await setStep0(p, 555);
    // erneut oeffnen (Navigation, kein Reload): auch hier keine liegengebliebene Choreografie
    await p.goto(base + PAGE, { waitUntil: 'load' });
    await p.waitForSelector('[data-key="autoStep0"]', { state: 'attached', timeout: 8000 });
    await p.waitForTimeout(800);
    await openPanel(ctx, p);
    check('Neu oeffnen: Choreografie weg', (await step0(p))[0] === defStep0[0], JSON.stringify(await step0(p)));

    check('0 pageerrors', errors.length === 0, errors.join(' | '));
    await browser.close();
    if (failures.length) { console.log('\nFEHLER:\n' + failures.join('\n')); process.exit(1); }
    console.log('\nalles ok');
})().catch(e => { console.error(e); process.exit(2); });
