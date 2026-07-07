/* 0necanvas ui — window.OneCanvasUI
 *
 * Stack panel (drag-reorder, eye, delete), schema-driven properties renderer,
 * library overlay (3 tabs), tools move/warp/draw with full pointer gestures
 * (block drag, pan, wheel zoom on cursor, pinch, freehand strokes),
 * share/fullscreen,
 * mobile sheet tabs, default scene, instance-limit pill.
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
  var propControls = [];      // live control refs for refreshPropsValues()

  /* ---------- small helpers ---------- */

  function $(id) { return document.getElementById(id); }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function hasKey(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
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

  function fmtValue(v, entry) {
    var decimals = entry.decimals;
    if (decimals == null) {
      var step = entry.step;
      decimals = (step && step < 1) ? (step < 0.1 ? 2 : 1) : 0;
    }
    var n = Number(v);
    var s = isFinite(n) ? n.toFixed(decimals) : String(v);
    return s + (entry.unit ? ' ' + entry.unit : '');
  }

  // like fmtValue, but keeps typed precision beyond entry.decimals
  function fmtValueSmart(v, entry) {
    var n = Number(v);
    if (!isFinite(n)) return fmtValue(v, entry);
    var decimals = entry.decimals;
    if (decimals == null) {
      var step = entry.step;
      decimals = (step && step < 1) ? (step < 0.1 ? 2 : 1) : 0;
    }
    var s = n.toFixed(decimals);
    if (parseFloat(s) !== n) s = String(n);
    return s + (entry.unit ? ' ' + entry.unit : '');
  }

  // "5 000", "5,5 px", "1e3" -> number; null when nothing numeric was typed
  function parseTypedNumber(raw) {
    var s = String(raw).trim().replace(/\s+/g, '').replace(',', '.');
    var m = s.match(/-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/);
    if (!m) return null;
    var n = parseFloat(m[0]);
    return isFinite(n) ? n : null;
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

  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'oc-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 1600);
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
      scene.remove(block.id);
      touchState();
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

    function onMove(mv) {
      if (mv.pointerId !== ev.pointerId) return;
      if (!moved && Math.abs(mv.clientY - startY) < 4) return;
      moved = true;
      row.classList.add('dragging');
      var rows = otherRows();
      clearMarks(rows);
      var drop = computeDrop(mv.clientY, rows);
      dropIdx = drop.idx;
      if (drop.row) {
        drop.row.classList.add(drop.above ? 'drop-above' : 'drop-below');
      }
      mv.preventDefault();
    }

    function onEnd(up) {
      if (up.pointerId !== ev.pointerId) return;
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

  /* ---------- runtime slider ranges (session-only, never serialized) ---------- */

  var runtimeRanges = {};   // 'blockId:key' -> {min, max, step}

  function rangeOverride(block, entry, create) {
    var k = block.id + ':' + entry.key;
    if (!runtimeRanges[k] && create) {
      runtimeRanges[k] = { min: entry.min, max: entry.max, step: entry.step };
    }
    return runtimeRanges[k] || null;
  }

  function effRange(block, entry) {
    var o = rangeOverride(block, entry, false);
    var min = (o && isFinite(o.min)) ? o.min : entry.min;
    var max = (o && isFinite(o.max)) ? o.max : entry.max;
    if (min > max) { var t = min; min = max; max = t; }
    var step = (o && isFinite(o.step) && o.step > 0) ? o.step : entry.step;
    return { min: min, max: max, step: step };
  }

  // soft range: typed values outside min/max stretch the range instead of clamping
  function widenRange(block, entry, v) {
    var r = effRange(block, entry);
    if (v >= r.min && v <= r.max) return;
    var o = rangeOverride(block, entry, true);
    if (v < r.min) o.min = v;
    if (v > r.max) o.max = v;
  }

  /* ---------- range popover (min/max/step, per slider) ---------- */

  var rangePop = null;   // { el, anchor }

  function closeRangePopover() {
    if (!rangePop) return;
    if (rangePop.el.parentNode) rangePop.el.parentNode.removeChild(rangePop.el);
    rangePop = null;
  }

  function toggleRangePopover(anchor, block, entry, onApply) {
    if (rangePop && rangePop.anchor === anchor) { closeRangePopover(); return; }
    closeRangePopover();

    var el = document.createElement('div');
    el.className = 'prop-cfg-pop';

    var fields = [
      { f: 'min', label: 'Min' },
      { f: 'max', label: 'Max' },
      { f: 'step', label: 'Schritt' }
    ];
    var inputs = {};

    function syncInputs() {
      var r = effRange(block, entry);
      for (var f in inputs) inputs[f].value = String(r[f]);
    }

    for (var i = 0; i < fields.length; i++) {
      (function (fd) {
        var rowEl = document.createElement('div');
        rowEl.className = 'cfg-pop-row';
        var labEl = document.createElement('span');
        labEl.className = 'cfg-pop-label';
        labEl.textContent = fd.label;
        var inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'cfg-pop-input';
        inp.setAttribute('inputmode', 'decimal');
        inp.setAttribute('autocomplete', 'off');
        inp.setAttribute('spellcheck', 'false');
        inp.setAttribute('aria-label', fd.label + ' für ' + entry.label);
        inputs[fd.f] = inp;

        function commit() {
          var v = parseTypedNumber(inp.value);
          if (v == null || (fd.f === 'step' && !(v > 0))) { syncInputs(); return; }
          rangeOverride(block, entry, true)[fd.f] = v;
          onApply();
          syncInputs();
        }
        inp.addEventListener('change', commit);
        inp.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
          else if (e.key === 'Escape') { e.preventDefault(); syncInputs(); inp.blur(); e.stopPropagation(); }
        });

        rowEl.appendChild(labEl);
        rowEl.appendChild(inp);
        el.appendChild(rowEl);
      })(fields[i]);
    }

    var reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'cfg-pop-reset';
    reset.textContent = 'Zurücksetzen';
    reset.addEventListener('click', function () {
      delete runtimeRanges[block.id + ':' + entry.key];
      onApply();
      syncInputs();
    });
    el.appendChild(reset);

    document.body.appendChild(el);
    syncInputs();

    var a = anchor.getBoundingClientRect();
    var pw = el.offsetWidth;
    var ph = el.offsetHeight;
    var left = clamp(a.right - pw, 8, Math.max(8, window.innerWidth - pw - 8));
    var top = a.bottom + 6;
    if (top + ph > window.innerHeight - 8) top = Math.max(8, a.top - ph - 6);
    el.style.left = left + 'px';
    el.style.top = top + 'px';

    rangePop = { el: el, anchor: anchor };
  }

  /* ---------- properties panel (schema-driven) ---------- */

  function renderProps() {
    closeRangePopover();
    var body = els.propsBody;
    body.innerHTML = '';
    propControls = [];

    var block = getBlock(scene.selectedId);
    if (els.propsTitle) {
      els.propsTitle.textContent = block ? block.name : 'Eigenschaften';
    }
    if (!block) {
      var empty = document.createElement('div');
      empty.className = 'props-empty';
      empty.textContent = 'Kein Baustein angewählt';
      body.appendChild(empty);
      return;
    }

    var def = scene.defs.get(block.type);
    var kind = def ? def.kind : 'ding';

    var head = document.createElement('div');
    head.className = 'props-blockname';
    var hIcon = document.createElement('span');
    hIcon.className = 'type-icon ' + kind;
    hIcon.textContent = (def && def.icon) || '◆';
    var hName = document.createElement('span');
    hName.className = 'name';
    hName.textContent = block.name;
    var hKind = document.createElement('span');
    hKind.className = 'kind';
    hKind.textContent = KIND_LABEL[kind] || kind;
    head.appendChild(hIcon);
    head.appendChild(hName);
    head.appendChild(hKind);
    body.appendChild(head);

    var schema = (def && def.schema) || [];
    for (var i = 0; i < schema.length; i++) {
      var node = buildPropControl(block, schema[i]);
      if (node) body.appendChild(node);
    }
  }

  function buildPropControl(block, entry) {
    switch (entry.ctrl) {
      case 'slider': return buildSlider(block, entry);
      case 'toggle': return buildToggle(block, entry);
      case 'select': return buildSelect(block, entry);
      case 'text': return buildText(block, entry);
      case 'hidden': return null; // serialized param without UI (pfad pts)
      default:
        console.warn('0necanvas ui: unknown ctrl "' + entry.ctrl + '" for key "' + entry.key + '"');
        return null;
    }
  }

  function buildSlider(block, entry) {
    var row = document.createElement('div');
    row.className = 'prop-row';
    var line = document.createElement('div');
    line.className = 'prop-label-line';
    var lab = document.createElement('span');
    lab.className = 'prop-label';
    lab.textContent = entry.label;

    var val = document.createElement('input');
    val.type = 'text';
    val.className = 'prop-value prop-value-input';
    val.setAttribute('inputmode', 'decimal');
    val.setAttribute('autocomplete', 'off');
    val.setAttribute('spellcheck', 'false');
    val.setAttribute('aria-label', entry.label + ': Wert');
    val.value = fmtValueSmart(block.params[entry.key], entry);

    var cfgBtn = document.createElement('button');
    cfgBtn.type = 'button';
    cfgBtn.className = 'prop-cfg-btn';
    cfgBtn.textContent = '⚙︎';
    cfgBtn.title = 'Bereich einstellen';
    cfgBtn.setAttribute('aria-label', entry.label + ': Bereich einstellen');

    line.appendChild(lab);
    line.appendChild(val);
    line.appendChild(cfgBtn);

    var input = document.createElement('input');
    input.type = 'range';
    input.className = 'prop-range';

    function syncRangeAttrs() {
      var r = effRange(block, entry);
      input.min = r.min;
      input.max = r.max;
      input.step = (isFinite(r.step) && r.step > 0) ? r.step : 'any';
      var v = Number(block.params[entry.key]);
      input.value = isFinite(v) ? clamp(v, r.min, r.max) : r.min;
    }
    syncRangeAttrs();

    input.addEventListener('input', function () {
      var v = parseFloat(input.value);
      block.params[entry.key] = v;
      val.value = fmtValueSmart(v, entry);
      touchState();
    });

    // free-typed values: outside min/max is allowed, range stretches (soft range)
    function commitTyped() {
      var v = parseTypedNumber(val.value);
      if (v == null) {
        val.value = fmtValueSmart(block.params[entry.key], entry);
        return;
      }
      block.params[entry.key] = v;
      widenRange(block, entry, v);
      syncRangeAttrs();
      val.value = fmtValueSmart(v, entry);
      touchState();
    }
    val.addEventListener('focus', function () { val.select(); });
    val.addEventListener('blur', commitTyped);
    val.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        val.blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        val.value = fmtValueSmart(block.params[entry.key], entry);
        val.blur();
      }
    });

    cfgBtn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      toggleRangePopover(cfgBtn, block, entry, syncRangeAttrs);
    });

    row.appendChild(line);
    row.appendChild(input);
    propControls.push({
      block: block, entry: entry,
      refresh: function () {
        var v = block.params[entry.key];
        var n = Number(v);
        if (isFinite(n)) {
          if (n < parseFloat(input.min)) input.min = n;
          if (n > parseFloat(input.max)) input.max = n;
        }
        input.value = v;
        if (document.activeElement !== val) {
          val.value = fmtValueSmart(v, entry);
        }
      }
    });
    return row;
  }

  function buildToggle(block, entry) {
    var row = document.createElement('div');
    row.className = 'prop-toggle-row' + (block.params[entry.key] ? ' on' : '');
    var lab = document.createElement('span');
    lab.className = 'prop-label';
    lab.textContent = entry.label;
    var sw = document.createElement('span');
    sw.className = 'switch';
    row.appendChild(lab);
    row.appendChild(sw);
    row.addEventListener('click', function () {
      block.params[entry.key] = !block.params[entry.key];
      row.classList.toggle('on', !!block.params[entry.key]);
      touchState();
    });
    propControls.push({
      block: block, entry: entry,
      refresh: function () { row.classList.toggle('on', !!block.params[entry.key]); }
    });
    return row;
  }

  function buildSelect(block, entry) {
    var row = document.createElement('div');
    row.className = 'prop-row';
    var line = document.createElement('div');
    line.className = 'prop-label-line';
    var lab = document.createElement('span');
    lab.className = 'prop-label';
    lab.textContent = entry.label;
    line.appendChild(lab);

    var sel = document.createElement('select');
    sel.className = 'prop-select';
    var options = entry.options || [];
    for (var i = 0; i < options.length; i++) {
      var opt = document.createElement('option');
      opt.value = String(options[i].value);
      opt.textContent = options[i].label;
      opt.selected = (options[i].value === block.params[entry.key]);
      sel.appendChild(opt);
    }
    sel.addEventListener('change', function () {
      // preserve the original option value type (string/number)
      for (var j = 0; j < options.length; j++) {
        if (String(options[j].value) === sel.value) {
          block.params[entry.key] = options[j].value;
          break;
        }
      }
      touchState();
    });

    row.appendChild(line);
    row.appendChild(sel);
    propControls.push({
      block: block, entry: entry,
      refresh: function () { sel.value = String(block.params[entry.key]); }
    });
    return row;
  }

  function buildText(block, entry) {
    var row = document.createElement('div');
    row.className = 'prop-row';
    var line = document.createElement('div');
    line.className = 'prop-label-line';
    var lab = document.createElement('span');
    lab.className = 'prop-label';
    lab.textContent = entry.label;
    line.appendChild(lab);

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'prop-text';
    if (entry.maxlen) input.maxLength = entry.maxlen;
    input.value = block.params[entry.key] == null ? '' : String(block.params[entry.key]);
    input.addEventListener('input', function () {
      block.params[entry.key] = input.value;
      touchState();
    });

    row.appendChild(line);
    row.appendChild(input);
    propControls.push({
      block: block, entry: entry,
      refresh: function () {
        if (document.activeElement === input) return;
        input.value = block.params[entry.key] == null ? '' : String(block.params[entry.key]);
      }
    });
    return row;
  }

  // sync visible control values from params (used during canvas drags)
  function refreshPropsValues() {
    for (var i = 0; i < propControls.length; i++) {
      propControls[i].refresh();
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
    scene.select(block.id);
    touchState();
  }

  function cancelDraw(g) {
    if (g && g.block) scene.remove(g.block.id);
    touchState();
  }

  /* ---------- warp target resolution ---------- */

  function resolveWarpBlock() {
    var sel = getBlock(scene.selectedId);
    if (sel && sel.type === 'verzerren') return sel;
    for (var i = scene.blocks.length - 1; i >= 0; i--) {
      if (scene.blocks[i].type === 'verzerren') return scene.blocks[i];
    }
    if (scene.defs.has('verzerren')) {
      return scene.add('verzerren');
    }
    console.warn('0necanvas ui: warp tool has no "verzerren" block type available');
    return null;
  }

  // set warp center to an absolute world position; key names may drift
  // between parallel builder tasks, hence the candidate list + drag fallback
  function setWarpCenter(block, wx, wy, lastW) {
    var pairs = [
      ['cx', 'cy'], ['centerX', 'centerY'], ['zentrumX', 'zentrumY'],
      ['zx', 'zy'], ['x', 'y']
    ];
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
      var wb = resolveWarpBlock();
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

  /* ---------- mobile sheet tabs ---------- */

  function setMobileTab(name) {
    if (els.side) els.side.dataset.mtab = name;
    var btns = els.sheetTabs ? els.sheetTabs.querySelectorAll('[data-mtab-btn]') : [];
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].dataset.mtabBtn === name);
    }
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
      propsBody: $('oc-props-body'),
      propsTitle: $('oc-props-title'),
      libOverlay: $('oc-lib-overlay'),
      libGrid: $('oc-lib-grid'),
      libTabs: $('oc-lib-tabs'),
      addBtn: $('oc-add-btn'),
      toolMove: $('oc-tool-move'),
      toolWarp: $('oc-tool-warp'),
      toolDraw: $('oc-tool-draw'),
      shareBtn: $('oc-share-btn'),
      fullscreenBtn: $('oc-fullscreen-btn'),
      sheetTabs: $('oc-sheet-tabs'),
      limitPill: $('oc-limit-pill')
    };

    // scene hooks
    sc.onStackChange(function () {
      renderStack();
      // selected block may be gone or its schema-bound controls stale
      if (!getBlock(sc.selectedId)) {
        renderProps();
      }
    });
    sc.onSelect(function (id) {
      updateStackSelection();
      renderProps();
      if (id) setMobileTab('props');
    });

    // stack + props initial paint
    renderStack();
    renderProps();

    // library
    els.addBtn.addEventListener('click', openLibrary);
    var libClose = $('oc-lib-close');
    if (libClose) libClose.addEventListener('click', closeLibrary);
    els.libOverlay.addEventListener('click', function (e) {
      if (e.target === els.libOverlay) closeLibrary();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeLibrary(); closeRangePopover(); }
    });

    // range popover closes on tap/click outside
    document.addEventListener('pointerdown', function (e) {
      if (rangePop && !rangePop.el.contains(e.target) && !rangePop.anchor.contains(e.target)) {
        closeRangePopover();
      }
    });

    // floating properties/stack panel (desktop)
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

    // mobile sheet tabs
    if (els.sheetTabs) {
      els.sheetTabs.addEventListener('click', function (e) {
        var btn = e.target.closest ? e.target.closest('[data-mtab-btn]') : null;
        if (btn) setMobileTab(btn.dataset.mtabBtn);
      });
    }

    // instance-limit pill (poll: flag is per-frame, no engine event)
    if (els.limitPill) {
      setInterval(function () {
        els.limitPill.hidden = !sc.instanceLimitHit;
      }, 500);
    }
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
      var options = entry.options || [];
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
