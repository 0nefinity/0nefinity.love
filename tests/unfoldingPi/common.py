"""Gemeinsame Helfer der unfoldingPi-Tests. Alle laufen gegen die Live-Seite (URL= ueberschreibt).
Mutanten gehen immer per route.fetch/route.fulfill auf die echte Live-URL (nie auf eine rohe Repo-Datei)."""
import os, sys

HOST = os.environ.get('HOST', 'https://dev.0nefinity.love')
URL = os.environ.get('URL', HOST + '/unfoldingPi')
REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
REF_DIR = os.path.join(REPO, 'tests', 'irrational', 'ref')
KICK = "(()=>{const d=document.getElementById('drift'); d.value=-1; d.dispatchEvent(new Event('input',{bubbles:true}));})()"
HINT = 'use better hardware to get access to more digits'


class Res:
    def __init__(self):
        self.r = []

    def check(self, n, ok, info=''):
        self.r.append(bool(ok))
        print(('PASS ' if ok else 'FAIL ') + n + ' ' + str(info), flush=True)

    def done(self):
        print('%d/%d gruen' % (sum(self.r), len(self.r)), flush=True)
        sys.exit(0 if all(self.r) else 1)


def ref(cid):
    """Nachkommastellen der Konstante aus tests/irrational/ref (mpmath)."""
    with open(os.path.join(REF_DIR, cid + '.txt')) as f:
        return f.read().strip()


def route_text(ctx, pattern, fn, label):
    """Antwort der echten URL holen, Text durch fn(text) ersetzen."""
    def h(r):
        resp = r.fetch()
        t = resp.text()
        t2 = fn(t)
        print('ROUTE %s geaendert=%s' % (label, t2 != t), flush=True)
        r.fulfill(response=resp, body=t2)
    ctx.route(pattern, h)


def mutate(ctx, pattern, a, b, label='mutant'):
    """a/b: ein Paar oder Listen gleicher Laenge (alle Paare in EINER Route). Fehlt das Muster: Abbruch (Exit 3)."""
    pairs = list(zip(a, b)) if isinstance(a, list) else [(a, b)]

    def fn(t):
        for x, y in pairs:
            if x not in t:
                print('MUTANT-FEHLER: Muster nicht gefunden: %r' % x, flush=True)
                os._exit(3)
            t = t.replace(x, y, 1)
        return t
    route_text(ctx, pattern, fn, label)


def prepend_worker(ctx, code, pair=None):
    """Code vor den Worker setzen (z. B. WebAssembly abschalten); pair = (alt, neu) mutiert zusaetzlich."""
    def fn(t):
        if pair:
            if pair[0] not in t:
                print('MUTANT-FEHLER: Muster nicht gefunden: %r' % pair[0], flush=True)
                os._exit(3)
            t = t.replace(pair[0], pair[1], 1)
        return code + t
    route_text(ctx, '**/irrational-worker.js', fn, 'worker-prepend' + ('+mutant' if pair else ''))
