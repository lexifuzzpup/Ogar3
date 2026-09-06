import { appendFileSync } from "node:fs";
import { ServerInfo } from "./packet/ServerInfo.js";
import { SetBorder } from "./packet/SetBorder.js";
import { ServerMsg } from "./packet/ServerMsg.js";
import { Chat } from "./packet/Chat.js";
import type { GameServer } from "./GameServer.js";
import type { ClientSocket } from "./types.js";

function stobuf(buf: Uint8Array): ArrayBuffer {
    const length = buf.length;
    const arrayBuf = new ArrayBuffer(length);
    const view = new Uint8Array(arrayBuf);
    for(let i = 0; i < length; i++) {
        view[i] = buf[i]!;
    }
    return arrayBuf;
}

export class PacketHandler {
    gameServer: GameServer;
    socket: ClientSocket;
    // Detect protocol version - we can do something about it later
    protocol = 0;
    pressQ = false;
    pressW = false;
    pressSpace = false;

    // Was module-level state in the original (`var LastMsg; var SpamBlock;`), shared - and
    // leaking spam-detection - across every connected client; now one pair per connection.
    private lastMsg?: string;
    private spamBlock = 0;

    constructor(gameServer: GameServer, socket: ClientSocket) {
        this.gameServer = gameServer;
        this.socket = socket;
    }

    handleMessage(message: Uint8Array): void {
        // Discard empty messages
        if(message.length == 0) {
            return;
        }

        const buffer = stobuf(message);
        const view = new DataView(buffer);
        const packetId = view.getUint8(0);

        switch(packetId) {
            case 0: {
                // Set Nickname
                let nick = "";
                const maxLen = this.gameServer.config.playerMaxNickLength * 2; // 2 bytes per char
                for(let i = 1; i < view.byteLength && i <= maxLen; i += 2) {
                    const charCode = view.getUint16(i, true);
                    if(charCode == 0) {
                        break;
                    }
                    nick += String.fromCharCode(charCode);
                }
                this.setNickname(nick);
                break;
            }
            case 1:
                // Spectate mode
                if(this.socket.playerTracker.cells.length <= 0) {
                    // Make sure client has no cells
                    this.gameServer.switchSpectator(this.socket.playerTracker);
                    this.socket.playerTracker.spectate = true;
                }
                break;
            case 16: {
                const client = this.socket.playerTracker;
                if(view.byteLength == 13) {
                    client.mouse.x = view.getInt32(1, true);
                    client.mouse.y = view.getInt32(5, true);
                } else if(view.byteLength == 9) {
                    client.mouse.x = view.getInt16(1, true);
                    client.mouse.y = view.getInt16(3, true);
                } else if(view.byteLength == 21) {
                    client.mouse.x = view.getFloat64(1, true);
                    client.mouse.y = view.getFloat64(9, true);
                }
                break;
            }
            case 17:
                // Space Press - Split cell
                this.pressSpace = true;
                break;
            case 18:
                // Q Key Pressed
                this.pressQ = true;
                break;
            case 19:
                // Q Key Released
                break;
            case 21:
                // W Press - Eject mass
                this.pressW = true;
                break;
            case 80:
                // Some Code Agar.io Sends us o.O
                // (Kept as a no-op fallthrough into case 90, matching the original.)
                break;
            case 90: { // eslint-disable-line no-fallthrough
                // Send Server Info
                let player = 0;
                let client: ClientSocket;
                for(let i = 0; i < this.gameServer.clients.length; i++) {
                    client = this.gameServer.clients[i]!;
                    if((client.playerTracker.disconnect <= 0) && (client.playerTracker.spectate == false)) {
                        ++player;
                    }
                }
                this.socket.sendPacket(new ServerInfo(Number(process.uptime().toFixed(0)), player, this.gameServer.config.borderRight, this.gameServer.config.foodMaxAmount, this.gameServer.config.serverGamemode));
                break;
            }
            case 255: {
                // Connection Start
                if(view.byteLength == 5) {
                    const c = this.gameServer.config;
                    let player = 0;
                    let client: ClientSocket;
                    for(let i = 0; i < this.gameServer.clients.length; i++) {
                        client = this.gameServer.clients[i]!;
                        if((client.playerTracker.disconnect <= 0) && (client.playerTracker.spectate == false)) {
                            ++player;
                        }
                    }
                    // Boot Player if Server Full
                    if(player > c.serverMaxConnections) {
                        this.socket.sendPacket(new ServerMsg(93));
                        this.socket.close();
                    }
                    this.socket.sendPacket(new SetBorder(c.borderLeft, c.borderRight, c.borderTop, c.borderBottom));
                    this.socket.sendPacket(new ServerInfo(Number(process.uptime().toFixed(0)), player, c.borderRight, c.foodMaxAmount, this.gameServer.config.serverGamemode));
                    break;
                }
                break;
            }
            case 99: {
                let message2 = "";
                const maxLen = this.gameServer.config.chatMaxMessageLength * 2;
                let offset = 2;
                const flags = view.getUint8(1);

                if(flags & 2) { offset += 4; }
                if(flags & 4) { offset += 8; }
                if(flags & 8) { offset += 16; }

                for(let i = offset; i < view.byteLength && i <= maxLen; i += 2) {
                    const charCode = view.getUint16(i, true);
                    if(charCode == 0) {
                        break;
                    }
                    message2 += String.fromCharCode(charCode);
                }
                const date = new Date();

                if((date.getTime() - (this.socket.playerTracker.cTime?.getTime() ?? 0)) < 2500) {
                    // Happens when user tries to spam
                    this.gameServer.sendMSG(this.socket.playerTracker, "Please don't spam...");
                    break;
                }

                this.socket.playerTracker.cTime = date;
                let wname = this.socket.playerTracker.name;
                if(wname == "") {
                    wname = "Spectator";
                }

                if(this.gameServer.config.serverAdminPass != "") {
                    const passkey = "/rcon " + this.gameServer.config.serverAdminPass + " ";
                    if(message2.substr(0, passkey.length) == passkey) {
                        const cmd = message2.substr(passkey.length, message2.length);
                        console.log("[36m" + wname + ": [0missued a remote console command: " + cmd);
                        const split = cmd.split(" ");
                        const first = split[0]!.toLowerCase();
                        const execute = this.gameServer.commands[first];
                        if(typeof execute != "undefined") {
                            execute(this.gameServer, split);
                        } else {
                            console.log("Invalid Command!");
                        }
                        break;
                    } else if(message2.substr(0, 6) == "/rcon ") {
                        console.log("[36m" + wname + ": [0missued a remote console command but used a wrong pass key!");
                        break;
                    }
                }

                if(message2 == this.lastMsg) {
                    this.spamBlock++;
                    if(this.spamBlock > 10) {
                        this.gameServer.banned.push(this.socket.remoteAddress!);
                    }
                    if(this.spamBlock > 5) {
                        this.socket.close();
                    }
                    break;
                }
                this.lastMsg = message2;
                this.spamBlock = 0;

                console.log("[36m" + wname + ": [0m" + message2);

                let hour = date.getHours().toString();
                hour = (Number(hour) < 10 ? "0" : "") + hour;
                let min = date.getMinutes().toString();
                min = (Number(min) < 10 ? "0" : "") + min;
                const time = hour + ":" + min;

                appendFileSync("logs/chat.log", "[" + time + "] " + wname + ": " + message2 + "\n");

                const packet = new Chat(this.socket.playerTracker, message2);
                // Send to all clients (broadcast)
                for(let i = 0; i < this.gameServer.clients.length; i++) {
                    this.gameServer.clients[i]!.sendPacket(packet);
                }
                break;
            }
            default:
                break;
        }
    }

    setNickname(newNick: string): void {
        const client = this.socket.playerTracker;
        if(client.cells.length < 1) {
            // Set name first
            client.setName(newNick);

            // If client has no cells... then spawn a player
            this.gameServer.gameMode.onPlayerSpawn(this.gameServer, client);

            // Turn off spectate mode
            client.spectate = false;
        }
    }
}
