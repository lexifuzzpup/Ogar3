import type { Packet } from "../types.js";

export class BroadCast implements Packet {
    message: string;

    constructor(message: string) {
        this.message = message;
    }

    build(): ArrayBuffer {
        const nick = "Console";
        const buf = new ArrayBuffer(9 + 2 * nick.length + 2 * this.message.length);
        const view = new DataView(buf);
        view.setUint8(0, 99);
        view.setUint8(1, 0);
        view.setUint8(2, 255);
        view.setUint8(3, 0);
        view.setUint8(4, 0);
        let offset = 5;
        for(let j = 0; j < nick.length; j++) {
            view.setUint16(offset, nick.charCodeAt(j), true);
            offset += 2;
        }
        view.setUint16(offset, 0, true);
        offset += 2;
        for(let j = 0; j < this.message.length; j++) {
            view.setUint16(offset, this.message.charCodeAt(j), true);
            offset += 2;
        }
        view.setUint16(offset, 0, true);
        offset += 2;
        return buf;
    }
}
