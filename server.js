const express = require('express');
const app = express();
app.use(express.json());

// In-memory storage
// rooms = { "mainacchere": { stands: {}, commands: [], pollers: [] } }
let rooms = {};

function getRoom(roomName) {
    if (!rooms[roomName]) {
        rooms[roomName] = {
            stands: {},      // "StandUsername": { lastBeat: 169000000 }
            commands: [],    // { target: "Stand1", command: ".summon", timestamp: 169000000 }
            pollers: []      // Waiting GET /poll requests
        };
    }
    return rooms[roomName];
}

// 1. Owner GUI fetches active stands
app.get('/roster', (req, res) => {
    const roomName = req.query.room;
    if (!roomName) return res.json({ stands: [] });
    
    const room = getRoom(roomName);
    let activeStands = [];
    let now = Date.now();
    
    for (let [name, data] of Object.entries(room.stands)) {
        if (now - data.lastBeat < 10000) { // 10 seconds timeout
            activeStands.push(name);
        }
    }
    res.json({ stands: activeStands });
});

// 2. Stand sends heartbeat every 3 seconds
app.post('/beat', (req, res) => {
    const { room, username } = req.body;
    if (!room || !username) return res.status(400).json({ error: "Missing data" });
    
    const r = getRoom(room);
    r.stands[username] = { lastBeat: Date.now() };
    res.json({ success: true });
});

// 3. Owner GUI sends command
app.post('/send', (req, res) => {
    const { room, target, command } = req.body;
    if (!room || !target || !command) return res.status(400).json({ error: "Missing data" });
    
    const r = getRoom(room);
    let cmdData = { target: target, command: command, timestamp: Date.now() };
    r.commands.push(cmdData);
    
    // Clean up old commands (keep last 100)
    if (r.commands.length > 100) r.commands.shift();
    
    // Resolve any pending long-pollers immediately
    r.pollers.forEach(poller => {
        clearTimeout(poller.timeout);
        poller.res.json({ commands: [cmdData], cursor: Date.now() });
    });
    r.pollers = [];
    
    res.json({ success: true });
});

// 4. Stand long-polls for commands
app.get('/poll', (req, res) => {
    const roomName = req.query.room;
    const username = req.query.username;
    const cursor = parseInt(req.query.cursor) || 0;
    
    if (!roomName || !username) return res.status(400).json({ error: "Missing data" });
    const room = getRoom(roomName);
    
    // Check for commands newer than the cursor for this specific stand or "ALL"
    let newCmds = room.commands.filter(cmd => 
        cmd.timestamp > cursor && (cmd.target === username || cmd.target === "ALL")
    );
    
    if (newCmds.length > 0) {
        return res.json({ commands: newCmds, cursor: Date.now() });
    }
    
    // Long polling: Wait up to 25 seconds for a new command
    const timeout = setTimeout(() => {
        res.json({ commands: [], cursor: Date.now() });
        // Remove this poller from the list
        room.pollers = room.pollers.filter(p => p.res !== res);
    }, 25000);
    
    room.pollers.push({ res: res, username: username, timeout: timeout });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Phantom Relay Server running on ${PORT}`));
