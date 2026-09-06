import { FFA } from "./FFA.js";
import { Cell } from "../entity/Cell.js";
import { Food } from "../entity/Food.js";
import { Virus } from "../entity/Virus.js";
import type { GameServer } from "../GameServer.js";
import type { Position } from "../types.js";

export class Experimental extends FFA {
    constructor() {
        super();
        this.ID = 2;
        this.name = "Experimental";
        this.specByLeaderboard = true;

        // Gamemode Specific Variables
        this.nodesMother = [];
        this.tickMother = 0;
        this.tickMotherS = 0;

        // Config
        this.motherCellMass = 200;
        this.motherUpdateInterval = 5; // How many ticks it takes to update the mother cell (1 tick = 50 ms)
        this.motherSpawnInterval = 100; // How many ticks it takes to spawn another mother cell - Currently 5 seconds
        this.motherMinAmount = 5;
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
            const m = new MotherCell(gameServer.getNextNodeId(), null, pos, gameServer.config.motherCellMinMass, gameServer);
            gameServer.addNode(m);
        }
    }

    // Override
    override onServerInit(gameServer: GameServer): void {
        // Called when the server starts
        gameServer.run = true;

        // Special virus mechanics are handled via onVirusFeed below instead of monkey-patching
        // Virus.prototype.feed.
    }

    override onVirusFeed(virus: Virus, feeder: Cell, gameServer: GameServer): void {
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

    override getRandomSpawn(gameServer: GameServer): Position {
        return gameServer.getRandomPosition();
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

    override onChange(gameServer: GameServer): void {
        // Remove all mother cells
        for(const i in this.nodesMother) {
            gameServer.removeNode(this.nodesMother[i]!);
        }
    }
}

// New cell type - Temporary - Will be in its own file if Zeach decides to add this to vanilla
class MotherCell extends Cell {
    constructor(nodeId: number, owner: null, position: Position, mass: number, gameServer: GameServer) {
        super(nodeId, owner, position, mass, gameServer);
        this.cellType = 2; // Copies virus cell
        this.color = {
            r: 190 + Math.floor(30 * Math.random()),
            g: 70 + Math.floor(30 * Math.random()),
            b: 85 + Math.floor(30 * Math.random())
        };
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
                this.mass--;
            }
            // Incrementers
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
                // A second, more precise check
                const xs = Math.pow(check.position.x - this.position.x, 2);
                const ys = Math.pow(check.position.y - this.position.y, 2);
                const dist = Math.sqrt(xs + ys);
                if(r > dist) {
                    // Eats the cell
                    gameServer.removeNode(check);
                    this.mass += check.mass;
                }
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

    override visibleCheck(box: { width: number; height: number }, centerPos: Position): boolean {
        // Checks if this cell is visible to the player
        const cellSize = this.getSize();
        const lenX = cellSize + box.width >> 0; // Width of cell + width of the box (Int)
        const lenY = cellSize + box.height >> 0; // Height of cell + height of the box (Int)
        return (this.abs(this.position.x - centerPos.x) < lenX) && (this.abs(this.position.y - centerPos.y) < lenY);
    }
}
