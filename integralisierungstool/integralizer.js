// Integralisierungstool - Main JavaScript
// Canvas und Kontext
const canvas = document.getElementById('integralizer-canvas');
const ctx = canvas.getContext('2d');
const textInput = document.getElementById('text-input');

// Konstanten
const BUTTON_SIZE = 0.15; // Relativ zum Kreis-Radius
const MIN_CIRCLE_RADIUS = 20;
const MAX_CIRCLE_RADIUS = 500;
const DRAG_THRESHOLD = 5; // Pixel-Bewegung für Drag-Detection
const BUTTON_RADIUS_MIN = 8;
const BUTTON_RADIUS_MAX = 15;

// State Machine
const STATE = {
    IDLE: 'idle',
    DRAGGING: 'dragging',
    RESIZING: 'resizing',
    EDITING: 'editing'
};

// Globale Variablen
let width, height;
let scale = 1;
let currentState = STATE.IDLE;
let selectedElement = null;
let hoveredElement = null;
let hoveredButton = null;
let isDirty = true; // Rendering Flag

// Interaction State
let pointerDownPos = null;
let pointerDownElement = null;
let dragOffset = { x: 0, y: 0 };
let hasMoved = false;

// Datenstruktur
let rootCircle = null;
let allElements = [];
let nextId = 1;

// Element-Typen
class Circle {
    constructor(x, y, radius, text = '', parent = null) {
        this.id = nextId++;
        this.type = 'circle';
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.text = text;
        this.parent = parent;
        this.children = [];
        this.textElements = []; // Freie Text-Elemente innerhalb des Kreises
    }

    addChild(circle) {
        this.children.push(circle);
        circle.parent = this;
    }

    removeChild(circle) {
        const index = this.children.indexOf(circle);
        if (index > -1) {
            this.children.splice(index, 1);
        }
    }

    addTextElement(textEl) {
        this.textElements.push(textEl);
        textEl.parent = this;
    }

    removeTextElement(textEl) {
        const index = this.textElements.indexOf(textEl);
        if (index > -1) {
            this.textElements.splice(index, 1);
        }
    }
}

class TextElement {
    constructor(x, y, text = '', parent = null) {
        this.id = nextId++;
        this.type = 'text';
        this.x = x;
        this.y = y;
        this.text = text;
        this.parent = parent;
        this.fontSize = 16;
    }
}

// Initialisierung
function init() {
    resizeCanvas();

    // Debounced Resize
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            resizeCanvas();
            markDirty();
        }, 100);
    });

    // Erstelle Root-Kreis mit "You" Text außerhalb
    const centerX = width / 2;
    const centerY = height / 2;
    const rootRadius = Math.min(width, height) * 0.2;

    rootCircle = new Circle(centerX, centerY, rootRadius, '');

    // "You" Text außerhalb
    const youText = new TextElement(centerX, centerY - rootRadius - 40, 'You', null);
    youText.fontSize = 24;

    allElements = [rootCircle, youText];

    // Pointer Events (unterstützt Touch + Mouse)
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerUp);

    // Verhindere Context Menu
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    // Text Input
    textInput.addEventListener('blur', handleTextInputBlur);
    textInput.addEventListener('keydown', handleTextInputKeydown);

    // Control Panel Buttons
    document.getElementById('reset-btn').addEventListener('click', reset);
    document.getElementById('copy-url-btn').addEventListener('click', copyURL);

    // URL laden wenn vorhanden
    loadFromURL();

    // Start rendering loop
    startRenderLoop();
}

// Dirty Flag System
function markDirty() {
    isDirty = true;
}

function startRenderLoop() {
    function loop() {
        if (isDirty) {
            render();
            isDirty = false;
        }
        requestAnimationFrame(loop);
    }
    loop();
}

// Canvas Resize
function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    width = window.innerWidth;
    height = window.innerHeight;

    // High-DPI Support
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.scale(dpr, dpr);

    scale = Math.min(width, height) / 1000;
}

// Rendering
function render() {
    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Zeichne alle Elemente
    renderCircle(rootCircle);

    // Zeichne freie Text-Elemente (die keinen Parent haben)
    allElements.forEach(el => {
        if (el.type === 'text' && !el.parent) {
            renderText(el);
        }
    });

    // Zeichne Buttons für selektierte freie Texte
    if (selectedElement?.type === 'text' && !selectedElement.parent) {
        renderTextButtons(selectedElement);
    }
}

function renderTextButtons(textEl) {
    ctx.save();
    ctx.font = `${textEl.fontSize}px Verdana`;
    const metrics = ctx.measureText(textEl.text);
    const textWidth = metrics.width;

    // X-Button (rechts)
    const deleteBtn = {
        x: textEl.x + textWidth / 2 + 15,
        y: textEl.y,
        radius: 10,
        type: 'delete'
    };
    renderDeleteButton(deleteBtn.x, deleteBtn.y, deleteBtn.radius);

    // Größen-Buttons (oben und unten)
    const plusBtn = {
        x: textEl.x,
        y: textEl.y - textEl.fontSize - 10,
        radius: 8,
        type: 'textsize',
        symbol: '+'
    };
    const minusBtn = {
        x: textEl.x,
        y: textEl.y + textEl.fontSize + 10,
        radius: 8,
        type: 'textsize',
        symbol: '-'
    };

    renderTextSizeButton(plusBtn.x, plusBtn.y, plusBtn.radius, '+');
    renderTextSizeButton(minusBtn.x, minusBtn.y, minusBtn.radius, '-');

    ctx.restore();
}

function renderCircle(circle) {
    // Schatten für Tiefe
    ctx.shadowColor = 'rgba(255, 255, 255, 0.1)';
    ctx.shadowBlur = 5;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    // Kreis zeichnen
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(circle.x, circle.y, circle.radius, 0, Math.PI * 2);
    ctx.stroke();

    // Schatten zurücksetzen
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Highlight wenn selektiert
    if (selectedElement === circle) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(circle.x, circle.y, circle.radius + 3, 0, Math.PI * 2);
        ctx.stroke();
    }

    // Kreis-Text (zentriert)
    if (circle.text) {
        ctx.fillStyle = 'white';
        ctx.font = `${Math.max(12, circle.radius * 0.2)}px Verdana`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Text-Schatten für bessere Lesbarkeit
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 3;
        ctx.fillText(circle.text, circle.x, circle.y);

        // Schatten zurücksetzen
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
    }

    // Buttons zeichnen (wenn selektiert oder gehovered)
    if (selectedElement === circle || hoveredButton?.circle === circle) {
        renderButtons(circle);
    }

    // Text-Elemente innerhalb des Kreises
    circle.textElements.forEach(textEl => {
        renderText(textEl);
    });

    // Rekursiv Kinder zeichnen
    circle.children.forEach(child => {
        renderCircle(child);
    });
}

function renderText(textEl) {
    ctx.fillStyle = 'white';
    ctx.font = `${textEl.fontSize}px Verdana`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Text-Schatten für bessere Lesbarkeit
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 3;
    ctx.fillText(textEl.text, textEl.x, textEl.y);

    // Schatten zurücksetzen
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    // Highlight wenn selektiert
    if (selectedElement === textEl) {
        const metrics = ctx.measureText(textEl.text);
        const textWidth = metrics.width;
        const textHeight = textEl.fontSize;

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(
            textEl.x - textWidth / 2 - 4,
            textEl.y - textHeight / 2 - 2,
            textWidth + 8,
            textHeight + 4
        );

        // X-Button für Text wird separat gerendert
    }
}

function renderButtons(circle) {
    const buttonRadius = Math.max(12, circle.radius * BUTTON_SIZE);
    const offset = circle.radius + buttonRadius + 5;

    // Plus-Button (oben)
    const plusX = circle.x;
    const plusY = circle.y - offset;
    renderPlusButton(plusX, plusY, buttonRadius);

    // Tt-Button (rechts)
    const ttX = circle.x + offset;
    const ttY = circle.y;
    renderTtButton(ttX, ttY, buttonRadius);

    // X-Button (links)
    const xX = circle.x - offset;
    const xY = circle.y;
    renderDeleteButton(xX, xY, buttonRadius);

    // Resize-Handle (unten rechts)
    const resizeX = circle.x + circle.radius * 0.7;
    const resizeY = circle.y + circle.radius * 0.7;
    renderResizeHandle(resizeX, resizeY, buttonRadius * 0.8);
}

function renderPlusButton(x, y, radius) {
    const isHovered = hoveredButton?.type === 'plus' &&
                      hoveredButton.x === x && hoveredButton.y === y;

    ctx.save();
    ctx.fillStyle = isHovered ? 'white' : 'black';
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Plus-Symbol
    ctx.strokeStyle = isHovered ? 'black' : 'white';
    ctx.lineWidth = 2;
    const size = radius * 0.6;
    ctx.beginPath();
    ctx.moveTo(x - size, y);
    ctx.lineTo(x + size, y);
    ctx.moveTo(x, y - size);
    ctx.lineTo(x, y + size);
    ctx.stroke();
    ctx.restore();
}

function renderTtButton(x, y, radius) {
    const isHovered = hoveredButton?.type === 'tt' &&
                      hoveredButton.x === x && hoveredButton.y === y;

    ctx.save();
    ctx.fillStyle = isHovered ? 'white' : 'black';
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Tt-Symbol
    ctx.fillStyle = isHovered ? 'black' : 'white';
    ctx.font = `${radius * 1.2}px Verdana`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Tt', x, y);
    ctx.restore();
}

function renderDeleteButton(x, y, radius) {
    const isHovered = hoveredButton?.type === 'delete' &&
                      hoveredButton.x === x && hoveredButton.y === y;

    ctx.save();
    ctx.fillStyle = isHovered ? 'white' : 'black';
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // X-Symbol
    ctx.strokeStyle = isHovered ? 'black' : 'white';
    ctx.lineWidth = 2;
    const size = radius * 0.5;
    ctx.beginPath();
    ctx.moveTo(x - size, y - size);
    ctx.lineTo(x + size, y + size);
    ctx.moveTo(x + size, y - size);
    ctx.lineTo(x - size, y + size);
    ctx.stroke();
    ctx.restore();
}

function renderResizeHandle(x, y, radius) {
    const isHovered = hoveredButton?.type === 'resize' &&
                      hoveredButton.x === x && hoveredButton.y === y;

    ctx.save();
    ctx.fillStyle = isHovered ? 'white' : 'black';
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Resize-Symbol (kleiner Kreis)
    ctx.strokeStyle = isHovered ? 'black' : 'white';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}

function renderTextSizeButton(x, y, radius, symbol) {
    const isHovered = hoveredButton?.type === 'textsize' &&
                      hoveredButton.symbol === symbol &&
                      hoveredButton.x === x && hoveredButton.y === y;

    ctx.save();
    ctx.fillStyle = isHovered ? 'white' : 'black';
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Symbol
    ctx.fillStyle = isHovered ? 'black' : 'white';
    ctx.font = `${radius * 1.5}px Verdana`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(symbol, x, y);
    ctx.restore();
}

// Hilfsfunktionen für Kollisionserkennung
function getElementAtPosition(x, y) {
    // Prüfe Buttons zuerst (wenn ein Kreis selektiert ist)
    if (selectedElement?.type === 'circle') {
        const button = getButtonAtPosition(selectedElement, x, y);
        if (button) return button;
    }

    // Prüfe Buttons für selektierte freie Texte
    if (selectedElement?.type === 'text' && !selectedElement.parent) {
        const metrics = ctx.measureText(selectedElement.text);
        const textWidth = metrics.width;

        // Delete-Button
        const deleteX = selectedElement.x + textWidth / 2 + 15;
        const deleteY = selectedElement.y;
        if (Math.hypot(x - deleteX, y - deleteY) <= 10) {
            return { type: 'delete', element: selectedElement };
        }

        // Größen-Buttons
        const plusX = selectedElement.x;
        const plusY = selectedElement.y - selectedElement.fontSize - 10;
        if (Math.hypot(x - plusX, y - plusY) <= 8) {
            return { type: 'textsize', element: selectedElement, symbol: '+', x: plusX, y: plusY };
        }

        const minusX = selectedElement.x;
        const minusY = selectedElement.y + selectedElement.fontSize + 10;
        if (Math.hypot(x - minusX, y - minusY) <= 8) {
            return { type: 'textsize', element: selectedElement, symbol: '-', x: minusX, y: minusY };
        }
    }

    // Prüfe alle Kreise (von innen nach außen, damit innere Kreise Priorität haben)
    const circles = getAllCircles();
    for (let i = circles.length - 1; i >= 0; i--) {
        const circle = circles[i];
        const dist = Math.hypot(x - circle.x, y - circle.y);
        if (dist <= circle.radius) {
            return circle;
        }
    }

    // Prüfe Text-Elemente
    for (let i = allElements.length - 1; i >= 0; i--) {
        const el = allElements[i];
        if (el.type === 'text') {
            const metrics = ctx.measureText(el.text);
            const textWidth = metrics.width;
            const textHeight = el.fontSize;

            if (x >= el.x - textWidth / 2 && x <= el.x + textWidth / 2 &&
                y >= el.y - textHeight / 2 && y <= el.y + textHeight / 2) {
                return el;
            }
        }
    }

    return null;
}

function getButtonAtPosition(circle, x, y) {
    const buttonRadius = Math.max(BUTTON_RADIUS_MIN, Math.min(BUTTON_RADIUS_MAX, circle.radius * BUTTON_SIZE));
    const offset = circle.radius + buttonRadius + 5;

    // Plus-Button (oben)
    const plusX = circle.x;
    const plusY = circle.y - offset;
    if (Math.hypot(x - plusX, y - plusY) <= buttonRadius) {
        return { type: 'plus', circle, x: plusX, y: plusY, radius: buttonRadius };
    }

    // Tt-Button (rechts)
    const ttX = circle.x + offset;
    const ttY = circle.y;
    if (Math.hypot(x - ttX, y - ttY) <= buttonRadius) {
        return { type: 'tt', circle, x: ttX, y: ttY, radius: buttonRadius };
    }

    // X-Button (links)
    const xX = circle.x - offset;
    const xY = circle.y;
    if (Math.hypot(x - xX, y - xY) <= buttonRadius) {
        return { type: 'delete', circle, x: xX, y: xY, radius: buttonRadius };
    }

    // Resize-Handle (unten rechts)
    const resizeX = circle.x + circle.radius * 0.7;
    const resizeY = circle.y + circle.radius * 0.7;
    const resizeRadius = buttonRadius * 0.8;
    if (Math.hypot(x - resizeX, y - resizeY) <= resizeRadius) {
        return { type: 'resize', circle, x: resizeX, y: resizeY, radius: resizeRadius };
    }

    return null;
}

function getTextButtonAtPosition(textEl, x, y) {
    ctx.save();
    ctx.font = `${textEl.fontSize}px Verdana`;
    const metrics = ctx.measureText(textEl.text);
    const textWidth = metrics.width;
    ctx.restore();

    // Delete-Button (rechts)
    const deleteX = textEl.x + textWidth / 2 + 15;
    const deleteY = textEl.y;
    if (Math.hypot(x - deleteX, y - deleteY) <= 10) {
        return { type: 'delete', element: textEl, x: deleteX, y: deleteY, radius: 10 };
    }

    // Plus-Button (oben)
    const plusX = textEl.x;
    const plusY = textEl.y - textEl.fontSize - 10;
    if (Math.hypot(x - plusX, y - plusY) <= 8) {
        return { type: 'textsize', element: textEl, symbol: '+', x: plusX, y: plusY, radius: 8 };
    }

    // Minus-Button (unten)
    const minusX = textEl.x;
    const minusY = textEl.y + textEl.fontSize + 10;
    if (Math.hypot(x - minusX, y - minusY) <= 8) {
        return { type: 'textsize', element: textEl, symbol: '-', x: minusX, y: minusY, radius: 8 };
    }

    return null;
}

function getAllCircles() {
    const circles = [];
    function traverse(circle) {
        circles.push(circle);
        circle.children.forEach(child => traverse(child));
    }
    traverse(rootCircle);
    return circles;
}

function getAllTextElements() {
    const texts = [];
    allElements.forEach(el => {
        if (el.type === 'text') texts.push(el);
    });
    getAllCircles().forEach(circle => {
        circle.textElements.forEach(textEl => texts.push(textEl));
    });
    return texts;
}

// ============================================================================
// EVENT HANDLERS - Pointer Events (Touch + Mouse unified)
// ============================================================================

function handlePointerDown(e) {
    e.preventDefault();

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Speichere Start-Position für Drag-Detection
    pointerDownPos = { x, y };
    hasMoved = false;

    // Finde Element an Position
    const element = getElementAtPosition(x, y);
    pointerDownElement = element;

    // Button-Klick → Wird in pointerUp behandelt
    if (element && isButton(element)) {
        hoveredButton = element;
        markDirty();
        return;
    }

    // Element-Selektion
    if (element && (element.type === 'circle' || element.type === 'text')) {
        selectedElement = element;
        dragOffset.x = x - element.x;
        dragOffset.y = y - element.y;
        currentState = STATE.IDLE; // Noch kein Drag
        markDirty();
    } else {
        // Klick ins Leere → Deselektieren
        selectedElement = null;
        hideTextInput();
        currentState = STATE.IDLE;
        markDirty();
    }
}

function isButton(element) {
    return element && (
        element.type === 'plus' ||
        element.type === 'tt' ||
        element.type === 'delete' ||
        element.type === 'resize' ||
        element.type === 'textsize'
    );
}

function handlePointerMove(e) {
    e.preventDefault();

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Drag-Detection
    if (pointerDownPos && !hasMoved) {
        const dx = x - pointerDownPos.x;
        const dy = y - pointerDownPos.y;
        const distance = Math.hypot(dx, dy);

        if (distance > DRAG_THRESHOLD) {
            hasMoved = true;

            // Start Dragging oder Resizing
            if (pointerDownElement?.type === 'resize') {
                currentState = STATE.RESIZING;
            } else if (selectedElement && !isButton(pointerDownElement)) {
                currentState = STATE.DRAGGING;
            }
        }
    }

    // State-basierte Aktionen
    switch (currentState) {
        case STATE.DRAGGING:
            if (selectedElement) {
                selectedElement.x = x - dragOffset.x;
                selectedElement.y = y - dragOffset.y;
                markDirty();
            }
            break;

        case STATE.RESIZING:
            if (pointerDownElement?.circle) {
                const circle = pointerDownElement.circle;
                const dist = Math.hypot(x - circle.x, y - circle.y);
                circle.radius = Math.max(MIN_CIRCLE_RADIUS, Math.min(MAX_CIRCLE_RADIUS, dist));
                markDirty();
            }
            break;

        case STATE.IDLE:
            // Update Hover-State
            updateHoverState(x, y);
            break;
    }

    // Cursor Update
    updateCursor();
}

function updateHoverState(x, y) {
    const oldHovered = hoveredButton;

    // Prüfe Buttons
    if (selectedElement?.type === 'circle') {
        hoveredButton = getButtonAtPosition(selectedElement, x, y);
    } else if (selectedElement?.type === 'text' && !selectedElement.parent) {
        hoveredButton = getTextButtonAtPosition(selectedElement, x, y);
    } else {
        hoveredButton = null;
    }

    // Nur neu zeichnen wenn sich Hover geändert hat
    if (oldHovered !== hoveredButton) {
        markDirty();
    }
}

function updateCursor() {
    if (currentState === STATE.DRAGGING) {
        canvas.style.cursor = 'move';
    } else if (currentState === STATE.RESIZING) {
        canvas.style.cursor = 'nwse-resize';
    } else if (hoveredButton) {
        canvas.style.cursor = 'pointer';
    } else if (hoveredElement) {
        canvas.style.cursor = 'pointer';
    } else {
        canvas.style.cursor = 'default';
    }
}

function handlePointerUp(e) {
    e.preventDefault();

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Button-Klick (nur wenn nicht gedragged wurde)
    if (!hasMoved && hoveredButton) {
        handleButtonClick(hoveredButton);
        hoveredButton = null;
        pointerDownPos = null;
        pointerDownElement = null;
        currentState = STATE.IDLE;
        markDirty();
        return;
    }

    // Click (nur wenn nicht gedragged wurde)
    if (!hasMoved && pointerDownElement) {
        if (pointerDownElement.type === 'circle' || pointerDownElement.type === 'text') {
            // Doppelklick-Simulation für Text-Edit
            if (selectedElement === pointerDownElement) {
                showTextInput(pointerDownElement);
            }
        }
    }

    // Reset State
    pointerDownPos = null;
    pointerDownElement = null;
    hasMoved = false;
    currentState = STATE.IDLE;
    updateCursor();
    markDirty();
}

function handleButtonClick(button) {
    if (!button) return;

    switch (button.type) {
        case 'plus':
            addChildCircle(button.circle);
            break;

        case 'tt':
            addTextElement(button.circle);
            break;

        case 'delete':
            const toDelete = button.circle || button.element;
            deleteElement(toDelete);
            break;

        case 'resize':
            // Resize wird über Drag gehandelt
            break;

        case 'textsize':
            if (button.element) {
                if (button.symbol === '+') {
                    button.element.fontSize = Math.min(48, button.element.fontSize + 2);
                } else {
                    button.element.fontSize = Math.max(8, button.element.fontSize - 2);
                }
                markDirty();
            }
            break;
    }
}

// ============================================================================
// ACTIONS - Element Manipulation
// ============================================================================

function addChildCircle(parentCircle) {
    const childRadius = parentCircle.radius * 0.35;

    // Finde Position für neuen Kreis (Auto-Layout)
    const angle = (parentCircle.children.length * Math.PI * 2) / Math.max(1, parentCircle.children.length + 1);
    const distance = parentCircle.radius * 0.55;

    const childX = parentCircle.x + Math.cos(angle) * distance;
    const childY = parentCircle.y + Math.sin(angle) * distance;

    const newCircle = new Circle(childX, childY, childRadius, '', parentCircle);
    parentCircle.addChild(newCircle);
    allElements.push(newCircle);

    selectedElement = newCircle;

    // Auto-Layout für alle Kinder
    autoLayoutChildren(parentCircle);

    markDirty();

    // Zeige Text-Input direkt
    setTimeout(() => showTextInput(newCircle), 100);
}

function addTextElement(parentCircle) {
    const textX = parentCircle.x;
    const textY = parentCircle.y + parentCircle.radius * 0.3;

    const newText = new TextElement(textX, textY, 'Text', parentCircle);
    parentCircle.addTextElement(newText);
    allElements.push(newText);

    selectedElement = newText;
    markDirty();

    setTimeout(() => showTextInput(newText), 100);
}

function deleteElement(element) {
    if (element === rootCircle) {
        alert('Der Hauptkreis kann nicht gelöscht werden!');
        return;
    }

    if (element.type === 'circle') {
        // Entferne aus Parent
        if (element.parent) {
            element.parent.removeChild(element);
        }

        // Entferne aus allElements
        const index = allElements.indexOf(element);
        if (index > -1) {
            allElements.splice(index, 1);
        }

        // Entferne alle Kinder rekursiv
        function removeChildren(circle) {
            circle.children.forEach(child => {
                removeChildren(child);
                const idx = allElements.indexOf(child);
                if (idx > -1) allElements.splice(idx, 1);
            });
        }
        removeChildren(element);

    } else if (element.type === 'text') {
        // Entferne aus Parent
        if (element.parent) {
            element.parent.removeTextElement(element);
        }

        // Entferne aus allElements
        const index = allElements.indexOf(element);
        if (index > -1) {
            allElements.splice(index, 1);
        }
    }

    selectedElement = null;
    markDirty();
}

// Auto-Layout für Kinder-Kreise
function autoLayoutChildren(parentCircle) {
    const children = parentCircle.children;
    if (children.length === 0) return;

    const angleStep = (Math.PI * 2) / children.length;
    const distance = parentCircle.radius * 0.55;

    children.forEach((child, index) => {
        const angle = index * angleStep - Math.PI / 2; // Start oben
        child.x = parentCircle.x + Math.cos(angle) * distance;
        child.y = parentCircle.y + Math.sin(angle) * distance;
    });

    markDirty();
}

// Kollisionsvermeidung (einfache Version)
function avoidOverlaps() {
    const circles = getAllCircles();
    const iterations = 5;

    for (let iter = 0; iter < iterations; iter++) {
        for (let i = 0; i < circles.length; i++) {
            for (let j = i + 1; j < circles.length; j++) {
                const c1 = circles[i];
                const c2 = circles[j];

                // Überspringe Parent-Child Beziehungen
                if (c1.parent === c2 || c2.parent === c1) continue;

                const dx = c2.x - c1.x;
                const dy = c2.y - c1.y;
                const dist = Math.hypot(dx, dy);
                const minDist = c1.radius + c2.radius + 10; // 10px Abstand

                if (dist < minDist && dist > 0) {
                    const overlap = minDist - dist;
                    const angle = Math.atan2(dy, dx);

                    // Verschiebe beide Kreise auseinander
                    c1.x -= Math.cos(angle) * overlap * 0.5;
                    c1.y -= Math.sin(angle) * overlap * 0.5;
                    c2.x += Math.cos(angle) * overlap * 0.5;
                    c2.y += Math.sin(angle) * overlap * 0.5;
                }
            }
        }
    }
}

// ============================================================================
// TEXT INPUT HANDLING
// ============================================================================

function showTextInput(element) {
    currentState = STATE.EDITING;

    const currentText = element.text || '';

    textInput.value = currentText;
    textInput.style.display = 'block';
    textInput.style.left = element.x + 'px';
    textInput.style.top = element.y + 'px';

    if (element.type === 'text') {
        textInput.style.fontSize = element.fontSize + 'px';
    } else {
        textInput.style.fontSize = Math.max(12, element.radius * 0.2) + 'px';
    }

    textInput.focus();
    textInput.select();

    // Speichere Referenz zum bearbeiteten Element
    textInput.dataset.elementId = element.id;
}

function hideTextInput() {
    textInput.style.display = 'none';
    textInput.value = '';
    delete textInput.dataset.elementId;

    if (currentState === STATE.EDITING) {
        currentState = STATE.IDLE;
    }
}

function handleTextInputBlur() {
    const elementId = parseInt(textInput.dataset.elementId);
    if (!elementId) return;

    const element = allElements.find(el => el.id === elementId);
    if (element) {
        element.text = textInput.value;
        markDirty();
    }

    hideTextInput();
}

function handleTextInputKeydown(e) {
    if (e.key === 'Enter') {
        textInput.blur();
    } else if (e.key === 'Escape') {
        hideTextInput();
    }
}

// URL Serialisierung
function serializeToURL() {
    const data = {
        root: serializeCircle(rootCircle),
        freeTexts: allElements.filter(el => el.type === 'text' && !el.parent).map(serializeText)
    };

    const json = JSON.stringify(data);
    const encoded = btoa(encodeURIComponent(json));

    const url = window.location.origin + window.location.pathname + '?data=' + encoded;
    return url;
}

function serializeCircle(circle) {
    return {
        x: circle.x,
        y: circle.y,
        radius: circle.radius,
        text: circle.text,
        children: circle.children.map(serializeCircle),
        textElements: circle.textElements.map(serializeText)
    };
}

function serializeText(textEl) {
    return {
        x: textEl.x,
        y: textEl.y,
        text: textEl.text,
        fontSize: textEl.fontSize
    };
}

function loadFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const dataParam = urlParams.get('data');

    if (!dataParam) return;

    try {
        const json = decodeURIComponent(atob(dataParam));
        const data = JSON.parse(json);

        // Lade Root-Kreis
        rootCircle = deserializeCircle(data.root, null);

        // Lade freie Texte
        const freeTexts = data.freeTexts.map(t => deserializeText(t, null));

        allElements = [rootCircle, ...getAllCircles().slice(1), ...freeTexts];

    } catch (error) {
        console.error('Fehler beim Laden der URL-Daten:', error);
    }
}

function deserializeCircle(data, parent) {
    const circle = new Circle(data.x, data.y, data.radius, data.text, parent);

    // Lade Kinder
    if (data.children) {
        data.children.forEach(childData => {
            const child = deserializeCircle(childData, circle);
            circle.children.push(child);
        });
    }

    // Lade Text-Elemente
    if (data.textElements) {
        data.textElements.forEach(textData => {
            const textEl = deserializeText(textData, circle);
            circle.textElements.push(textEl);
        });
    }

    return circle;
}

function deserializeText(data, parent) {
    const textEl = new TextElement(data.x, data.y, data.text, parent);
    textEl.fontSize = data.fontSize || 16;
    return textEl;
}

function copyURL() {
    const url = serializeToURL();

    navigator.clipboard.writeText(url).then(() => {
        alert('URL in Zwischenablage kopiert!');
    }).catch(err => {
        console.error('Fehler beim Kopieren:', err);
        // Fallback: Zeige URL in Prompt
        prompt('URL kopieren:', url);
    });
}

function reset() {
    if (!confirm('Wirklich alles zurücksetzen?')) return;

    // Entferne URL-Parameter
    window.history.replaceState({}, document.title, window.location.pathname);

    // Reset State
    nextId = 1;
    selectedElement = null;
    hoveredButton = null;
    hoveredElement = null;
    currentState = STATE.IDLE;
    pointerDownPos = null;
    pointerDownElement = null;
    hasMoved = false;

    // Verstecke Text-Input
    hideTextInput();

    // Neu initialisieren
    const centerX = width / 2;
    const centerY = height / 2;
    const rootRadius = Math.min(width, height) * 0.2;

    rootCircle = new Circle(centerX, centerY, rootRadius, '');

    const youText = new TextElement(centerX, centerY - rootRadius - 40, 'You', null);
    youText.fontSize = 24;

    allElements = [rootCircle, youText];

    markDirty();
}

// Start
init();

