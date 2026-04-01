// meta-static.js — wie meta.js, aber Menü + Back-Button kommen aus SSI-Include.
// JS liefert nur: Suche, Toggle-Enhancement, Viewport-Sync, Fonts, Tools, Dialog.

// Fonts laden
(function ensureProjectFontsStylesheet() {
    const href = '/fonts-auswahl.css';
    const existing = document.querySelector(`link[data-meta-fonts-auswahl="${href}"], link[href="${href}"]`);
    if (existing) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.setAttribute('data-meta-fonts-auswahl', href);
    (document.head || document.documentElement).appendChild(link);
})();

(function ensureMetaFontsStylesheet() {
    const href = '/tools/tools/fonts/!!DANGER!!-un0nefinity-fonts-!!DANGER!!/un0nefinity-fonts.css';
    const existing = document.querySelector(`link[data-meta-un0nefinity-fonts="${href}"], link[href="${href}"]`);
    if (existing) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.setAttribute('data-meta-un0nefinity-fonts', href);
    (document.head || document.documentElement).appendChild(link);
})();

// Tools synchron laden
document.write('<script src="/tools/zoom.js"><\/script>');
document.write('<script src="/tools/tools/decimal.js"><\/script>');
document.write('<script src="/tools/controls.js"><\/script>');

// _018Space
(function (global) {
    function getCanvasRealm(element, options = {}) {
        const virtualSize = Math.max(1e-9, options.virtualSize || 1);
        const rect = element && typeof element.getBoundingClientRect === 'function'
            ? element.getBoundingClientRect()
            : null;
        const width = Math.max(1, (rect && rect.width) || (element && element.clientWidth) || global.innerWidth || 1);
        const height = Math.max(1, (rect && rect.height) || (element && element.clientHeight) || global.innerHeight || 1);
        const side = Math.max(1, Math.min(width, height));
        const offsetX = (width - side) / 2;
        const offsetY = (height - side) / 2;
        const unit = side / virtualSize;

        return {
            width, height, side, offsetX, offsetY, unit,
            toSquareX: value => offsetX + value * side,
            toSquareY: value => offsetY + value * side,
            toSquarePoint: (x, y) => ({ x: offsetX + x * side, y: offsetY + y * side }),
            toVirtualLength: value => value * unit,
            toVirtualFontSize: value => value * unit,
        };
    }
    global._018Space = Object.freeze({ getCanvasRealm });
})(typeof window !== 'undefined' ? window : this);

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

// ─── Back-Button: auxclick für Mittelklick ───
if (backButton) {
    backButton.addEventListener('auxclick', (event) => {
        if (event.button === 1) {
            window.open('/index.html', '_blank');
            event.preventDefault();
        }
    });
}

// ─── Menü-Toggle: JS übernimmt vom Checkbox-Hack ───
if (menu && menuButton && menuToggle) {
    let touchHandled = false;
    const isDesktopDevice = window.matchMedia &&
        window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    // Suchfeld injizieren
    const menuSearch = menu.querySelector('.menu-search');
    let searchInput = null;
    let clearButton = null;

    if (menuSearch) {
        searchInput = document.createElement('input');
        searchInput.type = 'search';
        searchInput.placeholder = 'type what you want…';
        searchInput.setAttribute('aria-label', 'Menü durchsuchen');

        clearButton = document.createElement('button');
        clearButton.type = 'button';
        clearButton.classList.add('menu-search-clear');
        clearButton.setAttribute('aria-label', 'Suche zurücksetzen');
        clearButton.textContent = '×';

        menuSearch.appendChild(searchInput);
        menuSearch.appendChild(clearButton);
    }

    function openMenu() {
        menuToggle.checked = true;
        menu.classList.add('open');
        document.body.classList.add('menu-open');
    }

    function closeMenu() {
        menuToggle.checked = false;
        menu.classList.remove('open');
        document.body.classList.remove('menu-open');
        if (searchInput) {
            searchInput.value = '';
            filterMenu('');
        }
        if (clearButton) {
            clearButton.classList.remove('visible');
        }
    }

    // Label-Klick abfangen → JS-Toggle statt Checkbox
    menuButton.addEventListener('click', (e) => {
        if (touchHandled) return;
        e.preventDefault();
        if (menu.classList.contains('open')) {
            closeMenu();
        } else {
            openMenu();
            if (isDesktopDevice && searchInput) {
                searchInput.focus();
                searchInput.select();
            }
        }
    });

    menuButton.addEventListener('touchend', (e) => {
        e.preventDefault();
        touchHandled = true;
        if (menu.classList.contains('open')) {
            closeMenu();
        } else {
            openMenu();
        }
        touchHandled = false;
    });

    // Klick außerhalb → Menü schließen
    function closeMenuIfOutside(e) {
        if (!menu.classList.contains('open')) return;
        if (!menu.contains(e.target)) {
            closeMenu();
        }
    }
    document.addEventListener('click', closeMenuIfOutside);
    document.addEventListener('touchend', closeMenuIfOutside);

    // ─── Suchfunktion ───
    function normalizeForSearch(str) {
        return str
            .toLocaleLowerCase('de')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
    }

    function filterMenu(queryRaw) {
        const query = normalizeForSearch(queryRaw.trim());

        if (!query) {
            fileList.querySelectorAll('li').forEach(li => {
                li.style.display = '';
            });
            fileList.querySelectorAll('details').forEach(details => {
                details.open = false;
            });
            return;
        }

        fileList.querySelectorAll('li').forEach(li => {
            li.style.display = '';
        });

        fileList.querySelectorAll(':scope > li').forEach(li => {
            const heading = li.querySelector(':scope > .menu-heading');
            const isSeparator = li.classList.contains('menu-separator');
            if (heading || isSeparator) {
                li.style.display = 'none';
            }
        });

        function filterList(ul) {
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
                    const childHasMatch = nestedList ? filterList(nestedList) : false;
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

        filterList(fileList);
    }

    // Suche mit Debounce
    if (searchInput && clearButton) {
        let searchTimeoutId = null;

        searchInput.addEventListener('input', () => {
            const value = searchInput.value;
            clearButton.classList.toggle('visible', value.length > 0);
            clearTimeout(searchTimeoutId);
            searchTimeoutId = setTimeout(() => filterMenu(value), 100);
        });

        clearButton.addEventListener('click', () => {
            searchInput.value = '';
            clearButton.classList.remove('visible');
            filterMenu('');
            searchInput.focus();
        });

        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                searchInput.value = '';
                filterMenu('');
                clearButton.classList.remove('visible');
                searchInput.blur();
            }
        });
    }

    // Scroll im Menü
    window.addEventListener('wheel', (event) => {
        if (event.ctrlKey || event.metaKey) return;
        if (!menu.classList.contains('open')) return;
        const hoveredElement = document.elementFromPoint(event.clientX, event.clientY);
        const inMenu = hoveredElement && hoveredElement.closest('.menu');
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

// ─── Dialog ───
const dialogBackdrop = document.createElement('div');
dialogBackdrop.className = 'meta-dialog-backdrop';
dialogBackdrop.hidden = true;
dialogBackdrop.innerHTML = `
    <div class="meta-dialog" role="dialog" aria-modal="true" aria-labelledby="meta-dialog-title" aria-describedby="meta-dialog-message">
        <div class="meta-dialog-title" id="meta-dialog-title"></div>
        <div class="meta-dialog-message" id="meta-dialog-message"></div>
        <div class="meta-dialog-actions">
            <button type="button" class="meta-dialog-secondary" data-dialog-action="dismiss"></button>
            <button type="button" class="meta-dialog-secondary" data-dialog-action="cancel"></button>
            <button type="button" class="meta-dialog-confirm" data-dialog-action="confirm"></button>
        </div>
    </div>
`;
document.body.appendChild(dialogBackdrop);

const dialogTitleEl = dialogBackdrop.querySelector('#meta-dialog-title');
const dialogMessageEl = dialogBackdrop.querySelector('#meta-dialog-message');
const dialogConfirmBtn = dialogBackdrop.querySelector('[data-dialog-action="confirm"]');
const dialogCancelBtn = dialogBackdrop.querySelector('[data-dialog-action="cancel"]');
const dialogDismissBtn = dialogBackdrop.querySelector('[data-dialog-action="dismiss"]');
let dialogResolve = null;
let dialogLastFocused = null;

function closeMetaDialog(action = 'dismiss') {
    if (!dialogResolve) return;
    const resolve = dialogResolve;
    dialogResolve = null;
    dialogBackdrop.hidden = true;
    document.body.classList.remove('meta-dialog-open');
    document.removeEventListener('keydown', handleMetaDialogKeydown, true);
    if (dialogLastFocused && typeof dialogLastFocused.focus === 'function') {
        requestAnimationFrame(() => dialogLastFocused.focus());
    }
    dialogLastFocused = null;
    resolve(action);
}

function handleMetaDialogKeydown(event) {
    if (dialogBackdrop.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); closeMetaDialog('dismiss'); }
    else if (event.key === 'Enter') { event.preventDefault(); closeMetaDialog('confirm'); }
}

window._018Dialog = window._018Dialog || {};
window._018Dialog.confirm = function confirm(options = {}) {
    const {
        title = 'weiter?', message = '',
        confirmLabel = 'ok', cancelLabel = 'abbrechen', dismissLabel = 'zurück'
    } = options;
    if (dialogResolve) closeMetaDialog('dismiss');
    dialogTitleEl.textContent = title;
    dialogMessageEl.textContent = message;
    dialogConfirmBtn.textContent = confirmLabel;
    dialogCancelBtn.textContent = cancelLabel;
    dialogDismissBtn.textContent = dismissLabel;
    dialogDismissBtn.hidden = !dismissLabel;
    dialogLastFocused = document.activeElement;
    dialogBackdrop.hidden = false;
    document.body.classList.add('meta-dialog-open');
    document.addEventListener('keydown', handleMetaDialogKeydown, true);
    return new Promise(resolve => {
        dialogResolve = resolve;
        requestAnimationFrame(() => dialogConfirmBtn.focus());
    });
};

dialogBackdrop.addEventListener('click', (event) => {
    if (event.target === dialogBackdrop) closeMetaDialog('dismiss');
});
dialogConfirmBtn.addEventListener('click', () => closeMetaDialog('confirm'));
dialogCancelBtn.addEventListener('click', () => closeMetaDialog('cancel'));
dialogDismissBtn.addEventListener('click', () => closeMetaDialog('dismiss'));

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
