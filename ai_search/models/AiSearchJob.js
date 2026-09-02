const mongoose = require('mongoose');

const AiSearchJobSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true
  },
  originalPrompt: {
    type: String,
    required: true
  },
  isSemanticNeeded: {
    type: Boolean,
    default: false
  },
  extractedFilters: {
    type: Object,
    default: {}
  },
  semanticSentences: {
    type: [String],
    default: []
  },
  status: {
    type: String,
    enum: [
      'CLASSIFYING',
      'VECTOR_SEARCHING',
      'DEEPSEEK_SCORING',
      'PENDING_USER_APPROVAL',
      'FULFILLING',
      'COMPLETED',
      'FAILED'
    ],
    default: 'CLASSIFYING'
  },
  // To hold the samples for user review
  sampleLeads: {
    type: Array,
    default: []
  },
  // To track DeepSeek evaluated companies
  evaluatedCompanies: {
    type: Array,
    default: []
  },
  initialFilterResultsCount: {
    type: Number
  },
  extractedCompaniesCount: {
    type: Number
  },
  vectorSearchCompaniesCount: {
    type: Number
  },
  requestedLeadCount: {
    type: Number,
    default: 10
  },
  maxLeadsPerCompany: {
    type: Number,
    default: 1
  },
  totalAvailableLeads: {
    type: Number,
    default: 0
  },
  errorMessage: {
    type: String
  },
  listName: {
    type: String
  },
  revealInfo: {
    type: Boolean,
    default: false
  },
  authToken: {
    type: String
  },
  searchMode: {
    type: String,
    default: 'people'
  },
  useExternalVectorApi: {
    type: Boolean,
    default: false
  },
  externalApiDebug: {
    type: Object,
    default: null
  }
}, { timestamps: true });

module.exports = mongoose.model('AiSearchJob', AiSearchJobSchema);
