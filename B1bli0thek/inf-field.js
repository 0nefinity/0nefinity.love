import { InfElement, STEUERSTIL, ohneAutofill, registriere } from './kern.js';

// Was man in ein Feld schreibt, steht in allen.
export class InfField extends InfElement {
  static vorgaben = { ...InfElement.vorgaben, repeat: '∞', angle: 90, space: 8 };
  static eigeneAttribute = ['value', 'multiline'];
  static stil = STEUERSTIL + `
    .feld { box-sizing: border-box; font: inherit; font-size: 16px; color: var(--text-color, white); width: 12rem; min-height: 44px;
      padding: .5rem .75rem; border: 0; border-radius: 4px; background: var(--ui-fill-10, rgba(255,255,255,.1)); resize: none; }
    textarea.feld { height: 5rem; }`;

  constructor() { super(); this._wert = this.getAttribute('value') ?? ''; }
  baueKopie() {
    const f = document.createElement(this.hasAttribute('multiline') ? 'textarea' : 'input');
    if (f.tagName === 'INPUT') f.type = 'search';
    f.className = 'feld';
    f.part = 'item';
    f.setAttribute('aria-label', 'Textfeld');
    return ohneAutofill(f);
  }
  fuelleKopie(f) { f.value = this._wert; }
  attributGeaendert() {
    this._wert = this.getAttribute('value') ?? this._wert;
    if ((this.kopien[0]?.tagName === 'TEXTAREA') !== this.hasAttribute('multiline')) { this.leereKopien(); }
    for (const k of this.kopien) this.fuelleKopie(k);
  }
  get value() { return this._wert; }
  set value(v) { this._wert = String(v); for (const k of this.kopien) k.value = this._wert; }
  verbunden() {
    this._root.querySelector('.buehne').addEventListener('input', (e) => {
      this._wert = e.target.value;
      for (const k of this.kopien) if (k !== e.target) k.value = this._wert;
    });
  }
}
registriere('inf-field', InfField);
