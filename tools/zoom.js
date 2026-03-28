// tools/zoom.js - generischer 2D zoom + pan helper
(function (global) {

  const DEFAULT_CONFIG = {
    mode: 'relative',
    hoverFollowsPointer: false,
    hoverPointerTypes: ['mouse'],
    minScale: 1e-9,
    maxScale: 1e6,
    wheelSpeed: 0.15,
    pinchSensitivity: 1.0,
    wheelThrottleMs: 0,
    wheelDeltaThreshold: 0,
    enableDamping: false,
    dampingFactor: 0.12,
    externalDamping: false,
    initialScale: 1,
    initialOffsetX: 0,
    initialOffsetY: 0,
    shouldIgnoreWheel: null,
    shouldIgnoreDrag: null,
    shouldIgnoreTouchDrag: null,
    getScrollX: null,
    getScrollY: null,
  };

  function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
  }

  function createZoom2D(opts) {
    if (!opts || !opts.container) throw new Error('Zoom2D: container required');

    const container = opts.container;
    const content = opts.content || container;
    const cfg = Object.assign({}, DEFAULT_CONFIG, opts);
    const hoverFollowsPointer = cfg.hoverFollowsPointer || cfg.mode === 'absolute';
    const hoverPointerTypes = new Set(cfg.hoverPointerTypes || ['mouse']);

    let scale = clamp(cfg.initialScale, cfg.minScale, cfg.maxScale);
    let offsetX = cfg.initialOffsetX;
    let offsetY = cfg.initialOffsetY;

    let targetScale = scale;
    let targetOffsetX = offsetX;
    let targetOffsetY = offsetY;

    let lastWheelTime = 0;
    let animationFrameId = null;
    let isDragging = false;
    let lastX = 0;
    let lastY = 0;
    let pinch = { active: false, startDist: 0, worldX: 0, worldY: 0 };

    if (content && content.style && !content.style.transformOrigin) {
      content.style.transformOrigin = '0 0';
    }

    function getScrollX() {
      return typeof cfg.getScrollX === 'function' ? cfg.getScrollX() : 0;
    }

    function getScrollY() {
      return typeof cfg.getScrollY === 'function' ? cfg.getScrollY() : 0;
    }

    function applyTransform() {
      if (typeof opts.onTransform === 'function') {
        opts.onTransform({ scale, offsetX, offsetY });
      } else if (content && content.style) {
        content.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
      }
    }

    function hasMovement() {
      return Math.abs(scale - targetScale) > 0.0001
        || Math.abs(offsetX - targetOffsetX) > 0.01
        || Math.abs(offsetY - targetOffsetY) > 0.01;
    }

    function update() {
      if (!cfg.enableDamping) return false;

      if (hasMovement()) {
        scale += (targetScale - scale) * cfg.dampingFactor;
        offsetX += (targetOffsetX - offsetX) * cfg.dampingFactor;
        offsetY += (targetOffsetY - offsetY) * cfg.dampingFactor;
        applyTransform();
        return true;
      }

      scale = targetScale;
      offsetX = targetOffsetX;
      offsetY = targetOffsetY;
      applyTransform();
      return false;
    }

    function dampingLoop() {
      if (!cfg.enableDamping) return;

      if (update()) {
        animationFrameId = requestAnimationFrame(dampingLoop);
      } else {
        animationFrameId = null;
      }
    }

    function sync() {
      if (!cfg.enableDamping) {
        scale = targetScale;
        offsetX = targetOffsetX;
        offsetY = targetOffsetY;
        applyTransform();
        return;
      }

      if (cfg.externalDamping) return;
      if (!animationFrameId) {
        animationFrameId = requestAnimationFrame(dampingLoop);
      }
    }

    function screenToWorld(x, y) {
      const s = cfg.enableDamping ? targetScale : scale;
      const ox = cfg.enableDamping ? targetOffsetX : offsetX;
      const oy = cfg.enableDamping ? targetOffsetY : offsetY;
      return { x: (x - ox) / s, y: (y - oy) / s };
    }

    function zoomAt(screenX, screenY, factor) {
      const currentScale = cfg.enableDamping ? targetScale : scale;
      const newScale = clamp(currentScale * factor, cfg.minScale, cfg.maxScale);
      if (newScale === currentScale) return;

      const world = screenToWorld(screenX, screenY);
      targetScale = newScale;
      targetOffsetX = screenX - world.x * newScale;
      targetOffsetY = screenY - world.y * newScale;
      sync();
    }

    function setOffsets(nextOffsetX, nextOffsetY) {
      targetOffsetX = nextOffsetX;
      targetOffsetY = nextOffsetY;
      sync();
    }

    function onWheel(e) {
      if (typeof cfg.shouldIgnoreWheel === 'function' && cfg.shouldIgnoreWheel(e)) return;
      e.preventDefault();

      if (cfg.wheelDeltaThreshold > 0 && Math.abs(e.deltaY) < cfg.wheelDeltaThreshold) return;

      const now = performance.now();
      if (cfg.wheelThrottleMs > 0 && now - lastWheelTime < cfg.wheelThrottleMs) return;
      lastWheelTime = now;

      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left + getScrollX();
      const y = e.clientY - rect.top + getScrollY();
      const direction = e.deltaY > 0 ? -1 : 1;
      const factor = 1 + direction * cfg.wheelSpeed;
      if (factor <= 0) return;
      zoomAt(x, y, factor);
    }

    function onMouseDown(e) {
      if (e.button !== 0) return;
      if (typeof cfg.shouldIgnoreDrag === 'function' && cfg.shouldIgnoreDrag(e)) return;
      isDragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    }

    function onMouseMove(e) {
      if (isDragging) {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;
        targetOffsetX += dx;
        targetOffsetY += dy;
        sync();
        return;
      }

      if (!hoverFollowsPointer) return;
      if (!hoverPointerTypes.has('mouse')) return;

      const rect = container.getBoundingClientRect();
      setOffsets(
        e.clientX - rect.left + getScrollX(),
        e.clientY - rect.top + getScrollY()
      );
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
        const cx = (t0.clientX + t1.clientX) / 2 - rect.left + getScrollX();
        const cy = (t0.clientY + t1.clientY) / 2 - rect.top + getScrollY();
        const world = screenToWorld(cx, cy);
        const dx = t0.clientX - t1.clientX;
        const dy = t0.clientY - t1.clientY;

        pinch.active = true;
        pinch.startDist = Math.sqrt(dx * dx + dy * dy);
        pinch.worldX = world.x;
        pinch.worldY = world.y;
        isDragging = false;
        return;
      }

      if (e.touches.length === 1) {
        if (typeof cfg.shouldIgnoreTouchDrag === 'function' && cfg.shouldIgnoreTouchDrag(e)) {
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

        const rawFactor = newDist / pinch.startDist;
        const factor = 1 + (rawFactor - 1) * cfg.pinchSensitivity;
        const rect = container.getBoundingClientRect();
        const cx = (t0.clientX + t1.clientX) / 2 - rect.left + getScrollX();
        const cy = (t0.clientY + t1.clientY) / 2 - rect.top + getScrollY();
        const currentScale = cfg.enableDamping ? targetScale : scale;
        const newScale = clamp(currentScale * factor, cfg.minScale, cfg.maxScale);
        if (newScale === currentScale) return;

        targetScale = newScale;
        targetOffsetX = cx - pinch.worldX * newScale;
        targetOffsetY = cy - pinch.worldY * newScale;
        pinch.startDist = newDist;
        sync();
        return;
      }

      if (!pinch.active && e.touches.length === 1 && isDragging) {
        e.preventDefault();
        const t = e.touches[0];
        targetOffsetX += t.clientX - lastX;
        targetOffsetY += t.clientY - lastY;
        lastX = t.clientX;
        lastY = t.clientY;
        sync();
      }
    }

    function onTouchEnd(e) {
      if (e.touches.length < 2) {
        pinch.active = false;
      }
      if (e.touches.length === 0) {
        isDragging = false;
      }
    }

    function getState() {
      return { scale, offsetX, offsetY };
    }

    function setView(newState, animate) {
      if (!newState) return;

      const newScale = typeof newState.scale === 'number'
        ? clamp(newState.scale, cfg.minScale, cfg.maxScale)
        : (cfg.enableDamping ? targetScale : scale);
      const newOffsetX = typeof newState.offsetX === 'number'
        ? newState.offsetX
        : (cfg.enableDamping ? targetOffsetX : offsetX);
      const newOffsetY = typeof newState.offsetY === 'number'
        ? newState.offsetY
        : (cfg.enableDamping ? targetOffsetY : offsetY);

      if (cfg.enableDamping && animate !== false) {
        targetScale = newScale;
        targetOffsetX = newOffsetX;
        targetOffsetY = newOffsetY;
        sync();
        return;
      }

      scale = newScale;
      offsetX = newOffsetX;
      offsetY = newOffsetY;
      targetScale = newScale;
      targetOffsetX = newOffsetX;
      targetOffsetY = newOffsetY;
      applyTransform();
    }

    function zoomBy(factor) {
      const rect = container.getBoundingClientRect();
      zoomAt(rect.width / 2, rect.height / 2, factor);
    }

    function zoomIn() {
      zoomBy(1 + cfg.wheelSpeed * 2);
    }

    function zoomOut() {
      zoomBy(1 - cfg.wheelSpeed * 2);
    }

    function reset() {
      setView({
        scale: cfg.initialScale,
        offsetX: cfg.initialOffsetX,
        offsetY: cfg.initialOffsetY
      });
    }

    function destroy() {
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
      container.removeEventListener('touchcancel', onTouchEnd);
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
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

    return {
      destroy,
      getScale: () => (cfg.enableDamping ? targetScale : scale),
      getState,
      setView,
      zoomIn,
      zoomOut,
      zoomBy,
      reset,
      update,
    };
  }

  global.Zoom2D = { createZoom2D };
})(typeof window !== 'undefined' ? window : this);
