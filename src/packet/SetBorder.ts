import type { Packet } from "../types.js";

export class SetBorder implements Packet {
    left: number;
    right: number;
    top: number;
    bottom: number;

    constructor(left: number, right: number, top: number, bottom: number) {
        this.left = left;
        this.right = right;
        this.top = top;
        this.bottom = bottom;
    }

    build(): ArrayBuffer {
        const version = "Ogar3 by Faris90";
        const buf = new ArrayBuffer(39 + 2 * version.length);
        const view = new DataView(buf);

        view.setUint8(0, 64);
        view.setFloat64(1, this.left, true);
        view.setFloat64(9, this.top, true);
        view.setFloat64(17, this.right, true);
        view.setFloat64(25, this.bottom, true);
        let offset = 33;
        view.setUint32(offset, 1, true);
        offset += 4;
        for(let j = 0; j < version.length; j++) {
            view.setUint16(offset, version.charCodeAt(j), true);
            offset += 2;
        }
        view.setUint16(offset, 0, true);
        return buf;
    }
}
