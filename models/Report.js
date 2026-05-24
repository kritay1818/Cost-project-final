const mongoose = require('mongoose');

// Precomputed monthly report (key: userid + year + month)
const reportSchema = new mongoose.Schema({
  userid: { type: Number },
  year: { type: Number },
  month: { type: Number },
  costs: { type: mongoose.Schema.Types.Mixed },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date },
});

module.exports = mongoose.model('Report', reportSchema);
