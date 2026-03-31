<?php
/**
 * Sitemap Generator for 0nefinity.love
 *
 * Generates and maintains sitemap.xml according to W3C standards.
 * Uses intelligent caching to avoid unnecessary regeneration.
 *
 * Usage:
 *   - Automatically called on first request
 *   - Regenerates only when filesystem changes
 *   - Can be manually triggered: /tools/generate-structure.php?force=1
 */

// Root-Verzeichnis ist ein Level höher (da Script jetzt in /tools liegt)
define('ROOT_DIR', dirname(__DIR__));
define('SITEMAP_FILE', ROOT_DIR . '/sitemap.xml');
define('CACHE_FILE', ROOT_DIR . '/.sitemap-cache');
define('CACHE_TTL', 3600); // 1 hour - recheck after this time
define('DOMAIN', 'https://0nefinity.love');
define('EXCLUDED_DIRECTORY_NAMES', ['__pycache__']);
define('EXCLUDED_DIRECTORY_PATH_PREFIXES', ['tools/tools']);
define('EXCLUDED_FILE_SUFFIXES', ['.php', '.py', '.pyc', '.pyo']);

/**
 * Check if file should be included
 *
 * Für die Sitemap nur kanonische, öffentlich sinnvolle URLs aufnehmen.
 */
function startsWithPathPrefix($path, $prefix) {
    return $path === $prefix || strpos($path, $prefix . '/') === 0;
}

function endsWithString($value, $suffix) {
    if ($suffix === '') {
        return true;
    }

    return substr($value, -strlen($suffix)) === $suffix;
}

function normalizeRelativePath($fullPath, $baseDir) {
    $relativePath = str_replace($baseDir . DIRECTORY_SEPARATOR, '', $fullPath);
    return str_replace('\\', '/', $relativePath);
}

function isExcludedDirectory($relativePath, $directoryName) {
    if ($directoryName === '' || $directoryName[0] === '.') {
        return true;
    }

    if (in_array($directoryName, EXCLUDED_DIRECTORY_NAMES, true)) {
        return true;
    }

    foreach (EXCLUDED_DIRECTORY_PATH_PREFIXES as $excludedPrefix) {
        if (startsWithPathPrefix($relativePath, $excludedPrefix)) {
            return true;
        }
    }

    return false;
}

function shouldIncludeFile($relativePath) {
    $filename = basename($relativePath);
    if ($filename === '' || $filename[0] === '.' || $filename === 'meta.json') {
        return false;
    }

    foreach (EXCLUDED_FILE_SUFFIXES as $suffix) {
        if (endsWithString(strtolower($filename), $suffix)) {
            return false;
        }
    }

    foreach (EXCLUDED_DIRECTORY_PATH_PREFIXES as $excludedPrefix) {
        if (startsWithPathPrefix($relativePath, $excludedPrefix)) {
            return false;
        }
    }

    return true;
}

function canonicalizeRelativePath($relativePath) {
    if (preg_match('/\.html$/i', $relativePath) === 1) {
        $withoutExtension = substr($relativePath, 0, -5);
        return $withoutExtension === 'index' ? '' : $withoutExtension;
    }

    return $relativePath;
}

/**
 * Get file modification time in W3C format (YYYY-MM-DD)
 */
function getFileModDate($filepath) {
    if (file_exists($filepath)) {
        return date('Y-m-d', filemtime($filepath));
    }
    return date('Y-m-d');
}

/**
 * Collect all URLs for sitemap
 */
function collectAllUrls($dir, $baseDir = null, &$urls = []) {
    if ($baseDir === null) $baseDir = $dir;

    if (!is_dir($dir) || !is_readable($dir)) return $urls;

    $items = scandir($dir);
    if ($items === false) return $urls;

    foreach ($items as $item) {
        if ($item[0] === '.' || $item === '..') continue;

        $fullPath = $dir . DIRECTORY_SEPARATOR . $item;
        $relativePath = normalizeRelativePath($fullPath, $baseDir);

        if (is_dir($fullPath)) {
            if (isExcludedDirectory($relativePath, $item)) {
                continue;
            }
            collectAllUrls($fullPath, $baseDir, $urls);
        } elseif (is_file($fullPath) && shouldIncludeFile($relativePath)) {
            $canonicalRelativePath = canonicalizeRelativePath($relativePath);
            $url = $canonicalRelativePath === '' ? DOMAIN . '/' : DOMAIN . '/' . $canonicalRelativePath;
            $lastmod = getFileModDate($fullPath);

            // Priority only for index.html
            $priority = null; // default: no priority

            if ($relativePath === 'index.html') {
                $priority = 1.0;
            }

            $urls[] = [
                'loc' => $url,
                'lastmod' => $lastmod,
                'priority' => $priority
            ];
        }
    }

    return $urls;
}



/**
 * Check if regeneration is needed
 */
function needsRegeneration() {
    if (!file_exists(SITEMAP_FILE)) return true;
    if (!file_exists(CACHE_FILE)) return true;

    $cache = json_decode(file_get_contents(CACHE_FILE), true);
    if (!$cache) return true;

    // Check if cache expired
    if (time() - $cache['timestamp'] > CACHE_TTL) {
        return true;
    }

    // Quick check: compare directory modification times
    $currentMtime = filemtime(ROOT_DIR);
    if ($currentMtime > $cache['mtime']) {
        return true;
    }

    return false;
}

/**
 * Format XML with proper indentation
 */
function formatXml($xml) {
    $dom = new DOMDocument('1.0', 'UTF-8');
    $dom->preserveWhiteSpace = false;
    $dom->formatOutput = true;
    $dom->loadXML($xml->asXML());
    return $dom->saveXML();
}

/**
 * Generate sitemap.xml according to W3C standards
 */
function generateSitemap() {
    $urls = collectAllUrls(ROOT_DIR);

    // Sort by URL for consistency
    usort($urls, function($a, $b) {
        return strcmp($a['loc'], $b['loc']);
    });

    // Create XML
    $xml = new SimpleXMLElement('<?xml version="1.0" encoding="UTF-8"?><urlset></urlset>');
    $xml->addAttribute('xmlns', 'http://www.sitemaps.org/schemas/sitemap/0.9');

    foreach ($urls as $url) {
        $urlElement = $xml->addChild('url');
        $urlElement->addChild('loc', htmlspecialchars($url['loc'], ENT_XML1, 'UTF-8'));
        $urlElement->addChild('lastmod', $url['lastmod']);

        // Only add priority if set (for index.html)
        if ($url['priority'] !== null) {
            $urlElement->addChild('priority', number_format($url['priority'], 1));
        }
    }

    // Format and save
    $formattedXml = formatXml($xml);
    file_put_contents(SITEMAP_FILE, $formattedXml);

    return true;
}

/**
 * Generate sitemap.xml only
 */
function generateStructure() {
    // Generate sitemap.xml
    generateSitemap();

    // Save cache
    $cache = [
        'timestamp' => time(),
        'mtime' => filemtime(ROOT_DIR)
    ];
    file_put_contents(CACHE_FILE, json_encode($cache));

    return true;
}

// Main logic
$force = isset($_GET['force']) && $_GET['force'] === '1';

if ($force || needsRegeneration()) {
    try {
        generateStructure();
        header('Content-Type: application/json');
        echo json_encode(['status' => 'success', 'message' => 'Structure generated']);
    } catch (Exception $e) {
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
} else {
    header('Content-Type: application/json');
    echo json_encode(['status' => 'ok', 'message' => 'Structure is up to date']);
}

