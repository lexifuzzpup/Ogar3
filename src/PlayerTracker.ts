import { createWriteStream } from "node:fs";
import { UpdateNodes } from "./packet/UpdateNodes.js";
import { UpdatePosition } from "./packet/UpdatePosition.js";
import type { Cell } from "./entity/Cell.js";
import type { GameServer } from "./GameServer.js";
import type { ClientSocket, Color, Position, ViewBox } from "./types.js";

function fillChar(data: unknown, char: string, fieldLength: number, rTL?: boolean): string {
    let result = String(data);
    if(rTL === true) {
        for(let i = result.length; i < fieldLength; i++) {
            result = char.concat(result);
        }
    } else {
        for(let i = result.length; i < fieldLength; i++) {
            result = result.concat(char);
        }
    }
    return result;
}

export class PlayerTracker {
    pID = -1;
    disconnect = -1; // Disconnection
    name = "";
    gameServer: GameServer;
    socket: ClientSocket;
    nodeAdditionQueue: Cell[] = [];
    nodeDestroyQueue: Cell[] = [];
    visibleNodes: Cell[] = [];
    cells: Cell[] = [];
    score = 0; // Leaderboard
    hscore = 0; // High score
    cscore = 0; // Max Cells
    remoteAddress = "undefined";
    mouse: Position = { x: 0, y: 0 };
    tickLeaderboard = 0; //
    tickViewBox = 0;
    WriteInfo = 0; // Update for score file
    mouseCells: Cell[] = []; // For individual cell movement
    team = 0;
    spectate = true;
    spectatedPlayer = -1; // Current player that this player is watching

    // Color is always assigned by the active gamemode's onPlayerSpawn before this player has
    // any visible cells; defaulted here only so the field is never actually undefined.
    color: Color = { r: 0, g: 0, b: 0 };

    // Viewing box
    sightRangeX = 0;
    sightRangeY = 0;
    centerPos: Position = { x: 3000, y: 3000 };
    viewBox: ViewBox = {
        topY: 0,
        bottomY: 0,
        leftX: 0,
        rightX: 0,
        width: 0, // Half-width
        height: 0 // Half-height
    };

    // Set by PacketHandler's chat spam check (was module-level state there before this port -
    // see PacketHandler.ts).
    cTime?: Date;

    // Gamemode-specific ad-hoc state. Each of these belongs to exactly one gamemode (noted
    // below) which is the only place that reads or writes it; kept here (rather than on
    // subclasses) because the original attached them directly to PlayerTracker instances at
    // runtime regardless of which gamemode was active.
    nofood?: boolean; // (unused by any shipped gamemode today, but read by PlayerCell.onConsume)
    juggernaut?: boolean; // entity/MotherCell.ts checkEat
    makeNotJuggernaut?: () => void; // entity/MotherCell.ts checkEat
    zColorFactor?: number; // gamemodes/TeamZ.ts
    zColorIncr?: boolean; // gamemodes/TeamZ.ts
    crazyTimer?: number; // gamemodes/TeamZ.ts
    eatenHeroTimer?: number; // gamemodes/TeamZ.ts
    eatenBrainTimer?: number; // gamemodes/TeamZ.ts
    cured?: boolean; // gamemodes/TeamZ.ts
    colorToggle?: number; // gamemodes/TeamZ.ts
    heroColorFactor?: number; // gamemodes/TeamZ.ts

    constructor(gameServer: GameServer, socket: ClientSocket) {
        this.gameServer = gameServer;
        this.socket = socket;

        // Gamemode function
        this.pID = gameServer.getNewPlayerID();
        gameServer.gameMode.onPlayerInit(this);
    }

    // Setters/Getters

    setName(name: string): void {
        this.name = name;
    }

    getName(): string {
        return this.name;
    }

    getScore(reCalcScore: boolean): number {
        if(reCalcScore) {
            let s = 0;
            for(let i = 0; i < this.cells.length; i++) {
                s += this.cells[i]!.mass;
                this.score = s;
                if(s > this.hscore) {
                    this.hscore = s;
                }
            }
        }
        if(this.cells.length > this.cscore) {
            this.cscore = this.cells.length;
        }
        return this.score >> 0;
    }

    setColor(color: Color): void {
        this.color.r = color.r;
        this.color.b = color.b;
        this.color.g = color.g;
    }

    getTeam(): number {
        return this.team;
    }

    // Functions

    update(): void {
        // Actions buffer (So that people cant spam packets)
        if(this.socket.packetHandler.pressSpace) { // Split cell
            this.gameServer.gameMode.pressSpace(this.gameServer, this);
            this.socket.packetHandler.pressSpace = false;
        }

        if(this.socket.packetHandler.pressW) { // Eject mass
            this.gameServer.gameMode.pressW(this.gameServer, this);
            this.socket.packetHandler.pressW = false;
        }

        if(this.socket.packetHandler.pressQ) { // Q Press
            this.gameServer.gameMode.pressQ(this.gameServer, this);
            this.socket.packetHandler.pressQ = false;
        }

        const updateNodes: Cell[] = []; // Nodes that need to be updated via packet

        // Remove nodes from visible nodes if possible
        let d = 0;
        while(d < this.nodeDestroyQueue.length) {
            const index = this.visibleNodes.indexOf(this.nodeDestroyQueue[d]!);
            if(index > -1) {
                this.visibleNodes.splice(index, 1);
                d++; // Increment
            } else {
                // Node was never visible anyways
                this.nodeDestroyQueue.splice(d, 1);
            }
        }

        // Get visible nodes every 400 ms
        const nonVisibleNodes: Cell[] = []; // Nodes that are not visible
        if(this.tickViewBox <= 0) {
            const newVisible = this.calcViewBox();

            // Compare and destroy nodes that are not seen
            for(let i = 0; i < this.visibleNodes.length; i++) {
                const index = newVisible.indexOf(this.visibleNodes[i]!);
                if(index == -1) {
                    // Not seen by the client anymore
                    nonVisibleNodes.push(this.visibleNodes[i]!);
                }
            }

            // Add nodes to client's screen if client has not seen it already
            for(let i = 0; i < newVisible.length; i++) {
                const index = this.visibleNodes.indexOf(newVisible[i]!);
                if(index == -1) {
                    updateNodes.push(newVisible[i]!);
                }
            }
            this.visibleNodes = newVisible;
            // Reset Ticks
            this.tickViewBox = 4;
        } else {
            this.tickViewBox--;
            // Add nodes to screen
            for(let i = 0; i < this.nodeAdditionQueue.length; i++) {
                const node = this.nodeAdditionQueue[i]!;
                this.visibleNodes.push(node);
                updateNodes.push(node);
            }
        }

        // Update moving nodes
        for(let i = 0; i < this.visibleNodes.length; i++) {
            const node = this.visibleNodes[i]!;
            if(node.sendUpdate()) {
                // Sends an update if cell is moving
                updateNodes.push(node);
            }
        }

        // Send packet
        this.socket.sendPacket(new UpdateNodes(this.nodeDestroyQueue, updateNodes, nonVisibleNodes, this.gameServer.config.serverVersion));

        this.nodeDestroyQueue = []; // Reset destroy queue
        this.nodeAdditionQueue = []; // Reset addition queue

        // Update leaderboard
        if(this.tickLeaderboard <= 0) {
            this.socket.sendPacket(this.gameServer.lb_packet);
            this.tickLeaderboard = 25; // 20 ticks = 1 second
            this.WriteInfo--;
        } else {
            this.tickLeaderboard--;
        }

        // Write Score File
        if(this.WriteInfo <= 0) {
            PlayerTracker.writeStatsFile(this.gameServer);
            this.WriteInfo = 12;
        }

        // Handles disconnections
        if(this.disconnect > 0) {
            // Player has disconnected... remove it when the timer hits -1
            this.disconnect--;
            if(this.cells.length) {
                // Remove all client cells
                const len = this.cells.length;
                for(let i = 0; i < len; i++) {
                    const cell = this.socket.playerTracker.cells[0];
                    if(!cell) {
                        continue;
                    }
                    this.gameServer.removeNode(cell);
                }
            }
            if(this.disconnect == 0) {
                // Remove from client list
                const index = this.gameServer.clients.indexOf(this.socket);
                if(index != -1) {
                    this.gameServer.clients.splice(index, 1);
                }
            }
        }
    }

    // Viewing box
    updateSightRange(): void { // For view distance
        let totalSize = 1.0;
        const len = this.cells.length;

        for(let i = 0; i < len; i++) {
            if(!this.cells[i]) {
                continue;
            }
            totalSize += this.cells[i]!.getSize();
        }

        const factor = Math.pow(Math.min(64.0 / totalSize, 1), 0.4);
        this.sightRangeX = this.gameServer.config.serverViewBaseX / factor;
        this.sightRangeY = this.gameServer.config.serverViewBaseY / factor;
    }

    updateCenter(): void { // Get center of cells
        const len = this.cells.length;

        if(len <= 0) {
            return; // End the function if no cells exist
        }

        let X = 0;
        let Y = 0;
        for(let i = 0; i < len; i++) {
            if(!this.cells[i]) {
                continue;
            }

            X += this.cells[i]!.position.x;
            Y += this.cells[i]!.position.y;
        }

        this.centerPos.x = X / len >> 0;
        this.centerPos.y = Y / len >> 0;
    }

    calcViewBox(): Cell[] {
        if(this.spectate) {
            // Spectate mode
            return this.getSpectateNodes();
        }

        // Main function
        this.updateSightRange();
        this.updateCenter();

        // Box
        this.viewBox.topY = this.centerPos.y - this.sightRangeY;
        this.viewBox.bottomY = this.centerPos.y + this.sightRangeY;
        this.viewBox.leftX = this.centerPos.x - this.sightRangeX;
        this.viewBox.rightX = this.centerPos.x + this.sightRangeX;
        this.viewBox.width = this.sightRangeX;
        this.viewBox.height = this.sightRangeY;

        const newVisible: Cell[] = [];
        for(let i = 0; i < this.gameServer.nodes.length; i++) {
            const node = this.gameServer.nodes[i];

            if(!node) {
                continue;
            }

            if(node.visibleCheck(this.viewBox, this.centerPos)) {
                // Cell is in range of viewBox
                newVisible.push(node);
            }
        }
        return newVisible;
    }

    getSpectateNodes(): Cell[] {
        let specPlayer: PlayerTracker | null;

        if(this.gameServer.getMode().specByLeaderboard) {
            this.spectatedPlayer = Math.min(this.gameServer.leaderboard.length - 1, this.spectatedPlayer);
            specPlayer = this.spectatedPlayer == -1 ? null : this.gameServer.leaderboard[this.spectatedPlayer] as PlayerTracker;
        } else {
            this.spectatedPlayer = Math.min(this.gameServer.clients.length - 1, this.spectatedPlayer);
            specPlayer = this.spectatedPlayer == -1 ? null : this.gameServer.clients[this.spectatedPlayer]!.playerTracker;
        }

        if(specPlayer) {
            // If selected player has died/disconnected, switch spectator and try again next tick
            if(specPlayer.cells.length == 0) {
                this.gameServer.switchSpectator(this);
                return [];
            }

            // Get spectated player's location and calculate zoom amount
            let specZoom = Math.sqrt(100 * specPlayer.score);
            specZoom = Math.pow(Math.min(40.5 / specZoom, 1.0), 0.4) * 0.6;
            // TODO: Send packet elsewhere so it is send more often
            this.socket.sendPacket(new UpdatePosition(specPlayer.centerPos.x, specPlayer.centerPos.y, specZoom));
            // TODO: Recalculate visible nodes for spectator to match specZoom
            return specPlayer.visibleNodes.slice(0, specPlayer.visibleNodes.length);
        } else {
            return []; // Nothing
        }
    }

    private static writeStatsFile(gameServer: GameServer): void {
        const wstream = createWriteStream("logs/playerlog.txt");
        wstream.write("OGar Server - Game Mode: " + gameServer.gameMode.name + " - ");
        wstream.write("Running Time: " + parseInt(String(process.uptime())) + "sec\n");

        for(let i = 0; i < gameServer.clients.length; i++) {
            const client = gameServer.clients[i]!.playerTracker;
            const id = fillChar(client.pID, " ", 5, true);

            // Get ip (15 digits length)
            let ip = "BOT";
            if(typeof gameServer.clients[i]!.remoteAddress != "undefined") {
                ip = gameServer.clients[i]!.remoteAddress!;
            }

            let nick = "", cells = "", score = "";
            if((client.hscore > 0) && (client.cscore > 0)) {
                nick = fillChar((client.name == "") ? "An unnamed cell" : client.name, " ", gameServer.config.playerMaxNickLength);
                cells = fillChar(parseInt(String(client.cscore)), " ", 2, true);
                score = fillChar(parseInt(String(client.hscore)), " ", 6, true);
                const data = client.cells.length > 0 ? "1" : "0";
                wstream.write("ID:" + id + ", Nick: " + nick + ", Score: " + score + ", Cells: " + cells + ", Status: " + data + " IP: " + ip + "\n");
            }
        }
        wstream.end();
    }
}
