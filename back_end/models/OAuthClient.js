const mongoose = require("mongoose");

const OAuthClientSchema = new mongoose.Schema(
  {
    clientId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    clientSecretHash: {
      type: String,
      default: null,
    },
    name: {
      type: String,
      required: true,
    },
    redirectUris: {
      type: [String],
      required: true,
    },
    grantTypes: {
      type: [String],
      default: ["authorization_code", "refresh_token"],
    },
    responseTypes: {
      type: [String],
      default: ["code"],
    },
    tokenEndpointAuthMethod: {
      type: String,
      default: "none",
    },
    // RFC 7591 / MCP: "web" | "native" (Claude Code = native + loopback)
    applicationType: {
      type: String,
      enum: ["web", "native"],
      default: "native",
    },
    scopes: {
      type: [String],
      default: ["mcp", "offline_access"],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // true when registered via Dynamic Client Registration (RFC 7591)
    dynamicallyRegistered: {
      type: Boolean,
      default: false,
    },
    // true when resolved via Client ID Metadata Document (not persisted for CIMD fetches)
    cimd: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("OAuthClient", OAuthClientSchema);
