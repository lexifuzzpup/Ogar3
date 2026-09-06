import { defineConfig } from "vite";

// The game server always runs on its own port (see gameserver.ini's serverPort / the PORT
// env var), separate from Vite's dev server port - proxy WS traffic through so the client
// can connect to `location.host` (Vite's origin) as it does in production, where the same
// server serves both the built client and the WebSocket. Override with VITE_DEV_SERVER_PORT
// if the game server isn't running on the default port while developing.
const gameServerPort = process.env.VITE_DEV_SERVER_PORT || 8080;

export default defineConfig({
    root: import.meta.dirname,
    build: {
        outDir: "dist",
        emptyOutDir: true
    },
    server: {
        port: 5173,
        proxy: {
            "/ws": {
                target: `ws://localhost:${gameServerPort}`,
                ws: true
            }
        }
    }
});
