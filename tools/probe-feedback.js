// Ergebnis-Knoepfe fuer Testseiten. Einbinden:
//   <script src="/tools/probe-feedback.js" data-probe="autofill" defer></script>
// und je Variante ein Element mit data-probe-item="<Nummer>". Das Skript haengt dort zwei Knoepfe
// ("Leiste kommt" / "keine Leiste") an, baut unten ein Notizfeld und speichert jeden Tipp automatisch
// ueber /api/probe-result.php. Die Knoepfe sind <button>, keine Eingabefelder.
(function () {
  'use strict';
  var tag = document.currentScript;
  var probe = tag && tag.getAttribute('data-probe');
  if (!probe) { console.error('probe-feedback: data-probe fehlt'); return; }
  var API = '/api/probe-result.php';

  var css = document.createElement('style');
  css.textContent =
    '.pf-btns{display:flex;gap:.6rem;flex:1 0 100%;margin-top:.5rem}' +
    '.pf-btn{flex:1;min-height:3.2rem;font:inherit;font-size:1rem;font-weight:600;color:var(--text-color);background:var(--ui-fill-05);border:1px solid var(--ui-border-strong);border-radius:10px;padding:0 .6rem;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}' +
    '.pf-btn[aria-pressed="true"]{background:var(--text-color);color:var(--bg-color);border-color:var(--text-color)}' +
    '.pf-note{margin-top:2.5rem;padding-top:1.2rem;border-top:2px solid var(--ui-border-strong)}' +
    '.pf-note label{display:block;font-size:.85rem;opacity:.7;margin-bottom:.5rem}' +
    '.pf-note textarea{display:block;width:100%;box-sizing:border-box;min-height:6rem;font:inherit;font-size:1rem;color:var(--text-color);background:var(--ui-fill-08);border:1px solid var(--ui-border-strong);border-radius:10px;padding:.7rem;resize:vertical;outline:none}' +
    '.pf-note textarea:focus{border-color:var(--text-color)}' +
    '.pf-status{position:fixed;top:.5rem;right:.6rem;z-index:50;font-size:.75rem;opacity:0;transition:opacity .25s;pointer-events:none;background:var(--bg-color);padding:.15rem .5rem;border-radius:6px}' +
    '.pf-status.on{opacity:.6}' +
    '.pf-err{position:fixed;left:.6rem;right:.6rem;top:.6rem;z-index:60;display:none;align-items:center;gap:.8rem;padding:.8rem 1rem;border:2px solid var(--text-color);border-radius:10px;background:var(--bg-color);color:var(--text-color);font-size:.95rem}' +
    '.pf-err.on{display:flex}' +
    '.pf-err span{flex:1}' +
    '.pf-err button{min-height:2.8rem;padding:0 1.1rem;font:inherit;font-weight:700;color:var(--bg-color);background:var(--text-color);border:0;border-radius:8px;cursor:pointer}';
  document.head.appendChild(css);

  var results = {};
  var touched = {};
  var note = '';
  var noteTouched = false;
  var loaded = false;
  var buttons = {};
  var noteEl;

  var status = el('div', 'pf-status', 'gespeichert');
  status.setAttribute('role', 'status');
  var err = el('div', 'pf-err');
  err.setAttribute('role', 'alert');
  var errText = el('span');
  var retry = el('button', null, 'Nochmal');
  retry.type = 'button';
  err.append(errText, retry);
  document.body.append(status, err);

  function el(name, cls, text) {
    var e = document.createElement(name);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  function paint() {
    Object.keys(buttons).forEach(function (n) {
      ['leiste', 'keine'].forEach(function (v) {
        buttons[n][v].setAttribute('aria-pressed', results[n] === v ? 'true' : 'false');
      });
    });
  }

  function showError(msg, again) {
    errText.textContent = msg;
    retry.onclick = again;
    err.classList.add('on');
    status.classList.remove('on');
  }

  var inflight = false;
  var again = false;
  var statusTimer;

  var pendingSave = false;

  function save() {
    if (!loaded) { pendingSave = true; return; }
    if (inflight) { again = true; return; }
    inflight = true;
    again = false;
    err.classList.remove('on');
    var snapshot = JSON.stringify({ probe: probe, results: results, note: note, ua: navigator.userAgent.slice(0, 256) });
    fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: snapshot, credentials: 'same-origin' })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok || !j.ok) throw new Error((j && j.error) || ('HTTP ' + r.status));
        });
      })
      .then(function () {
        inflight = false;
        if (again) { save(); return; }
        status.classList.add('on');
        clearTimeout(statusTimer);
        statusTimer = setTimeout(function () { status.classList.remove('on'); }, 1500);
      })
      .catch(function (e) {
        inflight = false;
        showError('Nicht gespeichert (' + e.message + '). Die Auswahl bleibt hier stehen.', save);
      });
  }

  function choose(n, v) {
    touched[n] = true;
    if (results[n] === v) delete results[n]; else results[n] = v;
    paint();
    save();
  }

  document.querySelectorAll('[data-probe-item]').forEach(function (row) {
    var n = row.getAttribute('data-probe-item');
    var wrap = el('div', 'pf-btns');
    buttons[n] = {};
    [['leiste', 'Leiste kommt'], ['keine', 'keine Leiste']].forEach(function (d) {
      var b = el('button', 'pf-btn', d[1]);
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      // Fokus (und damit die Tastatur) bleibt im Testfeld, wenn man den Knopf tippt
      b.addEventListener('mousedown', function (e) { e.preventDefault(); });
      b.addEventListener('click', function () { choose(n, d[0]); });
      buttons[n][d[0]] = b;
      wrap.appendChild(b);
    });
    row.appendChild(wrap);
  });

  var noteBox = el('div', 'pf-note');
  var lab = el('label', null, 'Notiz (optional, gilt fuer die ganze Seite)');
  noteEl = el('textarea');
  noteEl.id = 'pf-note-field';
  lab.htmlFor = noteEl.id;
  noteEl.maxLength = 2000;
  noteEl.setAttribute('autocomplete', 'off');
  noteEl.setAttribute('autocapitalize', 'sentences');
  noteEl.setAttribute('data-1p-ignore', '');
  noteEl.setAttribute('data-lpignore', 'true');
  noteEl.setAttribute('data-bwignore', '');
  noteEl.setAttribute('data-form-type', 'other');
  var noteTimer;
  noteEl.addEventListener('input', function () {
    noteTouched = true;
    note = noteEl.value;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(save, 600);
  });
  noteEl.addEventListener('blur', function () {
    if (noteTouched) { clearTimeout(noteTimer); save(); }
  });
  noteBox.append(lab, noteEl);
  document.body.appendChild(noteBox);

  function load() {
    err.classList.remove('on');
    fetch(API + '?probe=' + encodeURIComponent(probe), { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok || !j.ok) throw new Error((j && j.error) || ('HTTP ' + r.status));
          return j;
        });
      })
      .then(function (j) {
        Object.keys(j.results || {}).forEach(function (n) { if (!touched[n]) results[n] = j.results[n]; });
        if (!noteTouched && typeof j.note === 'string') { note = j.note; noteEl.value = note; }
        loaded = true;
        paint();
        if (pendingSave) { pendingSave = false; save(); }
      })
      .catch(function (e) {
        showError('Gespeicherter Stand nicht ladbar (' + e.message + ').', load);
      });
  }
  load();
})();
