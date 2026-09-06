import { Mode } from "./Mode.js";
import type { Cell } from "../entity/Cell.js";
import type { GameServer } from "../GameServer.js";
import type { PlayerTracker } from "../PlayerTracker.js";

export class Tournament extends Mode {
    // Config (1 tick = 1000 ms)
    prepTime = 5; // Amount of ticks after the server fills up to wait until starting the game
    endTime = 15; // Amount of ticks after someone wins to restart the game
    autoFill = false;
    autoFillPlayers = 1;
    dcTime = 0;

    // Gamemode Specific Variables
    gamePhase = 0; // 0 = Waiting for players, 1 = Prepare to start, 2 = Game in progress, 3 = End
    contenders: PlayerTracker[] = [];
    maxContenders = 12;

    winner?: PlayerTracker;
    timer?: number;
    timeLimit = 3600; // in seconds
    rankOne?: PlayerTracker;

    constructor() {
        super();
        this.ID = 10;
        this.name = "Tournament";
        this.packetLB = 48;
    }

    // Gamemode Specific Functions

    startGamePrep(_gameServer: GameServer): void {
        this.gamePhase = 1;
        this.timer = this.prepTime; // 10 seconds
    }

    startGame(gameServer: GameServer): void {
        gameServer.run = true;
        this.gamePhase = 2;
        this.getSpectate(); // Gets a random person to spectate
        gameServer.config.playerDisconnectTime = this.dcTime; // Reset config
    }

    endGame(_gameServer: GameServer): void {
        this.winner = this.contenders[0];
        this.gamePhase = 3;
        this.timer = this.endTime; // 30 Seconds
    }

    endGameTimeout(gameServer: GameServer): void {
        gameServer.run = false;
        this.gamePhase = 4;
        this.timer = this.endTime; // 30 Seconds
    }

    fillBots(gameServer: GameServer): void {
        // Fills the server with bots if there arent enough players
        const fill = this.maxContenders - this.contenders.length;
        for(let i = 0; i < fill; i++) {
            gameServer.bots.addBot();
        }
    }

    getSpectate(): void {
        // Finds a random person to spectate
        const index = Math.floor(Math.random() * this.contenders.length);
        this.rankOne = this.contenders[index];
    }

    prepare(gameServer: GameServer): void {
        // Remove all cells
        const len = gameServer.nodes.length;
        for(let i = 0; i < len; i++) {
            const node = gameServer.nodes[0];

            if(!node) {
                continue;
            }

            gameServer.removeNode(node);
        }

        gameServer.bots.loadNames();

        // Pauses the server
        gameServer.run = false;
        this.gamePhase = 0;

        // Get config values
        if(gameServer.config.tourneyAutoFill > 0) {
            this.timer = gameServer.config.tourneyAutoFill;
            this.autoFill = true;
            this.autoFillPlayers = gameServer.config.tourneyAutoFillPlayers;
        }
        // Handles disconnections
        this.dcTime = gameServer.config.playerDisconnectTime;
        gameServer.config.playerDisconnectTime = 0;
        gameServer.config.playerMinMassDecay = gameServer.config.playerStartMass;

        this.prepTime = gameServer.config.tourneyPrepTime;
        this.endTime = gameServer.config.tourneyEndTime;
        this.maxContenders = gameServer.config.tourneyMaxPlayers;

        // Time limit
        this.timeLimit = gameServer.config.tourneyTimeLimit * 60; // in seconds
    }

    onPlayerDeath(_gameServer: GameServer): void {
        // Nothing
    }

    formatTime(_time: number): string {
        if(_time < 0) {
            return "0:00";
        }
        // Format
        const min = Math.floor(this.timeLimit / 60);
        const secNum = this.timeLimit % 60;
        const sec = (secNum > 9) ? secNum.toString() : "0" + secNum.toString();
        return min + ":" + sec;
    }

    // Override

    override onServerInit(gameServer: GameServer): void {
        this.prepare(gameServer);
    }

    override onPlayerSpawn(gameServer: GameServer, player: PlayerTracker): void {
        // Only spawn players if the game hasnt started yet
        if((this.gamePhase == 0) && (this.contenders.length < this.maxContenders)) {
            player.color = gameServer.getRandomColor(); // Random color
            this.contenders.push(player); // Add to contenders list
            gameServer.spawnPlayer(player);

            if(this.contenders.length == this.maxContenders) {
                // Start the game once there is enough players
                this.startGamePrep(gameServer);
            }
        }
    }

    override onCellRemove(cell: Cell): void {
        const owner = cell.owner!;
        let humanJustDied = false;

        if(owner.cells.length <= 0) {
            // Remove from contenders list
            const index = this.contenders.indexOf(owner);
            if(index != -1) {
                if(!this.contenders[index]!.socket.isBot) {
                    humanJustDied = true;
                }
                this.contenders.splice(index, 1);
            }

            // Victory conditions
            let humans = 0;
            for(let i = 0; i < this.contenders.length; i++) {
                if(!this.contenders[i]!.socket.isBot) {
                    humans++;
                }
            }

            // the game is over if:
            // 1) there is only 1 player left, OR
            // 2) all the humans are dead, OR
            // 3) the last-but-one human just died
            if((this.contenders.length == 1 || humans == 0 || (humans == 1 && humanJustDied)) && this.gamePhase == 2) {
                this.endGame(owner.gameServer!);
            } else {
                // Do stuff
                this.onPlayerDeath(owner.gameServer!);
            }
        }
    }

    override updateLB(gameServer: GameServer): void {
        const lb = gameServer.leaderboard;

        switch(this.gamePhase) {
            case 0:
                lb[0] = "Waiting for";
                lb[1] = "players: ";
                lb[2] = this.contenders.length + "/" + this.maxContenders;
                if(this.autoFill) {
                    if(this.timer! <= 0) {
                        this.fillBots(gameServer);
                    } else if(this.contenders.length >= this.autoFillPlayers) {
                        this.timer!--;
                    }
                }
                break;
            case 1:
                lb[0] = "Game starting in";
                lb[1] = this.timer!.toString();
                lb[2] = "Good luck!";
                if(this.timer! <= 0) {
                    // Reset the game
                    this.startGame(gameServer);
                } else {
                    this.timer!--;
                }
                break;
            case 2:
                lb[0] = "Players Remaining";
                lb[1] = this.contenders.length + "/" + this.maxContenders;
                lb[2] = "Time Limit:";
                lb[3] = this.formatTime(this.timeLimit);
                if(this.timeLimit < 0) {
                    // Timed out
                    this.endGameTimeout(gameServer);
                } else {
                    this.timeLimit--;
                }
                break;
            case 3:
                lb[0] = "Congratulations";
                lb[1] = this.winner!.getName();
                lb[2] = "for winning!";
                if(this.timer! <= 0) {
                    // Reset the game
                    this.onServerInit(gameServer);
                    // Respawn starting food
                    gameServer.startingFood();
                } else {
                    lb[3] = "Game restarting in";
                    lb[4] = this.timer!.toString();
                    this.timer!--;
                }
                break;
            case 4:
                lb[0] = "Time Limit";
                lb[1] = "Reached!";
                if(this.timer! <= 0) {
                    // Reset the game
                    this.onServerInit(gameServer);
                    // Respawn starting food
                    gameServer.startingFood();
                } else {
                    lb[2] = "Game restarting in";
                    lb[3] = this.timer!.toString();
                    this.timer!--;
                }
            // eslint-disable-next-line no-fallthrough
            default:
                break;
        }
    }
}
