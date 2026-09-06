import type { GameServer } from "../GameServer.js";

export class Log {
    setup(_gameServer: GameServer): void {
        // Intentionally a no-op today, as in the original implementation - the file/console
        // logging setup this used to contain was disabled (commented out) upstream and is
        // not re-enabled here since that would be a behavior change beyond this port.
    }

    onConnect(_ip: string): void {
        // Nothing
    }

    onDisconnect(_ip: string): void {
        // Nothing
    }

    onCommand(_command: string): void {
        // Nothing
    }

    formatTime(): string {
        const date = new Date();

        const hour = date.getHours();
        const min = date.getMinutes();

        return (hour < 10 ? "0" : "") + hour + ":" + (min < 10 ? "0" : "") + min;
    }
}
