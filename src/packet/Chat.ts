import type { PlayerTracker } from "../PlayerTracker.js";
import type { Packet } from "../types.js";

export class Chat implements Packet {
    sender: PlayerTracker;
    message: string;

    constructor(sender: PlayerTracker, message: string) {
        this.sender = sender;
        this.message = message;
    }

    build(): ArrayBuffer {
        let nick = this.sender.getName();
        if(!nick) {
            if(this.sender.cells.length > 0) {
                nick = "An unnamed cell";
            } else {
                nick = "Spectator";
            }
        }

        const buf = new ArrayBuffer(9 + 2 * nick.length + 2 * this.message.length);
        const view = new DataView(buf);
        let color = { r: 155, g: 155, b: 155 };
        if(this.sender.cells.length > 0) {
            color = this.sender.cells[0].getColor();
        }
        view.setUint8(0, 99);
        view.setUint8(1, 0); // flags for client; for future use
        // Send color
        view.setUint8(2, color.r);
        view.setUint8(3, color.g);
        view.setUint8(4, color.b);
        let offset = 5;
        // Send name
        for(let j = 0; j < nick.length; j++) {
            view.setUint16(offset, nick.charCodeAt(j), true);
            offset += 2;
        }
        view.setUint16(offset, 0, true);
        offset += 2;
        // send message
        for(let j = 0; j < this.message.length; j++) {
            view.setUint16(offset, this.message.charCodeAt(j), true);
            offset += 2;
        }
        view.setUint16(offset, 0, true);
        offset += 2;
        return buf;
    }
}
