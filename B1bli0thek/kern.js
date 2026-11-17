// Gemeinsame Basis aller Elemente: wiederholen, verschieben, krümmen, skalieren.
// Jede Kopie i liegt auf einem Pfad: Schrittweite * scale^i, Richtung angle + i * bend.
// scale < 1 läuft in einen Fluchtpunkt (Unendlichkeit im Endlichen), bend != 0 krümmt zu Bogen und Spirale.

const UNENDLICH = new Set(['∞', 'inf', 'unendlich', 'infinity']);
// So viele Kopien zeigt ∞: 720, zwei volle Umdrehungen. Mehr fasst kein Bildschirm, der Rest ist mitgemeint.
const DECKEL = 720;
// Kapazitätsmodus: so weit die Rechenkapazität reicht, nie über diese Grenze (Knoten und Speicher bleiben beschränkt).
const KAPAZITAET_MAX = 6000;
// Pro Messdurchgang so viele Kopien vorausbauen: ein Reflow je Stapel statt einer je Kopie.
const STAPEL = 64;
// Länger als das braucht ein Zug im Kapazitätsmodus nie, sonst geht er zurück.
const ZUG_MS = 24;
const TAKT_MS = 50;
const BASIS_ATTRIBUTE = new Set(['repeat', 'bend', 'scale', 'angle', 'space', 'gap', 'shift', 'rotate', 'capacity']);

const GRUNDSTIL = `
:host { display: block; position: relative; height: 16rem; overflow: hidden; white-space: normal; line-height: normal;
  color: var(--text-color, white); font-family: var(--font-family, system-ui, sans-serif);
  -webkit-tap-highlight-color: transparent; touch-action: none; user-select: none; -webkit-user-select: none; }
:host([hidden]) { display: none; }
.buehne { position: absolute; inset: 0; outline: none; }
.kopie { position: absolute; left: 0; top: 0; transform-origin: 0 0; white-space: nowrap; }
.kopie[hidden] { display: none !important; }
.leiste { position: absolute; left: 50%; bottom: .5rem; transform: translateX(-50%); display: flex; flex-wrap: wrap; justify-content: center; max-width: calc(100% - 1rem); gap: .25rem; z-index: 1; }
.leiste button, .leiste input { all: unset; box-sizing: border-box; min-width: 44px; height: 44px; padding: 0 .5rem;
  display: inline-flex; align-items: center; justify-content: center; text-align: center; cursor: pointer;
  border-radius: 4px; color: var(--ui-text-80, rgba(255,255,255,.8)); background: var(--ui-fill-05, rgba(255,255,255,.05));
  font: inherit; font-size: 1.125rem; line-height: 1; touch-action: manipulation; }
.leiste input { width: 44px; cursor: text; font-size: 16px; }
.leiste button[aria-pressed="true"] { background: var(--ui-fill-20, rgba(255,255,255,.2)); color: var(--text-color, white); }
.leiste button:active { background: var(--ui-fill-20, rgba(255,255,255,.2)); }
@media (hover: hover) { .leiste button:hover { background: var(--ui-fill-10, rgba(255,255,255,.1)); color: var(--text-color, white); } }
.leiste button:focus-visible, .leiste input:focus-visible { outline: 1px solid var(--text-color, white); outline-offset: 2px; }
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
      <div class="leiste" part="controls">${this.leistenExtra()}
        <button type="button" data-z="0" aria-label="zurück auf eins">0</button>
        <button type="button" data-z="1" aria-label="eins mehr">1</button>
        <button type="button" data-z="∞" aria-label="unendlich">∞</button>
        <button type="button" data-z="kap" aria-label="so weit die Rechenkapazität reicht" title="so weit die Rechenkapazität reicht" aria-pressed="false">∞+</button>
      </div>`;
    this._buehne = this._root.querySelector('.buehne');
    this._kopien = [];
    this._sichtbar = 0;
    this._cap = DECKEL;
    this._gedeckelt = false;
    this._takt = 0;
    this._masse = [];
    this._zeiger = new Map();
    this._schreibt = false;
    this._geplant = 0;
    this._zustand = {};
    this._leseAttribute();
  }

  connectedCallback() {
    if (this._verbunden) return;
    this._verbunden = true;
    this._groesse = new ResizeObserver(() => { this._masse = []; this.zeichne(); });
    this._groesse.observe(this);
    this._root.querySelector('.leiste').addEventListener('click', (e) => this._leiste(e));
    this._buehne.addEventListener('pointerdown', (e) => this._runter(e));
    this._buehne.addEventListener('pointermove', (e) => this._bewegt(e));
    this._buehne.addEventListener('pointerup', (e) => this._hoch(e));
    this._buehne.addEventListener('pointercancel', (e) => this._hoch(e));
    this._buehne.addEventListener('click', (e) => { if (this._gezogen) { e.stopPropagation(); e.preventDefault(); this._gezogen = false; } }, true);
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
    if (name === 'capacity') { this._cap = DECKEL; this._gedeckelt = false; this._zeigeKapazitaet(); }
    // Wiederholen, krümmen, skalieren ... ändert nur Orte, nie Inhalt oder Maße.
    if (!BASIS_ATTRIBUTE.has(name)) { this._masse = []; this.attributGeaendert(); }
    this.zeichne();
  }

  _zeigeKapazitaet() {
    this._root.querySelector('[data-z="kap"]').setAttribute('aria-pressed', String(this._zustand.kapazitaet));
  }

  // Haken für Unterklassen
  verbunden() {}
  attributGeaendert() {}
  leistenExtra() { return ''; }
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
      anzahl: UNENDLICH.has(r) ? KAPAZITAET_MAX : Math.max(0, Math.floor(zahl(r, 1))),
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
  unendlich() { const z = this._zustand; z.unendlich = true; z.anzahl = KAPAZITAET_MAX; this._schreibe(); this.zeichne(); }
  eins() { if (this._zustand.unendlich) { this._zustand.unendlich = false; this._zustand.anzahl = this._sichtbar; } this.mehr(1); }
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

  // Ein Zug: layouten und im Kapazitätsmodus Zeit, Takt und Speicher mitmessen.
  _zug(ts) {
    const z = this._zustand;
    const t0 = performance.now();
    const takt = this._takt && ts - this._takt < 100 ? ts - this._takt : 0;
    this._takt = ts;
    const vorher = this._kopien.length;
    const voll = this._layout();
    if (!z.kapazitaet) return;
    // Der Aufbau neuer Kopien zählt nicht: erst der Zug danach misst nur das Layout.
    if (this._kopien.length > vorher) { this.zeichne(); return; }
    const dauer = performance.now() - t0;
    const m = performance.memory;
    const speicherknapp = m && m.usedJSHeapSize > m.jsHeapSizeLimit * 0.6;
    if (this._cap > DECKEL && (dauer > ZUG_MS || takt > TAKT_MS || speicherknapp)) {
      this._cap = Math.max(DECKEL, Math.floor(this._cap / 1.5));
      this._gedeckelt = true;
      this.zeichne();
    } else if (voll && !this._gedeckelt && this._cap < KAPAZITAET_MAX && dauer < ZUG_MS / 2) {
      this._cap = Math.min(KAPAZITAET_MAX, Math.ceil(this._cap * 1.5));
      this.zeichne();
    }
  }

  get kapazitaet() { return this._zustand.kapazitaet ? this._cap : DECKEL; }

  // Wieviele Kopien sichtbar bleiben: bei ∞ bis aus dem Bild, unter einen halben Pixel oder ein Kreis geschlossen ist.
  _layout() {
    const z = this._zustand;
    const breite = this.clientWidth, hoehe = this.clientHeight;
    if (!breite || !hoehe) return false;
    const diag = Math.hypot(breite, hoehe);
    const mx = breite / 2 + z.dx, my = hoehe / 2 + z.dy;
    let x = mx, y = my, s = 1, richtung = z.angle;
    const kreis = z.unendlich && z.scale === 1 && z.bend !== 0 ? Math.ceil(360 / Math.abs(z.bend)) : Infinity;
    const grenze = z.kapazitaet ? this._cap : DECKEL;
    const ziel = Math.min(z.anzahl, grenze, kreis);
    this._ziel = ziel + 1;
    const orte = [];
    for (let i = 0; i < ziel; i++) {
      const m = this._mass(i, richtung);
      if (z.unendlich && i > 0) {
        const weg = Math.hypot(x - breite / 2, y - hoehe / 2);
        if (s * m.gross < 0.5 || s * m.gross > diag * 4 || (weg > diag * 1.2 && weg > Math.hypot(z.dx, z.dy) + diag * 0.6)) break;
      }
      orte.push({ x, y, s, r: z.rotate ? richtung - z.angle : 0, m });
      const naechstes = this._mass(i + 1, richtung + z.bend);
      const schritt = z.gap ?? ((m.lang + naechstes.lang) / 2 + z.space);
      const rad = (richtung * Math.PI) / 180;
      x += Math.cos(rad) * schritt * s;
      y += Math.sin(rad) * schritt * s;
      s *= z.scale;
      richtung += z.bend;
    }
    this._abgleich(orte.length);
    for (let i = 0; i < orte.length; i++) {
      const o = orte[i];
      const k = this._kopien[i];
      const t = `translate(${o.x}px,${o.y}px) rotate(${o.r}deg) scale(${o.s}) translate(${-o.m.w / 2}px,${-o.m.h / 2}px)`;
      if (k._t !== t) { k._t = t; k.style.transform = t; }
    }
    this.nachLayout(orte.length);
    // voll: die Grenze war der Grund aufzuhören, es gäbe mehr zu zeigen.
    return orte.length >= grenze;
  }

  nachLayout() {}

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
      this._buehne.append(k);
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
  }

  // Maße einer Kopie ohne Transformation. Kopien werden einmal gemessen und gecacht, stapelweise.
  _mass(i, richtung) {
    let m = this._masse[i];
    if (!m) {
      const bis = Math.max(i + 1, Math.min(i + STAPEL, this._ziel || 0));
      this._bis(bis);
      const frisch = [];
      for (let j = i; j < bis; j++) if (!this._masse[j]) frisch.push(j);
      for (const j of frisch) {
        const k = this._kopien[j];
        const w = k.offsetWidth, h = k.offsetHeight;
        this._masse[j] = { w, h, gross: Math.max(w, h, 1) };
      }
      m = this._masse[i];
    }
    const z = this._zustand;
    // Pfadrichtung im eigenen Rahmen der Kopie: gedreht wird nur um das, was die Krümmung dazugibt.
    const rad = ((z.rotate ? z.angle : richtung) * Math.PI) / 180;
    return { ...m, lang: Math.abs(Math.cos(rad)) * m.w + Math.abs(Math.sin(rad)) * m.h };
  }

  vermessen() { this._masse = []; this.zeichne(); }
  get kopien() { return this._kopien.slice(0, this._sichtbar); }

  _leiste(e) {
    const b = e.target.closest('button[data-z]');
    if (!b) return;
    const z = b.dataset.z;
    if (z === '0') this.ursprung();
    else if (z === '1') this.eins();
    else if (z === 'kap') this.toggleAttribute('capacity');
    else this.unendlich();
  }

  // Ein Finger zieht = verschieben. Zwei Finger: drehen = krümmen, spreizen = skalieren.
  _zieht(ziel) {
    return !ziel.closest?.('input[type="range"], input[type="text"], input:not([type]), textarea, [contenteditable]');
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
    if (e.target !== this || e.altKey || e.ctrlKey || e.metaKey) return;
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
export const OHNE_AUTOFILL = 'autocomplete="off" autocorrect="off" spellcheck="false" autocapitalize="off" data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other"';
export function ohneAutofill(feld) {
  for (const [k, v] of [['autocomplete', 'off'], ['autocorrect', 'off'], ['spellcheck', 'false'], ['autocapitalize', 'off'],
    ['data-1p-ignore', ''], ['data-lpignore', 'true'], ['data-bwignore', ''], ['data-form-type', 'other']]) feld.setAttribute(k, v);
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
