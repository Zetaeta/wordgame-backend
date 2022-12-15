import mongoose from "mongoose";
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
const codenamesSchema = new mongoose.Schema({
  name: String,
  starts: Number,
  words: [String],
  colors: [Number],
  key: [Number],
  players: [
    {
      name: String,
      id: String,
      team: String,
      spyMaster: Boolean,
    },
  ],
});
codenamesSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: function (doc, ret) {
    delete ret._id;
  },
});
const CodeNames = mongoose.model("CodeNamesGame", codenamesSchema);
export default CodeNames;
