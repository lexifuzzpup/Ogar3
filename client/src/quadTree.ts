export interface QuadPoint {
    x: number;
    y: number;
    ref?: unknown;
    size?: number;
}

interface QuadRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

class QuadTreeNode {
    x: number;
    y: number;
    w: number;
    h: number;
    depth: number;
    items: QuadPoint[] = [];
    nodes: QuadTreeNode[] = [];
    private maxChildren: number;
    private maxDepth: number;

    constructor(x: number, y: number, w: number, h: number, depth: number, maxChildren: number, maxDepth: number) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.depth = depth;
        this.maxChildren = maxChildren;
        this.maxDepth = maxDepth;
    }

    exists(selector: QuadRect): boolean {
        for(let i = 0; i < this.items.length; ++i) {
            const item = this.items[i]!;
            if(item.x >= selector.x && item.y >= selector.y && item.x < selector.x + selector.w && item.y < selector.y + selector.h) {
                return true;
            }
        }
        if(this.nodes.length != 0) {
            return this.findOverlappingNodes(selector, (dir) => this.nodes[dir]!.exists(selector));
        }
        return false;
    }

    retrieve(item: QuadRect, callback: (item: QuadPoint) => void): void {
        for(let i = 0; i < this.items.length; ++i) {
            callback(this.items[i]!);
        }
        if(this.nodes.length != 0) {
            this.findOverlappingNodes(item, (dir) => {
                this.nodes[dir]!.retrieve(item, callback);
            });
        }
    }

    insert(a: QuadPoint): void {
        if(this.nodes.length != 0) {
            this.nodes[this.findInsertNode(a)]!.insert(a);
        } else {
            if(this.items.length >= this.maxChildren && this.depth < this.maxDepth) {
                this.devide();
                this.nodes[this.findInsertNode(a)]!.insert(a);
            } else {
                this.items.push(a);
            }
        }
    }

    findInsertNode(a: QuadPoint): number {
        return a.x < this.x + this.w / 2 ? (a.y < this.y + this.h / 2 ? 0 : 2) : (a.y < this.y + this.h / 2 ? 1 : 3);
    }

    findOverlappingNodes(a: QuadRect, b: (dir: number) => unknown): boolean {
        return (a.x < this.x + this.w / 2 && ((a.y < this.y + this.h / 2 && b(0)) || (a.y >= this.y + this.h / 2 && b(2))))
            || (a.x >= this.x + this.w / 2 && ((a.y < this.y + this.h / 2 && b(1)) || (a.y >= this.y + this.h / 2 && b(3))))
            ? true : false;
    }

    devide(): void {
        const nextDepth = this.depth + 1;
        const w = this.w / 2;
        const h = this.h / 2;
        this.nodes.push(new QuadTreeNode(this.x, this.y, w, h, nextDepth, this.maxChildren, this.maxDepth));
        this.nodes.push(new QuadTreeNode(this.x + w, this.y, w, h, nextDepth, this.maxChildren, this.maxDepth));
        this.nodes.push(new QuadTreeNode(this.x, this.y + h, w, h, nextDepth, this.maxChildren, this.maxDepth));
        this.nodes.push(new QuadTreeNode(this.x + w, this.y + h, w, h, nextDepth, this.maxChildren, this.maxDepth));
        const oldItems = this.items;
        this.items = [];
        for(let c = 0; c < oldItems.length; c++) {
            this.insert(oldItems[c]!);
        }
    }

    clear(): void {
        for(let a = 0; a < this.nodes.length; a++) {
            this.nodes[a]!.clear();
        }
        this.items.length = 0;
        this.nodes.length = 0;
    }
}

export interface QuadTreeArgs {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    maxChildren?: number;
    maxDepth?: number;
}

export class QuadTree {
    root: QuadTreeNode;
    private internalSelector: QuadRect = { x: 0, y: 0, w: 0, h: 0 };

    constructor(args: QuadTreeArgs) {
        const maxChildren = args.maxChildren || 2;
        const maxDepth = args.maxDepth || 4;
        this.root = new QuadTreeNode(args.minX, args.minY, args.maxX - args.minX, args.maxY - args.minY, 0, maxChildren, maxDepth);
    }

    insert(a: QuadPoint): void {
        this.root.insert(a);
    }

    retrieve(a: QuadRect, b: (item: QuadPoint) => void): void {
        this.root.retrieve(a, b);
    }

    retrieve2(a: number, b: number, c: number, d: number, callback: (item: QuadPoint) => void): void {
        this.internalSelector.x = a;
        this.internalSelector.y = b;
        this.internalSelector.w = c;
        this.internalSelector.h = d;
        this.root.retrieve(this.internalSelector, callback);
    }

    exists(a: QuadRect): boolean {
        return this.root.exists(a);
    }

    clear(): void {
        this.root.clear();
    }
}
