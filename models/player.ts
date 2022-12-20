import mongoose from "mongoose";
const playerSchema = new mongoose.Schema({
  displayName: String,
  username: String,
});
const Player = mongoose.model("Player", playerSchema);
export default Player;
