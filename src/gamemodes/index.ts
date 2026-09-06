import { Mode } from "./Mode.js";
import { FFA } from "./FFA.js";
import { Teams } from "./Teams.js";
import { Experimental } from "./Experimental.js";
import { Tournament } from "./Tournament.js";
import { HungerGames } from "./HungerGames.js";
import { Rainbow } from "./Rainbow.js";
import { Zombie } from "./Zombie.js";
import { TeamZ } from "./TeamZ.js";
import { TeamX } from "./TeamX.js";
import { Blackhole } from "./Blackhole.js";

export { Mode, FFA, Teams, Experimental, Tournament, HungerGames, Rainbow, Zombie, TeamZ, TeamX, Blackhole };

export function get(id: number): Mode {
    let mode: Mode;
    switch(id) {
        case 1: // Teams
            mode = new Teams();
            break;
        case 2: // Experimental
            mode = new Experimental();
            break;
        case 10: // Tournament
            mode = new Tournament();
            break;
        case 11: // Hunger Games
            mode = new HungerGames();
            break;
        case 12: // Zombie
            mode = new Zombie();
            break;
        case 13: // Zombie Team
            mode = new TeamZ();
            break;
        case 14: // Experimental Team
            mode = new TeamX();
            break;
        case 20: // Rainbow
            mode = new Rainbow();
            break;
        case 22: // Blackhole
            mode = new Blackhole();
            break;
        default: // FFA is default
            mode = new FFA();
            break;
    }
    return mode;
}
