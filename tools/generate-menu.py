#!/usr/bin/env python3
"""
Statisches Menü-HTML generieren für SSI-Include.
Quelle: git ls-files, ohne Entwickler-Material (siehe EXCLUDE_*).
"""

import os
import subprocess
from html import escape

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_FILE = os.path.join(ROOT_DIR, 'includes', 'something-in-the-body.html')

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

    return structure


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
    lines.append('<div class="menu-search"><svg class="meta-loupe" viewBox="-79 -498 946 946" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false"><path class="meta-loupe-lens" d="M261 5Q198 5 148.5 -23.0Q99 -51 70.5 -99.0Q42 -147 42 -209Q42 -270 70.5 -317.5Q99 -365 148.0 -392.0Q197 -419 260 -419Q322 -419 371.5 -391.5Q421 -364 449.5 -316.5Q478 -269 478 -206Q478 -146 449.5 -97.5Q421 -49 372.5 -22.0Q324 5 261 5ZM261 -50Q304 -50 338.0 -70.0Q372 -90 391.0 -125.5Q410 -161 410 -206Q410 -251 391.0 -287.0Q372 -323 338.0 -344.0Q304 -365 260 -365Q217 -365 182.5 -345.0Q148 -325 128.0 -290.0Q108 -255 108 -209Q108 -164 128.0 -127.5Q148 -91 183.0 -70.5Q218 -50 261 -50Z"/><g class="meta-loupe-handle"><path d="M196 -414H243V0H175V-394L201 -360L59 -278L34 -322Z"/></g></svg><input type="search" placeholder="activate js or use browser search" disabled aria-label="Suche ben\u00f6tigt JavaScript"><span class="menu-search-stop" aria-hidden="true"></span></div>')
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

    total = sum(1 for line in lines if '<li><a ' in line)
    print(f'menu.html generiert — {total} Einträge')


if __name__ == '__main__':
    generate()
