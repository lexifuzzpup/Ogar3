import { Mode } from "./Mode.js";
import type { Cell } from "../entity/Cell.js";
import type { PlayerCell } from "../entity/PlayerCell.js";
import type { GameServer } from "../GameServer.js";
import type { PlayerTracker } from "../PlayerTracker.js";
import type { Color } from "../types.js";

export class Zombie extends Mode {
    zombieColor: Color = { r: 223, g: 223, b: 223 };
    zombies: Cell[] = [];
    players: Cell[] = [];
    rankOne?: PlayerTracker;

    constructor() {
        super();
        this.ID = 12;
        this.name = "Zombie FFA";
        this.haveTeams = true;
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

    makeZombie(player: PlayerTracker): void {
        // turns a player into a zombie
        player.team = 0;
        player.color = this.zombieColor;
        for(let i = 0; i < player.cells.length; i++) {
            // remove cell from players array
            const index = this.players.indexOf(player.cells[i]!);
            if(index != -1) {
                this.players.splice(index, 1);
            }
            // change color of cell
            player.cells[i]!.color = this.zombieColor;
            // add cell to zombie array
            this.zombies.push(player.cells[i]!);
        }
    }

    // Override

    override onPlayerSpawn(gameServer: GameServer, player: PlayerTracker): void {
        // make player a zombie if there are none
        if(this.zombies.length == 0) {
            player.team = 0;
            player.color = this.zombieColor;
        } else {
            // use player id as team so that bots are still able to fight (even though they probably turn into zombies very fast)
            player.team = player.pID;
            player.color = gameServer.getRandomColor();
        }

        // Spawn player
        gameServer.spawnPlayer(player);
    }

    override onCellAdd(cell: Cell): void {
        // Add to team list
        if(cell.owner!.getTeam() == 0) {
            this.zombies.push(cell);
        } else {
            this.players.push(cell);
        }
    }

    override onCellRemove(cell: Cell): void {
        // Remove from team list
        if(cell.owner!.getTeam() == 0) {
            const index = this.zombies.indexOf(cell);
            if(index != -1) {
                this.zombies.splice(index, 1);
            }
        } else {
            const index = this.players.indexOf(cell);
            if(index != -1) {
                this.players.splice(index, 1);
            }
        }
    }

    override onCellMove(x1: number, y1: number, cell: Cell): void {
        const team = cell.owner!.getTeam();
        const r = cell.getSize();

        // Find team
        for(let i = 0; i < cell.owner!.visibleNodes.length; i++) {
            // Only collide with player cells
            const check = cell.owner!.visibleNodes[i]!;

            if((check.getType() != 0) || (cell.owner == check.owner)) {
                continue;
            }

            // Collision with zombies
            if(check.owner!.getTeam() == team || check.owner!.getTeam() == 0 || team == 0) {
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
                    if(check.owner!.getTeam() == 0 && team != 0) {
                        // turn player into zombie
                        this.makeZombie(cell.owner!);
                    } else if(team == 0 && check.owner!.getTeam() != 0) {
                        // turn other player into zombie
                        this.makeZombie(check.owner!);
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
        const lb = gameServer.leaderboard as PlayerTracker[];
        // Loop through all clients
        for(let i = 0; i < gameServer.clients.length; i++) {
            if(typeof gameServer.clients[i] == "undefined" || gameServer.clients[i]!.playerTracker.team == 0) {
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
            } else if(lb.length < 10) {
                this.leaderboardAddSort(player, lb);
            } else {
                // 10 in leaderboard already
                if(playerScore > lb[9]!.getScore(false)) {
                    lb.pop();
                    this.leaderboardAddSort(player, lb);
                }
            }
        }

        this.rankOne = lb[0];
    }
}
