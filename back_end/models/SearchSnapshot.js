const mongoose = require("mongoose");

const searchSnapshotSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  savedFilterId: { type: mongoose.Schema.Types.ObjectId, ref: "SavedFilter", required: true },
  status: { type: String, enum: ["building", "ready", "failed"], default: "building" },
  publicIds: { type: [String], default: [] },
  totalCount: { type: Number, default: 0 },
  originalTotalCount: { type: Number, default: 0 },
  error: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true }
});

searchSnapshotSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
searchSnapshotSchema.index({ userId: 1, savedFilterId: 1 }, { unique: true });

module.exports = mongoose.model("SearchSnapshot", searchSnapshotSchema);
