// tools/settings.js - Globale Einstellungen für Schriftart und -größe
(function() {
    'use strict';

    // Standardwerte
    const DEFAULTS = {
        fontFamily: '"Courier New", Courier, monospace',
        fontSize: 16
    };

    // Verfügbare Schriftarten
    const FONT_FAMILIES = [
        { value: '"Courier New", Courier, monospace', label: 'Monospace' },
        { value: 'Verdana, Geneva, Tahoma, sans-serif', label: 'Verdana' },
        { value: 'Georgia, serif', label: 'Georgia' },
        { value: 'Arial, Helvetica, sans-serif', label: 'Arial' },
        { value: '"Times New Roman", Times, serif', label: 'Times' },
        { value: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', label: 'System' }
    ];

    // Font Size Grenzen
    const FONT_SIZE_MIN = 10;
    const FONT_SIZE_MAX = 32;
    const FONT_SIZE_STEP = 1;

    // Settings aus localStorage laden
    function loadSettings() {
        const saved = localStorage.getItem('0nefinity-settings');
        if (saved) {
            try {
                return { ...DEFAULTS, ...JSON.parse(saved) };
            } catch (e) {
                console.warn('Failed to parse settings:', e);
            }
        }
        return { ...DEFAULTS };
    }

    // Settings in localStorage speichern
    function saveSettings(settings) {
        localStorage.setItem('0nefinity-settings', JSON.stringify(settings));
    }

    // Settings anwenden
    function applySettings(settings) {
        document.documentElement.style.setProperty('--font-family', settings.fontFamily);
        document.documentElement.style.setProperty('font-size', settings.fontSize + 'px');
    }

    // Initiale Settings laden und anwenden
    const currentSettings = loadSettings();
    applySettings(currentSettings);

    // Zahnrad-Button erstellen (dezent, klein)
    const settingsButton = document.createElement('div');
    settingsButton.classList.add('settings-button');
    settingsButton.innerHTML = '⚙';
    settingsButton.setAttribute('aria-label', 'Einstellungen');
    settingsButton.setAttribute('title', 'Einstellungen');

    let isPanelOpen = false;

    // Settings-Panel Container - horizontale Leiste
    const settingsPanel = document.createElement('div');
    settingsPanel.classList.add('settings-panel');

    // Panel-Inhalt - alles in einer Zeile
    settingsPanel.innerHTML = `
        <div class="settings-body">
            <div class="settings-group">
                <label>Schriftart</label>
                <button class="settings-stepper-btn minus" data-setting="fontFamily" aria-label="Vorherige Schriftart">−</button>
                <select class="settings-select" id="font-family-select">
                    ${FONT_FAMILIES.map(font =>
                        `<option value="${font.value}" ${font.value === currentSettings.fontFamily ? 'selected' : ''}>${font.label}</option>`
                    ).join('')}
                </select>
                <button class="settings-stepper-btn plus" data-setting="fontFamily" aria-label="Nächste Schriftart">+</button>
            </div>
            <div class="settings-divider"></div>
            <div class="settings-group">
                <label>Größe</label>
                <button class="settings-stepper-btn minus" data-setting="fontSize" aria-label="Kleiner">−</button>
                <div class="settings-value-display" id="font-size-display">${currentSettings.fontSize}px</div>
                <button class="settings-stepper-btn plus" data-setting="fontSize" aria-label="Größer">+</button>
            </div>
        </div>
    `;

    // Helper: Font Label finden
    function getFontLabel(fontValue) {
        const font = FONT_FAMILIES.find(f => f.value === fontValue);
        return font ? font.label : 'Monospace';
    }

    // Elemente zum DOM hinzufügen
    document.body.appendChild(settingsButton);
    document.body.appendChild(settingsPanel);

    // Event Listeners
    const fontFamilySelect = settingsPanel.querySelector('#font-family-select');
    const fontSizeDisplay = settingsPanel.querySelector('#font-size-display');
    const stepperButtons = settingsPanel.querySelectorAll('.settings-stepper-btn');

    // Toggle Panel
    settingsButton.addEventListener('click', (e) => {
        e.stopPropagation();
        isPanelOpen = !isPanelOpen;
        settingsPanel.classList.toggle('open', isPanelOpen);
        settingsButton.classList.toggle('open', isPanelOpen);
    });

    // Schließen bei Klick außerhalb
    document.addEventListener('click', (e) => {
        if (isPanelOpen && !settingsPanel.contains(e.target) && !settingsButton.contains(e.target)) {
            isPanelOpen = false;
            settingsPanel.style.display = 'none';
            settingsButton.classList.remove('open');
        }
    });

    // Dropdown für Schriftart
    fontFamilySelect.addEventListener('change', (e) => {
        currentSettings.fontFamily = e.target.value;
        applySettings(currentSettings);
        saveSettings(currentSettings);
    });

    // Stepper Buttons
    stepperButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const setting = btn.dataset.setting;
            const isPlus = btn.classList.contains('plus');

            if (setting === 'fontFamily') {
                const currentIndex = FONT_FAMILIES.findIndex(f => f.value === currentSettings.fontFamily);
                let newIndex = isPlus ? currentIndex + 1 : currentIndex - 1;

                // Wrap around
                if (newIndex >= FONT_FAMILIES.length) newIndex = 0;
                if (newIndex < 0) newIndex = FONT_FAMILIES.length - 1;

                currentSettings.fontFamily = FONT_FAMILIES[newIndex].value;
                fontFamilySelect.value = currentSettings.fontFamily;
            } else if (setting === 'fontSize') {
                let newSize = currentSettings.fontSize + (isPlus ? FONT_SIZE_STEP : -FONT_SIZE_STEP);
                newSize = Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, newSize));

                currentSettings.fontSize = newSize;
                fontSizeDisplay.textContent = newSize + 'px';
            }

            applySettings(currentSettings);
            saveSettings(currentSettings);
        });
    });

    // Menü-Verschiebung beobachten
    const menu = document.querySelector('.menu');
    if (menu) {
        const observer = new MutationObserver(() => {
            const isMenuOpen = menu.classList.contains('open');
            settingsButton.classList.toggle('menu-open', isMenuOpen);
            settingsPanel.classList.toggle('menu-open', isMenuOpen);
        });

        observer.observe(menu, { attributes: true, attributeFilter: ['class'] });
    }

})();

