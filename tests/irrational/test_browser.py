"""Browser-Test: 1e5 Stellen je Konstante ueber Irrational.open gegen mpmath-Referenz, live auf dev.0nefinity.love.
Aufruf: BROWSER=chromium|firefox|webkit [URL=https://dev.0nefinity.love] python3 tests/irrational/test_browser.py"""
import os, sys
from playwright.sync_api import sync_playwright

URL = os.environ.get("URL", "https://dev.0nefinity.love")
BROWSER = os.environ.get("BROWSER", "chromium")
N = int(os.environ.get("N", "100000"))
IDS = ["pi", "e", "ln2", "sqrt2", "phi"]
fails = 0

with sync_playwright() as p:
    b = getattr(p, BROWSER).launch()
    page = b.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    page.goto(URL + "/tests/irrational/harness.html")
    page.wait_for_function("window.runCheck !== undefined")
    for i in IDS:
        r = page.evaluate("([i, n]) => runCheck(i, n)", [i, N])
        ok = r["ok"] and "limit" not in r and "error" not in r
        fails += 0 if ok else 1
        print(("PASS" if ok else "FAIL"), BROWSER, i, "got=%s mismatchAt=%s algo=%s" % (r["got"], r["mismatchAt"], r["state"]["algorithm"]), r.get("limit") or r.get("error") or "")
    if errs:
        fails += 1
        print("FAIL console errors:", errs[:3])
    b.close()
print("ALL PASS" if not fails else "FAILED %d" % fails)
sys.exit(1 if fails else 0)
