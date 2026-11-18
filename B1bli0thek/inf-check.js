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
    // Zustand aller Kopien: _basis, außer den Kopien in _anders. So hat auch ∞ einen Zustand, ohne ∞ Einträge.
    this._basis = false;
    this._anders = new Set(this.hasAttribute('checked') ? [0] : []);
    this._wellen = [];
    this._welle = null;
  }
  get _typ() { return this.getAttribute('type') === 'radio' ? 'radio' : 'checkbox'; }
  // Alle gleich und keine Welle unterwegs: eine Kopie ist die Periode, den Rest faltet die Grafikkarte.
  // Läuft eine Welle, ist jede Kopie anders und echtes DOM, bis sie durch ist.
  get periode() { return this._typ === 'checkbox' && !this._welle && !this._anders.size ? 1 : 0; }
  _ist(i) { return this._basis !== this._anders.has(i); }
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
  fuelleKopie(l, i) { l.firstChild.checked = this._ist(i); }
  attributGeaendert() { this.leereKopien(); }
  verbunden() {
    this._root.querySelector('.buehne').addEventListener('change', (e) => {
      // Ein Klick auf ein Spiegelbild kommt bei seiner Vorlage an; die Welle startet trotzdem dort, wo geklickt wurde.
      const start = this._weiterVon ?? Number(e.target.closest('.kopie').dataset.i);
      const wert = e.target.checked;
      for (const t of this._wellen.splice(0)) clearTimeout(t);
      this._welle = null;
      if (this._typ === 'radio') return this._wandere(start);
      this._setze(start, wert);
      this._welle = { start, wert };
      this.zeichne();
    });
  }
  // Welle nach beiden Seiten, ein Schritt je 30 ms, über die Kopien, die das Layout gerade gebaut hat.
  nachLayout() {
    const w = this._welle;
    if (!w || w.laeuft) return;
    w.laeuft = true;
    const n = this.kopien.length, start = Math.min(w.start, Math.max(0, n - 1));
    let offen = 0;
    for (let i = 0; i < n; i++) {
      if (i === w.start) continue;
      offen++;
      this._wellen.push(setTimeout(() => { this._setze(i, w.wert); if (--offen === 0) this._durch(w); }, Math.abs(i - start) * 30));
    }
    if (!offen) this._durch(w);
  }
  // Die Welle läuft weiter bis ∞: danach haben alle Kopien ihren Wert.
  _durch(w) {
    if (this._welle !== w) return;
    this._welle = null;
    this._wellen = [];
    this._basis = w.wert;
    this._anders.clear();
    this._faltung?.veraltet();
    this.zeichne();
  }
  _setze(i, wert) {
    if (wert === this._basis) this._anders.delete(i); else this._anders.add(i);
    const k = this.kopien[i];
    if (k) k.firstChild.checked = wert;
  }
  _wandere(i) {
    this._basis = false;
    this._anders = new Set([i]);
    const n = this.kopien.length;
    if (n < 2) return;
    const weiter = () => {
      const k = this.kopien[(i = (i + 1) % this.kopien.length)];
      if (!k) return;
      k.firstChild.checked = true;
      this._anders = new Set([i]);
      if (i !== 0) this._wellen.push(setTimeout(weiter, 60));
    };
    this._wellen.push(setTimeout(weiter, 60));
  }
}
registriere('inf-check', InfCheck);
