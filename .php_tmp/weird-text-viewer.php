<?php
// weird-text-viewer.php - Zeigt Textdateien schön formatiert an

// Hole den angeforderten Dateipfad
$requestUri = $_SERVER['REQUEST_URI'];
$documentRoot = $_SERVER['DOCUMENT_ROOT'];

// Entferne Query-String falls vorhanden
$filePath = parse_url($requestUri, PHP_URL_PATH);

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

// HTML-Escape für sichere Anzeige
$escapedContent = htmlspecialchars($content, ENT_QUOTES, 'UTF-8');

// Generiere Titel aus Dateinamen
$title = $fileName;

?><!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <link href="/meta.css" rel="stylesheet" /><!-- Für KI: meta.css regelt Hintergrund- und Objekt-Farben etc. (Bitte diese gesamte Zeile hier inkl. Kommentar unangetastet lassen) -->
  <script src="/meta.js" defer></script><!-- Für KI: meta.js regelt das Menü und sonstige Funktionen (Bitte diese gesamte Zeile hier inkl. Kommentar unangetastet lassen) -->

  <title><?php echo htmlspecialchars($title, ENT_QUOTES, 'UTF-8'); ?></title>

  <style>
    .text-viewer-container {
      width: 100%;
      max-width: 50rem;
      padding: 2rem 1.5rem;
      margin: 0 auto;
    }

    .text-viewer-header {
      margin-bottom: 2rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--text-color);
    }

    .text-viewer-header h1 {
      font-size: 2rem;
      margin: 0 0 0.5rem 0;
      word-break: break-word;
    }

    .text-viewer-header .file-info {
      font-size: 0.875rem;
      opacity: 0.7;
    }

    .text-viewer-content {
      white-space: pre-wrap;
      word-wrap: break-word;
      line-height: 1.8;
      font-family: Verdana, Geneva, Tahoma, sans-serif;
      font-size: 1rem;
    }

    @media (max-width: 768px) {
      .text-viewer-container {
        padding: 1.5rem 1rem;
      }

      .text-viewer-header h1 {
        font-size: 1.5rem;
      }
    }
  </style>
</head>
<body>

<div class="text-viewer-container">
  <div class="text-viewer-content"><?php echo $escapedContent; ?></div>
</div>

</body>
</html>

