// Integration test: verifies the server move cooldown + moveAck contract.
const { io } = require('socket.io-client');

const URL = 'http://localhost:3000';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function connect() {
    return new Promise((resolve) => {
        const socket = io(URL, { transports: ['websocket'] });
        socket.on('initMap', (data) => resolve({ socket, data }));
    });
}

(async () => {
    const p1 = await connect();
    const p2 = await connect();
    console.log(`p1=${p1.data.playerID} p2=${p2.data.playerID}`);
    if (p1.data.playerID !== 'p1' || p2.data.playerID !== 'p2') throw new Error('role assignment failed');

    const map = p1.data.gameMap;

    // Find a cell adjacent to p1's base that is walkable (not a mountain)
    const base = map.grid.flat().find((c) => c.type === 'base' && c.player.id === 'p1');
    const basePos = findCell(map, base);
    console.log(`p1 base at ${basePos}`);
    const step = adjacentWalkable(map, basePos);
    if (!step) throw new Error('no walkable neighbor around base');

    // Track grid snapshots from gameTick to observe actual army movements
    let latestGrid = map.grid;
    [p1, p2].forEach((p) => p.socket.on('gameTick', (g) => (latestGrid = g)));

    const acks = [];
    p1.socket.on('moveAck', (a) => acks.push({ t: Date.now(), accepted: a.accepted }));

    // Give the base a moment to grow (need value > 1 to move)
    console.log('waiting 3s for base income...');
    await wait(3000);

    // TEST 1: spam 6 move requests back-to-back (no client-side pacing)
    for (let i = 0; i < 6; i++) {
        p1.socket.emit('requestMove', {
            fromRow: basePos[0], fromCol: basePos[1],
            toRow: step[0], toCol: step[1],
        });
    }
    await wait(1500);

    const accepted = acks.filter((a) => a.accepted);
    const rejected = acks.filter((a) => !a.accepted);
    console.log(`TEST1 spam-without-pacing: ${accepted.length} accepted, ${rejected.length} rejected (expect 1 accepted, 5 rejected)`);
    if (accepted.length !== 1) throw new Error('cooldown did not throttle spam');

    // TEST 2: paced moves like the real client (one per MOVE_DURATION + buffer).
    // Wait for base income between moves so only the cooldown can reject.
    await wait(1000);
    acks.length = 0;
    const gaps = [];
    let prev = null;
    for (let i = 0; i < 3; i++) {
        for (let t = 0; t < 200 && latestGrid[basePos[0]][basePos[1]].value <= 1; t++) await wait(10);
        p1.socket.emit('requestMove', {
            fromRow: basePos[0], fromCol: basePos[1],
            toRow: step[0], toCol: step[1],
        });
        await new Promise((r) => {
            const iv = setInterval(() => {
                if (acks.length > i) { clearInterval(iv); r(); }
            }, 10);
        });
        const t = acks[i].t;
        if (prev !== null) gaps.push(t - prev);
        prev = t;
        await wait(560); // MOVE_DURATION_MS + buffer, like the client dispatcher
    }
    console.log(`TEST2 paced: accepted=${acks.filter(a=>a.accepted).length}/3, inter-ack gaps=${gaps.map(g=>g+'ms').join(', ')} (expect ~560ms, all >=400ms)`);
    if (acks.filter((a) => a.accepted).length !== 3) throw new Error('paced moves were wrongly rejected');
    if (gaps.some((g) => g < 400)) throw new Error('cooldown too loose');

    // TEST 3: every request gets an ack (queue never stalls)
    p2.socket.emit('requestMove', { fromRow: 0, fromCol: 0, toRow: 0, toCol: 1 }); // invalid: not owner
    p2.socket.emit('requestMove', { fromRow: 'x' }); // malformed
    let p2Acks = 0;
    p2.socket.on('moveAck', () => p2Acks++);
    await wait(300);
    // (listener attached after emits; retest cleanly)
    p2Acks = 0;
    p2.socket.emit('requestMove', { fromRow: 0, fromCol: 0, toRow: 0, toCol: 1 });
    await wait(300);
    console.log(`TEST3 invalid-move ack: ${p2Acks} ack received (expect 1)`);
    if (p2Acks !== 1) throw new Error('missing ack for rejected move');

    p1.socket.close();
    p2.socket.close();
    console.log('ALL TESTS PASSED');
    process.exit(0);
})().catch((e) => {
    console.error('TEST FAILED:', e.message);
    process.exit(1);
});

function findCell(map, target) {
    for (let r = 0; r < map.SIZE; r++)
        for (let c = 0; c < map.SIZE; c++)
            if (map.grid[r][c] === target) return [r, c];
    return null;
}

function adjacentWalkable(map, [r, c]) {
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of dirs) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= map.SIZE || nc < 0 || nc >= map.SIZE) continue;
        if (map.grid[nr][nc].type === 'mountain') continue;
        return [nr, nc];
    }
    return null;
}
