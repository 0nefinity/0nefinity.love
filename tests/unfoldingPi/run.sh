#!/bin/bash
# Komplette unfoldingPi-Suite in chromium, firefox, webkit gegen die Live-Seite, danach die irrational-Tests (B1).
# test_ui (Touch per CDP) und test_license (Server, nicht Browser) laufen nur in chromium.
# Aufruf: bash tests/unfoldingPi/run.sh   (BROWSERS="chromium" zum Eingrenzen; SKIP_B1=1 ueberspringt tests/irrational/run.sh, SKIP_BENCH=1 tests/irrationalBenchmark/run.sh)
cd "$(dirname "$0")" || exit 2
export PYTHONDONTWRITEBYTECODE=1
BROWSERS=${BROWSERS:-"chromium firefox webkit"}
fail=0
for b in $BROWSERS; do
  for t in test_constants test_decoder test_limits test_ui test_front test_nowasm test_errors test_restart test_view_module test_bedienung test_file test_big test_license; do
    case "$t" in test_license|test_ui) [ "$b" != chromium ] && continue;; esac
    echo "=== $b $t"
    BROWSER=$b python3 $t.py > /tmp/unfoldingPi-$b-$t.log 2>&1 && echo "ok   $b $t" || { echo "FAIL $b $t (Log /tmp/unfoldingPi-$b-$t.log)"; fail=1; }
  done
done
if [ -z "$SKIP_B1" ]; then
  bash ../irrational/run.sh > /tmp/unfoldingPi-b1.log 2>&1 && echo "ok   irrational/run.sh" || { echo "FAIL irrational/run.sh (Log /tmp/unfoldingPi-b1.log)"; fail=1; }
fi
if [ -z "$SKIP_BENCH" ]; then
  bash ../irrationalBenchmark/run.sh > /tmp/unfoldingPi-bench.log 2>&1 && echo "ok   irrationalBenchmark/run.sh" || { echo "FAIL irrationalBenchmark/run.sh (Log /tmp/unfoldingPi-bench.log)"; fail=1; }
fi
exit $fail
