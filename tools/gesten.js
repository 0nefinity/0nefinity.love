// Schwenken und Zoomen mit Maus, Rad und Fingern (Modell aus bibelaufdenpunkt.html, ohne Abhaengigkeiten).
//   const detach = Gesten.attach(element, { getView, setView, minScale, maxScale, excludeSelector, wheelStep });
// Ansicht: { scale, x, y } mit Bildschirmpunkt = (x, y) + Weltpunkt * scale, Koordinaten des Elements (bei body/html: Fensterkoordinaten).
// Anker: der Weltpunkt unter Zeiger oder Pinch-Mitte bleibt dort stehen. Pinch rechnet schrittweise, die Mitte darf wandern (Pinch ist zugleich Schwenk).
// Laesst man beim Pinch einen Finger los, zieht der andere ohne Sprung weiter. minScale/maxScale null = unbegrenzt.
// Teile des Elements, die selbst scrollen oder bedienen (Panel), gehen ueber excludeSelector vom Schwenken aus.
(function () {
    'use strict';
    const KLEINST = 1e-9;

    function klemmen(s, min, max) {
        const lo = min === null || min === undefined ? KLEINST : Math.max(KLEINST, min);
        const hi = max === null || max === undefined ? Infinity : max;
        return Math.min(hi, Math.max(lo, s));
    }

    // Neue Ansicht mit Skala nach `scale`, der Weltpunkt unter (px, py) bleibt dort
    function ankern(v, px, py, scale) {
        const wx = (px - v.x) / v.scale, wy = (py - v.y) / v.scale;
        return { scale, x: px - wx * scale, y: py - wy * scale };
    }

    function attach(el, opt) {
        if (!el || !opt || typeof opt.getView !== 'function' || typeof opt.setView !== 'function') throw new Error('Gesten.attach: element, getView und setView noetig');
        const min = opt.minScale ?? null, max = opt.maxScale ?? null;
        const step = opt.wheelStep ?? 0.03;
        const aus = opt.excludeSelector || null;
        const wurzel = el === document.body || el === document.documentElement;
        const lokal = (cx, cy) => {
            if (wurzel) return { x: cx, y: cy };
            const r = el.getBoundingClientRect();
            return { x: cx - r.left, y: cy - r.top };
        };
        const ausgenommen = t => !!(aus && t && t.closest && t.closest(aus));
        const vorher = el.style.touchAction;
        el.style.touchAction = 'none';

        const zoomUm = (px, py, faktor) => {
            const v = opt.getView();
            const s = klemmen(v.scale * faktor, min, max);
            opt.setView(ankern(v, px, py, s));
        };
        const schieben = (dx, dy) => {
            const v = opt.getView();
            opt.setView({ scale: v.scale, x: v.x + dx, y: v.y + dy });
        };

        const onWheel = e => {
            if (ausgenommen(e.target)) return;
            e.preventDefault();
            if (!e.deltaY) return;
            const p = lokal(e.clientX, e.clientY);
            zoomUm(p.x, p.y, 1 + (e.deltaY > 0 ? -step : step));
        };

        // Maus: linke Taste zieht. Kein setPointerCapture: das leitet den Klick um (Menueknopf).
        let maus = null;
        const onMouseDown = e => {
            if (e.button !== 0 || ausgenommen(e.target)) return;
            maus = lokal(e.clientX, e.clientY);
        };
        const onMouseMove = e => {
            if (!maus) return;
            if (!(e.buttons & 1)) { maus = null; return; }
            const p = lokal(e.clientX, e.clientY);
            schieben(p.x - maus.x, p.y - maus.y);
            maus = p;
        };
        const onMouseUp = () => { maus = null; };

        // Finger: nur Beruehrungen, die ausserhalb der ausgenommenen Teile begannen
        const aktiv = new Map();
        let pinch = null;
        const mitteDist = () => {
            const [a, b] = [...aktiv.values()];
            return { mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) };
        };
        const onTouchStart = e => {
            for (const t of e.changedTouches) {
                if (ausgenommen(t.target)) continue;
                aktiv.set(t.identifier, lokal(t.clientX, t.clientY));
            }
            pinch = aktiv.size >= 2 ? mitteDist() : null;
        };
        const onTouchMove = e => {
            if (!aktiv.size) return;
            const vor = new Map(aktiv);
            let bewegt = false;
            for (const t of e.changedTouches) if (aktiv.has(t.identifier)) { aktiv.set(t.identifier, lokal(t.clientX, t.clientY)); bewegt = true; }
            if (!bewegt) return;
            e.preventDefault();
            if (aktiv.size >= 2) {
                const jetzt = mitteDist();
                if (!pinch) { pinch = jetzt; return; }
                if (pinch.d > 0 && jetzt.d > 0) {
                    const v = opt.getView();
                    const s = klemmen(v.scale * jetzt.d / pinch.d, min, max);
                    const wx = (pinch.mx - v.x) / v.scale, wy = (pinch.my - v.y) / v.scale;
                    opt.setView({ scale: s, x: jetzt.mx - wx * s, y: jetzt.my - wy * s });
                }
                pinch = jetzt;
            } else {
                const [id, p] = [...aktiv][0];
                const q = vor.get(id);
                if (q) schieben(p.x - q.x, p.y - q.y);
            }
        };
        const onTouchEnd = e => {
            for (const t of e.changedTouches) aktiv.delete(t.identifier);
            pinch = aktiv.size >= 2 ? mitteDist() : null;
        };

        const dok = document;
        el.addEventListener('wheel', onWheel, { passive: false });
        el.addEventListener('mousedown', onMouseDown);
        dok.addEventListener('mousemove', onMouseMove);
        dok.addEventListener('mouseup', onMouseUp);
        el.addEventListener('touchstart', onTouchStart, { passive: true });
        el.addEventListener('touchmove', onTouchMove, { passive: false });
        el.addEventListener('touchend', onTouchEnd);
        el.addEventListener('touchcancel', onTouchEnd);
        return function detach() {
            el.removeEventListener('wheel', onWheel);
            el.removeEventListener('mousedown', onMouseDown);
            dok.removeEventListener('mousemove', onMouseMove);
            dok.removeEventListener('mouseup', onMouseUp);
            el.removeEventListener('touchstart', onTouchStart);
            el.removeEventListener('touchmove', onTouchMove);
            el.removeEventListener('touchend', onTouchEnd);
            el.removeEventListener('touchcancel', onTouchEnd);
            el.style.touchAction = vorher;
        };
    }

    window.Gesten = { attach, ankern, klemmen };
})();
