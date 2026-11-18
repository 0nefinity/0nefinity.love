import { InfElement, registriere } from './kern.js';

// Ein Strich, quer zu seinem Weg. Gerade = Raster, gekrümmt = Strahlenkranz.
export class InfLine extends InfElement {
  static periode = 1;
  static vorgaben = { ...InfElement.vorgaben, repeat: '∞', space: 10 };
  static eigeneAttribute = ['length', 'weight', 'art'];
  static stil = `.kopie.strich { width: 0; border-left: var(--w, 1px) var(--art, solid) var(--text-color, white); }`;

  baueKopie() { const d = document.createElement('div'); d.className = 'strich'; d.part = 'item'; return d; }
  fuelleKopie(d) {
    d.style.height = this.getAttribute('length') || '50vmin';
    d.style.setProperty('--w', (this.getAttribute('weight') || '1') + 'px');
    d.style.setProperty('--art', this.getAttribute('art') || 'solid');
  }
  attributGeaendert() { for (const k of this.kopien) this.fuelleKopie(k); }
}
registriere('inf-line', InfLine);
