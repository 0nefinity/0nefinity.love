// meta.js — Suche, Menü-Komfort, Viewport-Sync, Pre-Fitting. Menü, Back-Button, Fonts kommen aus den SSI-Includes; Dialog, Live-Reload, Math-Notation liegen in tools/.

// DOM-Manipulation erst wenn Body existiert
document.addEventListener('DOMContentLoaded', () => {

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

    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.classList.add('menu-search-clear');
    clearButton.setAttribute('aria-label', 'Suche zurücksetzen');
    clearButton.textContent = '×';
    menuSearch.appendChild(clearButton);

    function normalizeForSearch(str) {
        return str
            .toLocaleLowerCase('de')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
    }

    function filterList(ul, query) {
        let hasVisibleChild = false;
        Array.from(ul.children).forEach(li => {
            const isHeading = li.querySelector(':scope > .menu-heading');
            const isSeparator = li.classList.contains('menu-separator');
            if (isHeading || isSeparator) {
                li.style.display = 'none';
                return;
            }
            const details = li.querySelector(':scope > details');
            if (details) {
                const nestedList = details.querySelector(':scope > ul.folder-contents');
                const childHasMatch = nestedList ? filterList(nestedList, query) : false;
                li.style.display = childHasMatch ? '' : 'none';
                details.open = !!(childHasMatch && query);
                if (childHasMatch) hasVisibleChild = true;
            } else {
                const link = li.querySelector('a');
                const text = link
                    ? normalizeForSearch(link.textContent || '')
                    : normalizeForSearch(li.textContent || '');
                const match = text.includes(query);
                li.style.display = match ? '' : 'none';
                if (match) hasVisibleChild = true;
            }
        });
        return hasVisibleChild;
    }

    function filter(queryRaw) {
        const query = normalizeForSearch(queryRaw.trim());
        if (!query) {
            fileList.querySelectorAll('li').forEach(li => { li.style.display = ''; });
            fileList.querySelectorAll('details').forEach(details => { details.open = false; });
            return;
        }
        filterList(fileList, query);
    }

    // Eingabehilfe (π/∞-Vorschläge, pi(n)) lädt nur dort, wo sie gebraucht wird: Seiten ohne
    // Eingabefelder laden math-notation.js nicht, die Menüsuche holt sie beim ersten Fokus nach.
    const MATH_SRC = '/tools/math-notation.js';
    function ensureMathNotation() {
        if (document.querySelector(`script[src="${MATH_SRC}"]`)) return;
        const script = document.createElement('script');
        script.src = MATH_SRC;
        script.onload = () => {
            if (searchInput.value) searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        };
        script.onerror = () => console.error(`[meta] ${MATH_SRC} konnte nicht geladen werden: Eingabehilfe der Menüsuche fehlt`);
        document.head.appendChild(script);
    }
    searchInput.addEventListener('focus', ensureMathNotation, { once: true });
    searchInput.addEventListener('input', ensureMathNotation, { once: true });

    let searchTimeoutId = null;

    searchInput.addEventListener('input', () => {
        const value = searchInput.value;
        clearButton.classList.toggle('visible', value.length > 0);
        clearTimeout(searchTimeoutId);
        searchTimeoutId = setTimeout(() => filter(value), 100);
    });

    function clearSearch() {
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
