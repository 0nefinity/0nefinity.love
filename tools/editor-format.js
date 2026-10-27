// Formatierung im Login-Editor (wie Word): fett, kursiv, unterstrichen, Schriftgroesse, Formatierung entfernen,
// Absatzformat Normal/H1/H2/H3. Ergebnis ist sauberes HTML: strong, em, u, <span style="font-size:1.25em">.
// Das Modul traegt Knoepfe, Tastenkuerzel und die Inline-Befehle; was an die Textstellen des Editors gebunden
// ist (Rueckgaengig, Speichern, Tausch des Absatz-Elements) kommt ueber opts herein.
//
//   const fmt = window.OneEditorFormat.mount({
//     host: () => element|null,        // Textstelle der Auswahl oder Schreibmarke
//     before: (host) => {},            // vor jeder Aenderung (Textstelle vormerken, Rueckgaengig-Schritt oeffnen)
//     after: () => {},                 // nach jeder Aenderung (Autosave anstossen)
//     blockOf: (host) => 'p'|'h1'|..|null,   // null = Element laesst sich nicht umformatieren
//     setBlock: (tag) => boolean,      // 'p'|'h1'|'h2'|'h3'
//     md: () => boolean,               // Markdown-Seite: nur anbieten, was Markdown kann
//     bar: () => element|null,         // Editor-Leiste, unter der die Ablage aufgeht
//     fail: (message) => {},           // sichtbare Fehlermeldung
//   });
//   fmt.parts()   -> { inline: [B, I, U, A-, A+], clear: Knopf, block: [P, H1, H2, H3] } (frische Knoepfe, werden mitgefuehrt)
//   fmt.panel     -> Ablage mit allen Knoepfen; fmt.togglePanel(force); fmt.setEditing(bool)
//   fmt.key(e)    -> Funktion oder null (Strg+B/I/U, Strg+Alt+0-3, Strg+Umschalt+./,)
//   fmt.sync()    -> Knopfzustaende; fmt.tidy(host) -> vom Browser gesetzte b/i in strong/em; fmt.keep(host, fn)
(function () {
  const STEPS = [0.75, 0.875, 1, 1.25, 1.5, 2, 3];
  const NS = 'http://www.w3.org/2000/svg';
  const PATHS = {
    bold: 'M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7.5a3.5 3.5 0 0 1 0 7H7z',
    italic: 'M10 5h7M7 19h7M14 5l-4 14',
    underline: 'M7 4v7a5 5 0 0 0 10 0V4M5 20h14',
    bigger: 'M3 19L8 6l5 13M5 15h6M17 7v6M14 10h6',
    smaller: 'M3 19L8 6l5 13M5 15h6M14 10h6',
    clear: 'M6 5h12M12 5v14M5 19L19 5',
    fmt: 'M3 19L8 6l5 13M5 15h6M15 19l3-7 3 7M16.5 17h3',
  };
  const BLOCKS = [['p', 'P', 'Normal', 0], ['h1', 'H1', 'Überschrift 1', 1], ['h2', 'H2', 'Überschrift 2', 2], ['h3', 'H3', 'Überschrift 3', 3]];
  const KEY = 'oe-fmt';

  function css() {
    if (document.getElementById('oef-style')) return;
    const s = document.createElement('style');
    s.id = 'oef-style';
    s.textContent = `
.oef-panel{position:fixed;z-index:2147483002;display:flex;flex-wrap:wrap;gap:2px;padding:2px;border-radius:6px;box-sizing:border-box;
  width:max-content;max-width:calc(100vw - 16px);
  border:1px solid color-mix(in srgb,var(--text-color,#fff) 30%,transparent);background:var(--bg-color,#000);color:var(--text-color,#fff);
  font:15px/1 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.oef-panel[hidden],body.menu-open .oef-panel{display:none}
.oef-t{font-weight:600!important;font-size:13px!important;letter-spacing:0}
.oef-ic{display:block;width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}`;
    document.head.appendChild(s);
  }

  function svg(kind) {
    const el = document.createElementNS(NS, 'svg');
    el.setAttribute('viewBox', '0 0 24 24');
    el.setAttribute('class', 'oef-ic');
    el.setAttribute('aria-hidden', 'true');
    el.setAttribute('focusable', 'false');
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', PATHS[kind]);
    el.appendChild(p);
    return el;
  }

  // Auswahl als Zeichenabstand in der Textstelle merken und danach wieder setzen: beim Austausch von
  // Elementen verlieren Auswahlbereiche ihre Textknoten.
  function offsetIn(host, node, off) {
    const r = document.createRange();
    r.setStart(host, 0);
    r.setEnd(node, off);
    return r.toString().length;
  }

  function pointAt(host, n) {
    const w = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    let t;
    let last = null;
    while ((t = w.nextNode())) {
      last = t;
      if (n <= t.data.length) return [t, n];
      n -= t.data.length;
    }
    return last ? [last, last.data.length] : [host, 0];
  }

  function keep(host, fn) {
    const sel = getSelection();
    const inside = sel.rangeCount && host.contains(sel.anchorNode) && host.contains(sel.focusNode);
    const a = inside ? offsetIn(host, sel.anchorNode, sel.anchorOffset) : 0;
    const f = inside ? offsetIn(host, sel.focusNode, sel.focusOffset) : 0;
    const next = fn() || host;
    if (inside) {
      const [an, ao] = pointAt(next, a);
      const [fn2, fo] = pointAt(next, f);
      sel.setBaseAndExtent(an, ao, fn2, fo);
    }
    return next;
  }

  const sizeSpan = (el) => el && el.nodeType === 1 && el.tagName === 'SPAN' && el.style.length === 1 && /em$/.test(el.style.fontSize);

  // Schriftgroesse einer Stelle relativ zur Textstelle: Produkt der em-Werte der umgebenden Groessen-Spans.
  function effective(node, host) {
    let k = 1;
    for (let el = node && (node.nodeType === 1 ? node : node.parentElement); el && el !== host; el = el.parentElement) {
      if (sizeSpan(el)) k *= parseFloat(el.style.fontSize);
    }
    return k;
  }

  const round = (x) => Math.round(x * 1000) / 1000;
  const stepIndex = (v) => STEPS.findIndex((s) => Math.abs(s - v) < 0.002);

  function mount(opts) {
    css();
    const ctl = [];
    let panel = null;
    let editing = false;
    let open = false;
    try { open = localStorage.getItem(KEY) === '1'; } catch (e) { /* privater Modus: nur fuer diese Sitzung */ }
    // b/i, die schon im Quelltext stehen, bleiben wie sie sind; nur was der Browser neu setzt wird strong/em.
    const known = new WeakMap();

    const md = () => !!(opts.md && opts.md());

    function guard(fn) {
      return () => {
        try { fn(); } catch (e) { opts.fail('Formatierung: ' + e.message); }
        sync();
      };
    }

    function btn(key, label, title, fn, content) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'oe-btn oe-mini';
      b.dataset.oeUi = '';
      b.dataset.fmt = key;
      b.dataset.title = title;
      if (content instanceof Node) b.appendChild(content);
      else { b.textContent = label; b.classList.add('oef-t'); }
      b.setAttribute('aria-label', title);
      b.title = title;
      b.addEventListener('pointerdown', (e) => e.preventDefault());
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', guard(fn));
      ctl.push(b);
      return b;
    }

    function replaceElement(el, name, host) {
      keep(host, () => {
        const n = document.createElement(name);
        for (const a of el.attributes) n.setAttribute(a.name, a.value);
        n.append(...el.childNodes);
        el.replaceWith(n);
        return host;
      });
    }

    function tidy(host) {
      const seen = known.get(host);
      if (!seen) return;
      for (const el of [...host.querySelectorAll('b, i')]) {
        if (!seen.has(el)) replaceElement(el, el.tagName === 'B' ? 'strong' : 'em', host);
      }
    }

    function dropEmpty(host) {
      for (const el of [...host.querySelectorAll('b, i, strong, em, u, span')]) {
        if (el.closest('[data-oe-ui]') || el.firstChild) continue;
        if (!el.attributes.length || sizeSpan(el)) el.remove();
      }
    }

    function current() {
      const host = opts.host();
      if (!host) return null;
      if (!known.has(host)) known.set(host, new Set(host.querySelectorAll('b, i')));
      return host;
    }

    // In Ueberschriften ist alles schon fett: execCommand('bold') wuerde dort ein font-weight-Span setzen.
    // Stattdessen strong setzen bzw. loesen, ohne Span.
    function boldBlock(host) {
      return parseInt(getComputedStyle(host).fontWeight, 10) >= 600;
    }

    function toggleStrong(host) {
      const sel = getSelection();
      if (!sel.rangeCount) throw new Error('keine Auswahl');
      const r = sel.getRangeAt(0);
      if (r.collapsed || !host.contains(r.commonAncestorContainer)) throw new Error('fett nicht ausführbar');
      let el = r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer : r.commonAncestorContainer.parentElement;
      while (el && el !== host && el.tagName !== 'STRONG' && el.tagName !== 'B') el = el.parentElement;
      if (el && el !== host) {
        const kids = [...el.childNodes];
        el.replaceWith(...kids);
        host.normalize();
        return;
      }
      const strong = document.createElement('strong');
      strong.appendChild(r.extractContents());
      r.insertNode(strong);
      sel.removeAllRanges();
      const nr = document.createRange();
      nr.selectNodeContents(strong);
      sel.addRange(nr);
    }

    function run(cmd) {
      const host = current();
      if (!host) return;
      opts.before(host);
      if (cmd === 'bold' && boldBlock(host)) toggleStrong(host);
      else {
        document.execCommand('styleWithCSS', false, false);
        if (!document.execCommand(cmd)) throw new Error(cmd + ' nicht ausführbar');
      }
      tidy(host);
      dropEmpty(host);
      opts.after();
    }

    function clear() {
      const host = current();
      if (!host) return;
      opts.before(host);
      document.execCommand('removeFormat');
      document.execCommand('unlink');
      tidy(host);
      dropEmpty(host);
      opts.after();
    }

    // Groesse: Stufen in em, als <span style="font-size:..em"> um genau die Auswahl. Deckt die Auswahl einen
    // vorhandenen Groessen-Span ganz ab, wird dieser umgestellt; Stufe 1 loest ihn auf.
    function size(dir) {
      if (md()) return;
      const host = current();
      const sel = getSelection();
      if (!host || sel.isCollapsed) return;
      const r = sel.getRangeAt(0);
      const here = effective(r.startContainer, host);
      let i = stepIndex(here);
      if (i < 0) i = STEPS.findIndex((s) => s > here) - (dir > 0 ? 0 : 1);
      else i += dir;
      if (dir > 0 && stepIndex(here) < 0 && i < 0) i = STEPS.length;
      const target = STEPS[i];
      if (target === undefined) return;
      opts.before(host);
      let span = null;
      for (let el = r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer : r.commonAncestorContainer.parentElement;
        el && el !== host; el = el.parentElement) {
        if (sizeSpan(el) && r.toString() === el.textContent) { span = el; break; }
      }
      if (!span) {
        const frag = r.extractContents();
        for (const s of [...frag.querySelectorAll('span')]) if (sizeSpan(s)) s.replaceWith(...s.childNodes);
        span = document.createElement('span');
        span.append(frag);
        r.insertNode(span);
      }
      const rel = round(target / effective(span.parentNode, host));
      if (Math.abs(rel - 1) < 0.002) {
        const first = span.firstChild;
        const last = span.lastChild;
        span.replaceWith(...span.childNodes);
        if (first && last) sel.setBaseAndExtent(first.parentNode, [...first.parentNode.childNodes].indexOf(first),
          last.parentNode, [...last.parentNode.childNodes].indexOf(last) + 1);
      } else {
        span.style.fontSize = rel + 'em';
        const rr = document.createRange();
        rr.selectNodeContents(span);
        sel.removeAllRanges();
        sel.addRange(rr);
      }
      dropEmpty(host);
      opts.after();
    }

    function block(tag) {
      const host = opts.host();
      if (!host) return;
      if (!opts.blockOf(host)) { opts.fail('Dieses Element lässt sich nicht in eine Überschrift oder einen Absatz umformatieren'); return; }
      if (!opts.setBlock(tag)) opts.fail('Absatzformat nicht gesetzt');
    }

    function parts() {
      const inline = [
        btn('bold', '', 'fett (Strg+B)', () => run('bold'), svg('bold')),
        btn('italic', '', 'kursiv (Strg+I)', () => run('italic'), svg('italic')),
        btn('underline', '', 'unterstrichen (Strg+U)', () => run('underline'), svg('underline')),
        btn('smaller', '', 'Schrift kleiner (Strg+Umschalt+,)', () => size(-1), svg('smaller')),
        btn('bigger', '', 'Schrift größer (Strg+Umschalt+.)', () => size(1), svg('bigger')),
      ];
      const clearBtn = btn('clear', '', 'Formatierung entfernen', clear, svg('clear'));
      const blocks = BLOCKS.map(([tag, label, name, n]) => btn(tag, label, name + ' (Strg+Alt+' + n + ')', () => block(tag)));
      return { inline, clear: clearBtn, block: blocks };
    }

    function sync() {
      for (let k = ctl.length - 1; k >= 0; k--) if (!ctl[k].isConnected && !(panel && panel.contains(ctl[k]))) ctl.splice(k, 1);
      const host = opts.host();
      const sel = getSelection();
      const collapsed = !sel.rangeCount || sel.isCollapsed;
      const blk = host ? opts.blockOf(host) : null;
      const onMd = md();
      let sz = 1;
      let anchorEl = null;
      if (host) { sz = effective(sel.anchorNode, host); anchorEl = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement; }
      const within = (sel2) => !!(anchorEl && anchorEl.closest(sel2) && host.contains(anchorEl.closest(sel2)));
      for (const b of ctl) {
        const k = b.dataset.fmt;
        let off = !host || !editing;
        let pressed = false;
        let why = '';
        if (k === 'bold') pressed = !!host && document.queryCommandState('bold');
        else if (k === 'italic') pressed = !!host && document.queryCommandState('italic');
        else if (k === 'underline') { pressed = !!host && within('u'); if (onMd) { off = true; why = 'in Markdown nicht möglich'; } }
        else if (k === 'bigger' || k === 'smaller') {
          if (onMd) { off = true; why = 'in Markdown nicht möglich'; } else if (host && collapsed) { off = true; why = 'erst Text markieren'; } else if (host) {
            if (k === 'bigger' ? sz >= STEPS[STEPS.length - 1] - 0.002 : sz <= STEPS[0] + 0.002) { off = true; why = 'Grenze erreicht'; }
          }
        } else if (BLOCKS.some((x) => x[0] === k)) {
          pressed = !!blk && blk === k;
          if (host && !blk) { off = true; why = 'hier nicht möglich'; }
        }
        b.disabled = off;
        b.setAttribute('aria-pressed', String(!off && pressed));
        b.title = why ? b.dataset.title + ' – ' + why : b.dataset.title;
      }
    }

    function place() {
      if (!panel || panel.hidden) return;
      const bar = opts.bar && opts.bar();
      const vis = bar && bar.offsetParent !== null;
      const w = panel.offsetWidth;
      const h = panel.offsetHeight;
      if (!vis) { panel.style.top = '60px'; panel.style.left = Math.max(8, innerWidth - w - 8) + 'px'; return; }
      const r = bar.getBoundingClientRect();
      const left = Math.min(Math.max(r.right - w, 8), Math.max(8, innerWidth - w - 8));
      const below = !bar.classList.contains('oe-solo');
      panel.style.left = left + 'px';
      panel.style.top = Math.max(8, below ? r.bottom + 6 : r.top - h - 6) + 'px';
    }

    function buildPanel() {
      panel = document.createElement('div');
      panel.className = 'oef-panel';
      panel.dataset.oeUi = '';
      panel.setAttribute('role', 'toolbar');
      panel.setAttribute('aria-label', 'Formatierung');
      panel.hidden = true;
      const p = parts();
      panel.append(...p.inline, p.clear, ...p.block);
      panel.addEventListener('keydown', (e) => e.stopPropagation());
      document.body.appendChild(panel);
      window.addEventListener('resize', place);
    }

    function togglePanel(force) {
      if (!panel) buildPanel();
      open = typeof force === 'boolean' ? force : !open;
      try { localStorage.setItem(KEY, open ? '1' : '0'); } catch (e) { /* siehe oben */ }
      apply();
    }

    function apply() {
      if (!panel) { if (open && editing) buildPanel(); else return; }
      panel.hidden = !(open && editing);
      place();
      sync();
      for (const f of listeners) f(open && editing);
    }

    const listeners = [];

    function setEditing(on) {
      if (editing === !!on) return;
      editing = !!on;
      apply();
    }

    function key(e) {
      if (!(e.ctrlKey || e.metaKey)) return null;
      if (e.altKey) {
        // Deutsche Tastatur: AltGr meldet Strg+Alt und tippt }, ², ³; nur echte Ziffer-Taste zaehlt.
        if (e.getModifierState && e.getModifierState('AltGraph')) return null;
        const m = /^(?:Digit|Numpad)([0-3])$/.exec(e.code || '');
        return m && e.key === m[1] ? () => block(BLOCKS[+m[1]][0]) : null;
      }
      const k = e.key.toLowerCase();
      if (e.shiftKey && (e.code === 'Period' || e.code === 'Comma')) return guard(() => size(e.code === 'Period' ? 1 : -1));
      if (e.shiftKey) return null;
      if (k === 'b') return guard(() => run('bold'));
      if (k === 'i') return guard(() => run('italic'));
      if (k === 'u') return md() ? () => {} : guard(() => run('underline'));
      return null;
    }

    return {
      parts, key, sync, tidy, keep, togglePanel, setEditing,
      get open() { return open && editing; },
      onPanel(fn) { listeners.push(fn); },
      icon: () => svg('fmt'),
    };
  }

  window.OneEditorFormat = { mount };
})();
