<?php
declare(strict_types=1);
require_once __DIR__ . '/.auth/bootstrap.php';
require_once __DIR__ . '/.auth/csrf.php';

auth_session_start();

// Already logged in? → /admin
if (!empty($_SESSION['uid'])) {
  header('Location: /admin');
  exit;
}

$setup = setup_mode_active();
$next  = $_GET['next'] ?? '/admin';
$next  = preg_match('#^/[a-zA-Z0-9/_-]*$#', $next) ? $next : '/admin';

$csrf = csrf_token();
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><?= $setup ? 'Setup' : 'Enter' ?> 0nefinity</title>
  <link rel="stylesheet" href="/meta.css">
  <style>
    .enter-wrap { display:flex; min-height:100svh; align-items:center; justify-content:center; padding:4vw; }
    .enter-card { max-width:360px; width:100%; padding:2rem; border:1px solid var(--text-color); border-radius:4px; }
    .enter-card h1 { margin:0 0 .5rem; }
    .enter-card .sub { opacity:.7; font-size:.875rem; margin-bottom:1.5rem; }
    .enter-card label { display:block; margin-top:1rem; font-size:.875rem; }
    .enter-card input[type=text], .enter-card input[type=password] {
      width:100%; padding:12px; font-size:16px; min-height:44px;
      background:transparent; color:var(--text-color);
      border:1px solid var(--text-color); border-radius:2px;
      box-sizing:border-box;
    }
    .pw-row { display:flex; gap:.25rem; align-items:stretch; }
    .pw-row input { flex:1; }
    .eye-btn {
      min-width:44px; min-height:44px; padding:0;
      background:transparent; color:var(--text-color);
      border:1px solid var(--text-color); border-radius:2px;
      cursor:pointer; font-size:1rem;
    }
    .eye-btn:focus-visible { outline:2px solid var(--text-color); outline-offset:2px; }
    .submit-btn {
      width:100%; margin-top:1.25rem; min-height:44px;
      background:var(--text-color); color:var(--bg-color);
      border:0; border-radius:2px; cursor:pointer; font-size:1rem;
    }
    .submit-btn:disabled { opacity:.5; cursor:wait; }
    .error-slot { min-height:1.5rem; margin-top:1rem; font-size:.875rem; color:#ff4040; }
    code { font-size:.8rem; word-break:break-all; }
  </style>
</head>
<body>
  <div class="enter-wrap">
    <form class="enter-card" id="enter-form"
          method="post"
          action="<?= $setup ? '/api/auth/setup' : '/api/auth/login' ?>">
      <?php if ($setup): ?>
        <h1>Setup 0nefinity</h1>
        <p class="sub">First run. Read your setup-token via<br><code>docker exec 0nefinity-live cat /var/www/html/.auth/setup-token</code></p>
        <?= csrf_field() ?>
        <label>Username
          <input type="text" name="username" value="<?= htmlspecialchars(FIXED_USERNAME) ?>" readonly autocomplete="username">
        </label>
        <label>Setup token
          <input type="text" name="token" autocomplete="off" required>
        </label>
        <label>New password (min <?= PW_MIN_LEN ?> chars)
          <div class="pw-row">
            <input type="password" name="password" id="pw" autocomplete="new-password" required minlength="<?= PW_MIN_LEN ?>">
            <button type="button" class="eye-btn" id="eye" aria-label="show password">eye</button>
          </div>
        </label>
        <label>Confirm password
          <input type="password" name="password_confirm" autocomplete="new-password" required minlength="<?= PW_MIN_LEN ?>">
        </label>
        <button type="submit" class="submit-btn">Setup</button>
      <?php else: ?>
        <h1>Enter 0nefinity</h1>
        <p class="sub">Enter username and pw and press enter to enter 0nefinity.</p>
        <?= csrf_field() ?>
        <input type="hidden" name="next" value="<?= htmlspecialchars($next) ?>">
        <label>Username
          <input type="text" name="username" autocomplete="username" required>
        </label>
        <label>Password
          <div class="pw-row">
            <input type="password" name="password" id="pw" autocomplete="current-password" required>
            <button type="button" class="eye-btn" id="eye" aria-label="show password">eye</button>
          </div>
        </label>
        <button type="submit" class="submit-btn">Enter</button>
      <?php endif; ?>
      <div class="error-slot" id="err" role="alert"></div>
    </form>
  </div>

<script>
  const eye = document.getElementById('eye');
  const pw  = document.getElementById('pw');
  eye?.addEventListener('click', () => {
    pw.type = pw.type === 'password' ? 'text' : 'password';
    eye.textContent = pw.type === 'password' ? 'eye' : 'hide';
  });

  const form = document.getElementById('enter-form');
  const err  = document.getElementById('err');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    const btn = form.querySelector('.submit-btn');
    btn.disabled = true;
    const fd = new FormData(form);
    const body = Object.fromEntries(fd.entries());
    try {
      const r = await fetch(form.action, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) {
        window.location.href = j.redirect || '/admin';
        return;
      }
      err.textContent = j.error || 'Falsche Logindaten';
    } catch (ex) {
      err.textContent = 'Netzwerk-Fehler';
    } finally {
      btn.disabled = false;
    }
  });
</script>
</body>
</html>
