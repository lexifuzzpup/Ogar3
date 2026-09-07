import { GameClient } from "./GameClient.js";

const client = new GameClient();

const serverPicker = document.getElementById("server-picker")!;
const serverSelect = document.getElementById("server-select") as HTMLSelectElement;

// Populate the server picker from servers.json, the server administrator's list of
// connectable servers (see README) - a missing file or an empty list means a single-server
// deployment, so the picker stays hidden and the client keeps connecting to its own origin.
client.loadServerList().then((servers) => {
    if(servers.length === 0) {
        return;
    }
    for(const server of servers) {
        const option = document.createElement("option");
        option.value = server.address;
        option.textContent = server.name;
        serverSelect.appendChild(option);
    }
    serverSelect.addEventListener("change", () => {
        client.setserver(serverSelect.value);
    });
    client.setserver(serverSelect.value);
    serverPicker.style.display = "block";
});

const nickInput = document.getElementById("nick") as HTMLInputElement;
const playBtn = document.getElementById("play-btn")!;
const settingsBtn = document.getElementById("settings-btn")!;
const spectateBtn = document.getElementById("spectate-btn")!;
const settingsPanel = document.getElementById("settings")!;
const instructionsPanel = document.getElementById("instructions")!;

playBtn.addEventListener("click", (e) => {
    e.preventDefault();
    client.setNick(nickInput.value);
});

settingsBtn.addEventListener("click", (e) => {
    e.preventDefault();
    const showing = settingsPanel.style.display !== "none";
    settingsPanel.style.display = showing ? "none" : "";
    instructionsPanel.style.display = showing ? "none" : "";
});

spectateBtn.addEventListener("click", (e) => {
    e.preventDefault();
    client.spectate();
});

// Settings checkboxes (data-box-id 1-7) + the nick field (data-box-id 0) - replaces the
// inline onchange="setX(...)" HTML attributes, which needed the wHandle.* globals this port
// removes.
const checkboxSetters: Record<string, (checked: boolean) => void> = {
    "1": (v) => client.setSkins(!v), // "No skins"
    "2": (v) => client.setNames(!v), // "No names"
    "3": (v) => client.setDarkTheme(v),
    "4": (v) => client.setColors(v), // "No colors"
    "5": (v) => client.setShowMass(v),
    "6": (v) => client.setSmooth(v),
    "7": (v) => client.setChatHide(v)
};

function onSaveChange(el: HTMLInputElement): void {
    const boxId = el.dataset.boxId;
    if(boxId === undefined) {
        return;
    }
    if(boxId !== "0") {
        checkboxSetters[boxId]?.(el.checked);
    }
    const value = boxId === "0" ? el.value : String(el.checked);
    try {
        window.localStorage?.setItem("checkbox-" + boxId, value);
    } catch {
        // Storage may be unavailable (private browsing, disabled cookies, etc.)
    }
}

const saveElements = document.querySelectorAll<HTMLInputElement>(".save");
for(const el of saveElements) {
    el.addEventListener("change", () => onSaveChange(el));
}

if(window.localStorage) {
    window.addEventListener("load", () => {
        for(const el of saveElements) {
            const boxId = el.dataset.boxId;
            const stored = window.localStorage.getItem("checkbox-" + boxId);
            if(stored && stored === "true" && boxId !== "0") {
                el.checked = true;
                onSaveChange(el);
            } else if(boxId === "0" && stored != null) {
                el.value = stored;
            }
        }
    });

    if(window.localStorage.getItem("AB8") == null) {
        window.localStorage.setItem("AB8", String(~~(100 * Math.random())));
    }
}

client.init();
