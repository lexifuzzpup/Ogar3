import { Tournament } from "./Tournament.js";
import { Food } from "../entity/Food.js";
import { Virus } from "../entity/Virus.js";
import type { GameServer } from "../GameServer.js";
import type { PlayerTracker } from "../PlayerTracker.js";
import type { Position } from "../types.js";

export class HungerGames extends Tournament {
    // Gamemode Specific Variables
    baseSpawnPoints: Position[] = [
        { x: 1600, y: 200 }, { x: 3200, y: 200 }, { x: 4800, y: 200 }, // Top
        { x: 200, y: 1600 }, { x: 200, y: 3200 }, { x: 200, y: 4800 }, // Left
        { x: 6200, y: 1600 }, { x: 6200, y: 3200 }, { x: 6200, y: 4800 }, // Right
        { x: 1600, y: 6200 }, { x: 3200, y: 6200 }, { x: 4800, y: 6200 } // Bottom
    ];
    contenderSpawnPoints: Position[] = [];
    borderDec = 100; // Border shrinks by this size everytime someone dies

    constructor() {
        super();
        this.ID = 11;
        this.name = "Hunger Games";
        this.maxContenders = 12;
    }

    // Gamemode Specific Functions

    getPos(): Position {
        let pos: Position = { x: 0, y: 0 };

        // Random Position
        if(this.contenderSpawnPoints.length > 0) {
            const index = Math.floor(Math.random() * this.contenderSpawnPoints.length);
            pos = this.contenderSpawnPoints[index]!;
            this.contenderSpawnPoints.splice(index, 1);
        }

        return { x: pos.x, y: pos.y };
    }

    spawnFood(gameServer: GameServer, mass: number, pos: Position): void {
        const f = new Food(gameServer.getNextNodeId(), null, pos, mass, gameServer);
        f.setColor(gameServer.getRandomColor());
        gameServer.addNode(f);
        gameServer.currentFood++;
    }

    spawnVirus(gameServer: GameServer, pos: Position): void {
        const v = new Virus(gameServer.getNextNodeId(), null, pos, gameServer.config.virusStartMass, gameServer);
        gameServer.addNode(v);
    }

    override onPlayerDeath(gameServer: GameServer): void {
        const config = gameServer.config;
        config.borderLeft += this.borderDec;
        config.borderRight -= this.borderDec;
        config.borderTop += this.borderDec;
        config.borderBottom -= this.borderDec;

        // Remove all cells
        const len = gameServer.nodes.length;
        for(let i = 0; i < len; i++) {
            const node = gameServer.nodes[i];

            if((!node) || (node.getType() == 0)) {
                continue;
            }

            // Move
            if(node.position.x < config.borderLeft) {
                gameServer.removeNode(node);
                i--;
            } else if(node.position.x > config.borderRight) {
                gameServer.removeNode(node);
                i--;
            } else if(node.position.y < config.borderTop) {
                gameServer.removeNode(node);
                i--;
            } else if(node.position.y > config.borderBottom) {
                gameServer.removeNode(node);
                i--;
            }
        }
    }

    // Override

    override onServerInit(gameServer: GameServer): void {
        // Prepare
        this.prepare(gameServer);

        // Resets spawn points
        this.contenderSpawnPoints = this.baseSpawnPoints.slice();

        // Override config values
        if(gameServer.config.serverBots > this.maxContenders) {
            // The number of bots cannot exceed the maximum amount of contenders
            gameServer.config.serverBots = this.maxContenders;
        }
        gameServer.config.spawnInterval = 20;
        gameServer.config.borderLeft = 0;
        gameServer.config.borderRight = 6400;
        gameServer.config.borderTop = 0;
        gameServer.config.borderBottom = 6400;
        gameServer.config.foodSpawnAmount = 5; // This is hunger games
        gameServer.config.foodStartAmount = 100;
        gameServer.config.foodMaxAmount = 200;
        gameServer.config.foodMass = 2; // Food is scarce, but its worth more
        gameServer.config.virusMinAmount = 10; // We need to spawn some viruses in case someone eats them all
        gameServer.config.virusMaxAmount = 100;
        gameServer.config.ejectSpawnPlayer = 0;
        gameServer.config.playerDisconnectTime = 10; // So that people dont disconnect and stall the game for too long

        // Spawn Initial Virus/Large food
        const mapWidth = gameServer.config.borderRight - gameServer.config.borderLeft;
        const mapHeight = gameServer.config.borderBottom - gameServer.config.borderTop;

        // Food
        this.spawnFood(gameServer, 200, { x: mapWidth * 0.5, y: mapHeight * 0.5 }); // Center
        this.spawnFood(gameServer, 80, { x: mapWidth * 0.4, y: mapHeight * 0.6 }); //
        this.spawnFood(gameServer, 80, { x: mapWidth * 0.6, y: mapHeight * 0.6 });
        this.spawnFood(gameServer, 80, { x: mapWidth * 0.4, y: mapHeight * 0.4 });
        this.spawnFood(gameServer, 80, { x: mapWidth * 0.6, y: mapHeight * 0.4 });
        this.spawnFood(gameServer, 50, { x: mapWidth * 0.7, y: mapHeight * 0.5 }); //
        this.spawnFood(gameServer, 50, { x: mapWidth * 0.3, y: mapHeight * 0.5 });
        this.spawnFood(gameServer, 50, { x: mapWidth * 0.5, y: mapHeight * 0.7 });
        this.spawnFood(gameServer, 50, { x: mapWidth * 0.5, y: mapHeight * 0.3 });
        this.spawnFood(gameServer, 30, { x: mapWidth * 0.7, y: mapHeight * 0.625 }); // Corner
        this.spawnFood(gameServer, 30, { x: mapWidth * 0.625, y: mapHeight * 0.7 });
        this.spawnFood(gameServer, 30, { x: mapWidth * 0.3, y: mapHeight * 0.4 });
        this.spawnFood(gameServer, 30, { x: mapWidth * 0.4, y: mapHeight * 0.3 });
        this.spawnFood(gameServer, 30, { x: mapWidth * 0.6, y: mapHeight * 0.3 });
        this.spawnFood(gameServer, 30, { x: mapWidth * 0.7, y: mapHeight * 0.4 });
        this.spawnFood(gameServer, 30, { x: mapWidth * 0.3, y: mapHeight * 0.6 });
        this.spawnFood(gameServer, 30, { x: mapWidth * 0.4, y: mapHeight * 0.7 });

        // Virus
        this.spawnVirus(gameServer, { x: mapWidth * 0.6, y: mapHeight * 0.5 }); //
        this.spawnVirus(gameServer, { x: mapWidth * 0.4, y: mapHeight * 0.5 });
        this.spawnVirus(gameServer, { x: mapWidth * 0.5, y: mapHeight * 0.4 });
        this.spawnVirus(gameServer, { x: mapWidth * 0.5, y: mapHeight * 0.6 });
        this.spawnVirus(gameServer, { x: mapWidth * 0.3, y: mapHeight * 0.3 }); //
        this.spawnVirus(gameServer, { x: mapWidth * 0.3, y: mapHeight * 0.7 });
        this.spawnVirus(gameServer, { x: mapWidth * 0.7, y: mapHeight * 0.3 });
        this.spawnVirus(gameServer, { x: mapWidth * 0.7, y: mapHeight * 0.7 });
        this.spawnVirus(gameServer, { x: mapWidth * 0.25, y: mapHeight * 0.6 }); //
        this.spawnVirus(gameServer, { x: mapWidth * 0.25, y: mapHeight * 0.4 });
        this.spawnVirus(gameServer, { x: mapWidth * 0.75, y: mapHeight * 0.6 });
        this.spawnVirus(gameServer, { x: mapWidth * 0.75, y: mapHeight * 0.4 });
        this.spawnVirus(gameServer, { x: mapWidth * 0.6, y: mapHeight * 0.25 });
        this.spawnVirus(gameServer, { x: mapWidth * 0.4, y: mapHeight * 0.25 });
        this.spawnVirus(gameServer, { x: mapWidth * 0.6, y: mapHeight * 0.75 });
        this.spawnVirus(gameServer, { x: mapWidth * 0.4, y: mapHeight * 0.75 });
    }

    override onPlayerSpawn(gameServer: GameServer, player: PlayerTracker): void {
        // Only spawn players if the game hasnt started yet
        if((this.gamePhase == 0) && (this.contenders.length < this.maxContenders)) {
            player.color = gameServer.getRandomColor(); // Random color
            this.contenders.push(player); // Add to contenders list
            gameServer.spawnPlayer(player, this.getPos());

            if(this.contenders.length == this.maxContenders) {
                // Start the game once there is enough players
                this.startGamePrep(gameServer);
            }
        }
    }
}
