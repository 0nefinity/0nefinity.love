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

async function loadFileList() {
    try {
        const response = await fetch('/file-list.json');
        if (!response.ok) {
            throw new Error(`HTTP-Fehler! Status: ${response.status}`);
        }
        const files = await response.json();
        files.forEach(file => {
            const listItem = document.createElement('li');

            if (file.includes(':')) {
                const heading = document.createElement('span');
                heading.classList.add('menu-heading');
                heading.textContent = file.replace(/\.[^/.]+$/, '');
                listItem.appendChild(heading);
            } else {
                const link = document.createElement('a');
                const basePath = '/';
                link.href = basePath + file;
                const displayName = file.replace(/\.[^/.]+$/, '');
                link.textContent = displayName;

                // Verhindere Link-Drag, damit Text-Selektion funktioniert
                link.addEventListener('dragstart', (e) => {
                    e.preventDefault();
                });

                listItem.appendChild(link);
            }

            fileList.appendChild(listItem);
        });
    } catch (error) {
        console.error('Fehler beim Laden der Datei-Liste:', error);
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

// Click-Event mit Drag-Detection
let mouseDownPos = null;
let isDragging = false;

menuButton.addEventListener('mousedown', (e) => {
    mouseDownPos = { x: e.clientX, y: e.clientY };
    isDragging = false;
});

menuButton.addEventListener('mousemove', (e) => {
    if (mouseDownPos) {
        // Wenn Maus bewegt wird, ist es ein Drag
        const deltaX = Math.abs(e.clientX - mouseDownPos.x);
        const deltaY = Math.abs(e.clientY - mouseDownPos.y);

        // Threshold: 5px Bewegung = Drag
        if (deltaX > 5 || deltaY > 5) {
            isDragging = true;
        }
    }
});

menuButton.addEventListener('mouseup', (e) => {
    // Nur togglen wenn es KEIN Drag war
    if (mouseDownPos && !isDragging) {
        menu.classList.toggle('open');
        menuButton.classList.toggle('expanded');

        setMenuButtonText(menuButton.classList.contains('expanded'));

        document.body.classList.toggle('menu-open', menu.classList.contains('open'));
    }

    // Reset
    mouseDownPos = null;
    isDragging = false;
});

// Touch-Events für Mobile (ohne Drag-Detection, da Touch anders funktioniert)
menuButton.addEventListener('touchend', (e) => {
    // Bei Touch: Normales Toggle (kein Drag-Support für Text-Selektion auf Mobile)
    menu.classList.toggle('open');
    menuButton.classList.toggle('expanded');

    setMenuButtonText(menuButton.classList.contains('expanded'));

    document.body.classList.toggle('menu-open', menu.classList.contains('open'));
});

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

