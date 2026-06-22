#!/usr/bin/env bash
# Convert a page from the meta.js nav system to SSI includes. Idempotent.
set -euo pipefail
for f in "$@"; do
  # skip if already converted
  if grep -q 'something-in-the-head.html' "$f"; then
    echo "skip (already SSI): $f"; continue
  fi
  # 1) insert head-include right after the opening <head> (first match only)
  perl -0pi -e 's{(<head[^>]*>)}{$1\n  <!--#include virtual="/includes/something-in-the-head.html" -->}s' "$f"
  # 2) delete the meta.css <link> line (with or without trailing "Für KI" comment)
  perl -ni -e 'print unless m{<link[^>]*href="/meta\.css"}' "$f"
  # 3) delete the meta.js <script> line (with or without trailing comment)
  perl -ni -e 'print unless m{<script[^>]*src="/meta\.js"}' "$f"
  # 4) delete tool scripts already provided by the head-include (avoid double-load)
  perl -ni -e 'print unless m{<script[^>]*src="/tools/controls\.js"}' "$f"
  perl -ni -e 'print unless m{<script[^>]*src="/tools/zoom\.js"}' "$f"
  perl -ni -e 'print unless m{<script[^>]*src="/tools/tools/decimal\.js"}' "$f"
  # 5) insert body-include right before the closing </body>
  perl -0pi -e 's{(</body>)}{<!--#include virtual="/includes/something-in-the-body.html" -->\n$1}s' "$f"
  echo "converted: $f"
done
