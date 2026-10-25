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
| `meta.js` | Nur was echtes JS braucht: Menü-Verhalten (`.open` auf `.menu`, `body.menu-open`), Menüsuche (flache Trefferliste, Tippfehler-tolerant, darunter Volltext "im Inhalt" aus `includes/search-index.json`, das `tools/generate-menu.py` zusammen mit dem Menü schreibt; Test: tests/menu-search/run.js), Viewport-Sync, `<pre>`-Fitting. Menü-Markup, Back-Button und Fonts kommen aus den SSI-Includes in `includes/`. meta.js setzt kein globales Objekt mehr: `_018Math` und `_018Space` aus meta.js sind weg (`_018Space` steht nur noch inline in `heart.html`), `window._018Dialog` kommt aus `tools/dialog.js` |
| `tools/math-notation.js` | `pi(n)`/`e(n)`-Ersetzung und π/∞-Vorschläge in Eingabefeldern. Nur dort per `<script defer>`, wo Eingabefelder sind; die Menüsuche lädt sie nicht (sucht symbolunabhängig: π=pi, ∞=inf) |
| `tools/dialog.js` | Dialog (baut sein Markup selbst), nur `bibelaufdenpunkt.html` und `bibelaufdenpunkt copy 3.html` |
| `tools/live-reload.js` | Dev-only Live-Reload (Poll auf `/_devmtime.php`), vom Head-Include nur auf `dev.*` geladen; meldet Ausfall per `console.error` |
| `tools/controls.js` | Interaktive UI-Steuerelemente (Slider, Inputs, Zoom) |
| `tools/zoom.js` | Zoom und Skalierung für Canvas-Seiten |
| `0nefinity.js` | Mathematische Konstanten und Manifestationen der 0nefinity-Theorie |
| `tools/tools/decimal.js` | Bibliothek für beliebig genaue Dezimalzahlen |
| `tools/tools/pixi.js` | PixiJS (WebGL-Rendering) für grafikintensive Seiten |

**Favicon:** genau eine Datei, `/favicon.ico` im Wurzelverzeichnis (weisser Punkt); der Browser holt sie fuer jede Seite von selbst, auch PHP-, .md-Viewer- und Fehlerseiten. Das Head-Include verlinkt nur sie, Seiten bekommen keine eigenen Icon-Tags, und `.htaccess` leitet alte Icon-Pfade (`/favicon.png`, `/profilbilder/favicon/...`) auf sie um.
Einzige Ausnahme: `why-coordinatesystem-is-chicken.html` behaelt ihr eigenes Huhn-Icon (`profilbilder/favicon/chicken/`). Icon aendern = diese eine Datei ersetzen. Rotierendes Icon: nur auf `018.html` (die eigene Symbol-Seite, nur das 0 1 ∞ aus `0nefinity.js`; die Startseite laedt dasselbe Skript und behaelt das statische Icon). `meta.js` ersetzt dort, erkannt am Marker `<html data-favicon="rotating">`, den Icon-href per Canvas durch das rotierende 0 1 ∞ (Tempo wie das Symbol der Startseite: deren Auto-Speed-Stufen (`AUTO_SPEED_CONFIG` in `0nefinity.js`, °/Frame, auf virtuelle 60 Hz aus der Zeit umgerechnet), auf 018.html direkt deren Winkel (`window.__symbolAngle`); Test mit `?favfps=<1-120>` und `?favspeed=<Faktor auf das Seiten-Tempo, Standard 1>`, `?favmode=ruhig` = konstant 30°/s (mal favspeed) statt Seiten-Tempo; alles im Tab gemerkt; Frames liegen im 2°-Raster (180, Periode 360°: 0/1/∞ sind keine 120°-Symmetrie) lazy gecacht und in Leerlauf-Häppchen vorab gefüllt, `href` wird nur bei neuem Frame geschrieben; aus bei `prefers-reduced-motion`; `/favicon.ico` bleibt Fallback).

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

## Arbeitsdateien gehören nicht ins Repo

- Arbeitsdateien von Agenten (Specs, Pläne, Reviews, Testskripte, Entwürfe, Mockups, Kritzelseiten, Sicherungskopien) liegen in `/home/timbr/werkstatt/0nefinity/`, nie in diesem Repo.
- Skills, die standardmäßig nach `docs/...` schreiben (superpowers brainstorming, writing-plans u. a.), schreiben stattdessen dorthin, mit derselben Ordnerstruktur (`docs/specs/`, `docs/plans/`, `tests/`).
- Ins Repo kommt nur, was Tim auf der Seite sehen will. Ausnahme: `tests/menu-search/` bleibt vorerst hier.

## Philosophische Konventionen

Deutsch-Englisch-Mix, unkonventionelle Interpunktion und metaphorische Variablennamen sind Absicht, keine Fehler. Die "Unvollkommenheiten" gehören zur Ästhetik des Projekts.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **0nefinity.love** (3227 symbols, 5600 relationships, 268 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/0nefinity.love/context` | Codebase overview, check index freshness |
| `gitnexus://repo/0nefinity.love/clusters` | All functional areas |
| `gitnexus://repo/0nefinity.love/processes` | All execution flows |
| `gitnexus://repo/0nefinity.love/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
