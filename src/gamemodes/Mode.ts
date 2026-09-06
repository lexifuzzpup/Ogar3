import { PlayerCell } from "../entity/PlayerCell.js";
import type { Cell } from "../entity/Cell.js";
import type { Virus } from "../entity/Virus.js";
import type { GameServer } from "../GameServer.js";
import type { PlayerTracker } from "../PlayerTracker.js";
import type { Color } from "../types.js";

export class Mode {
    ID = -1;
    name = "Blank";
    decayMod = 1.0; // Modifier for decay rate (Multiplier)
    packetLB = 49; // Packet id for leaderboard packet (48 = Text List, 49 = List, 50 = Pie chart)
    haveTeams = false; // True = gamemode uses teams, false = gamemode doesnt use teams
    nodesMother: Cell[] = [];
    tickMother = 0;
    tickMotherS = 0;

    // Config
    motherCellMass = 200;
    motherUpdateInterval = 5; // How many ticks it takes to update the mother cell (1 tick = 50 ms)
    motherSpawnInterval = 100; // How many ticks it takes to spawn another mother cell - Currently 5 seconds
    motherMinAmount = 5;
    specByLeaderboard = false; // false = spectate from player list instead of leaderboard

    // Only ever set by TeamX/TeamZ style gamemodes (see entity/MotherCell.ts checkEat) -
    // the base Mode/FFA/Teams/etc. gamemodes never define this, matching the original
    // (the standalone entity/MotherCell class's clamp against it is consequently a no-op
    // there, exactly as upstream).
    motherCellMaxMass?: number;

    // Set by Rainbow mode instead of monkey-patching Food.prototype.sendUpdate (see
    // entity/Food.ts sendUpdate).
    forceFoodUpdates?: boolean;

    // Override these

    onServerInit(gameServer: GameServer): void {
        // Called when the server starts
        gameServer.run = true;
    }

    onTick(_gameServer: GameServer): void {
        // Called on every game tick
    }

    onChange(_gameServer: GameServer): void {
        // Called when someone changes the gamemode via console commands
    }

    onPlayerInit(_player: PlayerTracker): void {
        // Called after a player object is constructed
    }

    onPlayerSpawn(gameServer: GameServer, player: PlayerTracker): void {
        // Called when a player is spawned
        player.color = gameServer.getRandomColor(); // Random color
        gameServer.spawnPlayer(player);
    }

    pressQ(gameServer: GameServer, player: PlayerTracker): void {
        // Called when the Q key is pressed
        if(player.spectate) {
            gameServer.switchSpectator(player);
        }
    }

    pressW(gameServer: GameServer, player: PlayerTracker): void {
        // Called when the W key is pressed
        gameServer.ejectMass(player);
    }

    pressSpace(gameServer: GameServer, player: PlayerTracker): void {
        // Called when the Space bar is pressed
        gameServer.splitCells(player);
    }

    onCellAdd(_cell: Cell): void {
        // Called when a player cell is added
    }

    onCellRemove(_cell: Cell): void {
        // Called when a player cell is removed
    }

    onCellMove(_x1: number, _y1: number, _cell: Cell): void {
        // Called when a player cell is moved
    }

    updateLB(_gameServer: GameServer): void {
        // Called when the leaderboard update function is called
    }

    // ---------------------------------------------------------------------------------------
    // Gamemode hook points. These carry GameServer's default behavior; TeamX/TeamZ (and
    // Blackhole/Experimental for getRandomSpawn) override just the ones they customize,
    // instead of monkey-patching GameServer.prototype/Virus.prototype at runtime.

    getRandomColor(gameServer: GameServer): Color {
        if(gameServer.config.serverOldColors) {
            const index = Math.floor(Math.random() * gameServer.oldcolors.length);
            const color = gameServer.oldcolors[index]!;
            return { r: color.r, b: color.b, g: color.g };
        } else {
            const colorRGB = [0xFF, 0x07, (Math.random() * 256) >> 0];
            colorRGB.sort(() => 0.5 - Math.random());
            return { r: colorRGB[0]!, b: colorRGB[1]!, g: colorRGB[2]! };
        }
    }

    getRandomSpawn(gameServer: GameServer): { x: number; y: number } {
        let pos: { x: number; y: number } | undefined;

        if(gameServer.currentFood > 0) {
            // Spawn from food
            let node: Cell | undefined;
            for(let i = (gameServer.nodes.length - 1); i > -1; i--) {
                // Find random food
                node = gameServer.nodes[i];

                if(!node || node.inRange) {
                    // Skip if food is about to be eaten/undefined
                    continue;
                }

                if(node.getType() == 1) {
                    pos = { x: node.position.x, y: node.position.y };
                    gameServer.removeNode(node);
                    break;
                }
            }
        }

        if(!pos) {
            // Get random spawn if no food cell is found
            pos = gameServer.getRandomPosition();
        }

        return pos!;
    }

    getCellsInRange(gameServer: GameServer, cell: Cell): Cell[] {
        const list: Cell[] = [];
        const squareR = cell.getSquareSize(); // Get cell squared radius

        // Loop through all cells that are visible to the cell. There is probably a more efficient way of doing this but whatever
        const len = cell.owner!.visibleNodes.length;
        for(let i = 0; i < len; i++) {
            const check = cell.owner!.visibleNodes[i];

            if(typeof check === "undefined") {
                continue;
            }

            // if something already collided with this cell, don't check for other collisions
            if(check.inRange) {
                continue;
            }

            // Can't eat itself
            if(cell.nodeId == check.nodeId) {
                continue;
            }

            // Can't eat cells that have collision turned off
            if((cell.owner == check.owner) && ((cell as PlayerCell).ignoreCollision)) {
                continue;
            }

            if(!check.collisionCheck2(squareR, cell.position)) {
                continue;
            }

            // Cell type check - Cell must be bigger than this number times the mass of the cell being eaten
            let multiplier = 1.25;

            switch(check.getType()) {
                case 1: // Food cell
                    list.push(check);
                    check.inRange = true; // skip future collision checks for this food
                    continue;
                case 2: // Virus
                    multiplier = 1.33;
                    break;
                case 0: { // Players
                    const checkCell = check as PlayerCell;
                    const ownCell = cell as PlayerCell;
                    // Can't eat self if it's not time to recombine yet
                    if(check.owner == cell.owner) {
                        if((ownCell.recombineTicks > 0) || (checkCell.recombineTicks > 0)) {
                            continue;
                        }

                        multiplier = 1.00;
                    }

                    // Can't eat team members
                    if(this.haveTeams) {
                        if(!check.owner) { // Error check
                            continue;
                        }

                        if((check.owner != cell.owner) && (check.owner.getTeam() == cell.owner!.getTeam())) {
                            continue;
                        }
                    }
                    break;
                }
                default:
                    break;
            }

            // Make sure the cell is big enough to be eaten.
            if((check.mass * multiplier) > cell.mass) {
                continue;
            }

            // Eating range
            const xs = Math.pow(check.position.x - cell.position.x, 2);
            const ys = Math.pow(check.position.y - cell.position.y, 2);
            const dist = Math.sqrt(xs + ys);

            const eatingRange = cell.getSize() - check.getEatingRange(); // Eating range = radius of eating cell + 40% of the radius of the cell being eaten
            if(dist > eatingRange) {
                // Not in eating range
                continue;
            }

            // Add to list of cells nearby
            list.push(check);

            // Something is about to eat this cell; no need to check for other collisions with it
            check.inRange = true;
        }
        return list;
    }

    getNearestVirus(gameServer: GameServer, cell: Cell): Cell | null {
        // More like getNearbyVirus. Return type is the wider `Cell` (not `Virus`) because
        // TeamZ's override also returns its Hero/Brain cells here (see TeamZ.ts).
        let virus: Cell | null = null;
        const r = 100; // Checking radius

        const topY = cell.position.y - r;
        const bottomY = cell.position.y + r;

        const leftX = cell.position.x - r;
        const rightX = cell.position.x + r;

        // Loop through all viruses on the map. There is probably a more efficient way of doing this but whatever
        const len = gameServer.nodesVirus.length;
        for(let i = 0; i < len; i++) {
            const check = gameServer.nodesVirus[i];

            if(typeof check === "undefined") {
                continue;
            }

            if(!check.collisionCheck(bottomY, topY, rightX, leftX)) {
                continue;
            }

            // Add to list of cells nearby
            virus = check;
            break; // stop checking when a virus found
        }
        return virus;
    }

    splitCells(gameServer: GameServer, client: PlayerTracker): void {
        const len = client.cells.length;
        for(let i = 0; i < len; i++) {
            if(client.cells.length >= gameServer.config.playerMaxCells) {
                // Player cell limit
                continue;
            }

            const cell = client.cells[i] as PlayerCell;
            if(!cell) {
                continue;
            }

            if(cell.mass < gameServer.config.playerMinMassSplit) {
                continue;
            }

            // Get angle
            const deltaY = client.mouse.y - cell.position.y;
            const deltaX = client.mouse.x - cell.position.x;
            const angle = Math.atan2(deltaX, deltaY);

            // Get starting position
            const size = cell.getSize() / 2;
            const startPos = {
                x: cell.position.x + (size * Math.sin(angle)),
                y: cell.position.y + (size * Math.cos(angle))
            };
            // Calculate mass and speed of splitting cell
            const splitSpeed = cell.getSpeed() * gameServer.config.playerSplitSpeedMultiplier;
            const newMass = cell.mass / 2;
            cell.mass = newMass;
            // Create cell
            const split = new PlayerCell(gameServer.getNextNodeId(), client, startPos, newMass, gameServer);
            split.setAngle(angle);
            split.setMoveEngineData(splitSpeed, 32, 0.85);
            split.calcMergeTime(gameServer.config.playerRecombineTime);
            if(gameServer.config.playerSmoothSplit) {
                split.ignoreCollision = true;
                split.restoreCollisionTicks = 8;
            }

            // Add to moving cells list
            gameServer.addNode(split); // moved this here,. to see if it needs be aded, before move...
            gameServer.setAsMovingNode(split);
        }
    }

    newCellVirused(gameServer: GameServer, client: PlayerTracker, parent: Cell, angle: number, mass: number, speed: number): void {
        // Starting position
        const startPos = {
            x: parent.position.x,
            y: parent.position.y
        };

        // Create cell
        const newCell = new PlayerCell(gameServer.getNextNodeId(), client, startPos, mass, gameServer);
        newCell.setAngle(angle);
        newCell.setMoveEngineData(speed * gameServer.config.playerPopsplitSpeed, 15);
        newCell.calcMergeTime(gameServer.config.playerRecombineTime);
        newCell.ignoreCollision = true; // Turn off collision

        // Add to moving cells list
        gameServer.addNode(newCell);
        gameServer.setAsMovingNode(newCell);
    }

    // Optional virus-behavior hooks: undefined means "use Virus's own built-in behavior".
    onVirusFeed?(virus: Virus, feeder: Cell, gameServer: GameServer): void;
    onVirusConsume?(virus: Virus, consumer: Cell, gameServer: GameServer): void;
}
