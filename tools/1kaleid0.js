// tools/1kaleid0.js
// Ein Skript, um Kaleidoskop-Text-Effekte einfach auf jeder Webseite einzubinden.

(function () {
    // 1. Core CSS Injektion
    const styleId = 'kaleido-text-core-styles';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .kaleido-container {
                position: relative;
                width: 100%;
                height: 100%;
                display: flex;
                justify-content: center;
                align-items: center;
                overflow: hidden;
            }
            .k-center {
                position: absolute;
                top: 50%;
                left: 50%;
            }
            .k-segment {
                position: absolute;
                top: 0;
                left: 0;
                width: 100vmax;
                height: 100vmax;
                transform-origin: 0 0;
                mask-image: conic-gradient(from -0.1deg at 0 0, #000 calc(var(--k-angle) + 0.2deg), transparent calc(var(--k-angle) + 0.2deg));
                -webkit-mask-image: conic-gradient(from -0.1deg at 0 0, #000 calc(var(--k-angle) + 0.2deg), transparent calc(var(--k-angle) + 0.2deg));
                will-change: transform;
            }
            .k-segment-inner {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
            }
            
            /* Animations-Klassen durch HTML Attribute gesteuert */
            .kaleido-container[data-spin="true"] {
                animation: k-spin var(--k-speed, 60s) linear infinite;
            }
            .kaleido-container[data-drift="true"] .k-segment-inner {
                animation: k-drift var(--k-flow, 15s) cubic-bezier(0.4, 0, 0.6, 1) infinite alternate;
            }
            
            @keyframes k-spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            @keyframes k-drift {
                0% { transform: rotate(0deg) translate(0, 0) scale(1); filter: hue-rotate(0deg); }
                100% { transform: rotate(45deg) translate(15vmax, 10vmax) scale(1.5); filter: hue-rotate(90deg); }
            }
        `;
        document.head.appendChild(style);
    }

    // 2. KaleidoText Klasse
    class KaleidoText {
        constructor(el) {
            this.el = el;

            // Setze CSS Variablen für Geschwindigkeit, falls benutzerdefiniert überschrieben
            if (this.el.hasAttribute('data-speed')) {
                this.el.style.setProperty('--k-speed', this.el.getAttribute('data-speed'));
            }
            if (this.el.hasAttribute('data-flow')) {
                this.el.style.setProperty('--k-flow', this.el.getAttribute('data-flow'));
            }

            this.originalHTML = this.el.innerHTML;
            this.centerEl = null;

            // Startaufbau mit den Segmenten
            this.updateSegments(parseInt(this.el.getAttribute('data-segments')) || 8);
        }

        updateSegments(n) {
            this.segments = n;
            const angle = 360 / this.segments;

            // clip-Winkel ans CSS durchreichen
            this.el.style.setProperty('--k-angle', `${angle}deg`);
            this.el.innerHTML = ''; // Inhalt aufräumen

            this.centerEl = document.createElement('div');
            this.centerEl.className = 'k-center';

            for (let i = 0; i < this.segments; i++) {
                const isMirrored = i % 2 !== 0;
                const scaleY = isMirrored ? -1 : 1;
                const rot = isMirrored ? (i + 1) * angle : i * angle;

                const segment = document.createElement('div');
                segment.className = 'k-segment';
                segment.style.transform = `rotate(${rot}deg) scaleY(${scaleY})`;

                const inner = document.createElement('div');
                inner.className = 'k-segment-inner';
                inner.innerHTML = this.originalHTML;

                segment.appendChild(inner);
                this.centerEl.appendChild(segment);
            }

            this.el.appendChild(this.centerEl);
        }
    }

    // Global als API verfügbar machen
    window.KaleidoText = KaleidoText;

    // Auto-Initialisierung aller vorhandenen .kaleido-container beim Laden
    function init() {
        const containers = document.querySelectorAll('.kaleido-container');
        window.kInstanzen = window.kInstanzen || [];
        containers.forEach(el => {
            if (!el._kaleidoInitialized) {
                window.kInstanzen.push(new KaleidoText(el));
                el._kaleidoInitialized = true;
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
