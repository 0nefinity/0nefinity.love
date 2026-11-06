// Icon-Designer auf /icon-entwuerfe: baut die Symbole aus tools/editor-symbole.js (Lupe, Ausloggen, neue)
// aus Glyphen zusammen und speichert sie dorthin zurueck, ueber die Quelltext-Route des Editors
// (/api/edit/source). Diese Datei ist die einzige Quelle: Menue, Editor und Seiten lesen nur von dort.
// Gerechnet wird mit tools/icon-render.js, Glyphen-Umrisse liefert opentype.js aus den eigenen Schriften.
(function () {
  'use strict';
  const R = window.OneIconRender;
  const root = document.getElementById('ds');
  if (!root || !R || !window.oneSymbole) throw new Error('Icon-Designer: Quelle oder Renderer fehlt');

  const FILE = 'tools/editor-symbole.js';
  const DRAFT = 'icon-designer:entwurf';
  const FONT_DIR = '/tools/tools/fonts/!!DANGER!!-un0nefinity-fonts-!!DANGER!!/';
  const SCHRIFTEN = {
    'Ysabeau': 'Ysabeau/Ysabeau.ttf',
    'Ysabeau Italic': 'Ysabeau/Ysabeau-Italic.ttf',
    'Rubik Broken Fax': 'Rubik/RubikBrokenFax.ttf',
    'Rubik Doodle Triangles': 'Rubik/RubikDoodleTriangles.ttf',
    'Rubik Lines': 'Rubik/RubikLines.ttf',
  };
  // Von Seiten und Code beim Namen gerufen: nicht umbenennbar.
  const FEST = new Set(['lupe', 'ausloggen']);
  const ERRORS = { unauthenticated: 'nicht eingeloggt', csrf: 'Anfrage abgelehnt', not_tracked: 'Datei nicht im Repo' };
  // [Schluessel, Beschriftung, Schritt, Standard, Einheit]
  const FELDER = [
    ['x', 'verschieben x', 1, 0], ['y', 'verschieben y', 1, 0],
    ['drehung', 'drehen', 1, 0, '°'], ['neigung', 'neigen', 1, 0, '°'],
    ['kruemmung', 'krümmen', 1, 0, '°'], ['gewicht', 'Gewicht', 10, 400],
    ['skalaX', 'skalieren x', 0.01, 1], ['skalaY', 'skalieren y', 0.01, 1],
    ['aussparung', 'aussparung', 1, 0], ['stopp.0', 'stopp x', 1, 0], ['stopp.1', 'stopp y', 1, 0],
  ];
  const RAHMEN = [['0', 'x'], ['1', 'y'], ['2', 'breite'], ['3', 'höhe']];
  const NOFILL = 'autocomplete="off" data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other" spellcheck="false" autocorrect="off" autocapitalize="off"';

  const $ = (s) => root.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const round = (v, step) => +(Math.round(v / step) * step).toFixed(4);

  let data = clone(window.oneSymbole);
  let cur = new URLSearchParams(location.search).get('symbol');
  if (!data.symbole[cur]) cur = Object.keys(data.symbole)[0];
  let sel = -1;
  let seq = 0;

  // ---------- Verlauf (rueckgaengig / wiederholen) ----------
  const past = [], future = [];
  let lastKey = '', lastAt = 0;
  // Vor jeder Aenderung den Stand merken. Gleiche Feld-Aenderungen kurz hintereinander zaehlen als ein Schritt.
  function mark(key) {
    const now = Date.now();
    if (key && key === lastKey && now - lastAt < 1200) { lastAt = now; return; }
    lastKey = key || ''; lastAt = now;
    past.push(JSON.stringify({ data, cur, sel }));
    if (past.length > 200) past.shift();
    future.length = 0;
  }
  function step(from, to) {
    if (!from.length) return;
    to.push(JSON.stringify({ data, cur, sel }));
    ({ data, cur, sel } = JSON.parse(from.pop()));
    lastKey = '';
    changed();
  }
  const undo = () => step(past, future);
  const redo = () => step(future, past);

  const sym = () => data.symbole[cur];
  const part = () => sym().teile[sel];

  function get(t, key) {
    if (key.startsWith('stopp.')) return (t.stopp || [0, 0])[+key.slice(6)];
    return t[key];
  }
  function set(t, key, v) {
    if (key.startsWith('stopp.')) { t.stopp = t.stopp || [0, 0]; t.stopp[+key.slice(6)] = v; return; }
    t[key] = v;
  }

  // ---------- Schriften und Glyphen ----------
  const fonts = new Map();
  const hasWght = new Map();
  let otReady = null;
  function loadOpentype() {
    if (window.opentype) return Promise.resolve();
    return otReady ??= new Promise((ok, no) => {
      const s = document.createElement('script');
      s.src = '/tools/vendor/opentype/2.0.0/opentype.min.js';
      s.onload = ok;
      s.onerror = () => { otReady = null; no(new Error('opentype.js nicht ladbar')); };
      document.head.append(s);
    });
  }
  function font(name) {
    if (!SCHRIFTEN[name]) return Promise.reject(new Error('Schrift fehlt: ' + name));
    if (!fonts.has(name)) {
      const p = loadOpentype()
        .then(() => fetch(encodeURI(FONT_DIR + SCHRIFTEN[name])))
        .then((r) => { if (!r.ok) throw new Error('Schrift nicht ladbar: ' + name + ' (HTTP ' + r.status + ')'); return r.arrayBuffer(); })
        .then((buf) => window.opentype.parse(buf));
      p.catch(() => fonts.delete(name));
      fonts.set(name, p);
    }
    return fonts.get(name);
  }
  function wghtAxis(f) {
    return f.tables.fvar?.axes.find((a) => a.tag === 'wght') ?? null;
  }
  // Umriss neu aus Zeichen, Schrift und Gewicht (Grundlinie 0, 1000 Einheiten wie die bestehenden Teile).
  async function reglyph(t) {
    const want = JSON.stringify([t.zeichen, t.schrift, t.gewicht]);
    const f = await font(t.schrift);
    const ax = wghtAxis(f);
    const opts = ax ? { variation: { wght: Math.min(ax.maxValue, Math.max(ax.minValue, t.gewicht ?? ax.defaultValue)) } } : {};
    const d = f.getPath(t.zeichen ?? '', 0, 0, 1000, opts).toPathData(1);
    if (JSON.stringify([t.zeichen, t.schrift, t.gewicht]) !== want) return;
    t.d = d;
    changed();
  }

  // ---------- Speichern ----------
  let csrf = '';
  async function renewCsrf() {
    const me = await fetch('/api/auth/me', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (!me.ok) return false;
    const info = await me.json().catch(() => ({}));
    if (!info.csrf) return false;
    csrf = info.csrf;
    return true;
  }
  async function api(method, route, body, renewed) {
    const opts = { method, credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } };
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
    const out = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 403 && out.error === 'csrf' && !renewed && await renewCsrf()) return api(method, route, body, true);
      const err = new Error(ERRORS[out.error] ?? out.error ?? 'HTTP ' + res.status);
      err.code = out.error;
      throw err;
    }
    return out;
  }
  function withInhalt(d) {
    const out = clone(d);
    for (const name in out.symbole) {
      const s = out.symbole[name];
      out.symbole[name] = { viewBox: s.viewBox, teile: s.teile, inhalt: R.render(s) };
    }
    return out;
  }
  const BLOCK = /\/\* symbole: anfang \*\/[\s\S]*\/\* symbole: ende \*\//;
  async function saveOnce(again) {
    if (!csrf) await renewCsrf();
    const src = await api('GET', 'source?path=' + encodeURIComponent(FILE));
    if (!BLOCK.test(src.text)) throw new Error(FILE + ': Markierungen fehlen');
    const full = withInhalt(data);
    const text = src.text.replace(BLOCK, () => '/* symbole: anfang */ ' + JSON.stringify(full, null, 2) + ' /* symbole: ende */');
    try {
      await api('POST', 'source', { path: FILE, text, sha: src.sha });
    } catch (e) {
      if (e.code === 'changed_meanwhile' && !again) return saveOnce(true);
      throw e;
    }
    window.oneSymbole = full;
  }
  let timer = 0, saving = false, queued = false;
  function scheduleSave() {
    clearTimeout(timer);
    timer = setTimeout(save, 800);
  }
  async function save() {
    clearTimeout(timer);
    if (saving) { queued = true; return; }
    saving = true;
    const snapshot = JSON.stringify(data);
    try {
      await saveOnce(false);
      if (retry === save) showError(null);
      try { if (JSON.stringify(data) === snapshot) localStorage.removeItem(DRAFT); } catch (e) { /* ohne Speicher nur kein Entwurf */ }
    } catch (e) {
      showError(new Error('nicht gespeichert: ' + e.message), save);
    } finally {
      saving = false;
      if (queued) { queued = false; save(); }
    }
  }
  // Fehler bleiben stehen, bis "nochmal" klappt (oder der naechste Lauf derselben Sache).
  let retry = null;
  function showError(e, again) {
    const box = $('.ds-fehler');
    box.hidden = !e;
    retry = e ? again : null;
    if (!e) return;
    console.error('Icon-Designer:', e);
    box.querySelector('span').textContent = e.message;
  }
  const loud = (again) => (e) => showError(e, again);

  // ---------- Zeichnen ----------
  function svgOf(s, attrs, id) {
    return `<svg viewBox="${s.viewBox.join(' ')}" ${attrs}>${R.render(s).split('{id}').join(id)}</svg>`;
  }
  function drawStage() {
    const s = sym();
    const [x, y, w, h] = s.viewBox;
    const p = 0.3;
    const svg = $('.ds-stage');
    svg.setAttribute('viewBox', [x - w * p, y - h * p, w * (1 + 2 * p), h * (1 + 2 * p)].map((v) => R.num(v, 3)).join(' '));
    let hits = '', outline = '';
    s.teile.forEach((t, i) => {
      const f = R.form(t);
      hits += `<path class="ds-hit" data-i="${i}" d="${f.d}"${f.tf ? ` transform="${f.tf}"` : ''}/>`;
      if (i === sel) outline = `<path class="ds-sel" d="${f.d}"${f.tf ? ` transform="${f.tf}"` : ''}/>`;
    });
    svg.innerHTML = `<rect class="ds-frame" x="${x}" y="${y}" width="${w}" height="${h}"/>` +
      `<g class="ds-ink">${R.render(s).split('{id}').join('ds-st')}</g>${hits}${outline}`;
  }
  function drawSymbols() {
    $('.ds-syms').innerHTML = Object.keys(data.symbole).map((name) =>
      `<button type="button" class="ds-chip${name === cur ? ' on' : ''}" data-sym="${esc(name)}" aria-pressed="${name === cur}" aria-label="${esc(name)}">` +
      svgOf(data.symbole[name], 'aria-hidden="true" focusable="false"', 'ds-c' + (++seq)) + '</button>').join('') +
      '<button type="button" class="ds-chip ds-neu" data-neu aria-label="neues Symbol">+</button>';
  }
  function drawParts() {
    const s = sym();
    $('.ds-teile').innerHTML = s.teile.map((t, i) => {
      const one = { viewBox: s.viewBox, teile: [{ ...t, aussparung: 0, stopp: null }] };
      return `<button type="button" class="ds-teil${i === sel ? ' on' : ''}" data-i="${i}" aria-pressed="${i === sel}" aria-label="${esc(t.zeichen ?? '')}">` +
        svgOf(one, 'aria-hidden="true" focusable="false"', 'ds-t' + (++seq)) + '</button>';
    }).join('');
  }
  function drawFields() {
    const s = sym(), t = part();
    const name = $('.ds-name');
    if (document.activeElement !== name) name.value = cur;
    name.disabled = FEST.has(cur);
    RAHMEN.forEach(([k]) => {
      const inp = root.querySelector(`[data-rahmen="${k}"]`);
      if (document.activeElement !== inp) inp.value = R.num(s.viewBox[+k], 3);
    });
    root.querySelectorAll('.ds-teilfeld').forEach((el) => { el.hidden = !t; });
    $('.ds-del').disabled = !t;
    if (!t) return;
    const z = $('.ds-zeichen');
    if (document.activeElement !== z) z.value = t.zeichen ?? '';
    $('.ds-schrift').value = SCHRIFTEN[t.schrift] ? t.schrift : '';
    for (const [key, , , def] of FELDER) {
      const inp = root.querySelector(`[data-feld="${key}"]`);
      if (document.activeElement !== inp) inp.value = R.num(get(t, key) ?? def, 3);
    }
    // Gewicht nur bei Schriften mit Gewichtsachse
    const g = root.querySelector('[data-feld="gewicht"]').closest('label');
    if (hasWght.has(t.schrift)) { g.hidden = !hasWght.get(t.schrift); return; }
    g.hidden = true;
    font(t.schrift).then((f) => { hasWght.set(t.schrift, !!wghtAxis(f)); if (part() === t) g.hidden = !hasWght.get(t.schrift); },
      loud(() => drawFields()));
  }
  function drawPreview() {
    const s = sym();
    const sizes = [16, 24, 44, 112];
    $('.ds-vor').innerHTML = sizes.map((px) =>
      svgOf(s, `class="meta-loupe" style="width:${px}px;height:${px}px" aria-hidden="true" focusable="false"`, 'ds-v' + (++seq))).join('');
    $('.ds-stopp').hidden = !s.teile.some((t) => t.stopp && (t.stopp[0] || t.stopp[1]));
    drawRef();
  }
  // Vergleichszeile oben auf der Seite ("heute"): dieselbe Quelle.
  function drawRef() {
    document.querySelectorAll('[data-symbol-ref]').forEach((el) => {
      const s = data.symbole[el.dataset.symbolRef];
      if (s) el.innerHTML = svgOf(s, 'class="g" fill="#fff"', 'ref-' + el.dataset.symbolRef + (++seq));
    });
  }
  function render() {
    drawSymbols(); drawStage(); drawParts(); drawFields(); drawPreview();
    $('.ds-undo').disabled = !past.length;
    $('.ds-redo').disabled = !future.length;
    const u = new URL(location.href);
    if (u.searchParams.get('symbol') !== cur) { u.searchParams.set('symbol', cur); history.replaceState(null, '', u); }
  }
  function changed() {
    if (sel >= sym().teile.length) sel = sym().teile.length - 1;
    render();
    try { localStorage.setItem(DRAFT, JSON.stringify(data)); } catch (e) { /* ohne Speicher nur kein Entwurf */ }
    scheduleSave();
  }

  // ---------- Bedienung ----------
  function wiggle(el) {
    el.classList.remove('ds-wackel');
    void el.offsetWidth;
    el.classList.add('ds-wackel');
  }
  function insert() {
    mark();
    const s = sym();
    const [x, y, w, h] = s.viewBox;
    const t = { zeichen: '1', schrift: 'Ysabeau', gewicht: 400, d: 'M196 -414H243V0H175V-394L201 -360L59 -278L34 -322Z', x: 0, y: 0 };
    // in die Mitte des Rahmens
    const b = R.bbox(R.parse(t.d));
    t.x = round(x + w / 2 - (b.x + b.w / 2), 0.5);
    t.y = round(y + h / 2 - (b.y + b.h / 2), 0.5);
    s.teile.push(t);
    sel = s.teile.length - 1;
    changed();
    const z = $('.ds-zeichen');
    z.focus();
    z.select();
  }
  function remove() {
    if (!part()) return;
    mark();
    sym().teile.splice(sel, 1);
    sel = Math.min(sel, sym().teile.length - 1);
    changed();
  }
  function newSymbol() {
    mark();
    let n = 1;
    while (data.symbole['neu-' + n]) n++;
    cur = 'neu-' + n;
    data.symbole[cur] = { viewBox: [-54.5, -594, 629, 629], teile: [] };
    sel = -1;
    insert();
    past.pop(); // neues Symbol und erstes Teil sind ein Schritt
  }
  function rename(inp) {
    const name = inp.value.trim();
    if (name === cur) return;
    if (FEST.has(cur) || !/^[a-z0-9][a-z0-9-]*$/.test(name) || data.symbole[name]) { wiggle(inp); inp.value = cur; return; }
    mark();
    const next = {};
    for (const k in data.symbole) next[k === cur ? name : k] = data.symbole[k];
    data.symbole = next;
    cur = name;
    changed();
  }
  function setField(key, raw) {
    const t = part();
    const v = parseFloat(raw);
    if (!t || !Number.isFinite(v)) return;
    mark(key + ':' + cur + ':' + sel);
    set(t, key, key === 'aussparung' ? Math.max(0, v) : v);
    if (key === 'gewicht') { changed(); reglyph(t).catch(loud(() => reglyph(t).catch(loud()))); return; }
    changed();
  }

  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.sym) { if (b.dataset.sym !== cur) { cur = b.dataset.sym; sel = -1; render(); } return; }
    if (b.hasAttribute('data-neu')) return newSymbol();
    if (b.classList.contains('ds-teil')) { sel = +b.dataset.i === sel ? -1 : +b.dataset.i; render(); return; }
    if (b.classList.contains('ds-ins')) return insert();
    if (b.classList.contains('ds-del')) return remove();
    if (b.classList.contains('ds-undo')) return undo();
    if (b.classList.contains('ds-redo')) return redo();
    if (b.classList.contains('ds-retry')) { const r = retry; showError(null); return r?.(); }
    if (b.classList.contains('ds-stopp')) {
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', on);
      $('.ds-vor').style.setProperty('--loupe-on', on ? 1 : 0);
    }
  });
  root.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.feld) return setField(el.dataset.feld, el.value);
    if (el.dataset.rahmen) {
      const v = parseFloat(el.value);
      if (!Number.isFinite(v) || (+el.dataset.rahmen >= 2 && v <= 0)) return;
      mark('rahmen' + el.dataset.rahmen + cur);
      sym().viewBox[+el.dataset.rahmen] = v;
      changed();
      return;
    }
    if (el.classList.contains('ds-zeichen')) {
      const t = part();
      if (!t) return;
      mark('zeichen:' + cur + ':' + sel);
      t.zeichen = el.value;
      drawParts();
      reglyph(t).catch(loud(() => reglyph(t).catch(loud())));
    }
  });
  root.addEventListener('change', (e) => {
    const el = e.target;
    if (el.classList.contains('ds-name')) return rename(el);
    if (el.classList.contains('ds-schrift')) {
      const t = part();
      if (!t) return;
      mark();
      t.schrift = el.value;
      changed();
      reglyph(t).catch(loud(() => reglyph(t).catch(loud())));
    }
  });

  // Ziehen an der Beschriftung aendert den Wert (Daumen statt Tastatur).
  root.addEventListener('pointerdown', (e) => {
    const lab = e.target.closest('.ds-scrub');
    if (!lab || e.target.tagName === 'INPUT') return;
    const inp = lab.querySelector('input');
    const stepV = +inp.dataset.step;
    const x0 = e.clientX, v0 = parseFloat(inp.value) || 0;
    lab.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const v = round(v0 + Math.round((ev.clientX - x0) / 4) * stepV, stepV);
      if (String(v) !== inp.value) { inp.value = v; inp.dispatchEvent(new Event('input', { bubbles: true })); }
    };
    const up = () => { lab.removeEventListener('pointermove', move); lab.removeEventListener('pointerup', up); lab.removeEventListener('pointercancel', up); };
    lab.addEventListener('pointermove', move);
    lab.addEventListener('pointerup', up);
    lab.addEventListener('pointercancel', up);
  });

  // Buehne: Teil antippen waehlt, Ziehen verschiebt, zwei Finger drehen und skalieren (auch neben dem Teil
  // angesetzt). Antippen daneben ohne Geste hebt die Wahl auf.
  const stage = $('.ds-stage');
  const pointers = new Map();
  let gesture = null, leer = false;
  function toUser(e) {
    const m = stage.getScreenCTM().inverse();
    return { x: m.a * e.clientX + m.c * e.clientY + m.e, y: m.b * e.clientX + m.d * e.clientY + m.f };
  }
  function startGesture() {
    const t = part();
    if (!t) { gesture = null; return; }
    const pts = [...pointers.values()];
    gesture = { moved: gesture?.moved ?? false, x: t.x ?? 0, y: t.y ?? 0, sx: t.skalaX ?? 1, sy: t.skalaY ?? 1, r: t.drehung ?? 0, p: pts.map((p) => ({ ...p })) };
  }
  stage.addEventListener('pointerdown', (e) => {
    const hit = e.target.closest('.ds-hit');
    if (!pointers.size) {
      if (hit && +hit.dataset.i !== sel) { sel = +hit.dataset.i; render(); }
      if (!part()) return;
      gesture = null;
      leer = !hit;
    }
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, toUser(e));
    startGesture();
    e.preventDefault();
  });
  stage.addEventListener('pointermove', (e) => {
    if (!gesture || !pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, toUser(e));
    const t = part(), pts = [...pointers.values()], g = gesture;
    if (leer && pts.length === 1) return;
    if (!g.moved) { mark(); g.moved = true; }
    if (pts.length === 1 || g.p.length === 1) {
      t.x = round(g.x + pts[0].x - g.p[0].x, 0.5);
      t.y = round(g.y + pts[0].y - g.p[0].y, 0.5);
    } else {
      const d = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
      const ang = (a, b) => Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
      const f = d(pts[0], pts[1]) / (d(g.p[0], g.p[1]) || 1);
      t.skalaX = round(g.sx * f, 0.01);
      t.skalaY = round(g.sy * f, 0.01);
      t.drehung = round(g.r + ang(pts[0], pts[1]) - ang(g.p[0], g.p[1]), 0.5);
    }
    drawStage(); drawFields();
  });
  const release = (e) => {
    if (!pointers.delete(e.pointerId)) return;
    if (pointers.size) { startGesture(); return; }
    const moved = gesture?.moved;
    gesture = null;
    if (moved) changed();
    else if (leer) { sel = -1; render(); }
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);

  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName);
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !typing && e.key.toLowerCase() === 'z') { e.preventDefault(); return e.shiftKey ? redo() : undo(); }
    if (mod && !typing && e.key.toLowerCase() === 'y') { e.preventDefault(); return redo(); }
    if (typing || !part()) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); return remove(); }
    const k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!k) return;
    e.preventDefault();
    mark('pfeil:' + cur + ':' + sel);
    const n = e.shiftKey ? 10 : 1;
    part().x = (part().x ?? 0) + k[0] * n;
    part().y = (part().y ?? 0) + k[1] * n;
    changed();
  });

  // ---------- Aufbau ----------
  $('.ds-schrift').innerHTML = Object.keys(SCHRIFTEN).map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
  $('.ds-felder').innerHTML = FELDER.map(([key, label, stepV, , unit]) =>
    `<label class="ds-teilfeld ds-scrub"><span>${esc(label)}${unit ? ' ' + unit : ''}</span>` +
    `<input type="number" step="any" inputmode="decimal" data-feld="${key}" data-step="${stepV}" ${NOFILL}></label>`).join('');
  $('.ds-rahmen').innerHTML = RAHMEN.map(([k, label]) =>
    `<label class="ds-scrub"><span>${esc(label)}</span><input type="number" step="any" inputmode="decimal" data-rahmen="${k}" data-step="1" ${NOFILL}></label>`).join('');

  // Nicht gespeicherter Entwurf vom letzten Besuch (Funkloch, Tab zu) geht vor und wird nachgesendet.
  for (const k in data.symbole) delete data.symbole[k].inhalt; // inhalt gehoert zur Datei, nicht zum Bearbeitungsstand
  let pending = null;
  try { pending = JSON.parse(localStorage.getItem(DRAFT) || 'null'); } catch (e) { pending = null; }
  if (pending?.symbole && JSON.stringify(pending) !== JSON.stringify(data)) {
    data = pending;
    if (!data.symbole[cur]) cur = Object.keys(data.symbole)[0];
    render();
    save();
  } else {
    try { localStorage.removeItem(DRAFT); } catch (e) { /* ohne Speicher nur kein Entwurf */ }
    render();
  }
  window.oneIconDesigner = { save, get data() { return data; } };
})();
