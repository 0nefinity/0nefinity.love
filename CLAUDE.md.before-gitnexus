# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Kommunikation

Mit dem User **auf Deutsch** kommunizieren.

## Projektübersicht

**0nefinity** ist ein kreativ-philosophisch-mathematisches Kunstprojekt rund um die nicht-duale Identität **0 ≡ 1 ≡ ∞**. Keine klassische App — eine Sammlung interaktiver HTML-Experimente, Visualisierungen und philosophischer Texte. Kein Build-System, kein npm, kein package.json.

## Entwicklungsumgebung

### Infrastruktur

Ein Git-Repo, zwei Worktrees, zwei Docker-Container auf dem Host-Server:

| Pfad (Host) | Branch | Domain | Docker-Container |
|---|---|---|---|
| `/home/timbr/0nefinity/0nefinity.love/` | `main` | `0nefinity.love` | `0nefinity-live` (Volume `:ro`) |
| `/home/timbr/0nefinity/dev.0nefinity.love/0nefinity-dev/` | `claude-dev` | `dev.0nefinity.love` | `0nefinity-dev` |

- Git-Repo: `/home/timbr/0nefinity/0nefinity.love/.git`
- Remote: `git@github.com:0nefinity/0nefinity.love.git`
- Dev-Worktree zeigt auf `claude-dev` Branch

### Webserver

- **nginx** auf dem Host terminiert TLS (Let's Encrypt) und proxied:
  - `0nefinity.love` → `127.0.0.1:18`
  - `dev.0nefinity.love` → `127.0.0.1:129`
- **Apache 2.4 + PHP 8.3** in Docker-Containern (ein Image, zwei Container)
- `.htaccess` regelt Rewrites, Clean URLs, SSI, PHP-Routing, Sicherheit
- Dateien bearbeiten → sofort live (Volumes, kein Build nötig)

### Docker-Setup

```bash
# Dateien unter /home/timbr/0nefinity/
#   Dockerfile, docker-compose.yml, reverse-proxy.conf

docker compose up -d              # Container starten
docker compose build && docker compose up -d   # Image neu bauen + starten
docker compose logs -f live       # Logs live-Container
docker compose logs -f dev        # Logs dev-Container
```

### Verfügbare Tools

- PHP 8.3 (im Container)
- Python 3.12 (auf dem Host)

## Architektur

Flache Sammlung selbst-enthaltener HTML-Seiten. Die gemeinsame Infrastruktur:

| Datei | Rolle |
|-------|-------|
| `meta.css` | Globales Theme, CSS-Variablen (`--bg-color`, `--text-color` etc.), Menü-Styling. Nutzt `!important` bewusst. **Immer für Farben konsultieren.** |
| `meta.js` | Globales UI-Framework, `_018Space`-Objekt, Menü-Verhalten |
| `tools/controls.js` | Interaktive UI-Steuerelemente (Slider, Inputs, Zoom) |
| `tools/zoom.js` | Zoom und Skalierung für Canvas-Seiten |
| `0nefinity.js` | Mathematische Konstanten und Manifestationen der 0nefinity-Theorie |
| `tools/tools/decimal.js` | Bibliothek für beliebig genaue Dezimalzahlen |
| `tools/tools/pixi.js` | PixiJS (WebGL-Rendering) für grafikintensive Seiten |

**Einstiegspunkte:** `index.html` (Manifest + Navigation), `README.html` (Doku)
**Archiv:** `00_Archiv/` — nur zum Nachschlagen, nicht anfassen

## Git-Workflow

- Entwicklung auf `claude-dev`, stabile Releases auf `main`
- Dev-Arbeit regelmäßig committen und pushen
- Merge nach `main` nur wenn stabil und getestet
- Commit-Messages: Formlos, Deutsch oder Deutsch/Englisch gemischt (z.B. `"zwischenspeichern"`, `"018 ascii animation, yeah"`)

## Coding-Regeln

- **Controls:** Immer `0` als gültigen Eingabewert erlauben, Ranges so unbegrenzt wie möglich (→ ∞). Keine künstlichen Obergrenzen.
- **Styling:** Farben ausschließlich über `meta.css`-Variablen setzen. `meta.js`, `controls.js` und `zoom.js` für Standard-Interaktionen nutzen — nicht neu erfinden.
- **Performance:** Muss auch auf alter Hardware ("Gurke") flüssig laufen. Rechenintensive Aufgaben in Web Worker auslagern (`tools/workers/`).
- **Dateinamen:** Auf Deutsch, beschreibend, Leerzeichen und Emojis sind erlaubt und gewollt.

## Philosophische Konventionen

Deutsch-Englisch-Mix, unkonventionelle Interpunktion und metaphorische Variablennamen sind Absicht, keine Fehler. Die "Unvollkommenheiten" gehören zur Ästhetik des Projekts.
