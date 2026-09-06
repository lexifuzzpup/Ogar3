import { Cell } from "./Cell.js";
import type { GameServer } from "../GameServer.js";
import type { PlayerTracker } from "../PlayerTracker.js";
import type { Position, ViewBox } from "../types.js";

export class PlayerCell extends Cell {
    recombineTicks = 0; // Ticks until the cell can recombine with other cells
    ignoreCollision = false; // This is used by player cells so that they dont cause any problems when splitting
    restoreCollisionTicks = 0;

    constructor(nodeId: number, owner: PlayerTracker | null, position: Position, mass: number, gameServer: GameServer | null = null) {
        super(nodeId, owner, position, mass, gameServer);
        this.cellType = 0;
    }

    // Main Functions

    override visibleCheck(box: ViewBox, centerPos: Position): boolean {
        // Use old fashioned checking method if cell is small
        if(this.mass < 100) {
            return this.collisionCheck(box.bottomY, box.topY, box.rightX, box.leftX);
        }

        // Checks if this cell is visible to the player
        const cellSize = this.getSize();
        const lenX = cellSize + box.width >> 0; // Width of cell + width of the box (Int)
        const lenY = cellSize + box.height >> 0; // Height of cell + height of the box (Int)

        return (this.abs(this.position.x - centerPos.x) < lenX) && (this.abs(this.position.y - centerPos.y) < lenY);
    }

    simpleCollide(x1: number, y1: number, check: Cell, d: number): boolean {
        // Simple collision check
        const len = d >> 0; // Width of cell + width of the box (Int)

        return (this.abs(x1 - check.position.x) < len) &&
            (this.abs(y1 - check.position.y) < len);
    }

    calcMergeTime(base: number, same?: boolean): void {
        if(same) {
            this.recombineTicks = base;
        } else {
            this.recombineTicks = base + ((0.02 * this.mass) >> 0); // Int (30 sec + (.02 * mass))
        }
    }

    // Movement

    override calcMove(x2: number, y2: number, gameServer: GameServer): void {
        const config = gameServer.config;
        const r = this.getSize(); // Cell radius

        // Get angle
        const deltaY = y2 - this.position.y;
        const deltaX = x2 - this.position.x;
        const angle = Math.atan2(deltaX, deltaY);

        if(isNaN(angle)) {
            return;
        }

        // Distance between mouse pointer and cell
        let dist = this.getDist(this.position.x, this.position.y, x2, y2);
        const speed = Math.min(this.getSpeed(), dist);

        let x1 = this.position.x + (speed * Math.sin(angle));
        let y1 = this.position.y + (speed * Math.cos(angle));

        // Collision check for other cells
        for(const i in this.owner!.cells) {
            const cell = this.owner!.cells[i] as PlayerCell;

            if((this.nodeId == cell.nodeId) || (this.ignoreCollision)) {
                continue;
            }

            if((cell.recombineTicks > 0) || (this.recombineTicks > 0)) {
                // Cannot recombine - Collision with your own cells
                const collisionDist = cell.getSize() + r; // Minimum distance between the 2 cells
                dist = this.getDist(x1, y1, cell.position.x, cell.position.y); // Distance between these two cells

                // Calculations
                if(dist < collisionDist) { // Collided
                    // The moving cell pushes the colliding cell
                    const newDeltaY = y1 - cell.position.y;
                    const newDeltaX = x1 - cell.position.x;
                    const newAngle = Math.atan2(newDeltaX, newDeltaY);

                    const move = collisionDist - dist;

                    x1 = x1 + (move * Math.sin(newAngle)) >> 0;
                    y1 = y1 + (move * Math.cos(newAngle)) >> 0;
                }
            }
        }

        gameServer.gameMode.onCellMove(x1, y1, this);

        // Check to ensure we're not passing the world border (shouldn't get closer than a quarter of the cell's diameter)
        if(x1 < config.borderLeft + r / 2) {
            x1 = config.borderLeft + r / 2;
        }
        if(x1 > config.borderRight - r / 2) {
            x1 = config.borderRight - r / 2;
        }
        if(y1 < config.borderTop + r / 2) {
            y1 = config.borderTop + r / 2;
        }
        if(y1 > config.borderBottom - r / 2) {
            y1 = config.borderBottom - r / 2;
        }

        this.position.x = x1 >> 0;
        this.position.y = y1 >> 0;
    }

    // Override

    override getEatingRange(): number {
        return this.getSize() * 0.4;
    }

    override onConsume(consumer: PlayerCell, _gameServer: GameServer): void {
        if(!consumer.owner!.nofood) {
            consumer.addMass(this.mass);
        }
    }

    override onAdd(gameServer: GameServer): void {
        // Add to special player node list
        gameServer.nodesPlayer.push(this);
        // Gamemode actions
        gameServer.gameMode.onCellAdd(this);
    }

    override onRemove(gameServer: GameServer): void {
        let index: number;
        // Remove from player cell list
        index = this.owner!.cells.indexOf(this);
        if(index != -1) {
            this.owner!.cells.splice(index, 1);
        }
        // Remove from special player controlled node list
        index = gameServer.nodesPlayer.indexOf(this);
        if(index != -1) {
            gameServer.nodesPlayer.splice(index, 1);
        }
        // Gamemode actions
        gameServer.gameMode.onCellRemove(this);
    }

    override onAutoMove(_gameServer: GameServer): void {
        // Restore collision
        if(this.restoreCollisionTicks > 0) {
            this.restoreCollisionTicks--;
            if(this.restoreCollisionTicks <= 0) {
                this.ignoreCollision = false;
            }
        }
    }

    override moveDone(_gameServer: GameServer): void {
        this.ignoreCollision = false;
    }

    // Lib

    abs(x: number): number {
        return x < 0 ? -x : x;
    }

    getDist(x1: number, y1: number, x2: number, y2: number): number {
        let xs = x2 - x1;
        xs = xs * xs;

        let ys = y2 - y1;
        ys = ys * ys;

        return Math.sqrt(xs + ys);
    }
}
