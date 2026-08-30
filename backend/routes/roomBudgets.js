const express = require('express');
const router = express.Router({ mergeParams: true }); // to access :roomCode from parent
const Room = require('../models/Room');
const Transaction = require('../models/Transaction');
const { protect } = require('../middleware/auth');

// Middleware to verify room membership and attach room to request
const roomMemberCheck = async (req, res, next) => {
  try {
    const roomCode = req.params.roomCode.toUpperCase();
    const room = await Room.findOne({ roomCode });
    if (!room) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }
    const isMember = room.members.some(m => m.userId.toString() === req.user.id);
    if (!isMember) {
      return res.status(401).json({ success: false, error: 'Not a member of this room' });
    }
    req.room = room;
    next();
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// Apply protection and room membership to all routes
router.use(protect);
router.use(roomMemberCheck);

// @route   GET /api/rooms/:roomCode/budgets
// @desc    Get room budgets with actual spending compared
// @access  Private (members only)
router.get('/', async (req, res) => {
  try {
    const roomId = req.room._id;
    const budgets = req.room.budgets || {};
    
    // Get all expense transactions for this room
    const transactions = await Transaction.find({
      roomId,
      isShared: true,
      type: 'expense'
    });
    
    // Calculate spending per category
    const spent = {};
    transactions.forEach(tx => {
      const cat = tx.category || 'other';
      spent[cat] = (spent[cat] || 0) + tx.amount;
    });
    
    // Build response with budget, spent, remaining for each category
    const budgetDetails = {};
    const categories = [...new Set([...Object.keys(budgets), ...Object.keys(spent)])];
    
    categories.forEach(cat => {
      const budgetAmount = budgets[cat] || 0;
      const spentAmount = spent[cat] || 0;
      budgetDetails[cat] = {
        budget: budgetAmount,
        spent: spentAmount,
        remaining: budgetAmount - spentAmount,
        percentage: budgetAmount > 0 ? (spentAmount / budgetAmount) * 100 : 0
      };
    });
    
    res.status(200).json({
      success: true,
      data: {
        budgets: budgetDetails,
        totalBudget: Object.values(budgets).reduce((sum, val) => sum + val, 0),
        totalSpent: Object.values(spent).reduce((sum, val) => sum + val, 0)
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// @route   PUT /api/rooms/:roomCode/budgets
// @desc    Update room budgets (admin/owner only)
// @access  Private
router.put('/', async (req, res) => {
  try {
    const { budgets } = req.body; // object like { groceries: 500, rent: 2000 }
    
    // Authorization: only owner or admin can update budgets
    const member = req.room.members.find(m => m.userId.toString() === req.user.id);
    if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
      return res.status(403).json({ success: false, error: 'Not authorized to update budgets' });
    }
    
    if (!budgets || typeof budgets !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid budgets format' });
    }
    
    // Validate each budget amount is a positive number
    for (const [category, amount] of Object.entries(budgets)) {
      if (typeof amount !== 'number' || amount < 0) {
        return res.status(400).json({ success: false, error: `Invalid amount for ${category}` });
      }
    }
    
    req.room.budgets = budgets;
    req.room.lastActivity = new Date();
    await req.room.save();
    
    res.status(200).json({
      success: true,
      data: req.room.budgets
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// @route   PATCH /api/rooms/:roomCode/budgets/:category
// @desc    Update a single budget category
// @access  Private (admin/owner)
router.patch('/:category', async (req, res) => {
  try {
    const { amount } = req.body;
    const category = req.params.category;
    
    const member = req.room.members.find(m => m.userId.toString() === req.user.id);
    if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    
    if (typeof amount !== 'number' || amount < 0) {
      return res.status(400).json({ success: false, error: 'Invalid amount' });
    }
    
    if (!req.room.budgets) req.room.budgets = {};
    req.room.budgets.set(category, amount);
    req.room.lastActivity = new Date();
    await req.room.save();
    
    res.status(200).json({
      success: true,
      data: { [category]: amount }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// @route   DELETE /api/rooms/:roomCode/budgets/:category
// @desc    Remove a budget category
// @access  Private (admin/owner)
router.delete('/:category', async (req, res) => {
  try {
    const member = req.room.members.find(m => m.userId.toString() === req.user.id);
    if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    
    const category = req.params.category;
    if (req.room.budgets && req.room.budgets.has(category)) {
      req.room.budgets.delete(category);
      req.room.lastActivity = new Date();
      await req.room.save();
    }
    
    res.status(200).json({ success: true, message: `Budget category '${category}' removed` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// @route   GET /api/rooms/:roomCode/budgets/summary
// @desc    Get high-level budget summary for dashboard
// @access  Private
router.get('/summary', async (req, res) => {
  try {
    const roomId = req.room._id;
    const budgets = req.room.budgets || {};
    
    // Get current month's spending (or all-time if you prefer)
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const transactions = await Transaction.find({
      roomId,
      isShared: true,
      type: 'expense',
      date: { $gte: startOfMonth }
    });
    
    const spent = {};
    transactions.forEach(tx => {
      const cat = tx.category || 'other';
      spent[cat] = (spent[cat] || 0) + tx.amount;
    });
    
    const totalBudget = Object.values(budgets).reduce((sum, val) => sum + val, 0);
    const totalSpent = Object.values(spent).reduce((sum, val) => sum + val, 0);
    
    res.status(200).json({
      success: true,
      data: {
        totalBudget,
        totalSpent,
        remaining: totalBudget - totalSpent,
        progress: totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0,
        categoriesCount: Object.keys(budgets).length
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;