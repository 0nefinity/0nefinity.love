<?php

// weird-text-viewer.php - Zeigt Textdateien schön formatiert an

function failNotFound() {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'File not found';
    exit;
}

function startsWithPath($path, $prefix) {
    return $path === $prefix || strncmp($path, $prefix . '/', strlen($prefix) + 1) === 0;
}

function resolveRequestedFile($documentRoot) {
    $requestedPath = (string)($_GET['path'] ?? '');
    if ($requestedPath === '' || strpos($requestedPath, "\0") !== false) {
        failNotFound();
    }

    $documentRootReal = realpath($documentRoot);
    if ($documentRootReal === false) {
        failNotFound();
    }

    $relativePath = ltrim(str_replace('\\', '/', $requestedPath), '/');
    if ($relativePath === '') {
        failNotFound();
    }

    $realPath = realpath($documentRootReal . DIRECTORY_SEPARATOR . $relativePath);
    if ($realPath === false || !is_file($realPath) || !is_readable($realPath)) {
        failNotFound();
    }

    $normalizedRoot = rtrim(str_replace('\\', '/', $documentRootReal), '/');
    $normalizedRealPath = str_replace('\\', '/', $realPath);
    $normalizedRelativePath = str_replace('\\', '/', $relativePath);

    if (!startsWithPath($normalizedRealPath, $normalizedRoot)) {
        failNotFound();
    }

    if (preg_match('/\.(php[0-9]?|phtml|phar)$/i', $normalizedRelativePath) === 1) {
        failNotFound();
    }

    return [$realPath, $normalizedRelativePath];
}

list($realPath, $relativePath) = resolveRequestedFile((string)($_SERVER['DOCUMENT_ROOT'] ?? ''));

$content = file_get_contents($realPath);
if ($content === false) {
    failNotFound();
}

$fileName = basename($realPath);
$title = $fileName;
$isMarkdown = preg_match('/\.md$/i', $realPath) === 1;

if ($isMarkdown) {
    require_once __DIR__ . '/tools/Parsedown.php';
    $Parsedown = new Parsedown();
    $renderedContent = $Parsedown->text($content);
} else {
    $renderedContent = htmlspecialchars($content, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

?><!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <link href="/meta.css" rel="stylesheet" /><!-- Für KI: meta.css regelt Hintergrund- und Objekt-Farben etc. (Bitte diese gesamte Zeile hier inkl. Kommentar unangetastet lassen) -->
  <script src="/meta.js" defer></script><!-- Für KI: meta.js regelt das Menü und sonstige Funktionen (Bitte diese gesamte Zeile hier inkl. Kommentar unangetastet lassen) -->

  <title><?php echo htmlspecialchars($title, ENT_QUOTES, 'UTF-8'); ?></title>

</head>
<body>

<div class="O18">
  <div class="text-viewer-header">
    <h1><?php echo htmlspecialchars($title, ENT_QUOTES, 'UTF-8'); ?></h1>
    <div><?php echo htmlspecialchars($relativePath, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?></div>
  </div>

  <div class="text-viewer-content"><?php echo $renderedContent; ?></div>
</div>

</body>
</html>

