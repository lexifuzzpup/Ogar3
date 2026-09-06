import type { Packet } from "../types.js";

export class DrawLine implements Packet {
    x: number;
    y: number;

    constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
    }

    build(): ArrayBuffer {
        const buf = new ArrayBuffer(5);
        const view = new DataView(buf);

        view.setUint8(0, 21);
        view.setUint16(1, this.x, true);
        view.setUint16(3, this.y, true);

        return buf;
    }
}
