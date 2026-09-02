const mongoose = require('mongoose');

const PdplConsentSchema = new mongoose.Schema({
  ipAddress: {
    type: String,
    required: true
  },
  userAgent: {
    type: String,
    required: true
  },
  policyVersion: {
    type: String,
    required: true
  },
  consentGiven: {
    type: Boolean,
    default: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('PdplConsent', PdplConsentSchema);
