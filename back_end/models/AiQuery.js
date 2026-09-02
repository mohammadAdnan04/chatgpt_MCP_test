const mongoose = require("mongoose");

const aiQuerySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  prompt: { type: String, required: true },
  listId: { type: mongoose.Schema.Types.ObjectId, ref: "List" },
  numLeads: { type: Number, required: true },
  includePhone: { type: Boolean, default: false },
  status: { 
    type: String, 
    enum: ["pending", "in_progress", "completed", "rejected"], 
    default: "pending" 
  },
  searchFilter: { type: mongoose.Schema.Types.Mixed, default: {} },
  aiEvaluationStats: { type: mongoose.Schema.Types.Mixed, default: {} },
  aiEvaluations: { type: mongoose.Schema.Types.Mixed, default: [] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

aiQuerySchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

aiQuerySchema.index({ userId: 1, status: 1, createdAt: -1 });
aiQuerySchema.index({ listId: 1 });
aiQuerySchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("AiQuery", aiQuerySchema);
