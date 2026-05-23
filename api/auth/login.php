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
