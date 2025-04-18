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
  z-index: 1000;
  color: var(--text-color);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 5px;
  box-sizing: border-box;
  padding: 5px;
  background: transparent;
}
header.controls label {
  white-space: nowrap;
  margin: 2px 4px;
  font-size: 12px;
}
header.controls input[type="number"],
header.controls input[type="text"] {
  margin-left: 3px;
  padding: 2px 4px;
  font-size: 12px;
  background: var(--bg-color);
  color: var(--text-color);
  box-sizing: content-box;
}
header.controls input#rotationSpeed {
  width: 60px;
}
header.controls input[type="checkbox"] {
  margin-left: 3px;
  box-sizing: content-box;
}
header.controls button {
  margin: 2px 4px;
  padding: 2px 8px;
  font-size: 12px;
  background: var(--bg-color);
  color: var(--text-color);
  border: 1px solid var(--text-color);
  border-radius: 3px;
  cursor: pointer;
}
.symbol-container {
  position: relative;
  margin-top: 70px;
  margin-bottom: 20px;
  overflow: visible;
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  min-height: 400px;
}
canvas {
  display: block;
}
#speedIndicator {
  position: absolute;
  top: 10px;
  right: 10px;
  color: #fff;
  padding: 2px 5px;
  border-radius: 5px;
  font-size: 12px;
  pointer-events: none;
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
      <label>≡G(%): <input type="number" id="equivSize" value="25" step="1" min="0"></label>
      <label>≡L(%): <input type="number" id="equivLength" value="100" step="1" min="0"></label>
      <label>SpeedInc: <input type="number" id="speedIncrement" value="60" step="1" min="0"></label>
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
      <button id="createGifButton">GIF erstellen</button>
    `;
    document.body.insertBefore(controls, document.body.firstChild);

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

    // Geschwindigkeitsindikator
    const speedIndicator = document.createElement('div');
    speedIndicator.id = 'speedIndicator';
    speedIndicator.textContent = 'Speed: 0°/Frame';
    symbolContainer.appendChild(speedIndicator);

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
    document.getElementById('createGifButton').addEventListener('click', async () => {
      // Anzahl der Frames für eine Sekunde GIF
      const frameCount = 30; // 30 FPS
      const frames = [];
      const frameDelay = 1000 / frameCount;

      // Aktuelle Rotationsgeschwindigkeit und Winkel speichern
      const originalSpeed = rotationSpeed;
      const originalAngle = angle;

      // Temporärer Canvas für die Frames
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext('2d');

      // Frames erstellen
      for (let i = 0; i < frameCount; i++) {
        // Winkel für diesen Frame berechnen
        const frameAngle = originalAngle + (i * originalSpeed / frameCount);

        tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);

        // Spezieller Draw-Aufruf mit festem Winkel für jeden Frame
        drawFrameWithAngle(tempCtx, tempCanvas, frameAngle, true);

        // Bild als Blob speichern
        const blob = await new Promise(resolve => {
          tempCanvas.toBlob(resolve, 'image/png');
        });

        frames.push(blob);
      }

      // Wieder originalen Winkel setzen
      angle = originalAngle;

      // Frames zu einem Video zusammenfügen
      createVideoFromFrames(frames, frameDelay).then(videoBlob => {
        const videoUrl = URL.createObjectURL(videoBlob);

        // Größe des GIFs ermitteln (basierend auf dem Canvas)
        const width = canvas.width;
        const height = canvas.height;

        // GIF als editierbares Element hinzufügen
        createEditablePhoto(videoUrl, width, height, true);
      });
    });

    // Frames zu einem Video zusammenfügen
    async function createVideoFromFrames(frames, frameDelay) {
      // MediaRecorder verwenden, um ein Video zu erstellen
      const stream = canvas.captureStream();
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });

      const chunks = [];
      recorder.ondataavailable = e => chunks.push(e.data);

      const recordingPromise = new Promise(resolve => {
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'video/webm' });
          resolve(blob);
        };
      });

      recorder.start();

      // Frames nacheinander zeichnen
      const ctx = canvas.getContext('2d');
      for (const frame of frames) {
        const img = new Image();
        img.src = URL.createObjectURL(frame);
        await new Promise(resolve => {
          img.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(img.src);
            resolve();
          };
        });
        await new Promise(resolve => setTimeout(resolve, frameDelay));
      }

      recorder.stop();
      return recordingPromise;
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

    // Animationsparameter initialisieren
    let textSizePercentage = parseFloat(document.getElementById('textSize').value) || 25;
    let triangleSize = parseFloat(document.getElementById('triangleSize').value) || 30;
    let equivSize = parseFloat(document.getElementById('equivSize').value) || 25;
    let equivLength = parseFloat(document.getElementById('equivLength').value) || 100;
    let manualSpeed = parseFloat(document.getElementById('rotationSpeed').value) || 0;
    let rotationSpeed = manualSpeed;
    let autoSpeedEnabled = document.getElementById('autoSpeedCheckbox').checked;
    let autoOffset = 0;

    let startupPhase = true;
let startupTimer = 0;
const startupDuration = 2.0;

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
    document.getElementById('rotateCheckbox').addEventListener('change', e => {
      tangentialMode = e.target.checked;
    });
    document.getElementById('rotationSpeed').addEventListener('input', () => {
      manualSpeed = parseFloat(document.getElementById('rotationSpeed').value) || 0;
      if (!autoSpeedEnabled) {
        rotationSpeed = manualSpeed;
      } else {
        let currentCycleSpeed;
        if (autoSpeedTimer < rampDuration) {
          currentCycleSpeed = lerp(autoSpeedBase, autoSpeedTarget, ease(autoSpeedTimer / rampDuration));
        } else {
          currentCycleSpeed = autoSpeedTarget;
        }
        autoOffset = manualSpeed - currentCycleSpeed;
        rotationSpeed = currentCycleSpeed + autoOffset;
      }
    });
    let speedIncrement = parseFloat(document.getElementById('speedIncrement').value) || 60;
    document.getElementById('speedIncrement').addEventListener('input', () => {
      speedIncrement = parseFloat(document.getElementById('speedIncrement').value) || 60;
    });
    document.getElementById('autoSpeedCheckbox').addEventListener('change', e => {
      autoSpeedEnabled = e.target.checked;
      if (autoSpeedEnabled) {
        manualSpeed = parseFloat(document.getElementById('rotationSpeed').value) || 0;
        autoOffset = 0;
        let current = manualSpeed;
        let r = Math.floor(current / speedIncrement);
        let off = current - r * speedIncrement;
        autoSpeedTarget = (r + 1) * speedIncrement + off;
        autoSpeedBase = current;
        autoSpeedTimer = 0;
        rotationSpeed = autoSpeedBase + autoOffset;
        document.getElementById('rotationSpeed').value = rotationSpeed.toFixed(1);
      }
    });

    // Geschwindigkeitsparameter
    let autoSpeedBase = manualSpeed;
    let autoSpeedTarget = autoSpeedBase + speedIncrement;
    let autoSpeedTimer = 0;
    const rampDuration = 1;
    const holdDuration = 1;
    const cycleDuration = rampDuration + holdDuration;

    // Hilfsfunktionen
    function lerp(a, b, t) {
      return a + (b - a) * t;
    }
    function ease(t) {
      return (1 - Math.cos(Math.PI * t)) / 2;
    }

    // Animationsparameter
    let angle = 0;
    let lastTimestamp = null;
    const ctx = canvas.getContext('2d');
    let tangentialMode = document.getElementById('rotateCheckbox').checked;

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
        if (autoSpeedTimer < rampDuration) {
          currentCycleSpeed = lerp(autoSpeedBase, autoSpeedTarget, ease(autoSpeedTimer / rampDuration));
        } else if (autoSpeedTimer < cycleDuration) {
          currentCycleSpeed = autoSpeedTarget;
        } else {
          autoSpeedTimer -= cycleDuration;
          autoSpeedBase = autoSpeedTarget;
          autoSpeedTarget = autoSpeedBase + speedIncrement;
          currentCycleSpeed = autoSpeedBase;
        }
        rotationSpeed = currentCycleSpeed + autoOffset;
        document.getElementById('rotationSpeed').value = rotationSpeed.toFixed(1);
      }
      angle += rotationSpeed;

      // Zeichne das Dreieck auf den Hauptcanvas
      drawTriangleOnCanvas(ctx, canvas);

      speedIndicator.textContent = 'Speed: ' + Math.round(rotationSpeed) + '°/Frame';
      requestAnimationFrame(animate);
    }

    // Starte mit einer passenderen Größe
    resizeCanvasToFitContent();

    // Starte die Animation
    requestAnimationFrame(animate);
  }

  // Event-Listener für das Verstecken der Steuerungen beim Scrollen
  window.addEventListener('scroll', () => {
    const controls = document.getElementById('controls');
    if (window.scrollY === 0) {
      controls.style.display = 'flex';
    } else {
      controls.style.display = 'none';
    }
  });

  // Fenster-Größenänderung behandeln
  window.addEventListener('resize', () => {
    // Nach kurzer Verzögerung die Canvas-Größe neu berechnen (Debounce)
    if (window.resizeTimeout) {
      clearTimeout(window.resizeTimeout);
    }
    window.resizeTimeout = setTimeout(() => {
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