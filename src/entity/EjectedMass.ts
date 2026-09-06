import { Cell } from "./Cell.js";
import type { GameServer } from "../GameServer.js";
import type { PlayerTracker } from "../PlayerTracker.js";
import type { Position } from "../types.js";

export class EjectedMass extends Cell {
    size: number;
    squareSize: number;

    constructor(nodeId: number, owner: PlayerTracker | null, position: Position, mass: number, gameServer: GameServer | null = null) {
        super(nodeId, owner, position, mass, gameServer);
        this.cellType = 3;
        this.size = Math.ceil(Math.sqrt(100 * this.mass));
        this.squareSize = (100 * this.mass) >> 0; // not being decayed -> calculate one time
    }

    override getSize(): number {
        return this.size;
    }

    override getSquareSize(): number {
        return this.squareSize;
    }

    // Only for player controlled movement: `calcMove` is left undefined (see Cell.calcMove)

    // Main Functions

    override sendUpdate(): boolean {
        // Whether or not to include this cell in the update packet
        if(this.moveEngineTicks == 0) {
            return false;
        }
        return true;
    }

    override onRemove(gameServer: GameServer): void {
        // Remove from list of ejected mass
        const index = gameServer.nodesEjected.indexOf(this);
        if(index != -1) {
            gameServer.nodesEjected.splice(index, 1);
        }
    }

    override onConsume(consumer: Cell, _gameServer: GameServer): void {
        // Adds mass to consumer
        consumer.addMass(this.mass);
    }

    override onAutoMove(gameServer: GameServer): boolean | void {
        if(gameServer.nodesVirus.length < gameServer.config.virusMaxAmount) {
            // Check for viruses
            const v = gameServer.getNearestVirus(this);
            if(v) { // Feeds the virus if it exists
                v.feed!(this, gameServer);
                return true;
            }
        }
    }

    override moveDone(gameServer: GameServer): void {
        if(!this.onAutoMove(gameServer)) {
            gameServer.nodesEjected.push(this);
        }
    }
}
