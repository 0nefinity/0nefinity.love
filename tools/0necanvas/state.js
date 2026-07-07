/* 0necanvas state — window.OneCanvasState (Task B3)
 *
 * Scene <-> JSON <-> URL. Serialized scene lives in ?s= as base64url
 * (UTF-8 safe: TextEncoder before btoa, +/ -> -_ and no padding).
 * Writes are debounced (500ms) via history.replaceState. Everything is
 * fault-tolerant: a broken ?s= yields false + console.warn, a failing
 * replaceState (browser throttling) is caught and retried on next touch.
 *
 * See docs/superpowers/plans/2026-07-06-0necanvas-v1-plan.md section 5.
 */
(function () {
  'use strict';

  var DEBOUNCE_MS = 500;

  var boundScene = null;
  var timer = 0;

  /* ---------- base64url (UTF-8 safe) ---------- */

  function b64urlEncode(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    var CHUNK = 0x8000;
    for (var i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function b64urlDecode(str) {
    var b64 = String(str).replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  /* ---------- URL writing ---------- */

  function encodeScene(sc) {
    return b64urlEncode(JSON.stringify(sc.serialize()));
  }

  function buildUrl(sc) {
    var params = new URLSearchParams(location.search);
    params.set('s', encodeScene(sc));
    return location.origin + location.pathname + '?' + params.toString();
  }

  function writeNow() {
    timer = 0;
    if (!boundScene) return;
    try {
      history.replaceState(null, '', buildUrl(boundScene));
    } catch (e) {
      // replaceState can throw when the browser throttles it — the next
      // touch() will retry; the scene itself is unaffected
      console.warn('OneCanvasState: replaceState failed', e);
    }
  }

  function schedule() {
    if (!boundScene) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(writeNow, DEBOUNCE_MS);
  }

  /* ---------- public API ---------- */

  window.OneCanvasState = {

    // observe the scene: stack changes trigger a debounced URL write;
    // ui.js calls touch() after every param write (and camera moves)
    bind: function (sc) {
      boundScene = sc;
      sc.onStackChange(schedule);
    },

    touch: function () {
      schedule();
    },

    // true if a scene was loaded from ?s=; false (+ warn) on missing/broken
    loadFromUrl: function (sc) {
      var raw;
      try {
        raw = new URLSearchParams(location.search).get('s');
      } catch (e) {
        return false;
      }
      if (!raw) return false;
      try {
        var obj = JSON.parse(b64urlDecode(raw));
        sc.load(obj);
        return true;
      } catch (e) {
        console.warn('OneCanvasState: broken ?s= parameter, using default scene', e);
        return false;
      }
    },

    // drops ?s= from the address bar and cancels any pending debounced
    // write (used by the "Neu" reset — the next touch() re-persists)
    clearUrl: function () {
      if (timer) { clearTimeout(timer); timer = 0; }
      try {
        var params = new URLSearchParams(location.search);
        params.delete('s');
        var q = params.toString();
        history.replaceState(null, '', location.pathname + (q ? '?' + q : ''));
      } catch (e) {
        console.warn('OneCanvasState: clearUrl failed', e);
      }
    },

    // current share URL; serializes fresh so pending debounced changes
    // are included even before the timer fires
    shareUrl: function () {
      if (!boundScene) return location.href;
      try {
        var url = buildUrl(boundScene);
        // opportunistically sync the address bar with what was shared
        if (timer) { clearTimeout(timer); timer = 0; }
        try { history.replaceState(null, '', url); } catch (e2) { /* throttled — url is still valid */ }
        return url;
      } catch (e) {
        console.warn('OneCanvasState: shareUrl failed, returning current href', e);
        return location.href;
      }
    }
  };
})();
