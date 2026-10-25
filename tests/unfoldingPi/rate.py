import sys, time
from playwright.sync_api import sync_playwright
from common import KICK
with sync_playwright() as pw:
    for name in ['chromium','firefox','webkit']:
        b = getattr(pw,name).launch(); p=b.new_page(viewport={'width':1000,'height':600})
        p.goto('https://dev.0nefinity.love/unfoldingPi'); p.wait_for_function('window.unfoldingPi')
        p.evaluate(KICK)
        t0=time.time(); marks={}
        while time.time()-t0<100 and 1000000 not in marks:
            n=p.evaluate('window.unfoldingPi.state().chainLength')-2
            for m in (100000,1000000):
                if n>=m and m not in marks: marks[m]=round(time.time()-t0,1)
            time.sleep(0.2)
        print(name, marks, flush=True); b.close()
