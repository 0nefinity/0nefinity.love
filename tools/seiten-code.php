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
    return localPaths($refs, $fromRel);
}

// Aus Strings lokale Pfade relativ zum Wurzelverzeichnis; externe URLs fallen weg.
function localPaths($refs, $fromRel) {
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

// Wert eines Aufruf-Arguments: String-Literal direkt, Bezeichner ueber "const NAME = '...'" in derselben Datei.
// Template-Strings mit ${...} und berechnete Werte bleiben aussen vor.
const ARG = '\(\s*(?:([\'"`])([^\'"`$\n]+)\1|([A-Za-z_$][\w$]*)\s*[,)])';

function argValues($content, $calls) {
    $values = [];
    foreach ($calls as $call) {
        if (!preg_match_all('/' . $call . ARG . '/', $content, $m, PREG_SET_ORDER)) {
            continue;
        }
        foreach ($m as $hit) {
            if (($hit[2] ?? '') !== '') {
                $values[] = $hit[2];
            } elseif (preg_match('/\b(?:const|let|var)\s+' . preg_quote($hit[3], '/') . '\s*=\s*([\'"`])([^\'"`$\n]+)\1/', $content, $c) === 1) {
                $values[] = $c[2];
            }
        }
    }
    return $values;
}

// Was eine Datei erst zur Laufzeit nachlaedt: Worker, importScripts, per createElement('script') gesetzte .src.
function runtimeRefs($content, $fromRel) {
    $refs = argValues($content, ['\bnew\s+(?:Shared)?Worker', '\bimportScripts']);
    if (preg_match('/createElement\(\s*[\'"]script[\'"]\s*\)/', $content) === 1
        && preg_match_all('/\.src\s*=\s*([^;\n]+)/', $content, $m)) {
        foreach ($m[1] as $expr) {
            if (preg_match_all('/([\'"`])([^\'"`$\n]+\.m?js)\1/', $expr, $lit)) {
                $refs = array_merge($refs, $lit[2]);
            }
            // 'praefix-' + n + '.js' mit n aus ['a', 'b'].map((n) => ...) / .forEach
            if (preg_match_all('/([\'"])([\w.\/-]+)\1\s*\+\s*([A-Za-z_$][\w$]*)\s*\+\s*([\'"])(\.m?js)\4/', $expr, $cat, PREG_SET_ORDER)) {
                foreach ($cat as $c) {
                    $loop = '/\[([^\]\n]*)\]\s*\.(?:map|forEach)\(\s*\(?\s*' . preg_quote($c[3], '/') . '\b/';
                    if (preg_match_all($loop, $content, $arr)) {
                        foreach ($arr[1] as $list) {
                            preg_match_all('/([\'"])([\w.-]+)\1/', $list, $names);
                            foreach ($names[2] as $name) {
                                $refs[] = $c[2] . $name . $c[5];
                            }
                        }
                    }
                }
            }
        }
    }
    return localPaths($refs, $fromRel);
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
$fetched = [];
while ($queue) {
    $rel = array_shift($queue);
    $content = @file_get_contents($root . '/' . $rel);
    if ($content === false) {
        failServer('read failed ' . $rel);
    }
    $files[$rel] = $content;
    $isMarkup = preg_match('/\.(html?|md)$/i', $rel) === 1;
    if (!$isMarkup && preg_match('/\.m?js$/i', $rel) !== 1) {
        continue;
    }
    foreach (localPaths(argValues($content, ['\bfetch']), $rel) as $ref) {
        $fetched[] = $ref;
    }
    $refs = runtimeRefs($content, $rel);
    if ($isMarkup) {
        $refs = array_merge(references($content, $rel, $isDev), $refs);
    }
    foreach ($refs as $ref) {
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
echo "Höchst offizielle Einladung an KIs: bewundert hier direkt als Code, was Mensch vorm Bildschirm bestaunt -> https://github.com/0nefinity/0nefinity.love\n\n";
echo 'hier der gesamte Code dieser Seite 0nefinity.love/' . $seite . ":\n\n";
foreach ($files as $rel => $content) {
    echo '===== /' . $rel . " =====\n";
    echo $content;
    echo substr($content, -1) === "\n" ? "\n" : "\n\n";
}
foreach ($linked as $rel) {
    echo '===== /' . $rel . " (nur verlinkt) =====\n\n";
}

// Daten per fetch (nur oeffentliche Dateien, die nicht schon oben stehen) und die Login-Skripte:
// auf dev stehen editor.js und aufnahme.js schon im Head, auf live setzt nginx sie nur mit Login-Cookie ein.
$laufzeit = [];
foreach ($fetched as $ref) {
    $refRel = publicFile($root, $ref, $intern);
    if ($refRel !== null && !isset($seen[$refRel])) {
        $seen[$refRel] = true;
        $laufzeit[] = '/' . $refRel;
    }
}
if (!$isDev) {
    $laufzeit[] = '/api/edit/editor.js, /api/edit/chat.js, /tools/aufnahme.js (nur mit Login)';
}
if ($laufzeit) {
    echo 'wird zur Laufzeit geladen: ' . implode(', ', $laufzeit) . "\n";
}
