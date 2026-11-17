import { InfElement, registriere } from './kern.js';

// Zeile um Zeile, die Ränder fallen zusammen. Gekrümmt wird die Tabelle zum Rad.
export class InfTable extends InfElement {
  static vorgaben = { ...InfElement.vorgaben, repeat: '∞', angle: 90, space: -1 };
  static eigeneAttribute = ['cols', 'cell'];
  static stil = `
    table { border-collapse: collapse; }
    td { width: var(--zelle, 3rem); height: var(--zelle-h, 2rem); border: 1px solid var(--ui-text-60, rgba(255,255,255,.6));
      text-align: center; font-variant-numeric: tabular-nums; padding: 0 .25rem; }`;

  baueKopie(i) {
    const t = document.createElement('table');
    t.part = 'item';
    const tr = t.insertRow();
    const spalten = Math.max(0, Math.floor(Number(this.getAttribute('cols') ?? 5)) || 0);
    for (let j = 0; j < spalten; j++) tr.insertCell();
    t.dataset.zeile = i;
    return t;
  }
  fuelleKopie(t, i) {
    const inhalt = this.getAttribute('cell');
    const zellen = t.rows[0].cells;
    for (let j = 0; j < zellen.length; j++) zellen[j].textContent = inhalt === 'index' ? `${i},${j}` : (inhalt ?? '');
  }
  attributGeaendert() { for (const k of this.kopien.splice(0)) k.remove(); }
}
registriere('inf-table', InfTable);
