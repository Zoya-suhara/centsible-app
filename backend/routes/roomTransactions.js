const express = require('express');
const router = express.Router({ mergeParams: true });
const Transaction = require('../models/Transaction');
const Room = require('../models/Room');
const { protect } = require('../middleware/auth');

// Helper to get Socket.IO instance
const getIo = (req) => req.app.get('io');

// Middleware: verify user is a room member
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

// Apply auth and membership to all routes
router.use(protect);
router.use(roomMemberCheck);

// -------------------------------------------------------------------
// GET /api/rooms/:roomCode/transactions
// -------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const { type, category, startDate, endDate, settled } = req.query;
    const query = { roomId: req.room._id, isShared: true };

    if (type) query.type = type;
    if (category) query.category = category;
    if (settled !== undefined) query['splits.settled'] = settled === 'true';
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const transactions = await Transaction.find(query)
      .sort({ date: -1 })
      .populate('paidBy', 'name email')
      .populate('splits.user', 'name email');

    res.status(200).json({
      success: true,
      count: transactions.length,
      data: transactions
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// -------------------------------------------------------------------
// POST /api/rooms/:roomCode/transactions
// -------------------------------------------------------------------
router.post('/', async (req, res) => {
  try {
    const { description, amount, type, category, paidBy, splits, date, paymentMethod, notes } = req.body;

    // Basic validation
    if (!description || !amount || !type || !paidBy) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const memberIds = req.room.members.map(m => m.userId.toString());

    // Validate paidBy is a room member
    if (!memberIds.includes(paidBy.toString())) {
      return res.status(400).json({ success: false, error: 'PaidBy user is not a room member' });
    }

    // Conditionally validate splits only for expenses
    if (type === 'expense') {
      if (!splits || !Array.isArray(splits) || splits.length === 0) {
        return res.status(400).json({ success: false, error: 'Splits required for shared expense' });
      }
      const invalidUsers = splits.filter(s => !memberIds.includes(s.user.toString()));
      if (invalidUsers.length > 0) {
        return res.status(400).json({ success: false, error: 'Invalid user(s) in splits' });
      }
    }

    // Build transaction data
    const transactionData = {
      user: req.user.id,
      roomId: req.room._id,
      amount,
      type,
      category: category || 'other',
      description,
      date: date || new Date(),
      paymentMethod: paymentMethod || 'cash',
      paidBy,
      isShared: true,
      notes
    };

    // Only add splits for expenses
    if (type === 'expense') {
      transactionData.splits = splits.map(s => ({
        user: s.user,
        amount: s.amount,
        settled: false
      }));
    }

    const transaction = await Transaction.create(transactionData);

    req.room.lastActivity = new Date();
    await req.room.save();

    await transaction.populate('paidBy', 'name email');
    if (transaction.splits) {
      await transaction.populate('splits.user', 'name email');
    }

    // Emit socket event
    const io = getIo(req);
    io.to(req.params.roomCode).emit('room-transaction-added', transaction);

    res.status(201).json({ success: true, data: transaction });
  } catch (error) {
    console.error('❌ Error creating transaction:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: error.message || 'Server error' });
  }
});

// -------------------------------------------------------------------
// PUT /api/rooms/:roomCode/transactions/:id
// -------------------------------------------------------------------
router.put('/:id', async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction || !transaction.isShared || !transaction.roomId.equals(req.room._id)) {
      return res.status(404).json({ success: false, error: 'Transaction not found' });
    }

    const member = req.room.members.find(m => m.userId.toString() === req.user.id);
    const isAdmin = member && (member.role === 'owner' || member.role === 'admin');
    const isPayer = transaction.paidBy.toString() === req.user.id;

    if (!isAdmin && !isPayer) {
      return res.status(403).json({ success: false, error: 'Not authorized to edit this transaction' });
    }

    const { description, amount, category, date, paymentMethod, splits, settled, notes } = req.body;

    if (description !== undefined) transaction.description = description;
    if (amount !== undefined) transaction.amount = amount;
    if (category !== undefined) transaction.category = category;
    if (date !== undefined) transaction.date = date;
    if (paymentMethod !== undefined) transaction.paymentMethod = paymentMethod;
    if (notes !== undefined) transaction.notes = notes;

    // Only update splits for expenses and if provided
    if (transaction.type === 'expense' && splits && Array.isArray(splits)) {
      const memberIds = req.room.members.map(m => m.userId.toString());
      const invalidUsers = splits.filter(s => !memberIds.includes(s.user.toString()));
      if (invalidUsers.length > 0) {
        return res.status(400).json({ success: false, error: 'Invalid user(s) in splits' });
      }
      transaction.splits = splits.map(s => ({
        user: s.user,
        amount: s.amount,
        settled: s.settled || false
      }));
    }

    if (settled !== undefined) {
      transaction.splits.forEach(s => { s.settled = settled; });
    }

    await transaction.save();
    req.room.lastActivity = new Date();
    await req.room.save();

    await transaction.populate('paidBy', 'name email');
    if (transaction.splits) {
      await transaction.populate('splits.user', 'name email');
    }

    const io = getIo(req);
    io.to(req.params.roomCode).emit('room-transaction-updated', transaction);

    res.status(200).json({ success: true, data: transaction });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// -------------------------------------------------------------------
// DELETE /api/rooms/:roomCode/transactions/:id
// -------------------------------------------------------------------
router.delete('/:id', async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction || !transaction.isShared || !transaction.roomId.equals(req.room._id)) {
      return res.status(404).json({ success: false, error: 'Transaction not found' });
    }

    const member = req.room.members.find(m => m.userId.toString() === req.user.id);
    const isAdmin = member && (member.role === 'owner' || member.role === 'admin');
    const isPayer = transaction.paidBy.toString() === req.user.id;

    if (!isAdmin && !isPayer) {
      return res.status(403).json({ success: false, error: 'Not authorized to delete this transaction' });
    }

    await transaction.deleteOne();

    req.room.lastActivity = new Date();
    await req.room.save();

    const io = getIo(req);
    io.to(req.params.roomCode).emit('room-transaction-deleted', req.params.id);

    res.status(200).json({ success: true, message: 'Transaction deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// -------------------------------------------------------------------
// POST /api/rooms/:roomCode/transactions/settle
// -------------------------------------------------------------------
router.post('/settle', async (req, res) => {
  try {
    const { from, to, amount, method } = req.body;
    if (!from || !to || !amount) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const memberIds = req.room.members.map(m => m.userId.toString());
    if (!memberIds.includes(from) || !memberIds.includes(to)) {
      return res.status(400).json({ success: false, error: 'Invalid user(s)' });
    }

    const settlement = await Transaction.create({
      user: req.user.id,
      roomId: req.room._id,
      amount,
      type: 'expense',
      category: 'other',
      description: `Settlement: ${from} paid ${to}`,
      date: new Date(),
      paymentMethod: method || 'bank_transfer',
      paidBy: from,
      splits: [{
        user: to,
        amount: amount,
        settled: true
      }],
      settlementBetween: { from, to },
      isShared: true
    });

    req.room.lastActivity = new Date();
    await req.room.save();

    await settlement.populate('paidBy', 'name email');
    await settlement.populate('splits.user', 'name email');

    const io = getIo(req);
    io.to(req.params.roomCode).emit('room-transaction-added', settlement);

    res.status(201).json({ success: true, data: settlement });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// -------------------------------------------------------------------
// GET /api/rooms/:roomCode/transactions/balances
// -------------------------------------------------------------------
router.get('/balances', async (req, res) => {
  try {
    const roomId = req.room._id;

    const transactions = await Transaction.find({
      roomId,
      isShared: true,
      type: 'expense',
      'splits.settled': false
    });

    const balances = {};
    req.room.members.forEach(m => { balances[m.userId.toString()] = 0; });

    transactions.forEach(tx => {
      const payerId = tx.paidBy.toString();
      if (balances[payerId] !== undefined) {
        balances[payerId] += tx.amount;
      }
      tx.splits.forEach(split => {
        const userId = split.user.toString();
        if (userId !== payerId && balances[userId] !== undefined) {
          balances[userId] -= split.amount;
        }
      });
    });

    const result = req.room.members.map(m => ({
      userId: m.userId,
      name: m.name,
      balance: balances[m.userId.toString()] || 0
    }));

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;