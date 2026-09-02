const mongoose = require('mongoose');

const dataSubjectRequestSchema = new mongoose.Schema({
  country: { type: String, required: true },
  requestType: { type: String, required: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true },
  jobTitle: { type: String, required: true },
  companyName: { type: String, required: true },
  mobile: { type: String, required: true },
  linkedin: { type: String },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('DataSubjectRequest', dataSubjectRequestSchema);