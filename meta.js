// meta.js — globales UI-Framework; Menü + Back-Button kommen aus SSI-Include.
// JS liefert nur: Suchfunktion, Toggle-Enhancement, Viewport-Sync, Pre-Fitting, Dialog-Logik.
// Fonts, Tools und Menü-/Dialog-HTML kommen aus den SSI-Includes.

// Dev-only Live-Reload: pollt /_devmtime.php alle 2s. Das Script liefert den
// neuesten mtime über ALLE web-Dateien im dev-Tree → egal welche Datei du
// änderst, der Browser reloaded. Nur aktiv auf dev.* Hostnames.
(function devLiveReload() {
  if (!window.location.hostname.startsWith('dev.')) return;
  let lastStamp = null;
  let initialized = false;
  async function check() {
    try {
      const res = await fetch('/_devmtime.php?_lr=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) return;
      const stamp = (await res.text()).trim();
      if (!stamp || stamp === '0') return;
      if (initialized && lastStamp !== null && stamp !== lastStamp) {
        console.log('[live-reload] dev file changed → reload');
        location.reload();
        return;
      }
      lastStamp = stamp;
    } catch (e) {}
    initialized = true;
  }
  setInterval(check, 2000);
  setTimeout(check, 100);
})();

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

// ─── Sticky-Hover-Fix für Touch/Stylus ───
function fixStickyHover(el) {
    el.addEventListener('pointerleave', () => {
        el.style.pointerEvents = 'none';
        requestAnimationFrame(() => { el.style.pointerEvents = ''; });
    });
}
fixStickyHover(menuButton);
if (backButton) fixStickyHover(backButton);

// ─── Suchfunktion ───
function initMenuSearch(menu, fileList) {
    const menuSearch = menu.querySelector('.menu-search');
    if (!menuSearch) return null;

    const searchInput = menuSearch.querySelector('input');
    if (!searchInput) return null;

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

        fileList.querySelectorAll('li').forEach(li => { li.style.display = ''; });

        fileList.querySelectorAll(':scope > li').forEach(li => {
            const heading = li.querySelector(':scope > .menu-heading');
            const isSeparator = li.classList.contains('menu-separator');
            if (heading || isSeparator) li.style.display = 'none';
        });

        filterList(fileList, query);
    }

    let searchTimeoutId = null;

    searchInput.addEventListener('input', () => {
        const value = searchInput.value;
        clearButton.classList.toggle('visible', value.length > 0);
        clearTimeout(searchTimeoutId);
        searchTimeoutId = setTimeout(() => filter(value), 100);
    });

    clearButton.addEventListener('click', () => {
        searchInput.value = '';
        clearButton.classList.remove('visible');
        filter('');
        searchInput.focus();
    });

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            searchInput.value = '';
            filter('');
            clearButton.classList.remove('visible');
            searchInput.blur();
        }
    });

    return {
        reset() {
            searchInput.value = '';
            clearButton.classList.remove('visible');
            filter('');
        },
        focus() {
            searchInput.focus();
            searchInput.select();
        }
    };
}

// ─── Menü-Toggle: JS übernimmt vom Checkbox-Hack ───
if (menu && menuButton && menuToggle) {
    let touchHandled = false;
    const isDesktopDevice = window.matchMedia &&
        window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    const search = initMenuSearch(menu, fileList);

    function openMenu() {
        menuToggle.checked = true;
        menu.classList.add('open');
        document.body.classList.add('menu-open');
    }

    function closeMenu() {
        menuToggle.checked = false;
        menu.classList.remove('open');
        document.body.classList.remove('menu-open');
        if (search) search.reset();
    }

    menuButton.addEventListener('click', (e) => {
        if (touchHandled) return;
        e.preventDefault();
        if (menu.classList.contains('open')) {
            closeMenu();
        } else {
            openMenu();
            if (isDesktopDevice && search) search.focus();
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

    function closeMenuIfOutside(e) {
        if (!menu.classList.contains('open')) return;
        if (!menu.contains(e.target)) closeMenu();
    }
    document.addEventListener('click', closeMenuIfOutside);
    document.addEventListener('touchend', closeMenuIfOutside);

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

// ─── Dialog (HTML kommt aus SSI-Include) ───
const dialogBackdrop = document.querySelector('.meta-dialog-backdrop');
const dialogTitleEl = document.getElementById('meta-dialog-title');
const dialogMessageEl = document.getElementById('meta-dialog-message');
const dialogConfirmBtn = document.querySelector('[data-dialog-action="confirm"]');
const dialogCancelBtn = document.querySelector('[data-dialog-action="cancel"]');
const dialogDismissBtn = document.querySelector('[data-dialog-action="dismiss"]');
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

// ─── Math-Notation Auto-Replace ───────────────────────────────────────────
// Modul 1: pi() / pi(n) — überall (statischer Text + Inputs)
// Modul 2: e() / e(n) — nur in Inputs/Textarea/contenteditable
// Modul 3: pi-Helper-Box (Vorschlag π wenn `pi` ohne Klammern getippt)
// Modul 4: fuzzy ∞-Detection (infinity/unendlich + Tippfehler)
//
// TODO: Phase 2 — n > 1000 Stellen unterstützen (BigInt-PI / Streaming).
// Tim's Regel "keine künstlichen Obergrenzen" → aktuell pragmatisch 1000 Stellen.
(function mathNotation() {
    const PI_DIGITS = '3.1415926535897932384626433832795028841971693993751058209749445923078164062862089986280348253421170679821480865132823066470938446095505822317253594081284811174502841027019385211055596446229489549303819644288109756659334461284756482337867831652712019091456485669234603486104543266482133936072602491412737245870066063155881748815209209628292540917153643678925903600113305305488204665213841469519415116094330572703657595919530921861173819326117931051185480744623799627495673518857527248912279381830119491298336733624406566430860213949463952247371907021798609437027705392171762931767523846748184676694051320005681271452635608277857713427577896091736371787214684409012249534301465495853710507922796892589235420199561121290219608640344181598136297747713099605187072113499999983729780499510597317328160963185950244594553469083026425223082533446850352619311881710100031378387528865875332083814206171776691473035982534904287554687311595628638823537875937519577818577805321712268066130019278766111959092164201989';
    const E_DIGITS  = '2.7182818284590452353602874713526624977572470936999595749669676277240766303535475945713821785251664274274663919320030599218174135966290435729003342952605956307381323286279434907632338298807531952510190115738341879307021540891499348841675092447614606680822648001684774118537423454424371075390777449920695517027618386062613313845830007520449338265602976067371132007093287091274437470472306969772093101416928368190255151086574637721112523897844250569536967707854499699679468644549059879316368892300987931277361782154249992295763514822082698951936680331825288693984964651058209392398294887933203625094431173012381970684161403970198376793206832823764648042953118023287825098194558153017567173613320698112509961818815930416903515988885193458072738667385894228792284998920868058257492796104841984443634632449684875602336248270419786232090021609902353043699418491463140934317381436405462531520961836908887070167683964243781405927145635490613031072085103837505101157477041718986106873969655212671546889570350354';
    const MAX_DIGITS = PI_DIGITS.length - 2; // 1000 Dezimalstellen (länge minus "3.")

    /**
     * Liefert "3" für n=0, "3.1" für n=1, "3.14159" für n=5 …
     * (Integer-Teil + Punkt + n Dezimalstellen).
     */
    function digitsString(source, n) {
        if (!Number.isFinite(n) || n < 0) n = 0;
        n = Math.floor(n);
        if (n > MAX_DIGITS) {
            console.warn(`[meta.js math-notation] n=${n} überschreitet ${MAX_DIGITS} Stellen — gekürzt.`);
            n = MAX_DIGITS;
        }
        if (n === 0) return source.charAt(0); // "3" oder "2"
        // source = "3.14159…" → "3." + n Stellen ab Index 2
        return source.slice(0, 2 + n);
    }

    const PI_CHAR = 'π';   // π
    const INF_CHAR = '∞';  // ∞

    // Regex für pi-Pattern. Optional negative Klammer-Inhalte werden ignoriert.
    // pi() oder pi(123) — n als Integer ≥ 0
    // Word-Boundary davor (oder Stringstart) verhindert false positives
    // wie "epir(5)" oder "code(5)" (e in "code") oder "API(5)" (pi in api).
    const RE_PI_CALL = /(^|[^A-Za-z0-9_])pi\(\s*(\d*)\s*\)/g;
    const RE_E_CALL  = /(^|[^A-Za-z0-9_])e\(\s*(\d*)\s*\)/g;

    /**
     * Ersetzt pi()/pi(n) in einem String. Liefert neuen String.
     */
    function replacePiCalls(text) {
        return text.replace(RE_PI_CALL, (_full, pre, nStr) => {
            const replacement = nStr === '' ? PI_CHAR : digitsString(PI_DIGITS, parseInt(nStr, 10));
            return pre + replacement;
        });
    }

    /**
     * Ersetzt e()/e(n) in einem String — nur Input-Kontext.
     */
    function replaceECalls(text) {
        return text.replace(RE_E_CALL, (_full, pre, nStr) => {
            const replacement = nStr === '' ? 'e' : digitsString(E_DIGITS, parseInt(nStr, 10));
            return pre + replacement;
        });
    }

    // ─── DOM-Walker für statischen Text ───
    const SKIP_TAGS = new Set([
        'PRE', 'CODE', 'SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'KBD', 'SAMP', 'VAR'
    ]);

    function isInsideSkipped(node) {
        let el = node.parentElement;
        while (el) {
            if (SKIP_TAGS.has(el.tagName)) return true;
            if (el.isContentEditable) return true;
            if (el.hasAttribute && el.hasAttribute('data-no-math-replace')) return true;
            el = el.parentElement;
        }
        return false;
    }

    function processStaticTextNode(node) {
        const text = node.nodeValue;
        if (!text || text.indexOf('pi(') === -1) return;
        if (isInsideSkipped(node)) return;
        const replaced = replacePiCalls(text);
        if (replaced !== text) {
            node.nodeValue = replaced;
        }
    }

    function walkStaticText(root) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                if (!node.nodeValue || node.nodeValue.indexOf('pi(') === -1) {
                    return NodeFilter.FILTER_SKIP;
                }
                if (isInsideSkipped(node)) return NodeFilter.FILTER_SKIP;
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        const batch = [];
        let n;
        while ((n = walker.nextNode())) batch.push(n);
        batch.forEach(processStaticTextNode);
    }

    walkStaticText(document.body);

    // Beobachte spätere DOM-Änderungen (debounced).
    let mutationTimer = 0;
    const pendingNodes = new Set();
    const mo = new MutationObserver(mutations => {
        for (const m of mutations) {
            if (m.type === 'characterData') {
                pendingNodes.add(m.target);
            } else if (m.type === 'childList') {
                m.addedNodes.forEach(node => {
                    if (node.nodeType === Node.TEXT_NODE) {
                        pendingNodes.add(node);
                    } else if (node.nodeType === Node.ELEMENT_NODE) {
                        pendingNodes.add(node);
                    }
                });
            }
        }
        if (mutationTimer) return;
        mutationTimer = setTimeout(() => {
            mutationTimer = 0;
            pendingNodes.forEach(node => {
                if (!node.isConnected) return;
                if (node.nodeType === Node.TEXT_NODE) {
                    processStaticTextNode(node);
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                    walkStaticText(node);
                }
            });
            pendingNodes.clear();
        }, 150);
    });
    mo.observe(document.body, { childList: true, characterData: true, subtree: true });

    // ─── Helper-Box (Singleton, wiederverwendet) ───
    const helperBox = document.createElement('div');
    helperBox.className = 'math-helper-box';
    helperBox.setAttribute('role', 'dialog');
    helperBox.setAttribute('aria-label', 'Mathematische Notation vorschlagen');
    helperBox.hidden = true;
    helperBox.innerHTML = `
        <span class="math-helper-text"></span>
        <button type="button" class="math-helper-accept" aria-label="Akzeptieren">✓</button>
        <button type="button" class="math-helper-reject" aria-label="Ablehnen">×</button>
    `;
    document.body.appendChild(helperBox);

    const helperTextEl = helperBox.querySelector('.math-helper-text');
    const helperAcceptBtn = helperBox.querySelector('.math-helper-accept');
    const helperRejectBtn = helperBox.querySelector('.math-helper-reject');

    /** @type {{el:Element, kind:'pi'|'inf', start:number, end:number, replacement:string} | null} */
    let helperState = null;

    // Cooldown: pro (Element, Wort-Position-Hash, Wort-Original) merken dass
    // User abgelehnt hat → nicht direkt nochmal anbieten.
    // Schlüssel: WeakMap<Element, Set<string>>
    const dismissCooldown = new WeakMap();

    function cooldownKey(start, original) {
        return `${start}:${original}`;
    }

    function isCooledDown(el, start, original) {
        const set = dismissCooldown.get(el);
        return set ? set.has(cooldownKey(start, original)) : false;
    }

    function markCooldown(el, start, original) {
        let set = dismissCooldown.get(el);
        if (!set) {
            set = new Set();
            dismissCooldown.set(el, set);
        }
        set.add(cooldownKey(start, original));
    }

    function hideHelperBox() {
        helperBox.hidden = true;
        helperState = null;
    }

    function showHelperBoxAt(rect, text) {
        helperTextEl.textContent = text;
        helperBox.hidden = false;
        // Positionierung: unter dem rect, am linken Rand
        const boxRect = helperBox.getBoundingClientRect();
        const margin = 4;
        let top = rect.bottom + margin + window.scrollY;
        let left = rect.left + window.scrollX;
        // Bei Out-of-Viewport rechts: an rechten Rand klemmen
        const maxLeft = window.scrollX + window.innerWidth - boxRect.width - margin;
        if (left > maxLeft) left = Math.max(margin + window.scrollX, maxLeft);
        if (left < window.scrollX + margin) left = window.scrollX + margin;
        helperBox.style.top = `${top}px`;
        helperBox.style.left = `${left}px`;
    }

    /**
     * Holt Caret-Rect für ein Element + Caret-Position.
     * Funktioniert für contenteditable via Range; für textarea via Mirror-Div;
     * für input fällt auf BoundingRect zurück.
     */
    function getCaretRect(el) {
        if (el.isContentEditable) {
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
                const range = sel.getRangeAt(0).cloneRange();
                range.collapse(true);
                const rects = range.getClientRects();
                if (rects.length > 0) return rects[0];
                // Empty range → use the element's rect
            }
            return el.getBoundingClientRect();
        }
        if (el.tagName === 'TEXTAREA') {
            return caretRectFromMirror(el);
        }
        // INPUT: vereinfacht — unter dem Input
        return el.getBoundingClientRect();
    }

    /**
     * Mirror-Div-Technik: dupliziert textarea-Styling in versteckten Div,
     * holt Caret-Position vom Mirror.
     */
    let mirrorDiv = null;
    function caretRectFromMirror(textarea) {
        if (!mirrorDiv) {
            mirrorDiv = document.createElement('div');
            mirrorDiv.setAttribute('aria-hidden', 'true');
            Object.assign(mirrorDiv.style, {
                position: 'absolute',
                top: '0',
                left: '-99999px',
                visibility: 'hidden',
                whiteSpace: 'pre-wrap',
                wordWrap: 'break-word'
            });
            document.body.appendChild(mirrorDiv);
        }
        const cs = window.getComputedStyle(textarea);
        const propsToCopy = [
            'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
            'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
            'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
            'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize',
            'fontSizeAdjust', 'lineHeight', 'fontFamily', 'textAlign', 'textTransform',
            'textIndent', 'textDecoration', 'letterSpacing', 'wordSpacing', 'tabSize'
        ];
        propsToCopy.forEach(p => { mirrorDiv.style[p] = cs[p]; });

        const value = textarea.value;
        const pos = textarea.selectionStart;
        const before = value.substring(0, pos);
        const after = value.substring(pos);
        mirrorDiv.textContent = before;
        const marker = document.createElement('span');
        marker.textContent = after || '.';
        mirrorDiv.appendChild(marker);

        const taRect = textarea.getBoundingClientRect();
        const markerRect = marker.getBoundingClientRect();
        const mirrorRect = mirrorDiv.getBoundingClientRect();
        // Marker-Position relativ zum Mirror → in textarea umrechnen
        const relTop = markerRect.top - mirrorRect.top - textarea.scrollTop;
        const relLeft = markerRect.left - mirrorRect.left - textarea.scrollLeft;
        return {
            top: taRect.top + relTop,
            left: taRect.left + relLeft,
            bottom: taRect.top + relTop + markerRect.height,
            right: taRect.left + relLeft + 1,
            width: 1,
            height: markerRect.height
        };
    }

    // ─── Input-Replacement-Logik ───

    function isEditableTarget(el) {
        if (!el) return false;
        if (el.tagName === 'INPUT') {
            // type-Filter: text/search/url/email/tel — sonst sinnlos
            const t = (el.type || 'text').toLowerCase();
            return ['text', 'search', 'url', 'email', 'tel', ''].includes(t);
        }
        if (el.tagName === 'TEXTAREA') return true;
        if (el.isContentEditable) return true;
        return false;
    }

    /**
     * Bei input/textarea: ersetze pi()/pi(n) und e()/e(n) im value;
     * setze Caret hinter die letzte Ersetzung (heuristisch).
     */
    function handleInputValueReplace(el) {
        const value = el.value;
        if (!value) return;
        if (value.indexOf('pi(') === -1 && value.indexOf('e(') === -1) return;

        const caret = el.selectionStart;
        let newValue = value;
        let caretShift = 0;

        // Cursor liegt nach letzter Ersetzung — wir berechnen Verschiebung
        // indem wir links vom Cursor ersetzen und Längen-Diff tracken.
        const left = value.substring(0, caret);
        const right = value.substring(caret);

        const leftReplaced = replaceECalls(replacePiCalls(left));
        const rightReplaced = replaceECalls(replacePiCalls(right));
        newValue = leftReplaced + rightReplaced;

        if (newValue === value) return;
        caretShift = leftReplaced.length - left.length;
        const newCaret = caret + caretShift;
        el.value = newValue;
        try { el.setSelectionRange(newCaret, newCaret); } catch (e) {}
    }

    /**
     * contenteditable: ersetze in textContent. Caret-Handling ist tricky →
     * wir nutzen execCommand-Style: nur ersetzen wenn Pattern abgeschlossen
     * (`pi(...)` oder `e(...)` mit schließender Klammer direkt vor Caret).
     */
    function handleContentEditableReplace(el) {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        if (!el.contains(range.startContainer)) return;
        if (range.startContainer.nodeType !== Node.TEXT_NODE) return;

        const textNode = range.startContainer;
        const text = textNode.nodeValue || '';
        const caret = range.startOffset;
        // Schau ob das pi(/e(-Pattern direkt links vom Caret abgeschlossen ist
        const leftText = text.substring(0, caret);

        // Suche letztes komplett-geschlossenes Token direkt vor Caret.
        // Pattern: (a) am String-Anfang ODER nach Nicht-Wort-Zeichen, dann pi(...) oder e(...).
        const RE_TAIL = /(^|[^A-Za-z0-9_])(pi|e)\(\s*(\d*)\s*\)$/;
        const m = RE_TAIL.exec(leftText);
        if (!m) return;
        const [full, pre, name, nStr] = m;
        const tokenLen = full.length - pre.length; // ohne führende Boundary
        const replacement = name === 'pi'
            ? (nStr === '' ? PI_CHAR : digitsString(PI_DIGITS, parseInt(nStr, 10)))
            : (nStr === '' ? 'e' : digitsString(E_DIGITS, parseInt(nStr, 10)));

        const matchStart = caret - tokenLen;
        const newText = text.substring(0, matchStart) + replacement + text.substring(caret);
        textNode.nodeValue = newText;
        const newCaret = matchStart + replacement.length;
        const newRange = document.createRange();
        newRange.setStart(textNode, Math.min(newCaret, newText.length));
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
    }

    // ─── Modul 3 + 4: Wort-Detection für pi/infinity-Suggestions ───

    function getInputTextAndCaret(el) {
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            return { text: el.value || '', caret: el.selectionStart };
        }
        if (el.isContentEditable) {
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
                const r = sel.getRangeAt(0);
                if (r.startContainer.nodeType === Node.TEXT_NODE) {
                    return { text: r.startContainer.nodeValue || '', caret: r.startOffset, textNode: r.startContainer };
                }
            }
        }
        return null;
    }

    /**
     * Findet das letzte vollständige Wort vor dem Caret.
     * - Wenn das Zeichen direkt links vom Caret eine Wortgrenze ist (Space, .,;:!?),
     *   nehmen wir das davor stehende Wort (User hat gerade Wortgrenze getippt).
     * - Wenn das Zeichen direkt links vom Caret ein Wort-Zeichen ist,
     *   nehmen wir das gerade-im-Tippen-Wort.
     * Liefert { word, start, end } oder null.
     */
    function wordBeforeCaret(text, caret) {
        const isBoundary = ch => /[\s.,;:!?()\[\]\/\\]/.test(ch);
        // 1. Skip alle Boundary-Zeichen links vom Caret
        let end = caret;
        while (end > 0 && isBoundary(text.charAt(end - 1))) end--;
        if (end === 0) return null;
        // 2. Skip alle Wort-Zeichen → Wortanfang
        let start = end;
        while (start > 0 && !isBoundary(text.charAt(start - 1))) start--;
        if (start === end) return null;
        const word = text.substring(start, end);
        return { word, start, end };
    }

    // Damerau-Levenshtein (klein, optimiert für kurze Wörter ≤ ~20 Zeichen).
    function damerauLevenshtein(a, b) {
        a = a.toLowerCase(); b = b.toLowerCase();
        if (a === b) return 0;
        const al = a.length, bl = b.length;
        if (al === 0) return bl;
        if (bl === 0) return al;
        const d = [];
        for (let i = 0; i <= al; i++) { d[i] = [i]; }
        for (let j = 0; j <= bl; j++) { d[0][j] = j; }
        for (let i = 1; i <= al; i++) {
            for (let j = 1; j <= bl; j++) {
                const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
                d[i][j] = Math.min(
                    d[i - 1][j] + 1,
                    d[i][j - 1] + 1,
                    d[i - 1][j - 1] + cost
                );
                if (i > 1 && j > 1
                    && a.charAt(i - 1) === b.charAt(j - 2)
                    && a.charAt(i - 2) === b.charAt(j - 1)) {
                    d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + cost);
                }
            }
        }
        return d[al][bl];
    }

    const INF_ANCHORS = ['infinity', 'unendlich'];
    const INF_EXPLICIT = new Set(['inf', 'infinite', 'infy', 'unendlich', 'infinity']);
    const INF_PHRASE = 'the one and 0nly infinite';

    /** Liefert {kind:'pi'|'inf', replacement, label} wenn Vorschlag passt. */
    function classifyWord(word) {
        const lower = word.toLowerCase();
        // pi alleine (genau "pi", case-insensitive)
        if (lower === 'pi') return { kind: 'pi', replacement: PI_CHAR, label: `wollen ${PI_CHAR}?` };

        if (INF_EXPLICIT.has(lower)) return { kind: 'inf', replacement: INF_CHAR, label: `wollen ${INF_CHAR}?` };

        // Fuzzy gegen Anchors — nur wenn Wort ≥ 5 Zeichen (verhindert Falschpositive wie "und"/"inf")
        // Toleranz 2 für 8-char-Anchor — 3 ist zu permissiv (matched "unending"→"unendlich").
        if (lower.length >= 5) {
            for (const anchor of INF_ANCHORS) {
                const dist = damerauLevenshtein(lower, anchor);
                if (dist > 0 && dist <= 2) {
                    return { kind: 'inf', replacement: INF_CHAR, label: `wollen ${INF_CHAR}?` };
                }
            }
        }
        return null;
    }

    /**
     * Zeigt Helper-Box für einen Wort-Vorschlag.
     */
    function offerSuggestion(el, wordInfo, suggestion) {
        if (isCooledDown(el, wordInfo.start, wordInfo.word)) return;
        const rect = getCaretRect(el);
        helperState = {
            el,
            kind: suggestion.kind,
            start: wordInfo.start,
            end: wordInfo.end,
            original: wordInfo.word,
            replacement: suggestion.replacement,
            textNode: wordInfo.textNode || null
        };
        showHelperBoxAt(rect, suggestion.label);
    }

    function applyHelperReplacement() {
        if (!helperState) return;
        const { el, start, end, replacement, textNode } = helperState;
        if (textNode && el.isContentEditable) {
            const text = textNode.nodeValue || '';
            textNode.nodeValue = text.substring(0, start) + replacement + text.substring(end);
            const newCaret = start + replacement.length;
            const sel = window.getSelection();
            const r = document.createRange();
            r.setStart(textNode, Math.min(newCaret, textNode.nodeValue.length));
            r.collapse(true);
            sel.removeAllRanges();
            sel.addRange(r);
        } else if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            const v = el.value;
            const newV = v.substring(0, start) + replacement + v.substring(end);
            el.value = newV;
            const newCaret = start + replacement.length;
            try { el.setSelectionRange(newCaret, newCaret); } catch (e) {}
        }
        hideHelperBox();
        el.focus();
    }

    function rejectHelperSuggestion() {
        if (!helperState) return;
        markCooldown(helperState.el, helperState.start, helperState.original);
        hideHelperBox();
        helperState && helperState.el && helperState.el.focus && helperState.el.focus();
    }

    helperAcceptBtn.addEventListener('mousedown', e => { e.preventDefault(); });
    helperRejectBtn.addEventListener('mousedown', e => { e.preventDefault(); });
    helperAcceptBtn.addEventListener('click', applyHelperReplacement);
    helperRejectBtn.addEventListener('click', rejectHelperSuggestion);

    // Phrase-Check innerhalb des aktuellen Texts (low-priority Bonus)
    function checkPhrase(el, text, caret) {
        const lower = text.toLowerCase();
        const idx = lower.lastIndexOf(INF_PHRASE);
        if (idx === -1) return false;
        const end = idx + INF_PHRASE.length;
        if (caret < end) return false; // Phrase noch nicht vollständig
        const word = text.substring(idx, end);
        offerSuggestion(el, { word, start: idx, end }, { kind: 'inf', replacement: INF_CHAR, label: `wollen ${INF_CHAR}?` });
        return true;
    }

    // ─── Globaler Input-Handler ───
    function handleInput(event) {
        const el = event.target;
        if (!isEditableTarget(el)) return;

        // Modul 1+2: pi(n)/e(n) erst replacen wenn Pattern komplett (mit `)`)
        // Im Input-Kontext lassen wir input-Event laufen, prüfen am Caret
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            handleInputValueReplace(el);
        } else if (el.isContentEditable) {
            handleContentEditableReplace(el);
        }

        // Modul 3+4: Suggestion-Check
        const info = getInputTextAndCaret(el);
        if (!info) return;

        // Phrase-Check zuerst (überschreibt einzelnes Wort wenn vorhanden)
        if (checkPhrase(el, info.text, info.caret)) return;

        const wordInfo = wordBeforeCaret(info.text, info.caret);
        if (!wordInfo) {
            if (helperState && helperState.el === el) hideHelperBox();
            return;
        }
        wordInfo.textNode = info.textNode;

        // Nur Vorschlagen, wenn direkt rechts vom Wort kein "(" steht
        // (sonst ist es Teil einer pi(/e(-Notation).
        const nextChar = info.text.charAt(info.caret);
        if (nextChar === '(') {
            if (helperState && helperState.el === el) hideHelperBox();
            return;
        }

        // Nur an Wortgrenze: prüfen ob das Zeichen LINKS vom Caret eine Wortgrenze ist
        // ODER ob der User explizit ein word-boundary key getippt hat.
        // Vereinfachung: wir prüfen jedes input-Event und klassifizieren das Wort vor Caret.
        const suggestion = classifyWord(wordInfo.word);
        if (suggestion) {
            offerSuggestion(el, wordInfo, suggestion);
        } else {
            if (helperState && helperState.el === el) hideHelperBox();
        }
    }

    document.addEventListener('input', handleInput, true);

    // Schließen der Helper-Box via ESC oder Klick außerhalb
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !helperBox.hidden) {
            rejectHelperSuggestion();
        }
    });

    document.addEventListener('click', e => {
        if (helperBox.hidden) return;
        if (helperBox.contains(e.target)) return;
        // Klick im selben Input → erlauben (Cursor-Move)
        if (helperState && e.target === helperState.el) return;
        hideHelperBox();
    });

    // Re-positionieren bei Scroll/Resize
    window.addEventListener('scroll', () => {
        if (!helperBox.hidden && helperState) {
            const rect = getCaretRect(helperState.el);
            showHelperBoxAt(rect, helperTextEl.textContent);
        }
    }, true);

    // Public API für Tests / Debug
    window._018Math = {
        replacePiCalls,
        replaceECalls,
        digitsString,
        PI_DIGITS,
        E_DIGITS,
        damerauLevenshtein,
        classifyWord
    };
})();

}); // Ende DOMContentLoaded
