require('dotenv').config();
const mongoose = require('mongoose');
const ApiKey = require('./models/ApiKey');
const crypto = require('crypto');

const MONGO_URI = process.env.MONGO_URI;

const seedKeys = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('MongoDB connected for seeding API keys');

    // 1. Create Internal Key for Mawsool Site
    const internalKey = "mawsool_internal_" + crypto.randomBytes(16).toString('hex');
    await ApiKey.findOneAndUpdate(
      { name: 'Mawsool Internal Site' },
      { key: internalKey, status: 'active' },
      { upsert: true, new: true }
    );
    console.log('✅ Created/Updated Internal Key:', internalKey);

    // 2. Create a Sample Customer Key
    const customerKey = "mawsool_ext_" + crypto.randomBytes(16).toString('hex');
    await ApiKey.findOneAndUpdate(
      { name: 'Sample Customer API' },
      { key: customerKey, status: 'active' },
      { upsert: true, new: true }
    );
    console.log('✅ Created/Updated Sample Customer Key:', customerKey);

    console.log('\n--- IMPORTANT ---');
    console.log('Add the following to your back_end/.env:');
    console.log(`MAWSOOL_MIDDLEWARE_KEY=${internalKey}`);
    console.log('------------------\n');

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Seeding error:', err);
    process.exit(1);
  }
};

seedKeys();
