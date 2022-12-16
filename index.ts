import express from "express";
import http from "http";
import path from "path";
import { WebSocketServer } from "ws";
import { BigWordGame } from "./BigWordGame";
import CodeNamesGame from "./CodenamesGame";
import cors from "cors";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);
export const io = new Server(server, {
  cors: {
    origin: ["http://192.168.0.104:3000", "http://localhost:3000"],
  },
});
io.on("connection", (socket) => {
  socket.onAny((eventName, message: any) => {
    console.log("receiving message: " + eventName);
    console.log(message);
  });
  socket.on("join codenames", (data) => {
    console.log("join request");
    console.log(data);
    const game = CodeNamesGame.getById(data.id).then((game) => {
      if (!game) {
        console.log("no game with id" + data.id);
        return;
      }
      socket.join("cn-" + data.id);
      game.joinPlayer(data, (messageType, message) => {
        socket.emit(messageType, message);
      });
      // .forEach(([messageType, callback]) => {
      //   console.log("registering listener for " + messageType);
      //   socket.on(messageType, callback);
      // });
    });
  });
  socket.on("cnmsg", (message) => {
    CodeNamesGame.getById(message.gameId).then((game) => {
      if (!game) {
        console.log("missing game");
        return;
      }
      game.handleMessage(socket, message);
    });
  });
});
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
    response.json(game?.getData());
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
server.listen(PORT, () => {
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
