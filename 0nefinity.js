(function () {
  // Alle Styles in einem einzigen Block
  function injectStyles() {
    const css = `

header.controls {
  position: fixed;
  top: 0;
  left: 70px;
  right: 70px;
  height: auto;
  z-index: 999;
  color: var(--text-color);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 2px 4px;
  box-sizing: border-box;
  padding: 3px 5px;
  background: transparent;
  transition: all 0.3s ease;
  max-height: none;
  overflow: visible;
  font-size: 11px;
  user-select: none;
  -webkit-user-select: none;
}
header.controls input {
  user-select: auto;
  -webkit-user-select: auto;
}

/* Collapsed State */
header.controls.collapsed {
  max-height: 0 !important;
  padding: 0 !important;
  overflow: hidden !important;
  opacity: 0 !important;
  pointer-events: none !important;
  border: none !important;
}

/* Desktop mit hochauflösendem Display */
@media (min-width: 769px) and (min-resolution: 2dppx) {
  header.controls {
    left: 88px;
    right: 88px;
  }
}

/* Mobile: Controls ausblenden */
@media (max-width: 768px) {
  header.controls {
    display: none !important;
  }
}

header.controls label {
  white-space: nowrap;
  margin: 1px 2px;
  font-size: 10px;
}
header.controls input[type="number"],
header.controls input[type="text"] {
  margin-left: 2px;
  padding: 1px 3px;
  font-size: 10px;
  background: var(--bg-color);
  color: var(--text-color);
  box-sizing: content-box;
  border: 1px solid var(--text-color);
  border-radius: 2px;
  width: 45px;
  -moz-appearance: textfield;
}
header.controls input[type="number"]::-webkit-inner-spin-button,
header.controls input[type="number"]::-webkit-outer-spin-button {
  opacity: 0;
  width: 12px;
  height: 14px;
  transition: opacity 0.2s;
}
header.controls input[type="number"]:hover::-webkit-inner-spin-button,
header.controls input[type="number"]:hover::-webkit-outer-spin-button {
  opacity: 1;
}
header.controls input[type="number"]::-moz-inner-spin-button,
header.controls input[type="number"]::-moz-outer-spin-button {
  opacity: 0;
  width: 12px;
  height: 14px;
  transition: opacity 0.2s;
}
header.controls input[type="number"]:hover::-moz-inner-spin-button,
header.controls input[type="number"]:hover::-moz-outer-spin-button {
  opacity: 1;
}
header.controls input#rotationSpeed {
  width: 50px;
}
header.controls input[type="checkbox"] {
  margin-left: 2px;
  box-sizing: content-box;
  width: 12px;
  height: 12px;
}
header.controls button {
  margin: 1px 2px;
  padding: 1px 6px;
  font-size: 10px;
  background: var(--bg-color);
  color: var(--text-color);
  border: 1px solid var(--text-color);
  border-radius: 2px;
  cursor: pointer;
}
.symbol-container {
  position: relative;
  margin-top: 40px;
  margin-bottom: 20px;
  overflow: visible;
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  min-height: 400px;
  transition: margin-top 0.3s ease;
  z-index: 1; /* Niedriger als Back-Button und Menü */
}

/* Mobile: etwas weniger Margin, da oben nichts mehr fixed ist */
@media (max-width: 768px) {
  .symbol-container {
    margin-top: 10px;
  }
}

/* Mobile mit hochauflösendem Display */
@media (max-width: 768px) and (min-resolution: 2dppx) {
  .symbol-container {
    margin-top: 15px;
  }
}
canvas {
  display: block;
}

/* Info Popup Stil */
.info-popup {
  position: relative;
  display: inline-block;
  margin-left: 6px;
  vertical-align: middle;
}
.info-popup .info-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  color: var(--text-color);
  font-size: 12px;
  font-weight: bold;
  cursor: help;
}
.info-popup .info-text {
  visibility: hidden;
  position: absolute;
  top: -5px;
  left: 100%;
  width: 300px;
  background: var(--bg-color);
  color: var(--text-color);
  border: 1px solid var(--text-color);
  border-radius: 4px;
  padding: 8px;
  font-size: 12px;
  z-index: 100;
  opacity: 0;
  transition: opacity 0.3s;
  pointer-events: none;
  box-shadow: 0 2px 5px rgba(0,0,0,0.2);
}
.info-popup:hover .info-text {
  visibility: visible;
  opacity: 1;
}

/* Styles für die editierbaren Fotos */
.editable-photo {
  position: absolute;
  z-index: 100;
  transform-origin: center center;
  touch-action: none;
}
.editable-photo.selected {
  outline: 2px dashed var(--text-color);
  z-index: 101;
}
.editable-photo img, .editable-photo video {
  display: block;
  pointer-events: none;
}
.editable-photo .close-btn {
  position: absolute;
  top: -10px;
  right: -10px;
  width: 22px;
  height: 22px;
  color: white;
  border: none;
  border-radius: 50%;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}
.editable-photo .control-point {
  position: absolute;
  width: 12px;
  height: 12px;
  border: 2px solid var(--text-color);
  border-radius: 50%;
  cursor: pointer;
  z-index: 5;
  transform: translate(-50%, -50%);
  visibility: hidden;
}
.editable-photo.selected .control-point {
  visibility: visible;
}
.editable-photo .rotation-handle {
  position: absolute;
  top: -30px;
  left: 50%;
  width: 14px;
  height: 14px;
  background-color: var(--text-color);
  border: 2px solid white;
  border-radius: 50%;
  cursor: pointer;
  z-index: 5;
  transform: translateX(-50%);
  visibility: hidden;
}
.editable-photo .rotation-line {
  position: absolute;
  top: -30px;
  left: 50%;
  height: 30px;
  width: 2px;
  background-color: var(--text-color);
  transform: translateX(-50%);
  transform-origin: bottom center;
  visibility: hidden;
}
.editable-photo.selected .rotation-handle,
.editable-photo.selected .rotation-line {
  visibility: visible;
}
.symbol-list-dropdown {
  display: flex;
  flex-direction: column;
  background: transparent;
  padding: 0;
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 5px;
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.3s ease, opacity 0.3s ease;
  opacity: 0;
  pointer-events: none;
  z-index: 2000;
}
.symbol-list-dropdown.open {
  max-height: 500px;
  opacity: 1;
  pointer-events: auto;
  overflow-y: auto;
}
.symbol-list-table {
  border-collapse: collapse;
  width: auto;
  position: relative;
}
.symbol-list-table thead {
  display: table-header-group;
}
.symbol-list-table th,
.symbol-list-table td {
  padding: 2px 5px;
  text-align: center;
  border-right: 1px solid var(--text-color);
}
.symbol-list-table th:last-child,
.symbol-list-table td:last-child {
  border-right: none;
}
.symbol-list-table tbody.symbol-dropdown {
  display: none;
  position: absolute;
  top: 100%;
  left: 0;
  background: var(--bg-color, #1a1a2e);
  border: 1px solid var(--text-color);
  z-index: 100;
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
  width: max-content;
}
.symbol-list-table tbody.symbol-dropdown.open {
  display: table-row-group;
}
.symbol-list-table input {
  width: 100%;
  box-sizing: border-box;
  background: rgba(128,128,128,0.1);
  border: none;
  border-bottom: 1px solid rgba(128,128,128,0.5);
  color: inherit;
}
.symbol-list-table input:focus {
  outline: none;
  border-bottom-color: var(--text-color);
}
.symbol-list-table tbody {
  display: none;
}
.symbol-list-table tbody.open {
  display: table-row-group;
}

/* Temporär: immer sichtbar zum Testen */
/* 
.symbol-list-table tbody.open {
  display: table-row-group;
}
*/
    `;
    const styleEl = document.createElement('style');
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }

  // Hauptfunktion zum Erstellen der Grafik
  function createGraphic() {
    // Erstelle die Steuerungsleiste
    const controls = document.createElement('header');
    controls.className = 'controls';
    controls.id = 'controls';

    // Wichtige Layout-Elemente vorab deklarieren
    const symbolContainer = document.createElement('div');
    symbolContainer.className = 'symbol-container';
    symbolContainer.id = 'symbolContainer';

    let logicalCanvasSize = 400;
    const photoCanvas = document.createElement('canvas');
    photoCanvas.style.display = 'none';
    controls.innerHTML = `
      <label title="Speed-Anzeige über Symbol an/aus">Speed-Anz: <input type="checkbox" id="speedDisplayCheckbox" checked></label>
      <label title="Vertikaler Abstand der Speed-Anzeige zum Symbol (px)">Pos: <input type="number" id="speedDisplayOffset" value="22" step="1"></label>
      <label>auto <input type="checkbox" id="autoSpeedCheckbox" checked></label>
      <label>Geschw: <input type="number" id="rotationSpeed" value="0" step="0.1" min="0"></label>
      <label title="Logische Frames pro Sekunde. Über Bildschirm-Hz hinaus = simuliert." style="position:relative;">fps: <input type="number" id="fps" value="60" step="1" min="0"><span id="fpsHint" style="position:absolute; top:100%; left:0; font-size:0.7em; opacity:0.6; white-space:nowrap; pointer-events:none;"></span></label>
      <label title="Ausrichtung der Zeichen am Radius">Rotation: <input type="checkbox" id="rotateCheckbox"></label>
      <div style="display:flex; gap:4px; align-items:center;">
        <label>Gr. Z(%): <input type="number" id="textSize" value="25" step="1" min="0"></label>
        <label title="Radius des Symbol-Kreises (kann auch negativ sein)">Tr.(%): <input type="number" id="triangleSize" value="30" step="1"></label>
      </div>
      <div style="display:flex; gap:4px; align-items:center;">
        <label>≡G(%): <input type="number" id="equivSize" value="23" step="1" min="0"></label>
        <label>≡L(%): <input type="number" id="equivLength" value="100" step="1" min="0"></label>
        <label title="Trennzeichen duplizieren">Dupl.: <input type="checkbox" id="duplicateIdentisch"></label>
        <label id="duplicateSpacingLabel" title="Abstand zwischen duplizierten Trennzeichen (Faktor von ≡-Größe)" style="display:none;">Abst: <input type="number" id="duplicateSpacing" value="1.2" step="0.1" min="0"></label>
      </div>

      <div id="symbolSettingsGroup" style="display:flex; flex-direction:column; align-items:stretch; position: relative; margin-left: 5px;">
        <table class="symbol-list-table">
          <thead>
            <tr>
              <th>Anz: <input type="number" id="symbolCountInput" value="3" min="0" step="1"></th>
              <th>Sync: <input type="checkbox" id="syncEquivCheckbox" checked></th>
            </tr>
          </thead>
          <tbody id="symbolInputsContainer" class="symbol-dropdown"></tbody>
        </table>
      </div>

      <button id="takePhotoButton">Foto machen</button>
      <div class="info-popup">
        <div class="info-icon">i</div>
        <div class="info-text">Diese Muster, die das Teil augenscheinlich formt, resultieren nur aus der Bewegung. Zu jedem einzelnen Zeitpunkt ist das ursprüngliche Objekt nur genau einmal in seiner ursprünglichen Form (lediglich anders gedreht) sichtbar. Ein Foto vermag das Muster deshalb nicht einzufangen und wird immer nur das ursprüngliche Objekt in einer Ruheposition zeigen.</div>
      </div>
	      <label title="Anzahl Frames für GIF-Export">GIF Frames: <input type="number" id="gifFrameCount" value="3" min="0" step="1"></label>
	      <label>∞: <input type="checkbox" id="gifInfinite"></label>
      <button id="createGifButton">GIF erstellen</button>
      <label>Debug: <input type="checkbox" id="debugHitbox"></label>
    `;
    document.body.insertBefore(controls, document.body.firstChild);

    function updateSymbolInputs(autoOpen = false) {
      const container = document.getElementById('symbolInputsContainer');
      const dropdown = document.getElementById('symbolInputsContainer');
      if (!container || !dropdown) return;
      
      const count = parseInt(document.getElementById('symbolCountInput').value) || 0;
      const sync = document.getElementById('syncEquivCheckbox').checked;

      if (autoOpen) {
          dropdown.classList.add('open');
      }

      // Aktuelle Werte sichern, um sie beim Neuerstellen wiederherzustellen
      const prevLabels = Array.from(container.querySelectorAll('.symbol-label-input')).map(i => i.value);
      const prevEquivs = Array.from(container.querySelectorAll('.equiv-symbol-input')).map(i => i.value);

      container.innerHTML = '';

      for (let i = 0; i < count; i++) {
        const row = document.createElement('tr');

        const labelInput = document.createElement('input');
        labelInput.type = 'text';
        labelInput.className = 'symbol-label-input';
        
        // Initialwerte setzen
        if (i < prevLabels.length) {
          labelInput.value = prevLabels[i];
        } else {
          const defaults = ['0', '1', '∞'];
          labelInput.value = defaults[i % 3];
        }

        const labelCell = document.createElement('td');
        labelCell.appendChild(labelInput);
        row.appendChild(labelCell);

        // Trennzeichen-Eingabe
        if (!sync || i === 0) {
           const equivInput = document.createElement('input');
           equivInput.type = 'text';
           equivInput.className = 'equiv-symbol-input';
           if (i < prevEquivs.length && prevEquivs[i]) {
             equivInput.value = prevEquivs[i];
           } else {
             equivInput.value = (prevEquivs[0] || '≡');
           }
           if (sync) {
               equivInput.id = 'globalEquivInput';
               equivInput.title = 'Globales Trennzeichen (Sync)';
           } else {
               equivInput.title = `Trennzeichen nach Symbol ${i + 1}`;
           }
           const equivCell = document.createElement('td');
           equivCell.appendChild(equivInput);
           row.appendChild(equivCell);
        } else {
           const emptyCell = document.createElement('td');
           row.appendChild(emptyCell);
        }

        container.appendChild(row);
      }
    }

    // Dropdown-Logik
    const container = document.getElementById('symbolInputsContainer');
    const table = document.querySelector('.symbol-list-table');
    const thead = document.querySelector('.symbol-list-table thead');
    
    function openDropdown() {
        container.classList.add('open');
    }
    
    function closeDropdown() {
        container.classList.remove('open');
    }
    
    function toggleDropdown() {
        container.classList.toggle('open');
    }
    
    // Auto-Close bei Klick außerhalb
    document.addEventListener('click', (e) => {
        const symbolSettingsGroup = document.getElementById('symbolSettingsGroup');
        if (symbolSettingsGroup && !symbolSettingsGroup.contains(e.target)) {
            closeDropdown();
        }
    });
    
    // Öffnen bei Klick auf den gesamten Header
    if (thead) {
        thead.addEventListener('click', (e) => {
            e.stopPropagation();
            if (e.target.closest('input, select, label')) return;
            toggleDropdown();
        });
        thead.style.cursor = 'pointer';
    }
    
    // Öffnen bei Anz-Änderung
    document.getElementById('symbolCountInput').addEventListener('input', () => {
        updateSymbolInputs(true);
        openDropdown();
    });
    
    // Öffnen bei Sync-Änderung
    document.getElementById('syncEquivCheckbox').addEventListener('change', () => {
        updateSymbolInputs(true);
        openDropdown();
    });

    // Initialer Aufruf zur Generierung der Standardfelder
    updateSymbolInputs();
    
    // Symbol-Container Konfiguration

    symbolContainer.style.position = 'relative';
    symbolContainer.style.width = '100%';
    symbolContainer.style.height = '70vh'; // Platzhalter für Content-Flow
    symbolContainer.style.overflow = 'visible';

    // Erstelle den Canvas für die Animation (Globaler Fixed-Layer)
    // DPR-aware: Pixel-Buffer = CSS-Größe × devicePixelRatio → scharfes Rendering auf Mobile/Retina
    const canvas = document.createElement('canvas');
    canvas.id = 'canvas';
    const initialDpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * initialDpr;
    canvas.height = window.innerHeight * initialDpr;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '50';
    document.body.appendChild(canvas);

    // Physisches Hitbox-Layer (Global, fängt Zoom/Pan ab)
    const interactionLayer = document.createElement('div');
    interactionLayer.id = 'interactionLayer';
    interactionLayer.style.position = 'fixed';
    interactionLayer.style.top = '0';
    interactionLayer.style.left = '0';
    interactionLayer.style.width = '100vw';
    interactionLayer.style.height = '100vh';
    interactionLayer.style.zIndex = '51'; // Über dem Canvas
    interactionLayer.style.cursor = 'grab';
    interactionLayer.style.touchAction = 'pan-y pinch-zoom'; // Browser-Scrolling erlauben
    interactionLayer.style.userSelect = 'none';
    interactionLayer.style.webkitUserSelect = 'none';
    document.body.appendChild(interactionLayer);

    let interactionLayerVisible = false;
    let interactionCenterX = 0;
    let interactionCenterY = 0;
    let interactionHitRadius = 0;

    function getResponsiveInitialOffsetY() {
      if (window.innerWidth <= 768) return 250;
      return window.innerHeight * 0.45;
    }

    function isTouchDevice() {
      return window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    }

    function getSymbolZoneHeight() {
      // Mobil: 50% der Viewport-Höhe (für mehr Text-Sichtbarkeit), Desktop: 70%
      const ratio = isTouchDevice() ? 0.50 : 0.7;
      return window.innerHeight * ratio;
    }

    function isPointInsideSymbolHitArea(clientX, clientY) {
      if (!interactionLayerVisible || interactionHitRadius <= 0) return false;
      // interactionCenterX/Y sind Dokument-Koordinaten, clientX/Y sind Viewport-Koordinaten
      const dx = clientX - (interactionCenterX - window.scrollX);
      const dy = clientY - (interactionCenterY - window.scrollY);
      return (dx * dx + dy * dy) <= (interactionHitRadius * interactionHitRadius);
    }

    function getCurrentSymbolScreenPosition() {
      return {
        rect: symbolContainer.getBoundingClientRect(),
        x: zoomState.offsetX,
        y: zoomState.offsetY
      };
    }

    // Klicks auf das Symbol umleiten an die Sidebar (nur wichtig falls wir es auf Desktop/Mobile nutzen)
    // Auf Mobile war das Menü vorher deaktiviert, aber touchstart/click fängt das Layer nun ab
    interactionLayer.addEventListener('mousedown', () => { interactionLayer.style.cursor = 'grabbing'; });
    interactionLayer.addEventListener('mouseup', () => { interactionLayer.style.cursor = 'grab'; });
    interactionLayer.addEventListener('mouseleave', () => { interactionLayer.style.cursor = 'grab'; });

    // Klick aufs Symbol togglet Sichtbarkeit der Controls-Leiste (Drag/Zoom > 5px = kein Toggle)
    let speedDisplayVisible = true; // wird via Checkbox in Controls gesteuert
    let pointerDownX = null, pointerDownY = null;
    interactionLayer.addEventListener('pointerdown', (e) => {
      pointerDownX = e.clientX;
      pointerDownY = e.clientY;
    });
    interactionLayer.addEventListener('pointerup', (e) => {
      if (pointerDownX === null) return;
      const dx = e.clientX - pointerDownX;
      const dy = e.clientY - pointerDownY;
      pointerDownX = null;
      pointerDownY = null;
      if (dx * dx + dy * dy > 25) return;
      if (isPointInsideSymbolHitArea(e.clientX, e.clientY)) {
        // !important via setProperty, damit Mobile-CSS (display: none !important) überstimmt wird
        const isHidden = window.getComputedStyle(controls).display === 'none';
        controls.style.setProperty('display', isHidden ? 'flex' : 'none', 'important');
      }
    });

    // Zoom2D für Zoom + Pan
    // Initialisierung in der Mitte des Bildschirms
    // Initialisierung in der oberen Hälfte (Header-Position)
    const initialY = getResponsiveInitialOffsetY();
    let zoomState = { scale: 1, offsetX: window.innerWidth / 2, offsetY: initialY };
    let zoomInstance = null;

    if (window.Zoom2D) {
      zoomInstance = Zoom2D.createZoom2D({
        container: interactionLayer,
        initialScale: 1,
        initialOffsetX: window.innerWidth / 2,
        initialOffsetY: initialY,
        minScale: 0.0001,
        maxScale: 1000,
        enableDamping: true,
        dampingFactor: 0.15,
        wheelSpeed: 0.15,
        shouldIgnoreDrag: (e) => {
          // Nur ziehen, wenn wir NICHT auf ein Foto oder die Controls klicken
          if (e.target !== interactionLayer) return true;
          return !isPointInsideSymbolHitArea(e.clientX, e.clientY);
        },
        shouldIgnoreTouchDrag: (e) => {
          if (e.target !== interactionLayer) return true;
          const touch = e.touches && e.touches[0];
          if (!touch) return true;

          const mouseOnSymbol = isPointInsideSymbolHitArea(touch.clientX, touch.clientY);
          // WICHTIG: mouseYDoc ist clientY + scrollY für absolute Dokumenten-Vergleich
          const mouseYDoc = touch.clientY + window.scrollY;
          const symbolZoneBottom = getSymbolZoneHeight();
          const inSymbolZone = mouseYDoc < symbolZoneBottom;

          // Nur blockieren (return true = Browser scrollt), wenn wir NICHT auf dem Symbol/in Zone sind
          return !mouseOnSymbol && !inSymbolZone;
        },
        onTransform: (state) => {
          zoomState.scale = state.scale;
          zoomState.offsetX = state.offsetX;
          zoomState.offsetY = state.offsetY;
        },
        shouldIgnoreWheel: (e) => {
          const mouseOnSymbol = isPointInsideSymbolHitArea(e.clientX, e.clientY);
          const mouseYDoc = e.clientY + window.scrollY;
          const symbolZoneBottom = getSymbolZoneHeight();
          const inSymbolZone = mouseYDoc < symbolZoneBottom;
          return !mouseOnSymbol && !inSymbolZone;
        },
        getScrollX: () => window.scrollX,
        getScrollY: () => window.scrollY
      });
    }

    // === Kontextsensitiver Zoom ===
    // Maus auf Symbol → Standard Zoom-to-Cursor
    // Maus NICHT auf Symbol → Symbol bewegt sich zur Maus hin (Anziehungseffekt)
    const WHEEL_SPEED = 0.15;
    const WHEEL_THROTTLE_MS = 80;
    const WHEEL_DELTA_THRESHOLD = 10;
    const ATTRACTION_STRENGTH = 0.08; // Pro Scroll-Tick: Anteil des Abstands, den das Symbol zur Maus wandert
    let lastCustomWheelTime = 0;

    interactionLayer.addEventListener('wheel', function (e) {
      if (!zoomInstance) return;

      const mouseOnSymbol = isPointInsideSymbolHitArea(e.clientX, e.clientY);
      const mouseYDoc = e.clientY + window.scrollY;
      const symbolZoneBottom = getSymbolZoneHeight();
      const inSymbolZone = mouseYDoc < symbolZoneBottom;

      if (!mouseOnSymbol && !inSymbolZone) {
        // Maus ist weder auf dem Symbol noch in der Symbol-Zone → normal scrollen
        // Wir lassen das Event einfach durchgehen (NICHT preventDefault, NICHT stopPropagation)
        return;
      }

      // AB HIER: Symbol-Zoom (Scrollen verhindern)
      e.preventDefault();
      e.stopImmediatePropagation(); // Blockiert Zoom2Ds EIGENEN Handler (damit wir die Kontrolle haben)

      if (Math.abs(e.deltaY) < WHEEL_DELTA_THRESHOLD) return;

      const now = performance.now();
      if (now - lastCustomWheelTime < WHEEL_THROTTLE_MS) return;
      lastCustomWheelTime = now;

      const direction = e.deltaY > 0 ? -1 : 1;
      const factor = 1 + direction * WHEEL_SPEED;
      if (factor <= 0) return;

      const zoomingIn = direction > 0;

      const currentScale = zoomState.scale;
      const currentOffsetX = zoomState.offsetX;
      const currentOffsetY = zoomState.offsetY;

      const newScale = Math.max(0.0001, Math.min(1000, currentScale * factor));
      if (newScale === currentScale) return;

      let newOffsetX, newOffsetY;

      // Wir arbeiten konsequent in Dokument-Koordinaten
      const mouseXDoc = e.clientX + window.scrollX;
      // mouseYDoc ist bereits oben in diesem Scope deklariert

      if (mouseOnSymbol) {
        // Maus AUF dem Symbol: Zoom-to-Cursor (je näher dran, desto stärker)
        const visualRadius = logicalCanvasSize * 0.3 * currentScale;
        const viewportMin = Math.min(window.innerWidth, window.innerHeight);
        const blend = Math.min(1, Math.max(0, (visualRadius * 2 / viewportMin - 0.5) * 2));

        const worldX = (mouseXDoc - currentOffsetX) / currentScale;
        const worldY = (mouseYDoc - currentOffsetY) / currentScale;
        const cursorOffsetX = mouseXDoc - worldX * newScale;
        const cursorOffsetY = mouseYDoc - worldY * newScale;

        const attractOffsetX = currentOffsetX + (mouseXDoc - currentOffsetX) * ATTRACTION_STRENGTH;
        const attractOffsetY = currentOffsetY + (mouseYDoc - currentOffsetY) * ATTRACTION_STRENGTH;

        newOffsetX = attractOffsetX + (cursorOffsetX - attractOffsetX) * blend;
        newOffsetY = attractOffsetY + (cursorOffsetY - attractOffsetY) * blend;
      } else {
        // Maus AUSSERHALB des Symbols: Immer Anziehung (Symbol wandert zur Maus)
        newOffsetX = currentOffsetX + (mouseXDoc - currentOffsetX) * ATTRACTION_STRENGTH;
        newOffsetY = currentOffsetY + (mouseYDoc - currentOffsetY) * ATTRACTION_STRENGTH;
      }

      zoomInstance.setView({
        scale: newScale,
        offsetX: newOffsetX,
        offsetY: newOffsetY
      });
    }, { capture: true, passive: false });


    if (!symbolContainer.contains(canvas)) symbolContainer.appendChild(canvas);
    if (!symbolContainer.contains(interactionLayer)) symbolContainer.appendChild(interactionLayer);

    if (controls.nextSibling) {
      document.body.insertBefore(symbolContainer, controls.nextSibling);
    } else {
      document.body.appendChild(symbolContainer);
    }

    document.body.appendChild(photoCanvas);

    // Grafikeditor-Variablen und -Funktionen
    let selectedPhoto = null;
    let photoCounter = 0;

    // Handler, der die Auswahl zurücksetzt, wenn außerhalb geklickt wird
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.editable-photo') && !e.target.closest('.control-point') && !e.target.closest('.rotation-handle')) {
        if (selectedPhoto) {
          selectedPhoto.classList.remove('selected');
          selectedPhoto = null;
        }
      }
    });

    // Erstelle ein editierbares Foto-Element
    function createEditablePhoto(mediaUrl, originalWidth, originalHeight, isGif = false) {
      const photo = document.createElement('div');
      photo.className = 'editable-photo';
      photo.id = 'editable-photo-' + photoCounter++;

      // Zufällige Position im sichtbaren Bereich des Fensters
      const randomX = Math.random() * (window.innerWidth - Math.min(originalWidth, window.innerWidth * 0.3));
      const randomY = Math.max(window.innerHeight * 0.1,
        Math.random() * (window.innerHeight - Math.min(originalHeight, window.innerHeight * 0.3)));

      photo.style.left = randomX + 'px';
      photo.style.top = randomY + 'px';
      photo.style.transform = 'rotate(0deg)'; // Keine Skalierung, um Originalgröße zu behalten
      photo.dataset.rotation = '0';

      // Erstelle entweder ein Bild oder ein Video-Element
      let mediaElement;
      if (isGif) {
        mediaElement = document.createElement('video');
        mediaElement.src = mediaUrl;
        mediaElement.autoplay = true;
        mediaElement.loop = true;
        mediaElement.muted = true;
        mediaElement.playbackRate = 1.0;
        mediaElement.setAttribute('playsinline', '');
        mediaElement.preload = 'auto';
        mediaElement.addEventListener('loadeddata', () => { try { mediaElement.play(); } catch (e) { } });
        // Merke die Blob-URL für späteres Aufräumen
        photo.dataset.objectUrl = mediaUrl;
      } else {
        mediaElement = document.createElement('img');
        mediaElement.src = mediaUrl;
      }

      mediaElement.onload = function () {
        addControlPoints(photo, originalWidth, originalHeight);
      };

      if (isGif) {
        mediaElement.onloadedmetadata = function () {
          addControlPoints(photo, originalWidth, originalHeight);
        };
      }

      const closeBtn = document.createElement('button');
      closeBtn.className = 'close-btn';
      closeBtn.innerHTML = '×';
      closeBtn.title = 'Entfernen';
      closeBtn.addEventListener('click', () => {
        const vid = photo.querySelector('video');
        if (vid) { try { vid.pause(); } catch (e) { } }
        const url = photo.dataset.objectUrl;
        if (url) {
          try { URL.revokeObjectURL(url); } catch (e) { }
          delete photo.dataset.objectUrl;
        }
        document.body.removeChild(photo);
        if (selectedPhoto === photo) {
          selectedPhoto = null;
        }
      });

      // Rotations-Handle und Linie hinzufügen
      const rotationLine = document.createElement('div');
      rotationLine.className = 'rotation-line';

      const rotationHandle = document.createElement('div');
      rotationHandle.className = 'rotation-handle';
      rotationHandle.title = 'Drehen';

      photo.appendChild(mediaElement);
      photo.appendChild(closeBtn);
      photo.appendChild(rotationLine);
      photo.appendChild(rotationHandle);
      document.body.appendChild(photo);

      // Pointer-Handler für die Auswahl
      photo.addEventListener('pointerdown', function (e) {
        if (e.target === photo || e.target === mediaElement) {
          // Vorherige Auswahl entfernen
          if (selectedPhoto && selectedPhoto !== photo) {
            selectedPhoto.classList.remove('selected');
          }
          photo.classList.add('selected');
          selectedPhoto = photo;

          // Starte das Verschieben
          startDragging(e, photo);
        }
      });

      // Rotations-Handler
      rotationHandle.addEventListener('pointerdown', function (e) {
        e.stopPropagation();
        startRotation(e, photo);
      });

      return photo;
    }

    // Kontrollpunkte für die Größenänderung hinzufügen
    function addControlPoints(photo, width, height) {
      const positions = [
        { x: 0, y: 0, cursor: 'nwse-resize', position: 'top-left' },
        { x: 50, y: 0, cursor: 'ns-resize', position: 'top-center' },
        { x: 100, y: 0, cursor: 'nesw-resize', position: 'top-right' },
        { x: 0, y: 50, cursor: 'ew-resize', position: 'middle-left' },
        { x: 100, y: 50, cursor: 'ew-resize', position: 'middle-right' },
        { x: 0, y: 100, cursor: 'nesw-resize', position: 'bottom-left' },
        { x: 50, y: 100, cursor: 'ns-resize', position: 'bottom-center' },
        { x: 100, y: 100, cursor: 'nwse-resize', position: 'bottom-right' }
      ];

      positions.forEach(pos => {
        const controlPoint = document.createElement('div');
        controlPoint.className = 'control-point';
        controlPoint.style.left = pos.x + '%';
        controlPoint.style.top = pos.y + '%';
        controlPoint.style.cursor = pos.cursor;
        controlPoint.dataset.position = pos.position;

        controlPoint.addEventListener('pointerdown', function (e) {
          e.stopPropagation();
          startResizing(e, photo, pos.position);
        });

        photo.appendChild(controlPoint);
      });
    }

    // Verschieben eines Fotos starten
    function startDragging(e, element) {
      element.setPointerCapture(e.pointerId);

      let startX = e.clientX;
      let startY = e.clientY;
      let startLeft = parseInt(element.style.left) || 0;
      let startTop = parseInt(element.style.top) || 0;

      function moveElement(e) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        element.style.left = (startLeft + dx) + 'px';
        element.style.top = (startTop + dy) + 'px';
      }

      function stopDragging(e) {
        element.releasePointerCapture(e.pointerId);
        element.removeEventListener('pointermove', moveElement);
        element.removeEventListener('pointerup', stopDragging);
        element.removeEventListener('pointercancel', stopDragging);
      }

      element.addEventListener('pointermove', moveElement);
      element.addEventListener('pointerup', stopDragging);
      element.addEventListener('pointercancel', stopDragging);
    }

    // Größenänderung eines Fotos starten
    function startResizing(e, element, position) {
      element.setPointerCapture(e.pointerId);

      const mediaElement = element.querySelector('img') || element.querySelector('video');
      const rect = element.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      const startWidth = rect.width;
      const startHeight = rect.height;
      const startLeft = parseInt(element.style.left) || 0;
      const startTop = parseInt(element.style.top) || 0;
      const aspectRatio = startWidth / startHeight;

      function resizeElement(e) {
        let newWidth, newHeight, newLeft, newTop;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        switch (position) {
          case 'top-left':
            newWidth = startWidth - dx;
            newHeight = newWidth / aspectRatio;
            newLeft = startLeft + dx;
            newTop = startTop + (startHeight - newHeight);
            break;
          case 'top-center':
            newHeight = startHeight - dy;
            newWidth = newHeight * aspectRatio;
            newLeft = startLeft + (startWidth - newWidth) / 2;
            newTop = startTop + dy;
            break;
          case 'top-right':
            newWidth = startWidth + dx;
            newHeight = newWidth / aspectRatio;
            newLeft = startLeft;
            newTop = startTop + (startHeight - newHeight);
            break;
          case 'middle-left':
            newWidth = startWidth - dx;
            newHeight = newWidth / aspectRatio;
            newLeft = startLeft + dx;
            newTop = startTop + (startHeight - newHeight) / 2;
            break;
          case 'middle-right':
            newWidth = startWidth + dx;
            newHeight = newWidth / aspectRatio;
            newLeft = startLeft;
            newTop = startTop + (startHeight - newHeight) / 2;
            break;
          case 'bottom-left':
            newWidth = startWidth - dx;
            newHeight = newWidth / aspectRatio;
            newLeft = startLeft + dx;
            newTop = startTop;
            break;
          case 'bottom-center':
            newHeight = startHeight + dy;
            newWidth = newHeight * aspectRatio;
            newLeft = startLeft + (startWidth - newWidth) / 2;
            newTop = startTop;
            break;
          case 'bottom-right':
            newWidth = startWidth + dx;
            newHeight = newWidth / aspectRatio;
            newLeft = startLeft;
            newTop = startTop;
            break;
        }

        if (newWidth > 30 && newHeight > 30) {
          element.style.left = newLeft + 'px';
          element.style.top = newTop + 'px';
          mediaElement.style.width = newWidth + 'px';
          mediaElement.style.height = newHeight + 'px';
        }
      }

      function stopResizing(e) {
        element.releasePointerCapture(e.pointerId);
        element.removeEventListener('pointermove', resizeElement);
        element.removeEventListener('pointerup', stopResizing);
        element.removeEventListener('pointercancel', stopResizing);
      }

      element.addEventListener('pointermove', resizeElement);
      element.addEventListener('pointerup', stopResizing);
      element.addEventListener('pointercancel', stopResizing);
    }

    // Rotation eines Fotos starten
    function startRotation(e, element) {
      element.setPointerCapture(e.pointerId);

      const rect = element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
      const currentRotation = parseInt(element.dataset.rotation) || 0;

      function rotateElement(e) {
        const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
        const newRotation = currentRotation + (angle - startAngle);
        element.dataset.rotation = newRotation;
        element.style.transform = `rotate(${newRotation}deg)`;
      }

      function stopRotation(e) {
        element.releasePointerCapture(e.pointerId);
        element.removeEventListener('pointermove', rotateElement);
        element.removeEventListener('pointerup', stopRotation);
        element.removeEventListener('pointercancel', stopRotation);
      }

      element.addEventListener('pointermove', rotateElement);
      element.addEventListener('pointerup', stopRotation);
      element.addEventListener('pointercancel', stopRotation);
    }

    // Implementierung der Foto-Funktion
    document.getElementById('takePhotoButton').addEventListener('click', () => {
      const photoCtx = photoCanvas.getContext('2d');

      // Erstelle ein Foto mit transparentem Hintergrund
      photoCtx.clearRect(0, 0, photoCanvas.width, photoCanvas.height);

      // Zeichne die aktuelle Animation auf das photoCanvas
      drawTriangleOnCanvas(photoCtx, photoCanvas, true);

      // Schneide das Bild zu, um unnötige transparente Flächen zu entfernen
      const { dataURL, width, height } = trimTransparentEdges(photoCanvas);

      // Erstelle ein haftendes Foto-Element mit dem zugeschnittenen Bild
      createEditablePhoto(dataURL, width, height);
    });

    // GIF-Erstellungsfunktion
    // GIF-/Video-Erstellung mit EXAKTER Frame-Anzahl (0, 1, ∞ unterstützt)
    document.getElementById('createGifButton').addEventListener('click', async (ev) => {
      const btn = ev.currentTarget;
      const framesInput = document.getElementById('gifFrameCount');
      const raw = framesInput && String(framesInput.value).trim();
      const infinite = document.getElementById('gifInfinite')?.checked || raw === '∞' || raw.toLowerCase() === 'infinity';
      let frameCount = infinite ? Infinity : Math.max(0, parseInt(raw, 10) || 0);

      const width = canvas.width;
      const height = canvas.height;

      // 0 Frames: unsichtbares, verschiebbares Objekt erzeugen
      if (frameCount === 0) {
        const phCanvas = document.createElement('canvas');
        phCanvas.width = width;
        phCanvas.height = height;
        const placeholderUrl = phCanvas.toDataURL('image/png');
        createEditablePhoto(placeholderUrl, width, height, false);
        return;
      }

      if (typeof MediaRecorder === 'undefined') {
        alert('MediaRecorder wird von diesem Browser nicht unterstützt.');
        return;
      }

      // Aufnahme direkt vom sichtbaren Canvas (exaktes Live-Bild)
      const stream = canvas.captureStream(); // ohne Vorgabe: Frames immer wenn Canvas aktualisiert wird


      // MIME-Type wählen mit Fallback
      let mimeType = 'video/webm;codecs=vp9';
      if (!MediaRecorder.isTypeSupported || !MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm;codecs=vp8';
        if (!MediaRecorder.isTypeSupported || !MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'video/webm';
        }
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };

      let resolveStopped;
      const stopped = new Promise((resolve) => { resolveStopped = resolve; });
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        resolveStopped(blob);
      };

      // Button toggelt Aufnahme bei ∞
      let stopRequested = false;
      function handleToggle() {
        stopRequested = true;
        btn.textContent = 'GIF erstellen';
        btn.removeEventListener('click', handleToggle);
      }

      if (frameCount === Infinity) {
        btn.textContent = 'Stop';
        btn.addEventListener('click', handleToggle);
      }

      // Aufnahme-Kontext registrieren, damit animate() exakte Frame-Zählung hat
      currentRecording = {
        recorder,
        infinite: frameCount === Infinity,
        targetFrameCount: frameCount === Infinity ? Number.POSITIVE_INFINITY : frameCount,
        framesCaptured: 0,
        stopRequested: false,
        cleanup: () => { currentRecording = null; }
      };


      // Start mit kleinem timeslice generiert regelmäßige Blobs
      recorder.start(100);

      // rAF-Schleife nur für den ∞-Stop-Button
      function step() {
        if (stopRequested) {
          try { recorder.stop(); } catch (e) { }
          return;
        }
        requestAnimationFrame(step);
      }
      if (frameCount === Infinity) requestAnimationFrame(step);

      const videoBlob = await stopped;

      // Button zurücksetzen (falls ∞)
      btn.textContent = 'GIF erstellen';
      btn.removeEventListener('click', handleToggle);

      const videoUrl = URL.createObjectURL(videoBlob);
      createEditablePhoto(videoUrl, width, height, true);
    });


    // Funktion zum Zeichnen eines einzelnen Frames mit einem bestimmten Winkel
    function drawFrameWithAngle(context, targetCanvas, frameAngle, forExport = false) {
      const style = getComputedStyle(document.documentElement);
      const textColor = style.getPropertyValue('--text-color').trim() || "#000";

      // Lösche den Canvas
      if (!forExport) {
        context.save();
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
        context.restore();
      } else {
        context.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
      }

      context.save();
      if (!forExport && zoomState && targetCanvas === canvas) {
        // Zoom + Pan: Nutze Dokument-Koordinaten minus Fenster-Scroll
        context.translate(zoomState.offsetX - window.scrollX, zoomState.offsetY - window.scrollY);
        context.scale(zoomState.scale, zoomState.scale);
      } else {
        // Export (Foto/GIF): Immer zentriert, kein Zoom
        context.translate(targetCanvas.width / 2, targetCanvas.height / 2);
      }
      const minDim = (forExport || targetCanvas === photoCanvas)
        ? Math.min(targetCanvas.width, targetCanvas.height)
        : logicalCanvasSize;

      // Parameter abrufen, bei 0 nicht zeichnen
      const textSizePercentage = parseFloat(document.getElementById('textSize').value) || 0;
      const triangleSize = parseFloat(document.getElementById('triangleSize').value) || 0;
      const equivSize = parseFloat(document.getElementById('equivSize').value) || 0;
      const equivLength = parseFloat(document.getElementById('equivLength').value) || 0;

      // Größen berechnen
      const labelFontSize = minDim * (textSizePercentage / 100);
      const equivFontSize = minDim * (equivSize / 100);
      const radius = minDim * (triangleSize / 100);

      const symbolCount = parseInt(document.getElementById('symbolCountInput').value) || 0;
      if (symbolCount <= 0) {
        context.restore();
        return;
      }
      // Tr.(%)=0 ist erlaubt (Symbole überlagern in Mitte). Negative Werte → Symbole auf Gegenseite.

      const vertices = [];
      const angleStep = 360 / symbolCount;
      for (let i = 0; i < symbolCount; i++) {
        const thetaDeg = frameAngle + i * angleStep;
        const thetaRad = (thetaDeg * Math.PI) / 180;
        const x = radius * Math.cos(thetaRad);
        const y = radius * Math.sin(thetaRad);
        vertices.push({ x, y, thetaRad });
      }

      const labelInputs = document.querySelectorAll('.symbol-label-input');
      const labels = Array.from(labelInputs).map(input => input.value || "");

      const syncEquiv = document.getElementById('syncEquivCheckbox').checked;
      const equivInputs = document.querySelectorAll('.equiv-symbol-input');
      const globalEquivInput = document.getElementById('globalEquivInput');
      const equivSymbols = syncEquiv 
        ? new Array(symbolCount).fill(globalEquivInput ? globalEquivInput.value : "≡")
        : Array.from(equivInputs).map(input => input.value || "");

      const tangentialMode = document.getElementById('rotateCheckbox').checked;

      // Zeichne Symbole an den Ecken nur wenn textSize > 0
      if (textSizePercentage > 0) {
        context.font = `bold ${labelFontSize}px Verdana`;
        context.fillStyle = textColor;
        context.textAlign = "center";
        context.textBaseline = "middle";

        for (let i = 0; i < symbolCount; i++) {
          const { x, y, thetaRad } = vertices[i];
          context.save();
          context.translate(x, y);
          if (tangentialMode) {
            context.rotate(thetaRad + Math.PI / 2);
          }
          context.fillText(labels[i] || "", 0, 0);
          context.restore();
        }
      }

      // Geschwindigkeits-Anzeige über Symbol: roh ≡ visuell-äquivalent (mod 360)
      // 720°/frame ≡ 0°/frame (volle Umdrehung pro Frame = visuell still)
      // 370°/frame ≡ 10°/frame (sieht aus wie 10°/frame Rotation)
      // Nur für Live-Animation, nicht im Foto/GIF-Export
      if (!forExport && targetCanvas === canvas && speedDisplayVisible) {
        const speedFontSize = Math.max(minDim * 0.025, labelFontSize * 0.12);
        const yPos = -radius - speedFontSize * 4 - speedDisplayOffset;
        const speedRawInt = Math.round(rotationSpeed);

        context.save();
        context.font = `${speedFontSize}px monospace`;
        context.fillStyle = textColor;
        context.textBaseline = "alphabetic";

        const charW = context.measureText("0").width;
        const widthSlashFrame = context.measureText("°/frame").width;
        // gap = 1.5*charW, sodass das erste ≡ exakt das gleiche visuelle Spacing hat
        // wie das zweite (das innerhalb von wrapped " ≡ " mit echten Space-Chars steht).
        const gap = 1.5 * charW;

        // "speed: roh°/frame" — rechts-anchored bei x=-gap, wächst nach links
        const speedRawText = String(speedRawInt).padStart(3, ' ');
        context.textAlign = "right";
        context.fillText(`speed: ${speedRawText}°/frame`, -gap, yPos);

        // Center und Left-Edge der sichtbaren raw-Ziffern (ohne Leading-Spaces)
        const trimmedRaw = speedRawText.trimStart();
        const widthTrimmedRaw = context.measureText(trimmedRaw).width;
        const rawNumEndX = -gap - widthSlashFrame;
        const rawNumStartX = rawNumEndX - widthTrimmedRaw;
        const rawNumCenterX = rawNumEndX - widthTrimmedRaw / 2;

        // Wrapped-Sektion ab roh >= 360°
        let wrapped360CenterX = null;
        let final0CenterX = null;

        if (Math.abs(speedRawInt) >= 360) {
          let wrappedText;
          if (speedRawInt === 360) {
            wrappedText = `  0°/frame`;
            final0CenterX = gap + context.measureText("  ").width + charW / 2;
          } else if (speedRawInt > 0 && speedRawInt % 360 === 0) {
            wrappedText = `360°/frame ≡ 0°/frame`;
            wrapped360CenterX = gap + context.measureText("360").width / 2;
            final0CenterX = gap + context.measureText("360°/frame ≡ ").width + charW / 2;
          } else {
            let speedWrappedInt = Math.round(((rotationSpeed % 360) + 360) % 360);
            const wrappedPadded = String(speedWrappedInt).padStart(3, ' ');
            wrappedText = `${wrappedPadded}°/frame`;
            if (speedWrappedInt === 360) {
              wrappedText += ` ≡ 0°/frame`;
              wrapped360CenterX = gap + context.measureText("360").width / 2;
              final0CenterX = gap + context.measureText("360°/frame ≡ ").width + charW / 2;
            }
          }

          context.textAlign = "center";
          context.fillText("≡", 0, yPos);

          context.textAlign = "left";
          context.fillText(wrappedText, gap, yPos);
        }

        // Annotations: "(N turns/frame)" unter jeweiligem Speed-Wert.
        // Char 1 (= Ziffer N oder erste Ziffer von N) zentriert unter Center des Speed-Wertes.
        function renderAnno(text, centerX) {
          const annoFontSize = speedFontSize * 0.7;
          const annoCharW = 0.7 * charW;
          const annoLeftX = centerX - 1.5 * annoCharW;
          context.font = `${annoFontSize}px monospace`;
          context.textAlign = "left";
          context.fillText(text, annoLeftX, yPos + speedFontSize * 1.0);
        }

        // Raw NNN: nur bei Vielfachem von 360 (>0).
        // Center der N-Ziffern exakt unter Center der raw-Ziffern.
        if (speedRawInt > 0 && speedRawInt % 360 === 0) {
          const N = speedRawInt / 360;
          const word = N === 1 ? 'turn' : 'turns';
          const text = `(${N} ${word}/frame)`;
          const digitCount = String(N).length;
          const annoFontSize = speedFontSize * 0.7;
          const annoCharW = 0.7 * charW;
          // Center of N block = startX + (1 + digitCount/2) * annoCharW
          // ("(" at index 0, N digits at indexes 1..digitCount)
          const startX = rawNumCenterX - (1 + digitCount / 2) * annoCharW;
          context.font = `${annoFontSize}px monospace`;
          context.textAlign = "left";
          context.fillText(text, startX, yPos + speedFontSize * 1.0);
        }
        // Wrapped "360": (1 turn/frame)
        if (wrapped360CenterX !== null) {
          renderAnno("(1 turn/frame)", wrapped360CenterX);
        }
        // Final "0": (0 turns/frame)
        if (final0CenterX !== null) {
          renderAnno("(0 turns/frame)", final0CenterX);
        }

        context.restore();
      }

      // Zeichne Äquivalenzsymbole an den Kanten nur wenn equivSize > 0
      if (equivSize > 0 && equivLength > 0 && symbolCount > 1) {
        for (let i = 0; i < symbolCount; i++) {
          const p1 = vertices[i];
          const p2 = vertices[(i + 1) % symbolCount];
          const midX = (p1.x + p2.x) / 2;
          const midY = (p1.y + p2.y) / 2;
          const sideAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

          context.save();
          context.translate(midX, midY);
          context.rotate(sideAngle);
          context.font = `bold ${equivFontSize}px Verdana`;
          context.fillStyle = textColor;
          context.textAlign = "center";
          context.textBaseline = "middle";

          const duplicateEnabled = document.getElementById('duplicateIdentisch').checked;
          const currentEquiv = equivSymbols[i] || "";
          
          if (duplicateEnabled) {
            const originalText = currentEquiv;
            const duplicateSpacingFactor = parseFloat(document.getElementById('duplicateSpacing').value);
            const spacingFactor = isNaN(duplicateSpacingFactor) ? 1.2 : duplicateSpacingFactor;
            const desiredSpacing = equivFontSize * spacingFactor;
            const offset = desiredSpacing / (equivLength / 100);
            context.scale(1, equivLength / 100);
            context.fillText(originalText, 0, -offset);
            context.fillText(originalText, 0, 0);
            context.fillText(originalText, 0, offset);
          } else {
            context.scale(1, equivLength / 100);
            context.fillText(currentEquiv, 0, 0);
          }
          context.restore();
        }
      }

      context.restore();
    }

    // Funktion zum Zuschneiden transparenter Ränder eines Canvas
    function trimTransparentEdges(canvas) {
      const ctx = canvas.getContext('2d');
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = pixels.data;
      let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;

      // Finde den tatsächlichen Inhaltsbereich (ohne transparenten Rand)
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const alpha = data[((y * canvas.width + x) * 4) + 3];
          if (alpha > 0) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
      }

      // Füge einen kleinen Rand hinzu (proportional zur Größe), um etwas Platz zu haben
      const padding = Math.max(2, Math.floor(canvas.width * 0.01)); // 1% der Größe, mindestens 2px
      minX = Math.max(0, minX - padding);
      minY = Math.max(0, minY - padding);
      maxX = Math.min(canvas.width, maxX + padding);
      maxY = Math.min(canvas.height, maxY + padding);

      // Berechne die neuen Dimensionen
      const width = maxX - minX;
      const height = maxY - minY;

      // Erstelle ein neues Canvas mit den zugeschnittenen Dimensionen
      const trimmedCanvas = document.createElement('canvas');
      trimmedCanvas.width = width;
      trimmedCanvas.height = height;

      // Kopiere den relevanten Bereich
      const trimmedCtx = trimmedCanvas.getContext('2d');
      trimmedCtx.drawImage(canvas, minX, minY, width, height, 0, 0, width, height);

      return {
        dataURL: trimmedCanvas.toDataURL('image/png'),
        width: width,
        height: height
      };
    }

    // === ZENTRALE KONFIGURATION ===
    const AUTO_SPEED_CONFIG = {
      // Startphase - läuft einmal am Anfang
      START_PHASE: {
        startSpeed: 30,
        rampTo: 0,
        rampDuration: 0.8,
        holdDuration: 1.5
      },
      // Hauptsequenz - läuft nach der Startphase in Schleife
      SPEED_STEPS: [
        { increment: 120, rampDuration: 0.8, holdDuration: 1.5 },
        { increment: 240, rampDuration: 0.8, holdDuration: 1.5 },
        { increment: 180, rampDuration: 0.8, holdDuration: 1.5 },
        { increment: 180, rampDuration: 0.8, holdDuration: 1.5 }
      ]
    };

    // Animationsparameter initialisieren
    let textSizePercentage = parseFloat(document.getElementById('textSize').value) || 25;
    let triangleSize = parseFloat(document.getElementById('triangleSize').value) || 30;
    let equivSize = parseFloat(document.getElementById('equivSize').value) || 25;
    let equivLength = parseFloat(document.getElementById('equivLength').value) || 100;
    let manualSpeed = parseFloat(document.getElementById('rotationSpeed').value) || 0;
    let rotationSpeed = manualSpeed;
    let autoSpeedEnabled = document.getElementById('autoSpeedCheckbox').checked;
    let autoOffset = 0;

    // Time-Warp Modell: fps verändert nicht die Bewegung pro Frame, sondern wie schnell
    // der Cycle progressiert. speed-Wert pro Frame ist konstant, fps streckt/staucht Cycle-Zeit.
    // → Gleicher speed-Wert ergibt immer gleiches Muster. Alias-Punkt bei speed=360 immer.
    let fps = parseFloat(document.getElementById('fps').value) || 60;
    let detectedHz = 60;
    let userChangedFps = false;
    let dtSamples = [];
    let detectionDone = false;



    // Event-Listener für die Steuerelemente
    document.getElementById('textSize').addEventListener('input', () => {
      textSizePercentage = parseFloat(document.getElementById('textSize').value) || 0;
      resizeCanvasToFitContent();
    });
    document.getElementById('triangleSize').addEventListener('input', () => {
      triangleSize = parseFloat(document.getElementById('triangleSize').value) || 0;
      resizeCanvasToFitContent();
    });
    document.getElementById('equivSize').addEventListener('input', () => {
      equivSize = parseFloat(document.getElementById('equivSize').value) || 0;
      resizeCanvasToFitContent();
    });
    document.getElementById('equivLength').addEventListener('input', () => {
      equivLength = parseFloat(document.getElementById('equivLength').value) || 0;
      resizeCanvasToFitContent();
    });

    function updateFpsHint() {
      const hint = document.getElementById('fpsHint');
      if (!hint) return;
      hint.textContent = (detectionDone && fps > detectedHz) ? '(simuliert)' : '';
    }

    document.getElementById('speedDisplayCheckbox').addEventListener('change', e => {
      speedDisplayVisible = e.target.checked;
    });

    // Abst-Input für Dupl nur anzeigen wenn Dupl aktiv
    function updateDuplicateSpacingVisibility() {
      const enabled = document.getElementById('duplicateIdentisch').checked;
      document.getElementById('duplicateSpacingLabel').style.display = enabled ? '' : 'none';
    }
    document.getElementById('duplicateIdentisch').addEventListener('change', updateDuplicateSpacingVisibility);
    updateDuplicateSpacingVisibility();

    // Speed-Display Vertikal-Offset, persistiert via localStorage
    const SPEED_OFFSET_KEY = '0nefinity-symbol-speedOffset';
    const storedOffset = localStorage.getItem(SPEED_OFFSET_KEY);
    if (storedOffset !== null && !isNaN(parseFloat(storedOffset))) {
      document.getElementById('speedDisplayOffset').value = storedOffset;
    }
    let speedDisplayOffset = parseFloat(document.getElementById('speedDisplayOffset').value) || 0;
    document.getElementById('speedDisplayOffset').addEventListener('input', () => {
      speedDisplayOffset = parseFloat(document.getElementById('speedDisplayOffset').value) || 0;
      try { localStorage.setItem(SPEED_OFFSET_KEY, String(speedDisplayOffset)); } catch (e) {}
    });

    document.getElementById('fps').addEventListener('input', () => {
      fps = parseFloat(document.getElementById('fps').value) || 0;
      userChangedFps = true;
      // Fixe Referenz 60: factor = fps / 60. So koppelt jede fps-Änderung (manuell ODER auto-detect)
      // direkt an die Cycle-Geschwindigkeit. Ohne fixe Referenz würde auto-detect 60→89
      // factor=1 lassen → keine sichtbare Animation-Änderung trotz fps-Display-Sprung.
      const newFactor = fps / 60;
      updateSnapshotFactor(newFactor);
      updateFpsHint();
    });

    document.getElementById('rotationSpeed').addEventListener('input', () => {
      manualSpeed = parseFloat(document.getElementById('rotationSpeed').value) || 0;
      if (!autoSpeedEnabled) {
        rotationSpeed = manualSpeed;
      } else {
        const currentCycleSpeed = computeAutoSpeed(getWarpedElapsed());
        autoOffset = manualSpeed - currentCycleSpeed;
        rotationSpeed = currentCycleSpeed + autoOffset;
      }
    });

    document.getElementById('autoSpeedCheckbox').addEventListener('change', e => {
      autoSpeedEnabled = e.target.checked;
      if (autoSpeedEnabled) {
        manualSpeed = parseFloat(document.getElementById('rotationSpeed').value) || 0;
        autoOffset = 0;
        resetSnapshot();
        rotationSpeed = AUTO_SPEED_CONFIG.START_PHASE.startSpeed + autoOffset;
        document.getElementById('rotationSpeed').value = rotationSpeed.toFixed(1);
      }
    });

    // Time-Warp Snapshot: { realTimestamp ms, warpedSeconds, factor }
    // warped elapsed = warpedSeconds + (Date.now() - realTimestamp)/1000 * factor
    // factor = fps / 60 (fixe Referenz). Bei fps-Wechsel: snapshot updated für Continuity (kein Sprung).
    // Persistiert in localStorage → übersteht Mobile-Browser Tab-Kill, kontinuiert echte Zeit.
    // User-Reload (F5/Ctrl+R) → Reset. Browser-Auto-Restore → continue.
    const SNAPSHOT_KEY = '0nefinity-symbol-snapshot';
    const navEntry = performance.getEntriesByType('navigation')[0];
    const isUserReload = navEntry && navEntry.type === 'reload';
    let snapshot;

    function loadSnapshot() {
      try {
        const raw = localStorage.getItem(SNAPSHOT_KEY);
        if (!raw) return null;
        const p = JSON.parse(raw);
        if (typeof p.realTimestamp === 'number' && typeof p.warpedSeconds === 'number' && typeof p.factor === 'number') {
          return p;
        }
      } catch (e) {}
      return null;
    }

    function saveSnapshot() {
      try { localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot)); } catch (e) {}
    }

    function getWarpedElapsed() {
      return snapshot.warpedSeconds + (Date.now() - snapshot.realTimestamp) / 1000 * snapshot.factor;
    }

    function updateSnapshotFactor(newFactor) {
      // Continuity: snapshote den aktuellen warped-Stand mit ALTEM Faktor, dann switch zu neu.
      snapshot.warpedSeconds = getWarpedElapsed();
      snapshot.realTimestamp = Date.now();
      snapshot.factor = newFactor;
      saveSnapshot();
    }

    function resetSnapshot() {
      snapshot = {
        realTimestamp: Date.now(),
        warpedSeconds: 0,
        factor: snapshot ? snapshot.factor : 1
      };
      saveSnapshot();
    }

    if (!isUserReload) {
      const stored = loadSnapshot();
      snapshot = stored || { realTimestamp: Date.now(), warpedSeconds: 0, factor: 1 };
      if (!stored) saveSnapshot();
    } else {
      snapshot = { realTimestamp: Date.now(), warpedSeconds: 0, factor: 1 };
      saveSnapshot();
    }

    // Aufnahme-Steuerung (global innerhalb createGraphic)
    let currentRecording = null;

    function computeAutoSpeed(elapsed) {
      const sp = AUTO_SPEED_CONFIG.START_PHASE;
      const steps = AUTO_SPEED_CONFIG.SPEED_STEPS;

      if (elapsed < sp.rampDuration) {
        const t = elapsed / sp.rampDuration;
        return lerp(sp.startSpeed, sp.rampTo, (1 - Math.cos(Math.PI * t)) / 2);
      }
      const startPhaseEnd = sp.rampDuration + sp.holdDuration;
      if (elapsed < startPhaseEnd) {
        return sp.rampTo;
      }

      const T = elapsed - startPhaseEnd;
      const cycleDur = steps.reduce((a, s) => a + s.rampDuration + s.holdDuration, 0);
      const incPerCycle = steps.reduce((a, s) => a + s.increment, 0);
      const cyclesCompleted = Math.floor(T / cycleDur);
      const tInCycle = T - cyclesCompleted * cycleDur;
      let stepBase = sp.rampTo + cyclesCompleted * incPerCycle;
      let acc = 0;
      for (const step of steps) {
        const stepEnd = acc + step.rampDuration + step.holdDuration;
        if (tInCycle < stepEnd) {
          const tInStep = tInCycle - acc;
          if (tInStep < step.rampDuration) {
            const t = tInStep / step.rampDuration;
            return lerp(stepBase, stepBase + step.increment, (1 - Math.cos(Math.PI * t)) / 2);
          }
          return stepBase + step.increment;
        }
        acc = stepEnd;
        stepBase += step.increment;
      }
      return stepBase;
    }

    function computeIsInHoldPhase(elapsed) {
      const sp = AUTO_SPEED_CONFIG.START_PHASE;
      if (elapsed < sp.rampDuration) return false;
      const startPhaseEnd = sp.rampDuration + sp.holdDuration;
      if (elapsed < startPhaseEnd) return true;
      const steps = AUTO_SPEED_CONFIG.SPEED_STEPS;
      const cycleDur = steps.reduce((a, s) => a + s.rampDuration + s.holdDuration, 0);
      const T = elapsed - startPhaseEnd;
      const tInCycle = T - Math.floor(T / cycleDur) * cycleDur;
      let acc = 0;
      for (const step of steps) {
        if (tInCycle < acc + step.rampDuration) return false;
        if (tInCycle < acc + step.rampDuration + step.holdDuration) return true;
        acc += step.rampDuration + step.holdDuration;
      }
      return false;
    }



    // Hilfsfunktion
    function lerp(a, b, t) {
      return a + (b - a) * t;
    }



    // Animationsparameter
    // angle: float, gewrappt 0..360 — Float-Präzision egal wie schnell rotiert wird
    let angle = 0;
    let lastTimestamp = null;
    const ctx = canvas.getContext('2d');

    // Tab-Visibility: bei Hidden snapshot speichern (vor evtl. Tab-Kill durch Browser).
    // Bei Return Frame-Timestamp resetten, damit Winkel keinen Riesensprung macht.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        saveSnapshot();
      } else {
        lastTimestamp = null;
      }
    });

    let lastWindowWidth = window.innerWidth;

    // Funktion zum dynamischen Anpassen der Canvasgröße
    function resizeCanvasToFitContent() {
      const currentWidth = window.innerWidth;
      const widthChanged = Math.abs(currentWidth - lastWindowWidth) > 10;
      lastWindowWidth = currentWidth;

      // Viewport-relative Größen verwenden
      const viewportSize = Math.min(window.innerWidth, window.innerHeight);

      logicalCanvasSize = Math.floor(viewportSize * 0.75);

      // symbolContainer als Platzhalter (schiebt Rest-Content nach unten)
      symbolContainer.style.width = '100%';
      symbolContainer.style.height = getSymbolZoneHeight() + 'px';

      // Canvas und InteractionLayer sind fixed und Vollbild
      // DPR-aware: Pixel-Buffer = CSS × dpr, Transform = dpr-scale → scharf auf Mobile
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      canvas.style.position = 'fixed';
      canvas.style.top = '0';
      canvas.style.left = '0';
      canvas.style.zIndex = '50';
      canvas.style.pointerEvents = 'none';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      interactionLayer.style.position = 'fixed';
      interactionLayer.style.top = '0';
      interactionLayer.style.left = '0';
      interactionLayer.style.width = '100vw';
      interactionLayer.style.height = '100vh';
      interactionLayer.style.zIndex = '51';

      // Photo-Canvas bleibt exakt logische Größe für Export
      photoCanvas.width = logicalCanvasSize;
      photoCanvas.height = logicalCanvasSize;

      // Beim Resize: Nur re-zentrieren wenn die Breite sich wirklich geändert hat
      // (Verhindert Jumps auf Mobil, wenn nur die Adressleiste erscheint/verschwindet)
      if (zoomInstance && widthChanged) {
        // Behalte die aktuelle Skalierung bei, re-zentriere nur die Position im oberen Bereich
        zoomInstance.setView({
          offsetX: window.innerWidth / 2,
          offsetY: getResponsiveInitialOffsetY()
        }, false);
      }
    }

    // Zeichenfunktion für das Dreieck-Symbol (aktualisiert für 0-Werte)
    function drawTriangleOnCanvas(context, targetCanvas, forPhoto = false) {
      // Nutze die frameAngle-Version mit dem aktuellen Winkel
      drawFrameWithAngle(context, targetCanvas, angle, forPhoto);
    }

    // Animationsschleife
    function animate(timestamp) {
      if (!lastTimestamp) lastTimestamp = timestamp;
      const dt = (timestamp - lastTimestamp) / 1000;
      lastTimestamp = timestamp;

      // Screen-Hz auf den ersten ~30 stabilen Frames detektieren.
      // Default-fps wird gesetzt sobald detected, sofern User nicht selbst getippt hat.
      if (!detectionDone && dt > 0.005 && dt < 0.05) {
        dtSamples.push(dt);
        if (dtSamples.length >= 30) {
          dtSamples.sort((a, b) => a - b);
          const median = dtSamples[15];
          detectedHz = Math.max(1, Math.round(1 / median));
          if (!userChangedFps) {
            fps = detectedHz;
            document.getElementById('fps').value = String(detectedHz);
          }
          updateSnapshotFactor(fps / 60);
          detectionDone = true;
          updateFpsHint();
        }
      }

      // Echtzeit-Prüfung der Viewport-Größe (mit DPR-aware Pixel-Buffer)
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== window.innerWidth * dpr || canvas.height !== window.innerHeight * dpr) {
        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;
        canvas.style.width = window.innerWidth + 'px';
        canvas.style.height = window.innerHeight + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      if (autoSpeedEnabled) {
        const elapsed = getWarpedElapsed();
        rotationSpeed = computeAutoSpeed(elapsed) + autoOffset;
        document.getElementById('rotationSpeed').value = rotationSpeed.toFixed(1);

        // Recording: nur in Hold-Phase Frames zählen (konstante Speed = sauber für GIF)
        if (computeIsInHoldPhase(elapsed) && currentRecording && !currentRecording.stopRequested) {
          currentRecording.framesCaptured = (currentRecording.framesCaptured || 0) + 1;
          if (!currentRecording.infinite && currentRecording.framesCaptured >= currentRecording.targetFrameCount) {
            try { currentRecording.recorder.stop(); } catch (e) { }
            if (currentRecording.cleanup) { try { currentRecording.cleanup(); } catch (e) { } }
            currentRecording.stopRequested = true;
          }
        }
      }
      // Time-Warp Modell: Bewegung pro echtem Frame = rotationSpeed direkt.
      // fps wirkt nicht hier, sondern auf Cycle-Progressionsgeschwindigkeit (via getWarpedElapsed).
      // Pattern bei gleichem speed-Wert immer identisch. Alias bei speed=360 immer.
      angle = (angle + rotationSpeed) % 360;

      // Zeichne das Dreieck auf den Hauptcanvas
      drawTriangleOnCanvas(ctx, canvas);

      // Aufnahme-Frame zählen nach dem Zeichnen
      if (currentRecording && !currentRecording.stopRequested) {
        currentRecording.framesCaptured = (currentRecording.framesCaptured || 0) + 1;
        if (!currentRecording.infinite && currentRecording.framesCaptured >= currentRecording.targetFrameCount) {
          try { currentRecording.recorder.stop(); } catch (e) { }
          if (currentRecording.cleanup) { try { currentRecording.cleanup(); } catch (e) { } }
          currentRecording.stopRequested = true;
        }
      }


      // Hitbox-Zentrum für mathematisches Hit-Testing aktualisieren
      if (zoomState) {
        // interactionCenterX/Y sind Dokument-relative Koordinaten
        interactionCenterX = zoomState.offsetX;
        interactionCenterY = zoomState.offsetY;

        const minDim = logicalCanvasSize;
        const triSize = parseFloat(document.getElementById('triangleSize').value) || 0;
        const textSize = parseFloat(document.getElementById('textSize').value) || 0;
        // Exakter visueller Radius: Dreieck-Radius + Label-Überhang (Labels sitzen zentriert auf den Vertices)
        const triangleRadius = minDim * (triSize / 100);
        const labelOverhang = minDim * (textSize / 100) * 0.6; // 0.6 ≈ halbe Texthöhe + Puffer für breite Zeichen
        const baseRadius = (triangleRadius + labelOverhang) * zoomState.scale;

        interactionHitRadius = Math.max(48, baseRadius); // 48px Minimum (Touch-Ziel)
        const symbolCountForHit = parseInt(document.getElementById('symbolCountInput').value) || 0;
        interactionLayerVisible = symbolCountForHit > 0;

        // Debug: Hitbox-Kreis zeichnen
        if (document.getElementById('debugHitbox').checked) {
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.beginPath();
          ctx.arc(interactionCenterX, interactionCenterY, interactionHitRadius, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
          // Mittelpunkt
          ctx.beginPath();
          ctx.arc(interactionCenterX, interactionCenterY, 4, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
          ctx.fill();
          // Symbol-Zone Grenze (responsive Dokumenten-Grenze)
          const zoneBottom = getSymbolZoneHeight();
          const visualZoneBottom = zoneBottom - window.scrollY;
          ctx.beginPath();
          ctx.moveTo(0, visualZoneBottom);
          ctx.lineTo(window.innerWidth, visualZoneBottom);
          ctx.strokeStyle = 'rgba(0, 120, 255, 0.5)';
          ctx.lineWidth = 1;
          ctx.setLineDash([8, 6]);
          ctx.stroke();
          ctx.setLineDash([]);
          // Label
          ctx.font = '11px monospace';
          ctx.fillStyle = 'rgba(0, 120, 255, 0.7)';
          ctx.fillText('Symbol-Zone ▲ / Scroll-Zone ▼', 10, visualZoneBottom - 5);
          ctx.restore();
        }
      }

      requestAnimationFrame(animate);
    }

    // Starte mit einer passenderen Größe
    resizeCanvasToFitContent();

    // Starte die Animation
    requestAnimationFrame(animate);
  }

  // Event-Listener für das Verstecken der Steuerungen beim Scrollen (nur Desktop)
  window.addEventListener('scroll', () => {
    const controls = document.getElementById('controls');

    // Nur auf Desktop ausblenden beim Scrollen
    if (window.innerWidth > 768) {
      if (window.scrollY === 0) {
        controls.style.display = 'flex';
      } else {
        controls.style.display = 'none';
      }
    }
  });


  // Starte alles, wenn das Dokument geladen ist
  document.addEventListener('DOMContentLoaded', () => {
    injectStyles();
    createGraphic();
  });
})();