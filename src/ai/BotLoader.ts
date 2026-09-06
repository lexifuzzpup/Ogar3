import { readFileSync } from "node:fs";
import { BotPlayer } from "./BotPlayer.js";
import { FakeSocket } from "./FakeSocket.js";
import { PacketHandler } from "../PacketHandler.js";
import type { GameServer } from "../GameServer.js";

export class BotLoader {
    gameServer: GameServer;
    randomNames: string[] = [];
    nameIndex = 0;

    constructor(gameServer: GameServer) {
        this.gameServer = gameServer;
        this.loadNames();
    }

    getName(): string {
        let name = "";

        // Picks a random name for the bot
        if(this.randomNames.length > 0) {
            const index = Math.floor(Math.random() * this.randomNames.length);
            name = this.randomNames[index]!.replace("\r", "");
            this.randomNames.splice(index, 1);
        } else {
            name = "bot" + ++this.nameIndex;
        }

        return "[BOT] " + name;
    }

    loadNames(): void {
        this.randomNames = [];
        // Load names
        try {
            // Read and parse the names - filter out whitespace-only names
            this.randomNames = readFileSync("./botnames.txt", "utf8").split("\n");
        } catch {
            // Nothing, use the default names
        }
        this.nameIndex = 0;
    }

    addBot(): void {
        const s = new FakeSocket(this.gameServer);
        s.playerTracker = new BotPlayer(this.gameServer, s);
        s.packetHandler = new PacketHandler(this.gameServer, s);

        // Add to client list
        this.gameServer.clients.push(s);

        // Add to world
        s.packetHandler.setNickname(this.getName());
    }
}
