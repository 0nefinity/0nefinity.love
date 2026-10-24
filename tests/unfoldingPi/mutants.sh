#!/bin/bash
# Mutantenlauf: jeder Mutant muss einen Test rot machen (Exit 1). Exit 3 = Muster nicht gefunden (Mutant wirkungslos, selbst ein Fehler).
# Aufruf: bash tests/unfoldingPi/mutants.sh   (BROWSERS="chromium" zum Eingrenzen)
cd "$(dirname "$0")" || exit 2
export PYTHONDONTWRITEBYTECODE=1
BROWSERS=${BROWSERS:-"chromium firefox webkit"}
bad=0
m() { # browser test mutant
  BROWSER=$1 MUT=$3 LIMIT=40 GROWTH_LIMIT=20 timeout 200 python3 $2.py > /tmp/unfoldingPi-mut-$1-$2-$3.log 2>&1; rc=$?
  if [ $rc = 1 ]; then echo "rot   $1 $2 MUT=$3 (wie gewollt)"; else echo "FEHLER $1 $2 MUT=$3 Exit $rc (erwartet 1)"; bad=1; fi
}
for b in $BROWSERS; do
  for mu in invert always textclass noreserve; do m $b test_limits $mu; done
  for mu in norfall nonotice nowarn nohint; do m $b test_nowasm $mu; done
  for mu in notry swallow nopiError; do m $b test_errors $mu; done
  for mu in nopiError_reset nodrift_reset nofehlerclass_reset; do m $b test_restart $mu; done
  for mu in nolistener noresize noraf; do m $b test_view_module $mu; done
  m $b test_big cap
done
bash ../irrational/mutants.sh || bad=1
exit $bad
