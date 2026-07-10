/* 0necanvas ui — window.OneCanvasUI
 *
 * Stack panel (drag-reorder, eye, delete), properties panel via
 * tools/controls.js (Controls.createPanel — the original panel used across
 * the site: drag, bar mode, steppers with hold-repeat, free value input,
 * ⋮ min/max/step popup, own select popup, mobile bottom sheet),
 * library overlay (3 tabs), tools move/warp/draw with full pointer gestures
 * (block drag, pan, wheel zoom on cursor, pinch, freehand strokes),
 * share/fullscreen,
 * mobile sheet, default scene, instance-limit pill.
 * Plan: docs/superpowers/plans/2026-07-06-0necanvas-v1-plan.md section 6.
 *
 * Robustness notes:
 * - Block schemas are built in parallel tasks; param keys of sibling modules
 *   are resolved via candidate lists (see setParam / setWarpCenter /
 *   buildDefaultScene) so key drift degrades gracefully instead of breaking.
 * - OneCanvasState is optional at runtime; every call is guarded.
 */
(function () {
  'use strict';

  var KIND_LABEL = { ding: 'Ding', erzeuger: 'Erzeuger', kraft: 'Kraft' };
  var CAT_LABEL = { ding: 'Dinge', erzeuger: 'Erzeuger', kraft: 'Kräfte' };
  var CAT_ORDER = ['ding', 'erzeuger', 'kraft'];
  var CAT_DESC = {
    ding: 'sichtbare Formen',
    erzeuger: 'lassen laufend Neues entstehen',
    kraft: 'verwandeln alles darunter'
  };
  var ZOOM_MIN = 0.05;
  var ZOOM_MAX = 50;
  var TAP_SLOP_PX = 5;
  var IDLE_MS = 3500;

  /* ---------- Icon-Grammatik (Strahl-Semantik) ----------
   * Eine Sprache: 1.4er-Strich, geometrisch.
   * Dinge = massiv, Erzeuger = ausstrahlend, Kräfte = Linsenring.
   * Rein visuelle Zuordnung per type — blocks-*.js bleiben unangetastet,
   * unbekannte Typen fallen auf def.icon (Textglyphe) zurück. */
  function svgIcon(inner) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + inner + '</svg>';
  }
  function spiralPathD(cx, cy, rmax, turns) {
    var p = 'M' + cx + ' ' + cy;
    var n = 64;
    for (var i = 1; i <= n; i++) {
      var f = i / n;
      var a = f * turns * Math.PI * 2;
      var r = f * rmax;
      p += ' L' + (cx + Math.cos(a) * r).toFixed(2) + ' ' + (cy + Math.sin(a) * r).toFixed(2);
    }
    return p;
  }
  var ICON_LENS = '<circle cx="12" cy="12" r="9.3" opacity="0.5"/>';
  var TYPE_ICONS = {
    gitter: svgIcon('<path d="M4.5 9h15M4.5 15h15M9 4.5v15M15 4.5v15"/>'),
    kurve: svgIcon('<path d="M12 19.4C6.3 14.8 4.7 11 6.5 8.4c1.6-2.3 4.3-1.9 5.5.7 1.2-2.6 3.9-3 5.5-.7 1.8 2.6.2 6.4-5.5 11z"/>'),
    symbol: svgIcon('<path d="M12 12c-1.5-2.1-2.9-3.2-4.5-3.2a3.2 3.2 0 1 0 0 6.4c1.6 0 3-1.1 4.5-3.2 1.5 2.1 2.9 3.2 4.5 3.2a3.2 3.2 0 1 0 0-6.4c-1.6 0-3 1.1-4.5 3.2z"/>'),
    pfad: svgIcon('<path d="M4 17C7 7.5 10 19 13.5 11.5 15.4 7.4 18 9.2 20 6.6"/>'),
    textpunkte: svgIcon('<g fill="currentColor" stroke="none"><circle cx="5.5" cy="7" r="1.15"/><circle cx="9.8" cy="7" r="1.15"/><circle cx="14.2" cy="7" r="1.15"/><circle cx="18.5" cy="7" r="1.15"/><circle cx="12" cy="11" r="1.15"/><circle cx="12" cy="15" r="1.15"/><circle cx="12" cy="19" r="1.15"/></g>'),
    linienschar: svgIcon('<path d="M4 20l16-4.5M4 16l16-6.5M4 11.5L20 5M4 7l10-2.6"/>'),
    spirale: svgIcon('<path d="' + spiralPathD(12, 12, 8.6, 2.6) + '"/>'),
    ringschrift: svgIcon('<circle cx="12" cy="12" r="7.6" stroke-dasharray="2.3 3.1"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/>'),
    spawner: svgIcon('<circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><path d="M12 6.5V4M12 20v-2.5M6.5 12H4M20 12h-2.5M8.1 8.1L6.4 6.4M15.9 8.1l1.7-1.7M8.1 15.9l-1.7 1.7M15.9 15.9l1.7 1.7"/>'),
    zellautomat: svgIcon('<rect x="4.5" y="4.5" width="6.4" height="6.4" rx="1"/><rect x="13.1" y="13.1" width="6.4" height="6.4" rx="1"/><rect x="13.1" y="4.5" width="6.4" height="6.4" rx="1" fill="currentColor" stroke="none" opacity="0.9"/><rect x="4.5" y="13.1" width="6.4" height="6.4" rx="1" stroke-dasharray="2 2.2" opacity="0.55"/>'),
    strahlen: svgIcon('<circle cx="5" cy="19" r="1.5" fill="currentColor" stroke="none"/><path d="M7 17L18.5 5.5M7.6 18.3L20 12.5M6 16.2L13.5 4.5"/>'),
    textbaum: svgIcon('<path d="M12 20.5v-6.2M12 14.3c0-3.1-3.1-3-3.1-6.1M12 14.3c0-3.1 3.1-3 3.1-6.1M8.9 8.2c0-2.2-1.6-2.2-1.6-4.4M8.9 8.2c0-2.2 1.6-2.2 1.6-4.4M15.1 8.2c0-2.2-1.6-2.2-1.6-4.4M15.1 8.2c0-2.2 1.6-2.2 1.6-4.4"/>'),
    fourier: svgIcon('<circle cx="10" cy="13.4" r="6.1"/><circle cx="14.9" cy="9.8" r="3"/><circle cx="17.5" cy="8.2" r="1.15" fill="currentColor" stroke="none"/><path d="M17.5 8.2c2.1 2.5 1.7 6.2-.4 8.9" stroke-dasharray="2 2.4" opacity="0.7"/>'),
    verzerren: svgIcon(ICON_LENS + '<path d="M7.6 8.4c2.2 1.5 6.6 1.5 8.8 0M7.6 12c2.2-1.5 6.6-1.5 8.8 0M7.6 15.6c2.2 1.5 6.6 1.5 8.8 0"/>'),
    fraktal: svgIcon(ICON_LENS + '<path d="M12 6.8l4.5 7.8h-9z"/><path d="M12 10.4l2.2 3.8H9.8z" opacity="0.6"/>'),
    kaleidoskop: svgIcon(ICON_LENS + '<path d="M12 3.6v16.8M4.7 7.8l14.6 8.4M19.3 7.8L4.7 16.2" opacity="0.85"/>'),
    tapete: svgIcon(ICON_LENS + '<g fill="currentColor" stroke="none"><circle cx="9.2" cy="9.2" r="1.2"/><circle cx="14.8" cy="9.2" r="1.2"/><circle cx="9.2" cy="14.8" r="1.2"/><circle cx="14.8" cy="14.8" r="1.2"/></g>')
  };
  var ICON_EYE = svgIcon('<path d="M3.5 12S6.8 6.9 12 6.9 20.5 12 20.5 12 17.2 17.1 12 17.1 3.5 12 3.5 12z"/><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/>');

  /* Flüstersätze — Bibliotheks-Copy je Baustein-Typ */
  var TYPE_WHISPER = {
    gitter: 'Raum, der sich zeigt.',
    kurve: 'Vom Kreis zum Herzen — dieselbe Linie.',
    symbol: 'Ein Zeichen: 0, 1 oder ∞.',
    pfad: 'Deine Hand, festgehalten.',
    textpunkte: 'Worte, in Punkte zerlegt.',
    linienschar: 'Viele Geraden, eine Hüllkurve.',
    spirale: 'Der Weg nach innen ist der Weg nach außen.',
    ringschrift: 'Schrift ohne Anfang und Ende.',
    spawner: 'Aus einem Punkt: viele.',
    zellautomat: 'Zellen: 0 wird 1 wird 0.',
    strahlen: 'Licht verlässt den Ursprung.',
    textbaum: 'Ein Wort verzweigt sich.',
    fourier: 'Kreise auf Kreisen zeichnen alles.',
    verzerren: 'Der Raum gibt nach.',
    fraktal: 'Das Ganze im Teil.',
    kaleidoskop: 'Eins wird viele, symmetrisch.',
    tapete: 'Ein Motiv, unendlich fortgesetzt.'
  };

  // SVG-Icon (Grammatik) oder Fallback auf die def.icon-Textglyphe
  function setTypeIcon(el, def) {
    var svg = def && TYPE_ICONS[def.type];
    if (svg) el.innerHTML = svg;
    else el.textContent = (def && def.icon) || '◆';
  }

  var scene = null;
  var els = {};
  var tool = 'move';
  var toastEl = null;
  var toastTimer = 0;
  var suppressRowClickUntil = 0;
  // Auswahl kam von einem Canvas-Tap (nicht Stapel/Bibliothek): dann zeigt
  // nur der Chip am Objekt — das Regler-Panel öffnet erst auf Wunsch
  var selectViaCanvas = false;

  /* ---------- small helpers ---------- */

  function $(id) { return document.getElementById(id); }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function hasKey(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  // select entry.options may be an array OR a function returning one —
  // evaluated lazily at panel build so late-registered types are listed
  function entryOptions(entry) {
    var o = entry && entry.options;
    if (typeof o === 'function') {
      try { o = o(); } catch (e) {
        console.warn('0necanvas ui: options() failed for key "' + (entry && entry.key) + '"', e);
        o = null;
      }
    }
    return Array.isArray(o) ? o : [];
  }

  // new things/emitters (library tiles AND drawn paths) slot in BELOW the
  // contiguous force group at the top of the stack, so existing forces act
  // on them; forces themselves keep landing on top. Expects the block to
  // be the topmost entry (fresh scene.add).
  function slotBelowTopForces(block) {
    var forces = 0;
    for (var j = scene.blocks.length - 2; j >= 0; j--) {
      var d2 = scene.defs.get(scene.blocks[j].type);
      if (d2 && d2.kind === 'kraft') forces++;
      else break;
    }
    if (forces > 0) scene.move(block.id, scene.blocks.length - 1 - forces);
  }

  function getBlock(id) {
    if (!id) return null;
    for (var i = 0; i < scene.blocks.length; i++) {
      if (scene.blocks[i].id === id) return scene.blocks[i];
    }
    return null;
  }

  function touchState() {
    if (window.OneCanvasState && typeof OneCanvasState.touch === 'function') {
      try { OneCanvasState.touch(); } catch (e) { console.warn('0necanvas ui: state touch failed', e); }
    }
  }

  // set the first existing candidate key on block.params
  function setParam(block, candidates, value) {
    if (!block) return false;
    for (var i = 0; i < candidates.length; i++) {
      if (hasKey(block.params, candidates[i])) {
        block.params[candidates[i]] = value;
        return true;
      }
    }
    return false;
  }

  // reconstruct the engine's per-frame view object for hit()/drag() calls;
  // selectedId lets blocks expose extra handles only while selected (pfad)
  function makeView() {
    var r = els.canvas.getBoundingClientRect();
    var s = scene.camera.scale;
    var halfW = r.width / 2 / s;
    var halfH = r.height / 2 / s;
    return {
      w: r.width,
      h: r.height,
      dpr: Math.min(window.devicePixelRatio || 1, 2),
      scale: s,
      left: scene.camera.x - halfW,
      right: scene.camera.x + halfW,
      top: scene.camera.y - halfH,
      bottom: scene.camera.y + halfH,
      selectedId: scene.selectedId
    };
  }

  function canvasPoint(ev) {
    var r = els.canvas.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top, w: r.width, h: r.height };
  }

  /* ---------- toast ---------- */

  // toast('msg') or toast('msg', { action: 'Rückgängig', onAction: fn, ms: 5000 })
  function toast(msg, opts) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'oc-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = '';
    toastEl.appendChild(document.createTextNode(msg));
    var hasAction = !!(opts && opts.action && typeof opts.onAction === 'function');
    toastEl.classList.toggle('has-action', hasAction);
    if (hasAction) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'toast-action';
      btn.textContent = opts.action;
      btn.addEventListener('click', function () {
        clearTimeout(toastTimer);
        toastEl.classList.remove('show', 'has-action');
        opts.onAction();
      });
      toastEl.appendChild(btn);
    }
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('show', 'has-action');
    }, (opts && opts.ms) || 1600);
  }

  /* ---------- stack panel (Strahl: Blick oben, 0 unten) ---------- */

  function blockKind(block) {
    var def = scene.defs.get(block.type);
    return def ? def.kind : 'ding';
  }

  // how many visible forces lie ABOVE block index i (array is bottom-up:
  // above = larger index); they all act on block i
  function forcesAbove(i) {
    var n = 0;
    for (var j = i + 1; j < scene.blocks.length; j++) {
      var b = scene.blocks[j];
      if (b.visible && blockKind(b) === 'kraft') n++;
    }
    return n;
  }

  function renderStack() {
    var list = els.stackList;
    list.innerHTML = '';
    // display reversed: top of the stack is the first row
    for (var i = scene.blocks.length - 1; i >= 0; i--) {
      list.appendChild(buildStackRow(scene.blocks[i], i));
    }
    renderSpine();
    renderMiniBeam();
    updateScopeMarks();
    if (els.stackN) els.stackN.textContent = scene.blocks.length;
    updateRibbon(); // Position "n von m" / Feld-Zeile ändern sich mit dem Stapel
    updateHullOverlay(); // Chip-Inhalt/Sichtbarkeit hängt am Stapel
  }

  // kollabierter Stapel: Glyphen-Spine am rechten Rand
  function renderSpine() {
    if (!els.spineList) return;
    els.spineList.innerHTML = '';
    for (var i = scene.blocks.length - 1; i >= 0; i--) {
      (function (block) {
        var def = scene.defs.get(block.type);
        var kind = def ? def.kind : 'ding';
        var v = document.createElement('button');
        v.type = 'button';
        v.className = 'vertebra ' + kind
          + (block.id === scene.selectedId ? ' selected' : '')
          + (block.visible ? '' : ' hidden-block');
        setTypeIcon(v, def);
        v.title = (KIND_LABEL[kind] || kind) + ' — ' + block.name;
        v.setAttribute('aria-label', v.title);
        v.dataset.id = block.id;
        v.addEventListener('click', function (e) {
          e.stopPropagation();
          openStackPanel();
          scene.select(block.id);
        });
        els.spineList.appendChild(v);
      })(scene.blocks[i]);
    }
  }

  function pulseSpine(id) {
    if (!els.spineList) return;
    var v = els.spineList.querySelector('[data-id="' + id + '"]');
    if (!v) return;
    v.classList.add('pulse');
    setTimeout(function () { v.classList.remove('pulse'); }, 950);
  }

  // Mini-Strahl im Sheet-Griff (mobiler Peek-Zustand): Blick — Glieder — 0
  function renderMiniBeam() {
    if (!els.minibeam) return;
    var mb = els.minibeam;
    mb.innerHTML = '';
    function line() {
      var l = document.createElement('span');
      l.className = 'mb-line';
      mb.appendChild(l);
    }
    var eye = document.createElement('span');
    eye.className = 'mb-eye';
    eye.innerHTML = ICON_EYE;
    mb.appendChild(eye);
    line();
    for (var i = scene.blocks.length - 1; i >= 0; i--) {
      var b = scene.blocks[i];
      var dot = document.createElement('i');
      dot.className = 'mb-dot ' + blockKind(b)
        + (b.id === scene.selectedId ? ' sel' : '')
        + (b.visible ? '' : ' hid');
      mb.appendChild(dot);
      line();
    }
    var zero = document.createElement('span');
    zero.className = 'mb-zero';
    zero.textContent = '0';
    mb.appendChild(zero);
  }

  // Verzerren-Drag: die Kraft-Glyphe in Spine, Stapel-Zeile und Mobil-Pille
  // pulsiert, solange gezogen wird — Ursache und Wirkung bleiben verbunden
  function setForceLive(id, on) {
    var sel = '[data-id="' + id + '"]';
    if (els.spineList) {
      var v = els.spineList.querySelector(sel);
      if (v) v.classList.toggle('force-live', on);
    }
    if (els.stackList) {
      var row = els.stackList.querySelector(sel);
      if (row) {
        var ic = row.querySelector('.type-icon');
        if (ic) ic.classList.toggle('force-live', on);
      }
    }
    if (els.stackPill) {
      els.stackPill.classList.toggle('force-live', on && !stackPanelOpen());
    }
  }

  // Kraft ausgewählt: Zeilen in ihrem Feld markieren + Erklärzeile zeigen
  function updateScopeMarks() {
    if (!els.side) return;
    var selIdx = -1;
    for (var i = 0; i < scene.blocks.length; i++) {
      if (scene.blocks[i].id === scene.selectedId) { selIdx = i; break; }
    }
    var isKraft = selIdx >= 0 && blockKind(scene.blocks[selIdx]) === 'kraft'
      && scene.blocks[selIdx].visible; // unsichtbare Kraft wirkt nicht
    els.side.classList.toggle('kraft-selected', isKraft && selIdx > 0);
    var rows = els.stackList.children;
    for (var r = 0; r < rows.length; r++) {
      var rowIdx = (scene.blocks.length - 1) - r; // display order is reversed
      rows[r].classList.toggle('in-scope', isKraft && rowIdx < selIdx);
      // Quelle der Scope-Linie: die ausgewählte Kraft selbst
      rows[r].classList.toggle('scope-src', isKraft && selIdx > 0 && rowIdx === selIdx);
    }
  }

  function buildStackRow(block, index) {
    var def = scene.defs.get(block.type);
    var kind = def ? def.kind : 'ding';

    var li = document.createElement('li');
    li.className = 'stack-row k-' + kind
      + (block.id === scene.selectedId ? ' selected' : '')
      + (block.visible ? '' : ' hidden-layer');
    li.dataset.id = block.id;

    // Scope-Spalte: eine Linie je Kraft, die auf diese Zeile wirkt
    var gutter = document.createElement('span');
    gutter.className = 'scope-gutter';
    var depth = Math.min(3, forcesAbove(index));
    for (var g = 0; g < depth; g++) {
      var ln = document.createElement('span');
      ln.className = 'scope-line';
      gutter.appendChild(ln);
    }
    if (kind === 'kraft' && block.visible) {
      var src = document.createElement('span');
      src.className = 'scope-line src';
      gutter.appendChild(src);
    }
    li.appendChild(gutter);

    var handle = document.createElement('span');
    handle.className = 'drag-handle';
    handle.textContent = '⠿';
    handle.title = 'Ziehen zum Umsortieren';
    handle.addEventListener('pointerdown', function (ev) {
      startRowDrag(ev, li, handle);
    });

    var icon = document.createElement('span');
    icon.className = 'type-icon ' + kind;
    setTypeIcon(icon, def);

    var label = document.createElement('span');
    label.className = 'row-label';
    var kindEl = document.createElement('span');
    kindEl.className = 'row-kind';
    kindEl.textContent = KIND_LABEL[kind] || kind;
    var nameEl = document.createElement('span');
    nameEl.className = 'row-name';
    nameEl.textContent = block.name;
    label.appendChild(kindEl);
    label.appendChild(nameEl);

    // Umbenennen: Doppelklick auf den Namen -> Inline-Edit (Name läuft
    // schon über serialize/?s=, hier bekommt er nur endlich eine UI)
    function startRename() {
      if (nameEl.querySelector('input')) return;
      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'rename-input';
      input.value = block.name;
      input.maxLength = 48;
      nameEl.textContent = '';
      nameEl.appendChild(input);
      input.focus();
      input.select();
      var done = false;
      function commit(save) {
        if (done) return;
        done = true;
        var v = input.value.trim();
        if (save && v && v !== block.name) {
          block.name = v;
          touchState();
        }
        nameEl.textContent = block.name;
        if (propsBlock === block && propsTitleName) propsTitleName.textContent = block.name;
        updateRibbon();
        updateHullOverlay();
      }
      input.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter') commit(true);
        else if (e.key === 'Escape') commit(false);
      });
      input.addEventListener('blur', function () { commit(true); });
      input.addEventListener('click', function (e) { e.stopPropagation(); });
      input.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    }
    nameEl.title = 'Doppelklick zum Umbenennen';
    nameEl.addEventListener('dblclick', function (ev) {
      ev.stopPropagation();
      ev.preventDefault();
      startRename();
    });

    var dup = document.createElement('button');
    dup.className = 'dup-btn';
    dup.textContent = '⧉';
    dup.title = 'Duplizieren';
    dup.setAttribute('aria-label', 'Baustein duplizieren');
    dup.addEventListener('click', function (ev) {
      ev.stopPropagation();
      duplicateBlock(block);
    });

    var eye = document.createElement('button');
    eye.className = 'eye-btn' + (block.visible ? '' : ' off');
    eye.textContent = block.visible ? '◉' : '○';
    eye.title = block.visible ? 'Ausblenden' : 'Einblenden';
    eye.setAttribute('aria-label', eye.title);
    eye.addEventListener('click', function (ev) {
      ev.stopPropagation();
      toggleBlockVisible(block);
    });

    var del = document.createElement('button');
    del.className = 'del-btn';
    del.textContent = '✕';
    del.title = 'Löschen';
    del.setAttribute('aria-label', 'Baustein löschen');
    del.addEventListener('click', function (ev) {
      ev.stopPropagation();
      removeBlockWithUndo(block);
    });

    li.appendChild(handle);
    li.appendChild(icon);
    li.appendChild(label);

    // "wirkt ↓ n" — eine Kraft strahlt auf alles darunter
    // (nur solange sie sichtbar ist: die Engine überspringt unsichtbare)
    if (kind === 'kraft' && block.visible && index > 0) {
      var tag = document.createElement('span');
      tag.className = 'row-tag';
      tag.title = 'Diese Kraft wirkt auf alle Bausteine darunter';
      tag.textContent = 'wirkt ↓ ' + index;
      li.appendChild(tag);
    }

    li.appendChild(dup);
    li.appendChild(eye);
    li.appendChild(del);

    li.addEventListener('click', function () {
      if (Date.now() < suppressRowClickUntil) return;
      scene.select(block.id);
    });
    return li;
  }

  // one-step undo: snapshot before removal, restore via toast action
  // (Stapel-Zeile UND Chip am Objekt teilen sich diesen Pfad)
  function removeBlockWithUndo(block) {
    var snap = {
      type: block.type,
      name: block.name,
      visible: !!block.visible,
      params: JSON.parse(JSON.stringify(block.params)),
      index: scene.blocks.indexOf(block)
    };
    scene.remove(block.id);
    touchState();
    toast('Baustein gelöscht', {
      action: 'Rückgängig',
      ms: 5000,
      onAction: function () { restoreBlock(snap); }
    });
  }

  // Auge-Knopf, Shortcut H und Palette teilen sich diesen Pfad: der
  // Re-Render hält Stapel, Spine, Ribbon und Scope-Marken konsistent —
  // die Engine überspringt unsichtbare Kräfte, die UI muss folgen
  function toggleBlockVisible(block) {
    block.visible = !block.visible;
    renderStack();
    updateEmptyHint();
    touchState();
  }

  // clone a block incl. params (serialize-Muster: defaults -> kopierte
  // params -> init) and slot the copy directly above the original
  function duplicateBlock(block) {
    if (!scene.defs.has(block.type)) return;
    var snap;
    try {
      snap = JSON.parse(JSON.stringify(block.params));
    } catch (e) {
      console.error('0necanvas ui: duplicate serialize failed', e);
      return;
    }
    var nb = scene.add(block.type);
    nb.visible = !!block.visible;
    nb.name = block.name + ' (Kopie)';
    for (var k in nb.params) {
      if (hasKey(snap, k)) nb.params[k] = snap[k];
    }
    var def = scene.defs.get(block.type);
    if (def && typeof def.init === 'function') {
      try { def.init(nb); } catch (e) { console.error('0necanvas ui: init() failed on duplicate for "' + block.type + '"', e); }
    }
    scene.move(nb.id, scene.blocks.indexOf(block) + 1);
    scene.select(nb.id);
    touchState();
  }

  // rebuild a deleted block from its snapshot (same path sc.load takes:
  // defaults -> restored params -> init) and put it back at its old index
  function restoreBlock(snap) {
    if (!scene.defs.has(snap.type)) return;
    var nb = scene.add(snap.type);
    nb.name = snap.name;
    nb.visible = snap.visible;
    for (var k in nb.params) {
      if (hasKey(snap.params, k)) nb.params[k] = snap.params[k];
    }
    var def = scene.defs.get(snap.type);
    if (def && typeof def.init === 'function') {
      try { def.init(nb); } catch (e) { console.error('0necanvas ui: init() failed on undo for "' + snap.type + '"', e); }
    }
    scene.move(nb.id, clamp(snap.index, 0, scene.blocks.length - 1));
    scene.select(nb.id);
    touchState();
  }

  function updateStackSelection() {
    var rows = els.stackList.children;
    for (var i = 0; i < rows.length; i++) {
      rows[i].classList.toggle('selected', rows[i].dataset.id === scene.selectedId);
    }
    if (els.spineList) {
      var verts = els.spineList.children;
      for (var v = 0; v < verts.length; v++) {
        verts[v].classList.toggle('selected', verts[v].dataset.id === scene.selectedId);
      }
    }
    renderMiniBeam();
    updateScopeMarks();
  }

  /* ---------- drag-reorder (pointer events, works with touch) ---------- */

  function startRowDrag(ev, row, handle) {
    if (!ev.isPrimary) return;
    ev.preventDefault();
    ev.stopPropagation();

    var draggedId = row.dataset.id;
    var moved = false;
    var dropIdx = -1;
    var startY = ev.clientY;
    var lastClientY = ev.clientY;
    var scrollRAF = 0;

    try { handle.setPointerCapture(ev.pointerId); } catch (e) { /* older browsers */ }

    function otherRows() {
      var out = [];
      var kids = els.stackList.children;
      for (var i = 0; i < kids.length; i++) {
        if (kids[i].dataset.id !== draggedId) out.push(kids[i]);
      }
      return out;
    }

    function clearMarks(rows) {
      for (var i = 0; i < rows.length; i++) {
        rows[i].classList.remove('drop-above', 'drop-below');
      }
    }

    function computeDrop(clientY, rows) {
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i].getBoundingClientRect();
        if (clientY < r.top + r.height / 2) return { idx: i, row: rows[i], above: true };
        if (clientY < r.bottom) return { idx: i + 1, row: rows[i], above: false };
      }
      if (rows.length) return { idx: rows.length, row: rows[rows.length - 1], above: false };
      return { idx: 0, row: null, above: true };
    }

    function markDropAt(clientY) {
      var rows = otherRows();
      clearMarks(rows);
      var drop = computeDrop(clientY, rows);
      dropIdx = drop.idx;
      if (drop.row) {
        drop.row.classList.add(drop.above ? 'drop-above' : 'drop-below');
      }
    }

    // list auto-scrolls while the pointer sits in the top/bottom edge zone
    var SCROLL_ZONE_PX = 32;
    function autoScrollTick() {
      scrollRAF = 0;
      var lr = els.stackList.getBoundingClientRect();
      var v = 0;
      if (lastClientY < lr.top + SCROLL_ZONE_PX) {
        v = -Math.ceil((lr.top + SCROLL_ZONE_PX - lastClientY) / 3);
      } else if (lastClientY > lr.bottom - SCROLL_ZONE_PX) {
        v = Math.ceil((lastClientY - (lr.bottom - SCROLL_ZONE_PX)) / 3);
      }
      if (!v) return;
      var before = els.stackList.scrollTop;
      els.stackList.scrollTop = before + v;
      if (els.stackList.scrollTop !== before) markDropAt(lastClientY);
      scrollRAF = requestAnimationFrame(autoScrollTick);
    }

    function onMove(mv) {
      if (mv.pointerId !== ev.pointerId) return;
      lastClientY = mv.clientY;
      if (!moved && Math.abs(mv.clientY - startY) < 4) return;
      moved = true;
      row.classList.add('dragging');
      markDropAt(mv.clientY);
      if (!scrollRAF) scrollRAF = requestAnimationFrame(autoScrollTick);
      mv.preventDefault();
    }

    function onEnd(up) {
      if (up.pointerId !== ev.pointerId) return;
      if (scrollRAF) { cancelAnimationFrame(scrollRAF); scrollRAF = 0; }
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onEnd);
      handle.removeEventListener('pointercancel', onEnd);
      row.classList.remove('dragging');
      clearMarks(otherRows());
      if (moved) {
        suppressRowClickUntil = Date.now() + 250;
        if (dropIdx >= 0) {
          // display order is reversed: display insert index -> stack index
          var stackIdx = (scene.blocks.length - 1) - dropIdx;
          scene.move(draggedId, stackIdx);   // fires stack change -> re-render
          touchState();
        } else {
          renderStack();
        }
      }
    }

    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onEnd);
    handle.addEventListener('pointercancel', onEnd);
  }

  /* ---------- properties panel (tools/controls.js, the site's original) ---------- */
  // One Controls.createPanel singleton for the whole page (like the other
  // tools); selecting a block swaps its schema into a panel section via
  // removeSection/beginSection (cleans params/callbacks — no zombie panels).
  // Panel position, bar mode and mobile sheet position survive selection
  // changes that way.

  var propsPanel = null;       // ControlPanel singleton (page lifetime)
  var propsBlock = null;       // block the panel is currently bound to
  var propsPanelKeys = [];     // schema keys mirrored into the panel
  var propsTitleIcon = null;
  var propsTitleName = null;

  // controls.js switches to its mobile bottom sheet at this width
  function isSheetMobile() {
    return window.innerWidth <= 768;
  }

  function ensurePropsPanel() {
    if (propsPanel) return propsPanel;
    if (!window.Controls || typeof Controls.createPanel !== 'function') {
      console.warn('0necanvas ui: tools/controls.js fehlt — kein Eigenschaften-Panel');
      return null;
    }
    var panel = Controls.createPanel({ id: 'oc-ctrl-panel', position: 'left' });

    // header title: type icon + block name (info only; drag handle untouched)
    if (panel.headerEl) {
      var title = document.createElement('span');
      title.className = 'oc-ctrl-title';
      propsTitleIcon = document.createElement('span');
      propsTitleIcon.className = 'type-icon ding';
      propsTitleName = document.createElement('span');
      propsTitleName.className = 'oc-ctrl-title-name';
      title.appendChild(propsTitleIcon);
      title.appendChild(propsTitleName);
      panel.headerEl.appendChild(title);
    }

    panel.addHeaderButton({
      icon: '⠿',
      title: 'Bausteine (Auswahl aufheben)',
      onClick: function () { scene.select(null); }
    });
    panel.addResetButton({
      icon: '↺',
      title: 'Block auf Standardwerte zurücksetzen',
      onClick: resetBlockParams
    });

    propsPanel = panel;
    return panel;
  }

  // controls.js misst sein Mobil-Sheet beim allerersten createPanel mit
  // noch leerer Section (nur der Header existiert) und merkt sich "Header
  // sichtbar" als Offen-Zustand — das Regler-Sheet bliebe ein 44px-Balken.
  // Reposition von außen (Innenleben unangetastet): nach dem Zeigen einmal
  // auf Drittel-Höhe stellen; setPosition merkt sich die Höhe, danach
  // gelten wieder die Nutzer-Positionen.
  function ensureSheetOpenHeight() {
    if (!propsPanel || !propsPanel.el || !isSheetMobile()) return;
    var apply = propsPanel._applyMobileSheetPosition;
    if (typeof apply !== 'function') return;
    var full = propsPanel.el.offsetHeight || 0;
    if (!full) return;
    var want = clamp(Math.round(window.innerHeight / 3), 120, full);
    var visible = Math.max(0, window.innerHeight - propsPanel.el.getBoundingClientRect().top);
    if (visible >= want - 8) return; // offen genug — Nutzer-Position respektieren
    try {
      apply.call(propsPanel, Math.max(0, full - want), true);
    } catch (e) { /* alter Zustand bleibt, nur weniger bequem */ }
  }

  function setPanelShown(shown) {
    document.body.classList.toggle('oc-props-open', !!shown);
    if (propsPanel && propsPanel.el) {
      var wasHidden = propsPanel.el.classList.contains('oc-hidden');
      propsPanel.el.classList.toggle('oc-hidden', !shown);
      if (shown && wasHidden) {
        // panel could not measure itself while hidden — let controls.js re-layout
        try { window.dispatchEvent(new Event('resize')); } catch (e) { /* noop */ }
      }
      if (shown) setTimeout(ensureSheetOpenHeight, 60);
    }
    updateRibbon();
  }

  /* ---------- Kontext-Ribbon über dem Regler-Panel ---------- */
  // „Kurve — Ding · 3 von 5 · im Feld von: Raum verzerren". Liest nur:
  // controls.js bleibt unangetastet, das Ribbon folgt dem Panel-Rechteck
  // per rAF (Panel ist frei verschiebbar).

  var ribbonRaf = 0;

  function ribbonMetaText(block) {
    var idx = -1;
    for (var i = 0; i < scene.blocks.length; i++) {
      if (scene.blocks[i].id === block.id) { idx = i; break; }
    }
    var kind = blockKind(block);
    var parts = [KIND_LABEL[kind] || kind];
    if (idx >= 0) parts.push((idx + 1) + ' von ' + scene.blocks.length);
    if (kind === 'kraft') {
      // eine ausgeblendete Kraft wirkt nicht (Engine überspringt sie)
      if (idx > 0 && block.visible) parts.push('wirkt ↓ ' + idx);
    } else if (idx >= 0) {
      var names = [];
      for (var j = idx + 1; j < scene.blocks.length; j++) {
        var b = scene.blocks[j];
        if (b.visible && blockKind(b) === 'kraft') names.push(b.name);
      }
      if (names.length === 1) parts.push('im Feld von: ' + names[0]);
      else if (names.length > 1) parts.push('im Feld von: ' + names[0] + ' +' + (names.length - 1));
    }
    return parts.join(' · ');
  }

  // Mobil rueckt die Pillen-Zeile ueber das Regler-Sheet: --oc-ctrl-lift =
  // sichtbare Sheet-Hoehe + Ribbon (sitzt oben drauf), geklemmt, damit die
  // Pillen nie vom Schirm rutschen oder den Zurueck-Pfeil verdecken
  function setCtrlLift(rect) {
    if (!isSheetMobile()) return;
    var lift = 0;
    if (rect) {
      var ribbonH = (els.ribbon && els.ribbon.offsetHeight) || 34;
      lift = clamp(Math.round(window.innerHeight - rect.top + ribbonH), 0,
        Math.round(window.innerHeight * 0.72));
    }
    document.body.style.setProperty('--oc-ctrl-lift', lift + 'px');
  }

  function positionRibbon() {
    var el = propsPanel && propsPanel.el;
    if (!el) return;
    var covered = el.classList.contains('oc-hidden') || el.classList.contains('bar-mode');
    var rect = covered ? null : el.getBoundingClientRect();
    if (!rect || rect.width < 60 || rect.height < 40) {
      els.ribbon.style.opacity = '0';
      setCtrlLift(null);
      return;
    }
    els.ribbon.style.opacity = '1';
    var h = els.ribbon.offsetHeight || 34;
    els.ribbon.style.left = rect.left + 'px';
    els.ribbon.style.top = (rect.top - h) + 'px';
    els.ribbon.style.width = rect.width + 'px';
    setCtrlLift(rect);
  }

  function ribbonLoop() {
    positionRibbon();
    ribbonRaf = requestAnimationFrame(ribbonLoop);
  }

  function updateRibbon() {
    if (!els.ribbon) return;
    var show = !!propsBlock && document.body.classList.contains('oc-props-open');
    if (!show) {
      els.ribbon.hidden = true;
      if (ribbonRaf) { cancelAnimationFrame(ribbonRaf); ribbonRaf = 0; }
      document.body.style.setProperty('--oc-ctrl-lift', '0px');
      return;
    }
    var def = scene.defs.get(propsBlock.type);
    setTypeIcon(els.ribbonIco, def);
    els.ribbonName.textContent = propsBlock.name;
    els.ribbonMeta.textContent = ribbonMetaText(propsBlock);
    els.ribbon.hidden = false;
    positionRibbon();
    if (!ribbonRaf) ribbonRaf = requestAnimationFrame(ribbonLoop);
  }

  /* ---------- Kontext am Objekt: Live-Hüllbox + Chip ---------- */
  // Werk antippen -> Hüllbox um die emittierte Geometrie + Chip darüber
  // (Name, Gattung, Regler, Duplizieren, Löschen). Die Kraft-Kette bleibt
  // bewusst außen vor — wie hit() und das Auswahl-Overlay der Engine.
  // Bounds über den minimalen Engine-Hook scene.blockBounds; die
  // Welt->Schirm-Projektion läuft jeden Frame (klebt bei Pan/Zoom/Drag),
  // die Bounds selbst werden alle 150ms erneuert (emit kann teuer sein).

  var hullRaf = 0;
  var hullBB = null;
  var hullBBFor = null;
  var hullBBAt = 0;
  var HULL_PAD_PX = 12;
  var HULL_BB_MS = 150;

  function hullEligible() {
    if (!autoPropsTabArmed) return null; // Boot-Select: stille Bühne zuerst
    var b = getBlock(scene.selectedId);
    if (!b || !b.visible) return null;
    if (blockKind(b) === 'kraft') return null; // Kräfte haben keine eigene Form
    return b;
  }

  function hideHull() {
    if (els.selframe) els.selframe.hidden = true;
    if (els.chip) els.chip.hidden = true;
    hullBB = null;
    hullBBFor = null;
    if (hullRaf) { cancelAnimationFrame(hullRaf); hullRaf = 0; }
  }

  function updateChipContent(block) {
    if (!els.chip) return;
    var def = scene.defs.get(block.type);
    setTypeIcon(els.chipIco, def);
    els.chipName.textContent = block.name;
    els.chipKind.textContent = KIND_LABEL[blockKind(block)] || '';
  }

  function hullFrame() {
    hullRaf = 0;
    var b = hullEligible();
    if (!b) { hideHull(); return; }
    var now = performance.now();
    if (hullBBFor !== b.id || now - hullBBAt > HULL_BB_MS) {
      hullBB = (typeof scene.blockBounds === 'function') ? scene.blockBounds(b.id) : null;
      hullBBFor = b.id;
      hullBBAt = now;
    }
    var r = els.canvas.getBoundingClientRect();
    var cx, topY;
    if (hullBB) {
      var p0 = scene.worldToScreen(hullBB.minX, hullBB.minY);
      var p1 = scene.worldToScreen(hullBB.maxX, hullBB.maxY);
      var x = r.left + Math.min(p0[0], p1[0]) - HULL_PAD_PX;
      var y = r.top + Math.min(p0[1], p1[1]) - HULL_PAD_PX;
      var w = Math.abs(p1[0] - p0[0]) + HULL_PAD_PX * 2;
      var h = Math.abs(p1[1] - p0[1]) + HULL_PAD_PX * 2;
      els.selframe.style.left = x + 'px';
      els.selframe.style.top = y + 'px';
      els.selframe.style.width = w + 'px';
      els.selframe.style.height = h + 'px';
      els.selframe.hidden = false;
      cx = x + w / 2;
      topY = y;
    } else {
      // emit lieferte (noch) nichts: Chip am Block-Anker, ohne Rahmen
      els.selframe.hidden = true;
      var a = blockAnchor(b);
      var p = scene.worldToScreen(a[0], a[1]);
      cx = r.left + p[0];
      topY = r.top + p[1];
    }
    els.chip.hidden = false;
    var ch = els.chip.offsetHeight || 50;
    var cw = els.chip.offsetWidth || 220;
    cx = clamp(cx, cw / 2 + 8, window.innerWidth - cw / 2 - 8);
    // nie über die Aktionsleiste oben rutschen (füllt die Form den Schirm,
    // würde der Chip sonst die Ecken-Buttons verdecken)
    var minTop = 8;
    if (els.corner) {
      var cr = els.corner.getBoundingClientRect();
      if (cr.bottom > minTop) minTop = cr.bottom + 6;
    }
    var ct = clamp(topY - ch - 10, minTop, window.innerHeight - ch - 8);
    els.chip.style.left = cx + 'px';
    els.chip.style.top = ct + 'px';
    hullRaf = requestAnimationFrame(hullFrame);
  }

  function updateHullOverlay() {
    if (!els.chip || !els.selframe) return;
    var b = hullEligible();
    if (!b) { hideHull(); return; }
    updateChipContent(b);
    hullBBAt = 0; // Bounds sofort neu holen (Selektion/Stapel geändert)
    if (!hullRaf) hullRaf = requestAnimationFrame(hullFrame);
  }

  // detach the current block (drops rows + their callbacks) and hide
  function unbindPropsPanel() {
    if (propsPanel && propsBlock) {
      try { propsPanel.removeSection('props'); } catch (e) { console.warn('0necanvas ui: removeSection failed', e); }
    }
    propsBlock = null;
    propsPanelKeys = [];
    setPanelShown(false);
  }

  function panelSliderLabel(entry) {
    return entry.unit ? entry.label + ' (' + entry.unit + ')' : entry.label;
  }

  function bindPropsPanel(block) {
    var panel = ensurePropsPanel();
    if (!panel) return;
    if (propsBlock) {
      try { panel.removeSection('props'); } catch (e) { console.warn('0necanvas ui: removeSection failed', e); }
    }
    propsBlock = block;
    propsPanelKeys = [];

    var def = scene.defs.get(block.type);
    var kind = def ? def.kind : 'ding';
    if (propsTitleIcon) {
      propsTitleIcon.className = 'type-icon ' + kind;
      setTypeIcon(propsTitleIcon, def);
    }
    if (propsTitleName) propsTitleName.textContent = block.name;

    panel.beginSection('props');
    var schema = (def && def.schema) || [];
    for (var i = 0; i < schema.length; i++) {
      addPanelControl(panel, block, schema[i]);
    }
    panel.endSection();
  }

  function addPanelControl(panel, block, entry) {
    function apply(v) {
      block.params[entry.key] = v;
      touchState();
    }
    switch (entry.ctrl) {
      case 'slider':
        panel.addSlider(entry.key, {
          label: panelSliderLabel(entry),
          min: entry.min,
          max: entry.max,
          step: entry.step,
          value: Number(block.params[entry.key]),
          decimals: entry.decimals,
          onChange: apply
        });
        propsPanelKeys.push(entry.key);
        break;
      case 'toggle':
        panel.addToggle(entry.key, {
          label: entry.label,
          value: !!block.params[entry.key],
          onChange: function (v) { apply(!!v); }
        });
        propsPanelKeys.push(entry.key);
        break;
      case 'select':
        panel.addSelect(entry.key, {
          label: entry.label,
          options: entryOptions(entry),
          value: block.params[entry.key],
          onChange: apply
        });
        propsPanelKeys.push(entry.key);
        break;
      case 'text':
        panel.addInput(entry.key, {
          label: entry.label,
          value: block.params[entry.key] == null ? '' : String(block.params[entry.key]),
          onChange: function (v) { apply(String(v)); }
        });
        if (entry.maxlen && panel.bodyEl) {
          var inp = panel.bodyEl.querySelector('[data-key="' + entry.key + '"] .ctrl-input');
          if (inp) inp.maxLength = entry.maxlen;
        }
        propsPanelKeys.push(entry.key);
        break;
      case 'patterns':
        // controls.js Pattern-Picker (Original-Nutzung: game0f1ife.html);
        // param trägt die Pattern-id (string) oder null (= keins)
        if (typeof panel.addPatternPicker !== 'function') {
          console.warn('0necanvas ui: controls.js ohne addPatternPicker — "' + entry.key + '" übersprungen');
          break;
        }
        panel.addPatternPicker(entry.key, {
          label: entry.label,
          patterns: entry.patterns || [],
          value: typeof block.params[entry.key] === 'string' ? block.params[entry.key] : null,
          columns: entry.columns || 6,
          buttonSize: entry.buttonSize || 40,
          onChange: function (patternId) { apply(patternId || null); }
        });
        propsPanelKeys.push(entry.key);
        break;
      case 'hidden':
        break; // serialized param without UI (pfad pts)
      default:
        console.warn('0necanvas ui: unknown ctrl "' + entry.ctrl + '" for key "' + entry.key + '"');
    }
  }

  // reset button: back to the block's schema defaults ('hidden' entries —
  // drawn pfad points — survive; the stroke itself is not throwaway state)
  function resetBlockParams() {
    var block = propsBlock;
    if (!block || !propsPanel) return;
    var def = scene.defs.get(block.type);
    var schema = (def && def.schema) || [];
    var hasPatterns = false;
    for (var i = 0; i < schema.length; i++) {
      var entry = schema[i];
      if (entry.ctrl === 'hidden') continue;
      if (entry.ctrl === 'patterns') hasPatterns = true;
      if (!hasKey(block.params, entry.key)) continue;
      block.params[entry.key] = entry.value;
      propsPanel.set(entry.key, entry.value); // updates UI without onChange
    }
    // panel.set() kennt die Pattern-Buttons nicht — Section neu aufbauen,
    // damit der aktive Button den zurückgesetzten Wert zeigt
    if (hasPatterns) bindPropsPanel(block);
    touchState();
  }

  // sync panel UI from params without firing onChange (used during canvas drags)
  function refreshPropsValues() {
    if (!propsPanel || !propsBlock) return;
    for (var i = 0; i < propsPanelKeys.length; i++) {
      var k = propsPanelKeys[i];
      propsPanel.set(k, propsBlock.params[k]);
    }
  }

  /* ---------- library overlay ---------- */

  function libDefs() {
    var all = OneCanvas.blockDefs();
    var out = [];
    for (var i = 0; i < all.length; i++) {
      if (all[i].type.charAt(0) === '_') continue; // internal (selftest)
      out.push(all[i]);
    }
    return out;
  }

  // drei Familien untereinander, jede Kachel: SVG-Miniatur + Name + Flüstersatz
  function renderLibrary() {
    var wrap = els.libScroll;
    wrap.innerHTML = '';
    var defsList = libDefs();
    for (var c = 0; c < CAT_ORDER.length; c++) {
      var cat = CAT_ORDER[c];
      var sec = document.createElement('div');
      sec.className = 'fam' + (cat === 'kraft' ? ' kraefte' : '');
      sec.dataset.cat = cat;
      var head = document.createElement('div');
      head.className = 'fam-head';
      var nm = document.createElement('span');
      nm.className = 'fam-name';
      nm.textContent = CAT_LABEL[cat];
      var ds = document.createElement('span');
      ds.className = 'fam-desc';
      ds.textContent = CAT_DESC[cat] || '';
      head.appendChild(nm);
      head.appendChild(ds);
      sec.appendChild(head);
      var grid = document.createElement('div');
      grid.className = 'tiles';
      for (var i = 0; i < defsList.length; i++) {
        if (defsList[i].kind !== cat) continue;
        grid.appendChild(buildLibTile(defsList[i]));
      }
      sec.appendChild(grid);
      wrap.appendChild(sec);
    }
    var empty = document.createElement('div');
    empty.className = 'props-empty';
    empty.id = 'oc-lib-empty';
    empty.textContent = 'Nichts gefunden';
    empty.hidden = true;
    wrap.appendChild(empty);
    applyLibFilter();
  }

  function buildLibTile(def) {
    var tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'tile';
    var whisper = TYPE_WHISPER[def.type] || '';
    tile.dataset.search = ((def.label || def.type) + ' ' + def.type + ' '
      + (CAT_LABEL[def.kind] || '') + ' ' + (KIND_LABEL[def.kind] || '') + ' '
      + whisper).toLowerCase();
    var ic = document.createElement('span');
    ic.className = 't-icon';
    setTypeIcon(ic, def);
    var nm = document.createElement('span');
    nm.className = 't-name';
    nm.textContent = def.label || def.type;
    var sub = document.createElement('span');
    sub.className = 't-sub';
    sub.textContent = whisper;
    tile.appendChild(ic);
    tile.appendChild(nm);
    tile.appendChild(sub);
    tile.addEventListener('click', function () {
      spawnBlock(def);
      closeLibrary();
    });
    return tile;
  }

  // gemeinsamer Einfüge-Pfad für Bibliotheks-Kachel und Kommando-Palette:
  // Neues landet unter den obersten Kräften, Kräfte selbst oben
  function spawnBlock(def) {
    var block = scene.add(def.type);
    if (def.kind !== 'kraft') slotBelowTopForces(block);
    scene.select(block.id);
    touchState();
    els.stackList.scrollTop = 0;
    pulseSpine(block.id);
    toast(def.kind === 'kraft'
      ? (block.name + ' liegt oben — wirkt auf alles darunter')
      : (block.name + ' liegt im Stapel — unter den Kräften'));
    return block;
  }

  function applyLibFilter() {
    if (!els.libScroll) return;
    var q = (els.libSearch && els.libSearch.value || '').trim().toLowerCase();
    var fams = els.libScroll.querySelectorAll('.fam');
    var total = 0;
    for (var f = 0; f < fams.length; f++) {
      var tiles = fams[f].querySelectorAll('.tile');
      var visible = 0;
      for (var t = 0; t < tiles.length; t++) {
        var hit = !q || tiles[t].dataset.search.indexOf(q) >= 0;
        tiles[t].classList.toggle('tile-hit-none', !hit);
        if (hit) visible++;
      }
      fams[f].classList.toggle('fam-empty', visible === 0);
      total += visible;
    }
    var empty = $('oc-lib-empty');
    if (empty) empty.hidden = total > 0;
  }

  function openLibrary() {
    renderLibrary();
    els.libOverlay.classList.add('open');
    if (els.libSearch) {
      els.libSearch.value = '';
      applyLibFilter();
      if (isDesktopLayout()) els.libSearch.focus();
    }
    wake();
  }

  function closeLibrary() {
    els.libOverlay.classList.remove('open');
    // Fokus sofort freigeben — bis die visibility-Transition greift, würde
    // das unsichtbare Suchfeld sonst Shortcuts schlucken (Typing-Guard)
    if (els.libSearch) els.libSearch.blur();
    wake();
  }

  /* ---------- Kommando-Palette (Cmd/Strg+K) ---------- */
  // Eine Suche über Befehle, Baustein-Typen und Familien; Pfeiltasten +
  // Enter. Empty-State: Enter öffnet die Bibliothek.

  var palItems = [];  // sichtbare Einträge, flach in Listen-Reihenfolge
  var palIdx = 0;
  var IS_MAC = /Mac|iPhone|iPad|iPod/.test(navigator.platform || '');
  var MOD_KBD = IS_MAC ? '⌘' : 'Strg+';

  function paletteOpenState() {
    return !!(els.palette && els.palette.classList.contains('open'));
  }

  function paletteCommands() {
    var cmds = [
      { ico: '+', label: 'Baustein hinzufügen', sub: 'Bibliothek öffnen', kbd: 'A',
        extra: 'bibliothek neu', run: openLibrary },
      { ico: '✥', label: 'Werkzeug: Bewegen', kbd: 'V', extra: 'verschieben schwenken',
        run: function () { setTool('move'); } },
      { ico: '≈', label: 'Werkzeug: Verzerren', kbd: 'W', extra: 'warp ziehen kraft',
        run: function () { setTool('warp'); } },
      { ico: '✎', label: 'Werkzeug: Zeichnen', kbd: 'Z', extra: 'stift freihand pfad',
        run: function () { setTool('draw'); } },
      { ico: '⊡', label: 'Ansicht einpassen', sub: 'Kamera auf die Szene zentrieren',
        extra: 'fit zoom kamera', run: fitView },
      { ico: '◐', label: inFocus() ? 'Fokus beenden' : 'Fokus-Modus',
        sub: 'nur das Werk', kbd: 'F', extra: 'ruhe rand ausblenden', run: toggleFocus },
      { ico: '⤓', label: 'Als PNG exportieren', extra: 'bild speichern download export',
        run: onExport },
      { ico: '⧉', label: 'Teilen', sub: 'Link zur Szene kopieren', extra: 'share url',
        run: onShare },
      { ico: '∅', label: 'Neue Szene', sub: 'alles leeren', extra: 'reset leer',
        run: onNewScene },
      { ico: '⛶', label: 'Vollbild', extra: 'fullscreen', run: onFullscreen },
      { ico: '⠿', label: stackPanelOpen() ? 'Stapel schließen' : 'Stapel öffnen',
        extra: 'strahl liste bausteine', run: toggleStackPanel }
    ];
    var sel = getBlock(scene.selectedId);
    if (sel) {
      cmds.push({ ico: '⧉', label: 'Auswahl duplizieren', sub: sel.name,
        kbd: MOD_KBD + 'D', extra: 'kopie', run: function () { duplicateBlock(sel); } });
      cmds.push({ ico: sel.visible ? '◉' : '○',
        label: sel.visible ? 'Auswahl ausblenden' : 'Auswahl einblenden', sub: sel.name,
        kbd: 'H', extra: 'sichtbar verstecken auge',
        run: function () { toggleBlockVisible(sel); } });
      cmds.push({ ico: '✕', label: 'Auswahl löschen', sub: sel.name, kbd: 'Entf',
        extra: 'entfernen', run: function () { removeBlockWithUndo(sel); } });
    }
    for (var c = 0; c < CAT_ORDER.length; c++) {
      (function (cat) {
        cmds.push({
          ico: '›', label: 'Familie: ' + CAT_LABEL[cat], sub: CAT_DESC[cat] || '',
          extra: 'familie kategorie bibliothek ' + (KIND_LABEL[cat] || ''),
          run: function () {
            openLibrary();
            if (els.libSearch) {
              els.libSearch.value = CAT_LABEL[cat];
              applyLibFilter();
            }
          }
        });
      })(CAT_ORDER[c]);
    }
    for (var i = 0; i < cmds.length; i++) {
      cmds[i].search = (cmds[i].label + ' ' + (cmds[i].sub || '') + ' '
        + (cmds[i].extra || '')).toLowerCase();
    }
    return cmds;
  }

  function paletteBlockItems() {
    var defsList = libDefs();
    var out = [];
    for (var i = 0; i < defsList.length; i++) {
      (function (def) {
        var whisper = TYPE_WHISPER[def.type] || '';
        var kind = KIND_LABEL[def.kind] || '';
        out.push({
          def: def,
          label: def.label || def.type,
          sub: kind + (whisper ? ' — ' + whisper : ''),
          search: ((def.label || def.type) + ' ' + def.type + ' '
            + (CAT_LABEL[def.kind] || '') + ' ' + kind + ' ' + whisper).toLowerCase(),
          run: function () { spawnBlock(def); }
        });
      })(defsList[i]);
    }
    return out;
  }

  function buildPalRow(item, idx) {
    var li = document.createElement('li');
    li.className = 'pal-item';
    li.dataset.idx = idx;
    var ico = document.createElement('span');
    ico.className = 'p-ico';
    if (item.def) setTypeIcon(ico, item.def);
    else ico.textContent = item.ico || '◆';
    var label = document.createElement('span');
    label.className = 'p-label';
    label.appendChild(document.createTextNode(item.label));
    if (item.sub) {
      var sm = document.createElement('small');
      sm.textContent = item.sub;
      label.appendChild(sm);
    }
    li.appendChild(ico);
    li.appendChild(label);
    if (item.kbd) {
      var kbd = document.createElement('kbd');
      kbd.textContent = item.kbd;
      li.appendChild(kbd);
    }
    li.addEventListener('click', function () { runPalItem(idx); });
    // pointermove statt pointerenter: ein ruhender Zeiger stiehlt der
    // Tastatur-Auswahl nicht das Highlight, wenn die Liste neu rendert
    li.addEventListener('pointermove', function () {
      if (palIdx !== idx) { palIdx = idx; markPalActive(false); }
    });
    return li;
  }

  function renderPalette(q) {
    if (!els.palList) return;
    q = (q || '').trim().toLowerCase();
    els.palList.innerHTML = '';
    palItems = [];
    var groups = [
      { name: 'Befehle', items: paletteCommands() },
      { name: 'Bausteine', items: paletteBlockItems() }
    ];
    for (var g = 0; g < groups.length; g++) {
      var hits = [];
      for (var i = 0; i < groups[g].items.length; i++) {
        if (!q || groups[g].items[i].search.indexOf(q) >= 0) hits.push(groups[g].items[i]);
      }
      if (!hits.length) continue;
      var head = document.createElement('li');
      head.className = 'pal-group';
      head.textContent = groups[g].name;
      els.palList.appendChild(head);
      for (var h = 0; h < hits.length; h++) {
        els.palList.appendChild(buildPalRow(hits[h], palItems.length));
        palItems.push(hits[h]);
      }
    }
    if (palIdx >= palItems.length) palIdx = Math.max(0, palItems.length - 1);
    markPalActive();
    if (els.palEmpty) els.palEmpty.hidden = palItems.length > 0;
  }

  function markPalActive(scroll) {
    if (!els.palList) return;
    var rows = els.palList.querySelectorAll('.pal-item');
    for (var i = 0; i < rows.length; i++) {
      rows[i].classList.toggle('act', Number(rows[i].dataset.idx) === palIdx);
    }
    if (scroll !== false) {
      var act = els.palList.querySelector('.pal-item.act');
      if (act && act.scrollIntoView) act.scrollIntoView({ block: 'nearest' });
    }
  }

  function runPalItem(idx) {
    var item = palItems[idx];
    if (!item) return;
    closePalette();
    try { item.run(); } catch (e) {
      console.error('0necanvas ui: palette command failed', e);
    }
  }

  function openPalette() {
    if (!els.palette) return;
    palIdx = 0;
    if (els.palInput) els.palInput.value = '';
    renderPalette('');
    els.palette.classList.add('open');
    if (els.palInput) els.palInput.focus();
    wake();
  }

  function closePalette() {
    if (!els.palette) return;
    els.palette.classList.remove('open');
    if (els.palInput) els.palInput.blur();
    wake();
  }

  /* ---------- Status-Chip: Zoom / fps / Instanzen ---------- */
  // fps kommt aus der rAF-Messung der Engine (sc.fps, EMA), die Instanzen
  // aus dem Frame-Zähler (sc.instancesDrawn). Zoom aktualisiert live bei
  // Rad/Pinch (zoomAt), der Rest im 500ms-Statuspoll.

  function updateStatusChip() {
    if (!els.status) return;
    if (els.stZoom) els.stZoom.textContent = Math.round(scene.camera.scale * 100) + ' %';
    var f = scene.fps;
    if (els.stFps) els.stFps.textContent = f ? String(Math.round(f)) : '—';
    if (els.stInst) els.stInst.textContent = String(scene.instancesDrawn || 0);
  }

  /* ---------- tools ---------- */

  function setTool(name) {
    tool = name;
    els.toolMove.classList.toggle('active', name === 'move');
    els.toolWarp.classList.toggle('active', name === 'warp');
    if (els.toolDraw) els.toolDraw.classList.toggle('active', name === 'draw');
    els.canvas.style.cursor = (name === 'warp' || name === 'draw') ? 'crosshair' : '';
  }

  /* ---------- draw tool (freehand -> pfad block) ---------- */

  var DRAW_MIN_STEP_PX = 2.5; // css px between recorded stroke points
  var DRAW_TOL_PX = 1.5;      // RDP decimation tolerance (css px)
  var DRAW_MAX_PTS = 200;     // control point cap after decimation

  // Ramer-Douglas-Peucker on a flat [x,y,...] list (iterative, order kept)
  function rdpDecimate(pts, tol) {
    var n = pts.length >> 1;
    if (n <= 2) return pts.slice();
    var keep = new Uint8Array(n);
    keep[0] = 1;
    keep[n - 1] = 1;
    var tol2 = tol * tol;
    var stack = [[0, n - 1]];
    while (stack.length) {
      var seg = stack.pop();
      var a = seg[0], b = seg[1];
      if (b - a < 2) continue;
      var ax = pts[2 * a], ay = pts[2 * a + 1];
      var dx = pts[2 * b] - ax, dy = pts[2 * b + 1] - ay;
      var len2 = dx * dx + dy * dy;
      var maxD = -1, maxI = -1;
      for (var i = a + 1; i < b; i++) {
        var px = pts[2 * i] - ax, py = pts[2 * i + 1] - ay;
        var d;
        if (len2 > 1e-12) {
          var t = (px * dx + py * dy) / len2;
          if (t < 0) t = 0; else if (t > 1) t = 1;
          var ex = px - dx * t, ey = py - dy * t;
          d = ex * ex + ey * ey;
        } else {
          d = px * px + py * py;
        }
        if (d > maxD) { maxD = d; maxI = i; }
      }
      if (maxD > tol2 && maxI > 0) {
        keep[maxI] = 1;
        stack.push([a, maxI], [maxI, b]);
      }
    }
    var out = [];
    for (var k = 0; k < n; k++) {
      if (keep[k]) out.push(pts[2 * k], pts[2 * k + 1]);
    }
    return out;
  }

  // stroke starts: create the pfad block immediately so the line is live
  // while drawing (points are world coords, block origin stays at 0/0)
  function beginDraw(world) {
    if (!scene.defs.has('pfad')) {
      console.warn('0necanvas ui: draw tool has no "pfad" block type available');
      return null;
    }
    var block = scene.add('pfad');
    block.params.x = 0;
    block.params.y = 0;
    block.params.rot = 0;
    block.params.pts = [world[0], world[1]];
    return block;
  }

  // pointer up: decimate, round, recenter on the centroid, select
  function finishDraw(g) {
    var block = g.block;
    var raw = block.params.pts;
    if (!raw || raw.length < 6) { // tap or micro stroke: no path
      scene.remove(block.id);
      touchState();
      return;
    }
    var s = Math.max(1e-6, scene.camera.scale);
    // deliberate-tap jitter guard: strokes whose bounding box stays under
    // 6 css px in both axes leave no invisible junk block behind
    var bMinX = raw[0], bMaxX = raw[0], bMinY = raw[1], bMaxY = raw[1];
    for (var bi = 2; bi < raw.length; bi += 2) {
      if (raw[bi] < bMinX) bMinX = raw[bi];
      if (raw[bi] > bMaxX) bMaxX = raw[bi];
      if (raw[bi + 1] < bMinY) bMinY = raw[bi + 1];
      if (raw[bi + 1] > bMaxY) bMaxY = raw[bi + 1];
    }
    if ((bMaxX - bMinX) * s < 6 && (bMaxY - bMinY) * s < 6) {
      scene.remove(block.id);
      touchState();
      return;
    }
    var dec = rdpDecimate(raw, DRAW_TOL_PX / s);
    var n = dec.length >> 1;
    if (n > DRAW_MAX_PTS) { // stride resample keeps endpoints
      var res = [];
      for (var r = 0; r < DRAW_MAX_PTS - 1; r++) {
        var idx = Math.floor(r * (n - 1) / (DRAW_MAX_PTS - 1));
        res.push(dec[2 * idx], dec[2 * idx + 1]);
      }
      res.push(dec[2 * n - 2], dec[2 * n - 1]);
      dec = res;
      n = dec.length >> 1;
    }
    var cx = 0, cy = 0, i;
    for (i = 0; i < dec.length; i += 2) { cx += dec[i]; cy += dec[i + 1]; }
    cx = Math.round(cx / n);
    cy = Math.round(cy / n);
    for (i = 0; i < dec.length; i += 2) {
      dec[i] = Math.round((dec[i] - cx) * 10) / 10;
      dec[i + 1] = Math.round((dec[i + 1] - cy) * 10) / 10;
    }
    block.params.pts = dec;
    block.params.x = cx;
    block.params.y = cy;
    // Tims Kernpunkt: Gezeichnetes muss unter die obersten Kräfte rutschen,
    // damit "Raum verzerren" & Co. auch auf frische Striche wirken
    slotBelowTopForces(block);
    selectViaCanvas = true; // frischer Strich: Chip zeigt, Panel bleibt zu
    scene.select(block.id);
    touchState();
  }

  function cancelDraw(g) {
    if (g && g.block) scene.remove(g.block.id);
    touchState();
  }

  /* ---------- warp target resolution ---------- */

  // read a warp block's center (key names may drift, see setWarpCenter)
  var WARP_CENTER_PAIRS = [
    ['cx', 'cy'], ['centerX', 'centerY'], ['zentrumX', 'zentrumY'],
    ['zx', 'zy'], ['x', 'y']
  ];
  function warpCenter(block) {
    for (var i = 0; i < WARP_CENTER_PAIRS.length; i++) {
      var a = WARP_CENTER_PAIRS[i][0], b = WARP_CENTER_PAIRS[i][1];
      if (hasKey(block.params, a) && hasKey(block.params, b)) {
        var x = Number(block.params[a]), y = Number(block.params[b]);
        return [isFinite(x) ? x : 0, isFinite(y) ? y : 0];
      }
    }
    return null;
  }

  // selection overrides; otherwise the warp block whose center is closest
  // to the click position wins (ties: topmost)
  function resolveWarpBlock(wx, wy) {
    var sel = getBlock(scene.selectedId);
    if (sel && sel.type === 'verzerren') return sel;
    var best = null, bestD = Infinity;
    for (var i = scene.blocks.length - 1; i >= 0; i--) {
      var b = scene.blocks[i];
      if (b.type !== 'verzerren') continue;
      var c = warpCenter(b);
      var d = c ? Math.hypot(c[0] - wx, c[1] - wy) : Infinity;
      if (d < bestD) { bestD = d; best = b; }
      else if (!best) best = b;
    }
    if (best) return best;
    if (scene.defs.has('verzerren')) {
      return scene.add('verzerren');
    }
    console.warn('0necanvas ui: warp tool has no "verzerren" block type available');
    return null;
  }

  // set warp center to an absolute world position; key names may drift
  // between parallel builder tasks, hence the candidate list + drag fallback
  function setWarpCenter(block, wx, wy, lastW) {
    var pairs = WARP_CENTER_PAIRS;
    for (var i = 0; i < pairs.length; i++) {
      if (hasKey(block.params, pairs[i][0]) && hasKey(block.params, pairs[i][1])) {
        block.params[pairs[i][0]] = wx;
        block.params[pairs[i][1]] = wy;
        return true;
      }
    }
    var def = scene.defs.get(block.type);
    if (def && typeof def.drag === 'function' && lastW) {
      def.drag(block, 'center', wx - lastW[0], wy - lastW[1]);
      return true;
    }
    return false;
  }

  /* ---------- canvas gestures ---------- */

  var pointers = new Map();   // pointerId -> {x, y} canvas-local CSS px
  var gesture = null;
  // gesture modes:
  //  {mode:'drag-block', block, handle, lastW:[wx,wy]}
  //  {mode:'pan', last:{x,y}, moved:false, emptyTap:true}
  //  {mode:'warp', block, lastW:[wx,wy]}
  //  {mode:'draw', block}            (freehand stroke -> pfad block)
  //  {mode:'pinch', prevDist, prevMid:{x,y}}

  function zoomAt(sx, sy, factor, cssW, cssH) {
    var cam = scene.camera;
    var ns = clamp(cam.scale * factor, ZOOM_MIN, ZOOM_MAX);
    if (ns === cam.scale) return;
    var wx = (sx - cssW / 2) / cam.scale + cam.x;
    var wy = (sy - cssH / 2) / cam.scale + cam.y;
    cam.scale = ns;
    cam.x = wx - (sx - cssW / 2) / ns;
    cam.y = wy - (sy - cssH / 2) / ns;
    updateStatusChip(); // Zoom % lebt live, nicht erst im 500ms-Poll
  }

  function panByScreen(dx, dy) {
    scene.camera.x -= dx / scene.camera.scale;
    scene.camera.y -= dy / scene.camera.scale;
  }

  function hitTest(wx, wy, view) {
    // top -> bottom over visible blocks that expose hit()
    for (var i = scene.blocks.length - 1; i >= 0; i--) {
      var b = scene.blocks[i];
      if (!b.visible) continue;
      var def = scene.defs.get(b.type);
      if (!def || typeof def.hit !== 'function') continue;
      var handle = null;
      try {
        handle = def.hit(b, wx, wy, view);
      } catch (e) {
        console.error('0necanvas ui: hit() failed for "' + b.type + '"', e);
      }
      if (handle) return { block: b, handle: handle, def: def };
    }
    return null;
  }

  function firstTwoPointers() {
    var it = pointers.values();
    var a = it.next().value;
    var b = it.next().value;
    return [a, b];
  }

  function startPinch() {
    var pts = firstTwoPointers();
    gesture = {
      mode: 'pinch',
      prevDist: Math.max(1, Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)),
      prevMid: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }
    };
  }

  function onCanvasDown(ev) {
    ev.preventDefault();
    var pt = canvasPoint(ev);
    pointers.set(ev.pointerId, { x: pt.x, y: pt.y });
    try { els.canvas.setPointerCapture(ev.pointerId); } catch (e) { /* noop */ }

    if (pointers.size === 2) {
      // a second finger during a stroke means "zoom, not draw":
      // the half stroke is discarded, pinch takes over
      if (gesture && gesture.mode === 'draw') cancelDraw(gesture);
      if (gesture && gesture.mode === 'warp') setForceLive(gesture.block.id, false);
      startPinch();
      return;
    }
    if (pointers.size > 2) return;

    var world = scene.screenToWorld(pt.x, pt.y);

    if (tool === 'draw') {
      var db = beginDraw(world);
      gesture = db
        ? { mode: 'draw', block: db }
        : { mode: 'pan', last: { x: pt.x, y: pt.y }, moved: false, emptyTap: false };
      return;
    }

    if (tool === 'warp') {
      var wb = resolveWarpBlock(world[0], world[1]);
      if (!wb) { gesture = { mode: 'pan', last: { x: pt.x, y: pt.y }, moved: false, emptyTap: false }; return; }
      if (scene.selectedId !== wb.id) scene.select(wb.id);
      gesture = { mode: 'warp', block: wb, lastW: world.slice() };
      setForceLive(wb.id, true); // Kausalität: die Kraft-Glyphe pulsiert mit
      if (setWarpCenter(wb, world[0], world[1], null)) {
        touchState();
        refreshPropsValues();
      }
      return;
    }

    // move tool
    var hit = hitTest(world[0], world[1], makeView());
    if (hit) {
      selectViaCanvas = true;
      scene.select(hit.block.id);
      gesture = { mode: 'drag-block', block: hit.block, handle: hit.handle, def: hit.def, lastW: world.slice() };
    } else {
      gesture = { mode: 'pan', last: { x: pt.x, y: pt.y }, moved: false, emptyTap: true };
    }
  }

  function onCanvasMove(ev) {
    if (!pointers.has(ev.pointerId)) return;
    var pt = canvasPoint(ev);
    var prev = pointers.get(ev.pointerId);
    pointers.set(ev.pointerId, { x: pt.x, y: pt.y });
    if (!gesture) return;

    if (gesture.mode === 'pinch') {
      if (pointers.size < 2) return;
      var pts = firstTwoPointers();
      var dist = Math.max(1, Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y));
      var mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      zoomAt(mid.x, mid.y, dist / gesture.prevDist, pt.w, pt.h);
      panByScreen(mid.x - gesture.prevMid.x, mid.y - gesture.prevMid.y);
      gesture.prevDist = dist;
      gesture.prevMid = mid;
      touchState();
      return;
    }

    if (gesture.mode === 'drag-block') {
      var world = scene.screenToWorld(pt.x, pt.y);
      var dwx = world[0] - gesture.lastW[0];
      var dwy = world[1] - gesture.lastW[1];
      if (dwx || dwy) {
        if (typeof gesture.def.drag === 'function') {
          try {
            gesture.def.drag(gesture.block, gesture.handle, dwx, dwy);
          } catch (e) {
            console.error('0necanvas ui: drag() failed for "' + gesture.block.type + '"', e);
          }
        }
        gesture.lastW = world;
        touchState();
        refreshPropsValues();
      }
      return;
    }

    if (gesture.mode === 'draw') {
      var dw = scene.screenToWorld(pt.x, pt.y);
      var rawPts = gesture.block.params.pts;
      var lx = rawPts[rawPts.length - 2];
      var ly = rawPts[rawPts.length - 1];
      var minStep = DRAW_MIN_STEP_PX / Math.max(1e-6, scene.camera.scale);
      if (Math.hypot(dw[0] - lx, dw[1] - ly) >= minStep) {
        rawPts.push(dw[0], dw[1]);
      }
      return;
    }

    if (gesture.mode === 'warp') {
      var w2 = scene.screenToWorld(pt.x, pt.y);
      if (setWarpCenter(gesture.block, w2[0], w2[1], gesture.lastW)) {
        touchState();
        refreshPropsValues();
      }
      gesture.lastW = w2;
      return;
    }

    if (gesture.mode === 'pan') {
      var dx = pt.x - gesture.last.x;
      var dy = pt.y - gesture.last.y;
      if (!gesture.moved && Math.hypot(dx, dy) > TAP_SLOP_PX) gesture.moved = true;
      if (gesture.moved) {
        panByScreen(dx, dy);
        touchState();
      }
      gesture.last = { x: pt.x, y: pt.y };
    }
  }

  function onCanvasUp(ev) {
    if (!pointers.has(ev.pointerId)) return;
    pointers.delete(ev.pointerId);

    if (gesture && gesture.mode === 'pinch') {
      if (pointers.size === 1) {
        var rest = pointers.values().next().value;
        gesture = { mode: 'pan', last: { x: rest.x, y: rest.y }, moved: true, emptyTap: false };
      } else if (pointers.size === 0) {
        gesture = null;
      }
      return;
    }

    if (gesture && gesture.mode === 'draw') {
      finishDraw(gesture);
      gesture = null;
      return;
    }

    if (gesture && gesture.mode === 'warp') {
      setForceLive(gesture.block.id, false);
      gesture = null;
      return;
    }

    if (gesture && gesture.mode === 'pan' && !gesture.moved && gesture.emptyTap) {
      scene.select(null); // tap on empty canvas deselects
    }
    gesture = null;
  }

  // double-click delegates to the block def (pfad: delete control point)
  function onCanvasDblClick(ev) {
    ev.preventDefault();
    if (tool !== 'move') return;
    var pt = canvasPoint(ev);
    var world = scene.screenToWorld(pt.x, pt.y);
    var hit = hitTest(world[0], world[1], makeView());
    if (!hit || typeof hit.def.doubleClick !== 'function') return;
    var changed = false;
    try {
      changed = !!hit.def.doubleClick(hit.block, hit.handle);
    } catch (e) {
      console.error('0necanvas ui: doubleClick() failed for "' + hit.block.type + '"', e);
    }
    if (changed) touchState();
  }

  function onCanvasWheel(ev) {
    ev.preventDefault();
    var pt = canvasPoint(ev);
    var dy = ev.deltaY;
    if (ev.deltaMode === 1) dy *= 33;       // lines -> px
    else if (ev.deltaMode === 2) dy *= 300; // pages -> px
    zoomAt(pt.x, pt.y, Math.exp(-dy * 0.0014), pt.w, pt.h);
    touchState();
  }

  /* ---------- share / fullscreen ---------- */

  function shareUrl() {
    if (window.OneCanvasState && typeof OneCanvasState.shareUrl === 'function') {
      try { return OneCanvasState.shareUrl(); } catch (e) { console.warn('0necanvas ui: shareUrl failed', e); }
    }
    return location.href;
  }

  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  function onShare() {
    var url = shareUrl();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(
        function () { toast('Link kopiert'); },
        function () { toast(legacyCopy(url) ? 'Link kopiert' : 'Kopieren fehlgeschlagen'); }
      );
    } else {
      toast(legacyCopy(url) ? 'Link kopiert' : 'Kopieren fehlgeschlagen');
    }
  }

  // composited PNG: schwarzer Hintergrund + Canvas-Inhalt (das native
  // Rechtsklick-PNG ist transparent — auf hellem Viewer unsichtbar)
  function onExport() {
    var src = els.canvas;
    if (!src || !src.width || !src.height) { toast('Nichts zu exportieren'); return; }
    var out = document.createElement('canvas');
    out.width = src.width;
    out.height = src.height;
    var g = out.getContext('2d');
    var bg = '#000';
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue('--bg-color').trim();
      if (v) bg = v;
    } catch (e) { /* fallback #000 */ }
    g.fillStyle = bg;
    g.fillRect(0, 0, out.width, out.height);
    g.drawImage(src, 0, 0);
    function download(blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = '0nefinity-canvas.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      toast('PNG exportiert');
    }
    if (out.toBlob) {
      out.toBlob(function (blob) {
        if (blob) download(blob);
        else toast('Export fehlgeschlagen');
      }, 'image/png');
    } else {
      try {
        var dataUrl = out.toDataURL('image/png');
        var a2 = document.createElement('a');
        a2.href = dataUrl;
        a2.download = '0nefinity-canvas.png';
        a2.click();
        toast('PNG exportiert');
      } catch (e) {
        toast('Export fehlgeschlagen');
      }
    }
  }

  function onFullscreen() {
    var doc = document;
    if (doc.fullscreenElement || doc.webkitFullscreenElement) {
      var exit = doc.exitFullscreen || doc.webkitExitFullscreen;
      if (exit) exit.call(doc);
      return;
    }
    var stage = els.stage || els.canvas.parentElement;
    var req = stage.requestFullscreen || stage.webkitRequestFullscreen;
    if (req) {
      var p = req.call(stage);
      if (p && p.catch) p.catch(function () { toast('Vollbild nicht verfügbar'); });
    } else {
      toast('Vollbild nicht verfügbar');
    }
  }

  /* ---------- camera rescue: fit view / new scene / off-view pill ---------- */

  function blockAnchor(b) {
    var p = b.params || {};
    var x = Number(hasKey(p, 'x') ? p.x : (hasKey(p, 'cx') ? p.cx : 0));
    var y = Number(hasKey(p, 'y') ? p.y : (hasKey(p, 'cy') ? p.cy : 0));
    return [isFinite(x) ? x : 0, isFinite(y) ? y : 0];
  }

  // world-space bounding box of all visible blocks' emitted prims.
  // The probe view is centered on the blocks' anchors (not the camera),
  // so viewport-relative emitters (gitter) produce bounds around the
  // content instead of around a lost camera position.
  function computeSceneBounds() {
    var ax = 0, ay = 0, n = 0, i, b;
    for (i = 0; i < scene.blocks.length; i++) {
      b = scene.blocks[i];
      if (!b.visible) continue;
      var a = blockAnchor(b);
      ax += a[0]; ay += a[1]; n++;
    }
    if (!n) return null;
    ax /= n; ay /= n;

    var r = els.canvas.getBoundingClientRect();
    var half = 1200;
    var probeView = {
      w: r.width || 800, h: r.height || 600, dpr: 1,
      scale: (r.width || 800) / (half * 2),
      left: ax - half, right: ax + half, top: ay - half, bottom: ay + half,
      selectedId: null
    };

    var bb = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    var any = false;
    function grow(x0, y0, x1, y1) {
      if (!isFinite(x0) || !isFinite(y0) || !isFinite(x1) || !isFinite(y1)) return;
      any = true;
      if (x0 < bb.minX) bb.minX = x0;
      if (y0 < bb.minY) bb.minY = y0;
      if (x1 > bb.maxX) bb.maxX = x1;
      if (y1 > bb.maxY) bb.maxY = y1;
    }
    for (i = 0; i < scene.blocks.length; i++) {
      b = scene.blocks[i];
      if (!b.visible) continue;
      var def = scene.defs.get(b.type);
      if (!def || def.kind === 'kraft' || typeof def.emit !== 'function') continue;
      var prims;
      try { prims = def.emit(b, 0, 0, probeView) || []; } catch (e) { continue; }
      for (var pi = 0; pi < prims.length; pi++) {
        var p = prims[pi];
        if (p.k === 'poly') {
          var pts = p.pts || [];
          for (var k = 0; k + 1 < pts.length; k += 2) {
            grow(pts[k], pts[k + 1], pts[k], pts[k + 1]);
          }
        } else {
          var hx = p.k === 'glyph' ? (Number(p.size) || 0) * 0.75 : (Number(p.r) || 0);
          grow(p.x - hx, p.y - hx, p.x + hx, p.y + hx);
        }
      }
    }
    return any ? bb : null;
  }

  function fitView() {
    var bb = computeSceneBounds();
    if (!bb) { toast('Nichts einzupassen'); return; }
    var r = els.canvas.getBoundingClientRect();
    var bw = Math.max(20, bb.maxX - bb.minX);
    var bh = Math.max(20, bb.maxY - bb.minY);
    var s = clamp(Math.min((r.width || 800) / bw, (r.height || 600) / bh) * 0.85,
      ZOOM_MIN, ZOOM_MAX);
    scene.camera.x = (bb.minX + bb.maxX) / 2;
    scene.camera.y = (bb.minY + bb.maxY) / 2;
    scene.camera.scale = s;
    hideOffviewPill();
    updateStatusChip();
    touchState();
  }

  function onNewScene() {
    if (!window.confirm('Szene leeren und mit der Standard-Szene neu starten?')) return;
    scene.load({ v: 1, blocks: [], camera: { x: 0, y: 0, scale: 1 } });
    buildDefaultScene(scene);
    if (window.OneCanvasState && typeof OneCanvasState.clearUrl === 'function') {
      try { OneCanvasState.clearUrl(); } catch (e) { console.warn('0necanvas ui: clearUrl failed', e); }
    }
  }

  // "off view" detection: blocks exist but the canvas is fully blank —
  // checked via a tiny downscaled readback (cheap at 2s cadence)
  var probeCanvas = null;
  var probeCtx = null;

  function hideOffviewPill() {
    if (els.offviewPill) els.offviewPill.hidden = true;
  }

  function checkOffview() {
    if (!els.offviewPill) return;
    var hasEmitter = false;
    for (var i = 0; i < scene.blocks.length; i++) {
      var b = scene.blocks[i];
      if (!b.visible) continue;
      var def = scene.defs.get(b.type);
      if (def && def.kind !== 'kraft' && typeof def.emit === 'function') { hasEmitter = true; break; }
    }
    if (!hasEmitter) { hideOffviewPill(); return; }
    if (!probeCanvas) {
      probeCanvas = document.createElement('canvas');
      probeCanvas.width = 64;
      probeCanvas.height = 36;
      probeCtx = probeCanvas.getContext('2d', { willReadFrequently: true });
    }
    var lit = false;
    try {
      probeCtx.clearRect(0, 0, 64, 36);
      probeCtx.drawImage(els.canvas, 0, 0, 64, 36);
      var data = probeCtx.getImageData(0, 0, 64, 36).data;
      for (var j = 3; j < data.length; j += 4) {
        if (data[j] > 8) { lit = true; break; }
      }
    } catch (e) {
      lit = true; // readback failed: never nag
    }
    els.offviewPill.hidden = lit;
  }

  /* ---------- Flüster-Onboarding + Leerzustands-Hinweise ---------- */
  // Kein Modal mehr: drei verankerte Flüsterzeilen (Mitte, Werkzeuge,
  // Stapel), die der ersten Interaktion weichen und nie wiederkommen.

  var HINT_LS_KEY = 'oc-hint-v1';
  var whisperDone = false;

  function lsGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, val); } catch (e) { /* privacy mode */ }
  }

  function markWorked() {
    if (whisperDone) return;
    whisperDone = true;
    lsSet(HINT_LS_KEY, '1');
    document.body.classList.add('oc-worked'); // CSS blendet die Zeilen aus
  }

  function initWhispers() {
    if (lsGet(HINT_LS_KEY)) { whisperDone = true; return; }
    var ws = [els.whisperCenter, els.whisperTools, els.whisperStack];
    for (var i = 0; i < ws.length; i++) {
      if (ws[i]) ws[i].hidden = false;
    }
    // Erstinteraktion: der erste Tap oder Tastendruck irgendwo
    window.addEventListener('pointerdown', markWorked, { capture: true, once: true });
    window.addEventListener('keydown', markWorked, { capture: true, once: true });
  }

  /* ---------- Fokus-Modus: nur das Werk ---------- */
  // Taste F oder der Halbmond oben rechts: aller Rand weicht, ein atmender
  // Punkt unten rechts führt zurück (auch F/Escape beenden).

  function inFocus() {
    return document.body.classList.contains('oc-focus');
  }

  function enterFocus() {
    if (inFocus()) return;
    document.body.classList.add('oc-focus');
    scene.select(null); // schließt Chip + Regler-Panel
    closeStackPanel();
    closeLibrary();
    toast('Fokus — nur das Werk. Der Punkt unten rechts führt zurück.', { ms: 2600 });
  }

  function exitFocus() {
    if (!inFocus()) return;
    document.body.classList.remove('oc-focus');
    wake();
  }

  function toggleFocus() {
    if (inFocus()) exitFocus();
    else enterFocus();
  }

  // stiller Leerzustand erklärt sich nicht selbst: leere Szene -> auf das
  // + zeigen; nur Kräfte im Stapel -> erklären, dass darunter etwas fehlt
  function updateEmptyHint() {
    if (!els.emptyHint) return;
    var emitters = 0, forces = 0;
    for (var i = 0; i < scene.blocks.length; i++) {
      var b = scene.blocks[i];
      if (!b.visible) continue;
      var def = scene.defs.get(b.type);
      if (!def) continue;
      if (def.kind === 'kraft') forces++;
      else emitters++;
    }
    var msg = '';
    if (!emitters && !forces) {
      msg = 'Leere Szene — „+" am rechten Rand fügt Bausteine hinzu';
    } else if (!emitters && forces) {
      msg = 'Nur Kräfte im Stapel — Kräfte brauchen etwas darunter (Ding oder Erzeuger)';
    }
    els.emptyHint.textContent = msg;
    els.emptyHint.hidden = !msg;
  }

  /* ---------- Stapel auf/zu (Glyphen-Spine <-> Panel) ---------- */

  function isDesktopLayout() {
    return window.matchMedia('(min-width: 900px)').matches;
  }

  function stackPanelOpen() {
    return document.body.classList.contains('oc-stack-open');
  }

  // Mobiles Drill-in-Sheet: Peek (Mini-Strahl im Griff) / Halb / Voll.
  // Desktop ignoriert die Klassen (CSS lebt in der 768px-Query).
  var sheetState = 'half';

  function setSheetState(st) {
    sheetState = st;
    document.body.classList.toggle('oc-sheet-peek', st === 'peek');
    document.body.classList.toggle('oc-sheet-full', st === 'full');
    wake();
  }

  function cycleSheetState() {
    setSheetState(sheetState === 'peek' ? 'half' : (sheetState === 'half' ? 'full' : 'peek'));
  }

  function openStackPanel() {
    // explizit geöffnet (Pille, Spine, Zurück-Pfeil): mindestens Halb —
    // in den Peek-Streifen führt nur der Griff oder ein Canvas-Tap
    if (!stackPanelOpen() && sheetState === 'peek') setSheetState('half');
    document.body.classList.add('oc-stack-open');
    wake();
  }

  function closeStackPanel() {
    document.body.classList.remove('oc-stack-open');
    wake();
  }

  function toggleStackPanel() {
    if (stackPanelOpen()) closeStackPanel();
    else openStackPanel();
  }

  /* ---------- Idle-Dim: der Rand weicht dem Werk ---------- */
  // 3,5 s ohne Eingabe -> body.oc-idle (Edge-Layer auf Opacity 0.05,
  // siehe 0necanvas.css). Kein Dim solange ein Panel offen ist (Stapel,
  // Bibliothek, Regler) oder ein Zeiger gedrückt bleibt (Slider-Drag).

  var idleTimer = 0;
  var lastWakeArm = 0;
  var pointerHeld = false;

  function uiBusy() {
    return pointerHeld
      || stackPanelOpen()
      || document.body.classList.contains('oc-props-open')
      || paletteOpenState()
      || (els.libOverlay && els.libOverlay.classList.contains('open'));
  }

  function armIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () {
      if (uiBusy()) { armIdle(); return; }
      document.body.classList.add('oc-idle');
    }, IDLE_MS);
  }

  function wake() {
    document.body.classList.remove('oc-idle');
    // pointermove feuert im Sekundentakt hundertfach — Timer nur alle
    // 200ms neu spannen (dim ~3,5s nach der letzten Bewegung, gut genug)
    var now = Date.now();
    if (now - lastWakeArm < 200) return;
    lastWakeArm = now;
    armIdle();
  }

  function initIdleDim() {
    window.addEventListener('pointermove', wake, { passive: true });
    window.addEventListener('pointerdown', function () { pointerHeld = true; wake(); }, true);
    window.addEventListener('pointerup', function () { pointerHeld = false; wake(); }, true);
    window.addEventListener('pointercancel', function () { pointerHeld = false; wake(); }, true);
    window.addEventListener('blur', function () { pointerHeld = false; });
    window.addEventListener('keydown', wake, true);
    window.addEventListener('wheel', wake, { passive: true, capture: true });
    armIdle();
  }

  // Boot-Selects (Default-Szene / ?s=-Load) öffnen das Regler-Panel NICHT —
  // stille Bühne zuerst; erst die erste Nutzer-Auswahl holt die Regler
  var autoPropsTabArmed = false;

  /* ---------- init ---------- */

  function init(sc) {
    if (scene) { console.warn('0necanvas ui: init called twice, ignoring'); return; }
    scene = sc;

    els = {
      canvas: $('oc-canvas'),
      stage: $('oc-stage'),
      app: $('oc-app'),
      side: $('oc-side'),
      stackList: $('oc-stack-list'),
      stackN: $('oc-stack-n'),
      stackPill: $('oc-stack-pill'),
      addPill: $('oc-add-pill'),
      stackClose: $('oc-stack-close'),
      spine: $('oc-spine'),
      spineAdd: $('oc-spine-add'),
      spineList: $('oc-spine-list'),
      libOverlay: $('oc-lib-overlay'),
      libScroll: $('oc-lib-scroll'),
      libSearch: $('oc-lib-search'),
      addBtn: $('oc-add-btn'),
      toolMove: $('oc-tool-move'),
      toolWarp: $('oc-tool-warp'),
      toolDraw: $('oc-tool-draw'),
      shareBtn: $('oc-share-btn'),
      exportBtn: $('oc-export-btn'),
      fullscreenBtn: $('oc-fullscreen-btn'),
      fitBtn: $('oc-fit-btn'),
      newBtn: $('oc-new-btn'),
      limitPill: $('oc-limit-pill'),
      heavyPill: $('oc-heavy-pill'),
      offviewPill: $('oc-offview-pill'),
      emptyHint: $('oc-empty-hint'),
      ribbon: $('oc-ctrl-ribbon'),
      ribbonIco: $('oc-ribbon-ico'),
      ribbonName: $('oc-ribbon-name'),
      ribbonMeta: $('oc-ribbon-meta'),
      corner: $('oc-corner'),
      selframe: $('oc-selframe'),
      chip: $('oc-chip'),
      chipIco: $('oc-chip-ico'),
      chipName: $('oc-chip-name'),
      chipKind: $('oc-chip-kind'),
      chipRegler: $('oc-chip-regler'),
      chipDup: $('oc-chip-dup'),
      chipDel: $('oc-chip-del'),
      focusBtn: $('oc-focus-btn'),
      focusExit: $('oc-focus-exit'),
      whisperCenter: $('oc-whisper-center'),
      whisperTools: $('oc-whisper-tools'),
      whisperStack: $('oc-whisper-stack'),
      status: $('oc-status'),
      stZoom: $('oc-st-zoom'),
      stFps: $('oc-st-fps'),
      stInst: $('oc-st-inst'),
      palette: $('oc-palette'),
      palInput: $('oc-pal-input'),
      palList: $('oc-pal-list'),
      palEmpty: $('oc-pal-empty'),
      sheetGrip: $('oc-sheet-grip'),
      minibeam: $('oc-minibeam'),
      ribbonBack: $('oc-ribbon-back')
    };

    // scene hooks
    sc.onStackChange(function () {
      renderStack();
      updateEmptyHint();
      // selected block may be gone (delete without select event, load)
      if (!getBlock(sc.selectedId)) {
        unbindPropsPanel();
      }
    });
    sc.onSelect(function (id) {
      updateStackSelection();
      var viaCanvas = selectViaCanvas;
      selectViaCanvas = false;
      var block = getBlock(id);
      if (!block) { unbindPropsPanel(); updateHullOverlay(); return; }
      if (!autoPropsTabArmed) {
        // Boot-Select (Default-Szene / ?s=): stille Bühne zuerst — das
        // Regler-Panel öffnet erst auf die erste Nutzer-Auswahl
        unbindPropsPanel();
        return;
      }
      // Kontext am Objekt: ein Canvas-Tap auf ein Werk zeigt nur Hüllbox +
      // Chip — das Regler-Panel folgt erst über den Chip ("Regler") oder
      // bleibt offen, wenn es schon offen war. Kräfte (Verzerren-Werkzeug)
      // haben keinen Chip und öffnen das Panel wie bisher.
      var panelShown = document.body.classList.contains('oc-props-open');
      var quiet = viaCanvas && !panelShown && blockKind(block) !== 'kraft';
      if (!quiet) {
        if (propsBlock !== block) bindPropsPanel(block);
        else refreshPropsValues();
        setPanelShown(true);
      }
      updateHullOverlay();
    });
    // boot (default scene / URL load) runs synchronously after init —
    // arm the panel auto-open only afterwards
    setTimeout(function () { autoPropsTabArmed = true; }, 0);

    // stack initial paint
    renderStack();

    // library
    els.addBtn.addEventListener('click', openLibrary);
    var libClose = $('oc-lib-close');
    if (libClose) libClose.addEventListener('click', closeLibrary);
    els.libOverlay.addEventListener('click', function (e) {
      if (e.target === els.libOverlay) closeLibrary();
    });
    if (els.libSearch) els.libSearch.addEventListener('input', applyLibFilter);

    // Tastatur: Cmd/Strg+K (Palette), Escape-Kette, V/W/Z/F/A/H,
    // Cmd/Strg+D (Duplizieren), Entf/Backspace (Löschen mit Undo-Toast)
    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && String(e.key).toLowerCase() === 'k') {
        e.preventDefault(); // auch aus Eingabefeldern heraus
        if (paletteOpenState()) closePalette();
        else openPalette();
        return;
      }
      if (e.key === 'Escape') {
        // definierte Reihenfolge: Palette -> Fokus -> Bibliothek -> Stapel -> Auswahl
        if (paletteOpenState()) closePalette();
        else if (inFocus()) exitFocus();
        else if (els.libOverlay.classList.contains('open')) closeLibrary();
        else if (stackPanelOpen()) closeStackPanel();
        else if (scene.selectedId) scene.select(null);
        return;
      }
      var t = e.target;
      if (t && t.closest && t.closest('input, textarea, select, [contenteditable]')) return;
      var k = String(e.key).toLowerCase();
      if ((e.metaKey || e.ctrlKey) && !e.altKey && k === 'd') {
        var dupB = getBlock(scene.selectedId);
        if (dupB) {
          e.preventDefault();
          duplicateBlock(dupB);
        }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (k === 'v') setTool('move');
      else if (k === 'w') setTool('warp');
      else if (k === 'z') setTool('draw');
      else if (k === 'f') { e.preventDefault(); toggleFocus(); }
      else if (k === 'a') { e.preventDefault(); openLibrary(); }
      else if (k === 'h') {
        var hidB = getBlock(scene.selectedId);
        if (hidB) toggleBlockVisible(hidB);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        var delB = getBlock(scene.selectedId);
        if (delB) {
          e.preventDefault();
          removeBlockWithUndo(delB);
        }
      }
    });

    // Kommando-Palette: Suche, Pfeiltasten, Enter (Empty-State -> Bibliothek)
    if (els.palInput) {
      els.palInput.addEventListener('input', function () {
        palIdx = 0;
        renderPalette(els.palInput.value);
      });
      els.palInput.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          if (!palItems.length) return;
          palIdx = clamp(palIdx + (e.key === 'ArrowDown' ? 1 : -1), 0, palItems.length - 1);
          markPalActive();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (palItems.length) runPalItem(palIdx);
          else { closePalette(); openLibrary(); }
        }
      });
    }
    if (els.palette) {
      els.palette.addEventListener('click', function (e) {
        if (e.target === els.palette) closePalette();
      });
    }

    // Stapel auf/zu: Spine (Desktop), Pillen (Mobil), Schließen-Knopf
    if (els.spine) {
      els.spine.addEventListener('click', function (e) {
        if (e.target.closest && e.target.closest('#oc-spine-add')) return;
        openStackPanel();
      });
    }
    if (els.spineAdd) {
      els.spineAdd.addEventListener('click', function (e) {
        e.stopPropagation();
        openLibrary();
      });
    }
    if (els.stackClose) els.stackClose.addEventListener('click', closeStackPanel);
    if (els.stackPill) {
      els.stackPill.addEventListener('click', function () {
        // Regler-Sheet offen: die Stapel-Pille bringt den Stapel nach vorn
        // (Pillen-Zeile bleibt IMMER erreichbar, kein Zwischenschritt)
        if (isSheetMobile() && document.body.classList.contains('oc-props-open')) {
          setPanelShown(false);
          openStackPanel();
          return;
        }
        toggleStackPanel();
      });
    }
    if (els.addPill) els.addPill.addEventListener('click', openLibrary);
    // Mobil: Tipp auf die Leinwand faltet das Sheet auf den Peek-Streifen
    // zusammen (Mini-Strahl bleibt als Anker sichtbar)
    els.canvas.addEventListener('pointerdown', function () {
      if (isSheetMobile() && stackPanelOpen() && sheetState !== 'peek') setSheetState('peek');
    });
    // Drill-in-Sheet: Griff wechselt schmal/halb/voll, der Mini-Strahl
    // klappt auf, der Zurück-Pfeil im Ribbon führt vom Regler zum Stapel
    if (els.sheetGrip) {
      els.sheetGrip.addEventListener('click', function (e) {
        e.stopPropagation();
        cycleSheetState();
      });
    }
    if (els.minibeam) {
      els.minibeam.addEventListener('click', function () { setSheetState('half'); });
    }
    if (els.ribbonBack) {
      els.ribbonBack.addEventListener('click', function () {
        setPanelShown(false);
        openStackPanel();
      });
    }

    // Strahl-Endpunkte: das Auge als stiller Endpunkt oben
    var eyeMarks = document.querySelectorAll('#oc-spine .spine-eye, #oc-side .beam-eye .bt-mark');
    for (var ei = 0; ei < eyeMarks.length; ei++) eyeMarks[ei].innerHTML = ICON_EYE;

    // Stiller Rand: UI dimmt bei Inaktivität weg
    initIdleDim();

    // tools
    els.toolMove.addEventListener('click', function () { setTool('move'); });
    els.toolWarp.addEventListener('click', function () { setTool('warp'); });
    if (els.toolDraw) els.toolDraw.addEventListener('click', function () { setTool('draw'); });
    setTool('move');

    // canvas gestures
    els.canvas.addEventListener('pointerdown', onCanvasDown);
    els.canvas.addEventListener('pointermove', onCanvasMove);
    els.canvas.addEventListener('pointerup', onCanvasUp);
    els.canvas.addEventListener('pointercancel', onCanvasUp);
    els.canvas.addEventListener('dblclick', onCanvasDblClick);
    els.canvas.addEventListener('wheel', onCanvasWheel, { passive: false });

    // actions
    els.shareBtn.addEventListener('click', onShare);
    if (els.exportBtn) els.exportBtn.addEventListener('click', onExport);
    els.fullscreenBtn.addEventListener('click', onFullscreen);
    if (els.fitBtn) els.fitBtn.addEventListener('click', fitView);
    if (els.newBtn) els.newBtn.addEventListener('click', onNewScene);
    if (els.offviewPill) els.offviewPill.addEventListener('click', fitView);

    // Kontext am Objekt: Chip-Aktionen
    if (els.chipRegler) {
      els.chipRegler.addEventListener('click', function () {
        var b = getBlock(scene.selectedId);
        if (!b) return;
        if (propsBlock !== b) bindPropsPanel(b);
        setPanelShown(true);
        wake();
      });
    }
    if (els.chipDup) {
      els.chipDup.addEventListener('click', function () {
        var b = getBlock(scene.selectedId);
        if (b) duplicateBlock(b);
      });
    }
    if (els.chipDel) {
      els.chipDel.addEventListener('click', function () {
        var b = getBlock(scene.selectedId);
        if (b) removeBlockWithUndo(b);
      });
    }

    // Fokus-Modus: Halbmond oben rechts, atmender Punkt führt zurück
    if (els.focusBtn) els.focusBtn.addEventListener('click', toggleFocus);
    if (els.focusExit) els.focusExit.addEventListener('click', exitFocus);

    // Flüster-Onboarding + Leerzustands-Hinweis
    initWhispers();
    updateEmptyHint();

    // Status-Chip unten rechts (Desktop): erste Werte, dann 500ms-Poll
    if (els.status) {
      els.status.hidden = false;
      updateStatusChip();
    }

    // status pills (poll: flags are per-frame, no engine event).
    // heavy pill: fps < 10 sustained over ~2s; hides again with hysteresis.
    // off-view pill: checked at a 2s cadence (tiny canvas readback).
    var slowPolls = 0;
    var pollTick = 0;
    setInterval(function () {
      updateStatusChip();
      if (els.limitPill) els.limitPill.hidden = !sc.instanceLimitHit;
      if (els.heavyPill) {
        var f = sc.fps;
        if (f > 0 && f < 10) slowPolls++;
        else slowPolls = 0;
        if (slowPolls >= 4) els.heavyPill.hidden = false;
        else if (slowPolls === 0 && (!f || f >= 12)) els.heavyPill.hidden = true;
      }
      if (++pollTick % 4 === 0) checkOffview();
    }, 500);
  }

  /* ---------- default scene ---------- */

  function addIfKnown(sc, type) {
    if (!sc.defs.has(type)) {
      console.warn('0necanvas ui: default scene skips unknown block type "' + type + '"');
      return null;
    }
    return sc.add(type);
  }

  // pick a select option matching a regex (value or label) on any select
  // entry whose key is in the candidate list
  function setSelectByMatch(sc, block, keyCandidates, rx) {
    if (!block) return false;
    var def = sc.defs.get(block.type);
    var schema = (def && def.schema) || [];
    for (var i = 0; i < schema.length; i++) {
      var entry = schema[i];
      if (entry.ctrl !== 'select') continue;
      if (keyCandidates.indexOf(entry.key) < 0) continue;
      var options = entryOptions(entry);
      for (var j = 0; j < options.length; j++) {
        if (rx.test(String(options[j].value)) || rx.test(String(options[j].label))) {
          block.params[entry.key] = options[j].value;
          return true;
        }
      }
    }
    return false;
  }

  function buildDefaultScene(sc) {
    sc.camera.x = 0;
    sc.camera.y = 0;
    sc.camera.scale = 1;

    var gitter = addIfKnown(sc, 'gitter');
    setParam(gitter, ['brightness', 'helligkeit', 'alpha'], 0.18);

    // symbol sits behind the curve (added first = lower in the stack)
    var symbol = addIfKnown(sc, 'symbol');
    setParam(symbol, ['opacity', 'deckkraft', 'alpha'], 0.35);
    setParam(symbol, ['size', 'groesse'], 220);

    var kurve = addIfKnown(sc, 'kurve');
    setParam(kurve, ['morph'], 72);
    setParam(kurve, ['glow', 'gluehen'], 14);

    var spawner = addIfKnown(sc, 'spawner');
    setParam(spawner, ['rate'], 2);

    var warp = addIfKnown(sc, 'verzerren');
    setSelectByMatch(sc, warp, ['art', 'mode', 'typ', 'type', 'kind'], /welle|wave/i);
    setParam(warp, ['staerke', 'strength', 'amount', 'power'], 12);
    setParam(warp, ['radius'], 700);

    if (kurve) sc.select(kurve.id);
    touchState();
  }

  window.OneCanvasUI = {
    init: init,
    buildDefaultScene: buildDefaultScene
  };
})();
