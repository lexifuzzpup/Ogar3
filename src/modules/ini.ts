import { platform } from "node:os";

type IniValue = string | number | boolean | IniObject | IniValue[];
interface IniObject {
    [key: string]: IniValue;
}
interface EncodeOptions {
    section?: string;
    whitespace?: boolean;
}

const EOL = platform() === "win32" ? "\r\n" : "\n";

export class Ini {
    static parse(str: string): IniObject {
        return Ini.decode(str);
    }

    static stringify(obj: IniObject, opt?: EncodeOptions | string): string {
        return Ini.encode(obj, opt);
    }

    static encode(obj: IniObject, opt?: EncodeOptions | string): string {
        const children: string[] = [];
        let out = "";

        let options: EncodeOptions;
        if(typeof opt === "string") {
            options = { section: opt, whitespace: false };
        } else {
            options = opt ?? {};
            options.whitespace = options.whitespace === true;
        }

        const separator = " = ";

        for(const k in obj) {
            const val = obj[k];
            if(val && Array.isArray(val)) {
                for(const item of val) {
                    out += Ini.safe(k + "[]") + separator + Ini.safe(item) + "\n";
                }
            } else if(val && typeof val === "object") {
                children.push(k);
            } else {
                out += Ini.safe(k) + separator + Ini.safe(val) + EOL;
            }
        }

        if(options.section && out.length) {
            out = "[" + Ini.safe(options.section) + "]" + EOL + out;
        }

        for(const k of children) {
            const nk = Ini.dotSplit(k).join("\\.");
            const section = (options.section ? options.section + "." : "") + nk;
            const child = Ini.encode(obj[k] as IniObject, { section, whitespace: options.whitespace });
            if(out.length && child.length) {
                out += EOL;
            }
            out += child;
        }

        return out;
    }

    private static dotSplit(str: string): string[] {
        const soh = "\u0001";
        const stx = "\u0002";
        return str.replace(new RegExp(soh, "g"), stx + "LITERAL\\1LITERAL" + stx)
            .replace(/\\\./g, soh)
            .split(/\./)
            .map((part) => part.replace(new RegExp(soh, "g"), "\\.")
                .replace(new RegExp(stx + "LITERAL\\\\1LITERAL" + stx, "g"), soh));
    }

    static decode(str: string): IniObject {
        let out: IniObject = {};
        let p = out;
        // section     |key = value
        const re = /^\[([^\]]*)\]$|^([^=]+)(=(.*))?$/i;
        const lines = str.split(/[\r\n]+/g);
        let section: string | null = null;

        for(const line of lines) {
            if(!line || line.match(/^\s*[;#]/)) {
                continue;
            }

            const match = line.match(re);

            if(!match) {
                continue;
            }

            if(match[1] !== undefined) {
                section = Ini.unsafe(match[1]) as string;
                p = (out[section] as IniObject) = (out[section] as IniObject) || {};
                continue;
            }

            let key = Ini.unsafe(match[2]!) as string;
            const value: IniValue = match[3] ? Ini.unsafe(match[4] || "") : true;

            // Convert keys with '[]' suffix to an array
            if(key.length > 2 && key.slice(-2) === "[]") {
                key = key.substring(0, key.length - 2);
                if(!p[key]) {
                    p[key] = [];
                } else if(!Array.isArray(p[key])) {
                    p[key] = [p[key] as IniValue];
                }
            }

            // safeguard against resetting a previously defined
            // array by accidentally forgetting the brackets
            if(isNaN(Number(value))) {
                p[key] = value;
            } else {
                p[key] = parseFloat(value as string);
            }
        }

        // {a:{y:1},"a.b":{x:2}} --> {a:{y:1,b:{x:2}}}
        // use a filter to return the keys that have to be deleted.
        const toDelete: string[] = [];
        for(const k in out) {
            const v = out[k];
            if(!v || typeof v !== "object" || Array.isArray(v)) {
                continue;
            }
            // see if the parent section is also an object.
            // if so, add it to that, and mark this one for deletion
            const parts = Ini.dotSplit(k);
            let pp = out;
            const l = parts.pop()!;
            const nl = l.replace(/\\\./g, ".");
            for(const part of parts) {
                if(!pp[part] || typeof pp[part] !== "object") {
                    pp[part] = {};
                }
                pp = pp[part] as IniObject;
            }
            if(pp === out && nl === l) {
                continue;
            }
            pp[nl] = v;
            toDelete.push(k);
        }
        for(const del of toDelete) {
            delete out[del];
        }

        return out;
    }

    private static isQuoted(val: string): boolean {
        return (val.charAt(0) === "\"" && val.slice(-1) === "\"")
            || (val.charAt(0) === "'" && val.slice(-1) === "'");
    }

    static safe(val: IniValue): string {
        return (typeof val !== "string"
            || !!val.match(/[=\r\n]/)
            || !!val.match(/^\[/)
            || (val.length > 1 && Ini.isQuoted(val))
            || val !== val.trim())
            ? JSON.stringify(val)
            : val.replace(/;/g, "\\;").replace(/#/g, "\\#");
    }

    static unsafe(val: string): IniValue {
        val = (val || "").trim();
        if(Ini.isQuoted(val)) {
            // remove the single quotes before calling JSON.parse
            if(val.charAt(0) === "'") {
                val = val.slice(1, val.length - 1);
            }
            try {
                return JSON.parse(val);
            } catch {
                return val;
            }
        }

        // walk the val to find the first not-escaped ; character
        let esc = false;
        let unesc = "";
        for(let i = 0, l = val.length; i < l; i++) {
            const c = val.charAt(i);
            if(esc) {
                if("\\;#".indexOf(c) !== -1) {
                    unesc += c;
                } else {
                    unesc += "\\" + c;
                }
                esc = false;
            } else if(";#".indexOf(c) !== -1) {
                break;
            } else if(c === "\\") {
                esc = true;
            } else {
                unesc += c;
            }
        }
        if(esc) {
            unesc += "\\";
        }
        return unesc;
    }
}
