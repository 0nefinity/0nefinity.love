#!/usr/bin/env python3
"""Static autofill check. Run from anywhere: python3 tests/autofill/static-check.py

1. type=password must not appear outside the login (LOGIN_FILES).
2. Shared infrastructure (meta.js, tools/controls.js, includes/*.html) must never create
   a text-like <input>/<textarea> without autocomplete (createElement: within 15 lines).
3. meta.js must still contain the runtime guard ("Autofill-Waechter").
Old stand-alone pages are covered at runtime by the guard (tests/autofill/run.js).
"""
import re, subprocess, sys
from pathlib import Path

root = Path(__file__).resolve().parents[2]
tracked = subprocess.check_output(['git', 'ls-files'], cwd=root, text=True).splitlines()
LOGIN_FILES = {'enternity.php'}  # the login page: the only place allowed to hold a password field
SKIP_DIRS = ('00_Archiv/', 'tools/vendor/', 'node_modules/', 'tests/')
NON_TEXT = re.compile(r'type\s*=\s*["\']?(checkbox|radio|range|color|button|submit|reset|hidden|file|image)', re.I)
problems = []

for f in tracked:
    if f in LOGIN_FILES or f.startswith(SKIP_DIRS) or not f.endswith(('.html', '.js', '.php')):
        continue
    try:
        text = (root / f).read_text(errors='replace')
    except OSError:
        continue
    for m in re.finditer(r'type\s*=\s*["\']password["\']|\.type\s*=\s*["\']password["\']|setAttribute\(\s*["\']type["\']\s*,\s*["\']password["\']', text, re.I):
        problems.append(f'{f}:{text[:m.start()].count(chr(10)) + 1}: type=password outside the login')

scope = ['meta.js', 'tools/controls.js'] + [f for f in tracked if f.startswith('includes/') and f.endswith('.html')]
for f in scope:
    lines = (root / f).read_text(errors='replace').splitlines()
    for i, line in enumerate(lines):
        for m in re.finditer(r'<(input|textarea)\b[^>]*>?', line):
            tag = m.group(0)
            if NON_TEXT.search(tag) or 'autocomplete' in tag:
                continue
            problems.append(f'{f}:{i + 1}: <{m.group(1)}> without autocomplete')
        if re.search(r'createElement\(\s*["\'](input|textarea)["\']', line):
            ctx = '\n'.join(lines[i:i + 16])
            if 'autocomplete' not in ctx and not NON_TEXT.search(ctx[:400]):
                problems.append(f'{f}:{i + 1}: createElement(input/textarea) without autocomplete within 15 lines')

# 4. Shared infrastructure must create text fields as type=search (no Chrome Android autofill bar), never type=text.
TEXT_TYPE = re.compile(r'<input\b[^>]*type\s*=\s*["\']text["\']|\.type\s*=\s*["\']text["\']|setAttribute\(\s*["\']type["\']\s*,\s*["\']text["\']|type\s*=\s*["\']text["\']\s*,', re.I)
for f in scope:
    for i, line in enumerate((root / f).read_text(errors='replace').splitlines()):
        if TEXT_TYPE.search(line) and 'type === \'text\'' not in line:
            problems.append(f'{f}:{i + 1}: type=text (use type=search)')

if 'Autofill-Waechter' not in (root / 'meta.js').read_text():
    problems.append('meta.js: runtime guard "Autofill-Waechter" missing')

if problems:
    print('autofill static check FAILED:')
    for p in problems:
        print('  ' + p)
    sys.exit(1)
print('autofill static check OK')
