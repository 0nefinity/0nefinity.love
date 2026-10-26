// Dev-only Editor: eingeloggt (/enternity) erscheint unten rechts eine Leiste.
// "bearbeiten" macht Texte direkt editierbar, "speichern" committet auf claude-dev,
// "quelltext" oeffnet die ganze Datei, "veroeffentlichen" bringt diese Seite nach 0nefinity.love.
// Backend: ~/0nefinity/editor/server.py hinter /api/edit/. Fehler stehen sichtbar in der Leiste.
(function oneEditor() {
  if (!location.hostname.startsWith('dev.')) return;

  const INLINE = new Set(['A', 'B', 'I', 'EM', 'STRONG', 'SPAN', 'BR', 'SUB', 'SUP', 'CODE', 'SMALL',
    'MARK', 'U', 'S', 'ABBR', 'Q', 'KBD', 'WBR']);
  const TEXT_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TD', 'TH', 'DT', 'DD',
    'BLOCKQUOTE', 'FIGCAPTION', 'CAPTION', 'SUMMARY', 'LABEL', 'PRE', 'A', 'SPAN', 'DIV', 'EM', 'STRONG', 'B', 'I']);
  const SKIP = 'script, style, svg, canvas, noscript, template, textarea, input, select, button, #meta-nav, #oe-bar, #oe-src';
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

  let editing = false;
  let originals = new Map();
  let pagePath = location.pathname;
  let publishArmed = false;
  let bar, status, btnEdit, btnSave, btnSrc, btnPub;

  async function api(method, route, body) {
    const opts = { method, credentials: 'same-origin', headers: { Accept: 'application/json' } };
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
      throw new Error(data.detail && !ERRORS[data.error] ? msg + ': ' + data.detail : (data.detail ? msg + ' (' + data.detail + ')' : msg));
    }
    return data;
  }

  function say(text, kind) {
    status.textContent = text;
    status.dataset.kind = kind || '';
    if (kind === 'error') console.error('[editor] ' + text);
  }

  function setLive(differs) {
    btnPub.disabled = !differs;
    btnPub.title = differs ? 'diese Seite nach 0nefinity.love' : 'live ist auf demselben Stand';
  }

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
      if (!INLINE.has(c.tagName)) return false;
    }
    return true;
  }

  function blockLinks(e) {
    if (editing && e.target.closest('[data-oe]')) e.preventDefault();
  }

  function plainPaste(e) {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  }

  function toggleEdit() {
    editing = !editing;
    window.__oneEditing = editing;
    document.documentElement.classList.toggle('oe-editing', editing);
    if (editing) {
      originals = new Map();
      for (const el of candidates()) {
        originals.set(el, el.innerHTML);
        el.dataset.oe = '';
        el.setAttribute('contenteditable', 'plaintext-only');
        if (el.contentEditable !== 'plaintext-only') el.setAttribute('contenteditable', 'true');
        el.addEventListener('paste', plainPaste);
        el.addEventListener('input', markDirty);
      }
      say(originals.size ? originals.size + ' Textstellen editierbar' : 'keine Textstellen, quelltext nutzen');
    } else {
      if (dirty().length) {
        editing = true;
        window.__oneEditing = true;
        document.documentElement.classList.add('oe-editing');
        say('ungespeicherte Änderungen: erst speichern', 'error');
        return;
      }
      stopEditing();
      say('');
    }
    btnEdit.setAttribute('aria-pressed', String(editing));
    btnEdit.textContent = editing ? 'fertig' : 'bearbeiten';
  }

  function stopEditing() {
    for (const el of originals.keys()) {
      el.removeAttribute('contenteditable');
      delete el.dataset.oe;
      el.removeEventListener('paste', plainPaste);
      el.removeEventListener('input', markDirty);
    }
    originals = new Map();
    editing = false;
    window.__oneEditing = false;
    document.documentElement.classList.remove('oe-editing');
  }

  function dirty() {
    return [...originals].filter(([el, orig]) => el.innerHTML !== orig);
  }

  function markDirty() {
    const n = dirty().length;
    btnSave.disabled = n === 0;
    say(n ? n + ' geändert' : '');
  }

  async function save() {
    const changes = dirty().map(([el, orig]) => ({ orig, neu: el.innerHTML }));
    if (!changes.length) return;
    btnSave.disabled = true;
    say('speichere …');
    try {
      const r = await api('POST', 'save', { path: pagePath, changes });
      for (const [el] of dirty()) originals.set(el, el.innerHTML);
      setLive(r.live_differs);
      say(r.commit ? 'gespeichert auf dev' : 'nichts zu speichern', 'ok');
    } catch (e) {
      btnSave.disabled = false;
      say(e.message, 'error');
    }
  }

  async function publish() {
    if (dirty().length) { say('erst speichern', 'error'); return; }
    if (!publishArmed) {
      publishArmed = true;
      btnPub.textContent = 'wirklich live?';
      setTimeout(() => { publishArmed = false; btnPub.textContent = 'veröffentlichen'; }, 4000);
      return;
    }
    publishArmed = false;
    btnPub.textContent = 'veröffentlichen';
    btnPub.disabled = true;
    say('veröffentliche …');
    try {
      const r = await api('POST', 'publish', { path: pagePath });
      setLive(r.live_differs);
      say('live auf 0nefinity.love', 'ok');
    } catch (e) {
      btnPub.disabled = false;
      say(e.message, 'error');
    }
  }

  async function openSource() {
    if (dirty().length) { say('erst speichern', 'error'); return; }
    let src;
    try {
      src = await api('GET', 'source?path=' + encodeURIComponent(pagePath));
    } catch (e) { say(e.message, 'error'); return; }
    window.__oneEditing = true;
    const wrap = document.createElement('div');
    wrap.id = 'oe-src';
    wrap.innerHTML = '<div class="oe-src-head"><span class="oe-src-file"></span>' +
      '<button type="button" class="oe-btn" data-a="close">abbrechen</button>' +
      '<button type="button" class="oe-btn oe-primary" data-a="save">speichern</button></div>' +
      '<textarea spellcheck="false" aria-label="Quelltext"></textarea><div class="oe-src-msg" role="status"></div>';
    wrap.querySelector('.oe-src-file').textContent = src.file;
    const ta = wrap.querySelector('textarea');
    const msg = wrap.querySelector('.oe-src-msg');
    ta.value = src.text;
    const close = () => { wrap.remove(); window.__oneEditing = editing; };
    wrap.addEventListener('click', async (e) => {
      const a = e.target.dataset && e.target.dataset.a;
      if (a === 'close') close();
      if (a === 'save') {
        msg.textContent = 'speichere …';
        try {
          const r = await api('POST', 'source', { path: pagePath, text: ta.value, sha: src.sha });
          setLive(r.live_differs);
          close();
          location.reload();
        } catch (err) {
          msg.textContent = err.message;
          msg.dataset.kind = 'error';
          console.error('[editor] ' + err.message);
        }
      }
    });
    document.body.appendChild(wrap);
    ta.focus();
  }

  function css() {
    const s = document.createElement('style');
    s.textContent = `
#oe-bar{position:fixed;right:12px;bottom:12px;z-index:2147483000;display:flex;flex-wrap:wrap;align-items:center;gap:4px;
  max-width:calc(100vw - 24px);padding:4px;border-radius:6px;background:var(--ui-surface-strong,rgba(17,17,17,.95));
  border:1px solid var(--ui-border,rgba(255,255,255,.2));font:14px/1.2 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  color:var(--text-color,#eee);box-sizing:border-box}
#oe-bar .oe-status{padding:0 8px;opacity:.75;max-width:40ch;overflow-wrap:anywhere}
#oe-bar .oe-status[data-kind=error],#oe-src .oe-src-msg[data-kind=error]{color:#e0a39a;opacity:1}
#oe-bar .oe-status[data-kind=ok]{color:#9fc7a8;opacity:1}
.oe-btn{min-height:44px;min-width:44px;padding:0 12px;border:0;border-radius:4px;cursor:pointer;font:inherit;
  color:inherit;background:color-mix(in srgb,var(--text-color,#fff) 8%,transparent);transition:background .15s}
.oe-btn:hover:not(:disabled){background:color-mix(in srgb,var(--text-color,#fff) 16%,transparent)}
.oe-btn:focus-visible{outline:2px solid #8fb3d9;outline-offset:1px}
.oe-btn:disabled{opacity:.4;cursor:default}
.oe-btn[aria-pressed=true],.oe-primary{background:#2f4a66;color:#e8eef5}
.oe-editing [data-oe]{outline:1px dashed color-mix(in srgb,var(--text-color,#fff) 30%,transparent);outline-offset:2px;cursor:text}
.oe-editing [data-oe]:focus{outline:1px solid #8fb3d9}
#oe-src{position:fixed;inset:0;z-index:2147483001;display:flex;flex-direction:column;background:var(--bg-color,#000);
  font:14px/1.3 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--text-color,#eee)}
#oe-src .oe-src-head{display:flex;gap:4px;align-items:center;padding:4px}
#oe-src .oe-src-file{flex:1;padding:0 8px;opacity:.75;overflow-wrap:anywhere}
#oe-src textarea{flex:1;margin:0 4px;border:0;border-radius:4px;padding:8px;resize:none;font:13px/1.45 ui-monospace,Menlo,Consolas,monospace;
  color:inherit;background:color-mix(in srgb,var(--text-color,#fff) 6%,transparent)}
#oe-src .oe-src-msg{min-height:20px;padding:4px 12px}
@media (max-width:480px){#oe-bar{left:12px;right:12px;bottom:8px}#oe-bar .oe-status{flex-basis:100%;padding:4px 8px}}`;
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

  async function init() {
    let me;
    try {
      me = await fetch('/api/auth/me', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    } catch (e) { return; }
    if (me.status === 401) return;
    if (!me.ok) { console.error('[editor] /api/auth/me HTTP ' + me.status); return; }

    css();
    bar = document.createElement('div');
    bar.id = 'oe-bar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Editor');
    btnEdit = button('bearbeiten', toggleEdit);
    btnEdit.setAttribute('aria-pressed', 'false');
    btnSave = button('speichern', save);
    btnSave.classList.add('oe-primary');
    btnSave.disabled = true;
    btnSrc = button('quelltext', openSource);
    btnPub = button('veröffentlichen', publish);
    status = document.createElement('span');
    status.className = 'oe-status';
    status.setAttribute('role', 'status');
    bar.append(status, btnEdit, btnSave, btnSrc, btnPub);
    document.body.appendChild(bar);
    document.addEventListener('click', blockLinks, true);
    window.addEventListener('beforeunload', (e) => { if (dirty().length) e.preventDefault(); });

    try {
      const src = await api('GET', 'source?path=' + encodeURIComponent(pagePath));
      setLive(src.live_differs);
      if (!src.inline) btnEdit.disabled = true;
    } catch (e) {
      btnEdit.disabled = btnSave.disabled = btnSrc.disabled = btnPub.disabled = true;
      say(e.message, 'error');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
