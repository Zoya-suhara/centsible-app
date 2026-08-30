const express = require('express');
const router = express.Router();
const Reminder = require('../models/Reminder');
const { protect } = require('../middleware/auth');   // ✅ import protect function

// Get all reminders for logged-in user
router.get('/', protect, async (req, res) => {
  try {
    const reminders = await Reminder.find({ userId: req.user.id }); // req.user.id from protect
    res.json({ success: true, reminders });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create or update a reminder
router.post('/', protect, async (req, res) => {
  try {
    const { type, date } = req.body;
    if (!type || !date) {
      return res.status(400).json({ success: false, error: 'Type and date required' });
    }
    const reminder = await Reminder.findOneAndUpdate(
      { userId: req.user.id, type },
      { type, date, updatedAt: Date.now() },
      { upsert: true, new: true }
    );
    res.json({ success: true, reminder });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete a reminder
router.delete('/:type', protect, async (req, res) => {
  try {
    await Reminder.findOneAndDelete({ userId: req.user.id, type: req.params.type });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;