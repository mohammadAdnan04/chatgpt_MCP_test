const mongoose = require("mongoose");

const memberSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  role: { type: String, enum: ["owner", "admin", "member"], default: "member" },
  orgCreditLimit: { type: Number, default: null }, // Max credits they can spend from pool per billing cycle
  orgCreditsUsed: { type: Number, default: 0 }, // How much they've spent this cycle
}, { _id: false });

const orgSchema = new mongoose.Schema({
  name: { type: String, required: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  poolCredits: { type: Number, default: 0 }, // The shared pool of credits for the org

  // Stripe
  stripeCustomerId: String,
  stripeSubscriptionId: String,

  // Plan
  planKey: { type: String, enum: ["FREE", "BASIC", "PRO", "PREMIUM"], default: "FREE" },
  billingInterval: { type: String, enum: ["monthly", "annual"], default: null },

  // Seats & Members
  seatsAllowed: { type: Number, default: 0 },
  members: [memberSchema], // includes owner as well
  // Credit recipients for plan grants
  creditRecipients: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

  
  automation: {
    users: { type: Number, default: 0 },
    pricePerUser: { type: Number, default: 0 },
  },
  // Billing dates
  currentPeriodEnd: { type: Date, default: null },
  cancelAtPeriodEnd: { type: Boolean, default: false },
  // Idempotency guard for Stripe invoice-based credit grants
  processedStripeInvoiceIds: [{ type: String }],
}, { timestamps: true });

orgSchema.index({ ownerId: 1 });
orgSchema.index({ stripeCustomerId: 1 });
orgSchema.index({ stripeSubscriptionId: 1 });

module.exports = mongoose.model("Organization", orgSchema);
