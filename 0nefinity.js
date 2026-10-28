(function () {
  // Alle Styles in einem einzigen Block
  function injectStyles() {
    const css = `

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

/* Info-Hinweis neben dem Screenshot-Button (Popup per JS positioniert, damit das Panel es nicht abschneidet) */
.symbol-info-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.symbol-info-row .ctrl-button {
  flex: 0 0 auto;
}
.symbol-info-icon {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1px solid var(--text-color);
  color: var(--text-color);
  background: transparent;
  font: bold 11px/1 inherit;
  padding: 0;
  cursor: help;
}
.symbol-info-text {
  position: fixed;
  z-index: 100000;
  width: min(300px, calc(100vw - 24px));
  background: var(--bg-color);
  color: var(--text-color);
  border: 1px solid var(--text-color);
  border-radius: 4px;
  padding: 8px;
  font-size: 12px;
  box-shadow: 0 2px 5px rgba(0,0,0,0.2);
  pointer-events: none;
  visibility: hidden;
  opacity: 0;
  transition: opacity 0.2s;
}
.symbol-info-text.visible {
  visibility: visible;
  opacity: 1;
}
.symbol-gif-error {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  z-index: 100001;
  max-width: min(560px, calc(100vw - 24px));
  background: var(--bg-color);
  color: var(--text-color);
  border: 1px solid #ff5a5a;
  border-radius: 4px;
  padding: 10px 14px;
  font-size: 13px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.4);
  cursor: pointer;
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
    `;
    const styleEl = document.createElement('style');
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }

  // Hauptfunktion zum Erstellen der Grafik
  function createGraphic() {
    // Wichtige Layout-Elemente vorab deklarieren
    const symbolContainer = document.createElement('div');
    symbolContainer.className = 'symbol-container';
    symbolContainer.id = 'symbolContainer';

    let logicalCanvasSize = 400;
    const photoCanvas = document.createElement('canvas');
    photoCanvas.style.display = 'none';

    // Einstellungen: Quelle der Wahrheit fuer Zeichnen und Animation.
    // Das Panel (tools/controls.js, siehe buildSettingsPanel) schreibt hierher.
    const cfg = {
      speedDisplay: true,
      speedOffset: 22,
      auto: true,
      speed: 0,
      degPerCircle: 360,
      fps: 60,
      rotate: false,
      textSize: 25,
      triangleSize: 30,
      equivSize: 23,
      equivLength: 100,
      duplicate: false,
      duplicateSpacing: 1.2,
      symbolCount: 3,
      sync: true,
      labels: ['0', '1', '∞'],
      equivs: ['≡'],
      gifFrames: 3,
      gifInfinite: false,
      debug: false
    };

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
    let panelHiddenByTap = window.innerWidth <= 768; // Mobil startet das Panel versteckt
    let panelHiddenByScroll = false;
    let settingsPanel = null;
    function applyPanelVisibility() {
      if (!settingsPanel) return;
      settingsPanel.el.style.display = (panelHiddenByTap || panelHiddenByScroll) ? 'none' : '';
    }
    // Desktop: Panel beim Scrollen ausblenden
    window.addEventListener('scroll', () => {
      if (window.innerWidth <= 768) return;
      panelHiddenByScroll = window.scrollY !== 0;
      applyPanelVisibility();
    });
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
        panelHiddenByTap = !panelHiddenByTap;
        applyPanelVisibility();
      } else {
        // Tap außerhalb Symbol: fullscreen-Layer schluckt sonst Klicks auf Seiteninhalt
        // (Links/Buttons unterm Symbol). Klick ans darunterliegende Element durchreichen.
        interactionLayer.style.pointerEvents = 'none';
        const under = document.elementFromPoint(e.clientX, e.clientY);
        interactionLayer.style.pointerEvents = 'auto';
        const clickable = under && under.closest('a, button, [onclick]');
        if (clickable) clickable.click();
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

    document.body.insertBefore(symbolContainer, document.body.firstChild);

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
    function createEditablePhoto(mediaUrl, originalWidth, originalHeight) {
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

      const mediaElement = document.createElement('img');
      mediaElement.src = mediaUrl;
      if (mediaUrl.startsWith('blob:')) photo.dataset.objectUrl = mediaUrl;

      mediaElement.onload = function () {
        addControlPoints(photo, originalWidth, originalHeight);
      };

      const closeBtn = document.createElement('button');
      closeBtn.className = 'close-btn';
      closeBtn.innerHTML = '×';
      closeBtn.title = 'Entfernen';
      closeBtn.addEventListener('click', () => {
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

    // === Screenshot (PNG) und GIF (offline gerendert, eigener Encoder) ===
    const GIF_MAX_FRAMES = 200;
    let gifBusy = false;
    let gifCapture = null;

    function showSymbolError(message, err) {
      console.error('[0nefinity symbol] ' + message, err || '');
      const old = document.querySelector('.symbol-gif-error');
      if (old) old.remove();
      const el = document.createElement('div');
      el.className = 'symbol-gif-error';
      el.setAttribute('role', 'alert');
      el.textContent = message + ' (click to dismiss)';
      el.addEventListener('click', () => el.remove());
      document.body.appendChild(el);
    }

    function downloadUrl(url, filename) {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }

    function exportStamp() {
      return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    }

    function nextTick() {
      return new Promise(resolve => setTimeout(resolve, 0));
    }

    function takeScreenshot() {
      try {
        const photoCtx = photoCanvas.getContext('2d');
        photoCtx.clearRect(0, 0, photoCanvas.width, photoCanvas.height);
        drawTriangleOnCanvas(photoCtx, photoCanvas, true);
        const { dataURL, width, height } = trimTransparentEdges(photoCanvas);
        createEditablePhoto(dataURL, width, height);
        downloadUrl(dataURL, `0nefinity-screenshot-${exportStamp()}.png`);
      } catch (err) {
        showSymbolError('Screenshot failed: ' + (err && err.message || err), err);
      }
    }

    function loadGifEncoder() {
      if (window.GifEncoder) return Promise.resolve(window.GifEncoder);
      return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = '/tools/gif-encoder.js';
        s.onload = () => (window.GifEncoder ? resolve(window.GifEncoder) : reject(new Error('gif-encoder.js loaded but GifEncoder is missing')));
        s.onerror = () => reject(new Error('could not load /tools/gif-encoder.js'));
        document.head.appendChild(s);
      });
    }

    function cssColorToRgb(color) {
      const c = document.createElement('canvas');
      c.width = c.height = 1;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.fillStyle = color;
      g.fillRect(0, 0, 1, 1);
      const d = g.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2]];
    }

    // Ein Frame = Alpha-Kanal des transparent gerenderten Symbols (Zeichenfarbe ist einfarbig,
    // deshalb reicht Alpha: Palettenindex = Deckkraft zwischen Hintergrund- und Textfarbe).
    function renderAlphaFrame(ang) {
      const w = photoCanvas.width, h = photoCanvas.height;
      const pctx = photoCanvas.getContext('2d', { willReadFrequently: true });
      pctx.clearRect(0, 0, w, h);
      drawFrameWithAngle(pctx, photoCanvas, ang, true);
      const rgba = pctx.getImageData(0, 0, w, h).data;
      const alpha = new Uint8Array(w * h);
      for (let i = 0, j = 3; i < alpha.length; i++, j += 4) alpha[i] = rgba[j];
      return { alpha, w, h };
    }

    async function encodeGif(frames, delayCs) {
      const Enc = await loadGifEncoder();
      const { w, h } = frames[0];
      let minX = w, minY = h, maxX = -1, maxY = -1;
      for (const f of frames) {
        const a = f.alpha;
        for (let y = 0; y < h; y++) {
          const row = y * w;
          for (let x = 0; x < w; x++) {
            if (a[row + x]) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
        await nextTick();
      }
      if (maxX < 0) throw new Error('nothing to draw (symbol is empty)');
      const pad = Math.max(2, Math.floor(w * 0.01));
      minX = Math.max(0, minX - pad);
      minY = Math.max(0, minY - pad);
      maxX = Math.min(w - 1, maxX + pad);
      maxY = Math.min(h - 1, maxY + pad);
      const cw = maxX - minX + 1, ch = maxY - minY + 1;

      const style = getComputedStyle(document.documentElement);
      const bg = cssColorToRgb(style.getPropertyValue('--bg-color').trim() || '#000');
      const fg = cssColorToRgb(style.getPropertyValue('--text-color').trim() || '#fff');
      const palette = new Uint8Array(768);
      for (let i = 0; i < 256; i++) {
        for (let c = 0; c < 3; c++) palette[i * 3 + c] = Math.round(bg[c] + (fg[c] - bg[c]) * i / 255);
      }

      const enc = new Enc(cw, ch, palette, { loop: 0 });
      for (const f of frames) {
        const idx = new Uint8Array(cw * ch);
        for (let y = 0; y < ch; y++) {
          const src = (y + minY) * w + minX;
          idx.set(f.alpha.subarray(src, src + cw), y * cw);
        }
        enc.addFrame(idx, delayCs);
        await nextTick();
      }
      return { blob: enc.finish(), width: cw, height: ch };
    }

    function setGifButtonLabel(text) {
      const b = settingsPanel && settingsPanel.bodyEl.querySelector('[data-key="createGif"] button');
      if (b) b.textContent = text;
    }

    // Live-Aufnahme bei "infinite": animate() liefert Frames, bis Stop gedrueckt oder das Limit erreicht ist
    function captureLiveFrames() {
      return new Promise((resolve, reject) => {
        const cap = {
          frames: [],
          finish: () => { gifCapture = null; resolve(cap.frames); },
          fail: (err) => { gifCapture = null; reject(err); }
        };
        gifCapture = cap;
        setGifButtonLabel('Stop');
      });
    }

    async function createGif() {
      if (gifBusy) {
        if (gifCapture) gifCapture.finish();
        return;
      }
      const infinite = cfg.gifInfinite;
      const n = Math.max(0, Math.floor(cfg.gifFrames) || 0);
      if (!infinite && n === 0) {
        // 0 Frames: unsichtbares, verschiebbares Objekt
        const ph = document.createElement('canvas');
        ph.width = photoCanvas.width;
        ph.height = photoCanvas.height;
        createEditablePhoto(ph.toDataURL('image/png'), ph.width, ph.height);
        return;
      }
      if (!infinite && n > GIF_MAX_FRAMES) {
        showSymbolError(`GIF creation failed: at most ${GIF_MAX_FRAMES} frames (asked for ${n})`);
        return;
      }
      gifBusy = true;
      try {
        let frames;
        if (infinite) {
          frames = await captureLiveFrames();
        } else {
          frames = [];
          let a = angle;
          setGifButtonLabel('Rendering...');
          for (let k = 0; k < n; k++) {
            frames.push(renderAlphaFrame(a));
            a = (a + rotationSpeed) % 360;
            if (k % 4 === 3) await nextTick();
          }
        }
        if (!frames.length) throw new Error('no frames captured');
        setGifButtonLabel('Encoding...');
        const delayCs = Math.round(100 / Math.max(1, Math.min(cfg.fps || 60, 50)));
        const { blob, width, height } = await encodeGif(frames, delayCs);
        const url = URL.createObjectURL(blob);
        createEditablePhoto(url, width, height);
        downloadUrl(url, `0nefinity-${exportStamp()}.gif`);
      } catch (err) {
        showSymbolError('GIF creation failed: ' + (err && err.message || err), err);
      } finally {
        gifBusy = false;
        gifCapture = null;
        setGifButtonLabel('Create GIF');
      }
    }

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
      const textSizePercentage = cfg.textSize;
      const triangleSize = cfg.triangleSize;
      const equivSize = cfg.equivSize;
      const equivLength = cfg.equivLength;

      // Größen berechnen
      const labelFontSize = minDim * (textSizePercentage / 100);
      const equivFontSize = minDim * (equivSize / 100);
      const radius = minDim * (triangleSize / 100);

      const symbolCount = cfg.symbolCount;
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

      const labels = cfg.labels.slice(0, symbolCount).map(v => v || "");

      const equivSymbols = cfg.sync
        ? new Array(symbolCount).fill(cfg.equivs[0] ?? "≡")
        : cfg.equivs.slice(0, symbolCount).map(v => v || "");

      const tangentialMode = cfg.rotate;

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

      // Geschwindigkeits-Anzeige über Symbol: roh ≡ visuell-äquivalent (mod degPerCircle)
      // Bei degPerCircle=360 (default): 720°/frame ≡ 0°/frame; 370°/frame ≡ 10°/frame
      // Bei degPerCircle=361: 722°/frame ≡ 0°/frame; 371°/frame ≡ 10°/frame
      // Nur für Live-Animation, nicht im Foto/GIF-Export
      if (!forExport && targetCanvas === canvas && cfg.speedDisplay) {
        const speedFontSize = Math.max(minDim * 0.025, labelFontSize * 0.12);
        const yPos = -radius - speedFontSize * 4 - cfg.speedOffset;
        const speedDisplayed = toUser(rotationSpeed);
        const speedRawInt = Math.round(speedDisplayed);
        const dpcStr = String(degPerCircle);

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

        if (Math.abs(speedRawInt) >= degPerCircle) {
          let wrappedText;
          if (speedRawInt === degPerCircle) {
            wrappedText = `  0°/frame`;
            final0CenterX = gap + context.measureText("  ").width + charW / 2;
          } else if (speedRawInt > 0 && speedRawInt % degPerCircle === 0) {
            wrappedText = `${dpcStr}°/frame ≡ 0°/frame`;
            wrapped360CenterX = gap + context.measureText(dpcStr).width / 2;
            final0CenterX = gap + context.measureText(`${dpcStr}°/frame ≡ `).width + charW / 2;
          } else {
            let speedWrappedInt = Math.round(((speedDisplayed % degPerCircle) + degPerCircle) % degPerCircle);
            const wrappedPadded = String(speedWrappedInt).padStart(3, ' ');
            wrappedText = `${wrappedPadded}°/frame`;
            if (speedWrappedInt === degPerCircle) {
              wrappedText += ` ≡ 0°/frame`;
              wrapped360CenterX = gap + context.measureText(dpcStr).width / 2;
              final0CenterX = gap + context.measureText(`${dpcStr}°/frame ≡ `).width + charW / 2;
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

        // Raw NNN: nur bei Vielfachem von degPerCircle (>0).
        // Center der N-Ziffern exakt unter Center der raw-Ziffern.
        if (speedRawInt > 0 && speedRawInt % degPerCircle === 0) {
          const N = speedRawInt / degPerCircle;
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

          const duplicateEnabled = cfg.duplicate;
          const currentEquiv = equivSymbols[i] || "";
          
          if (duplicateEnabled) {
            const originalText = currentEquiv;
            const duplicateSpacingFactor = cfg.duplicateSpacing;
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

    const AUTO_SPEED_DEFAULT = JSON.parse(JSON.stringify(AUTO_SPEED_CONFIG));
    function restoreChoreo(src) {
      Object.assign(AUTO_SPEED_CONFIG.START_PHASE, src.START_PHASE);
      AUTO_SPEED_CONFIG.SPEED_STEPS.length = 0;
      src.SPEED_STEPS.forEach(st => AUTO_SPEED_CONFIG.SPEED_STEPS.push({ ...st }));
    }
    // Die Choreografie lebt nur im Speicher der Seite: Neuladen und Reset fuehren zur Voreinstellung.
    const copyChoreo = () => JSON.parse(JSON.stringify(AUTO_SPEED_CONFIG));

    // Animationsparameter initialisieren
    // degPerCircle: nur Display-Konvention. Intern bleibt rotationSpeed in echten 360°-Grad/Frame.
    // Das Speed-Feld zeigt user-units = rotationSpeed * degPerCircle / 360.
    let degPerCircle = cfg.degPerCircle > 0 ? cfg.degPerCircle : 360;
    const toReal = v => v * 360 / degPerCircle;
    const toUser = v => v * degPerCircle / 360;
    let manualSpeed = toReal(cfg.speed);
    let rotationSpeed = manualSpeed;
    let autoSpeedEnabled = cfg.auto;
    let autoOffset = 0;
    let autoPausedAt = null;

    // Time-Warp Modell: fps veraendert nicht die Bewegung pro Frame, sondern wie schnell
    // der Cycle progressiert. speed-Wert pro Frame ist konstant, fps streckt/staucht Cycle-Zeit.
    let fps = cfg.fps;
    let detectedHz = 60;
    let userChangedFps = false;
    let dtSamples = [];
    let detectionDone = false;

    const FPS_LABEL = 'Frame rate';
    function updateFpsHint() {
      const label = settingsPanel && settingsPanel.bodyEl.querySelector('[data-key="fps"] .ctrl-label');
      if (label) label.textContent = (detectionDone && fps > detectedHz) ? FPS_LABEL + ' (simulated)' : FPS_LABEL;
    }

    function showInfoText(icon, text) {
      const r = icon.getBoundingClientRect();
      text.classList.add('visible');
      const narrow = window.innerWidth <= 768;
      const w = text.offsetWidth, h = text.offsetHeight;
      let left = narrow ? 12 : r.right + 10;
      let top = narrow ? r.top - h - 8 : r.top - 4;
      left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
      top = Math.max(8, Math.min(top, window.innerHeight - h - 8));
      text.style.left = left + 'px';
      text.style.top = top + 'px';
    }

    // Info-"i" direkt neben dem Screenshot-Button (gleiche Zeile)
    function addInfoIcon(row) {
      row.classList.add('symbol-info-row');
      const icon = document.createElement('button');
      icon.type = 'button';
      icon.className = 'symbol-info-icon';
      icon.textContent = 'i';
      icon.setAttribute('aria-label', 'Info');
      const text = document.createElement('div');
      text.className = 'symbol-info-text';
      text.textContent = 'Diese Muster, die das Teil augenscheinlich formt, resultieren nur aus der Bewegung. Zu jedem einzelnen Zeitpunkt ist das ursprüngliche Objekt nur genau einmal in seiner ursprünglichen Form (lediglich anders gedreht) sichtbar. Ein Screenshot vermag das Muster deshalb nicht einzufangen und wird immer nur das ursprüngliche Objekt in einer Ruheposition zeigen.';
      document.body.appendChild(text);
      icon.addEventListener('mouseenter', () => showInfoText(icon, text));
      icon.addEventListener('mouseleave', () => text.classList.remove('visible'));
      icon.addEventListener('focus', () => showInfoText(icon, text));
      icon.addEventListener('blur', () => text.classList.remove('visible'));
      icon.addEventListener('click', () => {
        if (text.classList.contains('visible')) text.classList.remove('visible');
        else showInfoText(icon, text);
      });
      row.appendChild(icon);
    }

    // Passt controls.js nicht zu diesem Skript (alte Kopie im Browser-Cache), holt es einmal frisch am Cache vorbei und laedt neu.
    function healStaleControls() {
      const FLAG = '0nefinity-controls-heal';
      try {
        if (sessionStorage.getItem(FLAG)) return;
        sessionStorage.setItem(FLAG, '1');
      } catch (e) { return; }
      fetch('/tools/controls.js', { cache: 'reload' })
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); location.reload(); })
        .catch(e => showSymbolError('Reloading tools/controls.js failed: ' + (e && e.message || e), e));
    }

    function buildSettingsPanel() {
      if (!window.Controls) {
        showSymbolError('Settings panel unavailable: tools/controls.js did not load');
        return;
      }
      const panel = Controls.createPanel({ id: 'symbol-controls', position: 'left' });
      settingsPanel = panel;
      applyPanelVisibility();
      const num = (v, fallback = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : fallback; };

      // Oberste Zeile: Symbole untereinander, Trennzeichen daneben, + / - darunter aendert die Anzahl
      const setSymbolCount = (n) => {
        cfg.symbolCount = Math.max(0, Math.floor(n));
        rebuildSymbolRows();
      };
      panel.addSymbolRow('labels', {
        values: cfg.labels.slice(0, cfg.symbolCount),
        onChange: (i, v) => { cfg.labels[i] = v; },
        onAdd: () => setSymbolCount(cfg.symbolCount + 1),
        onRemove: () => setSymbolCount(cfg.symbolCount - 1),
        onResize: n => setSymbolCount(n),
        min: 0,
        layout: 'column',
        heading: 'Symbole',
        toggle: { key: 'sync', label: 'sync', value: cfg.sync, onChange: v => { cfg.sync = !!v; rebuildSymbolRows(); } },
        side: { key: 'equivs', label: 'Separator', values: cfg.equivs.slice(), onChange: (i, v) => { cfg.equivs[i] = v; } },
      });
      panel.addDivider();

      const autoToggleChange = v => {
        cfg.auto = !!v;
        autoSpeedEnabled = cfg.auto;
        if (!autoSpeedEnabled) {
          // Stand der Choreografie merken, damit Wiedereinschalten dort weitermacht
          autoPausedAt = getWarpedElapsed();
          return;
        }
        manualSpeed = toReal(num(panel.get('speed')));
        if (autoPausedAt === null) {
          autoOffset = 0;
          resetSnapshot();
        } else {
          snapshot.warpedSeconds = autoPausedAt;
          snapshot.realTimestamp = Date.now();
          saveSnapshot();
          autoPausedAt = null;
        }
        rotationSpeed = computeAutoSpeed(getWarpedElapsed()) + autoOffset;
        panel.set('speed', Number(toUser(rotationSpeed).toFixed(1)));
      };
      // Reset-Knopf (controls.js): Choreografie von vorn, FPS wieder auf Bildschirm-Hz wie beim Laden.
      const codeFps = cfg.fps;
      panel.addResetButton({
        onClick: () => {
          const prev = { autoOffset, autoPausedAt, userChangedFps, snapshot: { ...snapshot }, choreo: copyChoreo() };
          return () => {
            ({ autoOffset, autoPausedAt, userChangedFps } = prev);
            restoreChoreo(prev.choreo);
            renderChoreo();
            snapshot = prev.snapshot;
            saveSnapshot();
            if (autoSpeedEnabled) rotationSpeed = computeAutoSpeed(getWarpedElapsed()) + autoOffset;
          };
        },
        afterReset: () => {
          if (detectionDone && panel.get('fps') === codeFps) {
            fps = detectedHz;
            cfg.fps = fps;
            panel.set('fps', fps);
            updateSnapshotFactor(fps / 60);
            userChangedFps = false;
            updateFpsHint();
          }
          restoreChoreo(AUTO_SPEED_DEFAULT);
          renderChoreo();
          autoOffset = 0;
          autoPausedAt = null;
          resetSnapshot();
          rotationSpeed = autoSpeedEnabled ? computeAutoSpeed(getWarpedElapsed()) : manualSpeed;
          panel.set('speed', Number(toUser(rotationSpeed).toFixed(1)));
        }
      });

      panel.beginSection('speed')
        .addSlider('speed', {
          label: 'Speed', min: 0, max: 1440, step: 0.1, decimals: 1, value: cfg.speed, grow: true,
          onChange: v => {
            cfg.speed = num(v);
            manualSpeed = toReal(cfg.speed);
            if (!autoSpeedEnabled) {
              rotationSpeed = manualSpeed;
            } else {
              const currentCycleSpeed = computeAutoSpeed(getWarpedElapsed());
              autoOffset = manualSpeed - currentCycleSpeed;
              rotationSpeed = currentCycleSpeed + autoOffset;
            }
          }
        })
        .addToggle('auto', {
          label: 'Auto speed', value: cfg.auto, onChange: autoToggleChange,
          details: p => { p.beginSection('autoChoreo').endSection(); }
        })
        .endSection();

      // Choreografie: Start (von, nach, Rampe, Halten) und Stufen (+Tempo, Rampe, Halten), Schleife ueber die Stufen
      function editChoreo(apply) {
        apply();
        if (autoSpeedEnabled) {
          rotationSpeed = computeAutoSpeed(getWarpedElapsed()) + autoOffset;
          panel.set('speed', Number(toUser(rotationSpeed).toFixed(1)));
        }
      }
      function renderChoreo() {
        const sp = AUTO_SPEED_CONFIG.START_PHASE;
        const steps = AUTO_SPEED_CONFIG.SPEED_STEPS;
        const startFields = ['startSpeed', 'rampTo', 'rampDuration', 'holdDuration'];
        const stepFields = ['increment', 'rampDuration', 'holdDuration'];
        const setField = (obj, field, v) => {
          const n = parseFloat(String(v).replace(',', '.'));
          if (!Number.isFinite(n)) return;
          if (field !== 'startSpeed' && field !== 'rampTo' && field !== 'increment' && n < 0) return;
          editChoreo(() => { obj[field] = n; });
        };
        panel.fillSection('autoChoreo', p => {
          p.addSymbolRow('autoStart', {
            label: 'Start', inputmode: 'decimal',
            captions: ['from', 'to', 'ramp s', 'hold s'],
            labels: ['Start speed', 'Start target speed', 'Start ramp seconds', 'Start hold seconds'],
            values: startFields.map(f => String(sp[f])),
            onChange: (i, v) => setField(sp, startFields[i], v)
          });
          steps.forEach((step, i) => {
            p.addSymbolRow('autoStep' + i, {
              label: 'Step ' + (i + 1), inputmode: 'decimal',
              captions: i === 0 ? ['+ speed', 'ramp s', 'hold s'] : null,
              labels: ['Step ' + (i + 1) + ' speed change', 'Step ' + (i + 1) + ' ramp seconds', 'Step ' + (i + 1) + ' hold seconds'],
              values: stepFields.map(f => String(step[f])),
              onChange: (j, v) => setField(step, stepFields[j], v)
            });
          });
          p.addButtonGroup('autoChoreoActions', {
            buttons: [
              { key: 'addStep', label: '+ Step', onClick: () => { editChoreo(() => { const last = steps[steps.length - 1]; steps.push(last ? { ...last } : { increment: 120, rampDuration: 0.8, holdDuration: 1.5 }); }); renderChoreo(); } },
              { key: 'removeStep', label: '\u2212 Step', onClick: () => { if (!steps.length) return; editChoreo(() => { steps.pop(); }); renderChoreo(); } },
              { key: 'resetChoreo', label: 'Reset', title: 'Default choreography', onClick: () => { editChoreo(() => restoreChoreo(AUTO_SPEED_DEFAULT)); renderChoreo(); } }
            ]
          });
        });
      }
      renderChoreo();

      panel.addDivider();
      panel.beginSection('shape')
        .addSlider('textSize', { label: 'Symbol size %', min: 0, max: 100, step: 1, decimals: 0, value: cfg.textSize, onChange: v => { cfg.textSize = num(v); resizeCanvasToFitContent(); } })
        .addSlider('triangleSize', { label: 'Circle radius %', min: -100, max: 100, step: 1, decimals: 0, value: cfg.triangleSize, onChange: v => { cfg.triangleSize = num(v); resizeCanvasToFitContent(); } })
        .addToggle('rotate', { label: 'Rotate symbols', value: cfg.rotate, onChange: v => { cfg.rotate = !!v; } })
        .addSlider('equivSize', { label: 'Separator size %', min: 0, max: 100, step: 1, decimals: 0, value: cfg.equivSize, onChange: v => { cfg.equivSize = num(v); resizeCanvasToFitContent(); } })
        .addSlider('equivLength', { label: 'Separator length %', min: 0, max: 300, step: 1, decimals: 0, value: cfg.equivLength, onChange: v => { cfg.equivLength = num(v); resizeCanvasToFitContent(); } })
        .addToggle('duplicate', {
          label: 'Double separator', value: cfg.duplicate, onChange: v => { cfg.duplicate = !!v; },
          details: p => p.addSlider('duplicateSpacing', { label: 'Separator gap', min: 0, max: 5, step: 0.1, decimals: 1, value: cfg.duplicateSpacing, onChange: v => { cfg.duplicateSpacing = num(v); } })
        })
        .endSection();


      function rebuildSymbolRows() {
        const n = cfg.symbolCount;
        const defaults = ['0', '1', '∞'];
        while (cfg.labels.length < n) cfg.labels.push(defaults[cfg.labels.length % 3]);
        cfg.labels.length = n;
        const firstEquiv = cfg.equivs[0] || '≡';
        if (cfg.sync) {
          cfg.equivs = [firstEquiv];
        } else {
          while (cfg.equivs.length < n) cfg.equivs.push(firstEquiv);
          cfg.equivs.length = n;
        }

        panel.set('equivs', n > 0 ? cfg.equivs.slice() : []);
        panel.set('labels', cfg.labels.slice(0, n));
      }
      rebuildSymbolRows();

      panel.addDivider();
      panel.beginSection('timing')
        .addSlider('degPerCircle', {
          label: 'Degrees per turn', min: 1, max: 720, step: 1, decimals: 0, value: cfg.degPerCircle,
          onChange: v => {
            const d = num(v, NaN);
            if (!Number.isFinite(d) || d <= 0) return;
            cfg.degPerCircle = d;
            degPerCircle = d;
            panel.set('speed', Number(toUser(rotationSpeed).toFixed(1)));
          }
        })
        .addSlider('fps', {
          label: FPS_LABEL, min: 0, max: 240, step: 1, decimals: 0, value: cfg.fps,
          onChange: v => {
            fps = num(v);
            cfg.fps = fps;
            userChangedFps = true;
            updateSnapshotFactor(fps / 60);
            updateFpsHint();
          }
        })
        .endSection();

      panel.addDivider();
      panel.beginSection('export')
        .addButton('screenshot', { label: 'Screenshot', onClick: takeScreenshot })
        .addSlider('gifFrames', { label: 'GIF frames', min: 0, max: 60, step: 1, decimals: 0, value: cfg.gifFrames, onChange: v => { cfg.gifFrames = Math.max(0, Math.floor(num(v))); } })
        .addToggle('gifInfinite', { label: 'GIF infinite (live, Stop)', value: cfg.gifInfinite, onChange: v => { cfg.gifInfinite = !!v; } })
        .addButton('createGif', { label: 'Create GIF', onClick: createGif })
        .addToggle('debug', { label: 'Debug (buggy)', value: cfg.debug, onChange: v => { cfg.debug = !!v; } })
        .endSection();

      panel.addDivider();
      panel.beginSection('monitor')
        .addToggle('speedDisplay', {
          label: 'Speed monitor', value: cfg.speedDisplay, onChange: v => { cfg.speedDisplay = !!v; },
          details: p => p.addSlider('speedOffset', {
            label: 'Speed monitor offset', min: -100, max: 200, step: 1, decimals: 0, value: cfg.speedOffset,
            onChange: v => { cfg.speedOffset = num(v); }
          })
        })
        .endSection();
      addInfoIcon(panel.bodyEl.querySelector('[data-key="screenshot"]'));
    }

    // Time-Warp Snapshot: { realTimestamp ms, warpedSeconds, factor }
    // warped elapsed = warpedSeconds + (Date.now() - realTimestamp)/1000 * factor
    // factor = fps / 60 (fixe Referenz). Bei fps-Wechsel: snapshot updated für Continuity (kein Sprung).
    // Persistiert in localStorage → übersteht Mobile-Browser Tab-Kill, kontinuiert echte Zeit.
    // Neuladen und frisches Oeffnen (reload, navigate) → Reset. Nur Zurueck/Vor und Tab-Wiederherstellung (back_forward) → continue.
    const SNAPSHOT_KEY = '0nefinity-symbol-snapshot';
    const navEntry = performance.getEntriesByType('navigation')[0];
    const isUserReload = !!navEntry && (navEntry.type === 'reload' || navEntry.type === 'navigate');
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
      if (!(cycleDur > 0)) return sp.rampTo;
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
      if (!(cycleDur > 0)) return true;
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
    let lastSpeedUiUpdate = 0;
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
            cfg.fps = fps;
            if (settingsPanel) settingsPanel.set('fps', detectedHz);
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
        if (settingsPanel && timestamp - lastSpeedUiUpdate > 80) {
          lastSpeedUiUpdate = timestamp;
          settingsPanel.set('speed', Number(toUser(rotationSpeed).toFixed(1)));
        }
      }
      // Time-Warp Modell: Bewegung pro echtem Frame = rotationSpeed direkt.
      // fps wirkt nicht hier, sondern auf Cycle-Progressionsgeschwindigkeit (via getWarpedElapsed).
      // Pattern bei gleichem speed-Wert immer identisch. Alias bei speed=360 immer.
      angle = (angle + rotationSpeed) % 360;
      window.__symbolAngle = angle; // meta.js spiegelt ihn ins Favicon
      window.__symbolAngleT = timestamp;

      // Zeichne das Dreieck auf den Hauptcanvas
      drawTriangleOnCanvas(ctx, canvas);

      // Live-Aufnahme (GIF infinite): jedes gezeichnete Bild mitnehmen
      if (gifCapture) {
        try {
          gifCapture.frames.push(renderAlphaFrame(angle));
          if (gifCapture.frames.length >= GIF_MAX_FRAMES) gifCapture.finish();
        } catch (err) {
          gifCapture.fail(err);
        }
      }


      // Hitbox-Zentrum für mathematisches Hit-Testing aktualisieren
      if (zoomState) {
        // interactionCenterX/Y sind Dokument-relative Koordinaten
        interactionCenterX = zoomState.offsetX;
        interactionCenterY = zoomState.offsetY;

        const minDim = logicalCanvasSize;
        const triSize = cfg.triangleSize;
        const textSize = cfg.textSize;
        // Exakter visueller Radius: Dreieck-Radius + Label-Überhang (Labels sitzen zentriert auf den Vertices)
        const triangleRadius = minDim * (triSize / 100);
        const labelOverhang = minDim * (textSize / 100) * 0.6; // 0.6 ≈ halbe Texthöhe + Puffer für breite Zeichen
        const baseRadius = (triangleRadius + labelOverhang) * zoomState.scale;

        interactionHitRadius = Math.max(48, baseRadius); // 48px Minimum (Touch-Ziel)
        const symbolCountForHit = cfg.symbolCount;
        interactionLayerVisible = symbolCountForHit > 0;

        // Debug: Hitbox-Kreis zeichnen
        if (cfg.debug) {
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

    // Ein Panel-Fehler (z. B. gecachtes altes controls.js neben neuem 0nefinity.js) darf die Animation nicht mittoeten.
    try {
      buildSettingsPanel();
    } catch (err) {
      showSymbolError('Settings panel failed: ' + (err && err.message || err), err);
      healStaleControls();
    }

    // Starte mit einer passenderen Größe
    resizeCanvasToFitContent();

    // Starte die Animation
    requestAnimationFrame(animate);
  }

  // Starte alles, wenn das Dokument geladen ist
  document.addEventListener('DOMContentLoaded', () => {
    injectStyles();
    createGraphic();
  });
})();