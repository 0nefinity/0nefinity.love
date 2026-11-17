// B1bli0thek: ∞ bleibt ∞ (Playwright, lokaler Server). Aufruf:
//   node run.js [repo-root]
// Regel: Ist ∞ aktiv, bleibt repeat="∞", egal welcher Regler danach geändert wird (Winkel, Krümmung, Abstand, Größe,
// Form, Text). Der Zähler zeigt dann "∞"; nur wo das Bild nicht exakt das unendliche ist, die echte Zahl mit einem Wort.
// Bei gefalteten Elementen (Button, Box, Buchstabe, Text, Linie) ist jede geprüfte Einstellung exakt: nur "∞" zählt.
// Nur 0 und eine eingetippte Anzahl verlassen ∞. 1 ist eine Kopie mehr; ∞ + 1 = ∞.
// Umgebung: PLAYWRIGHT_PATH, CHROME_PATH. Exit 1 bei Verstößen.
const path = require('path');
const pw = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { start } = require('../lib/serve.js');

const root = process.argv[2] || path.resolve(__dirname, '../..');
const GEFALTET = ['button', 'box', 'letter', 'text', 'line'];
const DOM = ['check', 'list'];
const SCHRITTE = [['angle', 30], ['bend', 20], ['bend', 7], ['bend', 0.3], ['bend', 0], ['space', 0], ['space', -20], ['space', 40],
  ['scale', 0.9], ['scale', 1.1], ['scale', 0.5], ['scale', 1.5], ['scale', 0.95], ['bend', 45], ['scale', 1], ['angle', -60]];

(async () => {
  const { server, base } = await start(root);
  const b = await pw.chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fehler = [];
  try {
    for (const tag of [...GEFALTET, ...DOM]) {
      const p = await b.newPage({ viewport: { width: 412, height: 800 } });
      p.on('pageerror', (e) => fehler.push(`${tag}: pageerror ${e.message}`));
      await p.goto(base + '/B1bli0thek/index.html#' + tag);
      await p.waitForSelector('#buehne > *', { state: 'attached', timeout: 15000 });
      await p.waitForTimeout(1200);
      const stand = () => p.evaluate(() => {
        const el = document.querySelector('#buehne > *');
        return { repeat: el.getAttribute('repeat'), zaehler: document.querySelector('.b1-zaehler').textContent };
      });
      const leiste = (z) => p.evaluate((z) => document.querySelector('#buehne > *').shadowRoot.querySelector(`[data-z="${z}"]`).click(), z);
      const pruefe = async (was) => {
        const s = await stand();
        if (s.repeat !== '∞') fehler.push(`${tag} ${was}: repeat=${s.repeat}`);
        const ok = GEFALTET.includes(tag) ? s.zaehler === '∞' : s.zaehler === '∞' || /^[\d.]+ · \S+$/.test(s.zaehler);
        if (!ok) fehler.push(`${tag} ${was}: Zähler "${s.zaehler}"`);
        return s;
      };
      await leiste('∞');
      await p.waitForTimeout(600);
      await pruefe('∞');
      for (const [k, v] of SCHRITTE) {
        await p.evaluate(([k, v]) => {
          const r = document.querySelector(`[data-key="${k}"] input[type="range"]`);
          r.value = v;
          r.dispatchEvent(new Event('input', { bubbles: true }));
          r.dispatchEvent(new Event('change', { bubbles: true }));
        }, [k, v]);
        await p.waitForTimeout(500);
        await pruefe(`${k}=${v}`);
      }
      if (tag === 'button') {
        for (const [k, v] of [['shape', 'rund'], ['label', 'unendlich']]) {
          // Form ist ein controls.js-Popup, Text ein Feld; beide schreiben nur das Attribut (setze in index.html).
          await p.evaluate(([k, v]) => document.querySelector('#buehne > *').setAttribute(k, v), [k, v]);
          await p.waitForTimeout(700);
          await pruefe(`${k}=${v}`);
        }
      }
      // Raus aus ∞: 0, eingetippte Anzahl.
      for (const weg of ['0', 'tippen']) {
        await leiste('∞');
        await p.waitForTimeout(300);
        if (weg === 'tippen') {
          await p.evaluate(() => {
            const f = document.querySelector('[data-key="anzahl"] input');
            f.focus(); f.value = '12';
            f.dispatchEvent(new Event('input', { bubbles: true }));
            f.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            f.dispatchEvent(new Event('change', { bubbles: true }));
          });
        } else await leiste(weg);
        await p.waitForTimeout(400);
        const s = await stand();
        if (s.repeat === '∞' || !/^\d+$/.test(s.repeat)) fehler.push(`${tag} raus per ${weg}: repeat=${s.repeat}`);
        if (weg === 'tippen' && s.repeat !== '12') fehler.push(`${tag} getippt 12: repeat=${s.repeat}`);
        if (weg === '0' && s.repeat !== '1') fehler.push(`${tag} 0 nach ∞: repeat=${s.repeat}`);
      }
      // 0 = nur das Element, jede 1 eine Kopie mehr; 1 bei ∞ lässt ∞ stehen (keine geräteabhängige Zahl).
      await leiste('0');
      for (let k = 2; k <= 4; k++) {
        await leiste('1');
        await p.waitForTimeout(200);
        const s = await stand();
        if (s.repeat !== String(k)) fehler.push(`${tag} ${k - 1}× 1 nach 0: repeat=${s.repeat}`);
      }
      for (let runde = 0; runde < 2; runde++) {
        await leiste('∞');
        await p.waitForTimeout(500);
        await pruefe(`Wechsel ${runde} ∞`);
        await leiste('1');
        await p.waitForTimeout(500);
        await pruefe(`Wechsel ${runde} ∞ dann 1`);
      }
      console.log(tag, 'geprüft');
      await p.close();
    }
  } finally {
    await b.close();
    server.close();
  }
  for (const f of fehler) console.log('FEHLER', f);
  console.log(fehler.length ? `${fehler.length} Verstöße` : 'grün');
  process.exit(fehler.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
