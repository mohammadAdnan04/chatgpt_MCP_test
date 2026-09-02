const mongoose = require('./node_modules/mongoose');
require('./node_modules/dotenv').config({ path: './.env' });

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected");

  const ListItem = require('./models/ListItem');
  
  // Find the latest 5 items inserted in any list
  const items = await ListItem.find().sort({ createdAt: -1 }).limit(1).lean();
  
  for (const item of items) {
    console.log("-------------------");
    console.log("Name:", item.raw?.name || item.name);
    console.log("raw.current_positions:", JSON.stringify(item.raw?.current_positions, null, 2));
  }
  
  process.exit(0);
}

run();