import WordSource from "./WordSource";

export class BigWordGame {
  word = "";
  guess = "";
  guesser = "";
  phase: Phase = Phase.Prelim;
  players: Player[] = [];
  clues: Map<PlayerId, Clue> = new Map<PlayerId, Clue>();
  colors: Map<PlayerId, number> = new Map();
  source: WordSource = WordSource.default();

  handleMessage(message: any, id: PlayerId) {
    let setState = true;
    console.log("receiving:");
    console.log(message);
    switch (message.msgtype) {
      case "ready":
        this.ready(id);
        break;
      case "sendclue":
        this.sendClue(id, message.clue);
        break;
      case "sendguess":
        this.sendGuess(id, message.guess);
        break;
      case "nextphase":
        if (this.phase != Phase[message.currphase as keyof typeof Phase]) {
          console.log("Phase is not %s", message.currphase);
          break;
        }
        this.nextPhase();
        break;
      case "nextturn":
        this.nextRound();
        break;
      case "cluevis":
        this.shownClue(message.playerid, message.visible);
        break;
      case "remplr":
        this.removePlayer(message.id);
        break;
      case "setcolour":
        this.colors.set(id, message.colour);
        this.broadcast({
          msgtype: "setcolour",
          player: this.getPlayer(id).name,
          colour: message.colour,
        });
        setState = false;
        break;
    }
    if (setState) {
      this.broadcastState();
    }
  }

  sendClue = (id: PlayerId, clue: string) => {
    if (this.phase != Phase.MakeClues) {
      console.log("Wrong phase to send clue");
      return;
    }
    this.clues.set(id, { word: clue, shown: true });
    console.log(Object.fromEntries([...this.clues]));
    this.modifyPlayer(id, (player) => ({ ...player, ready: true }));
    if (this.allReady()) {
      this.nextPhase();
    }
  };
  sendGuess = (id: PlayerId, guess: string) => {
    if (this.phase != Phase.MakeGuess) {
      console.log("Wrong phase to make guess");
      return;
    }
    this.guess = guess;
    this.phase = Phase.Complete;
  };
  shownClue = (id: PlayerId, shown: boolean) => {
    this.clues.set(id, {
      ...(this.clues.get(id) as Clue),
      shown: shown,
    });
  };
  ready = (id: PlayerId) => {
    this.modifyPlayer(id, (player) => ({
      ...player,
      ready: true,
    }));
    if (
      [Phase.Prelim, Phase.InspectClues, Phase.Complete].includes(this.phase) &&
      this.allReady()
    ) {
      this.nextPhase();
    }
  };
  nextRound = () => {
    for (const p of this.players) {
      p.ready = false;
    }
    this.startRound();
  };
  nextPhase = () => {
    for (const p of this.players) {
      p.ready = false;
    }
    if (this.phase === Phase.MakeClues) {
      this.phase = Phase.InspectClues;
    } else if (this.phase == Phase.Prelim || this.phase == Phase.Complete) {
      this.startRound();
    } else if (this.phase == Phase.InspectClues) {
      this.phase = Phase.MakeGuess;
    } else {
      this.phase = Phase.Complete;
    }
  };
  startRound = () => {
    this.phase = Phase.MakeClues;
    this.clues = new Map<PlayerId, Clue>();
    this.word = this.getWord();
    let guesser = this.players.findIndex((p) => p.role === "guess");
    if (guesser != -1) {
      this.players[guesser].role = "clue";
    }
    guesser = (guesser + 1) % this.players.length;
    this.guesser = this.players[guesser].name;
    this.players[guesser].role = "guess";
  };
  allReady = () => {
    let ready = (p: Player) => p.ready;
    if (this.phase == Phase.MakeClues || this.phase == Phase.InspectClues) {
      ready = (p) => p.ready || p.role == "guess";
    }
    const and = (x: boolean, y: boolean) => x && y;
    return this.players.map(ready).reduce(and);
  };
  modifyPlayer = (id: PlayerId, f: (player: Player) => Player | null) => {
    const i = this.players.findIndex((p) => p.id === id);
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
  getPlayer = (id: PlayerId) => {
    return this.players[this.players.findIndex((p) => p.id == id)];
  };
  removePlayer = (id: PlayerId) => {
    this.sendMessage(this.getPlayer(id), { msgtype: "removed" });
    this.modifyPlayer(id, (p) => null);
    this.colors.delete(id);
  };
  sendMessage = (p: Player, message: any) => {
    try {
      p.send(message);
    } catch (e) {
      console.log(e);
      p.send = (message) => {
        console.log(
          "Not sending message %s to player %s",
          message.toString(),
          p.name
        );
      };
    }
  };

  join = (name: string, sendMessage: SendMessage): PlayerId => {
    const existing = this.players.findIndex((p) => p.name == name);
    if (existing != -1) {
      this.players[existing].send = sendMessage;
      this.broadcastState();
      sendMessage(this.allColors());
      return this.players[existing].id;
    }
    const id = this.newPlayerId();
    this.players.push({
      name: name,
      id: id,
      ready: false,
      send: sendMessage,
      role: "clue",
    });
    this.broadcastState();
    sendMessage(this.allColors());
    return id;
  };

  allColors() {
    return {
      msgtype: "allcolors",
      colours: Object.fromEntries(
        Array.from(this.colors.entries())
          .map(([id, color]) => {
            const player = this.getPlayer(id);
            if (player) {
              return [player.name, color];
            }
            return null;
          })
          .filter((x) => x) as [[string, number]]
      ),
    };
  }

  newPlayerId = (): PlayerId => {
    const currMax = this.players.reduce((m, p) => Math.max(m, p.id), -1);
    return currMax + 1;
  };
  broadcastState = () => {
    for (const p of this.players) {
      this.sendMessage(p, this.stateMsg(p));
    }
  };
  broadcast = (message: any) => {
    for (const p of this.players) {
      this.sendMessage(p, message);
    }
  };
  showClues = (player: Player) => {
    if (this.phase == Phase.Complete || this.phase == Phase.MakeGuess) {
      return true;
    }
    if (this.phase == Phase.InspectClues) {
      return player.role == "clue";
    }
    return false;
  };
  showWord = (player: Player) => {
    if (player.role == "clue") {
      return true;
    }
    return this.phase == Phase.Complete;
  };
  stateMsg = (player: Player) => {
    const pers: any = { role: player.role };
    if (this.showClues(player)) {
      let entries = [...this.clues];
      if (player.role == "guess" && this.phase == Phase.MakeGuess) {
        entries = entries.filter(([key, value]) => value.shown);
      }
      pers.clues = Object.fromEntries(entries);
    }
    if (this.showWord(player)) {
      pers.word = this.word;
    }
    if (player.role == "clue" && this.phase == Phase.MakeClues) {
      pers.myclue = this.clues.get(player.id);
    }
    if (this.phase == Phase.Complete) {
      pers.guess = this.guess;
    }
    return {
      msgtype: "status",
      self: player,
      guesser: this.guesser,
      phase: this.phase,
      pers_status: pers,
      players: this.players,
    };
  };
  getWord = () => {
    return this.source.getWord();
  };
}

type Clue = { word: string; shown: boolean };
type SendMessage = (message: any) => void;
type Player = {
  name: string;
  role: Role;
  send: SendMessage;
  ready: boolean;
  id: PlayerId;
};
type PlayerId = number;
type Role = "guess" | "clue";
enum Phase {
  Prelim = "Prelim",
  MakeClues = "MakeClues",
  InspectClues = "InspectClues",
  MakeGuess = "MakeGuess",
  Complete = "Complete",
}
