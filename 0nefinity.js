(function() {
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

/* Mobile: Sidebar von rechts */
@media (max-width: 768px) {
  header.controls {
    position: fixed !important;
    right: 0 !important;
    top: 0 !important;
    left: auto !important;
    width: 70vw !important;
    max-width: 400px !important;
    height: 100vh !important;
    padding: 80px 15px 15px 15px;
    gap: 12px;
    overflow-y: auto;
    background: var(--bg-color);
    border-left: 2px solid var(--text-color);
    z-index: 1000 !important;
    transform: translateX(100%);
    transition: transform 0.3s ease;
    display: flex !important;
    flex-direction: column;
  }

  /* Expanded State - Sidebar sichtbar */
  header.controls.expanded {
    transform: translateX(0) !important;
  }

  /* Collapsed State auf Mobile */
  header.controls.collapsed {
    transform: translateX(100%) !important;
  }

  header.controls label {
    flex: 1 1 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 16px;
    padding: 8px 0;
  }

  header.controls input[type="number"],
  header.controls input[type="text"] {
    flex: 0 0 120px;
    font-size: 16px;
    padding: 8px;
    border: 2px solid var(--text-color);
    background: var(--bg-color);
    color: var(--text-color);
    border-radius: 5px;
  }

  header.controls input[type="checkbox"] {
    width: 24px;
    height: 24px;
  }

  header.controls button {
    width: 100%;
    padding: 12px;
    font-size: 16px;
    margin-top: 8px;
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
  z-index: 50;
  transform-origin: center center;
}
.editable-photo.selected {
  outline: 2px dashed var(--text-color);
  z-index: 51;
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
    // Erstelle die Steuerungsleiste
    const controls = document.createElement('header');
    controls.className = 'controls';
    controls.id = 'controls';
    controls.innerHTML = `
      <label>Auto: <input type="checkbox" id="autoSpeedCheckbox" checked></label>
      <label>Ausrichtung: <input type="checkbox" id="rotateCheckbox"></label>
      <label>Geschw: <input type="number" id="rotationSpeed" value="0" step="0.1" min="0"></label>
      <label>Gr. Z(%): <input type="number" id="textSize" value="25" step="1" min="0"></label>
      <label>Tr.(%): <input type="number" id="triangleSize" value="30" step="1" min="0"></label>
      <label>≡G(%): <input type="number" id="equivSize" value="23" step="1" min="0"></label>
      <label>≡L(%): <input type="number" id="equivLength" value="100" step="1" min="0"></label>

      <label>Symbol 0: <input type="text" id="label0Input" value="0"></label>
      <label>Symbol 1: <input type="text" id="label1Input" value="1"></label>
      <label>Symbol ∞: <input type="text" id="labelInfInput" value="∞"></label>
      <label>Identisch: <input type="text" id="equivSymbolInput" value="≡"></label>
      <label>Dupl. Identisch: <input type="checkbox" id="duplicateIdentisch"></label>
      <button id="takePhotoButton">Foto machen</button>
      <div class="info-popup">
        <div class="info-icon">i</div>
        <div class="info-text">Diese Muster, die das Teil augenscheinlich formt, resultieren nur aus der Bewegung. Zu jedem einzelnen Zeitpunkt ist das ursprüngliche Objekt nur genau einmal in seiner ursprünglichen Form (lediglich anders gedreht) sichtbar. Ein Foto vermag das Muster deshalb nicht einzufangen und wird immer nur das ursprüngliche Objekt in einer Ruheposition zeigen.</div>
      </div>
	      <label>Frames: <input type="number" id="gifFrameCount" value="3" min="0" step="1"></label>

	      <label>∞: <input type="checkbox" id="gifInfinite"></label>

      <button id="createGifButton">GIF erstellen</button>
    `;
    document.body.insertBefore(controls, document.body.firstChild);

    // Toggle-Funktionalität
    let settingsVisible = false;

    // Prüfe, ob wir auf einem mobilen Gerät sind
    function isMobile() {
      return window.innerWidth <= 768;
    }

    // Initialisiere den Zustand basierend auf der Bildschirmgröße
    async function initializeSettingsState() {
      if (isMobile()) {
        // Auf Mobile: Sidebar standardmäßig eingeklappt
        controls.classList.add('collapsed');
        controls.classList.remove('expanded');
        settingsVisible = false;
      } else {
        // Auf Desktop: immer sichtbar
        controls.classList.remove('collapsed');
        controls.classList.remove('expanded');
        settingsVisible = true;
      }
    }

    // Toggle-Funktion für Sidebar
    function toggleSettings() {
      settingsVisible = !settingsVisible;
      if (settingsVisible) {
        controls.classList.remove('collapsed');
        controls.classList.add('expanded');
      } else {
        controls.classList.add('collapsed');
        controls.classList.remove('expanded');
      }
    }

    // Klick/Touch außerhalb schließt die Sidebar auf Mobile
    function closeSettingsIfOutside(e) {
      if (isMobile() && settingsVisible) {
        // Prüfe ob der Klick außerhalb der Controls und nicht auf dem Symbol war
        const symbolContainerEl = document.getElementById('symbolContainer');
        const canvasEl = document.getElementById('canvas');
        const clickedInsideSymbol = (symbolContainerEl && symbolContainerEl.contains(e.target)) ||
          (canvasEl && canvasEl.contains(e.target));

        if (!controls.contains(e.target) && !clickedInsideSymbol) {
          controls.classList.add('collapsed');
          controls.classList.remove('expanded');
          settingsVisible = false;
        }
      }
    }

    document.addEventListener('click', closeSettingsIfOutside);
    document.addEventListener('touchend', closeSettingsIfOutside);

    // Bei Resize prüfen
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        initializeSettingsState();
      }, 100);
    });

    // Initialisiere den Zustand
    initializeSettingsState();

    // Nochmal nach vollständigem Laden prüfen
    setTimeout(() => {
      initializeSettingsState();
    }, 500);

    // Und nochmal nach 1 Sekunde (für langsame Geräte)
    setTimeout(() => {
      initializeSettingsState();
    }, 1000);

    // Erstelle den Container für das Symbol
    // Symbol-Container
    const symbolContainer = document.createElement('div');
    symbolContainer.className = 'symbol-container';
    symbolContainer.id = 'symbolContainer';

    // Erstelle den Canvas für die Animation
    const canvas = document.createElement('canvas');
    canvas.id = 'canvas';
    canvas.width = 400;
    canvas.height = 400;
    symbolContainer.appendChild(canvas);

    // Auf Mobile öffnet ein Click/Tap auf das Symbol die Einstellungen
    function handleSymbolActivate(e) {
      if (!isMobile()) return;
      e.preventDefault();
      e.stopPropagation();
      toggleSettings();
    }

    canvas.addEventListener('click', handleSymbolActivate);
    canvas.addEventListener('touchend', handleSymbolActivate);



    if (controls.nextSibling) {
      document.body.insertBefore(symbolContainer, controls.nextSibling);
    } else {
      document.body.appendChild(symbolContainer);
    }

    // Verstecktes Canvas für die Fotogenerierung ohne Hintergrund
    const photoCanvas = document.createElement('canvas');
    photoCanvas.width = 400;
    photoCanvas.height = 400;
    photoCanvas.style.display = 'none';
    document.body.appendChild(photoCanvas);

    // Grafikeditor-Variablen und -Funktionen
    let selectedPhoto = null;
    let photoCounter = 0;

    // Handler, der die Auswahl zurücksetzt, wenn außerhalb geklickt wird
    document.addEventListener('click', function(e) {
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
        mediaElement.addEventListener('loadeddata', () => { try { mediaElement.play(); } catch(e) {} });
        // Merke die Blob-URL für späteres Aufräumen
        photo.dataset.objectUrl = mediaUrl;
      } else {
        mediaElement = document.createElement('img');
        mediaElement.src = mediaUrl;
      }

      mediaElement.onload = function() {
        addControlPoints(photo, originalWidth, originalHeight);
      };

      if (isGif) {
        mediaElement.onloadedmetadata = function() {
          addControlPoints(photo, originalWidth, originalHeight);
        };
      }

      const closeBtn = document.createElement('button');
      closeBtn.className = 'close-btn';
      closeBtn.innerHTML = '×';
      closeBtn.title = 'Entfernen';
      closeBtn.addEventListener('click', () => {
        const vid = photo.querySelector('video');
        if (vid) { try { vid.pause(); } catch(e) {} }
        const url = photo.dataset.objectUrl;
        if (url) {
          try { URL.revokeObjectURL(url); } catch (e) {}
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

      // Klick-Handler für die Auswahl
      photo.addEventListener('mousedown', function(e) {
        if (e.target === photo || e.target === mediaElement) {
          // Vorherige Auswahl entfernen
          if (selectedPhoto && selectedPhoto !== photo) {
            selectedPhoto.classList.remove('selected');
          }
          photo.classList.add('selected');
          selectedPhoto = photo;

          // Starte das Verschieben nur, wenn auf das Foto selbst geklickt wurde
          startDragging(e, photo);
        }
      });

      // Rotations-Handler
      rotationHandle.addEventListener('mousedown', function(e) {
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

        controlPoint.addEventListener('mousedown', function(e) {
          e.stopPropagation();
          startResizing(e, photo, pos.position);
        });

        photo.appendChild(controlPoint);
      });
    }

    // Verschieben eines Fotos starten
    function startDragging(e, element) {
      e.preventDefault();

      // Elemente im Vordergrund bleiben im Vordergrund, aber ausgewählte kommen nach vorne
      element.classList.add('selected');

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

      function stopDragging() {
        document.removeEventListener('mousemove', moveElement);
        document.removeEventListener('mouseup', stopDragging);
      }

      document.addEventListener('mousemove', moveElement);
      document.addEventListener('mouseup', stopDragging);
    }

    // Größenänderung eines Fotos starten
    function startResizing(e, element, position) {
      e.preventDefault();

      const mediaElement = element.querySelector('img') || element.querySelector('video');
      const rect = element.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      const startWidth = rect.width;
      const startHeight = rect.height;
      const startLeft = parseInt(element.style.left) || 0;
      const startTop = parseInt(element.style.top) || 0;
      const aspectRatio = startWidth / startHeight;
      const rotation = parseInt(element.dataset.rotation) || 0;

      function resizeElement(e) {
        let newWidth, newHeight, newLeft, newTop;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        // Je nach Position des Control Points verschiedene Größenänderungen
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

      function stopResizing() {
        document.removeEventListener('mousemove', resizeElement);
        document.removeEventListener('mouseup', stopResizing);
      }

      document.addEventListener('mousemove', resizeElement);
      document.addEventListener('mouseup', stopResizing);
    }

    // Rotation eines Fotos starten
    function startRotation(e, element) {
      e.preventDefault();

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

      function stopRotation() {
        document.removeEventListener('mousemove', rotateElement);
        document.removeEventListener('mouseup', stopRotation);
      }

      document.addEventListener('mousemove', rotateElement);
      document.addEventListener('mouseup', stopRotation);
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
          try { recorder.stop(); } catch(e) {}
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
      context.translate(targetCanvas.width / 2, targetCanvas.height / 2);
      const minDim = Math.min(targetCanvas.width, targetCanvas.height);

      // Parameter abrufen, bei 0 nicht zeichnen
      const textSizePercentage = parseFloat(document.getElementById('textSize').value) || 0;
      const triangleSize = parseFloat(document.getElementById('triangleSize').value) || 0;
      const equivSize = parseFloat(document.getElementById('equivSize').value) || 0;
      const equivLength = parseFloat(document.getElementById('equivLength').value) || 0;

      // Größen berechnen
      const labelFontSize = minDim * (textSizePercentage / 100);
      const equivFontSize = minDim * (equivSize / 100);
      const radius = minDim * (triangleSize / 100);

      // Wenn Dreieckgröße 0 ist, nichts zeichnen
      if (triangleSize <= 0) {
        context.restore();
        return;
      }

      const vertices = [];
      for (let i = 0; i < 3; i++) {
        const thetaDeg = frameAngle + i * 120;
        const thetaRad = (thetaDeg * Math.PI) / 180;
        const x = radius * Math.cos(thetaRad);
        const y = radius * Math.sin(thetaRad);
        vertices.push({ x, y, thetaRad });
      }

      const labels = [
        document.getElementById('label0Input').value || "0",
        document.getElementById('label1Input').value || "1",
        document.getElementById('labelInfInput').value || "∞"
      ];

      const equivSymbol = document.getElementById('equivSymbolInput').value || "≡";
      const tangentialMode = document.getElementById('rotateCheckbox').checked;

      // Zeichne Symbole an den Ecken nur wenn textSize > 0
      if (textSizePercentage > 0) {
        context.font = `bold ${labelFontSize}px Verdana`;
        context.fillStyle = textColor;
        context.textAlign = "center";
        context.textBaseline = "middle";

        for (let i = 0; i < 3; i++) {
          const { x, y, thetaRad } = vertices[i];
          context.save();
          context.translate(x, y);
          if (tangentialMode) {
            context.rotate(thetaRad + Math.PI / 2);
          }
          context.fillText(labels[i], 0, 0);
          context.restore();
        }
      }

      // Zeichne Äquivalenzsymbole an den Kanten nur wenn equivSize > 0
      if (equivSize > 0 && equivLength > 0) {
        for (let i = 0; i < 3; i++) {
          const p1 = vertices[i];
          const p2 = vertices[(i + 1) % 3];
          const midX = (p1.x + p2.x) / 2;
          const midY = (p1.y + p2.y) / 2;
          const sideAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

          context.save();
          context.translate(midX, midY);
          context.rotate(sideAngle);
          context.font = `bold ${equivFontSize}px Verdana`;
          context.textAlign = "center";
          context.textBaseline = "middle";

          const duplicateEnabled = document.getElementById('duplicateIdentisch').checked;
          if (duplicateEnabled) {
            const originalText = equivSymbol;
            const desiredSpacing = equivFontSize * 1.2;
            const offset = desiredSpacing / (equivLength / 100);
            context.scale(1, equivLength / 100);
            context.fillText(originalText, 0, -offset);
            context.fillText(originalText, 0, 0);
            context.fillText(originalText, 0, offset);
          } else {
            context.scale(1, equivLength / 100);
            context.fillText(equivSymbol, 0, 0);
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

    document.getElementById('rotationSpeed').addEventListener('input', () => {
      manualSpeed = parseFloat(document.getElementById('rotationSpeed').value) || 0;
      if (!autoSpeedEnabled) {
        rotationSpeed = manualSpeed;
      } else {
        let currentCycleSpeed;
        if (isInStartPhase) {
          const sp = AUTO_SPEED_CONFIG.START_PHASE;
          if (autoSpeedTimer < sp.rampDuration) {
            const t = autoSpeedTimer / sp.rampDuration;
            currentCycleSpeed = lerp(sp.startSpeed, sp.rampTo, (1 - Math.cos(Math.PI * t)) / 2);
          } else {
            // Hold-Phase der Startphase
            currentCycleSpeed = sp.rampTo;
          }
        } else if (autoSpeedTimer < currentStep.rampDuration) {
          // Ramp der Hauptsequenz (cosine-eased)
          const t = autoSpeedTimer / currentStep.rampDuration;
          currentCycleSpeed = lerp(autoSpeedBase, autoSpeedTarget, (1 - Math.cos(Math.PI * t)) / 2);
        } else {
          // Hold der Hauptsequenz
          currentCycleSpeed = autoSpeedTarget;
        }
        autoOffset = manualSpeed - currentCycleSpeed;
        rotationSpeed = currentCycleSpeed + autoOffset;
      }
    });

    document.getElementById('autoSpeedCheckbox').addEventListener('change', e => {
      autoSpeedEnabled = e.target.checked;
      if (autoSpeedEnabled) {
        manualSpeed = parseFloat(document.getElementById('rotationSpeed').value) || 0;
        autoOffset = 0;

        // Starte mit der Startphase
        isInStartPhase = true;
        stepIndex = 0;
        currentStep = AUTO_SPEED_CONFIG.SPEED_STEPS[stepIndex];
        autoSpeedBase = manualSpeed;
        autoSpeedTarget = autoSpeedBase + currentStep.increment;
        autoSpeedTimer = 0;
        cycleDuration = AUTO_SPEED_CONFIG.START_PHASE.rampDuration + AUTO_SPEED_CONFIG.START_PHASE.holdDuration;

        rotationSpeed = AUTO_SPEED_CONFIG.START_PHASE.startSpeed + autoOffset;
        document.getElementById('rotationSpeed').value = rotationSpeed.toFixed(1);
      }
    });

    // Geschwindigkeitsparameter für automatischen Modus
    let isInStartPhase = true;
    let stepIndex = 0;
    let currentStep = AUTO_SPEED_CONFIG.SPEED_STEPS[stepIndex];

	    // Aufnahme-Steuerung (global innerhalb createGraphic)
	    let currentRecording = null; // { recorder, track, infinite, targetFrameCount, framesCaptured, stopRequested, cleanup }

    let autoSpeedBase = manualSpeed;
    let autoSpeedTarget = autoSpeedBase + currentStep.increment;
    let autoSpeedTimer = 0;
    let cycleDuration = isInStartPhase
      ? (AUTO_SPEED_CONFIG.START_PHASE.rampDuration + AUTO_SPEED_CONFIG.START_PHASE.holdDuration)
      : (currentStep.rampDuration + currentStep.holdDuration);



    // Hilfsfunktion
    function lerp(a, b, t) {
      return a + (b - a) * t;
    }



    // Animationsparameter
    let angle = 0;
    let lastTimestamp = null;
    const ctx = canvas.getContext('2d');


    // Funktion zum dynamischen Anpassen der Canvasgröße
    function resizeCanvasToFitContent() {
      // Viewport-relative Größen verwenden
      const viewportSize = Math.min(window.innerWidth, window.innerHeight);

      // Canvas-Größe relativ zum Viewport (75% der Fenstergröße)
      const canvasSize = Math.floor(viewportSize * 0.75);

      canvas.width = canvasSize;
      canvas.height = canvasSize;

      // Aktualisiere auch das Photo-Canvas
      photoCanvas.width = canvasSize;
      photoCanvas.height = canvasSize;
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
      if (autoSpeedEnabled) {
        autoSpeedTimer += dt;
        let currentCycleSpeed;

        if (isInStartPhase) {
          // Startphase: Ramp-down von startSpeed auf 0, dann Hold
          const sp = AUTO_SPEED_CONFIG.START_PHASE;
          if (autoSpeedTimer < sp.rampDuration) {
            const t = autoSpeedTimer / sp.rampDuration;
            currentCycleSpeed = lerp(sp.startSpeed, sp.rampTo, (1 - Math.cos(Math.PI * t)) / 2);
          } else if (autoSpeedTimer < sp.rampDuration + sp.holdDuration) {
            currentCycleSpeed = sp.rampTo;
          } else {
            // Startphase beendet - zur Hauptsequenz wechseln
            isInStartPhase = false;
            autoSpeedTimer = 0;
            autoSpeedBase = sp.rampTo;
            autoSpeedTarget = autoSpeedBase + currentStep.increment;
            cycleDuration = currentStep.rampDuration + currentStep.holdDuration;
            currentCycleSpeed = autoSpeedBase;
          }
        } else {
          // Hauptsequenz
          if (autoSpeedTimer < currentStep.rampDuration) {
            // Einfache Ramp: lerp + ease (sanfter Start, sanftes Ende)
            const t = autoSpeedTimer / currentStep.rampDuration;
            currentCycleSpeed = lerp(autoSpeedBase, autoSpeedTarget, (1 - Math.cos(Math.PI * t)) / 2);
          } else if (autoSpeedTimer < cycleDuration) {
            // Hold Phase - konstante Geschwindigkeit
            currentCycleSpeed = autoSpeedTarget;

	      // Wenn Aufnahme läuft: Frame zählen/triggern
	      if (currentRecording && !currentRecording.stopRequested) {
	        currentRecording.framesCaptured = (currentRecording.framesCaptured || 0) + 1;
	        if (!currentRecording.infinite && currentRecording.framesCaptured >= currentRecording.targetFrameCount) {
	          try { currentRecording.recorder.stop(); } catch(e) {}
	          if (currentRecording.cleanup) { try { currentRecording.cleanup(); } catch(e) {} }
	          currentRecording.stopRequested = true;
	        }
	      }

          } else {
            // Zyklus abgeschlossen - nächsten Step starten
            autoSpeedTimer -= cycleDuration;
            autoSpeedBase = autoSpeedTarget;

            // Nächsten Step auswählen
            stepIndex = (stepIndex + 1) % AUTO_SPEED_CONFIG.SPEED_STEPS.length;
            currentStep = AUTO_SPEED_CONFIG.SPEED_STEPS[stepIndex];

            // Neue Zielgeschwindigkeit und Zyklusdauer berechnen
            autoSpeedTarget = autoSpeedBase + currentStep.increment;
            cycleDuration = currentStep.rampDuration + currentStep.holdDuration;

            currentCycleSpeed = autoSpeedBase;
          }
        }

        rotationSpeed = currentCycleSpeed + autoOffset;
        document.getElementById('rotationSpeed').value = rotationSpeed.toFixed(1);
      }
      angle += rotationSpeed;

      // Zeichne das Dreieck auf den Hauptcanvas
      drawTriangleOnCanvas(ctx, canvas);

	      // Aufnahme-Frame zählen nach dem Zeichnen
	      if (currentRecording && !currentRecording.stopRequested) {
	        currentRecording.framesCaptured = (currentRecording.framesCaptured || 0) + 1;
	        if (!currentRecording.infinite && currentRecording.framesCaptured >= currentRecording.targetFrameCount) {
	          try { currentRecording.recorder.stop(); } catch(e) {}
	          if (currentRecording.cleanup) { try { currentRecording.cleanup(); } catch(e) {} }
	          currentRecording.stopRequested = true;
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

  // Fenster-Größenänderung behandeln
  window.addEventListener('resize', () => {
    // Nach kurzer Verzögerung die Canvas-Größe neu berechnen (Debounce)
    if (window.__resizeTimeoutId) {
      clearTimeout(window.__resizeTimeoutId);
    }
    window.__resizeTimeoutId = setTimeout(() => {
      if (document.getElementById('canvas')) {
        const resizeCanvasToFitContent = function() {
          const canvas = document.getElementById('canvas');
          const photoCanvas = document.querySelector('canvas[style="display: none;"]');

          // Viewport-relative Größen verwenden
          const viewportSize = Math.min(window.innerWidth, window.innerHeight);

          // Canvas-Größe relativ zum Viewport (75% der Fenstergröße)
          const canvasSize = Math.floor(viewportSize * 0.75);

          canvas.width = canvasSize;
          canvas.height = canvasSize;

          // Aktualisiere auch das Photo-Canvas
          if (photoCanvas) {
            photoCanvas.width = canvasSize;
            photoCanvas.height = canvasSize;
          }
        };

        resizeCanvasToFitContent();
      }
    }, 250);
  });

  // Starte alles, wenn das Dokument geladen ist
  document.addEventListener('DOMContentLoaded', () => {
    injectStyles();
    createGraphic();
  });
})();