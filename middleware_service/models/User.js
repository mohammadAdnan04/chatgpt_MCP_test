const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    apiKey: { type: String, required: true, unique: true, index: true },
    isActive: { type: Boolean, default: true },
    credits: { type: Number, required: true, default: 0 }
}, { timestamps: true });

let User;

module.exports = {
    init: (connection) => {
        User = connection.model('User', userSchema);
    },
    getModel: () => {
        if (!User) {
            throw new Error('User model not initialized with secondary connection');
        }
        return User;
    }
};
