import { InfElement, STEUERSTIL, registriere } from './kern.js';

// Ein Haken pflanzt sich als Welle fort, ein Radio wandert weiter.
let gruppe = 0;

export class InfCheck extends InfElement {
  static vorgaben = { ...InfElement.vorgaben, repeat: '∞', space: 0 };
  static eigeneAttribute = ['type', 'checked'];
  static stil = STEUERSTIL + `input { width: 22px; height: 22px; margin: 0; cursor: pointer; }`;

  constructor() {
    super();
    this._name = 'inf-check-' + (gruppe++);
    this._an = new Set(this.hasAttribute('checked') ? [0] : []);
    this._wellen = [];
  }
  get _typ() { return this.getAttribute('type') === 'radio' ? 'radio' : 'checkbox'; }
  baueKopie(i) {
    const l = document.createElement('label');
    l.className = 'ziel';
    l.part = 'item';
    const f = document.createElement('input');
    f.type = this._typ;
    f.name = this._name;
    f.setAttribute('aria-label', String(i + 1));
    l.append(f);
    return l;
  }
  fuelleKopie(l, i) { l.firstChild.checked = this._an.has(i); }
  attributGeaendert() { for (const k of this.kopien.splice(0)) k.remove(); }
  verbunden() {
    this._root.querySelector('.buehne').addEventListener('change', (e) => {
      const start = Number(e.target.closest('.kopie').dataset.i);
      const wert = e.target.checked;
      for (const t of this._wellen.splice(0)) clearTimeout(t);
      if (this._typ === 'radio') return this._wandere(start);
      // Welle nach beiden Seiten, ein Schritt je 30 ms
      this.kopien.forEach((k, i) => {
        if (i === start) { this._setze(i, wert); return; }
        this._wellen.push(setTimeout(() => { this._setze(i, wert); }, Math.abs(i - start) * 30));
      });
    });
  }
  _setze(i, wert) {
    if (wert) this._an.add(i); else this._an.delete(i);
    const k = this.kopien[i];
    if (k) k.firstChild.checked = wert;
  }
  _wandere(i) {
    this._an = new Set([i]);
    const n = this.kopien.length;
    if (n < 2) return;
    const weiter = () => {
      const k = this.kopien[(i = (i + 1) % this.kopien.length)];
      if (!k) return;
      k.firstChild.checked = true;
      this._an = new Set([i]);
      if (i !== 0) this._wellen.push(setTimeout(weiter, 60));
    };
    this._wellen.push(setTimeout(weiter, 60));
  }
}
registriere('inf-check', InfCheck);
