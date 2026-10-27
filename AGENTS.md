# Mitarbeiten an 0nefinity

Hinweise für alle, die an diesem Repo mitarbeiten, Menschen wie KI-Agenten (Claude, Codex, Gemini, …).
`CLAUDE.md` verweist nur hierher.

## Was das ist

**0nefinity** (kurz **018**) ist ein kreativ-philosophisch-mathematisches Kunstprojekt rund um die nicht-duale Identität **0 ≡ 1 ≡ ∞**.
Keine klassische App, sondern eine Sammlung interaktiver HTML-Experimente, Visualisierungen und philosophischer Texte.
Kein Build-System, kein npm, kein package.json. Live: https://0nefinity.love, Vorschau: https://dev.0nefinity.love

Mit dem Projektinhaber wird **auf Deutsch** kommuniziert.

## Laufen lassen

- Die Seiten laufen auf Apache 2.4 mit PHP 8.3. `.htaccess` regelt Rewrites, Clean URLs, SSI, PHP-Routing und Sicherheit.
- Lokal reicht ein Apache/PHP mit `mod_rewrite` und `mod_include` (SSI), der das Repo als Document Root ausliefert. Viele Seiten funktionieren auch als einfache statische Dateien.
- Alles wird selbst gehostet: keine externen Fonts, CDNs, Skripte oder Tracker (`Content-Security-Policy: default-src 'self'`). Bibliotheken liegen unter `tools/vendor/` und `tools/tools/`.

## Architektur

Flache Sammlung selbst-enthaltener HTML-Seiten. Die gemeinsame Infrastruktur:

| Datei | Rolle |
|-------|-------|
| `meta.css` | Globales Theme, CSS-Variablen (`--bg-color`, `--text-color` etc.), Menü-Styling. Nutzt `!important` bewusst. **Immer für Farben konsultieren.** |
| `meta.js` | Nur was echtes JS braucht: Menü-Verhalten (`.open` auf `.menu`, `body.menu-open`), Menüsuche (flache Trefferliste, tippfehlertolerant, darunter Volltext "im Inhalt" aus `includes/search-index.json`, das `tools/generate-menu.py` zusammen mit dem Menü schreibt; Test: `tests/menu-search/run.js`), Viewport-Sync, `<pre>`-Fitting. Menü-Markup, Back-Button und Fonts kommen aus den SSI-Includes in `includes/`. `window._018Dialog` kommt aus `tools/dialog.js`, `_018Space` steht nur inline in `heart.html` |
| `tools/math-notation.js` | `pi(n)`/`e(n)`-Ersetzung und π/∞-Vorschläge in Eingabefeldern. Nur dort per `<script defer>`, wo Eingabefelder sind |
| `tools/dialog.js` | Dialog (baut sein Markup selbst), nur `bibelaufdenpunkt.html` und `bibelaufdenpunkt copy 3.html` |
| `tools/live-reload.js` | Live-Reload nur auf `dev.*` (Poll auf `/_devmtime.php`); meldet Ausfall per `console.error` |
| `tools/editor.js` | Login-Editor (nur mit Login über `/enternity`): Texte inline bearbeiten und speichern. Das Backend dahinter (`/api/edit/`) ist ein eigener Dienst und nicht Teil dieses Repos |
| `tools/controls.js` | Das Standard-Ding zur Eingabe von Anpassungen (Slider, Inputs, Zoom: alles, was Nutzer tun, um mit den Tools und Spielereien zu interagieren und ihre eigene Unendlichkeit zu erfahren und zu erforschen). Voreinstellungen je Seite stehen als `<script type="application/json" id="control-defaults">` im Head. Vorrang URL > Voreinstellung > Code-Wert; der Reset-Knopf führt zur Voreinstellung, `panel.defaultOf(key)` |
| `tools/zoom.js` | Zoom und Skalierung für Canvas-Seiten |
| `0nefinity.js` | Mathematische Konstanten und Manifestationen der 0nefinity-Theorie |
| `tools/tools/decimal.js` | Bibliothek für beliebig genaue Dezimalzahlen |
| `tools/tools/pixi.js` | PixiJS (WebGL-Rendering) für grafikintensive Seiten |

**Favicon:** genau eine Datei, `/favicon.ico` im Wurzelverzeichnis (weißer Punkt). Das Head-Include verlinkt nur sie, Seiten bekommen keine eigenen Icon-Tags, `.htaccess` leitet alte Icon-Pfade auf sie um.
Ausnahmen: `why-coordinatesystem-is-chicken.html` behält ihr Huhn-Icon (`profilbilder/favicon/chicken/`); auf `018.html` (Marker `<html data-favicon="rotating">`) ersetzt `meta.js` das Icon per Canvas durch das rotierende 0 1 ∞ (Tempo wie das Symbol der Startseite, `AUTO_SPEED_CONFIG` in `0nefinity.js`; Test mit `?favfps=<1-120>`, `?favspeed=<Faktor>`, `?favmode=ruhig`; aus bei `prefers-reduced-motion`).

**Einstiegspunkte:** `index.html` (Manifest + Navigation), `README.html` (Doku)
**Archiv:** `00_Archiv/`, nur zum Nachschlagen, nicht anfassen

## Git-Workflow

- Entwicklung auf `claude-dev` (Vorschau dev.0nefinity.love), stabile Stände auf `main` (0nefinity.love).
- Änderungen per Pull Request. Merge nach `main` nur, wenn stabil und getestet.
- Commit-Messages formlos, Deutsch oder Deutsch/Englisch gemischt (z. B. `"zwischenspeichern"`, `"018 ascii animation, yeah"`).
- Pre-commit-Hook: `git config core.hooksPath tools/git-hooks` (baut Menü und Suchindex neu, prüft Autofill).

## Coding-Regeln

- **Controls:** Immer `0` als gültigen Eingabewert erlauben, Ranges so unbegrenzt wie möglich (→ ∞). Keine künstlichen Obergrenzen.
- **Eingabefelder:** Jedes Text-Feld (`input`/`textarea`) außer dem Login bekommt `autocomplete="off"` plus `data-1p-ignore data-lpignore data-bwignore data-form-type="other"`, sonst bieten Browser Passwort- und Login-Vorschläge an; `meta.js` setzt das per Wächter auf alles, was Skripte erzeugen. Kein `type=password` außer im Login. Prüfen: `python3 tests/autofill/static-check.py` (läuft im pre-commit) und `node tests/autofill/run.js <baseUrl> [--local <repo>]` (Playwright; Pfade per `PLAYWRIGHT_PATH`, `CHROME_PATH`).
- **Styling:** Farben ausschließlich über `meta.css`-Variablen. `meta.js`, `controls.js` und `zoom.js` für Standard-Interaktionen nutzen, nicht neu erfinden.
- **Performance:** Muss auch auf alter Hardware ("Gurke") flüssig laufen. Rechenintensives in Web Worker auslagern (`tools/workers/`).
- **Dateinamen:** Auf Deutsch, beschreibend, Leerzeichen und Emojis sind erlaubt und gewollt.
- **Same-origin:** keine externen Ressourcen einbinden (siehe oben).

## Was ins Repo gehört

Das Repo ist öffentlich, wie ein Buch. Hinein kommt nur, was auf der Seite zu sehen sein soll, plus der Code, der sie trägt.
Nicht hinein: Arbeitsdateien (Specs, Pläne, Reviews, Entwürfe, Mockups, Sicherungskopien), Editor- und Agenten-Konfiguration,
Logs, Zugangsdaten, Server-Adressen und -Pfade. Solche Dateien liegen außerhalb des Repos; `.gitignore` schließt die üblichen aus.

## Philosophische Konventionen

Deutsch-Englisch-Mix, unkonventionelle Interpunktion und metaphorische Variablennamen sind Absicht, keine Fehler. Die "Unvollkommenheiten" gehören zur Ästhetik des Projekts.
