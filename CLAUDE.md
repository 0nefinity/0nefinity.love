# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Kommunikation

Mit dem User **auf Deutsch** kommunizieren.

## Projektübersicht

**0nefinity** ist ein kreativ-philosophisch-mathematisches Kunstprojekt rund um die nicht-duale Identität **0 ≡ 1 ≡ ∞**. Keine klassische App — eine Sammlung interaktiver HTML-Experimente, Visualisierungen und philosophischer Texte. Kein Build-System, kein npm, kein package.json.

## Entwicklungsumgebung

### Infrastruktur

Alles läuft im **LXD-Container `0nefinity`** auf dem Host-Server. Ein Git-Repo, zwei Worktrees:

| Pfad (im Container) | Branch | Domain | Zweck |
|---|---|---|---|
| `/var/www/0nefinity.love/` | `main` | `0nefinity.love` | Stabile Live-Seite |
| `/var/www/0nefinity-dev/` | `claude-dev` | `dev.0nefinity.love` | Entwicklung |

- `/var/www/0nefinity-dev/` ist ein Git-Worktree von `/var/www/0nefinity.love/`
- Remote: `git@github.com:0nefinity/0nefinity.love.git`

### Webserver

- **Apache 2.4** mit PHP 8.3 im Container
- Port **18** → `0nefinity.love` (main)
- Port **129** → `dev.0nefinity.love` (claude-dev)
- **nginx** auf dem Host proxied HTTPS → Container-Ports
- Dateien bearbeiten → sofort live (kein Build nötig)

### Verfügbare Tools im Container

- PHP 8.3 (`php`)
- Python 3.12 (`python3`)
- Kein Node.js

### Container-Zugriff vom Host

```bash
lxc exec 0nefinity -- bash                    # Shell im Container
lxc exec 0nefinity -- git -C /var/www/0nefinity-dev/ status   # Git-Befehle
```

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
