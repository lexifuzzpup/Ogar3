import type { Packet } from "../types.js";

export class UpdatePosition implements Packet {
    x: number;
    y: number;
    size: number;

    constructor(x: number, y: number, size: number) {
        this.x = x;
        this.y = y;
        this.size = size;
    }

    build(): ArrayBuffer {
        const buf = new ArrayBuffer(13);
        const view = new DataView(buf);

        view.setUint8(0, 17);
        view.setFloat32(1, this.x, true);
        view.setFloat32(5, this.y, true);
        view.setFloat32(9, this.size, true);

        return buf;
    }
}
