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
