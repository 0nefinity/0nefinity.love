import { InfElement, registriere } from './kern.js';

// Ein einzelnes Zeichen. B ist die aufgestellte 8, die aufgestellte 8 ist ∞.
const segmente = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter() : null;
const letztesZeichen = (s) => {
  if (!s) return '';
  if (!segmente) return [...s].pop();
  let z = '';
  for (const { segment } of segmente.segment(s)) z = segment;
  return z;
};

export class InfLetter extends InfElement {
  static periode = 1;
  static vorgaben = { ...InfElement.vorgaben, repeat: '∞', scale: 0.88, bend: 24, space: 0 };
  static eigeneAttribute = ['char', 'size'];
  static stil = `.zeichen { font-size: var(--groesse, 8rem); line-height: 1; padding: 0 .02em; }`;

  get char() { return this.getAttribute('char') || 'B'; }
  set char(c) { this.setAttribute('char', letztesZeichen(String(c)) || 'B'); }

  baueKopie() { const s = document.createElement('span'); s.className = 'zeichen'; s.part = 'item'; return s; }
  fuelleKopie(s) {
    s.textContent = this.char;
    s.style.setProperty('--groesse', this.getAttribute('size') || '8rem');
  }
  attributGeaendert() { for (const k of this.kopien) this.fuelleKopie(k); }
}
registriere('inf-letter', InfLetter);
