import Model from "./models/codenames";
import WordSource from "./WordSource";

class CodeNamesGame {
  name: string;
  id: string;
  players: Player[];
  words: string[];
  boardColors: Color[];
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
  }

  static current: Map<string, CodeNamesGame> = new Map();

  static async getById(id: string) {
    if (CodeNamesGame.current.has(id)) {
      return CodeNamesGame.current.get(id);
    }
    const gameData = await Model.findById(id);
    const game = new CodeNamesGame(gameData);
    CodeNamesGame.current.set(id, game);
    return game;
  }

  static async allGames() {
    const games = await Model.find({});
    return games;
  }

  static async newGame(name: string) {
    const source = WordSource.default();
    let words: string[] = [];
    while (words.length < 25) {
      const word = source.getWord();
      if (!words.includes(word)) {
        words.push(word);
      }
    }
    const start = randFrom([Color.Red, Color.Blue]) as Team;
    const datum = new Model({
      name: name,
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

/**
 * Shuffles array in place. ES6 version from https://stackoverflow.com/questions/6274339/how-can-i-shuffle-an-array/6274381#6274381
 * @param {Array} a items An array containing the items.
 */
function shuffle<T>(a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface Player {
  name: string;
  team: Team;
  send?: (message: any) => void;
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
export default CodeNamesGame;
