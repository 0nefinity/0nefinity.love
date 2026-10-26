// Cookie banner of 0nefinity.com. cookies.html holds markup and style; on every other
// page this script fetches both from /cookies, so the editor keeps one source.
(function () {
  'use strict';

  function boot() {

    // one card payment is at most 999.999 (Stripe allows eight digits in cents); larger sums are split
    var MAX_PAYMENT = 999999n;
    var SYMBOL = { EUR: '€', USD: '$' };

    var $ = function (id) { return document.getElementById(id); };
    var backdrop = $('ck-backdrop');
    var countEl = $('ck-count');
    var next = $('ck-next');
    var cur = 'EUR';
    var infinite = false;

    // whole cookies only; every "," or "." starts a fraction, there are no thousands separators.
    // cut: a fraction was dropped
    function wholePart(str) {
      var v = String(str).replace(/\s/g, '');
      var sep = v.search(/[.,]/);
      if (sep < 0) return { value: v, cut: false };
      return { value: v.slice(0, sep) || '0', cut: true };
    }

    // count string -> BigInt cookies, or null if unreadable
    function parseCount(str) {
      var v = wholePart(str).value;
      if (v === '') return 0n;
      return /^\d+$/.test(v) ? BigInt(v) : null;
    }

    function money(amount) {
      return new Intl.NumberFormat('de-DE', { style: 'currency', currency: cur, maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(amount);
    }

    // transfer reference: 256 random bits as 64 uppercase hex, fits the 140-char SEPA field
    function makeKey() {
      var bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      return Array.prototype.map.call(bytes, function (b) { return b.toString(16).padStart(2, '0'); }).join('').toUpperCase();
    }
    var KEY = makeKey();
    $('ck-key').textContent = KEY.match(/.{16}/g).join(' ');

    function renderNext(count) {
      if (infinite) {
        $('ck-bank-ask').textContent = 'Bitte überweisen Sie ∞ ' + SYMBOL[cur] + ' auf folgendes Konto.';
        $('ck-card-line').textContent = 'Zahlung 1 von ∞: ' + money(MAX_PAYMENT);
        return;
      }
      var payments = (count + MAX_PAYMENT - 1n) / MAX_PAYMENT;
      $('ck-bank-ask').textContent = 'Bitte überweisen Sie ' + money(count) + ' auf folgendes Konto.';
      $('ck-card-line').textContent = 'Zahlung 1 von ' + payments + ': ' + money(count < MAX_PAYMENT ? count : MAX_PAYMENT);
    }

    function renderSum(count) {
      $('ck-sum').textContent = infinite
        ? 'Sie erhalten ∞ Cookies für nur ∞ ' + SYMBOL[cur]
        : 'Sie erhalten ' + new Intl.NumberFormat('de-DE').format(count) + (count === 1n ? ' Cookie' : ' Cookies') + ' für nur ' + money(count);
    }

    // shrink the digits until the whole number shows (13 digits fit at 320 px); below 6px the field scrolls
    var measure = document.createElement('canvas').getContext('2d');
    function fitField() {
      countEl.style.fontSize = '';
      var cs = getComputedStyle(countEl);
      var room = countEl.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 2;
      measure.font = '16px ' + cs.fontFamily;
      var width = measure.measureText(countEl.value).width;
      if (width > room) countEl.style.fontSize = Math.max(6, Math.floor(16 * room / width * 10) / 10) + 'px';
    }

    var crumbsOn = false;
    function render() {
      if (infinite) countEl.value = '∞';
      var count = infinite ? null : parseCount(countEl.value);
      var ok = infinite || (count !== null && count >= 1n);
      $('ck-rate').textContent = '1 Cookie = 1 ' + SYMBOL[cur];
      document.querySelectorAll('[data-cur]').forEach(function (b) {
        b.setAttribute('aria-pressed', b.dataset.cur === cur ? 'true' : 'false');
      });
      $('ck-inf').setAttribute('aria-pressed', infinite ? 'true' : 'false');
      var hint = crumbsOn ? 'ck-crumbs' : ok ? 'ck-sum' : count === null ? 'ck-invalid' : 'ck-zero';
      if (ok) renderSum(count);
      ['ck-zero', 'ck-crumbs', 'ck-invalid', 'ck-sum'].forEach(function (id) { $(id).classList.toggle('is-off', id !== hint); });
      $('ck-pay-now').disabled = !ok;
      if (!ok) next.hidden = true;
      if (!next.hidden) renderNext(count);
      fitField();
    }

    function setCount(v) {
      infinite = v === 'inf';
      if (!infinite) countEl.value = v.toString();
      render();
    }

    function current() { return parseCount(countEl.value) || 0n; }

    // ∞ minus anything is still ∞, so the minus buttons leave ∞ for the start value
    function down(fn) { setCount(infinite ? 1n : fn(current())); }
    function up(fn) { if (!infinite) setCount(fn(current())); }

    function open() {
      next.hidden = true;
      backdrop.hidden = false;
      document.body.classList.add('ck-locked');
      render();
    }

    // only the shop page has a way back in; elsewhere the banner is the door and stays
    var reopen = $('ck-reopen');
    function close() {
      if (!reopen) { next.hidden = true; render(); return; }
      backdrop.hidden = true;
      document.body.classList.remove('ck-locked');
      reopen.focus();
    }

    // rewrite the field to whole cookies; a dropped fraction flashes the hint
    var crumbsTimer, settleTimer;
    function settle() {
      clearTimeout(settleTimer);
      if (infinite) return;
      var w = wholePart(countEl.value);
      if (w.cut) {
        countEl.value = w.value;
        crumbsOn = true;
        clearTimeout(crumbsTimer);
        crumbsTimer = setTimeout(function () { crumbsOn = false; render(); }, 2500);
      }
      render();
    }

    // typed "1," is still on its way to "1,5", so typing settles after a short pause;
    // a paste or a drop settles at once
    countEl.addEventListener('input', function (e) {
      infinite = /∞|inf/i.test(countEl.value);
      clearTimeout(settleTimer);
      if (/^insert(FromPaste|FromDrop)$/.test(e.inputType || '')) settle();
      else { settleTimer = setTimeout(settle, 800); render(); }
    });
    countEl.addEventListener('change', settle);
    countEl.addEventListener('focus', function () { if (infinite) countEl.select(); });
    // holding a step button repeats it, with the timing of the slider buttons in controls.js
    // (400 ms, then every 80 ms); controls.js keeps that inside addSlider, so it lives here
    function holdable(btn, act) {
      var wait = null, again = null, viaPointer = false;
      function stop() { clearTimeout(wait); clearInterval(again); wait = again = null; }
      btn.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        viaPointer = true;
        btn.setPointerCapture(e.pointerId);
        stop();
        act();
        wait = setTimeout(function () { again = setInterval(act, 80); }, 400);
      });
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (t) { btn.addEventListener(t, stop); });
      btn.addEventListener('click', function () {
        if (viaPointer) { viaPointer = false; return; }
        act();
      });
    }
    holdable($('ck-div'), function () { down(function (c) { return c / 10n; }); });
    holdable($('ck-minus'), function () { down(function (c) { return c > 0n ? c - 1n : 0n; }); });
    holdable($('ck-plus'), function () { up(function (c) { return c + 1n; }); });
    holdable($('ck-mul'), function () { up(function (c) { return c === 0n ? 1n : c * 10n; }); });
    $('ck-inf').addEventListener('click', function () { setCount('inf'); });
    document.querySelectorAll('[data-cur]').forEach(function (b) {
      b.addEventListener('click', function () { cur = b.dataset.cur; render(); });
    });
    $('ck-pay-now').addEventListener('click', function () {
      next.hidden = false;
      $('ck-copy-note').textContent = '';
      render();
      next.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
    $('ck-copy').addEventListener('click', function () {
      var note = $('ck-copy-note');
      if (!navigator.clipboard) { note.textContent = 'Kopieren geht hier nicht, bitte den Schlüssel markieren und kopieren.'; return; }
      navigator.clipboard.writeText(KEY).then(
        function () { note.textContent = 'Kopiert.'; },
        function () { note.textContent = 'Kopieren ging nicht, bitte den Schlüssel markieren und kopieren.'; }
      );
    });
    $('ck-bank-done').addEventListener('click', close);
    $('ck-card').addEventListener('click', close);
    if (reopen) reopen.addEventListener('click', open);

    document.querySelectorAll('[data-draft]').forEach(function (b) {
      b.addEventListener('click', function () {
        $('ck-shop-note').textContent = 'Entwurf: ' + b.dataset.draft + ' ist noch nicht verbunden.';
      });
    });

    open();
  }

  // pages without meta.css have no theme variables; give the banner the dark defaults
  function themeFallback(el) {
    if (getComputedStyle(document.documentElement).getPropertyValue('--bg-color').trim()) return;
    var vars = { '--bg-color': '#000', '--text-color': '#fff', '--ui-surface-strong': '#111',
      '--ui-border': '#444', '--ui-border-soft': '#222', '--ui-border-strong': '#555' };
    Object.keys(vars).forEach(function (k) { el.style.setProperty(k, vars[k]); });
    el.style.color = '#fff';
    el.style.fontFamily = 'system-ui, sans-serif';
  }

  if (document.getElementById('ck-backdrop')) { boot(); return; }

  fetch('/cookies', { credentials: 'same-origin' })
    .then(function (r) {
      if (!r.ok) throw new Error('/cookies answered ' + r.status);
      return r.text();
    })
    .then(function (text) {
      var doc = new DOMParser().parseFromString(text, 'text/html');
      var style = doc.querySelector('head style');
      var banner = doc.getElementById('ck-backdrop');
      if (!style || !banner) throw new Error('/cookies has no banner');
      document.head.appendChild(document.importNode(style, true));
      var node = document.importNode(banner, true);
      themeFallback(node);
      document.body.appendChild(node);
      boot();
    })
    .catch(function (err) { console.error('cookies-banner:', err); });
})();
