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
header.controls input[type="text"],
header.controls textarea {
  margin-left: 3px;
  padding: 2px 4px;
  font-size: 12px;
  background: var(--bg-color);
  color: var(--text-color);
  box-sizing: content-box;
}
header.controls textarea {
  height: 40px;
  width: 200px;
  resize: vertical;
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

/* SVG Path Drawing Styles */
.path-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  margin-top: 5px;
  padding-top: 5px;
  border-top: 1px solid var(--text-color);
}
    `;
    const styleEl = document.createElement('style');
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }

  // SVG Path Parser
  class SVGPathParser {
    constructor() {
      this.commands = [];
      this.currentX = 0;
      this.currentY = 0;
    }

    parse(pathData) {
      this.commands = [];
      this.currentX = 0;
      this.currentY = 0;

      if (!pathData) return this.commands;

      // Normalize path data
      const normalized = pathData
        .replace(/([a-zA-Z])/g, ' $1 ')
        .replace(/,/g, ' ')
        .replace(/-/g, ' -')
        .replace(/\s+/g, ' ')
        .trim();

      const tokens = normalized.split(' ');
      let currentCommand = null;
      let params = [];

      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];

        // Check if token is a command
        if (/^[MLHVCSQTAZmlhvcsqtaz]$/.test(token)) {
          // Process previous command if exists
          if (currentCommand && params.length > 0) {
            this.processCommand(currentCommand, params);
            params = [];
          }
          currentCommand = token;
        } else if (token !== '') {
          // Add parameter
          params.push(parseFloat(token));

          // Process command if we have enough parameters
          if (this.hasEnoughParams(currentCommand, params)) {
            this.processCommand(currentCommand, params);
            params = [];

            // For commands that can take multiple sets of parameters
            if (!/^[Zz]$/.test(currentCommand)) {
              currentCommand = currentCommand.toLowerCase();
            }
          }
        }
      }

      // Process any remaining command
      if (currentCommand && params.length > 0) {
        this.processCommand(currentCommand, params);
      }

      return this.commands;
    }

    hasEnoughParams(cmd, params) {
      switch (cmd.toUpperCase()) {
        case 'M': case 'L': case 'T': return params.length >= 2;
        case 'H': case 'V': return params.length >= 1;
        case 'C': return params.length >= 6;
        case 'S': case 'Q': return params.length >= 4;
        case 'A': return params.length >= 7;
        case 'Z': return true;
        default: return false;
      }
    }

    processCommand(cmd, params) {
      const isRelative = cmd === cmd.toLowerCase();
      const command = { type: cmd };

      switch (cmd.toUpperCase()) {
        case 'M': // Move to
          command.x = isRelative ? this.currentX + params[0] : params[0];
          command.y = isRelative ? this.currentY + params[1] : params[1];
          this.currentX = command.x;
          this.currentY = command.y;
          break;

        case 'L': // Line to
          command.x = isRelative ? this.currentX + params[0] : params[0];
          command.y = isRelative ? this.currentY + params[1] : params[1];
          this.currentX = command.x;
          this.currentY = command.y;
          break;

        case 'H': // Horizontal line to
          command.x = isRelative ? this.currentX + params[0] : params[0];
          command.y = this.currentY;
          this.currentX = command.x;
          break;

        case 'V': // Vertical line to
          command.x = this.currentX;
          command.y = isRelative ? this.currentY + params[0] : params[0];
          this.currentY = command.y;
          break;

        case 'Z': // Close path
          command.x = this.currentX;
          command.y = this.currentY;
          break;

        // For simplicity, we'll implement just the basic commands for now
        // More complex commands like curves can be added later
      }

      this.commands.push(command);
    }
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

      <div class="path-controls">
        <label>SVG Pfad: <textarea id="svgPathInput" placeholder="z.B. M10,10 L90,90"></textarea></label>
        <label>Pfad Geschw.: <input type="number" id="pathSpeed" value="1" step="0.1" min="0.1" max="10"></label>
        <label>Strichstärke: <input type="number" id="pathStrokeWidth" value="2" step="0.5" min="0.5"></label>
        <button id="drawPathButton">Pfad zeichnen</button>
        <button id="clearPathButton">Löschen</button>
      </div>
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

    // SVG Path Drawing Variables
    let pathCommands = [];
    let pathProgress = 0;
    let isDrawingPath = false;
    let pathParser = new SVGPathParser();

    // Path Drawing Controls
    document.getElementById('drawPathButton').addEventListener('click', () => {
      const pathData = document.getElementById('svgPathInput').value;
      if (pathData) {
        pathCommands = pathParser.parse(pathData);
        pathProgress = 0;
        isDrawingPath = true;
      }
    });

    document.getElementById('clearPathButton').addEventListener('click', () => {
      isDrawingPath = false;
      pathProgress = 0;
      document.getElementById('svgPathInput').value = '';
    });

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

      photo.appendChild(mediaElement);
      photo.appendChild(closeBtn);
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

      return photo;
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
    let pathSpeed = parseFloat(document.getElementById('pathSpeed').value) || 1;
    let pathStrokeWidth = parseFloat(document.getElementById('pathStrokeWidth').value) || 2;

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
    document.getElementById('pathSpeed').addEventListener('input', () => {
      pathSpeed = parseFloat(document.getElementById('pathSpeed').value) || 1;
    });
    document.getElementById('pathStrokeWidth').addEventListener('input', () => {
      pathStrokeWidth = parseFloat(document.getElementById('pathStrokeWidth').value) || 2;
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

    // Funktion zum Zeichnen des SVG-Pfades
    function drawSVGPath(context, progress) {
      if (!pathCommands.length) return;

      const style = getComputedStyle(document.documentElement);
      const textColor = style.getPropertyValue('--text-color').trim() || "#fff";

      context.save();
      context.translate(canvas.width / 2, canvas.height / 2);

      // Skalierungsfaktor, um den Pfad an die Canvas-Größe anzupassen
      const scale = Math.min(canvas.width, canvas.height) * 0.8 / 200; // Annahme: Pfad ist für 200x200 Koordinaten
      context.scale(scale, scale);

      context.strokeStyle = textColor;
      context.lineWidth = pathStrokeWidth;
      context.lineCap = 'round';
      context.lineJoin = 'round';

      // Berechne, wie viele Befehle basierend auf dem Fortschritt gezeichnet werden sollen
      const commandsToDraw = Math.floor(pathCommands.length * progress) + 1;
      const partialCommandProgress = (pathCommands.length * progress) % 1;

      context.beginPath();

      // Zeichne vollständige Befehle
      for (let i = 0; i < Math.min(commandsToDraw - 1, pathCommands.length); i++) {
        const cmd = pathCommands[i];

        if (i === 0 && cmd.type.toUpperCase() === 'M') {
          context.moveTo(cmd.x, cmd.y);
        } else if (cmd.type.toUpperCase() === 'M') {
          context.moveTo(cmd.x, cmd.y);
        } else if (cmd.type.toUpperCase() === 'L') {
          context.lineTo(cmd.x, cmd.y);
        } else if (cmd.type.toUpperCase() === 'H') {
          context.lineTo(cmd.x, pathCommands[i-1].y);
        } else if (cmd.type.toUpperCase() === 'V') {
          context.lineTo(pathCommands[i-1].x, cmd.y);
        } else if (cmd.type.toUpperCase() === 'Z') {
          context.closePath();
        }
      }

      // Zeichne den teilweise abgeschlossenen Befehl
      if (commandsToDraw <= pathCommands.length) {
        const currentCmd = pathCommands[commandsToDraw - 1];
        const prevCmd = commandsToDraw > 1 ? pathCommands[commandsToDraw - 2] : null;

        if (commandsToDraw === 1 && currentCmd.type.toUpperCase() === 'M') {
          // Erster Befehl ist ein Move-To, nichts zu zeichnen
          context.moveTo(currentCmd.x, currentCmd.y);
        } else if (currentCmd.type.toUpperCase() === 'M') {
          context.moveTo(currentCmd.x, currentCmd.y);
        } else if (currentCmd.type.toUpperCase() === 'L' && prevCmd) {
          const startX = prevCmd.x;
          const startY = prevCmd.y;
          const endX = currentCmd.x;
          const endY = currentCmd.y;

          const x = startX + (endX - startX) * partialCommandProgress;
          const y = startY + (endY - startY) * partialCommandProgress;

          context.lineTo(x, y);
        } else if (currentCmd.type.toUpperCase() === 'H' && prevCmd) {
          const startX = prevCmd.x;
          const endX = currentCmd.x;

          const x = startX + (endX - startX) * partialCommandProgress;

          context.lineTo(x, prevCmd.y);
        } else if (currentCmd.type.toUpperCase() === 'V' && prevCmd) {
          const startY = prevCmd.y;
          const endY = currentCmd.y;

          const y = startY + (endY - startY) * partialCommandProgress;

          context.lineTo(prevCmd.x, y);
        } else if (currentCmd.type.toUpperCase() === 'Z') {
          // Für Z-Befehle gibt es keinen teilweisen Fortschritt
          if (partialCommandProgress > 0.5) {
            context.closePath();
          }
        }
      }

      context.stroke();
      context.restore();
    }

    // Zeichenfunktion für das Dreieck-Symbol
    function drawTriangleOnCanvas(context, targetCanvas, forPhoto = false) {
      const style = getComputedStyle(document.documentElement);
      const textColor = style.getPropertyValue('--text-color').trim() || "#000";

      // Lösche den Canvas
      if (!forPhoto) {
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
        const thetaDeg = angle + i * 120;
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

      // Zeichne den SVG-Pfad, wenn aktiv
      if (isDrawingPath && pathCommands.length > 0) {
        drawSVGPath(context, pathProgress);
      }

      context.restore();
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

      // Aktualisiere den SVG-Pfad-Fortschritt
      if (isDrawingPath && pathCommands.length > 0) {
        pathProgress += dt * pathSpeed / 5; // Anpassen der Geschwindigkeit
        if (pathProgress >= 1) {
          pathProgress = 1; // Stoppe bei 100%
        }
      }

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
