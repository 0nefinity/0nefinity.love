<?php

// weird-text-viewer.php - Zeigt Textdateien schön formatiert an

function failNotFound() {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'File not found';
    exit;
}

// Fail loud: ein fehlender Include darf keine kaputte Seite mit Status 200 liefern.
// Alle Includes werden gelesen, bevor irgendetwas ausgegeben wird; Pfad und Detail nur ins error_log.
function failInclude($path, $detail) {
    error_log('weird-text-viewer: include ' . $path . ' failed' . ($detail ? ': ' . $detail : ''));
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Internal Server Error';
    exit;
}

// Liest ein Include direkt von Platte (kein Subrequest, keine Rewrite-Regeln, keine Warnung im Body).
function readInclude($relativePath) {
    $file = (string)($_SERVER['DOCUMENT_ROOT'] ?? '') . $relativePath;
    if (!is_file($file) || !is_readable($file)) {
        failInclude($relativePath, 'not a readable file');
    }
    $content = @file_get_contents($file);
    if ($content === false) {
        $lastError = error_get_last();
        failInclude($relativePath, $lastError['message'] ?? 'read failed');
    }
    return $content;
}

// PHP kennt kein SSI: die eine Bedingung der Includes (nur auf dev.* laden) wird hier selbst ausgewertet,
// jede andere SSI-Direktive bricht laut ab statt unverarbeitet im HTML zu landen. Gilt fuer jedes Include.
function renderSsiInclude($relativePath, $host) {
    $content = readInclude($relativePath);
    $isDev = preg_match('/^dev\./', $host) === 1;
    $open = '<!--#if expr="%{HTTP_HOST} =~ /^dev\./" -->';
    $content = preg_replace_callback(
        '/' . preg_quote($open, '/') . '(.*?)' . preg_quote('<!--#endif -->', '/') . '/s',
        function ($m) use ($isDev) { return $isDev ? $m[1] : ''; },
        $content
    );
    if ($content !== null) {
        $uri = (string)($_SERVER['REQUEST_URI'] ?? '');
        $notChicken = preg_match('/why-coordinatesystem-is-chicken/', $uri) !== 1;
        $content = preg_replace_callback(
            '/' . preg_quote('<!--#if expr="%{REQUEST_URI} !~ /why-coordinatesystem-is-chicken/" -->', '/') . '(.*?)' . preg_quote('<!--#endif -->', '/') . '/s',
            function ($m) use ($notChicken) { return $notChicken ? $m[1] : ''; },
            $content
        );
    }
    if ($content !== null) {
        // timefmt="%s" (Unix-Sekunden) ist das einzige Format, das flastmod hier braucht; PHP liefert es direkt.
        $content = preg_replace('/<!--#config timefmt="%s" -->\R?/', '', $content);
    }
    if ($content !== null) {
        $docRoot = (string)($_SERVER['DOCUMENT_ROOT'] ?? '');
        $content = preg_replace_callback(
            '/<!--#flastmod virtual="(\/[^"]+)" -->/',
            function ($m) use ($docRoot, $relativePath) {
                $mtime = strpos($m[1], '..') === false ? @filemtime($docRoot . $m[1]) : false;
                if ($mtime === false) {
                    failInclude($relativePath, 'flastmod target missing: ' . $m[1]);
                }
                return (string)$mtime;
            },
            $content
        );
    }
    if ($content === null || strpos($content, '<!--#') !== false) {
        failInclude($relativePath, 'unsupported SSI directive');
    }
    return $content;
}

function startsWithPath($path, $prefix) {
    return $path === $prefix || strncmp($path, $prefix . '/', strlen($prefix) + 1) === 0;
}

function stripHtmlComments($content) {
    $stripped = preg_replace('/<!--.*?-->/s', '', $content);
    return $stripped === null ? $content : $stripped;
}

// Muster aus dem Block "intern: begin/end" in .htaccess (dort 404); der Viewer liefert dieselben Pfade nicht aus,
// auch nicht bei direktem Aufruf von /tools/weird-text-viewer.php?path=... Fehlt der Block: 500 statt still offen.
function internPatterns($documentRoot) {
    $file = rtrim($documentRoot, '/') . '/.htaccess';
    $lines = @file($file, FILE_IGNORE_NEW_LINES);
    if ($lines === false) {
        failInclude('/.htaccess', 'not readable');
    }
    $lines = array_map('trim', $lines);
    $start = array_search('# intern: begin', $lines, true);
    $end = array_search('# intern: end', $lines, true);
    if ($start === false || $end === false || $end <= $start) {
        failInclude('/.htaccess', 'intern block missing');
    }
    $patterns = [];
    foreach (array_slice($lines, $start + 1, $end - $start - 1) as $line) {
        if ($line === '' || $line[0] === '#') {
            continue;
        }
        if (preg_match('/^RewriteRule\s+"([^"]+)"\s+-\s+\[([^\]]*)\]$/', $line, $m) !== 1) {
            failInclude('/.htaccess', 'unreadable intern line');
        }
        $flags = in_array('NC', explode(',', $m[2]), true) ? 'i' : '';
        $patterns[] = '#' . str_replace('#', '\#', $m[1]) . '#' . $flags;
    }
    if (!$patterns) {
        failInclude('/.htaccess', 'intern block empty');
    }
    return $patterns;
}

function isIntern($relativePath, $patterns) {
    foreach ($patterns as $pattern) {
        $hit = preg_match($pattern, $relativePath);
        if ($hit === false) {
            failInclude('/.htaccess', 'bad intern pattern ' . $pattern);
        }
        if ($hit === 1) {
            return true;
        }
    }
    return false;
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

    // Heikle Dot-Ordner/-Dateien (wie in .htaccess) nie ausliefern; Pruefung auf dem aufgeloesten Pfad,
    // damit Symlinks und ../-Tricks nichts umgehen.
    $realRelative = ltrim(substr($normalizedRealPath, strlen($normalizedRoot)), '/');
    if (preg_match('#(^|/)\.(git|ssh|vscode|auth|php_tmp|htaccess|htpasswd|env[^/]*|gitignore|gitattributes|gitmodules)(/|$)#i', $realRelative) === 1
        || preg_match('#(^|/)\.(git|ssh|vscode|auth|php_tmp|htaccess|htpasswd|env[^/]*|gitignore|gitattributes|gitmodules)(/|$)#i', $normalizedRelativePath) === 1) {
        failNotFound();
    }

    $intern = internPatterns($normalizedRoot);
    if (isIntern($realRelative, $intern) || isIntern($normalizedRelativePath, $intern)) {
        failNotFound();
    }

    return [$realPath, $normalizedRelativePath];
}

list($realPath, $relativePath) = resolveRequestedFile((string)($_SERVER['DOCUMENT_ROOT'] ?? ''));

$content = file_get_contents($realPath);
if ($content === false) {
    failNotFound();
}

$content = stripHtmlComments($content);

$fileName = basename($realPath);
$title = $fileName;
$showRelativePath = $relativePath !== $fileName;
$isMarkdown = preg_match('/\.md$/i', $realPath) === 1;

if ($isMarkdown) {
    require_once __DIR__ . '/tools/Parsedown.php';
    $Parsedown = new Parsedown();
    $renderedContent = $Parsedown->text($content);
} else {
    $renderedContent = htmlspecialchars($content, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

$headHtml = renderSsiInclude('/includes/something-in-the-head.html', (string)($_SERVER['HTTP_HOST'] ?? ''));
$bodyHtml = renderSsiInclude('/includes/something-in-the-body.html', (string)($_SERVER['HTTP_HOST'] ?? ''));
?><!DOCTYPE html>
<html lang="de">
<head>
<?php echo $headHtml; ?>
  <title><?php echo htmlspecialchars($title, ENT_QUOTES, 'UTF-8'); ?></title>
</head>
<body>

<main class="O18">
  <div class="text-viewer-header">
    <h1><?php echo htmlspecialchars($title, ENT_QUOTES, 'UTF-8'); ?></h1>
    <?php if ($showRelativePath): ?>
    <div><?php echo htmlspecialchars($relativePath, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?></div>
    <?php endif; ?>
  </div>

  <div class="text-viewer-content"<?php echo $isMarkdown ? ' data-format="markdown"' : ''; ?>><?php echo $renderedContent; ?></div>
</main>

<?php echo $bodyHtml; ?>
</body>
</html>
