#!/usr/bin/env python3
"""
Quelltext des ganzen Projekts als eine Textdatei (includes/code-bundle.txt),
Quelle der Quelle "ganzes Projekt" auf 1c0de.html.

Je Datei: Pfadzeile, Inhalt, Leerzeile. Reihenfolge nach Pfad, Zeilenende \\n.
Quelle: git ls-files, Arbeitsbaum. Erzeugt vom pre-commit-Hook (wie search-index.json).
Bricht laut ab bei Lesefehler, NUL-Byte, leerem Ergebnis oder starkem Schrumpfen.
"""

import importlib.util
import os
import re
import subprocess
import sys

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_REL = 'includes/code-bundle.txt'
OUTPUT_FILE = os.path.join(ROOT_DIR, OUTPUT_REL)

# Was eigener Code ist (Endungen). Alles andere (Bilder, Schriften, Bibeln als .txt, xml) bleibt draussen.
INCLUDE_EXTS = {'.html', '.js', '.css', '.php', '.json', '.md'}

# Ausgeschlossen, jeweils mit Grund:
EXCLUDE_DIRS = (
    'assets/',          # Bibeln und Medien, Fremdtext
    'fonts/',           # base64-Schriften in CSS
    'profilbilder/',    # SVG/CSS mit eingebetteten Daten
    'includes/',        # erzeugte Dateien (Menue, Suchindex, dieses Bundle)
    '00_Archiv/',       # Archiv, nur zum Nachschlagen
    'tools/vendor/',    # Fremdbibliotheken
    'tools/tools/',     # Fremdbibliotheken (Pixi, Decimal, Parsedown)
)
EXCLUDE_FILES = {
    'buyPi.html',       # enthaelt 292000 Pi-Ziffern als Daten
    'index-old.html',   # ersetzte Seite
    '0nefinity-old.js', # ersetzter Stand
    'icon-entwuerfe.html',   # nur auf dev.* erreichbar (Entwurfsseite, 274 KB)
    'autofill-probe.html',   # nur auf dev.* erreichbar (Testseite)
}
# Kopien und Altstaende: "name copy.ext", "name copy 2.ext", "name-old.ext", "name-test.ext"
EXCLUDE_NAME_RE = re.compile(r' copy( \d+)?\.[^./]+$|-old\.[^./]+$|-test\.[^./]+$')
# Dazu alles, was .htaccess fuer Besucher auf 404 stellt (Block "intern: begin/end"): nicht ausliefern.

MIN_FILES = 20
MAX_SHRINK = 0.30  # Abbruch, wenn die Datei um mehr als 30 % kleiner wird; BUNDLE_ALLOW_SHRINK=1 hebt das auf


def load_is_intern():
    spec = importlib.util.spec_from_file_location('generate_menu', os.path.join(ROOT_DIR, 'tools', 'generate-menu.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.is_intern


def tracked_files():
    out = subprocess.run(['git', 'ls-files', '-z'], cwd=ROOT_DIR, check=True, capture_output=True).stdout
    return [p.decode('utf-8') for p in out.split(b'\0') if p]


def wanted(rel, is_intern):
    if os.path.splitext(rel)[1].lower() not in INCLUDE_EXTS:
        return False
    if rel.startswith(EXCLUDE_DIRS) or os.path.basename(rel) in EXCLUDE_FILES:
        return False
    if EXCLUDE_NAME_RE.search(rel):
        return False
    return not is_intern(rel)


def build():
    is_intern = load_is_intern()
    parts = []
    n = 0
    for rel in sorted(p for p in tracked_files() if wanted(p, is_intern)):
        path = os.path.join(ROOT_DIR, rel)
        if not os.path.isfile(path):
            continue  # im Index, aber im Arbeitsbaum geloescht (noch nicht committet)
        with open(path, 'rb') as f:
            raw = f.read()
        if raw.count(b'\0') * 50 > len(raw):
            raise SystemExit(f'generate-code-bundle: {rel} enthaelt viele NUL-Bytes, keine Textdatei (Ausschluss ergaenzen)')
        if b'\0' in raw:
            # Defekte Bytes in der Quelle (z. B. 0neSlider.html): als U+FFFD zeigen statt abbrechen, aber laut melden
            print(f'generate-code-bundle: WARNUNG {rel}: {raw.count(bytes(1))} NUL-Bytes in der Quelle, im Bundle als U+FFFD', file=sys.stderr)
            raw = raw.replace(b'\0', '\ufffd'.encode('utf-8'))
        try:
            text = raw.decode('utf-8')
        except UnicodeDecodeError as e:
            raise SystemExit(f'generate-code-bundle: {rel} ist kein UTF-8: {e}')
        text = text.removeprefix('\ufeff')  # Byte-Order-Mark ist Dateikennung, kein Code
        parts.append(rel + '\n' + text.replace('\r\n', '\n').replace('\r', '\n').rstrip('\n') + '\n\n')
        n += 1
    if n < MIN_FILES:
        raise SystemExit(f'generate-code-bundle: nur {n} Dateien gefunden (erwartet >= {MIN_FILES})')
    return ''.join(parts), n


def main():
    text, n = build()
    old = None
    if os.path.exists(OUTPUT_FILE):
        with open(OUTPUT_FILE, 'rb') as f:
            old = f.read()
    new = text.encode('utf-8')
    if old is not None and len(old) > 0 and len(new) < len(old) * (1 - MAX_SHRINK) and os.environ.get('BUNDLE_ALLOW_SHRINK') != '1':
        raise SystemExit(f'generate-code-bundle: Bundle schrumpft von {len(old)} auf {len(new)} Bytes (mehr als 30 %). '
                         'Beabsichtigt? Dann BUNDLE_ALLOW_SHRINK=1 setzen.')
    if old != new:
        with open(OUTPUT_FILE, 'wb') as f:
            f.write(new)
    print(f'generate-code-bundle: {n} Dateien, {len(new)} Bytes', file=sys.stderr)


if __name__ == '__main__':
    main()
