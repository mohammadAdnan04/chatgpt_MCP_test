const mongoose = require('mongoose');

const listKindSchema = new mongoose.Schema({
  listId: { type: mongoose.Schema.Types.ObjectId, ref: 'List', required: true },
  kind: { type: String, enum: ['ai_query', 'user_made', 'revealed_search_results'], required: true },
}, { timestamps: true });

listKindSchema.index({ listId: 1 }, { unique: true });

module.exports = mongoose.model('ListKind', listKindSchema);

