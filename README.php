<?php
// README.php - Server-side Markdown rendering with Parsedown

// Load Markdown content
$markdownContent = file_get_contents(__DIR__ . '/README_content.md');

// Load Parsedown
require_once __DIR__ . '/tools/Parsedown.php';
$Parsedown = new Parsedown();

// Render Markdown to HTML
$renderedContent = $Parsedown->text($markdownContent);

?><!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <link rel="icon" type="image/png" href="/profilbilder/favicon/index/favicon-96x96.png" sizes="96x96" />
  <link rel="icon" type="image/svg+xml" href="/profilbilder/favicon/index/favicon.svg" />

  <link href="/meta.css" rel="stylesheet" />
  <script src="/meta.js" defer></script>

  <title>README</title>

  <style>
    body { text-align: left; }
    h1, h2, h3, h4, h5, h6 { text-align: center; }
 
  </style>

</head>
<body>
  <div class="O18">
    <div id="content">
<?php echo $renderedContent; ?>
    </div>
  </div>

  <script src="/0nefinity.js" defer></script>
</body>
</html>

