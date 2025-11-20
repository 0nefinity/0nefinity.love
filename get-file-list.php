<?php
/**
 * Dynamic File List Generator for 0nefinity.love
 *
 * Scans all HTML files, text files, and files without extension recursively.
 * Creates hierarchical structure with metadata support.
 * Supports both JSON and XML output formats.
 *
 * Usage:
 *   /get-file-list.php?format=json  (default)
 *   /get-file-list.php?format=xml
 */

// Determine output format
$format = isset($_GET['format']) ? strtolower($_GET['format']) : 'json';
if (!in_array($format, ['json', 'xml'])) {
    $format = 'json';
}

// Set appropriate header
if ($format === 'xml') {
    header('Content-Type: application/xml; charset=utf-8');
} else {
    header('Content-Type: application/json; charset=utf-8');
}

/**
 * Load metadata from meta.json in a directory
 * Returns array with description, tags, category, etc.
 */
function loadFolderMetadata($dir) {
    $metaFile = $dir . DIRECTORY_SEPARATOR . 'meta.json';
    if (file_exists($metaFile) && is_readable($metaFile)) {
        $content = file_get_contents($metaFile);
        $meta = json_decode($content, true);
        return is_array($meta) ? $meta : [];
    }
    return [];
}

/**
 * Check if a file should be included in the menu
 * Includes: .html, .punkt, .dot, .txt, and files without extension
 */
function shouldIncludeFile($filename) {
    // Skip hidden files and meta files
    if ($filename[0] === '.' || $filename === 'meta.json') {
        return false;
    }

    $extension = strtolower(pathinfo($filename, PATHINFO_EXTENSION));

    // Include HTML files
    if ($extension === 'html') {
        return true;
    }

    // Include text files with special extensions
    if (in_array($extension, ['punkt', 'dot', 'txt'])) {
        return true;
    }

    // Include files without extension
    // A file has no extension if pathinfo returns empty string
    if ($extension === '') {
        return true;
    }

    return false;
}

/**
 * Recursively scan directory for displayable files
 * Returns hierarchical structure: folders first, then files
 * Includes metadata from meta.json files
 */
function scanHtmlFiles($dir, $baseDir = null) {
    if ($baseDir === null) {
        $baseDir = $dir;
    }

    $result = [
        'folders' => [],
        'files' => [],
        'metadata' => loadFolderMetadata($dir)
    ];

    // Skip if directory doesn't exist or isn't readable
    if (!is_dir($dir) || !is_readable($dir)) {
        return $result;
    }

    $items = scandir($dir);
    if ($items === false) {
        return $result;
    }

    foreach ($items as $item) {
        // Skip hidden files and current/parent directory
        if ($item[0] === '.' || $item === '..' || $item === '.') {
            continue;
        }

        $fullPath = $dir . DIRECTORY_SEPARATOR . $item;
        $relativePath = str_replace($baseDir . DIRECTORY_SEPARATOR, '', $fullPath);
        $relativePath = str_replace('\\', '/', $relativePath);

        if (is_dir($fullPath)) {
            // Recursively scan subdirectory
            $subStructure = scanHtmlFiles($fullPath, $baseDir);

            // Only include folder if it contains files (directly or in subfolders)
            if (!empty($subStructure['files']) || !empty($subStructure['folders'])) {
                $result['folders'][$item] = $subStructure;
            }
        } elseif (is_file($fullPath) && shouldIncludeFile($item)) {
            // Add file (HTML, text files, or files without extension)
            $extension = pathinfo($item, PATHINFO_EXTENSION);
            $displayName = $extension ? pathinfo($item, PATHINFO_FILENAME) : $item;

            $result['files'][] = [
                'name' => $item,
                'path' => $relativePath,
                'displayName' => $displayName,
                'type' => $extension ?: 'none'
            ];
        }
    }

    // Sort folders and files alphabetically (case-insensitive)
    ksort($result['folders'], SORT_NATURAL | SORT_FLAG_CASE);
    usort($result['files'], function($a, $b) {
        return strnatcasecmp($a['name'], $b['name']);
    });

    return $result;
}

/**
 * Convert structure array to XML
 */
function arrayToXml($data, &$xml, $parentName = 'item') {
    foreach ($data as $key => $value) {
        if (is_array($value)) {
            if ($key === 'folders') {
                foreach ($value as $folderName => $folderData) {
                    $folder = $xml->addChild('folder');
                    $folder->addAttribute('name', $folderName);

                    // Add folder metadata if exists
                    if (!empty($folderData['metadata'])) {
                        foreach ($folderData['metadata'] as $metaKey => $metaValue) {
                            if (is_string($metaValue)) {
                                $folder->addAttribute($metaKey, $metaValue);
                            }
                        }
                    }

                    // Recursively add subfolders and files
                    arrayToXml($folderData, $folder, 'item');
                }
            } elseif ($key === 'files') {
                foreach ($value as $file) {
                    $fileNode = $xml->addChild('page');
                    $fileNode->addAttribute('name', $file['displayName']);
                    $fileNode->addAttribute('path', $file['path']);
                    $fileNode->addAttribute('filename', $file['name']);
                    $fileNode->addAttribute('type', $file['type']);
                }
            } elseif ($key !== 'metadata') {
                $child = $xml->addChild($key);
                arrayToXml($value, $child, $key);
            }
        } elseif ($key !== 'metadata' && !empty($value)) {
            $xml->addAttribute($key, $value);
        }
    }
}

// Main execution
try {
    $structure = scanHtmlFiles(__DIR__);

    if ($format === 'xml') {
        // Generate XML output
        $xml = new SimpleXMLElement('<?xml version="1.0" encoding="UTF-8"?><site></site>');
        $xml->addAttribute('generated', date('c'));
        $xml->addAttribute('project', '0nefinity.love');

        arrayToXml($structure, $xml);

        echo $xml->asXML();
    } else {
        // Output JSON (default)
        echo json_encode($structure, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

} catch (Exception $e) {
    // Fallback: return empty structure on error
    http_response_code(500);

    if ($format === 'xml') {
        echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
        echo '<error>' . htmlspecialchars($e->getMessage()) . '</error>';
    } else {
        echo json_encode([
            'error' => 'Failed to generate file list',
            'folders' => [],
            'files' => []
        ]);
    }
}

