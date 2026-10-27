// Plus-Knopf fuer neue Seiten im Login-Editor. Wird von tools/editor.js eingehaengt; ohne mount() passiert nichts.
//
//   const np = window.OneEditorNewPage.mount({
//     bar: element,                            // Leiste, in die der Knopf kommt
//     request: (method, route, body) => ...,   // editor.js: api(); wirft bei Fehler (Error.message wird gezeigt)
//     beforeCreate: async () => true,          // z. B. offene Speicherungen abwarten
//     file: () => 'unbenannt.html',            // aktuelle Datei der Seite (editor.js: source.file)
//     onRenamed: (res) => {},                  // Seite wurde automatisch nach der Ueberschrift benannt: editor.js zieht pagePath nach
//     toast: (text, label, action) => {},      // kurze Meldung mit Rueckgaengig
//     go: (url) => location.assign(url),       // Standard: zur neuen Seite navigieren
//     btnClass: 'oe-btn oe-mini',              // Klassen des Knopfs (Standard wie editor.js)
//   });
//
// Ablauf: Plus klickt, die Seite "unbenannt" wird sofort angelegt und geoeffnet (Bearbeiten an, Platzhalter-
// Ueberschrift "Titel" markiert: tippen ersetzt sie). Kein Namensfeld. Nach dem Speichern der Ueberschrift benennt der
// Server die Datei danach (POST autoname), solange der Name noch der automatische ist. Eine nie beschriebene Seite
// wird beim naechsten Seitenwechsel wieder entfernt (POST discard; der Server prueft, dass sie unveraendert ist) und
// ist ueber Rueckgaengig (Ctrl+Z ohne weitere Schritte, oder die Meldung) sofort weg.
// Merker ueber den Seitenwechsel: sessionStorage "oe-newpage" = {file, from}.
(function () {
  const PLUS = 'M12 5v14M5 12h14';
  const NS = 'http://www.w3.org/2000/svg';
  const KEY = 'oe-newpage';
  const PLACEHOLDER = 'Titel';
  const AUTO = /^unbenannt(-\d+)?\.html$/;
  const MSG = {
    name_taken: 'Name ist schon vergeben',
    bad_name: 'Titel nicht erlaubt',
  };
  const flag = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };
  const setFlag = (v) => { try { v ? sessionStorage.setItem(KEY, JSON.stringify(v)) : sessionStorage.removeItem(KEY); } catch (e) { /* privat */ } };

  function css() {
    if (document.getElementById('oenp-style')) return;
    const s = document.createElement('style');
    s.id = 'oenp-style';
    s.textContent = `
.oe-btn[data-busy]{opacity:.5;pointer-events:none}`;
    document.head.appendChild(s);
  }

  function svg() {
    const el = document.createElementNS(NS, 'svg');
    el.setAttribute('viewBox', '0 0 24 24');
    el.setAttribute('class', 'oe-ic');
    el.setAttribute('fill', 'none');
    el.setAttribute('stroke', 'currentColor');
    el.setAttribute('stroke-width', '1.6');
    el.setAttribute('stroke-linecap', 'round');
    el.setAttribute('stroke-linejoin', 'round');
    el.setAttribute('width', '18');
    el.setAttribute('height', '18');
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', PLUS);
    el.appendChild(p);
    return el;
  }

  function mount(opts) {
    css();
    const request = opts.request;
    const go = opts.go || ((url) => location.assign(url));
    const fail = (e) => {
      const m = (e && e.message) || String(e);
      console.error('[editor] ' + m);
      if (opts.toast) opts.toast(MSG[m] || m, '', null, 'error');
    };
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = opts.btnClass || 'oe-btn oe-mini';
    btn.title = 'Neue Seite';
    btn.setAttribute('aria-label', 'Neue Seite');
    btn.dataset.oeUi = '';
    btn.appendChild(svg());
    opts.bar.appendChild(btn);

    // Der Undo-Verlauf haengt am Pfad; ein frueher gleich benanntes Platzhalter-Blatt darf nicht mitkommen.
    const clearHist = (path) => { try { localStorage.removeItem('oe-hist:' + location.host + path); } catch (e) { /* kein Speicher */ } };
    const pathOf = (file) => '/' + file.replace(/\.html$/, '');

    let busy = false;
    async function create() {
      if (busy) return;
      busy = true;
      btn.dataset.busy = '';
      try {
        if (opts.beforeCreate && (await opts.beforeCreate()) === false) throw new Error('Speichern läuft noch, bitte gleich nochmal');
        const res = await request('POST', 'newpage', {});
        clearHist(pathOf(res.file));
        setFlag({ file: res.file, from: location.pathname + location.search });
        go(res.url, res);
      } catch (e) {
        fail(e);
        busy = false;
        delete btn.dataset.busy;
      }
    }
    btn.addEventListener('click', create);

    const current = () => (opts.file ? opts.file() : '');
    const isNewHere = () => { const f = flag(); return !!f && f.file === current(); };

    // Seitenwechsel: eine zuvor angelegte, nie beschriebene Seite entfernen. Der Server lehnt ab, was beschrieben ist.
    async function sweep() {
      const f = flag();
      if (!f || f.file === current()) return;
      setFlag(null);
      if (!/^unbenannt(-\d+)?\.html$/.test(f.file)) return;
      clearHist(pathOf(f.file));
      try {
        await request('POST', 'discard', { path: pathOf(f.file) });
      } catch (e) { fail(e); }
    }

    const heading = () => document.querySelector('main h1, h1');
    const headingText = () => { const h = heading(); return h ? h.textContent.replace(/\s+/g, ' ').trim() : ''; };
    const pristine = () => headingText() === PLACEHOLDER && !!document.querySelector('main p, p') && document.querySelector('main p, p').textContent.trim() === '…';

    // Nach jedem erfolgreichen Speichern: Datei nach der Ueberschrift benennen (nur automatische Namen).
    let naming = null;
    async function afterSave() {
      if (naming) return naming;
      const t = headingText();
      if (!t || t === PLACEHOLDER) return;
      const f = flag();
      const auto = AUTO.test(current()) || (f && f.file === current());
      if (!auto) return;
      naming = (async () => {
        try {
          const res = await request('POST', 'autoname', { path: location.pathname });
          if (res.renamed) {
            history.replaceState(history.state, '', res.url + location.search + location.hash);
            setFlag({ file: res.file, from: (f && f.from) || '/' });
            if (opts.onRenamed) opts.onRenamed(res);
          }
        } catch (e) {
          fail(e);
        } finally { naming = null; }
      })();
      return naming;
    }

    async function undoCreate() {
      const f = flag();
      if (!f || f.file !== current() || !pristine()) return false;
      setFlag(null);
      clearHist(location.pathname);
      try {
        const res = await request('POST', 'discard', { path: location.pathname });
        if (res.skipped) { setFlag(f); return false; }
      } catch (e) { fail(e); return true; }
      go(f.from || '/');
      return true;
    }

    // Nach dem Oeffnen einer frisch angelegten Seite: Ueberschrift markiert, damit Tippen sie ersetzt.
    function focusHeading(rootEl) {
      const h = heading();
      if (!h) return;
      (rootEl || document.body).focus?.();
      const r = document.createRange();
      r.selectNodeContents(h);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
    }

    function arrive(rootEl) {
      if (!isNewHere() || !pristine()) return false;
      focusHeading(rootEl);
      if (opts.toast) opts.toast('Neue Seite angelegt', 'Rückgängig', () => { undoCreate(); });
      return true;
    }

    return { btn, create, sweep, afterSave, undoCreate, arrive, isNewHere, destroy() { btn.remove(); } };
  }

  window.OneEditorNewPage = { mount };
})();
