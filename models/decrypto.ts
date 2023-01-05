import mongoose, { Types } from "mongoose";
export interface IDecrypto {
  name: string;
  phase: number;
  activeTeam: number;
  // _id: Types.ObjectId;
  score: { hits: number; misses: number }[];
  teams: {
    words: string[];
    keyDeck: number[];
    roundNo: number;
    players: string[];
    rounds: {
      key: number[];
      clueGiver: string;
      clues: string[];
      teamGuess: number[];
      enemyGuess: number[];
    }[];
  }[];
}
const DecryptoSchema = new mongoose.Schema<IDecrypto>({
  name: String,
  phase: Number,
  activeTeam: Number,
  score: [{ hits: Number, misses: Number }],
  teams: [
    {
      words: [String],
      keyDeck: [Number],
      roundNo: Number,
      players: [String],
      rounds: [
        {
          key: [Number],
          clueGiver: String,
          clues: [String],
          teamGuess: [Number],
          enemyGuess: [Number],
        },
      ],
    },
  ],
});
const DecryptoModel = mongoose.model<IDecrypto>("Decrypto", DecryptoSchema);
export default DecryptoModel;
