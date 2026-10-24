#!/bin/bash
# irrational-benchmark in chromium, firefox, webkit gegen die Live-Seite.
# Aufruf: bash tests/irrationalBenchmark/run.sh   (BROWSERS="chromium" zum Eingrenzen)
cd "$(dirname "$0")" || exit 2
export PYTHONDONTWRITEBYTECODE=1
BROWSERS=${BROWSERS:-"chromium firefox webkit"}
fail=0
for b in $BROWSERS; do
  echo "=== $b"
  BROWSER=$b timeout 600 python3 test_benchmark.py > /tmp/irrationalBenchmark-$b.log 2>&1 && echo "ok   $b ($(tail -1 /tmp/irrationalBenchmark-$b.log))" || { echo "FAIL $b (Log /tmp/irrationalBenchmark-$b.log)"; fail=1; }
done
exit $fail
