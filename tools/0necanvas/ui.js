/* 0necanvas ui — window.OneCanvasUI
 *
 * Eine normale 0nefinity-Seite: das Original-Panel (tools/controls.js)
 * wird EINMAL beim Boot gebaut und danach nur noch gefuellt/geschaltet —
 * exakt das circleheart-Muster. Kein create/destroy, kein removeSection,
 * kein eigener Panel-Lifecycle:
 *   - Section "Bausteine": Stapel-Zeilen (Icon, Name, Auge, Loeschen,
 *     Drag-Reorder) + "+ Baustein" (Bibliothek).
 *   - Section "Werkzeuge": Bewegen / Verzerren / Zeichnen (V/W/Z).
 *   - Je Block-Typ eine Section mit dessen Schema-Controls, Keys
 *     namespaced ("kurve.size"). Selektion schaltet NUR Sichtbarkeit
 *     (showSection) und setzt Instanz-Werte via panel.set — wie
 *     circlehearts updateUI.
 *   - Header wie circleheart: nur Reset ("Neu") + Layout-Toggle, der
 *     Drag-Griff bleibt frei. Aktionen (Einpassen, PNG, Teilen,
 *     Vollbild) als Section "Werk" im Body; Status via addMetricsOverlay.
 *
 * Auf der Leinwand bleibt: Wortmarke, Erstbesuchs-Fluesterzeile,
 * Statuspillen, Bibliothek, Kommando-Palette (Cmd/Strg+K), Fokus-Modus,
 * alle Gesten (Drag, Pan, Zoom, Pinch, Zeichnen) und das
 * Selektions-Overlay der Engine.
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

  /* ---------- small helpers ---------- */

  function $(id) { return document.getElementById(id); }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function hasKey(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  // select entry.options may be an array OR a function returning one —
  // evaluated at panel build (alle Typen sind zu init() registriert)
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

  function blockKind(block) {
    var def = scene.defs.get(block.type);
    return def ? def.kind : 'ding';
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

  function isDesktopLayout() {
    return window.matchMedia('(min-width: 900px)').matches;
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

  /* ---------- das Panel: einmal gebaut, danach nur gefuellt ---------- */

  var panel = null;          // ControlPanel-Singleton (Seiten-Lebensdauer)
  var stackListEl = null;    // Stapel-Zeilen-Container in Section "Bausteine"
  var typeSections = [];     // [{ type, def, entries }] — eine Section je Typ
  var toolButtons = {};      // buttonKey -> Button-Element (aktiv-Markierung)
  var shownType = null;      // Typ der sichtbaren Section (null = keine)

  function panelKey(type, key) { return type + '.' + key; }

  function panelSliderLabel(entry) {
    return entry.unit ? entry.label + ' (' + entry.unit + ')' : entry.label;
  }

  function sectionFor(type) {
    for (var i = 0; i < typeSections.length; i++) {
      if (typeSections[i].type === type) return typeSections[i];
    }
    return null;
  }

  // onChange-Ziel ist immer die AKTUELLE Instanz dieses Typs — die Rows
  // werden einmal gebaut, der selektierte Block wechselt darunter
  function applyToSelected(type, entry, cast) {
    return function (v) {
      var b = getBlock(scene.selectedId);
      if (!b || b.type !== type) return;
      b.params[entry.key] = cast ? cast(v) : v;
      touchState();
    };
  }

  function addTypeControl(def, entry) {
    var key = panelKey(def.type, entry.key);
    switch (entry.ctrl) {
      case 'slider':
        panel.addSlider(key, {
          label: panelSliderLabel(entry),
          min: entry.min,
          max: entry.max,
          step: entry.step,
          value: Number(entry.value),
          decimals: entry.decimals,
          onChange: applyToSelected(def.type, entry)
        });
        return true;
      case 'toggle':
        panel.addToggle(key, {
          label: entry.label,
          value: !!entry.value,
          onChange: applyToSelected(def.type, entry, function (v) { return !!v; })
        });
        return true;
      case 'select':
        panel.addSelect(key, {
          label: entry.label,
          options: entryOptions(entry),
          value: entry.value,
          onChange: applyToSelected(def.type, entry)
        });
        return true;
      case 'text':
        panel.addInput(key, {
          label: entry.label,
          value: entry.value == null ? '' : String(entry.value),
          onChange: applyToSelected(def.type, entry, String)
        });
        if (entry.maxlen && panel.bodyEl) {
          var inp = panel.bodyEl.querySelector('[data-key="' + key + '"] .ctrl-input');
          if (inp) inp.maxLength = entry.maxlen;
        }
        return true;
      case 'patterns':
        if (typeof panel.addPatternPicker !== 'function') {
          console.warn('0necanvas ui: controls.js ohne addPatternPicker — "' + key + '" übersprungen');
          return false;
        }
        panel.addPatternPicker(key, {
          label: entry.label,
          patterns: entry.patterns || [],
          value: typeof entry.value === 'string' ? entry.value : null,
          columns: entry.columns || 6,
          buttonSize: entry.buttonSize || 40,
          onChange: applyToSelected(def.type, entry, function (v) { return v || null; })
        });
        return true;
      case 'hidden':
        return false; // serialized param without UI (pfad pts)
      default:
        console.warn('0necanvas ui: unknown ctrl "' + entry.ctrl + '" for key "' + entry.key + '"');
        return false;
    }
  }

  function buildTypeSection(def) {
    var kind = def.kind || 'ding';
    panel.beginSection('type-' + def.type, {
      title: (def.label || def.type) + ' — ' + (KIND_LABEL[kind] || kind)
    });
    var entries = [];
    var schema = def.schema || [];
    for (var i = 0; i < schema.length; i++) {
      if (addTypeControl(def, schema[i])) entries.push(schema[i]);
    }
    panel.endSection();
    panel.showSection('type-' + def.type, false);
    typeSections.push({ type: def.type, def: def, entries: entries });
  }

  function buildPanel() {
    if (!window.Controls || typeof Controls.createPanel !== 'function') {
      console.warn('0necanvas ui: tools/controls.js fehlt — kein Controls-Panel');
      return;
    }
    panel = Controls.createPanel({ id: 'oc-ctrl-panel', position: 'left' });

    // Header wie circleheart: nur der Reset-Button — mehr Icons wuerden
    // auf Mobile den zentrierten Drag-Griff ueberdecken (Buttons sind
    // rechts absolut positioniert, 40px breit)
    panel.addResetButton({ icon: '∅', title: 'Neu — Szene leeren', onClick: onNewScene });

    // Status ueber dem Panel: Zoom / fps / Instanzen (Original-Overlay)
    panel.addMetricsOverlay('status', {
      label: 'Status',
      collapsed: !isDesktopLayout(),
      showFps: false,
      updateInterval: 500,
      getData: function () {
        return {
          items: [
            { label: 'Zoom', value: Math.round(scene.camera.scale * 100) + ' %' },
            { label: 'fps', value: scene.fps ? String(Math.round(scene.fps)) : '—' },
            { label: 'Instanzen', value: String(scene.instancesDrawn || 0) }
          ]
        };
      }
    });

    // Section "Bausteine": der Stapel + Bibliothek-Zugang
    panel.beginSection('stapel', { title: 'Bausteine' });
    var stackSection = document.getElementById('oc-ctrl-panel-section-stapel');
    stackListEl = document.createElement('div');
    stackListEl.className = 'oc-stack';
    if (stackSection) stackSection.appendChild(stackListEl);
    panel.addButton('stapel.add', {
      label: '+ Baustein',
      title: 'Baustein hinzufügen — Bibliothek öffnen (A)',
      onClick: openLibrary
    });
    panel.endSection();

    // Section "Werkzeuge"
    panel.beginSection('werkzeuge', { title: 'Werkzeuge' });
    panel.addButtonGroup('tool', {
      buttons: [
        { key: 'move', label: 'Bewegen', title: 'Bewegen (V)', onClick: function () { setTool('move'); } },
        { key: 'warp', label: 'Verzerren', title: 'Verzerren (W)', onClick: function () { setTool('warp'); } },
        { key: 'draw', label: 'Zeichnen', title: 'Zeichnen (Z)', onClick: function () { setTool('draw'); } }
      ]
    });
    panel.endSection();
    var btns = panel.bodyEl.querySelectorAll('[data-key="tool"] .ctrl-button');
    for (var b = 0; b < btns.length; b++) {
      toolButtons[btns[b].dataset.buttonKey] = btns[b];
    }

    // Je Block-Typ eine Section, in Familien-Reihenfolge der Bibliothek
    var defsList = libDefs();
    for (var c = 0; c < CAT_ORDER.length; c++) {
      for (var i = 0; i < defsList.length; i++) {
        if (defsList[i].kind === CAT_ORDER[c]) buildTypeSection(defsList[i]);
      }
    }
    for (var j = 0; j < defsList.length; j++) {
      if (CAT_ORDER.indexOf(defsList[j].kind) < 0) buildTypeSection(defsList[j]);
    }

    // Section "Werk": Aktionen als normale Panel-Buttons (circleheart-
    // Muster: Aktionen wohnen im Body, nicht im Header)
    panel.beginSection('werk', { title: 'Werk' });
    panel.addButtonGroup('werk.ansicht', {
      buttons: [
        { key: 'fit', label: 'Einpassen', title: 'Ansicht auf die Szene zentrieren', onClick: fitView },
        { key: 'vollbild', label: 'Vollbild', title: 'Vollbild', onClick: onFullscreen }
      ]
    });
    panel.addButtonGroup('werk.teilen', {
      buttons: [
        { key: 'png', label: 'PNG', title: 'Als PNG exportieren', onClick: onExport },
        { key: 'teilen', label: 'Teilen', title: 'Teilen — Szene liegt in der URL', onClick: onShare }
      ]
    });
    panel.endSection();
  }

  // panel.set kennt die Pattern-Buttons nicht — aktive Kachel per Index
  // spiegeln (Grid-Reihenfolge: [keins, ...entry.patterns])
  function syncPatternPicker(key, entry, value) {
    var picker = panel.bodyEl.querySelector('.ctrl-pattern-picker[data-key="' + key + '"]');
    if (!picker) return;
    var tiles = picker.querySelectorAll('.ctrl-pattern-btn');
    var patterns = entry.patterns || [];
    var want = typeof value === 'string' ? value : null;
    for (var i = 0; i < tiles.length; i++) {
      var id = i === 0 ? null : (patterns[i - 1] ? patterns[i - 1].id : undefined);
      tiles[i].classList.toggle('active', id === want);
    }
  }

  // Instanz-Werte in die (bestehenden) Rows spiegeln — panel.set feuert
  // kein onChange, exakt das circleheart-updateUI-Muster
  function setPanelValues(block) {
    var sec = sectionFor(block.type);
    if (!sec) return;
    for (var i = 0; i < sec.entries.length; i++) {
      var entry = sec.entries[i];
      var key = panelKey(block.type, entry.key);
      var v = block.params[entry.key];
      panel.set(key, entry.ctrl === 'toggle' ? !!v : v);
      if (entry.ctrl === 'patterns') syncPatternPicker(key, entry, v);
    }
  }

  // Boot-Selektion (Default-Szene / ?s=-Load) laeuft synchron nach init —
  // erst danach scrollt eine Nutzer-Selektion die Typ-Section ins Bild
  var bootDone = false;

  // Panel-Body zur eingeblendeten Typ-Section scrollen, wenn sie
  // ausserhalb des sichtbaren Ausschnitts liegt (Stapel steht darueber)
  function scrollTypeSectionIntoView(type) {
    requestAnimationFrame(function () {
      if (!panel || !panel.bodyEl) return;
      var secEl = document.getElementById('oc-ctrl-panel-section-type-' + type);
      if (!secEl || secEl.classList.contains('hidden')) return;
      var br = panel.bodyEl.getBoundingClientRect();
      var sr = secEl.getBoundingClientRect();
      if (sr.top < br.top || sr.top > br.bottom - 60) {
        panel.bodyEl.scrollTop += Math.round(sr.top - br.top);
      }
    });
  }

  // Selektion -> nur Sichtbarkeit schalten + Werte setzen
  function syncSelection() {
    if (!panel) return;
    var block = getBlock(scene.selectedId);
    var type = block ? block.type : null;
    if (type !== shownType) {
      for (var i = 0; i < typeSections.length; i++) {
        panel.showSection('type-' + typeSections[i].type, typeSections[i].type === type);
      }
      shownType = type;
      // showSection stoesst das Mobil-Sheet-Layout nicht an — eine
      // No-op-Row-Visibility ueber die Original-API holt den Refresh nach
      panel.setRowVisibility('tool', true);
      if (type && bootDone) scrollTypeSectionIntoView(type);
    }
    if (block) setPanelValues(block);
    updateStackSelection();
  }

  // sync panel UI from params without firing onChange (used during canvas drags)
  function refreshPropsValues() {
    if (!panel) return;
    var block = getBlock(scene.selectedId);
    if (block && block.type === shownType) setPanelValues(block);
  }

  /* ---------- Stapel-Zeilen in Section "Bausteine" ---------- */

  function renderStack() {
    if (!stackListEl) return;
    stackListEl.innerHTML = '';
    if (!scene.blocks.length) {
      var empty = document.createElement('div');
      empty.className = 'oc-stack-empty';
      empty.textContent = 'Noch keine Bausteine';
      stackListEl.appendChild(empty);
    }
    // display reversed: top of the stack is the first row
    for (var i = scene.blocks.length - 1; i >= 0; i--) {
      stackListEl.appendChild(buildStackRow(scene.blocks[i]));
    }
    updateEmptyHint();
  }

  function buildStackRow(block) {
    var def = scene.defs.get(block.type);
    var kind = def ? def.kind : 'ding';

    var row = document.createElement('div');
    row.className = 'oc-row k-' + kind
      + (block.id === scene.selectedId ? ' selected' : '')
      + (block.visible ? '' : ' hidden-layer');
    row.dataset.id = block.id;

    var handle = document.createElement('span');
    handle.className = 'oc-row-handle';
    handle.textContent = '⠿';
    handle.title = 'Ziehen zum Umsortieren';
    handle.addEventListener('pointerdown', function (ev) {
      startRowDrag(ev, row, handle);
    });

    var icon = document.createElement('span');
    icon.className = 'type-icon ' + kind;
    setTypeIcon(icon, def);

    var name = document.createElement('span');
    name.className = 'oc-row-name';
    name.textContent = block.name;
    name.title = (KIND_LABEL[kind] || kind) + ' — ' + block.name;

    var eye = document.createElement('button');
    eye.type = 'button';
    eye.className = 'oc-row-btn eye' + (block.visible ? '' : ' off');
    eye.textContent = block.visible ? '◉' : '○';
    eye.title = block.visible ? 'Ausblenden (H)' : 'Einblenden (H)';
    eye.setAttribute('aria-label', eye.title);
    eye.addEventListener('click', function (ev) {
      ev.stopPropagation();
      toggleBlockVisible(block);
    });

    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'oc-row-btn del';
    del.textContent = '✕';
    del.title = 'Löschen';
    del.setAttribute('aria-label', 'Baustein löschen');
    del.addEventListener('click', function (ev) {
      ev.stopPropagation();
      removeBlockWithUndo(block);
    });

    row.appendChild(handle);
    row.appendChild(icon);
    row.appendChild(name);
    row.appendChild(eye);
    row.appendChild(del);

    row.addEventListener('click', function () {
      if (Date.now() < suppressRowClickUntil) return;
      scene.select(block.id);
    });
    return row;
  }

  function updateStackSelection() {
    if (!stackListEl) return;
    var rows = stackListEl.children;
    for (var i = 0; i < rows.length; i++) {
      rows[i].classList.toggle('selected', rows[i].dataset.id === scene.selectedId);
    }
  }

  // Verzerren-Drag: die Kraft-Glyphe der Stapel-Zeile pulsiert, solange
  // gezogen wird — Ursache und Wirkung bleiben verbunden
  function setForceLive(id, on) {
    if (!stackListEl) return;
    var row = stackListEl.querySelector('[data-id="' + id + '"]');
    if (!row) return;
    var ic = row.querySelector('.type-icon');
    if (ic) ic.classList.toggle('force-live', on);
  }

  // one-step undo: snapshot before removal, restore via toast action
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

  function toggleBlockVisible(block) {
    block.visible = !block.visible;
    renderStack();
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
    var scrollEl = panel ? panel.bodyEl : null;

    try { handle.setPointerCapture(ev.pointerId); } catch (e) { /* older browsers */ }

    function otherRows() {
      var out = [];
      var kids = stackListEl.children;
      for (var i = 0; i < kids.length; i++) {
        if (kids[i].dataset.id && kids[i].dataset.id !== draggedId) out.push(kids[i]);
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

    // Panel-Body auto-scrolls while the pointer sits in the edge zone
    var SCROLL_ZONE_PX = 32;
    function autoScrollTick() {
      scrollRAF = 0;
      if (!scrollEl) return;
      var lr = scrollEl.getBoundingClientRect();
      var v = 0;
      if (lastClientY < lr.top + SCROLL_ZONE_PX) {
        v = -Math.ceil((lr.top + SCROLL_ZONE_PX - lastClientY) / 3);
      } else if (lastClientY > lr.bottom - SCROLL_ZONE_PX) {
        v = Math.ceil((lastClientY - (lr.bottom - SCROLL_ZONE_PX)) / 3);
      }
      if (!v) return;
      var before = scrollEl.scrollTop;
      scrollEl.scrollTop = before + v;
      if (scrollEl.scrollTop !== before) markDropAt(lastClientY);
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
    if (panel && panel.bodyEl) panel.bodyEl.scrollTop = 0;
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
      { ico: '⛶', label: 'Vollbild', extra: 'fullscreen', run: onFullscreen }
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

  /* ---------- tools ---------- */

  function setTool(name) {
    tool = name;
    for (var k in toolButtons) {
      if (hasKey(toolButtons, k)) toolButtons[k].classList.toggle('active', k === name);
    }
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
      scene.select(hit.block.id);
      gesture = { mode: 'drag-block', block: hit.block, handle: hit.handle, def: hit.def, lastW: world.slice() };
    } else {
      gesture = { mode: 'pan', last: { x: pt.x, y: pt.y }, moved: false, emptyTap: true };
    }
  }

  function onCanvasMove(ev) {
    if (!pointers.has(ev.pointerId)) return;
    var pt = canvasPoint(ev);
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

  /* ---------- Flüster-Onboarding + Leerzustands-Hinweis ---------- */
  // Eine einzige Erstbesuchs-Zeile, die der ersten Interaktion weicht
  // und nie wiederkommt.

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
    document.body.classList.add('oc-worked'); // CSS blendet die Zeile aus
  }

  function initWhispers() {
    if (lsGet(HINT_LS_KEY)) { whisperDone = true; return; }
    if (els.whisperCenter) els.whisperCenter.hidden = false;
    // Erstinteraktion: der erste Tap oder Tastendruck irgendwo
    window.addEventListener('pointerdown', markWorked, { capture: true, once: true });
    window.addEventListener('keydown', markWorked, { capture: true, once: true });
  }

  /* ---------- Fokus-Modus: nur das Werk ---------- */
  // Taste F oder die Palette: aller Rand weicht (auch das Panel), ein
  // atmender Punkt unten rechts führt zurück (auch F/Escape beenden).

  function inFocus() {
    return document.body.classList.contains('oc-focus');
  }

  function enterFocus() {
    if (inFocus()) return;
    document.body.classList.add('oc-focus');
    scene.select(null);
    closeLibrary();
    toast('Fokus — nur das Werk. Der Punkt unten rechts führt zurück.', { ms: 2600 });
  }

  function exitFocus() {
    if (!inFocus()) return;
    document.body.classList.remove('oc-focus');
    // Panel konnte sich versteckt nicht vermessen — controls.js re-layouten
    try { window.dispatchEvent(new Event('resize')); } catch (e) { /* noop */ }
    wake();
  }

  function toggleFocus() {
    if (inFocus()) exitFocus();
    else enterFocus();
  }

  // stiller Leerzustand erklärt sich nicht selbst: leere Szene -> auf das
  // Panel zeigen; nur Kräfte im Stapel -> erklären, dass darunter etwas fehlt
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
      msg = 'Leere Szene — „+ Baustein" im Panel fügt Bausteine hinzu';
    } else if (!emitters && forces) {
      msg = 'Nur Kräfte im Stapel — Kräfte brauchen etwas darunter (Ding oder Erzeuger)';
    }
    els.emptyHint.textContent = msg;
    els.emptyHint.hidden = !msg;
  }

  /* ---------- Idle-Dim: der Rand weicht dem Werk ---------- */
  // 3,5 s ohne Eingabe -> body.oc-idle (Wortmarke + Pillen auf Opacity
  // 0.05, siehe 0necanvas.css). Das Panel dimmt NIE. Kein Dim solange
  // Bibliothek/Palette offen sind oder ein Zeiger gedrückt bleibt.

  var idleTimer = 0;
  var lastWakeArm = 0;
  var pointerHeld = false;

  function uiBusy() {
    return pointerHeld
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

  /* ---------- init ---------- */

  function init(sc) {
    if (scene) { console.warn('0necanvas ui: init called twice, ignoring'); return; }
    scene = sc;

    els = {
      canvas: $('oc-canvas'),
      stage: $('oc-stage'),
      libOverlay: $('oc-lib-overlay'),
      libScroll: $('oc-lib-scroll'),
      libSearch: $('oc-lib-search'),
      limitPill: $('oc-limit-pill'),
      heavyPill: $('oc-heavy-pill'),
      offviewPill: $('oc-offview-pill'),
      emptyHint: $('oc-empty-hint'),
      whisperCenter: $('oc-whisper-center'),
      focusExit: $('oc-focus-exit'),
      palette: $('oc-palette'),
      palInput: $('oc-pal-input'),
      palList: $('oc-pal-list'),
      palEmpty: $('oc-pal-empty')
    };

    // das Panel: EINMAL bauen, Original-Lifecycle macht den Rest
    // (Position, Bar-Mode, Mobil-Sheet inkl. initPosition/Peek)
    buildPanel();

    // scene hooks: Stapel-Zeilen neu malen, Selektion nur schalten
    sc.onStackChange(function () {
      renderStack();
      syncSelection(); // selected block may be gone (delete, load)
    });
    sc.onSelect(function () {
      syncSelection();
    });

    // initial paint
    renderStack();
    syncSelection();
    // boot (default scene / URL load) runs synchronously after init
    setTimeout(function () { bootDone = true; }, 0);

    // library
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
        // Escape aus der Regler-UI wirkt nur lokal (controls.js: Popup zu +
        // Trigger fokussieren, Config-Wert-Revert, Wert-Feld behalten) — die
        // globale Kette wuerde sonst den Block deselektieren. Erkennung
        // dreistufig: defaultPrevented = controls.js-Popup-Handler hat schon
        // lokal behandelt; closest = Fokus in Regler-UI ohne lokalen Handler;
        // offenes Popup im DOM = Popup offen, Fokus woanders.
        var escFrom = e.target;
        if (e.defaultPrevented ||
            (escFrom && escFrom.closest &&
             escFrom.closest('.ctrl-panel, .ctrl-select-popup, .ctrl-config-popup')) ||
            document.querySelector('.ctrl-select-popup.open, .ctrl-config-popup.open')) {
          return;
        }
        // definierte Reihenfolge: Palette -> Fokus -> Bibliothek -> Auswahl
        if (paletteOpenState()) closePalette();
        else if (inFocus()) exitFocus();
        else if (els.libOverlay.classList.contains('open')) closeLibrary();
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

    // Stiller Rand: Wortmarke dimmt bei Inaktivität weg (Panel nie)
    initIdleDim();

    // tools (Panel-ButtonGroup ist gebaut — aktiv-Markierung setzen)
    setTool('move');

    // canvas gestures
    els.canvas.addEventListener('pointerdown', onCanvasDown);
    els.canvas.addEventListener('pointermove', onCanvasMove);
    els.canvas.addEventListener('pointerup', onCanvasUp);
    els.canvas.addEventListener('pointercancel', onCanvasUp);
    els.canvas.addEventListener('dblclick', onCanvasDblClick);
    els.canvas.addEventListener('wheel', onCanvasWheel, { passive: false });

    if (els.offviewPill) els.offviewPill.addEventListener('click', fitView);

    // Fokus-Modus: atmender Punkt führt zurück
    if (els.focusExit) els.focusExit.addEventListener('click', exitFocus);

    // Flüster-Onboarding + Leerzustands-Hinweis
    initWhispers();
    updateEmptyHint();

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
