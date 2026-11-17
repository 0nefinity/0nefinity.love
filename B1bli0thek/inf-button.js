import { InfElement, STEUERSTIL, registriere } from './kern.js';

// Jeder Druck auf einen Button ist ein Button mehr.
export class InfButton extends InfElement {
  static vorgaben = { ...InfElement.vorgaben, repeat: 1, space: 8 };
  static eigeneAttribute = ['label', 'shape'];
  static stil = STEUERSTIL + `
    :host([shape="eckig"]) button.ding { border-radius: 0; }
    :host([shape="rund"]) button.ding { border-radius: 12px; }
    :host([shape="pille"]) button.ding { border-radius: 999px; }
    :host([shape="kreis"]) button.ding { border-radius: 50%; aspect-ratio: 1; padding: 0 .5rem; }`;

  baueKopie() {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ding';
    b.part = 'item';
    return b;
  }
  fuelleKopie(b) { b.textContent = this.getAttribute('label') ?? 'Button'; }
  attributGeaendert() { for (const k of this.kopien) this.fuelleKopie(k); }
  verbunden() {
    this._root.querySelector('.buehne').addEventListener('click', (e) => {
      if (e.target.closest('button.ding')) this.mehr(1);
    });
  }
}
registriere('inf-button', InfButton);
