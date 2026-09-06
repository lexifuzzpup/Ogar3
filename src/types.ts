export interface Position {
    x: number;
    y: number;
}

export interface Color {
    r: number;
    g: number;
    b: number;
}

export interface ViewBox {
    topY: number;
    bottomY: number;
    leftX: number;
    rightX: number;
    width: number;
    height: number;
}

export interface GameServerConfig {
    serverMaxConnections: number;
    serverMaxConnPerIp: number;
    serverPort: number;
    serverGamemode: number;
    serverResetTime: number;
    serverName: string;
    serverAdminPass: string;
    serverBots: number;
    serverVersion: number;
    serverOldColors: number;
    serverViewBaseX: number;
    serverViewBaseY: number;
    serverStatsPort: number;
    serverStatsUpdate: number;
    serverLogLevel: number;
    gameLBlength: number;
    borderLeft: number;
    borderRight: number;
    borderTop: number;
    borderBottom: number;
    spawnInterval: number;
    foodSpawnAmount: number;
    foodStartAmount: number;
    foodMaxAmount: number;
    foodMass: number;
    foodMaxMass: number;
    virusMinAmount: number;
    virusMaxAmount: number;
    virusStartMass: number;
    virusFeedAmount: number;
    motherCellMinMass: number;
    motherCellMaxMass: number;
    ejectMass: number;
    ejectMassLoss: number;
    ejectSpeed: number;
    ejectSpawnPlayer: number;
    playerStartMass: number;
    playerMaxMass: number;
    playerSpeed: number;
    playerSplitSpeedMultiplier: number;
    playerPopsplitSpeed: number;
    playerMinMassEject: number;
    playerMinMassSplit: number;
    playerSmoothSplit: number;
    playerMaxCells: number;
    playerRecombineTime: number;
    playerMassDecayRate: number;
    playerMinMassDecay: number;
    playerMaxNickLength: number;
    playerDisconnectTime: number;
    teamsCollision: number;
    tourneyMaxPlayers: number;
    tourneyPrepTime: number;
    tourneyEndTime: number;
    tourneyTimeLimit: number;
    tourneyAutoFill: number;
    tourneyAutoFillPlayers: number;
    chatMaxMessageLength: number;
    [key: string]: number | string;
}

export interface ClientSocket {
    // Left undefined for bots (ai/FakeSocket.ts never sets it), matching the original's
    // `typeof x.remoteAddress != "undefined"` bot-detection checks.
    remoteAddress?: string;
    playerTracker: import("./PlayerTracker.js").PlayerTracker;
    packetHandler: import("./PacketHandler.js").PacketHandler;
    // true for AI-controlled players (ai/FakeSocket.ts), false for real client connections
    // (GameServer's ws wrapper) - replaces the original's `'_socket' in socket` duck-typing.
    readonly isBot: boolean;
    sendPacket(packet: Packet): void;
    close(): void;
}

export interface Packet {
    // UpdateLeaderboard's default case falls through without returning, so this stays
    // optional rather than papering over that latent (pre-existing) behavior.
    build(): ArrayBuffer | undefined;
}
