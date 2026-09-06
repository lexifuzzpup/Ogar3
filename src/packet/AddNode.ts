import type { Cell } from "../entity/Cell.js";
import type { Packet } from "../types.js";

export class AddNode implements Packet {
    item: Cell;

    constructor(item: Cell) {
        this.item = item;
    }

    build(): ArrayBuffer {
        // Only add player controlled cells with this packet or it will bug the camera
        const buf = new ArrayBuffer(5);
        const view = new DataView(buf);

        view.setUint8(0, 32);
        view.setUint32(1, this.item.nodeId, true);

        return buf;
    }
}
