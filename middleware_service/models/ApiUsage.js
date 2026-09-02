const mongoose = require('mongoose');

const apiUsageSchema = new mongoose.Schema({
  date: { type: String, required: true, index: true }, // 'YYYY-MM-DD'
  service: { type: String, required: true }, // e.g., 'ContactOut_People_Search', 'ContactOut_Company_Search'
  sourceKey: { type: String, required: true }, // e.g., 'INTERNAL_BACKEND', or the specific API Key
  sourceName: { type: String, default: 'Unknown' }, // Friendly name of the key/user
  successCount: { type: Number, default: 0 },
}, { timestamps: true });

let ApiUsage;

module.exports = {
    init: (connection) => {
        ApiUsage = connection.model('ApiUsage', apiUsageSchema);
    },
    getModel: () => {
        if (!ApiUsage) {
            throw new Error('ApiUsage model not initialized with secondary connection');
        }
        return ApiUsage;
    }
};