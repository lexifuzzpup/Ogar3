import { Cell } from "./Cell.js";
import type { GameServer } from "../GameServer.js";
import type { PlayerTracker } from "../PlayerTracker.js";
import type { Position } from "../types.js";

export class Food extends Cell {
    size: number;
    squareSize: number;

    constructor(nodeId: number, owner: PlayerTracker | null, position: Position, mass: number, gameServer: GameServer | null = null) {
        super(nodeId, owner, position, mass, gameServer);
        this.cellType = 1;
        this.size = Math.ceil(Math.sqrt(100 * this.mass));
        this.squareSize = (100 * this.mass) >> 0; // not being decayed -> calculate one time
    }

    override getSize(): number {
        return this.size;
    }

    override getSquareSize(): number {
        return this.squareSize;
    }

    // Food has no need to move: `calcMove` is left undefined (see Cell.calcMove)

    // Main Functions

    override sendUpdate(): boolean {
        // Whether or not to include this cell in the update packet. Rainbow mode wants every
        // food cell resent every tick (so color-cycling animates) instead of monkey-patching
        // Food.prototype.sendUpdate globally - see Mode.forceFoodUpdates.
        if(this.gameServer?.gameMode.forceFoodUpdates) {
            return true;
        }
        if(this.moveEngineTicks == 0) {
            return false;
        }
        return true;
    }

    override onRemove(gameServer: GameServer): void {
        gameServer.currentFood--;
    }

    override onConsume(consumer: Cell, _gameServer: GameServer): void {
        consumer.addMass(this.mass);
    }
}
