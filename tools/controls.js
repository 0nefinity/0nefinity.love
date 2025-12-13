/**
 * 0ne-UI Controls Library
 * Generalisierte UI-Komponenten für Settings-Panels (Desktop + Mobile)
 * 
 * Nutzung:
 *   <script src="/tools/controls.js"></script>
 *   <script>
 *     const panel = Controls.createPanel({ ... });
 *   </script>
 */

(function() {
    'use strict';

    // === CSS INJECTION ===
    const CSS = `
/* ========== CONTROLS PANEL ========== */
.ctrl-panel {
    position: fixed;
    top: 4.375rem;
    left: 50%;
    transform: translateX(-50%);
    padding: 0.75rem 1rem;
    background: rgba(0, 0, 0, 0.85);
    border-radius: 12px;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    z-index: 100;
    font-size: 14px;
    color: var(--text-color, #fff);
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    display: flex;
    flex-direction: column;
    width: fit-content;
    min-width: 280px;
    max-width: 100vw;
}

.ctrl-panel.dragging { opacity: 0.9; }

/* Header / Drag-Handle */
.ctrl-panel-header {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.5rem 0;
    margin-bottom: 0.5rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    cursor: grab;
    gap: 0.5rem;
    position: relative;
    touch-action: none; /* Prevent browser scroll/zoom on touch */
    -webkit-user-select: none;
    user-select: none;
}
.ctrl-panel-header:active { cursor: grabbing; }

.ctrl-drag-indicator {
    width: 40px;
    height: 4px;
    background: rgba(255, 255, 255, 0.3);
    border-radius: 2px;
}

/* Layout Toggle Button */
.ctrl-layout-toggle {
    position: absolute;
    right: 8px;
    width: 20px;
    height: 20px;
    background: transparent;
    border: none;
    color: rgba(255,255,255,0.4);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    transition: color 0.15s;
    padding: 0;
}
.ctrl-layout-toggle:hover {
    color: rgba(255,255,255,0.8);
}

/* ========== BAR MODE ========== */
.ctrl-panel.bar-mode {
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-rows: auto auto;
    max-width: 95vw;
    width: auto;
    max-height: none;
    padding: 0.5rem 1rem;
    gap: 0.4rem 0.75rem;
    align-items: center;
}
.ctrl-panel.bar-mode .ctrl-panel-header {
    grid-column: 1;
    grid-row: 1 / -1; /* Spannt über alle Zeilen */
    padding: 0;
    margin: 0;
    border: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding-right: 0.5rem;
}
.ctrl-panel.bar-mode .ctrl-drag-indicator {
    width: 4px;
    height: 20px;
}
.ctrl-panel.bar-mode .ctrl-layout-toggle {
    position: static;
    margin: 0;
}
.ctrl-panel.bar-mode .ctrl-panel-body {
    grid-column: 2;
    grid-row: 1 / -1;
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 0.4rem 1rem;
    align-items: center;
    align-content: center;
    max-height: none;
    overflow: visible;
}
.ctrl-panel.bar-mode .ctrl-row {
    flex-shrink: 0;
    margin: 0;
    min-height: auto;
}
.ctrl-panel.bar-mode .ctrl-label {
    flex: 0 0 auto;
    font-size: 12px;
}
.ctrl-panel.bar-mode .ctrl-divider {
    display: none;
}

/* Body */
.ctrl-panel-body {
    overflow-y: auto;
    overflow-x: visible; /* Panel grows with content */
    -webkit-overflow-scrolling: touch;
    width: fit-content;
    min-width: 100%;
}

/* Row */
.ctrl-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
    min-height: 32px;
}
.ctrl-row:last-child { margin-bottom: 0; }

.ctrl-label {
    flex: 0 0 70px;
    font-size: 13px;
    opacity: 0.8;
}

/* Stepper Container */
.ctrl-stepper {
    display: flex;
    align-items: center;
    gap: 0.25rem;
}

.ctrl-stepper-btn {
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    color: var(--text-color, #fff);
    font-size: 1.3rem;
    font-weight: 300;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.7;
    transition: opacity 0.15s ease, transform 0.1s ease;
    user-select: none;
    -webkit-user-select: none;
}
.ctrl-stepper-btn:hover { opacity: 1; }
.ctrl-stepper-btn:active { transform: scale(0.85); opacity: 1; }

.ctrl-value-input {
    background: transparent;
    border: none;
    border-bottom: 1px solid rgba(255,255,255,0.2);
    color: var(--text-color, #fff);
    font-size: 14px;
    font-variant-numeric: tabular-nums;
    text-align: right;
    width: 4em;
    padding: 0.2em 0.1em;
    outline: none;
}
.ctrl-value-input:focus {
    border-bottom-color: rgba(255,255,255,0.6);
    background: rgba(255,255,255,0.05);
}

/* Textarea - resizable in both directions */
.ctrl-textarea {
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 4px;
    color: var(--text-color, #fff);
    font-size: 16px; /* Prevents iOS zoom */
    font-family: inherit;
    padding: 0.3em 0.5em;
    outline: none;
    resize: both;
    overflow: auto; /* Required for resize to work! */
    min-height: 2em;
    height: 1em;
    min-width: 6em;
    width: 8em;
    max-width: 90vw;
    max-height: 50vh;
    box-sizing: border-box;
    flex: 0 0 auto; /* Don't shrink, don't grow, use actual size */
    line-height: 1.3;
}
.ctrl-textarea:focus {
    border-color: rgba(255,255,255,0.5);
    background: rgba(255,255,255,0.08);
}
/* Allow textarea to overflow panel bounds */
.ctrl-row:has(.ctrl-textarea) {
    overflow: visible;
}

/* Toggle Button */
.ctrl-toggle {
    padding: 0.3rem 1rem;
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.3);
    color: var(--text-color, #fff);
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
    transition: all 0.2s;
}
.ctrl-toggle.active {
    background: rgba(255,255,255,0.3);
    border-color: rgba(255,255,255,0.6);
}

/* Range Slider */
.ctrl-range {
    flex: 1;
    height: 6px;
    -webkit-appearance: none;
    appearance: none;
    background: rgba(255,255,255,0.2);
    border-radius: 3px;
    outline: none;
    cursor: pointer;
}
.ctrl-range::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 16px;
    height: 16px;
    background: var(--text-color, #fff);
    border-radius: 50%;
    cursor: pointer;
    transition: transform 0.1s ease;
}
.ctrl-range::-webkit-slider-thumb:hover { transform: scale(1.15); }
.ctrl-range::-moz-range-thumb {
    width: 16px;
    height: 16px;
    background: var(--text-color, #fff);
    border-radius: 50%;
    border: none;
    cursor: pointer;
}

/* Select */
.ctrl-select {
    flex: 1;
    height: 32px;
    background: var(--bg-color, #111);
    color: var(--text-color, #fff);
    border: 1px solid rgba(255,255,255,0.3);
    border-radius: 6px;
    padding: 0 0.5rem;
    font-size: 13px;
    cursor: pointer;
}

/* Value Display */
.ctrl-value-display {
    min-width: 40px;
    text-align: right;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    opacity: 0.7;
}

/* Section Divider */
.ctrl-divider {
    height: 1px;
    background: rgba(255,255,255,0.15);
    margin: 0.75rem 0;
}
`;

    // === MOBILE CSS ===
    const CSS_MOBILE = `
/* ========== MOBILE BOTTOM-SHEET ========== */
@media (max-width: 768px) {
    .ctrl-panel {
        top: auto;
        bottom: 0;
        left: 0;
        right: 0;
        transform: none;
        max-width: 100%;
        width: 100%;
        min-width: 100%;
        border-radius: 20px 20px 0 0;
        padding: 0;
        max-height: 50vh; /* Maximal halber Bildschirm */
    }

    .ctrl-panel-header {
        padding: 12px;
        margin-bottom: 0;
        touch-action: none;
    }

    /* Toggle-Button auf Mobile ausblenden - Bar-Modus nicht nötig */
    .ctrl-layout-toggle {
        display: none !important;
    }

    .ctrl-panel-body {
        max-height: calc(50vh - 56px); /* Panel max-height minus Header */
        overflow-y: auto;
        overflow-x: hidden;
        -webkit-overflow-scrolling: touch; /* Smooth scroll auf iOS */
        padding: 0 1rem 1.5rem;
        padding-bottom: max(1.5rem, env(safe-area-inset-bottom));
    }

    .ctrl-row {
        min-height: 44px;
        gap: 0.75rem;
    }

    .ctrl-label {
        flex: 0 0 80px;
        font-size: 14px;
    }

    /* Prevent iOS zoom on input focus */
    .ctrl-panel input,
    .ctrl-panel select,
    .ctrl-panel textarea {
        font-size: 16px;
    }

    .ctrl-stepper-btn {
        width: 44px;
        height: 44px;
        font-size: 1.6rem;
    }

    .ctrl-range::-webkit-slider-thumb {
        width: 24px;
        height: 24px;
    }
    .ctrl-range::-moz-range-thumb {
        width: 24px;
        height: 24px;
    }

    .ctrl-toggle {
        min-height: 44px;
        font-size: 16px;
        padding: 0.5rem 1.25rem;
    }

    .ctrl-select {
        min-height: 44px;
        font-size: 16px;
    }
}

@media (max-width: 380px) {
    .ctrl-label {
        flex: 0 0 60px;
        font-size: 13px;
    }
}
`;

    // Inject CSS into document
    function injectCSS() {
        if (document.getElementById('ctrl-panel-styles')) return;
        const style = document.createElement('style');
        style.id = 'ctrl-panel-styles';
        style.textContent = CSS + CSS_MOBILE;
        document.head.appendChild(style);
    }

    // === UTILITY FUNCTIONS ===

    function clamp(val, min, max) {
        return Math.max(min, Math.min(max, val));
    }

    function formatValue(val, decimals) {
        return Number(val).toFixed(decimals);
    }

    function isMobile() {
        return window.innerWidth <= 768;
    }

    // === PANEL CLASS ===
    class ControlPanel {
        constructor(options = {}) {
            this.options = {
                id: options.id || 'ctrl-panel-' + Date.now(),
                parent: options.parent || document.body,
                position: options.position || 'center', // 'center', 'left', 'right'
                draggable: options.draggable !== false,
                // Mobile: Element das sich mit dem Panel mitbewegt (wie in 0neSlider)
                mobileContentElement: options.mobileContentElement || null,
                mobileContentMaxOffset: options.mobileContentMaxOffset || 12, // vh
                ...options
            };
            this.params = {};
            this.callbacks = {};
            this.el = null;
            this.headerEl = null;
            this.bodyEl = null;
            this._isDragging = false;
            this._dragStart = { x: 0, y: 0 };
            this._panelStart = { x: 0, y: 0 };
            this._mobileY = 0;

            this._create();
        }

        _create() {
            injectCSS();

            this.el = document.createElement('div');
            this.el.className = 'ctrl-panel';
            this.el.id = this.options.id;

            // Position variants
            if (this.options.position === 'left') {
                this.el.style.left = '1rem';
                this.el.style.transform = 'none';
            } else if (this.options.position === 'right') {
                this.el.style.left = 'auto';
                this.el.style.right = '1rem';
                this.el.style.transform = 'none';
            }

            // Header
            this.headerEl = document.createElement('div');
            this.headerEl.className = 'ctrl-panel-header';
            this.headerEl.innerHTML = `
                <div class="ctrl-drag-indicator"></div>
                <button class="ctrl-layout-toggle" title="Breit">↔</button>
            `;
            this.el.appendChild(this.headerEl);

            // Layout toggle button
            this._isBarMode = false;
            const toggleBtn = this.headerEl.querySelector('.ctrl-layout-toggle');
            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent tap-toggle on mobile
                this._toggleLayout();
            });

            // Body
            this.bodyEl = document.createElement('div');
            this.bodyEl.className = 'ctrl-panel-body';
            this.el.appendChild(this.bodyEl);

            // Append to parent
            if (typeof this.options.parent === 'string') {
                document.querySelector(this.options.parent).appendChild(this.el);
            } else {
                this.options.parent.appendChild(this.el);
            }

            // Init drag behavior
            if (this.options.draggable) {
                this._initDrag();
            }

            // Init mobile bottom-sheet
            this._initMobileSheet();
        }

        // Toggle between panel and bar layout
        _toggleLayout() {
            this._isBarMode = !this._isBarMode;
            const toggleBtn = this.headerEl.querySelector('.ctrl-layout-toggle');

            if (this._isBarMode) {
                this.el.classList.add('bar-mode');
                toggleBtn.textContent = '↕';
                toggleBtn.title = 'Schmal';
                // Reset body max-height for bar mode
                this.bodyEl.style.maxHeight = '';
                // Set initial bar width
                this._updateBarWidth();
            } else {
                this.el.classList.remove('bar-mode');
                toggleBtn.textContent = '↔';
                toggleBtn.title = 'Breit';
                // Reset max-width to default
                this.el.style.maxWidth = '';
                // Re-apply height constraints
                this._updateBodyHeight();
            }
        }

        // Update body max-height based on panel position (desktop)
        _updateBodyHeight() {
            if (!this.bodyEl || isMobile() || this._isBarMode) return;
            const rect = this.el.getBoundingClientRect();
            const headerHeight = this.headerEl?.offsetHeight || 40;
            const availableHeight = window.innerHeight - rect.top - headerHeight - 16;
            if (availableHeight > 0) {
                this.bodyEl.style.maxHeight = availableHeight + 'px';
            }
        }

        // Update body max-height for mobile based on panel Y position
        _updateMobileBodyHeight() {
            if (!this.bodyEl || !isMobile()) return;
            const HANDLE_HEIGHT = 56;
            // Panel ist bei bottom:0, translateY verschiebt nach unten
            // Sichtbare Höhe = Gesamthöhe - translateY
            const panelHeight = this.el.offsetHeight || 300;
            const visibleHeight = panelHeight - this._mobileY;
            const bodyHeight = Math.max(0, visibleHeight - HANDLE_HEIGHT - 16);
            this.bodyEl.style.maxHeight = bodyHeight + 'px';
        }

        // Update max-width in bar mode based on position
        _updateBarWidth() {
            if (!this._isBarMode) return;
            const rect = this.el.getBoundingClientRect();
            const availableWidth = window.innerWidth - rect.left - 16;
            this.el.style.maxWidth = Math.max(200, availableWidth) + 'px';
        }

        _initDrag() {
            // Desktop drag
            this.headerEl.addEventListener('mousedown', (e) => {
                if (isMobile()) return;
                this._isDragging = true;
                this.el.classList.add('dragging');
                const rect = this.el.getBoundingClientRect();
                this._dragStart = { x: e.clientX, y: e.clientY };
                this._panelStart = { x: rect.left, y: rect.top };
                this.el.style.transform = 'none';
                this.el.style.left = rect.left + 'px';
                this.el.style.top = rect.top + 'px';
                e.preventDefault();
            });

            document.addEventListener('mousemove', (e) => {
                if (!this._isDragging) return;
                const dx = e.clientX - this._dragStart.x;
                const dy = e.clientY - this._dragStart.y;

                // Gewünschte Position berechnen
                let newLeft = this._panelStart.x + dx;
                let newTop = this._panelStart.y + dy;

                // Im Bar-Modus: max-width ZUERST setzen, dann Position clampen
                if (this._isBarMode) {
                    // Breite = vom linken Rand bis zum rechten Viewport-Rand
                    const availableWidth = window.innerWidth - Math.max(0, newLeft) - 16;
                    this.el.style.maxWidth = Math.max(200, availableWidth) + 'px';
                }

                // Horizontal: Position clampen
                const panelWidth = this.el.offsetWidth;
                const maxLeft = Math.max(0, window.innerWidth - panelWidth);
                newLeft = clamp(newLeft, 0, maxLeft);

                // Vertikal: Nur Header muss sichtbar bleiben
                const headerHeight = this.headerEl?.offsetHeight || 40;
                const maxTop = Math.max(0, window.innerHeight - headerHeight - 8);
                newTop = clamp(newTop, 0, maxTop);

                this.el.style.left = newLeft + 'px';
                this.el.style.top = newTop + 'px';

                // Update body height while dragging
                this._updateBodyHeight();
            });

            document.addEventListener('mouseup', () => {
                if (this._isDragging) {
                    this._isDragging = false;
                    this.el.classList.remove('dragging');
                    this._updateBodyHeight();
                    this._updateBarWidth();
                }
            });

            // Initial height + resize
            this._updateBodyHeight();
            window.addEventListener('resize', () => {
                this._updateBodyHeight();
                this._updateBarWidth();
            });
        }

        _initMobileSheet() {
            // Mobile Bottom-Sheet (wie in 0neSlider.html)
            const HEADER_HEIGHT = 56;
            this._mobileY = 0;
            let isTouchDragging = false;
            let touchStartY = 0;

            // Referenz auf das mitzubewegende Element
            const contentEl = this.options.mobileContentElement;
            const maxOffsetVh = this.options.mobileContentMaxOffset;

            // maxY = wie weit das Panel nach unten kann (so dass Header noch sichtbar)
            const getMaxY = () => {
                const fullHeight = this.el.offsetHeight || 300;
                return Math.max(100, fullHeight - HEADER_HEIGHT);
            };

            const clampY = (y) => Math.max(0, Math.min(getMaxY(), y));

            // Content-Element verschieben basierend auf Panel-Position
            const updateContentPosition = (panelY, animate = false) => {
                if (!contentEl || !isMobile()) return;
                const maxY = getMaxY();
                // openRatio: 0 = geschlossen, 1 = voll offen
                const openRatio = maxY > 0 ? 1 - (panelY / maxY) : 1;
                const offsetVh = openRatio * maxOffsetVh;
                contentEl.style.transition = animate ? 'transform 0.25s ease-out' : 'none';
                // Nach oben verschieben wenn Panel offen
                contentEl.style.transform = `translateY(-${offsetVh}vh)`;
            };

            const setPosition = (y, animate = false) => {
                if (!isMobile()) return;
                this._mobileY = clampY(y);
                this.el.style.transition = animate ? 'transform 0.25s ease-out' : 'none';
                this.el.style.transform = `translateY(${this._mobileY}px)`;
                updateContentPosition(this._mobileY, animate);
            };

            const initPosition = () => {
                if (!isMobile()) {
                    this.el.style.transition = '';
                    this.el.style.transform = '';
                    if (contentEl) {
                        contentEl.style.transition = '';
                        contentEl.style.transform = '';
                    }
                    return;
                }
                // Starte fast ganz offen (nur 20% nach unten geschoben)
                requestAnimationFrame(() => {
                    setPosition(getMaxY() * 0.2, false);
                });
            };

            initPosition();
            window.addEventListener('resize', initPosition);

            // Tap to toggle: closed -> half -> open -> closed
            this.headerEl.addEventListener('click', () => {
                if (!isMobile()) return;
                const maxY = getMaxY();
                const halfY = maxY * 0.5;
                if (this._mobileY > halfY) {
                    setPosition(halfY, true);
                } else if (this._mobileY > 10) {
                    setPosition(0, true);
                } else {
                    setPosition(maxY, true);
                }
            });

            // Touch drag
            this.headerEl.addEventListener('touchstart', (e) => {
                if (!isMobile()) return;
                isTouchDragging = false;
                touchStartY = e.touches[0].clientY;
                this.el.style.transition = 'none';
                if (contentEl) contentEl.style.transition = 'none';
            }, { passive: true });

            this.headerEl.addEventListener('touchmove', (e) => {
                if (!isMobile()) return;
                isTouchDragging = true;
                const deltaY = e.touches[0].clientY - touchStartY;
                const newY = clampY(this._mobileY + deltaY);
                this.el.style.transform = `translateY(${newY}px)`;
                updateContentPosition(newY, false);
            }, { passive: true });

            this.headerEl.addEventListener('touchend', (e) => {
                if (!isMobile()) return;
                if (isTouchDragging) {
                    const endY = e.changedTouches[0].clientY;
                    const deltaY = endY - touchStartY;
                    this._mobileY = clampY(this._mobileY + deltaY);
                    this.el.style.transform = `translateY(${this._mobileY}px)`;
                    updateContentPosition(this._mobileY, false);
                }
                isTouchDragging = false;
            });
        }

        // === ROW CREATION METHODS ===

        /**
         * Add a stepper row (− input +)
         */
        addStepper(key, config) {
            const { label, min, max, step, value, decimals = 0, onChange } = config;
            this.params[key] = value;
            if (onChange) this.callbacks[key] = onChange;

            const row = document.createElement('div');
            row.className = 'ctrl-row';
            row.dataset.key = key;
            row.innerHTML = `
                <label class="ctrl-label">${label}</label>
                <div class="ctrl-stepper">
                    <button class="ctrl-stepper-btn" data-action="dec">−</button>
                    <input type="text" class="ctrl-value-input" value="${formatValue(value, decimals)}">
                    <button class="ctrl-stepper-btn" data-action="inc">+</button>
                </div>
            `;

            const input = row.querySelector('input');
            const decBtn = row.querySelector('[data-action="dec"]');
            const incBtn = row.querySelector('[data-action="inc"]');

            const updateValue = (newVal) => {
                newVal = clamp(newVal, min, max);
                const factor = Math.pow(10, decimals);
                newVal = Math.round(newVal * factor) / factor;
                this.params[key] = newVal;
                input.value = formatValue(newVal, decimals);
                if (this.callbacks[key]) this.callbacks[key](newVal, key);
            };

            decBtn.addEventListener('click', () => updateValue(this.params[key] - step));
            incBtn.addEventListener('click', () => updateValue(this.params[key] + step));

            // Long-press for continuous change
            let holdInterval = null;
            const startHold = (delta) => {
                holdInterval = setInterval(() => updateValue(this.params[key] + delta), 100);
            };
            const stopHold = () => { if (holdInterval) { clearInterval(holdInterval); holdInterval = null; } };

            [decBtn, incBtn].forEach((btn, i) => {
                const delta = i === 0 ? -step : step;
                btn.addEventListener('mousedown', () => { setTimeout(() => { if (btn.matches(':active')) startHold(delta); }, 300); });
                btn.addEventListener('mouseup', stopHold);
                btn.addEventListener('mouseleave', stopHold);
                btn.addEventListener('touchstart', () => { setTimeout(() => startHold(delta), 300); }, { passive: true });
                btn.addEventListener('touchend', stopHold);
            });

            input.addEventListener('input', () => {
                const parsed = parseFloat(input.value);
                if (!isNaN(parsed)) updateValue(parsed);
            });
            input.addEventListener('blur', () => {
                // Bei Blur: Falls ungültig, zurücksetzen
                const parsed = parseFloat(input.value);
                if (isNaN(parsed)) input.value = formatValue(this.params[key], decimals);
            });

            this.bodyEl.appendChild(row);
            return this;
        }

        /**
         * Add a range slider row
         */
        addRange(key, config) {
            const { label, min, max, step, value, decimals = 0, onChange } = config;
            this.params[key] = value;
            if (onChange) this.callbacks[key] = onChange;

            const row = document.createElement('div');
            row.className = 'ctrl-row';
            row.dataset.key = key;
            row.innerHTML = `
                <label class="ctrl-label">${label}</label>
                <input type="range" class="ctrl-range" min="${min}" max="${max}" step="${step}" value="${value}">
                <span class="ctrl-value-display">${formatValue(value, decimals)}</span>
            `;

            const range = row.querySelector('input');
            const display = row.querySelector('.ctrl-value-display');

            range.addEventListener('input', () => {
                const val = parseFloat(range.value);
                this.params[key] = val;
                display.textContent = formatValue(val, decimals);
                if (this.callbacks[key]) this.callbacks[key](val, key);
            });

            this.bodyEl.appendChild(row);
            return this;
        }

        /**
         * Add a toggle button row
         */
        addToggle(key, config) {
            const { label, value = false, labelOn = 'An', labelOff = 'Aus', onChange } = config;
            this.params[key] = value;
            if (onChange) this.callbacks[key] = onChange;

            const row = document.createElement('div');
            row.className = 'ctrl-row';
            row.dataset.key = key;
            row.innerHTML = `
                <label class="ctrl-label">${label}</label>
                <button class="ctrl-toggle ${value ? 'active' : ''}">${value ? labelOn : labelOff}</button>
            `;

            const btn = row.querySelector('button');
            btn.addEventListener('click', () => {
                this.params[key] = !this.params[key];
                btn.classList.toggle('active', this.params[key]);
                btn.textContent = this.params[key] ? labelOn : labelOff;
                if (this.callbacks[key]) this.callbacks[key](this.params[key], key);
            });

            this.bodyEl.appendChild(row);
            return this;
        }

        /**
         * Add a select dropdown row
         */
        addSelect(key, config) {
            const { label, options, value, onChange } = config;
            this.params[key] = value;
            if (onChange) this.callbacks[key] = onChange;

            const row = document.createElement('div');
            row.className = 'ctrl-row';
            row.dataset.key = key;

            const optionsHtml = options.map(opt => {
                const val = typeof opt === 'object' ? opt.value : opt;
                const text = typeof opt === 'object' ? opt.label : opt;
                const selected = val === value ? 'selected' : '';
                return `<option value="${val}" ${selected}>${text}</option>`;
            }).join('');

            row.innerHTML = `
                <label class="ctrl-label">${label}</label>
                <select class="ctrl-select">${optionsHtml}</select>
            `;

            const select = row.querySelector('select');
            select.addEventListener('change', () => {
                this.params[key] = select.value;
                if (this.callbacks[key]) this.callbacks[key](select.value, key);
            });

            this.bodyEl.appendChild(row);
            return this;
        }

        /**
         * Add a text input row (textarea for multiline, resizable)
         */
        addText(key, config) {
            const { label, value = '', placeholder = '', onChange } = config;
            this.params[key] = value;
            if (onChange) this.callbacks[key] = onChange;

            const row = document.createElement('div');
            row.className = 'ctrl-row';
            row.dataset.key = key;
            row.innerHTML = `
                <label class="ctrl-label">${label}</label>
                <textarea class="ctrl-textarea" placeholder="${placeholder}">${value}</textarea>
            `;

            const textarea = row.querySelector('textarea');
            textarea.addEventListener('input', () => {
                this.params[key] = textarea.value;
                if (this.callbacks[key]) this.callbacks[key](textarea.value, key);
            });

            this.bodyEl.appendChild(row);
            return this;
        }

        /**
         * Add a divider line
         */
        addDivider() {
            const div = document.createElement('div');
            div.className = 'ctrl-divider';
            this.bodyEl.appendChild(div);
            return this;
        }

        /**
         * Get current value of a param
         */
        get(key) {
            return this.params[key];
        }

        /**
         * Set value of a param programmatically
         */
        set(key, value) {
            this.params[key] = value;
            // Could update UI here if needed
            return this;
        }

        /**
         * Show or hide a row by its key
         * @param {string} key - The param key
         * @param {boolean} visible - Whether the row should be visible
         */
        setRowVisibility(key, visible) {
            const row = this.bodyEl.querySelector(`[data-key="${key}"]`);
            if (row) {
                row.style.display = visible ? '' : 'none';
            }
            return this;
        }

        /**
         * Remove the panel from DOM
         */
        destroy() {
            if (this.el && this.el.parentNode) {
                this.el.parentNode.removeChild(this.el);
            }
        }
    }

    // === PUBLIC API ===
    window.Controls = {
        /**
         * Create a new control panel
         * @param {Object} options - Panel options
         * @returns {ControlPanel}
         */
        createPanel(options) {
            return new ControlPanel(options);
        },

        /**
         * Inject CSS manually (auto-called on panel creation)
         */
        injectCSS
    };

})();

