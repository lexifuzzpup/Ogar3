import type { Packet } from "../types.js";

export class ClearNodes implements Packet {
    build(): ArrayBuffer {
        const buf = new ArrayBuffer(1);
        const view = new DataView(buf);

        view.setUint8(0, 20);

        return buf;
    }
}
