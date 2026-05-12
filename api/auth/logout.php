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
