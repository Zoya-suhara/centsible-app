const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  // ---------- Existing Personal Finance Fields (unchanged) ----------
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true   // Still required for personal transactions
  },
  amount: {
    type: Number,
    required: [true, 'Please add an amount'],
    min: 0.01
  },
  type: {
    type: String,
    required: true,
    enum: ['income', 'expense'],
    default: 'expense'
  },
  category: {
    type: String,
    required: [true, 'Please add a category'],
    enum: [
      'rent', 'groceries', 'transportation', 'utilities', 
      'dining', 'shopping', 'entertainment', 'healthcare',
      'education', 'salary', 'freelance', 'investment',
      'gift', 'travel', 'insurance', 'other','savings','savings_withdrawal'
    ]
  },
  description: {
    type: String,
    required: [true, 'Please add a description'],
    trim: true,
    maxlength: [200, 'Description cannot be more than 200 characters']
  },
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'card', 'bank_transfer', 'digital_wallet', 'other'],
    default: 'cash'
  },
  isRecurring: {
    type: Boolean,
    default: false
  },
  recurringFrequency: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'yearly'],
    required: function() { return this.isRecurring; }
  },
  tags: [{
    type: String,
    trim: true
  }],
  notes: {
    type: String,
    maxlength: [500, 'Notes cannot be more than 500 characters']
  },

  // ---------- NEW: Shared Room Support (all optional) ----------
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    index: true,
    // Not required – only set for shared room transactions
  },
  // For shared expenses: who paid
  paidBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // For shared expenses: how the amount is split among room members
  splits: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    settled: {
      type: Boolean,
      default: false
    }
  }],
  // Quick flag to identify shared transactions
  isShared: {
    type: Boolean,
    default: false
  },
  // For settlement transactions between room members
  settlementBetween: {
    from: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }
}, {
  timestamps: true
});

// Indexes (existing + new)
TransactionSchema.index({ user: 1, date: -1 });
TransactionSchema.index({ user: 1, category: 1 });
TransactionSchema.index({ user: 1, type: 1 });
TransactionSchema.index({ roomId: 1, date: -1 });               // NEW: room queries
TransactionSchema.index({ roomId: 1, 'splits.user': 1 });       // NEW: find user's share in room

module.exports = mongoose.model('Transaction', TransactionSchema);