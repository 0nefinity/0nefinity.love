// metastuff.js

document.addEventListener('DOMContentLoaded', () => {
    // Erstellen des Menü-Buttons
    const menuButton = document.createElement('div');
    menuButton.classList.add('menu-button');
    menuButton.textContent = '≡';
    document.body.appendChild(menuButton);
  
    // Erstellen des Menü-Containers
    const menu = document.createElement('div');
    menu.classList.add('menu');
    const fileList = document.createElement('ul');
    fileList.id = 'file-list';
    menu.appendChild(fileList);
    document.body.appendChild(menu);
  
    // Klick-Event für Menü
    menuButton.addEventListener('click', () => {
      menu.classList.toggle('open');
      menuButton.classList.toggle('expanded');
  
      // Ändere den Button-Text basierend auf dem Zustand
      menuButton.textContent = menuButton.classList.contains('expanded') ? '0 ≡ 1 ≡ ∞' : '≡';
    });
  
    // Funktion, um die Datei-Liste zu laden
    async function loadFileList() {
      try {
        const response = await fetch('file-list.json');
        if (!response.ok) {
          throw new Error(`HTTP-Fehler! Status: ${response.status}`);
        }
        const files = await response.json();
        files.forEach(file => {
          const listItem = document.createElement('li');
          const link = document.createElement('a');
          link.href = file;
  
          // Entferne die Dateiendung für die Anzeige
          const displayName = file.replace(/\.[^/.]+$/, '');
  
          link.textContent = displayName;
          listItem.appendChild(link);
          fileList.appendChild(listItem);
        });
      } catch (error) {
        console.error('Fehler beim Laden der Datei-Liste:', error);
      }
    }
  
    // Datei-Liste laden
    loadFileList();

    // ---------------------------
    // Hinzufügen des Zurück-Buttons
    // ---------------------------

    // Erstellen des Zurück-Buttons
    const backButton = document.createElement('div');
    backButton.classList.add('back-button');
    backButton.textContent = '⋅';
    document.body.appendChild(backButton);

    // Klick-Event für Zurück-Button
    backButton.addEventListener('click', () => {
        window.location.href = 'index.html';
    });
});
