import { InfElement, STEUERSTIL, registriere } from './kern.js';

// Ohne href verweist der Link auf sich selbst: ein Klick, ein Link mehr.
export class InfLink extends InfElement {
  static vorgaben = { ...InfElement.vorgaben, repeat: 1, space: 4 };
  static eigeneAttribute = ['href', 'text'];
  static stil = STEUERSTIL + `a.ding { border: 0; padding: 0 .5rem; text-decoration: underline; text-underline-offset: .2em; }`;

  baueKopie() { const a = document.createElement('a'); a.className = 'ding'; a.part = 'item'; return a; }
  fuelleKopie(a) {
    a.href = this.getAttribute('href') || '#';
    a.textContent = this.getAttribute('text') ?? '∞';
  }
  attributGeaendert() { for (const k of this.kopien) this.fuelleKopie(k); }
  verbunden() {
    this._root.querySelector('.buehne').addEventListener('click', (e) => {
      if (!e.target.closest('a.ding') || this.getAttribute('href')) return;
      e.preventDefault();
      this.mehr(1);
    });
  }
}
registriere('inf-link', InfLink);
