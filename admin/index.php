<?php
declare(strict_types=1);
require_once __DIR__ . '/../.auth/bootstrap.php';
require_once __DIR__ . '/../.auth/csrf.php';

$user = require_auth();
$csrf = csrf_token();
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>0nefinity admin</title>
  <link rel="stylesheet" href="/meta.css">
  <style>
    .admin-wrap { padding:2rem; max-width:1200px; margin:0 auto; }
    .admin-bar { display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--text-color); padding-bottom:1rem; gap:1rem; flex-wrap:wrap; }
    .admin-bar strong { font-size:1.1rem; }
    .admin-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:1rem; margin-top:2rem; }
    .admin-card { border:1px solid var(--text-color); padding:1.5rem; border-radius:4px; }
    .admin-card h2 { margin:0 0 .5rem; font-size:1.1rem; }
    .admin-card p { margin:0; opacity:.6; font-size:.875rem; }
    .logout-btn { background:transparent; border:1px solid var(--text-color); color:var(--text-color); padding:.5rem 1rem; cursor:pointer; border-radius:2px; min-height:40px; font-size:1rem; }
    .logout-btn:focus-visible { outline:2px solid var(--text-color); outline-offset:2px; }
    .analytics-section { margin-top:2rem; }
    .analytics-section h2 { margin:0 0 .75rem; font-size:1.1rem; }
    .analytics-frame-wrap {
      position:relative;
      border:1px solid var(--text-color);
      border-radius:4px;
      overflow:hidden;
      background:var(--bg-color);
    }
    .analytics-frame {
      width:100%;
      height:75vh;
      min-height:480px;
      border:0;
      display:block;
    }
    .analytics-hint {
      font-size:.8rem; opacity:.6; margin-top:.5rem;
    }
    .analytics-hint a { color:inherit; text-decoration:underline; }
  </style>
</head>
<body>
<div class="admin-wrap">
  <div class="admin-bar">
    <strong>0nefinity admin</strong>
    <button class="logout-btn" id="logout">logout</button>
  </div>
  <p style="margin-top:1.5rem;">Welcome, <?= htmlspecialchars($user['username']) ?>.</p>

  <section class="analytics-section">
    <h2>Analytics (Umami)</h2>
    <div class="analytics-frame-wrap">
      <iframe class="analytics-frame"
              src="https://analytics.timbreitmar.de"
              title="Umami analytics"
              loading="lazy"
              referrerpolicy="no-referrer-when-downgrade"></iframe>
    </div>
    <p class="analytics-hint">
      Falls hier nur ein Login-Screen erscheint:
      <a href="https://analytics.timbreitmar.de" target="_blank" rel="noopener">in neuem Tab bei Umami einloggen</a>,
      danach diese Seite neu laden — die Umami-Cookies werden dann hier mitgenommen.
    </p>
  </section>

  <div class="admin-grid">
    <div class="admin-card"><h2>Users</h2><p>(coming soon — Phase 2: invite + roles)</p></div>
    <div class="admin-card"><h2>Settings</h2><p>(coming soon)</p></div>
  </div>
</div>
<script>
  document.getElementById('logout').addEventListener('click', async () => {
    const r = await fetch('/api/auth/logout', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({csrf: <?= json_encode($csrf) ?>}),
    });
    const j = await r.json().catch(()=>({}));
    window.location.href = j.redirect || '/enternity';
  });
</script>
</body>
</html>
