<?php
// Ruft tools/seiten-code.php ohne Webserver auf: php call.php <docroot> <seite> <host>
$_SERVER['DOCUMENT_ROOT'] = $argv[1];
$_GET['seite'] = $argv[2];
$_SERVER['HTTP_HOST'] = $argv[3];
require $argv[1] . '/tools/seiten-code.php';
