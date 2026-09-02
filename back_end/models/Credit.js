const mongoose = require("mongoose");

const creditSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
    default: null,
  },
  amount: {
    type: Number,
    required: true,
  },
  balance: {
    type: Number,
    default: null,
  },
  type: {
    type: String,
    enum: ["buy", "deduct", "transfer"],
    required: true,
  },
  description: {
    type: String,
  },
   leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'ListItem', default: null },
  contactType: { type: String, enum: ['phone', 'email'], default: null },
}, { timestamps: true });

creditSchema.index({ userId: 1, createdAt: -1 });
creditSchema.index({ organizationId: 1, createdAt: -1 });

module.exports = mongoose.model("Credit", creditSchema);
