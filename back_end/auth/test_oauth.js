require('dotenv').config({ path: '../../back_end/.env' });
const authController = require('../controllers/authController');
const mongoose = require('mongoose');

async function test() {
  await mongoose.connect(process.env.MONGO_URI);
  try {
    const req = {
      body: {
        name: "Test",
        email: "anothertest@gmail.com",
        password: "password123",
        turnstileToken: "dummy" // We'd fail here probably
      }
    };
    const res = {
      status: (code) => { console.log("STATUS:", code); return res; },
      json: (data) => { console.log("JSON:", data); return res; }
    };
    await authController.register(req, res);
  } catch (err) {
    console.log("CAUGHT ERROR:", err.message);
  }
  process.exit(0);
}
test();