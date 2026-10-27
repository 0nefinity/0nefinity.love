// Autofill test (Playwright). Aufruf:
//   node run.js [baseUrl] [--local /pfad/zum/repo] [--no-guard]
// --local liefert meta.js und tools/controls.js aus dem Checkout (Test vor dem Deploy).
// --no-guard ersetzt meta.js durch eine leere Datei (Gegenprobe: der Test muss rot werden).
// Playwright/Chromium per Umgebung: PLAYWRIGHT_PATH, CHROME_PATH.
// Prueft nur die Attribute; ob Chrome auf dem Handy wirklich nichts anbietet, laesst sich headless nicht pruefen.
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const CHROME = process.env.CHROME_PATH || undefined;

const args = process.argv.slice(2);
const base = args.find(a => a.startsWith('http')) || 'https://dev.0nefinity.love';
const li = args.indexOf('--local');
const localDir = li >= 0 ? args[li + 1] : null;
const noGuard = args.includes('--no-guard');

const PAGES = ['/', '/018', '/shadows', '/co0rdinates', '/fourieous', '/unfoldingPi', '/enternity'];
const NON_TEXT = new Set(['checkbox', 'radio', 'range', 'color', 'button', 'submit', 'reset', 'hidden', 'file', 'image']);
const LOGIN_AC = /(^|\s)(username|current-password|new-password|one-time-code|webauthn)(\s|$)/;

const audit = () => [...document.querySelectorAll('input,textarea')].filter(e => !NON_TEXT_.has(e.type)).map(e => ({
    desc: e.tagName.toLowerCase() + '[type=' + e.type + ']' + (e.id ? '#' + e.id : '') + (e.className ? '.' + String(e.className).split(' ')[0] : ''),
    ac: e.getAttribute('autocomplete') || '',
    has: ['data-1p-ignore', 'data-lpignore', 'data-bwignore', 'data-form-type'].every(a => e.hasAttribute(a)) && e.getAttribute('data-form-type') === 'other',
    login: e.type === 'password' || /(^|\s)(username|current-password|new-password|one-time-code|webauthn)(\s|$)/.test(e.getAttribute('autocomplete') || '') || !!e.closest('[data-login]'),
    type: e.type,
}));

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
    await ctx.route(/\/(meta\.js|tools\/controls\.js)(\?|$)/, async route => {
        const name = route.request().url().includes('controls.js') ? 'tools/controls.js' : 'meta.js';
        if (noGuard && name === 'meta.js') return route.fulfill({ contentType: 'application/javascript', body: '' });
        if (localDir) return route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(localDir, name), 'utf8') });
        return route.continue();
    });
    const failures = [];
    let checked = 0;
    for (const p of PAGES) {
        const page = await ctx.newPage();
        const errs = [];
        page.on('pageerror', e => errs.push(e.message));
        await page.addInitScript(() => { window.NON_TEXT_ = new Set(['checkbox', 'radio', 'range', 'color', 'button', 'submit', 'reset', 'hidden', 'file', 'image']); });
        await page.goto(base + p, { waitUntil: 'load' });
        await page.waitForTimeout(1500);
        // Dynamisch erzeugte Felder (wie Editor und Panel sie anlegen) muessen ebenfalls erfasst werden
        await page.evaluate(() => {
            const a = document.createElement('input'); a.type = 'text'; a.id = 'probe-dyn-input';
            const b = document.createElement('textarea'); b.id = 'probe-dyn-textarea';
            const c = document.createElement('div'); c.innerHTML = '<input type="number" id="probe-dyn-html"><input id="probe-dyn-plain">';
            document.body.append(a, b, c);
        });
        await page.waitForTimeout(200);
        const rows = await page.evaluate(audit);
        for (const r of rows) {
            checked++;
            if (r.type === 'password') {
                if (p !== '/enternity') failures.push(`${p}: ${r.desc} type=password outside login`);
                else if (!/current-password|new-password/.test(r.ac)) failures.push(`${p}: login ${r.desc} lost its autocomplete token`);
                continue;
            }
            if (r.login) continue;
            if (r.ac !== 'off') failures.push(`${p}: ${r.desc} autocomplete="${r.ac}" (want off)`);
            if (!r.has) failures.push(`${p}: ${r.desc} missing data-1p-ignore/lpignore/bwignore/form-type=other`);
        }
        if (p === '/enternity') {
            // Login darf Passwort-Manager nutzen: Felder behalten ihre Tokens (live: Passkey-Code, dev: Benutzer + Passwort)
            const login = rows.filter(r => r.login);
            if (!login.length) failures.push('/enternity: no login field found, check the test');
            console.log('  login fields: ' + login.map(r => r.desc + ' ac=' + r.ac).join(', '));
        }
        if (errs.length) failures.push(`${p}: ${errs.length} pageerror(s): ${errs[0]}`);
        console.log(`${p}: ${rows.length} fields, ${errs.length} pageerrors`);
        await page.close();
    }
    await browser.close();
    if (failures.length) {
        console.log(`\nFAIL (${failures.length}):`);
        failures.slice(0, 40).forEach(f => console.log('  ' + f));
        process.exit(1);
    }
    console.log(`\nOK: ${checked} fields on ${PAGES.length} pages`);
})();
