const mongoose = require('mongoose');
const Double = require('@mongoosejs/double');

const COST_CATEGORIES = ['food', 'health', 'housing', 'sports', 'education'];

const costSchema = new mongoose.Schema({
  description: { type: String, required: true },
  category: { type: String, required: true, enum: COST_CATEGORIES },
  userid: { type: Number, required: true },
  sum: { type: Double, required: true },
  created_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Cost', costSchema);
module.exports.COST_CATEGORIES = COST_CATEGORIES;
