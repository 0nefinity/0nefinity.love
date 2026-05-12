# Enternity Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementiere `/enternity` Login + `/admin` Stub-Dashboard für `0nefinity.love`, Phase 1 (Single-User `0nefinity`, Setup-Token-Flow, Argon2id, HIBP-Check, CSP report-only).

**Architecture:** PHP 8.3 im bestehenden Apache-Container. SQLite (`/var/www/html/.auth/auth.sqlite`) in separatem rw-Volume. Server-side PHP-Sessions mit HttpOnly+Secure+SameSite=Strict-Cookies. Setup über einmalig generiertes Token (File-basiert), danach Argon2id+HIBP für PW-Validation.

**Tech Stack:** PHP 8.3, SQLite/PDO, Argon2id (`password_hash`), native PHP-Sessions, Apache 2.4 + mod_rewrite, Docker Compose (Named Volume).

**Spec:** `docs/specs/2026-05-12-enternity-login-design.md` (commit `0d7f22f`)

**Branch-Strategie:** Feature-Branch `feat/enternity-login`, kein direkter main-Push (Tim's Workflow). PR am Ende. Spec-Docs direkt auf main ist erlaubt (Memory `feedback_no_direct_main_push.md` betrifft Code).

**Dev-Hinweis:** Dev-Worktree ist git-broken (Memory `reference_0nefinity_dev_workflow.md`). Implementation findet im main-Repo statt, lokal mit `claude-dev`-Branch testen, dann PR auf main, Merge + Deploy.

---

## File Structure

**Neu zu erstellende Dateien:**

```
/home/timbr/0nefinity/
├── docker-compose.yml                     ← MODIFY: Volume für .auth/
├── Dockerfile                             ← MODIFY: entrypoint hinzufügen
├── entrypoint.sh                          ← NEW: bootstrap setup-token bei container start
└── 0nefinity.love/
    ├── .htaccess                          ← MODIFY: Routing für /enternity, /admin, /api/auth/*, /.auth/ deny
    ├── enternity.php                      ← NEW: GET /enternity (Login + Setup-Modus)
    ├── admin/
    │   └── index.php                      ← NEW: GET /admin (auth-guarded stub)
    ├── api/
    │   ├── auth/
    │   │   ├── login.php                  ← NEW: POST
    │   │   ├── logout.php                 ← NEW: POST
    │   │   ├── me.php                     ← NEW: GET
    │   │   └── setup.php                  ← NEW: POST (initial setup)
    │   └── csp-report.php                 ← NEW: CSP report-only sink
    ├── .auth/                             ← NEW dir, web-blocked
    │   ├── .htaccess                      ← NEW: Require all denied
    │   ├── auth.sqlite                    ← runtime (im Volume)
    │   ├── setup-token                    ← runtime (im Volume, temporär)
    │   ├── schema.sql                     ← NEW: CREATE TABLEs
    │   ├── bootstrap.php                  ← NEW: lib (PDO, session-init, helpers)
    │   ├── csrf.php                       ← NEW: lib
    │   ├── hibp.php                       ← NEW: lib (k-anonymity-Check)
    │   └── rate-limit.php                 ← NEW: lib (sliding window + exp backoff)
    └── tools/
        └── auth-cli.php                   ← NEW: CLI: set-password, list-users, create-invite
```

**File-Responsibilities:**
- `.auth/bootstrap.php` — central require, opens PDO, configures session, defines `require_auth()` helper
- `.auth/csrf.php` — `csrf_token()`, `csrf_verify($posted)`, both use `$_SESSION['csrf']`
- `.auth/hibp.php` — `hibp_pwned_count($pw): int` (returns 0 if not in HIBP)
- `.auth/rate-limit.php` — `rate_limit_check($ip): array` (returns `['ok'=>bool, 'retry_after'=>int]`), `rate_limit_record($ip, $success)`
- `enternity.php` — GET; checks setup-mode (empty users + setup-token exists), renders Login OR Setup form
- `api/auth/setup.php` — POST; token-compare via `hash_equals`, HIBP-check, create user `0nefinity`, delete token-file
- `api/auth/login.php` — POST; rate-limit, CSRF, password_verify, session_regenerate
- `api/auth/logout.php` — POST; CSRF, session_destroy, clear cookie
- `api/auth/me.php` — GET; returns `{user: {username, role}}` or 401
- `admin/index.php` — GET; auth-guard, renders stub dashboard
- `api/csp-report.php` — POST; logs to `.auth/csp-violations.log`
- `tools/auth-cli.php` — CLI-only (`php_sapi_name() === 'cli'` guard); subcommands

---

## Task 1: Feature-Branch erstellen + Plan auf main pushen

**Files:** keine Code-Änderungen, nur Branching.

- [ ] **Step 1: Feature-Branch erstellen vom aktuellen main**

```bash
cd /home/timbr/0nefinity/0nefinity.love
git fetch origin
git checkout -b feat/enternity-login origin/main
git push -u origin feat/enternity-login
```

Expected: `Branch 'feat/enternity-login' set up to track 'origin/feat/enternity-login'`

- [ ] **Step 2: Verify branch**

```bash
git branch --show-current
```

Expected: `feat/enternity-login`

---

## Task 2: SQLite Schema (`.auth/schema.sql`)

**Files:**
- Create: `/home/timbr/0nefinity/0nefinity.love/.auth/schema.sql`
- Create: `/home/timbr/0nefinity/0nefinity.love/.auth/.htaccess`

- [ ] **Step 1: Schema-File anlegen**

Datei `0nefinity.love/.auth/schema.sql`:

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  email         TEXT,
  role          TEXT NOT NULL DEFAULT 'admin',
  created_at    INTEGER NOT NULL,
  last_login_at INTEGER
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ip         TEXT NOT NULL,
  username   TEXT,
  success    INTEGER NOT NULL,
  ts         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attempts_ip_ts ON login_attempts(ip, ts);

CREATE TABLE IF NOT EXISTS invite_tokens (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash  TEXT UNIQUE NOT NULL,
  email       TEXT,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  used_at     INTEGER,
  used_by_uid INTEGER REFERENCES users(id)
);
```

- [ ] **Step 2: `.htaccess` in `.auth/` schreiben (web-deny)**

Datei `0nefinity.love/.auth/.htaccess`:

```apache
Require all denied
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteRule .* - [F,L]
</IfModule>
```

- [ ] **Step 3: Verify Files existieren**

```bash
ls -la /home/timbr/0nefinity/0nefinity.love/.auth/
```

Expected: zeigt `schema.sql` und `.htaccess`

- [ ] **Step 4: Commit**

```bash
cd /home/timbr/0nefinity/0nefinity.love
git add .auth/schema.sql .auth/.htaccess
git commit -m "feat(auth): sqlite schema + .auth/ deny .htaccess"
```

---

## Task 3: docker-compose.yml — Named Volume für `.auth/`

**Files:**
- Modify: `/home/timbr/0nefinity/docker-compose.yml`

- [ ] **Step 1: Volume-Section ergänzen**

Edit `/home/timbr/0nefinity/docker-compose.yml`:

```yaml
services:
  live:
    build: .
    container_name: 0nefinity-live
    restart: unless-stopped
    ports:
      - "127.0.0.1:18:80"
    volumes:
      - ./0nefinity.love:/var/www/html:ro
      - 0nefinity-auth-live:/var/www/html/.auth

  dev:
    build: .
    container_name: 0nefinity-dev
    restart: unless-stopped
    ports:
      - "127.0.0.1:129:80"
    volumes:
      - ./dev.0nefinity.love/0nefinity-dev:/var/www/html
      - 0nefinity-auth-dev:/var/www/html/.auth

volumes:
  0nefinity-auth-live:
  0nefinity-auth-dev:
```

- [ ] **Step 2: Verify YAML-Syntax**

```bash
cd /home/timbr/0nefinity
docker compose config > /dev/null && echo "YAML OK"
```

Expected: `YAML OK`

- [ ] **Step 3: Commit (im `/home/timbr/0nefinity/` Repo — check ob git-Repo)**

```bash
cd /home/timbr/0nefinity
git status 2>&1 | head -5
```

Falls **kein git-Repo:** Datei einfach speichern, kein Commit nötig (Server-lokal).
Falls **git-Repo:** Commit mit Message `chore(docker): add 0nefinity-auth volume for /.auth/`

---

## Task 4: Container-Entrypoint für Setup-Token

**Files:**
- Create: `/home/timbr/0nefinity/entrypoint.sh`
- Modify: `/home/timbr/0nefinity/Dockerfile`

- [ ] **Step 1: entrypoint.sh schreiben**

Datei `/home/timbr/0nefinity/entrypoint.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

AUTH_DIR="/var/www/html/.auth"
DB="$AUTH_DIR/auth.sqlite"
TOKEN_FILE="$AUTH_DIR/setup-token"
SCHEMA="/var/www/html/.auth/schema.sql"

# Ensure .auth dir exists (volume-mounted, may be empty on first start)
mkdir -p "$AUTH_DIR"

# Init DB if missing
if [ ! -f "$DB" ]; then
  echo "[entrypoint] initializing auth.sqlite"
  sqlite3 "$DB" < "$SCHEMA"
fi

# Generate setup-token if no users yet AND no token-file
USER_COUNT=$(sqlite3 "$DB" "SELECT COUNT(*) FROM users;")
if [ "$USER_COUNT" = "0" ] && [ ! -f "$TOKEN_FILE" ]; then
  TOKEN=$(openssl rand -hex 32)
  echo -n "$TOKEN" > "$TOKEN_FILE"
  chmod 600 "$TOKEN_FILE"
  echo "[entrypoint] generated setup-token: cat $TOKEN_FILE"
fi

# Cleanup: delete token-file if users already exist
if [ "$USER_COUNT" -gt "0" ] && [ -f "$TOKEN_FILE" ]; then
  rm -f "$TOKEN_FILE"
fi

# Permissions for Apache
chown -R www-data:www-data "$AUTH_DIR"
chmod 750 "$AUTH_DIR"
chmod 640 "$DB"

# Hand off to Apache
exec apache2-foreground
```

- [ ] **Step 2: Dockerfile updaten**

Edit `/home/timbr/0nefinity/Dockerfile` — am Ende vor `EXPOSE 80` ergänzen:

```dockerfile
# sqlite3 CLI für entrypoint + openssl für token-gen (openssl ist meist schon da)
RUN apt-get update && apt-get install -y sqlite3 && rm -rf /var/lib/apt/lists/*

# pdo_sqlite für PHP
RUN docker-php-ext-install pdo pdo_sqlite

# Entrypoint
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
```

- [ ] **Step 3: Verify Dockerfile-Syntax mit build (auf dev-Container, nicht live!)**

```bash
cd /home/timbr/0nefinity
docker compose build dev 2>&1 | tail -20
```

Expected: Build succeeds, kein `ERROR`. Image wird gebaut, aber Container noch nicht neu gestartet.

- [ ] **Step 4: Commit (falls git-Repo)**

Message: `feat(docker): entrypoint with setup-token generation + pdo_sqlite`

---

## Task 5: `.auth/bootstrap.php` — central library

**Files:**
- Create: `/home/timbr/0nefinity/0nefinity.love/.auth/bootstrap.php`

- [ ] **Step 1: bootstrap.php schreiben**

Datei `0nefinity.love/.auth/bootstrap.php`:

```php
<?php
declare(strict_types=1);

// Path constants
define('AUTH_DIR', __DIR__);
define('AUTH_DB',  AUTH_DIR . '/auth.sqlite');
define('SETUP_TOKEN_FILE', AUTH_DIR . '/setup-token');
define('CSP_LOG', AUTH_DIR . '/csp-violations.log');

// Argon2id parameters (OWASP 2024+)
define('PW_HASH_OPTS', [
  'memory_cost' => 65536, // 64 MiB
  'time_cost'   => 4,
  'threads'     => 1,
]);
define('PW_MIN_LEN', 12);
define('FIXED_USERNAME', '0nefinity');

// Session config — MUST run before session_start()
function auth_session_start(): void {
  if (session_status() === PHP_SESSION_ACTIVE) return;
  ini_set('session.use_strict_mode', '1');
  ini_set('session.cookie_httponly', '1');
  ini_set('session.cookie_secure',   '1');
  ini_set('session.cookie_samesite', 'Strict');
  ini_set('session.gc_maxlifetime',  '1209600'); // 14 days
  ini_set('session.use_only_cookies','1');

  session_set_cookie_params([
    'lifetime' => 1209600,
    'path'     => '/',
    'secure'   => true,
    'httponly' => true,
    'samesite' => 'Strict',
  ]);
  session_start();
}

// PDO (singleton)
function auth_db(): PDO {
  static $pdo = null;
  if ($pdo === null) {
    $pdo = new PDO('sqlite:' . AUTH_DB);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec('PRAGMA foreign_keys = ON;');
  }
  return $pdo;
}

function setup_mode_active(): bool {
  $cnt = (int) auth_db()->query('SELECT COUNT(*) c FROM users')->fetch()['c'];
  return $cnt === 0 && is_file(SETUP_TOKEN_FILE);
}

function require_auth(): array {
  auth_session_start();
  if (empty($_SESSION['uid'])) {
    $next = $_SERVER['REQUEST_URI'] ?? '/admin';
    header('Location: /enternity?next=' . urlencode($next));
    exit;
  }
  $u = auth_db()->prepare('SELECT id, username, role FROM users WHERE id = ?');
  $u->execute([$_SESSION['uid']]);
  $user = $u->fetch();
  if (!$user) {
    session_destroy();
    header('Location: /enternity');
    exit;
  }
  return $user;
}

function client_ip(): string {
  // Behind nginx, RemoteIP module already populates REMOTE_ADDR.
  return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
}

function json_response(array $data, int $code = 200): void {
  http_response_code($code);
  header('Content-Type: application/json');
  echo json_encode($data, JSON_UNESCAPED_SLASHES);
  exit;
}
```

- [ ] **Step 2: Verify syntax**

```bash
docker exec 0nefinity-dev php -l /var/www/html/.auth/bootstrap.php 2>&1 || \
  php -l /home/timbr/0nefinity/0nefinity.love/.auth/bootstrap.php
```

Expected: `No syntax errors detected`

- [ ] **Step 3: Commit**

```bash
git add .auth/bootstrap.php
git commit -m "feat(auth): bootstrap lib (PDO, session config, require_auth)"
```

---

## Task 6: `.auth/csrf.php` — Double-Submit Token

**Files:**
- Create: `/home/timbr/0nefinity/0nefinity.love/.auth/csrf.php`

- [ ] **Step 1: csrf.php schreiben**

Datei `0nefinity.love/.auth/csrf.php`:

```php
<?php
declare(strict_types=1);

function csrf_token(): string {
  if (empty($_SESSION['csrf'])) {
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
  }
  return $_SESSION['csrf'];
}

function csrf_verify(string $posted): bool {
  if (empty($_SESSION['csrf']) || $posted === '') return false;
  return hash_equals($_SESSION['csrf'], $posted);
}

function csrf_field(): string {
  $t = htmlspecialchars(csrf_token(), ENT_QUOTES, 'UTF-8');
  return '<input type="hidden" name="csrf" value="' . $t . '">';
}
```

- [ ] **Step 2: Verify syntax**

```bash
php -l /home/timbr/0nefinity/0nefinity.love/.auth/csrf.php
```

Expected: `No syntax errors detected`

- [ ] **Step 3: Commit**

```bash
git add .auth/csrf.php
git commit -m "feat(auth): csrf double-submit helpers"
```

---

## Task 7: `.auth/hibp.php` — HaveIBeenPwned k-anonymity

**Files:**
- Create: `/home/timbr/0nefinity/0nefinity.love/.auth/hibp.php`

- [ ] **Step 1: hibp.php schreiben**

Datei `0nefinity.love/.auth/hibp.php`:

```php
<?php
declare(strict_types=1);

/**
 * Checks password against HaveIBeenPwned via k-anonymity.
 * Returns count of times pwned (0 = safe).
 * Returns -1 on network failure (caller decides policy — recommend allow with warning).
 */
function hibp_pwned_count(string $password, int $timeout = 5): int {
  $sha1   = strtoupper(sha1($password));
  $prefix = substr($sha1, 0, 5);
  $suffix = substr($sha1, 5);

  $url = "https://api.pwnedpasswords.com/range/$prefix";

  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => $timeout,
    CURLOPT_USERAGENT      => '0nefinity-auth/1.0',
    CURLOPT_HTTPHEADER     => ['Add-Padding: true'],
  ]);
  $body = curl_exec($ch);
  $http = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);

  if ($http !== 200 || !is_string($body)) return -1;

  foreach (explode("\n", $body) as $line) {
    $line = trim($line);
    if ($line === '') continue;
    [$tail, $count] = array_pad(explode(':', $line, 2), 2, '0');
    if (strtoupper($tail) === $suffix) {
      return (int) $count;
    }
  }
  return 0;
}
```

- [ ] **Step 2: Dockerfile — curl-extension prüfen**

```bash
docker exec 0nefinity-dev php -m | grep -i curl
```

Expected: `curl` taucht auf. Falls nicht:
- Edit `/home/timbr/0nefinity/Dockerfile`, ergänze: `RUN apt-get update && apt-get install -y libcurl4-openssl-dev && docker-php-ext-install curl`
- Rebuild dev-container.

- [ ] **Step 3: Verify syntax**

```bash
php -l /home/timbr/0nefinity/0nefinity.love/.auth/hibp.php
```

Expected: `No syntax errors detected`

- [ ] **Step 4: Test HIBP-Check mit bekanntem pwned PW**

Quick-test (vor Container-Restart, lokal):

```bash
php -r '
require "/home/timbr/0nefinity/0nefinity.love/.auth/hibp.php";
echo "password: " . hibp_pwned_count("password") . "\n";
echo "x7Kp9!mNq3vR2sLb4zY: " . hibp_pwned_count("x7Kp9!mNq3vR2sLb4zY") . "\n";
'
```

Expected: `password: ` ergibt eine Zahl > 1.000.000. Random-String ergibt 0.

- [ ] **Step 5: Commit**

```bash
git add .auth/hibp.php
git commit -m "feat(auth): HIBP k-anonymity check"
```

---

## Task 8: `.auth/rate-limit.php` — Sliding Window + Exponential Backoff

**Files:**
- Create: `/home/timbr/0nefinity/0nefinity.love/.auth/rate-limit.php`

- [ ] **Step 1: rate-limit.php schreiben**

Datei `0nefinity.love/.auth/rate-limit.php`:

```php
<?php
declare(strict_types=1);

const RL_WINDOW   = 60;   // sliding-window seconds
const RL_MAX_FAILS = 5;   // fails per IP per window

/**
 * Returns ['ok' => bool, 'retry_after' => int seconds].
 * Implements:
 *  - sliding window: max RL_MAX_FAILS in last RL_WINDOW seconds → 429
 *  - exponential backoff: required delay = 2^(consecutive_fails - RL_MAX_FAILS) seconds, capped at 300
 */
function rate_limit_check(string $ip): array {
  $db = auth_db();
  $now = time();
  $cut = $now - RL_WINDOW;

  $st = $db->prepare('SELECT COUNT(*) c FROM login_attempts WHERE ip = ? AND success = 0 AND ts > ?');
  $st->execute([$ip, $cut]);
  $recent_fails = (int) $st->fetch()['c'];

  if ($recent_fails >= RL_MAX_FAILS) {
    // Find most recent fail, compute backoff
    $last = $db->prepare('SELECT ts FROM login_attempts WHERE ip = ? AND success = 0 ORDER BY ts DESC LIMIT 1');
    $last->execute([$ip]);
    $last_ts = (int) ($last->fetch()['ts'] ?? $now);
    $extra = $recent_fails - RL_MAX_FAILS + 1; // 1, 2, 3 ...
    $delay = min(300, (int) pow(2, $extra));  // 2, 4, 8 ... cap 300s
    $retry = max(1, ($last_ts + $delay) - $now);
    return ['ok' => false, 'retry_after' => $retry];
  }
  return ['ok' => true, 'retry_after' => 0];
}

function rate_limit_record(string $ip, ?string $username, bool $success): void {
  $st = auth_db()->prepare('INSERT INTO login_attempts (ip, username, success, ts) VALUES (?, ?, ?, ?)');
  $st->execute([$ip, $username, $success ? 1 : 0, time()]);
}
```

- [ ] **Step 2: Verify syntax**

```bash
php -l /home/timbr/0nefinity/0nefinity.love/.auth/rate-limit.php
```

Expected: `No syntax errors detected`

- [ ] **Step 3: Commit**

```bash
git add .auth/rate-limit.php
git commit -m "feat(auth): rate-limit with sliding window + exp backoff"
```

---

## Task 9: `.htaccess` Routing-Updates

**Files:**
- Modify: `/home/timbr/0nefinity/0nefinity.love/.htaccess`

- [ ] **Step 1: Routing-Block ergänzen**

Edit `.htaccess`. Direkt **nach** dem dot-folder-Block (nach Zeile 4, vor HTTPS-Erzwingung) einfügen:

```apache
# /.auth/ niemals ausliefern (defense in depth — auch .auth/.htaccess deniest)
RewriteRule "^\.auth(/|$)" - [F,L]
```

Direkt **nach** dem `non-www -> www`-Redirect (nach Zeile 13) — also vor allen `weird-text-viewer` und `color`-Catchalls — einfügen:

```apache
# Auth routes (pretty URLs)
RewriteRule ^enternity/?$ /enternity.php [L,QSA]
RewriteRule ^admin/?$ /admin/index.php [L,QSA]
RewriteRule ^admin/(.+)$ /admin/$1 [L,QSA]
RewriteRule ^api/auth/login/?$ /api/auth/login.php [L,QSA]
RewriteRule ^api/auth/logout/?$ /api/auth/logout.php [L,QSA]
RewriteRule ^api/auth/me/?$ /api/auth/me.php [L,QSA]
RewriteRule ^api/auth/setup/?$ /api/auth/setup.php [L,QSA]
RewriteRule ^api/csp-report/?$ /api/csp-report.php [L,QSA]
```

**Wichtig:** Diese Block muss **vor** dem `color.php`-Catchall (Zeile ~60 alt) stehen, sonst landet `/enternity` in `color.php`.

- [ ] **Step 2: Verify .htaccess-Syntax mit apachectl im Container**

```bash
docker exec 0nefinity-dev apachectl -t 2>&1
```

Expected: `Syntax OK`

(`.htaccess`-Files werden bei jedem Request neu geparst, nicht beim Startup — also schreibt der Container das eigentlich nicht out. Trotzdem `-t` als Smoke-Test der Hauptconfig.)

- [ ] **Step 3: Commit**

```bash
git add .htaccess
git commit -m "feat(htaccess): routing for /enternity, /admin, /api/auth/*"
```

---

## Task 10: `enternity.php` — Login + Setup Form

**Files:**
- Create: `/home/timbr/0nefinity/0nefinity.love/enternity.php`

- [ ] **Step 1: enternity.php schreiben**

Datei `0nefinity.love/enternity.php`:

```php
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
    .eye-btn:focus-visible { outline:2px solid var(--text-color-hover, var(--text-color)); }
    .submit-btn {
      width:100%; margin-top:1.25rem; min-height:44px;
      background:var(--text-color); color:var(--bg-color);
      border:0; border-radius:2px; cursor:pointer; font-size:1rem;
    }
    .submit-btn:disabled { opacity:.5; cursor:wait; }
    .error-slot { min-height:1.5rem; margin-top:1rem; font-size:.875rem; color:#ff4040; }
  </style>
</head>
<body>
  <div class="enter-wrap">
    <form class="enter-card" id="enter-form"
          method="post"
          action="<?= $setup ? '/api/auth/setup' : '/api/auth/login' ?>">
      <?php if ($setup): ?>
        <h1>Setup 0nefinity</h1>
        <p class="sub">First run. Read your setup-token via<br><code>docker exec 0nefinity-live cat /app/.auth/setup-token</code></p>
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
```

- [ ] **Step 2: Verify syntax**

```bash
php -l /home/timbr/0nefinity/0nefinity.love/enternity.php
```

Expected: `No syntax errors detected`

- [ ] **Step 3: Commit**

```bash
git add enternity.php
git commit -m "feat(enternity): login + setup form UI"
```

---

## Task 11: `api/auth/setup.php` — Setup-Endpoint

**Files:**
- Create: `/home/timbr/0nefinity/0nefinity.love/api/auth/setup.php`

- [ ] **Step 1: setup.php schreiben**

Datei `0nefinity.love/api/auth/setup.php`:

```php
<?php
declare(strict_types=1);
require_once __DIR__ . '/../../.auth/bootstrap.php';
require_once __DIR__ . '/../../.auth/csrf.php';
require_once __DIR__ . '/../../.auth/hibp.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  json_response(['error' => 'method_not_allowed'], 405);
}

auth_session_start();

$raw = file_get_contents('php://input');
$in  = json_decode($raw, true) ?: [];

if (!csrf_verify($in['csrf'] ?? '')) {
  json_response(['error' => 'csrf'], 403);
}

if (!setup_mode_active()) {
  json_response(['error' => 'setup_disabled'], 403);
}

$token = (string)($in['token'] ?? '');
$pw    = (string)($in['password'] ?? '');
$pw2   = (string)($in['password_confirm'] ?? '');

// Read token-file
$expected = @file_get_contents(SETUP_TOKEN_FILE);
if (!is_string($expected) || $expected === '') {
  json_response(['error' => 'no_setup_token'], 403);
}
$expected = trim($expected);

if (!hash_equals($expected, $token)) {
  // No rate-limit during setup intentionally — token has 256-bit entropy
  json_response(['error' => 'bad_token'], 401);
}

if ($pw !== $pw2) {
  json_response(['error' => 'password_mismatch'], 400);
}

if (strlen($pw) < PW_MIN_LEN) {
  json_response(['error' => 'password_too_short', 'min' => PW_MIN_LEN], 400);
}

$hibp = hibp_pwned_count($pw);
if ($hibp > 0) {
  json_response(['error' => 'password_pwned', 'count' => $hibp], 400);
}
// hibp_pwned_count == -1 → network failure, allow with no warning (Phase 1 pragmatic)

$hash = password_hash($pw, PASSWORD_ARGON2ID, PW_HASH_OPTS);
$now  = time();

$db = auth_db();
$db->beginTransaction();
try {
  $st = $db->prepare('INSERT INTO users (username, password_hash, role, created_at, last_login_at) VALUES (?, ?, "admin", ?, ?)');
  $st->execute([FIXED_USERNAME, $hash, $now, $now]);
  $uid = (int) $db->lastInsertId();
  $db->commit();
} catch (Throwable $e) {
  $db->rollBack();
  json_response(['error' => 'db_error'], 500);
}

// Delete setup-token (one-time use)
@unlink(SETUP_TOKEN_FILE);

// Session
session_regenerate_id(true);
$_SESSION['uid'] = $uid;

json_response(['ok' => true, 'redirect' => '/admin']);
```

- [ ] **Step 2: Verify syntax**

```bash
php -l /home/timbr/0nefinity/0nefinity.love/api/auth/setup.php
```

Expected: `No syntax errors detected`

- [ ] **Step 3: Commit**

```bash
git add api/auth/setup.php
git commit -m "feat(api): setup endpoint with token + HIBP + Argon2id"
```

---

## Task 12: `api/auth/login.php` — Login-Endpoint

**Files:**
- Create: `/home/timbr/0nefinity/0nefinity.love/api/auth/login.php`

- [ ] **Step 1: login.php schreiben**

Datei `0nefinity.love/api/auth/login.php`:

```php
<?php
declare(strict_types=1);
require_once __DIR__ . '/../../.auth/bootstrap.php';
require_once __DIR__ . '/../../.auth/csrf.php';
require_once __DIR__ . '/../../.auth/rate-limit.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  json_response(['error' => 'method_not_allowed'], 405);
}

auth_session_start();

$raw = file_get_contents('php://input');
$in  = json_decode($raw, true) ?: [];

if (!csrf_verify($in['csrf'] ?? '')) {
  json_response(['error' => 'csrf'], 403);
}

$username = trim((string)($in['username'] ?? ''));
$password = (string)($in['password'] ?? '');
$next     = (string)($in['next'] ?? '/admin');
if (!preg_match('#^/[a-zA-Z0-9/_-]*$#', $next)) $next = '/admin';

$ip = client_ip();

// Rate-limit check
$rl = rate_limit_check($ip);
if (!$rl['ok']) {
  header('Retry-After: ' . $rl['retry_after']);
  json_response(['error' => 'rate_limited', 'retry_after' => $rl['retry_after']], 429);
}

$db = auth_db();
$st = $db->prepare('SELECT id, password_hash, role FROM users WHERE username = ?');
$st->execute([$username]);
$row = $st->fetch();

// Constant-time: even if user doesn't exist, run a password_verify against a dummy hash
$DUMMY = '$argon2id$v=19$m=65536,t=4,p=1$ZHVtbXkx$dW1teWR1bW15ZHVtbXlkdW1teWR1bW15ZHVtbXlkdW1teWR1bW0';
$ok = password_verify($password, $row['password_hash'] ?? $DUMMY) && $row;

if (!$ok) {
  rate_limit_record($ip, $username, false);
  // Anti-timing sleep: small extra jitter
  usleep(random_int(50_000, 250_000));
  json_response(['error' => 'invalid_credentials'], 401);
}

// Success
rate_limit_record($ip, $username, true);
session_regenerate_id(true);
$_SESSION['uid'] = (int) $row['id'];

// update last_login_at
$db->prepare('UPDATE users SET last_login_at = ? WHERE id = ?')->execute([time(), (int)$row['id']]);

json_response(['ok' => true, 'redirect' => $next]);
```

- [ ] **Step 2: Verify syntax**

```bash
php -l /home/timbr/0nefinity/0nefinity.love/api/auth/login.php
```

Expected: `No syntax errors detected`

- [ ] **Step 3: Commit**

```bash
git add api/auth/login.php
git commit -m "feat(api): login endpoint with rate-limit + constant-time verify"
```

---

## Task 13: `api/auth/logout.php` + `api/auth/me.php`

**Files:**
- Create: `/home/timbr/0nefinity/0nefinity.love/api/auth/logout.php`
- Create: `/home/timbr/0nefinity/0nefinity.love/api/auth/me.php`

- [ ] **Step 1: logout.php schreiben**

```php
<?php
declare(strict_types=1);
require_once __DIR__ . '/../../.auth/bootstrap.php';
require_once __DIR__ . '/../../.auth/csrf.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  json_response(['error' => 'method_not_allowed'], 405);
}
auth_session_start();

$raw = file_get_contents('php://input');
$in  = json_decode($raw, true) ?: [];
if (!csrf_verify($in['csrf'] ?? '')) {
  json_response(['error' => 'csrf'], 403);
}

$_SESSION = [];
if (ini_get('session.use_cookies')) {
  $p = session_get_cookie_params();
  setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
}
session_destroy();
json_response(['ok' => true, 'redirect' => '/enternity']);
```

- [ ] **Step 2: me.php schreiben**

```php
<?php
declare(strict_types=1);
require_once __DIR__ . '/../../.auth/bootstrap.php';

auth_session_start();
if (empty($_SESSION['uid'])) {
  json_response(['error' => 'unauthenticated'], 401);
}
$st = auth_db()->prepare('SELECT username, role FROM users WHERE id = ?');
$st->execute([$_SESSION['uid']]);
$u = $st->fetch();
if (!$u) {
  json_response(['error' => 'unauthenticated'], 401);
}
json_response(['user' => $u]);
```

- [ ] **Step 3: Verify syntax**

```bash
php -l /home/timbr/0nefinity/0nefinity.love/api/auth/logout.php
php -l /home/timbr/0nefinity/0nefinity.love/api/auth/me.php
```

Expected: `No syntax errors detected` (beide)

- [ ] **Step 4: Commit**

```bash
git add api/auth/logout.php api/auth/me.php
git commit -m "feat(api): logout + me endpoints"
```

---

## Task 14: `/admin/index.php` — Auth-Guarded Stub

**Files:**
- Create: `/home/timbr/0nefinity/0nefinity.love/admin/index.php`

- [ ] **Step 1: admin/index.php schreiben**

```php
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
    .admin-wrap { padding:2rem; max-width:960px; margin:0 auto; }
    .admin-bar { display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--text-color); padding-bottom:1rem; }
    .admin-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:1rem; margin-top:2rem; }
    .admin-card { border:1px solid var(--text-color); padding:1.5rem; border-radius:4px; }
    .admin-card h2 { margin:0 0 .5rem; font-size:1.1rem; }
    .admin-card p { margin:0; opacity:.6; font-size:.875rem; }
    .logout-btn { background:transparent; border:1px solid var(--text-color); color:var(--text-color); padding:.5rem 1rem; cursor:pointer; border-radius:2px; min-height:40px; }
  </style>
</head>
<body>
<div class="admin-wrap">
  <div class="admin-bar">
    <strong>0nefinity admin</strong>
    <button class="logout-btn" id="logout">logout</button>
  </div>
  <p style="margin-top:1.5rem;">Welcome, <?= htmlspecialchars($user['username']) ?>.</p>
  <div class="admin-grid">
    <div class="admin-card"><h2>Analytics</h2><p>(coming soon — Phase 2: Umami embed)</p></div>
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
```

- [ ] **Step 2: Verify syntax**

```bash
php -l /home/timbr/0nefinity/0nefinity.love/admin/index.php
```

Expected: `No syntax errors detected`

- [ ] **Step 3: Commit**

```bash
git add admin/index.php
git commit -m "feat(admin): auth-guarded stub dashboard with logout"
```

---

## Task 15: `api/csp-report.php` — CSP Violations Sink

**Files:**
- Create: `/home/timbr/0nefinity/0nefinity.love/api/csp-report.php`

- [ ] **Step 1: csp-report.php schreiben**

```php
<?php
declare(strict_types=1);
require_once __DIR__ . '/../.auth/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  http_response_code(204);
  exit;
}

$body = file_get_contents('php://input');
if (!is_string($body) || $body === '') {
  http_response_code(204);
  exit;
}

// Cap to prevent log-flood
$body = substr($body, 0, 8192);
$entry = json_encode([
  'ts' => date('c'),
  'ip' => client_ip(),
  'ua' => substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 256),
  'report' => json_decode($body, true) ?: $body,
]) . "\n";
@file_put_contents(CSP_LOG, $entry, FILE_APPEND | LOCK_EX);
http_response_code(204);
```

- [ ] **Step 2: Verify syntax**

```bash
php -l /home/timbr/0nefinity/0nefinity.love/api/csp-report.php
```

Expected: `No syntax errors detected`

- [ ] **Step 3: Commit**

```bash
git add api/csp-report.php
git commit -m "feat(api): csp-report-only sink"
```

---

## Task 16: nginx CSP-Header (report-only)

**Files:**
- Modify: `/etc/nginx/sites-enabled/0nefinity-live` (Host-Nginx, NICHT im Repo)

- [ ] **Step 1: Backup**

```bash
sudo cp /etc/nginx/sites-enabled/0nefinity-live /etc/nginx/sites-enabled/0nefinity-live.bak-$(date +%F)
```

- [ ] **Step 2: CSP-Header im server-block ergänzen**

Sudo-Edit der nginx-Config — im `server { … }` block für `0nefinity.love` (port 443) folgenden Header ergänzen (zu den bestehenden `add_header`-Zeilen):

```nginx
add_header Content-Security-Policy-Report-Only "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:; report-uri /api/csp-report" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
```

- [ ] **Step 3: Verify nginx-Syntax**

```bash
sudo nginx -t
```

Expected: `syntax is ok` und `test is successful`. Falls Fehler: Backup zurückspielen, Fehler fixen.

- [ ] **Step 4: nginx reload (NICHT restart)**

```bash
sudo systemctl reload nginx
```

Expected: kein Output, exit 0.

**Hinweis:** Dieser Schritt ist Host-Side, nicht im Git-Repo. Kein Commit.

---

## Task 17: `tools/auth-cli.php` — CLI für Reset + Invite-Stub

**Files:**
- Create: `/home/timbr/0nefinity/0nefinity.love/tools/auth-cli.php`

- [ ] **Step 1: auth-cli.php schreiben**

```php
<?php
declare(strict_types=1);

if (php_sapi_name() !== 'cli') {
  http_response_code(403);
  exit('CLI-only.');
}

require_once __DIR__ . '/../.auth/bootstrap.php';
require_once __DIR__ . '/../.auth/hibp.php';

$argv = $_SERVER['argv'];
$cmd  = $argv[1] ?? '';

function prompt_hidden(string $label): string {
  echo $label;
  if (preg_match('/^win/i', PHP_OS)) {
    return trim((string) fgets(STDIN));
  }
  system('stty -echo');
  $line = trim((string) fgets(STDIN));
  system('stty echo');
  echo "\n";
  return $line;
}

switch ($cmd) {
  case 'set-password': {
    $username = $argv[2] ?? '';
    if ($username === '') { fwrite(STDERR, "Usage: set-password <username>\n"); exit(2); }
    $st = auth_db()->prepare('SELECT id FROM users WHERE username = ?');
    $st->execute([$username]);
    $u = $st->fetch();
    if (!$u) { fwrite(STDERR, "User not found.\n"); exit(3); }
    $pw  = prompt_hidden("New password (min " . PW_MIN_LEN . "): ");
    $pw2 = prompt_hidden("Confirm: ");
    if ($pw !== $pw2) { fwrite(STDERR, "Mismatch.\n"); exit(4); }
    if (strlen($pw) < PW_MIN_LEN) { fwrite(STDERR, "Too short.\n"); exit(5); }
    $hibp = hibp_pwned_count($pw);
    if ($hibp > 0) { fwrite(STDERR, "Password seen in HIBP ($hibp times). Refusing.\n"); exit(6); }
    $hash = password_hash($pw, PASSWORD_ARGON2ID, PW_HASH_OPTS);
    auth_db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([$hash, $u['id']]);
    echo "Password updated for $username.\n";
    break;
  }

  case 'list-users': {
    $rows = auth_db()->query('SELECT id, username, role, email, created_at, last_login_at FROM users')->fetchAll();
    foreach ($rows as $r) {
      $created = date('c', (int)$r['created_at']);
      $last    = $r['last_login_at'] ? date('c', (int)$r['last_login_at']) : 'never';
      echo "#{$r['id']}  {$r['username']}  role={$r['role']}  email=" . ($r['email'] ?? '-') . "  created=$created  last_login=$last\n";
    }
    break;
  }

  case 'create-invite': {
    // Phase 2 stub — schema is ready, generates invite link
    $email = null;
    foreach ($argv as $a) {
      if (str_starts_with($a, '--email=')) $email = substr($a, 8);
    }
    $token = bin2hex(random_bytes(32));
    $hash  = hash('sha256', $token);
    $now   = time();
    $exp   = $now + 7 * 86400;
    auth_db()->prepare('INSERT INTO invite_tokens (token_hash, email, created_at, expires_at) VALUES (?, ?, ?, ?)')
             ->execute([$hash, $email, $now, $exp]);
    echo "Invite URL (Phase 2): https://0nefinity.love/enternity?invite=$token\n";
    echo "Expires: " . date('c', $exp) . "\n";
    break;
  }

  default:
    fwrite(STDERR, "Commands: set-password <username> | list-users | create-invite [--email=foo]\n");
    exit(1);
}
```

- [ ] **Step 2: Verify syntax**

```bash
php -l /home/timbr/0nefinity/0nefinity.love/tools/auth-cli.php
```

Expected: `No syntax errors detected`

- [ ] **Step 3: Commit**

```bash
git add tools/auth-cli.php
git commit -m "feat(cli): auth-cli (set-password, list-users, create-invite stub)"
```

---

## Task 18: Container rebuild + restart (dev)

**Files:** keine.

- [ ] **Step 1: Live-Container stoppen NICHT** — wir testen erst auf dev.

- [ ] **Step 2: Dev-Container rebuild + restart**

```bash
cd /home/timbr/0nefinity
docker compose build dev
docker compose up -d dev
docker compose logs dev | tail -30
```

Expected: Log zeigt `[entrypoint] initializing auth.sqlite` und `[entrypoint] generated setup-token`. Apache started.

- [ ] **Step 3: Verify setup-token existiert**

```bash
docker exec 0nefinity-dev cat /var/www/html/.auth/setup-token
```

Expected: 64-Zeichen Hex-String.

- [ ] **Step 4: Verify .auth-Volume Mount**

```bash
docker exec 0nefinity-dev ls -la /var/www/html/.auth/
```

Expected: `auth.sqlite`, `setup-token`, `schema.sql`, `bootstrap.php`, `csrf.php`, `hibp.php`, `rate-limit.php`, `.htaccess`

---

## Task 19: Smoke-Tests (curl) auf dev.0nefinity.love

**Files:** keine, nur Verifikation.

- [ ] **Step 1: `.auth/` ist web-blocked**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://dev.0nefinity.love/.auth/auth.sqlite
curl -s -o /dev/null -w "%{http_code}\n" https://dev.0nefinity.love/.auth/setup-token
curl -s -o /dev/null -w "%{http_code}\n" https://dev.0nefinity.love/.auth/bootstrap.php
```

Expected: alle drei `403`.

- [ ] **Step 2: `/enternity` rendert Setup-Form**

```bash
curl -s https://dev.0nefinity.love/enternity | grep -E '(Setup 0nefinity|Setup token)'
```

Expected: beide Strings tauchen auf (Setup-Modus aktiv).

- [ ] **Step 3: `/admin` ohne Auth → Redirect**

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://dev.0nefinity.love/admin
```

Expected: `302` mit Redirect zu `/enternity?next=%2Fadmin`.

- [ ] **Step 4: Login mit falschem PW → 401**

(Setup ist noch nicht durch, also User existiert noch nicht. Login muss trotzdem rate-limit + 401 liefern, nicht crashen.)

```bash
# CSRF holen via Cookie-Session
COOKIE=/tmp/0nefinity-cookies.txt
curl -s -c $COOKIE https://dev.0nefinity.love/enternity > /dev/null
CSRF=$(curl -s -b $COOKIE https://dev.0nefinity.love/enternity | grep -oP 'name="csrf" value="\K[^"]+')
echo "CSRF: $CSRF"

curl -s -b $COOKIE -X POST https://dev.0nefinity.love/api/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"0nefinity\",\"password\":\"wrong\",\"csrf\":\"$CSRF\"}" \
  -w "\nstatus:%{http_code}\n"
```

Expected: `{"error":"invalid_credentials"}` status:401

- [ ] **Step 5: Setup mit korrektem Token**

```bash
TOKEN=$(docker exec 0nefinity-dev cat /var/www/html/.auth/setup-token)
echo "TOKEN: $TOKEN"

# fresh session for setup
COOKIE=/tmp/0nefinity-cookies.txt
rm -f $COOKIE
curl -s -c $COOKIE https://dev.0nefinity.love/enternity > /dev/null
CSRF=$(curl -s -b $COOKIE https://dev.0nefinity.love/enternity | grep -oP 'name="csrf" value="\K[^"]+')

# Use a strong PW that is NOT in HIBP
PW="zX9!muN3p4Wq7vRkLb2YsTc8aQ"

curl -s -b $COOKIE -c $COOKIE -X POST https://dev.0nefinity.love/api/auth/setup \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"0nefinity\",\"token\":\"$TOKEN\",\"password\":\"$PW\",\"password_confirm\":\"$PW\",\"csrf\":\"$CSRF\"}" \
  -w "\nstatus:%{http_code}\n"
```

Expected: `{"ok":true,"redirect":"/admin"}` status:200.

- [ ] **Step 6: Setup-Token wurde gelöscht**

```bash
docker exec 0nefinity-dev ls /var/www/html/.auth/setup-token 2>&1
```

Expected: `No such file or directory`.

- [ ] **Step 7: Session funktioniert — `/api/auth/me`**

```bash
curl -s -b $COOKIE https://dev.0nefinity.love/api/auth/me
```

Expected: `{"user":{"username":"0nefinity","role":"admin"}}`

- [ ] **Step 8: `/admin` ist nun erreichbar**

```bash
curl -s -b $COOKIE -o /dev/null -w "%{http_code}\n" https://dev.0nefinity.love/admin
```

Expected: `200`.

- [ ] **Step 9: Login mit korrekten Credentials (frische Session)**

```bash
COOKIE2=/tmp/0nefinity-cookies2.txt
rm -f $COOKIE2
curl -s -c $COOKIE2 https://dev.0nefinity.love/enternity > /dev/null
CSRF=$(curl -s -b $COOKIE2 https://dev.0nefinity.love/enternity | grep -oP 'name="csrf" value="\K[^"]+')

curl -s -b $COOKIE2 -c $COOKIE2 -X POST https://dev.0nefinity.love/api/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"0nefinity\",\"password\":\"$PW\",\"csrf\":\"$CSRF\",\"next\":\"/admin\"}" \
  -w "\nstatus:%{http_code}\n"
```

Expected: `{"ok":true,"redirect":"/admin"}` status:200.

- [ ] **Step 10: Logout**

```bash
CSRF=$(curl -s -b $COOKIE2 https://dev.0nefinity.love/admin | grep -oP 'json_encode\("\K[^"]+' | head -1)
# Falls grep nicht greift, manuell: server-side csrf bleibt gleich pro session
# Easier: use the same CSRF from before login (CSRF survives in session)

curl -s -b $COOKIE2 -X POST https://dev.0nefinity.love/api/auth/logout \
  -H 'Content-Type: application/json' \
  -d "{\"csrf\":\"$CSRF\"}" \
  -w "\nstatus:%{http_code}\n"
```

Expected: `{"ok":true,"redirect":"/enternity"}` status:200.

- [ ] **Step 11: Rate-Limit Test (5+ Fails)**

```bash
COOKIE=/tmp/rl-cookies.txt
rm -f $COOKIE
curl -s -c $COOKIE https://dev.0nefinity.love/enternity > /dev/null
CSRF=$(curl -s -b $COOKIE https://dev.0nefinity.love/enternity | grep -oP 'name="csrf" value="\K[^"]+')

for i in 1 2 3 4 5 6; do
  curl -s -b $COOKIE -X POST https://dev.0nefinity.love/api/auth/login \
    -H 'Content-Type: application/json' \
    -d "{\"username\":\"0nefinity\",\"password\":\"wrong$i\",\"csrf\":\"$CSRF\"}" \
    -w "  attempt $i: %{http_code}\n" \
    -o /dev/null
done
```

Expected: Attempts 1-5 → `401`, Attempt 6 → `429`.

- [ ] **Step 12: CSRF-Schutz**

```bash
curl -s -b $COOKIE -X POST https://dev.0nefinity.love/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"0nefinity","password":"x","csrf":"BAD"}' \
  -w "\nstatus:%{http_code}\n"
```

Expected: `{"error":"csrf"}` status:403.

---

## Task 20: Manuelle Browser-Walkthrough (Mobile + Desktop)

**Files:** keine, nur Verifikation.

- [ ] **Step 1: DB reset für sauberen Browser-Test**

```bash
docker exec 0nefinity-dev sqlite3 /var/www/html/.auth/auth.sqlite "DELETE FROM users; DELETE FROM login_attempts;"
docker restart 0nefinity-dev
sleep 2
docker exec 0nefinity-dev cat /var/www/html/.auth/setup-token
```

(Token kopieren für Browser-Test.)

- [ ] **Step 2: Browser-Checkliste auf dev.0nefinity.love (Desktop)**

Tim öffnet `https://dev.0nefinity.love/enternity` und prüft:
- [ ] Setup-Form rendert (nicht Login)
- [ ] Username `0nefinity` ist readonly
- [ ] Eye-Toggle macht PW sichtbar
- [ ] PW < 12 Zeichen → Browser-Validation blockt submit (HTML `minlength`)
- [ ] HIBP-bekanntes PW (`password123456`) → Server-Fehler "password_pwned"
- [ ] Token + starkes PW + Confirm → erfolgreicher Setup, Redirect `/admin`
- [ ] `/admin` zeigt Welcome + Cards
- [ ] Logout-Button → Redirect `/enternity` (jetzt Login-Modus, nicht Setup)
- [ ] Re-Login mit gesetztem PW → `/admin`

- [ ] **Step 3: Mobile-Checkliste (Phone-Viewport)**

Tim öffnet auf Phone (oder DevTools-Mobile-Mode):
- [ ] Kein iOS-Zoom beim Input-Tap (font-size:16px)
- [ ] Tap-Targets ≥44px (Inputs, Eye-Toggle, Submit)
- [ ] Submit per Enter-Key auf Input funktioniert
- [ ] Dark-Mode: Farben aus `meta.css` (bg + text)
- [ ] Keine Hover-only-Indikatoren (Eye-Toggle hat sichtbaren Focus-Ring)

- [ ] **Step 4: Browser DevTools — Cookies prüfen**

- [ ] PHPSESSID hat: `HttpOnly`, `Secure`, `SameSite=Strict`
- [ ] Expires/Max-Age = 14 Tage in der Zukunft

- [ ] **Step 5: CSP-Report-Log inspizieren**

```bash
docker exec 0nefinity-dev cat /var/www/html/.auth/csp-violations.log 2>/dev/null || echo "noch keine"
```

Erwartung: Falls inline-scripts CSP-violaten, sind sie hier geloggt. Phase 2 wird das für Hardening genutzt.

---

## Task 21: Tracking-Snippet-Vorbereitung

**Files:** keine konkrete Änderung jetzt, aber Notiz im Plan.

Tim hat Umami als Tracking-Lösung erwähnt. Vorbereitung:

- [ ] **Step 1: Umami-Snippet-Slot im `<head>` von `admin/index.php` und `enternity.php` lassen** — schon mit `meta.css` includiert; spätere Erweiterung trivial.

- [ ] **Step 2: Phase-2-Spec-Update** — wenn Umami-Embed entschieden, hier Code-Snippet ergänzen.

(Keine Code-Änderung in Phase 1.)

---

## Task 22: PR auf main + Merge + Deploy live

**Files:** keine.

- [ ] **Step 1: Branch-Status checken, alles committed**

```bash
cd /home/timbr/0nefinity/0nefinity.love
git status
```

Expected: `nothing to commit, working tree clean`.

- [ ] **Step 2: Branch pushen, PR erstellen**

```bash
git push origin feat/enternity-login
gh pr create --title "feat: enternity login (Phase 1)" --body "$(cat <<'EOF'
## Summary
- Phase 1 of /enternity login (single user `0nefinity`)
- Setup-Token-Flow for initial password setup
- Argon2id (OWASP 2024+ params), HIBP-Check, NIST 800-63B-3 password policy
- Rate-limiting (5 fails/IP/min + exp backoff), CSRF double-submit
- Session cookies: HttpOnly+Secure+SameSite=Strict, 14d lifetime
- /admin stub dashboard + logout
- CSP report-only header

Spec: docs/specs/2026-05-12-enternity-login-design.md
Plan: docs/plans/2026-05-12-enternity-login-plan.md

## Test plan
- [x] Smoke-Tests via curl on dev.0nefinity.love (Task 19)
- [x] Browser walkthrough Desktop + Mobile (Task 20)
- [x] Setup-token flow
- [x] Login + logout + rate-limit + CSRF
- [x] .auth/ web-blocked

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR-URL wird ausgegeben.

- [ ] **Step 3: Tim reviewed PR im Browser**

Manuell. Tim merged via GitHub-UI ODER:

```bash
gh pr merge --merge
```

- [ ] **Step 4: Live-Container rebuild + restart**

```bash
cd /home/timbr/0nefinity
git -C 0nefinity.love pull origin main
docker compose build live
docker compose down live
docker compose up -d live
docker compose logs live | tail -30
```

Expected: Log zeigt entrypoint-Output, kein Error.

- [ ] **Step 5: Live setup-token auslesen + Setup durchführen**

```bash
docker exec 0nefinity-live cat /var/www/html/.auth/setup-token
```

Tim öffnet `https://0nefinity.love/enternity`, gibt Token + neues PW ein, fertig.

- [ ] **Step 6: Backup-Pfad ergänzen**

Tim's Backup-Script (Pfad: vermutlich `~/scripts/backup.sh` oder restic-config) muss um den Volume-Pfad ergänzt werden. Ohne diesen Schritt geht der `auth.sqlite`-State beim Volume-Loss verloren.

```bash
# Volume-Pfad lokalisieren
docker volume inspect 0nefinity_0nefinity-auth-live --format '{{.Mountpoint}}'
```

Diesen Pfad zur Backup-Liste hinzufügen (manuelle Aktion). Tim macht das selbst (siehe Memory `feedback_tim_triggers_backup_runs.md`).

---

## Self-Review-Checkliste

Nach Plan-Schreiben durchgegangen:

**1. Spec-Coverage:**
- Username fix `0nefinity` → Task 11 (setup.php hartcodiert)
- Setup-Token-Flow → Task 4 (entrypoint) + Task 11 (setup endpoint)
- Argon2id mit OWASP-Params → Task 5 (PW_HASH_OPTS) + Task 11/12 (verwendet)
- Min 12 Zeichen → Task 11 + Task 17 (Server-side check)
- HIBP-Check → Task 7 (lib) + Task 11 + Task 17 (verwendet)
- Constant-time-compare → Task 12 (Dummy-Hash bei User-Not-Found)
- Session 14d HttpOnly+Secure+SameSite=Strict → Task 5 (`auth_session_start`)
- CSRF Double-Submit → Task 6 (lib) + Task 11/12/13 (verwendet)
- Rate-Limit 5/IP/min + exp backoff → Task 8 (lib) + Task 12 (verwendet)
- CSP report-only → Task 15 (sink) + Task 16 (nginx-Header)
- `/admin` Auth-Guard → Task 5 (`require_auth`) + Task 14 (verwendet)
- `.auth/` web-deny → Task 2 (.htaccess) + Task 9 (Root-htaccess rule)
- Docker Volume → Task 3
- CLI für PW-Reset + Invite-Stub → Task 17
- Phase-2-Schema (invite_tokens) → Task 2

**2. Placeholder-Scan:** Keine TBD/TODO/"similar to" gefunden. Alle Code-Steps haben vollständigen Code.

**3. Type-Konsistenz:**
- `auth_db()`, `auth_session_start()`, `require_auth()`, `setup_mode_active()`, `client_ip()`, `json_response()` — alle in Task 5 definiert, in späteren Tasks korrekt verwendet
- `csrf_token()`, `csrf_verify()`, `csrf_field()` — Task 6, korrekt verwendet in 10/11/12/13/14
- `hibp_pwned_count()` — Task 7, verwendet in 11/17
- `rate_limit_check()`, `rate_limit_record()` — Task 8, verwendet in 12
- Konstanten: `AUTH_DB`, `SETUP_TOKEN_FILE`, `CSP_LOG`, `PW_HASH_OPTS`, `PW_MIN_LEN`, `FIXED_USERNAME` — alle in Task 5 definiert

Plan ist konsistent. Ready für Execution.
