#!/bin/bash
# Fail loud: .md pages (rendered by tools/weird-text-viewer.php) and plain pages must answer 200.
# Usage: bash tests/md-pages-smoke.sh [base-url ...]   (default: www and dev)
# Also renders the viewer locally with php-cli when available, so a bad include is caught before deploy.
set -u
root="$(cd "$(dirname "$0")/.." && pwd)"
bases=("$@")
[ ${#bases[@]} -eq 0 ] && bases=(https://www.0nefinity.love https://dev.0nefinity.love)
fail=0
if command -v php >/dev/null; then
  for md in axiome README; do
    out=$(cd "$root" && DOCUMENT_ROOT="$root" php -r '$_SERVER["DOCUMENT_ROOT"]=getenv("DOCUMENT_ROOT");$_SERVER["HTTP_HOST"]="www.0nefinity.love";$_SERVER["REQUEST_URI"]="/'"$md"'";$_GET["path"]="/'"$md"'.md";include "tools/weird-text-viewer.php";' 2>&1)
    if echo "$out" | grep -q '<!--#\|Internal Server Error\|Fatal'; then
      echo "FAIL local viewer /$md"; fail=1
    else
      echo "ok   local viewer /$md"
    fi
  done
fi
for b in "${bases[@]}"; do
  for p in / /heart /axiome /README /8Butterfly; do
    code=$(curl -s -o /dev/null -w '%{http_code}' "$b$p")
    if [ "$code" = 200 ]; then echo "ok   $code $b$p"; else echo "FAIL $code $b$p"; fail=1; fi
  done
done
exit $fail
