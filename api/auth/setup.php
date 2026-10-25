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
