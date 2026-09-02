const mongoose = require("mongoose");

const stripeGrantSchema = new mongoose.Schema(
  {
    invoiceId: { type: String, required: true },
    grantType: { type: String, required: true }, // e.g. main_plan, credit_addon
    customerId: { type: String, default: null },
    subscriptionId: { type: String, default: null },
  },
  { timestamps: true }
);

stripeGrantSchema.index({ invoiceId: 1, grantType: 1 }, { unique: true });

module.exports = mongoose.model("StripeGrant", stripeGrantSchema);
