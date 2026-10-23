// Dev-only Live-Reload: pollt /_devmtime.php alle 2s. Das Script liefert den
// neuesten mtime über ALLE web-Dateien im dev-Tree → egal welche Datei du
// änderst, der Browser reloaded. Nur aktiv auf dev.* Hostnames.
(function devLiveReload() {
  if (!window.location.hostname.startsWith('dev.')) return;
  let lastStamp = null;
  let initialized = false;
  async function check() {
    try {
      const res = await fetch('/_devmtime.php?_lr=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) return;
      const stamp = (await res.text()).trim();
      if (!stamp || stamp === '0') return;
      if (initialized && lastStamp !== null && stamp !== lastStamp) {
        console.log('[live-reload] dev file changed → reload');
        location.reload();
        return;
      }
      lastStamp = stamp;
    } catch (e) {}
    initialized = true;
  }
  setInterval(check, 2000);
  setTimeout(check, 100);
})();
