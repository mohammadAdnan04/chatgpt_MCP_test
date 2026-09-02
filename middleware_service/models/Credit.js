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

let Credit;

module.exports = {
    init: (connection) => {
        Credit = connection.model('Credit', creditSchema);
    },
    getModel: () => {
        if (!Credit) {
            throw new Error('Credit model not initialized with secondary connection');
        }
        return Credit;
    }
};