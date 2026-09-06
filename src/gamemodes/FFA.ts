import { Mode } from "./Mode.js";
import type { GameServer } from "../GameServer.js";
import type { PlayerTracker } from "../PlayerTracker.js";

export class FFA extends Mode {
    rankOne?: PlayerTracker;

    constructor() {
        super();
        this.ID = 0;
        this.name = "Free For All";
        this.specByLeaderboard = true;
    }

    // Gamemode Specific Functions

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

    override onPlayerSpawn(gameServer: GameServer, player: PlayerTracker): void {
        // Random color
        player.color = gameServer.getRandomColor();

        // Set up variables
        let pos: { x: number; y: number } | undefined;
        let startMass: number | undefined;

        // Check if there are ejected mass in the world.
        if(gameServer.nodesEjected.length > 0) {
            const index = Math.floor(Math.random() * 100) + 1;
            if(index <= gameServer.config.ejectSpawnPlayer) {
                // Get ejected cell
                const eIndex = Math.floor(Math.random() * gameServer.nodesEjected.length);
                const e = gameServer.nodesEjected[eIndex]!;

                // Remove ejected mass
                gameServer.removeNode(e);

                // Inherit
                pos = { x: e.position.x, y: e.position.y };
                startMass = e.mass;

                const color = e.getColor();
                player.setColor({
                    r: color.r,
                    g: color.g,
                    b: color.b
                });
            }
        }

        // Spawn player
        gameServer.spawnPlayer(player, pos ?? null, startMass ?? null);
    }

    override updateLB(gameServer: GameServer): void {
        const lb = gameServer.leaderboard as PlayerTracker[];
        // Loop through all clients
        for(let i = 0; i < gameServer.clients.length; i++) {
            if(typeof gameServer.clients[i] == "undefined") {
                continue;
            }

            const player = gameServer.clients[i]!.playerTracker;
            const playerScore = player.getScore(true);
            if(player.cells.length <= 0) {
                continue;
            }

            if(lb.length == 0) {
                // Initial player
                lb.push(player);
                continue;
            } else if(lb.length < gameServer.config.gameLBlength) {
                this.leaderboardAddSort(player, lb);
            } else {
                // 10 in leaderboard already
                if(playerScore > lb[gameServer.config.gameLBlength - 1]!.getScore(false)) {
                    lb.pop();
                    this.leaderboardAddSort(player, lb);
                }
            }
        }

        this.rankOne = lb[0];
    }
}
