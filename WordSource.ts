import fs from "fs";

class WordSource {
  sources: Source[];

  constructor(sources: Source[]) {
    this.sources = sources;
  }

  static default() {
    const files = fs.readdirSync("words");
    const sources = files
      .map((file) => {
        const fileType = file.slice(-4);
        if (fileType != ".txt") {
          console.log("file type wrong %s", fileType);
          return null;
        }
        const name = file.slice(0, -4);
        return { name: name, file: `words/${file}`, weight: 1 };
      })
      .filter((f) => f);
    return new WordSource(sources as Source[]);
  }

  getWord() {
    const source = weightedRandom(this.sources);
    const words = this.loadSource(source);
    return words[randomInt(words.length)];
  }

  loadSource(source: Source) {
    if (source.cache) {
      return source.cache;
    }
    const lines = fs.readFileSync(source.file).toString().split("\n");
    source.cache = lines;
    return lines;
  }
}

interface Source {
  name: string;
  file: string;
  weight: number;
  description?: string;
  cache?: string[];
}

function randomInt(max: number) {
  return Math.floor(Math.random() * max);
}

function weightedRandom(sources: Source[]) {
  var i;

  let weights: number[] = [];

  for (i = 0; i < sources.length; i++)
    weights[i] = sources[i].weight + (weights[i - 1] || 0);

  var random = Math.random() * weights[weights.length - 1];

  for (i = 0; i < weights.length; i++) if (weights[i] > random) break;

  return sources[i];
}

export default WordSource;
