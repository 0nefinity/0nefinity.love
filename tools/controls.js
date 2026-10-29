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
 *   // Reset-Knopf (↺) hat jedes Panel von selbst: alle Regler auf Voreinstellung, mit Rueckgaengig.
 *   // Eigener Zustand der Seite haengt sich an; eine zurueckgegebene Funktion macht ihn rueckgaengig:
 *   panel.addResetButton({ onClick: () => resetWorld(), afterReset: () => restartClock() });
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
 *       .addSlider('rot',   { label: 'Rotation', min: 0, max: 360, step: 0.01, wrap: true, value: 0, onChange: v => config.rot = v })  // wrap: ueber 360 laeuft bei 0 weiter
 *   ;
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 */

(function () {
    'use strict';

    // Shared styles live in meta.css
    function injectCSS() {
        if (document.getElementById('ctrl-panel-fonts')) return;
        if (document.querySelector('link[data-meta-fonts-auswahl], link[href="/fonts-auswahl.css"]')) return;

        const link = document.createElement('link');
        link.id = 'ctrl-panel-fonts';
        link.rel = 'stylesheet';
        link.href = '/fonts-auswahl.css';
        document.head.appendChild(link);
    }

    // Stylesheet-Wachposten: Ein Browser kann neues controls.js mit altem meta.css mischen. Die Symbolspalte
    // ist dann ein Haufen untereinander. Kein Grid = Stylesheet veraltet: einmal am Cache vorbei holen und neu laden,
    // klappt das nicht, laut melden.
    function verifySymbolCss(strip, row) {
        if (!strip.isConnected || getComputedStyle(strip).display === 'grid') return;
        const FLAG = 'ctrl-css-heal';
        const warn = (msg, err) => {
            console.error('[controls] ' + msg, err || '');
            const el = document.createElement('div');
            el.setAttribute('role', 'alert');
            el.textContent = msg;
            row.prepend(el);
        };
        let tried = false;
        try { tried = !!sessionStorage.getItem(FLAG); sessionStorage.setItem(FLAG, '1'); } catch (e) { tried = true; }
        if (tried) { warn('meta.css is out of date and could not be refreshed; please reload the page'); return; }
        fetch('/meta.css', { cache: 'reload' })
            .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); location.reload(); })
            .catch(e => warn('Reloading meta.css failed: ' + (e && e.message || e), e));
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

    // Hoechster erreichter Wert eines wachsenden Reglers, je Seite und Regler fuer die Browser-Sitzung.
    // Ohne nutzbaren sessionStorage bleibt er im Speicher der Seite.
    const sliderPeaks = {};
    function sliderPeakKey(key) { return '018.sliderpeak:' + location.pathname + ':' + key; }
    function loadSliderPeak(key) {
        let v = sliderPeaks[key];
        try {
            const raw = sessionStorage.getItem(sliderPeakKey(key));
            if (raw !== null) {
                const n = Number(raw);
                if (Number.isFinite(n) && !(n <= (v ?? -Infinity))) v = n;
            }
        } catch (_) { /* Speicher gesperrt: Wert bleibt im Speicher */ }
        return v ?? -Infinity;
    }
    function saveSliderPeak(key, value) {
        sliderPeaks[key] = value;
        try { sessionStorage.setItem(sliderPeakKey(key), String(value)); } catch (_) { /* Speicher gesperrt */ }
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

    // wrap-Slider (Winkel): Periode = max - min, max faellt auf min (360 -> 0).
    function wrapSliderValue(value, config) {
        const { min, max } = getProjectedSliderBounds(config, value);
        const period = max - min;
        if (!(period > 0) || !Number.isFinite(value)) return value;
        return min + (((value - min) % period) + period) % period;
    }

    function getProjectedSliderStep(step) {
        return Number.isFinite(step) && step > 0 ? String(step) : 'any';
    }

    function getSliderTransform(config) {
        return config?.transform && typeof config.transform === 'object'
            ? config.transform
            : null;
    }

    function toSliderRangeValue(value, config) {
        const numericValue = Number.isFinite(Number(value)) ? Number(value) : 0;
        const transform = getSliderTransform(config);
        if (typeof transform?.toSliderValue === 'function') {
            const transformedValue = Number(transform.toSliderValue(numericValue, config));
            if (Number.isFinite(transformedValue)) return transformedValue;
        }
        return numericValue;
    }

    function fromSliderRangeValue(value, config) {
        const numericValue = Number.isFinite(Number(value)) ? Number(value) : 0;
        const transform = getSliderTransform(config);
        if (typeof transform?.fromSliderValue === 'function') {
            const transformedValue = Number(transform.fromSliderValue(numericValue, config));
            if (Number.isFinite(transformedValue)) return transformedValue;
        }
        return numericValue;
    }

    function formatSliderControlValue(value, decimals, config) {
        const transform = getSliderTransform(config);
        if (typeof transform?.formatDisplayValue === 'function') {
            const formattedValue = transform.formatDisplayValue(value, decimals, config);
            if (formattedValue != null) return String(formattedValue);
        }
        return formatValue(value, decimals);
    }

    // Size the value field for the widest number it can show (range ends + current), so "315.00" or "-200.00" never clips.
    function fitSliderValueInput(input, config, value, decimals) {
        if (!input) return;
        const candidates = [value];
        if (config) candidates.push(config.min, config.max);
        let chars = 1;
        for (const v of candidates) {
            if (!Number.isFinite(Number(v))) continue;
            chars = Math.max(chars, formatSliderControlValue(Number(v), decimals, config).length);
        }
        input.style.width = `calc(${chars}ch + 0.4em)`;
    }

    function parseSliderControlValue(value, config) {
        const transform = getSliderTransform(config);
        if (typeof transform?.parseDisplayValue === 'function') {
            const parsedValue = Number(transform.parseDisplayValue(value, config));
            if (!Number.isNaN(parsedValue)) return parsedValue;
        }
        return parseNumericValue(value);
    }

    // Popup-Felder (min/max/step): opt-in-Hooks transform.formatConfigValue / parseConfigValue, sonst wie bisher.
    function formatConfigFieldValue(cfg, type) {
        const transform = getSliderTransform(cfg);
        if (typeof transform?.formatConfigValue === 'function') {
            const formattedValue = transform.formatConfigValue(cfg[type], type, cfg);
            if (formattedValue != null) return String(formattedValue);
        }
        return String(cfg[type] ?? '');
    }

    function parseConfigFieldValue(cfg, text) {
        const transform = getSliderTransform(cfg);
        if (typeof transform?.parseConfigValue === 'function') {
            const parsedValue = Number(transform.parseConfigValue(text, cfg));
            if (!Number.isNaN(parsedValue)) return parsedValue;
        }
        return parseNumericValue(text);
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
        const fullHeight = Math.max(1, visualViewport?.height || window.innerHeight || layoutHeight);
        // VirtualKeyboard-Modus (nur solange ein Panel-Textfeld Fokus hat): die Tastatur verkleinert nichts, die Seite zieht
        // das Viewport also nicht mehr; die verdeckte Hoehe kommt aus boundingRect, nicht aus visualViewport.
        const vk = navigator.virtualKeyboard;
        const kbHeight = vk && vk.overlaysContent ? Math.max(0, vk.boundingRect?.height ?? 0) : 0;
        const height = Math.max(1, fullHeight - kbHeight);
        const offsetLeft = Math.max(0, visualViewport?.offsetLeft || 0);
        const offsetTop = Math.max(0, visualViewport?.offsetTop || 0);
        const bottomInset = Math.max(0, layoutHeight - (offsetTop + fullHeight));
        const rightInset = Math.max(0, layoutWidth - (offsetLeft + width));

        return {
            layoutWidth,
            layoutHeight,
            width,
            height,
            offsetLeft,
            offsetTop,
            bottomInset,
            rightInset,
            keyboardHeight: kbHeight
        };
    }

    // === VOREINSTELLUNGEN JE SEITE ===
    // Der Editor (dev, eingeloggt) schreibt { "<key>": Wert } als <script type="application/json"
    // id="control-defaults"> in den Head der Seite; Veroeffentlichen bringt sie mit der Seite live.
    // Vorrang: URL > Voreinstellung > Code-Wert. Traegt die URL Zustand (ausser ?von=), gilt nur die URL.
    const DEFAULTS_ID = 'control-defaults';
    const DEFAULTS_RE = /[ \t]*<script type="application\/json" id="control-defaults">[\s\S]*?<\/script>\n?/;

    const pageDefaults = {
        parse(text) {
            if (text == null) return {};
            let data;
            try { data = JSON.parse(text); } catch (e) { throw new Error(`#${DEFAULTS_ID}: kaputtes JSON (${e.message})`); }
            if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`#${DEFAULTS_ID}: erwartet ein Objekt`);
            return data;
        },
        urlCarriesState(search) {
            const p = new URLSearchParams(search || '');
            p.delete('von');
            return [...p.keys()].length > 0;
        },
        upsertScript(html, values) {
            const rest = html.replace(DEFAULTS_RE, '');
            if (!Object.keys(values).length) return rest;
            const at = rest.search(/<\/head\s*>/i);
            if (at < 0) throw new Error('Seite hat kein </head>, Voreinstellungen nicht gespeichert');
            const json = JSON.stringify(values).replace(/</g, '\\u003c');
            return rest.slice(0, at) + `<script type="application/json" id="${DEFAULTS_ID}">${json}</script>\n` + rest.slice(at);
        },
    };

    let pageDefaultsCache = null;
    function currentPageDefaults() {
        if (pageDefaultsCache) return pageDefaultsCache;
        const el = document.getElementById(DEFAULTS_ID);
        let values = {};
        try {
            values = pageDefaults.parse(el ? el.textContent : null);
        } catch (e) {
            // Laut, aber die Seite laeuft mit den Code-Werten weiter: Besucher sollen keine kaputte Seite sehen.
            console.error('[controls] ' + e.message);
        }
        pageDefaultsCache = { values, ignore: pageDefaults.urlCarriesState(location.search) };
        return pageDefaultsCache;
    }

    function cloneValue(v) {
        return v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v;
    }

    // seen: Keys, deren Code-Wert schon erfasst ist (Seiten, die ihr Panel neu bauen, uebergeben danach
    // ihren aktuellen Stand, nicht den Code-Wert). code: der Code-Wert je Key.
    const pageDefaultState = { seen: new Set(), code: {}, panels: [], watching: false };

    function isEditing() {
        return document.documentElement.classList.contains('oe-editing');
    }

    // Bearbeiten-Modus (html.oe-editing, gesetzt von tools/editor.js): nur dann gibt es die Voreinstellungs-Leiste
    // und editierbare Beschriftungen. Regler aendern sich auch ueber Canvas-Ziehen und Seitencode, ohne DOM-Ereignis
    // im Panel; deshalb prueft ein kurzer Takt, solange der Modus laeuft (plus sofort nach jeder Eingabe).
    let presetTimer = 0;
    function watchEditMode() {
        if (pageDefaultState.watching || typeof MutationObserver === 'undefined') return;
        pageDefaultState.watching = true;
        const sync = () => {
            if (isEditing()) {
                if (!presetTimer) presetTimer = setInterval(refreshPresetBars, 300);
                refreshPresetBars();
            } else {
                clearInterval(presetTimer);
                presetTimer = 0;
                cancelLabelEdit();
                refreshPresetBars();
            }
        };
        new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        const soon = () => { if (isEditing()) requestAnimationFrame(refreshPresetBars); };
        ['input', 'change', 'pointerup', 'keyup'].forEach(t => document.addEventListener(t, soon, true));
        sync();
    }

    async function editApi(method, route, body) {
        const opts = { method, credentials: 'same-origin', headers: { Accept: 'application/json' } };
        if (body) {
            opts.headers['Content-Type'] = 'application/json';
            opts.headers['X-0ne-Edit'] = '1';
            opts.body = JSON.stringify(body);
        }
        let res;
        try {
            res = await fetch('/api/edit/' + route, opts);
        } catch (e) {
            throw new Error('Editor-Dienst nicht erreichbar');
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data.error || 'HTTP ' + res.status) + (data.detail ? ' (' + data.detail + ')' : ''));
        return data;
    }

    // Meldung unten mittig. undo: Knopf "Rückgängig" (Gmail-Muster, 6 s). retry: Fehler mit "nochmal", bleibt stehen.
    function defaultsToast(text, { undo = null, retry = null, fatal = false } = {}) {
        document.querySelectorAll('.ctrl-defaults-toast').forEach(t => t.remove());
        const t = document.createElement('div');
        t.className = 'ctrl-reset-toast ctrl-defaults-toast';
        t.dataset.oeUi = '';
        t.dataset.kind = retry || fatal ? 'error' : '';
        t.setAttribute('role', retry || fatal ? 'alert' : 'status');
        const label = document.createElement('span');
        label.textContent = text;
        t.append(label);
        const addBtn = (name, fn) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = name;
            b.addEventListener('click', () => { t.remove(); if (fn) fn(); });
            t.append(b);
        };
        if (retry || fatal) {
            if (retry) addBtn('nochmal', retry);
            addBtn('schließen');
            console.error('[controls] ' + text);
        } else {
            if (undo) addBtn('Rückgängig', undo);
            setTimeout(() => t.remove(), undo ? 6000 : 4000);
        }
        document.body.appendChild(t);
    }

    // Schreibt in den Quelltext der Seite (Editor-Endpunkt "source", Commit auf claude-dev). Alle Schreibzuege laufen
    // nacheinander (Voreinstellungen und Beschriftungen), damit sie sich nicht gegenseitig ueberschreiben.
    let sourceQueue = Promise.resolve();
    function writeSource(transform) {
        const run = async () => {
            const path = location.pathname;
            const src = await editApi('GET', 'source?path=' + encodeURIComponent(path));
            const text = transform(src.text);
            const r = await editApi('POST', 'source', { path, text, sha: src.sha });
            window.dispatchEvent(new CustomEvent('controls:defaults-saved', { detail: { live_differs: r.live_differs } }));
            return r;
        };
        const p = sourceQueue.then(run);
        sourceQueue = p.catch(() => {});
        return p;
    }

    // Optimistisch: die Voreinstellung gilt sofort (Leiste verschwindet), das Schreiben laeuft im Hintergrund.
    // Scheitert es, kehrt der alte Stand zurueck (die Leiste erscheint wieder) und die Meldung bietet "nochmal".
    function savePageDefaults(mutate, okText, undoValues = null) {
        const cur = currentPageDefaults();
        const prev = cur.values;
        let next;
        try {
            next = mutate({ ...prev });
        } catch (e) {
            defaultsToast('Voreinstellung nicht gespeichert: ' + e.message, { retry: () => savePageDefaults(mutate, okText, undoValues) });
            return Promise.resolve();
        }
        cur.values = next;
        refreshPresetBars();
        return writeSource(html => pageDefaults.upsertScript(html, next)).then(() => {
            defaultsToast(okText, undoValues ? { undo: () => savePageDefaults(() => ({ ...undoValues }), 'Voreinstellung zurückgenommen') } : {});
        }, (e) => {
            if (cur.values === next) cur.values = prev;
            refreshPresetBars();
            defaultsToast('Voreinstellung nicht gespeichert: ' + e.message, { retry: () => savePageDefaults(mutate, okText, undoValues) });
        });
    }

    // === VOREINSTELLUNGS-LEISTE (nur Bearbeiten-Modus) ===
    // Ein Knopf fuer die ganze Seite: alle Regler, die vom Startzustand (defaultOf) abweichen, werden auf einmal
    // zur Voreinstellung. Gleicht ein Wert dem Code-Wert, faellt sein Eintrag weg.
    function changedValues() {
        const out = {};
        for (const panel of livePanels()) {
            for (const key of Object.keys(panel.params)) {
                if (!pageDefaultState.seen.has(key)) continue;
                const cur = panel.params[key];
                if (JSON.stringify(cur) !== JSON.stringify(panel.defaultOf(key))) out[key] = cloneValue(cur);
            }
        }
        return out;
    }

    function savePreset() {
        const changed = changedValues();
        const keys = Object.keys(changed);
        if (!keys.length) return;
        const undoValues = { ...currentPageDefaults().values };
        const code = pageDefaultState.code;
        savePageDefaults(next => {
            for (const k of keys) {
                if (JSON.stringify(changed[k]) === JSON.stringify(code[k])) delete next[k];
                else next[k] = changed[k];
            }
            return next;
        }, keys.length === 1 ? 'Voreinstellung gespeichert (1 Wert, auf dev)' : `Voreinstellung gespeichert (${keys.length} Werte, auf dev)`, undoValues);
    }

    function buildPresetBar() {
        const bar = document.createElement('div');
        bar.className = 'ctrl-preset-bar';
        bar.dataset.oeUi = '';
        bar.setAttribute('role', 'group');
        bar.setAttribute('aria-label', 'Voreinstellung');
        bar.hidden = true;
        const count = document.createElement('span');
        count.className = 'ctrl-preset-count';
        const save = document.createElement('button');
        save.type = 'button';
        save.className = 'ctrl-preset-save';
        save.textContent = 'als Voreinstellung speichern';
        const reset = document.createElement('button');
        reset.type = 'button';
        reset.className = 'ctrl-preset-reset';
        reset.textContent = 'zurücksetzen';
        bindResponsiveButtonActivation(save, () => { savePreset(); refreshPresetBars(); });
        bindResponsiveButtonActivation(reset, () => { resetPage(); refreshPresetBars(); });
        bar.append(count, save, reset);
        return bar;
    }

    function refreshPresetBars() {
        const n = isEditing() ? Object.keys(changedValues()).length : 0;
        for (const panel of pageDefaultState.panels) {
            if (!panel.bodyEl) continue;
            let bar = panel._presetBar;
            if (!bar) {
                if (!n) continue;
                bar = panel._presetBar = buildPresetBar();
            }
            if (n && bar.parentNode !== panel.bodyEl) panel.bodyEl.prepend(bar);
            else if (n && panel.bodyEl.firstChild !== bar) panel.bodyEl.prepend(bar);
            bar.hidden = !n;
            const text = n === 1 ? '1 geändert' : `${n} geändert`;
            const c = bar.firstChild;
            if (c.textContent !== text) c.textContent = text;
        }
    }

    // === BESCHRIFTUNGEN BEARBEITEN (nur Bearbeiten-Modus) ===
    // Klick auf Label, Abschnittstitel oder Knopftext oeffnet ein Feld darueber; Enter/Verlassen uebernimmt, Esc
    // verwirft. Der neue Text steht sofort da, das Schreiben in den Seitenquelltext laeuft im Hintergrund: der
    // String wird dort ersetzt, wo die Seite ihn definiert. Steht er nur in controls.js (gilt fuer alle Seiten)
    // oder ist er dynamisch erzeugt, bleibt der alte Text und eine Meldung sagt warum.
    const LABEL_SEL = '.ctrl-panel .ctrl-label, .ctrl-panel .ctrl-section-title, .ctrl-panel .ctrl-button';
    const CONTROLS_SRC = (document.currentScript && document.currentScript.src) || '/tools/controls.js';
    let labelEdit = null;

    function labelTarget(node) {
        const el = node && node.closest && node.closest(LABEL_SEL);
        return el && !el.children.length && el.textContent.trim() ? el : null;
    }

    function labelKey(el) {
        const sec = el.closest('.ctrl-section');
        if (el.matches('.ctrl-section-title')) return sec ? sec.id.replace(/^.*-section-/, '') : '';
        const row = el.closest('.ctrl-row[data-key]');
        return el.dataset.buttonKey || (row ? row.dataset.key : '');
    }

    function cancelLabelEdit() {
        if (!labelEdit) return;
        const { input, off } = labelEdit;
        labelEdit = null;
        off();
        input.remove();
    }

    function commitLabelEdit() {
        if (!labelEdit) return;
        const { el, input } = labelEdit;
        const oldText = el.textContent;
        const newText = input.value.replace(/\s+/g, ' ').trim();
        cancelLabelEdit();
        if (!newText || newText === oldText.trim()) return;
        renameLabel(el, oldText.trim(), newText, labelKey(el));
    }

    function startLabelEdit(el) {
        if (labelEdit && labelEdit.el === el) return;
        commitLabelEdit();
        const input = document.createElement('input');
        input.type = 'search';
        input.className = 'ctrl-label-edit';
        input.dataset.oeUi = '';
        input.value = el.textContent.trim();
        input.setAttribute('aria-label', 'Beschriftung');
        input.autocomplete = 'off';
        input.setAttribute('data-1p-ignore', '');
        input.setAttribute('data-lpignore', 'true');
        input.setAttribute('data-bwignore', '');
        input.setAttribute('data-form-type', 'other');
        const place = () => {
            const r = el.getBoundingClientRect();
            const w = Math.min(Math.max(r.width + 24, 140), window.innerWidth - 16);
            input.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
            input.style.top = r.top + r.height / 2 + 'px';
            input.style.width = w + 'px';
        };
        place();
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);
        const off = () => {
            window.removeEventListener('resize', place);
            window.removeEventListener('scroll', place, true);
        };
        input.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); commitLabelEdit(); }
            else if (e.key === 'Escape') { e.preventDefault(); cancelLabelEdit(); }
        });
        input.addEventListener('blur', () => { if (labelEdit && labelEdit.input === input) commitLabelEdit(); });
        document.body.appendChild(input);
        labelEdit = { el, input, off };
        input.focus();
        input.select();
    }

    // Klicks auf Beschriftungen gehoeren im Bearbeiten-Modus dem Editieren: weder Label-Weiterleitung an den
    // Regler noch die Aktion eines Knopfes laufen. (Touch-Knoepfe feuern schon bei pointerdown.)
    function labelClickGuard(e) {
        if (!isEditing()) return;
        const el = labelTarget(e.target);
        if (!el) return;
        if (e.type === 'click') {
            e.preventDefault();
            startLabelEdit(el);
        }
        e.stopImmediatePropagation();
    }
    if (typeof document !== 'undefined' && document.addEventListener) {
        ['pointerdown', 'touchstart', 'click'].forEach(t => document.addEventListener(t, labelClickGuard, true));
    }

    function jsLiteralText(text, q) {
        let out = text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r').split(q).join('\\' + q);
        if (q === '`') out = out.replace(/\$\{/g, '\\${');
        return out.replace(/<\//g, '<\\/');
    }

    function labelHits(src, label) {
        const hits = [];
        for (const q of ["'", '"', '`']) {
            const lit = q + jsLiteralText(label, q) + q;
            let i = -1;
            while ((i = src.indexOf(lit, i + 1)) >= 0) {
                hits.push({ start: i + 1, end: i + lit.length - 1, q, at: i, ctx: /\b(label|title|text|caption|name)\s*:\s*$/.test(src.slice(Math.max(0, i - 30), i)) });
            }
        }
        return hits;
    }

    // Ergebnis: { text } mit ersetztem Quelltext oder { error } mit Klartext. where: 'page' | 'controls' | 'none'
    function replaceLabelInSource(src, oldText, newText, key) {
        const hits = labelHits(src, oldText);
        if (!hits.length) return { error: 'missing' };
        let pool = hits.filter(h => h.ctx);
        if (!pool.length) pool = hits;
        if (pool.length > 1 && key) {
            const near = pool.filter(h => {
                const before = src.slice(Math.max(0, h.at - 600), h.at);
                return before.includes("'" + key + "'") || before.includes('"' + key + '"');
            });
            if (near.length) pool = near;
        }
        if (pool.length !== 1) return { error: 'ambiguous', count: pool.length };
        const h = pool[0];
        return { text: src.slice(0, h.start) + jsLiteralText(newText, h.q) + src.slice(h.end) };
    }

    let controlsSourceCache = null;
    async function labelInControlsJs(label) {
        if (controlsSourceCache == null) {
            const res = await fetch(CONTROLS_SRC, { credentials: 'same-origin' });
            if (!res.ok) throw new Error('controls.js nicht lesbar (HTTP ' + res.status + ')');
            controlsSourceCache = await res.text();
        }
        return labelHits(controlsSourceCache, label).length > 0;
    }

    function setLabelEverywhere(oldEl, text) {
        if (oldEl && oldEl.isConnected) oldEl.textContent = text;
    }

    function renameLabel(el, oldText, newText, key, isUndo = false) {
        setLabelEverywhere(el, newText);
        const fail = (msg, final) => {
            setLabelEverywhere(el, oldText);
            defaultsToast(msg, final ? { fatal: true } : { retry: () => renameLabel(el, oldText, newText, key, isUndo) });
        };
        let problem = null;
        return writeSource(html => {
            const r = replaceLabelInSource(html, oldText, newText, key);
            if (r.error) { problem = r; throw new Error('label:' + r.error); }
            return r.text;
        }).then(() => {
            defaultsToast(isUndo ? 'Beschriftung zurückgesetzt' : `Beschriftung geändert: "${newText}"`,
                isUndo ? {} : { undo: () => renameLabel(el, newText, oldText, key, true) });
        }, async (e) => {
            if (!problem) return fail('Beschriftung nicht gespeichert: ' + e.message);
            if (problem.error === 'ambiguous') {
                return fail(`Beschriftung nicht geändert: "${oldText}" kommt ${problem.count}-mal im Quelltext vor, die Stelle ist nicht eindeutig`, true);
            }
            let shared = false;
            try { shared = await labelInControlsJs(oldText); } catch (err) { return fail('Beschriftung nicht gespeichert: ' + err.message); }
            fail(shared
                ? `"${oldText}" ist in controls.js festgelegt und gilt für alle Seiten, nicht geändert`
                : `Beschriftung nicht geändert: "${oldText}" steht nicht als Text im Seitenquelltext (wird per Code erzeugt)`, true);
        });
    }

    // === ZURUECKSETZEN (Knopf im Panel-Kopf, jede Seite) ===
    // Setzt alle Regler aller Panels der Seite auf defaultOf(key), jeweils ueber ihr onChange, und
    // nimmt die passenden URL-Parameter weg. Seiten haengen eigenen Zustand per addResetButton an:
    // onClick laeuft vor, afterReset nach den Reglern; liefern sie eine Funktion, macht Rueckgaengig sie wieder.
    // Panel offen/Breite bleiben, wie sie sind (Zustand des Betrachters, nicht der Seite).
    function livePanels() {
        return pageDefaultState.panels.filter(p => p.el && p.el.isConnected);
    }

    function resettableValues() {
        return livePanels().map(p => [p, Object.keys(p.params)
            .filter(k => pageDefaultState.seen.has(k))
            .map(k => [k, cloneValue(p.params[k])])]);
    }

    // Symbolzeile mit anderer Laenge: erst nach dem Anzahl-Regler, der sie neu baut (applyAll).
    function applyOne(panel, key, value) {
        if (!(key in panel.params)) return true;
        let before = cloneValue(panel.params[key]);
        if (JSON.stringify(before) === JSON.stringify(value)) return true;
        const sym = panel._symbolRows && panel._symbolRows[key];
        if (sym && !(Array.isArray(value) && value.length === before.length)) {
            // Andere Laenge: die Zeile selbst (onResize) baut um, sonst erst nach dem Regler, der sie baut
            if (!(sym.onResize && Array.isArray(value))) return false;
            sym.onResize(value.length);
            before = cloneValue(panel.params[key]);
            if (JSON.stringify(before) === JSON.stringify(value)) return true;
            if (before.length !== value.length) return false;
        }
        panel.set(key, cloneValue(value));
        panel._emitPageValue(key, before);
        return true;
    }

    function applyLater(later) {
        for (const [panel, key, value] of later) {
            if (applyOne(panel, key, value)) continue;
            console.error(`[controls] Zuruecksetzen: "${key}" hat ${panel.params[key].length} Symbole, Wert hat ${Array.isArray(value) ? value.length : 'keine'}`);
        }
    }

    function applyValues(entries) {
        const later = [];
        for (const [panel, pairs] of entries) {
            for (const [key, value] of pairs) {
                if (!applyOne(panel, key, value)) later.push([panel, key, value]);
            }
        }
        applyLater(later);
    }

    function runHooks(name, undos) {
        for (const panel of livePanels()) {
            for (const hook of panel._resetHooks) {
                if (!hook[name]) continue;
                const undo = hook[name]();
                if (typeof undo === 'function') undos.push(undo);
            }
        }
    }

    function resetPage() {
        const before = resettableValues();
        const href = location.href;
        const undos = [];
        try {
            runHooks('onClick', undos);
            // Key fuer Key in Panel-Reihenfolge: ein Anzahl-Regler (z. B. Symbolzeilen) baut Zeilen neu,
            // die danach selbst zurueckgesetzt werden.
            const later = [];
            for (const panel of livePanels()) {
                const done = new Set();
                let key;
                while ((key = Object.keys(panel.params).find(k => pageDefaultState.seen.has(k) && !done.has(k))) !== undefined) {
                    done.add(key);
                    const value = panel.defaultOf(key);
                    if (!applyOne(panel, key, value)) later.push([panel, key, value]);
                }
            }
            applyLater(later);
            runHooks('afterReset', undos);
            const url = new URL(location.href);
            const keys = new Set(before.flatMap(([, pairs]) => pairs.map(([k]) => k)));
            let changed = false;
            for (const k of [...url.searchParams.keys()]) {
                if (keys.has(k)) { url.searchParams.delete(k); changed = true; }
            }
            if (changed) history.replaceState(history.state, '', url.pathname + (url.search || '') + url.hash);
        } catch (e) {
            console.error('[controls] Zuruecksetzen:', e);
            resetToast('Zurücksetzen unvollständig: ' + e.message, null);
            return;
        }
        resetToast('Zurückgesetzt', () => {
            try {
                applyValues(before);
                undos.reverse().forEach(fn => fn());
                history.replaceState(history.state, '', href);
            } catch (e) {
                console.error('[controls] Rückgängig:', e);
                resetToast('Rückgängig unvollständig: ' + e.message, null);
            }
        });
    }

    function resetToast(text, undo) {
        document.querySelectorAll('.ctrl-reset-toast').forEach(t => t.remove());
        const t = document.createElement('div');
        t.className = 'ctrl-reset-toast';
        t.dataset.oeUi = '';
        t.dataset.kind = undo ? '' : 'error';
        t.setAttribute('role', undo ? 'status' : 'alert');
        const label = document.createElement('span');
        label.textContent = text;
        t.append(label);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = undo ? 'Rückgängig' : 'schließen';
        btn.addEventListener('click', () => { t.remove(); if (undo) undo(); });
        t.append(btn);
        if (undo) setTimeout(() => t.remove(), 5000);
        document.body.appendChild(t);
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
                mobileContentMaxOffset: options.mobileContentMaxOffset ?? 12, // vh
	                mobileInitialOpenMode: options.mobileInitialOpenMode || 'content-capped',
	                mobileInitialOpenMaxViewportFraction: Number.isFinite(Number(options.mobileInitialOpenMaxViewportFraction))
	                    ? Number(options.mobileInitialOpenMaxViewportFraction)
	                    : (1 / 3),
                desktopInitialHeightFraction: Number.isFinite(Number(options.desktopInitialHeightFraction)) ? Number(options.desktopInitialHeightFraction) : (1 / 3),
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

                document.addEventListener('keydown', (e) => {
                    if (!popup.classList.contains('open') || !popup._ctrlActions) return;
                    if (e.key === 'Escape') {
                        e.preventDefault();
                        popup._ctrlActions.cancel();
                    } else if (e.key === 'Enter' && !getTargetElement(e.target)?.closest('.ctrl-config-arrow, .ctrl-config-default, .ctrl-config-cancel')) {
                        e.preventDefault();
                        popup._ctrlActions.save();
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
            if (popup) popup._ctrlActions = null;
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
                        <input type="search" class="ctrl-config-input" data-config="min" value="${formatConfigFieldValue(cfg, 'min')}" inputmode="decimal" autocomplete="off" autocapitalize="off" spellcheck="false" data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other" enterkeyhint="done">
                        <button type="button" class="ctrl-config-arrow" data-config="min" data-direction="up" aria-label="Min erhöhen">&#9652;</button>
                    </div>
                </div>
                <div class="ctrl-config-row">
                    <span class="ctrl-config-label">Max</span>
                    <div class="ctrl-config-input-wrap">
                        <button type="button" class="ctrl-config-arrow" data-config="max" data-direction="down" aria-label="Max verringern">&#9662;</button>
                        <input type="search" class="ctrl-config-input" data-config="max" value="${formatConfigFieldValue(cfg, 'max')}" inputmode="decimal" autocomplete="off" autocapitalize="off" spellcheck="false" data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other" enterkeyhint="done">
                        <button type="button" class="ctrl-config-arrow" data-config="max" data-direction="up" aria-label="Max erhöhen">&#9652;</button>
                    </div>
                </div>
                <div class="ctrl-config-row">
                    <span class="ctrl-config-label">Step</span>
                    <div class="ctrl-config-input-wrap">
                        <button type="button" class="ctrl-config-arrow" data-config="step" data-direction="down" aria-label="Step verkleinern">&#9662;</button>
                        <input type="search" class="ctrl-config-input" data-config="step" value="${formatConfigFieldValue(cfg, 'step')}" inputmode="decimal" autocomplete="off" autocapitalize="off" spellcheck="false" data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other" enterkeyhint="done">
                        <button type="button" class="ctrl-config-arrow" data-config="step" data-direction="up" aria-label="Step vergrößern">&#9652;</button>
                    </div>
                </div>
                <div class="ctrl-config-actions">
                    <button type="button" class="ctrl-config-cancel">Cancel</button>
                    <button type="button" class="ctrl-config-save">Save</button>
                </div>
                <button type="button" class="ctrl-config-default">Default range</button>
            `;

            const snapshot = {
                min: cfg.min, max: cfg.max, step: cfg.step, decimals: cfg.decimals
            };

            const syncConfigInputs = () => {
                popup.querySelectorAll('.ctrl-config-input').forEach((inputEl) => {
                    inputEl.value = formatConfigFieldValue(cfg, inputEl.dataset.config);
                });
            };

            // Changes preview live; Cancel restores the state from when the menu opened.
            const saveConfig = () => this._closeConfigPopup();
            const cancelConfig = () => {
                Object.assign(cfg, snapshot);
                this._updateSliderFromConfig(key);
                this._closeConfigPopup();
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
                    const newVal = parseConfigFieldValue(cfg, input.value);

                    if (Number.isNaN(newVal)) {
                        input.value = formatConfigFieldValue(cfg, configType);
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
                        e.stopPropagation();
                        commitInputValue();
                        saveConfig();
                    } else if (e.key === 'Escape') {
                        e.preventDefault();
                        e.stopPropagation();
                        cancelConfig();
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

            popup.querySelector('.ctrl-config-default').addEventListener('click', () => {
                cfg.min = cfg.defaultMin;
                cfg.max = cfg.defaultMax;
                cfg.step = cfg.defaultStep;
                syncSliderDecimals(cfg, cfg.defaultDecimals ?? 0);
                syncConfigInputs();
                this._updateSliderFromConfig(key);
            });
            popup.querySelector('.ctrl-config-save').addEventListener('click', () => saveConfig());
            popup.querySelector('.ctrl-config-cancel').addEventListener('click', () => cancelConfig());
            popup._ctrlActions = { save: saveConfig, cancel: cancelConfig };

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
            this._growSlider(key, currentValue);
            const { min, max } = getProjectedSliderBounds(cfg, currentValue);

            cfg.decimals = decs;

            if (range) {
                range.min = min;
                range.max = max;
                range.step = getProjectedSliderStep(cfg.step);
                range.value = clamp(toSliderRangeValue(currentValue, cfg), min, max);
            }

            if (input) input.value = formatSliderControlValue(currentValue, decs, cfg);
            if (display) display.textContent = formatSliderControlValue(currentValue, decs, cfg);
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
            this._addBuiltinResetButton();
            if (!pageDefaultState.panels.includes(this)) pageDefaultState.panels.push(this);

            // Body
            this.bodyEl = document.createElement('div');
            this.bodyEl.className = 'ctrl-panel-body';
            this.el.appendChild(this.bodyEl);
            this.bodyEl.addEventListener('scroll', this._handleSelectViewportChange, { passive: true });
            window.addEventListener('resize', this._handleSelectViewportChange);
            this._installClickAnchor();
            this._installSliderTouchLock();

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

        /**
         * Touch: ein Regler uebernimmt erst bei klar waagerechter Bewegung (>= 9 px, |dx| > |dy|).
         * Senkrechte Bewegung scrollt das Panel (touch-action: pan-y in meta.css), Antippen der Bahn aendert den Wert nicht.
         * Maus und Tastatur laufen unveraendert ueber das native Verhalten.
         */
        _installSliderTouchLock() {
            const SLOP = 9;
            let gate = null;
            const isRange = t => t instanceof HTMLInputElement && t.type === 'range';
            const end = e => { if (gate && e.pointerId === gate.id) gate = null; };
            this.el.addEventListener('pointerdown', e => {
                if (e.pointerType !== 'touch' || !isRange(e.target)) return;
                gate = { id: e.pointerId, x: e.clientX, y: e.clientY, range: e.target, value: e.target.value, armed: false };
            }, true);
            this.el.addEventListener('pointermove', e => {
                if (!gate || e.pointerId !== gate.id || gate.armed) return;
                const dx = Math.abs(e.clientX - gate.x), dy = Math.abs(e.clientY - gate.y);
                if (dx >= SLOP && dx > dy) gate.armed = true;
            }, true);
            this.el.addEventListener('pointerup', end, true);
            this.el.addEventListener('pointercancel', end, true);
            // Vor den Reglern des Panels: solange nicht klar waagerecht gezogen wird, bleibt der Wert wie er war
            const block = e => {
                if (!gate || gate.armed || e.target !== gate.range) return;
                e.stopImmediatePropagation();
                if (gate.range.value !== gate.value) gate.range.value = gate.value;
            };
            this.el.addEventListener('input', block, true);
            this.el.addEventListener('change', block, true);
        }

        // Bedienung im Panel: das angefasste Element bleibt auf dem Bildschirm, wo es ist. Aendert sich darueber oder
        // darunter Inhalt (Symbol +/-, sync, Details), gleicht scrollTop das aus. Gewollte Bewegung bleibt reveal() beim
        // Ziehen in der Szene (Zeiger ausserhalb des Panels, hier kein Anker).
        _installClickAnchor() {
            const body = this.bodyEl;
            let anchor = null, holdUntil = 0, down = false, raf = 0;
            // Mitte statt Oberkante: :active skaliert den Knopf und verschiebt die Kante um ein paar px
            const mid = el => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; };
            const resolve = a => {
                if (a.el.isConnected) return a.el;
                const root = a.key ? body.querySelector(`[data-key="${CSS.escape(a.key)}"]`) : body;
                const list = root ? root.querySelectorAll(a.sel) : [];
                return list[Math.min(a.idx, list.length - 1)] || null;
            };
            const tick = () => {
                raf = 0;
                if (!anchor) return;
                const el = resolve(anchor);
                if (el) {
                    const d = mid(el) - anchor.top;
                    if (Math.abs(d) > 0.4 && body.scrollHeight > body.clientHeight) body.scrollTop += d;
                    anchor.el = el;
                }
                if (down || performance.now() < holdUntil) raf = requestAnimationFrame(tick);
                else anchor = null;
            };
            const start = () => { if (!raf) raf = requestAnimationFrame(tick); };
            body.addEventListener('pointerdown', e => {
                const t = e.target instanceof Element ? e.target.closest('button, input, select, label, .ctrl-row') : null;
                if (!t || !body.contains(t)) return;
                const keyed = t.closest('[data-key]');
                const key = keyed && body.contains(keyed) ? keyed.dataset.key : '';
                const sel = t.tagName.toLowerCase() + (t.classList.length ? '.' + [...t.classList].join('.') : '');
                const root = key ? keyed : body;
                const idx = Math.max(0, [...root.querySelectorAll(sel)].indexOf(t));
                anchor = { el: t, key, sel, idx, top: mid(t) };
                down = true;
                holdUntil = performance.now() + 900;
                start();
            }, true);
            const up = () => { down = false; holdUntil = performance.now() + 900; start(); };
            body.addEventListener('pointerup', up, true);
            body.addEventListener('pointercancel', up, true);
            body.addEventListener('click', () => { holdUntil = performance.now() + 900; start(); }, true);
            body.addEventListener('change', () => { holdUntil = performance.now() + 900; start(); }, true);
            body.addEventListener('wheel', () => { anchor = null; }, { passive: true });
            body.addEventListener('touchmove', () => { anchor = null; }, { passive: true });
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
		            const preferredPanelHeight = Math.min(maxPanelHeight, Math.max(fixedChromeHeight, viewportHeight * this.options.desktopInitialHeightFraction));
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
            // max-height aus --visible-viewport-height setzt meta.js erst im naechsten Frame; waechst das Viewport
            // (Adressleiste klappt weg), kappt der alte Wert das Panel einen Frame lang und es springt ~1 cm.
            this.el.style.maxHeight = expandedHeight + 'px';
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
            // Ohne die selbst gesetzte Hoehe messen: clientHeight traegt sonst die letzte Sheet-Hoehe mit, die Hoehe
            // schrumpft erst ueber mehrere Bilder auf den Inhalt und ein kurzes Panel startet zugeklappt.
            const s = this.bodyEl.style, h = s.height, mh = s.maxHeight;
            s.height = 'auto'; s.maxHeight = 'none';
            const natural = this.bodyEl.scrollHeight || 0;
            s.height = h; s.maxHeight = mh;
            return Math.max(natural, 0);
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
            // rect liegt im Layout-Viewport, viewport.height misst das sichtbare Viewport: bei verschobenem Viewport
            // (Tastatur offen, Seite gezogen) erst in dessen Koordinaten umrechnen, sonst fehlt unten offsetTop und der Koerper wird zu kurz.
            return Math.max(0, Math.min(rect.bottom - viewport.offsetTop, viewport.height) - Math.max(rect.top - viewport.offsetTop, 0));
        }

        _updateMobileViewportOffset() {
            if (!this.el) return;
            if (!isMobile()) {
                this.el.style.removeProperty('--ctrl-mobile-bottom-offset');
                return;
            }
            const viewport = getViewportMetrics();
            const rootBottom = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--visible-viewport-bottom')) || 0;
            this.el.style.setProperty('--ctrl-mobile-bottom-offset', `${Math.round(Math.max(viewport.bottomInset, rootBottom, viewport.keyboardHeight))}px`);
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
	                const styleTop = parseFloat(this.el.style.top);
	                const currentTop = Number.isFinite(styleTop) ? styleTop : rect.top;
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
                    this.el.style.maxHeight = '';
                    if (contentEl) {
                        contentEl.style.transition = '';
                        contentEl.style.transform = '';
                    }
                    // overflowY bleibt: setzt _syncDesktopBodyOverflow, Leeren liess das Panel nach jedem Refresh ans Anfangs-Scroll springen
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
            // Wird das Panel von aussen eingeblendet (Tap aufs Symbol), liegt es sonst nur als Streifen unten: die Start-Hoehe
            // wurde gemessen, solange das Panel noch display:none war (Hoehe ~0), und ist deshalb winzig. Hier neu messen.
            // Hat der Nutzer die Hoehe selbst gezogen, gilt seine; ein offenes Panel aendert sich nie (springt nicht unter dem Finger).
            this.openSheetIfClosed = () => {
                if (!this.el || !isMobile()) return;
                if (!this._mobileUserSized) {
                    const want = getInitialOpenVisibleHeight();
                    this._mobileDefaultOpenVisibleHeight = want;
                    this._mobileLastOpenVisibleHeight = want;
                    setPosition(getYForVisibleHeight(want), true, { rememberOpen: false, signalLayout: true });
                    return;
                }
                if (isMostlyClosed()) setPosition(getPreferredOpenY(), true, { rememberOpen: false, signalLayout: true });
            };
            // Tastatur: Oeffnet sich die Bildschirmtastatur, schrumpft das Viewport und die Sheet-Hoehe wird neu aus der
            // sichtbaren Hoehe berechnet. Das Panel sprang dabei hoch und das angetippte Feld wanderte unter dem Finger weg.
            // Solange ein Textfeld im Panel den Fokus hat, bleibt deshalb die Oberkante des Sheets auf dem Bildschirm stehen.
            const placeOpen = (animate) => {
                if (this._kbHold) {
                    const vp = getViewportMetrics();
                    // nur wenn die Tastatur das Feld sonst verdeckt, rueckt das Sheet gerade so weit hoch, dass es frei liegt
                    const top = Math.min(this._kbHold.top, vp.height - 8 - this._kbHold.rel);
                    const y = clampY(top - (vp.height - this._getMobileExpandedPanelHeight()));
                    setPosition(y, animate, { rememberOpen: false, signalLayout: false });
                    this._revealFocusedField?.();
                    return;
                }
                setPosition(getPreferredOpenY(), animate, { rememberOpen: false, signalLayout: false });
            };
            this._revealFocusedField = () => {
                const f = document.activeElement;
                if (!f || !this.bodyEl || !this.bodyEl.contains(f)) return;
                const vp = getViewportMetrics();
                const over = f.getBoundingClientRect().bottom - vp.offsetTop - (vp.height - 8);
                if (over > 0) this.bodyEl.scrollTop += over;
            };
            this._refreshMobileSheetLayout = ({ animate = false } = {}) => {
	                if (isMostlyClosed()) {
	                    setPosition(getMaxY(), animate, { rememberOpen: false, signalLayout: false });
	                    return;
	                }
	                placeOpen(animate);
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

	                placeOpen(false);
            };

	            this._mobileInitialLayoutFrame = requestAnimationFrame(() => {
	                this._mobileInitialLayoutFrame = 0;
	                if (!this.el) return;
	                initPosition();
	            });
            this._handleMobileSheetResize = syncPositionOnResize;
            window.addEventListener('resize', this._handleMobileSheetResize);

            const isTextField = t => t instanceof Element && t.matches('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit]):not([type=reset]):not([type=color]):not([type=file]), textarea');
            // Chrome Android verschiebt bei offener Tastatur das Viewport (Seite ziehen) auf dem Compositor; ein per JS
            // nachgefuehrtes Panel haengt dann ein Frame hinterher und wackelt. Im VirtualKeyboard-Modus bleibt das Viewport
            // stehen und das Panel sitzt per CSS (env(keyboard-inset-height), meta.css) ohne JS am Tastaturrand.
            const setKeyboardOverlay = (on) => {
                const vk = navigator.virtualKeyboard;
                if (!vk || vk.overlaysContent === on) return;
                try { vk.overlaysContent = on; } catch (err) { console.error('controls.js: VirtualKeyboard-Modus nicht setzbar', err); }
            };
            if (navigator.virtualKeyboard) {
                this._handleKbGeometry = () => { if (this.el && isMobile()) this._refreshMobileSheetLayout?.(); };
                navigator.virtualKeyboard.addEventListener('geometrychange', this._handleKbGeometry);
            }
            this._handleKbFocusIn = (e) => {
                if (!isMobile() || !isTextField(e.target)) return;
                clearTimeout(this._kbHoldTimer);
                setKeyboardOverlay(true);
                if (!this._kbHold && !isMostlyClosed()) {
                    const top = this.el.getBoundingClientRect().top - getViewportMetrics().offsetTop;
                    this._kbHold = { top, rel: e.target.getBoundingClientRect().bottom - getViewportMetrics().offsetTop - top };
                }
            };
            this._handleKbFocusOut = () => {
                clearTimeout(this._kbHoldTimer);
                this._kbHoldTimer = setTimeout(() => {
                    if (!this.el || isTextField(document.activeElement) && this.el.contains(document.activeElement)) return;
                    this._kbHold = null;
                    setKeyboardOverlay(false);
                    this._refreshMobileSheetLayout?.();
                }, 350);
            };
            this.el.addEventListener('focusin', this._handleKbFocusIn);
            this.el.addEventListener('focusout', this._handleKbFocusOut);

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
                    this._mobileUserSized = true;
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
                    this._mobileUserSized = true;
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

            // Innerhalb aufgeklappter Unter-Einstellungen (addToggle details) bleibt die Section dort
            const inDetails = this._currentContainer && this._currentContainer.classList.contains('ctrl-details');
            this._sectionParent = inDetails ? this._currentContainer : this.bodyEl;
            this._sectionParent.appendChild(section);
            this._sections[id] = section;
            this._currentContainer = section;
            return this;
        }

        /**
         * End current section, return to body container
         */
        endSection() {
            this._currentContainer = this._sectionParent || this.bodyEl;
            this._sectionParent = null;
            return this;
        }

        /**
         * Replace the rows of an existing section (header stays) by running build(panel) into it.
         */
        fillSection(id, build) {
            const section = this._sections[id];
            if (!section) return this;
            [...section.children].forEach((child) => {
                if (child.classList.contains('ctrl-section-header')) return;
                this._cleanupRemovedControls(child);
                child.remove();
            });
            const prev = this._currentContainer;
            this._currentContainer = section;
            try { build(this); } finally { this._currentContainer = prev; }
            this._updateBodyHeight();
            requestAnimationFrame(() => this._refreshMobileSheetLayout?.());
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
                if (this._symbolRows) delete this._symbolRows[key];
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
         * Wachsende Skala (config.grow): hoechster erreichter Wert je Seite und Regler bleibt in sessionStorage,
         * die Obergrenze liegt bei Spitze x Puffer und sinkt in der Sitzung nie. Beim Ziehen wird die Skala nur
         * erweitert, wenn der Daumen am Ende ankommt; den Rest erledigt das Loslassen. Liefert true, wenn max stieg.
         */
        _growSlider(key, value) {
            const cfg = this._sliderConfigs[key];
            const st = cfg && cfg.grow;
            if (!st) return false;
            if (Number.isFinite(value) && value > st.peak) {
                st.peak = value;
                saveSliderPeak(key, value);
            }
            let target = st.peak * st.buffer;
            if (st.dragging) {
                const now = Date.now();
                const atEnd = Number.isFinite(value) && value >= cfg.max - Math.max(cfg.step || 0, (cfg.max - cfg.min) * 0.002);
                if (!atEnd || now - st.lastExt < 300) return false;
                st.lastExt = now;
                target = Math.max(target, value * 1.25);
            }
            if (!(target > cfg.max)) return false;
            cfg.max = Math.ceil(target * 100) / 100;
            return true;
        }

        /**
         * Add a unified Slider + Stepper row (Slider + [-] [input] [+])
         */
        addSlider(key, config) {
            config = this._withPageDefault(key, config);
            const { label, min, max, step, decimals = 0, onChange, transform = null, wrap = false } = config;
            const value = wrap ? wrapSliderValue(config.value, { min, max }) : config.value;
            this.params[key] = value;
            if (onChange) this.callbacks[key] = onChange;

            // Slider-Config fÃ¼r Config-MenÃ¼ speichern
            this._sliderConfigs[key] = {
                min,
                max,
                step,
                transform,
                wrap: !!wrap,
                baseDecimals: decimals,
                decimals: getSliderDecimals({ step, baseDecimals: decimals }, decimals),
                defaultMin: min,
                defaultMax: max,
                defaultStep: step,
                defaultDecimals: decimals
            };
            if (config.grow) {
                const buffer = Number.isFinite(config.grow.buffer) && config.grow.buffer > 1 ? config.grow.buffer : 2;
                const st = { buffer, peak: loadSliderPeak(key), dragging: false, lastExt: 0 };
                if (Number.isFinite(value) && value > st.peak) st.peak = value;
                this._sliderConfigs[key].grow = st;
                this._growSlider(key, value);
            }

            const sliderCfg = this._sliderConfigs[key];
            const initialValue = Number.isFinite(value) ? value : 0;
            const initialBounds = getProjectedSliderBounds(sliderCfg, initialValue);
            const initialRangeValue = clamp(toSliderRangeValue(initialValue, sliderCfg), initialBounds.min, initialBounds.max);

            const row = document.createElement('div');
            row.className = 'ctrl-row';
            row.dataset.key = key;
            row.innerHTML = `
                <label class="ctrl-label">${label}</label>
                <div class="ctrl-slider-group">
                    <button class="ctrl-stepper-btn" data-action="dec">&#8722;</button>
                    ${wrap ? '<span class="ctrl-range-wrap">' : ''}<input type="range" class="ctrl-range" min="${initialBounds.min}" max="${initialBounds.max}" step="${getProjectedSliderStep(step)}" value="${initialRangeValue}">${wrap ? '</span>' : ''}
                    <button class="ctrl-stepper-btn" data-action="inc">+</button>
                    <input type="search" class="ctrl-value-input" inputmode="decimal" autocomplete="off" autocapitalize="off" spellcheck="false" data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other" value="${formatSliderControlValue(initialValue, sliderCfg.decimals, sliderCfg)}">
                    <button class="ctrl-config-trigger" title="Einstellungen">&#8942;</button>
                </div>
            `;

            const range = row.querySelector('.ctrl-range');
            const input = row.querySelector('.ctrl-value-input');
            const decBtn = row.querySelector('[data-action="dec"]');
            const incBtn = row.querySelector('[data-action="inc"]');
            const configTrigger = row.querySelector('.ctrl-config-trigger');
            fitSliderValueInput(input, sliderCfg, initialValue, sliderCfg.decimals);
            const syncSliderUI = (rawValue, updateInput = true) => {
                const cfg = this._sliderConfigs[key];
                const currentValue = Number.isFinite(rawValue) ? rawValue : 0;
                const decs = cfg ? getCurrentSliderDecimals(cfg, cfg.defaultDecimals ?? decimals) : decimals;
                const grew = this._growSlider(key, currentValue);
                const bounds = getProjectedSliderBounds(cfg, currentValue);

                if (cfg) cfg.decimals = decs;

                range.min = bounds.min;
                // Waehrend des Ziehens bleibt die Skala stehen (Daumen unter dem Finger), ausser der Rand wird erreicht.
                if (!(cfg && cfg.grow && cfg.grow.dragging) || grew) range.max = bounds.max;
                range.step = getProjectedSliderStep(cfg ? cfg.step : step);
                range.value = clamp(toSliderRangeValue(currentValue, cfg), bounds.min, bounds.max);

                if (updateInput) {
                    input.value = formatSliderControlValue(currentValue, decs, cfg);
                }
                fitSliderValueInput(input, cfg, currentValue, decs);
            };

            const updateValue = (newVal, updateInput = true) => {
                // newVal = clamp(newVal, min, max); // Let the universe be unlimited!
                const cfg = this._sliderConfigs[key];
                const decs = cfg ? getCurrentSliderDecimals(cfg, cfg.defaultDecimals ?? decimals) : decimals;
                if (cfg && cfg.wrap) newVal = wrapSliderValue(newVal, cfg);
                newVal = preciseNormalize(newVal, decs);
                if (cfg && cfg.wrap) newVal = wrapSliderValue(newVal, cfg);
                this.params[key] = newVal;

                syncSliderUI(newVal, updateInput);

                if (this.callbacks[key]) this.callbacks[key](newVal, key);
            };

            // Slider Events
            range.addEventListener('input', () => {
                const cfg = this._sliderConfigs[key];
                const val = fromSliderRangeValue(parseFloat(range.value), cfg);
                updateValue(val);
            });

            if (wrap) this._bindWrapDrag(key, range, updateValue);

            if (this._sliderConfigs[key].grow) {
                const st = this._sliderConfigs[key].grow;
                range.addEventListener('pointerdown', () => { st.dragging = true; });
                const release = () => {
                    if (!st.dragging) return;
                    st.dragging = false;
                    syncSliderUI(this.params[key], false);
                };
                range.addEventListener('pointerup', release);
                range.addEventListener('pointercancel', release);
                range.addEventListener('lostpointercapture', release);
            }

            // Input Events
            input.addEventListener('input', () => {
                const parsed = parseSliderControlValue(input.value, this._sliderConfigs[key]);
                if (!Number.isNaN(parsed)) updateValue(parsed, false);
            });
            input.addEventListener('blur', () => {
                const cfg = this._sliderConfigs[key];
                const parsed = parseSliderControlValue(input.value, cfg);
                const decs = cfg ? getCurrentSliderDecimals(cfg, cfg.defaultDecimals ?? decimals) : decimals;
                if (Number.isNaN(parsed)) {
                    input.value = formatSliderControlValue(this.params[key], decs, cfg);
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
                const wraps = !!(cfg && cfg.wrap);
                if (!wraps && (newVal < currentMin || (newVal > currentMax && !(cfg && cfg.grow)))) return;

                isHolding = true;
                // Sofort ein erster Schritt
                updateValue(newVal);
                holdInterval = setInterval(() => {
                    const nextVal = preciseAdd(this.params[key], delta, decs);
                    if (!wraps && (nextVal < currentMin || (nextVal > currentMax && !(cfg && cfg.grow)))) {
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
                    if (!(cfg && cfg.wrap) && (newVal < currentMin || (newVal > currentMax && !(cfg && cfg.grow)))) return;

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
                        if ((cfg && cfg.wrap) || (newVal >= currentMin && (newVal <= currentMax || cfg.grow))) {
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

        // wrap-Slider: eigenes Ziehen statt nativer Range (die klemmt am Rand). Der Zeiger zaehlt relativ weiter,
        // ueber den Rand hinaus laeuft der Wert bei min wieder an; Pfeiltasten ebenso.
        _bindWrapDrag(key, range, updateValue) {
            const host = range.parentElement;
            const snap = (raw) => {
                const cfg = this._sliderConfigs[key];
                const { min } = getProjectedSliderBounds(cfg, raw);
                const s = cfg && cfg.step > 0 ? cfg.step : 0;
                return s ? min + Math.round((raw - min) / s) * s : raw;
            };
            const geometry = () => {
                const cfg = this._sliderConfigs[key];
                const { min, max } = getProjectedSliderBounds(cfg, this.params[key]);
                const rect = range.getBoundingClientRect();
                // Thumb-Breite wie in meta.css (16px, unter 768px 24px)
                const thumb = window.matchMedia('(max-width: 768px)').matches ? 24 : 16;
                return { min, period: max - min, left: rect.left + thumb / 2, span: Math.max(1, rect.width - thumb), thumb };
            };
            let drag = null;

            // Touch: erst bei klar waagerechter Bewegung (>= 9 px, |dx| > |dy|) zieht der Regler, sonst scrollt das Panel.
            // Antippen aendert nichts. Maus und Stift greifen sofort wie bisher.
            let pending = null;
            const begin = (e, x) => {
                const g = geometry();
                if (!(g.period > 0)) return;
                host.setPointerCapture(e.pointerId);
                const current = Number.isFinite(this.params[key]) ? this.params[key] : g.min;
                const thumbX = g.left + (current - g.min) / g.period * g.span;
                let start = current;
                if (e.pointerType !== 'touch' && Math.abs(x - thumbX) > g.thumb / 2 + 4) {
                    start = g.min + clamp((x - g.left) / g.span, 0, 1) * g.period;
                    updateValue(snap(start));
                }
                drag = { id: e.pointerId, x, start, g };
                range.focus({ preventScroll: true });
                host.classList.add('dragging');
            };
            host.addEventListener('pointerdown', (e) => {
                if (e.button !== 0) return;
                if (e.pointerType === 'touch') { pending = { id: e.pointerId, x: e.clientX, y: e.clientY }; return; }
                e.preventDefault();
                begin(e, e.clientX);
            });
            host.addEventListener('pointermove', (e) => {
                if (pending && e.pointerId === pending.id) {
                    const dx = Math.abs(e.clientX - pending.x), dy = Math.abs(e.clientY - pending.y);
                    if (dx < 9 || dx <= dy) return;
                    const x0 = pending.x;
                    pending = null;
                    begin(e, x0);
                }
                if (!drag || e.pointerId !== drag.id) return;
                const raw = drag.start + (e.clientX - drag.x) / drag.g.span * drag.g.period;
                updateValue(snap(raw));
            });
            const end = (e) => {
                if (pending && e.pointerId === pending.id) pending = null;
                if (!drag || e.pointerId !== drag.id) return;
                drag = null;
                host.classList.remove('dragging');
                if (host.hasPointerCapture(e.pointerId)) host.releasePointerCapture(e.pointerId);
            };
            host.addEventListener('pointerup', end);
            host.addEventListener('pointercancel', end);

            range.addEventListener('keydown', (e) => {
                const cfg = this._sliderConfigs[key];
                const s = cfg && cfg.step > 0 ? cfg.step : 1;
                const big = (getProjectedSliderBounds(cfg, 0).max - getProjectedSliderBounds(cfg, 0).min) / 10;
                const deltas = { ArrowRight: s, ArrowUp: s, ArrowLeft: -s, ArrowDown: -s, PageUp: big, PageDown: -big };
                if (!(e.key in deltas)) return;
                e.preventDefault();
                updateValue(snap(this.params[key] + deltas[e.key]));
            });
        }

        /**
         * Add a toggle checkbox row
         */
        addToggle(key, config) {
            config = this._withPageDefault(key, config);
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
                // Ausschalten klappt die Unter-Einstellungen nicht zu: das Panel darunter darf nicht springen.
                this._toggleDetails?.[key]?.sub.classList.toggle('ctrl-details-off', !checkbox.checked);
            });

            this._currentContainer.appendChild(row);
            if (typeof config.details === 'function') this._addToggleDetails(key, row, checkbox, config.details);
            return this;
        }

        // Unter-Einstellungen eines Schalters: Stift rechts neben dem Haken klappt sie auf. Regel: der Stift
        // schaltet einen ausgeschalteten Schalter mit ein; Ein-/Ausschalten per Haken aendert nie die Hoehe,
        // ausgeschaltet sind offene Unter-Einstellungen nur ausgegraut (ctrl-details-off).
        _addToggleDetails(key, row, checkbox, build) {
            row.classList.add('ctrl-row-has-details');
            const pencil = document.createElement('button');
            pencil.type = 'button';
            pencil.className = 'ctrl-details-btn';
            pencil.setAttribute('aria-label', 'Edit settings');
            pencil.setAttribute('aria-expanded', 'false');
            pencil.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>';
            checkbox.parentElement.appendChild(pencil);

            const sub = document.createElement('div');
            sub.className = 'ctrl-details';
            sub.hidden = true;
            sub.classList.toggle('ctrl-details-off', !checkbox.checked);
            row.after(sub);
            const prev = this._currentContainer;
            this._currentContainer = sub;
            try { build(this); } finally { this._currentContainer = prev; }

            this._toggleDetails = this._toggleDetails || {};
            this._toggleDetails[key] = { sub, pencil };
            bindResponsiveButtonActivation(pencil, () => {
                if (!checkbox.checked) {
                    checkbox.checked = true;
                    checkbox.dispatchEvent(new Event('change'));
                    this._setToggleDetailsOpen(key, true);
                    return;
                }
                this._setToggleDetailsOpen(key, sub.hidden);
            });
        }

        _setToggleDetailsOpen(key, open) {
            const d = this._toggleDetails && this._toggleDetails[key];
            if (!d || d.sub.hidden === !open) return;
            d.sub.hidden = !open;
            d.pencil.setAttribute('aria-expanded', open ? 'true' : 'false');
            d.pencil.classList.toggle('active', !!open);
            this._updateBodyHeight();
            requestAnimationFrame(() => this._refreshMobileSheetLayout?.());
        }

        /**
         * Add a select dropdown row
         */
        addSelect(key, config) {
            config = this._withPageDefault(key, config);
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
            config = this._withPageDefault(key, config);
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
            config = this._withPageDefault(key, config);
            const { label, value = '', placeholder = '', onChange } = config;
            this.params[key] = value;
            if (onChange) this.callbacks[key] = onChange;

            const row = document.createElement('div');
            row.className = 'ctrl-row';
            row.dataset.key = key;
            row.innerHTML = `
                <label class="ctrl-label">${label}</label>
                <textarea class="ctrl-textarea" autocomplete="off" autocapitalize="off" spellcheck="false" data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other" placeholder="${placeholder}">${value}</textarea>
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
            config = this._withPageDefault(key, config);
            const {
                label,
                value = '',
                placeholder = '',
                type = 'search',
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
                <input class="ctrl-input" type="${type === 'text' || type === 'number' ? 'search' : type}" autocomplete="off" autocapitalize="off" spellcheck="false" data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other" placeholder="${placeholder}" ${inputmode ? `inputmode="${inputmode}"` : ''} value="${String(value ?? '').replace(/"/g, '&quot;')}">
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
         * Symbol row: one compact text field per symbol, side by side, full panel width.
         * Meant as the first row of a panel. Scrolls sideways when it gets wider than the panel.
         * + / - only appear when the page passes onAdd / onRemove (pages with a variable symbol count).
         * @param {string} key - Unique key, params[key] is the array of values
         * With `label` the row gets the normal label column (e.g. one step of a sequence); `captions` puts a
         * small heading above each field, `inputmode` is passed to every field (e.g. 'decimal').
         * `layout: 'column'` renders one aligned block: heading row, one row per symbol [symbol][side field],
         * footer row with - / + under the symbols and the optional `toggle` ({ key, label, value, onChange }) under the
         * side column. `side` adds a second column with its own key (params[side.key]): value i sits in the row of
         * symbol i; a single value sits in the first row and the other rows show it dimmed and read-only.
         * `heading` / `side.label` caption the two columns.
         * @param {Object} config - { values, labels?, label?, captions?, inputmode?, layout?, side?: { key, values, labels?, label?, onChange }, onChange(index, value, values), onAdd(values), onRemove(values), onResize(n) (Zuruecksetzen auf andere Anzahl), min, max }
         */
        addSymbolRow(key, config) {
            config = this._withPageDefault(key, config, 'values');
            const { values = [], labels = [], label = '', captions = null, inputmode = '', layout = 'row', onChange, onAdd, onRemove, onResize, min = 0, max = Infinity } = config;
            const column = layout === 'column';
            this.params[key] = values.slice();
            const row = document.createElement('div');
            row.className = 'ctrl-row ctrl-symbol-row' + (label ? ' ctrl-symbol-row-labeled' : '') + (column ? ' ctrl-symbol-row-column' : '');
            row.dataset.key = key;
            if (label) {
                const labelEl = document.createElement('label');
                labelEl.className = 'ctrl-label';
                labelEl.textContent = label;
                row.appendChild(labelEl);
            }
            const strip = document.createElement('div');
            strip.className = 'ctrl-symbol-strip';
            row.appendChild(strip);
            this._symbolRows = this._symbolRows || {};
            const state = { strip, heading: '', labels, captions, inputmode, column, onChange, onAdd, onRemove, onResize, min, max };
            this._symbolRows[key] = state;
            if (column && config.toggle) {
                // Toggle laeuft ueber addToggle (Voreinstellungen, Callbacks); die Zeile wandert in den Fuss des Blocks
                const holder = document.createElement('div');
                const prev = this._currentContainer;
                this._currentContainer = holder;
                try { this.addToggle(config.toggle.key, config.toggle); } finally { this._currentContainer = prev; }
                state.toggleRow = holder.firstElementChild;
                state.toggleRow.classList.add('ctrl-symbol-toggle');
            }
            state.heading = config.heading || '';
            if (column && config.side) {
                const side = this._withPageDefault(config.side.key, config.side, 'values');
                this.params[side.key] = (side.values || []).slice();
                state.side = side.key;
                // Eigener Key fuer Zuruecksetzen, Nadel und reveal; gezeichnet wird immer die ganze Zeile.
                this._symbolRows[side.key] = { owner: key, labels: side.labels || [], label: side.label || '', onChange: side.onChange };
            }
            this._renderSymbolRow(key);
            this._currentContainer.appendChild(row);
            if (column) requestAnimationFrame(() => verifySymbolCss(strip, row));
            return this;
        }

        _renderSymbolRow(key) {
            if (this._symbolRows[key].owner) key = this._symbolRows[key].owner;
            const st = this._symbolRows[key];
            const values = this.params[key];
            st.strip.textContent = '';
            const makeInput = (k, i, v, aria, onChange) => {
                const input = document.createElement('input');
                input.type = 'search';
                input.className = 'ctrl-input ctrl-symbol-input';
                input.value = v ?? '';
                input.setAttribute('aria-label', aria);
                ['autocomplete', 'autocapitalize'].forEach(a => input.setAttribute(a, 'off'));
                input.spellcheck = false;
                input.setAttribute('data-1p-ignore', '');
                input.setAttribute('data-lpignore', 'true');
                input.setAttribute('data-bwignore', '');
                input.setAttribute('data-form-type', 'other');
                if (st.inputmode) input.setAttribute('inputmode', st.inputmode);
                input.addEventListener('input', () => {
                    this.params[k][i] = input.value;
                    if (onChange) onChange(i, input.value, this.params[k]);
                });
                return input;
            };
            // Spalte: Kopfzeile in Zeile 1, Symbol i (und Seitenfeld i) in Zeile i + 2, Fuss darunter
            const place = (el, line, col) => { if (st.column) { el.style.gridRow = String(line); el.style.gridColumn = String(col); } };
            const sideSt = st.side ? this._symbolRows[st.side] : null;
            if (st.column) {
                const head = (text, col) => {
                    const h = document.createElement('span');
                    h.className = 'ctrl-symbol-head';
                    h.textContent = text;
                    place(h, 1, col);
                    st.strip.appendChild(h);
                };
                if (st.heading && values.length) head(st.heading, 1);
                if (sideSt && sideSt.label && values.length) head(sideSt.label, 2);
            }
            values.forEach((v, i) => {
                const input = makeInput(key, i, v, st.labels[i] || ('Symbol ' + (i + 1)), st.onChange);
                if (st.captions) {
                    const cell = document.createElement('label');
                    cell.className = 'ctrl-symbol-cell';
                    const cap = document.createElement('span');
                    cap.className = 'ctrl-symbol-caption';
                    cap.textContent = st.captions[i] || '';
                    cell.append(cap, input);
                    place(cell, i + 2, 1);
                    st.strip.appendChild(cell);
                } else {
                    place(input, i + 2, 1);
                    st.strip.appendChild(input);
                }
            });
            if (st.side && values.length) {
                const sideValues = this.params[st.side];
                const single = sideValues.length === 1;
                const mirrors = [];
                sideValues.forEach((v, i) => {
                    const aria = sideSt.labels[i] || ((sideSt.label || 'Feld') + (single ? '' : ' ' + (i + 1)));
                    const input = makeInput(st.side, i, v, aria, (idx, val, all) => {
                        mirrors.forEach(m => { m.value = val; });
                        if (sideSt.onChange) sideSt.onChange(idx, val, all);
                    });
                    input.classList.add('ctrl-symbol-side-input');
                    place(input, i + 2, 2);
                    st.strip.appendChild(input);
                });
                if (single) {
                    // Synchron: ein Feld, die uebrigen Zeilen zeigen es gedimmt und gesperrt
                    for (let i = 1; i < values.length; i++) {
                        const m = document.createElement('input');
                        m.type = 'search';
                        m.className = 'ctrl-input ctrl-symbol-input ctrl-symbol-side-input ctrl-symbol-mirror';
                        m.value = sideValues[0] ?? '';
                        m.disabled = true;
                        m.tabIndex = -1;
                        ['autocomplete', 'autocapitalize'].forEach(a => m.setAttribute(a, 'off'));
                        m.setAttribute('data-1p-ignore', '');
                        m.setAttribute('data-lpignore', 'true');
                        m.setAttribute('data-bwignore', '');
                        m.setAttribute('data-form-type', 'other');
                        m.setAttribute('aria-hidden', 'true');
                        place(m, i + 2, 2);
                        mirrors.push(m);
                        st.strip.appendChild(m);
                    }
                }
            }
            const footRow = values.length + 2;
            const btnWrap = st.column ? document.createElement('div') : st.strip;
            if (st.column) {
                btnWrap.className = 'ctrl-symbol-btns';
                place(btnWrap, footRow, 1);
            }
            const addBtn = (text, title, enabled, fn) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'ctrl-stepper-btn ctrl-symbol-btn';
                b.textContent = text;
                b.title = title;
                b.disabled = !enabled;
                bindResponsiveButtonActivation(b, fn);
                btnWrap.appendChild(b);
            };
            if (st.onRemove) addBtn('\u2212', 'Symbol entfernen', values.length > st.min, () => st.onRemove(this.params[key]));
            if (st.onAdd) addBtn('+', 'Symbol hinzufügen', values.length < st.max, () => st.onAdd(this.params[key]));
            if (st.column && btnWrap.childNodes.length) st.strip.appendChild(btnWrap);
            if (st.column && st.toggleRow) {
                place(st.toggleRow, footRow, 2);
                st.strip.appendChild(st.toggleRow);
            }
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
                    <textarea class="ctrl-textarea" autocomplete="off" autocapitalize="off" spellcheck="false" data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other" placeholder="${placeholder}">${value}</textarea>
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
        addResetButton(config = {}) {
            const { title, onClick, afterReset } = config;
            if (title) this._resetBtn.title = title;
            if (onClick || afterReset) this._resetHooks.push({ onClick, afterReset });
            return this;
        }

        _addBuiltinResetButton() {
            this._resetHooks = [];
            const btn = document.createElement('button');
            btn.className = 'ctrl-header-btn danger ctrl-reset-btn';
            btn.title = 'Zur\u00FCcksetzen';
            btn.setAttribute('aria-label', 'Zur\u00FCcksetzen');
            btn.textContent = '\u21BA';
            bindResponsiveButtonActivation(btn, () => resetPage());
            const layoutToggle = this.headerButtonsEl.querySelector('.ctrl-layout-toggle');
            this.headerButtonsEl.insertBefore(btn, layoutToggle);
            this._resetBtn = btn;
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

        // === Voreinstellungen je Seite ===
        // Erster Aufruf je Key: Code-Wert merken und durch die Voreinstellung ersetzen. Die Seite erfaehrt
        // den Wert ueber ihr eigenes onChange, im Microtask nach ihrem synchronen Aufbau.
        _withPageDefault(key, config, field = 'value') {
            const st = pageDefaultState;
            if (!st.panels.includes(this)) st.panels.push(this);
            watchEditMode();
            if (st.seen.has(key)) return config;
            st.seen.add(key);
            st.code[key] = cloneValue(config[field]);
            const pd = currentPageDefaults();
            if (pd.ignore || !Object.prototype.hasOwnProperty.call(pd.values, key)) return config;
            const value = cloneValue(pd.values[key]);
            if (field === 'values' && !(Array.isArray(value) && value.length === (config.values || []).length)) {
                console.error(`[controls] Voreinstellung "${key}" passt nicht zur Zahl der Symbole, ignoriert`);
                return config;
            }
            if (!this._pendingDefaults) {
                this._pendingDefaults = [];
                queueMicrotask(() => {
                    const keys = this._pendingDefaults;
                    this._pendingDefaults = null;
                    keys.forEach(k => this._emitPageValue(k, st.code[k]));
                });
            }
            this._pendingDefaults.push(key);
            return { ...config, [field]: value };
        }

        _emitPageValue(key, before) {
            const value = this.params[key];
            const sym = this._symbolRows && this._symbolRows[key];
            try {
                if (sym) {
                    if (sym.onChange) value.forEach((v, i) => { if (!before || before[i] !== v) sym.onChange(i, v, value); });
                } else if (this.callbacks[key]) {
                    this.callbacks[key](value, key);
                }
            } catch (e) {
                console.error(`[controls] Voreinstellung "${key}" anwenden:`, e);
            }
        }

        /** Voreinstellung eines Keys: aus dem Editor gesetzt, sonst der Wert aus dem Seitencode. */
        defaultOf(key) {
            const { values } = currentPageDefaults();
            return cloneValue(Object.prototype.hasOwnProperty.call(values, key) ? values[key] : pageDefaultState.code[key]);
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

            if (this._symbolRows && this._symbolRows[key]) {
                this.params[key] = Array.isArray(value) ? value.slice() : [];
                this._renderSymbolRow(key);
                return this;
            }

            const row = this.bodyEl?.querySelector(`[data-key="${key}"]`);
            if (!row) return this;

            const checkbox = row.querySelector('input[type="checkbox"]');
            if (checkbox) {
                checkbox.checked = !!value;
                if (!value) this._setToggleDetailsOpen(key, false);
            }

            const range = row.querySelector('.ctrl-range');
            const valueInput = row.querySelector('.ctrl-value-input');
            if (range || valueInput) {
                const cfg = this._sliderConfigs[key];
                const numericValue = Number.isFinite(Number(value)) ? Number(value) : 0;
                const decs = cfg ? getCurrentSliderDecimals(cfg, cfg.defaultDecimals ?? 0) : 0;
                const grew = this._growSlider(key, numericValue);
                const bounds = getProjectedSliderBounds(cfg, numericValue);

                if (cfg) cfg.decimals = decs;
                if (range) {
                    range.min = bounds.min;
                    if (!(cfg && cfg.grow && cfg.grow.dragging) || grew) range.max = bounds.max;
                    range.step = getProjectedSliderStep(cfg ? cfg.step : undefined);
                    range.value = clamp(toSliderRangeValue(numericValue, cfg), bounds.min, bounds.max);
                }
                if (valueInput) {
                    valueInput.value = formatSliderControlValue(numericValue, decs, cfg);
                    fitSliderValueInput(valueInput, cfg, numericValue, decs);
                }
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
            if (Object.prototype.hasOwnProperty.call(updates, 'transform')) cfg.transform = updates.transform;

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

        /**
         * Show which row a direct manipulation (canvas drag, wheel, key) is changing:
         * opens its pencil details, scrolls it into view inside the panel body (never the page)
         * and pulses it. Safe to call on every pointermove; a closed panel stays closed and
         * the user's own panel scrolling wins for a moment.
         * @param {string|string[]} keys - first key is scrolled to, all are highlighted
         */
        reveal(keys) {
            const list = (Array.isArray(keys) ? keys : [keys]).filter((k) => k != null && k !== '');
            if (!list.length || !this.bodyEl || !this.el?.isConnected) return this;
            if (this.el.classList.contains('ctrl-panel-collapsed-body')) return this;
            const rows = list.map((k) => this.bodyEl.querySelector(`[data-key="${k}"]`)).filter(Boolean);
            if (!rows.length) return this;

            const bodyRect = this.bodyEl.getBoundingClientRect();
            const viewTop = Math.max(bodyRect.top, 0);
            const viewBottom = Math.min(bodyRect.bottom, window.innerHeight);
            if (viewBottom - viewTop < 24) return this;

            let opened = false;
            rows.forEach((row) => {
                const sub = row.closest('.ctrl-details');
                if (!sub || !sub.hidden || !this._toggleDetails) return;
                const owner = Object.keys(this._toggleDetails).find((k) => this._toggleDetails[k].sub === sub);
                if (owner) { this._setToggleDetailsOpen(owner, true); opened = true; }
            });

            rows.forEach((row) => row.classList.add('ctrl-row-revealed'));
            this._revealedRows = this._revealedRows || new Set();
            rows.forEach((row) => this._revealedRows.add(row));
            clearTimeout(this._revealFadeTimer);
            this._revealFadeTimer = setTimeout(() => {
                this._revealedRows.forEach((row) => row.classList.remove('ctrl-row-revealed'));
                this._revealedRows.clear();
            }, 900);

            if (!this._revealUserScrollBound) {
                this._revealUserScrollBound = true;
                const mark = () => { this._revealUserScrollAt = performance.now(); };
                ['wheel', 'touchstart', 'touchmove', 'pointerdown', 'keydown'].forEach((type) => {
                    this.bodyEl.addEventListener(type, mark, { passive: true });
                });
            }
            const now = performance.now();
            if (now - (this._revealUserScrollAt || -Infinity) < 1500) return this;
            if (!opened && now - (this._revealScrollAt || -Infinity) < 200) return this;

            const scrollTo = () => {
                const row = rows[0];
                if (!row.isConnected || !row.offsetParent) return;
                const r = row.getBoundingClientRect();
                const b = this.bodyEl.getBoundingClientRect();
                const top = Math.max(b.top, 0) + 8;
                const bottom = Math.min(b.bottom, window.innerHeight) - 8;
                if (r.top >= top && r.bottom <= bottom) return;
                const delta = (r.top + r.height / 2) - (top + bottom) / 2;
                this._revealScrollAt = performance.now();
                this.bodyEl.scrollTo({ top: this.bodyEl.scrollTop + delta, behavior: 'smooth' });
            };
            if (opened) requestAnimationFrame(scrollTo); else scrollTo();
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
            const idx = pageDefaultState.panels.indexOf(this);
            if (idx >= 0) pageDefaultState.panels.splice(idx, 1);

            // Remove global keyboard handler if undo/redo was enabled
            if (this._keyHandler) {
                document.removeEventListener('keydown', this._keyHandler);
                this._keyHandler = null;
            }

            clearTimeout(this._kbHoldTimer);
            if (this._handleMobileSheetResize) {
                window.removeEventListener('resize', this._handleMobileSheetResize);
                this._handleMobileSheetResize = null;
            }

            if (this._handleKbGeometry && navigator.virtualKeyboard) {
                navigator.virtualKeyboard.removeEventListener('geometrychange', this._handleKbGeometry);
                this._handleKbGeometry = null;
                navigator.virtualKeyboard.overlaysContent = false;
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

        /** Voreinstellungen je Seite (siehe VOREINSTELLUNGEN JE SEITE) */
        pageDefaults,

        /**
         * List of standard fonts for pickers
         */
        DEFAULT_FONTS: [
            'Iosevka Charon Mono', 'Libertinus Math', 'Noto Sans Math', 'IBM Plex Sans JP',
            'LINE Seed JP', 'M PLUS 1p', 'Zen Kaku Gothic New', 'Noto Serif JP', 'Noto Sans JP'
        ],
        UN0NEFINITY_FONTS: [
            'Rubik Broken Fax', 'Rubik Doodle Triangles', 'Rubik Lines', 'Ysabeau'
        ],
        FONT_CONFIG: {
            'Iosevka Charon Mono': { min: 300, max: 700 },
            'Libertinus Math': null,
            'Noto Sans Math': null,
            'IBM Plex Sans JP': { min: 100, max: 700 },
            'LINE Seed JP': { min: 100, max: 800 },
            'M PLUS 1p': { min: 100, max: 900 },
            'Zen Kaku Gothic New': { min: 300, max: 900 },
            'Noto Serif JP': { min: 200, max: 900 },
            'Noto Sans JP': { min: 100, max: 900 },
            'Rubik Broken Fax': null,
            'Rubik Doodle Triangles': null,
            'Rubik Lines': null,
            'Ysabeau': { min: 1, max: 1000 }
        }
    };

})();

