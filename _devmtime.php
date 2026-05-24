<?php
// Dev-only Live-Reload-Endpoint: liefert den neuesten Änderungs-Zeitstempel
// (mtime) über alle web-relevanten Dateien im dev-Tree als plain Zahl.
// meta.js pollt das alle 2s → reload sobald sich der Wert ändert.
// Nur auf dev.* aktiv, damit ein versehentlicher Merge nach prod nichts tut.

header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-store, max-age=0');

$host = $_SERVER['HTTP_HOST'] ?? '';
if (strpos($host, 'dev.') !== 0) {
    http_response_code(403);
    echo '0';
    exit;
}

$root = __DIR__;
$skipDirs = ['.git', '00_Archiv', '.superpowers', 'node_modules', '.auth'];
$exts = array_flip([
    'html', 'htm', 'js', 'css', 'php', 'json',
    'svg', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'avif',
    'woff', 'woff2', 'ttf', 'otf',
    'mp3', 'mp4', 'wav', 'ogg', 'webm',
    'glsl', 'frag', 'vert', 'txt', 'md',
]);

$dir = new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS);
$filter = new RecursiveCallbackFilterIterator($dir, function ($current) use ($skipDirs) {
    if ($current->isDir()) {
        return !in_array($current->getFilename(), $skipDirs, true);
    }
    return true;
});
$it = new RecursiveIteratorIterator($filter);

$max = 0;
foreach ($it as $file) {
    if (!$file->isFile()) {
        continue;
    }
    $ext = strtolower($file->getExtension());
    if (!isset($exts[$ext])) {
        continue;
    }
    $m = $file->getMTime();
    if ($m > $max) {
        $max = $m;
    }
}

echo $max;
