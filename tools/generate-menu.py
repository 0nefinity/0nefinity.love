#!/usr/bin/env python3
"""
Statisches Menü-HTML generieren für SSI-Include.
Quelle: git ls-files, ohne Entwickler-Material (siehe EXCLUDE_*).
"""

import json
import os
import re
import subprocess
from html import escape
from html.parser import HTMLParser

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_FILE = os.path.join(ROOT_DIR, 'includes', 'something-in-the-body.html')
INDEX_FILE = os.path.join(ROOT_DIR, 'includes', 'search-index.json')

# Volltext-Index: sichtbarer Text der Seiten im Menue, geladen von meta.js beim
# ersten Tastendruck in der Suche. Je Datei auf INDEX_CAP Zeichen begrenzt.
INDEX_CAP = 20000
NON_TEXT_EXTS = {
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.mp3', '.mp4', '.webm',
    '.wav', '.ogg', '.pdf', '.zip', '.woff', '.ttf', '.otf', '.php',
}

# Das Menue listet nur, was git verfolgt (git ls-files) und ein Besucher
# aufrufen kann. Entwickler-Material bleibt draussen.
EXCLUDE_DIRS = {
    '00_Archiv', '__pycache__', 'includes',
    'fonts', 'node_modules', 'test-results', 'profilbilder',
    'tests',        # Testsuiten und Mutationsskripte
    'docs',         # interne Specs, Plaene, Reviews
    'tools',        # Skripte, Vendor-Bibliotheken, Worker
    'api',          # Endpunkte, keine Seiten
    'errorpages',   # Fehlerseiten-Vorlagen
}
EXCLUDE_FILES = {'meta.json', 'robots.txt', 'AGENTS.md', 'CLAUDE.md'}
EXCLUDE_EXTS = {
    '.js', '.css', '.py', '.sh', '.json', '.xml', '.sql', '.pdn', '.ico',
    '.hmtl', '.idea', '.before-gitnexus', '.woff2', '.map', '.config',
}

# Gleiche Priority-Items wie in meta.js
PRIORITY_ITEMS = [
    {'type': 'heading', 'text': 'legal stuff first:'},
    {'type': 'file', 'path': 'impressum-und-datenschutz.html', 'name': 'impressum-und-datenschutz'},
    {'type': 'heading', 'text': 'now the party:'},
    {'type': 'file', 'path': 'README.html', 'name': 'README'},
]
EXCLUDE_FROM_LIST = {'impressum-und-datenschutz.html', 'README.html'}
# Gehoert zu 0nefinity.com (Cookie-Shop); auf .love gibt es keine Cookies.
COM_ONLY = ('cookies.html', 'assets/cookies/')
# Feste Eintraege ohne Datei. /enternity (Login: live der Editor-Dienst, dev enternity.php) steht bewusst
# nicht im Menue und nicht in der Suche, nur die direkte URL fuehrt hin.
FIXED_PAGES = []
FIXED_PATHS = {'enternity.php'}


HTACCESS_FILE = os.path.join(ROOT_DIR, '.htaccess')
_INTERN_RULE = re.compile(r'^RewriteRule\s+"([^"]+)"\s+-\s+\[([^\]]*)\]\s*$')


def intern_patterns():
    """Muster aus dem Block "intern: begin/end" in .htaccess (dort 404). Bricht laut ab, wenn er fehlt."""
    with open(HTACCESS_FILE, encoding='utf-8') as f:
        lines = [l.strip() for l in f]
    try:
        start, end = lines.index('# intern: begin'), lines.index('# intern: end')
    except ValueError:
        raise SystemExit('generate-menu: Block "# intern: begin/end" fehlt in .htaccess')
    patterns = []
    for line in lines[start + 1:end]:
        if not line or line.startswith('#'):
            continue
        m = _INTERN_RULE.match(line)
        if not m:
            raise SystemExit(f'generate-menu: unlesbare Zeile im intern-Block: {line}')
        flags = re.I if 'NC' in m.group(2).split(',') else 0
        patterns.append(re.compile(m.group(1), flags))
    if not patterns:
        raise SystemExit('generate-menu: intern-Block in .htaccess ist leer')
    return patterns


INTERN = intern_patterns()


def is_intern(rel_path):
    return any(p.search(rel_path) for p in INTERN)


def should_include(name):
    if name.startswith('.'):
        return False
    if name.startswith('_'):
        return False
    if name in EXCLUDE_FILES:
        return False
    return True


def is_page(rel_path):
    """True, wenn der getrackte Pfad ins Menue gehoert."""
    if rel_path.startswith(COM_ONLY) or rel_path in FIXED_PATHS or is_intern(rel_path):
        return False
    parts = rel_path.split('/')
    if any(not should_include(p) for p in parts):
        return False
    if any(d in EXCLUDE_DIRS for d in parts[:-1]):
        return False
    return os.path.splitext(parts[-1])[1].lower() not in EXCLUDE_EXTS


def tracked_files():
    """Alle von git verfolgten Pfade (bricht laut ab, wenn git fehlt)."""
    out = subprocess.run(
        ['git', 'ls-files', '-z'], cwd=ROOT_DIR, check=True,
        stdout=subprocess.PIPE).stdout.decode('utf-8')
    return [p for p in out.split('\0') if p]


def collect_structure():
    """Sammelt Dateien/Ordner in hierarchische Struktur."""
    structure = {'folders': {}, 'files': []}

    for rel_path in sorted(tracked_files(), key=lambda x: x.lower()):
        if not is_page(rel_path):
            continue
        if not os.path.isfile(os.path.join(ROOT_DIR, rel_path)):
            continue  # getrackt, aber lokal geloescht
        parts = rel_path.split('/')
        filename = parts[-1]
        current = structure
        for folder in parts[:-1]:
            current = current['folders'].setdefault(folder, {'folders': {}, 'files': []})
        if len(parts) == 1 and filename in EXCLUDE_FROM_LIST:
            continue
        dot = filename.rfind('.')
        display = filename[:dot] if dot > 0 else filename
        current['files'].append({'name': filename, 'path': rel_path, 'display': display})

    structure['files'].extend(dict(f) for f in FIXED_PAGES)
    return structure


class _TextExtractor(HTMLParser):
    SKIP = {'script', 'style', 'template', 'svg', 'noscript', 'canvas'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP:
            self.skip += 1
        self.parts.append(' ')

    def handle_endtag(self, tag):
        if tag in self.SKIP and self.skip:
            self.skip -= 1
        self.parts.append(' ')

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def visible_text(rel_path):
    """Sichtbarer Text einer Seite (None: keine Textdatei)."""
    ext = os.path.splitext(rel_path)[1].lower()
    if ext in NON_TEXT_EXTS:
        return None
    with open(os.path.join(ROOT_DIR, rel_path), 'rb') as fh:
        raw = fh.read()
    if b'\0' in raw[:4096]:
        return None
    text = raw.decode('utf-8', errors='replace')
    if ext in ('.html', '.htm') or (not ext and text.lstrip()[:1] == '<'):
        parser = _TextExtractor()
        parser.feed(text)
        parser.close()
        text = ''.join(parser.parts)
    return re.sub(r'\s+', ' ', text).strip()[:INDEX_CAP]


def build_search_index(structure):
    """{ '/pfad': text } fuer genau die Dateien, die im Menue stehen."""
    index = {}

    def walk(node):
        for f in node['files']:
            if f.get('fixed'):
                continue  # keine Datei, nichts zu indizieren
            text = visible_text(f['path'])
            if text is not None:
                index['/' + f['path']] = text
        for sub in node['folders'].values():
            walk(sub)

    walk(structure)
    for item in PRIORITY_ITEMS:
        if item['type'] == 'file':
            text = visible_text(item['path'])
            if text is not None:
                index['/' + item['path']] = text
    return index


def render_file(f):
    href = '/' + f['path']
    return f'<li><a href="{escape(href)}">{escape(f["name"])}</a></li>'


def render_folder(name, data):
    parts = [f'<li><details><summary>{escape(name)}</summary><ul class="folder-contents">']

    for subfolder_name in sorted(data['folders'].keys(), key=lambda x: x.lower()):
        parts.append(render_folder(subfolder_name, data['folders'][subfolder_name]))

    for f in sorted(data['files'], key=lambda x: x['name'].lower()):
        parts.append(render_file(f))

    parts.append('</ul></details></li>')
    return ''.join(parts)


def generate():
    structure = collect_structure()

    lines = []
    lines.append('<nav id="meta-nav" aria-label="Hauptnavigation">')
    lines.append('<a href="/index.html" class="back-button" aria-label="Startseite">\u22C5</a>')
    lines.append('<div class="menu">')
    lines.append('<input type="checkbox" id="menu-toggle" class="menu-toggle-input">')
    lines.append('<label for="menu-toggle" class="menu-backdrop" aria-hidden="true"></label>')
    lines.append('<label for="menu-toggle" class="menu-button" aria-label="Men\u00fc"><span class="menu-closed-text">\u2261</span><span class="menu-open-text">0 \u2261 1 \u2261 \u221E</span></label>')
    lines.append('<div class="menu-content-wrapper">')
    lines.append('<div class="menu-search"><svg class="meta-loupe" viewBox="-79 -498 946 946" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false"><path class="meta-loupe-lens" d="M261 5Q198 5 148.5 -23.0Q99 -51 70.5 -99.0Q42 -147 42 -209Q42 -270 70.5 -317.5Q99 -365 148.0 -392.0Q197 -419 260 -419Q322 -419 371.5 -391.5Q421 -364 449.5 -316.5Q478 -269 478 -206Q478 -146 449.5 -97.5Q421 -49 372.5 -22.0Q324 5 261 5ZM261 -50Q304 -50 338.0 -70.0Q372 -90 391.0 -125.5Q410 -161 410 -206Q410 -251 391.0 -287.0Q372 -323 338.0 -344.0Q304 -365 260 -365Q217 -365 182.5 -345.0Q148 -325 128.0 -290.0Q108 -255 108 -209Q108 -164 128.0 -127.5Q148 -91 183.0 -70.5Q218 -50 261 -50Z"/><g class="meta-loupe-handle"><path d="M196 -414H243V0H175V-394L201 -360L59 -278L34 -322Z"/></g></svg><input type="search" autocomplete="off" placeholder="activate js or use browser search" disabled aria-label="Suche ben\u00f6tigt JavaScript"><span class="menu-search-stop" aria-hidden="true"></span></div>')
    lines.append('<ul id="file-list">')

    # Priority items
    for item in PRIORITY_ITEMS:
        if item['type'] == 'heading':
            lines.append(f'<li><span class="menu-heading">{escape(item["text"])}</span></li>')
        elif item['type'] == 'file':
            href = '/' + item['path']
            lines.append(f'<li><a href="{escape(href)}">{escape(item["name"])}</a></li>')

    # Ordner
    for folder_name in sorted(structure['folders'].keys(), key=lambda x: x.lower()):
        lines.append(render_folder(folder_name, structure['folders'][folder_name]))

    # Root-Dateien
    for f in sorted(structure['files'], key=lambda x: x['name'].lower()):
        lines.append(render_file(f))

    lines.append('</ul>')
    lines.append('</div>')
    lines.append('</div>')
    lines.append('</nav>')

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as out:
        out.write(''.join(lines) + '\n')

    index = build_search_index(structure)
    with open(INDEX_FILE, 'w', encoding='utf-8') as out:
        json.dump(index, out, ensure_ascii=False, separators=(',', ':'), sort_keys=True)
        out.write('\n')
    print(f'search-index.json — {len(index)} Dateien, {os.path.getsize(INDEX_FILE) // 1024} KB')

    total = sum(1 for line in lines if '<li><a ' in line)
    print(f'menu.html generiert — {total} Einträge')


if __name__ == '__main__':
    generate()
