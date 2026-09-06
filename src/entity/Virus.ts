import { Cell } from "./Cell.js";
import type { GameServer } from "../GameServer.js";
import type { PlayerTracker } from "../PlayerTracker.js";
import type { Position } from "../types.js";

export class Virus extends Cell {
    fed = 0;

    constructor(nodeId: number, owner: PlayerTracker | null, position: Position, mass: number, gameServer: GameServer | null = null) {
        super(nodeId, owner, position, mass, gameServer);
        this.cellType = 2;
        this.spiked = 1;
    }

    // Only for player controlled movement: `calcMove` is left undefined (see Cell.calcMove)

    feed(feeder: Cell, gameServer: GameServer): void {
        // Gamemodes (e.g. TeamX's "push virus" rule) can override this behavior instead of
        // monkey-patching Virus.prototype.feed.
        if(gameServer.gameMode.onVirusFeed) {
            gameServer.gameMode.onVirusFeed(this, feeder, gameServer);
            return;
        }

        this.setAngle(feeder.getAngle()); // Set direction if the virus explodes
        this.mass += feeder.mass;
        this.fed++; // Increase feed count
        gameServer.removeNode(feeder);

        // Check if the virus is going to explode
        if(this.fed >= gameServer.config.virusFeedAmount) {
            this.mass = gameServer.config.virusStartMass; // Reset mass
            this.fed = 0;
            gameServer.shootVirus(this);
        }
    }

    // Main Functions

    override getEatingRange(): number {
        return this.getSize() * 0.4; // 0 for ejected cells
    }

    override onConsume(consumer: Cell, gameServer: GameServer): void {
        if(gameServer.gameMode.onVirusConsume) {
            gameServer.gameMode.onVirusConsume(this, consumer, gameServer);
            return;
        }

        const client = consumer.owner!;

        const maxSplits = Math.floor(consumer.mass / 16) - 1; // Maximum amount of splits
        let numSplits = gameServer.config.playerMaxCells - client.cells.length; // Get number of splits
        numSplits = Math.min(numSplits, maxSplits);
        let splitMass = Math.min(consumer.mass / (numSplits + 1), 36); // Maximum size of new splits

        // Cell consumes mass before splitting
        consumer.addMass(this.mass);

        // Cell cannot split any further
        if(numSplits <= 0) {
            return;
        }

        // Big cells will split into cells larger than 36 mass (1/4 of their mass)
        let bigSplits = 0;
        const endMass = consumer.mass - (numSplits * splitMass);
        if((endMass > 300) && (numSplits > 0)) {
            bigSplits++;
            numSplits--;
        }
        if((endMass > 1200) && (numSplits > 0)) {
            bigSplits++;
            numSplits--;
        }
        if((endMass > 3000) && (numSplits > 0)) {
            bigSplits++;
            numSplits--;
        }

        // Splitting
        let angle = 0; // Starting angle
        for(let k = 0; k < numSplits; k++) {
            angle += 6 / numSplits; // Get directions of splitting cells
            gameServer.newCellVirused(client, consumer, angle, splitMass, 150);
            consumer.mass -= splitMass;
        }

        for(let k = 0; k < bigSplits; k++) {
            angle = Math.random() * 6.28; // Random directions
            splitMass = consumer.mass / 4;
            gameServer.newCellVirused(client, consumer, angle, splitMass, 20);
            consumer.mass -= splitMass;
        }

        // Prevent consumer cell from merging with other cells
        (consumer as unknown as PlayerCellLike).calcMergeTime(gameServer.config.playerRecombineTime);
    }

    override onAdd(gameServer: GameServer): void {
        gameServer.nodesVirus.push(this);
    }

    override onRemove(gameServer: GameServer): void {
        const index = gameServer.nodesVirus.indexOf(this);
        if(index != -1) {
            gameServer.nodesVirus.splice(index, 1);
        } else {
            console.log("[Warning] Tried to remove a non existing virus!");
        }
    }
}

interface PlayerCellLike {
    calcMergeTime(base: number, same?: boolean): void;
}
