<?php
declare(strict_types=1);

function csrf_token(): string {
  if (empty($_SESSION['csrf'])) {
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
  }
  return $_SESSION['csrf'];
}

function csrf_verify(string $posted): bool {
  if (empty($_SESSION['csrf']) || $posted === '') return false;
  return hash_equals($_SESSION['csrf'], $posted);
}

function csrf_field(): string {
  $t = htmlspecialchars(csrf_token(), ENT_QUOTES, 'UTF-8');
  return '<input type="hidden" name="csrf" value="' . $t . '">';
}
