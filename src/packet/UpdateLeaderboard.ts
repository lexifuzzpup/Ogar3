import type { PlayerTracker } from "../PlayerTracker.js";
import type { Packet } from "../types.js";

export type LeaderboardEntry = string | number | PlayerTracker;

export class UpdateLeaderboard implements Packet {
    leaderboard: LeaderboardEntry[];
    packetLB: number;

    constructor(leaderboard: LeaderboardEntry[], packetLB: number) {
        this.leaderboard = leaderboard;
        this.packetLB = packetLB;
    }

    build(): ArrayBuffer | undefined {
        // First, calculate the size
        const lb = this.leaderboard;
        let bufferSize = 5;
        let validElements = 0;

        switch(this.packetLB) {
            case 48: { // Custom Text List
                // Get size of packet
                for(let i = 0; i < lb.length; i++) {
                    if(typeof lb[i] == "undefined") {
                        continue;
                    }

                    const item = lb[i] as string;
                    bufferSize += 4; // Empty ID
                    bufferSize += item.length * 2; // String length
                    bufferSize += 2; // Name terminator

                    validElements++;
                }

                const buf = new ArrayBuffer(bufferSize);
                const view = new DataView(buf);

                // Set packet data
                view.setUint8(0, 49); // Packet ID
                view.setUint32(1, validElements, true); // Number of elements
                let offset = 5;

                // Loop through strings
                for(let i = 0; i < lb.length; i++) {
                    if(typeof lb[i] == "undefined") {
                        continue;
                    }

                    const item = lb[i] as string;

                    view.setUint32(offset, 1, true);
                    offset += 4;

                    for(let j = 0; j < item.length; j++) {
                        view.setUint16(offset, item.charCodeAt(j), true);
                        offset += 2;
                    }

                    view.setUint16(offset, 0, true);
                    offset += 2;
                }
                return buf;
            }
            case 49: { // FFA-type Packet (List)
                // Get size of packet
                for(let i = 0; i < lb.length; i++) {
                    if(typeof lb[i] == "undefined") {
                        continue;
                    }

                    const item = lb[i] as PlayerTracker;
                    bufferSize += 4; // Element ID
                    bufferSize += item.getName() ? item.getName().length * 2 : 0; // Name
                    bufferSize += 2; // Name terminator

                    validElements++;
                }

                const buf = new ArrayBuffer(bufferSize);
                const view = new DataView(buf);

                // Set packet data
                view.setUint8(0, this.packetLB); // Packet ID
                view.setUint32(1, validElements, true); // Number of elements

                let offset = 5;
                for(let i = 0; i < lb.length; i++) {
                    if(typeof lb[i] == "undefined") {
                        continue;
                    }

                    const item = lb[i] as PlayerTracker;

                    let nodeID = 0; // Get node id of player's 1st cell
                    if(item.cells[0]) {
                        nodeID = item.cells[0].nodeId;
                    }

                    view.setUint32(offset, nodeID, true);
                    offset += 4;

                    // Set name
                    const name = item.getName();
                    if(name) {
                        for(let j = 0; j < name.length; j++) {
                            view.setUint16(offset, name.charCodeAt(j), true);
                            offset += 2;
                        }
                    }

                    view.setUint16(offset, 0, true);
                    offset += 2;
                }
                return buf;
            }
            case 50: { // Teams-type Packet (Pie chart)
                validElements = lb.length;
                bufferSize += (validElements * 4);

                const buf = new ArrayBuffer(bufferSize);
                const view = new DataView(buf);

                view.setUint8(0, this.packetLB); // Packet ID
                view.setUint32(1, validElements, true); // Number of elements

                let offset = 5;
                for(let i = 0; i < validElements; i++) {
                    view.setFloat32(offset, lb[i] as number, true); // Number of elements
                    offset += 4;
                }

                return buf;
            }
            default:
                break;
        }
    }
}
