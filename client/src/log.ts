// Developed by the CigarProject //

export class Log {
    static info(str: unknown): void {
        console.debug("[INFO]", str);
    }

    static warn(str: unknown): void {
        console.warn("[WARN]", str);
    }

    static err(str: unknown): void {
        console.error("[ERROR] ", str);
    }

    static debug(str: unknown): void {
        console.info("[DEBUG] ", str);
    }
}
