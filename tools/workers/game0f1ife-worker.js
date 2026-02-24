/**
 * Game of Life Web Worker
 * Führt die Simulation in einem separaten Thread aus,
 * damit das UI flüssig bleibt.
 */

// === KOORDINATEN-SYSTEM (muss mit Hauptthread übereinstimmen) ===
const COORD_OFFSET = 0x100000;  // 2^20
const COORD_RANGE = 0x200000;   // 2^21

function cellKey(x, y) {
    return (x + COORD_OFFSET) + (y + COORD_OFFSET) * COORD_RANGE;
}

function parseKey(key) {
    const xOffset = key % COORD_RANGE;
    const yOffset = Math.floor(key / COORD_RANGE);
    return [xOffset - COORD_OFFSET, yOffset - COORD_OFFSET];
}

// === SIMULATION STATE ===
let cells = new Set();
let config = {
    birthCount: 3,
    survivalMin: 2,
    survivalMax: 3,
    spontaneousLife: 0.001,
    randomDeath: 0.000,
};
let viewport = { x: 0, y: 0, cols: 100, rows: 100 };

// === BATCH-NACHBAR-COUNTING ALGORITHMUS ===
function nextGeneration() {
    const neighborCount = new Map();
    
    // Phase 1: Für jede lebende Zelle, inkrementiere Count bei allen 8 Nachbarn
    for (const key of cells) {
        const [x, y] = parseKey(key);
        
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nkey = cellKey(x + dx, y + dy);
                neighborCount.set(nkey, (neighborCount.get(nkey) || 0) + 1);
            }
        }
    }
    
    // Phase 2: Entscheide für jede relevante Zelle ob sie lebt
    const newCells = new Set();
    
    for (const [key, count] of neighborCount) {
        const alive = cells.has(key);
        let willLive = false;
        
        if (alive) {
            willLive = count >= config.survivalMin && count <= config.survivalMax;
        } else {
            willLive = count === config.birthCount;
        }
        
        if (!willLive && Math.random() < config.spontaneousLife) {
            willLive = true;
        }
        if (willLive && Math.random() < config.randomDeath) {
            willLive = false;
        }
        
        if (willLive) {
            newCells.add(key);
        }
    }
    
    // Phase 3: Lebende Zellen mit 0 Nachbarn
    for (const key of cells) {
        if (!neighborCount.has(key)) {
            if (Math.random() < config.spontaneousLife) {
                newCells.add(key);
            }
        }
    }

    // Spontanes Leben im Viewport
    const totalCells = viewport.cols * viewport.rows;
    const expectedCount = Math.min(totalCells * config.spontaneousLife, 1000);
    const actualCount = Math.floor(expectedCount) + (Math.random() < (expectedCount % 1) ? 1 : 0);

    for (let i = 0; i < actualCount; i++) {
        const col = Math.floor(Math.random() * viewport.cols);
        const row = Math.floor(Math.random() * viewport.rows);
        const x = Math.floor(viewport.x + col);
        const y = Math.floor(viewport.y + row);
        newCells.add(cellKey(x, y));
    }

    cells = newCells;
}

// === MESSAGE HANDLING ===
self.onmessage = function(e) {
    const { type, data } = e.data;
    
    switch (type) {
        case 'init':
            cells = new Set(data.cells);
            config = { ...config, ...data.config };
            viewport = { ...viewport, ...data.viewport };
            break;
            
        case 'config':
            config = { ...config, ...data };
            break;
            
        case 'viewport':
            viewport = { ...viewport, ...data };
            break;
            
        case 'step':
            nextGeneration();
            self.postMessage({
                type: 'cells',
                cells: Array.from(cells),
                generation: data.generation + 1
            });
            break;
            
        case 'setCell':
            const key = cellKey(data.x, data.y);
            if (data.alive) {
                cells.add(key);
            } else {
                cells.delete(key);
            }
            break;
            
        case 'setCells':
            for (const [x, y] of data.positions) {
                cells.add(cellKey(x, y));
            }
            break;
            
        case 'clear':
            cells.clear();
            break;
            
        case 'getCells':
            self.postMessage({
                type: 'cells',
                cells: Array.from(cells),
                generation: data.generation
            });
            break;
    }
};

