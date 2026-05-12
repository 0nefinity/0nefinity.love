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
