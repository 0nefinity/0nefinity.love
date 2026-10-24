#!/bin/bash
# Mutanten des Workers: jede Aenderung an einer Kopie (IRRATIONAL_WORKER) muss den genannten Test rot machen (Exit 1).
# Aufruf: bash tests/irrational/mutants.sh   Kopien liegen in einem mktemp-Verzeichnis, der Live-Worker bleibt unberuehrt.
export PYTHONDONTWRITEBYTECODE=1
cd "$(dirname "$0")/../.." || exit 2
SRC=tools/workers/irrational-worker.js
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
bad=0
m() { # name test sed-expression
  local f="$TMP/$1.js"
  sed -E "$3" "$SRC" > "$f"
  if cmp -s "$SRC" "$f"; then echo "FEHLER $1: Muster nicht gefunden (Mutant wirkungslos)"; bad=1; return; fi
  IRRATIONAL_WORKER="$f" node tests/irrational/test_engine.js "$2" > "$TMP/$1.log" 2>&1; rc=$?
  if [ $rc = 1 ]; then echo "rot   $1 ($2, wie gewollt)"; else echo "FEHLER $1 ($2) Exit $rc (erwartet 1)"; bad=1; fi
}
m noguard a5 's/if \(z \|\| nine\) throw/if (false) throw/'
m nohead a5 's/if \(head\[i\] !== h\[i\]\) throw/if (false) throw/'
m bpd_pi_low a4 's/^    pi: 12,/    pi: 8,/'
m getstr_signed a1 's/g\.mpz_get_str\(0, 10, r\) >>> 0/g.mpz_get_str(0, 10, r)/'
m textclass a2 's/^(        )fail\(.irrational-worker: . \+ id \+ . computation failed/\1if (\/Fatal error|Maximum memory\/.test(String(e \&\& e.message))) { limit("device", "text"); return; } fail("irrational-worker: " + id + " computation failed/'
m noreserve a2 's/if \(!p\) return false; \/\/ MUT:reserve/if (false) return false;/'
m nocap a2 's/maxBytes\(\) - baseBytes, 2 \*\* 32 - 1/2 ** 32 - 1/'
m doublecount a2 "s/limit\('device', 'memory\.grow failed/limit(memBytes() + estimateBytes(target) <= maxBytes() ? 'device' : 'engine', 'memory.grow failed/"
m nobase a2 '/^            baseBytes = memBytes\(\);$/d'
m nofree a2 '/^function reserve/,/^}/s/g\.free\(p\);//'
m nosafety a2 's/BYTES_PER_DIGIT\[id\] \* \(digits \+ GUARD\) \* SAFETY/BYTES_PER_DIGIT[id] * (digits + GUARD)/'
m oldreason a2 's/fmtBytes\(askedBytes\)/(Math.round(estimateBytes(target) \/ 2 ** 20) + " MiB")/'
[ $bad = 0 ] && echo "MUTANTS: alle rot" || echo "MUTANTS: FEHLER"
exit $bad
