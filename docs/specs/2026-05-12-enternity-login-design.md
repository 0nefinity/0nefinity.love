# Design-Spec: /enternity Login + /admin Dashboard

**Datum:** 2026-05-12
**Status:** Decisions finalisiert — Phase 1 implementierbar
**Scope:** Authentifizierung für `0nefinity.love`, schützt `/admin`-Pfad. Restliche Site bleibt öffentlich.

---

## 1. Übersicht

### Ziel
Tim braucht einen geschützten `/admin`-Bereich auf `0nefinity.love` für Site-Analytics (Umami-Embed) und später User-Verwaltung. Login läuft über `/enternity` (Wortspiel "enter eternity / enter 0nefinity").

### Phasen-Roadmap

**Phase 1 (jetzt):**
- Single User: Username **fest `0nefinity`** (siehe Decision 1)
- `/enternity` Login-Form, `/admin` Dashboard-Stub
- PW initial via **Setup-Token-Flow** (siehe Decision 2): Container generiert beim ersten Start ein Token in `/app/.auth/setup-token`. Tim liest es per `docker exec`, gibt es auf `/enternity` statt PW ein, legt dann das echte PW fest. Token wird danach automatisch gelöscht. Setup-Modus aktiv solange `users`-Tabelle leer **UND** `setup-token`-File existiert.
- Email optional (Decision 4)
- Kein Passwort-Reset (nur CLI, Decision 5)
- Logout funktioniert
- Rate-Limiting gegen Brute-Force
- HaveIBeenPwned-Check beim PW-Setzen (Decision: 2026 PW-Standards)
- CSP-Header im **report-only**-Modus (Decision 6)

**Phase 2 (später, nicht Teil dieser Spec):**
- Mehrere User: Registrierung via **Invite-Link** (Tim generiert Tokens via CLI, Decision 3)
- Email-Adresse pro User **pflicht** (für Passkey-Recovery, Decision 4)
- Passwort-Reset via Email
- Rollen (admin vs. user)
- Umami-Analytics ins Admin eingebettet
- **WebAuthn / Passkeys** als alternativer Login-Pfad (passwordless, biometrisch). Lib-Empfehlung: `web-auth/webauthn-lib` (PHP)
- Optional: 2FA (TOTP) als Fallback wenn kein Passkey
- CSP-Header zu **enforce** schärfen

### Nicht-Ziele
- Keine SSO / OAuth-Provider
- Kein "Login mit Google/GitHub"
- Keine Magic-Links (Phase 1)
- Kein "Remember Me" (Phase 1 — Session reicht 30 Tage idle)

---

## 2. Architektur-Entscheidung

### Bewertete Optionen

**A) nginx basic-auth auf `/admin`**
- Pro: Null Backend-Code, htpasswd-File, fertig in 5 min
- Kontra: Browser-Modal-UI (kein Custom-`/enternity`), kein Logout, kein Rate-Limit, kein Pfad zu Phase 2
- Verdict: zu unflexibel

**B) PHP-Endpoints im bestehenden Apache-Container** ← **EMPFOHLEN**
- Pro: Apache+PHP 8.3 läuft **schon** (siehe `docker-compose.yml`). `password_hash(PASSWORD_ARGON2ID)` und `pdo_sqlite` sind in PHP-Core. **Kein neuer Container, kein neuer Port, keine zweite Sprache.** Tim's Stack ist seit Jahren PHP-fähig (siehe `tools/color.php`, `tools/weird-text-viewer.php`).
- Kontra: PHP-Sessions per Default Cookies (HttpOnly+Secure setzbar, ok). Apache-Modul `mod_php` ist klassisch, aber stabil.
- Verdict: kleinste Diff, maximaler Reuse

**C) Mini-FastAPI/Express-Container neben Apache**
- Pro: Tim's Lieblings-Stack in anderen Projekten (Winkelapp), JWT-Cookies sauber
- Kontra: Zweiter Container, zweiter Port, nginx-Routing-Splittung, mehr Maintenance. Kein Mehrwert gegenüber B.
- Verdict: Overkill für 1-User-System mit existierendem PHP

**D) Authelia/Authentik im Proxy**
- Pro: Enterprise-Auth-Layer
- Kontra: Auth-Pages nicht customizable (`/enternity`-Branding geht nicht), Overkill, mehr Komponenten
- Verdict: nein

**E) Cloudflare Access / Tailscale Funnel**
- Pro: Zero-Code
- Kontra: Externer Anbieter im Auth-Path, kein Custom-UI, nicht self-hosted
- Verdict: nein

### Empfehlung
**Option B (PHP-Endpoints im bestehenden Container).** Grund: Apache + PHP 8.3 läuft schon, alle benötigten Features (`PASSWORD_ARGON2ID`, `pdo_sqlite`, `session`, `openssl`) sind im Image. Wir adden ~3 PHP-Files + 1 SQLite-DB, kein neuer Service, kein neuer Port. Minimal-invasive Erweiterung der bestehenden Architektur.

---

## 3. Tech-Stack

| Komponente | Wahl | Begründung |
|---|---|---|
| Backend-Sprache | PHP 8.3 | Schon im Container, kein neuer Build |
| Web-Server | Apache 2.4 (vorhanden) | Schon konfiguriert |
| DB | SQLite (PDO) | Datei `/var/www/html/.auth/auth.sqlite`, kein DB-Server, reicht für <10k Usern |
| Password-Hashing | **Argon2id mit expliziten OWASP-2024+-Params** (siehe unten) | OWASP-Empfehlung 2024+, memory-hard → GPU/ASIC-resistent |
| Password-Policy | **NIST 800-63B-3:** min 12 Zeichen, keine erzwungene Komplexität, HIBP-Check via k-anonymity | Länge schlägt Komplexität; Komplexitätsregeln sind nachweislich schädlich (NIST). HIBP verhindert bekannt-kompromittierte PWs. |
| Session-Mechanismus | PHP-Session-Cookie (`PHPSESSID`) | HttpOnly+Secure+SameSite=Strict, **Lifetime 14 Tage** (vorher: 30 Tage idle). **Kein JWT** — lohnt sich erst bei verteilten Services. |
| Rate-Limiting | Selbstgebaut in PHP via SQLite-Tabelle `login_attempts(ip, ts)` | **5 Fails/IP/min, exponential backoff bei wiederholten Fails** (1s, 2s, 4s, 8s …) |
| CSRF | SameSite=Strict + **Double-Submit-Token** bei allen POST-Endpoints | Defense-in-depth |

### Argon2id-Parameter (explizit setzen, OWASP 2024+)

PHP-Default ist konservativ — wir setzen explizit:

```php
password_hash($pw, PASSWORD_ARGON2ID, [
    'memory_cost' => 65536,   // 64 MiB
    'time_cost'   => 4,
    'threads'     => 1,
]);
```

Begründung:
- `memory_cost=65536` (64 MiB) → Memory-Hardness, ASIC-resistant
- `time_cost=4` → vier Iterationen, ~150-300ms auf modernem Server
- `threads=1` → deterministisch, kein Multi-Threading-Overhead bei Single-User-System

`password_verify()` macht constant-time-Compare intern (timing-attack-resistent).

### HIBP-Check (HaveIBeenPwned, k-anonymity)

Beim Setzen eines neuen Passworts (Setup-Flow oder CLI):
1. SHA1 vom PW berechnen, in HEX-uppercase
2. Erste **5 Zeichen** an `https://api.pwnedpasswords.com/range/<5hex>` schicken
3. Response ist Liste von Suffix-Hashes mit Treffer-Counts
4. Lokal prüfen ob unser Hash-Suffix in Liste → ablehnen wenn ja

**Wichtig:** Das echte PW (auch der volle Hash) verlässt **nie** den Server. Nur die ersten 5 Hex-Zeichen.

### Warum Argon2id statt bcrypt (für Tim)
- Bcrypt (1999) ist CPU-hart aber leicht parallelisierbar auf GPUs/ASICs
- Argon2id (2015) ist zusätzlich **Memory-hart** → Angreifer braucht viel RAM pro Versuch, das verteuert Brute-Force massiv
- Beide sind sicher. Argon2id ist die moderne Empfehlung (OWASP 2024+)
- PHP 7.3+ liefert Argon2id native, ohne Extra-Lib

---

## 4. Datenmodell

SQLite-Datei: `/var/www/html/.auth/auth.sqlite`
Pfad **außerhalb** des Web-Root via `.htaccess`-Block (siehe Security-Sektion).

```sql
CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,           -- Argon2id
  email         TEXT,                    -- Phase 2: pflicht, Phase 1: NULL ok
  role          TEXT NOT NULL DEFAULT 'admin',  -- 'admin' | 'user'
  created_at    INTEGER NOT NULL,        -- unix ts
  last_login_at INTEGER
);

CREATE TABLE login_attempts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ip         TEXT NOT NULL,
  username   TEXT,                       -- für gezielte Lockouts später
  success    INTEGER NOT NULL,           -- 0 oder 1
  ts         INTEGER NOT NULL
);
CREATE INDEX idx_attempts_ip_ts ON login_attempts(ip, ts);

CREATE TABLE sessions (
  -- optional, nur falls eigene Session-Verwaltung gewünscht
  -- Phase 1 nutzen wir native PHP-Sessions, Tabelle nicht nötig
);

-- Phase 2 Vorbereitung (Schema ok in Phase 1 anzulegen, aber nicht benutzt):
CREATE TABLE invite_tokens (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash  TEXT UNIQUE NOT NULL,      -- SHA256 vom Token, niemals Klartext speichern
  email       TEXT,                       -- optional pre-fill
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,           -- typisch 7 Tage
  used_at     INTEGER,                    -- NULL = noch gültig
  used_by_uid INTEGER REFERENCES users(id)
);
```

---

## 5. API-Endpoints

Alle Endpoints im PHP-Container, geroutet via `.htaccess`-Rewrite oder als direkte `.php`-Files. Route-Form bevorzugt:

| Method | Pfad | Body | Response | Zweck |
|---|---|---|---|---|
| `GET` | `/enternity` | — | HTML-Form | Login-Seite (rendert `enternity.php`) |
| `POST` | `/api/auth/login` | `{username, password, csrf}` | 200 + Set-Cookie / 401 / 429 | Login-Submit |
| `POST` | `/api/auth/logout` | `{csrf}` | 200 + Clear-Cookie | Logout |
| `GET` | `/api/auth/me` | — (Cookie) | `{user: {username, role}}` oder 401 | Session-Check für Client |
| `GET` | `/admin` | — (Cookie) | HTML wenn auth, sonst 302 → `/enternity?next=/admin` | Admin-Dashboard |
| `GET` | `/admin/*` | — (Cookie) | Geschützt | Alle Sub-Pfade |

### Response-Codes
- `200` Erfolg (mit JSON oder HTML)
- `401` Unauth (falsche Credentials, kein Session-Cookie)
- `429` Rate-Limited (zu viele Versuche von IP)
- `403` CSRF-Token-Fehler
- `302` Redirect zu `/enternity?next=…` wenn nicht eingeloggt und HTML-Request

### Login-Flow
1. User öffnet `/enternity` → GET liefert HTML mit Form (mit CSRF-Token im Hidden-Field, Token in Session gespeichert)
2. User submitted → POST `/api/auth/login` mit JSON `{username, password, csrf}`
3. Server: Rate-Limit-Check (5 Fails/IP/min) → CSRF-Check → SELECT user → `password_verify(…)` → constant-time bei Mismatch (sleep ~300ms statt early-return, gegen Timing-Leaks)
4. Bei Erfolg: `session_regenerate_id(true)` (gegen Session-Fixation), `$_SESSION['uid'] = …`, JSON `{ok: true}` zurück
5. Client redirected auf `/admin` (oder `next` aus Query)
6. `/admin` rendert PHP, prüft `$_SESSION['uid']`, sonst 302 → `/enternity?next=/admin`

---

## 6. UX-Wireframes (ASCII)

### `/enternity` (Login-Seite)

```
                                                 (dark bg, var(--bg-color))

                       ┌───────────────────────────────────┐
                       │                                   │
                       │       Enter 0nefinity             │  ← H1 (font-family inherit)
                       │                                   │
                       │   Enter username and pw and       │  ← subline
                       │   press enter to enter 0nefinity  │
                       │                                   │
                       │   ┌─────────────────────────┐    │
                       │   │ username                │    │  ← input[type=text]
                       │   └─────────────────────────┘    │     autocomplete="username"
                       │                                   │
                       │   ┌──────────────────────┐ ┌──┐  │
                       │   │ ••••••••             │ │👁│  │  ← input[type=password]
                       │   └──────────────────────┘ └──┘  │     + eye-toggle button
                       │                                   │
                       │   ┌─────────────────────────┐    │
                       │   │        Enter            │    │  ← submit btn
                       │   └─────────────────────────┘    │
                       │                                   │
                       │   [error-slot inline]            │  ← "Falsche Logindaten"
                       │                                   │
                       └───────────────────────────────────┘

  footer: nav links (Impressum, README) — wie auf index
```

### Layout-Spec
- Wrapper: `display:flex; min-height: 100svh; align-items:center; justify-content:center; padding: 4vw`
- Card: `max-width: 360px; width: 100%; padding: 2rem; border: 1px solid var(--text-color); border-radius: 4px`
- Inputs: `font-size: 16px` (iOS-Zoom-Prevention!), `padding: 12px`, `width: 100%`, `min-height: 44px` (Tap-Target)
- Eye-Toggle: `min-width: 44px; min-height: 44px`, SVG-Icon (eye / eye-slash)
- Button: `min-height: 44px`, `cursor: pointer`, `:hover` + `:focus-visible` Styles
- Error: `color: var(--error-color, #ff4040)`, `font-size: 0.875rem`, slot ist immer im DOM (kein Layout-Shift), nur Inhalt wechselt
- Loading-State: Button `disabled`, Text → "…", Inputs `readonly`

### Mobile-Checkliste
- [x] `font-size: 16px` auf Inputs (kein iOS-Zoom)
- [x] Tap-Targets ≥44px
- [x] `viewport meta` schon im Layout (`width=device-width, initial-scale=1`)
- [x] Kein Hover-only Feedback (Eye-Toggle hat sichtbaren Focus-Ring)
- [x] Form-Submit per Enter-Key auf jedem Input (kein JS nötig — native `<form>` macht das)
- [x] `autocomplete="username"` + `autocomplete="current-password"` (Browser-PW-Manager)

### Dark-Mode
0nefinity ist sowieso dark-themed. Verwende `var(--bg-color)`, `var(--text-color)`, `var(--text-color-hover)` aus `meta.css`. Kein eigenes Theme-CSS — erbt vom globalen.

### `/admin` Dashboard (Phase 1, Stub)

```
  ┌─────────────────────────────────────────────────────────────┐
  │  0nefinity admin                          [logout]          │
  ├─────────────────────────────────────────────────────────────┤
  │                                                             │
  │  Welcome, Tim                                               │
  │                                                             │
  │  ┌─────────────────┐  ┌─────────────────┐                  │
  │  │ Analytics       │  │ Users           │  ← Stub-Cards     │
  │  │ (coming soon)   │  │ (coming soon)   │     Phase 2       │
  │  └─────────────────┘  └─────────────────┘                  │
  │                                                             │
  │  ┌─────────────────┐                                       │
  │  │ Settings        │                                       │
  │  │ (coming soon)   │                                       │
  │  └─────────────────┘                                       │
  │                                                             │
  └─────────────────────────────────────────────────────────────┘
```

---

## 7. Security-Checkliste

| Item | Phase 1 | Mechanismus |
|---|---|---|
| HTTPS only | ✅ | nginx + Certbot, schon aktiv |
| HSTS | ✅ | Schon gesetzt (`max-age=63072000`) |
| Cookie HttpOnly | ✅ | `session.cookie_httponly = 1` |
| Cookie Secure | ✅ | `session.cookie_secure = 1` (HTTPS-only) |
| Cookie SameSite=Strict | ✅ | `session.cookie_samesite = 'Strict'` |
| Cookie Lifetime 14 Tage | ✅ | `session.gc_maxlifetime = 1209600`, Cookie `expires = now+14d` |
| Session-ID-Regenerate | ✅ | `session_regenerate_id(true)` nach Login |
| CSRF-Token (Double-Submit) | ✅ | Token in Session + Hidden-Input, Vergleich bei jedem POST |
| Argon2id PW-Hash (OWASP 2024+) | ✅ | `password_hash` mit `memory_cost=65536, time_cost=4, threads=1` |
| Min PW-Länge 12 Zeichen | ✅ | NIST 800-63B-3, Server-side check |
| Keine erzwungene PW-Komplexität | ✅ | NIST: Komplexitätsregeln sind nachweislich schädlich |
| HIBP-Check via k-anonymity | ✅ | SHA1-Prefix-Lookup auf `api.pwnedpasswords.com/range/<5hex>` beim Setzen |
| Constant-Time-Compare | ✅ | `password_verify()` intern; bei User-Not-Found Dummy-Hash verifizieren |
| Rate-Limit Login | ✅ | 5 Fails/IP/min → 429; exponential backoff (1s, 2s, 4s, 8s …) bei wiederholten Fails |
| Generic Error-Message | ✅ | "Falsche Logindaten" — verraten nicht ob User existiert |
| `.auth/` nicht webserv. | ✅ | `.htaccess` `Require all denied` + globale `RewriteRule ^\.auth(/|$) - [F,L]` |
| CSP-Header report-only | ✅ Decision 6 | nginx `add_header Content-Security-Policy-Report-Only "…"` — loggt Violations, blockt nicht |
| 2FA | ❌ Phase 2 | Passkeys (WebAuthn) bevorzugt; TOTP als Fallback |
| Audit-Log | ✅ Phase 1 (basic) | `login_attempts`-Tabelle loggt success/fail mit IP+ts |

### Headers in nginx ergänzen (Phase 1)
```nginx
# in /etc/nginx/sites-enabled/0nefinity-live, server-block
add_header X-Frame-Options "SAMEORIGIN" always;           # schon da
add_header X-Content-Type-Options "nosniff" always;       # schon da
add_header Referrer-Policy "strict-origin-when-cross-origin" always;  # schon da
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;

# CSP report-only (Phase 1) — Violations werden geloggt, nicht geblockt.
# Phase 2: zu enforce schärfen sobald inline-scripts inventarisiert + auf nonce/hash umgestellt sind.
add_header Content-Security-Policy-Report-Only "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; report-uri /api/csp-report" always;
```

**Hinweis Phase 2:** CSP-Enforce erfordert dass alle inline-`<script>` und inline-`<style>` Tags auf 0nefinity entweder Nonces tragen oder externalisiert sind. Vorher report-only laufen lassen und Logs auswerten.

---

## 8. Deploy-Konfiguration

### Dateien-Layout

```
/home/timbr/0nefinity/0nefinity.love/
├── enternity.php                  ← GET /enternity → HTML
├── admin/
│   └── index.php                  ← /admin Dashboard
├── api/
│   └── auth/
│       ├── login.php              ← POST
│       ├── logout.php             ← POST
│       └── me.php                 ← GET
├── .auth/                         ← server-only, .htaccess Deny
│   ├── .htaccess                  ← Require all denied
│   ├── auth.sqlite                ← SQLite DB
│   └── bootstrap.php              ← lib: session-init, db, helpers
└── tools/
    └── auth-cli.php               ← CLI: User anlegen / PW setzen
```

### `.htaccess`-Anpassungen (additiv zur bestehenden)

Im Root `.htaccess` **vor** den existierenden Regeln einfügen:

```apache
# /.auth/ niemals ausliefern
RewriteRule "^\.auth(/|$)" - [F,L]

# Pretty routes (vor dem catch-all-rewrite)
RewriteRule ^enternity/?$ /enternity.php [L,QSA]
RewriteRule ^admin/?$ /admin/index.php [L,QSA]
RewriteRule ^admin/(.+)$ /admin/$1 [L,QSA]
RewriteRule ^api/auth/login/?$ /api/auth/login.php [L,QSA]
RewriteRule ^api/auth/logout/?$ /api/auth/logout.php [L,QSA]
RewriteRule ^api/auth/me/?$ /api/auth/me.php [L,QSA]
```

**Achtung:** Die existierende Regel `RewriteRule ^([^/]+)/?$ /tools/color.php?c=$1` ist ein **catch-all** für single-segment URLs ohne Datei-Endung. Wir müssen `enternity` und `admin` **davor** routen, sonst landet `/enternity` in `color.php`.

Außerdem: bestehende Regel `RewriteRule ^(.+)\.html$ https://%{HTTP_HOST}/$1 [R=302,L,QSA]` strippt `.html` → unsere `.php`-Files sind nicht betroffen.

### Container-Neustart

- Volume `:ro` für live-Container: PHP-Files werden nur gelesen → ok
- `auth.sqlite` muss **schreibbar** sein → entweder:
  - Option (a): Volume teil-rewriten (`:rw` für `.auth/`-Unterordner)
  - Option (b): SQLite außerhalb des `:ro`-Mounts in einen separaten Volume
  - **Empfehlung (b):** in `docker-compose.yml` zusätzliches Named Volume `0nefinity-auth` mit Mount `/var/www/html/.auth` (rw)

```yaml
# docker-compose.yml addition
services:
  live:
    volumes:
      - ./0nefinity.love:/var/www/html:ro
      - 0nefinity-auth:/var/www/html/.auth   # NEW
volumes:
  0nefinity-auth:
```

Damit bleibt `0nefinity.love/` weiterhin read-only-Mount für Git-Konsistenz, aber `.auth/` ist ein separates Docker-Volume mit Write-Zugriff.

### nginx-Config
**Keine Änderung nötig.** nginx proxied schon alles an Apache:18 — die `.htaccess`-Routing im Container übernimmt das Splitting.

### Backup
- `auth.sqlite` ist in Docker-Named-Volume `0nefinity-auth`
- restic/borg Path ergänzen: `/var/lib/docker/volumes/0nefinity_0nefinity-auth/_data/`
- ODER simpler: tägliches `docker exec 0nefinity-live sqlite3 /var/www/html/.auth/auth.sqlite '.dump' > /backup/auth.sql`

### Setup-Token-Flow (initialer PW-Set über die Web-UI)

**Ablauf:**
1. Container-Entrypoint prüft beim Start: existiert `/var/www/html/.auth/auth.sqlite` und ist `users`-Tabelle leer?
2. Falls ja: generiere `/var/www/html/.auth/setup-token` mit 32-Byte-Random (hex-encoded, 64 Zeichen) → `chmod 600`, owner `www-data`
3. Falls schon User vorhanden: setup-token-Datei wird sicher gelöscht falls noch da
4. Tim liest das Token: `docker exec 0nefinity-live cat /app/.auth/setup-token`
5. Tim öffnet `/enternity`. Setup-Modus aktiv wenn:
   - `users`-Tabelle leer **UND**
   - `setup-token`-File existiert
6. UI in Setup-Modus: zeigt "Setup" mit Token-Input + Username-Display (`0nefinity` fest) + neues-PW-Feld + PW-Bestätigung
7. POST `/api/auth/setup`:
   - Token-Vergleich (constant-time via `hash_equals`)
   - PW-Validation: `strlen >= 12`, HIBP-Check
   - User anlegen (`username='0nefinity'`, `password_hash` mit Argon2id-Params)
   - Setup-Token-Datei **löschen** (`unlink`)
   - Session starten, Redirect `/admin`

**Sicherheit:**
- Token nur einmal nutzbar (Datei wird nach Setup gelöscht)
- Token nur lokal lesbar (`chmod 600`), kein Web-Access (`.auth/` ist via `.htaccess` deny)
- Token wird **nie** geloggt
- Falls Tim das Token nicht hat: `docker exec` reicht (Host-Zugriff)
- Falls Token kompromittiert vor Setup: `docker exec 0nefinity-live rm /app/.auth/setup-token` + Container restart erzeugt neuen Token

### CLI-Tool für PW-Reset + Invite-Tokens (Phase 1: nur Reset)

```bash
# PW-Reset (Phase 1 ist das der einzige Reset-Weg, Decision 5):
docker exec -it 0nefinity-live php /var/www/html/tools/auth-cli.php set-password 0nefinity
# prompted für neues PW (verstecktes input), HIBP-Check, hasht mit Argon2id-Params, UPDATE SQLite

# User-Liste (debug/audit):
docker exec 0nefinity-live php /var/www/html/tools/auth-cli.php list-users

# Phase 2: Invite-Token generieren (jetzt Stub, später aktiv):
docker exec 0nefinity-live php /var/www/html/tools/auth-cli.php create-invite --email foo@bar
# → gibt URL aus: https://0nefinity.love/enternity?invite=<token>
```

Das CLI-Tool ist nicht web-exposed (liegt in `tools/`, ist `.php`, aber wird nur via `docker exec` aufgerufen — extra-safe: bei web-access `php_sapi_name() === 'cli'` check, sonst exit).

---

## 9. Implementierungs-Sequenz (Detailliert: siehe Plan-Dokument)

Der detaillierte Plan liegt unter `docs/plans/2026-05-12-enternity-login-plan.md`. Hier nur grobe Reihenfolge:

1. **DB + Bootstrap** — Schema, PDO-Wrapper, Session-Config, CSRF-Helpers
2. **HIBP-Lib** — k-anonymity-Check
3. **CLI-Tool** — `set-password`, `list-users`, `create-invite` (Stub)
4. **Container-Entrypoint** — Setup-Token-Generation beim Start
5. **`.htaccess`-Routing** — `/enternity`, `/admin`, `/api/auth/*`, `.auth/` deny
6. **docker-compose.yml** — Named Volume `0nefinity-auth` für `.auth/` rw-Mount
7. **`/enternity` UI** — Form + Setup-Modus + eye-toggle
8. **Setup-Endpoint** — `/api/auth/setup` (Token-Verify, HIBP, User-Create)
9. **Login-Endpoint** — Rate-Limit + Exponential-Backoff + CSRF + Argon2id-Verify
10. **Session-Guard + `/admin`** — Stub-Dashboard
11. **Logout + `/api/auth/me`**
12. **CSP-Report-only Header** + Report-Endpoint
13. **Smoke-Tests** (curl) + Browser-Walkthrough
14. **Deploy** — direkt auf main (Spec laut Memory ist Docs, Code via Feature-Branch + PR)

---

## 10. Decisions (final)

Diese Sektion ersetzt die ursprünglichen Open Questions. Tim's Antworten vom 2026-05-12:

1. **Username:** **fest `0nefinity`** — kein Free-Choice. Schema bleibt `TEXT UNIQUE` für Phase-2-Mehrbenutzer-Kompatibilität, aber im Setup-Flow hartcodiert.

2. **Initiales PW-Setup:** **Setup-Token-Flow** (nicht CLI-Prompt). Container generiert beim ersten Start ein 32-Byte-Random-Token in `/app/.auth/setup-token` (chmod 600). Tim liest es per `docker exec 0nefinity-live cat /app/.auth/setup-token`, öffnet `/enternity`, gibt Token statt PW ein, legt dann echtes PW fest. Token wird nach erfolgreichem Setup gelöscht. Setup-Modus erkennbar an: `users`-Tabelle leer **UND** `setup-token`-File existiert. Details siehe Abschnitt 8 "Setup-Token-Flow".

3. **Phase-2-Registrierung:** **Invite-Link** — Tim generiert Tokens via CLI (`auth-cli.php create-invite`). Keine offene Registrierung (Spam-Vermeidung).

4. **Email-Pflicht:** Phase 1 **optional** (NULL erlaubt), Phase 2 **pflicht** für Passkey-Recovery.

5. **Forgot-PW Phase 1:** **weggelassen** — nur CLI-Reset via `auth-cli.php set-password 0nefinity`.

6. **CSP-Header:** Phase 1 als **`Content-Security-Policy-Report-Only`** mit `report-uri /api/csp-report` → Violations loggen ohne zu blocken. Phase 2 zu `enforce` schärfen sobald inline-scripts auf Nonce/Hash umgestellt sind.

7. **2FA Phase 2:** **WebAuthn/Passkeys** bevorzugt (passwordless, biometrisch), Lib-Empfehlung `web-auth/webauthn-lib`. TOTP nur als Fallback.

8. **Umami-Embed im Admin:** Phase-2-Detail, hier noch offen.

### Neue Decisions (2026 PW-Standards)

9. **Password-Hash-Algorithmus:** Argon2id mit OWASP-2024+-Parametern (`memory_cost=65536, time_cost=4, threads=1`).

10. **Password-Policy:** NIST 800-63B-3 — min 12 Zeichen, keine erzwungene Komplexität.

11. **HIBP-Check:** Pflicht beim Setzen eines neuen PWs (Setup + CLI-Reset). k-anonymity API, nur 5-Hex-Prefix verlässt Server.

12. **Session-Lifetime:** 14 Tage (war 30 Tage idle).

13. **Rate-Limit-Strategie:** 5 Fails/IP/min + exponential backoff (1s, 2s, 4s, 8s …) bei wiederholten Fails statt fixer 1h-Sperre.

---

## 11. Aufwand-Schätzung Phase 1

Aktualisiert nach Decisions (Setup-Token-Flow + HIBP-Check + CSP-Report-only):

| Block | Stunden |
|---|---|
| DB-Schema + bootstrap.php + CSRF-Helpers | 1.0 |
| Setup-Token-Generation in Container-Entrypoint | 0.4 |
| HIBP-Check-Lib (k-anonymity, ~30 Zeilen + Tests) | 0.4 |
| CLI-Tool (set-password, list-users, invite-stub) | 0.6 |
| `/enternity` HTML + CSS + eye-toggle + Setup-Modus-UI | 1.3 |
| Setup-Endpoint (`/api/auth/setup`) | 0.5 |
| Login-Endpoint + Rate-Limit + Exponential-Backoff + Tests | 1.7 |
| Logout + `/api/auth/me` | 0.3 |
| `/admin` Stub + Auth-Guard | 0.7 |
| CSP-Report-only Header + Report-Endpoint Stub | 0.4 |
| `.htaccess` + docker-compose-Volume + Deploy | 0.5 |
| Mobile + Dark-Mode-Polish | 0.5 |
| End-to-end-Test (Setup, Login, Logout, Brute-Force, CSRF, HIBP) | 1.2 |
| **Total** | **~9.5h** |

Realistisch: **1–1.5 Arbeitstage** für Phase 1 inkl. Test+Deploy. Aufwand-Plus gegenüber Initial-Schätzung (~7h) durch Setup-Token-Flow, HIBP-Check und CSP-Reporting.

---

## 12. Referenzen / Quellen

- OWASP Password Storage Cheat Sheet (2023): Argon2id empfohlen
- PHP-Doku: `password_hash()`, `password_verify()`, `session_*`
- 0nefinity bestehende Struktur: `~/0nefinity/0nefinity.love/CLAUDE.md`, `~/0nefinity/0nefinity.love/.htaccess`
- Memory: `reference_0nefinity_dev_workflow.md` (Dev-Worktree git-broken, Live = main-Volume `:ro`)
