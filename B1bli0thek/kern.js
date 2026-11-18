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
// So viele Zeichnungen schafft auch eine schwache Grafikkarte in einem Bild; mehr wird nie verlangt.
const INSTANZEN_MAX = 1 << 20;
// Jede endliche Eingabe bleibt endlich: was weiter reicht als WEIT, wirkt wie WEIT (rechnen ließe sich damit nur noch Infinity).
const WEIT = 1e9;
const klemme = (n, w) => (n === null ? null : Math.min(w, Math.max(-w, n)));
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
const TAU = 2 * Math.PI;
// Ein Winkel auf den Kreis gefaltet: -π..π. Wie oft man schon herum ist, vergisst er.
const mitte = (x) => x - TAU * Math.round(x / TAU);
const ggt = (x, y) => (y ? ggt(y, x % y) : x);
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
    this._gemalt = 0;
    this._grund = null;
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
    // Browser halten nur wenige WebGL-Kontexte; wer geht, gibt seinen frei (beim Zurückkommen entsteht ein neuer).
    this._faltung?.weg_();
    this._faltung = null;
  }

  attributeChangedCallback(name) {
    if (this._schreibt) return;
    this._leseAttribute();
    if (name === 'capacity' || (name === 'repeat' && this._zustand.unendlich)) this._gedeckelt = false;
    // Wiederholen, krümmen, skalieren ... ändert nur Orte, nie Inhalt oder Maße.
    if (!BASIS_ATTRIBUTE.has(name)) { this._masse = []; this.attributGeaendert(); }
    // Nach jeder Änderung meldet der nächste Zug den Schritt neu, auch wenn er gleich bleibt: wer zwischendurch
    // ungezeichnet nachgefragt hat (inf-change), soll nicht auf einem Zwischenstand stehen bleiben.
    this._zaehlSchritt = NaN;
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
    const fest = sp === null || sp.trim() === '' || !Number.isFinite(Number(sp)) ? null : klemme(Number(sp), WEIT);
    const schub = (a('shift') || '0 0').trim().split(/[\s,]+/).map((s) => klemme(zahl(s, 0), WEIT));
    this._zustand = {
      unendlich: UNENDLICH.has(r),
      anzahl: UNENDLICH.has(r) ? FALT_MAX : Math.max(0, Math.floor(zahl(r, 1))),
      bend: klemme(zahl(a('bend'), v.bend), WEIT),
      scale: Math.min(1e6, Math.max(0.01, zahl(a('scale'), v.scale))),
      angle: klemme(zahl(a('angle'), v.angle), WEIT),
      space: klemme(zahl(a('space'), v.space), WEIT),
      // Ausdrücklich gesetztes space ist der Schritt selbst: 0 = alle Kopien deckungsgleich. Ohne Attribut: Abstand aus der Größe.
      gap: a('gap') !== null || fest === null ? ((a('gap') ?? String(v.gap)) === 'auto' ? null : klemme(zahl(a('gap') ?? v.gap, null), WEIT)) : fest,
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
  // grund: null, wenn das Bild bei ∞ das unendliche ist; sonst ein Wort, warum es nur gezeigt viele sind.
  get gezaehlt() { return { gezeigt: this._gezeigt, ziel: this._zustand.unendlich ? '∞' : this._zustand.anzahl, grund: this._grund }; }
  unendlich() { const z = this._zustand; z.unendlich = true; z.anzahl = FALT_MAX; this._gedeckelt = false; this._schreibe(); this.zeichne(); }
  // ∞ + 1 = ∞: im ∞-Zustand ändert 1 nichts an der Zahl (mehr() lässt ∞ stehen).
  eins() { this.mehr(1); }
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

  // Verlorener Kontext: neue Leinwand, neuer Kontext. Erst wer ihn dauernd verliert, bleibt beim DOM.
  _faltVerlust() {
    const jetzt = performance.now();
    this._verluste = (this._verluste || []).filter((t) => jetzt - t < 10000);
    this._verluste.push(jetzt);
    this._faltung?.weg_();
    this._faltung = null;
    if (this._verluste.length > 3) this._faltFehler(new Error('B1bli0thek: WebGL-Kontext dauernd verloren, DOM-Weg'));
    else this.zeichne();
  }

  _faltFehler(e) {
    if (this._faltung?.gl.isContextLost()) return; // webglcontextlost kommt und baut neu auf
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
    // Wiederholt sich der Schritt mit der Periode, ist der Pfad eine geschlossene Formel: die Grafikkarte rechnet die Orte.
    if (P && (z.unendlich || z.anzahl > P) && (z.rotate || z.bend === 0 || z.gap !== null)) return this._bahnLayout(P, breite, hoehe);
    this._b = null;
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
    let x = mx, y = my, s = 1, r = 0, n = 0, smax = 0, raus = false;
    let m = ziel > 0 ? masse[0] || this._mass(0) : null;
    for (let i = 0; i < Infinity && i < ziel; i++) {
      if (z.unendlich && i > 0) {
        const gx = x - breite / 2, gy = y - hoehe / 2, weg2 = gx * gx + gy * gy;
        if (weg2 > weit2 && weg2 > fern2) { raus = true; break; }
        if (s * m.gross < 0.5 || s * m.gross > riesig) break;
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
    if (!z.unendlich) this._zaehle(n);
    else {
      // Exakt ∞ ist hier nur die gerade Reihe, die das Bild verlässt (dahinter kommt nichts mehr ins Bild),
      // und der Kreis, der sich nach ganzen Schritten schließt (jede weitere Kopie liegt auf einer gezeichneten).
      const runde = 360 / Math.abs(z.bend);
      const exakt = z.scale === 1 && ((z.bend === 0 && raus) || (Number.isInteger(runde) && n >= kreis));
      this._zaehle(exakt ? Infinity : n, n, exakt ? null : P ? 'schwingt' : 'DOM');
    }
    this.nachLayout(dom);
    // voll: die Grenze war der Grund aufzuhören, es gäbe mehr zu zeigen.
    return n >= grenze;
  }

  nachLayout() {}

  // Die Bahn als Formel. z_r (r < 2P) wird einmal in double gegangen, danach gilt für Kopie i = q*P + r:
  //   Ort z_r + D_r * (W^q - 1) / (W - 1), Drehung i * bend, Größe scale^i, mit D_r = z_(r+P) - z_r und W = scale^P * e^(i*P*bend).
  // Gezählt wird alles, was es gibt (auch neben dem Bild), gezeichnet nur, was ins Bild fallen kann.
  _bahnLayout(P, breite, hoehe) {
    const z = this._zustand;
    this._ziel = P;
    const masse = this._masse;
    for (let j = 0; j < P; j++) masse[j] || this._mass(j);
    const GRAD = Math.PI / 180;
    const a0 = z.angle * GRAD, be = z.bend * GRAD;
    const ca = Math.abs(Math.cos(a0)), sa = Math.abs(Math.sin(a0));
    const lang = (m) => ca * m.w + sa * m.h;
    const ls = Math.log(z.scale);
    const zx = new Float64Array(2 * P + 1), zy = new Float64Array(2 * P + 1);
    zx[0] = breite / 2 + z.dx; zy[0] = hoehe / 2 + z.dy;
    for (let i = 0; i < 2 * P; i++) {
      const r = i % P;
      const schritt = z.gap ?? ((lang(masse[r]) + lang(masse[(r + 1) % P])) / 2 + z.space);
      const w = a0 + i * be, f = schritt * Math.exp(i * ls);
      zx[i + 1] = zx[i] + Math.cos(w) * f;
      zy[i + 1] = zy[i] + Math.sin(w) * f;
    }
    const dx = new Float64Array(P), dy = new Float64Array(P);
    for (let r = 0; r < P; r++) { dx[r] = zx[r + P] - zx[r]; dy[r] = zy[r + P] - zy[r]; }
    const a = P * ls, bm = mitte(P * be), sh = Math.sin(bm / 2);
    const wx = Math.expm1(a) * Math.cos(bm) - 2 * sh * sh, wy = Math.exp(a) * Math.sin(bm);
    const nn = wx * wx + wy * wy;
    const eins = nn < 1e-28;
    const ix = eins ? 0 : wx / nn, iy = eins ? 0 : -wy / nn;
    const fx = new Float64Array(P), fy = new Float64Array(P), h = new Float64Array(P);
    const rand = (this._faltung?.rand ?? 8) + 2;
    for (let r = 0; r < P; r++) {
      fx[r] = zx[r] - (dx[r] * ix - dy[r] * iy);
      fy[r] = zy[r] - (dx[r] * iy + dy[r] * ix);
      h[r] = Math.hypot(masse[r].w, masse[r].h) / 2 + rand;
    }
    const diag = Math.hypot(breite, hoehe);
    // Bis zu welcher Kopie i Form r groß genug (bzw. klein genug) bleibt.
    const bis = (r, grenze) => Math.log(grenze / masse[r].gross) / ls;
    // ∞ ist ∞: gezählt wird nie eine Abbruchgrenze, nur gezeichnet wird so viel, dass das Bild das Grenzbild ist.
    const N = z.unendlich ? Infinity : z.anzahl;
    let grund = null;
    const B = (this._b = { P, zx, zy, dx, dy, fx, fy, h, eins, a, bm, be, ls, ix, iy, N, lo: 0, hi: 0, teile: [], rotate: z.rotate, stapel: false, m: 0, rest: 0 });

    const dom = Math.min(N, P);
    this._abgleich(dom);
    for (let i = 0; i < dom; i++) {
      const k = this._kopien[i], mi = masse[i], o = this._ort(B, i);
      const t = `translate(${o.x}px,${o.y}px) rotate(${o.rot / GRAD}deg) scale(${o.s}) translate(${-mi.w / 2}px,${-mi.h / 2}px)`;
      if (k._t !== t) { k._t = t; k.style.transform = t; }
    }

    let voll = false, d = null;
    let stillstand = eins;
    for (let r = 0; r < P && stillstand; r++) if (Math.abs(dx[r]) > 1e-9 || Math.abs(dy[r]) > 1e-9) stillstand = false;
    if (N > P && stillstand) {
      // Alle Kopien einer Form liegen aufeinander: der Stapel, Schichten zählt jeder Bildpunkt selbst.
      B.stapel = true;
      B.m = N === Infinity ? -1 : Math.floor((N - P) / P);
      B.rest = N === Infinity ? 0 : (N - P) % P;
      const b = new Float32Array(FORMEN_MAX * 4);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let r = 0; r < P; r++) {
        const rot = z.rotate ? mitte(r * be) : 0;
        b.set([zx[r], zy[r], Math.cos(rot), Math.sin(rot)], r * 4);
        x0 = Math.min(x0, zx[r] - h[r]); y0 = Math.min(y0, zy[r] - h[r]);
        x1 = Math.max(x1, zx[r] + h[r]); y1 = Math.max(y1, zy[r] + h[r]);
      }
      d = { P, b, kasten: [x0, y0, x1, y1], m: B.m, rest: B.rest };
    } else if (N > P) {
      const R = diag / 2, cx = breite / 2, cy = hoehe / 2;
      const dpr = devicePixelRatio || 1;
      // Kreis: bend steht auf 0,001° genau, also schließt sich die Bahn nach b Perioden (P·b·bend ein Vielfaches von 360°).
      // ∞ ist ein Vielfaches jedes Zyklus: eine Runde wird gezeichnet, die Faltung rechnet daraus den unendlichen Stapel.
      let zyklus = 0;
      if (z.unendlich && !eins && a === 0) {
        const k = Math.round(z.bend * 1000);
        if (k !== 0 && Math.abs(z.bend * 1000 - k) < 1e-6) {
          const b = 360000 / ggt((((k * P) % 360000) + 360000) % 360000, 360000);
          if (b * P <= FALT_MAX) zyklus = b;
        }
        if (!zyklus) grund = 'dicht';
      }
      const stuecke = [];
      for (let r = 0; r < P; r++) {
        let qmax = Number.isFinite(N) ? Math.floor((N - 1 - r) / P) : Infinity;
        if (ls < 0) {
          // Schrumpfend: alles ab Kopie qmax bedeckt zusammen weniger als ein 256stel Bildpunkt (geometrische Reihe der Flächen).
          // Kopien unter einem Bildpunkt zeichnet die Grafikkarte als Fleck mit ihrer Fläche, so landet die Dichte am Grenzpunkt.
          const m = masse[r], kasten = (m.w + 2 * rand) * (m.h + 2 * rand) * dpr * dpr;
          const rhs = -Math.expm1(2 * a) / (256 * P * kasten);
          qmax = Math.min(qmax, Math.ceil((Math.log(rhs) / (2 * ls) - r) / P));
        } else if (ls > 0) {
          // Wachsend: ab 64 Bildschirmdiagonalen ist der Bildschirm kleiner als ein halber Texel der Kopie.
          qmax = Math.min(qmax, Math.floor((bis(r, diag * 64) - r) / P));
          // Liegt der Grenzpunkt in der Kopie, sieht jeder Bildpunkt immer denselben Texel, solange die Kopie mitdreht.
          if (z.unendlich && this._qFenster(B, r, cx, cy, R)?.[1] === Infinity && !z.rotate && Math.abs(bm) > 1e-12) grund = 'schwingt';
        } else if (zyklus) qmax = Math.min(qmax, zyklus);
        // ∞ ohne geschlossenen Zyklus: nach einer Runde liegt jede weitere Kopie (fast) auf einer gezeichneten, der Zähler sagt "dicht".
        // Endlich gezählt wird endlich gezeichnet: 3600 Kopien auf einem Kreis, der sich erst nach 1800 schließt, sind 1800 Orte, nicht 13.
        else if (!eins && !Number.isFinite(N)) qmax = Math.min(qmax, Math.ceil(TAU / Math.abs(bm)));
        // Ein riesiger Kreis (winzige Krümmung) berührt das Bild nur in Bögen: am Anfang und am Ende jeder Runde.
        // Gezeichnet werden nur diese Bögen, nie die Milliarden Kopien dazwischen, die weit neben dem Bild liegen.
        for (const w of this._qBereiche(B, r, cx, cy, R, qmax)) {
          const qlo = Math.max(0, Math.ceil(w[0]) - 1), qhi = Math.min(Math.floor(w[1]) + 1, qmax);
          if (!(qlo <= qhi)) continue;
          const von = Math.max(qlo * P + r, P), bis = Math.min(qhi * P + r + 1, N);
          if (von < bis) stuecke.push([von, bis]);
        }
      }
      // Benachbarte Bögen der Formen zu Stücken zusammenlegen; jedes Stück ist ein Zeichenaufruf ab seinem Anfang.
      stuecke.sort((x, y) => x[0] - y[0]);
      const teile = [];
      for (const s of stuecke) {
        const t = teile[teile.length - 1];
        if (t && s[0] <= t[1] + P) t[1] = Math.max(t[1], s[1]);
        else teile.push([s[0], s[1]]);
      }
      // Ausdünnen: liegen aufeinanderfolgende Kopien derselben Form näher als ein Viertel Bildpunkt, ist schon jede S-te
      // das Bild. Gezeichnet wird dann die Bahn mit W^S: gleiches Grenzbild, ein S-tel der Arbeit. So hängt kein Bild an
      // der Kopienzahl, nur an der Fläche, die die Bahn auf dem Bildschirm überstreicht.
      const fein = 0.25 / dpr;
      // Was eine Periode eine Kopie verrückt: der Schritt D und, wenn sie mitdreht, ihre Ecken um bm (dreht sie nur auf
      // der Stelle, ist D = 0 und allein die Drehung bewegt sie).
      let Dmax = 0;
      for (let r = 0; r < P; r++) Dmax = Math.max(Dmax, Math.hypot(dx[r], dy[r]) + (z.rotate ? h[r] * Math.abs(bm) : 0));
      const potenz = (S) => {
        if (eins) return { ok: true, rx: S, ry: 0, inv: [ix, iy], a: S * a, bt: [mitte(S * bm), mitte(256 * S * bm), mitte(65536 * S * bm)] };
        const th = mitte(S * bm), s2 = Math.sin(th / 2);
        const wx2 = Math.expm1(S * a) * Math.cos(th) - 2 * s2 * s2, wy2 = Math.exp(S * a) * Math.sin(th);
        const n2 = wx2 * wx2 + wy2 * wy2;
        // W^S fast 1: S Perioden schließen den Kreis, jede S-te Kopie läge auf derselben Stelle. Dann ein anderes S.
        if (n2 < 1e-20) return { ok: false };
        return { ok: true, rx: wx2 * ix - wy2 * iy, ry: wx2 * iy + wy2 * ix, inv: [wx2 / n2, -wy2 / n2], a: S * a, bt: [th, mitte(256 * th), mitte(65536 * th)] };
      };
      let lueckenlos = teile.length > 0;
      const schritte = teile.map(([lo, hi]) => {
        const sp = Dmax * Math.exp(Math.max(Math.floor(lo / P) * a, Math.ceil(hi / P) * a));
        if (!(sp <= fein)) lueckenlos = false;
        let S = sp > 0 ? Math.floor(fein / sp) : 1;
        S = Math.max(1, Math.min(S, Math.floor((hi - lo) / P)));
        while (S > 1 && !potenz(S).ok) S = Math.floor(S * 0.75);
        return S;
      });
      // Liegen schon in der ersten Runde je zwei Kopien näher als ein Viertel Bildpunkt, füllen weitere Runden nichts
      // mehr auf: das Gezeichnete ist das Grenzbild, der Zähler sagt ∞ statt "dicht".
      if (grund === 'dicht' && !zyklus && lueckenlos) grund = null;
      const instanzen = (t, S) => Math.ceil((t[1] - t[0]) / (S * P)) * P;
      // Bei ∞ regelt kein Takt die Menge, nur die Zeit je Bild: mehr als INSTANZEN_MAX Zeichnungen ist ehrlich nicht ∞.
      let rest = z.unendlich ? INSTANZEN_MAX : this._cap;
      for (let k = 0; k < teile.length; k++) {
        const t = teile[k], S = schritte[k], n = instanzen(t, S);
        if (n < rest) { rest -= n; continue; }
        if (n > rest || k + 1 < teile.length) { if (z.unendlich) grund = 'dicht'; else voll = true; }
        t[1] = Math.min(t[1], t[0] + Math.max(1, rest) * S);
        teile.length = k + 1;
        break;
      }
      if (teile.length) {
        B.teile = teile;
        B.lo = teile[0][0]; B.hi = teile[teile.length - 1][1];
        let smax = 0;
        const stueck = ([lo, hi], k) => {
          const q0 = Math.floor(lo / P), r0 = lo - q0 * P, S = schritte[k];
          const w = S === 1 ? { rx: 1, ry: 0, inv: [ix, iy], a, bt: [bm, mitte(256 * bm), mitte(65536 * bm)] } : potenz(S);
          const b = new Float32Array(FORMEN_MAX * 4), c = new Float32Array(FORMEN_MAX * 2);
          let gx = q0, gy = 0, px = 1, py = 0;
          if (!eins) {
            const th = mitte(q0 * bm), e = Math.exp(q0 * a), s2 = Math.sin(th / 2);
            const ux = Math.expm1(q0 * a) * Math.cos(th) - 2 * s2 * s2, uy = e * Math.sin(th);
            gx = ux * ix - uy * iy; gy = ux * iy + uy * ix;
            px = e * Math.cos(th); py = e * Math.sin(th);
          }
          for (let v = 0; v < P; v++) {
            // D am Anfang des Stücks, mal (W^S - 1)/(W - 1): der Schritt von einer gezeichneten Periode zur nächsten.
            const Dx = dx[v] * px - dy[v] * py, Dy = dx[v] * py + dy[v] * px;
            b.set([zx[v] + dx[v] * gx - dy[v] * gy, zy[v] + dx[v] * gy + dy[v] * gx, Dx * w.rx - Dy * w.ry, Dx * w.ry + Dy * w.rx], v * 4);
            c[v * 2] = z.rotate ? mitte(mitte(q0 * bm) + v * be) : 0;
            c[v * 2 + 1] = (q0 * P + v) * ls;
          }
          smax = Math.max(smax, Math.exp(lo * ls), Math.exp((hi - 1) * ls));
          const anzahl = S === 1 ? hi - lo : instanzen([lo, hi], S) - r0;
          return { r0, anzahl, b, c, inv: w.inv, a: w.a, bt: w.bt };
        };
        d = { P, teile: teile.map(stueck), eins, rotate: z.rotate, runde: zyklus > 0, ix, iy, a, bt: [bm, mitte(256 * bm), mitte(65536 * bm)] };
        d.smax = smax;
      }
    }
    if (d) {
      if (!this._faltung) {
        try { this._faltung = new Faltung(this); } catch (e) { this._faltFehler(e); return false; }
      }
      if (B.stapel) this._faltung.stapel(d, breite, hoehe);
      else {
        try { this._faltung.bahn(d, breite, hoehe, d.smax); } catch (e) { this._faltFehler(e); return false; }
      }
    } else this._faltung?.leer();
    const gemalt = B.stapel || !d ? Math.min(N, P) : B.hi;
    this._zaehle(grund ? gemalt : N, Number.isFinite(N) ? N : gemalt, grund);
    this.nachLayout(dom);
    return voll;
  }

  // Für welche q die Kopie q*P + r den Kreis (cx, cy, R) berühren kann: [von, bis] oder null.
  _qFenster(B, r, cx, cy, R) {
    const hh = B.h[r] * Math.exp(r * B.ls);
    if (B.eins) {
      // Gerade Reihe: |z_r + q*D - c| <= R + h, eine quadratische Ungleichung.
      const ex = B.zx[r] - cx, ey = B.zy[r] - cy, A = B.dx[r] ** 2 + B.dy[r] ** 2;
      const Bq = B.dx[r] * ex + B.dy[r] * ey, C = ex * ex + ey * ey - (R + hh) ** 2;
      if (A < 1e-18) return C <= 0 ? [0, Infinity] : null;
      const disk = Bq * Bq - A * C;
      if (disk < 0) return null;
      const w = Math.sqrt(disk);
      return [(-Bq - w) / A, (-Bq + w) / A];
    }
    if (B.a === 0) return [0, Infinity];
    // Spirale um F: Abstand und Größe wachsen beide mit e^(q*a).
    const rho = Math.hypot(B.zx[r] - B.fx[r], B.zy[r] - B.fy[r]);
    const dd = Math.hypot(B.fx[r] - cx, B.fy[r] - cy);
    const u1 = rho - hh > 0 ? Math.log((dd + R) / (rho - hh)) : Infinity;
    const u2 = dd - R > 0 ? Math.log((dd - R) / (rho + hh)) : -Infinity;
    if (u2 > u1) return null;
    return B.a < 0 ? [u1 / B.a, u2 / B.a] : [u2 / B.a, u1 / B.a];
  }

  // Wie _qFenster, aber für q in [0, qmax] und als Liste: der Kreis (a = 0) läuft um F und berührt das Bild
  // in jeder Runde in einem Bogen um die Richtung zum Bild. Ist der Kreis riesig, sind das wenige Kopien je Runde.
  _qBereiche(B, r, cx, cy, R, qmax) {
    if (B.eins || B.a !== 0) { const w = this._qFenster(B, r, cx, cy, R); return w ? [w] : []; }
    const ex = B.zx[r] - B.fx[r], ey = B.zy[r] - B.fy[r];
    const rho = Math.hypot(ex, ey), dd = Math.hypot(cx - B.fx[r], cy - B.fy[r]), RR = R + B.h[r];
    if (rho < 1e-9 || dd < 1e-9 || rho + dd <= RR) return [[0, Infinity]];
    // Halber Bogenwinkel alpha aus sin²(alpha/2) = (RR² - (rho - dd)²) / (4 rho dd): bleibt genau, auch wenn rho und dd
    // Milliarden Pixel sind und RR nur ein Bildschirm (die Form mit cos verlöre dort alle Stellen).
    const s2 = (RR * RR - (rho - dd) ** 2) / (4 * rho * dd);
    if (s2 <= 0) return [];
    if (s2 >= 1) return [[0, Infinity]];
    const alpha = 2 * Math.asin(Math.sqrt(s2)), beta = Math.abs(B.bm);
    // t wächst mit q: t = t0 + q*beta, sichtbar wo t im Bogen [2πk - alpha, 2πk + alpha] liegt.
    const d0 = mitte(Math.atan2(ey, ex) - Math.atan2(cy - B.fy[r], cx - B.fx[r]));
    const t0 = B.bm < 0 ? -d0 : d0;
    const qende = Number.isFinite(qmax) ? qmax : TAU / beta;
    const k0 = Math.floor((t0 - alpha) / TAU), k1 = Math.ceil((t0 + qende * beta + alpha) / TAU);
    // Viele Runden: der Bogen kommt so oft vorbei, dass ein Fenster über alles ehrlicher ist als tausend Stücke.
    if (k1 - k0 > 64) return [[0, Infinity]];
    const aus = [];
    for (let k = k0; k <= k1; k++) {
      const von = Math.max(0, (TAU * k - alpha - t0) / beta), bis = (TAU * k + alpha - t0) / beta;
      if (bis >= 0 && von <= qende) aus.push([von, bis]);
    }
    return aus;
  }

  // Ort der Kopie i in geschlossener Form.
  _ort(B, i) {
    const q = Math.floor(i / B.P), r = i - q * B.P;
    let gx = q, gy = 0;
    if (!B.eins) {
      const th = mitte(q * B.bm), s2 = Math.sin(th / 2);
      const ux = Math.expm1(q * B.a) * Math.cos(th) - 2 * s2 * s2, uy = Math.exp(q * B.a) * Math.sin(th);
      gx = ux * B.ix - uy * B.iy; gy = ux * B.iy + uy * B.ix;
    }
    return {
      x: B.zx[r] + B.dx[r] * gx - B.dy[r] * gy,
      y: B.zy[r] + B.dx[r] * gy + B.dy[r] * gx,
      rot: B.rotate ? mitte(mitte(q * B.bm) + r * B.be) : 0,
      s: Math.exp(i * B.ls),
    };
  }

  // Wo der Punkt (px, py) in Kopie o liegt, in Koordinaten der Form (0..w, 0..h), oder null.
  _trifft(o, m, px, py) {
    const c = Math.cos(o.rot), s = Math.sin(o.rot);
    const dx = px - o.x, dy = py - o.y;
    const lx = (c * dx + s * dy) / o.s + m.w / 2, ly = (-s * dx + c * dy) / o.s + m.h / 2;
    return lx < 0 || ly < 0 || lx > m.w || ly > m.h ? null : [lx, ly];
  }

  // n gezählt, gemalt davon gezeichnet (DOM mitgezählt), grund wie bei gezaehlt.
  _zaehle(n, gemalt = n, grund = null) {
    const z = this._zustand;
    this._gemalt = gemalt;
    // Auch der gezeichnete Schritt gehört zum Gezählten: dreht der Winkel, ändert sich der Abstand, den der Regler zeigt.
    const schritt = this.schritt;
    if (this._gezeigt !== n || this._grund !== grund || this._zaehlZiel !== z.anzahl || this._zaehlInf !== z.unendlich || this._zaehlSchritt !== schritt) {
      this._gezeigt = n; this._grund = grund; this._zaehlZiel = z.anzahl; this._zaehlInf = z.unendlich; this._zaehlSchritt = schritt;
      this.dispatchEvent(new CustomEvent('inf-zaehl', { bubbles: true, composed: true, detail: this.gezaehlt }));
    }
  }

  // Klick auf ein Spiegelbild: die oberste getroffene Kopie suchen und den Klick an ihre echte Vorlage weiterreichen.
  _weiterreichen(e) {
    if (this._b) { if (this._faltung) this._weiterBahn(e); return; }
    const P = this._faltung ? this._P : 0;
    if (!P || this._weiter || this._gemalt <= P) return;
    const b = this._buehne.getBoundingClientRect();
    const px = e.clientX - b.left, py = e.clientY - b.top;
    const orte = this._orte;
    const ort = (i) => ({ x: orte[i * 4], y: orte[i * 4 + 1], rot: orte[i * 4 + 2], s: orte[i * 4 + 3] });
    for (let i = this._gemalt - 1; i >= P; i--) {
      const m = this._masse[i % P];
      if (!m) return;
      const l = this._trifft(ort(i), m, px, py);
      if (!l) continue;
      this._reiche(e, i % P, l, ort(i % P), b);
      return;
    }
  }

  _weiterBahn(e) {
    const B = this._b, P = B.P;
    if (this._weiter || B.N <= P) return;
    const b = this._buehne.getBoundingClientRect();
    const px = e.clientX - b.left, py = e.clientY - b.top;
    if (B.stapel) {
      const reihe = [];
      for (let r = B.rest - 1; r >= 0; r--) reihe.push(r);
      if (B.m !== 0) for (let r = P - 1; r >= 0; r--) reihe.push(r);
      for (const r of reihe) {
        const m = this._masse[r];
        if (!m) return;
        const l = this._trifft(this._ort(B, r), m, px, py);
        if (l) { this._reiche(e, r, l, this._ort(B, r), b); return; }
      }
      return;
    }
    let best = -1, bl = null;
    for (let r = 0; r < P; r++) {
      const m = this._masse[r];
      if (!m) return;
      // Nur in gezeichneten Stücken suchen, von oben (spät gezeichnet) nach unten.
      for (const w of this._qBereiche(B, r, px, py, 0, Infinity)) {
        for (let t = B.teile.length - 1; t >= 0; t--) {
          const [lo, hi] = B.teile[t];
          const von = Math.max(Math.ceil(w[0]) - 1, Math.ceil((lo - r) / P));
          // Ausgedünnt gezeichnet, ausgedünnt gesucht: höchstens 4096 Kandidaten je Bogen, auch wenn Milliarden darin liegen.
          const oben = Math.min(Math.floor(w[1]) + 1, Math.floor((hi - 1 - r) / P)), weite = Math.max(1, Math.ceil((oben - von + 1) / 4096));
          for (let q = oben; q >= von; q -= weite) {
            const i = q * P + r;
            if (i <= best) break;
            const l = this._trifft(this._ort(B, i), m, px, py);
            if (l) { best = i; bl = l; break; }
          }
        }
      }
    }
    if (best >= 0) {
      this._weiterVon = best;
      try { this._reiche(e, best % P, bl, this._ort(B, best % P), b); } finally { this._weiterVon = null; }
    }
  }

  // Den Klick an Vorlage v weitergeben, an denselben Punkt (l, in Koordinaten der Form): dort liegt, was getroffen gewesen wäre.
  _reiche(e, v, l, ov, b) {
    const vorlage = this._kopien[v], m = this._masse[v];
    if (!vorlage || vorlage.contains(e.target)) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    const cv = Math.cos(ov.rot), sv = Math.sin(ov.rot);
    const qx = l[0] - m.w / 2, qy = l[1] - m.h / 2;
    const zx = b.left + ov.x + ov.s * (cv * qx - sv * qy), zy = b.top + ov.y + ov.s * (sv * qx + cv * qy);
    const ziel = this._root.elementsFromPoint(zx, zy).find((x) => vorlage.contains(x)) || vorlage;
    this._weiter = true;
    try {
      if (ziel.matches('input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea')) ziel.focus();
      else ziel.click();
    } finally { this._weiter = false; }
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

  // Der Schritt von Mitte zu Mitte, wie er gerade gezeichnet wird (Mittel über eine Periode), oder null vor dem ersten Messen.
  // Das ist, was space ausdrücklich setzt: so springt der Abstand-Regler nicht, wenn man ihn zum ersten Mal anfasst.
  get schritt() {
    const z = this._zustand;
    if (z.gap !== null) return z.gap;
    const P = Math.max(1, this.periode), m = this._masse;
    if (!m[0] || (P > 1 && !m[P - 1])) return null;
    const a0 = z.angle * Math.PI / 180, ca = Math.abs(Math.cos(a0)), sa = Math.abs(Math.sin(a0));
    const lang = (x) => ca * x.w + sa * x.h;
    let summe = 0;
    for (let r = 0; r < P; r++) summe += (lang(m[r]) + lang(m[(r + 1) % P] || m[r])) / 2 + z.space;
    return summe / P;
  }
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
