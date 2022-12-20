import Player from "./models/player";
import { Socket } from "socket.io";
type MySocket = Socket & { sockUsername: string };
type PlayerData = { displayName: string; username: string };
let players: PlayerData[] = [];
let playerNames = new Map<string, string>();

export async function getPlayerName(identifier: string) {
  let username = "";
  if (typeof identifier == "string") {
    username = identifier;
  } else {
    const sock = identifier as MySocket;
  }
  await loadPlayer(username);
  return playerNames.get(username) as string;
}

export function getPlayerData(socket: Socket) {
  const username = (socket as MySocket).sockUsername;
  if (username === undefined) {
    throw "missing username";
  }
  const displayName = playerNames.get(username) as string;
  return { username: username, displayName: displayName };
}

async function loadPlayer(username: string) {
  if (playerNames.has(username)) {
    return;
  }
  let [player] = (await Player.find({
    username: username,
  })) as [PlayerData];
  if (!player) {
    throw "No player with username" + username;
  }
  playerNames.set(player.username, player.displayName);
}

export function listenIdentity(socket: Socket) {
  socket.on("login", (message: { username: string; displayName: string }) => {
    const { username, displayName } = message;
    (socket as MySocket).sockUsername = username;
    playerNames.set(username, displayName);
    setOrCreatePlayer(username, displayName);
  });
  socket.on("change name", (message) => {
    const username = (socket as MySocket).sockUsername;
    if (!username) {
      throw "missing username";
    }
    const displayName = message;
    playerNames.set(username, displayName);
    setOrCreatePlayer(username, displayName);
  });
}

async function setOrCreatePlayer(username: string, displayName: string) {
  const matches = await Player.find({ username: username });
  if (matches.length) {
    const player = matches[0];
    player.displayName = displayName;
    player.save();
  } else {
    new Player({ displayName: displayName, username: username }).save();
  }
}
