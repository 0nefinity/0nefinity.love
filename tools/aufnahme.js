// Aufnahme: ein Knopf, der die Canvas der Seite plus Mikrofon aufnimmt und eine Debug-Spur mitschreibt.
// Erscheint nur eingeloggt und nur, wenn ein Agent die Seite freigeschaltet hat (/api/aufnahme/frei);
// sonst tut diese Datei nach einer Anfrage nichts mehr. Nach Stopp geht alles im Hintergrund hoch.
// Mit ?diag in der URL schickt die Seite ausserdem window.__diag alle 2 s an dieselbe Stelle.
// Schalter: 0 ist aus, 1 ist an (wie auf jedem Netzschalter, dessen Symbol aus genau diesen beiden besteht).
(() => {
  'use strict';
  if (window.__aufnahme) return;
  window.__aufnahme = true;

  const API = '/api/aufnahme';
  const HDR = { 'X-0ne-Aufnahme': '1' };
  const MAX_EREIGNISSE = 60000;
  let frei = null;

  const post = (route, body, type) => fetch(`${API}/${route}`, {
    method: 'POST', credentials: 'same-origin', body,
    headers: { ...HDR, 'Content-Type': type },
  }).then((r) => { if (!r.ok) throw new Error(`${route} HTTP ${r.status}`); return r; });

  // ------------------------------------------------------------ Spur

  let spur = null;
  let t0 = 0;
  const jetzt = () => Math.round(performance.now() - t0);
  const merke = (...e) => { if (spur && spur.ereignisse.length < MAX_EREIGNISSE) spur.ereignisse.push([jetzt(), ...e]); };
  const r1 = (x) => Math.round(x * 10) / 10;

  const viewport = () => {
    const vv = window.visualViewport;
    merke('v', innerWidth, innerHeight, vv ? r1(vv.width) : null, vv ? r1(vv.height) : null,
      vv ? r1(vv.scale) : null, vv ? r1(vv.offsetLeft) : null, vv ? r1(vv.offsetTop) : null, devicePixelRatio);
  };
  const zeiger = (e) => merke('p', e.type.slice(7), e.pointerId, r1(e.clientX), r1(e.clientY), e.pointerType);
  const beruehrung = (e) => {
    const t = [...e.touches].map((x) => `${x.identifier}:${r1(x.clientX)},${r1(x.clientY)}`).join(' ');
    merke('t', e.type.slice(5), t);
  };
  const rad = (e) => merke('w', r1(e.deltaX), r1(e.deltaY), r1(e.clientX), r1(e.clientY));
  const taste = (e) => merke('k', e.key);
  const eingabe = (e) => {
    const el = e.target;
    if (!el || !('value' in el) || el.type === 'password') return;
    merke('i', el.id || el.name || el.getAttribute('aria-label') || el.tagName, el.type === 'checkbox' ? el.checked : el.value);
  };
  const sichtbar = () => merke('s', document.visibilityState);
  const fehler = (e) => merke('e', `${e.message || e.type} @ ${e.filename || ''}:${e.lineno || ''}`);
  const ablehnung = (e) => merke('e', `unhandledrejection ${e.reason && (e.reason.stack || e.reason.message) || e.reason}`);

  let letzteUrl = '';
  let letzterDiag = '';
  let frameT = 0;
  let sek = null;
  let rafId = 0;
  const tick = (t) => {
    if (!spur) return;
    if (location.href !== letzteUrl) { letzteUrl = location.href; merke('u', location.pathname + location.search + location.hash); }
    if (frameT) {
      const dt = t - frameT;
      const s = Math.floor((t - t0) / 1000);
      if (!sek || sek[0] !== s) {
        if (sek) spur.frames.push([sek[0], sek[1], r1(sek[2] / Math.max(1, sek[1])), r1(sek[3]), sek[4]]);
        sek = [s, 0, 0, 0, 0];
      }
      sek[1]++; sek[2] += dt; sek[3] = Math.max(sek[3], dt); if (dt > 50) sek[4]++;
    }
    frameT = t;
    rafId = requestAnimationFrame(tick);
  };
  let diagUhr = 0;
  const diagLesen = () => {
    const d = window.__diag;
    if (d == null) return null;
    try { return typeof d === 'function' ? d() : d; } catch (e) { return { fehler: String(e) }; }
  };
  const diagMerken = () => {
    let d = diagLesen();
    if (d == null) return;
    // in die Spur nur der Text, wenn es einen gibt: die Rohdaten gehen per ?diag laufend mit
    if (typeof d === 'object' && typeof d.text === 'string') d = { text: d.text };
    let s;
    try { s = JSON.stringify(d); } catch (e) { s = JSON.stringify({ fehler: String(e) }); }
    if (s !== letzterDiag) { letzterDiag = s; merke('d', JSON.parse(s)); }
  };

  const ORIG_ERROR = console.error;
  const LAUSCHER = [
    [window, 'pointerdown', zeiger], [window, 'pointermove', zeiger], [window, 'pointerup', zeiger],
    [window, 'pointercancel', zeiger], [window, 'touchstart', beruehrung], [window, 'touchend', beruehrung],
    [window, 'touchcancel', beruehrung], [window, 'wheel', rad], [window, 'keydown', taste],
    [document, 'input', eingabe], [document, 'change', eingabe], [document, 'visibilitychange', sichtbar],
    [window, 'resize', viewport], [window, 'error', fehler], [window, 'unhandledrejection', ablehnung],
  ];
  const opts = { capture: true, passive: true };

  function spurStarten(canvas) {
    t0 = performance.now();
    spur = {
      v: 1, href0: location.href, ua: navigator.userAgent, start: Date.now(), ereignisse: [], frames: [],
      bildschirm: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio, sw: screen.width, sh: screen.height,
        orient: screen.orientation ? screen.orientation.type : null },
      canvas: canvas ? { id: canvas.id || null, w: canvas.width, h: canvas.height,
        cssW: r1(canvas.getBoundingClientRect().width), cssH: r1(canvas.getBoundingClientRect().height) } : null,
    };
    letzteUrl = ''; letzterDiag = ''; frameT = 0; sek = null;
    for (const [ziel, typ, fn] of LAUSCHER) ziel.addEventListener(typ, fn, opts);
    if (window.visualViewport) {
      visualViewport.addEventListener('resize', viewport);
      visualViewport.addEventListener('scroll', viewport);
    }
    console.error = (...a) => { merke('e', a.map((x) => (x && x.stack) || String(x)).join(' ')); ORIG_ERROR.apply(console, a); };
    viewport();
    rafId = requestAnimationFrame(tick);
    diagUhr = setInterval(diagMerken, 250);
  }

  function spurStoppen() {
    for (const [ziel, typ, fn] of LAUSCHER) ziel.removeEventListener(typ, fn, opts);
    if (window.visualViewport) {
      visualViewport.removeEventListener('resize', viewport);
      visualViewport.removeEventListener('scroll', viewport);
    }
    console.error = ORIG_ERROR;
    cancelAnimationFrame(rafId);
    clearInterval(diagUhr);
    if (sek) spur.frames.push([sek[0], sek[1], r1(sek[2] / Math.max(1, sek[1])), r1(sek[3]), sek[4]]);
    spur.dauer = jetzt();
    const s = spur;
    spur = null;
    return s;
  }

  // ------------------------------------------------------------ DOM-Spur
  // Damit das Video die ganze Seite zeigt (Panel, Menue, Regler) und nicht nur die Canvas: ein Abbild des DOM
  // beim Start plus jede Aenderung, zehnmal je Sekunde gesammelt. Der Dienst spielt das in einem Browser mit
  // gleicher Groesse wieder ab, legt das Canvas-Video an seine Stelle und rendert daraus ein Video.
  // Knoten-Nummern: 0 bleibt dem Fenster selbst (Scrollen), die Seite zaehlt ab 1.

  const nr = new WeakMap();
  let naechste = 1;
  let dom = null;
  let beobachter = null;
  let domUhr = 0;
  let aufnahmeCanvas = null;
  const werte = new WeakMap();
  const gescrollt = new Set();
  const MAX_DOM = 200000;
  const OHNE = new Set(['SCRIPT', 'NOSCRIPT', 'TEMPLATE']);
  const NS = { 'http://www.w3.org/2000/svg': 's', 'http://www.w3.org/1998/Math/MathML': 'm' };

  const nummer = (n) => { let i = nr.get(n); if (!i) { i = naechste++; nr.set(n, i); } return i; };
  const wert = (el) => ((el.type === 'checkbox' || el.type === 'radio') ? el.checked : el.value);

  // [nr, 3, text] | [nr, 1, tag, attribute, kinder, ns, art]; art 'C' = die aufgenommene Canvas, 'c' = andere
  function abbild(n) {
    if (n.nodeType === 3) return [nummer(n), 3, n.data.slice(0, 100000)];
    if (n.nodeType !== 1 || OHNE.has(n.tagName)) return null;
    const a = {};
    for (const at of n.attributes) a[at.name] = at.value;
    if (('value' in n) && /^(INPUT|TEXTAREA|SELECT)$/.test(n.tagName) && n.type !== 'password') {
      a['\u0000wert'] = wert(n);
      werte.set(n, wert(n));
    }
    const kinder = [];
    for (const k of n.childNodes) { const s = abbild(k); if (s) kinder.push(s); }
    const art = n.tagName === 'CANVAS' ? (n === aufnahmeCanvas ? 'C' : 'c') : '';
    return [nummer(n), 1, n.localName, a, kinder, NS[n.namespaceURI] || '', art];
  }

  const domMerke = (...e) => { if (dom.ev.length < MAX_DOM) dom.ev.push([jetzt(), ...e]); else dom.voll = true; };
  const naechsteBekannte = (n) => { for (let s = n.nextSibling; s; s = s.nextSibling) if (nr.has(s)) return nr.get(s); return null; };

  function domSammeln() {
    if (!dom) return;
    const recs = beobachter.takeRecords();
    const attr = new Map();
    const text = new Map();
    for (const r of recs) {
      if (r.type === 'childList') {
        for (const n of r.removedNodes) if (nr.has(n) && !n.isConnected) domMerke('r', nr.get(n));
        for (const n of r.addedNodes) {
          if (!n.isConnected || n.parentNode !== r.target || !nr.has(r.target)) continue;
          const s = abbild(n);
          if (s) domMerke('a', nr.get(r.target), naechsteBekannte(n), s);
        }
      } else if (r.type === 'attributes' && nr.has(r.target)) {
        attr.set(`${nr.get(r.target)}\u0000${r.attributeName}`, r);
      } else if (r.type === 'characterData' && nr.has(r.target)) {
        text.set(nr.get(r.target), r.target);
      }
    }
    for (const r of attr.values()) domMerke('t', nr.get(r.target), r.attributeName, r.target.getAttribute(r.attributeName));
    for (const [i, n] of text) domMerke('x', i, n.data.slice(0, 100000));
    for (const el of document.querySelectorAll('input,textarea,select')) {
      if (!nr.has(el) || el.type === 'password') continue;
      const v = wert(el);
      if (werte.get(el) !== v) { werte.set(el, v); domMerke('v', nr.get(el), v); }
    }
    for (const el of gescrollt) {
      if (el === document || el === window) domMerke('s', 0, Math.round(scrollX), Math.round(scrollY));
      else if (nr.has(el)) domMerke('s', nr.get(el), Math.round(el.scrollLeft), Math.round(el.scrollTop));
    }
    gescrollt.clear();
  }
  const scroll = (e) => gescrollt.add(e.target);

  function domStarten(canvas) {
    aufnahmeCanvas = canvas;
    dom = { start: abbild(document.documentElement), ev: [], fps: 10 };
    beobachter = new MutationObserver(() => {});
    beobachter.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
    document.addEventListener('scroll', scroll, { capture: true, passive: true });
    domMerke('s', 0, Math.round(scrollX), Math.round(scrollY));
    domUhr = setInterval(domSammeln, 100);
  }

  function domStoppen() {
    domSammeln();
    clearInterval(domUhr);
    beobachter.disconnect();
    document.removeEventListener('scroll', scroll, { capture: true });
    const d = dom;
    dom = null;
    return d;
  }

  // ------------------------------------------------------------ Aufnahme

  const groessteCanvas = () => {
    let best = null; let flaeche = 0;
    for (const c of document.querySelectorAll('canvas')) {
      const r = c.getBoundingClientRect();
      const a = r.width * r.height;
      if (!c.hidden && a > flaeche && c.captureStream) { best = c; flaeche = a; }
    }
    return best;
  };
  const format = (bild) => (bild
    ? ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
    : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']).find((m) => MediaRecorder.isTypeSupported(m)) || '';

  let rec = null; let teile = []; let mic = null; let micStatus = '-'; let canvas = null;
  let tab = null; let anzeige = '-';

  // Wo der Browser den eigenen Tab aufnehmen kann (getDisplayMedia, preferCurrentTab), ist das ganze Bild schon
  // im Video; erkannt wird das, nicht angenommen. Muss als Erstes laufen, solange der Klick noch frisch ist.
  async function tabHolen() {
    const md = navigator.mediaDevices;
    if (!md || typeof md.getDisplayMedia !== 'function') { anzeige = 'fehlt'; return null; }
    try {
      const s = await md.getDisplayMedia({
        video: { displaySurface: 'browser', frameRate: 30 }, audio: false,
        preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude',
      });
      const v = s.getVideoTracks()[0];
      anzeige = `ok ${(v && v.getSettings().displaySurface) || '?'}`;
      return s;
    } catch (e) { anzeige = e.name || String(e); return null; }
  }

  async function start() {
    tab = await tabHolen();
    canvas = groessteCanvas();
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      micStatus = 'ok';
    } catch (e) { mic = null; micStatus = `${e.name}`; }
    const spuren = [];
    if (tab) spuren.push(...tab.getVideoTracks());
    else if (canvas) spuren.push(...canvas.captureStream(30).getVideoTracks());
    if (mic) spuren.push(...mic.getAudioTracks());
    if (!spuren.length) throw new Error('weder Bild noch Mikrofon');
    const mime = format(!!(tab || canvas));
    rec = new MediaRecorder(new MediaStream(spuren), { mimeType: mime || undefined, videoBitsPerSecond: 2500000 });
    teile = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) teile.push(e.data); };
    spurStarten(canvas);
    if (!tab) domStarten(canvas);
    spur.quelle = tab ? 'tab' : canvas ? 'canvas' : 'ton';
    spur.anzeige = anzeige;
    spur.mic = micStatus;
    spur.mime = rec.mimeType || mime;
    rec.start(1000);
  }

  function stopp() {
    return new Promise((fertig) => {
      const r = rec;
      r.onstop = () => {
        for (const t of r.stream.getTracks()) t.stop();
        if (mic) for (const t of mic.getTracks()) t.stop();
        if (tab) for (const t of tab.getTracks()) t.stop();
        const d = dom ? domStoppen() : null;
        const s = spurStoppen();
        s.mic = micStatus; s.mime = r.mimeType; s.quelle = tab ? 'tab' : canvas ? 'canvas' : 'ton'; s.anzeige = anzeige;
        if (d) s.dom = d;
        const typ = (r.mimeType || ((tab || canvas) ? 'video/webm' : 'audio/webm')).split(';')[0];
        fertig({ blob: new Blob(teile, { type: typ }), spur: s, typ });
      };
      r.stop();
    });
  }

  const hex = () => [...crypto.getRandomValues(new Uint8Array(6))].map((b) => b.toString(16).padStart(2, '0')).join('');

  async function hochladen(a) {
    const q = `frei=${frei.id}&aufnahme=${a.aid}`;
    if (!a.spurDa) { await post(`spur?${q}`, JSON.stringify(a.spur), 'application/json'); a.spurDa = true; }
    await post(`medien?${q}`, a.blob, a.typ);
  }

  // ------------------------------------------------------------ Knopf

  let knopf = null;
  let zustand = 'aus'; // aus | an | hoch | fehler
  let offen = null; // Aufnahme, die noch hoch muss

  function zeige(z) {
    zustand = z;
    knopf.dataset.z = z;
    knopf.textContent = z === 'an' ? '1' : '0';
  }

  async function klick() {
    if (zustand === 'aus') {
      zeige('an');
      try { await start(); } catch (e) { zeige('fehler'); ORIG_ERROR.call(console, 'aufnahme:', e); return; }
      return;
    }
    if (zustand === 'an') {
      const ergebnis = await stopp();
      offen = { ...ergebnis, aid: hex() };
      return senden();
    }
    if (zustand === 'fehler' && offen) return senden();
    if (zustand === 'fehler') zeige('aus');
  }

  async function senden() {
    zeige('hoch');
    try {
      await hochladen(offen);
      offen = null;
      zeige('aus');
    } catch (e) {
      ORIG_ERROR.call(console, 'aufnahme:', e);
      zeige('fehler');
    }
  }

  function knopfBauen() {
    const st = document.createElement('style');
    st.textContent = `
#aufnahme-knopf{position:fixed;left:0;bottom:calc(var(--visible-viewport-bottom,0px) + var(--controls-mobile-occlusion,0px));
  width:4.375rem;height:4.375rem;display:flex;align-items:center;justify-content:center;z-index:1002;
  background:transparent;color:var(--text-color,#fff);border:0;padding:0;font:inherit;font-size:2.25rem;line-height:1;
  cursor:pointer;opacity:.55;-webkit-tap-highlight-color:transparent;touch-action:manipulation;user-select:none;-webkit-user-select:none}
#aufnahme-knopf:hover,#aufnahme-knopf:focus-visible{opacity:1}
#aufnahme-knopf[data-z=an]{opacity:1}
#aufnahme-knopf[data-z=an]::before{content:"";position:absolute;inset:.9rem;border-radius:50%;background:var(--text-color,#fff);z-index:-1}
#aufnahme-knopf[data-z=an]{color:var(--bg-color,#000)}
#aufnahme-knopf[data-z=hoch]{animation:aufnahme-atmen 1.6s ease-in-out infinite}
#aufnahme-knopf[data-z=fehler]{opacity:1;animation:aufnahme-pochen .9s ease-in-out infinite}
@keyframes aufnahme-atmen{50%{opacity:.15}}
@keyframes aufnahme-pochen{0%,100%{transform:scale(1)}50%{transform:scale(1.35)}}
@media (prefers-reduced-motion:reduce){#aufnahme-knopf[data-z=hoch]{animation:none;opacity:.25}
  #aufnahme-knopf[data-z=fehler]{animation:none;outline:1px solid var(--text-color,#fff);outline-offset:-.8rem}}`;
    document.head.appendChild(st);
    knopf = document.createElement('button');
    knopf.id = 'aufnahme-knopf';
    knopf.type = 'button';
    knopf.setAttribute('aria-label', '0 1');
    knopf.addEventListener('click', (e) => { e.stopPropagation(); klick(); });
    document.body.appendChild(knopf);
    zeige('aus');
    // ein Schliessen mitten im Hochladen verliert die Aufnahme: der Browser fragt dann nach
    window.addEventListener('beforeunload', (e) => { if (zustand === 'an' || offen) { e.preventDefault(); e.returnValue = ''; } });
  }

  // ------------------------------------------------------------ ?diag: Werte laufend schicken

  function diagSchicken() {
    if (!new URLSearchParams(location.search).has('diag')) return;
    let aus = 0;
    setInterval(() => {
      if (document.visibilityState !== 'visible' || aus > 5) return;
      const d = diagLesen();
      if (d == null) return;
      post(`diag?frei=${frei.id}`, JSON.stringify({ t: Date.now(), href: location.href, diag: d }), 'application/json')
        .then(() => { aus = 0; })
        .catch((e) => { aus++; ORIG_ERROR.call(console, 'aufnahme diag:', e); if (knopf && zustand === 'aus') zeige('fehler'); });
    }, 2000);
  }

  async function los() {
    const r = await fetch(`${API}/frei?seite=${encodeURIComponent(location.pathname)}`,
      { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (r.status !== 200) return;
    frei = await r.json();
    if (window.MediaRecorder) knopfBauen();
    diagSchicken();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', los);
  else los();
})();
