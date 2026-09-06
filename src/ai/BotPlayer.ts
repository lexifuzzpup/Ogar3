import { PlayerTracker } from "../PlayerTracker.js";
import type { Cell } from "../entity/Cell.js";
import type { PlayerCell } from "../entity/PlayerCell.js";
import type { GameServer } from "../GameServer.js";
import type { ClientSocket, Position } from "../types.js";

export class BotPlayer extends PlayerTracker {
    // AI only
    gameState = 0;
    path: unknown[] = [];

    predators: Cell[] = []; // List of cells that can eat this bot
    threats: Cell[] = []; // List of cells that can eat this bot but are too far away
    prey: Cell[] = []; // List of cells that can be eaten by this bot
    food: Cell[] = [];
    foodImportant: Cell[] = []; // Not used - Bots will attempt to eat this regardless of nearby prey/predators
    virus: Cell[] = []; // List of viruses

    juke = false;

    target: Cell | null = null;
    targetVirus: Cell | null = null; // Virus used to shoot into the target
    currentTarget?: unknown; // never actually set anywhere - findNearest's guard below is always false, as in the original

    ejectMass = 1; // Amount of times to eject mass
    oldPos: Position = { x: 0, y: 0 };

    constructor(gameServer: GameServer, socket: ClientSocket) {
        super(gameServer, socket);
    }

    // Functions

    getLowestCell(): Cell | null {
        // Gets the cell with the lowest mass
        if(this.cells.length <= 0) {
            return null; // Error!
        }

        // Starting cell
        let lowest = this.cells[0]!;
        for(let i = 1; i < this.cells.length; i++) {
            if(lowest.mass > this.cells[i]!.mass) {
                lowest = this.cells[i]!;
            }
        }
        return lowest;
    }

    // Override

    override updateSightRange(): void { // For view distance
        let range = 1500; // Base sight range

        if(this.cells[0]) {
            range += this.cells[0].getSize() * 2.5;
        }

        this.sightRangeX = range;
        this.sightRangeY = range;
    }

    override update(): void { // Overrides the update function from player tracker
        // Remove nodes from visible nodes if possible
        for(let i = 0; i < this.nodeDestroyQueue.length; i++) {
            const index = this.visibleNodes.indexOf(this.nodeDestroyQueue[i]!);
            if(index > -1) {
                this.visibleNodes.splice(index, 1);
            }
        }

        // Update every 500 ms
        if((this.tickViewBox <= 0) && (this.gameServer.run)) {
            this.visibleNodes = this.calcViewBox();
            this.tickViewBox = 10;
        } else {
            this.tickViewBox--;
            return;
        }

        // Respawn if bot is dead
        if(this.cells.length <= 0) {
            this.gameServer.spawnPlayer(this);
        }

        // Calc predators/prey
        const cell = this.getLowestCell()!;
        const r = cell.getSize();
        this.clearLists();

        // Ignores targeting cells below this mass
        // (kept faithful to the original's single-arg Math.min, which is just a no-op cast)
        const ignoreMass = Math.min(cell.mass / 2.5);
        void ignoreMass; // computed but unused, as in the original

        // Loop
        for(const i in this.visibleNodes) {
            const check = this.visibleNodes[i];

            // Cannot target itself
            if((!check) || (cell.owner == check.owner)) {
                continue;
            }

            const t = check.getType();
            switch(t) {
                case 0:
                    // Cannot target teammates
                    if(this.gameServer.gameMode.haveTeams) {
                        if(check.owner!.team == this.team) {
                            continue;
                        }
                    }

                    // Check for danger
                    if(cell.mass > (check.mass * 1.125) && (check.mass > 100)) {
                        // Add to prey list
                        this.prey.push(check);
                    } else if(check.mass > (cell.mass * 1.2)) {
                        // Predator
                        const dist = this.getDist(cell, check) - (r + check.getSize());
                        if(dist < 300) {
                            this.predators.push(check);
                            if((this.cells.length == 1) && (dist < 0)) {
                                this.juke = true;
                            }
                        }
                        this.threats.push(check);
                    } else {
                        this.threats.push(check);
                    }
                    break;
                case 1:
                    this.food.push(check);
                    break;
                case 2: // Virus
                    this.virus.push(check);
                    break;
                case 3: // Ejected mass
                    if(cell.mass > 16) {
                        this.food.push(check);
                    }
                    break;
                default:
                    break;
            }
        }

        // Get gamestate
        const newState = this.getState(cell);
        if((newState != this.gameState) && (newState != 4)) {
            // Clear target
            this.target = null;
        }
        this.gameState = newState;

        // Action
        this.decide(cell);

        this.nodeDestroyQueue = []; // Empty
    }

    // Custom

    clearLists(): void {
        this.predators = [];
        this.threats = [];
        this.prey = [];
        this.food = [];
        this.virus = [];
        this.juke = false;
    }

    getState(cell: Cell): number {
        // Continue to shoot viruses
        if(this.gameState == 4) {
            return 4;
        }

        // Check for predators
        if(this.predators.length <= 0) {
            if(this.prey.length > 0) {
                return 3;
            } else if(this.food.length > 0) {
                return 1;
            }
        } else if(this.threats.length > 0) {
            if((this.cells.length == 1) && (cell.mass > 180)) {
                const t = this.getBiggest(this.threats);
                const tl = this.findNearbyVirus(t, 500, this.virus);
                if(tl != false) {
                    this.target = t;
                    this.targetVirus = tl;
                    return 4;
                }
            } else {
                // Run
                return 2;
            }
        }

        // Bot wanders by default
        return 0;
    }

    decide(cell: Cell): void {
        // The bot decides what to do based on gamestate
        switch(this.gameState) {
            case 0: { // Wander
                if((this.centerPos.x == this.mouse.x) && (this.centerPos.y == this.mouse.y)) {
                    // Get a new position
                    const index = Math.floor(Math.random() * this.gameServer.nodes.length);
                    const randomNode = this.gameServer.nodes[index]!;
                    let pos = { x: 0, y: 0 };

                    if((randomNode.getType() == 3) || (randomNode.getType() == 1)) {
                        pos.x = randomNode.position.x;
                        pos.y = randomNode.position.y;
                    } else {
                        // Not a food/ejected cell
                        pos = this.gameServer.getRandomPosition();
                    }

                    // Set bot's mouse coords to this location
                    this.mouse = { x: pos.x, y: pos.y };
                }
                break;
            }
            case 1: // Looking for food
                if((!this.target) || (this.visibleNodes.indexOf(this.target) == -1)) {
                    // Food is eaten/out of sight... so find a new food cell to target
                    this.target = this.findNearest(cell, this.food);

                    this.mouse = { x: this.target!.position.x, y: this.target!.position.y };
                }
                break;
            case 2: { // Run from (potential) predators
                const avoid = this.combineVectors(this.predators);

                // Find angle of vector between cell and predator
                const deltaY = avoid.y - cell.position.y;
                const deltaX = avoid.x - cell.position.x;
                let angle = Math.atan2(deltaX, deltaY);

                // Now reverse the angle
                if(angle > Math.PI) {
                    angle -= Math.PI;
                } else {
                    angle += Math.PI;
                }

                // Direction to move
                const x1 = cell.position.x + (500 * Math.sin(angle));
                const y1 = cell.position.y + (500 * Math.cos(angle));

                this.mouse = { x: x1, y: y1 };

                // Cheating
                if(cell.mass < 250) {
                    cell.mass += 0;
                }

                if(this.juke) {
                    // Juking
                    this.gameServer.splitCells(this);
                }

                break;
            }
            case 3: { // Target prey
                if((!this.target) || (cell.mass < (this.target.mass * 1.2)) || this.target.mass > 200 || (this.visibleNodes.indexOf(this.target) == -1)) {
                    this.target = this.getRandom(this.prey);
                }

                this.mouse = { x: this.target!.position.x, y: this.target!.position.y };

                const massReq = 1.25 * (this.target!.mass * 2) * this.cells.length; // Mass required to splitkill the target

                if((cell.mass > massReq) && (this.cells.length < 3)) { // Will not split into more than 4 cells
                    const splitDist = (4 * (cell.getSpeed() * 6)) + (cell.getSize() * 1.75); // Distance needed to splitkill
                    const distToTarget = this.getAccDist(cell, this.target!); // Distance between the target and this cell

                    if(splitDist >= distToTarget) {
                        if((this.threats.length > 0) && (this.getBiggest(this.threats).mass > (1.25 * (cell.mass / 2)))) {
                            // Dont splitkill when they are cells that can possibly eat you after the split
                            break;
                        }
                        // Splitkill
                        this.gameServer.splitCells(this);
                    }
                }
                break;
            }
            case 4: { // Shoot virus
                if((!this.target) || (!this.targetVirus) || (this.cells.length === 0) || (this.visibleNodes.indexOf(this.target) == -1) || (this.visibleNodes.indexOf(this.targetVirus) == -1)) {
                    this.gameState = 0; // Reset
                    this.target = null;
                    break;
                }

                // Make sure target is within range
                const dist = this.getDist(this.targetVirus, this.target) - (this.target.getSize() + 100);
                if(dist > 500) {
                    this.gameState = 0; // Reset
                    this.target = null;
                    break;
                }

                // Find angle of vector between target and virus
                const angle = this.getAngle(this.target, this.targetVirus);

                // Now reverse the angle
                const reversed = this.reverseAngle(angle);

                // Get this bot cell's angle
                const ourAngle = this.getAngle(cell, this.targetVirus);

                // Check if bot cell is in position
                if((ourAngle <= (reversed + 0.25)) && (ourAngle >= (reversed - 0.25))) {
                    // In position!
                    this.mouse = { x: this.targetVirus.position.x, y: this.targetVirus.position.y };

                    // Shoot
                    for(let v = 0; v < 5; v++) {
                        this.gameServer.ejectMass(this);
                    }

                    // Back to starting pos
                    this.mouse = { x: cell.position.x, y: cell.position.y };

                    // Cleanup
                    this.gameState = 0; // Reset
                    this.target = null;
                } else {
                    // Move to position
                    const r = cell.getSize();
                    const x1 = this.targetVirus.position.x + ((350 + r) * Math.sin(reversed));
                    const y1 = this.targetVirus.position.y + ((350 + r) * Math.cos(reversed));
                    this.mouse = { x: x1, y: y1 };
                }

                break;
            }
            default:
                this.gameState = 0;
                break;
        }

        // Recombining
        if(this.cells.length > 1) {
            let r = 0;
            // Get amount of cells that can merge
            for(const i in this.cells) {
                if((this.cells[i] as PlayerCell).recombineTicks == 0) {
                    r++;
                }
            }
            // Merge
            if(r >= 2) {
                this.mouse.x = this.centerPos.x;
                this.mouse.y = this.centerPos.y;
                this.gameState = 0;
            }
        }
    }

    // Finds the nearest cell in list
    findNearest(cell: Cell, list: Cell[]): Cell | null {
        if(this.currentTarget) {
            // Do not check for food if target already exists
            return null;
        }

        // Check for nearest cell in list
        let shortest = list[0]!;
        let shortestDist = this.getDist(cell, shortest);
        for(let i = 1; i < list.length; i++) {
            const check = list[i]!;
            const dist = this.getDist(cell, check);
            if(shortestDist > dist) {
                shortest = check;
                shortestDist = dist;
            }
        }

        return shortest;
    }

    getRandom(list: Cell[]): Cell {
        // Gets a random cell from the array
        const n = Math.floor(Math.random() * list.length);
        return list[n]!;
    }

    combineVectors(list: Cell[]): Position {
        // Gets the angles of all enemies approaching the cell
        const pos = { x: 0, y: 0 };
        let check: Cell;
        for(let i = 0; i < list.length; i++) {
            check = list[i]!;
            pos.x += check.position.x;
            pos.y += check.position.y;
        }

        // Get avg
        pos.x = pos.x / list.length;
        pos.y = pos.y / list.length;

        return pos;
    }

    getBiggest(list: Cell[]): Cell {
        // Gets the biggest cell from the array
        let biggest = list[0]!;
        for(let i = 1; i < list.length; i++) {
            const check = list[i]!;
            if(check.mass > biggest.mass) {
                biggest = check;
            }
        }

        return biggest;
    }

    findNearbyVirus(cell: Cell, checkDist: number, list: Cell[]): Cell | false {
        const r = cell.getSize() + 100; // Gets radius + virus radius
        for(let i = 0; i < list.length; i++) {
            const check = list[i]!;
            const dist = this.getDist(cell, check) - r;
            if(checkDist > dist) {
                return check;
            }
        }
        return false; // Returns a bool if no nearby viruses are found
    }

    getDist(cell: Cell, check: Cell): number {
        // Fastest distance - I have a crappy computer to test with :(
        let xd = (check.position.x - cell.position.x);
        xd = xd < 0 ? xd * -1 : xd; // Math.abs is slow

        let yd = (check.position.y - cell.position.y);
        yd = yd < 0 ? yd * -1 : yd; // Math.abs is slow

        return (xd + yd);
    }

    getAccDist(cell: Cell, check: Cell): number {
        // Accurate Distance
        let xs = check.position.x - cell.position.x;
        xs = xs * xs;

        let ys = check.position.y - cell.position.y;
        ys = ys * ys;

        return Math.sqrt(xs + ys);
    }

    getAngle(c1: Cell, c2: Cell): number {
        const deltaY = c1.position.y - c2.position.y;
        const deltaX = c1.position.x - c2.position.x;
        return Math.atan2(deltaX, deltaY);
    }

    reverseAngle(angle: number): number {
        if(angle > Math.PI) {
            angle -= Math.PI;
        } else {
            angle += Math.PI;
        }
        return angle;
    }
}
