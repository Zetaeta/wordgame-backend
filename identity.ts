import Player from "./models/player";
import { Socket } from "socket.io";
// type MySocket = Socket & { sockUsername: string };
type PlayerData = { displayName: string; username: string };
let players: PlayerData[] = [];
let playerNames = new Map<string, string>();

export async function getPlayerName(username: string) {
  try {
    await loadPlayer(username);
  } catch (e) {
    console.error(e);
    return "Error";
  }
  return playerNames.get(username) as string;
}

export function getPlayerData(socket: Socket) {
  const username = socket.data.username;
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
  console.log("Loaded player");
  console.log(player);
  playerNames.set(player.username, player.displayName);
}

export function listenIdentity(socket: Socket) {
  const auth = socket.handshake.auth;
  if (auth.username) {
    socket.data.username = auth.username;
    if (auth.displayname) {
      playerNames.set(auth.username, auth.displayname);
      setOrCreatePlayer(auth.username, auth.displayName);
    }
  }
  socket.on("login", (message: { username: string; displayName: string }) => {
    const { username, displayName } = message;
    socket.data.username = username;
    playerNames.set(username, displayName);
    setOrCreatePlayer(username, displayName);
  });
  socket.on("change name", (message) => {
    const username = socket.data.username;
    if (!username) {
      throw "missing username";
    }
    const displayName = message.displayName;
    if (!displayName) {
      console.error("missing displayName");
      return;
    }
    playerNames.set(username, displayName);
    setOrCreatePlayer(username, displayName);
  });
}

async function setOrCreatePlayer(username: string, displayName: string) {
  console.log("socp " + username + " " + displayName);
  const matches = await Player.find({ username: username });
  if (matches.length) {
    const player = matches[0];
    player.displayName = displayName;
    player.save().then((p) => {
      console.log("saved player");
      console.log(p);
    });
  } else {
    new Player({ displayName: displayName, username: username })
      .save()
      .then((p) => {
        console.log("saved player");
        console.log(p);
      });
  }
}
