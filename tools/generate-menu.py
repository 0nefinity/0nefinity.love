#!/usr/bin/env python3
"""
Statisches Menü-HTML generieren für SSI-Include.
Gleiche Datei-Walk-Logik wie generate-sitemap.py.
"""

import os
import locale
from html import escape

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_FILE = os.path.join(ROOT_DIR, 'includes', 'something-in-the-body.html')

EXCLUDE_DIRS = {'.git', '.ssh', '.vscode', '00_Archiv', '__pycache__', 'includes'}
EXCLUDE_FILES = {'meta.json'}

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


def collect_structure():
    """Sammelt Dateien/Ordner in hierarchische Struktur."""
    structure = {'folders': {}, 'files': []}

    for dirpath, dirnames, filenames in os.walk(ROOT_DIR):
        dirnames[:] = sorted(
            [d for d in dirnames if not d.startswith('.') and d not in EXCLUDE_DIRS],
            key=lambda x: x.lower()
        )

        rel_dir = os.path.relpath(dirpath, ROOT_DIR)
        if rel_dir == '.':
            rel_dir = ''

        for filename in sorted(filenames, key=lambda x: x.lower()):
            if not should_include(filename):
                continue

            rel_path = os.path.join(rel_dir, filename).replace(os.sep, '/') if rel_dir else filename

            parts = rel_path.split('/')
            if len(parts) == 1:
                # Root-Datei
                if filename not in EXCLUDE_FROM_LIST:
                    name = filename
                    dot = name.rfind('.')
                    display = name[:dot] if dot > 0 else name
                    structure['files'].append({'name': filename, 'path': rel_path, 'display': display})
            else:
                # In Ordner
                current = structure
                for folder in parts[:-1]:
                    if folder not in current['folders']:
                        current['folders'][folder] = {'folders': {}, 'files': []}
                    current = current['folders'][folder]
                name = parts[-1]
                dot = name.rfind('.')
                display = name[:dot] if dot > 0 else name
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
    lines.append('<div class="menu-search"><span class="menu-loupe" aria-hidden="true">0</span><span class="menu-loupe-handle" aria-hidden="true">1</span><input type="search" placeholder="activate js or use browser search" disabled aria-label="Suche ben\u00f6tigt JavaScript"></div>')
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
