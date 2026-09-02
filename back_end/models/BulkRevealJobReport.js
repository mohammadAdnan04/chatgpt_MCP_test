const mongoose = require('mongoose');

const bulkRevealJobReportSchema = new mongoose.Schema({
  jobId: { type: String, required: true, index: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  listId: { type: mongoose.Schema.Types.ObjectId, ref: 'List', required: true, index: true },
  revealType: { type: String, enum: ['email', 'phone', 'both'], required: true, index: true },
  status: { type: String, enum: ['running', 'completed', 'failed'], default: 'running', index: true },
  itemsMatched: { type: Number, default: 0 },
  itemsWithUrl: { type: Number, default: 0 },
  itemsMissingUrl: { type: Number, default: 0 },
  chargedCount: { type: Number, default: 0 },
  zeroCostCount: { type: Number, default: 0 },
  totalCost: { type: Number, default: 0 },
  items: {
    type: [
      {
        leadKey: { type: String, required: true },
        name: { type: String, default: '' },
        linkedinUrl: { type: String, default: '' },
        cost: { type: Number, default: 0 }
      }
    ],
    default: []
  }
}, { timestamps: true });

bulkRevealJobReportSchema.index({ userId: 1, createdAt: -1 });
bulkRevealJobReportSchema.index({ listId: 1, createdAt: -1 });

module.exports = mongoose.model('BulkRevealJobReport', bulkRevealJobReportSchema);

