#!/usr/bin/env python3
"""
Sitemap Generator für 0nefinity.love
Wird automatisch via Git pre-commit Hook ausgeführt.
"""

import os
import re
from datetime import datetime
from xml.dom import minidom
import xml.etree.ElementTree as ET

DOMAIN = 'https://0nefinity.love'
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITEMAP_FILE = os.path.join(ROOT_DIR, 'sitemap.xml')

EXCLUDE_DIRS = {'.git', '.ssh', '.vscode', '00_Archiv', '__pycache__'}
EXCLUDE_FILES = {'meta.json'}

HTACCESS_FILE = os.path.join(ROOT_DIR, '.htaccess')
_INTERN_RULE = re.compile(r'^RewriteRule\s+"([^"]+)"\s+-\s+\[([^\]]*)\]\s*$')


def intern_patterns():
    """Muster aus dem Block "intern: begin/end" in .htaccess (dort 404), wie in generate-menu.py."""
    with open(HTACCESS_FILE, encoding='utf-8') as f:
        lines = [l.strip() for l in f]
    try:
        start, end = lines.index('# intern: begin'), lines.index('# intern: end')
    except ValueError:
        raise SystemExit('generate-sitemap: Block "# intern: begin/end" fehlt in .htaccess')
    patterns = []
    for line in lines[start + 1:end]:
        if not line or line.startswith('#'):
            continue
        m = _INTERN_RULE.match(line)
        if not m:
            raise SystemExit(f'generate-sitemap: unlesbare Zeile im intern-Block: {line}')
        flags = re.I if 'NC' in m.group(2).split(',') else 0
        patterns.append(re.compile(m.group(1), flags))
    if not patterns:
        raise SystemExit('generate-sitemap: intern-Block in .htaccess ist leer')
    return patterns


INTERN = intern_patterns()


def should_include(name):
    if name.startswith('.'):
        return False
    if name in EXCLUDE_FILES:
        return False
    return True


def collect_urls():
    urls = []
    for dirpath, dirnames, filenames in os.walk(ROOT_DIR):
        # Verzeichnisse in-place filtern (verhindert Abstieg in ausgeschlossene Ordner)
        dirnames[:] = [d for d in dirnames if not d.startswith('.') and d not in EXCLUDE_DIRS]

        for filename in filenames:
            if not should_include(filename):
                continue

            full_path = os.path.join(dirpath, filename)
            rel_path = os.path.relpath(full_path, ROOT_DIR).replace(os.sep, '/')
            if any(p.search(rel_path) for p in INTERN):
                continue
            url = f'{DOMAIN}/{rel_path}'
            lastmod = datetime.fromtimestamp(os.path.getmtime(full_path)).strftime('%Y-%m-%d')
            priority = '1.0' if rel_path == 'index.html' else None

            urls.append({'loc': url, 'lastmod': lastmod, 'priority': priority})

    urls.sort(key=lambda u: u['loc'])
    return urls


def generate():
    urls = collect_urls()

    root = ET.Element('urlset')
    root.set('xmlns', 'http://www.sitemaps.org/schemas/sitemap/0.9')

    for url in urls:
        url_el = ET.SubElement(root, 'url')
        ET.SubElement(url_el, 'loc').text = url['loc']
        ET.SubElement(url_el, 'lastmod').text = url['lastmod']
        if url['priority']:
            ET.SubElement(url_el, 'priority').text = url['priority']

    # Hübsch formatiert ausgeben
    xml_str = minidom.parseString(ET.tostring(root, encoding='unicode')).toprettyxml(indent='  ')
    # toprettyxml fügt eine XML-Deklaration hinzu — erste Zeile behalten
    with open(SITEMAP_FILE, 'w', encoding='utf-8') as f:
        f.write(xml_str)

    print(f'sitemap.xml generiert — {len(urls)} URLs')


if __name__ == '__main__':
    generate()
