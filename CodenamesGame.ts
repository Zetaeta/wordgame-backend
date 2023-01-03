import Model from "./models/codenames";
import { io } from "./index";
import WordSource from "./WordSource";
import { Server, Socket } from "socket.io";
import { getPlayerName, getPlayerData } from "./identity";
import { shuffle } from "./utils";
// const io = new Server(3002);

class CodeNamesGame {
  name: string;
  id: string;
  players: Player[];
  words: string[];
  boardColors: Color[];
  start: Team;
  key: Color[];

  constructor(data: any) {
    this.name = data.name;
    this.id = data._id;
    this.players = data.players.map((p: any) => {
      return { name: p.name, team: p.team };
    });
    this.boardColors = data.colors;
    this.key = data.key;
    this.words = data.words;
    this.start = data.start;
  }

  // returns list of events to listen for
  joinPlayer(
    socket: Socket,
    data: any,
    send: (messageType: string, message: any) => void
  ) {
    try {
      const { username, displayName } = getPlayerData(socket);
      if (!this.hasPlayer(username)) {
        this.players.push({
          send: send,
          username: username,
          team: Red,
          spymaster: false,
        });
      }
    } catch (e) {
      console.log("Error joining player");
      console.log(e);
    }

    this.sendPlayerInfo();
  }

  hasPlayer(username: string) {
    return (
      this.players.filter((player) => player.username === username).length > 0
    );
  }

  sendPlayerInfo() {
    this.playerInfo().then((info) => {
      this.broadcast("player data", info);
    });
  }

  async playerInfo() {
    return Promise.all(
      this.players.map(async (player) => {
        const displayName = await getPlayerName(player.username);
        return {
          name: displayName,
          spymaster: player.spymaster,
          team: player.team,
        };
      })
    );
  }

  broadcast(messageType: string, data: any) {
    io.to("cn-" + this.id).emit(messageType, data);
    return;
    // for (let { send } of this.players) {
    //   if (send) {
    //     send(messageType, data);
    //   }
    // }
  }

  handleMessage(socket: Socket, message: any) {
    console.log(message.msgType);
    if (message.msgType === "set color") {
      this.setColors(message.changes);
    } else if (message.msgType == "spymaster") {
      socket.join("spymaster-" + this.id);
      socket.emit("send key", this.key);
      const { username } = getPlayerData(socket);
      this.modifyPlayer(username, (player) => {
        return { ...player, spymaster: true };
      });
      this.sendPlayerInfo();
    } else if (message.msgType == "shuffle teams") {
      console.log("shoveling teams");
      this.shufflePlayers();
    } else if (message.msgType == "reveal color") {
      this.revealColors(message.words);
    }
  }

  revealColors(indices: number[]) {
    let changes: { i: number; c: number }[] = [];
    for (let i of indices) {
      console.log("revealing word " + i + " with color " + this.key[i]);
      changes.push({ i: i, c: this.key[i] });
    }
    this.setColors(changes);
  }

  shufflePlayers() {
    const shuffled = shuffle([...this.players]);
    const teamSizeFactor = Math.random() > 0.5;
    const breakpoint = Math.floor((shuffled.length + +teamSizeFactor) / 2);
    for (let i = 0; i < shuffled.length; ++i) {
      shuffled[i].team = i >= breakpoint ? 2 : 1;
    }
    console.log("shuffled players");
    this.sendPlayerInfo();
  }

  modifyPlayer = (username: string, f: (player: Player) => Player | null) => {
    const i = this.players.findIndex((p) => p.username === username);
    if (i === -1) {
      console.log("no player with id " + i);
      return;
    }
    const p = f(this.players[i]);
    if (p) {
      this.players[i] = p;
    } else {
      this.players.splice(i, 1);
    }
  };
  setColors(changes: { i: number; c: number }[]) {
    for (let { i, c } of changes) {
      this.boardColors[i] = c;
    }
    console.log("setColors");
    this.broadcast("set color", changes);
    this.save();
  }

  save() {
    console.log("saving with colors " + this.boardColors.toString());
    Model.findByIdAndUpdate(
      this.id,
      {
        name: this.name,
        words: this.words,
        start: this.start,
        players: [],
        key: this.key,
        colors: this.boardColors,
      },
      { new: true }
    )
      .then((updated) => {
        console.log(updated);
      })
      .catch((error) => {
        console.log(error);
      });
  }

  getData() {
    return {
      name: this.name,
      words: this.words,
      start: this.start,
      players: this.players,
      colors: this.boardColors,
    };
  }

  static current: Map<string, CodeNamesGame> = new Map();

  static async getById(id: string) {
    console.log("looking for game with id" + id);
    if (CodeNamesGame.current.has(id)) {
      return CodeNamesGame.current.get(id);
    }
    const gameData = await Model.findById(id);
    console.log(gameData);
    const game = new CodeNamesGame(gameData);
    CodeNamesGame.current.set(id, game);
    return game;
  }

  static async allGames() {
    const games = await Model.find({});
    return games.reverse();
  }

  static async deleteGame(id: string) {
    console.log("deleting game " + id);
    const room = "cn-" + id;
    io.in(room).emit("leave-cn-game", { id: id });
    const sockets = await io.sockets.in(room).fetchSockets();
    sockets.forEach((s) => {
      s.leave(room);
    });
    Model.findByIdAndDelete(id)
      .then(() => {
        console.log("deleted");
      })
      .catch((error) => {
        console.log(error);
      });
    CodeNamesGame.current.delete(id);
    console.log(CodeNamesGame.current);
  }

  static async newGame(props: { name: string; source: any[] }) {
    const source = WordSource.deserialize(props.source);
    const words = source.getDistinctWords(25);
    const start = randFrom([Color.Red, Color.Blue]) as Team;
    const datum = new Model({
      name: props.name,
      words: words,
      start: start,
      colors: new Array(25).fill(0),
      players: [],
      key: newKey(start),
    });
    const result = await datum.save();
    const game = new CodeNamesGame(result);
    CodeNamesGame.current.set(game.id, game);
    return game;
  }
}

function newKey(starts: Team) {
  const base = [
    starts,
    Color.Red,
    Color.Red,
    Color.Red,
    Color.Red,
    Color.Red,
    Color.Red,
    Color.Red,
    Color.Red,
    Color.Blue,
    Color.Blue,
    Color.Blue,
    Color.Blue,
    Color.Blue,
    Color.Blue,
    Color.Blue,
    Color.Blue,
    Color.Gray,
    Color.Gray,
    Color.Gray,
    Color.Gray,
    Color.Gray,
    Color.Gray,
    Color.Gray,
    Color.Black,
  ];
  return shuffle(base);
}

function randFrom<T>(list: T[]) {
  const i = Math.floor(Math.random() * list.length);
  return list[i];
}

interface Player {
  username: string;
  team: Team;
  spymaster: boolean;
  send?: (messageType: string, message: any) => void;
}
// type Team = "red" | "blue";
// type Color = Team | "gray" | "black";
enum Color {
  Default = 0,
  Red,
  Blue,
  Gray,
  Black,
}
type Team = Color.Red | Color.Blue;
const Red = Color.Red;
const Blue = Color.Blue;
export default CodeNamesGame;
