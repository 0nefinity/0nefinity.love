// Formatierungszeichen (wie Word, Symbol ¶) im Login-Editor: Leerzeichen als ·, Tab als →, Zeilenumbruch als ↵,
// Absatzende als ¶. Rein optisch: die Zeichen liegen in einer eigenen Ebene ausserhalb des bearbeiteten Inhalts
// (pointer-events:none, data-oe-ui) und werden nie in den Text geschrieben, also auch nie gespeichert.
//
//   const marks = window.OneEditorMarks.mount({
//     bar: element,                       // Leiste, in die der Knopf kommt
//     root: () => element,                // Bereich, dessen Text markiert wird (Standard: document.body)
//     btnClass: 'oe-btn oe-mini',
//   });
//   marks.set(true|false); marks.on  // Zustand bleibt in localStorage 'oe-marks'
(function () {
  const PILCROW = 'M13 4v16M17 4v16M13 4H9.5a4.5 4.5 0 0 0 0 9H13';
  const NS = 'http://www.w3.org/2000/svg';
  const KEY = 'oe-marks';
  const BLOCKS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'DIV', 'BLOCKQUOTE', 'PRE', 'TD', 'TH', 'FIGCAPTION', 'SUMMARY']);
  const MAX_MARKS = 4000;

  function css() {
    if (document.getElementById('oem-style')) return;
    const s = document.createElement('style');
    s.id = 'oem-style';
    s.textContent = `
.oem-layer{position:fixed;inset:0;z-index:2147482000;pointer-events:none;overflow:hidden}
.oem-layer span{position:absolute;color:var(--text-color,#fff);opacity:.45;font:12px/1 system-ui,sans-serif;
  -webkit-user-select:none;user-select:none;transform:translate(-50%,0)}
.oem-layer span.oem-end{transform:none;opacity:.6}
[data-oe-ui].oem-on{background:color-mix(in srgb,var(--text-color,#fff) 18%,transparent)}`;
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
    p.setAttribute('d', PILCROW);
    el.appendChild(p);
    return el;
  }

  function mount(opts) {
    css();
    const getRoot = opts.root || (() => document.body);
    let on = false;
    try { on = localStorage.getItem(KEY) === '1'; } catch (e) { /* privater Modus: Zustand nur fuer diese Sitzung */ }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = opts.btnClass || 'oe-btn oe-mini';
    btn.title = 'Formatierungszeichen ein/aus';
    btn.setAttribute('aria-label', 'Formatierungszeichen anzeigen');
    btn.setAttribute('aria-pressed', 'false');
    btn.dataset.oeUi = '';
    btn.appendChild(svg());
    opts.bar.appendChild(btn);

    const layer = document.createElement('div');
    layer.className = 'oem-layer';
    layer.dataset.oeUi = '';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);

    let raf = 0;
    function schedule() {
      if (!on || raf) return;
      raf = requestAnimationFrame(() => { raf = 0; draw(); });
    }

    function put(ch, rect, cls, atRight) {
      const sp = document.createElement('span');
      sp.textContent = ch;
      if (cls) sp.className = cls;
      sp.style.left = (atRight ? rect.right + 1 : rect.left + rect.width / 2) + 'px';
      sp.style.top = rect.top + (rect.height - 12) / 2 + 'px';
      return sp;
    }

    function visible(r) {
      return r.bottom >= 0 && r.top <= window.innerHeight && r.right >= 0 && r.left <= window.innerWidth;
    }

    function draw() {
      layer.textContent = '';
      if (!on) return;
      const root = getRoot();
      if (!root) return;
      const frag = document.createDocumentFragment();
      let n = 0;
      const range = document.createRange();
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(t) {
          const p = t.parentElement;
          if (!p || p.closest('[data-oe-ui],script,style,noscript,svg')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      const lastText = new Map(); // Block -> letztes sichtbares Textstueck (fuer ¶)
      let t;
      while ((t = walker.nextNode()) && n < MAX_MARKS) {
        const s = t.data;
        if (!s.trim() && !/[ \t]/.test(s)) continue;
        const pre = /^(pre|pre-wrap|pre-line|break-spaces)$/.test(getComputedStyle(t.parentElement).whiteSpace);
        for (let i = 0; i < s.length && n < MAX_MARKS; i++) {
          const c = s[i];
          if (c !== ' ' && c !== ' ' && c !== '\t' && !(pre && c === '\n')) continue;
          range.setStart(t, i);
          range.setEnd(t, i + 1);
          const r = range.getBoundingClientRect();
          if (!visible(r) || (r.width < 1 && c !== '\n')) continue;
          frag.appendChild(put(c === '\t' ? '→' : c === '\n' ? '↵' : '·', r, '', c === '\n'));
          n++;
        }
        const el = t.parentElement.closest('p,h1,h2,h3,h4,h5,h6,li,div,blockquote,pre,td,th,figcaption,summary');
        if (el && BLOCKS.has(el.tagName)) lastText.set(el, t);
      }
      root.querySelectorAll('br').forEach((br) => {
        if (n >= MAX_MARKS || br.closest('[data-oe-ui]')) return;
        const r = br.getBoundingClientRect();
        if (visible(r)) { frag.appendChild(put('↵', r, 'oem-end', true)); n++; }
      });
      lastText.forEach((tn, el) => {
        if (n >= MAX_MARKS) return;
        // nur Bloecke, deren letzter Inhalt dieser Text ist (kein ¶ mitten in verschachtelten Containern)
        const last = el.lastChild;
        if (last !== tn && !(last && last.contains && last.contains(tn))) {
          const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          let tl = null, x;
          while ((x = walk.nextNode())) if (x.data.trim()) tl = x;
          if (tl !== tn) return;
        }
        range.selectNodeContents(tn);
        const rects = range.getClientRects();
        const r = rects[rects.length - 1];
        if (r && visible(r)) { frag.appendChild(put('¶', r, 'oem-end', true)); n++; }
      });
      layer.appendChild(frag);
    }

    function set(v) {
      on = !!v;
      btn.classList.toggle('oem-on', on);
      btn.setAttribute('aria-pressed', String(on));
      try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* siehe oben */ }
      layer.textContent = '';
      if (on) draw();
    }

    btn.addEventListener('click', () => set(!on));
    window.addEventListener('scroll', schedule, { passive: true, capture: true });
    window.addEventListener('resize', schedule);
    const mo = new MutationObserver((muts) => {
      if (muts.some((m) => !layer.contains(m.target))) schedule();
    });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    document.addEventListener('input', schedule, true);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
    set(on);

    return { btn, layer, set, get on() { return on; }, redraw: draw, destroy() { mo.disconnect(); btn.remove(); layer.remove(); } };
  }

  window.OneEditorMarks = { mount };
})();
