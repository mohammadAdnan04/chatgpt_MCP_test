const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const pendingUserSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  avatar: { type: String },
  signupIp: { type: String },
  signupUserAgent: { type: String },
  signupReferer: { type: String },
  signupUrl: { type: String },
  utmSource: { type: String },
  utmMedium: { type: String },
  utmCampaign: { type: String },
  utmTerm: { type: String },
  utmContent: { type: String },
  whatsappNumber: { type: String },
  otp: { type: String },
  otpExpires: { type: Date },
  createdAt: { type: Date, default: Date.now, expires: '15m' } // Automatically delete records after 15 minutes
});

module.exports = mongoose.model("PendingUser", pendingUserSchema);
