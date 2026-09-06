import type { GameClient } from "./GameClient.js";
import type { QuadPoint } from "./quadTree.js";
import { UText } from "./UText.js";

interface CellPoint extends QuadPoint {
    ref: RenderCell;
    size: number;
    x: number;
    y: number;
}

export class RenderCell {
    private client: GameClient;

    id = 0;
    points: CellPoint[] = [];
    pointsAcc: number[] = [];
    name: string | null = null;
    nameCache: UText | null = null;
    sizeCache: UText | null = null;
    x = 0;
    y = 0;
    size = 0;
    ox = 0;
    oy = 0;
    oSize = 0;
    nx = 0;
    ny = 0;
    nSize = 0;
    flag = 0;
    updateTime = 0;
    updateCode = 0;
    drawTime = 0;
    destroyed = false;
    isVirus = false;
    isEjected = false;
    isAgitated = false;
    wasSimpleDrawing = true;
    color: string;
    _skin?: string;

    constructor(client: GameClient, uid: number, ux: number, uy: number, usize: number, ucolor: string, uname: string, skin?: string) {
        this.client = client;
        this.id = uid;
        this.ox = this.x = ux;
        this.oy = this.y = uy;
        this.oSize = this.size = usize;
        this.color = ucolor;
        this.createPoints();
        this.setName(uname);
        this._skin = skin;
    }

    destroy(): void {
        const nodelist = this.client.nodelist;
        for(let tmp = 0, len = nodelist.length; tmp < len; tmp++) {
            if(nodelist[tmp] === this) {
                nodelist.splice(tmp, 1);
                break;
            }
        }
        delete this.client.nodes[this.id];
        let tmp = this.client.playerCells.indexOf(this);
        if(tmp != -1) {
            this.client.ua = true;
            this.client.playerCells.splice(tmp, 1);
        }
        tmp = this.client.nodesOnScreen.indexOf(this.id);
        if(tmp != -1) {
            this.client.nodesOnScreen.splice(tmp, 1);
        }
        this.destroyed = true;
        this.client.Cells.push(this);
    }

    getNameSize(): number {
        return Math.max(~~(0.3 * this.size), 24);
    }

    setName(a: string): void {
        this.name = a;
        if(this.nameCache == null) {
            this.nameCache = new UText(this.getNameSize(), "#FFFFFF", true, "#000000");
            this.nameCache.setValue(this.name);
        } else {
            this.nameCache.setSize(this.getNameSize());
            this.nameCache.setValue(this.name);
        }
    }

    setSize(a: number): void {
        this.nSize = a;
        if(this.sizeCache === null) {
            this.sizeCache = new UText(this.getNameSize() * 0.5, "#FFFFFF", true, "#000000");
        } else {
            this.sizeCache.setSize(this.getNameSize() * 0.5);
        }
    }

    createPoints(): void {
        const samplenum = this.getNumPoints();
        while(this.points.length > samplenum) {
            const rand = ~~(Math.random() * this.points.length);
            this.points.splice(rand, 1);
            this.pointsAcc.splice(rand, 1);
        }
        if(this.points.length == 0 && samplenum > 0) {
            this.points.push({
                ref: this,
                size: this.size,
                x: this.x,
                y: this.y
            });
            this.pointsAcc.push(Math.random() - 0.5);
        }
        while(this.points.length < samplenum) {
            const rand2 = ~~(Math.random() * this.points.length);
            const point = this.points[rand2]!;
            this.points.splice(rand2, 0, {
                ref: this,
                size: point.size,
                x: point.x,
                y: point.y
            });
            this.pointsAcc.splice(rand2, 0, this.pointsAcc[rand2]!);
        }
    }

    getNumPoints(): number {
        if(this.id == 0) {
            return 16;
        }
        let a = 10;
        if(this.size < 20) {
            a = 0;
        }
        if(this.isVirus) {
            a = 30;
        }
        let b = this.size;
        if(!this.isVirus) {
            b *= this.client.viewZoom;
        }
        b *= this.client.z;
        if(this.flag & 32) {
            b *= 0.25;
        }
        return ~~Math.max(b, a);
    }

    movePoints(): void {
        this.createPoints();
        const points = this.points;
        const pointsacc = this.pointsAcc;
        const numpoints = points.length;
        for(let i = 0; i < numpoints; ++i) {
            const pos1 = pointsacc[(i - 1 + numpoints) % numpoints]!;
            const pos2 = pointsacc[(i + 1) % numpoints]!;
            pointsacc[i] += (Math.random() - 0.5) * (this.isAgitated ? 3 : 1);
            pointsacc[i] *= 0.7;
            if(pointsacc[i]! > 10) {
                pointsacc[i] = 10;
            }
            if(pointsacc[i]! < -10) {
                pointsacc[i] = -10;
            }
            pointsacc[i] = (pos1 + pos2 + 8 * pointsacc[i]!) / 10;
        }
        const ref = this;
        const isvirus = this.isVirus ? 0 : (this.id / 1e3 + this.client.timestamp / 1e4) % (2 * Math.PI);
        for(let j = 0; j < numpoints; ++j) {
            let f = points[j]!.size;
            const e0 = points[(j - 1 + numpoints) % numpoints]!.size;
            const m0 = points[(j + 1) % numpoints]!.size;
            if(this.size > 15 && this.client.qTree != null && this.size * this.client.viewZoom > 20 && this.id != 0) {
                let l = false;
                const n = points[j]!.x;
                const q = points[j]!.y;
                this.client.qTree.retrieve2(n - 5, q - 5, 10, 10, (a) => {
                    if(a.ref != ref && 25 > (n - a.x) * (n - a.x) + (q - a.y) * (q - a.y)) {
                        l = true;
                    }
                });
                if((!l && points[j]!.x < this.client.leftPos) || points[j]!.y < this.client.topPos || points[j]!.x > this.client.rightPos || points[j]!.y > this.client.bottomPos) {
                    l = true;
                }
                if(l) {
                    if(pointsacc[j]! > 0) {
                        pointsacc[j] = 0;
                    }
                    pointsacc[j]! -= 1;
                }
            }
            f += pointsacc[j]!;
            if(f < 0) {
                f = 0;
            }
            f = this.isAgitated ? (19 * f + this.size) / 20 : (12 * f + this.size) / 13;
            points[j]!.size = (e0 + m0 + 8 * f) / 10;
            const angleStep = 2 * Math.PI / numpoints;
            let m = this.points[j]!.size;
            if(this.isVirus && j % 2 == 0) {
                m += 5;
            }
            points[j]!.x = this.x + Math.cos(angleStep * j + isvirus) * m;
            points[j]!.y = this.y + Math.sin(angleStep * j + isvirus) * m;
        }
    }

    updatePos(): number {
        if(this.id == 0) {
            return 1;
        }
        let a = (this.client.timestamp - this.updateTime) / 120;
        a = a < 0 ? 0 : a > 1 ? 1 : a;
        const b = a < 0 ? 0 : a > 1 ? 1 : a;
        this.getNameSize();
        if(this.destroyed && b >= 1) {
            const c = this.client.Cells.indexOf(this);
            if(c != -1) {
                this.client.Cells.splice(c, 1);
            }
        }
        this.x = a * (this.nx - this.ox) + this.ox;
        this.y = a * (this.ny - this.oy) + this.oy;
        this.size = b * (this.nSize - this.oSize) + this.oSize;
        return b;
    }

    shouldRender(): boolean {
        if(this.id == 0) {
            return true;
        } else {
            const client = this.client;
            return !(this.x + this.size + 40 < client.nodeX - client.canvasWidth / 2 / client.viewZoom
                || this.y + this.size + 40 < client.nodeY - client.canvasHeight / 2 / client.viewZoom
                || this.x - this.size - 40 > client.nodeX + client.canvasWidth / 2 / client.viewZoom
                || this.y - this.size - 40 > client.nodeY + client.canvasHeight / 2 / client.viewZoom);
        }
    }

    getStrokeColor(): string {
        let r = (~~(parseInt(this.color.substr(1, 2), 16) * 0.9)).toString(16);
        let g = (~~(parseInt(this.color.substr(3, 2), 16) * 0.9)).toString(16);
        let b = (~~(parseInt(this.color.substr(5, 2), 16) * 0.9)).toString(16);
        if(r.length == 1) {
            r = "0" + r;
        }
        if(g.length == 1) {
            g = "0" + g;
        }
        if(b.length == 1) {
            b = "0" + b;
        }
        return "#" + r + g + b;
    }

    drawOneCell(ctx: CanvasRenderingContext2D): void {
        if(!this.shouldRender()) {
            return;
        }
        const client = this.client;
        let simple = (this.id != 0 && !this.isVirus && !this.isAgitated && client.smoothRender > client.viewZoom);
        if(this.getNumPoints() < 10) {
            simple = true;
        }
        if(this.wasSimpleDrawing && !simple) {
            for(let c = 0; c < this.points.length; c++) {
                this.points[c]!.size = this.size;
            }
        }
        let bigPointSize = this.size;
        if(!this.wasSimpleDrawing) {
            for(let c = 0; c < this.points.length; c++) {
                bigPointSize = Math.max(this.points[c]!.size, bigPointSize);
            }
        }
        this.wasSimpleDrawing = simple;
        ctx.save();
        this.drawTime = client.timestamp;
        let c = this.updatePos();
        if(this.destroyed) {
            ctx.globalAlpha *= 1 - c;
        }
        ctx.lineWidth = 10;
        ctx.lineCap = "round";
        ctx.lineJoin = this.isVirus ? "miter" : "round";
        if(client.showColor) {
            ctx.fillStyle = "#FFFFFF";
            ctx.strokeStyle = "#AAAAAA";
        } else {
            ctx.fillStyle = this.color;
            if(simple) {
                ctx.strokeStyle = this.getStrokeColor();
            } else {
                ctx.strokeStyle = this.color;
            }
        }
        ctx.beginPath();
        if(simple) {
            const lw = this.size * 0.03;
            ctx.lineWidth = lw;
            ctx.arc(this.x, this.y, this.size - lw * 0.5 + 5, 0, 2 * Math.PI, false);
        } else {
            this.movePoints();
            ctx.beginPath();
            const d = this.getNumPoints();
            ctx.moveTo(this.points[0]!.x, this.points[0]!.y);
            for(c = 1; c <= d; ++c) {
                const e = c % d;
                ctx.lineTo(this.points[e]!.x, this.points[e]!.y); // Draw circle of cell
            }
        }
        ctx.closePath();
        let skinName = (this.name ?? "").toLowerCase();

        // Load Premium skin if we have one set
        if(typeof this._skin != "undefined" && this._skin != "") {
            if(this._skin[0] == "%") {
                skinName = this._skin.substring(1);
            }
        }

        let skinImg: HTMLImageElement | null;
        if((client.showSkin && skinName) || (skinName.startsWith("i/") && client.knownNameDict.indexOf(skinName) != -1)) {
            if(!client.skins.hasOwnProperty(skinName)) {
                client.skins[skinName] = new Image();
                client.skins[skinName]!.src = client.SKIN_URL + skinName + ".png";
            } else if(skinName.startsWith("i/")) {
                client.skins[skinName] = new Image();
                client.skins[skinName]!.src = "https://i.imgur.com/" + (this.name ?? "").split("i/")[1] + ".png";
            }
            if(client.skins[skinName]!.width != 0 && client.skins[skinName]!.complete) {
                skinImg = client.skins[skinName]!;
            } else {
                skinImg = null;
            }
        } else {
            skinImg = null;
        }
        if(!simple) {
            ctx.stroke();
        }
        ctx.fill(); // Draw cell content
        if(skinImg) {
            ctx.save();
            ctx.clip();
            // Draw skin
            ctx.drawImage(skinImg, this.x - bigPointSize, this.y - bigPointSize, 2 * bigPointSize, 2 * bigPointSize);
            ctx.restore();
        }
        if((client.showColor || this.size > 15) && !simple) {
            ctx.strokeStyle = "#000000";
            ctx.globalAlpha *= 0.1;
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
        const isOwnCell = client.playerCells.indexOf(this) != -1;
        // draw name
        if(this.id != 0) {
            const x = ~~this.x;
            const y = ~~this.y;
            const nz = this.getNameSize();
            const ratio = Math.ceil(10 * client.viewZoom) * 0.1;
            const ratD = 1 / ratio;
            if((client.showName || isOwnCell) && this.name && this.nameCache && (client.knownNameDict_noDisp.indexOf(skinName) == -1)) {
                const ncache = this.nameCache;
                ncache.setValue(this.name);
                ncache.setSize(nz);
                ncache.setScale(ratio);
                const rnchache = ncache.render();
                const m = ~~(rnchache.width * ratD);
                const h = ~~(rnchache.height * ratD);
                ctx.drawImage(rnchache, x - ~~(m * 0.5), y - ~~(h * 0.5), m, h);
            }

            // draw mass
            if(client.showMass && (isOwnCell || (client.playerCells.length == 0 && (!this.isVirus || this.isAgitated) && this.size > 20))) {
                const massVal = ~~(this.size * this.size * 0.01);
                const sizeCache = this.sizeCache!;
                sizeCache.setValue(massVal);
                sizeCache.setScale(ratio);
                const e = sizeCache.render();
                const m = ~~(e.width * ratD);
                const h = ~~(e.height * ratD);
                const g = this.name ? y + ~~(h * 0.7) : y - ~~(h * 0.5);
                ctx.drawImage(e, x - ~~(m * 0.5), g, m, h);
            }
        }
        ctx.restore();
    }
}
