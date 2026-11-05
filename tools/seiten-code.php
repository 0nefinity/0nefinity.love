<?php

// seiten-code.php - der gesamte Code einer Seite als ein Text (/<seite>?code), fuer Sprachmodelle,
// die eine Seite nicht sehen, aber lesen koennen. Wird zur Anfragezeit aus den Dateien auf Platte
// zusammengesetzt, damit es nie veraltet und keine 133 erzeugten Kopien im Repo liegen.
// Ausgeliefert wird nur, was ohnehin oeffentlich ist: dieselben Sperren wie weird-text-viewer.php
// (Dot-Dateien, PHP, Block "intern" in .htaccess). Fremdbibliotheken, Schriften und Medien sind nur verlinkt.

function failNotFound() {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'File not found';
    exit;
}

function failServer($detail) {
    error_log('seiten-code: ' . $detail);
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Internal Server Error';
    exit;
}

function startsWithPath($path, $prefix) {
    return $path === $prefix || strncmp($path, $prefix . '/', strlen($prefix) + 1) === 0;
}

// Muster aus dem Block "intern: begin/end" in .htaccess; fehlt der Block: 500 statt still offen.
function internPatterns($root) {
    $lines = @file($root . '/.htaccess', FILE_IGNORE_NEW_LINES);
    if ($lines === false) {
        failServer('.htaccess not readable');
    }
    $lines = array_map('trim', $lines);
    $start = array_search('# intern: begin', $lines, true);
    $end = array_search('# intern: end', $lines, true);
    if ($start === false || $end === false || $end <= $start) {
        failServer('intern block missing');
    }
    $patterns = [];
    foreach (array_slice($lines, $start + 1, $end - $start - 1) as $line) {
        if ($line === '' || $line[0] === '#') {
            continue;
        }
        if (preg_match('/^RewriteRule\s+"([^"]+)"\s+-\s+\[([^\]]*)\]$/', $line, $m) !== 1) {
            failServer('unreadable intern line');
        }
        $flags = in_array('NC', explode(',', $m[2]), true) ? 'i' : '';
        $patterns[] = '#' . str_replace('#', '\#', $m[1]) . '#' . $flags;
    }
    if (!$patterns) {
        failServer('intern block empty');
    }
    return $patterns;
}

function isIntern($rel, $patterns) {
    foreach ($patterns as $pattern) {
        $hit = preg_match($pattern, $rel);
        if ($hit === false) {
            failServer('bad intern pattern ' . $pattern);
        }
        if ($hit === 1) {
            return true;
        }
    }
    return false;
}

// Relativer Pfad einer oeffentlichen Datei unter $root, sonst null.
function publicFile($root, $rel, $intern) {
    $rel = ltrim(str_replace('\\', '/', $rel), '/');
    if ($rel === '' || strpos($rel, "\0") !== false) {
        return null;
    }
    $real = realpath($root . '/' . $rel);
    if ($real === false || !is_file($real) || !is_readable($real)) {
        return null;
    }
    $real = str_replace('\\', '/', $real);
    if (!startsWithPath($real, $root)) {
        return null;
    }
    $realRel = ltrim(substr($real, strlen($root)), '/');
    foreach ([$rel, $realRel] as $p) {
        if (preg_match('/\.(php[0-9]?|phtml|phar)$/i', $p) === 1
            || preg_match('#(^|/)\.[^/]#', $p) === 1
            || isIntern($p, $intern)) {
            return null;
        }
    }
    return $realRel;
}

// Seite zur URL: wie die Rewrite-Regeln (Datei, .html, .md, Verzeichnis mit index.html).
function resolvePage($root, $seite, $intern) {
    $seite = trim($seite, '/');
    $candidates = $seite === ''
        ? ['index.html']
        : [$seite . '.html', $seite . '.md', $seite . '/index.html', $seite];
    foreach ($candidates as $c) {
        $rel = publicFile($root, $c, $intern);
        if ($rel !== null) {
            return [$seite, $rel];
        }
    }
    failNotFound();
}

// Nur verlinkt statt eingefuegt: fremde Bibliotheken, Schriften, Medien (wie tools/generate-code-bundle.py).
const LINK_ONLY = ['tools/vendor/', 'tools/tools/', 'fonts/', 'assets/', 'profilbilder/'];
const CODE_EXT = '/\.(html?|md|js|mjs|css|json)$/i';

// Lokale Verweise einer Datei: SSI-Includes, <script src>, <link href>.
function references($content, $fromRel, $isDev) {
    $content = preg_replace_callback(
        '/<!--#if expr="%\{HTTP_HOST\} =~ \/\^dev\\\\.\/" -->(.*?)<!--#endif -->/s',
        function ($m) use ($isDev) { return $isDev ? $m[1] : ''; },
        $content
    );
    $refs = [];
    if (preg_match_all('/<!--#include virtual="([^"]+)" -->/', $content, $m)) {
        $refs = array_merge($refs, $m[1]);
    }
    if (preg_match_all('/<script\b[^>]*?\bsrc="([^"]+)"/i', $content, $m)) {
        $refs = array_merge($refs, $m[1]);
    }
    if (preg_match_all('/<link\b[^>]*?\bhref="([^"]+)"/i', $content, $m)) {
        $refs = array_merge($refs, $m[1]);
    }
    $out = [];
    foreach ($refs as $ref) {
        $ref = preg_split('/[?#<]/', $ref)[0];
        if ($ref === '' || preg_match('#^([a-z][a-z0-9+.-]*:|//)#i', $ref) === 1) {
            continue;
        }
        if ($ref[0] !== '/') {
            $dir = dirname($fromRel);
            $ref = ($dir === '.' ? '' : $dir . '/') . $ref;
        }
        $out[] = rawurldecode($ref);
    }
    return $out;
}

$root = realpath((string)($_SERVER['DOCUMENT_ROOT'] ?? ''));
if ($root === false) {
    failServer('document root missing');
}
$root = rtrim(str_replace('\\', '/', $root), '/');
$intern = internPatterns($root);
$isDev = preg_match('/^dev\./', (string)($_SERVER['HTTP_HOST'] ?? '')) === 1;

list($seite, $pageRel) = resolvePage($root, (string)($_GET['seite'] ?? ''), $intern);

// Breitensuche ab der Seite: zuerst die Seite selbst, dann was sie laedt, dann was das laedt.
$queue = [$pageRel];
$seen = [$pageRel => true];
$files = [];
$linked = [];
while ($queue) {
    $rel = array_shift($queue);
    $content = @file_get_contents($root . '/' . $rel);
    if ($content === false) {
        failServer('read failed ' . $rel);
    }
    $files[$rel] = $content;
    if (preg_match('/\.(html?|md)$/i', $rel) !== 1) {
        continue;
    }
    foreach (references($content, $rel, $isDev) as $ref) {
        $refRel = publicFile($root, $ref, $intern);
        if ($refRel === null || isset($seen[$refRel])) {
            continue;
        }
        $seen[$refRel] = true;
        $isLinkOnly = false;
        foreach (LINK_ONLY as $prefix) {
            if (strncmp($refRel, $prefix, strlen($prefix)) === 0) {
                $isLinkOnly = true;
            }
        }
        if ($isLinkOnly || preg_match(CODE_EXT, $refRel) !== 1) {
            $linked[] = $refRel;
        } else {
            $queue[] = $refRel;
        }
    }
}

header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: public, max-age=300');
echo 'hier der gesamte Code dieser Seite 0nefinity.love/' . $seite . ":\n\n";
foreach ($files as $rel => $content) {
    echo '===== /' . $rel . " =====\n";
    echo $content;
    echo substr($content, -1) === "\n" ? "\n" : "\n\n";
}
foreach ($linked as $rel) {
    echo '===== /' . $rel . " (nur verlinkt) =====\n\n";
}
