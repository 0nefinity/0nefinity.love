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
const localDir = localIdx >= 0 ? require('path').dirname(args[localIdx + 1]) : null;
const localCss = localIdx >= 0 ? fs.readFileSync(args[localIdx + 1].replace(/meta\.js$/, 'meta.css'), 'utf8') : null;

// top = Treffer muss auf Rang <= top stehen; in = nur enthalten sein
const CASES = [
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

// Der Server leitet /x.html auf /x um; beides gilt als dieselbe Seite
const isPage = p => u => decodeURIComponent(u.pathname).replace(/\.html$/, '') === p.replace(/\.html$/, '');

const EMPTY_QUERY = 'qqqzzzxxyy';

async function visibleResults(page) {
    return page.$$eval('#file-list li:not(.search-content) a', as => as
        .filter(a => a.offsetParent !== null)
        .map(a => ({ href: (h => { try { return decodeURI(h); } catch (e) { return h; } })(a.getAttribute('href')), text: a.textContent })));
}

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME, args: process.env.CHROME_ARGS ? process.env.CHROME_ARGS.split('|') : [] });
    const ctx = await browser.newContext({ ...(mobile ? devices['iPhone 12'] : { viewport: { width: 1280, height: 800 } }), ...(process.env.FORWARDED_HTTPS ? { extraHTTPHeaders: { 'X-Forwarded-Proto': 'https' } } : {}) });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', m => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', e => errors.push(String(e)));
    if (localMeta) await page.route('**/meta.js*', r => r.fulfill({ contentType: 'application/javascript', body: localMeta }));
    if (localCss) await page.route('**/meta.css*', r => r.fulfill({ contentType: 'text/css', body: localCss }));
    if (localDir) await page.route('**/includes/search-index.json*', r => r.fulfill({ contentType: 'application/json', body: fs.readFileSync(localDir + '/includes/search-index.json', 'utf8') }));
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
    await search('kreisausdingen');
    const marks = await page.$$eval('#file-list li a mark', m => m.filter(x => x.offsetParent).slice(0, 1).map(x => x.textContent));
    report(marks[0] === 'kreisausdingen', 'Hervorhebung "kreisausdingen" im ersten Treffer', JSON.stringify(marks));

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
        await Promise.all([page.waitForURL(isPage((res[1] || { href: '/__fehlt__' }).href), { timeout: 8000, waitUntil: 'commit' }), input.press('Enter')]).then(
            () => report(true, 'ArrowDown + Enter oeffnet zweiten Treffer'),
            e => report(false, 'ArrowDown + Enter oeffnet zweiten Treffer', e.message.split('\n')[0]));
    }

    // ─── Volltext ───
    await page.goto(base + '/README.html');
    await page.click('.menu-button');
    const contentRows = () => page.$$eval('#file-list li.search-content', ls => ls.filter(l => l.offsetParent).map(l => ({
        href: (h => { try { return decodeURI(h); } catch (e) { return h; } })(l.querySelector('a').getAttribute('href')),
        snippet: l.querySelector('.menu-search-snippet').textContent,
        marks: [...l.querySelectorAll('.menu-search-snippet mark')].map(m => m.textContent) })));
    const NULL = '/README.html';

    // Wort, das nur im Seiteninhalt vorkommt
    await search('absurdität');
    let rows = await contentRows();
    report(rows.length === 1 && rows[0].href === NULL, 'Volltext: Wort nur im Inhalt -> "im Inhalt"-Zeile', JSON.stringify(rows.map(r => r.href)));
    const section = await page.$$eval('#file-list li.menu-search-section', e => e.filter(x => x.offsetParent).map(x => x.textContent.trim()));
    report(section.length === 1 && section[0] === 'im Inhalt', 'Volltext: Abschnitt "im Inhalt" sichtbar', JSON.stringify(section));
    report((await page.$$eval('.menu-search-empty', e => e.filter(x => x.offsetParent).length)) === 0, 'Volltext: kein "nichts gefunden" bei Inhaltstreffer', '');

    // Hervorhebung im Ausschnitt
    report(rows[0] && rows[0].marks.length >= 1 && rows[0].marks.every(m => m.toLowerCase() === 'absurdität'), 'Volltext: Treffer im Ausschnitt hervorgehoben', JSON.stringify(rows[0] && rows[0].marks));

    // Ausschnitt ist eine Zeile
    const geo = await page.$eval('#file-list li.search-content .menu-search-snippet', e => {
        const cs = getComputedStyle(e);
        return { ws: cs.whiteSpace, h: e.getBoundingClientRect().height, lh: parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5,
            nl: /\n/.test(e.textContent), w: e.getBoundingClientRect().width, pw: e.parentElement.getBoundingClientRect().width,
            vw: document.documentElement.clientWidth, right: e.getBoundingClientRect().right };
    });
    report(geo.ws === 'nowrap' && !geo.nl && geo.h <= geo.lh * 1.3 && geo.right <= geo.vw, 'Volltext: Ausschnitt einzeilig (nowrap, passt in Breite)', JSON.stringify(geo));

    // Mehrere Woerter: alle muessen in der Datei vorkommen
    rows = (await search('absurdität sonstigen'), await contentRows());
    report(rows.length === 1 && rows[0].href === NULL && rows[0].marks.length >= 2, 'Volltext: zwei Woerter in einer Datei', JSON.stringify(rows));
    rows = (await search('absurdität abgetragene'), await contentRows());
    report(rows.length === 0, 'Volltext: zwei Woerter aus verschiedenen Dateien -> kein Treffer', JSON.stringify(rows.map(r => r.href)));

    // Umlaut-Aequivalenz im Inhalt
    rows = (await search('anhaengern'), await contentRows());
    report(rows.some(r => r.href === '/README.html'), 'Volltext: anhaengern findet "anhängern"', JSON.stringify(rows.map(r => r.href)));
    rows = (await search('anhangern'), await contentRows());
    report(rows.some(r => r.href === '/README.html'), 'Volltext: anhangern findet "anhängern"', JSON.stringify(rows.map(r => r.href)));

    // Kein Fuzzy im Inhalt: Tippfehler findet nichts
    rows = (await search('absurdiät'), await contentRows());
    report(rows.length === 0, 'Volltext: kein Fuzzy (Tippfehler -> kein Inhaltstreffer)', JSON.stringify(rows.map(r => r.href)));

    // Tippfehler-Treffer nur als Ersatz: "test" liefert nur Eintraege, die "test" wirklich enthalten
    {
        const res = await search('test');
        const bad = res.filter(r => !r.href.toLowerCase().includes('test') && !(r.text || '').toLowerCase().includes('test'));
        report(res.length > 0 && bad.length === 0, 'Namenssuche "test": nur echte Treffer (kein Tippfehler-Rauschen)', JSON.stringify(bad.map(r => r.href).slice(0, 5)));
        report(['/biggercontext/test.html'].every(h => res.some(r => r.href === h)), 'Namenssuche "test": test.html bleibt auffindbar');
    }

    // Namenstreffer erscheinen nicht doppelt; Namenstreffer stehen oben
    await search('pi');
    const order = await page.$$eval('#file-list > li.search-hit', ls => ls.filter(l => l.offsetParent).map(l =>
        l.classList.contains('menu-search-section') ? 'S' : l.classList.contains('search-content') ? 'C' : l.classList.contains('menu-search-note') ? 'N' : 'H'));
    const joined = order.join('');
    report(/^H+SC+/.test(joined), 'Volltext: Namenstreffer oben, dann "im Inhalt"', joined.slice(0, 60));
    const all = await page.$$eval('#file-list li.search-hit a', as => as.filter(a => a.offsetParent).map(a => a.getAttribute('href')));
    report(new Set(all).size === all.length, 'Volltext: keine Datei doppelt in beiden Abschnitten', `${all.length} Zeilen, ${new Set(all).size} verschieden`);
    const nContent = order.filter(x => x === 'C').length;
    const more = await page.$$eval('#file-list li.menu-search-note', e => e.filter(x => x.offsetParent && /^\+\d+ weitere$/.test(x.textContent)).map(x => x.textContent));
    report(nContent <= 30 && (nContent < 30 || more.length === 1), 'Volltext: hoechstens 30 Inhaltszeilen, sonst "+N weitere"', `${nContent} Zeilen, ${JSON.stringify(more)}`);

    // Tastatur: Pfeil hoch vom ersten Treffer springt in die letzte (Inhalts-)Zeile
    await input.press('ArrowUp');
    const selCls = await page.$$eval('#file-list li.search-hit.selected', e => e.map(x => x.className));
    report(selCls.length === 1 && /search-content/.test(selCls[0]), 'Volltext: Pfeil hoch erreicht Inhaltszeile (nur eine ausgewaehlt, Hinweiszeilen uebersprungen)', JSON.stringify(selCls));
    await input.press('ArrowDown');
    const selCls2 = await page.$$eval('#file-list li.search-hit.selected', e => e.map(x => x.className));
    report(selCls2.length === 1 && !/search-content/.test(selCls2[0]), 'Volltext: Pfeil runter wickelt zurueck zum ersten Namenstreffer', JSON.stringify(selCls2));

    if (!mobile) {
        await page.goto(base + '/README.html');
        await page.click('.menu-button');
        await input.fill('absurdität');
        await page.waitForTimeout(400);
        await Promise.all([page.waitForURL(isPage(NULL), { timeout: 8000, waitUntil: 'commit' }), input.press('Enter')]).then(
            () => report(true, 'Volltext: Enter oeffnet Inhaltstreffer'),
            e => report(false, 'Volltext: Enter oeffnet Inhaltstreffer', e.message.split('\n')[0]));
    }

    // Index und Menue stimmen ueberein (kein stiller Stand-Drift)
    await page.goto(base + '/README.html');
    await page.click('.menu-button');
    const drift = await page.evaluate(async () => {
        const idx = await (await fetch('/includes/search-index.json', { cache: 'no-cache' })).json();
        const menuHrefs = new Set([...document.querySelectorAll('#file-list a')].map(a => a.getAttribute('href')));
        const text = [...menuHrefs].filter(h => /\.(html|md|txt)$/.test(h));
        return { notInMenu: Object.keys(idx).filter(k => !menuHrefs.has(k)).slice(0, 5),
            missing: text.filter(h => !(h in idx)).slice(0, 5), n: Object.keys(idx).length };
    });
    report(drift.notInMenu.length === 0 && drift.missing.length === 0, 'Index deckt genau die Textseiten des Menues ab', JSON.stringify(drift));

    // Index wird erst beim ersten Tastendruck geladen
    {
        const p2 = await ctx.newPage();
        const reqs = [];
        p2.on('request', r => /search-index\.json/.test(r.url()) && reqs.push(r.url()));
        if (localDir) await p2.route('**/includes/search-index.json*', r => r.fulfill({ contentType: 'application/json', body: fs.readFileSync(localDir + '/includes/search-index.json', 'utf8') }));
        if (localMeta) await p2.route('**/meta.js*', r => r.fulfill({ contentType: 'application/javascript', body: localMeta }));
        if (localCss) await p2.route('**/meta.css*', r => r.fulfill({ contentType: 'text/css', body: localCss }));
        await p2.goto(base + '/README.html');
        await p2.click('.menu-button');
        await p2.waitForTimeout(500);
        const before = reqs.length;
        await p2.locator('.menu-search input').fill('absurdität');
        await p2.waitForTimeout(600);
        report(before === 0 && reqs.length === 1, 'Index lazy: kein Request vor dem ersten Tastendruck, genau einer danach', `vorher ${before}, danach ${reqs.length}`);
        await p2.close();
    }

    // Ladefehler: sichtbare Meldung + console.error, Namenssuche laeuft weiter
    for (const mode of ['http', 'kaputt']) {
        const p3 = await ctx.newPage();
        const errs = [];
        p3.on('console', m => m.type() === 'error' && errs.push(m.text()));
        if (localMeta) await p3.route('**/meta.js*', r => r.fulfill({ contentType: 'application/javascript', body: localMeta }));
        if (localCss) await p3.route('**/meta.css*', r => r.fulfill({ contentType: 'text/css', body: localCss }));
        await p3.route('**/search-index.json*', r => mode === 'http'
            ? r.fulfill({ status: 500, body: 'boom' })
            : r.fulfill({ status: 200, contentType: 'application/json', body: '{"/x": ' }));
        await p3.goto(base + '/README.html');
        await p3.click('.menu-button');
        const in3 = p3.locator('.menu-search input');
        await in3.fill('impressum');
        await p3.waitForTimeout(500);
        const msg = await p3.$$eval('#file-list li.menu-search-error', e => e.filter(x => x.offsetParent).map(x => x.textContent.trim()));
        const names = await p3.$$eval('#file-list li.search-hit:not(.menu-search-note) a', as => as.filter(a => a.offsetParent).map(a => a.getAttribute('href')));
        report(msg.length === 1 && msg[0] === 'Volltext nicht verfügbar', `Ladefehler (${mode}): "Volltext nicht verfügbar" sichtbar`, JSON.stringify(msg));
        report(errs.some(e => /Volltext-Index/.test(e)), `Ladefehler (${mode}): console.error`, JSON.stringify(errs));
        report(names[0] === '/impressum-und-datenschutz.html', `Ladefehler (${mode}): Namenssuche funktioniert weiter`, JSON.stringify(names.slice(0, 3)));
        await in3.fill('qqqzzzxxyy');
        await p3.waitForTimeout(400);
        const em = await p3.$$eval('.menu-search-empty', e => e.filter(x => x.offsetParent).length);
        report(em === 1, `Ladefehler (${mode}): Leerzustand zeigt "nichts gefunden"`, String(em));
        await p3.close();
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
