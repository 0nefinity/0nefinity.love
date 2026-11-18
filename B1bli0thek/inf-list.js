import { InfElement, registriere } from './kern.js';

// Eine Liste, die nicht aufhört zu zählen.
export class InfList extends InfElement {
  static vorgaben = { ...InfElement.vorgaben, repeat: '∞', angle: 90, space: 4 };
  static eigeneAttribute = ['type', 'text', 'marker'];
  static stil = `
    .liste { margin: 0; padding: 0; list-style-position: inside; }
    .liste li { min-height: 1.5em; line-height: 1.5; }
    ul.liste li::marker { content: var(--marker, '• '); }`;

  baueKopie() {
    const l = document.createElement(this.getAttribute('type') === 'ul' ? 'ul' : 'ol');
    l.className = 'liste';
    l.part = 'item';
    l.append(document.createElement('li'));
    return l;
  }
  fuelleKopie(l, i) {
    const li = l.firstChild;
    li.value = i + 1;
    li.textContent = this.getAttribute('text') ?? '';
    const m = this.getAttribute('marker');
    if (m !== null) l.style.setProperty('--marker', JSON.stringify(m + ' '));
  }
  // Aufzählungspunkte wiederholen sich, Nummern nie: nur die ungeordnete Liste hat eine Periode.
  get periode() { return this.getAttribute('type') === 'ul' ? 1 : 0; }
  attributGeaendert() { this.leereKopien(); }
}
registriere('inf-list', InfList);
