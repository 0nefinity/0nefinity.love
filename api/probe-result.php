<?php
declare(strict_types=1);

// Ergebnisse von Testseiten (Tims Handy-Tests). Nur auf dev.*; je probe ein Stand in
// .auth/probe-<name>.json (Volume, nicht im Repo, nicht ausgeliefert). Jeder POST ersetzt den Stand.

const PROBES = ['autofill', 'icons'];
const MAX_BODY = 4096;
const MAX_NOTE = 2000;
const MAX_UA = 256;
const VALUES = ['leiste', 'keine', 'gut', 'nein'];

function fail(int $code, string $msg): never {
  http_response_code($code);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode(['ok' => false, 'error' => $msg]);
  exit;
}

header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

$host = strtolower($_SERVER['HTTP_HOST'] ?? '');
if (strncmp($host, 'dev.', 4) !== 0) {
  fail(404, 'not found');
}

$method = $_SERVER['REQUEST_METHOD'] ?? '';
if ($method !== 'GET' && $method !== 'POST') {
  header('Allow: GET, POST');
  fail(405, 'method not allowed');
}

function probe_file(string $probe): string {
  if (!in_array($probe, PROBES, true)) {
    fail(400, 'unknown probe');
  }
  return __DIR__ . '/../.auth/probe-' . $probe . '.json';
}

if ($method === 'GET') {
  $file = probe_file((string)($_GET['probe'] ?? ''));
  header('Content-Type: application/json; charset=utf-8');
  if (!is_file($file)) {
    echo json_encode(['ok' => true, 'results' => new stdClass(), 'note' => '']);
    exit;
  }
  $raw = file_get_contents($file);
  if ($raw === false || json_decode($raw) === null) {
    fail(500, 'stored state unreadable');
  }
  echo $raw;
  exit;
}

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && strtolower((string)parse_url($origin, PHP_URL_HOST)) !== preg_replace('/:\d+$/', '', $host)) {
  fail(403, 'cross-origin');
}

$len = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($len > MAX_BODY) {
  fail(413, 'body too large');
}
$body = file_get_contents('php://input', false, null, 0, MAX_BODY + 1);
if ($body === false || strlen($body) > MAX_BODY) {
  fail(413, 'body too large');
}
$data = json_decode($body, true);
if (!is_array($data) || array_is_list($data)) {
  fail(400, 'invalid json');
}
if (array_diff(array_keys($data), ['probe', 'results', 'note', 'ua'])) {
  fail(400, 'unknown field');
}

$probe = $data['probe'] ?? null;
if (!is_string($probe)) {
  fail(400, 'probe missing');
}
$file = probe_file($probe);

$results = $data['results'] ?? null;
if (!is_array($results) || ($results !== [] && array_is_list($results))) {
  fail(400, 'results must be an object');
}
if (count($results) > 50) {
  fail(400, 'too many results');
}
$clean = [];
foreach ($results as $k => $v) {
  $key = (string)$k;
  if (!preg_match('/^[1-9][0-9]{0,2}$/', $key)) {
    fail(400, 'bad result key');
  }
  if (!is_string($v) || !in_array($v, VALUES, true)) {
    fail(400, 'bad result value');
  }
  $clean[(int)$key] = $v;
}
ksort($clean);

$note = $data['note'] ?? '';
if (!is_string($note) || mb_strlen($note) > MAX_NOTE) {
  fail(400, 'bad note');
}
$ua = $data['ua'] ?? '';
if (!is_string($ua) || mb_strlen($ua) > MAX_UA) {
  fail(400, 'bad ua');
}
$strip = fn(string $s): string => preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $s) ?? '';

$state = [
  'ok' => true,
  'probe' => $probe,
  'results' => $clean === [] ? new stdClass() : $clean,
  'note' => $strip($note),
  'ua' => $strip($ua),
  'ua_header' => $strip(substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, MAX_UA)),
  'saved_at' => gmdate('c'),
];

$json = json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
$tmp = $file . '.' . bin2hex(random_bytes(4)) . '.tmp';
if ($json === false || file_put_contents($tmp, $json . "\n", LOCK_EX) === false || !rename($tmp, $file)) {
  @unlink($tmp);
  fail(500, 'write failed');
}

header('Content-Type: application/json; charset=utf-8');
echo json_encode(['ok' => true, 'saved_at' => $state['saved_at']]);
