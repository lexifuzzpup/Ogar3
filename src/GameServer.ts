import { createServer, type Server as HttpServer, type IncomingMessage } from "node:http";
import { readFileSync, writeFileSync, renameSync, appendFileSync } from "node:fs";
import finalhandler from "finalhandler";
import serveStatic from "serve-static";
import { WebSocket, WebSocketServer } from "ws";
import { Ini } from "./modules/ini.js";
import { Log } from "./modules/log.js";
import { BotLoader } from "./ai/BotLoader.js";
import { PlayerTracker } from "./PlayerTracker.js";
import { PacketHandler } from "./PacketHandler.js";
import * as Entity from "./entity/index.js";
import * as Gamemode from "./gamemodes/index.js";
import { AddNode } from "./packet/AddNode.js";
import { BroadCast } from "./packet/BroadCast.js";
import { UpdateLeaderboard } from "./packet/UpdateLeaderboard.js";
import type { Cell } from "./entity/Cell.js";
import type { PlayerCell } from "./entity/PlayerCell.js";
import type { Virus } from "./entity/Virus.js";
import type { Mode } from "./gamemodes/Mode.js";
import type { LeaderboardEntry } from "./packet/UpdateLeaderboard.js";
import type { ClientSocket, Color, GameServerConfig, Packet, Position } from "./types.js";

// Registered with WebSocketServer's `WebSocket` option, so every accepted connection is an
// instance of this class - replaces the original's global `WebSocket.prototype.sendPacket`
// monkey-patch with a real subclass.
class ServerSocket extends WebSocket implements ClientSocket {
    readonly isBot = false;
    remoteAddress?: string;
    remotePort?: number;
    playerTracker!: PlayerTracker;
    packetHandler!: PacketHandler;

    sendPacket(packet: Packet): void {
        // Send only if the buffer is empty
        // `bufferSize` is deprecated in modern Node in favor of `writableLength`, but kept
        // here (same as the original) since it's still functional and behavior-identical.
        const internalSocket = (this as unknown as { _socket?: { bufferSize: number } })._socket;
        if(this.readyState == WebSocket.OPEN && (internalSocket?.bufferSize == 0)) {
            try {
                this.send(packet.build() as ArrayBuffer, { binary: true });
            } catch {
                // console.log("[Socket Error] " + e);
            }
        } else {
            // Remove socket
            this.emit("close");
            this.removeAllListeners();
        }
    }
}

export class GameServer {
    run = true;
    lastNodeId = 1;
    lastPlayerId = 1;
    clients: ClientSocket[] = [];
    nodes: Cell[] = [];
    nodesVirus: Virus[] = []; // Virus nodes
    nodesEjected: Cell[] = []; // Ejected mass nodes
    nodesPlayer: Cell[] = []; // Nodes controlled by players

    currentFood = 0;
    movingNodes: Cell[] = []; // For move engine
    leaderboard: LeaderboardEntry[] = [];
    lb_packet: Packet = { build: () => new ArrayBuffer(0) }; // Leaderboard packet

    bots: BotLoader;
    log: Log;
    commands!: Record<string, (gameServer: GameServer, split: string[]) => void>; // Command handler
    banned: string[] = []; // List of banned IPs

    // Main loop tick
    time: Date;
    startTime: Date;
    tick = 0; // 1 second ticks of mainLoop
    tickMain = 0; // 50 ms ticks, 20 of these = 1 leaderboard update
    tickSpawn = 0; // Used with spawning food
    master = 0; // Used for Master Ping spam protection

    gameMode: Mode;
    oldcolors: Color[];
    stats = "";

    socketServer!: WebSocketServer;
    httpServer?: HttpServer;

    config: GameServerConfig = { // Border - Right: X increases, Down: Y increases (as of 2015-05-20)
        serverMaxConnections: 64, // Maximum amount of connections to the server.
        serverMaxConnPerIp: 9,
        serverPort: 8080, // Server port
        serverGamemode: 0, // Gamemode, 0 = FFA, 1 = Teams
        serverResetTime: 0, // Time in hours to reset (0 is off)
        serverName: "Ogar3 Server", // The name to display on the tracker (leave empty will show ip:port)
        serverAdminPass: "", // Remote console commands password
        serverBots: 3, // Amount of player bots to spawn
        serverVersion: 1,
        serverOldColors: 0, // If the server uses colors from the original Ogar
        serverViewBaseX: 1024, // Base view distance of players. Warning: high values may cause lag
        serverViewBaseY: 592,
        serverStatsPort: 88, // Port for stats server. Having a negative number will disable the stats server.
        serverStatsUpdate: 60, // Amount of seconds per update for the server stats
        serverLogLevel: 2, // Logging level of the server. 0 = No logs, 1 = Logs the console, 2 = Logs console and ip connections
        gameLBlength: 10, // Number of names to display on Leaderboard (Vanilla value: 10)
        borderLeft: 0, // Left border of map (Vanilla value: 0)
        borderRight: 6000, // Right border of map (Vanilla value: 11180.3398875)
        borderTop: 0, // Top border of map (Vanilla value: 0)
        borderBottom: 6000, // Bottom border of map (Vanilla value: 11180.3398875)
        spawnInterval: 20, // The interval between each food cell spawn in ticks (1 tick = 50 ms)
        foodSpawnAmount: 10, // The amount of food to spawn per interval
        foodStartAmount: 100, // The starting amount of food in the map
        foodMaxAmount: 500, // Maximum food cells on the map
        foodMass: 1, // Starting food size (In mass)
        foodMaxMass: 4,
        virusMinAmount: 10, // Minimum amount of viruses on the map.
        virusMaxAmount: 50, // Maximum amount of viruses on the map. If this amount is reached, then ejected cells will pass through viruses.
        virusStartMass: 100, // Starting virus size (In mass)
        virusFeedAmount: 7, // Amount of times you need to feed a virus to shoot it
        motherCellMinMass: 200,
        motherCellMaxMass: 2000,
        ejectMass: 12, // Mass of ejected cells
        ejectMassLoss: 16, // Mass lost when ejecting cells
        ejectSpeed: 160, // Base speed of ejected cells
        ejectSpawnPlayer: 50, // Chance for a player to spawn from ejected mass
        playerStartMass: 10, // Starting mass of the player cell.
        playerMaxMass: 22500, // Maximum mass a player can have
        playerSpeed: 30, // Player base speed
        playerSplitSpeedMultiplier: 6, // multiplier for splitting speed
        playerPopsplitSpeed: 1,
        playerMinMassEject: 32, // Mass required to eject a cell
        playerMinMassSplit: 36, // Mass required to split
        playerSmoothSplit: 1, // Does player split smoothly?
        playerMaxCells: 16, // Max cells the player is allowed to have
        playerRecombineTime: 30, // Base amount of seconds before a cell is allowed to recombine
        playerMassDecayRate: 0.002, // Amount of mass lost per second
        playerMinMassDecay: 9, // Minimum mass for decay to occur
        playerMaxNickLength: 15, // Maximum nick length
        playerDisconnectTime: 60, // The amount of seconds it takes for a player cell to be removed after disconnection (If set to -1, cells are never removed)
        teamsCollision: 1, // If teammates can collide with each other.
        tourneyMaxPlayers: 12, // Maximum amount of participants for tournament style game modes
        tourneyPrepTime: 10, // Amount of ticks to wait after all players are ready (1 tick = 1000 ms)
        tourneyEndTime: 30, // Amount of ticks to wait after a player wins (1 tick = 1000 ms)
        tourneyTimeLimit: 20, // Time limit of the game, in minutes.
        tourneyAutoFill: 0, // If set to a value higher than 0, the tournament match will automatically fill up with bots after this amount of seconds
        tourneyAutoFillPlayers: 1, // The timer for filling the server with bots will not count down unless there is this amount of real players
        chatMaxMessageLength: 70 // Maximum message length
    };

    constructor() {
        this.bots = new BotLoader(this);
        this.log = new Log();

        // Main loop tick
        this.time = new Date();
        this.startTime = this.time;

        // Parse config
        this.loadConfig();
        this.oldcolors = [{ r: 235, b: 0, g: 75 }, { r: 225, b: 255, g: 125 }, { r: 180, b: 20, g: 7 }, { r: 80, b: 240, g: 170 }, { r: 180, b: 135, g: 90 }, { r: 195, b: 0, g: 240 }, { r: 150, b: 255, g: 18 }, { r: 80, b: 0, g: 245 }, { r: 165, b: 0, g: 25 }, { r: 80, b: 0, g: 145 }, { r: 80, b: 240, g: 170 }, { r: 55, b: 255, g: 92 }];

        // Gamemodes
        this.gameMode = Gamemode.get(this.config.serverGamemode);
    }

    start(): void {
        // Logging
        this.log.setup(this);

        // Rcon Info
        if(this.config.serverAdminPass != "") {
            console.log("* [33mRcon enabled, passkey set to " + this.config.serverAdminPass + "[0m");
            console.log("* [33mTo use in chat type /rcon " + this.config.serverAdminPass + " <server command>[0m");
        }

        // Gamemode configurations
        this.gameMode.onServerInit(this);
        this.config.serverPort = Number(process.env.PORT) || this.config.serverPort;

        // Start the server
        const serve = serveStatic("./client/dist");
        const hserver = createServer((req, res) => {
            res.setHeader("Access-Control-Allow-Origin", "*");
            const done = finalhandler(req, res);
            serve(req, res, done);
        });
        hserver.listen(this.config.serverPort, "0.0.0.0", this.onHttpServerOpen.bind(this));
        this.socketServer = new WebSocketServer({ server: hserver, perMessageDeflate: false, WebSocket: ServerSocket });
        this.socketServer.on("connection", this.connectionEstablished.bind(this) as (ws: WebSocket, req: IncomingMessage) => void);

        // Properly handle errors because some people are too lazy to read the readme
        this.socketServer.on("error", (e: NodeJS.ErrnoException) => {
            switch(e.code) {
                case "EADDRINUSE":
                    console.log("[Error] Server could not bind to port! Please close out of Skype or change 'serverPort' in gameserver.ini to a different number.");
                    break;
                case "EACCES":
                    console.log("[Error] Please make sure you are running Ogar with root privileges.");
                    break;
                default:
                    console.log("[Error] Unhandled error code: " + e.code);
                    break;
            }
            process.exit(1); // Exits the program
        });

        this.startStatsServer(this.config.serverStatsPort);
    }

    private connectionEstablished(ws: ServerSocket, req: IncomingMessage): void {
        if(this.clients.length >= this.config.serverMaxConnections) { // Server full
            console.log("[33mClient tried to connect, but server player limit has been reached![0m");
            ws.close();
            return;
        }

        const internalSocket = (ws as unknown as { _socket: { remoteAddress: string; remotePort: number } })._socket;

        if(this.banned.indexOf(internalSocket.remoteAddress) != -1) { // Banned
            console.log("[33mClient " + internalSocket.remoteAddress + ", tried to connect but is banned![0m");
            ws.close();
            return;
        }

        const origin = req.headers.origin;
        if(this.config.serverMaxConnPerIp) {
            let cons = 1;
            for(let i = 0, llen = this.clients.length; i < llen; i++) {
                if(this.clients[i]!.remoteAddress == internalSocket.remoteAddress) {
                    cons++;
                }
            }
            if(cons > this.config.serverMaxConnPerIp) {
                ws.close();
                return;
            }
        }

        ws.remoteAddress = internalSocket.remoteAddress;
        ws.remotePort = internalSocket.remotePort;
        this.log.onConnect(ws.remoteAddress); // Log connections
        console.log("(" + this.clients.length + "/" + this.config.serverMaxConnections + ") [32mClient connect: " + ws.remoteAddress + ":" + ws.remotePort + " [origin " + origin + "][0m");

        ws.playerTracker = new PlayerTracker(this, ws);
        ws.packetHandler = new PacketHandler(this, ws);
        ws.on("message", (data: Buffer) => ws.packetHandler.handleMessage(data));

        const close = (error?: unknown): void => {
            this.log.onDisconnect(ws.remoteAddress!);
            const client = ws.playerTracker;
            console.log("[31mClient Disconnect: " + ws.remoteAddress + ":" + ws.remotePort + " Error " + error + "[0m");
            const len = ws.playerTracker.cells.length;
            for(let i = 0; i < len; i++) {
                const cell = ws.playerTracker.cells[i];

                if(!cell) {
                    continue;
                }
                cell.calcMove = () => { return; }; // Clear function so that the cell cant move
            }
            client.disconnect = this.config.playerDisconnectTime * 20;
            ws.sendPacket = () => { return; }; // Clear function so no packets are sent
        };
        ws.on("error", close);
        ws.on("close", close);
        this.clients.push(ws);
        this.MasterPing();
    }

    private onHttpServerOpen(): void {
        // Spawn starting food
        this.startingFood();

        // Start Main Loop
        this.MasterPing();
        setInterval(this.MasterPing.bind(this), 1805000);
        setInterval(this.mainLoop.bind(this), 1);

        // Done
        console.log("* [33mListening on port " + this.config.serverPort + " [0m");
        console.log("* [33mCurrent game mode is " + this.gameMode.name + "[0m");

        if(this.config.serverBots > 0) {
            for(let i = 0; i < this.config.serverBots; i++) {
                this.bots.addBot();
            }
            console.log("* [33mLoaded " + this.config.serverBots + " player bots[0m");
        }
        if(this.config.serverResetTime > 0) {
            console.log("* [33mAuto shutdown after " + this.config.serverResetTime + " hours uptime[0m");
        }

        if(this.config.serverVersion == 1) {
            console.log("* [33mProtocol set to new, clients with version 561.20 and up can connect to this server[0m");
        }
        if(this.config.serverVersion == 0) {
            console.log("* [33mProtocol set to old, clients with version 561.19 and older can connect to this server[0m");
        }
    }

    getMode(): Mode {
        return this.gameMode;
    }

    getNextNodeId(): number {
        // Resets integer
        if(this.lastNodeId > 2147483647) {
            this.lastNodeId = 1;
        }
        return this.lastNodeId++;
    }

    getNewPlayerID(): number {
        // Resets integer
        if(this.lastPlayerId > 2147483647) {
            this.lastPlayerId = 1;
        }
        return this.lastPlayerId++;
    }

    getRandomPosition(): Position {
        return {
            x: Math.floor(Math.random() * (this.config.borderRight - this.config.borderLeft)) + this.config.borderLeft,
            y: Math.floor(Math.random() * (this.config.borderBottom - this.config.borderTop)) + this.config.borderTop
        };
    }

    getRandomSpawn(): Position {
        return this.gameMode.getRandomSpawn(this);
    }

    getRandomColor(): Color {
        return this.gameMode.getRandomColor(this);
    }

    addNode(node: Cell): void {
        this.nodes.push(node);

        // Adds to the owning player's screen
        if(node.owner) {
            node.setColor(node.owner.color);
            node.owner.cells.push(node);
            node.owner.socket.sendPacket(new AddNode(node));
        }

        // Special on-add actions
        node.onAdd(this);

        // Add to visible nodes
        for(let i = 0; i < this.clients.length; i++) {
            const client = this.clients[i]!.playerTracker;
            if(!client) {
                continue;
            }

            // client.nodeAdditionQueue is only used by human players, not bots
            // for bots it just gets collected forever, using ever-increasing amounts of memory
            if(!client.socket.isBot && node.visibleCheck(client.viewBox, client.centerPos)) {
                client.nodeAdditionQueue.push(node);
            }
        }
    }

    removeNode(node: Cell): void {
        // Remove from main nodes list
        let index = this.nodes.indexOf(node);
        if(index != -1) {
            this.nodes.splice(index, 1);
        }

        // Remove from moving cells list
        index = this.movingNodes.indexOf(node);
        if(index != -1) {
            this.movingNodes.splice(index, 1);
        }

        // Special on-remove actions
        node.onRemove(this);

        // Animation when eating
        for(let i = 0; i < this.clients.length; i++) {
            const client = this.clients[i]!.playerTracker;
            if(!client) {
                continue;
            }

            // Remove from client
            client.nodeDestroyQueue.push(node);
        }
    }

    cellTick(): void {
        // Move cells
        this.updateMoveEngine();
    }

    spawnTick(): void {
        // Spawn food
        this.tickSpawn++;
        if(this.tickSpawn >= this.config.spawnInterval) {
            this.updateFood(); // Spawn food
            this.virusCheck(); // Spawn viruses
            this.tickSpawn = 0; // Reset
        }
    }

    gamemodeTick(): void {
        // Gamemode tick
        this.gameMode.onTick(this);
    }

    cellUpdateTick(): void {
        // Update cells
        this.updateCells();
    }

    mainLoop(): void {
        // Timer
        const local = new Date();
        this.tick += (local.getTime() - this.time.getTime());
        this.time = local;

        // Default 50 (aka 50ms) if change here change movespeed as well
        if(this.tick >= 50) {
            // Loop main functions
            if(this.run) {
                this.cellTick();
                this.spawnTick();
                this.gamemodeTick();
                this.MasterPing();
            }

            // Update the client's maps
            this.updateClients();

            // Update cells/leaderboard loop
            this.tickMain++;
            if(this.tickMain >= 20) { // 1 Second
                this.cellUpdateTick();

                // Update leaderboard with the gamemode's method
                this.leaderboard = [];
                this.gameMode.updateLB(this);
                this.lb_packet = new UpdateLeaderboard(this.leaderboard, this.gameMode.packetLB);

                this.tickMain = 0; // Reset
            }

            // Check Bot Min Players
            let players = 0;
            for(const client of this.clients) {
                if(client.playerTracker && !client.playerTracker.spectate) {
                    players++;
                }
            }
            if(players < this.config.serverBots) {
                this.bots.addBot();
            }

            // Auto Server Reset
            if(this.config.serverResetTime > 0 && (local.getTime() - this.startTime.getTime()) > (this.config.serverResetTime * 3600000)) {
                this.exitserver();
            }

            // Reset
            this.tick = 0;
        }
    }

    exitserver(): void {
        console.log("Server Shutdown!");
        this.socketServer.close();
        process.exit(1);
    }

    updateClients(): void {
        for(let i = 0; i < this.clients.length; i++) {
            if(typeof this.clients[i] == "undefined") {
                continue;
            }
            this.clients[i]!.playerTracker.update();
        }
    }

    startingFood(): void {
        // Spawns the starting amount of food cells
        for(let i = 0; i < this.config.foodStartAmount; i++) {
            this.spawnFood();
        }
    }

    updateFood(): void {
        const toSpawn = Math.min(this.config.foodSpawnAmount, (this.config.foodMaxAmount - this.currentFood));
        for(let i = 0; i < toSpawn; i++) {
            this.spawnFood();
        }
    }

    spawnFood(): void {
        const f = new Entity.Food(this.getNextNodeId(), null, this.getRandomPosition(), Math.floor(Math.random() * this.config.foodMaxMass) + this.config.foodMass, this);
        f.setColor(this.getRandomColor());
        this.addNode(f);
        this.currentFood++;
    }

    spawnPlayer(player: PlayerTracker, pos: Position | null = null, mass: number | null = null): void {
        if(pos == null) { // Get random pos
            pos = this.getRandomSpawn();
        }
        if(mass == null) { // Get starting mass
            mass = this.config.playerStartMass;
        }
        // Spawn player and add to world
        const cell = new Entity.PlayerCell(this.getNextNodeId(), player, pos, mass, this);

        if(!player.socket.isBot) {
            let zname = player.name;
            if(zname === "") {
                zname = "Un Named";
            }

            if(this.config.serverResetTime > 0) {
                const packet = new BroadCast("Remember, This server auto restarts after " + this.config.serverResetTime + " hours uptime!");
                player.socket.sendPacket(packet);
            }

            console.log("[36m" + zname + " joined the game[0m");
        }

        this.addNode(cell);

        // Set initial mouse coords
        player.mouse = { x: pos.x, y: pos.y };
    }

    virusCheck(): void {
        // Checks if there are enough viruses on the map
        if(this.nodesVirus.length < this.config.virusMinAmount) {
            // Spawns a virus
            const pos = this.getRandomPosition();
            const virusSquareSize = ((this.config.virusStartMass) * 110) >> 0;

            // Check for players
            for(let i = 0; i < this.nodesPlayer.length; i++) {
                const check = this.nodesPlayer[i]!;

                if(check.mass < this.config.virusStartMass) {
                    continue;
                }

                // New way
                const squareR = check.getSquareSize(); // squared Radius of checking player cell
                const dx = check.position.x - pos.x;
                const dy = check.position.y - pos.y;
                if(dx * dx + dy * dy + virusSquareSize <= squareR) {
                    return; // Collided
                }
            }

            // Check for other virus
            for(let i = 0; i < this.nodesVirus.length; i++) {
                const check = this.nodesVirus[i]!;
                const squareR = check.getSquareSize();
                const dx = check.position.x - pos.x;
                const dy = check.position.y - pos.y;
                if(dx * dx + dy * dy + virusSquareSize <= squareR) {
                    return; // Collided
                }
            }

            // Spawn if no cells are colliding
            const v = new Entity.Virus(this.getNextNodeId(), null, pos, this.config.virusStartMass, this);
            this.addNode(v);
        }
    }

    updateMoveEngine(): void {
        // Move player cells
        let len = this.nodesPlayer.length;
        for(let i = 0; i < len; i++) {
            const cell = this.nodesPlayer[i];

            // Do not move cells that have already been eaten or have collision turned off
            if(!cell) {
                continue;
            }

            const client = cell.owner!;

            cell.calcMove!(client.mouse.x, client.mouse.y, this);

            // Check if cells nearby
            const list = this.getCellsInRange(cell);
            for(let j = 0; j < list.length; j++) {
                const check = list[j]!;

                // if we're deleting from this.nodesPlayer, fix outer loop variables; we need to update its length, and maybe 'i' too
                if(check.cellType == 0) {
                    len--;
                    if(check.nodeId < cell.nodeId) {
                        i--;
                    }
                }

                // Consume effect
                check.onConsume(cell, this);

                // Remove cell
                check.setKiller(cell);
                this.removeNode(check);
            }
        }

        // A system to move cells not controlled by players (ex. viruses, ejected mass)
        len = this.movingNodes.length;
        for(let i = 0; i < len; i++) {
            let check = this.movingNodes[i];

            // Recycle unused nodes
            while((typeof check == "undefined") && (i < this.movingNodes.length)) {
                // Remove moving cells that are undefined
                this.movingNodes.splice(i, 1);
                check = this.movingNodes[i];
            }

            if(i >= this.movingNodes.length) {
                continue;
            }

            if(check!.moveEngineTicks > 0) {
                check!.onAutoMove(this);
                // If the cell has enough move ticks, then move it
                check!.calcMovePhys(this.config);
            } else {
                // Auto move is done
                check!.moveDone(this);
                // Remove cell from list
                const index = this.movingNodes.indexOf(check!);
                if(index != -1) {
                    this.movingNodes.splice(index, 1);
                }
            }
        }
    }

    setAsMovingNode(node: Cell): void {
        this.movingNodes.push(node);
    }

    sendMSG(client: PlayerTracker, msg: string): void {
        const packet = new BroadCast(msg);
        client.socket.sendPacket(packet);
    }

    splitCells(client: PlayerTracker): void {
        this.gameMode.splitCells(this, client);
    }

    ejectMass(client: PlayerTracker): void {
        for(let i = 0; i < client.cells.length; i++) {
            const cell = client.cells[i]!;

            if(!cell) {
                continue;
            }

            if(cell.mass < this.config.playerMinMassEject) {
                continue;
            }

            const deltaY = client.mouse.y - cell.position.y;
            const deltaX = client.mouse.x - cell.position.x;
            const angle = Math.atan2(deltaX, deltaY);

            // Get starting position
            const size = cell.getSize() + 5;
            const startPos = {
                x: cell.position.x + ((size + this.config.ejectMass) * Math.sin(angle)),
                y: cell.position.y + ((size + this.config.ejectMass) * Math.cos(angle))
            };

            // Remove mass from parent cell
            cell.mass -= this.config.ejectMassLoss;
            // Randomize angle
            const randomizedAngle = angle + (Math.random() * 0.4) - 0.2;

            // Create cell
            const ejected = new Entity.EjectedMass(this.getNextNodeId(), null, startPos, this.config.ejectMass, this);
            ejected.setAngle(randomizedAngle);
            ejected.setMoveEngineData(this.config.ejectSpeed, 20);
            ejected.setColor(cell.getColor());

            this.addNode(ejected);
            this.setAsMovingNode(ejected);
        }
    }

    newCellVirused(client: PlayerTracker, parent: Cell, angle: number, mass: number, speed: number): void {
        this.gameMode.newCellVirused(this, client, parent, angle, mass, speed);
    }

    shootVirus(parent: Cell): void {
        const parentPos = {
            x: parent.position.x,
            y: parent.position.y
        };

        const newVirus = new Entity.Virus(this.getNextNodeId(), null, parentPos, this.config.virusStartMass, this);
        newVirus.setAngle(parent.getAngle());
        newVirus.setMoveEngineData(200, 20);

        // Add to moving cells list
        this.addNode(newVirus);
        this.setAsMovingNode(newVirus);
    }

    getCellsInRange(cell: Cell): Cell[] {
        return this.gameMode.getCellsInRange(this, cell);
    }

    getNearestVirus(cell: Cell): Cell | null {
        return this.gameMode.getNearestVirus(this, cell);
    }

    updateCells(): void {
        if(!this.run) {
            // Server is paused
            return;
        }

        // Loop through all player cells
        const massDecay = 1 - (this.config.playerMassDecayRate * this.gameMode.decayMod);
        for(let i = 0; i < this.nodesPlayer.length; i++) {
            const cell = this.nodesPlayer[i] as PlayerCell;

            if(!cell) {
                continue;
            }

            if(cell.recombineTicks > 0) {
                // Recombining
                cell.recombineTicks--;
            }

            // Mass decay
            if(cell.mass >= this.config.playerMinMassDecay) {
                cell.mass *= massDecay;
            }
        }
    }

    loadConfig(): void {
        try {
            // Load the contents of the config file
            const load = Ini.parse(readFileSync("./gameserver.ini", "utf-8"));

            for(const obj in load) {
                if(obj.substr(0, 2) != "//") {
                    this.config[obj] = load[obj] as number | string;
                }
            }
        } catch {
            console.log("[33mConfig not found... Generating new config[0m");
            // Create a new config
            writeFileSync("./gameserver.ini", Ini.stringify(this.config));
        }
    }

    switchSpectator(player: PlayerTracker): void {
        let zname = player.name;
        if(zname === "") {
            zname = "Client";
        }
        console.log("[35m" + zname + " joined spectators[0m");

        if(this.gameMode.specByLeaderboard) {
            player.spectatedPlayer++;
            if(player.spectatedPlayer == this.leaderboard.length) {
                player.spectatedPlayer = 0;
            }
        } else {
            // Find next non-spectator with cells in the client list
            let oldPlayer = player.spectatedPlayer + 1;
            let count = 0;
            while(player.spectatedPlayer != oldPlayer && count != this.clients.length) {
                if(oldPlayer == this.clients.length) {
                    oldPlayer = 0;
                    continue;
                }
                if(!this.clients[oldPlayer]) {
                    // Break out of loop in case client tries to spectate an undefined player
                    player.spectatedPlayer = -1;
                    break;
                }
                if(this.clients[oldPlayer]!.playerTracker.cells.length > 0) {
                    break;
                }
                oldPlayer++;
                count++;
            }
            if(count == this.clients.length) {
                player.spectatedPlayer = -1;
            } else {
                player.spectatedPlayer = oldPlayer;
            }
        }
    }

    MasterPing(): void {
        try {
            renameSync("./client/api/stats.txt", "./client/api/stats.txt.bak");
            appendFileSync("./client/api/stats.txt", String(this.stats));
        } catch {
            appendFileSync("./client/api/stats.txt", String(this.stats));
        }
    }

    // Stats server
    startStatsServer(port: number): void {
        // Do not start the server if the port is negative
        if(port < 1) {
            return;
        }

        // Create stats
        this.stats = "Test";
        this.getStats();

        // Show stats
        this.httpServer = createServer((_req, res) => {
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.writeHead(200);
            res.end(this.stats);
        });

        this.httpServer.listen(port, () => {
            // Stats server
            console.log("* [33mLoaded stats server on port " + port + "[0m");
            setInterval(this.getStats.bind(this), this.config.serverStatsUpdate * 1000);
        });
    }

    getStats(): void {
        let humans = 0, bots = 0, players = 0, spectate = 0;
        for(let i = 0; i < this.clients.length; i++) {
            const client = this.clients[i]!.playerTracker;
            if(client.disconnect == -1) {
                if(!this.clients[i]!.isBot) {
                    if(client.spectate) {
                        spectate++;
                    } else {
                        humans++;
                    }
                } else {
                    bots++;
                }
                players++;
            }
        }

        const s = {
            current_players: players,
            alive: humans,
            spectators: spectate,
            max_players: this.config.serverMaxConnections,
            gamemode: this.gameMode.name,
            start_time: this.startTime,
            title: this.config.serverName
        };
        this.stats = JSON.stringify(s);
    }
}
