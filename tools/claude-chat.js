// Seiten-Chat: Nur dev, nur eingeloggt (Editor-Login, /api/auth/me), nur der Inhaber.
// Ein Claude-Symbol in der Kopfleiste des Control-Panels tauscht den Panelinhalt gegen den Chat der Claude-Sitzung,
// die so heisst wie die Seite (oder "018 <seite>"). Das Panel bleibt Panel: gleiche Kopfleiste, gleiche Ziehkanten,
// gleiche Groessenaenderung. Zweiter Klick auf das Symbol bringt die Regler zurueck.
// Der Chat selbst laeuft in einem iframe auf eigener Origin; diese Datei sieht keine Nachrichten und keine Zugangsdaten.
// Einbinden: <script src="/tools/claude-chat.js" defer></script>
(function claudeChat() {
  if (!location.hostname.startsWith('dev.')) return;
  const seite = location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
  const MAX_NEU = 2;
  const FENSTER_MS = 60000;
  const KANAL_ORIGIN = 'https://kanal.0nefinity.love';

  const STRAHLEN = [[269.7, 60.5], [325.9, 133.4], [401.3, 155.9], [383.8, 236.1], [443.6, 312.8], [368.6, 359.4],
    [322.7, 423.5], [246.4, 392.9], [160.8, 422.8], [136.6, 338.3], [85.6, 282.6], [128.4, 217.4], [111.7, 123.4], [198.0, 110.3]];
  const SYMBOL = '<svg viewBox="0 0 512 512" aria-hidden="true"><g stroke="currentColor" stroke-width="40" stroke-linecap="round">'
    + STRAHLEN.map(([x, y]) => `<line x1="256" y1="256" x2="${x}" y2="${y}"/>`).join('') + '</g></svg>';

  const css = `
#claude-chat-knopf{position:relative;color:var(--text-color,#fff);font-family:inherit;display:flex;align-items:center;justify-content:center}
#claude-chat-knopf svg{width:1.05em;height:1.05em;display:block}
#claude-chat-knopf[aria-pressed="true"]{opacity:1}
#claude-chat-knopf.schwebt{position:fixed;left:4.375rem;bottom:calc(var(--visible-viewport-bottom,0px) + var(--controls-mobile-occlusion,0px));
  width:4.375rem;height:4.375rem;z-index:1002;background:transparent;border:0;padding:0;font-size:2.25rem;line-height:1;
  cursor:pointer;opacity:.55;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
#claude-chat-knopf.schwebt:hover,#claude-chat-knopf.schwebt:focus-visible,#claude-chat-knopf.schwebt[aria-pressed="true"]{opacity:1}
#claude-chat-knopf.schwebt svg{width:1.875rem;height:1.875rem}
.ctrl-panel.cc-an .ctrl-panel-body{padding:0 !important;overflow:hidden !important;position:relative}
.ctrl-panel.cc-an .ctrl-panel-body>:not(.cc-chat):not(.cc-platz){display:none !important}
.ctrl-panel.cc-an .ctrl-layout-toggle{display:none !important}
.cc-platz{height:min(60vh,520px);pointer-events:none}
.cc-chat{position:absolute;inset:0;box-sizing:border-box;overflow:hidden;background:var(--bg-color,#000)}
.cc-chat iframe{position:absolute;inset:0;width:100%;height:100%;border:0;display:block;background:var(--bg-color,#000);opacity:0;transition:opacity .15s}
.cc-chat.bereit iframe{opacity:1}
.cc-skel{position:absolute;inset:0;padding:16px;display:flex;flex-direction:column;gap:12px;justify-content:flex-end;pointer-events:none}
.cc-skel i{display:block;height:14px;border-radius:4px;background:var(--ui-border,#2a2a2a);animation:cc-atmen 1.3s ease-in-out infinite}
.cc-skel i:nth-child(1){width:46%}.cc-skel i:nth-child(2){width:78%;animation-delay:.1s}.cc-skel i:nth-child(3){width:62%;animation-delay:.2s}
.cc-skel i:nth-child(4){width:30%;margin-left:auto;animation-delay:.3s}
.cc-chat.bereit .cc-skel,.cc-chat.fehler .cc-skel{display:none}
@keyframes cc-atmen{50%{opacity:.35}}
.cc-fehler{position:absolute;inset:0;display:none;align-items:center;justify-content:center;gap:12px;color:var(--text-color,#fff);font-family:inherit}
.cc-chat.fehler .cc-fehler{display:flex}
.cc-fehler button{background:transparent;color:inherit;border:1px solid var(--ui-border-stronger,#555);border-radius:6px;min-width:44px;height:44px;font:inherit;font-size:1.25rem;cursor:pointer}
.cc-rahmen{position:fixed;left:4.375rem;bottom:5rem;z-index:2147483000;width:min(400px,calc(100vw - 24px));height:min(620px,calc(100vh - 6rem));
  border:1px solid var(--ui-border,#2a2a2a);border-radius:8px;overflow:hidden;background:var(--bg-color,#000);box-shadow:0 8px 30px rgba(0,0,0,.55);display:none}
.cc-rahmen.an{display:block}
@media (prefers-reduced-motion:reduce){.cc-skel i{animation:none}.cc-chat iframe{transition:none}}`;

  let knopf = null;
  let panelEl = null;
  let behaelter = null;   // Panelkoerper oder schwebender Rahmen
  let chat = null;
  let platz = null;   // gibt dem Panel eine Ausgangshoehe; die Groesse bestimmt danach das Panel selbst
  let rahmen = null;
  let offen = false;
  let sequenz = 0;
  const neuZeiten = [];

  const kopfleiste = () => document.querySelector('.ctrl-panel-header .ctrl-header-buttons');

  async function csrf() {
    const r = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' });
    if (r.status !== 200) throw new Error('login ' + r.status);
    const me = await r.json();
    if (!me || !me.csrf) throw new Error('csrf');
    return me.csrf;
  }

  async function eintritt() {
    const token = await csrf();
    const r = await fetch('/api/seitenchat/oeffnen', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-0ne-Csrf': token },
      body: JSON.stringify({ seite }),
    });
    if (r.status !== 200) throw new Error(String(r.status));
    const d = await r.json();
    if (!d || typeof d.eintritt !== 'string' || !d.eintritt.startsWith(KANAL_ORIGIN + '/eintritt?t=')) throw new Error('antwort');
    return d.eintritt;
  }

  function chatBauen() {
    const c = document.createElement('div');
    c.className = 'cc-chat';
    c.setAttribute('data-oe-ui', '');
    c.innerHTML = '<div class="cc-skel"><i></i><i></i><i></i><i></i></div>'
      + '<div class="cc-fehler"><span class="cc-code"></span><button type="button" aria-label="claude">&#8635;</button></div>';
    c.querySelector('.cc-fehler button').addEventListener('click', () => laden(true));
    return c;
  }

  async function laden(neu) {
    const mein = ++sequenz;
    chat.classList.remove('bereit', 'fehler');
    chat.querySelector('iframe')?.remove();
    try {
      const url = await eintritt();
      if (mein !== sequenz || !offen) return;
      const f = document.createElement('iframe');
      f.title = 'claude';
      f.referrerPolicy = 'no-referrer';
      f.allow = '';
      f.addEventListener('load', () => { if (mein === sequenz) chat.classList.add('bereit'); });
      f.src = url;
      chat.appendChild(f);
    } catch (e) {
      if (mein !== sequenz) return;
      console.error('claude-chat:', e);
      chat.querySelector('.cc-code').textContent = 'claude ' + (/^\d+$/.test(e.message) ? e.message : '!');
      chat.classList.add('fehler');
    }
  }

  function zeigen(an) {
    offen = an;
    knopf.setAttribute('aria-pressed', String(an));
    // Leistenmodus hat keinen Platz fuer einen Chat: erst zurueck ins Panel
    if (an && panelEl && panelEl.classList.contains('bar-mode')) panelEl.querySelector('.ctrl-layout-toggle')?.click();
    if (panelEl) panelEl.classList.toggle('cc-an', an);
    if (rahmen) rahmen.classList.toggle('an', an);
    if (an) {
      if (!chat) chat = chatBauen();
      if (!platz) { platz = document.createElement('div'); platz.className = 'cc-platz'; }
      if (chat.parentNode !== behaelter) { behaelter.appendChild(platz); behaelter.appendChild(chat); }
      laden(false);
    } else {
      sequenz++;
      chat?.querySelector('iframe')?.remove();
      chat?.classList.remove('bereit', 'fehler');
      chat?.remove();
      platz?.remove();
    }
  }

  // Der Chat meldet "Tor abgelaufen": hoechstens 2 neue Tueren je Minute, sonst sichtbarer Fehler mit Wiederholen.
  addEventListener('message', (ev) => {
    if (ev.origin !== KANAL_ORIGIN || !ev.data || ev.data.typ !== '0ne-seitenchat-abgelaufen' || !offen) return;
    const jetzt = Date.now();
    while (neuZeiten.length && jetzt - neuZeiten[0] > FENSTER_MS) neuZeiten.shift();
    if (neuZeiten.length >= MAX_NEU) {
      sequenz++;
      chat.querySelector('iframe')?.remove();
      chat.querySelector('.cc-code').textContent = 'claude !';
      chat.classList.remove('bereit');
      chat.classList.add('fehler');
      return;
    }
    neuZeiten.push(jetzt);
    laden(true);
  });

  function platzieren() {
    const k = kopfleiste();
    if (k) {
      knopf.classList.remove('schwebt');
      panelEl = k.closest('.ctrl-panel');
      behaelter = panelEl.querySelector('.ctrl-panel-body');
      k.insertBefore(knopf, k.querySelector('.ctrl-layout-toggle'));
      rahmen?.remove();
      rahmen = null;
      return true;
    }
    if (!rahmen) {
      rahmen = document.createElement('div');
      rahmen.className = 'cc-rahmen';
      rahmen.setAttribute('data-oe-ui', '');
      document.body.appendChild(rahmen);
    }
    panelEl = null;
    behaelter = rahmen;
    knopf.classList.add('schwebt');
    if (!knopf.isConnected) document.body.appendChild(knopf);
    return false;
  }

  function bauen() {
    const st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);
    knopf = document.createElement('button');
    knopf.id = 'claude-chat-knopf';
    knopf.className = 'ctrl-header-btn';
    knopf.type = 'button';
    knopf.setAttribute('aria-label', 'claude');
    knopf.setAttribute('aria-pressed', 'false');
    knopf.innerHTML = SYMBOL;
    knopf.addEventListener('click', (e) => { e.stopPropagation(); zeigen(!offen); });
    knopf.addEventListener('pointerdown', (e) => e.stopPropagation());
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && offen) zeigen(false); });
    if (!platzieren()) {
      // das Panel entsteht oft erst nach diesem Skript: dann zieht das Symbol in die Kopfleiste um
      const mo = new MutationObserver(() => {
        if (!kopfleiste()) return;
        mo.disconnect();
        const war = offen;
        if (war) zeigen(false);
        platzieren();
        if (war) zeigen(true);
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' })
    .then((r) => { if (r.status === 200) bauen(); })
    .catch(() => { /* nicht eingeloggt oder offline: kein Symbol */ });
})();
