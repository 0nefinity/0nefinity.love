import { InfElement, registriere } from './kern.js';

// Ein Regler bewegt alle. phase verschiebt jede Kopie um ein Stück weiter, im Kreis.
export class InfRange extends InfElement {
  static vorgaben = { ...InfElement.vorgaben, repeat: '∞', angle: 90, space: 0 };
  static eigeneAttribute = ['min', 'max', 'step', 'value', 'phase'];
  static stil = `
    input { width: 14rem; height: 44px; margin: 0; cursor: pointer; background: transparent; color-scheme: dark;
      accent-color: var(--text-color, white); touch-action: none; }
    input:focus-visible { outline: 1px solid var(--text-color, white); outline-offset: 2px; }`;

  constructor() { super(); this._wert = null; }
  get _min() { return Number(this.getAttribute('min') ?? 0); }
  get _max() { return Number(this.getAttribute('max') ?? 100); }
  baueKopie() {
    const r = document.createElement('input');
    r.type = 'range';
    r.part = 'item';
    r.setAttribute('aria-label', 'Schieberegler');
    return r;
  }
  fuelleKopie(r, i) {
    r.min = String(this._min);
    r.max = String(this._max);
    r.step = this.getAttribute('step') ?? 'any';
    r.value = String(this._fuer(i));
  }
  _fuer(i) {
    const min = this._min, spanne = this._max - min;
    const w = this._wert ?? Number(this.getAttribute('value') ?? (min + spanne / 2));
    const phase = Number(this.getAttribute('phase') ?? 0);
    if (!phase || !spanne) return w;
    return min + ((((w - min + i * phase) % spanne) + spanne) % spanne);
  }
  attributGeaendert() { for (const k of this.kopien) this.fuelleKopie(k, Number(k.dataset.i)); }
  get value() { return this._fuer(0); }
  set value(v) { this._wert = Number(v); this.attributGeaendert(); }
  verbunden() {
    this._root.querySelector('.buehne').addEventListener('input', (e) => {
      const i = Number(e.target.dataset.i);
      const phase = Number(this.getAttribute('phase') ?? 0);
      this._wert = Number(e.target.value) - i * phase;
      for (const k of this.kopien) if (k !== e.target) k.value = String(this._fuer(Number(k.dataset.i)));
    });
  }
}
registriere('inf-range', InfRange);
