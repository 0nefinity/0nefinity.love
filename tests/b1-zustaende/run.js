// B1bli0thek: jeder Zustand, jede Eingabe (Playwright). Prüft, dass keine Eingabe die Seite zerstört und jeder Zustand Sinn ergibt.
//   node run.js [--url https://dev.0nefinity.love] [--root <repo>] [--nur button,line] [--bogen <png>] [--json <datei>] [--schnell]
// Ohne --url: lokaler Server über dem Repo (tests/lib/serve.js). Umgebung: PLAYWRIGHT_PATH, CHROME_PATH.
//
// Zerstört = pageerror/console.error, Hänger (> 2 s ohne Bild), NaN/Infinity/undefined in Zähler, Panel oder Attributen,
// unplausibler Zähler, 0/1/∞-Leiste oder Panel/Menü weg. Sinn = 0 ist nur das Element, 1 ist eins mehr, ∞ zeigt das Grenzbild
// (kein "DOM" wo gefaltet wird), Panel zeigt, was wirkt (Abstand, Regler = Attribut), space 0 = deckungsgleich, Doppeltipp führt
// zurück, Zustand nach ∞→1→0→∞ gleich wie direkt ∞, Element bleibt sichtbar. Was sich nicht automatisch entscheiden lässt,
// landet im Kontaktbogen (--bogen): ein Bild je Element und Zustand.
// Exit 1, sobald etwas zerstört; Sinn-Befunde stehen im Bericht.
const path = require('path');
const fs = require('fs');
const pw = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { start } = require('../lib/serve.js');

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const URL_ = arg('url', null);
const ROOT = arg('root', path.resolve(__dirname, '../..'));
const NUR = arg('nur', null);
const BOGEN = arg('bogen', null);
const JSON_ = arg('json', null);
const SCHNELL = !!arg('schnell', false);
const PARALLEL = Number(arg('parallel', 3));

const ELEMENTE = ['button', 'line', 'field', 'check', 'range', 'link', 'image', 'list', 'table', 'box', 'text', 'letter'];
const REGLER = ['bend', 'angle', 'space', 'scale'];
const UNSINN = ['0', '-1', '-360', '360', '361', '-1e308', '1e308', '1e-12', '', 'abc', '∞', '-', '1e', ' ', 'x'.repeat(5000), '\u{1F600}',
  'NaN', 'Infinity', '0,0000001', '-27,8', '1/0', '--5', '0x10'];
const UNSINN_KURZ = ['0', '-1', '1e308', '1e-12', '', 'abc', '∞', '-'];
const KONFIG = ['0', '-1', '1e308', '-1e308', '1e-12', '', 'abc', '∞', '-', '1e', ' ', '\u{1F600}', 'NaN'];
const ANZAHL = [...UNSINN, '12', '1', '999999999999999999999', '∞', 'unendlich', '3.000'];
// Paarweise: jeder Wert jedes Reglers trifft jeden Wert jedes anderen mindestens einmal.
const WERTE = { bend: [-360, -27.8, 0, 0.0000001, 0.3, 359.9, 360], angle: [-180, -60, 0, 19, 180], space: [-100, -20, 0, 40, 100], scale: [0.01, 0.5, 1, 2] };
// Tims Fälle zuerst.
const TIM = [{ bend: 0.0000001 }, { bend: -27.8, angle: 19 }];
// Zustände für den Kontaktbogen.
const BILDER = [['eins', []], ['vier', []], ['∞', []], ['∞ k-27.8 w19', [['bend', -27.8], ['angle', 19]]], ['∞ k1e-7', [['bend', 0.0000001]]],
  ['∞ a0', [['space', 0]]], ['∞ g0.5', [['scale', 0.5]]], ['∞ g1.5 k20', [['scale', 1.5], ['bend', 20]]], ['∞→1→0→∞', []]];

function paarweise() {
  const ks = Object.keys(WERTE);
  const offen = new Set();
  for (let a = 0; a < ks.length; a++) for (let b = a + 1; b < ks.length; b++)
    for (const x of WERTE[ks[a]]) for (const y of WERTE[ks[b]]) offen.add(`${ks[a]}=${x}|${ks[b]}=${y}`);
  const faelle = [];
  // Gierig: nimm je Fall die Kombination, die am meisten offene Paare schließt (Kandidaten zufällig, fester Samen).
  let s = 18;
  const zufall = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  while (offen.size) {
    let best = null, bestN = -1;
    for (let k = 0; k < 60; k++) {
      const f = {};
      for (const key of ks) f[key] = WERTE[key][Math.floor(zufall() * WERTE[key].length)];
      // Ein offenes Paar sicher einbauen, damit es immer vorangeht.
      const [p] = offen;
      for (const t of p.split('|')) { const [kk, v] = t.split('='); f[kk] = Number(v); }
      let n = 0;
      for (let a = 0; a < ks.length; a++) for (let b = a + 1; b < ks.length; b++) if (offen.has(`${ks[a]}=${f[ks[a]]}|${ks[b]}=${f[ks[b]]}`)) n++;
      if (n > bestN) { bestN = n; best = f; }
    }
    for (let a = 0; a < ks.length; a++) for (let b = a + 1; b < ks.length; b++) offen.delete(`${ks[a]}=${best[ks[a]]}|${ks[b]}=${best[ks[b]]}`);
    faelle.push(best);
  }
  return faelle;
}

// Hilfen in der Seite. Alle Eingaben laufen über die echten Felder und Knöpfe von controls.js und der Leiste.
const HILFEN = () => {
  const el = () => document.querySelector('#buehne > *');
  const zeile = (k) => document.querySelector(`#b1-panel [data-key="${k}"]`) || document.querySelector(`[data-key="${k}"]`);
  const bild = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  window.__t = {
    el, zeile, bild,
    leiste(z) { el().shadowRoot.querySelector(`[data-z="${z}"]`).click(); },
    wert(k, text) {
      const f = zeile(k).querySelector('.ctrl-value-input');
      f.focus(); f.value = text;
      f.dispatchEvent(new Event('input', { bubbles: true }));
      f.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      f.blur();
    },
    regler(k, v) {
      const r = zeile(k).querySelector('input[type="range"]');
      r.value = String(v);
      r.dispatchEvent(new Event('input', { bubbles: true }));
      r.dispatchEvent(new Event('change', { bubbles: true }));
    },
    doppeltipp(k) { zeile(k).querySelector('input[type="range"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); },
    konfig(k, feld, text) {
      zeile(k).querySelector('.ctrl-config-trigger').click();
      const p = document.getElementById('ctrl-global-config-popup');
      if (!p || !p.classList.contains('open')) return 'Popup geht nicht auf';
      const f = p.querySelector(`.ctrl-config-input[data-config="${feld}"]`);
      if (!f) return null;
      f.value = text;
      f.dispatchEvent(new Event('change', { bubbles: true }));
      p.querySelector('.ctrl-config-save')?.click();
      return null;
    },
    konfigPfeil(k, feld, richtung, n) {
      zeile(k).querySelector('.ctrl-config-trigger').click();
      const p = document.getElementById('ctrl-global-config-popup');
      const b = p.querySelector(`.ctrl-config-arrow[data-config="${feld}"][data-direction="${richtung}"]`);
      for (let i = 0; i < n && b; i++) b.click();
      p.querySelector('.ctrl-config-save')?.click();
    },
    konfigStandard(k) {
      zeile(k).querySelector('.ctrl-config-trigger').click();
      const p = document.getElementById('ctrl-global-config-popup');
      p.querySelector('.ctrl-config-default')?.click();
      if (p.classList.contains('open')) p.querySelector('.ctrl-config-save')?.click();
    },
    konfigLesen(k) {
      zeile(k).querySelector('.ctrl-config-trigger').click();
      const p = document.getElementById('ctrl-global-config-popup');
      const o = {};
      for (const f of p.querySelectorAll('.ctrl-config-input')) o[f.dataset.config] = f.value;
      p.querySelector('.ctrl-config-cancel')?.click();
      return o;
    },
    anzahl(text) {
      const f = zeile('anzahl').querySelector('input');
      f.focus(); f.value = text;
      f.dispatchEvent(new Event('input', { bubbles: true }));
      f.dispatchEvent(new Event('change', { bubbles: true }));
      f.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      f.blur();
    },
    text(k, text) {
      const f = zeile(k)?.querySelector('input');
      if (!f) return 'kein Feld ' + k;
      f.focus(); f.value = text;
      f.dispatchEvent(new Event('input', { bubbles: true }));
      f.dispatchEvent(new Event('change', { bubbles: true }));
      f.blur();
      return null;
    },
    form(v) {
      zeile('shape').querySelector('.ctrl-select-trigger').click();
      const o = [...document.querySelectorAll('.ctrl-select-option')].find((b) => b.textContent.trim() === v);
      if (!o) return 'Option fehlt ' + v;
      o.click();
      return null;
    },
    kapazitaet(an) {
      const c = zeile('capacity').querySelector('input[type="checkbox"]');
      if (c.checked !== an) c.click();
    },
    // In die Kopien selbst tippen/klicken (Textfeld, Regler, Checkbox).
    innen(text) {
      const k = el().kopien?.[0] || el().shadowRoot.querySelector('.buehne input, .buehne textarea');
      if (!k) return 'keine Kopie';
      if (k.type === 'checkbox' || k.querySelector?.('input[type="checkbox"]')) { (k.type === 'checkbox' ? k : k.querySelector('input')).click(); return null; }
      const f = k.matches?.('input, textarea') ? k : k.querySelector?.('input, textarea');
      if (!f) return null;
      f.value = text;
      f.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      f.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      return null;
    },
    taste(key, shift) { const e = el(); e.focus(); e.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey: !!shift, bubbles: true, composed: true })); },
    rad(dy, strg) { el().dispatchEvent(new WheelEvent('wheel', { deltaY: dy, ctrlKey: !!strg, bubbles: true, cancelable: true })); },
    async stand() {
      const t0 = performance.now();
      await bild();
      const bildzeit = performance.now() - t0;
      const e = el();
      const at = {};
      for (const k of ['repeat', 'bend', 'scale', 'angle', 'space', 'shift', 'capacity', 'gap']) at[k] = e?.getAttribute(k);
      const panel = {};
      for (const k of ['bend', 'angle', 'space', 'scale']) {
        const z = zeile(k);
        panel[k] = { feld: z?.querySelector('.ctrl-value-input')?.value, regler: z?.querySelector('input[type="range"]')?.value };
      }
      panel.anzahl = zeile('anzahl')?.querySelector('input')?.value;
      const leiste = e?.shadowRoot?.querySelector('.leiste');
      const knopf = leiste?.querySelector('[data-z="∞"]');
      let leisteOk = false;
      if (knopf) {
        const r = knopf.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        const oben = e.shadowRoot.elementFromPoint(x, y);
        leisteOk = r.width > 0 && r.height > 0 && x >= 0 && y >= 0 && x <= innerWidth && y <= innerHeight && !!oben && (oben === knopf || knopf.contains(oben));
      }
      const pe = document.getElementById('b1-panel');
      const pr = pe?.getBoundingClientRect();
      const kopien = e?.kopien || [];
      const rects = kopien.slice(0, 5).map((k) => { const r = k.getBoundingClientRect(); return [Math.round(r.left * 10) / 10, Math.round(r.top * 10) / 10, Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10]; });
      return {
        bildzeit, at, panel,
        zaehler: document.querySelector('.b1-zaehler')?.textContent ?? null,
        grafik: document.querySelector('.b1-grafik')?.textContent ?? null,
        falten: e?._falten, schritt: e?.schritt ?? null, gezaehlt: e?.gezaehlt ?? null, sichtbar: e?._sichtbar,
        rects, leisteOk,
        panelOk: !!pe && pe.isConnected && pr.height > 0 && pr.width > 0,
        menueOk: !!document.querySelector('.menu'),
        tag: e?.tagName.toLowerCase(),
      };
    },
  };
};

const SCHLECHT = /NaN|Infinity|undefined|null/;

function pruefeZerstoert(s, tag) {
  const f = [];
  if (!s) return ['kein Stand'];
  if (s.tag !== 'inf-' + tag) f.push(`Element weg (${s.tag})`);
  if (!s.leisteOk) f.push('0/1/∞-Leiste nicht bedienbar');
  if (!s.panelOk) f.push('Panel weg');
  if (!s.menueOk) f.push('Menü weg');
  if (s.zaehler !== null && SCHLECHT.test(s.zaehler)) f.push(`Zähler "${s.zaehler}"`);
  for (const k of ['bend', 'angle', 'space', 'scale']) {
    const p = s.panel[k];
    if (p.feld !== undefined && SCHLECHT.test(p.feld)) f.push(`Panel ${k} zeigt "${p.feld.slice(0, 30)}"`);
    if (p.regler !== undefined && SCHLECHT.test(p.regler)) f.push(`Regler ${k} steht auf "${p.regler}"`);
  }
  for (const [k, v] of Object.entries(s.at)) if (v !== null && SCHLECHT.test(v)) f.push(`Attribut ${k}="${v.slice(0, 30)}"`);
  // Zähler plausibel: ∞ nur mit ∞-Attribut; endlich = die Zahl.
  if (s.at.repeat === '∞') {
    if (!(s.zaehler === '∞' || /^[\d.]+ · \S+$/.test(s.zaehler || ''))) f.push(`Zähler bei ∞: "${s.zaehler}"`);
  } else if (s.at.repeat !== null) {
    const n = Number(s.at.repeat);
    if (!Number.isFinite(n) || n < 0) f.push(`repeat="${s.at.repeat}"`);
    else if (s.zaehler !== null && s.zaehler !== n.toLocaleString('de-DE')) f.push(`Zähler "${s.zaehler}" bei repeat=${s.at.repeat}`);
  }
  return f;
}

// Sinn je Zustand (keine Zerstörung, aber falsch oder irreführend).
function pruefeSinn(s, tag, gpu) {
  const f = [];
  const gefaltet = s.falten !== false;
  // Unsinn im Anzahl-Feld bleibt stehen, statt auf die geltende Zahl zurückzuspringen.
  if (s.panel.anzahl !== undefined && s.panel.anzahl !== '' && s.panel.anzahl !== '∞' && !/^[\d.]+$/.test(s.panel.anzahl)) f.push(`Anzahl-Feld zeigt "${s.panel.anzahl.slice(0, 20)}" statt der Zahl`);
  if (s.at.repeat === '∞' && / · DOM$/.test(s.zaehler || '') && gpu) f.push(`∞ zeigt "${s.zaehler}" obwohl WebGL2 da ist`);
  // Panel = was wirkt.
  for (const k of ['bend', 'angle', 'scale']) {
    const a = Number(s.at[k]);
    const p = Number(String(s.panel[k].feld ?? '').replace(',', '.'));
    if (s.at[k] !== null && Number.isFinite(a) && Number.isFinite(p) && Math.abs(a - p) > Math.max(0.051, Math.abs(a) * 0.001)) f.push(`Panel ${k} ${s.panel[k].feld}, wirkt ${s.at[k]}`);
  }
  if (s.at.space === null && s.at.gap === null && s.schritt !== null && tag !== 'text') {
    const p = Number(s.panel.space.feld);
    if (Number.isFinite(p) && Math.abs(p - s.schritt) > 1.5) f.push(`Abstand zeigt ${p}, gezeichnet ${Math.round(s.schritt * 10) / 10}`);
  }
  if (gefaltet === false && gpu && !['check', 'list', 'table', 'field', 'range', 'link', 'image'].includes(tag)) f.push('Faltung aus (DOM) bei gefaltetem Element');
  return f;
}

const STARTE = () => pw.chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function neueSeite(browser, base, tag) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 860 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p._fehler = [];
  p.on('pageerror', (e) => p._fehler.push('pageerror ' + e.message.split('\n')[0]));
  p.on('console', (m) => { if (m.type() === 'error') p._fehler.push('console.error ' + m.text().split('\n')[0].slice(0, 160)); });
  p.on('framenavigated', (fr) => { if (fr === p.mainFrame() && p._geladen) p._fehler.push('Seite neu geladen'); });
  await p.goto(base + '/B1bli0thek/' + (URL_ ? '' : 'index.html') + '#' + tag, { waitUntil: 'load', timeout: 30000 });
  await p.waitForSelector('#buehne > *', { state: 'attached', timeout: 20000 });
  await p.evaluate(HILFEN);
  await p.waitForTimeout(800);
  p._geladen = true;
  p._ctx = ctx;
  return p;
}

// Ein Aufruf in der Seite mit Hänger-Wache: antwortet die Seite 2 s nicht, gilt sie als eingefroren.
async function mitWache(p, fn, arg, ms = 2500) {
  let t;
  const wache = new Promise((_, nein) => { t = setTimeout(() => nein(new Error('HAENGER')), ms); });
  try { return await Promise.race([p.evaluate(fn, arg), wache]); } finally { clearTimeout(t); }
}

async function main() {
  let server = null, base = URL_;
  if (!base) { const s = await start(ROOT); server = s.server; base = s.base; }
  const browser = await STARTE();
  const zerstoert = [], sinn = [], bilder = [];
  let faelle = 0;
  const PAARE = paarweise();
  const tags = NUR ? String(NUR).split(',') : ELEMENTE;

  async function element(tag) {
    // Eigener Browser je Element: friert eine Seite die Grafik ein, startet nur dieser neu.
    let br = await STARTE();
    let p = await neueSeite(br, base, tag);
    const gpu = await p.evaluate(() => /^Grafik: (GPU|Software)/.test(document.querySelector('.b1-grafik')?.textContent || ''));
    const neu = async (hart) => {
      if (!hart) {
        try { await Promise.race([p._ctx.close(), new Promise((_, n) => setTimeout(() => n(new Error('zu')), 5000))]); p = await neueSeite(br, base, tag); return; } catch (e) { /* Browser hängt: neu starten */ }
      }
      try { await Promise.race([br.close(), new Promise((r) => setTimeout(r, 5000))]); } catch (e) { /* weg */ }
      try { br.process()?.kill('SIGKILL'); } catch (e) { /* weg */ }
      br = await STARTE();
      p = await neueSeite(br, base, tag);
    };
    // Ein Fall: Zustand herstellen, Eingabe, prüfen. Bei Hänger oder Zerstörung frische Seite.
    async function fall(zustand, was, eingabe, opts = {}) {
      faelle++;
      if (faelle % 100 === 0) console.log('…', faelle, tag, zustand, was.slice(0, 40));
      p._fehler.length = 0;
      let s = null, haenger = false;
      try {
        await mitWache(p, (z) => {
          const t = window.__t;
          t.kapazitaet(z.endsWith('+'));
          if (z === 'eins') t.leiste('0');
          else if (z === 'vier') { t.leiste('0'); t.leiste('1'); t.leiste('1'); t.leiste('1'); }
          else t.leiste('∞');
        }, zustand);
        await mitWache(p, eingabe.fn, eingabe.arg);
        if (opts.warte) await p.waitForTimeout(opts.warte);
        s = await mitWache(p, () => window.__t.stand(), null);
      } catch (e) {
        if (/HAENGER/.test(e.message)) haenger = true;
        else p._fehler.push('Test: ' + e.message.split('\n')[0].slice(0, 160));
      }
      // Antwortet die Seite nicht binnen 2,5 s: bis 20 s warten. Kommt sie zurück, ist es ein Stocken (Sinn-Befund,
      // auf dem Software-Renderer des Testservers oft nur langsam), sonst eingefroren (zerstört).
      let erholt = null;
      if (haenger) {
        const t0 = Date.now();
        try { await mitWache(p, () => window.__t.bild(), null, 20000); erholt = Date.now() - t0 + 2500; } catch (e) { /* eingefroren */ }
      }
      const fehler = [...p._fehler];
      if (haenger && erholt === null) fehler.push('eingefroren (> 20 s keine Antwort)');
      if (haenger && erholt !== null) sinn.push({ tag, zustand, was, f: `stockt ${Math.round(erholt / 100) / 10} s, dann wieder da` });
      if (haenger && erholt !== null) { try { s = await mitWache(p, () => window.__t.stand(), null, 20000); } catch (e) { /* bleibt null */ } }
      if (s && s.bildzeit > 2000) fehler.push(`Bild ${Math.round(s.bildzeit)} ms`);
      if (s) fehler.push(...pruefeZerstoert(s, tag));
      const ort = { tag, zustand, was };
      for (const f of fehler) zerstoert.push({ ...ort, f });
      if (s) for (const f of pruefeSinn(s, tag, gpu)) sinn.push({ ...ort, f });
      // Rückweg: Grundzustand, ohne die Seite neu zu laden. Geht er nicht, ist das selbst ein Befund.
      if (haenger) console.log(erholt === null ? 'EINGEFROREN' : 'STOCKT ' + erholt + ' ms', tag, zustand, was);
      if ((haenger && erholt === null) || fehler.some((f) => /Leiste|Panel weg|Element weg|Menü weg|pageerror/.test(f))) { await neu(haenger); return s; }
      try {
        await mitWache(p, (k) => {
          const t = window.__t;
          for (const r of ['bend', 'angle', 'space', 'scale']) t.konfigStandard(r);
          t.kapazitaet(false);
          t.leiste('0');
          t.regler('bend', 0); t.regler('angle', t.el().constructor.vorgaben.angle); t.regler('scale', 1);
          t.el().removeAttribute('space');
          if (k === 'inf-button') { t.text('label', 'Button'); t.form('standard'); }
          if (k === 'inf-letter') t.text('char', 'B');
        }, 'inf-' + tag, 20000);
      } catch (e) { zerstoert.push({ ...ort, f: 'Rückweg in den Grundzustand hängt' }); console.log('HAENGER Rückweg', tag, zustand, was); await neu(true); }
      return s;
    }
    const E = (fn, arg) => ({ fn, arg });
    const zustaende = SCHNELL ? ['eins', '∞'] : ['eins', 'vier', '∞', '∞+'];
    const voll = (z) => z === 'eins' || z === '∞';

    // 1. Tims Fälle.
    for (const t of TIM) for (const z of ['∞', '∞+']) await fall(z, 'Tim ' + JSON.stringify(t), E((t) => { for (const [k, v] of Object.entries(t)) window.__t.wert(k, String(v)); }, t), { warte: 600 });
    // 2. Werte-Felder der Regler.
    for (const z of zustaende) for (const k of REGLER) for (const v of voll(z) ? UNSINN : UNSINN_KURZ)
      await fall(z, `${k}-Feld "${v.length > 12 ? v.slice(0, 6) + '…(' + v.length + ')' : v}"`, E(([k, v]) => window.__t.wert(k, v), [k, v]));
    // 3. Dreipunkt-Menüs: Min, Max, Step (bzw. symmetrisch), Pfeile, min > max, Step 0/negativ, danach Regler bewegen.
    for (const z of SCHNELL ? ['∞'] : ['eins', '∞']) for (const k of REGLER) {
      for (const feld of ['min', 'max', 'step']) for (const v of KONFIG)
        await fall(z, `${k} ⋮ ${feld}="${v}"`, E(([k, feld, v]) => { const t = window.__t; const r = t.konfig(k, feld, v); t.regler(k, 1); t.wert(k, '3'); return r; }, [k, feld, v]));
      await fall(z, `${k} ⋮ min>max`, E((k) => { const t = window.__t; t.konfig(k, 'min', '100'); t.konfig(k, 'max', '-100'); t.wert(k, '5'); t.regler(k, 0); }, k));
      for (const [feld, r, n] of [['step', 'down', 40], ['step', 'up', 40], ['max', 'up', 30], ['min', 'down', 30], ['max', 'down', 30]])
        await fall(z, `${k} ⋮ ${feld} ${r} ×${n}`, E(([k, feld, r, n]) => { const t = window.__t; t.konfigPfeil(k, feld, r, n); t.wert(k, '1'); }, [k, feld, r, n]));
      await fall(z, `${k} ⋮ step 0.0000001, Regler`, E((k) => { const t = window.__t; t.konfig(k, 'step', '0.0000001'); t.regler(k, 0.0000001); t.wert(k, '0.0000001'); }, k), { warte: 400 });
    }
    // 4. Anzahl-Feld, ∞+, Leiste, Tasten, Rad, eigene Felder.
    for (const z of zustaende) for (const v of voll(z) ? ANZAHL : UNSINN_KURZ)
      await fall(z, `Anzahl "${v.length > 12 ? v.slice(0, 6) + '…' : v}"`, E((v) => window.__t.anzahl(v), v));
    for (const z of zustaende) {
      await fall(z, '∞+ an/aus/an', E(() => { const t = window.__t; t.kapazitaet(true); t.kapazitaet(false); t.kapazitaet(true); }), { warte: 300 });
      await fall(z, 'Leiste 0 1 ∞ 1 0 ∞ ∞', E(() => { const t = window.__t; for (const z of ['0', '1', '∞', '1', '0', '∞', '∞']) t.leiste(z); }));
      await fall(z, 'Leiste 1 ×50', E(() => { for (let i = 0; i < 50; i++) window.__t.leiste('1'); }));
      await fall(z, 'Tasten + - [ ] , . 8 0 Pfeile', E(() => { const t = window.__t; for (const k of ['+', '+', '-', '[', ']', ']', ',', '.', '8', 'ArrowLeft', 'ArrowUp', '0', '8']) t.taste(k); t.taste('ArrowRight', true); }));
      await fall(z, 'Rad ±', E(() => { const t = window.__t; for (let i = 0; i < 20; i++) t.rad(100); for (let i = 0; i < 20; i++) t.rad(-100, true); }));
      await fall(z, 'Doppeltipp alle Regler', E(() => { const t = window.__t; for (const k of ['bend', 'angle', 'space', 'scale']) { t.wert(k, '33'); t.doppeltipp(k); } }));
      for (const v of voll(z) ? ['', 'abc', 'x'.repeat(5000), '\u{1F600}', '0', '∞', ' '] : ['', 'abc'])
        await fall(z, `in die Kopie "${v.slice(0, 6)}"`, E((v) => window.__t.innen(v), v));
      if (tag === 'button') {
        for (const v of voll(z) ? UNSINN : UNSINN_KURZ) await fall(z, `Text "${v.slice(0, 8)}"`, E((v) => window.__t.text('label', v), v));
        for (const v of ['standard', 'eckig', 'rund', 'pille', 'kreis']) await fall(z, `Form ${v}`, E((v) => window.__t.form(v), v));
      }
      if (tag === 'letter') for (const v of voll(z) ? UNSINN : UNSINN_KURZ) await fall(z, `Zeichen "${v.slice(0, 8)}"`, E((v) => window.__t.text('char', v), v));
    }
    // 5. Paarweise Regler, endlich und ∞.
    for (const z of ['vier', '∞']) for (const pf of PAARE)
      await fall(z, 'paar ' + Object.entries(pf).map(([k, v]) => k + v).join(' '), E((pf) => { for (const [k, v] of Object.entries(pf)) window.__t.wert(k, String(v)); }, pf));

    // 6. Sinn: 0, 1, space 0, Doppeltipp, Übergang, Abstand.
    const st = () => mitWache(p, () => window.__t.stand(), null, 20000);
    const tu = (fn, a) => mitWache(p, fn, a, 20000);
    const S = (f) => sinn.push({ tag, zustand: 'Sinn', was: '', f });
    try {
      await tu(() => window.__t.leiste('∞'));
      await tu(() => window.__t.leiste('0'));
      let s = await st();
      if (s.at.repeat !== '1' || s.zaehler !== '1') S(`0 nach ∞: repeat=${s.at.repeat}, Zähler "${s.zaehler}" (soll 1)`);
      if (s.rects.length > 1 && s.sichtbar > 1) S(`0: ${s.sichtbar} DOM-Kopien sichtbar (soll nur das Element)`);
      for (let k = 2; k <= 4; k++) {
        await tu(() => window.__t.leiste('1'));
        s = await st();
        if (s.at.repeat !== String(k)) S(`${k - 1}× 1: repeat=${s.at.repeat} (soll ${k})`);
      }
      await tu(() => { window.__t.wert('bend', '0'); window.__t.wert('space', '0'); });
      s = await st();
      if (s.rects.length >= 2) {
        const [a, b] = s.rects;
        const mx = (r) => [r[0] + r[2] / 2, r[1] + r[3] / 2];
        const [ax, ay] = mx(a), [bx, by] = mx(b);
        if (Math.abs(ax - bx) > 0.6 || Math.abs(ay - by) > 0.6) S(`Abstand 0: Kopien liegen nicht deckungsgleich (${a} / ${b})`);
      }
      for (const k of ['bend', 'angle', 'space', 'scale']) {
        await tu((k) => { window.__t.wert(k, '33'); window.__t.doppeltipp(k); }, k);
        s = await st();
        const soll = k === 'scale' ? 1 : 0;
        const at = k === 'space' ? s.at.space : s.at[k];
        if (Number(at) !== soll || Number(s.panel[k].feld) !== soll) S(`Doppeltipp ${k}: Attribut ${at}, Panel ${s.panel[k].feld} (soll ${soll})`);
      }
    } catch (e) { S('Sinnprüfung abgebrochen: ' + e.message.slice(0, 80)); await neu(); }

    // 7. Kontaktbogen und Übergang ∞→1→0→∞ gegen direkt ∞ (Pixel).
    const stueck = async () => {
      const r = await p.evaluate(() => { const b = document.getElementById('buehne').getBoundingClientRect(); return { x: b.left, y: b.top, width: b.width, height: b.height }; });
      return p.screenshot({ clip: r, timeout: 10000 });
    };
    const deckung = (png) => p.evaluate(async (b64) => {
      const i = new Image(); i.src = 'data:image/png;base64,' + b64; await i.decode();
      const c = document.createElement('canvas'); c.width = i.width; c.height = i.height;
      const x = c.getContext('2d'); x.drawImage(i, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data;
      const g = [d[0], d[1], d[2]];
      let n = 0;
      for (let k = 0; k < d.length; k += 4) if (Math.abs(d[k] - g[0]) + Math.abs(d[k + 1] - g[1]) + Math.abs(d[k + 2] - g[2]) > 30) n++;
      return n / (d.length / 4);
    }, png.toString('base64'));
    let direkt = null;
    for (const [name, regler] of BILDER) {
      try {
        await neu();
        await tu(([name, regler]) => {
          const t = window.__t;
          if (name === 'eins') t.leiste('0');
          else if (name === 'vier') { t.leiste('0'); t.leiste('1'); t.leiste('1'); t.leiste('1'); }
          else if (name === '∞→1→0→∞') { t.leiste('∞'); t.leiste('1'); t.leiste('0'); t.leiste('∞'); }
          else t.leiste('∞');
          for (const [k, v] of regler) t.wert(k, String(v));
        }, [name, regler]);
        await p.waitForTimeout(1500);
        const s = await st();
        const png = await stueck();
        const d = await deckung(png);
        if (d < 0.0005) sinn.push({ tag, zustand: name, was: 'Bild', f: `fast nichts zu sehen (${(d * 100).toFixed(3)} % der Bühne)` });
        if (name === '∞') direkt = { s, d };
        if (name === '∞→1→0→∞' && direkt) {
          if (s.zaehler !== direkt.s.zaehler || s.at.repeat !== direkt.s.at.repeat) sinn.push({ tag, zustand: name, was: 'Übergang', f: `Zähler "${s.zaehler}" statt "${direkt.s.zaehler}" wie direkt ∞` });
          if (Math.abs(d - direkt.d) > 0.02) sinn.push({ tag, zustand: name, was: 'Übergang', f: `Bild anders als direkt ∞ (Deckung ${(d * 100).toFixed(1)} % statt ${(direkt.d * 100).toFixed(1)} %)` });
        }
        bilder.push({ tag, name, png, zaehler: s.zaehler, d });
      } catch (e) { sinn.push({ tag, zustand: name, was: 'Bild', f: 'Bild nicht möglich: ' + e.message.slice(0, 80) }); }
    }
    await br.close().catch(() => {});
    console.log(tag, 'fertig', new Date().toISOString().slice(11, 19));
  }

  try {
    const warte = [...tags];
    await Promise.all(Array.from({ length: Math.min(PARALLEL, warte.length) }, async () => { while (warte.length) await element(warte.shift()); }));
    if (BOGEN && bilder.length) await kontaktbogen(browser, bilder, BOGEN, tags);
  } finally {
    await browser.close();
    if (server) server.close();
  }

  // Bericht: gruppiert nach Befund (Zahlen in Eingaben herausgerechnet), mit Beispielen.
  const gruppe = (liste) => {
    const m = new Map();
    for (const x of liste) {
      const key = x.f.replace(/"[^"]*"/g, '"…"').replace(/-?\d[\d.,e+-]*/g, '#');
      if (!m.has(key)) m.set(key, { f: key, n: 0, tags: new Set(), beispiele: [] });
      const g = m.get(key);
      g.n++; g.tags.add(x.tag);
      if (g.beispiele.length < 3) g.beispiele.push(`${x.tag} [${x.zustand}] ${x.was}: ${x.f}`);
    }
    return [...m.values()].sort((a, b) => b.n - a.n);
  };
  const gz = gruppe(zerstoert), gs = gruppe(sinn);
  console.log(`\n${faelle} Fälle, ${tags.length} Elemente, ${URL_ || 'lokal'}`);
  console.log(`\nZERSTÖRT: ${zerstoert.length}`);
  for (const g of gz) console.log(`  ${g.n}× [${[...g.tags].join(',')}] ${g.f}\n     z.B. ${g.beispiele.join('\n          ')}`);
  console.log(`\nSINN: ${sinn.length}`);
  for (const g of gs) console.log(`  ${g.n}× [${[...g.tags].join(',')}] ${g.f}\n     z.B. ${g.beispiele.join('\n          ')}`);
  if (JSON_) fs.writeFileSync(JSON_, JSON.stringify({ faelle, url: URL_, zerstoert, sinn, bilder: bilder.map(({ png, ...b }) => b) }, null, 1));
  process.exit(zerstoert.length ? 1 : 0);
}

async function kontaktbogen(browser, bilder, datei, tags) {
  const p = await browser.newPage({ viewport: { width: 1600, height: 800 } });
  const spalten = BILDER.map((b) => b[0]);
  const zellen = tags.map((t) => `<tr><th>${t}</th>${spalten.map((n) => {
    const b = bilder.find((x) => x.tag === t && x.name === n);
    return `<td>${b ? `<img src="data:image/png;base64,${b.png.toString('base64')}"><div>${b.zaehler ?? ''}</div>` : '–'}</td>`;
  }).join('')}</tr>`).join('');
  await p.setContent(`<style>body{background:#000;color:#ccc;font:11px system-ui;margin:8px}td,th{border:1px solid #333;padding:2px;vertical-align:top;text-align:center}
    img{width:206px;display:block}th{writing-mode:vertical-rl}</style><table><tr><th></th>${spalten.map((n) => `<th style="writing-mode:horizontal-tb">${n}</th>`).join('')}</tr>${zellen}</table>`);
  await p.screenshot({ path: datei, fullPage: true });
  await p.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
