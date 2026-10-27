// Seiten-Chat: eingeloggt (dev-Login, /api/auth/me) bekommt die Seite rechts einen eingeklappten Knopf
// "claude"; offen zeigt er den Verlauf der zugeordneten Claude-Sitzung und ein Eingabefeld.
// Der eigentliche Chat laeuft in einem iframe auf https://kanal.0nefinity.love (eigene Origin, eigener
// Passkey-Login, eigener Dienst ausserhalb dieses Repos). Diese Datei sieht keine Nachrichten und keine
// Zugangsdaten; der dev-Login entscheidet nur, ob der Knopf erscheint.
// Einbinden: <script src="/tools/claude-chat.js" defer></script>
(function claudeChat() {
  if (!location.hostname.startsWith('dev.')) return;
  const KANAL = 'https://kanal.0nefinity.love';
  const seite = location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
  const OFFEN = 'claude-chat-offen';

  const css = `
  .cc-knopf{position:fixed;right:12px;bottom:72px;z-index:2147483000;min-width:44px;height:44px;padding:0 14px;
    border-radius:6px;background:var(--ui-surface-strong);color:var(--text-color);border:1px solid var(--ui-border);font:15px/42px var(--font-family);
    box-shadow:0 2px 10px rgba(0,0,0,.45);cursor:pointer}
  .cc-knopf:focus-visible{outline:2px solid var(--ui-border-stronger);outline-offset:2px}
  .cc-knopf[aria-expanded="true"]{border-color:var(--ui-border-stronger)}
  .cc-rahmen{position:fixed;right:12px;bottom:124px;z-index:2147483000;width:min(400px,calc(100vw - 24px));
    height:min(620px,calc(100vh - 148px));border:1px solid var(--ui-border);border-radius:8px;overflow:hidden;
    background:var(--bg-color);box-shadow:0 8px 30px rgba(0,0,0,.55);display:none}
  .cc-rahmen.an{display:block}
  .cc-rahmen iframe{width:100%;height:100%;border:0;display:block;background:var(--bg-color)}
  @media (max-width:600px){
    .cc-rahmen{right:0;left:0;bottom:0;width:100vw;height:min(75vh,calc(100vh - 56px));border-radius:8px 8px 0 0;border-width:1px 0 0}
    .cc-knopf[aria-expanded="true"]{bottom:calc(min(75vh,100vh - 56px) + 8px)}
  }`;

  async function eingeloggt() {
    try {
      const r = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' });
      return r.status === 200;
    } catch (e) {
      return false;
    }
  }

  function bauen() {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    const knopf = document.createElement('button');
    knopf.type = 'button';
    knopf.className = 'cc-knopf';
    knopf.textContent = 'claude';
    knopf.setAttribute('data-oe-ui', '');
    knopf.setAttribute('aria-controls', 'cc-rahmen');

    const rahmen = document.createElement('div');
    rahmen.className = 'cc-rahmen';
    rahmen.id = 'cc-rahmen';
    rahmen.setAttribute('data-oe-ui', '');
    let frame = null;

    function setze(offen) {
      knopf.setAttribute('aria-expanded', String(offen));
      rahmen.classList.toggle('an', offen);
      try { localStorage.setItem(OFFEN, offen ? '1' : ''); } catch (e) { /* privater Modus: Zustand nur fuer diese Seite */ }
      if (offen && !frame) {
        frame = document.createElement('iframe');
        frame.title = 'Claude-Sitzung dieser Seite';
        frame.src = KANAL + '/panel?seite=' + encodeURIComponent(seite);
        frame.referrerPolicy = 'no-referrer';
        frame.allow = '';
        rahmen.appendChild(frame);
      }
    }
    knopf.addEventListener('click', () => setze(knopf.getAttribute('aria-expanded') !== 'true'));
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && knopf.getAttribute('aria-expanded') === 'true') setze(false);
    });
    document.body.appendChild(rahmen);
    document.body.appendChild(knopf);
    let offen = false;
    try { offen = localStorage.getItem(OFFEN) === '1'; } catch (e) { offen = false; }
    setze(offen);
  }

  eingeloggt().then((ja) => { if (ja) bauen(); });
})();
