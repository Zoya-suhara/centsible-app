const mongoose = require('mongoose');

const RoomSchema = new mongoose.Schema({
  roomCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    length: 6
  },
  roomName: {
    type: String,
    required: [true, 'Please add a room name'],
    trim: true,
    maxlength: [100, 'Room name cannot be more than 100 characters']
  },
  roomType: {
    type: String,
    enum: ['roommates', 'trip', 'wedding', 'event', 'business', 'family', 'other'],
    default: 'other'
  },
  currency: {
    type: String,
    default: 'AED'
  },
  members: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    name: {
      type: String,
      required: true
    },
    email: String,
    joinedAt: {
      type: Date,
      default: Date.now
    },
    role: {
      type: String,
      enum: ['owner', 'admin', 'member'],
      default: 'member'
    }
  }],

  // ✨ Room Budgets (collaborative)
  budgets: {
    type: Map,
    of: Number,   // e.g., { "groceries": 500, "rent": 2000, "utilities": 300 }
    default: {}
  },

  // ✨ Shared Wishlist
  wishlist: [{
    name: {
      type: String,
      required: true
    },
    estimatedPrice: {
      type: Number,
      required: true,
      min: 0
    },
    category: {
      type: String,
      enum: ['electronics', 'fashion', 'home', 'vehicle', 'travel', 'education', 'other'],
      default: 'other'
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium'
    },
    targetDate: Date,
    notes: String,
    // Track contributions per member
    contributions: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      amount: Number,
      date: {
        type: Date,
        default: Date.now
      }
    }],
    totalSaved: {
      type: Number,
      default: 0
    },
    isCompleted: {
      type: Boolean,
      default: false
    },
    addedBy: {
      userId: mongoose.Schema.Types.ObjectId,
      name: String
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Room-level settings
  settings: {
    allowMemberInvite: {
      type: Boolean,
      default: true
    },
    requireApprovalForJoin: {
      type: Boolean,
      default: false
    },
    showMemberBalances: {
      type: Boolean,
      default: true
    }
  },

  createdAt: {
    type: Date,
    default: Date.now
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Virtual for total member count
RoomSchema.virtual('memberCount').get(function() {
  return this.members.length;
});

// Generate unique room code
RoomSchema.statics.generateRoomCode = async function() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code;
  let exists = true;
  
  while (exists) {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    exists = await this.findOne({ roomCode: code });
  }
  return code;
};

// Indexes
RoomSchema.index({ roomCode: 1 });
RoomSchema.index({ 'members.userId': 1 });
RoomSchema.index({ lastActivity: -1 });

// Ensure virtuals are included in JSON output
RoomSchema.set('toJSON', { virtuals: true });
RoomSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Room', RoomSchema);