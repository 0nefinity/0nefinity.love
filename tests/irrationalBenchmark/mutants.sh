#!/bin/bash
# Mutantenlauf: jeder Mutant muss test_benchmark.py rot machen (Exit 1). Exit 3 = Muster nicht gefunden (Mutant wirkungslos).
# Aufruf: bash tests/irrationalBenchmark/mutants.sh   (BROWSERS="chromium" zum Eingrenzen)
cd "$(dirname "$0")" || exit 2
export PYTHONDONTWRITEBYTECODE=1
BROWSERS=${BROWSERS:-"chromium firefox webkit"}
bad=0
for b in $BROWSERS; do
  for mu in nostop swapcause errorlimit nomark nocurve tailonly nocouple alliter; do
    BROWSER=$b MUT=$mu timeout 600 python3 test_benchmark.py > /tmp/irrationalBenchmark-mut-$b-$mu.log 2>&1; rc=$?
    if [ $rc = 1 ]; then echo "rot   $b MUT=$mu (wie gewollt)"; else echo "FEHLER $b MUT=$mu Exit $rc (erwartet 1)"; bad=1; fi
  done
done
exit $bad
