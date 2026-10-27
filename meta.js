// meta.js — Suche, Menü-Komfort, Viewport-Sync, Pre-Fitting. Menü, Back-Button, Fonts kommen aus den SSI-Includes; Dialog, Live-Reload, Math-Notation liegen in tools/.

// ─── Tab-Titel: "<label>/<pfad>" ───
// Label = Domain, über die der Besucher ursprünglich kam (nginx leitet 018.bio per ?von= um); bleibt im Tab erhalten.
const TAB_LABELS = { '018bio': '018.BIO', '0nefinity018bio': '0nefinity.018.BIO',
    'dev018bio': 'dev.018.BIO', '018bio0nefinitylove': '018.BIO.0nefinity.love', '0nefinitylove018bio': '0nefinity.love.018.BIO',
    '0180nefinitylove': '018.0nefinity.love', 'bio0nefinitylove': 'BIO.0nefinity.love' };
function resolveTabLabel() {
    let label = null;
    try {
        const url = new URL(location.href);
        const von = url.searchParams.get('von');
        if (von !== null) {
            url.searchParams.delete('von');
            history.replaceState(history.state, '', url.pathname + url.search + url.hash);
            if (Object.prototype.hasOwnProperty.call(TAB_LABELS, von)) {
                label = TAB_LABELS[von];
                sessionStorage.setItem('tabLabel', label);
            }
        }
        if (!label) label = sessionStorage.getItem('tabLabel');
        return label || location.hostname;
    } catch (err) {
        console.error('meta.js: Tab-Label nicht aus sessionStorage lesbar/schreibbar', err);
        return label || location.hostname;
    }
}
function tabPath() {
    let path = location.pathname.replace(/^\/+/, '');
    try { path = decodeURIComponent(path); } catch (err) { console.error('meta.js: Pfad nicht dekodierbar', err); }
    return path.replace(/(^|\/)index(\.html)?$/, '').replace(/\.html$/, '').replace(/\/$/, '');
}
const tabLabel = resolveTabLabel();
function applyTabTitle() {
    const path = tabPath();
    document.title = path ? `${tabLabel}/${path}` : tabLabel;
}
applyTabTitle();

// ─── Favicon: das rotierende 0 1 ∞ auf 018.html ───
// Nur Seiten mit <html data-favicon="rotating"> (018.html) drehen das Icon; überall sonst bleibt das statische /favicon.ico.
// Geometrie wie drawFrameWithAngle in 0nefinity.js (Radius 30 %, Zeichen 25 %, ≡ 23 % auf den Kanten), weiß auf transparent wie /favicon.ico.
// Tempo wie die Startseite: Auto-Speed-Stufen aus AUTO_SPEED_CONFIG in 0nefinity.js (°/Frame, Cosinus-Rampen), hier 1:1 kopiert und mit virtuellen 60-Hz-Frames aus der Zeit aufsummiert (Monitor-Hz egal). Auf 018.html (wie auf der Startseite) wird stattdessen der Winkel des Seiten-Symbols (window.__symbolAngle) gespiegelt.
// 32 px = native Größe eines 16-px-Tab-Icons auf 2x-Displays und ~4x billigeres toDataURL pro Frame als 64 px; das Einlesen des Streams ist der Engpass, nicht das Zeichnen.
// Test: ?favfps=<1-120> deckelt die Bildrate, ?favspeed=<Faktor> skaliert das Seiten-Tempo (Standard 1); ?favmode=ruhig dreht konstant 30°/s (mal favspeed) statt im Seiten-Tempo; alles bleibt im Tab (sessionStorage).
const FAVICON_SIZE = 32;
const FAVICON_VIRTUAL_HZ = 60;
const FAVICON_SPEED_CONFIG = {
    START_PHASE: { startSpeed: 30, rampTo: 0, rampDuration: 0.8, holdDuration: 1.5 },
    SPEED_STEPS: [
        { increment: 120, rampDuration: 0.8, holdDuration: 1.5 },
        { increment: 240, rampDuration: 0.8, holdDuration: 1.5 },
        { increment: 180, rampDuration: 0.8, holdDuration: 1.5 },
        { increment: 180, rampDuration: 0.8, holdDuration: 1.5 }
    ]
};
function faviconLerp(a, b, t) { return a + (b - a) * t; }
function faviconAutoSpeed(elapsed) {
    const sp = FAVICON_SPEED_CONFIG.START_PHASE;
    const steps = FAVICON_SPEED_CONFIG.SPEED_STEPS;
    if (elapsed < sp.rampDuration) {
        const t = elapsed / sp.rampDuration;
        return faviconLerp(sp.startSpeed, sp.rampTo, (1 - Math.cos(Math.PI * t)) / 2);
    }
    const startPhaseEnd = sp.rampDuration + sp.holdDuration;
    if (elapsed < startPhaseEnd) return sp.rampTo;
    const T = elapsed - startPhaseEnd;
    const cycleDur = steps.reduce((a, s) => a + s.rampDuration + s.holdDuration, 0);
    const incPerCycle = steps.reduce((a, s) => a + s.increment, 0);
    const cyclesCompleted = Math.floor(T / cycleDur);
    const tInCycle = T - cyclesCompleted * cycleDur;
    let stepBase = sp.rampTo + cyclesCompleted * incPerCycle;
    let acc = 0;
    for (const step of steps) {
        const stepEnd = acc + step.rampDuration + step.holdDuration;
        if (tInCycle < stepEnd) {
            const tInStep = tInCycle - acc;
            if (tInStep < step.rampDuration) {
                const t = tInStep / step.rampDuration;
                return faviconLerp(stepBase, stepBase + step.increment, (1 - Math.cos(Math.PI * t)) / 2);
            }
            return stepBase + step.increment;
        }
        acc = stepEnd;
        stepBase += step.increment;
    }
    return stepBase;
}
function favRaw(name) {
    let raw = null;
    try {
        const url = new URL(location.href);
        const fromUrl = url.searchParams.get(name);
        if (fromUrl !== null) sessionStorage.setItem(name, fromUrl);
        raw = sessionStorage.getItem(name);
    } catch (err) {
        console.error('meta.js: ' + name + ' nicht aus sessionStorage lesbar/schreibbar', err);
    }
    return raw;
}
function favParam(name, min, max, fallback) {
    const raw = favRaw(name);
    if (raw === null || raw.trim() === '') return fallback;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < min || value > max) {
        console.error('meta.js: ' + name + '=' + raw + ' ungültig (erlaubt ' + min + ' bis ' + max + '), Standard ' + fallback + ' bleibt');
        return fallback;
    }
    return value;
}
const FAVICON_LABELS = ['0', '1', '∞'];
const FAVICON_RADIUS = FAVICON_SIZE * 0.30;
const FAVICON_FONT_LABEL = `bold ${FAVICON_SIZE * 0.25}px Verdana`;
const FAVICON_FONT_EDGE = `bold ${FAVICON_SIZE * 0.23}px Verdana`;
const FAVICON_STEP = 2 * Math.PI / FAVICON_LABELS.length;
function drawFaviconFrame(ctx, angleRad) {
    ctx.clearRect(0, 0, FAVICON_SIZE, FAVICON_SIZE);
    ctx.save();
    ctx.translate(FAVICON_SIZE / 2, FAVICON_SIZE / 2);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = FAVICON_FONT_LABEL;
    for (let i = 0; i < 3; i++) {
        const theta = angleRad + i * FAVICON_STEP;
        ctx.fillText(FAVICON_LABELS[i], FAVICON_RADIUS * Math.cos(theta), FAVICON_RADIUS * Math.sin(theta));
    }
    ctx.font = FAVICON_FONT_EDGE;
    for (let i = 0; i < 3; i++) {
        const t0 = angleRad + i * FAVICON_STEP;
        const t1 = t0 + FAVICON_STEP;
        const x0 = FAVICON_RADIUS * Math.cos(t0), y0 = FAVICON_RADIUS * Math.sin(t0);
        const x1 = FAVICON_RADIUS * Math.cos(t1), y1 = FAVICON_RADIUS * Math.sin(t1);
        ctx.save();
        ctx.translate((x0 + x1) / 2, (y0 + y1) / 2);
        ctx.rotate(Math.atan2(y1 - y0, x1 - x0));
        ctx.fillText('≡', 0, 0);
        ctx.restore();
    }
    ctx.restore();
}
// Das Symbol ist nicht 3-zählig symmetrisch (0, 1, ∞ sind verschiedene Zeichen), die Periode ist 360°. Frames liegen im 2°-Raster (180 Stück), werden beim ersten Bedarf gezeichnet und in Leerlauf-Häppchen vorab gefüllt.
const FAVICON_STEP_DEG = 2;
const FAVICON_FRAMES = 360 / FAVICON_STEP_DEG;
const FAVICON_RUHIG_DEG_PER_S = 30;
function startFaviconAnimation() {
    if (document.documentElement.dataset.favicon !== 'rotating') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const link = document.querySelector('link[rel~="icon"]');
    if (!link || !/\/favicon\.ico$/.test(new URL(link.href, location.href).pathname)) return;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = FAVICON_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error('meta.js: Favicon-Animation nicht möglich, kein 2d-Canvas; statisches Icon bleibt');
        return;
    }
    const fps = favParam('favfps', 1, 120, 0);
    const minFrameMs = fps ? 1000 / fps : 0;
    const speedFactor = favParam('favspeed', -1e6, 1e6, 1);
    link.type = 'image/png';
    link.removeAttribute('sizes');
    const ruhig = favRaw('favmode') === 'ruhig';
    const cache = new Array(FAVICON_FRAMES);
    function frameUrl(idx) {
        if (cache[idx] === undefined) {
            drawFaviconFrame(ctx, idx * FAVICON_STEP_DEG * Math.PI / 180);
            cache[idx] = canvas.toDataURL('image/png');
        }
        return cache[idx];
    }
    let warmIdx = 0;
    function warm(deadline) {
        const t0 = performance.now();
        while (warmIdx < FAVICON_FRAMES && (deadline && deadline.timeRemaining ? deadline.timeRemaining() > 2 : performance.now() - t0 < 8)) frameUrl(warmIdx++);
        if (warmIdx < FAVICON_FRAMES) schedule();
    }
    function schedule() {
        if (window.requestIdleCallback) requestIdleCallback(warm, { timeout: 2000 });
        else setTimeout(warm, 50);
    }
    schedule();
    let shownIdx = -1;
    let lastNow = null;
    let start = null;
    let last = -Infinity;
    let virtualFrame = 0;
    let angleDeg = 0;
    function tick(now) {
        requestAnimationFrame(tick);
        if (start === null) start = now;
        if (now - last < minFrameMs - 1) return;
        last = now;
        const elapsed = (now - start) / 1000;
        const pageFresh = typeof window.__symbolAngle === 'number' && now - window.__symbolAngleT < 250;
        if (ruhig) {
            if (lastNow !== null) angleDeg = (angleDeg + FAVICON_RUHIG_DEG_PER_S * speedFactor * (now - lastNow) / 1000) % 360;
            lastNow = now;
        } else if (pageFresh && speedFactor === 1) {
            angleDeg = window.__symbolAngle;
        } else {
            const due = Math.floor(elapsed * FAVICON_VIRTUAL_HZ);
            // Wie die Seite nach Tab-Pause: Zeitplan springt weiter, der Winkel macht höchstens wenige Frames
            if (due - virtualFrame > 10) virtualFrame = due - 10;
            const speed = faviconAutoSpeed(elapsed) * speedFactor;
            while (virtualFrame < due) {
                angleDeg = (angleDeg + speed) % 360;
                virtualFrame++;
            }
        }
        const idx = ((Math.round(angleDeg / FAVICON_STEP_DEG) % FAVICON_FRAMES) + FAVICON_FRAMES) % FAVICON_FRAMES;
        if (idx === shownIdx) return;
        shownIdx = idx;
        link.href = frameUrl(idx);
    }
    requestAnimationFrame(tick);
}
try { startFaviconAnimation(); } catch (err) { console.error('meta.js: Favicon-Animation fehlgeschlagen; statisches Icon bleibt', err); }

// DOM-Manipulation erst wenn Body existiert
document.addEventListener('DOMContentLoaded', () => {

applyTabTitle();

// ─── Viewport-Sync ───
function syncVisibleViewport() {
    const root = document.documentElement;
    const visualViewport = window.visualViewport;
    const layoutWidth = Math.max(root.clientWidth || 0, window.innerWidth || 0, 1);
    const layoutHeight = Math.max(root.clientHeight || 0, window.innerHeight || 0, 1);
    const width = Math.max(1, visualViewport?.width || layoutWidth);
    const height = Math.max(1, visualViewport?.height || window.innerHeight || layoutHeight);
    const top = Math.max(0, visualViewport?.offsetTop || 0);
    const left = Math.max(0, visualViewport?.offsetLeft || 0);
    const bottom = Math.max(0, layoutHeight - (top + height));

    root.style.setProperty('--visible-viewport-width', `${Math.round(width)}px`);
    root.style.setProperty('--visible-viewport-height', `${Math.round(height)}px`);
    root.style.setProperty('--visible-viewport-top', `${Math.round(top)}px`);
    root.style.setProperty('--visible-viewport-left', `${Math.round(left)}px`);
    root.style.setProperty('--visible-viewport-bottom', `${Math.round(bottom)}px`);
}

let visibleViewportFrame = 0;
function scheduleVisibleViewportSync() {
    if (visibleViewportFrame) return;
    visibleViewportFrame = requestAnimationFrame(() => {
        visibleViewportFrame = 0;
        syncVisibleViewport();
    });
}
scheduleVisibleViewportSync();

// ─── Statisches Menü finden ───
const menu = document.querySelector('#meta-nav .menu');
const fileList = document.getElementById('file-list');
const menuToggle = document.getElementById('menu-toggle');
const menuButton = menu?.querySelector('.menu-button');
const backButton = document.querySelector('#meta-nav .back-button');

// ─── Sticky-Hover-Fix für Touch/Stylus ───
function fixStickyHover(el) {
    el.addEventListener('pointerleave', () => {
        el.style.pointerEvents = 'none';
        requestAnimationFrame(() => { el.style.pointerEvents = ''; });
    });
}
if (menuButton) fixStickyHover(menuButton);
if (backButton) fixStickyHover(backButton);

// ─── Suchfunktion ───
// Während der Suche zeigt #file-list eine flache, nach Treffergüte sortierte Trefferliste
// (li.search-hit, Ordner als Pfadzeile); der Ordnerbaum bleibt darunter unverändert und
// kommt beim Leeren zurück. Gesucht wird in Linktext, Dateiname und Ordnerpfad.
function initMenuSearch(menu, fileList) {
    const menuSearch = menu.querySelector('.menu-search');
    if (!menuSearch) return null;

    const searchInput = menuSearch.querySelector('input');
    if (!searchInput) return null;

    const stopOverlay = menuSearch.querySelector('.menu-search-stop');
    if (stopOverlay) stopOverlay.remove();
    searchInput.disabled = false;
    searchInput.placeholder = 'type what you want…';
    searchInput.setAttribute('aria-label', 'Menü durchsuchen');
    // Handy-Autokorrektur macht aus "Foldingpi" gern "Folding pi" oder "Folding Pi"
    searchInput.autocomplete = 'off';
    searchInput.spellcheck = false;
    searchInput.setAttribute('autocorrect', 'off');
    searchInput.setAttribute('autocapitalize', 'off');
    // Passwortmanager (1Password, LastPass, Bitwarden, Dashlane) bieten sonst Autofill an,
    // autocomplete="off" allein ignorieren sie. Wie die Eingabefelder in controls.js.
    ['data-1p-ignore', 'data-bwignore'].forEach(a => searchInput.setAttribute(a, ''));
    searchInput.setAttribute('data-lpignore', 'true');
    searchInput.setAttribute('data-form-type', 'other');

    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.classList.add('menu-search-clear');
    clearButton.setAttribute('aria-label', 'Suche zurücksetzen');
    clearButton.textContent = '×';
    menuSearch.appendChild(clearButton);

    // Verdichtet Text zu [a-z0-9≡]: ohne Groß/Klein, Akzente, Trenner. π→pi, ∞→inf.
    // expand: ä/ö/ü/ß als ae/oe/ue/ss (sonst ä→a). Liefert auch Wortanfänge (b) und für jedes
    // verdichtete Zeichen den Index im Original (map), für die Hervorhebung.
    const UML = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss', 'π': 'pi', '∞': 'inf' };
    function compact(raw, expand) {
        let c = '', b = [], map = [], end = [], prevAlnum = false, prevLower = false;
        let i = 0;
        for (const ch of raw) {
            const lower = ch.toLocaleLowerCase('de');
            let piece = (expand || lower === 'π' || lower === '∞') ? UML[lower] : (lower === 'ß' ? 'ss' : null);
            if (!piece) piece = lower.normalize('NFD').replace(/[̀-ͯ]/g, '');
            piece = piece.replace(/[^a-z0-9≡]/g, '');
            if (piece) {
                const isUpper = ch !== lower;
                if (!prevAlnum || (isUpper && prevLower)) b.push(c.length);
                for (let k = 0; k < piece.length; k++) { map.push(i); end.push(i + ch.length); }
                c += piece;
            }
            prevAlnum = !!piece;
            prevLower = !!piece && ch === lower && ch !== ch.toLocaleUpperCase('de');
            i += ch.length;
        }
        return { c, b, map, end };
    }

    // Gleichwertige Begriffe: ein ganzer Suchbegriff gilt auch als jeder andere der Gruppe.
    const ALIASES = [
        ['inf', 'infinity', 'infinite', 'unendlich', 'unendlichkeit'],
        ['0', 'null', 'zero'],
        ['1', 'eins', 'one'],
        ['≡', 'equiv', 'identisch']
    ];

    // Für Tippfehler-Suche: k/c, s/z und 0/o gelten als gleich (koordinaten ~ co0rdinates)
    const phon = s => s.replace(/c/g, 'k').replace(/z/g, 's').replace(/0/g, 'o');

    // Kleinste Editierdistanz von t zu irgendeinem Teilstück von s (Sellers)
    function fuzzyDist(t, s) {
        const m = t.length;
        let prev = new Uint8Array(m + 1), cur = new Uint8Array(m + 1);
        for (let i = 0; i <= m; i++) prev[i] = i;
        let best = m;
        for (let j = 0; j < s.length; j++) {
            cur[0] = 0;
            for (let i = 1; i <= m; i++) {
                cur[i] = Math.min(prev[i] + 1, cur[i - 1] + 1, prev[i - 1] + (t[i - 1] === s[j] ? 0 : 1));
            }
            if (cur[m] < best) best = cur[m];
            [prev, cur] = [cur, prev];
        }
        return best;
    }

    // Index: einmalig aus dem Menü-DOM. Felder je Eintrag: Linktext, Dateiname, Ordnerpfad.
    let entries = null;
    function buildIndex() {
        entries = [];
        fileList.querySelectorAll('a[href]').forEach(a => {
            const href = a.getAttribute('href');
            let path;
            try { path = decodeURIComponent(href); } catch (e) { path = href; }
            const parts = path.split('/').filter(Boolean);
            const name = parts.pop() || '';
            const label = a.textContent || name;
            const dir = parts.join('/');
            const fields = [];
            [[label, 0], [name, 0], [dir, 6]].forEach(([raw, pen]) => {
                if (!raw) return;
                const vs = [compact(raw, true)];
                const flat = compact(raw, false);
                if (flat.c !== vs[0].c) vs.push(flat);
                vs.forEach(v => { v.pen = pen; v.fuz = phon(v.c); fields.push(v); });
            });
            entries.push({ href, label, dir, fields, len: fields[0] ? fields[0].c.length : 0 });
        });
    }

    function termAlts(raw) {
        const t = compact(raw, true).c;
        const alts = [t];
        const flat = compact(raw, false).c;
        if (flat !== t) alts.push(flat);
        const group = ALIASES.find(g => g.includes(t));
        if (group) group.forEach(g => { if (g !== t) alts.push(g); });
        return alts;
    }

    // Güte eines Begriffs in einem Eintrag: kleiner ist besser, null = kein Treffer.
    // Wortanfang 0, innerhalb 10, Tippfehler 20; +feld-Strafe (Pfad), +2 je Alias, +5 ohne Pfad-Wortanfang.
    // Der Ordnerpfad zaehlt nur am Wortanfang (kein Teilstueck/Tippfehler im Pfad).
    // Liefert [Güte, nurPfad]: nurPfad = der beste Treffer kam aus dem Ordnerpfad.
    function termScore(alts, entry, fuzzy) {
        let best = null, viaPath = false;
        for (let a = 0; a < alts.length; a++) {
            const t = alts[a], ap = a ? 3 : 0;
            if (!t) continue;
            for (const f of entry.fields) {
                const isPath = f.pen > 0;
                let s = null;
                if (f.c.startsWith(t)) s = f.c === t ? -3 : 0;
                else if (f.b.some(p => f.c.startsWith(t, p))) s = 1;
                else if (!isPath && f.c.includes(t)) s = 10;
                else if (!isPath && fuzzy && t.length >= 5) {
                    const max = t.length >= 8 ? 2 : 1;
                    if (f.fuz.length >= t.length - max && fuzzyDist(phon(t), f.fuz) <= max) s = 20;
                }
                if (s !== null && (best === null || s + f.pen + ap < best)) { best = s + f.pen + ap; viaPath = isPath; }
            }
        }
        return best === null ? null : [best, viaPath];
    }

    // Treffer, die nur ueber den Ordnerpfad zustande kommen, stehen hinter allen Namenstreffern
    // und sind auf PATH_ONLY_CAP begrenzt ("unfoldingpi" flutet nicht mit dem ganzen Ordner).
    const PATH_ONLY_CAP = 5;

    function search(query) {
        if (!entries) buildIndex();
        const altsList = query.split(/\s+/).filter(t => compact(t, true).c).map(termAlts);
        if (!altsList.length) return { hits: [], altsList };
        function run(fuzzy) {
            const hits = [];
            for (const e of entries) {
                let score = 0, ok = true, pathOnly = true;
                for (const alts of altsList) {
                    const r = termScore(alts, e, fuzzy);
                    if (r === null) { ok = false; break; }
                    score += r[0];
                    if (!r[1]) pathOnly = false;
                }
                if (ok) hits.push({ e, pathOnly, score: score + (pathOnly ? 100 : 0) + e.len / 1000 });
            }
            hits.sort((x, y) => x.score - y.score);
            let n = 0;
            return hits.filter(h => !h.pathOnly || ++n <= PATH_ONLY_CAP);
        }
        let hits = run(false);
        if (hits.length < 5) hits = run(true);
        return { hits: hits.slice(0, 200).map(h => h.e), altsList };
    }

    // Linktext mit <mark> um die gefundenen Stellen (nur Treffer im Linktext selbst)
    function renderLabel(a, entry, altsList) {
        const variants = [compact(entry.label, true), compact(entry.label, false)];
        const marks = [];
        for (const alts of altsList) {
            let found = null;
            for (const v of variants) {
                for (const t of alts) {
                    const at = v.c.indexOf(t);
                    if (at >= 0) { found = [v.map[at], v.end[at + t.length - 1]]; break; }
                }
                if (found) break;
            }
            if (found) marks.push(found);
        }
        marks.sort((x, y) => x[0] - y[0]);
        let pos = 0;
        for (const [from, to] of marks) {
            if (from < pos) continue;
            a.append(entry.label.slice(pos, from));
            const m = document.createElement('mark');
            m.textContent = entry.label.slice(from, to);
            a.append(m);
            pos = to;
        }
        a.append(entry.label.slice(pos));
    }

    // ─── Volltext ───
    // includes/search-index.json (vom Generator, { "/pfad": "sichtbarer Text" }) wird erst beim
    // ersten Tastendruck geladen. Treffer = alle Begriffe kommen als Teilstring vor (gleiche
    // Verdichtung und Aliasse wie die Namenssuche, aber ohne Tippfehler-Toleranz). Ladefehler
    // melden sich sichtbar in der Trefferliste und per console.error; die Namenssuche laeuft weiter.
    const CONTENT_CAP = 30;
    const CONTENT_MIN_TERM = 2;
    const contentState = { state: 'idle', docs: [] };
    let contentLoad = null;

    function loadContent() {
        if (contentLoad) return contentLoad;
        contentState.state = 'loading';
        contentLoad = fetch('/includes/search-index.json', { cache: 'no-cache' })
            .then(r => {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(data => {
                if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('unerwartetes Format');
                if (!entries) buildIndex();
                const known = new Set(entries.map(e => e.href));
                const docs = [];
                for (const [href, text] of Object.entries(data)) {
                    if (typeof text !== 'string') throw new Error('unerwartetes Format');
                    if (!known.has(href)) continue;
                    const full = compact(text, true);
                    // Variante ohne ae/oe/ue/ss nur, wo sie sich unterscheiden kann
                    const vs = /[äöüßÄÖÜẞ]/.test(text) ? [full, compact(text, false)] : [full];
                    docs.push({ href, text, vs });
                }
                contentState.docs = docs;
                contentState.state = 'ready';
            })
            .catch(err => {
                contentState.state = 'error';
                console.error('Volltext-Index nicht verfügbar:', err);
            });
        return contentLoad;
    }

    // Treffer eines Dokuments oder null. Alle Begriffe muessen in derselben Variante vorkommen.
    function contentMatch(doc, altsList) {
        for (const v of doc.vs) {
            let first = null, count = 0, ok = true;
            for (const alts of altsList) {
                let best = -1, bestLen = 0, termCount = 0;
                for (const t of alts) {
                    if (!t) continue;
                    let at = v.c.indexOf(t);
                    if (at < 0) continue;
                    if (best < 0 || at < best) { best = at; bestLen = t.length; }
                    for (let n = 0; at >= 0 && n < 50; n++) { termCount++; at = v.c.indexOf(t, at + t.length); }
                }
                if (best < 0) { ok = false; break; }
                count += termCount;
                if (!first || best < first.at) first = { at: best, len: bestLen };
            }
            if (ok) return { v, first, density: count * 1000 / (v.c.length || 1) };
        }
        return null;
    }

    // Einzeiliger Ausschnitt um den ersten Treffer, alle Begriffe im Ausschnitt hervorgehoben
    function renderSnippet(el, doc, m, altsList) {
        const { v, first } = m;
        const cLo = Math.max(0, first.at - 24);
        const cHi = Math.min(v.c.length, first.at + first.len + 70);
        const hitFrom = v.map[first.at], hitTo = v.end[first.at + first.len - 1];
        let from = v.map[cLo], to = v.end[cHi - 1];
        const text = doc.text;
        if (from > 0) {
            const sp = text.indexOf(' ', from);
            if (sp >= 0 && sp < from + 12 && sp + 1 <= hitFrom) from = sp + 1;
        }
        if (to < text.length) {
            const sp = text.lastIndexOf(' ', to);
            if (sp > to - 12 && sp >= hitTo) to = sp;
        }
        const marks = [];
        for (const alts of altsList) {
            for (const t of alts) {
                if (!t) continue;
                let i = v.c.indexOf(t, cLo);
                while (i >= 0 && i < cHi) {
                    const a = v.map[i], b = v.end[i + t.length - 1];
                    if (a >= from && b <= to) marks.push([a, b]);
                    i = v.c.indexOf(t, i + t.length);
                }
            }
        }
        marks.sort((x, y) => x[0] - y[0] || y[1] - x[1]);
        if (from > 0) el.append('…');
        let pos = from;
        for (const [a, b] of marks) {
            if (a < pos) continue;
            el.append(text.slice(pos, a));
            const mk = document.createElement('mark');
            mk.textContent = text.slice(a, b);
            el.append(mk);
            pos = b;
        }
        el.append(text.slice(pos, to));
        if (to < text.length) el.append('…');
    }

    function contentHits(altsList, skip) {
        if (contentState.state !== 'ready') return [];
        if (!altsList.some(alts => alts[0].length >= CONTENT_MIN_TERM)) return [];
        const out = [];
        for (const doc of contentState.docs) {
            if (skip.has(doc.href)) continue;
            const m = contentMatch(doc, altsList);
            if (m) out.push({ doc, m });
        }
        out.sort((x, y) => y.m.density - x.m.density || x.doc.text.length - y.doc.text.length);
        return out;
    }

    function noteRow(text, extra) {
        const li = document.createElement('li');
        li.className = 'search-hit menu-search-note' + (extra ? ' ' + extra : '');
        li.textContent = text;
        return li;
    }

    function clearHits() {
        fileList.querySelectorAll(':scope > li.search-hit').forEach(li => li.remove());
    }

    let selected = -1;
    function select(i) {
        const items = fileList.querySelectorAll(':scope > li.search-hit:not(.menu-search-empty):not(.menu-search-note)');
        if (!items.length) { selected = -1; return; }
        selected = (i + items.length) % items.length;
        items.forEach((li, k) => li.classList.toggle('selected', k === selected));
        items[selected].scrollIntoView({ block: 'nearest' });
    }

    function filter(queryRaw) {
        const query = queryRaw.trim();
        selected = -1;
        if (query && contentState.state === 'idle') {
            loadContent().then(() => {
                if (searchInput.value.trim() === query) render(query, true);
            });
        }
        render(query, false);
    }

    function render(query, keepSel) {
        const prev = selected;
        clearHits();
        selected = -1;
        fileList.classList.toggle('searching', !!query);
        if (!query) {
            fileList.querySelectorAll('details').forEach(details => { details.open = false; });
            return;
        }
        const { hits, altsList } = search(query);
        const frag = document.createDocumentFragment();
        hits.forEach(entry => {
            const li = document.createElement('li');
            li.className = 'search-hit';
            const a = document.createElement('a');
            a.href = entry.href;
            renderLabel(a, entry, altsList);
            li.append(a);
            if (entry.dir) {
                const dir = document.createElement('span');
                dir.className = 'menu-search-path';
                dir.textContent = entry.dir;
                li.append(dir);
            }
            frag.append(li);
        });
        const inContent = contentHits(altsList, new Set(hits.map(h => h.href)));
        if (inContent.length) {
            frag.append(noteRow('im Inhalt', 'menu-search-section'));
            const byHref = new Map(entries.map(e => [e.href, e]));
            inContent.slice(0, CONTENT_CAP).forEach(({ doc, m }) => {
                const entry = byHref.get(doc.href);
                const li = document.createElement('li');
                li.className = 'search-hit search-content';
                const a = document.createElement('a');
                a.href = doc.href;
                a.title = entry.dir ? entry.dir + '/' + entry.label : entry.label;
                a.textContent = entry.label;
                li.append(a);
                const snip = document.createElement('span');
                snip.className = 'menu-search-snippet';
                renderSnippet(snip, doc, m, altsList);
                li.append(snip);
                frag.append(li);
            });
            if (inContent.length > CONTENT_CAP) frag.append(noteRow('+' + (inContent.length - CONTENT_CAP) + ' weitere'));
        }
        if (contentState.state === 'error') frag.append(noteRow('Volltext nicht verfügbar', 'menu-search-error'));
        const settled = contentState.state === 'ready' || contentState.state === 'error';
        if (!hits.length && !inContent.length && settled) {
            const li = document.createElement('li');
            li.className = 'search-hit menu-search-empty';
            li.textContent = 'nichts gefunden';
            frag.prepend(li);
        }
        fileList.append(frag);
        if (!keepSel) fileList.scrollTop = 0;
        select(keepSel && prev > 0 ? prev : 0);
    }

    let searchTimeoutId = null;

    searchInput.addEventListener('input', () => {
        const value = searchInput.value;
        clearButton.classList.toggle('visible', value.length > 0);
        clearTimeout(searchTimeoutId);
        searchTimeoutId = setTimeout(() => { searchTimeoutId = null; filter(value); }, 80);
    });

    function clearSearch() {
        clearTimeout(searchTimeoutId);
        searchTimeoutId = null;
        searchInput.value = '';
        clearButton.classList.remove('visible');
        filter('');
    }

    clearButton.addEventListener('click', () => {
        clearSearch();
        searchInput.focus();
    });

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            clearSearch();
            searchInput.blur();
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (searchTimeoutId) { clearTimeout(searchTimeoutId); filter(searchInput.value); searchTimeoutId = null; }
            select(selected + (e.key === 'ArrowDown' ? 1 : -1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (searchTimeoutId) { clearTimeout(searchTimeoutId); searchTimeoutId = null; filter(searchInput.value); }
            const link = fileList.querySelector(':scope > li.search-hit.selected a');
            if (link) location.href = link.href;
        }
    });

    return {
        reset: clearSearch,
        focus() {
            searchInput.focus();
            searchInput.select();
        }
    };
}

// ─── Menü-Toggle: JS übernimmt vom Checkbox-Hack ───
if (menu && menuButton && menuToggle) {
    const isDesktopDevice = window.matchMedia &&
        window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    const search = initMenuSearch(menu, fileList);

    // Zurück-Taste schließt das Menü: offen = ein History-Eintrag {menu:true}.
    // Jedes Schließen ohne Zurück-Taste nimmt den Eintrag per history.back() wieder weg,
    // damit weder verwaiste Einträge noch Doppel-Zurück entstehen.
    let pendingBack = false;

    function showMenu(open) {
        menuToggle.checked = open;
        menu.classList.toggle('open', open);
        document.body.classList.toggle('menu-open', open);
        if (!open && search) search.reset();
    }

    function openMenu() {
        if (pendingBack || menu.classList.contains('open')) return;
        showMenu(true);
        history.pushState({ menu: true }, '');
    }

    function closeMenu() {
        if (!menu.classList.contains('open')) return;
        showMenu(false);
        if (history.state && history.state.menu) {
            pendingBack = true;
            // Fallback, falls kein popstate kommt (z. B. Eintrag schon weg)
            setTimeout(() => { pendingBack = false; }, 400);
            history.back();
        }
    }

    window.addEventListener('popstate', () => {
        pendingBack = false;
        showMenu(!!(history.state && history.state.menu));
    });

    // Seite kommt mit Menü-Eintrag zurück (Zurück von der Folgeseite, Reload): Zustand angleichen
    if (history.state && history.state.menu) showMenu(true);

    function toggleMenu(focusSearch) {
        if (menu.classList.contains('open')) {
            closeMenu();
        } else {
            openMenu();
            if (focusSearch && search) search.focus();
        }
    }

    // touchend + preventDefault unterdrückt den synthetisierten Click (kein Doppel-Toggle)
    menuButton.addEventListener('click', (e) => {
        e.preventDefault();
        toggleMenu(isDesktopDevice);
    });

    menuButton.addEventListener('touchend', (e) => {
        e.preventDefault();
        toggleMenu(false);
    });

    function closeMenuIfOutside(e) {
        if (!menu.classList.contains('open')) return;
        if (!menu.contains(e.target)) closeMenu();
    }
    document.addEventListener('click', closeMenuIfOutside);
    document.addEventListener('touchend', closeMenuIfOutside);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeMenu();
    });

    window.addEventListener('wheel', (event) => {
        if (event.ctrlKey || event.metaKey) return;
        if (!menu.classList.contains('open')) return;
        const hoveredElement = document.elementFromPoint(event.clientX, event.clientY);
        const inMenu = hoveredElement && hoveredElement.closest('.menu-content-wrapper');
        if (!inMenu) return;
        event.preventDefault();
        fileList.scrollTop += event.deltaY;
    }, { passive: false });
}

// ─── Pre-Block-Fitting ───
function getLongestPreLine(text) {
    return text.replace(/\r/g, '').split('\n')
        .reduce((longest, current) => current.length > longest.length ? current : longest, '');
}

const preMeasureElement = document.createElement('span');
preMeasureElement.setAttribute('aria-hidden', 'true');
preMeasureElement.style.cssText = 'position:absolute;left:-99999px;top:0;visibility:hidden;pointer-events:none;white-space:pre;display:inline-block';
document.body.appendChild(preMeasureElement);

let preFitAnimationFrameId = null;

function fitPreBlocksToTextWidth() {
    document.querySelectorAll('pre').forEach(pre => {
        pre.style.fontSize = '';
        const computedStyle = window.getComputedStyle(pre);
        const longestLine = getLongestPreLine(pre.textContent || '');
        const availableWidth = pre.clientWidth;
        const baseFontSizePx = parseFloat(computedStyle.fontSize);
        if (!longestLine || !availableWidth || !Number.isFinite(baseFontSizePx) || baseFontSizePx <= 0) return;

        preMeasureElement.style.fontFamily = computedStyle.fontFamily;
        preMeasureElement.style.fontSize = computedStyle.fontSize;
        preMeasureElement.style.fontStyle = computedStyle.fontStyle;
        preMeasureElement.style.fontVariant = computedStyle.fontVariant;
        preMeasureElement.style.fontWeight = computedStyle.fontWeight;
        preMeasureElement.style.letterSpacing = computedStyle.letterSpacing;
        preMeasureElement.style.textTransform = computedStyle.textTransform;
        preMeasureElement.textContent = longestLine;

        const measuredLineWidth = preMeasureElement.getBoundingClientRect().width;
        if (!Number.isFinite(measuredLineWidth) || measuredLineWidth <= 0) return;

        const fittedFontSizePx = baseFontSizePx * (availableWidth / measuredLineWidth);
        if (fittedFontSizePx < baseFontSizePx) {
            pre.style.fontSize = `${fittedFontSizePx}px`;
        }
    });
}

function scheduleFitPreBlocks() {
    if (preFitAnimationFrameId !== null) cancelAnimationFrame(preFitAnimationFrameId);
    preFitAnimationFrameId = requestAnimationFrame(() => {
        preFitAnimationFrameId = null;
        fitPreBlocksToTextWidth();
    });
}

scheduleFitPreBlocks();

// ─── Event Listener ───
window.addEventListener('load', scheduleFitPreBlocks);
window.addEventListener('resize', scheduleFitPreBlocks);
window.addEventListener('orientationchange', scheduleFitPreBlocks);
window.addEventListener('load', scheduleVisibleViewportSync);
window.addEventListener('resize', scheduleVisibleViewportSync);
window.addEventListener('orientationchange', scheduleVisibleViewportSync);

if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', scheduleVisibleViewportSync);
    window.visualViewport.addEventListener('scroll', scheduleVisibleViewportSync);
}

if (document.fonts && typeof document.fonts.ready?.then === 'function') {
    document.fonts.ready.then(scheduleFitPreBlocks);
}

}); // Ende DOMContentLoaded
