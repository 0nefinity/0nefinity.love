import { InfElement, OHNE_AUTOFILL, STEUERSTIL, registriere } from './kern.js';

const FORMEN = ['standard', 'eckig', 'rund', 'pille', 'kreis'];

// Jeder Druck auf einen Button ist ein Button mehr.
export class InfButton extends InfElement {
  static vorgaben = { ...InfElement.vorgaben, repeat: 1, space: 8 };
  static eigeneAttribute = ['label', 'shape'];
  static stil = STEUERSTIL + `
    :host([shape="eckig"]) button.ding { border-radius: 0; }
    :host([shape="rund"]) button.ding { border-radius: 12px; }
    :host([shape="pille"]) button.ding { border-radius: 999px; }
    :host([shape="kreis"]) button.ding { border-radius: 50%; aspect-ratio: 1; padding: 0 .5rem; }
    .leiste input.text { width: 68px; padding: 0 .25rem; }
    .leiste .form i { display: block; width: 20px; height: 12px; border: 1.5px solid currentColor; border-radius: 3px; }
    .leiste .form[data-form="eckig"] i { border-radius: 0; }
    .leiste .form[data-form="rund"] i { border-radius: 6px; }
    .leiste .form[data-form="pille"] i { border-radius: 999px; }
    .leiste .form[data-form="kreis"] i { width: 14px; height: 14px; border-radius: 50%; }`;

  leistenExtra() {
    return `<input class="text" type="search" aria-label="Text" placeholder="Button" ${OHNE_AUTOFILL} enterkeyhint="done">
      <button type="button" class="form" aria-label="Form" title="Form"><i></i></button>`;
  }

  baueKopie() {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ding';
    b.part = 'item';
    return b;
  }
  fuelleKopie(b) { b.textContent = this.getAttribute('label') ?? 'Button'; }
  attributGeaendert() {
    for (const k of this.kopien) this.fuelleKopie(k);
    const t = this._root.querySelector('.text');
    if (t && this._root.activeElement !== t) t.value = this.getAttribute('label') ?? '';
    const f = this._root.querySelector('.form');
    if (f) f.dataset.form = this.getAttribute('shape') || 'standard';
  }
  verbunden() {
    const t = this._root.querySelector('.text');
    t.value = this.getAttribute('label') ?? '';
    t.addEventListener('input', () => (t.value === '' ? this.removeAttribute('label') : this.setAttribute('label', t.value)));
    const f = this._root.querySelector('.form');
    f.dataset.form = this.getAttribute('shape') || 'standard';
    f.addEventListener('click', () => {
      const n = FORMEN[(FORMEN.indexOf(this.getAttribute('shape') || 'standard') + 1) % FORMEN.length];
      if (n === 'standard') this.removeAttribute('shape'); else this.setAttribute('shape', n);
    });
    this._root.querySelector('.buehne').addEventListener('click', (e) => {
      if (e.target.closest('button.ding')) this.mehr(1);
    });
  }
}
registriere('inf-button', InfButton);
