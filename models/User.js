const mongoose = require('mongoose');

// Custom numeric id (not MongoDB _id) is the business key for users
const userSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  first_name: { type: String, required: true },
  last_name: { type: String, required: true },
  birthday: { type: Date },
});

module.exports = mongoose.model('User', userSchema);
