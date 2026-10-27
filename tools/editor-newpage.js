// Plus-Knopf fuer neue Seiten im Login-Editor. Wird von tools/editor.js eingehaengt; ohne mount() passiert nichts.
//
//   const np = window.OneEditorNewPage.mount({
//     bar: element,                            // Leiste, in die der Knopf kommt
//     request: (method, route, body) => ...,   // editor.js: api(); wirft bei Fehler (Error.message wird gezeigt)
//     beforeCreate: async () => true,          // z. B. offene Speicherungen abwarten
//     go: (url) => location.assign(url),       // Standard: zur neuen Seite navigieren
//     btnClass: 'oe-btn oe-mini',              // Klassen des Knopfs (Standard wie editor.js)
//   });
//
// Ablauf: Plus klicken, Titel in das Feld tippen (kein Popup-Dialog), Enter legt die Seite an und oeffnet sie.
// Escape oder Klick daneben schliesst. Fehler stehen sichtbar unter dem Feld, die Eingabe bleibt, "nochmal" wiederholt.
(function () {
  const PLUS = 'M12 5v14M5 12h14';
  const NS = 'http://www.w3.org/2000/svg';
  const MSG = {
    name_taken: 'Name ist schon vergeben',
    bad_name: 'Titel nicht erlaubt',
  };

  function css() {
    if (document.getElementById('oenp-style')) return;
    const s = document.createElement('style');
    s.id = 'oenp-style';
    s.textContent = `
.oenp{position:fixed;z-index:2147483001;min-width:220px;max-width:min(360px,calc(100vw - 16px));padding:6px;border-radius:6px;
  background:var(--bg-color,#000);color:var(--text-color,#fff);border:1px solid color-mix(in srgb,var(--text-color,#fff) 35%,transparent);
  font:13px/1.3 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.45)}
.oenp[hidden]{display:none}
.oenp input{all:unset;box-sizing:border-box;width:100%;padding:6px 8px;border-radius:4px;
  border:1px solid color-mix(in srgb,var(--text-color,#fff) 30%,transparent);font:inherit;-webkit-user-select:text;user-select:text}
.oenp input:focus{border-color:var(--text-color,#fff)}
.oenp-hint{margin:5px 2px 0;font-size:12px;opacity:.6}
.oenp-msg{margin:5px 0 0;padding:3px 6px;border-radius:3px;font-size:12px;font-weight:600;
  background:var(--text-color,#fff);color:var(--bg-color,#000);display:flex;gap:8px}
.oenp-msg:empty{display:none}
.oenp-msg button{all:unset;cursor:pointer;text-decoration:underline;font:inherit}
.oenp[data-state=busy] input{opacity:.5}`;
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
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = opts.btnClass || 'oe-btn oe-mini';
    btn.title = 'Neue Seite';
    btn.setAttribute('aria-label', 'Neue Seite');
    btn.dataset.oeUi = '';
    btn.appendChild(svg());

    const pop = document.createElement('div');
    pop.className = 'oenp';
    pop.dataset.oeUi = '';
    pop.hidden = true;
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Titel der neuen Seite';
    input.maxLength = 120;
    input.setAttribute('aria-label', 'Titel der neuen Seite');
    input.spellcheck = false;
    const hint = document.createElement('div');
    hint.className = 'oenp-hint';
    hint.textContent = 'Enter legt die Seite an';
    const msg = document.createElement('div');
    msg.className = 'oenp-msg';
    msg.setAttribute('role', 'alert');
    pop.append(input, hint, msg);
    document.body.appendChild(pop);
    opts.bar.appendChild(btn);

    let busy = false;

    function place() {
      const r = btn.getBoundingClientRect();
      const w = pop.offsetWidth || 240;
      let left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
      pop.style.left = left + 'px';
      const below = r.bottom + 6 + (pop.offsetHeight || 60) < window.innerHeight;
      pop.style.top = below ? r.bottom + 6 + 'px' : Math.max(8, r.top - 6 - pop.offsetHeight) + 'px';
    }
    function say(text, retry) {
      msg.textContent = '';
      if (!text) return;
      msg.append(text);
      if (retry) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = 'nochmal';
        b.addEventListener('click', retry);
        msg.append(b);
      }
      console.error('[editor] ' + text);
    }
    function open() {
      pop.hidden = false;
      say('');
      place();
      input.focus();
    }
    function close() {
      if (busy) return;
      pop.hidden = true;
      input.value = '';
      say('');
    }

    async function create() {
      const title = input.value.normalize('NFC').trim();
      if (!title || busy) return;
      busy = true;
      pop.dataset.state = 'busy';
      say('');
      try {
        if (opts.beforeCreate && (await opts.beforeCreate()) === false) throw new Error('Speichern läuft noch, bitte gleich nochmal');
        const res = await request('POST', 'newpage', { title });
        busy = false;
        pop.hidden = true;
        input.value = '';
        go(res.url, res);
      } catch (e) {
        const m = (e && e.message) || String(e);
        say(MSG[m] || m, create);
      } finally {
        busy = false;
        pop.dataset.state = '';
      }
    }

    btn.addEventListener('click', () => (pop.hidden ? open() : close()));
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); create(); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); btn.focus(); }
    });
    document.addEventListener('pointerdown', (e) => {
      if (!pop.hidden && !pop.contains(e.target) && !btn.contains(e.target)) close();
    });
    window.addEventListener('resize', () => { if (!pop.hidden) place(); });

    return { btn, open, close, destroy() { btn.remove(); pop.remove(); } };
  }

  window.OneEditorNewPage = { mount };
})();
