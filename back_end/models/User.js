const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    name: String,
    email: { type: String, unique: true },
    pendingEmail: { type: String },
    password: String,
    role: {
      type: String,
      enum: ["admin", "user"],
      default: "user",
    },
    onboarded: { type: Boolean, default: false },
    googleId: String,
    microsoftId: String,
    avatar: String,
    stripeCustomerId: { type: String, default: null },
    credits: { type: Number, default: 500 },
    planKey: {
      type: String,
      enum: ["FREE", "BASIC", "PRO", "PREMIUM", null],
      default: null, // null means "inherit from Org"
    },
    orgId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
    },
    orgRole: {
      type: String,
      enum: ["owner", "admin", "member", null],
      default: null,
    },
    billingDetails: {
      companyName: { type: String, default: "" },
      address: { type: String, default: "" },
      city: { type: String, default: "" },
      state: { type: String, default: "" },
      country: { type: String, default: "" },
      postalCode: { type: String, default: "" },
    },
    invoiceEmail: { type: String, default: "" },
    passwordResetToken: String,
    passwordResetExpires: Date,
    whatsappNumber: { type: String, unique: true, sparse: true },
    linkedInUrl: {
      type: String,
      trim: true,
      default: null
    },
    companyName: {
      type: String,
      trim: true,
      default: null
    },
    isVerified: { type: Boolean, default: false }, 
    isArchived: { type: Boolean, default: false },
    // Provisioned on Claude/MCP OAuth consent; used by Mawsool-MCP upstream calls
    mcpApiKey: { type: String, default: null },
    verificationToken: String, 
    verificationTokenExpires: Date,
    tokenVersion: { type: Number, default: 0 },
    // Multi-device session control
    allowMultipleSessions: { type: Boolean, default: false }, // Changed default to false (single session by default)
    // Anti-scraping Quotas
    dailySearchCount: { type: Number, default: 0 },
    customDailySearchLimit: { type: Number, default: null }, // Null means use default/plan limit
    lastSearchDate: { type: Date, default: Date.now },
    // Signup Metadata for anti-bot & marketing tracking
    signupIp: { type: String },
    signupUserAgent: { type: String },
    signupReferer: { type: String },
    signupUrl: { type: String },
    // UTM Parameters
    utmSource: { type: String, default: "" },
    utmMedium: { type: String, default: "" },
    utmCampaign: { type: String, default: "" },
    utmTerm: { type: String, default: "" },
    utmContent: { type: String, default: "" },
    // Salesforce Integration
    salesforce: {
      accessToken: { type: String, default: null },
      refreshToken: { type: String, default: null },
      instanceUrl: { type: String, default: null },
    },
    // Pipedrive: personId/orgId = Mawsool CRM; tokens = customer CRM
    pipedrive: {
      personId: { type: String, default: null },
      orgId: { type: String, default: null },
      accessToken: { type: String, default: null },
      refreshToken: { type: String, default: null },
      apiDomain: { type: String, default: null },
      expiresAt: { type: Date, default: null },
    },
  },
  {
    timestamps: true,
  }
);

UserSchema.index({ orgId: 1 });
UserSchema.index({ stripeCustomerId: 1 });

module.exports = mongoose.model("User", UserSchema);
