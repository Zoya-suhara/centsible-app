const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a name'],
    trim: true,
    maxlength: [50, 'Name cannot be more than 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Please add an email'],
    unique: true,
    lowercase: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email'
    ]
  },
  password: {
    type: String,
    required: [true, 'Please add a password'],
    minlength: 6,
    select: false
  },
  currency: {
    type: String,
    default: 'AED',
    enum: ['AED', 'USD', 'EUR', 'GBP', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR']
  },
  monthlyIncome: {
    type: Number,
    default: 0,
    min: 0
  },
  savingsGoal: {
    type: Number,
    default: 0,
    min: 0
  },
  // New fields to match Profile.js
  weeklyBudget: {
    type: Number,
    default: 0,
    min: 0
  },
  theme: {
    type: String,
    enum: ['light', 'dark'],
    default: 'light'
  },
  notifications: {
    type: Boolean,
    default: true
  },
  emailDigest: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'never'],
    default: 'weekly'
  },
  language: {
    type: String,
    default: 'en'
  },
  userType: {
    type: String,
    enum: ['student', 'professional', 'freelancer', 'business', 'retired', 'homemaker', 'unemployed', 'other'],
    default: 'professional'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  // Password reset fields
  resetPasswordToken: {
    type: String,
    default: null
  },
  resetPasswordExpires: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Encrypt password using bcrypt
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Match user entered password to hashed password in database
UserSchema.methods.matchPassword = async function(enteredPassword) {
  try {
    return await bcrypt.compare(enteredPassword, this.password);
  } catch (error) {
    throw new Error('Password comparison failed');
  }
};

// Method to generate and set reset token
UserSchema.methods.generateResetToken = function() {
  const crypto = require('crypto');
  const resetToken = crypto.randomBytes(32).toString('hex');
  this.resetPasswordToken = resetToken;
  this.resetPasswordExpires = Date.now() + 3600000; // 1 hour
  return resetToken;
};

// Method to clear reset token (after password reset)
UserSchema.methods.clearResetToken = function() {
  this.resetPasswordToken = null;
  this.resetPasswordExpires = null;
};

// ========== WISHLIST SCHEMA ==========
const WishlistItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add an item name'],
    trim: true
  },
  estimatedPrice: {
    type: Number,
    required: [true, 'Please add an estimated price'],
    min: 0
  },
  savedAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },
  category: {
    type: String,
    default: 'other'
  },
  targetDate: Date,
  notes: String,
  currency: {
    type: String,
    default: 'AED'
  },
  source: {
    type: String,
    enum: ['manual', 'ai'],
    default: 'manual'
  },
  addedDate: {
    type: Date,
    default: Date.now
  }
});

// Add wishlist array to existing User schema
UserSchema.add({
  wishlist: [WishlistItemSchema]
});

module.exports = mongoose.model('User', UserSchema);