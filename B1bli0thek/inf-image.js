import { InfElement, registriere } from './kern.js';

// Das Bild im Bild im Bild: Schrittweite 0, jede Kopie kleiner, bis sie unter einen Pixel fällt.
export class InfImage extends InfElement {
  static periode = 1;
  static vorgaben = { ...InfElement.vorgaben, repeat: '∞', gap: 0, scale: 0.8, bend: 0 };
  static eigeneAttribute = ['src', 'alt', 'size'];
  static stil = `img.kopie { display: block; pointer-events: none; -webkit-user-drag: none; }`;

  baueKopie() {
    const b = document.createElement('img');
    b.part = 'item';
    b.draggable = false;
    b.decoding = 'async';
    b.addEventListener('load', () => this.vermessen(), { once: true });
    return b;
  }
  fuelleKopie(b, i) {
    b.src = this.getAttribute('src') || new URL('../assets/circle.svg', import.meta.url).href;
    b.alt = i === 0 ? (this.getAttribute('alt') ?? '') : '';
    b.style.width = this.getAttribute('size') || '60vmin';
  }
  attributGeaendert() { for (const k of this.kopien) this.fuelleKopie(k, Number(k.dataset.i)); }
}
registriere('inf-image', InfImage);
