"""b196-Decoder und Kopfpruefung von tools/pi-file.js unter node (decoder.js), kein Browser.
Pruefungen siehe decoder.js. MUT=<name>: mutierte Kopie von pi-file.js, Exit 3 wenn das Muster fehlt.
BROWSER wird ignoriert (laeuft einmal je Aufruf)."""
import os, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', '..', 'tools', 'pi-file.js')
MUT = os.environ.get('MUT', '')
MUTS = {
    'bitorder': ("v = (k & 1) ? v & MASK : v >> 4n;", "v = (k & 1) ? v >> 4n : v & MASK;"),
    'blockoff': ("const at = (BITS * k) >> 3;", "const at = (BITS * k + 4) >> 3;"),
    'nolim':    ("if (v >= LIM) throw", "if (false) throw"),
    'nofill':   ("if (out[q] !== 48) throw", "if (false) throw"),
    'nopad':    ("for (let q = k * D; q < o; q++) out[q] = 48;", "for (let q = k * D; q < o; q++) out[q] = 49;"),
    'nomagic':  ("!== 'PI59') bad", "!== 'PI59' && false) bad"),
    'noversion': ("if (h[4] !== 1) bad", "if (false) bad"),
    'nodigitshdr': ("if (dv.getBigUint64(8) !== BigInt(digits)) bad", "if (false) bad"),
}
if MUT and MUT not in MUTS:
    print('unbekannter Mutant', MUT); sys.exit(2)
env = dict(os.environ)
if MUT:
    a, b = MUTS[MUT]
    t = open(SRC, encoding='utf8').read()
    if t.count(a) != 1:
        print('Muster nicht gefunden/mehrdeutig:', MUT, t.count(a)); sys.exit(3)
    tmp = tempfile.NamedTemporaryFile('w', suffix='.js', delete=False, encoding='utf8')
    tmp.write(t.replace(a, b)); tmp.close()
    env['MUT_SRC'] = tmp.name
try:
    r = subprocess.run(['node', os.path.join(HERE, 'decoder.js')], env=env, capture_output=True, text=True, timeout=120)
finally:
    if MUT: os.unlink(tmp.name)
print(r.stdout, end=''); print(r.stderr, end='')
sys.exit(0 if r.returncode == 0 else 1)
