export class UText {
    private _value: string | number = "";
    private _color: string;
    private _stroke: boolean;
    private _strokeColor: string;
    private _size: number;
    private _canvas: HTMLCanvasElement | null = null;
    private _ctx: CanvasRenderingContext2D | null = null;
    private _dirty = false;
    private _scale = 1;

    constructor(size?: number, color?: string, stroke?: boolean, strokeColor?: string) {
        this._size = size || 16;
        this._color = color || "#000000";
        this._stroke = !!stroke;
        this._strokeColor = strokeColor || "#000000";
    }

    setSize(a: number): void {
        if(this._size != a) {
            this._size = a;
            this._dirty = true;
        }
    }

    setScale(a: number): void {
        if(this._scale != a) {
            this._scale = a;
            this._dirty = true;
        }
    }

    setStrokeColor(a: string): void {
        if(this._strokeColor != a) {
            this._strokeColor = a;
            this._dirty = true;
        }
    }

    setValue(a: string | number): void {
        if(a != this._value) {
            this._value = a;
            this._dirty = true;
        }
    }

    render(): HTMLCanvasElement {
        if(this._canvas == null) {
            this._canvas = document.createElement("canvas");
            this._ctx = this._canvas.getContext("2d");
        }
        if(this._dirty) {
            this._dirty = false;
            const canvas = this._canvas;
            const ctx = this._ctx!;
            const value = String(this._value);
            const scale = this._scale;
            const fontsize = this._size;
            const font = fontsize + "px Ubuntu";
            ctx.font = font;
            const h = ~~(0.2 * fontsize);
            const wd = fontsize * 0.1;
            const h2 = h * 0.5;
            canvas.width = ctx.measureText(value).width * scale + 3;
            canvas.height = (fontsize + h) * scale;
            ctx.font = font;
            ctx.globalAlpha = 1;
            ctx.lineWidth = wd;
            ctx.strokeStyle = this._strokeColor;
            ctx.fillStyle = this._color;
            ctx.scale(scale, scale);
            if(this._stroke) {
                ctx.strokeText(value, 0, fontsize - h2);
            }
            ctx.fillText(value, 0, fontsize - h2);
        }
        return this._canvas;
    }

    getWidth(): number {
        // Uses this instance's own context (the original measured against the *outer* game
        // canvas's context due to a variable-shadowing accident in main_out.js, which made the
        // width depend on whatever font that canvas last had set - an unintended quirk, not
        // fixed-as-is here since it has no real fidelity value to preserve).
        if(this._ctx == null) {
            this.render();
        }
        return this._ctx!.measureText(String(this._value)).width + 6;
    }
}
