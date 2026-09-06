import type { BotPlayer } from "./BotPlayer.js";
import type { GameServer } from "../GameServer.js";
import type { PacketHandler } from "../PacketHandler.js";
import type { ClientSocket, Packet } from "../types.js";

// A fake socket for bot players
export class FakeSocket implements ClientSocket {
    readonly isBot = true;
    server: GameServer;
    playerTracker!: BotPlayer;
    packetHandler!: PacketHandler;

    constructor(gameServer: GameServer) {
        this.server = gameServer;
    }

    // Override

    sendPacket(_packet: Packet): void {
        // Fakes sending a packet
        return;
    }

    close(): void {
        // Removes the bot
        const len = this.playerTracker.cells.length;
        for(let i = 0; i < len; i++) {
            const cell = this.playerTracker.cells[0];

            if(!cell) {
                continue;
            }

            this.server.removeNode(cell);
        }

        const index = this.server.clients.indexOf(this);
        if(index != -1) {
            this.server.clients.splice(index, 1);
        }
    }
}
