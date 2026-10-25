<?php
declare(strict_types=1);

if (php_sapi_name() !== 'cli') {
  http_response_code(403);
  exit('CLI-only.');
}

require_once __DIR__ . '/../.auth/bootstrap.php';
require_once __DIR__ . '/../.auth/hibp.php';

$argv = $_SERVER['argv'];
$cmd  = $argv[1] ?? '';

function prompt_hidden(string $label): string {
  echo $label;
  if (preg_match('/^win/i', PHP_OS)) {
    return trim((string) fgets(STDIN));
  }
  system('stty -echo');
  $line = trim((string) fgets(STDIN));
  system('stty echo');
  echo "\n";
  return $line;
}

switch ($cmd) {
  case 'set-password': {
    $username = $argv[2] ?? '';
    if ($username === '') { fwrite(STDERR, "Usage: set-password <username>\n"); exit(2); }
    $st = auth_db()->prepare('SELECT id FROM users WHERE username = ?');
    $st->execute([$username]);
    $u = $st->fetch();
    if (!$u) { fwrite(STDERR, "User not found.\n"); exit(3); }
    $pw  = prompt_hidden("New password (min " . PW_MIN_LEN . "): ");
    $pw2 = prompt_hidden("Confirm: ");
    if ($pw !== $pw2) { fwrite(STDERR, "Mismatch.\n"); exit(4); }
    if (strlen($pw) < PW_MIN_LEN) { fwrite(STDERR, "Too short.\n"); exit(5); }
    $hibp = hibp_pwned_count($pw);
    if ($hibp > 0) { fwrite(STDERR, "Password seen in HIBP ($hibp times). Refusing.\n"); exit(6); }
    $hash = password_hash($pw, PASSWORD_ARGON2ID, PW_HASH_OPTS);
    auth_db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([$hash, $u['id']]);
    echo "Password updated for $username.\n";
    break;
  }

  case 'list-users': {
    $rows = auth_db()->query('SELECT id, username, role, email, created_at, last_login_at FROM users')->fetchAll();
    foreach ($rows as $r) {
      $created = date('c', (int)$r['created_at']);
      $last    = $r['last_login_at'] ? date('c', (int)$r['last_login_at']) : 'never';
      echo "#{$r['id']}  {$r['username']}  role={$r['role']}  email=" . ($r['email'] ?? '-') . "  created=$created  last_login=$last\n";
    }
    break;
  }

  case 'create-invite': {
    // Phase 2 stub — schema is ready, generates invite link
    $email = null;
    foreach ($argv as $a) {
      if (str_starts_with($a, '--email=')) $email = substr($a, 8);
    }
    $token = bin2hex(random_bytes(32));
    $hash  = hash('sha256', $token);
    $now   = time();
    $exp   = $now + 7 * 86400;
    auth_db()->prepare('INSERT INTO invite_tokens (token_hash, email, created_at, expires_at) VALUES (?, ?, ?, ?)')
             ->execute([$hash, $email, $now, $exp]);
    echo "Invite URL (Phase 2): https://0nefinity.love/enternity?invite=$token\n";
    echo "Expires: " . date('c', $exp) . "\n";
    break;
  }

  default:
    fwrite(STDERR, "Commands: set-password <username> | list-users | create-invite [--email=foo]\n");
    exit(1);
}
