"""Auslieferung: Seite, irrational.js, Worker, gepatchtes Bundle, Patch-Skript, Lizenztexte: 200 mit passendem Content-Type,
Lizenztexte als Text mit Kernsaetzen und sha256 = Repo; der alte Worker ist weg (404). BASE=... ueberschreibt den Host."""
import hashlib, os, urllib.request
from common import *

BASE = HOST
R = Res()


def get(path):
    try:
        r = urllib.request.urlopen(urllib.request.Request(BASE + path, headers={'User-Agent': 'test-license'}))
        return r.status, r.headers.get('Content-Type', ''), r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get('Content-Type', ''), b''


for path, ct in [('/unfoldingPi', 'text/html'), ('/tools/irrational.js', 'javascript'), ('/tools/workers/irrational-worker.js', 'javascript'),
                 ('/tools/vendor/gmp-wasm/gmp-wasm-1.3.2.mini.4gib.umd.min.js', 'javascript'),
                 ('/tools/vendor/gmp-wasm/gmp-wasm-1.3.2.mini.umd.min.js', 'javascript')]:
    st, t, body = get(path)
    R.check(path + ' 200 + Content-Type', st == 200 and ct in t.lower() and len(body) > 100, (st, t, len(body)))
st, t, body = get('/tools/workers/pi-digits-worker.js')
R.check('alter Worker /tools/workers/pi-digits-worker.js -> 404', st == 404, st)

CASES = [
    ('/tools/vendor/gmp-wasm/LICENSE-LGPL-3.0.txt', ['GNU LESSER GENERAL PUBLIC LICENSE', 'Version 3, 29 June 2007', 'This version of the GNU Lesser General Public License incorporates']),
    ('/tools/vendor/gmp-wasm/LICENSE-GPL-3.0.txt', ['GNU GENERAL PUBLIC LICENSE', 'Version 3, 29 June 2007', 'TERMS AND CONDITIONS', 'END OF TERMS AND CONDITIONS']),
]
for path, needles in CASES:
    st, ctype, body = get(path)
    R.check(path + ' Status 200', st == 200, st)
    R.check(path + ' Content-Type text/plain', ctype.lower().startswith('text/plain'), ctype)
    txt = body.decode('utf-8', 'replace')
    R.check(path + ' Kernsaetze', all(n in txt for n in needles), [n for n in needles if n not in txt])
    R.check(path + ' kein HTML-Fallback', '<html' not in txt.lower()[:2000], len(body))
    local = os.path.join(REPO, path.lstrip('/'))
    ok = os.path.exists(local) and hashlib.sha256(open(local, 'rb').read()).hexdigest() == hashlib.sha256(body).hexdigest()
    R.check(path + ' sha256 = Repo', ok)
R.done()
