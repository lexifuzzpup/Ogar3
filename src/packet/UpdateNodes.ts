import type { Cell } from "../entity/Cell.js";
import type { Packet } from "../types.js";

export class UpdateNodes implements Packet {
    destroyQueue: Cell[];
    nodes: Cell[];
    nonVisibleNodes: Cell[];
    serverVersion: number;

    constructor(destroyQueue: Cell[], nodes: Cell[], nonVisibleNodes: Cell[], serverVersion: number) {
        this.destroyQueue = destroyQueue;
        this.nodes = nodes;
        this.nonVisibleNodes = nonVisibleNodes;
        this.serverVersion = serverVersion;
    }

    build(): ArrayBuffer {
        // Calculate nodes sub packet size before making the data view
        let nodesLength = 0;
        for(let i = 0; i < this.nodes.length; i++) {
            const node = this.nodes[i];

            if(typeof node == "undefined") {
                continue;
            }
            if(this.serverVersion == 1) {
                nodesLength = nodesLength + 20 + (node.getName().length * 2);
            } else {
                nodesLength = nodesLength + 16 + (node.getName().length * 2);
            }
        }

        const buf = new ArrayBuffer(3 + (this.destroyQueue.length * 12) + (this.nonVisibleNodes.length * 4) + nodesLength + 8);
        const view = new DataView(buf);

        view.setUint8(0, 16); // Packet ID
        view.setUint16(1, this.destroyQueue.length, true); // Nodes to be destroyed

        let offset = 3;
        for(let i = 0; i < this.destroyQueue.length; i++) {
            const node = this.destroyQueue[i];

            if(!node) {
                continue;
            }

            let killer = 0;
            if(node.getKiller()) {
                killer = node.getKiller()!.nodeId;
            }

            view.setUint32(offset, killer, true); // Killer ID
            view.setUint32(offset + 4, node.nodeId, true); // Node ID

            offset += 8;
        }

        for(let i = 0; i < this.nodes.length; i++) {
            const node = this.nodes[i];

            if(typeof node == "undefined") {
                continue;
            }
            if(this.serverVersion == 1) {
                view.setUint32(offset, node.nodeId, true);
                view.setInt32(offset + 4, node.position.x, true);
                view.setInt32(offset + 8, node.position.y, true);
                view.setUint16(offset + 12, node.getSize(), true);
                view.setUint8(offset + 14, node.color.r);
                view.setUint8(offset + 15, node.color.g);
                view.setUint8(offset + 16, node.color.b);
                view.setUint8(offset + 17, node.spiked);
                offset += 18;
            } else {
                view.setUint32(offset, node.nodeId, true);
                view.setUint16(offset + 4, node.position.x, true);
                view.setUint16(offset + 6, node.position.y, true);
                view.setUint16(offset + 8, node.getSize(), true);
                view.setUint8(offset + 10, node.color.r);
                view.setUint8(offset + 11, node.color.g);
                view.setUint8(offset + 12, node.color.b);
                view.setUint8(offset + 13, node.spiked);
                offset += 14;
            }

            const name = node.getName();
            if(name) {
                for(let j = 0; j < name.length; j++) {
                    const c = name.charCodeAt(j);
                    if(c) {
                        view.setUint16(offset, c, true);
                    }
                    offset += 2;
                }
            }

            view.setUint16(offset, 0, true); // End of string
            offset += 2;
        }

        const len = this.nonVisibleNodes.length + this.destroyQueue.length;
        view.setUint32(offset, 0, true); // End
        view.setUint32(offset + 4, len, true); // # of non-visible nodes to destroy

        offset += 8;

        // Destroy queue + nonvisible nodes
        for(let i = 0; i < this.destroyQueue.length; i++) {
            const node = this.destroyQueue[i];

            if(!node) {
                continue;
            }

            view.setUint32(offset, node.nodeId, true);
            offset += 4;
        }
        for(let i = 0; i < this.nonVisibleNodes.length; i++) {
            const node = this.nonVisibleNodes[i];

            if(!node) {
                continue;
            }

            view.setUint32(offset, node.nodeId, true);
            offset += 4;
        }

        return buf;
    }
}
