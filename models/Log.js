const mongoose = require('mongoose');

// One document per HTTP request across all services
const logSchema = new mongoose.Schema({
  service: { type: String },
  method: { type: String },
  path: { type: String },
  status_code: { type: Number },
  message: { type: String },
  created_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Log', logSchema);
