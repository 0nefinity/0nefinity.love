<?php
declare(strict_types=1);
// Usage: php tests/auth-rate-limit/run.php   (needs pdo_sqlite, e.g. inside the dev image)
// Fail loud: exit 1 on the first broken expectation.

$dbfile = sys_get_temp_dir() . '/rl-test-' . getmypid() . '.sqlite';
function auth_db(): PDO {
  global $dbfile;
  static $pdo = null;
  if ($pdo === null) {
    $pdo = new PDO('sqlite:' . $dbfile);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec(file_get_contents(__DIR__ . '/../../.auth/schema.sql'));
  }
  return $pdo;
}
require __DIR__ . '/../../.auth/rate-limit.php';

function check(bool $cond, string $what): void {
  if (!$cond) { fwrite(STDERR, "FAIL: $what\n"); @unlink($GLOBALS['dbfile']); exit(1); }
  echo "ok: $what\n";
}

// 1. Attempts are counted before the hash: five reservations with no outcome block the sixth.
$ids = [];
for ($i = 0; $i < RL_MAX_FAILS; $i++) {
  $r = rate_limit_reserve('203.0.113.7', 'x');
  check($r['ok'], "attempt $i allowed");
  $ids[] = $r['id'];
}
check(!rate_limit_reserve('203.0.113.7', 'x')['ok'], 'sixth in-flight attempt blocked');
check(rate_limit_reserve('203.0.113.8', 'x')['ok'], 'other IPv4 unaffected');

// 2. IPv6: addresses inside one /64 share a counter, another /64 does not.
for ($i = 0; $i < RL_MAX_FAILS; $i++) {
  check(rate_limit_reserve('2001:db8:1:2::' . dechex($i + 1), 'x')['ok'], "v6 attempt $i allowed");
}
check(!rate_limit_reserve('2001:db8:1:2:aaaa:bbbb:cccc:dddd', 'x')['ok'], 'rotating inside the /64 blocked');
check(rate_limit_reserve('2001:db8:1:3::1', 'x')['ok'], 'other /64 unaffected');

// 3. A successful login gives its attempt back.
$r = rate_limit_reserve('198.51.100.1', 'x');
rate_limit_release($r['id']);
for ($i = 0; $i < RL_MAX_FAILS; $i++) {
  check(rate_limit_reserve('198.51.100.1', 'x')['ok'], "after release, attempt $i allowed");
}

@unlink($dbfile);
echo "all ok\n";
