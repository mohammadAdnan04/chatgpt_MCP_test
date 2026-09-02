const mongoose = require('mongoose');

const revealedContactSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'ListItem' },
  profileUrl: { type: String },
  publicIdentifier: { type: String }, // Robust ID (e.g. "alex-grubb-00666651")
  contactType: { type: String, enum: ['phone', 'email'], required: true },

  status: { 
    type: String, 
    // 'free' = revealed with $0 charge (already owned / not billable)
    enum: ['pending', 'charged', 'free'], 
    default: 'pending' 
  },

}, { timestamps: true });

// List-bound reveals only — MUST ignore missing/null leadId (Mongo treats null as a real key)
revealedContactSchema.index(
  { userId: 1, leadId: 1, contactType: 1 },
  {
    unique: true,
    partialFilterExpression: { leadId: { $type: 'objectId' } },
  }
);
// Search-mode / profile URL reveals
revealedContactSchema.index(
  { userId: 1, profileUrl: 1, contactType: 1 },
  {
    unique: true,
    partialFilterExpression: { profileUrl: { $type: 'string' } },
  }
);
// Search-mode / publicIdentifier reveals
revealedContactSchema.index(
  { userId: 1, publicIdentifier: 1, contactType: 1 },
  {
    unique: true,
    partialFilterExpression: { publicIdentifier: { $type: 'string' } },
  }
);
revealedContactSchema.index({ userId: 1, createdAt: -1 });

/**
 * Drop the old sparse unique index that treated leadId:null as one key
 * (broke every search-mode reveal after the first phone/email per user).
 */
async function ensureRevealedContactIndexes() {
  try {
    const col = mongoose.connection.collection('revealedcontacts');
    const indexes = await col.indexes();
    const broken = indexes.find(
      (i) =>
        i.name === 'userId_1_leadId_1_contactType_1' &&
        !i.partialFilterExpression
    );
    if (broken) {
      await col.dropIndex('userId_1_leadId_1_contactType_1');
      console.log('[RevealedContact] Dropped broken userId_leadId_contactType index');
    }
  } catch (err) {
    console.warn('[RevealedContact] Index cleanup warning:', err.message);
  }
  try {
    await mongoose.model('RevealedContact').syncIndexes();
    console.log('[RevealedContact] Indexes synced');
  } catch (err) {
    console.warn('[RevealedContact] syncIndexes warning:', err.message);
  }
}

const RevealedContact = mongoose.model('RevealedContact', revealedContactSchema);
RevealedContact.ensureRevealedContactIndexes = ensureRevealedContactIndexes;
module.exports = RevealedContact;
