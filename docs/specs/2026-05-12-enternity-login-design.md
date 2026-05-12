# Design-Spec: /enternity Login + /admin Dashboard

**Datum:** 2026-05-12
**Status:** Draft — Phase 1 (single user) als nächstes umsetzbar
**Scope:** Authentifizierung für `0nefinity.love`, schützt `/admin`-Pfad. Restliche Site bleibt öffentlich.

---

## 1. Übersicht

### Ziel
Tim braucht einen geschützten `/admin`-Bereich auf `0nefinity.love` für Site-Analytics (Umami-Embed) und später User-Verwaltung. Login läuft über `/enternity` (Wortspiel "enter eternity / enter 0nefinity").

### Phasen-Roadmap

**Phase 1 (jetzt):**
- Single User: nur Tim als Admin
- `/enternity` Login-Form, `/admin` Dashboard-Stub
- PW initial via CLI-Script gesetzt
- Keine Email, kein Passwort-Reset
- Logout funktioniert
- Rate-Limiting gegen Brute-Force

**Phase 2 (später, nicht Teil dieser Spec):**
- Mehrere User: Registrierung via Invite-Link oder offen
- Email-Adresse pro User
- Passwort-Reset via Email
- Rollen (admin vs. user)
- Umami-Analytics ins Admin eingebettet
- Optional: 2FA (TOTP)

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
| Password-Hashing | Argon2id (`password_hash($pw, PASSWORD_ARGON2ID)`) | Argon2id ist 2026er State-of-the-Art, gewinnt Password-Hashing-Competition (2015), Memory-hard → ASIC/GPU-resistent. Bcrypt wäre auch ok, aber Argon2id ist seit PHP 7.3 nativ und bleibt erste Wahl. |
| Session-Mechanismus | PHP-Session-Cookie (`PHPSESSID`) | HttpOnly+Secure+SameSite=Strict. Server-side Session-Data in `/var/lib/php/sessions` oder eigenem Pfad. **Kein JWT** — JWT lohnt sich erst bei verteilten Services. |
| Rate-Limiting | Apache `mod_evasive` ODER selbst in PHP via SQLite-Tabelle `login_attempts(ip, ts)` | Eigenbau ist 30 Zeilen, voll kontrollierbar |
| CSRF | SameSite=Strict + Double-Submit-Token im Form | SameSite=Strict allein reicht für Phase 1; Token als Defense-in-depth |

### Warum Argon2id statt bcrypt (für Tim)
- Bcrypt (1999) ist CPU-hart aber leicht parallelisierbar auf GPUs/ASICs
- Argon2id (2015) ist zusätzlich **Memory-hart** → Angreifer braucht viel RAM pro Versuch, das verteuert Brute-Force massiv
- Beide sind sicher. Argon2id ist die moderne Empfehlung (OWASP 2023+)
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
| Cookie HttpOnly | ✅ | `session.cookie_httponly = 1` (php.ini oder `ini_set` vor `session_start`) |
| Cookie Secure | ✅ | `session.cookie_secure = 1` (HTTPS-only) |
| Cookie SameSite=Strict | ✅ | `session.cookie_samesite = 'Strict'` |
| Session-ID-Regenerate | ✅ | `session_regenerate_id(true)` nach Login |
| CSRF-Token | ✅ | Double-Submit: Token in Session + Hidden-Input, Vergleich bei POST |
| Argon2id PW-Hash | ✅ | `password_hash($pw, PASSWORD_ARGON2ID)` |
| Constant-Time-Compare | ✅ | `password_verify()` macht das intern; bei User-Not-Found ein Dummy-Hash verifizieren (gegen Timing-Leak "user existiert?") |
| Rate-Limit Login | ✅ | 5 fails/IP/min → 429; nach 20 fails/IP/h → 1h Sperre |
| Generic Error-Message | ✅ | "Falsche Logindaten" — nicht verraten ob User existiert |
| `.auth/` nicht webserv. | ✅ | `.htaccess` in `.auth/` mit `Require all denied` + `RewriteRule . - [F,L]` global für `/.auth/` |
| CSP-Header | ⚠️ optional Phase 1 | nginx `add_header Content-Security-Policy "default-src 'self'; …"` — vorsicht inline-scripts auf 0nefinity (gibt's viele) |
| 2FA | ❌ Phase 2 | TOTP via `paragonie/otp` o.ä. |
| Audit-Log | ⚠️ teilweise | `login_attempts`-Tabelle loggt success/fail; reicht Phase 1 |

### Headers in nginx ergänzen (Phase 1)
```nginx
# in /etc/nginx/sites-enabled/0nefinity-live, server-block
add_header X-Frame-Options "SAMEORIGIN" always;           # schon da
add_header X-Content-Type-Options "nosniff" always;       # schon da
add_header Referrer-Policy "strict-origin-when-cross-origin" always;  # schon da
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
# CSP optional — wegen vieler inline-scripts auf 0nefinity-Seiten erstmal weglassen oder report-only
```

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

### CLI-Tool für initialen PW-Set
```bash
# als Tim auf dem Host:
docker exec -it 0nefinity-live php /var/www/html/tools/auth-cli.php create-user tim
# prompted für PW (verstecktes input), hasht mit Argon2id, INSERTs in SQLite
```

Das CLI-Tool ist nicht web-exposed (liegt in `tools/`, ist `.php`, aber wird nur via `docker exec` aufgerufen — extra-safe: bei web-access `php_sapi_name() === 'cli'` check, sonst exit).

---

## 9. Implementierungs-Sequenz (für späteren Plan)

1. **DB + Bootstrap** — `.auth/auth.sqlite` Schema, `.auth/bootstrap.php` lib (session-config, PDO, csrf-helpers)
2. **CLI-Tool** — `tools/auth-cli.php create-user`, `set-password`, `list-users`
3. **`/enternity` UI** — `enternity.php` mit Form, eye-toggle, error-slot
4. **Login-Endpoint** — `api/auth/login.php` mit Rate-Limit + CSRF + Argon2id-Verify
5. **Session-Guard + `/admin`** — `admin/index.php` mit auth-redirect-helper
6. **Logout + `/api/auth/me`**
7. **`.htaccess`-Routing** (gleichzeitig mit Schritt 3-5)
8. **docker-compose.yml** Volume-Update für `.auth/`
9. **Dev-Testing auf `dev.0nefinity.love`** — Worktree ist git-broken laut Memory, also: Files direkt in `0nefinity.love/` (main) erstellen, Branch `claude-dev` nutzen, dann mergen
10. **Deploy: Merge → main → Container restart für Volume-Pickup** (`docker compose down && docker compose up -d`)

---

## 10. Open Questions

1. **Username free choice oder festes "tim"?** — Spec lässt es offen (`users.username TEXT UNIQUE`). Tim entscheidet beim CLI-Setup.
2. **Initiales PW-Setup:** CLI-Skript `auth-cli.php create-user tim` mit interaktivem PW-Prompt (verstecktes Input). Alternative: `--password "…"` Flag (history-leak-Risiko in shell).
3. **Phase-2-Registrierung:** Invite-Link (Tim generiert Token, gibt URL raus) vs. offen mit Email-Verify. Offene Registrierung lädt zu Spam ein → Invite-Link empfohlen.
4. **Email-Pflicht:** Phase 1 nullable, Phase 2 pflicht (für Reset). Falls Tim auch Phase 2 ohne Email will → kein Reset, nur Admin-PW-Reset via CLI.
5. **Forgot Password Phase 1:** Weggelassen. Tim resettet via CLI (`auth-cli.php set-password tim`).
6. **CSP-Header:** Erstmal weggelassen wegen vieler inline-scripts auf 0nefinity-Seiten. Falls gewünscht, später `report-only` einführen und gradually tighten.
7. **2FA Phase 2:** TOTP via `paragonie/otphp` oder ähnlich, nicht jetzt.
8. **Umami-Embed im Admin:** Iframe oder API-Pull? API-Pull (mit Umami-API-Token) ist sauberer für Custom-Dashboard, Iframe schneller. Phase 2 entscheiden.

---

## 11. Aufwand-Schätzung Phase 1

| Block | Stunden |
|---|---|
| DB-Schema + bootstrap.php + CSRF-Helpers | 1.0 |
| CLI-Tool (create-user, set-password) | 0.5 |
| `/enternity` HTML + CSS + eye-toggle | 1.0 |
| Login-Endpoint + Rate-Limit + Tests | 1.5 |
| Logout + `/api/auth/me` | 0.3 |
| `/admin` Stub + Auth-Guard | 0.7 |
| `.htaccess` + docker-compose-Volume + Deploy | 0.5 |
| Mobile + Dark-Mode-Polish | 0.5 |
| End-to-end-Test (Login, Logout, Brute-Force, CSRF) | 1.0 |
| **Total** | **~7h** |

Realistisch: **1 Arbeitstag** für Phase 1 inkl. Test+Deploy.

---

## 12. Referenzen / Quellen

- OWASP Password Storage Cheat Sheet (2023): Argon2id empfohlen
- PHP-Doku: `password_hash()`, `password_verify()`, `session_*`
- 0nefinity bestehende Struktur: `~/0nefinity/0nefinity.love/CLAUDE.md`, `~/0nefinity/0nefinity.love/.htaccess`
- Memory: `reference_0nefinity_dev_workflow.md` (Dev-Worktree git-broken, Live = main-Volume `:ro`)
