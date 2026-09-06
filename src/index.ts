import { createInterface } from "node:readline";
import { CommandList } from "./modules/CommandList.js";
import { GameServer } from "./GameServer.js";

// Init variables
let showConsole = true;

// Start msg
console.log("[Game] Ogar3 - An open source Agar.io server implementation based on ogar!");

// Handle arguments
for(const val of process.argv) {
    if(val == "--noconsole") {
        showConsole = false;
    } else if(val == "--help") {
        console.log("Proper Usage: node index.js");
        console.log("    --noconsole         Disables the console");
        console.log("    --help              Help menu.");
        console.log("");
    }
}

// Run Ogar
const gameServer = new GameServer();
export { gameServer };
gameServer.start();
// Add command handler
gameServer.commands = CommandList.list;

function parseCommands(str: string): void {
    // Log the string
    gameServer.log.onCommand(str);

    // Don't process ENTER
    if(str === "") {
        return;
    }

    // Splits the string
    const split = str.split(" ");

    // Process the first string value
    const first = split[0]!.toLowerCase();

    // Get command function
    const execute = gameServer.commands[first];
    if(typeof execute != "undefined") {
        execute(gameServer, split);
    } else {
        console.log("[Console] Invalid Command!");
    }
}

// Initialize the server console
if(showConsole) {
    const in_ = createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const prompt = (): void => {
        in_.question(">", (str) => {
            parseCommands(str);
            prompt(); // Too lazy to learn async
        });
    };

    setTimeout(prompt, 100);
}
