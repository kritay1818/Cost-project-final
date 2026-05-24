const mongoose = require('mongoose');
const { logger } = require('./logger');

// All four services share one MongoDB Atlas database
async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error('MONGODB_URI is not set. Add it to your .env file.');
  }

  await mongoose.connect(uri);
  logger.info('Connected to MongoDB');
}

module.exports = { connectDB };
