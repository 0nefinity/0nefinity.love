<?php
declare(strict_types=1);

/**
 * Checks password against HaveIBeenPwned via k-anonymity.
 * Returns count of times pwned (0 = safe).
 * Returns -1 on network failure (caller decides policy — recommend allow with warning).
 */
function hibp_pwned_count(string $password, int $timeout = 5): int {
  $sha1   = strtoupper(sha1($password));
  $prefix = substr($sha1, 0, 5);
  $suffix = substr($sha1, 5);

  $url = "https://api.pwnedpasswords.com/range/$prefix";

  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => $timeout,
    CURLOPT_USERAGENT      => '0nefinity-auth/1.0',
    CURLOPT_HTTPHEADER     => ['Add-Padding: true'],
  ]);
  $body = curl_exec($ch);
  $http = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);

  if ($http !== 200 || !is_string($body)) return -1;

  foreach (explode("\n", $body) as $line) {
    $line = trim($line);
    if ($line === '') continue;
    [$tail, $count] = array_pad(explode(':', $line, 2), 2, '0');
    if (strtoupper($tail) === $suffix) {
      return (int) $count;
    }
  }
  return 0;
}
