# No-JS Menu Rollout (dev-wide) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the JS-built navigation (`meta.js`) with the static SSI-include menu (`meta-static.js` + `/includes/*`) across all dev pages, so core navigation works entirely without JavaScript — including the disabled-search loupe→⊘ gimmick.

**Architecture:** Each page drops `<script src="/meta.js">` + `<link href="/meta.css">` and instead pulls two SSI includes: `something-in-the-head.html` (CSS, fonts, tools, `meta-static.js`) and `something-in-the-body.html` (static `<nav>` + dialog markup). Menu HTML is pre-rendered by a fixed `generate-menu.py`. `meta-static.js` gets feature-parity (port math-notation + dev-live-reload) so no converted page loses behavior.

**Tech Stack:** Static HTML, Apache SSI (`mod_include`, already enabled), Python 3 (menu generator), vanilla JS (`meta-static.js`), Playwright (verification). No build system, no npm.

## Global Constraints

- Branch: `claude-dev`. Dev serves files directly via Docker volume — every save is instantly live at `https://dev.0nefinity.love`.
- Same-origin only: no external fonts/CDN/trackers (CSP enforced). Verify nothing reintroduces external loads.
- Colors only via `meta.css` variables. Do not touch `meta.css` color logic.
- Do NOT touch `00_Archiv/`.
- `meta.js` stays in the repo until ALL pages are converted (it's still load-bearing for any unconverted page). Delete only in the final task once zero pages reference it.
- Commit style: informal, English or DE/EN mix is fine.
- Clean URLs must stay stable (`/foo` ↔ `foo.html`). Never rename `.html` files.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `tools/generate-menu.py` | Build static menu HTML from file tree | **Modify** — exclude font/build/asset dirs |
| `includes/something-in-the-body.html` | Static `<nav>` + dialog markup | **Regenerate** (output of generator) |
| `meta-static.js` | No-JS-page JS framework (working name) | **Modify** — add math-notation + dev-live-reload; **rename → `meta.js`** in final task |
| `~93 *.html` pages | Content pages | **Modify** — swap meta.js for SSI includes |
| `includes/something-in-the-head.html` | Head include (CSS/fonts/tools/framework) | **Modify** in final task — repoint script to `/meta.js` |
| `tools/git-hooks/pre-commit` | Auto-regen menu on commit | **Create** — sync automation |
| `meta.js` (old) | Old JS-menu framework | **Delete** in final task, then new framework takes this name |

---

## Task 1: Fix the menu generator to exclude fonts/build/assets

**Why:** The local font pack (~16k woff2) and asset trees blew the generator up to 16,912 entries / 3.1 MB. We want the curated mix (~326: html + .md/.txt/.json/.png experiments) WITHOUT fonts and build cruft.

**Files:**
- Modify: `tools/generate-menu.py` (EXCLUDE_DIRS around line 14)
- Output: `includes/something-in-the-body.html`

**Interfaces:**
- Produces: a regenerated `something-in-the-body.html` with `<nav id="meta-nav">`, `<ul id="file-list">`, `.menu-search` (disabled input + `.menu-loupe`/`.menu-loupe-handle`), dialog markup. Consumed by `meta-static.js`.

- [ ] **Step 1: Record the baseline (the curated reference)**

Run:
```bash
cd ~/0nefinity/dev.0nefinity.love
git show HEAD:includes/something-in-the-body.html | grep -oP 'href="[^"]*"' | sort > /tmp/menu-baseline.txt
wc -l /tmp/menu-baseline.txt   # expect ~326
```
This is the target shape: ~326 curated links, no fonts.

- [ ] **Step 2: Exclude the font subtree (and only that) in the generator**

Tim's decision: "wie bisher (~326), nur Fonts raus." So change the MINIMUM needed — the local font pack (~16k woff2) is the entire blow-up; the curated baseline already included `assets/*.png`, `tools/*.py`, `*.md/.txt`, etc. and those must stay.

In `tools/generate-menu.py`, current set:
```python
EXCLUDE_DIRS = {'.git', '.ssh', '.vscode', '00_Archiv', '__pycache__', 'includes'}
```
Add only the font directory names + build/vendor cruft that is clearly not navigation content:
```python
EXCLUDE_DIRS = {
    '.git', '.ssh', '.vscode', '00_Archiv', '__pycache__', 'includes',
    'fonts',                          # top-level /fonts and nested tools/tools/fonts/...
    '!!DANGER!!-un0nefinity-fonts-!!DANGER!!',  # belt-and-suspenders for the font pack dir name
    'node_modules', '.superpowers', '.gitnexus', '.kilocode',
    '.auth', '.php_tmp', 'test-results',
}
```
`EXCLUDE_DIRS` matches directory NAMES at any depth (the walk filters `dirnames`), so both `/fonts` and `/tools/tools/fonts/...` are covered by `'fonts'`. Do NOT exclude `tools`, `assets`, `api`, `docs`, `user`, `profilbilder` — those contributed legit entries to the curated baseline.

- [ ] **Step 3: Run the generator**

Run:
```bash
cd ~/0nefinity/dev.0nefinity.love && python3 tools/generate-menu.py
```
Expected: writes `includes/something-in-the-body.html`, prints a file count.

- [ ] **Step 4: Verify scope is sane (acceptance criteria)**

Run:
```bash
cd ~/0nefinity/dev.0nefinity.love
echo "links:"; grep -o '<a href' includes/something-in-the-body.html | wc -l
echo "fonts (must be 0):"; grep -oc 'woff2\|\.ttf"\|\.woff"' includes/something-in-the-body.html
echo "size bytes (must be < 150000):"; wc -c < includes/something-in-the-body.html
echo "structural markup present (must all be >0):"
grep -oc 'id="file-list"\|menu-loupe\|meta-dialog-backdrop\|menu-toggle' includes/something-in-the-body.html
```
Expected: links in ~250–450 range; **0** font files; size well under 150 KB; all four structural markers present.

Then compare composition against the curated baseline from Step 1 (should be close — baseline minus fonts plus any pages added since May):
```bash
cd ~/0nefinity/dev.0nefinity.love
grep -oP 'href="[^"]*"' includes/something-in-the-body.html | sort > /tmp/menu-new.txt
echo "only in OLD baseline (expect: mostly font files, if any):"; comm -23 /tmp/menu-baseline.txt /tmp/menu-new.txt | head
echo "only in NEW (expect: pages added since May, e.g. fractal0ne/geb-*):"; comm -13 /tmp/menu-baseline.txt /tmp/menu-new.txt | head
```
Expected: removed entries are font/build files only; added entries are real new pages. No legit content silently dropped.

- [ ] **Step 5: Visual check on the testseite (it already uses this include)**

Run:
```bash
curl -sL https://dev.0nefinity.love/testseite | grep -o 'menu-loupe[a-z-]*\|activate js or use browser search' | sort -u
```
Expected: `menu-loupe`, `menu-loupe-handle`, `activate js or use browser search` all present (SSI still resolves, gimmick intact).

- [ ] **Step 6: Commit**

```bash
cd ~/0nefinity/dev.0nefinity.love
git add tools/generate-menu.py includes/something-in-the-body.html
git commit -m "menu generator: exclude fonts/assets/build, regenerate curated index"
```

---

## Task 2: Port math-notation + dev-live-reload into meta-static.js

**Why:** `meta-static.js` lacks two `meta.js` features. Tim chose to KEEP pi()/e() auto-replace. Dev-live-reload is a dev-only convenience worth keeping so converted pages still hot-reload.

**Files:**
- Modify: `meta-static.js` (add dev-live-reload IIFE near top; add math-notation IIFE inside or after DOMContentLoaded block)
- Reference source: `meta.js:6-27` (devLiveReload), `meta.js:821-1423` (mathNotation module)

**Interfaces:**
- Produces: `window._018Math` API (same as meta.js) and pi()/e() text substitution on all pages loading `meta-static.js`.

- [ ] **Step 1: Copy the dev-live-reload IIFE**

Copy `meta.js:6-27` (the `(function devLiveReload(){…})()` block) verbatim to the TOP of `meta-static.js` (before the `_018Space` IIFE). It self-gates on `hostname.startsWith('dev.')` so it's a no-op in prod.

- [ ] **Step 2: Copy the math-notation module**

Copy the entire `(function mathNotation(){…})()` block (`meta.js:821` to its closing `})();`) into `meta-static.js`, placed INSIDE the `DOMContentLoaded` handler at the end (just before the closing `}); // Ende DOMContentLoaded`), matching how meta.js runs it after DOM is ready. Copy it verbatim — it is self-contained (defines its own constants, DOM walker, MutationObserver, helper box, `window._018Math`).

- [ ] **Step 3: Syntax check**

Run:
```bash
cd ~/0nefinity/dev.0nefinity.love && node --check meta-static.js && echo "SYNTAX OK"
```
Expected: `SYNTAX OK`.

- [ ] **Step 4: Verify both features present**

Run:
```bash
cd ~/0nefinity/dev.0nefinity.love
grep -c 'devLiveReload\|PI_DIGITS\|replacePiCalls\|_018Math' meta-static.js
```
Expected: ≥4 (all markers present).

- [ ] **Step 5: Browser verify pi() replacement on the testseite**

Add a temporary `pi(5)` to a test page body OR test via Playwright on testseite after injecting text. Minimal check: load testseite headless, confirm `window._018Math` is defined and `window._018Space` is defined, and console has zero errors.
```bash
cd ~/0nefinity/dev.0nefinity.love && python3 tools/check-no-js-page.py https://dev.0nefinity.love/testseite
```
(Helper script created in Task 4; if running this task first, do the equivalent manual Playwright check: page loads, `typeof window._018Math === 'object'`, 0 console errors.)
Expected: `_018Math` present, `_018Space` present, 0 console errors.

- [ ] **Step 6: Commit**

```bash
cd ~/0nefinity/dev.0nefinity.love
git add meta-static.js
git commit -m "meta-static.js: port math-notation pi()/e() + dev-live-reload for parity"
```

---

## Task 3: Build the page-conversion script

**Why:** 72 pages load `meta.js` uniformly. A script does the mechanical swap; a separate pass handles the 13 pages that also load tool scripts now provided by the head-include.

**Files:**
- Create: `tools/convert-to-ssi.sh`

**Interfaces:**
- Consumes: a list of `.html` page paths. Produces: each page rewritten to use SSI includes, idempotent (running twice is a no-op).

- [ ] **Step 1: Write the conversion script**

Create `tools/convert-to-ssi.sh`:
```bash
#!/usr/bin/env bash
# Convert a page from the meta.js nav system to SSI includes. Idempotent.
set -euo pipefail
for f in "$@"; do
  # skip if already converted
  if grep -q 'something-in-the-head.html' "$f"; then
    echo "skip (already SSI): $f"; continue
  fi
  # 1) insert head-include right after the opening <head> (first match only)
  perl -0pi -e 's{(<head[^>]*>)}{$1\n  <!--#include virtual="/includes/something-in-the-head.html" -->}s' "$f"
  # 2) delete the meta.css <link> line (with or without trailing "Für KI" comment)
  perl -ni -e 'print unless m{<link[^>]*href="/meta\.css"}' "$f"
  # 3) delete the meta.js <script> line (with or without trailing comment)
  perl -ni -e 'print unless m{<script[^>]*src="/meta\.js"}' "$f"
  # 4) delete tool scripts already provided by the head-include (avoid double-load)
  perl -ni -e 'print unless m{<script[^>]*src="/tools/controls\.js"}' "$f"
  perl -ni -e 'print unless m{<script[^>]*src="/tools/zoom\.js"}' "$f"
  perl -ni -e 'print unless m{<script[^>]*src="/tools/tools/decimal\.js"}' "$f"
  # 5) insert body-include right before the closing </body>
  perl -0pi -e 's{(</body>)}{<!--#include virtual="/includes/something-in-the-body.html" -->\n$1}s' "$f"
  echo "converted: $f"
done
```
Note: pixi.js and other non-head-include tools are intentionally NOT removed (they aren't in the head-include).

- [ ] **Step 2: Make it executable**

```bash
chmod +x ~/0nefinity/dev.0nefinity.love/tools/convert-to-ssi.sh
```

- [ ] **Step 3: Dry-run on a COPY of index.html**

```bash
cd ~/0nefinity/dev.0nefinity.love
cp index.html /tmp/index-test.html
tools/convert-to-ssi.sh /tmp/index-test.html
echo "--- meta.js refs (want 0): "; grep -c 'meta\.js\|/meta\.css' /tmp/index-test.html
echo "--- head include (want 1): "; grep -c 'something-in-the-head' /tmp/index-test.html
echo "--- body include (want 1): "; grep -c 'something-in-the-body' /tmp/index-test.html
```
Expected: 0 meta refs, 1 head include, 1 body include.

- [ ] **Step 4: Verify idempotency**

```bash
tools/convert-to-ssi.sh /tmp/index-test.html   # second run
grep -c 'something-in-the-head' /tmp/index-test.html   # still 1, prints "skip"
```
Expected: prints `skip (already SSI)`, head-include count stays 1.

- [ ] **Step 5: Commit**

```bash
cd ~/0nefinity/dev.0nefinity.love
git add tools/convert-to-ssi.sh
git commit -m "add idempotent meta.js->SSI page conversion script"
```

---

## Task 4: Build the no-JS verification helper

**Why:** We need an automatable acceptance check that a page works WITH and WITHOUT JavaScript. Used by every conversion task.

**Environment note:** Playwright on this host is the **Python** package (`~/.local/lib/python3.12/site-packages/playwright`, browsers cached in `~/.cache/ms-playwright`). There is no project-level Node `playwright`. So the checker is **Python** — no install needed (avoids the global-install denylist entirely). Verified working: `python3` + `sync_playwright` loads testseite and counts 354 `#file-list a` links.

**Files:**
- Create: `tools/check-no-js-page.py`

**Interfaces:**
- Consumes: a URL (argv[1]). Produces: exit 0 + `PASS <url>` if page passes both JS-on and JS-off checks; exit 1 + `FAIL <url>` with reasons otherwise.

- [ ] **Step 1: Write the checker**

Create `tools/check-no-js-page.py`:
```python
#!/usr/bin/env python3
import sys
from playwright.sync_api import sync_playwright

url = sys.argv[1] if len(sys.argv) > 1 else None
if not url:
    print("usage: check-no-js-page.py <url>", file=sys.stderr); sys.exit(2)

fail = []
with sync_playwright() as p:
    browser = p.chromium.launch()

    # --- JS ENABLED: framework loads, no console errors, no failed requests ---
    ctx = browser.new_context()
    page = ctx.new_page()
    errors, failed = [], []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("requestfailed", lambda r: failed.append(r.url))
    page.goto(url, wait_until="networkidle")
    has_space = page.evaluate("() => typeof window._018Space === 'object'")
    dup_controls = page.evaluate(
        "() => [...document.scripts].filter(s => s.src.includes('/tools/controls.js')).length")
    if errors: fail.append(f"JS-on console errors: {errors}")
    if failed: fail.append(f"JS-on failed requests: {failed}")
    if not has_space: fail.append("JS-on: window._018Space missing")
    if dup_controls > 1: fail.append(f"JS-on: controls.js loaded {dup_controls}x")
    ctx.close()

    # --- JS DISABLED: static menu present + search disabled ---
    ctx = browser.new_context(java_script_enabled=False)
    page = ctx.new_page()
    page.goto(url, wait_until="load")
    links = page.locator("#file-list a").count()
    search_disabled = page.locator(".menu-search input[disabled]").count()
    loupe = page.locator(".menu-loupe").count()
    if links < 50: fail.append(f"JS-off: too few menu links: {links}")
    if search_disabled != 1: fail.append("JS-off: search not disabled")
    if loupe != 1: fail.append("JS-off: loupe missing")
    ctx.close()

    browser.close()

for f in fail:
    print("  -", f, file=sys.stderr)
print("FAIL" if fail else "PASS", url)
sys.exit(1 if fail else 0)
```

- [ ] **Step 2: Run it against the already-converted testseite**

```bash
cd ~/0nefinity/dev.0nefinity.love && python3 tools/check-no-js-page.py https://dev.0nefinity.love/testseite
```
Expected: `PASS https://dev.0nefinity.love/testseite`.

- [ ] **Step 3: Negative control (prove it can fail)**

```bash
cd ~/0nefinity/dev.0nefinity.love && python3 tools/check-no-js-page.py https://dev.0nefinity.love/index; echo "exit=$?"
```
`index` is NOT yet converted (no static menu without JS) → expect `FAIL` + exit 1 (proves the JS-off menu check actually detects a missing static menu). This confirms the checker isn't a rubber stamp.

- [ ] **Step 4: Commit**

```bash
cd ~/0nefinity/dev.0nefinity.love
git add tools/check-no-js-page.py
git commit -m "add no-JS + JS-on page verification helper (Python Playwright)"
```

---

## Task 5: Pilot conversion — 3 representative pages

**Why:** Prove the pipeline on one landing page, one content page, one heavy canvas page before bulk. Catches per-page surprises cheaply.

**Files:**
- Modify: `index.html`, `README.html`, `fractal0ne.html`

**Interfaces:**
- Consumes: `tools/convert-to-ssi.sh`, `tools/check-no-js-page.py` from Tasks 3–4.

- [ ] **Step 1: Convert the three pages**

```bash
cd ~/0nefinity/dev.0nefinity.love
tools/convert-to-ssi.sh index.html README.html fractal0ne.html
```
Expected: three `converted:` lines.

- [ ] **Step 2: Static sanity per page**

```bash
cd ~/0nefinity/dev.0nefinity.love
for f in index.html README.html fractal0ne.html; do
  echo "== $f =="
  echo " meta refs (0): $(grep -c 'src="/meta\.js"\|href="/meta\.css"' $f)"
  echo " head inc (1): $(grep -c 'something-in-the-head' $f)"
  echo " body inc (1): $(grep -c 'something-in-the-body' $f)"
  echo " controls dup (0, head-include provides it): $(grep -c 'src="/tools/controls\.js"' $f)"
done
```
Expected: every page → 0 meta refs, 1 head, 1 body, 0 controls.

- [ ] **Step 3: Live render check (SSI resolves on each)**

```bash
cd ~/0nefinity/dev.0nefinity.love
for u in index README fractal0ne; do
  echo "== $u =="; curl -sL "https://dev.0nefinity.love/$u" | grep -c 'id="file-list"\|meta-static.js'
done
```
Expected: each ≥2 (includes resolved server-side).

- [ ] **Step 4: Playwright JS-on + JS-off**

```bash
cd ~/0nefinity/dev.0nefinity.love
for u in index README fractal0ne; do python3 tools/check-no-js-page.py "https://dev.0nefinity.love/$u"; done
```
Expected: three `PASS` lines. Pay special attention to `fractal0ne` (canvas page — confirm the WebGL/canvas still inits, no console errors, controls.js not double-loaded).

- [ ] **Step 5: Commit**

```bash
cd ~/0nefinity/dev.0nefinity.love
git add index.html README.html fractal0ne.html
git commit -m "convert pilot pages (index, README, fractal0ne) to SSI no-JS nav"
```

---

## Task 6: Bulk conversion — remaining meta.js pages

**Why:** With the pipeline proven, convert the rest in one sweep, then verify a representative sample plus a full static grep.

**Files:**
- Modify: all remaining `.html` pages that still reference `meta.js` (excluding `00_Archiv`)

- [ ] **Step 1: List remaining pages**

```bash
cd ~/0nefinity/dev.0nefinity.love
grep -rl 'src="/meta\.js"' --include='*.html' . | grep -v 00_Archiv > /tmp/to-convert.txt
wc -l /tmp/to-convert.txt   # ~69 (72 minus 3 pilots)
cat /tmp/to-convert.txt
```

- [ ] **Step 2: Convert all of them**

```bash
cd ~/0nefinity/dev.0nefinity.love
xargs -a /tmp/to-convert.txt tools/convert-to-ssi.sh
```
Expected: a `converted:` line per page, no errors.

- [ ] **Step 3: Full static audit (acceptance criteria)**

```bash
cd ~/0nefinity/dev.0nefinity.love
echo "pages still loading meta.js (MUST be 0): $(grep -rl 'src="/meta\.js"' --include='*.html' . | grep -v 00_Archiv | wc -l)"
echo "pages still loading /meta.css link (MUST be 0): $(grep -rl 'href="/meta\.css"' --include='*.html' . | grep -v 00_Archiv | wc -l)"
echo "pages with head-include: $(grep -rl 'something-in-the-head' --include='*.html' . | grep -v 00_Archiv | wc -l)"
echo "pages double-loading controls.js (MUST be 0): $(grep -rl 'src="/tools/controls\.js"' --include='*.html' . | grep -v 00_Archiv | wc -l)"
```
Expected: 0 meta.js, 0 /meta.css, head-include count ≈ total converted pages, 0 controls dup.

- [ ] **Step 4: Playwright sample across page types**

```bash
cd ~/0nefinity/dev.0nefinity.love
for u in taschenrechner shadows co0rdinates game0f1ife where-is-01 numberline bibelaufdenpunkt; do
  python3 tools/check-no-js-page.py "https://dev.0nefinity.love/$u" || echo "  ^ FAILED: $u";
done
```
Expected: all `PASS`. `bibelaufdenpunkt` exercises the dialog (`_018Dialog`); confirm no console errors. Investigate any FAIL individually before proceeding (systematic-debugging).

- [ ] **Step 5: Commit**

```bash
cd ~/0nefinity/dev.0nefinity.love
git add -A -- '*.html'
git commit -m "bulk-convert remaining pages to SSI no-JS nav"
```

---

## Task 7: Sync automation — regenerate menu on commit

**Why:** The static menu must not drift when pages are added/removed. A pre-commit hook regenerates it automatically (promptable, no human discipline needed).

**Files:**
- Create: `tools/git-hooks/pre-commit`
- Modify: git config to use the hooks dir (or symlink into `.git/hooks`)

- [ ] **Step 1: Write the hook**

Create `tools/git-hooks/pre-commit`:
```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
# only regenerate if an .html page (not the include itself) is staged
if git diff --cached --name-only | grep -qE '\.html$' \
   && ! git diff --cached --name-only | grep -q 'includes/something-in-the-body.html'; then
  python3 tools/generate-menu.py
  git add includes/something-in-the-body.html
fi
```

- [ ] **Step 2: Install it**

```bash
cd ~/0nefinity/dev.0nefinity.love
chmod +x tools/git-hooks/pre-commit
git config core.hooksPath tools/git-hooks
```
Note: `core.hooksPath` keeps the hook versioned in-repo (survives clones better than `.git/hooks`).

- [ ] **Step 3: Verify the hook fires**

```bash
cd ~/0nefinity/dev.0nefinity.love
touch "test-hook-page.html"   # create a dummy page
git add test-hook-page.html
git commit -m "test: hook regen" --dry-run 2>&1 | head   # observe; then real commit
# after real commit, confirm include changed:
git show --stat HEAD | grep something-in-the-body && echo "hook regenerated menu"
rm test-hook-page.html && git add -A && git commit -m "remove hook test page"
```
Expected: the include is auto-staged/regenerated when an html page is committed.

- [ ] **Step 4: Commit the hook**

```bash
cd ~/0nefinity/dev.0nefinity.love
git add tools/git-hooks/pre-commit
git commit -m "git hook: auto-regenerate static menu when pages change"
```

---

## Task 8: Retire old meta.js and rename meta-static.js → meta.js

**Why:** Once no page references the OLD framework directly, delete it. Then promote the new framework to the real name: `meta-static.js` was only a working name — the final file must be `meta.js` again.

**Files:**
- Delete: old `meta.js`
- Rename: `meta-static.js` → `meta.js`
- Modify: `includes/something-in-the-head.html` (script src `/meta-static.js` → `/meta.js`)

- [ ] **Step 1: Prove zero direct references to the script**

```bash
cd ~/0nefinity/dev.0nefinity.love
grep -rl 'src="/meta\.js"' --include='*.html' . | grep -v 00_Archiv
```
Expected: NO output (pages load the framework via the head-include, not directly). If any page still has a direct `src="/meta.js"`, convert it (back to Task 6) before continuing.

- [ ] **Step 2: Delete old meta.js, rename new one, repoint the include**

```bash
cd ~/0nefinity/dev.0nefinity.love
git rm meta.js                       # old JS-menu framework
git mv meta-static.js meta.js        # promote working name to final name
# repoint the head-include to the final filename:
perl -pi -e 's{/meta-static\.js}{/meta.js}g' includes/something-in-the-head.html
grep -c 'meta-static' includes/something-in-the-head.html   # MUST be 0
grep -c '/meta.js'    includes/something-in-the-head.html   # MUST be 1
```
Expected: head-include now references `/meta.js`, zero `meta-static` references anywhere.

- [ ] **Step 3: Verify no stale `meta-static` references remain**

```bash
cd ~/0nefinity/dev.0nefinity.love
grep -rl 'meta-static' --include='*.html' --include='*.js' . | grep -v 00_Archiv
```
Expected: NO output.

- [ ] **Step 4: Live verify (include now serves the renamed file)**

```bash
cd ~/0nefinity/dev.0nefinity.love
# force the dev container to re-read by re-requesting; SSI is per-request so no restart needed
for u in index testseite shadows bibelaufdenpunkt; do
  python3 tools/check-no-js-page.py "https://dev.0nefinity.love/$u" || echo "FAIL $u";
done
curl -sI https://dev.0nefinity.love/meta.js | head -1   # MUST be 200
curl -sI https://dev.0nefinity.love/meta-static.js | head -1   # 404 is fine/expected
```
Expected: all `PASS`; `/meta.js` returns 200.

- [ ] **Step 5: Commit + push the whole rollout**

```bash
cd ~/0nefinity/dev.0nefinity.love
git commit -m "retire old meta.js, rename meta-static.js -> meta.js (final name); nav is now no-JS site-wide"
git push origin claude-dev
```

---

## Acceptance Criteria (whole rollout)

1. `grep -rl 'src="/meta\.js"' --include='*.html' . | grep -v 00_Archiv` → **empty** (no page loads the framework directly; it comes via the head-include).
2. Old JS-menu framework gone; final framework file is named `meta.js` again (`meta-static.js` no longer exists; `grep -rl 'meta-static' .` excluding `00_Archiv` → empty).
3. Static menu include: ~250–450 links, **0** font files, < 150 KB.
4. `tools/check-no-js-page.py` returns **PASS** for: index, README, fractal0ne (canvas), bibelaufdenpunkt (dialog), shadows, co0rdinates, testseite.
5. JS-off: every sampled page shows the static menu (≥50 links), disabled search, loupe present.
6. JS-on: `window._018Space` and `window._018Math` defined, **0 console errors**, **0** failed requests, no script double-loaded.
7. Adding a new `.html` page + committing auto-updates the menu (pre-commit hook).
8. No external resource loads (same-origin/CSP intact): `curl -sI https://dev.0nefinity.love/index | grep -i content-security-policy` still present.

## Out of scope (explicitly NOT this plan)

- Pushing to `main` / `0nefinity.love` (that's Step 3, a separate go-live plan after dev is verified).
- Pure-CSS dialog / removing the dialog's JS dependency (Topf C, deferred).
- Touching `meta.css` color logic or `00_Archiv`.
