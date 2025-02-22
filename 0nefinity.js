(function() {
  function injectStyles() {
    const css = `
header.controls {
  position: fixed;
  top: 0;
  left: 70px;
  right: 70px;
  height: auto;
  z-index: 1000;
  background: var(--bg-color);
  color: var(--text-color);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 5px;
  box-sizing: border-box;
  padding: 5px;
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
.symbol-container {
  width: 100vw;
  max-width: 400px;
  height: 400px;
  margin-top: 70px;
  margin-bottom: 20px;
  position: relative;
  background: var(--bg-color);
  overflow: visible;
}
canvas {
  display: block;
  width: 400px;
  height: 400px;
}
#speedIndicator {
  position: absolute;
  top: 10px;
  right: 10px;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  padding: 2px 5px;
  border-radius: 5px;
  font-family: Verdana, sans-serif;
  font-size: 12px;
  pointer-events: none;
}
.toggle-text {
  transition: color 0.3s ease;
  cursor: pointer;
}
.toggle-text:hover {
  color: var(--text-color-hover);
}
    `;
    const styleEl = document.createElement('style');
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }

  function createGraphic() {
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
    `;
    document.body.insertBefore(controls, document.body.firstChild);

    const symbolContainer = document.createElement('div');
    symbolContainer.className = 'symbol-container';
    symbolContainer.id = 'symbolContainer';

    const canvas = document.createElement('canvas');
    canvas.id = 'canvas';
    canvas.width = 800;
    canvas.height = 800;
    symbolContainer.appendChild(canvas);

    const speedIndicator = document.createElement('div');
    speedIndicator.id = 'speedIndicator';
    speedIndicator.textContent = 'Speed: 0°/Frame';
    symbolContainer.appendChild(speedIndicator);

    if (controls.nextSibling) {
      document.body.insertBefore(symbolContainer, controls.nextSibling);
    } else {
      document.body.appendChild(symbolContainer);
    }

    let textSizePercentage = parseFloat(document.getElementById('textSize').value) || 25;
    let triangleSize = parseFloat(document.getElementById('triangleSize').value) || 30;
    let equivSize = parseFloat(document.getElementById('equivSize').value) || 25;
    let equivLength = parseFloat(document.getElementById('equivLength').value) || 100;
    let manualSpeed = parseFloat(document.getElementById('rotationSpeed').value) || 0;
    let rotationSpeed = manualSpeed;
    let autoSpeedEnabled = document.getElementById('autoSpeedCheckbox').checked;
    let autoOffset = 0;

    document.getElementById('textSize').addEventListener('input', () => {
      textSizePercentage = parseFloat(document.getElementById('textSize').value) || 25;
    });
    document.getElementById('triangleSize').addEventListener('input', () => {
      triangleSize = parseFloat(document.getElementById('triangleSize').value) || 30;
    });
    document.getElementById('equivSize').addEventListener('input', () => {
      equivSize = parseFloat(document.getElementById('equivSize').value) || 25;
    });
    document.getElementById('equivLength').addEventListener('input', () => {
      equivLength = parseFloat(document.getElementById('equivLength').value) || 100;
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

    let autoSpeedBase = manualSpeed;
    let autoSpeedTarget = autoSpeedBase + speedIncrement;
    let autoSpeedTimer = 0;
    const rampDuration = 1;
    const holdDuration = 1;
    const cycleDuration = rampDuration + holdDuration;

    function lerp(a, b, t) {
      return a + (b - a) * t;
    }
    function ease(t) {
      return (1 - Math.cos(Math.PI * t)) / 2;
    }

    let angle = 0;
    let lastTimestamp = null;
    const ctx = canvas.getContext('2d');
    let tangentialMode = document.getElementById('rotateCheckbox').checked;

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
      const style = getComputedStyle(document.documentElement);
      const bgColor = style.getPropertyValue('--bg-color').trim() || "#fff";
      const textColor = style.getPropertyValue('--text-color').trim() || "#000";

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();

      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      const minDim = Math.min(canvas.width, canvas.height);
      const labelFontSize = minDim * (textSizePercentage / 100);
      const equivFontSize = minDim * (equivSize / 100);
      const equivScaleY = equivLength / 100;
      const radius = minDim * (triangleSize / 100);
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

      ctx.font = `bold ${labelFontSize}px Verdana`;
      ctx.fillStyle = textColor;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let i = 0; i < 3; i++) {
        const { x, y, thetaRad } = vertices[i];
        ctx.save();
        ctx.translate(x, y);
        if (tangentialMode) {
          ctx.rotate(thetaRad + Math.PI / 2);
        }
        ctx.fillText(labels[i], 0, 0);
        ctx.restore();
      }

      for (let i = 0; i < 3; i++) {
        const p1 = vertices[i];
        const p2 = vertices[(i + 1) % 3];
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        const sideAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        ctx.save();
        ctx.translate(midX, midY);
        ctx.rotate(sideAngle);
        ctx.font = `bold ${equivFontSize}px Verdana`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const duplicateEnabled = document.getElementById('duplicateIdentisch').checked;
        if (duplicateEnabled) {
          const originalText = equivSymbol;
          const desiredSpacing = equivFontSize * 1.2;
          const offset = desiredSpacing / (equivLength / 100);
          ctx.scale(1, equivLength / 100);
          ctx.fillText(originalText, 0, -offset);
          ctx.fillText(originalText, 0, 0);
          ctx.fillText(originalText, 0, offset);
        } else {
          ctx.scale(1, equivLength / 100);
          ctx.fillText(equivSymbol, 0, 0);
        }
        ctx.restore();
      }
      ctx.restore();
      speedIndicator.textContent = 'Speed: ' + Math.round(rotationSpeed) + '°/Frame';
      requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
  }

  window.addEventListener('scroll', () => {
    const controls = document.getElementById('controls');
    if (window.scrollY === 0) {
      controls.style.display = 'flex';
    } else {
      controls.style.display = 'none';
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    injectStyles();
    createGraphic();
  });
})();
