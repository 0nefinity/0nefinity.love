// Dev-only Editor. Ohne Login: im Menue ein Eingang zu /enternity. Eingeloggt: oben im Menue
// die Admin-Zeile (veroeffentlichen, Analytics, Ausloggen), oben links neben dem Menue eine Reihe kleiner
// Symbole: bearbeiten ein/aus, rueckgaengig, wiederholen, Quelltext, Kommentare ein/aus, Aenderungen, jetzt speichern.
// Texte sind eingeloggt direkt editierbar und gehen 1,5 s nach dem letzten Tippen auf dev (sofort sichtbar);
// der Server committet und pusht gebuendelt im Hintergrund. Markierter Text bekommt eine kleine Leiste
// (fett, kursiv, Link, Formatierung weg). Kommentare sind HTML-Kommentare in der Seite.
// Alle Knoepfe rendern aus einem Zustand (render()).
// Backend: ~/0nefinity/editor/server.py hinter /api/edit/. Fehler stehen sichtbar unter den Symbolen.
(function oneEditor() {
  if (!location.hostname.startsWith('dev.')) return;

  const INLINE = new Set(['A', 'B', 'I', 'EM', 'STRONG', 'SPAN', 'BR', 'SUB', 'SUP', 'CODE', 'SMALL',
    'MARK', 'U', 'S', 'ABBR', 'Q', 'KBD', 'WBR']);
  const TEXT_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TD', 'TH', 'DT', 'DD',
    'BLOCKQUOTE', 'FIGCAPTION', 'CAPTION', 'SUMMARY', 'LABEL', 'PRE', 'A', 'SPAN', 'DIV', 'EM', 'STRONG', 'B', 'I']);
  const SKIP = 'script, style, svg, canvas, noscript, template, textarea, input, select, button, #meta-nav, [data-oe-ui], .ctrl-panel';
  const ERRORS = {
    unauthenticated: 'nicht eingeloggt',
    csrf: 'Anfrage abgelehnt',
    text_not_found: 'Stelle im Quelltext nicht gefunden, bitte über quelltext ändern',
    text_ambiguous: 'Text kommt mehrfach vor, bitte über quelltext ändern',
    changed_meanwhile: 'Datei wurde inzwischen geändert, neu laden',
    live_file_dirty: 'Live-Datei hat ungespeicherte Änderungen auf dem Server',
    unsaved_on_dev: 'erst speichern',
    not_tracked: 'Datei ist nicht im Repo',
    not_inline: 'diese Datei nur über quelltext',
    page_not_found: 'keine bearbeitbare Datei zu dieser Adresse',
  };
  const ANALYTICS = 'https://analytics.timbreitmar.de';
  // Ysabeau-Outlines '0' und '1', dieselben wie in der Menue-Lupe (generate-menu.py).
  const ZERO = 'M261 5Q198 5 148.5 -23.0Q99 -51 70.5 -99.0Q42 -147 42 -209Q42 -270 70.5 -317.5Q99 -365 148.0 -392.0Q197 -419 260 -419Q322 -419 371.5 -391.5Q421 -364 449.5 -316.5Q478 -269 478 -206Q478 -146 449.5 -97.5Q421 -49 372.5 -22.0Q324 5 261 5ZM261 -50Q304 -50 338.0 -70.0Q372 -90 391.0 -125.5Q410 -161 410 -206Q410 -251 391.0 -287.0Q372 -323 338.0 -344.0Q304 -365 260 -365Q217 -365 182.5 -345.0Q148 -325 128.0 -290.0Q108 -255 108 -209Q108 -164 128.0 -127.5Q148 -91 183.0 -70.5Q218 -50 261 -50Z';
  const ONE = 'M196 -414H243V0H175V-394L201 -360L59 -278L34 -322Z';

  let editing = false;
  let originals = new Map();
  let touched = new Set();
  let pagePath = location.pathname;
  let busy = 0;
  let overlay = null;
  let cmtOn = false;
  let noteArmed = false;
  let noteOpen = false;
  let source = null;
  let csrf = '';
  let iconSeq = 0;
  const badgeNode = new WeakMap();
  // Autosave: so lange nach dem letzten Tippen wird gespeichert, also ein Commit pro Schreibpause.
  const AUTOSAVE_MS = 1500;
  let saveTimer = null;
  let saving = null;
  let saveAgain = false;
  let leaving = false;
  let bar, status, extra, btnSave, btnCmt, btnNote, btnDiff, btnPub, btnEdit, btnSrc, btnUndo, btnRedo, selBar, menuSrc, menuDiff;
  // ready: Quelltext geladen; inline: Seite ist inline bearbeitbar; live: dev weicht von live ab.
  const st = { ready: false, inline: false, live: false };
  // Eigener Verlauf statt Browser-Undo: der kennt keine Autosave-Grenzen und vergisst alles, sobald
  // innerHTML gesetzt wird. Eintrag = Element + Inhalt davor; Tippen am selben Element ohne 1 s Pause ist ein Schritt.
  let undoStack = [];
  let redoStack = [];
  let lastSnap = { el: null, kind: '', t: 0 };
  let commitPoll = null;
  // Text, den ein Skript der Seite laufend umschreibt (Animationen), ist nicht bearbeitbar: sonst
  // speichert das Autosave einen zufaelligen Animationsstand. Eigene Aenderungen setzen ownAt.
  let ownAt = 0;
  let saveFailed = false;
  let watcher = null;

  // Live-Reload pausiert, solange bearbeitet wird, ein Fenster offen ist oder eine Anfrage laeuft:
  // ein Reload mitten im Speichern bricht die Antwort ab.
  function syncPause() { window.__oneEditing = editing || !!overlay || noteOpen || cmtOn || busy > 0; }

  // Admin/Login: 0, oben eine kleine 1, die den Kreis schneidet.
  // Ausloggen: Power-Zeichen aus 0 und 1, die 1 schneidet sich ihren Spalt aus der 0.
  const LINES = {
    pencil: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
    code: 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',
    bubble: 'M4 5h16v11h-9l-5 4v-4h-2z',
    diff: 'M12 4v8M8 8h8M8 18h8',
    save: 'M12 4v10M7.5 9.5l4.5 4.5 4.5-4.5M5 19h14',
    undo: 'M9 15L4 10l5-5M4 10h10a5 5 0 0 1 0 10h-4',
    redo: 'M15 15l5-5-5-5M20 10H10a5 5 0 0 0 0 10h4',
    link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
    clear: 'M6 5h12M12 5v14M5 19L19 5',
  };

  function icon(kind) {
    if (LINES[kind]) {
      return `<svg class="oe-ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${LINES[kind]}"/></svg>`;
    }
    const vb = '-20 -600 560 640';
    if (kind === 'admin') {
      return `<svg class="oe-icon" viewBox="${vb}" aria-hidden="true" focusable="false"><path d="${ZERO}"/>` +
        `<path d="${ONE}" transform="translate(155.5 -335) scale(.5)"/></svg>`;
    }
    // 0 und 1 in Originalgroesse wie die Menue-Lupe, also gleiche Strichstaerke; die 1 steht mittig ueber
    // dem Kreis und schneidet sich mit 60 Einheiten Abstand ihre Luecke. viewBox quadratisch um die 0-Mitte.
    const id = 'oe-pwr-' + (++iconSeq);
    const one = `<path d="${ONE}" transform="translate(51 -150)"/>`;
    const box = 'x="-54.5" y="-594" width="629" height="629"';
    return `<svg class="oe-icon oe-pwr" viewBox="-54.5 -594 629 629" aria-hidden="true" focusable="false">` +
      `<mask id="${id}" maskUnits="userSpaceOnUse" ${box}><rect ${box} fill="#fff"/>` +
      `<g fill="#000" stroke="#000" stroke-width="120" stroke-linejoin="round">${one}</g></mask>` +
      `<path d="${ZERO}" mask="url(#${id})"/>${one}</svg>`;
  }

  async function api(method, route, body) {
    busy++;
    syncPause();
    try {
      return await request(method, route, body);
    } finally {
      busy--;
      if (window.__oneReloadResync) window.__oneReloadResync();
      syncPause();
    }
  }

  async function request(method, route, body) {
    const opts = { method, credentials: 'same-origin', keepalive: route === 'save', headers: { Accept: 'application/json' } };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['X-0ne-Edit'] = '1';
      opts.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch('/api/edit/' + route, opts);
    } catch (e) {
      throw new Error('Editor-Dienst nicht erreichbar');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = ERRORS[data.error] || data.error || ('HTTP ' + res.status);
      throw new Error(data.detail ? msg + ' (' + data.detail + ')' : msg);
    }
    return data;
  }

  function q(route) { return route + '?path=' + encodeURIComponent(pagePath); }

  function say(text, kind) {
    status.textContent = text;
    status.dataset.kind = kind || '';
    if (kind === 'error') console.error('[editor] ' + text);
  }

  function setLive(differs) {
    st.live = !!differs;
    render();
  }

  async function loadSource() {
    source = await api('GET', q('source'));
    setLive(source.live_differs);
    return source;
  }

  // ------------------------------------------------------------ bearbeiten

  function candidates() {
    const out = [];
    const walk = (el) => {
      for (const child of el.children) {
        if (child.matches(SKIP)) continue;
        if (TEXT_TAGS.has(child.tagName) && child.textContent.trim() && isTextOnly(child)) {
          out.push(child);
        } else {
          walk(child);
        }
      }
    };
    walk(document.body);
    return out;
  }

  function isTextOnly(el) {
    for (const c of el.querySelectorAll('*')) {
      if (!INLINE.has(c.tagName) && !c.closest('[data-oe-ui]')) return false;
    }
    return true;
  }

  // innerHTML ohne die eingeblendeten Kommentar-Marken.
  function cleanHTML(el) {
    if (!el.querySelector('[data-oe-ui]')) return el.innerHTML;
    const c = el.cloneNode(true);
    c.querySelectorAll('[data-oe-ui]').forEach((n) => n.remove());
    return c.innerHTML;
  }

  function guardClick(e) {
    const badge = cmtOn && e.target.closest && e.target.closest('.oe-cmt');
    if (badge) {
      e.preventDefault();
      e.stopPropagation();
      const n = badgeNode.get(badge);
      if (n) openCmtEdit(n.data, n);
      return;
    }
    if (noteArmed) {
      const el = e.target.closest && candidates().find((c) => c === e.target || c.contains(e.target));
      if (el && !e.target.closest('[data-oe-ui]')) {
        e.preventDefault();
        e.stopPropagation();
        openNote(el);
      }
      return;
    }
    // Strg/Cmd-Klick folgt einem Link im bearbeitbaren Text.
    if (editing && !e.ctrlKey && !e.metaKey && e.target.closest && e.target.closest('[data-oe]')) e.preventDefault();
  }

  function touch(el) {
    if (touched.has(el)) return;
    originals.set(el, cleanHTML(el));
    touched.add(el);
  }

  function snap(el, kind) {
    const now = Date.now();
    if (kind !== 'force' && lastSnap.el === el && lastSnap.kind === kind && now - lastSnap.t < 1000) {
      lastSnap.t = now;
      return;
    }
    ownAt = performance.now();
    undoStack.push({ el, html: cleanHTML(el) });
    if (undoStack.length > 300) undoStack.shift();
    redoStack = [];
    lastSnap = { el, kind, t: now };
    render();
  }

  function caretToEnd(el) {
    el.focus({ preventScroll: true });
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(false);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }

  function step(from, to) {
    let e;
    while ((e = from.pop()) && !e.el.isConnected);
    if (!e) return;
    touch(e.el);
    to.push({ el: e.el, html: cleanHTML(e.el) });
    ownAt = performance.now();
    e.el.innerHTML = e.html;
    lastSnap = { el: null, kind: '', t: 0 };
    if (cmtOn) renderBadges();
    caretToEnd(e.el);
    markDirty();
    render();
  }

  function undo() { if (editing) step(undoStack, redoStack); }
  function redo() { if (editing) step(redoStack, undoStack); }

  function onBeforeInput(e) {
    const t = e.inputType || '';
    if (t === 'historyUndo' || t === 'historyRedo') {
      e.preventDefault();
      if (t === 'historyUndo') undo(); else redo();
      return;
    }
    touch(e.currentTarget);
    snap(e.currentTarget, t.startsWith('delete') ? 'delete' : t === 'insertText' ? 'type' : 'force');
  }

  function editHost(node) {
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    return el && el.closest('[data-oe]');
  }

  // Formatierung ueber execCommand: der Browser setzt b, i, a, die alle als Inline-Text gelten.
  function fmt(cmd, value) {
    const sel = getSelection();
    const el = sel.rangeCount && editHost(sel.anchorNode);
    if (!el || el !== editHost(sel.focusNode)) return;
    touch(el);
    snap(el, 'force');
    document.execCommand(cmd, false, value);
    if (cmd === 'removeFormat') document.execCommand('unlink');
    markDirty();
    syncSelBar();
  }

  function shortcut(e) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
    const k = e.key.toLowerCase();
    if (k === 'z') return e.shiftKey ? redo : undo;
    if (k === 'y') return redo;
    if (k === 'b') return () => fmt('bold');
    if (k === 'i') return () => fmt('italic');
    if (k === 'k') return openLink;
    return null;
  }

  // Strg+Z auch, wenn der Fokus gerade auf einem Editor-Symbol liegt statt im Text.
  function globalKeys(e) {
    if (!editing || overlay || e.target.closest('[data-oe], input, textarea, .oe-sel')) return;
    const k = (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase();
    if (k === 'z' || k === 'y') {
      e.preventDefault();
      e.stopPropagation();
      if (k === 'z' && !e.shiftKey) undo(); else redo();
    }
  }

  function plainPaste(e) {
    e.preventDefault();
    touch(e.currentTarget);
    snap(e.currentTarget, 'force');
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  }

  // Tasten bleiben im Text: Seiten-Shortcuts (Leertaste, Pfeile, Controls) sehen sie nicht.
  function keepKeys(e) {
    if (e.type === 'keydown' && !e.isComposing && e.currentTarget.dataset.oe !== undefined) {
      const act = shortcut(e);
      if (act) {
        e.preventDefault();
        act();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        touch(e.currentTarget);
        snap(e.currentTarget, 'force');
        document.execCommand('insertLineBreak');
      }
    }
    e.stopPropagation();
  }

  // ------------------------------------------------------------ auswahl-leiste

  let linkRange = null;

  function selButton(label, title, fn, cls) {
    const b = button('', fn);
    b.classList.add('oe-mini');
    if (cls) b.classList.add(cls);
    if (LINES[label]) b.innerHTML = icon(label); else b.textContent = label;
    b.setAttribute('aria-label', title);
    b.title = title;
    b.addEventListener('pointerdown', (e) => e.preventDefault());
    b.addEventListener('mousedown', (e) => e.preventDefault());
    return b;
  }

  function buildSelBar() {
    selBar = document.createElement('div');
    selBar.className = 'oe-sel';
    selBar.dataset.oeUi = '';
    selBar.setAttribute('role', 'toolbar');
    selBar.setAttribute('aria-label', 'Formatierung');
    selBar.hidden = true;
    selBar.addEventListener('keydown', (e) => e.stopPropagation());
    document.body.appendChild(selBar);
    fillSelBar();
    document.addEventListener('selectionchange', syncSelBar);
    window.addEventListener('scroll', syncSelBar, { passive: true });
  }

  function fillSelBar() {
    selBar.replaceChildren(
      selButton('B', 'fett (Strg+B)', () => fmt('bold'), 'oe-fb'),
      selButton('I', 'kursiv (Strg+I)', () => fmt('italic'), 'oe-fi'),
      selButton('link', 'Link (Strg+K)', openLink, 'oe-fl'),
      selButton('clear', 'Formatierung entfernen', () => fmt('removeFormat')));
    linkRange = null;
  }

  function selectionHost() {
    const sel = getSelection();
    if (!editing || !sel.rangeCount || sel.isCollapsed) return null;
    const el = editHost(sel.anchorNode);
    return el && el === editHost(sel.focusNode) ? el : null;
  }

  function linkAt(node) {
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    const a = el && el.closest('a');
    return a && a.closest('[data-oe]') ? a : null;
  }

  function placeSelBar(rect) {
    const w = selBar.offsetWidth;
    const h = selBar.offsetHeight;
    // Am Handy liegt das Kontextmenue des Systems ueber der Auswahl, die Leiste deshalb darunter.
    const below = matchMedia('(pointer:coarse)').matches || rect.top < h + 16;
    const top = below ? rect.bottom + 8 : rect.top - h - 8;
    const left = Math.min(Math.max(rect.left + rect.width / 2 - w / 2, 8), innerWidth - w - 8);
    selBar.style.top = Math.round(top) + 'px';
    selBar.style.left = Math.round(left) + 'px';
  }

  function syncSelBar() {
    if (!selBar || linkRange) return;
    const host = selectionHost();
    if (!host) { selBar.hidden = true; return; }
    const sel = getSelection();
    selBar.hidden = false;
    selBar.querySelector('.oe-fb').setAttribute('aria-pressed', String(document.queryCommandState('bold')));
    selBar.querySelector('.oe-fi').setAttribute('aria-pressed', String(document.queryCommandState('italic')));
    const inLink = !!(linkAt(sel.anchorNode) || linkAt(sel.focusNode));
    const fl = selBar.querySelector('.oe-fl');
    fl.setAttribute('aria-pressed', String(inLink));
    fl.title = inLink ? 'Link entfernen (Strg+K)' : 'Link (Strg+K)';
    fl.setAttribute('aria-label', fl.title);
    placeSelBar(sel.getRangeAt(0).getBoundingClientRect());
  }

  function openLink() {
    const host = selectionHost();
    if (!host) return;
    const sel = getSelection();
    if (linkAt(sel.anchorNode) || linkAt(sel.focusNode)) { fmt('unlink'); return; }
    const range = sel.getRangeAt(0).cloneRange();
    const rect = range.getBoundingClientRect();
    linkRange = range;
    const form = document.createElement('form');
    form.className = 'oe-row';
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'url';
    input.setAttribute('aria-label', 'Adresse');
    input.placeholder = 'https://';
    const ok = button('setzen', () => {});
    ok.type = 'submit';
    ok.classList.add('oe-small', 'oe-primary');
    form.append(input, ok);
    form.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); closeLink(true); } });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      let url = input.value.trim();
      if (!url) return;
      if (!/^([a-z][a-z0-9+.-]*:|\/|#)/i.test(url)) url = 'https://' + url;
      if (/^javascript:/i.test(url)) return;
      const r = linkRange;
      closeLink(false);
      host.focus({ preventScroll: true });
      const sel2 = getSelection();
      sel2.removeAllRanges();
      sel2.addRange(r);
      fmt('createLink', url);
    });
    selBar.replaceChildren(form);
    selBar.hidden = false;
    placeSelBar(rect);
    input.focus();
  }

  function closeLink(restore) {
    const r = linkRange;
    fillSelBar();
    if (restore && r) {
      const host = editHost(r.startContainer);
      if (host) host.focus({ preventScroll: true });
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
    }
    syncSelBar();
  }

  async function toggleEdit() {
    if (editing) {
      if (!(await flushed())) return;
      stopEditing();
      say('');
    } else {
      editing = true;
      document.documentElement.classList.add('oe-editing');
      originals = new Map();
      touched = new Set();
      undoStack = [];
      redoStack = [];
      for (const el of candidates()) {
        originals.set(el, cleanHTML(el));
        el.dataset.oe = '';
        el.setAttribute('contenteditable', 'true');
        el.addEventListener('paste', plainPaste);
        el.addEventListener('beforeinput', onBeforeInput);
        el.addEventListener('input', markDirty);
        for (const t of ['keydown', 'keyup', 'keypress']) el.addEventListener(t, keepKeys);
      }
      watcher = new MutationObserver(onForeignChange);
      watcher.observe(document.body, { subtree: true, childList: true, characterData: true });
    }
    syncPause();
    render();
  }

  function release(el) {
    el.removeAttribute('contenteditable');
    delete el.dataset.oe;
    el.removeEventListener('paste', plainPaste);
    el.removeEventListener('beforeinput', onBeforeInput);
    el.removeEventListener('input', markDirty);
    for (const t of ['keydown', 'keyup', 'keypress']) el.removeEventListener(t, keepKeys);
  }

  function onForeignChange(muts) {
    if (performance.now() - ownAt < 300) return;
    const ui = (n) => n.nodeType === 1 && n.matches('[data-oe-ui]');
    const gone = new Set();
    for (const m of muts) {
      if ([...m.addedNodes, ...m.removedNodes].some(ui)) continue;
      const host = editHost(m.target);
      if (host && !host.closest('[data-oe-ui]')) gone.add(host);
    }
    for (const el of gone) {
      release(el);
      originals.delete(el);
      touched.delete(el);
      el.blur();
    }
    if (!gone.size) return;
    undoStack = undoStack.filter((e) => !gone.has(e.el));
    redoStack = redoStack.filter((e) => !gone.has(e.el));
    render();
  }

  function stopEditing() {
    if (watcher) watcher.disconnect();
    watcher = null;
    for (const el of originals.keys()) release(el);
    originals = new Map();
    touched = new Set();
    undoStack = [];
    redoStack = [];
    editing = false;
    if (selBar) { fillSelBar(); selBar.hidden = true; }
    document.documentElement.classList.remove('oe-editing');
    syncPause();
    render();
  }

  function dirty() {
    return [...originals].filter(([el, orig]) => touched.has(el) && cleanHTML(el) !== orig);
  }

  function markDirty() {
    clearTimeout(saveTimer);
    if (!dirty().length) {
      // Zurueck auf den gespeicherten Stand (z. B. per Rueckgaengig nach einem Fehler): dann ist nichts offen.
      if (saveFailed) { saveFailed = false; say('gespeichert', 'ok'); }
      render();
      return;
    }
    say('…');
    render();
    saveTimer = setTimeout(save, AUTOSAVE_MS);
  }

  // Gespeichert wird genau der Stand, der abgeschickt wurde; was waehrenddessen dazukommt, folgt im naechsten Lauf.
  async function save() {
    clearTimeout(saveTimer);
    if (saving) { saveAgain = true; return saving; }
    const pend = dirty().map(([el, orig]) => [el, orig, cleanHTML(el)]);
    if (!pend.length) return true;
    say('speichere …');
    saving = (async () => {
      try {
        const r = await api('POST', 'save', { path: pagePath, changes: pend.map(([, orig, neu]) => ({ orig, neu })) });
        for (const [el, , neu] of pend) originals.set(el, neu);
        setLive(r.live_differs);
        if (cmtOn) await refreshComments();
        saveFailed = false;
        say('gespeichert', 'ok');
        watchCommit();
        return true;
      } catch (e) {
        saveFailed = true;
        if (!leaving) say('NICHT gespeichert: ' + e.message, 'error');
        return false;
      } finally {
        saving = null;
        render();
      }
    })();
    render();
    const ok = await saving;
    if (saveAgain) {
      saveAgain = false;
      if (ok && dirty().length) return save();
    }
    return ok;
  }

  // Der Server committet und pusht im Hintergrund; scheitert das, steht es hier sichtbar.
  function watchCommit(tries = 0) {
    clearTimeout(commitPoll);
    commitPoll = setTimeout(async () => {
      let r;
      try { r = await request('GET', 'status'); } catch (e) { say('Commit-Status: ' + e.message, 'error'); return; }
      if (r.error) say('auf dev gespeichert, aber Commit/Push hängt: ' + r.error, 'error');
      else if (r.pending.length && tries < 20) watchCommit(tries + 1);
      else if (r.pending.length) say('auf dev gespeichert, Commit steht seit über einer Minute aus', 'error');
    }, tries ? 3000 : 4500);
  }

  async function flushed() {
    while (saving) await saving;
    if (dirty().length) await save();
    return !dirty().length;
  }

  // Seite wird verlassen: was noch offen ist, geht ohne Rueckfrage raus. Speichern laeuft mit keepalive und
  // erreicht den Server auch nach dem Entladen; die abgebrochene Antwort im Browser ist dann kein Fehler.
  function flushOnLeave() {
    leaving = true;
    if (dirty().length && !saving) save();
  }

  // ------------------------------------------------------------ kommentare

  function lineAt(text, idx) {
    let n = 1;
    for (let i = text.indexOf('\n'); i !== -1 && i < idx; i = text.indexOf('\n', i + 1)) n++;
    return n;
  }

  // Kommentare in Skript-Code: Zeichenketten und Regex-Literale werden uebersprungen.
  function jsComments(code, offset, out, full) {
    let i = 0;
    let prev = '';
    while (i < code.length) {
      const c = code[i];
      const n = code[i + 1];
      if (c === '"' || c === "'" || c === '`') {
        i++;
        while (i < code.length && code[i] !== c) i += code[i] === '\\' ? 2 : 1;
        i++;
        prev = c;
      } else if (c === '/' && n === '/') {
        const end = code.indexOf('\n', i);
        const e = end === -1 ? code.length : end;
        out.push({ kind: 'js', line: lineAt(full, offset + i), text: code.slice(i + 2, e).trim() });
        i = e;
      } else if (c === '/' && n === '*') {
        const end = code.indexOf('*/', i + 2);
        const e = end === -1 ? code.length : end;
        out.push({ kind: 'js', line: lineAt(full, offset + i), text: code.slice(i + 2, e).replace(/^\s*\*+/gm, '').trim() });
        i = e + 2;
      } else if (c === '/' && (prev === '' || '(,=:[!&|?{};+-*%<>~^'.includes(prev))) {
        i++;
        let cls = false;
        while (i < code.length && code[i] !== '\n' && (code[i] !== '/' || cls)) {
          if (code[i] === '\\') i++;
          else if (code[i] === '[') cls = true;
          else if (code[i] === ']') cls = false;
          i++;
        }
        i++;
        prev = '/';
      } else {
        if (!/\s/.test(c)) prev = c;
        i++;
      }
    }
  }

  function sourceComments(text) {
    const out = [];
    const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>|<!--([\s\S]*?)-->/gi;
    let m;
    while ((m = re.exec(text))) {
      if (m[3] !== undefined) {
        if (!m[3].startsWith('#')) out.push({ kind: 'html', line: lineAt(text, m.index), text: m[3].trim(), raw: m[3] });
      } else if (m[2] !== undefined && !/\bsrc\s*=/i.test(m[1])) {
        jsComments(m[2], m.index + m[0].indexOf('>') + 1, out, text);
      }
    }
    return out.filter((c) => c.text);
  }

  function bodyCommentNodes() {
    const nodes = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const p = n.parentElement;
      if (!n.data.trim() || (p && p.closest('#meta-nav, [data-oe-ui], .ctrl-panel'))) continue;
      nodes.push(n);
    }
    return nodes;
  }

  function clearBadges() {
    document.querySelectorAll('.oe-cmt').forEach((b) => b.remove());
  }

  function renderBadges() {
    clearBadges();
    for (const n of bodyCommentNodes()) {
      const b = document.createElement('span');
      b.className = 'oe-cmt';
      b.dataset.oeUi = '';
      b.contentEditable = 'false';
      b.textContent = n.data.trim();
      b.title = 'antippen zum Ändern';
      badgeNode.set(b, n);
      n.after(b);
    }
  }

  async function refreshComments() {
    renderBadges();
    try {
      await loadSource();
    } catch (e) { say(e.message, 'error'); return; }
    const list = sourceComments(source.text);
    extra.querySelector('.oe-cmtlist')?.remove();
    const box = document.createElement('div');
    box.className = 'oe-cmtlist';
    const head = document.createElement('div');
    head.className = 'oe-cmthead';
    head.textContent = list.length ? list.length + ' Kommentare im Quelltext' : 'keine Kommentare im Quelltext';
    if (source.inline) head.append(' ', btnNote);
    box.appendChild(head);
    for (const c of list) {
      const row = document.createElement('div');
      row.className = 'oe-cmtrow';
      const meta = document.createElement('span');
      meta.className = 'oe-cmtmeta';
      meta.textContent = c.kind + ' ' + c.line;
      const t = document.createElement('span');
      t.textContent = c.text;
      row.append(meta, t);
      if (c.kind === 'html') {
        row.classList.add('oe-cmtedit');
        row.tabIndex = 0;
        row.setAttribute('role', 'button');
        row.title = 'ändern oder löschen';
        const go = () => openCmtEdit(c.raw, null);
        row.addEventListener('click', go);
        row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
      }
      box.appendChild(row);
    }
    extra.prepend(box);
  }

  async function toggleComments() {
    cmtOn = !cmtOn;
    syncPause();
    if (cmtOn) {
      await refreshComments();
    } else {
      clearBadges();
      noteArmed = false;
      closeNote();
      extra.querySelector('.oe-cmtlist')?.remove();
    }
    render();
  }

  async function armNote() {
    if (!(await flushed())) return;
    noteArmed = !noteArmed;
    say(noteArmed ? 'Textstelle antippen, dahinter kommt die Notiz' : '');
    document.documentElement.classList.toggle('oe-noting', noteArmed);
    render();
  }

  function closeNote() {
    extra.querySelector('.oe-note')?.remove();
    noteOpen = false;
    syncPause();
  }

  function openNote(el) {
    noteArmed = false;
    document.documentElement.classList.remove('oe-noting');
    closeNote();
    noteOpen = true;
    syncPause();
    render();
    const box = document.createElement('form');
    box.className = 'oe-note';
    const label = document.createElement('div');
    label.className = 'oe-cmthead';
    label.textContent = 'Notiz zu „' + el.textContent.trim().slice(0, 40) + '“';
    const input = document.createElement('input');
    input.type = 'text';
    input.setAttribute('aria-label', 'Notiz');
    const ok = button('setzen', () => {});
    ok.type = 'submit';
    ok.classList.add('oe-primary');
    const cancel = button('abbrechen', () => { closeNote(); say(''); });
    const row = document.createElement('div');
    row.className = 'oe-row';
    row.append(input, ok, cancel);
    box.append(label, row);
    box.addEventListener('keydown', (e) => e.stopPropagation());
    box.addEventListener('submit', async (e) => {
      e.preventDefault();
      const t = cleanNote(input.value);
      if (!t) return;
      const orig = cleanHTML(el);
      say('speichere Notiz …');
      try {
        const r = await api('POST', 'save', { path: pagePath, changes: [{ orig, neu: orig + '<!-- ' + t + ' -->' }] });
        ownAt = performance.now();
        el.appendChild(document.createComment(' ' + t + ' '));
        if (originals.has(el)) originals.set(el, cleanHTML(el));
        setLive(r.live_differs);
        closeNote();
        await refreshComments();
        say('Notiz gespeichert auf dev', 'ok');
      } catch (err) {
        say(err.message, 'error');
      }
    });
    extra.appendChild(box);
    input.focus();
  }

  function cleanNote(v) { return v.trim().replace(/--/g, '- -').replace(/-$/, '- '); }

  // Bestehenden HTML-Kommentar aendern oder loeschen. Ersetzt wird genau dieser Kommentar im Quelltext;
  // kommt er wortgleich mehrfach vor, meldet der Server text_ambiguous.
  async function openCmtEdit(raw, node) {
    if (!(await flushed())) return;
    noteArmed = false;
    document.documentElement.classList.remove('oe-noting');
    closeNote();
    noteOpen = true;
    syncPause();
    render();
    const box = document.createElement('form');
    box.className = 'oe-note';
    const label = document.createElement('div');
    label.className = 'oe-cmthead';
    label.textContent = 'Kommentar ändern';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = raw.trim();
    input.setAttribute('aria-label', 'Kommentar');
    const ok = button('ändern', () => {});
    ok.type = 'submit';
    ok.classList.add('oe-primary');
    const del = button('löschen', () => write(''));
    const cancel = button('abbrechen', () => { closeNote(); say(''); });
    const row = document.createElement('div');
    row.className = 'oe-row';
    row.append(input, ok, del, cancel);
    box.append(label, row);
    box.addEventListener('keydown', (e) => e.stopPropagation());
    box.addEventListener('submit', (e) => {
      e.preventDefault();
      const t = cleanNote(input.value);
      if (t) write(t);
    });
    async function write(t) {
      say(t ? 'speichere Kommentar …' : 'lösche Kommentar …');
      try {
        const r = await api('POST', 'save', { path: pagePath, changes: [{ orig: '<!--' + raw + '-->', neu: t ? '<!-- ' + t + ' -->' : '' }] });
        const n = node || bodyCommentNodes().find((c) => c.data === raw);
        if (n) {
          const host = n.parentElement && n.parentElement.closest('[data-oe]');
          if (t) n.data = ' ' + t + ' ';
          else n.remove();
          if (host && originals.has(host)) originals.set(host, cleanHTML(host));
        }
        setLive(r.live_differs);
        closeNote();
        await refreshComments();
        say(t ? 'Kommentar geändert auf dev' : 'Kommentar gelöscht auf dev', 'ok');
      } catch (err) {
        say(err.message, 'error');
      }
    }
    extra.appendChild(box);
    input.focus();
  }

  // ------------------------------------------------------------ fenster: quelltext, aenderungen

  function openOverlay(title) {
    const wrap = document.createElement('div');
    wrap.className = 'oe-overlay';
    wrap.dataset.oeUi = '';
    wrap.innerHTML = '<div class="oe-ov-head"><span class="oe-ov-title"></span></div><div class="oe-ov-body"></div>' +
      '<div class="oe-ov-msg" role="status"></div>';
    wrap.querySelector('.oe-ov-title').textContent = title;
    wrap.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') closeOverlay();
    });
    document.body.appendChild(wrap);
    overlay = wrap;
    syncPause();
    render();
    return {
      head: wrap.querySelector('.oe-ov-head'),
      body: wrap.querySelector('.oe-ov-body'),
      msg: (text, kind) => {
        const m = wrap.querySelector('.oe-ov-msg');
        m.textContent = text;
        m.dataset.kind = kind || '';
        if (kind === 'error') console.error('[editor] ' + text);
      },
    };
  }

  function closeOverlay() {
    if (overlay) overlay.remove();
    overlay = null;
    syncPause();
    render();
  }

  async function openSource() {
    if (!(await flushed())) return;
    let src;
    try { src = await loadSource(); } catch (e) { say(e.message, 'error'); return; }
    const ov = openOverlay(src.file);
    const ta = document.createElement('textarea');
    ta.spellcheck = false;
    ta.setAttribute('aria-label', 'Quelltext');
    ta.value = src.text;
    ov.body.appendChild(ta);
    ov.head.append(button('abbrechen', closeOverlay), Object.assign(button('speichern', async () => {
      ov.msg('speichere …');
      try {
        const r = await api('POST', 'source', { path: pagePath, text: ta.value, sha: src.sha });
        setLive(r.live_differs);
        closeOverlay();
        location.reload();
      } catch (err) { ov.msg(err.message, 'error'); }
    }), { className: 'oe-btn oe-primary' }));
    ta.focus();
  }

  // Wort-genaue Markierung: gemeinsamer Anfang und Ende bleiben, die Mitte ist die Aenderung.
  function splitChange(a, b) {
    let s = 0;
    while (s < a.length && s < b.length && a[s] === b[s]) s++;
    let e = 0;
    while (e < a.length - s && e < b.length - s && a[a.length - 1 - e] === b[b.length - 1 - e]) e++;
    return [s, e];
  }

  function diffLine(cls, sign, text, range) {
    const row = document.createElement('div');
    row.className = 'oe-d ' + cls;
    const g = document.createElement('span');
    g.className = 'oe-d-sign';
    g.textContent = sign;
    const t = document.createElement('span');
    t.className = 'oe-d-text';
    row.append(g, t);
    if (range) {
      const [s, e] = range;
      const mid = document.createElement('mark');
      mid.textContent = text.slice(s, text.length - e);
      t.append(text.slice(0, s), mid, text.slice(text.length - e));
      row.classList.add('oe-d-paired');
    } else {
      t.append(text || ' ');
    }
    return row;
  }

  function renderDiff(text) {
    const box = document.createElement('div');
    box.className = 'oe-diff';
    if (!text.trim()) {
      box.textContent = 'keine Unterschiede';
      return box;
    }
    const lines = text.split('\n');
    let i = 0;
    while (i < lines.length) {
      const l = lines[i];
      if (/^(diff --git|index |--- |\+\+\+ |new file|deleted file|similarity|rename )/.test(l) || l === '') { i++; continue; }
      if (l.startsWith('@@')) {
        const m = /\+(\d+)/.exec(l);
        const h = document.createElement('div');
        h.className = 'oe-d-hunk';
        h.textContent = 'ab Zeile ' + (m ? m[1] : '?');
        box.appendChild(h);
        i++;
        continue;
      }
      if (l.startsWith('-') || l.startsWith('+')) {
        const del = [];
        const add = [];
        while (i < lines.length && lines[i].startsWith('-')) del.push(lines[i++].slice(1));
        while (i < lines.length && lines[i].startsWith('+')) add.push(lines[i++].slice(1));
        const paired = del.length === add.length;
        del.forEach((t, k) => box.appendChild(diffLine('oe-d-del', '−', t, paired ? splitChange(t, add[k]) : null)));
        add.forEach((t, k) => {
          const r = paired ? splitChange(del[k], t) : null;
          box.appendChild(diffLine('oe-d-add', '+', t, r ? [r[0], r[1]] : null));
        });
        continue;
      }
      box.appendChild(diffLine('oe-d-ctx', ' ', l.slice(1)));
      i++;
    }
    return box;
  }

  function fmtDate(iso) {
    const d = new Date(iso);
    return isNaN(d) ? iso : d.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
  }

  async function openChanges(forPublish) {
    if (!(await flushed())) return;
    let pending, hist;
    try {
      [pending, hist] = await Promise.all([api('GET', q('diff')), api('GET', q('history'))]);
    } catch (e) { say(e.message, 'error'); return; }
    const ov = openOverlay(forPublish ? 'veröffentlichen: ' + hist.file : 'Änderungen: ' + hist.file);
    ov.head.appendChild(button('schließen', closeOverlay));
    const h1 = document.createElement('h3');
    h1.className = 'oe-ov-h';
    h1.textContent = 'dev gegenüber live';
    ov.body.append(h1, renderDiff(pending.diff));
    if (hist.live_differs) {
      const go = button('jetzt veröffentlichen', async () => {
        go.disabled = true;
        ov.msg('veröffentliche …');
        try {
          const r = await api('POST', 'publish', { path: pagePath });
          setLive(r.live_differs);
          closeOverlay();
          say('live auf 0nefinity.love', 'ok');
        } catch (err) {
          go.disabled = false;
          ov.msg(err.message, 'error');
        }
      });
      go.classList.add('oe-primary');
      ov.head.appendChild(go);
      if (forPublish) go.focus();
    }
    const h2 = document.createElement('h3');
    h2.className = 'oe-ov-h';
    h2.textContent = 'Verlauf auf dev';
    ov.body.appendChild(h2);
    for (const c of hist.commits) {
      const d = document.createElement('details');
      d.className = 'oe-commit';
      const s = document.createElement('summary');
      const when = document.createElement('span');
      when.className = 'oe-cmtmeta';
      when.textContent = fmtDate(c.date);
      s.append(when, ' ' + c.subject);
      d.appendChild(s);
      d.addEventListener('toggle', async () => {
        if (!d.open || d.dataset.loaded) return;
        d.dataset.loaded = '1';
        try {
          const r = await api('GET', q('diff') + '&sha=' + c.sha);
          d.appendChild(renderDiff(r.diff));
        } catch (err) { ov.msg(err.message, 'error'); }
      });
      ov.body.appendChild(d);
    }
    if (!hist.commits.length) ov.body.append('noch keine Commits');
  }

  // ------------------------------------------------------------ leiste, menue

  function css() {
    const s = document.createElement('style');
    s.textContent = `
#oe-bar{position:fixed;top:calc(var(--visible-viewport-top,0px) + 8px);right:76px;z-index:2147483000;display:flex;flex-direction:column;
  align-items:flex-end;gap:4px;max-width:calc(100vw - 92px);color:var(--text-color,#fff);text-align:left;
  font:13px/1.25 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;pointer-events:none}
#oe-bar>*{pointer-events:auto}
body.menu-open #oe-bar{display:none}
.oe-overlay,#oe-admin{text-align:left}
.oe-row{display:flex;flex-wrap:wrap;align-items:center;gap:4px}
.oe-head{display:flex;align-items:center;gap:2px}
.oe-status{padding:1px 6px;font-size:11px;opacity:.55;overflow-wrap:anywhere;border-radius:3px}
.oe-status:empty{display:none}
.oe-status[data-kind=error],.oe-ov-msg[data-kind=error]{opacity:1;font-size:13px;font-weight:600;padding:4px 8px;
  background:var(--text-color,#fff);color:var(--bg-color,#000)}
.oe-icon{display:block;width:26px;height:30px;fill:currentColor;flex:none}
.oe-ic{display:block;width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
/* !important: meta.css styles every button with !important */
.oe-btn{min-height:44px!important;min-width:44px!important;margin:0!important;padding:0 10px!important;border-radius:4px!important;
  border:1px solid color-mix(in srgb,var(--text-color,#fff) 30%,transparent)!important;background:transparent!important;
  color:var(--text-color,#fff)!important;font:inherit!important;box-shadow:none!important;scale:none!important;
  cursor:pointer;display:inline-flex!important;align-items:center;justify-content:center;gap:6px;text-decoration:none!important;
  transition:border-color .15s,background .15s,opacity .15s}
/* Hover nur mit echter Maus: am Handy bleibt :hover nach dem Antippen haengen. Aktiv = invertiert. */
@media (hover:hover){.oe-btn:not([aria-pressed=true]):not(.oe-primary):hover:not(:disabled){border-color:var(--text-color,#fff)!important}
  .oe-btn.oe-mini:hover:not(:disabled){opacity:1}}
.oe-btn:focus{outline:none!important}
.oe-btn:focus-visible{outline:2px solid var(--text-color,#fff)!important;outline-offset:1px}
.oe-btn:disabled{opacity:.3!important;cursor:default}
.oe-btn[aria-pressed=true],.oe-primary{background:var(--text-color,#fff)!important;color:var(--bg-color,#000)!important;border-color:var(--text-color,#fff)!important}
.oe-btn.oe-mini{width:32px;height:32px;min-width:32px!important;min-height:32px!important;padding:0!important;opacity:.6}
.oe-btn.oe-mini:not([aria-pressed=true]){border-color:transparent!important}
.oe-btn.oe-mini:focus-visible,.oe-btn.oe-mini[aria-pressed=true]{opacity:1}
.oe-btn.oe-mini:disabled{opacity:.25!important}
.oe-sel{position:fixed;z-index:2147483002;display:flex;gap:2px;padding:2px;border-radius:6px;
  border:1px solid color-mix(in srgb,var(--text-color,#fff) 30%,transparent);background:var(--bg-color,#000);color:var(--text-color,#fff);
  font:15px/1 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.oe-sel[hidden]{display:none}
.oe-sel .oe-fb{font-weight:700!important}
.oe-sel .oe-fi{font-style:italic!important;font-family:Georgia,serif!important}
.oe-sel input{width:min(220px,60vw);min-height:32px;font-size:16px;padding:0 8px;border:0;border-radius:4px;box-sizing:border-box;
  color:var(--text-color,#fff);background:color-mix(in srgb,var(--text-color,#fff) 10%,transparent)}
.oe-btn[hidden]{display:none!important}
.oe-extra:empty{display:none}
.oe-extra{width:min(420px,calc(100vw - 92px));max-height:50vh;overflow:auto;padding:4px;box-sizing:border-box;border-radius:6px;
  border:1px solid color-mix(in srgb,var(--text-color,#fff) 30%,transparent);background:var(--bg-color,#000)}
.oe-cmtlist,.oe-note{border-top:1px solid color-mix(in srgb,var(--text-color,#fff) 30%,transparent);padding:4px 4px 0}
.oe-cmthead{padding:2px 4px 4px}
.oe-cmtrow{display:flex;gap:8px;padding:2px 4px;white-space:pre-wrap;overflow-wrap:anywhere}
.oe-cmtmeta{flex:none;opacity:.55;font-variant-numeric:tabular-nums}
.oe-note input{flex:1 1 140px;min-width:0;min-height:44px;font-size:16px;padding:0 8px;border:0;border-radius:4px;box-sizing:border-box;
  color:var(--text-color,#fff);background:color-mix(in srgb,var(--text-color,#fff) 10%,transparent)}
.oe-cmt{display:inline;margin:0 3px;padding:0 4px;border:1px dashed currentColor;border-radius:3px;
  font:12px/1.4 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;opacity:.8;cursor:pointer}
.oe-cmtrow.oe-cmtedit{cursor:pointer;min-height:44px;align-items:center;border-radius:3px}
.oe-cmtrow.oe-cmtedit:hover,.oe-cmtrow.oe-cmtedit:focus-visible{outline:1px solid var(--text-color,#fff)}
.oe-editing [data-oe]{outline:1px dashed color-mix(in srgb,var(--text-color,#fff) 40%,transparent);outline-offset:2px;cursor:text}
.oe-editing [data-oe]:focus{outline:1px solid var(--text-color,#fff)}
.oe-noting body *{cursor:crosshair}
.oe-overlay{position:fixed;inset:0;z-index:2147483001;display:flex;flex-direction:column;background:var(--bg-color,#000);
  color:var(--text-color,#fff);font:14px/1.3 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.oe-ov-head{display:flex;flex-wrap:wrap;gap:4px;align-items:center;padding:4px;border-bottom:1px solid color-mix(in srgb,var(--text-color,#fff) 30%,transparent)}
.oe-ov-title{flex:1 1 160px;padding:0 8px;overflow-wrap:anywhere}
.oe-ov-body{flex:1;overflow:auto;padding:4px 8px;display:flex;flex-direction:column;min-height:0}
.oe-ov-body textarea{flex:1;min-height:60vh;border:0;border-radius:4px;padding:8px;resize:none;font:13px/1.45 ui-monospace,Menlo,Consolas,monospace;
  color:inherit;background:color-mix(in srgb,var(--text-color,#fff) 6%,transparent)}
.oe-ov-body textarea:focus{outline:1px solid var(--text-color,#fff)!important}
.oe-ov-msg{min-height:20px;padding:4px 12px}
.oe-ov-h{margin:12px 0 4px!important;font-size:15px!important;font-weight:600!important}
.oe-diff{font:12.5px/1.45 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere}
.oe-d{display:flex;padding:0 4px}
.oe-d-sign{flex:none;width:1.5em;opacity:.6}
.oe-d-text{flex:1;min-width:0}
.oe-d-ctx{opacity:.6}
.oe-d-del{text-decoration:line-through;opacity:.7}
.oe-d-del.oe-d-paired{text-decoration:none}
.oe-d-del mark{background:none;color:inherit;text-decoration:line-through;text-decoration-thickness:2px}
.oe-d-add:not(.oe-d-paired),.oe-d-add mark{background:var(--text-color,#fff);color:var(--bg-color,#000)}
.oe-d-hunk{margin-top:8px;padding:2px 4px;opacity:.5;border-top:1px dashed currentColor;font-family:system-ui,sans-serif}
.oe-commit summary{min-height:44px;display:flex;align-items:center;gap:8px;cursor:pointer;
  border-bottom:1px solid color-mix(in srgb,var(--text-color,#fff) 15%,transparent)}
#oe-admin{display:flex;flex-wrap:nowrap;align-items:center;gap:4px;padding:4px 12px;
  border-bottom:1px solid color-mix(in srgb,var(--text-color,#fff) 25%,transparent);
  font:14px/1.25 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
#oe-admin .oe-btn{border-color:transparent!important;opacity:.7}
@media (hover:hover){#oe-admin .oe-btn:hover:not(:disabled){opacity:1}}
#oe-admin .oe-btn:focus-visible{opacity:1}
#oe-admin .oe-btn:disabled{opacity:.3!important}
#oe-admin .oe-pwr{width:20px;height:20px}
#oe-admin .oe-login{border-color:transparent!important;opacity:.6}
@media (hover:hover){#oe-admin .oe-login:hover{opacity:1}}
.oe-btn.oe-small{min-height:32px!important;min-width:0!important;padding:0 8px!important;font-size:13px!important}
.oe-extra>:first-child{border-top:0}
#oe-admin .oe-narrow{display:none!important}
/* Handy: eine Reihe zwischen Zurueck- und Menueknopf (bei 320 px 166 px frei), Quelltext und Aenderungen
   wandern dafuer in die Admin-Zeile im Menue. */
@media (max-width:480px){#oe-bar{right:79px;top:calc(var(--visible-viewport-top,0px) + 22px);max-width:calc(100vw - 87px)}
  #oe-bar .oe-btn.oe-mini{width:30px;min-width:30px!important}
  #oe-bar .oe-wide{display:none!important}
  #oe-admin .oe-narrow{display:inline-flex!important}
  #oe-admin{gap:0;padding:4px 8px}
  .oe-extra{position:fixed;left:8px;right:8px;top:calc(var(--visible-viewport-top,0px) + 80px);width:auto}}`;
    document.head.appendChild(s);
  }

  function button(label, fn) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'oe-btn';
    b.textContent = label;
    b.addEventListener('click', fn);
    return b;
  }

  function stored(key, val) {
    try {
      if (val === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, val);
    } catch (e) { /* privates Fenster: Zustand gilt dann nur fuer diesen Aufruf */ }
    return null;
  }

  // Einziger Ort, der Knopf-Zustaende setzt.
  function render() {
    if (!bar) return;
    const off = !st.ready;
    const set = (b, disabled, pressed) => {
      b.disabled = !!disabled;
      if (pressed !== undefined) b.setAttribute('aria-pressed', String(!!pressed));
    };
    set(btnEdit, off || !st.inline, editing);
    set(btnUndo, !editing || !undoStack.length);
    set(btnRedo, !editing || !redoStack.length);
    btnUndo.hidden = btnRedo.hidden = !editing;
    set(btnSrc, off || !!overlay);
    set(btnCmt, off, cmtOn);
    set(btnDiff, off || !!overlay);
    set(btnSave, off || !!saving || !dirty().length);
    set(btnNote, false, noteArmed);
    if (btnPub) {
      set(menuSrc, off || !!overlay);
      set(menuDiff, off || !!overlay);
      set(btnPub, off || !st.live);
      btnPub.title = st.live ? 'diese Seite nach 0nefinity.love' : 'live ist auf demselben Stand';
    }
  }

  function mini(kind, label, fn) {
    const b = button('', fn);
    b.classList.add('oe-mini');
    b.innerHTML = icon(kind);
    b.setAttribute('aria-label', label);
    b.title = label;
    return b;
  }

  function buildBar() {
    bar = document.createElement('div');
    bar.id = 'oe-bar';
    bar.dataset.oeUi = '';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Editor');
    status = document.createElement('span');
    status.className = 'oe-status';
    status.setAttribute('role', 'status');
    btnEdit = mini('pencil', 'bearbeiten ein/aus', () => { stored('oe-edit', editing ? '0' : '1'); toggleEdit(); });
    btnSrc = mini('code', 'Quelltext', openSource);
    btnSrc.classList.add('oe-wide');
    btnCmt = mini('bubble', 'Kommentare ein/aus', toggleComments);
    btnDiff = mini('diff', 'Änderungen', () => openChanges(false));
    btnDiff.classList.add('oe-wide');
    btnSave = mini('save', 'jetzt speichern', save);
    btnUndo = mini('undo', 'rückgängig (Strg+Z)', undo);
    btnRedo = mini('redo', 'wiederholen (Strg+Umschalt+Z)', redo);
    btnNote = button('notiz setzen', armNote);
    btnNote.classList.add('oe-small');
    const head = document.createElement('div');
    head.className = 'oe-head';
    head.append(btnEdit, btnUndo, btnRedo, btnSrc, btnCmt, btnDiff, btnSave);
    extra = document.createElement('div');
    extra.className = 'oe-extra';
    bar.append(head, status, extra);
    bar.addEventListener('keydown', (e) => e.stopPropagation());
    document.body.appendChild(bar);
    render();
  }

  function menuWrap() {
    return document.querySelector('#meta-nav .menu-content-wrapper');
  }

  function buildLoginEntry() {
    const wrap = menuWrap();
    if (!wrap) return;
    css();
    const sec = document.createElement('div');
    sec.id = 'oe-admin';
    sec.dataset.oeUi = '';
    const a = document.createElement('a');
    a.className = 'oe-btn oe-login';
    a.href = '/enternity?next=' + encodeURIComponent(location.pathname);
    a.innerHTML = icon('admin') + '<span>enter</span>';
    a.setAttribute('aria-label', 'einloggen');
    sec.appendChild(a);
    wrap.prepend(sec);
  }

  async function logout() {
    if (!(await flushed())) return;
    try {
      const r = await fetch('/api/auth/logout', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ csrf }),
      });
      await r.json().catch(() => null);
      if (!r.ok) throw new Error('Ausloggen fehlgeschlagen (HTTP ' + r.status + ')');
      location.reload();
    } catch (e) { say(e.message, 'error'); }
  }

  function buildAdminMenu() {
    const wrap = menuWrap();
    if (!wrap) return;
    const sec = document.createElement('div');
    sec.id = 'oe-admin';
    sec.dataset.oeUi = '';
    btnPub = button('veröffentlichen', () => openChanges(true));
    const analytics = document.createElement('a');
    analytics.className = 'oe-btn';
    analytics.href = ANALYTICS;
    analytics.target = '_blank';
    analytics.rel = 'noopener';
    analytics.textContent = 'analytics';
    const out = button('', logout);
    menuSrc = mini('code', 'Quelltext', openSource);
    menuDiff = mini('diff', 'Änderungen', () => openChanges(false));
    for (const b of [menuSrc, menuDiff]) b.classList.add('oe-narrow');
    for (const b of [btnPub, analytics, out]) b.classList.add('oe-small');
    out.innerHTML = icon('power');
    out.setAttribute('aria-label', 'ausloggen');
    out.title = 'ausloggen';
    sec.append(menuSrc, menuDiff, btnPub, analytics, out);
    wrap.prepend(sec);
  }

  async function init() {
    let me;
    try {
      me = await fetch('/api/auth/me', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    } catch (e) { return; }
    if (me.status === 401) { buildLoginEntry(); return; }
    if (!me.ok) { console.error('[editor] /api/auth/me HTTP ' + me.status); return; }
    const info = await me.json();
    csrf = info.csrf || '';

    css();
    buildBar();
    buildSelBar();
    buildAdminMenu();
    render();
    document.addEventListener('click', guardClick, true);
    document.addEventListener('keydown', globalKeys, true);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && dirty().length) save(); });
    window.addEventListener('pagehide', flushOnLeave);

    try {
      await loadSource();
      st.ready = true;
      st.inline = !!source.inline;
      render();
      if (st.inline && stored('oe-edit') !== '0') toggleEdit();
    } catch (e) {
      st.ready = false;
      render();
      say(e.message, 'error');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
