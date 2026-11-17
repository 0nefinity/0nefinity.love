import { InfElement, STEUERSTIL, registriere } from './kern.js';

// Jeder Druck auf einen Button ist ein Button mehr.
export class InfButton extends InfElement {
  static vorgaben = { ...InfElement.vorgaben, repeat: 1, space: 8 };
  static eigeneAttribute = ['label'];
  static stil = STEUERSTIL;

  baueKopie() {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ding';
    b.part = 'item';
    return b;
  }
  fuelleKopie(b) { b.textContent = this.getAttribute('label') ?? '1'; }
  attributGeaendert() { for (const k of this.kopien) this.fuelleKopie(k); }
  verbunden() {
    this._root.querySelector('.buehne').addEventListener('click', (e) => {
      if (e.target.closest('button.ding')) this.mehr(1);
    });
  }
}
registriere('inf-button', InfButton);
