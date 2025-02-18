// meta.js
const menuButton = document.createElement('div');
menuButton.classList.add('menu-button');
menuButton.textContent = '≡';
document.body.appendChild(menuButton);

const menu = document.createElement('div');
menu.classList.add('menu');
const fileList = document.createElement('ul');
fileList.id = 'file-list';
menu.appendChild(fileList);
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
                listItem.appendChild(link);
            }

            fileList.appendChild(listItem);
        });
    } catch (error) {
        console.error('Fehler beim Laden der Datei-Liste:', error);
    }
}

loadFileList();

menuButton.addEventListener('click', () => {
    menu.classList.toggle('open');
    menuButton.classList.toggle('expanded');

    menuButton.textContent = menuButton.classList.contains('expanded') ? '0 ≡ 1 ≡ ∞' : '≡';

    document.body.classList.toggle('menu-open', menu.classList.contains('open'));
});

const backButton = document.createElement('div');
backButton.classList.add('back-button');
backButton.textContent = '⋅';
document.body.appendChild(backButton);

backButton.addEventListener('click', () => {
    window.location.href = '/index.html';
});






