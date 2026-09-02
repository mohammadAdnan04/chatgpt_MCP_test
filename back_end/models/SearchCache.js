const mongoose = require("mongoose");

const SearchCacheSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  filtersHash: {
    type: String,
    required: true,
  },
  filters: {
    type: Object,
    required: true,
  },
  total_api_count: {
    type: Number,
    required: true,
  },
  results: {
    type: Array, // Array of lead objects
    default: [],
  },
  external_cursor: {
    type: String,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 60 * 60 * 24 * 30, // Auto-delete after 30 days
  },
});

// Compound index for efficient lookup
SearchCacheSchema.index({ userId: 1, filtersHash: 1 });

module.exports = mongoose.model("SearchCache", SearchCacheSchema);
