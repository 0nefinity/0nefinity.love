// Gesten-Test (Playwright, Pixel-7-Profil). Aufruf:
//   node tests/gesten/run.js [--fps] [--shots <ordner>]
// 1. tools/gesten.js allein: Anker (Weltpunkt unter Zeiger/Pinch-Mitte bleibt auf < 1 px), Pinch -> Schwenk ohne Sprung, Maus, Rad, Ausnahme (Panel).
//    Gegenprobe: dieselben Pruefungen gegen eine Kopie mit kaputter Ankerrechnung muessen rot werden.
// 2. 1c0de.html: Start zentriert und ganz im Bild (je Form/Quelle, Pixel 7 und 412x749), Text 01 -> 018 Tastenanschlag fuer Tastenanschlag
//    (auch mit laufendem Worker): immer genau eine Form, mittig, Nah/Fern deckungsgleich, Panel gleiche Auswahl in jeder Form, kein Groessenregler.
// Der Test liefert das Repo selbst aus (tests/lib/serve.js, SSI). Playwright/Chromium per Umgebung: PLAYWRIGHT_PATH, CHROME_PATH.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { chromium, devices } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { start } = require('../lib/serve.js');
const CHROME = process.env.CHROME_PATH || undefined;
const ROOT = path.join(__dirname, '..', '..');
const args = process.argv.slice(2);
const FPS = args.includes('--fps');
const si = args.indexOf('--shots');
const SHOTS = si >= 0 ? args[si + 1] : null;
const failures = [];
const check = (name, ok, info) => { console.log(`  ${ok ? 'ok' : 'x '} ${name}${info ? ': ' + info : ''}`); if (!ok) failures.push(`${name} ${info || ''}`); };
const GESTEN = fs.readFileSync(path.join(ROOT, 'tools', 'gesten.js'), 'utf8');

// Kaputte Ankerrechnung: der Weltpunkt rutscht bei jedem Zoomschritt um 2 %
const KAPUTT = GESTEN.replace(/- (wx|wy) \* (scale|s)\b/g, '- $1 * $2 * 0.98');

// ---- 1. Reine Rechnung ----
function rechnung(src) {
    const out = [];
    const win = {};
    vm.runInNewContext(src, { window: win, document: {} });
    const G = win.Gesten;
    let worst = 0;
    for (let i = 0; i < 200; i++) {
        const v = { scale: 0.2 + (i % 17) * 0.37, x: (i * 53) % 400 - 200, y: (i * 31) % 500 - 250 };
        const px = (i * 97) % 412, py = (i * 61) % 749, s = v.scale * (0.5 + (i % 11) * 0.3);
        const n = G.ankern(v, px, py, s);
        const wx = (px - v.x) / v.scale, wy = (py - v.y) / v.scale;
        worst = Math.max(worst, Math.hypot(n.x + wx * n.scale - px, n.y + wy * n.scale - py));
    }
    out.push(['ankern: Weltpunkt bleibt unter dem Zeiger', worst < 1e-6, `Abweichung ${worst.toExponential(2)} px`]);
    out.push(['klemmen: null = unbegrenzt, Untergrenze > 0', G.klemmen(1e6, null, null) === 1e6 && G.klemmen(0.25, null, null) === 0.25 && G.klemmen(0, null, null) > 0, '']);
    out.push(['klemmen: Grenzen wirken', G.klemmen(10, 0.5, 4) === 4 && G.klemmen(0.1, 0.5, 4) === 0.5, '']);
    return out;
}

// ---- 2. Gesten in einer Pruefseite ----
const HARNESS = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;height:100vh;overflow:hidden">
<div id="w" style="position:absolute;left:0;top:0;width:200px;height:200px;transform-origin:0 0;background:#fff"></div>
<div id="panel" style="position:fixed;left:0;right:0;bottom:0;height:120px;background:#333" class="ctrl-x"></div></body></html>`;

async function gestenSeite(browser, src) {
    const out = [];
    const ctx = await browser.newContext({ ...devices['Pixel 7'] });
    const p = await ctx.newPage();
    const cdp = await ctx.newCDPSession(p);
    await p.setContent(HARNESS);
    await p.addScriptTag({ content: src });
    await p.evaluate(() => {
        window.S = { scale: 1, x: 100, y: 100 };
        const w = document.getElementById('w');
        const draw = () => { w.style.transform = `translate(${S.x}px,${S.y}px) scale(${S.scale})`; };
        draw();
        Gesten.attach(document.body, { getView: () => ({ ...S }), setView: v => { S = v; draw(); }, minScale: null, maxScale: null, excludeSelector: '.ctrl-x' });
    });
    const S = () => p.evaluate(() => ({ ...S }));
    const welt = async (px, py) => { const s = await S(); return { wx: (px - s.x) / s.scale, wy: (py - s.y) / s.scale }; };
    const drift = async (wp, px, py) => { const s = await S(); return Math.hypot(s.x + wp.wx * s.scale - px, s.y + wp.wy * s.scale - py); };
    const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q, i) => ({ x: q.x, y: q.y, id: q.id ?? i })) });

    // Rad: Zoom ein und aus am Zeiger, Schritt 3 %
    let wp = await welt(300, 400);
    await p.mouse.move(300, 400);
    for (let i = 0; i < 12; i++) await p.mouse.wheel(0, -100);
    await p.waitForTimeout(50);
    let s = await S();
    out.push(['Rad: Weltpunkt unter dem Zeiger (ein)', (await drift(wp, 300, 400)) < 1, `${(await drift(wp, 300, 400)).toFixed(3)} px`]);
    out.push(['Rad: ein = 3 % je Schritt', Math.abs(s.scale - Math.pow(1.03, 12)) < 1e-6, `Faktor ${s.scale.toFixed(4)}`]);
    for (let i = 0; i < 30; i++) await p.mouse.wheel(0, 100);
    await p.waitForTimeout(50);
    out.push(['Rad: Weltpunkt unter dem Zeiger (aus)', (await drift(wp, 300, 400)) < 1, `${(await drift(wp, 300, 400)).toFixed(3)} px`]);
    // Maus ziehen
    await p.evaluate(() => { S = { scale: 1, x: 100, y: 100 }; document.getElementById('w').style.transform = 'translate(100px,100px)'; });
    await p.mouse.move(50, 50); await p.mouse.down(); await p.mouse.move(130, 80, { steps: 6 }); await p.mouse.up();
    s = await S();
    out.push(['Maus: Ziehen schwenkt', Math.abs(s.x - 180) < 0.5 && Math.abs(s.y - 130) < 0.5, `x ${s.x} y ${s.y}`]);
    await p.mouse.move(60, 60); await p.mouse.move(200, 200);
    s = await S();
    out.push(['Maus: ohne Taste kein Schwenk', Math.abs(s.x - 180) < 0.5, `x ${s.x}`]);
    // Ein Finger ziehen
    await T('touchStart', [{ x: 100, y: 300 }]);
    for (let i = 1; i <= 8; i++) await T('touchMove', [{ x: 100 + i * 5, y: 300 + i * 3 }]);
    await T('touchEnd', []);
    s = await S();
    out.push(['Finger: Ziehen schwenkt', Math.abs(s.x - 220) < 1 && Math.abs(s.y - 154) < 1, `x ${s.x} y ${s.y}`]);
    // Panel ausgenommen
    const vor = await S();
    await T('touchStart', [{ x: 100, y: 780 }]);
    for (let i = 1; i <= 8; i++) await T('touchMove', [{ x: 100 + i * 5, y: 780 - i * 3 }]);
    await T('touchEnd', []);
    s = await S();
    out.push(['Panel: Finger darauf schwenkt nicht', s.x === vor.x && s.y === vor.y, `x ${s.x} y ${s.y}`]);
    // Pinch mit wandernder Mitte
    await p.evaluate(() => { S = { scale: 1, x: 100, y: 100 }; document.getElementById('w').style.transform = 'translate(100px,100px)'; });
    const m0 = { x: 200, y: 300 };
    wp = await welt(m0.x, m0.y);
    await T('touchStart', [{ x: 150, y: 300, id: 0 }, { x: 250, y: 300, id: 1 }]);
    const N = 20;
    for (let i = 1; i <= N; i++) {
        const t = i / N, half = 50 + 50 * t, mx = 200 + 30 * t, my = 300 + 20 * t;
        await T('touchMove', [{ x: mx - half, y: my, id: 0 }, { x: mx + half, y: my, id: 1 }]);
    }
    s = await S();
    out.push(['Pinch: Faktor folgt dem Fingerabstand', Math.abs(s.scale - 2) < 0.01, `Faktor ${s.scale.toFixed(3)}`]);
    out.push(['Pinch: Weltpunkt unter der wandernden Mitte', (await drift(wp, 230, 320)) < 1, `${(await drift(wp, 230, 320)).toFixed(3)} px`]);
    // Ein Finger loslassen: der andere zieht ohne Sprung weiter
    await T('touchEnd', [{ x: 330, y: 320, id: 1 }]); // CDP: touchEnd nennt die losgelassenen Punkte
    await p.waitForTimeout(30);
    const nachLoslassen = await S();
    out.push(['Pinch -> Schwenk: kein Sprung beim Loslassen', Math.abs(nachLoslassen.x - s.x) < 0.5 && Math.abs(nachLoslassen.y - s.y) < 0.5 && nachLoslassen.scale === s.scale, `dx ${(nachLoslassen.x - s.x).toFixed(2)} dy ${(nachLoslassen.y - s.y).toFixed(2)}`]);
    for (let i = 1; i <= 6; i++) await T('touchMove', [{ x: 130 + i * 5, y: 320 + i * 3, id: 0 }]);
    await T('touchEnd', []);
    const ende = await S();
    out.push(['Pinch -> Schwenk: verbliebener Finger schwenkt', Math.abs(ende.x - nachLoslassen.x - 30) < 1 && Math.abs(ende.y - nachLoslassen.y - 18) < 1 && ende.scale === s.scale, `dx ${(ende.x - nachLoslassen.x).toFixed(2)} dy ${(ende.y - nachLoslassen.y).toFixed(2)}`]);
    await ctx.close();
    return out;
}

// ---- 3. 1c0de.html ----
const lage = () => {
    const vv = visualViewport;
    const box = id => { const b = document.getElementById(id).getBoundingClientRect(); return { l: b.left, t: b.top, w: b.width, h: b.height }; };
    const sicht = c => !!c && getComputedStyle(c).visibility !== 'hidden' && +getComputedStyle(c).opacity > 0;
    const ink = id => {
        const c = document.getElementById(id);
        if (!sicht(c) || !c.width) return null;
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
        for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        if (x1 < 0) return null;
        const r = c.getBoundingClientRect(), k = r.width / c.width;
        return { l: r.left + x0 * k, t: r.top + y0 * k, r: r.left + (x1 + 1) * k, b: r.top + (y1 + 1) * k };
    };
    const cs = id => getComputedStyle(document.getElementById(id));
    return {
        vw: vv.width, vh: vv.height, ot: vv.offsetTop, ol: vv.offsetLeft,
        muster: box('muster'), fern: box('fern'), nah: box('nah'),
        vm: cs('muster').visibility, vf: cs('fern').visibility, vn: cs('nah').visibility,
        om: +cs('muster').opacity,
        inkF: ink('fern'), inkN: ink('nah'),
        meldung: document.getElementById('meldung').hidden ? '' : document.getElementById('meldung').textContent,
        rows: [...document.querySelectorAll('.ctrl-panel [data-key]')].filter(e => getComputedStyle(e).display !== 'none').map(e => e.dataset.key),
        text: document.getElementById('muster').textContent.replace(/\s/g, '').slice(0, 8),
    };
};

// Prueft eine Lage der "Seite"-Quelle: eine Form, mittig (< 1 px), ganz im Bild, Nah und Fern deckungsgleich (< 1 px)
function formPruefen(name, L, opts = {}) {
    // Ist der Nahtext ausgeblendet (kleine Schrift), zaehlt allein die Fern-Textur
    const nahDa = L.vm !== 'hidden' && L.om > 0, fernDa = L.vf !== 'hidden';
    // Symbol: die Textbox endet an der breitesten gefuellten Zeile (Leerrand rechts), das Raster ist die Fern-Box; links und oben beginnen beide gleich
    const m = nahDa && !opts.symbol ? L.muster : L.fern, f = L.fern;
    const cx = m.l + m.w / 2 - (L.ol + L.vw / 2), cy = m.t + m.h / 2 - (L.ot + L.vh / 2);
    check(`${name}: keine Fehlermeldung`, L.meldung === '', L.meldung);
    check(`${name}: mittig`, Math.abs(cx) < 1 && Math.abs(cy) < 1, `dx ${cx.toFixed(2)} dy ${cy.toFixed(2)}`);
    check(`${name}: ganz im Bild`, m.l >= L.ol - 1 && m.t >= L.ot - 1 && m.l + m.w <= L.ol + L.vw + 1 && m.t + m.h <= L.ot + L.vh + 1, `Box ${m.l.toFixed(1)},${m.t.toFixed(1)} ${m.w.toFixed(1)}x${m.h.toFixed(1)} in ${L.vw}x${L.vh}`);
    if (nahDa && fernDa) {
        const n = L.muster;
        const ab = opts.symbol ? Math.max(Math.abs(n.l - f.l), Math.abs(n.t - f.t)) : Math.max(Math.abs(m.l - f.l), Math.abs(m.t - f.t), Math.abs(m.l + m.w - f.l - f.w), Math.abs(m.t + m.h - f.t - f.h));
        check(`${name}: Nah und Fern deckungsgleich`, ab < 1, `${ab.toFixed(2)} px`);
    }
    if (L.inkF && !opts.symbol) {
        const fm = (L.inkF.l + L.inkF.r) / 2 - (m.l + m.w / 2), fh = (L.inkF.t + L.inkF.b) / 2 - (m.t + m.h / 2);
        const tol = Math.max(3, 0.02 * Math.max(m.w, m.h));
        check(`${name}: Fern-Textur sitzt in der Box (kein Altbild)`, Math.abs(fm) < tol && Math.abs(fh) < tol && L.inkF.l >= f.l - 1 && L.inkF.r <= f.l + f.w + 1, `Tintenmitte ${fm.toFixed(1)}/${fh.toFixed(1)} Toleranz ${tol.toFixed(1)}`);
    }
    // Die Form besteht aus dem Quelltext der Seite, in Lesereihenfolge: das erste Zeichen der Form ist das erste der Seite
    if (nahDa) check(`${name}: Zeichenreihenfolge`, L.text.startsWith('<!DOCTYP'), L.text);
}

async function waehle(p, key, text) {
    // Die Auswahlliste wird bei Aenderung neu gebaut: bei abgehaengtem Eintrag Liste neu oeffnen
    for (let versuch = 0; ; versuch++) {
        try {
            await p.click(`[data-key="${key}"] .ctrl-select-trigger`);
            await p.locator('.ctrl-select-option:visible', { hasText: new RegExp('^' + text + '$') }).first().click({ timeout: 4000 });
            return;
        } catch (e) { if (versuch >= 2) throw e; await p.waitForTimeout(300); }
    }
}

async function seite(browser, base, profil, fn) {
    const ctx = await browser.newContext(profil);
    const p = await ctx.newPage();
    const fehler = [];
    p.on('console', m => { if (m.type() === 'error' && !/401/.test(m.text())) fehler.push(m.text().slice(0, 160)); });
    p.on('pageerror', e => fehler.push(e.message));
    await p.goto(base + '/1c0de', { waitUntil: 'load' });
    await p.waitForTimeout(2200);
    try { await fn(p, ctx); } finally { check(`${profil.name || 'Seite'}: keine Konsolenfehler (ausser 401)`, !fehler.length, fehler[0]); await ctx.close(); }
}

const PROFILE = [
    { name: 'Pixel 7', ...devices['Pixel 7'] },
    { name: '412x749', ...devices['Pixel 7'], viewport: { width: 412, height: 749 } },
];

async function s1c0de(browser, base) {
    for (const profil of PROFILE) {
        console.log(`1c0de (${profil.name})`);
        await seite(browser, base, profil, async p => {
            const L0 = await p.evaluate(lage);
            check('Panel: Auswahl in Form Text', L0.rows.join(',') === 'modus,quelle,form,pfad', L0.rows.join(','));
            check('Panel: kein Groessenregler', !(await p.$('[data-key="groesse"]')));
            formPruefen('Start Text 01', L0, { text: '01' });
            // Form 018: gleiche Auswahl ausser dem Textfeld
            await waehle(p, 'modus', '018');
            await p.waitForTimeout(1500);
            const L1 = await p.evaluate(lage);
            check('Panel: Auswahl in Form 018', L1.rows.join(',') === 'modus,quelle,pfad', L1.rows.join(','));
            formPruefen('Form 018, Diese Seite', L1, { symbol: true });
            // Ganzes Projekt: Text und 018 gleichermassen
            await waehle(p, 'quelle', 'Ganzes Projekt');
            await p.waitForTimeout(3500);
            const L2 = await p.evaluate(lage);
            check('Panel: Ganzes Projekt, Form 018: kein Seitenfeld', L2.rows.join(',') === 'modus,quelle', L2.rows.join(','));
            projektPruefen('Form 018, Ganzes Projekt', L2, false);
            await waehle(p, 'modus', 'Text');
            await p.waitForTimeout(3500);
            const L3 = await p.evaluate(lage);
            check('Panel: Ganzes Projekt, Form Text: Textfeld, kein Seitenfeld', L3.rows.join(',') === 'modus,quelle,form', L3.rows.join(','));
            projektPruefen('Form Text, Ganzes Projekt', L3, true);
            await waehle(p, 'quelle', 'Diese Seite');
            await p.waitForTimeout(1500);
            formPruefen('Zurueck zu Text, Diese Seite', await p.evaluate(lage), { text: '01' });
        });
    }
}

function projektPruefen(name, L, mittig) {
    const alle = [L.inkF, L.inkN].filter(Boolean);
    check(`${name}: Form sichtbar`, alle.length > 0 && L.meldung === '', L.meldung);
    if (!alle.length) return;
    const l = Math.min(...alle.map(i => i.l)), t = Math.min(...alle.map(i => i.t)), r = Math.max(...alle.map(i => i.r)), b = Math.max(...alle.map(i => i.b));
    check(`${name}: ganz im Bild`, l >= L.ol + 1 && t >= L.ot + 1 && r <= L.ol + L.vw - 1 && b <= L.ot + L.vh - 1, `Tinte ${l.toFixed(0)},${t.toFixed(0)} bis ${r.toFixed(0)},${b.toFixed(0)} in ${L.vw}x${L.vh}`);
    const dx = (l + r) / 2 - (L.ol + L.vw / 2), dy = (t + b) / 2 - (L.ot + L.vh / 2);
    // Das ruhende Text-Bild ist symmetrisch (< 3 px); das drehende Symbol hat je Winkel eine andere Tintenmitte (Mitte des Rades liegt fest)
    const tol = mittig ? 3 : 0.12 * Math.min(L.vw, L.vh);
    check(`${name}: mittig`, Math.abs(dx) < tol && Math.abs(dy) < tol, `Tintenmitte dx ${dx.toFixed(1)} dy ${dy.toFixed(1)} (Toleranz ${tol.toFixed(1)})`);
}

async function tippen(browser, base) {
    for (const profil of PROFILE) {
        for (const mitWorker of [false, true]) {
            console.log(`Text 01 -> 018 tippen (${profil.name}${mitWorker ? ', Worker laeuft' : ''})`);
            await seite(browser, base, profil, async (p, ctx) => {
                const cdp = await ctx.newCDPSession(p);
                await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
                if (mitWorker) {
                    await waehle(p, 'modus', '018');
                    await p.waitForTimeout(1200);
                    await waehle(p, 'modus', 'Text');
                }
                await p.evaluate(() => document.querySelector('[data-key="form"] input').focus());
                await p.keyboard.press('Control+A');
                await p.keyboard.type('0');
                await p.keyboard.type('1');
                formPruefen('nach "01"', await p.evaluate(lage), { text: '01' });
                await p.keyboard.type('8');
                formPruefen('direkt nach "018"', await p.evaluate(lage), { text: '018' });
                await p.waitForTimeout(80);
                formPruefen('80 ms nach "018"', await p.evaluate(lage), { text: '018' });
                await p.waitForTimeout(700);
                const settle = await p.evaluate(lage);
                formPruefen('ruhig nach "018"', settle, { text: '018' });
                // Gleiche Form, sauber geladen, gleiche Lage
                for (const ch of ['8', '1']) { await p.keyboard.press('Backspace'); await p.waitForTimeout(0); }
                await p.keyboard.type('18');
                formPruefen('Backspace/Tippen im Wechsel', await p.evaluate(lage), { text: '018' });
                const nach = await p.evaluate(lage);
                const d = Math.max(Math.abs(nach.muster.l - settle.muster.l), Math.abs(nach.muster.t - settle.muster.t), Math.abs(nach.muster.w - settle.muster.w), Math.abs(nach.muster.h - settle.muster.h));
                check('gleiche Eingabe, gleiche Lage', d < 1, `${d.toFixed(2)} px`);
                if (SHOTS && !mitWorker) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, `tippen-${profil.name.replace(/\W/g, '')}.png`) }); }
            });
        }
    }
    // Tastatur: Sichtbereich schrumpft, die Form bleibt mittig im sichtbaren Bereich
    console.log('Tastatur (412x749 -> 412x420)');
    await seite(browser, base, PROFILE[1], async p => {
        await p.evaluate(() => document.querySelector('[data-key="form"] input').focus());
        await p.keyboard.press('End');
        await p.setViewportSize({ width: 412, height: 420 });
        await p.keyboard.type('8');
        await p.waitForTimeout(900);
        formPruefen('Tastatur offen', await p.evaluate(lage), { text: '018' });
        await p.setViewportSize({ width: 412, height: 749 });
        await p.waitForTimeout(900);
        formPruefen('Tastatur zu', await p.evaluate(lage), { text: '018' });
    });
}

// Gesten auf der echten Seite: Zoom unbegrenzt, Zeiger bleibt auf dem Punkt, Reset stellt die Mitte wieder her
async function gestenAufSeite(browser, base) {
    console.log('1c0de Gesten (Desktop)');
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('console', m => { if (m.type() === 'error' && !/401/.test(m.text())) fehler.push(m.text().slice(0, 160)); });
    p.on('pageerror', e => fehler.push(e.message));
    await p.goto(base + '/1c0de', { waitUntil: 'load' });
    await p.waitForTimeout(2200);
    const L0 = await p.evaluate(lage);
    formPruefen('Desktop Start', L0, { text: '01' });
    // Zeiger auf einem Punkt der Form weit weg von der Mitte
    const m = L0.muster, px = m.l + m.w * 0.85, py = m.t + m.h * 0.2;
    const u = (px - m.l) / m.w, v = (py - m.t) / m.h;
    await p.mouse.move(px, py);
    for (let i = 0; i < 20; i++) await p.mouse.wheel(0, -100);
    await p.waitForTimeout(300);
    const L1 = await p.evaluate(lage);
    const wachs = L1.muster.w / m.w;
    const fx = L1.muster.l + u * L1.muster.w - px, fy = L1.muster.t + v * L1.muster.h - py;
    check('Rad zoomt hinein', wachs > 1.7, `Faktor ${wachs.toFixed(2)} (erwartet ${Math.pow(1.03, 20).toFixed(2)})`);
    check('Rad: Punkt unter dem Zeiger bleibt', Math.hypot(fx, fy) < 1.5, `${Math.hypot(fx, fy).toFixed(2)} px`);
    await p.mouse.move(600, 400); await p.mouse.down(); await p.mouse.move(520, 360, { steps: 5 }); await p.mouse.up();
    await p.waitForTimeout(150);
    const L2 = await p.evaluate(lage);
    const sx = (L2.muster.l + L2.muster.w / 2) - (L1.muster.l + L1.muster.w / 2);
    check('Ziehen schwenkt die Form', Math.abs(sx + 80) < 2, `dx ${sx.toFixed(1)}`);
    // Reset
    await p.click('.ctrl-reset-btn');
    await p.waitForTimeout(400);
    formPruefen('nach Reset', await p.evaluate(lage), { text: '01' });
    check('Desktop: keine Konsolenfehler (ausser 401)', !fehler.length, fehler[0]);
    await ctx.close();
}

// Bilder je Sekunde bei 4x gedrosselter CPU (Pixel 7)
async function bilder(browser, base) {
    console.log('Bilder je Sekunde (4x CPU, Pixel 7)');
    const faelle = [['Text, Diese Seite', null, null], ['018, Diese Seite', 'modus', '018'], ['018, Ganzes Projekt', 'quelle', 'Ganzes Projekt'], ['Text, Ganzes Projekt', 'modus', 'Text']];
    await seite(browser, base, PROFILE[0], async (p, ctx) => {
        const cdp = await ctx.newCDPSession(p);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        for (const [name, key, wert] of faelle) {
            if (key) await waehle(p, key, wert);
            await p.waitForTimeout(name.includes('Projekt') ? 4000 : 1500);
            const n = await p.evaluate(() => new Promise(res => { let c = 0; const t0 = performance.now(); const f = now => { c++; if (now - t0 < 3000) requestAnimationFrame(f); else res(c / ((now - t0) / 1000)); }; requestAnimationFrame(f); }));
            check(`${name}: >= 25 Bilder/s`, n >= 25, `${n.toFixed(1)}`);
        }
    });
}

(async () => {
    console.log('tools/gesten.js: Rechnung');
    for (const [n, ok, i] of rechnung(GESTEN)) check(n, ok, i);
    const { server, base } = await start(ROOT);
    const browser = await chromium.launch({ executablePath: CHROME });
    try {
        console.log('tools/gesten.js: Gesten');
        for (const [n, ok, i] of await gestenSeite(browser, GESTEN)) check(n, ok, i);
        // Gegenprobe: mit kaputter Ankerrechnung muss derselbe Test rot werden
        console.log('Gegenprobe (kaputte Ankerrechnung muss durchfallen)');
        const nachRechnung = rechnung(KAPUTT).filter(r => !r[1]).length;
        const nachGesten = (await gestenSeite(browser, KAPUTT)).filter(r => !r[1]).length;
        const gesamt = failures.length;
        // die roten Zeilen der Gegenprobe zaehlen nicht als Fehler
        failures.length = 0;
        check('Gegenprobe: Rechnung faellt durch', nachRechnung > 0, `${nachRechnung} rot`);
        check('Gegenprobe: Gesten fallen durch', nachGesten > 0, `${nachGesten} rot`);
        void gesamt;
        await s1c0de(browser, base);
        await tippen(browser, base);
        await gestenAufSeite(browser, base);
        if (FPS) await bilder(browser, base);
    } finally {
        await browser.close();
        server.close();
    }
    if (failures.length) { console.log(`\nFAIL (${failures.length})`); process.exit(1); }
    console.log('\nOK');
})().catch(e => { console.error(e); process.exit(1); });
