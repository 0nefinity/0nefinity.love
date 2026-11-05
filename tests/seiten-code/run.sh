#!/usr/bin/env bash
# tools/seiten-code.php ohne Webserver: Seite -> Kopfzeile + eigener Code + was sie laedt; Interna -> 404.
# Aufruf: bash tests/seiten-code/run.sh  (aus dem Repo-Wurzelverzeichnis)
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
fail=0
run() { php tests/seiten-code/call.php "$PWD" "$1" "${2:-www.0nefinity.love}"; }
expect() {  # $1 seite, $2 grep-Muster, $3 Beschreibung
  if run "$1" "${4:-}" | grep -F -- "$2" >/dev/null; then echo "ok   $3"; else echo "FAIL $3"; fail=1; fi
}
expect_not() {
  if run "$1" "${4:-}" | grep -F -- "$2" >/dev/null; then echo "FAIL $3"; fail=1; else echo "ok   $3"; fi
}

expect "fractal0ne" "hier der gesamte Code dieser Seite 0nefinity.love/fractal0ne:" "Kopfzeile im Wortlaut"
expect "fractal0ne" "===== /fractal0ne.html =====" "Seite selbst"
expect "fractal0ne" "===== /meta.js =====" "Head-Include-Skripte"
expect "fractal0ne" "===== /tools/controls.js =====" "controls.js"
expect "fractal0ne" "===== /includes/something-in-the-head.html =====" "SSI-Include"
expect "fractal0ne" "===== /tools/tools/decimal.js (nur verlinkt) =====" "Fremdbibliothek nur verlinkt"
expect "" "hier der gesamte Code dieser Seite 0nefinity.love/:" "Startseite"
expect "" "===== /0nefinity.js =====" "Startseite laedt 0nefinity.js"
expect_not "fractal0ne" "===== /tools/editor.js =====" "Dev-Editor nicht auf www"
expect "fractal0ne" "===== /tools/editor.js =====" "Dev-Editor auf dev" "dev.0nefinity.love"
expect "Kuriositäten/musterpointfont" "0nefinity.love/Kuriositäten/musterpointfont:" "Unterordner und Umlaut"
expect ".htaccess" "File not found" "Dot-Datei gesperrt"
expect "tools/generate-menu.py" "File not found" "Intern (.py) gesperrt"
expect "AGENTS" "File not found" "Intern (AGENTS.md) gesperrt"
expect "../../etc/passwd" "File not found" "Pfad ausserhalb gesperrt"
expect "enternity" "File not found" "PHP-Seite gesperrt"
exit $fail
