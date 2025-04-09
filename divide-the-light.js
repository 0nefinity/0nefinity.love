// divide-the-light.js

/* soll beim Laden der Seite den Hintergrund auf schwarz stellen. Und zwar so: Alles ist am Anfang weiß eingestellt.
 dann ein schwarzer schriftzug: ah we can't see
 dann verblasst es. Dann ein weiterer: divide the light!

 Dann geht der Hintergrund auf schwarz
 und zwar so eine schöne e funktion, die einen nicen verblassen effekt erzeugt.

 Alle anpassbaren Parameter sollen am anfang des Scriptes eingestellt werden können.
*/

// Konfigurierbare Parameter
const config = {
    initialDelay: 500,           // Verzögerung vor dem ersten Text in ms
    secondTextDelay: 1500,        // Verzögerung vor dem zweiten Text in ms
    textDuration: 1500,           // Dauer, wie lange die Texte angezeigt werden, bevor der Übergang beginnt
    backgroundTransitionDuration: 2000, // Dauer des Hintergrundübergangs in ms
    firstText: "ah we can't see",  // Erster Text
    secondText: "divide the light!" // Zweiter Text
};

// Speichere die ursprünglichen CSS-Werte
let originalStyles = {
    rootBgColor: null,
    bodyTextShadow: null
};

// Funktion zum Speichern der ursprünglichen Stile
function saveOriginalStyles() {
    const rootStyle = getComputedStyle(document.documentElement);
    originalStyles.rootBgColor = rootStyle.getPropertyValue('--bg-color').trim();

    const bodyStyle = getComputedStyle(document.body);
    originalStyles.bodyTextShadow = bodyStyle.textShadow;
}

// Funktion zum Erstellen und Anzeigen eines Textelements
function createTextElement(text, yOffset = 0) {
    const textElement = document.createElement('div');
    textElement.textContent = text;
    textElement.style.position = 'fixed';
    textElement.style.top = `calc(50% + ${yOffset}px)`;
    textElement.style.left = '50%';
    textElement.style.transform = 'translate(-50%, -50%)';
    textElement.style.color = '#000'; // Startet mit schwarzer Farbe
    textElement.style.fontSize = '2rem';
    textElement.style.fontFamily = 'Arial, sans-serif';
    textElement.style.opacity = '0';
    // Kurze Transition für das Einblenden
    textElement.style.transition = 'opacity 0.5s ease-in-out';
    textElement.style.zIndex = '9999'; // Hoher z-index, um über anderen Elementen zu sein
    document.body.appendChild(textElement);

    // Fade in
    setTimeout(() => {
        textElement.style.opacity = '1';
    }, 10);

    return textElement;
}

// E-Funktion für den Übergang (exponentieller Übergang)
function easeInExpo(t) {
    return t === 0 ? 0 : Math.pow(2, 10 * (t - 1));
}

// Funktion zum Ändern der Hintergrundfarbe mit einer E-Funktion
function changeBackgroundColor(duration) {
    const startTime = performance.now();
    const startColor = [255, 255, 255]; // Weiß
    const endColor = [0, 0, 0];         // Schwarz

    function updateBackground() {
        const currentTime = performance.now();
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Verwende die E-Funktion für einen schönen Übergang
        const easeProgress = easeInExpo(progress);

        // Berechne die aktuelle Farbe
        const r = Math.round(startColor[0] - easeProgress * (startColor[0] - endColor[0]));
        const g = Math.round(startColor[1] - easeProgress * (startColor[1] - endColor[1]));
        const b = Math.round(startColor[2] - easeProgress * (startColor[2] - endColor[2]));

        // Setze die Hintergrundfarbe des Body und die CSS-Variable
        document.body.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
        document.documentElement.style.setProperty('--bg-color', `rgb(${r}, ${g}, ${b})`);

        // Wenn der Übergang abgeschlossen ist
        if (progress >= 1) {
            // Setze den Textschatten zurück
            document.body.style.textShadow = originalStyles.bodyTextShadow;

            // Mache die Steuerelemente wieder sichtbar
            const controls = document.querySelector('header.controls');
            if (controls) {
                controls.style.visibility = 'visible';
            }
        } else {
            requestAnimationFrame(updateBackground);
        }
    }

    requestAnimationFrame(updateBackground);
}

// Funktion zum Setzen des weißen Anfangszustands
function setInitialWhiteState() {
    // Speichere die ursprünglichen Stile
    saveOriginalStyles();

    // Setze den Hintergrund auf weiß
    document.documentElement.style.setProperty('--bg-color', 'white');
    document.body.style.backgroundColor = 'white';

    // Deaktiviere den Textschatten
    document.body.style.textShadow = 'none';

    // Verstecke die Steuerelemente vorübergehend
    const controls = document.querySelector('header.controls');
    if (controls) {
        controls.style.visibility = 'hidden';
    }
}

// Hauptfunktion, die die Sequenz ausführt
function runSequence() {
    // Setze den Anfangszustand auf komplett weiß
    setInitialWhiteState();

    let firstTextElement, secondTextElement;

    // Erster Text: "ah we can't see"
    setTimeout(() => {
        // Erstelle den ersten Text
        firstTextElement = createTextElement(config.firstText, -30); // Leicht nach oben versetzt

        // Zweiter Text: "divide the light!" (erscheint unter dem ersten)
        setTimeout(() => {
            // Erstelle den zweiten Text
            secondTextElement = createTextElement(config.secondText, 30); // Leicht nach unten versetzt

            // Starte den Hintergrundübergang nach einer Verzögerung
            setTimeout(() => {
                // Starte den Hintergrundübergang
                changeBackgroundColor(config.backgroundTransitionDuration);

                // Stelle sicher, dass beide Texte die gleiche Transition haben
                firstTextElement.style.transition = `opacity ${config.backgroundTransitionDuration}ms ease-in-out`;
                secondTextElement.style.transition = `opacity ${config.backgroundTransitionDuration}ms ease-in-out`;

                // Blende beide Texte gleichzeitig aus
                firstTextElement.style.opacity = '0';
                secondTextElement.style.opacity = '0';

                // Entferne die Textelemente nach dem Ausblenden
                setTimeout(() => {
                    firstTextElement.remove();
                    secondTextElement.remove();
                }, config.backgroundTransitionDuration);

            }, config.textDuration);

        }, config.secondTextDelay);

    }, config.initialDelay);
}

// Führe die Sequenz aus, wenn das Dokument geladen ist
document.addEventListener('DOMContentLoaded', runSequence);
