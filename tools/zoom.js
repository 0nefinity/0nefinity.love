// tools/zoom.js - minimal generic 2D zoom + pan helper
(function (global) {

  // ═══════════════════════════════════════════════════════════════════════════
  // DEFAULT CONFIG - Diese Werte werden verwendet wenn nichts übergeben wird
  // ═══════════════════════════════════════════════════════════════════════════
  const DEFAULT_CONFIG = {
    // Zoom-Grenzen
    minScale: 1e-9,              // Minimaler Zoom (sehr weit rausgezoomt)
    maxScale: 1e6,               // Maximaler Zoom (sehr nah rangezoomt)

    // Zoom-Geschwindigkeit
    wheelSpeed: 0.15,            // Zoom-Faktor pro Scroll-Tick (0.01 = langsam, 0.2 = schnell)
    pinchSensitivity: 1.0,       // Multiplikator für Pinch-Zoom (1.0 = normal)

    // Anti-Momentum (verhindert Nachziehen)
    wheelThrottleMs: 80,         // Min. ms zwischen Zoom-Schritten (0 = kein Throttle)
    wheelDeltaThreshold: 10,     // Ignoriere Delta unter diesem Wert (filtert Momentum)

    // Initiale Werte
    initialScale: 1,
    initialOffsetX: 0,
    initialOffsetY: 0,
  };
  // ═══════════════════════════════════════════════════════════════════════════

  function clamp(v, min, max) { return v < min ? min : v > max ? max : v; }

  function createZoom2D(opts) {
    if (!opts) throw new Error('createZoom2D: options required');
    const container = opts.container;
    const content = opts.content || container;
    if (!container) throw new Error('createZoom2D: container required');

    // Config mit Defaults mergen
    const cfg = Object.assign({}, DEFAULT_CONFIG, opts);

    const minScale = cfg.minScale;
    const maxScale = cfg.maxScale;
    const wheelSpeed = cfg.wheelSpeed;
    const pinchSensitivity = cfg.pinchSensitivity;
    const wheelThrottleMs = cfg.wheelThrottleMs;
    const wheelDeltaThreshold = cfg.wheelDeltaThreshold;

    let scale = clamp(cfg.initialScale, minScale, maxScale);
    let offsetX = cfg.initialOffsetX;
    let offsetY = cfg.initialOffsetY;
    let lastWheelTime = 0;

    if (content && content.style && !content.style.transformOrigin) {
      content.style.transformOrigin = '0 0';
    }

    let isDragging = false, lastX = 0, lastY = 0;
    let pinch = { active: false, startDist: 0, worldX: 0, worldY: 0 };

    function applyTransform() {
      if (typeof opts.onTransform === 'function') {
        opts.onTransform({ scale, offsetX, offsetY });
      } else if (content && content.style) {
        content.style.transform = 'translate(' + offsetX + 'px,' + offsetY + 'px) scale(' + scale + ')';
      }
    }

    function screenToWorld(x, y) {
      return { x: (x - offsetX) / scale, y: (y - offsetY) / scale };
    }

    function zoomAt(screenX, screenY, factor) {
      const newScale = clamp(scale * factor, minScale, maxScale);
      if (newScale === scale) return;
      const w = screenToWorld(screenX, screenY);
      scale = newScale;
      offsetX = screenX - w.x * scale;
      offsetY = screenY - w.y * scale;
      applyTransform();
    }

    function onWheel(e) {
      e.preventDefault();

      // Ignoriere Momentum-Scrolling (kleine Delta-Werte nach dem eigentlichen Scroll)
      if (Math.abs(e.deltaY) < wheelDeltaThreshold) return;

      // Throttle: Verhindert zu schnelles Nachzoomen
      const now = performance.now();
      if (now - lastWheelTime < wheelThrottleMs) return;
      lastWheelTime = now;

      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Nur die Richtung des Scrollens nutzen, nicht die rohe Delta-Größe,
      // damit das Verhalten konsistenter ist (wie bei bibelaufnpunkt).
      const direction = e.deltaY > 0 ? -1 : 1;
      const factor = 1 + direction * wheelSpeed;
      if (factor <= 0) return;
      zoomAt(x, y, factor);
    }

    function onMouseDown(e) {
      if (e.button !== 0) return;
      isDragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    }

    function onMouseMove(e) {
      if (!isDragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      offsetX += dx;
      offsetY += dy;
      applyTransform();
    }

    function onMouseUp(e) {
      isDragging = false;
    }

    function onTouchStart(e) {
      if (e.touches.length === 2) {
        e.preventDefault();
        const t0 = e.touches[0];
        const t1 = e.touches[1];
        const rect = container.getBoundingClientRect();
        const cx = (t0.clientX + t1.clientX) / 2 - rect.left;
        const cy = (t0.clientY + t1.clientY) / 2 - rect.top;
        const w = screenToWorld(cx, cy);
        const dx = t0.clientX - t1.clientX;
        const dy = t0.clientY - t1.clientY;
        pinch.active = true;
        pinch.startDist = Math.sqrt(dx * dx + dy * dy);
        pinch.worldX = w.x;
        pinch.worldY = w.y;
      } else if (e.touches.length === 1) {
        e.preventDefault();
        isDragging = true;
        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;
      }
    }

    function onTouchMove(e) {
      if (pinch.active && e.touches.length === 2) {
        e.preventDefault();
        const t0 = e.touches[0];
        const t1 = e.touches[1];
        const dx = t0.clientX - t1.clientX;
        const dy = t0.clientY - t1.clientY;
        const newDist = Math.sqrt(dx * dx + dy * dy);
        if (pinch.startDist <= 0) return;
        // pinchSensitivity: 1.0 = normal, >1 = empfindlicher, <1 = träger
        const rawFactor = newDist / pinch.startDist;
        const factor = 1 + (rawFactor - 1) * pinchSensitivity;
        const rect = container.getBoundingClientRect();
        const cx = (t0.clientX + t1.clientX) / 2 - rect.left;
        const cy = (t0.clientY + t1.clientY) / 2 - rect.top;
        const newScale = clamp(scale * factor, minScale, maxScale);
        if (newScale === scale) return;
        scale = newScale;
        offsetX = cx - pinch.worldX * scale;
        offsetY = cy - pinch.worldY * scale;
        pinch.startDist = newDist;
        applyTransform();
      } else if (!pinch.active && e.touches.length === 1 && isDragging) {
        e.preventDefault();
        const t = e.touches[0];
        const dx = t.clientX - lastX;
        const dy = t.clientY - lastY;
        lastX = t.clientX;
        lastY = t.clientY;
        offsetX += dx;
        offsetY += dy;
        applyTransform();
      }
    }

    function onTouchEnd(e) {
      if (e.touches.length === 0) {
        isDragging = false;
        pinch.active = false;
      }
    }

    container.addEventListener('wheel', onWheel, { passive: false });
    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    container.addEventListener('touchstart', onTouchStart, { passive: false });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd);
    container.addEventListener('touchcancel', onTouchEnd);

    applyTransform();

    function destroy() {
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
      container.removeEventListener('touchcancel', onTouchEnd);
    }

    function getState() {
      return { scale, offsetX, offsetY };
    }

    function setView(newState) {
      if (!newState) return;
      if (typeof newState.scale === 'number') {
        scale = clamp(newState.scale, minScale, maxScale);
      }
      if (typeof newState.offsetX === 'number') {
        offsetX = newState.offsetX;
      }
      if (typeof newState.offsetY === 'number') {
        offsetY = newState.offsetY;
      }
      applyTransform();
    }

    return {
      destroy,
      getScale: function () { return scale; },
      getState,
      setView
    };
  }

  global.Zoom2D = { createZoom2D };
})(typeof window !== 'undefined' ? window : this);

