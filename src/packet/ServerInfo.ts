import type { Packet } from "../types.js";

export class ServerInfo implements Packet {
    uptime: number;
    players: number;
    msize: number;
    mfood: number;
    smode: number;

    constructor(uptime: number, players: number, msize: number, mfood: number, smode: number) {
        this.uptime = uptime;
        this.players = players;
        this.msize = msize;
        this.mfood = mfood;
        this.smode = smode;
    }

    build(): ArrayBuffer {
        const buf = new ArrayBuffer(41);
        const view = new DataView(buf);

        view.setUint8(0, 90);
        view.setFloat64(1, this.uptime, true);
        view.setFloat64(9, this.players, true);
        view.setFloat64(17, this.msize, true);
        view.setFloat64(25, this.mfood, true);
        view.setFloat64(33, this.smode, true);
        return buf;
    }
}
