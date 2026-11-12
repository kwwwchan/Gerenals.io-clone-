const canvas = document.getElementById("GameCanvas");
const ctx = canvas.getContext("2d");

const socket = io();

let map = null;
const CELL_SIZE = 28;
let assetsReady = false;

let selectedCell = null; // Local visual tracking: { row, col }
let myPlayerId = null;   // Stored player ID given by the server ('p1', 'p2', etc.)
let gameWinner = null;

// --- MOVE QUEUE -------------------------------------------------------------
// Moves are not instant: the server only accepts one move per MOVE_DURATION_MS
// per player. The player can still chain many moves locally — they are drawn as
// a path of arrows — and they get dispatched to the server one at a time,
// each after the previous one was acknowledged.
const MOVE_DURATION_MS = 500;    // must match the server's cooldown
const MOVE_SEND_BUFFER_MS = 60;  // extra pacing so we never arrive early
const MAX_QUEUED_MOVES = 32;

let moveQueue = [];      // moves waiting to be sent
let pendingMove = null;  // move already sent, waiting for the server's ack
let lastDispatchAt = 0;
let dispatchTimer = null;

function clearMoveQueue() {
    moveQueue = [];
    if (dispatchTimer !== null) {
        clearTimeout(dispatchTimer);
        dispatchTimer = null;
    }
    // pendingMove is already on the server — let its ack resolve normally
}

function pumpMoveQueue() {
    if (dispatchTimer !== null || pendingMove || moveQueue.length === 0) return;

    const earliest = lastDispatchAt + MOVE_DURATION_MS + MOVE_SEND_BUFFER_MS;
    const wait = Math.max(0, earliest - Date.now());
    dispatchTimer = setTimeout(() => {
        dispatchTimer = null;
        if (pendingMove || moveQueue.length === 0) return;
        pendingMove = moveQueue.shift();
        lastDispatchAt = Date.now();
        socket.emit('requestMove', pendingMove);
        draw(); // repaint so the in-flight step turns amber
    }, wait);
}

function enqueueMove(fromRow, fromCol, toRow, toCol) {
    // Mountains never accept armies — skip obviously illegal steps
    if (map.grid[toRow][toCol].type === map.TYPE.MOUNTAIN) {
        draw();
        return;
    }
    if (moveQueue.length + (pendingMove ? 1 : 0) >= MAX_QUEUED_MOVES) return;

    moveQueue.push({ fromRow, fromCol, toRow, toCol });
    selectedCell = { row: toRow, col: toCol }; // the plan's tail becomes the new cursor
    pumpMoveQueue();
    draw();
}

// 1. Listen for the initial map setup data from the server
socket.on('initMap', (data) => {
    map = data.gameMap;
    myPlayerId = data.playerID;
    gameWinner = null;
    selectedCell = null;
    clearMoveQueue();
    document.title = `Generals.io - Playing as ${myPlayerId || 'Spectator'}`;
    canvas.width = map.SIZE * CELL_SIZE;
    canvas.height = map.SIZE * CELL_SIZE;
    loadCellImages(); 
});

// 2. Listen for the server's ongoing game loop ticks
socket.on('gameTick', (serverGrid) => {
    if (!map) return;
    // Overwrite our local grid data with the server's authoritative data
    map.grid = serverGrid;
    // Only draw if images have finished loading
    if (assetsReady)
        draw();
});

// 3. The server confirms every move request; only then do we send the next one
socket.on('moveAck', (ack) => {
    if (!pendingMove) return;
    pendingMove = null;
    if (ack && ack.accepted === false) {
        lastDispatchAt = 0; // no move was consumed — the next one can go out now
    }
    pumpMoveQueue();
    draw();
});

canvas.addEventListener('click', (event) => {
    if (!map || !myPlayerId || gameWinner) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;
    
    const col = Math.floor(clickX / CELL_SIZE);
    const row = Math.floor(clickY / CELL_SIZE);

    // Ensure the click is within grid boundaries
    if (row >= 0 && row < map.SIZE && col >= 0 && col < map.SIZE) {
        handleCellClick(row, col);
    }
});

function handleCellClick(row, col) {
    const clickedCell = map.grid[row][col];

    if (selectedCell) {
        const dRow = Math.abs(selectedCell.row - row);
        const dCol = Math.abs(selectedCell.col - col);

        // If clicking a directly adjacent tile (Up, Down, Left, Right)
        if ((dRow === 1 && dCol === 0) || (dRow === 0 && dCol === 1)) {
            // Queue the step; it will be dispatched to the server in order
            enqueueMove(selectedCell.row, selectedCell.col, row, col);
            return;
        }
    }

    // Any other click picks a new source tile and abandons the planned path
    clearMoveQueue();
    // Select tile only if it belongs to us and has movable armies (> 1)
    if (clickedCell.player.id === myPlayerId && clickedCell.value > 1) {
        selectedCell = { row, col };
    } else {
        selectedCell = null; // Clear if clicking an invalid target
    }
    draw();
}

window.addEventListener('keydown', (event) => {
    // Only intercept keys if a map is loaded and an identity is known
    if (!map || !myPlayerId || gameWinner) return;

    // Escape cancels the queued path and drops the selection
    if (event.key === 'Escape') {
        clearMoveQueue();
        selectedCell = null;
        draw();
        return;
    }

    if (!selectedCell) return;

    let toRow = selectedCell.row;
    let toCol = selectedCell.col;

    // Determine target coordinates based on key entry (Supporting Arrow Keys + WASD as a bonus!)
    switch (event.key) {
        case 'ArrowUp':
        case 'w': case 'W':
            toRow--;
            break;
        case 'ArrowDown':
        case 's': case 'S':
            toRow++;
            break;
        case 'ArrowLeft':
        case 'a': case 'A':
            toCol--;
            break;
        case 'ArrowRight':
        case 'd': case 'D':
            toCol++;
            break;
        default:
            return; // Ignore any other keystrokes (like Enter, Shift, etc.)
    }

    // Crucial: Stop the entire browser window from scrolling up/down when tapping arrows
    event.preventDefault();

    // Map Boundary Guard Check
    if (toRow >= 0 && toRow < map.SIZE && toCol >= 0 && toCol < map.SIZE) {
        // Queue the step onto the plan; the dispatcher sends it to the server
        enqueueMove(selectedCell.row, selectedCell.col, toRow, toCol);
    }
});

// Store loaded images to avoid reloading
const cellImages = {};

let imagesLoaded = 0;

function drawWhenReady() {
    imagesLoaded++;
    if (imagesLoaded === Object.values(map.TYPE).length) {
        assetsReady = true;
        draw();
    }
}
function loadCellImages() {
    const types = Object.values(map.TYPE);
    types.forEach(type => {
        const img = new Image();
        img.onload = drawWhenReady;
        img.onerror = function() {
            console.log(`Failed to load image for ${type}`);
            drawWhenReady(); // Still count as loaded even if failed
        };
        img.src = `cell-image/${type}.png`;
        cellImages[type] = img;
    });
}
function checkWinCondition() {
    if (!map) return;
    let uniqueBaseOwners = [];
    // Scan the entire board looking for remaining home bases
    for (let row = 0; row < map.SIZE; row++) 
        for (let col = 0; col < map.SIZE; col++) {
            const cell = map.grid[row][col];
            if (cell.type === map.TYPE.BASE && cell.player.id !== null) 
                if (!uniqueBaseOwners.includes(cell.player.id)) 
                    uniqueBaseOwners.push(cell.player.id);   
        }
    // If only one player has an active base left on the map, declare them the winner!
    if (uniqueBaseOwners.length === 1) 
        gameWinner = uniqueBaseOwners[0];
}

// --- NEW FUNCTION: DRAW GAME OVER SCREEN ---
function drawWinScreen() {
    ctx.save();
    
    // 1. Drop a 75% dark overlay pane over the map canvas
    ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Set up clean typography layout settings
    ctx.font = "bold 36px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // 3. Render contextual feedback text based on identity matching rules
    if (gameWinner === myPlayerId) {
        ctx.fillStyle = "#4ad94a"; // Vibrant Green text for winner
        ctx.fillText("VICTORY! YOU WIN!", canvas.width / 2, canvas.height / 2);
    } else {
        ctx.fillStyle = "#d94a4a"; // Bright Crimson text for defeat
        ctx.fillText("GAME OVER", canvas.width / 2, canvas.height / 2 - 20);
        
        ctx.font = "18px Arial";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(`Winner: (${gameWinner.toUpperCase()})`, canvas.width / 2, canvas.height / 2 + 25);
    }

    ctx.restore();
}
function draw(){
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let row = 0; row < map.SIZE; row++){
        for (let col = 0; col < map.SIZE; col++){
            const cell = map.grid[row][col];
            const x = col * CELL_SIZE;
            const y = row * CELL_SIZE;
            // Check if this cell is visible to player
            const isVisible = checkVisibility(row, col);
            if (!isVisible) {
                // FOG OF WAR - show only terrain/black
                drawFog(x, y, CELL_SIZE);
                drawCellType(cell.type,x,y, CELL_SIZE);
                continue; // Skip drawing cell details
            }
            drawPlayerColor(cell.player.color, x, y, CELL_SIZE);
            drawCellType(cell.type,x,y, CELL_SIZE);
            if (cell.value !== 0)
                drawCellValue(Math.abs(cell.value), x, y, CELL_SIZE);
        }
    }
    // Draw the player's queued plan: one arrow per pending/queued step
    drawMovePlan();
    if (selectedCell) {
        const x = selectedCell.col * CELL_SIZE;
        const y = selectedCell.row * CELL_SIZE;
        
        // Step A: Draw a translucent white "board" overlay (35% opacity)
        ctx.fillStyle = "rgba(255, 255, 255, 0.35)"; 
        ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);

        // Step B: Draw a clean, solid white inner border
        ctx.strokeStyle = "#ffffff"; 
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);
    }
    checkWinCondition();
    if (gameWinner) {
        drawWinScreen();
    }
}

// --- QUEUED MOVE OVERLAY ---
function drawMovePlan() {
    if (pendingMove) drawMoveArrow(pendingMove, true);
    for (const move of moveQueue) drawMoveArrow(move, false);
}

function drawMoveArrow(move, isPending) {
    const x1 = move.fromCol * CELL_SIZE + CELL_SIZE / 2;
    const y1 = move.fromRow * CELL_SIZE + CELL_SIZE / 2;
    const x2 = move.toCol * CELL_SIZE + CELL_SIZE / 2;
    const y2 = move.toRow * CELL_SIZE + CELL_SIZE / 2;
    // Moves are always orthogonal, so a sign is enough for the direction
    const dx = Math.sign(x2 - x1);
    const dy = Math.sign(y2 - y1);
    const gap = 9;                 // keep the shaft clear of the cell centers
    const sx = x1 + dx * gap, sy = y1 + dy * gap;
    const ex = x2 - dx * (gap + 2), ey = y2 - dy * (gap + 2);

    const color = isPending ? "#ffd54a" : "#ffffff"; // amber = in flight, white = queued

    // Black underline first so the arrow reads on any cell color
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(0, 0, 0, 0.65)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    // Arrowhead pointing into the destination cell
    const head = 7;
    const px = -dy, py = dx; // perpendicular axis
    ctx.beginPath();
    ctx.moveTo(ex + dx * head, ey + dy * head);
    ctx.lineTo(ex + px * head * 0.6, ey + py * head * 0.6);
    ctx.lineTo(ex - px * head * 0.6, ey - py * head * 0.6);
    ctx.closePath();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.65)";
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fill();
}

function checkVisibility(row, col) {
    if (myPlayerId === null) return true;
    // Your own cells are always visible
    if (map.grid[row][col].player.id === myPlayerId) {
        return true;
    }
    
    // Check adjacent to your units (vision radius 1)
    for (let dr = -1; dr <= 1; dr++) 
        for (let dc = -1; dc <= 1; dc++) {
            const nr = row + dr;
            const nc = col + dc;
            if (nr >= 0 && nr < map.SIZE && nc >= 0 && nc < map.SIZE) 
                if (map.grid[nr][nc].player.id === myPlayerId) 
                    return true; // Adjacent to your cell
        }
    
    return false; // Complete fog
}
function drawFog(x, y, size) {
    ctx.fillStyle = "#A9A9A9";
    ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = "SlateGray";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, size, size);
}

function drawCellType(type, x, y, size) {
    let img = cellImages[type];
    if (img && img.complete && img.naturalWidth > 0) {
        // Calculate scale to fit within cell while maintaining aspect ratio
        const scale = Math.min(size / img.width, size / img.height);
        const newWidth = img.width * scale;
        const newHeight = img.height * scale;
        
        // Center the image in the cell
        const offsetX = x + (size - newWidth) / 2;
        const offsetY = y + (size - newHeight) / 2;

        const col = x / CELL_SIZE;
        const row = y / CELL_SIZE;
        const isVisible = checkVisibility(row, col);
        if (!isVisible) {
            if (type === map.TYPE.TOWER)
                img = cellImages[map.TYPE.MOUNTAIN]
            else if (type === map.TYPE.BASE)
                img = cellImages[map.TYPE.EMPTY]
        }
        ctx.drawImage(img, x, y, size, size);
    } else {
        // Fallback if image hasn't loaded yet
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(x, y, size, size);
        ctx.strokeStyle = '#cccccc';
        ctx.strokeRect(x, y, size, size);
    }
}

function drawPlayerColor(color, x, y, size) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = "SlateGray";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, size, size);
}

function drawCellValue(value, x, y, size) {
    const centerX = x + size / 2;
    const centerY = y + size / 2 + 4;
    
    // Draw text outline
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText(value, centerX, centerY);
    
    // Draw text fill
    ctx.fillStyle = '#ffffff'; // White text
    ctx.fillText(value, centerX, centerY);
}
