import { InfElement, registriere } from './kern.js';

// Ein Regler bewegt alle. phase verschiebt jede Kopie um ein Stück weiter, im Kreis.
export class InfRange extends InfElement {
  static vorgaben = { ...InfElement.vorgaben, repeat: '∞', angle: 90, space: 0 };
  static eigeneAttribute = ['min', 'max', 'step', 'value', 'phase'];
  // Nullpunkt in der Mitte: links negative, rechts positive Abweichung. Daumen 16 px, damit die Mittelmarke exakt unter dem Wert 0 sitzt.
  static stil = `
    input { --d: 16px; --f: .5; --marke: var(--ui-text-60, rgba(255,255,255,.6));
      -webkit-appearance: none; appearance: none; width: 14rem; height: 44px; margin: 0; cursor: pointer; color-scheme: dark;
      touch-action: none; border-radius: 0;
      --p: calc(var(--d) / 2 + var(--f) * (100% - var(--d)));
      background: linear-gradient(to right, transparent calc(var(--p) - .5px), var(--marke) calc(var(--p) - .5px),
        var(--marke) calc(var(--p) + .5px), transparent calc(var(--p) + .5px)) center / 100% 28px no-repeat; }
    input::-webkit-slider-runnable-track { height: 2px; border-radius: 1px; background: var(--ui-fill-20, rgba(255,255,255,.2)); }
    input::-moz-range-track { height: 2px; border-radius: 1px; background: var(--ui-fill-20, rgba(255,255,255,.2)); }
    input::-webkit-slider-thumb { -webkit-appearance: none; width: var(--d); height: var(--d); margin-top: -7px; border: 0;
      border-radius: 50%; background: var(--text-color, white); }
    input::-moz-range-thumb { width: var(--d); height: var(--d); box-sizing: border-box; border: 0; border-radius: 50%; background: var(--text-color, white); }
    input:focus-visible { outline: 1px solid var(--text-color, white); outline-offset: 2px; }`;

  constructor() { super(); this._wert = null; this._tipp = null; }
  get _min() { return Number(this.getAttribute('min') ?? -100); }
  get _max() { return Number(this.getAttribute('max') ?? 100); }
  // Nullpunkt: 0, wenn er im Bereich liegt, sonst die Mitte.
  get _null() { const min = this._min, max = this._max; return min <= 0 && max >= 0 ? 0 : (min + max) / 2; }
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
    this._marke(r);
  }
  _fuer(i) {
    const min = this._min, spanne = this._max - min;
    const w = this._wert ?? Number(this.getAttribute('value') ?? this._null);
    const phase = Number(this.getAttribute('phase') ?? 0);
    if (!phase || !spanne) return w;
    return min + ((((w - min + i * phase) % spanne) + spanne) % spanne);
  }
  _marke(r) {
    const spanne = this._max - this._min;
    r.style.setProperty('--f', String(spanne ? (this._null - this._min) / spanne : .5));
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
    // Doppelklick und Doppeltipp setzen auf den Nullpunkt zurück. Ein Tipp = kaum bewegt zwischen Drücken und Loslassen.
    const buehne = this._root.querySelector('.buehne');
    buehne.addEventListener('pointerdown', (e) => { if (e.target.type === 'range') this._runter0 = { x: e.clientX, y: e.clientY }; });
    buehne.addEventListener('pointerup', (e) => {
      const d = this._runter0;
      this._runter0 = null;
      if (!d || e.target.type !== 'range' || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) { this._tipp = null; return; }
      const jetzt = performance.now(), t = this._tipp;
      this._tipp = { zeit: jetzt, x: e.clientX, y: e.clientY };
      if (!t || jetzt - t.zeit > 400 || Math.hypot(e.clientX - t.x, e.clientY - t.y) > 24) return;
      this._tipp = null;
      // Nach dem eigenen Wertwechsel des Browsers, sonst überschreibt er den Reset.
      setTimeout(() => {
        this._wert = this._null;
        for (const k of this.kopien) k.value = String(this._fuer(Number(k.dataset.i)));
      }, 0);
    });
  }
}
registriere('inf-range', InfRange);
