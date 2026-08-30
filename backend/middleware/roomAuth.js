const Room = require('../models/Room');
const { protect } = require('./auth');

/**
 * Middleware to ensure user is authenticated and is a member of the room.
 * Expects roomCode in one of: req.params.roomCode, req.body.roomCode, or req.query.roomCode.
 * Attaches the room document to req.room.
 */
const roomMember = async (req, res, next) => {
  try {
    // First ensure user is authenticated
    await protect(req, res, async () => {
      const roomCode = (req.params.roomCode || req.body.roomCode || req.query.roomCode || '').toUpperCase();
      
      if (!roomCode) {
        return res.status(400).json({ success: false, error: 'Room code is required' });
      }

      const room = await Room.findOne({ roomCode });
      if (!room) {
        return res.status(404).json({ success: false, error: 'Room not found' });
      }

      const isMember = room.members.some(
        member => member.userId.toString() === req.user.id
      );

      if (!isMember) {
        return res.status(403).json({ success: false, error: 'You are not a member of this room' });
      }

      req.room = room;
      next();
    });
  } catch (error) {
    console.error('roomMember middleware error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

/**
 * Middleware to ensure user is a room admin (role 'admin' or 'owner').
 * Must be used after roomMember.
 */
const roomAdmin = (req, res, next) => {
  try {
    if (!req.room) {
      return res.status(500).json({ success: false, error: 'Room not loaded. Use roomMember first.' });
    }

    const member = req.room.members.find(m => m.userId.toString() === req.user.id);
    if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
      return res.status(403).json({ success: false, error: 'Admin privileges required' });
    }

    next();
  } catch (error) {
    console.error('roomAdmin middleware error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

/**
 * Middleware to ensure user is the room owner.
 * Must be used after roomMember.
 */
const roomOwner = (req, res, next) => {
  try {
    if (!req.room) {
      return res.status(500).json({ success: false, error: 'Room not loaded. Use roomMember first.' });
    }

    const member = req.room.members.find(m => m.userId.toString() === req.user.id);
    if (!member || member.role !== 'owner') {
      return res.status(403).json({ success: false, error: 'Only the room owner can perform this action' });
    }

    next();
  } catch (error) {
    console.error('roomOwner middleware error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

module.exports = {
  roomMember,
  roomAdmin,
  roomOwner
};