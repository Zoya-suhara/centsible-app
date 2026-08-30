const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const User = require('../models/User');
const { lookupPrice } = require('../services/priceLookup');

// @route   GET /api/wishlist
// @desc    Get all wishlist items for logged in user
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('wishlist');
    res.json({
      success: true,
      data: user.wishlist || []
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// @route   POST /api/wishlist
// @desc    Add a new wishlist item
// @access  Private
router.post('/', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    user.wishlist.push(req.body);
    await user.save();
    
    const newItem = user.wishlist[user.wishlist.length - 1];
    res.status(201).json({
      success: true,
      data: newItem
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// @route   PUT /api/wishlist/:id
// @desc    Update a wishlist item
// @access  Private
router.put('/:id', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const item = user.wishlist.id(req.params.id);
    
    if (!item) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }
    
    Object.assign(item, req.body);
    await user.save();
    
    res.json({
      success: true,
      data: item
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// @route   DELETE /api/wishlist/:id
// @desc    Delete a wishlist item
// @access  Private
router.delete('/:id', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const item = user.wishlist.id(req.params.id);
    
    if (!item) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }
    
    item.deleteOne();
    await user.save();
    
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// @route   POST /api/wishlist/lookup-price
// @desc    Get estimated price for an item using external APIs + fallback
// @access  Private
router.post('/lookup-price', protect, async (req, res) => {
  try {
    const { query, category } = req.body;
    if (!query) {
      return res.status(400).json({ success: false, error: 'Query is required' });
    }

    // The lookupPrice service handles all fallbacks internally
    const result = await lookupPrice(query, category);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Price lookup error:', error);
    res.status(500).json({ success: false, error: 'Price lookup failed' });
  }
});


module.exports = router;