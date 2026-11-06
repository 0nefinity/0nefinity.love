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
# Gezielte Uebersetzungen, nur in Tims Wortlaut (AGENTS.md, "Uebersetzungen")
TRANSLATIONS_FILE = os.path.join(ROOT_DIR, 'includes', 'some-uebersetzungen.json')
HTACCESS_FILE = os.path.join(ROOT_DIR, '.htaccess')
# Symbole (Lupe, Ausloggen, ...): einzige Quelle, geschrieben vom Icon-Designer (/icon-entwuerfe)
SYMBOLE_FILE = os.path.join(ROOT_DIR, 'tools', 'editor-symbole.js')

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
EXCLUDE_FILES = {'meta.json', 'robots.txt', 'AGENTS.md', 'CLAUDE.md', 'autofill-probe.html', 'icon-entwuerfe.html'}
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
# Feste Eintraege ohne Datei: den Login liefert auf live der Editor-Dienst, auf dev enternity.php.
FIXED_PAGES = [{'name': 'enternity', 'path': 'enternity', 'display': 'enternity', 'fixed': True}]
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
        # other names of a page (e.g. its English one) are found without being printed
        a = dict(attrs)
        if tag == 'meta' and (a.get('name') or '').lower() == 'keywords' and a.get('content'):
            self.parts.append(a['content'] + ' ')

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
    # a page is also found by its other names, without them being printed anywhere
    for path, langs in load_translations().items():
        if path not in index:
            raise SystemExit(f'some-uebersetzungen.json: {path} steht nicht im Menue')
        for tr in langs.values():
            if tr.get('title'):
                index[path] = (tr['title'] + ' ' + index[path])[:INDEX_CAP]
    return index


def load_translations():
    """{ '/seite.html': { 'en': { 'title': ..., 'alias': '/...' } } }; jeder Alias muss als
    Weiterleitung auf die Seite in .htaccess stehen, sonst bricht der Lauf ab."""
    with open(TRANSLATIONS_FILE, encoding='utf-8') as fh:
        translations = json.load(fh)
    with open(HTACCESS_FILE, encoding='utf-8') as fh:
        rules = [l for l in fh if l.lstrip().startswith('RewriteRule')]
    for path, langs in translations.items():
        target = '/' + os.path.splitext(path.lstrip('/'))[0]
        for lang, tr in langs.items():
            alias = tr.get('alias')
            if not alias:
                continue
            slug = re.escape(alias.strip('/'))
            if not any(re.search(r'\^' + slug + r'\b', r) and target in r for r in rules):
                raise SystemExit(f'some-uebersetzungen.json: {lang}-Alias {alias} fehlt in .htaccess (Weiterleitung auf {target})')
    return translations


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


def symbol_svg(name, attrs):
    """SVG eines Symbols aus tools/editor-symbole.js (Block zwischen den Markierungen, reines JSON)."""
    with open(SYMBOLE_FILE, encoding='utf-8') as fh:
        m = re.search(r'/\* symbole: anfang \*/(.*)/\* symbole: ende \*/', fh.read(), re.S)
    if not m:
        raise SystemExit(f'{SYMBOLE_FILE}: Markierungen fehlen')
    sym = json.loads(m.group(1))['symbole'][name]
    view_box = ' '.join(f'{v:g}' for v in sym['viewBox'])
    inhalt = sym['inhalt'].replace('{id}', f'menu-{name}')
    return f'<svg {attrs} viewBox="{view_box}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">{inhalt}</svg>'


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
    lines.append('<div class="menu-search">' + symbol_svg('lupe', 'class="meta-loupe"') + '<input type="search" autocomplete="off" placeholder="activate js or use browser search" disabled aria-label="Suche ben\u00f6tigt JavaScript"><span class="menu-search-stop" aria-hidden="true"></span></div>')
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
