const mongoose = require("mongoose");

const OAuthTokenSchema = new mongoose.Schema(
  {
    accessToken: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    refreshToken: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    clientId: {
      type: String,
      required: true,
      index: true,
    },
    scopes: {
      type: [String],
      default: ["mcp", "offline_access"],
    },
    resource: {
      type: String,
      default: null,
    },
    // Upstream Mawsool API key used by MCP tools for this user
    mcpApiKey: {
      type: String,
      default: null,
    },
    accessTokenExpiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    refreshTokenExpiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },
    revoked: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("OAuthToken", OAuthTokenSchema);
