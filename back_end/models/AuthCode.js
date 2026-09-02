const mongoose = require("mongoose");

const AuthCodeSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    clientId: {
      type: String,
      required: true,
      index: true,
    },
    redirectUri: {
      type: String,
      required: true,
    },
    codeChallenge: {
      type: String,
      required: true,
    },
    codeChallengeMethod: {
      type: String,
      default: "S256",
    },
    scopes: {
      type: [String],
      default: ["mcp", "offline_access"],
    },
    resource: {
      type: String,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AuthCode", AuthCodeSchema);
