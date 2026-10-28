<?php
declare(strict_types=1);
require_once __DIR__ . '/.auth/bootstrap.php';
require_once __DIR__ . '/.auth/csrf.php';

auth_session_start();

$next  = $_GET['next'] ?? '/';
$next  = preg_match('#^/(?!/)[A-Za-z0-9/_.%~-]*$#', $next) ? $next : '/';

// Already logged in? Back to where the login was asked for.
if (!empty($_SESSION['uid'])) {
  header('Location: ' . $next);
  exit;
}

$setup = setup_mode_active();

$csrf = csrf_token();

// The include files carry Apache SSI; readfile() from PHP would send the directives raw and break the head
// (stylesheet link cut off, menu unstyled). Render the subset the includes use.
function render_include(string $file, string $uri): string {
  $t = file_get_contents($file);
  $host = $_SERVER['HTTP_HOST'] ?? '';
  $t = preg_replace_callback('@<!--#if expr="%\{(\w+)\} (=~|!~) /(.*?)/" -->(.*?)<!--#endif -->@s',
    function ($m) use ($uri, $host) {
      $v = $m[1] === 'REQUEST_URI' ? $uri : $host;
      $hit = preg_match('~' . str_replace('~', '\\~', $m[3]) . '~', $v) === 1;
      return $hit === ($m[2] === '=~') ? $m[4] : '';
    }, $t);
  $t = preg_replace('~<!--#config [^>]*-->~', '', $t);
  $t = preg_replace_callback('~<!--#flastmod virtual="([^"]+)" -->~',
    fn($m) => (string) @filemtime(__DIR__ . '/' . ltrim($m[1], '/')), $t);
  if (str_contains($t, '<!--#')) {
    throw new RuntimeException('unsupported SSI directive in ' . basename($file));
  }
  return $t;
}
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><?= $setup ? 'Setup' : 'Enter' ?> 0nefinity</title>
<?= render_include(__DIR__ . '/includes/something-in-the-head.html', '/enternity') ?>
  <style>
    .enter-wrap { display:flex; min-height:100svh; min-height:100dvh; align-items:center; justify-content:center; padding:max(12px,min(4vw,24px)); box-sizing:border-box; }
    .enter-card, .enter-card * { white-space:normal; }
    .enter-card { max-width:360px; width:100%; padding:1.25rem; border:1px solid var(--text-color); border-radius:4px; box-sizing:border-box; }
    .enter-card h1 { margin:0 0 .25rem; font-size:2rem; line-height:1.2; }
    .enter-card .sub { opacity:.7; font-size:.875rem; margin:0 0 .75rem; }
    .enter-card label { display:block; margin-top:.625rem; font-size:.875rem; }
    .enter-card input[type=text], .enter-card input[type=password] {
      width:100%; padding:10px 12px; font-size:16px; min-height:44px;
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
      width:100%; margin-top:.75rem; min-height:44px;
      background:var(--text-color); color:var(--bg-color);
      border:0; border-radius:2px; cursor:pointer; font-size:1rem;
    }
    .submit-btn:disabled { opacity:.5; cursor:wait; }
    .error-slot { min-height:1.25rem; margin-top:.5rem; font-size:.875rem; color:#ff4040; }
    code { font-size:.8rem; word-break:break-all; }
    @media (max-height:640px) { .enter-card h1 { font-size:1.5rem; } .enter-card .sub { margin-bottom:.5rem; } }
  </style>
</head>
<body>
<?= render_include(__DIR__ . '/includes/something-in-the-body.html', '/enternity') ?>
  <div class="enter-wrap">
    <form class="enter-card" id="enter-form"
          method="post"
          action="<?= $setup ? '/api/auth/setup' : '/api/auth/login' ?>">
      <?php if ($setup): ?>
        <h1>Setup 0nefinity</h1>
        <p class="sub">First run. Read your setup-token from<br><code>.auth/setup-token</code> on the server</p>
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
        <p class="sub">Enter username and password and press enter to enter 0nefinity.</p>
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
        window.location.href = j.redirect || '/';
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
