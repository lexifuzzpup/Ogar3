import type { GameServer } from "../GameServer.js";
import type { PlayerTracker } from "../PlayerTracker.js";
import type { Color, Position, ViewBox } from "../types.js";

export class Cell {
    nodeId: number;
    owner: PlayerTracker | null;
    color: Color = { r: 0, g: 255, b: 0 };
    position: Position;
    mass: number;
    cellType = -1; // 0 = Player Cell, 1 = Food, 2 = Virus, 3 = Ejected Mass
    spiked = 0; // If 1, then this cell has spikes around it

    killedBy: Cell | null = null;
    gameServer: GameServer | null;

    moveEngineTicks = 0; // Amount of times to loop the movement function
    moveEngineSpeed = 0;
    moveDecay = 0.75;
    angle = 0; // Angle of movement

    // Transient marker set by GameServer/Mode collision detection (Mode.getCellsInRange) to
    // avoid double-processing a cell already queued for removal within the same tick; never
    // reset since the cell is destroyed shortly after being flagged.
    inRange?: boolean;

    constructor(nodeId: number, owner: PlayerTracker | null, position: Position, mass: number, gameServer: GameServer | null = null) {
        this.nodeId = nodeId;
        this.owner = owner; // playerTracker that owns this cell
        this.position = position;
        this.mass = mass; // Starting mass of the cell
        this.gameServer = gameServer;
    }

    // Fields not defined by the constructor are considered private and need a getter/setter to access from a different class

    getName(): string {
        if(this.owner) {
            return this.owner.name;
        } else {
            return "";
        }
    }

    setColor(color: Color): void {
        this.color.r = color.r;
        this.color.b = color.b;
        this.color.g = color.g;
    }

    getColor(): Color {
        return this.color;
    }

    getType(): number {
        return this.cellType;
    }

    getSize(): number {
        // Calculates radius based on cell mass
        return Math.ceil(Math.sqrt(100 * this.mass));
    }

    getSquareSize(): number {
        // R * R
        return (100 * this.mass) >> 0;
    }

    addMass(n: number): void {
        const owner = this.owner!;
        if(this.mass + n > owner.gameServer!.config.playerMaxMass && owner.cells.length < owner.gameServer!.config.playerMaxCells) {
            this.mass = (this.mass + n) / 2;
            owner.gameServer!.newCellVirused(owner, this, 0, this.mass, 150);
        } else {
            this.mass = Math.min(this.mass + n, owner.gameServer!.config.playerMaxMass);
        }
    }

    getSpeed(): number {
        // Old formula: 5 + (20 * (1 - (this.mass/(70+this.mass))));
        // Based on 50ms ticks. If updateMoveEngine interval changes, change 50 to new value
        // (should possibly have a config value for this?)
        return this.owner!.gameServer!.config.playerSpeed * Math.pow(this.mass, -1.0 / 4.5) * 50 / 40;
    }

    setAngle(radians: number): void {
        this.angle = radians;
    }

    getAngle(): number {
        return this.angle;
    }

    setMoveEngineData(speed: number, ticks: number, decay?: number): void {
        this.moveEngineSpeed = speed;
        this.moveEngineTicks = ticks;
        this.moveDecay = decay === undefined || isNaN(decay) ? 0.75 : decay;
    }

    getEatingRange(): number {
        return 0; // 0 for ejected cells
    }

    getKiller(): Cell | null {
        return this.killedBy;
    }

    setKiller(cell: Cell): void {
        this.killedBy = cell;
    }

    // Functions

    collisionCheck(bottomY: number, topY: number, rightX: number, leftX: number): boolean {
        // Collision checking
        if(this.position.y > bottomY) {
            return false;
        }

        if(this.position.y < topY) {
            return false;
        }

        if(this.position.x > rightX) {
            return false;
        }

        if(this.position.x < leftX) {
            return false;
        }

        return true;
    }

    // This collision checking function is based on CIRCLE shape
    collisionCheck2(objectSquareSize: number, objectPosition: Position): boolean {
        // IF (O1O2 + r <= R) THEN collided. (O1O2: distance b/w 2 centers of cells)
        // (O1O2 + r)^2 <= R^2
        // approximately, remove 2*O1O2*r because it requires sqrt(): O1O2^2 + r^2 <= R^2

        const dx = this.position.x - objectPosition.x;
        const dy = this.position.y - objectPosition.y;
        if(this.cellType === 1) {
            return (dx * dx + dy * dy + 1 <= objectSquareSize);
        } else {
            return (dx * dx + dy * dy + this.getSquareSize() <= objectSquareSize);
        }
    }

    visibleCheck(box: ViewBox, centerPos: Position): boolean {
        // Checks if this cell is visible to the player
        return this.collisionCheck(box.bottomY, box.topY, box.rightX, box.leftX);
    }

    calcMovePhys(config: { borderLeft: number; borderRight: number; borderTop: number; borderBottom: number }): void {
        // Movement for ejected cells
        let X = this.position.x + (this.moveEngineSpeed * Math.sin(this.angle));
        let Y = this.position.y + (this.moveEngineSpeed * Math.cos(this.angle));

        // Movement engine
        this.moveEngineSpeed *= this.moveDecay; // Decaying speed
        this.moveEngineTicks--;

        // Border check - Bouncy physics
        const radius = 40;
        if((this.position.x - radius) < config.borderLeft) {
            // Flip angle horizontally - Left side
            this.angle = 6.28 - this.angle;
            X = config.borderLeft + radius;
        }
        if((this.position.x + radius) > config.borderRight) {
            // Flip angle horizontally - Right side
            this.angle = 6.28 - this.angle;
            X = config.borderRight - radius;
        }
        if((this.position.y - radius) < config.borderTop) {
            // Flip angle vertically - Top side
            this.angle = (this.angle <= 3.14) ? 3.14 - this.angle : 9.42 - this.angle;
            Y = config.borderTop + radius;
        }
        if((this.position.y + radius) > config.borderBottom) {
            // Flip angle vertically - Bottom side
            this.angle = (this.angle <= 3.14) ? 3.14 - this.angle : 9.42 - this.angle;
            Y = config.borderBottom - radius;
        }

        // Set position
        this.position.x = X >> 0;
        this.position.y = Y >> 0;
    }

    // Override these

    sendUpdate(): boolean {
        // Whether or not to include this cell in the update packet
        return true;
    }

    onConsume(_consumer: Cell, _gameServer: GameServer): void {
        // Called when the cell is consumed
    }

    onAdd(_gameServer: GameServer): void {
        // Called when this cell is added to the world
    }

    onRemove(_gameServer: GameServer): void {
        // Called when this cell is removed
    }

    onAutoMove(_gameServer: GameServer): boolean | void {
        // Called on each auto move engine tick
    }

    moveDone(_gameServer: GameServer): void {
        // Called when this cell finished moving with the auto move engine
    }

    calcMove?(x2: number, y2: number, gameServer: GameServer): void;

    // Only Virus (and TeamZ's Hero/Brain) implement this - see Mode.getNearestVirus, which
    // TeamZ widens to also return Hero/Brain cells for ejected-mass "feeding".
    feed?(feeder: Cell, gameServer: GameServer): void;

    // Set by TeamZ's boostSpeedCell/resetSpeedCell (see gamemodes/TeamZ.ts), which swaps this
    // cell instance's own getSpeed for a 2x version and stashes the original here to restore
    // later - a per-instance override, not a shared/global patch.
    originalSpeed?: (() => number) | null;
}
