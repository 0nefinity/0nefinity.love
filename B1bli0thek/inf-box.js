import { InfElement, registriere } from './kern.js';

// Kasten im Kasten. Antippen rundet die Ecken weiter: 0, ein wenig, ganz (Kreis).
const ECKEN = ['0', '8px', '50%'];

export class InfBox extends InfElement {
  static vorgaben = { ...InfElement.vorgaben, repeat: '∞', gap: 0, scale: 0.9, bend: 3 };
  static eigeneAttribute = ['size', 'radius', 'shadow', 'border'];
  static stil = `.kasten { box-sizing: border-box; border: var(--rand, 1px) solid var(--text-color, white); cursor: pointer; }
    .kopie.kasten:not(:first-child) { pointer-events: none; }`;

  constructor() { super(); this._ecke = null; }
  baueKopie() { const d = document.createElement('div'); d.className = 'kasten'; d.part = 'item'; return d; }
  fuelleKopie(d) {
    const g = this.getAttribute('size') || '60vmin';
    d.style.width = g;
    d.style.height = g;
    d.style.borderRadius = this._ecke ?? this.getAttribute('radius') ?? '0';
    d.style.setProperty('--rand', (this.getAttribute('border') ?? '1') + 'px');
    const sch = Number(this.getAttribute('shadow') ?? 0);
    d.style.boxShadow = sch ? `0 0 ${sch}px var(--ui-text-60, rgba(255,255,255,.6))` : 'none';
  }
  attributGeaendert() { this._ecke = null; for (const k of this.kopien) this.fuelleKopie(k); }
  verbunden() {
    this._root.querySelector('.buehne').addEventListener('click', (e) => {
      if (!e.target.closest('.kasten')) return;
      const jetzt = this._ecke ?? this.getAttribute('radius') ?? '0';
      this._ecke = ECKEN[(ECKEN.indexOf(jetzt) + 1) % ECKEN.length];
      for (const k of this.kopien) k.style.borderRadius = this._ecke;
    });
  }
}
registriere('inf-box', InfBox);
