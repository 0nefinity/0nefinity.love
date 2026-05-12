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
