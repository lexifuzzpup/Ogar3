import * as GameMode from "../gamemodes/index.js";
import * as Packet from "../packet/index.js";
import * as Entity from "../entity/index.js";
import type { PlayerCell } from "../entity/PlayerCell.js";
import type { GameServer } from "../GameServer.js";

type CommandHandler = (gameServer: GameServer, split: string[]) => void;

function fillChar(data: unknown, char: string, fieldLength: number, rTL?: boolean): string {
    let result = String(data);
    if(rTL === true) {
        for(let i = result.length; i < fieldLength; i++) {
            result = char.concat(result);
        }
    } else {
        for(let i = result.length; i < fieldLength; i++) {
            result = result.concat(char);
        }
    }
    return result;
}

function seconds2time(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds - (hours * 3600)) / 60);
    const seconds = totalSeconds - (hours * 3600) - (minutes * 60);
    let time = "";

    if(hours != 0) {
        time = hours + ":";
    }
    if(minutes != 0 || time !== "") {
        const minuteStr = (minutes < 10 && time !== "") ? "0" + minutes : String(minutes);
        time += minuteStr + ":";
    }
    if(time === "") {
        time = seconds + " seconds";
    } else {
        time += (seconds < 10) ? "0" + seconds : String(seconds);
    }
    return time;
}

export class CommandList {
    static list: Record<string, CommandHandler> = {
        help(_gameServer, _split) {
            console.log("========================== HELP ============================");
            console.log("[36maddbot     [0m: add one or more bot to the server");
            console.log("[36mban        [0m: ban a player with IP");
            console.log("[36mbanlist    [0m: show current ban list");
            console.log("[36mboard      [0m: set scoreboard text");
            console.log("[36mboardreset [0m: reset scoreboard text");
            console.log("[36mchange     [0m: change specified settings");
            console.log("[36mclear      [0m: clear console output");
            console.log("[36mcolor      [0m: set cell(s) color by client ID");
            console.log("[36mexit       [0m: stop the server");
            console.log("[36mfood       [0m: spawn food at specified Location");
            console.log("[36mgamemode   [0m: change server gamemode");
            console.log("[36mkick       [0m: kick player or bot by client ID");
            console.log("[36mkill       [0m: kill cell(s) by client ID");
            console.log("[36mkillall    [0m: kill everyone");
            console.log("[36mmass       [0m: set cell(s) mass by client ID");
            console.log("[36mmerge\t    [0m: force a player to merge");
            console.log("[36mname       [0m: change cell(s) name by client ID");
            console.log("[36mplayerlist [0m: get list of players and bots");
            console.log("[36mpause      [0m: pause game , freeze all cells");
            console.log("[36mreload     [0m: reload config");
            console.log("[36msay        [0m: chat from console");
            console.log("[36msplit      [0m: force a player to split");
            console.log("[36mstatus     [0m: get server status");
            console.log("[36mtp         [0m: teleport player to specified location");
            console.log("[36munban      [0m: un ban a player with IP");
            console.log("[36mvirus      [0m: spawn virus at a specified Location");
            console.log("============================================================");
        },
        addbot(gameServer, split) {
            let add = parseInt(split[1]!);
            if(isNaN(add)) {
                add = 1; // Adds 1 bot if user doesnt specify a number
            }

            for(let i = 0; i < add; i++) {
                gameServer.bots.addBot();
            }
            console.log("[36mServer: [0mAdded " + add + " player bot(s)");
        },
        ban(gameServer, split) {
            const ip = split[1]!; // Get ip
            if(gameServer.banned.indexOf(ip) == -1) {
                gameServer.banned.push(ip);
                console.log("[36mServer: [0mAdded " + ip + " to the banlist");
                // Remove from game
                for(const i in gameServer.clients) {
                    const c = gameServer.clients[i]!;
                    if(!c.remoteAddress) {
                        continue;
                    }
                    if(c.remoteAddress == ip) {
                        c.sendPacket(new Packet.ServerMsg(91));
                        c.close(); // Kick out
                    }
                }
            } else {
                console.log("[36mServer: [0mThat IP is already banned");
            }
        },
        banlist(gameServer, split) {
            if((typeof split[1] != "undefined") && (split[1].toLowerCase() == "clear")) {
                gameServer.banned = [];
                console.log("[36mServer: [0mCleared ban list");
                return;
            }

            console.log("[36mServer: [0mCurrent banned IPs (" + gameServer.banned.length + ")");
            for(const i in gameServer.banned) {
                console.log(gameServer.banned[i]);
            }
        },
        board(gameServer, split) {
            const newLB: string[] = [];
            for(let i = 1; i < split.length; i++) {
                newLB[i - 1] = split[i]!;
            }

            // Clears the update leaderboard function and replaces it with our own
            gameServer.gameMode.packetLB = 48;
            gameServer.gameMode.specByLeaderboard = false;
            gameServer.gameMode.updateLB = (gs) => { gs.leaderboard = newLB; };
            console.log("[36mServer: [0mSuccessfully changed leaderboard values");
        },
        boardreset(gameServer) {
            // Gets the current gamemode
            const gm = GameMode.get(gameServer.gameMode.ID);

            // Replace functions
            gameServer.gameMode.packetLB = gm.packetLB;
            gameServer.gameMode.updateLB = gm.updateLB.bind(gm);
            console.log("[36mServer: [0mSuccessfully reset leaderboard");
        },
        change(gameServer, split) {
            const key = split[1]!;
            let value: number = 0;
            const raw = split[2]!;

            // Check if int/float
            if(raw.indexOf(".") != -1) {
                value = parseFloat(raw);
            } else {
                value = parseInt(raw);
            }

            if(typeof gameServer.config[key] != "undefined") {
                gameServer.config[key] = value;
                console.log("Set " + key + " to " + value);
            } else {
                console.log("[36mServer: [0mInvalid config value");
            }
        },
        clear() {
            process.stdout.write("[2J[0;0H");
        },
        color(gameServer, split) {
            // Validation checks
            const id = parseInt(split[1]!);
            if(isNaN(id)) {
                console.log("[36mServer: [0mPlease specify a valid player ID!");
                return;
            }

            const color = { r: 0, g: 0, b: 0 };
            color.r = Math.max(Math.min(parseInt(split[2]!), 255), 0);
            color.g = Math.max(Math.min(parseInt(split[3]!), 255), 0);
            color.b = Math.max(Math.min(parseInt(split[4]!), 255), 0);

            // Sets color to the specified amount
            for(const i in gameServer.clients) {
                if(gameServer.clients[i]!.playerTracker.pID == id) {
                    const client = gameServer.clients[i]!.playerTracker;
                    client.setColor(color); // Set color
                    for(const j in client.cells) {
                        client.cells[j]!.setColor(color);
                    }
                    break;
                }
            }
        },
        food(gameServer, split) {
            const pos = { x: parseInt(split[1]!), y: parseInt(split[2]!) };
            let mass = parseInt(split[3]!);

            // Make sure the input values are numbers
            if(isNaN(pos.x) || isNaN(pos.y)) {
                console.log("[36mServer: [0mInvalid coordinates");
                return;
            }

            if(isNaN(mass)) {
                mass = gameServer.config.foodMass;
            }

            // Spawn
            const f = new Entity.Food(gameServer.getNextNodeId(), null, pos, mass);
            f.setColor(gameServer.getRandomColor());
            gameServer.addNode(f);
            gameServer.currentFood++;
            console.log("[36mServer: [0mSpawned 1 food cell at (" + pos.x + " , " + pos.y + ")");
        },
        gamemode(gameServer, split) {
            try {
                const n = parseInt(split[1]!);
                const gm = GameMode.get(n); // If there is an invalid gamemode, the function will exit
                gameServer.gameMode.onChange(gameServer); // Reverts the changes of the old gamemode
                gameServer.gameMode = gm; // Apply new gamemode
                gameServer.gameMode.onServerInit(gameServer); // Resets the server
                console.log("[36mServer: [0mChanged game mode to " + gameServer.gameMode.name);
            } catch {
                console.log("[36mServer: [0mInvalid game mode selected");
            }
        },
        kill(gameServer, split) {
            const id = parseInt(split[1]!);
            if(isNaN(id)) {
                console.log("[36mServer: [0mPlease specify a valid player ID!");
                return;
            }

            let count = 0;
            for(const i in gameServer.clients) {
                if(gameServer.clients[i]!.playerTracker.pID == id) {
                    const client = gameServer.clients[i]!.playerTracker;
                    const len = client.cells.length;
                    for(let j = 0; j < len; j++) {
                        gameServer.removeNode(client.cells[0]!);
                        count++;
                    }

                    console.log("[36mServer: [0mRemoved " + count + " cells");
                    break;
                }
            }
        },
        killall(gameServer) {
            let count = 0;
            const len = gameServer.nodesPlayer.length;
            for(let i = 0; i < len; i++) {
                gameServer.removeNode(gameServer.nodesPlayer[0]!);
                count++;
            }
            console.log("[36mServer: [0mRemoved " + count + " cells");
        },
        mass(gameServer, split) {
            // Validation checks
            const id = parseInt(split[1]!);
            if(isNaN(id)) {
                console.log("[36mServer: [0mPlease specify a valid player ID!");
                return;
            }
            const amount = Math.max(parseInt(split[2]!), 9);
            if(isNaN(amount)) {
                console.log("[36mServer: [0mPlease specify a valid number");
                return;
            }
            // Sets mass to the specified amount
            for(const i in gameServer.clients) {
                if(gameServer.clients[i]!.playerTracker.pID == id) {
                    const client = gameServer.clients[i]!.playerTracker;
                    for(const j in client.cells) {
                        client.cells[j]!.mass = amount;
                    }

                    console.log("[36mServer: [0mSet mass of " + client.name + " to " + amount);
                    break;
                }
            }
        },
        merge(gameServer, split) {
            // Validation checks
            const id = parseInt(split[1]!);
            if(isNaN(id)) {
                console.log("[36mServer: [0mPlease specify a valid player ID!");
                return;
            }
            // Sets merge time
            for(const i in gameServer.clients) {
                if(gameServer.clients[i]!.playerTracker.pID == id) {
                    const client = gameServer.clients[i]!.playerTracker;
                    for(const j in client.cells) {
                        (client.cells[j] as PlayerCell).calcMergeTime(-10000);
                    }
                    console.log("[36mServer: [0mForced " + client.name + " to merge cells");
                    break;
                }
            }
        },
        split(gameServer, split) {
            // Validation checks
            const id = parseInt(split[1]!);
            let count = parseInt(split[2]!);
            if(isNaN(id)) {
                console.log("[36mServer: [0mPlease specify a valid player ID!");
                return;
            }
            if(isNaN(count)) {
                // Split into 16 cells
                count = 4;
            }

            // Split!
            for(const i in gameServer.clients) {
                if(gameServer.clients[i]!.playerTracker.pID == id) {
                    const client = gameServer.clients[i]!.playerTracker;
                    // Split
                    for(let k = 0; k < count; k++) {
                        gameServer.splitCells(client);
                    }
                    console.log("[36mServer: [0mForced " + client.name + " to split cells");
                    break;
                }
            }
        },
        name(gameServer, split) {
            // Validation checks
            const id = parseInt(split[1]!);
            if(isNaN(id)) {
                console.log("[36mServer: [0mPlease specify a valid player ID!");
                return;
            }
            const name = split[2];
            if(typeof name == "undefined") {
                console.log("[36mServer: [0mPlease type a valid name");
                return;
            }
            // Change name
            for(let i = 0; i < gameServer.clients.length; i++) {
                const client = gameServer.clients[i]!.playerTracker;

                if(client.pID == id) {
                    console.log("[36mServer: [0mChanging " + client.name + " to " + name);
                    client.name = name;
                    return;
                }
            }
            // Error
            console.log("[36mServer: [0mPlayer " + id + " was not found");
        },
        playerlist(gameServer) {
            console.log("Showing " + gameServer.clients.length + " players: ");
            console.log(" ID         | IP              | " + fillChar("NICK", " ", (gameServer.config.playerMaxNickLength + 2)) + " | CELLS | SCORE  | POSITION    "); // Fill space
            console.log(fillChar("", "-", " ID         | IP              |  | CELLS | SCORE  | POSITION    ".length + (gameServer.config.playerMaxNickLength + 2)));
            for(let i = 0; i < gameServer.clients.length; i++) {
                const client = gameServer.clients[i]!.playerTracker;

                // ID with 3 digits length
                const id = fillChar(client.pID, " ", 10, true);

                // Get ip (15 digits length)
                let ip = "BOT";
                if(typeof gameServer.clients[i]!.remoteAddress != "undefined") {
                    ip = gameServer.clients[i]!.remoteAddress!;
                }
                ip = fillChar(ip, " ", 15);

                // Get name and data
                let nick = "", cells = "", score = "", position = "", data = "";
                if(client.disconnect >= 0) {
                    const tmp = "(" + client.disconnect + "sec remaining) DISCONNECTED";
                    data = fillChar(tmp, "-", " | CELLS | SCORE  | POSITION    ".length + (gameServer.config.playerMaxNickLength + 2), true);
                    console.log(" " + id + " | " + ip + " | " + data);
                } else if(client.spectate) {
                    try {
                        // Get spectated player
                        if(gameServer.getMode().specByLeaderboard) { // Get spec type
                            nick = (gameServer.leaderboard[client.spectatedPlayer] as { name: string }).name;
                        } else {
                            nick = gameServer.clients[client.spectatedPlayer]!.playerTracker.name;
                        }
                    } catch {
                        // Specating nobody
                        nick = "";
                    }
                    nick = (nick == "") ? "No Player Selected" : nick;
                    data = fillChar("SPECTATOR: " + nick, "-", " | CELLS | SCORE  | POSITION    ".length + (gameServer.config.playerMaxNickLength + 2), true);
                    console.log(" " + id + " | " + ip + " | " + data);
                } else if(client.cells.length > 0) {
                    nick = fillChar((client.name == "") ? "No Player Selected" : client.name, " ", (gameServer.config.playerMaxNickLength + 2));
                    cells = fillChar(client.cells.length, " ", 5, true);
                    score = fillChar(client.getScore(true), " ", 6, true);
                    position = fillChar(client.centerPos.x.toFixed(0), " ", 5, true) + ", " + fillChar(client.centerPos.y.toFixed(0), " ", 5, true);
                    console.log(" " + id + " | " + ip + " | " + nick + " | " + cells + " | " + score + " | " + position);
                } else {
                    // No cells = dead player or in-menu
                    data = fillChar("DEAD OR NOT PLAYING", "-", " | CELLS | SCORE  | POSITION    ".length + (gameServer.config.playerMaxNickLength + 2), true);
                    console.log(" " + id + " | " + ip + " | " + data);
                }
            }
        },
        pause(gameServer) {
            gameServer.run = !gameServer.run; // Switches the pause state
            const s = gameServer.run ? "Unpaused" : "Paused";
            console.log("[36mServer: [0m" + s + " the game.");
        },
        reload(gameServer) {
            gameServer.loadConfig();
            console.log("[36mServer: [0mReloaded the config file successfully");
        },
        status(gameServer) {
            // Get amount of humans/bots
            let humans = 0, bots = 0, players = 0;
            for(let i = 0; i < gameServer.clients.length; i++) {
                const client = gameServer.clients[i]!.playerTracker;
                if(client.disconnect == -1) {
                    if(!gameServer.clients[i]!.isBot) {
                        humans++;
                    } else {
                        bots++;
                    }
                    players++;
                }
            }
            console.log("[36mServer: [0mConnected players: " + players + "/" + gameServer.config.serverMaxConnections);
            console.log("[36mServer: [0mPlayers: " + humans + " Bots: " + bots);
            console.log("[36mServer: [0mServer has been running for " + seconds2time(process.uptime()));

            const used = (process.memoryUsage().heapUsed / 1024).toFixed(0);
            const total = (process.memoryUsage().heapTotal / 1024).toFixed(0);
            console.log("[36mServer: [0mCurrent memory usage: " + used + "/" + total + " Kb");

            console.log("[36mServer: [0mCurrent game mode: " + gameServer.gameMode.name);
        },
        tp(gameServer, split) {
            const id = parseInt(split[1]!);
            if(isNaN(id)) {
                console.log("[36mServer: [0mPlease specify a valid player ID!");
                return;
            }

            // Make sure the input values are numbers
            const pos = { x: parseInt(split[2]!), y: parseInt(split[3]!) };
            if(isNaN(pos.x) || isNaN(pos.y)) {
                console.log("[36mServer: [0mInvalid coordinates");
                return;
            }

            // Spawn
            for(const i in gameServer.clients) {
                if(gameServer.clients[i]!.playerTracker.pID == id) {
                    const client = gameServer.clients[i]!.playerTracker;
                    for(const j in client.cells) {
                        client.cells[j]!.position.x = pos.x;
                        client.cells[j]!.position.y = pos.y;
                    }

                    console.log("[36mServer: [0mTeleported " + client.name + " to (" + pos.x + " , " + pos.y + ")");
                    break;
                }
            }
        },
        unban(gameServer, split) {
            const ip = split[1]!; // Get ip
            const index = gameServer.banned.indexOf(ip);
            if(index > -1) {
                gameServer.banned.splice(index, 1);
                console.log("[36mServer: [0mUnbanned " + ip);
            } else {
                console.log("[36mServer: [0mThat IP is not banned");
            }
        },
        virus(gameServer, split) {
            const pos = { x: parseInt(split[1]!), y: parseInt(split[2]!) };
            let mass = parseInt(split[3]!);

            // Make sure the input values are numbers
            if(isNaN(pos.x) || isNaN(pos.y)) {
                console.log("[36mServer: [0mInvalid coordinates");
                return;
            }
            if(isNaN(mass)) {
                mass = gameServer.config.virusStartMass;
            }

            // Spawn
            const v = new Entity.Virus(gameServer.getNextNodeId(), null, pos, mass);
            gameServer.addNode(v);
            console.log("[36mServer: [0mSpawned 1 virus at (" + pos.x + " , " + pos.y + ")");
        },
        exit(gameServer) {
            gameServer.exitserver();
        },
        say(gameServer, split) {
            let message = "";
            for(let i = 1; i < split.length; i++) {
                message += split[i] + " ";
            }
            const packet = new Packet.BroadCast(message);
            for(let i = 0; i < gameServer.clients.length; i++) {
                gameServer.clients[i]!.sendPacket(packet);
            }
            console.log("[36mServer: [0m" + message);
        }
    };
}
