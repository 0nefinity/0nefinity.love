// Menüsuche-Test (Playwright). Aufruf:
//   node run.js [baseUrl] [--mobile] [--local /pfad/zur/meta.js]
// --local ersetzt meta.js der Zielseite durch die Datei (Test vor dem Deploy).
// Playwright/Chromium per Umgebung: PLAYWRIGHT_PATH, CHROME_PATH.
const fs = require('fs');
const { chromium, devices } = require(process.env.PLAYWRIGHT_PATH || '/home/timbr/winkelapp/web/node_modules/playwright');
const CHROME = process.env.CHROME_PATH || '/home/timbr/.cache/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell';

const args = process.argv.slice(2);
const base = args.find(a => a.startsWith('http')) || 'https://dev.0nefinity.love';
const mobile = args.includes('--mobile');
const localIdx = args.indexOf('--local');
const localMeta = localIdx >= 0 ? fs.readFileSync(args[localIdx + 1], 'utf8') : null;
const localCss = localIdx >= 0 ? fs.readFileSync(args[localIdx + 1].replace(/meta\.js$/, 'meta.css'), 'utf8') : null;

// top = Treffer muss auf Rang <= top stehen; in = nur enthalten sein
const CASES = [
    ['Foldingpi', '/unfoldingPi.html', 1],
    ['foldingpi', '/unfoldingPi.html', 1],
    ['Foldingπ', '/unfoldingPi.html', 1],
    ['folding pi', '/unfoldingPi.html', 1],
    ['unfolding pi', '/unfoldingPi.html', 1],
    ['pi unfolding', '/unfoldingPi.html', 1],
    ['(un)folding', '/unfoldingPi.html', 1],
    ['unfoldnigpi', '/unfoldingPi.html', 3],
    ['unfoldingpi.html', '/unfoldingPi.html', 1],
    ['unfoldingpi', '/unfoldingPi.html', 1],
    ['koordinaten', '/co0rdinates.html', 8],
    ['co0rdinates', '/co0rdinates.html', 2],
    ['coordinates', '/co0rdinates.html', 8],
    ['kreis aus dingen', '/kreisausdingen.html', 1],
    ['dingen kreis aus', '/kreisausdingen.html', 1],
    ['kreisausdingen', '/kreisausdingen.html', 1],
    ['impressum', '/impressum-und-datenschutz.html', 1],
    ['datenschutz impressum', '/impressum-und-datenschutz.html', 1],
    ['ueberordner', '/0.1 new_version/ich machs jetzt wohl doch im Überordner.html', 1],
    ['Überordner', '/0.1 new_version/ich machs jetzt wohl doch im Überordner.html', 1],
    ['uberordner', '/0.1 new_version/ich machs jetzt wohl doch im Überordner.html', 1],
    ['weisse kreise', '/fun-with-circles/Weiße Kreise.html', 1],
    ['weiße kreise', '/fun-with-circles/Weiße Kreise.html', 1],
    ['gott wuerfelt', '/gott-würfelt-nicht.html', 1],
    ['sind wir brueder', '/pragmatischer-nichtdualismus/sind-wir-brüder.html', 1],
    ['identitaetskrise', '/identitätskrise.html', 1],
    ['unendlich', '/unendliche-zahlen.md', 3],
    ['unendlich', '/infinity', 40],
    ['∞', '/∞8∞-Axiom-der-purzelnden-Unendlichkeit.html', 5],
    ['inf', '/infinity', 10],
    ['null', '/was-ist-die-eine-null', 5],
    ['zero', '/was-ist-die-eine-null', 60],
    ['eins', '/einsen.html', 3],
    ['onefinity', '/assets/bibeln/0nefinity.txt', 40],
    ['piquadrat', '/piquadrat', 1],
    ['π quadrat', '/piquadrat', 2],
];

const EMPTY_QUERY = 'qqqzzzxxyy';

async function visibleResults(page) {
    return page.$$eval('#file-list a', as => as
        .filter(a => a.offsetParent !== null)
        .map(a => ({ href: (h => { try { return decodeURI(h); } catch (e) { return h; } })(a.getAttribute('href')), text: a.textContent })));
}

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });
    const ctx = await browser.newContext(mobile ? { ...devices['iPhone 12'] } : { viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', m => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', e => errors.push(String(e)));
    if (localMeta) await page.route('**/meta.js*', r => r.fulfill({ contentType: 'application/javascript', body: localMeta }));
    if (localCss) await page.route('**/meta.css*', r => r.fulfill({ contentType: 'text/css', body: localCss }));
    await page.goto(base + '/README.html');
    await page.click('.menu-button');
    const input = page.locator('.menu-search input');

    let pass = 0, fail = 0;
    const report = (ok, label, detail) => {
        ok ? pass++ : fail++;
        console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok ? '' : '  -> ' + detail));
    };
    async function search(q) {
        await input.fill(q);
        await page.waitForTimeout(250);
        return visibleResults(page);
    }

    for (const [q, href, top] of CASES) {
        const res = await search(q);
        const rank = res.findIndex(r => r.href === href) + 1;
        report(rank >= 1 && rank <= top, `"${q}" -> ${href} (Rang <= ${top})`,
            `Rang ${rank || 'nicht gefunden'} von ${res.length}; Top3: ${res.slice(0, 3).map(r => r.text).join(' | ')}`);
    }

    // Pfad-Treffer fluten nicht: nur ueber den Ordnernamen gefunden -> hoechstens 5 Treffer
    const flood = await search('kuriositaeten');
    report(flood.length >= 1 && flood.length <= 5, 'Ordnername allein: hoechstens 5 Treffer', `${flood.length} Treffer`);

    // Leerzustand
    await search(EMPTY_QUERY);
    const emptyText = await page.$$eval('.menu-search-empty', e => e.filter(x => x.offsetParent).map(x => x.textContent.trim()));
    report(emptyText.length === 1 && /nichts gefunden/.test(emptyText[0]), 'Leerzustand "nichts gefunden"', JSON.stringify(emptyText));

    // Hervorhebung
    await search('foldingpi');
    const marks = await page.$$eval('#file-list li a mark', m => m.filter(x => x.offsetParent).slice(0, 1).map(x => x.textContent));
    report(marks[0] === 'foldingPi', 'Hervorhebung "foldingPi" im ersten Treffer', JSON.stringify(marks));

    // Enter oeffnet ersten Treffer
    if (!mobile) {
        await search('impressum');
        await Promise.all([page.waitForURL('**/impressum-und-datenschutz*', { timeout: 3000 }), input.press('Enter')]).then(
            () => report(true, 'Enter oeffnet ersten Treffer'),
            e => report(false, 'Enter oeffnet ersten Treffer', e.message.split('\n')[0]));

        // Pfeil runter + Enter oeffnet zweiten Treffer
        await page.goto(base + '/README.html');
        await page.click('.menu-button');
        await input.fill('kreis');
        await page.waitForTimeout(250);
        const res = await visibleResults(page);
        await input.press('ArrowDown');
        await Promise.all([page.waitForURL(u => decodeURI(u.pathname).startsWith((res[1] || { href: '/__fehlt__' }).href.replace(/\.html$/, '')), { timeout: 3000 }), input.press('Enter')]).then(
            () => report(true, 'ArrowDown + Enter oeffnet zweiten Treffer'),
            e => report(false, 'ArrowDown + Enter oeffnet zweiten Treffer', e.message.split('\n')[0]));
    }

    // Escape stellt Baum wieder her
    await page.goto(base + '/README.html');
    await page.click('.menu-button');
    await input.fill('foldingpi');
    await page.waitForTimeout(250);
    await page.click('.menu-search-clear');
    await page.waitForTimeout(150);
    const afterEsc = await page.$$eval('#file-list > li', ls => ({
        shown: ls.filter(l => l.offsetParent).length, total: ls.length, hits: ls.filter(l => l.classList.contains('search-hit')).length }));
    report(afterEsc.shown > 5 && afterEsc.hits === 0, 'Loeschen (x) stellt den Ordnerbaum wieder her', JSON.stringify(afterEsc));

    report(errors.length === 0, 'keine Konsolenfehler', errors.join(' | '));
    console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`);
    await browser.close();
    process.exit(fail ? 1 : 0);
})();
