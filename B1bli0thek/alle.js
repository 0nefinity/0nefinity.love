// Sammel-Modul: registriert alle Elemente. Ein neues Element = eine Zeile in `elemente`.
// Einbinden: <script type="module" src="./alle.js"></script>, dann z. B. <inf-button></inf-button>.
import { NAME } from './name.js';
export { NAME };

export const elemente = [
  { gruppe: 'Elemente', tag: 'inf-button', name: 'Button', modul: './inf-button.js' },
  { gruppe: 'Elemente', tag: 'inf-line', name: 'Linie', modul: './inf-line.js' },
  { gruppe: 'Elemente', tag: 'inf-field', name: 'Textfeld', modul: './inf-field.js' },
  { gruppe: 'Elemente', tag: 'inf-check', name: 'Checkbox', modul: './inf-check.js' },
  { gruppe: 'Elemente', tag: 'inf-range', name: 'Schieberegler', modul: './inf-range.js', attribute: { phase: '7' } },
  { gruppe: 'Elemente', tag: 'inf-link', name: 'Link', modul: './inf-link.js' },
  { gruppe: 'Elemente', tag: 'inf-image', name: 'Bild', modul: './inf-image.js' },
  { gruppe: 'Elemente', tag: 'inf-list', name: 'Liste', modul: './inf-list.js' },
  { gruppe: 'Elemente', tag: 'inf-table', name: 'Tabelle', modul: './inf-table.js' },
  { gruppe: 'Elemente', tag: 'inf-box', name: 'Box', modul: './inf-box.js' },
  { gruppe: 'Text', tag: 'inf-text', name: 'Text', modul: './inf-text.js' },
  { gruppe: 'Text', tag: 'inf-letter', name: 'Buchstabe', modul: './inf-letter.js' },
];

// Alle laden; jedes Modul registriert sich selbst. Ein Fehler bricht laut ab.
export const bereit = Promise.all(elemente.map((e) => import(new URL(e.modul, import.meta.url).href)));
bereit.catch((fehler) => { console.error(NAME, fehler); });
