
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
    const towerSize = playerSize*6;
    const mountainSize = playerSize*14;
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