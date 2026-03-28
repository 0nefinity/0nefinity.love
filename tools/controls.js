/**
 * 0ne-UI Controls Library
 * Generalisierte UI-Komponenten fÃ¼r Settings-Panels (Desktop + Mobile)
 *
 * USAGE EXAMPLE (compact one-liner style - preferred!):
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 *   const panel = Controls.createPanel({ position: 'left' });
 *
 *   // Header buttons (appear in top-right of panel header)
 *   panel.addPauseButton({ paused: config.paused, onChange: v => config.paused = v });
 *   panel.addResetButton({ icon: 'â†º', title: 'Reset', onClick: () => reset() });
 *
 *   // Metrics overlay (appears ABOVE the panel)
 *   panel.addMetricsOverlay('stats', { label: '', showFps: true, pixiApp: app, getData: () => ({ items: [...], total: n }) });
 *
 *   // Controls (use compact one-liners for readability!)
 *   panel
 *       .addText('name',    { label: 'Name',   value: config.name, placeholder: 'Enter...', onChange: v => config.name = v })
 *       .addDivider()
 *       .addToggle('active', { label: 'Active', value: config.active, onChange: v => config.active = v })
 *       .addDivider()
 *       .addSlider('speed',   { label: 'Speed',  min: 0, max: 100, step: 1, value: config.speed, decimals: 0, onChange: v => config.speed = v })
 *       .addSlider('opacity', { label: 'Alpha',  min: 0, max: 1,   step: 0.01, value: config.opacity, decimals: 2, onChange: v => config.opacity = v })
 *       .addDivider()
 *       .addSlider('count', { label: 'Count',  min: 1, max: 10, step: 1, value: config.count, onChange: v => config.count = v })
 *   ;
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 */

(function () {
    'use strict';

    // Shared styles live in meta.css
    function injectCSS() {
        if (!document.getElementById('ctrl-panel-fonts')) {
            const link = document.createElement('link');
            link.id = 'ctrl-panel-fonts';
            link.rel = 'stylesheet';
            link.href = '/tools/fonts/fonts.css';
            document.head.appendChild(link);
        }
    }

    // === UTILITY FUNCTIONS ===

    function clamp(val, min, max) {
        return Math.max(min, Math.min(max, val));
    }

    function formatValue(val, decimals) {
        return Number(val).toFixed(decimals);
    }

    function parseNumericValue(value) {
        if (typeof value === 'number') {
            return Number.isFinite(value) ? value : NaN;
        }

        const normalized = String(value ?? '')
            .trim()
            .replace(',', '.');

        if (!normalized || normalized === '-' || normalized === '.' || normalized === '-.') {
            return NaN;
        }

        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : NaN;
    }

    function countFractionDigits(value) {
        if (!Number.isFinite(value)) return 0;

        const stringValue = String(Math.abs(value)).toLowerCase();
        if (stringValue.includes('e')) {
            const [coefficient, exponentRaw] = stringValue.split('e');
            const exponent = parseInt(exponentRaw, 10);
            const decimalDigits = (coefficient.split('.')[1] || '').length;
            return exponent >= 0
                ? Math.max(0, decimalDigits - exponent)
                : decimalDigits + Math.abs(exponent);
        }

        return (stringValue.split('.')[1] || '').length;
    }

    function getSliderDecimals(config, fallback = 0) {
        const stepValue = Number.isFinite(config?.step) ? Math.abs(config.step) : NaN;
        if (stepValue > 0) return countFractionDigits(stepValue);

        const baseDecimals = Number.isFinite(config?.baseDecimals)
            ? Math.max(0, config.baseDecimals)
            : Math.max(0, fallback);
        return baseDecimals;
    }

    function syncSliderDecimals(config, fallback = 0) {
        const nextDecimals = getSliderDecimals(config, fallback);
        if (config) config.decimals = nextDecimals;
        return nextDecimals;
    }

    function getCurrentSliderDecimals(config, fallback = 0) {
        if (Number.isFinite(config?.decimals)) {
            return Math.max(0, config.decimals);
        }
        return syncSliderDecimals(config, fallback);
    }

    function getDecimalConstructor() {
        if (typeof globalThis !== 'undefined' && typeof globalThis.Decimal === 'function') {
            return globalThis.Decimal;
        }
        return null;
    }

    function preciseNormalize(value, decimals = null) {
        const parsed = parseNumericValue(value);
        if (Number.isNaN(parsed)) return NaN;

        const DecimalCtor = getDecimalConstructor();
        if (DecimalCtor) {
            let decimalValue = new DecimalCtor(parsed);
            if (Number.isFinite(decimals)) {
                decimalValue = decimalValue.toDecimalPlaces(Math.max(0, decimals));
            }
            return Number(decimalValue.toString());
        }

        if (!Number.isFinite(decimals)) return parsed;
        const places = Math.max(0, decimals);
        const factor = Math.pow(10, places);
        return Math.round(parsed * factor) / factor;
    }

    function preciseAdd(a, b, decimals = null) {
        const left = parseNumericValue(a);
        const right = parseNumericValue(b);
        if (Number.isNaN(left) || Number.isNaN(right)) return NaN;

        const DecimalCtor = getDecimalConstructor();
        if (DecimalCtor) {
            let result = new DecimalCtor(left).add(new DecimalCtor(right));
            if (Number.isFinite(decimals)) {
                result = result.toDecimalPlaces(Math.max(0, decimals));
            }
            return Number(result.toString());
        }

        const places = Number.isFinite(decimals)
            ? Math.max(0, decimals)
            : Math.max(countFractionDigits(left), countFractionDigits(right));
        const factor = Math.pow(10, places);
        return (Math.round(left * factor) + Math.round(right * factor)) / factor;
    }

    function preciseScaleByTen(value, direction) {
        const numericValue = parseNumericValue(value);
        if (Number.isNaN(numericValue)) return NaN;

        const sign = numericValue < 0 ? -1 : 1;
        const magnitude = Math.abs(numericValue);
        if (!(magnitude > 0)) {
            return direction > 0 ? 0.1 : 0.01;
        }

        const DecimalCtor = getDecimalConstructor();
        if (DecimalCtor) {
            const scaled = direction > 0
                ? new DecimalCtor(magnitude).mul(10)
                : new DecimalCtor(magnitude).div(10);
            return Number(scaled.mul(sign).toString());
        }

        const nextDecimals = direction > 0
            ? Math.max(0, countFractionDigits(magnitude) - 1)
            : countFractionDigits(magnitude) + 1;
        const scaled = direction > 0 ? magnitude * 10 : magnitude / 10;
        return sign * preciseNormalize(scaled, nextDecimals);
    }

    function getProjectedSliderBounds(config, fallbackValue = 0) {
        const safeFallback = Number.isFinite(fallbackValue) ? fallbackValue : 0;
        let min = Number.isFinite(config?.min) ? config.min : safeFallback;
        let max = Number.isFinite(config?.max) ? config.max : safeFallback;

        if (min > max) {
            [min, max] = [max, min];
        }

        return { min, max };
    }

    function getProjectedSliderStep(step) {
        return Number.isFinite(step) && step > 0 ? String(step) : 'any';
    }

    function scaleStepLogarithmically(step, direction) {
        return preciseScaleByTen(step, direction);
    }

    function getConfigRangeDelta(config) {
        const stepMagnitude = Math.abs(Number(config?.step));
        return stepMagnitude > 0 ? preciseScaleByTen(stepMagnitude, 1) : 1;
    }

    function getThemeColor(variableName, fallback = '') {
        return getComputedStyle(document.documentElement).getPropertyValue(variableName).trim() || fallback;
    }

    function colorToHex(color, fallback = '#000000') {
        const probe = document.createElement('span');
        probe.style.position = 'absolute';
        probe.style.visibility = 'hidden';
        probe.style.pointerEvents = 'none';
        probe.style.color = fallback;
        probe.style.color = color || fallback;
        (document.body || document.documentElement).appendChild(probe);
        const resolved = getComputedStyle(probe).color;
        probe.remove();

        const match = resolved.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
        if (!match) return fallback;

        return '#' + [match[1], match[2], match[3]]
            .map((value) => Number(value).toString(16).padStart(2, '0'))
            .join('');
    }

    function isMobile() {
        return window.innerWidth <= 768;
    }

    function getTargetElement(target) {
        if (target instanceof Element) return target;
        if (target && 'parentElement' in target) return target.parentElement || null;
        return null;
    }

    function bindResponsiveButtonActivation(button, handler, options = {}) {
        if (!button || typeof handler !== 'function') return;

        const { stopPropagation = true } = options;
        let suppressClickUntil = 0;

        const invoke = (event) => {
            if (button.disabled) return;
            if (stopPropagation) event.stopPropagation();
            handler(event);
	            if (typeof button.blur === 'function') {
	                requestAnimationFrame(() => button.blur());
	            }
        };

        const invokeImmediate = (event) => {
            const now = Date.now();
            suppressClickUntil = now + 350;
            event.preventDefault?.();
            invoke(event);
        };

        button.addEventListener('pointerdown', (event) => {
            if (event.pointerType === 'mouse') return;
            invokeImmediate(event);
        });

        button.addEventListener('touchstart', (event) => {
            if (stopPropagation) event.stopPropagation();
        }, { passive: true });

        button.addEventListener('touchend', (event) => {
            if (!window.PointerEvent) {
                invokeImmediate(event);
                return;
            }

            if (stopPropagation) event.stopPropagation();
            event.preventDefault();
        }, { passive: false });

        button.addEventListener('click', (event) => {
            if (suppressClickUntil > Date.now()) {
                if (stopPropagation) event.stopPropagation();
                event.preventDefault();
                return;
            }
            invoke(event);
        });
    }

    function getViewportMetrics() {
        const visualViewport = window.visualViewport;
        const layoutWidth = Math.max(document.documentElement?.clientWidth || 0, window.innerWidth || 0, 1);
        const layoutHeight = Math.max(document.documentElement?.clientHeight || 0, window.innerHeight || 0, 1);
        const width = Math.max(1, visualViewport?.width || window.innerWidth || layoutWidth);
        const height = Math.max(1, visualViewport?.height || window.innerHeight || layoutHeight);
        const offsetLeft = Math.max(0, visualViewport?.offsetLeft || 0);
        const offsetTop = Math.max(0, visualViewport?.offsetTop || 0);
        const bottomInset = Math.max(0, layoutHeight - (offsetTop + height));
        const rightInset = Math.max(0, layoutWidth - (offsetLeft + width));

        return {
            layoutWidth,
            layoutHeight,
            width,
            height,
            offsetLeft,
            offsetTop,
            bottomInset,
            rightInset
        };
    }

    // === PANEL CLASS ===
    class ControlPanel {
        constructor(options = {}) {
	            const requestedPosition = options.position || 'left';
	            const normalizedPosition = requestedPosition === 'right' ? 'left' : requestedPosition;
            this.options = {
                id: options.id || 'ctrl-panel-' + Date.now(),
                parent: options.parent || document.body,
	                position: normalizedPosition, // 'center', 'left'
                draggable: options.draggable !== false,
                // Mobile: Element das sich mit dem Panel mitbewegt (wie in 0neSlider)
                mobileContentElement: options.mobileContentElement || null,
                mobileContentMaxOffset: options.mobileContentMaxOffset || 12, // vh
	                mobileInitialOpenMode: options.mobileInitialOpenMode || 'content-capped',
	                mobileInitialOpenMaxViewportFraction: Number.isFinite(Number(options.mobileInitialOpenMaxViewportFraction))
	                    ? Number(options.mobileInitialOpenMaxViewportFraction)
	                    : (1 / 3),
                ...options
            };
	            this.options.position = normalizedPosition;
            if (options.mobileCanvasOcclusion == null) {
                this.options.mobileCanvasOcclusion = !this.options.mobileContentElement;
            }
            this.params = {};
            this.callbacks = {};
            this._sliderConfigs = {};  // Speichert Original-Konfiguration pro Key fÃ¼r Config-MenÃ¼
            this.el = null;
            this.headerEl = null;
            this.bodyEl = null;
            this._isDragging = false;
            this._dragStart = { x: 0, y: 0 };
            this._panelStart = { x: 0, y: 0 };
            this._mobileY = 0;
            this._sections = {};
            this._currentContainer = null; // Will be set to bodyEl in _create
            this._activeConfigKey = null; // Aktuell geÃ¶ffnetes Config-MenÃ¼
            this._selectControls = {};
            this._selectPopupEl = null;
            this._activeSelectKey = null;
            this._countPickerControls = {};
            this._countPickerPopupEl = null;
            this._activeCountPickerKey = null;
            this._mobileSheetResizeObserver = null;
            this._bodyMutationObserver = null;
            this._handleMobileSheetResize = null;
            this._handleMobileViewportChange = null;
            this._applyMobileSheetPosition = null;
            this._refreshMobileSheetLayout = null;
	            this._mobileSheetPositionInitialized = false;
	            this._mobileInitialLayoutFrame = 0;
	            this._mobileLastOpenY = 0;
	            this._mobileDefaultOpenY = 0;
		            this._mobileLastOpenVisibleHeight = 0;
		            this._mobileDefaultOpenVisibleHeight = 0;
	            this._mobileLayoutChangeFrame = 0;
	            this._mobileLayoutChangeTimeout = 0;
	            this._layoutUpdateQueued = false;
	            this._desktopFrame = null;
	            this._responsiveMode = isMobile() ? 'mobile' : 'desktop';
	            this._barModeBeforeMobile = false;
            this._handleSelectDocumentClick = (e) => {
                const popup = this._selectPopupEl;
                if (!popup || !popup.classList.contains('open')) return;
                if (popup.contains(e.target)) return;

                const activeControl = this._selectControls[this._activeSelectKey];
                if (activeControl?.triggerEl?.contains(e.target)) return;

                this._closeSelectPopup();
            };
            this._handleCountPickerDocumentClick = (e) => {
                const popup = this._countPickerPopupEl;
                if (!popup || !popup.classList.contains('open')) return;
                if (popup.contains(e.target)) return;

                const activeControl = this._countPickerControls[this._activeCountPickerKey];
                if (activeControl?.triggerEl?.contains(e.target)) return;

                this._closeCountPickerPopup();
            };
            this._handleSelectViewportChange = () => {
                if (this._activeSelectKey) this._closeSelectPopup();
                if (this._activeCountPickerKey) this._closeCountPickerPopup();
            };

            this._create();
        }

        _areSelectValuesEqual(a, b) {
            if (a === b) return true;
            if (a == null || b == null) return false;
            return String(a) === String(b);
        }

        _normalizeSelectOptions(options = []) {
            return options.map((opt) => {
                if (typeof opt === 'object' && opt !== null) {
                    return {
                        value: opt.value,
                        label: opt.label ?? String(opt.value ?? '')
                    };
                }

                return {
                    value: opt,
                    label: String(opt ?? '')
                };
            });
        }

        _normalizeCountPickerOptions(options = []) {
            return options
                .map((opt) => {
                    if (typeof opt === 'object' && opt !== null) {
                        const min = Number.isFinite(Number(opt.min)) ? Number(opt.min) : 0;
                        const max = Number.isFinite(Number(opt.max)) ? Number(opt.max) : Infinity;
                        const step = Number.isFinite(Number(opt.step)) && Number(opt.step) > 0 ? Number(opt.step) : 1;
                        return {
                            value: opt.value,
                            label: opt.label ?? String(opt.value ?? ''),
                            min: Math.max(0, min),
                            max: Math.max(min, max),
                            step
                        };
                    }

                    return {
                        value: opt,
                        label: String(opt ?? ''),
                        min: 0,
                        max: Infinity,
                        step: 1
                    };
                })
                .filter((opt) => opt.value != null);
        }

        _sanitizeCountPickerValue(options = [], value = {}) {
            const normalized = {};
            const source = value && typeof value === 'object' ? value : {};

            options.forEach((opt) => {
                const rawValue = source[opt.value];
                const numericValue = Number(rawValue);
                const nextValue = Number.isFinite(numericValue)
                    ? clamp(Math.round(numericValue), opt.min ?? 0, Number.isFinite(opt.max) ? opt.max : numericValue)
                    : 0;
                if (nextValue > 0) normalized[opt.value] = nextValue;
            });

            return normalized;
        }

        _findSelectOption(options, value) {
            return options.find((opt) => this._areSelectValuesEqual(opt.value, value)) || null;
        }

        _getSelectPopup() {
            if (this._selectPopupEl) return this._selectPopupEl;

            const popup = document.createElement('div');
            popup.className = 'ctrl-select-popup';
            popup.setAttribute('role', 'listbox');
            popup.addEventListener('click', (e) => e.stopPropagation());
            popup.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    this._closeSelectPopup(true);
                    return;
                }

                if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;

                const options = [...popup.querySelectorAll('.ctrl-select-option')];
                if (!options.length) return;

                e.preventDefault();
                const currentIndex = options.indexOf(document.activeElement);
                const delta = e.key === 'ArrowDown' ? 1 : -1;
                const nextIndex = currentIndex < 0
                    ? 0
                    : (currentIndex + delta + options.length) % options.length;

                options[nextIndex].focus();
            });

            document.body.appendChild(popup);
            document.addEventListener('click', this._handleSelectDocumentClick);
            this._selectPopupEl = popup;
            return popup;
        }

        _closeSelectPopup(focusTrigger = false) {
            const activeKey = this._activeSelectKey;
            const activeControl = activeKey ? this._selectControls[activeKey] : null;

            if (activeControl?.triggerEl) {
                activeControl.triggerEl.classList.remove('open');
                activeControl.triggerEl.setAttribute('aria-expanded', 'false');
                if (focusTrigger) activeControl.triggerEl.focus();
            }

            if (this._selectPopupEl) {
                this._selectPopupEl.classList.remove('open');
                this._selectPopupEl.style.visibility = '';
                this._selectPopupEl.style.left = '';
                this._selectPopupEl.style.top = '';
                this._selectPopupEl.style.width = '';
                this._selectPopupEl.innerHTML = '';
            }

            this._activeSelectKey = null;
        }

        _updateSelectUI(key, value) {
            const control = this._selectControls[key];
            if (!control) return;

            const match = this._findSelectOption(control.options, value);
            const label = match ? match.label : String(value ?? '');

            control.valueEl.textContent = label;
            control.triggerEl.title = label;
            control.triggerEl.dataset.value = match ? String(match.value ?? '') : '';

            if (this._activeSelectKey === key && this._selectPopupEl?.classList.contains('open')) {
                this._renderSelectPopup(control);
            }
        }

        _renderSelectPopup(control) {
            const popup = this._getSelectPopup();
            popup.innerHTML = '';
            popup.setAttribute('aria-label', control.label || 'Auswahl');

            control.options.forEach((opt) => {
                const isSelected = this._areSelectValuesEqual(opt.value, this.params[control.key]);
                const optionBtn = document.createElement('button');
                optionBtn.type = 'button';
                optionBtn.className = 'ctrl-select-option' + (isSelected ? ' selected' : '');
                optionBtn.textContent = opt.label;
                optionBtn.setAttribute('role', 'option');
                optionBtn.setAttribute('aria-selected', isSelected ? 'true' : 'false');
                optionBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const hasChanged = !this._areSelectValuesEqual(this.params[control.key], opt.value);
                    this.params[control.key] = opt.value;
                    this._updateSelectUI(control.key, opt.value);
                    this._closeSelectPopup(true);

                    if (hasChanged && this.callbacks[control.key]) {
                        this.callbacks[control.key](opt.value, control.key);
                    }
                });

                popup.appendChild(optionBtn);
            });
        }

        _openSelectPopup(key, triggerEl) {
            const control = this._selectControls[key];
            if (!control) return;

            if (this._activeSelectKey === key && this._selectPopupEl?.classList.contains('open')) {
                this._closeSelectPopup(true);
                return;
            }

            this._closeSelectPopup();
            this._closeCountPickerPopup();
            const configPopup = document.getElementById('ctrl-global-config-popup');
            if (configPopup) configPopup.classList.remove('open');

            this._activeSelectKey = key;
            this._renderSelectPopup(control);

            const popup = this._getSelectPopup();
            const triggerRect = triggerEl.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const horizontalInset = isMobile() ? 8 : 6;
            const targetWidth = isMobile()
                ? triggerRect.width
                : Math.max(triggerRect.width, 160);
            const popupWidthTarget = Math.min(targetWidth, viewportWidth - horizontalInset * 2);

            popup.style.width = `${popupWidthTarget}px`;
            popup.style.visibility = 'hidden';
            popup.classList.add('open');

            const popupWidth = popup.offsetWidth || popupWidthTarget;
            const popupHeight = popup.offsetHeight || 180;

            let left = clamp(triggerRect.left, horizontalInset, Math.max(horizontalInset, viewportWidth - popupWidth - horizontalInset));
            let top = triggerRect.bottom + 4;

            const spaceBelow = viewportHeight - triggerRect.bottom - 6;
            const spaceAbove = triggerRect.top - 6;
            if (spaceBelow < popupHeight && spaceAbove > spaceBelow) {
                top = Math.max(6, triggerRect.top - popupHeight - 4);
            } else {
                top = clamp(top, 6, Math.max(6, viewportHeight - popupHeight - 6));
            }

            popup.style.left = `${left}px`;
            popup.style.top = `${top}px`;
            popup.style.visibility = '';

            triggerEl.classList.add('open');
            triggerEl.setAttribute('aria-expanded', 'true');

            requestAnimationFrame(() => {
                const selectedOption = popup.querySelector('.ctrl-select-option.selected') || popup.querySelector('.ctrl-select-option');
                selectedOption?.focus();
            });
        }

        _getCountPickerPopup() {
            if (this._countPickerPopupEl) return this._countPickerPopupEl;

            const popup = document.createElement('div');
            popup.className = 'ctrl-select-popup ctrl-count-picker-popup';
            popup.setAttribute('role', 'dialog');
            popup.addEventListener('click', (e) => e.stopPropagation());
            popup.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    this._closeCountPickerPopup(true);
                }
            });

            document.body.appendChild(popup);
            document.addEventListener('click', this._handleCountPickerDocumentClick);
            this._countPickerPopupEl = popup;
            return popup;
        }

        _closeCountPickerPopup(focusTrigger = false) {
            const activeKey = this._activeCountPickerKey;
            const activeControl = activeKey ? this._countPickerControls[activeKey] : null;

            if (activeControl?.triggerEl) {
                activeControl.triggerEl.classList.remove('open');
                activeControl.triggerEl.setAttribute('aria-expanded', 'false');
                if (focusTrigger) activeControl.triggerEl.focus();
            }

            if (this._countPickerPopupEl) {
                this._countPickerPopupEl.classList.remove('open');
                this._countPickerPopupEl.style.visibility = '';
                this._countPickerPopupEl.style.left = '';
                this._countPickerPopupEl.style.top = '';
                this._countPickerPopupEl.style.width = '';
                this._countPickerPopupEl.innerHTML = '';
            }

            this._activeCountPickerKey = null;
        }

        _getCountPickerSummary(control, value) {
            if (typeof control.summaryFormatter === 'function') {
                const custom = control.summaryFormatter({
                    value,
                    options: control.options,
                    key: control.key,
                    label: control.label
                });
                if (typeof custom === 'string' && custom.trim()) return custom.trim();
            }

            const activeLabels = control.options
                .filter((opt) => Number(value?.[opt.value] || 0) > 0)
                .map((opt) => {
                    const count = Number(value?.[opt.value] || 0);
                    return count > 1 ? `${count}× ${opt.label}` : opt.label;
                });

            if (!activeLabels.length) return control.emptyLabel || 'nichts ausgewählt';
            return activeLabels.join(', ');
        }

        _updateCountPickerUI(key, value = this.params[key], { rerenderPopup = true } = {}) {
            const control = this._countPickerControls[key];
            if (!control) return;

            const safeValue = this._sanitizeCountPickerValue(control.options, value);
            this.params[key] = safeValue;

            const summary = this._getCountPickerSummary(control, safeValue);
            control.valueEl.textContent = summary;
            control.triggerEl.title = summary;
            control.triggerEl.dataset.value = summary;

            if (rerenderPopup && this._activeCountPickerKey === key && this._countPickerPopupEl?.classList.contains('open')) {
                this._renderCountPickerPopup(control);
            }
        }

        _updateCountPickerOptionControls({ decBtn, valueEl, incBtn, count, min = 0, max = Infinity }) {
            if (valueEl) valueEl.textContent = String(Math.max(0, Math.round(Number(count) || 0)));
            if (decBtn) decBtn.disabled = count <= min;
            if (incBtn) incBtn.disabled = count >= max;
        }

        _renderCountPickerPopup(control) {
            const popup = this._getCountPickerPopup();
            popup.innerHTML = '';
            popup.setAttribute('aria-label', control.label || 'Mehrfachauswahl');

            if (!control.options.length) {
                const emptyEl = document.createElement('div');
                emptyEl.className = 'ctrl-count-picker-empty';
                emptyEl.textContent = control.emptyPopupLabel || 'keine optionen';
                popup.appendChild(emptyEl);
                return;
            }

            const currentValue = this.params[control.key] || {};

            control.options.forEach((opt) => {
                const row = document.createElement('div');
                row.className = 'ctrl-count-picker-option';

                const labelEl = document.createElement('span');
                labelEl.className = 'ctrl-count-picker-option-label';
                labelEl.textContent = opt.label;

                const controlsEl = document.createElement('div');
                controlsEl.className = 'ctrl-count-picker-option-controls';

                const decBtn = document.createElement('button');
                decBtn.type = 'button';
                decBtn.className = 'ctrl-count-picker-option-stepper';
                decBtn.textContent = '−';
                decBtn.setAttribute('aria-label', `${opt.label} verringern`);

                const valueEl = document.createElement('span');
                valueEl.className = 'ctrl-count-picker-option-value';
                const currentCount = Math.max(0, Math.round(Number(currentValue?.[opt.value] || 0)));
                valueEl.textContent = String(currentCount);

                const incBtn = document.createElement('button');
                incBtn.type = 'button';
                incBtn.className = 'ctrl-count-picker-option-stepper';
                incBtn.textContent = '+';
                incBtn.setAttribute('aria-label', `${opt.label} erhöhen`);

                const min = Number.isFinite(opt.min) ? opt.min : 0;
                const max = Number.isFinite(opt.max) ? opt.max : Infinity;
                const step = Number.isFinite(opt.step) && opt.step > 0 ? opt.step : 1;
                decBtn.disabled = currentCount <= min;
                incBtn.disabled = currentCount >= max;

                const applyDelta = (delta) => {
                    const activeValue = this.params[control.key] || {};
                    const previous = Math.max(0, Math.round(Number(activeValue?.[opt.value] || 0)));
                    const next = clamp(previous + delta * step, min, Number.isFinite(max) ? max : previous + delta * step);
                    if (next === previous) return;

                    const nextValue = { ...activeValue };
                    if (next > 0) nextValue[opt.value] = next;
                    else delete nextValue[opt.value];

                    this.params[control.key] = this._sanitizeCountPickerValue(control.options, nextValue);
                    this._updateCountPickerOptionControls({ decBtn, valueEl, incBtn, count: next, min, max });
                    this._updateCountPickerUI(control.key, this.params[control.key], { rerenderPopup: false });

                    if (this.callbacks[control.key]) {
                        requestAnimationFrame(() => {
                            this.callbacks[control.key](this.params[control.key], control.key, {
                                option: opt,
                                count: next
                            });
                        });
                    }
                };

                bindResponsiveButtonActivation(decBtn, () => applyDelta(-1));
                bindResponsiveButtonActivation(incBtn, () => applyDelta(1));

                controlsEl.appendChild(decBtn);
                controlsEl.appendChild(valueEl);
                controlsEl.appendChild(incBtn);
                row.appendChild(labelEl);
                row.appendChild(controlsEl);
                popup.appendChild(row);
            });
        }

        _openCountPickerPopup(key, triggerEl) {
            const control = this._countPickerControls[key];
            if (!control) return;

            if (this._activeCountPickerKey === key && this._countPickerPopupEl?.classList.contains('open')) {
                this._closeCountPickerPopup(true);
                return;
            }

            this._closeCountPickerPopup();
            this._closeSelectPopup();
            const configPopup = document.getElementById('ctrl-global-config-popup');
            if (configPopup) configPopup.classList.remove('open');

            this._activeCountPickerKey = key;
            this._renderCountPickerPopup(control);

            const popup = this._getCountPickerPopup();
            const triggerRect = triggerEl.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const horizontalInset = isMobile() ? 8 : 6;
            const targetWidth = isMobile()
                ? triggerRect.width
                : Math.max(triggerRect.width, 220);
            const popupWidthTarget = Math.min(targetWidth, viewportWidth - horizontalInset * 2);

            popup.style.width = `${popupWidthTarget}px`;
            popup.style.visibility = 'hidden';
            popup.classList.add('open');

            const popupWidth = popup.offsetWidth || popupWidthTarget;
            const popupHeight = popup.offsetHeight || 220;

            const left = clamp(triggerRect.left, horizontalInset, Math.max(horizontalInset, viewportWidth - popupWidth - horizontalInset));
            const spaceBelow = viewportHeight - triggerRect.bottom - 6;
            const spaceAbove = triggerRect.top - 6;
            let top = triggerRect.bottom + 4;

            if (spaceBelow < popupHeight && spaceAbove > spaceBelow) {
                top = Math.max(6, triggerRect.top - popupHeight - 4);
            } else {
                top = clamp(top, 6, Math.max(6, viewportHeight - popupHeight - 6));
            }

            popup.style.left = `${left}px`;
            popup.style.top = `${top}px`;
            popup.style.visibility = '';

            triggerEl.classList.add('open');
            triggerEl.setAttribute('aria-expanded', 'true');

            requestAnimationFrame(() => {
                const firstButton = popup.querySelector('.ctrl-count-picker-option-stepper:not(:disabled)') || popup.querySelector('.ctrl-count-picker-option-stepper');
                firstButton?.focus();
            });
        }

        // Globales Config-Popup erstellen (singleton)
        _getGlobalConfigPopup() {
            let popup = document.getElementById('ctrl-global-config-popup');
            if (!popup) {
                popup = document.createElement('div');
                popup.id = 'ctrl-global-config-popup';
                popup.className = 'ctrl-config-popup';
                popup.style.position = 'fixed';
                document.body.appendChild(popup);

                // Click auÃŸerhalb schlieÃŸt Popup
                document.addEventListener('click', (e) => {
                    const targetEl = getTargetElement(e.target);
                    if (!popup.contains(e.target) && !targetEl?.closest('.ctrl-config-trigger')) {
                        this._closeConfigPopup();
                    }
                });
            }
            return popup;
        }

        _closeConfigPopup() {
            const popup = document.getElementById('ctrl-global-config-popup');
            if (popup) {
                popup.classList.remove('open');
                popup.style.visibility = '';
            }

            this.bodyEl?.querySelectorAll('.ctrl-config-trigger.open').forEach((trigger) => {
                trigger.classList.remove('open');
                trigger.setAttribute('aria-expanded', 'false');
            });

            this._activeConfigKey = null;
        }

        // Config-Popup Ã¶ffnen fÃ¼r einen bestimmten Slider
        _openConfigPopup(key, triggerEl) {
            const cfg = this._sliderConfigs[key];
            if (!cfg) return;
            this._closeSelectPopup();

            const popup = this._getGlobalConfigPopup();
            const isSamePopupOpen = this._activeConfigKey === key && popup.classList.contains('open');

            if (isSamePopupOpen) {
                this._closeConfigPopup();
                return;
            }

            this._closeConfigPopup();

            // Popup-Inhalt aktualisieren
            popup.innerHTML = `
                <div class="ctrl-config-row">
                    <span class="ctrl-config-label">Min</span>
                    <div class="ctrl-config-input-wrap">
                        <button type="button" class="ctrl-config-arrow" data-config="min" data-direction="down" aria-label="Min verringern">&#9662;</button>
                        <input type="text" class="ctrl-config-input" data-config="min" value="${cfg.min}" inputmode="decimal" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done">
                        <button type="button" class="ctrl-config-arrow" data-config="min" data-direction="up" aria-label="Min erhöhen">&#9652;</button>
                    </div>
                </div>
                <div class="ctrl-config-row">
                    <span class="ctrl-config-label">Max</span>
                    <div class="ctrl-config-input-wrap">
                        <button type="button" class="ctrl-config-arrow" data-config="max" data-direction="down" aria-label="Max verringern">&#9662;</button>
                        <input type="text" class="ctrl-config-input" data-config="max" value="${cfg.max}" inputmode="decimal" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done">
                        <button type="button" class="ctrl-config-arrow" data-config="max" data-direction="up" aria-label="Max erhöhen">&#9652;</button>
                    </div>
                </div>
                <div class="ctrl-config-row">
                    <span class="ctrl-config-label">Step</span>
                    <div class="ctrl-config-input-wrap">
                        <button type="button" class="ctrl-config-arrow" data-config="step" data-direction="down" aria-label="Step verkleinern">&#9662;</button>
                        <input type="text" class="ctrl-config-input" data-config="step" value="${cfg.step}" inputmode="decimal" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done">
                        <button type="button" class="ctrl-config-arrow" data-config="step" data-direction="up" aria-label="Step vergrößern">&#9652;</button>
                    </div>
                </div>
                <button class="ctrl-config-reset">Reset</button>
            `;

            const syncConfigInputs = () => {
                popup.querySelectorAll('.ctrl-config-input').forEach((inputEl) => {
                    inputEl.value = String(cfg[inputEl.dataset.config] ?? '');
                });
            };

            const applyConfigValue = (configType, nextValue) => {
                cfg[configType] = nextValue;
                syncSliderDecimals(cfg, cfg.defaultDecimals ?? 0);
                syncConfigInputs();
                this._updateSliderFromConfig(key);
            };

            const nudgeConfigValue = (configType, direction) => {
                if (configType === 'step') {
                    return scaleStepLogarithmically(cfg.step, direction);
                }

                const baseValue = Number.isFinite(cfg[configType]) ? cfg[configType] : 0;
                const delta = getConfigRangeDelta(cfg);
                return preciseAdd(
                    baseValue,
                    direction > 0 ? delta : -delta,
                    Math.max(countFractionDigits(baseValue), countFractionDigits(delta))
                );
            };

            // Event-Handler fÃ¼r Inputs
            popup.querySelectorAll('.ctrl-config-input').forEach(input => {
                const commitInputValue = () => {
                    const configType = input.dataset.config;
                    const newVal = parseNumericValue(input.value);

                    if (Number.isNaN(newVal)) {
                        input.value = String(cfg[configType] ?? '');
                        return;
                    }

                    applyConfigValue(configType, newVal);
                };

                input.addEventListener('change', commitInputValue);
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                        e.preventDefault();
                        const direction = e.key === 'ArrowUp' ? 1 : -1;
                        applyConfigValue(input.dataset.config, nudgeConfigValue(input.dataset.config, direction));
                        input.select();
                    } else if (e.key === 'Enter') {
                        e.preventDefault();
                        input.blur();
                    } else if (e.key === 'Escape') {
                        e.preventDefault();
                        input.value = String(cfg[input.dataset.config] ?? '');
                        input.blur();
                    }
                });
            });

            popup.querySelectorAll('.ctrl-config-arrow').forEach((button) => {
                let repeatTimeout = null;
                let repeatInterval = null;
                let suppressClick = false;

                const triggerArrowNudge = () => {
                    const direction = button.dataset.direction === 'up' ? 1 : -1;
                    applyConfigValue(button.dataset.config, nudgeConfigValue(button.dataset.config, direction));
                };

                const stopArrowRepeat = (pointerId = null) => {
                    if (repeatTimeout) {
                        clearTimeout(repeatTimeout);
                        repeatTimeout = null;
                    }
                    if (repeatInterval) {
                        clearInterval(repeatInterval);
                        repeatInterval = null;
                    }
                    if (pointerId !== null && button.hasPointerCapture?.(pointerId)) {
                        button.releasePointerCapture(pointerId);
                    }
                };

                button.addEventListener('pointerdown', (e) => {
                    e.preventDefault();
                    suppressClick = true;
                    button.setPointerCapture?.(e.pointerId);
                    stopArrowRepeat();
                    triggerArrowNudge();
                    repeatTimeout = setTimeout(() => {
                        repeatInterval = setInterval(triggerArrowNudge, 90);
                    }, 350);
                });

                const finishPointerInteraction = (e) => {
                    stopArrowRepeat(e.pointerId);
                    requestAnimationFrame(() => { suppressClick = false; });
                };

                button.addEventListener('pointerup', finishPointerInteraction);
                button.addEventListener('pointercancel', finishPointerInteraction);
                button.addEventListener('pointerleave', (e) => {
                    if (e.pointerType === 'mouse' && e.buttons === 1) {
                        finishPointerInteraction(e);
                    }
                });

                button.addEventListener('click', (e) => {
                    if (suppressClick) {
                        e.preventDefault();
                        return;
                    }
                    triggerArrowNudge();
                });

                button.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        triggerArrowNudge();
                    }
                });
            });

            // Reset-Button
            popup.querySelector('.ctrl-config-reset').addEventListener('click', () => {
                cfg.min = cfg.defaultMin;
                cfg.max = cfg.defaultMax;
                cfg.step = cfg.defaultStep;
                syncSliderDecimals(cfg, cfg.defaultDecimals ?? 0);
                syncConfigInputs();
                this._updateSliderFromConfig(key);
            });

            // Positionieren
            const triggerRect = triggerEl.getBoundingClientRect();
            const popupWidth = 180;
            const viewportHeight = window.innerHeight;
            const viewportWidth = window.innerWidth;

            let left = triggerRect.right - popupWidth;
            if (left < 5) left = 5;
            if (left + popupWidth > viewportWidth - 5) left = viewportWidth - popupWidth - 5;
            popup.style.left = `${left}px`;

            // Popup anzeigen um HÃ¶he zu messen
            popup.style.visibility = 'hidden';
            popup.classList.add('open');
            const popupHeight = popup.offsetHeight || 150;

            const spaceBelow = viewportHeight - triggerRect.bottom - 5;
            const spaceAbove = triggerRect.top - 5;

            if (spaceBelow >= popupHeight || spaceBelow >= spaceAbove) {
                popup.style.top = `${triggerRect.bottom + 2}px`;
                popup.style.bottom = 'auto';
            } else {
                popup.style.bottom = `${viewportHeight - triggerRect.top + 2}px`;
                popup.style.top = 'auto';
            }

            popup.style.visibility = '';
            triggerEl.classList.add('open');
            triggerEl.setAttribute('aria-expanded', 'true');
            this._activeConfigKey = key;
        }

        // Slider-Wert und UI nach Config-Ã„nderung aktualisieren
        _updateSliderFromConfig(key) {
            const cfg = this._sliderConfigs[key];
            const row = this.bodyEl.querySelector(`[data-key="${key}"]`);
            if (!row || !cfg) return;

            const range = row.querySelector('.ctrl-range');
            const input = row.querySelector('.ctrl-value-input');
            const display = row.querySelector('.ctrl-value-display');
            const currentValue = Number.isFinite(this.params[key]) ? this.params[key] : 0;
            const decs = getCurrentSliderDecimals(cfg, cfg.defaultDecimals ?? 0);
            const { min, max } = getProjectedSliderBounds(cfg, currentValue);

            cfg.decimals = decs;

            if (range) {
                range.min = min;
                range.max = max;
                range.step = getProjectedSliderStep(cfg.step);
                range.value = clamp(currentValue, min, max);
            }

            if (input) input.value = formatValue(currentValue, decs);
            if (display) display.textContent = formatValue(currentValue, decs);
        }

        _create() {
            injectCSS();

            this.el = document.createElement('div');
            this.el.className = 'ctrl-panel';
            this.el.id = this.options.id;

            // Position variants via CSS class (more reliable than inline styles)
            if (this.options.position === 'left') {
                this.el.classList.add('position-left');
            } else if (this.options.position === 'right') {
                this.el.classList.add('position-right');
            }

            // Header
            this.headerEl = document.createElement('div');
            this.headerEl.className = 'ctrl-panel-header';
            this.headerEl.innerHTML = `
                <div class="ctrl-drag-handle" aria-label="Panel bewegen oder umschalten" role="button" tabindex="0">
                    <div class="ctrl-drag-indicator"></div>
                </div>
                <div class="ctrl-header-buttons">
                    <button class="ctrl-header-btn ctrl-layout-toggle" title="Breit">&#8596;</button>
                </div>
            `;
            this.el.appendChild(this.headerEl);

            // Store reference to button group
            this.headerButtonsEl = this.headerEl.querySelector('.ctrl-header-buttons');

            // Layout toggle button
            this._isBarMode = false;
            const toggleBtn = this.headerEl.querySelector('.ctrl-layout-toggle');
	            this._updateLayoutToggleButton();
            bindResponsiveButtonActivation(toggleBtn, () => {
                this._toggleLayout();
            });

            // Body
            this.bodyEl = document.createElement('div');
            this.bodyEl.className = 'ctrl-panel-body';
            this.el.appendChild(this.bodyEl);
            this.bodyEl.addEventListener('scroll', this._handleSelectViewportChange, { passive: true });
            window.addEventListener('resize', this._handleSelectViewportChange);

            if (typeof MutationObserver === 'function') {
                this._bodyMutationObserver = new MutationObserver(() => this._scheduleLayoutUpdate());
                this._bodyMutationObserver.observe(this.bodyEl, { childList: true, subtree: true });
            }

            // Default container is the body
            this._currentContainer = this.bodyEl;

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
	            this._syncResponsiveMode(true);

            // Initial height calculation (after DOM is ready)
	            requestAnimationFrame(() => {
	                this._syncResponsiveMode();
	                this._updateBodyHeight();
	            });
        }

        _isHeaderButtonTarget(target) {
            return !!getTargetElement(target)?.closest('.ctrl-header-buttons');
        }

        _isDragHandleTarget(target) {
            return !!getTargetElement(target)?.closest('.ctrl-drag-handle');
        }

	        _updateLayoutToggleButton() {
	            const toggleBtn = this.headerEl?.querySelector('.ctrl-layout-toggle');
	            if (!toggleBtn) return;
	            toggleBtn.textContent = this._isBarMode ? '\u2195' : '\u2194';
	            toggleBtn.title = this._isBarMode ? 'Schmal' : 'Breit';
	        }

	        _clearDesktopInlinePanelStyles() {
	            if (!this.el) return;
	            this.el.style.left = '';
	            this.el.style.right = '';
	            this.el.style.top = '';
	            this.el.style.bottom = '';
	            this.el.style.width = '';
	            this.el.style.maxWidth = '';
	            this.el.style.height = '';
	            this.el.style.transition = '';
	            this.el.classList.remove('ctrl-panel-collapsed-body');

	            if (!this.bodyEl) return;
	            this.bodyEl.style.height = '';
	            this.bodyEl.style.maxHeight = '';
	            this.bodyEl.style.overflowY = '';
	        }

	        _syncResponsiveMode(force = false) {
	            if (!this.el || !this.bodyEl) return;
	            const nextMode = isMobile() ? 'mobile' : 'desktop';
	            if (!force && nextMode === this._responsiveMode) return;
	            this._responsiveMode = nextMode;

	            if (nextMode === 'mobile') {
	                this._barModeBeforeMobile = !!this._isBarMode;
	                if (this._isBarMode) {
	                    this._isBarMode = false;
	                    this.el.classList.remove('bar-mode');
	                }
	                this._updateLayoutToggleButton();
	                this._clearDesktopInlinePanelStyles();
		                if (this._mobileSheetPositionInitialized) {
		                    this._applyMobileSheetPosition?.(this._mobileY, false, { rememberOpen: false, signalLayout: true });
		                } else {
		                    this._updateMobileBodyHeight();
		                }
	                return;
	            }

	            this._applyMobileSheetPosition?.(this._mobileY, false, { rememberOpen: false, signalLayout: false });
	            this._clearMobileCanvasOcclusion();
	            this._isBarMode = !!this._barModeBeforeMobile;
	            this._barModeBeforeMobile = false;
	            this.el.classList.toggle('bar-mode', this._isBarMode);
	            this._updateLayoutToggleButton();

	            if (this._isBarMode) {
	                this._updateBarWidth();
	                this._clampToMenuBounds();
	                return;
	            }

	            if (this._desktopFrame) {
	                this._applyDesktopFrame(this._desktopFrame);
	                return;
	            }

	            this._updateBodyHeight();
	            this._clampToMenuBounds();
	        }

        // Toggle between panel and bar layout
        _toggleLayout() {
            this._isBarMode = !this._isBarMode;

            if (this._isBarMode) {
                // Check if panel is at/near bottom edge before switching to bar mode
                const rect = this.el.getBoundingClientRect();
                const bottomBuffer = 20; // px tolerance
	                const isAtBottom = rect.bottom >= this._getDesktopViewportHeight() - bottomBuffer;

                if (isAtBottom) {
                    // Reset to bottom position for bar mode
                    this.el.style.top = 'auto';
                    this.el.style.bottom = '0';
                }

                this.el.classList.add('bar-mode');
	                this.el.style.height = '';
	                this.el.style.width = '';
	                this.bodyEl.style.height = '';
                // Reset body max-height for bar mode
                this.bodyEl.style.maxHeight = '';
                // Set initial bar width
                this._updateBarWidth();
            } else {
                // Check if panel is at/near bottom edge before switching back
                const rect = this.el.getBoundingClientRect();
                const bottomBuffer = 0; // px tolerance
	                const isAtBottom = rect.bottom >= this._getDesktopViewportHeight() - bottomBuffer;

                if (isAtBottom) {
                    // Reset to bottom position for panel mode
                    this.el.style.top = 'auto';
                    this.el.style.bottom = '0';
                }

                this.el.classList.remove('bar-mode');
                // Reset max-width to default
                this.el.style.maxWidth = '';
                // Re-apply height constraints
                this._updateBodyHeight();
            }
	            this._updateLayoutToggleButton();
        }

        _scheduleLayoutUpdate() {
            if (this._layoutUpdateQueued) return;
            this._layoutUpdateQueued = true;

            requestAnimationFrame(() => {
                this._layoutUpdateQueued = false;
                if (!this.el || !this.bodyEl) return;
	                this._syncResponsiveMode();

                if (isMobile()) {
                    this._refreshMobileSheetLayout?.();
                    return;
                }

                this._updateBodyHeight();
                this._updateBarWidth();
            });
        }

        // Update body max-height based on panel position (desktop)
	        _updateBodyHeight(explicitTop = null) {
            if (!this.bodyEl) return;
            if (isMobile()) {
                this._updateMobileBodyHeight();
                return;
            }
	            if (this._isBarMode) {
	                this.el.style.height = '';
	                this.el.style.width = '';
	                this.bodyEl.style.height = '';
	                this.bodyEl.style.maxHeight = '';
	                this.bodyEl.style.overflowY = '';
	                this.el.classList.remove('ctrl-panel-collapsed-body');
	                return;
	            }
	            if (this._desktopFrame) {
	                const nextFrame = {
	                    ...this._desktopFrame,
	                    top: typeof explicitTop === 'number' ? explicitTop : this._desktopFrame.top
	                };
	                this._applyDesktopFrame(nextFrame);
	                return;
	            }
	            const rect = this.el.getBoundingClientRect();
	            const {
	                headerHeight,
	                headerMarginBottom,
	                panelPaddingTop,
	                panelPaddingBottom
	            } = this._getDesktopFrameMetrics();
	            const viewportHeight = this._getDesktopViewportHeight();
	            const fixedChromeHeight = headerHeight + headerMarginBottom + panelPaddingTop + panelPaddingBottom;
	            this.el.style.height = '';
	            this.bodyEl.style.height = '';
	            this.bodyEl.style.maxHeight = '';
		            const bottomOffset = rect.bottom >= viewportHeight - 2 ? 0 : 16;
		            const maxPanelHeight = Math.max(fixedChromeHeight, viewportHeight - bottomOffset - 70);
		            const preferredPanelHeight = Math.min(maxPanelHeight, Math.max(fixedChromeHeight, viewportHeight / 3));
		            const preferredBodyHeight = Math.max(0, preferredPanelHeight - fixedChromeHeight);
		            const naturalBodyHeight = this._getDesktopNaturalBodyHeight();
	            const bodyHeight = Math.min(naturalBodyHeight, preferredBodyHeight);

	            if (bodyHeight > 0) {
	                const nextHeight = Math.ceil(bodyHeight);
	                this.bodyEl.style.height = nextHeight + 'px';
	                this.bodyEl.style.maxHeight = nextHeight + 'px';
	            } else {
	                this.bodyEl.style.height = '';
	                this.bodyEl.style.maxHeight = '';
            }
	            this.el.classList.toggle('ctrl-panel-collapsed-body', bodyHeight <= 1);

	            this._syncDesktopBodyOverflow();
        }

        // Update body max-height for mobile based on panel Y position
        _updateMobileBodyHeight() {
            if (!this.bodyEl || !isMobile()) return;
            const headerHeight = this._getMobileHeaderHeight();
            const expandedHeight = this._getMobileExpandedPanelHeight();
            this.el.style.setProperty('--ctrl-mobile-header-height', `${Math.round(headerHeight)}px`);
            this.el.style.height = expandedHeight + 'px';
            const visibleHeight = this._getMobileVisiblePanelHeight();
            const bodyStyle = getComputedStyle(this.bodyEl);
            const borderTop = parseFloat(bodyStyle.borderTopWidth) || 0;
            const bodyHeight = Math.max(0, Math.ceil(visibleHeight - headerHeight + borderTop));
            this.bodyEl.style.height = bodyHeight + 'px';
            this.bodyEl.style.maxHeight = bodyHeight + 'px';
            requestAnimationFrame(() => {
                if (!this.bodyEl || !isMobile()) return;
                const needsScroll = this.bodyEl.scrollHeight > this.bodyEl.clientHeight + 1;
                this.bodyEl.style.overflowY = needsScroll ? 'auto' : 'hidden';
            });
        }

        _getMobileHeaderHeight() {
            if (!this.headerEl) return 56;
            const rect = this.headerEl.getBoundingClientRect();
            return Math.max(1, Math.round(rect.height || this.headerEl.offsetHeight || 56));
        }

        _getMobilePeekHeight() {
            return Math.max(this._getMobileHeaderHeight(), 44);
        }

        _getMobileNaturalBodyHeight() {
            if (!this.bodyEl) return 0;
            return Math.max(this.bodyEl.scrollHeight || 0, this.bodyEl.clientHeight || 0, 0);
        }

        _getMobileExpandedPanelHeight() {
            const headerHeight = this._getMobileHeaderHeight();
            const naturalHeight = headerHeight + this._getMobileNaturalBodyHeight();
            const viewport = getViewportMetrics();
            const availableHeight = Math.max(headerHeight, viewport.height);
            return Math.max(headerHeight, Math.min(naturalHeight, availableHeight));
        }

        _getMobileVisiblePanelHeight() {
            if (!this.el) return 0;
            const viewport = getViewportMetrics();
            const rect = this.el.getBoundingClientRect();
            return Math.max(0, Math.min(rect.bottom, viewport.height) - Math.max(rect.top, 0));
        }

        _updateMobileViewportOffset() {
            if (!this.el) return;
            if (!isMobile()) {
                this.el.style.removeProperty('--ctrl-mobile-bottom-offset');
                return;
            }
            const viewport = getViewportMetrics();
            const rootBottom = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--visible-viewport-bottom')) || 0;
            this.el.style.setProperty('--ctrl-mobile-bottom-offset', `${Math.round(Math.max(viewport.bottomInset, rootBottom))}px`);
        }

        _updateMobileCanvasOcclusion() {
            if (!this.options.mobileCanvasOcclusion) return;
            if (!this.el || !isMobile()) {
                this._clearMobileCanvasOcclusion();
                return;
            }
            const visibleBodyHeight = Math.max(0, this._getMobileVisiblePanelHeight() - this._getMobileHeaderHeight());
            const occlusion = Math.max(0, visibleBodyHeight);
            document.documentElement.style.setProperty('--controls-mobile-occlusion', `${Math.round(occlusion)}px`);
        }

        _clearMobileCanvasOcclusion() {
            if (!this.options.mobileCanvasOcclusion) return;
            document.documentElement.style.removeProperty('--controls-mobile-occlusion');
        }

	        _dispatchMobileLayoutChange() {
	            if (!this.el) return;
	            const detail = {
	                y: this._mobileY,
	                visibleHeight: this._getMobileVisiblePanelHeight(),
	                bodyHeight: this.bodyEl ? this.bodyEl.clientHeight : 0
	            };
	            this.el.dispatchEvent(new CustomEvent('ctrl-panel-layout-change', {
	                bubbles: true,
	                detail
	            }));
		            if (this.options.mobileCanvasOcclusion) {
		                window.dispatchEvent(new Event('resize'));
		            }
	        }

	        _scheduleMobileLayoutChange({ afterTransition = false } = {}) {
	            if (this._mobileLayoutChangeFrame) return;
	            this._mobileLayoutChangeFrame = requestAnimationFrame(() => {
	                this._mobileLayoutChangeFrame = 0;
	                if (!this.el || !isMobile()) return;
	                this._dispatchMobileLayoutChange();
	            });

	            if (afterTransition) {
	                clearTimeout(this._mobileLayoutChangeTimeout);
	                this._mobileLayoutChangeTimeout = window.setTimeout(() => {
	                    this._mobileLayoutChangeTimeout = 0;
	                    if (!this.el || !isMobile()) return;
	                    this._dispatchMobileLayoutChange();
	                }, 280);
	            }
	        }

        // Update max-width in bar mode based on position
        _updateBarWidth() {
            if (!this._isBarMode) return;
            const rect = this.el.getBoundingClientRect();
	            const availableWidth = this._getDesktopViewportWidth() - rect.left - 16;
            this.el.style.maxWidth = Math.max(200, availableWidth) + 'px';
        }

        // MenÃ¼-Breite ermitteln (fÃ¼r Bounds)
        _getMenuWidth() {
            const menu = document.querySelector('.menu');
            return menu ? menu.offsetWidth : 70;
        }

	        _getDesktopViewportMetrics() {
	            const viewport = getViewportMetrics();
	            return {
	                width: Math.max(1, viewport.width || viewport.layoutWidth || window.innerWidth || 1),
	                height: Math.max(1, viewport.height || viewport.layoutHeight || window.innerHeight || 1)
	            };
	        }

	        _getDesktopViewportWidth() {
	            return this._getDesktopViewportMetrics().width;
	        }

	        _getDesktopViewportHeight() {
	            return this._getDesktopViewportMetrics().height;
	        }

	        _getDesktopNaturalBodyHeight() {
	            if (!this.bodyEl) return 0;
	            return Math.max(this.bodyEl.scrollHeight || 0, this.bodyEl.clientHeight || 0, 0);
	        }

	        _syncDesktopBodyOverflow() {
	            requestAnimationFrame(() => {
	                if (!this.bodyEl || isMobile() || this._isBarMode) return;
	                const needsScroll = this.bodyEl.scrollHeight > this.bodyEl.clientHeight + 1;
	                this.bodyEl.style.overflowY = needsScroll ? 'auto' : 'hidden';
	            });
	        }

	        _getDesktopFrameMetrics() {
	            const panelStyle = getComputedStyle(this.el);
	            const headerStyle = this.headerEl ? getComputedStyle(this.headerEl) : null;
	            const headerHeight = this.headerEl?.offsetHeight || 40;
	            const headerMarginBottom = parseFloat(headerStyle?.marginBottom || 0) || 0;
	            const panelPaddingTop = parseFloat(panelStyle.paddingTop || 0) || 0;
	            const panelPaddingBottom = parseFloat(panelStyle.paddingBottom || 0) || 0;
	            return {
	                headerHeight,
	                headerMarginBottom,
	                panelPaddingTop,
	                panelPaddingBottom,
	                collapsedPanelHeight: headerHeight + panelPaddingTop + panelPaddingBottom,
	                minPanelHeight: headerHeight + headerMarginBottom + panelPaddingTop + panelPaddingBottom + 8,
	            };
	        }

	        _clampDesktopFrame(frame) {
	            const viewportWidth = this._getDesktopViewportWidth();
	            const menuWidth = this._getMenuWidth();
	            const maxWidth = Math.max(1, viewportWidth - menuWidth);
	            const width = Math.min(
	                Math.max(1, Math.round(frame.width || this.el.offsetWidth || this.el.getBoundingClientRect().width || 280)),
	                maxWidth
	            );
	            const rightBound = Math.max(width, viewportWidth - menuWidth);
	            const maxLeft = Math.max(0, rightBound - width);
	            const minTop = 70;
	            const { collapsedPanelHeight } = this._getDesktopFrameMetrics();
	            const maxTop = Math.max(minTop, this._getDesktopViewportHeight() - Math.max(1, collapsedPanelHeight));
	            return {
	                left: clamp(frame.left, 0, maxLeft),
	                top: clamp(frame.top, minTop, maxTop),
	                width
	            };
	        }

	        _applyDesktopFrame(frame) {
	            if (!this.el || !this.bodyEl || isMobile() || this._isBarMode) return;
		            const nextFrame = this._clampDesktopFrame(frame);
	            const {
	                headerHeight,
	                headerMarginBottom,
	                panelPaddingTop,
	                panelPaddingBottom
	            } = this._getDesktopFrameMetrics();
	            const fixedChromeHeight = headerHeight + headerMarginBottom + panelPaddingTop + panelPaddingBottom;
	            const naturalBodyHeight = this._getDesktopNaturalBodyHeight();
		            const availableBodyHeight = Math.max(0, this._getDesktopViewportHeight() - nextFrame.top - fixedChromeHeight);
	            const bodyHeight = Math.min(naturalBodyHeight, availableBodyHeight);

	            this._desktopFrame = nextFrame;
	            this.el.style.transform = 'none';
	            this.el.style.right = 'auto';
	            this.el.style.bottom = 'auto';
	            this.el.style.left = nextFrame.left + 'px';
	            this.el.style.top = nextFrame.top + 'px';
	            this.el.style.width = nextFrame.width + 'px';
	            this.el.style.height = '';
	            this.bodyEl.style.height = Math.ceil(bodyHeight) + 'px';
	            this.bodyEl.style.maxHeight = Math.ceil(bodyHeight) + 'px';
	            this.el.classList.toggle('ctrl-panel-collapsed-body', bodyHeight <= 1);
	            this._syncDesktopBodyOverflow();
	        }

        _initDrag() {
            // Track previous rect for drag events
            this._prevDragRect = null;
            this._prevDragBodyRect = null;

            // Desktop drag
            this.headerEl.addEventListener('mousedown', (e) => {
                if (isMobile() || this._isHeaderButtonTarget(e.target) || !this._isDragHandleTarget(e.target)) return;
                this._isDragging = true;
                this.el.classList.add('dragging');
                const rect = this.el.getBoundingClientRect();
                const bodyRect = this.bodyEl?.getBoundingClientRect?.() || null;
                this._dragStart = { x: e.clientX, y: e.clientY };
                this._panelStart = { x: rect.left, y: rect.top };
                this._prevDragRect = rect;
                this._prevDragBodyRect = bodyRect;

	                if (!this._isBarMode) {
	                    this._applyDesktopFrame({ left: rect.left, top: rect.top, width: rect.width });
	                } else {
	                    this.el.style.transform = 'none';
	                    this.el.style.right = 'auto';
	                    this.el.style.bottom = 'auto';
	                    this.el.style.left = rect.left + 'px';
	                    this.el.style.top = rect.top + 'px';
	                }
                e.preventDefault();

                // Fire drag start event
                this.el.dispatchEvent(new CustomEvent('ctrl-panel-drag-start', {
                    bubbles: true,
                    detail: { rect, bodyRect }
                }));
            });

            document.addEventListener('mousemove', (e) => {
                if (!this._isDragging) return;
                const dx = e.clientX - this._dragStart.x;
                const dy = e.clientY - this._dragStart.y;

                // GewÃ¼nschte Position berechnen
                let newLeft = this._panelStart.x + dx;
                let newTop = this._panelStart.y + dy;

	                // Bounds: MenÃ¼-Breite berÃ¼cksichtigen
	                const menuWidth = this._getMenuWidth();
	                const viewportWidth = this._getDesktopViewportWidth();
	                const viewportHeight = this._getDesktopViewportHeight();
	                const rightBound = viewportWidth - menuWidth;

	                // Im Bar-Modus: max-width ZUERST setzen, dann Position clampen
	                if (this._isBarMode) {
	                    const availableWidth = rightBound - Math.max(0, newLeft) - 16;
	                    this.el.style.maxWidth = Math.max(200, availableWidth) + 'px';
	                }

	                // Horizontal: Position clampen (nicht hinters MenÃ¼!)
	                const panelWidth = this.el.offsetWidth;
	                const maxLeft = Math.max(0, rightBound - panelWidth);
	                newLeft = clamp(newLeft, 0, maxLeft);

	                // Vertikal: Oben MenÃ¼-Button-HÃ¶he, unten Bildschirmrand
	            const menuButtonHeight = 70;
	            const collapseHeight = this._isBarMode
	                ? Math.max(1, Math.round(this.el.getBoundingClientRect().height || this.headerEl?.offsetHeight || 40))
	                : Math.max(1, Math.round(this._getDesktopFrameMetrics().collapsedPanelHeight || this.headerEl?.offsetHeight || 40));
	            const maxTop = Math.max(menuButtonHeight, viewportHeight - collapseHeight);
	            newTop = clamp(newTop, menuButtonHeight, maxTop);

	                if (this._isBarMode) {
	                    this.el.style.left = newLeft + 'px';
	                    this.el.style.top = newTop + 'px';
	                } else {
	                    const dragFrame = this._desktopFrame || { left: this._panelStart.x, top: this._panelStart.y, width: panelWidth };
	                    this._applyDesktopFrame({ ...dragFrame, left: newLeft, top: newTop, width: dragFrame.width || panelWidth });
	                }

                // Fire drag move event with current and previous rect
                const rect = this.el.getBoundingClientRect();
                const bodyRect = this.bodyEl?.getBoundingClientRect?.() || null;
                this.el.dispatchEvent(new CustomEvent('ctrl-panel-drag-move', {
                    bubbles: true,
                    detail: {
                        rect,
                        prevRect: this._prevDragRect,
                        bodyRect,
                        prevBodyRect: this._prevDragBodyRect
                    }
                }));
                this._prevDragRect = rect;
                this._prevDragBodyRect = bodyRect;

                // Update body height while dragging
	                if (this._isBarMode) this._updateBodyHeight(newTop);
            });

            document.addEventListener('mouseup', () => {
                if (this._isDragging) {
                    // Fire drag end event
                    const rect = this.el.getBoundingClientRect();
                    const bodyRect = this.bodyEl?.getBoundingClientRect?.() || null;
                    this.el.dispatchEvent(new CustomEvent('ctrl-panel-drag-end', {
                        bubbles: true,
                        detail: { rect, bodyRect }
                    }));

                    this._isDragging = false;
                    this._prevDragRect = null;
                    this._prevDragBodyRect = null;
                    this.el.classList.remove('dragging');
	                    if (this._isBarMode) {
	                        this._updateBodyHeight();
	                    } else if (this._desktopFrame) {
	                        this._applyDesktopFrame(this._desktopFrame);
	                    }
                    this._updateBarWidth();
                }
            });

            // MenÃ¼-Ã„nderungen beobachten fÃ¼r Bounds-Update
            const menu = document.querySelector('.menu');
            if (menu) {
                const observer = new MutationObserver(() => this._clampToMenuBounds());
                observer.observe(menu, { attributes: true, attributeFilter: ['class'] });
            }

            // Initial height + resize
            this._updateBodyHeight();
            window.addEventListener('resize', () => {
	                this._syncResponsiveMode();
                this._updateBodyHeight();
                this._updateBarWidth();
                this._clampToMenuBounds();
            });
        }

        // Panel in Bounds halten wenn MenÃ¼ sich Ã¤ndert
        _clampToMenuBounds() {
            if (isMobile()) return;
	            if (this._desktopFrame && !this._isBarMode) {
	                this._applyDesktopFrame(this._desktopFrame);
	                return;
	            }
	            const rect = this.el.getBoundingClientRect();
	            const menuWidth = this._getMenuWidth();
	            const viewportWidth = this._getDesktopViewportWidth();
	            const viewportHeight = this._getDesktopViewportHeight();
	            const rightBound = viewportWidth - menuWidth;

	            if (rect.right > rightBound) {
	                const newLeft = Math.max(0, rightBound - rect.width);
	                this.el.style.left = newLeft + 'px';
	            }

	            if (this._isBarMode && this.el.style.top && this.el.style.top !== 'auto') {
	                const minTop = 70;
	                const maxTop = Math.max(minTop, viewportHeight - Math.max(1, Math.round(rect.height || this.headerEl?.offsetHeight || 40)));
	                const currentTop = parseFloat(this.el.style.top) || rect.top || 0;
	                this.el.style.top = clamp(currentTop, minTop, maxTop) + 'px';
	            }
        }

        _initMobileSheet() {
            // Mobile Bottom-Sheet (wie in 0neSlider.html)
            this._mobileY = 0;
            let isTouchDragging = false;
            let touchStartY = 0;
            let touchPanelStartY = 0;
	            let isMouseDragging = false;
	            let isMousePressed = false;
	            let mouseStartY = 0;
	            let mousePanelStartY = 0;
	            let suppressHeaderClickUntil = 0;
	            const tapDragThreshold = 8;

            // Referenz auf das mitzubewegende Element
            const contentEl = this.options.mobileContentElement;
            const maxOffsetVh = this.options.mobileContentMaxOffset;

            // maxY = wie weit das Panel nach unten kann (so dass Header noch sichtbar)
            const getMaxY = () => {
                const fullHeight = this._getMobileExpandedPanelHeight();
                return Math.max(0, fullHeight - this._getMobilePeekHeight());
            };

            const clampY = (y) => Math.max(0, Math.min(getMaxY(), y));

	            const getInitialOpenVisibleHeight = () => {
	                const peekHeight = this._getMobilePeekHeight();
	                const fullHeight = this._getMobileExpandedPanelHeight();
	                const mode = this.options.mobileInitialOpenMode || 'content-capped';
	                if (mode === 'peek') return peekHeight;
	                if (mode === 'full') return fullHeight;
	                const viewport = getViewportMetrics();
	                const rawFraction = Number(this.options.mobileInitialOpenMaxViewportFraction);
	                const maxFraction = Number.isFinite(rawFraction) ? clamp(rawFraction, 0, 1) : (1 / 3);
	                const cappedHeight = Math.round(viewport.height * maxFraction);
	                return Math.max(peekHeight, Math.min(fullHeight, cappedHeight || peekHeight));
	            };

	            const getVisibleHeightForY = (y) => {
	                const fullHeight = this._getMobileExpandedPanelHeight();
	                return Math.max(this._getMobilePeekHeight(), fullHeight - clampY(y));
	            };

	            const clampVisibleHeight = (height) => {
	                const fullHeight = this._getMobileExpandedPanelHeight();
	                return Math.max(this._getMobilePeekHeight(), Math.min(fullHeight, Math.round(height || 0)));
	            };

	            const getYForVisibleHeight = (height) => {
	                const fullHeight = this._getMobileExpandedPanelHeight();
	                return clampY(fullHeight - clampVisibleHeight(height));
	            };

	            const closedThreshold = () => Math.max(10, Math.round(this._getMobilePeekHeight() * 0.12));

	            const rememberOpenPosition = (y) => {
	                const maxY = getMaxY();
	                const nextY = clampY(y);
	                if (maxY <= 0) {
	                    this._mobileLastOpenY = 0;
		                    this._mobileLastOpenVisibleHeight = this._getMobileExpandedPanelHeight();
	                    return;
	                }
	                if (nextY < maxY - closedThreshold()) {
	                    this._mobileLastOpenY = nextY;
		                    this._mobileLastOpenVisibleHeight = getVisibleHeightForY(nextY);
	                }
	            };

	            const getPreferredOpenY = () => {
		                const fallbackVisibleHeight = clampVisibleHeight(
		                    this._mobileDefaultOpenVisibleHeight || getInitialOpenVisibleHeight()
		                );
		                const candidateVisibleHeight = clampVisibleHeight(
		                    this._mobileLastOpenVisibleHeight || fallbackVisibleHeight
		                );
		                const fallback = getYForVisibleHeight(fallbackVisibleHeight);
		                const candidate = getYForVisibleHeight(candidateVisibleHeight);
		                const maxY = getMaxY();
	                return candidate >= maxY - closedThreshold() ? fallback : candidate;
	            };

	            const isMostlyClosed = (y = this._mobileY) => {
	                const maxY = getMaxY();
	                return maxY <= 0 || y >= maxY - closedThreshold();
	            };

            // Content-Element verschieben basierend auf Panel-Position
            const updateContentPosition = (panelY, animate = false) => {
                if (!contentEl || !isMobile()) return;
                const maxY = getMaxY();
                const viewport = getViewportMetrics();
                // openRatio: 0 = geschlossen, 1 = voll offen
                const openRatio = maxY > 0 ? 1 - (panelY / maxY) : 1;
                const offsetPx = openRatio * maxOffsetVh * viewport.height / 100;
                contentEl.style.transition = animate ? 'transform 0.25s ease-out' : 'none';
                // Nach oben verschieben wenn Panel offen
                contentEl.style.transform = `translateY(-${offsetPx}px)`;
            };

            const setPosition = (y, animate = false, { rememberOpen = true, signalLayout = false } = {}) => {
                if (!this.el) return;
                if (!isMobile()) {
                    this.el.style.transition = '';
                    this.el.style.transform = '';
                    this.el.style.removeProperty('--ctrl-mobile-bottom-offset');
                    this.el.style.removeProperty('--ctrl-mobile-header-height');
                    if (contentEl) {
                        contentEl.style.transition = '';
                        contentEl.style.transform = '';
                    }
                    if (this.bodyEl) {
                        this.bodyEl.style.overflowY = '';
                    }
                    this._clearMobileCanvasOcclusion();
                    return;
                }
                this._updateMobileViewportOffset();
                this._mobileY = clampY(y);
	                this._mobileSheetPositionInitialized = true;
	                if (rememberOpen) rememberOpenPosition(this._mobileY);
                this.el.style.transition = animate ? 'transform 0.25s ease-out' : 'none';
                this.el.style.transform = `translateY(${this._mobileY}px)`;
                updateContentPosition(this._mobileY, animate);
                this._updateMobileBodyHeight();
                this._updateMobileCanvasOcclusion();
	                if (signalLayout) this._scheduleMobileLayoutChange({ afterTransition: animate });
            };

            this._applyMobileSheetPosition = setPosition;
            this._refreshMobileSheetLayout = ({ animate = false } = {}) => {
	                if (isMostlyClosed()) {
	                    setPosition(getMaxY(), animate, { rememberOpen: false, signalLayout: false });
	                    return;
	                }
	                setPosition(getPreferredOpenY(), animate, { rememberOpen: false, signalLayout: false });
            };

            const initPosition = () => {
                if (!isMobile()) {
                    setPosition(this._mobileY, false);
                    return;
                }
		                const initialVisibleHeight = getInitialOpenVisibleHeight();
		                const initialY = getYForVisibleHeight(initialVisibleHeight);
		                this._mobileDefaultOpenVisibleHeight = initialVisibleHeight;
		                this._mobileLastOpenVisibleHeight = initialVisibleHeight;
		                this._mobileDefaultOpenY = clampY(initialY);
		                this._mobileLastOpenY = this._mobileDefaultOpenY;
                setPosition(initialY, false, { rememberOpen: true, signalLayout: true });
            };

            const syncPositionOnResize = () => {
                if (!this.el) return;
	                this._syncResponsiveMode();
                if (!isMobile()) {
                    return;
                }

                const maxY = getMaxY();
                if (isMostlyClosed()) {
                    setPosition(maxY, false, { rememberOpen: false, signalLayout: false });
                    return;
                }

	                setPosition(getPreferredOpenY(), false, { rememberOpen: false, signalLayout: false });
            };

	            this._mobileInitialLayoutFrame = requestAnimationFrame(() => {
	                this._mobileInitialLayoutFrame = 0;
	                if (!this.el) return;
	                initPosition();
	            });
            this._handleMobileSheetResize = syncPositionOnResize;
            window.addEventListener('resize', this._handleMobileSheetResize);

            if (window.visualViewport) {
                this._handleMobileViewportChange = () => {
                    requestAnimationFrame(() => {
                        if (!this.el) return;
	                        if (!isMobile()) return;
                        this._refreshMobileSheetLayout?.();
                    });
                };
                window.visualViewport.addEventListener('resize', this._handleMobileViewportChange);
                window.visualViewport.addEventListener('scroll', this._handleMobileViewportChange);
            }

            if (typeof ResizeObserver === 'function') {
                this._mobileSheetResizeObserver = new ResizeObserver(() => {
                    requestAnimationFrame(() => {
                        if (!this.el) return;
	                        if (!isMobile()) return;
                        this._refreshMobileSheetLayout?.();
                    });
                });
                this._mobileSheetResizeObserver.observe(this.el);
            }

            // Tap to toggle: closed <-> letzter offener Stand
            this.headerEl.addEventListener('click', (e) => {
                if (!isMobile()) return;
                if (this._isHeaderButtonTarget(e.target) || !this._isDragHandleTarget(e.target)) return;
	                if (Date.now() < suppressHeaderClickUntil) return;
	                const maxY = getMaxY();
	                if (isMostlyClosed()) {
	                    setPosition(getPreferredOpenY(), true, { rememberOpen: true, signalLayout: true });
	                } else {
	                    setPosition(maxY, true, { rememberOpen: false, signalLayout: true });
	                }
            });

            // Touch drag
            this.headerEl.addEventListener('touchstart', (e) => {
                if (!isMobile()) return;
                if (this._isHeaderButtonTarget(e.target) || !this._isDragHandleTarget(e.target)) return;
                isTouchDragging = false;
                touchStartY = e.touches[0].clientY;
                touchPanelStartY = this._mobileY;
                this.el.style.transition = 'none';
                if (contentEl) contentEl.style.transition = 'none';
            }, { passive: true });

            this.headerEl.addEventListener('touchmove', (e) => {
                if (!isMobile()) return;
                if (this._isHeaderButtonTarget(e.target) || !this._isDragHandleTarget(e.target)) return;
                const deltaY = e.touches[0].clientY - touchStartY;
	                if (Math.abs(deltaY) >= tapDragThreshold) {
	                    isTouchDragging = true;
	                }
	                if (!isTouchDragging) return;
	                setPosition(touchPanelStartY + deltaY, false, { rememberOpen: true, signalLayout: true });
            }, { passive: true });

            this.headerEl.addEventListener('touchend', (e) => {
                if (!isMobile()) return;
	                if (!isTouchDragging && (this._isHeaderButtonTarget(e.target) || !this._isDragHandleTarget(e.target))) return;
                if (isTouchDragging) {
                    const endY = e.changedTouches[0].clientY;
                    const deltaY = endY - touchStartY;
	                    suppressHeaderClickUntil = Date.now() + 400;
	                    setPosition(touchPanelStartY + deltaY, false, { rememberOpen: true, signalLayout: true });
                }
                isTouchDragging = false;
            });

	            this.headerEl.addEventListener('mousedown', (e) => {
	                if (!isMobile()) return;
	                if (this._isHeaderButtonTarget(e.target) || !this._isDragHandleTarget(e.target)) return;
	                isMousePressed = true;
	                isMouseDragging = false;
	                mouseStartY = e.clientY;
	                mousePanelStartY = this._mobileY;
	                this.el.style.transition = 'none';
	                if (contentEl) contentEl.style.transition = 'none';
	                e.preventDefault();
	            });

	            document.addEventListener('mousemove', (e) => {
	                if (!isMobile() || !isMousePressed) return;
	                const deltaY = e.clientY - mouseStartY;
	                if (Math.abs(deltaY) >= tapDragThreshold) {
	                    isMouseDragging = true;
	                }
	                if (!isMouseDragging) return;
	                setPosition(mousePanelStartY + deltaY, false, { rememberOpen: true, signalLayout: true });
	                e.preventDefault();
	            });

	            document.addEventListener('mouseup', (e) => {
	                if (!isMousePressed) return;
	                if (isMobile() && isMouseDragging) {
	                    const deltaY = e.clientY - mouseStartY;
	                    suppressHeaderClickUntil = Date.now() + 400;
	                    setPosition(mousePanelStartY + deltaY, false, { rememberOpen: true, signalLayout: true });
	                }
	                isMousePressed = false;
	                isMouseDragging = false;
	            });
        }

        // === SECTION METHODS ===

        /**
         * Begin a new logical section
         * @param {string} id - Unique section ID
         * @param {Object} options - Section options
         */
        beginSection(id, options = {}) {
            const section = document.createElement('div');
            section.className = 'ctrl-section';
            section.id = this.options.id + '-section-' + id;
            if (options.className) section.classList.add(options.className);

            const sectionActions = Array.isArray(options.actions) ? options.actions : [];
            if (options.title || sectionActions.length) {
                section.classList.add('has-header');

                const header = document.createElement('div');
                header.className = 'ctrl-section-header';

                const titleEl = document.createElement('div');
                titleEl.className = 'ctrl-section-title';
                titleEl.textContent = options.title || '';
                header.appendChild(titleEl);

                if (sectionActions.length) {
                    const actionsWrap = document.createElement('div');
                    actionsWrap.className = 'ctrl-section-actions';

                    sectionActions.forEach((action) => {
                        if (!action) return;

                        const button = document.createElement('button');
                        button.type = 'button';
                        button.className = `ctrl-section-action${action.className ? ` ${action.className}` : ''}`;
                        button.textContent = action.label || '•';
                        if (action.title) button.title = action.title;
                        if (action.ariaLabel) button.setAttribute('aria-label', action.ariaLabel);

                        bindResponsiveButtonActivation(button, () => {
                            if (typeof action.onClick === 'function') action.onClick(id, button);
                        });

                        actionsWrap.appendChild(button);
                    });

                    header.appendChild(actionsWrap);
                }

                section.appendChild(header);
            }

            this.bodyEl.appendChild(section);
            this._sections[id] = section;
            this._currentContainer = section;
            return this;
        }

        /**
         * End current section, return to body container
         */
        endSection() {
            this._currentContainer = this.bodyEl;
            return this;
        }

        /**
         * Toggle section visibility
         * @param {string} id - Section ID
         * @param {boolean} visible - Should be visible
         */
        showSection(id, visible) {
            const section = this._sections[id];
            if (section) {
                section.classList.toggle('hidden', !visible);
            }
            return this;
        }

        _cleanupRemovedControls(rootEl) {
            if (!rootEl) return;

            const keyedElements = [];
            if (rootEl.dataset?.key) keyedElements.push(rootEl);
            keyedElements.push(...rootEl.querySelectorAll('[data-key]'));

            keyedElements.forEach((el) => {
                const key = el.dataset?.key;
                if (!key) return;

                if (this._activeSelectKey === key) this._closeSelectPopup();
                if (this._activeConfigKey === key) this._closeConfigPopup();

                delete this.params[key];
                delete this.callbacks[key];
                delete this._sliderConfigs[key];
                delete this._selectControls[key];
            });
        }

        removeSection(id) {
            const section = this._sections[id];
            if (!section) return this;

            this._cleanupRemovedControls(section);

            if (this._currentContainer === section) {
                this._currentContainer = this.bodyEl;
            }

            section.remove();
            delete this._sections[id];
            requestAnimationFrame(() => this._refreshMobileSheetLayout?.());
            return this;
        }

        // === ROW CREATION METHODS ===

        /**
         * Add a unified Slider + Stepper row (Slider + [-] [input] [+])
         */
        addSlider(key, config) {
            const { label, min, max, step, value, decimals = 0, onChange } = config;
            this.params[key] = value;
            if (onChange) this.callbacks[key] = onChange;

            // Slider-Config fÃ¼r Config-MenÃ¼ speichern
            this._sliderConfigs[key] = {
                min,
                max,
                step,
                baseDecimals: decimals,
                decimals: getSliderDecimals({ step, baseDecimals: decimals }, decimals),
                defaultMin: min,
                defaultMax: max,
                defaultStep: step,
                defaultDecimals: decimals
            };

            const sliderCfg = this._sliderConfigs[key];
            const initialValue = Number.isFinite(value) ? value : 0;
            const initialBounds = getProjectedSliderBounds(sliderCfg, initialValue);
            const initialRangeValue = clamp(initialValue, initialBounds.min, initialBounds.max);

            const row = document.createElement('div');
            row.className = 'ctrl-row';
            row.dataset.key = key;
            row.innerHTML = `
                <label class="ctrl-label">${label}</label>
                <div class="ctrl-slider-group">
                    <button class="ctrl-stepper-btn" data-action="dec">&#8722;</button>
                    <input type="range" class="ctrl-range" min="${initialBounds.min}" max="${initialBounds.max}" step="${getProjectedSliderStep(step)}" value="${initialRangeValue}">
                    <button class="ctrl-stepper-btn" data-action="inc">+</button>
                    <input type="text" class="ctrl-value-input" value="${formatValue(initialValue, sliderCfg.decimals)}">
                    <button class="ctrl-config-trigger" title="Einstellungen">&#8942;</button>
                </div>
            `;

            const range = row.querySelector('.ctrl-range');
            const input = row.querySelector('.ctrl-value-input');
            const decBtn = row.querySelector('[data-action="dec"]');
            const incBtn = row.querySelector('[data-action="inc"]');
            const configTrigger = row.querySelector('.ctrl-config-trigger');
            const syncSliderUI = (rawValue, updateInput = true) => {
                const cfg = this._sliderConfigs[key];
                const currentValue = Number.isFinite(rawValue) ? rawValue : 0;
                const decs = cfg ? getCurrentSliderDecimals(cfg, cfg.defaultDecimals ?? decimals) : decimals;
                const bounds = getProjectedSliderBounds(cfg, currentValue);

                if (cfg) cfg.decimals = decs;

                range.min = bounds.min;
                range.max = bounds.max;
                range.step = getProjectedSliderStep(cfg ? cfg.step : step);
                range.value = clamp(currentValue, bounds.min, bounds.max);

                if (updateInput) {
                    input.value = formatValue(currentValue, decs);
                }
            };

            const updateValue = (newVal, updateInput = true) => {
                // newVal = clamp(newVal, min, max); // Let the universe be unlimited!
                const cfg = this._sliderConfigs[key];
                const decs = cfg ? getCurrentSliderDecimals(cfg, cfg.defaultDecimals ?? decimals) : decimals;
                newVal = preciseNormalize(newVal, decs);
                this.params[key] = newVal;

                syncSliderUI(newVal, updateInput);

                if (this.callbacks[key]) this.callbacks[key](newVal, key);
            };

            // Slider Events
            range.addEventListener('input', () => {
                const val = parseFloat(range.value);
                updateValue(val);
            });

            // Input Events
            input.addEventListener('input', () => {
                const parsed = parseNumericValue(input.value);
                if (!Number.isNaN(parsed)) updateValue(parsed, false);
            });
            input.addEventListener('blur', () => {
                const parsed = parseNumericValue(input.value);
                const cfg = this._sliderConfigs[key];
                const decs = cfg ? getCurrentSliderDecimals(cfg, cfg.defaultDecimals ?? decimals) : decimals;
                if (Number.isNaN(parsed)) {
                    input.value = formatValue(this.params[key], decs);
                } else {
                    updateValue(parsed, true);
                }
            });
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') input.blur();
            });

            // Button Events (Including Hold)
            let holdInterval = null;
            let holdTimeout = null;
            let isHolding = false;

            const startHold = (delta) => {
                if (isHolding) return;
                // Nicht starten wenn wir schon am Minimum/Maximum sind
                const cfg = this._sliderConfigs[key];
                const decs = cfg ? getCurrentSliderDecimals(cfg, cfg.defaultDecimals ?? decimals) : decimals;
                const newVal = preciseAdd(this.params[key], delta, decs);
                const { min: currentMin, max: currentMax } = getProjectedSliderBounds(cfg, this.params[key]);
                if (newVal < currentMin || newVal > currentMax) return;

                isHolding = true;
                // Sofort ein erster Schritt
                updateValue(newVal);
                holdInterval = setInterval(() => {
                    const nextVal = preciseAdd(this.params[key], delta, decs);
                    if (nextVal < currentMin || nextVal > currentMax) {
                        stopHold();
                        return;
                    }
                    updateValue(nextVal);
                }, 80);
            };

            const stopHold = () => {
                isHolding = false;
                if (holdTimeout) { clearTimeout(holdTimeout); holdTimeout = null; }
                if (holdInterval) { clearInterval(holdInterval); holdInterval = null; }
            };

            [decBtn, incBtn].forEach((btn, i) => {
                const getDelta = () => {
                    const cfg = this._sliderConfigs[key];
                    const currentStep = cfg ? cfg.step : step;
                    return i === 0 ? -currentStep : currentStep;
                };

                // Pointer Events (ersetzt mousedown, touchstart)
                btn.addEventListener('pointerdown', (e) => {
                    e.preventDefault(); // Verhindert Scrollen oder Doppel-Tap-Zoom
                    btn.setPointerCapture(e.pointerId);
                    stopHold();

                    // PrÃ¼fen ob wir Ã¼berhaupt weiter kÃ¶nnen
                    const delta = getDelta();
                    const cfg = this._sliderConfigs[key];
                    const decs = cfg ? getCurrentSliderDecimals(cfg, cfg.defaultDecimals ?? decimals) : decimals;
                    const newVal = preciseAdd(this.params[key], delta, decs);
                    const { min: currentMin, max: currentMax } = getProjectedSliderBounds(cfg, this.params[key]);
                    if (newVal < currentMin || newVal > currentMax) return;

                    // Manuelles Click Handling (anstelle von on('click')) sorgt fÃ¼r sofortige Reaktion
                    holdTimeout = setTimeout(() => { startHold(delta); }, 400);
                });

                btn.addEventListener('pointerup', (e) => {
                    // Wenn wir noch nicht lange gehalten haben, war es ein einfacher Click
                    if (!isHolding && holdTimeout) {
                        const delta = getDelta();
                        const cfg = this._sliderConfigs[key];
                        const decs = cfg ? getCurrentSliderDecimals(cfg, cfg.defaultDecimals ?? decimals) : decimals;
                        const newVal = preciseAdd(this.params[key], delta, decs);
                        const { min: currentMin, max: currentMax } = getProjectedSliderBounds(cfg, this.params[key]);
                        if (newVal >= currentMin && newVal <= currentMax) {
                            updateValue(newVal);
                        }
                    }
                    stopHold();
                    btn.releasePointerCapture(e.pointerId);
                });

                btn.addEventListener('pointercancel', stopHold);
                // click-Event blockieren, da wir es Ã¼ber pointerdown/-up selbst handhaben
                btn.addEventListener('click', (e) => e.preventDefault());
            });

            // Config-MenÃ¼: Globales Popup Ã¶ffnen
            bindResponsiveButtonActivation(configTrigger, () => {
                this._openConfigPopup(key, configTrigger);
            });

            this._currentContainer.appendChild(row);
            syncSliderUI(initialValue, true);
            return this;
        }

        /**
         * Add a toggle checkbox row
         */
        addToggle(key, config) {
            const { label, value = false, onChange } = config;
            this.params[key] = value;
            if (onChange) this.callbacks[key] = onChange;

            const row = document.createElement('div');
            row.className = 'ctrl-row';
            row.dataset.key = key;
            const inputId = `${this.options.id}-toggle-${String(key).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
            row.innerHTML = `
                <label class="ctrl-label" for="${inputId}">${label}</label>
                <div class="ctrl-checkbox-wrap">
                    <input id="${inputId}" type="checkbox" ${value ? 'checked' : ''}>
                </div>
            `;

            const checkbox = row.querySelector('input[type="checkbox"]');

            checkbox.addEventListener('change', () => {
                this.params[key] = checkbox.checked;
                if (this.callbacks[key]) this.callbacks[key](this.params[key], key);
            });

            this._currentContainer.appendChild(row);
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

            const labelEl = document.createElement('label');
            labelEl.className = 'ctrl-label';
            labelEl.textContent = label;

            const selectWrap = document.createElement('div');
            selectWrap.className = 'ctrl-select';

            const triggerBtn = document.createElement('button');
            triggerBtn.type = 'button';
            triggerBtn.className = 'ctrl-select-trigger';
            triggerBtn.setAttribute('aria-haspopup', 'listbox');
            triggerBtn.setAttribute('aria-expanded', 'false');

            const valueEl = document.createElement('span');
            valueEl.className = 'ctrl-select-value';

            const caretEl = document.createElement('span');
            caretEl.className = 'ctrl-select-caret';
            caretEl.setAttribute('aria-hidden', 'true');

            triggerBtn.appendChild(valueEl);
            triggerBtn.appendChild(caretEl);
            selectWrap.appendChild(triggerBtn);
            row.appendChild(labelEl);
            row.appendChild(selectWrap);

            this._selectControls[key] = {
                key,
                label,
                options: this._normalizeSelectOptions(options),
                triggerEl: triggerBtn,
                valueEl
            };

            this._updateSelectUI(key, value);

            labelEl.addEventListener('click', () => triggerBtn.click());
            triggerBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._openSelectPopup(key, triggerBtn);
            });
            triggerBtn.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this._openSelectPopup(key, triggerBtn);
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    this._closeSelectPopup(true);
                }
            });

            this._currentContainer.appendChild(row);
            return this;
        }

        /**
         * Add a dropdown count picker row
         */
        addCountPicker(key, config) {
            const {
                label,
                options = [],
                value = {},
                onChange,
                summaryFormatter,
                emptyLabel = 'nichts ausgewählt',
                emptyPopupLabel = 'keine optionen'
            } = config;

            const normalizedOptions = this._normalizeCountPickerOptions(options);
            this.params[key] = this._sanitizeCountPickerValue(normalizedOptions, value);
            if (onChange) this.callbacks[key] = onChange;

            const row = document.createElement('div');
            row.className = 'ctrl-row';
            row.dataset.key = key;

            const labelEl = document.createElement('label');
            labelEl.className = 'ctrl-label';
            labelEl.textContent = label;

            const selectWrap = document.createElement('div');
            selectWrap.className = 'ctrl-select';

            const triggerBtn = document.createElement('button');
            triggerBtn.type = 'button';
            triggerBtn.className = 'ctrl-select-trigger';
            triggerBtn.setAttribute('aria-haspopup', 'dialog');
            triggerBtn.setAttribute('aria-expanded', 'false');

            const valueEl = document.createElement('span');
            valueEl.className = 'ctrl-select-value';

            const caretEl = document.createElement('span');
            caretEl.className = 'ctrl-select-caret';
            caretEl.setAttribute('aria-hidden', 'true');

            triggerBtn.appendChild(valueEl);
            triggerBtn.appendChild(caretEl);
            selectWrap.appendChild(triggerBtn);
            row.appendChild(labelEl);
            row.appendChild(selectWrap);

            this._countPickerControls[key] = {
                key,
                label,
                options: normalizedOptions,
                triggerEl: triggerBtn,
                valueEl,
                summaryFormatter,
                emptyLabel,
                emptyPopupLabel
            };

            this._updateCountPickerUI(key, this.params[key]);

            labelEl.addEventListener('click', () => triggerBtn.click());
            triggerBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._openCountPickerPopup(key, triggerBtn);
            });
            triggerBtn.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this._openCountPickerPopup(key, triggerBtn);
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    this._closeCountPickerPopup(true);
                }
            });

            this._currentContainer.appendChild(row);
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

            this._currentContainer.appendChild(row);
            return this;
        }

        /**
         * Add a single-line text input row
         */
        addInput(key, config) {
            const {
                label,
                value = '',
                placeholder = '',
                type = 'text',
                inputmode = '',
                onChange
            } = config;

            this.params[key] = value;
            if (onChange) this.callbacks[key] = onChange;

            const row = document.createElement('div');
            row.className = 'ctrl-row';
            row.dataset.key = key;
            row.innerHTML = `
                <label class="ctrl-label">${label}</label>
                <input class="ctrl-input" type="${type}" placeholder="${placeholder}" ${inputmode ? `inputmode="${inputmode}"` : ''} value="${String(value ?? '').replace(/"/g, '&quot;')}">
            `;

            const input = row.querySelector('.ctrl-input');
            input.addEventListener('input', () => {
                this.params[key] = input.value;
                if (this.callbacks[key]) this.callbacks[key](input.value, key);
            });

            this._currentContainer.appendChild(row);
            return this;
        }

        /**
         * Add a styled text input with expandable options (color, opacity, background)
         * @param {string} key - Unique key
         * @param {Object} config - Configuration
         * @param {string} config.label - Label text
         * @param {string} config.value - Text value
         * @param {string} config.placeholder - Placeholder text
         * @param {string} config.color - Text color (default: current --text-color)
         * @param {number} config.opacity - Text opacity 0-1 (default: 1)
         * @param {string} config.background - Background color (default: 'transparent')
         * @param {Function} config.onChange - Callback (values) => void, values = { text, color, opacity, background }
         */
        addTextStyled(key, config) {
            const themeTextColor = colorToHex(getThemeColor('--text-color', '#ffffff'), '#ffffff');
            const themeBgColor = colorToHex(getThemeColor('--bg-color', '#000000'), '#000000');
            const {
                label,
                value = '',
                placeholder = '',
                color = themeTextColor,
                opacity = 1,
                background = 'transparent',
                onChange
            } = config;

            // Store all values in params
            this.params[key] = { text: value, color, opacity, background };
            if (onChange) this.callbacks[key] = onChange;

            const row = document.createElement('div');
            row.className = 'ctrl-row';
            row.dataset.key = key;
            row.innerHTML = `
                <label class="ctrl-label">${label}</label>
                <div class="ctrl-text-styled">
                    <textarea class="ctrl-textarea" placeholder="${placeholder}">${value}</textarea>
                    <button class="ctrl-text-styled-btn" title="Styling">&#8942;</button>
                    <div class="ctrl-style-popup hidden">
                        <div class="ctrl-style-popup-row">
                            <span class="ctrl-style-popup-label">Farbe</span>
                            <input type="color" class="ctrl-color-input" value="${color}">
                        </div>
                        <div class="ctrl-style-popup-row">
                            <span class="ctrl-style-popup-label">Opacity</span>
                            <input type="range" class="ctrl-opacity-input" min="0" max="1" step="0.05" value="${opacity}">
                            <span class="ctrl-style-value ctrl-opacity-value">${Math.round(opacity * 100)}%</span>
                        </div>
                        <div class="ctrl-style-popup-row">
                            <span class="ctrl-style-popup-label">Hintergrund</span>
                            <input type="color" class="ctrl-bg-input" value="${background === 'transparent' ? themeBgColor : background}">
                        </div>
                    </div>
                </div>
            `;

            const textarea = row.querySelector('textarea');
            const btn = row.querySelector('.ctrl-text-styled-btn');
            const popup = row.querySelector('.ctrl-style-popup');
            const colorInput = row.querySelector('.ctrl-color-input');
            const opacityInput = row.querySelector('.ctrl-opacity-input');
            const opacityValue = row.querySelector('.ctrl-opacity-value');
            const bgInput = row.querySelector('.ctrl-bg-input');

            const fireChange = () => {
                if (this.callbacks[key]) this.callbacks[key](this.params[key], key);
            };

            // Text input
            textarea.addEventListener('input', () => {
                this.params[key].text = textarea.value;
                fireChange();
            });

            // Toggle popup
            bindResponsiveButtonActivation(btn, () => {
                const isHidden = popup.classList.contains('hidden');
                popup.classList.toggle('hidden', !isHidden);
                btn.classList.toggle('active', isHidden);
            });

            // Close popup on outside click
            document.addEventListener('click', (e) => {
                if (!row.contains(e.target)) {
                    popup.classList.add('hidden');
                    btn.classList.remove('active');
                }
            });

            // Color input
            colorInput.addEventListener('input', () => {
                this.params[key].color = colorInput.value;
                fireChange();
            });

            // Opacity input
            opacityInput.addEventListener('input', () => {
                this.params[key].opacity = parseFloat(opacityInput.value);
                opacityValue.textContent = Math.round(this.params[key].opacity * 100) + '%';
                fireChange();
            });

            // Background input
            bgInput.addEventListener('input', () => {
                this.params[key].background = bgInput.value;
                fireChange();
            });

            this._currentContainer.appendChild(row);
            return this;
        }

        /**
         * Add a button row
         */
        addButton(key, config) {
            const { label, title = '', className = '', onClick } = config;

            const row = document.createElement('div');
            row.className = 'ctrl-row';
            row.dataset.key = key;
            row.innerHTML = `
                <button type="button" class="ctrl-button${className ? ` ${className}` : ''}" ${title ? `title="${title}"` : ''}>${label}</button>
            `;

            const button = row.querySelector('button');
            bindResponsiveButtonActivation(button, () => {
                if (onClick) onClick(key);
            });

            this._currentContainer.appendChild(row);
            return this;
        }

        /**
         * Add a horizontal button group row
         */
        addButtonGroup(key, config = {}) {
            const { buttons = [], className = '' } = config;

            const row = document.createElement('div');
            row.className = `ctrl-row ctrl-actions-row${className ? ` ${className}` : ''}`;
            row.dataset.key = key;

            const group = document.createElement('div');
            group.className = 'ctrl-actions-group';

            buttons.forEach((buttonConfig) => {
                if (!buttonConfig) return;

                const {
                    key: buttonKey = '',
                    label = '',
                    title = '',
                    className: buttonClassName = '',
                    onClick
                } = buttonConfig;

                const button = document.createElement('button');
                button.type = 'button';
                button.className = `ctrl-button${buttonClassName ? ` ${buttonClassName}` : ''}`;
                button.textContent = label;
                if (title) button.title = title;
                if (buttonKey) button.dataset.buttonKey = buttonKey;

                bindResponsiveButtonActivation(button, () => {
                    if (typeof onClick === 'function') onClick(buttonKey || key, key, button);
                });

                group.appendChild(button);
            });

            row.appendChild(group);
            this._currentContainer.appendChild(row);
            return this;
        }

        /**
         * Add a pattern picker with canvas-rendered icons
         * @param {string} key - Unique key
         * @param {Object} config - Configuration
         * @param {string} config.label - Optional label above grid
         * @param {Array} config.patterns - Array of { id, name, cells: [[x,y], ...] }
         * @param {string} config.value - Currently selected pattern id (null = none)
         * @param {number} config.buttonSize - Size of each button in px (default: 36)
         * @param {number} config.columns - Number of columns (default: 4)
         * @param {string} config.cellColor - Color for cells (default: current --text-color)
         * @param {Function} config.onChange - Callback (patternId, pattern) => void
         */
        addPatternPicker(key, config) {
            const themeTextColor = getThemeColor('--text-color', '#fff');
            const {
                label = '',
                patterns = [],
                value = null,
                buttonSize = 36,
                columns = 4,
                cellColor = themeTextColor,
                onChange
            } = config;

            this.params[key] = value;
            if (onChange) this.callbacks[key] = onChange;

            const container = document.createElement('div');
            container.className = 'ctrl-pattern-picker';
            container.dataset.key = key;

            if (label) {
                const labelEl = document.createElement('div');
                labelEl.className = 'ctrl-pattern-picker-label';
                labelEl.textContent = label;
                container.appendChild(labelEl);
            }

            const grid = document.createElement('div');
            grid.className = 'ctrl-pattern-grid';
            grid.style.gridTemplateColumns = `repeat(${columns}, ${buttonSize}px)`;
            container.appendChild(grid);

            // Store button references for updating active state
            const buttons = new Map();

            // Helper: render pattern to canvas
            const renderPatternIcon = (cells, size, color) => {
                const canvas = document.createElement('canvas');
                canvas.width = canvas.height = size;
                const ctx = canvas.getContext('2d');

                if (!cells || cells.length === 0) {
                    // Empty pattern = X icon
                    ctx.save();
                    ctx.globalAlpha = 0.3;
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(size * 0.25, size * 0.25);
                    ctx.lineTo(size * 0.75, size * 0.75);
                    ctx.moveTo(size * 0.75, size * 0.25);
                    ctx.lineTo(size * 0.25, size * 0.75);
                    ctx.stroke();
                    ctx.restore();
                    return canvas;
                }

                // Find bounding box
                const xs = cells.map(c => c[0]);
                const ys = cells.map(c => c[1]);
                const minX = Math.min(...xs), maxX = Math.max(...xs);
                const minY = Math.min(...ys), maxY = Math.max(...ys);
                const w = maxX - minX + 1;
                const h = maxY - minY + 1;

                // Calculate cell size with padding
                const padding = 4;
                const available = size - padding * 2;
                const cellSize = Math.max(1, Math.floor(available / Math.max(w, h)));

                // Center offset
                const offsetX = padding + (available - w * cellSize) / 2;
                const offsetY = padding + (available - h * cellSize) / 2;

                // Draw cells
                ctx.fillStyle = color;
                for (const [x, y] of cells) {
                    const px = offsetX + (x - minX) * cellSize;
                    const py = offsetY + (y - minY) * cellSize;
                    const gap = cellSize > 3 ? 1 : 0;
                    ctx.fillRect(px, py, cellSize - gap, cellSize - gap);
                }

                return canvas;
            };

            // Update active state
            const setActive = (patternId) => {
                this.params[key] = patternId;
                buttons.forEach((btn, id) => {
                    btn.classList.toggle('active', id === patternId);
                });
            };

            // Add "None" button first
            const noneBtn = document.createElement('button');
            noneBtn.className = 'ctrl-pattern-btn' + (value === null ? ' active' : '');
            noneBtn.title = 'Zeichnen';
            noneBtn.appendChild(renderPatternIcon(null, buttonSize, cellColor));
            noneBtn.addEventListener('click', () => {
                setActive(null);
                if (this.callbacks[key]) this.callbacks[key](null, null);
            });
            grid.appendChild(noneBtn);
            buttons.set(null, noneBtn);

            // Add pattern buttons
            for (const pattern of patterns) {
                const btn = document.createElement('button');
                btn.className = 'ctrl-pattern-btn' + (value === pattern.id ? ' active' : '');
                btn.title = pattern.name;
                btn.appendChild(renderPatternIcon(pattern.cells, buttonSize, cellColor));
                btn.addEventListener('click', () => {
                    setActive(pattern.id);
                    if (this.callbacks[key]) this.callbacks[key](pattern.id, pattern);
                });
                grid.appendChild(btn);
                buttons.set(pattern.id, btn);
            }

            this._currentContainer.appendChild(container);
            return this;
        }

        /**
         * Add a divider line
         */
        addDivider() {
            const div = document.createElement('div');
            div.className = 'ctrl-divider';
            this._currentContainer.appendChild(div);
            return this;
        }

        /**
         * Add a metrics display section (collapsible)
         * @param {string} key - Unique key for this metrics section
         * @param {Object} config - Configuration object
         * @param {string} config.label - Header label (default: 'ðŸ“Š Metriken')
         * @param {boolean} config.collapsed - Start collapsed (default: false)
         * @param {boolean} config.showFps - Show FPS counter (default: true)
         * @param {number} config.updateInterval - Update interval in ms (default: 200)
         * @param {Function} config.getData - Function returning { items: [{label, value}], total?, secondary?: [{label, value}] }
         * @param {PIXI.Application} config.pixiApp - Optional Pixi app for FPS
         */
        addMetrics(key, config) {
            const {
                label = 'Metriken',
                collapsed = false,
                showFps = true,
                updateInterval = 200,
                getData,
                pixiApp
            } = config;

            const row = document.createElement('div');
            row.className = 'ctrl-row ctrl-metrics';
            row.dataset.key = key;

            let isCollapsed = collapsed;

            row.innerHTML = `
                <div class="ctrl-metrics-header">
                    <span>${label}</span>
                    <span class="ctrl-metrics-toggle">${isCollapsed ? '[+]' : '[\u2212]'}</span>
                </div>
                <div class="ctrl-metrics-content ${isCollapsed ? 'collapsed' : ''}"></div>
            `;

            const header = row.querySelector('.ctrl-metrics-header');
            const toggle = row.querySelector('.ctrl-metrics-toggle');
            const content = row.querySelector('.ctrl-metrics-content');

            header.addEventListener('click', () => {
                isCollapsed = !isCollapsed;
                content.classList.toggle('collapsed', isCollapsed);
                toggle.textContent = isCollapsed ? '[+]' : '[\u2212]';
            });

            // Update function
            const update = () => {
                if (isCollapsed) return;

                let html = '';

                if (getData) {
                    const data = getData();

                    // Regular items
                    if (data.items) {
                        for (const item of data.items) {
                            html += `<div class="ctrl-metrics-row"><span>${item.label}</span><span>${item.value}</span></div>`;
                        }
                    }

                    // Total row
                    if (data.total !== undefined) {
                        html += `<div class="ctrl-metrics-row total"><span>Î£</span><span>${data.total}</span></div>`;
                    }

                    // Secondary items (FPS, pool size, etc.)
                    if (data.secondary) {
                        for (const item of data.secondary) {
                            html += `<div class="ctrl-metrics-row secondary"><span>${item.label}</span><span>${item.value}</span></div>`;
                        }
                    }
                }

                // FPS from Pixi
                if (showFps && pixiApp && pixiApp.ticker) {
                    const fps = Math.round(pixiApp.ticker.FPS);
                    html += `<div class="ctrl-metrics-row secondary"><span>FPS</span><span>${fps}</span></div>`;
                }

                content.innerHTML = html;
            };

            // Start update interval
            const intervalId = setInterval(update, updateInterval);
            update(); // Initial update

            // Store interval for cleanup
            if (!this._metricsIntervals) this._metricsIntervals = {};
            this._metricsIntervals[key] = intervalId;

            this.bodyEl.appendChild(row);
            return this;
        }

        /**
         * Add a metrics overlay ABOVE the panel
         * @param {string} key - Unique key
         * @param {Object} config - Same as addMetrics but displays above panel
         */
        addMetricsOverlay(key, config) {
            const {
                label = 'Stats',
                collapsed = false,
                showFps = true,
                updateInterval = 200,
                getData,
                pixiApp
            } = config;

            // Create overlay element
            const overlay = document.createElement('div');
            overlay.className = 'ctrl-metrics-overlay' + (collapsed ? ' collapsed' : '');
            overlay.dataset.key = key;

            let isCollapsed = collapsed;

            overlay.innerHTML = `
                <div class="ctrl-metrics-header">
                    <span>${label}</span>
                    <span class="ctrl-metrics-toggle">${isCollapsed ? '[+]' : '[\u2212]'}</span>
                </div>
                <div class="ctrl-metrics-content"></div>
            `;

            const header = overlay.querySelector('.ctrl-metrics-header');
            const toggle = overlay.querySelector('.ctrl-metrics-toggle');
            const content = overlay.querySelector('.ctrl-metrics-content');

            header.addEventListener('click', () => {
                isCollapsed = !isCollapsed;
                overlay.classList.toggle('collapsed', isCollapsed);
                toggle.textContent = isCollapsed ? '[+]' : '[\u2212]';
            });

            // Update function
            const update = () => {
                if (isCollapsed) return;

                let html = '';

                if (getData) {
                    const data = getData();

                    if (data.items) {
                        for (const item of data.items) {
                            html += `<div class="ctrl-metrics-row"><span>${item.label}</span><span>${item.value}</span></div>`;
                        }
                    }

                    if (data.total !== undefined) {
                        html += `<div class="ctrl-metrics-row total"><span>Î£</span><span>${data.total}</span></div>`;
                    }

                    if (data.secondary) {
                        for (const item of data.secondary) {
                            html += `<div class="ctrl-metrics-row secondary"><span>${item.label}</span><span>${item.value}</span></div>`;
                        }
                    }
                }

                if (showFps && pixiApp && pixiApp.ticker) {
                    const fps = Math.round(pixiApp.ticker.FPS);
                    html += `<div class="ctrl-metrics-row secondary"><span>FPS</span><span>${fps}</span></div>`;
                }

                content.innerHTML = html;
            };

            // Insert at top of panel (before header)
            this.el.insertBefore(overlay, this.el.firstChild);

            // Start update interval
            const intervalId = setInterval(update, updateInterval);
            update();

            if (!this._metricsIntervals) this._metricsIntervals = {};
            this._metricsIntervals[key] = intervalId;

            return this;
        }

        /**
         * Add a button to the header button group
         * @param {Object} config - { icon, title, onClick, className }
         */
        addHeaderButton(config) {
            const { icon = '?', title = '', onClick, className = '' } = config;

            const btn = document.createElement('button');
            btn.className = 'ctrl-header-btn ' + className;
            btn.title = title;
            btn.textContent = icon;
            bindResponsiveButtonActivation(btn, () => {
                if (onClick) onClick(btn);
            });

            // Insert before layout toggle so expand button stays rightmost
            const toggleBtn = this.headerButtonsEl.querySelector('.ctrl-layout-toggle');
            if (toggleBtn) {
                this.headerButtonsEl.insertBefore(btn, toggleBtn);
            } else {
                this.headerButtonsEl.appendChild(btn);
            }
            return this;
        }

        /**
         * Add a small reset button to the panel header
         * @param {Object} config - { icon, title, onClick }
         */
        addResetButton(config) {
            const { icon = '\u21BA', title = 'Reset', onClick } = config;
            const btn = document.createElement('button');
            btn.className = 'ctrl-header-btn danger';
            btn.title = title;
            btn.textContent = icon;
            bindResponsiveButtonActivation(btn, () => {
                if (onClick) onClick();
            });

            // Insert before layout toggle (same logic as enableUndoRedo)
            const layoutToggle = this.headerButtonsEl.querySelector('.ctrl-layout-toggle');
            if (layoutToggle) {
                this.headerButtonsEl.insertBefore(btn, layoutToggle);
            } else {
                this.headerButtonsEl.appendChild(btn);
            }
            return this;
        }

        /**
         * Enable Undo/Redo functionality with header buttons and keyboard shortcuts
         * @param {Object} config - { onUndo, onRedo, onCanUndoChange, onCanRedoChange }
         */
        enableUndoRedo(config) {
            const { onUndo, onRedo, onCanUndoChange, onCanRedoChange } = config;

            // History Stack
            this._undoHistory = [];
            this._redoHistory = [];
            this._undoRedoEnabled = true;
            this._onUndo = onUndo;
            this._onRedo = onRedo;
            this._onCanUndoChange = onCanUndoChange;
            this._onCanRedoChange = onCanRedoChange;

            // Create Undo Button - simple, reliable
            this._undoBtn = document.createElement('button');
            this._undoBtn.className = 'ctrl-header-btn';
            this._undoBtn.title = 'Undo (Ctrl+Z)';
            this._undoBtn.textContent = '\u21A9';
            this._undoBtn.disabled = true;
            bindResponsiveButtonActivation(this._undoBtn, () => {
                this.undo();
            });

            // Create Redo Button
            this._redoBtn = document.createElement('button');
            this._redoBtn.className = 'ctrl-header-btn';
            this._redoBtn.title = 'Redo (Ctrl+Shift+Z)';
            this._redoBtn.textContent = '\u21AA';
            this._redoBtn.disabled = true;
            bindResponsiveButtonActivation(this._redoBtn, () => {
                this.redo();
            });

            // Add to header (before layout toggle button if it exists)
            const layoutToggle = this.headerButtonsEl.querySelector('.ctrl-layout-toggle');
            if (layoutToggle) {
                this.headerButtonsEl.insertBefore(this._redoBtn, layoutToggle);
                this.headerButtonsEl.insertBefore(this._undoBtn, this._redoBtn);
            } else {
                this.headerButtonsEl.appendChild(this._undoBtn);
                this.headerButtonsEl.appendChild(this._redoBtn);
            }

            // Global keyboard shortcuts
            this._keyHandler = (e) => {
                if (!this._undoRedoEnabled) return;

                const key = e.key.toLowerCase();

                // Ctrl+Z = Undo (ohne Shift)
                if (e.ctrlKey && key === 'z' && !e.shiftKey) {
                    e.preventDefault();
                    this.undo();
                }
                // Ctrl+Shift+Z = Redo
                else if (e.ctrlKey && key === 'z' && e.shiftKey) {
                    e.preventDefault();
                    this.redo();
                }
                // Ctrl+Y = Redo (alternative)
                else if (e.ctrlKey && key === 'y') {
                    e.preventDefault();
                    this.redo();
                }
            };

            document.addEventListener('keydown', this._keyHandler);

            return this;
        }

        /**
         * Save current state to undo history
         * @param {*} state - Any serializable state object
         */
        saveState(state) {
            if (!this._undoRedoEnabled) return this;

            // Deep clone the state to avoid reference issues
            const clonedState = JSON.parse(JSON.stringify(state));

            // Don't save if identical to last state
            if (this._undoHistory.length > 0) {
                const lastState = this._undoHistory[this._undoHistory.length - 1];
                if (JSON.stringify(lastState) === JSON.stringify(clonedState)) {
                    return this;
                }
            }

            this._undoHistory.push(clonedState);

            // Clear redo history when new action happens
            this._redoHistory = [];

            this._updateUndoRedoButtons();
            return this;
        }

        /**
         * Perform undo operation
         */
        undo() {
            if (!this._undoRedoEnabled || this._undoHistory.length === 0) return;

            // Move current state to redo
            const currentState = this._undoHistory.pop();
            this._redoHistory.push(currentState);

            // Get previous state
            const previousState = this._undoHistory.length > 0
                ? this._undoHistory[this._undoHistory.length - 1]
                : null;

            if (this._onUndo) {
                // Deep clone before passing to callback
                const clonedPrevious = previousState ? JSON.parse(JSON.stringify(previousState)) : null;
                this._onUndo(clonedPrevious, JSON.parse(JSON.stringify(currentState)));
            }

            this._updateUndoRedoButtons();
        }

        /**
         * Perform redo operation
         */
        redo() {
            if (!this._undoRedoEnabled || this._redoHistory.length === 0) return;

            // Move from redo to undo
            const state = this._redoHistory.pop();
            this._undoHistory.push(state);

            if (this._onRedo) {
                // Deep clone before passing to callback
                this._onRedo(JSON.parse(JSON.stringify(state)));
            }

            this._updateUndoRedoButtons();
        }

        /**
         * Check if undo is available
         */
        canUndo() {
            return this._undoRedoEnabled && this._undoHistory.length > 0;
        }

        /**
         * Check if redo is available
         */
        canRedo() {
            return this._undoRedoEnabled && this._redoHistory.length > 0;
        }

        /**
         * Clear all undo/redo history
         */
        clearHistory() {
            if (!this._undoRedoEnabled) return;
            this._undoHistory = [];
            this._redoHistory = [];
            this._updateUndoRedoButtons();
        }

        /**
         * Update undo/redo button states
         */
        _updateUndoRedoButtons() {
            const canUndo = this.canUndo();
            const canRedo = this.canRedo();

            if (this._undoBtn) {
                this._undoBtn.disabled = !canUndo;
            }
            if (this._redoBtn) {
                this._redoBtn.disabled = !canRedo;
            }

            if (this._onCanUndoChange) this._onCanUndoChange(canUndo);
            if (this._onCanRedoChange) this._onCanRedoChange(canRedo);
        }

        /**
         * Add a play/pause toggle button to the panel header
         * @param {Object} config - { paused, iconPlay, iconPause, title, onChange }
         */
        addPauseButton(config) {
            const {
                paused = false,
                iconPlay = '\u25B6',
                iconPause = '\u23F8',
                title = 'Play/Pause',
                onChange
            } = config;

            let isPaused = paused;

            const btn = document.createElement('button');
            btn.className = 'ctrl-header-btn';
            btn.title = title;
            btn.textContent = isPaused ? iconPlay : iconPause;
            bindResponsiveButtonActivation(btn, () => {
                isPaused = !isPaused;
                btn.textContent = isPaused ? iconPlay : iconPause;
                if (onChange) onChange(isPaused);
            });

            this.headerButtonsEl.appendChild(btn);
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

            const row = this.bodyEl?.querySelector(`[data-key="${key}"]`);
            if (!row) return this;

            const checkbox = row.querySelector('input[type="checkbox"]');
            if (checkbox) {
                checkbox.checked = !!value;
            }

            const range = row.querySelector('.ctrl-range');
            const valueInput = row.querySelector('.ctrl-value-input');
            if (range || valueInput) {
                const cfg = this._sliderConfigs[key];
                const numericValue = Number.isFinite(Number(value)) ? Number(value) : 0;
                const decs = cfg ? getCurrentSliderDecimals(cfg, cfg.defaultDecimals ?? 0) : 0;
                const bounds = getProjectedSliderBounds(cfg, numericValue);

                if (cfg) cfg.decimals = decs;
                if (range) {
                    range.min = bounds.min;
                    range.max = bounds.max;
                    range.step = getProjectedSliderStep(cfg ? cfg.step : undefined);
                    range.value = clamp(numericValue, bounds.min, bounds.max);
                }
                if (valueInput) valueInput.value = formatValue(numericValue, decs);
            }

            const textarea = row.querySelector('.ctrl-textarea');
            if (textarea && typeof value !== 'object') {
                textarea.value = value ?? '';
            }

            const textInput = row.querySelector('.ctrl-input');
            if (textInput && typeof value !== 'object') {
                textInput.value = value ?? '';
            }

            if (this._selectControls[key]) {
                this._updateSelectUI(key, value);
            }

            if (this._countPickerControls[key]) {
                this._updateCountPickerUI(key, value);
            }

            return this;
        }

        setCountPickerOptions(key, options = {}, value = null) {
            const control = this._countPickerControls[key];
            if (!control) return this;

            control.options = this._normalizeCountPickerOptions(options);
            const nextValue = value == null ? this.params[key] : value;
            this.params[key] = this._sanitizeCountPickerValue(control.options, nextValue);
            this._updateCountPickerUI(key, this.params[key]);
            return this;
        }

        /**
         * Update slider configuration programmatically and refresh UI
         */
        setSliderConfig(key, updates = {}) {
            const cfg = this._sliderConfigs[key];
            if (!cfg || !updates || typeof updates !== 'object') return this;

            if (Object.prototype.hasOwnProperty.call(updates, 'min')) cfg.min = updates.min;
            if (Object.prototype.hasOwnProperty.call(updates, 'max')) cfg.max = updates.max;
            if (Object.prototype.hasOwnProperty.call(updates, 'step')) cfg.step = updates.step;
            if (Object.prototype.hasOwnProperty.call(updates, 'baseDecimals')) cfg.baseDecimals = updates.baseDecimals;

            syncSliderDecimals(cfg, cfg.defaultDecimals ?? cfg.baseDecimals ?? 0);
            this._updateSliderFromConfig(key);
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
                if (!visible && this._activeSelectKey === key) {
                    this._closeSelectPopup();
                }
                if (!visible && this._activeCountPickerKey === key) {
                    this._closeCountPickerPopup();
                }
                requestAnimationFrame(() => this._refreshMobileSheetLayout?.());
            }
            return this;
        }

        setRowDisabled(key, disabled) {
            const row = this.bodyEl.querySelector(`[data-key="${key}"]`);
            if (!row) return this;

            const shouldDisable = !!disabled;
            row.classList.toggle('ctrl-row-disabled', shouldDisable);
            row.setAttribute('aria-disabled', shouldDisable ? 'true' : 'false');

            row.querySelectorAll('input, textarea, select, button').forEach((el) => {
                el.disabled = shouldDisable;
            });

            if (shouldDisable) {
                if (this._activeSelectKey === key) this._closeSelectPopup(true);
                if (this._activeCountPickerKey === key) this._closeCountPickerPopup(true);
                if (this._activeConfigKey === key) this._closeConfigPopup();
            }

            return this;
        }

        /**
         * Remove the panel from DOM
         */
        destroy() {
            // Remove global keyboard handler if undo/redo was enabled
            if (this._keyHandler) {
                document.removeEventListener('keydown', this._keyHandler);
                this._keyHandler = null;
            }

            if (this._handleMobileSheetResize) {
                window.removeEventListener('resize', this._handleMobileSheetResize);
                this._handleMobileSheetResize = null;
            }

            if (this._handleMobileViewportChange && window.visualViewport) {
                window.visualViewport.removeEventListener('resize', this._handleMobileViewportChange);
                window.visualViewport.removeEventListener('scroll', this._handleMobileViewportChange);
                this._handleMobileViewportChange = null;
            }

            if (this._mobileSheetResizeObserver) {
                this._mobileSheetResizeObserver.disconnect();
                this._mobileSheetResizeObserver = null;
            }

            if (this._bodyMutationObserver) {
                this._bodyMutationObserver.disconnect();
                this._bodyMutationObserver = null;
            }

	            if (this._mobileLayoutChangeFrame) {
	                cancelAnimationFrame(this._mobileLayoutChangeFrame);
	                this._mobileLayoutChangeFrame = 0;
	            }

	            if (this._mobileLayoutChangeTimeout) {
	                clearTimeout(this._mobileLayoutChangeTimeout);
	                this._mobileLayoutChangeTimeout = 0;
	            }

		            if (this._mobileInitialLayoutFrame) {
		                cancelAnimationFrame(this._mobileInitialLayoutFrame);
		                this._mobileInitialLayoutFrame = 0;
		            }

            this._clearMobileCanvasOcclusion();

            this._closeSelectPopup();
            this._closeCountPickerPopup();
            document.removeEventListener('click', this._handleSelectDocumentClick);
            document.removeEventListener('click', this._handleCountPickerDocumentClick);
            window.removeEventListener('resize', this._handleSelectViewportChange);

            if (this.bodyEl) {
                this.bodyEl.removeEventListener('scroll', this._handleSelectViewportChange);
            }

            if (this._selectPopupEl && this._selectPopupEl.parentNode) {
                this._selectPopupEl.parentNode.removeChild(this._selectPopupEl);
                this._selectPopupEl = null;
            }

            if (this._countPickerPopupEl && this._countPickerPopupEl.parentNode) {
                this._countPickerPopupEl.parentNode.removeChild(this._countPickerPopupEl);
                this._countPickerPopupEl = null;
            }

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
        injectCSS,

        /**
         * List of standard fonts for pickers
         */
        DEFAULT_FONTS: [
            'Dosis', 'Inter', 'LINE Seed JP', 'Lora', 'Montserrat', 'Roboto', 'Roboto Serif',
            'Rubik Doodle Triangles', 'Rubik Lines', 'Vollkorn'
        ],
        FONT_CONFIG: {
            'Dosis': { min: 200, max: 800 },
            'Inter': { min: 100, max: 900 },
            'LINE Seed JP': null,
            'Lora': { min: 400, max: 700 },
            'Montserrat': { min: 100, max: 900 },
            'Roboto': { min: 100, max: 900 },
            'Roboto Serif': { min: 100, max: 900 },
            'Rubik Broken Fax': null,
            'Rubik Doodle Triangles': null,
            'Rubik Lines': null,
            'Rubik Maze': null,
            'Vollkorn': { min: 400, max: 900 }
        }
    };

})();

