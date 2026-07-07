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
  var ZOOM_MIN = 0.05;
  var ZOOM_MAX = 50;
  var TAP_SLOP_PX = 5;

  var scene = null;
  var els = {};
  var tool = 'move';
  var activeCat = 'ding';
  var toastEl = null;
  var toastTimer = 0;
  var suppressRowClickUntil = 0;

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

  /* ---------- stack panel ---------- */

  function renderStack() {
    var list = els.stackList;
    list.innerHTML = '';
    // display reversed: top of the stack is the first row
    for (var i = scene.blocks.length - 1; i >= 0; i--) {
      list.appendChild(buildStackRow(scene.blocks[i]));
    }
  }

  function buildStackRow(block) {
    var def = scene.defs.get(block.type);
    var kind = def ? def.kind : 'ding';

    var li = document.createElement('li');
    li.className = 'stack-row'
      + (block.id === scene.selectedId ? ' selected' : '')
      + (block.visible ? '' : ' hidden-layer');
    li.dataset.id = block.id;

    var handle = document.createElement('span');
    handle.className = 'drag-handle';
    handle.textContent = '⠿';
    handle.title = 'Ziehen zum Umsortieren';
    handle.addEventListener('pointerdown', function (ev) {
      startRowDrag(ev, li, handle);
    });

    var icon = document.createElement('span');
    icon.className = 'type-icon ' + kind;
    icon.textContent = (def && def.icon) || '◆';

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

    var eye = document.createElement('button');
    eye.className = 'eye-btn' + (block.visible ? '' : ' off');
    eye.textContent = block.visible ? '◉' : '○';
    eye.title = block.visible ? 'Ausblenden' : 'Einblenden';
    eye.setAttribute('aria-label', eye.title);
    eye.addEventListener('click', function (ev) {
      ev.stopPropagation();
      block.visible = !block.visible;
      eye.classList.toggle('off', !block.visible);
      eye.textContent = block.visible ? '◉' : '○';
      eye.title = block.visible ? 'Ausblenden' : 'Einblenden';
      li.classList.toggle('hidden-layer', !block.visible);
      touchState();
    });

    var del = document.createElement('button');
    del.className = 'del-btn';
    del.textContent = '✕';
    del.title = 'Löschen';
    del.setAttribute('aria-label', 'Baustein löschen');
    del.addEventListener('click', function (ev) {
      ev.stopPropagation();
      // one-step undo: snapshot before removal, restore via toast action
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
    });

    li.appendChild(handle);
    li.appendChild(icon);
    li.appendChild(label);
    li.appendChild(eye);
    li.appendChild(del);

    li.addEventListener('click', function () {
      if (Date.now() < suppressRowClickUntil) return;
      scene.select(block.id);
    });
    return li;
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

  function setPanelShown(shown) {
    document.body.classList.toggle('oc-props-open', !!shown);
    if (!propsPanel || !propsPanel.el) return;
    var wasHidden = propsPanel.el.classList.contains('oc-hidden');
    propsPanel.el.classList.toggle('oc-hidden', !shown);
    if (shown && wasHidden) {
      // panel could not measure itself while hidden — let controls.js re-layout
      try { window.dispatchEvent(new Event('resize')); } catch (e) { /* noop */ }
    }
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
      propsTitleIcon.textContent = (def && def.icon) || '◆';
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
    for (var i = 0; i < schema.length; i++) {
      var entry = schema[i];
      if (entry.ctrl === 'hidden') continue;
      if (!hasKey(block.params, entry.key)) continue;
      block.params[entry.key] = entry.value;
      propsPanel.set(entry.key, entry.value); // updates UI without onChange
    }
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

  function renderLibTabs() {
    var tabs = els.libTabs;
    tabs.innerHTML = '';
    for (var i = 0; i < CAT_ORDER.length; i++) {
      (function (cat) {
        var btn = document.createElement('button');
        btn.className = 'cat-tab' + (cat === activeCat ? ' active' : '');
        btn.textContent = CAT_LABEL[cat];
        btn.dataset.cat = cat;
        btn.addEventListener('click', function () {
          activeCat = cat;
          renderLibTabs();
          renderLibTiles();
        });
        tabs.appendChild(btn);
      })(CAT_ORDER[i]);
    }
  }

  function renderLibTiles() {
    var grid = els.libGrid;
    grid.innerHTML = '';
    var defsList = libDefs();
    var any = false;
    for (var i = 0; i < defsList.length; i++) {
      if (defsList[i].kind !== activeCat) continue;
      any = true;
      (function (def) {
        var tile = document.createElement('button');
        tile.className = 'tile';
        var ic = document.createElement('span');
        ic.className = 't-icon';
        ic.textContent = def.icon || '◆';
        var nm = document.createElement('span');
        nm.className = 't-name';
        nm.textContent = def.label || def.type;
        tile.appendChild(ic);
        tile.appendChild(nm);
        tile.addEventListener('click', function () {
          var block = scene.add(def.type);
          if (def.kind !== 'kraft') slotBelowTopForces(block);
          scene.select(block.id);
          closeLibrary();
          touchState();
          els.stackList.scrollTop = 0;
        });
        grid.appendChild(tile);
      })(defsList[i]);
    }
    if (!any) {
      var empty = document.createElement('div');
      empty.className = 'props-empty';
      empty.textContent = 'Keine Bausteine in dieser Kategorie';
      grid.appendChild(empty);
    }
  }

  function openLibrary() {
    renderLibTabs();
    renderLibTiles();
    els.libOverlay.classList.add('open');
  }

  function closeLibrary() {
    els.libOverlay.classList.remove('open');
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
      if (setWarpCenter(wb, world[0], world[1], null)) {
        touchState();
        refreshPropsValues();
      }
      return;
    }

    // move tool
    var hit = hitTest(world[0], world[1], makeView());
    if (hit) {
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

  /* ---------- floating side panel (desktop >=900px) ---------- */
  // drag on the BAUSTEINE header undocks the sidebar into a floating panel;
  // double-click on the header docks it back. Position is session-only.

  var panelFloating = false;

  function isDesktopLayout() {
    return window.matchMedia('(min-width: 900px)').matches;
  }

  function dockPanel() {
    if (!panelFloating) return;
    panelFloating = false;
    els.side.classList.remove('floating');
    if (els.app) els.app.classList.remove('side-floating');
    els.side.style.left = '';
    els.side.style.top = '';
    els.side.style.height = '';
  }

  function positionPanel(left, top) {
    var w = els.side.offsetWidth || 320;
    var maxL = window.innerWidth - w - 4;
    var maxT = window.innerHeight - 48;
    els.side.style.left = clamp(left, 4, Math.max(4, maxL)) + 'px';
    els.side.style.top = clamp(top, 4, Math.max(4, maxT)) + 'px';
  }

  function beginFloat(rect) {
    panelFloating = true;
    els.side.style.height = Math.min(rect.height, window.innerHeight - 16) + 'px';
    els.side.classList.add('floating');
    if (els.app) els.app.classList.add('side-floating');
    positionPanel(rect.left, rect.top);
  }

  function initPanelDrag() {
    var head = els.side ? els.side.querySelector('#oc-stack-section .panel-head') : null;
    if (!head) return;

    head.addEventListener('dblclick', function (e) {
      if (e.target.closest && e.target.closest('button')) return;
      dockPanel();
    });

    head.addEventListener('pointerdown', function (ev) {
      if (!ev.isPrimary || !isDesktopLayout()) return;
      if (ev.target.closest && ev.target.closest('button')) return;
      ev.preventDefault();

      var startX = ev.clientX;
      var startY = ev.clientY;
      var rect = els.side.getBoundingClientRect();
      var offX = startX - rect.left;
      var offY = startY - rect.top;
      var dragging = panelFloating;

      try { head.setPointerCapture(ev.pointerId); } catch (e) { /* older browsers */ }

      function onMove(mv) {
        if (mv.pointerId !== ev.pointerId) return;
        if (!dragging && Math.hypot(mv.clientX - startX, mv.clientY - startY) < 4) return;
        dragging = true;
        if (!panelFloating) beginFloat(rect);
        positionPanel(mv.clientX - offX, mv.clientY - offY);
        mv.preventDefault();
      }
      function onEnd(up) {
        if (up.pointerId !== ev.pointerId) return;
        head.removeEventListener('pointermove', onMove);
        head.removeEventListener('pointerup', onEnd);
        head.removeEventListener('pointercancel', onEnd);
      }
      head.addEventListener('pointermove', onMove);
      head.addEventListener('pointerup', onEnd);
      head.addEventListener('pointercancel', onEnd);
    });

    window.addEventListener('resize', function () {
      if (!panelFloating) return;
      if (!isDesktopLayout()) { dockPanel(); return; }
      positionPanel(parseFloat(els.side.style.left) || 4, parseFloat(els.side.style.top) || 4);
    });
  }

  /* ---------- mobile sheet ---------- */

  // boot-time selects (default scene) must not shove the controls.js
  // bottom sheet over the Bausteine sheet — only USER selections do
  var autoPropsTabArmed = false;
  var sheetCollapsed = false;
  var suppressTabClickUntil = 0;

  function setMobileTab(name) {
    if (els.side) els.side.dataset.mtab = name;
    var btns = els.sheetTabs ? els.sheetTabs.querySelectorAll('[data-mtab-btn]') : [];
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].dataset.mtabBtn === name);
    }
  }

  function setSheetCollapsed(v) {
    sheetCollapsed = !!v;
    if (els.side) els.side.classList.toggle('collapsed', sheetCollapsed);
  }

  // grip drag: pulling the tab row down minimizes the sheet (~72px, only
  // the tabs stay visible), pulling up restores the 46dvh height
  function initSheetDrag() {
    if (!els.sheetTabs) return;
    els.sheetTabs.addEventListener('pointerdown', function (ev) {
      if (!ev.isPrimary || isDesktopLayout()) return;
      var startY = ev.clientY;
      var done = false;
      try { els.sheetTabs.setPointerCapture(ev.pointerId); } catch (e) { /* noop */ }
      function onMove(mv) {
        if (mv.pointerId !== ev.pointerId || done) return;
        var dy = mv.clientY - startY;
        if (Math.abs(dy) > 18) {
          done = true;
          setSheetCollapsed(dy > 0);
          suppressTabClickUntil = Date.now() + 350;
        }
      }
      function onEnd(up) {
        if (up.pointerId !== ev.pointerId) return;
        els.sheetTabs.removeEventListener('pointermove', onMove);
        els.sheetTabs.removeEventListener('pointerup', onEnd);
        els.sheetTabs.removeEventListener('pointercancel', onEnd);
      }
      els.sheetTabs.addEventListener('pointermove', onMove);
      els.sheetTabs.addEventListener('pointerup', onEnd);
      els.sheetTabs.addEventListener('pointercancel', onEnd);
    });
  }

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
      libOverlay: $('oc-lib-overlay'),
      libGrid: $('oc-lib-grid'),
      libTabs: $('oc-lib-tabs'),
      addBtn: $('oc-add-btn'),
      toolMove: $('oc-tool-move'),
      toolWarp: $('oc-tool-warp'),
      toolDraw: $('oc-tool-draw'),
      shareBtn: $('oc-share-btn'),
      fullscreenBtn: $('oc-fullscreen-btn'),
      fitBtn: $('oc-fit-btn'),
      newBtn: $('oc-new-btn'),
      sheetTabs: $('oc-sheet-tabs'),
      limitPill: $('oc-limit-pill'),
      heavyPill: $('oc-heavy-pill'),
      offviewPill: $('oc-offview-pill')
    };

    // scene hooks
    sc.onStackChange(function () {
      renderStack();
      // selected block may be gone (delete without select event, load)
      if (!getBlock(sc.selectedId)) {
        unbindPropsPanel();
      }
    });
    sc.onSelect(function (id) {
      updateStackSelection();
      var block = getBlock(id);
      if (!block) { unbindPropsPanel(); return; }
      if (!autoPropsTabArmed && isSheetMobile()) {
        // boot select on mobile: Bausteine sheet stays in front; the
        // controls sheet opens on the first user selection instead
        unbindPropsPanel();
        return;
      }
      if (propsBlock !== block) bindPropsPanel(block);
      else refreshPropsValues();
      setPanelShown(true);
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
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeLibrary();
    });

    // floating stack panel (desktop)
    initPanelDrag();

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
    els.fullscreenBtn.addEventListener('click', onFullscreen);
    if (els.fitBtn) els.fitBtn.addEventListener('click', fitView);
    if (els.newBtn) els.newBtn.addEventListener('click', onNewScene);
    if (els.offviewPill) els.offviewPill.addEventListener('click', fitView);

    // mobile sheet tabs (+ grip drag to minimize/restore)
    if (els.sheetTabs) {
      els.sheetTabs.addEventListener('click', function (e) {
        if (Date.now() < suppressTabClickUntil) return;
        var btn = e.target.closest ? e.target.closest('[data-mtab-btn]') : null;
        if (btn) {
          setMobileTab(btn.dataset.mtabBtn);
          setSheetCollapsed(false);
        }
      });
      initSheetDrag();
    }

    // status pills (poll: flags are per-frame, no engine event).
    // heavy pill: fps < 10 sustained over ~2s; hides again with hysteresis.
    // off-view pill: checked at a 2s cadence (tiny canvas readback).
    var slowPolls = 0;
    var pollTick = 0;
    setInterval(function () {
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
