// B1bli0thek: der DOM-Weg ist nie endgültig. Aufruf:
//   node run.js [repo-root | https://…]
// Tim (Handy): "Der springt manchmal auf Dom um und dann nicht mehr zurück".
// Solange ∞ eingestellt ist, kehrt jedes gefaltete Element zum Grenzbild zurück, sobald die Grafikkarte wieder geht.
// Nachgestellte Handy-Auslöser: Kontextverluste in Serie, Tab im Hintergrund, kein Kontext zu bekommen, Fehler beim
// Abbild, viele fremde Kontexte (Browser halten nur ~16), Wechsel durch die Variantenleiste, Drehen, Checkbox-Welle.
// Jeder Wechsel auf DOM meldet seinen Grund an /B1bli0thek/meldung.txt (wird mitgeprüft).
// Umgebung: PLAYWRIGHT_PATH, CHROME_PATH. Exit 1 bei Verstößen.
const path = require('path');
const pw = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { start } = require('../lib/serve.js');

const arg = process.argv[2] || '';
const fern = /^https?:/.test(arg);
const root = fern ? '' : arg || path.resolve(__dirname, '../..');
const GEFALTET = ['button', 'box', 'letter', 'text', 'line', 'field', 'link', 'image', 'table'];
// Wie lange die Rückkehr höchstens dauern darf (längste Pause der Wiederholung plus Aufbau).
const RUECKKEHR_MS = 9000;

(async () => {
  const { server, base } = fern ? { server: { close() {} }, base: arg.replace(/\/$/, '') } : await start(root);
  const b = await pw.chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fehler = [];
  const seite = async (tag, breite = 412, hoehe = 800) => {
    const p = await b.newPage({ viewport: { width: breite, height: hoehe } });
    p.meldungen = [];
    p.on('request', (r) => { if (r.url().includes('/B1bli0thek/meldung.txt')) p.meldungen.push(new URL(r.url()).searchParams.get('grund')); });
    p.on('pageerror', (e) => fehler.push(`${tag}: pageerror ${e.message}`));
    await p.goto(base + '/B1bli0thek/' + (fern ? '' : 'index.html') + '#' + tag);
    await p.waitForSelector('#buehne > *', { state: 'attached', timeout: 15000 });
    await p.waitForTimeout(800);
    return p;
  };
  const el = 'document.querySelector("#buehne > *")';
  const zaehler = (p) => p.evaluate(() => document.querySelector('.b1-zaehler').textContent);
  const unendlich = (p) => p.evaluate(() => { const e = document.querySelector('#buehne > *'); e.shadowRoot.querySelector('[data-z="∞"]').click(); });
  // Wartet, bis der Zähler wieder ∞ zeigt; meldet sonst den letzten Stand.
  const zurueck = async (p, tag, was, ms = RUECKKEHR_MS) => {
    const ende = Date.now() + ms;
    let z = '';
    while (Date.now() < ende) {
      z = await zaehler(p);
      if (z === '∞') return true;
      await p.waitForTimeout(250);
    }
    fehler.push(`${tag} ${was}: Zähler bleibt "${z}"`);
    return false;
  };
  const verlieren = (p) => p.evaluate(() => document.querySelector('#buehne > *')._faltung?.gl.getExtension('WEBGL_lose_context')?.loseContext());

  try {
    for (const tag of GEFALTET) {
      const p = await seite(tag);
      await unendlich(p);
      await p.waitForTimeout(600);
      if (!(await zurueck(p, tag, 'Start'))) { await p.close(); continue; }

      // 1. Verluste in Serie: sechs in zwei Sekunden.
      for (let i = 0; i < 6; i++) { await verlieren(p); await p.waitForTimeout(300); }
      await zurueck(p, tag, 'sechs Kontextverluste');

      // 2. Tab im Hintergrund: Verlust, solange versteckt; nach dem Zurückkommen wieder ∞.
      await p.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      for (let i = 0; i < 5; i++) { await verlieren(p); await p.waitForTimeout(200); }
      await p.evaluate(() => {
        delete document.hidden; delete document.visibilityState;
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await zurueck(p, tag, 'Hintergrund');

      // 3. Kein Kontext zu bekommen (Grafikkarte gesperrt), drei Versuche lang; danach wieder.
      await p.evaluate(() => {
        const orig = HTMLCanvasElement.prototype.getContext;
        let nein = 3;
        HTMLCanvasElement.prototype.getContext = function (art, ...r) { if (art === 'webgl2' && nein > 0) { nein--; return null; } return orig.call(this, art, ...r); };
      });
      await verlieren(p);
      await zurueck(p, tag, 'kein Kontext');

      // 4. Fehler beim Abbild (Bild der Vorlage lädt nicht), einmal.
      await p.evaluate(async () => {
        const e = document.querySelector('#buehne > *');
        const proto = (await import('/B1bli0thek/faltung.js')).Faltung.prototype;
        const orig = proto.bild;
        let nein = 1;
        proto.bild = function (...a) { if (nein > 0) { nein--; return Promise.reject(new Error('Testfehler Abbild')); } return orig.apply(this, a); };
        e._faltung?.veraltet();
        e.setAttribute('angle', '7');
      });
      await zurueck(p, tag, 'Abbild-Fehler');

      // 5. Viele fremde Kontexte: der Browser nimmt den ältesten weg.
      await p.evaluate(() => { window.__fremd = []; for (let i = 0; i < 20; i++) { const c = document.createElement('canvas'); window.__fremd.push(c.getContext('webgl2')); } });
      await p.waitForTimeout(500);
      await p.evaluate(() => document.querySelector('#buehne > *').setAttribute('angle', '13'));
      await zurueck(p, tag, 'viele Kontexte');

      // 6. Drehen: Querformat und zurück.
      for (const [w, h] of [[800, 412], [412, 800], [800, 412], [412, 800]]) { await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(300); }
      await zurueck(p, tag, 'Drehen');

      const dom = p.meldungen.filter(Boolean);
      if (!dom.length) fehler.push(`${tag}: keine Meldung an /B1bli0thek/meldung.txt trotz DOM-Wechsel`);
      console.log(tag, 'geprüft, Meldungen:', dom.length, [...new Set(dom)].join(' | '));
      await p.close();
    }

    // 7. Wechsel durch die Variantenleiste, drei Runden, danach überall ∞.
    {
      const p = await seite('button');
      for (let r = 0; r < 3; r++) for (const t of GEFALTET) { await p.evaluate((t) => { location.hash = t; }, t); await p.waitForTimeout(120); }
      for (const t of GEFALTET) {
        await p.evaluate((t) => { location.hash = t; }, t);
        await p.waitForTimeout(400);
        await unendlich(p);
        await zurueck(p, t, 'nach Variantenwechsel');
      }
      const offen = await p.evaluate(() => document.querySelectorAll('canvas.faltung').length);
      await p.close();
      console.log('Variantenleiste geprüft, Leinwände im Dokument:', offen);
    }

    // 8. Checkbox-Welle: Klick unter ∞, auch schnell hintereinander; danach wieder ∞.
    {
      const p = await seite('check');
      await unendlich(p);
      await zurueck(p, 'check', 'Start');
      const klick = () => p.evaluate(() => {
        const e = document.querySelector('#buehne > *');
        const f = e.shadowRoot.querySelector('input[type="checkbox"]');
        f.click();
      });
      await klick();
      await zurueck(p, 'check', 'eine Welle');
      for (let i = 0; i < 4; i++) { await klick(); await p.waitForTimeout(80); }
      await zurueck(p, 'check', 'vier schnelle Wellen');
      await klick();
      await verlieren(p);
      await zurueck(p, 'check', 'Welle mit Kontextverlust');
      await p.close();
      console.log('check geprüft');
    }
  } finally {
    await b.close();
    server.close();
  }
  for (const f of fehler) console.log('FEHLER', f);
  console.log(fehler.length ? `${fehler.length} Verstöße` : 'grün');
  process.exit(fehler.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
