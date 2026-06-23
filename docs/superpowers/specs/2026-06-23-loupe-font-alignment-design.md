# Loupe Font Alignment — Design

Date: 2026-06-23
Branch: claude-dev
Status: design, not yet implemented

## Problem

The search-bar "loupe" (magnifying glass) is built from two real glyphs:
`0` = the lens (`.menu-loupe`), `1` = the handle (`.menu-loupe-handle`,
rotated -45deg). On click of the disabled input the handle slides over the
lens to form a "stop sign" (⊘) gimmick.

Positioning is hardcoded in `meta.css` with absolute rem offsets tuned for
**Ysabeau only**:

```css
.menu-loupe        { left: 2rem;   font-size: 1.5rem; transform: translateY(-65%); }
.menu-loupe-handle { left: 2.5rem; font-size: 1.4rem; transform: translateY(-15%) rotate(-45deg); }
```

0nefinity has a "free menu" that re-renders the whole site in different
fonts. Every font shapes `0` and `1` differently (oval vs round lens,
serif vs slab `1`, different widths/x-heights). With any non-Ysabeau font
the two glyphs no longer fuse into a clean loupe, and the ⊘ stop sign
breaks. The current fix (commit 0907b378, embed a 0+1 Ysabeau subset inline)
forces ONE font — it does not let the loupe match the active free-menu font,
which is the actual goal.

Constraint that rules out the obvious fix: the loupe must render correctly
**without JavaScript**. So runtime glyph measurement (canvas `measureText`,
bounding-box math) is off the table for production — it needs JS.

## Goal

`0` and `1` form a visually perfect loupe (and perfect ⊘ on click) in
**every** font the free menu offers, with **zero JavaScript** at render time.

## Approach (chosen)

**Parametrize the loupe geometry as em-relative CSS custom properties, plus a
small per-font override map. Build a JS alignment tool inside `where-is-01`
to dial the values per font and export the CSS block.**

Why this over the alternatives:

- **Runtime metric-driven (rejected):** measuring glyph boxes needs JS at
  render time → violates the no-JS hard constraint.
- **One embedded subset font (rejected, = current 0907b378):** robust but
  forces a single font; the loupe can never match the active free-menu font,
  which is the whole point.
- **Em-relative vars + per-font map (chosen):** production output is pure CSS
  custom properties → no JS at render. Em-relative defaults get *most* fonts
  90% right because the offsets scale with `font-size`; the residual per-font
  deviation (lens ovalness, `1` serifs) is captured in a tiny override map.
  The alignment tool is exactly the "Schriftart-Veränderungstool" the user
  asked to build into `where-is-01`, and it is a dev tool so it may use JS
  freely.

### Geometry model

Both loupes (menu `.menu-loupe*` and `where-is-01` `.cursor-loupe::before/after`)
read the same custom properties. Defaults live on `:root`; per-font classes
override only what deviates.

| Variable | Meaning | Default |
|---|---|---|
| `--loupe-glass-size` | font-size of `0` (lens), em | `1.5em` |
| `--loupe-handle-size` | font-size of `1` (handle), em | `0.95em` |
| `--loupe-handle-x` | handle x-offset relative to lens, em | tune |
| `--loupe-handle-y` | handle y-offset relative to lens, em | tune |
| `--loupe-handle-angle` | handle rotation | `-45deg` |
| `--loupe-handle-scale-y` | handle length stretch | `1` |
| `--loupe-stop-x` / `-y` / `-scale` / `-angle` | handle transform in the ⊘ stop state | tune |

The lens (`0`) is the anchor; the handle (`1`) is positioned relative to it.
Switching font = switching the body font-class; the matching override block
(or the `:root` default if none) supplies the offsets. No JS.

### The alignment tool (in `where-is-01.html`)

A dev-only panel:

1. **Font picker** — lists the free-menu fonts; applies the selected font to
   the live loupe preview.
2. **Sliders** — one per variable above, live-binding to the loupe's CSS vars.
3. **Dual preview** — shows the loupe AND the ⊘ stop state side by side,
   over a search-bar mock, so both states are tuned together.
4. **Export** — emits a ready-to-paste CSS block:
   `.font-<name> { --loupe-handle-x: …; --loupe-handle-y: …; … }`
   (only the vars that differ from `:root`).

Workflow: pick font → drag sliders until loupe + ⊘ look right → copy block →
paste into `meta.css`. Repeat per font. The tool is the engineering surface;
`meta.css` is the committed result.

## Out of scope (YAGNI)

- No automatic font-metric extraction. Manual dial-in via the tool.
- No new fonts added to the free menu.
- No change to the Zoom2D behavior of `where-is-01`.

## Files touched

- `meta.css` — replace hardcoded `.menu-loupe*` / `.cursor-loupe::*` offsets
  with `var(--loupe-*)`; add `:root` defaults; add per-font override blocks.
- `where-is-01.html` — add the alignment-tool panel (HTML + scoped JS + CSS).
- (No `.htaccess` change; the 0907b378 inline subset can stay as the lens
  fallback or be removed once per-font coverage exists — decide at implementation.)

## Acceptance Criteria

Verifiable via Playwright against dev.0nefinity.love:

1. **No-JS render, per font:** with JS disabled, for each free-menu font class
   applied to `<body>`, a screenshot of the search bar shows the loupe as a
   recognizable magnifying glass (lens circle + handle touching lens at lower
   right). Manual visual pass per font; screenshots committed under
   `test-results/loupe/<font>.png`.
2. **Stop-sign, per font:** simulating the disabled-input `:active` state, the
   handle crosses the lens center forming a ⊘. Screenshot per font.
3. **No-JS proof:** the above hold with `page.setJavaScriptEnabled(false)` —
   loupe geometry comes purely from CSS.
4. **Tool export round-trips:** values dialed in the `where-is-01` tool, when
   exported and pasted into `meta.css`, reproduce the same loupe (pixel-diff
   of tool preview vs live search bar < 2% for the same font).
5. **No regression:** Ysabeau loupe is pixel-equivalent (< 1% diff) to the
   current committed loupe — the refactor to vars must not move it.
6. **CSP unchanged / still valid:** `font-src 'self' data:` still covers all
   referenced fonts; no new external requests.

## Open decisions for implementation

- Keep or drop the 0907b378 inline Ysabeau subset once per-font map exists.
- Which subset of free-menu fonts to tune first (start with the 3-4 most-used).
- Whether `--loupe-*` defaults live in `meta.css` `:root` or a dedicated
  `loupe.css` partial.
