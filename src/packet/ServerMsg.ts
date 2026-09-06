import type { Packet } from "../types.js";

// 91 : You have been banned
// 92 : Too many connections from your IP
// 93 : No more slots
// 94 : Too many nicks

export class ServerMsg implements Packet {
    warning: number;

    constructor(warning: number) {
        this.warning = warning;
    }

    build(): ArrayBuffer {
        const buf = new ArrayBuffer(16);
        const view = new DataView(buf);
        view.setUint8(0, this.warning);
        view.setFloat64(1, this.warning, true);
        return buf;
    }
}
