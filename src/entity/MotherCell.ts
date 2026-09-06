import { Cell } from "./Cell.js";
import { Food } from "./Food.js";
import { Virus } from "./Virus.js";
import type { GameServer } from "../GameServer.js";
import type { PlayerTracker } from "../PlayerTracker.js";
import type { Position } from "../types.js";

// Temporary - Will be in its own file if Zeach decides to add this to vanilla
export class MotherCell extends Cell {
    skin = "%gas";
    name = "";

    constructor(nodeId: number, owner: PlayerTracker | null, position: Position, mass: number, gameServer: GameServer | null = null) {
        super(nodeId, owner, position, mass, gameServer);
        this.cellType = 2; // Copies virus cell
        this.color = {
            r: 200 + Math.floor(Math.random() * 30),
            g: 70 + Math.floor(Math.random() * 30),
            b: 70 + Math.floor(Math.random() * 30)
        };
        this.spiked = 1;
    }

    override getEatingRange(): number {
        return this.getSize() * 0.5;
    }

    // Named `motherFeed` (not `feed`) to avoid colliding with the base Cell class's optional
    // `feed(feeder, gameServer)` hook (Virus/Hero/Brain) - this is a different, unrelated
    // per-tick growth method with its own arity, dead code today since nothing constructs
    // this standalone MotherCell (each gamemode defines its own local variant instead; see
    // gamemodes/Mode.ts's forceFoodUpdates-style comments for the broader context).
    motherFeed(gameServer: GameServer): void {
        // Add mass
        this.mass += 0.25;

        // Spawn food
        this.spawnFood(gameServer);
        this.mass--;
    }

    checkEat(gameServer: GameServer): void {
        const safeMass = this.mass * 0.9;
        const r = this.getSize(); // The box area that the checked cell needs to be in to be considered eaten

        // Loop for potential prey
        for(const i in gameServer.nodesPlayer) {
            const check = gameServer.nodesPlayer[i];

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
                    // Un-juggernaut if player was juggernaut
                    if(check.owner!.juggernaut) {
                        check.owner!.makeNotJuggernaut!();
                    }
                    // Eats the cell
                    gameServer.removeNode(check);
                    this.mass += check.mass;
                }
            }
        }
        for(const i in gameServer.movingNodes) {
            const check = gameServer.movingNodes[i];

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

        // Don't let mother cells get too big.  They'll just be a black hole instead
        // (motherCellMaxMass is undefined for every shipped gamemode, so this never actually
        // triggers - preserved as-is rather than "fixed", see Mode.ts's motherCellMaxMass)
        if(gameServer.gameMode.motherCellMaxMass !== undefined && this.mass > gameServer.gameMode.motherCellMaxMass) {
            this.mass = gameServer.gameMode.motherCellMaxMass;
            // Spit out a virus if not too many viruses
            if(gameServer.nodesVirus.length < gameServer.config.virusMaxAmount) {
                this.setAngle(Math.random() * 6.28);
                gameServer.shootVirus(this);
                this.mass -= gameServer.config.virusStartMass;
            }
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
        // Cast needed: this "copies virus cell" per the original's comment but isn't actually
        // a Virus instance - matches the original's loose duck-typing into nodesVirus.
        gameServer.nodesVirus.push(this as unknown as Virus); // Temporary
    }

    override onRemove(gameServer: GameServer): void {
        const index = gameServer.nodesVirus.indexOf(this as unknown as Virus);
        if(index != -1) {
            gameServer.nodesVirus.splice(index, 1);
        } else {
            console.log("[Warning] Tried to remove a non existing virus!");
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
