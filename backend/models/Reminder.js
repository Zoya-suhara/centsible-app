const mongoose = require('mongoose');

const reminderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, required: true }, // 'income', 'expenses', 'savings', 'rent', etc.
  date: { type: String, required: true }, // e.g., "2025-04-15" or "15th of month"
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Reminder', reminderSchema);