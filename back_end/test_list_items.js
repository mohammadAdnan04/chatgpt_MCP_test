const mongoose = require('mongoose');
const MONGO_URI = process.env.MONGO_URI;

async function run() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  const doc = await db.collection('listitems').findOne();
  console.log(JSON.stringify(doc, null, 2));
  await mongoose.connection.close();
}
run();