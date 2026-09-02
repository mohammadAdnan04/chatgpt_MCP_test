const mongoose = require('mongoose');
require('dotenv').config({ path: '.env' });
const SearchCache = require('./models/SearchCache');

async function run() {
  try {
    if (!process.env.MONGO_URI) {
      console.error("❌ MONGO_URI is missing in .env file");
      process.exit(1);
    }

    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB successfully.");

    console.log("Counting search cache entries...");
    const count = await SearchCache.countDocuments({});
    console.log(`Found ${count} cache entries.`);

    if (count > 0) {
      console.log("Clearing search cache...");
      const result = await SearchCache.deleteMany({});
      console.log(`Successfully deleted ${result.deletedCount} cache entries.`);
    } else {
      console.log("Cache is already empty. No action needed.");
    }

    console.log("Operation complete.");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error clearing search cache:", error.message);
    process.exit(1);
  }
}

run();
