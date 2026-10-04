const express = require('express');
const app = express();
app.use(express.json());

let rooms = {};

function getRoom(roomName) {
    if (!rooms[roomName]) {
        rooms[roomName] = { stands: {}, commands: [], pollers: [] };
    }
    return rooms[roomName];
}

app.get('/roster', (req, res) => {
    const roomName = req.query.room;
    if (!roomName) return res.json({ stands: [] });
    const room = getRoom(roomName);
    let activeStands = [];
    let now = Date.now();
    for (let [name, data] of Object.entries(room.stands)) {
        if (now - data.lastBeat < 10000) { 
            activeStands.push({ name: name, userId: data.userId });
        }
    }
    res.json({ stands: activeStands });
});

app.post('/beat', (req, res) => {
    const { room, username, userId, gameId, jobId, gameName } = req.body;
    if (!room || !username) return res.status(400).json({ error: "Missing data" });
    const r = getRoom(room);
    r.stands[username] = { 
        lastBeat: Date.now(), userId: userId, gameId: gameId, jobId: jobId, gameName: gameName || "Unknown Game"
    };
    res.json({ success: true });
});

app.post('/send', (req, res) => {
    const { room, target, command } = req.body;
    if (!room || !target || !command) return res.status(400).json({ error: "Missing data" });
    const r = getRoom(room);
    let cmdData = { target: target, command: command, timestamp: Date.now() };
    r.commands.push(cmdData);
    if (r.commands.length > 100) r.commands.shift();
    r.pollers.forEach(poller => {
        clearTimeout(poller.timeout);
        poller.res.json({ commands: [cmdData], cursor: Date.now() });
    });
    r.pollers = [];
    res.json({ success: true });
});

app.get('/poll', (req, res) => {
    const roomName = req.query.room;
    const username = req.query.username;
    const cursor = parseInt(req.query.cursor) || 0;
    if (!roomName || !username) return res.status(400).json({ error: "Missing data" });
    const room = getRoom(roomName);
    let newCmds = room.commands.filter(cmd => cmd.timestamp > cursor && (cmd.target === username || cmd.target === "ALL"));
    if (newCmds.length > 0) return res.json({ commands: newCmds, cursor: Date.now() });
    const timeout = setTimeout(() => {
        res.json({ commands: [], cursor: Date.now() });
        room.pollers = room.pollers.filter(p => p.res !== res);
    }, 25000);
    room.pollers.push({ res: res, username: username, timeout: timeout });
});

app.get('/global-roster', (req, res) => {
    let globalStands = [];
    let now = Date.now();
    for (let roomName in rooms) {
        let room = rooms[roomName];
        for (let name in room.stands) {
            if (now - room.stands[name].lastBeat < 10000) {
                globalStands.push({
                    username: name, userId: room.stands[name].userId, gameId: room.stands[name].gameId, 
                    jobId: room.stands[name].jobId, gameName: room.stands[name].gameName
                });
            }
        }
    }
    res.json({ stands: globalStands });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Phantom Relay Server running on ${PORT}`));
