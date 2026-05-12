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
