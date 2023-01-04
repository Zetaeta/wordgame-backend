import DCModel, { IDecrypto } from "./models/decrypto";
import WordSource from "./WordSource";
import mongoose from "mongoose";
import { shuffle } from "./utils";
import { Socket } from "socket.io";
import { getPlayerData, getPlayerName } from "./identity";
import { io } from ".";
enum Phase {
  PreStart,
  MakeClues,
  EnemyGuess,
  TeamGuess,
}
type SendMessage = (message: any) => void;

const keys = range(24).map((i) => genKey(i));
class Decrypto {
  model: mongoose.Document & IDecrypto;
  id: string;
  sends: Map<string, SendMessage> = new Map();
  static current: Map<string, Decrypto> = new Map();

  constructor(model: mongoose.Document & IDecrypto) {
    this.model = model;
    this.id = model._id;
  }

  static newGame(props: { name: string; source?: any[] }) {
    const source = WordSource.deserialize(props.source);
    const words = source.getDistinctWords(8);
    const model = new DCModel({
      name: props.name,
      phase: Phase.PreStart,
      activeTeam: 0,
      teams: [
        {
          words: words.slice(0, 4),
          keyDeck: shuffle(range(25)),
          roundNo: 0,
          players: [],
          rounds: [],
        },
        {
          words: words.slice(4, 8),
          keyDeck: shuffle(range(25)),
          roundNo: 0,
          players: [],
          rounds: [],
        },
      ],
    });
    model.save().then(() => {
      console.log("saved new game");
    });
    const game = new Decrypto(model);
    Decrypto.current.set(game.id, game);
    return game;
  }

  joinNew(socket: Socket, username: string) {
    if (this.model.phase == Phase.PreStart) {
      const teams = this.model.teams;
      if (teams[0].players.length > teams[1].players.length) {
        teams[1].players.push(username);
      } else {
        teams[0].players.push(username);
      }
      socket.join("dc-" + this.model._id);
      this.sends.set(username, (message) => {
        socket.emit("dcmsg", message);
      });
      this.sendGameStatus();
    } else {
      console.log("late join");
      this.sendLateJoin(socket);
    }
  }

  join(socket: Socket) {
    const { username, displayName } = getPlayerData(socket);
    socket.join("dc-" + this.model._id + "-players");
    if (this.getTeam(username) === -1) {
      this.joinNew(socket, username);
    } else {
      this.sends.set(username, (message) => {
        socket.emit("dcmsg", message);
      });
      socket.join("dc-" + this.model._id);
      this.sendGameStatus();
    }
    this.sendPlayerInfo();
    this.sendHistory();
  }

  handleMessage(socket: Socket, message: any) {
    const { username } = getPlayerData(socket);
    const msgType = message.msgType;
    if (msgType == "latejoin") {
      const team = message.joinTeam;
      this.model.teams[team].players.push(username);
    } else if (msgType === "sendClue") {
      this.sentClue(message, username);
    } else if (msgType == "sendEnemyGuess") {
      this.sentEnemyGuess(message, username);
    } else if (msgType == "sendTeamGuess") {
      this.sentTeamGuess(message, username);
    } else if (msgType == "start") {
      this.startGame();
    }
  }

  sentEnemyGuess(message: any, player: string) {
    if (this.model.phase != Phase.EnemyGuess) {
      console.error("Wrong phase to make guess");
      return;
    }
    const teamNo = this.getTeam(player);
    if (teamNo == this.model.activeTeam) {
      console.error("Wrong team to make enemy guess");
      return;
    }
    const guess = message.guess;
    console.log(guess);
    const active = this.model.teams[1 - teamNo];
    active.rounds[0].enemyGuess = guess;
    this.model.phase = Phase.TeamGuess;
    this.model.save();
    this.sendGameStatus();
  }
  sentTeamGuess(message: any, player: string) {
    if (this.model.phase != Phase.TeamGuess) {
      console.error("Wrong phase to make guess");
      return;
    }
    const teamNo = this.getTeam(player);
    if (teamNo != this.model.activeTeam) {
      console.error("Wrong team to make team guess");
      return;
    }
    const guess = message.guess;
    console.log(guess);
    const active = this.model.teams[teamNo];
    active.rounds[0].teamGuess = guess;
    this.nextRound();
  }

  nextRound() {
    this.model.phase = Phase.MakeClues;
    const teamNo = this.model.activeTeam;
    const active = this.model.teams[teamNo];
    active.roundNo++;
    const newKey = genKey(active.keyDeck[active.roundNo]);
    const newGiver = this.nextPlayer(teamNo, active.rounds[0].clueGiver);
    active.rounds.unshift({
      key: newKey,
      clueGiver: newGiver,
      clues: [],
      teamGuess: [],
      enemyGuess: [],
    });
    this.model.activeTeam = 1 - teamNo;
    this.model.save();
    this.sendGameStatus();
    this.sendHistory();
    this.sendPlayerInfo();
  }

  startGame() {
    this.model.phase = Phase.MakeClues;
    for (let team of this.model.teams) {
      const key = genKey(team.keyDeck[0]);
      const giver = team.players[0];
      team.rounds.unshift({
        key: key,
        clueGiver: giver,
        clues: [],
        teamGuess: [],
        enemyGuess: [],
      });
    }
    this.model.save();
    this.sendGameStatus();
    this.sendHistory();
    this.sendPlayerInfo();
  }

  sendHistory() {
    const teamHistory = this.model.teams.map((team) => {
      return team.rounds
        .slice(1)
        .map((round: any) => {
          const table = makeTable(round.key, round.clues);
          const roundInfo: any = {
            ...round.toObject(),
            table: table,
          };
          if (!equals(round.key, round.teamGuess)) {
            roundInfo.guessTable = makeTable(round.teamGuess, round.clues);
            roundInfo.teamWrong = true;
          }
          if (equals(round.key, round.enemyGuess)) {
            roundInfo.enemyRight = true;
          }
          console.log("roundInfo");
          console.log(roundInfo);
          return roundInfo;
        })
        .reverse();
    });
    this.model.teams.forEach((team, teamNo) => {
      const history = {
        team: teamHistory[teamNo],
        enemy: teamHistory[1 - teamNo],
      };
      for (let player of team.players) {
        this.send(player, {
          msgType: "history",
          history: history,
        });
      }
    });
  }

  send(player: string, message: any) {
    const sendFn = this.sends.get(player);
    if (sendFn) {
      sendFn(message);
    }
  }

  nextPlayer(teamNo: number, current: string) {
    const players = this.model.teams[teamNo].players;
    const index = players.indexOf(current);
    return players[(index + 1) % players.length];
  }

  sentClue(message: any, player: string) {
    if (this.model.phase != Phase.MakeClues) {
      console.error("Wrong phase to make clues");
      return;
    }
    const teamNo = this.getTeam(player);
    if (teamNo != this.model.activeTeam) {
      console.error("Wrong team to make clues");
      return;
    }
    const team = this.model.teams[teamNo];
    if (team.rounds[0].clueGiver != player) {
      console.error("Wrong person to make clues");
      return;
    }
    const clues = message.clues;
    console.log(clues);
    team.rounds[0].clues = clues;
    this.model.phase = Phase.EnemyGuess;
    this.model.save();
    this.sendGameStatus();
  }

  sendGameStatus() {
    const phase = this.model.phase;
    const activeTeam = this.model.activeTeam;
    this.model.teams.forEach((team, teamNo) => {
      const enemy = this.model.teams[1 - teamNo];
      console.log("enemy");
      console.log(enemy);
      team.players.forEach((player) => {
        const sendMsg = this.sends.get(player);
        if (!sendMsg) {
          return;
        }
        const msg: any = {
          msgType: "status",
          phase: this.model.phase,
          activeTeam: this.model.activeTeam,
          words: team.words,
          ourClues: team.rounds[0]?.clues,
          theirClues: enemy.rounds[0]?.clues,
          theirGuess: team.rounds[0]?.enemyGuess,
          myStatus: "waiting",
        };
        if (team.rounds[0]?.clueGiver == player) {
          msg.key = team.rounds[0].key;
          if (phase == Phase.MakeClues && teamNo == activeTeam) {
            msg.myStatus = "clues";
          }
        } else if (phase == Phase.TeamGuess && teamNo == activeTeam) {
          msg.myStatus = "teamGuess";
        }
        if (phase == Phase.EnemyGuess && teamNo != activeTeam) {
          msg.myStatus = "enemyGuess";
        }
        if (this.model.phase == Phase.PreStart) {
          msg.canStart = this.canStart();
        }
        sendMsg(msg);
      });
    });
  }

  canStart() {
    const teams = this.model.teams;
    return teams[0].players.length > 1 && teams[1].players.length > 1;
  }

  // returns -1 if player is not in the game
  getTeam(username: string) {
    const teams = this.model.teams;
    return teams[0].players.includes(username)
      ? 0
      : teams[1].players.includes(username)
      ? 1
      : -1;
  }

  clueGiver(team: number) {
    return this.model.teams[team].rounds[0].clueGiver;
  }

  changeTeam(player: string, team: number) {
    const teams = this.model.teams;
    const oldTeam = 1 - team;
    const oldEnd = teams[oldTeam].players.indexOf(player);
    if (oldEnd >= 0) {
      teams[oldTeam].players.splice(oldEnd, 1);
    }
    if (teams[team].players.includes(player)) {
      teams[team].players.push(player);
    }
    this.model.save();
    this.sendPlayerInfo();
  }

  shufflePlayers() {
    const teams = this.model.teams;
    const players = teams[0].players.concat(teams[1].players);
    const shuffled = shuffle(players);
    const teamSizeFactor = Math.random() > 0.5;
    const breakpoint = Math.floor((shuffled.length + +teamSizeFactor) / 2);
    teams[0].players = shuffled.slice(0, breakpoint);
    teams[1].players = shuffled.slice(breakpoint);
    this.model.save();
    console.log("shuffled players");
    this.sendPlayerInfo();
  }

  async sendPlayerInfo() {
    console.log("sending player info");
    const msg = {
      msgType: "players",
      teams: await Promise.all(
        this.model.teams.map((team) => {
          return Promise.all(
            team.players.map(async (username) => {
              const displayName = await getPlayerName(username);
              const role =
                this.model.phase > Phase.PreStart &&
                team.rounds[0].clueGiver === username;
              return { name: displayName, role: role };
            })
          );
        })
      ),
    };
    console.log(msg);
    io.to("dc-" + this.id + "-players").emit("dcmsg", msg);
  }

  sendLateJoin(socket: Socket) {}

  getBaseData() {
    return {
      teams: this.model.teams.map((team) => {
        return team.players;
      }),
    };
  }

  static async getById(id: string) {
    console.log("looking for game with id" + id);
    try {
      if (Decrypto.current.has(id)) {
        return Decrypto.current.get(id);
      }
      const gameData = await DCModel.findById(id);
      console.log(gameData);
      if (!gameData) {
        throw "missing game with id" + id;
      }
      const game = new Decrypto(gameData);
      Decrypto.current.set(id, game);
      return game;
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  static async allGames() {
    const games = await DCModel.find({});
    return games.reverse();
  }
}

function makeTable(key: number[], clues: string[]) {
  const table: (string | null)[] = [null, null, null, null];
  for (let i = 0; i < 3; i++) {
    table[key[i]] = clues[i];
  }
  return table;
}

function range(n: number) {
  return Array.from(Array(n).keys());
}

function equals<T>(a: T[], b: T[]) {
  if (a === b) {
    return true;
  }
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; ++i) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

export function genKey(i: number, n: number = 4, amount = 3) {
  const remaining = range(n);
  const key: number[] = [];
  while (n > 1 && amount > 0) {
    const r = i % n;
    key.push(remaining[r]);
    remaining.splice(r, 1);
    i = (i - r) / n;
    n--;
    amount--;
  }
  console.log(key);
  return key;
}
export default Decrypto;
