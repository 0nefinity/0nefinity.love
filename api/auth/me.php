<?php
declare(strict_types=1);
require_once __DIR__ . '/../../.auth/bootstrap.php';

// No session cookie: answer without starting a session, so anonymous visitors
// (tools/editor.js asks on every dev page) never get a PHPSESSID.
if (empty($_COOKIE[session_name()])) {
  json_response(['error' => 'unauthenticated'], 401);
}
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
