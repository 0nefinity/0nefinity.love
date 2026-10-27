/* editor-md.js - Markdown <-> DOM for the login editor (.md pages in the text viewer).
 *
 * The .md viewer (tools/weird-text-viewer.php) renders the file with Parsedown 1.8.0 into
 * <div class="text-viewer-content" data-format="markdown">. This file turns that DOM (also
 * after editing) back into Markdown that Parsedown renders to the same DOM again.
 *
 * Same-origin, no dependencies. API: window._018EditorMd
 *   isMdPage()          true on a rendered .md page
 *   contentRoot()       the content element
 *   serialize(root)     Markdown text (no trailing newline); throws MdSerializeError when
 *                       something cannot be written back safely (fail loud, never guess)
 *   payload(base)       { base, text } for the save request; base = serialize() taken at load
 *
 * The server (editor/md_save.py) merges base -> text into the real file, so unchanged
 * regions keep their original bytes (spacing, comments, list markers). Elements carrying
 * [data-md-ignore] (editor UI) are skipped.
 */
(function (global) {
  'use strict';

  class MdSerializeError extends Error {
    constructor(message, node) {
      super(message);
      this.name = 'MdSerializeError';
      this.node = node || null;
    }
  }

  const INLINE = new Set(['a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'code', 'data', 'del', 'dfn', 'em',
    'font', 'i', 'img', 'ins', 'kbd', 'label', 'mark', 'q', 's', 'samp', 'small', 'span', 'strike', 'strong',
    'sub', 'sup', 'time', 'u', 'var', 'wbr']);
  const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
  const SPECIAL = '\\`*_{}[]()>#+-.!|~';
  const DROP_ATTRS = new Set(['contenteditable', 'spellcheck', 'data-md-ignore']);
  const dropAttr = (n) => DROP_ATTRS.has(n) || n.startsWith('data-018-') || n.startsWith('data-oe');

  const tag = (n) => (n.nodeType === 1 ? n.nodeName.toLowerCase() : '');
  const isIgnored = (n) => n.nodeType === 1 && (n.hasAttribute('data-md-ignore') || n.hasAttribute('data-oe-ui'));
  const isWord = (c) => c !== undefined && c !== '' && /[\p{L}\p{N}_]/u.test(c);
  const attrEsc = (v) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

  function fail(msg, node) {
    throw new MdSerializeError(msg + (node && node.nodeName ? ' (<' + node.nodeName.toLowerCase() + '>)' : ''), node);
  }

  /* ---------------------------------------------------------------- text */

  function escapeText(s, atLineStart, ctx) {
    s = s.replace(/ /g, '&nbsp;');
    let out = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i], prev = s[i - 1], next = s[i + 1];
      if (c === '\\') {
        out += (next === undefined || SPECIAL.includes(next)) ? '\\\\' : '\\';
      } else if (c === '`' || c === '*') {
        out += '\\' + c;
      } else if (c === '_') {
        out += (isWord(prev) && isWord(next)) ? '_' : '\\_';
      } else if (c === '~') {
        out += (next === '~' || prev === '~') ? '\\~' : '~';
      } else if (c === '[') {
        out += (ctx.inLink || /\]\s*[(\[]/.test(s.slice(i))) ? '\\[' : '[';
      } else if (c === ']') {
        out += (ctx.inLink || next === '(' || next === '[') ? '\\]' : ']';
      } else if (c === '<') {
        out += (next !== undefined && /[A-Za-z\/!?]/.test(next)) ? '&lt;' : '<';
      } else if (c === '&') {
        out += /^&#?\w+;/.test(s.slice(i)) ? '&amp;' : '&';
      } else if (c === '|' && ctx.inCell) {
        out += '\\|';
      } else {
        out += c;
      }
    }
    // line-start constructs
    return out.split('\n').map((seg, k) => ((k > 0 || atLineStart) ? escapeLineStart(seg) : seg)).join('\n');
  }

  function escapeLineStart(seg) {
    const m = /^(\s*)([\s\S]*)$/.exec(seg);
    let lead = m[1], rest = m[2];
    if (/^#/.test(rest)) rest = '\\' + rest;
    else if (/^>/.test(rest)) rest = '\\' + rest;
    else if (/^[-+]([ \t]|$)/.test(rest)) rest = '\\' + rest;
    else if (/^-+\s*$/.test(rest) || /^(-\s*){3,}$/.test(rest)) rest = '\\' + rest;
    else if (/^=+\s*$/.test(rest)) rest = '&#61;' + rest.slice(1);
    else if (/^\d+\./.test(rest)) rest = rest.replace(/^(\d+)\./, '$1\\.');
    else if (/^\[[^\]]*\]:/.test(rest)) rest = '\\' + rest;
    return lead + rest;
  }

  /* ---------------------------------------------------------------- inline */

  function openTag(el) {
    let s = '<' + tag(el);
    for (const a of el.attributes) {
      if (dropAttr(a.name)) continue;
      s += ' ' + a.name + (a.value === '' ? '' : '="' + attrEsc(a.value) + '"');
    }
    return s + '>';
  }

  // Raw HTML for a whole element (block passthrough), editor attributes removed.
  function rawHtml(el) {
    const clone = el.cloneNode(true);
    const strip = (e) => {
      for (const n of [...e.children]) {
        if (isIgnored(n)) { n.remove(); continue; }
        strip(n);
      }
      for (const a of [...e.attributes]) if (dropAttr(a.name)) e.removeAttribute(a.name);
    };
    strip(clone);
    let html = clone.outerHTML;
    // the HTML parser drops one newline right after <pre>; put it back when the text needs it
    const t = tag(clone);
    if ((t === 'pre' || t === 'textarea') && clone.textContent.startsWith('\n')) {
      html = html.replace(/^(<[^>]*>)/, '$1\n');
    }
    return html;
  }

  function wrapEmph(inner, mark) {
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner);
    if (!m[2]) return inner;
    return m[1] + mark + m[2] + mark + m[3];
  }

  function inlineCode(text) {
    if (/\n/.test(text)) text = text.replace(/\n/g, ' ');
    let n = 1;
    const runs = text.match(/`+/g);
    if (runs) n = Math.max(...runs.map((r) => r.length)) + 1;
    const f = '`'.repeat(n);
    const pad = /^`|`$/.test(text) ? ' ' : '';
    return f + pad + text + pad + f;
  }

  function checkUrl(url, node) {
    if (/\s/.test(url)) fail('URL with whitespace cannot be written as Markdown link: ' + url, node);
    let depth = 0;
    for (const ch of url) {
      if (ch === '(') depth++;
      else if (ch === ')' && --depth < 0) break;
    }
    if (depth !== 0) fail('URL with unbalanced parentheses cannot be written as Markdown link: ' + url, node);
  }

  function inlineNodes(nodes, ctx) {
    let out = '';
    const list = [...nodes];
    let afterBr = false;
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      if (isIgnored(n)) continue;
      const wasBr = afterBr;
      afterBr = tag(n) === 'br';
      if (n.nodeType === 3) {
        // Parsedown writes "<br />\n"; that newline belongs to the break
        const v = wasBr ? n.nodeValue.replace(/^\n/, '') : n.nodeValue;
        out += escapeText(v, out === '' || out.endsWith('\n'), ctx);
      } else if (n.nodeType === 8) {
        out += '<!--' + n.nodeValue + '-->';
      } else if (n.nodeType === 1) {
        out += inlineElement(n, ctx);
      }
    }
    return out;
  }

  function inlineElement(el, ctx) {
    const t = tag(el);
    const kids = (c) => inlineNodes(el.childNodes, c || ctx);
    switch (t) {
      case 'br': return '  \n';
      case 'strong': case 'b': return wrapEmph(kids(), '**');
      case 'em': case 'i': return wrapEmph(kids(), '*');
      case 'del': case 's': case 'strike': return wrapEmph(kids(), '~~');
      case 'code': return inlineCode(el.textContent);
      case 'img': {
        const src = el.getAttribute('src') || '';
        checkUrl(src, el);
        const alt = escapeText(el.getAttribute('alt') || '', false, { inLink: true });
        const title = el.getAttribute('title');
        return '![' + alt + '](' + src + (title ? ' "' + title.replace(/"/g, '&quot;') + '"' : '') + ')';
      }
      case 'a': {
        const href = el.getAttribute('href');
        if (href === null) return kidsRaw(el, ctx);
        checkUrl(href, el);
        const title = el.getAttribute('title');
        const text = el.textContent;
        if (!title && text === href && /^(https?:\/\/|mailto:|ftp:\/\/)\S+$/i.test(href) && el.children.length === 0) return href;
        const inner = inlineNodes(el.childNodes, { ...ctx, inLink: true });
        return '[' + inner + '](' + href + (title ? ' "' + title.replace(/"/g, '&quot;') + '"' : '') + ')';
      }
      default:
        return kidsRaw(el, ctx);
    }
  }

  // unknown inline element: Parsedown passes the tags through and still parses the content
  function kidsRaw(el, ctx) {
    const t = tag(el);
    if (VOID.has(t)) return openTag(el);
    return openTag(el) + inlineNodes(el.childNodes, ctx) + '</' + t + '>';
  }

  function inlineText(nodes, ctx) {
    return inlineNodes(nodes, ctx || {});
  }

  /* ---------------------------------------------------------------- blocks */

  const isInlineNode = (n) => n.nodeType === 3 || n.nodeType === 8 || (n.nodeType === 1 && INLINE.has(tag(n)));
  const isBlank = (n) => n.nodeType === 3 && !/\S/.test(n.nodeValue.replace(/ /g, 'x'));

  function trimPara(s) {
    return s.replace(/^[ \t\n]+/, '').replace(/\n+$/, '');
  }

  // children of a container -> array of block strings
  function blocks(parent, ctx) {
    const out = [];
    let run = [];
    const flush = () => {
      if (!run.length) return;
      const s = trimPara(inlineText(run, ctx));
      if (s) out.push({ kind: 'p', text: s });
      run = [];
    };
    for (const n of parent.childNodes) {
      if (isIgnored(n)) continue;
      if (isInlineNode(n)) { run.push(n); continue; }
      if (n.nodeType !== 1) continue;
      flush();
      const b = block(n, ctx);
      if (b) out.push(b);
    }
    flush();
    return out;
  }

  function block(el, ctx) {
    const t = tag(el);
    if (/^h[1-6]$/.test(t)) {
      const s = trimPara(inlineText(el.childNodes, ctx)).replace(/\s*\n\s*/g, ' ');
      if (!s) return null;
      return { kind: 'h', text: '#'.repeat(+t[1]) + ' ' + s };
    }
    switch (t) {
      case 'p': {
        const s = trimPara(inlineText(el.childNodes, ctx));
        return s ? { kind: 'p', text: s } : null;
      }
      case 'div': {
        // editor-made line wrappers: attribute-free div with inline content only
        if (el.attributes.length === 0 && [...el.childNodes].every((n) => isIgnored(n) || isInlineNode(n))) {
          const s = trimPara(inlineText(el.childNodes, ctx));
          return s ? { kind: 'p', text: s } : null;
        }
        return { kind: 'raw', text: rawHtml(el) };
      }
      case 'hr': return { kind: 'hr', text: '---' };
      case 'blockquote': {
        const inner = joinBlocks(blocks(el, ctx));
        if (!inner) return null;
        return { kind: 'q', text: inner.split('\n').map((l) => (l ? '> ' + l : '>')).join('\n') };
      }
      case 'pre': {
        const kids = [...el.children].filter((c) => !isIgnored(c));
        if (kids.length === 1 && tag(kids[0]) === 'code' && [...el.childNodes].every((n) => n === kids[0] || isIgnored(n))) {
          const code = kids[0];
          const cm = /(?:^|\s)language-(\S+)/.exec(code.getAttribute('class') || '');
          let text = code.textContent;
          if (text.endsWith('\n')) text = text.slice(0, -1);
          const longest = Math.max(2, ...(text.match(/^[ \t]*`{3,}/gm) || []).map((r) => r.trim().length));
          const fence = '`'.repeat(longest + 1);
          return { kind: 'pre', text: fence + (cm ? cm[1] : '') + '\n' + text + '\n' + fence };
        }
        return { kind: 'raw', text: rawHtml(el) };
      }
      case 'ul': case 'ol': return { kind: 'list', text: list(el, ctx) };
      case 'table': return { kind: 'table', text: table(el, ctx) };
      case 'script': case 'style': return { kind: 'raw', text: rawHtml(el) };
      default:
        if (!el.attributes.length && !el.children.length && !el.textContent.trim()) return null;
        return { kind: 'raw', text: rawHtml(el) };
    }
  }

  function joinBlocks(bs) {
    let out = '';
    bs.forEach((b, i) => { out += (i ? '\n\n' : '') + b.text; });
    return out;
  }

  function list(el, ctx) {
    const ordered = tag(el) === 'ol';
    let n = ordered ? parseInt(el.getAttribute('start') || '1', 10) : 0;
    if (ordered && !(n >= 0)) fail('list start not a number', el);
    const items = [...el.children].filter((c) => !isIgnored(c));
    const loose = items.some((li) => [...li.children].some((c) => tag(c) === 'p'));
    const parts = [];
    for (const li of items) {
      if (tag(li) !== 'li') fail('list child is not <li>', li);
      const marker = ordered ? (n++) + '. ' : '- ';
      const bs = blocks(li, ctx);
      let text = '';
      bs.forEach((b, i) => {
        const sep = i === 0 ? '' : (loose || (b.kind !== 'list' && bs[i - 1].kind !== 'list') ? '\n\n' : '\n');
        text += sep + b.text;
      });
      const pad = ' '.repeat(marker.length);
      const lines = text.split('\n').map((l, k) => (k === 0 ? marker + l : (l ? pad + l : l)));
      parts.push(lines.join('\n'));
    }
    return parts.join(loose ? '\n\n' : '\n');
  }

  function table(el, ctx) {
    const rows = [...el.querySelectorAll('tr')].filter((r) => !isIgnored(r));
    if (!rows.length) fail('empty table', el);
    const cellCtx = { ...ctx, inCell: true };
    const cells = (r) => [...r.children].filter((c) => /^t[hd]$/.test(tag(c)) && !isIgnored(c));
    const head = cells(rows[0]);
    const align = head.map((c) => {
      const m = /text-align:\s*(left|right|center)/.exec(c.getAttribute('style') || '');
      return m ? m[1] : '';
    });
    const fmt = (c) => trimPara(inlineText(c.childNodes, cellCtx)).replace(/\s*\n\s*/g, ' ');
    const line = (cs) => '| ' + cs.map(fmt).join(' | ') + ' |';
    const delim = '| ' + align.map((a) => (a === 'left' ? ':---' : a === 'right' ? '---:' : a === 'center' ? ':---:' : '---')).join(' | ') + ' |';
    const out = [line(head), delim];
    for (const r of rows.slice(1)) {
      const cs = cells(r);
      if (cs.length !== head.length) fail('table row with a different number of cells', r);
      out.push(line(cs));
    }
    return out.join('\n');
  }

  /* ---------------------------------------------------------------- API */

  function contentRoot() {
    return document.querySelector('.text-viewer-content[data-format="markdown"]');
  }

  function isMdPage() {
    return !!contentRoot();
  }

  function serialize(root) {
    root = root || contentRoot();
    if (!root) throw new MdSerializeError('no markdown content on this page');
    // the login editor wraps text runs in <oe-run>; they are not content
    const copy = root.cloneNode(true);
    for (const w of copy.querySelectorAll('oe-run')) w.replaceWith(...w.childNodes);
    copy.normalize();
    return joinBlocks(blocks(copy, {}));
  }

  function payload(base) {
    return { base: base, text: serialize() };
  }

  global._018EditorMd = { isMdPage, contentRoot, serialize, payload, MdSerializeError };
})(typeof window !== 'undefined' ? window : globalThis);
