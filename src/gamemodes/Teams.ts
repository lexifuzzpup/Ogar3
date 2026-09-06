import { Mode } from "./Mode.js";
import type { Cell } from "../entity/Cell.js";
import type { PlayerCell } from "../entity/PlayerCell.js";
import type { GameServer } from "../GameServer.js";
import type { PlayerTracker } from "../PlayerTracker.js";
import type { Color } from "../types.js";

export class Teams extends Mode {
    colorFuzziness = 32;

    // Special
    teamAmount = 3; // Amount of teams. Having more than 3 teams will cause the leaderboard to work incorrectly (client issue).
    colors: Color[] = [
        { r: 223, g: 0, b: 0 },
        { r: 0, g: 223, b: 0 },
        { r: 0, g: 0, b: 223 }
    ]; // Make sure you add extra colors here if you wish to increase the team amount [Default colors are: Red, Green, Blue]
    nodes: Cell[][] = []; // Teams

    constructor() {
        super();
        this.ID = 1;
        this.name = "Teams";
        this.decayMod = 1.5;
        this.packetLB = 50;
        this.haveTeams = true;
    }

    // Gamemode Specific Functions

    fuzzColorComponent(component: number): number {
        component += Math.random() * this.colorFuzziness >> 0;
        return component;
    }

    getTeamColor(team: number): Color {
        const color = this.colors[team]!;
        return {
            r: this.fuzzColorComponent(color.r),
            b: this.fuzzColorComponent(color.b),
            g: this.fuzzColorComponent(color.g)
        };
    }

    // Override

    override onPlayerSpawn(gameServer: GameServer, player: PlayerTracker): void {
        // Random color based on team
        player.color = this.getTeamColor(player.team);
        // Spawn player
        gameServer.spawnPlayer(player);
    }

    override onServerInit(gameServer: GameServer): void {
        // Set up teams
        for(let i = 0; i < this.teamAmount; i++) {
            this.nodes[i] = [];
        }

        // migrate current players to team mode
        for(let i = 0; i < gameServer.clients.length; i++) {
            const client = gameServer.clients[i]!.playerTracker;
            this.onPlayerInit(client);
            client.color = this.getTeamColor(client.team);
            for(let j = 0; j < client.cells.length; j++) {
                const cell = client.cells[j]!;
                cell.setColor(client.color);
                this.nodes[client.team]!.push(cell);
            }
        }
    }

    override onPlayerInit(player: PlayerTracker): void {
        // Get random team
        player.team = Math.floor(Math.random() * this.teamAmount);
    }

    override onCellAdd(cell: Cell): void {
        // Add to team list
        this.nodes[cell.owner!.getTeam()]!.push(cell);
    }

    override onCellRemove(cell: Cell): void {
        // Remove from team list
        const team = this.nodes[cell.owner!.getTeam()]!;
        const index = team.indexOf(cell);
        if(index != -1) {
            team.splice(index, 1);
        }
    }

    override onCellMove(x1: number, y1: number, cell: Cell, bool?: boolean): void {
        const team = cell.owner!.getTeam();
        const r = cell.getSize();

        // Find team
        for(let i = 0; i < cell.owner!.visibleNodes.length; i++) {
            // Only collide with player cells
            const check = cell.owner!.visibleNodes[i]!;

            if((check.getType() != 0) || (cell.owner == check.owner)) {
                continue;
            }

            // Collision with teammates
            if(check.owner!.getTeam() == team && bool) {
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
        let total = 0;
        const teamMass: number[] = [];
        // Get mass
        for(let i = 0; i < this.teamAmount; i++) {
            // Set starting mass
            teamMass[i] = 0;

            // Loop through cells
            for(let j = 0; j < this.nodes[i]!.length; j++) {
                const cell = this.nodes[i]![j];

                if(!cell) {
                    continue;
                }

                teamMass[i] += cell.mass;
                total += cell.mass;
            }
        }
        // Calc percentage
        for(let i = 0; i < this.teamAmount; i++) {
            // No players
            if(total <= 0) {
                continue;
            }

            gameServer.leaderboard[i] = teamMass[i]! / total;
        }
    }
}
