// Gemeinsame Basis aller Elemente: wiederholen, verschieben, krümmen, skalieren.
// Jede Kopie i liegt auf einem Pfad: Schrittweite * scale^i, Richtung angle + i * bend.
// scale < 1 läuft in einen Fluchtpunkt (Unendlichkeit im Endlichen), bend != 0 krümmt zu Bogen und Spirale.

import { Faltung, FORMEN_MAX } from './faltung.js';

const UNENDLICH = new Set(['∞', 'inf', 'unendlich', 'infinity']);
// Darunter geht ∞ nie: 720, zwei volle Umdrehungen. Darüber entscheidet das Gerät, der Rest ist mitgemeint.
const DECKEL = 720;
const PROBE_BILDER = 6;
// Technischer Schutz für echte DOM-Kopien (Knoten und Speicher bleiben beschränkt).
const KAPAZITAET_MAX = 6000;
// Technischer Schutz für gefaltete Kopien: 2^22 Orte, je 16 Byte.
const FALT_MAX = 1 << 22;
// Pro Messdurchgang so viele Kopien vorausbauen: ein Reflow je Stapel statt einer je Kopie.
const STAPEL = 64;
// Welchen Teil eines Bildes ein Zug verbrauchen darf: ∞ lässt dem Rest der Seite Luft, ∞+ (capacity) schöpft aus.
const ANTEIL = 0.35, ANTEIL_VOLL = 0.8;

// Die Bildrate des Geräts, einmal gemessen: Median der Abstände von zwölf leeren Bildern. Ziel ist sie, nicht 60.
let BUDGET = 1000 / 60;
{
  const t = [];
  let davor = 0;
  const bild = (ts) => {
    if (davor) t.push(ts - davor);
    davor = ts;
    if (t.length < 12) { requestAnimationFrame(bild); return; }
    t.sort((a, b) => a - b);
    BUDGET = Math.min(50, Math.max(4, t[6]));
  };
  requestAnimationFrame(bild);
}

const gemeldet = new Set();
const BASIS_ATTRIBUTE = new Set(['repeat', 'bend', 'scale', 'angle', 'space', 'gap', 'shift', 'rotate', 'capacity']);

const GRUNDSTIL = `
:host { display: block; position: relative; height: 16rem; overflow: hidden; white-space: normal; line-height: normal;
  color: var(--text-color, white); font-family: var(--font-family, system-ui, sans-serif);
  -webkit-tap-highlight-color: transparent; touch-action: none; user-select: none; -webkit-user-select: none; }
:host([hidden]) { display: none; }
.buehne { position: absolute; inset: 0; outline: none; }
.kopie { position: absolute; left: 0; top: 0; transform-origin: 0 0; white-space: nowrap; }
.kopie[hidden] { display: none !important; }
.faltung { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.leiste { position: absolute; left: calc(50% + var(--leiste-versatz, 0px)); bottom: calc(.5rem + var(--leiste-hoch, 0px)); transform: translateX(-50%); display: flex; flex-wrap: wrap; justify-content: center; max-width: calc(100% - 1rem); gap: .25rem; z-index: 1; }
.leiste button { all: unset; box-sizing: border-box; min-width: 44px; height: 44px; padding: 0 .5rem;
  display: inline-flex; align-items: center; justify-content: center; text-align: center; cursor: pointer;
  border-radius: 4px; color: var(--ui-text-80, rgba(255,255,255,.8)); background: var(--ui-fill-05, rgba(255,255,255,.05));
  font: inherit; font-size: 1.125rem; line-height: 1; touch-action: manipulation; }
.leiste button:active { background: var(--ui-fill-20, rgba(255,255,255,.2)); }
@media (hover: hover) { .leiste button:hover { background: var(--ui-fill-10, rgba(255,255,255,.1)); color: var(--text-color, white); } }
.leiste button:focus-visible { outline: 1px solid var(--text-color, white); outline-offset: 2px; }
:host([bare]) .leiste { display: none; }
`;

const zahl = (wert, ersatz) => {
  if (wert === null || wert === undefined || wert === '') return ersatz;
  const n = Number(wert);
  return Number.isFinite(n) ? n : ersatz;
};

export class InfElement extends HTMLElement {
  // Unterklassen überschreiben: Startwerte, eigenes CSS, eine Kopie bauen.
  static vorgaben = { repeat: '∞', bend: 0, scale: 1, angle: 0, space: 8, gap: 'auto', rotate: true };
  static stil = '';
  static get observedAttributes() {
    return ['repeat', 'bend', 'scale', 'angle', 'space', 'gap', 'shift', 'rotate', 'capacity', ...(this.eigeneAttribute || [])];
  }

  constructor() {
    super();
    this._root = this.attachShadow({ mode: 'open' });
    this._root.innerHTML = `<style>${GRUNDSTIL}${this.constructor.stil}</style>
      <div class="buehne" part="stage"></div>
      <div class="leiste" part="controls">
        <button type="button" data-z="0" aria-label="zurück auf eins">0</button>
        <button type="button" data-z="1" aria-label="eins mehr">1</button>
        <button type="button" data-z="∞" aria-label="unendlich">∞</button>
      </div>`;
    this._buehne = this._root.querySelector('.buehne');
    this._kopien = [];
    this._sichtbar = 0;
    this._gezeigt = 0;
    this._cap = DECKEL;
    this._gedeckelt = false;
    this._takt = 0;
    this._ruckler = 0;
    this._probe = null;
    this._masse = [];
    this._orte = new Float32Array(4096);
    this._falten = true;
    this._faltung = null;
    this._zeiger = new Map();
    this._schreibt = false;
    this._geplant = 0;
    this._zustand = {};
    this._leseAttribute();
  }

  connectedCallback() {
    if (this._verbunden) return;
    this._verbunden = true;
    this._groesse = new ResizeObserver(() => { this._masse = []; this._faltung?.veraltet(); this.zeichne(); });
    this._groesse.observe(this);
    this._root.querySelector('.leiste').addEventListener('click', (e) => this._leiste(e));
    this._buehne.addEventListener('pointerdown', (e) => this._runter(e));
    this._buehne.addEventListener('pointermove', (e) => this._bewegt(e));
    this._buehne.addEventListener('pointerup', (e) => this._hoch(e));
    this._buehne.addEventListener('pointercancel', (e) => this._hoch(e));
    this._buehne.addEventListener('click', (e) => {
      if (this._gezogen) { e.stopPropagation(); e.preventDefault(); this._gezogen = false; return; }
      this._weiterreichen(e);
    }, true);
    this._buehne.addEventListener('input', () => { if (this._faltung) { this._faltung.veraltet(); this.zeichne(); } });
    this.addEventListener('wheel', (e) => this._rad(e), { passive: false });
    this.addEventListener('keydown', (e) => this._taste(e));
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
    this.verbunden();
    this.zeichne();
  }

  disconnectedCallback() {
    this._groesse?.disconnect();
    this._verbunden = false;
  }

  attributeChangedCallback(name) {
    if (this._schreibt) return;
    this._leseAttribute();
    if (name === 'capacity' || (name === 'repeat' && this._zustand.unendlich)) this._gedeckelt = false;
    // Wiederholen, krümmen, skalieren ... ändert nur Orte, nie Inhalt oder Maße.
    if (!BASIS_ATTRIBUTE.has(name)) { this._masse = []; this.attributGeaendert(); }
    this.zeichne();
  }

  // Haken für Unterklassen
  verbunden() {}
  attributGeaendert() {}
  baueKopie() { return document.createElement('span'); }
  fuelleKopie() {}

  _leseAttribute() {
    const v = this.constructor.vorgaben;
    const a = (n) => this.getAttribute(n);
    const r = (a('repeat') ?? String(v.repeat)).trim().toLowerCase();
    const sp = a('space');
    const fest = sp === null || sp.trim() === '' || !Number.isFinite(Number(sp)) ? null : Number(sp);
    const schub = (a('shift') || '0 0').trim().split(/[\s,]+/).map((s) => zahl(s, 0));
    this._zustand = {
      unendlich: UNENDLICH.has(r),
      anzahl: UNENDLICH.has(r) ? FALT_MAX : Math.max(0, Math.floor(zahl(r, 1))),
      bend: zahl(a('bend'), v.bend),
      scale: Math.max(0.01, zahl(a('scale'), v.scale)),
      angle: zahl(a('angle'), v.angle),
      space: zahl(a('space'), v.space),
      // Ausdrücklich gesetztes space ist der Schritt selbst: 0 = alle Kopien deckungsgleich. Ohne Attribut: Abstand aus der Größe.
      gap: a('gap') !== null || fest === null ? ((a('gap') ?? String(v.gap)) === 'auto' ? null : zahl(a('gap') ?? v.gap, null)) : fest,
      dx: schub[0] || 0,
      dy: schub[1] ?? 0,
      rotate: a('rotate') === null ? v.rotate : a('rotate') !== 'false',
      kapazitaet: a('capacity') !== null && a('capacity') !== 'false',
    };
  }

  // Zustand als Attribute zurückschreiben: die Attribute sind die API.
  _schreibe() {
    const z = this._zustand;
    const rund = (n) => String(Math.round(n * 1000) / 1000);
    this._schreibt = true;
    this.setAttribute('repeat', z.unendlich ? '∞' : String(z.anzahl));
    this.setAttribute('bend', rund(z.bend));
    this.setAttribute('scale', rund(z.scale));
    this.setAttribute('shift', `${rund(z.dx)} ${rund(z.dy)}`);
    this._schreibt = false;
    this.dispatchEvent(new CustomEvent('inf-change', { bubbles: true, composed: true, detail: this.zustand }));
  }

  get zustand() {
    const z = this._zustand;
    return { repeat: z.unendlich ? '∞' : z.anzahl, bend: z.bend, scale: z.scale, angle: z.angle, shift: [z.dx, z.dy] };
  }

  // Öffentliche Befehle
  mehr(n = 1) { const z = this._zustand; if (!z.unendlich) z.anzahl = Math.max(0, z.anzahl + n); this._schreibe(); this.zeichne(); }
  // Endliche Anzahl setzen (Feld "Anzahl"). Mehr, als das Gerät flüssig schafft, bleibt mitgemeint: gezeigt wird so viel wie geht.
  setzeAnzahl(n) {
    const z = this._zustand;
    z.unendlich = false;
    z.anzahl = Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(n)));
    this._schreibe(); this.zeichne();
  }
  // Wie viele Kopien gerade gezeigt werden (bei ∞ laufend die der adaptiven Regelung) und wie viele gewollt sind.
  get gezaehlt() { return { gezeigt: this._gezeigt, ziel: this._zustand.unendlich ? '∞' : this._zustand.anzahl }; }
  unendlich() { const z = this._zustand; z.unendlich = true; z.anzahl = FALT_MAX; this._gedeckelt = false; this._schreibe(); this.zeichne(); }
  eins() { if (this._zustand.unendlich) { this._zustand.unendlich = false; this._zustand.anzahl = this._gezeigt; } this.mehr(1); }
  ursprung() {
    const v = this.constructor.vorgaben;
    Object.assign(this._zustand, { unendlich: false, anzahl: 1, bend: v.bend, scale: v.scale, dx: 0, dy: 0 });
    this._schreibe(); this.zeichne();
  }
  kruemme(grad) { this._zustand.bend += grad; this._schreibe(); this.zeichne(); }
  skaliere(faktor) { const z = this._zustand; z.scale = Math.max(0.01, z.scale * faktor); this._schreibe(); this.zeichne(); }
  verschiebe(dx, dy) { const z = this._zustand; z.dx += dx; z.dy += dy; this._schreibe(); this.zeichne(); }

  zeichne() {
    if (!this._verbunden || this._geplant) return;
    this._geplant = requestAnimationFrame((ts) => { this._geplant = 0; this._zug(ts); });
  }

  // Ein Zug: layouten und dabei Zeit und Takt messen. Die Zahl der Kopien folgt dem Gerät, nicht einer Pauschale.
  _zug(ts) {
    const z = this._zustand;
    const t0 = performance.now();
    // Längere Lücken sind meist Ruhe, kein Ruckeln; nur wenn der Regler selbst den nächsten Zug bestellt hat, zählt jede.
    const takt = this._takt && (this._kette || ts - this._takt < 250) ? ts - this._takt : 0;
    this._takt = ts;
    this._kette = false;
    const vorher = this._kopien.length;
    const voll = this._layout();
    // Der Aufbau neuer Kopien zählt nicht: erst der Zug danach misst nur das Layout.
    if (this._kopien.length > vorher) { this._kette = true; this.zeichne(); return; }
    const dauer = performance.now() - t0;
    // Was die Grafikkarte zu lange braucht, sieht man nicht an der Zugzeit, nur am Takt.
    // Einzelne Ausreißer verzeihen, Ruckeln jedes zweiten Bilds nicht: ein guter Takt zieht nur einen halben ab.
    this._ruckler = takt > BUDGET * 1.5 ? this._ruckler + 1 : Math.max(0, this._ruckler - 0.5);
    const anteil = (z.kapazitaet ? ANTEIL_VOLL : ANTEIL) * BUDGET;
    const max = this._P ? FALT_MAX : KAPAZITAET_MAX;
    const m = performance.memory;
    const speicherknapp = !this._faltung && m && m.usedJSHeapSize > m.jsHeapSizeLimit * 0.6;
    const schlecht = dauer > anteil || takt > BUDGET * 1.5 || speicherknapp;
    const probe = this._probe;
    if (probe && this._cap > probe.gut && schlecht) {
      // Der Probeschritt war zu viel: sofort zurück auf den letzten guten Stand, kein Nachlauf über mehrere Bilder.
      this._cap = probe.gut;
      this._probe = null;
      this._gedeckelt = true;
      this._ruckler = 0;
      this._kette = true;
      this.zeichne();
    } else if (this._cap > DECKEL && (dauer > anteil || this._ruckler >= 3 || speicherknapp)) {
      this._cap = Math.max(DECKEL, Math.floor(this._cap / 1.5));
      this._probe = null;
      this._gedeckelt = true;
      this._ruckler = 0;
      this._kette = true;
      this.zeichne();
    } else if (probe && probe.warte > 0) {
      // Die Grafikkarte zeigt ihre Last erst verzögert am Takt: ein Schritt gilt erst nach einigen guten Bildern.
      probe.warte--;
      this._kette = true;
      this.zeichne();
    } else if (voll && !this._gedeckelt && this._ruckler < 1 && this._cap < max && dauer < anteil / 2) {
      // Ohne gemessenen Takt erst einen Zug zum Messen, dann wachsen.
      if (takt) {
        this._probe = { gut: this._cap, warte: PROBE_BILDER };
        this._cap = Math.min(max, Math.ceil(this._cap * 1.5));
      }
      this._kette = true;
      this.zeichne();
    } else {
      this._probe = null;
    }
  }

  get kapazitaet() { return this._cap; }

  // Wie viele Formen sich wiederholen. 0 = keine Faltung, jede Kopie bleibt echtes DOM.
  get periode() { return this.constructor.periode || 0; }

  _faltFehler(e) {
    if (!gemeldet.has(e.message)) { gemeldet.add(e.message); console.error(e); }
    this._falten = false;
    this._faltung?.weg_();
    this._faltung = null;
    this._masse = [];
    this._cap = Math.min(this._cap, KAPAZITAET_MAX);
    this.zeichne();
  }

  // Wieviele Kopien sichtbar bleiben: bei ∞ bis aus dem Bild, unter einen halben Pixel oder ein Kreis geschlossen ist.
  // Die ersten P Kopien (eine Periode) sind DOM, alle weiteren nur noch Orte: x, y, Drehung, Größe.
  _layout() {
    const z = this._zustand;
    const breite = this.clientWidth, hoehe = this.clientHeight;
    if (!breite || !hoehe) return false;
    const per = this._falten ? this.periode : 0;
    const P = (this._P = per > 0 && per <= FORMEN_MAX ? per : 0);
    const diag = Math.hypot(breite, hoehe);
    const mx = breite / 2 + z.dx, my = hoehe / 2 + z.dy;
    const kreis = z.unendlich && z.scale === 1 && z.bend !== 0 ? Math.ceil(360 / Math.abs(z.bend)) : Infinity;
    const grenze = this._cap;
    const ziel = Math.min(z.anzahl, grenze, kreis);
    this._ziel = P ? Math.min(ziel + 1, P) : ziel + 1;
    const masse = this._masse;
    const GRAD = Math.PI / 180;
    const fern = Math.hypot(z.dx, z.dy) + diag * 0.6;
    const fern2 = fern * fern, weit2 = (diag * 1.2) ** 2, riesig = diag * 4;
    const ca = Math.abs(Math.cos(z.angle * GRAD)), sa = Math.abs(Math.sin(z.angle * GRAD));
    // Die Richtung dreht je Schritt um bend: statt cos/sin je Kopie eine Drehung des Vorgängers.
    let c = Math.cos(z.angle * GRAD), sn = Math.sin(z.angle * GRAD);
    const cb = Math.cos(z.bend * GRAD), sb = Math.sin(z.bend * GRAD);
    const lang = (m, cc, ss) => (z.rotate ? ca * m.w + sa * m.h : Math.abs(cc) * m.w + Math.abs(ss) * m.h);
    let orte = this._orte;
    let x = mx, y = my, s = 1, r = 0, n = 0, smax = 0;
    let m = ziel > 0 ? masse[0] || this._mass(0) : null;
    for (let i = 0; i < Infinity && i < ziel; i++) {
      if (z.unendlich && i > 0) {
        const gx = x - breite / 2, gy = y - hoehe / 2, weg2 = gx * gx + gy * gy;
        if (s * m.gross < 0.5 || s * m.gross > riesig || (weg2 > weit2 && weg2 > fern2)) break;
      }
      if (n * 4 + 4 > orte.length) { const neu = new Float32Array(orte.length * 2); neu.set(orte); orte = this._orte = neu; }
      const o = n * 4;
      orte[o] = x; orte[o + 1] = y; orte[o + 2] = z.rotate ? r : 0; orte[o + 3] = s;
      n++;
      if (i >= P && s > smax) smax = s;
      const j = i + 1, mj = P ? j % P : j;
      const naechstes = j < ziel ? (masse[mj] || this._mass(mj)) : m;
      let c2 = c * cb - sn * sb, s2 = sn * cb + c * sb;
      if ((j & 1023) === 0) { const l = Math.hypot(c2, s2); c2 /= l; s2 /= l; }
      const schritt = z.gap ?? ((lang(m, c, sn) + lang(naechstes, c2, s2)) / 2 + z.space);
      x += c * schritt * s;
      y += sn * schritt * s;
      s *= z.scale;
      r += z.bend * GRAD;
      c = c2; sn = s2;
      m = naechstes;
    }
    const dom = P ? Math.min(n, P) : n;
    this._abgleich(dom);
    for (let i = 0; i < dom; i++) {
      const o = i * 4;
      const k = this._kopien[i];
      const mi = masse[i];
      const t = `translate(${orte[o]}px,${orte[o + 1]}px) rotate(${orte[o + 2] / GRAD}deg) scale(${orte[o + 3]}) translate(${-mi.w / 2}px,${-mi.h / 2}px)`;
      if (k._t !== t) { k._t = t; k.style.transform = t; }
    }
    if (P && n > P) {
      if (!this._faltung) {
        try { this._faltung = new Faltung(this); } catch (e) { this._faltFehler(e); return false; }
      }
      this._faltung.zeichne(orte, P, n, breite, hoehe, smax);
    } else this._faltung?.leer();
    if (this._gezeigt !== n || this._zaehlZiel !== z.anzahl || this._zaehlInf !== z.unendlich) {
      this._gezeigt = n; this._zaehlZiel = z.anzahl; this._zaehlInf = z.unendlich;
      this.dispatchEvent(new CustomEvent('inf-zaehl', { bubbles: true, composed: true, detail: this.gezaehlt }));
    }
    this.nachLayout(dom);
    // voll: die Grenze war der Grund aufzuhören, es gäbe mehr zu zeigen.
    return n >= grenze;
  }

  nachLayout() {}

  // Klick auf ein Spiegelbild: die oberste getroffene Kopie suchen und den Klick an ihre echte Vorlage weiterreichen.
  _weiterreichen(e) {
    const P = this._faltung ? this._P : 0;
    if (!P || this._weiter || this._gezeigt <= P) return;
    const b = this._buehne.getBoundingClientRect();
    const px = e.clientX - b.left, py = e.clientY - b.top;
    const orte = this._orte;
    for (let i = this._gezeigt - 1; i >= P; i--) {
      const o = i * 4, m = this._masse[i % P];
      if (!m) return;
      const c = Math.cos(orte[o + 2]), s = Math.sin(orte[o + 2]);
      const dx = px - orte[o], dy = py - orte[o + 1];
      const lx = (c * dx + s * dy) / orte[o + 3] + m.w / 2, ly = (-s * dx + c * dy) / orte[o + 3] + m.h / 2;
      if (lx < 0 || ly < 0 || lx > m.w || ly > m.h) continue;
      const vorlage = this._kopien[i % P];
      if (!vorlage || vorlage.contains(e.target)) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      // Derselbe Punkt auf der Vorlage: dort liegt, was getroffen gewesen wäre.
      const v = (i % P) * 4, cv = Math.cos(orte[v + 2]), sv = Math.sin(orte[v + 2]), sk = orte[v + 3];
      const qx = lx - m.w / 2, qy = ly - m.h / 2;
      const zx = b.left + orte[v] + sk * (cv * qx - sv * qy), zy = b.top + orte[v + 1] + sk * (sv * qx + cv * qy);
      const ziel = this._root.elementsFromPoint(zx, zy).find((x) => vorlage.contains(x)) || vorlage;
      this._weiter = true;
      try {
        if (ziel.matches('input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea')) ziel.focus();
        else ziel.click();
      } finally { this._weiter = false; }
      return;
    }
  }

  // Kopien 0..n-1 sind da und sichtbar, nie weniger als vorher (Vorausbau beim Messen).
  _bis(n) {
    const pool = this._kopien;
    for (let i = this._sichtbar; i < n; i++) {
      let k = pool[i];
      if (k) { k.hidden = false; this.fuelleKopie(k, i); continue; }
      k = this.baueKopie(i);
      k.classList.add('kopie');
      k.dataset.i = i;
      this.fuelleKopie(k, i);
      // Unter die Faltung: die Spiegelbilder liegen wie bisher die späteren Kopien obenauf.
      this._buehne.insertBefore(k, this._faltung?.leinwand ?? null);
      pool.push(k);
    }
    if (n > this._sichtbar) this._sichtbar = n;
  }

  // Genau n Kopien zeigen. Der Rest bleibt versteckt im Pool, so wackelt die Zahl ohne DOM-Umbau.
  _abgleich(n) {
    this._bis(n);
    const pool = this._kopien;
    for (let i = n; i < this._sichtbar; i++) pool[i].hidden = true;
    this._sichtbar = n;
    while (pool.length > Math.max(n, DECKEL)) pool.pop().remove();
  }

  leereKopien() {
    for (const k of this._kopien.splice(0)) k.remove();
    this._sichtbar = 0;
    this._masse = [];
    this._faltung?.veraltet();
  }

  // Maße einer Kopie ohne Transformation. Kopien werden einmal gemessen und gecacht, stapelweise.
  _mass(i) {
    let m = this._masse[i];
    if (!m) {
      const bis = Math.max(i + 1, Math.min(i + STAPEL, this._ziel || 0));
      this._bis(bis);
      for (let j = i; j < bis; j++) {
        if (this._masse[j]) continue;
        const k = this._kopien[j];
        const w = k.offsetWidth, h = k.offsetHeight;
        this._masse[j] = { w, h, gross: Math.max(w, h, 1) };
      }
      m = this._masse[i];
    }
    return m;
  }

  vermessen() { this._masse = []; this._faltung?.veraltet(); this.zeichne(); }
  get kopien() { return this._kopien.slice(0, this._sichtbar); }

  _leiste(e) {
    const b = e.target.closest('button[data-z]');
    if (!b) return;
    const z = b.dataset.z;
    if (z === '0') this.ursprung();
    else if (z === '1') this.eins();
    else this.unendlich();
  }

  // Ein Finger zieht = verschieben. Zwei Finger: drehen = krümmen, spreizen = skalieren.
  _zieht(ziel) {
    return !ziel.closest?.('input[type="range"], input[type="text"], input[type="search"], input:not([type]), textarea, [contenteditable]');
  }

  _runter(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const zweiter = this._zeiger.size === 1;
    if (!this._zieht(e.target) && !zweiter) return;
    this._zeiger.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
    this._gezogen = false;
    if (this._zeiger.size === 2) this._zweiStart();
  }

  _zweiStart() {
    const [a, b] = [...this._zeiger.values()];
    this._paar = { w: Math.atan2(b.y - a.y, b.x - a.x), d: Math.hypot(b.x - a.x, b.y - a.y) || 1, bend: this._zustand.bend, scale: this._zustand.scale };
    this._gezogen = true;
    for (const id of this._zeiger.keys()) { try { this._buehne.setPointerCapture(id); } catch { /* Zeiger schon weg */ } }
  }

  _bewegt(e) {
    const p = this._zeiger.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (this._zeiger.size === 1) {
      if (!this._gezogen && Math.hypot(p.x - p.x0, p.y - p.y0) < 6) return;
      if (!this._gezogen) { this._gezogen = true; try { this._buehne.setPointerCapture(e.pointerId); } catch { /* Zeiger schon weg */ } }
      const z = this._zustand;
      z.dx += dx;
      z.dy += dy;
      this._schreibe(); this.zeichne();
    } else if (this._zeiger.size === 2 && this._paar) {
      const [a, b] = [...this._zeiger.values()];
      const w = Math.atan2(b.y - a.y, b.x - a.x), d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      let dw = ((w - this._paar.w) * 180) / Math.PI;
      if (dw > 180) dw -= 360; if (dw < -180) dw += 360;
      this._zustand.bend = this._paar.bend + dw * 0.25;
      this._zustand.scale = Math.max(0.01, this._paar.scale * Math.pow(d / this._paar.d, 0.15));
      this._schreibe(); this.zeichne();
    }
  }

  _hoch(e) {
    this._zeiger.delete(e.pointerId);
    if (this._zeiger.size < 2) this._paar = null;
    if (this._zeiger.size === 0 && e.type === 'pointercancel') this._gezogen = false;
  }

  // Rad krümmt, mit Umschalt/Strg (auch Trackpad-Spreizen) skaliert es.
  _rad(e) {
    e.preventDefault();
    const d = Math.max(-100, Math.min(100, e.deltaY || e.deltaX));
    if (e.ctrlKey || e.shiftKey || e.metaKey) this.skaliere(Math.exp(-d * 0.002));
    else this.kruemme(d * 0.02);
  }

  _taste(e) {
    // Im Shadow DOM zeigt target am Host immer auf den Host selbst: der wirkliche Ursprung steht in composedPath.
    // Ein Eingabefeld (auch eine der Kopien) behält jede Taste.
    const ursprung = e.composedPath()[0];
    if (ursprung !== this || e.altKey || e.ctrlKey || e.metaKey) return;
    const schritt = e.shiftKey ? 40 : 8;
    const tasten = {
      ArrowLeft: () => this.verschiebe(-schritt, 0), ArrowRight: () => this.verschiebe(schritt, 0),
      ArrowUp: () => this.verschiebe(0, -schritt), ArrowDown: () => this.verschiebe(0, schritt),
      '+': () => this.mehr(1), '-': () => this.mehr(-1), '0': () => this.ursprung(), '8': () => this.unendlich(),
      '[': () => this.kruemme(-1), ']': () => this.kruemme(1), ',': () => this.skaliere(0.98), '.': () => this.skaliere(1 / 0.98),
    };
    const f = tasten[e.key];
    if (f) { e.preventDefault(); f(); }
  }
}

// Gemeinsame Eingabefeld-Attribute: nie Autofill/Passwortleiste auslösen.
export function ohneAutofill(feld) {
  for (const [k, v] of [['autocomplete', 'off'], ['autocorrect', 'off'], ['spellcheck', 'false'], ['autocapitalize', 'off'],
    ['data-1p-ignore', ''], ['data-lpignore', 'true'], ['data-bwignore', ''], ['data-form-type', 'other'], ['data-protonpass-ignore', 'true']]) feld.setAttribute(k, v);
  return feld;
}

export function registriere(name, klasse) {
  if (!customElements.get(name)) customElements.define(name, klasse);
}

export const STEUERSTIL = `
.ziel { min-width: 44px; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; }
:where(button.ding, a.ding) { all: unset; }
button.ding, a.ding { box-sizing: border-box; cursor: pointer; min-width: 44px; min-height: 44px; padding: 0 1rem;
  display: inline-flex; align-items: center; justify-content: center; border-radius: 4px; font: inherit; color: var(--text-color, white);
  border: 1px solid var(--ui-text-60, rgba(255,255,255,.6)); background: transparent; touch-action: manipulation; }
button.ding:active { background: var(--ui-fill-20, rgba(255,255,255,.2)); }
@media (hover: hover) { button.ding:hover { background: var(--ui-fill-10, rgba(255,255,255,.1)); } }
button.ding:focus-visible, a.ding:focus-visible, input:focus-visible, textarea:focus-visible { outline: 1px solid var(--text-color, white); outline-offset: 2px; }
input, textarea { color-scheme: dark; accent-color: var(--text-color, white); }
`;
