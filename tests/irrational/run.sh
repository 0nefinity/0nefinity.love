#!/bin/bash
# Alle Tests der Irrational-Engine. Aufruf: bash tests/irrational/run.sh [node|browser]
# Referenzen neu erzeugen (nur bei Bedarf): python3 tests/irrational/gen-refs.py
set -u
cd "$(dirname "$0")/../.."
fail=0
if [ "${1:-all}" != browser ]; then
  node tests/irrational/test_patch.js || fail=1
  for m in stages a1 a2 a3 a4; do
    node tests/irrational/test_engine.js "$m" || fail=1
  done
fi
if [ "${1:-all}" != node ]; then
  for b in chromium firefox webkit; do
    BROWSER=$b python3 tests/irrational/test_browser.py || fail=1
  done
fi
[ $fail = 0 ] && echo "RUN.SH: ALL PASS" || echo "RUN.SH: FAILED"
exit $fail
