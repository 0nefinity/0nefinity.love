// tools/zoom.js - minimal generic 2D zoom + pan helper
// Mit optionalem Damping (sanftes Easing wie OrbitControls)
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

    // Damping (sanftes Easing)
    enableDamping: false,        // true = sanftes Gleiten, false = sofortige Änderung
    dampingFactor: 0.12,         // 0.05 = sehr sanft, 0.2 = schnell (wie OrbitControls)
    externalDamping: false,      // true = kein interner rAF-Loop, update() muss extern aufgerufen werden

    // Initiale Werte
    initialScale: 1,
    initialOffsetX: 0,
    initialOffsetY: 0,
    shouldIgnoreWheel: null,     // Callback (e) => boolean, true = ignoriere Wheel-Event
    getScrollX: null,            // Callback () => number, optionaler horizontaler Scroll-Offset
    getScrollY: null,            // Callback () => number, optionaler vertikaler Scroll-Offset
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
    const enableDamping = cfg.enableDamping;
    const dampingFactor = cfg.dampingFactor;
    const externalDamping = cfg.externalDamping;

    // Aktuelle Werte (werden bei Damping interpoliert)
    let scale = clamp(cfg.initialScale, minScale, maxScale);
    let offsetX = cfg.initialOffsetX;
    let offsetY = cfg.initialOffsetY;

    // Target-Werte (wohin wir wollen - für Damping)
    let targetScale = scale;
    let targetOffsetX = offsetX;
    let targetOffsetY = offsetY;

    let lastWheelTime = 0;
    let animationFrameId = null;

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

    // Damping Animation Loop
    function dampingLoop() {
      if (!enableDamping) return;

      const scaleChanged = Math.abs(scale - targetScale) > 0.0001;
      const offsetChanged = Math.abs(offsetX - targetOffsetX) > 0.01 ||
                            Math.abs(offsetY - targetOffsetY) > 0.01;

      if (scaleChanged || offsetChanged) {
        // Interpoliere zum Target
        scale += (targetScale - scale) * dampingFactor;
        offsetX += (targetOffsetX - offsetX) * dampingFactor;
        offsetY += (targetOffsetY - offsetY) * dampingFactor;
        applyTransform();
        animationFrameId = requestAnimationFrame(dampingLoop);
      } else {
        // Snap zu exakten Werten wenn nahe genug
        scale = targetScale;
        offsetX = targetOffsetX;
        offsetY = targetOffsetY;
        animationFrameId = null;
      }
    }

    function startDampingLoop() {
      // Bei externalDamping: kein interner Loop, update() wird extern aufgerufen
      if (externalDamping) return;

      if (enableDamping && !animationFrameId) {
        animationFrameId = requestAnimationFrame(dampingLoop);
      }
    }

    // Externe Update-Funktion für Integration in bestehende Animations-Loops
    // Gibt true zurück wenn noch Bewegung stattfindet
    function update() {
      if (!enableDamping) return false;

      const scaleChanged = Math.abs(scale - targetScale) > 0.0001;
      const offsetChanged = Math.abs(offsetX - targetOffsetX) > 0.01 ||
                            Math.abs(offsetY - targetOffsetY) > 0.01;

      if (scaleChanged || offsetChanged) {
        scale += (targetScale - scale) * dampingFactor;
        offsetX += (targetOffsetX - offsetX) * dampingFactor;
        offsetY += (targetOffsetY - offsetY) * dampingFactor;
        applyTransform();
        return true; // Noch in Bewegung
      } else {
        // Snap zu exakten Werten
        scale = targetScale;
        offsetX = targetOffsetX;
        offsetY = targetOffsetY;
        return false; // Fertig
      }
    }

    function screenToWorld(x, y) {
      // Bei Damping: Target-Werte für Berechnungen nutzen
      const s = enableDamping ? targetScale : scale;
      const ox = enableDamping ? targetOffsetX : offsetX;
      const oy = enableDamping ? targetOffsetY : offsetY;
      return { x: (x - ox) / s, y: (y - oy) / s };
    }

    function zoomAt(screenX, screenY, factor) {
      const currentScale = enableDamping ? targetScale : scale;
      const currentOffsetX = enableDamping ? targetOffsetX : offsetX;
      const currentOffsetY = enableDamping ? targetOffsetY : offsetY;

      const newScale = clamp(currentScale * factor, minScale, maxScale);
      if (newScale === currentScale) return;

      const w = screenToWorld(screenX, screenY);
      const newOffsetX = screenX - w.x * newScale;
      const newOffsetY = screenY - w.y * newScale;

      if (enableDamping) {
        targetScale = newScale;
        targetOffsetX = newOffsetX;
        targetOffsetY = newOffsetY;
        startDampingLoop();
      } else {
        scale = newScale;
        offsetX = newOffsetX;
        offsetY = newOffsetY;
        applyTransform();
      }
    }

    function onWheel(e) {
      if (typeof cfg.shouldIgnoreWheel === 'function' && cfg.shouldIgnoreWheel(e)) {
        return;
      }
      e.preventDefault();

      // Ignoriere Momentum-Scrolling (kleine Delta-Werte nach dem eigentlichen Scroll)
      if (Math.abs(e.deltaY) < wheelDeltaThreshold) return;

      // Throttle: Verhindert zu schnelles Nachzoomen
      const now = performance.now();
      if (now - lastWheelTime < wheelThrottleMs) return;
      lastWheelTime = now;

      const rect = container.getBoundingClientRect();
      const scrollX = typeof cfg.getScrollX === 'function' ? cfg.getScrollX() : 0;
      const scrollY = typeof cfg.getScrollY === 'function' ? cfg.getScrollY() : 0;
      const x = e.clientX - rect.left + scrollX;
      const y = e.clientY - rect.top + scrollY;

      // Nur die Richtung des Scrollens nutzen, nicht die rohe Delta-Größe,
      // damit das Verhalten konsistenter ist (wie bei bibelaufnpunkt).
      const direction = e.deltaY > 0 ? -1 : 1;
      const factor = 1 + direction * wheelSpeed;
      if (factor <= 0) return;
      zoomAt(x, y, factor);
    }

    function onMouseDown(e) {
      if (e.button !== 0) return;
      // Optional: Callback um Drag zu blockieren (z.B. für Epicycle-Handle)
      if (typeof opts.shouldIgnoreDrag === 'function' && opts.shouldIgnoreDrag(e)) {
        return;
      }
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

      if (enableDamping) {
        targetOffsetX += dx;
        targetOffsetY += dy;
        startDampingLoop();
      } else {
        offsetX += dx;
        offsetY += dy;
        applyTransform();
      }
    }

    function onMouseUp() {
      isDragging = false;
    }

    function onTouchStart(e) {
      if (e.touches.length === 2) {
        e.preventDefault();
        const t0 = e.touches[0];
        const t1 = e.touches[1];
        const rect = container.getBoundingClientRect();
        const scrollX = typeof cfg.getScrollX === 'function' ? cfg.getScrollX() : 0;
        const scrollY = typeof cfg.getScrollY === 'function' ? cfg.getScrollY() : 0;
        const cx = (t0.clientX + t1.clientX) / 2 - rect.left + scrollX;
        const cy = (t0.clientY + t1.clientY) / 2 - rect.top + scrollY;
        const w = screenToWorld(cx, cy);
        const dx = t0.clientX - t1.clientX;
        const dy = t0.clientY - t1.clientY;
        pinch.active = true;
        pinch.startDist = Math.sqrt(dx * dx + dy * dy);
        pinch.worldX = w.x;
        pinch.worldY = w.y;
      } else if (e.touches.length === 1) {
        if (typeof opts.shouldIgnoreTouchDrag === 'function' && opts.shouldIgnoreTouchDrag(e)) {
          isDragging = false;
          return;
        }
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
        const scrollX = typeof cfg.getScrollX === 'function' ? cfg.getScrollX() : 0;
        const scrollY = typeof cfg.getScrollY === 'function' ? cfg.getScrollY() : 0;
        const cx = (t0.clientX + t1.clientX) / 2 - rect.left + scrollX;
        const cy = (t0.clientY + t1.clientY) / 2 - rect.top + scrollY;

        const currentScale = enableDamping ? targetScale : scale;
        const newScale = clamp(currentScale * factor, minScale, maxScale);
        if (newScale === currentScale) return;

        if (enableDamping) {
          targetScale = newScale;
          targetOffsetX = cx - pinch.worldX * newScale;
          targetOffsetY = cy - pinch.worldY * newScale;
          startDampingLoop();
        } else {
          scale = newScale;
          offsetX = cx - pinch.worldX * scale;
          offsetY = cy - pinch.worldY * scale;
          applyTransform();
        }
        pinch.startDist = newDist;
      } else if (!pinch.active && e.touches.length === 1 && isDragging) {
        e.preventDefault();
        const t = e.touches[0];
        const dx = t.clientX - lastX;
        const dy = t.clientY - lastY;
        lastX = t.clientX;
        lastY = t.clientY;

        if (enableDamping) {
          targetOffsetX += dx;
          targetOffsetY += dy;
          startDampingLoop();
        } else {
          offsetX += dx;
          offsetY += dy;
          applyTransform();
        }
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

    function setView(newState, animate) {
      if (!newState) return;

      const newScale = typeof newState.scale === 'number'
        ? clamp(newState.scale, minScale, maxScale)
        : (enableDamping ? targetScale : scale);
      const newOffsetX = typeof newState.offsetX === 'number'
        ? newState.offsetX
        : (enableDamping ? targetOffsetX : offsetX);
      const newOffsetY = typeof newState.offsetY === 'number'
        ? newState.offsetY
        : (enableDamping ? targetOffsetY : offsetY);

      if (enableDamping && animate !== false) {
        targetScale = newScale;
        targetOffsetX = newOffsetX;
        targetOffsetY = newOffsetY;
        startDampingLoop();
      } else {
        scale = newScale;
        offsetX = newOffsetX;
        offsetY = newOffsetY;
        if (enableDamping) {
          targetScale = scale;
          targetOffsetX = offsetX;
          targetOffsetY = offsetY;
        }
        applyTransform();
      }
    }

    // Zoom um einen Faktor zur Bildschirmmitte
    function zoomBy(factor) {
      const rect = container.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      zoomAt(centerX, centerY, factor);
    }

    // Zoom In (für Button)
    function zoomIn() {
      zoomBy(1 + wheelSpeed * 2);
    }

    // Zoom Out (für Button)
    function zoomOut() {
      zoomBy(1 - wheelSpeed * 2);
    }

    // Reset zur Ausgangsposition
    function reset() {
      setView({
        scale: cfg.initialScale,
        offsetX: cfg.initialOffsetX,
        offsetY: cfg.initialOffsetY
      });
    }

    return {
      destroy,
      getScale: function () { return enableDamping ? targetScale : scale; },
      getState,
      setView,
      zoomIn,
      zoomOut,
      zoomBy,
      reset,
      update  // Für externe Damping-Integration
    };
  }

  global.Zoom2D = { createZoom2D };
})(typeof window !== 'undefined' ? window : this);

