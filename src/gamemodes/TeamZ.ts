import { Mode } from "./Mode.js";
import { Cell } from "../entity/Cell.js";
import { PlayerCell } from "../entity/PlayerCell.js";
import type { GameServer } from "../GameServer.js";
import type { PlayerTracker } from "../PlayerTracker.js";
import type { Color, Position } from "../types.js";

// new Cell Type IDs of HERO and BRAIN are calculated based on Game Mode ID
const CellType = { PLAYER: 0, FOOD: 1, VIRUS: 2, EJECTED_MASS: 3, HERO: 130, BRAIN: 131 } as const;

export class TeamZ extends Mode {
    static readonly GameState = { WF_PLAYERS: 0, WF_START: 1, IN_PROGRESS: 2 } as const;

    // configurations:
    minPlayer = 2; // game is auto started if there are at least 2 players
    gameDuration = 18000; // ticks, 1 tick = 50 ms (20 ticks = 1 s)
    warmUpDuration = 600; // ticks, time to wait between games
    crazyDuration = 200; // ticks
    heroEffectDuration = 1000; // ticks
    brainEffectDuration = 200; // ticks
    spawnBrainInterval = 1200; // ticks
    spawnHeroInterval = 600; // ticks
    defaultColor: Color = { r: 0x9b, g: 0x30, b: 0xff };

    colorFactorStep = 5;
    colorLower = 50; // Min 0
    colorUpper = 225; // Max 255
    maxBrain = -1; // set this param to any negative number to keep the number of brains not exceed number of humans
    maxHero = 4; // set this param to any negative number to keep the number of heroes not exceed number of zombies

    // game mode data:
    state: number = TeamZ.GameState.WF_PLAYERS;
    winTeam = -1;
    gameTimer = 0;
    zombies: PlayerTracker[] = []; // the clients of zombie players
    humans: PlayerTracker[] = []; // the clients of human players

    heroes: Cell[] = [];
    brains: Cell[] = [];

    spawnHeroTimer = 0;
    spawnBrainTimer = 0;

    // Was a module-level `var localLB` in the original - shared mutable state that belongs on
    // the instance instead.
    private localLB: PlayerTracker[] = [];

    constructor() {
        super();
        this.ID = 13;
        this.name = "Zombie Team";
        this.packetLB = 48;
        this.haveTeams = true;
    }

    // Gamemode Specific Functions

    createZColorFactor(client: PlayerTracker): void {
        client.zColorFactor = (Math.random() * (this.colorUpper - this.colorLower + 1)) >> 0 + this.colorLower;
        client.zColorIncr = true; // color will be increased if TRUE - otherwise it will be decreased.
    }

    nextZColorFactor(client: PlayerTracker): void {
        if(client.zColorIncr == true) {
            if(client.zColorFactor! + this.colorFactorStep >= this.colorUpper) {
                client.zColorFactor = this.colorUpper;
                client.zColorIncr = false;
            } else {
                client.zColorFactor! += this.colorFactorStep;
            }
        } else {
            if(client.zColorFactor! - this.colorFactorStep <= this.colorLower) {
                client.zColorFactor = this.colorLower;
                client.zColorIncr = true;
            } else {
                client.zColorFactor! -= this.colorFactorStep;
            }
        }
    }

    updateZColor(client: PlayerTracker, mask: number): void {
        const color = {
            r: (mask & 0x4) > 0 ? client.zColorFactor! : 7,
            g: (mask & 0x2) > 0 ? client.zColorFactor! : 7,
            b: (mask & 0x1) > 0 ? client.zColorFactor! : 7
        };
        client.color = { r: color.r, g: color.g, b: color.b };
        for(let i = 0; i < client.cells.length; i++) {
            const cell = client.cells[i]!;
            cell.setColor(color);
        }
    }

    isCrazy(client: PlayerTracker): boolean {
        return (typeof client.crazyTimer != "undefined" && client.crazyTimer > 0 && client.team > 0);
    }

    hasEatenHero(client: PlayerTracker): boolean {
        return (typeof client.eatenHeroTimer != "undefined" && client.eatenHeroTimer > 0);
    }

    hasEatenBrain(client: PlayerTracker): boolean {
        return (typeof client.eatenBrainTimer != "undefined" && client.eatenBrainTimer > 0);
    }

    spawnDrug(gameServer: GameServer, cell: Cell): boolean { // spawn HERO or BRAIN
        let max = 0;
        let proceedNext = false;
        if(cell.getType() == CellType.HERO) {
            max = this.maxHero < 0 ? this.zombies.length : this.maxHero;
            proceedNext = this.heroes.length < max;
        } else if(cell.getType() == CellType.BRAIN) {
            max = this.maxBrain < 0 ? this.humans.length : this.maxBrain;
            proceedNext = this.brains.length < max;
        }
        if(proceedNext) {
            const pos = gameServer.getRandomPosition();

            // Check for players
            let collided = false;
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
                collided = true;
                break;
            }

            // Spawn if no cells are colliding
            if(!collided) {
                cell.position = pos;
                gameServer.addNode(cell);
                return true; // SUCCESS with spawn
            }
            return false; // FAILED because of collision
        }
        return true; // SUCCESS without spawn
    }

    // Call to change a human client to a zombie
    turnToZombie(client: PlayerTracker): void {
        client.team = 0; // team Z
        this.createZColorFactor(client);
        this.updateZColor(client, 0x7); // Gray

        // remove from human list
        const index = this.humans.indexOf(client);
        if(index >= 0) {
            this.humans.splice(index, 1);
        }

        // add to zombie list
        this.zombies.push(client);
    }

    boostSpeedCell(cell: Cell): void {
        if(typeof cell.originalSpeed == "undefined" || cell.originalSpeed == null) {
            cell.originalSpeed = cell.getSpeed.bind(cell);
            cell.getSpeed = () => 2 * cell.originalSpeed!();
        }
    }

    boostSpeed(client: PlayerTracker): void {
        for(let i = 0; i < client.cells.length; i++) {
            const cell = client.cells[i];
            if(typeof cell == "undefined") {
                continue;
            }
            this.boostSpeedCell(cell);
        }
    }

    resetSpeedCell(cell: Cell): void {
        if(typeof cell.originalSpeed != "undefined" && cell.originalSpeed != null) {
            cell.getSpeed = cell.originalSpeed;
            cell.originalSpeed = null;
        }
    }

    resetSpeed(client: PlayerTracker): void {
        for(let i = 0; i < client.cells.length; i++) {
            const cell = client.cells[i];
            if(typeof cell == "undefined") {
                continue;
            }
            this.resetSpeedCell(cell);
        }
    }

    startGame(gameServer: GameServer): void {
        for(let i = 0; i < this.humans.length; i++) {
            const client = this.humans[i]!;
            client.team = 1;
            client.crazyTimer = 0;
            client.eatenHeroTimer = 0;
            client.eatenBrainTimer = 0;
            client.color = gameServer.getRandomColor();
            for(let j = 0; j < client.cells.length; j++) {
                const cell = client.cells[j];
                if(cell) {
                    cell.setColor(client.color);
                    cell.mass = gameServer.config.playerStartMass;
                    this.resetSpeedCell(cell);
                }
            }
        }

        // Select random human to be the zombie
        const zombie = this.humans[(Math.random() * this.humans.length) >> 0]!;
        this.turnToZombie(zombie);

        this.winTeam = -1;
        this.state = TeamZ.GameState.IN_PROGRESS;
        this.gameTimer = this.gameDuration;
    }

    endGame(_gameServer: GameServer): void {
        // reset game
        for(let i = 0; i < this.zombies.length; i++) {
            const client = this.zombies[i]!;
            const index = this.humans.indexOf(client);
            if(index < 0) {
                this.humans.push(client);
            }
        }
        this.zombies = [];
        this.spawnHeroTimer = 0;
        this.spawnBrainTimer = 0;
        this.localLB = []; // reset leader board

        for(let i = 0; i < this.humans.length; i++) {
            const client = this.humans[i]!;
            client.color = this.defaultColor;
            client.team = 1;
            for(let j = 0; j < client.cells.length; j++) {
                const cell = client.cells[j]!;
                cell.setColor(this.defaultColor);
            }
        }

        this.state = TeamZ.GameState.WF_PLAYERS;
        this.gameTimer = 0;
    }

    leaderboardAddSort(player: PlayerTracker, leaderboard: PlayerTracker[]): void {
        // Adds the player and sorts the leaderboard
        let len = leaderboard.length - 1;
        let loop = true;

        while((len >= 0) && (loop)) {
            // Start from the bottom of the leaderboard
            if(player.getScore(false) <= leaderboard[len]!.getScore(false)) {
                leaderboard.splice(len + 1, 0, player);
                loop = false; // End the loop if a spot is found
            }
            len--;
        }
        if(loop) {
            // Add to top of the list because no spots were found
            leaderboard.splice(0, 0, player);
        }
    }

    // Override

    override onServerInit(gameServer: GameServer): void {
        // Called when the server starts
        gameServer.run = true;

        // Handle "gamemode" command:
        for(let i = 0; i < gameServer.clients.length; i++) {
            const client = gameServer.clients[i]!.playerTracker;
            if(!client) {
                continue;
            }

            if(client.cells.length > 0) {
                client.eatenBrainTimer = 0;
                client.eatenHeroTimer = 0;
                client.crazyTimer = 0;
                client.color = this.defaultColor;
                client.team = 1;
                for(let j = 0; j < client.cells.length; j++) {
                    const cell = client.cells[j]!;
                    cell.setColor(this.defaultColor);
                }
                this.humans.push(client);
            }
        }
    }

    override getNearestVirus(gameServer: GameServer, cell: Cell): Cell | null {
        // More like getNearbyVirus
        let virus: Cell | null = null;
        const r = 100; // Checking radius

        const topY = cell.position.y - r;
        const bottomY = cell.position.y + r;

        const leftX = cell.position.x - r;
        const rightX = cell.position.x + r;

        // loop through all heroes
        for(let i = 0; i < this.heroes.length; i++) {
            const check = this.heroes[i];
            if(typeof check === "undefined") {
                continue;
            }
            if(!check.collisionCheck(bottomY, topY, rightX, leftX)) {
                continue;
            }
            virus = check;
            break;
        }
        if(virus != null) {
            return virus;
        }

        // loop through all brains
        for(let i = 0; i < this.brains.length; i++) {
            const check = this.brains[i];
            if(typeof check === "undefined") {
                continue;
            }
            if(!check.collisionCheck(bottomY, topY, rightX, leftX)) {
                continue;
            }
            virus = check;
            break;
        }

        if(virus != null) {
            return virus;
        }

        // Call base:
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

    // this is almost same to the legacy function
    override getCellsInRange(gameServer: GameServer, cell: Cell): Cell[] {
        const list: Cell[] = [];

        if(this.state != TeamZ.GameState.IN_PROGRESS) {
            return list;
        }

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

            // HERO and BRAIN checking
            if(cell.owner!.getTeam() == 0) {
                // Z team
                if(check.getType() == CellType.HERO) {
                    continue;
                }
            } else {
                // H team
                if(check.getType() == CellType.BRAIN) {
                    continue;
                }
            }

            // Can't eat itself
            if(cell.nodeId == check.nodeId) {
                continue;
            }

            // Can't eat cells that have collision turned off
            if((cell.owner == check.owner) && ((cell as PlayerCell).ignoreCollision)) {
                continue;
            }

            // AABB Collision
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

    // this is almost same to the legacy function
    override splitCells(gameServer: GameServer, client: PlayerTracker): void {
        const len = client.cells.length;
        for(let i = 0; i < len; i++) {
            if(client.cells.length >= gameServer.config.playerMaxCells) {
                // Player cell limit
                continue;
            }

            const cell = client.cells[i];
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
            const splitSpeed = cell.getSpeed() * 6;
            const newMass = cell.mass / 2;
            cell.mass = newMass;
            // Create cell
            const split = new PlayerCell(gameServer.getNextNodeId(), client, startPos, newMass, gameServer);
            split.setAngle(angle);
            split.setMoveEngineData(splitSpeed, 32, 0.85);
            if(gameServer.config.playerSmoothSplit) {
                split.ignoreCollision = true;
                split.restoreCollisionTicks = 8;
            }
            split.calcMergeTime(gameServer.config.playerRecombineTime);

            // boost speed if zombie eats brain
            if(this.hasEatenBrain(client) || this.isCrazy(client)) {
                this.boostSpeedCell(split);
            } else if(this.hasEatenHero(client)) {
                // gain effect if human eat hero
                // fix "unable to split" bug: cell can be merged after finish moving (2nd param in setMoveEngineData)
                split.recombineTicks = 2; // main-ticks, 1 main-tick = 1 s
            }

            // Add to moving cells list
            gameServer.setAsMovingNode(split);
            gameServer.addNode(split);
        }
    }

    // this function is almost same to the legacy
    override newCellVirused(gameServer: GameServer, client: PlayerTracker, parent: Cell, angle: number, mass: number, speed: number): void {
        // Starting position
        const startPos = {
            x: parent.position.x,
            y: parent.position.y
        };

        // Create cell
        const newCell = new PlayerCell(gameServer.getNextNodeId(), client, startPos, mass, gameServer);
        newCell.setAngle(angle);
        newCell.setMoveEngineData(speed, 10);
        newCell.calcMergeTime(gameServer.config.playerRecombineTime);
        newCell.ignoreCollision = true; // Turn off collision

        // boost speed if zombie eats brain
        if(this.hasEatenBrain(client) || this.isCrazy(client)) {
            this.boostSpeedCell(newCell);
        } else if(this.hasEatenHero(client)) {
            // gain effect if human eat hero
            // fix "unable to split" bug
            newCell.recombineTicks = 1;
        }

        // Add to moving cells list
        gameServer.addNode(newCell);
        gameServer.setAsMovingNode(newCell);
    }

    override onVirusConsume(virus: Cell, consumer: Cell, gameServer: GameServer): void {
        const client = consumer.owner!;

        const maxSplits = Math.floor(consumer.mass / 16) - 1; // Maximum amount of splits
        let numSplits = gameServer.config.playerMaxCells - client.cells.length; // Get number of splits
        numSplits = Math.min(numSplits, maxSplits);
        let splitMass = Math.min(consumer.mass / (numSplits + 1), 36); // Maximum size of new splits

        // Cell consumes mass before splitting
        consumer.addMass(virus.mass);

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

        if(this.hasEatenHero(client)) {
            (consumer as PlayerCell).recombineTicks = 0;
        } else {
            (consumer as PlayerCell).calcMergeTime(gameServer.config.playerRecombineTime);
        }
    }

    override onChange(gameServer: GameServer): void {
        // Called when someone changes the gamemode via console commands
        // remove Brain and Hero
        // NOTE: preserved verbatim from the original, including its pre-existing bug - the
        // loop condition never bounds `i` against the (shrinking) array, so it throws if 2+
        // brains/heroes are on the map when the mode is switched away from. Not fixed here
        // since it's outside this port's scope (behavior-preserving refactor).
        for(let i = 0; this.brains.length; i++) {
            const node = this.brains[i]!;
            gameServer.removeNode(node);
        }
        for(let i = 0; this.heroes.length; i++) {
            const node = this.heroes[i]!;
            gameServer.removeNode(node);
        }

        // discard all boost:
        for(let i = 0; i < this.humans.length; i++) {
            const client = this.humans[i]!;
            if(this.isCrazy(client)) {
                this.resetSpeed(client);
            }
        }
        for(let i = 0; i < this.zombies.length; i++) {
            const client = this.zombies[i]!;
            if(this.hasEatenBrain(client)) {
                this.resetSpeed(client);
            }
        }
    }

    override onTick(gameServer: GameServer): void {
        // Called on every game tick

        switch(this.state) {
            case TeamZ.GameState.WF_PLAYERS:
                if(this.humans.length >= this.minPlayer) {
                    this.state = TeamZ.GameState.WF_START;
                    this.gameTimer = this.warmUpDuration;
                }
                break;
            case TeamZ.GameState.WF_START:
                this.gameTimer--;
                if(this.gameTimer == 0) {
                    if(this.humans.length >= this.minPlayer) {
                        // proceed:
                        this.startGame(gameServer);
                    } else {
                        // back to previous state:
                        this.state = TeamZ.GameState.WF_PLAYERS;
                    }
                }
                break;
            case TeamZ.GameState.IN_PROGRESS:
                this.gameTimer--;
                if(this.gameTimer == 0) {
                    // human wins
                    this.winTeam = 1;
                } else {
                    if(this.humans.length == 0) { // no human left
                        // zombie wins
                        this.winTeam = 0;
                    } else if(this.zombies.length == 0) { // no zombie left
                        // human wins
                        this.winTeam = 1;
                    }
                }

                if(this.winTeam >= 0) {
                    this.endGame(gameServer);
                }

                break;
            default:
                break;
        }

        // change color of zombies
        for(let i = 0; i < this.zombies.length; i++) {
            const client = this.zombies[i]!;
            this.nextZColorFactor(client);

            if(this.hasEatenBrain(client)) {
                client.eatenBrainTimer!--;

                if(client.eatenBrainTimer! > 0) {
                    this.updateZColor(client, 0x5); // Pink
                    continue;
                } else {
                    // reset speed:
                    this.resetSpeed(client);
                }
            }

            this.updateZColor(client, 0x7); // Gray
        }

        for(let i = 0; i < this.humans.length; i++) {
            const client = this.humans[i]!;
            if(this.isCrazy(client)) {
                client.crazyTimer!--;
                if(client.crazyTimer == 0) {
                    for(let j = 0; j < client.cells.length; j++) {
                        const cell = client.cells[j]!;
                        // reset speed:
                        this.resetSpeedCell(cell);

                        // reset color:
                        if(client.cured == true) {
                            cell.setColor(client.color);
                        }
                    }

                    if(client.cured == true) {
                        client.cured = false; // reset
                    } else {
                        // turn player to zombie
                        this.turnToZombie(client);
                        continue;
                    }
                } else {
                    client.colorToggle = (client.colorToggle ?? 0) + 1;
                    if(client.colorToggle % 10 == 0) {
                        let blinkColor: Color | null = null;

                        if(client.colorToggle == 20) {
                            blinkColor = client.color;
                            client.colorToggle = 0;
                        } else {
                            if(client.cured == true) {
                                blinkColor = { r: 255, g: 255, b: 7 }; // Yellow
                            } else {
                                blinkColor = { r: 75, g: 75, b: 75 }; // Gray
                            }
                        }

                        for(let j = 0; j < client.cells.length; j++) {
                            const cell = client.cells[j]!;
                            cell.setColor(blinkColor);
                        }
                    }
                }
            } else if(this.hasEatenHero(client)) {
                client.eatenHeroTimer!--;
                let color: Color;
                if(client.eatenHeroTimer! > 0) {
                    client.heroColorFactor = ((client.heroColorFactor ?? 0) + 5) % 401;
                    if(client.heroColorFactor <= 200) {
                        color = { r: 255, g: 255, b: client.heroColorFactor }; // Yellow scheme
                    } else {
                        color = { r: 255, g: 255, b: 400 - client.heroColorFactor }; // Yellow scheme
                    }
                } else {
                    color = client.color; // reset
                }

                for(let j = 0; j < client.cells.length; j++) {
                    const cell = client.cells[j]!;
                    cell.setColor(color);
                }
            }
        }

        // check timer to spawn Hero:
        this.spawnHeroTimer++;
        if(this.spawnHeroTimer >= this.spawnHeroInterval) {
            this.spawnHeroTimer = 0;
            const cell = new Hero(gameServer.getNextNodeId(), null, { x: 0, y: 0 }, 60, gameServer);
            while(!this.spawnDrug(gameServer, cell)); // collision detect algorithm needs enhancement
        }

        // check timer to spawn Brain:
        this.spawnBrainTimer++;
        if(this.spawnBrainTimer >= this.spawnBrainInterval) {
            this.spawnBrainTimer = 0;
            const cell = new Brain(gameServer.getNextNodeId(), null, { x: 0, y: 0 }, 60, gameServer);
            while(!this.spawnDrug(gameServer, cell)); // collision detect algorithm needs enhancement
        }
    }

    override onCellAdd(cell: Cell): void {
        // Called when a player cell is added
        const client = cell.owner!;
        if(client.cells.length == 1) { // first cell
            client.team = client.pID;
            client.color = { r: cell.color.r, g: cell.color.g, b: cell.color.b };
            client.eatenBrainTimer = 0;
            client.eatenHeroTimer = 0;
            client.crazyTimer = 0;
            this.humans.push(client);

            if(this.state == TeamZ.GameState.IN_PROGRESS) {
                this.turnToZombie(client);
            } else {
                client.color = this.defaultColor;
                cell.setColor(this.defaultColor);
                client.team = 1; // game not started yet
            }
        }
    }

    override onCellRemove(cell: Cell): void {
        // Called when a player cell is removed
        const client = cell.owner!;
        if(client.cells.length == 0) { // last cell
            if(client.getTeam() == 0) {
                // Z team
                const index = this.zombies.indexOf(client);
                if(index >= 0) {
                    this.zombies.splice(index, 1);
                }
            } else {
                // H team
                const index = this.humans.indexOf(client);
                if(index >= 0) {
                    this.humans.splice(index, 1);
                }
            }
        }
    }

    override onCellMove(x1: number, y1: number, cell: Cell): void {
        // Called when a player cell is moved
        const team = cell.owner!.getTeam();
        const r = cell.getSize();

        // Find team
        for(let i = 0; i < cell.owner!.visibleNodes.length; i++) {
            // Only collide with player cells
            const check = cell.owner!.visibleNodes[i]!;

            if((check.getType() != 0) || (cell.owner == check.owner)) {
                continue;
            }

            if((this.hasEatenHero(check.owner!)) || (this.hasEatenHero(cell.owner!))) {
                continue;
            }

            // Collision with zombies
            if(check.owner!.getTeam() == 0 || team == 0) {
                // Check if in collision range
                const collisionDist = check.getSize() + r; // Minimum distance between the 2 cells
                if(!(cell as PlayerCell).simpleCollide(x1, y1, check, collisionDist)) {
                    // Skip
                    continue;
                }

                // First collision check passed... now more precise checking
                const dist = (cell as PlayerCell).getDist(cell.position.x, cell.position.y, check.position.x, check.position.y);

                // Calculations
                if(dist < collisionDist) { // Collided
                    let crazyClient: PlayerTracker | null = null;
                    if(check.owner!.getTeam() == 0 && team != 0) {
                        crazyClient = cell.owner;
                    } else if(team == 0 && check.owner!.getTeam() != 0) {
                        crazyClient = check.owner;
                    }

                    if(crazyClient != null && !this.isCrazy(crazyClient)) {
                        crazyClient.crazyTimer = this.crazyDuration;
                        crazyClient.colorToggle = 0;
                        this.boostSpeed(crazyClient);
                    }

                    // The moving cell pushes the colliding cell
                    const newDeltaY = check.position.y - y1;
                    const newDeltaX = check.position.x - x1;
                    const newAngle = Math.atan2(newDeltaX, newDeltaY);

                    const move = collisionDist - dist;

                    check.position.x = check.position.x + (move * Math.sin(newAngle)) >> 0;
                    check.position.y = check.position.y + (move * Math.cos(newAngle)) >> 0;
                }
            }
        }
    }

    override updateLB(gameServer: GameServer): void {
        const lb = gameServer.leaderboard;

        if(this.winTeam == 0) {
            lb.push("ZOMBIE WINS");
            lb.push("_______________");
        } else if(this.winTeam > 0) {
            lb.push("HUMAN WINS");
            lb.push("_______________");
        }

        switch(this.state) {
            case TeamZ.GameState.WF_PLAYERS:
                lb.push("WAITING FOR");
                lb.push("PLAYERS...");
                lb.push(this.humans.length + "/" + this.minPlayer);
                break;
            case TeamZ.GameState.WF_START: {
                lb.push("GAME STARTS IN:");
                const min = (this.gameTimer / 20 / 60) >> 0;
                const sec = ((this.gameTimer / 20) >> 0) % 60;
                lb.push((min < 10 ? "0" : "") + min + ":" + (sec < 10 ? "0" : "") + sec);
                break;
            }
            case TeamZ.GameState.IN_PROGRESS: {
                const min = (this.gameTimer / 20 / 60) >> 0;
                const sec = ((this.gameTimer / 20) >> 0) % 60;
                lb.push((min < 10 ? "0" : "") + min + ":" + (sec < 10 ? "0" : "") + sec);
                lb.push("HUMAN: " + this.humans.length);
                lb.push("ZOMBIE: " + this.zombies.length);
                lb.push("_______________");

                // Loop through all clients
                this.localLB = [];
                for(let i = 0; i < gameServer.clients.length; i++) {
                    if(typeof gameServer.clients[i] == "undefined" || gameServer.clients[i]!.playerTracker.team == 0) {
                        continue;
                    }

                    const player = gameServer.clients[i]!.playerTracker;
                    if(player.cells.length <= 0) {
                        continue;
                    }
                    const playerScore = player.getScore(true);

                    if(this.localLB.length == 0) {
                        // Initial player
                        this.localLB.push(player);
                        continue;
                    } else if(this.localLB.length < 6) {
                        this.leaderboardAddSort(player, this.localLB);
                    } else {
                        // 6 in leaderboard already
                        if(playerScore > this.localLB[5]!.getScore(false)) {
                            this.localLB.pop();
                            this.leaderboardAddSort(player, this.localLB);
                        }
                    }
                }
                for(let i = 0; i < this.localLB.length && lb.length < 10; i++) {
                    lb.push(this.localLB[i]!.getName());
                }

                break;
            }
            default:
                lb.push("ERROR STATE");
                break;
        }
    }
}

// ----------------------------------------------------------------------------
// Game mode entities:

// HERO POISON CELL:
class Hero extends Cell {
    constructor(nodeId: number, owner: null, position: Position, mass: number, gameServer: GameServer) {
        super(nodeId, owner, position, mass, gameServer);
        this.cellType = CellType.HERO;
        this.color = { r: 255, g: 255, b: 7 };
        this.mass = 60;
    }

    override getName(): string {
        return "HERO";
    }

    // Only for player controlled movement: `calcMove` is left undefined (see Cell.calcMove)

    override onAdd(gameServer: GameServer): void {
        (gameServer.gameMode as TeamZ).heroes.push(this);
    }

    override onRemove(gameServer: GameServer): void {
        const heroes = (gameServer.gameMode as TeamZ).heroes;
        const index = heroes.indexOf(this);
        if(index != -1) {
            heroes.splice(index, 1);
        } else {
            console.log("[Warning] Tried to remove a non existing HERO node!");
        }
    }

    override feed(feeder: Cell, gameServer: GameServer): void {
        gameServer.removeNode(feeder);

        this.setAngle(feeder.getAngle());
        this.moveEngineTicks = 5; // Amount of times to loop the movement function
        this.moveEngineSpeed = 60;

        const index = gameServer.movingNodes.indexOf(this);
        if(index == -1) {
            gameServer.movingNodes.push(this);
        }
    }

    override onConsume(consumer: Cell, gameServer: GameServer): void {
        // Called when the cell is consumed
        const client = consumer.owner!;
        consumer.addMass(this.mass); // delicious

        const teamZ = gameServer.gameMode as TeamZ;
        if(teamZ.isCrazy(client)) {
            // Neutralize the Zombie effect
            client.cured = true;
        } else {
            // Become a hero
            client.eatenHeroTimer = teamZ.heroEffectDuration;
            client.heroColorFactor = 0;

            // Merge immediately
            for(let i = 0; i < client.cells.length; i++) {
                const cell = client.cells[i] as PlayerCell;
                cell.recombineTicks = 0;
            }
        }
    }
}

// ----------------------------------------------------------------------------
// BRAIN CELL:
class Brain extends Cell {
    constructor(nodeId: number, owner: null, position: Position, mass: number, gameServer: GameServer) {
        super(nodeId, owner, position, mass, gameServer);
        this.cellType = CellType.BRAIN;
        this.color = { r: 255, g: 7, b: 255 };
        this.mass = 60;
    }

    override getName(): string {
        return "BRAIN";
    }

    // Only for player controlled movement: `calcMove` is left undefined (see Cell.calcMove)

    override onAdd(gameServer: GameServer): void {
        (gameServer.gameMode as TeamZ).brains.push(this);
    }

    override onRemove(gameServer: GameServer): void {
        const brains = (gameServer.gameMode as TeamZ).brains;
        const index = brains.indexOf(this);
        if(index != -1) {
            brains.splice(index, 1);
        } else {
            console.log("[Warning] Tried to remove a non existing BRAIN node!");
        }
    }

    override feed(feeder: Cell, gameServer: GameServer): void {
        gameServer.removeNode(feeder);

        this.setAngle(feeder.getAngle());
        this.moveEngineTicks = 5; // Amount of times to loop the movement function
        this.moveEngineSpeed = 60;

        const index = gameServer.movingNodes.indexOf(this);
        if(index == -1) {
            gameServer.movingNodes.push(this);
        }
    }

    override onConsume(consumer: Cell, gameServer: GameServer): void {
        // Called when the cell is consumed
        const client = consumer.owner!;
        consumer.addMass(this.mass); // yummy!

        const teamZ = gameServer.gameMode as TeamZ;
        client.eatenBrainTimer = teamZ.brainEffectDuration;

        // Boost speed
        teamZ.boostSpeed(client);
    }
}
