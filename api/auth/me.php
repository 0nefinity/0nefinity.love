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
