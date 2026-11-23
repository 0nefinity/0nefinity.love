<?php
declare(strict_types=1);

const RL_WINDOW   = 60;   // sliding-window seconds
const RL_MAX_FAILS = 5;   // attempts per client network per window

/**
 * Counting key: IPv4 as is, IPv6 reduced to its /64 (one subscriber holds a whole /64,
 * so rotating addresses inside it must not reset the counter).
 */
function rate_limit_key(string $ip): string {
  $bin = @inet_pton($ip);
  if ($bin === false || strlen($bin) !== 16) return $ip;
  return bin2hex(substr($bin, 0, 8)) . '::/64';
}

/**
 * Atomically count this attempt BEFORE the expensive password hash runs.
 * Returns ['ok' => bool, 'retry_after' => int, 'id' => int|null]. On ok the attempt is stored as a
 * failure; call rate_limit_release($id) after a successful login to take it back.
 * Implements:
 *  - sliding window: max RL_MAX_FAILS in last RL_WINDOW seconds → 429
 *  - exponential backoff: required delay = 2^(consecutive_fails - RL_MAX_FAILS) seconds, capped at 300
 * BEGIN IMMEDIATE serialises parallel requests, so they cannot all pass the check before one is recorded.
 */
function rate_limit_reserve(string $ip, ?string $username): array {
  $key = rate_limit_key($ip);
  $db = auth_db();
  $now = time();
  $cut = $now - RL_WINDOW;

  $db->exec('BEGIN IMMEDIATE');
  try {
    $st = $db->prepare('SELECT COUNT(*) c FROM login_attempts WHERE ip = ? AND success = 0 AND ts > ?');
    $st->execute([$key, $cut]);
    $recent_fails = (int) $st->fetch()['c'];

    if ($recent_fails >= RL_MAX_FAILS) {
      $last = $db->prepare('SELECT ts FROM login_attempts WHERE ip = ? AND success = 0 ORDER BY ts DESC LIMIT 1');
      $last->execute([$key]);
      $last_ts = (int) ($last->fetch()['ts'] ?? $now);
      $extra = $recent_fails - RL_MAX_FAILS + 1; // 1, 2, 3 ...
      $delay = min(300, (int) pow(2, $extra));  // 2, 4, 8 ... cap 300s
      $retry = max(1, ($last_ts + $delay) - $now);
      $db->exec('COMMIT');
      return ['ok' => false, 'retry_after' => $retry, 'id' => null];
    }

    $ins = $db->prepare('INSERT INTO login_attempts (ip, username, success, ts) VALUES (?, ?, 0, ?)');
    $ins->execute([$key, $username, $now]);
    $id = (int) $db->lastInsertId();
    $db->exec('COMMIT');
    return ['ok' => true, 'retry_after' => 0, 'id' => $id];
  } catch (Throwable $e) {
    $db->exec('ROLLBACK');
    throw $e;
  }
}

/** Successful login: the reserved attempt no longer counts as a failure. */
function rate_limit_release(int $id): void {
  $st = auth_db()->prepare('UPDATE login_attempts SET success = 1 WHERE id = ?');
  $st->execute([$id]);
}
