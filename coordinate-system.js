(function(){
    // Falls noch nicht definiert, Standardfarbe (Text, Graph, Achsen)
    if (typeof textColor === 'undefined') { var textColor = '#000'; }
    
    // Canvas erstellen, das den ganzen Viewport einnimmt
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.zIndex = '0';
    document.body.style.margin = '0'; // Browser-Margen entfernen
    document.body.appendChild(canvas);
    
    // Eingabefeld für die Funktionsformel erstellen
    var input = document.createElement('input');
    input.type = 'text';
    input.value = 'f(x)=x^2';
    input.style.position = 'fixed';
    input.style.top = '2em';
    input.style.left = '80px';
    input.style.zIndex = '10';
    input.style.fontSize = '16px';
    input.style.padding = '4px';
    document.body.appendChild(input);
    
    // Variablen für Transformation: 
    // offsetX/offsetY bestimmen, wo (0,0) in Canvas-Koordinaten liegt
    var offsetX = 0, offsetY = 0;
    var scale = 50; // 50 Pixel pro Einheit (Startwert)
    
    // Canvas-Größe anpassen – ganzes Fenster ausfüllen
    function resizeCanvas() {
      var oldWidth = canvas.width, oldHeight = canvas.height;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      // Bei Resize den Offset so anpassen, dass das gleiche Weltzentrum erhalten bleibt
      if(oldWidth && oldHeight) {
        offsetX += (canvas.width - oldWidth) / 2;
        offsetY += (canvas.height - oldHeight) / 2;
      } else {
        // Initial: (0,0) in Weltkoordinaten wird in die Mitte gelegt
        offsetX = canvas.width / 2;
        offsetY = canvas.height / 2;
      }
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
    
    // Variablen für Maus-Zustand (Panning)
    var isDragging = false, lastX, lastY;
    
    canvas.addEventListener('mousedown', function(e) {
      isDragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    });
    canvas.addEventListener('mousemove', function(e) {
      if (isDragging) {
        var dx = e.clientX - lastX;
        var dy = e.clientY - lastY;
        offsetX += dx;
        offsetY += dy;
        lastX = e.clientX;
        lastY = e.clientY;
      }
    });
    canvas.addEventListener('mouseup', function() { isDragging = false; });
    canvas.addEventListener('mouseleave', function() { isDragging = false; });
    
    // Zoomen mit dem Mausrad – Zoom zentriert am Mauszeiger
    canvas.addEventListener('wheel', function(e) {
      e.preventDefault();
      var mouseX = e.clientX;
      var mouseY = e.clientY;
      // Bestimme den Zoomfaktor (nach oben scrollen: reinzoomen)
      var zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      // Weltkoordinaten des Mauszeigers vor dem Zoomen
      var worldX = (mouseX - offsetX) / scale;
      var worldY = (offsetY - mouseY) / scale;
      scale *= zoomFactor;
      // Verschiebe den Offset, sodass der Punkt unter der Maus gleich bleibt
      offsetX = mouseX - worldX * scale;
      offsetY = mouseY + worldY * scale;
    });
    
    // Standardfunktion: f(x)=x²
    var currentFunction = function(x){ return x*x; };
    
    // Aktualisiert die Funktion aus dem Eingabefeld
    function updateFunction() {
      var formula = input.value.trim();
      // Entferne z.B. "f(x)=" am Anfang (unabhängig von Groß-/Kleinschreibung)
      formula = formula.replace(/^[fF]\(x\)\s*=\s*/, '');
      // Ersetze ^ durch ** (JavaScript-Notation für Potenzen)
      formula = formula.replace(/\^/g, '**');
      try {
        currentFunction = new Function('x', 'return ' + formula + ';');
      } catch (err) {
        console.error('Fehler in der Formel:', err);
      }
    }
    input.addEventListener('change', updateFunction);
    input.addEventListener('keyup', updateFunction);
    
    // Zeichnet Achsen (mit Pfeilen und Beschriftung) und den Funktionsgraphen
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      ctx.strokeStyle = textColor;
      ctx.fillStyle = textColor;
      ctx.lineWidth = 2;
      
      var arrowSize = 10;
      
      // ----- X-Achse (y = 0 in Weltkoordinaten) -----
      // Berechne die Canvas-Y-Position der X-Achse
      var canvasAxisY = offsetY;
      if (canvasAxisY >= 0 && canvasAxisY <= canvas.height) {
        ctx.beginPath();
        ctx.moveTo(0, canvasAxisY);
        ctx.lineTo(canvas.width, canvasAxisY);
        ctx.stroke();
        
        // Pfeil am rechten Ende (positive x)
        ctx.beginPath();
        ctx.moveTo(canvas.width, canvasAxisY);
        ctx.lineTo(canvas.width - arrowSize, canvasAxisY - arrowSize/2);
        ctx.lineTo(canvas.width - arrowSize, canvasAxisY + arrowSize/2);
        ctx.closePath();
        ctx.fill();
        
        // Pfeil am linken Ende (negative x)
        ctx.beginPath();
        ctx.moveTo(0, canvasAxisY);
        ctx.lineTo(arrowSize, canvasAxisY - arrowSize/2);
        ctx.lineTo(arrowSize, canvasAxisY + arrowSize/2);
        ctx.closePath();
        ctx.fill();
        
        // Beschriftung der X-Achse (am rechten Ende)
        ctx.font = "16px sans-serif";
        ctx.fillText("x", canvas.width - arrowSize - 15, canvasAxisY - arrowSize);
      }
      
      // ----- Y-Achse (x = 0 in Weltkoordinaten) -----
      var canvasAxisX = offsetX;
      if (canvasAxisX >= 0 && canvasAxisX <= canvas.width) {
        ctx.beginPath();
        ctx.moveTo(canvasAxisX, 0);
        ctx.lineTo(canvasAxisX, canvas.height);
        ctx.stroke();
        
        // Pfeil am oberen Ende (positive y – im mathematischen Sinne nach oben)
        ctx.beginPath();
        ctx.moveTo(canvasAxisX, 0);
        ctx.lineTo(canvasAxisX - arrowSize/2, arrowSize);
        ctx.lineTo(canvasAxisX + arrowSize/2, arrowSize);
        ctx.closePath();
        ctx.fill();
        
        // Pfeil am unteren Ende (negative y)
        ctx.beginPath();
        ctx.moveTo(canvasAxisX, canvas.height);
        ctx.lineTo(canvasAxisX - arrowSize/2, canvas.height - arrowSize);
        ctx.lineTo(canvasAxisX + arrowSize/2, canvas.height - arrowSize);
        ctx.closePath();
        ctx.fill();
        
        // Beschriftung der Y-Achse (am oberen Ende)
        ctx.font = "16px sans-serif";
        ctx.fillText("y", canvasAxisX + arrowSize, 15);
      }
      
      // ----- Funktionsgraph zeichnen -----
      ctx.beginPath();
      var firstPoint = true;
      // Schleife über alle Pixel in x-Richtung
      for (var pixelX = 0; pixelX <= canvas.width; pixelX++) {
        // Bestimme den entsprechenden x-Wert in Weltkoordinaten
        var x = (pixelX - offsetX) / scale;
        var y;
        try {
          y = currentFunction(x);
        } catch (err) {
          y = NaN;
        }
        // Bei Fehlern oder Unendlichkeiten die Linie unterbrechen
        if (typeof y !== 'number' || !isFinite(y)) {
          firstPoint = true;
          continue;
        }
        // Berechne die Canvas-Y-Position (Beachte: Canvas-Y-Achse zeigt nach unten!)
        var pixelY = offsetY - y * scale;
        if (firstPoint) {
          ctx.moveTo(pixelX, pixelY);
          firstPoint = false;
        } else {
          ctx.lineTo(pixelX, pixelY);
        }
      }
      ctx.stroke();
      
      requestAnimationFrame(draw);
    }
    
    draw();
  })();
  