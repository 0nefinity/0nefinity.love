<?php
// tools/color.php
// Render a full-bleed color page from the first URL path segment.
// Apache rewrite example (in /.htaccess):
//   RewriteRule ^([^/]+)/?$ /tools/color.php?c=$1 [L,QSA]

declare(strict_types=1);

function lower_utf8(string $s): string {
    if (function_exists('mb_strtolower')) {
        return mb_strtolower($s, 'UTF-8');
    }
    return strtolower($s);
}

function compact_token(string $s): string {
    // Allow users to type light-blue, light_blue, "light blue".
    // CSS named colors are typically without separators.
    return str_replace([" ", "\t", "\n", "\r", '_', '-'], '', $s);
}

/** @return array{ok:bool, css?:string, token?:string} */
function resolve_color(string $raw): array {
    $raw = trim($raw);
    if ($raw === '') return ['ok' => false];

    $t = lower_utf8($raw);
    $t = compact_token($t);

    // Curated/explicit names (highest priority).
    // Add your own explicit names here.
    $curated = [
        'beige' => '#B7A687',
        'purple' => '#934BB7',
        'red' => '#E63527',
        'blue' => '#497BC8',
        'orange' => '#DE9537',
        'green' => '#418E44',
        'yellow' => '#EEC946',
        'turquoise' => '#51A4A8',
    ];

    // German aliases (and common spellings) -> CSS named color keyword.
    $aliases = [
        'schwarz' => 'black',
        'weiss' => 'white',
        'weiß' => 'white',
        'rot' => 'red',
        'gruen' => 'green',
        'grün' => 'green',
        'blau' => 'blue',
        'gelb' => 'yellow',
        'orange' => 'orange',
        'pink' => 'pink',
        'lila' => 'purple',
        'violett' => 'violet',
        'türkis' => 'turquoise',
        'tuerkis' => 'turquoise',
        'grau' => 'gray',
        'hellgrau' => 'lightgray',
        'dunkelgrau' => 'darkgray',
        'hellblau' => 'lightblue',
        'dunkelblau' => 'darkblue',
        'hellgruen' => 'lightgreen',
        'hellgrün' => 'lightgreen',
        'dunkelgruen' => 'darkgreen',
        'dunkelgrün' => 'darkgreen',
    ];

    if (array_key_exists($t, $curated)) {
        return ['ok' => true, 'css' => $curated[$t], 'token' => $t];
    }
    if (array_key_exists($t, $aliases)) {
        $t = $aliases[$t];
    }

    // Hex: allow #RGB/#RGBA/#RRGGBB/#RRGGBBAA and also without '#'.
    $hex = $t;
    if ($hex !== '' && $hex[0] === '#') $hex = substr($hex, 1);
    if (preg_match('/^[0-9a-f]{3}([0-9a-f]{1})?$/', $hex) === 1 ||
        preg_match('/^[0-9a-f]{6}([0-9a-f]{2})?$/', $hex) === 1) {
        return ['ok' => true, 'css' => '#' . $hex, 'token' => $t];
    }

    // CSS named colors (Level 4 named colors + common aliases).
    // Source: the standardized set of named CSS colors.
    // Keep as a set for fast lookup.
    static $cssNamed = null;
    if ($cssNamed === null) {
        $names = [
            'aliceblue','antiquewhite','aqua','aquamarine','azure','beige','bisque','black','blanchedalmond',
            'blue','blueviolet','brown','burlywood','cadetblue','chartreuse','chocolate','coral','cornflowerblue',
            'cornsilk','crimson','cyan','darkblue','darkcyan','darkgoldenrod','darkgray','darkgreen','darkgrey',
            'darkkhaki','darkmagenta','darkolivegreen','darkorange','darkorchid','darkred','darksalmon',
            'darkseagreen','darkslateblue','darkslategray','darkslategrey','darkturquoise','darkviolet','deeppink',
            'deepskyblue','dimgray','dimgrey','dodgerblue','firebrick','floralwhite','forestgreen','fuchsia',
            'gainsboro','ghostwhite','gold','goldenrod','gray','green','greenyellow','grey','honeydew','hotpink',
            'indianred','indigo','ivory','khaki','lavender','lavenderblush','lawngreen','lemonchiffon','lightblue',
            'lightcoral','lightcyan','lightgoldenrodyellow','lightgray','lightgreen','lightgrey','lightpink',
            'lightsalmon','lightseagreen','lightskyblue','lightslategray','lightslategrey','lightsteelblue',
            'lightyellow','lime','limegreen','linen','magenta','maroon','mediumaquamarine','mediumblue',
            'mediumorchid','mediumpurple','mediumseagreen','mediumslateblue','mediumspringgreen','mediumturquoise',
            'mediumvioletred','midnightblue','mintcream','mistyrose','moccasin','navajowhite','navy','oldlace',
            'olive','olivedrab','orange','orangered','orchid','palegoldenrod','palegreen','paleturquoise',
            'palevioletred','papayawhip','peachpuff','peru','pink','plum','powderblue','purple','rebeccapurple',
            'red','rosybrown','royalblue','saddlebrown','salmon','sandybrown','seagreen','seashell','sienna',
            'silver','skyblue','slateblue','slategray','slategrey','snow','springgreen','steelblue','tan','teal',
            'thistle','tomato','transparent','turquoise','violet','wheat','white','whitesmoke','yellow','yellowgreen'
        ];
        $cssNamed = array_fill_keys($names, true);
    }

    if (isset($cssNamed[$t])) {
        return ['ok' => true, 'css' => $t, 'token' => $t];
    }

    return ['ok' => false];
}

$token = (string)($_GET['c'] ?? '');
$resolved = resolve_color($token);

if (!$resolved['ok']) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo "404\n";
    exit;
}

$css = (string)$resolved['css'];
$title = htmlspecialchars((string)($resolved['token'] ?? $token), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

header('Content-Type: text/html; charset=utf-8');

?><!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="<?= htmlspecialchars($css, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>" />
  <title><?= $title ?></title>
  <style>
    html, body { height: 100%; margin: 0; }
    body { background: <?= htmlspecialchars($css, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>; }
  </style>
</head>
<body></body>
</html>
