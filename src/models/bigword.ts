import mongoose from "mongoose";
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
const bigWordsSchema = new mongoose.Schema({
  word: String,
  phase: String,
  players: [
    {
      name: String,
      role: String,
      is_gm: Boolean,
      id: String,
      ready: Boolean,
    },
  ],
});
