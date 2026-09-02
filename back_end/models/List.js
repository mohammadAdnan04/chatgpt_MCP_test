const mongoose = require("mongoose");

const listSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    queryId: { type: mongoose.Schema.Types.ObjectId, ref: "AiQuery" },
    totalLeads: { type: Number, default: 0 },
    listType: {
      type: String,
      default: "people",
      enum: ["people", "companies"],
    },
    isSyncing: {
      type: Boolean,
      default: false,
    },
    revealStatus: {
      type: String,
      default: 'idle',
      enum: ['idle', 'running', 'completed', 'failed', 'stopped_no_credits']
    },
    revealProgress: {
      total: { type: Number, default: 0 },
      current: { type: Number, default: 0 },
      type: { type: String, enum: ['email', 'phone', 'both', 'none'], default: 'none' }
    },
    searchFilters: {
      type: mongoose.Schema.Types.Mixed
    },
  
  status: {
    type: String,
    default: "pending",
    enum: ["pending", "active", "archived"], // Simplified status for the list itself
  },
  },
  { timestamps: true }
);

listSchema.index({ createdBy: 1, createdAt: -1 });
listSchema.index({ createdBy: 1, name: 1 });
listSchema.index({ createdBy: 1, revealStatus: 1 });

module.exports = mongoose.model("List", listSchema);
