require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 4000;

// Enable CORS for all origins so that frontend on any URL can access this API
app.use(cors({
  origin: function (origin, callback) {
    callback(null, true); // Allow all origins to fix the CORS issue
  },
  credentials: true
}));

app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI)
.then(() => console.log('MongoDB connected for AI Search API'))
.catch(err => console.error('MongoDB connection error:', err));

// Mount Routes
const jobsRouter = require('./routes/jobs');
app.use('/api', jobsRouter);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'ai-search' });
});

app.listen(PORT, () => {
  console.log(`AI Search API running on port ${PORT}`);
});
