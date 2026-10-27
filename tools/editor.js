// Dev-only Editor. Ohne Login: im Menue ein Eingang zu /enternity. Eingeloggt: oben im Menue
// die Admin-Zeile (veroeffentlichen, Analytics, Ausloggen), oben links neben dem Menue eine Reihe kleiner
// Symbole: rueckgaengig, wiederholen, bearbeiten ein/aus, Quelltext, Kommentare ein/aus, Aenderungen.
// Grundsatz: die Oberflaeche reagiert sofort, alles Laengere laeuft im Hintergrund. Texte sind eingeloggt
// direkt editierbar und gehen ~0,4 s nach dem letzten Tippen auf dev (kein Speichern-Knopf, keine Statusanzeige;
// nur ein Fehler bleibt sichtbar, bis das Speichern wieder klappt). Der Server committet und pusht gebuendelt im
// Hintergrund. Markierter Text bekommt eine kleine Leiste (fett, kursiv, Link, Kommentar, Formatierung weg).
// Kommentare (HTML und JS) erscheinen mit der Sprechblase an ihrem Platz und sind dort direkt schreibbar.
// Alle Knoepfe rendern aus einem Zustand (render()).
// Backend: ~/0nefinity/editor/server.py hinter /api/edit/. Fehler stehen sichtbar unter den Symbolen.
// Andere Seiten (timbreitmar.de) binden dieselbe Datei als /api/edit/editor.js ein und stellen sie per
// data-Attribut um: data-mode="direct" (eine Arbeitskopie, Speichern ist sofort live, kein Veroeffentlichen),
// data-me / data-logout (eigener Login des Editor-Dienstes statt /api/auth/*).
// data-mode="draft" (www.0nefinity.love): eingeloggt liefert nginx den Entwurf (main + eigene Aenderungen), Speichern
// geht in den Entwurf, der Veroeffentlichen-Knopf bringt alles Unveroeffentlichte auf main; der Punkt am Knopf
// zeigt es an (GET draft-status). Besucher bekommen weiter main und dieses Skript nie.
(function oneEditor() {
  const tag = document.currentScript;
  const CFG = {
    direct: tag?.dataset.mode === 'direct',
    draft: tag?.dataset.mode === 'draft',
    me: tag?.dataset.me || '/api/auth/me',
    logout: tag?.dataset.logout || '/api/auth/logout',
  };
  if (!CFG.direct && !CFG.draft && !location.hostname.startsWith('dev.')) return;

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
    comment_lost: 'im Quelltext steht ein versteckter Kommentar an dieser Stelle, bitte über quelltext ändern',
    mixed_eol: 'Datei mischt Zeilenenden, bitte über quelltext ändern',
    page_not_found: 'keine bearbeitbare Datei zu dieser Adresse',
    name_taken: 'Name ist schon vergeben',
    bad_name: 'Name nicht erlaubt',
    protected_page: 'Diese Seite kann nicht umbenannt werden',
    not_supported: 'auf dieser Seite nicht verfügbar',
  };
  const ANALYTICS = 'https://analytics.timbreitmar.de';
  // Ysabeau-Outlines '0' und '1', dieselben wie in der Menue-Lupe (generate-menu.py).
  const ZERO = 'M261 5Q198 5 148.5 -23.0Q99 -51 70.5 -99.0Q42 -147 42 -209Q42 -270 70.5 -317.5Q99 -365 148.0 -392.0Q197 -419 260 -419Q322 -419 371.5 -391.5Q421 -364 449.5 -316.5Q478 -269 478 -206Q478 -146 449.5 -97.5Q421 -49 372.5 -22.0Q324 5 261 5ZM261 -50Q304 -50 338.0 -70.0Q372 -90 391.0 -125.5Q410 -161 410 -206Q410 -251 391.0 -287.0Q372 -323 338.0 -344.0Q304 -365 260 -365Q217 -365 182.5 -345.0Q148 -325 128.0 -290.0Q108 -255 108 -209Q108 -164 128.0 -127.5Q148 -91 183.0 -70.5Q218 -50 261 -50Z';
  const ONE = 'M196 -414H243V0H175V-394L201 -360L59 -278L34 -322Z';

  let editing = false;
  // Start-Inhalt jeder Textstelle (fuer die Vorpruefung und das Einfrieren); gespeichert wird das ganze Dokument.
  let hostStart = new Map();
  // Dokumentstand der letzten Speicherung (Serialisierung der Wurzel, Inseln als Grundzustand).
  let docBase = null;
  let islandSeq = 0;
  const islandBase = new Map();
  let startEls = new WeakSet();
  let styledAtStart = new WeakSet();
  let pagePath = location.pathname;
  let busy = 0;
  let overlay = null;
  let cmtOn = false;
  let source = null;
  let csrf = '';
  let iconSeq = 0;
  const badgeInfo = new WeakMap();
  const fresh = new WeakSet();
  let pubTimer = null;
  let pubPoll = null;
  let toast = null;
  let toastTimer = null;
  let lastTypeAt = 0;
  const SAVED = CFG.direct ? 'gespeichert' : 'auf dev gespeichert';
  let retryN = 0;
  // Autosave: so lange nach dem letzten Tippen wird gespeichert, also ein Commit pro Schreibpause.
  const AUTOSAVE_MS = 400;
  let saveTimer = null;
  let saving = null;
  let saveAgain = false;
  let leaving = false;
  let bar, more, moreIn, status, btnCmt, btnDiff, btnPub, btnEdit, btnSrc, btnUndo, btnRedo, selBar, menuSrc, menuDiff;
  // ready: Quelltext geladen; inline: Seite ist inline bearbeitbar; live: dev weicht von live ab.
  const st = { ready: false, inline: false, live: false, draftCount: 0, draftFiles: [] };
  // Eigener Verlauf statt Browser-Undo: der kennt keine Autosave-Grenzen und vergisst alles, sobald
  // innerHTML gesetzt wird. Eintrag = Element + Inhalt davor; Tippen am selben Element ohne 1 s Pause ist ein Schritt.
  let undoStack = [];
  let redoStack = [];
  // Schritt = {t: Zeit, p/s: gleicher Anfang/Schluss im Dokument-HTML (Skelett), a: entfernter, b: eingefuegter Teil}. Das ueberlebt Neuladen (localStorage je Seite); openGrp ist der noch
  // offene Tippschritt.
  let openGrp = null;
  let grpTimer = null;
  let hist = null;
  let btnHist, menuHist, btnFmt, menuFmt;
  const GROUP_MS = 1200;
  let commitPoll = null;
  // Text, den ein Skript der Seite laufend umschreibt (Animationen), ist nicht bearbeitbar: sonst
  // speichert das Autosave einen zufaelligen Animationsstand. Eigene Aenderungen setzen ownAt.
  let ownAt = 0;
  let saveFailed = false;
  let watcher = null;

  // Live-Reload pausiert, solange bearbeitet wird, ein Fenster offen ist oder eine Anfrage laeuft:
  // ein Reload mitten im Speichern bricht die Antwort ab.
  function syncPause() { window.__oneEditing = editing || !!overlay || cmtOn || busy > 0 || !!pubTimer; }

  // Admin/Login: 0, oben eine kleine 1, die den Kreis schneidet.
  // Ausloggen: Power-Zeichen aus 0 und 1, die 1 schneidet sich ihren Spalt aus der 0.
  const LINES = {
    pencil: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
    code: 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',
    bubble: 'M4 5h16v11h-9l-5 4v-4h-2z',
    noteplus: 'M4 5h16v11h-9l-5 4v-4h-2zM12 7.5v6M9 10.5h6',
    diff: 'M12 4v8M8 8h8M8 18h8',
    fmt: 'M3 19L8 6l5 13M5 15h6M15 19l3-7 3 7M16.5 17h3',
    hist: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 8v4l3 2',
    undo: 'M9 15L4 10l5-5M4 10h10a5 5 0 0 1 0 10h-4',
    redo: 'M15 15l5-5-5-5M20 10H10a5 5 0 0 0 0 10h4',
    link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
    clear: 'M6 5h12M12 5v14M5 19L19 5',
    upload: 'M12 16V5M7 10l5-5 5 5M5 20h14',
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

  // Waehrend ein Umbenennen laeuft, warten alle anderen Aufrufe und gehen danach mit dem neuen Pfad raus
  // (sonst traf ein Autosave den alten Namen: 404 "keine bearbeitbare Datei").
  let renaming = null;

  async function api(method, route, body) {
    if (route !== 'rename') {
      while (renaming) await renaming;
      if (body && typeof body === 'object' && 'path' in body) body = { ...body, path: pagePath };
    }
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
    const opts = { method, credentials: 'same-origin', keepalive: route === 'save' || route === 'publish' || route === 'publish-all', headers: { Accept: 'application/json' } };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['X-0ne-Edit'] = '1';
      if (csrf) opts.headers['X-0ne-Csrf'] = csrf;
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

  let sayTimer = null;
  // Nur Fehler bleiben stehen; Bestaetigungen verschwinden nach 4 s. Solange das Speichern scheitert, bleibt
  // seine Fehlermeldung oben, bis es wieder klappt.
  function say(text, kind) {
    if (saveFailed && kind !== 'error' && text) return;
    clearTimeout(sayTimer);
    status.textContent = text;
    status.dataset.kind = kind || '';
    if (kind === 'error') console.error('[editor] ' + text);
    else if (text) sayTimer = setTimeout(() => { if (status.textContent === text && !saveFailed) say(''); }, 4000);
  }

  function saveOk() {
    retryN = 0;
    if (saveFailed) { saveFailed = false; say(''); }
  }

  // Fehlschlag: Meldung bleibt, bis es klappt; der Wiederholungsversuch laeuft von selbst (1 s, 2 s, ... 30 s).
  function saveFail(e, again) {
    saveFailed = true;
    if (!leaving) say('nicht gespeichert, erneuter Versuch … (' + e.message + ')', 'error');
    retryN++;
    return setTimeout(again, Math.min(30000, 1000 * 2 ** Math.min(retryN, 5)));
  }

  // Klicks auf Editor-Knoepfe duerfen das Seitenmenue nicht auf- oder zuklappen.
  function keepClicks(el) {
    for (const t of ['click', 'touchend']) el.addEventListener(t, (e) => e.stopPropagation());
  }

  function showToast(text, label, action, ms, kind) {
    hideToast();
    toast = document.createElement('div');
    toast.className = 'oe-toast';
    toast.dataset.oeUi = '';
    toast.dataset.kind = kind || '';
    toast.setAttribute('role', 'status');
    keepClicks(toast);
    toast.append(text);
    if (action) {
      const b = button(label, () => { const fn = action; hideToast(); fn(); });
      b.classList.add('oe-small');
      toast.append(b);
    }
    if (kind === 'error') {
      const x = button('schließen', hideToast);
      x.classList.add('oe-small');
      toast.append(x);
      console.error('[editor] ' + text);
    }
    document.body.appendChild(toast);
    if (ms) toastTimer = setTimeout(hideToast, ms);
  }

  function hideToast() {
    clearTimeout(toastTimer);
    if (toast) toast.remove();
    toast = null;
  }

  function setLive(differs) {
    st.live = !!differs;
    render();
    if (CFG.draft) refreshDraftSoon();
  }

  // Entwurfsmodus: was ist noch nicht auf main? Punkt am Veroeffentlichen-Knopf; ein haengender Abgleich
  // mit main (Konflikt) steht als Fehlermeldung da, nie still.
  let draftTimer = null;
  let draftConflictShown = null;
  function refreshDraftSoon() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(refreshDraft, 800);
  }

  async function refreshDraft() {
    if (!CFG.draft) return;
    try {
      const d = await request('GET', 'draft-status');
      st.draftCount = d.count || 0;
      st.draftFiles = (d.files || []).map((f) => f.path);
      if (d.conflict && d.conflict !== draftConflictShown) {
        draftConflictShown = d.conflict;
        showToast('Entwurf und veröffentlichte Seite ändern dieselbe Stelle (' + d.conflict + '), Abgleich steht', '', null, 0, 'error');
      } else if (!d.conflict) draftConflictShown = null;
      render();
    } catch (e) { say('Entwurfsstand: ' + e.message, 'error'); }
  }

  // Markdown-Seiten: Der Browser schickt base (Serialisierung beim Laden) und text (jetzt); der Server fuehrt
  // beides mit der Datei zusammen (editor/md_save.py). Serialisierer: tools/editor-md.js.
  let mdBase = null;
  const isMd = () => source?.format === 'markdown';
  async function loadMd() {
    if (!window._018EditorMd) {
      await new Promise((ok, no) => {
        const s = document.createElement('script');
        s.src = (tag?.src || '/tools/editor.js').replace(/editor\.js(\?.*)?$/, 'editor-md.js');
        s.onload = ok;
        s.onerror = () => no(new Error('editor-md.js nicht ladbar'));
        document.head.append(s);
      });
    }
    mdBase = window._018EditorMd.serialize();
  }

  // Dateiname oben (editor-filename.js), Plus fuer neue Seiten (editor-newpage.js), Formatierungszeichen
  // (editor-marks.js): eigene Module, hier nur geladen und eingehaengt.
  let extras = null;
  async function loadExtras() {
    const base = (tag?.src || '/tools/editor.js').replace(/editor\.js(\?.*)?$/, '');
    await Promise.all(['filename', 'newpage', 'marks', 'format'].map((n) => new Promise((ok, no) => {
      const s = document.createElement('script');
      s.src = base + 'editor-' + n + '.js';
      s.onload = ok;
      s.onerror = () => no(new Error('editor-' + n + '.js nicht ladbar'));
      document.head.append(s);
    })));
    const wait = async () => { closeGroup(); return (await flushed()) !== false; };
    const renameRequest = (method, route, body) => (route === 'rename' ? renamePage(method, route, body) : api(method, route, body));
    extras = {
      fn: window.OneEditorFilename.mount({
        file: source.file, request: renameRequest, path: () => pagePath, beforeRename: wait,
      }),
      np: window.OneEditorNewPage.mount({ bar: moreIn, request: api, beforeCreate: wait }),
      marks: window.OneEditorMarks.mount({ bar: moreIn, root: () => root || document.querySelector('main') || document.body }),
      fmt: window.OneEditorFormat.mount({
        host: selHost, before: () => snap('force'), after: () => { markDirty(); syncSelBar(); },
        blockOf, setBlock: (t) => setBlock(t), md: isMd, bar: () => bar, fail: (m) => say(m, 'error'),
      }),
    };
    extras.fmt.onPanel((on) => { for (const b of [btnFmt, menuFmt]) if (b) b.setAttribute('aria-pressed', String(on)); });
    if (selBar) fillSelBar();
  }

  async function loadSource() {
    source = await api('GET', q('source'));
    setLive(source.live_differs);
    return source;
  }

  // controls.js speichert Voreinstellungen ueber denselben Endpunkt: Quelltext neu holen (neuer sha),
  // damit "veroeffentlichen" erscheint und eine Quelltext-Bearbeitung nicht am alten Stand scheitert.
  let pubOffUntil = 0;
  window.addEventListener('controls:defaults-saved', () => {
    pubOffUntil = Date.now() + 1500;
    setTimeout(() => render(), 1600);
    loadSource().catch(e => say(e.message, 'error'));
  });

  // ------------------------------------------------------------ bearbeiten

  function candidates() {
    const out = [];
    const isHost = (c) => TEXT_TAGS.has(c.tagName) && c.textContent.trim() && isTextOnly(c);
    const blank = (n) => n.nodeType === 3 && !n.data.trim();
    // Fliesstext zwischen Bloecken (Textknoten, Kommentare, Inline-Elemente) bildet einen Lauf; er wird in
    // <oe-run> gepackt und ist eine eigene Textstelle. Ein Lauf aus genau einem Element ist dieses Element.
    const flush = (run) => {
      while (run.length && blank(run[0])) run.shift();
      while (run.length && blank(run[run.length - 1])) run.pop();
      if (!run.some((n) => n.nodeType !== 8 && n.textContent.trim())) return;
      if (run.length === 1 && run[0].nodeType === 1) { out.push(run[0]); return; }
      const w = document.createElement('oe-run');
      run[0].before(w);
      w.append(...run);
      out.push(w);
    };
    const walk = (el) => {
      let run = [];
      for (const n of [...el.childNodes]) {
        if (n.nodeType === 3 || n.nodeType === 8) { run.push(n); continue; }
        if (n.nodeType !== 1 || n.matches(SKIP)) { flush(run); run = []; continue; }
        if (isHost(n) && !INLINE.has(n.tagName)) { flush(run); run = []; out.push(n); continue; }
        if (INLINE.has(n.tagName) && isTextOnly(n) && !n.querySelector(SKIP)) { run.push(n); continue; }
        flush(run);
        run = [];
        walk(n);
      }
      flush(run);
    };
    walk(document.body);
    return out;
  }

  // Texte, die nicht im Quelltext stehen (von Skripten erzeugt, in Animationen zerlegt), sind nicht bearbeitbar.
  async function dropUnlocatable(hosts) {
    if (isMd()) return;
    let r;
    try { r = await api('POST', 'check', { path: pagePath, origs: hosts.map((h) => hostStart.get(h)) }); } catch (e) {
      // Nur eine Vorabprüfung: ist der Dienst weg, meldet das Speichern es laut; ein altes Backend ohne Route ebenso still.
      if (/nicht erreichbar/.test(String(e.message))) console.warn('[editor] ' + e.message);
      else if (!/not_found|404/.test(String(e.message))) say('Prüfung der Textstellen: ' + e.message, 'error');
      return;
    }
    if (!editing) return;
    const size = new Map();
    for (const h of hosts) size.set(hostStart.get(h), (size.get(hostStart.get(h)) || 0) + 1);
    hosts.forEach((h, i) => {
      if (!h.hasAttribute('data-oe') || cleanHTML(h) !== hostStart.get(h)) return;
      const n = r.hits[i];
      if (n === 1 || (n > 1 && n === size.get(hostStart.get(h)))) return;
      freeze(h);
    });
    render();
  }

  function unwrapRuns() {
    for (const w of document.querySelectorAll('oe-run')) w.replaceWith(...w.childNodes);
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
    if (e.target.closest && e.target.closest('.oe-cmt')) return;
    // Strg/Cmd-Klick folgt einem Link im bearbeitbaren Text.
    if (editing && !e.ctrlKey && !e.metaKey && e.target.closest && inZone(e.target)) e.preventDefault();
  }

  // ------------------------------------------------------------ dokument
  // Die Seite ist beim Bearbeiten ein einziges Dokument: gespeichert wird der Unterschied zwischen zwei
  // Serialisierungen der Wurzel (docBase = zuletzt gespeichert, serial = jetzt) als Stellen mit Umgebung (hunks).
  // Inseln (Canvas, Menue, Skript-Texte, eingefrorene Stellen) zaehlen immer mit ihrem Grundzustand; \u0001 markiert
  // ihre Grenze, damit die Umgebung einer Stelle nie in eine Insel hineinreicht.

  const SENT = '\u0001';
  const UI_ISL = '[data-oe-ui]:not(.oe-cmt):not(.oe-cmtgroup)';

  function scrubClone(c) {
    c.removeAttribute('data-oe');
    c.removeAttribute('data-oe-isl');
    c.classList.remove('oe-cur');
    if (!c.getAttribute('class')) c.removeAttribute('class');
    return c;
  }

  // Grundzustand einer Insel: ihr HTML vor dem Sperren, ohne Oberflaeche.
  function cleanOuter(el) {
    const c = el.cloneNode(true);
    c.querySelectorAll('[data-oe-ui]').forEach((n) => n.remove());
    scrubClone(c);
    for (const n of c.querySelectorAll('[data-oe],[data-oe-isl],.oe-cur')) scrubClone(n);
    return c.outerHTML;
  }

  // Editor-Oberflaechen (Leiste, Panels, Toasts) direkt unter der Wurzel gehoeren nicht ins Gerippe: sonst verschiebt jedes
  // neu erscheinende Panel die Suffix-Laengen der Rueckgaengig-Schritte. setSkel haengt sie unveraendert hinten wieder an.
  const looseUi = (parent) => [...parent.children].filter((n) => n.matches(UI_ISL));

  // mode 'doc': Inseln mit Grundzustand zwischen Markern; 'skel': Inseln als <oe-isl n=..> (fuer Rueckgaengig).
  function serial(mode) {
    for (const n of root.querySelectorAll(UI_ISL)) if (!n.hasAttribute('data-oe-isl')) n.setAttribute('data-oe-isl', 'u' + ++islandSeq);
    const c = root.cloneNode(true);
    if (mode === 'skel') looseUi(c).forEach((n) => n.remove());
    c.querySelectorAll('[data-oe-ui]').forEach((n) => { if (mode === 'doc' || !n.matches(UI_ISL)) n.remove(); });
    for (const n of c.querySelectorAll('[data-oe-isl]')) {
      const m = document.createElement('oe-isl');
      m.setAttribute('n', n.getAttribute('data-oe-isl'));
      n.replaceWith(m);
    }
    for (const w of c.querySelectorAll('oe-run')) w.replaceWith(...w.childNodes);
    for (const n of c.querySelectorAll('[data-oe],.oe-cur')) scrubClone(n);
    let h = c.innerHTML;
    if (mode === 'doc') h = h.replace(/<oe-isl n="([^"]+)"><\/oe-isl>/g, (_, id) => SENT + (islandBase.get(id) ?? '') + SENT);
    return h;
  }

  const skel = () => serial('skel');

  // ---- Unterschied zweier Dokumentstaende als Stellen (hunks)

  const TOKENS = /(\u0001|<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>|\s+)/;
  const tokenize = (str) => str.split(TOKENS).filter((x) => x !== '');

  // Myers-Diff ueber Token; liefert die abweichenden Bereiche {a0,a1,b0,b1}. Ueber maxD Abweichungen ein einziger Bereich.
  function diffRegions(A, B, maxD = 500) {
    const n = A.length;
    const m = B.length;
    let p = 0;
    while (p < n && p < m && A[p] === B[p]) p++;
    let q = 0;
    while (q < n - p && q < m - p && A[n - 1 - q] === B[m - 1 - q]) q++;
    const a = A.slice(p, n - q);
    const b = B.slice(p, m - q);
    if (!a.length && !b.length) return [];
    const N = a.length;
    const M = b.length;
    const max = Math.min(N + M, maxD);
    const off = max + 1;
    const v = new Int32Array(2 * max + 3);
    const trace = [];
    let found = -1;
    outer: for (let d = 0; d <= max; d++) {
      trace.push(v.slice());
      for (let k = -d; k <= d; k += 2) {
        let x = (k === -d || (k !== d && v[off + k - 1] < v[off + k + 1])) ? v[off + k + 1] : v[off + k - 1] + 1;
        let y = x - k;
        while (x < N && y < M && a[x] === b[y]) { x++; y++; }
        v[off + k] = x;
        if (x >= N && y >= M) { found = d; break outer; }
      }
    }
    if (found < 0) return [{ a0: p, a1: p + N, b0: p, b1: p + M }];
    const delA = new Uint8Array(N);
    const insB = new Uint8Array(M);
    let x = N;
    let y = M;
    for (let d = found; d > 0; d--) {
      const vv = trace[d];
      const k = x - y;
      const down = k === -d || (k !== d && vv[off + k - 1] < vv[off + k + 1]);
      const pk = down ? k + 1 : k - 1;
      const px = vv[off + pk];
      const py = px - pk;
      if (down) insB[py] = 1; else delA[px] = 1;
      x = px;
      y = py;
    }
    const out = [];
    let i = 0;
    let j = 0;
    while (i < N || j < M) {
      if (i < N && j < M && !delA[i] && !insB[j]) { i++; j++; continue; }
      const r = { a0: i + p, b0: j + p };
      while (i < N && delA[i]) i++;
      while (j < M && insB[j]) j++;
      r.a1 = i + p;
      r.b1 = j + p;
      out.push(r);
    }
    return out;
  }

  const tagName = (t) => (/^<\/?([a-zA-Z][\w:-]*)/.exec(t) || [])[1];
  const isTag = (t) => t[0] === '<' && t[1] !== '!';

  // Skripte der Seite schalten Klassen und Stile um: ein Bereich, in dem sich nur Attribute von Tags aendern, ist keine Textaenderung.
  function attrOnly(A, B) {
    if (A.length !== B.length) return false;
    return A.every((t, i) => t === B[i] || (isTag(t) && isTag(B[i]) && tagName(t) === tagName(B[i])));
  }

  function makeHunks(base, cur, ctx) {
    const A = tokenize(base);
    const B = tokenize(cur);
    const merged = [];
    for (const r of diffRegions(A, B)) {
      const last = merged[merged.length - 1];
      if (last && r.a0 - last.a1 < 4) { last.a1 = r.a1; last.b1 = r.b1; } else merged.push({ ...r });
    }
    const strip = (t) => t.split(SENT).join('');
    const out = [];
    for (const r of merged) {
      const ta = A.slice(r.a0, r.a1);
      const tb = B.slice(r.b0, r.b1);
      const old = ta.join('');
      const neu = tb.join('');
      if (strip(old) === strip(neu) || attrOnly(ta, tb)) continue;
      if (old.split(SENT).length > neu.split(SENT).length) throw new Error('Ein nicht bearbeitbarer Teil der Seite wurde verändert, nicht gespeichert');
      let pre = '';
      for (let i = r.a0 - 1; i >= 0 && pre.length < ctx && A[i] !== SENT; i--) pre = A[i] + pre;
      let post = '';
      for (let i = r.a1; i < A.length && post.length < ctx && A[i] !== SENT; i++) post += A[i];
      out.push({ pre, old: strip(old), new: strip(neu), post });
    }
    return out;
  }

  // Dokument wird aus einem Skelett neu aufgebaut; die lebenden Inseln (Canvas, Menue) wandern an ihren Platz zurueck.
  function setSkel(html) {
    const live = new Map();
    for (const n of root.querySelectorAll('[data-oe-isl]')) live.set(n.getAttribute('data-oe-isl'), n);
    const t = document.createElement('template');
    t.innerHTML = html;
    const marks = [...t.content.querySelectorAll('oe-isl')];
    if (marks.some((m) => !live.has(m.getAttribute('n')))) return false;
    for (const m of marks) m.replaceWith(live.get(m.getAttribute('n')));
    const keep = looseUi(root);
    keep.forEach((n) => n.remove());
    root.replaceChildren(...t.content.childNodes, ...keep);
    return true;
  }

  const histKey = () => 'oe-hist:' + location.host + pagePath;

  function persistHist() {
    const save = () => localStorage.setItem(histKey(), JSON.stringify({ v: 2, u: undoStack, r: redoStack }));
    try {
      save();
    } catch (e) {
      // Speicher voll: aelteste Schritte zuerst opfern, aber sichtbar.
      try {
        undoStack.splice(0, Math.max(1, Math.ceil(undoStack.length / 10)));
        save();
        showToast('Verlauf: ältester Teil gekürzt (Speicher voll)', '', null, 5000);
      } catch (e2) { showToast('Verlauf lässt sich nicht speichern: ' + e2.message, '', null, 0, 'error'); }
    }
  }

  function loadHist() {
    undoStack = [];
    redoStack = [];
    try {
      const j = JSON.parse(stored(histKey()) || 'null');
      if (j && j.v === 2 && Array.isArray(j.u) && Array.isArray(j.r)) { undoStack = j.u; redoStack = j.r; }
    } catch (e) { showToast('Verlauf unlesbar, neu begonnen', '', null, 0, 'error'); }
  }

  function diffEntry(before, after) {
    const m = Math.min(before.length, after.length);
    let p = 0;
    while (p < m && before.charCodeAt(p) === after.charCodeAt(p)) p++;
    let s = 0;
    while (s < m - p && before.charCodeAt(before.length - 1 - s) === after.charCodeAt(after.length - 1 - s)) s++;
    return { t: Date.now(), p, s, a: before.slice(p, before.length - s), b: after.slice(p, after.length - s) };
  }

  function closeGroup() {
    clearTimeout(grpTimer);
    const g = openGrp;
    openGrp = null;
    if (!g) return;
    const after = skel();
    if (after !== g.before) { undoStack.push(diffEntry(g.before, after)); persistHist(); }
    render();
    refreshHist();
  }

  // Der Block, in dem die Schreibmarke steht.
  const BLOCKS = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, td, th, dt, dd, figcaption, div';
  function curBlock() {
    const sel = getSelection();
    const n = sel.rangeCount && sel.focusNode;
    const el = n && (n.nodeType === 1 ? n : n.parentElement);
    const b = el && el.closest(BLOCKS);
    return b && root && root !== b && root.contains(b) ? b : null;
  }

  // Tippen am selben Ort ohne Pause (1,2 s) und ohne Wortgrenze ist ein Schritt; alles andere schliesst ihn.
  function snap(kind, data) {
    const now = Date.now();
    const g = openGrp;
    const blk = curBlock();
    const brk = kind === 'type' && /\s/.test(data || '');
    if (g && g.blk === blk && g.kind === kind && kind !== 'force' && !g.closeNext && now - g.last < GROUP_MS) {
      g.last = now;
      if (brk) g.closeNext = true;
      clearTimeout(grpTimer);
      grpTimer = setTimeout(closeGroup, GROUP_MS);
      return;
    }
    closeGroup();
    ownAt = performance.now();
    redoStack = [];
    openGrp = { blk, kind, before: skel(), last: now, closeNext: brk };
    grpTimer = setTimeout(closeGroup, GROUP_MS);
    render();
  }

  function caretToEnd(el) {
    focusHost(el);
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(false);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }

  // Stelle im Text: Zeichenposition im Skelett -> Textposition (ohne Oberflaeche und Inseln).
  function placeCaret(el, html, pos) {
    const n = new DOMParser().parseFromString('<body>' + html.slice(0, Math.max(0, pos)), 'text/html').body.textContent.length;
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: (t) => (t.parentElement && t.parentElement.closest('[data-oe-ui], [data-oe-isl]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    let left = n;
    let node;
    let at = null;
    while ((node = w.nextNode())) {
      at = node;
      if (left <= node.data.length) break;
      left -= node.data.length;
    }
    focusHost(el);
    if (!at) { caretToEnd(el); return; }
    const r = document.createRange();
    r.setStart(at, Math.min(left, at.data.length));
    r.collapse(true);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    let rc = r.getBoundingClientRect();
    if (!rc.width && !rc.height && !rc.top) rc = (at.parentElement || el).getBoundingClientRect();
    if (rc.top < 80 || rc.bottom > innerHeight - 80) window.scrollBy(0, rc.top - innerHeight / 2);
  }

  // Wendet einen Schritt an. Passt der Text an der Stelle nicht mehr (Seite zwischendurch anders), wird nichts
  // ueberschrieben.
  function applyEntry(e, undoing) {
    if (!root) return false;
    const cur = skel();
    const from = undoing ? e.b : e.a;
    const to = undoing ? e.a : e.b;
    if (e.p + e.s > cur.length || cur.slice(e.p, cur.length - e.s) !== from) return false;
    ownAt = performance.now();
    const next = cur.slice(0, e.p) + to + cur.slice(cur.length - e.s);
    if (!setSkel(next)) return false;
    markStart();
    if (cmtOn) renderBadges();
    placeCaret(root, next, e.p + to.length);
    markDirty();
    return true;
  }

  function step(undoing) {
    closeGroup();
    const from = undoing ? undoStack : redoStack;
    const to = undoing ? redoStack : undoStack;
    let dropped = 0;
    let e;
    while (from.length) {
      if (from[from.length - 1].k === 'rename') {
        if (!dropped) stepRename(undoing);
        break;
      }
      e = from.pop();
      if (applyEntry(e, undoing)) { to.push(e); break; }
      dropped++;
    }
    if (dropped) showToast(dropped + (dropped > 1 ? ' Schritte' : ' Schritt') + ' nicht mehr anwendbar (Text hat sich geändert), verworfen', '', null, 0, 'error');
    persistHist();
    render();
    refreshHist();
  }

  // Umbenennen ist ein Schritt im Verlauf: zurueck benennt die Datei samt Links zurueck (der Server schreibt sie
  // und den Redirect um), vor tut es wieder. Der Pfad der Seite wechselt sofort mit der Antwort, noch bevor
  // wartende Speicherungen weiterlaufen.
  let renameViaHist = false;
  function renamePage(method, route, body) {
    const run = (async () => {
      try {
        const r = await api(method, route, body);
        const oldKey = histKey();
        pagePath = r.url;
        source.file = r.file;
        try { localStorage.removeItem(oldKey); } catch (e) { /* Schluessel war nie geschrieben */ }
        if (!renameViaHist) { undoStack.push({ k: 'rename', t: Date.now(), a: r.old, b: r.file }); redoStack = []; }
        persistHist();
        render();
        refreshHist();
        return r;
      } finally {
        renaming = null;
      }
    })();
    renaming = run.catch(() => {});
    return run;
  }

  let stepRenaming = false;
  async function stepRename(undoing) {
    if (stepRenaming || renaming) return;
    stepRenaming = true;
    const from = undoing ? undoStack : redoStack;
    const to = undoing ? redoStack : undoStack;
    const e = from[from.length - 1];
    const target = (undoing ? e.a : e.b).split('/').pop().replace(/\.[^.]*$/, '');
    renameViaHist = true;
    try {
      if (!(await extras.fn.renameTo(target))) return;
      const at = from.lastIndexOf(e);
      if (at >= 0) from.splice(at, 1);
      to.push(e);
    } finally {
      renameViaHist = false;
      stepRenaming = false;
      persistHist();
      render();
      refreshHist();
    }
  }

  function undo() { if (editing) step(true); }
  function redo() { if (editing) step(false); }

  // Zur Stelle eines Schritts springen, ohne etwas zu aendern.
  function jumpToStep(e, applied) {
    if (e.k === 'rename') return;
    if (!root) return;
    const cur = skel();
    placeCaret(root, cur, Math.min(cur.length, e.p + (applied ? e.b : e.a).length));
  }

  // ------------------------------------------------------------ verlauf

  function excerpt(h) {
    const t = new DOMParser().parseFromString('<body>' + h, 'text/html').body.textContent.replace(/\s+/g, ' ').trim();
    if (!t) return h ? '‹Format›' : '';
    return t.length > 40 ? t.slice(0, 40) + '…' : t;
  }

  function histRow(e, applied) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'oe-hrow';
    b.dataset.s = applied ? 'undo' : 'redo';
    const t = document.createElement('time');
    t.textContent = new Date(e.t).toLocaleTimeString('de-DE');
    const x = document.createElement('span');
    const nm = (f) => f.split('/').pop();
    const a = e.k === 'rename' ? nm(e.a) : excerpt(e.a);
    const c = e.k === 'rename' ? nm(e.b) : excerpt(e.b);
    if (a) { const d = document.createElement('del'); d.textContent = a; x.append(d, ' '); }
    if (c) { const n = document.createElement('ins'); n.textContent = c; x.append(n); }
    b.append(t, x);
    b.addEventListener('click', () => jumpToStep(e, applied));
    return b;
  }

  function refreshHist() {
    if (!hist || hist.hidden) return;
    const rows = [];
    for (const e of redoStack) rows.push(histRow(e, false));
    const now = document.createElement('div');
    now.className = 'oe-hnow';
    now.textContent = 'jetzt';
    rows.push(now);
    for (let k = undoStack.length - 1; k >= 0; k--) rows.push(histRow(undoStack[k], true));
    if (!undoStack.length && !redoStack.length) {
      const m = document.createElement('div');
      m.className = 'oe-hnow';
      m.textContent = 'noch keine Änderungen';
      rows.length = 0;
      rows.push(m);
    }
    hist.replaceChildren(...rows);
    if (btnHist) btnHist.setAttribute('aria-pressed', 'true');
  }

  function placeHist() {
    const vis = bar && bar.offsetParent !== null;
    const r = vis ? bar.getBoundingClientRect() : null;
    hist.style.left = hist.style.top = hist.style.right = hist.style.bottom = '';
    if (!r) { hist.style.top = '60px'; hist.style.right = '8px'; return; }
    hist.style.right = Math.max(8, innerWidth - r.right) + 'px';
    if (bar.classList.contains('oe-solo')) hist.style.bottom = innerHeight - r.top + 6 + 'px';
    else hist.style.top = r.bottom + 6 + 'px';
  }

  function toggleHist(force) {
    if (!hist) {
      hist = document.createElement('div');
      hist.id = 'oe-hist';
      hist.dataset.oeUi = '';
      hist.setAttribute('role', 'region');
      hist.setAttribute('aria-label', 'Veränderungsverlauf');
      hist.hidden = true;
      document.body.appendChild(hist);
    }
    const open = typeof force === 'boolean' ? force : hist.hidden;
    if (open) closeGroup();
    hist.hidden = !open;
    for (const b of [btnHist, menuHist]) if (b) b.setAttribute('aria-pressed', String(open));
    if (open) { placeHist(); refreshHist(); }
  }

  // Menue, Suchfeld und Editor-Oberflaeche liegen im gemeinsamen Editor-Container, gehoeren aber nicht dazu.
  const OUTSIDE = 'input, textarea, select, #meta-nav, [data-oe-ui]:not(.oe-cmt)';

  function onBeforeInput(e) {
    if (e.target.closest && e.target.closest(OUTSIDE)) return;
    const t = e.inputType || '';
    if (t === 'historyUndo' || t === 'historyRedo') {
      e.preventDefault();
      if (t === 'historyUndo') undo(); else redo();
      return;
    }
    if (badgeEvt(e)) return;
    const host = selHost();
    if (!host || hitsIsland(e)) {
      // Auswahl reicht in einen nicht bearbeitbaren Teil (Canvas, Menue, eingefrorener Text) oder ausserhalb des
      // Dokuments: nichts aendern. Handy-Tastaturen melden Eingaben teils nicht abbrechbar, dann nimmt input sie zurueck.
      if (e.cancelable) e.preventDefault();
      else stray = strayAt();
      showToast('hier nicht bearbeitbar', '', null, 2500);
      return;
    }
    ownAt = lastTypeAt = performance.now();
    snap(t.startsWith('delete') ? 'delete' : t === 'insertText' ? 'type' : 'force', e.data);
  }

  function hitsIsland(e) {
    const ranges = [];
    const sel = getSelection();
    if (sel.rangeCount) ranges.push(sel.getRangeAt(0));
    if (e.getTargetRanges) {
      for (const t of e.getTargetRanges()) {
        const r = document.createRange();
        r.setStart(t.startContainer, t.startOffset);
        r.setEnd(t.endContainer, t.endOffset);
        ranges.push(r);
      }
    }
    const isl = root ? root.querySelectorAll('[data-oe-isl]') : [];
    for (const r of ranges) for (const n of isl) if (r.intersectsNode(n)) return true;
    return false;
  }

  let stray = null;

  function strayAt() {
    const sel = getSelection();
    const n = sel.rangeCount && sel.anchorNode;
    return n && n.nodeType === 3 ? { node: n, data: n.data } : null;
  }

  function inBadge() {
    const sel = getSelection();
    const n = sel.rangeCount && sel.anchorNode;
    const el = n && (n.nodeType === 1 ? n : n.parentElement);
    return el ? el.closest('.oe-cmt') : null;
  }

  function caretAfter(node) {
    const r = document.createRange();
    r.setStartAfter(node);
    r.collapse(true);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }

  // Sprechblasen in einer Bearbeitungsstelle sind Teil von deren Editor: getippt wird dort, der Kommentarknoten
  // zieht nach, und das normale Autosave der Stelle speichert ihn mit.
  function onHostInput(e) {
    if (e.target.closest && e.target.closest(OUTSIDE)) return;
    if (badgeEvt(e)) return;
    if (stray) {
      stray.node.data = stray.data;
      stray = null;
      return;
    }
    const host = selHost();
    if (!host) return;
    if (/^(delete|insertParagraph|insertFromPaste)/.test(e.inputType || '')) tidyStyles();
    if (extras) extras.fmt.tidy(host);
    for (const b of host.querySelectorAll('.oe-cmt')) {
      const info = badgeInfo.get(b);
      if (!info || info.host !== host) continue;
      const t = cleanFor(info, b.textContent);
      if (t === info.text) continue;
      info.text = t;
      if (t) {
        info.node.data = ' ' + t + ' ';
        clearTimeout(info.timer);
        pendingItems.delete(info);
      } else {
        arm(info, 1500);
      }
    }
    markDirty();
  }

  // Die Wurzel, wenn der Knoten im bearbeitbaren Dokument liegt (nicht in einer Insel, nicht in der Oberflaeche).
  function inZone(node) {
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    if (!el || !root || !root.contains(el) || el.closest('[data-oe-isl]') || el.closest(OUTSIDE)) return null;
    return root;
  }
  const editHost = inZone;

  // Browser setzen beim Zusammenfuegen und Einfuegen gern style-Attribute und leere span/font: was nicht schon
  // beim Start da war, wird entfernt, damit nur der Text in die Datei kommt.
  function markStart() {
    startEls = new WeakSet();
    styledAtStart = new WeakSet();
    if (!root) return;
    for (const n of root.querySelectorAll('*')) {
      startEls.add(n);
      if (n.hasAttribute('style')) styledAtStart.add(n);
    }
  }

  function tidyStyles() {
    for (const n of root.querySelectorAll('[style],span,font')) {
      if (n.closest('[data-oe-isl],[data-oe-ui]')) continue;
      if (n.hasAttribute('style') && !styledAtStart.has(n)) n.removeAttribute('style');
      if (!startEls.has(n) && (n.localName === 'span' || n.localName === 'font') && !n.attributes.length) n.replaceWith(...n.childNodes);
    }
  }

  // Formatierung ueber execCommand: der Browser setzt b, i, a, die alle als Inline-Text gelten.
  function fmt(cmd, value) {
    const sel = getSelection();
    const el = sel.rangeCount && editHost(sel.anchorNode);
    if (!el || el !== editHost(sel.focusNode)) return;
    snap('force');
    document.execCommand(cmd, false, value);
    if (cmd === 'removeFormat') document.execCommand('unlink');
    markDirty();
    syncSelBar();
  }

  function shortcut(e) {
    const f = extras && extras.fmt.key(e);
    if (f) return f;
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
    const k = e.key.toLowerCase();
    if (k === 'z') return e.shiftKey ? redo : undo;
    if (k === 'y') return redo;
    if (k === 'k') return openLink;
    if (k === 'l' && e.shiftKey) return addComment;
    return null;
  }

  // Strg+S: stilles Sofort-Speichern (Autosave laeuft ohnehin). Strg+Z auch, wenn der Fokus gerade auf einem
  // Editor-Symbol liegt statt im Text.
  function globalKeys(e) {
    if (!editing || overlay) return;
    const mod = (e.ctrlKey || e.metaKey) && !e.altKey;
    if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault();
      e.stopPropagation();
      flushItems();
      save();
      return;
    }
    if (e.target.isContentEditable || e.target.closest('input, textarea, select, .oe-sel, .oe-cmt')) return;
    const k = mod && e.key.toLowerCase();
    if (k === 'z' || k === 'y') {
      e.preventDefault();
      e.stopPropagation();
      if (k === 'z' && !e.shiftKey) undo(); else redo();
    }
  }

  function plainPaste(e) {
    if (e.target.closest && e.target.closest(OUTSIDE)) return;
    if (badgeEvt(e)) return;
    e.preventDefault();
    const host = selHost();
    if (!host) return;
    snap('force');
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  }

  // Tasten bleiben im Text: Seiten-Shortcuts (Leertaste, Pfeile, Controls) sehen sie nicht.
  function keepKeys(e) {
    if (e.target.closest && e.target.closest(OUTSIDE)) return;
    if (badgeEvt(e)) return;
    const host = selHost();
    if (!host) return;
    if (e.type === 'keydown' && !e.isComposing) {
      const act = shortcut(e);
      if (act) {
        e.preventDefault();
        act();
      } else if (e.key === 'Enter' && inBadge()) {
        e.preventDefault();
        caretAfter(inBadge());
      } else if (e.key === 'Enter') {
        e.preventDefault();
        snap('force');
        const b = curBlock();
        document.execCommand(b && /^(P|H[1-6]|LI|BLOCKQUOTE|DD|DT|FIGCAPTION)$/.test(b.tagName) ? 'insertParagraph' : 'insertLineBreak');
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
    const f = extras ? extras.fmt.parts() : { inline: [], clear: null, block: [] };
    const row = (...k) => { const d = document.createElement('div'); d.className = 'oe-selrow'; d.append(...k.filter(Boolean)); return d; };
    selBar.replaceChildren(
      row(...f.inline,
        selButton('link', 'Link (Strg+K)', openLink, 'oe-fl'),
        selButton('noteplus', 'Kommentar einfügen (Strg+Umschalt+L)', addComment), f.clear),
      row(...f.block));
    linkRange = null;
  }

  function selectionHost() {
    const sel = getSelection();
    if (!editing || !sel.rangeCount || sel.isCollapsed) return null;
    const el = editHost(sel.anchorNode);
    const ae = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
    if (ae && ae.closest('.oe-cmt')) return null;
    return el && el === editHost(sel.focusNode) ? el : null;
  }

  function linkAt(node) {
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    const a = el && el.closest('a');
    return a && inZone(a) ? a : null;
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

  let cur = null;

  function syncSelBar() {
    if (badgeAt && inBadge() !== badgeAt) leaveBadge(badgeAt);
    const h = editing && selHost() ? curBlock() : null;
    if (h !== cur) {
      if (cur) cur.classList.remove('oe-cur');
      if (h) h.classList.add('oe-cur');
      cur = h;
    }
    if (extras) extras.fmt.sync();
    if (!selBar || linkRange) return;
    const host = selectionHost();
    if (!host) { selBar.hidden = true; return; }
    const sel = getSelection();
    selBar.hidden = false;
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
      focusHost(host);
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
      if (host) focusHost(host);
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
    } else {
      editing = true;
      document.documentElement.classList.add('oe-editing');
      hostStart = new Map();
      docBase = null;
      const hosts = candidates();
      loadHist();
      for (const el of hosts) {
        hostStart.set(el, cleanHTML(el));
        el.dataset.oe = '';
      }
      claimRoot(hosts);
      markStart();
      docBase = serial('doc');
      document.execCommand('defaultParagraphSeparator', false, 'p');
      watcher = new MutationObserver(onForeignChange);
      watcher.observe(document.body, { subtree: true, childList: true, characterData: true });
      dropUnlocatable(hosts);
    }
    if (cmtOn) renderBadges();
    syncPause();
    render();
  }

  // Ein einziges contenteditable auf dem gemeinsamen Vorfahren aller Textstellen: ein Tap von einer Stelle
  // zur naechsten bleibt im selben Editor, die Handy-Tastatur geht nicht zu und wieder auf. Was keine
  // Textstelle ist (Menue, Leiste, Canvas, gemischte Container), wird contenteditable=false.
  let root = null;
  let islands = [];

  function claimRoot(hosts) {
    let r = hosts.length ? hosts[0].parentElement : document.body;
    while (r !== document.body && !hosts.every((h) => r.contains(h))) r = r.parentElement;
    root = r;
    islands = [];
    const keep = new Set();
    for (const h of hosts) for (let a = h.parentElement; a && a !== root; a = a.parentElement) keep.add(a);
    const walk = (el) => {
      for (const c of el.children) {
        if (c.hasAttribute('data-oe')) continue;
        if (keep.has(c)) { walk(c); continue; }
        island(c);
      }
    };
    walk(root);
    root.dataset.oeRoot = '';
    root.setAttribute('contenteditable', 'true');
    root.addEventListener('paste', plainPaste);
    root.addEventListener('beforeinput', onBeforeInput);
    root.addEventListener('input', onHostInput);
    for (const t of ['keydown', 'keyup', 'keypress']) root.addEventListener(t, keepKeys);
  }

  // Eine Insel ist im Dokument nicht bearbeitbar und wird immer mit ihrem Grundzustand gespeichert.
  function island(el, base) {
    const id = String(++islandSeq);
    islandBase.set(id, base === undefined ? cleanOuter(el) : base);
    el.setAttribute('data-oe-isl', id);
    islands.push([el, el.getAttribute('contenteditable')]);
    el.setAttribute('contenteditable', 'false');
  }

  // Eine Textstelle, die ein Skript umschreibt, wird eingefroren: nicht mehr bearbeitbar, im Dokument wie am Start.
  function freeze(el) {
    if (!hostStart.has(el) || el.hasAttribute('data-oe-isl') || !el.isConnected) return;
    const start = hostStart.get(el);
    let base;
    if (el.localName === 'oe-run') base = start;
    else {
      const c = el.cloneNode(false);
      c.innerHTML = start;
      base = scrubClone(c).outerHTML;
    }
    delete el.dataset.oe;
    island(el, base);
  }

  function releaseRoot() {
    if (!root) return;
    root.removeAttribute('contenteditable');
    delete root.dataset.oeRoot;
    root.removeEventListener('paste', plainPaste);
    root.removeEventListener('beforeinput', onBeforeInput);
    root.removeEventListener('input', onHostInput);
    for (const t of ['keydown', 'keyup', 'keypress']) root.removeEventListener(t, keepKeys);
    for (const [el, was] of islands) {
      if (was === null) el.removeAttribute('contenteditable'); else el.setAttribute('contenteditable', was);
    }
    for (const n of root.querySelectorAll('[data-oe-isl]')) n.removeAttribute('data-oe-isl');
    islands = [];
    islandBase.clear();
    root = null;
  }

  // Die Textstelle, in der die Schreibmarke steht (es gibt nur noch einen fokussierten Editor, die Wurzel).
  function selHost() {
    const sel = getSelection();
    if (!sel.rangeCount) return null;
    const a = inZone(sel.anchorNode);
    return a && a === inZone(sel.focusNode) ? a : null;
  }

  function focusHost(el) {
    (root && root.contains(el) ? root : el).focus({ preventScroll: true });
  }

  const FOREIGN_BLOCKS = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, td, th, pre, figcaption, dd, dt, oe-run';

  function onForeignChange(muts) {
    const now = performance.now();
    if (now - ownAt < 300) return;
    const ui = (n) => n.nodeType === 1 && n.matches('[data-oe-ui]');
    const gone = new Set();
    for (const m of muts) {
      const t = m.target.nodeType === 1 ? m.target : m.target.parentElement;
      if (t && t.closest('[data-oe-ui]')) continue;
      if ([...m.addedNodes, ...m.removedNodes].some(ui)) continue;
      if (!root || !t || t.closest('[data-oe-isl]') || t === root) continue;
      let host = t.closest('[data-oe]');
      if (!host || !root.contains(host)) host = t.closest(FOREIGN_BLOCKS);
      if (!host || host === root || !root.contains(host) || host.closest('[data-oe-ui]') || host.closest('[data-oe-isl]')) continue;
      // Wer gerade tippt, wird nie ausgesperrt (Handy: Tippen in Text mit Animation).
      const sn = getSelection().anchorNode;
      if (sn && host.contains(sn) && now - lastTypeAt < 2000) continue;
      gone.add(host);
    }
    for (const el of gone) freeze(el);
    if (!gone.size) return;
    render();
  }

  function stopEditing() {
    if (watcher) watcher.disconnect();
    watcher = null;
    for (const el of document.querySelectorAll('[data-oe]')) delete el.dataset.oe;
    releaseRoot();
    unwrapRuns();
    if (cur) cur.classList.remove('oe-cur');
    cur = null;
    hostStart = new Map();
    docBase = null;
    closeGroup();
    undoStack = [];
    redoStack = [];
    if (hist) toggleHist(false);
    editing = false;
    if (selBar) { fillSelBar(); selBar.hidden = true; }
    document.documentElement.classList.remove('oe-editing');
    syncPause();
    render();
  }

  function dirty() {
    return !!root && docBase !== null && serial('doc') !== docBase;
  }

  // ---- Absatzformat (Normal/H1-H3): das Element wird durch ein anderes ersetzt, Inhalt und Attribute bleiben.
  // Im Dokument-Modell ist das eine gewoehnliche Aenderung am HTML: Schritt und Speichern laufen ueber den Vergleich.
  const BLOCK_TAGS = /^(p|h[1-6])$/;

  function blockOf() {
    const b = curBlock();
    const t = b && b.tagName.toLowerCase();
    return t && BLOCK_TAGS.test(t) ? t : null;
  }

  function setBlock(tag) {
    const el = curBlock();
    if (!el || !blockOf()) return false;
    if (el.tagName.toLowerCase() === tag) return true;
    snap('force');
    ownAt = performance.now();
    extras.fmt.keep(root, () => {
      const n = document.createElement(tag);
      for (const a of el.attributes) n.setAttribute(a.name, a.value);
      n.append(...el.childNodes);
      el.replaceWith(n);
    });
    if (cmtOn) renderBadges();
    markDirty();
    syncSelBar();
    return true;
  }

  function markDirty() {
    ownAt = lastTypeAt = performance.now();
    clearTimeout(saveTimer);
    if (!dirty()) {
      // Zurueck auf den gespeicherten Stand (z. B. per Rueckgaengig nach einem Fehler): dann ist nichts offen.
      saveOk();
      render();
      return;
    }
    render();
    saveTimer = setTimeout(save, AUTOSAVE_MS);
  }

  // Gespeichert wird genau der Stand, der abgeschickt wurde; was waehrenddessen dazukommt, folgt im naechsten Lauf.
  async function save() {
    clearTimeout(saveTimer);
    if (saving) { saveAgain = true; return saving; }
    if (!root) return true;
    const cur = serial('doc');
    if (cur === docBase) return true;
    let md = null;
    let hunks = null;
    try {
      if (isMd()) md = window._018EditorMd.payload(mdBase);
      else hunks = makeHunks(docBase, cur, 80);
    } catch (e) { saveTimer = saveFail(e, save); return false; }
    if (hunks && !hunks.length) { docBase = cur; saveOk(); render(); return true; }
    saving = (async () => {
      try {
        let r;
        try {
          r = await api('POST', 'save', md ? { path: pagePath, ...md } : { path: pagePath, hunks });
        } catch (e) {
          // Mehrdeutige Stelle: mit mehr Umgebung noch einmal.
          if (md || !/mehrfach/.test(String(e.message))) throw e;
          r = await api('POST', 'save', { path: pagePath, hunks: makeHunks(docBase, cur, 900) });
        }
        if (md) mdBase = md.text;
        docBase = cur;
        for (const h of document.querySelectorAll('[data-oe]')) hostStart.set(h, cleanHTML(h));
        setLive(r.live_differs);
        saveOk();
        watchCommit();
        return true;
      } catch (e) {
        saveTimer = saveFail(e, save);
        return false;
      } finally {
        saving = null;
        render();
      }
    })();
    const ok = await saving;
    if (saveAgain) {
      saveAgain = false;
      if (ok && dirty()) return save();
    }
    return ok;
  }

  // Der Server committet und pusht im Hintergrund; scheitert das, steht es hier sichtbar.
  function watchCommit(tries = 0) {
    clearTimeout(commitPoll);
    commitPoll = setTimeout(async () => {
      let r;
      try { r = await request('GET', 'status'); } catch (e) { say('Commit-Status: ' + e.message, 'error'); return; }
      if (r.error) say(SAVED + ', aber Commit/Push hängt: ' + r.error, 'error');
      else if (r.pending.length && tries < 20) watchCommit(tries + 1);
      else if (r.pending.length) say(SAVED + ', Commit steht seit über einer Minute aus', 'error');
    }, tries ? 3000 : 4500);
  }

  async function flushed() {
    for (;;) {
      flushItems();
      const open = [saving, ...itemSaves].filter(Boolean);
      if (!open.length) break;
      await Promise.all(open);
    }
    if (dirty()) await save();
    return !dirty() && !pendingItems.size;
  }

  // Seite wird verlassen: was noch offen ist, geht ohne Rueckfrage raus. Speichern laeuft mit keepalive und
  // erreicht den Server auch nach dem Entladen; die abgebrochene Antwort im Browser ist dann kein Fehler.
  function flushOnLeave() {
    leaving = true;
    closeGroup();
    flushItems();
    if (dirty() && !saving) save();
    if (pubTimer) firePublish(true);
  }

  // ------------------------------------------------------------ kommentare
  // Kommentare liegen als Sprechblase an ihrem Platz und sind bei eingeschaltetem Bearbeiten direkt schreibbar.
  // Im Text einer Bearbeitungsstelle laufen sie mit deren Autosave; ausserhalb (und JS) speichert jeder
  // Kommentar fuer sich, hintereinander, mit dem exakten Quelltext als Anker. Leer = loeschen.

  const pendingItems = new Set();
  const itemSaves = new Set();
  const CMT_EVENTS = ['beforeinput', 'input', 'keydown', 'keyup', 'keypress', 'paste'];

  function oneLine(t) { return t.replace(/\s+/g, ' ').trim(); }

  function cleanFor(info, t) {
    t = oneLine(t.replace(/\u200b/g, ''));
    return info.kind === 'html' ? t.replace(/-(?=-)/g, '- ') : t.replace(/\*\//g, '* /');
  }

  function wrapper(info) {
    if (info.kind === 'html') return (t) => '<!-- ' + t + ' -->';
    return info.block ? (t) => '/* ' + t + ' */' : (t) => '// ' + t;
  }

  // Kommentare in Skript-Code: Zeichenketten und Regex-Literale werden uebersprungen. raw = exakter Quelltext.
  function jsComments(code, out) {
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
        const raw = code.slice(i, e).replace(/\r$/, '');
        out.push({ kind: 'js', block: false, raw, text: oneLine(raw.slice(2)) });
        i = e;
      } else if (c === '/' && n === '*') {
        const end = code.indexOf('*/', i + 2);
        if (end === -1) break;
        out.push({ kind: 'js', block: true, raw: code.slice(i, end + 2), text: oneLine(code.slice(i + 2, end).replace(/^\s*\*+/gm, '')) });
        i = end + 2;
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

  // JS-Kommentare je Inline-Skript und HTML-Kommentare vor <body> (die haben im Text keinen Platz).
  function scanSource(text) {
    const bi = Math.max(0, text.search(/<body\b/i));
    const blocks = [];
    const head = [];
    const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>|<!--([\s\S]*?)-->/gi;
    let m;
    while ((m = re.exec(text))) {
      if (m[3] !== undefined) {
        if (m.index < bi && !m[3].startsWith('#') && m[3].trim()) head.push({ kind: 'html', raw: m[0], text: oneLine(m[3]) });
      } else if (m[2] !== undefined && !/\bsrc\s*=/i.test(m[1])) {
        const items = [];
        jsComments(m[2], items);
        const keep = items.filter((c) => c.text);
        if (keep.length) blocks.push({ code: m[2], head: m.index < bi, items: keep });
      }
    }
    return { blocks, head };
  }

  function bodyCommentNodes() {
    const nodes = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const p = n.parentElement;
      if ((!n.data.trim() && !fresh.has(n)) || (p && p.closest('#meta-nav, [data-oe-ui], .ctrl-panel'))) continue;
      nodes.push(n);
    }
    return nodes;
  }

  function clearBadges() {
    document.querySelectorAll('.oe-cmt, .oe-cmtgroup').forEach((b) => b.remove());
  }

  function makeBadge(info) {
    const b = document.createElement('span');
    b.className = 'oe-cmt';
    b.dataset.oeUi = '';
    b.textContent = info.text || '\u200b';
    badgeInfo.set(b, info);
    info.badge = b;
    const can = editing && st.inline && !info.readonly;
    if (can) {
      try { b.contentEditable = 'plaintext-only'; } catch (e) { /* aelterer Browser */ }
      if (b.contentEditable !== 'plaintext-only') b.contentEditable = 'true';
    } else {
      b.contentEditable = 'false';
    }
    b.title = can ? 'Kommentar: hier schreiben, leer lassen löscht' : 'Kommentar';
    for (const t of CMT_EVENTS) b.addEventListener(t, onBadge);
    b.addEventListener('blur', () => settle(info));
    return b;
  }

  function renderBadges() {
    flushItems();
    clearBadges();
    for (const n of bodyCommentNodes()) {
      const host = editing ? editHost(n) : null;
      const raw = '<!--' + n.data + '-->';
      const text = oneLine(n.data);
      const info = { kind: 'html', node: n, host, raw, text, shown: text,
        readonly: !host && !!source && !source.text.includes(raw) };
      n.after(makeBadge(info));
    }
    renderSourceBadges();
  }

  function renderSourceBadges() {
    if (!source) return;
    const { blocks, head } = scanSource(source.text);
    const scripts = [...document.scripts].filter((x) => !x.src && !x.closest('[data-oe-ui]'));
    const used = new Set();
    const group = () => {
      const g = document.createElement('div');
      g.className = 'oe-cmtgroup';
      g.dataset.oeUi = '';
      return g;
    };
    const fill = (g, list) => {
      for (const c of list) g.append(makeBadge({ kind: c.kind, block: c.block, raw: c.raw, text: c.text, shown: c.text, node: null, host: null }));
    };
    const top = group();
    fill(top, head);
    for (const b of blocks) {
      const dom = b.head ? null : scripts.find((x) => !used.has(x) && x.textContent === b.code);
      if (dom) {
        used.add(dom);
        const g = group();
        fill(g, b.items);
        dom.after(g);
      } else {
        fill(top, b.items);
      }
    }
    if (top.children.length) document.body.prepend(top);
  }

  function arm(info, ms) {
    clearTimeout(info.timer);
    pendingItems.add(info);
    info.timer = setTimeout(() => settle(info), ms);
  }

  // Tippen im Kommentar. Bearbeitungsstellen kennen ihn ueber den Kommentarknoten, der Rest speichert selbst.
  // Sprechblase ausserhalb einer Textstelle: unter der einen bearbeitbaren Wurzel ist sie kein eigener Editor
  // mehr und bekommt weder Fokus noch eigene Ereignisse. Die Wurzel reicht sie hier an onBadge weiter.
  let badgeAt = null;

  function badgeEvt(e) {
    const b = inBadge();
    if (!b || editHost(b) || b.contentEditable === 'false') return false;
    badgeAt = b;
    onBadge({ type: e.type, key: e.key, inputType: e.inputType, currentTarget: b,
      preventDefault: () => e.preventDefault(), stopPropagation: () => e.stopPropagation() });
    return true;
  }

  function leaveBadge(b) {
    if (document.activeElement === b) { b.blur(); return; }
    if (badgeAt === b) badgeAt = null;
    const info = badgeInfo.get(b);
    if (info && b.isConnected) settle(info);
  }

  function onBadge(e) {
    e.stopPropagation();
    const b = e.currentTarget;
    const info = badgeInfo.get(b);
    if (e.type === 'keydown') {
      if (e.key === 'Enter') { e.preventDefault(); leaveBadge(b); }
      // Unter der Wurzel springt Pos1/Ende sonst ans Zeilenende ausserhalb der Sprechblase.
      if ((e.key === 'End' || e.key === 'Home') && badgeAt === b) {
        e.preventDefault();
        const r = document.createRange();
        r.selectNodeContents(b);
        r.collapse(e.key === 'Home');
        getSelection().removeAllRanges();
        getSelection().addRange(r);
      }
      return;
    }
    if (e.type === 'beforeinput') {
      const t = e.inputType || '';
      if (/^insert(Paragraph|LineBreak)$/.test(t)) { e.preventDefault(); return; }
      if (info.host && (t === 'historyUndo' || t === 'historyRedo')) {
        e.preventDefault();
        if (t === 'historyUndo') undo(); else redo();
        return;
      }
      ownAt = lastTypeAt = performance.now();
      if (info.host) {
        snap('cmt');
      }
      return;
    }
    if (e.type !== 'input') return;
    ownAt = lastTypeAt = performance.now();
    const t = cleanFor(info, b.textContent);
    info.text = t;
    if (info.host) {
      if (t) {
        info.node.data = ' ' + t + ' ';
        markDirty();
        clearTimeout(info.timer);
        pendingItems.delete(info);
      } else {
        arm(info, 1500);
      }
    } else {
      arm(info, t ? AUTOSAVE_MS : 1500);
    }
  }

  // Nach einer Pause oder beim Verlassen: Kommentar speichern, leer = entfernen.
  function settle(info) {
    clearTimeout(info.timer);
    info.timer = null;
    if (info.host) {
      pendingItems.delete(info);
      if (!info.text && info.node.isConnected) {
        ownAt = performance.now();
        info.node.remove();
        info.badge.remove();
        markDirty();
      }
      return;
    }
    if (info.text !== info.shown) commitItem(info); else pendingItems.delete(info);
  }

  function flushItems() {
    for (const info of [...pendingItems]) settle(info);
  }

  function commitItem(info) {
    if (info.busy) { info.again = true; return; }
    info.busy = true;
    const text = info.text;
    const p = (async () => {
      try {
        const neu = text ? wrapper(info)(text) : '';
        const r = await api('POST', 'save', { path: pagePath, changes: [{ orig: info.raw, neu }] });
        info.raw = neu;
        info.shown = text;
        if (info.node) {
          ownAt = performance.now();
          if (text) info.node.data = ' ' + text + ' '; else info.node.remove();
        }
        if (!text) info.badge.remove();
        if (info.text === text) pendingItems.delete(info);
        setLive(r.live_differs);
        saveOk();
        watchCommit();
      } catch (e) {
        info.timer = saveFail(e, () => settle(info));
      } finally {
        info.busy = false;
      }
      if (info.again) {
        info.again = false;
        if (info.text !== info.shown) settle(info);
      }
    })();
    itemSaves.add(p);
    p.finally(() => itemSaves.delete(p));
  }

  function focusBadge(b) {
    b.focus({ preventScroll: false });
    if (b.closest('[data-oe]')) focusHost(b.closest('[data-oe]'));
    const r = document.createRange();
    r.selectNodeContents(b);
    r.collapse(false);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }

  // Neuer Kommentar: hinter der Auswahl bzw. dem Cursor in einer Bearbeitungsstelle (Knopf in der Leiste oder Strg+Umschalt+L).
  function addComment() {
    if (!editing) return;
    const sel = getSelection();
    const host = sel.rangeCount ? editHost(sel.focusNode) : null;
    const ae = sel.focusNode && (sel.focusNode.nodeType === 1 ? sel.focusNode : sel.focusNode.parentElement);
    if (!host || (ae && ae.closest('.oe-cmt'))) return;
    const r = sel.getRangeAt(0).cloneRange();
    r.collapse(false);
    snap('force');
    ownAt = performance.now();
    const node = document.createComment('  ');
    r.insertNode(node);
    fresh.add(node);
    if (!cmtOn) { cmtOn = true; syncPause(); }
    renderBadges();
    const b = [...document.querySelectorAll('.oe-cmt')].find((x) => badgeInfo.get(x).node === node);
    if (b) focusBadge(b);
    render();
  }

  function toggleComments() {
    cmtOn = !cmtOn;
    syncPause();
    if (cmtOn) {
      renderBadges();
      // JS-Kommentare brauchen den aktuellen Quelltext; er kommt nach, die Oberflaeche reagiert sofort.
      loadSource().then(() => {
        const a = document.activeElement;
        if (cmtOn && !(a && a.closest && a.closest('.oe-cmt'))) renderBadges();
      }).catch((e) => say(e.message, 'error'));
    } else {
      flushItems();
      clearBadges();
    }
    render();
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
      wrap,
      title: (t) => { wrap.querySelector('.oe-ov-title').textContent = t; },
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

  // Oberstes sichtbares Textstueck der Seite: erste Woerter und wievieltes gleiches davor liegt.
  function topVisibleText() {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.data.trim() && n.parentElement && !n.parentElement.closest(SKIP)
        ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    const seen = new Map();
    const range = document.createRange();
    let best = null;
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const words = n.data.trim().split(/\s+/).slice(0, 5);
      const key = words.join(' ');
      const k = seen.get(key) || 0;
      seen.set(key, k + 1);
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) {
        if (r.width > 0 && r.height > 0 && r.bottom > 4 && r.top < innerHeight && (!best || r.top < best.top)) {
          best = { top: r.top, words, k };
        }
      }
    }
    return best;
  }

  function findInSource(text, target) {
    const start = Math.max(0, text.search(/<body\b/i));
    for (let n = target.words.length; n >= 1; n--) {
      const re = new RegExp(target.words.slice(0, n).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'), 'g');
      re.lastIndex = start;
      let m;
      let k = 0;
      while ((m = re.exec(text))) {
        if (k === target.k) return { idx: m.index, len: m[0].length };
        k++;
      }
    }
    return { idx: 0, len: 0 };
  }

  function jumpTo(ta, idx, len) {
    const text = ta.value;
    ta.value = text.slice(0, idx);
    const h = ta.scrollHeight;
    ta.value = text;
    ta.scrollTop = Math.max(0, h - 60);
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(idx, idx + len);
    if (len) {
      setTimeout(() => {
        if (document.activeElement === ta && ta.selectionStart === idx && ta.selectionEnd === idx + len) ta.setSelectionRange(idx, idx);
      }, 1500);
    }
  }

  // Das Fenster steht sofort da; Speichern und Laden folgen dahinter.
  async function openSource() {
    if (overlay) return;
    const target = topVisibleText();
    const ov = openOverlay('Quelltext …');
    ov.head.append(button('abbrechen', closeOverlay));
    ov.msg('lädt …');
    let src;
    try {
      if (!(await flushed())) throw new Error('Änderungen noch nicht gespeichert');
      src = await loadSource();
    } catch (e) { ov.msg(e.message, 'error'); return; }
    if (overlay !== ov.wrap) return;
    ov.msg('');
    ov.title(src.file);
    const ta = document.createElement('textarea');
    ta.spellcheck = false;
    ta.setAttribute('aria-label', 'Quelltext');
    ta.value = src.text;
    ov.body.appendChild(ta);
    ov.head.append(Object.assign(button('speichern', async () => {
      ov.msg('speichere …');
      try {
        const r = await api('POST', 'source', { path: pagePath, text: ta.value, sha: src.sha });
        setLive(r.live_differs);
        closeOverlay();
        location.reload();
      } catch (err) { ov.msg(err.message, 'error'); }
    }), { className: 'oe-btn oe-primary' }));
    const at = target ? findInSource(src.text, target) : { idx: 0, len: 0 };
    jumpTo(ta, at.idx, at.len);
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
    if (overlay) return;
    const ov = openOverlay((forPublish ? 'veröffentlichen' : 'Änderungen') + ' …');
    ov.head.appendChild(button('schließen', closeOverlay));
    ov.msg('lädt …');
    let pending, hist;
    try {
      if (!(await flushed())) throw new Error('Änderungen noch nicht gespeichert');
      [pending, hist] = await Promise.all([api('GET', q('diff')), api('GET', q('history'))]);
    } catch (e) { ov.msg(e.message, 'error'); return; }
    if (overlay !== ov.wrap) return;
    ov.msg('');
    ov.title((forPublish ? 'veröffentlichen: ' : 'Änderungen: ') + hist.file);
    const h1 = document.createElement('h3');
    h1.className = 'oe-ov-h';
    h1.textContent = CFG.direct ? 'noch nicht im Verlauf' : CFG.draft ? 'Entwurf gegenüber veröffentlicht' : 'dev gegenüber live';
    if (!CFG.direct || pending.diff) ov.body.append(h1, renderDiff(pending.diff));
    if (hist.live_differs && !pubTimer) {
      const go = button('jetzt veröffentlichen', () => { closeOverlay(); startPublish(); });
      go.classList.add('oe-primary');
      ov.head.appendChild(go);
      if (forPublish) go.focus();
    }
    const h2 = document.createElement('h3');
    h2.className = 'oe-ov-h';
    h2.textContent = CFG.direct ? 'Verlauf' : 'Verlauf auf dev';
    ov.body.appendChild(h2);
    for (const c of hist.commits) {
      const d = document.createElement('details');
      d.className = 'oe-commit';
      const sm = document.createElement('summary');
      const when = document.createElement('span');
      when.className = 'oe-cmtmeta';
      when.textContent = fmtDate(c.date);
      sm.append(when, ' ' + c.subject);
      d.appendChild(sm);
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

  // Veröffentlichen wie bei Gmail: ein Klick, sofort "veröffentlicht · rückgängig"; erst nach 5 s geht der
  // Auftrag an den Server, der kopiert, committet und pusht im Hintergrund. Rückgängig im Fenster bricht ab.
  const PUBLISH_UNDO_MS = 5000;

  let pubWithDeps = false;

  function startPublish(withDeps) {
    if (pubTimer || !(CFG.draft ? st.draftCount : st.live)) return;
    st.live = false;
    pubWithDeps = withDeps === true;
    pubTimer = setTimeout(() => firePublish(false), PUBLISH_UNDO_MS);
    const n = st.draftCount || 0;
    showToast(CFG.draft ? (n > 1 ? 'veröffentlicht (' + n + ' Dateien)' : 'veröffentlicht') : 'veröffentlicht',
      'rückgängig', cancelPublish, PUBLISH_UNDO_MS + 400);
    syncPause();
    render();
  }

  function cancelPublish() {
    clearTimeout(pubTimer);
    pubTimer = null;
    st.live = true;
    syncPause();
    render();
  }

  async function firePublish(leave) {
    if (!pubTimer) return;
    clearTimeout(pubTimer);
    pubTimer = null;
    hideToast();
    syncPause();
    try {
      if (!leave && !(await flushed())) throw new Error('Änderungen noch nicht gespeichert');
      if (CFG.draft) await api('POST', 'publish-all', {});
      else await api('POST', 'publish', { path: pagePath, with_deps: pubWithDeps });
      pollPublish(0);
    } catch (e) { publishFailed(e.message); }
  }

  function publishFailed(msg, deps) {
    st.live = true;
    render();
    if (deps && deps.length) {
      // the page was NOT published: it needs files that differ on live. Offer to ship them together.
      showToast('nicht veröffentlicht: Seite braucht abweichende Dateien (' + deps.join(', ') + ')',
        'mit veröffentlichen', () => startPublish(true), 0, 'error');
      return;
    }
    showToast('nicht veröffentlicht: ' + msg, 'erneut', () => startPublish(), 0, 'error');
  }

  function pollPublish(n) {
    clearTimeout(pubPoll);
    pubPoll = setTimeout(async () => {
      let r;
      try { r = await request('GET', 'status'); } catch (e) { publishFailed(e.message); return; }
      const j = r.publish || {};
      if (j.state === 'error') publishFailed(j.error || 'unbekannter Fehler', j.deps);
      else if ((j.state === 'queued' || j.state === 'running') && n < 120) pollPublish(n + 1);
      else if (j.state === 'done' && CFG.draft) refreshDraft();
      else if (j.state === 'queued' || j.state === 'running') publishFailed('dauert ungewöhnlich lange');
    }, n ? 1000 : 400);
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
.oe-more{display:grid;grid-template-columns:0fr;opacity:0;visibility:hidden;
  transition:grid-template-columns .22s ease,opacity .16s ease,visibility 0s .22s}
.oe-more[data-open]{grid-template-columns:1fr;opacity:1;visibility:visible;transition:grid-template-columns .22s ease,opacity .2s ease .04s,visibility 0s}
.oe-more-in{display:flex;align-items:center;gap:2px;min-width:0;overflow:hidden}
@media (prefers-reduced-motion:reduce){.oe-more,.oe-more[data-open]{transition:none}}
#oe-bar button{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}
#oe-tip{position:fixed;z-index:2147483005;pointer-events:none;display:flex;align-items:center;gap:8px;max-width:min(260px,calc(100vw - 16px));
  padding:5px 9px;border-radius:5px;box-sizing:border-box;background:color-mix(in srgb,var(--bg-color,#000) 86%,var(--text-color,#fff));
  border:1px solid color-mix(in srgb,var(--text-color,#fff) 28%,transparent);color:var(--text-color,#fff);
  font:12px/1.3 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.35);
  opacity:0;transform:translateY(2px);transition:opacity .12s ease,transform .12s ease}
#oe-tip[data-on]{opacity:1;transform:none}
#oe-tip kbd{flex:none;font:11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;padding:2px 5px;border-radius:3px;
  background:color-mix(in srgb,var(--text-color,#fff) 14%,transparent);color:inherit;opacity:.85}
@media (min-width:720px){body.menu-open #oe-bar{display:flex;right:calc(var(--menu-effective-width) + 12px);max-width:calc(100vw - var(--menu-effective-width) - 24px)}}
oe-run{display:inline}
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
.oe-btn.oe-has-dot{position:relative}
.oe-btn.oe-has-dot::after{content:"";position:absolute;top:4px;right:4px;width:7px;height:7px;border-radius:50%;background:var(--text-color,#fff);box-shadow:0 0 0 2px var(--bg-color,#000)}
.oe-btn:focus{outline:none!important}
.oe-btn:focus-visible{outline:2px solid var(--text-color,#fff)!important;outline-offset:1px}
.oe-btn:disabled{opacity:.3!important;cursor:default}
.oe-btn[aria-pressed=true],.oe-primary{background:var(--text-color,#fff)!important;color:var(--bg-color,#000)!important;border-color:var(--text-color,#fff)!important}
.oe-btn.oe-mini{width:32px;height:32px;min-width:32px!important;min-height:32px!important;padding:0!important;opacity:.6}
.oe-btn.oe-mini:not([aria-pressed=true]){border-color:transparent!important}
.oe-btn.oe-mini:focus-visible,.oe-btn.oe-mini[aria-pressed=true]{opacity:1}
.oe-btn.oe-mini:disabled{opacity:.25!important}
.oe-sel{position:fixed;z-index:2147483002;display:flex;flex-direction:column;gap:2px;padding:2px;border-radius:6px;max-width:calc(100vw - 16px);box-sizing:border-box;
  border:1px solid color-mix(in srgb,var(--text-color,#fff) 30%,transparent);background:var(--bg-color,#000);color:var(--text-color,#fff);
  font:15px/1 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.oe-sel[hidden]{display:none}
.oe-selrow{display:flex;gap:2px;flex-wrap:wrap}
.oe-selrow:empty{display:none}
.oe-sel input{width:min(220px,60vw);min-height:32px;font-size:16px;padding:0 8px;border:0;border-radius:4px;box-sizing:border-box;
  color:var(--text-color,#fff);background:color-mix(in srgb,var(--text-color,#fff) 10%,transparent)}
.oe-btn[hidden]{display:none!important}
.oe-cmtmeta{flex:none;opacity:.55;font-variant-numeric:tabular-nums}
.oe-cmt{display:inline;margin:0 3px;padding:0 4px;border:1px dashed currentColor;border-radius:3px;
  font:12px/1.4 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere;opacity:.8;text-align:left;
  text-transform:none;letter-spacing:normal;-webkit-user-select:text;user-select:text}
.oe-cmt:empty::before{content:"\\200b"}
.oe-cmt[contenteditable=true],.oe-cmt[contenteditable=plaintext-only]{cursor:text;opacity:1}
.oe-cmt:focus{outline:1px solid currentColor;outline-offset:1px}
.oe-cmtgroup{display:block;margin:4px 0;text-align:left}
.oe-cmtgroup .oe-cmt{display:block;width:fit-content;max-width:100%;margin:2px 0}
html.oe-editing #interactionLayer{pointer-events:none!important}
.oe-toast{position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:2147483003;
  display:flex;align-items:center;gap:8px;max-width:calc(100vw - 24px);padding:4px 6px 4px 12px;border-radius:6px;box-sizing:border-box;
  border:1px solid color-mix(in srgb,var(--text-color,#fff) 40%,transparent);background:var(--bg-color,#000);color:var(--text-color,#fff);
  font:13px/1.25 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;overflow-wrap:anywhere}
.oe-toast .oe-btn{white-space:nowrap}
.oe-toast[data-kind=error]{background:var(--text-color,#fff);color:var(--bg-color,#000);font-weight:600}
.oe-toast[data-kind=error] .oe-btn{color:var(--bg-color,#000)!important;border-color:var(--bg-color,#000)!important}
.oe-editing [data-oe-root]{cursor:text}
.oe-editing .oe-cur{background:color-mix(in srgb,var(--text-color,#fff) 5%,transparent);border-radius:3px}
[data-oe-root]{outline:none}
.oe-editing,.oe-editing body{overscroll-behavior-y:contain}
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
#oe-admin .oe-narrow{display:none!important}
#oe-hist{position:fixed;z-index:2147483001;width:min(320px,calc(100vw - 16px));max-height:50vh;overflow:auto;box-sizing:border-box;padding:4px;
  border-radius:6px;border:1px solid color-mix(in srgb,var(--text-color,#fff) 40%,transparent);background:var(--bg-color,#000);
  color:var(--text-color,#fff);font:13px/1.3 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;overscroll-behavior:contain}
#oe-hist[hidden]{display:none}
.oe-hrow{display:flex;gap:8px;align-items:baseline;width:100%;min-height:36px;margin:0;padding:6px 8px;box-sizing:border-box;text-align:left;
  border:0;border-radius:4px;background:none;color:inherit;font:inherit;cursor:pointer;overflow-wrap:anywhere}
.oe-hrow:hover,.oe-hrow:focus-visible{background:color-mix(in srgb,var(--text-color,#fff) 12%,transparent)}
.oe-hrow[data-s=redo]{opacity:.5}
.oe-hrow time{flex:none;opacity:.6;font-variant-numeric:tabular-nums}
.oe-hrow del{opacity:.7;text-decoration:line-through}
.oe-hrow ins{text-decoration:none;padding:0 2px;background:var(--text-color,#fff);color:var(--bg-color,#000)}
.oe-hnow{padding:4px 8px;opacity:.5;font-size:12px;border-top:1px dashed currentColor;border-bottom:1px dashed currentColor}
/* Handy: eine Reihe zwischen Zurueck- und Menueknopf (bei 320 px 166 px frei), Quelltext und Aenderungen
   wandern dafuer in die Admin-Zeile im Menue. */
@media (max-width:480px){#oe-bar{right:79px;top:calc(var(--visible-viewport-top,0px) + 22px);max-width:calc(100vw - 87px)}
  #oe-bar .oe-btn.oe-mini{width:30px;min-width:30px!important}
  #oe-bar .oe-wide{display:none!important}
  #oe-admin .oe-narrow{display:inline-flex!important}
  #oe-admin{gap:0;padding:4px 8px}}
/* Seite ohne 0nefinity-Menue: die Leiste steht unten rechts (oben liegt dort meist die eigene
   Navigation der Seite) und traegt alles selbst, auch das Ausloggen. */
#oe-bar.oe-solo{top:auto;right:8px;bottom:calc(8px + env(safe-area-inset-bottom,0px));flex-direction:column-reverse;
  max-width:calc(100vw - 16px);padding:4px;border-radius:6px;background:var(--bg-color,#000);
  border:1px solid color-mix(in srgb,var(--text-color,#fff) 30%,transparent)}
@media (max-width:480px){#oe-bar.oe-solo{top:auto;right:8px;max-width:calc(100vw - 16px)}
  #oe-bar.oe-solo .oe-wide{display:inline-flex!important}}`;
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
    set(btnUndo, !editing || !(undoStack.length || openGrp));
    set(btnHist, !editing);
    btnHist.hidden = !editing;
    if (menuHist) menuHist.hidden = !editing;
    set(btnRedo, !editing || !(redoStack.length));
    btnUndo.hidden = btnRedo.hidden = !editing;
    set(btnSrc, off || !!overlay);
    set(btnCmt, off, cmtOn);
    set(btnDiff, off || !!overlay);
    if (menuSrc) {
      set(menuSrc, off || !!overlay);
      set(menuDiff, off || !!overlay);
    }
    if (btnPub) {
      set(btnPub, off || !(CFG.draft ? st.draftCount : st.live) || !!pubTimer || Date.now() < pubOffUntil);
      if (CFG.draft) {
        btnPub.classList.toggle('oe-has-dot', !!st.draftCount && !pubTimer);
        btnPub.title = st.draftCount ? 'veröffentlichen (' + st.draftCount + ' unveröffentlicht: ' + st.draftFiles.slice(0, 8).join(', ') + ')' : 'nichts zu veröffentlichen';
      }
    }
    if (extras) { extras.fn.setEditing(editing); extras.fmt.setEditing(editing); extras.marks.setActive(editing); }
    for (const b of [btnFmt, menuFmt]) if (b) b.hidden = !editing;
    more.toggleAttribute('data-open', !!editing);
    more.inert = !editing;
    // Unveroeffentlichtes bleibt auch zugeklappt sichtbar: Punkt am Stift.
    const unpub = btnPub && !pubTimer && !!(CFG.draft ? st.draftCount : st.live);
    btnEdit.classList.toggle('oe-has-dot', !!unpub && !editing);
    btnEdit.title = 'bearbeiten ein/aus' + (unpub && !editing ? ' (unveröffentlichte Änderungen)' : '');
    adoptTips(bar);
  }

  // ------------------------------------------------------------ tooltips

  // Eigener Tooltip fuer alle Leisten-Knoepfe (Hover und Tastaturfokus am Desktop, langer Druck am Handy).
  // 'title' wandert nach data-tip (sonst erschiene zusaetzlich der Browser-Tooltip) und dient als aria-label.
  const KEYWORDS = /^(Strg|Ctrl|Cmd|Alt|Umschalt|Shift)\b/;
  function adoptTips(scope) {
    for (const el of scope.querySelectorAll('button[title],a[title],button,.oe-btn')) {
      const t = el.getAttribute('title');
      if (t) { el.dataset.tip = t; el.removeAttribute('title'); }
      if (!el.hasAttribute('aria-label') && el.dataset.tip) el.setAttribute('aria-label', el.dataset.tip.replace(/\s*\([^()]*\)\s*$/, ''));
    }
  }

  function initTips() {
    const SEL = '#oe-bar button, #oe-bar a, .oe-sel button, .oe-btn';
    const tip = document.createElement('div');
    tip.id = 'oe-tip';
    tip.dataset.oeUi = '';
    tip.setAttribute('role', 'tooltip');
    document.body.appendChild(tip);
    let cur = null;
    let delay = 0;
    let press = 0;
    let hold = 0;
    let longPressed = false;

    const hide = () => { clearTimeout(delay); clearTimeout(hold); cur = null; tip.removeAttribute('data-on'); };
    const target = (e) => (e.target.closest ? e.target.closest(SEL) : null);

    function show(el) {
      adoptTips(el.parentElement || el);
      const text = el.dataset.tip || el.getAttribute('aria-label');
      if (!text) return;
      let label = text;
      let keys = '';
      const m = /^(.*?)\s*\(([^()]+)\)$/.exec(text);
      if (m && KEYWORDS.test(m[2])) { label = m[1]; keys = m[2]; }
      tip.textContent = '';
      const sp = document.createElement('span');
      sp.textContent = label.charAt(0).toUpperCase() + label.slice(1);
      tip.append(sp);
      if (keys) { const k = document.createElement('kbd'); k.textContent = keys; tip.append(k); }
      cur = el;
      const r = el.getBoundingClientRect();
      tip.style.left = '0px';
      tip.style.top = '0px';
      const w = tip.offsetWidth;
      const h = tip.offsetHeight;
      let top = r.bottom + 8;
      if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 8);
      const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
      tip.style.left = left + 'px';
      tip.style.top = top + 'px';
      tip.setAttribute('data-on', '');
    }

    document.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse') return;
      const el = target(e);
      if (!el) return;
      if (el === cur) return;
      clearTimeout(delay);
      delay = setTimeout(() => show(el), cur ? 0 : 350);
    }, true);
    document.addEventListener('pointerout', (e) => {
      if (e.pointerType !== 'mouse') return;
      const el = target(e);
      if (el && !(e.relatedTarget && el.contains(e.relatedTarget))) hide();
    }, true);
    document.addEventListener('focusin', (e) => {
      const el = target(e);
      if (el && el.matches(':focus-visible')) show(el);
    }, true);
    document.addEventListener('focusout', hide, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); }, true);
    window.addEventListener('scroll', hide, { passive: true, capture: true });

    document.addEventListener('pointerdown', (e) => {
      hide();
      longPressed = false;
      if (e.pointerType === 'mouse') return;
      const el = target(e);
      if (!el) return;
      clearTimeout(press);
      press = setTimeout(() => { longPressed = true; show(el); }, 500);
    }, true);
    const release = () => {
      clearTimeout(press);
      if (longPressed) hold = setTimeout(hide, 1800);
    };
    document.addEventListener('pointerup', release, true);
    document.addEventListener('pointercancel', release, true);
    // Der Druck, der den Tooltip zeigte, soll den Knopf nicht ausloesen.
    document.addEventListener('click', (e) => {
      if (!longPressed || !target(e)) return;
      longPressed = false;
      e.preventDefault();
      e.stopPropagation();
    }, true);
    document.addEventListener('contextmenu', (e) => { if (target(e) && e.pointerType !== 'mouse') e.preventDefault(); }, true);
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
    keepClicks(bar);
    status = document.createElement('span');
    status.className = 'oe-status';
    status.setAttribute('role', 'status');
    btnEdit = mini('pencil', 'bearbeiten ein/aus', () => { stored('oe-edit', editing ? '0' : '1'); toggleEdit(); });
    btnSrc = mini('code', 'Quelltext', openSource);
    btnSrc.classList.add('oe-wide');
    btnCmt = mini('bubble', 'Kommentare ein/aus', toggleComments);
    btnDiff = mini('diff', 'Änderungen', () => openChanges(false));
    btnDiff.classList.add('oe-wide');
    btnHist = mini('hist', 'Verlauf', () => toggleHist());
    btnHist.classList.add('oe-wide');
    btnFmt = mini('fmt', 'Formatierung', () => extras && extras.fmt.togglePanel());
    btnFmt.classList.add('oe-wide');
    btnUndo = mini('undo', 'rückgängig (Strg+Z)', undo);
    btnRedo = mini('redo', 'wiederholen (Strg+Umschalt+Z)', redo);
    const head = document.createElement('div');
    head.className = 'oe-head';
    // Der Stift steht rechts und bleibt beim Umschalten an seinem Platz; alles andere klappt links davon auf,
    // solange Bearbeiten an ist.
    more = document.createElement('div');
    more.className = 'oe-more';
    more.inert = true;
    moreIn = document.createElement('div');
    moreIn.className = 'oe-more-in';
    moreIn.setAttribute('role', 'group');
    moreIn.append(btnUndo, btnRedo, btnFmt, btnHist, btnSrc, btnCmt, btnDiff);
    if (!CFG.direct) {
      btnPub = mini('upload', 'veröffentlichen', startPublish);
      moreIn.append(btnPub);
    }
    if (!menuWrap()) {
      bar.classList.add('oe-solo');
      moreIn.append(mini('power', 'ausloggen', logout));
    }
    more.append(moreIn);
    head.append(more, btnEdit);
    bar.append(head, status);
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
      const r = await fetch(CFG.logout, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-0ne-Edit': '1', 'X-0ne-Csrf': csrf },
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
    const analytics = document.createElement('a');
    analytics.className = 'oe-btn';
    analytics.href = ANALYTICS;
    analytics.target = '_blank';
    analytics.rel = 'noopener';
    analytics.textContent = 'analytics';
    const out = button('', logout);
    menuSrc = mini('code', 'Quelltext', openSource);
    menuDiff = mini('diff', 'Änderungen', () => openChanges(false));
    menuHist = mini('hist', 'Verlauf', () => toggleHist());
    menuFmt = mini('fmt', 'Formatierung', () => extras && extras.fmt.togglePanel());
    for (const b of [menuSrc, menuDiff, menuHist, menuFmt]) b.classList.add('oe-narrow');
    for (const b of [analytics, out]) b.classList.add('oe-small');
    out.innerHTML = icon('power');
    out.setAttribute('aria-label', 'ausloggen');
    out.title = 'ausloggen';
    sec.append(menuSrc, menuDiff, menuHist, menuFmt, analytics, out);
    wrap.prepend(sec);
  }

  // Ein Veroeffentlichen, das im Hintergrund scheiterte, nachdem die Seite weg war, steht beim naechsten Laden da.
  async function checkPublishError() {
    try {
      const r = await request('GET', 'status');
      const j = r.publish || {};
      if (j.state === 'error' && Date.now() / 1000 - (j.at || 0) < 600) publishFailed(j.error || 'unbekannter Fehler', j.deps);
    } catch (e) { /* kein Fehlerbild: der Status ist nur eine Zusatzabfrage */ }
  }

  async function init() {
    let me;
    try {
      me = await fetch(CFG.me, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    } catch (e) { return; }
    if (me.status === 401) { buildLoginEntry(); return; }
    if (!me.ok) { console.error('[editor] ' + CFG.me + ' HTTP ' + me.status); return; }
    const info = await me.json();
    csrf = info.csrf || '';
    // Eingeloggt: Live-Reload laedt nie von selbst neu. Autosave und andere Sitzungen aendern laufend
    // Dateien, ein Reload zwischen zwei Eingaben riss Tim aus dem Text.
    window.__oneEditor = true;

    css();
    buildBar();
    initTips();
    buildSelBar();
    buildAdminMenu();
    render();
    document.addEventListener('click', guardClick, true);
    document.addEventListener('keydown', globalKeys, true);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'hidden') return;
      closeGroup();
      flushItems();
      if (dirty()) save();
    });
    window.addEventListener('pagehide', flushOnLeave);

    try {
      await loadSource();
      st.ready = true;
      st.inline = !!source.inline;
      if (isMd()) await loadMd();
      await loadExtras().catch((e) => say(e.message, 'error'));
      render();
      refreshDraft();
      checkPublishError();
      if (st.inline && stored('oe-edit') === '1') toggleEdit();
    } catch (e) {
      st.ready = false;
      render();
      say(e.message, 'error');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
