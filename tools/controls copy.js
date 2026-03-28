/**
 * 0ne-UI Controls Library
 * Generalisierte UI-Komponenten für Settings-Panels (Desktop + Mobile)
 *
 * USAGE EXAMPLE (compact one-liner style - preferred!):
 * ─────────────────────────────────────────────────────
 *   const panel = Controls.createPanel({ position: 'left' });
 *
 *   // Header buttons (appear in top-right of panel header)
 *   panel.addPauseButton({ paused: config.paused, onChange: v => config.paused = v });
 *   panel.addResetButton({ icon: '↺', title: 'Reset', onClick: () => reset() });
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
 * ─────────────────────────────────────────────────────
 */

(function () {
    'use strict';

    // === CSS INJECTION ===
    const CSS = `
/* ========== CONTROLS PANEL ========== */
.ctrl-panel {
    position: fixed;
    bottom: 1rem;
    left: 50%;
    transform: translateX(-50%);
    padding: 0.75rem 1rem;
    --ctrl-panel-bg: color-mix(in srgb, var(--bg-color, #111) 86%, transparent);
    --ctrl-panel-bg-strong: color-mix(in srgb, var(--bg-color, #111) 95%, transparent);
    --ctrl-border-soft: color-mix(in srgb, var(--text-color, #fff) 10%, transparent);
    --ctrl-border: color-mix(in srgb, var(--text-color, #fff) 20%, transparent);
    --ctrl-border-strong: color-mix(in srgb, var(--text-color, #fff) 35%, transparent);
    --ctrl-border-stronger: color-mix(in srgb, var(--text-color, #fff) 50%, transparent);
    --ctrl-fill-05: color-mix(in srgb, var(--text-color, #fff) 5%, transparent);
    --ctrl-fill-08: color-mix(in srgb, var(--text-color, #fff) 8%, transparent);
    --ctrl-fill-10: color-mix(in srgb, var(--text-color, #fff) 10%, transparent);
    --ctrl-fill-12: color-mix(in srgb, var(--text-color, #fff) 12%, transparent);
    --ctrl-fill-14: color-mix(in srgb, var(--text-color, #fff) 14%, transparent);
    --ctrl-fill-15: color-mix(in srgb, var(--text-color, #fff) 15%, transparent);
    --ctrl-fill-20: color-mix(in srgb, var(--text-color, #fff) 20%, transparent);
    --ctrl-fill-25: color-mix(in srgb, var(--text-color, #fff) 25%, transparent);
    --ctrl-fill-30: color-mix(in srgb, var(--text-color, #fff) 30%, transparent);
    --ctrl-text-30: color-mix(in srgb, var(--text-color, #fff) 30%, transparent);
    --ctrl-text-40: color-mix(in srgb, var(--text-color, #fff) 40%, transparent);
    --ctrl-text-70: color-mix(in srgb, var(--text-color, #fff) 70%, transparent);
    --ctrl-text-80: color-mix(in srgb, var(--text-color, #fff) 80%, transparent);
    --ctrl-text-90: color-mix(in srgb, var(--text-color, #fff) 90%, transparent);
    background: var(--ctrl-panel-bg);
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
    max-width: calc(100vw - 6rem); /* Platz für Menü lassen */
    isolation: isolate;
}

.ctrl-panel.dragging { opacity: 0.9; }

/* Position variants */
.ctrl-panel.position-left {
    left: 0;
    right: auto;
    bottom: 0;
    transform: none;
    border-radius: 0 12px 0 0; /* Nur oben rechts abgerundet */
}
.ctrl-panel.position-left .ctrl-panel-body {
    max-height: 40vh; /* Kleiner, damit Inhalt nicht überdeckt wird */
}
.ctrl-panel.position-right {
    left: auto;
    right: 0;
    bottom: 0;
    transform: none;
    border-radius: 12px 0 0 0; /* Nur oben links abgerundet */
}
.ctrl-panel.position-right .ctrl-panel-body {
    max-height: 40vh; /* Kleiner, damit Inhalt nicht überdeckt wird */
}

/* Header / Drag-Handle */
.ctrl-panel-header {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.5rem 0;
    margin-bottom: 0.5rem;
    border-bottom: 1px solid var(--ctrl-border-soft);
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
    background: var(--ctrl-text-30);
    border-radius: 2px;
}

/* Header Button Group */
.ctrl-header-buttons {
    position: absolute;
    right: 8px;
    display: flex;
    gap: 4px;
    align-items: center;
    isolation: isolate;
}

/* Header Button (shared style) */
.ctrl-header-btn {
    width: 22px;
    height: 22px;
    background: transparent !important;
    border: none !important;
    color: var(--ctrl-text-40);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    transition: color 0.12s ease, background-color 0.12s ease, opacity 0.12s ease;
    padding: 0;
    border-radius: 4px;
    box-shadow: none !important;
    outline: none;
    transform: none !important;
    scale: 1 !important;
    appearance: none;
    -webkit-appearance: none;
    -webkit-tap-highlight-color: transparent;
    will-change: background-color, color, opacity;
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
}
.ctrl-header-btn:hover {
    color: var(--ctrl-text-90);
    background: var(--ctrl-fill-08) !important;
}
.ctrl-header-btn:focus,
.ctrl-header-btn:focus-visible {
    color: var(--ctrl-text-90);
    background: var(--ctrl-fill-08) !important;
    outline: none;
}
.ctrl-header-btn:active {
    color: var(--text-color, #fff);
    background: var(--ctrl-fill-14) !important;
}
.ctrl-header-btn.danger:hover {
    background: var(--ctrl-fill-20) !important;
}
.ctrl-header-btn.danger:focus,
.ctrl-header-btn.danger:focus-visible {
    background: var(--ctrl-fill-20) !important;
}
.ctrl-header-btn.danger:active {
    background: var(--ctrl-fill-25) !important;
}

/* Layout Toggle Button (legacy class, now uses shared style) */
.ctrl-layout-toggle {
    /* inherits from ctrl-header-btn */
}

/* ========== BAR MODE ========== */
.ctrl-panel.bar-mode {
    display: flex;
    flex-direction: row;
    max-width: 95vw;
    width: auto;
    max-height: none;
    padding: 0.35rem 0.75rem;
    gap: 0.5rem;
    align-items: center;
}
.ctrl-panel.bar-mode .ctrl-panel-header {
    flex: 0 0 auto;
    padding: 0;
    margin: 0;
    border: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    padding-right: 0.4rem;
    border-right: 1px solid var(--ctrl-border-soft);
}
.ctrl-panel.bar-mode .ctrl-drag-indicator {
    width: 4px;
    height: 18px;
}
.ctrl-panel.bar-mode .ctrl-header-buttons {
    position: static;
    flex-direction: column;
    gap: 2px;
}
.ctrl-panel.bar-mode .ctrl-layout-toggle {
    position: static;
    margin: 0;
}
.ctrl-panel.bar-mode .ctrl-panel-body {
    display: flex;
    flex-direction: row;
    flex-wrap: nowrap; /* Keep sections side-by-side */
    gap: 0;
    align-items: stretch; /* Crucial for full-height dividers */
    align-content: center;
    max-height: none;
    overflow-x: auto; /* Allow horizontal scroll if really too wide */
    overflow-y: visible;
    width: auto;
    min-width: 0;
}
.ctrl-panel.bar-mode .ctrl-row {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    width: auto;
    margin: 0;
    min-height: 32px;
    gap: 0.5rem;
}
.ctrl-panel.bar-mode .ctrl-row:has(.ctrl-slider-group) {
    width: 400px; /* Generous width to prevent any overlap */
}
.ctrl-panel.bar-mode .ctrl-label {
    flex: 0 0 110px; /* Reduced for better proximity */
    font-size: 11px;
    text-align: left;
    margin-right: 0.25rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    opacity: 0.8;
}
.ctrl-panel.bar-mode .ctrl-row:not(:has(.ctrl-slider-group)) .ctrl-label {
    flex: 0 0 auto;
    min-width: 80px;
}
.ctrl-panel.bar-mode .ctrl-divider {
    display: block;
    width: 1px;
    height: 20px;
    background: var(--ctrl-fill-15);
    margin: 0 0.25rem;
}

/* Compact controls in bar mode */
/* Consistent width for controls in bar mode to create a grid feel */
.ctrl-panel.bar-mode .ctrl-slider-group,
.ctrl-panel.bar-mode .ctrl-textarea,
.ctrl-panel.bar-mode .ctrl-button {
    width: 240px;
    flex: 0 0 auto;
}
.ctrl-panel.bar-mode .ctrl-select {
    width: 220px;
    flex: 0 0 auto;
}
.ctrl-panel.bar-mode .ctrl-checkbox-wrap {
    width: auto;
    min-width: 1.05rem;
}

/* ========== SECTIONS ========== */
.ctrl-section {
    display: flex;
    flex-direction: column;
    gap: 0;
    width: 100%;
}
.ctrl-section.hidden {
    display: none !important;
}

/* Section Dividers in Normal Mode */
.ctrl-panel:not(.bar-mode) .ctrl-section + .ctrl-section {
    border-top: 1px solid var(--ctrl-fill-15);
    margin-top: 0.75rem;
    padding-top: 0.75rem;
}

/* Sections in Bar Mode */
.ctrl-panel.bar-mode .ctrl-section {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap; 
    width: auto;
    column-gap: 1.25rem;
    row-gap: 0.25rem;
    align-items: center;
    align-content: center;
    padding: 0.25rem 0.75rem;
    background: transparent; /* Strictly black */
}
.ctrl-panel.bar-mode .ctrl-section + .ctrl-section {
    border-left: 1px solid var(--ctrl-fill-12);
    margin-left: 0.25rem;
}

/* Body */
.ctrl-panel-body {
    overflow-y: auto;
    overflow-x: visible; /* Panel grows with content */
    -webkit-overflow-scrolling: touch;
    width: fit-content;
    min-width: 100%;
    max-height: 66vh; /* Maximal 2/3 der Seite - wird dynamisch angepasst */
}

/* Row */
.ctrl-row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
    min-height: 32px;
    width: 100%;
}
.ctrl-row:last-child { margin-bottom: 0; }

.ctrl-label {
    flex: 0 0 110px; /* Fester Wert sorgt für exakte Ausrichtung */
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 13px;
    opacity: 0.8;
}

.ctrl-stepper-btn {
    width: 30px;
    height: 30px;
    flex-shrink: 0;
    padding: 0;
    padding-bottom: 5px; /* Gleicht den optischen Schwerpunkt von + und - in Verdana aus */
    border: none;
    background: transparent !important;
    color: var(--text-color, #fff) !important;
    font-size: 1.4rem;
    font-weight: 300;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.6;
    transition: opacity 0.15s ease, transform 0.1s ease;
    user-select: none;
    -webkit-user-select: none;
    outline: none;
    border-radius: 50%;
}
.ctrl-stepper-btn:hover { 
    opacity: 1; 
    background: transparent !important;
    color: var(--text-color, #fff) !important;
    scale: 1 !important;
}
.ctrl-stepper-btn:active { 
    transform: scale(0.85); 
    opacity: 1;
    scale: 1 !important;
}

.ctrl-slider-group {
    position: relative;
    display: flex;
    align-items: center;
    flex-wrap: nowrap;
    gap: 0.3rem;
    flex: 1;
    min-width: 0; /* Verhindert Überlaufen im Grid */
}
.ctrl-range {
    flex: 1 1 auto;
    min-width: 0;
    width: 0;
    margin: 0;
    cursor: pointer;
}
.ctrl-value-input {
    background: transparent;
    border: none;
    color: var(--text-color, #fff);
    font-size: inherit;
    font-family: inherit;
    font-variant-numeric: tabular-nums;
    text-align: right;
    width: 3.5em;
    min-width: 0;
    flex: 0 0 auto;
    padding: 0.2em 0.1em;
    margin: 0 0.1em;
    outline: none;
    transition: border-color 0.15s ease, background 0.15s ease;
    border-bottom: 1px solid transparent;
}
.ctrl-value-input:hover {
    border-bottom-color: var(--ctrl-border-strong);
}
.ctrl-value-input:focus {
    border-bottom-color: var(--ctrl-border-stronger);
    background: var(--ctrl-fill-05);
}

/* Textarea - resizable in both directions */
.ctrl-textarea {
    background: var(--ctrl-fill-05);
    border: 1px solid var(--ctrl-border);
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
    border-color: var(--ctrl-border-stronger);
    background: var(--ctrl-fill-08);
}
/* Allow textarea to overflow panel bounds */
.ctrl-row:has(.ctrl-textarea) {
    overflow: visible;
}

/* Toggle Checkbox */
.ctrl-checkbox-wrap {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    flex: 0 0 auto;
    min-height: 44px;
}

/* Range Slider */
.ctrl-range {
    flex: 1;
    height: 6px;
    -webkit-appearance: none;
    appearance: none;
    background: var(--ctrl-fill-20);
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
    position: relative;
    flex: 1;
    min-width: 0;
}
.ctrl-select-trigger {
    width: 100%;
    min-height: 32px;
    background: var(--ctrl-fill-08);
    color: var(--text-color, #fff);
    border: 1px solid var(--ctrl-border-strong);
    border-radius: 6px;
    padding: 0.42rem 2rem 0.42rem 0.65rem;
    font-size: 13px;
    font-family: inherit;
    line-height: 1.2;
    cursor: pointer;
    outline: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    text-align: left;
    transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
    position: relative;
}
.ctrl-select-trigger:hover {
    background: var(--ctrl-fill-12);
    border-color: var(--ctrl-border-stronger);
    color: var(--text-color, #fff);
}
.ctrl-select-trigger:focus,
.ctrl-select-trigger:focus-visible,
.ctrl-select-trigger.open {
    background: var(--ctrl-fill-15);
    border-color: var(--text-color, #fff);
    color: var(--text-color, #fff);
}
.ctrl-select-value {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.ctrl-select-caret {
    position: absolute;
    right: 0.7rem;
    top: 50%;
    width: 0.55rem;
    height: 0.55rem;
    border-right: 1.5px solid currentColor;
    border-bottom: 1.5px solid currentColor;
    transform: translateY(-60%) rotate(45deg);
    opacity: 0.9;
    pointer-events: none;
    transition: transform 0.15s ease;
}
.ctrl-select-trigger.open .ctrl-select-caret {
    transform: translateY(-35%) rotate(-135deg);
}
.ctrl-select-popup {
    position: fixed;
    display: none;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
    max-width: min(320px, calc(100vw - 12px));
    max-height: min(40vh, 280px);
    padding: 0.35rem;
    background: var(--ctrl-panel-bg-strong, color-mix(in srgb, var(--bg-color, #111) 95%, transparent));
    border: 1px solid var(--ctrl-border-strong, color-mix(in srgb, var(--text-color, #fff) 35%, transparent));
    border-radius: 10px;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
    overflow-y: auto;
    overflow-x: hidden;
    z-index: 10001;
    box-sizing: border-box;
}
.ctrl-select-popup.open {
    display: flex;
}
.ctrl-select-popup button {
    appearance: none;
    -webkit-appearance: none;
    box-shadow: none;
    scale: 1;
}
.ctrl-select-option {
    width: 100%;
    min-height: 32px;
    background: transparent;
    color: var(--text-color, #fff);
    border: 1px solid transparent;
    border-radius: 7px;
    padding: 0.45rem 0.65rem;
    font: inherit;
    line-height: 1.2;
    text-align: left;
    cursor: pointer;
    white-space: normal;
    transition: background-color 0.12s ease, color 0.12s ease, border-color 0.12s ease;
}
.ctrl-select-option:hover,
.ctrl-select-option:focus,
.ctrl-select-option:focus-visible {
    background: var(--text-color, #fff);
    color: var(--bg-color, #111);
    border-color: var(--text-color, #fff);
    scale: 1;
}
.ctrl-select-option.selected {
    border-color: var(--text-color, #fff);
    box-shadow: inset 0 0 0 1px var(--text-color, #fff);
}
.ctrl-select-option.selected:hover,
.ctrl-select-option.selected:focus,
.ctrl-select-option.selected:focus-visible {
    box-shadow: inset 0 0 0 1px var(--bg-color, #111);
}
.ctrl-select-option[aria-selected="true"] {
    font-weight: 600;
}

/* Button */
.ctrl-button {
    flex: 0 0 auto;
    height: 32px;
    background: var(--ctrl-fill-10);
    color: var(--text-color, #fff);
    border: 1px solid var(--ctrl-border-strong);
    border-radius: 6px;
    padding: 0 0.75rem;
    font-size: 13px;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
}
.ctrl-button:hover {
    background: var(--ctrl-fill-20);
    border-color: var(--ctrl-border-stronger);
}
.ctrl-button:active {
    background: var(--ctrl-fill-25);
}

/* Verhindert, dass meta.css-Button-Globalstyles (scale, transition: all)
   ins Control-Panel durchschlagen und einen Scrollbar-Flash auslösen */
.ctrl-panel button {
    transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, opacity 0.15s ease;
}
.ctrl-panel button:hover,
.ctrl-panel button:active {
    scale: 1;
}
.ctrl-panel button:focus,
.ctrl-panel button:focus-visible {
    outline: none;
}

/* Value Display */
.ctrl-value-display {
    min-width: 45px;
    flex-shrink: 0;
    text-align: right;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    opacity: 0.7;
}

/* Section Divider */
.ctrl-divider {
    height: 1px;
    background: var(--ctrl-fill-15);
    margin: 0.75rem 0;
}

/* Metrics Section */
.ctrl-metrics {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-variant-numeric: tabular-nums;
}
.ctrl-metrics-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    user-select: none;
    padding: 0.25rem 0;
    opacity: 0.8;
}
.ctrl-metrics-header:hover {
    opacity: 1;
}
.ctrl-metrics-toggle {
    font-size: 0.8em;
    opacity: 0.6;
}
.ctrl-metrics-content {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
}
.ctrl-metrics-content.collapsed {
    display: none;
}
.ctrl-metrics-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.9em;
}
.ctrl-metrics-row.total {
    border-top: 1px solid var(--ctrl-border);
    padding-top: 0.25rem;
    margin-top: 0.15rem;
    font-weight: bold;
}
.ctrl-metrics-row.secondary {
    opacity: 0.5;
    font-size: 0.8em;
}

/* Pattern Picker */
.ctrl-pattern-picker {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    width: 100%;
}
.ctrl-pattern-picker-label {
    font-size: 13px;
    opacity: 0.8;
}
.ctrl-pattern-grid {
    display: grid;
    gap: 4px;
}
.ctrl-pattern-btn {
    aspect-ratio: 1;
    background: var(--ctrl-fill-08);
    border: 2px solid transparent;
    border-radius: 6px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, border-color 0.15s, transform 0.1s;
    padding: 2px;
}
.ctrl-pattern-btn:hover {
    background: var(--ctrl-fill-15);
    transform: scale(1.05);
}
.ctrl-pattern-btn.active {
    border-color: var(--ctrl-text-80);
    background: var(--ctrl-fill-20);
}
.ctrl-pattern-btn canvas {
    width: 100%;
    height: 100%;
    image-rendering: pixelated;
    image-rendering: crisp-edges;
}
.ctrl-pattern-btn[title]:hover::after {
    content: attr(title);
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    background: var(--ctrl-panel-bg-strong);
    color: var(--text-color, #fff);
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    white-space: nowrap;
    pointer-events: none;
    z-index: 1000;
}

/* Metrics Overlay (above panel) */
.ctrl-metrics-overlay {
    position: absolute;
    bottom: 100%;
    left: 0;
    right: 0;
    background: var(--ctrl-panel-bg);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border-radius: 8px 8px 0 0;
    padding: 0.5rem 0.75rem;
    margin-bottom: 1px;
    font-size: 12px;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
}
.ctrl-metrics-overlay.collapsed {
    padding: 0.3rem 0.75rem;
}
.ctrl-metrics-overlay.collapsed .ctrl-metrics-content {
    display: none;
}

/* Text Styled Control (text + ... button with popup) */
.ctrl-text-styled {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    position: relative;
}
.ctrl-text-styled .ctrl-textarea {
    flex: 1;
}
.ctrl-text-styled-btn {
    width: 24px;
    height: 24px;
    background: transparent;
    border: none;
    color: var(--ctrl-text-40);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    letter-spacing: -1px;
    transition: color 0.15s, background 0.15s;
    padding: 0;
    border-radius: 4px;
    flex-shrink: 0;
}
.ctrl-text-styled-btn:hover {
    color: var(--ctrl-text-90);
    background: var(--ctrl-fill-10);
}
.ctrl-text-styled-btn.active {
    color: var(--ctrl-text-90);
    background: var(--ctrl-fill-15);
}

/* Popup for style options */
.ctrl-style-popup {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 4px;
    background: var(--ctrl-panel-bg-strong);
    border: 1px solid var(--ctrl-border);
    border-radius: 8px;
    padding: 0.5rem;
    z-index: 200;
    min-width: 180px;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
}
.ctrl-style-popup.hidden {
    display: none;
}
.ctrl-style-popup-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}
.ctrl-style-popup-label {
    font-size: 11px;
    opacity: 0.7;
    flex: 0 0 50px;
}
.ctrl-style-popup input[type="color"] {
    width: 28px;
    height: 24px;
    border: 1px solid var(--ctrl-border);
    border-radius: 4px;
    background: transparent;
    cursor: pointer;
    padding: 0;
}
.ctrl-style-popup input[type="color"]::-webkit-color-swatch-wrapper {
    padding: 2px;
}
.ctrl-style-popup input[type="color"]::-webkit-color-swatch {
    border-radius: 2px;
    border: none;
}
.ctrl-style-popup input[type="range"] {
    flex: 1;
    height: 4px;
    -webkit-appearance: none;
    appearance: none;
    background: var(--ctrl-fill-20);
    border-radius: 2px;
    outline: none;
    cursor: pointer;
}
.ctrl-style-popup input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 12px;
    height: 12px;
    background: var(--text-color, #fff);
    border-radius: 50%;
    cursor: pointer;
}
.ctrl-style-popup .ctrl-style-value {
    font-size: 10px;
    opacity: 0.6;
    min-width: 28px;
    text-align: right;
    font-variant-numeric: tabular-nums;
}

/* ========== SLIDER CONFIG MENU ========== */
/* Drei-Punkte-Button - standardmäßig ausgeblendet */
.ctrl-config-trigger {
    width: 16px;
    height: 16px;
    background: transparent;
    border: none;
    color: var(--ctrl-text-30);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: bold;
    letter-spacing: 0;
    transition: color 0.15s, background 0.15s, opacity 0.15s;
    padding: 0;
    margin-left: 4px;
    border-radius: 3px;
    opacity: 0;
    flex-shrink: 0;
}

/* Bei Hover über der Row einblenden */
.ctrl-row:hover .ctrl-config-trigger {
    opacity: 1;
}

.ctrl-config-trigger:hover {
    color: var(--ctrl-text-90);
    background: var(--ctrl-fill-10);
}

/* Popup-Menü - fixed für Bar-Mode Kompatibilität */
.ctrl-config-popup {
    position: fixed;
    background: var(--ctrl-panel-bg-strong);
    border: 1px solid var(--ctrl-border);
    border-radius: 6px;
    padding: 0.5rem 0.4rem;
    z-index: 10000;
    min-width: 130px;
    display: none;
    flex-direction: column;
    gap: 0.35rem;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
}

.ctrl-config-popup.open {
    display: flex;
}

/* Row im Popup */
.ctrl-config-row {
    display: flex;
    align-items: center;
    gap: 0.3rem;
}

.ctrl-config-label {
    font-size: 12px;
    opacity: 0.7;
    flex: 0 0 30px;
}

/* Input-Felder im Popup */
.ctrl-config-input {
    width: 55px;
    background: var(--ctrl-fill-10);
    border: 1px solid var(--ctrl-border);
    border-radius: 3px;
    color: var(--text-color, #fff);
    padding: 0.2rem 0.25rem;
    font-size: 12px;
    font-family: inherit;
    outline: none;
}

.ctrl-config-input:focus {
    border-color: var(--ctrl-border-stronger);
    background: var(--ctrl-fill-15);
}

/* Reset-Button */
.ctrl-config-reset {
    margin-top: 0.2rem;
    padding: 0.25rem 0.4rem;
    background: transparent;
    border: 1px solid var(--ctrl-border);
    border-radius: 3px;
    color: var(--ctrl-text-70);
    cursor: pointer;
    font-size: 11px;
    transition: background 0.15s, color 0.15s;
}

.ctrl-config-reset:hover {
    background: var(--ctrl-fill-10);
    color: var(--text-color, #fff);
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
        box-sizing: border-box;
        overflow-x: hidden;
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
        width: 100%;
        min-width: 0;
        box-sizing: border-box;
    }

    .ctrl-section {
        width: 100%;
        min-width: 0;
    }

    .ctrl-row {
        min-height: 44px;
        gap: 0.75rem;
        width: 100%;
        min-width: 0;
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
        width: 38px;
        height: 38px;
        font-size: 1.45rem;
    }

    .ctrl-slider-group {
        gap: 0.2rem;
    }

    .ctrl-value-input {
        width: 2.8em;
        margin: 0;
    }

    .ctrl-config-trigger {
        width: 20px;
        height: 20px;
        margin-left: 0;
    }

    .ctrl-range::-webkit-slider-thumb {
        width: 24px;
        height: 24px;
    }
    .ctrl-range::-moz-range-thumb {
        width: 24px;
        height: 24px;
    }

    .ctrl-checkbox-wrap {
        min-height: 48px;
    }

    .ctrl-slider-group,
    .ctrl-select {
        width: 100%;
        min-width: 0;
        min-height: 44px;
    }

    .ctrl-textarea,
    .ctrl-text-styled,
    .ctrl-button {
        width: 100%;
        max-width: 100%;
        min-width: 0;
    }

    .ctrl-textarea {
        flex: 1 1 auto;
        resize: vertical;
    }

    .ctrl-row:has(.ctrl-textarea) {
        overflow: hidden;
    }

    .ctrl-select-trigger,
    .ctrl-select-option {
        min-height: 44px;
        font-size: 16px;
    }

    /* Config-Menu auf Mobile immer sichtbar */
    .ctrl-config-trigger {
        opacity: 1 !important;
    }
}

@media (max-width: 380px) {
    .ctrl-label {
        flex: 0 0 60px;
        font-size: 13px;
    }

    .ctrl-stepper-btn {
        width: 34px;
        height: 34px;
        font-size: 1.3rem;
    }

    .ctrl-value-input {
        width: 2.5em;
    }

    .ctrl-config-trigger {
        width: 18px;
        height: 18px;
    }
}
`;

    // Inject CSS into document
    function injectCSS() {
        if (!document.getElementById('ctrl-panel-styles')) {
            const style = document.createElement('style');
            style.id = 'ctrl-panel-styles';
            style.textContent = CSS + CSS_MOBILE;
            document.head.appendChild(style);
        }

        // Auto-load local Fonts for the DEFAULT_FONTS list
        if (!document.getElementById('ctrl-panel-fonts')) {
            const link = document.createElement('link');
            link.id = 'ctrl-panel-fonts';
            link.rel = 'stylesheet';
            link.href = '/tools/fonts/fonts.css?v=' + Date.now();
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
            this._sliderConfigs = {};  // Speichert Original-Konfiguration pro Key für Config-Menü
            this.el = null;
            this.headerEl = null;
            this.bodyEl = null;
            this._isDragging = false;
            this._dragStart = { x: 0, y: 0 };
            this._panelStart = { x: 0, y: 0 };
            this._mobileY = 0;
            this._sections = {};
            this._currentContainer = null; // Will be set to bodyEl in _create
            this._activeConfigKey = null; // Aktuell geöffnetes Config-Menü
            this._selectControls = {};
            this._selectPopupEl = null;
            this._activeSelectKey = null;
            this._handleSelectDocumentClick = (e) => {
                const popup = this._selectPopupEl;
                if (!popup || !popup.classList.contains('open')) return;
                if (popup.contains(e.target)) return;

                const activeControl = this._selectControls[this._activeSelectKey];
                if (activeControl?.triggerEl?.contains(e.target)) return;

                this._closeSelectPopup();
            };
            this._handleSelectViewportChange = () => {
                if (this._activeSelectKey) this._closeSelectPopup();
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

        // Globales Config-Popup erstellen (singleton)
        _getGlobalConfigPopup() {
            let popup = document.getElementById('ctrl-global-config-popup');
            if (!popup) {
                popup = document.createElement('div');
                popup.id = 'ctrl-global-config-popup';
                popup.className = 'ctrl-config-popup';
                popup.style.position = 'fixed';
                document.body.appendChild(popup);

                // Click außerhalb schließt Popup
                document.addEventListener('click', (e) => {
                    if (!popup.contains(e.target) && !e.target.classList.contains('ctrl-config-trigger')) {
                        popup.classList.remove('open');
                        this._activeConfigKey = null;
                    }
                });
            }
            return popup;
        }

        // Config-Popup öffnen für einen bestimmten Slider
        _openConfigPopup(key, triggerEl) {
            const cfg = this._sliderConfigs[key];
            if (!cfg) return;
            this._closeSelectPopup();

            const popup = this._getGlobalConfigPopup();

            // Popup-Inhalt aktualisieren
            popup.innerHTML = `
                <div class="ctrl-config-row">
                    <span class="ctrl-config-label">Min</span>
                    <input type="number" class="ctrl-config-input" data-config="min" value="${cfg.min}" step="any">
                </div>
                <div class="ctrl-config-row">
                    <span class="ctrl-config-label">Max</span>
                    <input type="number" class="ctrl-config-input" data-config="max" value="${cfg.max}" step="any">
                </div>
                <div class="ctrl-config-row">
                    <span class="ctrl-config-label">Step</span>
                    <input type="number" class="ctrl-config-input" data-config="step" value="${cfg.step}" step="any">
                </div>
                <button class="ctrl-config-reset">Reset</button>
            `;

            // Event-Handler für Inputs
            popup.querySelectorAll('.ctrl-config-input').forEach(input => {
                input.addEventListener('change', () => {
                    const configType = input.dataset.config;
                    let newVal = parseFloat(input.value);
                    if (!isNaN(newVal)) {
                        cfg[configType] = newVal;
                        // Wert clampen und UI aktualisieren
                        this._updateSliderFromConfig(key);
                    }
                });
            });

            // Reset-Button
            popup.querySelector('.ctrl-config-reset').addEventListener('click', () => {
                cfg.min = cfg.defaultMin;
                cfg.max = cfg.defaultMax;
                cfg.step = cfg.defaultStep;
                popup.querySelector('[data-config="min"]').value = cfg.defaultMin;
                popup.querySelector('[data-config="max"]').value = cfg.defaultMax;
                popup.querySelector('[data-config="step"]').value = cfg.defaultStep;
                this._updateSliderFromConfig(key);
            });

            // Positionieren
            const triggerRect = triggerEl.getBoundingClientRect();
            const popupWidth = 130;
            const viewportHeight = window.innerHeight;
            const viewportWidth = window.innerWidth;

            let left = triggerRect.right - popupWidth;
            if (left < 5) left = 5;
            if (left + popupWidth > viewportWidth - 5) left = viewportWidth - popupWidth - 5;
            popup.style.left = `${left}px`;

            // Popup anzeigen um Höhe zu messen
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
            this._activeConfigKey = key;
        }

        // Slider-Wert und UI nach Config-Änderung aktualisieren
        _updateSliderFromConfig(key) {
            const cfg = this._sliderConfigs[key];
            const row = this.bodyEl.querySelector(`[data-key="${key}"]`);
            if (!row || !cfg) return;

            const range = row.querySelector('.ctrl-range');
            const input = row.querySelector('.ctrl-value-input');
            const display = row.querySelector('.ctrl-value-display');

            if (range) {
                range.min = cfg.min;
                range.max = cfg.max;
                range.step = cfg.step;
            }

            // Wert clampen
            const clampedValue = clamp(this.params[key], cfg.min, cfg.max);
            if (clampedValue !== this.params[key]) {
                this.params[key] = clampedValue;
                if (range) range.value = clampedValue;
                if (input) input.value = formatValue(clampedValue, cfg.decimals);
                if (display) display.textContent = formatValue(clampedValue, cfg.decimals);
                if (this.callbacks[key]) this.callbacks[key](clampedValue);
            }
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
                <div class="ctrl-drag-indicator"></div>
                <div class="ctrl-header-buttons">
                    <button class="ctrl-header-btn ctrl-layout-toggle" title="Breit">↔</button>
                </div>
            `;
            this.el.appendChild(this.headerEl);

            // Store reference to button group
            this.headerButtonsEl = this.headerEl.querySelector('.ctrl-header-buttons');

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
            this.bodyEl.addEventListener('scroll', this._handleSelectViewportChange, { passive: true });
            window.addEventListener('resize', this._handleSelectViewportChange);

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

            // Initial height calculation (after DOM is ready)
            requestAnimationFrame(() => this._updateBodyHeight());
        }

        _isHeaderButtonTarget(target) {
            return target instanceof Element && !!target.closest('.ctrl-header-buttons');
        }

        // Toggle between panel and bar layout
        _toggleLayout() {
            this._isBarMode = !this._isBarMode;
            const toggleBtn = this.headerEl.querySelector('.ctrl-layout-toggle');

            if (this._isBarMode) {
                // Check if panel is at/near bottom edge before switching to bar mode
                const rect = this.el.getBoundingClientRect();
                const bottomBuffer = 20; // px tolerance
                const isAtBottom = rect.bottom >= window.innerHeight - bottomBuffer;

                if (isAtBottom) {
                    // Reset to bottom position for bar mode
                    this.el.style.top = 'auto';
                    this.el.style.bottom = '0';
                }

                this.el.classList.add('bar-mode');
                toggleBtn.textContent = '↕';
                toggleBtn.title = 'Schmal';
                // Reset body max-height for bar mode
                this.bodyEl.style.maxHeight = '';
                // Set initial bar width
                this._updateBarWidth();
            } else {
                // Check if panel is at/near bottom edge before switching back
                const rect = this.el.getBoundingClientRect();
                const bottomBuffer = 0; // px tolerance
                const isAtBottom = rect.bottom >= window.innerHeight - bottomBuffer;

                if (isAtBottom) {
                    // Reset to bottom position for panel mode
                    this.el.style.top = 'auto';
                    this.el.style.bottom = '0';
                }

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
            const padding = this.el.style.padding ? parseFloat(this.el.style.padding) : 12;

            // Check if panel has been dragged (has explicit top position)
            const hasExplicitTop = this.el.style.top && this.el.style.top !== 'auto';

            let availableHeight;
            if (hasExplicitTop) {
                // Panel was dragged - calculate from top position
                availableHeight = window.innerHeight - rect.top - headerHeight - 16;
            } else {
                // Panel is at bottom - calculate from bottom (max 2/3 of screen)
                const bottomOffset = 16; // 1rem
                const maxHeight = Math.min(
                    window.innerHeight * 0.66, // Max 2/3 der Seite
                    window.innerHeight - bottomOffset - headerHeight - padding - 70 // 70px für Menü-Button oben
                );
                availableHeight = maxHeight;
            }

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

        // Menü-Breite ermitteln (für Bounds)
        _getMenuWidth() {
            const menu = document.querySelector('.menu');
            return menu ? menu.offsetWidth : 70;
        }

        _initDrag() {
            // Track previous rect for drag events
            this._prevDragRect = null;

            // Desktop drag
            this.headerEl.addEventListener('mousedown', (e) => {
                if (isMobile() || this._isHeaderButtonTarget(e.target)) return;
                this._isDragging = true;
                this.el.classList.add('dragging');
                const rect = this.el.getBoundingClientRect();
                this._dragStart = { x: e.clientX, y: e.clientY };
                this._panelStart = { x: rect.left, y: rect.top };
                this._prevDragRect = rect;
                // Position von bottom/transform auf top/left umstellen
                this.el.style.bottom = 'auto';
                this.el.style.transform = 'none';
                this.el.style.left = rect.left + 'px';
                this.el.style.top = rect.top + 'px';
                e.preventDefault();

                // Fire drag start event
                this.el.dispatchEvent(new CustomEvent('ctrl-panel-drag-start', {
                    bubbles: true,
                    detail: { rect }
                }));
            });

            document.addEventListener('mousemove', (e) => {
                if (!this._isDragging) return;
                const dx = e.clientX - this._dragStart.x;
                const dy = e.clientY - this._dragStart.y;

                // Gewünschte Position berechnen
                let newLeft = this._panelStart.x + dx;
                let newTop = this._panelStart.y + dy;

                // Bounds: Menü-Breite berücksichtigen
                const menuWidth = this._getMenuWidth();
                const rightBound = window.innerWidth - menuWidth;

                // Im Bar-Modus: max-width ZUERST setzen, dann Position clampen
                if (this._isBarMode) {
                    const availableWidth = rightBound - Math.max(0, newLeft) - 16;
                    this.el.style.maxWidth = Math.max(200, availableWidth) + 'px';
                }

                // Horizontal: Position clampen (nicht hinters Menü!)
                const panelWidth = this.el.offsetWidth;
                const maxLeft = Math.max(0, rightBound - panelWidth);
                newLeft = clamp(newLeft, 0, maxLeft);

                // Vertikal: Oben Menü-Button-Höhe, unten Bildschirmrand
                const menuButtonHeight = 70;
                const headerHeight = this.headerEl?.offsetHeight || 40;
                const maxTop = Math.max(0, window.innerHeight - headerHeight - 8);
                newTop = clamp(newTop, menuButtonHeight, maxTop);

                this.el.style.left = newLeft + 'px';
                this.el.style.top = newTop + 'px';

                // Fire drag move event with current and previous rect
                const rect = this.el.getBoundingClientRect();
                this.el.dispatchEvent(new CustomEvent('ctrl-panel-drag-move', {
                    bubbles: true,
                    detail: {
                        rect,
                        prevRect: this._prevDragRect
                    }
                }));
                this._prevDragRect = rect;

                // Update body height while dragging
                this._updateBodyHeight();
            });

            document.addEventListener('mouseup', () => {
                if (this._isDragging) {
                    // Fire drag end event
                    const rect = this.el.getBoundingClientRect();
                    this.el.dispatchEvent(new CustomEvent('ctrl-panel-drag-end', {
                        bubbles: true,
                        detail: { rect }
                    }));

                    this._isDragging = false;
                    this._prevDragRect = null;
                    this.el.classList.remove('dragging');
                    this._updateBodyHeight();
                    this._updateBarWidth();
                }
            });

            // Menü-Änderungen beobachten für Bounds-Update
            const menu = document.querySelector('.menu');
            if (menu) {
                const observer = new MutationObserver(() => this._clampToMenuBounds());
                observer.observe(menu, { attributes: true, attributeFilter: ['class'] });
            }

            // Initial height + resize
            this._updateBodyHeight();
            window.addEventListener('resize', () => {
                this._updateBodyHeight();
                this._updateBarWidth();
                this._clampToMenuBounds();
            });
        }

        // Panel in Bounds halten wenn Menü sich ändert
        _clampToMenuBounds() {
            if (isMobile()) return;
            const rect = this.el.getBoundingClientRect();
            const menuWidth = this._getMenuWidth();
            const rightBound = window.innerWidth - menuWidth;

            if (rect.right > rightBound) {
                const newLeft = Math.max(0, rightBound - rect.width);
                this.el.style.left = newLeft + 'px';
            }
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
                const maxY = getMaxY();
                this._mobileY = maxY * 0.2;
                this.el.style.transform = `translateY(${this._mobileY}px)`;
                updateContentPosition(this._mobileY, false);
            };

            initPosition();
            window.addEventListener('resize', initPosition);

            // Tap to toggle: closed -> half -> open -> closed
            this.headerEl.addEventListener('click', (e) => {
                if (!isMobile()) return;
                if (this._isHeaderButtonTarget(e.target)) return;
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
                if (this._isHeaderButtonTarget(e.target)) return;
                isTouchDragging = false;
                touchStartY = e.touches[0].clientY;
                this.el.style.transition = 'none';
                if (contentEl) contentEl.style.transition = 'none';
            }, { passive: true });

            this.headerEl.addEventListener('touchmove', (e) => {
                if (!isMobile()) return;
                if (this._isHeaderButtonTarget(e.target)) return;
                isTouchDragging = true;
                const deltaY = e.touches[0].clientY - touchStartY;
                const newY = clampY(this._mobileY + deltaY);
                this.el.style.transform = `translateY(${newY}px)`;
                updateContentPosition(newY, false);
            }, { passive: true });

            this.headerEl.addEventListener('touchend', (e) => {
                if (!isMobile()) return;
                if (this._isHeaderButtonTarget(e.target)) return;
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

        // === ROW CREATION METHODS ===

        /**
         * Add a unified Slider + Stepper row (Slider + [-] [input] [+])
         */
        addSlider(key, config) {
            const { label, min, max, step, value, decimals = 0, onChange } = config;
            this.params[key] = value;
            if (onChange) this.callbacks[key] = onChange;

            // Slider-Config für Config-Menü speichern
            this._sliderConfigs[key] = {
                min, max, step, decimals,
                defaultMin: min, defaultMax: max, defaultStep: step
            };

            const row = document.createElement('div');
            row.className = 'ctrl-row';
            row.dataset.key = key;
            row.innerHTML = `
                <label class="ctrl-label">${label}</label>
                <div class="ctrl-slider-group">
                    <button class="ctrl-stepper-btn" data-action="dec">−</button>
                    <input type="range" class="ctrl-range" min="${min}" max="${max}" step="${step}" value="${value}">
                    <button class="ctrl-stepper-btn" data-action="inc">+</button>
                    <input type="text" class="ctrl-value-input" value="${formatValue(value, decimals)}">
                    <button class="ctrl-config-trigger" title="Einstellungen">⋮</button>
                </div>
            `;

            const range = row.querySelector('.ctrl-range');
            const input = row.querySelector('.ctrl-value-input');
            const decBtn = row.querySelector('[data-action="dec"]');
            const incBtn = row.querySelector('[data-action="inc"]');
            const configTrigger = row.querySelector('.ctrl-config-trigger');

            const updateValue = (newVal, updateInput = true) => {
                // newVal = clamp(newVal, min, max); // Let the universe be unlimited!
                const cfg = this._sliderConfigs[key];
                const decs = cfg ? cfg.decimals : decimals;
                const factor = Math.pow(10, decs);
                newVal = Math.round(newVal * factor) / factor;
                this.params[key] = newVal;

                range.value = newVal;
                if (updateInput) {
                    input.value = formatValue(newVal, decs);
                }

                if (this.callbacks[key]) this.callbacks[key](newVal, key);
            };

            // Slider Events
            range.addEventListener('input', () => {
                const val = parseFloat(range.value);
                updateValue(val);
            });

            // Input Events
            input.addEventListener('input', () => {
                const parsed = parseFloat(input.value);
                if (!isNaN(parsed)) updateValue(parsed, false);
            });
            input.addEventListener('blur', () => {
                const parsed = parseFloat(input.value);
                const cfg = this._sliderConfigs[key];
                const decs = cfg ? cfg.decimals : decimals;
                if (isNaN(parsed)) {
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

            const startHold = (delta, initialEvent) => {
                if (isHolding) return;
                // Nicht starten wenn wir schon am Minimum/Maximum sind
                const newVal = this.params[key] + delta;
                const cfg = this._sliderConfigs[key];
                const currentMin = cfg ? cfg.min : min;
                const currentMax = cfg ? cfg.max : max;
                if (newVal < currentMin || newVal > currentMax) return;

                isHolding = true;
                // Sofort ein erster Schritt
                updateValue(newVal);
                holdInterval = setInterval(() => {
                    const nextVal = this.params[key] + delta;
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

                    // Prüfen ob wir überhaupt weiter können
                    const delta = getDelta();
                    const newVal = this.params[key] + delta;
                    const cfg = this._sliderConfigs[key];
                    const currentMin = cfg ? cfg.min : min;
                    const currentMax = cfg ? cfg.max : max;
                    if (newVal < currentMin || newVal > currentMax) return;

                    // Manuelles Click Handling (anstelle von on('click')) sorgt für sofortige Reaktion
                    holdTimeout = setTimeout(() => { startHold(delta, e); }, 400);
                });

                btn.addEventListener('pointerup', (e) => {
                    // Wenn wir noch nicht lange gehalten haben, war es ein einfacher Click
                    if (!isHolding && holdTimeout) {
                        const delta = getDelta();
                        const newVal = this.params[key] + delta;
                        const cfg = this._sliderConfigs[key];
                        const currentMin = cfg ? cfg.min : min;
                        const currentMax = cfg ? cfg.max : max;
                        if (newVal >= currentMin && newVal <= currentMax) {
                            updateValue(newVal);
                        }
                    }
                    stopHold();
                    btn.releasePointerCapture(e.pointerId);
                });

                btn.addEventListener('pointercancel', stopHold);
                // click-Event blockieren, da wir es über pointerdown/-up selbst handhaben
                btn.addEventListener('click', (e) => e.preventDefault());
            });

            // Config-Menü: Globales Popup öffnen
            configTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                this._openConfigPopup(key, configTrigger);
            });

            this._currentContainer.appendChild(row);
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
                    <button class="ctrl-text-styled-btn" title="Styling">⋮<!-- vertical elipsis, lol --></button>
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
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
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
            const { label, onClick } = config;

            const row = document.createElement('div');
            row.className = 'ctrl-row';
            row.dataset.key = key;
            row.innerHTML = `
                <button class="ctrl-button">${label}</button>
            `;

            const button = row.querySelector('button');
            button.addEventListener('click', () => {
                if (onClick) onClick(key);
            });

            this.bodyEl.appendChild(row);
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
         * @param {string} config.label - Header label (default: '📊 Metriken')
         * @param {boolean} config.collapsed - Start collapsed (default: false)
         * @param {boolean} config.showFps - Show FPS counter (default: true)
         * @param {number} config.updateInterval - Update interval in ms (default: 200)
         * @param {Function} config.getData - Function returning { items: [{label, value}], total?, secondary?: [{label, value}] }
         * @param {PIXI.Application} config.pixiApp - Optional Pixi app for FPS
         */
        addMetrics(key, config) {
            const {
                label = '📊 Metriken',
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
                    <span class="ctrl-metrics-toggle">${isCollapsed ? '[+]' : '[−]'}</span>
                </div>
                <div class="ctrl-metrics-content ${isCollapsed ? 'collapsed' : ''}"></div>
            `;

            const header = row.querySelector('.ctrl-metrics-header');
            const toggle = row.querySelector('.ctrl-metrics-toggle');
            const content = row.querySelector('.ctrl-metrics-content');

            header.addEventListener('click', () => {
                isCollapsed = !isCollapsed;
                content.classList.toggle('collapsed', isCollapsed);
                toggle.textContent = isCollapsed ? '[+]' : '[−]';
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
                        html += `<div class="ctrl-metrics-row total"><span>Σ</span><span>${data.total}</span></div>`;
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
                label = '📊',
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
                    <span class="ctrl-metrics-toggle">${isCollapsed ? '[+]' : '[−]'}</span>
                </div>
                <div class="ctrl-metrics-content"></div>
            `;

            const header = overlay.querySelector('.ctrl-metrics-header');
            const toggle = overlay.querySelector('.ctrl-metrics-toggle');
            const content = overlay.querySelector('.ctrl-metrics-content');

            header.addEventListener('click', () => {
                isCollapsed = !isCollapsed;
                overlay.classList.toggle('collapsed', isCollapsed);
                toggle.textContent = isCollapsed ? '[+]' : '[−]';
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
                        html += `<div class="ctrl-metrics-row total"><span>Σ</span><span>${data.total}</span></div>`;
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
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
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
            const { icon = '↺', title = 'Reset', onClick } = config;
            const btn = document.createElement('button');
            btn.className = 'ctrl-header-btn danger';
            btn.title = title;
            btn.textContent = icon;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
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
            this._undoBtn.textContent = '↩';
            this._undoBtn.disabled = true;
            this._undoBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.undo();
            });

            // Create Redo Button
            this._redoBtn = document.createElement('button');
            this._redoBtn.className = 'ctrl-header-btn';
            this._redoBtn.title = 'Redo (Ctrl+Shift+Z)';
            this._redoBtn.textContent = '↪';
            this._redoBtn.disabled = true;
            this._redoBtn.addEventListener('click', (e) => {
                e.stopPropagation();
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
                iconPlay = '▶',
                iconPause = '⏸',
                title = 'Play/Pause',
                onChange
            } = config;

            let isPaused = paused;

            const btn = document.createElement('button');
            btn.className = 'ctrl-header-btn';
            btn.title = title;
            btn.textContent = isPaused ? iconPlay : iconPause;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
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
                const decs = cfg ? cfg.decimals : 0;
                if (range) range.value = value;
                if (valueInput) valueInput.value = formatValue(Number(value) || 0, decs);
            }

            const textarea = row.querySelector('.ctrl-textarea');
            if (textarea && typeof value !== 'object') {
                textarea.value = value ?? '';
            }

            if (this._selectControls[key]) {
                this._updateSelectUI(key, value);
            }

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

            this._closeSelectPopup();
            document.removeEventListener('click', this._handleSelectDocumentClick);
            window.removeEventListener('resize', this._handleSelectViewportChange);

            if (this.bodyEl) {
                this.bodyEl.removeEventListener('scroll', this._handleSelectViewportChange);
            }

            if (this._selectPopupEl && this._selectPopupEl.parentNode) {
                this._selectPopupEl.parentNode.removeChild(this._selectPopupEl);
                this._selectPopupEl = null;
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

