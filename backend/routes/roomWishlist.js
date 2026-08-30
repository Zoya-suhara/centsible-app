const express = require('express');
const router = express.Router({ mergeParams: true }); // access :roomCode from parent
const Room = require('../models/Room');
const { protect } = require('../middleware/auth');
const { lookupPrice } = require('../services/priceLookup');

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

// Apply protection and room membership check to all routes
router.use(protect);
router.use(roomMemberCheck);

// @route   GET /api/rooms/:roomCode/wishlist
// @desc    Get all wishlist items for the room
// @access  Private (members only)
router.get('/', async (req, res) => {
  try {
    res.json({
      success: true,
      data: req.room.wishlist || []
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// @route   POST /api/rooms/:roomCode/wishlist
// @desc    Add a new wishlist item to the room
// @access  Private (any member)
router.post('/', async (req, res) => {
  try {
    const { name, estimatedPrice, category, priority, targetDate, notes } = req.body;
    
    if (!name || !estimatedPrice) {
      return res.status(400).json({ success: false, error: 'Name and estimated price are required' });
    }
    
    const newItem = {
      name,
      estimatedPrice: parseFloat(estimatedPrice),
      category: category || 'other',
      priority: priority || 'medium',
      targetDate: targetDate || null,
      notes: notes || '',
      contributions: [],
      totalSaved: 0,
      isCompleted: false,
      addedBy: {
        userId: req.user.id,
        name: req.user.name
      },
      addedAt: new Date()
    };
    
    req.room.wishlist.push(newItem);
    req.room.lastActivity = new Date();
    await req.room.save();
    
    const addedItem = req.room.wishlist[req.room.wishlist.length - 1];
    res.status(201).json({
      success: true,
      data: addedItem
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// @route   PUT /api/rooms/:roomCode/wishlist/:itemId
// @desc    Update a wishlist item (any member can contribute; only creator/admin can edit details)
// @access  Private
router.put('/:itemId', async (req, res) => {
  try {
    const item = req.room.wishlist.id(req.params.itemId);
    if (!item) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }
    
    const member = req.room.members.find(m => m.userId.toString() === req.user.id);
    const isAdmin = member && (member.role === 'owner' || member.role === 'admin');
    const isCreator = item.addedBy && item.addedBy.userId.toString() === req.user.id;
    
    const { name, estimatedPrice, category, priority, targetDate, notes, contributionAmount } = req.body;
    
    // Only allow editing core fields if admin or creator
    if (isAdmin || isCreator) {
      if (name !== undefined) item.name = name;
      if (estimatedPrice !== undefined) item.estimatedPrice = parseFloat(estimatedPrice);
      if (category !== undefined) item.category = category;
      if (priority !== undefined) item.priority = priority;
      if (targetDate !== undefined) item.targetDate = targetDate || null;
      if (notes !== undefined) item.notes = notes;
    }
    
    // Anyone can add a contribution
    if (contributionAmount && !isNaN(contributionAmount) && contributionAmount > 0) {
      item.contributions.push({
        userId: req.user.id,
        amount: parseFloat(contributionAmount),
        date: new Date()
      });
      item.totalSaved = (item.totalSaved || 0) + parseFloat(contributionAmount);
    }
    
    // Auto-complete if fully funded
    if (item.totalSaved >= item.estimatedPrice) {
      item.isCompleted = true;
    }
    
    req.room.lastActivity = new Date();
    await req.room.save();
    
    res.json({
      success: true,
      data: item
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// @route   DELETE /api/rooms/:roomCode/wishlist/:itemId
// @desc    Delete a wishlist item (admin/owner or creator only)
// @access  Private
router.delete('/:itemId', async (req, res) => {
  try {
    const item = req.room.wishlist.id(req.params.itemId);
    if (!item) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }
    
    const member = req.room.members.find(m => m.userId.toString() === req.user.id);
    const isAdmin = member && (member.role === 'owner' || member.role === 'admin');
    const isCreator = item.addedBy && item.addedBy.userId.toString() === req.user.id;
    
    if (!isAdmin && !isCreator) {
      return res.status(403).json({ success: false, error: 'Not authorized to delete this item' });
    }
    
    item.deleteOne();
    req.room.lastActivity = new Date();
    await req.room.save();
    
    res.json({ success: true, message: 'Item deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// @route   POST /api/rooms/:roomCode/wishlist/lookup-price
// @desc    Get estimated price for an item (reuses existing price lookup service)
// @access  Private (any member)
router.post('/lookup-price', async (req, res) => {
  try {
    const { query, category } = req.body;
    if (!query) {
      return res.status(400).json({ success: false, error: 'Query is required' });
    }
    
    // Use the same price lookup service as personal wishlist
    const result = await lookupPrice(query, category);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Price lookup error:', error);
    res.status(500).json({ success: false, error: 'Price lookup failed' });
  }
});

module.exports = router;