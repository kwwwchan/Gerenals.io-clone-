const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;

// Serve all your static client files (index.html, game.js, style.css, cell-image/)
app.use(express.static(path.join(__dirname, '../client')));

const PLAYERS = {
    NONE: { id: null, name: 'Empty', color: '#bfd6dc' },
    PLAYER1: { id: 'p1', name: 'Alice', color: '#4a90d9' },   // Blue
    PLAYER2: { id: 'p2', name: 'Bob', color: '#d94a4a' },     // Red
    //PLAYER3: { id: 'p3', name: 'Cathy', color: '#4ad94a' },   // Green
};
const TYPE = {
    EMPTY: "empty",
    BASE: "base",
    TOWER: "tower",
    MOUNTAIN: "mountain",
}
const gameMap = createMap();
let tickCount = 0;

// --- SERVER GAME LOOP ---
setInterval(() => {
    tickCount++;
    const GRID_SIZE = gameMap.SIZE;

    for (let row = 0; row < GRID_SIZE; row++) {
        for (let col = 0; col < GRID_SIZE; col++) {
            const cell = gameMap.grid[row][col];
            if (cell.player.id !== PLAYERS.NONE.id) {
                if (cell.type === TYPE.BASE || cell.type === TYPE.TOWER) {
                    cell.value += 1;
                }
                if (tickCount % 25 === 0) {
                    cell.value += 1;
                }
            }
        }
    }

    // Shout the updated grid data to EVERY connected player browser
    io.emit('gameTick', gameMap.grid);
}, 1000);

// --- CONNECTION HANDLING ---
const activeConnections = {};

io.on('connection', (socket) => {
    console.log('A player connected: ' + socket.id);

    let assignedPlayer = PLAYERS.NONE;
    const currentOccupants = Object.keys(activeConnections).length;
    
    if (currentOccupants === 0) assignedPlayer = PLAYERS.PLAYER1;     
    else if (currentOccupants === 1) assignedPlayer = PLAYERS.PLAYER2;
    else assignedPlayer = PLAYERS.NONE;

    activeConnections[socket.id] = assignedPlayer;

    // Immediately send the structural map info (size, types) to the newly connected player
    socket.emit('initMap', {gameMap, playerID: assignedPlayer.id});

    socket.on('requestMove', (data) => {
        const playerProfile = activeConnections[socket.id];
        
        // Spectators cannot issue movement commands
        if (!playerProfile || playerProfile.id === null) return;

        const { fromRow, fromCol, toRow, toCol } = data;

        // Security Layer 1: Boundary Verification
        if (fromRow < 0 || fromRow >= gameMap.SIZE || fromCol < 0 || fromCol >= gameMap.SIZE ||
            toRow < 0 || toRow >= gameMap.SIZE || toCol < 0 || toCol >= gameMap.SIZE) return;

        const fromCell = gameMap.grid[fromRow][fromCol];
        const toCell = gameMap.grid[toRow][toCol];

        // Security Layer 2: Ownership validation and structural army check
        if (fromCell.player.id !== playerProfile.id || fromCell.value <= 1) return;

        // Security Layer 3: Verification of Adjacency
        const dRow = Math.abs(fromRow - toRow);
        const dCol = Math.abs(fromCol - toCol);
        if (!((dRow === 1 && dCol === 0) || (dRow === 0 && dCol === 1))) return;

        // Security Layer 4: Mountain Restriction
        if (toCell.type === TYPE.MOUNTAIN) return;

        // Execute troop movement safely on backend
        let armyToMove = fromCell.value - 1; 
        fromCell.value = 1;

        if (toCell.player.id === playerProfile.id) {
            // Reinforcing teammate/own grid
            toCell.value += armyToMove;
        } else {
            let targetStrength = toCell.value;
            // Unowned Tower and Land Capture
            if (targetStrength <= 0){
                toCell.value += armyToMove;
                if (toCell.value > 0)
                    toCell.player = playerProfile; 
            }
            // Battle resolution
            else if (armyToMove > targetStrength) {
                toCell.value = armyToMove - targetStrength;
                toCell.player = playerProfile; // Land captured!
                if (toCell.type === TYPE.BASE) // Defeat King
                    toCell.type = TYPE.TOWER;
            } else {
                let remainder = targetStrength - armyToMove;
                toCell.value = remainder;
            }
        }
        // Instantly shout state mutation changes out to everyone to minimize display delay
        io.emit('gameTick', gameMap.grid);
    });
    socket.on('disconnect', () => {
        console.log('Player disconnected: ' + socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Server is running smoothly on http://localhost:${PORT}`);
});

function createMap(){
    const SIZE = 20;
    const grid = [];
    function cell(type,player,value = 0){
        return {type,player,value};
    }

    for(let row = 0;row < SIZE;row++){
        grid[row] = [];
        for (let col = 0;col < SIZE;col++){
            grid[row][col] = cell(TYPE.EMPTY,PLAYERS.NONE);
        }
    }

    const playerSize = Object.keys(PLAYERS).length-1;
    const towerSize = 30;
    const mountainSize = 50;
    const basePoints = generatePoints(playerSize,SIZE,8,grid);
    const players = Object.values(PLAYERS);
    for (let i = 0;i < playerSize;i++)
        grid[basePoints[i][0]][basePoints[i][1]] = cell(TYPE.BASE,players[i+1],1);
    const towerPoints = generatePoints(towerSize,SIZE,0,grid);
    for (let i = 0;i < towerSize;i++)
        grid[towerPoints[i][0]][towerPoints[i][1]] = cell(TYPE.TOWER,PLAYERS.NONE,-40);
    const mountainPoints = generatePoints(mountainSize,SIZE,0,grid);
    for (let i = 0;i < mountainSize;i++)
        grid[mountainPoints[i][0]][mountainPoints[i][1]] = cell(TYPE.MOUNTAIN,PLAYERS.NONE,0);

    return {grid, SIZE, TYPE, PLAYERS}
}

function rand(max){
    return Math.floor(Math.random() * max)
}

function tooClose(p1,p2,minD){
    const dx = Math.abs(p1[0] - p2[0]);
    const dy = Math.abs(p1[1] - p2[1]);
    const distance = dx + dy;
    return distance < minD;
}

function tooCloseToAny(newPoint,points,minD){
     for (let i = 0; i < points.length; i++) {
        if (tooClose(newPoint, points[i],minD)) {
            return true;
        }
    }
    return false;
}

function alreadyExists(newPoint, points) {
    for (let i = 0; i < points.length; i++) {
        if (points[i][0] === newPoint[0] && points[i][1] === newPoint[1]) {
            return true;
        }
    }
    return false;
}

function isCellEmpty(grid, point) {
    return grid[point[0]][point[1]].type === TYPE.EMPTY;
}

function generatePoints(n, gridSize ,minD = 0, grid = null) {
    const points = [];
    
    for (let attempt = 0; attempt < n; attempt++) {
        let found = false;
        let tries = 0;
        
        while (!found && tries < 1000) {
            const newPoint = [rand(gridSize), rand(gridSize)];
            
            const isDuplicate = alreadyExists(newPoint, points);
            const isTooClose = tooCloseToAny(newPoint, points, minD);
            const cellEmpty = grid? isCellEmpty(grid, newPoint) : true;

            if (!isDuplicate && !isTooClose && cellEmpty) {
                points.push(newPoint); 
                found = true;
            }
            
            tries++;
        }
        
        // If we couldn't find a point after 1000 tries, stop
        if (!found) {
            console.log(`Could only generate ${points.length} points out of ${n}`);
            break;
        }
    }
    
    return points;
}

