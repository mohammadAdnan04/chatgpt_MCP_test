const mongoose = require('mongoose');

async function updateIndexes() {
  try {
    // Use your actual connection string from your project
    await mongoose.connect('mongodb://localhost:27017/mawsool');
    console.log('Connected to MongoDB');
    
    const collection = mongoose.connection.collection('savedfilters');
    
    // List current indexes
    const indexes = await collection.indexes();
    console.log('Current indexes:', indexes);
    
    // Find and drop the userId index
    for (const index of indexes) {
      if (index.key && index.key.userId === 1 && Object.keys(index.key).length === 1) {
        await collection.dropIndex(index.name);
        console.log('Dropped index:', index.name);
      }
    }
    
    // Create new compound index
    await collection.createIndex({ userId: 1, filterName: 1 }, { unique: true });
    console.log('Created new compound index');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

updateIndexes();