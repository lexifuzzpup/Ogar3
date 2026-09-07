import { Log } from "./log.js";
import { Vector2 } from "./vector.js";
import { QuadTree } from "./quadTree.js";
import { RenderCell } from "./RenderCell.js";
import { UText } from "./UText.js";

interface LeaderboardEntry {
    id: number;
    name: string;
}

interface ChatEntry {
    name: string;
    color: string;
    message: string;
    time: number;
}

export interface ServerEntry {
    name: string;
    address: string;
}

// The client "god object": replaces main_out.js's IIFE-closure state (~50 top-level `var`s)
// and the `wHandle.*`/implicit globals it exported, so the DOM can be wired up (see main.ts)
// without any of that state or these handlers needing to live on `window`.
export class GameClient {
    // Bare `host` used for the default same-origin connection (no servers.json configured, or
    // no entry picked yet) - kept separate from `serverAddress` below because it has no
    // explicit protocol and must be combined with `useHttps`.
    private connectionUrl: string;
    // Full "ws://"/"wss://" address picked from servers.json (see loadServerList/setserver);
    // null means "use connectionUrl + useHttps instead".
    private serverAddress: string | null = null;
    private readonly skinUrl = `${import.meta.env.BASE_URL}skins/`;

    private touchable = "createTouch" in document;
    private touches: TouchList | [] = [];
    private leftTouchID = -1;
    private leftTouchPos = new Vector2(0, 0);
    private leftTouchStartPos = new Vector2(0, 0);
    private leftVector = new Vector2(0, 0);
    private readonly useHttps = location.protocol == "https:";

    private isTyping = false;
    private spacePressed = false;
    private qPressed = false;
    private ePressed = false;
    private rPressed = false;
    private tPressed = false;
    private pPressed = false;
    private wPressed = false;
    private rMacro = false;

    private nCanvas!: HTMLCanvasElement;
    private mainCanvas: HTMLCanvasElement | null = null;
    private ctx!: CanvasRenderingContext2D;
    private lbCanvas: HTMLCanvasElement | null = null;
    private chatCanvas: HTMLCanvasElement | null = null;
    canvasWidth = 0;
    canvasHeight = 0;
    qTree: QuadTree | null = null;
    private ws: WebSocket | null = null;
    nodeX = 0;
    nodeY = 0;
    nodesOnScreen: number[] = [];
    playerCells: RenderCell[] = [];
    nodes: Record<number, RenderCell> = {};
    nodelist: RenderCell[] = [];
    Cells: RenderCell[] = [];
    leaderBoard: LeaderboardEntry[] = [];
    private chatBoard: ChatEntry[] = [];
    private rawMouseX = 0;
    private rawMouseY = 0;
    private X = -1;
    private Y = -1;
    private cb = 0;
    timestamp = 0;
    private userNickName: string | null = null;
    leftPos = 0;
    topPos = 0;
    rightPos = 1e4;
    bottomPos = 1e4;
    viewZoom = 1;
    showSkin = true;
    showName = true;
    showColor = false;
    ua = false;
    private userScore = 0;
    private showDarkTheme = false;
    showMass = false;
    private hideChat = false;
    smoothRender = 0.4;
    private posX: number;
    private posY: number;
    private posSize = 1;
    private teamScores: number[] | null = null;
    private ma = false;
    private hasOverlay = true;
    private drawLine = false;
    private lineX = 0;
    private lineY = 0;
    private drawLineX = 0;
    private drawLineY = 0;
    private readonly teamColor = ["#333333", "#FF3333", "#33FF33", "#3333FF"];
    private xa = false; // "acid" / alternate background theme
    private zoom = 1;
    private readonly isTouchStart = "ontouchstart" in window && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    private readonly splitIcon = new Image();
    private readonly ejectIcon = new Image();
    private noRanking = false;

    private delay = 500;
    private oldX = -1;
    private oldY = -1;
    z = 1;
    private scoreText: UText | null = null;
    skins: Record<string, HTMLImageElement> = {};
    knownNameDict: string[] = [];
    knownNameDict_noDisp: string[] = [];

    private favCanvas: HTMLCanvasElement | null = null;
    private favCtx: CanvasRenderingContext2D | null = null;
    private redCell: RenderCell | null = null;

    constructor() {
        this.connectionUrl = location.host;
        this.splitIcon.src = "assets/img/split.png";
        this.ejectIcon.src = "assets/img/feed.png";
        this.posX = this.nodeX = ~~((this.leftPos + this.rightPos) / 2);
        this.posY = this.nodeY = ~~((this.topPos + this.bottomPos) / 2);
    }

    // ---------------------------------------------------------------------------------------
    // Public API - replaces the original's `wHandle.*` globals used by index.html's inline
    // event handlers; now wired up from main.ts via addEventListener instead.

    setserver = (arg: string): void => {
        if(arg != this.serverAddress) {
            this.serverAddress = arg;
            this.showConnecting();
        }
    };

    setNick = (arg: string): void => {
        this.hideOverlays();
        this.userNickName = arg;
        this.sendNickName();
        this.userScore = 0;
    };

    setSkins = (arg: boolean): void => {
        this.showSkin = arg;
    };

    setNames = (arg: boolean): void => {
        this.showName = arg;
    };

    setDarkTheme = (arg: boolean): void => {
        this.showDarkTheme = arg;
    };

    setColors = (arg: boolean): void => {
        this.showColor = arg;
    };

    setShowMass = (arg: boolean): void => {
        this.showMass = arg;
    };

    setSmooth = (arg: boolean): void => {
        this.smoothRender = arg ? 2 : 0.4;
    };

    setChatHide = (arg: boolean): void => {
        this.hideChat = arg;
        const chatBox = document.getElementById("chat_textbox");
        if(chatBox) {
            chatBox.style.display = this.hideChat ? "none" : "";
        }
    };

    spectate = (): void => {
        this.userNickName = null;
        this.sendUint8(1);
        this.hideOverlays();
    };

    connect = (): void => {
        this.wsConnect();
    };

    // ---------------------------------------------------------------------------------------
    // Boot

    init(): void {
        this.gameLoop();
        this.initFavicon();
        this.loadSkinList();
    }

    private gameLoop = (): void => {
        this.ma = true;
        this.nCanvas = document.getElementById("canvas") as HTMLCanvasElement;
        this.nCanvas.focus();
        this.mainCanvas = this.nCanvas;
        this.ctx = this.mainCanvas.getContext("2d")!;

        this.mainCanvas.onmousemove = (event) => {
            this.rawMouseX = event.clientX;
            this.rawMouseY = event.clientY;
            this.mouseCoordinateChange();
        };

        if(this.touchable) {
            this.mainCanvas.addEventListener("touchstart", this.onTouchStart, false);
            this.mainCanvas.addEventListener("touchmove", this.onTouchMove, false);
            this.mainCanvas.addEventListener("touchend", this.onTouchEnd, false);
        }

        this.mainCanvas.onmouseup = () => { /* no-op, as in the original */ };
        if(/firefox/i.test(navigator.userAgent)) {
            document.addEventListener("DOMMouseScroll" as "wheel", this.handleWheel as EventListener, false);
        } else {
            document.body.addEventListener("mousewheel" as "wheel", this.handleWheel as EventListener, false);
        }

        this.mainCanvas.onfocus = () => {
            this.isTyping = false;
        };

        const chatTextbox = document.getElementById("chat_textbox") as HTMLInputElement;
        chatTextbox.onblur = () => {
            this.isTyping = false;
        };

        chatTextbox.onfocus = () => {
            this.isTyping = true;
        };

        window.onkeydown = this.onKeyDown;
        window.onkeyup = this.onKeyUp;
        window.onblur = this.onWindowBlur;

        window.onresize = this.canvasResize;
        this.canvasResize();
        if(window.requestAnimationFrame) {
            window.requestAnimationFrame(this.redrawGameScene);
        } else {
            setInterval(this.drawGameScene, 1e3 / 60);
        }
        setInterval(this.sendMouseMove, 40);

        if(this.ws == null) {
            this.showConnecting();
        }
        document.getElementById("overlays")!.style.display = "block";
    }

    private onKeyDown = (event: KeyboardEvent): void => {
        const chatTextbox = document.getElementById("chat_textbox") as HTMLInputElement;
        switch(event.keyCode) {
            case 13: // enter
                if(this.isTyping || this.hideChat) {
                    this.isTyping = false;
                    chatTextbox.blur();
                    const chattxt = chatTextbox.value;
                    if(chattxt.length > 0) {
                        this.sendChat(chattxt);
                    }
                    chatTextbox.value = "";
                } else {
                    if(!this.hasOverlay) {
                        chatTextbox.focus();
                        this.isTyping = true;
                    }
                }
                break;
            case 32: // space
                if((!this.spacePressed) && (!this.isTyping)) {
                    this.sendMouseMove();
                    this.sendUint8(17);
                    this.spacePressed = true;
                }
                break;
            case 87: // W
                if((!this.wPressed) && (!this.isTyping)) {
                    this.sendMouseMove();
                    this.sendUint8(21);
                    this.wPressed = true;
                }
                break;
            case 81: // Q
                if((!this.qPressed) && (!this.isTyping)) {
                    this.sendUint8(18);
                    this.qPressed = true;
                }
                break;
            case 69: // E
                if(!this.ePressed && (!this.isTyping)) {
                    this.sendMouseMove();
                    this.sendUint8(22);
                }
                break;
            case 82: // R
                if(!this.rPressed && (!this.isTyping)) {
                    this.sendMouseMove();
                    this.sendUint8(23);
                    if(!this.rMacro) {
                        this.rPressed = true;
                    }
                }
                break;
            case 84: // T
                if(!this.tPressed && (!this.isTyping)) {
                    this.sendMouseMove();
                    this.sendUint8(24);
                    this.tPressed = true;
                }
                break;
            case 80: // P
                if(!this.pPressed && (!this.isTyping)) {
                    this.sendMouseMove();
                    this.sendUint8(25);
                    this.pPressed = true;
                }
                break;
            case 27: // esc
                this.showOverlays(true);
                break;
            default:
                break;
        }
    };

    private onKeyUp = (event: KeyboardEvent): void => {
        switch(event.keyCode) {
            case 32: // space
                this.spacePressed = false;
                break;
            case 87: // W
                this.wPressed = false;
                break;
            case 81: // Q
                if(this.qPressed) {
                    this.sendUint8(19);
                    this.qPressed = false;
                }
                break;
            case 69:
                this.ePressed = false;
                break;
            case 82:
                this.rPressed = false;
                break;
            case 84:
                this.tPressed = false;
                break;
            case 80:
                this.pPressed = false;
                break;
            default:
                break;
        }
    };

    private onWindowBlur = (): void => {
        this.sendUint8(19);
        this.wPressed = this.spacePressed = this.qPressed = this.ePressed = this.rPressed = this.tPressed = this.pPressed = false;
    };

    private onTouchStart = (e: TouchEvent): void => {
        for(let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i]!;
            if((this.leftTouchID < 0) && (touch.clientX < this.canvasWidth / 2)) {
                this.leftTouchID = touch.identifier;
                this.leftTouchStartPos.reset(touch.clientX, touch.clientY);
                this.leftTouchPos.copyFrom(this.leftTouchStartPos);
                this.leftVector.reset(0, 0);
            }

            const size = ~~(this.canvasWidth / 7);
            if((touch.clientX > this.canvasWidth - size) && (touch.clientY > this.canvasHeight - size)) {
                this.sendMouseMove();
                this.sendUint8(17); // split
            }

            if((touch.clientX > this.canvasWidth - size) && (touch.clientY > this.canvasHeight - 2 * size - 10) && (touch.clientY < this.canvasHeight - size - 10)) {
                this.sendMouseMove();
                this.sendUint8(21); // eject
            }
        }
        this.touches = e.touches;
    };

    private onTouchMove = (e: TouchEvent): void => {
        e.preventDefault();
        for(let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i]!;
            if(this.leftTouchID == touch.identifier) {
                this.leftTouchPos.reset(touch.clientX, touch.clientY);
                this.leftVector.copyFrom(this.leftTouchPos);
                this.leftVector.minusEq(this.leftTouchStartPos);
                this.rawMouseX = this.leftVector.x * 3 + this.canvasWidth / 2;
                this.rawMouseY = this.leftVector.y * 3 + this.canvasHeight / 2;
                this.mouseCoordinateChange();
                this.sendMouseMove();
            }
        }
        this.touches = e.touches;
    };

    private onTouchEnd = (e: TouchEvent): void => {
        this.touches = e.touches;
        for(let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i]!;
            if(this.leftTouchID == touch.identifier) {
                this.leftTouchID = -1;
                this.leftVector.reset(0, 0);
                break;
            }
        }
    };

    private handleWheel = (event: WheelEvent & { wheelDelta?: number; detail?: number }): void => {
        this.zoom *= Math.pow(0.9, (event.wheelDelta ?? 0) / -120 || event.detail || 0);
        if(this.zoom < 1) {
            this.zoom = 1;
        }
        if(this.zoom > 4 / this.viewZoom) {
            this.zoom = 4 / this.viewZoom;
        }
    };

    private buildQTree(): void {
        if(this.viewZoom < 0.4) {
            this.qTree = null;
        } else {
            let a = Number.POSITIVE_INFINITY;
            let b = Number.POSITIVE_INFINITY;
            let c = Number.NEGATIVE_INFINITY;
            let d = Number.NEGATIVE_INFINITY;
            let e = 0;
            for(let i = 0; i < this.nodelist.length; i++) {
                const node = this.nodelist[i]!;
                if(node.shouldRender() && node.size * this.viewZoom > 20) {
                    e = Math.max(node.size, e);
                    a = Math.min(node.x, a);
                    b = Math.min(node.y, b);
                    c = Math.max(node.x, c);
                    d = Math.max(node.y, d);
                }
            }
            this.qTree = new QuadTree({
                minX: a - (e + 100),
                minY: b - (e + 100),
                maxX: c + (e + 100),
                maxY: d + (e + 100),
                maxChildren: 2,
                maxDepth: 4
            });
            for(let i = 0; i < this.nodelist.length; i++) {
                const node = this.nodelist[i]!;
                if(node.shouldRender() && !(node.size * this.viewZoom <= 20)) {
                    for(let a2 = 0; a2 < node.points.length; ++a2) {
                        const b2 = node.points[a2]!.x;
                        const c2 = node.points[a2]!.y;
                        if(!(b2 < this.nodeX - this.canvasWidth / 2 / this.viewZoom || c2 < this.nodeY - this.canvasHeight / 2 / this.viewZoom || b2 > this.nodeX + this.canvasWidth / 2 / this.viewZoom || c2 > this.nodeY + this.canvasHeight / 2 / this.viewZoom)) {
                            this.qTree.insert(node.points[a2]!);
                        }
                    }
                }
            }
        }
    }

    private mouseCoordinateChange(): void {
        this.X = (this.rawMouseX - this.canvasWidth / 2) / this.viewZoom + this.nodeX;
        this.Y = (this.rawMouseY - this.canvasHeight / 2) / this.viewZoom + this.nodeY;
    }

    private hideOverlays(): void {
        this.hasOverlay = false;
        document.getElementById("overlays")!.style.display = "none";
    }

    private showOverlays(fast: boolean): void {
        this.hasOverlay = true;
        this.userNickName = null;
        const el = document.getElementById("overlays")!;
        el.style.display = "block";
        el.style.opacity = "0";
        el.style.transition = `opacity ${fast ? 200 : 3000}ms`;
        requestAnimationFrame(() => { el.style.opacity = "1"; });
    }

    private showConnecting(): void {
        if(this.ma) {
            document.getElementById("connecting")!.style.display = "block";
            this.wsConnect();
        }
    }

    private wsConnect(): void {
        if(this.ws) {
            this.ws.onopen = null;
            this.ws.onmessage = null;
            this.ws.onclose = null;
            try {
                this.ws.close();
            } catch {
                // ignore
            }
            this.ws = null;
        }
        const wsUrl = this.serverAddress ?? ((this.useHttps ? "wss://" : "ws://") + this.connectionUrl);
        this.nodesOnScreen = [];
        this.playerCells = [];
        this.nodes = {};
        this.nodelist = [];
        this.Cells = [];
        this.leaderBoard = [];
        this.mainCanvas = null;
        this.teamScores = null;
        this.userScore = 0;
        Log.info("Connecting to " + wsUrl + "..");
        this.ws = new WebSocket(wsUrl);
        this.ws.binaryType = "arraybuffer";
        this.ws.onopen = this.onWsOpen;
        this.ws.onmessage = this.onWsMessage;
        this.ws.onclose = this.onWsClose;
    }

    private prepareData(a: number): DataView {
        return new DataView(new ArrayBuffer(a));
    }

    private wsSend(a: DataView): void {
        this.ws!.send(a.buffer as ArrayBuffer);
    }

    private onWsOpen = (): void => {
        this.delay = 500;
        document.getElementById("connecting")!.style.display = "none";
        let msg = this.prepareData(5);
        msg.setUint8(0, 254);
        msg.setUint32(1, 5, true); // Protocol 5
        this.wsSend(msg);
        msg = this.prepareData(5);
        msg.setUint8(0, 255);
        msg.setUint32(1, 0, true);
        this.wsSend(msg);
        this.sendNickName();
        Log.info("Connection successful!");
    };

    private onWsClose = (): void => {
        setTimeout(() => this.showConnecting(), this.delay);
        this.delay *= 1.5;
    };

    private onWsMessage = (msg: MessageEvent<ArrayBuffer>): void => {
        this.handleWsMessage(new DataView(msg.data));
    };

    private handleWsMessage(msg: DataView): void {
        let offset = 0;
        let setCustomLB = false;
        if(msg.getUint8(offset) == 240) {
            offset += 5;
        }
        switch(msg.getUint8(offset++)) {
            case 16: // update nodes
                this.updateNodes(msg, offset);
                break;
            case 17: // update position
                this.posX = msg.getFloat32(offset, true);
                offset += 4;
                this.posY = msg.getFloat32(offset, true);
                offset += 4;
                this.posSize = msg.getFloat32(offset, true);
                offset += 4;
                break;
            case 20: // clear nodes
                this.playerCells = [];
                this.nodesOnScreen = [];
                break;
            case 21: // draw line
                this.lineX = msg.getInt16(offset, true);
                offset += 2;
                this.lineY = msg.getInt16(offset, true);
                offset += 2;
                if(!this.drawLine) {
                    this.drawLine = true;
                    this.drawLineX = this.lineX;
                    this.drawLineY = this.lineY;
                }
                break;
            case 32: // add node
                this.nodesOnScreen.push(msg.getUint32(offset, true));
                offset += 4;
                break;
            case 48: // update leaderboard (custom text)
                setCustomLB = true;
                this.noRanking = true;
                break;
            case 49: { // update leaderboard (ffa)
                if(!setCustomLB) {
                    this.noRanking = false;
                }
                this.teamScores = null;
                const lbPlayerNum = msg.getUint32(offset, true);
                offset += 4;
                this.leaderBoard = [];
                for(let i = 0; i < lbPlayerNum; ++i) {
                    const nodeId = msg.getUint32(offset, true);
                    offset += 4;
                    const nameRead = this.readString(msg, offset);
                    offset = nameRead.offset;
                    this.leaderBoard.push({ id: nodeId, name: nameRead.text });
                }
                this.drawLeaderBoard();
                break;
            }
            case 50: { // update leaderboard (teams)
                this.teamScores = [];
                const lbTeamNum = msg.getUint32(offset, true);
                offset += 4;
                for(let i = 0; i < lbTeamNum; ++i) {
                    this.teamScores.push(msg.getFloat32(offset, true));
                    offset += 4;
                }
                this.drawLeaderBoard();
                break;
            }
            case 64: // set border
                this.leftPos = msg.getFloat64(offset, true);
                offset += 8;
                this.topPos = msg.getFloat64(offset, true);
                offset += 8;
                this.rightPos = msg.getFloat64(offset, true);
                offset += 8;
                this.bottomPos = msg.getFloat64(offset, true);
                offset += 8;
                this.posX = (this.rightPos + this.leftPos) / 2;
                this.posY = (this.bottomPos + this.topPos) / 2;
                this.posSize = 1;
                if(this.playerCells.length == 0) {
                    this.nodeX = this.posX;
                    this.nodeY = this.posY;
                    this.viewZoom = this.posSize;
                }
                break;
            case 99:
                this.addChat(msg, offset);
                break;
            default:
                break;
        }
    }

    private readString(view: DataView, offset: number): { text: string; offset: number } {
        let text = "";
        let char: number;
        while((char = view.getUint16(offset, true)) != 0) {
            offset += 2;
            text += String.fromCharCode(char);
        }
        offset += 2;
        return { text, offset };
    }

    private addChat(view: DataView, offset: number): void {
        const flags = view.getUint8(offset++);

        // Server/admin/mod flags (0x80/0x40/0x20) carry no extra payload today - kept for
        // protocol-compatibility, same as the original.
        void flags;

        const r = view.getUint8(offset++);
        const g = view.getUint8(offset++);
        const b = view.getUint8(offset++);
        let color = (r << 16 | g << 8 | b).toString(16);
        while(color.length < 6) {
            color = "0" + color;
        }
        color = "#" + color;

        const name = this.readString(view, offset);
        offset = name.offset;
        const message = this.readString(view, offset);

        this.chatBoard.push({
            name: name.text,
            color,
            message: message.text,
            time: Date.now()
        });
        this.drawChatBoard();
    }

    private drawChatBoard = (): void => {
        if(this.hideChat) {
            this.chatCanvas = null;
            return;
        }
        if(this.chatBoard.length < 1) {
            return;
        }
        const chatCanvas = document.createElement("canvas");
        const ctx = chatCanvas.getContext("2d")!;
        const scaleFactor = Math.min(Math.max(this.canvasWidth / 1200, 0.75), 1); // scale factor = 0.75 to 1
        chatCanvas.width = 1e3 * scaleFactor;
        chatCanvas.height = 550 * scaleFactor;
        ctx.scale(scaleFactor, scaleFactor);
        const nowtime = Date.now();
        const lasttime = this.chatBoard[this.chatBoard.length - 1]!.time;
        const deltat = nowtime - lasttime;
        ctx.globalAlpha = 0.8 * Math.exp(-deltat / 25000);

        const len = this.chatBoard.length;
        const from = Math.max(len - 15, 0);
        for(let i = 0; i < (len - from); i++) {
            const chatName = new UText(18, this.chatBoard[i + from]!.color);
            chatName.setValue(this.chatBoard[i + from]!.name);
            const width = chatName.getWidth();
            const a = chatName.render();
            ctx.drawImage(a, 15, chatCanvas.height / scaleFactor - 24 * (len - i - from));

            const chatText = new UText(18, "#666666");
            chatText.setValue(":" + this.chatBoard[i + from]!.message);
            const b = chatText.render();
            ctx.drawImage(b, 15 + width * 1.8, chatCanvas.height / scaleFactor - 24 * (len - from - i));
        }
        this.chatCanvas = chatCanvas;
    };

    private updateNodes(view: DataView, offset: number): void {
        this.timestamp = +new Date();
        const code = Math.random();
        this.ua = false;
        let queueLength = view.getUint16(offset, true);
        offset += 2;

        for(let i = 0; i < queueLength; ++i) {
            const killer = this.nodes[view.getUint32(offset, true)];
            const killedNode = this.nodes[view.getUint32(offset + 4, true)];
            offset += 8;
            if(killer && killedNode) {
                killedNode.destroy();
                killedNode.ox = killedNode.x;
                killedNode.oy = killedNode.y;
                killedNode.oSize = killedNode.size;
                killedNode.nx = killer.x;
                killedNode.ny = killer.y;
                killedNode.nSize = killedNode.size;
                killedNode.updateTime = this.timestamp;
            }
        }

        for(;;) {
            const nodeid = view.getUint32(offset, true);
            offset += 4;
            if(nodeid == 0) {
                break;
            }

            const posX = view.getInt32(offset, true);
            offset += 4;
            const posY = view.getInt32(offset, true);
            offset += 4;
            const size = view.getInt16(offset, true);
            offset += 2;

            const r = view.getUint8(offset++);
            const g = view.getUint8(offset++);
            const b = view.getUint8(offset++);
            let color = (r << 16 | g << 8 | b).toString(16);
            while(color.length < 6) {
                color = "0" + color;
            }
            const colorstr = "#" + color;
            const flags = view.getUint8(offset++);
            const flagVirus = !!(flags & 0x01);
            const flagEjected = !!(flags & 0x20);
            const flagAgitated = !!(flags & 0x10);
            let skin = "";

            if(flags & 2) {
                offset += 4;
            }

            if(flags & 4) {
                for(;;) { // skin name
                    const t = view.getUint8(offset) & 0x7f;
                    offset += 1;
                    if(t == 0) {
                        break;
                    }
                    skin += String.fromCharCode(t);
                }
            }

            let name = "";
            for(;;) { // nick name
                const char = view.getUint16(offset, true);
                offset += 2;
                if(char == 0) {
                    break;
                }
                name += String.fromCharCode(char);
            }

            let node: RenderCell;
            if(this.nodes.hasOwnProperty(nodeid)) {
                node = this.nodes[nodeid]!;
                node.updatePos();
                node.ox = node.x;
                node.oy = node.y;
                node.oSize = node.size;
                node.color = colorstr;
            } else {
                node = new RenderCell(this, nodeid, posX, posY, size, colorstr, name, skin);
                this.nodelist.push(node);
                this.nodes[nodeid] = node;
            }
            node.isVirus = flagVirus;
            node.isEjected = flagEjected;
            node.isAgitated = flagAgitated;
            node.nx = posX;
            node.ny = posY;
            node.setSize(size);
            node.updateCode = code;
            node.updateTime = this.timestamp;
            node.flag = flags;
            if(name) {
                node.setName(name);
            }
            if(this.nodesOnScreen.indexOf(nodeid) != -1 && this.playerCells.indexOf(node) == -1) {
                document.getElementById("overlays")!.style.display = "none";
                this.playerCells.push(node);
                if(this.playerCells.length == 1) {
                    this.nodeX = node.x;
                    this.nodeY = node.y;
                }
            }
        }
        queueLength = view.getUint32(offset, true);
        offset += 4;
        for(let i = 0; i < queueLength; i++) {
            const nodeId = view.getUint32(offset, true);
            offset += 4;
            const node = this.nodes[nodeId];
            if(node != null) {
                node.destroy();
            }
        }
        if(this.ua && this.playerCells.length == 0) {
            this.showOverlays(false);
        }
    }

    private sendMouseMove = (): void => {
        if(this.wsIsOpen()) {
            const dx = this.rawMouseX - this.canvasWidth / 2;
            const dy = this.rawMouseY - this.canvasHeight / 2;
            if(64 <= dx * dx + dy * dy && !(Math.abs(this.oldX - this.X) < 0.01 && Math.abs(this.oldY - this.Y) < 0.01)) {
                this.oldX = this.X;
                this.oldY = this.Y;
                const msg = this.prepareData(21);
                msg.setUint8(0, 16);
                msg.setFloat64(1, this.X, true);
                msg.setFloat64(9, this.Y, true);
                msg.setUint32(17, 0, true);
                this.wsSend(msg);
            }
        }
    };

    private sendNickName(): void {
        if(this.wsIsOpen() && this.userNickName != null) {
            const msg = this.prepareData(1 + 2 * this.userNickName.length);
            msg.setUint8(0, 0);
            for(let i = 0; i < this.userNickName.length; ++i) {
                msg.setUint16(1 + 2 * i, this.userNickName.charCodeAt(i), true);
            }
            this.wsSend(msg);
        }
    }

    private sendChat(str: string): void {
        if(this.wsIsOpen() && (str.length < 200) && (str.length > 0) && !this.hideChat) {
            const msg = this.prepareData(2 + 2 * str.length);
            let offset = 0;
            msg.setUint8(offset++, 99);
            msg.setUint8(offset++, 0); // flags (0 for now)
            for(let i = 0; i < str.length; ++i) {
                msg.setUint16(offset, str.charCodeAt(i), true);
                offset += 2;
            }
            this.wsSend(msg);
        }
    }

    private wsIsOpen(): boolean {
        return this.ws != null && this.ws.readyState == this.ws.OPEN;
    }

    private sendUint8(a: number): void {
        if(this.wsIsOpen()) {
            const msg = this.prepareData(1);
            msg.setUint8(0, a);
            this.wsSend(msg);
        }
    }

    private redrawGameScene = (): void => {
        this.drawGameScene();
        window.requestAnimationFrame(this.redrawGameScene);
    };

    private canvasResize = (): void => {
        window.scrollTo(0, 0);
        this.canvasWidth = window.innerWidth;
        this.canvasHeight = window.innerHeight;
        this.nCanvas.width = this.canvasWidth;
        this.nCanvas.height = this.canvasHeight;
        this.drawGameScene();
    };

    private viewRange(): number {
        const ratio = Math.max(this.canvasHeight / 1080, this.canvasWidth / 1920);
        return ratio * this.zoom;
    }

    private calcViewZoom(): void {
        if(this.playerCells.length != 0) {
            let newViewZoom = 0;
            for(let i = 0; i < this.playerCells.length; i++) {
                newViewZoom += this.playerCells[i]!.size;
            }
            newViewZoom = Math.pow(Math.min(64 / newViewZoom, 1), 0.4) * this.viewRange();
            this.viewZoom = (9 * this.viewZoom + newViewZoom) / 10;
        }
    }

    private drawGameScene = (): void => {
        const oldtime = Date.now();
        ++this.cb;
        this.timestamp = oldtime;
        if(this.playerCells.length > 0) {
            this.calcViewZoom();
            let a = 0, c = 0;
            for(let d = 0; d < this.playerCells.length; d++) {
                this.playerCells[d]!.updatePos();
                a += this.playerCells[d]!.x / this.playerCells.length;
                c += this.playerCells[d]!.y / this.playerCells.length;
            }
            this.posX = a;
            this.posY = c;
            this.posSize = this.viewZoom;
            this.nodeX = (this.nodeX + a) / 2;
            this.nodeY = (this.nodeY + c) / 2;
        } else {
            this.nodeX = (29 * this.nodeX + this.posX) / 30;
            this.nodeY = (29 * this.nodeY + this.posY) / 30;
            this.viewZoom = (9 * this.viewZoom + this.posSize * this.viewRange()) / 10;
        }
        this.buildQTree();
        this.mouseCoordinateChange();
        const ctx = this.ctx;
        if(this.xa) {
            if(this.showDarkTheme) {
                ctx.fillStyle = "#111111";
                ctx.globalAlpha = 0.05;
                ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
                ctx.globalAlpha = 1;
            } else {
                ctx.fillStyle = "#F2FBFF";
                ctx.globalAlpha = 0.05;
                ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
                ctx.globalAlpha = 1;
            }
        } else {
            ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
            this.drawGrid();
        }
        this.nodelist.sort((a, b) => a.size === b.size ? a.id - b.id : a.size - b.size);
        ctx.save();
        ctx.translate(this.canvasWidth / 2, this.canvasHeight / 2);
        ctx.scale(this.viewZoom, this.viewZoom);
        ctx.translate(-this.nodeX, -this.nodeY);
        for(let d = 0; d < this.Cells.length; d++) {
            this.Cells[d]!.drawOneCell(ctx);
        }

        for(let d = 0; d < this.nodelist.length; d++) {
            this.nodelist[d]!.drawOneCell(ctx);
        }
        if(this.drawLine) {
            this.drawLineX = (3 * this.drawLineX + this.lineX) / 4;
            this.drawLineY = (3 * this.drawLineY + this.lineY) / 4;
            ctx.save();
            ctx.strokeStyle = "#FFAAAA";
            ctx.lineWidth = 10;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.globalAlpha = 0.5;
            ctx.beginPath();
            for(let d = 0; d < this.playerCells.length; d++) {
                ctx.moveTo(this.playerCells[d]!.x, this.playerCells[d]!.y);
                ctx.lineTo(this.drawLineX, this.drawLineY);
            }
            ctx.stroke();
            ctx.restore();
        }
        ctx.restore();
        if(this.lbCanvas && this.lbCanvas.width) {
            ctx.drawImage(this.lbCanvas, this.canvasWidth - this.lbCanvas.width - 10, 10); // draw Leader Board
        }
        if(this.chatCanvas != null) {
            ctx.drawImage(this.chatCanvas, 0, this.canvasHeight - this.chatCanvas.height - 50);
        }

        this.userScore = Math.max(this.userScore, this.calcUserScore());
        if(this.userScore != 0) {
            if(this.scoreText == null) {
                this.scoreText = new UText(24, "#FFFFFF");
            }
            this.scoreText.setValue("Score: " + ~~(this.userScore / 100));
            const rendered = this.scoreText.render();
            const w = rendered.width;
            ctx.globalAlpha = 0.2;
            ctx.fillStyle = "#000000";
            ctx.fillRect(10, 10, w + 10, 34);
            ctx.globalAlpha = 1;
            ctx.drawImage(rendered, 15, 15);
        }
        this.drawSplitIcon(ctx);
        this.drawTouch(ctx);

        const deltatime = Date.now() - oldtime;
        if(deltatime > 1e3 / 60) {
            this.z -= 0.01;
        } else if(deltatime < 1e3 / 65) {
            this.z += 0.01;
        }
        if(this.z < 0.4) {
            this.z = 0.4;
        }
        if(this.z > 1) {
            this.z = 1;
        }
    };

    private drawTouch(ctx: CanvasRenderingContext2D): void {
        ctx.save();
        if(this.touchable) {
            for(let i = 0; i < this.touches.length; i++) {
                const touch = this.touches[i]!;
                if(touch.identifier == this.leftTouchID) {
                    ctx.beginPath();
                    ctx.strokeStyle = "#0096ff";
                    ctx.lineWidth = 6;
                    ctx.arc(this.leftTouchStartPos.x, this.leftTouchStartPos.y, 40, 0, Math.PI * 2, true);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.strokeStyle = "#0096ff";
                    ctx.lineWidth = 2;
                    ctx.arc(this.leftTouchStartPos.x, this.leftTouchStartPos.y, 60, 0, Math.PI * 2, true);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.strokeStyle = "#0096ff";
                    ctx.arc(this.leftTouchPos.x, this.leftTouchPos.y, 40, 0, Math.PI * 2, true);
                    ctx.stroke();
                } else {
                    ctx.beginPath();
                    ctx.beginPath();
                    ctx.strokeStyle = "#0096ff";
                    ctx.lineWidth = 6;
                    ctx.arc(touch.clientX, touch.clientY, 40, 0, Math.PI * 2, true);
                    ctx.stroke();
                }
            }
        }
        ctx.restore();
    }

    private drawGrid(): void {
        const ctx = this.ctx;
        ctx.fillStyle = this.showDarkTheme ? "#111111" : "#F2FBFF";
        ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
        ctx.save();
        ctx.strokeStyle = this.showDarkTheme ? "#AAAAAA" : "#000000";
        ctx.globalAlpha = 0.2;
        ctx.scale(this.viewZoom, this.viewZoom);
        const a = this.canvasWidth / this.viewZoom;
        const b = this.canvasHeight / this.viewZoom;
        // The original omitted this first beginPath(), so the horizontal grid lines' path
        // segments accumulated onto the canvas's current path across every frame forever
        // (Canvas2D's path is not part of the save/restore state) - a real, unbounded
        // performance bug rather than a deliberate effect, fixed here.
        ctx.beginPath();
        for(let c = -0.5 + (-this.nodeX + a / 2) % 50; c < a; c += 50) {
            ctx.moveTo(c, 0);
            ctx.lineTo(c, b);
        }
        ctx.stroke();
        ctx.beginPath();
        for(let c = -0.5 + (-this.nodeY + b / 2) % 50; c < b; c += 50) {
            ctx.moveTo(0, c);
            ctx.lineTo(a, c);
        }
        ctx.stroke();
        ctx.restore();
    }

    private drawSplitIcon(ctx: CanvasRenderingContext2D): void {
        if(this.isTouchStart && this.splitIcon.width) {
            const size = ~~(this.canvasWidth / 7);
            ctx.drawImage(this.splitIcon, this.canvasWidth - size, this.canvasHeight - size, size, size);
        }

        if(this.isTouchStart && this.splitIcon.width) {
            const size = ~~(this.canvasWidth / 7);
            ctx.drawImage(this.ejectIcon, this.canvasWidth - size, this.canvasHeight - 2 * size - 10, size, size);
        }
    }

    private calcUserScore(): number {
        let score = 0;
        for(let i = 0; i < this.playerCells.length; i++) {
            score += this.playerCells[i]!.nSize * this.playerCells[i]!.nSize;
        }
        return score;
    }

    private drawLeaderBoard(): void {
        this.lbCanvas = null;
        const drawTeam = this.teamScores != null;
        if(!(drawTeam || this.leaderBoard.length != 0)) {
            return;
        }
        if(!(drawTeam || this.showName)) {
            return;
        }
        const lbCanvas = document.createElement("canvas");
        const ctx = lbCanvas.getContext("2d")!;
        let boardLength = 60;
        boardLength = !drawTeam ? boardLength + 24 * this.leaderBoard.length : boardLength + 180;
        const scaleFactor = Math.min(0.22 * this.canvasHeight, Math.min(200, 0.3 * this.canvasWidth)) * 0.005;
        lbCanvas.width = 200 * scaleFactor;
        lbCanvas.height = boardLength * scaleFactor;

        ctx.scale(scaleFactor, scaleFactor);
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, 200, boardLength);

        ctx.globalAlpha = 1;
        ctx.fillStyle = "#FFFFFF";
        let title = "Leaderboard";
        ctx.font = "30px Ubuntu";
        ctx.fillText(title, 100 - ctx.measureText(title).width * 0.5, 40);
        if(!drawTeam) {
            ctx.font = "20px Ubuntu";
            for(let b = 0, l = this.leaderBoard.length; b < l; ++b) {
                let c = this.leaderBoard[b]!.name || "An unnamed cell";
                if(!this.showName) {
                    c = "An unnamed cell";
                }
                const me = this.nodesOnScreen.indexOf(this.leaderBoard[b]!.id) != -1;
                if(me && this.playerCells[0]?.name) {
                    c = this.playerCells[0].name;
                }
                ctx.fillStyle = me ? "#FFAAAA" : "#FFFFFF";
                if(!this.noRanking) {
                    c = b + 1 + ". " + c;
                }
                const start = (ctx.measureText(c).width > 200) ? 2 : 100 - ctx.measureText(c).width * 0.5;
                ctx.fillText(c, start, 70 + 24 * b);
            }
        } else {
            let c = 0;
            for(let b = 0; b < this.teamScores!.length; ++b) {
                const d = c + this.teamScores![b]! * Math.PI * 2;
                ctx.fillStyle = this.teamColor[b + 1] ?? "#333333";
                ctx.beginPath();
                ctx.moveTo(100, 140);
                ctx.arc(100, 140, 80, c, d, false);
                ctx.fill();
                c = d;
            }
        }
        this.lbCanvas = lbCanvas;
    }

    // ---------------------------------------------------------------------------------------
    // Init-time side effects (favicon rendering + skin list) - separated out of gameLoop so
    // they can run once regardless of when the canvas/game loop starts.

    private initFavicon(): void {
        this.favCanvas = document.createElement("canvas");
        this.favCanvas.width = 32;
        this.favCanvas.height = 32;
        this.favCtx = this.favCanvas.getContext("2d");
        this.redCell = new RenderCell(this, 0, 0, 0, 32, "#ED1C24", "");
        this.renderFavicon();
        setInterval(this.drawChatBoard, 1e3);
    }

    private renderFavicon(): void {
        const ctx = this.favCtx!;
        if(this.playerCells.length > 0) {
            this.redCell!.color = this.playerCells[0]!.color;
            this.redCell!.setName(this.playerCells[0]!.name ?? "");
        }
        ctx.clearRect(0, 0, 32, 32);
        ctx.save();
        ctx.translate(16, 16);
        ctx.scale(0.4, 0.4);
        this.redCell!.drawOneCell(ctx);
        ctx.restore();
        const favicon = document.getElementById("favicon") as HTMLLinkElement;
        const newFavicon = favicon.cloneNode(true) as HTMLLinkElement;
        newFavicon.setAttribute("href", this.favCanvas!.toDataURL("image/png"));
        favicon.parentNode!.replaceChild(newFavicon, favicon);
    }

    private loadSkinList(): void {
        fetch("skinList.txt").then((resp) => resp.text()).then((data) => {
            const skinNames = data.split(",").filter((name) => name.length > 0);
            for(const name of skinNames) {
                if(this.knownNameDict.indexOf(name) == -1) {
                    this.knownNameDict.push(name);
                }
            }
        }).catch(() => {
            // No skin list available - not fatal, skins simply won't resolve by name.
        });
    }

    // Server administrator-provided list of connectable servers (see servers.json). Returns
    // the parsed list so main.ts can build the server-picker dropdown; empty/missing means
    // "single-server deployment", so the caller should leave the picker hidden and the client
    // keeps connecting to its own origin.
    loadServerList(): Promise<ServerEntry[]> {
        return fetch(`${import.meta.env.BASE_URL}servers.json`)
            .then((resp) => resp.json() as Promise<unknown>)
            .then((data) => Array.isArray(data) ? data as ServerEntry[] : [])
            .catch(() => []);
    }

    get SKIN_URL(): string {
        return this.skinUrl;
    }
}
