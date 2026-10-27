// Dev-only Live-Reload: pollt /_devmtime.php alle 2s. Das Script liefert den
// neuesten mtime über ALLE web-Dateien im dev-Tree → egal welche Datei du
// änderst, der Browser reloaded. Nur aktiv auf dev.* Hostnames.
// Fail loud: Fällt der Poll aus, meldet console.error genau einmal je Störung
// (nicht alle 2 s) und wieder einmal, sobald der Poll zurück ist.
(function devLiveReload() {
  if (!window.location.hostname.startsWith('dev.')) return;
  let lastStamp = null;
  let initialized = false;
  let failing = false;
  let unloading = false;
  // Beim Seitenwechsel bricht der Browser den laufenden fetch ab; das ist kein Ausfall.
  // Aus dem bfcache zurueck (pageshow persisted) lebt die Seite wieder und muss Ausfaelle melden.
  window.addEventListener('pagehide', () => { unloading = true; });
  window.addEventListener('pageshow', () => { unloading = false; });

  function fail(reason) {
    if (failing || unloading) return;
    failing = true;
    console.error('[live-reload] ausgefallen, Seite lädt nicht mehr automatisch neu: ' + reason);
  }

  async function check() {
    if (document.hidden) return;
    // Editor (tools/editor.js) im Bearbeiten-Modus: kein Reload, sonst gehen Eingaben verloren.
    if (window.__oneEditing) return;
    try {
      const res = await fetch('/_devmtime.php?_lr=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) { fail('HTTP ' + res.status); return; }
      const stamp = (await res.text()).trim();
      if (!stamp || stamp === '0') { fail('leerer Zeitstempel von /_devmtime.php'); return; }
      if (failing) {
        failing = false;
        console.warn('[live-reload] wieder erreichbar');
      }
      // Erneut pruefen: waehrend des fetch kann das Bearbeiten begonnen haben. Eingeloggte (__oneEditor)
      // laden nie automatisch neu, sie sehen fremde Aenderungen beim naechsten eigenen Laden.
      if (window.__oneEditing || window.__oneEditor) { lastStamp = stamp; return; }
      if (initialized && lastStamp !== null && stamp !== lastStamp) {
        console.log('[live-reload] dev file changed → reload');
        location.reload();
        return;
      }
      lastStamp = stamp;
      initialized = true;
    } catch (e) {
      fail(String(e));
    }
  }
  // Der Editor schreibt selbst Dateien (speichern, veroeffentlichen); danach den
  // neuen Stand als Basis nehmen statt neu zu laden.
  window.__oneReloadResync = () => { initialized = false; };
  document.addEventListener('visibilitychange', check);
  setInterval(check, 2000);
  setTimeout(check, 100);
})();
