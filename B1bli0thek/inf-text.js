import { InfElement, registriere } from './kern.js';
import { NAME } from './name.js';

// Jede Form von Text. Die Kopien gehen der Reihe nach durch alle Formen und fangen dann wieder vorn an.
export const FORMEN = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'b', 'strong', 'i', 'em', 'u', 's', 'del', 'ins', 'mark',
  'small', 'sup', 'sub', 'code', 'kbd', 'samp', 'var', 'pre', 'blockquote', 'q', 'cite', 'dfn', 'abbr', 'time', 'span'];

export class InfText extends InfElement {
  static vorgaben = { ...InfElement.vorgaben, repeat: '∞', angle: 90, space: 6 };
  static eigeneAttribute = ['form', 'text'];
  static stil = `
    .kopie > * { margin: 0; color: inherit; font-family: inherit; }
    h1 { font-size: 2.5rem; } h2 { font-size: 2rem; } h3 { font-size: 1.6rem; } h4 { font-size: 1.3rem; } h5 { font-size: 1.1rem; } h6 { font-size: .95rem; }
    code, kbd, samp, pre, var { font-family: ui-monospace, Consolas, monospace; }
    kbd { border: 1px solid var(--ui-text-60, rgba(255,255,255,.6)); border-radius: 4px; padding: 0 .3em; }
    mark { background: var(--text-color, white); color: var(--bg-color, black); }
    blockquote { border-left: 2px solid var(--ui-text-60, rgba(255,255,255,.6)); padding-left: .75rem; }
    abbr { text-decoration: underline dotted; }`;

  get formen() {
    const f = (this.getAttribute('form') || 'alle').trim().toLowerCase();
    if (f === 'alle' || f === 'all') return FORMEN;
    const liste = f.split(/[\s,|]+/).filter((x) => FORMEN.includes(x));
    return liste.length ? liste : ['span'];
  }
  get text() { return this.getAttribute('text') ?? (this.textContent.trim() || NAME); }

  baueKopie(i) {
    const huelle = document.createElement('div');
    huelle.part = 'item';
    const form = this.formen[i % this.formen.length];
    const el = document.createElement(form);
    if (form === 'time') el.dateTime = new Date().toISOString().slice(0, 10);
    if (form === 'abbr') el.title = this.text;
    huelle.append(el);
    huelle.dataset.form = form;
    return huelle;
  }
  fuelleKopie(h) { h.firstChild.textContent = this.text; }
  attributGeaendert() { this.leereKopien(); }
}
registriere('inf-text', InfText);
