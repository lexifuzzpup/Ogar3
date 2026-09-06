import { Teams } from "./Teams.js";
import { Cell } from "../entity/Cell.js";
import { Food } from "../entity/Food.js";
import { Virus } from "../entity/Virus.js";
import type { PlayerCell } from "../entity/PlayerCell.js";
import type { GameServer } from "../GameServer.js";
import type { PlayerTracker } from "../PlayerTracker.js";
import type { Color, Position } from "../types.js";

export class TeamX extends Teams {
    pushVirus = false; // true: pushing virus, false: splitting virus
    colorFuzziness = 72;

    constructor() {
        super();
        this.ID = 14;
        this.name = "Experimental Team";
        // configurations:
        this.motherCellMass = 200;
        this.motherUpdateInterval = 5; // How many ticks it takes to update the mother cell (1 tick = 50 ms)
        this.motherSpawnInterval = 100; // How many ticks it takes to spawn another mother cell - Currently 5 seconds
        this.motherMinAmount = 5;

        // game mode data:
        this.colors = [
            { r: 255, g: 7, b: 7 },
            { r: 7, g: 255, b: 7 },
            { r: 7, g: 7, b: 255 }
        ];
        this.nodesMother = [];
        this.tickMother = 0;
        this.tickMotherS = 0;
    }

    // Gamemode Specific Functions

    updateMotherCells(gameServer: GameServer): void {
        for(const i in this.nodesMother) {
            const mother = this.nodesMother[i] as MotherCell;

            // Checks
            mother.update(gameServer);
            mother.checkEat(gameServer);
        }
    }

    spawnMotherCell(gameServer: GameServer): void {
        // Checks if there are enough mother cells on the map
        if(this.nodesMother.length < this.motherMinAmount) {
            // Spawns a mother cell
            const pos = gameServer.getRandomPosition();

            // Check for players
            for(let i = 0; i < gameServer.nodesPlayer.length; i++) {
                const check = gameServer.nodesPlayer[i]!;

                const r = check.getSize(); // Radius of checking player cell

                // Collision box
                const topY = check.position.y - r;
                const bottomY = check.position.y + r;
                const leftX = check.position.x - r;
                const rightX = check.position.x + r;

                // Check for collisions
                if(pos.y > bottomY) {
                    continue;
                }

                if(pos.y < topY) {
                    continue;
                }

                if(pos.x > rightX) {
                    continue;
                }

                if(pos.x < leftX) {
                    continue;
                }

                // Collided
                return;
            }

            // Spawn if no cells are colliding
            const m = new MotherCell(gameServer.getNextNodeId(), null, pos, this.motherCellMass, gameServer);
            gameServer.addNode(m);
        }
    }

    countNotInRange(client: PlayerTracker): number {
        let count = 0;
        for(let i = 0; i < client.cells.length; i++) {
            const cell = client.cells[i]!;
            if(!(cell.inRange === true)) {
                count++;
            }
        }
        return count;
    }

    // Overwrite:

    override fuzzColorComponent(component: number): number {
        if(component != 255) {
            component = Math.random() * (this.colorFuzziness - 7) + 7;
        }
        return component;
    }

    override getTeamColor(team: number): Color {
        const color = this.colors[team]!;
        return {
            r: this.fuzzColorComponent(color.r),
            b: this.fuzzColorComponent(color.b),
            g: this.fuzzColorComponent(color.g)
        };
    }

    override onServerInit(gameServer: GameServer): void {
        // Set up teams
        for(let i = 0; i < this.teamAmount; i++) {
            this.nodes[i] = [];
        }

        // migrate current players to team mode
        for(let i = 0; i < gameServer.clients.length; i++) {
            const client = gameServer.clients[i]!.playerTracker;
            this.onPlayerInit(client);
            client.color = this.getTeamColor(client.team);
            for(let j = 0; j < client.cells.length; j++) {
                const cell = client.cells[j]!;
                cell.setColor(client.color);
                this.nodes[client.team]!.push(cell);
            }
        }
    }

    override onVirusFeed(virus: Virus, feeder: Cell, gameServer: GameServer): void {
        if(!this.pushVirus) {
            // TeamX only changes virus-feeding behavior when pushVirus is enabled; otherwise
            // this reproduces Virus's own default (splitting) behavior verbatim.
            virus.setAngle(feeder.getAngle()); // Set direction if the virus explodes
            virus.mass += feeder.mass;
            virus.fed++; // Increase feed count
            gameServer.removeNode(feeder);

            // Check if the virus is going to explode
            if(virus.fed >= gameServer.config.virusFeedAmount) {
                virus.mass = gameServer.config.virusStartMass; // Reset mass
                virus.fed = 0;
                gameServer.shootVirus(virus);
            }
            return;
        }

        gameServer.removeNode(feeder);
        // Pushes the virus
        virus.setAngle(feeder.getAngle()); // Set direction if the virus explodes
        virus.moveEngineTicks = 5; // Amount of times to loop the movement function
        virus.moveEngineSpeed = 30;

        const index = gameServer.movingNodes.indexOf(virus);
        if(index == -1) {
            gameServer.movingNodes.push(virus);
        }
    }

    override getCellsInRange(gameServer: GameServer, cell: Cell): Cell[] {
        if(gameServer.config.teamsCollision) {
            return super.getCellsInRange(gameServer, cell);
        }

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

                        if((check.owner != cell.owner) && (check.owner.getTeam() == cell.owner!.getTeam()) && this.countNotInRange(check.owner) == 1) {
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

    override getRandomColor(_gameServer: GameServer): Color {
        const colorRGB = [0xFF, 0x07, (Math.random() * 256) >> 0];
        colorRGB.sort(() => 0.5 - Math.random());
        return {
            r: colorRGB[0]!,
            b: colorRGB[1]!,
            g: colorRGB[2]!
        };
    }

    override getRandomSpawn(gameServer: GameServer): Position {
        return gameServer.getRandomPosition();
    }

    override onCellMove(x1: number, y1: number, cell: Cell, bool?: boolean): void {
        if(!cell.gameServer!.config.teamsCollision) {
            return; // does nothing
        }
        super.onCellMove(x1, y1, cell, bool);
    }

    override onChange(gameServer: GameServer): void {
        // Remove all mother cells
        for(const i in this.nodesMother) {
            gameServer.removeNode(this.nodesMother[i]!);
        }
    }

    override onTick(gameServer: GameServer): void {
        // Mother Cell updates
        if(this.tickMother >= this.motherUpdateInterval) {
            this.updateMotherCells(gameServer);
            this.tickMother = 0;
        } else {
            this.tickMother++;
        }

        // Mother Cell Spawning
        if(this.tickMotherS >= this.motherSpawnInterval) {
            this.spawnMotherCell(gameServer);
            this.tickMotherS = 0;
        } else {
            this.tickMotherS++;
        }
    }
}

// -------------------------------------------------------------------------------------------
// New cell type (exactly copied from Experimental mode) - Temporary - Will be in its own file
// if Zeach decides to add this to vanilla

class MotherCell extends Cell {
    constructor(nodeId: number, owner: null, position: Position, mass: number, gameServer: GameServer) {
        super(nodeId, owner, position, mass, gameServer);
        this.cellType = 2; // Copies virus cell
        this.color = { r: 205, g: 85, b: 100 };
        this.spiked = 1;
    }

    override getEatingRange(): number {
        return this.getSize() * 0.5;
    }

    update(gameServer: GameServer): void {
        // Add mass
        this.mass += 0.25;

        // Spawn food
        const maxFood = 10; // Max food spawned per tick
        let i = 0; // Food spawn counter
        while((this.mass > gameServer.config.motherCellMinMass) && (i < maxFood)) {
            // Only spawn if food cap hasn been reached
            if(gameServer.currentFood < gameServer.config.foodMaxAmount) {
                this.spawnFood(gameServer);
            }

            // Incrementers
            this.mass--;
            i++;
        }
    }

    checkEat(gameServer: GameServer): void {
        const safeMass = this.mass * 0.9;
        const r = this.getSize(); // The box area that the checked cell needs to be in to be considered eaten

        // Loop for potential prey
        for(const i in gameServer.nodesPlayer) {
            const check = gameServer.nodesPlayer[i]!;

            if(check.mass > safeMass) {
                // Too big to be consumed
                continue;
            }

            // Calculations
            const len = r - (check.getSize() / 2) >> 0;
            if((this.abs(this.position.x - check.position.x) < len) && (this.abs(this.position.y - check.position.y) < len)) {
                // Eats the cell
                gameServer.removeNode(check);
                this.mass += check.mass;
            }
        }
        for(const i in gameServer.movingNodes) {
            const check = gameServer.movingNodes[i]!;

            if((check.getType() == 1) || (check.mass > safeMass)) {
                // Too big to be consumed/ No player cells
                continue;
            }

            // Calculations
            const len = r >> 0;
            if((this.abs(this.position.x - check.position.x) < len) && (this.abs(this.position.y - check.position.y) < len)) {
                // Eat the cell
                gameServer.removeNode(check);
                this.mass += check.mass;
            }
        }
        if(this.mass > gameServer.config.motherCellMaxMass) {
            this.mass = gameServer.config.motherCellMaxMass;
        }
    }

    abs(n: number): number {
        // Because Math.abs is slow
        return (n < 0) ? -n : n;
    }

    spawnFood(gameServer: GameServer): void {
        // Get starting position
        const angle = Math.random() * 6.28; // (Math.PI * 2) ??? Precision is not our greatest concern here
        const r = this.getSize();
        const pos = {
            x: this.position.x + (r * Math.sin(angle)),
            y: this.position.y + (r * Math.cos(angle))
        };

        // Spawn food
        const f = new Food(gameServer.getNextNodeId(), null, pos, gameServer.config.foodMass, gameServer);
        f.setColor(gameServer.getRandomColor());

        gameServer.addNode(f);
        gameServer.currentFood++;

        // Move engine
        f.angle = angle;
        const dist = (Math.random() * 10) + 22; // Random distance
        f.setMoveEngineData(dist, 15);

        gameServer.setAsMovingNode(f);
    }

    override onConsume(consumer: Cell, gameServer: GameServer): void {
        // Copies the virus behavior
        Virus.prototype.onConsume.call(this as unknown as Virus, consumer, gameServer);
    }

    override onAdd(gameServer: GameServer): void {
        gameServer.gameMode.nodesMother.push(this); // Temporary
    }

    override onRemove(gameServer: GameServer): void {
        const index = gameServer.gameMode.nodesMother.indexOf(this);
        if(index != -1) {
            gameServer.gameMode.nodesMother.splice(index, 1);
        }
    }
}
