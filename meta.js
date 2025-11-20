// meta.js
const menu = document.createElement('div');
menu.classList.add('menu');

// Wrapper für den Button (erlaubt Text-Selektion)
const menuButtonWrapper = document.createElement('div');
menuButtonWrapper.classList.add('menu-button-wrapper');

const menuButton = document.createElement('div');
menuButton.classList.add('menu-button');
menuButton.textContent = '≡';
menuButtonWrapper.appendChild(menuButton);

// Wrapper für die Menü-Liste (verhindert Text-Selektion)
const menuContentWrapper = document.createElement('div');
menuContentWrapper.classList.add('menu-content-wrapper');

const fileList = document.createElement('ul');
fileList.id = 'file-list';
menuContentWrapper.appendChild(fileList);

// Beide Wrapper zum Menü hinzufügen
menu.appendChild(menuButtonWrapper);
menu.appendChild(menuContentWrapper);

document.body.appendChild(menu);

// Priority items (fixed header)
const priorityItems = [
    { type: 'heading', text: 'legal stuff first:' },
    { type: 'file', path: 'impressum-und-datenschutz.html', name: 'impressum-und-datenschutz' },
    { type: 'heading', text: 'now the party:' },
    { type: 'file', path: 'README.html', name: 'README' },
    { type: 'separator' }
];

// Files to exclude from dynamic content (already in priority items)
const excludeFiles = ['impressum-und-datenschutz.html', 'README.html'];

/**
 * Render a single file link
 */
function renderFile(fileData) {
    const listItem = document.createElement('li');
    const link = document.createElement('a');
    link.href = '/' + encodeURI(fileData.path);
    // Wie im Explorer: vollständiger Dateiname inkl. Endung
    link.textContent = fileData.name || fileData.displayName || fileData.path;

    // Verhindere Link-Drag, damit Text-Selektion funktioniert
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

    // Create nested list for folder contents
    const nestedList = document.createElement('ul');
    nestedList.classList.add('folder-contents');

    // Render subfolders first
    if (folderData.folders) {
        Object.keys(folderData.folders).forEach(subFolderName => {
            const subFolderItem = renderFolder(subFolderName, folderData.folders[subFolderName]);
            nestedList.appendChild(subFolderItem);
        });
    }

    // Then render files
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
 * Parse sitemap.xml and derive hierarchical, multi-level folder structure from URLs
 */
function parseXmlStructure(xmlDoc) {
    const result = {
        folders: {},
        files: []
    };

    const urls = xmlDoc.getElementsByTagName('url');

    // Process each URL and build hierarchy
    for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        const loc = url.querySelector('loc')?.textContent;

        if (!loc) continue;

        // Remove protocol + domain, then leading slashes
        let path = loc.replace(/^https?:\/\/[^/]+\//, '');
        path = path.replace(/^\/+/, '');

        if (!path) continue;

        const parts = path.split('/').filter(part => part.length > 0);
        if (parts.length === 0) continue;

        const fileName = parts[parts.length - 1];

        // Generischer displayName: alles vor dem letzten Punkt, sonst kompletter Name
        const lastDotIndex = fileName.lastIndexOf('.');
        const displayName = lastDotIndex > 0 ? fileName.slice(0, lastDotIndex) : fileName;

        if (parts.length === 1) {
            // Root level file
            result.files.push({
                name: fileName,
                path,
                displayName
            });
        } else {
            // File in (possibly nested) folders
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

            current.files.push({
                name: fileName,
                path,
                displayName
            });
        }
    }

    // Optional: Ordner und Dateien alphabetisch sortieren
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
 * Load and render file list from sitemap.xml
 */
async function loadFileList() {
    try {
        // First, render priority items (fixed header)
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

        // Ensure sitemap.xml is up to date (non-blocking)
        fetch('/generate-structure.php').catch(e => console.warn('Sitemap update check failed:', e));

        // Fetch and parse sitemap.xml
        let response = await fetch('/sitemap.xml');

        // If sitemap.xml not found, try to generate it first
        if (!response.ok && response.status === 404) {
            console.warn('sitemap.xml not found, attempting to generate...');
            try {
                await fetch('/generate-structure.php?force=1');
                response = await fetch('/sitemap.xml');
            } catch (e) {
                console.warn('Failed to generate sitemap:', e);
            }
        }

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

        // Render folders first
        if (data.folders) {
            Object.keys(data.folders).forEach(folderName => {
                const folderItem = renderFolder(folderName, data.folders[folderName]);
                fileList.appendChild(folderItem);
            });
        }

        // Then render root-level files (excluding priority items)
        if (data.files) {
            data.files
                .filter(file => !excludeFiles.includes(file.name))
                .forEach(file => {
                    const fileItem = renderFile(file);
                    fileList.appendChild(fileItem);
                });
        }

    } catch (error) {
        console.error('Fehler beim Laden der Sitemap:', error);

        // Show error in menu
        const errorItem = document.createElement('li');
        errorItem.style.color = '#ff6b6b';
        errorItem.style.padding = '0.5rem';
        errorItem.textContent = '⚠️ Menü konnte nicht geladen werden';
        fileList.appendChild(errorItem);

        console.error('Details:', {
            message: error.message,
            sitemapUrl: '/sitemap.xml',
            generateUrl: '/generate-structure.php?force=1'
        });
    }
}

loadFileList();

// Funktion zum Setzen des Button-Textes
function setMenuButtonText(expanded) {
    // Einfach als normaler Text - keine separaten Elemente
    menuButton.textContent = expanded ? '0 ≡ 1 ≡ ∞' : '≡';
}

// Initial: Collapsed State
setMenuButtonText(false);

// Touch-Handling für Mobile
let touchHandled = false;

// Touch-Events für Mobile (ohne Drag-Detection, da Touch anders funktioniert)
menuButton.addEventListener('touchend', (e) => {
    e.preventDefault(); // Verhindert dass click auch feuert
    touchHandled = true;

    // Bei Touch: Normales Toggle (kein Drag-Support für Text-Selektion auf Mobile)
    menu.classList.toggle('open');
    menuButton.classList.toggle('expanded');

    setMenuButtonText(menuButton.classList.contains('expanded'));

    document.body.classList.toggle('menu-open', menu.classList.contains('open'));

    // Reset nach kurzer Zeit
    setTimeout(() => {
        touchHandled = false;
    }, 300);
});

// Click-Event (feuert nicht bei Text-Selektion oder Drag)
menuButton.addEventListener('click', (e) => {
    // Ignoriere Click wenn gerade Touch behandelt wurde
    if (touchHandled) {
        return;
    }

    menu.classList.toggle('open');
    menuButton.classList.toggle('expanded');

    setMenuButtonText(menuButton.classList.contains('expanded'));

    document.body.classList.toggle('menu-open', menu.classList.contains('open'));
});

// Click/Touch außerhalb des Menüs schließt es
function closeMenuIfOutside(e) {
    // Prüfe ob das Menü offen ist
    if (!menu.classList.contains('open')) {
        return;
    }

    // Prüfe ob der Click/Touch innerhalb des Menüs war
    if (!menu.contains(e.target)) {
        // Click/Touch war außerhalb - Menü schließen
        menu.classList.remove('open');
        menuButton.classList.remove('expanded');
        setMenuButtonText(false);
        document.body.classList.remove('menu-open');
    }
}

document.addEventListener('click', closeMenuIfOutside);
document.addEventListener('touchend', closeMenuIfOutside);

const backButton = document.createElement('div');
backButton.classList.add('back-button');
backButton.textContent = '⋅';
document.body.appendChild(backButton);

// Normaler Klick: Zurück zum Index
backButton.addEventListener('click', () => {
    window.location.href = '/index.html';
});

// Mittelklick (Mausrad): Öffnet den Index in einem neuen Tab
backButton.addEventListener('auxclick', (event) => {
    if (event.button === 1) {  // 1 entspricht dem Mittelklick
        window.open('/index.html', '_blank');
        event.preventDefault();
    }
});

