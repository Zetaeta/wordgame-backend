import mongoose from "mongoose";

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
