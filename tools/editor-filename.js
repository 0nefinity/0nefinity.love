// Dateiname der Seite oben, im Bearbeiten-Modus direkt umbenennbar (kein Popup). Teil des Login-Editors, wird
// von tools/editor.js eingehaengt; ohne mount() passiert nichts.
//
//   const fn = window.OneEditorFilename.mount({
//     file: 'die0.html',                       // Dateipfad im Repo (aus /source)
//     request: (method, route, body) => ...,   // editor.js: api(); muss bei Fehler werfen (Error.message wird gezeigt)
//     path: () => location.pathname,           // Seitenpfad fuer den Server (Standard)
//     host: element,                           // optional; sonst fest oben links
//     beforeRename: async () => true,          // z. B. offene Speicherungen abwarten; false = abbrechen
//     onRenamed: (res) => {},                  // {old, file, url, links, warnings}: editor.js setzt pagePath/file neu
//   });
//   fn.setEditing(true|false); fn.setFile('x.html'); fn.destroy();
//
// Ablauf: Enter oder Verlassen des Feldes speichert, Escape verwirft. Der neue Name steht sofort da (ausgegraut,
// bis der Server fertig ist); danach history.replaceState auf die neue URL. Scheitert es, bleibt die Eingabe
// stehen, die URL unveraendert, die Fehlermeldung sichtbar mit "nochmal".
(function () {
  const MSG = {
    name_taken: 'Name ist schon vergeben',
    bad_name: 'Name nicht erlaubt',
    unchanged: '',
    protected_page: 'Diese Seite kann nicht umbenannt werden',
    not_renamable: 'Diese Datei kann nicht umbenannt werden',
    not_tracked: 'Seite ist noch nicht im Repo',
  };
  const BAD = /[\u0000-\u001f\u007f/\\?#%"<>|*:^$]/;

  function split(file) {
    const slash = file.lastIndexOf('/');
    const dir = slash >= 0 ? file.slice(0, slash + 1) : '';
    const name = file.slice(slash + 1);
    const dot = name.lastIndexOf('.');
    return { dir, stem: dot > 0 ? name.slice(0, dot) : name, ext: dot > 0 ? name.slice(dot) : '' };
  }

  function clientCheck(stem) {
    if (!stem) return 'Name ist leer';
    if (BAD.test(stem)) return 'Zeichen nicht erlaubt: / \\ ? # % " < > | * : ^ $';
    if (/^[._-]/.test(stem) || /[. ]$/.test(stem)) return 'darf nicht mit . _ - beginnen oder mit Punkt/Leerzeichen enden';
    return '';
  }

  function css() {
    if (document.getElementById('oef-style')) return;
    const s = document.createElement('style');
    s.id = 'oef-style';
    s.textContent = `
.oef{position:fixed;top:calc(var(--visible-viewport-top,0px) + 8px);left:12px;z-index:2147483000;max-width:calc(100vw - 150px);
  color:var(--text-color,#fff);font:13px/1.25 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:left}
.oef.oef-hosted{position:static;max-width:none}
.oef[hidden]{display:none}
.oef-row{display:flex;align-items:center;min-height:28px;padding:0 6px;border-radius:4px;
  border:1px solid transparent;transition:border-color .15s,opacity .15s}
.oef-row:hover,.oef-row:focus-within{border-color:color-mix(in srgb,var(--text-color,#fff) 30%,transparent)}
.oef-dir,.oef-ext{opacity:.5;white-space:pre}
.oef-name{min-width:2ch;padding:2px 1px;outline:none;white-space:pre;overflow:hidden;text-overflow:ellipsis;cursor:text;
  -webkit-user-select:text;user-select:text}
.oef-name:focus{text-overflow:clip}
.oef[data-state=busy] .oef-name{opacity:.5}
.oef-msg{display:flex;align-items:center;gap:8px;margin-top:3px;padding:3px 6px;font-size:12px;border-radius:3px}
.oef-msg:empty{display:none}
.oef-msg[data-kind=error]{background:var(--text-color,#fff);color:var(--bg-color,#000);font-weight:600}
.oef-msg[data-kind=info]{opacity:.7}
.oef-msg button{all:unset;cursor:pointer;text-decoration:underline;font:inherit}
@media (max-width:480px){.oef{top:calc(var(--visible-viewport-top,0px) + 62px);left:8px}}`;
    document.head.appendChild(s);
  }

  function mount(opts) {
    css();
    const request = opts.request;
    const getPath = opts.path || (() => location.pathname);
    let cur = split(opts.file);
    let shown = cur.stem;          // was im Feld steht und vom Server bestaetigt ist
    let pending = null;            // Name, der gerade (oder fehlgeschlagen) gespeichert wird
    let busy = false;
    let editing = false;

    const root = document.createElement('div');
    root.className = 'oef';
    root.dataset.oeUi = '';
    root.hidden = true;
    const row = document.createElement('div');
    row.className = 'oef-row';
    const dirEl = document.createElement('span');
    dirEl.className = 'oef-dir';
    const nameEl = document.createElement('span');
    nameEl.className = 'oef-name';
    nameEl.setAttribute('role', 'textbox');
    nameEl.setAttribute('aria-label', 'Dateiname');
    nameEl.spellcheck = false;
    nameEl.contentEditable = 'plaintext-only';
    if (nameEl.contentEditable !== 'plaintext-only') nameEl.contentEditable = 'true';
    const extEl = document.createElement('span');
    extEl.className = 'oef-ext';
    const msg = document.createElement('div');
    msg.className = 'oef-msg';
    msg.setAttribute('role', 'status');
    row.append(dirEl, nameEl, extEl);
    root.append(row, msg);
    (opts.host || document.body).appendChild(root);
    if (opts.host) root.classList.add('oef-hosted');

    function paint() {
      dirEl.textContent = cur.dir;
      extEl.textContent = cur.ext;
      if (document.activeElement !== nameEl) nameEl.textContent = pending !== null ? pending : shown;
      root.dataset.state = busy ? 'busy' : '';
      root.hidden = !editing;
    }

    function say(text, kind, retry) {
      msg.textContent = '';
      msg.dataset.kind = kind || '';
      if (!text) return;
      msg.append(text);
      if (retry) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = 'nochmal';
        b.addEventListener('click', retry);
        msg.append(b);
      }
      if (kind === 'error') console.error('[editor] ' + text);
    }

    function readable(e) {
      const m = (e && e.message) || String(e);
      return MSG[m] !== undefined && MSG[m] ? MSG[m] : m;
    }

    async function commit(name) {
      const stem = name.normalize('NFC').trim().replace(/\.(html|md)$/i, '').trim();
      if (!pending && stem === shown) { say(''); return paint(); }
      const bad = clientCheck(stem);
      if (bad) { pending = stem; say(bad, 'error'); return paint(); }
      if (busy) { pending = stem; return; }
      pending = stem;
      busy = true;
      say('');
      paint();
      try {
        if (opts.beforeRename && (await opts.beforeRename()) === false) throw new Error('Speichern läuft noch, bitte gleich nochmal');
        const res = await request('POST', 'rename', { path: getPath(), name: stem });
        cur = split(res.file);
        shown = cur.stem;
        pending = null;
        const next = res.url + location.search + location.hash;
        history.replaceState(history.state, '', next);
        if (opts.onRenamed) opts.onRenamed(res);
        const w = (res.warnings || []).filter(Boolean);
        const n = (res.links || []).length;
        if (w.length) say(w.join(' · '), 'info');
        else say(n ? `umbenannt, ${n} Link${n === 1 ? '' : 's'} angepasst` : 'umbenannt', 'info');
        if (!w.length) setTimeout(() => { if (msg.dataset.kind === 'info') say(''); }, 4000);
      } catch (e) {
        say(readable(e), 'error', () => commit(pending !== null ? pending : shown));
      } finally {
        busy = false;
        paint();
      }
    }

    nameEl.addEventListener('keydown', (e) => {
      e.stopPropagation();   // der Seiteneditor soll keine Pfeil-/Zeichentasten aus diesem Feld sehen
      if (e.key === 'Enter') { e.preventDefault(); nameEl.blur(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        // Die Seite ist selbst ein contenteditable: ein Standard-Alles-Auswaehlen wuerde die ganze Seite greifen.
        e.preventDefault();
        const r = document.createRange();
        r.selectNodeContents(nameEl);
        const sel = getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
      }
      else if (e.key === 'Escape') {
        e.preventDefault();
        pending = null;
        say('');
        nameEl.textContent = shown;
        nameEl.blur();
      }
    });
    nameEl.addEventListener('beforeinput', (e) => {
      if (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') e.preventDefault();
    });
    nameEl.addEventListener('paste', (e) => {
      e.preventDefault();
      const t = (e.clipboardData || window.clipboardData).getData('text').replace(/[\r\n]+/g, ' ');
      document.execCommand('insertText', false, t);
    });
    nameEl.addEventListener('focus', () => { say(''); if (pending !== null) nameEl.textContent = pending; });
    nameEl.addEventListener('blur', () => {
      const text = nameEl.textContent;
      if (pending === null && text === shown) return paint();
      commit(text);
    });

    paint();
    return {
      el: root,
      setEditing(on) { editing = !!on; paint(); },
      setFile(file) { cur = split(file); shown = cur.stem; pending = null; say(''); paint(); },
      destroy() { root.remove(); },
    };
  }

  window.OneEditorFilename = { mount };
})();
