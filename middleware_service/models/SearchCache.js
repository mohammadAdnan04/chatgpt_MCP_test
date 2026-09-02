
const mongoose = require('mongoose');

const searchCacheSchema = new mongoose.Schema({
  filters_hash: { type: String, required: true, unique: true },
  items: { type: Array, default: [] },
  total_results: { type: Number, default: 0 },
  fetched_pages: { type: Array, default: [] }, // Pages fetched from ContactOut (1-based)
  created_at: { type: Date, default: Date.now, expires: '1h' } // Cache for 1 hour
});

module.exports = mongoose.model('SearchCache', searchCacheSchema);
