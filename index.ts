import express from "express";
import http from "http";
import path from "path";
import { WebSocketServer } from "ws";
import { BigWordGame } from "./BigWordGame";
import CodeNamesGame from "./CodenamesGame";
import cors from "cors";
import { Server } from "socket.io";
import { listenIdentity } from "./identity";
import WordSource from "./WordSource";
import mongoose from "mongoose";
import Decrypto from "./Decrypto";
require("dotenv").config();
const url = process.env.MONGODB_URI;
if (!url) {
  console.log("url missing");
} else {
  console.log("connecting to", url);
  mongoose
    .connect(url)
    .then((result) => {
      console.log("connected");
    })
    .catch((error) => {
      console.log("error connecting to mongo db:", error.message);
    });
}
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
  socket.onAnyOutgoing((event, ...args) => {
    console.log("sending " + event);
    console.log(args);
  });
  listenIdentity(socket);
  socket.on("join codenames", (data) => {
    console.log("join request");
    console.log(data);
    const game = CodeNamesGame.getById(data.id).then((game) => {
      if (!game) {
        console.log("no game with id" + data.id);
        return;
      }
      socket.join("cn-" + data.id);
      game.joinPlayer(socket, data, (messageType, message) => {
        socket.emit(messageType, message);
      });
      // .forEach(([messageType, callback]) => {
      //   console.log("registering listener for " + messageType);
      //   socket.on(messageType, callback);
      // });
    });
  });
  socket.on("join decrypto", (data) => {
    console.log("join request");
    console.log(data);
    const game = Decrypto.getById(data.id).then((game) => {
      if (!game) {
        console.log("no game with id" + data.id);
        return;
      }
      // socket.join("dc-" + data.id);
      game.join(socket);
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
  socket.on("dcmsg", (message) => {
    Decrypto.getById(message.gameId).then((game) => {
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

app.get("/api/codenames/games", (request, response) => {
  // response.json([
  //   {
  //     name: "game",
  //     id: 1,
  //   },
  // ]);
  CodeNamesGame.allGames().then((games) => {
    response.json(
      games.map((game) => ({
        name: game.name,
        id: game.id,
        colors: game.colors,
      }))
    );
  });
});
app.get("/api/decrypto/games", (request, response) => {
  // response.json([
  //   {
  //     name: "game",
  //     id: 1,
  //   },
  // ]);
  Decrypto.allGames().then((games) => {
    response.json(
      games.map((game) => ({
        name: game.name,
        id: game.id,
      }))
    );
  });
});
app.get("/api/decrypto/:id", (request, response) => {
  const id = request.params.id;
  Decrypto.getById(id).then((game) => {
    response.json(game?.getBaseData());
  });
});
app.get("/api/codenames/:id", (request, response) => {
  const id = request.params.id;
  CodeNamesGame.getById(id).then((game) => {
    response.json(game?.getData());
  });
});
app.post("/api/codenames/delete/:id", (request, response) => {
  const id = request.params.id;
  CodeNamesGame.deleteGame(id).then((result) => {
    response.status(204).end();
  });
});
app.post("/api/codenames/new", (request, response) => {
  console.log(request.body);
  CodeNamesGame.newGame(request.body).then((game) => {
    console.log(game);
    response.json(game);
    CodeNamesGame.allGames().then((games) => {
      io.emit("cngames", games);
    });
  });
});
app.post("/api/decrypto/new", (request, response) => {
  console.log(request.body);
  const game = Decrypto.newGame(request.body);
  console.log(game);
  response.json(game);
  Decrypto.allGames().then((games) => {
    io.emit("dcgames", games);
  });
});
const game = new BigWordGame();
app.get("/api/wordsource/current", (request, response) => {
  const source = game.source;
  response.json(source.serialize());
});
app.get("/api/wordsource/default", (request, response) => {
  const source = WordSource.default();
  response.json(source.serialize());
});
app.get("*", function (req, res) {
  res.sendFile(path.join(__dirname, "build", "index.html"));
});
const PORT = process.env.PORT ? +process.env.PORT : 8000;
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
