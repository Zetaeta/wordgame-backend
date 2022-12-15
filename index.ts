import express from "express";
import path from "path";
import { WebSocketServer } from "ws";
import { BigWordGame } from "./BigWordGame";
import CodeNamesGame from "./CodenamesGame";
import cors from "cors";

const app = express();
app.use(express.json());
app.use(express.static("build"));
app.use(cors());
app.get("/", function (req, res) {
  res.sendFile(path.join(__dirname, "build", "index.html"));
});
app.get("/api/codenames/games", (request, response) => {
  // response.json([
  //   {
  //     name: "game",
  //     id: 1,
  //   },
  // ]);
  CodeNamesGame.allGames().then((games) => {
    response.json(games);
  });
});
app.get("/api/codenames/:id", (request, response) => {
  const id = request.params.id;
  CodeNamesGame.getById(id).then((game) => {
    response.json(game);
  });
});
app.post("/api/codenames/new", (request, response) => {
  console.log(request.body);
  CodeNamesGame.newGame(request.body.name).then((game) => {
    console.log(game);
    response.json(game);
  });
});
const PORT = 8000;
const game = new BigWordGame();
app.listen(PORT, () => {
  console.log("server running");
  const wss = new WebSocketServer({ port: 3001 });
  wss.on("connection", (ws) => {
    let id = -1;
    ws.on("message", (data) => {
      console.log("received: %s", data);
      const message = JSON.parse(data.toString());
      if (message.msgtype == "join") {
        id = game.join(message.name, (message) => {
          const str = JSON.stringify(message);
          console.log(str);
          ws.send(str);
        });
      } else {
        game.handleMessage(message, id);
      }
    });
  });
});
