// meta.js

// Projektweit nur die kuratierte 0nefinity-Auswahl laden.
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

// un0nefinity-Fonts separat zusätzlich laden (z.B. Ysabeau für Menü/Lupe),
// ohne sie in die kuratierte 0nefinity-Auswahl zu mischen.
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

// Tools synchron laden (sofort verfügbar für alle Seiten)
document.write('<script src="/tools/zoom.js"><\/script>');
document.write('<script src="/tools/tools/decimal.js"><\/script>');
document.write('<script src="/tools/controls.js"><\/script>');

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
            width,
            height,
            side,
            offsetX,
            offsetY,
            unit,
            toSquareX: value => offsetX + value * side,
            toSquareY: value => offsetY + value * side,
            toSquarePoint: (x, y) => ({ x: offsetX + x * side, y: offsetY + y * side }),
            toVirtualLength: value => value * unit,
            toVirtualFontSize: value => value * unit,
        };
    }

    global._018Space = Object.freeze({
        getCanvasRealm,
    });
})(typeof window !== 'undefined' ? window : this);

// DOM-Manipulation erst wenn Body existiert
document.addEventListener('DOMContentLoaded', () => {

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

const menu = document.createElement('div');
menu.classList.add('menu');

// Wrapper für den Button (erlaubt Text-Selektion)
const menuButtonWrapper = document.createElement('div');
menuButtonWrapper.classList.add('menu-button-wrapper');

const menuButton = document.createElement('div');
menuButton.classList.add('menu-button');
menuButton.textContent = '≡';
menuButtonWrapper.appendChild(menuButton);

// Wrapper für die Menü-Liste
const menuContentWrapper = document.createElement('div');
menuContentWrapper.classList.add('menu-content-wrapper');

// Suchleiste über der Dateiliste
const searchWrapper = document.createElement('div');
searchWrapper.classList.add('menu-search');

const searchInput = document.createElement('input');
searchInput.type = 'search';
searchInput.placeholder = 'type what you want…';
searchInput.setAttribute('aria-label', 'Menü durchsuchen');

const clearButton = document.createElement('button');
clearButton.type = 'button';
clearButton.classList.add('menu-search-clear');
clearButton.setAttribute('aria-label', 'Suche zurücksetzen');
clearButton.textContent = '×';

searchWrapper.appendChild(searchInput);
searchWrapper.appendChild(clearButton);

// Dateiliste
const fileList = document.createElement('ul');
fileList.id = 'file-list';

// Reihenfolge: Suchleiste, dann Liste
menuContentWrapper.appendChild(searchWrapper);
menuContentWrapper.appendChild(fileList);

// Menü zusammenbauen
menu.appendChild(menuButtonWrapper);
menu.appendChild(menuContentWrapper);
document.body.appendChild(menu);

// Priority items (fixed header)
const priorityItems = [
    { type: 'heading', text: 'legal stuff first:' },
    { type: 'file', path: 'impressum-und-datenschutz', name: 'impressum-und-datenschutz' },
    { type: 'heading', text: 'now the party:' },
    { type: 'file', path: 'README', name: 'README' },
    { type: 'file', path: 'c0n1ri8ute.html', name: 'c0n1ri8ute' }
];

// Files to exclude from dynamic content (already in priority items)
const excludePaths = ['impressum-und-datenschutz', 'README', 'c0n1ri8ute', 'c0n1ri8ute.html'];

/**
 * Render a single file link
 */
function renderFile(fileData) {
    const listItem = document.createElement('li');
    const link = document.createElement('a');
    link.href = '/' + encodeURI(fileData.path);
    link.textContent = fileData.name || fileData.displayName || fileData.path;

    link.addEventListener('dragstart', (e) => {
        e.preventDefault();
    });

    listItem.appendChild(link);
    return listItem;
}

/**
 * Render a folder with collapsible <details> element
 */
function renderFolder(folderName, folderData) {
    const listItem = document.createElement('li');
    const details = document.createElement('details');
    const summary = document.createElement('summary');

    summary.textContent = folderName;

    details.appendChild(summary);

    const nestedList = document.createElement('ul');
    nestedList.classList.add('folder-contents');

    // Subfolders
    if (folderData.folders) {
        Object.keys(folderData.folders).forEach(subFolderName => {
            const subFolderItem = renderFolder(subFolderName, folderData.folders[subFolderName]);
            nestedList.appendChild(subFolderItem);
        });
    }

    // Files
    if (folderData.files) {
        folderData.files.forEach(file => {
            const fileItem = renderFile(file);
            nestedList.appendChild(fileItem);
        });
    }

    details.appendChild(nestedList);
    listItem.appendChild(details);

    return listItem;
}

/**
 * Parse sitemap.xml and derive hierarchical structure
 */
function parseXmlStructure(xmlDoc) {
    const result = {
        folders: {},
        files: []
    };

    const urls = xmlDoc.getElementsByTagName('url');

    for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        const loc = url.querySelector('loc')?.textContent;

        if (!loc) continue;

        let path = loc.replace(/^https?:\/\/[^/]+\//, '');
        path = path.replace(/^\/+/, '');
        if (!path) {
            result.files.push({ name: 'index', path: '', displayName: 'index' });
            continue;
        }

        const parts = path.split('/').filter(part => part.length > 0);
        if (parts.length === 0) continue;

        const fileName = parts[parts.length - 1];
        const lastDotIndex = fileName.lastIndexOf('.');
        const displayName = lastDotIndex > 0 ? fileName.slice(0, lastDotIndex) : fileName;

        if (parts.length === 1) {
            result.files.push({ name: fileName, path, displayName });
        } else {
            let current = result;

            for (let j = 0; j < parts.length - 1; j++) {
                const folderName = parts[j];

                if (!current.folders) {
                    current.folders = {};
                }
                if (!current.folders[folderName]) {
                    current.folders[folderName] = {
                        folders: {},
                        files: []
                    };
                }

                current = current.folders[folderName];
            }

            current.files.push({ name: fileName, path, displayName });
        }
    }

    function sortNode(node) {
        if (node.folders) {
            const sortedFolders = {};
            Object.keys(node.folders)
                .sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' }))
                .forEach(folderName => {
                    sortedFolders[folderName] = node.folders[folderName];
                    sortNode(sortedFolders[folderName]);
                });
            node.folders = sortedFolders;
        }

        if (node.files) {
            node.files.sort((a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }));
        }
    }

    sortNode(result);
    return result;
}

/**
 * Normalisierung für die Suche
 */
function normalizeForSearch(str) {
    return str
        .toLocaleLowerCase('de')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Filtert das Menü anhand eines Suchstrings.
 * Headings & Separatoren werden bei aktiver Suche komplett ausgeblendet.
 */
function filterMenu(queryRaw) {
    const query = normalizeForSearch(queryRaw.trim());

    if (!query) {
        // Reset
        fileList.querySelectorAll('li').forEach(li => {
            li.style.display = '';
        });

        fileList.querySelectorAll('details').forEach(details => {
            details.open = false;
        });

        return;
    }

    // Erst mal alles sichtbar machen (Basiszustand)
    fileList.querySelectorAll('li').forEach(li => {
        li.style.display = '';
    });

    // Headings + Separatoren (nur Root-Ebene) bei aktiver Suche ausblenden
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

                if (childHasMatch) {
                    hasVisibleChild = true;
                }
            } else {
                const link = li.querySelector('a');
                const text = link
                    ? normalizeForSearch(link.textContent || '')
                    : normalizeForSearch(li.textContent || '');

                const match = text.includes(query);
                li.style.display = match ? '' : 'none';

                if (match) {
                    hasVisibleChild = true;
                }
            }
        });

        return hasVisibleChild;
    }

    filterList(fileList);
}

/**
 * Load and render file list from sitemap.xml
 */
async function loadFileList() {
    try {
        // Priority items
        priorityItems.forEach(item => {
            const listItem = document.createElement('li');

            if (item.type === 'heading') {
                const heading = document.createElement('span');
                heading.classList.add('menu-heading');
                heading.textContent = item.text;
                listItem.appendChild(heading);
            } else if (item.type === 'file') {
                const link = document.createElement('a');
                link.href = '/' + encodeURI(item.path);
                link.textContent = item.name;
                link.addEventListener('dragstart', (e) => e.preventDefault());
                listItem.appendChild(link);
            } else if (item.type === 'separator') {
                listItem.classList.add('menu-separator');
                listItem.innerHTML = '<hr>';
            }

            fileList.appendChild(listItem);
        });

        let response = await fetch('/sitemap.xml');

        if (!response.ok) {
            throw new Error(`HTTP-Fehler beim Laden von sitemap.xml! Status: ${response.status}`);
        }

        const xmlText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'application/xml');

        if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
            throw new Error('XML Parse Error');
        }

        const data = parseXmlStructure(xmlDoc);

        if (data.folders) {
            Object.keys(data.folders).forEach(folderName => {
                const folderItem = renderFolder(folderName, data.folders[folderName]);
                fileList.appendChild(folderItem);
            });
        }

        if (data.files) {
            data.files
                .filter(file => !excludePaths.includes(file.path))
                .forEach(file => {
                    const fileItem = renderFile(file);
                    fileList.appendChild(fileItem);
                });
        }
    } catch (error) {
        console.error('Fehler beim Laden der Sitemap:', error);

        const errorItem = document.createElement('li');
        errorItem.style.color = '#ff6b6b';
        errorItem.style.padding = '0.5rem';
        errorItem.textContent = '⚠️ Menü konnte nicht geladen werden';
        fileList.appendChild(errorItem);
    }
}

function getLongestPreLine(text) {
    return text
        .replace(/\r/g, '')
        .split('\n')
        .reduce((longestLine, currentLine) => (
            currentLine.length > longestLine.length ? currentLine : longestLine
        ), '');
}

const preMeasureElement = document.createElement('span');
preMeasureElement.setAttribute('aria-hidden', 'true');
preMeasureElement.style.position = 'absolute';
preMeasureElement.style.left = '-99999px';
preMeasureElement.style.top = '0';
preMeasureElement.style.visibility = 'hidden';
preMeasureElement.style.pointerEvents = 'none';
preMeasureElement.style.whiteSpace = 'pre';
preMeasureElement.style.display = 'inline-block';
document.body.appendChild(preMeasureElement);

let preFitAnimationFrameId = null;

function fitPreBlocksToTextWidth() {
    document.querySelectorAll('pre').forEach(pre => {
        pre.style.fontSize = '';

        const computedStyle = window.getComputedStyle(pre);
        const longestLine = getLongestPreLine(pre.textContent || '');
        const availableWidth = pre.clientWidth;
        const baseFontSizePx = parseFloat(computedStyle.fontSize);

        if (!longestLine || !availableWidth || !Number.isFinite(baseFontSizePx) || baseFontSizePx <= 0) {
            return;
        }

        preMeasureElement.style.fontFamily = computedStyle.fontFamily;
        preMeasureElement.style.fontSize = computedStyle.fontSize;
        preMeasureElement.style.fontStyle = computedStyle.fontStyle;
        preMeasureElement.style.fontVariant = computedStyle.fontVariant;
        preMeasureElement.style.fontWeight = computedStyle.fontWeight;
        preMeasureElement.style.letterSpacing = computedStyle.letterSpacing;
        preMeasureElement.style.textTransform = computedStyle.textTransform;
        preMeasureElement.textContent = longestLine;

        const measuredLineWidth = preMeasureElement.getBoundingClientRect().width;

        if (!Number.isFinite(measuredLineWidth) || measuredLineWidth <= 0) {
            return;
        }

        const fittedFontSizePx = baseFontSizePx * (availableWidth / measuredLineWidth);

        if (fittedFontSizePx < baseFontSizePx) {
            pre.style.fontSize = `${fittedFontSizePx}px`;
        }
    });
}

function scheduleFitPreBlocks() {
    if (preFitAnimationFrameId !== null) {
        cancelAnimationFrame(preFitAnimationFrameId);
    }

    preFitAnimationFrameId = requestAnimationFrame(() => {
        preFitAnimationFrameId = null;
        fitPreBlocksToTextWidth();
    });
}

loadFileList();
scheduleFitPreBlocks();

// Button-Text
function setMenuButtonText(expanded) {
    menuButton.textContent = expanded ? '0 ≡ 1 ≡ ∞' : '≡';
}
setMenuButtonText(false);

// Touch-Handling
let touchHandled = false;

// Desktop-Erkennung für Fokus
const isDesktopDevice = window.matchMedia &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches;

// Touch: nur toggeln, kein Fokus
menuButton.addEventListener('touchend', (e) => {
    e.preventDefault();
    touchHandled = true;

    const willOpen = !menu.classList.contains('open');

    menu.classList.toggle('open');
    menuButton.classList.toggle('expanded');

    setMenuButtonText(menuButton.classList.contains('expanded'));
    document.body.classList.toggle('menu-open', menu.classList.contains('open'));

    if (!willOpen && searchInput) {
        searchInput.value = '';
        filterMenu('');
        if (clearButton) {
            clearButton.classList.remove('visible');
        }
    }

    // Touch-Guard direkt wieder freigeben, keine künstliche Verzögerung
    touchHandled = false;
});

// Klick: Desktop-Toggle + Fokus
menuButton.addEventListener('click', () => {
    if (touchHandled) return;

    const willOpen = !menu.classList.contains('open');

    menu.classList.toggle('open');
    menuButton.classList.toggle('expanded');

    setMenuButtonText(menuButton.classList.contains('expanded'));
    document.body.classList.toggle('menu-open', menu.classList.contains('open'));

    if (willOpen && isDesktopDevice && searchInput) {
        searchInput.focus();
        searchInput.select();
    } else if (!willOpen && searchInput) {
        searchInput.value = '';
        filterMenu('');
        if (clearButton) {
            clearButton.classList.remove('visible');
        }
    }
});

// Klick/Tap außerhalb -> Menü schließen
function closeMenuIfOutside(e) {
    if (!menu.classList.contains('open')) return;
    if (!menu.contains(e.target)) {
        menu.classList.remove('open');
        menuButton.classList.remove('expanded');
        setMenuButtonText(false);
        document.body.classList.remove('menu-open');

        if (searchInput) {
            searchInput.value = '';
            filterMenu('');
        }
        if (clearButton) {
            clearButton.classList.remove('visible');
        }
    }
}

document.addEventListener('click', closeMenuIfOutside);
document.addEventListener('touchend', closeMenuIfOutside);

// Suche mit kleinem Debounce
let searchTimeoutId = null;

searchInput.addEventListener('input', () => {
    const value = searchInput.value;

    if (clearButton) {
        clearButton.classList.toggle('visible', value.length > 0);
    }

    clearTimeout(searchTimeoutId);
    searchTimeoutId = setTimeout(() => {
        filterMenu(value);
    }, 100);
});

clearButton.addEventListener('click', () => {
    searchInput.value = '';
    clearButton.classList.remove('visible');
    filterMenu('');
    searchInput.focus();
});

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
    if (event.key === 'Escape') {
        event.preventDefault();
        closeMetaDialog('dismiss');
    } else if (event.key === 'Enter') {
        event.preventDefault();
        closeMetaDialog('confirm');
    }
}

window._018Dialog = window._018Dialog || {};
window._018Dialog.confirm = function confirm(options = {}) {
    const {
        title = 'weiter?',
        message = '',
        confirmLabel = 'ok',
        cancelLabel = 'abbrechen',
        dismissLabel = 'zurück'
    } = options;

    if (dialogResolve) {
        closeMetaDialog('dismiss');
    }

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
    if (event.target === dialogBackdrop) {
        closeMetaDialog('dismiss');
    }
});

dialogConfirmBtn.addEventListener('click', () => closeMetaDialog('confirm'));
dialogCancelBtn.addEventListener('click', () => closeMetaDialog('cancel'));
dialogDismissBtn.addEventListener('click', () => closeMetaDialog('dismiss'));

// ESC: Suche leeren & Reset
searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        searchInput.value = '';
        filterMenu('');
        if (clearButton) {
            clearButton.classList.remove('visible');
        }
        searchInput.blur();
    }
});

// Scroll im Menü:
// Priorität: Wo die Maus ist, dort wird gescrollt.
// Maus über Menü -> nur Menü scrollt; Maus über Body -> nur Body scrollt.
window.addEventListener('wheel', (event) => {
    // Browser-Zoom (Ctrl/Cmd + Scroll oder Pinch-Gesten) nicht abfangen,
    // damit Zoomen überall funktioniert – auch über dem Menü.
    if (event.ctrlKey || event.metaKey) {
        return;
    }

    // Nur eingreifen, wenn das Menü überhaupt geöffnet ist
    if (!menu.classList.contains('open')) {
        return;
    }

    // Echte aktuelle Mausposition bestimmen, nicht nur event.target verwenden
    const hoveredElement = document.elementFromPoint(event.clientX, event.clientY);
    const inMenu = hoveredElement && hoveredElement.closest('.menu');

    if (!inMenu) {
        // Maus ist nicht im Menü -> Body/Webseite scrollt ganz normal
        return;
    }

    // Maus ist im Menü: Body-Scroll komplett unterbinden
    event.preventDefault();

    // Immer die eigentliche Liste scrollen, egal ob das Event z.B. vom Suchfeld kommt
    fileList.scrollTop += event.deltaY;
}, { passive: false });

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


// Back-Button
const backButton = document.createElement('div');
backButton.classList.add('back-button');
backButton.textContent = '⋅';
document.body.appendChild(backButton);

backButton.addEventListener('click', () => {
    window.location.href = '/index.html';
});

backButton.addEventListener('auxclick', (event) => {
    if (event.button === 1) {
        window.open('/index.html', '_blank');
        event.preventDefault();
    }
});

}); // Ende DOMContentLoaded
