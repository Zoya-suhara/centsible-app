const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Room = require('../models/Room');
const { protect } = require('../middleware/auth');
const { validateRoom } = require('../middleware/validation');

// Helper to get Socket.IO instance
const getIo = (req) => req.app.get('io');

// @route   POST /api/rooms/create
// @desc    Create a new room
// @access  Private
router.post('/create', protect, validateRoom, async (req, res) => {
  try {
    const { roomName, roomType, currency } = req.body;
    
    const roomCode = await Room.generateRoomCode();
    
    const room = await Room.create({
      roomCode,
      roomName,
      roomType: roomType || 'other',
      currency: currency || 'AED',
      members: [{
        userId: req.user.id,
        name: req.user.name,
        email: req.user.email,
        role: 'owner'
      }]
    });
    
    res.status(201).json({
      success: true,
      data: room
    });
  } catch (error) {
    console.error('❌ Error in /create:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

// @route   POST /api/rooms/join
// @desc    Join an existing room
// @access  Private
router.post('/join', protect, async (req, res) => {
  try {
    const { roomCode } = req.body;
    
    if (!roomCode) {
      return res.status(400).json({
        success: false,
        error: 'Room code is required'
      });
    }
    
    const room = await Room.findOne({ roomCode: roomCode.toUpperCase() });
    
    if (!room) {
      return res.status(404).json({
        success: false,
        error: 'Room not found'
      });
    }
    
    // Check if user already in room
    const alreadyMember = room.members.some(
      member => member.userId.toString() === req.user.id
    );
    
    if (alreadyMember) {
      return res.status(400).json({
        success: false,
        error: 'You are already a member of this room'
      });
    }
    
    room.members.push({
      userId: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role: 'member'
    });
    
    room.lastActivity = new Date();
    await room.save();
    
    // Emit socket event to room
    const io = getIo(req);
    io.to(room.roomCode).emit('room-updated', room);
    
    res.status(200).json({
      success: true,
      data: room
    });
  } catch (error) {
    console.error('❌ Error in /join:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

// @route   GET /api/rooms/:roomCode
// @desc    Get room details
// @access  Private
router.get('/:roomCode', protect, async (req, res) => {
  try {
    const room = await Room.findOne({ roomCode: req.params.roomCode.toUpperCase() });
    
    if (!room) {
      return res.status(404).json({
        success: false,
        error: 'Room not found'
      });
    }
    
    // Check if user is member
    const isMember = room.members.some(
      member => member.userId.toString() === req.user.id
    );
    
    if (!isMember) {
      return res.status(401).json({
        success: false,
        error: 'You are not a member of this room'
      });
    }
    
    res.status(200).json({
      success: true,
      data: room
    });
  } catch (error) {
    console.error('❌ Error in GET /:roomCode:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

// @route   PATCH /api/rooms/:roomCode
// @desc    Update room settings (name, type, currency, settings)
// @access  Private (admin/owner only)
router.patch('/:roomCode', protect, async (req, res) => {
  try {
    const { roomName, roomType, currency, settings } = req.body;
    
    const room = await Room.findOne({ roomCode: req.params.roomCode.toUpperCase() });
    if (!room) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }
    
    const member = room.members.find(m => m.userId.toString() === req.user.id);
    if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
      return res.status(403).json({ success: false, error: 'Not authorized to update room' });
    }
    
    if (roomName) room.roomName = roomName;
    if (roomType) room.roomType = roomType;
    if (currency) room.currency = currency;
    if (settings) room.settings = { ...room.settings, ...settings };
    
    room.lastActivity = new Date();
    await room.save();
    
    // Emit update
    const io = getIo(req);
    io.to(room.roomCode).emit('room-updated', room);
    
    res.status(200).json({ success: true, data: room });
  } catch (error) {
    console.error('❌ Error in PATCH /:roomCode:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// @route   DELETE /api/rooms/:roomCode/leave
// @desc    Leave a room (member removes themselves)
// @access  Private
router.delete('/:roomCode/leave', protect, async (req, res) => {
  try {
    const room = await Room.findOne({ roomCode: req.params.roomCode.toUpperCase() });
    if (!room) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }
    
    const memberIndex = room.members.findIndex(m => m.userId.toString() === req.user.id);
    if (memberIndex === -1) {
      return res.status(400).json({ success: false, error: 'You are not a member' });
    }
    
    const leavingMember = room.members[memberIndex];
    
    // Owner cannot leave if they are the only member; must delete room instead
    if (leavingMember.role === 'owner' && room.members.length === 1) {
      return res.status(400).json({
        success: false,
        error: 'Owner cannot leave a room with no other members. Please delete the room instead.'
      });
    }
    
    // Remove member
    room.members.splice(memberIndex, 1);
    
    // If owner left, assign new owner (first admin or oldest member)
    if (leavingMember.role === 'owner') {
      const newOwner = room.members.find(m => m.role === 'admin') || room.members[0];
      if (newOwner) newOwner.role = 'owner';
    }
    
    room.lastActivity = new Date();
    await room.save();
    
    const io = getIo(req);
    io.to(room.roomCode).emit('room-updated', room);
    
    res.status(200).json({ success: true, message: 'Left room successfully' });
  } catch (error) {
    console.error('❌ Error in DELETE /:roomCode/leave:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// @route   DELETE /api/rooms/:roomCode/members/:userId
// @desc    Remove a member from room (admin/owner only)
// @access  Private
router.delete('/:roomCode/members/:userId', protect, async (req, res) => {
  try {
    const room = await Room.findOne({ roomCode: req.params.roomCode.toUpperCase() });
    if (!room) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }
    
    const requester = room.members.find(m => m.userId.toString() === req.user.id);
    if (!requester || (requester.role !== 'owner' && requester.role !== 'admin')) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    
    const targetUserId = req.params.userId;
    if (targetUserId === req.user.id) {
      return res.status(400).json({ success: false, error: 'Use /leave to remove yourself' });
    }
    
    const targetIndex = room.members.findIndex(m => m.userId.toString() === targetUserId);
    if (targetIndex === -1) {
      return res.status(404).json({ success: false, error: 'Member not found' });
    }
    
    const targetRole = room.members[targetIndex].role;
    if (targetRole === 'owner') {
      return res.status(403).json({ success: false, error: 'Cannot remove the room owner' });
    }
    
    room.members.splice(targetIndex, 1);
    room.lastActivity = new Date();
    await room.save();
    
    const io = getIo(req);
    io.to(room.roomCode).emit('room-updated', room);
    
    res.status(200).json({ success: true, message: 'Member removed' });
  } catch (error) {
    console.error('❌ Error in DELETE /:roomCode/members/:userId:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// @route   GET /api/rooms/user/my-rooms
// @desc    Get all rooms for current user
// @access  Private
router.get('/user/my-rooms', protect, async (req, res) => {
  try {
    // Validate user
    if (!req.user || !req.user.id) {
      console.error('❌ /my-rooms: req.user is missing');
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const userId = req.user.id;
    console.log(`🔍 /my-rooms: Fetching rooms for user ${userId}`);

    // Check MongoDB connection
    if (mongoose.connection.readyState !== 1) {
      console.error('❌ MongoDB not connected');
      return res.status(500).json({ success: false, error: 'Database offline' });
    }

    const rooms = await Room.find({
      'members.userId': userId,
      isActive: true
    })
    .sort({ lastActivity: -1 })
    .lean();

    console.log(`📋 /my-rooms: Found ${rooms.length} rooms for user ${userId}`);
    if (rooms.length > 0) {
      console.log('   Room codes:', rooms.map(r => r.roomCode).join(', '));
    }

    res.status(200).json({ success: true, count: rooms.length, data: rooms });
  } catch (error) {
    console.error('❌❌❌ FATAL ERROR in /my-rooms ❌❌❌');
    console.error('Name:', error.name);
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);

    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, error: 'Invalid user ID format' });
    }

    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

module.exports = router;