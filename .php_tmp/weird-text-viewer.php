<?php
// weird-text-viewer.php - Zeigt Textdateien schön formatiert an

// Hole den angeforderten Dateipfad
$requestUri = $_SERVER['REQUEST_URI'];
$documentRoot = $_SERVER['DOCUMENT_ROOT'];

// Entferne Query-String falls vorhanden
$filePath = parse_url($requestUri, PHP_URL_PATH);

// Dekodiere URL-Encoding (z.B. %20 -> Leerzeichen)
$filePath = urldecode($filePath);

// Konvertiere zu absolutem Pfad
$absolutePath = $documentRoot . $filePath;

// Sicherheitscheck: Stelle sicher, dass die Datei existiert und innerhalb des Document Root liegt
$realPath = realpath($absolutePath);
if (!$realPath || strpos($realPath, realpath($documentRoot)) !== 0) {
    header("HTTP/1.0 404 Not Found");
    echo "File not found";
    exit;
}

// Prüfe ob Datei existiert
if (!file_exists($realPath) || !is_file($realPath)) {
    header("HTTP/1.0 404 Not Found");
    echo "File not found";
    exit;
}

// Lese Dateiinhalt
$content = file_get_contents($realPath);
$fileName = basename($realPath);

// Prüfe ob es eine Markdown-Datei ist
$isMarkdown = preg_match('/\.md$/i', $realPath);

// Generiere Titel aus Dateinamen
$title = $fileName;

// Verarbeite Content je nach Dateityp
if ($isMarkdown) {
    // Parsedown für Markdown-Rendering einbinden
    require_once __DIR__ . '/tools/Parsedown.php';
    $Parsedown = new Parsedown();
    $renderedContent = $Parsedown->text($content);
} else {
    // Für Nicht-Markdown: HTML-Escape für sichere Anzeige
    $renderedContent = htmlspecialchars($content, ENT_QUOTES, 'UTF-8');
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
  </div>

  <div class="text-viewer-content"><?php echo $renderedContent; ?></div>
</div>

</body>
</html>

