#!/usr/bin/env python3
"""Referenzstellen mit mpmath (unabhaengig von der Engine): Ziffern NACH dem Komma, ohne Zeilenumbruch.
Aufruf: python3 gen-refs.py   (schreibt ref/<id>.txt)"""
import os, sys
sys.set_int_max_str_digits(0)
from mpmath import mp, mpf, pi, e, sqrt, log, floor

N = {'pi': 400000, 'e': 100000, 'ln2': 100000, 'sqrt2': 100000, 'phi': 100000}
here = os.path.dirname(os.path.abspath(__file__))
for cid, n in N.items():
    mp.dps = n + 50
    v = {'pi': lambda: +pi, 'e': lambda: +e, 'ln2': lambda: log(2),
         'sqrt2': lambda: sqrt(2), 'phi': lambda: (1 + sqrt(5)) / 2}[cid]()
    # ganzzahlig abschneiden (nicht runden)
    scaled = int(floor(v * mpf(10) ** (n + 20)))
    t = str(scaled)
    ip = t[: len(t) - (n + 20)] or '0'
    frac = t[len(t) - (n + 20):] if len(t) >= n + 20 else t.rjust(n + 20, '0')
    open(os.path.join(here, 'ref', cid + '.txt'), 'w').write(frac[:n])
    print(cid, 'int', ip, 'frac', frac[:12], len(frac[:n]))
